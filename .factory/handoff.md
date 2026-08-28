# Co-op Boss Access — release repair handoff

Date: 2026-08-28

Work order: `coop-boss-access-repair-3`

Source finding report: `b5fe355767df3ffdfae0a9d64e4de46f1fbb394b` / `.factory/verification-3.md`

Repaired candidate: final `main` commit (resolve with `git rev-parse HEAD`; public `/health` was compared to that exact value after deployment)

URL: <https://coop-boss-access.sociobot.in>

## Release status

All six verifier findings are repaired. The original Rust/Axum + SQLite backend,
Svelte/Vite frontend, same-container deployment class, game rules, night-market
visual system, accessibility modes, and privacy model are preserved.

## Finding-by-finding repairs and regression coverage

1. **P0 — process-local rooms behind three replicas.**
   `scripts/deploy-container.sh` is now the checked release path. It builds an
   immutable SHA-tagged image, passes the full SHA as `BUILD_SHA`, always applies
   `minReplicas=1` and `maxReplicas=1`, reads image and scale back from Azure,
   fails if the invariant differs, and waits until public `/health` returns the
   exact SHA. `tests/release-contract.mjs` prevents removal of either replica
   bound/readback. `tests/browser-joins.mjs` performs 20 sequential host/phone
   joins with a new desktop browser context and independent 390×844 phone
   context for every attempt; 20/20 passed locally against the release server.

2. **P1 — unbounded unauthenticated allocation.**
   `tower_governor` now limits both `/ws` registration handshakes and
   `/api/pageview` by client network address. The process also has hard bounds of
   256 simultaneous rooms and 2,048 live WebSockets; the socket semaphore permit
   is held for the complete upgraded connection and released on disconnect.
   Rust tests cover room/connection exhaustion and page-view rejection.
   `tests/rate-limit.mjs` is the HTTP/WebSocket rejection-load regression: on a
   fresh server, 20/25 page views were admitted and 5 received 429; 120/140
   WebSockets were admitted and 20 rejected. Unsupported methods remain 405
   even after quota exhaustion. The privacy page now discloses the short-lived,
   in-memory network-address counters and confirms they are never persisted.

3. **P2 — PORT-only startup hid mandatory configuration output.**
   The default tracing filter now enables this crate at INFO when `RUST_LOG` is
   absent. `tests/runtime-contract.mjs` builds the binary, starts it from a clean
   temporary directory with an environment containing only `PORT`, verifies
   `/health`, and requires the JSON startup line to identify the database as
   `default` and port as `supplied` without printing values that could be secret.

4. **P2 — stable public files could remain stale.**
   The service-worker version now hashes every precached file's bytes as well as
   its URL. Installation fetches every shell file with `cache: reload`. Only
   Vite's content-hashed `/assets/` files receive one-year immutable caching;
   stable art, font, favicon, document, and worker URLs use `no-cache`.
   `tests/pwa.mjs` changes the bytes of a real stable `dist/favicon.svg`, rebuilds
   the worker, verifies a different cache contains the changed bytes, confirms
   old caches are removed, clears normal-network availability, and completes a
   cold 390 px offline reload with the H1 rendered.

5. **P2 — HSTS missing.** Every application response now carries
   `Strict-Transport-Security: max-age=31536000; includeSubDomains`. The Rust
   route test and `tests/browser-quality.mjs` assert the exact header while the
   existing CSP, `nosniff`, frame denial, and no-referrer policies remain.

6. **P3 — punctuation in pasted codes caused valid characters to be lost.**
   The raw four-character `maxlength` was removed; the existing sanitizer still
   strips punctuation and caps the normalized value at four. Every isolated
   phone trial inserts a five-character punctuated form of the real room code
   and asserts all four valid characters survive before joining successfully.

## Clean local verification

The following was run from a clean npm install after the repair:

```sh
npm ci
npm test
npm run check
npm run build
BUILD_SHA=repair-candidate cargo build --release --locked
npm run test:pwa
npm run test:browser-joins
```

- `npm ci`: 188 packages audited, 0 vulnerabilities.
- `npm test`: release contract passed; 3/3 Vitest tests and 6/6 Rust tests
  passed; the PORT-only runtime contract passed.
- `npm run check`: 0 Svelte diagnostics; strict Clippy passed with warnings
  denied.
- `npm run build`: `dist/` produced successfully. Initial JS is 85,646 B
  (32.72 kB gzip), CSS 20,060 B (5.41 kB gzip), fonts 57,704 B total, and hero
  WebP 86,068 B—within all budgets.
- Locked optimized Rust build passed.
- PWA real-asset update, old-cache deletion, and cache-cleared offline reload
  passed.
- Independent-browser join reliability passed 20/20 at desktop host + 390×844
  phone sizes, including the punctuated-paste assertion.

Against the optimized local release server:

```sh
APP_URL=http://127.0.0.1:18084 WS_URL=ws://127.0.0.1:18084/ws npm run test:e2e
APP_URL=http://127.0.0.1:18084 npm run test:a11y
APP_URL=http://127.0.0.1:18084 npm run test:browser-quality
APP_URL=http://127.0.0.1:18084 BROWSER_JOIN_ATTEMPTS=20 npm run test:browser-joins
APP_URL=http://127.0.0.1:18084 npm run test:rate-limit
```

- Full WARD + SURGE join/start/build/share flow passed.
- Axe covered `/`, `/host`, `/join`, `/privacy`, `/terms`, high contrast,
  reduced motion, and a connected controller: 0 serious/critical findings in
  all eight states.
- Keyboard first focus was the skip link with a 3 px solid yellow ring; Enter
  focused `main`. The 390 px layout had no horizontal overflow. OS reduced
  motion, privacy copy, same-origin-only requests, HSTS/cache policy, and 405
  behavior passed with no console or page errors.
- Factory `verify-url.sh` passed desktop and 390 px in 558 ms: `lang=en`, one
  H1, main landmark, image alts, named buttons, and no console/page errors.
- 100/100 `/health` requests passed at concurrency 25.
- Mobile Lighthouse: 97 performance, 100 accessibility, 100 best practices,
  100 SEO; FCP 1,354 ms, LCP 2,456 ms, CLS 0, TBT 0 ms.

Docker/Podman are not installed in the worker. The equivalent frontend and
locked release binary stages were built locally; the exact multi-stage
Dockerfile was subsequently built by Azure Container Registry during the
checked deployment.

## Deployment and live acceptance

The final commit was pushed to `origin/main` and deployed with:

```sh
scripts/deploy-container.sh "$(git rev-parse HEAD)"
```

The command completed the remote container build, changed the Container App to
the SHA-tagged image, read back `minReplicas=1` and `maxReplicas=1`, and waited
for public `/health` to equal the full final commit. Post-deploy checks repeated
the isolated 20-browser join suite, axe suite, PWA/offline smoke, response
headers, runtime identity, replica count, and factory desktop/mobile URL check.

## Known gap / next step

The researched success measure—80% of mixed-ability players identifying a role
target and contributing within 30 seconds, with an average group completing a
round—still requires a moderated human playtest. This was already outside
automated verification. Before horizontal scaling is ever enabled, replace the
ephemeral in-process room map and broadcast channels with shared realtime
state; until then the deployment command deliberately refuses a multi-replica
configuration.
