/**
 * `GET /themes[?for=<group>]` (gallery) and `GET /themes/<id>[?t_*]`
 * (detail). Both are public, server-rendered and identical for every
 * visitor, so they are cacheable. The gallery has no script; the detail page
 * loads `/assets/customizer.js` for live preview updates and
 * `/assets/preview-stage.js` for the device-scaled preview, and works
 * without either. The gallery and the landing page render the same cards
 * and the same audience filter from `theme-ui.ts`.
 */

import { foldFontChoice, fontControlView } from './appearance-fonts';
import { CONNECT_PATH } from './connect-page';
import { pageHeaders } from './http-headers';
import {
  defaultTheme,
  findTheme,
  isThemeCategory,
  parseAppearanceParams,
  THEMES,
  tweakQuery,
  type CatalogTheme,
  type SiteAppearance,
} from './theme-catalog';
import {
  audienceLine,
  customizerDataHtml,
  escapeHtml,
  galleryCardHtml,
  GALLERY_GROUPS,
  galleryGroup,
  galleryGroupsOf,
  galleryLinkFilterHtml,
  galleryOrder,
  pageShell,
  previewFrameHtml,
  PREVIEW_STAGE_SCRIPT,
  themesInGroup,
  tweakFieldsHtml,
  type GalleryGroup,
} from './theme-ui';

export const THEMES_PAGE_MAX_AGE_SECONDS = 300;
export const CUSTOMIZER_SCRIPT = '/assets/customizer.js';
export const AUTHORING_GUIDE = 'https://github.com/OffConstruct/notiongit-template/blob/main/docs/themes/authoring.md';

export function themeDetailHref(theme: CatalogTheme): string {
  return `/themes/${theme.id}`;
}

/** A group id (`?for=`), or a category id from an older link, to its group. */
export function resolveGalleryGroup(value: string | null): GalleryGroup | null {
  if (value === null) return null;
  const group = galleryGroup(value);
  if (group) return group;
  if (!isThemeCategory(value)) return null;
  return GALLERY_GROUPS.find((candidate) => candidate.categories.includes(value)) ?? null;
}

export function themesGalleryPage(requested: GalleryGroup | string | null): string {
  const group = typeof requested === 'string' ? resolveGalleryGroup(requested) : requested;
  const themes = galleryOrder(group === null ? THEMES : themesInGroup(group));
  const heading = group === null ? 'Every design' : `Designs for ${group.label.toLowerCase()}`;
  return pageShell({
    title: `${heading} | InkDrafts`,
    description: 'Pick a look for your InkDrafts website. Every design is a complete site; your writing stays in Notion.',
    body: `<h1>${escapeHtml(heading)}</h1>
<p class="lead">${THEMES.length} designs, each a complete website that works on phones and computers. Pick one to see it with sample writing and your colors. You can switch any time later from your site settings, and your writing stays where it is, in Notion.</p>
${galleryLinkFilterHtml(THEMES, group?.id ?? null)}
<ul class="theme-grid">
${themes.map((theme, index) => galleryCardHtml(theme, { href: themeDetailHref(theme), index })).join('\n')}
</ul>
<section class="build" aria-labelledby="build-heading">
<h2 id="build-heading">For developers: build your own design</h2>
<p>A design is one folder and one pull request: a manifest, its layouts and one stylesheet, checked by the same validator as every design here.</p>
<p><a href="${AUTHORING_GUIDE}">Read the theme authoring guide</a></p>
</section>`,
  });
}

/** The theme's first audience group, in gallery order, wrapping around, so
 * no theme is a dead end. Null when the group holds only this theme. */
function neighbours(theme: CatalogTheme): { previous: CatalogTheme; next: CatalogTheme; group: GalleryGroup } | null {
  const group = galleryGroupsOf(theme)[0];
  if (!group) return null;
  const siblings = galleryOrder(themesInGroup(group));
  const index = siblings.findIndex((candidate) => candidate.id === theme.id);
  if (index < 0 || siblings.length < 2) return null;
  return {
    previous: siblings[(index - 1 + siblings.length) % siblings.length]!,
    next: siblings[(index + 1) % siblings.length]!,
    group,
  };
}

function pagerHtml(theme: CatalogTheme, position: 'head' | 'foot'): string {
  const around = neighbours(theme);
  if (!around) return '';
  const label = position === 'head' ? 'Other designs for ' : 'More designs for ';
  return `<nav class="pager${position === 'foot' ? ' foot' : ''}" aria-label="${label}${escapeHtml(around.group.label.toLowerCase())}">
<a href="${themeDetailHref(around.previous)}" rel="prev">← ${escapeHtml(around.previous.name)}</a>
<p><a href="/themes?for=${around.group.id}">All for ${escapeHtml(around.group.label.toLowerCase())}</a></p>
<a href="${themeDetailHref(around.next)}" rel="next">${escapeHtml(around.next.name)} →</a>
</nav>`;
}

