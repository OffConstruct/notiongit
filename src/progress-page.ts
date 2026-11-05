/**
 * Server-rendered progress page for `GET /progress`.
 *
 * The server renders the one panel for the job's current status. The inline
 * script polls `/progress/status`, updates the checklist rows and the live
 * line by toggling attributes and text only (a snapshot can never inject
 * markup), and reloads the page when the status itself changes, so every
 * panel has a single, server-rendered source. The script makes no request
 * outside this origin.
 */

import {
  progressPageUrl,
  PROGRESS_STAGE_ORDER,
  PROGRESS_STAGE_REGISTRY,
  type ProgressSnapshot,
  type ProgressStageState,
  type ProgressStageView,
  type PublicProgress,
} from './progress';
import { dashboardDocument, escapeHtml, writeInNotionCard } from './dashboard-shell';
import { NOTION_WORDS, UPDATE_WAIT } from './notion-words';

export const PROGRESS_POLL_INTERVAL_MS = 5000;
export const PROGRESS_POLL_MAX_INTERVAL_MS = 60_000;
/** Consecutive failed polls before the page says it cannot reach us. */
export const PROGRESS_POLL_TROUBLE_AFTER = 3;

/** Result of the one-shot server-side probe behind `?check=1`; null when the
 * render never probed (the default — a plain render must add no latency). */
export interface SiteCheckOutcome {
  readonly reachable: boolean;
  readonly checkedAt: number;
}

const PAGE_HEADINGS: { [S in PublicProgress['status']]: string } = {
  awaiting_notion: 'Last step: connect Notion',
  active: 'Setting up your site',
  succeeded: 'Your site is live',
  failed: 'Setup stopped',
  missing: 'This setup link has expired',
};

const RECONNECT_HEADING = 'Reconnect Notion';

const STATE_WORDS: { [S in ProgressStageState]: string } = {
  done: 'Done',
  current: 'In progress',
  your_turn: 'Your turn',
  pending: 'Waiting',
  blocked: 'Stopped',
};

/** JSON safe for an inline script island: a literal `<` would let snapshot
 * data close the tag. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function stagesOf(progress: PublicProgress): readonly ProgressStageView[] {
  return 'stages' in progress ? progress.stages : [];
}

function isTerminal(progress: PublicProgress): boolean {
  return progress.status === 'succeeded' || progress.status === 'failed' || progress.status === 'missing';
}

function currentStageOf(progress: PublicProgress): ProgressStageView | undefined {
  return stagesOf(progress).find((stage) => stage.state === 'current' || stage.state === 'blocked' || stage.state === 'your_turn');
}

function headingOf(progress: PublicProgress): string {
  return progress.status === 'awaiting_notion' && progress.reconnect ? RECONNECT_HEADING : PAGE_HEADINGS[progress.status];
}

const SUCCESS_LIVE = `All ${PROGRESS_STAGE_ORDER.length} steps done.`;

function liveText(progress: PublicProgress): string {
  if (progress.status === 'succeeded') return SUCCESS_LIVE;
  if (progress.status === 'missing') return progress.action;
  const current = currentStageOf(progress);
  if (progress.status === 'failed') return current ? `Stopped at “${current.label}”.` : '';
  return current ? PROGRESS_STAGE_REGISTRY[current.id].headline : '';
}

const STYLES = `
  ol.checklist { list-style: none; margin: 1.5rem 0 1.5rem; padding: 0; display: grid; gap: 0.5rem; font-family: var(--sans); }
  ol.checklist li {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    border: 1px solid var(--border); border-radius: 4px; padding: 0.65rem 1rem;
  }
  ol.checklist li[data-state="pending"] { color: var(--muted); }
  ol.checklist li[data-state="current"] { border-color: var(--accent); animation: pulse 2s ease-in-out infinite; }
  ol.checklist li[data-state="current"] .stage-state, ol.checklist li[data-state="your_turn"] .stage-state { color: var(--accent); }
  ol.checklist li[data-state="your_turn"] { border-color: var(--accent); border-width: 2px; }
  ol.checklist li[data-state="done"] { border-color: color-mix(in srgb, var(--ok) 55%, var(--border)); }
  ol.checklist li[data-state="done"] .stage-state { color: var(--ok); }
  ol.checklist li[data-state="blocked"] { border-color: var(--danger); }
  ol.checklist li[data-state="blocked"] .stage-state { color: var(--danger); }
  ol.checklist li.later { border-style: dashed; color: var(--muted); }
  .stage-state { font-size: 0.9rem; font-weight: 600; white-space: nowrap; }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 35%, transparent); }
    50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 0%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) {
    ol.checklist li[data-state="current"] { animation: none; }
  }
  figure.consent { margin: 1rem 0; font-family: var(--sans); }
  figure.consent figcaption { font-size: 0.9rem; color: var(--muted); margin-bottom: 0.4rem; }
  .consent-box { border: 1px solid var(--border); border-radius: 6px; background: var(--surface); padding: 0.5rem; max-width: 26rem; }
  .consent-box .opt { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.6rem; border-radius: 4px; font-size: 0.92rem; }
  .consent-box .opt.on { background: var(--bg); outline: 2px solid var(--accent); font-weight: 600; }
  .consent-box .radio { flex: none; width: 1rem; height: 1rem; border-radius: 50%; border: 2px solid var(--muted); }
  .consent-box .opt.on .radio { border-color: var(--accent); box-shadow: inset 0 0 0 3px var(--bg), inset 0 0 0 8px var(--accent); }
`;

const HEADLINES_JSON = scriptJson(Object.fromEntries(
  PROGRESS_STAGE_ORDER.map((id) => [id, PROGRESS_STAGE_REGISTRY[id].headline]),
));

/** The one-shot re-check's outcome copy, shared by the server render (?check=1)
 * and the client-side writer so both transports phrase it identically. */
