# Independent product verification 6 — FAIL

**Date:** 2026-08-30  
**Work order:** `coop-boss-access-verify-6`  
**Candidate:** `eb0db72100eff40d01274721e31041e27bf8486e`  
**Production URL:** <https://coop-boss-access.sociobot.in>

## Verdict

**FAIL — do not accept or promote this candidate.** The live application does
identify itself as the requested commit and the deployed frontend assets
byte-match a candidate build. This is nevertheless a real deployment failure,
not a report-only issue: the live service permits and currently runs three
replicas even though its room state is process-local. The repository's
live 20-attempt join-reliability regression consequently times out.

The landing page also fails the mandatory cold first-screen contract on a
standard 1440 x 900 desktop viewport: the sample action is below the fold, so
the visitor cannot see what to click first without scrolling.

## Cold first-read result

Opened `/` in a fresh desktop browser context with no prior storage. It says it
is a three-minute cooperative boss game, for friends sharing a screen whose
phones become two-button controls, and the intended first action is **Try it
with sample data**. The demo is a real one-click route and its sample battle,
reset control, exit control, isolation banner, and Ward/Surge effects are
implemented.

At 1440 x 900, however, the headline occupies y=162.5–759.7, the explanatory
sentence starts at y=783.7, and the primary sample button is at y=928.75–983.75.
It is not visible in the initial viewport. At 390 x 844 it is visible
(y=648.94–702.44). The desktop first screen therefore does not tell a cold
visitor what to click first, which is an explicit FAIL condition in this work
order.

## Release-blocking defects

### P0 — production topology violates the process-local room contract

`npm run verify:deployment -- eb0db72100eff40d01274721e31041e27bf8486e`
failed against production:

```
Deployment invariant failed: process-local rooms require maxReplicas=1
3 !== 1
```

Fresh Azure control-plane evidence shows the expected candidate image and
revision, but `minReplicas: 1`, `maxReplicas: 3`, and **three** running replicas
of `sf-coop-boss-access--0000012`. This directly contradicts
`.factory/container-deploy.json`, the README, and the server design: a host
room exists only in one process, so a phone routed to another replica cannot
join it.

The live proof is `WS_URL=wss://coop-boss-access.sociobot.in/ws
E2E_ATTEMPTS=20 npm run test:join-reliability`, which timed out waiting for
room state. A single live host/Ward/Surge happy-path attempt passed, but that
does not make cross-replica routing reliable.

**Required fix:** deploy the candidate with `minReplicas=1` and
`maxReplicas=1`, wait until Azure reports exactly one running latest-revision
replica, then rerun the deployment verifier and the complete 20-attempt live
join-reliability test. Do not raise the replica limit without moving room state
and broadcasts to a shared realtime store.

### P0 — primary demo action is below the desktop first screen

The first-screen acceptance rule requires plain words for what the product is,
who it is for, and what to click first. The desktop cold-load measurement above
places **Try it with sample data** below a 900px viewport. This is reproducible
on the live candidate and is not a browser-console issue.

**Required fix:** reduce/reflow the desktop hero so the primary sample action
and its short outcome note are visible without scrolling at ordinary desktop
heights, then add a viewport assertion to the `demo-one-click` claim test.

### P0 — live page-view rate-limit regression is not reliably enforced at its documented allowance

The configured and documented page-view burst is 20 requests per client IP.
The local test passes (`20` HTTP 204 then `5` HTTP 429; `Retry-After: 0`), but
the identical production command failed twice:

```
APP_URL=https://coop-boss-access.sociobot.in npm run test:rate-limit
AssertionError: page-view bursts above the quota must receive 429
```

Direct live probes were inconsistent: 25 concurrent requests sometimes all
received 204; a single HTTP/2 session sent 50 requests and received 49 HTTP 204
and 1 HTTP 429. When a live 429 did occur it did include `Retry-After: 0`, but
the specified allowance is not reliably enforced for one client. This is a
mandatory backend release gate and is plausibly compounded by the three-replica
deployment / forwarding configuration.

**Required fix:** make the limiter consistently key on the first trusted
`X-Forwarded-For` hop at the deployed ingress (or use a shared limiter), prove
20 allowed then 429 + `Retry-After` from one client against production, and add
that live deployment check to release verification.

## Other defect

### P1 — unknown routes return the landing page with HTTP 200

`GET /not-a-real-page` returns HTTP 200 and the home SPA rather than the
required designed 404 response. A real 404 route/status is required by the
site-structure contract.

## Claims and local quality evidence

All eleven commands listed in `.factory/claims.json` were run individually
from the product demo entry point and passed:

- `@claim:demo-one-click`, `role-effects`, `demo-isolation`, `offline-reload`,
  `temporary-rooms`, `free-no-account`, `redundant-role-cues`,
  `accessible-controls`, `local-preferences`, `room-rules`, and
  `anonymous-page-count`.

The aggregate `npm run test:claims` also passed all 11. Other passing local
evidence: `npm ci` (187 packages, no audit vulnerabilities), `npm test`
(8 Vitest and 7 Rust tests), `npm run check` (0 Svelte errors/warnings and
strict Clippy), `npm run build`, exact
`BUILD_SHA=eb0db72100eff40d01274721e31041e27bf8486e cargo build --release --locked`,
20/20 local browser joins, local real-room Ward/Surge build/share E2E, local
browser-quality, local full axe sweep (0 serious/critical violations across
nine states), local PWA update/offline reload, and local rate-limit regression.

Docker itself is unavailable in this verifier container (`docker: command not
found`), so the Dockerfile was not executed here; its component production
builds did pass.

## Live identity, product, privacy, and resilience evidence

- `GET /health` returned HTTP 200 with exact build
  `eb0db72100eff40d01274721e31041e27bf8486e`.
- A build with `VITE_BUILD_SHA` set to that SHA byte-matched live
  `index-BlpYDHYp.js`, `index-D_3ljkAB.css`, and `sw.js` by SHA-256.
- A fresh live real-room E2E host + Ward + Surge run passed; both roles built
  charge and shared their effect. The separate 20-attempt reliability test
  failed as recorded above.
- Production PWA update/offline-reload regression passed. A 100-request
  concurrent health smoke returned 100/100 HTTP 200 in 945ms.
- Fresh browser request logging on the landing page saw only same-origin
  document/assets/fonts/art plus the disclosed same-origin `POST /api/pageview`;
  no cookies, third-party scripts, fonts, analytics SDKs, or console/page
  errors were observed. Demo claim tests verify that the sample skips the
  page-view write and keeps preferences in its `demo:coop-boss:` namespace.
- Live browser-quality passed at 390px: no horizontal overflow, keyboard skip
  link and visible 3px focus ring, reduced motion, same-origin requests, and
  cache/header checks. Local axe found zero serious/critical findings across
  home, demo, host, join, privacy, terms, settings, and connected controller.
- Live responses include CSP, HSTS, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`; documents are
  `no-cache` and hashed assets are one-year immutable. Initial JS is 67.07 kB
  raw / 25.28 kB gzip, CSS 22.39 kB raw / 5.82 kB gzip, local fonts 57.7 kB,
  and hero WebP 86.1 kB.

## Remaining non-automatable measure

The brief's mixed-ability playtest success measure still needs an actual
playtest. Automation confirms the redundant cue and control implementation,
not that 80% of players identify their role and contribute within 30 seconds.
