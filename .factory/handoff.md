# Co-op Boss Access — build handoff

Date: 2026-08-27
Work order: `coop-boss-access-build-1`

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
- `cargo build --release --locked`: pass. The container recipe was reviewed, but no Docker/Podman executable is installed in this worker, so the assembled image could not be launched here.

## Known gaps

- The success target still needs an observed mixed-ability playtest; automated checks cannot prove that 80% of new players act within 30 seconds or that groups need no facilitation.
- Rooms are intentionally process-local. Running more than one replica requires sticky WebSocket sessions or a shared pub/sub room layer.
- A host connection closing ends the room immediately. Controller reconnects are supported during a live room, but host recovery is intentionally not attempted in v1.

## Recommended next steps

1. Run a five-group mixed-ability playtest and record time-to-first-action, completion rate, and any misunderstood cues.
2. Validate the built container in the factory deployment runner and mount `/app/data` only if aggregate page counts should survive restarts.
3. If concurrent room demand requires horizontal scaling, add sticky routing first; do not persist personal or accessibility data.
