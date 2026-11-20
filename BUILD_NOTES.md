# BARRAGE — Build R1 implementation notes

**Branch:** `build/r1-playable-foundation`  
**Status:** Implemented foundation; NOT production-ready; awaits GitHub Actions, live Worker, real-browser and auditor checks.

## Source and deployment

- `frontend/index.html`, `frontend/styles.css`, `frontend/main.js`: responsive landing and lobby, host TV battlefield, phone controls, match result screen, QR join link, connection status, optional original synthesized feedback sound.
- `shared/engine.js`: seeded terrain and deterministic 120 Hz projectile simulation, 12 weapon types, destructive terrain, 3 maps, projectile-vs-projectile interactions, cover sampling, capped damage and movement.
- `worker/index.js`: Cloudflare Worker, one SQLite Durable Object per room, per-seat reconnect keys, 12-player cap, balanced squads, hidden aim visibility, server-authoritative outcomes, replay events, host controls and timer alarms.
- `worker/wrangler.toml`: Worker configuration and Durable Object migration.
- `.github/workflows/release.yml`: verify first, deploy Worker, smoke health/create-room, then publish configured static site on GitHub Pages.
- `tests/engine.test.mjs`: core deterministic, safety and performance smoke checks.

### Deploy credentials (secret NAMES only)
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

GitHub Pages must have GitHub Actions configured as its publishing source. Do **not** guess the Worker URL: the release workflow writes `frontend/config.js` from the actual Wrangler deployment output.

### Local checks

```sh
npm run syntax
npm test
npx wrangler@4 deploy --config worker/wrangler.toml --dry-run
```

## Measured engine evidence — initial builder tests

1. Physics anchor: formula `v = 250 + 7.5 × power` with power 60, 45°, g=500, no wind or drag = **980 px** (test).
2. Three direct Big Bertha hits on one exposed target: **40 HP damage, 80 HP remaining** in first volley. Same volley again: **40 HP damage, 40 HP remaining**. Both satisfy anti-wipe rule (test).
3. Five-point concrete-ray cover multiplier: **0.0 fully covered**, **1.0 unobstructed** (test).
4. Rail Slug at max power impacts a **12 px rock barrier** at **x=300.84** rather than tunnelling through. Rock material remains (test).
5. Seeded replay of identical input: projectile event log, grid and tank state identical (test).
6. One 12-tank simulation volley ran to completion; full live 6v6 match-duration evidence **not yet measured**.
7. Tests executed in a V8 JavaScript harness: **10/10 passed**. GitHub Actions Node and Wrangler checks have not yet been confirmed.

## Changes from the original locked brief (owner's later design discretion)

- **Logical resolution:** 1280×720 rather than 1920×1080; material cells are 4 px. Chosen for predictable browser performance and smaller state transfers. This can be revisited after benchmarking.
- **Simulation authority:** physics runs once in the Cloudflare room Durable Object, not in the TV host. This prevents a compromised or disconnected host from deciding authoritative hits and keeps reconnect independent from the host browser.
- **Host recovery semantics:** a host disconnect during an aiming turn pauses and later resumes the timer. A volley that has already been resolved server-side keeps its result and can be replayed when the host reconnects.
- **Art direction:** original noir-and-gold presentation; no proprietary Pocket Tanks artwork or audio.
- Some weapon effects are initial approximations pending live balance and visual audit (notably rolling surface behavior, burrower, napalm surface flow, and earthquake continuity).

## Auditor checklist — all pending independent verification

- Real create/join/QR render **at 0 players**
- Real WebSocket host + players: 2–12 phones; seat reclaim; no aim data in opponents' frames
- 6v6, 5v5, 4v4 squad order across eliminations and disconnects
- Browser UI test at actual iOS Safari viewport size, Android Chrome, TV fullscreen
- Map cover, tunnel behavior, weapon-specific trajectories and per-surface interactions
- Volley playback synchronization and no dropped events
- Full-match duration, turn limit and series winners
- Console error sweep, performance and network resilience
- Complete live Wi-Fi rehearsal on at least four phones and a TV

**Builder verdict:** implementation foundation committed for review, but not yet audit-passed or production-ready. Zuko should open numbered issues for failed checks, citing reproductions and measurements. No audit boxes ticked by the builder.
