/**
 * Astral Zero — ArenaScene (arena + camera + lobby entry + Phase 3 netplay).
 * ============================================================
 * Wires together the gray-box level, the player, input, the Arsenal-style
 * third-person camera, the match roster and the netcode. It is the only layer
 * that knows about all of them; Player, InputManager, ThirdPersonCamera,
 * RemoteActor, Combat and BotBrain all stay independently testable.
 *
 * CAMERA
 *  A ThirdPersonCamera: over-the-shoulder framing where the player is anchored
 *  off-centre, the framing leads toward the cursor, and a constant shoulder bias
 *  sells the "behind your shoulder" feel. There is no first-person path — the
 *  player sprite is always on screen. Crucially the camera reads the position
 *  AFTER prediction and reconciliation, so a correction is never seen as the
 *  camera lagging behind a nudge.
 *
 * THE NETCODE LOOP (Phase 3)
 *  The frame order in `_update` is load-bearing. In short: predict locally ->
 *  send input -> receive snapshots -> reconcile gently -> sample the world 100ms
 *  in the past -> interpolate remotes smoothly.
 *
 * MATCH SPAWNING
 *  When the lobby hands us a normalised room (from `room_joined`) we spawn the
 *  local player at OUR authoritative roster position, every OTHER human as a
 *  RemoteActor, and every bot as a tinted RemoteActor. With no room (e.g.
 *  `?skipLobby`) we fall back to the Phase 1 grey-box setup, so gameplay
 *  iteration never depends on the backend being up.
 */
import Phaser from 'phaser';
// `ARENA` is intentionally no longer imported: Phase 5 moved the layout into
// src/config/maps.js so each map can have its own geometry (the server picks the
// map; the client owns the collision).
import { SCENES, PLAYER, AIM, GAME_CONFIG } from '../config/gameConfig.js';
import { MATCH_MODES } from '../config/lobbyConfig.js';
import { Player } from '../entities/Player.js';
import { RemoteActor } from '../entities/RemoteActor.js';
import { BotBrain } from '../entities/BotBrain.js';
import { InputManager } from '../input/InputManager.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { ArenaHud } from '../ui/hud/ArenaHud.js';
import { CombatFx } from '../ui/fx/CombatFx.js';
import { Feedback } from '../ui/fx/Feedback.js';
import { KillFeed } from '../ui/hud/KillFeed.js';
import { Scoreboard } from '../ui/hud/Scoreboard.js';
import { Medals } from '../ui/hud/Medals.js';
import { MatchResults } from '../ui/hud/MatchResults.js';
import { Combat } from '../combat/Combat.js';
import { MatchStream } from '../net/MatchStream.js';
import { Prediction } from '../net/Prediction.js';
import { CAMERA_DEBUG } from '../config/cameraConfig.js';
import { NET_TICK, RECONCILIATION, COMBAT, HEALTH, NET_DEBUG } from '../config/netConfig.js';
import { weaponFor, DEFAULT_WEAPON, WEAPON_LIST } from '../config/weapons.js';
import { net } from '../net/NetworkManager.js';
import { NET_EVENTS } from '../net/events.js';
import { resolveLocalSpawn, normaliseRoom } from '../net/MatchModel.js';
// --- Phase 5 ---------------------------------------------------------------
import { mapFromWire } from '../config/maps.js';
import { WorldRenderer } from '../world/WorldRenderer.js';
import { AmbientFx } from '../ui/fx/AmbientFx.js';
import { AudioManager } from '../audio/AudioManager.js';
import { AUDIO } from '../config/audioConfig.js';
import { SpectatorCam } from '../camera/SpectatorCam.js';
import { MatchSummary } from '../ui/hud/MatchSummary.js';
import { SettingsMenu } from '../ui/menus/SettingsMenu.js';
import { settings } from '../core/Settings.js';


/** Horizontal speed (px/s) the fallback BotBrain walks at. */
const BOT_SPEED = 210;

export class ArenaScene extends Phaser.Scene {
  constructor() {
    super(SCENES.ARENA);
  }

