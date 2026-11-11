# ASTRAL ZERO · Ø

> **DRIVE THE PERIGEE TO ZERO.**  
> Real-time orbital debris salvage simulation powered by Newtonian orbital mechanics, Position-Based Dynamics (PBD) tether physics, and a pirate broadcast aesthetic. Built for the **NASA International Space Apps Challenge 2026**.

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-orange.svg)](https://www.spaceappschallenge.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Physics Suite](https://img.shields.io/badge/Physics%20Tests-10%2F10%20Passing-brightgreen.svg)](./tests/tether-physics.test.mjs)

---

## THE MISSION & KESSLER SYNDROME

In 1978, NASA astrophysicist Donald J. Kessler theorized that past a critical threshold, the density of objects in Low Earth Orbit (LEO) becomes high enough that collisions between debris pieces cause a self-sustaining, runaway exponential cascade. Today, more than 27,000 trackable objects larger than 10 cm—alongside millions of lethal millimetric fragments traveling at relative velocities up to $8\text{ km/s}$—pollute LEO. A single hypervelocity collision generates thousands of uncontrolled shards, placing critical communication constellations, scientific observations, and human spaceflight (such as the International Space Station) at catastrophic risk.

**Astral Zero** puts you in the cockpit of an off-grid orbital tug streaming salvage runs over pirate broadcast *Channel 73*. Rather than launching costly kinetic interceptors that risk secondary fragment clouds, you execute **Active Debris Removal (ADR)** via **rotational momentum exchange**:
1. Approach tumbling derelict rocket stages (SL-16 Boosters, Delta-K Upper Stages, Cosmos residual stages).
2. Latch onto their structural hardpoints with a high-tensile magnetic winch cable.
3. Fire nose-directed RCS thrusters tangential to rotation to pump angular momentum into the system.
4. Reel in or spool the cable with your mouse wheel to adjust spin rate ($L = I\omega$).
5. Sever the tether precisely inside the retrograde arc—transferring velocity into a negative along-track $\Delta v$ that drives the hulk's perigee under Earth's 100 km Kármán line for total aerothermal incineration.

---

## QUICK START

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation & Local Execution

```bash
# 1. Clone repository
git clone https://github.com/your-username/Astral-Zero.git
cd Astral-Zero

# 2. Install dependencies
npm install

# 3. Start local development client (Vite + React)
npm run dev

# 4. (Optional) Run server telemetry backend
node server/index.js

# 5. Run verified Newtonian physics test suite (10/10 tests)
npm test

# 6. Production client build
npm run build
```

Open [http://localhost:5173](http://localhost:5173) in your browser to launch Channel 73.

---

## CONTROLS

| Key / Input | Action | Mechanical Purpose |
| :--- | :--- | :--- |
| **[A] / [D]** or **[←] / [→]** | Rotate Tug | Keyboard-first directional steering (aligns nose RCS vector) |
| **[W] / [Space] / [Mouse-Hold]** | Fire Thrusters | Fires nose-aligned RCS thrusters (transfers angular momentum) |
| **[E]** | Latch / Unlatch Winch | Fires or disengages high-tensile magnetic mooring cable |
| **[Q]** | Sever Tether | Releases derelict into calculated retrograde re-entry trajectory |
| **Mouse Wheel** | Reel In / Extend Cable | Modulates rest length ($65\text{m} \leftrightarrow 150\text{m}$) to accelerate spin ($L = I\omega$) |
| **[T]** | Skip Tutorial Drill | Bypasses Contract 0 and rolls directly into Mission 1 |
| **[R]** | Reset Contract | Re-engages current orbital salvage assignment |
| **[M]** | Mute Audio | Toggles procedural 8-bit chiptune sound synthesizer |
| **[ESC]** | Escape / Menu | Toggles Channel 73 broadcast terminal / credits sequence |

---

## THE PHYSICS

- **Position-Based Dynamics (PBD) Tether**: Solves non-linear distance constraints and elastic cable sag iteratively, transferring translational thrust from the agile 80 kg tug into rotational momentum of massive ($380\text{--}890\text{ kg}$) tumbling stages.
- **Angular Momentum Conservation**: Shortening cable rest length with the mouse wheel decreases radius $r$ and drives angular velocity $\omega$ upward, converting mechanical tension into explosive whip velocity.
- **Vis-Viva Orbit Integration & Trajectory Predictor**: Integrates gravitational and centrifugal forces forward to compute live projected perigee ($r_p$). When along-track retrograde burn brings $r_p \le 100\text{ km}$, atmospheric drag guarantees passive atmospheric capture and burnup.
- **Deterministic 60 Hz Fixed-Timestep Loop**: Employs an accumulator-based sub-stepping engine (`FixedLoop`), ensuring physics stability regardless of high-refresh displays or frame-rate fluctuations.

---

## TECH STACK

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Client UI** | React 18 / 19, Vite 7 | High-performance reactive state management and fast HMR |
| **Graphics & Shaders** | Canvas 2D + WebGL GLSL | Procedural liquid acid-wave background noise, scanline & chromatic aberration pipeline |
| **Physics Solver** | Native JavaScript (ESM) | Fixed-timestep semi-implicit Euler integration, PBD constraint solving, vector math |
| **Audio Synthesizer** | Web Audio API | Procedural 8-bit chiptune audio (square waves, white noise RCS bursts, pentatonic arpeggio deorbit fanfare) |
| **Telemetry Server** | Node.js, Express, Socket.io | Real-time orbital conjunction warnings, TLE cache, and player state broadcast |
| **Security & Middleware** | Helmet, express-rate-limit | Content Security Policy, HTTP rate limiting, CORS origin restrictions |
| **Testing** | Node.js Test Runner (`node:test`) | 10/10 verified physics unit tests (energy conservation, impulse offsets, perigee math) |

---

## DEPLOYMENT

### 1. Render (Real-Time Web Service)
The server runs on **Render** as a Node.js Web Service to provide persistent WebSocket / Socket.io connectivity:
- **Build Command**: `cd server && npm install`
- **Start Command**: `node server/index.js`
- **Health Check Path**: `/healthz`
- **Autoscaling**: Disabled (single instance required for sticky WebSocket connections).
- Blueprint provided in [`render.yaml`](./render.yaml).

### 2. Vercel (Static Frontend)
The frontend builds as a static Single Page Application (SPA):
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: `VITE_SERVER_URL` (points to deployed Render service).
- SPA routing rewrites configured in [`vercel.json`](./vercel.json).
- *Note*: WebSocket connections cannot run serverless on Vercel; realtime traffic is routed to the dedicated Render instance.

---

## DATA SOURCES & ATTRIBUTION

- **CelesTrak & NORAD**: Two-Line Element (TLE) orbital ephemerides and real orbital catalog tracking data ([celestrak.org](https://celestrak.org)).
- **NASA Orbital Debris Program Office (ODPO)**: Debris density statistics, orbital decay models, and active debris removal guidelines ([odpo.nasa.gov](https://odpo.nasa.gov)).
- **ESA Space Debris Office**: European Space Agency 25-year post-mission deorbit guidelines and mitigation standards.
- **Inter-Agency Space Debris Coordination Committee (IADC)**: Active Debris Removal (ADR) scientific framework.
- **NASA International Space Apps Challenge 2026**: Mission problem statement, educational payload, and technical challenge prompt.

---

## LICENSE

This project is licensed under the [MIT License](./LICENSE) © 2026 Pilla Sri Sai Rahul.
