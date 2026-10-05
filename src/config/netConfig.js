/**
 * Astral Zero — netcode configuration (FRONTEND, Phase 3).
 * ============================================================
 * Every number that governs how the client talks to the authoritative
 * simulation lives here, so netplay can be re-tuned without touching logic.
 *
 * THE THREE RATES (the heart of netplay)
 *   1. SIMULATION  — the server runs its physics at `simulationHz` and
 *      broadcasts a snapshot. This is the single source of truth.
 *   2. INPUT       — we send our intent at `inputSendHz`, tagged with a
 *      monotonic `seq`. The server echoes back the last `seq` it consumed so
 *      we can reconcile our prediction against its truth.
 *   3. RENDER      — we draw remote entities at `now - interpolationDelayMs`.
 *      That deliberate ~100 ms in the past is what lets us interpolate
 *      smoothly instead of teleporting between 10 Hz snapshots.
 *
 * WHY 100 ms? It must exceed the worst-case one-way snapshot latency. Too
 * small and we run out of future data and have to guess (stutter); too large
 * and aiming at other players feels laggy. 100 ms is the industry-standard
 * compromise for a 10-20 Hz snapshot stream on a LAN/Cable connection.
 */

export const NET_TICK = Object.freeze({
  /** Server simulation / snapshot broadcast rate (Hz). */
  simulationHz: 15,
  /** How often we SEND input. Higher = more responsive, more bandwidth. */
  inputSendHz: 60,
  /** Hard cap on how often we emit, independent of frame rate. */
  minInputIntervalMs: 15,

  /**
   * Render remote entities this far in the PAST so we can always interpolate
   * between two known samples instead of extrapolating into the unknown.
   */
  interpolationDelayMs: 100,

  /** Snapshot samples retained per entity (ring buffer size). */
  historySize: 24,

  /**
   * How long we may extrapolate past the newest sample using velocity before
   * giving up and freezing the entity. Prevents a disconnected peer from
   * flying off to infinity.
   */
  maxExtrapolationMs: 220,

  /**
   * No snapshot for this long => the entity is considered stale. Stale remote
   * entities freeze and dim rather than sliding on stale data.
   */
  staleAfterMs: 900,

  /**
   * No bot_update for this long => the server has no AI running, so the client
   * engages `BotBrain` to keep practice mode playable. The moment the server
   * starts sending bot positions again this automatically disables itself.
   */
  serverSilentMs: 1200,
});

/**
 * Client-side prediction & reconciliation.
 *
 * We run the local player through Phaser physics immediately (zero input
 * latency), then gently bend that prediction toward the server's authoritative
 * position. The goal is that a correction is *imperceptible* unless the player
 * genuinely desynced (teleport, respawn, rubber-band on their own).
 */
export const RECONCILIATION = Object.freeze({
  /**
   * Error (in px) we silently ignore. Covers float/rounding drift and one or
   * two pixels of physics disagreement — correcting these would cause visible
   * micro-jitter for no benefit.
   */
  positionTolerance: 2.5,

  /**
   * Beyond this error the server is genuinely elsewhere (teleport / respawn /
 * * heavy lag). Snap instantly and accept the visual pop: a smooth catch-up
   * over 200 px looks far worse than an honest teleport.
   */
  snapThreshold: 140,

  /**
   * Soft corrections decay exponentially. `correctionDecay` is the fraction of
   * the remaining error consumed per second — higher converges faster.
   */
  correctionDecay: 14,

  /**
   * Ceiling on how fast a soft correction may move us, in px/s. Stops the
   * camera from being yanked when a moderate error resolves.
   */
  maxCorrectionSpeed: 620,

  /** Inputs retained for potential replay/diagnostics. */
  inputHistorySize: 128,
});

/**
 * Combat feel. Damage is authoritative from the server; these values only
 * drive the client's *feedback* (markers, numbers, cooldowns) and its local
 * hit prediction so a shot feels instant.
 */
