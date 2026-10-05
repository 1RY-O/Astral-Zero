# Astral Zero — WebSocket Event Contract (Phase 5)

> **Single source of truth** for all frontend ↔ backend communication.
> Server constants: `src/sockets/events.js` · Handlers: `src/sockets/index.js` (+ `src/sockets/handlers/`)
> Sim: `src/game/` · Bot AI: `src/ai/` · Combat: `src/combat/` · Lag comp: `src/lagcomp/` · Maps: `src/game/maps.js`
> Contract version: **`1.4.0-phase5`** (also exposed via `GET /api/info → socketEventsVersion`)

**Transport:** Socket.io, JSON payloads only. No binary frames in Phase 1.
**Authority model (Phase 1):** client-authoritative / echo relay. The server logs,
acknowledges, and rebroadcasts — it does **not** validate physics, damage, or pickups yet.
Phase 2 will make the server authoritative (marked `🔒 future` below).

**Conventions used everywhere:**

| Rule | Meaning |
|---|---|
| `C → S` | Client (Phaser) emits, server listens |
| `S → C` | Server emits, client listens |
| `S ⇒ C` | Server broadcasts to all *other* clients |
| `timestamp` | Unix ms from `Date.now()` (client clock; server re-stamps in Phase 2) |
| `seq` | Monotonic int per sender, for ordering / dropped-packet detection |
| `ack` | Optional Socket.io acknowledgement callback `{ ok: true, ... }` |
| Error envelope | `S → C` on `error_event`: `{ code: string, message: string }` |

Direction legend for each event: **client emits / server broadcasts / server-only.**

---

## 1. Connection lifecycle

### `connected` · `S → C` (welcome hello)

Sent once immediately after Socket.io handshake. Use it to verify contract compatibility.

```json
{
  "socketId": "abc123",
  "game": "Astral Zero",
  "serverVersion": "0.1.0-phase1",
  "socketEventsVersion": "1.0.0-phase1",
  "message": "Welcome to Astral Zero! See websocket_events.md for the contract."
}
```

Phaser boot checklist:

1. `fetch('/api/info')` → compare `socketEventsVersion`.
2. `const socket = io()` → wait for `connected`.
3. `socket.emit('player_join', …)` → enter map.

### `disconnect` · built-in (both sides)

Reason strings: `"transport close"`, `"ping timeout"`, `"client namespace disconnect"`, etc.
Server re-broadcasts presence as `player_leave` (see §2).

---

## 2. Player core

### `player_join` · `C → S`, then `S ⇒ C`

First game event every client must send. Joins the (currently global) arena.

**Client → Server:**

