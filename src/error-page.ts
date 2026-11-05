/**
 * The single browser-facing error document for consent-handoff failures.
 *
 * A consent handoff is a browser navigation — a provider redirect or a
 * /connect entry link can only end in a document — so these paths render
 * this page rather than the JSON bodies a programmatic client would need.
 * The failure registry owns the copy: its message is the heading and its
 * action the next step. Every page ends in at least one working button, and
 * the machine code sits in "Details for support" rather than in the reader's
 * way. No client JavaScript.
 */

import { failureDescriptor, userCopy, type ProvisioningFailureCode } from './failures';
import { dashboardDocument, escapeHtml } from './dashboard-shell';

export interface ErrorPageFailure {
  readonly code: ProvisioningFailureCode;
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  /** Where the try-again action sends the browser; null renders Get help as
   * the only button. */
  readonly restartHref: string | null;
  /** Non-secret remediation metadata (already redacted by the caller); shown
   * under "Details for support". */
  readonly details?: Record<string, unknown> | null;
  /** The setup this failure belongs to, when known: goes into the help report. */
  readonly jobId?: string | null;
}

const ISSUES_URL = 'https://github.com/OffConstruct/notiongit/issues/new';

function retryText(seconds: number): string {
  if (seconds >= 2 * 60 * 60) return `in about ${Math.round(seconds / 3600)} hours`;
  if (seconds >= 2 * 60) return `in about ${Math.round(seconds / 60)} minutes`;
  return `in ${seconds} seconds`;
}

/** Button words follow the destination, so the label says what happens. */
function restartLabel(href: string): string {
  if (href.startsWith('/connect/notion')) return 'Try connecting Notion again';
  if (href.startsWith('/progress')) return 'Back to your setup';
  if (href.startsWith('/themes')) return 'Pick a design';
  if (href.startsWith('/status')) return 'Go to your dashboard';
  return 'Start again';
}

function detailsRows(details: Record<string, unknown> | null | undefined): string {
  if (!details) return '';
  return Object.entries(details)
    .map(([key, value]) => `<li><code>${escapeHtml(key)}</code>: ${escapeHtml(JSON.stringify(value) ?? '')}</li>`)
    .join('');
}

/** The issue is public, so it carries only the error code: the setup
 * reference opens that setup's progress page and must stay private. */
export function helpReportUrl(code: ProvisioningFailureCode): string {
  const url = new URL(ISSUES_URL);
  url.searchParams.set('title', `Setup problem: ${code}`);
  url.searchParams.set('body', [
    `Error code: ${code}`,
    '',
    'What were you doing when this happened?',
    '',
    '(This page is public. Do not paste passwords, tokens or private links.)',
  ].join('\n'));
  return url.toString();
}

export function errorPage(failure: ErrorPageFailure): string {
  const copy = userCopy(failure.code);
  const restart = failure.restartHref === null
    ? ''
    : `<a class="button primary" href="${escapeHtml(failure.restartHref)}">${restartLabel(failure.restartHref)}</a>`;
  const help = `<a class="button${restart ? '' : ' primary'}" href="${escapeHtml(helpReportUrl(failure.code))}">Get help</a>`;
  return dashboardDocument({
    title: copy.message,
    body: `<h1>${escapeHtml(copy.message)}</h1>
<p class="lede">${escapeHtml(copy.action)}</p>
${failure.retryAfterSeconds === null ? '' : `<p>You can try again ${retryText(failure.retryAfterSeconds)}.</p>`}
<div class="actions">${restart}${help}</div>
<p class="small muted">Get help opens a public page on GitHub with the error code filled in. Do not add passwords or private links. You can also read <a href="/support">Support</a>.</p>
<details class="more">
<summary>Details for support</summary>
<ul class="plain">
<li>Error code: <code>${escapeHtml(failure.code)}</code></li>
${failure.jobId ? `<li>Setup reference: <code>${escapeHtml(failure.jobId)}</code></li>` : ''}
${detailsRows(failure.details)}
</ul>
</details>`,
  });
}

/** Renders the failure as the wire response for a browser navigation,
 * carrying the registry's HTTP status, any provider retry hint, and whatever
 * extra headers the route owns (Notion clears its redirect cookie here). */
export function errorPageResponse(failure: ErrorPageFailure, headers: Record<string, string> = {}): Response {
  const allHeaders: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    ...headers,
  };
  if (failure.retryAfterSeconds !== null) allHeaders['retry-after'] = String(failure.retryAfterSeconds);
  return new Response(errorPage(failure), { status: failure.status, headers: allHeaders });
}

/** The try-again target rule shared by callers: a flow restart goes to
 * `href`; a Notion step the owner can redo goes back to that job's Notion
 * consent (`notionRetryHref`), and everything else offers Get help only. */
export function restartHrefFor(code: ProvisioningFailureCode, href: string, notionRetryHref: string | null = null): string | null {
  const recovery = failureDescriptor(code).recovery;
  if (recovery === 'restart_flow') return href;
  if (notionRetryHref !== null && typeof recovery === 'object' && code.startsWith('notion_')) return notionRetryHref;
  if (notionRetryHref !== null && code === 'provisioning_handoff_failed') return notionRetryHref;
  return null;
}

/** The branded answer to a browser asking for a page that does not exist. */
export function notFoundPage(): string {
  return dashboardDocument({
    title: 'Page not found',
    body: `<h1>We could not find that page</h1>
<p class="lede">The link may be old or mistyped.</p>
<div class="actions"><a class="button primary" href="/">Go to the home page</a><a class="button" href="/status">Manage your site</a><a class="button" href="/themes">See the designs</a></div>`,
  });
}
