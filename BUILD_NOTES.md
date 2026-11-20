# BARRAGE — Build R1 implementation notes

**R1:** merged via PR #2 (`4f809cb`) and independently audited. **R2:** merged via PR #3 (`8d8d1b3e`), independently audited. **R3:** awaiting independent Zuko review. **Production readiness:** NOT YET SIGNED OFF.

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


---

## Build R2 — response to Zuko's independent AUDIT R1 report

**R2 history:** merged via PR #3 (`8d8d1b3e`). Zuko verified most R2 fixes. Remaining pacing and Roller/Bouncer issues addressed in R3 below.

### Implemented in this round
1. **Spawns:** slots S1–S6 separated by 90/90/90/85/85 px on both teams, with map-specific Forts bunker roofs, rock mesa and trench; Canyon pillars/ledges; Hollow diggable tunnel pockets and concrete supports. Terrain cells remain exactly mirrored after generation. Original 56px line-spawn removed.
2. **Napalm:** actual surface-following pool samples left and right up to 68px from impact, flows downhill/flat, stops on concrete or steep uphill steps, produces public pool events and visual flames, damages each touching tank once.
3. **Dirt Ball/Excavator:** adds material around a tank's hitbox without material overlapping the body; if covered by a dirt roof, marks the tank buried, prevents movement, places its firing muzzle above the roof, and frees it when an Excavator clears the roof. Physics test drives bury -> no movement -> rescue -> firing.
4. **Earthquake:** follows continuous terrain, respects concrete gaps/obstacles; now emits visible shock events and applies contact damage along the reachable path.
5. **Physics fixes:** Splitter spread now ±6°; no lost fuel when edge-clamped; protected direct-friendly tank hits included; exact per-projectile kill attribution tracked.
6. **Multiplayer efficiency:** uncommitted aim-slider events no longer rewrite a 57,600-cell room blob for every frame, material snapshot encoding cached per grid revision, player buried state carried to host and phone screens.
7. **Endgame experimental tuning:** when a team is ahead by at least 360 HP and at least two surviving tanks after 24+ squad turns, it can win by overwhelming advantage, rather than waiting for 40. Weapon damage ≤30 and each tank's volley cap stays 40. **This does not prove check 6.** A full 6v6 target-length match must still be recorded; late HP-only wins at the 40-turn limit remain a known owner-ruled failure risk and require further tuning if observed.

### Builder regression evidence (engine-level, not live)
- Original 3-Bertha anti-wipe, replay, occlusion, thin-wall and durability tests retained.
- R2 additional checks: six unique spawn slots, both-side symmetry, concrete-blocked Napalm, Dirt Ball buries / Excavator frees, Earthquake continuity, edge-fuel fix, exact kill attribution.
- Simulated **no-drag anchor** 45° and 60 power, 120Hz integration, flat surface: landing **977.575 px from muzzle** (expected 980±19.6).
- Existing R1 independent auditor passes remain the historical R1 result; do not silently tick Zuko's checklist for R2.

### Known limitations before sign-off
- Full 6v6 match 20–35 turns with decisive win not yet measured: check 6 still needs a convincing party/bot/human run.
- Roller/Bouncer mechanics have not yet had comprehensive surface interaction tests.
- No full 12-client live Wi-Fi test, iOS Safari phone test, or four-device/TV rehearsal yet.
- Outcome of live release and Zuko re-audit must be independently checked; code passing locally is not a final product.


---

## Build R3 — response to Zuko's AUDIT R2 and Issue #4

**Review:** PR #5. **Status:** builder verification; independent R3 audit and owner device tests pending.

### Deliberate design changes — for owner and auditor review

1. **Starting team alternates** by match in a series: Red / Blue / Red.
2. **Final Barrage from turn 16:** after four full cycles of ordinary Red A → Blue A → Red B → Blue B squad turns, all surviving tanks on a team fire together on that team's turn. Aim visibility remains limited to the active team; enemies and host never receive unlocked/locked aim before the volley.
3. **Twinshot Finale from turn 16:** each locked player fires a selected primary and one free echo shell offset by 2°. A Bertha primary generates a Bertha echo; other primaries generate a Single Shot echo. Only the primary uses inventory. Direct damage remains max 30, **per-target per-volley cap remains 40 HP**, including echoes and fall damage.
4. **Graduated mercy victory:** after turn 24, a ≥360 HP lead and ≥2 alive lead wins; after turn 27, ≥70 HP lead, ≥75% relative HP lead and ≥1 alive lead wins; after turn 35, ≥50 HP lead and ≥55% relative HP lead wins. No trivial HP difference can trigger mercy.
5. **Sudden Death arena at turn 30:** survivors redeploy to a flat, open centre battlefield, preserving their HP, team, inventory, stats and alive status. Red starts at x=300 and increases 50px per surviving seat; Blue at x=980 and decreases 50px. This prevents impossible shots between extreme edge survivors x=90 and x=1190, which in R2 produced indefinite 120HP-versus-120HP deadlocks. TV and phones announce this transition.
6. **Roller/Bouncer:** Roller follows ground with friction, stops at trenches/walls and detonates on tank contact; Bouncer has two physical ricochets before third-impact detonation. Regression tests added.
7. **Version and notes:** `/health` reports `r3`; old branch/PR status updated to match merged history.

