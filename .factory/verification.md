# Independent verification — FAIL

Date: 2026-08-28  
Work order: `coop-boss-access-verify-1`  
Tested commit: `71b1385abefdd683317fae26e29ded5333985c62`  
Required URL: <https://coop-boss-access.sociobot.in>

## Verdict

**FAIL.** The live deployment is not identifiable as the requested candidate, and the shipped service worker produces a blank page on an offline reload after the browser HTTP cache is cleared. Both are release blockers for this web-with-backend product.

## Release-blocking defects

### P0 — live deployment does not match the requested candidate

- Fresh `GET https://coop-boss-access.sociobot.in/health` returned HTTP 200 with `{"build":"9b3c663e76c1f930eb376b78d038509106c621bf","status":"ok"}`.
- The requested candidate is `71b1385abefdd683317fae26e29ded5333985c62`; these identities differ.
- `Dockerfile` also defaults `ARG BUILD_SHA` to the older `9b3c663…`, so a normal container build without an externally supplied build argument embeds the wrong identity.
- An explicit local candidate build (`BUILD_SHA=71b1385abefdd683317fae26e29ded5333985c62 cargo build --release --locked`) served `/health` as `{"build":"71b1385abefdd683317fae26e29ded5333985c62","status":"ok"}` on port 8081. The mismatch is therefore in the public release/build identity, not the health handler.

**Required resolution:** deploy an image built from this candidate with its immutable SHA injected, then recheck public `/health` before release approval.

### P1 — offline reload renders a blank application

- The shipped worker at `/sw.js` precaches only `['/', '/favicon.svg', '/art/night-market-dragon.webp']` under the fixed cache name `coop-boss-shell-v1`; it omits the hashed JavaScript, CSS, and fonts that form the application shell.
- In a fresh Chromium profile, after the worker became active, I cleared the browser HTTP cache and went offline. Reloading `/` returned the cached document but failed `/assets/index-DE5X9jTz.js`, `/assets/index-C0WFbNq4.css`, and both WOFF2 files (`net::ERR_FAILED`). No `.app-shell` rendered and the body was empty.
- A superficial offline reload without clearing normal HTTP cache happened to render, but only because the browser cache still had the omitted assets. It is not an offline-capable service-worker shell.
- The fixed `v1` cache key is not tied to the build assets, so the worker also lacks a robust per-release update strategy.

**Required resolution:** generate/version the worker cache from the production manifest and precache the HTML, hashed JS, CSS, fonts, and required artwork; test an update and cache-cleared offline reload. At minimum, an offline miss must show a clear recovery screen rather than a blank page.

## Evidence: checks that passed

### Clean local candidate

- Started from a clean working tree at the tested SHA; `npm ci` completed with 0 vulnerabilities.
- `npm test`: passed — 3/3 Vitest tests and 4/4 Rust tests.
- `npm run check`: passed — `svelte-check` reported 0 errors/warnings and `cargo clippy --all-targets -- -D warnings` passed.
- `npm run build`: passed and produced `dist/`.
- Candidate release compilation: `BUILD_SHA=71b1385abefdd683317fae26e29ded5333985c62 cargo build --release --locked` passed.
- Local release server, built with that identity: `/health` returned the candidate SHA; `WS_URL=ws://127.0.0.1:8081/ws npm run test:e2e` and `APP_URL=http://127.0.0.1:8081 npm run test:a11y` both passed.
- Backend smoke: 100/100 concurrent local `/health` requests succeeded at concurrency 20. Two anonymous page-view requests returned 204. Rooms remain in memory by design; Rust route tests cover the anonymous aggregate counter and game-rule boundaries.

### Product behaviour and accessibility

- Live end-to-end suite passed: a host and real WARD/SURGE controllers created a room, received complementary roles, started the round, built 40 charge, and shared both shield and boost over `wss://coop-boss-access.sociobot.in/ws`.
- Live axe suite passed with 0 serious/critical findings on `/`, `/host`, `/join`, `/privacy`, `/terms`, high-contrast host, reduced-motion host, and a connected controller.
- At 390 × 844 and 1366 × 900, visual review found no horizontal overflow; the phone host view stacks controls and keeps the room code, role instructions, and large targets visible.
- Keyboard smoke: the first Tab reaches the visible 3 px solid focus ring on “Skip to game”; Enter moves focus to `main`. On the host, Space changed “Reduce motion” from `aria-pressed="false"` to `"true"` and persisted its local-only preference. OS reduced-motion produced a `1e-06s` button transition.
- Invalid/recovery paths: a missing or malformed room code reports “Enter the four-character code shown on the host screen”; an unknown four-character code reports “Room not found. Check the four-character code and try again.” The UI normalizes codes, caps names at 16 characters, and the live normal joining path passed.
- Browser captures on the exercised normal and invalid paths had no page errors or console errors. Chromium does warn that the home-art preload is unused on the host lobby; this is non-blocking but should be removed or made route-specific.

### Privacy, policies, and performance

- Playwright request capture on home/join observed no automatic third-party request. The runtime uses only same-origin static assets, `/api/pageview`, and same-origin WebSocket room state. Static review confirms self-hosted WOFF2 fonts and no analytics SDK or CDN script.
- Fresh live headers on `/` and `/health`: CSP limits sources to self (with `ws:`/`wss:` for room state); `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer` are present. HTML/deep routes use `Cache-Control: no-cache`; hashed assets, fonts, and artwork use `public, max-age=31536000, immutable`.
- Build sizes: JS 85,487 B (32.66 KB gzip), CSS 20,060 B (5.41 KB gzip), fonts 57,704 B total, hero WebP 86,068 B. Initial JS/CSS/font/art budgets are within the stated limits.
- The generated artwork, type, role shapes, markers, high-contrast treatment, local-only preferences, privacy/terms routes, and accessibility cues align with the brief and visual thesis.

## Exact production-build limitation

No `docker`, `podman`, `buildah`, `nerdctl`, or `kaniko` executable is installed in this verification worker, so I could not launch the complete Dockerfile image. I did run its frontend build and Rust release stages locally and exercised the resulting release binary. This limitation does not affect the FAIL: the public health response and the Dockerfile’s checked-in default build SHA independently prove the release-identity defect.

## Retest checklist

1. Build/deploy from `71b1385…` with that SHA passed to the Docker build, then confirm the exact public `/health` body.
2. Test a fresh service-worker install, clear HTTP cache, go offline, reload, and verify a functional shell/offline message.
3. Test a subsequent deployment with changed hashed assets and verify the worker updates cleanly without stale HTML or asset misses.
