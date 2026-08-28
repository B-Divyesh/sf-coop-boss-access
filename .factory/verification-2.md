# Independent product verification 2 — FAIL

**Date:** 2026-08-28  
**Candidate:** 71b1385abefdd683317fae26e29ded5333985c62  
**Production URL:** https://coop-boss-access.sociobot.in

## Release verdict

**FAIL. Do not release this candidate.** The public backend neither identifies as
the candidate nor reliably lets phone controllers join a host's room. A fresh,
cold-cache offline reload also renders a blank app. The local, single-process
candidate is otherwise healthy; these are deployment/release-blocking defects,
not a successful end-to-end release.

## Blocking defects

### P0 — Controllers are routed to replicas that do not own the host room

Rooms live only in the Rust process HashMap. On the public URL, a host was kept
connected while independent controller WebSockets attempted to join its
four-character code. A 12-attempt real-network sample produced **3 joins and 9
errors** (Room not found. Check the four-character code and try again.). In a
second eight-controller boundary sequence, 3 joined and 5 failed the same way.

This violates the smallest useful product: friends cannot reliably use phones
to join a shared host screen. It is consistent with multiple replicas and no
WebSocket affinity/shared room store. The repository itself documents the
process-local limitation, but production exposes it as a normal user failure.

**Required retest:** deploy one replica with verified connection affinity, or
move room state to a shared real-time store, then repeat at least 20 independent
host-plus-controller joins with 100% success before release.

### P0 — Public build identity is not the candidate

Fresh GET /health at the production URL returned:

    {"build":"9b3c663e76c1f930eb376b78d038509106c621bf","status":"ok"}

not candidate 71b1385abefdd683317fae26e29ded5333985c62. The public deployment
therefore cannot be accepted as this candidate. Dockerfile also sets its
fallback ARG BUILD_SHA to the old 9b3c663… value rather than the required safe
dev default, which makes a missing build argument misidentify a new image.

**Required retest:** deploy the candidate with BUILD_SHA=71b1385…; verify
/health exactly matches it and make the Dockerfile fallback dev.

### P1 — Cold offline reload is blank

Using a new Chromium profile, I loaded the public home page, waited until the
service worker controlled the page, cleared the browser HTTP cache, set the
context offline, and reloaded. The worker cache contained only /,
/favicon.svg, and /art/night-market-dragon.webp. The resulting page had h1: 0
and an empty #app; /assets/index-DE5X9jTz.js, /assets/index-C0WFbNq4.css, and
both local font files failed with net::ERR_FAILED.

public/sw.js uses the unversioned coop-boss-shell-v1 and precaches no JS, CSS,
or fonts, so it also has no robust update strategy.

**Required retest:** precache the built shell and fonts using a build-versioned
cache, test an update from an older cache, then repeat the fresh-profile offline
reload with browser HTTP cache cleared.

## Local candidate evidence

All local work used a detached clean worktree at the candidate SHA:

    git worktree add --detach /tmp/coop-boss-access-qa 71b1385abefdd683317fae26e29ded5333985c62
    cd /tmp/coop-boss-access-qa
    npm ci
    npm test
    npm run check
    npm run build
    cargo build --release --locked

- npm ci passed with 0 reported vulnerabilities.
- npm test passed: 3 Vitest tests and 4 Rust tests.
- npm run check passed: Svelte diagnostics and cargo clippy -- -D warnings.
- npm run build passed. dist assets were 85,487 B JS, 20,060 B CSS, 57,704 B
  local WOFF2 fonts, and an 86,068 B WebP: all within the stated static budgets.
- cargo build --release --locked passed. Rebuilding with
  BUILD_SHA=71b1385… and starting the release binary returned the exact candidate
  SHA from local /health.
- Local real-WebSocket E2E passed: one host, WARD, and SURGE joined, started a
  round, built 40 charge, and shared shield and boost. The same local binary
  passed npm run test:a11y (eight screens/modes, zero serious/critical axe
  findings) and 100/100 /health requests at concurrency 25.
- Docker is unavailable in this verification container, so the exact
  multi-stage image could not be built or run here. The equivalent production
  frontend build and locked release binary were built and exercised.

## Public product checks

- WS_URL=wss://coop-boss-access.sociobot.in/ws npm run test:e2e passed once:
  host + WARD + SURGE synchronized both powers. This single success is
  superseded for release purposes by the deterministic multi-attempt P0 result.
- APP_URL=https://coop-boss-access.sociobot.in npm run test:a11y passed: zero
  serious/critical axe findings on /, /host, /join, /privacy, /terms, high
  contrast, reduced motion, and a connected controller.
- Factory verify-url.sh passed at desktop and 390 px: 913 ms navigation, no
  console/page errors, lang=en, one h1, a main, image alts, and named buttons.
- Keyboard-only 390 px smoke: Tab reached “Skip to game” with a visible
  rgb(255, 210, 63) solid 3px focus outline; Enter moved to #main.
  prefers-reduced-motion: reduce reduced transition duration to 1e-06s.
- Invalid/recovery UI smoke at 390 px: empty code, malformed code, and a
  non-existent valid-format code produced specific aria-live errors; a normal
  host/phone join worked when routed to the same replica.
- Privacy/network: browser requests observed from the product were same-origin
  only. Runtime fonts, art, scripts, and WebSocket are self-hosted; the only
  non-room write is same-origin POST /api/pageview, which increments the
  documented anonymous daily aggregate. The privacy route describes local
  controller/display storage and no accessibility-data collection.
- Response policy: public HTML, deep links, sw.js, and assets returned 200;
  X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy:
  no-referrer, and a same-origin CSP were present. Hashed assets use public,
  max-age=31536000, immutable; document and worker routes use no-cache.
- Public /health survived 100/100 requests at concurrency 25. This does not
  remedy the multi-replica room-state failure.

## Acceptance notes

The night-market design, self-hosted assets, redundant role cues, high-contrast
and motion controls, privacy/terms routes, form errors, mobile controller
layout, and local single-process co-op flow satisfy their inspected portions of
the brief. Automated QA cannot establish the brief's mixed-ability playtest
success measure; that remains required after the release blockers are repaired.

