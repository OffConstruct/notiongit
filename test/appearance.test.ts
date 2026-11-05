import { describe, expect, test } from 'bun:test';

import {
  admitAppearanceSave,
  appearanceRateKey,
  appearanceTokenValid,
  APPEARANCE_SAVES_PER_WINDOW,
  signAppearanceToken,
} from '../src/appearance';
import { GENERATED_REPOSITORY_DESCRIPTION, route, type Env } from '../src/index';
import { APPEARANCE_ONLY_COMMIT_MESSAGE } from '../src/repository-config';
import {
  signRerunToken,
  signStatusSession,
  signStatusState,
  statusStatePayload,
  STATUS_SESSION_COOKIE,
  STATUS_STATE_COOKIE,
  verifyStatusState,
  type StatusSession,
} from '../src/status';
import { PROVISIONING_CONTROL_KEY } from '../src/provisioning-throttle';
import { THEMES } from '../src/theme-catalog';

class MemoryKV {
  values = new Map<string, string>();
  puts = 0;

  async get<T>(key: string, type?: string): Promise<T | string | null> {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === 'json' ? JSON.parse(value) as T : value;
  }

  async put(key: string, value: string): Promise<void> {
    this.puts += 1;
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

let throwawayPrivateKey: Promise<string> | undefined;
function privateKey(): Promise<string> {
  throwawayPrivateKey ??= (async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    let base64 = '';
    for (const byte of der) base64 += String.fromCharCode(byte);
    return `-----BEGIN PRIVATE KEY-----\n${btoa(base64)}\n-----END PRIVATE KEY-----`;
  })();
  return throwawayPrivateKey;
}

const SECRET = 'client-secret';
const VIEWER: StatusSession = { v: 1, accountId: 42, login: 'alice', installationId: 987654, exp: Math.floor(Date.now() / 1000) + 3600 };
/** Any catalog theme other than classic; the catalog grows independently. */
const OTHER = THEMES.find((theme) => theme.id !== 'classic')!;

async function environment(kv: MemoryKV): Promise<Partial<Env>> {
  return {
    JOBS: kv as unknown as KVNamespace,
    GITHUB_APP_ID: '4798518',
    GITHUB_APP_PRIVATE_KEY: await privateKey(),
    GITHUB_CLIENT_ID: 'client-id',
    GITHUB_CLIENT_SECRET: SECRET,
  };
}

async function cookie(session = VIEWER): Promise<string> {
  return `${STATUS_SESSION_COOKIE}=${encodeURIComponent(await signStatusSession(session, SECRET))}`;
}

function encode(content: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(content)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(content: string): string {
  const binary = atob(content);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

const CONFIG = `title: "Alice"
url: "https://alice.github.io"
baseurl: ""

author:
  name: "Alice"

# Site appearance. inkdrafts.com rewrites this block when you change themes;
# you can also edit it by hand. Theme ids: _data/themes/. Docs: docs/themes/.
# Quote text values when editing by hand, as in mode: "dark".
inkdrafts:
  theme_id: "classic"
  tweaks:
    mode: "dark"

markdown: kramdown
`;

interface FakeSite {
  config: string;
  /** null: no _data/themes directory. */
  themes: string[] | null;
  /** Status codes to answer PUTs with before succeeding. */
  putFailures?: number[];
}

interface Recorded {
  method: string;
  url: string;
  body: string;
}

/** One InkDrafts site on GitHub, as the App installation sees it. */
function githubFor(site: FakeSite) {
  const requests: Recorded[] = [];
  const failures = [...(site.putFailures ?? [])];
  let sha = 1;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const body = request.method === 'GET' ? '' : await request.text();
    requests.push({ method: request.method, url: request.url, body });
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
    if (url === 'https://api.github.com/repos/alice/alice.github.io/contents/_data/themes?ref=main') {
      return site.themes === null
        ? new Response('{}', { status: 404 })
        : Response.json(site.themes.map((id) => ({ type: 'file', name: `${id}.json` })));
    }
    if (url.startsWith('https://api.github.com/repos/alice/alice.github.io/contents/_config.yml')) {
      if (request.method === 'PUT') {
        const failure = failures.shift();
        if (failure !== undefined) return new Response('{}', { status: failure });
        site.config = decode((JSON.parse(body) as { content: string }).content);
        sha += 1;
        return Response.json({ content: { sha: `sha-${sha}` }, commit: { sha: `commit-${sha}` } });
      }
      return Response.json({ type: 'file', encoding: 'base64', content: encode(site.config), sha: `sha-${sha}` });
    }
    throw new Error(`unexpected request ${request.method} ${url}`);
  };
  return { fetcher: fetcher as typeof fetch, requests, puts: () => requests.filter((request) => request.method === 'PUT') };
}

async function withGithub<T>(site: FakeSite, run: (github: ReturnType<typeof githubFor>) => Promise<T>): Promise<T> {
  const github = githubFor(site);
  const original = globalThis.fetch;
  globalThis.fetch = github.fetcher;
  try {
    return await run(github);
  } finally {
    globalThis.fetch = original;
  }
}

async function save(env: Partial<Env>, fields: Record<string, string>, headers: Record<string, string> = {}): Promise<Response> {
  return route(new Request('https://example.com/status/appearance', {
    method: 'POST',
    headers: { Origin: 'https://example.com', Cookie: await cookie(), ...headers },
    body: new URLSearchParams(fields),
  }), env);
}

async function token(): Promise<string> {
  return signAppearanceToken(VIEWER, SECRET);
}

describe('GET /status/appearance', () => {
  test('without a session it starts the status sign-in and comes back here', async () => {
    const env = await environment(new MemoryKV());
    const response = await route(new Request('https://example.com/status/appearance'), env);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://example.com/status?connect=1&next=appearance');

    const authorize = await route(new Request('https://example.com/status?connect=1&next=appearance'), env);
    const state = new URL(authorize.headers.get('location')!).searchParams.get('state')!;
    expect((await verifyStatusState(state, SECRET, Math.floor(Date.now() / 1000)))?.next).toBe('appearance');
    const ignored = await route(new Request('https://example.com/status?connect=1&next=https://evil.example'), env);
    const plainState = new URL(ignored.headers.get('location')!).searchParams.get('state')!;
    expect((await verifyStatusState(plainState, SECRET, Math.floor(Date.now() / 1000)))?.next).toBeUndefined();
  });

  test('the status callback honors next=appearance', async () => {
    const env = await environment(new MemoryKV());
    const payload = statusStatePayload(Math.floor(Date.now() / 1000), 'appearance');
    const state = await signStatusState(payload, SECRET);
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'user-token', token_type: 'bearer' });
      if (url === 'https://api.github.com/user') return Response.json({ id: 42, login: 'alice', type: 'User' });
      if (url.startsWith('https://api.github.com/user/installations')) {
        return Response.json({ installations: [{ id: 987654, app_id: 4798518, account: { id: 42, login: 'alice', type: 'User' }, suspended_at: null, suspended_by: null }] });
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;
    try {
      const response = await route(new Request(`https://example.com/auth/github/callback?state=${encodeURIComponent(state)}&code=c`, {
        headers: { Cookie: `${STATUS_STATE_COOKIE}=${payload.nonce}` },
      }), env);
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('https://example.com/status/appearance');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('renders the current look, the offered themes and a session-bound form', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: CONFIG, themes: ['classic'] }, async () => {
      const response = await route(new Request('https://example.com/status/appearance', { headers: { Cookie: await cookie() } }), env);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-security-policy')).toContain("frame-src 'self'");
      const text = await response.text();
      expect(text).toContain('Your site uses the <strong>Classic</strong> design.');
      expect(text).toContain('src="/preview/classic/?t_mode=dark"');
      expect(text).toMatch(/name="t_mode" value="dark" checked>/u);
      // The switcher sits above the editor; Save comes after the options and names the design.
      expect(text.indexOf('id="theme-switch"')).toBeLessThan(text.indexOf('data-customizer'));
      expect(text.indexOf('options</legend>')).toBeLessThan(text.indexOf('>Save and publish Classic</button>'));
      // Nothing is unsaved yet.
      expect(text).toContain('<p class="unsaved" data-unsaved-cue hidden>Unsaved changes</p>');
      expect(text).toContain('<a href="/status">&larr; Back to your dashboard</a>');
      // The settings-file talk waits behind Advanced.
      const advanced = text.indexOf('<summary>Advanced: edit the settings file by hand</summary>');
      expect(advanced).toBeGreaterThan(-1);
      expect(text.indexOf('_config.yml')).toBeGreaterThan(advanced);
      expect(text).toContain('href="https://github.com/alice/alice.github.io/edit/main/_config.yml"');
      expect(text).toContain('href="/status/appearance?theme=classic"');
      expect(text).not.toContain(`href="/status/appearance?theme=${OTHER.id}"`);
      const formToken = text.match(/name="token" value="([^"]+)"/u)![1];
      expect(await appearanceTokenValid(formToken, VIEWER, SECRET, Math.floor(Date.now() / 1000))).toBe(true);
    });
  });

  test('switching to another theme previews it with the tweaks that carry over', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: CONFIG, themes: ['classic', OTHER.id] }, async () => {
      // The switcher sends only the theme; the carried tweaks become the canonical query.
      const switched = await route(new Request(`https://example.com/status/appearance?theme=${OTHER.id}`, { headers: { Cookie: await cookie() } }), env);
      expect(switched.status).toBe(303);
      expect(switched.headers.get('location')).toBe(`https://example.com/status/appearance?theme=${OTHER.id}&t_mode=dark`);
      const response = await route(new Request(switched.headers.get('location')!, { headers: { Cookie: await cookie() } }), env);
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(text).toContain(`src="/preview/${OTHER.id}/?t_mode=dark"`);
      expect(text).toContain('Nothing changes on your site until you save.');
      expect(text).toContain('<p class="unsaved" data-unsaved-cue>Unsaved changes</p>');
      expect(text).toContain(`>Save and publish ${OTHER.name}</button>`);
      expect(text).toContain('<a href="/status/appearance" data-unsaved-cue>Undo</a>');
    });
  });

  test('a theme the repository does not have is a 400 with an explanation', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: CONFIG, themes: ['classic'] }, async () => {
      const response = await route(new Request(`https://example.com/status/appearance?theme=${OTHER.id}`, { headers: { Cookie: await cookie() } }), env);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain('That theme is not in your site');
    });
  });

  test('a site generated before themes says so and offers no picker', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: 'url: ""\nbaseurl: ""\n', themes: null }, async () => {
      const response = await route(new Request('https://example.com/status/appearance', { headers: { Cookie: await cookie() } }), env);
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(text).toContain('set up before InkDrafts had themes');
      expect(text).not.toContain('<form');
    });
  });

  test('a repository without classic opens on its first offered theme instead of failing', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: CONFIG.replace('"classic"', '"no-such-theme"'), themes: [OTHER.id] }, async () => {
      const response = await route(new Request('https://example.com/status/appearance', { headers: { Cookie: await cookie() } }), env);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`<input type="hidden" name="theme" value="${OTHER.id}">`);
    });
  });

  test('a themes directory with no known manifest is treated as predating themes', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: CONFIG, themes: ['not-in-catalog'] }, async () => {
      const response = await route(new Request('https://example.com/status/appearance', { headers: { Cookie: await cookie() } }), env);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('set up before InkDrafts had themes');
    });
  });
});

