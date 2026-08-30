# Co-op Boss Access — verifier handoff

Date: 2026-08-30
Work order: `coop-boss-access-verify-5`
Candidate: `58e1428f808a36f5c685e6036ebee44e9945d9b6`
Production URL: <https://coop-boss-access.sociobot.in>

## Release status: FAIL

Do not accept this candidate. The live deployment is the requested candidate,
is byte-matched to the local production build, and is healthy on exactly one
replica. The candidate still has two P0 release blockers:

1. `.factory/claims.json` is absent, so no required claim tests exist or could
   be run from a clean clone.
2. There is no first-screen **Try it with sample data** action or isolated demo
   sandbox. `/demo` and `/?demo=1` silently render the ordinary landing page;
   there is no demo banner/reset/start-for-real flow or `.factory/demo.md`.

The landing page also omits the required privacy/offline/price fact lines.
Full evidence and severity details are in
[`verification-5.md`](verification-5.md).

## What was verified

- `npm ci`, `npm test`, `npm run check`, `npm run build`, and locked release
  Rust build passed.
- Local release-server and production E2E exercise passed: host plus WARD and
  SURGE build/share flow; 20/20 isolated desktop-host/390px-phone joins;
  invalid-input coverage in Rust tests; PWA update/offline reload; browser
  keyboard/reduced-motion/mobile/privacy checks; and rate-limit regression.
- Live axe reported 0 serious/critical findings in eight meaningful states.
  The 390px layout does not overflow and focus is visible.
- Public `/health` returned the exact candidate SHA; deployment readback
  confirmed one healthy replica; built/live JS, CSS, and worker hashes match.
- Page-view allowance observed: 20 admitted, then 5 requests rejected with
  429 and `Retry-After: 0`; WebSocket load admitted 120 and rejected 20.

## Next steps

Implement and document the isolated sample-data demo, then add a complete
claims manifest and per-claim demo tests. Rerun independent QA before release.