```json
{
  "name": "MopLord42",
  "mapId": "junkyard",
  "difficulty": "normal"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | Player-entered name, max 24 chars. Server truncates. No auth in Phase 1. |
| `mapId` | string | ❌ | Default `"junkyard"`. Future maps: `"solar-array"`, `"dead-satellite"`. |
| `difficulty` | string | ❌ | `"easy" \| "normal" \| "hard"`. Default `"normal"`. Stored only in Phase 1. |

**Server ack (`C ← S` callback):**

```json
{ "ok": true, "player": { "id": "<socketId>", "name": "MopLord42", "mapId": "junkyard", "difficulty": "normal", "joinedAt": 1728000000000 } }
```

Phase 4 reconnect: a re-seated return carries `{ "ok": true, "player": {…}, "rejoined": true, "roomId": "room_mg7_ab12" }` plus the full catch-up (§20).

**Server broadcast (`S ⇒ C`, to everyone *else*):** same `player` object.

### `player_leave` · `S ⇒ C`

Emitted by server when a socket disconnects. Clients should remove that avatar.

```json
{ "id": "<socketId>", "reason": "transport close", "timestamp": 1728000000000 }
```

### `player_move` · `C → S`, then `S ⇒ C` (high-frequency)

**LOBBY (not in a room):** legacy Phase 1/2 global relay, unchanged. Send at 20–30 Hz (throttle in Phaser!).

**IN A ROOM (Phase 3 authoritative):** the claimed `x`/`y` is IGNORED — the server owns positions. Only a velocity hint is extracted (`moveX`, else `facing`, else `sign(vx)`) and it steers the sim entity. Peers learn positions from `entity_snapshot` (§13), never from this echo. Prefer the `player_input` event (§13) for new code; this bridge exists so 1.1.0-phase2 builds keep steering on day one.

**Client → Server:**

```json
{
  "x": 320.5,
  "y": 480.0,
  "vx": 120.0,
  "vy": -260.5,
  "facing": 1,
  "seq": 1542,
  "timestamp": 1728000000000
}
```

| Field | Type | Notes |
|---|---|---|
| `x`, `y` | number | LOBBY ONLY. Ignored in rooms (server simulates). |
| `vx`, `vy` | number | Speed-hack clamped to `maxSpeed × 1.35`; sign hints intent in rooms. |
| `facing` | number | `-1` = left, `1` = right |
| `seq` | int | Increment per send; stale (`seq` ≤ last seen) dropped |
| `timestamp` | int | Send time, for interpolation |

**Server broadcast (lobby only):** `{ "id": "<senderSocketId>", ...sameFields }` (adds sender `id`).

> ✅ **Phase 3 (done):** server runs a 20 Hz fixed-tick sim; authoritative positions stream on `entity_snapshot`.

### `player_shoot` · `C → S`, then `S ⇒ C`

Fired per trigger pull / per bullet (shotgun = one event with `pelletCount`, not N events).

**LOBBY:** legacy rebroadcast with sender `id` added + `{ ok: true }` ack.

**IN A ROOM (Phase 3 authoritative):** validated trigger — cooldown-gated per weapon, muzzle re-anchored at the SERVER body, `angle` honored, `weaponId` validated (unknown ids keep the current weapon). Accepted shots spawn server projectiles AND re-emit room-scoped with server values (+ `speed`, `tick`). Rejected shots ack `{ ok: false, error: "COOLDOWN" | "DEAD" }` (+ `error_event`).

```json
{
  "x": 320.5,
  "y": 480.0,
  "angle": 0.785,
  "weaponId": "scrap-rifle",
  "seq": 88,
  "timestamp": 1728000000000
}
```

| Field | Type | Notes |
|---|---|---|
| `x`, `y` | number | LOBBY ONLY. Ignored in rooms (server re-anchors). |
| `angle` | number | Radians, Phaser convention (`0` = right, positive = clockwise). Honored in rooms. |
| `weaponId` | string | `"scrap-rifle" \| "mop-cannon" \| "debris-launcher"`. Validated in rooms. |
| `seq` / `timestamp` | int | Ordering / FX sync |

> ✅ **Phase 3 (done):** server spawns shells, resolves hits, emits damage via `player_health_update` / `entity_death` / `bot_death`.

### `player_melee` · `C → S`, then `S ⇒ C`

The janitor's sacred **mop swing**. Short-range arc attack.

**LOBBY:** legacy rebroadcast. **IN A ROOM:** validated swing — server arc-tests (±60°, 78 px + body) from the server body, applies damage + knockback. Ack `{ ok: true, hits, tick }` or `{ ok: false, error }`.

```json
{
  "x": 320.5,
  "y": 480.0,
  "direction": 1,
  "swingId": "uuid-or-counter",
  "timestamp": 1728000000000
}
```

| Field | Type | Notes |
|---|---|---|
| `direction` | number | `-1` / `1` (swing side; overrides facing in rooms when valid) |
| `swingId` | string | De-dupe key — receivers ignore repeats (important for laggy re-sends) |

### `player_health_update` · `S → C` (**server-only, enforced**)

The server is the ONLY writer. Client-sent values are rejected with `error_event { code: "NOT_AUTHORITATIVE" }` (the flip previewed since Phase 1).

```json
{
  "id": "<targetSocketId>",
  "hp": 65,
  "maxHp": 100,
  "reason": "bullet | melee | splash | respawn",
  "timestamp": 1728000000000
}
```

---

## 3. Bots (server-driven; AI live since Phase 3)

Clients **listen only**. If a client emits these, the server ignores the payload
and replies `error_event { code: "SERVER_ONLY_EVENT" }`. Bots now move, strafe,
jump, and shoot via `src/ai/botBrain.js` (see §14); positions stream through
`entity_snapshot` (§13) with `bot_update` kept as the legacy subset.

### `bot_spawn` · `S → C`

```json
{
  "botId": "bot_7f3a",
  "name": "Rusty McScrapface",
  "botType": "chaser | shooter | brute | kamikaze",
  "x": 800,
  "y": 200,
  "hp": 50,
  "maxHp": 50,
  "mapId": "junkyard",
  "timestamp": 1728000000000
}
```

> Bot names are random + funny (`"Sir Mops-A-Lot"`, `"Dust Bunny Prime"`, …).

### `bot_update` · `S → C` (bulk snapshot, 10 Hz in Phase 3)

```json
{
  "bots": [
    { "botId": "bot_7f3a", "x": 810.2, "y": 205.1, "vx": 60.0, "vy": 0.0, "hp": 50, "state": "chase" }
  ],
  "serverTick": 12345,
  "timestamp": 1728000000000
}
```

| Field | Notes |
|---|---|
| `state` | `"idle" \| "chase" \| "strafe" \| "attack" \| "flee" \| "dead"` (Phase 3 brain states). Handle unknown strings gracefully. |
| `serverTick` | Authoritative tick (20 Hz sim; this event ships every 2nd tick). |

Prefer `entity_snapshot` (§13) for rendering — `bot_update` is the legacy subset (kept so old FX + silence watchdogs keep working).

### `bot_death` · `S → C`

```json
{
  "botId": "bot_7f3a",
  "killedBy": "<socketId | null>",
  "cause": "bullet | melee | splash",
  "x": 810.2,
  "y": 205.1,
  "timestamp": 1728000000000
}
```

Clients play explosion FX + remove sprite. Fired alongside `entity_death` (§14, the richer event with killer names + respawn timers).

---

## 4. Reserved future events (names frozen, logic later)

Implement listeners now (safe to ignore until used); handlers exist server-side as log + rebroadcast stubs.

### `puzzle_solved` · `C → S`, then `S ⇒ C`

Mid-fight puzzle completion (e.g. reroute airlock power while bots swarm).

```json
{ "puzzleId": "airlock-1", "mapId": "junkyard", "solutionTimeMs": 12400, "timestamp": 1728000000000 }
```

Phase 2: server validates solution, opens doors / spawns reward, broadcasts to all.

### `jumpscare_trigger` · `S → C` (server-only)

Server tells a specific client (or all) to play a scare (flicker lights, vent burst, fake bot).

```json
{ "scareId": "vent-burst-a", "targetId": "<socketId | 'all'>", "intensity": 1, "timestamp": 1728000000000 }
```

`intensity`: `1` (mild) – `5` (full Raze-style screen shake + sting). Always client-skippable (accessibility).

### `rocket_jump` · `C → S`, then `S ⇒ C`

Rocket-jump / debris-boost easter egg movement tech.

```json
{ "x": 100.0, "y": 500.0, "angle": -1.57, "blastPower": 420.0, "selfDamage": 10, "timestamp": 1728000000000 }
```

Phase 2: server validates `blastPower` cap + applies `selfDamage` via `player_health_update`.

### `pickup_collected` · `C → S`, then `S ⇒ C`

Ammo / health / scrap pickup claim.

```json
{ "pickupId": "pickup_abc", "pickupType": "ammo | health | scrap", "amount": 25, "timestamp": 1728000000000 }
```

Phase 2: server owns pickup spawn/despawn tables; duplicate claims rejected.

### `match_state` · `S → C` (server-only)

Lobby → countdown → playing → game-over flow for 3-map progression + difficulty ramp.

**Phase 1 shape (still sent, backward compatible):**

```json
{ "phase": "lobby | countdown | playing | gameover", "mapId": "junkyard", "difficulty": "normal", "countdownMs": 3000, "timestamp": 1728000000000 }
```

**Phase 2 extended shape (room matches carry the roster):**

```json
{
  "roomId": "room_mg7_ab12",
  "phase": "countdown | playing | lobby",
  "mode": "ffa | tdm | bot_practice",
  "mapId": "junkyard",
  "difficulty": "normal",
  "players": [{ "id": "<socketId>", "name": "MopLord42", "team": null, "x": 120, "y": 300, "hp": 100, "maxHp": 100, "isBot": false }],
  "bots": [{ "id": "bot_x1", "botId": "bot_1", "name": "Sir Mops-A-Lot", "team": null, "x": 800, "y": 200, "hp": 50, "maxHp": 50, "isBot": true }],
  "entities": [{ "...human or bot, same shape — spawn everything in one loop" : true }],
  "countdownMs": 3000,
  "timestamp": 1728000000000
}
```

| Field | Notes |
|---|---|
| `roomId` | Phase 2 only. Which room this state belongs to. |
| `mode` | Phase 2 only. `ffa` (max 10) · `tdm` (4v4) · `bot_practice` (bots only). |
| `players` / `bots` / `entities` | Phase 2 only. Authoritative roster: `id, name, team, x, y, hp, maxHp, isBot`. `team` is `null` except tdm (`red`/`blue`). |
| `phase: lobby` | Return-to-lobby signal after `match_end` — show lobby/party UI again. |

### `error_event` · `S → C`

Uniform error envelope (named `error_event`, **not** `error`, to avoid colliding with Socket.io's built-in error channel).

```json
{ "code": "SERVER_ONLY_EVENT | NOT_AUTHORITATIVE | BAD_PAYLOAD | BAD_ORIGIN | RATE_LIMITED | STALE_SEQ | INPUT_JUNK | SPECTATING | NOT_JOINED | NOT_IN_ROOM | ALREADY_IN_MATCH | NO_ROOM_TO_JOIN | ROOM_FULL | FIRST_MATCH_PROTECTED | NOT_LEADER | PARTY_FULL | PARTY_NOT_FOUND", "message": "Human-readable detail" }
```

---

## 7. Party system (Phase 2 — max 4, 6-char code, leader starts)

One party at a time per socket. Parties persist through matches (`roomId` set while playing, cleared on `match_end`). Leader leaving promotes the oldest remaining member; last leave disbands.

### Party object (shared shape in every ack + `party_update`)

```json
{
  "code": "A7K9P2",
  "leaderId": "<socketId>",
  "leaderName": "MopLord42",
  "members": [{ "id": "<socketId>", "socketId": "<socketId>", "name": "MopLord42" }],
  "memberCount": 2,
  "maxSize": 4,
  "mode": "ffa | tdm | bot_practice | null",
  "roomId": null,
  "createdAt": 1728000000000
}
```

### `party_create` · `C → S` (acked)

```json
// emit: {} — no args needed (creator becomes leader)
```

Ack: `{ "ok": true, "party": { "...see above" } }`.
Server also emits `party_update` to all members (just the creator here).
Error: `{ "ok": false, "error": "NOT_JOINED" }` (emit `player_join` first).

### `party_join` · `C → S` (acked)

```json
{ "code": "a7k9p2" }
```

Code is trimmed + uppercased server-side. Ack: `{ "ok": true, "party": {…} }`.
Server emits `party_update` to **all** members (real-time sync).
Errors: `MISSING_CODE` · `PARTY_NOT_FOUND` · `PARTY_FULL` (each also pushed on `error_event`).

### `party_leave` · `C → S` (acked)

```json
// emit: {} — leaves your current party
```

Ack: `{ "ok": true, "party": {…} | null, "disbanded": false }`.
Survivors get `party_update`; the leaver gets `party_update { party: null }` so lobby UI resets.

### `party_update` · `S → C` (real-time sync)

```json
{ "party": { "...party object or null when disbanded/left" : true }, "timestamp": 1728000000000 }
```

Listen always while in lobby — this is how promotions, joins, and room links arrive.

### `party_start_match` · `C → S` (leader only, acked)

```json
{ "mode": "ffa | tdm | bot_practice", "mapId": "junkyard", "code": "A7K9P2 (optional — membership wins when omitted)" }
```

- Only `leaderId` may call it → else `NOT_LEADER` (+ `error_event`).
- Whole party moves into ONE room (see §10 `room_joined` + `match_state`).
- First-match protection: if ANY member never finished a real match and `mode != bot_practice`, the whole party drops to `bot_practice` (stays together by design).

Ack (success):

```json
{ "ok": true, "roomId": "room_mg7_ab12", "mode": "bot_practice", "requestedMode": "ffa", "firstMatchProtection": true }
```

Errors: `NOT_IN_PARTY` · `NOT_LEADER` · `NO_MEMBERS_ONLINE`.

### `party_invite` · `C → S` (acked) + `party_invited` · `S → C`

Invite a friend straight in — no code sharing. Accepts socket id OR username:

```json
// invite by name (works offline-tolerant? no — must be ONLINE to deliver):
{ "friendName": "DustBuster" }
// ...or by live socket id:
{ "friendId": "<socketId>" }
```

Ack: `{ "ok": true, "invited": "DustBuster", "partyCode": "A7K9P2" }`.
Errors: `NOT_IN_PARTY` · `PARTY_FULL` · `FRIEND_OFFLINE`.

Invitee receives:

```json
{ "partyCode": "A7K9P2", "fromId": "<socketId>", "fromName": "MopLord42", "memberCount": 2, "timestamp": 1728000000000 }
```

Invitee joins with `party_join { code: partyCode }` (normal capacity checks apply).

---

## 8. Friends system (Phase 2 — persistent in-memory, survives reconnect)

Keyed on normalized username (trim + lowercase), NOT socket id — refresh with the same name and your list is intact. One-way (follow-style): adding puts them on YOUR list; mutual needs mutual add. Presence (`online`) resolves live on every list.

Friend entry:

```json
{ "id": "<socketId when online, else stable key>", "name": "DustBuster", "online": true }
```

### `friend_add` · `C → S` (acked)

```json
{ "friendName": "DustBuster" }
// or:
{ "friendId": "<socketId>" }
```

At least one field required. Offline-by-name adds work (entry shows `online: false`).
Ack: `{ "ok": true, "friends": [{…}] }`. Server also pushes `friend_update`.
Errors: `NOT_JOINED` · `MISSING_FRIEND` · `CANNOT_ADD_SELF`.

### `friend_remove` · `C → S` (acked, idempotent)

```json
{ "friendId": "<socketId | username | key>" }
```

Removing a non-friend still acks `{ ok: true, removed: false }`.

### `friend_list` · `C → S` (acked)

```json
// emit: {} — fetch current list with live presence
```

Ack: `{ "ok": true, "friends": [{…}] }`. (Server also pushes a `friend_update` right after `player_join` so lobby renders with zero extra calls.)

### `friend_update` · `S → C` (push)

```json
{ "friends": [{ "id": "…", "name": "…", "online": true }], "timestamp": 1728000000000 }
```

---

## 9. Game modes + matchmaking (Phase 2)

Modes (locked): `"ffa"` (Free-for-All, max 10) · `"tdm"` (Team Deathmatch, 4v4 = 8, red vs blue) · `"bot_practice"` (bots only, friendly practice).

Readiness (tuning: `src/server-config.js → gameModes`):

| Mode | Instant start | Fallback | Bot fill |
|---|---|---|---|
| `ffa` | ≥2 waiting | 5 s → start with whoever waits | top up to 6 total |
| `tdm` | ≥4 waiting | 10 s → start with whoever waits | fill to 8 (4v4) |
| `bot_practice` | always (solo room, never groups strangers) | n/a | 1 human + 5 bots (target 6) |

**First-match protection:** if a player never finished a REAL (non-`bot_practice`) match, the server forces `bot_practice` even when they queued/chose something else. Ack carries `{ firstMatchProtection: true, requestedMode, mode: "bot_practice" }` so lobby can explain it. For parties, ANY new member forces the whole party (stays together). `bot_practice` finishes never graduate anyone — only real matches count.

### `queue_join` · `C → S` (acked)

```json
{ "mode": "ffa | tdm | bot_practice", "mapId": "junkyard" }
```

Ack (parked — wait for `queue_update` / `match_found`):

```json
{ "ok": true, "mode": "ffa", "requestedMode": "ffa", "firstMatchProtection": false, "position": 1, "playersInQueue": 1, "instant": false }
```

Ack (instant room — solo bot-practice or threshold met):

```json
{ "ok": true, "mode": "bot_practice", "requestedMode": "ffa", "firstMatchProtection": true, "position": 0, "roomId": "room_mg7_ab12", "instant": true }
```

`room_joined` + `match_found` + `match_state{ phase: countdown }` follow on instant success (see §10). Errors: `NOT_JOINED` · `BAD_MODE` · `ALREADY_IN_MATCH`.

### `queue_leave` · `C → S` (acked)

```json
// emit: {} — drops you from every queue
```

Ack: `{ "ok": true }`.

### `queue_update` · `S → C` (positions)

```json
{ "mode": "ffa", "position": 1, "playersInQueue": 3, "timestamp": 1728000000000 }
```

Pushed to everyone waiting in that mode after each join/leave/fill.

### `match_found` · `S → C` (lobby hook)

```json
{ "roomId": "room_mg7_ab12", "mode": "ffa", "mapId": "junkyard", "partyCode": "A7K9P2 | null", "timestamp": 1728000000000 }
```

"Match ready, loading arena…" — then `room_joined` carries the spawn roster.

---

## 10. Room lifecycle (Phase 2 — authoritative roster, return to lobby)

1. **Create** — solo threshold/fallback fires, or party leader starts (whole party seated together; offline members skipped).
2. **Load** — every human socket `join(roomId)`s the Socket.io room.
3. **Spawn** — each human gets `match_found` + `room_joined` (full roster in `entities`), the room gets `match_state{ phase: countdown }` (extended shape, §4) plus legacy `player_join` per human + `bot_spawn` per bot so Phase 1 spawn code keeps working.
4. **Play** — `countdown` (default 3 s) → `match_state{ phase: playing }`. (Movement stays global-relay in Phase 2; room-scoped ticks are Phase 3.)
5. **End** — `match_end` (results) + `match_state{ phase: lobby }`; sockets leave the io room; party link cleared + `party_update` restores lobby UI. Safety auto-end after 5 min.

Authoritative entity (humans AND bots, unified):

```json
{ "id": "<socketId | bot_x1>", "name": "MopLord42", "team": "red | blue | null", "x": 120, "y": 300, "hp": 100, "maxHp": 100, "isBot": false }
```

`tdm` alternates `red`/`blue` in join order (team-aware party placement is Phase 3).

### `room_joined` · `S → C` (spawn everything from this)

```json
{
  "room": {
    "roomId": "room_mg7_ab12",
    "mode": "ffa",
    "mapId": "junkyard",
    "phase": "countdown",
    "players": [{ "...authoritative human" : true }],
    "bots": [{ "...authoritative bot" : true }],
    "entities": [{ "...humans + bots — ONE spawn loop" : true }],
    "playerCount": 2,
    "botCount": 4,
    "countdownMs": 3000,
    "createdAt": 1728000000000
  },
  "timestamp": 1728000000000
}
```

### `room_leave` · `C → S` (acked, voluntary exit)

```json
// emit: {} — exits your current room
```

Ack: `{ "ok": true, "left": true, "roomId": "room_mg7_ab12", "empty": false }`. Survivors get `room_update` (+ legacy `player_leave`).

### `room_update` · `S → C` (survivor sync)

```json
{ "room": { "...same shape as room_joined.room" : true }, "leftId": "<socketId>", "timestamp": 1728000000000 }
```

### `match_end` · `S → C` (results) + `C → S` (early-finish request)

Client request (any member in Phase 2 stub; host checks are Phase 3):

```json
{ "reason": "manual" }
```

Ack: `{ "ok": true, "result": {…} }` or `{ "ok": false, "error": "NOT_IN_ROOM" }`.

Server broadcast (followed by `match_state{ phase: lobby }` + party restore).
Win conditions live in §15; the payload always carries the full scoreboard:

```json
{
  "roomId": "room_mg7_ab12",
  "mode": "ffa",
  "mapId": "junkyard",
  "reason": "score_limit | time_limit | draw | practice_complete | manual | timeout",
  "winner": { "id": "<socketId>", "name": "MopLord42", "team": null, "isBot": false },
  "teams": null,
  "scores": [{ "id": "<socketId>", "name": "MopLord42", "team": null, "kills": 10, "deaths": 3, "score": 10, "isBot": false }],
  "results": [{ "id": "<socketId>", "name": "MopLord42", "team": null, "isBot": false, "score": 10, "kills": 10, "deaths": 3 }],
  "firstMatchGraduated": ["MopLord42"],
  "timestamp": 1728000000000
}
```

| `reason` | `score_limit` (kill/team target hit) · `time_limit` (clock expired) · `draw` (tdm tie) · `overtime` (tdm sudden-lead, §20) · `practice_complete` (practice timer, never a winner) · `manual` (client request) · `timeout` (5 min safety) |
| `winner` | ffa: top score · tdm: `{ team: "red" \| "blue" }` (+ null on draw) · practice: always null |
| `teams` | tdm only: `{ red, blue }` final team scores, else null |
| `scores` | EVERYONE (humans + bots), sorted score desc / deaths asc |
| `results` | Legacy humans-only standings (Phase 2 shape + real kills/deaths) |
| `firstMatchGraduated` | Humans credited with a REAL match (empty for `bot_practice` — practice never graduates) |

---

## 13. Authoritative movement + entity snapshots (Phase 3 — 20 Hz sim)

The server runs ONE fixed-step loop (`src/game/loop.js`, `tickHz: 20`) driving every `playing` room: input → bot AI → physics → projectiles → damage → respawns → win check → snapshot. Clients send INTENT; the server owns positions, velocities, and facing.

### `player_input` · `C → S` (acked, primary channel)

Send at up to 60 Hz (server rate-caps at ~120 Hz; stale `seq` dropped). Missing input = idle (no fire); 1.5 s of silence = stale = idle (no corpse-running).

```json
{
  "moveX": 1,
  "jump": false,
  "jumpHeld": true,
  "aimX": 900.0,
  "aimY": 300.0,
  "fire": true,
  "melee": false,
  "weaponId": "scrap-rifle",
  "seq": 1543,
  "timestamp": 1728000000000
}
```

| Field | Type | Notes |
|---|---|---|
| `moveX` | number | Clamped to [-1, 1]. `-1` left, `+1` right. NaN → 0. |
| `jump` | bool | Edge: pressed THIS packet (buffered ~120 ms server-side; coyote ~100 ms). |
| `jumpHeld` | bool | Level: held for variable jump height. |
| `aimX`/`aimY` | number | World-space aim point (clamped to arena). Drives facing + shot angle. |
| `fire` | bool | Level: held = shoot at weapon cadence (server cooldown gates). |
| `melee` | bool | Edge: one swing per press (server cooldown gates). |
| `weaponId` | string | Optional switch (`scrap-rifle \| mop-cannon \| debris-launcher`); unknown ids keep current. `weaponSlot` int also accepted. |
| `seq` | int | Monotonic per sender; stale/duplicate dropped. |

Ack: `{ "ok": true, "seq": 1543 }` or `{ "ok": false, "error": "NOT_JOINED" | "STALE_SEQ" | "RATE_LIMITED" }`.

### `entity_snapshot` · `S → C` (every tick, 20 Hz)

```json
{
  "roomId": "room_mg7_ab12",
  "tick": 12345,
  "serverTime": 1728000000000,
  "phase": "playing",
  "entities": [
    { "id": "<socketId>", "socketId": "<socketId>", "botId": null, "name": "MopLord42", "team": null, "isBot": false, "x": 320.5, "y": 480.0, "vx": 120.0, "vy": -260.5, "facing": 1, "hp": 100, "maxHp": 100, "alive": true, "seq": 1543, "score": 3, "kills": 3, "deaths": 1, "time": 1728000000000 }
  ]
}
```

Interpolation contract (matches the client's `SnapshotBuffer`):
- `time` === `serverTime` for every entity in the batch (clean bracketing, no shear).
- `tick` is monotonic per room — drop batches with `tick` < last seen (reorder guard).
- Dead entities STAY listed with `alive: false` (render the corpse until `entity_respawn`; no pop-out).
- Sending `entity_snapshot` is server-only; client sends get `SERVER_ONLY_EVENT`.

Migration: render remotes from `entities` (one loop for humans + bots); reconcile the local player against its entry (tolerance ~2.5 px, snap beyond); keep `remote = now - 100ms` interpolation.

---

## 14. Bot AI + combat lifecycle (Phase 3)

Bots steer through the SAME intent channel as humans (`src/ai/botBrain.js` → same physics, weapons, snapshots). States: `chase | strafe | attack | flee | idle` (+ `dead`).

- Targeting: nearest living enemy (tdm: enemy team only — teammates never targeted, friendly fire off anyway). Practice bots hunt humans first.
- Range: chaser 150 · shooter 340 · brute 180 · kamikaze 70 (mop-rushes). Out-of-range closes, in-range strafes (0.6–2 s flips), low HP (<30%) flees while shooting.
- Trigger: within weapon range + roughly level + cooldown. Temperament per mode: ffa aggressive (0.85× cooldown), tdm disciplined (0.95×), practice gentle (1.6× cooldown + wide miss spread).
- "Line of sight" = distance + height check (platforms don't block shots in Phase 3; raycast LOS is Phase 4).

Weapons (`src/combat/weapons.js`): `scrap-rifle` (16 dmg / 320 ms / fast bolt) · `mop-cannon` (26 / 700 ms / heavy shove) · `debris-launcher` (34 / 1100 ms / 90 px splash, linear falloff). Melee: 25 dmg, ±60° arc, 78 px + body, 500 ms.

### `entity_death` · `S → C`

```json
{
  "roomId": "room_mg7_ab12",
  "victimId": "<socketId>",
  "victimName": "MopLord42",
  "victimIsBot": false,
  "victimTeam": null,
  "killedById": "<socketId | null>",
  "killedByName": "Rusty McScrapface | null",
  "killerIsBot": true,
  "cause": "bullet | melee | splash",
  "x": 320,
  "y": 480,
  "respawnInMs": 2500,
  "tick": 12345,
  "timestamp": 1728000000000
}
```

Play death FX + killfeed row (`killer → victim`). Bots ALSO emit legacy `bot_death`. Uncredited deaths carry null killer fields.

### `entity_respawn` · `S → C`

```json
{ "roomId": "room_mg7_ab12", "id": "<socketId>", "name": "MopLord42", "x": 120, "y": 650, "hp": 100, "maxHp": 100, "isBot": false, "tick": 12345, "timestamp": 1728000000000 }
```

Revive at a safe spawn (far from enemies) after `respawnInMs` (2500 ms) + 1 s spawn protection (damage ignored). A `player_health_update` (full HP, `reason: "respawn"`) rides along.

### `score_update` · `S → C`

Pushed on every kill and at match start (event-driven, not per-tick):

```json
{
  "roomId": "room_mg7_ab12",
  "mode": "ffa",
  "scores": [{ "id": "…", "name": "…", "team": null, "kills": 3, "deaths": 1, "score": 3, "isBot": false }],
  "teams": null,
  "overtime": false,
  "tick": 12345,
  "timestamp": 1728000000000
}
```

`teams` is `{ red, blue }` in tdm, else null. `overtime` flips true for tdm sudden-lead overtime (§20). Sorted score desc, deaths asc.

---

## 15. Scoring + win conditions (Phase 3)

Tuning: `server-config.js → gameModes` (`GET /api/info → sim.scoring` mirrors it).

| Mode | Target win | Timer fallback | Winner |
|---|---|---|---|
| `ffa` | first to **10 kills** (`score_limit`) | 180 s → highest score (`time_limit`) | top score entity (human or bot) |
| `tdm` | first team to **25** (`score_limit`) | 240 s → higher team (`time_limit`); tie = `draw`, winner null | `{ team }` |
| `bot_practice` | none (endless play) | 180 s → `practice_complete`, winner always null | null (scoreboard ships anyway) |

Match clock starts on the first `playing` tick (countdown excluded — loading never eats match time). A 5 min safety auto-end (`timeout`) backstops everything. Only REAL (non-practice) finishes graduate first-match protection.

Kill = +1 personal score (+1 team score in tdm). Suicides/uncredited deaths: deaths +1, no credit. Melee/splash kills credit normally.

Phase 4: killfeed medals ride `streak_event` (§19) — first blood + streak tiers (3/5/8/12). Zero gameplay effect, pure glory.

---

## 18. Lag compensation (Phase 4 — favor-the-shooter, bounded)

**No wire change.** Hits resolve exactly as before on the wire; what changed is which near-misses count. Every entity records a 40-sample (≈2 s) position ring every tick (`src/lagcomp/history.js`). The server estimates each shooter's one-way latency from `player_input.timestamp` (clamped 0–500 ms; bots = 0).

Hit rule (`src/lagcomp/rewind.js`):
1. Direct hits on live positions always count (unchanged fast path).
2. A miss is re-tested ONLY inside a 26 px grace band — the shell/arc passed close on the live truth.
3. The re-test runs against where the victim was `(now − shooterLatency)` ago. History too short / latency 0 → no hit.
4. Rewound hits deal FULL damage (no falloff games). Melee uses the same rule on its arc.

Anti-abuse bounds: ±26 px grace, 2 s history, 500 ms latency clamp — a lag-switcher gains no teleport kills; rewind only narrowly widens a near-miss. Reconciliation advice is unchanged: reconcile against `entity_snapshot`, not against rewound ghosts.

---

## 19. Bots v2, weapon feel + killfeed medals (Phase 4)

**Bots** (`src/ai/personalities.js` + `botBrain.js`) roll a difficulty at spawn — practice is 70% easy / 30% normal (never aggressive), ffa 20/60/20, tdm 10/60/30. Easy: 1.5× trigger cadence, 2× aim error, 450 ms reaction (new targets tracked before firing), flees at 45% HP. Aggressive: 0.7× cadence, 0.6× error, 120 ms reaction, flees at 18%. New behaviors: retreat paths to the safest spawn (cover, not walls), tdm teammates drift toward each other when isolated (>250 px), stuck-push for ~2 s auto-hops, practice kamikazes retrained to chasers (melee a rarity). `bot_update.state` unchanged (`chase | strafe | attack | flee | idle | dead`).

**Weapon feel** (`src/combat/triggers.js`): sustained fire heats the barrel (`heat` 0..1, +0.22/shot, −0.06/tick); effective spread = weapon spread + heat × 0.075. Single taps stay laser-true; mag-dumps visibly cone. The fired angle rides the `player_shoot` tracer, so clients render honest spread.

**Spawn protection** hardened to 1.5 s (damage ignored; the protected still deal full damage — standard trade).

### `streak_event` · `S → C`

```json
{ "roomId": "room_mg7_ab12", "kind": "first_blood | streak", "id": "<socketId>", "name": "MopLord42", "isBot": false, "team": null, "streak": 3, "text": "Killing Spree — MopLord42 (3)", "tick": 12345, "timestamp": 1728000000000 }
```

First blood fires once per room; tiers at 3 (Killing Spree) · 5 (Rampage) · 8 (Unstoppable) · 12 (Janitor Supreme). Death resets the run; disconnects too (a disconnect is a death-shaped hole).

---

## 20. Reconnect grace, late join + overtime (Phase 4)

**Reconnect:** mid-match disconnect stashes `{ team, kills, deaths, score }` by username for 60 s. The next `player_join` with that name re-seats into the live room (KDA kept, streak reset) and the ack gains additive fields:

```json
{ "ok": true, "player": {…}, "rejoined": true, "roomId": "room_mg7_ab12" }
```

The joiner also receives the full catch-up (`room_joined` + current `match_state` + `score_update`); survivors get `room_update`. Voluntary `room_leave` never stashes (lobby exit frees the seat); expiry, finished rooms, and name-taken duplicates fall back to a normal join. Spawns are safe-spawned with fresh protection.

**Late join** — `room_join` · `C → S` (acked):

```json
{} // any live room with human space
{ "roomId": "room_mg7_ab12" } // that specific room
{ "mode": "tdm" } // any live room of that mode
```

Ack: `{ "ok": true, "roomId": "…", "mode": "…" }` + same catch-up as reconnect. Errors: `NOT_JOINED` · `ALREADY_IN_MATCH` · `NO_ROOM_TO_JOIN` (none live/with space) · `ROOM_FULL` · `FIRST_MATCH_PROTECTED` (real modes need veteran status; practice doors always open). Teams auto-balance (tdm joins the smaller side). Bots are NOT rebalanced on join (documented: the joiner is a bonus body).

**Overtime (tdm):** a tie at the horn extends the clock once (+60 s) instead of drawing — `score_update` carries `overtime: true` so HUDs flip. Any lead during overtime ends it immediately (`match_end.reason: "overtime"`). Still tied after? `draw`, winner null. `match_end` reasons are now: `score_limit | time_limit | draw | overtime | practice_complete | manual | timeout`.

---

## 23. Maps: boundaries, zones, stations (Phase 5)

Three authoritative arenas (`src/game/maps.js`; full list at `GET /api/info → maps`). The legacy `mapId: "junkyard"` aliases to `orbital_junkyard` (identical geometry to every 1.x room); unknown ids fall back the same way. `room.mapId` echoes what the client SENT; physics + manifest use the canonical def.

| Map | Bounds (x / floor) | Platforms | Low-grav volume | Hazards | Scrap docks |
|---|---|---|---|---|---|
| `orbital_junkyard` | 40–1240 / 650 | 3 (500/500/350) | cryo-vent ×0.45 | reactor-leak 12 dps | dock-a (200), dock-b (1080) |
| `reactor_core` | 120–1160 / 620 | 3 (470/470/320) | core-shaft ×0.5 | 2× coolant 15 dps | dock-a (320), dock-b (960) |
| `biodome` | 60–1220 / 660 | 3 (520/520/380) | spore-cloud ×0.6 | acid-pond 20 dps | dock-a (180), dock-b (1100) |

`room_joined.map` (+ countdown `match_state.map`) ships the whole definition — bounds, platforms, zones (id + rect + factor/dps), stations (id + x/y/r), spawns — so clients render hazards/docks with zero extra fetch:

```json
{ "id": "reactor_core", "name": "Reactor Core", "bounds": { "minX": 120, "maxX": 1160, "groundY": 620, "ceilingY": 80 }, "platforms": [{ "x": 400, "y": 470, "w": 180, "h": 18 }], "zones": { "lowgrav": [{ "id": "core-shaft", "x": 560, "y": 120, "w": 160, "h": 220, "factor": 0.5 }], "hazard": [{ "id": "coolant-west", "x": 120, "y": 570, "w": 200, "h": 50, "dps": 15 }] }, "stations": [{ "id": "dock-a", "x": 320, "y": 620, "r": 70 }], "spawns": [{ "x": 180, "y": 620 }] }
```

Hazards deal fractional DoT (cause `"hazard"`, uncredited kills, death → respawn like any death); spawn protection covers them (no lava-spawn deaths, ever). Spawns sit ON surfaces (floor spread + platform tops) — no more mid-air materialising.

Queue/party `mapId` is free-form (validated by fallback, never an error).

---

## 24. Scrap Collector mode (Phase 5)

FFA banking: kills spill collectible tokens, walking over them fills your satchel (cap 5), standing in a dock banks the satchel (score = banked). First to **20 banked** (`score_limit`) or most banked at 180 s (`time_limit`). Real mode: graduates first-match protection, medals + XP like ffa. Bots collect and bank too (steering overlay in `botBrain`, combat unchanged — they fight over tokens).

`entity_snapshot` gains `tokens: [{ id, x, y, value, time }]` (empty outside scrap) and every entity gains `carried` (satchel count). `score_update`/scoreboard rows gain `banked` + `carried` (live satchel HUDs).

### `scrap_event` · `S → C`

```json
{ "roomId": "room_mg7_ab12", "kind": "drop | pickup | deposit", "id": "sc_42", "byId": "<socketId>", "byName": "MopLord42", "amount": 3, "total": 5, "stationId": "dock-a", "x": 320, "y": 600, "tick": 12345, "timestamp": 1728000000000 }
```

| Kind | Meaning | `total` |
|---|---|---|
| `drop` | death spill (`amount` tokens around the corpse; humans drop satchel + bonus, bots 1–2) | n/a (spilled) |
| `pickup` | walk-over collect (`id` = token id) | satchel after |
| `deposit` | dock bank (`id`/`stationId` = dock) | banked after |

Tokens live 30 s, 40 per room max (oldest silently recycled past the cap). Kills still score +1 AND drop scrap (slayers get paid twice — working as intended).

---

## 25. Spectators, progression + hardening (Phase 5)

**Spectator booths:** `room_join { asSpectator: true }` seats an observer (full feed, NO hitbox) even past the human cap (8 booths/room). Spectators appear in `room_joined.spectators` (`[{ socketId, name }]`, + `spectatorCount`); joins/leaves ride `room_update` (`joinedSpectatorId`, no roster churn). Their move/shoot/melee packets are rejected (`SPECTATING`, never relayed — no ghost tracers); stored input is ignored (no entity reads it). Full rooms without the flag still answer `ROOM_FULL`, now with `canSpectate: true`. Voluntary leave frees the booth; disconnects just vanish (never stashed).

**Progression in `match_end`:** every score row gains `banked, carried, xp, level, medals[], accuracy, bestStreak`; legacy `results` gain `xp`; top level gains `mvp { id, name } | null` + `telemetry { durationSec, totalKills, totalShots, accuracy, lagCompHits, overtime }` + `xpByName`. XP = kills×100 + banked×50 + win 250 + 25 participation (practice banks half). Level = lifetime/1000 + 1 (profiles persist in-memory across reconnects). Medals: `first_blood, sharpshooter (≥10 shots @ ≥40%), survivor (0 deaths + ≥3 kills), banker (scrap top), rampage (streak ≥5), mvp`. Shot/hit counters feed accuracy (accepted pulls / damaging impacts).

**Hardening:** input flood cap ~83 Hz (60 Hz clients pass with headroom; above → `RATE_LIMITED`); legacy muzzle claims beyond 400 px of the server body rejected (`BAD_ORIGIN`); oversize payloads dropped (`INPUT_JUNK`); restarted seq counters re-base instead of wedging; room destroy purges reconnect limbo + inputs (rings/maps GC with the sim); 60-shell room cap; tick-time watchdog logs past 25 ms.

---

## 26. Minimal Phaser integration example

```js
import { io } from 'socket.io-client'; // or <script src="/socket.io/socket.io.js">

