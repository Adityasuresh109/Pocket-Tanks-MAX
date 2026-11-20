# BARRAGE — Zuko Audit Tracker

**Brief:** BUILD_BRIEF.md (§9 is the contract)
**Builder:** ChatGPT · **Auditor:** Zuko · **Repo:** Adityasuresh109/Pocket-Tanks-MAX
**Status:** R1 audited 2026-11-19 — **NOT PRODUCTION READY** (strong foundation; full report in AUDIT_R1_REPORT.md)

## How the audit runs (same loop as Mafia / Two Rooms / DecryptIT)
1. Code read: server-authoritative logic, no aim data in wrong payloads, numbers match brief §5/§6 exactly.
2. Live probe: drive the deployed game, run every §9 check, record measured numbers.
3. Verdict: PRODUCTION READY / NOT READY with a numbered fix list for the builder. No sign-off until all 13 pass or the owner explicitly accepts a residual risk.

## §9 Acceptance checks — R1 status
- [x] 1. **PASS** — No one-volley wipe: builder sim test 3 direct Berthas = exactly 40 damage, target alive after 2nd identical volley; auditor solver-aimed volley vs spawned team: max 33/tank, team 720→614, no deaths
- [x] 2. **PASS** — Hiding works: auditor in-sim — Bertha detonating on a concrete roof → tank beneath takes 0 (HP 120); same shot with no roof → HP 86. Cover multiplier 0.0/1.0 verified; Mole stops at rock/concrete
- [x] 3. **PASS** — Hidden aim: code read of the Worker's per-client views + builder WS-frame room test — aim goes only to owner + firing squadmates; host and enemies receive none during the aim phase
- [x] 4. **PASS (note)** — Physics: auditor's independent fine-step integration matches the engine within 0.5% (800 vs 804px); Rail Slug vs 12px rock — no tunnelling; replays bit-identical; wind drift at +50 measured Bertha +52 / Single +103 / Splitter +133. Note: the builder's own anchor test checks the formula, not a simulated landing — add a sim anchor test
- [x] 5. **PASS** — Squad rotation: room tests run by auditor — 6v6 order exactly A3/A3/B3/B3 alternating teams, 5v5 = 3/3/2/2, 4v4 = 2/2/2/2; dead/empty-squad skip in code. Gap: no test for disconnect-during-aim
- [ ] 6. **NOT VERIFIED — AT RISK** — Match length: builder did not measure it. Auditor bot match (Single Shot only, no movement, simple learning) hit the 40-turn limit with 1 kill — pacing likely too slow. Needs a human-played 6v6 measurement (target 20–35 turns)
- [ ] 7. **PARTIAL** — Terrain & tanks: ROCK 3 hits + CONCRETE immune verified; fall damage exact (60px drop = 5 HP). FAIL: Napalm has no surface pool/flow at all; Dirt Ball burial doesn't really bury (settle pushes the tank back up), so Excavator rescue is partial; Roller/Bouncer flat-surface approximations; Earthquake continuity implemented but untested
- [x] 8. **PASS** — Mid-air collision: auditor probe — symmetric crossing Single Shots detonated together at (640, 356), zero damage to any tank
- [x] 9. **PASS** — Timeout & lock-in: only locked shots fire, unlocked hold fire, full lock fires early; fuel 60px verified. Minor bug: fuel can drain at the map edge without moving (moveTank reports |step| even when clamped)
- [x] 10. **PASS (deviation D3)** — Reconnect: seat-token reclaim in the Durable Object; host drop pauses with remaining time, reconnect resumes. The brief's void-and-re-fire rule is superseded by D2/D3 (resolution is instant server-side; replay is playback only)
- [ ] 11. **PARTIAL** — 12-player load: live Worker health + room creation verified; live browser host+join flow works (room created, player enlisted RED Squad A, host roster synced, no errors). No 12-client live run yet
- [ ] 12. **PARTIAL** — Console errors: live smoke of landing/host/join flows — no blank pages, no error toasts. Match-phase screens not yet exercised live; full sweep owed. Open question: host Remove-player button showed no effect in the automated session (likely the confirm dialog) — retest by hand in the rehearsal
- [ ] 13. **OPEN — owner's rehearsal** — ≥4 real phones + TV host. Also covers: match start + firing controls live, Remove-player retest, check 6 with humans

## Deviations on record (builder-documented, owner's discretion — see AUDIT_R1_REPORT.md)
- D1: 1280×720 field, 4px cells (brief: 1920×1080, 1px)
- D2: physics authority in the Durable Object, not the TV host (auditor's view: better for integrity/reconnects)
- D3: host-disconnect volley semantics follow from D2
- D4: weapon approximations (Roller/Bouncer/Mole/Napalm/Quake); Splitter spread is ±12° in code vs ±6° in the brief (undocumented)
- D5: spawns are a tight 56px-spaced line on every map, not §3.3's distributed covered slots (undocumented)

## Watch-list (from past game audits)
- Deploy workflow writing secrets/config incorrectly (DecryptIT's literal `\n` config.js bug) — **R1: checked, did NOT recur** (live config.js is clean, correct Worker URL).
- Cache staleness on GitHub Pages after redeploys — hard-refresh / version-check the live build before auditing it.
- Any "works in sandbox" claim for real phones / venue Wi-Fi — unproven until check 13.

## Rounds
- **R1 (2026-11-19)** — Build commit `4f809cb`. Auditor verdict: **NOT PRODUCTION READY**. 8 PASS (checks 1, 2, 3, 4, 5, 8, 9, 10), 3 PARTIAL (7, 11, 12), check 6 not verified / at risk, check 13 open. Fix list: AUDIT_R1_REPORT.md, "Fix list for the builder" (7 items).
