/**
 * Server-rendered status page: the owner's home for keeping their site up
 * to date. It leads with one plain answer (is my site up to date?), one
 * primary action, and the "Write in Notion" card; GitHub detail sits in a
 * disclosure at the end. No client JavaScript: a run in flight offers a
 * manual refresh instead of reloading itself.
 *
 * Rendering is total over `StatusPageModel`: the body switch is keyed by
 * the model's kind, so a new union arm fails compilation here first. Every
 * string that came from a provider or the session is escaped on its way into
 * the document.
 */

import type { SiteStatus, StatusPageModel, SummaryCounts, SummaryItem } from './status';
import { dashboardDocument, escapeHtml, writeInNotionCard } from './dashboard-shell';
import { UPDATE_WAIT } from './notion-words';

/** Request-scoped extras the handlers own: the post-redirect-get notice, the
 * signed CSRF token embedded in the forms, and the clock relative times are
 * measured against. None is domain state. */
export interface StatusPageChrome {
  readonly notice: 'signin_required' | 'sync_triggered' | 'already_running' | 'rebuild_triggered' | 'delete_confirmed' | null;
  readonly rerunFormToken: string | null;
  readonly nowMs?: number;
}

const CONNECT_URL = '/status?connect=1';

const NOTICES: { [N in NonNullable<StatusPageChrome['notice']>]: string } = {
  signin_required: 'Please sign in again to continue. It is usually one click.',
  sync_triggered: 'Updating your site now. Refresh this page to see when it is done.',
  already_running: 'An update is already running. Refresh this page in a minute to see the result.',
  rebuild_triggered: 'Publishing your site again. Refresh this page in a couple of minutes.',
  delete_confirmed: 'Done. Those posts are coming off your site now. Refresh this page in a few minutes.',
};