// Vite dev (:5173) and backend (:3000) are different origins → pass the URL.
// In production the backend serves dist/, so same-origin io() suffices.
const socket = import.meta.env?.DEV ? io('http://localhost:3000') : io();

// 1. Wait for welcome, check contract
socket.on('connected', ({ socketEventsVersion }) => {
  if (socketEventsVersion !== '1.4.0-phase5') {
    console.warn('Backend contract changed — update Phaser netcode!');
  }
  // 2. Join arena
  socket.emit('player_join',
    { name: playerName, mapId: 'junkyard', difficulty: 'normal' },
    ({ player }) => console.log('Joined as', player.id),
  );
});

// 3. Send movement at ~20 Hz in update()
socket.emit('player_move', { x, y, vx, vy, facing, seq: seq++, timestamp: Date.now() });

// 4. Listen for everyone else
socket.on('player_move', ({ id, x, y }) => moveRemoteAvatar(id, x, y));
socket.on('player_shoot', ({ id, x, y, angle }) => spawnTracer(id, x, y, angle));
socket.on('player_melee', ({ id, x, y, direction }) => playMopSwing(id, x, y, direction));
socket.on('player_health_update', ({ id, hp }) => updateHealthBar(id, hp));
socket.on('bot_spawn', (bot) => spawnBot(bot));
socket.on('bot_update', ({ bots }) => syncBots(bots));
socket.on('bot_death', ({ botId }) => explodeBot(botId));

