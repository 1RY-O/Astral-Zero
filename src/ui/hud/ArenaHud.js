/**
 * Astral Zero — ArenaHud (in-match overlay).
 * ============================================================
 * The in-match UI, drawn on a FIXED camera (scrollFactor 0) so it stays put
 * while the third-person camera pans:
 *
 *   top-left     mode + map + roster counts (+ team tally in TDM)
 *   top-centre   match timer, plus TDM team scores
 *   bottom-left  local health bar + control reminder (fades after a few secs)
 *   centre       countdown ("3... 2... 1... GO") and the death overlay
 *   top-right    connection state + "Leave Match"
 *
 * The countdown is driven by the SERVER's `match_state{ phase:'countdown' }`
 * push plus the `countdownMs` from the room manifest, so every client in the
 * room sees the same numbers.
 *
 * HEALTH IS SERVER-OWNED
 * `setHealth` is only ever called from a `player_health_update` or a snapshot.
 * Nothing here (or in the scene) subtracts HP locally, so a tampered client
 * cannot heal itself — the bar can only display what the server reported.
 */

import Phaser from 'phaser';
import { THEME, FONTS } from '../../config/uiTheme.js';
import { MATCH_MODES, TEAMS } from '../../config/lobbyConfig.js';
import { HEALTH, MATCH_UI, SCRAP } from '../../config/netConfig.js';
import { Button } from '../widgets/Button.js';

export class ArenaHud {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {object} opts.room - Normalised room (MatchModel.normaliseRoom).
   * @param {import('../../net/NetworkManager.js').NetworkManager} opts.net
   * @param {() => void} [opts.onLeave]
   * @param {number} [opts.depth]
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.net = opts.net;
    this.onLeave = opts.onLeave ?? (() => {});
    this.depth = opts.depth ?? 200;
    this.room = opts.room;

    const mode = MATCH_MODES[this.room.mode] ?? MATCH_MODES.bot_practice;

    // --- Top-left: match identity -----------------------------------------
    this.modeText = scene.add
      .text(20, 14, `${mode.name.toUpperCase()}  ·  ${this.room.mapId}`, {
        ...FONTS.h3,
        fontSize: '17px',
      })
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setAlpha(0.92);

    this.rosterText = scene.add
      .text(20, 38, '', FONTS.small)
      .setDepth(this.depth)
      .setScrollFactor(0);

    // --- Top-right: leave --------------------------------------------------
    this.leaveButton = new Button(scene, {
      x: 1280 - 70,
      y: 28,
      width: 116,
      height: 32,
      label: 'Leave',
      skin: 'ghost',
      fontSize: '12px',
      depth: this.depth + 1,
      onClick: () => this.onLeave(),
    });

    this.connText = scene.add
      .text(1280 - 70, 50, '', { ...FONTS.tiny, color: THEME.textFaint })
      .setOrigin(0.5, 0)
      .setDepth(this.depth)
      .setScrollFactor(0);

    // --- Centre: countdown / banner ---------------------------------------
    this.banner = scene.add
      .text(640, 250, '', { ...FONTS.title, fontSize: '76px', fontStyle: '700' })
      .setOrigin(0.5)
      .setDepth(this.depth + 2)
      .setScrollFactor(0)
      .setAlpha(0);

    this.subBanner = scene.add
      .text(640, 310, '', { ...FONTS.body, fontSize: '18px' })
      .setOrigin(0.5)
      .setDepth(this.depth + 2)
      .setScrollFactor(0)
      .setAlpha(0);

    // --- Top-centre: match timer + team scores ------------------------------
    this.timerText = scene.add
      .text(640, 16, '--:--', { ...FONTS.h3, fontSize: '24px' })
      .setOrigin(0.5, 0)
      .setDepth(this.depth)
      .setScrollFactor(0);

    this.teamScoreText = scene.add
      .text(640, 46, '', { ...FONTS.small, fontSize: '14px' })
      .setOrigin(0.5, 0)
      .setDepth(this.depth)
      .setScrollFactor(0);

    // TDM sudden death. Hidden until the server sends `overtime: true`.
    this.overtimeText = scene.add
      .text(640, 68, '', { ...FONTS.tiny, fontSize: '13px', color: THEME.danger, fontStyle: '700' })
      .setOrigin(0.5, 0)
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setVisible(false);

    // Reconnect banner (Phase 4). The server keeps our seat for 60 s, so a drop
    // is recoverable and worth telling the player rather than showing a frozen
    // arena with no explanation.
    this.reconnectText = scene.add
      .text(640, 404, '', { ...FONTS.body, fontSize: '20px', color: THEME.warning })
      .setOrigin(0.5)
      .setDepth(this.depth + 3)
      .setScrollFactor(0)
      .setAlpha(0);

