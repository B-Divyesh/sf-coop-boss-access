# Co-op Boss Access — product-QA handoff

Date: 2026-08-28
Work orders: `coop-boss-access-build-1`, `coop-boss-access-repair-1`

## Independent verification status — **FAIL**

Independent verification of candidate `71b1385abefdd683317fae26e29ded5333985c62` against <https://coop-boss-access.sociobot.in> failed.

- **P0 release identity:** fresh public `/health` returns build `9b3c663e76c1f930eb376b78d038509106c621bf`, not the tested candidate. `Dockerfile` also defaults `BUILD_SHA` to that older SHA. A local release build explicitly given `71b1385…` returned the correct candidate identity.
- **P1 offline/PWA:** the active worker caches only HTML, favicon, and artwork. With HTTP cache cleared, offline reload fails the JS/CSS/fonts and leaves a blank page. Its `coop-boss-shell-v1` key is not build-versioned.

The functional/local quality checks otherwise passed: clean `npm ci`; 7/7 unit tests; `npm run check`; `npm run build`; release compilation; local and live WebSocket end-to-end; live/local axe (0 serious/critical); keyboard/mobile smoke; privacy/network/header review; and 100/100 concurrent local health requests. See `.factory/verification.md` for exact commands, evidence, severity, and retest criteria. Do not mark this release PASS until both defects are fixed and independently retested.

## What was built

- A complete three-minute cooperative boss game with an Axum WebSocket server and one shared Svelte host screen.
- Private four-character ephemeral rooms for 2–8 phone controllers, with reconnectable controller identities and immediate host-room teardown on host disconnect.
- Complementary two-button roles:
  - **WARD** builds charge and shares a team shield that absorbs scheduled boss hits.
  - **SURGE** builds charge and shares a team boost that accelerates automatic team strikes.
- Server-authoritative timers, health, shield, boost, action rate limits, win/loss state, replay, disconnect state, and helpful lobby/start validation.
- QR and typed-code joining, responsive 390 px controller layouts, native keyboard-operable controls, live announcements, loading/error/offline/empty/results states.
- Optional ground markers, high-contrast treatment, and reduced-motion control. Each role and warning is also represented by text, shape, position, and pattern.
- A product-specific night-market visual system plus an original generated paper-dragon illustration. The shipped WebP is 86 KB; the original, prompt, review notes, and provenance are retained under `assets/src/` and `.factory/design.md`.
- Privacy and terms routes, same-origin CSP/security headers, no third-party runtime scripts or fonts, a service-worker shell cache, and two self-hosted font files.
- SQLite is limited to a single anonymous daily page-view aggregate. Room codes, names, connection IDs, accessibility preferences, and gameplay history are not persisted.
- Multi-stage non-root distroless container configuration on port 8080 with graceful shutdown and `/health` build status.
- Delivery repair: the Rust stage now receives the immutable candidate SHA at compile time. `/health` therefore identifies the shipped candidate instead of reporting `development`; no product behavior, visual system, artifact class, or deployment class changed.

## How to run and verify

```sh
npm ci
npm run build       # outputs dist/index.html
npm test            # 3 Vitest + 4 Rust tests
npm run check       # Svelte diagnostics + strict Clippy
cargo run            # serves dist and WebSockets at http://localhost:8080
npm run test:e2e     # with the server running
npm run test:a11y    # with the server running and Playwright available
```

Container:

```sh
docker build -t coop-boss-access .
docker run --rm -p 8080:8080 coop-boss-access
```

## Verification performed

### Repair delivery QA — 2026-08-28

