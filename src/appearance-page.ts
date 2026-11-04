/**
 * Server-rendered customize screen for `/status/appearance`. Rendering is
 * total over `AppearancePageModel`; every provider-derived string (login,
 * repository name) is escaped, and everything else comes from the catalog.
 */

import { renderAppearanceBlock, type CatalogTheme, type SiteAppearance } from './theme-catalog';
import {
  customizerDataHtml,
  escapeHtml,
  pageShell,
  previewFrameHtml,
  PREVIEW_STAGE_SCRIPT,
  themeCardHtml,
  themeOptionsHtml,
  tweakFieldsHtml,
  yamlBlockHtml,
} from './theme-ui';
import { CUSTOMIZER_SCRIPT } from './themes-page';

export interface AppearanceSite {
  readonly login: string;
  readonly repositoryName: string;
  readonly repositoryUrl: string;
  readonly defaultBranch: string;
  readonly siteUrl: string;
}

export type AppearanceNotice = 'saved' | 'unchanged' | null;

export type AppearanceError =
  | 'theme_not_offered'
  | 'contrast_light'
  | 'contrast_dark'
  | 'invalid_request';

export type AppearancePageModel =
  | {
      kind: 'editor';
      site: AppearanceSite;
      /** Catalog themes whose manifest the repository has, in catalog order. */
      offered: readonly CatalogTheme[];
      current: SiteAppearance;
      selected: SiteAppearance;
      notice: AppearanceNotice;
      error: AppearanceError | null;
      formToken: string;
    }
  | { kind: 'predates_themes'; site: AppearanceSite };

const ERROR_COPY: { [E in AppearanceError]: string } = {
  theme_not_offered: 'That theme is not in your site’s repository yet. Your site was set up before it was added, so it cannot use it. Pick one of the themes below.',
  contrast_light: 'The custom color is too light to read on this theme’s light background, so nothing was saved. Pick a darker color or one of the presets.',
  contrast_dark: 'The custom color is too dark to read on this theme’s dark background, so nothing was saved. Pick a lighter color or one of the presets.',
  invalid_request: 'That change could not be read, so nothing was saved. Try again from this page.',
};

function editUrl(site: AppearanceSite): string {
  return `${site.repositoryUrl}/edit/${encodeURIComponent(site.defaultBranch)}/_config.yml`;
}

function themeName(offered: readonly CatalogTheme[], appearance: SiteAppearance): string {
  return offered.find((theme) => theme.id === appearance.themeId)?.name ?? appearance.themeId;
}

function signedInLine(site: AppearanceSite): string {
  return `<p class="muted">Signed in as ${escapeHtml(site.login)}. Site: <a href="${escapeHtml(site.siteUrl)}">${escapeHtml(site.siteUrl)}</a> &middot; <a href="/status">Back to your site</a></p>`;
}

const TITLE = 'Your site’s appearance | InkDrafts';

function predatesBody(site: AppearanceSite): string {
  return `<h1>Your site’s appearance</h1>
${signedInLine(site)}
<p>Your site was set up before InkDrafts had themes, so <a href="${escapeHtml(site.repositoryUrl)}">its repository</a> does not include them. It keeps its original look and keeps working as it is.</p>
<p>Switching an existing site to a theme is not available yet. You can browse the <a href="/themes">theme gallery</a> to see what is coming.</p>`;
}

function editorBody(model: Extract<AppearancePageModel, { kind: 'editor' }>): string {
  const theme = model.offered.find((candidate) => candidate.id === model.selected.themeId) ?? model.offered[0];
  if (!theme) return predatesBody(model.site);
  const notice = model.notice === 'saved'
    ? `<div class="notice" role="status"><p>Saved. GitHub Pages rebuilds your site in about a minute. <a href="${escapeHtml(model.site.siteUrl)}">View your site</a>.</p></div>`
    : model.notice === 'unchanged'
      ? '<div class="notice" role="status"><p>Nothing changed: your site already uses these settings.</p></div>'
      : '';
  const error = model.error === null ? '' : `<div class="notice" role="alert"><p class="danger">${escapeHtml(ERROR_COPY[model.error])}</p></div>`;
  const cards = model.offered.map((candidate) => themeCardHtml(candidate, {
    href: `/status/appearance?theme=${candidate.id}`,
    headingLevel: 3,
    current: candidate.id === theme.id,
  })).join('\n');
  return `<h1>Your site’s appearance</h1>
${signedInLine(model.site)}
${notice}${error}
<p>Your site uses <strong>${escapeHtml(themeName(model.offered, model.current))}</strong>.${theme.id === model.current.themeId ? '' : ` You are previewing <strong>${escapeHtml(theme.name)}</strong>; nothing changes until you save.`}</p>
<form class="switcher" method="get" action="/status/appearance">
<div><label for="theme-switch">Theme</label>
<select id="theme-switch" name="theme">${themeOptionsHtml(model.offered, theme.id)}</select></div>
<button type="submit">Show this theme</button>
</form>
<div class="detail">
<div class="preview-pin">
${previewFrameHtml(theme, model.selected)}
</div>
<form class="tweak-form" method="post" action="/status/appearance" data-customizer>
<input type="hidden" name="token" value="${escapeHtml(model.formToken)}">
<input type="hidden" name="theme" value="${escapeHtml(theme.id)}">
<div class="actions">
<button type="submit" class="primary">Save</button>
<button type="submit" formmethod="get" formaction="/status/appearance" data-js-hidden>Preview</button>
</div>
<fieldset>
<legend>${escapeHtml(theme.name)} options</legend>
${tweakFieldsHtml(theme, model.selected)}
</fieldset>
<p class="muted">Saving commits one change to the <code>inkdrafts:</code> block of your repository’s <code>_config.yml</code>. Nothing else in the file changes.</p>
</form>
</div>
${customizerDataHtml(theme)}
<details>
<summary>Edit by hand</summary>
<p>Replace the <code>inkdrafts:</code> block in <code>_config.yml</code> with:</p>
${yamlBlockHtml(renderAppearanceBlock(model.selected))}
<p><a href="${escapeHtml(editUrl(model.site))}">Open _config.yml on GitHub</a></p>
</details>
<details>
<summary>Browse every theme</summary>
<ul class="theme-grid">
${cards}
</ul>
</details>`;
}

export function appearancePage(model: AppearancePageModel): string {
  switch (model.kind) {
    case 'editor':
      return pageShell({ title: TITLE, scripts: [PREVIEW_STAGE_SCRIPT, CUSTOMIZER_SCRIPT], body: editorBody(model) });
    case 'predates_themes':
      return pageShell({ title: TITLE, body: predatesBody(model.site) });
  }
}
