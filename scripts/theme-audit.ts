/**
 * Accessibility and CSP audit of theme previews in real Chrome.
 *
 *   bun run themes:audit --theme quire[,margin] [--template ../notiongit-template] [--keep]
 *   bun run themes:audit --all
 *
 * Exports the themes with the template's `scripts/export-previews` into a
 * temp dir (the worker's `public/` is never touched), serves them on
 * 127.0.0.1 with the `/previews/*` CSP from `public/_headers`, and checks:
 * - axe-core on every exported page in `mode` light and dark, and in `mode`
 *   auto with the OS set to dark (the default for most visitors' dark
 *   setting), and on the home page for every non-default value of every other
 *   tweak (real Chrome computes color contrast, which jsdom cannot);
 * - no horizontal overflow at 320 CSS px, at 1x and 2x;
 * - the phone menu at 390 CSS px: one row (never a last row with one link)
 *   and links at least 44px tall;
 * - a keyboard walk on the home page: every focus stop shows an indicator;
 * - CSP violations, which flag any external load other than Google Fonts.
 * Prints every finding and a summary, deletes its temp dir (with --keep it
 * keeps it and writes report.json there), and exits 1 on any serious or
 * critical axe finding, overflow, invisible focus or CSP violation.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { evaluate, launchChrome, navigate, type Cdp } from './chrome-cdp';

const ROOT = resolve(import.meta.dir, '..');

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const template = resolve(argument('--template') ?? join(ROOT, '..', 'notiongit-template'));
const all = process.argv.includes('--all');
const keep = process.argv.includes('--keep');
const requested = argument('--theme')?.split(',').filter(Boolean) ?? [];
if (!all && requested.length === 0) {
  console.error('usage: bun run themes:audit --theme <id>[,<id>] | --all [--template DIR]');
  process.exit(2);
}
const ids = all
  ? readdirSync(join(template, '_data/themes')).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)).sort()
  : requested;

interface Tweak {
  key: string;
  type: 'select' | 'boolean' | 'color' | 'range' | 'font';
  default: string | boolean | number;
  options?: { value: string }[];
  presets?: { value: string }[];
  min?: number;
  max?: number;
}

interface Finding {
  theme: string;
  page: string;
  variant: string;
  check: 'axe' | 'overflow' | 'focus' | 'csp' | 'load' | 'nav';
  detail: string;
}

const work = mkdtempSync(join(tmpdir(), 'notiongit-audit-'));
const exported = join(work, 'previews');
const result = Bun.spawnSync([join(template, 'scripts/export-previews'), '--out', exported, '--base', '/previews', '--themes', ids.join(',')], {
  cwd: template,
  stdout: 'pipe',
  stderr: 'pipe',
});
if (result.exitCode !== 0) {
  console.error(result.stderr.toString().slice(-3000));
  rmSync(work, { recursive: true, force: true });
  process.exit(1);
}
const index = JSON.parse(readFileSync(join(exported, 'index.json'), 'utf8')) as { themes: Record<string, { pages: string[] }> };

/** The `/previews/*` header block of public/_headers, the deployed policy. */
function previewHeaders(): Record<string, string> {
  const text = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');
  const block = text.split(/^\/previews\/\*$/mu)[1]?.split(/^\S/mu)[0] ?? '';
  return Object.fromEntries(block.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const colon = line.indexOf(':');
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
  }));
}

const headers = previewHeaders();
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (!path.startsWith('/previews/') || path.includes('..')) return new Response('not found', { status: 404 });
    let file = join(exported, path.slice('/previews/'.length));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return new Response('not found', { status: 404, headers });
    return new Response(Bun.file(file), { headers });
  },
});
const base = `http://127.0.0.1:${server.port}`;
const axeSource = readFileSync(join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const findings: Finding[] = [];
let runs = 0;

function nonDefaultValues(tweak: Tweak): (string | number | boolean)[] {
  switch (tweak.type) {
    case 'select': return (tweak.options ?? []).map((option) => option.value).filter((value) => value !== tweak.default);
    case 'color': return (tweak.presets ?? []).map((preset) => preset.value).filter((value) => value !== tweak.default);
    case 'boolean': return [!tweak.default];
    case 'range': return [tweak.min!, tweak.max!].filter((value) => value !== tweak.default);
    case 'font': return [];
  }
}

async function axe(cdp: Cdp): Promise<string[]> {
  await evaluate(cdp, `${axeSource};true`);
  // preload would fetch stylesheets over XHR, which the preview CSP blocks.
  return evaluate(cdp, `axe.run(document, { resultTypes: ['violations'], preload: false }).then((r) => r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => v.id + ' (' + v.impact + '): ' + v.help + ' at ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('; ')))`);
}

async function open(cdp: Cdp, url: string, width: number, scale: number): Promise<void> {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: scale, mobile: width < 600 });
  await navigate(cdp, url);
  await evaluate(cdp, 'Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]).then(() => true)');
}

