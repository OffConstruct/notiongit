/**
 * `GET /themes[?category=<id>]` (gallery) and `GET /themes/<id>[?t_*]`
 * (detail). Both are public, server-rendered and identical for every
 * visitor, so they are cacheable. The gallery has no script; the detail page
 * loads `/assets/customizer.js` for live preview updates and
 * `/assets/preview-stage.js` for the desktop-scaled preview, and works
 * without either.
 */

import { pageHeaders } from './http-headers';
import {
  defaultTheme,
  findTheme,
  isThemeCategory,
  parseAppearanceParams,
  THEME_CATEGORIES,
  THEMES,
  themesInCategory,
  tweakQuery,
  type CatalogTheme,
  type SiteAppearance,
  type ThemeCategory,
} from './theme-catalog';
import {
  categoryLabel,
  customizerDataHtml,
  escapeHtml,
  pageShell,
  previewFrameHtml,
  PREVIEW_STAGE_SCRIPT,
  themeCardHtml,
  tweakFieldsHtml,
} from './theme-ui';

export const THEMES_PAGE_MAX_AGE_SECONDS = 300;
export const CUSTOMIZER_SCRIPT = '/assets/customizer.js';
export const AUTHORING_GUIDE = 'https://github.com/OffConstruct/notiongit-template/blob/main/docs/themes/authoring.md';

export function themeDetailHref(theme: CatalogTheme): string {
  return `/themes/${theme.id}`;
}

export function themesGalleryPage(category: ThemeCategory | null): string {
  const themes = category === null ? THEMES : themesInCategory(category);
  const used = THEME_CATEGORIES.filter((entry) => THEMES.some((theme) => theme.categories.includes(entry.id)));
  const filter = [
    `<li><a href="/themes"${category === null ? ' aria-current="page"' : ''}>All</a></li>`,
    ...used.map((entry) =>
      `<li><a href="/themes?category=${entry.id}"${entry.id === category ? ' aria-current="page"' : ''}>${escapeHtml(entry.label)}</a></li>`),
  ].join('');
  const heading = category === null ? 'Themes' : `Themes for ${categoryLabel(category).toLowerCase()}`;
  return pageShell({
    title: `${heading} | InkDrafts`,
    description: 'Pick a look for your InkDrafts site. Every theme is a real Jekyll theme in your own repository.',
    body: `<h1>${escapeHtml(heading)}</h1>
<p>Every theme is part of your site’s repository. After setup, you can switch themes any time from Manage your site. Previews use sample content.</p>
<nav aria-label="Theme categories"><ul class="chips">${filter}</ul></nav>
<ul class="theme-grid">
${themes.map((theme) => themeCardHtml(theme, { href: themeDetailHref(theme), headingLevel: 2 })).join('\n')}
</ul>
<section class="build" aria-labelledby="build-heading">
<h2 id="build-heading">Build your own theme</h2>
<p>A theme is one folder and one pull request: a manifest, its layouts and one stylesheet, checked by the same validator as every theme here.</p>
<p><a href="${AUTHORING_GUIDE}">Read the theme authoring guide</a></p>
</section>`,
  });
}

/** The theme's first category in catalog order, wrapping around, so no
 * theme is a dead end. Null when the category holds only this theme. */
function neighbours(theme: CatalogTheme): { previous: CatalogTheme; next: CatalogTheme; siblings: readonly CatalogTheme[] } | null {
  const siblings = themesInCategory(theme.categories[0]);
  const index = siblings.findIndex((candidate) => candidate.id === theme.id);
  if (index < 0 || siblings.length < 2) return null;
  return {
    previous: siblings[(index - 1 + siblings.length) % siblings.length],
    next: siblings[(index + 1) % siblings.length],
    siblings,
  };
}