export const COMBAT = Object.freeze({
  /** Seconds between shots. */
  fireCooldown: 0.16,
  /** Simultaneous shots allowed per trigger pull (feels better on fast mouse). */
  maxShotsPerPull: 3,
  /** Muzzle tracer lifetime (ms). */
  tracerMs: 90,
  /** A predicted (not yet confirmed) hit shows a hollow marker. */
  predictedHitColor: 0x9fb6cc,
  /** A server-confirmed hit shows a solid marker. */
  confirmedHitColor: 0xffffff,
  /** Damage number rises this many px over its lifetime. */
  damageRisePx: 42,
  /** Damage number lifetime (ms). */
  damageNumberMs: 780,
  /** Hitscan range in px. */
  range: 900,
  /** Width of the hitscan "bullet" corridor — generous, for feel. */
  hitscanWidth: 26,
  /**
   * Upper bound on how long we will delay PREDICTED feedback for projectile
   * travel. A shot across the whole arena is ~700ms; without a cap a slow
   * weapon at long range would defer its hitmarker so far that the player
   * thinks the gun ate, which feels worse than a slightly-early marker.
   */
  maxPredictedTravelMs: 260,

  // --- Phase 4: tracer + muzzle presentation -------------------------------
  /** Base tracer tint; weapons may override (mortar = amber, rail = cyan). */
  tracerColor: 0xffd166,
  /** Bright core line width (px). */
  tracerWidth: 2,
  /** Wide additive glow behind the core (px). */
  tracerGlowWidth: 7,
  /** Fraction of the path drawn as the bright leading streak (0-1). */
  tracerStreak: 0.34,
  /** Muzzle flash spike length (px) at scale 1. */
  muzzleFlashLength: 13,
  /** Muzzle flash lifetime (ms) — must be short or it looks like a bug. */
  muzzleFlashMs: 70,
  /** Muzzle flash tint. */
  muzzleFlashColor: 0xffe9a8,

  // --- Phase 5: object pools -----------------------------------------------
  /**
   * Tracer budget. Sized against the worst case we can actually produce: 3
   * shots per trigger pull at ~160ms, a ~90ms tracer life, and up to ~8
   * shooters in view. Generous headroom, but still a hard bound — a pool that
   * grows on demand would trade GC pauses for unbounded memory and draw calls.
   */
  tracerPoolSize: 48,
  /**
   * Damage-number budget. A mag dump can land several numbers a second, and
   * they are long-lived (780ms), so this needs more headroom than tracers.
   */
  damageNumberPoolSize: 24,

  // --- Phase 4: hit marker -------------------------------------------------
  /** Confirmed-hit marker lifetime (ms). */
  hitMarkerMs: 150,
  /** Kill marker lifetime (ms) — held longer so it registers as an event. */
  killMarkerMs: 340,
  /** Inner radius of the hit-marker cross (px). */
  hitMarkerInner: 7,
  /** Outer radius of the hit-marker cross (px). */
  hitMarkerOuter: 12,
  /** Extra outward "kick" applied to the marker as it pops (px). */
  hitMarkerPunch: 3,

  // --- Phase 4: recoil + camera feedback -----------------------------------
  /**
   * Camera recoil per shot (px). Deliberately small: the camera follows the
   * player, so a large kick would slide the whole world and induce motion
   * sickness rather than "power".
   */
  recoilPx: 7,
  /** Camera shake when WE take damage (ms, intensity). */
  hurtShakeMs: 180,
  hurtShakeAmount: 0.005,
  /** Camera shake when WE die (ms, intensity). */
  deathShakeMs: 380,
  deathShakeAmount: 0.012,
  /** Screen-edge vignette intensity at full health (0 = none). */
  lowHealthVignette: 0.55,
  /** HP fraction at or below which the low-health warning starts. */
  lowHealthRatio: 0.3,
  /** Pulse period of the low-health warning (ms). */
  lowHealthPulseMs: 900,
});

/**
 * Health, death and respawn.
 */
