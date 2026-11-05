/**
 * Server-rendered building blocks shared by the landing studio, the theme
 * gallery, the theme detail page and the customize screen: gallery cards and
 * their audience filter, the tweak controls, the preview stage and the data
 * block `customizer.js` reads.
 *
 * Everything works without JavaScript: the tweak form is a plain form whose
 * fields use the `theme` / `t_<key>` / `c_<key>` names that
 * `parseAppearanceParams` reads. With JS, `/assets/customizer.js` posts the
 * same values to the preview iframe as the visitor edits them, and
 * `/assets/preview-stage.js` renders the preview at desktop or phone width,
 * scaled to fit, and crossfades between looks. Without JS the iframe loads
 * `/preview/<id>/?t_*`, which the worker renders with the tweaks applied
 * (`preview-render.ts`).
 *
 * Hooks (keep these names stable): `.theme-card`, `.theme-grid`, `.gallery`,
 * `.filter`, `.tweak-form`, `.tweak[data-tweak-type]`, `.choices`/`.choice`
 * (pill radios, also built by `landing.js`), `[data-preview-stage]`,
 * `[data-device]`, `[data-preview-full]`, `#theme-preview` (the iframe),
 * `#customizer-data`, `form[data-customizer]`, `output[data-contrast-for]`,
 * `[data-js-hidden]`, `details.fine-tune`.
 */

import {
  CUSTOM_COLOR_CHOICE,
  customColorVerdict,
  effectiveTweaks,
  THEME_CATEGORIES,
  THEMES,
  tweakQuery,
  type CatalogTheme,
  type CatalogTweak,
  type SiteAppearance,
  type ThemeAudience,
  type ThemeCategory,
  type TweakValue,
} from './theme-catalog';
import { SITE_BASE_STYLES, SITE_FONT_PRELOAD, siteFooterHtml, siteHeaderHtml, type SiteHeaderOptions } from './site-styles';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** JSON inside `<script type="application/json">`: `<` is escaped so no
 * value can close the element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function categoryLabel(id: string): string {
  return THEME_CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

// --- Color scheme vocabulary -------------------------------------------------

/** The three scheme values every theme's `mode` tweak uses, in display
 * order, with the one wording every surface shows. Themes name their modes
 * after their own grounds ("Bone", "Kiln"); visitors get the same three
 * words everywhere, and the catalog decides which ones a theme offers. */
const SCHEME_LABELS: readonly (readonly [string, string])[] = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['auto', 'Match device'],
];

export const SCHEME_HELP = '“Match device” follows each visitor’s phone or computer setting.';

export interface SchemeChoice {
  readonly value: string;
  readonly label: string;
}

export function schemeChoices(theme: CatalogTheme): readonly SchemeChoice[] {
  const mode = theme.tweaks.find((tweak) => tweak.key === 'mode');
  if (mode?.type !== 'select') return [];
  return SCHEME_LABELS
    .filter(([value]) => mode.options.some((option) => option.value === value))
    .map(([value, label]) => ({ value, label }));
}

export function schemeDefault(theme: CatalogTheme): string {
  const mode = theme.tweaks.find((tweak) => tweak.key === 'mode');
  return mode?.type === 'select' ? mode.default : 'auto';
}

// --- Gallery groups ------------------------------------------------------------

/** Plain-language audiences over the catalog's categories. Every category
 * belongs to exactly one group, so a theme's groups follow from its
 * manifest and the filters can never show a label no theme has. A group
 * with an `audience` cuts across the categories: it holds the themes whose
 * manifest lists that audience. */
export interface GalleryGroup {
  readonly id: string;
  readonly label: string;
  readonly categories: readonly ThemeCategory[];
  readonly audience?: ThemeAudience;
}

export const GALLERY_GROUPS: readonly GalleryGroup[] = [
  { id: 'writing', label: 'Writing & blogs', categories: ['writers'] },
  { id: 'personal', label: 'Personal & family', categories: [], audience: 'personal' },
  { id: 'visual', label: 'Photos & art', categories: ['photographers', 'artists', 'designers'] },
  { id: 'music', label: 'Music', categories: ['musicians'] },
  { id: 'business', label: 'Small business', categories: ['entrepreneurs', 'marketing'] },
  { id: 'work', label: 'CV, teaching & research', categories: ['professionals', 'educators', 'researchers'] },
  { id: 'tech', label: 'Code & tech', categories: ['developers'] },
];

