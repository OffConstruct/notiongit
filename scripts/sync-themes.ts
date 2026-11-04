/**
 * Refresh the theme catalog and previews from the template repository.
 *
 *   bun run themes:sync [--template ../notiongit-template] [--themes a,b]
 *                       [--no-screenshots] [--catalog-only]
 *
 * 1. Runs `<template>/scripts/export-previews --base /previews` into a temp dir.
 * 2. Replaces `public/previews/` with it (themes missing from the export go).
 * 3. Screenshots `/previews/<id>/` at 1280x800, light, into `thumb.webp`
 *    (640x400). `--no-screenshots` keeps each theme's previous thumbnail.
 * 4. Writes `src/theme-catalog.generated.ts` from `_data/themes/*.json`.
 *
 * `--catalog-only` skips steps 1-3. `--themes` limits the catalog and the
 * export to those ids; without it every manifest in the template is used.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { CatalogThemeData, CatalogTweak, ThemeCatalogData, ThemeCategory } from '../src/theme-catalog';
import { evaluate, launchChrome, navigate } from './chrome-cdp';

const ROOT = resolve(import.meta.dir, '..');
const PUBLIC_PREVIEWS = join(ROOT, 'public', 'previews');
const GENERATED = join(ROOT, 'src', 'theme-catalog.generated.ts');
const THUMB_BYTES_MAX = 40 * 1024;

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const template = resolve(argument('--template') ?? join(ROOT, '..', 'notiongit-template'));
const onlyThemes = argument('--themes')?.split(',').filter(Boolean) ?? null;
const screenshots = !process.argv.includes('--no-screenshots');
const catalogOnly = process.argv.includes('--catalog-only');

function fail(message: string): never {
  console.error(`themes:sync: ${message}`);
  process.exit(1);
}

function run(command: string[], cwd: string): string {
  const result = Bun.spawnSync(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) fail(`${command.join(' ')} failed:\n${result.stderr.toString().slice(-3000)}`);
  return result.stdout.toString().trim();
}

// ---- manifests -> catalog data -------------------------------------------

type Json = Record<string, unknown>;

function object(value: unknown, where: string): Json {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${where}: expected an object`);
  return value as Json;
}

function string(value: unknown, where: string): string {
  if (typeof value !== 'string') fail(`${where}: expected a string`);
  return value;
}

function array(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where}: expected an array`);
  return value;
}

function swatch(value: unknown, where: string) {
  const record = object(value, where);
  return { bg: string(record.bg, `${where}.bg`), text: string(record.text, `${where}.text`), muted: string(record.muted, `${where}.muted`) };
}

/** Tweaks are copied verbatim (the template validator owns their rules);
 * this only checks the fields the worker reads. */
function tweak(value: unknown, where: string): CatalogTweak {
  const record = object(value, where);
  const type = string(record.type, `${where}.type`);
  string(record.key, `${where}.key`);
  string(record.label, `${where}.label`);
  if (type === 'select') {
    array(record.options, `${where}.options`);
  } else if (type === 'color') {
    array(record.presets, `${where}.presets`);
  } else if (type === 'range') {
    for (const field of ['min', 'max', 'step', 'default']) {
      if (typeof record[field] !== 'number') fail(`${where}.${field}: expected a number`);
    }
  } else if (type !== 'boolean' && type !== 'font') {
    fail(`${where}.type: unknown tweak type ${type}`);
  }
  return record as unknown as CatalogTweak;
}

function catalogTheme(file: string, categories: readonly string[]): CatalogThemeData {
  const manifest = object(JSON.parse(readFileSync(file, 'utf8')), file);
  const id = string(manifest.id, `${file}: id`);
  if (`${id}.json` !== file.split('/').pop()) fail(`${file}: id ${id} does not match the file name`);
  const themeCategories = array(manifest.categories, `${id}.categories`).map((category) => {
    const value = string(category, `${id}.categories`);
    if (!categories.includes(value)) fail(`${id}: unknown category ${value}`);
    return value as ThemeCategory;
  });
  const author = object(manifest.author, `${id}.author`);
  const palette = object(manifest.palette, `${id}.palette`);
  return {
    id,
    name: string(manifest.name, `${id}.name`),
    version: string(manifest.version, `${id}.version`),
    summary: string(manifest.summary, `${id}.summary`),
    description: string(manifest.description, `${id}.description`),
    categories: themeCategories,
    author: author.url === undefined
      ? { name: string(author.name, `${id}.author.name`) }
      : { name: string(author.name, `${id}.author.name`), url: string(author.url, `${id}.author.url`) },
    palette: { light: swatch(palette.light, `${id}.palette.light`), dark: swatch(palette.dark, `${id}.palette.dark`) },
    fonts: array(manifest.fonts, `${id}.fonts`).map((font, index) => {
      const record = object(font, `${id}.fonts[${index}]`);
      return { value: string(record.value, `${id}.fonts.value`), label: string(record.label, `${id}.fonts.label`), webfont: record.google !== null };
    }),
    tweaks: array(manifest.tweaks, `${id}.tweaks`).map((entry, index) => tweak(entry, `${id}.tweaks[${index}]`)),
    preview: `/previews/${id}/`,
    thumbnail: `/previews/${id}/thumb.webp`,
  };
}

