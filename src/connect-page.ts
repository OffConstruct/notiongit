/**
 * `GET /connect[?theme=<id>&t_*]`: the "before you start" screen between the
 * landing page and GitHub. A non-technical visitor reads, in one screen,
 * why GitHub is involved, what its install page will show, and what Notion
 * asks afterwards, then continues to `/connect/github` with the chosen look
 * intact. The form is a plain GET with hidden fields, so the choice survives
 * without JavaScript; the account signup link opens in a new tab, so this
 * page and the choice survive the detour.
 *
 * Route wiring lives in `src/index.ts` (dashboard item D14); this module
 * exports the document and a response builder.
 */

import { pageHeaders } from './http-headers';
import { findTheme, parseAppearanceParams, tweakQuery, type CatalogTheme, type SiteAppearance } from './theme-catalog';
import { escapeHtml, pageShell, schemeChoices, schemeDefault } from './theme-ui';

export const CONNECT_PATH = '/connect';
export const GITHUB_SIGNUP_URL = 'https://github.com/signup';
/** The wording GitHub's install page uses; the runbook requires this scope
 * because the site's repository does not exist yet (docs/github-app-runbook.md). */
export const GITHUB_INSTALL_SCOPE = 'All repositories';
/** The option Notion shows when an integration ships a template. */
export const NOTION_TEMPLATE_CHOICE = 'Use a template provided by the developer';

const STYLES = `<style>
  .connect { max-width: 40rem; }
  .progress { display: flex; align-items: center; gap: 0.75rem; margin: 0 0 1.25rem; font: 600 0.85rem/1.3 var(--sans); color: var(--muted); }
  .progress .bar { display: flex; gap: 4px; }
  .progress .bar span { width: 2.25rem; height: 4px; border-radius: 2px; background: var(--border); }
  .progress .bar span.on { background: var(--accent); }
  .connect h1 { font-size: clamp(2rem, 5vw, 3rem); margin-bottom: 0.75rem; }
  .connect .lead { margin-bottom: 1.5rem; }
  .see { list-style: none; margin: 0 0 1.5rem; padding: 0; counter-reset: see; display: grid; gap: 0.6rem; font: 1rem/1.5 var(--sans); }
  .see li { counter-increment: see; position: relative; padding-left: 2.4rem; min-height: 1.6rem; }
  .see li::before { content: counter(see); position: absolute; left: 0; top: 0.05rem; display: inline-grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--fg); color: var(--bg); font: 600 0.8rem/1 var(--sans); }
  .green { display: inline-block; padding: 0.1rem 0.55rem; border-radius: 4px; background: #1a7431; color: #fff; font: 600 0.85rem/1.4 var(--sans); }
  .go { display: grid; gap: 0.75rem; margin: 0 0 2rem; }
  .go .cta { width: 100%; font-size: 1.05rem; min-height: 3.25rem; }
  .chosen { display: flex; align-items: center; gap: 0.9rem; font: 0.95rem/1.45 var(--sans); color: var(--muted); }
  .chosen img { flex: none; width: 5.5rem; height: auto; aspect-ratio: 8 / 5; border: 1px solid var(--border); background: var(--surface); }
  .chosen strong { color: var(--fg); }
  .card { border: 1px solid var(--border); border-radius: 6px; padding: 1.1rem 1.25rem; margin: 0 0 1rem; font: 0.97rem/1.55 var(--sans); }
  .card.tint { background: var(--surface); border-color: transparent; }
  .card h2 { margin: 0 0 0.4rem; font-size: 1.2rem; }
  .card p { margin: 0; }
  .card p + p { margin-top: 0.5rem; }
  .fine { font: 0.88rem/1.55 var(--sans); color: var(--muted); margin: 0.5rem 0 0; }
</style>`;

/** The chosen look in words: "Issue, Dark" or "Issue". */
function chosenLabel(theme: CatalogTheme, appearance: SiteAppearance): string {
  const mode = appearance.tweaks.mode;
  const scheme = typeof mode === 'string' && mode !== schemeDefault(theme)
    ? schemeChoices(theme).find((choice) => choice.value === mode)?.label
    : undefined;
  return scheme ? `${theme.name}, ${scheme.toLowerCase()}` : theme.name;
}

