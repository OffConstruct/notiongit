# Accessibility

How the onboarding surfaces hold the accessibility bar, what is enforced
automatically, and what a human still has to check by hand. The product
promise is for non-developers, so keyboard, screen-reader, motion, contrast,
and small-screen failures are treated as product blockers (issue #24).

## Surfaces

| Route | Module | States |
| --- | --- | --- |
| `GET /` | `src/landing-page.ts` | the static document, the same with `landing.js` showing each theme's options, and with scripts off |
| `GET /themes`, `GET /themes/<id>` | `src/themes-page.ts` | gallery (all, one category), detail (defaults, custom tweaks) |
| `GET /status/appearance` | `src/appearance-page.ts` | editor (current, switching, saved, error), site that predates themes |
| `GET /progress` | `src/progress-page.ts` | `awaiting_notion`, `active` (with and without notice), `succeeded` (links, checked, not-up-yet, links-missing), `failed` (restart and support recovery), `missing` |
| `GET /status` | `src/status-page.ts` | `entry`, `session` (sync and publish outcome combinations, notices, rerun form), `no_site`, `installation_gone`, `installation_suspended`, `github_unavailable`, `auth_failed` (three reasons) |
| throttle refusals | `statusRefusalPage` | with and without a retry hint |
| consent-handoff failures | `src/error-page.ts` | every failure code in the registry |

Each document has one inline stylesheet and loads nothing from other
origins. The progress page has one inline script; the landing page, the theme
detail page and the appearance editor each load one same-origin deferred
script that only enhances a form that already works without it. Theme
previews inside their iframes load their own web fonts. Pages that need no
JavaScript degrade to a manual refresh link instead of a forced reload. Every
animation sits inside `prefers-reduced-motion: no-preference`.

## Automated gates

Both gates run in CI (`.github/workflows/ci.yml`) and fail the build.

`bun run test:a11y` scans every representative document state above
(including the landing page after `landing.js` renders each theme's options)
with axe-core in jsdom and asserts zero serious or critical violations. Its first test plants
violations in a canary document and asserts they are reported, so the gate
cannot pass vacuously. Checks that need a real layout engine (color contrast,
target size) resolve as *incomplete* under jsdom rather than as violations;
they are covered below.

`bun run test:reflow` serves every surface locally, drives headless Chrome
over the DevTools protocol, and asserts for each surface:

- no horizontal overflow at a 320 CSS px viewport and at 2x scale (the
  200%-zoom reflow equivalence of WCAG 1.4.10),
- a Tab walk that reaches every visible interactive element,
- a visible focus outline (`:focus-visible` sets a 3px outline) on each
  focused element.

The landing page runs there with its real script, font and thumbnails, and
once more with scripts disabled.

`--shots DIR` saves a 320px screenshot per surface as evidence. The gate
needs `google-chrome-stable`, which GitHub's `ubuntu-latest` runners ship.

## Manual matrix

Run each pass against a deployed preview or `bun run dev`. The matrix is the
release checklist; the automated gates cover the reflow and keyboard rows
mechanically.

| Check | How | Surfaces |
| --- | --- | --- |
| Keyboard-only run | Unplug the mouse. Tab through every surface; the skip link must appear first on Enter; every action must be reachable and operable; focus must stay put across progress-page polls. | all |
| Screen reader | Run the keyboard pass under VoiceOver (macOS: Cmd-F5) and NVDA (Windows). The progress page must announce stage changes politely once each, the failure message on failure, and the one-shot site-check result after its link is activated; headings must outline the page. | all |
| Reflow and zoom | Automated (`test:reflow`); spot-check 200% browser zoom on top. | all |
| Reduced motion | Enable "reduce motion" in the OS; the checklist pulse animation, the landing hero fade-in and the card and button transitions must not run. | progress, landing |
| Contrast | Light and dark schemes both use the token table below; spot-check with the OS in each mode. | all |
| No JS | Disable JavaScript; the progress page must still show the current stage with a refresh link, and the status page must work in full (it has no script at all). On the landing page the category filter must still filter, and "Start with" must carry the picked theme and color scheme to `/connect/github`. | progress, status, landing |

Screen-reader passes need a human: no screen reader runs in CI. The
structural guarantees the pass leans on (landmarks, one `h1`, polite live
regions that skip unchanged text, labelled lists and sections, escaped
provider strings) are enforced by the tests and the page modules.

## Contrast tokens

Computed ratios against the backgrounds they appear on; all text clears
WCAG AA (4.5:1, or 3:1 for the large CTA text).

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
The palette is `SITE_PALETTE` in `src/site-styles.ts`, shared by every page.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--fg` on `--bg` | 16.0:1 | 15.1:1 | body text |
| `--muted` on `--bg` | 6.4:1 | 7.2:1 | secondary text |
| `--muted` on `--surface` | 5.9:1 | 6.6:1 | notices, cards |
| `--accent` on `--bg` | 9.1:1 | 10.0:1 | links |
| `--accent-fg` on `--accent` | 10.0:1 | 10.0:1 | buttons |
| `--ok` on `--bg` | 5.9:1 | 9.8:1 | success text |
| `--danger` on `--bg` | 6.1:1 | 8.4:1 | failure text |

## Known limitations

- Forced refresh is gone by design. The progress page's no-JS fallback and
  the status page's in-flight reload were `meta http-equiv="refresh"`, which
  axe flags critical (WCAG 2.2.1: a time limit with no way to decline). Both
  now render a manual refresh link; the JS progress page still polls itself
  with backoff and pauses when the tab is hidden.
- Touch targets on inline text links (nav links, "Check if it is up yet",
  "View the run on GitHub") meet WCAG 2.5.8's 24px minimum through line
  height but not the 44px AAA guidance. Buttons and CTAs are comfortably
  above 44px.
- The provider-owned consent screens (Notion, GitHub, the GitHub App
  install) are out of scope; their accessibility is the providers'.
- No screen reader runs in CI. The manual matrix documents the pass; run it
  before the M5 launch.