// 5. Future-proofing (add now, flesh out later)
socket.on('jumpscare_trigger', (scare) => maybePlayScare(scare));
socket.on('match_state', (state) => setMatchUI(state));
socket.on('error_event', ({ code, message }) => console.warn(code, message));

// 6. Phase 2 lobby flow (party + friends + queue + room)
const { party } = await socket.emitWithAck('party_create', {});
await socket.emitWithAck('party_join', { code: party.code }); // invitee side
await socket.emitWithAck('friend_add', { friendName: 'DustBuster' });
socket.on('friend_update', ({ friends }) => renderFriends(friends));
socket.on('party_update', ({ party }) => renderParty(party));
socket.on('party_invited', ({ partyCode, fromName }) => showInvite(partyCode, fromName));
const q = await socket.emitWithAck('queue_join', { mode: 'ffa' });
if (q.firstMatchProtection) showToast('First match → Bot Practice!');
socket.on('queue_update', ({ position }) => setQueueUI(position));
socket.on('match_found', ({ roomId }) => showLoading(roomId));
socket.on('room_joined', ({ room }) => spawnAll(room.entities));
socket.on('match_end', (res) => showResults(res));

// 7. Phase 3 authoritative sim (send intent, render snapshots)
setInterval(() => {
  socket.emit('player_input', {
    moveX, jump: jumpPressed, jumpHeld, aimX, aimY,
    fire: fireHeld, melee: meleePressed, weaponId,
    seq: seq++, timestamp: Date.now(),
  });
}, 16);
socket.on('entity_snapshot', ({ tick, entities }) => {
  for (const e of entities) pushSnapshot(e); // SnapshotBuffer.push(e)
});
socket.on('entity_death', (d) => killfeed(`${d.killedByName ?? '—'} ⚔ ${d.victimName}`));
socket.on('entity_respawn', (r) => respawnActor(r));
socket.on('score_update', ({ scores, teams }) => renderScoreboard(scores, teams));
socket.on('player_health_update', ({ id, hp, maxHp }) => updateHealthBar(id, hp, maxHp));

