# Solar Sentinel — WebSocket Event Contract

> **Single source of truth** for all frontend ↔ backend communication in the
> Solar Sentinel Kessler Cascade simulation.
>
> Server constants: `src/sockets/events.js` · Handlers: `src/sockets/index.js`
> · Simulation: `src/game/` · API: `src/routes/api.js`
>
> Contract version: `1.0.0-solar-sentinel`
> (also exposed via `GET /api/info → socketEventsVersion`)

## Transport

- **Socket.io** over WebSocket, JSON payloads only.
- The **server is authoritative** for all orbital state, risk scoring,
  the Kessler Cascade resolution, the Cleanup Energy budget, and every
  cleanup / collision decision. The client renders only what the server emits
  and may *request* a cleanup, but never authoritatively deletes or spawns
  debris.

## Conventions

| Token | Meaning |
|---|---|
| `S → C` | Server emits, all connected clients listen |
| `C → S` | Client emits, server listens |
| `ack` | Optional Socket.io acknowledgement callback `{ ok: boolean, … }` |
| `tick` | Server simulation step counter (2 Hz) |
| `timestamp` | Unix ms, server clock (`Date.now()`) |

---

## 1. `orbital_snapshot` — `S → C`

**Broadcast** on every 2 Hz simulation tick. The complete authoritative
state of the orbital field. Clients must discard any client-side position
state and render *only* this data.

```json
{
  "tick": 12345,
  "timestamp": 1728000000000,
  "objects": [
    {
      "id": "43205",
      "name": "DEB RISCON 1",
      "lat": 23.45,
      "lon": -105.12,
      "altKm": 547.8,
      "riskLevel": "high",
      "isDebris": true,
      "fragmentOf": null
    }
  ],
  "metrics": {
    "trackedObjects": 318,
    "debrisObjects": 189,
    "activeSatellites": 129,
    "highRiskPairs": 3,
    "activeCascades": 0,
    "globalThreatLevel": "Low",
    "cleanupEnergy": 12,
    "maxCleanupEnergy": 20,
    "energyRegenRate": 1
  }
}
```

### Object fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | NORAD Catalog Number (or synthetic `frag_<parent>_<n>` for cascade fragments) |
| `name` | string | Common name from the latest TLE |
| `lat` | number | Geodetic latitude, degrees |
| `lon` | number | Geodetic longitude, degrees |
| `altKm` | number | Altitude above Earth, km |
| `riskLevel` | `"low"|"medium"|"high"|"imminent"` | Server-computed collision probability band |
| `isDebris` | boolean | `true` = debris (targetable for cleanup) |
| `fragmentOf` | string | `null` for real objects; parent NORAD id for cascade-spawned fragments |

### Metrics

| Field | Notes |
|---|---|
| `trackedObjects` | Total objects in the snapshot |
| `debrisObjects` | Subset that is classified as debris |
| `activeSatellites` | Live/active objects |
| `highRiskPairs` | Conjunctions above the `collision_alert` threshold |
| `activeCascades` | Number of currently-running cascade events |
| `globalThreatLevel` | Aggregate Low / Medium / High |
| `cleanupEnergy` / `maxCleanupEnergy` | Current and capacity of the operator's Cleanup Energy |
| `energyRegenRate` | Energy regenerated per tick |

---

## 2. `player_cleanup` — `C → S` (request)

An operator spends Cleanup Energy to remove a tracked debris object from the
simulation. The **server validates** the energy budget and object eligibility,
then broadcasts the result.

**Client → Server:**

