/**
 * Astral Zero — Central backend configuration.
 * ============================================================
 * Single place for every magic number / env var so that
 * server.js, app.js and sockets/ never hard-code values.
 *
 * NOTE: this file is named `server-config.js` (not `config.js`)
 * because the Phaser frontend already owns `src/config/`
 * (game tuning). Backend vs game config stay separate on purpose.
 *
 * Phase 1: only networking + hosting settings.
 * Gameplay tuning (gravity, jump force, tick rate, bot counts,
 * map list, difficulty curves) will be added here in Phase 2+.
 */

import path from 'path';
import { fileURLToPath } from 'url';

// ESM has no __dirname — rebuild it from the module URL.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

const config = {
  // -- Identity -------------------------------------------------------------
  gameName: 'Astral Zero',
  gameVersion: '0.5.0-phase5', // bump when websocket_events.md changes

  // -- Networking -----------------------------------------------------------
  // `PORT=3000 npm run dev:server` overrides the default.
  port: parseInt(process.env.PORT, 10) || 3000,

  // "*" keeps local Phaser development painless (any origin can connect).
  // In production set CORS_ORIGIN="https://your-domain.com".
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // -- Static hosting ---------------------------------------------------------
  // The Phaser frontend is built with Vite:
  //   - `npm run dev`         → Vite dev server on :5173 (root index.html + src/)
  //   - `npm run build`       → production bundle in `dist/`
  //   - `public/`             → Vite static assets (served at site root as-is)
  //
  // This Express server mirrors that in production:
  //   - `dist/`   → built game (only exists after `npm run build`)
  //   - `public/` → raw assets (always served, dev + prod)
  distDir: process.env.DIST_DIR || path.join(repoRoot, 'dist'),
  publicDir: process.env.PUBLIC_DIR || path.join(repoRoot, 'public'),

  // -- Future gameplay placeholders (DO NOT USE YET — Phase 2+) -------------
  // maxPlayersPerRoom: 8,  // stretch-goal multiplayer rooms
  // maps: ['junkyard', 'solar-array', 'dead-satellite'],

  // -- Phase 3: authoritative simulation tuning ---------------------------
  // The server runs ONE fixed-step loop (see src/game/loop.js) at tickHz.
  // Physics + bot AI + projectiles + respawns + win checks all run inside
  // that tick. Snapshots go out every tick; bot_update every 2nd tick.
  sim: {
    tickHz: 20, // fixed step: 50 ms. Frontend interpolates (any 10–30 Hz works).
    maxSpeed: 260, // px/s horizontal run speed
    airControl: 0.7, // horizontal accel multiplier while airborne
    gravity: 1800, // px/s^2 downward
    jumpVelocity: 640, // px/s upward impulse
    coyoteMs: 100, // forgiveness: jump shortly AFTER leaving ground
    jumpBufferMs: 120, // forgiveness: jump pressed shortly BEFORE landing
    entityRadius: 14, // body circle radius for hits + spawn separation
    speedHackTolerance: 1.35, // legacy player_move vx beyond maxSpeed×this = rejected
    respawnDelayMs: 2500, // dead → alive again after this long
    spawnProtectionMs: 1500, // fresh spawns ignore damage this long (anti-spawn-kill)
    maxProjectiles: 60, // per-room shell cap (oldest fizzle first; see combat)
    // -- Phase 4: lag compensation (favor-the-shooter, bounded) -------------
    // Every entity keeps a short position history; near-miss shells are
    // re-tested against where the victim was when the shooter fired.
    lagComp: {
      historySamples: 40, // ring size per entity (40 ticks ≈ 2 s at 20 Hz)
      gracePx: 26, // near-miss band: direct miss but within rr+grace → rewind test
      maxLatencyMs: 500, // latency estimates clamp here (beyond = untestable)
    },
    // -- Phase 4: weapon feel (server-simulated bloom) ------------------------
    // Sustained fire heats the barrel: spread grows, then cools per tick.
    heat: {
      perShot: 0.22, // heat added per trigger pull (1.0 = fully hot)
      coolPerTick: 0.06, // heat decayed each 50 ms tick
      maxBloom: 0.075, // extra radians of spread at full heat
    },
    // -- Phase 4: streaks + medals (killfeed glory, zero gameplay effect) -----
    streakTiers: [3, 5, 8, 12], // streak_event fires crossing each (names in .md)
    // -- Phase 4: overtime + reconnect grace -----------------------------------
    overtimeSec: 60, // tdm tie at the horn → +60 s sudden-lead overtime, once
    reconnectGraceSec: 60, // dropped mid-match? same name re-seats within this
    // -- Phase 5: scrap economy (tokens, carry, stations) ----------------------
    scrap: {
      carryCap: 5, // max tokens held (extra pickups ignored until deposit)
      pickupRadius: 34, // walk-over collect distance (px)
      tokenTtlSec: 30, // uncollected tokens expire
      tokenCap: 40, // per-room token cap (oldest silently recycled past it)
      humanDropBonus: 1, // humans drop carried + bonus (bots drop 1–2)
    },
    // Junkyard arena (matches the Phase 1 gray-box: 1280×720 playfield).
    arena: {
      width: 1280,
      height: 720,
      minX: 40, // left wall
      maxX: 1240, // right wall
      groundY: 650, // floor line (feet rest here)
      ceilingY: 40, // top wall
      // Static platforms (feet can stand on top). Kept few + wide so the
      // axis-separated resolver stays trivially correct.
      platforms: [
        { x: 290, y: 500, w: 220, h: 18 },
        { x: 770, y: 500, w: 220, h: 18 },
        { x: 530, y: 350, w: 220, h: 18 },
      ],
    },
  },

  // -- Phase 2: party / matchmaking / room tuning --------------------------
  // All in-memory for now (no DB). Tune here, logic lives in
  // src/parties/, src/matchmaking/, src/rooms/.
  party: {
    maxSize: 4, // locked requirement: max 4 per party
    codeLength: 6, // e.g. "A7K9P2"
    // Unambiguous alphabet (no I/L/O/0/1) so codes read clearly on stream.
    codeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  },
  gameModes: {
    // ffa: up to 10 humans; we top up with bots to feel alive.
    // Phase 3: first to killLimit kills, else highest score at durationSec.
    ffa: { maxPlayers: 10, targetTotal: 6, minToStartNow: 2, soloWaitMs: 5000, killLimit: 10, durationSec: 180 },
    // tdm: 4v4 = 8 total, red vs blue. Need 4 humans to start instantly,
    // otherwise wait a bit then bot-fill to 8.
    // Phase 3: first team to scoreLimit, else higher score at durationSec.
    tdm: { maxPlayers: 8, teamSize: 4, minToStartNow: 4, soloWaitMs: 10000, scoreLimit: 25, durationSec: 240 },
    // bot_practice: always bots only, starts instantly, never groups strangers.
    // Phase 3: no winner — timed session, scoreboard for fun only.
    bot_practice: { maxPlayers: 4, targetTotal: 6, minToStartNow: 1, soloWaitMs: 0, durationSec: 180 },
    // scrap_collector (Phase 5): bank dropped scrap at deposit stations.
    // First to bankLimit banked, else most banked at durationSec. FFA-style.
    scrap_collector: { maxPlayers: 8, targetTotal: 6, minToStartNow: 2, soloWaitMs: 5000, bankLimit: 20, durationSec: 180 },
  },
  rooms: {
    countdownMs: 3000, // lobby → playing delay so Phaser can spawn everyone
    autoEndMs: 5 * 60 * 1000, // safety: end matches after 5 min (match_end)
    maxSpectators: 8, // Phase 5: observers per room (no hitbox, full feed)
    botNames: [
      'Rusty McScrapface',
      'Sir Mops-A-Lot',
      'Dust Bunny Prime',
      'Captain Clutter',
      'Mopzilla',
      'Scrapheap Steve',
      'Void Gremlin',
      'Bin Chicken',
      'Orbit Orphan',
      'Squeegee Supreme',
    ],
  },
};

export default config;
