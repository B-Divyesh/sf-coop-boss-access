# Co-op Boss Access demo

Open <https://coop-boss-access.sociobot.in/demo> or add `?demo=1` to the home URL. The first-screen **Try it with sample data** button opens the same sandbox in one click.

The sample starts inside a battle with Mina as Ward and Ivo as Surge. Mina has 30 charge, Ivo has 40, and the team needs a shield before the next dragon hit. Use each sample phone control to build charge and share its team effect.

The server creates an unguessable `demo:` workspace in memory. It is outside the four-character real-room namespace, cannot be joined by real controllers, expires within 24 hours, and is deleted when the demo socket closes. Its state never enters SQLite. If the connection is offline, the bundled seed and the same controls run in browser memory.

Display changes made during the sample use `sessionStorage` keys under `demo:coop-boss:`. Demo entry does not read or change the real controller ID, real display preferences, or real controller name. It also skips the anonymous page-view write. **Reset demo** clears the demo namespace and restores the deterministic seed. **Start for real** deletes the demo namespace, closes the ephemeral workspace, and returns home.

Run every demo claim from a clean build with:

```sh
npm run test:claims
```
