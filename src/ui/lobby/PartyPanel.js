/**
 * Astral Zero — PartyPanel (lobby section).
 * ===========================================================
 * Everything about parties, in one card. It has TWO states driven entirely by
 * `net.state.party`:
 *
 *   NO PARTY  → "Create Party" button + a 6-character code field + "Join"
 *   IN PARTY  → the shared code (big, click-to-copy) + the live member list
 *                (max 4) + "Leave Party"
 *
 * The panel NEVER invents party state: every value comes from the server's
 * `party_update` push (normalised by MatchModel). That means two browsers in
 * the same party always show the same roster without extra round-trips.
 *
 * Member rows are POOLED (created once, reused) because `party_update` fires
 * on every join/leave and rebuilding Text objects each time would churn the
 * display list for no reason.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { PARTY } from '../../config/lobbyConfig.js';
import { Panel } from '../widgets/Panel.js';
import { Button } from '../widgets/Button.js';
import { TextField } from '../widgets/TextField.js';
import { normalisePartyCode, validatePartyCode } from '../../net/MatchModel.js';
import * as Motion from '../../core/Motion.js';

export class PartyPanel {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {number} opts.width
   * @param {number} opts.height
   * @param {import('../../net/NetworkManager.js').NetworkManager} opts.net
   * @param {number} [opts.depth]
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.net = opts.net;
    this.depth = opts.depth ?? 0;

    const x = opts.x;
    const y = opts.y;
    const w = opts.width;
    const h = opts.height;

    this.panel = new Panel(scene, {
      x, y, width: w, height: h,
      title: 'PARTY',
      accent: THEME.accentDeep,
      emphasised: true,
      depth: this.depth,
    });

    const innerX = x + 20;
    const innerW = w - 40;

    // --- State A: not in a party ------------------------------------------
    this.emptyLabel = scene.add
      .text(innerX, y + 52, 'Play alone, or gather up to 3 friends for a match.', FONTS.dim)
      .setDepth(this.depth + 1)
      .setScrollFactor(0)
      .setWordWrapWidth(innerW);

    // The brief asks for CREATE PARTY to be visually LARGE and primary, with
    // JOIN WITH CODE clearly secondary. So: bigger button, bigger type, and a
    // `cta` skin (stronger glow) rather than the old flat `primary`.
    this.createButton = new Button(scene, {
      x: innerX + innerW / 2,
      y: y + 116,
      width: innerW,
      height: 62,
      label: 'CREATE PARTY',
      sublabel: 'sweep with up to 3 friends',
      skin: 'cta',
      fontSize: '20px',
      minHeight: 56,
      depth: this.depth + 2,
      ariaLabel: 'Create a new party and get a join code',
      onClick: () => this._onCreate(),
    });

    this.joinLabel = scene.add
      .text(innerX, y + 168, 'JOIN WITH CODE', FONTS.panelTitle)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.codeField = new TextField(scene, {
      x: innerX,
      y: y + 194,
      width: innerW - 116,
      height: 50,
      placeholder: 'ABC123',
      maxLength: PARTY.codeLength,
      // Party codes are A-Z0-9 and case-insensitive → normalise as we type.
      sanitise: (t) => normalisePartyCode(t),
      depth: this.depth + 2,
      onChange: () => this._refreshJoinButton(),
      onSubmit: () => this._onJoin(),
    });

    this.joinButton = new Button(scene, {
      x: innerX + innerW - 56,
      y: y + 219,
      width: 112,
      height: 50,
      label: 'JOIN',
      skin: 'accent',
      fontSize: '16px',
      minHeight: 48,
      depth: this.depth + 2,
      ariaLabel: 'Join a party using the code you were given',
      onClick: () => this._onJoin(),
    });

    this._refreshJoinButton();

    // --- State B: in a party ----------------------------------------------
    this.codeTitle = scene.add
      .text(innerX, y + 52, 'PARTY CODE', FONTS.tiny)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.codeText = scene.add
      .text(innerX + innerW / 2, y + 96, '------', { ...FONTS.code, fontSize: '40px', fontStyle: '700' })
      .setOrigin(0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.codeText.on('pointerdown', () => this._copyCode());

    this.copyHint = scene.add
      .text(innerX + innerW / 2, y + 128, 'tap to copy', FONTS.tiny)
      .setOrigin(0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0)
      .setAlpha(0.8);

    this.membersTitle = scene.add
      .text(innerX, y + 162, 'MEMBERS  0/4', FONTS.panelTitle)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    /** Pooled member rows (max 4, created on demand then reused). */
    this.memberRows = [];

    this.leaveButton = new Button(scene, {
      x: innerX + innerW / 2,
      y: y + h - 36,
      width: innerW,
      height: 50,
      label: 'LEAVE PARTY',
      skin: 'danger',
      fontSize: '15px',
      minHeight: 48,
      depth: this.depth + 2,
      onClick: () => this._onLeave(),
    });

    this.refresh();
  }
