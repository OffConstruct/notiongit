import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { route, type Env } from '../src/index';
import { PREVIEW_HEADERS } from '../src/preview-render';
import { findTheme } from '../src/theme-catalog';

const PUBLIC = join(import.meta.dir, '..', 'public');
const silentConsole = new VirtualConsole();

/** The ASSETS binding as Workers serves public/: `/previews/<id>/` is its index.html. */
const assets = {
  fetch: async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const file = Bun.file(join(PUBLIC, path.endsWith('/') ? `${path}index.html` : path));
    return await file.exists() ? new Response(file) : new Response('not found', { status: 404 });
  },
} as unknown as Fetcher;

async function render(path: string, env: Partial<Env> = { ASSETS: assets }): Promise<{ response: Response; document: Document }> {
  const response = await route(new Request(`https://inkdrafts.test${path}`), env);
  const text = await response.clone().text();
  return { response, document: new JSDOM(text, { virtualConsole: silentConsole }).window.document };
}

describe('GET /preview/<id>/ (server-rendered tweaks)', () => {
  test('applies the tweaks preview.js would apply, so the no-JS preview is right', async () => {
    const { response, document } = await render('/preview/classic/?t_mode=dark&t_accent=violet&t_webfonts=false');
    expect(response.status).toBe(200);
    const root = document.documentElement;
    expect(root.getAttribute('data-ink-theme')).toBe('classic');
    expect(root.getAttribute('data-ink-mode')).toBe('dark');
    expect(root.getAttribute('data-ink-accent')).toBe('violet');
    expect(root.getAttribute('data-ink-webfonts')).toBe('off');
    expect(document.querySelector('meta[name="color-scheme"]')!.getAttribute('content')).toBe('dark');
    expect(document.getElementById('ink-fonts')).toBeNull();
    const violet = findTheme('classic')!.tweaks.find((tweak) => tweak.key === 'accent');
    if (violet?.type !== 'color') throw new Error('classic has a color accent');
    const preset = violet.presets.find((candidate) => candidate.value === 'violet')!;
    expect(document.getElementById('ink-tweaks')!.textContent).toContain(`--tw-accent:${preset.light};--tw-accent-dark:${preset.dark};`);
  });

  test('a font choice swaps the stacks and the Google Fonts link', async () => {
    const verso = findTheme('verso')!;
    const other = verso.fonts.find((font) => font.value !== verso.fonts[0]!.value && font.webfont);
    if (!other) return;
    const { document } = await render(`/preview/verso/?t_font=${other.value}`);
    expect(document.documentElement.getAttribute('data-ink-font')).toBe(other.value);
    const href = document.getElementById('ink-fonts')!.getAttribute('href')!;
    expect(href).toStartWith('https://fonts.googleapis.com/css2?');
    expect(href).not.toContain('EB+Garamond');
  });

  test('invalid values fall back to the defaults, and nothing from the query reaches the page raw', async () => {
    const { document } = await render('/preview/classic/?t_mode=%3Cscript%3E&t_accent=%22%3E%3Cb%3E');
    expect(document.documentElement.getAttribute('data-ink-mode')).toBe('auto');
    expect(document.documentElement.getAttribute('data-ink-accent')).toBe('blue');
    expect(document.querySelector('b')).toBeNull();
  });

  test('is served under the preview CSP from public/_headers', async () => {
    const { response } = await render('/preview/classic/?t_mode=dark');
    const block = readFileSync(join(PUBLIC, '_headers'), 'utf8').split('/previews/*')[1]!.split(/\n\S/u)[0]!;
    for (const [name, value] of Object.entries(PREVIEW_HEADERS)) {
      if (name === 'content-type') continue;
      expect(block.toLowerCase()).toContain(`${name}: ${value}`.toLowerCase());
      expect(response.headers.get(name)).toBe(value);
    }
  });

  test('unknown themes are a framable 404, and without an asset binding it falls back to the static export', async () => {
    expect((await render('/preview/nope/?t_mode=dark')).response.status).toBe(404);
    const { response } = await render('/preview/classic/?t_mode=dark', {});
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://inkdrafts.test/previews/classic/?t_mode=dark');
  });
});