export function themeDetailPage(theme: CatalogTheme, appearance: SiteAppearance): string {
  const fonts = fontControlView(theme, appearance);
  const author = theme.author.url
    ? `<a href="${escapeHtml(theme.author.url)}">${escapeHtml(theme.author.name)}</a>`
    : escapeHtml(theme.author.name);
  const webfonts = theme.fonts.some((font) => font.webfont)
    ? '<p class="muted">The preview loads this design’s fonts from Google Fonts, as your site will. You can switch them off under Fine-tune.</p>'
    : '';
  const chips = galleryGroupsOf(theme)
    .map((group) => `<li><a href="/themes?for=${group.id}">${escapeHtml(group.label)}</a></li>`)
    .join('');
  const cta = `<button type="submit" class="primary cta">Create my site with ${escapeHtml(theme.name)}</button>`;
  return pageShell({
    title: `${theme.name} design | InkDrafts`,
    description: theme.summary,
    scripts: [PREVIEW_STAGE_SCRIPT, CUSTOMIZER_SCRIPT],
    body: `<p class="back"><a href="/themes">← All designs</a></p>
<div class="theme-head">
<div>
<h1>${escapeHtml(theme.name)}</h1>
<p class="lead">${escapeHtml(theme.summary)}</p>
</div>
${pagerHtml(theme, 'head')}
</div>
<p>${escapeHtml(theme.description)}</p>
<div class="detail">
<div class="preview preview-pin">
${previewFrameHtml(theme, appearance)}
</div>
<form class="tweak-form" method="get" action="${CONNECT_PATH}" data-customizer>
<input type="hidden" name="theme" value="${escapeHtml(theme.id)}">
<div class="actions">
${cta}
<button type="submit" formaction="/themes/${escapeHtml(theme.id)}" data-js-hidden>Preview</button>
<p class="fine">Nothing is final: you can change the design and every option later from your site settings.</p>
</div>
<fieldset>
<legend>Make it yours</legend>
${tweakFieldsHtml(fonts.theme, fonts.appearance, { fineTune: true })}
</fieldset>
<div class="cta-bar"><span>Step 1 of 3</span>${cta}</div>
</form>
</div>
${customizerDataHtml(fonts.theme)}
<div class="about">
${webfonts}
<p class="muted">Good for: ${escapeHtml(audienceLine(theme))}. Design by ${author}.</p>
<ul class="chips" aria-label="Browse by audience">${chips}</ul>
</div>
${pagerHtml(theme, 'foot')}`,
  });
}

function notFoundPage(): string {
  return pageShell({
    title: 'Design not found | InkDrafts',
    body: `<h1>We could not find that design</h1>
<p>It may have been renamed. <a href="/themes">Browse all designs</a>.</p>`,
  });
}

const PUBLIC_PAGE = { frames: false, scripts: false, publicMaxAgeSeconds: THEMES_PAGE_MAX_AGE_SECONDS } as const;

/** `/themes?theme=<id>&t_*` lands on that theme's page with the choice
 * carried over (links from older pages and shared URLs). */
function chosenThemeRedirect(params: URLSearchParams): Response | null {
  const theme = findTheme(params.get('theme') ?? '');
  if (!theme) return null;
  const parsed = parseAppearanceParams(foldFontChoice(params));
  const query = parsed.kind === 'ok' ? tweakQuery(parsed.appearance) : '';
  return new Response(null, {
    status: 303,
    headers: { location: `${themeDetailHref(theme)}${query ? `?${query}` : ''}`, 'cache-control': 'no-store' },
  });
}

/** `?for=<group>`; `?category=<id>` (older links) maps to the category's
 * group. Anything unknown shows every design. */
function requestedGroup(params: URLSearchParams): GalleryGroup | null {
  return resolveGalleryGroup(params.get('for')) ?? resolveGalleryGroup(params.get('category'));
}

export function themesGalleryResponse(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const redirect = chosenThemeRedirect(params);
  if (redirect) return redirect;
  return new Response(themesGalleryPage(requestedGroup(params)), { status: 200, headers: pageHeaders(PUBLIC_PAGE) });
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
  const parsed = parseAppearanceParams(foldFontChoice(params));
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
