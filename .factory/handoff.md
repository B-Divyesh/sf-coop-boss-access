# Co-op Boss Access — release repair handoff

Date: 2026-08-30

Work order: `coop-boss-access-repair-4`

Report commit: `0b4d3e6a4521f447e0abf1b4bf3ddf6ef2264b45`

Reported candidate: `9ca4c5f15b56b166af1bb2065c19e3757c65d842`

Verified repair commit: `7e1b1e2f2d76596b48eac85a30e68471e63b8b2e`

Production URL: <https://coop-boss-access.sociobot.in>

## Release status: repaired

The verifier's release blocker is fixed. Production revision
`sf-coop-boss-access--0000009` read back with `minReplicas=1`,
`maxReplicas=1`, one running replica, single-revision traffic, image
`sociobotregistry.azurecr.io/sf-coop-boss-access:7e1b1e2f2d76`, and exact
public health identity
`7e1b1e2f2d76596b48eac85a30e68471e63b8b2e`.

## Finding, reproduction, and root cause

Before the repair, a fresh Azure read showed the reported candidate on
revision 8 with `minReplicas=1`, `maxReplicas=3`, and no sticky sessions.
The new executable verifier rejected that live state with
`process-local rooms require maxReplicas=1` and exit status 1. It also rejects
the report fixture with three running replicas.

The repository release script had set one replica, but the work-order deployer
ran afterward. Its full Container App PUT hard-coded `maxReplicas: 3`, which
overwrote the product setting. This work order's real deploy path was changed
to consume the checked [container deployment contract](container-deploy.json),
and its deployment log confirmed `product scale contract: 1..1 replicas`.

## Changes

- Added `.factory/container-deploy.json` as the product-owned `1..1` topology
  contract for process-local rooms.
- Added `scripts/check-deployment-state.mjs` and
  `scripts/verify-container-release.sh`. They require the exact image and
  health SHA, successful/running single-revision state, `1..1` scale, and one
  running latest-revision replica.
- Strengthened `scripts/deploy-container.sh`: it waits for the complete live
  invariant, observes it three times, and requires 20 isolated browser joins.
- Added four exact regression cases: the verifier's three-replica fixture,
  the later one-active-but-`maxReplicas=3` state, multiple active replicas, and
  the accepted one-replica state.
- Replaced an untested “under 30 seconds” line and decorative stall labels
  with direct instructions. The required landing copy audit is in
  `.factory/copy-audit.md`.
- Updated the Rust builder to the current stable `rust:1-slim` image contract;
  no source build depends on `.git`.

## Verification evidence

Clean/local checks:

- `npm ci`: 187 packages, 0 vulnerabilities.
- `npm test`: 7/7 Vitest tests, including 4/4 deployment topology cases;
  6/6 Rust tests; release and PORT-only runtime contracts passed.
- `npm run check`: 0 Svelte/TypeScript diagnostics; strict Clippy passed.
- `npm run build`: `dist/` produced; JS 85.65 kB (32.70 kB gzip), CSS
  20.06 kB (5.41 kB gzip), fonts 57.7 kB, hero art 86.1 kB.
- `BUILD_SHA=<commit> cargo build --release --locked`: passed.
- Optimized local server: normal WARD + SURGE build/share flow passed; 20/20
  independent desktop-host and 390 px phone joins passed.
- Local PWA: production shell precache, changed stable-URL asset update, stale
  cache cleanup, and cold 390 px offline reload passed.
- Local accessibility/browser: axe found 0 serious/critical issues in eight
  states. Keyboard skip/focus, reduced motion, 390 px layout, 200% text,
  same-origin privacy, no console errors, and response policy passed.
- Rate-load regression: page views returned 20 × 204 and 5 × 429; WebSocket
  upgrades admitted 120 and rejected 20 with the required policy.
- Local mobile Lighthouse: 97 performance / 100 accessibility / 100 best
  practices / 100 SEO; FCP 1.35 s, LCP 2.45 s, CLS 0, TBT 32 ms.

Live checks on the repaired deployment:

- The full deployment invariant passed three consecutive reads ten seconds
  apart.
- 20/20 isolated desktop-host and 390 px phone joins passed. A normal live
  WARD + SURGE flow also built and shared both powers.
- Live PWA cold-offline reload, eight-state axe suite, keyboard/focus, reduced
  motion, mobile overflow, privacy/network capture, and response policy passed.
- Factory URL smoke: HTTP 200 in 574 ms; no console errors; `lang=en`; one H1;
  main landmark; no missing alt text or unnamed controls.
- Live mobile Lighthouse: 98 performance / 100 accessibility / 100 best
  practices / 100 SEO; FCP 1.36 s, LCP 2.16 s, CLS 0, TBT 0 ms.
- Live rate-load regression again returned page views 20 × 204 / 5 × 429 and
  WebSockets 120 admitted / 20 rejected.

## Run and verify

```sh
npm ci
npm test
npm run check
npm run build
BUILD_SHA="$(git rev-parse HEAD)" cargo build --release --locked

PORT=18084 DIST_DIR=dist DATABASE_URL='sqlite::memory:' target/release/coop-boss-access
APP_URL=http://127.0.0.1:18084 WS_URL=ws://127.0.0.1:18084/ws npm run test:e2e
APP_URL=http://127.0.0.1:18084 BROWSER_JOIN_ATTEMPTS=20 npm run test:browser-joins
APP_URL=http://127.0.0.1:18084 npm run test:pwa
APP_URL=http://127.0.0.1:18084 npm run test:a11y
APP_URL=http://127.0.0.1:18084 npm run test:browser-quality
APP_URL=http://127.0.0.1:18084 npm run test:rate-limit

scripts/verify-container-release.sh "$(git rev-parse HEAD)"
```

## Known gap and next step

No automated check can establish the brief's human mixed-ability playtest
measure. Run that moderated playtest before making a research claim about 80%
of players acting within 30 seconds. Do not increase the production replica
limit until room state and broadcasts use a shared real-time store.
