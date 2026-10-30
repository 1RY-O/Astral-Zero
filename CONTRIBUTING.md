# Contributing to Debris Derby

Built for the **NASA International Space Apps Challenge 2026**.

Thank you for contributing to Debris Derby! Please review these guidelines before submitting pull requests.

---

## 1. Core Principles & Hard Rules

1. **Challenge Phrasing:**
   Always use the exact phrasing: *"built for the NASA International Space Apps Challenge 2026."* Do not invent an unconfirmed challenge sub-title.
2. **Citation Ban List:**
   - **Never cite LRO/LEND** (Lunar Reconnaissance Orbiter / Lunar Exploration Neutron Detector is a lunar surface instrument unrelated to Earth orbital debris).
   - **Never cite unverified debris figures** (e.g. popular media round numbers like "36,000"). Use verified NASA ODPO or ESA primary sources only.
3. **Architecture Discipline:**
   - React 18 is UI chrome only. The `<canvas>` element is mounted once in a ref and driven by `requestAnimationFrame` outside React's render cycle.
   - Foreground physics ticks at 60 Hz on the client. Ambient catalog ticks at 2 Hz on the server.
   - The three locked verbs are **GRAB**, **THRUST**, **RELEASE**. Do not add weapons, lasers, aiming reticles, ammo, or cooldowns.
4. **Toolchain Constraints:**
   - No TypeScript migration.
   - No Rust/WASM in the core build path.
   - No external game engines (Phaser, Matter.js, Pixi.js, etc.).
   - No Google Fonts runtime hotlinks; use self-hosted `@fontsource` packages.

---

## 2. Development Setup

```bash
# Clone the repository
git clone https://github.com/1RY-O/debris-derby.git
cd debris-derby

# Install exact dependencies
npm ci

# Start local development server (Vite on :5173, Backend on :3000)
npm run dev
```

---

## 3. Quality Standards

Before committing, ensure all quality gates pass:

```bash
# 1. Run unit and contract tests
npm test

# 2. Run ESLint checks
npm run lint

# 3. Verify production build
npm run build
```

---

## 4. Conventional Commits

Commits must follow the Conventional Commits specification:
- `feat(game): ...` — Gameplay features, scoring, mechanics.
- `feat(ui): ...` — React chrome, design system, HUD components.
- `fix(physics): ...` — Numerical integration, constraint solver, collision fixes.
- `feat(server): ...` — REST routes, ambient catalog, Socket.io handlers.
- `docs: ...` — Documentation updates, README changes.
- `chore: ...` — Quality gates, dependencies, build scripts.
