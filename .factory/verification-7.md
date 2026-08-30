# Independent product verification 7 — FAIL

Date: 2026-08-30

Work order: `coop-boss-access-verify-7`

Candidate: `edfc53c1dd57baa730450b76cf96de8fa9e7e3d7`

Production: <https://coop-boss-access.sociobot.in>

## Verdict

**FAIL — do not accept or promote this release.** The live application is the
requested candidate, and its UI, demo, local behavior, accessibility, privacy,
offline support, and performance are otherwise strong. Three independent
release blockers remain:

1. Every claim command failed from the installed clean clone because the claim
   runner times out before a cold Rust build can start its server.
2. Production currently runs three replicas even though rooms are process-local.
   Real browser host/phone joins fail intermittently with “Room not found.”
3. The documented per-client page-view and WebSocket allowances are not
   enforced across those replicas; live overload tests exceeded both limits
   without a 429 response.

## Mandatory first-read test

**PASS.** I opened `/` cold in a fresh 1440×900 browser context with service
workers blocked. The first screen says:

- what it does: “Beat a boss together with phone controls” in a three-minute
  team battle;
- who it is for: friends sharing one screen whose phones become two-button
  controls;
- what to click first: **Try it with sample data**, followed by “The sample
  opens with two players ready.”

The sample action is visible at y=592.78–647.78 and opens `/demo` in one click.
The demo immediately shows Mina as Ward and Ivo as Surge, plus the persistent
“Demo — sample data, nothing is saved” banner, **Reset demo**, and **Start for
real**. Cold screenshot: `/tmp/coop-first-read.png` in this verifier container.

## Release-blocking defects

### P0 — all claim tests fail from an installed clean clone

`.factory/claims.json` exists and contains 12 entries. After `npm ci`, I ran
every listed `test` command individually, in file order, before other repository
QA. Every command built the frontend successfully and then failed identically:

```text
Error: Claims server did not become ready at http://127.0.0.1:<port>
    at waitForServer (tests/claims.mjs:29:9)
Server output:

Node.js v22.23.2
```

`waitForServer` permits only 120×100 ms (12 seconds), while `cargo run --quiet`
is still compiling in a cold clone. Because quiet compilation emits no output,
the attached server output is empty. The runner kills Cargo at the timeout, and
subsequent claim commands also fail. This violates the explicit rule that any
failing claim test blocks release.

After separately allowing `cargo run --quiet` to finish once, I reran every
exact claim command. All 12 behaviors passed from a warm Rust cache:

| Claim | Clean installed run | Warm diagnostic run |
| --- | --- | --- |
| `demo-one-click` | FAIL: server readiness timeout | PASS |
| `role-effects` | FAIL: server readiness timeout | PASS |
| `demo-isolation` | FAIL: server readiness timeout | PASS |
| `offline-reload` | FAIL: server readiness timeout | PASS |
| `temporary-rooms` | FAIL: server readiness timeout | PASS |
| `free-no-account` | FAIL: server readiness timeout | PASS |
| `redundant-role-cues` | FAIL: server readiness timeout | PASS |
| `accessible-controls` | FAIL: server readiness timeout | PASS |
| `local-preferences` | FAIL: server readiness timeout | PASS |
| `room-rules` | FAIL: server readiness timeout | PASS |
| `anonymous-page-count` | FAIL: server readiness timeout | PASS |
| `per-client-rate-limit` | FAIL: server readiness timeout | PASS |

Required fix: make claim startup tolerate a cold Rust build, or build the server
before starting the readiness deadline. Then prove every listed command passes
from a fresh clone with no pre-existing `target/`.

### P0 — three live replicas break process-local rooms

Fresh control-plane evidence:

```text
image: sociobotregistry.azurecr.io/sf-coop-boss-access:edfc53c1dd57
latest revision: sf-coop-boss-access--0000015
active revisions mode: Single
traffic: 100% latest revision
minReplicas: 1
maxReplicas: 3
running ready replicas: 3
```

`npm run verify:deployment -- edfc53c1dd57baa730450b76cf96de8fa9e7e3d7`
failed with:

```text
Deployment invariant failed: process-local rooms require maxReplicas=1
3 !== 1
```

The product stores rooms in a process-local `HashMap`, and
`.factory/container-deploy.json` requires one replica. Fresh end-to-end proof:

- `APP_URL=https://coop-boss-access.sociobot.in BROWSER_JOIN_ATTEMPTS=20 npm run test:browser-joins`
  passed attempt 1, then timed out on attempt 2 waiting for “You are Ward.”
- An independent host/phone reproduction created room `474N`; the host remained
  connected and showed the room, while the phone received
  `{"type":"error","message":"Room not found. Check the four-character code and try again."}`.
- The live connected-controller axe flow timed out at the same join step.
- One raw WebSocket host/Ward/Surge run did pass and shared both powers. That
  intermittent success does not satisfy the real multi-phone job.

Required fix: deploy with `minReplicas=1`, `maxReplicas=1` and exactly one ready
replica, or move rooms and broadcasts to shared state. Then run all 20 isolated
browser joins against production.

### P0 — live per-client request allowances are not enforced

The source configures a 20-request page-view burst and a 120-upgrade WebSocket
burst per client. Local claim/unit tests pass. A direct live probe with a unique
first `X-Forwarded-For` value also returned exactly 20×204 and 5×429, with
`Retry-After: 0` on every rejection.

The required ordinary single-client production checks fail across the three
replicas:

```text
RATE_LIMIT_SCOPE=pageview APP_URL=https://coop-boss-access.sociobot.in npm run test:rate-limit
AssertionError: a fresh process must admit the documented 20-request page-view burst
actual 204 responses: 25; expected: 20
```

