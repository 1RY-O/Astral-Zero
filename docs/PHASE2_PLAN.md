# Phase 2 Plan — Backend Rewrite

Working plan for 2026-10-30. Not a decision record; `docs/DECISIONS.md` wins.

## Preconditions

- **F1:** chain window corrected to **900 ms** in `docs/SPEC.md` and
  `docs/DECISIONS.md`. Phase 2's 2 Hz catalog tick is unrelated to the
  client-side 900 ms scoring chain.
- **F2:** Celestrak integration written with loud-failure behaviour.
  Live fetch is unverified because this sandbox blocks
  `celestrak.org:443`; mock tests cover success, stale, and unavailable.
- **F3:** banned debris numbers removed from `README.md`; full rewrite
  remains Phase 8.
- **F4:** side-by-side `websocket_events.md` ↔ code event reconciliation is
  a hard gate for this phase.

## Files added

- `src/game/tleSource.js` — Celestrak GP JSON fetch, validation, attribution.
- `src/game/ambientCatalog.js` — 2 Hz SGP4 catalog, `catalogStatus`.
- `src/game/runValidation.js` — levels, payload validation, server scoring.
- `src/game/leaderboard.js` — in-memory leaderboard.
- `tests/ambient-catalog.test.mjs`
- `tests/run-validation.test.mjs`
- `tests/server-api.test.mjs`
- `tests/socket-contract.test.mjs`

## Files replaced

- `server.js`, `src/app.js`, `src/server-config.js`
- `src/routes/api.js`
- `src/sockets/events.js`, `src/sockets/index.js`
- `websocket_events.md`, `.env.example`
- `eslint.config.js` — un-ignore rewritten server files; keep legacy client
  ignores until Phase 5.

## Files deleted (listed before deletion)

- `src/game/loop.js` — server gameplay authority, replaced by
  `ambientCatalog.js`.
- `src/game/nasa-api.js` — dead `api.nasa.gov` TLE endpoint, replaced by
  `tleSource.js`. No fallback TLE file is kept.
- `src/game/orbital-calc.js` — 800×600 map projection and risk scoring are
  gameplay concerns; SGP4 propagation moves into `ambientCatalog.js`.

No client file is deleted in Phase 2. The old Solar Sentinel bundle stays
until Phase 5.

## Contract

- Canonical version: `2.0.0-debris-derby`.
- Events: `connected`, `ambient_catalog`, `run_submit` (ack),
  `leaderboard_update`, `server_notice`.
- REST: `GET /api/health`, `GET /api/levels`, `GET /api/leaderboard`.
- TLE source: `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json`.
- `catalogStatus`: `live` | `stale` | `unavailable`. No silent fallback.

## Commit chunks

1. `docs: record Phase 2 plan and contract amendments`
2. `feat(server): add Celestrak ambient catalog with loud failure`
3. `feat(server): rewrite REST and socket contract`
4. `docs: rewrite websocket contract for Debris Derby`
5. `docs: record Phase 2 completion and deployment verification`

## Verification gates

- `npm test` (mock success, stale, unavailable, validation, endpoints,
  socket tick).
- `npm run lint`.
- `npm run build`.
- Server boots cleanly; all three endpoints return JSON.
- Socket connects, receives a tick, disconnects.
- `websocket_events.md` diff shows one documented entry per emitter and one
  emitter per documented entry.
- Version grep in runtime code + contract doc finds only
  `2.0.0-debris-derby`.
- Live Celestrak fetch remains pending first deployment.
