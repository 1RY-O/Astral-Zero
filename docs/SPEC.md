> This is the approved, corrected brief. If any instruction here contradicts docs/DECISIONS.md, DECISIONS wins. If it contradicts docs/STATUS.md about what phase we are in, STATUS wins.

# Debris Derby — Approved Brief (Phase 0–9)

Built for the NASA International Space Apps Challenge 2026. Physics-based
tether game about removing orbital debris. One canvas, three verbs, sixty
frames per second, no accounts, no multiplayer.

---

## 1. Mission

The player is a cleanup tug in low Earth orbit. Debris drifts past. The
player **GRAB**s a piece, **THRUST**s to build a swing, and **RELEASE**s it
onto a deorbit trajectory. Heavy objects are worth more. Chained removals
multiply. Fuel is finite, so every swing is a bet.

The game is a playable argument for the 25-year rule: the cheapest way to
stop a cascade is to remove mass early, not to dodge it later. The ambient
catalog is real orbital data; the foreground is a game, and the two are
never presented as the same thing.

### The three verbs (locked)

| Verb | Input | Effect |
|---|---|---|
| **GRAB** | pointer/touch down on debris within tether reach, or `E` | Attaches the tether to the nearest valid object |
| **THRUST** | hold pointer/touch or `Space` | Applies thrust along the tether normal; consumes fuel |
| **RELEASE** | pointer/touch up, or `Q` | Detaches; the object keeps its release velocity |

There is **no aiming reticle, no ammo, no fire button, no weapon**. If a
mechanic needs a fourth verb, it is out of scope.

---

## 2. Locked technical rules

1. **Split clock.** Client foreground physics at **60 Hz**. Server ambient
   catalog at **2 Hz**. The server never simulates gameplay.
2. **Physics.** Verlet integration with position-based distance
   constraints. **12 constraint iterations per fixed step.** Fixed timestep
   `1/60 s`, accumulator, maximum 5 substeps per rendered frame, no
   variable-`dt` integration.
3. **Frame.** Client simulation is framed in the **Hill's frame** (relative
   to the player's orbit). The ambient catalog is propagated with **SGP4**
   from TLEs.
4. **React boundary.** React 18 is UI chrome only. The canvas is mounted
   **once** in a ref and driven by `requestAnimationFrame` **outside React's
   render cycle**. No per-frame `setState`.
5. **Determinism.** Every level runs from a seed. Same seed + same inputs =
   same trace. Seeds are shareable in the URL.
6. **Palette.** Three brand colours only:
   `#38BDF8` sky blue (player / tether / clean), `#FF2D95` hot pink
   (danger / cascade / penalty / CTA), `#FFFFFF` white (text / frames).
   Derived neutrals are allowed (`#060D1F`, `#F8FAFC`, `#0B1220`, the
   `sky-300` / `sky-500` / `pink-400` steps already in
   `src/ui/tokens.css`). **No fourth brand colour.** Raw colour literals
   live only in `src/ui/tokens.css` and `src/ui/tokens.js`.
7. **ReactBits rule: fetch, don't recall.** Any ReactBits component or
   pattern is fetched from current upstream source/docs and adapted before
   it is written. Never reconstruct a ReactBits API from memory.
8. **Fonts.** `@fontsource` only. No Google Fonts hotlinks, no runtime CDN.
9. **No TypeScript migration. No Rust/WASM in the core build. No game
   engines.** A gated stretch may try WASM behind a JavaScript fallback;
   it is never required to ship.

---

## 3. Scoring (locked)

```
object_value        = 50 * clamp(mass_kg / 10, 0.5, 4)
cascade_multiplier  = n * (n + 1) / 2
deorbit_bonus       = 80   per object released retrograde
linger_penalty      = -150 per object that lingers past the level window
fuel_bonus          = 500 * (fuel_left / fuel_max)
```

```
run_score = Σ(object_value * cascade_multiplier)
          + (80 * deorbit_count)
          + (-150 * linger_count)
          + fuel_bonus
```

- `n` is the length of the current deorbit chain. A chain continues while
  removals land inside the chain window (2.5 s at 60 Hz); it resets after
  that window or at run end. `n` starts at 1.