export function galleryGroup(id: string): GalleryGroup | null {
  return GALLERY_GROUPS.find((group) => group.id === id) ?? null;
}

/** Category groups first, so a theme's first group is always its own kind
 * of site (the switcher and the detail pager key on it), then audiences. */
export function galleryGroupsOf(theme: CatalogTheme): readonly GalleryGroup[] {
  return [
    ...GALLERY_GROUPS.filter((group) => group.categories.some((category) => theme.categories.includes(category))),
    ...GALLERY_GROUPS.filter((group) => group.audience !== undefined && theme.audience.includes(group.audience)),
  ];
}

export function themesInGroup(group: GalleryGroup): readonly CatalogTheme[] {
  return THEMES.filter((theme) => galleryGroupsOf(theme).includes(group));
}

/** "Writing & blogs · Photos & art": who a theme suits, in plain words. */
export function audienceLine(theme: CatalogTheme): string {
  return galleryGroupsOf(theme).map((group) => group.label).join(' · ');
}

/** One strong theme per audience leads, then the rest in catalog order.
 * Unknown ids are skipped, so a renamed theme cannot break the page. */
const LEADING_THEMES = ['issue', 'verso', 'dossier', 'atelier', 'keynote', 'marquee', 'byline', 'halo', 'cathode', 'lattice', 'specimen', 'megaphone', 'signal', 'letterhead', 'margin'];

export function galleryOrder(themes: readonly CatalogTheme[]): readonly CatalogTheme[] {
  const lead = LEADING_THEMES.map((id) => themes.find((theme) => theme.id === id)).filter((theme): theme is CatalogTheme => theme !== undefined);
  return [...lead, ...themes.filter((theme) => !LEADING_THEMES.includes(theme.id))];
}

/** The studio's picker: six looks that cover the audiences. */
export const FEATURED_THEMES = ['issue', 'verso', 'dossier', 'atelier', 'keynote', 'marquee'];

// --- Styles --------------------------------------------------------------------

/** Pill radios: one look for every short choice on every surface. The
 * checked pill inverts (ink on paper becomes paper on ink), pills share the
 * row equally, and every target is at least 44px tall. */
export const CHOICE_STYLES = `
  .choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: 0.45rem; }
  /* Exactly four choices sit 2x2 rather than 3+1 in a narrow column. */
  .choices:has(> :nth-child(4):last-child) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .choice { position: relative; display: flex; min-width: 0; }
  .choice input[type="radio"] { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
  .choice label { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; min-height: 2.75rem; padding: 0.4rem 0.7rem; border: 1px solid var(--border); border-radius: 99px; font: 500 0.875rem/1.25 var(--sans); text-align: center; background: var(--bg); cursor: pointer; }
  .choice label:hover { border-color: var(--fg); }
  .choice input:checked + label { border-color: var(--fg); background: var(--fg); color: var(--bg); }
  .choice input:checked + label .swatch { box-shadow: 0 0 0 2px var(--bg); }
  .choice input:focus-visible + label { outline: 3px solid var(--accent); outline-offset: 2px; }
  .choice input[type="color"] { flex: none; inline-size: 2.75rem; block-size: 2.75rem; padding: 0.2rem; margin-left: 0.3rem; border: 1px solid var(--border); border-radius: 50%; background: var(--bg); }
  .swatch { flex: none; display: inline-block; width: 0.9rem; height: 0.9rem; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--fg) 35%, transparent); }
  .toggle { display: flex; align-items: center; gap: 0.6rem; min-height: 2.75rem; font: 500 0.9rem/1.3 var(--sans); }
  .toggle input[type="checkbox"] { flex: none; accent-color: var(--accent); width: 1.15rem; height: 1.15rem; margin: 0; }
  .hint { margin: 0.5rem 0 0; font: 0.85rem/1.5 var(--sans); color: var(--muted); }
  details.fine-tune > summary { list-style: none; }
  details.fine-tune > summary::-webkit-details-marker { display: none; }
  details.fine-tune > summary::after { content: "+"; font: 400 1.35rem/1 var(--sans); color: var(--accent); }
  details.fine-tune[open] > summary::after { content: "\\2212"; }
  .choice:has(> input[type="radio"]:not(:checked)) > input[type="color"] { display: none; }
`;

