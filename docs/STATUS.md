# Status

## Current phase
Phase 3 — bare canvas + tether physics. Runtime code committed and
verified (tests 31/31, lint clean, build clean). Pending: human swing
verification on the bare canvas (see H2 below). Phase 2's F2 (live
Celestrak fetch) remains a deployment-only gate; it is NOT verified in
this sandbox.

## Completed
- Phase 0: recon complete. Findings in docs/RECON.md.
- Phase 1: cleanup + React toolchain. Commits 502d25f, 095abf6 on
  feat/debris-derby. Build, tests (7/7), lint, audit all green.
- Phase 2: backend rewrite (commits 1e9835c, a0e2ad2, 7bc21cb).
  - Replaced `src/game/loop.js` with a 2 Hz `ambientCatalog`; removed
    `src/game/nasa-api.js` and `src/game/orbital-calc.js`.
  - Celestrak GP JSON source
    (`...?GROUP=active&FORMAT=json`) with attribution, `catalogStatus`
    (`live` / `stale` / `unavailable`), 30-minute refresh, 60-second retry,
    and loud failure. No fallback TLE file, no offline mode.
  - REST: `GET /api/health`, `GET /api/levels`, `GET /api/leaderboard`.
  - Socket contract `2.0.0-debris-derby`: `connected`,
    `ambient_catalog`, `run_submit` (ack), `leaderboard_update`,
    `server_notice`. Gameplay authority removed.
  - Inbound `run_submit` validation, 3-second rate limit, server-side score
    recomputation with the 900 ms chain window.
  - `websocket_events.md` rewritten and reconciled side by side with the
    emitters/listeners.
  - Preconditions F1 (900 ms chain window), F3 (banned debris numbers
    stopgap in README), F4 (socket doc↔code reconciliation) and the
    DECISIONS amendment are committed.
  - Tests 26/26, lint clean, build clean. Server boots cleanly; all three
    endpoints return JSON.

- Phase 3: bare canvas + tether physics (this session)
  - `src/main.jsx` — React 18 entry: mounts the shell into `#root` once.
  - `src/app.jsx` — React shell: canvas mounted once in a ref; rAF loop
    started in an effect, outside React's render cycle; no per-frame
    `setState`. Fixed-step 60 Hz accumulator, max 5 substeps per frame.
    Device-pixel-ratio canvas sizing, resize handling, visibility pause.
    Pointer (GRAB on down / RELEASE on up) and keyboard (`E` grab,
    `Space` hold thrust, `Q` release) input wired to the physics world.
  - `src/physics/world.js` — Verlet integrator, position-based distance
    constraints (12 iterations per fixed step), tether with fixed anchor
    / rest length / max length / rope slack behaviour / tension readout,
    planet-limb collision with bounce, seeded debug scenario (7 debris
    masses + limb, constant gravity, `?seed=` URL param), deterministic
    mulberry32 RNG. Zero allocations in the hot step loop; runs under
    Node for tests.
  - `src/physics/render.js` — Canvas 2D renderer; colours exclusively
    from `src/ui/tokens.js`.
  - `src/ui/tokens.js` — added `planetFill`/`planetStroke` tokens only
    (raw literals stay in the token modules).
  - `tests/physics.test.mjs` — determinism (same seed => same trace),
    finiteness over a long run, tether reach cap, thrust fuel drain,
    release clears tether and stops drain.
  - `index.html` — stripped to the bare React mount point; title/meta now
    Debris Derby. Legacy Solar Sentinel client files remain on disk,
    untouched and lint-ignored, until Phase 5 replaces them.

## Phase 2 preconditions
- **F1:** chain-detection window corrected to **900 ms** in docs/SPEC.md
  and docs/DECISIONS.md. Committed.
- **F2:** Celestrak integration written with loud-failure behaviour.
  Committed. Live fetch is **pending** because this sandbox blocks
  `celestrak.org:443`; mock tests cover success, stale, and unavailable.
  MUST verify on first deployment before submission.
- **F3:** banned debris numbers removed from `README.md`; full rewrite
  remains Phase 8.
- **F4:** side-by-side `websocket_events.md` ↔ code event reconciliation is
  complete.

## Phase 3 preconditions
- **H1:** deterministic trace from a seeded debug scenario — covered by
  `tests/physics.test.mjs`, committed and passing.
- **H2:** human swing verification — a human must grab, swing, and
  release a tethered object on the bare canvas before Phase 4 starts.
  **Awaiting human verification.**

## Rollback point
Phase 3 code: this commit. Phase 2 fallback: `7bc21cb`. Phase 1 fallback:
`095abf6`.

## Next session
After H2 passes, start Phase 4 (playable core loop + scoring).

## Known issues
- Celestrak live fetch unverified in agent environment — sandbox network
  blocks celestrak.org:443. Code written with loud-failure behaviour and
  mock-tested.
- README.md is still Solar Sentinel-era and will be rewritten in Phase 8.
- The old Solar Sentinel client files remain on disk (untouched,
  lint-ignored); `index.html` no longer loads them. Removal is scheduled
  for Phase 5.
- The ambient catalog uses Celestrak `GROUP=active`, so every ambient
  object has `isDebris: false`. Foreground game debris is client-side
  from Phase 3.
- The leaderboard is in-memory and resets on server restart. No accounts,
  no database.
- `dist/` is gitignored build output; it now builds the Phase 3 client.

## Pending human verification
- First deployment: verify the Celestrak fetch actually returns `live`.
- Phase 3 end: swing a tethered object yourself on the bare canvas (H2)
  — awaiting human verification.
- Phase 4 mid: play levels 1-3 yourself.
- Phase 5 end: open on real phone, not emulator.
- Phase 8: clean-clone README and follow verbatim.