  /** @returns {void} */
  create() {
    // Bind the shared network facade FIRST: the HUD and the socket handlers
    // below both read `this.net`, so it has to exist before them.
    this.net = net;
    this._offs = [];
    this._sentPositions = new Map();

    /** @type {import('../net/MatchStream.js').MatchStream} */
    this.stream = new MatchStream(this.net);
    this.stream.seedFromRoom(this.net.state.room);
    this.stream.start();

    /** @type {Prediction} Client-side prediction + soft reconciliation. */
    this.prediction = new Prediction();

    this.localId = this.net.state.localId;
    /** Server-reported kills/deaths, or {} until it tells us. */
    this.scores = {};
    this.teamScores = null;

    // Explicit physics bounds: the floor is a platform we collide with, and
    // these bounds stop the player wandering off the edges of the screen.
    this.physics.world.setBounds(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    // The server picks the map and sends its id; the client owns the geometry
    // (it is the only side that has collision). Resolved once, up front, so the
    // backdrop, platforms, ambience and spawn all agree on one layout.
    // Phase 5: the server ships the AUTHORITATIVE map in `room_joined.map`
    // (bounds, platforms, hazard + low-gravity zones, deposit stations). Until it
    // arrives we build nothing — previously the client kept its own layouts,
    // which is exactly the kind of guess that desyncs from the sim.
    this.world = new WorldRenderer(this);
    this.mapDef = mapFromWire(this.stream?.getMap?.() ?? null, this.net.state.room?.mapId);

    this._createBackdrop();
    this._buildWorldFromServer();
    this.ambient = new AmbientFx(this, {
      boundsWidth: GAME_CONFIG.width,
      boundsHeight: GAME_CONFIG.height,
    });
    this.ambient.create(this.mapDef);

    // --- Match roster, or the Phase 1 solo fallback ------------------------
    this.room = net.state.room ?? normaliseRoom({}, { localPlayerId: this.localId });

    this._createPlayer(this._resolveSpawn());
    this._spawnRemotes(this.room);

    // --- Combat + feedback -------------------------------------------------
    // `getTargets` hands Combat a live, flat view of everyone we may shoot,
    // read fresh each shot so it never caches a stale roster.
    this.combat = new Combat({
      getOrigin: () => ({
        x: this.player.x,
        y: this.player.y,
        angle: this.player.getAimAngle(),
      }),
      getTargets: () => this._combatTargets(),
      // Phase 4: the equipped weapon row drives range, fire rate, damage and
      // presentation. Defaults to the server's DEFAULT_WEAPON.
      weapon: weaponFor(DEFAULT_WEAPON),
    });

    /**
     * Phase 4: the weapon the HUD shows and the player can cycle. Kept separate
     * from `combat.weaponId` only in intent — both name a row in the same table,
     * and `setWeapon` keeps them in lockstep.
     * @type {object}
     */
    this.weapon = weaponFor(DEFAULT_WEAPON);

    /** Fallback AI — self-disables once the server drives bot positions. */
    this.brain = new BotBrain({
      getTargets: () => this._combatTargets(),
      selfId: this.localId,
    });

    this.fx = new CombatFx(this);

    // Reusable banner/pulse feedback for REAL events only (see Feedback.CUES).
    this.feedback = new Feedback(this, { x: 640, y: 176 });

    // --- Arsenal-style over-the-shoulder camera ---------------------------
    // Bounds match the arena rect exactly, which is what stops the camera
    // from ever showing empty space outside the level.
    this.cameraRig = new ThirdPersonCamera(this, {
      camera: this.cameras.main,
      worldBounds: { x: 0, y: 0, width: GAME_CONFIG.width, height: GAME_CONFIG.height },
    });
    // Frame the player correctly on the very first frame (no lerp-in pan).
    this.cameraRig.snapTo(this.player);

    // --- HUD (only when we actually have a match) -------------------------
    if (this.room.roomId) {
      this.hud = new ArenaHud(this, {
        room: this.room,
        net: this.net,
        onLeave: () => this._leaveMatch(),
      });
      this.killFeed = new KillFeed(this);
      this.scoreboard = new Scoreboard(this);
      // Phase 4: medal / streak banners, driven by the server's `streak_event`.
      this.medals = new Medals(this);
      this._bindScoreboardToggle();
      this._refreshScoreboard();
      // Seed the weapon readout so it is correct from frame one rather than
      // only after the first weapon switch.
      this.hud.setWeapon(this.weapon);
      this._bindWeaponSwitch();
    } else {
      this.hud = null;
      this.killFeed = null;
      this.scoreboard = null;
      this._createHudHint();
    }

    // Bind update last, so everything it touches already exists.
    this.events.on('update', this._update, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._shutdown());

    // Phase 5 systems are created BEFORE the network is bound: a `match_state`
    // or `entity_death` can arrive the instant we subscribe, and the handlers
    // want `this.audio` / `this.spectator` to already exist. Optional chaining
    // means a null is survivable, but constructing eagerly means those first
    // events are not silently muted.
    this._bindMenus();

    this._bindNetwork();
  }

  /**
   * Flat, live list of everything the local player may shoot at.
   *
   * Built fresh on each call so combat always sees the current roster and the
   * current positions — a cached array would let the player shoot at a corpse
   * that has already been removed from the match.
   *
   * Friendly fire is excluded in Bot Practice (the mode is explicitly "no
   * stakes"), which is enforced here rather than in Combat so the hit-detection
   * code stays mode-agnostic.
   *
   * @returns {Array<{id: string, x: number, y: number, hp: number, maxHp: number, alive: boolean, isBot: boolean, team: string|null}>}
   */
  _combatTargets() {
    const out = [];
    const friendly = MATCH_MODES[this.room.mode]?.friendly === true;

    for (const entity of [...this.room.players, ...this.room.bots]) {
      if (entity.id === this.localId || entity.socketId === this.localId) continue;
      const sample = this.stream.sample(entity.id);
      const actor = this.actors.get(entity.id);

      // A teammate is not a valid target in practice mode.
      if (friendly && entity.isBot === false && this._myTeam() === entity.team) continue;

      out.push({
        id: entity.id,
        x: sample?.x ?? actor?.sprite.x ?? entity.x,
        y: sample?.y ?? actor?.sprite.y ?? entity.y,
        hp: actor?.hp ?? entity.hp,
        maxHp: entity.maxHp,
        alive: actor ? actor.alive : true,
        isBot: entity.isBot,
        team: entity.team,
      });
    }

    return out;
  }

  /**
   * Our own team id in the current mode (null when there are no teams).
   * @returns {string|null}
   */
  _myTeam() {
    if (this.room.mode !== 'tdm') return null;
    const me = this.room.players.find((p) => p.id === this.localId || p.socketId === this.localId);
    return me?.team ?? null;
  }

  /**
   * Tab shows the scoreboard while held; tapping the hint opens it briefly.
   * @returns {void}
   */
  _bindScoreboardToggle() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this._offs.push(
      keyboard.on('keydown', (event) => {
        if (event.code !== 'Tab') return;
        // Tab would otherwise move browser focus out of the canvas.
        event.preventDefault?.();
        this.scoreboard.render({
          entities: [...this.room.players, ...this.room.bots],
          mode: this.room.mode,
          localId: this.localId,
          scores: this.scores,
        });
        this.scoreboard.show();
      }),
      keyboard.on('keyup', (event) => {
        if (event.code === 'Tab') this.scoreboard.hide();
      }),
    );
  }

  /**
   * Where the LOCAL player should spawn.
   *
   * The server puts us at an authoritative x/y inside `room_joined`, so use
   * that when it exists (it keeps every client in a consistent opening
   * position). With no room, fall back to the Phase 1 gray-box spawn column.
   * @returns {{x: number, y: number}}
   */
  _resolveSpawn() {
    if (this.room.roomId) {
      const spawn = resolveLocalSpawn(this.room);
      return { x: spawn.x, y: spawn.y };
    }
    return { x: this.mapDef.spawn.x, y: this.mapDef.spawn.y };
  }

  /**
   * Spawn every participant that is NOT us: other humans and every bot.
   *
   * Bot count comes straight from the server's roster, so Bot Practice always
   * shows exactly the bots the backend created for the room — no client-side
   * guessing about how many bots "should" exist.
   * @param {object} room
   * @returns {void}
   */
  _spawnRemotes(room) {
    const mode = room.mode;
    const localId = room.localPlayerId;

    for (const entity of room.players) {
      if (entity.id === localId || entity.socketId === localId) continue;
      this._addActor(entity, mode);
    }
    for (const entity of room.bots) {
      this._addActor(entity, mode);
    }
  }

  /**
   * @param {object} entity - Normalised entity.
   * @param {string} mode
   * @returns {RemoteActor}
   */
  _addActor(entity, mode) {
    // Re-adding an id (room_update after a join) reuses the existing actor
    // and just moves it, instead of stacking two sprites on one another.
    const existing = this.actors.get(entity.id);
    if (existing) {
      existing.setTarget(entity.x, entity.y);
      return existing;
    }
    const actor = new RemoteActor(this, entity, { mode });
    this.actors.set(entity.id, actor);
    return actor;
  }

  /**
   * Dark starfield backdrop so the player and platforms read clearly.
   * Cheap and purely cosmetic.
   * @returns {void}
   */
  _createBackdrop() {
    const { tint, starAlpha, parallax } = this.mapDef.ambience;
    this.add
      .rectangle(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2, GAME_CONFIG.width, GAME_CONFIG.height, tint)
      .setDepth(-10);

    // Deterministic scatter of "stars". Using a fixed seed keeps the layout
    // identical across reloads, which makes visual regressions obvious — and
    // it means the SAME map always looks the same, so a visual change is always
    // a code change. Star count scales with the map's parallax density so a
    // denser map reads as busier space.
    const rand = new Phaser.Math.RandomDataGenerator(['astral-zero']);
    const starCount = Math.round(90 * parallax);
    for (let i = 0; i < starCount; i += 1) {
      const size = rand.between(1, 3);
      this.add
        .rectangle(
          rand.between(0, GAME_CONFIG.width),
          rand.between(0, GAME_CONFIG.height),
          size,
          size,
          0xffffff,
          rand.realInRange(0.15, starAlpha),
        )
        .setDepth(-9);
    }
  }

