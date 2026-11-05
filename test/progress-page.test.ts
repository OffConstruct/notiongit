import { describe, expect, test } from 'bun:test';
import { Script } from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createProvisioningJob, PROVISIONING_STEP_ORDER, type ProvisioningJob } from '../src/provisioning-job';
import type { ProvisioningFailureCode } from '../src/failures';
import { projectProvisioning, type ProgressSnapshot } from '../src/progress';
import {
  progressPage,
  PROGRESS_POLL_INTERVAL_MS,
  PROGRESS_POLL_MAX_INTERVAL_MS,
} from '../src/progress-page';

const NOW = 1_000_000;

function baseJob(): ProvisioningJob {
  return createProvisioningJob({
    jobId: 'job-123',
    installationId: 1,
    identity: { id: 1, login: 'alice', accountType: 'User' },
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
    now: NOW,
  });
}

function snapshotFor(status: ProvisioningJob['status'], mutate: (job: ProvisioningJob) => void = () => {}): ProgressSnapshot {
  const job = baseJob();
  if (status !== 'awaiting_notion') {
    job.data.notionSecretsWrittenAt = NOW + 1;
    job.wait = { reason: 'global_throttled', untilMs: null, updatedAt: NOW };
  }
  mutate(job);
  job.status = status;
  return projectProvisioning(job, NOW + 10);
}

function succeedAll(job: ProvisioningJob): void {
  for (const step of PROVISIONING_STEP_ORDER) {
    job.steps[step] = { ...job.steps[step], status: 'succeeded', attempts: 1 };
  }
}

function failFirst(job: ProvisioningJob, code: ProvisioningFailureCode): void {
  job.steps.verify_repository = {
    ...job.steps.verify_repository,
    status: 'failed',
    attempts: 5,
    lastError: { code, retryable: false },
  };
}

const ACTIVE = snapshotFor('queued');
const AWAITING = snapshotFor('awaiting_notion');
const NOTION_LINKS = {
  pagesUrl: 'https://www.notion.so/alice/Pages-11111111111141118111111111111111',
  postsUrl: 'https://www.notion.so/alice/Posts-22222222222242228222222222222222',
  templateRootUrl: 'https://www.notion.so/alice/My-Site-Home',
};
const SUCCEEDED = snapshotFor('succeeded', succeedAll);
const SUCCEEDED_LINKS = snapshotFor('succeeded', (job) => {
  succeedAll(job);
  job.data.notionLinks = NOTION_LINKS;
});
const SUCCEEDED_PROJECT = snapshotFor('succeeded', (job) => {
  succeedAll(job);
  job.data.notionLinks = NOTION_LINKS;
  job.data.repository = {
    name: 'alice-inkdrafts',
    url: 'https://alice.github.io/alice-inkdrafts',
    baseurl: '/alice-inkdrafts',
    kind: 'project',
  };
  job.data.generatedRepository = {
    ...job.data.generatedRepository,
    fullName: 'alice/alice-inkdrafts',
    name: 'alice-inkdrafts',
    htmlUrl: 'https://github.com/alice/alice-inkdrafts',
  };
});
const FAILED = snapshotFor('dead_letter', (job) => failFirst(job, 'github_rate_limited'));
const MISSING: ProgressSnapshot = projectProvisioning(null, NOW);

