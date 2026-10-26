# 🛰️ Solar Sentinel — Orbital Debris Threat Command

> **Solar Sentinel** is a real-time, server-authoritative decision-support
> simulation. It ingests live **Celestrak / NORAD Two-Line Element (TLE)**
> data, propagates every tracked object with `satellite.js` on a fixed **2 Hz**
> tick, and streams a live orbital-debris picture over Socket.io to a
> Vanilla Canvas dashboard.
>
> Operators use the visualization to spot imminent conjunctions, spend a
> limited **Cleanup Energy** budget to neutralize the highest-risk debris,
> and — when the Kessler Cascade is left unchecked — watch unmitigated
> collisions spawn a self-sustaining chain reaction that locks Earth in a
> ring of junk.

---

## The Problem — Kessler Syndrome

In 1978, NASA scientist **Donald Kessler** realized that as orbital debris
multiplies, the probability of two objects colliding rises. Each collision
shatters the parent bodies into **hundreds to thousands of fresh fragments**,
and those fragments go on to collide with other objects — spawning yet more
debris.

This runaway chain reaction is the **Kessler Cascade**: once it triggers,
collisions create more debris than they destroy, the cascade is
self-sustaining, and **Low Earth Orbit becomes an impassable shell** that
traps humanity on Earth. The cascade is already underway — there are
**over 36,000 tracked objects** and millions of untracked fragments larger
than 1 cm in orbit today.

Solar Sentinel exists to **detect the cascade tipping point** and give
operators the decision window to **spend cleanup energy before the chain
reaction runs away**.

---

## The Solution

A single-authoritative **server-side simulation** that turns raw public
orbital data into an actionable, real-time threat picture:

1. **Live TLE Ingestion** — Celestrak/NORAD TLEs are fetched and cached on a
   refresh cadence; stale data is rejected.
2. **Authoritative Propagation** — `satellite.js` propagates every object's
   ECI position on a lock-step **2 Hz (500 ms) tick** the client never
   overrides.
3. **Collision & Conjunction Detection** — each tick, every object pair is
   scored for conjunction probability and close-approach time.
4. **The Kessler Cascade** — high-risk conjunctions that are *not* cleaned
   before their predicted Time-To-Collision actually collide, destroying the
   parent objects and **spawning 3 new debris fragments** to seed the next
   generation of threats.
5. **Cleanup Energy Grid** — a server-authoritative, regenerating resource
   budget that gates how often an operator can remove debris, preventing
   spam and forcing **prioritized triage**.
6. **Live Dashboard** — a Vanilla Canvas renderer at **60 fps** pushes the
   propagated positions, risk levels, and cascade alerts to every connected
   operator with minimal CPU use on low-end devices.

---

## Core Features

### Live Orbital Mechanics
Real Celestrak/NORAD TLEs are propagated with `satellite.js` at a **2 Hz tick
rate** (500 ms). The server is the single source of truth for every object's
position — the client only renders what the server emits.

### The Kessler Cascade
A server-side simulation: when two high-risk debris objects reach their
predicted Time-To-Collision and are **not** removed in time, they collide and
**spawn 3 new debris objects** each, continuing the cascade. The simulation
ends (`game_over`) the moment the cascade becomes unstoppable.

### Resource Management
A server-authoritative **"Cleanup Energy" grid** meters every de-orbit action.
Energy regenerates on a fixed cadence, so operators must triage the
**highest-risk** conjunctions first — the system rejects any cleanup request
that exceeds the available budget.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Simulation engine | Node.js |
| HTTP API | Express |
| Realtime transport | Socket.io |
| Orbital propagation | satellite.js |
| Dashboard renderer | Vanilla Canvas (60 fps, low-end friendly) |
| Dev tooling | nodemon (server hot-reload), Vite (dev), dotenv (config) |

---

## How to Run

```bash
# 1. Install dependencies
npm install

# 2. Start the authoritative server (TLE fetcher + 2 Hz sim + Socket.io)
npm run dev:server

# 3. Start the dashboard (live in your browser at http://localhost:5173)
npm run dev
```

Once both are running, the dashboard connects over Socket.io and begins
receiving the live orbital snapshot stream.

---

## Data Flow

```
Celestrak / NORAD TLE  →  satellite.js propagation (2 Hz tick)
        →  conjunction & collision risk scoring
        →  Kessler Cascade resolution (collisions spawn 3 debris each)
        →  Cleanup Energy budget check
        →  Socket.io  →  Vanilla Canvas dashboard (60 fps)
```

---

## Socket Contracts

The real-time wire protocol is documented in
[`websocket_events.md`](./websocket_events.md). The four core events are:

| Event | Direction | Purpose |
|-------|-----------|---------|
| `orbital_snapshot` | S → C | Full positional + risk state of every tracked object |
| `player_cleanup` | C → S / S → C | Operator spends Cleanup Energy to remove a debris object |
| `collision_alert` | S → C | A conjunction has crossed the alert threshold; cascade brewing |
| `game_over` | S → C | The Kessler Cascade has run away — Earth is locked in debris |

---

## Testing

```bash
npm test                    # server + simulation suites
npm run test:sockets        # live Socket.io contract checks
npm run test:net            # 2 Hz loop + conjunction / cascade logic
```

---

*Built for the NASA Space Apps Challenge 2026 — Solar Sentinel.
Protecting our orbital frontier. 🛰️✨*