const CHECK_OK_COPY = 'Checked just now: your site is answering.';
const CHECK_NOT_YET_COPY = 'Checked just now: not answering yet. Try again in a minute.';

// The early returns below need a function scope: a classic script rejects a
// top-level return and runs nothing at all.
const SCRIPT = `(() => {
  const HEADLINES = ${HEADLINES_JSON};
  const STATE_WORDS = ${scriptJson(STATE_WORDS)};
  const CHECK_OK = ${scriptJson(CHECK_OK_COPY)};
  const CHECK_NOT_YET = ${scriptJson(CHECK_NOT_YET_COPY)};
  const POLL_MS = ${PROGRESS_POLL_INTERVAL_MS};
  const POLL_MAX_MS = ${PROGRESS_POLL_MAX_INTERVAL_MS};
  const TROUBLE_AFTER = ${PROGRESS_POLL_TROUBLE_AFTER};

  let snapshot = JSON.parse(document.getElementById('progress-data').textContent);
  let delayMs = POLL_MS;
  let timer = 0;
  let failures = 0;
  const mainElement = document.getElementById('main-content');
  const statusUrl = mainElement.getAttribute('data-status-url');
  const siteCheckUrl = mainElement.getAttribute('data-site-check-url');
  const liveElement = document.getElementById('progress-live');
  const trouble = document.getElementById('poll-trouble');
  const rows = new Map([...document.querySelectorAll('[data-stage-id]')].map((row) => [row.getAttribute('data-stage-id'), row]));

  const isTerminal = (value) => ['succeeded', 'failed', 'missing'].includes(value.progress.status);

  for (const button of document.querySelectorAll('[data-copy]')) {
    if (!navigator.clipboard) continue;
    button.hidden = false;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.getAttribute('data-copy'));
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Copy did not work';
      }
    });
  }

  const checkLink = document.getElementById('site-check-link');
  const checkResult = document.getElementById('site-check-result');
  if (checkLink && checkResult && siteCheckUrl) {
    checkLink.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        const response = await fetch(siteCheckUrl, { headers: { accept: 'application/json' } });
        if (!response.ok) return;
        const reachable = (await response.json()).reachable;
        if (typeof reachable !== 'boolean') return;
        checkResult.textContent = reachable ? CHECK_OK : CHECK_NOT_YET;
        checkResult.hidden = false;
      } catch {
        // The no-JS link keeps working; nothing to say here.
      }
    });
  }

  function render(next) {
    const progress = next.progress;
    for (const stage of progress.stages ?? []) {
      const row = rows.get(stage.id);
      if (!row) continue;
      row.setAttribute('data-state', stage.state);
      row.querySelector('.stage-state').textContent = STATE_WORDS[stage.state];
    }
    if (progress.status === 'active') {
      const notice = document.getElementById('active-notice');
      if (notice) notice.hidden = progress.notice === null;
      const message = document.getElementById('notice-message');
      const action = document.getElementById('notice-action');
      if (message) message.textContent = progress.notice ? progress.notice.message : '';
      if (action) action.textContent = progress.notice ? progress.notice.action : '';
    }
    const current = (progress.stages ?? []).find((stage) => ['current', 'blocked', 'your_turn'].includes(stage.state));
    const headline = current ? HEADLINES[current.id] : '';
    // Writing identical text re-triggers some screen readers; announce only
    // real changes so a slow poll cadence never reads the same line twice.
    if (headline && liveElement.textContent !== headline) liveElement.textContent = headline;
    if (headline) document.title = headline + ' | InkDrafts';
  }

  function schedule() {
    if (document.hidden) return;
    const hint = snapshot.progress.status === 'active' ? snapshot.progress.pollAfterSeconds : null;
    timer = setTimeout(poll, Math.max(delayMs, (hint ?? 0) * 1000));
  }

  async function poll() {
    clearTimeout(timer);
    try {
      const response = await fetch(statusUrl, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('unusable status response');
      const next = await response.json();
      failures = 0;
      if (trouble) trouble.hidden = true;
      if (next.progress.status !== snapshot.progress.status) {
        // A new status has its own server-rendered panel.
        window.location.reload();
        return;
      }
      if (next.updatedAt > snapshot.updatedAt) {
        snapshot = next;
        delayMs = POLL_MS;
        render(snapshot);
      } else {
        delayMs = Math.min(delayMs * 2, POLL_MAX_MS);
      }
    } catch {
      failures += 1;
      if (trouble && failures >= TROUBLE_AFTER) trouble.hidden = false;
      delayMs = Math.min(delayMs * 2, POLL_MAX_MS);
    }
    if (isTerminal(snapshot)) return;
    schedule();
  }

  if (isTerminal(snapshot)) return;
  const retry = document.getElementById('poll-retry');
  if (retry) retry.addEventListener('click', () => { delayMs = POLL_MS; poll(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else poll();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) poll();
  });
  schedule();
})();
`;

