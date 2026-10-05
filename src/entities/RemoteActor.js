/**
 * Astral Zero — RemoteActor (other humans and bots in the arena).
 * ============================================================
 * A lightweight stand-in for everyone who is NOT the local player. It
 * deliberately does NOT extend `Player`: the local player runs real physics
 * from real input, while remote actors are DRIVEN by interpolated server state.
 *
 * WHY ONE CLASS FOR BOTH HUMANS AND BOTS
 * Bots are server-authoritative rows in `room.bots` with an `isBot` flag, so
 * they behave identically to a remote human except for colour and scale. One
 * class means one name-tag routine, one health bar, one depth rule, one teardown
 * path.
 *
 * COLOURING
 *  - Bot Practice: bots amber, humans cyan (friendly vs enemy readable at a
 *    glance, which matters in the mode whose whole point is "no stakes").
 *  - TDM: everything follows its team colour.
 *  - FFA: humans cyan, bots magenta.
 *
 * POSITION: SMOOTHED, NOT SNIAPPED
 * `applySample()` stores whatever `MatchStream.sample()` returned — already
 * interpolated from the snapshot history, so the target itself moves smoothly
 * between two 15 Hz snapshots. `update()` adds only a light easing pass to
 * absorb residual packet jitter. It is deliberately gentle: a heavy lerp on top
 * of interpolation would re-introduce exactly the lag interpolation exists to
 * remove.
 *
 * DEATH
 * A dead actor is not destroyed instantly — it fades to a corpse tint. An
 * entity that vanishes between two frames reads as a bug; a body that settles
 * reads as a kill.
 */

import Phaser from 'phaser';
import { MATCH_MODES, TEAMS, HUD } from '../config/lobbyConfig.js';
import { HealthBar } from '../ui/hud/HealthBar.js';

/** Tint per actor kind, keyed by mode + team. */
function colourFor(mode, team, isBot) {
  if (MATCH_MODES[mode]?.friendly) return isBot ? TEAMS.blue.colorInt : TEAMS.solo.colorInt;
  if (team === 'red') return TEAMS.red.colorInt;
  if (team === 'blue') return TEAMS.blue.colorInt;
  return isBot ? 0xff6b8b : TEAMS.solo.colorInt;
}

