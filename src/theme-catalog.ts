/**
 * The theme catalog and the site-appearance model.
 *
 * The catalog data is generated from the template's `_data/themes/*.json`
 * by `scripts/sync-themes.ts`; this module owns the rules that every surface
 * shares: how a requested theme and tweak values are parsed (query strings,
 * form posts, a repository's `_config.yml`), and how the canonical
 * `inkdrafts:` block is written and read back. The validation rules mirror
 * the template's `_includes/ink/tweaks.html` and `preview.js`, so a value the
 * worker accepts renders the same way on the site and in the preview.
 */

import { THEME_CATALOG_DATA } from './theme-catalog.generated';

export type ThemeId = string & { readonly __brand: 'ThemeId' };

export type ThemeCategory =
  | 'developers'
  | 'designers'
  | 'writers'
  | 'researchers'
  | 'educators'
  | 'artists'
  | 'photographers'
  | 'musicians'
  | 'entrepreneurs'
  | 'marketing'
  | 'professionals';

export type TweakValue = string | boolean | number;

export interface Swatch {
  readonly bg: string;
  readonly text: string;
  readonly muted: string;
}

export interface TweakOption {
  readonly value: string;
  readonly label: string;
}

export interface ColorPreset {
  readonly value: string;
  readonly label: string;
  readonly light: string;
  readonly dark: string;
  readonly on?: string;
}

export type CatalogTweak =
  | { readonly key: string; readonly type: 'select'; readonly label: string; readonly default: string; readonly options: readonly TweakOption[] }
  | { readonly key: string; readonly type: 'boolean'; readonly label: string; readonly default: boolean }
  | {
      readonly key: string;
      readonly type: 'color';
      readonly label: string;
      readonly default: string;
      readonly custom: boolean;
      readonly role: 'text' | 'large' | 'surface';
      readonly presets: readonly ColorPreset[];
    }
  | {
      readonly key: string;
      readonly type: 'range';
      readonly label: string;
      readonly default: number;
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly unit: 'px' | 'rem' | 'em' | 'ch' | '%' | '';
    }
  | { readonly key: 'font'; readonly type: 'font'; readonly label: string; readonly default: string };

export interface CatalogFont {
  readonly value: string;
  readonly label: string;
  /** True when the pairing loads Google Fonts (and so does the preview). */
  readonly webfont: boolean;
}

/** One theme as the generator writes it; `CatalogTheme` brands the id. */
export interface CatalogThemeData {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly summary: string;
  readonly description: string;
  readonly categories: readonly ThemeCategory[];
  readonly author: { readonly name: string; readonly url?: string };
  readonly palette: { readonly light: Swatch; readonly dark: Swatch };
  readonly fonts: readonly CatalogFont[];
  readonly tweaks: readonly CatalogTweak[];
  /** Same-origin preview root, `/previews/<id>/`. */
  readonly preview: string;
  /** Same-origin 640x400 webp, `/previews/<id>/thumb.webp`. */
  readonly thumbnail: string;
}

export type CatalogTheme = Omit<CatalogThemeData, 'id'> & { readonly id: ThemeId };

export interface ThemeCatalogData {
  readonly templateCommit: string;
  readonly templateDirty: boolean;
  /** Snapshot of the schema's category enum, with the docs' labels. */
  readonly categories: readonly { readonly id: ThemeCategory; readonly label: string }[];
  readonly themes: readonly CatalogThemeData[];
}

/** Non-default tweak values only; `v` versions the stored shape. */
export interface SiteAppearance {
  readonly v: 1;
  readonly themeId: ThemeId;
  readonly tweaks: Readonly<Record<string, TweakValue>>;
}

export const DEFAULT_THEME_ID = 'classic' as ThemeId;
export const THEME_CATEGORIES = THEME_CATALOG_DATA.categories;
/** The generator sorts by id; that order is the gallery order too. */
export const THEMES: readonly CatalogTheme[] = THEME_CATALOG_DATA.themes as readonly CatalogTheme[];

const THEMES_BY_ID = new Map<string, CatalogTheme>(THEMES.map((theme) => [theme.id, theme]));