- **Prograde/retrograde:** deorbit credit requires a **retrograde release**
  (the release velocity has a component opposite the object's orbital
  velocity). A prograde release spends fuel, raises the orbit, and earns no
  `deorbit_bonus`. This is the scoring expression of the 25-year rule: only
  retrograde removal lowers perigee and shortens orbital lifetime.
- `linger` is assessed once per object that is grabbed but neither deorbited
  nor released within the level's linger limit. It does not stack per frame.
- Rounding happens at presentation only. The server recomputes the score
  from submitted run data; the client's number is never trusted.
- Fuel is not regenerated. GRAB and RELEASE are free; THRUST consumes fuel
  proportional to thrust time and tether tension.

---

## 4. Levels (eight, locked)

| # | Name | Teaching beat |
|---|---|---|
| 1 | **First Contact** | One heavy object, generous tether, no fuel pressure. Learn GRAB → THRUST → RELEASE. |
| 2 | **Two-Body Problem** | Two objects. Transfer momentum from the first swing into the second. |
| 3 | **Clean Sweep** | Many light objects. First real use of the cascade multiplier. |
| 4 | **Ricochet** | Elastic boundaries. Bank the payload off a wall to reach a bad angle. |
| 5 | **Dominoes** | Chained removals are the intended solution; the multiplier is the level. |
| 6 | **Fragile Cargo** | Mass and impact limits. A too-fast release destroys the payload and scores nothing. |
| 7 | **Moving Targets** | Drifting anchors and rotating tether points. Lead the grab. |
| 8 | **Kessler Event** | Dense field, tight fuel, everything combined. The exam. |

No ninth level. No endless mode. No procedural campaign.

---

## 5. Phase 0 — Recon (complete)

**Goal:** know what exists before deleting anything.

Deliverables:
- File inventory with reusable vs replace dispositions.
- Current socket event contract, as implemented and as documented.
- Version-string disagreements and identity drift.
- Rollback point recorded.

Done when the inventory is written down and the rollback commit is named.
Output: `docs/RECON.md`.

---

## 6. Phase 1 — Cleanup + React toolchain (complete)

**Goal:** remove dead Astral Zero / Phaser-era material and install the
toolchain the rest of the project uses.

Shipped:
- Deleted 41 Phaser-era tests, 28 screenshots, `src/friends/`,
  `src/lagcomp/`, `src/shared/`, `mcp_settings.json`,
  `scripts/visual-verify.mjs`, `docs/PHASE2.md`, `docs/S14_PLAN.md`,
  `docs/UIUX.md`.
- `opencode.json` untracked and gitignored; the local file was preserved.
- React 18 + Vite + ESLint + React plugins installed.
- Design tokens (`src/ui/tokens.css`, `src/ui/tokens.js`), theme module,
  self-hosted fonts, seven token tests.
- Commits `502d25f`, `095abf6`; rollback point `095abf6`.
- `npm test`, `npm run lint`, `npm run build` green.

The old Solar Sentinel client bundle is **deliberately still present**. It
is replaced in Phase 5, not before.

---

## 7. Phase 2 — Backend rewrite (next)

**Goal:** the server stops being a game and becomes an ambient-data,
config, and leaderboard service. Foreground gameplay authority moves to
the client in Phase 3.

### 7.1 Replace the loop

- Delete `src/game/loop.js` from the runtime path and add
  `src/game/ambientCatalog.js`.
- One `setInterval` at **500 ms (2 Hz)**, `.unref()`ed.
- Each tick: propagate cached TLEs with SGP4, build the ambient catalog,
  broadcast it.
- TLE source: Celestrak/NORAD GP data. Cache for 30 minutes; keep the last
  good catalog on fetch failure; if no live data has ever arrived, serve
  the clearly labelled fallback catalog.
- Exports: `ensureCatalog(io, events)`, `tickOnce(now)`, `stats()`,
  `stopCatalog()`.
- **No** energy, score, waves, collisions, cascades, proximity timers,
  `game_over`, cleanup authority, or dev force-cascade endpoint.

### 7.2 Server keeps only four jobs

1. Config.
2. Leaderboard.
3. Run validation.
4. TLE propagation.

### 7.3 REST

| Route | Response |
|---|---|
| `GET /api/health` | `{ game: 'Debris Derby', status: 'ok', version, socketEventsVersion, uptimeSeconds, timestamp }` |
| `GET /api/levels` | `{ levels: [{ id, name, order }] }` — exactly the eight locked levels |
| `GET /api/leaderboard?levelId=&limit=` | `{ levelId, entries: [{ rank, callsign, score, levelId, createdAt }], updatedAt }` |

