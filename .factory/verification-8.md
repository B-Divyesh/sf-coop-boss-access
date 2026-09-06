# Verify the phone-controlled co-op boss game — verification 8

Date: 2026-09-06  
Work order: `coop-boss-access-verify-8`  
Live URL: <https://coop-boss-access.sociobot.in>  
Implementation reviewed: `62841a267e202aac67ac6c38a7bb6363ed259e22`  
Documentation and test head: `5d25f14d012a965a39fe1d4fb6147b6ec379932b`

## Verdict

**FAIL — 3 findings and 0 untested claims.**

The main game, isolated sample, real phone joins, accessibility settings,
offline sample, privacy boundaries, persistence, and live request limits work.
The release cannot receive PASS because the result dialog does not take keyboard
focus, the standard header/footer structure is incomplete, and required
install/social metadata is missing or the wrong size.

| Severity | Count |
| --- | ---: |
| P0 | 0 |
| P1 | 1 |
| P2 | 2 |
| P3 | 0 |
| Untested claims | 0 |

## First screen

Fresh desktop and phone browser contexts gave the same clear first read before
scrolling:

- Job: **Beat a boss together with phone controls**.
- Audience: friends sharing one screen, using phones as two-button controls.
- First action: **Try it with sample data**. The adjacent note says that two
  players are ready.

At 1440×900, the sample button ended at y=647.78 and its outcome note ended at
y=682.28. At 390×844, they ended at y=702.44 and y=802.44. Both were visible
without scrolling. One click opened the populated Mina/Ward and Ivo/Surge
battle. The persistent sample label, role output, reset, and exit all worked.
The demo added no page view and left seeded real storage unchanged.

## Findings

### P1 — the round-result dialog does not receive focus

I completed a real live round with a desktop host and two independent
controllers. When the round ended, the visible result was exposed as
`role="dialog"`, but `document.activeElement` was `BODY` and was not inside the
dialog. A keyboard or screen-reader user is not moved to the result or its
**Play another round** action. This fails the attached dialog focus-management
requirement.

Evidence: `/work/.evidence/round-result-focus.png`. The live assertion reported:

```text
{"tag":"BODY",...,"insideDialog":false}
AssertionError: focus must move into the round-result dialog
```

Required resolution: move focus into the result when it appears, provide the
correct modal/non-modal dialog semantics, and return focus predictably after
**Play another round**. Add a keyboard regression that waits for a real round
result.

### P2 — the required header and footer structure is incomplete

Every checked route had the home wordmark and skip link, but `header nav`
counted zero. Home, Join, Privacy, and Terms expose only **Join a room** beside
the wordmark; Demo and Host replace it with status text. The required stable
navigation to Demo, the main product area, and Privacy is absent.

The footer includes the product sentence, Privacy, Terms, Source, and build ID,
but omits the required **Built by Param Factory** attribution. The external
GitHub link is labeled only **Source**, without saying it opens an external
site.

Required resolution: use a consistent header navigation on every route and add
the required attribution and external-link wording to the footer.

### P2 — required install and social metadata is incomplete

The live document has no `link[rel="apple-touch-icon"]`. Its Open Graph image is
`/art/night-market-dragon.webp`, which is 960×640 rather than the required
1200×630 social image. It declares `twitter:card=summary_large_image` but no
Twitter title, description, or image fields.

The route title, description, canonical URL, SVG favicon, Open Graph title and
description, language, and theme color are present.

Required resolution: add a 180 px Apple touch icon, add an original 1200×630
social image derived from the product art, and provide complete Twitter card
metadata.

## Declared claims

Every command in `.factory/claims.json` was run individually after `npm ci`.
All passed. `npm run test:claims:cold` also passed with a new Cargo target,
proving that compilation completes before the readiness window.

| Claim ID | Result | Observed evidence |
| --- | --- | --- |
| `demo-one-click` | PASS | One click opened the seeded battle; banner, reset, exit, and `?demo=1` passed. |
| `role-effects` | PASS | Ward reached a 48% shared shield and Surge a 28% boost. |
| `demo-isolation` | PASS | Real keys stayed unchanged; demo used its own session key, no cookie or page-view write, and same-origin traffic only. |
| `offline-reload` | PASS | Fresh 390 px context reloaded `/demo` offline and shared Ward. |
| `temporary-rooms` | PASS | Closing the host made its old room code reject a later join. |
| `free-no-account` | PASS | Free/no-account copy, no password/payment flow, no cookies, and same-origin requests passed. |
| `redundant-role-cues` | PASS | Words, symbols, positions, markers, and named progress values were present. |
| `accessible-controls` | PASS | Keyboard skip, focus ring, 390 px layout, 44 px targets, reduced motion, and axe checks passed. |
| `local-preferences` | PASS | All three display settings stayed in browser storage and out of WebSocket frames. |
| `room-rules` | PASS | Eight controllers joined with balanced roles, the ninth was rejected, and the round began at 180 seconds. |
| `anonymous-page-count` | PASS | Demo skipped the write; the isolated SQLite integration stored only day and view count. |
| `per-client-rate-limit` | PASS | A fresh local client received exactly 20×204 then 5×429 with `Retry-After`. |

No live or README claim-like statement was found without coverage by those
claims. Static review also confirmed the documented 24-hour demo expiry; the
demo workspace test proves its isolation and deletion on disconnect.

## Live functional and recovery evidence

- Desktop and phone sample flow: played Surge, observed the 28% boost, reset to
  0%, and exited to the real start without an extra page-view write.