export const APPEARANCE_QUERY_MAX_LENGTH = 1024;
/** Distinct `t_`/`c_` names; a manifest has at most 10 tweaks. */
export const APPEARANCE_QUERY_MAX_TWEAKS = 16;
const THEME_ID_PATTERN = /^[a-z]{2,24}$/u;
const TWEAK_KEY_PATTERN = /^[a-z][a-z0-9_]{0,23}$/u;
const HEX_PATTERN = /^#[0-9a-f]{6}$/u;
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/u;

export function findTheme(id: string): CatalogTheme | null {
  return THEME_ID_PATTERN.test(id) ? THEMES_BY_ID.get(id) ?? null : null;
}

export function defaultTheme(): CatalogTheme {
  const theme = THEMES_BY_ID.get(DEFAULT_THEME_ID);
  if (!theme) throw new Error('the theme catalog has no classic theme');
  return theme;
}

export function isThemeCategory(value: string): value is ThemeCategory {
  return THEME_CATEGORIES.some((category) => category.id === value);
}

export function themesInCategory(category: ThemeCategory): readonly CatalogTheme[] {
  return THEMES.filter((theme) => theme.categories.includes(category));
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2 contrast ratio of two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

export function minimumContrast(role: 'text' | 'large' | 'surface'): number {
  return role === 'large' ? 3 : 4.5;
}

export type ContrastGround = 'light' | 'dark';

/** The backgrounds a site shows for a color-scheme (`mode`) value: one for a
 * fixed scheme, both when it follows the reader. */
export function contrastGrounds(mode: TweakValue | undefined): readonly ContrastGround[] {
  return mode === 'light' ? ['light'] : mode === 'dark' ? ['dark'] : ['light', 'dark'];
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const clamped = Math.min(Math.max(value, 0), 1);
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

/**
 * The color a theme actually paints for a custom accent on its dark ground:
 * a custom hex has no dark twin, so every theme lifts it with
 * `oklch(from <hex> max(l, 0.74) c h)`. Out-of-gamut results are clipped per
 * channel, close enough for a contrast check.
 */
export function darkLifted(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((index) => srgbToLinear(Number.parseInt(hex.slice(index, index + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  if (lightness >= 0.74) return hex;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const L = 0.74;
  const l2 = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m2 = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s2 = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const out = [
    4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2,
    -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
    -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2,
  ];
  return `#${out.map((channelValue) => Math.round(linearToSrgb(channelValue) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export type CustomColorVerdict =
  | { readonly ok: true; readonly ratio: number }
  | { readonly ok: false; readonly ratio: number; readonly needed: number; readonly ground: ContrastGround };

/**
 * A custom color must keep the role's floor on every ground the chosen color
 * scheme shows: as written on the light background, and as the theme lifts it
 * (`darkLifted`) on the dark one. The reported ratio is the worst ground's.
 */
export function customColorVerdict(
  theme: CatalogTheme,
  tweak: Extract<CatalogTweak, { type: 'color' }>,
  hex: string,
  mode: TweakValue | undefined,
): CustomColorVerdict {
  const needed = minimumContrast(tweak.role);
  const ratios = contrastGrounds(mode).map((ground) => ({
    ground,
    ratio: ground === 'light'
      ? contrastRatio(hex, theme.palette.light.bg)
      : contrastRatio(darkLifted(hex), theme.palette.dark.bg),
  }));
  const worst = ratios.reduce((low, entry) => entry.ratio < low.ratio ? entry : low);
  return worst.ratio >= needed ? { ok: true, ratio: worst.ratio } : { ok: false, ratio: worst.ratio, needed, ground: worst.ground };
}

/** `surface` colors and themes without `custom` never take a custom hex. */
export function customColorAllowed(theme: CatalogTheme, key: string, hex: string, mode: TweakValue | undefined): boolean {
  const tweak = theme.tweaks.find((candidate) => candidate.key === key);
  if (!tweak || tweak.type !== 'color' || !tweak.custom || tweak.role === 'surface') return false;
  const normalized = hex.toLowerCase();
  if (!HEX_PATTERN.test(normalized)) return false;
  return customColorVerdict(theme, tweak, normalized, mode).ok;
}

/** The color scheme a raw tweak set selects, under the template's rules. */
export function modeOf(theme: CatalogTheme, raw: Readonly<Record<string, unknown>>): TweakValue | undefined {
  const tweak = theme.tweaks.find((candidate) => candidate.key === 'mode');
  if (!tweak) return undefined;
  return (Object.hasOwn(raw, 'mode') ? validTweakValue(theme, tweak, raw.mode, undefined) : undefined) ?? tweak.default;
}

/** True when `value` sits on the range's step grid from `min`. */
export function onStep(value: number, min: number, step: number): boolean {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/** One tweak's value under the template's rules, or undefined when invalid.
 * `mode` is the effective color scheme, which a custom color is checked for. */
function validTweakValue(theme: CatalogTheme, tweak: CatalogTweak, raw: unknown, mode: TweakValue | undefined): TweakValue | undefined {
  // A hand-edited unquoted `2` or `true` arrives typed; the template's Liquid
  // compares choices as text with booleans spelled on/off, and so does this.
  const text = typeof raw === 'boolean' ? (raw ? 'on' : 'off') : typeof raw === 'number' ? String(raw) : raw;
  switch (tweak.type) {
    case 'select':
      return typeof text === 'string' && tweak.options.some((option) => option.value === text) ? text : undefined;
    case 'boolean':
      if (raw === true || raw === 'true' || raw === 'on') return true;
      if (raw === false || raw === 'false' || raw === 'off') return false;
      return undefined;
    case 'color': {
      if (typeof text !== 'string') return undefined;
      if (tweak.presets.some((preset) => preset.value === text)) return text;
      const hex = text.toLowerCase();
      return customColorAllowed(theme, tweak.key, hex, mode) ? hex : undefined;
    }
    case 'range': {
      const value = typeof raw === 'number' ? raw : typeof raw === 'string' && NUMBER_PATTERN.test(raw) ? Number(raw) : Number.NaN;
      return Number.isFinite(value) && value >= tweak.min && value <= tweak.max && onStep(value, tweak.min, tweak.step) ? value : undefined;
    }
    case 'font':
      return typeof text === 'string' && theme.fonts.some((font) => font.value === text) ? text : undefined;
  }
}

/**
 * Keep only declared keys with valid values that differ from the manifest
 * default, in manifest order. Undeclared keys and invalid values are dropped
 * silently: they only come from tampering, stale links or a hand edit, and
 * the template ignores them the same way.
 */
export function normalizeTweaks(theme: CatalogTheme, raw: Readonly<Record<string, unknown>>): Record<string, TweakValue> {
  const tweaks: Record<string, TweakValue> = {};
  const mode = modeOf(theme, raw);
  for (const tweak of theme.tweaks) {
    if (!Object.hasOwn(raw, tweak.key)) continue;
    const value = validTweakValue(theme, tweak, raw[tweak.key], mode);
    if (value !== undefined && value !== tweak.default) tweaks[tweak.key] = value;
  }
  return tweaks;
}

/** The effective value of every tweak (stored value or default). */
export function effectiveTweaks(theme: CatalogTheme, tweaks: Readonly<Record<string, TweakValue>>): Record<string, TweakValue> {
  const normalized = normalizeTweaks(theme, tweaks);
  return Object.fromEntries(theme.tweaks.map((tweak) => [tweak.key, normalized[tweak.key] ?? tweak.default]));
}

export function appearanceFor(theme: CatalogTheme, raw: Readonly<Record<string, unknown>>): SiteAppearance {
  return { v: 1, themeId: theme.id, tweaks: normalizeTweaks(theme, raw) };
}

/** A theme switch keeps every tweak the new theme declares with a valid value. */
export function carryTweaks(from: SiteAppearance, to: CatalogTheme): SiteAppearance {
  return appearanceFor(to, from.tweaks);
}

/** Re-validate a stored appearance against the current catalog. */
export function revalidateAppearance(appearance: SiteAppearance): SiteAppearance | null {
  const theme = findTheme(appearance.themeId);
  return theme ? appearanceFor(theme, appearance.tweaks) : null;
}

/** Parse an appearance read back from KV (possibly written by an older
 * deploy) and re-validate it; anything malformed reads as no choice. */
export function parseStoredAppearance(value: unknown): SiteAppearance | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || typeof record.themeId !== 'string') return null;
  if (record.tweaks === null || typeof record.tweaks !== 'object' || Array.isArray(record.tweaks)) return null;
  const theme = findTheme(record.themeId);
  return theme ? appearanceFor(theme, record.tweaks as Record<string, unknown>) : null;
}

export type AppearanceParse =
  | { kind: 'none' }
  | { kind: 'ok'; appearance: SiteAppearance }
  | { kind: 'unknown_theme' }
  | { kind: 'oversize' };

/** The form value of a color tweak's "Custom" radio; the hex is in `c_<key>`. */
export const CUSTOM_COLOR_CHOICE = 'custom';

/**
 * `theme=<id>` plus `t_<key>=<value>`, from a query string or a form body.
 * No `theme` means no choice (tweaks alone are ignored), and the site keeps
 * the template default. Two form conventions are accepted so the tweak form
 * works without JS: a repeated `t_<key>` keeps its last value (a hidden
 * "off" before a checkbox), and `t_<key>=custom` takes the hex from
 * `c_<key>` (the color input beside the preset radios).
 */
export function parseAppearanceParams(params: URLSearchParams): AppearanceParse {
  if (params.toString().length > APPEARANCE_QUERY_MAX_LENGTH) return { kind: 'oversize' };
  const raw: Record<string, string> = {};
  const customs: Record<string, string> = {};
  const names = new Set<string>();
  for (const [name, value] of params) {
    const prefix = name.slice(0, 2);
    if (prefix !== 't_' && prefix !== 'c_') continue;
    names.add(name);
    const key = name.slice(2);
    if (!TWEAK_KEY_PATTERN.test(key)) continue;
    if (prefix === 't_') raw[key] = value;
    else customs[key] = value;
  }
  if (names.size > APPEARANCE_QUERY_MAX_TWEAKS) return { kind: 'oversize' };
  for (const key of Object.keys(raw)) {
    if (raw[key] === CUSTOM_COLOR_CHOICE && Object.hasOwn(customs, key)) raw[key] = customs[key];
  }
  const requested = params.get('theme');
  if (requested === null || requested === '') return { kind: 'none' };
  const theme = findTheme(requested);
  if (!theme) return { kind: 'unknown_theme' };
  return { kind: 'ok', appearance: appearanceFor(theme, raw) };
}

/** `t_<key>=<value>` for every stored tweak, for links and preview iframes. */
export function tweakQuery(appearance: SiteAppearance): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(appearance.tweaks)) params.set(`t_${key}`, String(value));
  return params.toString();
}

function yamlScalar(value: TweakValue): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/**
 * The canonical `inkdrafts:` block (template spec C.1): strings JSON-quoted,
 * booleans and numbers bare, keys in manifest order. A classic site with no
 * tweaks renders byte-for-byte as the template ships it.
 */
export function renderAppearanceBlock(appearance: SiteAppearance, newline = '\n'): string {
  const theme = findTheme(appearance.themeId);
  const order = theme ? theme.tweaks.map((tweak) => tweak.key) : [];
  const keys = Object.keys(appearance.tweaks).sort((a, b) => {
    const [ia, ib] = [order.indexOf(a), order.indexOf(b)];
    if (ia !== ib) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const lines = ['inkdrafts:', `  theme_id: ${JSON.stringify(appearance.themeId)}`];
  if (keys.length === 0) {
    lines.push('  tweaks: {}');
  } else {
    lines.push('  tweaks:');
    for (const key of keys) lines.push(`    ${key}: ${yamlScalar(appearance.tweaks[key])}`);
  }
  return lines.join(newline);
}

function stripComment(value: string): string {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"' && character === '\\') {
      index += 1;
      continue;
    }
    if ((character === '"' || character === "'") && (quote === null || quote === character)) {
      quote = quote === null ? character : null;
    } else if (character === '#' && quote === null && (index === 0 || /\s/u.test(value[index - 1]))) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

/** A YAML scalar as Jekyll would type it, for the subset the block uses. */
function parseScalar(text: string): TweakValue | null {
  const value = stripComment(text);
  if (value === '' || value === '~' || value === 'null') return null;
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      const decoded: unknown = JSON.parse(value);
      return typeof decoded === 'string' ? decoded : null;
    } catch {
      return null;
    }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) return value.slice(1, -1).replaceAll("''", "'");
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (NUMBER_PATTERN.test(value)) return Number(value);
  return value;
}

export interface AppearanceBlockLocation {
  /** Index of the `inkdrafts:` line in the line array. */
  start: number;
  /** One past the block's last owned line. */
  end: number;
}

export function isColumnZeroKey(line: string): boolean {
  return line !== '' && !/^[\s#]/u.test(line) && !line.startsWith('---') && !line.startsWith('...');
}

/**
 * Locate column-zero `inkdrafts:` blocks. A block runs through indented
 * lines; blank and column-zero comment lines after its last indented line
 * belong to whatever follows, so they survive a rewrite.
 */
export function findAppearanceBlocks(lines: readonly string[]): AppearanceBlockLocation[] {
  const blocks: AppearanceBlockLocation[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^inkdrafts\s*:/u.test(lines[index])) continue;
    let end = index + 1;
    for (let next = index + 1; next < lines.length && !isColumnZeroKey(lines[next]); next += 1) {
      if (/^\s+\S/u.test(lines[next]) && !/^\s+#/u.test(lines[next])) end = next + 1;
    }
    blocks.push({ start: index, end });
  }
  return blocks;
}

export interface StoredAppearance {
  /** The raw `theme_id` as written, or null when the block has none. */
  themeId: string | null;
  tweaks: Record<string, TweakValue>;
}

/**
 * Read the block back from `_config.yml` text. Returns null when there is no
 * block (a site that predates themes, or one whose owner removed it). Values
 * are typed as YAML would type them and are not validated here; resolve them
 * with `resolveStoredAppearance`.
 */
export function readAppearanceBlock(configText: string): StoredAppearance | null {
  const lines = configText.split(/\r\n|\n|\r/u);
  const [block] = findAppearanceBlocks(lines);
  if (!block) return null;
  const stored: StoredAppearance = { themeId: null, tweaks: {} };
  let inTweaks = false;
  let tweaksIndent = 0;
  for (const line of lines.slice(block.start + 1, block.end)) {
    const match = line.match(/^(\s+)([A-Za-z0-9_]+)\s*:(.*)$/u);
    if (!match) continue;
    const [, indent, key, rest] = match;
    if (inTweaks && indent.length > tweaksIndent) {
      const value = parseScalar(rest);
      if (value !== null) stored.tweaks[key] = value;
      continue;
    }
    inTweaks = false;
    if (key === 'theme_id') {
      const value = parseScalar(rest);
      stored.themeId = value === null ? null : String(value);
    } else if (key === 'tweaks') {
      const inline = stripComment(rest);
      if (inline === '') {
        inTweaks = true;
        tweaksIndent = indent.length;
      } else if (inline.startsWith('{') && inline.endsWith('}')) {
        for (const pair of inline.slice(1, -1).split(',')) {
          const separator = pair.indexOf(':');
          if (separator === -1) continue;
          const value = parseScalar(pair.slice(separator + 1));
          if (value !== null) stored.tweaks[pair.slice(0, separator).trim()] = value;
        }
      }
    }
  }
  return stored;
}

/**
 * What the site renders for a stored block, resolved like the template's
 * `ink/resolve.html` but only among `offered` (the manifests the repository
 * actually has): an absent block or an id not offered falls back to classic,
 * then to the first offered theme, and invalid tweaks fall back to their
 * defaults. Null only when nothing is offered.
 */
export function resolveStoredAppearance(
  stored: StoredAppearance | null,
  offered: readonly CatalogTheme[] = THEMES,
): SiteAppearance | null {
  const requested = stored?.themeId?.toLowerCase() ?? null;
  const theme = offered.find((candidate) => candidate.id === requested) ??
    offered.find((candidate) => candidate.id === defaultTheme().id) ??
    offered[0];
  if (!theme) return null;
  // Liquid validates the stored tweaks against whichever manifest won.
  return appearanceFor(theme, stored?.tweaks ?? {});
}