// =========================================================================
  // State rendering
  // =========================================================================

  /**
   * Re-render from `net.state.party`. Called on every `party_update`.
   * @returns {void}
   */
  refresh() {
    const party = this.net.state.party;
    const inParty = Boolean(party);

    // --- State A visibility -----------------------------------------------
    this.emptyLabel.setVisible(!inParty);
    this.createButton.setVisible(!inParty);
    this.joinLabel.setVisible(!inParty);
    this.codeField.setVisible(!inParty);
    this.joinButton.setVisible(!inParty);

    // --- State B visibility -----------------------------------------------
    this.codeTitle.setVisible(inParty);
    this.codeText.setVisible(inParty);
    this.copyHint.setVisible(inParty);
    this.membersTitle.setVisible(inParty);
    this.leaveButton.setVisible(inParty);

    if (!inParty) {
      // Hide pooled rows so they cannot bleed into the next party.
      this.memberRows.forEach((r) => r.row.setVisible(false));
      return;
    }

    this.codeText.setText(party.code || '------');
    this._highlightCode();
    this.membersTitle.setText(`MEMBERS  ${party.memberCount}/${party.maxSize}`);
    this._renderMembers(party);
  }

  /**
   * Refresh the pooled member rows for the current roster.
   * @param {object} party - Normalised party from `net.state.party`.
   * @returns {void}
   */
  _renderMembers(party) {
    const rowH = PARTY.memberRowHeight;
    const gap = PARTY.memberRowGap;
    const x = this.panel.x + 20;
    const w = this.panel.width - 40;
    const top = this.panel.y + 166;

    // Grow the pool to match the roster (max 4) — created once, then reused.
    while (this.memberRows.length < party.members.length) {
      const i = this.memberRows.length;
      this.memberRows.push(this._createMemberRow(i, x, top + i * (rowH + gap), w, rowH));
    }

    this.memberRows.forEach((entry, i) => {
      const member = party.members[i];
      if (!member) {
        entry.row.setVisible(false);
        return;
      }

      entry.row.setVisible(true);
      entry.name.setText(member.name);

      // Tags: "LEADER" for the leader, "YOU" for our own entry.
      const tags = [];
      if (member.isLeader) tags.push('LEADER');
      if (member.id === this.net.state.localId) tags.push('YOU');
      entry.tag.setText(tags.join(' · '));

      // Leader rows get a cyan stripe + brighter border; others stay neutral.
      const g = entry.bg;
      g.clear();
      g.fillStyle(member.isLeader ? 0x10263d : 0x0b1424, 0.95);
      g.fillRoundedRect(0, 0, w, rowH, 8);
      g.lineStyle(
        1,
        member.isLeader ? THEME.panelBorderBright : THEME.panelBorder,
        member.isLeader ? 0.95 : 0.6,
      );
      g.strokeRoundedRect(0, 0, w, rowH, 8);
      entry.crown.setVisible(member.isLeader);
    });
  }

  /**
   * Build one pooled member row (bg + leader stripe + name + tag).
   * @param {number} index - Row index (also the fallback display name).
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} rowH
   * @returns {{row: Phaser.GameObjects.Container, bg: Phaser.GameObjects.Graphics,
   *   name: Phaser.GameObjects.Text, tag: Phaser.GameObjects.Text,
   *   crown: Phaser.GameObjects.Rectangle}}
   */
  _createMemberRow(index, x, y, w, rowH) {
    const scene = this.scene;
    const depth = this.depth + 2;

    const bg = scene.add.graphics();
    bg.fillStyle(0x0b1424, 0.95);
    bg.fillRoundedRect(0, 0, w, rowH, 8);
    bg.lineStyle(1, THEME.panelBorder, 0.6);
    bg.strokeRoundedRect(0, 0, w, rowH, 8);

    const crown = scene.add
      .rectangle(3, rowH / 2, 4, rowH - 18, 0x38e1ff)
      .setOrigin(0, 0.5)
      .setVisible(false);

    const name = scene.add.text(16, rowH / 2, `Janitor ${index + 1}`, FONTS.body).setOrigin(0, 0.5);

    const tag = scene.add
      .text(w - 14, rowH / 2, '', { ...FONTS.tiny, color: THEME.accent })
      .setOrigin(1, 0.5);

    const row = scene.add
      .container(x, y, [bg, crown, name, tag])
      .setScrollFactor(0)
      .setDepth(depth);

    return { row, bg, name, tag, crown };
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /** Enable/disable "Join" based on whether the code is 6 valid characters. */
  _refreshJoinButton() {
    this.joinButton.setEnabled(validatePartyCode(this.codeField.getValue()).valid);
  }

  /** @returns {void} */
  _onCreate() {
    this.net.createParty();
  }

  /** @returns {void} */
  _onJoin() {
    const check = validatePartyCode(this.codeField.getValue());
    if (!check.valid) {
      this.net.setNotice('error', check.reason);
      return;
    }
    this.net.joinParty(this.codeField.getValue());
  }

  /** @returns {void} */
  _onLeave() {
    this.net.leaveParty();
  }

  /**
   * Copy the code to the clipboard so it can be pasted into a chat message.
   * Falls back to a "read it off screen" hint when the Clipboard API is
   * unavailable (it requires a secure context, and this game is often tested
   * over plain http on a LAN).
   * @returns {void}
   */
  _copyCode() {
    const code = this.net.state.party?.code;
    if (!code) return;

    const flash = (text, colour) => {
      this.copyHint.setText(text).setColor(colour);
      this.scene.time.delayedCall(2000, () => {
        this.copyHint.setText('click to copy').setColor(THEME.textFaint);
      });
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(code)
        .then(() => flash('copied!', THEME.success))
        .catch(() => flash('read the code above', THEME.warning));
    } else {
      flash('read the code above', THEME.warning);
    }
  }

  /**
   * Brief scale pop so a fresh create/join is noticeable without being loud.
   * @returns {void}
   */
  _highlightCode() {
    // Respect reduced motion: land on the final scale immediately.
    this.codeText.setScale(Motion.isReduced() ? 1 : 1);
    Motion.tween(this.scene, {
      targets: this.codeText,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 140,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** @returns {void} */
  destroy() {
    this.panel.destroy();
    this.createButton.destroy();
    this.joinButton.destroy();
    this.leaveButton.destroy();
    this.codeField.destroy();
    this.memberRows.forEach((r) => r.row.destroy());
    [
      this.emptyLabel, this.joinLabel, this.codeTitle, this.codeText,
      this.copyHint, this.membersTitle,
    ].forEach((o) => o.destroy());
  }
}

export default PartyPanel;
