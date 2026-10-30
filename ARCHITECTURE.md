# Debris Derby — Architecture & System Design

Built for the NASA International Space Apps Challenge 2026.

## Overview

Debris Derby is built on a decoupled, dual-clock architecture that separates foreground interactive physics from ambient orbital data streaming:
1. **60 Hz Client Foreground Physics:** Simulates the cleanup tug, momentum tether, satellite bodies, collisions, and re-entry atmospheric kill-zones.
2. **2 Hz Server Ambient Catalog:** Fetches active satellite TLEs from Celestrak, propagates them using SGP4, streams ambient coordinates over Socket.io, and authoritatively validates submitted scores.

---

## 1. Physics Engine (`src/physics/world.js`)

The client simulation runs in a local **Hill's relative reference frame** (relative to the cleanup tug's circular Low Earth Orbit):

* **Verlet Integration:**
  $$\vec{x}(t + \Delta t) = \vec{x}(t) + (\vec{x}(t) - \vec{x}(t - \Delta t)) \cdot d + \vec{a}(t) \Delta t^2$$
  where $d = 0.9995$ is numerical velocity damping. No artificial downward gravity is applied; objects drift freely in zero-g.
* **Position-Based Distance Constraints (PBD):**
  The momentum tether is resolved using 12 constraint iterations per step:
  $$\Delta \vec{x}_a = \vec{n} \cdot (|\vec{x}_b - \vec{x}_a| - L_{\text{target}}) \frac{w_a}{w_a + w_b}$$
  where $w = 1/m$ is the inverse mass. The anchor tug is fixed ($w_{\text{tug}} = 0$). The tether remains slack below its rest length ($160\text{ px}$) and pulls taut up to its maximum reach cap ($300\text{ px}$).
* **Fixed Timestep Accumulator:**
  Driven at $\Delta t = 1/60\text{ s}$ with a maximum of 5 substeps per rendered frame to prevent death spirals on frame drops.
* **Atmospheric Kill-Zone:**
  The bottom boundary represents Earth's upper atmospheric re-entry limb. Objects penetrating the limb are vaporized and deleted immediately without bouncing or sliding.
* **Circle-Circle Collision & Destructible Fragmentation:**
  Transverse high-speed collisions ($v_{\text{rel}} > 75\text{ px/s}$) trigger fragmentation of destructible objects into 3 smaller daughter fragments with distributed masses and momentum conservation.

---

## 2. React UI Boundary (`src/app.jsx`)

* **Single Ref Canvas Mount:**
  React mounts the `<canvas>` element once via `useRef`. The animation loop (`requestAnimationFrame`) executes outside React's render lifecycle: no state updates occur per frame.
* **Decoupled HUD Throttling:**
  Live score and fuel data are sampled at 4 Hz to drive React HUD overlays without incurring React rendering overhead.
* **ReactBits Integration:**
  - `SpotlightCard`: Dynamic pointer-reactive spotlight cards for main menu and level selection.
  - `Magnet`: Magnetic physics-pull buttons for primary calls to action.
  - `CountUp`: Smooth animated number transitions for score, chain multiplier, and fuel readouts.
  - `SplitText`: Animated typography for mission title presentations.

---

## 3. Server & Ambient Catalog (`src/game/ambientCatalog.js`, `server.js`)

* **Celestrak Ingestion:**
  Ingests active satellite elements via the General Perturbations JSON API (`https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json`).
* **Loud Failure Policy:**
  No silent fallbacks. If Celestrak is unreachable or returns a non-200 status, the server sets `catalogStatus` to `'stale'` (serving previous cache) or `'unavailable'` (empty array). Historical TLEs are never served silently.
* **SGP4 Propagation:**
  On a 2 Hz interval, cached elements are evaluated at current UTC time using `satellite.js` to compute latitude, longitude, and altitude coordinates.
* **Score Verification & Validation:**
  The server recomputes the score for every completed mission submitted via `run_submit`. The calculation verifies retrograde deorbits ($\Delta v < 0$), causal chain windows ($900\text{ ms}$), linger counts, and remaining fuel.

---

## 4. Audio Synthesis (`src/game/audio.js`)

Procedural Web Audio API sound synthesis:
- **Grab:** High-frequency triangular snap (600 Hz → 300 Hz).
- **Whip:** Sine wave pitch sweep (880 Hz → 160 Hz).
- **Thrust:** Low-frequency sawtooth pulse (90 Hz → 45 Hz).
- **Impact:** Layered sawtooth and square wave shatter burst.
- **Deorbit:** Two-tone harmonic confirmation bell (C5 → E5 / G5 → C6).
- **Cascade:** Scaled exponential harmonic chime based on chain index.
