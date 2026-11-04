/**
 * The public marketing/onboarding page at `GET /`.
 *
 * Server-rendered from the theme catalog at module load, identical for every
 * visitor. Everything works with JavaScript disabled: the category filter is
 * CSS over radio inputs, and "Make it yours" is a plain GET form into
 * `/connect/github` with a theme picker and color-scheme pills. Same-origin
 * `/assets/landing.js` adds the live preview, the chosen theme's other
 * options (as more fields of the same form) and lets a gallery card pick its
 * theme; `/assets/preview-stage.js` renders the preview at desktop width.
 * Images and the font are same-origin; the only third-party requests are the
 * web fonts a theme preview loads inside its own iframe.
 *
 * GitHub-first onboarding is intentional: the Notion callback needs a
 * repository to write the sync workflow's secrets into (issue #46). The page
 * deliberately does not link the App install page directly: the GitHub App is
 * public but stays unadvertised from inkdrafts.com until the M5 launch issue
 * (`docs/github-app-runbook.md` "Registration status"), so the CTA goes
 * through `/connect/github`, which mints signed state first.
 */

import { SITE_BASE_STYLES, SITE_FONT_PRELOAD } from './site-styles';
import { defaultTheme, THEME_CATEGORIES, THEMES, type CatalogTheme } from './theme-catalog';
import {
  categoryLabel,
  CHOICE_STYLES,
  escapeHtml,
  PILL_LIMIT,
  PREVIEW_STAGE_SCRIPT,
  PREVIEW_STAGE_STYLES,
  previewStageHtml,
  scriptJson,
  themeOptionsHtml,
} from './theme-ui';

const SITE_URL = 'https://inkdrafts.com/';
export const LANDING_SCRIPT = '/assets/landing.js';
export const LANDING_SCRIPTS = [PREVIEW_STAGE_SCRIPT, LANDING_SCRIPT] as const;

/** Same for every visitor; it frames same-origin previews and runs one same-origin script. */
export const LANDING_PAGE_HEADERS = { frames: true, scripts: true, publicMaxAgeSeconds: 300 } as const;

const DESCRIPTION =
  'InkDrafts publishes a Notion workspace to a Jekyll site hosted free on your own GitHub Pages. You keep the repository and the Action that syncs it.';

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='3' fill='%23283a8f'/%3E%3Ctext x='16' y='22.5' font-family='Georgia,serif' font-size='17' font-weight='600' fill='%23ffffff' text-anchor='middle'%3EId%3C/text%3E%3C/svg%3E";

const HERO_THEMES = ['issue', 'press', 'anamorph'];

/** The landing gallery leads with one strong theme per category, then the
 * rest in catalog order; /themes stays alphabetical. Unknown ids are skipped. */
const LEADING_THEMES = ['issue', 'cathode', 'verso', 'lattice', 'keynote', 'specimen', 'atelier', 'halo', 'marquee', 'megaphone', 'signal'];