Rules:
- `limit` clamps to `1..50`, default `10`.
- `levelId` is optional; omitted means all levels.
- All three return valid JSON with correct `Content-Type`, including empty
  leaderboards.
- Writes to the leaderboard happen only through validated `run_submit`
  socket events (no unauthenticated REST write in Phase 2).
- The leaderboard is in-memory; document that it resets on restart.

### 7.4 Socket contract (canonical)

Canonical contract version: **`2.0.0-debris-derby`**. It is the only
surviving version string. `1.0.0-solar-sentinel`, `1.5.0-s14`, and the bare
`1.0.0` must all be gone from the tree.

| Event | Direction | Payload |
|---|---|---|
| `connected` | S → C | `{ socketId, game: 'Debris Derby', socketEventsVersion, serverTime, catalog: { tickHz: 2, objects, source } }` |
| `ambient_catalog` | S → C, 2 Hz | `{ tick, timestamp, source: 'celestrak'\|'fallback', objects: [{ id, name, noradId, latDeg, lonDeg, altKm, inclinationDeg, isDebris }] }` |
| `run_submit` | C → S, ack | `{ levelId, seed, durationMs, fuelUsed, deorbits: [{ objectId, massKg, releaseDot }], lingers, clientScore }` |
| `leaderboard_update` | S → C | `{ levelId, entries, updatedAt }` after an accepted run |
| `server_notice` | S → C | `{ code, message, at }` for rejections and contract errors |

`run_submit` ack:
- Success: `{ ok: true, runId, score, rank, best }`
- Failure: `{ ok: false, code, message }` where `code` is one of
  `BAD_PAYLOAD`, `BAD_LEVEL`, `BAD_SEED`, `RATE_LIMITED`, `SCORE_MISMATCH`.

### 7.5 Inbound validation

Every inbound payload is validated before use. No destructuring of raw
client input.

- Object with a whitelisted key set; unknown top-level keys ignored or
  rejected consistently.
- Strings: type-checked and length-capped (callsigns/names ≤ 24 chars).
- Numbers: `Number.isFinite`, integer where required, range-checked.
- Arrays: capped (`deorbits` ≤ 64), each element validated.
- `levelId` ∈ `1..8`; `seed` is a finite 32-bit integer; `durationMs` ∈
  `0..3_600_000`; `fuelUsed` ≥ 0.
- `releaseDot` ∈ `-1..1`; a deorbit only counts when `releaseDot < 0`.
- Rate limit: one `run_submit` per socket per 3 seconds.
- Server recomputes the score from the submitted run data. If
  `clientScore` differs, store the server score and log
  `SCORE_MISMATCH`; do not reject unless the delta is impossible.
- Invalid payloads never throw out of the handler; they emit
  `server_notice` and, for acked events, return `{ ok: false }`.

### 7.6 Documentation

- Rewrite `websocket_events.md` to match the implementation **exactly**:
  every event, every field, every direction, every ack, every error code.
- Diff the doc against the code before declaring the phase done. The diff
  is part of the phase report.
- Update `.env.example` to Debris Derby wording and the 2 Hz ambient split.

### 7.7 Definition of done

- Server boots cleanly with no startup errors.
- `/api/health`, `/api/levels`, `/api/leaderboard` return valid JSON.
- A test connects a socket, receives an `ambient_catalog` tick, and
  disconnects without error.
- A test proves invalid `run_submit` payloads are rejected.
- `websocket_events.md` and the code agree; the diff is shown.
- `npm test`, `npm run lint`, `npm run build` pass.
- Version grep proof, scoped to runtime code and the contract doc:
  - `grep -rn "solar-sentinel" server.js src websocket_events.md package.json`
    → zero.
  - `grep -rn "1\.5\.0-s14" server.js src websocket_events.md package.json`
    → zero.
  - `grep -rnw "1\.0\.0" server.js src websocket_events.md package.json`
    → zero.
  - The only contract version in runtime code and `websocket_events.md` is
    `2.0.0-debris-derby`. `docs/SPEC.md`, `docs/STATUS.md`, and
    `docs/RECON.md` may name the banned strings as historical findings.