function checklistRow(stage: ProgressStageView): string {
  return `<li data-stage-id="${stage.id}" data-state="${stage.state}">` +
    `<span class="stage-label">${escapeHtml(stage.label)}</span>` +
    `<span class="stage-state">${STATE_WORDS[stage.state]}</span>` +
    `</li>`;
}

function checklistHtml(progress: PublicProgress): string {
  const stages = stagesOf(progress);
  if (stages.length === 0 || progress.status === 'succeeded') return '';
  // While the owner's turn is up, the steps after it are one line: they run
  // by themselves and are not the owner's concern yet.
  const later = progress.status === 'awaiting_notion' ? stages.filter((stage) => stage.state === 'pending') : [];
  const shown = stages.filter((stage) => !later.includes(stage));
  const laterRow = later.length === 0
    ? ''
    : `\n<li class="later"><span class="stage-label">Then ${later.length} more steps run by themselves</span><span class="stage-state">About 5 minutes</span></li>`;
  return `<ol class="checklist" aria-label="Setup steps">
${shown.map(checklistRow).join('\n')}${laterRow}
</ol>`;
}

function consentFigure(reconnect: boolean): string {
  const template = 'Use a template provided by the developer';
  const pages = 'Select pages to share';
  const label = reconnect
    ? `On Notion’s screen, pick “${pages}”, not “${template}”.`
    : `On Notion’s screen, pick “${template}”, not “${pages}”.`;
  return `<figure class="consent">
<figcaption>What to pick on Notion’s screen</figcaption>
<div class="consent-box" role="img" aria-label="${escapeHtml(label)}">
<div class="opt${reconnect ? '' : ' on'}"><span class="radio"></span>${template}</div>
<div class="opt${reconnect ? ' on' : ''}"><span class="radio"></span>${pages}</div>
</div>
</figure>`;
}

const COME_BACK = '<p class="small muted">You can close this page: setup keeps going without you. To check later, go to inkdrafts.com and choose <a href="/status">Sign in</a>.</p>';

