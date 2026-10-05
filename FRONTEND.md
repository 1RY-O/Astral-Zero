# Astral Zero — Game Client (Frontend)

> The Phaser 3 client for Astral Zero. For the Express + Socket.io backend,
> event contract, and REST endpoints, see the [main README](./README.md) and
> [`websocket_events.md`](./websocket_events.md).

A chaotic 2D arena platformer-shooter where you clean up space debris with extreme
prejudice. You are a heavily armed **space janitor** working low-Earth orbit.
Movement and gunfeel target **Raze 3** / **Unreal Flash 3**: strong gravity,
instant acceleration, satisfying jumps, and 360° mouse aiming.

---

## Status: Phase 2 — Lobby, Party, Friends & Third-Person Camera ✅

| Feature | Status |
| --- | --- |
| Phaser 3 + Arcade Physics setup | ✅ |
| Strong gravity + Raze-style movement | ✅ |
| Run (`A`/`D`, `←`/`→`) and jump (`Space`/`W`/`↑`) | ✅ |
| Gray-box arena (solid floor + 4 floating platforms) | ✅ |
| **Arsenal-style over-the-shoulder camera** | ✅ |
| **SocketClient + NetworkManager (Phase 2 contract)** | ✅ |
| **Lobby: create/join party, 6-char code, live member list (max 4)** | ✅ |
| **Friends: add by name/ID, list, one-click "Invite to Party"** | ✅ |
| **Mode selection: FFA / TDM / Bot Practice** | ✅ |
| **Solo queue + party-leader match start** | ✅ |
| **Lobby → Arena transition on match-ready (roster passed through)** | ✅ |
| **Bot spawning + per-mode/team tinting in the arena** | ✅ |
| **First-match protection messaging** | ✅ |
| Shooting, damage authority, bot AI, mid-fight HUD | ⏳ Phase 3 |

> **See [docs/PHASE2.md](./docs/PHASE2.md) for the full Phase 2 walkthrough** —
> camera tuning values, socket event mapping, and how to test every flow.

## Requirements

