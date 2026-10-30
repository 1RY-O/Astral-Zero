# Status

## Current phase
Phase 2 — backend rewrite. Not yet started. Awaiting human approval to begin.

## Completed
- Phase 0: recon complete. Findings in docs/RECON.md.
- Phase 1: cleanup + React toolchain. Commits 502d25f, 095abf6 on 
  feat/debris-derby. Build, tests (7/7), lint, audit all green.

## Rollback point
Commit 095abf6 (Phase 1 complete). Hard-reset target if Phase 2 breaks.

## Next session
Phase 2: replace src/game/loop.js with 2 Hz ambientCatalog. Strip server 
gameplay authority. Add /api/levels, /api/leaderboard, /api/health. Rewrite 
Socket.io events. Update websocket_events.md to match EXACTLY. Validate 
inbound payloads. Do not touch client gameplay.

## Known issues
- websocket_events.md has three-way version disagreement: 
  1.0.0-solar-sentinel vs 1.5.0-s14 vs 1.0.0. Resolve in Phase 2 — grep 
  for all three strings at the end and prove they are gone.
- Old Solar Sentinel client still bundled. Deliberate, removed in Phase 5.

## Pending human verification
- Phase 3 end: swing a tethered object yourself on the bare canvas.
- Phase 4 mid: play levels 1-3 yourself.
- Phase 5 end: open on real phone, not emulator.
- Phase 8: clean-clone README and follow verbatim.
