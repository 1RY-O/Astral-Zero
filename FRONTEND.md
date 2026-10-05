# Astral Zero — Game Client (Frontend)

> The Phaser 3 client for Astral Zero. For the Express + Socket.io backend,
> event contract, and REST endpoints, see the [main README](./README.md) and
> [`websocket_events.md`](./websocket_events.md).

A chaotic 2D arena platformer-shooter where you clean up space debris with extreme
prejudice. You are a heavily armed **space janitor** working low-Earth orbit.
Movement and gunfeel target **Raze 3** / **Unreal Flash 3**: strong gravity,
instant acceleration, satisfying jumps, and 360° mouse aiming.

---

## Status: UI/UX Overhaul — Arcade Lobby, Loading Screen & HUD ✅

| Area | Status |
| --- | --- |
| Phaser 3 + Arcade Physics, movement, jumping, aiming | ✅ |
| Arsenal-style over-the-shoulder camera | ✅ |
| SocketClient + NetworkManager (contract `1.4.0-phase5`) | ✅ |
| Party (create/join/6-char code, live roster, max 4) | ✅ |
| Friends (add by name/ID, list, one-click invite) | ✅ |
| Mode selection + solo queue + party-leader start | ✅ |
| Authoritative netcode: prediction, reconciliation, interpolation | ✅ |
| Bot AI, combat authority, lag compensation, respawn/scoring | ✅ |
| Audio engine (synthesized), progression, spectator cam | ✅ |
| **Original Astral Zero brand mark + orbital backdrop** | ✅ NEW |
| **Real loading screen driven by boot milestones** | ✅ NEW |
| **Arcade lobby: brand header, nav rail, Party focus, mode cards** | ✅ NEW |
| **Find Match CTA reflecting the true match state machine** | ✅ NEW |
| **Four-state connection pill (incl. RECONNECTING)** | ✅ NEW |
| **Game-first HUD with a responsive layout rect** | ✅ NEW |
| **Reusable feedback component (real events only)** | ✅ NEW |
| **Reduced-motion support across all new UI** | ✅ NEW |
| **Responsive tiers (320 / 768 / 1024 / 1440+)** | ✅ NEW |

> **See [docs/UIUX.md](./docs/UIUX.md)** for the design system, the state
> machines, the accessibility decisions, and the manual test checklist.

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
| `npm run test:uiux` | Design system: connection/CTA states, tiers, a11y, boot |
| `npm run test:lobby` | LobbyScene builds at every breakpoint, no overlap/leaks |
| `npm run test:hud` | ArenaHud builds at every breakpoint, bounds-checked |
| `npm run test:camera` | Third-person camera tests (framing + visibility) |
| `npm run test:all` | **Everything** (15 suites) |
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
| `?noLobbyFx` | Freeze the orbital backdrop (low-end devices / perf checks) |

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
│   ├── uiux.test.mjs          # ★ Design system: states, tiers, a11y, boot
│   ├── lobby-scene.test.mjs   # ★ LobbyScene builds at every breakpoint
│   ├── hud.test.mjs           # ★ ArenaHud builds at every breakpoint
│   └── phaser-stub.mjs        # Lets game modules load headlessly
└── src/
    ├── main.js                # Phaser.Game bootstrap, scene registration
    ├── config/
    │   ├── gameConfig.js      # ★ movement feel + arena layout
    │   ├── lobbyConfig.js     # ★ party limits, modes, teams, spawn points
    │   ├── cameraConfig.js    # ★ over-the-shoulder camera tuning
    │   ├── uiTheme.js         # ★ design tokens: colours, type, radii, motion
    │   └── viewportConfig.js  # ★ responsive tiers + hit-area floors
    ├── core/
    │   ├── Emitter.js         # Tiny pub/sub (no Phaser dependency)
    │   ├── Motion.js          # ★ reduced-motion choke point
    │   └── Settings.js        # Persisted preferences (localStorage)
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
    │   ├── widgets/           # Panel, Button, TextField, ToastLayer, Slider
    │   ├── lobby/             # Party, Friends, ModeSelector, NavRail, Profile
    │   ├── brand/             # ★ Logo, OrbitalBackdrop, StatusPill, ConnectionState
    │   ├── boot/              # ★ DOM loading screen (runs before Phaser)
    │   ├── fx/                # CombatFx, Feedback, FxPool, AmbientFx
    │   ├── hud/               # ArenaHud, Scoreboard, KillFeed, Medals, …
    │   └── menus/             # SettingsMenu
    └── scenes/
        ├── BootScene.js       # Generates gray-box textures procedurally
        ├── PreloadScene.js    # Asset manifest (placeholder for real art)
        ├── LobbyScene.js      # ★ Arcade lobby entry point
        └── ArenaScene.js      # Arena + camera + match spawn
```

> Backend files (`server.js`, `src/app.js`, `src/server-config.js`,
> `src/routes/`, `src/sockets/`) live alongside these and are documented in the
> [main README](./README.md).

## Design notes

**All tuning is centralised.** Gravity, jump height and the arena layout live in
`src/config/gameConfig.js`; party limits, game modes and team colours in
`src/config/lobbyConfig.js`; the camera in `src/config/cameraConfig.js`; the
entire visual design system (colours, type scale, radii, motion tokens) in
`src/config/uiTheme.js`; and the responsive breakpoints in
`src/config/viewportConfig.js`. Tune the game there without touching gameplay
logic.

**The UI cannot lie about state.** `src/ui/brand/ConnectionState.js` is a pure
function from the real `net.state` to what the player is shown. The status
pill and the Find Match CTA both read it, so they are structurally incapable of
disagreeing — a dead socket renders a disabled `OFFLINE` button, never a
clickable `FIND MATCH`. There is exactly one source of truth for four states
(`CONNECTING` / `ONLINE` / `RECONNECTING` / `OFFLINE`) and six CTA states.

**Responsiveness without touching the camera.** The design surface stays pinned
at 1280×720, because the Arsenal camera's framing maths is tuned around that
arena. Instead the *layout* is classified into `compact` / `medium` / `wide`
from the displayed canvas, and the lobby re-flows into 1 / 2 / 3 columns with
a matching hit-area floor (44 px, or 48 px on touch). The camera therefore
cannot regress, and the menus still work on a phone.

**Reduced motion is global, not per-widget.** `src/core/Motion.js` wraps every
tween. With `prefers-reduced-motion: reduce`, `Motion.tween()` runs at 0 ms so
objects land on their FINAL value instantly — a "skip the tween" approach would
strand buttons and bars at their start values, which is a bug, not a preference.

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
