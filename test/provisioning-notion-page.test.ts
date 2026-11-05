import { describe, expect, test } from 'bun:test';

import { PROVISIONING_STEP_HANDLERS } from '../src/provisioning-steps';
import { createProvisioningJob, type ProvisioningJob } from '../src/provisioning-job';
import { readNotionPage } from '../src/repository-config';
import { Secret } from '../src/secret';
import { readSiteFacts, rememberSiteFacts } from '../src/status-cache';

const PAGE = 'https://www.notion.so/My-website-0123456789abcdef0123456789abcdef';

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

function job(templateRootUrl: string | null): ProvisioningJob {
  const created = createProvisioningJob({
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
    appearance: null,
    now: 5_000,
  });
  return { ...created, data: { ...created.data, notionLinks: { templateRootUrl, postsUrl: null, pagesUrl: null } } };
}

function repository() {
  let config = 'url: ""\nbaseurl: ""\n\ninkdrafts:\n  theme_id: "classic"\n  tweaks: {}\n';
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { content: string };
      config = new TextDecoder().decode(Uint8Array.from(atob(body.content), (character) => character.charCodeAt(0)));
      return Response.json({ content: { sha: 'sha-2' }, commit: { sha: 'commit-2' } });
    }
    return Response.json({ type: 'file', encoding: 'base64', content: btoa(config), sha: 'sha-1' });
  }) as typeof fetch;
  return { fetcher, config: () => config };
}

describe('patch_config and the Notion page', () => {
  test('writes the page the owner chose in Notion and makes the dashboard read it fresh', async () => {
    const repo = repository();
    const kv = new MemoryKV();
    const jobs = kv as unknown as KVNamespace;
    await rememberSiteFacts(jobs, 1001, { notionConnected: false, themeName: 'Classic', notionPage: null });
    await PROVISIONING_STEP_HANDLERS.patch_config(job(PAGE), {
      jobs,
      installationToken: Secret.githubInstallation('installation-token'),
      fetcher: repo.fetcher,
      sleep: async () => {},
      now: () => 9_000,
    });
    expect(readNotionPage(repo.config())).toBe(PAGE);
    expect(await readSiteFacts(jobs, 1001)).toBeNull();
  });

  test('a job without a Notion page link leaves the block as it was', async () => {
    const repo = repository();
    await PROVISIONING_STEP_HANDLERS.patch_config(job(null), {
      jobs: new MemoryKV() as unknown as KVNamespace,
      installationToken: Secret.githubInstallation('installation-token'),
      fetcher: repo.fetcher,
      sleep: async () => {},
      now: () => 9_000,
    });
    expect(repo.config()).not.toContain('notion_page');
  });
});
