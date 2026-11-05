/**
 * The public marketing/onboarding page at `GET /`.
 *
 * Server-rendered from the theme catalog at module load, identical for every
 * visitor. Written for people who do not know what GitHub or a repository
 * is: the page leads with the outcome, names GitHub once on the first screen
 * (in "What you need", with what it does for them) and never says
 * "repository". Order: hero, studio ("Step 1 of 3"), how it works, how you
 * update it, every design, yours to keep, FAQ, closing band.
 *
 * Everything works with JavaScript disabled: the audience filter is CSS over
 * radio inputs, and the studio is a plain GET form into `/connect` (the
 * "before you start" screen) with six featured designs as radios and the
 * color-scheme pills. Same-origin `/assets/landing.js` adds the live preview,
 * the chosen theme's other options (as more fields of the same form), the
 * "Your name" preview field, carries the choice onto every CTA, restores a
 * returning visitor's choice and lets a gallery card pick its theme;
 * `/assets/preview-stage.js` renders the preview at device width. Images and
 * the font are same-origin; the only third-party requests are the web fonts
 * a theme preview loads inside its own iframe.
 *
 * GitHub-first onboarding is intentional: the Notion callback needs a
 * repository to write the sync workflow's secrets into (issue #46). The page
 * deliberately does not link the App install page directly: the GitHub App is
 * public but stays unadvertised from inkdrafts.com until the M5 launch issue
 * (`docs/github-app-runbook.md` "Registration status"), so the CTA goes
 * through `/connect` and then `/connect/github`, which mints signed state.
 */

import { CONNECT_PATH, GITHUB_INSTALL_SCOPE, NOTION_TEMPLATE_CHOICE } from './connect-page';
import { SAMPLE_NAME } from './preview-render';
import { SITE_BASE_STYLES, SITE_FONT_PRELOAD, siteFooterHtml, siteHeaderHtml } from './site-styles';
import { NOTION_WORDS, UPDATE_WAIT, UPLOAD_LIMIT } from './notion-words';
import { findTheme, THEMES, type CatalogTheme } from './theme-catalog';
import {
  audienceLine,
  CHOICE_STYLES,
  escapeHtml,
  FEATURED_THEMES,
  galleryCardHtml,
  galleryOrder,
  galleryRadioFilterHtml,
  GALLERY_STYLES,
  PILL_LIMIT,
  PREVIEW_STAGE_SCRIPT,
  PREVIEW_STAGE_STYLES,
  previewStageHtml,
  SCHEME_HELP,
  schemeChoices,
  schemeDefault,
  scriptJson,
  thumbnailImgHtml,
} from './theme-ui';

const SITE_URL = 'https://inkdrafts.com/';
export const LANDING_SCRIPT = '/assets/landing.js';
export const LANDING_SCRIPTS = [PREVIEW_STAGE_SCRIPT, LANDING_SCRIPT] as const;
export const OG_IMAGE = '/assets/og-1200x630.png';

/** Same for every visitor; it frames same-origin previews and runs one same-origin script. */
export const LANDING_PAGE_HEADERS = { frames: true, scripts: true, publicMaxAgeSeconds: 300 } as const;

const TITLE = 'InkDrafts: your own website, written in Notion';
const DESCRIPTION =
  'Make a personal website without code. Pick a design, write in Notion, and InkDrafts publishes it. Free, and the site stays yours.';
const SOCIAL_TITLE = 'Your own website, written in Notion';
const SOCIAL_DESCRIPTION = 'Pick a design, write in Notion, and it is on the web. Free, no code, yours to keep.';

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='3' fill='%23283a8f'/%3E%3Ctext x='16' y='22.5' font-family='Georgia,serif' font-size='17' font-weight='600' fill='%23ffffff' text-anchor='middle'%3EId%3C/text%3E%3C/svg%3E";

/** Sites a non-technical visitor recognizes: a painter with a shop, a
 * musician with dates, a photographer's portfolio. */
const HERO_THEMES = ['atelier', 'halo', 'verso'];

/** The studio opens on a rich look, not the sparsest; Classic stays the
 * catalog default for sites that never chose. */
export const LANDING_DEFAULT_THEME_ID = 'issue';
const DEFAULT_THEME = findTheme(LANDING_DEFAULT_THEME_ID) ?? THEMES[0]!;

const UPDATE_BUTTON = 'Update my site now';