  /** @type {Map<string, RemoteActor>} Remote humans + bots, keyed by id. */
  actors = new Map();

  /** @type {Array<() => void>} Socket unsubscribe handles. */
  _offs = [];
  /**
   * Build the playable world from the SERVER's map payload.
   *
   * Phase 5 made map geometry authoritative: platforms, hazard zones, low-gravity
   * volumes and deposit stations all arrive in `room_joined.map`. Collision here
   * must match the sim exactly, so nothing is computed locally.
   *
   * Safe to call before the map arrives — it simply builds nothing, and
   * `room_joined` calls it again. The physics bounds are derived from the
   * server's own `bounds` when present so the arena edge cannot disagree with it
   * either.
   *
   * @returns {void}
   */
  _buildWorldFromServer() {
    const wire = this.stream?.getMap?.() ?? null;
    this.mapDef = mapFromWire(wire, this.net.state.room?.mapId);
    this.world.build(this.mapDef);

    const b = this.mapDef.bounds;
    if (b) {
      this.physics.world.setBounds(b.minX, b.ceilingY, b.maxX - b.minX, b.groundY - b.ceilingY);
    }

    this.platforms = this.world._static.filter((o) => o.body);
  }

  /**
   * Spawns the player and the aim indicator, and hooks up collisions.
   *
   * @param {{x: number, y: number}} spawn - Authoritative spawn point (from
   *   the match roster when there is one, else the gray-box default).
   * @returns {void}
   */
  _createPlayer(spawn) {
    const x = spawn?.x ?? this.mapDef.spawn.x;
    const y = spawn?.y ?? this.mapDef.spawn.y;

    // Aim indicator: a small marker that orbits the player and rotates to
    // point at the cursor. In Phase 2 this becomes the actual weapon muzzle.
    this.muzzle = this.add
      .image(x, y, 'muzzle')
      .setOrigin(0, 0.5)
      .setDepth(PLAYER.depth + 1);

    this.player = new Player(this, x, y);
    this.player.attachMuzzle(this.muzzle);

    // Collide the player against the platforms (floor included).
    this.player.registerCollisions(this.platforms, this.physics);

    // Optional: press D in the browser console for physics body overlays.
    if (typeof window !== 'undefined' && window.location.search.includes('debug')) {
      this.physics.world.setDebugMode(true);
    }
  }

  /**
   * Temporary on-screen control reminder. This is deliberately minimal - the
   * real HUD/UI is a Phase 2 concern and will live in its own scene or UI
   * plugin so it never interferes with gameplay depth sorting.
   * @returns {void}
   */
  _createHudHint() {
    this.add
      .text(16, 14, 'A / D or ← →  move     SPACE / W / ↑  jump     mouse  aim     CLICK  shoot', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '15px',
        color: '#7fe7ff',
      })
      .setDepth(100)
      .setAlpha(0.85);

