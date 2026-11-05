import { describe, expect, test } from 'bun:test';

import {
  APPEARANCE_ONLY_COMMIT_MESSAGE,
  CONFIG_PATCH_APPEARANCE_COMMIT_MESSAGE,
  CONFIG_PATCH_COMMIT_MESSAGE,
  GithubConfigError,
  listRepositoryThemes,
  patchAppearanceBlock,
  patchSiteConfig,
  repositoryHasTheme,
} from '../src/repository-config';
import { repositoryDestination } from '../src/repository-naming';
import type { SiteAppearance, ThemeId } from '../src/theme-catalog';

const TOKEN = 'installation-token';
const REPO = 'alice/alice.github.io';
const CLASSIC_DARK: SiteAppearance = { v: 1, themeId: 'classic' as ThemeId, tweaks: { mode: 'dark', accent: 'violet' } };
const CLASSIC_DARK_BLOCK = 'inkdrafts:\n  theme_id: "classic"\n  tweaks:\n    mode: "dark"\n    accent: "violet"';

function encode(content: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(content)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(content: string): string {
  const binary = atob(content);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

/** The template's _config.yml head, as generated repositories start. */
const TEMPLATE_CONFIG = `# Neutral template defaults.
title: "My website"
description: "A Notion-powered Jekyll site."
url: ""
baseurl: ""

author:
  name: ""
  email: ""

# Site appearance. inkdrafts.com rewrites this block when you change themes;
# you can also edit it by hand. Theme ids: _data/themes/. Docs: docs/themes/.
# Quote text values when editing by hand, as in mode: "dark".
inkdrafts:
  theme_id: "classic"
  tweaks: {}

# Build settings
markdown: kramdown
`;

describe('patchAppearanceBlock', () => {
  test('replaces only the block and keeps the comments around it', () => {
    const patched = patchAppearanceBlock(TEMPLATE_CONFIG, CLASSIC_DARK);
    expect(patched.changed).toBe(true);
    expect(patched.content).toBe(TEMPLATE_CONFIG.replace('inkdrafts:\n  theme_id: "classic"\n  tweaks: {}', CLASSIC_DARK_BLOCK));
  });

  test('is idempotent: the canonical block patches to itself', () => {
    const once = patchAppearanceBlock(TEMPLATE_CONFIG, CLASSIC_DARK).content;
    expect(patchAppearanceBlock(once, CLASSIC_DARK)).toEqual({ content: once, changed: false });
    const defaults: SiteAppearance = { v: 1, themeId: 'classic' as ThemeId, tweaks: {} };
    expect(patchAppearanceBlock(TEMPLATE_CONFIG, defaults)).toEqual({ content: TEMPLATE_CONFIG, changed: false });
  });

  test('appends the block after author: when absent, with its comment', () => {
    const withoutBlock = 'title: "x"\nurl: ""\nbaseurl: ""\nauthor:\n  name: "A"\n  email: ""\n\n# Build settings\nmarkdown: kramdown\n';
    const patched = patchAppearanceBlock(withoutBlock, CLASSIC_DARK);
    expect(patched.changed).toBe(true);
    expect(patched.content).toBe(
      'title: "x"\nurl: ""\nbaseurl: ""\nauthor:\n  name: "A"\n  email: ""\n\n' +
      '# Site appearance. inkdrafts.com rewrites this block when you change themes;\n' +
      '# you can also edit it by hand. Theme ids: _data/themes/. Docs: docs/themes/.\n' +
        '# Quote text values when editing by hand, as in mode: "dark".\n' +
      `${CLASSIC_DARK_BLOCK}\n\n# Build settings\nmarkdown: kramdown\n`,
    );
    expect(patchAppearanceBlock(patched.content, CLASSIC_DARK).changed).toBe(false);
  });

  test('appends at the end when there is no author: block', () => {
    const patched = patchAppearanceBlock('title: "x"\nurl: ""', CLASSIC_DARK);
    expect(patched.content.startsWith('title: "x"\nurl: ""\n\n# Site appearance.')).toBe(true);
    expect(patched.content.endsWith(`${CLASSIC_DARK_BLOCK}\n`)).toBe(true);
  });

  test('two blocks are ambiguous and refused', () => {
    expect(() => patchAppearanceBlock(`${TEMPLATE_CONFIG}inkdrafts:\n  theme_id: "quire"\n`, CLASSIC_DARK))
      .toThrow(GithubConfigError);
  });

  test('keeps CRLF line endings and a hand-edited block is rewritten canonically', () => {
    const crlf = 'url: ""\r\nbaseurl: ""\r\ninkdrafts:\r\n  theme_id: classic # mine\r\n  tweaks:\r\n    mode: dark\r\nmarkdown: kramdown\r\n';
    const patched = patchAppearanceBlock(crlf, CLASSIC_DARK);
    expect(patched.content).toBe(`url: ""\r\nbaseurl: ""\r\n${CLASSIC_DARK_BLOCK.replaceAll('\n', '\r\n')}\r\nmarkdown: kramdown\r\n`);
  });

  test('never touches url, baseurl, title or the author block', () => {
    const patched = patchAppearanceBlock(TEMPLATE_CONFIG, CLASSIC_DARK).content;
    const unrelated = (text: string) => text.split('\n').filter((line) => /^(title|url|baseurl|author|  name|  email):/u.test(line));
    expect(unrelated(patched)).toEqual(unrelated(TEMPLATE_CONFIG));
  });
});

interface Recorded {
  method: string;
  url: string;
  body: { message: string; content: string; sha: string; branch: string } | null;
}

function scriptedFetcher(responses: Array<(request: Request) => Response | Promise<Response>>) {
  const requests: Recorded[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push({ method: request.method, url: request.url, body: request.method === 'PUT' ? await request.clone().json() as Recorded['body'] : null });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request ${request.method} ${request.url}`);
    return next(request);
  };
  return { fetcher: fetcher as typeof fetch, requests };
}

const file = (content: string, sha: string) => () => Response.json({ type: 'file', encoding: 'base64', content: encode(content), sha });
const written = () => Response.json({ content: { sha: 'new-sha' }, commit: { sha: 'commit-sha' } });

describe('patchSiteConfig', () => {
  test('url/baseurl and appearance go out in one commit with the combined message', async () => {
    const { fetcher, requests } = scriptedFetcher([file(TEMPLATE_CONFIG, 'sha-1'), written]);
    const destination = repositoryDestination('Alice', 'alice-inkdrafts');
    const result = await patchSiteConfig(TOKEN, REPO, { destination, appearance: CLASSIC_DARK }, { fetcher });
    expect(result).toEqual({ changed: true, contentSha: 'new-sha', commitSha: 'commit-sha' });
    expect(requests.map((request) => request.method)).toEqual(['GET', 'PUT']);
    const put = requests[1].body!;
    expect(put.message).toBe(CONFIG_PATCH_APPEARANCE_COMMIT_MESSAGE);
    const content = decode(put.content);
    expect(content).toContain('url: "https://alice.github.io/alice-inkdrafts"');
    expect(content).toContain('baseurl: "/alice-inkdrafts"');
    expect(content).toContain(CLASSIC_DARK_BLOCK);
  });

  test('without an appearance the existing message and content are unchanged', async () => {
    const { fetcher, requests } = scriptedFetcher([file(TEMPLATE_CONFIG, 'sha-1'), written]);
    await patchSiteConfig(TOKEN, REPO, { destination: repositoryDestination('Alice', 'alice.github.io') }, { fetcher });
    expect(requests[1].body!.message).toBe(CONFIG_PATCH_COMMIT_MESSAGE);
    expect(decode(requests[1].body!.content)).toContain('inkdrafts:\n  theme_id: "classic"\n  tweaks: {}');
  });

  test('an appearance-only patch keeps url/baseurl and uses its own message', async () => {
    const { fetcher, requests } = scriptedFetcher([file(TEMPLATE_CONFIG, 'sha-1'), written]);
    await patchSiteConfig(TOKEN, REPO, { appearance: CLASSIC_DARK }, { fetcher });
    expect(requests[1].body!.message).toBe(APPEARANCE_ONLY_COMMIT_MESSAGE);
    expect(decode(requests[1].body!.content)).toContain('url: ""\nbaseurl: ""\n');
  });

  test('an unchanged result makes no commit', async () => {
    const already = TEMPLATE_CONFIG.replace('inkdrafts:\n  theme_id: "classic"\n  tweaks: {}', CLASSIC_DARK_BLOCK);
    const { fetcher, requests } = scriptedFetcher([file(already, 'sha-1')]);
    expect(await patchSiteConfig(TOKEN, REPO, { appearance: CLASSIC_DARK }, { fetcher }))
      .toEqual({ changed: false, contentSha: 'sha-1', commitSha: null });
    expect(requests.map((request) => request.method)).toEqual(['GET']);
  });

  test('a 409 rereads the newer file (a sync commit) and reapplies onto it', async () => {
    const synced = TEMPLATE_CONFIG.replace('title: "My website"', 'title: "Alice Writes"');
    const { fetcher, requests } = scriptedFetcher([
      file(TEMPLATE_CONFIG, 'sha-1'),
      () => new Response('{}', { status: 409 }),
      file(synced, 'sha-2'),
      written,
    ]);
    const result = await patchSiteConfig(TOKEN, REPO, { appearance: CLASSIC_DARK }, { fetcher });
    expect(result.changed).toBe(true);
    const second = requests[3].body!;
    expect(second.sha).toBe('sha-2');
    expect(decode(second.content)).toContain('title: "Alice Writes"');
    expect(decode(second.content)).toContain(CLASSIC_DARK_BLOCK);
  });
});

describe('repository theme lookups', () => {
  test('listRepositoryThemes returns manifest ids, or null when the directory is absent', async () => {
    const listing = () => Response.json([
      { type: 'file', name: 'classic.json' },
      { type: 'file', name: 'quire.json' },
      { type: 'file', name: 'README.md' },
      { type: 'dir', name: 'nested' },
      { type: 'file', name: 'Bad.json' },
    ]);
    const present = scriptedFetcher([listing]);
    expect(await listRepositoryThemes(TOKEN, REPO, present.fetcher)).toEqual(['classic', 'quire']);
    expect(present.requests[0].url).toBe('https://api.github.com/repos/alice/alice.github.io/contents/_data/themes?ref=main');

    const absent = scriptedFetcher([() => new Response('{}', { status: 404 })]);
    expect(await listRepositoryThemes(TOKEN, REPO, absent.fetcher)).toBeNull();
  });

  test('repositoryHasTheme reads one manifest path and maps failures to config errors', async () => {
    const yes = scriptedFetcher([() => Response.json({ type: 'file' })]);
    expect(await repositoryHasTheme(TOKEN, REPO, 'quire', yes.fetcher)).toBe(true);
    expect(yes.requests[0].url).toBe('https://api.github.com/repos/alice/alice.github.io/contents/_data/themes/quire.json?ref=main');

    const no = scriptedFetcher([() => new Response('{}', { status: 404 })]);
    expect(await repositoryHasTheme(TOKEN, REPO, 'quire', no.fetcher)).toBe(false);

    const limited = scriptedFetcher([() => new Response('{}', { status: 429, headers: { 'retry-after': '30' } })]);
    await expect(repositoryHasTheme(TOKEN, REPO, 'quire', limited.fetcher)).rejects.toMatchObject({ code: 'github_config_rate_limited', retryAfterSeconds: 30 });

    const malformed = scriptedFetcher([]);
    expect(await repositoryHasTheme(TOKEN, REPO, '../x', malformed.fetcher)).toBe(false);
    expect(malformed.requests).toEqual([]);
  });
});
