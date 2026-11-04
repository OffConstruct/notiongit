/**
 * `GET /preview/<id>/?t_*`: a theme's exported preview home page with the
 * tweaks applied on the server, so the preview is right without JavaScript
 * (the no-JS Preview buttons and every first paint of a non-default look).
 *
 * The exported page is read from the static assets and rewritten the way the
 * template's `preview.js` rewrites it in the browser: the `<html>` data
 * attributes, the `#ink-tweaks` declarations, the color-scheme meta and the
 * Google Fonts link. Values are validated by `parseAppearanceParams` (the
 * same rules as a save); hexes and font stacks come from the page's own
 * `#ink-manifest`, which the template validator keeps free of markup.
 */

import { previewFallbackHeaders } from './http-headers';
import { effectiveTweaks, findTheme, parseAppearanceParams, type TweakValue } from './theme-catalog';
import { previewMissPage } from './themes-page';

export interface PreviewAssets {
  fetch: (request: Request) => Promise<Response>;
}

/** Mirrors the `/previews/*` block of `public/_headers`, which Workers do not
 * apply to responses the Worker builds. */
export const PREVIEW_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'public, max-age=3600',
  'content-type': 'text/html; charset=utf-8',
};

interface ManifestFont {
  value: string;
  google: string | null;
  stacks: { body: string; display: string; mono: string };
}

interface ManifestTweak {
  key: string;
  type: 'select' | 'boolean' | 'color' | 'range' | 'font';
  unit?: string;
  presets?: { value: string; light: string; dark: string; on?: string }[];
}

interface PreviewManifest {
  id: string;
  fonts: ManifestFont[];
  tweaks: ManifestTweak[];
}

const MANIFEST_PATTERN = /<script type="application\/json" id="ink-manifest">([\s\S]*?)<\/script>/u;

/** What preview.js's `apply` computes, from already validated values. */
export function previewOverrides(manifest: PreviewManifest, values: Readonly<Record<string, TweakValue>>): {
  attributes: [string, string][];
  vars: string;
  colorScheme: string;
  fontsHref: string | null;
} {
  const attributes: [string, string][] = [];
  let vars = '';
  let pairing = manifest.fonts[0];
  let webfonts = true;
  let colorScheme = 'light dark';
  for (const tweak of manifest.tweaks) {
    const value = values[tweak.key];
    const name = tweak.key.replaceAll('_', '-');
    switch (tweak.type) {
      case 'select':
        attributes.push([`data-ink-${name}`, String(value)]);
        if (tweak.key === 'mode' && (value === 'light' || value === 'dark')) colorScheme = value;
        break;
      case 'boolean':
        attributes.push([`data-ink-${name}`, value === true ? 'on' : 'off']);
        if (tweak.key === 'webfonts') webfonts = value === true;
        break;
      case 'color': {
        const preset = tweak.presets?.find((candidate) => candidate.value === value);
        attributes.push([`data-ink-${name}`, preset ? preset.value : 'custom']);
        vars += preset
          ? `--tw-${name}:${preset.light};--tw-${name}-dark:${preset.dark};${preset.on ? `--tw-${name}-on:${preset.on};` : ''}`
          : `--tw-${name}:${String(value)};`;
        break;
      }
      case 'range':
        vars += `--tw-${name}:${String(value)}${tweak.unit ?? ''};`;
        break;
      case 'font':
        attributes.push(['data-ink-font', String(value)]);
        pairing = manifest.fonts.find((font) => font.value === value) ?? pairing;
        break;
    }
  }
  if (pairing) vars += `--tw-font-body:${pairing.stacks.body};--tw-font-display:${pairing.stacks.display};--tw-font-mono:${pairing.stacks.mono};`;
  const fontsHref = webfonts && pairing?.google ? `https://fonts.googleapis.com/css2?${pairing.google}&display=swap` : null;
  return { attributes, vars, colorScheme, fontsHref };
}

function miss(themeId: string): Response {
  return new Response(previewMissPage(themeId), { status: 404, headers: previewFallbackHeaders() });
}

export async function previewRenderResponse(request: Request, themeId: string, assets: PreviewAssets | undefined): Promise<Response> {
  const theme = findTheme(themeId);
  if (!theme) return miss(themeId);
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  params.set('theme', theme.id);
  const parsed = parseAppearanceParams(params);
  const tweaks = parsed.kind === 'ok' ? parsed.appearance.tweaks : {};
  const staticUrl = new URL(theme.preview, url);
  // No asset binding (unit tests, or a misconfigured deploy): the static
  // export plus preview.js still shows the tweaks when scripts run.
  if (!assets) return Response.redirect(`${staticUrl.toString()}${url.search}`, 302);

  const exported = await assets.fetch(new Request(staticUrl, { method: 'GET' }));
  if (!exported.ok) return miss(theme.id);
  const document = await exported.text();
  let manifest: PreviewManifest;
  try {
    manifest = JSON.parse(MANIFEST_PATTERN.exec(document)?.[1] ?? '') as PreviewManifest;
  } catch {
    return new Response(document, { headers: PREVIEW_HEADERS });
  }
  const overrides = previewOverrides(manifest, effectiveTweaks(theme, tweaks));
  const hasFontsLink = document.includes('id="ink-fonts"');
  const fontsLink = overrides.fontsHref === null
    ? ''
    : `\n<link id="ink-fonts" href="${overrides.fontsHref.replaceAll('&', '&amp;')}" rel="stylesheet">`;

  const rewritten = new HTMLRewriter()
    .on('html', {
      element(element) {
        for (const [name, value] of overrides.attributes) element.setAttribute(name, value);
      },
    })
    .on('meta[name="color-scheme"]', {
      element(element) {
        element.setAttribute('content', overrides.colorScheme);
        if (!hasFontsLink && fontsLink) element.after(fontsLink, { html: true });
      },
    })
    .on('link#ink-fonts', {
      element(element) {
        if (overrides.fontsHref === null) element.remove();
        else element.setAttribute('href', overrides.fontsHref);
      },
    })
    // Every value here is validated (hexes, numbers, units) or comes from the
    // manifest, whose strings the template validator keeps free of markup.
    .on('style#ink-tweaks', {
      element(element) {
        element.setInnerContent(`:root{${overrides.vars}}`, { html: true });
      },
    })
    .transform(new Response(document, { headers: PREVIEW_HEADERS }));
  return rewritten;
}
