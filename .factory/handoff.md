# Co-op Boss Access — repair 7 handoff

Date: 2026-09-05

Production: <https://coop-boss-access.sociobot.in>

## Release status

**PASS for the repaired technical release.**

Implementation SHA: `62841a267e202aac67ac6c38a7bb6363ed259e22`
Documentation/test base SHA: `f05b7a3e0bf2795c614e1bf4068aaad669527810` (later handoff-only commits do not change the live image).

The live image is `sociobotregistry.azurecr.io/sf-coop-boss-access:62841a267e20` on revision `sf-coop-boss-access--0000016`. Read-back deployment verification reports `minReplicas=1`, `maxReplicas=1`, and exactly one running latest-revision replica. This restores reliable process-local rooms and makes the in-memory rate counters effective at the public service boundary.

## What changed

- Claim commands now compile Rust before their server-readiness window begins. `npm run test:claims:cold` runs the documented claim command with a brand-new `CARGO_TARGET_DIR` and passed.
- Added an executable WebSocket-upgrade boundary check. The local router test proves 120 immediate upgrades reach the handler and the 121st receives `429` with `Retry-After`; the live raw-upgrade check observed exactly 120 `101` responses and one `429` with `Retry-After` for a fresh forwarded client address.
- The release command now checks both page-view and WebSocket rate limits after deployment, rather than page views alone.
- Declared the fleet `/data` mount in `.factory/container-deploy.json`. The server uses `/data/coop.db` when mounted and retains a `data/coop.db` local fallback, with a startup log that identifies the selected source. SQLite still stores only the anonymous daily count.
- Removed README capacity and WebSocket-limit promises that were not listed in the claims contract.
- Added a reusable desktop-and-phone first-read test. It verifies the job, audience, and **Try it with sample data** action are visible before scrolling; it then plays, resets, and exits the isolated demo without another page view.
- Added the required catalog description in `.factory/catalog-description.txt` and copied it to `/work/.evidence/catalog-description.txt`.

The Container App update used the existing product app and changed only its image and one-replica bounds; its existing volume, environment, and probe configuration were preserved. The runtime is ready to use the fleet-created `/data` mount on each deployment.

## Verification

Clean local setup and release build:

```sh
npm ci
npm test
npm run check
npm run build
BUILD_SHA=62841a267e202aac67ac6c38a7bb6363ed259e22 cargo build --release --locked
```

All passed. `npm test` includes 8 TypeScript tests, 9 Rust tests, PORT-only startup, local SQLite fallback persistence, and the WebSocket `429` regression.

Claim and local browser checks passed:

```sh
npm run test:claims
npm run test:claims:cold
APP_URL=http://127.0.0.1:18081 npm run test:rate-limit
WS_URL=ws://127.0.0.1:18081/ws npm run test:e2e
APP_URL=http://127.0.0.1:18081 BROWSER_JOIN_ATTEMPTS=20 npm run test:browser-joins
APP_URL=http://127.0.0.1:18081 npm run test:a11y
APP_URL=http://127.0.0.1:18081 npm run test:browser-quality
npm run test:pwa
```

All 12 declared claims passed. The local rate check returned 20 page-view `204`, 5 page-view `429`, 120 WebSocket `101`, and 1 WebSocket `429`, with `Retry-After` on every rejection. The 20 local isolated browser joins, full Ward/Surge action flow, axe sweep, mobile/keyboard/reduced-motion checks, and cold offline PWA reload/update all passed.

The deployed implementation was built and released with:

```sh
scripts/deploy-container.sh 62841a267e202aac67ac6c38a7bb6363ed259e22
scripts/verify-container-release.sh 62841a267e202aac67ac6c38a7bb6363ed259e22
```

The release command passed the exact health identity, one-replica deployment invariant, public page-view boundary (20 `204`, 5 `429`), 20 protocol joins, and 20 isolated desktop-host/phone-controller joins. A separate live WebSocket test with a fresh forwarded client observed 120 `101` upgrades then one `429` carrying `Retry-After`.

Fresh live phone and desktop browser checks also passed:

```sh
APP_URL=https://coop-boss-access.sociobot.in npm run test:first-read
APP_URL=https://coop-boss-access.sociobot.in npm run test:a11y
APP_URL=https://coop-boss-access.sociobot.in npm run test:browser-quality
APP_URL=https://coop-boss-access.sociobot.in npm run test:pwa
```

The first screen plainly states the job (beat a boss together with phone controls), audience (friends sharing one screen), and first action (try the sample). The live demo shows its persistent sample label, starts with Mina and Ivo, boosts, resets, exits, and does not add a demo page view. Live axe found zero serious or critical violations on all public routes, high contrast, reduced motion, and a connected controller. `/opt/fleet/lib/verify-url.sh` passed home and demo with no browser errors, valid titles, `lang=en`, one H1, main landmarks, and complete image alt text. The designed unknown route returns HTTP 404.

## Remaining work

- The researched success measure still needs a moderated mixed-ability human playtest: 80% of players identifying their role and contributing within 30 seconds, and groups completing a round without facilitation. Automation verifies the cues and controls, not that human outcome.
- The product remains free and has no billing offer or external paid dependency.