export const HEALTH = Object.freeze({
  defaultMax: 100,
  /** Respawn delay (ms) shown on the death overlay. */
  respawnMs: 2600,
  /** Fade-in of the player after respawning (ms). */
  respawnFadeMs: 320,
  /** Name-tag health bar geometry, in world px. */
  barWidth: 46,
  barHeight: 5,
  /** Distance above the sprite centre where the bar sits. */
  barOffsetY: -40,
});

/**
 * Match UI: scoreboard, kill feed, timer.
 */
export const MATCH_UI = Object.freeze({
  /** Hold Tab to peek the scoreboard. */
  scoreboardHoldKey: 'TAB',
  /** How long a kill-feed row stays on screen (ms). */
  killFeedRowMs: 5200,
  /** Max simultaneous kill-feed rows. */
  killFeedRows: 5,
  /** Scoreboard auto-hides after this long if opened by tapping. */
  scoreboardAutoHideMs: 4000,
  /** Countdown warning thresholds (ms remaining). */
  timerUrgentMs: 30000,
});

/**
 * Medal / streak banners (Phase 4).
 *
 * Tiers are announced by the SERVER (`streak_event`); these values only control
 * how the banner looks and how long it holds. Timing is tuned so your own medal
 * is unmissable and other players' medals are glanceable.
 */
export const MEDALS = Object.freeze({
  /** Font size for the first blood banner — the biggest, it happens once. */
  firstBloodPx: 34,
  /** Your own streak medal. */
  selfPx: 28,
  /** Someone else's streak medal — present, never shouty. */
  otherPx: 20,
  /** First blood is gold so it is instantly distinct from a streak. */
  firstBloodColor: '#ffd166',
  /** How long the banner sits at full opacity (ms). */
  firstBloodHoldMs: 2200,
  selfHoldMs: 1700,
  otherHoldMs: 1100,
  /** Punch-in duration (ms). */
  enterMs: 260,
  /** Fade-out duration (ms). */
  exitMs: 420,
  /** How far the banner drifts upward as it fades (px). */
  risePx: 26,
  /** Vertical spacing between simultaneously visible banners (px). */
  slotHeight: 40,
  /** Cap on stacked banners — a 12-kill spree must not paper over the screen. */
  maxVisible: 3,
});

/**
 * Scrap economy (Phase 5, `scrap_collector` mode).
 */
export const SCRAP = Object.freeze({
  /**
   * Mirrors the server's `gameModes.scrap_collector.carryCap`. The server
   * IGNORES pickups once a player is carrying this many, so the HUD must not
   * promise a higher number — a "5/5" that never moves looks like a bug.
   */
  carryCap: 5,
});

/**
 * Spectator / death cam (Phase 5).
 *
 * Tuned so following a teammate is calm enough to actually watch, and so the
 * orbit reads as a deliberate camera move rather than a spinning loss screen.
 */
export const SPECTATOR = Object.freeze({
  /** Per-frame easing factor (60fps-normalised), matching the main rig. */
  smoothing: 0.12,
  /** Zoom while following a teammate — pulled back to see more of the fight. */
  followZoom: 1.05,
  /** Zoom while orbiting the death point. */
  orbitZoom: 0.9,
  /** Horizontal orbit radius (px). Wider than vertical so the path reads as a
   *  gentle drift around the arena rather than a circle drawn on the floor. */
  orbitRadius: 190,
  orbitRadiusY: 70,
  /** Radians per second around the death point. Slow on purpose. */
  orbitSpeed: 0.32,
  /** How often a living teammate is auto-picked on death (ms). 0 = only on
   *  demand, so the first frame is not fighting a re-target loop. */
  autoFollowMs: 0,
});

/**
 * Netcode debug overlay (`?debug`).
 *
 * Reconciliation faults are deliberately invisible by feel — a 3px correction
 * *should* feel like nothing. That makes them very hard to notice in play, so
 * this flag surfaces the prediction counters on screen for anyone debugging
 * desync. Driven by the `?debug` query param, never by a build flag, so it can
 * be turned on against a production bundle without a rebuild.
 */
export const NET_DEBUG =
  typeof window !== 'undefined' && window.location.search.includes('debug');

export default NET_TICK;