- Commits are conventional and logically chunked.

### 7.8 Out of scope

Client gameplay, canvas, UI, `index.html`, `src/main.js`,
`src/orbitalMap.js`, `src/styles.css`, `src/audio.js`, `src/demoFeed.js`.
The old Solar Sentinel bundle is not deleted here.

---

## 8. Phase 3 — Bare canvas + tether physics

**Goal:** prove the swing is fun before building any chrome around it.

- React shell mounts a single `<canvas>` in a ref. The rAF loop starts in
  an effect and never triggers a React render.
- Device-pixel-ratio scaling, resize handling, visibility pause.
- Fixed-step 60 Hz accumulator; Verlet + 12 position-based distance
  constraint iterations.
- Tether: anchor point, rest length, max length, tension readout, slack
  behaviour, grab/release ray or radius test.
- THRUST applies acceleration along the tether normal and drains fuel.
- One seeded debug scenario with a few masses and a planet limb. No menus,
  no levels, no scoring UI.
- Debug overlay may be plain DOM, but it is not product UI.

**Definition of done:** 60 fps on a mid-range laptop; the same seed
produces the same trace; no per-frame allocations in the physics hot loop;
a human can grab, swing, and release an object and feel the difference
between a good and a bad release.

**Human verification:** swing a tethered object on the bare canvas before
Phase 4 starts.

---

## 9. Phase 4 — Playable core loop + scoring

**Goal:** levels 1–3 are playable start to finish with real scoring.

- Run state machine: briefing → playing → report → retry/next.
- Seeded RNG, shareable seed, deterministic replay of inputs.
- Object masses, grab validation, retrograde detection, chain window,
  linger limit, fuel model.
- Implement the locked scoring formulas exactly, with unit tests for each
  term and for the chain multiplier.
- Levels 1–3 from the locked table, with tuned masses and fuel.
- Minimal HUD (fuel, score, chain) may be plain DOM; final chrome is
  Phase 5.

**Definition of done:** a player can finish levels 1–3, fail them, retry,
and see a score breakdown that matches the formulas; scoring tests pass;
the seed reproduces the run.

**Human verification:** play levels 1–3 yourself before Phase 5 starts.

---

## 10. Phase 5 — React UI chrome + levels 4–8

**Goal:** the game looks and feels like a product, and the old client is
gone.

- React owns menus, level select, HUD chrome, pause, mission report,
  leaderboard, and settings. It does not own the canvas frame loop.
- Levels 4–8 from the locked table.
- Keyboard, pointer, and touch input; 44 px minimum touch targets; safe
  areas; portrait and landscape layouts.
- Replace `index.html`, `src/main.js`, `src/orbitalMap.js`,
  `src/styles.css`, `src/audio.js`, `src/demoFeed.js`.
- Delete the old Solar Sentinel client bundle **in this phase only**, and
  list every deleted file in the phase plan first.
- No fourth brand colour, no Google Fonts, no new engine.

**Definition of done:** all eight levels reachable; the build no longer
contains Solar Sentinel code or copy; the canvas still runs outside
React's render cycle; mobile layout works at 360 px wide.

**Human verification:** open the build on a real phone, not an emulator.

---

## 11. Phase 6 — Feel: audio and feedback

**Goal:** make the three verbs satisfying without adding scope.

- Maximum **three** sound effects: grab, thrust, deorbit confirmation.
  **No music.**
- Web Audio, generated or tiny self-hosted samples; no network audio.
- Feedback: tether tension line, release direction cue, deorbit flash,
  screen shake, hit-stop. Pink is danger/penalty only; sky is clean/player.
- Respect `prefers-reduced-motion`; physics is never disabled, only
  decorative motion is.
- Sound defaults on, mute persisted locally.

**Definition of done:** the three effects are distinguishable; muted play
is fully playable; no audio node leaks after 10 minutes.

---

## 12. Phase 7 — Balance, performance, accessibility

**Goal:** the difficulty curve is deliberate and the game runs on ordinary
hardware.

- Tune fuel, masses, tether lengths, chain windows, and linger limits per
  level against recorded playtests.
- Performance budget: 60 fps on a mid-range phone; physics ≤ 4 ms per
  frame; no GC spikes in the hot loop; canvas draw calls bounded.
