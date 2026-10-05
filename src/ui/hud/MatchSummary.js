/**
 * Astral Zero — MatchSummary (FRONTEND, Phase 5).
 * ============================================================
 * The end-of-match screen: final standings, XP breakdown, rank badge and
 * progress toward the next rank.
 *
 * BUILT ON THE EXISTING MatchResults
 * `MatchResults.js` already rendered "who won". This adds the progression layer
 * on top rather than replacing it, so there is still exactly one place that
 * draws the end-of-match panel and the existing "return to lobby" flow is
 * untouched.
 *
 * THE DATA IS THE SERVER'S; THE XP IS OURS
 * Standings come from `match_end.results` / `score_update`, which the server
 * computes. The XP breakdown is derived locally from those same numbers (see
 * game/Progression.js) and stored in localStorage — there is no XP field in the
 * 1.3/1.4 contract, so nothing here is pretending to be authoritative.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { Button } from '../widgets/Button.js';
import { MEDAL_TYPES, summarise } from '../../game/Progression.js';

export class MatchSummary {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} [opts.depth]
   * @param {() => void} [opts.onContinue] - "Return to lobby".
   */
  constructor(scene, { depth = 300, onContinue = () => {} } = {}) {
    this.scene = scene;
    this.depth = depth;
    this.onContinue = onContinue;

    /** @type {Array<object>} Everything we create, for teardown. */
    this._nodes = [];
    this.visible = false;

    this.root = scene.add.container(0, 0).setDepth(depth).setScrollFactor(0).setVisible(false);
    this._nodes.push(this.root);

    this._build();
  }

  /**
   * Build the static chrome once; only text content is refreshed per match.
   * @returns {void}
   */
  _build() {
    const { width, height } = this.scene.scale;
    const cx = width / 2;

    const scrim = this.scene.add
      .rectangle(cx, height / 2, width, height, 0x03060d, 0.86)
      .setScrollFactor(0);
    this.root.add(scrim);

    this.titleText = this.scene.add
      .text(cx, 76, 'MATCH COMPLETE', { ...FONTS.title, fontSize: '34px' })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.root.add(this.titleText);

    this.outcomeText = this.scene.add
      .text(cx, 116, '', { ...FONTS.h2, fontSize: '22px' })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.root.add(this.outcomeText);

    // --- Standings (server-reported) ---------------------------------------
    this.standingsText = this.scene.add
      .text(cx - 210, 176, '', { ...FONTS.small, fontSize: '13px', lineSpacing: 6 })
      .setOrigin(0, 0)
      .setScrollFactor(0);
    this.root.add(this.standingsText);

    // --- XP breakdown (locally computed from the server's numbers) --------
    this.xpText = this.scene.add
      .text(cx + 60, 176, '', { ...FONTS.small, fontSize: '13px', lineSpacing: 6 })
      .setOrigin(0, 0)
      .setScrollFactor(0);
    this.root.add(this.xpText);

    this.xpTotalText = this.scene.add
      .text(cx + 60, 360, '', { ...FONTS.h2, fontSize: '26px', color: THEME.warning })
      .setOrigin(0, 0)
      .setScrollFactor(0);
    this.root.add(this.xpTotalText);

    // --- Rank badge + progress ---------------------------------------------
    // Phase 5: the server owns level + xp, so there is no local progress bar
    // any more. We render the authoritative LEVEL and the medals it awarded.
    this.levelText = this.scene.add
      .text(cx, 414, '', { ...FONTS.h3, fontSize: '22px' })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.root.add(this.levelText);

    this.medalText = this.scene.add
      .text(cx, 452, '', { ...FONTS.small, fontSize: '13px', align: 'center', lineSpacing: 5 })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    this.root.add(this.medalText);

    this.continueButton = new Button(this.scene, {
      x: cx,
      y: height - 84,
      width: 240,
      height: 44,
      label: 'Return to Lobby',
      onClick: () => this.onContinue(),
      depth: this.depth + 1,
    });
    // The button lives on the scene, not in the container, so it needs the same
    // visibility treatment as the panel.
    this._nodes.push(this.continueButton);
  }

  /**
   * Show the summary for a finished match.
   *
   * @param {object} opts
   * @param {object[]} [opts.results] - Server `match_end.results`.
   * @param {boolean} [opts.won]
   * @param {string} [opts.mode]
   * @param {string} [opts.winnerName]
   * @param {number} [opts.xp] - Pre-computed award (see computeMatchXp).
   * @param {string[]} [opts.awardLines]
   * @param {string|null} [opts.selfId]
   * @returns {void}
   */
  show(payload = {}, localId = null) {
    // One pure call turns the authoritative payload into everything we draw.
    const v = summarise(payload, localId);
    // `—` for anything the server did not send. Never substitute a guess: a
    // summary that invents a number is worse than one that admits ignorance.
    const dash = (x) => (x === null || x === undefined ? '—' : String(x));

    this.outcomeText
      .setText(v.outcomeKnown ? (v.won ? 'VICTORY' : 'DEFEAT') : 'MATCH COMPLETE')
      .setColor(v.won ? THEME.success : v.outcomeKnown ? THEME.danger : THEME.textDim);

    // --- Standings (server-reported) ---------------------------------------
    const rows = v.standings.slice(0, 8).map((r, i) => {
      const isSelf = localId && r.id === localId;
      const name = `${isSelf ? '\u25b8 ' : ''}${r.name ?? 'Unknown'}${r.isBot ? ' [BOT]' : ''}`;
      return `${i + 1}.  ${name.padEnd(20, ' ')}${dash(r.kills)} / ${dash(r.deaths)}`;
    });
    this.standingsText.setText(['FINAL STANDINGS', ...rows].join('\n'));

    // --- Your stats (all authoritative) ------------------------------------
    const acc = v.accuracy === null ? '—' : `${Math.round(v.accuracy * 100)}%`;
    const statLines = [
      `Kills        ${dash(v.kills)}`,
      `Deaths       ${dash(v.deaths)}`,
      `Accuracy     ${acc}`,
      `Best streak  ${dash(v.bestStreak)}`,
    ];
    if (v.banked !== null || v.carried !== null) {
      statLines.push(`Scrap banked ${dash(v.banked)}  carried ${dash(v.carried)}`);
    }
    if (v.mvpName) statLines.push(`MVP  ${v.mvpName}${v.isMvp ? '  (you)' : ''}`);
    this.xpText.setText(['YOUR MATCH', ...statLines].join('\n'));

    // --- XP + level, exactly as the server computed them --------------------
    this.xpTotalText.setText(`${dash(v.xp)} XP`);
    this.levelText.setText(
      v.level === null ? '' : `LEVEL ${v.level}${v.levelTitle ? `  \u00b7  ${v.levelTitle.toUpperCase()}` : ''}`,
    );

    // --- Medals (server-decided) -------------------------------------------
    if (v.medals.length) {
      this.medalText
        .setText(v.medals.map((m) => `${m.name}${m.known ? '' : ' (unrecognised)'}`).join('   '))
        .setColor(THEME.warning);
    } else {
      this.medalText.setText('No medals this match').setColor(THEME.textFaint);
    }
  }

  /** @returns {void} */
  hide() {
    this.root.setVisible(false);
    this.continueButton.setVisible?.(false);
    this.visible = false;
  }

  /** @returns {void} */
  destroy() {
    this.continueButton?.destroy?.();
    this.root.destroy();
    this._nodes = [];
  }
}

export default MatchSummary;
