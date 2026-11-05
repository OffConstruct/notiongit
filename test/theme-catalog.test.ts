import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  appearanceFor,
  carryTweaks,
  contrastRatio,
  customColorAllowed,
  customColorVerdict,
  darkLifted,
  defaultTheme,
  normalizeTweaks,
  parseAppearanceParams,
  parseStoredAppearance,
  readAppearanceBlock,
  renderAppearanceBlock,
  resolveStoredAppearance,
  THEME_AUDIENCES,
  THEME_CATEGORIES,
  THEMES,
  type CatalogTheme,
  type SiteAppearance,
  type ThemeId,
  type TweakValue,
} from '../src/theme-catalog';
import { THEME_CATALOG_DATA } from '../src/theme-catalog.generated';

const ROOT = join(import.meta.dir, '..');
const PREVIEWS = join(ROOT, 'public', 'previews');
const TEMPLATE = join(ROOT, '..', 'notiongit-template');

interface GoldenManifest {
  id: string;
  name: string;
  palette: CatalogTheme['palette'];
  fonts: { value: string; label: string; google: string | null; stacks: Record<string, string> }[];
  tweaks: CatalogTheme['tweaks'];
}

interface GoldenCase {
  name: string;
  input: Record<string, string>;
  expected: Record<string, TweakValue>;
  worker_only?: string;
}

const GOLDEN = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'tweak-cases.json'), 'utf8')) as {
  manifest: GoldenManifest;
  cases: GoldenCase[];
};

/** The golden manifest in the shape the generator writes. */
const GOLDEN_THEME: CatalogTheme = {
  id: GOLDEN.manifest.id as ThemeId,
  name: GOLDEN.manifest.name,
  version: '1.0.0',
  summary: 'A theme that exercises every tweak type.',
  description: 'Golden fixture.',
  categories: ['writers'],
  audience: [],
  author: { name: 'InkDrafts' },
  palette: GOLDEN.manifest.palette,
  fonts: GOLDEN.manifest.fonts.map((font) => ({ value: font.value, label: font.label, webfont: font.google !== null })),
  tweaks: GOLDEN.manifest.tweaks,
  preview: '/previews/golden/',
  thumbnail: '/previews/golden/thumb.webp',
  thumbnailSmall: '/previews/golden/thumb-320.webp',
};

const silentConsole = new VirtualConsole();
const PREVIEW_JS = readFileSync(join(PREVIEWS, 'classic', 'assets', 'ink-preview', 'preview.js'), 'utf8');

/** Run the template's preview.js on a minimal preview page and report the
 * effective value of every tweak from the attributes and #ink-tweaks it wrote. */
function previewEffective(input: Record<string, string>): Record<string, TweakValue> {
  const query = new URLSearchParams(Object.entries(input).map(([key, value]) => [`t_${key}`, value])).toString();
  const manifest = JSON.stringify(GOLDEN.manifest).replaceAll('<', '\\u003c');
  const dom = new JSDOM(`<!doctype html><html><head><meta name="color-scheme" content="light dark"><style id="ink-tweaks"></style>
<script type="application/json" id="ink-manifest">${manifest}</script></head><body></body></html>`, {
    url: `https://inkdrafts.test/previews/golden/?${query}`,
    runScripts: 'outside-only',
    virtualConsole: silentConsole,
  });
  dom.window.eval(PREVIEW_JS);
  const root = dom.window.document.documentElement;
  const vars = dom.window.document.getElementById('ink-tweaks')!.textContent ?? '';
  const effective: Record<string, TweakValue> = {};
  for (const tweak of GOLDEN.manifest.tweaks) {
    const name = tweak.key.replaceAll('_', '-');
    if (tweak.type === 'select') effective[tweak.key] = root.getAttribute(`data-ink-${name}`)!;
    else if (tweak.type === 'boolean') effective[tweak.key] = root.getAttribute(`data-ink-${name}`) === 'on';
    else if (tweak.type === 'font') effective[tweak.key] = root.getAttribute('data-ink-font')!;
    else if (tweak.type === 'range') effective[tweak.key] = Number(vars.match(new RegExp(`--tw-${name}:(-?[0-9.]+)`))![1]);
    else {
      const attribute = root.getAttribute(`data-ink-${name}`)!;
      effective[tweak.key] = attribute === 'custom' ? vars.match(new RegExp(`--tw-${name}:(#[0-9a-f]{6})`))![1] : attribute;
    }
  }
  dom.window.close();
  return effective;
}

