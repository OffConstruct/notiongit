/**
 * Server-rendered building blocks shared by the landing studio, the theme
 * gallery, the theme detail page and the customize screen: theme cards, the
 * tweak controls, the preview stage and the data block `customizer.js` reads.
 *
 * Everything works without JavaScript: the tweak form is a plain form whose
 * fields use the `theme` / `t_<key>` / `c_<key>` names that
 * `parseAppearanceParams` reads. With JS, `/assets/customizer.js` posts the
 * same values to the preview iframe as the visitor edits them, and
 * `/assets/preview-stage.js` renders the preview at desktop width, scaled to
 * fit. Without JS the iframe loads `/preview/<id>/?t_*`, which the worker
 * renders with the tweaks applied (`preview-render.ts`).
 *
 * Hooks (keep these names stable): `.theme-card`, `.theme-grid`,
 * `.tweak-form`, `.tweak[data-tweak-type]`, `.choices`/`.choice` (pill
 * radios, also built by `landing.js`), `[data-preview-stage]`,
 * `#theme-preview` (the iframe), `#customizer-data`, `form[data-customizer]`,
 * `output[data-contrast-for]`, `[data-js-hidden]`.
 */

import {
  CUSTOM_COLOR_CHOICE,
  customColorVerdict,
  effectiveTweaks,
  THEME_CATEGORIES,
  tweakQuery,
  type CatalogTheme,
  type CatalogTweak,
  type SiteAppearance,
  type TweakValue,
} from './theme-catalog';
import { SITE_BASE_STYLES, SITE_FONT_PRELOAD } from './site-styles';

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

/** Pill radios: one look for every short choice on every surface. The
 * selected pill changes border and ground only, never weight, so nothing
 * shifts. */
export const CHOICE_STYLES = `
  .choices { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .choice { position: relative; display: inline-flex; align-items: center; gap: 0.4rem; min-width: 0; }
  .choice input[type="radio"] { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
  .choice label { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.25rem; padding: 0.4rem 0.75rem; border: 1px solid var(--border); border-radius: 2px; font: 500 0.875rem/1.3 var(--sans); cursor: pointer; }
  .choice label:hover { border-color: var(--muted); }
  .choice input:checked + label { border-color: var(--fg); background: var(--surface); box-shadow: inset 0 0 0 1px var(--fg); }
  .choice input:focus-visible { outline: 3px solid var(--accent); }
  .choice input:focus-visible + label { outline: 3px solid var(--accent); outline-offset: 2px; }
  .choice input[type="color"] { inline-size: 2.5rem; block-size: 2.25rem; padding: 0.15rem; border: 1px solid var(--border); border-radius: 2px; background: var(--bg); }
  .swatch { flex: none; display: inline-block; width: 1rem; height: 1rem; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--fg) 35%, transparent); }
  .toggle { display: flex; align-items: center; gap: 0.6rem; font: 500 0.9rem/1.3 var(--sans); }
  .toggle input[type="checkbox"] { flex: none; accent-color: var(--accent); width: 1.15rem; height: 1.15rem; margin: 0; }
`;

/** The preview: a plain full-width iframe without JS; with
 * `preview-stage.js` (`data-scaled`) a 1280x800 desktop render scaled to the
 * column. Below 64rem it sticks to the top so the controls scroll under it. */
export const PREVIEW_STAGE_STYLES = `
  .preview-stage { position: relative; overflow: hidden; border: 1px solid var(--border); background: var(--surface); }
  .preview-stage iframe { display: block; width: 100%; height: clamp(24rem, 64vh, 40rem); border: 0; }
  .preview-stage[data-scaled] { aspect-ratio: 16 / 10; }
  .preview-stage[data-scaled] iframe { position: absolute; inset: 0 auto auto 0; width: 1280px; height: 800px; transform: scale(var(--s, 0.5)); transform-origin: 0 0; }
  .preview-pin { position: sticky; top: 0; z-index: 2; background: var(--bg); }
  @media (max-width: 63.99rem) {
    .preview-pin { margin-inline: calc(-1 * var(--gutter)); padding: 0.5rem var(--gutter); border-bottom: 1px solid var(--border); }
    .preview-stage:not([data-scaled]) iframe { height: 42vh; }
  }
  @media (min-width: 64rem) { .preview-pin { top: 1rem; } }
  @media (prefers-reduced-motion: no-preference) { .preview-stage iframe { transition: opacity 240ms var(--ease-out); } }
  .preview-stage[data-loading] iframe { opacity: 0.35; }
`;