describe('progress page', () => {
  test('is a complete document with one landmark structure and one top-level heading', () => {
    for (const snapshot of [ACTIVE, AWAITING, SUCCEEDED, FAILED, MISSING]) {
      const page = progressPage('job-123', snapshot);
      expect(page.startsWith('<!doctype html>')).toBe(true);
      expect(page).toContain('<html lang="en">');
      expect(page).toContain('class="skip-link" href="#main-content"');
      expect(page).toContain('<main id="main-content"');
      expect(page.match(/<h1[ >]/gu)).toHaveLength(1);
      expect(page.match(/role="status" aria-live="polite"/gu)).toHaveLength(1);
    }
  });

  test('renders only the panel for the snapshot’s own status', () => {
    expect(progressPage('job-123', ACTIVE)).toContain('This page updates by itself.');
    expect(progressPage('job-123', ACTIVE)).not.toContain('Connect Notion</a>');
    expect(progressPage('job-123', SUCCEEDED)).toContain('Open your site</a>');
    expect(progressPage('job-123', SUCCEEDED)).not.toContain('Leave this page open');
  });

  test('carries the seven-row checklist with per-row state and text state words', () => {
    const page = progressPage('job-123', ACTIVE);
    expect(page.match(/<li data-stage-id=/gu)).toHaveLength(7);
    expect(page).toContain('data-state="current"');
    expect(page).toContain('<span class="stage-state">In progress</span>');
    expect(progressPage('job-123', FAILED)).toContain('data-state="blocked"');
    // Success collapses the checklist into one line.
    const done = progressPage('job-123', SUCCEEDED);
    expect(done).not.toContain('<li data-stage-id=');
    expect(done).toContain('>All 7 steps done.</p>');
  });

  test('the Notion step is the owner’s turn: button first, later steps folded into one line', () => {
    const page = progressPage('job-123', AWAITING);
    expect(page).toContain('<h1 id="progress-heading">Last step: connect Notion</h1>');
    expect(page).toContain('data-state="your_turn"');
    expect(page).toContain('<span class="stage-state">Your turn</span>');
    expect(page).not.toMatch(/<li[^>]*data-state="current"/u);
    expect(page.indexOf('href="/connect/notion?job_id=job-123"')).toBeLessThan(page.indexOf('<ol class="checklist"'));
    expect(page.match(/<li data-stage-id=/gu)).toHaveLength(3);
    expect(page).toContain('Then 4 more steps run by themselves');
    expect(page).toContain('“Use a template provided by the developer”');
    expect(page).toContain('setup keeps going without you');
    const visible = new JSDOM(page).window.document.querySelector('main')!.textContent!;
    expect(visible).not.toMatch(/repository|secrets|databases/u);
  });

  test('a reconnect asks for the existing page and warns against a new copy', () => {
    const reconnect = snapshotFor('awaiting_notion', (job) => { job.data.notionMode = 'reconnect'; });
    const page = progressPage('job-123', reconnect);
    expect(page).toContain('<h1 id="progress-heading">Reconnect Notion</h1>');
    expect(page).toContain('“Select pages to share”');
    expect(page).toContain('Do not pick the template');
    expect(page).toContain('>Reconnect Notion</a>');
  });

  test('offers a manual refresh to no-JS visitors on non-terminal snapshots only', () => {
    const waiting = snapshotFor('queued', (job) => {
      job.wait = { reason: 'global_throttled', untilMs: NOW + 90_000, updatedAt: NOW };
    });

    for (const snapshot of [ACTIVE, waiting, AWAITING]) {
      const page = progressPage('job-123', snapshot);
      expect(page).toContain('<noscript><p class="small muted">');
      expect(page).toContain('href="/progress?job_id=job-123"');
      expect(page).not.toContain('http-equiv="refresh"');
    }
    for (const snapshot of [SUCCEEDED, FAILED, MISSING]) {
      expect(progressPage('job-123', snapshot)).not.toContain('<noscript');
    }
  });

  test('disables the pulse animation under prefers-reduced-motion', () => {
    const page = progressPage('job-123', ACTIVE);
    expect(page).toContain('@media (prefers-reduced-motion: reduce)');
    expect(page.indexOf('@media (prefers-reduced-motion: reduce)'))
      .toBeGreaterThan(page.indexOf('@keyframes pulse'));
  });

  test('ships exactly one executable inline script and one JSON island, none fetched', () => {
    const page = progressPage('job-123', ACTIVE);
    expect(page.match(/<script>/gu)).toHaveLength(1);
    expect(page.match(/<script type="application\/json" id="progress-data">/gu)).toHaveLength(1);
    expect(page).not.toMatch(/<script[^>]*\ssrc=/u);
    expect(page).not.toMatch(/\ssrc="https?:/u);
    expect(page).toContain(`const POLL_MS = ${PROGRESS_POLL_INTERVAL_MS}`);
    expect(page).toContain(`const POLL_MAX_MS = ${PROGRESS_POLL_MAX_INTERVAL_MS}`);
    expect(page).not.toContain('innerHTML');
    expect(page).not.toContain('document.write');
    const script = page.slice(page.lastIndexOf('<script>') + '<script>'.length).split('</script>')[0];
    expect(() => new Script(script)).not.toThrow();
  });

  test('makes no request outside the origin', () => {
    for (const snapshot of [ACTIVE, AWAITING, SUCCEEDED, FAILED, MISSING]) {
      const page = progressPage('job-123', snapshot);
      // The island may carry the allowlisted site and repository URLs as data;
      // the executable script must not reference any absolute URL at all.
      const script = page.slice(page.lastIndexOf('<script>'));
      expect(script).not.toMatch(/https?:\/\//u);
      expect(page).toContain('data-status-url="/progress/status?job_id=job-123"');
    }
  });

  test('success leads with the site address, then writing in Notion, then the dashboard', () => {
    const page = progressPage('job-123', SUCCEEDED_LINKS);
    expect(page).toContain('<h1 id="progress-heading">Your site is live</h1>');
    expect(page.match(/Your site is live/gu)).toHaveLength(2); // the heading and the tab title, never a subtitle
    expect(page).toContain('<a id="site-link" class="button primary" href="https://alice.github.io">Open your site</a>');
    expect(page).toContain('<span class="site-url">alice.github.io</span>');
    expect(page).toContain('data-copy="https://alice.github.io" hidden>Copy address</button>');
    expect(page).toContain('<h2 id="write-heading">Write your first post</h2>');
    expect(page).toContain('<h2 id="yours-heading">Make it yours</h2>');
    expect(page).toContain('<a class="button" href="/status">Open your dashboard</a>');
    expect(page).toContain('<a class="button" href="/status/appearance">Change how it looks</a>');
    expect(page).toContain('usually within 20 minutes');
    expect(page.indexOf('site-link')).toBeLessThan(page.indexOf('write-heading'));
    expect(page.indexOf('write-heading')).toBeLessThan(page.indexOf('dashboard-heading'));
    // Repository and domain talk waits behind "For later".
    const later = page.slice(page.indexOf('<summary>For later</summary>'));
    expect(later).toContain('href="https://github.com/alice/alice.github.io"');
    expect(later).toContain('custom domain guide');
    expect(page.slice(0, page.indexOf('<summary>For later</summary>'))).not.toMatch(/Jekyll|Actions tab|repository/u);
  });

  test('captured Notion links become the write-in-Notion buttons', () => {
    const page = progressPage('job-123', SUCCEEDED_LINKS);
    expect(page).toContain('<a class="button primary" href="https://www.notion.so/alice/My-Site-Home">Open my page in Notion</a>');
    expect(page).toContain('<a class="button" href="https://www.notion.so/alice/Posts-22222222222242228222222222222222">Write a new post</a>');
    expect(page).toContain('<a class="button" href="https://www.notion.so/alice/Pages-11111111111141118111111111111111">Edit my pages</a>');
  });

  test('without captured links the card still has a working button and says where to look', () => {
    const page = progressPage('job-123', SUCCEEDED);
    expect(page).toContain('<a class="button primary" href="https://www.notion.so/">Open Notion</a>');
    expect(page).toContain('It starts out named “InkDrafts starter site”.');
    expect(page).not.toContain('href=""');
  });

  test('pins the exact live URL for both the apex and the project destination', () => {
    const project = progressPage('job-123', SUCCEEDED_PROJECT);
    expect(project).toContain('<a id="site-link" class="button primary" href="https://alice.github.io/alice-inkdrafts">Open your site</a>');
    expect(project).toContain('href="https://github.com/alice/alice-inkdrafts"');
  });

  test('a stopped setup says it once and ends in Try again and Get help', () => {
    const page = progressPage('job-123', FAILED);
    expect(page).toContain('GitHub is temporarily limiting requests while we set up your site.');
    expect(page).toContain('We tried several times and stopped.');
    expect(page).not.toContain('keep trying');
    expect(page).toContain('<form method="post" action="/progress/retry"><input type="hidden" name="job_id" value="job-123"><button class="button primary" type="submit">Try again</button></form>');
    expect(page).toContain('<a class="button" href="/support?job=job-123">Get help</a>');
    expect(page).toContain('Setup reference for support: <code>job-123</code>');

    const support = snapshotFor('dead_letter', (job) => failFirst(job, 'github_config_invalid'));
    const supportPage = progressPage('job-123', support);
    expect(supportPage).not.toContain('/progress/retry');
    expect(supportPage).toContain('<a class="button primary" href="/support?job=job-123">Get help</a>');
  });

  test('an expired link says so once and points an owner to their dashboard first', () => {
    const page = progressPage('job-123', MISSING);
    expect(page).toContain('<h1 id="progress-heading">This setup link has expired</h1>');
    const visible = page.slice(0, page.indexOf('<script'));
    expect(visible.match(/expired/gu)).toHaveLength(2); // the heading and the tab title
    expect(page).toContain('<a class="button primary" href="/status">Manage your site</a>');
    expect(page).toContain('<a class="button" href="/">Start again</a>');
  });

  test('a status change reloads the page; polling stops at terminal', () => {
    const page = progressPage('job-123', ACTIVE);
    const script = page.slice(page.lastIndexOf('<script>'));
    expect(script).toContain('if (next.progress.status !== snapshot.progress.status) {');
    expect(script).toContain('window.location.reload();');
    expect(script.match(/if \(isTerminal\(snapshot\)\) return;/gu)).toHaveLength(2);
    expect(script).not.toContain('window.open');
  });

  test('the ?check=1 outcome renders inline in the propagation area of a succeeded snapshot', () => {
    const okPage = progressPage('job-123', SUCCEEDED_LINKS, { reachable: true, checkedAt: NOW });
    expect(okPage)
      .toContain('<p id="site-check-result" class="small muted" role="status">Checked just now: your site is answering.</p>');
    const lagPage = progressPage('job-123', SUCCEEDED, { reachable: false, checkedAt: NOW });
    expect(lagPage)
      .toContain('<p id="site-check-result" class="small muted" role="status">Checked just now: not answering yet. Try again in a minute.</p>');
  });

  test('a plain render hides the result line and carries the no-JS check link', () => {
    const page = progressPage('job-123', SUCCEEDED);
    expect(page).toContain('<p id="site-check-result" class="small muted" role="status" hidden></p>');
    expect(page).toContain('<a id="site-check-link" class="button" href="/progress?job_id=job-123&amp;check=1">Check if it is up yet</a>');
  });

  test('the client-side check writes the shared copy and never reschedules', () => {
    const script = progressPage('job-123', SUCCEEDED).slice(progressPage('job-123', SUCCEEDED).lastIndexOf('<script>'));
    const bindStart = script.indexOf("checkLink.addEventListener('click'");
    const bindEnd = script.indexOf('function render(');
    expect(bindStart).toBeGreaterThan(-1);
    const bindBody = script.slice(bindStart, bindEnd);
    expect(bindBody).toContain("fetch(siteCheckUrl, { headers: { accept: 'application/json' } })");
    expect(bindBody).toContain('reachable ? CHECK_OK : CHECK_NOT_YET');
    expect(bindBody).not.toContain('schedule');
  });

  test('escapes snapshot data in text, attributes, and the JSON island', () => {
    const hostile = snapshotFor('succeeded', (job) => {
      succeedAll(job);
      job.data.generatedRepository.name = 'alice<script>alert(1)</script>';
      job.data.generatedRepository.htmlUrl = 'https://github.com/alice/repo" onmouseover="alert(1)';
      job.data.repository = { ...job.data.repository, url: 'https://alice.github.io/" onmouseover="alert(6)' };
      job.data.notionLinks = {
        pagesUrl: 'https://www.notion.so/pages" onmouseover="alert(3)',
        postsUrl: 'https://www.notion.so/posts\' onload="alert(4)',
        templateRootUrl: 'https://www.notion.so/root" onclick="alert(5)',
      };
    });
    const page = progressPage('job-123', hostile);

    expect(page).toContain('alice&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(page).toContain('href="https://github.com/alice/repo&quot; onmouseover=&quot;alert(1)"');
    expect(page).toContain('href="https://alice.github.io/&quot; onmouseover=&quot;alert(6)"');
    expect(page).toContain('href="https://www.notion.so/pages&quot; onmouseover=&quot;alert(3)"');
    expect(page).toContain('href="https://www.notion.so/posts&#39; onload=&quot;alert(4)"');
    expect(page).toContain('href="https://www.notion.so/root&quot; onclick=&quot;alert(5)"');
    expect(page).not.toMatch(/<a [^>]*onmouseover="/u);
    expect(page).toContain('alice\\u003cscript>alert(1)\\u003c/script>');
    expect(progressPage('job-1" <script>', MISSING)).toContain(
      'data-status-url="/progress/status?job_id=job-1%22%20%3Cscript%3E"',
    );
    expect(progressPage('job-1" <script>', MISSING)).toContain(
      'data-site-check-url="/progress/site-check?job_id=job-1%22%20%3Cscript%3E"',
    );
  });

  test('the live line announces the current step, or where a stopped setup stopped', () => {
    expect(progressPage('job-123', ACTIVE)).toContain('>Setting up your site.</p>');
    expect(progressPage('job-123', AWAITING)).toContain('>It takes about a minute. The rest runs by itself.</p>');
    expect(progressPage('job-123', FAILED)).toContain(
      '<p id="progress-live" class="lede" role="status" aria-live="polite">Stopped at “Set up your site”.</p>',
    );
  });

  test('the tab title is the step while active and the heading when done, always ending in InkDrafts', () => {
    expect(progressPage('job-123', ACTIVE)).toContain('<title>Setting up your site. | InkDrafts</title>');
    expect(progressPage('job-123', SUCCEEDED)).toContain('<title>Your site is live | InkDrafts</title>');
  });
});

describe('progress page in a browser', () => {
  function boot(snapshot: ProgressSnapshot, fetchImpl: () => Promise<unknown>) {
    const timers: (() => void)[] = [];
    const page = progressPage('job-123', snapshot);
    // jsdom cannot navigate; a reload attempt surfaces as this console error.
    let navigations = 0;
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => {
      if (String(error.message).includes('navigation')) navigations += 1;
    });
    const { window } = new JSDOM(page, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://inkdrafts.test/progress?job_id=job-123',
      virtualConsole,
    });
    window.setTimeout = ((callback: () => void) => timers.push(callback)) as unknown as typeof window.setTimeout;
    window.fetch = fetchImpl as unknown as typeof window.fetch;
    window.eval(page.slice(page.lastIndexOf('<script>') + '<script>'.length).split('</script>')[0]!);
    return { window, timers, reloads: () => navigations };
  }

  test('a poll that sees a new status reloads to the server-rendered panel', async () => {
    const next = { ...SUCCEEDED_LINKS, updatedAt: ACTIVE.updatedAt + 1 };
    const { window, timers, reloads } = boot(ACTIVE, async () => ({ ok: true, json: async () => next }));
    expect(timers).toHaveLength(1);
    timers[0]!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reloads()).toBe(1);
    window.close();
  });

  test('three failed polls in a row say we cannot reach InkDrafts, and a good poll clears it', async () => {
    let ok = false;
    const { window, timers } = boot(ACTIVE, async () => {
      if (!ok) throw new Error('offline');
      return { ok: true, json: async () => ACTIVE };
    });
    const trouble = window.document.getElementById('poll-trouble') as HTMLElement;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(trouble.hidden).toBe(true);
      timers.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(trouble.hidden).toBe(false);
    expect(trouble.textContent).toContain('We cannot reach InkDrafts right now.');
    ok = true;
    timers.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(trouble.hidden).toBe(true);
    window.close();
  });
});
