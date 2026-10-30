# Changelog — Debris Derby

All notable changes to this project are documented in this file.

## [2.1.0] - 2026-10-30 — Final Visual, Physics & Full Architecture Push

### Physics Engine Overhaul
- **Rigid Pendulum Tether Dynamics:** Replaced loose slack zone with rigid position-based distance constraints for authentic centrifugal swinging and flinging.
- **Centrifugal Tangential Acceleration:** Normal thrust forces drive high-speed circular angular velocity around the tug.
- **Newtonian Recoil:** Opposite impulse applied to player cleanup tug upon payload release proportional to mass.
- **Tether Snap:** Physical snapping on over-extension with pink screen flash.
- **Permanent Level Deorbiting:** Deorbited satellites are permanently captured in the atmospheric kill-zone to clear missions.

### High-End WebGL Renderer (`src/lib/physicsRenderer.ts`)
- **Earth Limb Shader:** Massive curved Earth limb with Rayleigh-style atmospheric scattering rim glow in `--sky` (#38BDF8) and deep space substrate in `--night` (#060D1F).
- **Parallax Starfield:** Dynamic procedural starfield with parallax displacement driven by tug movement and engine vibration.
- **Dynamic Geometry Batch:** Rendered faceted grey debris polygons with crisp `--white` outlines, glowing sky blue tethers, active engine flames, and dotted prograde/retrograde trajectory curves.

### UI, ReactBits & Mobile Touch
- **Solid Agency Main Menu:** Replaced glassmorphism with high-contrast solid dark navy card and sky blue borders.
- **Interactive Level 1 Tutorial:** Built 3-step overlay tutorial (Grab -> Thrust -> Release Retrograde).
- **ReactBits Integration:** Typography reveal animations (`SplitText`) for level intros and animated counters (`CountUp`).
- **Touch Controls:** On-screen virtual thrust stick, drag-to-grab, and release-to-fire for mobile devices.

### Backend & Toolchain
- **Concurrent Development:** `npm run dev` executes both client Vite server (:5173) and backend Express server (:3000) concurrently via `concurrently`.
- **Quality Gates:** 100% test pass rate (31/31), zero ESLint warnings, production build verified.

### Phase 3 — Physics Engine & Zero-G Overhaul
- **Zero-G Verlet Integration:** Removed constant downward gravity; debris floats naturally in Low Earth Orbit with velocity damping.
- **Position-Based Dynamics (PBD):** Implemented 12-iteration distance constraint solver weighted by inverse mass.
- **Atmospheric Kill-Zone:** Replaced bouncy floor with an atmospheric re-entry limb that vaporizes and deletes debris upon contact.
- **Trajectory Projection:** Added 90-step forward simulation rendered as a dashed trajectory vector.
- **Collision & Fragmentation:** Implemented circle-circle elastic collision and high-velocity destructible fragmentation into 3 daughter debris pieces.
- **Input Responsiveness:** Bound pointer and keyboard inputs (`E`, `Space`, `WASD`, `Q`) with zero-allocation input mapping.

### Phase 4 — Core Game Loop & 25-Year Rule Scoring
- **Three Core Verbs:** GRAB (tether attach), THRUST (momentum acceleration), RELEASE (tangential launch).
- **Prograde vs. Retrograde Scoring:**
  - Retrograde launch ($\Delta v < 0$): +80 clean deorbit bonus.
  - Prograde launch ($\Delta v > 0$): -150 congestion penalty.
- **Cascade Multiplier:** Causal chain detection within a 900 ms window ($n(n+1)/2$ multiplier).
- **Juice & Feel:** Added screen shake, slow-motion ($0.25\times$ for 700 ms), freeze-frame on 5+ chains, and Web Audio procedural synthesis.
- **Mission Levels 1–3:** First Contact, Two-Body Problem, Clean Sweep.

### Phase 5 — Visual Design System & ReactBits Integration
- **React 18 Architecture:** Decoupled React UI chrome from the continuous 60 Hz rAF canvas render loop.
- **ReactBits Integration:** Added `SpotlightCard`, `Magnet`, `CountUp`, and `SplitText` pulled via live registry.
- **Theme Support:** Dark mode default with full light mode toggle, adhering to WCAG AA contrast standards.
- **Legacy Purge:** Deleted legacy client files (`src/main.js`, `src/orbitalMap.js`, `src/styles.css`, `src/audio.js`, `src/demoFeed.js`).
- **Full Level Manifest:** Added Missions 4 through 8 (Ricochet, Dominoes, Fragile Cargo, Moving Targets, Kessler Event).

### Phase 6 — Mobile Responsiveness & Touch Controls
- **Touch Interaction:** Implemented drag-to-grab, drag-to-aim, and release-to-fire on touchscreens.
- **Virtual Thrust Stick:** Added an on-screen responsive thrust joystick and action buttons with $\ge 44\text{px}$ touch targets.
- **Pointer Detection:** Automatically detects coarse pointer devices and dynamically swaps gameplay hints.

### Phase 7 — Celestrak Ingestion & Backend Validation
- **Celestrak GP API:** Integrated General Perturbations active catalog with SGP4 propagation at 2 Hz.
- **Loud Failure Policy:** Strict error reporting (`live`, `stale`, `unavailable`) with no silent fallbacks.
- **REST Endpoints:** Implemented `GET /api/health`, `GET /api/levels`, and `GET /api/leaderboard`.
- **Authoritative Validation:** Validates inbound Socket.io `run_submit` payloads with server-side score recomputation.

### Phase 8 — Documentation & NASA Grounding
- Completely rewrote `README.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, `CONTRIBUTING.md`, and `.env.example`.
- Verified citations against NASA Safety Standard 1740.14, NPR 8715.6E, and NASA-STD-8719.14.
