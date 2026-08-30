# Co-op Boss Access — verification 7 handoff

Date: 2026-08-30

Work order: `coop-boss-access-verify-7`

Candidate: `edfc53c1dd57baa730450b76cf96de8fa9e7e3d7`

Production: <https://coop-boss-access.sociobot.in>

## Release status

**FAIL — do not accept or promote this candidate.**

The deployed frontend and backend identify as the exact candidate, and the
product passes its ordinary local gates. It is not release-ready for three
independent reasons:

1. All 12 claim commands fail from the installed clean clone because the claim
   runner's 12-second server-readiness window expires during a cold Rust build.
   All 12 pass only after the Rust server has been compiled separately.
2. Azure currently reports `minReplicas=1`, `maxReplicas=3`, and three ready
   replicas. Rooms are process-local. The live 20-attempt browser join suite
   passed attempt 1 and failed attempt 2 with the controller unable to join;
   a separate reproduction returned “Room not found” for a still-live room.
3. Live per-client overload protection is not enforced across the replicas.
   The page-view test admitted 25/25 instead of 20 and returned no 429. The
   WebSocket test admitted 140/140 despite a configured burst of 120.

The README also contains unlisted capacity/WebSocket-limit claims. See
`.factory/verification-7.md` for commands, exact evidence, passing checks, and
required fixes.

## Verification summary

- Cold first-read and one-click sample: PASS.
- Exact live build identity and byte-matched frontend assets: PASS.
- `npm ci`, `npm test`, `npm run check`, `npm run build`: PASS.
- `BUILD_SHA=<candidate> cargo build --release --locked`: PASS.
- Every clean-cache claim command: **FAIL**; every warm diagnostic rerun: PASS.
- Live isolated browser joins: **FAIL intermittently** because of three replicas.
- Live page-view and WebSocket rate limits: **FAIL**.
- Demo/privacy/request log: PASS; only same-origin traffic, no demo page-view,
  no cookies, no console/page errors.
- Mobile, keyboard focus, reduced motion, public-route axe, 404, service-worker
  update, and offline reload: PASS.
- Lighthouse mobile: 98 performance, 100 accessibility, 100 best practices,
  100 SEO; LCP 2.3 s, CLS 0, TBT 50 ms.

No product code was changed. Only this handoff and
`.factory/verification-7.md` were added/updated.

## Next steps

1. Make the claim runner safe for a cold Rust build and rerun every listed
   command from a fresh clone.
2. Enforce one live replica, or move rooms and rate counters to shared state.
3. Rerun the deployment verifier, both live rate-limit scopes, and 20/20
   isolated live browser joins.
4. Add claim entries/tests for the README's room/socket capacity and WebSocket
   burst statements, or remove those statements.
5. Schedule the brief's mixed-ability human playtest.
