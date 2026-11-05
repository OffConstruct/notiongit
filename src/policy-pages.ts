/**
 * The static policy documents behind the footer links: privacy, terms,
 * security, acceptable use, support, and leaving (deletion and disconnect).
 *
 * They exist because the launch gate requires policies to be reachable before
 * consent and to match the real implementation, so every retention or token
 * claim here is either computed from the source constant that enforces it
 * (`PROVISIONING_JOB_TTL_SECONDS`, `STATUS_SESSION_TTL_SECONDS`) or pinned by
 * test/policy-pages.test.ts to the platform figures documented in
 * `docs/observability.md`. Operator-configured windows (the abuse-control
 * counters) describe the deployed `wrangler.toml` and are re-checked by the
 * launch checklist. The copy deliberately makes no security
 * certification claim and promises no perfect security.
 *
 * One document per policy in the shared site shell (header, footer, base
 * styles), with no client JavaScript and no external requests.
 */

import { UPDATE_WAIT } from './notion-words';
import { PROVISIONING_JOB_TTL_SECONDS } from './provisioning-job';
import { SITE_BASE_STYLES, SITE_FONT_PRELOAD, siteFooterHtml, siteHeaderHtml } from './site-styles';
import { NOTION_LINKS_TTL_SECONDS, STATUS_SESSION_TTL_SECONDS } from './status';

export interface PolicyPage {
  readonly path: string;
  readonly title: string;
  readonly document: string;
}

const JOB_RETENTION_HOURS = PROVISIONING_JOB_TTL_SECONDS / 3600;
const SESSION_HOURS = STATUS_SESSION_TTL_SECONDS / 3600;
const NOTION_LINKS_DAYS = NOTION_LINKS_TTL_SECONDS / 86_400;

const SUPPORT = '<a href="/support">Support</a>';

const REPO = 'https://github.com/OffConstruct/notiongit';

const STYLES = `${SITE_BASE_STYLES}
  main { max-width: 46rem; margin: 0 auto; padding: 2.5rem var(--gutter) 3rem; }
  main h1 { font-size: clamp(2rem, 5vw, 2.75rem); margin: 0 0 1rem; }
  main h2 { font-size: 1.45rem; margin: 2.25rem 0 0.5rem; }
  .updated { color: var(--muted); margin: 0 0 1.5rem; font: 0.9rem/1.5 var(--sans); }
  .lede { font-size: 1.2rem; }
  .ask { border: 1px solid var(--border); background: var(--surface); padding: 1.1rem 1.25rem; margin: 1.25rem 0 1.5rem; }
  .ask p { margin: 0 0 0.75rem; }
  .ask p:last-child { margin: 0.75rem 0 0; font: 0.9rem/1.5 var(--sans); color: var(--muted); }
  table { border-collapse: collapse; width: 100%; margin: 0.75rem 0 1.5rem; font: 0.95rem/1.5 var(--sans); }
  th, td { border: 1px solid var(--border); padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; overflow-wrap: break-word; }
  th:first-child, td:first-child { min-width: 9rem; }
  th { background: var(--surface); }
  /* Narrow screens: each row becomes a card, its header shown by the cell. */
  @media (max-width: 30rem) {
    table, thead, tbody, tr, th, td { display: block; }
    tr:has(> th) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    tr { border: 1px solid var(--border); margin: 0 0 0.75rem; }
    td { border: 0; border-top: 1px solid var(--border); padding: 0.5rem 0.75rem; }
    tr > td:first-child { border-top: 0; background: var(--surface); font-weight: 600; }
    td[data-label]::before { content: attr(data-label) ": "; color: var(--muted); font-weight: 600; }
  }
  code { overflow-wrap: anywhere; }
`;

interface PolicyBody {
  readonly path: string;
  readonly title: string;
  readonly heading: string;
  readonly body: string;
}

const UPDATED = 'Updated November 2026';

