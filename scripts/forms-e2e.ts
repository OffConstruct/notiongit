/**
 * Clicks the owner's forms in headless Chrome against a running dev server
 * with the fake GitHub (see .zcode/skills/verify-notiongit): the status
 * page's Update now, Yes-remove-them, Try again and Connect Notion, and the
 * customize screen's Save. Unit tests send hand-made headers; this proves
 * what a real browser sends (Origin, Sec-Fetch-Site) gets through, and walks
 * the keep-it-up-to-date loop: status, update, running, up to date again.
 *
 * Every request to github.com or Notion is failed in the browser, so the
 * run never leaves the machine.
 *
 *   capped bun run scripts/forms-e2e.ts [base-url]   (default https://127.0.0.1:8790)
 */
import { evaluate, launchChrome, navigate, type Cdp } from './chrome-cdp';

const BASE = process.argv[2] ?? process.env.INKDRAFTS_BASE ?? 'https://127.0.0.1:8790';
const BLOCKED = ['*github.com*', '*notion.so*', '*notion.com*'];

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(label);
}

async function text(cdp: Cdp): Promise<string> {
  return evaluate(cdp, "document.querySelector('main')?.innerText ?? ''");
}

async function url(cdp: Cdp): Promise<string> {
  return evaluate(cdp, 'location.href');
}

/** Click the submit button whose text matches, and wait for the next page. */
async function submit(cdp: Cdp, label: string): Promise<boolean> {
  const loaded = new Promise<void>((resolve) => cdp.on('Page.loadEventFired', () => resolve()));
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button[type="submit"]')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (clicked) await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 15_000))]);
  return clicked;
}

async function signIn(cdp: Cdp, scenario: string, next = ''): Promise<void> {
  await navigate(cdp, `${BASE}/__dev/login?as=${scenario}${next ? `&next=${next}` : ''}`);
}

const chrome = await launchChrome();
const tab = await chrome.newTab();
const { cdp } = tab;
try {
  await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true });
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Fetch.enable', { patterns: BLOCKED.map((urlPattern) => ({ urlPattern })) });
  cdp.on('Fetch.requestPaused', (event) => {
    void cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
  });
  const posts: { url: string; origin: string | null; secFetchSite: string | null }[] = [];
  const statuses = new Map<string, number>();
  cdp.on('Network.requestWillBeSent', (event) => {
    if (event.request.method !== 'POST') return;
    const headers = event.request.headers as Record<string, string>;
    posts.push({ url: event.request.url, origin: headers.Origin ?? headers.origin ?? null, secFetchSite: headers['Sec-Fetch-Site'] ?? null });
  });
  cdp.on('Network.responseReceived', (event) => statuses.set(event.response.url, event.response.status));

  await navigate(cdp, `${BASE}/__dev/reset`);

  // The keep-it-up-to-date loop.
  await signIn(cdp, 'healthy');
  let page = await text(cdp);
  check('status leads with an up-to-date headline', page.includes('Your site is up to date'));
  check('status offers Write in Notion', page.includes('Write in Notion') && page.includes('To publish a new post'));
  check('Update now is a button', await submit(cdp, 'Update my site now'));
  const rerun = posts.find((post) => post.url.endsWith('/status/rerun'));
  check('the browser sent its origin with the form', rerun?.origin === new URL(BASE).origin || rerun?.origin === 'null', `Origin ${rerun?.origin}, Sec-Fetch-Site ${rerun?.secFetchSite}`);
  check('Update now is accepted, not refused', (await url(cdp)).includes('notice=sync_triggered'), await url(cdp));
  page = await text(cdp);
  check('the page says the site is updating', page.includes('Your site is updating') || page.includes('Updating your site now'));
  let upToDate = false;
  for (let attempt = 0; attempt < 14 && !upToDate; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await navigate(cdp, `${BASE}/status`);
    upToDate = (await text(cdp)).includes('Your site is up to date');
  }
  check('after the update the site reads as up to date again', upToDate);

  // Customize, then Save.
  await signIn(cdp, 'healthy', 'appearance');
  await evaluate(cdp, `(() => {
    const radio = [...document.querySelectorAll('input[type="radio"][name="t_mode"]')].find((input) => !input.checked);
    radio?.click();
  })()`);
  check('Save is a button after the options', await submit(cdp, 'Save and publish'));
  check('Save is accepted, not refused', (await url(cdp)).includes('saved='), await url(cdp));
  check('Save confirms in plain words', (await text(cdp)).includes('Saved. Your site updates with the new look') || (await text(cdp)).includes('Nothing changed'));

  // Each fix button.
  await signIn(cdp, 'bulk_delete');
  check('bulk delete names the posts', (await text(cdp)).includes('Your site would lose 3 posts'));
  check('Yes, remove them submits', await submit(cdp, 'Yes, remove them'));
  check('removal is confirmed', (await url(cdp)).includes('notice=delete_confirmed'), await url(cdp));

  await signIn(cdp, 'build_failed');
  check('a failed publish offers Try again', await submit(cdp, 'Try again'));
  check('the rebuild is confirmed', (await url(cdp)).includes('notice=rebuild_triggered'), await url(cdp));

  await signIn(cdp, 'not_connected');
  check('a site without Notion offers Connect Notion', await submit(cdp, 'Connect Notion'));
  check('Connect Notion lands on the setup page', (await url(cdp)).includes('/progress?job_id='), await url(cdp));
  check('the setup page explains the template choice', (await text(cdp)).includes('Use a template provided by the developer'));

  const refused = [...statuses].filter(([address, status]) => address.startsWith(BASE) && status === 403);
  check('no request was refused', refused.length === 0, refused.map(([address]) => address).join(', '));
} finally {
  await tab.close();
  await chrome.stop();
}

if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('all form checks passed');