- [Node.js](https://nodejs.org/) **18+** (developed on 22.x)

## Quick start

```bash
npm install
npm run dev
```

Open **<http://localhost:5173>**.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload (`:5173`) |
| `npm run dev:server` | Express + Socket.io backend (`:3000`) — run this too |
| `npm run build` | Production bundle → `dist/` |
| `npm run preview` | Serve the built bundle locally to verify it |
| `npm start` | Production: one Express server hosts game + API + sockets |
| `npm test` | Lobby/UI behaviour tests (no browser needed) |
| `npm run test:camera` | Third-person camera tests (framing + visibility) |
| `npm run test:net` | Netcode: reconciliation, interpolation, combat, bot AI |
| `npm run test:netdebug` | The `?debug` netcode telemetry readout |
| `npm run test:combat` | Combat prediction vs. the server weapon table |
| `npm run test:feedback` | Hit markers, medals, scores, damage deltas |
| `npm run test:transport` | Socket transport: internal bus + listener buffering |
| `npm run test:audio` | Audio engine: autoplay policy, voice cap, mixing, loops |
| `npm run test:fx` | FX object pools: bounded, reused, never grown |
| `npm run test:progression` | Authoritative XP/level/medals rendered verbatim |
| `npm run test:world` | Server map payload, hazard zones, scrap tokens |
| `npm run test:wiring` | Phase 5 scene integration points |
| `npm run test:all` | All suites |

In development you want **two terminals**: `npm run dev:server` for the backend
and `npm run dev` for the game. The Vite client connects to
`http://localhost:3000` automatically (see `src/net/netConfig.js`).

The backend has its own scripts — see the [main README](./README.md).

### Debug mode

| Flag | Effect |
| --- | --- |
| `?debug` | Arcade Physics collision bodies, camera framing overlay, and the netcode telemetry readout (snap / soft-correction counts, max prediction error, snapshot age, and whether bots are server- or client-driven) |
| `?skipLobby` | Boot straight into the arena (skips the lobby) |
| `?skipName` | Skip the name prompt even with no saved name |
| `?server=URL` | Point the socket at a different backend (LAN/mobile testing) |
| `?fastToasts` | Shorten toast dwell time while iterating on the UI |

Append e.g. `?debug` to the URL: <http://localhost:5173/?debug>.

---

## Controls

| Action | Keys |
| --- | --- |
| Move | `A` / `D` or `←` / `→` |
| Jump | `Space`, `W`, or `↑` |
| Aim | Mouse — 360°, always tracks the cursor |

**Facing:** aim direction takes priority over movement direction, so the body
always flips to face the cursor. This is the twin-stick-shooter behavior we
want, and it means your facing no longer follows your feet.

---

## Project structure

```text
Astral-Zero/
├── index.html                 # Canvas mount point + loading shell
├── vite.config.js             # Bundler config (splits Phaser into its own chunk)
├── public/
│   └── assets/                # Sprites, atlases, audio → served at /assets/*
├── tests/
│   ├── lobby-ui.test.mjs      # Party/friends/mode behaviour (npm test)
│   ├── camera.test.mjs        # Over-the-shoulder framing (npm run test:camera)
│   └── phaser-stub.mjs        # Lets game modules load headlessly
└── src/
    ├── main.js                # Phaser.Game bootstrap, scene registration
    ├── config/
    │   ├── gameConfig.js      # ★ movement feel + arena layout
    │   ├── lobbyConfig.js     # ★ party limits, modes, teams, spawn points
    │   ├── cameraConfig.js    # ★ over-the-shoulder camera tuning
    │   └── uiTheme.js         # ★ shared colours + fonts for all UI
    ├── core/
    │   └── Emitter.js         # Tiny pub/sub (no Phaser dependency)
    ├── net/
    │   ├── SocketClient.js    # Only file that touches socket.io-client
    │   ├── NetworkManager.js  # ★ game-facing facade + all lobby/match state
    │   ├── MatchModel.js      # ★ normalises server payloads (pure, testable)
    │   ├── events.js          # Client-side mirror of the socket contract
    │   └── netConfig.js       # Server URL resolution (dev vs production)
    ├── camera/
    │   └── ThirdPersonCamera.js  # ★ Arsenal-style over-the-shoulder rig
    ├── input/
    │   └── InputManager.js    # Device input → serialisable intent snapshot
    ├── entities/
    │   ├── Player.js          # Local player: movement, jumping, aiming
    │   └── RemoteActor.js     # Other humans + bots (interpolated)
    ├── ui/
    │   ├── widgets/           # Panel, Button, TextField, ToastLayer
    │   ├── lobby/             # Party, Friends, ModeSelector, Invite, NameGate
    │   └── hud/               # ArenaHud (countdown, roster, leave)
    └── scenes/
        ├── BootScene.js       # Generates gray-box textures procedurally
        ├── PreloadScene.js    # Asset manifest (placeholder for real art)
        ├── LobbyScene.js      # ★ Phase 2 entry point
        └── ArenaScene.js      # Arena + camera + match spawn
```

> Backend files (`server.js`, `src/app.js`, `src/server-config.js`,
> `src/routes/`, `src/sockets/`) live alongside these and are documented in the
> [main README](./README.md).

## Design notes

**All tuning is centralised.** Gravity, jump height and the arena layout live in
`src/config/gameConfig.js`; party limits, game modes and team colours in
`src/config/lobbyConfig.js`; the camera in `src/config/cameraConfig.js`; and
every UI colour and font in `src/config/uiTheme.js`. Tune the game there
without touching gameplay logic.

**Scenes never touch the network directly.** They read `net.state` and call
intent methods (`net.createParty()`, `net.queueJoin()`, …). `NetworkManager`
owns every socket subscription, normalises payloads and turns error codes into
human sentences. Adding a UI screen therefore cannot leak socket listeners.

**Listener teardown is explicit.** Both `LobbyScene` and `ArenaScene` collect
their `net.on(...)` unsubscribe handles and release them on `SHUTDOWN`. Without
that, every lobby visit would double-bind and the UI would refresh N times per
event.

**Art is generated, not committed.** `BootScene` draws the placeholder janitor,
platforms and aim marker with Phaser Graphics at boot, so the repo ships no
binary art. Swapping in real sprites later only means changing texture keys.

**Input is already network-ready.** Gameplay code never reads the keyboard
directly. `InputManager` reduces raw input to a plain, JSON-serialisable intent:

```js
{ moveX: -1 | 0 | 1, jumpHeld: bool, jumpPressed: bool, aimX: num, aimY: num }
```

That is exactly the payload to send over Socket.io in Phase 3, and driving a
remote player or a bot means feeding the same object — no changes to `Player.js`.

**Physics is deterministic.** Arcade physics runs at a fixed 60 FPS step, which
is a prerequisite for netcode or rollback work later.

---

## Movement feel

| Constant | Value | Effect |
| --- | --- | --- |
| Gravity | `2600 px/s²` | Heavy, snappy falls |
| Run speed | `340 px/s` | Crosses the 1280px arena in ~3.8s |
| Jump velocity | `-1180 px/s` | ≈270px apex (measured 242px) |
| Acceleration | `4200 px/s²` | Near-instant response |
| Drag | `4600 px/s²` | Quick, weighty stop |
| Max fall speed | `1100 px/s` | Terminal velocity |
| Coyote time | `120 ms` | Still jump just after leaving a ledge |
| Jump buffer | `130 ms` | Jump pressed just before landing still fires |

The jump arc was verified in a real headless browser: a jump from the floor
rises **242px**, and the arena layout deliberately leaves the spawn column clear
so the first jump can never clip a platform.

---

## The camera (Phase 2)

The game uses an **Arsenal (Roblox) style over-the-shoulder third-person
camera** — never first person, never top-down.

Arsenal orbits a camera around a 3D character. Astral Zero is a 2D side-view
arena, where an orbit has no meaning, so the same *feel* is produced by
**framing** instead. Four things do the work, all tunable in
`src/config/cameraConfig.js`:

| Lever | Value | What it does |
| --- | --- | --- |
| `anchorXRatio` | `0.32` | Player sits in the left third — the screen shows the space you are aiming **into**, not wasted space behind you |
| `aimLeadPixels` | `150` | Mouse movement slides the framing toward the cursor |
| `shoulderBias` | `34` | Constant push opposite the aim — this is what actually sells "behind your shoulder" |
| `baseZoom` | `1.22` | Sits close, like Arsenal; tightens on aim, pulls back at full sprint |

**The player is always on screen.** A post-update guard snaps the framing if
smoothing would ever push the player toward an edge (with a deliberate 2-frame
grace so a single-frame flick never causes a visible pop). `maxZoom` is capped
at `1.5`, far below the ~3× that would be "inside the head".

> **Note on `boundsPadding`.** The gray-box arena is exactly the same size as
> the viewport, so with hard camera bounds Phaser clamps `scroll` to zero and
> the camera freezes dead-centre. `boundsPadding: 240` adds invisible headroom
> around the arena so the anchor and aim lead have room to move near the edges.
> Nothing is drawn there — it is overscan, not new level.

---

## Roadmap

- **Phase 3** — guns (hitscan + projectile), damage, bot AI, mid-fight HUD,
  three maps, puzzles and jumpscares.
- **Phase 4** — server-authoritative physics, matchmaking by skill rating.

---

*Clean up orbit with extreme prejudice. 🧹🔫*
