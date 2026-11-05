/**
 * The inkdrafts.com look shared by the landing page and the theme pages:
 * one paper ground, one ink accent, Petrona (same-origin, OFL) for display
 * and prose, the system sans for controls. Progress, status and error pages
 * take only `SITE_PALETTE`, so they match without loading the font.
 *
 * This module is a leaf (no catalog import), so every page shell can take
 * the masthead and footer from here: `siteHeaderHtml()` / `siteFooterHtml()`
 * plus `SITE_BASE_STYLES`.
 */

export const SITE_FONT_URL = '/assets/fonts/petrona-latin.woff2';

export const SITE_FONT_PRELOAD = `<link rel="preload" href="${SITE_FONT_URL}" as="font" type="font/woff2" crossorigin>`;

export const SITE_PALETTE = `
  :root {
    --bg: #f6f4ee; --fg: #1a1915; --muted: #5c584f; --accent: #283a8f; --accent-fg: #ffffff;
    --border: #d9d4c7; --surface: #eeebe3; --ok: #1f6b3a; --danger: #a8321f;
    --shadow-lift: 0 1px 2px rgb(26 25 21 / 0.06), 0 18px 40px -18px rgb(26 25 21 / 0.35);
    --shadow-hover: 0 16px 30px -20px rgb(26 25 21 / 0.45);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #131311; --fg: #ebe7de; --muted: #a6a195; --accent: #aebcf4; --accent-fg: #131311;
      --border: #36342f; --surface: #1d1c19; --ok: #74cf92; --danger: #ff8f78;
      --shadow-lift: 0 1px 2px rgb(0 0 0 / 0.3), 0 18px 40px -18px rgb(0 0 0 / 0.7);
      --shadow-hover: 0 16px 30px -20px rgb(0 0 0 / 0.8);
    }
  }
`;

const FONT_FACE = `
  @font-face {
    font-family: "Petrona";
    src: url("${SITE_FONT_URL}") format("woff2");
    font-weight: 300 800;
    font-display: swap;
  }
`;

/** For the progress, status and error pages: the palette plus serif headings. */
export const SITE_PAGE_ACCENTS = `${SITE_PALETTE}${FONT_FACE}
  h1, h2 { font-family: "Petrona", "Iowan Old Style", "Palatino Linotype", Georgia, serif; font-weight: 500; }
`;

