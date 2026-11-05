/**
 * `GET|POST /status/appearance`: change an existing site's theme and tweaks.
 *
 * Ownership is the status surface's: a signed `__Host-status-session` cookie
 * that GitHub OAuth proved within the last 8 hours, re-checked against the
 * installation on every request (`discoverSiteRepository`). The write uses
 * the App installation's existing Contents: write permission and can change
 * only the `inkdrafts:` block of `_config.yml` (`patchSiteConfig` with an
 * appearance and no destination). Values are allowlisted here against the
 * catalog and the repository's own theme manifests, and again by the
 * template's Liquid. The POST copies the `/status/rerun` gates: Origin,
 * session, a form token bound to the session, the IP-burst window and the
 * operator control (`status_appearance` admission stage) before any GitHub
 * call, then the per-account window and the global budget before the write.
 */

import { appearancePage, type AppearanceError, type AppearancePageModel, type AppearanceSite } from './appearance-page';
import { foldFontChoice } from './appearance-fonts';
import { GithubConfigError, listRepositoryThemes, patchAppearanceBlock, patchSiteConfig, readNotionPage, readRepositoryConfig } from './repository-config';
import { forgetSiteFacts } from './status-cache';
import { isSameOriginPost, pageHeaders } from './http-headers';
import {
  admitProvisioningRequest,
  admitProvisioningStage,
  consumeGlobalMutationBudget,
  provisioningAdmissionConfig,
  provisioningThrottleConfig,
  withKeyLock,
} from './provisioning-throttle';
import { repositoryDestination } from './repository-naming';
import { payloadExpired, signSignedPayload, verifySignedPayload } from './signed-payload';
import {
  canonicalAppearanceQuery,
  discoverSiteRepository,
  projectSiteStatus,
  readStatusSession,
  type StatusEnv,
  type StatusSession,
} from './status';
import { statusPage, statusRefusalPage } from './status-page';
import {
  appearanceFor,
  carryTweaks,
  customColorVerdict,
  CUSTOM_COLOR_CHOICE,
  modeOf,
  parseAppearanceParams,
  readAppearanceBlock,
  resolveStoredAppearance,
  THEMES,
  tweakQuery,
  type CatalogTheme,
  type ContrastGround,
  type SiteAppearance,
} from './theme-catalog';

export const APPEARANCE_SAVES_PER_WINDOW = 10;
export const APPEARANCE_WINDOW_SECONDS = 60 * 60;
export const APPEARANCE_RATE_KEY_PREFIX = 'status:appearance-rate:';
const APPEARANCE_FORM_KIND = 'appearance-form';

export function appearanceRateKey(accountId: number): string {
  return `${APPEARANCE_RATE_KEY_PREFIX}${accountId}`;
}

/** Same construction as the rerun token, with its own kind, so neither
 * form's token verifies for the other. */
export function signAppearanceToken(session: StatusSession, secret: string): Promise<string> {
  return signSignedPayload({ v: 1, k: APPEARANCE_FORM_KIND, accountId: session.accountId, exp: session.exp }, secret);
}

export async function appearanceTokenValid(
  token: string,
  session: StatusSession,
  secret: string,
  nowSeconds: number,
): Promise<boolean> {
  const payload = await verifySignedPayload<{ accountId: number; exp: number }>(token, secret, (candidate) =>
    candidate.k === APPEARANCE_FORM_KIND &&
    candidate.v === 1 &&
    candidate.accountId === session.accountId &&
    candidate.exp === session.exp);
  return payload !== null && !payloadExpired(payload.exp, nowSeconds);
}

interface AppearanceWindow {
  version: 1;
  windowStartedAt: number;
  count: number;
}

export type AppearanceSaveAdmission =
  | { admitted: true }
  | { admitted: false; reason: 'window_cap' | 'unavailable'; retryAfterSeconds: number };

/** Consume one save in the account's hourly window, before the write, so a
 * crash overcounts. An unreadable record fails closed. */
