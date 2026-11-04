import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { route } from '../src/index';
import { LANDING_PAGE, LANDING_SCRIPTS } from '../src/landing-page';
import { defaultTheme, parseAppearanceParams, THEME_CATEGORIES, THEMES } from '../src/theme-catalog';
import { PILL_LIMIT } from '../src/theme-ui';

const LANDING_JS = readFileSync(join(import.meta.dir, '..', 'public', 'assets', 'landing.js'), 'utf8');
const silentConsole = new VirtualConsole();

function landingDom(options: { runScripts?: 'outside-only' } = {}): JSDOM {
  return new JSDOM(LANDING_PAGE, { url: 'https://inkdrafts.test/', pretendToBeVisual: true, virtualConsole: silentConsole, ...options });
}

/** What a browser submits for a GET form, as /connect/github reads it. */
function submitted(window: JSDOM['window'], form: HTMLFormElement): URLSearchParams {
  return new URLSearchParams([...new window.FormData(form).entries()].map(([key, value]) => [key, String(value)]));
}

describe('landing page', () => {
  test('is a complete, English-language document with the expected title', () => {
    expect(LANDING_PAGE.startsWith('<!doctype html>')).toBe(true);
    expect(LANDING_PAGE).toContain('<html lang="en">');
    expect(LANDING_PAGE).toContain('<title>InkDrafts</title>');
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

  // The page carries every theme card and the customizer's option data; the
  // data sits after the content and gzip is what crosses the wire.
  test('stays within its performance budget', () => {
    const bytes = new TextEncoder().encode(LANDING_PAGE);
    expect(bytes.byteLength).toBeLessThan(80_000);
    expect(Bun.gzipSync(bytes).byteLength).toBeLessThan(20_000);
    expect(LANDING_JS.length).toBeLessThanOrEqual(8 * 1024);
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

  test('carries basic social-preview metadata', () => {
    expect(LANDING_PAGE).toContain('<meta name="description" content="');
    expect(LANDING_PAGE).toContain('<meta property="og:title"');
    expect(LANDING_PAGE).toContain('<meta property="og:description"');
    expect(LANDING_PAGE).toContain('<meta property="og:url" content="https://inkdrafts.com/">');
    expect(LANDING_PAGE).toContain('<meta name="twitter:card" content="summary">');
    expect(LANDING_PAGE).toContain('<link rel="canonical" href="https://inkdrafts.com/">');
  });

  test('says what it costs and who owns the result', () => {
    expect(LANDING_PAGE).toContain('InkDrafts costs nothing to run');
    expect(LANDING_PAGE).toMatch(/GitHub Pages/u);
    expect(LANDING_PAGE).toContain('The repository is yours');
  });

  test('shows the real three-stage flow, GitHub first', () => {
    expect(LANDING_PAGE).toContain('<h3>Connect GitHub</h3>');
    expect(LANDING_PAGE).toContain('<h3>Connect Notion</h3>');
    expect(LANDING_PAGE).toContain('<h3>Your site goes live</h3>');
    expect(LANDING_PAGE.indexOf('<h3>Connect GitHub</h3>')).toBeLessThan(LANDING_PAGE.indexOf('<h3>Connect Notion</h3>'));
  });

  test('opens and closes on the same primary CTA, into /connect/github', () => {
    const ctaMatches = [...LANDING_PAGE.matchAll(/class="cta"[^>]*href="([^"]+)"/gu)];
    expect(ctaMatches.map((match) => match[1])).toEqual(['/connect/github', '/connect/github']);
    // The page ends on it: nothing but the footer follows the closing band.
    expect(LANDING_PAGE.slice(LANDING_PAGE.lastIndexOf('class="cta"'))).not.toMatch(/<section/u);
  });

  test('never links the unadvertised GitHub App install page directly', () => {
    expect(LANDING_PAGE).not.toContain('github.com/apps/inkdrafts');
  });

  test('links privacy/security and developer/open-source content', () => {
    expect(LANDING_PAGE).toContain('id="privacy-security"');
    expect(LANDING_PAGE).toContain('href="#privacy-security"');
    expect(LANDING_PAGE).toContain('id="open-source"');
    expect(LANDING_PAGE).toContain('href="#open-source"');
    expect(LANDING_PAGE).toContain('https://github.com/OffConstruct/notiongit"');
    expect(LANDING_PAGE).toContain('https://github.com/OffConstruct/notiongit-template"');
    expect(LANDING_PAGE).toContain('https://github.com/OffConstruct/notiongit-sync"');
  });

  test('does not promise unimplemented features', () => {
    const lower = LANDING_PAGE.toLowerCase();
    expect(lower).not.toContain('custom domain');
    expect(lower).not.toContain('instant');
    expect(lower).not.toContain('pricing');
  });
});

describe('landing theme gallery', () => {
  test('has a card for every catalog theme, linking to its page with a same-origin lazy thumbnail', () => {
    const dom = landingDom();
    const cards = [...dom.window.document.querySelectorAll('#themes .gallery > li')];
    expect(cards.map((card) => card.querySelector('a')!.getAttribute('href')).sort()).toEqual(THEMES.map((theme) => `/themes/${theme.id}`).sort());
    // A curated lead (one strong theme per category), then catalog order.
    expect(cards[0]!.querySelector('a')!.getAttribute('href')).not.toBe(`/themes/${THEMES[0]!.id}`);
    for (const card of cards) {
      const image = card.querySelector('img')!;
      expect(image.getAttribute('src')).toMatch(/^\/previews\/[a-z]+\/thumb\.webp$/u);
      expect(image.getAttribute('loading')).toBe('lazy');
      expect(image.getAttribute('width')).toBe('640');
      expect(image.getAttribute('height')).toBe('400');
      expect(image.getAttribute('alt')).toBe('');
      expect(card.textContent!.trim()).not.toBe('');
    }
    expect(LANDING_PAGE).toContain(`Browse ${THEMES.length} themes`);
    expect(dom.window.document.querySelector('a[href="/themes"]')).not.toBeNull();
    expect(LANDING_PAGE).not.toContain('open the full theme gallery');
    dom.window.close();
  });

  test('every image on the page is a same-origin preview thumbnail', () => {
    const sources = [...LANDING_PAGE.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/gu)].map((match) => match[1]);
    expect(sources.length).toBeGreaterThanOrEqual(THEMES.length);
    for (const source of sources) expect(source).toMatch(/^\/previews\/[a-z]+\/thumb\.webp$/u);
  });

  test('the category filter works without JavaScript', () => {
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
    expect(visibleWith('cat-all')).toHaveLength(THEMES.length);

    const used = THEME_CATEGORIES.filter((category) => THEMES.some((theme) => theme.categories.includes(category.id)));
    expect(used.length).toBeGreaterThan(1);
    for (const category of used) {
      expect(visibleWith(`cat-${category.id}`).sort())
        .toEqual(THEMES.filter((theme) => theme.categories.includes(category.id)).map((theme) => `/themes/${theme.id}`).sort());
    }
  });
});

describe('landing customizer', () => {
  test('without JavaScript it is a GET form into /connect/github that carries the chosen theme', () => {
    const dom = landingDom();
    const { document } = dom.window;
    const form = document.querySelector('form[data-landing-customizer]') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/connect/github');
    const picker = form.querySelector('select[name="theme"]') as HTMLSelectElement;
    const values = [...picker.options].map((option) => option.value);
    expect(values.sort()).toEqual(THEMES.map((theme) => theme.id).sort());
    expect(picker.value).toBe(defaultTheme().id);
    expect(form.querySelector(`label[for="${picker.id}"]`)).not.toBeNull();

    expect(parseAppearanceParams(submitted(dom.window, form))).toEqual({
      kind: 'ok',
      appearance: { v: 1, themeId: defaultTheme().id, tweaks: {} },
    });

    const other = THEMES.find((theme) => theme.id !== defaultTheme().id)!;
    picker.value = other.id;
    (form.querySelector('input[name="t_mode"][value="dark"]') as HTMLInputElement).checked = true;
    expect(parseAppearanceParams(submitted(dom.window, form))).toEqual({
      kind: 'ok',
      appearance: { v: 1, themeId: other.id, tweaks: { mode: 'dark' } },
    });

    const secondary = form.querySelector('button[formaction]') as HTMLButtonElement;
    expect(secondary.getAttribute('formaction')).toBe('/themes');
    dom.window.close();
  });

  test('"See every option" lands on the chosen theme\'s page with the choice', async () => {
    const response = await route(new Request('https://inkdrafts.test/themes?theme=quire&t_mode=dark&t_mode='));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/themes/quire');
    const chosen = await route(new Request('https://inkdrafts.test/themes?theme=quire&t_mode=&t_mode=dark'));
    expect(chosen.headers.get('location')).toBe('/themes/quire?t_mode=dark');
  });

  test('landing.js swaps the preview, offers the theme\'s options, and the form submits every choice', () => {
    const dom = landingDom({ runScripts: 'outside-only' });
    const { document } = dom.window;
    const form = document.querySelector('form[data-landing-customizer]') as HTMLFormElement;
    const frame = document.getElementById('theme-preview') as HTMLIFrameElement;
    const posted: unknown[] = [];
    (frame.contentWindow as unknown as { postMessage: (message: unknown) => void }).postMessage = (message) => posted.push(message);
    dom.window.eval(LANDING_JS);

    const theme = THEMES.find((candidate) =>
      candidate.id !== defaultTheme().id &&
      candidate.tweaks.some((tweak) => tweak.key === 'accent' && tweak.type === 'color') &&
      candidate.tweaks.some((tweak) => tweak.type === 'boolean') &&
      candidate.tweaks.some((tweak) => tweak.type === 'select' && tweak.key !== 'mode' && tweak.options.length <= PILL_LIMIT))!;
    const accent = theme.tweaks.find((tweak) => tweak.key === 'accent')!;
    const toggle = theme.tweaks.find((tweak) => tweak.type === 'boolean')!;
    const select = theme.tweaks.find((tweak) => tweak.type === 'select' && tweak.key !== 'mode' && tweak.options.length <= PILL_LIMIT)!;
    if (accent.type !== 'color' || select.type !== 'select' || toggle.type !== 'boolean') throw new Error('unreachable');

    // The no-JS secondary button gives way to a quiet link to the theme's page.
    expect((form.querySelector('button[formaction]') as HTMLButtonElement).hidden).toBe(true);
    const pageLink = form.querySelector('[data-theme-page]') as HTMLAnchorElement;
    expect(pageLink.hidden).toBe(false);

    const pick = form.querySelector('select[name="theme"]') as HTMLSelectElement;
    pick.value = theme.id;
    pick.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(pageLink.getAttribute('href')).toBe(`/themes/${theme.id}`);
    expect(frame.getAttribute('src')).toBe(`/previews/${theme.id}/`);
    // The new preview document is a new window; listen on that one.
    (frame.contentWindow as unknown as { postMessage: (message: unknown) => void }).postMessage = (message) => posted.push(message);
    expect(document.querySelector('[data-theme-name]')!.textContent).toBe(theme.name);
    expect(document.getElementById('preview-status')!.textContent).toContain(theme.name);
    expect([...form.querySelectorAll<HTMLInputElement>('input[name="t_accent"]')].map((input) => input.value))
      .toEqual(accent.presets.map((preset) => preset.value));
    expect(form.querySelector('details.more-options summary')!.textContent).toContain(theme.name);
    // Every rendered control is labelled.
    for (const input of form.querySelectorAll<HTMLInputElement>('#options-slot input:not([type=hidden])')) {
      expect(form.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    }

    const otherAccent = accent.presets.find((preset) => preset.value !== accent.default)!;
    const otherOption = select.options.find((option) => option.value !== select.default)!;
    for (const input of [
      form.querySelector(`input[name="t_mode"][value="dark"]`),
      form.querySelector(`input[name="t_accent"][value="${otherAccent.value}"]`),
      form.querySelector(`input[name="t_${select.key}"][value="${otherOption.value}"]`),
    ] as HTMLInputElement[]) {
      input.checked = true;
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    }
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
    dom.window.close();
  });

  test('a plain click on a gallery card tries that theme in the studio instead of leaving', () => {
    const dom = landingDom({ runScripts: 'outside-only' });
    const { document } = dom.window;
    const frame = document.getElementById('theme-preview') as HTMLIFrameElement;
    (frame.contentWindow as unknown as { postMessage: () => void }).postMessage = () => undefined;
    (dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;
    dom.window.eval(LANDING_JS);
    const other = THEMES.find((theme) => theme.id !== defaultTheme().id)!;
    const card = document.querySelector(`a[data-pick="${other.id}"]`) as HTMLAnchorElement;
    const click = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    expect(card.dispatchEvent(click)).toBe(false);
    expect((document.getElementById('theme-pick') as HTMLSelectElement).value).toBe(other.id);
    expect(frame.getAttribute('src')).toBe(`/previews/${other.id}/`);
    expect(document.activeElement?.id).toBe('theme-pick');

    const modified = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    expect(card.dispatchEvent(modified)).toBe(true);
    dom.window.close();
  });
});
