/**
 * Astral Zero — MatchStream (FRONTEND).
 * ============================================================
 * The ONE place server world-state enters the client.
 *
 * WHY A SINGLE INGEST POINT
 * Phase 2 already had several paths for entity data (`room_joined` roster,
 * `player_move` relay, `bot_update`). Adding authoritative snapshots, health,
 * damage and kills would multiply that into a dozen interleaved listeners,
 * each needing to know how the others behave. Instead, EVERY world event lands
 * here, is normalised into one shape, is written into the SnapshotBuffer, and
 * is re-emitted as a single semantic event. Scenes and entities subscribe to
 * MatchStream; they never touch the socket.
 *
 * AUTHORITATIVE-FIRST, DEGRADED GRACEFULLY
 * The Phase 3 backend is being built alongside this client, so this module is
 * written to work with whatever the server actually supports:
 *
 *   - `entity_snapshot` (the real deal: every entity, every tick) → full
 *     authoritative rendering and reconciliation.
 *   - `bot_update` (Phase 2 contract, server-side AI) → bots interpolate.
 *   - `player_move` (Phase 2 contract, client-relayed humans) → remotes
 *     interpolate from relayed positions.
 *
 * If the server sends nothing for `serverSilentMs`, `isServerDriving()` goes
 * false and `BotBrain` takes over locally, so Bot Practice is playable today
 * and gets better automatically when the AI ships. No flags, no branching in
 * the scene — it just asks MatchStream what is driving.
 *
 * ALL TIMES ARE LOCAL (`performance.now()`), never server `Date.now()`. The two
 * clocks have arbitrary offset, so comparing them directly would produce
 * garbage. Arrival time is the only clock we can trust on our own machine.
 */

import { Emitter } from '../core/Emitter.js';
import { NET_EVENTS } from './events.js';
import { SnapshotBuffer } from './SnapshotBuffer.js';
import { NET_TICK } from '../config/netConfig.js';

/**
 * Display duration of a match (ms).
 *
 * Mirrors the server's `rooms.autoEndMs` (5 min) so the HUD clock and the
 * server's auto-end land at the same moment. It is a DISPLAY value only: the
 * server decides when a match really ends (score limit, time limit, overtime),
 * and `match_end` is always the authority. If the two ever disagree, the server
 * wins and the clock is simply stopped.
 */
const MATCH_DURATION_MS = 5 * 60 * 1000;

/**
 * Reduce any of the accepted snapshot payload shapes into one entity record.
 * Field aliases are generous on purpose: the Phase 3 backend is still being
 * finalised, and a client that hard-codes one exact shape would need a patch
 * release the moment a name differs.
 *
 * @param {object} raw
 * @param {boolean} [fallbackIsBot]
 * @returns {object|null}
 */
function toEntity(raw, fallbackIsBot = false) {
  if (!raw) return null;
  const id = raw.id ?? raw.botId ?? raw.socketId ?? raw.entityId;
  if (!id) return null;

  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // `facing` may arrive as a sign, a boolean, or an angle. Normalise to a
  // horizontal sign, which is all the sprite flip needs.
  const rawFacing = raw.facing ?? raw.dir ?? raw.face;
  const facing =
    typeof rawFacing === 'boolean'
      ? rawFacing
        ? 1
        : -1
      : Number.isFinite(rawFacing)
        ? rawFacing >= 0
          ? 1
          : -1
        : 1;

  return {
    id: String(id),
    name: raw.name ?? null,
    isBot: Boolean(raw.isBot ?? raw.botType ?? fallbackIsBot),
    team: raw.team ?? null,
    x,
    y,
    vx: Number.isFinite(Number(raw.vx)) ? Number(raw.vx) : 0,
    vy: Number.isFinite(Number(raw.vy)) ? Number(raw.vy) : 0,
    hp: Number.isFinite(Number(raw.hp)) ? Number(raw.hp) : 100,
    maxHp: Number.isFinite(Number(raw.maxHp)) ? Number(raw.maxHp) : 100,
    facing,
    alive: raw.alive ?? (Number.isFinite(Number(raw.hp)) ? Number(raw.hp) > 0 : true),
    seq: Number.isFinite(Number(raw.seq)) ? Number(raw.seq) : 0,
  };
}

