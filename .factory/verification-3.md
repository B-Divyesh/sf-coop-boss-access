# Independent product verification 3 — FAIL

**Date:** 2026-08-28

**Candidate:** `b4f88c9a7f5fb8de0c04200cfa4171b58b899b40`

**Production URL:** <https://coop-boss-access.sociobot.in>

**Work order:** `coop-boss-access-verify-3`

## Release verdict

**FAIL. Do not accept this release.** The public artifact identifies as the
candidate and the candidate works in a single local process, but the live
deployment again permits three replicas while game rooms live only in one
process. In a real-device-like browser test, **11 of 12** phones failed to join
the room shown by their host. This is a P0 failure of the smallest useful
product.

The builder's prior handoff says production was capped at one replica. Fresh
read-only deployment evidence contradicts it: revision
`sf-coop-boss-access--0000005` has `minReplicas=1`, `maxReplicas=3`, and all
three replicas were active during this verification.

## Defects

### P0 — Public phones are routed away from their process-local room

The server stores rooms in `Arc<RwLock<HashMap<String, Room>>>`; there is no
shared room store. Production is configured to scale to three replicas.

Fresh reproduction:

1. Open `/host` in a new desktop browser context and wait for its room code.
2. Open `/join?room=<code>` in an independent 390×844 browser context, as a
   separate phone would, enter a valid name, and choose **Join the team**.
3. Repeat with fresh host and phone contexts.

Result: **1/12 joined; 11/12 returned “Room not found. Check the
four-character code and try again.”** A separate invalid-room-then-correct-room
recovery attempt also failed because the correct room was not visible on the
replica handling the phone.

Deployment evidence from read-only Azure CLI calls:

```json
{
  "image": "sociobotregistry.azurecr.io/sf-coop-boss-access:b4f88c9a7f5f",
  "revision": "sf-coop-boss-access--0000005",
  "scale": { "minReplicas": 1, "maxReplicas": 3 },
  "runningStatus": "Running"
}
```

`az containerapp replica list` returned three replicas of revision 5, created
at `03:49:09Z`, `04:08:32Z`, and `04:10:03Z`.

The repository's raw `npm run test:join-reliability` passed 20/20 publicly,
but it creates every WebSocket from one Node process and does not model
independent phones. It is therefore not a sufficient deployment regression
test.

**Required fix:** enforce exactly one replica and verify that the setting
survives the release process, or move rooms and broadcasts to shared realtime
state. Retest with at least 20 independent browser/network contexts, not only
multiple sockets from one process.

### P1 — Public room creation has no rate limiting

The backend contract requires edge rate limiting. `Cargo.toml`, `Cargo.lock`,
and `src/main.rs` contain no governor or other rate limiter. Any unauthenticated
client can create and hold an unbounded number of rooms/WebSockets in the
in-memory map. Input size is capped and values are validated, but allocation
rate and concurrent room count are not bounded. A conservative public probe
also received 12/12 immediate `204` responses from `/api/pageview`; no
high-volume attack was attempted.

**Required fix:** rate-limit room creation/join and the page-view endpoint,
bound concurrent rooms/connections, and add rejection/load tests.

### P2 — Default startup suppresses the mandatory configuration log

Starting the release binary in a clean temporary working directory with only
`PORT=18082` succeeded, created `data/coop.db`, and served the candidate SHA,
but emitted no startup line. The only configuration message is logged at
`INFO`, while `EnvFilter::from_default_env()` suppresses it when `RUST_LOG` is
unset. The runtime contract requires a startup line identifying generated vs.
supplied configuration with no environment beyond `PORT`.

### P2 — Stable public assets cannot reliably update

`scripts/build-sw.mjs` derives the service-worker cache version only from the
list of asset URLs, not their contents. The art, fonts, and favicon use stable
URLs, are precached cache-first, and are served with one-year `immutable`
caching. Changing only one of those files produces the same worker cache key,
so an installed client can retain the old file for up to a year. The current
offline/update regression passes because it injects an artificially different
cache name; it does not cover same-URL content replacement.

**Required fix:** content-hash every immutable asset or include file content
digests in the worker version, then test a real changed-asset update.

### P2 — HTTPS responses omit HSTS

HTTP redirects to HTTPS and CSP, `nosniff`, frame denial, and `no-referrer`
are present. `Strict-Transport-Security` is absent from all sampled public
responses. Add HSTS at the ingress or application once the whole hostname is
HTTPS-only.

### P3 — Pasted room codes can lose valid characters

The room-code input applies `maxlength="4"` before its sanitizing input
handler. Pasting `a-b2c` results in `AB2`, not `AB2C`, because the browser
truncates the raw five-character value before punctuation is removed. The
resulting validation message is recoverable, but this creates avoidable join
friction.

## Candidate and deployment identity