/** The preview: a plain iframe without JS; with `preview-stage.js`
 * (`data-scaled`) a 1280x800 desktop render, or a 390-wide phone render
 * inside a phone outline, scaled to the column. The stage is inert: it is a
 * picture of the theme, and the full-size link is the way in. */
export const PREVIEW_STAGE_STYLES = `
  .preview { margin: 0; min-width: 0; }
  .stage-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; margin-bottom: 0.75rem; font-family: var(--sans); }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 99px; padding: 3px; background: var(--bg); }
  .seg button { min-height: 2.25rem; padding: 0 0.95rem; border: 0; background: transparent; color: var(--fg); border-radius: 99px; font: 500 0.85rem/1 var(--sans); cursor: pointer; }
  .seg button:hover { background: var(--surface); }
  .seg button[aria-pressed="true"] { background: var(--fg); color: var(--bg); }
  .stage-tools .text-link { display: inline-flex; align-items: center; min-height: 2.75rem; font: 600 0.9rem/1.3 var(--sans); }
  .preview-stage { position: relative; overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); box-shadow: var(--shadow-lift); margin: 0 auto; }
  .preview-stage iframe { display: block; width: 100%; height: clamp(24rem, 64vh, 40rem); border: 0; background: #fff; }
  .preview-stage[data-scaled] { aspect-ratio: 16 / 10; }
  .preview-stage[data-scaled] iframe { position: absolute; inset: 0 auto auto 0; width: 1280px; height: 800px; transform: scale(var(--s, 0.5)); transform-origin: 0 0; }
  .preview-stage[data-scaled][data-device="phone"] { aspect-ratio: 9 / 17; max-width: 19rem; border-radius: 1.6rem; border: 8px solid var(--fg); }
  .preview-stage[data-scaled][data-device="phone"] iframe { width: 390px; height: 737px; }
  .preview-stage[data-scaled] iframe[data-next] { opacity: 0; }
  @media (prefers-reduced-motion: no-preference) {
    .preview-stage[data-scaled] iframe { transition: opacity 320ms ease; }
    .preview-stage[data-scaled] { transition: max-width 350ms var(--ease-out), border-radius 350ms var(--ease-out); }
  }
  .stage-cap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.3rem 1rem; margin: 0.8rem 0 0; font: 0.86rem/1.45 var(--sans); color: var(--muted); }
  .stage-cap strong { color: var(--fg); font-weight: 600; }
  @media (max-width: 63.99rem) { .preview-stage[data-scaled][data-device="phone"] { max-width: 15rem; } }
  @media (max-width: 47.99rem) { .preview-stage[data-scaled][data-device="phone"] { max-width: min(13rem, 26svh); border-width: 6px; } }
  .preview-stage[data-loading]::after { content: "Loading\\2026"; position: absolute; inset: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--bg) 55%, transparent); color: var(--fg); font: 600 0.9rem/1 var(--sans); z-index: 2; }
  @media (min-width: 64rem) { .preview-pin { position: sticky; top: 1rem; } }
`;

