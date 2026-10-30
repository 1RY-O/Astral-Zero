# Recon — Phase 0 Inventory

> **Reference only.** This file does not override `docs/DECISIONS.md`,
> `docs/STATUS.md`, or `docs/SPEC.md`. If they disagree, they win.

Rebuilt on 2026-10-30 from a direct read of the branch. No Phase 0
reconnaissance report was recoverable: `docs/` has never contained a
`RECON.md`, and the only docs ever deleted from history are
`docs/PHASE2.md`, `docs/S14_PLAN.md`, and `docs/UIUX.md` (commit `502d25f`).
Nothing in this file is a recovered original — it is a fresh inventory.

## Snapshot

| Item | Value |
|---|---|
| Repo slug | `debris-derby` (working directory still `Astral-Zero`) |
| Branch | `feat/debris-derby` |
| HEAD | `095abf6 chore: adopt React 18 UI toolchain and design tokens` |
| Rollback point | `095abf6` |
| Tracked files | 30 |
| Untracked | `AGENTS.md`, `docs/` |
| Ignored | `dist/`, `opencode.json`, `node_modules/`, `playwright-output/` |
| Runtime | Node `>=20.19.0`, ESM (`"type": "module"`) |

`npm test` is 7/7 green, `npm run lint` is clean, and `npm run build`
succeeds (36 modules, ~98 kB JS / ~58 kB CSS). Those results are narrower
than they look: lint ignores every legacy backend and client file, and the
seven tests only cover design tokens.

## File inventory

### Backend (all Phase 2 rewrite targets)

| Path | Lines | Role | Disposition |
|---|---:|---|---|
| `server.js` | 60 | Express + Socket.io entry, graceful shutdown | Rewrite in Phase 2 |
| `src/app.js` | 100 | Express app factory, static hosting, SPA fallback | Rewrite in Phase 2 |
| `src/server-config.js` | 34 | Port, paths, refresh tuning, game identity | Rewrite in Phase 2 |
| `src/routes/api.js` | 145 | `/api/health`, `/api/info`, `/api/stats`, dev force-cascade | Rewrite in Phase 2 |
| `src/sockets/events.js` | 168 | Event-name registry + contract version + game modes | Rewrite in Phase 2 |
| `src/sockets/index.js` | 76 | Connection handler, welcome payload, cleanup handler | Rewrite in Phase 2 |
| `src/game/loop.js` | 707 | 2 Hz loop **and** full server gameplay authority | Replace in Phase 2 with `ambientCatalog` |
| `src/game/nasa-api.js` | 187 | TLE fetcher + hardcoded 2023 fallbacks | Replace in Phase 2 (endpoint is dead; see risks) |
| `src/game/orbital-calc.js` | 247 | SGP4 propagation, 800×600 equirectangular projection, risk 1–10 | Reusable with a rename/cleanup |

### Legacy Solar Sentinel client (do not touch before Phase 5)

| Path | Size | Role | Disposition |
|---|---:|---|---|
| `index.html` | 10 kB | Static multi-screen Solar Sentinel markup | Replace in Phase 5 |
| `src/main.js` | 2,162 lines | Vanilla-JS client, socket wiring, DOM/UI flow | Replace in Phase 5 |
| `src/orbitalMap.js` | 1,309 lines | Canvas 2D map renderer | Replace in Phase 5 |
| `src/styles.css` | ~78 kB | Legacy global stylesheet | Replace in Phase 5 |
| `src/audio.js` | 217 lines | Web Audio SFX | Replace in Phase 5 |
| `src/demoFeed.js` | 82 lines | Synthetic 2 Hz feed when the relay is silent | Replace in Phase 5 |

There is currently **no React mount**: React 18 is installed and Vite is
configured for it, but the Vite entry is still the legacy `index.html` →
`src/main.js`. The first React shell and canvas host arrive in Phase 3.

### Phase 1 foundation (keep)

