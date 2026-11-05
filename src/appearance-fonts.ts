/**
 * One font control per design. Designs with a font list also declare the
 * `webfonts` switch ("Use the design's own fonts"), and showing both asks the
 * same question twice. For those designs the list is the only control: its
 * pairings that load nothing already mean "no download", and a design whose
 * pairings all download gets one extra choice, `DEVICE_FONTS`. The stored
 * shape is unchanged; the choice is folded back into `font` and `webfonts`
 * before parsing, so a save never submits the switch as off by omission.
 */

import type { CatalogTheme, SiteAppearance, TweakValue } from './theme-catalog';

/** The font list's form value for "no download" on an all-web-font design. */
export const DEVICE_FONTS = 'device';
const DEVICE_FONTS_LABEL = 'Your device’s own fonts (nothing to download)';

function foldsFonts(theme: CatalogTheme): boolean {
  return theme.tweaks.some((tweak) => tweak.key === 'font') && theme.tweaks.some((tweak) => tweak.key === 'webfonts');
}

/** The design and choice as the form shows them: no `webfonts` switch, and
 * web fonts turned off shown as the list's no-download choice. */
export function fontControlView(theme: CatalogTheme, appearance: SiteAppearance): { theme: CatalogTheme; appearance: SiteAppearance } {
  if (!foldsFonts(theme)) return { theme, appearance };
  const offline = theme.fonts.find((font) => !font.webfont)?.value ?? null;
  const fonts = offline === null
    ? [...theme.fonts, { value: DEVICE_FONTS, label: DEVICE_FONTS_LABEL, webfont: false }]
    : theme.fonts;
  const { webfonts, ...rest } = appearance.tweaks;
  const tweaks: Record<string, TweakValue> = rest;
  const fontTweak = theme.tweaks.find((tweak) => tweak.key === 'font');
  const font = String(tweaks.font ?? fontTweak?.default ?? '');
  const downloads = theme.fonts.find((candidate) => candidate.value === font)?.webfont ?? true;
  if (webfonts === false && downloads) tweaks.font = offline ?? DEVICE_FONTS;
  return {
    theme: { ...theme, fonts, tweaks: theme.tweaks.filter((tweak) => tweak.key !== 'webfonts') },
    appearance: { ...appearance, tweaks },
  };
}

/**
 * Turn the form's `t_font=device` back into `webfonts: false`. The pairing
 * stays the one already saved with web fonts off, if any, since its fallback
 * fonts are what the site shows today. Any other font choice leaves
 * `t_webfonts` out, so it takes the design's default (on): picking a font
 * that downloads means wanting it downloaded.
 */
export function foldFontChoice(params: URLSearchParams, current: SiteAppearance | null = null): URLSearchParams {
  if (params.getAll('t_font').at(-1) !== DEVICE_FONTS) return params;
  const folded = new URLSearchParams([...params].filter(([name]) => name !== 't_font' && name !== 't_webfonts'));
  folded.append('t_webfonts', 'off');
  const kept = current !== null && current.themeId === params.get('theme') && current.tweaks.webfonts === false
    ? current.tweaks.font
    : undefined;
  if (typeof kept === 'string') folded.append('t_font', kept);
  return folded;
}