/** The theme pages in the inkdrafts.com look; class and id hooks are listed above. */
export const THEME_UI_STYLES = `${SITE_BASE_STYLES}${CHOICE_STYLES}${PREVIEW_STAGE_STYLES}
  main { max-width: var(--wrap); margin: 0 auto; padding: clamp(2rem, 5vw, 3.5rem) var(--gutter) 4rem; }
  h1 { font-size: clamp(2.2rem, 5.5vw, 3.75rem); font-weight: 450; letter-spacing: -0.025em; margin: 0 0 1rem; }
  h2 { font-size: clamp(1.4rem, 3vw, 1.9rem); margin: 2.5rem 0 1rem; }
  main > p, main > div > p { max-width: 42rem; }
  .lead { font-size: 1.15rem; margin: 0 0 1.5rem; }
  .muted { color: var(--muted); }
  .danger { color: var(--danger); }
  .ok { color: var(--ok); }
  .back { font: 500 0.9rem/1.5 var(--sans); margin: 0 0 1.5rem; }
  .notice { border-left: 3px solid var(--accent); background: var(--surface); padding: 0.9rem 1.1rem; margin: 0 0 1.5rem; font-family: var(--sans); font-size: 0.95rem; }
  .notice:has(.danger) { border-left-color: var(--danger); }
  .notice p { margin: 0; }
  .chips { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; }
  .chips a, .chips span { display: inline-block; border: 1px solid var(--border); border-radius: 2px; padding: 0.3rem 0.8rem; text-decoration: none; color: var(--fg); font: 500 0.82rem/1.3 var(--sans); }
  .chips a:hover { border-color: var(--fg); }
  .chips [aria-current="page"] { background: var(--fg); border-color: var(--fg); color: var(--bg); }
  nav[aria-label="Theme categories"] { margin: 1.5rem 0 0; }
  .theme-grid { list-style: none; margin: 2.5rem 0 0; padding: 0; display: grid; gap: 2.75rem 1.75rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr)); }
  .theme-card { display: flex; flex-direction: column; min-width: 0; }
  .theme-card img { display: block; width: 100%; height: auto; aspect-ratio: 8 / 5; border: 1px solid var(--border); background: var(--surface); }
  .theme-card .body { padding-top: 0.9rem; }
  .theme-card h2, .theme-card h3 { margin: 0 0 0.4rem; font-size: 1.3rem; letter-spacing: -0.01em; }
  .theme-card h2 a, .theme-card h3 a { color: var(--fg); text-decoration: none; }
  .theme-card h2 a:hover, .theme-card h3 a:hover { text-decoration: underline; }
  .theme-card .chips span { border: 0; padding: 0; font: 500 0.8rem/1.4 var(--sans); color: var(--muted); }
  .theme-card p { margin: 0.35rem 0 0; font: 0.9rem/1.5 var(--sans); color: var(--muted); }
  .theme-card[aria-current="true"] img { outline: 3px solid var(--accent); outline-offset: 3px; }
  @media (max-width: 39.99rem) {
    .theme-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem 1rem; }
    .theme-card h2, .theme-card h3 { font-size: 1.1rem; }
    .theme-card .body > p { display: none; }
  }
  .detail { display: grid; gap: 1.5rem 3rem; grid-template-columns: minmax(0, 1fr); margin-top: 1.5rem; align-items: start; }
  @media (min-width: 64rem) { .detail { grid-template-columns: minmax(0, 1fr) minmax(0, 21rem); } }
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
  .tweak select { font: inherit; min-height: 2.5rem; max-width: 100%; padding: 0.35rem 0.6rem; border: 1px solid var(--border); border-radius: 2px; background: var(--bg); color: var(--fg); }
  .tweak input[type="range"] { width: 100%; max-width: 16rem; accent-color: var(--accent); vertical-align: middle; }
  .tweak output { display: block; margin-top: 0.3rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
  .switcher { display: flex; flex-wrap: wrap; align-items: end; gap: 0.75rem; margin: 1.5rem 0 0; font-family: var(--sans); }
  .switcher label { display: block; font: 600 0.875rem/1.4 var(--sans); margin-bottom: 0.4rem; }
  .switcher select { font: inherit; min-height: 2.75rem; padding: 0.35rem 0.6rem; border: 1px solid var(--border); border-radius: 2px; background: var(--bg); color: var(--fg); }
  details { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 1rem 0; margin: 2rem 0; font-family: var(--sans); font-size: 0.95rem; }
  summary { cursor: pointer; font-weight: 600; }
  pre { overflow-x: auto; background: var(--surface); padding: 1rem; border-radius: 2px; font-size: 0.85rem; }
  pre code { background: none; padding: 0; }
  .pager { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem 1rem; flex-wrap: wrap; margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--border); font: 500 0.95rem/1.5 var(--sans); }
  .pager p { margin: 0; color: var(--muted); }
  .build { margin-top: 3.5rem; padding: 2rem; background: var(--surface); }
  .build h2 { margin: 0 0 0.75rem; }
  .build p { margin: 0 0 1rem; }
  .build p:last-child { margin: 0; }
`;