    // Netcode telemetry, `?debug` only. Reconciliation bugs are invisible by
    // feel — a 3px disagreement *should* be unnoticeable — so the counters are
    // the only practical way to tell "smoothly correcting" from "desynced".
    if (NET_DEBUG) {
      this.netDebugText = this.add
        .text(16, 36, '', {
          fontFamily: 'Consolas, ui-monospace, monospace',
          fontSize: '13px',
          color: '#ffd166',
        })
        .setDepth(100)
        .setAlpha(0.9);
    }
  }

  // =========================================================================
  // Phase 5: audio, menus, spectator
  // =========================================================================

  /**
   * Create the audio engine, spectator rig, settings menu and summary screen,
   * and bind the keys that open them.
   *
   * All of this is optional in the sense that a failure here must not take the
   * arena down: a missing AudioContext, a rejected storage read or a bad key
   * code degrades to "no extras", never to a crash mid-match.
   *
   * @returns {void}
   */
  _bindMenus() {
    // --- Audio -------------------------------------------------------------
    try {
      this.audio = new AudioManager({ config: AUDIO, settings });
    } catch (err) {
      console.warn('[Arena] audio unavailable; continuing silent.', err);
      this.audio = null;
    }

    // --- Spectator rig -----------------------------------------------------
    // Created up front (not on death) so the first spectated frame does not also
    // pay for construction.
    this.spectator = new SpectatorCam(this.cameras.main);

    // --- Summary + settings ------------------------------------------------
    this.summary = new MatchSummary(this, {
      onContinue: () => this._returnToLobby(),
    });
    this.settingsMenu = new SettingsMenu(this, {
      audio: this.audio,
      onClose: () => this.inputManager?.reset(),
    });

    this._bindMenuKeys();
    this._bindPageVisibility();
  }

  /**
   * Bind the pause/settings and scoreboard keys.
   * @returns {void}
   */
  _bindMenuKeys() {
    const kb = this.input.keyboard;
    if (!kb) return;

    // ESC toggles settings. `event.repeat` is filtered so holding the key does
    // not flicker the menu open and shut.
    kb.on('keydown-ESC', (event) => {
      if (event?.repeat) return;
      this.settingsMenu?.toggle();
    });

    // TAB is already the scoreboard; the Phase 2 harness expects TAB there, so
    // the scoreboard keeps TAB and settings use ESC alone to avoid a conflict.
  }

  /**
   * Track page visibility.
   *
   * A hidden tab must stop: sending input, animating ambience, scheduling audio
   * and running the spectator orbit. Browsers throttle background timers to
   * ~1Hz, so without this the client would still be doing work nobody sees and
   * would resume with a huge delta that lurches every animation.
   *
   * @returns {void}
   */
  _bindPageVisibility() {
    if (typeof document === 'undefined') return;
    this._pageHidden = false;
    this._onVisibility = () => {
      this._pageHidden = document.hidden;
      if (this._pageHidden) {
        this.audio?.suspendForBackground();
        this._fireHeld = false; // never resume holding the trigger
        this._firePressed = false;
      } else {
        this.audio?.resumeFromBackground();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  /**
   * Start/stop the looping low-health alarm to match the vignette.
   *
   * The vignette and the sound share ONE threshold so they can never disagree
   * (a pulsing red edge with no sound, or vice versa, reads as a bug).
   *
   * @returns {void}
   */
  _updateLowHealthAudio() {
    const alarm = this.player.dead ? false : this.player.hp / Math.max(1, HEALTH.defaultMax) <= COMBAT.lowHealthRatio;
    if (alarm && !this.audio?.isLooping('lowHealthPulse')) {
      this.audio?.play('lowHealthPulse');
    } else if (!alarm && this.audio?.isLooping('lowHealthPulse')) {
      this.audio?.stop('lowHealthPulse');
    }
  }

  /**
   * Shake the camera, honouring the accessibility setting.
   *
   * Screen shake is a genuine comfort issue for some players, so EVERY shake in
   * the game routes through here rather than calling `cameraRig.shake`
   * directly. One choke point means the setting cannot be bypassed by a new
   * call site later.
   *
   * @param {number|null} [angle] - Directional recoil, or null for a flat shake.
   * @param {number|null} [strength] - Recoil pixels.
   * @param {{ms:number, amount:number}} [opts] - Flat shake parameters.
   * @returns {void}
   */
  _shake(angle, strength, opts) {
    if (!settings.get('screenShake')) return;
    if (opts) this.cameraRig.shake(opts.ms, opts.amount);
    else if (angle !== null) this.cameraRig.recoil(angle, strength ?? 0);
  }

  /**
   * Enter the death camera: follow a living teammate if there is one, otherwise
   * orbit the spot we died.
   *
   * Teammates are matched by TEAM, not by "any other human": watching an enemy
   * would be worse than useless, and in a FFA there is no team at all, so it
   * correctly falls straight through to the orbit.
   *
   * @returns {void}
   */
  _enterSpectate() {
    const myTeam = this.room.teams?.red?.some((e) => e.id === this.localId) ? 'red'
      : this.room.teams?.blue?.some((e) => e.id === this.localId) ? 'blue'
      : null;

    const candidates = this.room.players.filter(
      (p) => p.id !== this.localId && (!myTeam || p.team === myTeam),
    );

    this.spectator.enter({ x: this.player.x, y: this.player.y }, candidates);
    this.audio?.stop('lowHealthPulse');
  }

  /** Hand the camera back to the main rig on respawn. @returns {void} */
  _exitSpectate() {
    this.spectator?.exit();
    this.cameraRig?.reset?.();
  }

  /**
   * Refresh the `?debug` netcode readout. Cheap string build, debug-only.
   * @returns {void}
   */
  _updateNetDebug() {
    if (!this.netDebugText || !this.prediction || !this.stream) return;
    const p = this.prediction.stats;
    const age = this.stream.snapshots.ageOf(this.localId, this.stream.now());
    const tracked = this.stream.snapshots.ids().length;
    this.netDebugText.setText(
      [
        `seq ${this._lastReconciledSeq}  snaps ${p.snaps}  soft ${p.corrections}  ignored ${p.ignored}`,
        `maxErr ${p.maxError.toFixed(1)}px  tracked ${tracked}  age ${Number.isFinite(age) ? Math.round(age) : '-'}ms`,
        `bots ${this.stream.isServerDriving() ? 'SERVER' : 'local AI'}`,
      ].join('\n'),
    );
  }

  /**
   * Per-frame game loop. The ORDER here is load-bearing, not cosmetic.
   *
   *   1. input        — gameplay must react to THIS frame, not the last one
   *   2. predict      — move the local player from that input (zero latency)
   *   3. correct      — apply any soft reconciliation nudge from the server
   *   4. camera       — reads the POST-move position, else it lags a frame
   *   5. remote       — sample the world, drive bots, move everyone else
   *   6. combat + HUD — feedback, then UI
   *
   * Step 3 must follow step 2 (there is nothing to correct yet otherwise) and
   * precede step 4 (the camera must frame the corrected position, or it lags
   * visibly behind every correction).
   *
   * @param {number} time - Total elapsed ms.
   * @param {number} delta - Frame delta in ms.
   * @returns {void}
   */
  _update(time, delta) {
    // (Re)create the input manager lazily so the keyboard plugin is ready.
    if (!this.inputManager) {
      this.inputManager = new InputManager(this, this.input.keyboard);
      this._bindFireInput();
    }

    const inMatch = Boolean(this.room.roomId);

    // --- Phase 5: settings menu freezes the match -------------------------
    // Return EARLY, before prediction, input send and camera. A player reading
    // their volume slider must not be shot while doing it, and must not keep
    // broadcasting intent for a match they are not looking at.
    if (this.settingsMenu?.visible) {
      this.hud?.update(time, delta);
      this.fx?.update();
      return;
    }

    // --- Phase 5: ambience + tab visibility --------------------------------
    // Frozen while the tab is hidden: a backgrounded tab must not keep creating
    // tween work for something nobody can see.
    this.ambient?.setActive(!this._pageHidden);
    if (!this._pageHidden) this.ambient?.update(delta);

    // 1. Refresh the intent snapshot for this frame.
    const intent = this.inputManager.update(delta);

    // 2. Client-side prediction: the local player moves the instant we input.
    if (!this.player.dead) this.player.update(time, delta, intent);

    // 3. Reconciliation: bend the prediction toward the server's truth.
    if (inMatch) this._applyReconciliation(delta);

    // 4. Arsenal-style over-the-shoulder camera, AFTER the player has moved.
    //    While dead the SPECTATOR rig owns the camera instead — only one rig may
    //    write setScroll per frame, so the main rig is skipped, not overridden.
    if (this.spectator?.mode) this.spectator.update(delta);
    else this.cameraRig.update(delta, this.player, intent);

    // 5. Remotes: interpolate from snapshots, or let BotBrain drive them.
    if (inMatch) this._updateRemotes(time, delta);

    // 5b. Respawn timer (only ever ticking while we are actually dead).
    if (inMatch) this._tickRespawn();

    // 5c. Low-health warning. Pulses between 0 and 1 on a fixed period so it
    // reads as an alarm rather than a steady tint, and is a no-op at full HP.
    if (inMatch) this._updateLowHealth(time);

    // 5c-bis. Phase 5: the low-health alarm is a LOOPING cue, so it must be
    // started when we cross the threshold and stopped the moment we recover —
    // including on death and on scene teardown, or it drones under everything.
    if (inMatch) this._updateLowHealthAudio();

    // 5d. Match clock. Derived from the server's room start (there is no
    // `match_time` event), so this is a display counter the server still overrules.
    if (inMatch) this._updateMatchClock();

    // 6. Combat feedback + HUD.
    if (inMatch) this._updateCombat();
    this.fx?.update();
    this.hud?.update(time, delta);
    this._updateNetDebug();

    if (inMatch) this._sendInput(time);

    if (CAMERA_DEBUG && typeof window !== 'undefined' && window.location.search.includes('debug')) {
      this.cameraRig.drawDebug(this, this.player);
    }
  }

// =========================================================================
  // Networking
  // =========================================================================

  /**
   * Minimum ms between input packets. The authoritative server sims at
   * `NET_TICK.simulationHz`, so sending faster is wasted bandwidth; we cap hard
   * because this is the only per-frame traffic we generate.
   */
  static MOVE_INTERVAL_MS = NET_TICK.minInputIntervalMs;

  /**
   * Send our input to the authoritative server, rate-limited.
   *
   * The payload deliberately carries BOTH the input intent (moveX / jump / aim
   * — what an authoritative server needs to simulate us) and our predicted
   * position (x / y). The latter is what lets reconciliation measure prediction
   * error instead of assuming we agree.
   *
   * @param {number} time - Total elapsed ms.
   * @returns {void}
   */
  _sendInput(time) {
    if (time - this._lastMoveSent < ArenaScene.MOVE_INTERVAL_MS) return;
    this._lastMoveSent = time;

    const intent = this.inputManager.intent;
    const seq = (this._moveSeq = (this._moveSeq ?? 0) + 1);

    this.net.socket.emit(NET_EVENTS.PLAYER_MOVE, {
      moveX: intent.moveX,
      jumpHeld: intent.jumpHeld,
      jumpPressed: intent.jumpPressed,
      aimX: Math.round(intent.aimX),
      aimY: Math.round(intent.aimY),
      seq,
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      vx: Math.round(this.player.body.velocity.x),
      vy: Math.round(this.player.body.velocity.y),
      timestamp: Date.now(),
    });

    // Remember where we believed we were for this input, so when the server
    // echoes the authoritative result we can measure the disagreement.
    this._sentPositions.set(seq, { x: this.player.x, y: this.player.y });

    // Bound the history: only recent inputs can still be in flight.
    if (this._sentPositions.size > RECONCILIATION.inputHistorySize) {
      this._sentPositions.delete(this._sentPositions.keys().next().value);
    }
  }

  /**
   * Reconcile our predicted position with the server's authoritative one.
   *
   * Runs every frame but only does real work when a NEW snapshot has landed
   * since the last call — otherwise the same error would be re-applied 60 times
   * a second and we would massively over-correct.
   *
   * @param {number} delta - Frame delta in ms.
   * @returns {void}
   */
  _applyReconciliation(delta) {
    // 1. Always bleed off any pending soft correction.
    const step = this.prediction.step(delta);
    if (step.x !== 0 || step.y !== 0) {
      this.player.setPosition(this.player.x + step.x, this.player.y + step.y);
    }

    // 2. Reconcile against a NEW authoritative sample only.
    const auth = this.stream.snapshots.latest(this.localId);
    if (!auth || auth.seq === this._lastReconciledSeq) return;
    this._lastReconciledSeq = auth.seq;

    // Compare against the position we PREDICTED at that input (not our live
    // position) — that is what keeps round-trip latency out of the error.
    const sent = this._sentPositions.get(auth.seq) ?? { x: this.player.x, y: this.player.y };
    const result = this.prediction.reconcile({ x: auth.x, y: auth.y, clientX: sent.x, clientY: sent.y });

    // A 'decay' result needs no action here: step() above applies it gradually.
    if (result.action === 'snap') {
      this.player.setPosition(auth.x, auth.y);
      this.prediction.reset();
    }
  }

  /**
   * Drive every remote actor: interpolate from snapshots, or let BotBrain take
   * over when the server is not providing positions.
   *
   * @param {number} time - Total elapsed ms.
   * @param {number} delta - Frame delta in ms.
   * @returns {void}
   */
  _updateRemotes(time, delta) {
    // When the server owns positions we sample straight from the buffer; when
    // it does not, BotBrain supplies them instead — and still writes them into
    // the same buffer, so nothing downstream can tell the difference.
    if (!this.stream.isServerDriving()) this._driveBotsLocally(time);

    for (const entity of [...this.room.players, ...this.room.bots]) {
      if (entity.id === this.localId || entity.socketId === this.localId) continue;
      const actor = this.actors.get(entity.id) ?? this._addActor(entity, this.room.mode);
      const sample = this.stream.sample(entity.id);
      if (sample) actor.applySample(sample);
      else actor.setTarget(entity.x, entity.y);
    }

    this.actors.forEach((actor) => actor.update(time, delta));
  }

  /**
   * Run the fallback AI and feed its output into the snapshot buffer.
   *
   * This is what makes bots actually move and shoot until the backend ships its
   * own AI. Writing into the same buffer the server would use keeps
   * interpolation, health bars and combat targeting consistent either way.
   *
   * @param {number} time - Total elapsed ms.
   * @returns {void}
   */
  _driveBotsLocally(time) {
    const intents = this.brain.thinkAll(time, (id, fallback) => this.stream.sample(id) ?? fallback);

    for (const bot of this.room.bots) {
      const actor = this.actors.get(bot.id);
      const intent = intents.get(bot.id);
      if (!actor || !intent) continue;

      const step = (NET_TICK.minInputIntervalMs / 1000) * BOT_SPEED;
      const x = Phaser.Math.Clamp(actor.sprite.x + intent.moveX * step, 40, GAME_CONFIG.width - 40);
      const y = actor.sprite.y;

      this.stream.snapshots.push({
        id: bot.id,
        time: this.stream.now(),
        x,
        y,
        vx: intent.moveX * BOT_SPEED,
        vy: 0,
        hp: actor.hp,
        maxHp: actor.maxHp,
        facing: intent.moveX >= 0 ? 1 : -1,
        alive: actor.alive,
      });

      if (intent.firing) {
        const ox = x + intent.moveX * 14;
        const endX = ox + Math.cos(intent.aimAngle) * COMBAT.range * 0.7;
        const endY = y + Math.sin(intent.aimAngle) * COMBAT.range * 0.7;
        this.fx?.tracer(ox, y, endX, endY, 0xff9f43);
      }
    }
  }

  /**
   * Fire the player's weapon and produce the resulting feedback.
   * @returns {void}
   */
  _updateCombat() {
    if (this.player.dead || !this._fireHeld) return;

    const angle = this.player.getAimAngle();
    const shot = this.combat.tryFire(this._fireHeld, this._firePressed);
    if (!shot.fired) return;
    this._firePressed = false;

    const weapon = this.weapon;
    const ox = this.player.x + Math.cos(angle) * AIM.muzzleLength;
    const oy = this.player.y + Math.sin(angle) * AIM.muzzleLength;

    // --- Phase 4 feel: flash + recoil BEFORE the tracer, so the frame the
    // player sees reads as "gun fired" rather than "line appeared".
    this.fx?.muzzleFlash(ox, oy, angle, weapon.flashScale);
    this._shake(angle, weapon.recoilPx);
    this.fx?.tracer(ox, oy, shot.endX, shot.endY, weapon.tracerColor);
    this.hud?.markShot(weapon.cooldownMs);
    this.audio?.play('weaponFire');

    // Tell the server what we did. DAMAGE IS RESOLVED THERE — this is intent.
    // `weaponId` must be a real server id: the server validates switches against
    // its own table and SILENTLY ignores unknown ids, so Phase 3's hard-coded
    // 'mop' meant the gun never actually switched.
    this.net.socket.emit(NET_EVENTS.PLAYER_SHOOT, {
      x: Math.round(ox),
      y: Math.round(oy),
      angle: Number(angle.toFixed(3)),
      weaponId: this.combat.weaponId,
      seq: this._moveSeq ?? 0,
      timestamp: Date.now(),
    });

    // Local PREDICTION only: feedback the server will confirm or ignore. Drawn
    // hollow so the player can tell it from a real hit.
    if (shot.hit) {
      const actor = this.actors.get(shot.hit.id);
      const { x: hx, y: hy } = shot.hit;
      const delay = shot.travelMs ?? 0;

      // Delay PREDICTED feedback by the projectile's flight time so the marker
      // lands WITH the round instead of a beat before it. At short range that
      // is ~0ms, so it still feels instant.
      const showPrediction = () => {
        if (this.player.dead) return;
        this.fx?.hitMarkerFlash(false);
        // Deliberately a different, quieter cue: the player should be able to
        // tell "maybe" from "yes" with their eyes off the screen.
        this.audio?.play('hitMarkerPredicted');
        this.fx?.damageNumber(hx, hy - 24, shot.damage, { color: '#9fb6cc' });
        if (actor) this.tweens.add({ targets: actor.sprite, alpha: 0.55, duration: 60, yoyo: true });
      };

      if (delay > 0) this.time.delayedCall(delay, showPrediction);
      else showPrediction();
    }
  }

  /**
   * Cycle to the next weapon in the table.
   *
   * The id is sent on the next shot (`player_shoot` carries `weaponId`), which
   * is where the server validates and applies it. We do not switch optimistically
   * on a separate event because that would need a new contract event for
   * something the existing shot path already carries.
   *
   * @returns {void}
   */
  cycleWeapon() {
    const index = WEAPON_LIST.indexOf(this.weapon.id);
    const next = weaponFor(WEAPON_LIST[(index + 1) % WEAPON_LIST.length]);
    this.setWeapon(next);
  }

  /**
   * Equip a weapon row, keeping Combat's prediction model in lockstep.
   * @param {object} weapon
   * @returns {void}
   */
  setWeapon(weapon) {
    this.weapon = weapon;
    this.combat.setWeapon(weapon);
    this.hud?.setWeapon(weapon);
    this.toasts?.info?.(`${weapon.name} equipped`);
  }

  /**
   * Bind the weapon-cycle key.
   *
   * Bound to the keyboard plugin rather than read per-frame, because a switch
   * should fire exactly once per press — polling `isDown` would cycle through
   * every weapon in a single key hold.
   *
   * @returns {void}
   */
  _bindWeaponSwitch() {
    const key = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    if (!key) return;
    this._offs.push(key.on('down', () => this.cycleWeapon()));
  }

  /**
   * Wire mouse fire into a pair of flags the update loop reads.
   *
   * Reading `pointer.isDown` every frame would also work, but Phaser exposes no
   * "just pressed" edge on the pointer itself, which the burst-fire rule needs.
   * @returns {void}
   */
  _bindFireInput() {
    const pointer = this.input.activePointer;
    if (!pointer) return;

    pointer.on('down', (p) => {
      if (p.rightButtonReleased()) return; // left button only
      this._fireHeld = true;
      this._firePressed = true;
    });
    pointer.on('up', () => {
      this._fireHeld = false;
    });

    // Losing focus mid-hold would otherwise leave the gun firing forever.
    this._offs.push(
      this.game.events.on(Phaser.Core.Events.BLUR, () => {
        this._fireHeld = false;
      }),
    );
  }

  /**
   * Local player died: hide the sprite, freeze input, run the respawn timer.
   *
   * Respawn TIMING is ours (it is a feel decision), but the respawn POSITION is
   * the server's — we only use the local fallback if the server never answers.
   * @returns {void}
   */
  _handleLocalDeath(respawnInMs = 0) {
    this.player.setDead(true);
    this.fx?.deathPoof(this.player.x, this.player.y);

    // The SERVER owns the respawn delay (it is what actually decides when we
    // come back). `HEALTH.respawnMs` is only a fallback for a malformed payload
    // — trusting a local constant over the server's value would desync the
    // countdown from the moment we actually reappear.
    const wait = Number.isFinite(respawnInMs) && respawnInMs > 0 ? respawnInMs : HEALTH.respawnMs;
    this.hud?.showDeathOverlay(wait);

    // Phase 5: switch to the spectator rig (teammate, or orbit the corpse).
    this._enterSpectate();

    this._respawnAt = this.time.now + wait;
  }

  /**
   * Local player respawned.
   * @param {number} x - Server x, when supplied.
   * @param {number} y - Server y, when supplied.
   * @param {number} [hp]
   * @param {number} [maxHp]
   * @returns {void}
   */
  _handleLocalRespawn(x, y, hp, maxHp) {
    // Fall back to our spawn only when the server gave no position.
    const spawn = Number.isFinite(x) && Number.isFinite(y)
      ? { x, y }
      : resolveLocalSpawn(this.room);

    this.player.setDead(false);
    this.player.hp = hp ?? HEALTH.defaultMax;
    this.player.setPosition(spawn.x, spawn.y);
    this.player.setAlpha(1);
    this.prediction.reset();
    this.hud?.setHealth(this.player.hp, maxHp ?? HEALTH.defaultMax);
    this.hud?.hideDeathOverlay();

    // Phase 5: hand the camera back to the over-the-shoulder rig. Skipping this
    // would leave the player being spectated by a camera that never lets go.
    this._exitSpectate();
    this.audio?.play('respawn');
  }

  /**
   * Tick the local respawn timer. Called from the update loop.
   * @returns {void}
   */
  _tickRespawn() {
    if (!this.player.dead || this._respawnAt === undefined) return;
    if (this.time.now < this._respawnAt) return;

    this._respawnAt = undefined;
    this._handleLocalRespawn(undefined, undefined, HEALTH.defaultMax, HEALTH.defaultMax);
  }

  /**
   * Anchor the match clock to the server's room start time.
   *
   * `room.createdAt` is server time, so the remaining duration is computed
   * against it rather than against our own "the scene just booted" moment —
   * otherwise a late join would start the clock at 5:00 instead of showing the
   * time actually left.
   *
   * @param {object} room - Normalised room.
   * @returns {void}
   */
  _startMatchClock(room) {
    const createdAt = Number(room?.raw?.createdAt ?? room?.createdAt);
    if (!Number.isFinite(createdAt)) return;
    // Convert the server's wall-clock ms to the same timeline our injected clock
    // uses, so `remainingMs(now)` is a subtraction of like with like.
    const skew = Date.now() - createdAt;
    this.stream._matchStartedAt = Date.now() - skew;
  }

  /**
   * Match clock tick. Only runs when we have an authoritative start time.
   * @returns {void}
   */
  _updateMatchClock() {
    const remaining = this.stream.remainingMs(Date.now());
    if (remaining !== null) this.hud?.setTimeRemaining(remaining);
  }

  /**
   * Low-health screen warning.
   *
   * Uses the SERVER-reported HP (`this.player.hp`, written by the
   * `player_health_update` handler) — never a local HP estimate, so the warning
   * cannot appear while we are actually invulnerable during spawn protection.
   *
   * @param {number} time - Total elapsed ms, for the pulse phase.
   * @returns {void}
   */
  _updateLowHealth(time) {
    if (this.player.dead) {
      this.fx?.setLowHealth(0);
      return;
    }

    const ratio = this.player.hp / Math.max(1, HEALTH.defaultMax);
    if (ratio > COMBAT.lowHealthRatio) {
      this.fx?.setLowHealth(0);
      return;
    }

    // Ramp from 0 at the threshold to full at 0 HP, then pulse. A flat
    // on/off blink at low HP is more distracting than a ramp that intensifies
    // as you get closer to dying.
    const severity = 1 - ratio / COMBAT.lowHealthRatio;
    const pulse = 0.65 + 0.35 * Math.sin((time / COMBAT.lowHealthPulseMs) * Math.PI * 2);
    this.fx?.setLowHealth(severity * pulse);
  }

  /**
   * Subscribe to the in-match events. Every handle goes into `_offs` and is
   * released in `_shutdown`, so re-entering the arena never double-binds.
   *
   * Note that world STATE (positions, health, kills) arrives via `this.stream`,
   * not the socket — MatchStream is the single ingest point. What binds here is
   * only the lobby/match LIFECYCLE, plus the discrete combat events we have
   * chosen to react to with feedback.
   * @returns {void}
   */
  _bindNetwork() {
    // Countdown → playing → gameover drives the centre banner.
    this._offs.push(
      this.net.on('match-state', ({ phase }) => {
        if (!phase) return;
        this.hud?.showPhase(phase);
        // Phase 5: a beep per countdown tick, and a brighter "GO" on start.
        // The countdown is the one moment the player is definitely listening,
        // so it is the best place for a sound cue to carry real information.
        if (phase === 'countdown') this.audio?.play('countdownBeep');
        else if (phase === 'playing') this.audio?.play('countdownGo');
      }),
    );

    // Roster delta (someone joined or left): re-sync every remote actor.
    this._offs.push(
      this.net.on('room', ({ room }) => {
        if (!room) return;
        this.room = room;
        const ids = new Set();
        for (const entity of [...room.players, ...room.bots]) {
          if (entity.id === this.localId) continue;
          ids.add(entity.id);
          this._addActor(entity, room.mode);
        }
        // Drop actors that are no longer in the roster.
        for (const [id, actor] of this.actors) {
          if (!ids.has(id)) {
            actor.destroy();
            this.actors.delete(id);
            this.stream.forget(id);
          }
        }
        this.hud?.updateRoster();
        this._refreshScoreboard();
      }),
    );

    // -- Combat + lifecycle, all normalised by MatchStream -------------------

    // A CONFIRMED hit: solid marker + the server's real damage number.
    this._offs.push(
      this.stream.on('hit', ({ isSelf, targetId, damage, x, y }) => {
        if (!isSelf) return;
        const actor = this.actors.get(targetId);
        const hx = x ?? actor?.sprite.x ?? this.player.x;
        const hy = y ?? actor?.sprite.y ?? this.player.y;
        // A kill is confirmed by the server's own death event, not inferred
        // from `alive` here — this ordering is more reliable than a stale flag.
        const fatal = actor ? !actor.alive : false;
        this.fx?.hitMarkerFlash(true, fatal);
        this.audio?.play('hitMarker');
        if (damage > 0) {
          this.fx?.damageNumber(hx, hy - 24, damage, { color: '#ffffff', crit: damage > 30 });
        }
      }),
    );

    // Health: local → HUD + damage-taken feedback; remote → the actor's own bar.
    this._offs.push(
      this.stream.on('health', ({ id, hp, maxHp, isSelf, damage }) => {
        if (isSelf) {
          this.player.hp = hp;
          this.hud?.setHealth(hp, maxHp);
          // `damage` is the real delta, so we only flash when we actually took
          // a hit — a respawn heal must not look like being shot.
          if (damage > 0) {
            this.fx?.damageFlash();
            this._shake(null, null, { ms: COMBAT.hurtShakeMs, amount: COMBAT.hurtShakeAmount });
            this.hud?.pulseDamage();
            this.feedback?.show('damageTaken', { sub: `-${Math.round(damage)} hp` });
          }
          return;
        }
        this.actors.get(id)?.setHp(hp, maxHp);
      }),
    );

    // Death. `entity_death` is the ONLY death event the server sends, and it
    // doubles as the killfeed row — so both effects are driven from here and
    // can never disagree about who died.
    this._offs.push(
      this.stream.on('death', ({ id, isSelf, killerId, killerName, victimName, killerIsBot, cause, x, y, respawnInMs }) => {
        const actor = this.actors.get(id);
        if (actor) {
          actor.die();
          this.fx?.deathPoof(x ?? actor.sprite.x, y ?? actor.sprite.y);
        }
        if (isSelf) {
          this._shake(null, null, { ms: COMBAT.deathShakeMs, amount: COMBAT.deathShakeAmount });
          this.audio?.play('death');
          this._handleLocalDeath(respawnInMs);
        } else if (killerId === this.localId) {
          // WE got them. A distinct confirmation (red X + flare) so a kill
          // never reads like a body shot in a spray of fire.
          this.fx?.killConfirm();
          this.audio?.play('killConfirm');
          this.feedback?.show('debrisCleared', {
            sub: victimName ? `cleared ${victimName}` : undefined,
          });
        }

        // Kill feed row. Uncredited deaths (no killer) are skipped rather than
        // rendered as "— › name", which reads like a bug.
        if (killerName) {
          this.killFeed.push({
            killerName,
            victimName: victimName ?? 'Unknown janitor',
            isSelfKill: killerId === this.localId,
            isSelfDeath: Boolean(isSelf),
            killerIsBot,
            cause,
          });
        }
      }),
    );

    // Respawn: the server owns WHERE we come back.
    this._offs.push(
      this.stream.on('spawn', ({ id, x, y, hp, maxHp, isSelf }) => {
        if (isSelf) this._handleLocalRespawn(x, y, hp, maxHp);
        else this.actors.get(id)?.respawn(x, y, hp);
      }),
    );

    // Bot deaths arriving without a roster entry.
    this._offs.push(
      this.stream.on('entity-death', ({ id }) => {
        const actor = this.actors.get(id);
        if (!actor) return;
        actor.die();
        this.fx?.deathPoof(actor.sprite.x, actor.sprite.y);
      }),
    );

    // Phase 5: scrap tokens ride every snapshot in full (static pickups, no
    // interpolation). Reconciled by id so a bobbing token does not jitter.
    this._offs.push(
      this.stream.on('snapshot', ({ tokens }) => this.world?.syncTokens(tokens ?? [])),
    );

    // Our own satchel count rides the snapshot (`entities[].carried`). Read it
    // from the authoritative stream rather than counting pickup events locally:
    // events can be missed on a reconnect, and a counter that resets is worse
    // than one that is briefly stale.
    this._offs.push(
      this.stream.on('snapshot', () => {
        const me = this.stream.snapshots.latest(this.localId);
        if (me && Number.isFinite(Number(me.carried))) {
          this.hud?.setScrap(Number(me.carried));
        }
      }),
    );

    // Carried scrap counter + pickup/deposit feedback.
    this._offs.push(
      this.stream.on('scrap', ({ kind, amount, total, isSelf }) => {
        if (isSelf && (kind === 'pickup' || kind === 'deposit')) {
          this.audio?.play(kind === 'pickup' ? 'uiClick' : 'respawn', { bus: 'ui' });
        }
        this.hud?.setScrap(kind === 'deposit' ? 0 : total, kind === 'deposit' ? total : null);
      }),
    );

    // Medals / streak popups (Phase 4). The server decides when a tier is
    // crossed; we only present it.
    this._offs.push(
      this.stream.on('streak', ({ text, kind, isSelf }) => {
        this.medals?.show(text, kind, { isSelf });
        // Only our own medals get audio: a busy room emits streaks constantly
        // and a chime for every opponent one would be noise, not feedback.
        // Medals are awarded authoritatively in `match_end`; this counter only
        // existed to feed the old local XP maths, which is gone.
        if (isSelf) {
          this.audio?.play('medal');
          this.feedback?.show('combo', { text: text ? 'COMBO' : 'STREAK' });
        }
      }),
    );

    // Scoreboard data (server-authoritative; never invented locally).
    this._offs.push(
      this.stream.on('score', ({ scores, teams, overtime }) => {
        if (scores) this.scores = scores;
        if (teams) {
          this.teamScores = teams;
          this.hud?.setTeamScores(teams);
        }
        if (overtime) this.hud?.setOvertime(true);
        this._refreshScoreboard();
      }),
    );

    // Reconnect (Phase 4): a dropped socket is recoverable, so the HUD says so
    // instead of leaving a frozen arena with no explanation.
    this._offs.push(
      this.net.on('connection', ({ connection }) => {
        this.hud?.setReconnecting(
          connection !== 'online' && Boolean(this.net.state.room),
          'Reconnecting to match…',
        );
      }),
      this.net.on('reconnected', () => this.hud?.setReconnecting(false)),
    );

    // Match clock. The server has no `match_time` event, so the stream derives
    // the remaining time from the authoritative `room.createdAt`. Ticked here
    // rather than per-event because a clock that only updates on a push would
    // visibly stutter.
    this._offs.push(
      this.net.on('match-ready', ({ room }) => {
        this._startMatchClock(room);
        // Phase 5: the authoritative map arrives with the manifest. Rebuilding
        // here (rather than in create) is what makes a LATE JOIN correct — the
        // scene was constructed before the server had told us anything.
        this._buildWorldFromServer();
      }),
    );

    // Match over: show the results screen, THEN return to the lobby.
    this._offs.push(
      this.net.on('match-ended', (result) => {
        // Nothing should still be looping once the match is over.
        this.audio?.stopAll();
        this.summary?.show(this._buildSummary(result), this.localId);
      }),
    );
  }

  /**
   * Turn a `match_end` payload into everything the summary screen needs.
   *
   * The standings and the win/loss verdict are the SERVER's. The XP breakdown
   * is derived locally from those same numbers (the 1.3/1.4 contract has no XP
   * field) and committed to localStorage — see game/Progression.js for why that
   * is safe.
   *
   * @param {object} result
   * @returns {object}
   */
  /**
   * Forward the `match_end` payload to the summary screen.
   *
   * There is deliberately NO local XP calculation left. Phase 5 made progression
   * authoritative: the payload already carries per-player `xp`, `level`,
   * `medals`, `accuracy`, `bestStreak`, an `mvp` and a `telemetry` block, and
   * the summary renders those values verbatim. See game/Progression.js.
   *
   * @param {object} result - The `match_end` payload, unaltered.
   * @returns {void}
   */
  _buildSummary(result = {}) {
    return result;
  }

  /**
   * Leave the arena for the lobby from the summary screen.
   *
   * The match is already over server-side, so this only tears down locally —
   * there is deliberately no `room_leave` here, because the server has already
   * destroyed the room and a voluntary leave would be a confusing no-op.
   *
   * @returns {void}
   */
  _returnToLobby() {
    this.summary?.hide();
    this.scene.start(SCENES.LOBBY);
  }

  /**
   * Rebuild the scoreboard from the current roster + the last scores we were
   * told. Cheap, and only runs when something actually changed.
   * @returns {void}
   */
  _refreshScoreboard() {
    if (!this.scoreboard) return;
    this.scoreboard.render({
      entities: [...this.room.players, ...this.room.bots],
      mode: this.room.mode,
      localId: this.localId,
      scores: this.scores,
    });
  }

  /**
   * Voluntary exit: tell the server we left the room, then return to the
   * lobby. The server answers with `match_end`, which also triggers the
   * `match-ended` handler above — doing both would double-start the scene,
   * so we simply let the server drive the transition.
   * @returns {void}
   */
  _leaveMatch() {
    this.net.leaveRoom();
    // Safety net: if the server is unreachable, still get out of the arena.
    this.time.delayedCall(1200, () => {
      if (this.scene.isActive() && !this.net.state.room) this.scene.start(SCENES.LOBBY);
    });
  }

  /**
   * Release everything this scene owns. Called on SHUTDOWN.
   * @returns {void}
   */
  _shutdown() {
    this.events.off('update', this._update, this);
    this.inputManager?.reset();

    // Order matters: stop consuming world events BEFORE dropping the buffers,
    // or a late snapshot could repopulate state we are tearing down.
    this.stream?.stop();
    this._offs.forEach((off) => off());
    this._offs = [];

    this.actors.forEach((actor) => actor.destroy());
    this.actors.clear();

    // --- Phase 5 teardown -------------------------------------------------
    // Order matters: audio FIRST (it owns intervals and a live AudioContext),
    // then the document listener, then the rest. A looping cue that survives a
    // scene change keeps its setInterval alive across the whole next match, and
    // a leaked visibilitychange listener accumulates one handler per scene
    // start until the page is reloaded.
    this.audio?.stopAll();
    this.audio?.destroy();
    this.audio = null;

    if (this._onVisibility && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibility);
      this._onVisibility = null;
    }

    this.ambient?.destroy();
    this.ambient = null;
    this.spectator?.exit();
    this.settingsMenu?.destroy();
    this.settingsMenu = null;
    this.summary?.destroy();
    this.summary = null;
    this.medals?.destroy();
    this.medals = null;

    this.fx?.destroy();
    this.fx = null;
    this.killFeed?.destroy();
    this.killFeed = null;
    this.scoreboard?.destroy();
    this.scoreboard = null;
    this.results?.destroy();
    this.results = null;
    this.feedback?.destroy();
    this.feedback = null;
    this.hud?.destroy();
    this.hud = null;
  }
}

export default ArenaScene;