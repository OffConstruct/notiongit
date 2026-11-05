import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { route } from '../src/index';
import { defaultTheme, parseAppearanceParams, THEMES } from '../src/theme-catalog';
import { GALLERY_GROUPS, galleryGroupsOf, galleryOrder, themesInGroup } from '../src/theme-ui';

const ROOT = join(import.meta.dir, '..');
const CUSTOMIZER_JS = readFileSync(join(ROOT, 'public', 'assets', 'customizer.js'), 'utf8');
const silentConsole = new VirtualConsole();

async function get(path: string): Promise<{ response: Response; text: string }> {
  const response = await route(new Request(`https://inkdrafts.test${path}`));
  return { response, text: await response.text() };
}

function csp(response: Response): Record<string, string> {
  return Object.fromEntries((response.headers.get('content-security-policy') ?? '').split(';').map((part) => {
    const [name, ...values] = part.trim().split(/\s+/u);
    return [name, values.join(' ')];
  }));
}

describe('GET /themes', () => {
  test('lists every catalog theme with a same-origin thumbnail, no script, and a public cache', async () => {
    const { response, text } = await get('/themes');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const policy = csp(response);
    expect(policy['script-src']).toBe("'none'");
    expect(policy['frame-ancestors']).toBe("'none'");
    expect(policy['default-src']).toBe("'none'");
    expect(text).not.toContain('<script');
    for (const theme of THEMES) expect(text).toContain(`href="/themes/${theme.id}"`);
    const sources = [...text.matchAll(/<img[^>]* src="([^"]+)"/gu)].map((match) => match[1]);
    expect(sources).toHaveLength(THEMES.length);
    for (const src of sources) expect(src).toMatch(/^\/previews\/[a-z]+\/thumb\.webp$/u);
  });

  test('the audience filter is a plain GET link, old category links still work, and unknown values show everything', async () => {
    const writing = GALLERY_GROUPS.find((group) => group.id === 'writing')!;
    const page = (await get('/themes?for=writing')).text;
    expect([...page.matchAll(/<a class="theme-card"/gu)].length).toBe(themesInGroup(writing).length);
    expect(page).toContain('href="/themes?for=writing" aria-current="page"');
    expect(page).toContain('<h1>Designs for writing &amp; blogs</h1>');
    expect((await get('/themes?category=writers')).text).toContain('href="/themes?for=writing" aria-current="page"');
    const bogus = (await get('/themes?for=%3Cb%3E')).text;
    expect([...bogus.matchAll(/<a class="theme-card"/gu)].length).toBe(THEMES.length);
    expect(bogus).not.toContain('<b>');
  });

  test('cards are whole-card links in the same curated order as the landing page', async () => {
    const { text } = await get('/themes');
    const hrefs = [...text.matchAll(/<a class="theme-card" href="\/themes\/([a-z]+)"/gu)].map((match) => match[1]);
    expect(hrefs).toEqual(galleryOrder(THEMES).map((theme) => theme.id));
    const dom = new JSDOM(text, { virtualConsole: silentConsole });
    for (const card of dom.window.document.querySelectorAll('a.theme-card')) {
      expect(card.querySelector('img')).not.toBeNull();
      expect(card.querySelector('.name')!.textContent).not.toBe('');
      expect(card.querySelector('.for')!.textContent).not.toBe('');
    }
    expect(text).not.toContain('Jekyll');
    dom.window.close();
  });
});