/** Gallery cards and the audience filter, on the landing and on /themes. */
export const GALLERY_STYLES = `
  .filter { border: 0; margin: 0; padding: 0; min-width: 0; }
  .filter legend { font: 600 0.9rem/1.4 var(--sans); color: var(--muted); padding: 0; margin-bottom: 0.75rem; }
  .filter > input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
  .filter > label, .filter-links a { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.75rem; margin: 0 0.35rem 0.5rem 0; padding: 0 1rem; border: 1px solid var(--border); border-radius: 99px; font: 500 0.88rem/1.2 var(--sans); color: var(--fg); text-decoration: none; cursor: pointer; }
  .filter > label span, .filter-links a span { color: var(--muted); font-size: 0.8em; font-variant-numeric: tabular-nums; }
  .filter > label:hover, .filter-links a:hover { border-color: var(--fg); }
  .filter > input:checked + label, .filter-links a[aria-current="page"] { background: var(--fg); border-color: var(--fg); color: var(--bg); }
  .filter > input:checked + label span, .filter-links a[aria-current="page"] span { color: inherit; opacity: 0.7; }
  .filter > input:focus-visible + label { outline: 3px solid var(--accent); outline-offset: 2px; }
  .filter-links { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; }
  .filter-links li { display: contents; }
  .gallery, .theme-grid { list-style: none; margin: 1.75rem 0 0; padding: 0; display: grid; gap: 2.5rem 1.75rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr)); }
  ${GALLERY_GROUPS.map((group) => `#group-${group.id}:checked ~ .gallery li:not([data-group~="${group.id}"])`).join(',\n  ')} { display: none; }
  .gallery li, .theme-grid li { min-width: 0; }
  .theme-card { display: grid; gap: 0.2rem; color: var(--fg); text-decoration: none; }
  .theme-card .thumb { display: block; aspect-ratio: 8 / 5; border: 1px solid var(--border); background: linear-gradient(110deg, var(--surface) 30%, var(--bg) 50%, var(--surface) 70%); overflow: hidden; margin-bottom: 0.65rem; }
  .theme-card img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .theme-card .name { font: 500 1.3rem/1.2 var(--serif); }
  .theme-card .for { font: 500 0.8rem/1.4 var(--sans); color: var(--muted); }
  .theme-card .summary { font: 0.9rem/1.5 var(--sans); color: var(--muted); margin-top: 0.2rem; }
  .theme-card:hover .name { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
  .theme-card[aria-current="true"] .thumb { outline: 3px solid var(--accent); outline-offset: 3px; }
  @media (prefers-reduced-motion: no-preference) {
    .theme-card img { transition: transform 260ms var(--ease-out); }
    .theme-card:hover img { transform: scale(1.03); }
  }
  @media (max-width: 39.99rem) {
    .gallery, .theme-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.75rem 0.9rem; }
    .theme-card .name { font-size: 1.1rem; }
    .theme-card .summary { display: none; }
  }
