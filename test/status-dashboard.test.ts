import { describe, expect, test } from 'bun:test';

import { signAppearanceToken } from '../src/appearance';
import { GENERATED_REPOSITORY_DESCRIPTION, route, type Env } from '../src/index';
import {
  notionLinksCookie,
  NOTION_LINKS_COOKIE,
  signRerunToken,
  signStatusSession,
  STATUS_SESSION_COOKIE,
  type StatusSession,
} from '../src/status';

const SECRET = 'client-secret';
const PAGE = 'https://www.notion.so/My-website-0123456789abcdef0123456789abcdef';
const VIEWER: StatusSession = { v: 1, accountId: 42, login: 'alice', installationId: 987654, exp: Math.floor(Date.now() / 1000) + 3600 };

class MemoryKV {
  values = new Map<string, string>();
  async get(key: string, type?: string): Promise<unknown> {
    const value = this.values.get(key);
    return value === undefined ? null : type === 'json' ? JSON.parse(value) : value;
  }
  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

let throwawayKey: Promise<string> | undefined;
function privateKey(): Promise<string> {
  throwawayKey ??= (async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    let binary = '';
    for (const byte of der) binary += String.fromCharCode(byte);
    return `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
  })();
  return throwawayKey;
}

async function environment(kv: MemoryKV): Promise<Partial<Env>> {
  return {
    JOBS: kv as unknown as KVNamespace,
    GITHUB_APP_ID: '4798518',
    GITHUB_APP_PRIVATE_KEY: await privateKey(),
    GITHUB_CLIENT_ID: 'client-id',
    GITHUB_CLIENT_SECRET: SECRET,
  };
}

function encode(content: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(content)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** One healthy site whose `_config.yml` names its Notion page. Counts the
 * three slow reads the dashboard may cache. */
function github(config: { text: string }) {
  const slowReads: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = request.url;
    if (url === 'https://api.github.com/app/installations/987654') {
      return Response.json({ account: { id: 42, login: 'alice', type: 'User' }, suspended_at: null, suspended_by: null });
    }
    if (url === 'https://api.github.com/app/installations/987654/access_tokens') return Response.json({ token: 'installation-token' });
    if (url.startsWith('https://api.github.com/installation/repositories')) {
      return Response.json({
        total_count: 1,
        repositories: [{
          id: 1001,
          name: 'alice.github.io',
          full_name: 'alice/alice.github.io',
          html_url: 'https://github.com/alice/alice.github.io',
          default_branch: 'main',
          description: GENERATED_REPOSITORY_DESCRIPTION,
          fork: false,
        }],
      });
    }
    if (url.includes('/actions/secrets?')) {
      slowReads.push('secrets');
      return Response.json({ total_count: 1, secrets: [{ name: 'NOTION_TOKEN' }] });
    }
    if (url.includes('/contents/_data/themes?')) return Response.json([{ type: 'file', name: 'classic.json' }]);
    if (url.includes('/contents/_config.yml')) {
      if (request.method === 'PUT') {
        config.text = new TextDecoder().decode(Uint8Array.from(atob((await request.json() as { content: string }).content), (c) => c.charCodeAt(0)));
        return Response.json({ content: { sha: 'sha-2' }, commit: { sha: 'commit-2' } });
      }
      slowReads.push('config');
      return Response.json({ type: 'file', encoding: 'base64', content: encode(config.text), sha: 'sha-1' });
    }
    if (url.endsWith('/actions/workflows/sync-notion.yml')) {
      slowReads.push('workflow');
      return Response.json({ state: 'active' });
    }
    if (url.includes('/actions/workflows/sync-notion.yml/runs')) {
      return Response.json({ workflow_runs: [{
        id: 555,
        html_url: 'https://github.com/alice/alice.github.io/actions/runs/555',
        status: 'completed',
        conclusion: 'success',
        head_sha: 'head-sha',
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-01T10:05:00Z',
        event: 'schedule',
      }] });
    }
    if (url.includes('/artifacts?')) return Response.json({ artifacts: [] });
    if (url.includes('/pages/builds/latest')) return Response.json({ status: 'built', commit: 'head-sha', url: 'https://api.github.com/x/3' });
    if (url.includes('/dispatches')) return new Response(null, { status: 204 });
    throw new Error(`unexpected ${request.method} ${url}`);
  }) as typeof fetch;
  return { fetcher, slowReads };
}

async function withGithub<T>(config: { text: string }, run: (site: ReturnType<typeof github>) => Promise<T>): Promise<T> {
  const site = github(config);
  const original = globalThis.fetch;
  globalThis.fetch = site.fetcher;
  try {
    return await run(site);
  } finally {
    globalThis.fetch = original;
  }
}

const sessionCookie = async () => `${STATUS_SESSION_COOKIE}=${encodeURIComponent(await signStatusSession(VIEWER, SECRET))}`;

async function dashboard(env: Partial<Env>, extraCookie = ''): Promise<string> {
  const response = await route(new Request('https://example.com/status', { headers: { Cookie: `${await sessionCookie()}${extraCookie}` } }), env);
  expect(response.status).toBe(200);
  return response.text();
}

function configWith(page: string): { text: string } {
  return { text: `url: "https://alice.github.io"\nbaseurl: ""\ninkdrafts:\n  theme_id: "classic"\n  tweaks: {}\n  notion_page: "${page}"\n` };
}

describe('the dashboard on a device that did not finish setup', () => {
  test('links straight to the Notion page named in the site config', async () => {
    await withGithub(configWith(PAGE), async () => {
      const page = await dashboard(await environment(new MemoryKV()));
      expect(page).toContain(`<a class="button primary" href="${PAGE}">Open my page in Notion</a>`);
      expect(page).not.toContain('look in the sidebar for your InkDrafts page');
    });
  });

  test('a config link that is not Notion falls back to plain "Open Notion"', async () => {
    await withGithub(configWith('https://evil.example/phish'), async () => {
      const page = await dashboard(await environment(new MemoryKV()));
      expect(page).not.toContain('evil.example');
      expect(page).toContain('href="https://www.notion.so/">Open Notion</a>');
    });
  });

  test('the setup browser keeps its list links while they belong to the same page', async () => {
    const posts = 'https://www.notion.so/posts-1111';
    const cookie = await notionLinksCookie('alice/alice.github.io', { homeUrl: PAGE, postsUrl: posts, pagesUrl: null }, SECRET);
    const header = `; ${NOTION_LINKS_COOKIE}=${cookie!.split(';')[0].split('=').slice(1).join('=')}`;
    await withGithub(configWith(PAGE), async () => {
      expect(await dashboard(await environment(new MemoryKV()), header)).toContain(`href="${posts}">Write a new post</a>`);
    });
    const moved = 'https://www.notion.so/Another-page-2222';
    await withGithub(configWith(moved), async () => {
      const page = await dashboard(await environment(new MemoryKV()), header);
      expect(page).toContain(`href="${moved}">Open my page in Notion</a>`);
      expect(page).not.toContain(posts);
    });
  });
});

describe('the dashboard remembers slow GitHub reads for a few minutes', () => {
  test('a second view skips them; "Update my site now" and a save make the next view read again', async () => {
    const kv = new MemoryKV();
    const env = await environment(kv);
    const config = configWith(PAGE);
    await withGithub(config, async (site) => {
      await dashboard(env);
      expect(site.slowReads.sort()).toEqual(['config', 'secrets', 'workflow']);
      site.slowReads.length = 0;
      expect(await dashboard(env)).toContain(`href="${PAGE}">Open my page in Notion</a>`);
      expect(site.slowReads).toEqual([]);

      const rerun = await route(new Request('https://example.com/status/rerun', {
        method: 'POST',
        headers: { Origin: 'https://example.com', Cookie: await sessionCookie() },
        body: new URLSearchParams({ token: await signRerunToken(VIEWER, SECRET), action: 'sync' }),
      }), env);
      expect(rerun.headers.get('location')).toBe('https://example.com/status?notice=sync_triggered');
      site.slowReads.length = 0;
      await dashboard(env);
      expect(site.slowReads.sort()).toEqual(['config', 'secrets', 'workflow']);

      const saved = await route(new Request('https://example.com/status/appearance', {
        method: 'POST',
        headers: { Origin: 'https://example.com', Cookie: await sessionCookie() },
        body: new URLSearchParams({ token: await signAppearanceToken(VIEWER, SECRET), theme: 'classic', t_mode: 'dark' }),
      }), env);
      expect(saved.headers.get('location')).toBe('https://example.com/status/appearance?saved=1');
      expect(config.text).toContain(`  notion_page: "${PAGE}"`);
      site.slowReads.length = 0;
      await dashboard(env);
      expect(site.slowReads).toContain('config');
    });
  });
});