describe('GET /themes/<id>', () => {
  test('renders the preview, the tweak form and the two actions under a framing CSP', async () => {
    const { response, text } = await get('/themes/classic');
    expect(response.status).toBe(200);
    const policy = csp(response);
    expect(policy['frame-src']).toBe("'self'");
    expect(policy['script-src']).toBe("'self'");
    expect(policy['form-action']).toBe("'self' https://github.com");
    expect(text).toContain('<form class="tweak-form" method="get" action="/connect" data-customizer>');
    expect(text).toContain('<input type="hidden" name="theme" value="classic">');
    expect(text).toContain('<iframe id="theme-preview" src="/previews/classic/" title="Preview of Classic with sample writing" loading="lazy" tabindex="-1">');
    expect(text).toContain('<a class="text-link" href="/previews/classic/" target="_blank" rel="noopener" data-preview-full>Open full-size preview');
    expect(text).toContain('formaction="/themes/classic" data-js-hidden>Preview</button>');
    expect(text).toContain('<script src="/assets/preview-stage.js" defer></script>');
    expect(text).toContain('<script src="/assets/customizer.js" defer></script>');
    // The primary action comes before the options and again in the sticky bar after them.
    expect(text.match(/>Create my site with Classic<\/button>/gu)).toHaveLength(2);
    expect(text.indexOf('>Create my site with Classic</button>')).toBeLessThan(text.indexOf('<legend>Make it yours</legend>'));
    expect(text.lastIndexOf('>Create my site with Classic</button>')).toBeGreaterThan(text.indexOf('<details class="fine-tune">'));
    // The description sits under the title, before the options; no config-file or version noise.
    expect(text.indexOf(defaultTheme().description.slice(0, 40))).toBeLessThan(text.indexOf('<div class="detail">'));
    expect(text).not.toContain('_config.yml');
    expect(text).not.toContain('version ');
    expect(text).not.toContain('Use this theme');
    expect(text).toContain('id="customizer-data"');
  });

  test('t_* from the no-JS Preview button redirect to the canonical query; bad values are dropped', async () => {
    const noisy = await get('/themes/classic?theme=classic&t_mode=dark&t_accent=%3Cscript%3E&t_webfonts=off&t_webfonts=on&theme=nope');
    expect(noisy.response.status).toBe(303);
    expect(noisy.response.headers.get('location')).toBe('/themes/classic?t_mode=dark');
    expect((await get('/themes/classic?t_mode=auto')).response.headers.get('location')).toBe('/themes/classic');

    const { response, text } = await get('/themes/classic?t_mode=dark');
    expect(response.status).toBe(200);
    expect(text).toContain('src="/preview/classic/?t_mode=dark"');
    expect(text).toMatch(/<input type="radio" id="tweak-mode-\d" name="t_mode" value="dark" checked>/u);
    expect(text).not.toContain('<script>');
  });

  test('the pager wraps around within the audience group, at the top and the bottom', async () => {
    for (const theme of THEMES) {
      const group = galleryGroupsOf(theme)[0]!;
      const siblings = galleryOrder(themesInGroup(group));
      if (siblings.length < 2) continue;
      const { text } = await get(`/themes/${theme.id}`);
      const index = siblings.findIndex((sibling) => sibling.id === theme.id);
      expect(text.match(new RegExp(`href="/themes/${siblings[(index + 1) % siblings.length]!.id}" rel="next"`, 'gu'))).toHaveLength(2);
      expect(text.match(new RegExp(`href="/themes/${siblings[(index - 1 + siblings.length) % siblings.length]!.id}" rel="prev"`, 'gu'))).toHaveLength(2);
      expect(text).toContain(`href="/themes?for=${group.id}"`);
      expect(text.indexOf('class="pager"')).toBeLessThan(text.indexOf('<div class="detail">'));
    }
  });

  test('a theme with one fixed accent offers no accent choice', async () => {
    const fixed = THEMES.find((theme) => theme.tweaks.some((tweak) => tweak.key === 'accent' && tweak.type === 'color' && tweak.presets.length === 1 && !tweak.custom));
    if (!fixed) return;
    const { text } = await get(`/themes/${fixed.id}`);
    expect(text).not.toContain('name="t_accent"');
  });

  test('without JS, "Use this theme" submits exactly what /connect/github parses', async () => {
    const { text } = await get('/themes/classic?t_mode=dark&t_webfonts=false');
    const dom = new JSDOM(text, { url: 'https://inkdrafts.test/themes/classic', virtualConsole: silentConsole });
    const form = dom.window.document.querySelector('form[data-customizer]') as HTMLFormElement;
    const params = new URLSearchParams([...new dom.window.FormData(form).entries()].map(([key, value]) => [key, String(value)]));
    expect(parseAppearanceParams(params)).toEqual({
      kind: 'ok',
      appearance: { v: 1, themeId: defaultTheme().id, tweaks: { mode: 'dark', webfonts: false } },
    });
    dom.window.close();
  });

  test('unknown themes are a 404 page', async () => {
    const { response, text } = await get('/themes/nope');
    expect(response.status).toBe(404);
    expect(text).toContain('href="/themes">Browse all designs</a>');
    // The router owns capitalised paths (it redirects them); only the lowercase miss is this page's.
    expect((await get('/themes/classicx')).response.status).toBe(404);
  });

  test('every catalog theme detail page renders', async () => {
    for (const theme of THEMES) {
      const { response, text } = await get(`/themes/${theme.id}`);
      expect(response.status).toBe(200);
      expect(text).toContain(`title="Preview of ${theme.name} with sample writing"`);
      expect(text).toContain(`>Create my site with ${theme.name}</button>`);
    }
  });
});

