/**
 * Response headers for the theme gallery and customize pages.
 *
 * These pages embed same-origin preview iframes, load same-origin scripts
 * (`/assets/customizer.js`, `/assets/landing.js`) and the same-origin font,
 * so they get a CSP that allows exactly that. `form-action` allows github.com because "Use this theme" is a GET
 * form to `/connect/github`, which redirects there, and Chrome enforces
 * `form-action` on redirects.
 */

export interface PageHeaderOptions {
  /** Same-origin preview iframes. */
  frames: boolean;
  /** Same-origin scripts (`/assets/*.js`). */
  scripts: boolean;
  /** `public, max-age=N` for pages with no per-viewer content; default no-store. */
  publicMaxAgeSeconds?: number;
  /** Pages with same-origin POST forms send `same-origin`, so the browser
   * sends a real Origin on submit; every other page sends no referrer. */
  referrer?: 'no-referrer' | 'same-origin';
}

export function contentSecurityPolicy(options: Pick<PageHeaderOptions, 'frames' | 'scripts'>): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `script-src ${options.scripts ? "'self'" : "'none'"}`,
    `frame-src ${options.frames ? "'self'" : "'none'"}`,
    "form-action 'self' https://github.com",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function pageHeaders(options: PageHeaderOptions): Headers {
  return new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': options.publicMaxAgeSeconds === undefined ? 'no-store' : `public, max-age=${options.publicMaxAgeSeconds}`,
    'referrer-policy': options.referrer ?? 'no-referrer',
    'content-security-policy': contentSecurityPolicy(options),
    'x-content-type-options': 'nosniff',
  });
}

/** For pages rendered inside a preview iframe (a preview link that is not
 * part of the exported set): framable by this origin only. */
export function previewFallbackHeaders(): Headers {
  return new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=300',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    'x-content-type-options': 'nosniff',
  });
}

/**
 * The cross-site check for the owner's POST forms (`/status/*`). A browser
 * sends `Origin: null` instead of the page origin when the page carried
 * `Referrer-Policy: no-referrer` or the request crossed a redirect, so a
 * literal "null" passes only when the browser itself vouches that the request
 * came from this origin (`Sec-Fetch-Site: same-origin`). No Origin at all is a
 * non-browser client and is left to the signed form token, which guards every
 * one of these forms either way.
 */
export function isSameOriginPost(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (origin === null) return true;
  if (origin === new URL(request.url).origin) return true;
  return origin === 'null' && request.headers.get('Sec-Fetch-Site') === 'same-origin';
}