export async function admitAppearanceSave(kv: KVNamespace, accountId: number, nowMs: number): Promise<AppearanceSaveAdmission> {
  const key = appearanceRateKey(accountId);
  return withKeyLock(key, async (): Promise<AppearanceSaveAdmission> => {
    let stored: unknown;
    try {
      stored = await kv.get(key, 'json');
    } catch {
      return { admitted: false, reason: 'unavailable', retryAfterSeconds: 60 };
    }
    const valid = stored !== null && typeof stored === 'object' &&
      (stored as AppearanceWindow).version === 1 &&
      Number.isSafeInteger((stored as AppearanceWindow).windowStartedAt) &&
      Number.isSafeInteger((stored as AppearanceWindow).count);
    if (stored !== null && !valid) return { admitted: false, reason: 'unavailable', retryAfterSeconds: 60 };
    const windowMs = APPEARANCE_WINDOW_SECONDS * 1000;
    const current = valid && (stored as AppearanceWindow).windowStartedAt + windowMs > nowMs
      ? stored as AppearanceWindow
      : { version: 1 as const, windowStartedAt: nowMs, count: 0 };
    const endsAt = current.windowStartedAt + windowMs;
    if (current.count >= APPEARANCE_SAVES_PER_WINDOW) {
      return { admitted: false, reason: 'window_cap', retryAfterSeconds: Math.max(Math.ceil((endsAt - nowMs) / 1000), 1) };
    }
    await kv.put(key, JSON.stringify({ ...current, count: current.count + 1 }), {
      expirationTtl: Math.max(Math.ceil((endsAt - nowMs) / 1000), 60),
    });
    return { admitted: true };
  });
}

function html(document: string, status = 200, retryAfterSeconds: number | null = null): Response {
  // same-origin: the Save form then carries a real Origin (see isSameOriginPost).
  const headers = pageHeaders({ frames: true, scripts: true, referrer: 'same-origin' });
  if (retryAfterSeconds !== null) headers.set('retry-after', String(retryAfterSeconds));
  return new Response(document, { status, headers });
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location, 'cache-control': 'no-store' } });
}

