/**
 * Real-browser accessibility checks for the rendered surfaces: no horizontal
 * overflow at 320 CSS px (WCAG reflow) and at 2x scale (200% zoom), and a
 * keyboard walk that reaches every visible interactive element with a
 * visible focus outline. The axe suite in test/a11y.test.ts covers structure
 * in jsdom; this script covers what only a layout engine can answer.
 *
 * Zero dependencies: serves the generated documents with Bun.serve and
 * drives headless Chrome over the DevTools protocol.
 *
 * Usage: bun run scripts/reflow-check.ts
 * Exits non-zero on any failure; --shots DIR also saves 320px screenshots.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { evaluate as evaluateIn, launchChrome } from './chrome-cdp';
import { connectPage } from '../src/connect-page';
import { LANDING_PAGE } from '../src/landing-page';
import { appearanceFor, findTheme } from '../src/theme-catalog';
import { progressPage } from '../src/progress-page';
import { projectProvisioning } from '../src/progress';
import { createProvisioningJob } from '../src/provisioning-job';
import { statusPage } from '../src/status-page';
import { errorPage } from '../src/error-page';
import { themePageStates } from '../test/fixtures/theme-pages';

const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const NOW = 1_000_000;

function snapshotFor(status: 'queued' | 'succeeded' | 'dead_letter'): ReturnType<typeof projectProvisioning> {
  const job = createProvisioningJob({
    jobId: 'job-123',
    installationId: 1,
    identity: { id: 1, login: 'alice', accountType: 'User' },
    repository: { name: 'alice.github.io', url: 'https://alice.github.io', baseurl: '', kind: 'apex' },
    generatedRepository: {
      id: 1001,
      fullName: 'alice/alice.github.io',
      name: 'alice.github.io',
      htmlUrl: 'https://github.com/alice/alice.github.io',
      defaultBranch: 'main',
      templateFullName: 'OffConstruct/notiongit-template',
      templateHeadSha: null,
      templateHeadTreeSha: null,
      headSha: null,
      headTreeSha: null,
      reused: false,
    },
    now: NOW,
  });
  if (status !== 'queued') job.data.notionSecretsWrittenAt = NOW + 1;
  if (status === 'succeeded') {
    for (const step of Object.keys(job.steps) as (keyof typeof job.steps)[]) {
      job.steps[step] = { ...job.steps[step], status: 'succeeded', attempts: 1 };
    }
    job.data.notionLinks = {
      pagesUrl: 'https://www.notion.so/alice/Pages-11111111111141118111111111111111',
      postsUrl: 'https://www.notion.so/alice/Posts-22222222222242228222222222222222',
      templateRootUrl: 'https://www.notion.so/alice/My-Site-Home',
    };
  }
  job.status = status;
  return projectProvisioning(job, NOW + 10);
}

const session = {
  kind: 'session',
  viewer: { login: 'alice' },
  site: {
    repository: { name: 'alice.github.io', url: 'https://github.com/alice/alice.github.io' },
    site: { url: 'https://alice.github.io' },
    sync: { kind: 'succeeded', finishedAtMs: 2, runUrl: null },
    deploy: { kind: 'built', commitSha: 'abc' },
    runInFlight: false,
  },
} as const;

const routes: Record<string, string> = {
  '/': LANDING_PAGE,
  '/connect': connectPage(null),
  '/connect-chosen': connectPage(appearanceFor(findTheme('issue')!, { mode: 'dark' })),
  '/progress-active': progressPage('job-123', snapshotFor('queued')),
  '/progress-succeeded': progressPage('job-123', snapshotFor('succeeded')),
  '/progress-failed': progressPage('job-123', snapshotFor('dead_letter')),
  '/status': statusPage(session, { notice: null, rerunFormToken: 'token' }),
  '/error': errorPage({ code: 'github_state_replayed', status: 400, retryAfterSeconds: null, restartHref: '/connect/github' }),
  ...themePageStates(),
};

// The landing page runs with its real script, font and thumbnails, so the
// enhanced customizer is what gets walked. Preview pages stay unserved: their
// own links would otherwise join the keyboard walk through the iframe.
const STATIC_FILE = /^\/(assets\/[\w./-]+|previews\/[a-z]+\/thumb(-320)?\.webp)$/u;
const PUBLIC_DIR = join(import.meta.dir, '..', 'public');

// The same landing document again with scripts off, as a visitor without
// JavaScript gets it.
const SCRIPTLESS_SURFACES = new Set(['/?js=off']);

const server = Bun.serve({
  port: 0,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    const document = routes[path];
    if (document !== undefined) return new Response(document, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    const file = STATIC_FILE.test(path) && !path.includes('..') ? Bun.file(join(PUBLIC_DIR, path)) : null;
    if (file && await file.exists()) return new Response(file);
    return new Response('not found', { status: 404 });
  },
});

interface Failure {
  surface: string;
  check: string;
  detail: string;
}

const failures: Failure[] = [];

// CI runners cold-start Chrome slowly and a host launch gate can queue it for
// minutes; launchChrome waits for that (CHROME_START_TIMEOUT_MS).
const chrome = await launchChrome();
try {
  for (const surface of [...Object.keys(routes), ...SCRIPTLESS_SURFACES]) {
    for (const zoom of [1, 2]) {
      const { cdp, close } = await chrome.newTab();
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Emulation.setScriptExecutionDisabled', { value: SCRIPTLESS_SURFACES.has(surface) });
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 320, height: 700, deviceScaleFactor: zoom, mobile: true,
      });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${surface}` });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const evaluate = (expression: string): Promise<any> => evaluateIn(cdp, expression);

      const scrollWidth = await evaluate('document.documentElement.scrollWidth');
      if (scrollWidth > 320) {
        failures.push({ surface, check: `reflow at ${zoom}x`, detail: `scrollWidth ${scrollWidth}px exceeds the 320px viewport` });
      }

      if (zoom === 1) {
        const interactives: string[] = await evaluate(
          `[...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')]` +
          `.filter((el) => el.checkVisibility())` +
          // Tab reaches one radio per group (the checked one); arrows move within it.
          `.filter((el) => el.type !== 'radio' || el.checked || !document.querySelector('input[type=radio][name="' + el.name + '"]:checked'))` +
          `.map((el) => el.tagName + '#' + (el.id || ''))`,
        );
        const reached = new Set<string>();
        for (let tab = 0; tab < interactives.length + 5; tab++) {
          for (const type of ['keyDown', 'keyUp'] as const) {
            await cdp.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
          }
          const focus = await evaluate(
            `(() => { const el = document.activeElement;` +
            ` if (!el || el === document.body || el === document.documentElement) return null;` +
            ` return { name: el.tagName + '#' + (el.id || ''),` +
            ` outline: getComputedStyle(el).outlineWidth }; })()`,
          );
          if (focus === null) break;
          reached.add(focus.name);
          if (focus.outline === '0px') {
            failures.push({ surface, check: 'focus visible', detail: `${focus.name} has no focus outline` });
          }
        }
        for (const expected of interactives) {
          if (!reached.has(expected)) {
            failures.push({ surface, check: 'keyboard operable', detail: `Tab never reached ${expected}` });
          }
        }
      }

      if (shotsDir !== null && zoom === 1) {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const name = surface.replaceAll(/[/?=]/gu, '') || 'landing';
        await Bun.write(join(shotsDir, `${name}-320.png`), Buffer.from(shot.data, 'base64'));
      }
      await close();
    }
    console.log(`checked ${surface}`);
  }
} finally {
  await chrome.stop();
  server.stop(true);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} reflow/keyboard failure(s):`);
  for (const failure of failures) {
    console.error(`  [${failure.surface}] ${failure.check}: ${failure.detail}`);
  }
  process.exit(1);
}
console.log('\nreflow and keyboard checks passed on all surfaces');
