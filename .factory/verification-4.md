# Independent product verification 4 — FAIL

**Date:** 2026-08-28
**Work order:** `coop-boss-access-verify-4`
**Candidate:** `9ca4c5f15b56b166af1bb2065c19e3757c65d842`
**Production URL:** <https://coop-boss-access.sociobot.in>

## Verdict

**FAIL — do not accept or promote this deployment.** The deployed HTML, assets,
worker, image tag, and `/health` identity are all the requested candidate, and
the candidate is healthy in a single process. However, the public Container
App has three active replicas (`maxReplicas: 3`) while every game room is an
in-process `HashMap`. No ingress sticky-session mode is configured. A host and
a phone routed to different replicas cannot see the same room, which fails the
brief's defining local-room, host-plus-phone job.

This is fresh deployment evidence, not the prior verifier's result. The
candidate's checked deployment script asks Azure for one replica and its source
contract test passes, but Azure's currently running revision does not satisfy
that invariant.

## Release-blocking defect

### P0 — Production still horizontally scales process-local rooms

Fresh, read-only Azure evidence for the revision serving the public candidate:

```json
{
  "latestRevision": "sf-coop-boss-access--0000008",
  "image": "sociobotregistry.azurecr.io/sf-coop-boss-access:9ca4c5f15b56",
  "minReplicas": 1,
  "maxReplicas": 3,
  "runningStatus": "Running",
  "activeRevisionsMode": "Single",
  "stickySessions": null
}
```

`az containerapp replica list` returned three running replicas of revision 8:
`...-9v6wj`, `...-drqpw`, and `...-nl5bh`.

`src/main.rs` keeps rooms in `Arc<RwLock<HashMap<String, Room>>>`; it has no
shared realtime store or inter-replica broadcast. Consequently, a host
connected to one replica is invisible to a controller sent to either of the
other two. Twenty isolated browser contexts from this one verifier network did
join successfully, but that only proves the ingress kept this source on a
compatible backend during that run; it cannot make a three-replica,
non-sticky, process-local design safe for independent real phones/networks.

**Required fix:** make the deployed revision actually read back as exactly
`minReplicas=1`, `maxReplicas=1`, with one running replica, then repeat
independent host/phone joins after deployment; or replace in-memory rooms and
broadcasts with shared realtime state before scaling above one. Do not accept a
release on the basis of the script's intended setting alone.

## Candidate/deployment identity

- Checkout was clean at the requested SHA and matched `origin/main` before
  reporting.
- Live `/health` returned HTTP 200:
  `{"build":"9ca4c5f15b56b166af1bb2065c19e3757c65d842","status":"ok"}`.
- Public `index.html`, hashed JS, CSS, `sw.js`, both local fonts, original
  WebP art, and favicon were byte-for-byte equal to the local candidate build.
- The live image tag is `9ca4c5f15b56`; current revision is 8.

## Local build and product evidence

- Clean `npm ci` passed: 187 packages installed and 0 vulnerabilities.
- `npm test` passed: release contract, 3/3 Vitest tests, 6/6 Rust tests, and
  the PORT-only startup/runtime contract.
- `npm run check` passed: 0 Svelte diagnostics and strict Clippy with warnings
  denied.
- `npm run build` passed and produced `dist/`; locked
  `BUILD_SHA=<candidate> cargo build --release --locked` passed. The release
  binary's `/health` returned the exact candidate SHA.
- Against the local optimized release server, normal host + WARD + SURGE
  creation/start/build/share passed; 20/20 independent desktop-host and
  390x844 phone-browser joins passed, including punctuated-code paste.
- Invalid/recovery coverage passed: empty/short room code, 17-character name,
  unknown room, then corrected room code and successful join. Room capacity,
  connection capacity, malformed/invalid inputs, cooldown, and page-view
  limit are covered by the passing Rust and browser tests.
- PWA test passed: built JS/CSS/fonts precached, real stable-URL asset update
  created a new cache, stale caches were removed, and a cold 390px offline
  reload rendered the H1. Service-worker update behavior is therefore healthy.
- Rate-load test passed: 20 page views admitted/5 rejected with 429; 120
  WebSocket upgrades admitted/20 rejected. Local health handled the test
  suite normally; rooms are intentionally ephemeral and the anonymous daily
  page aggregate is the sole persisted data.

## Browser, accessibility, privacy, policy, and performance evidence

- Live isolated browser joins passed 20/20; live normal host/ward/surge flow,
  desktop/mobile browser-quality test, PWA offline smoke, and axe suite also
  passed. These are positive functional checks but do not override the P0
  multi-replica topology defect.
- Axe found **0 serious/critical** findings in eight states: home, host, join,
  privacy, terms, high contrast, reduced motion, and connected controller.
- Factory URL verification passed in 645 ms with no browser errors, title,
  `lang=en`, one H1, main landmark, alt text, and named controls. Desktop and
  390px visual review found the night-market UI legible and unclipped; large
  controller controls and redundant role labels/shapes are present.
- Keyboard: initial Tab reaches **Skip to game** with a 3px solid
  `rgb(255, 210, 63)` focus ring; Enter moves focus to main. OS reduced motion
  makes transitions effectively instant. The 390px layout has no horizontal
  overflow. A root 200%-font-size check at 390px also preserved its width;
  this is not a substitute for a human assistive-technology playtest.
- Browser request capture observed only
  `https://coop-boss-access.sociobot.in`; there are no cookies, no third-party
  requests, and no analytics SDK. Only local client ID/preferences and a
  session page-count marker were present. The documented anonymous same-origin
  page-view aggregate and transient, in-memory rate-limit counters are the
  only observed data collection.
- Public responses supplied CSP, `nosniff`, `DENY` framing, `no-referrer`, and
  HSTS (`max-age=31536000; includeSubDomains`). Documents/worker/stable assets
  use `no-cache`; hashed JS/CSS use `public, max-age=31536000, immutable`.
  Unsupported `PUT /api/pageview` and `POST /ws` return 405.
- Production bundle: JS 85.65 kB (32.72 kB gzip), CSS 20.06 kB (5.41 kB gzip),
  fonts 57.7 kB total, art 86.1 kB. All stated budgets pass. Fresh mobile
  Lighthouse: **97 performance, 100 accessibility, 100 best practices, 100
  SEO** (FCP 1.5 s, LCP 2.4 s, CLS 0, TBT 100 ms).

## Acceptance note

The product implements the brief's accessible role cues, high-contrast ground
markers, reduced-motion control, two-action cooperative loop, local room-code
privacy language, and original self-hosted visual system. Automated QA cannot
prove the researched mixed-ability playtest metric (80% identifying/contributing
within 30 seconds); that remains a human validation step after the P0 topology
issue is fixed.