describe('POST /status/appearance', () => {
  test('a Save from a real browser (Origin: null, same-origin fetch) is accepted; a cross-site one is not', async () => {
    const kv = new MemoryKV();
    const env = await environment(kv);
    await withGithub({ config: CONFIG, themes: ['classic'] }, async (github) => {
      const fields = { token: await token(), theme: 'classic', t_mode: 'light' };
      const browser = await save(env, fields, { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' });
      expect(browser.status).toBe(303);
      expect(browser.headers.get('location')).toBe('https://example.com/status/appearance?saved=1');
      expect(github.puts()).toHaveLength(1);
      expect((await save(env, fields, { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
      expect(github.puts()).toHaveLength(1);
    });
  });

  test('the page asks the browser to send its origin with the form', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: CONFIG, themes: ['classic'] }, async () => {
      const response = await route(new Request('https://example.com/status/appearance', { headers: { Cookie: await cookie() } }), env);
      expect(response.headers.get('referrer-policy')).toBe('same-origin');
    });
  });

  test('gates refuse in order: origin, session, form token (a rerun token is not enough)', async () => {
    const kv = new MemoryKV();
    const env = await environment(kv);
    await withGithub({ config: CONFIG, themes: ['classic'] }, async (github) => {
      const fields = { token: await token(), theme: 'classic', t_mode: 'light' };
      expect((await save(env, fields, { Origin: 'https://evil.example' })).status).toBe(403);

      // An expired session signs in again and comes back to the same choice.
      const signedOut = await route(new Request('https://example.com/status/appearance', { method: 'POST', body: new URLSearchParams(fields) }), env);
      expect(signedOut.status).toBe(303);
      expect(signedOut.headers.get('location')).toBe('https://example.com/status?connect=1&next=appearance&back=theme%3Dclassic%26t_mode%3Dlight');

      expect((await save(env, { ...fields, token: 'forged' })).status).toBe(403);
      expect((await save(env, { ...fields, token: await signRerunToken(VIEWER, SECRET) })).status).toBe(403);
      const otherAccount = await signAppearanceToken({ ...VIEWER, accountId: 43 }, SECRET);
      expect((await save(env, { ...fields, token: otherAccount })).status).toBe(403);

      expect(github.requests).toEqual([]);
      expect(kv.puts).toBe(0);
    });
  });

  test('the operator kill switch refuses with 503 before any GitHub call', async () => {
    const kv = new MemoryKV();
    kv.values.set(PROVISIONING_CONTROL_KEY, JSON.stringify({
      version: 1, mode: 'kill', pausedStages: [], rejectedStages: [], updatedAt: Date.now(), expiresAt: null,
    }));
    const env = await environment(kv);
    await withGithub({ config: CONFIG, themes: ['classic'] }, async (github) => {
      const response = await save(env, { token: await token(), theme: 'classic', t_mode: 'light' });
      expect(response.status).toBe(503);
      expect(await response.text()).toContain('Appearance changes are paused');
      expect(github.requests).toEqual([]);
      expect(kv.values.has(appearanceRateKey(42))).toBe(false);
    });
  });

  test('pausing only the status_appearance stage stops saves the same way', async () => {
    const env = { ...await environment(new MemoryKV()), PROVISIONING_PAUSED_STAGES: 'status_appearance' };
    await withGithub({ config: CONFIG, themes: ['classic'] }, async (github) => {
      expect((await save(env, { token: await token(), theme: 'classic', t_mode: 'light' })).status).toBe(503);
      expect(github.requests).toEqual([]);
    });
  });

  test('a request burst is refused with 429 before any GitHub call, even for unchanged saves', async () => {
    const env = { ...await environment(new MemoryKV()), PROVISIONING_REQUEST_BURST_LIMIT: '2' };
    await withGithub({ config: CONFIG, themes: ['classic'] }, async (github) => {
      const fields = { token: await token(), theme: 'classic', t_mode: 'dark', t_webfonts: 'on', t_accent: 'blue' };
      for (let attempt = 0; attempt < 2; attempt += 1) expect((await save(env, fields)).status).toBe(303);
      const before = github.requests.length;
      const refused = await save(env, fields);
      expect(refused.status).toBe(429);
      expect(github.requests.length).toBe(before);
    });
  });

  test('a save commits only the inkdrafts block and redirects to the saved notice', async () => {
    const kv = new MemoryKV();
    const env = await environment(kv);
    const site: FakeSite = { config: CONFIG, themes: ['classic'] };
    await withGithub(site, async (github) => {
      const response = await save(env, { token: await token(), theme: 'classic', t_mode: 'light', t_accent: 'green', t_webfonts: 'off' });
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('https://example.com/status/appearance?saved=1');
      const puts = github.puts();
      expect(puts).toHaveLength(1);
      expect(JSON.parse(puts[0].body).message).toBe(APPEARANCE_ONLY_COMMIT_MESSAGE);
      expect(site.config).toBe(CONFIG.replace(
        'tweaks:\n    mode: "dark"',
        'tweaks:\n    mode: "light"\n    accent: "green"\n    webfonts: false',
      ));
      expect(JSON.parse(kv.values.get(appearanceRateKey(42))!)).toMatchObject({ count: 1 });
    });

    await withGithub({ config: CONFIG, themes: ['classic'] }, async () => {
      const saved = await route(new Request('https://example.com/status/appearance?saved=1', { headers: { Cookie: await cookie() } }), env);
      expect(await saved.text()).toContain('Saved. Your site updates with the new look in about a minute.');
    });
  });

  test('an unchanged save makes no commit and spends no quota', async () => {
    const kv = new MemoryKV();
    const env = await environment(kv);
    await withGithub({ config: CONFIG, themes: ['classic'] }, async (github) => {
      const response = await save(env, { token: await token(), theme: 'classic', t_mode: 'dark', t_webfonts: 'on', t_accent: 'blue' });
      expect(response.headers.get('location')).toBe('https://example.com/status/appearance?saved=unchanged');
      expect(github.puts()).toHaveLength(0);
      expect(kv.values.has(appearanceRateKey(42))).toBe(false);
    });
  });

  test('a config without the block gets it appended', async () => {
    const env = await environment(new MemoryKV());
    const site: FakeSite = { config: 'title: "Alice"\nurl: "https://alice.github.io"\nbaseurl: ""\nauthor:\n  name: "Alice"\n', themes: ['classic'] };
    await withGithub(site, async () => {
      expect((await save(env, { token: await token(), theme: 'classic', t_mode: 'dark' })).status).toBe(303);
      expect(site.config).toBe(
        'title: "Alice"\nurl: "https://alice.github.io"\nbaseurl: ""\nauthor:\n  name: "Alice"\n\n' +
        '# Site appearance. inkdrafts.com rewrites this block when you change themes;\n' +
        '# you can also edit it by hand. Theme ids: _data/themes/. Docs: docs/themes/.\n' +
        '# Quote text values when editing by hand, as in mode: "dark".\n' +
        'inkdrafts:\n  theme_id: "classic"\n  tweaks:\n    mode: "dark"\n',
      );
    });
  });

  test('a concurrent sync commit (409) is retried onto the newer file', async () => {
    const env = await environment(new MemoryKV());
    const site: FakeSite = { config: CONFIG, themes: ['classic'], putFailures: [409] };
    await withGithub(site, async (github) => {
      const response = await save(env, { token: await token(), theme: 'classic', t_mode: 'light' });
      expect(response.headers.get('location')).toBe('https://example.com/status/appearance?saved=1');
      expect(github.puts()).toHaveLength(2);
      expect(site.config).toContain('    mode: "light"');
    });
  });

  test('the hourly window refuses with 429 before any write', async () => {
    const kv = new MemoryKV();
    kv.values.set(appearanceRateKey(42), JSON.stringify({ version: 1, windowStartedAt: Date.now(), count: APPEARANCE_SAVES_PER_WINDOW }));
    const env = await environment(kv);
    await withGithub({ config: CONFIG, themes: ['classic'] }, async (github) => {
      const response = await save(env, { token: await token(), theme: 'classic', t_mode: 'light' });
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).not.toBeNull();
      expect(github.puts()).toHaveLength(0);
    });
  });

  test('a theme missing from the repository is a 400 with an explanation and no write', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: CONFIG, themes: ['classic'] }, async (github) => {
      const response = await save(env, { token: await token(), theme: OTHER.id });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain('That theme is not in your site');
      expect(github.puts()).toHaveLength(0);
    });
  });

  test('an unreadable custom color is refused with the reason, not silently dropped', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: CONFIG, themes: ['classic'] }, async (github) => {
      const response = await save(env, { token: await token(), theme: 'classic', t_accent: 'custom', c_accent: '#f5f5f5' });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain('too light to read');
      expect(github.puts()).toHaveLength(0);
    });
  });

  test('a site that predates themes cannot be written', async () => {
    const env = await environment(new MemoryKV());
    await withGithub({ config: 'url: ""\nbaseurl: ""\n', themes: null }, async (github) => {
      const response = await save(env, { token: await token(), theme: 'classic', t_mode: 'dark' });
      expect(response.status).toBe(400);
      expect(github.puts()).toHaveLength(0);
    });
  });
});

describe('admitAppearanceSave', () => {
  test('admits up to the window cap, then refuses until the window rolls', async () => {
    const kv = new MemoryKV();
    const start = 1_700_000_000_000;
    for (let index = 0; index < APPEARANCE_SAVES_PER_WINDOW; index += 1) {
      expect(await admitAppearanceSave(kv as unknown as KVNamespace, 42, start + index)).toEqual({ admitted: true });
    }
    expect(await admitAppearanceSave(kv as unknown as KVNamespace, 42, start + 60_000)).toMatchObject({ admitted: false, reason: 'window_cap', retryAfterSeconds: 3540 });
    expect(await admitAppearanceSave(kv as unknown as KVNamespace, 42, start + 3_600_000)).toEqual({ admitted: true });
  });

  test('a corrupted record fails closed', async () => {
    const kv = new MemoryKV();
    kv.values.set(appearanceRateKey(42), '{"version":1,"count":"x"}');
    expect(await admitAppearanceSave(kv as unknown as KVNamespace, 42, 0)).toMatchObject({ admitted: false, reason: 'unavailable' });
  });
});