| Path | Lines | Role |
|---|---:|---|
| `src/ui/tokens.js` | 114 | Palette + semantic tokens for canvas |
| `src/ui/tokens.css` | 229 | CSS custom properties, dark/light, reduced motion |
| `src/ui/theme.js` | 99 | `system` / `dark` / `light` preference + events |
| `src/ui/fonts.js` | 11 | `@fontsource` imports, no CDN |
| `tests/design-tokens.test.mjs` | 103 | 7 token/theme tests |
| `vite.config.js` | 43 | React plugin, `:5173`, `/api` + `/socket.io` proxy to `:3000` |
| `eslint.config.js` | 66 | Flat config; explicitly ignores all legacy files |

### Docs and repo config

| Path | Lines | Role | Disposition |
|---|---:|---|---|
| `README.md` | 152 | Solar Sentinel README | Rewrite in Phase 8 |
| `websocket_events.md` | 267 | Solar Sentinel socket contract | Rewrite in Phase 2 |
| `package.json` | 69 | `debris-derby@0.2.0`, deps and scripts | Keep, update per phase |
| `package-lock.json` | — | Lockfile | Keep |
| `.env.example` | 33 | Astral Zero-era comments | Update in Phase 2 |
| `LICENSE` | MIT | License | Keep |
| `public/assets/.gitkeep` | — | Static asset dir | Keep |
| `.gitignore` | 58 | Ignores `dist/`, `opencode.json`, secrets, output | Keep |
| `opencode.json` | 34 | Local harness config | **Untracked + ignored. Keep the local file; never commit it.** |
| `dist/` | build output | Ignored Vite build | Regenerate |

## Current Socket.io contract (as implemented, not as documented)

### Server → client

| Event | Payload (observed) |
|---|---|
| `connected` | `{ socketId, version: '1.0.0', serverName: 'Solar Sentinel', timestamp }` |
| `orbital_snapshot` | 2 Hz `{ timestamp, tick, objects[], currentWave, level, wave, globalEnergy, globalScore, collisionCount, gameActive, cleanupCost, energyThreshold }` |
| `level_up` | `{ level, wave, currentWave, count, energy, score }` |
| `proximity_timer` | `{ timers: { [id]: { remainingMs, riskLevel } }, timestamp }` |
| `collision_alert` | Impact/collision payload from `loop.js` |
| `game_over` | `{ reason, finalStats, ... }` |
| `cleanup_success` | `{ id, success, energy, score, cost, currentWave, wave }` |
| `cleanup_failed` | `{ id, success, reason, energy, cost }` |

Each snapshot object is
`{ id, name, x, y, riskLevel (1–10), altitude, velocity, ... }` where `x`/`y`
are pixels in the 800×600 equirectangular map, not geodetic coordinates.

### Client → server

| Event | Payload (observed) |
|---|---|
| `player_cleanup` | `{ id }` — destructured with no schema, range, or type validation; no acknowledgement callback |

`src/game/loop.js` broadcasts through `io.emit(...)`. There is no room
scoping, no per-socket state, and no inbound rate limiting.

### Documented contract (`websocket_events.md`)

`orbital_snapshot`, `player_cleanup` (request **with ack** + broadcast),
`collision_alert`, `cascade_event`, `game_over`, and a welcome payload of
`{ socketId, game, serverVersion, socketEventsVersion, message }`.

Documented but **never emitted**: `cascade_event`, `global_threat_level`.
Implemented but **not documented**: `level_up`, `proximity_timer`,
`cleanup_success`, `cleanup_failed`. The documented object shape is
`lat`/`lon`/`altKm`; the implemented shape is `x`/`y` pixels. The documented
`player_cleanup` uses `objectId` + `tick` + an ack; the implementation uses
`id` with no ack. The welcome payloads do not match.

`websocket_events.md` also describes a "server-authoritative" model that
Phase 2 removes by design.

## REST surface (current)

| Route | Status |
|---|---|
| `GET /api/health` | Live, returns `{ game, status, version, uptimeSeconds, timestamp }` |
| `GET /api/info` | Live, advertises `socketEventsVersion`, `orbital`, modes, roadmap |
| `GET /api/stats` | Live; imports `../game/loop.js` twice (first import is dead code) |
| `POST /api/dev/force-cascade` | Dev only (`NODE_ENV !== 'production'`) |

