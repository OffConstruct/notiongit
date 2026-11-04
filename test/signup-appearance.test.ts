/**
 * The theme choice end to end: `/connect/github?theme=…&t_…` is parsed at the
 * boundary, held in the server-side state record (never in the signed state
 * GitHub sees), copied into the job by the OAuth callback, and written into
 * `_config.yml` by `patch_config`.
 */
import { describe, expect, test } from 'bun:test';

import {
  GENERATED_REPOSITORY_DESCRIPTION,
  loadProvisioningJob,
  route,
  saveProvisioningJob,
  type Env,
  type ProvisioningMessage,
} from '../src/index';
import { PROVISIONING_STEP_HANDLERS } from '../src/provisioning-steps';
import { Secret } from '../src/secret';
import { userCopy } from '../src/failures';

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

  stateRecords(): Record<string, unknown>[] {
    return [...this.values.entries()].filter(([key]) => key.startsWith('github:oauth-state:')).map(([, value]) => JSON.parse(value));
  }
}

class MemoryQueue<T> {
  readonly sent: T[] = [];
  async send(message: T): Promise<void> {
    this.sent.push(message);
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

async function env(kv: MemoryKV): Promise<Partial<Env>> {
  return {
    JOBS: kv as unknown as KVNamespace,
    PROVISIONING_QUEUE: new MemoryQueue<ProvisioningMessage>() as unknown as Queue<ProvisioningMessage>,
    GITHUB_APP_ID: '4798518',
    GITHUB_APP_SLUG: 'inkdrafts',
    GITHUB_APP_PRIVATE_KEY: await privateKey(),
    GITHUB_CLIENT_ID: 'client-id',
    GITHUB_CLIENT_SECRET: 'client-secret',
    NOTION_CLIENT_ID: 'notion-client-id',
    NOTION_CLIENT_SECRET: 'notion-client-secret',
  };
}

/** GitHub's side of the OAuth-on-install callback, through generation. */
async function githubCallbackFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = request.url;
  if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'user-token', token_type: 'bearer' });
  if (url === 'https://api.github.com/user') return Response.json({ id: 42, login: 'alice', type: 'User' });
  if (url === 'https://api.github.com/user/installations') {
    return Response.json({ installations: [{ id: 123, app_id: 4798518, account: { id: 42, login: 'alice', type: 'User' }, suspended_at: null, suspended_by: null }] });
  }
  if (url === 'https://api.github.com/app/installations/123') {
    return Response.json({ id: 123, account: { id: 42, login: 'alice', type: 'User' }, suspended_at: null, suspended_by: null });
  }
  if (url.startsWith('https://api.github.com/user/repos?')) return Response.json([]);
  if (url === 'https://api.github.com/repos/OffConstruct/notiongit-template/commits/main') {
    return Response.json({ sha: 'template-head-sha', commit: { tree: { sha: 'template-tree-sha' } } });
  }
  if (url === 'https://api.github.com/repos/OffConstruct/notiongit-template/generate') {
    const body = await request.json() as { name: string };
    return Response.json({
      id: 1001,
      name: body.name,
      full_name: `alice/${body.name}`,
      html_url: `https://github.com/alice/${body.name}`,
      default_branch: 'main',
      fork: false,
      description: GENERATED_REPOSITORY_DESCRIPTION,
    }, { status: 201 });
  }
  if (/^https:\/\/api\.github\.com\/repos\/alice\/[^/]+$/u.test(url)) return new Response('{}', { status: 404 });
  throw new Error(`unexpected URL: ${url}`);
}