function awaitingPanel(progress: Extract<PublicProgress, { status: 'awaiting_notion' }>, jobId: string): string {
  const href = `/connect/notion?job_id=${encodeURIComponent(jobId)}`;
  const intro = progress.reconnect
    ? `<p>Connect your InkDrafts page in Notion again so your site can keep up with your writing.</p>
<p>Notion will ask what to share. Choose <strong>“Select pages to share”</strong> and tick your InkDrafts page (it starts out named “${escapeHtml(NOTION_WORDS.root)}”). Do not pick the template: that would start a fresh copy with sample posts.</p>`
    : `<p>Your site has a home on GitHub. Now connect Notion, where you will write.</p>
<p>Notion will ask what to share. Choose <strong>“Use a template provided by the developer”</strong>. That adds your InkDrafts starter page to your Notion. Notion may call it “Duplicate template”.</p>`;
  return `<section class="panel">
${intro}
${consentFigure(progress.reconnect)}
<div class="actions"><a class="button primary" href="${escapeHtml(href)}">${progress.reconnect ? 'Reconnect Notion' : 'Connect Notion'}</a></div>
<p class="small muted">InkDrafts reads your InkDrafts page to build your site and keeps no copy of your Notion access. Notion’s screen also mentions inserting content; InkDrafts never changes anything in your Notion. <a href="/privacy">Privacy Policy</a>.</p>
${COME_BACK}
</section>`;
}

function activePanel(progress: Extract<PublicProgress, { status: 'active' }>): string {
  const notice = progress.notice;
  return `<section class="panel">
<p>This usually takes about 5 minutes. This page updates by itself.</p>
<div id="active-notice" class="notice" role="status"${notice ? '' : ' hidden'}>
<p id="notice-message">${escapeHtml(notice?.message ?? '')}</p>
<p id="notice-action">${escapeHtml(notice?.action ?? '')}</p>
</div>
${COME_BACK}
</section>`;
}

