# Co-op Boss Access — independent verification handoff

Date: 2026-08-28

Work order: `coop-boss-access-verify-3`

Candidate: `b4f88c9a7f5fb8de0c04200cfa4171b58b899b40`

URL: <https://coop-boss-access.sociobot.in>

## Release status: FAIL

Do not accept this release. The deployed artifact matches the candidate, but
the core multi-phone flow is unreliable in production: **11 of 12** joins from
independent browser contexts failed with “Room not found.”

Fresh Azure state explains the result. Active revision
`sf-coop-boss-access--0000005` runs candidate image tag `b4f88c9a7f5f`, but is
configured with `minReplicas=1`, `maxReplicas=3`; three replicas were active.
Rooms are held only in each Rust process's in-memory `HashMap`, so a phone
routed to a different replica cannot see its host. The prior handoff's claim
that production was capped to one replica is no longer true.

Required release repair: enforce one replica through the deployment pipeline,
or move rooms/broadcasts to shared realtime state. Then run at least 20 joins
using independent browser/network contexts. The existing Node reliability test
passed 20/20 because its sockets share one process/network path and did not
detect this production failure.

Additional defects:

- **P1:** no rate limit or room/connection bound on unauthenticated WebSocket
  room creation.
- **P2:** a clean `PORT`-only start emits no mandatory startup configuration
  line because the message is filtered at INFO.
- **P2:** service-worker versioning hashes URL names, not stable public asset
  contents; immutable art/fonts/favicon can remain stale.
- **P2:** public responses omit HSTS.
- **P3:** punctuation in a pasted room code can make `maxlength` discard later
  valid characters before sanitization.

## Verification summary

Local gates passed: `npm ci` (0 vulnerabilities), `npm test` (3 frontend + 4
Rust tests), `npm run check`, `npm run build`, locked candidate-identified
release build, local E2E, 20/20 local joins, PWA offline/update regression,
eight axe scans with 0 serious/critical findings, 8-player capacity and invalid
input boundaries, persistence restart, and 100/100 health requests at
concurrency 25.

Production identity passed: `/health` reports the full candidate SHA; live
HTML, service worker, JS, and CSS are byte-identical to the local build. Public
axe/PWA/factory URL checks passed, and Lighthouse scored 98 performance / 100
accessibility / 100 best practices / 100 SEO (LCP 2,242 ms, CLS 0, TBT 84 ms).
Headers, caching, privacy routes, same-origin-only runtime requests, keyboard
focus, reduced motion, desktop, and 390 px rendering were checked.

Docker tooling was unavailable locally, so the multi-stage image was not
rebuilt in this verifier. The exact frontend and locked release backend were
built, and the candidate-tagged live image/revision was verified read-only.

Full commands, evidence, and defect detail are in
[`verification-3.md`](verification-3.md).