const STYLES = `${SITE_BASE_STYLES}${CHOICE_STYLES}${PREVIEW_STAGE_STYLES}
  section { padding-block: clamp(3rem, 6vw, 5rem); }
  section + section { border-top: 1px solid var(--border); }
  .section-head { display: grid; gap: 1rem 3rem; margin-bottom: clamp(2rem, 4vw, 3rem); }
  @media (min-width: 60rem) { .section-head { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); align-items: end; } }
  h2 { font-size: clamp(1.9rem, 4.2vw, 3rem); margin: 0; }
  .section-head p { margin: 0; color: var(--muted); max-width: 34rem; font-size: 1.125rem; }
  .fine { font: 0.85rem/1.55 var(--sans); color: var(--muted); }

  .hero { padding-block: clamp(2.5rem, 6vw, 5rem) clamp(3rem, 6vw, 5rem); }
  .hero-body { display: grid; gap: clamp(3rem, 6vw, 4rem); align-items: start; }
  @media (min-width: 60rem) { .hero-body { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  h1 { font-size: clamp(2.3rem, 7.4vw, 5.5rem); font-weight: 450; line-height: 1.02; letter-spacing: -0.03em; margin: 0 0 clamp(2rem, 4vw, 3rem); }
  h1 span { display: block; text-wrap: balance; }
  .lede { font-size: clamp(1.15rem, 1.9vw, 1.35rem); line-height: 1.5; max-width: 33rem; margin: 0 0 2.25rem; }
  .hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 1.75rem; }
  .cta { font-size: 1rem; padding: 0.95rem 1.5rem; }
  .text-link { font: 600 0.95rem/1.4 var(--sans); }
  .cta-note { margin: 1.5rem 0 0; max-width: 30rem; }
  .spread { position: relative; margin: 0; aspect-ratio: 5 / 4; }
  .spread img { position: absolute; width: 62%; height: auto; aspect-ratio: 8 / 5; display: block; border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lift); }
  .spread img:nth-child(1) { left: 0; top: 0; }
  .spread img:nth-child(2) { left: 19%; top: 25.8%; }
  .spread img:nth-child(3) { left: 38%; top: 51.6%; }
  @media (prefers-reduced-motion: no-preference) {
    .hero h1, .hero-copy, .spread img { animation: rise 700ms var(--ease-out) both; }
    .hero-copy { animation-delay: 60ms; }
    .spread img:nth-child(2) { animation-delay: 90ms; }
    .spread img:nth-child(3) { animation-delay: 180ms; }
    @keyframes rise { from { opacity: 0; transform: translateY(12px); } }
  }

  .filter { border: 0; margin: 0; padding: 0; min-width: 0; }
  .filter legend { font: 600 0.875rem/1.4 var(--sans); color: var(--muted); padding: 0; margin-bottom: 0.75rem; }
  .filter > input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
  .filter > label { display: inline-flex; align-items: baseline; gap: 0.4rem; margin: 0 0.35rem 0.5rem 0; padding: 0.45rem 0.85rem; border: 1px solid var(--border); border-radius: 2px; font: 500 0.875rem/1.3 var(--sans); cursor: pointer; }
  .filter > label span { color: var(--muted); font-size: 0.8em; font-variant-numeric: tabular-nums; }
  .filter > label:hover { border-color: var(--fg); }
  .filter > input:checked + label { background: var(--fg); border-color: var(--fg); color: var(--bg); }
  .filter > input:checked + label span { color: inherit; opacity: 0.7; }
  .filter > input:focus-visible { outline: 3px solid var(--accent); }
  .filter > input:focus-visible + label { outline: 3px solid var(--accent); outline-offset: 2px; }
  .gallery { list-style: none; margin: 2rem 0 0; padding: 0; display: grid; gap: 2.75rem 1.75rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr)); }
  ${THEME_CATEGORIES.map((category) => `#cat-${category.id}:checked ~ .gallery li:not([data-cat~="${category.id}"])`).join(',\n  ')} { display: none; }
  .gallery li { min-width: 0; }
  .gallery a { display: block; color: var(--fg); text-decoration: none; }
  .gallery img { display: block; width: 100%; height: auto; aspect-ratio: 8 / 5; border: 1px solid var(--border); background: var(--surface); }
  .gallery .name { display: block; margin-top: 0.9rem; font: 500 1.3rem/1.2 var(--serif); }
  .gallery a:hover .name { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
  .gallery .cats { margin: 0.15rem 0 0.35rem; font: 500 0.8rem/1.4 var(--sans); color: var(--muted); }
  .gallery .summary { margin: 0; font: 0.9rem/1.5 var(--sans); color: var(--muted); }
  @media (prefers-reduced-motion: no-preference) {
    .gallery img { transition: transform 220ms var(--ease-out), box-shadow 220ms var(--ease-out); }
    .gallery a:hover img { transform: translateY(-3px); box-shadow: var(--shadow-hover); }
  }
  @media (max-width: 39.99rem) {
    .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem 1rem; }
    .gallery .name { font-size: 1.1rem; margin-top: 0.6rem; }
    .gallery .cats { font-size: 0.75rem; }
    .gallery .summary { display: none; }
  }

  .studio { display: grid; gap: 1.75rem; }
  @media (min-width: 64rem) {
    .studio { grid-template-columns: minmax(0, 20rem) minmax(0, 1fr); grid-template-areas: "controls preview"; gap: 3rem; align-items: start; }
    .studio > .preview { grid-area: preview; }
    .studio > .controls { grid-area: controls; }
  }
  .preview { margin: 0; }
  .controls { display: grid; gap: 1.5rem; min-width: 0; }
  .controls fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  .controls legend, .controls label.head, .option.range > label { display: block; font: 600 0.875rem/1.4 var(--sans); color: var(--muted); padding: 0; margin-bottom: 0.6rem; }
  .controls select { font: 500 1rem/1.3 var(--sans); width: 100%; min-height: 2.75rem; padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 2px; background: var(--bg); color: var(--fg); }
  #options-slot { display: contents; }
  .more-options { border-top: 1px solid var(--border); padding-top: 1.25rem; }
  .more-options summary { font: 600 0.9rem/1.4 var(--sans); cursor: pointer; width: fit-content; }
  .more-options summary:hover { color: var(--accent); }
  .option-grid { display: grid; gap: 1.25rem; margin-top: 1.25rem; }
  .option.range { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0 0.75rem; }
  .option.range > label { grid-column: 1 / -1; }
  .option.range input { accent-color: var(--accent); margin: 0; }
  .option.range output { font: 0.85rem/1 var(--sans); font-variant-numeric: tabular-nums; color: var(--muted); }
  .studio-foot { display: grid; gap: 0.75rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
  .studio-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.25rem; }
  .studio-foot .fine { margin: 0; }

  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 2.5rem 3rem; counter-reset: step; }
  @media (min-width: 52rem) { .steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .steps li { counter-increment: step; border-top: 1px solid var(--fg); padding-top: 1.25rem; }
  .steps li::before { content: counter(step, decimal-leading-zero); display: block; font: 400 2.75rem/1 var(--serif); color: var(--accent); margin-bottom: 1.25rem; font-variant-numeric: lining-nums; }
  .steps h3 { font-size: 1.45rem; margin: 0 0 0.6rem; }
  .steps p { margin: 0; color: var(--muted); }

  .columns { display: grid; gap: 2.5rem 4rem; }
  @media (min-width: 60rem) { .columns { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  .columns h2 { margin-bottom: 1rem; }
  .points { list-style: none; margin: 1.5rem 0 0; padding: 0; }
  .points li { padding: 1rem 0; border-top: 1px solid var(--border); }
  .points li:last-child { border-bottom: 1px solid var(--border); }
  .repos { list-style: none; margin: 1.5rem 0 0; padding: 0; }
  .repos li { border-top: 1px solid var(--border); }
  .repos li:last-child { border-bottom: 1px solid var(--border); }
  .repos a { display: block; padding: 1rem 0; text-decoration: none; color: var(--fg); }
  .repos strong { font: 600 0.95rem/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--accent); }
  .repos a:hover strong { text-decoration: underline; }
  .repos span { display: block; color: var(--muted); font-size: 0.95rem; }
  .closing .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem 3rem; }
`;

function categoryNames(theme: CatalogTheme): string {
  return theme.categories.map((category) => categoryLabel(category)).join(' · ');
}

const CATEGORIES_IN_USE = THEME_CATEGORIES
  .map((category) => ({ ...category, count: THEMES.filter((theme) => theme.categories.includes(category.id)).length }))
  .filter((category) => category.count > 0);

const FILTER = [
  `<input type="radio" name="cat" id="cat-all" value="all" checked><label for="cat-all">All <span>${THEMES.length}</span></label>`,
  ...CATEGORIES_IN_USE.map((category) =>
    `<input type="radio" name="cat" id="cat-${category.id}" value="${category.id}"><label for="cat-${category.id}">${escapeHtml(category.label)} <span>${category.count}</span></label>`),
].join('\n');

const LANDING_ORDER = [
  ...LEADING_THEMES.map((id) => THEMES.find((theme) => theme.id === id)).filter((theme): theme is CatalogTheme => theme !== undefined),
  ...THEMES.filter((theme) => !LEADING_THEMES.includes(theme.id)),
];

const CARDS = LANDING_ORDER.map((theme) => `<li data-cat="${escapeHtml(theme.categories.join(' '))}"><a href="/themes/${theme.id}" data-pick="${theme.id}"><img src="${escapeHtml(theme.thumbnail)}" width="640" height="400" alt="" loading="lazy"><span class="name">${escapeHtml(theme.name)}</span></a><p class="cats">${escapeHtml(categoryNames(theme))}</p><p class="summary">${escapeHtml(theme.summary)}</p></li>`).join('\n');

const DEFAULT_THEME = defaultTheme();

const MODES = [
  ['', 'As designed'],
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['auto', 'Match system'],
].map(([value, label], index) => `<span class="choice"><input type="radio" name="t_mode" id="mode-${index}" value="${value}"${index === 0 ? ' checked' : ''}><label for="mode-${index}">${label}</label></span>`).join('\n');

const OPTION_ORDER: Record<string, number> = { select: 0, range: 1, boolean: 2 };

/** Every option but mode and accent, as compact tuples with string
 * defaults in the form's own encoding (booleans are on/off). Choices come
 * first and switches last, so the switches sit together. landing.js renders
 * them with the theme pages' controls: pills up to PILL_LIMIT options, then
 * a select. */
type OptionTuple = readonly (string | number | readonly (readonly string[])[])[];

function moreOptions(theme: CatalogTheme): OptionTuple[] {
  return theme.tweaks.flatMap((tweak): OptionTuple[] => {
    if (tweak.key === 'mode' || tweak.key === 'accent') return [];
    switch (tweak.type) {
      case 'select': return [['select', tweak.key, tweak.label, tweak.default, tweak.options.map((option) => [option.value, option.label])]];
      case 'font': return [['select', tweak.key, tweak.label, tweak.default, theme.fonts.map((font) => [font.value, font.label])]];
      case 'boolean': return [['boolean', tweak.key, tweak.label, tweak.default ? 'on' : 'off']];
      case 'range': return [['range', tweak.key, tweak.label, String(tweak.default), tweak.min, tweak.max, tweak.step, tweak.unit]];
      default: return [];
    }
  }).sort((left, right) => OPTION_ORDER[left[0] as string]! - OPTION_ORDER[right[0] as string]!);
}

/** What landing.js needs to offer each theme's options. */
const LANDING_DATA = scriptJson({
  pillLimit: PILL_LIMIT,
  themes: Object.fromEntries(THEMES.map((theme) => {
    const accent = theme.tweaks.find((tweak) => tweak.key === 'accent');
    return [theme.id, {
      name: theme.name,
      accent: accent?.type === 'color'
        // A single fixed preset is no choice; the theme pages skip it too.
        && (accent.presets.length > 1 || accent.custom)
        ? { label: accent.label, default: accent.default, presets: accent.presets.map((preset) => [preset.value, preset.label, preset.light]) }
        : null,
      more: moreOptions(theme),
    }];
  })),
});

const HERO_SPREAD = HERO_THEMES
  .map((id) => THEMES.find((theme) => theme.id === id))
  .filter((theme): theme is CatalogTheme => theme !== undefined)
  .map((theme) => `<img src="${escapeHtml(theme.thumbnail)}" width="640" height="400" alt="">`)
  .join('');

export const LANDING_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>InkDrafts</title>
<meta name="description" content="${DESCRIPTION}">
<link rel="canonical" href="${SITE_URL}">
<link rel="icon" href="${FAVICON}">
<meta name="theme-color" content="#f6f4ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131311" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:title" content="InkDrafts: Notion-powered publishing for GitHub Pages">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="${SITE_URL}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="InkDrafts: Notion-powered publishing for GitHub Pages">
<meta name="twitter:description" content="${DESCRIPTION}">
${SITE_FONT_PRELOAD}
<style>${STYLES}</style>
${LANDING_SCRIPTS.map((src) => `<script src="${src}" defer></script>`).join('\n')}
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
<header class="masthead">
  <div class="wrap">
    <a class="wordmark" href="/">InkDrafts</a>
    <nav aria-label="Primary">
      <ul>
        <li><a href="#themes">Themes</a></li>
        <li><a href="#how-it-works">How it works</a></li>
        <li><a href="#open-source">Open source</a></li>
        <li><a href="/status">Manage your site</a></li>
      </ul>
    </nav>
  </div>
</header>

<main id="main-content">
  <section class="hero" aria-labelledby="hero-heading">
    <div class="wrap">
      <h1 id="hero-heading"><span>Write in Notion.</span> <span>Publish a site you own.</span></h1>
      <div class="hero-body">
      <div class="hero-copy">
        <p class="lede">
          InkDrafts turns a Notion workspace into a website on your own free
          GitHub Pages. The repository is yours, so the site keeps working even
          if InkDrafts disappears.
        </p>
        <div class="hero-actions">
          <a class="cta" href="/connect/github">Connect GitHub to get started</a>
          <a class="text-link" href="#themes">Browse ${THEMES.length} themes</a>
        </div>
        <p class="cta-note fine">Free GitHub Pages hosting, and InkDrafts costs nothing to run. You’ll connect Notion in the next step.
          Before you connect, read the <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.</p>
      </div>
      <figure class="spread">${HERO_SPREAD}<figcaption class="visually-hidden">Three of the themes: Issue, Press and Anamorph.</figcaption></figure>
      </div>
    </div>
  </section>

  <section id="themes" aria-labelledby="themes-heading">
    <div class="wrap">
      <div class="section-head">
        <h2 id="themes-heading">${THEMES.length} themes, each a complete site</h2>
        <p>Every theme ships inside your repository. Switch whenever you like; your writing stays where it is, in Notion.</p>
      </div>
      <fieldset class="filter">
        <legend>Show themes for</legend>
${FILTER}
        <ul class="gallery">
${CARDS}
        </ul>
      </fieldset>
    </div>
  </section>

  <section id="customize" aria-labelledby="customize-heading">
    <div class="wrap">
      <div class="section-head">
        <h2 id="customize-heading">Make it yours</h2>
        <p>Pick a theme and a color scheme and see it with sample writing, then start with that choice. It is saved in your repository’s <code>_config.yml</code>, so you can change it later.</p>
      </div>
      <form class="studio" method="get" action="/connect/github" data-landing-customizer>
        <div class="preview preview-pin">
          ${previewStageHtml(DEFAULT_THEME.preview, 'Preview of the chosen theme with sample content')}
          <p class="visually-hidden" id="preview-status" aria-live="polite"></p>
        </div>
        <div class="controls">
          <div>
            <label class="head" for="theme-pick">Theme</label>
            <select id="theme-pick" name="theme">${themeOptionsHtml(THEMES, DEFAULT_THEME.id)}</select>
          </div>
          <fieldset>
            <legend>Color scheme</legend>
            <div class="choices">
${MODES}
            </div>
          </fieldset>
          <div id="options-slot"></div>
          <div class="studio-foot">
            <div class="studio-actions">
              <button type="submit" class="primary"><span>Start with <span data-theme-name>${escapeHtml(DEFAULT_THEME.name)}</span></span></button>
              <button type="submit" formaction="/themes" data-js-hidden>See every option</button>
              <a class="text-link" href="/themes/${DEFAULT_THEME.id}" data-theme-page hidden>Open <span data-theme-name>${escapeHtml(DEFAULT_THEME.name)}</span>’s page</a>
            </div>
            <p class="fine">Next, GitHub asks you to approve the InkDrafts app for your account.</p>
            <p class="fine">The preview uses sample content and loads each theme’s web fonts from Google Fonts, as your site would.<noscript> Without JavaScript it shows Classic; See every option previews the theme you picked.</noscript></p>
          </div>
        </div>
      </form>
    </div>
  </section>

  <section id="how-it-works" aria-labelledby="how-heading">
    <div class="wrap">
      <div class="section-head">
        <h2 id="how-heading">How it works</h2>
        <p>Three steps. After the first sync, InkDrafts is no longer part of the loop.</p>
      </div>
      <ol class="steps">
        <li>
          <h3>Connect GitHub</h3>
          <p>
            Pick a theme, then install the InkDrafts GitHub App to create a
            repository in your account and enable free GitHub Pages hosting.
            The repository is yours from the moment it is created.
          </p>
        </li>
        <li>
          <h3>Connect Notion</h3>
          <p>
            Authorize InkDrafts to read the Notion template you duplicated, so
            it can find your Pages and Posts databases and store the encrypted
            secrets your repository’s own sync Action needs. It only requests
            read access and never edits your Notion content.
          </p>
        </li>
        <li>
          <h3>Your site goes live</h3>
          <p>
            InkDrafts triggers the first sync and waits for GitHub Pages to
            publish it. After that, a scheduled Action inside your own
            repository keeps the site in sync.
          </p>
        </li>
      </ol>
    </div>
  </section>

  <section id="privacy-security" aria-labelledby="privacy-heading">
    <div class="wrap columns">
      <div>
        <h2 id="privacy-heading">Privacy &amp; security</h2>
        <ul class="points">
          <li>
            Notion and GitHub access tokens are used once, in memory, to
            complete each step, then discarded: never stored, logged, or
            included in error reports.
          </li>
          <li>
            The secrets your repository’s Action does need are sealed with
            libsodium encryption before GitHub ever stores them.
          </li>
          <li>
            Every setup step is safe to retry: nothing is duplicated if a step
            is interrupted partway through.
          </li>
          <li>
            Your site loads web fonts only if its theme uses them, and every
            theme has a switch to turn them off.
          </li>
        </ul>
        <p class="fine">
          The full details are in the <a href="/privacy">Privacy Policy</a> and
          the <a href="/security">Security and Data Handling</a> page.
        </p>
      </div>
      <div id="open-source">
        <h2 id="open-source-heading">Built in the open</h2>
        <p>
          InkDrafts is three public repositories. Inspect exactly what runs in
          your account before you connect anything.
        </p>
        <ul class="repos" aria-labelledby="open-source-heading">
          <li>
            <a href="https://github.com/OffConstruct/notiongit"><strong>notiongit</strong>
              <span>This onboarding service. It connects Notion and GitHub and provisions your site.</span>
            </a>
          </li>
          <li>
            <a href="https://github.com/OffConstruct/notiongit-template"><strong>notiongit-template</strong>
              <span>The Jekyll site template your repository is generated from, with every theme.</span>
            </a>
          </li>
          <li>
            <a href="https://github.com/OffConstruct/notiongit-sync"><strong>notiongit-sync</strong>
              <span>The sync engine your repository’s own GitHub Action runs.</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  </section>

  <section class="closing" aria-labelledby="closing-heading">
    <div class="wrap">
      <h2 id="closing-heading">Your site, in your repository.</h2>
      <a class="cta" href="/connect/github">Connect GitHub to get started</a>
    </div>
  </section>
</main>

<footer class="site-foot">
  <div class="wrap">
    <p>InkDrafts turns a Notion workspace into a GitHub Pages site you own.</p>
    <nav aria-label="Footer">
      <ul>
        <li><a href="/themes">Themes</a></li>
        <li><a href="#how-it-works">How it works</a></li>
        <li><a href="#privacy-security">Privacy &amp; security</a></li>
        <li><a href="#open-source">Open source</a></li>
        <li><a href="/privacy">Privacy Policy</a></li>
        <li><a href="/terms">Terms of Service</a></li>
        <li><a href="/security">Security</a></li>
        <li><a href="/acceptable-use">Acceptable use</a></li>
        <li><a href="/support">Support</a></li>
        <li><a href="/leaving">Leaving InkDrafts</a></li>
      </ul>
    </nav>
  </div>
</footer>
<script type="application/json" id="landing-data">${LANDING_DATA}</script>
</body>
</html>`;
