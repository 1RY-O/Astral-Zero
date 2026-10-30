# AGENTS.md — Debris Derby

NASA Space Apps Challenge 2026 submission. Physics-based tether game.

## Read these in order before doing anything
1. docs/DECISIONS.md — locked decisions. Do not re-litigate.
2. docs/STATUS.md — current phase, what is done, what is next.
3. docs/SPEC.md — the full approved brief, phase by phase.
4. docs/RECON.md — Phase 0 inventory. Reference only, does not override.

## Hard rules
- Never invent a NASA challenge title. Phrase: "built for the NASA 
  International Space Apps Challenge 2026."
- No LRO/LEND citations anywhere. See DECISIONS.md for the ban list.
- No Rust/WASM, no TypeScript migration, no game engines (gated stretch only).
- React is UI chrome only. The canvas is mounted once and driven by rAF 
  outside React's render cycle.
- Do not touch client gameplay outside its phase.
- One phase per session. Stop and summarise at phase boundaries.
- Never delete a file without listing it in the plan first.

## Current phase
See docs/STATUS.md. Do not infer phase from conversation history.
