/**
 * Server-rendered customize screen for `/status/appearance`. Rendering is
 * total over `AppearancePageModel`; every provider-derived string (login,
 * repository name) is escaped, and everything else comes from the catalog.
 */

import { fontControlView } from './appearance-fonts';
import { renderInkdraftsBlock } from './repository-config';
import type { CatalogTheme, SiteAppearance } from './theme-catalog';
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
      /** Carried into the hand-edit block so pasting it keeps the link. */
      notionPage: string | null;
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
  return `<p class="back"><a href="/status">&larr; Back to your dashboard</a></p>
<p class="muted">Your site: <a href="${escapeHtml(site.siteUrl)}">${escapeHtml(site.siteUrl.replace(/^https?:\/\//u, ''))}</a></p>`;
}

function sameAppearance(a: SiteAppearance, b: SiteAppearance): boolean {
  if (a.themeId !== b.themeId) return false;
  const keys = new Set([...Object.keys(a.tweaks), ...Object.keys(b.tweaks)]);
  return [...keys].every((key) => a.tweaks[key] === b.tweaks[key]);
}

/** The save bar sits after the options and sticks to the bottom of the
 * screen while they scroll. `[data-unsaved-cue]` is the hook the customizer
 * script toggles as choices change; without it the server's own comparison
 * shows. */
const APPEARANCE_STYLES = `<style>
  .save-bar { position: sticky; bottom: 0; z-index: 3; display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; margin: 1.25rem 0 0; padding: 0.85rem 0; background: var(--bg); border-top: 1px solid var(--border); }
  .save-bar p { margin: 0; }
  .save-bar .unsaved { font: 600 0.9rem/1.4 var(--sans); color: var(--accent); }
  .tweak-form > fieldset > .tweak:last-child { border-bottom: 0; }
  details + details { border-top: 0; margin-top: -2rem; }
</style>`;

const TITLE = 'Your site’s appearance | InkDrafts';

function predatesBody(site: AppearanceSite): string {
  return `${signedInLine(site)}
<h1>Your site’s appearance</h1>
<p>Your site was set up before InkDrafts had themes, so <a href="${escapeHtml(site.repositoryUrl)}">its repository</a> does not include them. It keeps its original look and keeps working as it is.</p>
<p>Switching an existing site to a theme is not available yet. You can browse the <a href="/themes">theme gallery</a> to see what is coming.</p>`;
}

function editorBody(model: Extract<AppearancePageModel, { kind: 'editor' }>): string {
  const theme = model.offered.find((candidate) => candidate.id === model.selected.themeId) ?? model.offered[0];
  if (!theme) return predatesBody(model.site);
  const notice = model.notice === 'saved'
    ? `<div class="notice" role="status"><p>Saved. Your site updates with the new look in about a minute. <a href="${escapeHtml(model.site.siteUrl)}">Visit your site</a>.</p></div>`
    : model.notice === 'unchanged'
      ? '<div class="notice" role="status"><p>Nothing changed: your site already uses these settings.</p></div>'
      : '';
  const error = model.error === null ? '' : `<div class="notice" role="alert"><p class="danger">${escapeHtml(ERROR_COPY[model.error])}</p></div>`;
  const cards = model.offered.map((candidate) => themeCardHtml(candidate, {
    href: `/status/appearance?theme=${candidate.id}`,
    headingLevel: 3,
    current: candidate.id === theme.id,
  })).join('\n');
  const dirty = !sameAppearance(model.selected, model.current);
  const fonts = fontControlView(theme, model.selected);
  return `${APPEARANCE_STYLES}
${signedInLine(model.site)}
<h1>Your site’s appearance</h1>
${notice}${error}
<p>Your site uses the <strong>${escapeHtml(themeName(model.offered, model.current))}</strong> design.${theme.id === model.current.themeId ? '' : ` You are trying <strong>${escapeHtml(theme.name)}</strong>. Nothing changes on your site until you save.`}</p>
<form class="switcher" method="get" action="/status/appearance">
<div><label for="theme-switch">Design</label>
<select id="theme-switch" name="theme">${themeOptionsHtml(model.offered, theme.id)}</select></div>
<button type="submit" data-theme-switch-submit>Show this design</button>
<p class="small"><a href="#all-designs">See every design with pictures</a></p>
</form>
<div class="detail">
<div class="preview-pin">
${previewFrameHtml(theme, model.selected)}
</div>
<form class="tweak-form" method="post" action="/status/appearance" data-customizer>
<input type="hidden" name="token" value="${escapeHtml(model.formToken)}">
<input type="hidden" name="theme" value="${escapeHtml(theme.id)}">
<fieldset>
<legend>${escapeHtml(theme.name)} options</legend>
${tweakFieldsHtml(fonts.theme, fonts.appearance)}
</fieldset>
<div class="save-bar">
<p class="unsaved" data-unsaved-cue${dirty ? '' : ' hidden'}>Unsaved changes</p>
<button type="submit" class="primary">Save and publish ${escapeHtml(theme.name)}</button>
<button type="submit" formmethod="get" formaction="/status/appearance" data-js-hidden>Preview</button>
<a href="/status/appearance" data-unsaved-cue${dirty ? '' : ' hidden'}>Undo</a>
</div>
<p class="muted">Your site updates with the new look about a minute after you save.</p>
</form>
</div>
${customizerDataHtml(fonts.theme)}
<details>
<summary>Advanced: edit the settings file by hand</summary>
<p>Saving changes one part of your site’s settings file (the <code>inkdrafts:</code> block of <code>_config.yml</code>). Nothing else in the file changes. To make the same change by hand, replace that block with:</p>
${yamlBlockHtml(renderInkdraftsBlock(model.selected, model.notionPage))}
<p><a href="${escapeHtml(editUrl(model.site))}">Open _config.yml on GitHub</a></p>
</details>
<details id="all-designs" open>
<summary>Every design</summary>
<ul class="theme-grid">
${cards}
</ul>
</details>`;
}

export function appearancePage(model: AppearancePageModel): string {
  switch (model.kind) {
    case 'editor':
      return pageShell({ title: TITLE, header: { owner: true }, scripts: [PREVIEW_STAGE_SCRIPT, CUSTOMIZER_SCRIPT], body: editorBody(model) });
    case 'predates_themes':
      return pageShell({ title: TITLE, header: { owner: true }, body: predatesBody(model.site) });
  }
}