function configMissing(): Response {
  return new Response(JSON.stringify({ error: 'github_configuration_missing' }), {
    status: 500,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function refusal(title: string, body: string, status: number, retryAfterSeconds: number | null): Response {
  return html(statusRefusalPage({ title, body, retryAfterSeconds }), status, retryAfterSeconds);
}

/** Operator pause or kill is 503 (do not retry into an emergency stop); a
 * burst is 429. */
function throttleRefusal(reason: string, retryAfterSeconds: number | null): Response {
  return reason === 'request_burst'
    ? refusal('Too many requests', 'A burst of requests just came through, so this one was held back. Wait a moment and try again.', 429, retryAfterSeconds)
    : refusal('Appearance changes are paused', 'InkDrafts has paused changes to sites right now. Your site keeps its current look; try again later.', 503, retryAfterSeconds);
}

function githubUnavailable(retryAfterSeconds: number | null): Response {
  return html(statusPage({ kind: 'github_unavailable', retryAfterSeconds }, { notice: null, rerunFormToken: null }), 502, retryAfterSeconds);
}

/** Everything one render or save needs from GitHub, read once. */
type LoadedSite =
  | {
      ok: true;
      site: AppearanceSite;
      fullName: string;
      repositoryId: number;
      installationToken: string;
      config: string;
      /** null: the repository predates themes (or has none this catalog knows). */
      themes: { offered: readonly CatalogTheme[]; current: SiteAppearance } | null;
    }
  | { ok: false; response: Response };

async function loadSite(env: Pick<StatusEnv, 'GITHUB_APP_ID' | 'GITHUB_APP_PRIVATE_KEY'>, session: StatusSession): Promise<LoadedSite> {
  const found = await discoverSiteRepository({ GITHUB_APP_ID: env.GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY: env.GITHUB_APP_PRIVATE_KEY }, session);
  if (!found.ok) {
    const view = projectSiteStatus(found, session, Date.now());
    return { ok: false, response: html(statusPage(view, { notice: null, rerunFormToken: null }), view.kind === 'github_unavailable' ? 502 : 200) };
  }
  const token = found.installationToken.raw;
  let config: string;
  let repoThemes: string[] | null;
  try {
    [config, repoThemes] = await Promise.all([
      readRepositoryConfig(token, found.repository.fullName),
      listRepositoryThemes(token, found.repository.fullName),
    ]);
  } catch (error) {
    return { ok: false, response: githubUnavailable(error instanceof GithubConfigError ? error.retryAfterSeconds : null) };
  }
  const offered = repoThemes === null ? [] : THEMES.filter((theme) => repoThemes.includes(theme.id));
  // What the site renders today; null when no manifest this catalog knows is
  // present, which is as good as no themes directory.
  const current = resolveStoredAppearance(readAppearanceBlock(config), offered);
  let siteUrl = found.repository.htmlUrl;
  try {
    siteUrl = repositoryDestination(found.accountLogin, found.repository.name).url;
  } catch {
    // GitHub-shaped names always map; the repository link is the fallback.
  }
  return {
    ok: true,
    site: {
      login: found.accountLogin,
      repositoryName: found.repository.name,
      repositoryUrl: found.repository.htmlUrl,
      defaultBranch: found.repository.defaultBranch || 'main',
      siteUrl,
    },
    fullName: found.repository.fullName,
    repositoryId: found.repository.id,
    installationToken: token,
    config,
    themes: current === null ? null : { offered, current },
  };
}

function hasTweakParams(params: URLSearchParams): boolean {
  return [...params.keys()].some((name) => name.startsWith('t_') || name.startsWith('c_'));
}

type Selection = { ok: true; appearance: SiteAppearance } | { ok: false; error: AppearanceError };

function selectAppearance(form: URLSearchParams, offered: readonly CatalogTheme[], current: SiteAppearance): Selection {
  const params = foldFontChoice(form, current);
  const requested = params.get('theme');
  if (requested === null || requested === '') return { ok: true, appearance: current };
  const theme = offered.find((candidate) => candidate.id === requested);
  if (!theme) return { ok: false, error: 'theme_not_offered' };
  if (!hasTweakParams(params)) return { ok: true, appearance: carryTweaks(current, theme) };
  const parsed = parseAppearanceParams(params);
  if (parsed.kind !== 'ok') return { ok: false, error: 'invalid_request' };
  return { ok: true, appearance: parsed.appearance };
}

/** The ground on which a well-formed custom hex misses the contrast floor,
 * for the chosen color scheme; the parser drops such a hex silently, but a
 * save must say why nothing changed. */
function rejectedCustomGround(theme: CatalogTheme, params: URLSearchParams): ContrastGround | null {
  const raw = Object.fromEntries([...params].filter(([name]) => name.startsWith('t_')).map(([name, value]) => [name.slice(2), value]));
  const mode = modeOf(theme, raw);
  for (const tweak of theme.tweaks) {
    if (tweak.type !== 'color' || !tweak.custom || tweak.role === 'surface') continue;
    let value = params.getAll(`t_${tweak.key}`).at(-1) ?? '';
    if (value === CUSTOM_COLOR_CHOICE) value = params.getAll(`c_${tweak.key}`).at(-1) ?? '';
    if (!/^#[0-9a-fA-F]{6}$/u.test(value)) continue;
    const verdict = customColorVerdict(theme, tweak, value.toLowerCase(), mode);
    if (!verdict.ok) return verdict.ground;
  }
  return null;
}

function editor(
  loaded: Extract<LoadedSite, { ok: true }>,
  offered: readonly CatalogTheme[],
  fields: { current: SiteAppearance; selected: SiteAppearance; formToken: string; notice?: 'saved' | 'unchanged' | null; error?: AppearanceError | null },
): AppearancePageModel {
  return {
    kind: 'editor',
    site: loaded.site,
    notionPage: readNotionPage(loaded.config),
    offered,
    current: fields.current,
    selected: fields.selected,
    notice: fields.notice ?? null,
    error: fields.error ?? null,
    formToken: fields.formToken,
  };
}

/** `GET /status/appearance[?theme=<id>&t_*][&saved=1|unchanged]`. */
export async function appearanceHome(request: Request, env: Partial<StatusEnv>): Promise<Response> {
  const { GITHUB_CLIENT_SECRET, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY } = env;
  if (!GITHUB_CLIENT_SECRET || !GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) return configMissing();
  const url = new URL(request.url);
  const session = await readStatusSession(request, GITHUB_CLIENT_SECRET);
  if (!session) return redirect(new URL('/status?connect=1&next=appearance', request.url).toString());

  const loaded = await loadSite({ GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY }, session);
  if (!loaded.ok) return loaded.response;
  if (loaded.themes === null) return html(appearancePage({ kind: 'predates_themes', site: loaded.site }));

  const { offered, current } = loaded.themes;
  const selection = selectAppearance(url.searchParams, offered, current);
  if (selection.ok && url.searchParams.get('theme')) {
    // Any other spelling of the same choice (the no-JS Preview button repeats
    // every default) redirects to the canonical query.
    const query = tweakQuery(selection.appearance);
    const canonical = `theme=${selection.appearance.themeId}${query ? `&${query}` : ''}`;
    if (url.search.slice(1) !== canonical) return redirect(new URL(`/status/appearance?${canonical}`, request.url).toString());
  }
  const saved = url.searchParams.get('saved');
  return html(appearancePage(editor(loaded, offered, {
    current,
    selected: selection.ok ? selection.appearance : current,
    formToken: await signAppearanceToken(session, GITHUB_CLIENT_SECRET),
    notice: saved === '1' ? 'saved' : saved === 'unchanged' ? 'unchanged' : null,
    error: selection.ok ? null : selection.error,
  })), selection.ok ? 200 : 400);
}

/** `POST /status/appearance`: theme, t_* and c_* fields plus the form token. */
export async function appearanceSave(request: Request, env: Partial<StatusEnv>): Promise<Response> {
  if (!isSameOriginPost(request)) {
    return html(statusPage({ kind: 'auth_failed', reason: 'state_invalid' }, { notice: null, rerunFormToken: null }), 403);
  }
  const { JOBS, GITHUB_CLIENT_SECRET, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY } = env;
  if (!JOBS || !GITHUB_CLIENT_SECRET || !GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) return configMissing();

  const form = await request.formData().catch(() => null);
  const session = await readStatusSession(request, GITHUB_CLIENT_SECRET);
  if (!session) {
    // The session ran out while the owner was choosing: sign in again and
    // come back to the same choice (carried in the signed sign-in state).
    const chosen = new URLSearchParams();
    for (const [name, value] of form ?? []) if (name !== 'token' && typeof value === 'string') chosen.append(name, value);
    const back = canonicalAppearanceQuery(chosen);
    const next = new URL('/status?connect=1&next=appearance', request.url);
    if (back) next.searchParams.set('back', back);
    return redirect(next.toString());
  }

  const token = form?.get('token');
  if (
    !form ||
    typeof token !== 'string' ||
    !(await appearanceTokenValid(token, session, GITHUB_CLIENT_SECRET, Math.floor(Date.now() / 1000)))
  ) {
    return html(statusPage({ kind: 'auth_failed', reason: 'state_invalid' }, { notice: null, rerunFormToken: null }), 403);
  }
  const params = new URLSearchParams();
  for (const [name, value] of form) if (name !== 'token' && typeof value === 'string') params.append(name, value);

  const admissionConfig = provisioningAdmissionConfig(env);
  // As on /status/rerun: no durable job id exists here, only a per-request label.
  const requestLabel = crypto.randomUUID();
  const burst = await admitProvisioningRequest(env as StatusEnv, admissionConfig, {
    request,
    jobId: requestLabel,
    hmacSecret: GITHUB_CLIENT_SECRET,
  }, Date.now(), 'status_appearance');
  if (burst.action !== 'allow') return throttleRefusal(burst.reason, burst.retryAfterSeconds);
  const stage = await admitProvisioningStage(env as StatusEnv, admissionConfig, {
    stage: 'status_appearance',
    jobId: requestLabel,
    accountId: session.accountId,
  }, Date.now());
  if (stage.action !== 'allow') return throttleRefusal(stage.reason, stage.retryAfterSeconds);

  const loaded = await loadSite({ GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY }, session);
  if (!loaded.ok) return loaded.response;
  if (loaded.themes === null) return html(appearancePage({ kind: 'predates_themes', site: loaded.site }), 400);

  const { offered, current } = loaded.themes;
  const formToken = token;
  const rejected = (error: AppearanceError, selected = current) =>
    html(appearancePage(editor(loaded, offered, { current, selected, formToken, error })), 400);

  if (!params.get('theme')) return rejected('invalid_request');
  const selection = selectAppearance(params, offered, current);
  if (!selection.ok) return rejected(selection.error);
  const appearance = selection.appearance;
  const theme = offered.find((candidate) => candidate.id === appearance.themeId)!;
  const ground = rejectedCustomGround(theme, params);
  if (ground !== null) return rejected(ground === 'light' ? 'contrast_light' : 'contrast_dark', appearance);

  let unchanged: boolean;
  try {
    unchanged = !patchAppearanceBlock(loaded.config, appearance).changed;
  } catch {
    return refusal('Your settings file needs a hand edit', 'Your _config.yml has more than one inkdrafts: block, so InkDrafts left it alone. Remove one of them on GitHub, then try again.', 422, null);
  }
  if (unchanged) return redirect(new URL('/status/appearance?saved=unchanged', request.url).toString());

  const window = await admitAppearanceSave(JOBS, session.accountId, Date.now());
  if (!window.admitted) {
    return window.reason === 'window_cap'
      ? refusal('That is a lot of changes', 'You have saved your appearance many times in the last hour. Try again later; your site keeps its last saved look.', 429, window.retryAfterSeconds)
      : refusal('We could not check your save limit', 'InkDrafts could not read this site’s save quota just now, so it held off. Try again in a minute.', 503, window.retryAfterSeconds);
  }
  const budget = await consumeGlobalMutationBudget(JOBS, provisioningThrottleConfig(env), Date.now(), Math.random);
  if (!budget.admitted) {
    return refusal('InkDrafts is busy', 'Many changes are going to GitHub right now. Try again in a moment.', 429, budget.delaySeconds);
  }

  try {
    const result = await patchSiteConfig(loaded.installationToken, loaded.fullName, { appearance });
    await forgetSiteFacts(JOBS, loaded.repositoryId);
    return redirect(new URL(`/status/appearance?saved=${result.changed ? '1' : 'unchanged'}`, request.url).toString());
  } catch (error) {
    if (!(error instanceof GithubConfigError)) return githubUnavailable(null);
    switch (error.code) {
      case 'github_config_conflict':
        return refusal('Your settings changed at the same moment', 'Your site’s _config.yml was updated while we saved. Go back and save again.', 409, null);
      case 'github_config_rate_limited':
        return refusal('GitHub asked us to slow down', 'GitHub is limiting requests right now. Your change was not saved; try again shortly.', 429, error.retryAfterSeconds);
      case 'github_config_invalid':
        return refusal('Your settings file needs a hand edit', 'Your _config.yml could not be read safely, so InkDrafts left it alone. Use "Edit by hand" on the previous page instead.', 422, null);
      case 'github_config_unavailable':
        return githubUnavailable(null);
    }
  }
}