async function withFetch<T>(fetcher: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

async function begin(environment: Partial<Env>, query: string): Promise<Response> {
  return route(new Request(`https://example.com/connect/github?${query}`), environment);
}

function stateOf(response: Response): string {
  expect(response.status).toBe(302);
  return new URL(response.headers.get('location')!).searchParams.get('state')!;
}

async function callback(environment: Partial<Env>, state: string, extra = '&code=one-time-code'): Promise<Response> {
  return withFetch(githubCallbackFetch as typeof fetch, () => route(
    new Request(`https://example.com/auth/github/callback?state=${encodeURIComponent(state)}&installation_id=123&setup_action=install${extra}`),
    environment,
  ));
}

describe('signup with a theme', () => {
  test('the choice crosses the GitHub round trip into the job and patch_config writes it', async () => {
    const kv = new MemoryKV();
    const environment = await env(kv);
    const state = stateOf(await begin(environment, 'job_id=job-1&theme=classic&t_mode=dark&t_accent=violet&t_bogus=1'));

    // Server-side only: the signed state carries no theme.
    expect(atob(state.split('.')[0].replaceAll('-', '+').replaceAll('_', '/'))).not.toContain('classic');
    expect(kv.stateRecords()[0].appearance).toEqual({ v: 1, themeId: 'classic', tweaks: { mode: 'dark', accent: 'violet' } });

    const done = await callback(environment, state);
    expect(done.status).toBe(302);
    expect(done.headers.get('location')).toBe('https://example.com/connect/notion?job_id=job-1');
    const job = await loadProvisioningJob(kv as unknown as KVNamespace, 'job-1');
    expect(job?.data.appearance).toEqual({ v: 1, themeId: 'classic', tweaks: { mode: 'dark', accent: 'violet' } });

    // The Notion leg only re-saves the job with more fields; simulate it.
    await saveProvisioningJob(kv as unknown as KVNamespace, { ...job!, data: { ...job!.data, notionSecretsWrittenAt: 1 } });
    const afterNotion = (await loadProvisioningJob(kv as unknown as KVNamespace, 'job-1'))!;

    const puts: string[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/contents/_data/themes/classic.json?ref=main')) return Response.json({ type: 'file' });
      if (url.includes('/contents/_config.yml')) {
        if (init?.method === 'PUT') {
          puts.push(atob(JSON.parse(String(init.body)).content));
          return Response.json({ content: { sha: 'b' }, commit: { sha: 'c' } });
        }
        const config = 'url: ""\nbaseurl: ""\nauthor:\n  name: ""\ninkdrafts:\n  theme_id: "classic"\n  tweaks: {}\n';
        return Response.json({ type: 'file', encoding: 'base64', content: btoa(config), sha: 'a' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    await PROVISIONING_STEP_HANDLERS.patch_config(afterNotion, {
      jobs: kv as unknown as KVNamespace,
      installationToken: Secret.githubInstallation('installation-token'),
      fetcher,
      sleep: async () => {},
      now: () => 0,
    });
    expect(puts).toHaveLength(1);
    expect(puts[0]).toContain('inkdrafts:\n  theme_id: "classic"\n  tweaks:\n    mode: "dark"\n    accent: "violet"\n');
  });

  test('no theme parameter stores no choice, exactly as before', async () => {
    const kv = new MemoryKV();
    const environment = await env(kv);
    const state = stateOf(await begin(environment, 'job_id=job-2'));
    expect(kv.stateRecords()[0]).not.toHaveProperty('appearance');
    await callback(environment, state);
    expect((await loadProvisioningJob(kv as unknown as KVNamespace, 'job-2'))?.data.appearance).toBeNull();
  });

  test('an unknown theme renders the error page and stores nothing', async () => {
    const kv = new MemoryKV();
    const response = await begin(await env(kv), 'theme=nope&t_mode=dark');
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain('Error code: <code>theme_unknown</code>');
    expect(text).toContain(userCopy('theme_unknown').message);
    expect(text).toContain('href="/themes"');
    expect(kv.puts).toBe(0);
  });

  test('an oversize query is refused before admission', async () => {
    const kv = new MemoryKV();
    const response = await begin(await env(kv), `theme=classic&t_mode=${'x'.repeat(1100)}`);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Error code: <code>theme_request_invalid</code>');
    expect(kv.puts).toBe(0);
  });

  test('the choice survives a setup callback that arrives before the OAuth callback', async () => {
    const kv = new MemoryKV();
    const environment = await env(kv);
    const state = stateOf(await begin(environment, 'job_id=job-3&theme=classic&t_webfonts=false'));
    const setup = await callback(environment, state, '');
    expect(setup.status).toBe(202);
    await callback(environment, state);
    expect((await loadProvisioningJob(kv as unknown as KVNamespace, 'job-3'))?.data.appearance)
      .toEqual({ v: 1, themeId: 'classic', tweaks: { webfonts: false } });
  });

  test('re-entry with the same job_id keeps the earlier choice unless a new theme is given', async () => {
    const kv = new MemoryKV();
    const environment = await env(kv);
    await callback(environment, stateOf(await begin(environment, 'job_id=job-4&theme=classic&t_mode=dark')));
    const job = (await loadProvisioningJob(kv as unknown as KVNamespace, 'job-4'))!;
    // Let the account lease go, as a finished or abandoned attempt would.
    for (const key of [...kv.values.keys()]) if (key.includes('lease')) kv.values.delete(key);
    expect(job.data.appearance?.tweaks).toEqual({ mode: 'dark' });

    await callback(environment, stateOf(await begin(environment, 'job_id=job-4')));
    expect((await loadProvisioningJob(kv as unknown as KVNamespace, 'job-4'))?.data.appearance?.tweaks).toEqual({ mode: 'dark' });
    for (const key of [...kv.values.keys()]) if (key.includes('lease')) kv.values.delete(key);

    await callback(environment, stateOf(await begin(environment, 'job_id=job-4&theme=classic&t_mode=light')));
    expect((await loadProvisioningJob(kv as unknown as KVNamespace, 'job-4'))?.data.appearance?.tweaks).toEqual({ mode: 'light' });
  });
});
