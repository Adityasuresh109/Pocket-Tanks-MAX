# BARRAGE / Pocket Tanks MAX — Audit R3 + R4 Report

**Builds audited:** R3 `d4bdb202` (endgame showdown + pacing gate) and R4 `24301422` (high-arc fix, live TV turrets, camera) on `main`
**Live deploy:** verified R4 — `/health` reports `version:"r4"`, Pages serves `camera.js` and the turret-angle frontend.
**Auditor:** Zuko · **Date:** 2026-11-20 · **Contract:** Issue #4 (AUDIT R3 list), Issue #6 (player feedback + bug), §9 as amended by owner rulings

## VERDICT: NOT PRODUCTION READY — one owner decision and one rehearsal away

Everything technical on the list is now verified working, including the critical vanishing-shell bug and a reproducible pacing gate (18/18 bot matches decisive). The game is blocked on exactly two things, neither of them code: **(1)** the owner has not yet accepted the R3 endgame package — four new mechanics that change how matches play from turn 16 onward; **(2)** the real-device rehearsal (checks 11/12/13) still hasn't happened.

## Issue #6 (player feedback + bug) — all three items verified
- **B. Vanishing shells — FIXED, auditor-verified on the live engine.** The three playtest failures now land: 80°/100 → event at (532,365) with the trace reaching y=−272 (out of frame and back); 60°/100 → (1237,497), trace min y=−110; 70°/80 → (733,361), min y=−54. In-frame control shots unchanged. Suite: **36/36 green** (auditor re-ran), including builder regressions firing the exact failing combinations from a real spawn and requiring exactly one explosion each.
- **A. Live TV turret angle — implemented exactly as ruled.** Worker code read: `turretAngles` exists **only** in the host-role view, only during the aim phase, only for active firers, and carries only `{id, angle}` — power and weapon are structurally absent, not filtered on screen. Enemy and non-firing phones never receive the field; firing teammates keep the full private `squadAim`. Room tests assert host secrecy and enemy privacy and pass. **Check 3 PASSES under the owner's amended rule** (angle public on TV; power/weapon hidden).
- **C. Camera follow — shipped.** `frontend/camera.js` tracks the highest live projectile (including above y=0), pans the TV up and back down, with a sky-tracking indicator; verified present in the live deploy. Full visual confirmation rides along with the rehearsal.

## Issue #4 (AUDIT R3 list) — item by item
1. **Check 6 endgame tuning — CONDITIONAL PASS on evidence.** The builder's pacing gate reproduces on the auditor's machine: **12/12 decisive before turn 40, zero turn-limit HP decisions** (5 wipes, 7 mercy; 9/12 inside the 20–35 target band, the rest 37–39). The auditor then ran the same gate on **6 fresh seeds the builder never published: 6/6 decisive** (27–38 turns). Combined 18/18. Two honesty notes: (a) the bots aim with a physics predictor — strong players, not average party aim; the endgame machinery is structural (see below), so the direction should hold for humans, but the rehearsal is the real proof; (b) the BUILD_NOTES results table is **stale** — about half its rows no longer reproduce exactly (turns/HP differ), because R4's engine change altered match trajectories after the table was generated. The gate itself passes on current code; the table should be regenerated.
2. **Mercy rule** — graduated as proposed (see package below); thresholds verified in code.
3. **Alternating starter — DONE.** `startMatch` opens with team `(match−1)%2`; room test covers Red/Blue/Red.
4. **Roller/Bouncer — DONE.** Roller follows ground with friction, stops at trench lips/walls, detonates on tank contact; Bouncer ricochets twice, detonates on third impact; regression tests pass. **Check 7 now PASSES in full.**
5. **Cosmetics — DONE.** `/health` reports the current build (`r4` live). BUILD_NOTES still says "PR #5" / names a branch for work that landed on `main` — same nit as before, noted, not blocking.

## The R3 endgame package — OWNER DECISION REQUIRED
From turn 16 the game changes character. All four mechanics are verified working as described; none of them is in the brief; the caps (30/hit, 40/volley) are untouched.
1. **Final Barrage (turn 16+):** squads merge — every surviving tank on a team fires on that team's turn. (The auditor suggested squad-merging as a candidate, at turn 30; the builder chose turn 16, which means most of a match's second half is full-team volleys, not squad rotation.)
2. **Twinshot Finale (turn 16+):** every locked shot gets a free echo shell at +2° (Bertha echoes as Bertha). No inventory cost. This is the single biggest damage-throughput change.
3. **Graduated mercy:** turn 24+ crushing (≥360 HP + ≥2 alive) as before; turn 27+ "commander" (≥70 HP lead, ≥1 alive lead, lead ≥75% of the loser's HP); turn 35+ (≥50 HP lead, ≥55% relative). The late thresholds end games that are clearly one-sided but not blowouts.
4. **Sudden Death arena (turn 30):** if still unresolved, all survivors teleport to a flat open centre field (HP/inventory preserved) — kills the edge-to-edge sniper deadlock the R2 bots kept hitting.

Auditor's view: the package is coherent, it demonstrably produces decisive games, and each piece attacks a measured failure mode. The cost is real: the back half of every long match is a different game from the brief's squad-rotation design, and the arena teleport is a big theatrical swing. This is a taste call only the owner can make.

## §9 status after R3+R4
- **PASS:** 1, 2, 3 (as amended by the 2026-11-20 ruling), 4, 5, 7, 8, 9, 10
- **CONDITIONAL PASS:** 6 — evidence green (18/18), conditional on owner acceptance of the endgame package
- **PARTIAL:** 11, 12 — live flows verified in R1/R4 deploys; live match-phase + 12-client load still need real devices
- **OPEN:** 13 — owner's rehearsal (≥4 phones + TV), which also settles 6, 11, 12 with humans

## Remaining list
1. **Owner:** accept / adjust / reject the R3 endgame package (above).
2. **Builder (small):** regenerate the stale pacing table in BUILD_NOTES from current code; keep PR/branch text accurate.
3. **Owner's rehearsal:** ≥4 phones + TV on the live build — play one full match; confirm live turrets, camera follow, a decisive finish, and the host Remove-player button (still unverified since R1).
