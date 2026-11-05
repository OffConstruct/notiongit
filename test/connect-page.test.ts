/**
 * The "before you start" screen between the landing page and GitHub. The
 * route (`GET /connect`) is wired in src/index.ts by the dashboard package
 * (D14); these tests cover the document and the response builder.
 */
import { describe, expect, test } from 'bun:test';
import { JSDOM, VirtualConsole } from 'jsdom';

import { connectPage, connectPageResponse, GITHUB_INSTALL_SCOPE, GITHUB_SIGNUP_URL, NOTION_TEMPLATE_CHOICE } from '../src/connect-page';
import { appearanceFor, findTheme, parseAppearanceParams } from '../src/theme-catalog';

const silentConsole = new VirtualConsole();

function dom(html: string): JSDOM {
  return new JSDOM(html, { url: 'https://inkdrafts.test/connect', virtualConsole: silentConsole });
}

async function respond(query: string): Promise<{ response: Response; text: string }> {
  const response = connectPageResponse(new Request(`https://inkdrafts.test/connect${query}`));
  return { response, text: await response.text() };
}

describe('connect page', () => {
  test('explains GitHub, what its install screen shows, and what Notion asks, in one page', () => {
    const issue = findTheme('issue')!;
    const html = connectPage(appearanceFor(issue, { mode: 'dark' }));
    expect(html).toContain('<title>Before you start | InkDrafts</title>');
    expect(html).toContain('Step 2 of 3');
    expect(html).toContain('<h1>Next, GitHub creates your website</h1>');
    expect(html).toContain('GitHub is the free service that will hold and show your site.');
    expect(html).toContain(`Leave <strong>${GITHUB_INSTALL_SCOPE}</strong> selected.`);
    expect(html).toContain('Click the green <span class="green">Install</span> button.');
    expect(html).toContain(`“${NOTION_TEMPLATE_CHOICE}”`);
    expect(html).toContain('Your site will start with <strong>Issue, dark</strong>.');
    expect(html).toContain('Already started? <a href="/status">Continue where you left off</a>');
    expect(html).toContain('href="/privacy"');
    for (const word of ['repository', 'OAuth', 'Jekyll']) expect(html.replace(/<style>[\s\S]*?<\/style>/gu, '')).not.toContain(word);
    // The header's own start button would compete with Continue here.
    expect(html).not.toContain('class="cta start"');
  });

  test('the account signup opens in a new tab, with that said, so the chosen look survives the detour', () => {
    const { document } = dom(connectPage(null)).window;
    const link = document.querySelector(`a[href="${GITHUB_SIGNUP_URL}"]`) as HTMLAnchorElement;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
    expect(link.textContent).toContain('(opens in a new tab)');
    expect(link.closest('.card')!.textContent).toContain('username.github.io');
  });

  test('Continue is a plain GET form into /connect/github that carries theme and t_* without JavaScript', () => {
    const verso = findTheme('verso')!;
    const appearance = appearanceFor(verso, { mode: 'dark', webfonts: false });
    const { document, FormData } = dom(connectPage(appearance)).window;
    const form = document.querySelector('form.go') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/connect/github');
    expect(form.querySelector('button[type=submit]')!.textContent).toBe('Continue to GitHub');
    const params = new URLSearchParams([...new FormData(form).entries()].map(([key, value]) => [key, String(value)]));
    expect(parseAppearanceParams(params)).toEqual({ kind: 'ok', appearance });
    // "Pick another look" goes back to the studio with the same choice.
    expect(document.querySelector('.chosen a')!.getAttribute('href')).toBe('/?theme=verso&t_mode=dark&t_webfonts=false#start');
    expect(document.querySelector('.chosen img')!.getAttribute('src')).toBe(verso.thumbnail);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  test('without a chosen look it still continues, and says so', () => {
    const { document, FormData } = dom(connectPage(null)).window;
    const form = document.querySelector('form.go') as HTMLFormElement;
    expect([...new FormData(form).keys()]).toEqual([]);
    expect(form.textContent).toContain('You have not picked a look yet');
    expect(document.querySelector('.chosen a')!.getAttribute('href')).toBe('/#start');
  });

  test('the response builder parses the query like /connect/github and drops bad values', async () => {
    const good = await respond('?theme=issue&t_mode=dark&t_accent=%3Cscript%3E');
    expect(good.response.status).toBe(200);
    expect(good.response.headers.get('content-security-policy')).toContain("form-action 'self' https://github.com");
    expect(good.response.headers.get('content-security-policy')).toContain("script-src 'none'");
    expect(good.text).toContain('<input type="hidden" name="theme" value="issue">');
    expect(good.text).toContain('<input type="hidden" name="t_mode" value="dark">');
    expect(good.text).not.toContain('<script>');
    expect(good.text).not.toContain('name="t_accent"');

    const unknown = await respond('?theme=nope&t_mode=dark');
    expect(unknown.response.status).toBe(200);
    expect(unknown.text).toContain('You have not picked a look yet');
    expect(unknown.text).not.toContain('name="t_mode"');
  });
});
