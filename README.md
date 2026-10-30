# HELIOS PROTOCOL: Space Weather Superhero Tycoon

> **Built for the NASA International Space Apps Challenge 2026.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![NASA Space Apps](https://img.shields.io/badge/NASA%20Space%20Apps-2026%20Submission-0B3D91.svg)](https://www.spaceappschallenge.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933.svg?logo=nodedotjs)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB.svg?logo=react)](https://react.dev/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8.4-010101.svg?logo=socketdotio)](https://socket.io/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646CFF.svg?logo=vite)](https://vitejs.dev/)

---

## ☀️ The Pitch

**HELIOS PROTOCOL** is an addictive idle-tycoon game where you step into the shoes of the Director of an international space-protection agency. Your mission: defend Earth’s power grids, satellite constellations, and astronauts from catastrophic space-weather threats driven by **Solar Cycle 25**.

Blending the tactile satisfaction of *Cash Inc.* and *Roblox Tycoons* with high-stakes space science, HELIOS puts you in charge of three superhero divisions. Manage your **Funding Credits**, keep Earth’s **Magnetosphere Integrity** above critical collapse levels, and endure scathing commentary from a corrupted, hostile NASA Mission Control AI assistant that berates your financial decisions while solar flares melt your capacitors.

```
+-----------------------------------------------------------------------------------+
|  [HELIOS PROTOCOL // NASA INTERNATIONAL SPACE APPS CHALLENGE 2026]                |
|                                                                                   |
|    (EARTH)                                                               (THE SUN)|
|    [###]=====>  [HERO CRAFT IN FLIGHT]  =====>  [ABSORBS FLARE]  =====>  ( * * * )|
|    SHIELD: 94%                                                          SDO: X5.4 |
|                                                                                   |
|  +-------------------------+ +-------------------------+ +----------------------+ |
|  | SOLAR OBSERVATION CTR   | | RESEARCH LAB            | | SAT DEFENSE DIVISION | |
|  | [LIVE OBSERVATION]      | | [SCIENTIFIC FORECAST]   | | [HERO MISSION]       | |
|  | NASA SDO AIA Flares     | | NASA DONKI CMEs         | | NOAA SWPC Kp Storms  | |
|  | [DEPLOY INTERCEPTOR]    | | [DEPLOY HARVESTER]      | | [DEPLOY CRUISER]     | |
|  | ⚙ AUTO-DEPLOY ACTIVE    | | ⚙ AUTOMATE ($1,200)     | | ⚙ AUTOMATE ($2,500)  | |
|  +-------------------------+ +-------------------------+ +----------------------+ |
+-----------------------------------------------------------------------------------+
```

---

## 🛰 How HELIOS Uses NASA Data

HELIOS PROTOCOL bridges real-world heliophysics data pipelines into gamified tycoon mechanics. In the command dashboard, operations are strictly categorized into three transparent tiers:

| Simulation Pillar | Scientific Agency / Instrument | Real-World Concept Simulating | Gameplay Mechanic |
|---|---|---|---|
| **`[LIVE OBSERVATION]`** | **NASA SDO** (Solar Dynamics Observatory) AIA 131Å / 171Å / 304Å | Extreme Ultraviolet (EUV) solar flares and Active Region coronal loops | High-speed manual clicks; rapid flare interception and immediate credit rewards. |
| **`[SCIENTIFIC FORECAST]`** | **NASA DONKI** (Space Weather Database of Notifications, Knowledge, Information) | Coronal Mass Ejections (CMEs), WSA-Enlil 3D solar wind modeling, interplanetary shock transit (15–72h) | Mid-range generation; deflecting plasma fronts and automated research revenue. |
| **`[SIMULATED HERO MISSION]`** | **NOAA SWPC** (Space Weather Prediction Center) | Planetary K-index ($Kp = 0\text{--}9$), G1–G5 storm scales, and Magnetopause Bow Shock compression ($10\,R_E \to <6.6\,R_E$) | Heavy superhero defense cruisers; repairing dipole shield integrity and grid defense. |

### In-Game Science Telemetry Modal
Players and judges can click the **`[🛰 NASA DATA & SOURCES]`** button in the HUD to open the interactive `ScienceAndSources.jsx` telemetry modal, which outlines the exact data sources, formulas, and references underpinning the game.

---

## 🧠 Educational Value

HELIOS PROTOCOL turns abstract solar-terrestrial physics into palpable cause-and-effect gameplay:

1. **Solar Flares vs. Coronal Mass Ejections (CMEs):** Players learn that solar flares travel at light speed ($c \approx 8.3\text{ minutes}$ to Earth), causing immediate high-frequency radio blackouts (R-scale), whereas CMEs are magnetized plasma clouds that take 15 to 72 hours to arrive, driving severe geomagnetic storms.
2. **Earth's Magnetosphere as a Living Shield:** The game visually models Earth’s dipole magnetic field and dayside bow shock standoff distance. When coronal mass ejections exert high dynamic pressure, the magnetopause compresses inside geostationary orbit ($6.6\,R_E$), exposing satellites directly to solar wind plasma.
3. **Geomagnetically Induced Currents (GICs):** If Magnetosphere Integrity drops to 0%, the game illustrates how extreme space storms induce electrical currents in ground high-voltage transformers, triggering widespread planetary power blackouts.
4. **Automation & Resource Allocation:** Teaches the real-world operational challenges space agencies face: balancing limited funding credits between rapid manual intervention and long-term automated space-weather observation networks.

---

## 🎮 Core Gameplay Mechanics & Juice

### 1. The Cash Inc. Visual Upgrade
- **Tactile 3D Buttons:** Chunky, beveled arcade buttons with responsive physical depression, custom hover states, and chromatic glitch effects.
- **Interplanetary Flight Corridor:** Deploying a hero craft spawns a glowing ship that journeys across the 1-AU corridor between Earth and the Sun, absorbs solar flare plasma at the corona, and flies back to Earth.
- **Celebratory Audio & Floating Rewards:** Returning hero craft trigger crystalline Cash Inc. arpeggiated chimes (`playCashChime`) and floating neon `+Credits` and `+Integrity` particles.
- **Tycoon Automation:** Each department can be upgraded with automated drone deployment (`⚙ AUTOMATE`), generating passive revenue and continuous shield repairs.

### 2. The Hostile AI Assistant
An unhinged, sarcastic NASA Mission Control AI assistant monitors your performance via WebSocket telemetry:
- Berates you when you idle while Solar Cycle 25 peaks.
- Sounds high-intensity red alerts and violently shakes the CRT screen when Magnetosphere Integrity drops below 35%.
- Mocks your balance sheet when you flirt with corporate insolvency.

---

## 🛠 Tech Stack

- **Frontend:** React 18, Vite 7.3, WebGL Canvas (MicroSlats shader background), Web Audio API (procedural retro synthesis).
- **Backend:** Node.js (v20+), Express 4, Socket.IO 4.8.4.
- **Architecture:** Separated client/server monorepo with real-time bidirectional WebSocket state synchronization.
- **Design Tokens & Styling:** Corrupted CRT scanlines, chromatic aberration shaders, phosphor wireframes, and responsive tactile controls.

---

## 🚀 Run Instructions

### Prerequisites
- Node.js $\ge 18.0.0$
- npm $\ge 9.0.0$

### 1. Installation
Clone the repository and install dependencies across the monorepo:
```bash
git clone https://github.com/1RY-O/Astral-Zero.git helios-protocol
cd helios-protocol
npm install
```

### 2. Running in Development Mode
You can start the full stack concurrently or run each service in separate terminal windows:

#### Option A: Single Command (Concurrent)
```bash
npm run dev
```

#### Option B: Separated Client & Server (Recommended for Debugging)
- **Terminal 1 (Backend Server):**
  ```bash
  npm run dev:server
  ```
  *Starts the Express + Socket.IO space weather server on `http://localhost:3000`.*

- **Terminal 2 (Vite Frontend):**
  ```bash
  npm run dev:client
  ```
  *Starts the Vite React development server on `http://localhost:5173` (proxied to backend).*

### 3. Production Build
Verify all production build targets:
```bash
npm run build
```

---

## 📂 Project Architecture

```
helios-protocol/
├── client/                     # Vite + React 18 Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Landing.jsx            # WebGL MicroSlats cosmic landing page
│   │   │   ├── TycoonDashboard.jsx    # HELIOS command console & flight corridor
│   │   │   ├── ScienceAndSources.jsx  # NASA DONKI/SDO/NOAA scientific modal
│   │   │   └── RageNotifications.jsx  # Corrupted AI boss taunt banner
│   │   ├── audio.js                   # Procedural Web Audio API sound engine
│   │   ├── styles/glitch.css          # CRT scanlines & tactile button styles
│   │   └── App.jsx                    # Root client router & socket orchestration
│   └── package.json
├── server/                     # Node.js + Express + Socket.IO Backend
│   ├── routes/
│   │   ├── missions.js                # Space weather sectors & classifications
│   │   └── telemetry.js               # Simulated live SDO/DONKI/NOAA feed
│   ├── index.js                       # Authoritative game simulation tick & AI
│   └── package.json
├── shared/                     # Shared constants, economy & science specs
│   └── constants.js
└── README.md
```

---

## 📜 Citations & Scientific Integrity

- **NASA Solar Dynamics Observatory (SDO):** Atmospheric Imaging Assembly (AIA) multi-wavelength extreme ultraviolet imaging.
- **NASA DONKI:** Space Weather Database of Notifications, Knowledge, Information (Space Weather Analysis Center & Community Coordinated Modeling Center).
- **NOAA SWPC:** Space Weather Prediction Center Planetary K-index & Space Weather Scales (NOAA-SWPC-G/S/R).
- **Compliance:** Built strictly for the **NASA International Space Apps Challenge 2026**. Free of banned instruments or secondary unverified metrics.
