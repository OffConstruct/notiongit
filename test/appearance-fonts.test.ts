import { describe, expect, test } from 'bun:test';

import { signAppearanceToken } from '../src/appearance';
import { GENERATED_REPOSITORY_DESCRIPTION, route, type Env } from '../src/index';
import { signStatusSession, STATUS_SESSION_COOKIE, type StatusSession } from '../src/status';

const SECRET = 'client-secret';
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

async function environment(): Promise<Partial<Env>> {
  return {
    JOBS: new MemoryKV() as unknown as KVNamespace,
    GITHUB_APP_ID: '4798518',
    GITHUB_APP_PRIVATE_KEY: await privateKey(),
    GITHUB_CLIENT_ID: 'client-id',
    GITHUB_CLIENT_SECRET: SECRET,
  };
}

function configFor(themeId: string, tweaks = ''): string {
  return `url: "https://alice.github.io"\nbaseurl: ""\ninkdrafts:\n  theme_id: "${themeId}"\n${tweaks ? `  tweaks:\n${tweaks}` : '  tweaks: {}\n'}`;
}

/** A site offering every design, with a writable `_config.yml`. */
async function withSite<T>(site: { config: string; commits?: number }, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = request.url;
    if (url === 'https://api.github.com/app/installations/987654') {
      return Response.json({ account: { id: 42, login: 'alice', type: 'User' }, suspended_at: null, suspended_by: null });
    }
    if (url === 'https://api.github.com/app/installations/987654/access_tokens') return Response.json({ token: 'installation-token' });
    if (url.startsWith('https://api.github.com/installation/repositories')) {
      return Response.json({ total_count: 1, repositories: [{
        id: 1001, name: 'alice.github.io', full_name: 'alice/alice.github.io', html_url: 'https://github.com/alice/alice.github.io',
        default_branch: 'main', description: GENERATED_REPOSITORY_DESCRIPTION, fork: false,
      }] });
    }
    if (url.includes('/contents/_data/themes?')) {
      return Response.json(['anamorph', 'classic', 'loupe'].map((id) => ({ type: 'file', name: `${id}.json` })));
    }
    if (url.includes('/contents/_config.yml')) {
      if (request.method === 'PUT') {
        site.config = atob((await request.json() as { content: string }).content);
        site.commits = (site.commits ?? 0) + 1;
        return Response.json({ content: { sha: 'sha-2' }, commit: { sha: 'commit-2' } });
      }
      return Response.json({ type: 'file', encoding: 'base64', content: btoa(site.config), sha: 'sha-1' });
    }
    throw new Error(`unexpected ${request.method} ${url}`);
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const cookie = async () => `${STATUS_SESSION_COOKIE}=${encodeURIComponent(await signStatusSession(VIEWER, SECRET))}`;

async function editor(env: Partial<Env>): Promise<string> {
  const response = await route(new Request('https://example.com/status/appearance', { headers: { Cookie: await cookie() } }), env);
  expect(response.status).toBe(200);
  return response.text();
}

async function save(env: Partial<Env>, fields: Record<string, string>): Promise<Response> {
  return route(new Request('https://example.com/status/appearance', {
    method: 'POST',
    headers: { Origin: 'https://example.com', Cookie: await cookie() },
    body: new URLSearchParams({ token: await signAppearanceToken(VIEWER, SECRET), ...fields }),
  }), env);
}

/** The font list's offered values, in order. */
function fontChoices(page: string): string[] {
  return [...page.matchAll(/name="t_font" value="([^"]+)"/gu)].map((match) => match[1]);
}

describe('one font control per design', () => {
  test('a design with a no-download pairing shows only its font list', async () => {
    await withSite({ config: configFor('loupe') }, async () => {
      const page = await editor(await environment());
      expect(page).not.toContain('name="t_webfonts"');
      expect(page).not.toContain('Use the design');
      expect(fontChoices(page)).toEqual(['chivo', 'system']);
    });
  });

  test('a design whose fonts all download gets a "your device\'s fonts" choice instead of the switch', async () => {
    await withSite({ config: configFor('anamorph') }, async () => {
      const page = await editor(await environment());
      expect(page).not.toContain('name="t_webfonts"');
      expect(fontChoices(page)).toEqual(['antonio', 'teko', 'expanded', 'device']);
      expect(page).toMatch(/name="t_font" value="antonio" checked>/u);
    });
  });

  test('a design without a font list keeps its switch', async () => {
    await withSite({ config: configFor('classic') }, async () => {
      expect(await editor(await environment())).toContain('name="t_webfonts"');
    });
  });

  test('choosing the device\'s fonts saves web fonts off, and picking a font turns them back on', async () => {
    const env = await environment();
    const site = { config: configFor('anamorph') };
    await withSite(site, async () => {
      await save(env, { theme: 'anamorph', t_font: 'device' });
      expect(site.config).toContain('  tweaks:\n    webfonts: false\n');
      expect(fontChoices(await editor(env))).toContain('device');
      expect(await editor(env)).toMatch(/name="t_font" value="device" checked>/u);

      await save(env, { theme: 'anamorph', t_font: 'teko' });
      expect(site.config).toContain('  tweaks:\n    font: "teko"\n');
      expect(site.config).not.toContain('webfonts');
    });
  });

  test('saving other options leaves web fonts off and the saved pairing as they were', async () => {
    const env = await environment();
    const site = { config: configFor('anamorph', '    webfonts: false\n    font: "teko"\n'), commits: 0 };
    await withSite(site, async () => {
      const page = await editor(env);
      expect(page).toMatch(/name="t_font" value="device" checked>/u);
      const unchanged = await save(env, { theme: 'anamorph', t_font: 'device' });
      expect(unchanged.headers.get('location')).toBe('https://example.com/status/appearance?saved=unchanged');
      expect(site.commits).toBe(0);
    });
  });

  test('on a design with a no-download pairing, web fonts off shows as that pairing', async () => {
    await withSite({ config: configFor('loupe', '    webfonts: false\n') }, async () => {
      expect(await editor(await environment())).toMatch(/name="t_font" value="system" checked>/u);
    });
  });
});