- The checkout was clean at the candidate and matched `origin/main` before QA.
- Live `GET /health` returned
  `{"build":"b4f88c9a7f5fb8de0c04200cfa4171b58b899b40","status":"ok"}`.
- The live image tag is `b4f88c9a7f5f` and revision 5 is healthy.
- Live `index.html`, `sw.js`, built JS, and built CSS were byte-for-byte equal
  to the local candidate build. SHA-256 examples: index
  `fe61249a61a5da4af38b362ac9b86246b92849e90dc5e08619da6807bba80fcd`;
  JS `c4b557e910378f2f1d6a66dd8cc547b6fd71c8888f3de3f245725e372763eeab`.

The public artifact therefore matches the candidate; the failure is its live
runtime topology.

## Clean local verification

The initial tree was clean. Commands and results:

- `npm ci`: passed; 186 packages installed, 0 vulnerabilities.
- `npm test`: passed the release contract, 3 Vitest tests, and 4 Rust tests.
- `npm run check`: passed with 0 Svelte diagnostics and clean strict Clippy.
- `npm run build`: passed and generated a seven-file versioned worker shell.
- `BUILD_SHA=<candidate> cargo build --release --locked`: passed; local
  `/health` returned the exact candidate SHA.
- Local `npm run test:e2e`: host + WARD + SURGE started and shared both powers.
- Local `npm run test:join-reliability`: 20/20 joined.
- Local `npm run test:a11y`: all eight states had 0 serious/critical axe
  findings.
- Local `npm run test:pwa`: built JS/CSS/fonts were precached, an old named
  cache was removed, and a cold 390 px offline reload rendered the home page.
- Local `/health`: 100/100 requests succeeded at concurrency 25.
- Capacity/validation probe: players 1–8 joined with alternating WARD/SURGE;
  player 9 received `This room is full (8 players).`; invalid IDs, overlong
  names, and malformed JSON were rejected; host disconnect sent `room_closed`.
- Runtime with only `PORT`: booted successfully. The SQLite daily page count
  persisted across restart (`views=2`), while room state remained ephemeral.

Docker, Podman, Buildah, and nerdctl are unavailable in this verifier image, so
the multi-stage container could not be rebuilt locally. The locked release
binary and exact frontend production build were built, and the candidate-tagged
public container's identity was independently confirmed.

## Browser, accessibility, privacy, and performance evidence

- Public repository scripts: E2E passed once; raw join reliability passed
  20/20; PWA passed; axe found 0 serious/critical issues on `/`, `/host`,
  `/join`, `/privacy`, `/terms`, high contrast, reduced motion, and one joined
  controller. These passes do not supersede the independent-context P0.
- Factory `verify-url.sh`: passed in 619 ms at desktop and 390 px with no
  console/page errors, `lang=en`, one H1, a main landmark, alt text, and named
  buttons.
- Keyboard: first Tab focused **Skip to game** with a
  `rgb(255, 210, 63) solid 3px` outline; Enter moved focus to `#main`.
- Reduced-motion emulation reduced computed transition/animation duration to
  `1e-06s`. High-contrast and game motion toggles exposed correct pressed
  state and persisted locally.
- The 390 px home, host lobby, and joined controller layouts had no horizontal
  overflow. Controller action buttons were well over 44×44 px. At simulated
  200% zoom, both primary home actions remained visible.
- Local UI recovery covered empty and malformed room codes, empty and
  17-character names, a nonexistent room followed by a successful correct
  room join, disabled sharing before 40 charge, keyboard build/share, rejected
  late join, and host-close cleanup.
- Runtime browser requests across all routes were same-origin only: 36
  observed requests, one anonymous same-origin page-view POST per session, no
  third-party runtime origins, and no console/page errors. Fonts, scripts, and
  art are self-hosted; accessibility settings remain in local storage.
- Documents, deep links, worker, assets, and health returned 200. Documents and
  worker use `no-cache`; JS/CSS/fonts/art use
  `public, max-age=31536000, immutable`. Unsupported methods returned 405.
- Bundle sizes: 85,487 B JS (32.66 kB gzip), 20,060 B CSS (5.41 kB gzip),
  57,704 B fonts total, and 86,068 B hero WebP. All stated budgets pass.
- Fresh mobile Lighthouse: **98 performance, 100 accessibility, 100 best
  practices, 100 SEO**; FCP 1,508 ms, LCP 2,242 ms, CLS 0, TBT 84 ms.
- The product-specific night-market visual system is implemented consistently;
  role color is redundant with shape, label, position, and pattern. The visual
  inspection found no clipping or illegible critical state at desktop or
  390 px.

## Acceptance conclusion

The source candidate is locally healthy and the live files match it, but the
deployed product does not perform its defining host-plus-phone job reliably.
Fix the P0 topology issue and rerun independent-device joins before release.
The brief's mixed-ability 80%/30-second playtest metric also remains a manual
validation requirement after the technical blocker is resolved.
