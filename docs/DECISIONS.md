# Decisions

Append-only. Do not edit old entries. Date each entry.

## Naming
- Canonical project name: Debris Derby.
- Challenge phrasing: "built for the NASA International Space Apps Challenge 
  2026." No more specific title unless confirmed published.
- Repo slug: debris-derby (was Astral-Zero).

## Palette (locked)
- --sky-300 #7DD3FC, --sky-400 #38BDF8, --sky-500 #0EA5E9
- --pink-400 #FF5FB0, --pink-500 #FF2D95
- --white #FFFFFF
- Substrate dark #060D1F, light #F8FAFC, ink #0B1220
- No fourth brand colour.

## Banned
- LRO/LEND citations (lunar instrument, unrelated to orbital debris).
- Debris population numbers from secondary sources. NASA ODPO or ESA 
  primary only, and only if verified.
- Rust/WASM in the core build. Gated stretch only, behind a JS fallback.
- TypeScript migration.
- Game engines (Phaser, Matter.js, etc.).
- Google Fonts hotlinks. @fontsource only.

## Architecture
- React 18 for UI chrome only. Canvas mounted once in a ref, rAF loop 
  outside React's render cycle.
- Server ticks at 2 Hz for ambient catalog only. Foreground physics at 
  60 Hz client-side.
- Hill's frame framing for client simulation. SGP4 for ambient catalog.

## Deleted (do not re-add)
- 41 Phaser-era tests, 28 screenshots
- src/friends/, src/lagcomp/, src/shared/
- mcp_settings.json, scripts/visual-verify.mjs
- docs/PHASE2.md, docs/S14_PLAN.md, docs/UIUX.md
- opencode.json: untracked + gitignored, NOT deleted. Local file preserved.
- Old Solar Sentinel client bundle: stays until Phase 5 replaces it.

## Session protocol
- One phase per session. Stop at phase boundary, commit, summarise.
- New session opens by reading DECISIONS.md, STATUS.md, SPEC.md in that order.
