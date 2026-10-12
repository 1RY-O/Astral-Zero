# S14 — Gameplay Expansion: Implementation Plan

Status: **IMPLEMENTED + VERIFIED** (all slices landed and exercised; see §Evidence)

## Evidence (what was actually run)

| Slice | Subsystem | Tests | Result |
|---|---|---|---|
| S14.0 | Persistence | `npm run test:persist` | 10 pass / 0 fail |
| S14.1/.2 | Characters + loadouts | `npm run test:chars` | 13 pass / 0 fail |
| S14.3 | Orbital shifts | `npm run test:shifts` | 10 pass / 0 fail |
| S14.4 | Scrap Mimics | `npm run test:mimics` | 16 pass / 0 fail |
| S14.5 | Control Point | `npm run test:control` | 14 pass / 0 fail |
| S14.6 | Ranked flow | `npm run test:ranked` | 65 pass / 0 fail |
| S14.7 | Client integration | `test:home` · `test:hud` · browser run | pass / pass / 0 console errors |
| Regression | Arena restart | `npm run test:arena-restart` | 12 pass / 0 fail |
| Whole suite | 38 suites | `npm run test:all` | 0 failures |
| Build | production bundle | `npm run build` | ✓ built |

## Audit summary (original starting point)

| Area | Reality (before S14) |
|---|---|
| Persistence | **None.** `playerStore.profiles` was an in-process `Map`; a restart wiped XP, friends, protection flags. Ranked *requires* persistence, so this was a hard prerequisite, not a nice-to-have. |
| Characters | **None.** No character/roster/loadout concept anywhere. |
| Orbital shifts | **None.** Map defs are deep-frozen by `define()`; a moving platform needs a mutable per-room copy. |
| Scrap Mimics | **None.** |
| Objectives | Only `scrap_collector` (bank scrap at stations). No control-point/hold mode. |
| Weapons | 3 rows, shared client/server, no variants. |
| Tick order | `tickRoom`: entities → projectiles → hazards → scrap → respawns → win → sync. |
| Contract | `1.4.0-phase6` (additive-only so far). |


## Dependency order

```
S14.0  PERSISTENCE (file-backed profile store)        ← prerequisite for 6
       └─ tests: round-trip, atomic write, corrupt-file recovery
S14.1  CHARACTERS (roster + tiers, server-validated)  ← prerequisite for 5, 6
       └─ tests: roster integrity, unlock rules, server rejection of bad ids
S14.2  LOADOUT VARIANTS (validated, identity-preserving)
S14.3  ORBITAL SHIFTS (mutable platform set per room)
       └─ needs: room-owned mutable map copy, warn→shift→settle state machine
S14.4  SCRAP MIMICS (disguised hostile pickups)
       └─ needs: 3 (safe zones already telegraphed)
S14.5  OBJECTIVE MODE (control point)
S14.6  RANKED (only if 0 + 1 + 5 are real)
```

## Ownership split (server-authoritative)

- **Server**: all damage, rewards, objective progress, character validation, unlocks, rating.
- **Client**: prediction, presentation, input, cosmetic tinting.

## The honest constraint

This is a very large body of work. I will build it in verifiable slices and
report each subsystem as complete / partial / blocked **with evidence**. I will
not stub a feature into looking finished.
