# ★ Astral Zero — Backend (Phase 1 Skeleton)

> Fast-paced 2D arena platformer-shooter. You are a heavily armed **space janitor**
> cleaning low-Earth orbit junk — Raze 3 / Unreal Flash 3 feel, Phaser 3 + Arcade Physics,
> bright/cartoonish 2D look, bouncy exaggerated movement.
>
> **Phase 1 scope:** Express + Socket.io server skeleton, static hosting for the Phaser
> game, and a frozen JSON event contract. **No game logic, bot AI, or multiplayer rooms yet.**

---

## 1. Tech stack

> 🎮 **Looking for the game client?** The Phaser 3 client (run it, controls,
> project structure, movement tuning) is documented separately in
> **[`FRONTEND.md`](./FRONTEND.md)**. This README covers the backend only.

| Layer | Tech |
|---|---|
| Game client | Phaser 3 + Vite (root `index.html`, `src/main.js`, `src/scenes/…`) |
| Backend | Node.js + Express 5 + Socket.io 4 (ESM — repo is `"type": "module"`) |
| Transport | Socket.io over WebSocket (JSON payloads, see `websocket_events.md`) |
| Dev | `nodemon` for backend hot reload, `dotenv` for `PORT` / `CORS_ORIGIN` |

Single-player vs bots is the priority. Multiplayer rooms are a stretch goal —
the socket contract already reserves names so the frontend never breaks later.

## 2. Project structure

```text
Astral-Zero/
├── server.js              # Backend entry: HTTP + Socket.io bootstrap, listen on PORT
├── index.html             # Phaser shell (Vite root — the game canvas lives here)
├── vite.config.js         # Vite: dev on :5173, build output to dist/
├── dist/                  # Built game (gitignored, after `npm run build`) — served by backend
├── public/assets/         # Vite static assets (copied to dist/ verbatim, also served by backend)
├── src/
│   ├── main.js            # Phaser entry (frontend)
│   ├── config/            # Game tuning — FRONTEND (do not confuse with server-config.js)
│   ├── scenes/ entities/ input/   # Phaser game code (frontend)
│   ├── server-config.js   # Backend knobs: PORT, CORS, distDir, publicDir
│   ├── app.js             # Express factory: JSON + CORS + /api + static dist/ + public/
│   ├── routes/api.js      # GET /api/health, GET /api/info (contract version check)
│   └── sockets/
│       ├── events.js      # SOCKET_EVENTS registry — single source of truth for names
│       └── index.js       # initSockets(io): Phase-1 stub handlers (log + echo only)
├── websocket_events.md    # ★ THE CONTRACT — exact JSON for every event
├── .env.example           # Copy to .env to override PORT / CORS_ORIGIN
└── package.json           # scripts: dev (game) / dev:server (backend) / build / start
```

**Design rules:**

- `server.js` is thin — wiring only.
- `src/app.js` owns HTTP; `src/sockets/` owns realtime. Never mix them.
- Backend files (`server.js`, `server-config.js`, `app.js`, `routes/`, `sockets/`)
  and frontend files (`main.js`, `config/`, `scenes/`, …) share `src/` — the names
  never overlap. Check twice before adding a file.
- Event **names** live in `src/sockets/events.js`; event **shapes** live in `websocket_events.md`.
- No physics / damage / AI / rooms in Phase 1 by design (stubs log + rebroadcast).

## 3. Quick start

Requirements: **Node.js 18+** (`node --version`).

```bash
# 1. Install (game + backend deps together)
npm install

# 2. (optional) configure backend
cp .env.example .env   # PORT=3000, CORS_ORIGIN=*

# 3a. Run the GAME (Vite hot reload, http://localhost:5173)
npm run dev

# 3b. Run the BACKEND (in a second terminal, http://localhost:3000)
npm run dev:server

# 4. Ship it: build the game, then serve everything from ONE server
npm run build   # → dist/
npm start       # → game + API + sockets all on http://localhost:3000
```

Backend boot looks like:

```text
★ Astral Zero backend online ★
→ HTTP + Socket.io : http://localhost:3000
→ Phaser root      : http://localhost:3000/  (serves dist/ + public/)
→ Health check     : http://localhost:3000/api/health
```

Without a `dist/` build, `/` returns a status page pointing at `npm run dev` —
`/api/*` and Socket.io work regardless.

## 4. How the frontend connects (Phaser engineer start here)