- Real game: Ward and Surge joined and shared both powers. Twenty independent
  desktop-host/phone-controller joins passed 20/20.
- Invalid and recovery flow: an empty room code produced the specific announced
  error; pasted `a-b2c!` became `AB2C`; the 16-character name boundary was
  accepted; an unknown room produced **Room not found**; correcting the code in
  the same phone flow joined as Ward.
- Room boundary: the claim test admitted 2–8 controllers, alternated Ward and
  Surge 4/4, rejected controller nine, and started at 180 seconds.
- The live demo used six same-origin requests, no `/api/pageview`, no cookies,
  and no changes to preseeded real keys.
- All product routes had the expected unique title, one H1, one main landmark,
  and canonical URL. Root, Demo, Host, Join, Privacy, Terms, robots, sitemap,
  fonts, art, favicon, worker, and the external source link resolved. The
  designed unknown route correctly returned HTTP 404.
- HTTP redirected to HTTPS. Live responses carried CSP, HSTS, `nosniff`, frame
  denial, and `no-referrer`; document and immutable-asset cache policies passed.

## Accessibility, mobile, offline, and performance evidence

- `/opt/fleet/lib/verify-url.sh` passed `/` and `/demo` with no console or page
  errors, correct titles and language, one H1, a main landmark, complete alt
  text, and labeled buttons. Desktop and mobile screenshots are under
  `/work/.evidence/verify-home/` and `/work/.evidence/verify-demo/`.
- Live axe reported zero violations of any impact on Home, Demo, Host, Join,
  Privacy, Terms, 404, high-contrast Host, reduced-motion Host, and a connected
  controller. The manual result-dialog focus finding remains because axe does
  not test that state transition.
- Keyboard skip navigation, a 3 px visible focus ring, 44 px controls, OS
  reduced motion, and no horizontal overflow at 390 px passed. Home, Demo,
  Join, Privacy, Terms, and 404 also reflowed without horizontal overflow at
  320 px.
- The live service worker passed shell precache, stale-cache removal, update,
  and a cold offline reload at 390 px.
- Fresh Lighthouse mobile scores were Performance 98, Accessibility 100, Best
  Practices 100, and SEO 100; LCP 2.2 s, CLS 0, TBT 0 ms, Speed Index 1.4 s.
- Built sizes were 67.67 kB main JS, 25.88 kB lazy QR JS, 23.54 kB CSS,
  57.70 kB fonts, and 86.07 kB hero art, within the stated budgets.

## Backend and release evidence

- `/health` returned HTTP 200 with build
  `62841a267e202aac67ac6c38a7bb6363ed259e22`.
- A build with that `VITE_BUILD_SHA` byte-matched the live main JS, CSS, and
  service worker by SHA-256. There are no product-source differences between
  the implementation SHA and the documentation head.
- The healthy serving revision is `sf-coop-boss-access--0000016`, using image
  tag `62841a267e20`, with `minReplicas=1`, `maxReplicas=1`, and exactly one
  running replica.
- A later documentation-head revision, `--0000017`, failed activation. The
  generic deployment verifier reads that failed template and therefore exits
  on a digest-versus-tag comparison. It did not replace the healthy serving
  implementation and is not classified as a product defect.
- After the live buckets refilled, page views returned exactly 20×204 and
  5×429, and WebSocket upgrades returned exactly 120×101 and 1×429. Every 429
  carried `Retry-After`.
- A local release process started with only `PORT`, logged configuration sources,
  created SQLite, accepted one page-view write, stopped, restarted against the
  same database, and retained exactly one row with `views=1`.
- `npm test` passed 8 frontend and 9 Rust tests; `npm run check`, `npm run build`,
  and `BUILD_SHA=62841a267e202aac67ac6c38a7bb6363ed259e22 cargo build --release --locked`
  passed. Docker was not installed in this worker; the locked release binary
  and exact live artifact were verified instead.

## Earlier finding disposition

| Earlier finding | Current disposition |
| --- | --- |
| Wrong public build identity | Fixed: exact health SHA, footer ID, and byte-matched live assets. |
| Blank cold offline reload and stale stable assets | Fixed: local claims and fresh live PWA update/offline regression passed. |
| Multi-replica routing broke phone joins | Fixed on the healthy serving revision: one replica and 20/20 independent joins. |
| Missing page-view/WebSocket limits | Fixed: exact live 20/5 and 120/1 boundaries with `Retry-After`. |
| Missing default startup configuration log | Fixed: PORT-only startup logged sources on both restart-persistence runs. |
| Missing HSTS | Fixed: live HTTPS response includes one-year HSTS with subdomains. |
| Punctuated pasted codes lost characters | Fixed: `a-b2c!` normalized to `AB2C` live. |
| Missing claims file and one-click sandbox | Fixed: 12 claims and isolated seeded demo pass. |
| Missing first-screen facts/action | Fixed: job, audience, action, and three facts fit desktop and phone first screens. |
| Unknown route returned 200 | Fixed: designed page returns HTTP 404 and offers a working return action. |
| Cold claim commands timed out | Fixed: cold-cache regression and all 12 exact commands passed. |
| Unlisted room/socket capacity promises | Fixed: removed from visitor-facing README copy. |

## Remaining evidence gap

The brief's mixed-ability human success measure still needs a moderated
playtest. This is not a public product claim and is not counted as an untested
claim above. Automation can prove cue presence and operability, not that 80% of
people identify a role and act within 30 seconds.