export const SITE_BASE_STYLES = `${SITE_PALETTE}${FONT_FACE}  :root {
    --serif: "Petrona", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --wrap: 72rem;
    --gutter: clamp(1rem, 4vw, 2.5rem);
  }
  * { box-sizing: border-box; }
  html { color-scheme: light dark; -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 400 1.0625rem/1.6 var(--serif);
    overflow-wrap: break-word;
    text-rendering: optimizeLegibility;
  }
  h1, h2, h3 { font-family: var(--serif); font-weight: 500; line-height: 1.1; letter-spacing: -0.015em; text-wrap: balance; }
  p { text-wrap: pretty; }
  a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
  a:hover { text-decoration-thickness: 2px; }
  :focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  code { font: 0.88em/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace; background: var(--surface); padding: 0.1em 0.3em; border-radius: 2px; }
  ::selection { background: var(--accent); color: var(--accent-fg); }
  .skip-link { position: absolute; left: -9999px; top: 0; background: var(--accent); color: var(--accent-fg); padding: 0.75rem 1.25rem; z-index: 10; font-family: var(--sans); }
  .skip-link:focus { left: 0.5rem; top: 0.5rem; }
  /* Author display rules (button, .cta) would otherwise beat the UA's [hidden]. */
  [hidden] { display: none !important; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .wrap { max-width: var(--wrap); margin: 0 auto; padding: 0 var(--gutter); }
  .masthead { border-bottom: 1px solid var(--border); }
  .masthead .wrap { display: flex; align-items: center; gap: 0.25rem 1rem; min-height: 3.75rem; padding-block: 0.4rem; }
  .masthead nav { margin-left: auto; }
  .wordmark { font: 600 1.25rem/1 var(--serif); letter-spacing: -0.01em; color: var(--fg); text-decoration: none; display: inline-flex; align-items: center; min-height: 2.75rem; }
  .masthead nav ul, .site-foot nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0 0.25rem; }
  .masthead nav a, .site-foot nav a { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 0.6rem; font: 500 0.92rem/1.3 var(--sans); color: var(--fg); text-decoration: none; }
  .masthead nav a:hover, .site-foot nav a:hover { color: var(--accent); text-decoration: underline; }
  .masthead .start { margin-left: 0.25rem; min-height: 2.5rem; padding: 0.5rem 0.9rem; font-size: 0.9rem; }
  .masthead nav a.start, .masthead nav a.start:hover { color: var(--accent-fg); text-decoration: none; }
  @media (max-width: 47.99rem) {
    .masthead nav li:not(.keep) { display: none; }
    .masthead nav a { padding: 0 0.4rem; }
  }
  .site-foot { border-top: 1px solid var(--border); margin-top: 2rem; }
  .site-foot .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem 2rem; padding-block: 2rem 2.5rem; font: 0.875rem/1.6 var(--sans); color: var(--muted); }
  .site-foot p { margin: 0; max-width: 28rem; }
  .site-foot nav ul { margin-inline: -0.6rem; }
  .site-foot nav a { color: var(--muted); font-weight: 400; }
  .button, button, .cta {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 2.75rem;
    font: 600 0.95rem/1.2 var(--sans); padding: 0.7rem 1.2rem; border-radius: 2px; cursor: pointer; text-decoration: none;
    border: 1px solid var(--fg); background: transparent; color: var(--fg);
  }
  .button.primary, button.primary, .cta { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .button:hover, button:hover { background: var(--surface); }
  .cta:hover { text-decoration: none; }
  .button.primary:hover, button.primary:hover, .cta:hover { background: var(--accent); filter: brightness(1.12); }
  @media (prefers-reduced-motion: no-preference) {
    .button, button, .cta { transition: transform 160ms var(--ease-out), filter 160ms ease, background-color 160ms ease; }
    .button:active, button:active, .cta:active { transform: scale(0.97); }
  }
`;

/** The one sentence every footer repeats. */
export const SITE_TAGLINE = 'InkDrafts turns your Notion pages into a website you own.';

export interface SiteHeaderOptions {
  /** Hide the "Create my site" button (on the connect page, where it is the main action). */
  readonly start?: boolean;
  /** A signed-in owner: "Your site" replaces Sign in, and there is no start button. */
  readonly owner?: boolean;
}

/**
 * The masthead every public page shares: wordmark, Designs, How it works,
 * Questions, Sign in and a compact start button. Below 48rem only Sign in
 * and the button stay, so the header is one line on phones. The anchors
 * point at the landing page, which the landing itself resolves in place.
 */
export function siteHeaderHtml(options: SiteHeaderOptions = {}): string {
  const start = options.start === false || options.owner ? '' : '<li class="keep"><a class="cta start" href="/#start" data-start>Create my site</a></li>';
  const account = options.owner ? '<a href="/status">Your site</a>' : '<a href="/status">Sign in</a>';
  return `<header class="masthead">
<div class="wrap">
<a class="wordmark" href="/">InkDrafts</a>
<nav aria-label="Primary"><ul>
<li><a href="/themes">Designs</a></li>
<li><a href="/#how-it-works">How it works</a></li>
<li><a href="/#faq">Questions</a></li>
<li class="keep">${account}</li>
${start}
</ul></nav>
</div>
</header>`;
}

export function siteFooterHtml(): string {
  return `<footer class="site-foot">
<div class="wrap">
<p>${SITE_TAGLINE}</p>
<nav aria-label="Footer"><ul>
<li><a href="/themes">All designs</a></li>
<li><a href="/status">Sign in</a></li>
<li><a href="/support">Support</a></li>
<li><a href="/privacy">Privacy</a></li>
<li><a href="/terms">Terms</a></li>
<li><a href="/security">Security</a></li>
<li><a href="/acceptable-use">Acceptable use</a></li>
<li><a href="/leaving">Leaving InkDrafts</a></li>
<li><a href="https://github.com/OffConstruct/notiongit">See the code</a></li>
</ul></nav>
</div>
</footer>`;
}
