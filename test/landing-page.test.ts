import { describe, expect, test } from 'bun:test';
import { NOTION_WORDS } from '../src/notion-words';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { CONNECT_PATH } from '../src/connect-page';
import { route } from '../src/index';
import { LANDING_DATA, LANDING_DEFAULT_THEME_ID, LANDING_PAGE, LANDING_SCRIPTS } from '../src/landing-page';
import { findTheme, parseAppearanceParams, THEMES } from '../src/theme-catalog';
import { FEATURED_THEMES, GALLERY_GROUPS, galleryGroupsOf, PILL_LIMIT, schemeChoices, schemeDefault, tweakFieldsHtml } from '../src/theme-ui';

const LANDING_JS = readFileSync(join(import.meta.dir, '..', 'public', 'assets', 'landing.js'), 'utf8');
const silentConsole = new VirtualConsole();
const DEFAULT = findTheme(LANDING_DEFAULT_THEME_ID)!;

function landingDom(options: { runScripts?: 'outside-only'; url?: string } = {}): JSDOM {
  const { url = 'https://inkdrafts.test/', ...rest } = options;
  return new JSDOM(LANDING_PAGE, { url, pretendToBeVisual: true, virtualConsole: silentConsole, ...rest });
}

/** Runs landing.js against a document and stubs the layout APIs jsdom lacks. */
function enhanced(url = 'https://inkdrafts.test/'): JSDOM {
  const dom = landingDom({ runScripts: 'outside-only', url });
  (dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;
  dom.window.eval(LANDING_JS);
  return dom;
}

/** What a browser submits for a GET form, as /connect reads it. */
function submitted(window: JSDOM['window'], form: HTMLFormElement): URLSearchParams {
  return new URLSearchParams([...new window.FormData(form).entries()].map(([key, value]) => [key, String(value)]));
}

function change(window: JSDOM['window'], input: HTMLInputElement): void {
  input.checked = true;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

/** The text a visitor reads before scrolling: header and hero. */
const FIRST_SCREEN = LANDING_PAGE.slice(0, LANDING_PAGE.indexOf('id="start"'));

describe('landing page', () => {
  test('is a complete, English-language document that names the outcome in its title', () => {
    expect(LANDING_PAGE.startsWith('<!doctype html>')).toBe(true);
    expect(LANDING_PAGE).toContain('<html lang="en">');
    expect(LANDING_PAGE).toContain('<title>InkDrafts: your own website, written in Notion</title>');
  });

  test('runs only its own same-origin, deferred scripts and makes no external requests', () => {
    const scripts = [...LANDING_PAGE.matchAll(/<script\b([^>]*)>/gu)].map((match) => match[1]!.trim());
    expect(scripts).toEqual([...LANDING_SCRIPTS.map((src) => `src="${src}" defer`), 'type="application/json" id="landing-data"']);
    for (const src of LANDING_SCRIPTS) expect(src).toMatch(/^\/assets\/[\w-]+\.js$/u);
    expect(LANDING_PAGE).not.toMatch(/\son[a-z]+="/u);
    expect(LANDING_PAGE).not.toMatch(/\shref="https?:\/\/(?!github\.com|inkdrafts\.com)/u);
    expect(LANDING_PAGE).not.toMatch(/\ssrc="(?!\/(?:assets|previews)\/)/u);
  });

  test('is served under a CSP that allows exactly its own script, frames and font', async () => {
    const response = await route(new Request('https://inkdrafts.test/'));
    const policy = response.headers.get('content-security-policy') ?? '';
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/u);
    expect(policy).toContain("frame-src 'self'");
    expect(policy).toContain("font-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  // The page carries every theme card, the FAQ and the customizer's option
  // data; the data sits after the content and gzip is what crosses the wire.
  test('stays within its performance budget', () => {
    const bytes = new TextEncoder().encode(LANDING_PAGE);
    expect(bytes.byteLength).toBeLessThan(110_000);
    expect(Bun.gzipSync(bytes).byteLength).toBeLessThan(28_000);
    expect(LANDING_JS.length).toBeLessThanOrEqual(17 * 1024);
  });

  test('exposes accessible landmarks and a single top-level heading', () => {
    expect(LANDING_PAGE).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(LANDING_PAGE).toContain('class="skip-link" href="#main-content"');
    expect(LANDING_PAGE).toContain('<main id="main-content">');
    expect(LANDING_PAGE).toMatch(/<header[ >]/u);
    expect(LANDING_PAGE).toMatch(/<footer[ >]/u);
    expect(LANDING_PAGE.match(/<h1[ >]/gu)).toHaveLength(1);
    expect(LANDING_PAGE.match(/<nav aria-label="/gu)?.length).toBeGreaterThanOrEqual(2);
  });

  test('carries a large social-preview card with an image', () => {
    expect(LANDING_PAGE).toContain('<meta name="description" content="');
    expect(LANDING_PAGE).toContain('<meta property="og:title" content="Your own website, written in Notion">');
    expect(LANDING_PAGE).toContain('<meta property="og:description"');
    expect(LANDING_PAGE).toContain('<meta property="og:url" content="https://inkdrafts.com/">');
    expect(LANDING_PAGE).toContain('<meta property="og:image" content="https://inkdrafts.com/assets/og-1200x630.png">');
    expect(LANDING_PAGE).toContain('<meta property="og:image:width" content="1200">');
    expect(LANDING_PAGE).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(LANDING_PAGE).toContain('<link rel="canonical" href="https://inkdrafts.com/">');
    for (const jargon of ['Jekyll', 'Action', 'GitHub Pages', 'repository']) {
      for (const [, content] of LANDING_PAGE.matchAll(/<meta [^>]*content="([^"]*)"/gu)) expect(content).not.toContain(jargon);
    }
  });

  test('the first screen speaks to a non-technical visitor', () => {
    expect(FIRST_SCREEN).toContain('Your own website');
    expect(FIRST_SCREEN).toContain('Create my free website');
    expect(FIRST_SCREEN).toContain('What you need');
    expect(FIRST_SCREEN).toContain('No credit card');
    expect(FIRST_SCREEN).toContain('A free Notion account');
    // GitHub is named once, with what it does for the visitor, and not in the headline or the CTA.
    expect(FIRST_SCREEN.match(/GitHub/gu)).toHaveLength(1);
    expect(FIRST_SCREEN).toContain('A free GitHub account, which hosts your site.');
    expect(FIRST_SCREEN).toContain('Already started? <a href="/status">Continue where you left off</a>');
    for (const word of ['repository', 'Jekyll', 'deploy', 'OAuth', 'Pages']) expect(FIRST_SCREEN).not.toContain(word);
  });

  test('never says repository, and keeps the technical words to the pages that explain them', () => {
    const visible = LANDING_PAGE.replace(/<script[\s\S]*?<\/script>/gu, '').replace(/<style>[\s\S]*?<\/style>/gu, '')
      // GitHub's own install label, quoted so a visitor recognises it on GitHub's screen.
      .replaceAll('“All repositories”', '');
    for (const word of ['repository', 'repositories', 'Jekyll', 'OAuth', 'libsodium', '_config.yml', 'Action ']) expect(visible).not.toContain(word);
  });

  test('says what it costs, how long it takes and who owns the result', () => {
    expect(LANDING_PAGE).toContain('Is it really free?');
    expect(LANDING_PAGE).toContain('You never enter a card.');
    expect(LANDING_PAGE).toContain('About 5 minutes');
    expect(LANDING_PAGE).toContain('Your website is 5 minutes away.');
    expect(LANDING_PAGE).toContain('yourname.github.io');
    expect(LANDING_PAGE).toContain('If InkDrafts ever closed, your site would stay online');
  });

  test('shows three steps in plain words, with what each approval screen looks like', () => {
    expect(LANDING_PAGE).toContain('Three steps, then you just write');
    const steps = [...LANDING_PAGE.matchAll(/<ol class="steps">[\s\S]*?<\/ol>/gu)][0]![0];
    expect([...steps.matchAll(/<h3>([^<]*)<\/h3>/gu)].map((match) => match[1])).toEqual(['Pick a look', 'Say yes on GitHub', 'Say yes on Notion']);
    expect(steps).toContain('green <strong>Install</strong> button');
    expect(steps).toContain('“All repositories” selected');
    expect(steps).toContain('Use a template provided by the developer');
    expect(LANDING_PAGE).toContain('Why GitHub?');
    expect(LANDING_PAGE).toContain('Why Notion?');
    // One step count everywhere.
    expect(LANDING_PAGE).toContain('Step 1 of 3');
    expect(LANDING_PAGE).not.toMatch(/Step [2-9] of/u);
  });

  test('explains how the site is kept up to date from Notion', () => {
    expect(LANDING_PAGE).toContain('id="update"');
    expect(LANDING_PAGE).toContain('Updating your site is writing a page');
    expect(LANDING_PAGE).toContain('Usually within 20 minutes');
    expect(LANDING_PAGE).toContain('Update my site now');
    expect(LANDING_PAGE).toContain('Set its Status back to Draft');
    expect(LANDING_PAGE).toContain('How do I change my site later?');
  });

  test('answers the questions a first-time visitor has, as native disclosures', () => {
    const faq = LANDING_PAGE.slice(LANDING_PAGE.indexOf('<div class="faq">'), LANDING_PAGE.indexOf('class="closing"'));
    const questions = [...faq.matchAll(/<summary>([^<]*)<\/summary>/gu)].map((match) => match[1]);
    expect(questions).toEqual([
      'Is it really free?',
      'Do I need to know how to code?',
      'What is GitHub, and do I need an account?',
      'What will my web address be?',
      'Can I use my own domain, like yourname.com?',
      'How do I change my site later?',
      'Can I change the design later?',
      'Is my Notion private?',
      'Can I add photos?',
      'What if I stop using InkDrafts?',
    ]);
    expect(faq).toContain('id="faq-github"');
    expect(faq).toContain('href="/leaving"');
    // Photos: uploads are promised only once the public template's sync keeps copies.
    expect(faq).toContain(NOTION_WORDS.uploadsKept ? 'Drag a photo into your Notion page' : 'Dragging photos straight into Notion is coming soon');
    expect(faq).not.toMatch(/Add photos to your Notion pages the usual way/u);
    expect(LANDING_PAGE.indexOf('id="faq"')).toBeLessThan(LANDING_PAGE.indexOf('class="closing"'));
  });

  test('the hero CTA scrolls to the studio and the closing CTA carries the default look to /connect', () => {
    const dom = landingDom();
    const { document } = dom.window;
    const hero = document.querySelector('.hero a.cta') as HTMLAnchorElement;
    expect(hero.getAttribute('href')).toBe('#start');
    expect(hero.textContent).toContain('Create my free website');
    expect(document.getElementById('start')).not.toBeNull();
    const closing = document.querySelector('.closing a.cta') as HTMLAnchorElement;
    expect(closing.getAttribute('href')).toBe(`${CONNECT_PATH}?theme=${DEFAULT.id}`);
    expect(closing.textContent).toContain(`Create my site with ${DEFAULT.name}`);
    // The header's compact start button uses the same verb family.
    expect(document.querySelector('.masthead a.start')!.textContent).toBe('Create my site');
    expect(document.querySelector('.masthead nav a[href="/status"]')!.textContent).toBe('Sign in');
    // The page ends on the closing band: nothing but the footer follows it.
    expect(LANDING_PAGE.slice(LANDING_PAGE.lastIndexOf('class="closing"'))).not.toMatch(/<section/u);
    dom.window.close();
  });

  test('never links the unadvertised GitHub App install page or /connect/github directly', () => {
    expect(LANDING_PAGE).not.toContain('github.com/apps/inkdrafts');
    expect(LANDING_PAGE).not.toContain('/connect/github');
  });

  test('keeps the trust content with plain links to the details', () => {
    expect(LANDING_PAGE).toContain('id="yours"');
    expect(LANDING_PAGE).toContain('href="/privacy"');
    expect(LANDING_PAGE).toContain('href="/security"');
    expect(LANDING_PAGE).toContain('href="/leaving"');
    expect(LANDING_PAGE).toContain('https://github.com/OffConstruct/notiongit"');
    expect(LANDING_PAGE).toContain('See the code');
  });

  test('does not promise unimplemented features', () => {
    const lower = LANDING_PAGE.toLowerCase();
    expect(lower).not.toContain('custom domain');
    expect(lower).not.toContain('instant');
    expect(lower).not.toContain('pricing');
  });
});

describe('landing theme gallery', () => {
  test('has a whole-card link for every catalog theme, curated order first, early rows eager', () => {
    const dom = landingDom();
    const cards = [...dom.window.document.querySelectorAll('#themes .gallery > li')];
    expect(cards.map((card) => card.querySelector('a')!.getAttribute('href')).sort()).toEqual(THEMES.map((theme) => `/themes/${theme.id}`).sort());
    expect(cards[0]!.querySelector('a')!.getAttribute('href')).toBe('/themes/issue');
    cards.forEach((card, index) => {
      const link = card.querySelector('a.theme-card')!;
      const image = link.querySelector('img')!;
      expect(image.getAttribute('src')).toMatch(/^\/previews\/[a-z]+\/thumb\.webp$/u);
      expect(image.getAttribute('loading')).toBe(index < 8 ? 'eager' : 'lazy');
      expect(image.getAttribute('width')).toBe('640');
      expect(image.getAttribute('height')).toBe('400');
      expect(image.getAttribute('alt')).toBe('');
      expect(link.querySelector('.name')!.textContent!.trim()).not.toBe('');
      // The audience line is part of the link, so the whole card is the target.
      expect(link.querySelector('.for')!.textContent).toContain(galleryGroupsOf(findTheme(link.getAttribute('data-pick')!)!)[0]!.label);
    });
    expect(LANDING_PAGE).toContain(`See all ${THEMES.length} designs`);
    dom.window.close();
  });

  test('every image on the page is a same-origin preview thumbnail', () => {
    const sources = [...LANDING_PAGE.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/gu)].map((match) => match[1]);
    expect(sources.length).toBeGreaterThanOrEqual(THEMES.length);
    for (const source of sources) expect(source).toMatch(/^\/previews\/[a-z]+\/thumb\.webp$/u);
  });

  test('every catalog category belongs to exactly one plain-language group', () => {
    const categories = new Set(THEMES.flatMap((theme) => theme.categories));
    for (const category of categories) {
      expect(GALLERY_GROUPS.filter((group) => group.categories.includes(category))).toHaveLength(1);
    }
    for (const theme of THEMES) expect(galleryGroupsOf(theme).length).toBeGreaterThan(0);
  });

  test('the audience filter works without JavaScript', () => {
    // jsdom caches computed styles until the DOM mutates, and checking a radio
    // is not a mutation, so each choice gets a fresh document.
    const visibleWith = (radioId: string) => {
      const dom = landingDom();
      const { document, getComputedStyle } = dom.window;
      (document.getElementById(radioId) as HTMLInputElement).checked = true;
      const hrefs = [...document.querySelectorAll('#themes .gallery > li')]
        .filter((card) => getComputedStyle(card).display !== 'none')
        .map((card) => card.querySelector('a')!.getAttribute('href'));
      dom.window.close();
      return hrefs;
    };
    expect(visibleWith('group-all')).toHaveLength(THEMES.length);
    for (const group of GALLERY_GROUPS) {
      const members = THEMES.filter((theme) => galleryGroupsOf(theme).includes(group));
      if (members.length === 0) continue;
      expect(visibleWith(`group-${group.id}`).sort()).toEqual(members.map((theme) => `/themes/${theme.id}`).sort());
      expect(LANDING_PAGE).toContain(`${group.label.replaceAll('&', '&amp;')} <span>${members.length}</span>`);
    }
  });
});

describe('landing customizer', () => {
  test('without JavaScript it is a GET form into /connect with six featured designs and the scheme pills', () => {
    const dom = landingDom();
    const { document } = dom.window;
    const form = document.querySelector('form[data-landing-customizer]') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe(CONNECT_PATH);
    const radios = [...form.querySelectorAll<HTMLInputElement>('input[type=radio][name="theme"]')];
    expect(radios.map((radio) => radio.value)).toEqual(FEATURED_THEMES);
    expect(radios.find((radio) => radio.checked)!.value).toBe(DEFAULT.id);
    // The name field is preview-only and never submitted; without JS it is hidden.
    const name = form.querySelector('[data-preview-name]') as HTMLInputElement;
    expect(name.hasAttribute('name')).toBe(false);
    expect(name.closest('[hidden]')).not.toBeNull();

    expect(parseAppearanceParams(submitted(dom.window, form))).toEqual({
      kind: 'ok',
      appearance: { v: 1, themeId: DEFAULT.id, tweaks: {} },
    });

    const other = FEATURED_THEMES.find((id) => id !== DEFAULT.id)!;
    (form.querySelector(`input[name="theme"][value="${other}"]`) as HTMLInputElement).checked = true;
    (form.querySelector('input[name="t_mode"][value="dark"]') as HTMLInputElement).checked = true;
    expect(parseAppearanceParams(submitted(dom.window, form))).toEqual({
      kind: 'ok',
      appearance: { v: 1, themeId: other as never, tweaks: { mode: 'dark' } },
    });
    expect(form.textContent).toContain('By continuing you agree to the');
    dom.window.close();
  });

  test('the scheme vocabulary is one set of words on the landing and on the theme pages', () => {
    for (const theme of THEMES) {
      const detail = tweakFieldsHtml(theme, { v: 1, themeId: theme.id, tweaks: {} });
      const labels = [...detail.matchAll(/name="t_mode" value="([a-z]+)"[^>]*><label[^>]*>([^<]*)</gu)].map((match) => [match[1], match[2]]);
      expect(labels).toEqual(LANDING_DATA.themes[theme.id]!.modes);
      expect(labels.map(([value]) => value)).toEqual(schemeChoices(theme).map((choice) => choice.value));
      for (const [, label] of labels) expect(['Light', 'Dark', 'Match device']).toContain(label);
      expect(LANDING_DATA.themes[theme.id]!.mode).toBe(schemeDefault(theme));
      expect(detail).not.toContain('As designed');
      expect(detail).not.toContain('Match system');
    }
    expect(LANDING_PAGE).not.toContain('As designed');
  });

  test('landing.js builds the chosen theme\'s controls from the catalog and the form submits every choice', () => {
    const dom = enhanced();
    const { document } = dom.window;
    const form = document.querySelector('form[data-landing-customizer]') as HTMLFormElement;
    const frame = () => document.getElementById('theme-preview') as HTMLIFrameElement;
    const posted: unknown[] = [];
    const listen = () => { (frame().contentWindow as unknown as { postMessage: (message: unknown) => void }).postMessage = (message) => posted.push(message); };
    listen();

    // The name field appears, the default theme's options are offered.
    expect((form.querySelector('[data-preview-name]') as HTMLElement).closest('[hidden]')).toBeNull();
    expect(form.querySelector('details.fine-tune')).not.toBeNull();

    const theme = THEMES.find((candidate) =>
      !FEATURED_THEMES.includes(candidate.id) &&
      candidate.tweaks.some((tweak) => tweak.key === 'accent' && tweak.type === 'color' && tweak.custom) &&
      candidate.tweaks.some((tweak) => tweak.type === 'boolean') &&
      candidate.tweaks.some((tweak) => tweak.type === 'select' && tweak.key !== 'mode' && tweak.options.length <= PILL_LIMIT))!;
    const accent = theme.tweaks.find((tweak) => tweak.key === 'accent')!;
    const toggle = theme.tweaks.find((tweak) => tweak.type === 'boolean')!;
    const select = theme.tweaks.find((tweak) => tweak.type === 'select' && tweak.key !== 'mode' && tweak.options.length <= PILL_LIMIT)!;
    if (accent.type !== 'color' || select.type !== 'select' || toggle.type !== 'boolean') throw new Error('unreachable');

    // A non-featured theme comes in through a gallery card.
    const card = document.querySelector(`a[data-pick="${theme.id}"]`) as HTMLAnchorElement;
    expect(card.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))).toBe(false);
    listen();
    expect(frame().getAttribute('src')).toBe(`/previews/${theme.id}/`);
    expect(document.getElementById('preview-status')!.textContent).toContain(theme.name);
    expect(document.activeElement?.id).toBe('start-heading');
    expect((form.querySelector('[data-picked-other]') as HTMLElement).hidden).toBe(false);
    for (const node of document.querySelectorAll('[data-theme-name]')) expect(node.textContent).toBe(theme.name);

    // Scheme pills follow the theme's own default; accent presets and swatches come from the catalog.
    const modes = [...form.querySelectorAll<HTMLInputElement>('input[name="t_mode"]')];
    expect(modes.map((input) => input.value)).toEqual(schemeChoices(theme).map((choice) => choice.value));
    expect(modes.find((input) => input.checked)!.value).toBe(schemeDefault(theme));
    const accents = [...form.querySelectorAll<HTMLInputElement>('input[name="t_accent"]')];
    expect(accents.map((input) => input.value)).toEqual([...accent.presets.map((preset) => preset.value), 'custom']);
    expect(form.querySelector('input[name="c_accent"]')).not.toBeNull();
    for (const input of form.querySelectorAll<HTMLInputElement>('#options-slot input:not([type=hidden])')) {
      expect(form.querySelector(`label[for="${input.id}"]`) !== null || input.hasAttribute('aria-label')).toBe(true);
    }

    // Swatches show the ground the chosen scheme will use.
    change(dom.window, form.querySelector('input[name="t_mode"][value="dark"]') as HTMLInputElement);
    const swatch = form.querySelector(`input[name="t_accent"][value="${accent.presets[0]!.value}"] + label .swatch`) as HTMLElement;
    expect(swatch.style.background.toLowerCase()).toBe(hexToRgb(accent.presets[0]!.dark));

    const otherAccent = accent.presets.find((preset) => preset.value !== accent.default)!;
    const otherOption = select.options.find((option) => option.value !== select.default)!;
    change(dom.window, form.querySelector(`input[name="t_accent"][value="${otherAccent.value}"]`) as HTMLInputElement);
    change(dom.window, form.querySelector(`input[name="t_${select.key}"][value="${otherOption.value}"]`) as HTMLInputElement);
    const checkbox = form.querySelector(`input[type=checkbox][name="t_${toggle.key}"]`) as HTMLInputElement;
    checkbox.checked = !toggle.default;
    checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    const expected = { mode: 'dark', accent: otherAccent.value, [select.key]: otherOption.value, [toggle.key]: toggle.default ? 'off' : 'on' };
    expect(posted.at(-1)).toEqual({ type: 'inkdrafts:tweaks', v: 1, theme: theme.id, tweaks: expected });
    expect(parseAppearanceParams(submitted(dom.window, form))).toEqual({
      kind: 'ok',
      appearance: {
        v: 1,
        themeId: theme.id,
        tweaks: { mode: 'dark', accent: otherAccent.value, [select.key]: otherOption.value, [toggle.key]: !toggle.default },
      },
    });

    // Every CTA and theme link carries the choice.
    const query = `theme=${theme.id}&t_mode=dark&t_accent=${otherAccent.value}&t_${select.key}=${otherOption.value}&t_${toggle.key}=${toggle.default ? 'off' : 'on'}`;
    expect((document.querySelector('.closing a.cta') as HTMLAnchorElement).getAttribute('href')).toBe(`${CONNECT_PATH}?${query}`);
    expect((form.querySelector('[data-theme-page]') as HTMLAnchorElement).getAttribute('href')).toBe(`/themes/${theme.id}?${query.replace(/^theme=[a-z]+&/u, '')}`);
    expect((document.querySelector('[data-preview-full]') as HTMLAnchorElement).getAttribute('href')).toBe(`/preview/${theme.id}/?${query.replace(/^theme=[a-z]+&/u, '')}`);
    // The choice is remembered for a visitor who leaves and comes back.
    expect(JSON.parse(dom.window.localStorage.getItem('inkdrafts:look')!)).toEqual({ theme: theme.id, tweaks: expected });
    dom.window.close();
  });

  test('a custom accent submits its hex, and the name field reloads the preview with ?name=', async () => {
    const dom = enhanced();
    const { document } = dom.window;
    const form = document.querySelector('form[data-landing-customizer]') as HTMLFormElement;
    const custom = THEMES.find((theme) => FEATURED_THEMES.includes(theme.id) && theme.tweaks.some((tweak) => tweak.key === 'accent' && tweak.type === 'color' && tweak.custom))!;
    change(dom.window, form.querySelector(`input[name="theme"][value="${custom.id}"]`) as HTMLInputElement);
    const hex = form.querySelector('input[name="c_accent"]') as HTMLInputElement;
    hex.value = '#0b6e4f';
    hex.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect((form.querySelector('#accent-custom') as HTMLInputElement).checked).toBe(true);
    expect(parseAppearanceParams(submitted(dom.window, form))).toEqual({
      kind: 'ok',
      appearance: { v: 1, themeId: custom.id, tweaks: { accent: '#0b6e4f' } },
    });

    const name = form.querySelector('[data-preview-name]') as HTMLInputElement;
    name.value = 'Marta Ruiz';
    name.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(document.getElementById('theme-preview')!.getAttribute('src')).toBe(`/preview/${custom.id}/?t_accent=%230b6e4f&name=Marta+Ruiz`);
    expect(submitted(dom.window, form).has('name')).toBe(false);
    dom.window.close();
  });

  test('a returning visitor finds the look they left, from the URL first and then from storage', () => {
    const fromUrl = enhanced('https://inkdrafts.test/?theme=verso&t_mode=dark#start');
    const form = fromUrl.window.document.querySelector('form[data-landing-customizer]') as HTMLFormElement;
    expect((form.querySelector('input[name="theme"][value="verso"]') as HTMLInputElement).checked).toBe(true);
    expect((form.querySelector('input[name="t_mode"][value="dark"]') as HTMLInputElement).checked).toBe(true);
    expect(fromUrl.window.document.getElementById('theme-preview')!.getAttribute('src')).toBe('/preview/verso/?t_mode=dark');
    fromUrl.window.close();

    const first = enhanced();
    const card = first.window.document.querySelector('a[data-pick="halo"]') as HTMLAnchorElement;
    card.dispatchEvent(new first.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    const stored = first.window.localStorage.getItem('inkdrafts:look')!;
    first.window.close();

    const back = landingDom({ runScripts: 'outside-only' });
    back.window.localStorage.setItem('inkdrafts:look', stored);
    (back.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;
    back.window.eval(LANDING_JS);
    const other = back.window.document.querySelector('[data-theme-other]') as HTMLInputElement;
    expect(other.disabled).toBe(false);
    expect(other.value).toBe('halo');
    expect(parseAppearanceParams(submitted(back.window, back.window.document.querySelector('form[data-landing-customizer]') as HTMLFormElement)).kind).toBe('ok');
    expect(back.window.document.getElementById('theme-preview')!.getAttribute('src')).toBe('/previews/halo/');
    back.window.close();
  });

  test('a modified click on a gallery card still opens the theme\'s page', () => {
    const dom = enhanced();
    const other = THEMES.find((theme) => theme.id !== DEFAULT.id)!;
    const card = dom.window.document.querySelector(`a[data-pick="${other.id}"]`) as HTMLAnchorElement;
    const modified = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    expect(card.dispatchEvent(modified)).toBe(true);
    dom.window.close();
  });
});

function hexToRgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