    // --- Bottom-left: health + controls hint -------------------------------
    // The bar sits ABOVE the hint text so the two never overlap on short
    // viewports, and the hint fades out entirely once the player is playing.
    const barY = 646;
    this.hpLabel = scene.add
      .text(20, barY - 2, 'HP', { ...FONTS.tiny })
      .setDepth(this.depth)
      .setScrollFactor(0);

    this.hpTrack = scene.add
      .rectangle(44, barY + 4, 200, 14, 0x0a1020, 0.85)
      .setOrigin(0, 0.5)
      .setDepth(this.depth)
      .setScrollFactor(0);

    this.hpFill = scene.add
      .rectangle(44, barY + 4, 200, 14, 0x4ade80)
      .setOrigin(0, 0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.hpValue = scene.add
      .text(254, barY - 2, '', { ...FONTS.tiny })
      .setDepth(this.depth)
      .setScrollFactor(0);

    this.hintText = scene.add
      .text(20, 694, 'A / D move    SPACE jump    mouse aim    LMB fire    TAB scoreboard', FONTS.small)
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setAlpha(0.7);

    // Fade the hint out once the player has had time to read it.
    scene.tweens.add({ targets: this.hintText, alpha: 0.2, delay: 7000, duration: 1200 });

    // --- Top-right: carried scrap (Phase 5, scrap_collector only) ----------
    // Hidden in every other mode: an always-visible "0 / 5" in FFA would be
    // meaningless clutter. `setScrap` shows/hides it.
    this.scrapText = scene.add
      .text(1280 - 70, 70, '', { ...FONTS.h3, fontSize: '16px', color: '#ffd166' })
      .setOrigin(0.5, 0)
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setVisible(false);

    this.bankedText = scene.add
      .text(1280 - 70, 90, '', { ...FONTS.tiny, color: THEME.warning })
      .setOrigin(0.5, 0)
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setVisible(false);

    // --- Bottom-right: weapon + ammo (Phase 4) -----------------------------
    // Ammo is a PRESENTATION value only. The server has no magazine/ammo
    // simulation in this contract — weapons are cooldown-gated, not
    // magazine-gated — so we must NOT draw a round counter that implies a
    // reload the server does not enforce. What we show instead is the weapon
    // NAME and its cadence, both of which are real, plus a cooldown sweep that
    // visualises the cadence the server actually enforces.
    this.weaponText = scene.add
      .text(1260, 636, '', { ...FONTS.h3, fontSize: '18px' })
      .setOrigin(1, 0)
      .setDepth(this.depth)
      .setScrollFactor(0);

    this.ammoText = scene.add
      .text(1260, 660, '', { ...FONTS.small, fontSize: '13px' })
      .setOrigin(1, 0)
      .setDepth(this.depth)
      .setScrollFactor(0);

    this.reloadTrack = scene.add
      .rectangle(1260, 684, 180, 5, 0x0a1020, 0.85)
      .setOrigin(1, 0.5)
      .setDepth(this.depth)
      .setScrollFactor(0);

    this.reloadFill = scene.add
      .rectangle(1080, 684, 0, 5, COMBAT.tracerColor)
      .setOrigin(0, 0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    // --- Death / respawn overlay ------------------------------------------
    // Hidden by default; ArenaScene shows it on a server death confirmation.
    this.deathOverlay = scene.add
      .text(640, 330, '', { ...FONTS.title, fontSize: '34px', color: THEME.danger })
      .setOrigin(0.5)
      .setDepth(this.depth + 4)
      .setScrollFactor(0)
      .setAlpha(0);

    // --- Countdown timing --------------------------------------------------
    this.countdownEnd = this.time.now + this.room.countdownMs;
    this.hp = HEALTH.defaultMax;
    this.maxHp = HEALTH.defaultMax;
    this.timeRemaining = null;
    this.updateRoster();
    this.showPhase(this.room.phase);
    this.setHealth(HEALTH.defaultMax, HEALTH.defaultMax);
  }

  /**
   * Apply a server-reported health value to the local bar.
   *
   * @param {number} hp
   * @param {number} [maxHp]
   * @returns {void}
   */
  setHealth(hp, maxHp = this.maxHp) {
    this.hp = hp;
    this.maxHp = maxHp || this.maxHp;
    const ratio = Phaser.Math.Clamp(this.hp / Math.max(1, this.maxHp), 0, 1);

    this.hpFill.setSize(Math.max(0, 200 * ratio), 14);
    this.hpFill.setFillStyle(ratio > 0.6 ? 0x4ade80 : ratio > 0.3 ? 0xffd166 : 0xff6b8b);
    this.hpValue.setText(`${Math.max(0, Math.round(this.hp))} / ${Math.round(this.maxHp)}`);
  }

  /**
   * Show the equipped weapon and its real cadence.
   *
   * @param {object} weapon - Row from src/config/weapons.js.
   * @returns {void}
   */
  setWeapon(weapon) {
    if (!weapon) return;
    this.weapon = weapon;
    this.weaponText.setText(weapon.name.toUpperCase());
    this.reloadFill.setFillStyle(weapon.tracerColor);
    this.ammoText.setText(`${weapon.damage} dmg  ·  ${weapon.cooldownMs} ms`);
    // A weapon swap should not inherit the previous weapon's cooldown sweep.
    this._shotAt = undefined;
    this.reloadFill.setSize(0, 5);
  }

  /**
   * Advance the cooldown sweep after a shot.
   *
   * Visualises the cadence the SERVER enforces, so the bar visibly refills
   * during the window in which the next shot would be rejected. That turns an
   * invisible rule into readable feedback.
   *
   * @param {number} cooldownMs - The weapon's cooldown.
   * @returns {void}
   */
  markShot(cooldownMs) {
    this._shotAt = this.time.now;
    this._cooldownMs = cooldownMs;
    this.reloadFill.setSize(0, 5);
  }

  /**
   * Flash the health bar when we take damage.
   *
   * The bar already shrinks to the new HP, but a shrink alone is easy to miss
   * mid-fight; a brief brighten makes the loss unmissable without needing a
   * full-screen effect.
   *
   * @returns {void}
   */
  pulseDamage() {
    this.hpTrack.setFillStyle(0xff6b8b, 0.95);
    this.scene.tweens.add({
      targets: this.hpTrack,
      alpha: { from: 1, to: 0.85 },
      duration: 90,
      yoyo: true,
      onComplete: () => this.hpTrack.setFillStyle(0x0a1020, 0.85),
    });
  }

  /**
   * Update the carried-scrap counter (Phase 5, scrap_collector).
   *
   * The cap is the SERVER's `carryCap` (5, server-config.js) — the server
   * refuses pickups above it, so drawing a higher number would promise scrap the
   * player cannot actually collect.
   *
   * @param {number} carried - From `entity_snapshot.entities[].carried`.
   * @param {number|null} [banked] - Shown briefly on a deposit.
   * @returns {void}
   */
  setScrap(carried, banked = null) {
    const show = carried !== null || banked !== null;
    this.scrapText.setVisible(show);
    this.bankedText.setVisible(show);
    if (carried !== null && carried !== undefined) {
      this.scrapText.setText(`SCRAP ${carried}/${SCRAP.carryCap}`);
    }
    if (banked !== null && banked !== undefined) {
      this.bankedText.setText(`BANKED ${banked}`);
    }
  }

  /**
   * Show or hide the reconnect banner (Phase 4).
   * @param {boolean} active
   * @param {string} [label]
   * @returns {void}
   */
  setReconnecting(active, label = 'Reconnecting to match…') {
    this.reconnectText.setText(active ? label : '');
    this.scene.tweens.add({
      targets: this.reconnectText,
      alpha: active ? 1 : 0,
      duration: active ? 180 : 320,
    });
  }

  /**
   * Flip the match clock into TDM sudden death.
   * @param {boolean} [on]
   * @returns {void}
   */
  setOvertime(on = true) {
    this.overtime = on;
    this.overtimeText.setText(on ? 'OVERTIME' : '');
    this.overtimeText.setVisible(on);
  }

  /**
   * Set the match clock from a `match_time` push.
   * @param {number} ms - Milliseconds remaining.
   * @returns {void}
   */
  setTimeRemaining(ms) {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.timeRemaining = ms;

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');

    this.timerText.setText(`${minutes}:${seconds}`);
    // Amber then red as the clock runs out, so urgency is visible peripherally.
    this.timerText.setColor(ms <= MATCH_UI.timerUrgentMs ? THEME.danger : THEME.textPrimary);
  }

  /**
   * Update the TDM team score line.
   * @param {{red?: number, blue?: number}} teamScores
   * @returns {void}
   */
  setTeamScores(teamScores) {
    if (!MATCH_MODES[this.room.mode]?.teams || !teamScores) {
      this.teamScoreText.setText('');
      return;
    }
    this.teamScoreText
      .setText(
        `${TEAMS.red.name}  ${teamScores.red ?? 0}   —   ${teamScores.blue ?? 0}  ${TEAMS.blue.name}`,
      )
      .setColor(THEME.textDim);
  }

  /**
   * Show the death overlay and count the respawn down.
   * @param {number} respawnMs
   * @returns {void}
   */
  showDeathOverlay(respawnMs) {
    this.deathOverlay.setAlpha(1).setText('ELIMINATED');
    this._respawnAt = this.time.now + respawnMs;

    this._respawnHandle?.remove(false);
    this._respawnHandle = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        const left = Math.max(0, Math.ceil((this._respawnAt - this.time.now) / 1000));
        this.deathOverlay.setText(left > 0 ? `Respawning in ${left}` : 'Respawning...');
      },
    });
  }

  /** Hide the death overlay and stop its countdown. @returns {void} */
  hideDeathOverlay() {
    this.deathOverlay.setAlpha(0).setText('');
    this._respawnAt = undefined;
    this._respawnHandle?.remove(false);
    this._respawnHandle = null;
  }

  /**
   * Update the roster / team tally line.
   * @returns {void}
   */
  updateRoster() {
    const { players, bots, teams } = this.room;
    if (MATCH_MODES[this.room.mode]?.teams) {
      this.rosterText
        .setText(`TEAM  ${teams.red.length}  —  ${teams.blue.length}   ·   ${bots.length} bot(s)`)
        .setColor(THEME.textDim);
      return;
    }
    this.rosterText
      .setText(`${players.length} janitor(s)  ·  ${bots.length} bot(s)`)
      .setColor(THEME.textDim);
  }

  /**
   * Drive the centre banner from the server's match phase.
   * @param {string} phase - 'countdown' | 'playing' | 'lobby' | 'gameover'
   * @returns {void}
   */
  showPhase(phase) {
    this.countdownEnd = this.time.now + this.room.countdownMs;

    if (phase === 'countdown') {
      this._showBanner('3', 'Get ready…');
      return;
    }
    if (phase === 'playing') {
      this._showBanner('GO!', '', 620);
      return;
    }
    this._showBanner('', '');
  }

  /**
   * @param {string} text - Big banner text ('' hides it).
   * @param {string} sub - Smaller line beneath.
   * @param {number} [holdMs] - Auto-hide after this long (0 = keep visible).
   * @returns {void}
   */
  _showBanner(text, sub, holdMs = 0) {
    this.banner.setText(text);
    this.subBanner.setText(sub);

    if (!text) {
      this.scene.tweens.add({ targets: [this.banner, this.subBanner], alpha: 0, duration: 200 });
      return;
    }

    this.scene.tweens.add({ targets: [this.banner, this.subBanner], alpha: 1, duration: 120 });
    if (holdMs > 0) {
      this.scene.tweens.add({
        targets: [this.banner, this.subBanner],
        alpha: 0,
        delay: holdMs,
        duration: 240,
      });
    }
  }

  /**
   * Per-frame: tick the countdown and keep the connection pill honest.
   * @returns {void}
   */
  update() {
    // Cooldown sweep: refill left-to-right over the weapon's cooldown window.
    // Cheap integer math, and the only per-frame work this HUD does.
    if (this._shotAt !== undefined && this._cooldownMs > 0) {
      const ratio = Phaser.Math.Clamp((this.time.now - this._shotAt) / this._cooldownMs, 0, 1);
      this.reloadFill.setSize(180 * ratio, 5);
      if (ratio >= 1) this._shotAt = undefined;
    }

    // The kill feed lives in its own widget but expires on the HUD's clock so
    // there is exactly one timer driving in-match transient UI.
    this.scene.killFeed?.update();

    const status = this.net.state.connection;
    const colour =
      status === 'online' ? THEME.online : status === 'connecting' ? THEME.warning : THEME.danger;
    this.connText.setText(status.toUpperCase()).setColor(colour);

    // Countdown: ceil the remaining time so it ticks 3 → 2 → 1.
    const remaining = this.countdownEnd - this.time.now;
    if (remaining > 0 && this.banner.text) {
      const label = String(Math.max(1, Math.ceil(remaining / 1000)));
      if (this.banner.text !== label) {
        this.banner.setText(label);
        // Pop so each tick registers visually.
        this.banner.setScale(1.35);
        this.scene.tweens.add({
          targets: this.banner,
          scaleX: 1,
          scaleY: 1,
          duration: 180,
          ease: 'Quad.easeOut',
        });
      }
    }
  }

  /** @returns {void} */
  destroy() {
    this._respawnHandle?.remove(false);
    this._respawnHandle = null;

    this.modeText.destroy();
    this.rosterText.destroy();
    this.connText.destroy();
    this.banner.destroy();
    this.subBanner.destroy();
    this.hintText.destroy();
    this.leaveButton.destroy();
    this.timerText.destroy();
    this.teamScoreText.destroy();
    this.hpLabel.destroy();
    this.hpTrack.destroy();
    this.hpFill.destroy();
    this.hpValue.destroy();
    this.deathOverlay.destroy();
    this.weaponText.destroy();
    this.ammoText.destroy();
    this.reloadTrack.destroy();
    this.reloadFill.destroy();
    this.overtimeText.destroy();
    this.reconnectText.destroy();
    this.scrapText.destroy();
    this.bankedText.destroy();
  }
}

export default ArenaHud;
