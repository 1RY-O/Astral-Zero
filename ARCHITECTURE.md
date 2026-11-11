# ASTRAL ZERO — System Architecture

Built for the **NASA International Space Apps Challenge 2026**.

## 1. Overview
ASTRAL ZERO is an authentic, pure client-side orbital salvage simulation powered by Vite, React 18, and Canvas/WebGL. The application operates with zero server dependencies, using browser `localStorage` for audio state and mission progression.

---

## 2. Campaign Architecture

- **Act 1 — Training (Contract 0 Drill):** Step-gated orbital rigger drill teaching magnetic mooring, rotation matching, tangential swing pumping, and retrograde atmospheric deorbit. Includes diegetic `[T]` skip option.
- **Act 2 — Contracts (Missions 1 to 3):**
  - Mission 1: `SL-16 BOOSTER` — routine retrieval in decaying orbit.
  - Mission 2: `DELTA-K UPPER STAGE` — heavy spin with mouse-wheel cable reel-in mechanic ($65\text{m} \leftrightarrow 150\text{m}$).
  - Mission 3: `COSMOS RESIDUAL` — cascade risk with active $75\text{s}$ hypervelocity conjunction timer.
  - Interstitial pacing: 3-second black card between missions reporting rank and $\Delta v$ consumption.
- **Act 3 — Credits & Dedication:**
  - High-impact cinematic credits sequence rendered over the starfield and acid-wave glow.
  - Dedicated cards for NASA Space Apps 2026, educational attributions (NASA Orbital Debris Program Office), salvage team credits, and MEG stream sign-off (`"gg. chat, we zeroed the perigee."`).
  - Fully skippable (`[ESC]`) and re-watchable directly from the landing page.

---

## 3. Core Modules

### Engine Layer (`/src/engine/`)
- `physics.js`: Fixed-timestep ($60\text{ Hz}$) Newtonian orbital dynamics, semi-implicit Euler integration, and Position-Based Dynamics (PBD) distance constraint solver for the tether. Implements orbital trajectory prediction (`predictOrbitalPath`), deorbit evaluator (`evaluateDeorbit`), and collision detection (`checkCollision`).
- `loop.js`: Deterministic `FixedLoop` simulation decoupling $60\text{ Hz}$ physics ticks from variable refresh rate screen renders, complete with heartbeat fallback for headless test runners and background tabs.
- `vector.js`: Zero-allocation 2D vector class (`Vec`) with chaining arithmetic.
- `pool.js`: Lightweight object pooling utility for dynamic bodies and vectors.

### Audio Layer (`/src/audio/`)
- `chiptuneEngine.js`: Procedural Web Audio API engine synthesizing mechanical latch clunks, thruster pulses, rising sine-strain whines, 8-bit pentatonic supernova fanfare, bitcrushed failure noise, conjunction klaxons, and ambient space cockpit drone. Persists master mute in `localStorage`.

### Game & Narrator (`/src/game/`)
- `megNarrator.js`: Event-driven MEG pirate streamer AI with broadcast overlay dialogue pools, enforcing strict $\ge 8$s global spacing and 2-minute non-repeat history.

### Render Layer (`/src/render/`)
- `spaceShader.js`: WebGL procedural acid-wave hybrid noise shader blending Terminal Riot colors (`#4DFFDF` and `#8C4DFF` / `#FF4DE1`) with sparkling star glints.
- `ascii.js`: Shimmering block ASCII text generator with 3-band parallax displacement and scroll dissolution.

### UI & Presentation (`/src/ui/` & `/src/App.jsx`)
- `AsciiLandingPage.jsx`: Acid-Wave Hybrid shader + animated ASCII hero title (`ASTRAL ZERO`), brand glyph `Ø`, tagline `DRIVE THE PERIGEE TO ZERO.`, 4-icon How to Play strip, and Three Laws of Cathode Salvage briefing.
- `PixelBootPreloader.jsx`: Chunky pixel tug 4-stage assembly loader with scrolling POST log, segmented LED progress bar, and signal flare.
- `App.jsx`: Primary state machine (`landing` $\to$ `boot` $\to$ `training` $\to$ `missions` $\to$ `credits`), HUD telemetry overlay, MEG broadcast card, dynamic saturation filter, briefing cards, and victory/credits sequence.
