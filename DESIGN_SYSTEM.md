# Debris Derby — Design System & Visual Tokens

Built for the NASA International Space Apps Challenge 2026.

## 1. Brand Palette Discipline

The design system enforces strict brand discipline with exactly three primary brand colours and supporting neutrals. No fourth brand colour is permitted.

| Token | Hex | Role | Usage |
|---|---|---|---|
| `--sky-300` | `#7DD3FC` | Primary Accent / Tether | Momentum tether line, subtle borders |
| `--sky-400` | `#38BDF8` | Primary Interactive / Player | Player tug, clean deorbits, primary buttons |
| `--sky-500` | `#0EA5E9` | Pressed / Active | Active state, hover emphasis, high contrast |
| `--pink-400` | `#FF5FB0` | Danger Hover | Secondary danger hover states |
| `--pink-500` | `#FF2D95` | Danger / Multiplier / CTA | Cascade multipliers, warnings, penalties |
| `--pink-500-text-on-light` | `#E01A7A` | Accessible Danger Text | WCAG AA compliant text on light mode (4.57:1) |
| `--white` | `#FFFFFF` | Core Neutral Light | Text on dark, high-luminance frames |
| `--canvas-dark` | `#060D1F` | Dark Substrate | Default orbital void background |
| `--canvas-light` | `#F8FAFC` | Light Substrate | Light mode background |
| `--ink` | `#0B1220` | Core Neutral Dark | Text on light surfaces |

---

## 2. Typography

Self-hosted via `@fontsource` packages to guarantee offline resilience and avoid external CDN dependencies:

* **Display Font:** `Space Grotesk` (Weight: 700, 800)
  Used for mission titles, prominent level headers, and score numerals.
* **Body Font:** `Inter` (Weight: 400, 500, 600)
  Used for UI labels, descriptive briefings, instructions, and reports.
* **Monospace Font:** `ui-monospace`, `SFMono-Regular`, `Menlo`, `monospace`
  Used for live telemetry, fuel gauges, coordinates, and diagnostic debug HUD.

---

## 3. Accessibility & Interaction Rules

* **Touch Target Minimum:** All interactive buttons and touch controls have a minimum target size of `44px × 44px` (`--touch-target-min`).
* **Colour Independence:** Gameplay information is never conveyed by colour alone. Highlighting rings, velocity vector arrows, trajectory lines, and badge icons provide redundant visual cues alongside chromatic indicators.
* **WCAG AA Contrast:**
  - Dark Mode: Sky Blue (`#38BDF8`) on `#060D1F` achieves `10.8:1`. White (`#FFFFFF`) on `#060D1F` achieves `17.4:1`.
  - Light Mode: `#E01A7A` on `#F8FAFC` achieves `4.57:1`, exceeding the WCAG AA 4.5:1 requirement.
* **Reduced Motion:** Components query `prefers-reduced-motion`. Physics remains continuous and accurate while decorative screen shake and camera flares are subdued.

---

## 4. Component Manifest

* `SpotlightCard`: Interactive surface with radial glow highlighting the pointer position.
* `Magnet`: Physics spring-attracted button envelope for tactile interactive depth.
* `CountUp`: Smooth numerical transitions for score accumulations and fuel percentages.
* `SplitText`: Staggered letter reveal animations for level introductions.
* `TouchControls`: Virtual joystick and action pad optimized for mobile touchscreens.
