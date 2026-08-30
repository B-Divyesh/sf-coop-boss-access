# Co-op Boss Access

Co-op Boss Access is a free local-room boss game for friends sharing one screen. Phones become two-button controllers without accounts. Ward shares shields, while Surge boosts team strikes. Words, shapes, position, markers, and accessible values reinforce every role cue.

Live product: <https://coop-boss-access.sociobot.in>

## Play

Try the isolated sample first at <https://coop-boss-access.sociobot.in/demo>. It opens with Mina and Ivo in a live battle. **Reset demo** restores the sample, and **Start for real** discards it.

To play with friends:

1. Open the site on a laptop, television browser, or projected screen and choose **Host a game**.
2. On at least two phones, scan the QR code or visit `/join` and enter the room code.
3. Once both WARD and SURGE roles are present, start the three-minute round.
4. Each player builds 40 charge, then shares their team effect. Ward shields the next hit; Surge speeds every automatic team strike.

Rooms support 2–8 controllers and three-minute rounds. Room codes, display names, roles, and game state live only in server memory. The room vanishes when its host disconnects. Browser display preferences are not sent to the server. See [`/privacy`](https://coop-boss-access.sociobot.in/privacy) for the full policy.

The installed service-worker shell reloads the sample offline after its first visit. Offline sample actions run only in browser memory.

## Run locally

Requirements: Node.js 22+, npm, and stable Rust.

```sh
npm install
npm run dev
```

This starts Axum on `http://localhost:8080` and Vite on `http://localhost:5173`; Vite proxies API and WebSocket requests to Axum. Open the Vite address for development.

Useful commands:

```sh
npm test       # Vitest and Rust tests
npm run check  # Svelte diagnostics and strict Clippy
npm run build  # reproducible frontend output in dist/
cargo run      # serve dist/ and the backend on PORT (default 8080)
npm run test:pwa  # 390 px cold-offline reload and service-worker update regression
npm run test:claims  # every visitor-facing claim from a clean demo sandbox
npm run test:join-reliability  # 20 independent host/controller joins (server required)
npm run test:browser-joins  # 20 host/phone joins in isolated browser contexts
npm run test:rate-limit  # rejection load for page views and WebSocket registration (server required)
npm run test:browser-quality  # mobile, keyboard, reduced-motion, privacy, network, and headers
```

The server reads `PORT`, `DATABASE_URL`, `DIST_DIR`, and `RUST_LOG`. SQLite stores only an anonymous page count per UTC day. Demo visits are not counted. The default database is `data/coop.db`.

## Container deployment

The production image builds the Svelte client and release Rust binary, runs as a non-root distroless user, serves both from port 8080, and writes SQLite under `/app/data`.

```sh
docker build -t coop-boss-access .
docker run --rm -p 8080:8080 coop-boss-access
curl http://localhost:8080/health
```

Mount `/app/data` only if the anonymous daily page count should survive restarts. Game rooms are always ephemeral. The deployed Container App is deliberately capped at one replica (`minReplicas=1`, `maxReplicas=1`): room state is live only in the host process, so scaling this v1 service horizontally would route controllers away from their host. Move room state to a shared realtime store before increasing that limit.

Production releases use the checked deployment command. It builds with the full Git SHA, applies the one-replica invariant, and checks the live control plane. It then observes the invariant three times and runs 20 host-and-phone joins in separate browser contexts:

```sh
scripts/deploy-container.sh "$(git rev-parse HEAD)"
```

The work-order deployer reads [`.factory/container-deploy.json`](.factory/container-deploy.json). A release fails unless Azure reports `minReplicas=1`, `maxReplicas=1`, exactly one running latest-revision replica, and the exact SHA from public `/health`.

The server admits at most 256 rooms and 2,048 live sockets per process. WebSocket registrations and anonymous page-view requests also have short per-network-address burst limits; rate-limit counters remain in memory and are never added to analytics.

## Accessibility and controls

- All standard controls work with Tab, Shift+Tab, Enter, and Space and have visible focus states.
- Phone actions are native buttons with touch targets at least 44 CSS pixels tall.
- The host can enable ground markers, high contrast, and reduced motion at any time. OS-level reduced motion is also honored.
- Role identity and battle state never depend on color alone.
- The UI fits narrow 390 px screens.

The original night-market scene was generated specifically for this product. Its source, prompt, and review notes are in `assets/src/`; the complete visual rationale and provenance are in [`.factory/design.md`](.factory/design.md).

## Architecture

- Svelte 5 + TypeScript + Vite client
- Rust 2021, Axum, Tokio, in-memory WebSocket rooms
- SQLite via SQLx for anonymous aggregate page count only
- Same-origin static and WebSocket service in production
- No accounts, matchmaking, chat, ads, payments, runtime CDN assets, or third-party analytics

## License

MIT. See [LICENSE](LICENSE).
