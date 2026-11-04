import { describe, expect, test } from 'bun:test';

import { PROVISIONING_STEP_HANDLERS, type StepRunnerContext } from '../src/provisioning-steps';
import {
  createProvisioningJob,
  loadProvisioningJob,
  provisioningJobKey,
  type ProvisioningJob,
} from '../src/provisioning-job';
import { CONFIG_PATCH_APPEARANCE_COMMIT_MESSAGE, CONFIG_PATCH_COMMIT_MESSAGE } from '../src/repository-config';
import { Secret } from '../src/secret';
import type { SiteAppearance, ThemeId } from '../src/theme-catalog';

class MemoryKV {
  values = new Map<string, string>();

  async get<T>(key: string, type?: string): Promise<T | string | null> {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === 'json' ? JSON.parse(value) as T : value;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const CLASSIC_DARK: SiteAppearance = { v: 1, themeId: 'classic' as ThemeId, tweaks: { mode: 'dark' } };

function makeJob(appearance: SiteAppearance | null): ProvisioningJob {
  return createProvisioningJob({
    jobId: 'job-1',
    installationId: 123,
    identity: { id: 42, login: 'alice', accountType: 'User' },
    repository: { name: 'alice.github.io', url: 'https://alice.github.io', baseurl: '', kind: 'apex' },
    generatedRepository: {
      id: 1001,
      fullName: 'alice/alice.github.io',
      name: 'alice.github.io',
      htmlUrl: 'https://github.com/alice/alice.github.io',
      defaultBranch: 'main',
      templateFullName: 'OffConstruct/notiongit-template',
      templateHeadSha: null,
      templateHeadTreeSha: null,
      headSha: null,
      headTreeSha: null,
      reused: false,
    },
    appearance,
    now: 5_000,
  });
}

function base64(content: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(content)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(content: string): string {
  const binary = atob(content);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

const TEMPLATE_CONFIG = 'title: "NotionGit"\nurl: ""\nbaseurl: ""\n\nauthor:\n  name: ""\n\ninkdrafts:\n  theme_id: "classic"\n  tweaks: {}\n';

/** A repository with `themes` manifests and a mutable `_config.yml`. */
function repository(themes: string[], initial = TEMPLATE_CONFIG) {
  let config = initial;
  let sha = 1;
  const puts: { message: string; content: string }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const manifest = url.match(/\/contents\/_data\/themes\/([a-z]+)\.json\?ref=main$/u);
    if (manifest) return themes.includes(manifest[1]) ? Response.json({ type: 'file' }) : new Response('{}', { status: 404 });
    if (url.startsWith('https://api.github.com/repos/alice/alice.github.io/contents/_config.yml')) {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { message: string; content: string };
        puts.push(body);
        config = decode(body.content);
        sha += 1;
        return Response.json({ content: { sha: `sha-${sha}` }, commit: { sha: `commit-${sha}` } });
      }
      return Response.json({ type: 'file', encoding: 'base64', content: base64(config), sha: `sha-${sha}` });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { fetcher, puts, config: () => config };
}

function context(fetcher: typeof fetch): StepRunnerContext {
  return {
    jobs: new MemoryKV() as unknown as KVNamespace,
    installationToken: Secret.githubInstallation('installation-token'),
    fetcher,
    sleep: async () => {},
    now: () => 9_000,
  };
}

describe('patch_config with a chosen theme', () => {
  test('writes url/baseurl and the inkdrafts block in one commit, and a retry commits nothing', async () => {
    const repo = repository(['classic', 'quire']);
    const job = makeJob(CLASSIC_DARK);
    expect(await PROVISIONING_STEP_HANDLERS.patch_config(job, context(repo.fetcher))).toEqual({ appearanceSkipped: null });
    expect(repo.puts).toHaveLength(1);
    expect(repo.puts[0].message).toBe(CONFIG_PATCH_APPEARANCE_COMMIT_MESSAGE);
    expect(repo.config()).toContain('url: "https://alice.github.io"');
    expect(repo.config()).toContain('inkdrafts:\n  theme_id: "classic"\n  tweaks:\n    mode: "dark"\n');

    expect(await PROVISIONING_STEP_HANDLERS.patch_config(job, context(repo.fetcher))).toEqual({ appearanceSkipped: null });
    expect(repo.puts).toHaveLength(1);
  });

  test('a theme the repository lacks is skipped: url/baseurl only, recorded, not failed', async () => {
    const repo = repository([]);
    const patch = await PROVISIONING_STEP_HANDLERS.patch_config(makeJob(CLASSIC_DARK), context(repo.fetcher));
    expect(patch).toEqual({ appearanceSkipped: 'theme_unavailable' });
    expect(repo.puts).toHaveLength(1);
    expect(repo.puts[0].message).toBe(CONFIG_PATCH_COMMIT_MESSAGE);
    expect(repo.config()).toContain('inkdrafts:\n  theme_id: "classic"\n  tweaks: {}\n');
  });

  test('a theme that left the catalog is skipped without asking the repository', async () => {
    const repo = repository(['classic']);
    const gone: SiteAppearance = { v: 1, themeId: 'vanished' as ThemeId, tweaks: {} };
    expect(await PROVISIONING_STEP_HANDLERS.patch_config(makeJob(gone), context(repo.fetcher))).toEqual({ appearanceSkipped: 'theme_invalid' });
    expect(repo.config()).toContain('theme_id: "classic"');
  });

  test('tweaks are re-validated against the current catalog before writing', async () => {
    const repo = repository(['classic']);
    const stale: SiteAppearance = { v: 1, themeId: 'classic' as ThemeId, tweaks: { mode: 'dark', removed_key: 'x', accent: 'nope' } };
    await PROVISIONING_STEP_HANDLERS.patch_config(makeJob(stale), context(repo.fetcher));
    expect(repo.config()).toContain('  tweaks:\n    mode: "dark"\n');
    expect(repo.config()).not.toContain('removed_key');
  });

  test('no choice keeps the existing behavior and template default', async () => {
    const repo = repository(['classic']);
    expect(await PROVISIONING_STEP_HANDLERS.patch_config(makeJob(null), context(repo.fetcher))).toEqual({});
    expect(repo.puts[0].message).toBe(CONFIG_PATCH_COMMIT_MESSAGE);
    expect(repo.config()).toContain('theme_id: "classic"\n  tweaks: {}');
  });
});

describe('job records and appearance', () => {
  test('a record written before themes loads with appearance null', async () => {
    const kv = new MemoryKV();
    const job = makeJob(null) as unknown as { data: Record<string, unknown> };
    delete job.data.appearance;
    delete job.data.appearanceSkipped;
    kv.values.set(provisioningJobKey('job-1'), JSON.stringify(job));
    const loaded = await loadProvisioningJob(kv as unknown as KVNamespace, 'job-1');
    expect(loaded?.data.appearance).toBeNull();
    expect(loaded?.data.appearanceSkipped).toBeNull();
  });

  test('a stored appearance survives a save and load', async () => {
    const kv = new MemoryKV();
    kv.values.set(provisioningJobKey('job-1'), JSON.stringify(makeJob(CLASSIC_DARK)));
    expect((await loadProvisioningJob(kv as unknown as KVNamespace, 'job-1'))?.data.appearance).toEqual(CLASSIC_DARK);
  });
});
