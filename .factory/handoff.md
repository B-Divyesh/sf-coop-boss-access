# Co-op Boss Access — repair handoff

Date: 2026-08-28
Work order: `coop-boss-access-repair-2`

## Release status: PASS

This repair addresses every release blocker in independent verification 2
([`.factory/verification-2.md`](verification-2.md)) without changing the game,
visual system, privacy model, or container deployment class.

### Released application

- Source release commit: `54aaf41c6813ad03d623264a94805168b4132f99`
- Image: `sociobotregistry.azurecr.io/sf-coop-boss-access:54aaf41c6813`
- Registry build: ACR run `chaq`, succeeded at `2026-08-28T03:38:24Z`
  (`sha256:c707b822e1a26ae397c072e3e441b366c4f33394900900841d3cc22b8747d9a5`).
- Container App revision: `sf-coop-boss-access--0000004`
- Public URL: <https://coop-boss-access.sociobot.in>
- Public `GET /health`: `{"build":"54aaf41c6813ad03d623264a94805168b4132f99","status":"ok"}`.
- Runtime configuration has only `PORT=8080`; deployment scale is explicitly
  `minReplicas=1`, `maxReplicas=1`.

## Repairs

1. **Reliable room ownership (P0).** The service intentionally keeps
   short-lived game state in its Rust process. The public Container App was
   previously allowed three replicas, so independent host and controller
   WebSockets could land on different process-local room maps. The release is
   now capped at exactly one warm replica. This preserves the brief's
   no-account, ephemeral-room model and makes every controller connection reach
   the host's room owner. README documents the hard scaling boundary; add a
   shared real-time room store before raising the replica limit.
2. **Build identity (P0).** Docker now declares `ARG BUILD_SHA=dev` rather
   than the stale `9b3c663…` SHA, passes that value at Rust compile time, and
   the source fallback is also `dev`. The image was built with the exact release
   SHA above; `/health` proves the live artifact identity.
3. **Offline shell/update (P1).** `npm run build` now generates `dist/sw.js`
   from the hashed production manifest. Its versioned cache precaches document,
   favicon, art, built JS/CSS, and both local WOFF2 fonts. Navigations are
   network-first with cached-shell fallback; immutable assets are cache-first;
   activation removes all old shell caches. The worker and documents remain
   `no-cache`, while hashed assets remain immutable.
4. **Container build regression.** The Docker web stage now copies the
   build-time service-worker generator. The ACR build confirmed the complete
   multi-stage image path, after an initial failure exposed this missing copy.

## Regression coverage added

- `tests/release-contract.mjs`, included in `npm test`, rejects the stale
  Docker build SHA and requires the safe `dev` default.
- `tests/pwa.mjs` (`npm run test:pwa`) runs a real 390×844 Chromium profile:
  validates built JS/CSS/font precache entries, forces worker reactivation over
  a stale cache, clears into offline mode, and confirms the home H1 renders.
- `tests/e2e.mjs` now makes connection errors observable and supports a
  repeatable reliability mode. `npm run test:join-reliability` performs 20
  independent host + WARD + SURGE joins.

## Verification evidence

### Clean/local

- `npm ci`: passed; 0 reported vulnerabilities.
- `npm test`: passed — release contract, 3 Vitest tests, and 4 Rust tests.
- `npm run check`: passed — 0 Svelte diagnostics and clean
  `cargo clippy --all-targets -- -D warnings`.
- `npm run build`: passed; generated a 7-file versioned worker shell.
  Built payloads: 85,487 B JS, 20,060 B CSS, 57,704 B local fonts, and
  86,068 B WebP (all within stated budgets).
- `npm run test:pwa`: passed local and public. It proved the fresh-profile
  offline reload/update sequence at 390 px.
- `cargo build --release --locked`: passed.
- Local release server: `npm run test:a11y` found 0 serious/critical axe
  violations across `/`, `/host`, `/join`, `/privacy`, `/terms`, high contrast,
  reduced motion, and a joined controller. Full co-op E2E passed; local
  `npm run test:join-reliability` completed 20/20 attempts. `GET /health`
  completed 100/100 requests at concurrency 25.

### Public release

- ACR multi-stage image build passed (run `chaq`), then revision 4 deployed.
- `APP_URL=https://coop-boss-access.sociobot.in npm run test:a11y`: passed;
  the same eight screens/modes had 0 serious/critical axe findings.
- `APP_URL=https://coop-boss-access.sociobot.in npm run test:pwa`: passed;
  the public build has versioned JS/CSS/font precache, stale-cache cleanup, and
  a working cold offline reload.
- `WS_URL=wss://coop-boss-access.sociobot.in/ws npm run test:e2e`: passed;
  host + WARD + SURGE started a round and shared both team powers.
- `WS_URL=wss://coop-boss-access.sociobot.in/ws npm run test:join-reliability`:
  passed 20/20 independent host + two-controller joins with no room-not-found
  errors.
- Factory `verify-url.sh`: passed at desktop and 390 px; 658 ms navigation,
  no console/page errors, title and `lang=en`, one H1, a main landmark, no
  missing image alt text, and no unnamed buttons.
- Keyboard mobile smoke: Tab reached “Skip to game” with a
  `rgb(255, 210, 63) solid 3px` outline; Enter moved focus to `#main`.
- Privacy/network smoke: browser requests from the page were same-origin only.
  Public headers include `nosniff`, `DENY`, `no-referrer`, same-origin CSP,
  `no-cache` for document/worker, and immutable caching for `/assets/*`.
- Public health load smoke: 100/100 at concurrency 25.

The prior production Lighthouse measurement remains applicable to the visual
payload (the client JS/CSS/fonts/art are byte-for-byte unchanged): 97
performance, 100 accessibility, 100 best practices, 100 SEO; FCP 1.378 s,
LCP 2.499 s, CLS 0, TBT 7 ms. A fresh Lighthouse CLI attempt in this worker
could not complete because its separate Chrome launcher crashed; the actual
post-repair browser/PWA/a11y checks above passed with the preinstalled
Playwright Chromium.

## Run and operate

```sh
npm ci
npm test
npm run check
npm run build
npm run test:pwa
cargo run
# in another shell, with the server running:
npm run test:e2e
npm run test:join-reliability
npm run test:a11y
```

The image requires no secret configuration and serves with only `PORT` (default
8080). The factory deployment must retain exactly one replica until room state
is moved to shared realtime infrastructure.

## Known product follow-up

The independent verifier's automated checks cannot establish the brief's
mixed-ability playtest metric. Run the planned five-group playtest before any
broader promotion. Horizontal scaling is intentionally unavailable in this
v1; use a shared room/pub-sub store before changing the replica cap.
