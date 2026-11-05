/**
 * The document frame for the owner's screens: progress, status and error
 * pages. Same paper palette, font and masthead as the landing and theme
 * pages (`SITE_BASE_STYLES`), in a narrower reading column. Every string a
 * caller passes in `body` must already be escaped. The masthead and footer
 * are the site-wide ones, minus the "Create my site" button: an owner is
 * already past it.
 */

import { NOTION_WORDS, UPDATE_WAIT } from './notion-words';
import { SITE_BASE_STYLES, SITE_FONT_PRELOAD, siteFooterHtml, siteHeaderHtml } from './site-styles';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const DASHBOARD_STYLES = `${SITE_BASE_STYLES}
  main { max-width: 46rem; margin: 0 auto; padding: clamp(1.75rem, 5vw, 3rem) var(--gutter) 3rem; }
  h1 { font-size: clamp(1.9rem, 5vw, 2.6rem); margin: 0 0 0.6rem; }
  h2 { font-size: 1.35rem; margin: 0 0 0.5rem; }
  h3 { font-size: 1.1rem; margin: 1.25rem 0 0.4rem; }
  p { margin: 0 0 0.75rem; }
  .lede { font: 1.05rem/1.55 var(--sans); color: var(--muted); margin: 0 0 1.25rem; }
  .muted { color: var(--muted); }
  .small { font: 0.9rem/1.55 var(--sans); }
  .ok { color: var(--ok); }
  .danger { color: var(--danger); }
  .card { border: 1px solid var(--border); border-radius: 4px; padding: 1.1rem 1.25rem; margin: 0 0 1.25rem; }
  .card > :last-child { margin-bottom: 0; }
  .card.lead { border-left: 4px solid var(--accent); }
  .card.alert { border-color: var(--danger); border-left: 4px solid var(--danger); }
  .card.alert h2 { color: var(--danger); }
  .notice { border-left: 3px solid var(--accent); background: var(--surface); padding: 0.85rem 1.1rem; margin: 0 0 1.25rem; font: 0.95rem/1.55 var(--sans); }
  .notice p { margin: 0; }
  .notice p + p { margin-top: 0.35rem; color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; margin: 0.9rem 0 0.25rem; }
  .actions form { margin: 0; }
  .button[aria-disabled="true"] { opacity: 0.55; cursor: not-allowed; }
  .site-line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; margin: 0 0 1.5rem; }
  .site-url { font: 600 1.1rem/1.4 var(--sans); overflow-wrap: anywhere; }
  ol.how, ul.plain { margin: 0.5rem 0 0.75rem; padding-left: 1.4rem; font-family: var(--sans); font-size: 0.97rem; }
  ol.how li, ul.plain li { margin: 0 0 0.35rem; }
  ul.links { list-style: none; margin: 0.25rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.6rem; }
  details.more { border-top: 1px solid var(--border); margin: 1.5rem 0 0; padding: 0.9rem 0 0; font: 0.95rem/1.55 var(--sans); }
  details.more summary { cursor: pointer; font-weight: 600; padding: 0.6rem 0; }
  details.more[open] summary { margin-bottom: 0.5rem; }
  .meta { border-top: 1px solid var(--border); margin-top: 2rem; padding-top: 1rem; font: 0.9rem/1.6 var(--sans); color: var(--muted); }
  .meta p { margin: 0 0 0.35rem; }
  .meta a { color: var(--muted); }
  code { overflow-wrap: anywhere; }
`;

export interface DashboardDocument {
  /** The page name; " | InkDrafts" is appended for the tab. */
  readonly title: string;
  readonly body: string;
  /** Extra attributes for `<main>`, already escaped (the progress page's data hooks). */
  readonly mainAttributes?: string;
  /** Page-specific CSS appended after the shared styles. */
  readonly styles?: string;
  /** Markup after `</footer>`: the progress page's data island and script. */
  readonly tail?: string;
  /** The visitor is signed in to the dashboard. */
  readonly owner?: boolean;
}

export function dashboardDocument(page: DashboardDocument): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} | InkDrafts</title>
${SITE_FONT_PRELOAD}
<style>${DASHBOARD_STYLES}${page.styles ?? ''}</style>
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
${siteHeaderHtml({ start: false, owner: page.owner })}
<main id="main-content"${page.mainAttributes ? ` ${page.mainAttributes}` : ''}>
${page.body}
</main>
${siteFooterHtml()}
${page.tail ?? ''}
</body>
</html>`;
}

/** Canonical Notion links for the owner's InkDrafts page; any may be null. */
export interface NotionPageLinks {
  readonly homeUrl: string | null;
  readonly postsUrl: string | null;
  readonly pagesUrl: string | null;
}

/**
 * "Write in Notion": the shared card on the status page and the setup
 * success page. Links that were not captured fall back to opening Notion
 * itself plus where to look, so the card always has a working button.
 */
export function writeInNotionCard(links: NotionPageLinks | null, options: { heading: string; headingLevel: 2 | 3; onDashboard?: boolean; updating?: boolean }): string {
  const tag = `h${options.headingLevel}`;
  const home = links?.homeUrl ?? null;
  const posts = links?.postsUrl ?? null;
  const pages = links?.pagesUrl ?? null;
  const buttons = [
    home
      ? `<li><a class="button primary" href="${escapeHtml(home)}">Open my page in Notion</a></li>`
      : '<li><a class="button primary" href="https://www.notion.so/">Open Notion</a></li>',
    posts ? `<li><a class="button" href="${escapeHtml(posts)}">Write a new post</a></li>` : '',
    pages ? `<li><a class="button" href="${escapeHtml(pages)}">Edit my pages</a></li>` : '',
  ].join('');
  const find = home
    ? ''
    : `<p class="small muted">In Notion, look in the sidebar for your InkDrafts page. It starts out named “${escapeHtml(NOTION_WORDS.root)}”.</p>`;
  return `<section class="card lead" aria-labelledby="write-heading">
<${tag} id="write-heading">${escapeHtml(options.heading)}</${tag}>
<p>Everything on your site comes from your InkDrafts page in Notion. Change it there and your site follows.</p>
<ul class="links">${buttons}</ul>
${find}
<h3>To publish a new post</h3>
<ol class="how">
<li>Open <strong>${escapeHtml(NOTION_WORDS.posts)}</strong> and add a new row. Write your post inside it.</li>
<li>Set <strong>Status</strong> to <strong>Published</strong> and pick a <strong>${escapeHtml(NOTION_WORDS.date)}</strong>.</li>
<li>It shows up on your site on its own, ${UPDATE_WAIT}.${options.updating ? '' : ` In a hurry? Press <strong>Update my site now</strong>${options.onDashboard ? ' below' : ' on your dashboard'}.`}</li>
</ol>
<p class="small muted">To take something off your site, set its Status back to Draft. Edits to published pages appear the same way.</p>
</section>`;
}