const STYLES = `${SITE_BASE_STYLES}${CHOICE_STYLES}${PREVIEW_STAGE_STYLES}${GALLERY_STYLES}
  section { padding-block: clamp(3rem, 6vw, 5rem); }
  section + section { border-top: 1px solid var(--border); }
  .section-head { display: grid; gap: 0.75rem; margin-bottom: clamp(2rem, 4vw, 3rem); max-width: 46rem; }
  .eyebrow { font: 600 0.8rem/1.3 var(--sans); letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin: 0; }
  h2 { font-size: clamp(1.9rem, 4.2vw, 3rem); margin: 0; }
  .section-head p { margin: 0; color: var(--muted); max-width: 36rem; font-size: 1.125rem; }
  .fine { font: 0.85rem/1.55 var(--sans); color: var(--muted); margin: 0; }
  .text-link { font: 600 0.95rem/1.4 var(--sans); display: inline-flex; align-items: center; min-height: 2.75rem; }
  .arrow { display: inline-block; transition: transform 160ms var(--ease-out); }
  .cta:hover .arrow { transform: translateX(3px); }

  .hero { padding-block: clamp(2.25rem, 6vw, 5rem) clamp(3rem, 6vw, 5rem); }
  .hero .wrap { display: grid; gap: clamp(2.5rem, 5vw, 4rem); align-items: center; }
  @media (min-width: 60rem) { .hero .wrap { grid-template-columns: minmax(0, 11fr) minmax(0, 10fr); } }
  h1 { font-size: clamp(2.4rem, 7vw, 5.25rem); font-weight: 450; line-height: 1.02; letter-spacing: -0.03em; margin: 0 0 1.5rem; text-wrap: balance; }
  h1 em { font-style: italic; color: var(--accent); }
  .lede { font-size: clamp(1.15rem, 1.8vw, 1.35rem); line-height: 1.5; max-width: 32rem; margin: 0 0 2rem; }
  .hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.9rem 1.5rem; }
  .hero-actions .cta { font-size: 1.05rem; padding: 1rem 1.5rem; }
  @media (max-width: 39.99rem) { .hero-actions .cta { width: 100%; } }
  .needs { list-style: none; margin: 2.25rem 0 0; padding: 1.1rem 0 0; border-top: 1px solid var(--border); display: grid; gap: 0.7rem 1.5rem; grid-template-columns: repeat(2, minmax(0, 1fr)); font: 0.92rem/1.45 var(--sans); color: var(--muted); max-width: 34rem; }
  .needs-title { grid-column: 1 / -1; font-weight: 600; color: var(--fg); }
  .needs li:not(.needs-title) { position: relative; padding-left: 1.05rem; }
  .needs li:not(.needs-title)::before { content: ""; position: absolute; left: 0; top: 0.45em; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--ok); }
  .needs a { color: inherit; }
  .resume { margin: 1.25rem 0 0; font: 0.9rem/1.5 var(--sans); color: var(--muted); }
  .spread { position: relative; margin: 0; aspect-ratio: 5 / 4; }
  .shot { position: absolute; width: 64%; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-lift); }
  .shot img { display: block; width: 100%; height: auto; aspect-ratio: 8 / 5; }
  .shot:nth-child(1) { left: 0; top: 2%; }
  .shot:nth-child(2) { left: 18%; top: 27%; }
  .shot:nth-child(3) { left: 36%; top: 52%; }
  .bar { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.55rem; border-bottom: 1px solid var(--border); background: var(--bg); font: 500 0.7rem/1 var(--sans); color: var(--muted); }
  .bar i { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--border); }
  .bar b { margin-left: 0.35rem; font-weight: 500; padding: 0.22rem 0.55rem; background: var(--surface); border-radius: 99px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (prefers-reduced-motion: no-preference) {
    .hero h1, .hero .lede, .hero-actions, .shot { animation: rise 700ms var(--ease-out) both; }
    .hero .lede { animation-delay: 50ms; } .hero-actions { animation-delay: 100ms; }
    .shot:nth-child(2) { animation-delay: 120ms; } .shot:nth-child(3) { animation-delay: 220ms; }
    @keyframes rise { from { opacity: 0; transform: translateY(12px); } }
  }

  .studio { display: grid; gap: 2rem; counter-reset: step; }
  @media (min-width: 64rem) {
    .studio { grid-template-columns: minmax(0, 22rem) minmax(0, 1fr); gap: 3.5rem; align-items: start; }
    .studio > .preview { grid-area: 1 / 2; }
  }
  /* One column: the design picker, then the preview, then the rest. */
  @media (max-width: 63.99rem) {
    .studio > .controls { display: contents; }
    .controls > fieldset:first-child { order: -2; }
    .studio > .preview { order: -1; }
  }
  .controls { display: grid; gap: 1.75rem; min-width: 0; }
  .controls fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  .step-label { display: flex; align-items: baseline; gap: 0.6rem; font: 600 0.95rem/1.3 var(--sans); margin: 0 0 0.75rem; padding: 0; color: var(--fg); counter-increment: step; }
  .step-label .n::before { content: counter(step); }
  .step-label .n { display: inline-grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--fg); color: var(--bg); font-size: 0.78rem; flex: none; transform: translateY(0.1rem); }
  .step-label small { font-weight: 400; color: var(--muted); font-size: 0.85rem; }
  .picks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.6rem; }
  .pick { position: relative; display: grid; gap: 0.3rem; cursor: pointer; font: 500 0.85rem/1.2 var(--sans); }
  .pick input { position: absolute; opacity: 0; inset: 0; margin: 0; }
  .pick img { width: 100%; height: auto; aspect-ratio: 8 / 5; display: block; border: 1px solid var(--border); background: var(--surface); outline: 2px solid transparent; outline-offset: 2px; }
  .pick input:checked + img { outline-color: var(--fg); }
  .pick input:checked ~ .pick-name { font-weight: 700; }
  .pick input:checked ~ .pick-name::after { content: " ✓"; color: var(--ok); }
  .pick input:focus-visible + img { outline: 3px solid var(--accent); }
  .pick .pick-for { font-weight: 400; font-size: 0.75rem; color: var(--muted); }
  @media (prefers-reduced-motion: no-preference) { .pick img { transition: outline-color 160ms, transform 200ms var(--ease-out); } .pick:hover img { transform: translateY(-2px); } }
  .picks-more { margin: 0.8rem 0 0; font: 0.9rem/1.4 var(--sans); }
  .picked-other { margin: 0.6rem 0 0; font: 600 0.9rem/1.4 var(--sans); }
  .field input[type="text"] { width: 100%; min-height: 2.9rem; padding: 0.6rem 0.8rem; font: 1rem/1.3 var(--sans); color: var(--fg); background: var(--bg); border: 1px solid var(--border); border-radius: 2px; }
  .field input[type="text"]:focus { border-color: var(--fg); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); }
  .field .fine { margin-top: 0.45rem; }
  .controls .hint { margin-bottom: 0.9rem; }
  #options-slot { display: contents; }
  .option legend, .option > label.head { display: block; font: 600 0.875rem/1.4 var(--sans); color: var(--muted); padding: 0; margin-bottom: 0.6rem; }
  .option select { font: 500 1rem/1.3 var(--sans); width: 100%; min-height: 2.75rem; padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 2px; background: var(--bg); color: var(--fg); }
  .fine-tune { border-top: 1px solid var(--border); padding-top: 0.25rem; font-family: var(--sans); }
  .fine-tune summary { display: flex; align-items: center; gap: 0.5rem; min-height: 2.75rem; font: 600 0.9rem/1.4 var(--sans); cursor: pointer; width: fit-content; }
  .fine-tune summary small { font-weight: 400; color: var(--muted); font-size: 0.85rem; }
  .fine-tune summary:hover { color: var(--accent); }
  .peek { position: fixed; z-index: 6; left: 50%; top: 0.75rem; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.75rem; padding: 0 1.1rem; border-radius: 99px; background: var(--fg); color: var(--bg); font: 600 0.9rem/1 var(--sans); text-decoration: none; box-shadow: var(--shadow-lift); }
  .option-grid { display: grid; gap: 1.25rem; padding: 0.5rem 0 0.25rem; }
  .option.range { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0 0.75rem; }
  .option.range > label { grid-column: 1 / -1; }
  .option.range input { accent-color: var(--accent); margin: 0; }
  .option.range output { font: 0.85rem/1 var(--sans); font-variant-numeric: tabular-nums; color: var(--muted); }
  .go { display: grid; gap: 0.8rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
  .go .cta { width: 100%; font-size: 1.05rem; min-height: 3.25rem; }
  .go-title { font: 600 0.86rem/1.4 var(--sans); margin: 0.2rem 0 0; }
  .go ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.3rem; font: 0.86rem/1.45 var(--sans); color: var(--muted); counter-reset: next; }
  .go ol li { counter-increment: next; display: flex; gap: 0.5rem; }
  .go ol li::before { content: counter(next) "."; font-weight: 600; color: var(--fg); min-width: 1rem; }
  .cta-bar { display: none; }
  @media (max-width: 63.99rem) {
    .go > .cta { display: none; }
    .cta-bar { position: sticky; bottom: 0; z-index: 3; display: flex; align-items: center; gap: 0.75rem; margin: 0 calc(-1 * var(--gutter)); padding: 0.75rem var(--gutter); background: var(--bg); border-top: 1px solid var(--border); font: 600 0.85rem/1.3 var(--sans); color: var(--muted); }
    .cta-bar .cta { flex: 1; min-height: 3rem; }
  }

  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 2.25rem 2rem; counter-reset: how; }
  @media (min-width: 52rem) { .steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .steps li { counter-increment: how; border-top: 2px solid var(--fg); padding-top: 1.1rem; }
  .steps li::before { content: counter(how); display: block; font: 400 2.6rem/1 var(--serif); color: var(--accent); margin-bottom: 0.9rem; font-variant-numeric: lining-nums; }
  .steps h3 { font-size: 1.35rem; margin: 0 0 0.5rem; }
  .steps p { margin: 0 0 0.6rem; color: var(--muted); font-size: 1rem; }
  .steps .see { font: 0.9rem/1.5 var(--sans); color: var(--fg); margin: 0; }
  .steps .see strong { font-weight: 600; }
  .steps .time { display: block; margin-top: 0.6rem; font: 600 0.8rem/1.3 var(--sans); color: var(--ok); }
  .result { margin: 2rem 0 0; font-size: 1.15rem; max-width: 40rem; }
  .gloss { margin-top: 2.5rem; display: grid; gap: 1rem; padding: 1.25rem 1.4rem; background: var(--surface); border-radius: 6px; font: 0.95rem/1.55 var(--sans); }
  @media (min-width: 52rem) { .gloss { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem 2.5rem; } }
  .gloss p { margin: 0; }

  .update { display: grid; gap: 1.5rem; align-items: center; }
  @media (min-width: 60rem) { .update { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 2rem; } }
  .mock { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; box-shadow: var(--shadow-lift); overflow: hidden; font-family: var(--sans); }
  .mock-head { padding: 0.55rem 0.8rem; border-bottom: 1px solid var(--border); font: 600 0.75rem/1 var(--sans); color: var(--muted); }
  .mock-body { padding: 1.2rem 1.4rem 1.4rem; }
  .n-title { font: 700 1.45rem/1.2 var(--sans); margin: 0 0 0.9rem; color: var(--fg); }
  .n-props { display: grid; grid-template-columns: 7rem 1fr; gap: 0.45rem 0.75rem; font-size: 0.85rem; margin-bottom: 1rem; color: var(--muted); }
  .n-props b { font-weight: 500; color: var(--fg); }
  .pill-pub { display: inline-block; padding: 0.1rem 0.6rem; border-radius: 99px; background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); font-weight: 600; }
  .n-text { font-size: 0.9rem; line-height: 1.55; color: var(--fg); margin: 0; }
  .s-body { padding: 1.3rem 1.5rem 1.6rem; background: #f4efe4; color: #1c1a17; }
  .s-kicker { font: 600 0.68rem/1 var(--sans); letter-spacing: 0.1em; text-transform: uppercase; color: #a8321f; margin: 0 0 0.6rem; }
  .s-title { font: 500 1.75rem/1.1 var(--serif); margin: 0 0 0.5rem; }
  .s-meta { font: 0.75rem/1.3 var(--sans); color: #6b655a; margin: 0 0 0.8rem; }
  .s-text { font: 0.95rem/1.55 var(--serif); margin: 0; }
  .update-arrow { display: grid; justify-items: center; gap: 0.4rem; text-align: center; font: 600 0.85rem/1.35 var(--sans); color: var(--muted); }
  .update-arrow svg { width: 3rem; height: 3rem; color: var(--accent); }
  @media (max-width: 59.99rem) { .update-arrow svg { transform: rotate(90deg); } }
  .update-notes { list-style: none; margin: 2.25rem 0 0; padding: 0; display: grid; gap: 1.25rem 2rem; }
  @media (min-width: 52rem) { .update-notes { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .update-notes li { font: 0.95rem/1.55 var(--sans); color: var(--muted); }
  .update-notes strong { display: block; color: var(--fg); font: 500 1.15rem/1.3 var(--serif); margin-bottom: 0.25rem; }

  .trust { display: grid; gap: 2rem 3rem; }
  @media (min-width: 52rem) { .trust { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .trust h3 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  .trust p { margin: 0 0 0.4rem; color: var(--muted); font-size: 1rem; }
  .trust .text-link { font-size: 0.9rem; }
  .trust svg { width: 2rem; height: 2rem; color: var(--accent); margin-bottom: 0.75rem; }

  #faq .wrap { display: grid; gap: 2rem 4rem; }
  @media (min-width: 60rem) { #faq .wrap { grid-template-columns: minmax(0, 4fr) minmax(0, 7fr); } #faq .section-head { position: sticky; top: 1.5rem; align-self: start; } }
  .faq { border-top: 1px solid var(--border); }
  .faq details { border-bottom: 1px solid var(--border); }
  .faq summary { display: flex; justify-content: space-between; align-items: center; gap: 1rem; min-height: 3.5rem; padding: 0.9rem 0; font: 500 1.2rem/1.3 var(--serif); cursor: pointer; list-style: none; }
  .faq summary::-webkit-details-marker { display: none; }
  .faq summary::after { content: "+"; font: 400 1.5rem/1 var(--sans); color: var(--accent); flex: none; }
  .faq details[open] summary::after { content: "−"; }
  .faq .a { padding: 0 0 1.25rem; font: 0.98rem/1.6 var(--sans); color: var(--muted); max-width: 40rem; }
  .faq .a p { margin: 0 0 0.6rem; }

  .closing { background: var(--accent); color: var(--accent-fg); }
  .closing h2 { color: var(--accent-fg); font-size: clamp(2.2rem, 5.5vw, 3.8rem); margin-bottom: 1rem; }
  .closing .wrap { display: grid; gap: 2rem 4rem; align-items: end; }
  @media (min-width: 60rem) { .closing .wrap { grid-template-columns: minmax(0, 1fr) minmax(0, 24rem); } }
  .closing .lede { color: var(--accent-fg); opacity: 0.88; margin-bottom: 0; }
  .closing .cta { background: var(--bg); color: var(--fg); border-color: var(--bg); width: 100%; font-size: 1.05rem; min-height: 3.25rem; }
  .closing .cta:hover { filter: none; background: var(--surface); }
  .closing ol { margin: 1.25rem 0 0; padding: 0 0 0 1.2rem; font: 0.9rem/1.6 var(--sans); opacity: 0.88; }
  .closing .resume { color: var(--accent-fg); opacity: 0.88; }
  .closing a:not(.cta) { color: var(--accent-fg); }
`;

