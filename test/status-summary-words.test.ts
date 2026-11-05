import { describe, expect, test } from 'bun:test';

import type { NotionSyncRunIdentity } from '../src/notion-sync';
import { parseSafeSummary, projectSiteStatus, type SiteDiscovery, type StatusSession } from '../src/status';
import { statusPage } from '../src/status-page';

const VIEWER: StatusSession = { v: 1, accountId: 42, login: 'alice', installationId: 987654, exp: Math.floor(Date.now() / 1000) + 3600 };

function summaryView(summary: Record<string, unknown>): string {
  const run: NotionSyncRunIdentity = {
    runId: 555,
    htmlUrl: 'https://github.com/alice/alice.github.io/actions/runs/555',
    status: 'completed',
    conclusion: 'success',
    headSha: 'h',
    createdAtMs: Date.parse('2026-09-01T10:00:00Z'),
    updatedAtMs: Date.parse('2026-09-01T10:05:00Z'),
  };
  const discovery: SiteDiscovery = {
    ok: true,
    accountLogin: 'alice',
    repository: {
      id: 1001, fullName: 'alice/alice.github.io', name: 'alice.github.io', htmlUrl: 'https://github.com/alice/alice.github.io',
      defaultBranch: 'main', templateFullName: 't/t', templateHeadSha: null, templateHeadTreeSha: null, headSha: null, headTreeSha: null, reused: true,
    },
    syncRun: run,
    summary: parseSafeSummary(JSON.stringify({ schema_version: 1, finished_at: '2026-09-01T10:05:00Z', ...summary })),
    build: { buildId: 3, status: 'built', commitSha: 'h' },
    notionConnected: true,
  };
  return statusPage(projectSiteStatus(discovery, VIEWER, Date.parse('2026-09-01T11:00:00Z')), { notice: null, rerunFormToken: null });
}

const COUNTS = { created: 0, updated: 1, renamed: 0, deleted: 0, unchanged: 3, errors: 0 };

describe('the latest update, from the run summary', () => {
  test('says how many posts wait for their date', () => {
    const page = summaryView({ result: 'success', code: 'synced', pages: null, posts: { ...COUNTS, scheduled: 2 } });
    expect(page).toContain('<p>1 post changed.</p><p>2 posts scheduled. Each one appears on your site on its date, on its own.</p>');
    expect(summaryView({ result: 'success', code: 'synced', pages: null, posts: { ...COUNTS, scheduled: 1 } }))
      .toContain('1 post scheduled. It appears on your site on its date, on its own.');
    expect(summaryView({ result: 'success', code: 'synced', pages: null, posts: COUNTS })).not.toContain('scheduled');
  });

  test('lists what went live with something left out, in plain words', () => {
    const page = summaryView({
      result: 'success',
      code: 'synced',
      pages: null,
      posts: COUNTS,
      skipped: [
        { section: 'posts', title: 'Our trip', reason_code: 'file_too_large', reason: 'raw', count: 2 },
        { section: 'pages', title: 'About <me>', reason_code: 'blocks_unsupported', reason: 'raw', count: 1 },
        { section: 'posts', title: 'Later', reason_code: 'a_future_code', reason: 'Something new was left out.', count: 1 },
      ],
    });
    expect(page).toContain('<h3>Published, with something left out</h3>');
    expect(page).toContain('<strong>Our trip</strong> &mdash; 2 files in it are bigger than 20 MB, so they were left out.');
    expect(page).toContain('<strong>About &lt;me&gt;</strong> &mdash; Part of it cannot be shown on a website');
    expect(page).toContain('<strong>Later</strong> &mdash; Something new was left out.');
  });

  test('a malformed skipped list is dropped and the update still reads as finished', () => {
    const page = summaryView({ result: 'success', code: 'synced', pages: null, posts: COUNTS, skipped: [{ title: 7 }] });
    expect(page).toContain('The last update finished');
    expect(page).not.toContain('left out');
  });
});