export function themeDetailPage(theme: CatalogTheme, appearance: SiteAppearance): string {
  const around = neighbours(theme);
  const category = categoryLabel(theme.categories[0]).toLowerCase();
  const author = theme.author.url
    ? `<a href="${escapeHtml(theme.author.url)}">${escapeHtml(theme.author.name)}</a>`
    : escapeHtml(theme.author.name);
  const webfonts = theme.fonts.some((font) => font.webfont)
    ? '<p class="muted">Previews load this theme’s fonts from Google Fonts, as your site will. You can switch web fonts off in the options.</p>'
    : '';
  const chips = theme.categories
    .map((entry) => `<li><a href="/themes?category=${entry}">${escapeHtml(categoryLabel(entry))}</a></li>`)
    .join('');
  const others = around
    ? around.siblings.filter((sibling) => sibling.id !== theme.id)
      .map((sibling) => `<a href="${themeDetailHref(sibling)}">${escapeHtml(sibling.name)}</a>`).join(' · ')
    : '';
  const pager = around
    ? `<nav class="pager" aria-label="More themes for ${escapeHtml(category)}">
<a href="${themeDetailHref(around.previous)}">Previous: ${escapeHtml(around.previous.name)}</a>
<p>More for ${escapeHtml(category)}: ${others}</p>
<a href="${themeDetailHref(around.next)}">Next: ${escapeHtml(around.next.name)}</a>
</nav>`
    : '';
  return pageShell({
    title: `${theme.name} theme | InkDrafts`,
    description: theme.summary,
    scripts: [PREVIEW_STAGE_SCRIPT, CUSTOMIZER_SCRIPT],
    body: `<p class="back"><a href="/themes">All themes</a></p>
<h1>${escapeHtml(theme.name)}</h1>
<p class="lead">${escapeHtml(theme.summary)}</p>
<div class="detail">
<div class="preview-pin">
${previewFrameHtml(theme, appearance)}
</div>
<form class="tweak-form" method="get" action="/connect/github" data-customizer>
<input type="hidden" name="theme" value="${escapeHtml(theme.id)}">
<div class="actions">
<button type="submit" class="primary">Use this theme</button>
<button type="submit" formaction="/themes/${escapeHtml(theme.id)}" data-js-hidden>Preview</button>
</div>
<fieldset>
<legend>Options</legend>
${tweakFieldsHtml(theme, appearance)}
</fieldset>
<p class="muted">These options are stored in your site’s <code>_config.yml</code>. You can change them later.</p>
</form>
</div>
${customizerDataHtml(theme)}
<div class="about">
<p>${escapeHtml(theme.description)}</p>
${webfonts}
<p class="muted">By ${author} &middot; version ${escapeHtml(theme.version)}</p>
<ul class="chips" aria-label="Categories">${chips}</ul>
</div>
${pager}`,
  });
}

function notFoundPage(): string {
  return pageShell({
    title: 'Theme not found | InkDrafts',
    body: `<h1>We could not find that theme</h1>
<p>It may have been renamed. <a href="/themes">Browse all themes</a>.</p>`,
  });
}

const PUBLIC_PAGE = { frames: false, scripts: false, publicMaxAgeSeconds: THEMES_PAGE_MAX_AGE_SECONDS } as const;

/** `/themes?theme=<id>&t_*` is the landing form's "See every option"
 * button: it lands on that theme's page with the choice carried over. */
function chosenThemeRedirect(params: URLSearchParams): Response | null {
  const theme = findTheme(params.get('theme') ?? '');
  if (!theme) return null;
  const parsed = parseAppearanceParams(params);
  const query = parsed.kind === 'ok' ? tweakQuery(parsed.appearance) : '';
  return new Response(null, {
    status: 303,
    headers: { location: `${themeDetailHref(theme)}${query ? `?${query}` : ''}`, 'cache-control': 'no-store' },
  });
}

export function themesGalleryResponse(request: Request): Response {
  const redirect = chosenThemeRedirect(new URL(request.url).searchParams);
  if (redirect) return redirect;
  const requested = new URL(request.url).searchParams.get('category');
  const category = requested !== null && isThemeCategory(requested) ? requested : null;
  return new Response(themesGalleryPage(category), { status: 200, headers: pageHeaders(PUBLIC_PAGE) });
}

/** `/themes/<id>` with optional `t_*` from the no-JS Preview button or a
 * shared link; invalid values fall back to defaults like everywhere else,
 * and any other spelling of the same choice redirects to the canonical
 * query (non-default values only). */
export function themeDetailResponse(request: Request, id: string): Response {
  const theme = findTheme(id);
  if (!theme) return new Response(notFoundPage(), { status: 404, headers: pageHeaders(PUBLIC_PAGE) });
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  params.set('theme', theme.id);
  const parsed = parseAppearanceParams(params);
  const appearance: SiteAppearance = parsed.kind === 'ok' ? parsed.appearance : { v: 1, themeId: theme.id, tweaks: {} };
  const canonical = tweakQuery(appearance);
  if (url.search.slice(1) !== canonical) {
    return new Response(null, {
      status: 303,
      headers: { location: `${themeDetailHref(theme)}${canonical ? `?${canonical}` : ''}`, 'cache-control': 'no-store' },
    });
  }
  return new Response(themeDetailPage(theme, appearance), {
    status: 200,
    headers: pageHeaders({ frames: true, scripts: true, publicMaxAgeSeconds: THEMES_PAGE_MAX_AGE_SECONDS }),
  });
}

/** A link inside a preview that is not part of the exported page set. It
 * renders inside the preview iframe, so it stays framable by this origin. */
export function previewMissPage(themeId: string): string {
  const theme = findTheme(themeId) ?? defaultTheme();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not in this preview</title>
<style>body{font-family:system-ui,sans-serif;margin:3rem auto;max-width:36rem;padding:0 1.5rem;line-height:1.55}</style>
</head>
<body>
<main>
<h1>This page is not part of the preview</h1>
<p>The preview shows a few sample pages. <a href="${escapeHtml(theme.preview)}">Back to the ${escapeHtml(theme.name)} preview</a>.</p>
</main>
</body>
</html>`;
}
