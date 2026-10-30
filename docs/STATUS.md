# Status

## Current phase
Phase 2 — backend rewrite. Mid-flight. All runtime code committed and
verified; the live Celestrak fetch gate is pending first deployment (see F2).

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

## Rollback point
Phase 2 code: commit `7bc21cb`. Phase 1 fallback: `095abf6`.

## Next session
Continue Phase 2: verify the live Celestrak fetch returns `live` on first
deployment (network egress to celestrak.org required). Do not begin Phase 3
until that gate is cleared.

## Known issues
- Celestrak live fetch unverified in agent environment — sandbox network
  blocks celestrak.org:443. Code written with loud-failure behaviour and
  mock-tested.
- README.md is still Solar Sentinel-era and will be rewritten in Phase 8.
- The old Solar Sentinel client is still the Vite entry and still listens
  for the removed socket events. It will show catalog/contract errors
  against the new server until Phase 5 replaces it. Deliberate.
- The ambient catalog uses Celestrak `GROUP=active`, so every ambient object
  has `isDebris: false`. Foreground game debris is client-side from Phase 3.
- The leaderboard is in-memory and resets on server restart. No accounts,
  no database.
- `dist/` still builds the legacy client until Phase 5. Phase 2 verification
  used the server tests and a live socket, not the built app.

## Pending human verification
- First deployment: verify the Celestrak fetch actually returns `live`.
- Phase 3 end: swing a tethered object yourself on the bare canvas.
- Phase 4 mid: play levels 1-3 yourself.
- Phase 5 end: open on real phone, not emulator.
- Phase 8: clean-clone README and follow verbatim.