- Accessibility: gameplay never depends on colour alone (shape and
  luminance carry the same information); keyboard-only path through all
  UI; visible focus rings; screen-reader labels on React chrome; reduced
  motion honoured.
- No telemetry, no accounts, no cookies beyond local preferences.

**Definition of done:** a documented balance table per level; a performance
trace on a real device; keyboard-only completion of level 1.

---

## 13. Phase 8 — Docs, README, audit and delete

**Goal:** a stranger can clone the repo and understand, run, and verify it.

### 13.1 README (eight sections)

1. What Debris Derby is, in two paragraphs.
2. The problem: orbital debris and the 25-year rule.
3. How to play: GRAB, THRUST, RELEASE.
4. Scoring, with the locked formulas.
5. The eight levels.
6. Run locally: install, dev, build, start, test, lint.
7. NASA data grounding — cite: Celestrak/NORAD TLEs for the ambient
   catalog, and the 25-year rule (NASA Safety Standard 1740.14, NPR
   8715.6E effective 18 Apr 2024, NASA-STD-8719.14) which justifies the
   prograde/retrograde scoring. Do not cite LRO/LEND. Do not state a
   debris population number unless verified against NASA ODPO or ESA
   primary sources.
8. Credits, license, and the exact challenge phrasing: "built for the
   NASA International Space Apps Challenge 2026."

### 13.2 Audit and delete

Audit the whole tree, then delete only what is listed here:

- Remaining Solar Sentinel names, copy, log prefixes, meta tags, comments.
- Any dead legacy client file that Phase 5 did not already remove.
- Dead tests, screenshots, and generated output.
- `mcp_settings.json`, `scripts/visual-verify.mjs` if any trace remains.
- Unused dependencies (verify with a clean install and build).
- `opencode.json`: **untrack and gitignore; keep the local file intact.**
  Do not delete it.
- Any LRO/LEND citation, anywhere.
- Any unverified debris population number.
- Any surviving `1.0.0-solar-sentinel`, `1.5.0-s14`, or bare `1.0.0`.

**Definition of done:** a clean clone follows README verbatim with no
missing step; `npm ci && npm test && npm run lint && npm run build &&
npm start` succeeds; grep proofs for every banned string; every deleted
file was listed in the phase plan first.

**Human verification:** clean-clone the repo and follow the README
verbatim.

---

## 14. Phase 9 — Ship

**Goal:** a submission that can be opened by a judge in under a minute.

- Deploy one Node process that serves `dist/`, `/api/*`, and Socket.io.
- Environment configuration documented; no secrets in the repo.
- Health check and a post-deploy smoke test (catalog tick received,
  leaderboard readable).
- Three-minute demo script: problem, three verbs, one deorbit, one
  cascade-multiplier run, NASA data grounding.
- Final QA on a phone and a laptop, fresh browser profile.
- Tag the submission release.
- Submission text uses the exact challenge phrasing and no invented title.

**Definition of done:** public URL works; README matches the deployed
build; tag exists; demo script rehearsed; no banned citations or
unverified numbers in any submission material.

---

## 15. Anti-goals

- No multiplayer.
- No 3D.
- No accounts, login, or cloud saves.
- No TypeScript migration.
- No game engines (Phaser, Matter.js, Three.js, etc.).
- No Rust/WASM in the core build (gated stretch only, behind a JS
  fallback).
- No music.
- No more than three sound effects.
- No more than eight levels.
- No aiming reticle, ammo, weapons, or fourth verb.
- No procedural endless mode.
- No fourth brand colour.
- No Google Fonts hotlinks.
- No LRO/LEND citations.
- No unverified debris population numbers.
- No server-authoritative gameplay after Phase 2.
- No deleting the old client before Phase 5.

---

## 16. Provenance

This document was reconstructed on 2026-10-30 from the approved Phase 0–9
anchors because the original brief was not present in the working tree or
in git history. The locked anchors — clock split, Verlet with 12
iterations, three verbs, scoring formulas, eight level names, palette,
React boundary, ReactBits rule, anti-goals, and the three requested
corrections — are reproduced verbatim where quoted. Phase-level
deliverables, tuning defaults (chain window, linger limit, rate limits),
and payload field names are reconstruction detail, not recovered text.
`docs/DECISIONS.md` wins over any detail here.
