# Debris Derby

Built for the NASA International Space Apps Challenge 2026.

Debris Derby is a physics-based orbital tether cleanup game. Operating a cleanup tug in Low Earth Orbit, you grapple dead satellites and orbital fragments, swing them on a momentum tether, and release them onto clean deorbit trajectories into the atmosphere.

You have no weapons, no ammo, and no lasers: you have mass, momentum, and a rope.

---

## 1. The Problem — Kessler Syndrome

In 1978, NASA astrophysicist Donald Kessler described a catastrophic scenario for space exploration: past a critical density of orbital debris in Low Earth Orbit (LEO), collisions between objects spawn thousands of new fragments. Each fragment becomes a projectile capable of striking other satellites, triggering an exponential, self-sustaining cascade known as **Kessler Syndrome**.

Once Kessler Syndrome takes hold, satellite collisions create more debris than natural atmospheric drag can clear, rendering critical orbital bands impassable for generations. The most cost-effective way to preserve access to space is mass removal: deorbiting high-mass dead payloads before they collide and trigger runaway fragmentation.

---

## 2. The Game: Three Verbs & Orbital Physics

Debris Derby strips away conventional shooting mechanics. Every action relies on orbital mechanics and momentum exchange.

| Verb | Input | Mechanism |
|---|---|---|
| **GRAB** | Pointer/Touch down or `E` | Attaches a position-based distance tether to the nearest debris within reach. |
| **THRUST** | Hold `Space`, `WASD` / Arrows, or virtual stick | Applies thrust along the tether normal to accelerate the swing; drains finite fuel. |
| **RELEASE** | Pointer/Touch up, click tethered object, or `Q` | Detaches the tether, releasing the satellite along its current tangential release velocity. |

### Prograde vs. Retrograde Releases (The 25-Year Rule in Motion)

In Low Earth Orbit, direction of release determines satellite fate:

* **Retrograde Release (Backward, against orbital velocity vector $\Delta v < 0$):**
  Reduces orbital velocity, lowers orbital perigee into Earth's upper atmosphere, and causes clean re-entry burn-up. Earns a **+80 clean deorbit bonus**.
* **Prograde Release (Forward, with orbital velocity vector $\Delta v > 0$):**
  Pumps energy into the orbit, raises orbital apogee, extends orbital lifetime, and worsens orbital congestion. Results in a **-150 penalty**.
* **Sideways Transverse Collision:**
  Swinging a satellite into another debris object shatters it into 3 smaller fragments. Removals linked within the **900 ms** causal cascade window trigger exponential score multipliers.

### Scoring Formula

```
object_value        = 50 * clamp(mass_kg / 10, 0.5, 4)
cascade_multiplier  = n * (n + 1) / 2
deorbit_bonus       = 80  per retrograde release
prograde_penalty    = -150 per prograde release
fuel_bonus          = 500 * (fuel_left / fuel_max)

round_score = Σ(object_value * cascade_multiplier) + (80 * deorbit_count) - (150 * prograde_count) + fuel_bonus
```

---

## 3. NASA Grounding & Mission Standards

Debris Derby's design directly reflects NASA standards and real-world orbital data:

1. **Celestrak / NORAD Active Catalog (OMM TLEs):**
   The ambient space background is propagated from live General Perturbations (GP) orbital data provided by Celestrak using SGP4 propagation (`satellite.js`). No historical or synthetic fallback data is served silently.
2. **NASA 25-Year Rule & Post-Mission Disposal Standards:**
   - **NASA Safety Standard 1740.14** (*Guidelines and Assessment Procedures for Limiting Orbital Debris*)
   - **NPR 8715.6E** (*NASA Procedural Requirements for Limiting Orbital Debris*, effective April 18, 2024)
   - **NASA-STD-8719.14** (*Process for Limiting Orbital Debris*)
   
   These standards mandate that LEO missions plan for atmospheric disposal within 25 years (and recently tightened toward 5 years). Only retrograde burns decrease semi-major axis and perigee altitude to achieve atmospheric capture.

---

## 4. Architecture

Debris Derby utilizes a split-clock architecture to maintain real-time physical simulation on client hardware while streaming ambient orbital data from the server.

```
+-------------------------------------------------------------------------+
|                              CLIENT (60 Hz)                             |
|                                                                         |
|  +--------------------+        +-------------------------------------+  |
|  | React 18 Shell     |        | WebGL Physics Renderer              |  |
|  | - ReactBits UI     |        | - Fixed-step Verlet (60 Hz)         |  |
|  | - HUD & Menus      |<------>| - Rigid distance constraint solver  |  |
|  | - Interactive Tuts |        | - Earth limb atmospheric shader     |  |
|  | - Mobile Touch     |        | - Parallax starfield & trajectory   |  |
|  | - Web Audio synth  |        | - Atmospheric kill-zone             |  |
|  +--------------------+        +-------------------------------------+  |
+-------------------------------------------------------------------------+
                                    ^
                                    | Socket.io (JSON)
                                    | 2 Hz ambient catalog & run submit
                                    v
+-------------------------------------------------------------------------+
|                              SERVER (2 Hz)                              |
|                                                                         |
|  +-----------------------------+     +-------------------------------+  |
|  | Celestrak GP Ingestion      |     | REST & Validation Service     |  |
|  | - 30-min cache refresh      |     | - GET /api/health             |  |
|  | - SGP4 propagation          |     | - GET /api/levels             |  |
|  | - Loud failure policy       |     | - GET /api/leaderboard        |  |
|  | - Attribution tracking      |     | - Authoritative score recheck |  |
|  +-----------------------------+     +-------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 5. Missions (Levels 1–8)

1. **First Contact** — Single heavy satellite, generous tether reach, learn GRAB → THRUST → RELEASE.
2. **Two-Body Problem** — Two drifting bodies; momentum transfer between consecutive swings.
3. **Clean Sweep** — Clustered debris field; cascade fragmentation multiplier introduction.
4. **Ricochet** — Elastic boundaries; bank payloads off obstacles toward atmospheric entry.
5. **Dominoes** — Chained removals within the 900 ms causal window.
6. **Fragile Cargo** — Mass limits and tension sensitivity.
7. **Moving Targets** — Drifting orbital velocities; lead the grab ahead of the trajectory.
8. **Kessler Event** — Dense chaotic field and finite fuel budget; the final operational exam.

---

## 6. Installation & Run Instructions

### Prerequisites
- Node.js >= 20.19.0
- npm >= 10.0.0

### Quick Start

```bash
# Clone the repository
git clone https://github.com/1RY-O/debris-derby.git
cd debris-derby

# Install dependencies
npm ci

# Run development server (Client on :5173, Backend on :3000)
npm run dev
```

### Full Production Build & Test

```bash
# Run unit and contract test suite
npm test

# Run ESLint validation
npm run lint

# Build production bundle
npm run build

# Start production server
npm start
```

Visit `http://localhost:3000` in your web browser.

---

## 7. License & Credits

Built for the **NASA International Space Apps Challenge 2026**.

- Physics & Gameplay: Verlet integration, Position-Based Dynamics, Hill's relative reference frame.
- Data Source: Celestrak GP API (`https://celestrak.org`).
- License: MIT.
