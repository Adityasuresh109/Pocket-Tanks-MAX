# BARRAGE / Pocket Tanks MAX — Audit R2 Report

**Build audited:** commit `8d8d1b3e` "BARRAGE R2: address Zuko's gameplay and terrain audit findings" on `main`
**Live deploy:** verified updated (Pages serves the R2 frontend — BURIED label present; live engine has the new SPAWN_X). Note: `/health` still returns `version:"r1"` — a stale literal in the worker code, cosmetic only.
**Auditor:** Zuko · **Date:** 2026-11-19 · **Contract:** BUILD_BRIEF.md §9 + AUDIT R1 fix list (7 items) + owner ruling on check 6 (2026-11-19)

## VERDICT: NOT PRODUCTION READY — much closer. 10 of 13 checks now pass or are closed out; pacing is still the blocker.

R2 is a serious, honest round: every R1 fix item was attempted, the builder's new tests are real, and the builder again declined to tick any boxes itself. Most of the terrain/weapon debt is paid. What remains is the thing the owner ruled on: **matches still don't reliably produce a clear winner inside the limit** — and the builder's answer to that (a mercy rule) is a new mechanic that needs the owner's sign-off.

## R1 fix list — auditor disposition
| # | R1 fix item | R2 disposition |
|---|---|---|
| 1 | Match pacing / decisive win | **NOT CLOSED.** Builder added an "overwhelming advantage" early win (see below) but still did not measure a full match. Auditor bot evidence below says check 6 still fails as specified. |
| 2 | Napalm pool | **CLOSED — verified independently.** Auditor probe (own geometry): pool spread 432→556px on flat ground and stopped dead at a concrete wall (x=560); a tank standing in the pool took exactly 18 (120→102); a tank behind the wall took 0. Pool events are emitted and rendered as flames on the TV. |
| 3 | Dirt Ball burial + Excavator rescue | **CLOSED — verified independently.** Auditor chain: Dirt Ball drop → `buried=true`, movement returns 0, buried tank still fires (trace present, muzzle correctly placed above the roof), Excavator drop → `buried=false`. Phone UI disables movement and shows BURIED; TV draws a BURIED tag. |
| 4 | Spawns per §3.3 | **CLOSED.** SPAWN_X = 90/185/275/365/450/535 → gaps 95/90/90/85/85 (≥80 everywhere, was 56). Forts: concrete bunker roofs over S2/S5, rock mesa in front of S3, trench at S4. Canyon: rock pillar + overhead ledge on S1/S3/S4. Hollow: S3/S4 spawn in underground pockets with a concrete floor and a real exit corridor. Terrain is built on one half and mirrored cell-for-cell; auditor confirmed covered/open status per slot per map. |
| 5 | Splitter ±6° | **CLOSED.** Code: submunitions at i×3° for i in −2..2 = ±6° total spread (was ±12°). |
| 6 | Minor bugs | **CLOSED.** Turn-limit tiebreak now HP → alive count → sudden death (code). Kill attribution is per-projectile via `killsBy` (builder test + auditor code read). Edge-clamped movement no longer drains fuel (builder test). Projectiles now resolve direct hits against any tank (with a 0.075s self-protection window). |
| 7 | Test gaps | **CLOSED.** Suite is now **22/22 green** (auditor re-ran locally): simulated (not formula) anchor test — builder-measured 977.575px vs 980 ±19.6; host-disconnect-during-aim test (alarm frozen, remaining time retained, no shot fires); Earthquake continuity test. Auditor regression probes also re-passed on the new engine: concrete-roof cover (roof shot → 0 damage beneath; no-roof control → 31 damage), mid-air collision (crossing shots airburst together at (640,357), 0 damage), damage cap suite retained. |

## §9 status after R2
- **PASS:** 1, 2, 3, 4, 5, 8, 9, 10 (unchanged from R1, regressions re-verified where the engine changed)
- **Check 7 (terrain & tanks): PARTIAL → nearly closed.** Napalm ✓, burial ✓, Excavator ✓, Earthquake ✓ (auditor: path follows unbroken surface, concrete segment cuts it, contact damage exactly 20), fall damage ✓, rock/concrete durability ✓. **Remaining:** Roller stopped-by-trench and Bouncer surface behaviour are still untested approximations (builder admits this).
- **Check 6 (match length + owner ruling): NOT PASSED.** See pacing evidence.
- **Checks 11/12: PARTIAL (unchanged).** R2 live deploy verified by content markers; live match-phase flow still not exercised (needs two devices).
- **Check 13: OPEN** — owner's real-device rehearsal.

## Pacing evidence (auditor bot matches, Forts, worker endgame rules applied)
Three bot skill models, because one bot proves nothing:
1. **Weak bots** (fixed angle, power-only learning, R2 spawns): 40 turns, HP decision **691 vs 687**, nobody dead. Damage throughput collapses when aim can't adapt — the spread-out spawns punish one-dimensional aim.
2. **Dial-in bots** (solver-grade aim vs current terrain + human-like error that shrinks after hits — an upper bound on party skill): both matches were bloodbaths (576 and 640 damage dealt) yet **both still ended in 40-turn HP decisions** — 144 vs 80 (alive 2v1) and 221 vs 164 (alive 2v2). Even near-wipes don't finish: the endgame drags because squads shrink as tanks die (fewer shots per turn) and the 40-per-volley cap means a fresh last tank needs 3 focused volleys minimum.
3. **One-sided match** (only one team can aim): the new mercy rule triggered exactly as designed at turn 24 — Red 720 HP / 6 alive vs Blue ~300 HP / 4 alive.

**Conclusion:** the mercy rule fixes blowouts, but between evenly matched teams the game still ends in exactly the turn-limit HP decision the owner ruled a failure. Check 6 needs real tuning, not just a measurement: candidates within the brief's caps include checking the mercy lead more often / at a lower threshold in the endgame, merging squads after turn 30 so survivors fire every turn, or sudden-death starting earlier. Builder to propose; owner to approve any rule change.

## New items needing the owner / builder
- **N1 — Mercy rule is a new mechanic, not in the brief.** "After 24+ squad turns, a team ahead by ≥360 HP and ≥2 living tanks wins immediately." It serves the owner's decisive-win ruling and the auditor's one-sided test confirms it works. **Owner sign-off required** (accept, adjust thresholds, or remove).
- **N2 — First-mover advantage.** Red starts every match, including every match of a best-of series (`startMatch` always opens with team 0). Both dial-in bot matches were won by Red. Recommend alternating the starting team by match number in a series.
- **N3 — Cosmetic.** `/health` still reports `version:"r1"`.
- **N4 — Docs.** BUILD_NOTES says "Branch: fix/r2-audit-gameplay. PR to be opened" — the commit landed directly on `main` again (same inconsistency as R1's "PR #2"). Harmless; keep the notes accurate.

## Fix list for R3 (short)
1. **Check 6 tuning:** propose and measure an endgame change so evenly matched 6v6 matches end decisively inside the limit (see candidates above); report turns, win type, and final margins for at least 3 full matches (bot or human).
2. **Roller/Bouncer:** tests for trench-stop and surface behaviour per §6, or a brief amendment.
3. **N2:** alternate starting team per match in a series (if owner agrees).
4. **N3/N4:** bump the health version literal; keep BUILD_NOTES branch/PR text accurate.
5. Checks 11/12/13 remain: live match-phase verification happens at the owner's rehearsal (≥4 phones + TV), which also settles check 6 with humans.