function withDefaults(nonDefaults: Record<string, TweakValue>): Record<string, TweakValue> {
  return Object.fromEntries(GOLDEN.manifest.tweaks.map((tweak) => [tweak.key, nonDefaults[tweak.key] ?? tweak.default]));
}

describe('generated catalog', () => {
  test('every catalog theme has an exported preview with a thumbnail, and nothing else is exported', () => {
    const exported = readdirSync(PREVIEWS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .sort();
    expect(exported).toEqual(THEMES.map((theme) => theme.id).sort());
    for (const theme of THEMES) {
      expect(existsSync(join(PREVIEWS, theme.id, 'index.html'))).toBe(true);
      expect(existsSync(join(PREVIEWS, theme.id, 'thumb.webp'))).toBe(true);
      expect(existsSync(join(PREVIEWS, theme.id, 'thumb-320.webp'))).toBe(true);
      expect(theme.preview).toBe(`/previews/${theme.id}/`);
      expect(theme.thumbnail).toBe(`/previews/${theme.id}/thumb.webp`);
      expect(theme.thumbnailSmall).toBe(`/previews/${theme.id}/thumb-320.webp`);
    }
  });

  test('every link inside a preview opens an exported page', () => {
    const missing: string[] = [];
    for (const theme of THEMES) {
      const root = join(PREVIEWS, theme.id);
      const pages = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('index.html'));
      for (const page of pages) {
        const html = readFileSync(join(root, page), 'utf8');
        for (const [, href] of html.matchAll(/<a [^>]*href="(\/previews\/[^"#?]*)/gu)) {
          const path = href.endsWith('/') ? `${href}index.html` : href;
          if (!existsSync(join(PREVIEWS, '..', path))) missing.push(`${theme.id}/${page} -> ${href}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('summaries and option labels avoid the jargon the template lint bans', () => {
    const jargon = /\b(kicker|measure|markdown|mono|sans|sticky|centred|colour|grey|programme|catalogue)\b/iu;
    const offenders: string[] = [];
    for (const theme of THEMES) {
      const strings = [theme.summary, ...theme.tweaks.flatMap((tweak) => [tweak.label,
        ...('options' in tweak ? tweak.options.map((option) => option.label) : []),
        ...('presets' in tweak ? tweak.presets.map((preset) => preset.label) : [])])];
      for (const text of strings) if (jargon.test(text)) offenders.push(`${theme.id}: ${text}`);
    }
    expect(offenders).toEqual([]);
  });

  test('themes are sorted by id and classic is the default', () => {
    const ids = THEMES.map((theme) => theme.id);
    expect(ids).toEqual([...ids].sort());
    expect(defaultTheme().id).toBe('classic' as ThemeId);
  });

  test('every theme declares the universal tweaks', () => {
    for (const theme of THEMES) {
      const types = Object.fromEntries(theme.tweaks.map((tweak) => [tweak.key, tweak.type]));
      expect({ id: theme.id, mode: types.mode, accent: types.accent, webfonts: types.webfonts })
        .toEqual({ id: theme.id, mode: 'select', accent: 'color', webfonts: 'boolean' });
    }
  });

  test('the category enum equals the template schema enum', () => {
    const schemaPath = join(TEMPLATE, 'scripts', 'themes', 'theme.schema.json');
    const expected = existsSync(schemaPath)
      ? (JSON.parse(readFileSync(schemaPath, 'utf8')).$defs.category.enum as string[])
      : THEME_CATALOG_DATA.categories.map((category) => category.id);
    expect(THEME_CATEGORIES.map((category) => category.id)).toEqual(expected);
    for (const theme of THEMES) {
      for (const category of theme.categories) expect(expected).toContain(category);
    }
  });

  test('the audience enum equals the template schema enum', () => {
    const schemaPath = join(TEMPLATE, 'scripts', 'themes', 'theme.schema.json');
    if (existsSync(schemaPath)) expect(THEME_AUDIENCES).toEqual(JSON.parse(readFileSync(schemaPath, 'utf8')).$defs.audience.enum);
    for (const theme of THEMES) {
      for (const audience of theme.audience) expect(THEME_AUDIENCES).toContain(audience);
    }
  });

  test('every preset of a text accent clears its contrast floor against the light background', () => {
    for (const theme of THEMES) {
      for (const tweak of theme.tweaks) {
        if (tweak.type !== 'color' || tweak.role === 'surface') continue;
        for (const preset of tweak.presets) {
          expect({ theme: theme.id, preset: preset.value, ok: contrastRatio(preset.light, theme.palette.light.bg) >= (tweak.role === 'large' ? 3 : 4.5) })
            .toEqual({ theme: theme.id, preset: preset.value, ok: true });
        }
      }
    }
  });
});

describe('golden tweak cases', () => {
  for (const golden of GOLDEN.cases) {
    test(`normalizeTweaks: ${golden.name}`, () => {
      expect(normalizeTweaks(GOLDEN_THEME, golden.input)).toEqual(golden.expected);
    });
    if (golden.worker_only) continue;
    test(`preview.js agrees: ${golden.name}`, () => {
      expect(previewEffective(golden.input)).toEqual(withDefaults(golden.expected));
    });
  }

  test('typed config values (YAML booleans and numbers) normalize like their query spellings', () => {
    expect(normalizeTweaks(GOLDEN_THEME, { drop_cap: true, webfonts: false, measure: 36 }))
      .toEqual({ drop_cap: true, webfonts: false, measure: 36 });
    // An unquoted `columns: 2` or `cta: off` names a string option, as in the template's Liquid.
    const typed: CatalogTheme = {
      ...GOLDEN_THEME,
      tweaks: [
        ...GOLDEN_THEME.tweaks,
        { key: 'columns', type: 'select', label: 'Columns', default: '3', options: [{ value: '2', label: 'Two' }, { value: '3', label: 'Three' }] },
        { key: 'cta', type: 'select', label: 'Call to action', default: 'newsletter', options: [{ value: 'newsletter', label: 'N' }, { value: 'off', label: 'Off' }] },
      ],
    };
    expect(normalizeTweaks(typed, { columns: 2, cta: false })).toEqual({ columns: '2', cta: 'off' });
  });
});

describe('parseAppearanceParams', () => {
  const classic = defaultTheme();

  test('no theme parameter is no choice, even with tweaks', () => {
    expect(parseAppearanceParams(new URLSearchParams())).toEqual({ kind: 'none' });
    expect(parseAppearanceParams(new URLSearchParams('t_mode=dark&job_id=abc'))).toEqual({ kind: 'none' });
  });

  test('a valid theme with tampered tweaks keeps only valid non-defaults', () => {
    const parsed = parseAppearanceParams(new URLSearchParams('theme=classic&t_mode=dark&t_accent=violet&t_webfonts=true&t_bogus=1&t_accent2=%3Cscript%3E'));
    expect(parsed).toEqual({ kind: 'ok', appearance: { v: 1, themeId: classic.id, tweaks: { mode: 'dark', accent: 'violet' } } });
  });

  test('an unknown or malformed theme id is refused', () => {
    expect(parseAppearanceParams(new URLSearchParams('theme=nope'))).toEqual({ kind: 'unknown_theme' });
    expect(parseAppearanceParams(new URLSearchParams('theme=Classic'))).toEqual({ kind: 'unknown_theme' });
    expect(parseAppearanceParams(new URLSearchParams('theme=../classic'))).toEqual({ kind: 'unknown_theme' });
  });

  test('oversize queries are refused before any lookup', () => {
    const long = new URLSearchParams({ theme: 'classic', t_mode: 'x'.repeat(1100) });
    expect(parseAppearanceParams(long)).toEqual({ kind: 'oversize' });
    const many = new URLSearchParams([['theme', 'classic'], ...Array.from({ length: 17 }, (_, index) => [`t_k${index}`, '1'])]);
    expect(parseAppearanceParams(many)).toEqual({ kind: 'oversize' });
  });

  test('form conventions: the last repeated value wins and custom reads c_<key>', () => {
    const parsed = parseAppearanceParams(new URLSearchParams('theme=classic&t_webfonts=off&t_webfonts=on&t_accent=custom&c_accent=%230B6E4F'));
    expect(parsed).toEqual({ kind: 'ok', appearance: { v: 1, themeId: classic.id, tweaks: { accent: '#0b6e4f' } } });
    const unchecked = parseAppearanceParams(new URLSearchParams('theme=classic&t_webfonts=off&t_accent=blue&c_accent=%23000000'));
    expect(unchecked).toEqual({ kind: 'ok', appearance: { v: 1, themeId: classic.id, tweaks: { webfonts: false } } });
  });
});

describe('custom colors and theme switches', () => {
  test('customColorAllowed enforces the role floor and the custom flag', () => {
    expect(customColorAllowed(GOLDEN_THEME, 'accent', '#0b6e4f', 'auto')).toBe(true);
    expect(customColorAllowed(GOLDEN_THEME, 'accent', '#f0e0d0', 'auto')).toBe(false);
    expect(customColorAllowed(GOLDEN_THEME, 'band', '#000000', 'auto')).toBe(false);
    expect(customColorAllowed(GOLDEN_THEME, 'mode', '#000000', 'auto')).toBe(false);
  });

  test('the contrast verdict checks the grounds the color scheme shows and names the failing one', () => {
    const accent = GOLDEN_THEME.tweaks.find((tweak) => tweak.key === 'accent')!;
    if (accent.type !== 'color') throw new Error('unreachable');
    expect(customColorVerdict(GOLDEN_THEME, accent, '#f0e060', 'dark').ok).toBe(true);
    expect(customColorVerdict(GOLDEN_THEME, accent, '#f0e060', 'light')).toMatchObject({ ok: false, ground: 'light', needed: 4.5 });
    expect(customColorVerdict(GOLDEN_THEME, accent, '#f0e060', 'auto')).toMatchObject({ ok: false, ground: 'light' });
    // The theme lifts a dark custom accent to oklch L 0.74 on its dark ground.
    expect(darkLifted('#1a2a6c')).not.toBe('#1a2a6c');
    expect(darkLifted('#f0e060')).toBe('#f0e060');
    expect(customColorVerdict(GOLDEN_THEME, accent, '#1a2a6c', 'dark').ok).toBe(true);
  });

  test('carryTweaks keeps what the new theme declares with a valid value', () => {
    const from: SiteAppearance = { v: 1, themeId: 'golden' as ThemeId, tweaks: { mode: 'dark', accent: 'teal', drop_cap: true, measure: 36 } };
    const carried = carryTweaks(from, defaultTheme());
    expect(carried).toEqual({ v: 1, themeId: defaultTheme().id, tweaks: { mode: 'dark' } });
  });

  test('parseStoredAppearance re-validates what KV hands back', () => {
    expect(parseStoredAppearance({ v: 1, themeId: 'classic', tweaks: { mode: 'dark', accent: '<b>' } }))
      .toEqual({ v: 1, themeId: defaultTheme().id, tweaks: { mode: 'dark' } });
    expect(parseStoredAppearance({ v: 1, themeId: 'gone', tweaks: {} })).toBeNull();
    expect(parseStoredAppearance({ v: 2, themeId: 'classic', tweaks: {} })).toBeNull();
    expect(parseStoredAppearance(undefined)).toBeNull();
    expect(parseStoredAppearance({ v: 1, themeId: 'classic', tweaks: [] })).toBeNull();
  });
});

describe('the inkdrafts: block', () => {
  test('classic with no tweaks renders exactly the block the template ships', () => {
    const block = renderAppearanceBlock(appearanceFor(defaultTheme(), {}));
    expect(block).toBe('inkdrafts:\n  theme_id: "classic"\n  tweaks: {}');
    const templateConfig = join(TEMPLATE, '_config.yml');
    if (existsSync(templateConfig)) expect(readFileSync(templateConfig, 'utf8')).toContain(`${block}\n`);
  });

  test('strings are JSON-quoted, booleans and numbers bare, keys in manifest order', () => {
    const appearance: SiteAppearance = { v: 1, themeId: 'classic' as ThemeId, tweaks: { webfonts: false, accent: '#0b6e4f', mode: 'dark' } };
    expect(renderAppearanceBlock(appearance)).toBe(
      'inkdrafts:\n  theme_id: "classic"\n  tweaks:\n    mode: "dark"\n    accent: "#0b6e4f"\n    webfonts: false',
    );
  });

  test('render then read round-trips, including numbers and an owner comment', () => {
    const appearance: SiteAppearance = { v: 1, themeId: 'golden' as ThemeId, tweaks: { mode: 'dark', drop_cap: true, measure: 36, accent: '#0b6e4f' } };
    const text = `title: "x"\n${renderAppearanceBlock(appearance)}  # owner note\nmarkdown: kramdown\n`;
    expect(readAppearanceBlock(text)).toEqual({ themeId: 'golden', tweaks: { mode: 'dark', drop_cap: true, measure: 36, accent: '#0b6e4f' } });
  });

  test('reads hand-written variants', () => {
    expect(readAppearanceBlock('inkdrafts:\n  theme_id: classic\n  tweaks: {}\n')).toEqual({ themeId: 'classic', tweaks: {} });
    expect(readAppearanceBlock("inkdrafts:\n  theme_id: 'quire'\n  tweaks: { mode: \"dark\", measure: 36 }\n"))
      .toEqual({ themeId: 'quire', tweaks: { mode: 'dark', measure: 36 } });
    expect(readAppearanceBlock('title: "x"\n')).toBeNull();
    expect(readAppearanceBlock('inkdrafts: "classic"\n')).toEqual({ themeId: null, tweaks: {} });
  });

  test('resolution falls back like the template: unknown ids become classic, bad tweaks become defaults', () => {
    expect(resolveStoredAppearance(null)).toEqual({ v: 1, themeId: defaultTheme().id, tweaks: {} });
    expect(resolveStoredAppearance({ themeId: 'nope', tweaks: { mode: 'dark', accent: '<script>' } }))
      .toEqual({ v: 1, themeId: defaultTheme().id, tweaks: { mode: 'dark' } });
    expect(resolveStoredAppearance({ themeId: 'CLASSIC', tweaks: { webfonts: false } }))
      .toEqual({ v: 1, themeId: defaultTheme().id, tweaks: { webfonts: false } });
  });

  test('resolution only picks among the offered manifests: classic, then the first offered, then nothing', () => {
    const [first, second] = THEMES.filter((theme) => theme.id !== defaultTheme().id);
    expect(resolveStoredAppearance({ themeId: second!.id, tweaks: {} }, [first!])?.themeId).toBe(first!.id);
    expect(resolveStoredAppearance(null, [first!, defaultTheme()])?.themeId).toBe(defaultTheme().id);
    expect(resolveStoredAppearance({ themeId: second!.id, tweaks: {} }, [first!, second!])?.themeId).toBe(second!.id);
    expect(resolveStoredAppearance(null, [])).toBeNull();
  });
});
