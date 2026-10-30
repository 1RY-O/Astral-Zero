# KESSLER TYCOON: Orbital Debris Management Simulator

> **Built for the NASA International Space Apps Challenge 2026.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![NASA Space Apps](https://img.shields.io/badge/NASA%20Space%20Apps-2026%20Submission-0B3D91.svg)](https://www.spaceappschallenge.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933.svg?logo=nodedotjs)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB.svg?logo=react)](https://react.dev/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8.4-010101.svg?logo=socketdotio)](https://socket.io/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646CFF.svg?logo=vite)](https://vitejs.dev/)

---

## 🚀 The Pitch

**KESSLER TYCOON** is an addictive visual space-management idle-tycoon game where you play as an orbital debris contractor hired by a rogue, corrupted NASA flight AI. 

Low Earth Orbit (LEO), Medium Earth Orbit (MEO), and Geostationary Orbit (GEO) are rapidly congesting with defunct satellites, rocket stages, and hypervelocity shrapnel. Your goal: deploy orbital tugs to clear debris, earn contract bounties, grind for automated tug upgrades, and prevent a runaway **Kessler Cascade** before Mission Control terminates your contract or your budget collapses into bankruptcy.

```
+-----------------------------------------------------------------------------------+
|  [LIVE ORBITAL RADAR — EARTH LEO / MEO / GEO RINGS]                               |
|                                                                                   |
|                   . - ~ ~ - .      (GEO RING - HOT PINK)                          |
|               . '     . - ~ ~ - .                                                 |
|             /     . '   . - ~ - .   \  (MEO RING - PURPLE)                        |
|            /     /    . '       ' .  \                                            |
|           |     |    |   (EARTH)   |  | (LEO RING - SKY BLUE)                     |
|           |     |    |   [#####]   |  |                                           |
|            \     \    \  ^--|>     /  /  <== [GLOWING TUG LAUNCHING OUT]          |
|             \     . '   ' - ~ - ' . /          [ZAPS DEBRIS WITH LASER]           |
|               . '     . - ~ ~ - . '            [RETURNS WITH +$350 CASH]          |
|                   ' - ~ ~ - '                                                     |
|                                                                                   |
|  +-------------------------+ +-------------------------+ +----------------------+ |
|  | LOW EARTH ORBIT (LEO)   | | MEDIUM EARTH ORBIT(MEO) | | GEOSTATIONARY (GEO)  | |
|  | DEBRIS: 14              | | DEBRIS: 18              | | DEBRIS: 25           | |
|  | PAYOUT: +$350           | | PAYOUT: +$550           | | PAYOUT: +$900        | |
|  | [🚀 DEPLOY TUG ($200)]  | | [🚀 DEPLOY TUG ($200)]  | | [🚀 DEPLOY TUG ($200)]| |
|  | NEXT: AUTO-TUG ($1,500) | | NEXT: AUTO-TUG ($3,000) | | NEXT: AUTO-TUG ($5,000)| |
|  +-------------------------+ +-------------------------+ +----------------------+ |
+-----------------------------------------------------------------------------------+
```

---

## 🛰 Core Visual Feedback & Gameplay Loop

### 1. Central Orbital Radar Canvas
- **Planet Earth at Center:** An illuminated Earth sphere rendered at the center of the orbital arena.
- **Three Concentric Orbital Rings:**
  - **LEO Ring (Sky Blue):** 160 – 2,000 km.
  - **MEO Ring (Purple):** 2,000 – 35,786 km.
  - **GEO Ring (Hot Pink):** 35,786 km.
- **Dynamic Orbiting Debris:** Real debris dots orbit each ring at realistic relative velocities. The visible dot count directly tracks active debris in that orbital band.
- **Visible Flying Tugs & Laser Zaps:**
  - Clicking **DEPLOY TUG** launches a glowing triangular tug craft from Earth.
  - The tug flies along a forward trajectory straight to the designated ring and targets a debris dot.
  - On arrival, the tug fires a laser zap beam at the debris, triggering an explosion of sparks and vaporizing the dot.
  - Crystalline payout chimes sound and floating text (`+$350`, `+1 CLEARED`) floats up from the zap location.
  - The tug maneuvers around and flies back to dock with Earth.

### 2. Roblox Tycoon Progression Loop
- **Grind & Upgrade Goals:** Each orbital sector clearly displays its next upgrade goal (e.g. `NEXT UPGRADE: AUTO-TUG ($1,500)`).
- **Automation Unlocks:** The button is grayed out until the player earns enough budget. Once purchased, the sector unlocks `⚡ AUTO-TUG ACTIVE`, automatically dispatching tugs and banking cash on autopilot.
- **Fleet Speed Upgrades:** Upgrade tug engines (MK-1 to MK-5) to cut transit times and boost contract payouts across all zones.

### 3. Sarcastic Corrupted NASA AI
- Monitors contractor performance via real-time WebSocket events.
- Taunts the player when idle, berates failed financial bets, and triggers high-intensity red alert screen shakes when Kessler Risk exceeds 80%.

---

## 🛠 Tech Stack

- **Frontend:** React 18, Vite 7.3, WebGL Canvas (MicroSlats shader background), 2D Canvas orbital radar (rAF loop), Web Audio API (procedural retro synthesis).
- **Backend:** Node.js (v20+), Express 4, Socket.IO 4.8.4.
- **Architecture:** Separated client/server monorepo with real-time bidirectional WebSocket state synchronization.

---

## 🚀 Run Instructions

### Prerequisites
- Node.js $\ge 18.0.0$
- npm $\ge 9.0.0$

### 1. Installation
```bash
git clone https://github.com/1RY-O/Astral-Zero.git kessler-tycoon
cd kessler-tycoon
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
  *Starts the Express + Socket.IO server on `http://localhost:3000`.*

- **Terminal 2 (Vite Frontend):**
  ```bash
  npm run dev:client
  ```
  *Starts the Vite React development server on `http://localhost:5173`.*

### 3. Production Build
Verify all production build targets:
```bash
npm run build
```

---

## 📜 Compliance
Built for the **NASA International Space Apps Challenge 2026**. Free of banned instruments or secondary unverified metrics.