**1. Read the contract:** [`websocket_events.md`](./websocket_events.md) — exact JSON for
`player_join`, `player_move`, `player_shoot`, `player_melee`, `player_health_update`,
`bot_spawn` / `bot_update`, plus reserved `puzzle_solved`, `jumpscare_trigger`,
`rocket_jump`, `pickup_collected`, `match_state`.

**2. Connect back to the backend.** During Vite dev the game (`:5173`) and the
backend (`:3000`) are on different origins — pass the URL explicitly.
In production (backend serving `dist/`) same-origin `io()` works:

```js
import { io } from 'socket.io-client';

const socket = import.meta.env.DEV
  ? io('http://localhost:3000') // Vite dev → backend
  : io();                       // production: same origin

socket.on('connected', ({ socketEventsVersion }) => {
  if (socketEventsVersion !== '1.0.0-phase1') {
    console.warn('Backend contract changed — update Phaser netcode!');
  }
  socket.emit('player_join',
    { name: 'MopLord42', mapId: 'junkyard', difficulty: 'normal' },
    ({ player }) => console.log('joined as', player.id));
});

// 20–30 Hz movement, events for shots/melee, listeners for everyone else:
socket.emit('player_move', { x, y, vx, vy, facing, seq, timestamp: Date.now() });
socket.on('player_move', ({ id, x, y }) => moveRemoteAvatar(id, x, y));
socket.on('bot_spawn', (bot) => spawnBot(bot));
```

> Needs `npm install socket.io-client` when Phase 2 netcode lands (not a dep yet —
> Phase 1 frontend runs offline).

**3. Check compatibility at boot:** `GET /api/info → socketEventsVersion` must equal the
version your netcode was written against (`1.0.0-phase1`).

## 5. REST endpoints (stub)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe: `{ game, status: "ok", version, uptimeSeconds }` |
| `GET` | `/api/info` | Contract discovery: `socketEventsVersion`, event list, roadmap |
| `GET` | `/` (no build) | Backend status page (hint to run `npm run dev` / `npm run build`) |
| `GET` | `/*` (built) | Game + assets from `dist/`, raw files from `public/` |

## 6. Socket events (summary — details in `websocket_events.md`)

| Event | Direction | Phase 1 behavior |
|---|---|---|
| `connected` | S → C | Welcome + version handshake |
| `player_join` / `player_leave` | C → S / S ⇒ C | Join broadcast; leave on disconnect |
| `player_move` | C → S ⇒ C | 20–30 Hz relay, sender `id` added |
| `player_shoot` | C → S ⇒ C | Per-shot relay (no hit detection yet) |
| `player_melee` | C → S ⇒ C | Mop-swing relay with `swingId` de-dupe |
| `player_health_update` | relay | Stub: anyone may report; 🔒 server-authoritative in Phase 2 |
| `bot_spawn` / `bot_update` / `bot_death` | S → C | Shapes frozen; server ignores client emits (+ `error_event`) |
| `puzzle_solved`, `rocket_jump`, `pickup_collected` | C → S ⇒ C | Reserved stubs: log + rebroadcast |
| `jumpscare_trigger`, `match_state` | S → C | Reserved server-only stubs |
| `error_event` | S → C | `{ code, message }` uniform errors |

## 7. Roadmap (post-Phase 1)

- [ ] **Phase 2:** `socket.io-client` in Phaser, authoritative movement + shooting, HP truth, bot spawner + AI, funny bot-name pool, 3 maps (`junkyard` → `solar-array` → `dead-satellite`), difficulty curves.
- [ ] **Phase 3:** mid-fight puzzles, jumpscares, rocket-jump validation, pickups/scores, name entry polish.
- [ ] **Stretch:** multiplayer rooms / matchmaking / lag compensation / persistence / anti-cheat.

## 8. Contributing

- Event change? Update **three** places: `websocket_events.md` + `src/sockets/events.js` + changelog row, then bump `SOCKET_EVENTS_VERSION`.
- Keep handlers in `src/sockets/index.js` thin; future game systems get their own modules (e.g. `src/game/bots.js` — backend-only name, no clash with `src/scenes/`).
- Backend scripts: `npm run dev:server` (nodemon) / `npm start`. Game scripts: `npm run dev` (Vite) / `npm run build`.

---

*Built for the NASA Space Apps Challenge 2026: Astro Sweepers. Clean up orbit with extreme prejudice. 🧹🔫*