/**
 * Extract the entity array from any accepted snapshot envelope.
 *
 * Handles three shapes, because the contract has all three:
 *   - an ARRAY of entities              (`bot_update`, `entity_snapshot`)
 *   - an object with `entities/bots/players`  (`entity_snapshot`)
 *   - a SINGLE bare entity              (`player_move`, `bot_spawn`)
 *
 * The single-entity case is the easy one to miss: `player_move` is one
 * player's position per packet, so treating it as a roster would silently
 * drop every relayed remote player.
 *
 * @param {object} payload
 * @param {boolean} fallbackIsBot
 * @returns {object[]}
 */
function extractEntities(payload, fallbackIsBot = false) {
  if (!payload) return [];

  // Single bare entity: has coordinates and an id but is not a container.
  if (!Array.isArray(payload) && Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y))) {
    const single = toEntity(payload, fallbackIsBot);
    return single ? [single] : [];
  }

  const list =
    payload.entities ?? payload.bots ?? payload.players ?? (Array.isArray(payload) ? payload : null);
  if (!Array.isArray(list)) return [];
  return list.map((e) => toEntity(e, fallbackIsBot)).filter(Boolean);
}
export class MatchStream extends Emitter {
  /**
   * @param {import('./NetworkManager.js').NetworkManager} net
   * @param {object} [opts]
   * @param {() => number} [opts.now] - Injectable clock (makes tests
   *   deterministic; defaults to performance.now()).
   */
  constructor(net, { now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
    super();
    this.net = net;
    this.now = now;

    /** @type {SnapshotBuffer} Interpolation history for every entity. */
    this.snapshots = new SnapshotBuffer();

    /**
     * Last HP the server reported for each entity, keyed by id.
     *
     * The server publishes damage only as an absolute HP value, so the only way
     * to know "how much did that hit for" is to diff against what we last saw.
     * Without this map a confirmed hit can only be shown as a bare marker with
     * no number.
     * @type {Map<string, number>}
     */
    this._lastKnownHp = new Map();

    /** Time of the newest entity data from ANY source. */
    this._lastServerDataAt = 0;

    /** Time of the newest entity data that mentioned a BOT. */
    this._lastBotDataAt = 0;

    /** True once we have ever seen real server-driven entity data. */
    this._sawServerData = false;

    /** Authoritative match start (from `room.createdAt`), or 0 if unknown. */
    this._matchStartedAt = 0;

    /**
     * Phase 5: the server's authoritative map payload (`room_joined.map`).
     * Null until it arrives. The scene builds ALL collision and hazard geometry
     * from this, never from a client-side guess.
     * @type {object|null}
     */
    this.map = null;

    /** Display duration of a match, mirroring server `rooms.autoEndMs`. */
    this._matchDurationMs = MATCH_DURATION_MS;

    /** True once the server has sent us at least one BOT position. */
    this._sawBotData = false;

    /** @type {Array<() => void>} Socket unsubscribe handles. */
    this._offs = [];
  }

  /**
   * Begin consuming world events. Safe to call once per match.
   *
   * NOTE: `SocketClient.on` returns a no-op unsubscribe when the socket has not
   * connected yet, so an early `start()` degrades to "no updates" rather than
   * throwing.
   * @returns {void}
   */
  start() {
    if (this._offs.length) return;
    const s = this.net.socket;

    // -- Authoritative full-snapshot stream (Phase 3) -----------------------
    // Fired ~15 Hz carrying EVERY entity, so one handler serves the whole
    // match. Unknown ids are ignored here: the scene owns spawning, since it is
    // the only layer that knows about sprites and depth sorting.
    this._offs.push(
      s.on(NET_EVENTS.ENTITY_SNAPSHOT, (payload = {}) => this._ingest(payload, { authoritative: true })),
    );

    // -- Phase 2 fallbacks, so the client works against today's server ------
    this._offs.push(
      s.on(NET_EVENTS.BOT_UPDATE, (payload = {}) => this._ingest(payload, { authoritative: false })),
      s.on(NET_EVENTS.PLAYER_MOVE, (payload = {}) => this._ingest(payload, { authoritative: false })),
      s.on(NET_EVENTS.BOT_SPAWN, (bot = {}) => this._ingest({ bots: [bot] }, { authoritative: false })),
    );

    // -- Individual bot death -----------------------------------------------
    this._offs.push(
      s.on(NET_EVENTS.BOT_DEATH, (payload = {}) => {
        const id = payload.botId ?? payload.id;
        if (!id) return;
        const latest = this.snapshots.latest(String(id));
        // Record the death as a snapshot so interpolation carries the actor to
        // rest at its death position instead of freezing mid-stride.
        this._write({
          ...(latest ?? { x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 100, facing: 1 }),
          id: String(id),
          hp: 0,
          alive: false,
        });
        this.emit('entity-death', {
          id: String(id),
          killerId: payload.killerId ?? null,
          weaponId: payload.weaponId ?? null,
        });
      }),
    );

    // -- Health -------------------------------------------------------------
    // NOTE: the `player_health_update` listener lives in the "Damage / hit
    // confirmation" block below, which additionally derives confirmed-hit
    // damage by diffing against `_lastKnownHp`. A second listener here would
    // emit a duplicate `health` event per damage push.

    // -- Score (team totals / FFA kills) ------------------------------------
    // NOTE: the authoritative `score_update` listener lives further down, in the
    // Phase 4 block. This stub is only a comment marker.

    // -- Damage / hit confirmation ------------------------------------------
    // Phase 4 CORRECTION: the server has no `player_hit` / `entity_hit` event.
    // It publishes exactly one damage signal — `player_health_update` — so that
    // is what we listen for. Confirmed hits are therefore INFERRED: the server
    // lowered this entity's HP, so somebody (in practice, us) hit them.
    //
    // `previousHp` is captured here (the last HP we saw for that entity) so the
    // emitted delta is the real damage number rather than a guess. Without it we
    // would have to invent one, and a wrong damage number on a confirmed hit is
    // worse than no number — it teaches players to distrust the whole readout.
    s.on(NET_EVENTS.PLAYER_HEALTH_UPDATE, (payload = {}) => {
      const id = String(payload.id ?? payload.socketId ?? '');
      if (!id) return;
      const hp = Number(payload.hp);
      if (!Number.isFinite(hp)) return;

      const wasSelf = id === this._selfId();
      const previousHp = this._lastKnownHp.get(id);
      this._lastKnownHp.set(id, hp);

      const latest = this.snapshots.latest(id);
      // A health push carries no position; re-seed it so the sample keeps its
      // last known spot while HP updates.
      if (latest) this._write({ ...latest, hp, maxHp: Number(payload.maxHp) || latest.maxHp });

      this.emit('health', {
        id,
        hp,
        maxHp: Number(payload.maxHp) || latest?.maxHp || 100,
        damage: previousHp != null && previousHp > hp ? previousHp - hp : null,
        reason: payload.reason ?? null,
        isSelf: wasSelf,
      });

      // Confirmed hit on SOMEONE ELSE: the only server-backed evidence that our
      // shot landed. `previousHp` must be known, else we cannot attribute it.
      if (!wasSelf && previousHp != null && previousHp > hp) {
        const shooterId = this._selfId();
        this.emit('hit', {
          shooterId,
          targetId: id,
          damage: previousHp - hp,
          x: latest ? latest.x : null,
          y: latest ? latest.y : null,
          headshot: false,
          isSelf: true,
        });
      }
    });

    // -- Death / respawn ----------------------------------------------------
    // `entity_death` is BOTH the death signal and the killfeed row — the server
    // sends one event, not a separate `kill`. That means the kill feed and the
    // death animation are guaranteed consistent (same single source).
    this._offs.push(
      s.on(NET_EVENTS.ENTITY_DEATH, (payload = {}) => {
        const id = String(payload.victimId ?? '');
        if (!id) return;
        const isSelf = id === this._selfId();
        const killerId = payload.killedById ? String(payload.killedById) : null;

        // The victim is definitively at 0 HP; record it so a later
        // `player_health_update` does not report a phantom damage delta.
        this._lastKnownHp.set(id, 0);
        const latest = this.snapshots.latest(id);
        if (latest) this._write({ ...latest, hp: 0, alive: false });

        this.emit('death', {
          id,
          killerId,
          killerName: payload.killedByName ?? null,
          victimName: payload.victimName ?? null,
          killerIsBot: Boolean(payload.killerIsBot),
          victimIsBot: Boolean(payload.victimIsBot),
          cause: payload.cause ?? 'bullet',
          x: Number.isFinite(Number(payload.x)) ? Number(payload.x) : null,
          y: Number.isFinite(Number(payload.y)) ? Number(payload.y) : null,
          respawnInMs: Number(payload.respawnInMs) || 0,
          isSelf,
        });
      }),
    );

    // -- Respawn ------------------------------------------------------------
    // `entity_respawn` carries the AUTHORITATIVE revive placement, so the local
    // player teleports exactly where the server says — never to a local guess.
    this._offs.push(
      s.on(NET_EVENTS.ENTITY_RESPAWN, (payload = {}) => {
        const id = String(payload.id ?? '');
        if (!id) return;
        const hp = Number(payload.hp) || 100;
        this._lastKnownHp.set(id, hp);
        this.emit('spawn', {
          id,
          x: Number(payload.x),
          y: Number(payload.y),
          hp,
          maxHp: Number(payload.maxHp) || 100,
          isBot: Boolean(payload.isBot),
          isSelf: id === this._selfId(),
        });
      }),
    );

    // -- Kill feed ----------------------------------------------------------
    // The kill feed reads the SAME `entity_death` payload that drives the death
    // animation (emitted just above), so a row can never appear for a death the
    // scene did not play, or vice versa. Nothing is duplicated off the wire.

    // -- Medal / streak popups (Phase 4) -------------------------------------
    this._offs.push(
      s.on(NET_EVENTS.STREAK_EVENT, (payload = {}) => {
        const id = String(payload.id ?? '');
        this.emit('streak', {
          roomId: payload.roomId ?? null,
          kind: payload.kind === 'first_blood' ? 'first_blood' : 'streak',
          id,
          name: payload.name ?? 'A janitor',
          isBot: Boolean(payload.isBot),
          team: payload.team ?? null,
          streak: Number(payload.streak) || 0,
          // The server composes the glory text ("Killing Spree — Name (3)").
          // Fall back to a local label so a missing field still renders.
          text: payload.text ?? this._streakFallback(payload),
          isSelf: id === this._selfId(),
        });
      }),
    );

    // -- Shots (for tracers) -------------------------------------------------
    this._offs.push(
      s.on(NET_EVENTS.PLAYER_SHOOT, (payload = {}) => {
        const id = String(payload.id ?? '');
        this.emit('shot', {
          id,
          x: Number(payload.x) || 0,
          y: Number(payload.y) || 0,
          angle: Number(payload.angle) || 0,
          weaponId: payload.weaponId ?? 'mop',
          isSelf: id === this._selfId(),
        });
      }),
    );

    // -- Score (team totals / FFA kills) ------------------------------------
    // Phase 4 shape: `scores` is an ARRAY of per-entity rows. The old client
    // defaulted a missing field to `{}`, which would throw on the first
    // `.filter()`/`.map()` in the scoreboard — exactly when the server is
    // between pushes and sends nothing.
    this._offs.push(
      s.on(NET_EVENTS.SCORE_UPDATE, (payload = {}) =>
        this.emit('score', {
          roomId: payload.roomId ?? null,
          mode: payload.mode ?? null,
          scores: Array.isArray(payload.scores) ? payload.scores : [],
          // `teams` is `{ red, blue }` in TDM, null elsewhere. (The old
          // `teamScores` name was never a field the server ever sent.)
          teams: payload.teams ?? null,
          // TDM sudden-death after a tied horn: HUD flips the timer to red.
          overtime: Boolean(payload.overtime),
        }),
      ),
    );

    // -- Match clock --------------------------------------------------------
    // PHASE 4 CORRECTION: there is no `match_time` event in the server registry
    // and the server never emits one, so the Phase 3 listener here was dead code
    // and the HUD timer sat at "--:--" for the whole match.
    //
    // The clock is therefore derived from authoritative data the server DOES
    // send: `room.createdAt` plus the match duration. `createdAt` comes from the
    // room manifest, so we are not inventing state — we are computing a display
    // value from server facts. The server remains the sole authority on when the
    // match actually ends; if it ends early we simply stop on `match_end`.
    s.on(NET_EVENTS.ROOM_JOINED, ({ room } = {}) => {
      if (!room) return;
      const createdAt = Number(room.createdAt);
      if (Number.isFinite(createdAt)) {
        this._matchStartedAt = createdAt;
        this._matchDurationMs = MATCH_DURATION_MS;
      }
      // Phase 5: the server ships the AUTHORITATIVE map (platforms, hazard /
      // low-gravity zones, deposit stations, spawns). Capture it verbatim — the
      // client must render the same collision the sim uses.
      if (room.map) this.map = room.map;
    });

    // `match_state` repeats the map during the countdown, which is the same
    // payload and matters for a late join that missed `room_joined`.
    s.on(NET_EVENTS.MATCH_STATE, (payload = {}) => {
      if (payload.map) this.map = payload.map;
    });

    // --- Phase 5: scrap economy -------------------------------------------
    // Tokens are re-sent in FULL on every snapshot (they have no interpolation
    // history — they are static pickups), so `scrap_event` is presentation only:
    // a pickup/deposit flash, not a position authority.
    this._offs.push(
      s.on(NET_EVENTS.SCRAP_EVENT, (payload = {}) => {
        this.emit('scrap', {
          kind: payload.kind ?? 'drop',
          id: payload.id ?? null,
          byId: payload.byId ? String(payload.byId) : null,
          byName: payload.byName ?? null,
          amount: Number(payload.amount) || 0,
          total: Number(payload.total) || 0,
          x: Number.isFinite(Number(payload.x)) ? Number(payload.x) : null,
          y: Number.isFinite(Number(payload.y)) ? Number(payload.y) : null,
          isSelf: String(payload.byId ?? '') === this._selfId(),
        });
      }),
    );
  }

  /**
   * The authoritative map, once the server has sent one.
   * @returns {object|null}
   */
  getMap() {
    return this.map ?? null;
  }

  /**
   * Milliseconds left in the match, or null when we have no authoritative
   * start time yet.
   *
   * @param {number} [nowMs]
   * @returns {number|null}
   */
  remainingMs(nowMs = this.now()) {
    if (!this._matchStartedAt) return null;
    return Math.max(0, this._matchDurationMs - (nowMs - this._matchStartedAt));
  }

/**
   * Our own id as a string, or '' before identity is known. Comparing against
   * '' can never accidentally match a real id, so `isSelf` stays false (the
   * safe default) rather than true.
   * @returns {string}
   */
  _selfId() {
    return String(this.net.state.localId ?? '');
  }

  /**
   * Compose a streak label if the server omitted `text`.
   *
   * Only a fallback: the server owns the naming (it is the authority on when a
   * tier is crossed). This keeps the popup readable if the field is ever absent
   * rather than rendering an empty banner.
   *
   * @param {object} payload
   * @returns {string}
   */
  _streakFallback(payload) {
    if (payload.kind === 'first_blood') return `First Blood — ${payload.name ?? 'someone'}`;
    const tiers = [
      [12, 'Janitor Supreme'],
      [8, 'Unstoppable'],
      [5, 'Rampage'],
      [3, 'Killing Spree'],
    ];
    const streak = Number(payload.streak) || 0;
    const label = tiers.find(([at]) => streak >= at)?.[1] ?? 'Streak';
    return `${label} — ${payload.name ?? 'someone'} (${streak})`;
  }

  /**
   * Stop consuming world events and drop all buffered history.
   * @returns {void}
   */
  stop() {
    this._offs.forEach((off) => off());
    this._offs = [];
    this.snapshots.clear();
    this._lastServerDataAt = 0;
    this._lastBotDataAt = 0;
    this._sawServerData = false;
    this._sawBotData = false;
  }

  /**
   * Write one normalised entity into the buffer, stamped with arrival time.
   * @param {object} entity
   * @returns {void}
   */
  _write(entity) {
    this.snapshots.push({ ...entity, time: this.now() });
  }

  /**
   * Ingest a snapshot payload from any source.
   * @param {object} payload
   * @param {{authoritative: boolean}} opts
   * @returns {void}
   */
  _ingest(payload, { authoritative }) {
    const entities = extractEntities(payload, !authoritative);
    if (entities.length === 0) return;

    // Track the newest data that mentions a BOT specifically.
    //
    // `isServerDriving()` exists to answer one question: "should the client
    // still be simulating bots itself?" So only data about bots can answer it.
    // Keying this off "any server data at all" looks equivalent but is not: a
    // lobby full of humans relaying `player_move` would flip the flag and stop
    // the local AI, freezing every bot — even though the server never sent a
    // single bot position.
    if (entities.some((e) => e.isBot)) {
      this._lastBotDataAt = this.now();
      this._sawBotData = true;
    }

    // General "the server is alive and sending world state" signal.
    this._lastServerDataAt = this.now();
    if (authoritative) this._sawServerData = true;

    for (const entity of entities) this._write(entity);

    // One event per snapshot, not per entity: subscribers that iterate (the
    // scene, the HUD) then do a single pass per tick instead of N.
    this.emit('snapshot', {
      entities,
      authoritative,
      tick: Number(payload.tick) || 0,
      serverTime: Number(payload.serverTime) || 0,
      // Phase 5: live scrap tokens ride the snapshot in full (static pickups,
      // no interpolation history needed). Empty in every non-scrap mode.
      tokens: Array.isArray(payload.tokens) ? payload.tokens : [],
    });
  }

  /**
   * Is the server actually driving entity positions right now?
   *
   * `false` means the client should simulate bots locally so the mode stays
   * playable. Once the backend ships its AI this flips to `true` on its own.
   * @returns {boolean}
   */
  isServerDriving() {
    if (!this._sawBotData) return false;
    return this.now() - this._lastBotDataAt <= NET_TICK.serverSilentMs;
  }

  /**
   * Seed the buffer from a `room_joined` roster so actors render at their
   * authoritative spawn positions before the first snapshot arrives.
   * @param {object} room - Normalised room (MatchModel.normaliseRoom).
   * @returns {void}
   */
  seedFromRoom(room) {
    if (!room) return;
    for (const entity of [...(room.players ?? []), ...(room.bots ?? [])]) {
      if (this.snapshots.has(entity.id)) continue;
      this._write({
        id: entity.id,
        x: entity.x,
        y: entity.y,
        vx: 0,
        vy: 0,
        hp: entity.hp,
        maxHp: entity.maxHp,
        facing: 1,
        alive: true,
        isBot: entity.isBot,
        team: entity.team,
        name: entity.name,
      });
    }
  }

  /**
   * The interpolated position every remote entity should be drawn at.
   * @param {number} [nowMs] - Defaults to the injected clock.
   * @returns {number} Render time — deliberately in the past.
   */
  renderTime(nowMs = this.now()) {
    return nowMs - NET_TICK.interpolationDelayMs;
  }

  /**
   * Interpolated state for one entity, or null when we have never heard of it.
   * @param {string} id
   * @param {number} [nowMs]
   * @returns {object|null}
   */
  sample(id, nowMs = this.now()) {
    return this.snapshots.sample(id, this.renderTime(nowMs));
  }

  /**
   * Forget an entity (it left the room, or was destroyed).
   * @param {string} id
   * @returns {void}
   */
  forget(id) {
    this.snapshots.remove(id);
  }
}

export default MatchStream;
