# Status

## Current phase
Phase 2 — backend rewrite. Blocked before code changes: the Celestrak GP API
is unreachable from this environment.

## Completed
- Phase 0: recon complete. Findings in docs/RECON.md.
- Phase 1: cleanup + React toolchain. Commits 502d25f, 095abf6 on 
  feat/debris-derby. Build, tests (7/7), lint, audit all green.
- Phase 2 preconditions:
  - F1: chain-detection window corrected from 2.5 s to **900 ms** in
    docs/SPEC.md and recorded in docs/DECISIONS.md. Implementation has not
    started.
  - F3: the two banned debris-population claims were removed from README.md
    as a stopgap. Phase 8 still rewrites the README.
  - docs/DECISIONS.md amendment appended (2026-10-30).
  - F4: side-by-side socket doc/code reconciliation remains a Phase 2 hard
    gate.

## Blocker
- `celestrak.org:443` times out from this environment. DNS resolves
  correctly to `104.168.149.178` (confirmed via Cloudflare DoH), TCP 443
  does not connect, and a control HTTPS request to example.com succeeds.
  `curl` and the harness fetch both time out. Per instruction, Phase 2 was
  stopped before code changes; no third TLE source was invented.
- Phase 2 cannot satisfy "Celestrak fetch verified working in this session"
  until network egress to celestrak.org is available or a human approves a
  different verified primary source.

## Rollback point
Commit 095abf6 (Phase 1 complete) remains the code rollback target. The
Phase 2 precondition commit sits on top and touches docs/README only; no
runtime code changed.

## Next session
After the Celestrak blocker is resolved: Phase 2 per docs/SPEC.md and
docs/DECISIONS.md. Replace src/game/loop.js with the 2 Hz ambientCatalog
(900 ms chain window is client scoring, not the catalog tick), strip server
gameplay authority, add /api/levels, /api/leaderboard, /api/health, rewrite
Socket.io events to 2.0.0-debris-derby, validate inbound payloads, switch
TLEs to Celestrak with loud failure, reconcile websocket_events.md and code
side by side. Do not touch client gameplay.

## Known issues
- README.md is still Solar Sentinel-era and will be rewritten in Phase 8.
  The F3 stopgap only removed the two unverified debris numbers; do not
  treat the rest of the README as accurate.
- websocket_events.md and the server still disagree on events and payload
  shapes. Phase 2 must resolve this with a side-by-side diff.
- Version strings still include 1.0.0-solar-sentinel, 1.5.0-s14, and
  1.0.0. Phase 2 collapses them to 2.0.0-debris-derby.
- Old Solar Sentinel client still bundled. Deliberate, removed in Phase 5.
- Celestrak is unreachable from this environment (see Blocker).

## Pending human verification
- Phase 3 end: swing a tethered object yourself on the bare canvas.
- Phase 4 mid: play levels 1-3 yourself.
- Phase 5 end: open on real phone, not emulator.
- Phase 8: clean-clone README and follow verbatim.