function utcTitle(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function relativeTime(ms: number, nowMs: number): string {
  const minutes = Math.round(Math.max(0, nowMs - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

function timeHtml(ms: number, nowMs: number): string {
  return `<time datetime="${new Date(ms).toISOString()}" title="${utcTitle(ms)}">${relativeTime(ms, nowMs)}</time>`;
}

function durationText(seconds: number): string {
  if (seconds >= 2 * 60 * 60) return `in about ${Math.round(seconds / 3600)} hours`;
  if (seconds >= 2 * 60) return `in about ${Math.round(seconds / 60)} minutes`;
  return `in ${seconds} seconds`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "1 new post, 2 pages changed": non-zero counts only, in words. */
export function changesInWords(pages: SummaryCounts | null, posts: SummaryCounts | null): string {
  const parts: string[] = [];
  const section = (counts: SummaryCounts | null, one: string, many: string) => {
    if (counts === null) return;
    if (counts.created) parts.push(`${plural(counts.created, `new ${one}`, `new ${many}`)}`);
    if (counts.updated) parts.push(`${plural(counts.updated, one, many)} changed`);
    if (counts.renamed) parts.push(`${plural(counts.renamed, one, many)} renamed`);
    if (counts.deleted) parts.push(`${plural(counts.deleted, one, many)} taken down`);
    if (counts.errors) parts.push(`${plural(counts.errors, one, many)} could not be updated`);
  };
  section(posts, 'post', 'posts');
  section(pages, 'page', 'pages');
  if (parts.length === 0) return 'Nothing had changed in Notion.';
  const sentence = parts.join(', ');
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

/** What needs the owner, most urgent first. One problem renders at a time,
 * each with the one button that fixes it. */
export type SiteProblem =
  | { kind: 'notion_missing' }
  | { kind: 'notion_access' }
  | { kind: 'bulk_delete'; count: number | null; section: 'pages' | 'posts' | null; items: readonly SummaryItem[] }
  | { kind: 'row_errors'; count: number; items: readonly SummaryItem[] }
  | { kind: 'sync_failed' }
  | { kind: 'publish_failed' };

/** Notion's own error text when the connection was removed or the page is no
 * longer shared with InkDrafts (the run summary's redacted `detail`). */
const NOTION_ACCESS_DETAIL = /API token is invalid|\bunauthori[sz]ed\b|Could not find (?:database|page|block)|restricted_resource|not shared with (?:your )?integration/iu;

export function problemOf(site: SiteStatus): SiteProblem | null {
  const sync = site.sync;
  if (site.notionConnected === false) return { kind: 'notion_missing' };
  if ('source' in sync && sync.code === 'missing_credentials') return { kind: 'notion_missing' };
  if (sync.kind === 'running') return null;
  if ('source' in sync && sync.kind === 'failed') {
    if (sync.code === 'bulk_delete_guard') {
      const match = sync.detail?.match(/for (pages|posts): would delete (\d+)/u);
      return {
        kind: 'bulk_delete',
        count: match ? Number(match[2]) : sync.items?.length || null,
        section: match ? match[1] as 'pages' | 'posts' : sync.items?.[0]?.section ?? null,
        items: sync.items ?? [],
      };
    }
    if (sync.code === 'row_errors') {
      const count = (sync.pages?.errors ?? 0) + (sync.posts?.errors ?? 0);
      return { kind: 'row_errors', count: count || sync.items?.length || 1, items: sync.items ?? [] };
    }
    if (sync.code === 'notion_unauthorized' || NOTION_ACCESS_DETAIL.test(sync.detail ?? '')) return { kind: 'notion_access' };
    return { kind: 'sync_failed' };
  }
  if (sync.kind === 'failed') return { kind: 'sync_failed' };
  if (site.deploy.kind === 'errored') return { kind: 'publish_failed' };
  return null;
}

function hiddenToken(token: string): string {
  return `<input type="hidden" name="token" value="${escapeHtml(token)}">`;
}

function postButton(token: string | null, action: string, label: string, primary: boolean, path = '/status/rerun'): string {
  if (token === null) return '';
  const field = path === '/status/rerun' ? `<input type="hidden" name="action" value="${action}">` : '';
  return `<form method="post" action="${path}">${hiddenToken(token)}${field}<button class="button${primary ? ' primary' : ''}" type="submit">${escapeHtml(label)}</button></form>`;
}

function itemsList(items: readonly SummaryItem[], withReason: boolean): string {
  if (items.length === 0) return '';
  return `<ul class="plain">${items.map((item) =>
    `<li><strong>${escapeHtml(item.title)}</strong>${withReason && item.reason ? ` &mdash; ${escapeHtml(item.reason)}` : ''}</li>`).join('')}</ul>`;
}

function notionHref(site: SiteStatus, which: 'home' | 'posts' | 'pages'): string {
  const links = site.notion ?? null;
  const url = which === 'posts' ? links?.postsUrl : which === 'pages' ? links?.pagesUrl : links?.homeUrl;
  return escapeHtml(url ?? links?.homeUrl ?? 'https://www.notion.so/');
}

function problemCard(problem: SiteProblem, site: SiteStatus, token: string | null): string {
  const card = (heading: string, body: string, actions: string) =>
    `<section class="card alert" aria-labelledby="problem-heading">
<h2 id="problem-heading">${escapeHtml(heading)}</h2>
${body}
<div class="actions">${actions}</div>
</section>`;
  switch (problem.kind) {
    case 'notion_missing':
      return card(
        'Finish setting up: connect Notion',
        `<p>Your site is on the internet, but it is not connected to Notion yet, so it only shows sample text.</p>
<p class="small muted">Notion will ask what to share. Choose the template option (“Use a template provided by the developer”). That adds your InkDrafts page, where you will write.</p>`,
        postButton(token, '', 'Connect Notion', true, '/status/notion'),
      );
    case 'notion_access':
      return card(
        'InkDrafts lost access to your Notion',
        `<p>Your site still shows its last version, but new changes cannot reach it. This happens when the InkDrafts connection is removed in Notion, or your InkDrafts page is no longer shared with it.</p>
<p class="small muted">Notion will ask what to share. Choose “Select pages” and tick your InkDrafts page. Do not pick the template again: that would start a fresh copy with sample posts.</p>`,
        postButton(token, '', 'Reconnect Notion', true, '/status/notion'),
      );
    case 'bulk_delete': {
      const what = problem.section === 'pages' ? ['page', 'pages'] : ['post', 'posts'];
      const heading = problem.count === null
        ? `Your site would lose several ${what[1]}`
        : `Your site would lose ${plural(problem.count, what[0], what[1])}`;
      return card(
        heading,
        `<p>The latest update would take ${problem.count === 1 ? 'this' : 'these'} off your site, because ${problem.count === 1 ? 'it is' : 'they are'} no longer Published in Notion. We paused instead of removing so much at once.</p>
${itemsList(problem.items, false)}
<p class="small muted">Nothing is lost yet: your site still shows them. If you meant to remove them, confirm below. If not, set their Status back to Published in Notion.</p>`,
        `${postButton(token, 'sync_allow_delete', 'Yes, remove them', false)}<a class="button primary" href="${notionHref(site, problem.section ?? 'posts')}">No, keep them</a>`,
      );
    }
    case 'row_errors':
      return card(
        problem.count === 1 ? 'One row in Notion could not be published' : `${problem.count} rows in Notion could not be published`,
        `${itemsList(problem.items, true)}
<p>Everything else on your site is up to date. Fix ${problem.count === 1 ? 'that row' : 'those rows'} in Notion and press Update my site now, or wait for the next automatic update.</p>`,
        `<a class="button primary" href="${notionHref(site, 'posts')}">Open Notion</a>${postButton(token, 'sync', 'Update my site now', false)}`,
      );
    case 'sync_failed':
      return card(
        'Your latest update did not finish',
        '<p>Your site still shows its last version. This is usually temporary.</p><p class="small muted">If it keeps happening, <a href="/support">get help</a>.</p>',
        postButton(token, 'sync', 'Try again', true),
      );
    case 'publish_failed':
      return card(
        'Your latest changes did not go live',
        '<p>GitHub could not build the new version of your site, so it still shows the previous one.</p><p class="small muted">If it keeps happening, <a href="/support">get help</a>.</p>',
        postButton(token, 'rebuild', 'Try again', true),
      );
  }
}

interface Headline {
  readonly title: string;
  readonly lede: string;
}

function headlineOf(site: SiteStatus, problem: SiteProblem | null, nowMs: number): Headline {
  const sync = site.sync;
  const finishedAt = sync.kind === 'never_ran' || sync.kind === 'running' ? null : sync.finishedAtMs;
  if (problem?.kind === 'notion_missing') {
    return { title: 'Finish setting up your site', lede: 'One step left: connect Notion, where you will write.' };
  }
  if (problem?.kind === 'notion_access') {
    return { title: 'Your site needs you', lede: 'InkDrafts can no longer read your Notion page.' };
  }
  if (problem !== null) {
    return {
      title: 'Your site needs a quick look',
      lede: finishedAt === null ? 'Something went wrong with the latest update.' : `The latest update ran ${relativeTime(finishedAt, nowMs)}.`,
    };
  }
  if (sync.kind === 'running') {
    const started = sync.startedAtMs === null ? '' : ` Started ${relativeTime(sync.startedAtMs, nowMs)}.`;
    return { title: 'Your site is updating', lede: `This usually takes 2 to 5 minutes.${started}` };
  }
  if (site.deploy.kind === 'never_built') {
    return { title: 'Your site is being built', lede: 'It is usually ready in a few minutes. Refresh this page to check.' };
  }
  if (site.deploy.kind === 'building') {
    return { title: 'Your site is updating', lede: 'Publishing your latest changes. This usually takes a minute or two.' };
  }
  const updated = finishedAt === null ? '' : `Updated ${relativeTime(finishedAt, nowMs)}. `;
  return { title: 'Your site is up to date', lede: `${updated}Changes you make in Notion reach your site on their own, ${UPDATE_WAIT}.` };
}

function siteLine(site: SiteStatus): string {
  const url = escapeHtml(site.site.url);
  const display = escapeHtml(site.site.url.replace(/^https?:\/\//u, ''));
  if (site.deploy.kind === 'never_built') {
    return `<div class="site-line"><span class="button primary" aria-disabled="true">Visit your site</span><span class="site-url">${display}</span></div>
<p class="small muted">Your address is ready. The link works once the first publish finishes.</p>`;
  }
  return `<div class="site-line"><a class="button primary" href="${url}">Visit your site</a><span class="site-url">${display}</span></div>`;
}

/** "2 posts scheduled": posts with a date still ahead go live on that date. */
export function scheduledInWords(posts: SummaryCounts | null): string | null {
  const count = posts?.scheduled ?? 0;
  if (count === 0) return null;
  return `${plural(count, 'post', 'posts')} scheduled. ${count === 1 ? 'It appears' : 'Each one appears'} on your site on its date, on its own.`;
}

function skippedHtml(items: readonly SummaryItem[] | undefined): string {
  if (!items?.length) return '';
  return `<h3>Published, with something left out</h3>
${itemsList(items, true)}`;
}

function latestUpdateCard(site: SiteStatus, problem: SiteProblem | null, token: string | null, nowMs: number): string {
  const sync = site.sync;
  let line: string;
  if (sync.kind === 'never_ran') line = `<p>Your first update has not run yet. It runs on its own, ${UPDATE_WAIT}.</p>`;
  else if (sync.kind === 'running' && site.runInFlight) {
    line = `<p>An update is running now${sync.startedAtMs === null ? '' : `, started ${timeHtml(sync.startedAtMs, nowMs)}`}.</p>
<div class="actions"><a class="button" href="/status">Refresh</a></div>`;
  } else if (sync.kind === 'running') {
    // Running for over an hour: GitHub lost track of it, so starting a fresh
    // update is allowed and offered.
    line = `<p>An update started${sync.startedAtMs === null ? '' : ` ${timeHtml(sync.startedAtMs, nowMs)}`} and has not finished. You can start a fresh one.</p>`;
  } else {
    const when = sync.finishedAtMs === null ? null : timeHtml(sync.finishedAtMs, nowMs);
    const scheduled = 'source' in sync ? scheduledInWords(sync.posts) : null;
    const words = 'source' in sync && sync.kind !== 'failed'
      ? `<p>${escapeHtml(changesInWords(sync.pages, sync.posts))}</p>${scheduled === null ? '' : `<p>${escapeHtml(scheduled)}</p>`}`
      : '';
    line = sync.kind === 'failed'
      ? `<p>The last update${when === null ? '' : `, ${when},`} did not finish.</p>`
      : `<p>The last update finished${when === null ? '' : ` ${when}`}.</p>${words}`;
    if ('source' in sync) line += skippedHtml(sync.skipped);
  }
  // While a fix is needed, the fix is the one button; Update now waits.
  const button = site.runInFlight || problem !== null ? '' : `<div class="actions">${postButton(token, 'sync', 'Update my site now', false)}</div>`;
  return `<section class="card" aria-labelledby="update-heading">
<h2 id="update-heading">Updates from Notion</h2>
${line}
${button}
<p class="small muted">Changes you make in Notion appear on their own, ${UPDATE_WAIT}. Up to 10 updates by hand per day.</p>
</section>`;
}

function lookCard(site: SiteStatus): string {
  const theme = site.themeName ? `<p>Your site uses the <strong>${escapeHtml(site.themeName)}</strong> design.</p>` : '<p>Change your site’s design, colors and fonts.</p>';
  return `<section class="card" aria-labelledby="look-heading">
<h2 id="look-heading">How it looks</h2>
${theme}
<div class="actions"><a class="button" href="/status/appearance">Change appearance</a></div>
</section>`;
}

function detailsHtml(site: SiteStatus): string {
  const sync = site.sync;
  const runUrl = sync.kind === 'never_ran' ? null : sync.runUrl;
  const detail = 'source' in sync && sync.detail ? `<p>Last update report: <code>${escapeHtml(sync.detail)}</code></p>` : '';
  const fallback = site.summaryFallback === undefined ? '' : '<p>The last update’s report could not be read, so this page shows only whether it finished.</p>';
  return `<details class="more">
<summary>Technical details</summary>
${detail}${fallback}
${runUrl ? `<p><a href="${escapeHtml(runUrl)}">See the last update on GitHub</a></p>` : ''}
<p>Your site’s files live in your GitHub account: <a href="${escapeHtml(site.repository.url)}">${escapeHtml(site.repository.name)}</a>. You never need to open it to write.</p>
</details>`;
}

function metaHtml(login: string): string {
  return `<div class="meta">
<p>Signed in as ${escapeHtml(login)}. <a href="${CONNECT_URL}">Use a different GitHub account</a>.</p>
<p>Want to stop using InkDrafts? Your site stays yours. <a href="/leaving">Leaving InkDrafts</a>.</p>
</div>`;
}

function sessionBody(model: Extract<StatusPageModel, { kind: 'session' }>, chrome: StatusPageChrome, nowMs: number): { title: string; body: string } {
  const site = model.site;
  const problem = problemOf(site);
  const headline = headlineOf(site, problem, nowMs);
  const token = chrome.rerunFormToken;
  const notices = [
    chrome.notice === null ? '' : `<div class="notice" role="status"><p>${NOTICES[chrome.notice]}</p></div>`,
    site.automaticUpdatesResumed ? '<div class="notice" role="status"><p>Automatic updates had paused after 60 quiet days. They are back on.</p></div>' : '',
  ].join('');
  const notionBroken = problem?.kind === 'notion_missing' || problem?.kind === 'notion_access';
  const body = `<h1>${escapeHtml(headline.title)}</h1>
<p class="lede">${escapeHtml(headline.lede)}</p>
${siteLine(site)}
${notices}
${problem === null ? '' : problemCard(problem, site, token)}
${notionBroken ? '' : writeInNotionCard(site.notion ?? null, { heading: 'Write in Notion', headingLevel: 2, onDashboard: true, updating: site.runInFlight || site.sync.kind === 'running' || problem !== null })}
${problem?.kind === 'notion_missing' ? '' : latestUpdateCard(site, problem, token, nowMs)}
${lookCard(site)}
${detailsHtml(site)}
${metaHtml(model.viewer.login)}`;
  return { title: headline.title, body };
}

function signInButton(label = 'Sign in with GitHub'): string {
  return `<div class="actions"><a class="button primary" href="${CONNECT_URL}">${escapeHtml(label)}</a></div>`;
}

function bodyOf(model: StatusPageModel, chrome: StatusPageChrome, nowMs: number): { title: string; body: string } {
  const notice = chrome.notice === null ? '' : `<div class="notice" role="status"><p>${NOTICES[chrome.notice]}</p></div>`;
  switch (model.kind) {
    case 'entry':
      return {
        title: 'Manage your site',
        body: `<h1>Manage your site</h1>
${chrome.notice === 'signin_required' ? notice : ''}
<p class="lede">Sign in with the GitHub account you used to create your site. It is usually one click.</p>
${signInButton()}
<p>Here you can see whether your site is up to date, update it now, and change how it looks.</p>
<p class="small muted">Bookmark this page to come back any time. No site yet? <a href="/">Create one for free</a>.</p>`,
      };

    case 'session':
      return sessionBody(model, chrome, nowMs);

    case 'no_site':
      return {
        title: 'No site on this account',
        body: `<h1>We could not find a site on this account</h1>
<p class="lede">You are signed in as ${escapeHtml(model.viewer.login)}, and this GitHub account has no InkDrafts site.</p>
<p>If you made your site with a different GitHub account, sign in with that one.</p>
<div class="actions"><a class="button primary" href="${CONNECT_URL}">Sign in with another account</a><a class="button" href="/">Create a site</a></div>
<p class="small muted">If your site’s files were deleted or renamed on GitHub, InkDrafts can no longer recognize them.</p>
${metaHtml(model.viewer.login)}`,
      };

    case 'installation_gone':
      return {
        title: 'InkDrafts cannot reach your site',
        body: `<h1>InkDrafts can no longer reach your site</h1>
<p class="lede">Signed in as ${escapeHtml(model.viewer.login)}. Your site keeps working on its own.</p>
<p>InkDrafts was removed from your GitHub account, so this page cannot show or update your site. Add it back to manage your site here again. Your site and its content stay as they are.</p>
<div class="actions"><a class="button primary" href="/connect">Reconnect InkDrafts</a></div>
${metaHtml(model.viewer.login)}`,
      };

    case 'installation_suspended':
      return {
        title: 'InkDrafts is paused on your account',
        body: `<h1>InkDrafts is paused on your GitHub account</h1>
<p class="lede">Signed in as ${escapeHtml(model.viewer.login)}. Your site keeps working on its own.</p>
<p>InkDrafts was suspended in your GitHub settings, so this page cannot update your site. To turn it back on, open GitHub’s settings, choose InkDrafts, and select Unsuspend.</p>
<div class="actions"><a class="button primary" href="https://github.com/settings/installations">Open GitHub settings</a></div>
${metaHtml(model.viewer.login)}`,
      };

    case 'github_unavailable':
      return {
        title: 'GitHub is not answering',
        body: `<h1>GitHub is not answering right now</h1>
<p class="lede">We could not check your site, but nothing suggests anything is wrong with it.</p>
<p>${model.retryAfterSeconds === null ? 'Try again in a moment.' : `Try again ${durationText(model.retryAfterSeconds)}.`}</p>
<div class="actions"><a class="button primary" href="/status">Try again</a></div>`,
      };

    case 'auth_failed':
      if (model.reason === 'no_installation') {
        return {
          title: 'No InkDrafts site on this account',
          body: `<h1>There is no InkDrafts site on this GitHub account</h1>
<p class="lede">You signed in, but InkDrafts was never added to this GitHub account.</p>
<div class="actions"><a class="button primary" href="/">Create my site</a><a class="button" href="${CONNECT_URL}">Sign in with another account</a></div>`,
        };
      }
      return {
        title: model.reason === 'denied' ? 'Sign-in was cancelled' : 'That sign-in did not work',
        body: `<h1>${model.reason === 'denied' ? 'Sign-in was cancelled' : 'That sign-in did not work'}</h1>
<p class="lede">${model.reason === 'denied'
          ? 'GitHub did not finish signing you in, so we cannot show your site yet.'
          : 'The sign-in link expired or was already used. This happens if the page sat open for a while.'}</p>
${signInButton('Sign in again')}`,
      };

    default: {
      const never: never = model;
      return never;
    }
  }
}

export function statusPage(model: StatusPageModel, chrome: StatusPageChrome): string {
  const { title, body } = bodyOf(model, chrome, chrome.nowMs ?? Date.now());
  const owner = model.kind !== 'entry' && model.kind !== 'auth_failed' && model.kind !== 'github_unavailable';
  return dashboardDocument({ title, body, owner });
}

/** A transient throttle or outage response: real copy, the retry hint and a
 * way back, outside the page-state union because it is not a state of the
 * site. */
export function statusRefusalPage(options: {
  readonly title: string;
  readonly body: string;
  readonly retryAfterSeconds: number | null;
}): string {
  const retry = options.retryAfterSeconds === null ? '' : `<p class="muted">Try again ${durationText(options.retryAfterSeconds)}.</p>`;
  return dashboardDocument({
    title: options.title,
    body: `<h1>${escapeHtml(options.title)}</h1>
<p class="lede">${escapeHtml(options.body)}</p>
${retry}
<div class="actions"><a class="button primary" href="/status">Back to your dashboard</a></div>`,
  });
}