const ORDERED = galleryOrder(THEMES);

const CARDS = ORDERED.map((theme, index) => galleryCardHtml(theme, { href: `/themes/${theme.id}`, index, pick: true })).join('\n');

const FEATURED = FEATURED_THEMES
  .map((id) => findTheme(id))
  .filter((theme): theme is CatalogTheme => theme !== null)
  .map((theme) => `<label class="pick"><input type="radio" name="theme" id="pick-${theme.id}" value="${theme.id}"${theme.id === DEFAULT_THEME.id ? ' checked' : ''}>${thumbnailImgHtml(theme, '(min-width: 64rem) 7rem, 31vw')}<span class="pick-name">${escapeHtml(theme.name)}</span><span class="pick-for">${escapeHtml(audienceLine(theme))}</span></label>`)
  .join('\n');

/** The default theme's scheme pills, for the no-JS form; landing.js rebuilds
 * them for whichever theme is chosen, from the same catalog data. */
const SCHEME_PILLS = schemeChoices(DEFAULT_THEME).map((choice, index) =>
  `<span class="choice"><input type="radio" name="t_mode" id="mode-${index}" value="${choice.value}"${choice.value === schemeDefault(DEFAULT_THEME) ? ' checked' : ''}><label for="mode-${index}">${choice.label}</label></span>`).join('\n');

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
export const LANDING_DATA = {
  pillLimit: PILL_LIMIT,
  connect: CONNECT_PATH,
  sampleName: SAMPLE_NAME,
  featured: FEATURED_THEMES.filter((id) => findTheme(id) !== null),
  themes: Object.fromEntries(THEMES.map((theme) => {
    const accent = theme.tweaks.find((tweak) => tweak.key === 'accent');
    return [theme.id, {
      name: theme.name,
      summary: theme.summary,
      modes: schemeChoices(theme).map((choice) => [choice.value, choice.label]),
      mode: schemeDefault(theme),
      accent: accent?.type === 'color'
        // A single fixed preset is no choice; the theme pages skip it too.
        && (accent.presets.length > 1 || accent.custom)
        ? { label: accent.label, default: accent.default, custom: accent.custom, presets: accent.presets.map((preset) => [preset.value, preset.label, preset.light, preset.dark]) }
        : null,
      more: moreOptions(theme),
    }];
  })),
};

