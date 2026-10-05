/**
 * Astral Zero — MatchResults (FRONTEND).
 * ============================================================
 * The win / loss screen shown when the server ends the match, before we drop
 * the player back into the lobby.
 *
 * WHY THIS LAGS THE `match_end` EVENT BY DESIGN
 * `match_end` fires the instant the round ends. Cutting straight to the lobby
 * would hide the result from the person who just earned it. So we show this
 * overlay, hold it for a few seconds, and THEN return — while still letting the
 * player skip straight through, because being forced to read a scoreboard you
 * did not ask for is worse than a missing one.
 *
 * The result itself is always the SERVER's (`match_end → result.results`); we
 * only decide how to present it.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { Button } from '../widgets/Button.js';
import { MATCH_MODES } from '../../config/lobbyConfig.js';

/** How long the screen holds before auto-returning, unless skipped. */
const AUTO_RETURN_MS = 9000;

export class MatchResults {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {object} opts.result - The server's `match_end` payload.
   * @param {string} opts.localId
   * @param {() => void} opts.onReturn - Return to the lobby.
   */
  constructor(scene, { result, localId, onReturn }) {
    this.scene = scene;
    this.onReturn = onReturn;
    this.localId = localId;
    this._done = false;

    const mode = MATCH_MODES[result?.mode] ?? MATCH_MODES.bot_practice;
    const results = Array.isArray(result?.results) ? result.results : [];
    const mine = results.find((r) => String(r.id) === String(localId));

    // --- Outcome -----------------------------------------------------------
    // Without a real winner field we do not invent one: the headline reports
    // what is verifiable (the mode, who finished top) and the row below marks
    // the player's own placing honestly.
    const ranked = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = ranked[0];
    this.outcome = top && String(top.id) === String(localId) ? 'VICTORY' : 'MATCH OVER';

    const depth = 400;

    this.container = scene.add.container(640, 360).setDepth(depth).setScrollFactor(0);

    const veil = scene.add.rectangle(0, 0, 1280, 720, THEME.bg, 0.82).setOrigin(0.5);
    const plate = scene.add
      .rectangle(0, 0, 560, 360, THEME.panel, 0.98)
      .setStrokeStyle(2, this.outcome === 'VICTORY' ? THEME.accent : THEME.panelBorder)
      .setOrigin(0.5);

    const title = scene.add
      .text(0, -128, this.outcome, {
        ...FONTS.title,
        fontSize: '44px',
        color: this.outcome === 'VICTORY' ? THEME.accent : THEME.textPrimary,
      })
      .setOrigin(0.5);

    const subtitle = scene.add
      .text(0, -84, `${mode.name.toUpperCase()}   ·   ${result?.reason ?? 'finished'}`, {
        ...FONTS.dim,
      })
      .setOrigin(0.5);

    const lines = ranked.slice(0, 8).map((r, i) => {
      const you = String(r.id) === String(localId) ? '   ‹ you' : '';
      return `${i + 1}.  ${r.name}${you}`.padEnd(30) + String(r.score ?? 0);
    });

    const table = scene.add.text(0, -30, lines.join('\n') || 'No results reported.', {
      ...FONTS.body,
      align: 'left',
    })
      .setOrigin(0.5, 0);

    const mineLine = scene.add
      .text(0, 96, mine ? `You finished with ${mine.score ?? 0}.` : '', { ...FONTS.small })
      .setOrigin(0.5);

    this.container.add([veil, plate, title, subtitle, table, mineLine]);

    // --- Skip button -------------------------------------------------------
    this.button = new Button(scene, {
      x: 640,
      y: 486,
      width: 200,
      height: 44,
      label: 'Back to lobby',
      skin: 'primary',
      depth: depth + 1,
      onClick: () => this._return(),
    });

    // Auto-return, so a player who walks away is not stranded on a dead screen.
    this._timer = scene.time.delayedCall(AUTO_RETURN_MS, () => this._return());

    // Any key or click also skips — no one wants to wait out a timer.
    this._skip = scene.input.keyboard?.on('keydown', () => this._return());
    this._skipPointer = scene.input.on('pointerdown', () => this._return());
  }

  /**
   * Tear the overlay down. Idempotent: the timer, the button and a manual skip
   * can all race, and only the first must produce a scene change.
   * @returns {void}
   */
  _return() {
    if (this._done) return;
    this._done = true;

    this._timer?.remove(false);
    this._skip?.off();
    this._skipPointer?.off();
    this.button.destroy();
    this.container.destroy();

    this.onReturn();
  }

  /** @returns {void} */
  destroy() {
    this._timer?.remove(false);
    this._skip?.off();
    this._skipPointer?.off();
    this.button.destroy();
    this.container.destroy();
  }
}

export default MatchResults;