/** The schema enum is the source of truth; labels come from the docs table. */
function readCategories(): { id: ThemeCategory; label: string }[] {
  const schema = object(JSON.parse(readFileSync(join(template, 'scripts/themes/theme.schema.json'), 'utf8')), 'schema');
  const ids = array(object(object(schema.$defs, 'schema.$defs').category, 'schema category').enum, 'schema category enum')
    .map((value) => string(value, 'category'));
  const readme = readFileSync(join(template, 'docs/themes/README.md'), 'utf8');
  const table = readme.split('<!-- categories:start -->')[1]?.split('<!-- categories:end -->')[0] ?? '';
  const labels = new Map([...table.matchAll(/^\|\s*`([a-z]+)`\s*\|\s*([^|]+?)\s*\|$/gmu)].map((match) => [match[1], match[2]]));
  return ids.map((id) => ({ id: id as ThemeCategory, label: labels.get(id) ?? id[0].toUpperCase() + id.slice(1) }));
}

function templateRevision(): { commit: string; dirty: boolean } {
  return {
    commit: run(['git', 'rev-parse', 'HEAD'], template),
    dirty: run(['git', 'status', '--porcelain'], template) !== '',
  };
}

// ---- previews -------------------------------------------------------------

function exportPreviews(ids: string[]): string {
  const out = mkdtempSync(join(tmpdir(), 'notiongit-previews-'));
  run([join(template, 'scripts/export-previews'), '--out', join(out, 'previews'), '--base', '/previews', '--themes', ids.join(',')], template);
  return join(out, 'previews');
}

function replacePreviews(exported: string, ids: string[]): void {
  const previous = `${PUBLIC_PREVIEWS}.old`;
  rmSync(previous, { recursive: true, force: true });
  if (existsSync(PUBLIC_PREVIEWS)) renameSync(PUBLIC_PREVIEWS, previous);
  mkdirSync(dirname(PUBLIC_PREVIEWS), { recursive: true });
  run(['cp', '-R', exported, PUBLIC_PREVIEWS], ROOT);
  for (const id of ids) {
    const oldThumb = join(previous, id, 'thumb.webp');
    if (!screenshots && existsSync(oldThumb)) copyFileSync(oldThumb, join(PUBLIC_PREVIEWS, id, 'thumb.webp'));
  }
  rmSync(previous, { recursive: true, force: true });
  rmSync(dirname(exported), { recursive: true, force: true });
}

function servePublic() {
  const publicDir = join(ROOT, 'public');
  return Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      let path = decodeURIComponent(new URL(request.url).pathname);
      if (path.includes('..')) return new Response('bad path', { status: 400 });
      if (path.endsWith('/')) path += 'index.html';
      const file = join(publicDir, path);
      return existsSync(file) && statSync(file).isFile() ? new Response(Bun.file(file)) : new Response('not found', { status: 404 });
    },
  });
}

async function takeScreenshots(ids: string[]): Promise<void> {
  const server = servePublic();
  const chrome = await launchChrome();
  try {
    for (const id of ids) {
      const tab = await chrome.newTab();
      const { cdp } = tab;
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      await navigate(cdp, `http://127.0.0.1:${server.port}/previews/${id}/`);
      await evaluate(cdp, 'Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => true)');
      await new Promise((resolve) => setTimeout(resolve, 300));
      let bytes: Buffer | null = null;
      for (const quality of [80, 70, 60, 50, 40]) {
        const shot = await cdp.send('Page.captureScreenshot', {
          format: 'webp',
          quality,
          clip: { x: 0, y: 0, width: 1280, height: 800, scale: 0.5 },
        });
        bytes = Buffer.from(shot.data, 'base64');
        if (bytes.length <= THUMB_BYTES_MAX) break;
      }
      if (!bytes || bytes.length > THUMB_BYTES_MAX) fail(`${id}: thumbnail is over ${THUMB_BYTES_MAX} bytes even at quality 40`);
      writeFileSync(join(PUBLIC_PREVIEWS, id, 'thumb.webp'), bytes);
      await tab.close();
      console.log(`thumb ${id} (${bytes.length} bytes)`);
    }
  } finally {
    await chrome.stop();
    server.stop(true);
  }
}

// ---- generated module -----------------------------------------------------

function writeModule(data: ThemeCatalogData): void {
  const body = JSON.stringify(data, null, 2);
  writeFileSync(GENERATED, `// Generated by scripts/sync-themes.ts from the template's _data/themes/*.json.
// Do not edit by hand: run \`bun run themes:sync\` (or \`--catalog-only\`).
import type { ThemeCatalogData } from './theme-catalog';

export const THEME_CATALOG_DATA: ThemeCatalogData = ${body};
`);
}

// ---- main -----------------------------------------------------------------

if (!existsSync(join(template, '_data/themes'))) fail(`no _data/themes in ${template}`);
const categories = readCategories();
const available = readdirSync(join(template, '_data/themes')).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)).sort();
const ids = onlyThemes ? [...onlyThemes].sort() : available;
for (const id of ids) if (!available.includes(id)) fail(`unknown theme ${id}`);
if (!ids.includes('classic')) fail('the catalog must include classic');

const themes = ids.map((id) => catalogTheme(join(template, '_data/themes', `${id}.json`), categories.map((category) => category.id)));
const revision = templateRevision();

if (!catalogOnly) {
  replacePreviews(exportPreviews(ids), ids);
  if (screenshots) await takeScreenshots(ids);
}
writeModule({ templateCommit: revision.commit, templateDirty: revision.dirty, categories, themes });
console.log(`catalog: ${ids.length} themes from ${revision.commit.slice(0, 7)}${revision.dirty ? ' (dirty tree)' : ''}`);
