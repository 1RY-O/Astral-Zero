# Debris Derby — WebSocket + REST Contract

> **Single source of truth** for client ↔ server communication.
> Contract version: **`2.0.0-debris-derby`**.
> Constants: `src/sockets/events.js` · Handlers: `src/sockets/index.js`
> · Catalog: `src/game/ambientCatalog.js` · Validation:
> `src/game/runValidation.js` · REST: `src/routes/api.js`.

## Transport

- Socket.io over WebSocket, JSON payloads only.
- The server is **not authoritative for gameplay**. Foreground physics is
  client-side at 60 Hz. The server propagates an ambient TLE catalog at
  2 Hz, validates completed runs, and stores the leaderboard.
- No player input, movement, cleanup, collision, cascade, or game-over
  events exist in this contract.

## Conventions

| Token | Meaning |
|---|---|
| `S → C` | Server emits |
| `C → S` | Client emits |
| `ack` | Socket.io acknowledgement callback |
| `tick` | Ambient catalog tick counter (2 Hz) |
| `timestamp` | Unix milliseconds, server clock |
| `catalogStatus` | `"live"` \| `"stale"` \| `"unavailable"` |

---

## 1. `connected` — `S → C`

Emitted immediately after the Socket.io handshake, once per socket.

```json
{
  "socketId": "abc123",
  "game": "Debris Derby",
  "socketEventsVersion": "2.0.0-debris-derby",
  "serverTime": "2026-10-30T10:00:00.000Z",
  "catalog": {
    "tickHz": 2,
    "objects": 120,
    "catalogStatus": "live",
    "sourceUrl": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
    "attribution": "Orbital data: Celestrak (celestrak.org)",
    "lastUpdatedAt": "2026-10-30T09:58:00.000Z"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `socketId` | string | Socket.io connection id |
| `game` | string | Always `"Debris Derby"` |
| `socketEventsVersion` | string | Always `"2.0.0-debris-derby"` |
| `serverTime` | string | ISO-8601 server time |
| `catalog.tickHz` | number | Always `2` |
| `catalog.objects` | number | Objects currently in the cached catalog |
| `catalog.catalogStatus` | string | `live`, `stale`, or `unavailable` |
| `catalog.sourceUrl` | string | Celestrak GP URL |
| `catalog.attribution` | string | Celestrak attribution |
| `catalog.lastUpdatedAt` | string \| null | Last successful fetch, ISO-8601 |

The client should render `catalogStatus` visibly (small HUD badge,
colour-coded). `stale` and `unavailable` are not normal states.

---

## 2. `ambient_catalog` — `S → C`, 2 Hz

Broadcast every 500 ms. Objects are SGP4-propagated from the cached
Celestrak active catalog.

```json
{
  "tick": 12345,
  "timestamp": 1793000000000,
  "catalogStatus": "live",
  "sourceUrl": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
  "attribution": "Orbital data: Celestrak (celestrak.org)",
  "lastUpdatedAt": "2026-10-30T09:58:00.000Z",
  "objects": [
    {
      "id": "25544",
      "name": "ISS (ZARYA)",
      "noradId": 25544,
      "latDeg": 23.45,
      "lonDeg": -105.12,
      "altKm": 420.8,
      "inclinationDeg": 51.64,
      "isDebris": false
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `tick` | number | Increments once per broadcast |
| `timestamp` | number | Unix ms |
| `catalogStatus` | string | See table below |
| `sourceUrl` | string | Celestrak GP URL actually requested |
| `attribution` | string | Celestrak attribution; required |
| `lastUpdatedAt` | string \| null | Last successful fetch, ISO-8601 |
| `objects` | array | Empty when `catalogStatus` is `unavailable` |
| `objects[].id` | string | NORAD catalog number as a string |
| `objects[].name` | string | Celestrak `OBJECT_NAME` |
| `objects[].noradId` | number | NORAD catalog number |
| `objects[].latDeg` | number | Geodetic latitude, degrees |
| `objects[].lonDeg` | number | Geodetic longitude, degrees |
| `objects[].altKm` | number | Altitude above Earth, km |
| `objects[].inclinationDeg` | number | Orbital inclination, degrees |
| `objects[].isDebris` | boolean | `false` for the `GROUP=active` catalog |

### Catalog status

| Value | Meaning | Objects served |
|---|---|---|
| `live` | Last Celestrak fetch succeeded | Current cached objects |
| `stale` | Last fetch failed, a previous fetch succeeded | Cached objects, with the old `lastUpdatedAt` |
| `unavailable` | No successful fetch has ever completed | Always `[]` |

Failure policy:
- HTTP non-200, timeout, network error, invalid JSON, or zero valid rows
  logs an error with the URL (and status code where available).
- No bundled fallback TLEs, no offline mode, no synthetic catalog.
- A failed refresh also emits one `server_notice` with
  `CATALOG_STALE` or `CATALOG_UNAVAILABLE`.

---

## 3. `run_submit` — `C → S` (ack)

Submitted after a run ends. The server validates every field, recomputes
the score from the locked formulas, and stores the server score.

**Client → Server:**

```json
{
  "levelId": 1,
  "callsign": "PILOT",
  "seed": 123456789,
  "durationMs": 45321,
  "fuelUsed": 62.5,
  "lingers": 1,
  "deorbits": [
    {
      "objectId": "25544",
      "massKg": 12.4,
      "releaseDot": -0.82,
      "atMs": 12000
    }
  ],
  "clientScore": 1840
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `levelId` | integer | ✅ | `1`–`8` |
| `callsign` | string | ❌ | 1–24 chars: letters, numbers, space, dot, dash, underscore; default `Anonymous` |
| `seed` | integer | ✅ | Unsigned 32-bit (`0`–`4294967295`) |
| `durationMs` | number | ✅ | `0`–`3,600,000` |
| `fuelUsed` | number | ✅ | `0`–level fuel max |
| `lingers` | integer | ✅ | `0`–`64`; each costs `-150` |
| `deorbits` | array | ✅ | Max `64` entries |
| `deorbits[].objectId` | string | ✅ | 1–32 safe characters |
| `deorbits[].massKg` | number | ✅ | `> 0`, finite |
| `deorbits[].releaseDot` | number | ✅ | `-1`–`1`; `< 0` means retrograde |
| `deorbits[].atMs` | number | ✅ | Non-decreasing, `0`–`durationMs` |
| `clientScore` | number | ✅ | `0`–`1,000,000` |

Chain multiplier: `n(n+1)/2`, where `n` increments when consecutive
deorbits are at most **900 ms** apart. It resets to `1` outside that
window.

### Ack — success

```json
{
  "ok": true,
  "runId": "run_2f1c...",
  "score": 1840,
  "rank": 3,
  "best": 2410
}
```

`score` is the server score, `rank` is the run's rank on its level board,
and `best` is the level's current top score.

### Ack — failure

```json
{
  "ok": false,
  "code": "BAD_LEVEL",
  "message": "levelId must be an integer from 1 to 8."
}
```

| Code | Meaning |
|---|---|
| `BAD_PAYLOAD` | Missing/wrong type/out of range/unsafe string |
| `BAD_LEVEL` | `levelId` is not an integer `1`–`8` |
| `BAD_SEED` | Seed is not an unsigned 32-bit integer |
| `RATE_LIMITED` | An accepted run was submitted less than 3 s ago on this socket |
| `SCORE_MISMATCH` | Client score differs from the server score by more than 2 |

On every failure the server also emits `server_notice` with the same code.
Invalid submissions do not consume the rate limit; accepted submissions do.
The leaderboard is in-memory and resets when the server restarts.

---

## 4. `leaderboard_update` — `S → C`

Broadcast to all clients after an accepted run.

```json
{
  "levelId": 1,
  "entries": [
    {
      "rank": 1,
      "callsign": "PILOT",
      "score": 2410,
      "levelId": 1,
      "createdAt": "2026-10-30T10:01:00.000Z"
    }
  ],
  "updatedAt": "2026-10-30T10:01:00.000Z"
}
```

`entries` is the top 10 for that level. `updatedAt` is `null` until the
first accepted run.

---

## 5. `server_notice` — `S → C`

Uniform notice envelope. Not an error channel for gameplay; it reports
catalog health and rejected submissions.

```json
{
  "code": "CATALOG_UNAVAILABLE",
  "message": "Celestrak request failed for https://...: The operation was aborted due to timeout",
  "at": "2026-10-30T10:02:00.000Z"
}
```

| Code | Source |
|---|---|
| `CATALOG_UNAVAILABLE` | Celestrak failed and no cache exists |
| `CATALOG_STALE` | Celestrak failed; previous cache is being served |
| `BAD_PAYLOAD` | `run_submit` validation |
| `BAD_LEVEL` | `run_submit` validation |
| `BAD_SEED` | `run_submit` validation |
| `RATE_LIMITED` | `run_submit` rate limit |
| `SCORE_MISMATCH` | Client/server score disagreement |

---

## 6. Connection lifecycle

1. Socket.io handshake completes.
2. Server emits `connected` with the contract version and catalog status.
3. Server emits `ambient_catalog` every 500 ms automatically.
4. No join, room, party, queue, or subscription event is required.
5. `disconnect` is a Socket.io built-in; the server clears the socket's
   rate-limit entry.

---

## 7. REST

All responses are JSON. There is no gameplay write endpoint.

### `GET /api/health`

```json
{
  "game": "Debris Derby",
  "status": "ok",
  "version": "0.3.0",
  "socketEventsVersion": "2.0.0-debris-derby",
  "uptimeSeconds": 42,
  "timestamp": "2026-10-30T10:00:00.000Z",
  "catalog": {
    "objects": 120,
    "catalogStatus": "live",
    "sourceUrl": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
    "attribution": "Orbital data: Celestrak (celestrak.org)",
    "tickHz": 2,
    "lastUpdatedAt": "2026-10-30T09:58:00.000Z",
    "lastAttemptAt": "2026-10-30T09:58:00.000Z",
    "lastError": null
  }
}
```

`lastError` is a string or `null`. `catalogStatus` uses the same
`live` / `stale` / `unavailable` values as the socket tick.

### `GET /api/levels`

```json
{
  "levels": [
    { "id": 1, "name": "First Contact", "order": 1 }
  ]
}
```

Exactly eight entries, in order: First Contact, Two-Body Problem, Clean
Sweep, Ricochet, Dominoes, Fragile Cargo, Moving Targets, Kessler Event.

### `GET /api/leaderboard?levelId=&limit=`

- `levelId` optional, integer `1`–`8`.
- `limit` optional, clamped to `1`–`50`, default `10`.
- `levelId` omitted means all levels.

```json
{
  "levelId": 1,
  "entries": [
    {
      "rank": 1,
      "callsign": "PILOT",
      "score": 2410,
      "levelId": 1,
      "createdAt": "2026-10-30T10:01:00.000Z"
    }
  ],
  "updatedAt": "2026-10-30T10:01:00.000Z"
}
```

Bad query values return `400`:

```json
{
  "error": "bad_request",
  "message": "levelId must be an integer from 1 to 8."
}
```

Unknown routes return `404`:

```json
{
  "game": "Debris Derby",
  "error": "not_found",
  "message": "No route for GET /api/nope"
}
```

---

## 8. Celestrak data grounding

- Source:
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json`
- Attribution: `Orbital data: Celestrak (celestrak.org)` in every
  `connected`, `ambient_catalog`, and `/api/health` catalog payload.
- Refresh: every 30 minutes on success; a failed fetch retries after
  60 seconds.
- No API key. No Space-Track. No bundled fallback TLE file. No offline
  mode.

Startup logs print the Celestrak URL and the result status:

```
[ambientCatalog] Celestrak URL: https://celestrak.org/...
[ambientCatalog] Celestrak fetch result: live — 120 objects — https://celestrak.org/...
```

A failure prints `Celestrak fetch result: stale|unavailable — <reason>` to
`console.error`.

---

## 9. Removed in Phase 2 (do not re-add)

`orbital_snapshot`, `player_cleanup`, `cleanup_success`, `cleanup_failed`,
`collision_alert`, `cascade_event`, `game_over`, `level_up`,
`proximity_timer`, `global_threat_level`, and every player/party/friend/
room/match event from the Solar Sentinel registry.

Server gameplay authority, cleanup energy, waves, Kessler cascades, and
proximity timers are gone. The client owns gameplay physics from Phase 3.

---

## 10. Event ↔ code reconciliation

Every documented event has exactly one emitter/listener, and every
emitter/listener appears here.

| Documented event | Direction | Code |
|---|---|---|
| `connected` | S → C | `socket.emit` in `src/sockets/index.js` |
| `ambient_catalog` | S → C | `io.emit` in `ambientCatalog.publish` |
| `run_submit` | C → S | `socket.on` in `src/sockets/index.js` |
| `leaderboard_update` | S → C | `io.emit` in `src/sockets/index.js` |
| `server_notice` | S → C | `io.emit` in `ambientCatalog.refreshNow`; `socket.emit` in `src/sockets/index.js` |
| `connection` | built-in | `io.on` in `src/sockets/index.js` |
| `disconnect` | built-in | `socket.on` in `src/sockets/index.js` |

No other application events are emitted or handled.

Scope: `server.js`, `src/sockets/`, and `src/game/`. The legacy Solar
Sentinel client in `src/main.js` still listens for removed events until
Phase 5 replaces it; it is not part of this contract.
