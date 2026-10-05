# Astral Zero — UI / UX Overhaul

> The design system behind the lobby, loading screen and in-match HUD.
> For architecture and gameplay see [FRONTEND.md](../FRONTEND.md).

The brief was *"modern mobile/arcade game UI"*: colourful, chunky, high
contrast, with strong button feedback — explicitly **not** a SaaS dashboard and
**not** a dark developer tool.

**Branding is original.** Astral Zero's mark is built from three ideas the game
already cares about: an **orbital ring**, a **cleanup swoosh** with a bright
sweep head, and a **star** (the debris being swept). No skull, no third-party
character, no borrowed asset. Everything is procedural Phaser Graphics, so the
repo still ships zero binary art.

---

## 1. The design system

| Token file | What it owns |
| --- | --- |
| `config/uiTheme.js` | Colours, type scale, corner radii, motion tokens, `CONNECTION_STATES`, `CTA_STATES` |
| `config/viewportConfig.js` | Breakpoints, the three layout tiers, hit-area floors |
| `core/Motion.js` | The reduced-motion choke point (every tween goes through it) |

**Palette.** Deep-space navy surfaces so saturated accents read as light
sources. Three brand accents — cyan `#5ad8ff` (orbital sweeps, primary CTA),
amber `#ffc247` (cleanup/scrap, energy) and violet `#b58cff` (progression).

**Type.** Heavy weights (`800`/`900`) for anything read at a glance, lighter
for detail. A rounded humanist stack (`Trebuchet MS`) rather than a
neutral UI face, which is most of what separates "arcade" from "dashboard".

**Shape.** Large radii (panel 22 px, button 14 px) with thick borders. Buttons
use a *smaller* radius than panels so they read as sitting **on** the surface.

---

## 2. The honesty rule

> **The UI must reflect the actual state machine, and must never fake a state.**

`src/ui/brand/ConnectionState.js` is a **pure function** from the real
`net.state` to what the player sees. Both the status pill and the Find Match CTA
read it, so they cannot contradict each other.

### Connection states

| State | Real signal | Pill | CTA |
| --- | --- | --- | --- |
| Connecting | `connection: 'connecting' \| 'idle'` | `▲ CONNECTING` | `OFFLINE` (disabled) |
| Online | `connection: 'online'`, contract OK | `● ONLINE` | depends on party/queue |
| Reconnecting | `reconnecting: true` | `↻ RECONNECTING` | disabled (mid-flight) |
| Offline | `connection: 'offline'` | `✕ OFFLINE` | `OFFLINE` (disabled) |
| Outdated server | `contractOk === false` | `! OUTDATED SERVER` | disabled |

`reconnecting` deliberately **outranks** `online`: we *were* connected, so
saying `OFFLINE` would be a lie and saying `ONLINE` would be worse.

### Find Match CTA states

`READY · SEARCHING · LOADING · START MATCH · WAITING · OFFLINE`

The label, colour and enabled flag are returned **together from one snapshot**,
so the button can never read `READY` while disabled. A searching button
becomes a cancel affordance, so it never lies about what pressing it will do.

**Verified live:** against a real server the sequence is
`OFFLINE → CONNECTING → ONLINE/FIND MATCH → START MATCH → SEARCHING → LOADING`;
against a dead port it is `OFFLINE` with the CTA disabled.

### No fake functionality

The nav rail declares only routes that exist: `HOME · PLAY · FRIENDS ·
SETTINGS`. There is **no** MISSIONS / SHOP / RANKED, because the backend has no
mission, currency or ranked system. `ProfileCard` shows no currency either —
the only real per-player data is the name and the party/queue context. The
test suite asserts these absences so they cannot creep back in.

---

## 3. Layout

```
WIDE (≥1024 css px)                 COMPACT (<640 css px)
┌──────────────────────────────┐    ┌──────────────────────┐
│ LOGO   profile   [status] ⚙ │    │ LOGO      [status]  │
├───┬──────────────────┬───────┤    ├──────────────────────┤
│ N │  PARTY (focus)   │ MODE  │    │       MODE           │
│ A │  CREATE PARTY    │ FFA   │    │   [ FIND MATCH ]     │
│ V │  JOIN WITH CODE  │ TDM   │    ├──────────────────────┤
│   ├──────────────────┤ BOTS  │    │       PARTY          │
│   │  FRIENDS         │ SCRAP │    ├──────────────────────┤
│   │                  │[FIND] │    │      FRIENDS         │
└───┴──────────────────┴───────┘    │  HOME PLAY FRIENDS ⚙ │
                                     └──────────────────────┘
```

| Tier | CSS width | Columns | Nav | Hit floor |
| --- | --- | --- | --- | --- |
| `wide` | ≥ 1024 | 3 | left rail | 44 px |
| `medium` | 640–1023 | 2 | icon rail | 44 px |
| `compact` | < 640 | 1 | bottom bar | 48 px |