function hiddenFields(appearance: SiteAppearance | null): string {
  if (!appearance) return '';
  const fields = [`<input type="hidden" name="theme" value="${escapeHtml(appearance.themeId)}">`];
  for (const [key, value] of Object.entries(appearance.tweaks)) {
    fields.push(`<input type="hidden" name="t_${escapeHtml(key)}" value="${escapeHtml(String(value))}">`);
  }
  return fields.join('\n');
}

export function connectPage(appearance: SiteAppearance | null): string {
  const theme = appearance ? findTheme(appearance.themeId) : null;
  const query = appearance ? tweakQuery(appearance) : '';
  const changeHref = theme ? `/?theme=${theme.id}${query ? `&${query}` : ''}#start` : '/#start';
  const chosen = theme && appearance
    ? `<p class="chosen"><img src="${escapeHtml(theme.thumbnail)}" width="640" height="400" alt=""><span>Your site will start with <strong>${escapeHtml(chosenLabel(theme, appearance))}</strong>. You can change it any time. <a href="${escapeHtml(changeHref)}">Pick another look</a></span></p>`
    : `<p class="chosen"><span>You have not picked a look yet; your site starts with the standard one. <a href="${changeHref}">Pick a look first</a></span></p>`;
  return pageShell({
    title: 'Before you start | InkDrafts',
    description: 'What GitHub and Notion will ask when you create your InkDrafts site.',
    header: { start: false },
    body: `${STYLES}
<div class="connect">
<p class="progress"><span class="bar" aria-hidden="true"><span class="on"></span><span class="on"></span><span></span></span>Step 2 of 3</p>
<h1>Next, GitHub creates your website</h1>
<p class="lead">GitHub is the free service that will hold and show your site. You approve InkDrafts once, and it sets everything up for you. Here is what you will see there:</p>
<ol class="see">
<li>A page titled <strong>Install InkDrafts</strong>.</li>
<li>Leave <strong>${GITHUB_INSTALL_SCOPE}</strong> selected. Your site does not exist yet, so this is how InkDrafts can create it.</li>
<li>Click the green <span class="green">Install</span> button.</li>
</ol>
<div class="card tint">
<h2>No GitHub account yet?</h2>
<p><a href="${GITHUB_SIGNUP_URL}" target="_blank" rel="noopener">Create a free account<span class="visually-hidden"> (opens in a new tab)</span></a> first, about 2 minutes, then come back to this tab and continue. Your username becomes your web address: <strong>username.github.io</strong>, so choose one you would be happy to print on a card.</p>
</div>
<form class="go" method="get" action="/connect/github">
${hiddenFields(appearance)}
<button type="submit" class="primary cta">Continue to GitHub</button>
${chosen}
</form>
<div class="card">
<h2>Then Notion asks one thing</h2>
<p>Choose <strong>“${NOTION_TEMPLATE_CHOICE}”</strong>. That adds a ready-made workspace for your site, with a home page and an example post to replace with your own.</p>
</div>
<p class="fine">InkDrafts only reads the Notion pages you share and never changes them. <a href="/privacy">Privacy in plain words</a>.</p>
<p class="fine">Already started? <a href="/status">Continue where you left off</a>.</p>
</div>`,
  });
}

const CONNECT_PAGE_HEADERS = { frames: false, scripts: false, publicMaxAgeSeconds: 300 } as const;

/** Invalid or oversize choices fall back to "no look picked" rather than an
 * error: nothing here is worth stopping a signup for. */
export function connectPageResponse(request: Request): Response {
  const parsed = parseAppearanceParams(new URL(request.url).searchParams);
  const appearance = parsed.kind === 'ok' ? parsed.appearance : null;
  return new Response(connectPage(appearance), { status: 200, headers: pageHeaders(CONNECT_PAGE_HEADERS) });
}
