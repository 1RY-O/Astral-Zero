# ASTRAL ZERO — Design System

Built for the **NASA International Space Apps Challenge 2026**.

## 1. Visual Identity & Art Direction: "Cathode Salvage" (Terminal Riot)

**ASTRAL ZERO** operates under the "Cathode Salvage" aesthetic: a loud, saturated, hyper-stylized deep-space pirate broadcast where the player streams salvage jobs live over jury-rigged Channel 73.

The theme centers around **Zero** — driving an orbit's lowest point (perigee) down to absolute zero in Earth's atmospheric furnace.

- **Tagline:** `DRIVE THE PERIGEE TO ZERO.`
- **Brand Glyph:** `Ø` (the stroked zero — featured on tug chassis, capture zone, and broadcast lockup)
- **Win Condition Flair:** On deorbit commitment, the live telemetry counts down to `0 KM` with an `ORBIT ZEROED · Ø` badge before the supernova burst.

---

## 2. Palette: Terminal Riot (Non-Negotiable)

1. **Vacuum** (`#0D0618`): Deep indigo-black space substrate.
2. **Signal Cyan** (`#4DFFDF`): Primary glow, target reticles, mooring locks, and active telemetry.
3. **Solar Flare** (`#FF9E3D`): RCS thruster particle plume, secondary warnings, propellant meters.
4. **Plasma Magenta** (`#FF4DE1`): Projected trajectory arc, danger states, conjunction alarms, atmospheric capture horizon.
5. **Grid Violet** (`#8C4DFF`): Coordinate tickmarks, card borders, telemetry backdrops.
6. **Riot Lime** (`#B8FF4D`): Rare streak and combo color ONLY. Appears when maintaining high tension and opening the Re-Entry Window.

### Semantic & Dynamic Usage Rules:
- **Color is the Health Bar**: The screen becomes more saturated and colorful the better the player performs (`.popping-off-sat`). When propellant is critical ($< 220$ m/s) or conjunction is imminent ($< 14$s), the frame desaturates toward grayscale static (`.failing-desat`).
- **Supernova Celebration**: On successful deorbit, 60 colorful particles burst across all 5 palette colors.
- **Death Collapse**: A 1-second grayscale and RGB static glitch tear (`.death-static-burst`) accompanies collision or fuel exhaustion.

---

## 3. Typography Pairing
- **Display & Telemetry:** `JetBrains Mono`, monospace (Tabular figures, high-contrast digital broadcast telemetry).
- **Secondary:** System monospace fallback (`SF Mono`, Consolas).

---

## 4. Name & Brand Lockup
- **Title:** **ASTRAL ZERO** — two words, no slashes anywhere.
- **Mark:** `ASTRAL ZERO · Ø`
- **Fictional Context:** Channel 73 Pirate Salvage Feed, hosted by MEG AI.