/** Same-origin script that scales every `[data-preview-stage]`. */
export const PREVIEW_STAGE_SCRIPT = '/assets/preview-stage.js';

export function pageShell(options: { title: string; body: string; scripts?: readonly string[]; description?: string }): string {
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
<header class="masthead">
<div class="wrap">
<a class="wordmark" href="/">InkDrafts</a>
<nav aria-label="Site"><ul><li><a href="/themes">Themes</a></li><li><a href="/status">Manage your site</a></li></ul></nav>
</div>
</header>
<main id="main-content">
${options.body}
</main>
<footer class="site-foot">
<div class="wrap">
<p>InkDrafts turns a Notion workspace into a GitHub Pages site you own.</p>
<nav aria-label="Footer"><ul><li><a href="/privacy">Privacy</a></li><li><a href="/terms">Terms</a></li><li><a href="https://github.com/OffConstruct/notiongit-template/blob/main/docs/themes/authoring.md">Build your own theme</a></li></ul></nav>
</div>
</footer>
</body>
</html>`;
}

/** One compact picker: offered themes grouped by their first category, in
 * catalog order, each listed once. */
export function themeOptionsHtml(themes: readonly CatalogTheme[], selected: string): string {
  return THEME_CATEGORIES.map((category) => {
    const members = themes.filter((theme) => theme.categories[0] === category.id);
    if (members.length === 0) return '';
    return `<optgroup label="${escapeHtml(category.label)}">${members.map((theme) =>
      `<option value="${theme.id}"${theme.id === selected ? ' selected' : ''}>${escapeHtml(theme.name)}</option>`).join('')}</optgroup>`;
  }).join('');
}

/** A gallery card. `headingLevel` follows the page outline. */
export function themeCardHtml(theme: CatalogTheme, options: { href: string; headingLevel: 2 | 3; current?: boolean }): string {
  const tag = `h${options.headingLevel}`;
  const chips = theme.categories.map((category) => `<li><span>${escapeHtml(categoryLabel(category))}</span></li>`).join('');
  return `<li class="theme-card" data-cat="${escapeHtml(theme.categories.join(' '))}"${options.current ? ' aria-current="true"' : ''}>
<img src="${escapeHtml(theme.thumbnail)}" width="640" height="400" alt="" loading="lazy">
<div class="body">
<${tag}><a href="${escapeHtml(options.href)}">${escapeHtml(theme.name)}</a></${tag}>
<ul class="chips" aria-label="Categories">${chips}</ul>
<p>${escapeHtml(theme.summary)}</p>
</div>
</li>`;
}

/** Default looks are the static export; anything else is rendered by the
 * worker with the tweaks applied, so the preview is right without JS too. */
export function previewSrc(appearance: SiteAppearance): string {
  const query = tweakQuery(appearance);
  return query ? `/preview/${appearance.themeId}/?${query}` : `/previews/${appearance.themeId}/`;
}

export function previewStageHtml(src: string, title: string): string {
  return `<div class="preview-stage" data-preview-stage><iframe id="theme-preview" src="${escapeHtml(src)}" title="${escapeHtml(title)}" loading="lazy"></iframe></div>`;
}

export function previewFrameHtml(theme: CatalogTheme, appearance: SiteAppearance): string {
  return previewStageHtml(previewSrc(appearance), `Preview of ${theme.name}`);
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

function tweakFieldHtml(theme: CatalogTheme, tweak: CatalogTweak, value: TweakValue, mode: TweakValue): string {
  const name = `t_${tweak.key}`;
  const id = `tweak-${tweak.key}`;
  const label = escapeHtml(tweak.label);
  switch (tweak.type) {
    case 'select':
    case 'font': {
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
      const presets = tweak.presets.map((preset) => ({ value: preset.value, label: preset.label, dot: preset.light }));
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

/** The fields for every tweak of `theme`, prefilled with `appearance`. */
export function tweakFieldsHtml(theme: CatalogTheme, appearance: SiteAppearance): string {
  const values = effectiveTweaks(theme, appearance.tweaks);
  return theme.tweaks.map((tweak) => tweakFieldHtml(theme, tweak, values[tweak.key], values.mode)).filter(Boolean).join('\n');
}

/** The exact YAML an owner would paste by hand. */
export function yamlBlockHtml(block: string): string {
  return `<pre><code>${escapeHtml(block)}</code></pre>`;
}