export class RemoteActor {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} entity - Normalised entity (MatchModel.normaliseEntity).
   * @param {object} opts
   * @param {string} opts.mode - Room mode.
   */
  constructor(scene, entity, opts = {}) {
    this.scene = scene;
    this.entity = entity;
    this.id = entity.id;
    this.isBot = entity.isBot;
    this.mode = opts.mode ?? 'ffa';
    this.baseColour = colourFor(this.mode, entity.team, entity.isBot);

    /** Authoritative (sampled) position, and the smoothed drawn position. */
    this.targetX = entity.x;
    this.targetY = entity.y;

    this.hp = entity.hp ?? 100;
    this.maxHp = entity.maxHp ?? 100;
    this.alive = true;

    this.sprite = scene.add
      .image(entity.x, entity.y, 'player')
      .setDepth(9)
      .setTint(this.baseColour);

    // Bots read as slightly smaller + rounder; humans as full-size players.
    if (entity.isBot) this.sprite.setScale(0.86);

    this.tag = scene.add
      .text(entity.x, entity.y + HUD.nameTagOffset, this._label(entity), {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: HUD.nameTagFontSize,
        color: entity.isBot ? '#ff9f43' : '#cfe2f5',
      })
      .setOrigin(0.5, 1)
      .setDepth(9);

    this.healthBar = new HealthBar(scene, {
      depth: 9.5,
      // Practice mode hides the bars: nothing is at stake, so a permanent bar
      // over every bot is noise. Real modes always show them.
      alwaysShow: !MATCH_MODES[this.mode]?.friendly,
    });
    this.healthBar.setHp(this.hp, this.maxHp);

    /** Per-actor idle phase so a crowd never sways in lockstep. */
    this._phase = Math.random() * Math.PI * 2;
  }

  /**
   * Label text: bot type in parentheses, humans plain.
   * @param {object} entity
   * @returns {string}
   */
  _label(entity) {
    // Phase 4: an explicit `[BOT]` prefix. Bots already differ by tint and
    // scale, but both are subtle at speed and on a busy screen. A text marker
    // is the only distinction that is unambiguous from any distance, and it
    // matters because bot_practice is the mode new players are dropped into.
    if (entity.isBot) {
      const type = entity.botType ? ` ${entity.botType}` : '';
      return `[BOT]${type} ${entity.name}`;
    }
    return entity.name;
  }

  /**
   * Point the actor at a new authoritative position.
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  setTarget(x, y) {
    if (Number.isFinite(x)) this.targetX = x;
    if (Number.isFinite(y)) this.targetY = y;
  }

  /**
   * Apply an interpolated snapshot. This is the ONLY thing that should move a
   * remote actor during normal play.
   * @param {object} sample - Output of `MatchStream.sample()`.
   * @returns {void}
   */
  applySample(sample) {
    if (!sample) return;
    this.setTarget(sample.x, sample.y);
    if (Number.isFinite(sample.hp)) this.setHp(sample.hp, sample.maxHp ?? this.maxHp);
    if (sample.alive === false && this.alive) this.die();
  }

  /**
   * Apply a health value from `player_health_update` or a snapshot.
   * @param {number} hp
   * @param {number} [maxHp]
   * @returns {void}
   */
  setHp(hp, maxHp = this.maxHp) {
    this.hp = hp;
    this.maxHp = maxHp || this.maxHp;
    this.healthBar.setHp(this.hp, this.maxHp, !this.alive);
    if (this.hp <= 0 && this.alive) this.die();
  }

  /**
   * Fade the actor out and hide its chrome.
   * @returns {void}
   */
  die() {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.setTint(0x556070);
    this.scene.tweens.add({ targets: [this.sprite, this.tag], alpha: 0, duration: 260 });
    this.healthBar.setVisible(false);
  }

  /**
   * Bring the actor back (respawn).
   * @param {number} x
   * @param {number} y
   * @param {number} [hp]
   * @returns {void}
   */
  respawn(x, y, hp = this.maxHp) {
    this.alive = true;
    this.hp = hp;
    this.setTarget(x, y);
    this.sprite.setPosition(x, y).setTint(this.baseColour).setAlpha(1);
    this.tag.setAlpha(1);
    this.healthBar.setHp(hp, this.maxHp);
  }

  /**
   * Ease toward the target and idle-sway. Called once per frame by the scene.
   * @param {number} time - Total elapsed ms (drives the sway).
   * @param {number} delta - Frame delta in ms.
   * @returns {void}
   */
  update(time, delta) {
    // Frame-rate independent lerp (see ThirdPersonCamera._smoothing).
    const t = 1 - Math.pow(1 - 0.35, Math.min(Math.max(delta, 1), 100) / 16.667);
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, t);
    this.sprite.y = Phaser.Math.Linear(this.sprite.y, this.targetY, t);

    // Idle sway so a standing crowd looks alive. Suppressed while moving — the
    // sway would fight the interpolation and read as jitter.
    const moving = Math.abs(this.targetX - this.sprite.x) > 1.2;
    if (!moving) {
      this.sprite.y += Math.sin(time / 520 + this._phase) * (this.isBot ? 2.5 : 1.5);
    }

    // Face the way we are travelling.
    const dx = this.targetX - this.sprite.x;
    if (Math.abs(dx) > 1.5) this.sprite.setFlipX(dx < 0);

    this.tag.setPosition(this.sprite.x, this.sprite.y + HUD.nameTagOffset);
    this.healthBar.follow(this.sprite.x, this.sprite.y);
  }

  /** @returns {void} */
  destroy() {
    this.sprite.destroy();
    this.tag.destroy();
    this.healthBar.destroy();
  }
}

export default RemoteActor;