const HERO_SPREAD = HERO_THEMES
  .map((id) => findTheme(id))
  .filter((theme): theme is CatalogTheme => theme !== null)
  .map((theme) => `<div class="shot"><div class="bar"><i></i><i></i><i></i><b>rowanvale.github.io</b></div>${thumbnailImgHtml(theme, '(min-width: 60rem) 20rem, 60vw')}</div>`)
  .join('');

const HERO_NAMES = HERO_THEMES.map((id) => findTheme(id)?.name).filter(Boolean).join(', ');

function faq(id: string, question: string, answer: string, open = false): string {
  return `<details${id ? ` id="${id}"` : ''}${open ? ' open' : ''}><summary>${question}</summary><div class="a">${answer}</div></details>`;
}

const FAQ = [
  faq('faq-free', 'Is it really free?', '<p>Yes. InkDrafts is free, GitHub hosts your website for free, and Notion’s free plan is enough. You never enter a card.</p>', true),
  faq('faq-code', 'Do I need to know how to code?', '<p>No. You pick a design here and write in Notion. InkDrafts does the technical setup and keeps your site in step with Notion.</p>'),
  faq('faq-github', 'What is GitHub, and do I need an account?', `<p>GitHub is a free service that stores and shows websites. Your site lives in your own GitHub account, which is why it stays yours.</p><p>No account yet? You can create a free one on the way, in about 2 minutes. Your username becomes your web address, so choose one you would be happy to print on a card. You will not need to use GitHub after setup.</p>`),
  faq('faq-address', 'What will my web address be?', '<p><strong>yourname.github.io</strong>, where “yourname” is the username you pick on GitHub.</p>'),
  faq('faq-domain', 'Can I use my own domain, like yourname.com?', '<p>Yes. Once your site is live, you can connect a domain you own; your setup page links to GitHub’s step-by-step guide. The domain itself is bought from a domain company, usually around $10 to 15 a year.</p>'),
  faq('faq-update', 'How do I change my site later?', `<p>Open Notion. Edit a page, or add one, and set its Status to Published. Your site updates on its own, ${UPDATE_WAIT}, or right away if you press “${UPDATE_BUTTON}” in your site settings.</p>`),
  faq('faq-design', 'Can I change the design later?', '<p>Any time, as often as you like, from your site settings. Your writing stays in Notion, so a new design never loses anything.</p>'),
  faq('faq-private', 'Is my Notion private?', '<p>Yes. InkDrafts only reads the pages you share with it, and only pages whose Status is Published go on the site. Notion’s approval screen also mentions inserting content; InkDrafts never changes anything in your Notion. Everything else in your Notion stays yours alone.</p>'),
  faq('faq-photos', 'Can I add photos?', NOTION_WORDS.uploadsKept
    ? `<p>Yes. Drag a photo into your Notion page, or paste it. InkDrafts copies it to your site so it keeps working. Up to ${UPLOAD_LIMIT} each.</p>`
    : '<p>Yes. Paste a picture’s web address into your Notion page and it appears on your site. Dragging photos straight into Notion is coming soon.</p>'),
  faq('faq-leave', 'What if I stop using InkDrafts?', '<p>Your site stays online, at the same address, and keeps updating from Notion. To remove it, delete it from your GitHub account. <a href="/leaving">Leaving InkDrafts</a> walks you through it.</p>'),
].join('\n');

