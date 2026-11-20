# BARRAGE — Zuko Audit Tracker

**Brief:** `../briefs/chatgpt-build-brief.md` (§9 is the contract)
**Builder:** ChatGPT · **Auditor:** Zuko · **Repo:** Aditya created it 2026-11-19, Cloudflare secret added by Aditya 2026-11-19
**Status:** Awaiting first build (repo link / live URL not yet received)

## How the audit will run (same loop as Mafia / Two Rooms / DecryptIT)
1. Code read: server-authoritative logic, no aim data in wrong payloads, numbers match brief §5/§6 exactly.
2. Live probe: drive the deployed game (host + simulated phones), run every §9 check, record measured numbers.
3. Verdict: PRODUCTION READY / NOT READY with a numbered fix list for ChatGPT. No sign-off until all 13 pass or Aditya explicitly accepts a residual risk.

## §9 Acceptance checks — all pending
- [ ] 1. No one-volley wipe — focus-fire test, ≤40 damage in volley 1, target alive after volley 2 (record damage numbers)
- [ ] 2. Hiding works — concrete cover = 0 damage; lobbed-over-cover = full; Mole vs tunnel works; Mole vs concrete bunker fails
- [ ] 3. Hidden aim — WS payload inspection on enemy phone, non-firing teammate phone, and host screen during aim phase (no angle/power/weapon)
- [ ] 4. Physics accuracy — anchor shot 980px ±2%; Rail Slug vs 12px rock wall (no tunnelling); volley replay determinism ×2; wind drift Splitter vs Big Bertha (record drift)
- [ ] 5. Squad rotation — 6v6 (3/3), 5v5 (3/2), 4v4 (2/2), incl. deaths, empty-squad skip, disconnect/reconnect
- [ ] 6. Match length — full 6v6 on The Forts lasts 20–35 squad turns total (record turn count + final HP table)
- [ ] 7. Terrain & tanks — fall damage, Dirt Ball burial (no move, can fire), Excavator frees, Roller stopped by trench, Napalm pools downhill / stops at concrete, Earthquake blocked by concrete surface break
- [ ] 8. Mid-air collision — two crossing Single Shots airburst, no tank damage
- [ ] 9. Timeout & lock-in — unlocked player holds fire; full lock fires early; movement fuel 60px + 55° slope limit
- [ ] 10. Reconnect survival — phone mid-aim rejoins same tank/squad/HP/inventory; host drop pauses, in-flight volley voided + re-fired from stored lock-ins
- [ ] 11. 12-player load — full 6v6 match, no dropped lock-ins, no volley playback lag
- [ ] 12. Zero console errors — iOS Safari + desktop Chrome, throughout
- [ ] 13. Real-device check — ≥4 real phones + TV host (Aditya's rehearsal; Zuko's sim checks do not substitute)

## Watch-list (from past game audits)
- Deploy workflow writing secrets/config incorrectly (DecryptIT's literal `\n` config.js bug) — verify deployed config byte-for-byte, not just the workflow run going green.
- Cache staleness on GitHub Pages after redeploys — hard-refresh / version-check the live build before auditing it.
- Any "works in sandbox" claim for real phones / venue Wi-Fi — unproven until check 13.

## Rounds
_(each ChatGPT build + audit verdict gets logged here)_
