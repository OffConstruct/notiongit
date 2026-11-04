/**
 * Representative documents for the theme gallery, detail and customize
 * pages, shared by the axe suite (test/a11y.test.ts) and the real-browser
 * reflow check (scripts/reflow-check.ts).
 */
import { appearancePage, type AppearanceSite } from '../../src/appearance-page';
import { appearanceFor, defaultTheme, THEMES, type SiteAppearance } from '../../src/theme-catalog';
import { themeDetailPage, themesGalleryPage } from '../../src/themes-page';

const SITE: AppearanceSite = {
  login: 'alice',
  repositoryName: 'alice.github.io',
  repositoryUrl: 'https://github.com/alice/alice.github.io',
  defaultBranch: 'main',
  siteUrl: 'https://alice.github.io',
};

export function themePageStates(): Record<string, string> {
  const classic = defaultTheme();
  const other = THEMES.find((theme) => theme.id !== classic.id) ?? classic;
  const current: SiteAppearance = appearanceFor(classic, { mode: 'dark' });
  const custom: SiteAppearance = appearanceFor(classic, { accent: '#0b6e4f', webfonts: false });
  const editor = (fields: Partial<Parameters<typeof appearancePage>[0] & { kind: 'editor' }> = {}) => appearancePage({
    kind: 'editor',
    site: SITE,
    offered: THEMES,
    current,
    selected: current,
    notice: null,
    error: null,
    formToken: 'token',
    ...fields,
  });
  return {
    '/themes': themesGalleryPage(null),
    '/themes-writers': themesGalleryPage('writers'),
    '/themes/classic': themeDetailPage(classic, appearanceFor(classic, {})),
    '/themes/classic-custom': themeDetailPage(classic, custom),
    [`/themes/${other.id}`]: themeDetailPage(other, appearanceFor(other, {})),
    '/status/appearance': editor(),
    '/status/appearance-switch': editor({ selected: appearanceFor(other, { mode: 'dark' }) }),
    '/status/appearance-saved': editor({ notice: 'saved' }),
    '/status/appearance-error': editor({ error: 'contrast_light', selected: custom }),
    '/status/appearance-predates': appearancePage({ kind: 'predates_themes', site: SITE }),
  };
}
