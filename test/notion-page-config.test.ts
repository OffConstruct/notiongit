import { describe, expect, test } from 'bun:test';

import { patchSiteConfig, readNotionPage } from '../src/repository-config';
import type { SiteAppearance, ThemeId } from '../src/theme-catalog';

const PAGE = 'https://www.notion.so/My-website-0123456789abcdef0123456789abcdef';
const BLOCK = 'inkdrafts:\n  theme_id: "classic"\n  tweaks: {}';
const CONFIG = `title: "Alice"\nurl: ""\nbaseurl: ""\n\nauthor:\n  name: ""\n\n${BLOCK}\n\nmarkdown: kramdown\n`;
const DARK: SiteAppearance = { v: 1, themeId: 'classic' as ThemeId, tweaks: { mode: 'dark' } };

function encode(content: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(content)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(content: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(content), (character) => character.charCodeAt(0)));
}

/** One `_config.yml` behind the Contents API. */
function repository(initial: string) {
  const file = { content: initial, commits: 0 };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === 'PUT') {
      file.content = decode((await request.json() as { content: string }).content);
      file.commits += 1;
      return Response.json({ content: { sha: `sha-${file.commits}` }, commit: { sha: `c-${file.commits}` } });
    }
    return Response.json({ type: 'file', encoding: 'base64', content: encode(file.content), sha: `sha-${file.commits}` });
  }) as typeof fetch;
  return { file, fetcher };
}

describe('the Notion page link in _config.yml', () => {
  test('provisioning writes it inside the inkdrafts block, once', async () => {
    const repo = repository(CONFIG);
    await patchSiteConfig('t', 'alice/alice.github.io', { destination: { url: 'https://alice.github.io', baseurl: '' }, notionPage: PAGE }, { fetcher: repo.fetcher });
    expect(repo.file.content).toContain(`${BLOCK}\n  notion_page: "${PAGE}" # Your page in Notion, for the dashboard link\n\nmarkdown`);
    expect(readNotionPage(repo.file.content)).toBe(PAGE);

    const again = await patchSiteConfig('t', 'alice/alice.github.io', { destination: { url: 'https://alice.github.io', baseurl: '' }, notionPage: PAGE }, { fetcher: repo.fetcher });
    expect(again.changed).toBe(false);
    expect(repo.file.commits).toBe(1);
  });

  test('an appearance save rewrites the theme lines and keeps the link', async () => {
    const repo = repository(CONFIG.replace(BLOCK, `${BLOCK}\n  notion_page: "${PAGE}"`));
    await patchSiteConfig('t', 'alice/alice.github.io', { appearance: DARK }, { fetcher: repo.fetcher });
    expect(repo.file.content).toContain(`inkdrafts:\n  theme_id: "classic"\n  tweaks:\n    mode: "dark"\n  notion_page: "${PAGE}"\n`);
    expect(readNotionPage(repo.file.content)).toBe(PAGE);
  });

  test('a reconnect to another page replaces the link and leaves the theme alone', async () => {
    const other = 'https://app.notion.com/p/Our-site-fedcba9876543210fedcba9876543210';
    const handTuned = 'inkdrafts:\n  theme_id: "loupe"   # picked by hand\n  tweaks: {}';
    const repo = repository(CONFIG.replace(BLOCK, `${handTuned}\n  notion_page: "${PAGE}"`));
    await patchSiteConfig('t', 'alice/alice.github.io', { notionPage: other }, { fetcher: repo.fetcher });
    expect(repo.file.content).toContain(`${handTuned}\n  notion_page: "${other}"`);
    expect(readNotionPage(repo.file.content)).toBe(other);
  });

  test('a site without the block gets one holding only the link', async () => {
    const repo = repository('title: "Alice"\nurl: ""\nbaseurl: ""\n');
    await patchSiteConfig('t', 'alice/alice.github.io', { notionPage: PAGE }, { fetcher: repo.fetcher });
    expect(repo.file.content).toEndWith(`inkdrafts:\n  notion_page: "${PAGE}" # Your page in Notion, for the dashboard link\n`);
    expect(readNotionPage(repo.file.content)).toBe(PAGE);
  });

  test('anything that is not an https Notion link is neither written nor read back', async () => {
    const repo = repository(CONFIG);
    for (const bad of ['http://www.notion.so/x', 'https://notion.so.evil.example/x', 'javascript:alert(1)', 'https://user:pw@www.notion.so/x']) {
      await patchSiteConfig('t', 'alice/alice.github.io', { notionPage: bad }, { fetcher: repo.fetcher });
      expect(repo.file.commits).toBe(0);
      expect(readNotionPage(CONFIG.replace(BLOCK, `${BLOCK}\n  notion_page: "${bad}"`))).toBeNull();
    }
    for (const good of [PAGE, 'https://notion.so/x', 'https://alice.notion.site/x', 'https://app.notion.com/p/x']) {
      expect(readNotionPage(CONFIG.replace(BLOCK, `${BLOCK}\n  notion_page: ${good}`))).toBe(good);
    }
  });

  test('a link outside the inkdrafts block is not the owner\'s page', () => {
    expect(readNotionPage(`${CONFIG}notion_page: "${PAGE}"\nother:\n  notion_page: "${PAGE}"\n`)).toBeNull();
  });
});