```json
{
  "objectId": "43205",
  "tick": 12345
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `objectId` | string | ✅ | NORAD catalog id (debris only) |
| `tick` | number | ✅ | The simulation tick this action targets, for ordering |

### Server ack (`C ← S` callback)

On success:

```json
{
  "ok": true,
  "objectId": "43205",
  "cleanupEnergy": 9,
  "removed": true
}
```

On failure (insufficient energy, object not debris, or stale tick):

```json
{
  "ok": false,
  "code": "INSUFFICIENT_ENERGY",
  "message": "Cleanup Energy reserves are depleted."
}
```

### Broadcast (`S → C` to all clients)

When a cleanup succeeds the server emits the canonical result so every
dashboard stays in sync:

```json
{
  "objectId": "43205",
  "removed": true,
  "tick": 12345,
  "timestamp": 1728000000000
}
```

---

## 3. `collision_alert` — `S → C`

**Broadcast** whenever a conjunction pair crosses the server's alert
threshold. Signals that an **unmitigated** pair is on track to collide
within the prediction horizon — if it is not cleaned, the **Kessler Cascade**
will fire.

```json
{
  "tick": 12346,
  "timestamp": 1728000000250,
  "objectA": "30493",
  "objectB": "43205",
  "predictedCollisionTime": 1728000010500,
  "timeToCollisionMs": 8250,
  "combinedRisk": 0.87,
  "willCascade": true,
  "fragmentsToSpawn": 3
}
```

| Field | Type | Notes |
|---|---|---|
| `objectA`, `objectB` | string | NORAD ids of the colliding pair |
| `predictedCollisionTime` | number | Unix ms of the predicted impact |
| `timeToCollisionMs` | number | ms remaining until impact |
| `combinedRisk` | number | Collision probability 0.0 – 1.0 |
| `willCascade` | boolean | `true` once the pair is past the no-return threshold and will trigger cascade physics |
| `fragmentsToSpawn` | number | Fragment count the cascade will seed (always `3` per parent) |

---

## 4. `cascade_event` — `S → C`

**Broadcast** each time the Kessler Cascade simulation resolves a collision.
The two colliding objects are destroyed and **3 new debris fragments** are
spawned from each parent, entering the orbital field as fresh tracked objects.

```json
{
  "tick": 12347,
  "timestamp": 1728000010500,
  "collisionId": "col_12347_30493_43205",
  "destroyed": ["30493", "43205"],
  "spawned": [
    { "id": "frag_30493_0", "parent": "30493", "lat": 51.3, "lon": 12.7, "altKm": 549.2, "riskLevel": "high" },
    { "id": "frag_30493_1", "parent": "30493", "lat": 51.4, "lon": 12.9, "altKm": 550.1, "riskLevel": "high" },
    { "id": "frag_30493_2", "parent": "30493", "lat": 51.2, "lon": 12.6, "altKm": 548.7, "riskLevel": "high" }
  ]
}
```

| Field | Notes |
|---|---|
| `collisionId` | Deterministic id `col_<tick>_<a>_<b>` |
| `destroyed` | Norad ids removed from the field |
| `spawned` | The 3 new fragments for **each** destroyed parent (6 total for a pair) |

These fragments appear in the next `orbital_snapshot`.

---

## 5. `game_over` — `S → C`

**Broadcast once** when the Kessler Cascade becomes unstoppable and the
simulation declares terminal state (Earth orbit is locked). The server
transitions to a non-authoritative "watching the cascade finish" display
mode.

```json
{
  "tick": 12401,
  "timestamp": 1728000300000,
  "reason": "CASCADE_UNSTOPPABLE",
  "finalStats": {
    "totalObjects": 512,
    "totalDebris": 497,
    "cascadeGenerations": 4,
    "collisions": 89,
    "peakThreatLevel": "High",
    "cleanupActionsTaken": 14
  },
  "restartAvailable": true
}
```

| Field | Notes |
|---|---|
| `reason` | Currently only `CASCADE_UNSTOPPABLE` |
| `finalStats` | Cumulative simulation totals at terminal state |
| `restartAvailable` | `true` when a fresh simulation run can be requested |

---

## 6. Connection lifecycle

Immediately after the Socket.io handshake the server emits a welcome payload.
Clients use it to confirm contract compatibility before subscribing to the
snapshot stream.

```json
{
  "socketId": "abc123",
  "game": "Solar Sentinel",
  "serverVersion": "0.1.0",
  "socketEventsVersion": "1.0.0-solar-sentinel",
  "message": "Welcome to Solar Sentinel. Orbital snapshot stream starting."
}
```

Clients then receive `orbital_snapshot` on the next 2 Hz tick automatically —
no explicit "join" is required.