### Measured 6v6 Forts outcomes

Twelve full simulated games use real Durable Object turn, inventory, lock, wind and projectile functions, with seeded aim-search bots and varying aim error. All results are reproducible with `node scripts/simulate-matches.mjs` (a release CI gate). These are **not** live device results.

| Seed | Starter | Turns | Victory | Red HP / alive | Blue HP / alive | Winner |
|---|---|---:|---|---|---|---|
| 101 | Red | 29 | Mercy | 159 / 2 | 87 / 1 | Red |
| 202 | Blue | 35 | Wipe | 0 / 0 | 11 / 1 | Blue |
| 303 | Red | 39 | Wipe | 38 / 2 | 0 / 0 | Red |
| 404 | Red | 35 | Wipe | 55 / 1 | 0 / 0 | Red |
| 505 | Blue | 27 | Mercy | 120 / 1 | 259 / 4 | Blue |
| 606 | Red | 27 | Mercy | 134 / 2 | 307 / 4 | Blue |
| 707 | Red | 27 | Mercy | 149 / 2 | 30 / 1 | Red |
| 808 | Blue | 27 | Mercy | 182 / 3 | 91 / 2 | Red |
| 909 | Red | 38 | Wipe | 0 / 0 | 62 / 1 | Blue |
| 111 | Red | 33 | Wipe | 28 / 1 | 0 / 0 | Red |
| 222 | Blue | 37 | Wipe | 0 / 0 | 40 / 1 | Blue |
| 333 | Red | 31 | Mercy | 229 / 3 | 125 / 2 | Red |

**Result:** 12/12 decisive results before turn 40; zero turn-limit HP decisions; 9/12 in the 20–35 turn target range. Three finished at 37–39 turns. No claim that all human players will achieve these outcomes.

### New automated regression coverage

- Starts Red / Blue / Red across successive matches.
- Both former squads can aim/lock after merging; opponent and host aim payload privacy remains intact.
- Twinshot doesn't deduct extra premium ammo, bypass the damage cap or invent weapons.
- Roller stops at a trench lip; Bouncer ricochets twice and explodes on the third ground impact.
- Sudden Death arena arrives only after 30 turns, with open sky, sufficient spacing and original HP/team/inventory state preserved.

### Remaining release blockers

Zuko must independently inspect endgame changes and verify the measurements. Mercy, Twinshot, the early squad merger and the Sudden Death arena are owner-facing deviations requiring review/acceptance. At least four actual phones plus a TV must complete a game. All 12-client live performance, real iOS Safari controls, full console sweep and match experience remain unverified until those tests occur. The auditor checklist is not changed by the builder.

---

## Build R4 — live turret angle and off-screen projectile feedback

**Source:** Zuko's owner-approved player feedback in Issue #6. **Branch:** fix/r4-live-turrets-high-arcs-camera. **Production sign-off:** NOT yet.

### Engine
Previously, the 120 Hz simulator destroyed projectiles as soon as their Y coordinate became negative (crossed the top of the visible screen). Negative Y is now valid sky. Shells continue under gravity, drag and wind until they return and impact, leave a side boundary, or time out at the existing 8-second safety cap. The standard damage/collision/cover and 40 HP-per-volley limit are unchanged.

New regressions fire 60°/100, 80°/100 and 70°/80 (the playtest failures), plus 90°/100, from an actual Forts spawn. Each must have exactly one explosion, at least two negative-Y trace frames, and a later in-frame trace point.

### TV-only angle disclosure (owner-ratified exception)
The authenticated host's state view now includes only `turretAngles: [{id,angle}]`, derived from the currently active firing team/squad while aiming. It updates on every phone aim input; lock-in is not required. Power, weapon and inventories remain private and absent from that field. Enemy and non-firing phones do not receive turretAngles; firing teammates still receive full private squadAim. Only the drawn barrel changes: the host cannot change any authoritative shot input.

The host view's new exception modifies audit check 3: angle is public on the TV only, while power and weapon remain restricted to the active firing squad until shots fire. Two consecutive angle changes, host secrecy and enemy privacy are now regression tested.

### Follow-the-shot TV camera
A new, pure `frontend/camera.js` tracks the highest live projectile in the public volley trace, including those above y=0. The host camera smoothly pans toward high arcs and back down to the arena after a landing. The original fixed TV HUD remains visible, with a sky-tracking indicator while the camera is elevated. The landing-page preview is static. The deployment workflow also adds a revision query to this new script to prevent old cached code.

### Auditor recheck
Test the live host + two phones for immediate angle updates and absence of power/weapon leakage; fire all three steep lob combinations to confirm their trajectories leave and re-enter and visibly pan the TV. Real-device performance, the 12-player load and remaining audit checks still require independent testing. Do not declare the game production-ready based on automated engine tests alone.