describe('customizer.js', () => {
  test('stays under its 10 KB budget', () => {
    expect(CUSTOMIZER_JS.length).toBeLessThanOrEqual(10 * 1024);
  });

  test('on the customize screen, changing the design navigates at once and the unsaved cue follows the form', async () => {
    const { appearancePage } = await import('../src/appearance-page');
    const { appearanceFor } = await import('../src/theme-catalog');
    const classic = defaultTheme();
    const html = appearancePage({
      kind: 'editor',
      site: { login: 'alice', repositoryName: 'alice.github.io', repositoryUrl: 'https://github.com/alice/alice.github.io', defaultBranch: 'main', siteUrl: 'https://alice.github.io' },
      offered: THEMES,
      current: appearanceFor(classic, {}),
      selected: appearanceFor(classic, {}),
      notice: null,
      error: null,
      formToken: 'token',
    });
    const dom = new JSDOM(html, { url: 'https://inkdrafts.test/status/appearance', runScripts: 'outside-only', virtualConsole: silentConsole });
    const { document } = dom.window;
    const navigations: string[] = [];
    const frame = document.getElementById('theme-preview') as HTMLIFrameElement;
    (frame.contentWindow as unknown as { postMessage: () => void }).postMessage = () => undefined;
    dom.window.eval(CUSTOMIZER_JS);

    // The no-JS "Show this design" button gives way to the select itself.
    expect((document.querySelector('[data-theme-switch-submit]') as HTMLElement).hidden).toBe(true);
    const cue = document.querySelector('[data-unsaved-cue]') as HTMLElement;
    expect(cue.hidden).toBe(true);
    const dirtyEvents: boolean[] = [];
    const form = document.querySelector('form[data-customizer]')!;
    form.addEventListener('inkdrafts:dirty', (event) => dirtyEvents.push((event as CustomEvent<{ dirty: boolean }>).detail.dirty));
    // jsdom cannot navigate; the switch is announced first, cancelably, so a page script can hold it.
    form.addEventListener('inkdrafts:switch', (event) => { navigations.push((event as CustomEvent<{ href: string }>).detail.href); event.preventDefault(); });

    const mode = document.querySelector('input[name="t_mode"][value="dark"]') as HTMLInputElement;
    mode.checked = true;
    mode.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(cue.hidden).toBe(false);
    expect(dirtyEvents.at(-1)).toBe(true);
    const auto = document.querySelector('input[name="t_mode"][value="auto"]') as HTMLInputElement;
    auto.checked = true;
    auto.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(cue.hidden).toBe(true);

    mode.checked = true;
    mode.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const other = THEMES.find((theme) => theme.id !== classic.id)!;
    const select = document.getElementById('theme-switch') as HTMLSelectElement;
    select.value = other.id;
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(navigations).toEqual([`/status/appearance?theme=${other.id}&t_mode=dark`]);
    dom.window.close();
  });

  test('posts validated tweaks to the preview on change and mirrors them in the URL', async () => {
    const { text } = await get('/themes/classic');
    const dom = new JSDOM(text, { url: 'https://inkdrafts.test/themes/classic', runScripts: 'outside-only', virtualConsole: silentConsole });
    const { document } = dom.window;
    const frame = document.getElementById('theme-preview') as HTMLIFrameElement;
    const posted: { message: unknown; origin: string }[] = [];
    (frame.contentWindow as unknown as { postMessage: (message: unknown, origin: string) => void }).postMessage =
      (message, origin) => posted.push({ message, origin });
    dom.window.eval(CUSTOMIZER_JS);

    expect((document.querySelector('button[formaction]') as HTMLButtonElement).hidden).toBe(true);
    const mode = document.querySelector('input[name="t_mode"][value="dark"]') as HTMLInputElement;
    mode.checked = true;
    mode.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(posted.at(-1)).toEqual({
      message: { type: 'inkdrafts:tweaks', v: 1, theme: 'classic', tweaks: { mode: 'dark' } },
      origin: 'https://inkdrafts.test',
    });
    expect(dom.window.location.search).toBe('?t_mode=dark');

    // In Dark, a light color is judged on the dark ground it will sit on.
    const hex = document.querySelector('input[name="c_accent"]') as HTMLInputElement;
    hex.value = '#F0E060';
    hex.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect((posted.at(-1)!.message as { tweaks: object }).tweaks).toEqual({ mode: 'dark', accent: '#f0e060' });
    expect(document.querySelector('output[data-contrast-for="accent"]')!.textContent).toContain('readable');

    // In Light, the same color is too light, is not sent, and says why.
    const light = document.querySelector('input[name="t_mode"][value="light"]') as HTMLInputElement;
    light.checked = true;
    light.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect((posted.at(-1)!.message as { tweaks: object }).tweaks).toEqual({ mode: 'light' });
    expect(document.querySelector('output[data-contrast-for="accent"]')!.textContent).toContain('Too light on the light background');

    hex.value = '#0B6E4F';
    hex.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect((posted.at(-1)!.message as { tweaks: object }).tweaks).toEqual({ mode: 'light', accent: '#0b6e4f' });
    dom.window.close();
  });
});

