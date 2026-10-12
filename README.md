# ★ Astral Zero — Backend & Multiplayer Server

> Fast-paced 2D multiplayer arena shooter set in chaotic orbital junkyards. You are a
> zero-gravity **Space Janitor** fighting rogue AI machines and other players while
> collecting salvage, navigating shifting platforms, and exploiting momentum-based
> movement. Phaser 3 + Arcade Physics, Node + Express + Socket.io, bright/cartoonish
> 2D look, bouncy exaggerated movement.
>
> **Current state:** the authoritative multiplayer server is implemented and live —
> a 20 Hz server-authoritative simulation, party/friends/matchmaking lobbies, bot AI
> with difficulty tiers, server combat, scoring, lag compensation, late-join/reconnect,
> a scrap economy, and the arcade UI/UX overhaul. The socket contract is
> **`1.5.0-s14`**. See [FRONTEND.md](./FRONTEND.md) for the client and
> [docs/](./docs/) for design notes.

---

## 1. Tech stack

> 🎮 **Looking for the game client?** The Phaser 3 client (run it, controls,
> project structure, movement tuning, UI/UX) is documented separately in
> **[`FRONTEND.md`](./FRONTEND.md)** and **[`docs/UIUX.md`](./docs/UIUX.md)**.

| Layer | Tech |
|---|---|
| Game client | Phaser 3 + Vite (root `index.html`, `src/main.js`, `src/scenes/…`) |
| Backend | Node.js + Express 5 + Socket.io 4 (ESM — repo is `"type": "module"`) |
| Transport | Socket.io over WebSocket (JSON payloads, see `websocket_events.md`) |
| Dev | `nodemon` for backend hot reload, `dotenv` for `PORT` / `CORS_ORIGIN` |

