/**
 * Headless Chrome over the DevTools protocol for the reflow check, the theme
 * sync and the theme audit: zero dependencies, a private profile directory,
 * and the Chrome log kept in a file so a startup failure names its cause.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Cdp {
  send: (method: string, params?: Record<string, unknown>) => Promise<any>;
  on: (method: string, listener: (params: any) => void) => void;
  close: () => void;
}

export function connect(wsUrl: string): Promise<Cdp> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const listeners = new Map<string, ((params: any) => void)[]>();
    ws.onopen = () => resolve({
      send: (method, params = {}) => {
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
      },
      on: (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener]),
      close: () => ws.close(),
    });
    ws.onerror = () => reject(new Error('CDP WebSocket failed'));
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method) {
        for (const listener of listeners.get(message.method) ?? []) listener(message.params);
        return;
      }
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
    };
  });
}

export interface Chrome {
  /** Open a fresh tab and connect to it; close it with `closeTab`. */
  newTab: () => Promise<{ cdp: Cdp; close: () => Promise<void> }>;
  stop: () => Promise<void>;
}

/**
 * Chrome picks its own DevTools port (written to `DevToolsActivePort`), so
 * parallel runs never share or steal a browser. The start wait is long
 * (`CHROME_START_TIMEOUT_MS`, default 16 minutes) because a host launch gate
 * can queue Chrome for minutes; a gate that gives up exits, ending the wait.
 */
export async function launchChrome(): Promise<Chrome> {
  const profile = mkdtempSync(join(tmpdir(), 'notiongit-chrome-'));
  const log = join(profile, 'chrome.log');
  const data = join(profile, 'data');
  const child = Bun.spawn([
    'sh', '-c',
    `exec google-chrome-stable --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage` +
    ` --disable-extensions --no-first-run --hide-scrollbars --remote-debugging-port=0` +
    ` --user-data-dir=${data} --window-size=1280,800 about:blank` +
    ` >"${log}" 2>&1`,
  ], { stdout: 'ignore', stderr: 'ignore' });
  const deadline = Date.now() + Number(process.env.CHROME_START_TIMEOUT_MS ?? 960_000);
  let base = '';
  while (!base && child.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const port = Number(readFileSync(join(data, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      base = `http://127.0.0.1:${port}`;
    } catch {
      // Chrome queued or not accepting connections yet.
    }
  }
  if (!base) {
    const text = await Bun.file(log).text().catch(() => '(no Chrome log)');
    child.kill();
    rmSync(profile, { recursive: true, force: true });
    throw new Error(`Chrome did not start (exit code ${child.exitCode}). Chrome log:\n${text.slice(-2000)}`);
  }
  return {
    newTab: async () => {
      const target = await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json() as { id: string; webSocketDebuggerUrl: string };
      const cdp = await connect(target.webSocketDebuggerUrl);
      return {
        cdp,
        close: async () => {
          cdp.close();
          await fetch(`${base}/json/close/${target.id}`).catch(() => undefined);
        },
      };
    },
    // Chrome writes its cache on shutdown, so the profile goes only after it exits.
    stop: async () => {
      child.kill();
      await child.exited;
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

export async function evaluate(cdp: Cdp, expression: string): Promise<any> {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.text}`);
  return result.result.value;
}

/** Navigate and wait for the load event (bounded). */
export async function navigate(cdp: Cdp, url: string, timeoutMs = 15_000): Promise<void> {
  const loaded = new Promise<void>((resolve) => cdp.on('Page.loadEventFired', () => resolve()));
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