// 8. Phase 4: medals, late join, overtime flag
socket.on('streak_event', ({ text }) => killfeed(text));
socket.on('score_update', ({ scores, teams, overtime }) => renderScoreboard(scores, teams, overtime));
if (needToJoinLate) await socket.emitWithAck('room_join', {});
// reconnects land here automatically: player_join ack carries { rejoined, roomId }

// 9. Phase 5: maps, scrap, spectators, progression
// room_joined.map → draw platforms, hazard rects (red), docks (green rings)
// entity_snapshot.tokens → draw pickups; entity.carried → satchel badges
socket.on('scrap_event', (e) => scrapFx(e)); // drop/pickup/deposit juice
if (roomFull) await socket.emitWithAck('room_join', { roomId, asSpectator: true });
socket.on('match_end', ({ scores, mvp, telemetry }) => showResults(scores, mvp, telemetry));
```

---

## 27. Change log

| Version | Date | Change |
|---|---|---|
| `1.4.0-phase5` | 2026-10-05 | ADDITIVE (no wire breaks): 3 authoritative maps (§23, manifest `map`), `scrap_collector` mode (§24: `tokens` + `carried` in snapshots, `scrap_event`, banked win), spectator booths (§25: `room_joined.spectators`, `SPECTATING` guards, `canSpectate` hint), progression in `match_end` (xp/level/medals/mvp/telemetry), hardening (83 Hz cap, `BAD_ORIGIN`, limbo purge). New: mode `scrap_collector`, event `scrap_event`. |
| `1.3.0-phase4` | 2026-10-05 | ADDITIVE (no wire breaks): lag compensation (rewind grace-band hits, §18), bots v2 (personalities/reaction/cohesion/cover, §19), heat bloom, `streak_event` medals, reconnect grace (`player_join` ack += `rejoined/roomId`), `room_join` late join, tdm overtime (`score_update.overtime`, `match_end` += `overtime` reason), `INPUT_JUNK` + seq-resync hardening (§20). New events: `streak_event`, `room_join`. |
| `1.2.0-phase3` | 2026-10-05 | AUTHORITATIVE SIM (in-room semantics change; lobby paths byte-compatible): 20 Hz fixed tick (`src/game/loop.js`), `player_input` intent channel, `entity_snapshot` every tick, bot AI (chase/strafe/flee, team-aware, per-mode temperament), server projectiles + melee arcs, death/respawn (`entity_death/respawn`), `score_update`, real `match_end` scores + winners (§13–§15). `player_move` position ignored in rooms (velocity-hint bridge). `player_health_update` client sends now rejected (`NOT_AUTHORITATIVE`). New events: `player_input`, `entity_snapshot`, `entity_death`, `entity_respawn`, `score_update`. |
| `1.1.0-phase2` | 2026-10-04 | ADDITIVE (backward compatible): Party (§7), Friends (§8), Matchmaking (§9), Rooms (§10). `match_state` extended with room roster (old fields kept). New events: `party_create/join/leave/update/start_match/invite/invited`, `friend_add/remove/list/update`, `queue_join/leave/update`, `match_found`, `room_joined/leave/update`, `match_end`. First-match protection forces new players to `bot_practice`. |
| `1.0.0-phase1` | 2026-10-04 | Initial skeleton contract. All events echo/broadcast only; no authority, no rooms. |

**Adding an event:** append a section + example, bump minor version, add the name to
`src/sockets/events.js`, expose via `/api/info`, and add a row here.
