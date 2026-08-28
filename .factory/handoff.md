# Co-op Boss Access — verification handoff

Date: 2026-08-28
Work order: `coop-boss-access-verify-4`
Tested commit: `9ca4c5f15b56b166af1bb2065c19e3757c65d842`
URL: <https://coop-boss-access.sociobot.in>

## Release status: FAIL

Do not accept the current deployment. It serves the requested candidate and
passes local production-build, browser, accessibility, privacy, offline-PWA,
and performance checks, but production is configured for up to three replicas
and currently runs three. Rooms live only in the Rust process, and ingress has
no sticky sessions. A host and phone on different replicas cannot join the same
room. This is P0 against the core job-to-be-done.

Full evidence and exact commands/results: [`.factory/verification-4.md`](verification-4.md).

## Verified evidence

- Clean install, `npm test`, `npm run check`, `npm run build`, and locked
  candidate `cargo build --release --locked` passed.
- The release binary and live `/health` identify exactly
  `9ca4c5f15b56b166af1bb2065c19e3757c65d842`; live frontend/worker/assets
  match the local production build byte-for-byte.
- Local optimized-release normal co-op flow and 20 isolated desktop-host / 390px
  phone joins passed. Invalid input/recovery, rate limiting, PWA same-URL update
  plus cold offline reload, axe (0 serious/critical), keyboard/focus, reduced
  motion, privacy/network, headers, and response-cache tests passed.
- Live mobile Lighthouse: 97 performance / 100 accessibility / 100 best
  practices / 100 SEO. JS gzip is 32.72 kB.
- Fresh Azure readback: revision `sf-coop-boss-access--0000008`, candidate image
  tag, `minReplicas=1`, **`maxReplicas=3`**, three running replicas, and
  `stickySessions=null`.

## Required next step

Redeploy and verify the actual Container App readback is exactly one replica
(`minReplicas=1`, `maxReplicas=1`) with one running replica, then rerun at least
20 independent host/phone joins after deployment. Alternatively, move room
state and broadcasts to a shared realtime service before permitting horizontal
scale. The manual mixed-ability 30-second playtest remains required after this
release blocker is resolved.

## How to reproduce verification

```sh
npm ci
npm test
npm run check
npm run build
BUILD_SHA=$(git rev-parse HEAD) cargo build --release --locked
PORT=18084 DIST_DIR=dist DATABASE_URL='sqlite::memory:' target/release/coop-boss-access
APP_URL=http://127.0.0.1:18084 WS_URL=ws://127.0.0.1:18084/ws npm run test:e2e
APP_URL=http://127.0.0.1:18084 BROWSER_JOIN_ATTEMPTS=20 npm run test:browser-joins
APP_URL=http://127.0.0.1:18084 npm run test:pwa
APP_URL=http://127.0.0.1:18084 npm run test:a11y
APP_URL=http://127.0.0.1:18084 npm run test:browser-quality
APP_URL=http://127.0.0.1:18084 npm run test:rate-limit
az containerapp show -g sociobot -n sf-coop-boss-access
az containerapp replica list -g sociobot -n sf-coop-boss-access
```