Missing for Phase 2: `/api/levels`, `/api/leaderboard`.

## Version-string disagreement

| String | Where |
|---|---|
| `1.0.0-solar-sentinel` | `websocket_events.md` (contract line + welcome example) |
| `1.5.0-s14` | `src/sockets/events.js` (`SOCKET_EVENTS_VERSION`, exposed by `/api/info`) |
| `1.0.0` | `src/sockets/index.js` welcome payload |
| `0.1.0` | `src/server-config.js` `gameVersion`, exposed by `/api/health` |
| `0.2.0` | `package.json` |

That is five version values across four files, not three. Phase 2 must
collapse all of them to one canonical contract string and one package
version policy.

## Risks and contradictions found

1. **Unverified debris numbers.** `README.md` claims "over 36,000 tracked
   objects" and "millions of untracked fragments larger than 1 cm". Both
   violate `DECISIONS.md` ("NASA ODPO or ESA primary only, and only if
   verified"). Do not repeat them; fix in Phase 8.
2. **Dead TLE source.** `src/game/nasa-api.js` calls
   `https://api.nasa.gov/api/tle/{norad}`. On 2026-10-30 that URL returns
   **HTTP 404**. Every fetch silently falls back to hardcoded 2023 TLEs, so
   "live NASA TLE data" in the current UI is not live. Phase 2 must source
   TLEs from Celestrak (or another primary GP source) and expose a
   `source: 'fallback'` flag.
3. **`ARCHITECTURE.md` is referenced but does not exist.** Both
   `vite.config.js` and the palette/architecture notes point to it. Add it
   in a later docs phase or stop referencing it; do not invent it in Phase 2.
4. **Identity drift.** `package.json` says `debris-derby@0.2.0`;
   `server-config.js` says `Solar Sentinel` / `0.1.0`; the document title and
   meta description say Solar Sentinel; the socket contract says
   `1.5.0-s14`.
5. **Lint coverage is not what it appears.** `eslint.config.js` ignores
   `server.js`, `src/app.js`, `src/audio.js`, `src/demoFeed.js`,
   `src/game/**`, `src/main.js`, `src/orbitalMap.js`, `src/routes/**`,
   `src/server-config.js`, and `src/sockets/**`. A clean lint run says
   nothing about the legacy backend/client. Un-ignore each file as its phase
   rewrite lands.
6. **No backend tests.** The only suite is `tests/design-tokens.test.mjs`.
   Phase 2 needs socket/endpoint tests; Phase 3+ needs physics tests.
7. **Extra palette literal.** `tokens.js` / `tokens.css` define
   `--pink-500-text-on-light: #E01A7A` (WCAG AA text variant of hot pink).
   The token test calls it a sanctioned derived text variant, but
   `DECISIONS.md` does not name it. It is a derivation, not a fourth brand
   colour, but DECISIONS should record it if it stays.
8. **Old client remains the real app.** The Vite build output is still the
   Solar Sentinel dashboard. Nothing in `dist/` exercises React. This is
   deliberate until Phase 5, but it means Phase 2–4 verification cannot use
   the built app as evidence.

## What is reusable

- Express + Socket.io + Vite + React 18 toolchain and lockfile.
- `satellite.js` and the SGP4 work in `src/game/orbital-calc.js` (rename,
  remove the 800×600 projection from the server path).
- Design tokens, theme module, self-hosted fonts, token tests.
- Server bootstrap shape (HTTP server, CORS, static hosting, shutdown).
- Graceful-shutdown handling and request logging.
- Hardcoded TLE fallbacks — but only as clearly labelled fallback data.

## What must be replaced, and when

- **Phase 2:** `src/game/loop.js` → `src/game/ambientCatalog.js`; all socket
  events; `/api/*`; server config identity; TLE source; `.env.example`.
- **Phase 5:** `index.html`, `src/main.js`, `src/orbitalMap.js`,
  `src/styles.css`, `src/audio.js`, `src/demoFeed.js`.
- **Phase 8:** `README.md`, remaining Solar Sentinel references, dead
  dependencies, audit list.

Nothing in this inventory authorises deleting the legacy client early.