const BODIES: readonly PolicyBody[] = [
  {
    path: '/privacy',
    title: 'Privacy Policy',
    heading: 'Privacy Policy',
    body: `
<p class="updated">${UPDATED}</p>
<p>InkDrafts connects Notion and GitHub. It creates a website repository in
your GitHub account and keeps it in sync with your Notion pages. This policy
describes what the service keeps and for how long. It matches the public
code in <a href="${REPO}">OffConstruct/notiongit</a>.</p>

<h2>Summary</h2>
<ul>
<li>InkDrafts keeps no copy of your Notion or GitHub access tokens.</li>
<li>Setup records delete themselves within ${JOB_RETENTION_HOURS} hours.</li>
<li>No advertising, no trackers, no data selling, no third-party analytics.</li>
<li>Your repository, content, and published site are yours and stay with you.</li>
</ul>

<h2>What InkDrafts keeps, and for how long</h2>
<table>
<tr><th>Record</th><th>Contents</th><th>Kept for</th></tr>
<tr>
<td>Setup record</td>
<td data-label="Contents">Your GitHub account id, login, account type, the App installation id, your
repository's name and URL, and the outcome of each setup step. It is tied to a
random job id, not to any InkDrafts account.</td>
<td data-label="Kept for">${JOB_RETENTION_HOURS} hours after the last update, then deleted
automatically. This includes finished and failed setups.</td>
</tr>
<tr>
<td>Template validation record</td>
<td data-label="Contents">Property names, property types, and select options of the Pages and Posts
databases in the Notion template you duplicated. InkDrafts reads this to verify
the template was duplicated correctly. No page content is in it.</td>
<td data-label="Kept for">${JOB_RETENTION_HOURS} hours. Reconnecting Notion replaces it.</td>
</tr>
<tr>
<td>Operational metrics</td>
<td data-label="Contents">Step names, outcomes, error codes, and durations for each setup, correlated
only by the random job id. No account name, no repository name, no content.</td>
<td data-label="Kept for">Written to operational logs kept for at most three days. InkDrafts keeps no
long-lived aggregate of them.</td>
</tr>
<tr>
<td>Abuse controls</td>
<td data-label="Contents">Short-lived counters that keep someone from starting many setups at once.
A counter contains a GitHub account id or a keyed hash of your network address,
never the address itself.</td>
<td data-label="Kept for">From one minute up to seven days with the deployed configuration.</td>
</tr>
<tr>
<td>Dashboard session</td>
<td data-label="Contents">If you sign in to your dashboard, a cookie carries your GitHub login and
account id. The dashboard re-derives your site's state from GitHub on every
visit. InkDrafts stores no account-to-site binding.</td>
<td data-label="Kept for">${SESSION_HOURS} hours, or until you sign out of the dashboard.</td>
</tr>
</table>

<h2>Access tokens</h2>
<p>Your GitHub authorization is used inside a single request to create your
repository, then discarded. InkDrafts never stores a GitHub access token.</p>
<p>Your Notion token is written once into your own repository's Actions
secrets, for the sync workflow inside your repository to use. The value is
sealed with libsodium encryption against your repository's public key before
GitHub stores it. InkDrafts keeps no copy. Revoking the InkDrafts connection
in Notion makes the stored token invalid. See
<a href="/leaving">Leaving InkDrafts</a> for the steps.</p>

<h2>Cookies</h2>
<p>InkDrafts sets four cookies in total. None of them tracks you across other
sites, and there are no advertising or analytics cookies.</p>
<ul>
<li>Two short-lived state cookies protect the Notion connection and the
dashboard sign-in against tampering and replay. They are cleared when the
authorization completes and expire within minutes regardless.</li>
<li>The dashboard session cookie described above, which lasts
${SESSION_HOURS} hours.</li>
<li>A cookie set by the page that finishes your setup. It holds the links to
your InkDrafts page in Notion, so your dashboard can open it for you. It stays
only in that browser, lasts ${NOTION_LINKS_DAYS} days, and is gone when you
clear that browser's cookies.</li>
</ul>

<h2>What InkDrafts never does</h2>
<ul>
<li>It never shows you advertising and never sells data.</li>
<li>It never reads your Notion page content. Your page content is read by the
sync workflow inside your own repository, not by InkDrafts.</li>
<li>It never edits your content after setup. Syncing is performed by the
GitHub Action inside your repository; the only thing InkDrafts can still
start is a sync run you ask for from the <a href="/status">dashboard</a>.</li>
<li>It never asks you for a password, token, or secret. No one from InkDrafts
will ever need one.</li>
</ul>

<h2>Removing your data</h2>
<p>Setup records delete themselves after ${JOB_RETENTION_HOURS} hours. To
disconnect InkDrafts from your accounts, or to delete your site entirely,
follow <a href="/leaving">Leaving InkDrafts</a>. Questions and data requests
go through ${SUPPORT}.</p>

<h2>Changes to this policy</h2>
<p>This policy describes what the service's public code actually does. If the
behavior changes, this page changes with it, and the full history of this page
is public in the repository. Material changes are announced on the
<a href="/">landing page</a>.</p>
`,
  },
  {
    path: '/terms',
    title: 'Terms of Service',
    heading: 'Terms of Service',
    body: `
<p class="updated">${UPDATED}</p>
<p>InkDrafts is a free service that sets up a Notion-powered website in your
own GitHub account. By connecting your accounts you agree to these terms. If
you do not agree, do not connect your accounts.</p>

<h2>Who runs InkDrafts</h2>
<p>InkDrafts is a free, open-source project maintained by
<a href="https://github.com/OffConstruct">@OffConstruct</a>. It has no
legal entity behind it, and it sells nothing.</p>

<h2>Who can use the service</h2>
<p>You need a GitHub account and a Notion account, and you must be
at least 13 years old, the same minimum GitHub's own terms set. By
connecting your accounts you confirm you meet these requirements.</p>

<h2>What the service does</h2>
<p>InkDrafts creates a repository in your GitHub account from a public
template, writes encrypted secrets for your repository's own sync workflow,
enables GitHub Pages, runs the first sync, and reports progress to you. After
setup, all syncing is performed by the GitHub Action inside your repository.
InkDrafts is not part of that loop.</p>

<h2>Your accounts, your content, your site</h2>
<p>You keep full ownership of your GitHub repository, your Notion content, and
your published site. You are responsible for what you publish and for
following GitHub's and Notion's own terms and acceptable-use policies. InkDrafts
is not a party to your agreements with those providers.</p>

<h2>Availability</h2>
<p>The service is free, experimental, and provided as is, with no uptime
guarantee. We may change, suspend, or discontinue it at any time, and we may
pause or refuse provisioning at any time to protect users, the providers, or
the service, for example during an abuse or provider incident. Because your
site runs from your own repository, it keeps working without InkDrafts.</p>

<h2>Limitation of liability</h2>
<p>To the extent the law allows, the service is provided as is, without
warranties of any kind, and neither party is liable to the other for indirect
or consequential damages. Because InkDrafts is free, any liability is limited
to the amount you paid for it. Nothing in these terms limits liability that
cannot be limited under applicable law.</p>

<h2>Stopping</h2>
<p>You can stop using InkDrafts at any time, and that ends these terms for
your accounts. See
<a href="/leaving">Leaving InkDrafts</a> for the steps and what happens to
your data. We can block use that violates these terms or the
<a href="/acceptable-use">Acceptable Use Policy</a>.</p>

<h2>Governing law</h2>
<p>These terms are governed by the laws of the United States, without regard
to its conflict-of-laws rules.</p>

<h2>Changes to these terms</h2>
<p>Changes are published on this page. The full history of this page is public
in the <a href="${REPO}">service's repository</a>.</p>

<p>Questions about these terms go through ${SUPPORT}.</p>
`,
  },
  {
    path: '/security',
    title: 'Security and Data Handling',
    heading: 'Security and Data Handling',
    body: `
<p class="updated">${UPDATED}</p>
<p>This page describes how InkDrafts handles credentials and data. It matches
the public implementation and its <a href="${REPO}/blob/main/docs/security-data-flow.md">documented
data-flow audit</a>.</p>

<h2>Where credentials live</h2>
<p>The InkDrafts server holds three provider credentials: the GitHub App
private key and the GitHub and Notion OAuth client secrets. They are stored as
server-side Cloudflare secrets. They never reach browser code, your repository,
or logs.</p>

<h2>Token lifecycle</h2>
<ul>
<li>Your GitHub authorization token lives for one request. It creates your
repository and is then discarded. It is never written to storage, queues, or
logs.</li>
<li>Your Notion token is written once, encrypted, into your own repository's
Actions secrets, and InkDrafts keeps no copy.</li>
<li>After setup, each provisioning step mints its own short-lived token and
discards it when the step ends.</li>
</ul>
<p>The enforcement is test-enforced. The repository's canary suite plants fake
credentials, drives the real provisioning journeys, and fails if any canary
reaches storage, queue messages, logs, or responses. See
<code>test/token-hygiene.test.ts</code> in the repository.</p>

<h2>Encryption</h2>
<p>All traffic runs over HTTPS. Actions secret values are sealed with a
libsodium sealed box against your repository's public key before they are sent
to GitHub. Only your repository can decrypt them.</p>

<h2>Least privilege</h2>
<p>The InkDrafts GitHub App requests exactly these permissions: Metadata
(read), Administration (write), Contents (write), Secrets (write), Actions
(write), and Pages (write). Administration covers Pages setup on your
repository. The App is installed on your account only, sees only the
repositories you grant, and can be uninstalled by you at any time.</p>

<h2>Retention</h2>
<p>Setup records and the Notion template validation record are deleted after
${JOB_RETENTION_HOURS} hours. Operational logs are kept for at most three
days. Details are in the <a href="/privacy">Privacy Policy</a>.</p>

<h2>What this page does not claim</h2>
<p>No security control is perfect. InkDrafts runs on GitHub, Notion, and
Cloudflare and depends on their guarantees, their availability, and their
incident response. InkDrafts holds no third-party security certification, and
no free service should be your only backup. Your repository is yours, so your
site's durability is GitHub's, not InkDrafts'.</p>

<h2>Reporting a security problem</h2>
<p>Please report suspected vulnerabilities privately through GitHub's
&ldquo;Report a vulnerability&rdquo; on the InkDrafts repositories, or through
${SUPPORT} if you cannot. Do not open a public issue with details.</p>
`,
  },
  {
    path: '/acceptable-use',
    title: 'Acceptable Use Policy',
    heading: 'Acceptable Use Policy',
    body: `
<p class="updated">${UPDATED}</p>
<p>InkDrafts publishes your Notion pages to your own GitHub Pages site. What
you publish is yours to choose, within the rules below and the terms you
already have with GitHub and Notion.</p>

<h2>Your content</h2>
<ul>
<li>Only publish content you have the rights to publish.</li>
<li>Do not use InkDrafts sites for unlawful, infringing, deceptive, harassing,
or malicious content, including phishing, malware, or spam.</li>
<li>Follow GitHub's Terms of Service and Acceptable Use Policies, and Notion's
terms, for anything you publish or sync. Those agreements govern your
accounts; InkDrafts relies on them.</li>
</ul>

<h2>Fair use of the service</h2>
<ul>
<li>Set up sites for accounts you control.</li>
<li>Do not automate setup at scale, circumvent rate limits, or interfere with
the service's operation or other users.</li>
<li>Do not use the service to attack, probe, or overload any system.</li>
</ul>

<h2>Enforcement</h2>
<p>InkDrafts enforces these rules with rate limits, temporary denials, and, in
an incident, a full provisioning pause. Content that breaks a provider's terms
is a matter between you and that provider, and the provider will act on your
account or repository directly.</p>

<p>Report a violation by opening an issue on
<a href="${REPO}/issues">OffConstruct/notiongit</a>. It is the same public route
${SUPPORT} describes, and no email address is published for reports.</p>
`,
  },
  {
    path: '/support',
    title: 'Support',
    heading: 'Support',
    body: `
<p class="updated">${UPDATED}</p>
<p class="lede">Stuck, or something looks wrong? Ask us. We answer every
question.</p>

<div class="ask">
<p><a class="button primary" href="${REPO}/issues/new?title=${encodeURIComponent('Question about my site')}&amp;body=${encodeURIComponent('What were you trying to do, and what happened?\n\n(This page is public. Do not paste passwords or private links.)')}">Ask a question</a></p>
<p>This opens a short form on GitHub, where InkDrafts is built in the open.
Sign in with the same GitHub account as your site. Your question is public,
so never include a password or a private link.</p>
</div>

<h2>Before you ask</h2>
<ul>
<li>Your <a href="/status">dashboard</a> shows whether your site is up to date,
and lets you update it right away or fix a problem with one button.</li>
<li>A change in Notion shows up on your site on its own, ${UPDATE_WAIT}. Check
that its Status is Published.</li>
<li>If many sites seem down at once, GitHub or Notion may be having trouble:
<a href="https://www.githubstatus.com">GitHub status</a>,
<a href="https://status.notion.so">Notion status</a>.</li>
</ul>

<details>
<summary>Details for support</summary>
<p>If a setup page showed an error code, include it in your question. Do not
post the setup reference: it opens your setup page. A maintainer will ask for
it privately if needed. Your site's Actions tab on GitHub keeps a log of every
update, which helps with harder problems.</p>
</details>

<h2>Security reports</h2>
<p>Use GitHub's &ldquo;Report a vulnerability&rdquo; on the InkDrafts
repositories, or open an issue asking for a private contact channel. Please do
not post exploit details publicly.</p>

<h2>Data requests</h2>
<p>The <a href="/privacy">Privacy Policy</a> lists everything InkDrafts keeps
and how long it lives. Most of it deletes itself. For anything else, open an
issue through ${SUPPORT}.</p>

<h2>What to expect</h2>
<p>InkDrafts is a free service. There is no response-time guarantee, but
public issues are the fastest way to reach the maintainers.</p>
`,
  },
  {
    path: '/leaving',
    title: 'Leaving InkDrafts',
    heading: 'Leaving InkDrafts',
    body: `
<p class="updated">${UPDATED}</p>
<p>You can disconnect InkDrafts at any time, and every step is reversible by
connecting again. In every case your repository and your published site stay
yours and keep working without InkDrafts.</p>

<h2>Stop syncing from Notion</h2>
<p>In Notion, open Settings, then Connections, and revoke the InkDrafts
connection. The scheduled sync in your repository's Actions tab then fails on
invalid credentials and stops. Your published site stays up with the content
it already has. You can also switch the sync off yourself in the repository's
Actions tab.</p>

<h2>End InkDrafts' access on GitHub</h2>
<p>On GitHub, open Settings, then Applications, then Installed GitHub Apps,
and uninstall InkDrafts. That ends all of the App's access to your account.
Your dashboard will show the access as gone.</p>

<h2>Remove the stored Notion token</h2>
<p>The encrypted copy of your Notion token lives in your repository's Actions
secrets. Revoking the Notion connection makes it useless. To remove it from
GitHub entirely, delete the <code>NOTION_TOKEN</code>,
<code>NOTION_PAGES_DATABASE_ID</code>, and <code>NOTION_POSTS_DATABASE_ID</code>
secrets in the repository's Settings, under Secrets and variables, then
Actions.</p>

<h2>Delete your site</h2>
<p>Delete the repository on GitHub. GitHub keeps a restore window, after which
the repository and the published site are gone. InkDrafts cannot restore them
for you.</p>

<h2>Revoke the dashboard sign-in</h2>
<p>If you signed in to the <a href="/status">dashboard</a>, you can revoke the
InkDrafts authorization on GitHub under Settings, then Applications, then
Authorized OAuth Apps. Any open dashboard session ends within
${SESSION_HOURS} hours.</p>

<h2>What remains on InkDrafts' side</h2>
<p>InkDrafts keeps no copy of any of your tokens, so there is nothing to
revoke there. Setup records delete themselves within
${JOB_RETENTION_HOURS} hours. The anonymous operational log entries described
in the <a href="/privacy">Privacy Policy</a> age out within three days.</p>

<p>Questions about leaving go through ${SUPPORT}.</p>
`,
  },
];

function policyDocument(page: PolicyBody): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title} | InkDrafts</title>
<meta name="description" content="InkDrafts ${page.title.toLowerCase()}: what the service keeps, how it handles credentials, and how to reach support.">
${SITE_FONT_PRELOAD}
<style>${STYLES}</style>
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
${siteHeaderHtml()}
<main id="main-content">
<h1>${page.heading}</h1>
${page.body}
</main>
${siteFooterHtml()}
</body>
</html>`;
}

export const POLICY_PAGES: Readonly<Record<string, PolicyPage>> = Object.fromEntries(
  BODIES.map((page) => [page.path, { path: page.path, title: page.title, document: policyDocument(page) }]),
);

export const POLICY_PATHS: readonly string[] = BODIES.map((page) => page.path);