function succeededPanel(progress: Extract<PublicProgress, { status: 'succeeded' }>, jobId: string, siteCheck: SiteCheckOutcome | null): string {
  const url = progress.site.url;
  const display = url.replace(/^https?:\/\//u, '');
  const checkHref = `/progress?job_id=${encodeURIComponent(jobId)}&check=1`;
  const checkResultLine = siteCheck === null
    ? '<p id="site-check-result" class="small muted" role="status" hidden></p>'
    : `<p id="site-check-result" class="small muted" role="status">${escapeHtml(siteCheck.reachable ? CHECK_OK_COPY : CHECK_NOT_YET_COPY)}</p>`;
  const links = {
    homeUrl: progress.notionLinks.templateRootUrl,
    postsUrl: progress.notionLinks.postsUrl,
    pagesUrl: progress.notionLinks.pagesUrl,
  };
  return `<section class="panel">
<div class="site-line"><a id="site-link" class="button primary" href="${escapeHtml(url)}">Open your site</a><span class="site-url">${escapeHtml(display)}</span><button type="button" class="button" data-copy="${escapeHtml(url)}" hidden>Copy address</button></div>
<p class="small muted">Not opening yet? Give it a few minutes while GitHub’s network catches up.</p>
<div class="actions"><a id="site-check-link" class="button" href="${escapeHtml(checkHref)}">Check if it is up yet</a></div>
${checkResultLine}
${progress.appearanceNote === null ? '' : `<p id="appearance-note" class="small muted">${escapeHtml(progress.appearanceNote)}</p>`}
${writeInNotionCard(links, { heading: 'Write your first post', headingLevel: 2 })}
<section class="card" aria-labelledby="yours-heading">
<h2 id="yours-heading">Make it yours</h2>
<p>Your site starts with sample text. Replace it in Notion:</p>
<ol class="how">
<li>In <strong>${escapeHtml(NOTION_WORDS.pages)}</strong>, open <strong>${escapeHtml(NOTION_WORDS.home)}</strong>. Put in your name, a one-line tagline and a photo.</li>
<li>In <strong>${escapeHtml(NOTION_WORDS.posts)}</strong>, rewrite or delete the sample post “${escapeHtml(NOTION_WORDS.samplePost)}”.</li>
<li>When your <strong>${escapeHtml(NOTION_WORDS.about)}</strong> page is ready, set its Status to Published.</li>
</ol>
</section>
<section class="card" aria-labelledby="dashboard-heading">
<h2 id="dashboard-heading">Your dashboard</h2>
<p>See when your site last updated, update it right away, or change how it looks. Bookmark it: <strong>inkdrafts.com/status</strong>.</p>
<div class="actions"><a class="button" href="/status">Open your dashboard</a><a class="button" href="/status/appearance">Change how it looks</a></div>
<p class="small muted">Changes you make in Notion appear on your site on their own, ${UPDATE_WAIT}. In a hurry? Press Update my site now on your dashboard.</p>
</section>
<details class="more">
<summary>For later</summary>
<p>Your site’s files live in your own GitHub account: <a id="repository-link" href="${escapeHtml(progress.repository.url)}">${escapeHtml(progress.repository.name)}</a>. You never need to open it to write, and your site keeps working even if InkDrafts goes away.</p>
<p>Want your own web address, like yourname.com? GitHub’s <a href="https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site">custom domain guide</a> shows how.</p>
</details>
</section>`;
}

function failedPanel(progress: Extract<PublicProgress, { status: 'failed' }>, jobId: string): string {
  const help = `/support?job=${encodeURIComponent(jobId)}`;
  const retry = progress.canRetry
    ? `<form method="post" action="/progress/retry"><input type="hidden" name="job_id" value="${escapeHtml(jobId)}"><button class="button primary" type="submit">Try again</button></form>`
    : '';
  const restart = !progress.canRetry && progress.restartUrl !== null
    ? `<a class="button primary" href="${escapeHtml(progress.restartUrl)}">Start again</a>`
    : '';
  return `<section class="panel">
<div class="card alert">
<p id="failed-message">${escapeHtml(progress.message)}</p>
<p id="failed-action">${escapeHtml(progress.action)}</p>
<div class="actions">${retry}${restart}<a class="button${retry || restart ? '' : ' primary'}" href="${escapeHtml(help)}">Get help</a></div>
<p class="small muted">Setup reference for support: <code>${escapeHtml(jobId)}</code></p>
</div>
</section>`;
}

function missingPanel(): string {
  return `<section class="panel">
<div class="actions"><a class="button primary" href="/status">Manage your site</a><a class="button" href="/">Start again</a></div>
</section>`;
}

function panelHtml(progress: PublicProgress, jobId: string, siteCheck: SiteCheckOutcome | null): string {
  switch (progress.status) {
    case 'awaiting_notion': return awaitingPanel(progress, jobId);
    case 'active': return activePanel(progress);
    case 'succeeded': return succeededPanel(progress, jobId, siteCheck);
    case 'failed': return failedPanel(progress, jobId);
    case 'missing': return missingPanel();
  }
}

/**
 * Renders the one progress document. `siteCheck` carries the outcome of the
 * optional `?check=1` propagation probe; only a succeeded snapshot renders
 * it, and a plain render (null) never probes and keeps the result line
 * hidden for the client writer to fill.
 */
export function progressPage(
  jobId: string,
  snapshot: ProgressSnapshot,
  siteCheck: SiteCheckOutcome | null = null,
): string {
  const progress = snapshot.progress;
  const heading = headingOf(progress);
  const current = currentStageOf(progress);
  const title = isTerminal(progress) || !current ? heading : PROGRESS_STAGE_REGISTRY[current.id].headline;
  // The no-JS affordance is a manual reload, never a forced meta refresh:
  // auto-reload with no way to decline is a WCAG 2.2.1 failure (axe
  // meta-refresh, critical).
  const refresh = isTerminal(progress)
    ? ''
    : `<noscript><p class="small muted">This page updates itself with JavaScript. Without it, <a href="${escapeHtml(progressPageUrl(jobId))}">refresh the page</a> to check on the setup.</p></noscript>`;
  const statusUrl = `/progress/status?job_id=${encodeURIComponent(jobId)}`;
  const siteCheckUrl = `/progress/site-check?job_id=${encodeURIComponent(jobId)}`;
  const trouble = isTerminal(progress)
    ? ''
    : `<div id="poll-trouble" class="notice" role="alert" hidden><p>We cannot reach InkDrafts right now. We keep trying by ourselves.</p><p><button type="button" id="poll-retry" class="button">Check again</button></p></div>`;

  return dashboardDocument({
    title,
    styles: STYLES,
    mainAttributes: `data-status-url="${escapeHtml(statusUrl)}" data-site-check-url="${escapeHtml(siteCheckUrl)}"`,
    body: `<h1 id="progress-heading">${escapeHtml(heading)}</h1>
<p id="progress-live" class="lede" role="status" aria-live="polite">${escapeHtml(liveText(progress))}</p>
${trouble}
${refresh}
${panelHtml(progress, jobId, siteCheck)}
${checklistHtml(progress)}`,
    tail: `<script type="application/json" id="progress-data">${scriptJson(snapshot)}</script>
<script>${SCRIPT}</script>`,
  });
}