const chrome = await launchChrome();
try {
  for (const id of ids) {
    const manifest = JSON.parse(readFileSync(join(template, '_data/themes', `${id}.json`), 'utf8')) as { tweaks: Tweak[] };
    const pages = index.themes[id]?.pages ?? [];
    const { cdp, close } = await chrome.newTab();
    let context = { page: '', variant: '' };
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    cdp.on('Log.entryAdded', ({ entry }) => {
      if (/Content Security Policy/u.test(entry.text)) findings.push({ theme: id, ...context, check: 'csp', detail: entry.text });
      else if (entry.source === 'network' && entry.level === 'error' && !/\/favicon\.ico$/u.test(entry.url ?? '')) findings.push({ theme: id, ...context, check: 'load', detail: `${entry.text} ${entry.url ?? ''}` });
    });

    const variants: { name: string; query: string; pages: string[]; osDark?: boolean }[] = [
      { name: 'mode=light', query: 't_mode=light', pages },
      { name: 'mode=dark', query: 't_mode=dark', pages },
      { name: 'mode=auto, OS dark', query: 't_mode=auto', pages, osDark: true },
      ...manifest.tweaks.filter((tweak) => tweak.key !== 'mode').flatMap((tweak) => nonDefaultValues(tweak).map((value) => ({
        name: `${tweak.key}=${value}`,
        query: new URLSearchParams({ [`t_${tweak.key}`]: String(value) }).toString(),
        pages: ['index.html'],
      }))),
    ];
    for (const variant of variants) {
      await cdp.send('Emulation.setEmulatedMedia', { features: [
        { name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-color-scheme', value: variant.osDark ? 'dark' : 'light' },
      ] });
      for (const page of variant.pages) {
        context = { page, variant: variant.name };
        await open(cdp, `${base}/previews/${id}/${page.replace(/index\.html$/u, '')}?${variant.query}`, 1280, 1);
        for (const detail of await axe(cdp)) findings.push({ theme: id, ...context, check: 'axe', detail });
        runs += 1;
      }
    }

    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const page of pages) {
      for (const scale of [1, 2]) {
        context = { page, variant: `320px@${scale}x` };
        await open(cdp, `${base}/previews/${id}/${page.replace(/index\.html$/u, '')}`, 320, scale);
        const width = await evaluate(cdp, 'document.documentElement.scrollWidth');
        if (width > 320) findings.push({ theme: id, ...context, check: 'overflow', detail: `scrollWidth ${width}px at a 320px viewport` });
      }
    }

    // Phones: the main menu is one row (no orphaned last item) of 44px tap targets.
    context = { page: 'index.html', variant: 'nav@390' };
    await open(cdp, `${base}/previews/${id}/`, 390, 1);
    const nav = await evaluate(cdp, `(() => { const nav = document.querySelector('nav[aria-label="Main navigation"]');
      if (!nav) return null;
      const links = [...nav.querySelectorAll('a')].filter((a) => a.getClientRects().length > 0);
      const rows = new Map();
      for (const a of links) { const top = Math.round(a.getBoundingClientRect().top); rows.set(top, (rows.get(top) ?? 0) + 1); }
      const small = links.filter((a) => a.getBoundingClientRect().height < 44).map((a) => a.textContent.trim().replace(/\\s+/g, ' '));
      return { rows: [...rows.entries()].sort((x, y) => x[0] - y[0]).map(([, n]) => n), small }; })()`);
    if (nav && nav.rows.length > 1 && nav.rows.at(-1) === 1) findings.push({ theme: id, ...context, check: 'nav', detail: `the menu wraps and its last row holds one link (rows: ${nav.rows.join(' + ')})` });
    if (nav && nav.small.length > 0) findings.push({ theme: id, ...context, check: 'nav', detail: `menu links under 44px tall: ${nav.small.join(', ')}` });

    context = { page: 'index.html', variant: 'keyboard' };
    await open(cdp, `${base}/previews/${id}/`, 1280, 1);
    for (let stop = 0; stop < 40; stop += 1) {
      for (const type of ['keyDown', 'keyUp'] as const) {
        await cdp.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      }
      const focus = await evaluate(cdp, `(() => { const el = document.activeElement;
        if (!el || el === document.body) return null;
        // A stretched link (::after covering its card) draws the ring on the pseudo-element.
        const ring = (s) => s.outlineStyle !== 'none' && s.outlineWidth !== '0px';
        const s = getComputedStyle(el);
        const visible = ring(s) || s.boxShadow !== 'none' || ring(getComputedStyle(el, '::after'));
        return { name: el.tagName + (el.id ? '#' + el.id : '') + ' ' + (el.textContent || '').trim().slice(0, 30), visible }; })()`);
      if (focus === null) break;
      if (!focus.visible) findings.push({ theme: id, ...context, check: 'focus', detail: `${focus.name} shows no focus indicator` });
    }
    await close();
    console.log(`audited ${id}`);
  }
} finally {
  await chrome.stop();
  server.stop(true);
  rmSync(exported, { recursive: true, force: true });
}

for (const finding of findings) console.log(`[${finding.theme}] ${finding.page} ${finding.variant} ${finding.check}: ${finding.detail}`);
let where = '';
if (keep) {
  const report = join(work, 'report.json');
  writeFileSync(report, JSON.stringify({ themes: ids, runs, findings }, null, 2));
  where = ` Report: ${report} (delete it when done)`;
} else {
  rmSync(work, { recursive: true, force: true });
}
console.log(`\n${ids.length} theme(s), ${runs} axe runs, ${findings.length} finding(s).${where}`);
process.exit(findings.length > 0 ? 1 : 0);
