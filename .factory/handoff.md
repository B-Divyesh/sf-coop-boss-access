# Co-op Boss Access — verification 6 handoff

## Release status: FAIL

Candidate `eb0db72100eff40d01274721e31041e27bf8486e` at
<https://coop-boss-access.sociobot.in> **must not be accepted**. See
[`verification-6.md`](verification-6.md) for complete independent evidence.

The live binary and static assets match the candidate, but the Azure Container
App is configured with `maxReplicas=3` and currently has three running
replicas. Process-local WebSocket room state is therefore unreliable; the
20-attempt live join-reliability regression timed out. Production rate-limit
verification also fails to enforce the documented 20-request allowance
reliably, and the desktop cold first screen places the mandatory sample action
below a 900px viewport. These are release blockers.

Required next steps: restore exactly one replica (or implement shared room
state), make the live forwarded-IP rate limit deterministic with 429 plus
`Retry-After`, put the sample CTA in the desktop initial viewport, and add a
real HTTP 404 route. Re-run independent verification after deployment.

---

# Prior repair handoff (superseded by verification 6)

Date: 2026-08-30  
Work order: `coop-boss-access-repair-5`  
Repair commit: `d159834821ffe5a49acef6b179d1ba74d536a8ff`  
Source report: `.factory/verification-5.md` at repository commit `9bb60413ccb239cff9bca1142f9216bd33656449`  
Production URL: <https://coop-boss-access.sociobot.in>

## Release status

Deployed and live. Every release blocker in verification 5 is repaired with a root-cause regression:

1. Added `.factory/claims.json` with 11 unique visitor claims and one exact `@claim:<id>` browser test for each. The release-contract test rejects a missing, empty, duplicate, or unmapped claim.
2. Added a first-screen **Try it with sample data** action. `/demo` and `/?demo=1` now open a seeded, playable Mina/Ward and Ivo/Surge battle.
3. Added the persistent **Demo — sample data, nothing is saved** banner with **Reset demo** and **Start for real**.
4. Added server-side `demo:` workspaces outside the real four-character room namespace. They are memory-only, unguessable, rate-limited, removed on disconnect, and capped at 24 hours. Offline play falls back to the same deterministic seed in browser memory.
5. Added a `demo:coop-boss:` session-storage namespace. Direct demo entry does not create/read a real controller ID or name, change real preferences, set cookies, or write the anonymous page view.
6. Replaced the first-screen feature list with the required price, privacy, and offline facts. The headline now states the job directly.
7. Added `.factory/demo.md`, updated the copy/design audits and README, and added demo/site routes to the sitemap.

The existing real-room protocol, role balance, round rules, accessibility settings, WebSocket rate limits, one-replica deployment invariant, privacy policy, and PWA update behavior remain intact.

## Exact local verification

All commands ran from a clean `npm ci` on the repair commit:

- `npm ci`: 187 packages installed; 0 vulnerabilities.
- `npm test`: release contract passed; Vitest 8/8; Rust 7/7; PORT-only runtime contract passed.
- `npm run check`: 0 Svelte diagnostics; strict Clippy passed with warnings denied.
- `npm run build`: produced `dist/`.
  - Initial JS: 67.07 kB raw / 25.28 kB gzip.
  - Lazy host-only QR chunk: 25.88 kB raw / 10.17 kB gzip.
  - CSS: 22.39 kB raw / 5.82 kB gzip.
  - Existing local fonts: 57.7 kB total; hero WebP: 86.1 kB.
- `BUILD_SHA=d159834821ffe5a49acef6b179d1ba74d536a8ff cargo build --release --locked`: passed.
- `node tests/claims.mjs`: all 11 tagged claims passed from clean demo contexts.
- `npm run test:e2e`: real host + Ward + Surge creation, start, build, and both share actions passed.
- `BROWSER_JOIN_ATTEMPTS=20 npm run test:browser-joins`: 20/20 isolated 1366px-host/390px-phone joins passed.
- `npm run test:browser-quality`: one h1, keyboard skip link, 3px focus ring, 390px no-overflow, reduced motion, same-origin privacy, no console errors, and response headers passed.
- `npm run test:a11y`: home, demo, host, join, privacy, terms, high contrast, reduced motion, and connected-controller states each had 0 axe violations.
- `npm run test:pwa`: shell precache, same-URL update, stale-cache cleanup, and 390px cold offline reload passed.
- `npm run test:rate-limit`: page views admitted 20 and rejected 5; WebSockets admitted 111 and rejected 29. Rejections returned 429 under the established response contract.
- `/opt/fleet/lib/verify-url.sh` on `/` and `/demo`: HTTP 200, correct titles/lang, one h1, main landmark, complete alt text, no unlabeled buttons, and no console errors.
- 100 concurrent `/health` requests: 100/100 HTTP 200 in 116 ms (861 requests/second in the local container).
- Lighthouse 13 mobile navigation audit: Performance 98, Accessibility 100, Best Practices 100, SEO 100; LCP 2.4 s, CLS 0, TBT 0 ms.
- Visual inspection at 1440×1000 and 390×844 covered home and demo. Both widths had zero horizontal overflow; the demo banner, battle state, role markers, and controls were readable and unclipped.

## Claim and demo commands

Run every claim:

```sh
npm run test:claims
```

Run one exact claim:

```sh
npm run test:claims -- --grep @claim:demo-isolation
```

The demo contract, seed, storage namespace, reset behavior, and offline fallback are documented in `.factory/demo.md`.

## Deployment

The checked container workflow deployed the repair with:

```sh
scripts/deploy-container.sh d159834821ffe5a49acef6b179d1ba74d536a8ff
```

The script builds the image with the exact SHA, updates `sf-coop-boss-access`, enforces `minReplicas=1` and `maxReplicas=1`, checks public `/health`, observes the control-plane invariant three times, and runs 20 live browser joins.

Deployment evidence:

- ACR run `ch1cv` built and pushed `sociobotregistry.azurecr.io/sf-coop-boss-access:d159834821ff` with digest `sha256:c33c4aa09cecca70696c672fb176f1c9a3456419893ebe1571dc2e95e58c1c84`.
- The deployment script observed the exact build on one healthy latest-revision replica four times and completed 20/20 isolated live browser joins.
- Public `/health` returned `{"build":"d159834821ffe5a49acef6b179d1ba74d536a8ff","status":"ok"}`.
- Live `/` and `/demo` verification returned HTTP 200 with correct per-route titles, `lang=en`, one h1, a main landmark, complete image alternatives, no unlabeled buttons, and no console errors.
- Live real-room E2E passed Ward and Surge join/start/build/share behavior.
- Live one-click demo testing passed the deterministic seed, both role effects, reset, no demo page-view write, unchanged real client ID, and no cookies.
- Live browser quality, response policy, 390px keyboard/reduced-motion checks, and PWA update/offline reload passed.
- Live axe found 0 violations in all nine home/demo/host/join/legal/settings/controller states.
- Live rate limiting admitted 20 page views and rejected 5; it admitted 120 WebSockets and rejected 20.

## Known gaps

- The brief's 80% mixed-ability success measure still requires a moderated human playtest. Automated checks verify the cues and controls, not the study outcome.
- Process-local real rooms still require one production replica. This is an intentional documented topology constraint, not a new repair limitation.
