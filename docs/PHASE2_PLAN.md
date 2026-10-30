# Phase 2 Plan — Backend Rewrite

**Status: mid-flight (2026-10-30).** All Phase 2 runtime code is committed
and verified (26/26 tests, lint clean, build clean, real server boot with
endpoints and a socket tick). Live Celestrak fetch remains pending because
this sandbox blocks `celestrak.org:443`.

Working plan for 2026-10-30. Not a decision record; `docs/DECISIONS.md` wins.

## Preconditions
- **F1:** chain window corrected to **900 ms** in `docs/SPEC.md` and
  `docs/DECISIONS.md`. Committed.
- **F2:** Celestrak integration written with loud-failure behaviour.
  Committed. Live fetch is unverified because this sandbox blocks
  `celestrak.org:443`; mock tests cover success, stale, and unavailable.
  Gate: live fetch must return `live` on first deployment before this phase
  can close.
- **F3:** banned debris numbers removed from `README.md`; full rewrite
  remains Phase 8.
- **F4:** side-by-side `websocket_events.md` ↔ code event reconciliation is
  a hard gate for this phase. Committed.

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
1. `docs: record Phase 2 plan and contract amendments` — committed (1e9835c)
2. `feat(server): add Celestrak ambient catalog with loud failure` —
   committed (a0e2ad2)
3. `feat(server): rewrite REST and socket contract` — committed (7bc21cb)
4. `docs: rewrite websocket contract for Debris Derby` — done;
   `websocket_events.md` reconciled with code (shipped in 7bc21cb; §10
   shows one emitter per documented entry)
5. `docs: record Phase 2 completion and deployment verification` — PENDING
   (blocked on the live Celestrak fetch; do not mark complete until first
   deployment verifies `catalogStatus: live`)

## Verification gates
- `npm test` (mock success, stale, unavailable, validation, endpoints,
  socket tick). → 26/26 pass.
- `npm run lint`. → clean.
- `npm run build`. → clean.
- Server boots cleanly; all three endpoints return JSON.
- Socket connects, receives a tick, disconnects.
- `websocket_events.md` diff shows one documented entry per emitter and one
  emitter per documented entry.
- Version grep in runtime code + contract doc finds only
  `2.0.0-debris-derby`.
- Live Celestrak fetch remains pending first deployment.
