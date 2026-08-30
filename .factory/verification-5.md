# Independent product verification 5 — FAIL

**Date:** 2026-08-30
**Work order:** `coop-boss-access-verify-5`
**Candidate:** `58e1428f808a36f5c685e6036ebee44e9945d9b6`
**Production URL:** <https://coop-boss-access.sociobot.in>

## Verdict

**FAIL — do not accept this candidate.** This is not a deployment-only
failure: the requested candidate is live, byte-matched to this checkout, and
its one-replica deployment is healthy. It nevertheless misses two mandatory
factory release gates: there is no claims contract/test suite and there is no
one-click, isolated sample-data demo.

## First-read result

Opened the production landing page in a fresh browser context. It presents an
accessible shared-screen dragon boss game for friends whose phones build team
shields and boosts. The apparent first action is **Host a game**. The role
cues are explained in plain language and the intended audience is reasonably
clear from the lede.

It does **not** offer the mandatory visible **“Try it with sample data”**
action. `/demo` and `/?demo=1` both render the ordinary landing page, with no
sample game, demo banner, reset/start-for-real controls, or demo storage
isolation. There is also no `.factory/demo.md`.

## Release-blocking defects

### P0 — `.factory/claims.json` is missing

The clean candidate has no `.factory/claims.json`, so there were no declared
claim commands to run before any other QA. Per the claims contract, a missing
file is itself release-blocking. This also leaves user-facing claims such as
“No account”, “Local room code”, the privacy policy's data-handling promises,
and README performance/accessibility statements without the required
observable demo-entry-point claim tests.

**Required fix:** add `.factory/claims.json`; list every visitor-reliant claim;
provide exactly one `@claim:<id>` test for each; and make every listed command
pass from the documented demo entry point.

### P0 — No one-click sample-data sandbox

The brief requires a frictionless playable prototype, and the demo-sandbox
contract requires a first-screen sample-data action and isolated demo state.
Fresh production checks found zero controls matching “sample”; `/demo` and
`/?demo=1` returned the normal `Two roles. One dragon.` home screen; neither
contained “Demo”, “nothing is saved”, “Reset demo”, or “Start for real”.

**Required fix:** add a first-screen **Try it with sample data** action that
opens a deterministic, realistic playable room in a separate demo namespace;
show a persistent demo banner with Reset demo and Start for real; document it
in `.factory/demo.md`; then cover it and its privacy boundary in claims tests.

### P1 — Landing page omits the required three operational facts

The first screen lists “Clear role shapes”, “No account”, and “Local room
code”, rather than the required short privacy, offline, and price facts. This
does not change the P0 verdict but leaves the cold-start information contract
incomplete.

## Candidate and deployment identity

- Checkout was clean at the requested `58e1428f808a36f5c685e6036ebee44e9945d9b6`.
- Live `GET /health` returned HTTP 200 and
  `{"build":"58e1428f808a36f5c685e6036ebee44e9945d9b6","status":"ok"}`.
- `scripts/verify-container-release.sh 58e1428f808a36f5c685e6036ebee44e9945d9b6`
  passed: the public revision is healthy on exactly one replica.
- SHA-256 values of the local production build and live JS, CSS, and service
  worker matched exactly: `index-Bs4QmlKW.js`, `index-C0WFbNq4.css`, and
  `sw.js`.

## Local quality gates

- `npm ci`: passed; 187 packages installed, 0 vulnerabilities reported.
- `npm test`: passed — release contract, 7/7 Vitest tests, 6/6 Rust tests,
  and the PORT-only runtime contract.
- `npm run check`: passed — 0 Svelte diagnostics and strict Clippy with
  warnings denied.
- `npm run build`: passed and produced `dist/`.
- `BUILD_SHA=58e1428f808a36f5c685e6036ebee44e9945d9b6 cargo build --release --locked`:
  passed. The release executable served `/health` with that exact SHA.
- The optimized local release server passed normal WARD + SURGE creation,
  start, build, and share; 20/20 independent desktop-host/390px-phone joins;
  PWA update/offline reload; eight-state axe; browser quality; and rate-limit
  regression checks.

## Live product, accessibility, privacy, and resilience evidence

- The live normal WebSocket E2E flow passed (host + WARD + SURGE; both powers
  shared). Twenty isolated desktop-host/390px-phone joins passed.
- Live axe found 0 serious/critical findings in home, host, join, privacy,
  terms, high-contrast host, reduced-motion host, and connected-controller
  states. At 390px there was no horizontal overflow; desktop and mobile visual
  inspection found readable, unclipped controls.
- Keyboard-only browser QA passed: first Tab lands on Skip to game with a
  3px solid `rgb(255, 210, 63)` focus ring; Enter moves focus to `main`.
  Reduced-motion QA passed.
- A fresh request log contained only same-origin requests: document, local
  assets/fonts/art, and the disclosed same-origin `POST /api/pageview`; no
  third-party scripts, fonts, analytics SDKs, or cookies were observed.
- Live document responses include CSP, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and HSTS. Documents
  use `no-cache`; hashed JS/CSS use immutable one-year caching.
- Bundle budgets pass: JS 85.65 kB (32.70 kB gzip), CSS 20.06 kB (5.41 kB
  gzip), fonts 57.7 kB total, hero WebP 86.1 kB.
- Rate limit: a 25-request page-view burst admitted 20 requests (204) and
  rejected 5 with 429 and `Retry-After: 0`; the live WebSocket load test
  admitted 120 upgrades and rejected 20. This verifies the observed public
  allowance and rejection behavior.
- PWA smoke passed on production: precache/update behavior and a 390px offline
  reload both worked after the first visit.

## Scope note

The original job is otherwise materially implemented: local code rooms,
two-button Ward/Surge cooperation, redundant role cues, optional ground
markers, high contrast, and reduced motion. The automated checks cannot prove
the brief's mixed-ability playtest outcome; that remains a human study after
the P0 demo and claim gates are repaired.