- Recovered candidate: `9b3c663e76c1f930eb376b78d038509106c621bf`; focused delivery repair commit: `d568573834819ddf6432c8e2ed16e51a01de5400`.
- Clean local frontend QA: `npm ci` completed with 0 reported vulnerabilities; `npm run build` passed and produced `dist/` (85.49 KB JavaScript and 20.06 KB CSS before gzip).
- Clean local application QA: `npm test` passed (3/3 Vitest tests and 4/4 Rust tests); `npm run check` passed with 0 Svelte errors/warnings and `clippy -D warnings` clean; `cargo build --release --locked` passed.
- Local container-path smoke: compiled with `BUILD_SHA=9b3c663e76c1f930eb376b78d038509106c621bf`; `GET /` returned 200 and `GET /health` returned `{"build":"9b3c663e76c1f930eb376b78d038509106c621bf","status":"ok"}`.
- Fixed worker container delivery: ACR image `sociobotregistry.azurecr.io/sf-coop-boss-access:d56857383481` deployed as Container App revision `sf-coop-boss-access--0000002`. The worker registered `coop-boss-access.sociobot.in` before managed-certificate ordering; certificate issuance succeeded and the hostname is SNI-bound.
- Public release checks: `GET https://coop-boss-access.sociobot.in/` → HTTP 200; `GET https://coop-boss-access.sociobot.in/health` → HTTP 200 with `{"build":"9b3c663e76c1f930eb376b78d038509106c621bf","status":"ok"}`.
- Public browser QA: factory `verify-url.sh` passed at desktop and mobile screenshots with 585 ms navigation load, no console/page errors, title `Beat the night dragon together — Co-op Boss Access`, `lang="en"`, exactly one H1, a main landmark, 0 images missing `alt`, and 0 unlabeled buttons.
- Public accessibility QA: `APP_URL=https://coop-boss-access.sociobot.in npm run test:a11y` passed with 0 serious/critical axe violations on `/`, `/host`, `/join`, `/privacy`, `/terms`, high-contrast host, reduced-motion host, and a connected phone controller.
- Public end-to-end QA: `WS_URL=wss://coop-boss-access.sociobot.in/ws npm run test:e2e` passed; host plus WARD and SURGE controllers joined a real room, started play, and synchronized both shared powers.

- `npm ci && npm run build`: pass; reproducible output at `dist/index.html`.
- `npm test`: pass, 7/7 unit and HTTP integration tests.
- `npm run check`: pass, 0 Svelte errors/warnings and clean `clippy -D warnings`.
- `npm run test:e2e`: pass; a real host, WARD controller, and SURGE controller joined one room, started a round, and synchronized both shared powers over WebSockets.
- `npm run test:a11y`: 0 axe violations on `/`, `/host`, `/join`, `/privacy`, `/terms`, high-contrast host, reduced-motion host, and a connected phone controller.
- Factory `verify-url.sh`: pass at desktop 1366×900 and mobile 390×844; no browser console/page errors, one `<h1>`, `lang`, `<main>`, named buttons, and complete image alternatives.
- Lighthouse 12.8.2 mobile: **97 performance / 100 accessibility / 100 best practices / 100 SEO**. FCP 1.378 s, LCP 2.499 s, CLS 0, TBT 7 ms. Lab INP is unavailable without a synthetic interaction; TBT and native-button interaction paths are clean proxies.
- Transfer budgets: initial JS 85.49 KB, CSS 20.06 KB, fonts 57.71 KB across two WOFF2 files, hero WebP 86.07 KB.
- Load smoke: 500/500 `/health` requests succeeded with concurrency 50 in 2.268 s (about 220 requests/second).
- Deep-link responses for `/privacy`, `/terms`, `/host`, and `/join`: HTTP 200.
- Visual review completed for home, host lobby, and join screens at desktop and 390 px. The generated illustration has no text artifacts, brands, people, or misleading UI.
- `cargo build --release --locked`: pass. The repaired image was cloud-built and deployed through the factory container worker.

## Known gaps

- The success target still needs an observed mixed-ability playtest; automated checks cannot prove that 80% of new players act within 30 seconds or that groups need no facilitation.
- Rooms are intentionally process-local. Running more than one replica requires sticky WebSocket sessions or a shared pub/sub room layer.
- A host connection closing ends the room immediately. Controller reconnects are supported during a live room, but host recovery is intentionally not attempted in v1.

## Recommended next steps

1. Run a five-group mixed-ability playtest and record time-to-first-action, completion rate, and any misunderstood cues.
2. If aggregate page counts should survive restarts, mount `/app/data` through the factory deployment configuration.
3. If concurrent room demand requires horizontal scaling, add sticky routing first; do not persist personal or accessibility data.
