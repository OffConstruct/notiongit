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
    'referrer-policy': 'no-referrer',
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