`;

/** The theme pages in the inkdrafts.com look; class and id hooks are listed above. */
export const THEME_UI_STYLES = `${SITE_BASE_STYLES}${CHOICE_STYLES}${PREVIEW_STAGE_STYLES}${GALLERY_STYLES}
  main { max-width: var(--wrap); margin: 0 auto; padding: clamp(2rem, 5vw, 3.5rem) var(--gutter) 4rem; }
  h1 { font-size: clamp(2.2rem, 5.5vw, 3.75rem); font-weight: 450; letter-spacing: -0.025em; margin: 0 0 1rem; }
  h2 { font-size: clamp(1.4rem, 3vw, 1.9rem); margin: 2.5rem 0 1rem; }
  main > p, main > div > p { max-width: 42rem; }
  .lead { font-size: 1.15rem; margin: 0 0 1.5rem; }
  .muted { color: var(--muted); }
  .danger { color: var(--danger); }
  .ok { color: var(--ok); }
  .back { font: 500 0.9rem/1.5 var(--sans); margin: 0 0 1.5rem; }
  .back a { display: inline-flex; align-items: center; min-height: 2.75rem; }
  .notice { border-left: 3px solid var(--accent); background: var(--surface); padding: 0.9rem 1.1rem; margin: 0 0 1.5rem; font-family: var(--sans); font-size: 0.95rem; }
  .notice:has(.danger) { border-left-color: var(--danger); }
  .notice p { margin: 0; }
  .chips { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; }
  .chips a, .chips span { display: inline-flex; align-items: center; min-height: 2.75rem; border: 1px solid var(--border); border-radius: 99px; padding: 0.3rem 0.9rem; text-decoration: none; color: var(--fg); font: 500 0.82rem/1.3 var(--sans); }
  .chips a:hover { border-color: var(--fg); }
  nav[aria-label="Browse by audience"] { margin: 1.5rem 0 0; }
  .theme-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem 1.5rem; }
  .theme-head h1 { margin-bottom: 0.5rem; }
  .pager { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem 1rem; flex-wrap: wrap; font: 500 0.95rem/1.5 var(--sans); }
  .pager a { display: inline-flex; align-items: center; min-height: 2.75rem; }
  .pager p { margin: 0; color: var(--muted); }
  .pager.foot { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
  .detail { display: grid; gap: 1.5rem 3rem; grid-template-columns: minmax(0, 1fr); margin-top: 1.5rem; align-items: start; }
  @media (min-width: 64rem) { .detail { grid-template-columns: minmax(0, 1fr) minmax(0, 22rem); } }
  .detail .muted { font: 0.85rem/1.55 var(--sans); }
  .about { margin-top: 2.5rem; }
  .about p { max-width: 42rem; }
  .tweak-form { font-family: var(--sans); font-size: 0.92rem; }
  .tweak-form > .actions { margin-bottom: 1.5rem; }
  .tweak-form > fieldset { border: 0; margin: 0 0 1.25rem; padding: 0; min-width: 0; }
  .tweak-form > fieldset > legend { font: 600 0.875rem/1.4 var(--sans); color: var(--muted); padding: 0; margin-bottom: 1rem; }
  .tweak { margin: 0 0 1.1rem; padding: 0 0 1.1rem; border: 0; border-bottom: 1px solid var(--border); min-width: 0; }
  fieldset.tweak { padding-inline: 0; }
  fieldset.tweak > legend { padding: 0; }
  .tweak > label, fieldset.tweak > legend { display: block; font-weight: 600; margin-bottom: 0.5rem; }
  .tweak.toggle > label { display: inline; margin: 0; }
  .tweak select { font: inherit; min-height: 2.75rem; max-width: 100%; padding: 0.35rem 0.6rem; border: 1px solid var(--border); border-radius: 2px; background: var(--bg); color: var(--fg); }
  .tweak input[type="range"] { width: 100%; max-width: 16rem; accent-color: var(--accent); vertical-align: middle; }
  .tweak output { display: block; margin-top: 0.3rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
  .actions .fine { margin: 0; font: 0.85rem/1.5 var(--sans); color: var(--muted); flex-basis: 100%; }
  .switcher { display: flex; flex-wrap: wrap; align-items: end; gap: 0.75rem; margin: 1.5rem 0 0; font-family: var(--sans); }
  .switcher label { display: block; font: 600 0.875rem/1.4 var(--sans); margin-bottom: 0.4rem; }
  .switcher select { font: inherit; min-height: 2.75rem; padding: 0.35rem 0.6rem; border: 1px solid var(--border); border-radius: 2px; background: var(--bg); color: var(--fg); }
  details { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 0.25rem 0; margin: 2rem 0; font-family: var(--sans); font-size: 0.95rem; }
  summary { cursor: pointer; font-weight: 600; min-height: 2.75rem; display: flex; align-items: center; gap: 0.5rem; }
  summary small { font-weight: 400; color: var(--muted); }
  details.fine-tune { margin: 0 0 1.25rem; border-bottom: 0; }
  details.fine-tune > .option-grid { padding-top: 0.75rem; }
  pre { overflow-x: auto; background: var(--surface); padding: 1rem; border-radius: 2px; font-size: 0.85rem; }
  pre code { background: none; padding: 0; }
  .cta-bar { display: none; }
  @media (max-width: 63.99rem) {
    .cta-bar { position: sticky; bottom: 0; z-index: 3; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; margin: 1.5rem calc(-1 * var(--gutter)) 0; padding: 0.75rem var(--gutter); background: var(--bg); border-top: 1px solid var(--border); font: 600 0.85rem/1.3 var(--sans); color: var(--muted); }
    .cta-bar .cta { flex: 1; }
  }
  .build { margin-top: 3.5rem; padding: 2rem; background: var(--surface); }
  .build h2 { margin: 0 0 0.75rem; }
  .build p { margin: 0 0 1rem; }
  .build p:last-child { margin: 0; }
`;

/** Same-origin script that scales every `[data-preview-stage]`. */
export const PREVIEW_STAGE_SCRIPT = '/assets/preview-stage.js';

export function pageShell(options: { title: string; body: string; scripts?: readonly string[]; description?: string; header?: SiteHeaderOptions }): string {
  const scripts = (options.scripts ?? []).map((src) => `<script src="${escapeHtml(src)}" defer></script>`).join('\n');
  const description = options.description ? `\n<meta name="description" content="${escapeHtml(options.description)}">` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>${description}
${SITE_FONT_PRELOAD}
<style>${THEME_UI_STYLES}</style>
${scripts}
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
${siteHeaderHtml(options.header)}
<main id="main-content">
${options.body}
</main>
${siteFooterHtml()}
</body>
</html>`;
}

/** The design switcher: the gallery's audience groups, each design once
 * under its first group, in gallery order. */
export function themeOptionsHtml(themes: readonly CatalogTheme[], selected: string): string {
  const ordered = galleryOrder(themes);
  return GALLERY_GROUPS.map((group) => {
    const members = ordered.filter((theme) => galleryGroupsOf(theme)[0] === group);
    if (members.length === 0) return '';
    return `<optgroup label="${escapeHtml(group.label)}">${members.map((theme) =>
      `<option value="${theme.id}"${theme.id === selected ? ' selected' : ''}>${escapeHtml(theme.name)}</option>`).join('')}</optgroup>`;
  }).join('');
}

export interface GalleryCardOptions {
  readonly href: string;
  /** Position in the grid: the first rows load eagerly so they never show blank. */
  readonly index?: number;
  readonly current?: boolean;
  /** With `landing.js`, a plain click tries the theme in the studio. */
  readonly pick?: boolean;
}

const EAGER_CARDS = 8;

/** A thumbnail `<img>` that lets the browser take the 320w shot when
 * `sizes` says the slot is small enough. */
export function thumbnailImgHtml(theme: CatalogTheme, sizes: string, extra = ''): string {
  return `<img src="${escapeHtml(theme.thumbnail)}" srcset="${escapeHtml(theme.thumbnailSmall)} 320w, ${escapeHtml(theme.thumbnail)} 640w" sizes="${sizes}" width="640" height="400" alt=""${extra}>`;
}

/** Gallery cards: two columns of about 45vw on phones, up to 22rem wide
 * above. 40vw (not 45) lets a 2x phone take the 320w shot at 1.9x, which
 * looks the same on a card that small and costs a third of the bytes. */
const CARD_SIZES = '(max-width: 39.99rem) 40vw, 22rem';

/** A gallery card: thumbnail, name, audience and summary, all inside one
 * link, so the whole card is the target. */
export function galleryCardHtml(theme: CatalogTheme, options: GalleryCardOptions): string {
  const groups = galleryGroupsOf(theme).map((group) => group.id).join(' ');
  const loading = (options.index ?? EAGER_CARDS) < EAGER_CARDS ? 'eager' : 'lazy';
  return `<li data-group="${escapeHtml(groups)}"><a class="theme-card" href="${escapeHtml(options.href)}"${options.pick ? ` data-pick="${theme.id}"` : ''}${options.current ? ' aria-current="true"' : ''}><span class="thumb">${thumbnailImgHtml(theme, CARD_SIZES, ` loading="${loading}" decoding="async"`)}</span><span class="name">${escapeHtml(theme.name)}</span><span class="for">${escapeHtml(audienceLine(theme))}</span><span class="summary">${escapeHtml(theme.summary)}</span></a></li>`;
}

/** Kept for the customize screen's "Browse every design" list. */
export function themeCardHtml(theme: CatalogTheme, options: { href: string; headingLevel: 2 | 3; current?: boolean }): string {
  return galleryCardHtml(theme, { href: options.href, current: options.current });
}

export interface GalleryFilterEntry {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

/** "All" plus every group with at least one theme. */
export function galleryFilterEntries(themes: readonly CatalogTheme[]): readonly GalleryFilterEntry[] {
  return [
    { id: 'all', label: 'All', count: themes.length },
    ...GALLERY_GROUPS
      .map((group) => ({ id: group.id, label: group.label, count: themes.filter((theme) => galleryGroupsOf(theme).includes(group)).length }))
      .filter((entry) => entry.count > 0),
  ];
}

/** The landing filter: radios the CSS reads, so it works without JS. The
 * gallery `<ul>` must follow the inputs inside the same fieldset. */
export function galleryRadioFilterHtml(themes: readonly CatalogTheme[]): string {
  return galleryFilterEntries(themes).map((entry) =>
    `<input type="radio" name="group" id="group-${entry.id}" value="${entry.id}"${entry.id === 'all' ? ' checked' : ''}><label for="group-${entry.id}">${escapeHtml(entry.label)} <span>${entry.count}</span></label>`).join('\n');
}

/** The /themes filter: plain links, one page per audience. */
export function galleryLinkFilterHtml(themes: readonly CatalogTheme[], current: string | null): string {
  const links = galleryFilterEntries(themes).map((entry) => {
    const href = entry.id === 'all' ? '/themes' : `/themes?for=${entry.id}`;
    const active = (current ?? 'all') === entry.id;
    return `<li><a href="${href}"${active ? ' aria-current="page"' : ''}>${escapeHtml(entry.label)} <span>${entry.count}</span></a></li>`;
  }).join('');
  return `<nav aria-label="Browse by audience"><ul class="filter-links">${links}</ul></nav>`;
}

/** Default looks are the static export; anything else is rendered by the
 * worker with the tweaks applied, so the preview is right without JS too. */
export function previewSrc(appearance: SiteAppearance): string {
  const query = tweakQuery(appearance);
  return query ? `/preview/${appearance.themeId}/?${query}` : `/previews/${appearance.themeId}/`;
}

/**
 * The preview stage: Computer/Phone toggle (shown by `preview-stage.js`), the
 * iframe, and a full-size link. The stage is a picture to the accessibility
 * tree and inert to the keyboard: the full-size link is the way into the
 * preview, which keeps 20-odd preview links out of the form's tab order.
 */
export function previewStageHtml(src: string, title: string): string {
  return `<div class="stage-tools"><div class="seg" role="group" aria-label="Preview size" data-device-toggle hidden><button type="button" aria-pressed="true" data-device="desktop">Computer</button><button type="button" aria-pressed="false" data-device="phone">Phone</button></div><a class="text-link" href="${escapeHtml(src)}" target="_blank" rel="noopener" data-preview-full>Open full-size preview<span class="visually-hidden"> (opens in a new tab)</span></a></div>
<div class="preview-stage" data-preview-stage role="img" aria-label="${escapeHtml(title)}"><div inert><iframe id="theme-preview" src="${escapeHtml(src)}" title="${escapeHtml(title)}" loading="lazy" tabindex="-1"></iframe></div></div>`;
}

export function previewFrameHtml(theme: CatalogTheme, appearance: SiteAppearance): string {
  return previewStageHtml(previewSrc(appearance), `Preview of ${theme.name} with sample writing`);
}

/** The only data `customizer.js` needs, all of it catalog-owned. */
export function customizerDataHtml(theme: CatalogTheme): string {
  return `<script type="application/json" id="customizer-data">${scriptJson({
    theme: theme.id,
    lightBg: theme.palette.light.bg,
    darkBg: theme.palette.dark.bg,
    fonts: theme.fonts.map((font) => font.value),
    tweaks: theme.tweaks,
  })}</script>`;
}

/** Shared with customizer.js, which builds the same sentence. */
function contrastVerdict(theme: CatalogTheme, tweak: Extract<CatalogTweak, { type: 'color' }>, hex: string, mode: TweakValue): string {
  const verdict = customColorVerdict(theme, tweak, hex, mode);
  if (verdict.ok) return `Contrast ${verdict.ratio.toFixed(1)}:1, readable.`;
  const problem = verdict.ground === 'light' ? 'Too light on the light background' : 'Too dark on the dark background';
  return `${problem} (${verdict.ratio.toFixed(1)}:1, needs ${verdict.needed}:1), so this color will not be saved.`;
}

/** Up to this many options render as pills; more become a `<select>`. */
export const PILL_LIMIT = 4;

function pillsHtml(name: string, id: string, label: string, type: string, options: readonly { value: string; label: string; dot?: string }[], value: TweakValue, extra = ''): string {
  const pills = options.map((option, index) => {
    const dot = option.dot ? `<span class="swatch" style="background:${escapeHtml(option.dot)}"></span>` : '';
    return `<span class="choice"><input type="radio" id="${id}-${index}" name="${name}" value="${escapeHtml(option.value)}"${option.value === value ? ' checked' : ''}><label for="${id}-${index}">${dot}${escapeHtml(option.label)}</label></span>`;
  });
  return `<fieldset class="tweak" data-tweak-type="${type}"><legend>${label}</legend><div class="choices">${pills.join('\n')}${extra}</div>`;
}

/** The ground the swatches show: a fixed scheme's own, else the light one. */
function swatchGround(mode: TweakValue): 'light' | 'dark' {
  return mode === 'dark' ? 'dark' : 'light';
}

function tweakFieldHtml(theme: CatalogTheme, tweak: CatalogTweak, value: TweakValue, mode: TweakValue): string {
  const name = `t_${tweak.key}`;
  const id = `tweak-${tweak.key}`;
  const label = escapeHtml(tweak.label);
  switch (tweak.type) {
    case 'select':
    case 'font': {
      if (tweak.key === 'mode') {
        return `${pillsHtml(name, id, 'Colors', 'select', schemeChoices(theme), value)}<p class="hint">${SCHEME_HELP}</p></fieldset>`;
      }
      const options = tweak.type === 'select' ? tweak.options : theme.fonts;
      if (options.length <= PILL_LIMIT) return `${pillsHtml(name, id, label, tweak.type, options, value)}</fieldset>`;
      return `<div class="tweak" data-tweak-type="${tweak.type}"><label for="${id}">${label}</label>
<select id="${id}" name="${name}">${options.map((option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
    }
    case 'boolean':
      // The hidden "off" comes first: when the box is checked its "on" is
      // the last value and wins (see parseAppearanceParams).
      return `<div class="tweak toggle" data-tweak-type="boolean"><input type="hidden" name="${name}" value="off">
<input type="checkbox" id="${id}" name="${name}" value="on"${value === true ? ' checked' : ''}><label for="${id}">${label}</label></div>`;
    case 'range':
      return `<div class="tweak" data-tweak-type="range"><label for="${id}">${label}</label>
<input type="range" id="${id}" name="${name}" min="${tweak.min}" max="${tweak.max}" step="${tweak.step}" value="${escapeHtml(String(value))}">
<output for="${id}">${escapeHtml(String(value))}${escapeHtml(tweak.unit)}</output></div>`;
    case 'color': {
      // A single fixed preset is no choice at all; the default applies.
      if (tweak.presets.length === 1 && !tweak.custom) return '';
      const isCustom = typeof value === 'string' && value.startsWith('#');
      const ground = swatchGround(mode);
      const presets = tweak.presets.map((preset) => ({ value: preset.value, label: preset.label, dot: preset[ground] }));
      let custom = '';
      if (tweak.custom) {
        const hex = isCustom ? String(value) : tweak.presets.find((preset) => preset.value === tweak.default)?.light ?? '#000000';
        custom = `\n<span class="choice"><input type="radio" id="${id}-custom" name="${name}" value="${CUSTOM_COLOR_CHOICE}"${isCustom ? ' checked' : ''}><label for="${id}-custom">Custom</label>
<input type="color" id="${id}-hex" name="c_${tweak.key}" value="${escapeHtml(hex)}" aria-label="${label} custom color"></span>`;
      }
      const verdict = tweak.custom
        ? `<output for="${id}-hex" data-contrast-for="${escapeHtml(tweak.key)}" class="muted">${isCustom ? escapeHtml(contrastVerdict(theme, tweak, String(value), mode)) : ''}</output>`
        : '';
      return `${pillsHtml(name, id, label, 'color', presets, value, custom)}${verdict}</fieldset>`;
    }
  }
}

function fineTuneSummary(count: number): string {
  return `<summary>Fine-tune <small>${count} more ${count === 1 ? 'option' : 'options'}, all optional</small></summary>`;
}

/**
 * The fields for every tweak of `theme`, prefilled with `appearance`. With
 * `fineTune`, colors (mode and accent) stay in view and everything else
 * collapses under "Fine-tune", so a first-time visitor sees two decisions.
 */
export function tweakFieldsHtml(theme: CatalogTheme, appearance: SiteAppearance, options: { fineTune?: boolean } = {}): string {
  const values = effectiveTweaks(theme, appearance.tweaks);
  const field = (tweak: CatalogTweak) => tweakFieldHtml(theme, tweak, values[tweak.key], values.mode);
  if (!options.fineTune) return theme.tweaks.map(field).filter(Boolean).join('\n');
  const main = theme.tweaks.filter((tweak) => tweak.key === 'mode' || tweak.key === 'accent');
  const rest = theme.tweaks.filter((tweak) => !main.includes(tweak)).map(field).filter(Boolean);
  const extras = rest.length ? `\n<details class="fine-tune">${fineTuneSummary(rest.length)}<div class="option-grid">${rest.join('\n')}</div></details>` : '';
  return `${main.map(field).filter(Boolean).join('\n')}${extras}`;
}

/** The exact YAML an owner would paste by hand. */
export function yamlBlockHtml(block: string): string {
  return `<pre><code>${escapeHtml(block)}</code></pre>`;
}
