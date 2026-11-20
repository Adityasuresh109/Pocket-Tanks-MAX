# Pocket Tanks MAX

A Pocket Tanks-style artillery game for AD Arcade — up to **6 players per side**, teams attacking in alternating **squads** that fire simultaneously. Working title in the design brief: **BARRAGE**. Same game, same repo.

Host screen (TV) + phone controllers, destructible terrain with real hiding places, and physics that is the game: gravity, wind and drag per shell type, cover that actually blocks shots, and damage numbers tuned so **nobody gets wiped in one attack**.

## The one document that matters

**[BUILD_BRIEF.md](BUILD_BRIEF.md)** — the locked design and build contract. §2 turn structure, §4 physics and §5 damage numbers are not suggestions. §9 is the acceptance checklist the build is audited against.

## How collaboration works in this repo (no copy-pasting through Aditya)

| Role | Who | Does what |
|---|---|---|
| **Owner** | Aditya | Created the repo, owns the Cloudflare secret, approves any design change, final say on everything |
| **Builder** | ChatGPT | Builds the game to BUILD_BRIEF.md in `/frontend` + `/worker`, pushes code here, and records the measured §9 numbers (checks 1, 2, 5, 6) in `BUILD_NOTES.md` |
| **Auditor** | Zuko (Muse) | Reviews every push against §9, runs the live checks, and files numbered **Issues** for anything that fails — `AUDIT R<n>: <what failed, measured vs required>`. A check is only ticked in [AUDIT_CHECKLIST.md](AUDIT_CHECKLIST.md) when the auditor has verified it, not when it's merely implemented |

### The loop
1. Builder pushes a build → updates `BUILD_NOTES.md` with what changed + measured numbers.
2. Auditor reviews the code and the live deploy, ticks/passes what holds in AUDIT_CHECKLIST.md, and opens Issues for the rest.
3. Builder fixes Issues, referencing the issue number in the commit/PR, and the auditor re-verifies and closes them.
4. When all 13 §9 checks pass, the auditor posts the verdict: **PRODUCTION READY**. Only then does the game get its AD Arcade hub card (separate step, separate repo — do not edit the hub from here).

### Ground rules
- **Design changes go through Aditya.** If the brief is ambiguous, open an Issue and ask — don't invent a rule. The brief's §2.7 list of deliberate omissions (no attack/defend mode, no AI tanks, no shop, …) is part of the design, not a TODO list.
- **Secrets never go in files.** The Cloudflare API token lives in this repo's GitHub Actions secrets (Settings → Secrets and variables → Actions), set by the owner. If a workflow needs a secret name, document the *name* here — never a value.
- **Don't touch other games.** Mafia, Puppet Panic, Two Rooms, DecryptIT, WTF Quiz and the AD Arcade hub live in their own repos and are out of scope here.

## Current engineering notes

The builder implementation is in [PR #2](../../pull/2). The latest authoritative implementation choices, measured test evidence and deployment prerequisites are in [BUILD_NOTES.md](BUILD_NOTES.md). The original brief remains the design reference; the owner's later discretion authorizes pragmatic differences documented in BUILD_NOTES.md. No acceptance check is signed off until the auditor independently verifies it.

## Status
- [x] Design locked (2026-11-19)
- [x] Build brief + audit checklist in repo
- [x] First implementation build (builder; PR #2, pending independent live audit)
- [ ] Audit round 1 (auditor — start after production/staging deployment)
- [ ] Production ready + real-device rehearsal (≥4 phones + TV)
