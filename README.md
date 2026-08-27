# Co-op Boss Access

Co-op Boss Access is a free, accessible local-room boss game for friends sharing one big screen and using their phones as two-button controllers. One role builds and shares shields; the other builds and shares damage boosts. Shape, text, position, pattern, and optional ground markers make the action readable without relying on depth perception, color, or motion alone.

Live product: <https://coop-boss-access.sociobot.in>

## Play

1. Open the site on a laptop, television browser, or projected screen and choose **Host a game**.
2. On at least two phones, scan the QR code or visit `/join` and enter the room code.
3. Once both WARD and SURGE roles are present, start the three-minute round.
4. Each player builds 40 charge, then shares their team effect. Ward shields the next hit; Surge speeds every automatic team strike.

Rooms support 2–8 controllers. Room codes, display names, roles, and game state live only in server memory and vanish when the host disconnects. Browser-only display preferences are never sent to the server. See [`/privacy`](https://coop-boss-access.sociobot.in/privacy) for the full policy.

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
```

The server reads `PORT`, `DATABASE_URL`, `DIST_DIR`, and `RUST_LOG`. SQLite stores only an anonymous aggregate page count per UTC day. The default database is `data/coop.db`.

## Container deployment

The production image builds the Svelte client and release Rust binary, runs as a non-root distroless user, serves both from port 8080, and writes SQLite under `/app/data`.

```sh
docker build -t coop-boss-access .
docker run --rm -p 8080:8080 coop-boss-access
curl http://localhost:8080/health
```

Mount `/app/data` only if the anonymous daily page count should survive restarts. Game rooms are always ephemeral.

## Accessibility and controls

- All standard controls work with Tab, Shift+Tab, Enter, and Space and have visible focus states.
- Phone actions are native buttons with large touch targets.
- The host can enable ground markers, high contrast, and reduced motion at any time. OS-level reduced motion is also honored.
- Role identity and battle state never depend on color alone.
- The UI supports narrow 390 px screens and 200% text zoom without a separate app.

The original night-market scene was generated specifically for this product. Its source, prompt, and review notes are in `assets/src/`; the complete visual rationale and provenance are in [`.factory/design.md`](.factory/design.md).

## Architecture

- Svelte 5 + TypeScript + Vite client
- Rust 2021, Axum, Tokio, in-memory WebSocket rooms
- SQLite via SQLx for anonymous aggregate page count only
- Same-origin static and WebSocket service in production
- No accounts, matchmaking, chat, ads, payments, runtime CDN assets, or third-party analytics

## License

MIT. See [LICENSE](LICENSE).
