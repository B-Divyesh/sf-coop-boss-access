# Co-op Boss Access — repair 6 handoff

Date: 2026-08-30

Work order: `coop-boss-access-repair-6`

Source report: `.factory/verification-6.md` at `cc34518aa3fdb4f563c56c0ba1a12bcbfe293605`

Failed candidate: `eb0db72100eff40d01274721e31041e27bf8486e`

Production URL: <https://coop-boss-access.sociobot.in>

## Release status

Repaired, deployed, and live. The functional repair is commit `db5368a9ea357c93c51024b66724dc37948dc848`. The documentation-only commit containing this finalized record is also deployed through the same checked workflow before handoff, so production and `main` retain the same identity.

## Findings repaired

1. **Process-local rooms and deployment topology:** the checked deployment keeps `minReplicas=1`, `maxReplicas=1`, single-revision traffic, one running latest-revision replica, and exact public build identity. The release workflow now also runs both required 20-attempt live join suites after the control-plane checks.
2. **Desktop first screen:** the copy column is wider, its heading is capped at 80 px, and the desktop hero uses less vertical padding. At 1440×900, **Try it with sample data** moved from y=928.75–983.75 to y=592.78–647.78. Its outcome note moved from below the viewport to y=659.78–682.28. `@claim:demo-one-click` now fails if either element leaves the 900 px first screen.
3. **Ingress-aware rate limiting:** a dedicated `tower_governor` key extractor uses the first `X-Forwarded-For` address supplied by the trusted ingress and falls back to the socket peer only when that header is absent. The integration test varies downstream forwarded hops and `X-Real-IP`, proves exactly 20 page views are admitted, proves request 21 is rejected, and requires `Retry-After`. The live deployment gate runs an exact 20×204/5×429 page-view probe on the fresh replica before browser page traffic.
4. **Real 404 behavior:** unknown HTML navigation now retains the app shell but changes the response to HTTP 404. The client maps only exact known routes and renders a night-market 404 screen with its own title and a working return action. Browser coverage asserts the HTTP status, heading, title, and recovery; axe covers the state at 390 px.

The real-room protocol, demo isolation, Ward/Surge behavior, local preferences, privacy boundary, service-worker behavior, and all eleven existing claims remain unchanged. One test-backed overload-protection claim records the documented rate-limit behavior.

## Exact local verification

All checks used Node 22, stable Rust, and the pinned Playwright 1.58.2 browser:

- `npm ci`: 187 packages installed; 0 audit vulnerabilities.
- `npm test`: release contract passed; Vitest 8/8; Rust 8/8; PORT-only runtime contract passed.
- `npm run check`: 0 Svelte errors or warnings; strict Clippy passed with warnings denied.
- `npm run build`: produced `dist/`.
  - SHA-stamped initial JS: 67.67 kB raw / 25.48 kB gzip.
  - Lazy host QR chunk: 25.88 kB raw / 10.17 kB gzip.
  - CSS: 23.54 kB raw / 6.07 kB gzip.
  - Local fonts: 57.70 kB total; hero WebP: 86.07 kB.
- `npm run test:claims`: all 12 claim tests passed, including the new 1440×900 first-screen and exact per-client rate-limit assertions.
- `npm run test:e2e`: a real host, Ward, and Surge joined, started, built charge, and shared both effects.
- `WS_URL=ws://127.0.0.1:4173/ws npm run test:join-reliability`: 20/20 protocol joins passed.
- `APP_URL=http://127.0.0.1:4173 BROWSER_JOIN_ATTEMPTS=20 npm run test:browser-joins`: 20/20 isolated desktop-host/mobile-phone joins passed.
- `npm run test:rate-limit` against a fresh server: page views were exactly 20 HTTP 204 and 5 HTTP 429; every 429 included `Retry-After`; WebSockets were 120 admitted and 20 rejected.
- `npm run test:browser-quality`: HTTP 404 recovery, one h1, 390 px no-overflow, keyboard skip link, visible 3 px focus, reduced motion, same-origin privacy, no console errors, and response policy passed.
- `npm run test:a11y`: home, demo, host, join, privacy, terms, 404, high contrast, reduced motion, and connected-controller states each had 0 axe violations.
- `npm run test:pwa`: shell precache, same-URL update, stale-cache cleanup, and 390 px cold offline reload passed.
- `/opt/fleet/lib/verify-url.sh` on `/` and `/demo`: HTTP 200, correct route titles and `lang`, one h1, a main landmark, complete alt text, no unlabeled buttons, and no console errors.
- Lighthouse 13 mobile: Performance 97, Accessibility 100, Best Practices 100, SEO 100; LCP 2.43 s, CLS 0, TBT 0 ms, Speed Index 1.38 s.
- Local health load smoke: 100/100 HTTP 200 in 143 ms (698 requests/second).
- Visual inspection covered home and 404 at 1440×900 and 390×844. Both widths had zero horizontal overflow; the first-screen action, facts, 404 recovery, and typography were readable and unclipped.

Docker is not installed in this worker (`docker: command not found`). The authoritative multi-stage Docker build passed in Azure Container Registry.

## Deployment evidence

```sh
scripts/deploy-container.sh db5368a9ea357c93c51024b66724dc37948dc848
```

- ACR run `ch1es` built and pushed `sociobotregistry.azurecr.io/sf-coop-boss-access:db5368a9ea35` with digest `sha256:5bb7299d05b28dd154d1d8a4e7529041acd0132a22cffb73cc13f6d94700407f` from the `.git`-free source archive.
- The deployment script observed the exact build on one healthy latest-revision replica four times. Azure reported `minReplicas=1`, `maxReplicas=1`, single-revision traffic, and exactly one running replica.
- The fresh live page-view probe returned exactly 20 HTTP 204 and 5 HTTP 429 responses. Every rejection included `Retry-After`.
- `WS_URL=wss://coop-boss-access.sociobot.in/ws npm run test:join-reliability`: 20/20 live protocol joins passed.
- `APP_URL=https://coop-boss-access.sociobot.in BROWSER_JOIN_ATTEMPTS=20 npm run test:browser-joins`: 20/20 isolated live desktop-host/mobile-controller joins passed.
- Public `/health` returned `{"build":"db5368a9ea357c93c51024b66724dc37948dc848","status":"ok"}`. A later deployment-state read again found the exact image, identity, and one-replica topology.
- Live real-room E2E passed host, Ward, Surge, start, build, and both share effects.
- Live browser quality, response policy, 390 px keyboard/reduced-motion checks, and PWA update/offline reload passed.
- Live axe found zero violations across home, demo, host, join, privacy, terms, 404, high contrast, reduced motion, and connected-controller states.
- Live `/` and `/demo` URL verification returned HTTP 200 with correct titles, `lang=en`, one h1, a main landmark, complete image alternatives, no unlabeled buttons, and no console errors.
- Live `/not-a-real-page` returned HTTP 404 and the designed recovery screen. At 1440×900, the sample action was y=592.78–647.78 and its outcome note was y=659.78–682.28.
- Live Lighthouse 13 mobile: Performance 98, Accessibility 100, Best Practices 100, SEO 100; LCP 2.16 s, CLS 0, TBT 0 ms, Speed Index 1.37 s.
- A live 100-request concurrent health smoke returned 100/100 HTTP 200 with the exact build in 306 ms.

## Known gap

The brief's 80% mixed-ability success measure still requires a moderated human playtest. Automation verifies redundant cues and controller behavior, not the study outcome.