describe('preview serving', () => {
  test('_headers gives previews their own CSP: fonts only, framable by this origin', () => {
    const headers = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');
    const block = headers.split('/previews/*')[1].split(/\n\S/u)[0];
    expect(block).toContain("frame-ancestors 'self'");
    expect(block).toContain('font-src https://fonts.gstatic.com');
    expect(block).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(block).toContain("script-src 'self'");
    expect(block).toContain("connect-src 'none'");
    expect(block).toContain('Cache-Control: public, max-age=3600');
    expect(block).toContain('X-Content-Type-Options: nosniff');
  });

  test('wrangler serves public/ before the Worker and lets misses fall through', () => {
    const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
    expect(toml).toMatch(/\[assets\]\ndirectory = "\.\/public"\nhtml_handling = "auto-trailing-slash"\nnot_found_handling = "none"/u);
  });

  test('exported preview pages load nothing external except Google Fonts', () => {
    const previews = join(ROOT, 'public', 'previews');
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : path.endsWith('.html') ? [path] : [];
    });
    for (const file of walk(previews)) {
      const html = readFileSync(file, 'utf8');
      for (const [, src] of html.matchAll(/\ssrc="([^"]+)"/gu)) expect({ file, src, local: src.startsWith('/previews/') }).toMatchObject({ local: true });
      for (const [, href] of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"|<link[^>]*href="([^"]+)"[^>]*rel="stylesheet"/gu)) {
        if (href === undefined) continue;
        expect({ file, href, ok: href.startsWith('/previews/') || href.startsWith('https://fonts.googleapis.com/') }).toMatchObject({ ok: true });
      }
    }
  });

  test('a preview link outside the exported pages gets a framable 404 inside the iframe', async () => {
    const { response, text } = await get('/previews/classic/2023/05/21/hello-again/');
    expect(response.status).toBe(404);
    expect(csp(response)['frame-ancestors']).toBe("'self'");
    expect(text).toContain('href="/previews/classic/"');
  });
});

describe('one font control on the theme page', () => {
  test('an all-web-font design offers device fonts in the list and no separate switch', async () => {
    const { text } = await get('/themes/verso');
    expect(text).not.toContain('name="t_webfonts"');
    expect(text).toContain('name="t_font" value="device"');
  });

  test('choosing device fonts carries web fonts off into the preview link and the signup hand-off', async () => {
    const detail = await get('/themes/verso?t_font=device');
    expect(detail.response.status).toBe(303);
    expect(detail.response.headers.get('location')).toBe('/themes/verso?t_webfonts=false');
    const connect = await get('/connect?theme=verso&t_font=device');
    expect(connect.text).toContain('<input type="hidden" name="t_webfonts" value="false">');
    expect(connect.text).not.toContain('name="t_font"');
  });
});