The server runs **one authoritative fixed-step simulation** (`src/game/loop.js`) at
**20 Hz**. It owns match/room membership, matchmaking, character/bot spawning,
movement validation, collision, hits, damage, cooldowns, scoring, win conditions,
match timers, orbital-shift state, and every reward. The client predicts and
interpolates for responsiveness but never declares its own damage, rewards, hits,
match results, unlocks, or rating changes. There is **no second competing
simulation loop**.

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
  if (!socketEventsVersion.startsWith('1.4')) {
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

> `socket.io-client` **is** a dev dependency as of Phase 2 — the Phaser client has a
> full netcode layer (`src/net/`) and the lobby/arena both run live. See
> [FRONTEND.md](./FRONTEND.md).

**3. Check compatibility at boot:** `GET /api/info → socketEventsVersion` must equal the
version your netcode was written against. The client probes this at boot
(`NetworkManager._probeContract`) and surfaces an `OUTDATED SERVER` state rather
than letting every button fail silently.

## 5. REST endpoints (stub)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe: `{ game, status: "ok", version, uptimeSeconds }` |
| `GET` | `/api/info` | Contract discovery: `socketEventsVersion`, event list, roadmap |
| `GET` | `/` (no build) | Backend status page (hint to run `npm run dev` / `npm run build`) |
| `GET` | `/*` (built) | Game + assets from `dist/`, raw files from `public/` |

## 6. Socket events (summary — details in `websocket_events.md`)

Contract **`1.5.0-s14`**. Names live in `src/sockets/events.js`; shapes live in
`websocket_events.md`. The authoritative groups:

| Group | Events | Behavior |
|---|---|---|
| Connection | `connected` | Welcome + contract-version handshake |
| Identity | `player_join` / `player_leave` | Keys friends + first-match protection; leave on disconnect |
| Authoritative sim | `player_input` (primary), `entity_snapshot` (20 Hz), `entity_death`, `entity_respawn`, `score_update` | Client sends **intent**; server resolves physics, hits, damage, scoring |
| Combat | `player_shoot` / `player_melee` | Validated triggers; the server spawns shells / arc-tests melee |
| Bots | `bot_spawn` / `bot_update` / `bot_death` | Server-driven AI (chase/strafe/flee, difficulty tiers); client emits ignored |
| Parties | `party_create/join/leave/start_match/invite(_invited)/update` | Max 4, 6-char code, leader starts, whole party moves together |
| Friends | `friend_add/remove/list/update` | In-memory, survives reconnect by normalized name |
| Matchmaking | `queue_join/leave/update`, `match_found` | Solo queue + party start + bot fill + first-match protection |
| Rooms | `room_joined/leave/update`, `room_join` (late), `match_end` | Authoritative roster; return to lobby on end |
| Extras | `streak_event` (medals), `scrap_event` (economy), `pickup_collected` | Additive Phase 4/5 systems |
| Errors | `error_event` | Uniform `{ code, message }` envelope |

**Bot Practice matchmaking (locked requirement):** `mode: "bot_practice"` never
enters the public queue — the server boots a dedicated AI-only room for the
requester instantly, with validated/clamped `botCount` + `difficulty`. A duplicate
request while seated is rejected with `ALREADY_IN_MATCH`. See §7 of
`websocket_events.md`.

## 7. Implemented vs. planned

### Implemented (verified by `npm run test:all`)

- **Authoritative 20 Hz simulation** — server physics, movement validation, collision.
- **Party system** — create/join/leave/invite, 6-char code, leader starts, whole party moves together.
- **Friends system** — add/remove/list, in-memory, survives reconnect by normalized name.
- **Matchmaking** — solo queue + party start + bot fill + **first-match protection**.
- **Bot Practice** — dedicated AI-only room, **never enters the public queue**, server-validated `botCount` + `difficulty`.
- **Rooms & lifecycle** — authoritative roster, countdown → playing → end → lobby, spectators, late-join, reconnect grace.
- **Bot AI** — chase/strafe/flee/jump, team-aware, four difficulty tiers (`beginner/normal/advanced/elite`), personalities.
- **Server combat** — projectiles, melee arcs, lag-compensated hits, death/respawn, spawn protection.
- **Scoring & win conditions** — ffa/tdm limits + overtime, scrap_collector banking, control-point holding, medals/streaks, XP.
- **Scrap economy** — collectible tokens, carry cap, deposit stations.
- **Three maps**, an **audio engine**, **progression**, a **spectator camera**.
- **Arcade UI/UX** — lobby, boot screen, HUD, responsive tiers, accessible (see `docs/UIUX.md`).
- Client netcode with **prediction/reconciliation** and snapshot interpolation (`src/net/`).
- **Season 14** (contract `1.5.0-s14`, all server-authoritative):
  - **Character roster + tiers** with signature weapons, movement skills, abilities and **loadout variants** (`src/shared/characters.js`, `src/shared/loadouts.js`). Selection is validated against the shared roster and the player's persisted unlocks, so a locked or unknown character is refused rather than silently swapped.
  - **Ranked** — placement series then Elo on `ffa`/`tdm` only, written once per eligible match from server-scored `match_end`. Draws, abandoned matches, parties, practice and scrap never move a ladder; unrated modes can never be flagged ranked. See `websocket_events.md` §28.
  - **Orbital shifts** — telegraphed platform drift with a warn → shift → settle machine.
  - **Scrap Mimics** — decoy tokens that arm and chase, paying more than the token they imitated.
  - **Control Point** — a contested point that freezes while both teams are on it.
  - **Durable profiles** — a debounced, atomic JSON store (`src/players/persistence.js`); set `persistence.enabled: false` to run fully in-memory.

### Planned / partially implemented (NOT complete — do not treat as shipped)

- **Three distinct currencies** — combat scrap (match) exists; progression tokens and cosmetic credits are not separated yet.
- **Scrap Boxes & character unlocks** — drop odds, pity, duplicate protection. Only the starter character unlocks today.
- **Season Pass & mastery** — XP and a `mastery` map exist; there is no pass, track or mastery reward chain.
- **Team character uniqueness** (no duplicate characters per team).
- **Real sprite/audio assets** — the client is currently fully procedural (zero art committed).
- Mid-fight puzzles, jumpscares, rocket-jump validation.

## 8. Testing

```bash
npm test            # party/friends/mode/leader-permission behaviour
npm run test:bots   # Bot Practice bypasses the public queue (regression)
npm run test:all    # every suite (UI, lobby, HUD, netcode, combat, bots, camera…)
npm run build       # production bundle → dist/
```

`tests/phaser-stub.mjs` lets the real game modules load in plain Node, so most
suites run without a browser or a backend. `tests/matchmaking-bots.test.mjs`
drives the real matchmaking manager against a fake Socket.io server.

## 9. Contributing

- Event change? Update **three** places: `websocket_events.md` + `src/sockets/events.js` + changelog row, then bump `SOCKET_EVENTS_VERSION` (breaking) or the MINOR (additive). **The current contract is `1.5.0-s14`.**
- Keep handlers thin; future game systems get their own modules under `src/game/` (backend-only names, no clash with `src/scenes/`).
- Backend scripts: `npm run dev:server` (nodemon) / `npm start`. Game scripts: `npm run dev` (Vite) / `npm run build`.

---

*Built for the NASA Space Apps Challenge 2026: Astro Sweepers. Clean up orbit with extreme prejudice. 🧹🔫*