```text
RATE_LIMIT_SCOPE=websocket APP_URL=https://coop-boss-access.sociobot.in npm run test:rate-limit
AssertionError: WebSocket create/join bursts above the quota must be rejected during upgrade
actual admitted: 140; rejected: 0
```

Observed live allowance is therefore at least 25 page views and at least 140
WebSocket upgrades for one client, with no 429 at those tested counts. The
documented allowance is not enforced at the deployed service boundary.

Required fix: restore the one-replica deployment or use a shared limiter, then
prove request 21 and WebSocket upgrade 121 return 429 with `Retry-After`.

## Other finding

### P1 — README contains unlisted quantitative/runtime claims

The README says the server admits at most 256 rooms and 2,048 live sockets and
that WebSocket registrations have a short per-client burst limit. These claims
do not have their own entries in `.factory/claims.json`. Repository tests touch
the behavior, but the claims contract requires each visitor-facing claim to be
listed and mapped to exactly one tagged test.

## Passing evidence

### Identity and production build

- `git rev-parse HEAD` was exactly the candidate SHA; the worktree was clean
  before reporting.
- `/health` returned HTTP 200 and
  `{"build":"edfc53c1dd57baa730450b76cf96de8fa9e7e3d7","status":"ok"}`.
- The footer showed `Build edfc53c1dd57`.
- A frontend build with `VITE_BUILD_SHA` set to the candidate byte-matched the
  live main JS, CSS, and `sw.js` by SHA-256.
- `BUILD_SHA=<candidate> cargo build --release --locked` passed.
- Docker is unavailable in this worker (`docker: command not found`), so the
  Dockerfile itself could not be executed. It is multi-stage, uses `rust:1-slim`,
  accepts `ARG BUILD_SHA=dev`, and runs as the distroless `nonroot` user.

### Local gates

- `npm ci`: 187 packages installed, 0 audit vulnerabilities.
- `npm test`: release contract passed; Vitest 8/8; Rust 8/8; PORT-only startup
  contract passed.
- `npm run check`: 0 Svelte errors/warnings; strict Clippy passed.
- `npm run build`: passed and produced `dist/`.
- Warm claim diagnostics: all 12/12 passed.

### Functional, boundary, and recovery behavior

- The sample battle built Ward charge, shared a 48% shield, applied a 28% Surge
  boost, reset to the seed, and exited to the real start.
- Local real-room coverage admitted 2–8 controllers, balanced Ward/Surge 4/4,
  rejected controller 9, and began at 180 seconds.
- A live raw-protocol run created a room, joined Ward and Surge, started the
  round, built charge, and shared both effects.
- Join input strips punctuation and uppercases the code (`a-1b2!` → `A1B2`),
  the empty name is natively invalid, a 17-character name is limited to 16,
  and an unknown code produces a visible `role=alert` recovery message.
- Unknown routes return HTTP 404 with “This game screen is not here” and a
  working return action.

### Privacy and network behavior

- A complete live `/demo` flow made only same-origin document, font, image, JS,
  and CSS requests; it made no `/api/pageview` request, set no cookies, emitted
  no console/page errors, and preserved real storage keys.
- A cold live home load made only same-origin requests plus the disclosed
  same-origin `POST /api/pageview`; it set no cookies.
- Demo preferences use session storage and reset cleanly. Real display settings
  remain browser-local and are absent from WebSocket frames in the claim test.
- No sign-in exists, so the Entra requirement is not applicable.

### Accessibility, responsive UI, and resilience

- `/opt/fleet/lib/verify-url.sh` passed `/` and `/demo`: correct titles,
  `lang=en`, one h1, a main landmark, complete alt text, labeled buttons, and no
  console errors.
- Live axe found 0 serious/critical findings on home, demo, host, join, privacy,
  terms, 404, high-contrast host, and reduced-motion host. The connected
  controller state was unreachable because of the replica defect above.
- At 390×844 there was no horizontal overflow. Visible demo controls measured
  44–46 CSS px high. Keyboard skip-link focus used a visible 3 px solid yellow
  outline, and reduced-motion transitions were effectively 0 seconds.
- PWA regression passed shell precache, stale-cache cleanup, update, and cold
  offline reload at 390 px.
- Desktop and mobile visual inspection found no clipping or unreadable states.
  The night-market visual system is product-specific and matches
  `.factory/design.md`.

### Headers, routes, caching, and budgets

- Root, demo, host, join, privacy, terms, robots, and sitemap returned 200;
  the unknown route returned 404. Internal links and the GitHub source link
  resolved.
- Responses include CSP, HSTS, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`.
- Documents and stable fonts/art use `no-cache`; hashed JS/CSS use
  `public, max-age=31536000, immutable`.
- Main JS: 67.67 kB raw / 25.48 kB gzip. Lazy QR JS: 25.88 kB raw / 10.17 kB
  gzip. CSS: 23.54 kB raw / 6.07 kB gzip. Fonts: 57.70 kB total. Hero WebP:
  86.07 kB. All stated budgets pass.
- Lighthouse 13 mobile: Performance 98, Accessibility 100, Best Practices 100,
  SEO 100; LCP 2.3 s, CLS 0, TBT 50 ms, Speed Index 2.8 s.
- Live health concurrency smoke: 100/100 HTTP 200 with the exact build in
  421 ms (about 238 requests/second).

## Remaining non-automatable acceptance measure

The brief's target that 80% of mixed-ability players identify their role and
act within 30 seconds still needs a moderated human playtest. Automation proves
the redundant cues and controls, not the human success percentage.