**Why the design surface stays 1280×720.** The Arsenal camera's framing
(`anchorXRatio 0.32`, shoulder bias, aim lead, zoom) is tuned around a 1280×720
arena. Resizing the surface would silently change that. So the surface is
pinned and the *layout* adapts instead — the camera provably cannot regress
while the menus still work on a phone.

**Tested at** 320 / 375 / 768 / 1024 / 1440+. Panels are asserted to stay
inside the design surface and not to overlap, at every width.

---

## 4. Loading screen

Plain **DOM**, not Phaser, for two reasons: it must paint before the ~1.2 MB
Phaser bundle has executed, and it must be legible at 320 px.

Progress is driven by **real milestones**, each advancing a fixed weight:

| Step | Trigger |
| --- | --- |
| `SCANNING DEBRIS FIELD` | the module runs (first paint) |
| `CALIBRATING SUIT` | `Phaser.Core.Events.READY` |
| `LOADING MISSION DATA` | first frame rendered |
| `CONNECTING TO ORBIT` | the socket reports *any* status |
| `READY` | the socket is genuinely **online** |

No timer creeps the bar forward and there is no artificial minimum duration. If
the relay is slow the bar genuinely sits at 80% saying `CONNECTING TO ORBIT`;
if everything is instant it simply completes. A real failure renders an honest
message plus a working **RETRY**, rather than a spinner forever.

---

## 5. Accessibility

| Requirement | How |
| --- | --- |
| Keyboard navigation | Buttons handle Enter/Space/Escape; disabled buttons are inert |
| Visible focus | A **white ring outside the border** — a shape change, so it survives greyscale |
| Non-colour-only status | Word + **distinct glyph** (`● ▲ ✕ ↻`) + border weight + hint line |
| Non-colour-only selection | Selected mode cards gain a **thicker border** *and* a `▸` marker |
| Contrast | Body text ≥ 4.5:1 on the panel fill, asserted in the test suite |
| Reduced motion | `core/Motion.js` collapses every tween to 0 ms, landing on final values |
| ARIA | `role="progressbar"` + `aria-valuenow`, `aria-live` step label, `role="alert"` on failure |
| Hit targets | 44 px floor at every tier, 48 px on touch |

Reduced motion was extended beyond the new UI into `AmbientFx` (vents hold a
constant glow instead of pulsing) so the whole game respects it.

---

## 6. Game feedback

`src/ui/fx/Feedback.js` is one reusable component for banners and pulses. Its
cue list is the **complete** set, and every cue maps to something the backend
actually reports:

| Cue | Real trigger |
| --- | --- |
| `debrisCleared` | server-confirmed `entity_death` |
| `damageTaken` | a server health delta > 0 |
| `scoreGain` | a server score update |
| `combo` | a server `streak` |
| `objectiveDone` | the mode's real bank target |
| `matchDone` | `match_end` |

There is deliberately **no** `abilityReady` or `levelUp` cue — the game has no
abilities and no local level maths. An unknown cue logs a warning rather than
rendering a blank.

---

## 7. Bugs found and fixed during the overhaul

These were real defects, caught by constructing the UI headlessly rather than
by reading the code:

1. **`ArenaHud` used `this.time` in 8 places.** It is a plain widget, not a
   `Phaser.Scene`, so `this.time` was always `undefined` — the HUD would have
   thrown on entering any match. It went unnoticed because the HUD was only
   ever exercised in a live browser session. All 8 are now `this.scene.time`.
2. **`OrbitalBackdrop` used the global `Phaser`** without importing it.
3. **`NavRail` called `this.itemSize()`** before the field was set.
4. **`ModeSelector` lost its selected styling on hover**, because
   `Button.redraw()` runs on every pointer transition and repainted over it.
   The base redraw is now re-hooked so selection is stable.
5. **The wide tier's 40 px hit target** was below the reliable-pointer floor.
   Raised to 44 px (the test caught this, and the config was fixed rather than
   the assertion).
6. **The boot screen was a lie about state** — it said "Spinning up the janitor…"
   and was deleted on `READY`, before the socket had even connected.

---

## 8. Manual test checklist

1. `npm run dev:server` then `npm run dev` → **loading screen** advances through
   all five steps and the lobby appears.
2. Stop the server → the pill reads `✕ OFFLINE` and **FIND MATCH is disabled**.
   Restart it → it returns to `● ONLINE`.
3. **CREATE PARTY** → a 6-character code appears; tap it to copy.
4. **JOIN WITH CODE** in a second browser → both rosters update live.
5. A non-leader sees a disabled `WAITING`; the leader sees `START MATCH`.
6. Solo → `FIND MATCH` → `SEARCHING` → `LOADING` → the arena.
7. Each mode card: the selected one has a thicker border **and** a `▸`.
8. Tab through the lobby → a white focus ring is visible on every control.
9. In-match: HUD elements stay in their corners, health/timer/scores update.
10. Narrow the window to 375 px → the nav becomes a bottom bar and panels stack.
11. Enable "reduce motion" in the OS → the UI is still, but everything still
    appears and still works.
12. `npm run test:all` → 15 suites green.

---

*Clean up orbit with extreme prejudice. 🧹🔫*