const THEME_NAME = `<span data-theme-name>${escapeHtml(DEFAULT_THEME.name)}</span>`;
const CARRY_HREF = `${CONNECT_PATH}?theme=${DEFAULT_THEME.id}`;

export const LANDING_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}">
<link rel="canonical" href="${SITE_URL}">
<link rel="icon" href="${FAVICON}">
<meta name="theme-color" content="#f6f4ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131311" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="InkDrafts">
<meta property="og:title" content="${SOCIAL_TITLE}">
<meta property="og:description" content="${SOCIAL_DESCRIPTION}">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL.slice(0, -1)}${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Three personal websites made with InkDrafts, next to the Notion pages they were written in.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${SOCIAL_TITLE}">
<meta name="twitter:description" content="${SOCIAL_DESCRIPTION}">
<meta name="twitter:image" content="${SITE_URL.slice(0, -1)}${OG_IMAGE}">
${SITE_FONT_PRELOAD}
<style>${STYLES}</style>
${LANDING_SCRIPTS.map((src) => `<script src="${src}" defer></script>`).join('\n')}
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
${siteHeaderHtml()}

<main id="main-content">
  <section class="hero" aria-labelledby="hero-heading">
    <div class="wrap">
      <div class="hero-copy">
        <h1 id="hero-heading">Your own website, <em>written in Notion.</em></h1>
        <p class="lede">Pick a design, write your pages in Notion the way you write notes, and they appear on your website. Free, no code, and yours to keep.</p>
        <div class="hero-actions">
          <a class="cta" href="#start" data-start>Create my free website <span class="arrow" aria-hidden="true">→</span></a>
          <a class="text-link" href="#themes">See all ${THEMES.length} designs</a>
        </div>
        <ul class="needs" aria-label="What you need">
          <li class="needs-title">What you need</li>
          <li>About 5 minutes, two approval screens</li>
          <li>No credit card, ever</li>
          <li>A free Notion account</li>
          <li>A free GitHub account, which hosts your site. <a href="#faq-github">What’s that?</a></li>
        </ul>
        <p class="resume">Already started? <a href="/status">Continue where you left off</a></p>
      </div>
      <figure class="spread">${HERO_SPREAD}<figcaption class="visually-hidden">Three sites made with InkDrafts designs: ${escapeHtml(HERO_NAMES)}. Each one is written in Notion.</figcaption></figure>
    </div>
  </section>

  <section id="start" aria-labelledby="start-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Step 1 of 3 · Make it yours</p>
        <h2 id="start-heading">Try a look before you sign up for anything</h2>
        <p>Nothing here is final. You can change the design and colors any time later, in one click.</p>
      </div>
      <form class="studio" method="get" action="${CONNECT_PATH}" data-landing-customizer>
        <div class="controls">
          <fieldset>
            <legend class="step-label"><span class="n"></span> Choose a design</legend>
            <div class="picks">
${FEATURED}
            </div>
            <input type="hidden" name="theme" value="${DEFAULT_THEME.id}" disabled data-theme-other>
            <p class="picked-other" data-picked-other hidden></p>
            <p class="picks-more"><a href="#themes">Browse all ${THEMES.length} designs</a>, by what your site is for.</p>
          </fieldset>
          <div class="field" data-js-only hidden>
            <label class="step-label" for="your-name"><span class="n"></span> Your name <small>optional</small></label>
            <input type="text" id="your-name" data-preview-name autocomplete="name" placeholder="${escapeHtml(SAMPLE_NAME)}" maxlength="60">
            <p class="fine">Only for this preview. On your real site you type your name in Notion.</p>
          </div>
          <fieldset>
            <legend class="step-label"><span class="n"></span> Colors</legend>
            <div class="choices" data-scheme>
${SCHEME_PILLS}
            </div>
            <p class="hint">${SCHEME_HELP}</p>
            <div id="options-slot"></div>
          </fieldset>
          <div class="go">
            <button type="submit" class="primary cta"><span>Create my site with ${THEME_NAME}</span> <span class="arrow" aria-hidden="true">→</span></button>
            <p class="go-title">What happens next</p>
            <ol>
              <li>GitHub asks you to approve InkDrafts. It creates your site there, free.</li>
              <li>Notion asks which pages to share. Pick the InkDrafts template.</li>
              <li>Your site is live a few minutes later. We show you the address.</li>
            </ol>
            <p class="fine">By continuing you agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>. Nothing is published until your site is live.</p>
            <noscript><p class="fine">Without JavaScript the preview shows ${escapeHtml(DEFAULT_THEME.name)}. Pick one of these six designs here, or open any design below and start from its page.</p></noscript>
          </div>
          <a class="peek" href="#preview" data-peek hidden>Preview updated <span aria-hidden="true">↑</span></a>
          <div class="cta-bar"><span>Step 1 of 3</span><button type="submit" class="primary cta"><span>Create my site with ${THEME_NAME}</span></button></div>
        </div>
        <div class="preview preview-pin" id="preview">
          ${previewStageHtml(DEFAULT_THEME.preview, `Preview of ${DEFAULT_THEME.name} with sample writing`)}
          <p class="stage-cap"><span>Previewing <strong data-theme-name>${escapeHtml(DEFAULT_THEME.name)}</strong> with sample writing.</span><span>Your own words come from Notion.</span></p>
          <p class="visually-hidden" id="preview-status" aria-live="polite"></p>
        </div>
      </form>
    </div>
  </section>

  <section id="how-it-works" aria-labelledby="how-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">How it works</p>
        <h2 id="how-heading">Three steps, then you just write</h2>
        <p>You click through two approval screens. InkDrafts does the setup you would otherwise need a developer for.</p>
      </div>
      <ol class="steps">
        <li>
          <h3>Pick a look</h3>
          <p>Choose a design and colors on this page. You can change them later.</p>
          <span class="time">You’re here</span>
        </li>
        <li>
          <h3>Say yes on GitHub</h3>
          <p>GitHub is the free service that will hold and show your website. Approve InkDrafts once and it builds your site there. No account? You can make one on the way.</p>
          <p class="see"><strong>What you will see:</strong> a page with a green <strong>Install</strong> button. Leave “${GITHUB_INSTALL_SCOPE}” selected and click it.</p>
          <span class="time">About 1 minute</span>
        </li>
        <li>
          <h3>Say yes on Notion</h3>
          <p>Notion asks what to share, and you get a ready-made workspace for your site.</p>
          <p class="see"><strong>What you will see:</strong> choose “${NOTION_TEMPLATE_CHOICE}”.</p>
          <span class="time">About 1 minute</span>
        </li>
      </ol>
      <p class="result">Then you’re live, a few minutes later, at an address like <strong>yourname.github.io</strong>. From then on you only open Notion.</p>
      <div class="gloss">
        <p><strong>Why GitHub?</strong> It’s a large, free service that hosts millions of websites. Your site lives in your own account there, not ours, so it’s yours.</p>
        <p><strong>Why Notion?</strong> It’s where you write. Each page in your InkDrafts workspace becomes a page on your site, so there’s no website editor to learn.</p>
      </div>
    </div>
  </section>

  <section id="update" aria-labelledby="update-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">After setup</p>
        <h2 id="update-heading">Updating your site is writing a page</h2>
        <p>Write in Notion, set the page to Published, and it shows up on your site. That’s the whole routine.</p>
      </div>
      <div class="update">
        <div class="mock" role="img" aria-label="A Notion page titled A weekend in Lisbon, with Status set to Published.">
          <div class="mock-head">Notion · ${escapeHtml(NOTION_WORDS.posts)}</div>
          <div class="mock-body">
            <p class="n-title">A weekend in Lisbon</p>
            <div class="n-props">
              <span>Status</span><b><span class="pill-pub">Published</span></b>
              <span>${escapeHtml(NOTION_WORDS.date)}</span><b>May 4, 2026</b>
              <span>Tags</span><b>travel</b>
            </div>
            <p class="n-text">We arrived on the late train and walked up through Alfama while the tiles were still warm from the day…</p>
          </div>
        </div>
        <div class="update-arrow" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 24h34M30 14l10 10-10 10"/></svg>
          <span>${UPDATE_WAIT[0].toUpperCase()}${UPDATE_WAIT.slice(1)},<br>or press “${UPDATE_BUTTON}”</span>
        </div>
        <div class="mock" role="img" aria-label="The same post on the website, styled by the ${escapeHtml(DEFAULT_THEME.name)} design.">
          <div class="bar"><i></i><i></i><i></i><b>rowanvale.github.io/lisbon</b></div>
          <div class="s-body">
            <p class="s-kicker">Travel</p>
            <p class="s-title">A weekend in Lisbon</p>
            <p class="s-meta">May 4, 2026 · 3 min read</p>
            <p class="s-text">We arrived on the late train and walked up through Alfama while the tiles were still warm from the day…</p>
          </div>
        </div>
      </div>
      <ul class="update-notes">
        <li><strong>Draft as long as you like</strong>Pages stay private while their Status is Draft.</li>
        <li><strong>Add pages and posts</strong>A new row in Notion is a new page on your site. Your menu updates by itself.</li>
        <li><strong>Hide a page again</strong>Set its Status back to Draft and it leaves your site at the next update. Your site settings show when that last happened.</li>
      </ul>
    </div>
  </section>

  <section id="themes" aria-labelledby="themes-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Every design</p>
        <h2 id="themes-heading">${THEMES.length} designs, each a complete website</h2>
        <p>Tap one to try it with your name and colors above. Every design works on phones and computers.</p>
      </div>
      <fieldset class="filter">
        <legend>Show designs for</legend>
${galleryRadioFilterHtml(THEMES)}
        <ul class="gallery">
${CARDS}
        </ul>
      </fieldset>
    </div>
  </section>

  <section id="yours" aria-labelledby="yours-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Yours to keep</p>
        <h2 id="yours-heading">Your site doesn’t depend on us</h2>
      </div>
      <div class="trust">
        <div>
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 14 16 5l11 9v13H5z"/><path d="M13 27v-8h6v8"/></svg>
          <h3>It lives in your account</h3>
          <p>Your website sits in your own free GitHub account. If InkDrafts ever closed, your site would stay online and keep updating from Notion.</p>
          <a class="text-link" href="/leaving">What happens if you leave</a>
        </div>
        <div>
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="7" y="14" width="18" height="13" rx="2"/><path d="M11 14v-4a5 5 0 0 1 10 0v4"/></svg>
          <h3>We only read what you share</h3>
          <p>InkDrafts sees only the Notion pages you choose, and never changes them. We don’t keep your passwords or sign-in keys.</p>
          <a class="text-link" href="/privacy">Privacy in plain words</a> <a class="text-link" href="/security">Technical details</a>
        </div>
        <div>
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m11 10-6 6 6 6M21 10l6 6-6 6M18 7l-4 18"/></svg>
          <h3>Open for anyone to check</h3>
          <p>All of InkDrafts is public code, so anyone can see exactly what it does in your accounts.</p>
          <a class="text-link" href="https://github.com/OffConstruct/notiongit">See the code</a>
        </div>
      </div>
    </div>
  </section>

  <section id="faq" aria-labelledby="faq-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Questions</p>
        <h2 id="faq-heading">Before you start</h2>
        <p>Still unsure? <a href="/support">Ask us</a>. We answer every question.</p>
      </div>
      <div class="faq">
${FAQ}
      </div>
    </div>
  </section>

  <section class="closing" aria-labelledby="closing-heading">
    <div class="wrap">
      <div>
        <h2 id="closing-heading">Your website is 5 minutes away.</h2>
        <p class="lede">Free, no code, and yours to keep. You’ll start with <strong data-theme-name>${escapeHtml(DEFAULT_THEME.name)}</strong>, and can change it any time.</p>
      </div>
      <div>
        <a class="cta" href="${CARRY_HREF}" data-carry><span>Create my site with ${THEME_NAME}</span> <span class="arrow" aria-hidden="true">→</span></a>
        <ol>
          <li>Approve InkDrafts on GitHub (it creates your free site)</li>
          <li>Choose the InkDrafts template in Notion</li>
          <li>Live in a few minutes; edit in Notion from then on</li>
        </ol>
        <p class="resume">Already started? <a href="/status">Continue where you left off</a></p>
      </div>
    </div>
  </section>
</main>

${siteFooterHtml()}
<script type="application/json" id="landing-data">${scriptJson(LANDING_DATA)}</script>
</body>
</html>`;
