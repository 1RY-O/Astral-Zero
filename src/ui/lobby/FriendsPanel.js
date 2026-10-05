/**
 * Astral Zero — FriendsPanel (lobby section).
 * ===========================================================
 * Add friends by name, see who is online, and one-click invite them into the
 * current party.
 *
 * DATA FLOW
 *   server `friend_update` → NetworkManager.state.friends (normalised) →
 *   `refresh()` re-renders the list. Rows are pooled like the party members,
 *   and the "Invite" button is disabled whenever inviting is impossible:
 *     - not in a party            → "join a party first"
 *     - party already full (4/4)  → "party full"
 *     - friend offline            → "offline"
 *   so the player never fires a request the backend would only reject.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { Panel } from '../widgets/Panel.js';
import { Button } from '../widgets/Button.js';
import { TextField } from '../widgets/TextField.js';

const ROW_H = 46;
const ROW_GAP = 8;
const MAX_ROWS = 6;

export class FriendsPanel {
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

    const { x, y, width: w, height: h } = opts;
    const innerX = x + 20;
    const innerW = w - 40;

    this.panel = new Panel(scene, { x, y, width: w, height: h, title: 'FRIENDS', depth: this.depth });

    // --- Add-friend row ----------------------------------------------------
    this.addField = new TextField(scene, {
      x: innerX,
      y: y + 48,
      width: innerW - 96,
      height: 42,
      placeholder: 'add by name or ID…',
      maxLength: 24,
      depth: this.depth + 2,
      onSubmit: (text) => this._onAdd(text),
    });

    this.addButton = new Button(scene, {
      x: innerX + innerW - 44,
      y: y + 69,
      width: 88,
      height: 42,
      label: 'Add',
      skin: 'accent',
      depth: this.depth + 2,
      onClick: () => this._onAdd(this.addField.getValue()),
    });

    this.countLabel = scene.add
      .text(innerX + innerW, y + 100, '', FONTS.tiny)
      .setOrigin(1, 0)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.listTop = y + 120;
    /** @type {Array<object>} Pooled friend rows. */
    this.rows = [];

    this.emptyLabel = scene.add
      .text(innerX, this.listTop + 6, 'No friends yet.\nAdd someone by name to invite them later.', {
        ...FONTS.dim,
        lineSpacing: 6,
      })
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    // Doubles as the "N more in your list" overflow notice.
    this.hintLabel = scene.add
      .text(innerX, y + h - 26, 'Tip: invite a friend, then let them invite you back.', FONTS.tiny)
      .setDepth(this.depth + 1)
      .setScrollFactor(0)
      .setAlpha(0.8);

    this.refresh();
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  /**
   * Re-render from `net.state.friends` + `net.state.party`.
   * @returns {void}
   */
  refresh() {
    const friends = this.net.state.friends ?? [];
    const party = this.net.state.party;

    this.countLabel.setText(friends.length ? `${friends.length} total` : '');
    this.emptyLabel.setVisible(friends.length === 0);

    // Grow the pool to the number of friends (capped so rows always fit).
    while (this.rows.length < Math.min(friends.length, MAX_ROWS)) {
      this.rows.push(this._createRow(this.rows.length));
    }

    this.rows.forEach((entry, i) => {
      const friend = friends[i];
      if (!friend) {
        entry.row.setVisible(false);
        return;
      }
      entry.row.setVisible(true);
      entry.friend = friend;
      entry.name.setText(friend.name);
      entry.name.setColor(friend.online ? THEME.textPrimary : THEME.textFaint);

      // Presence dot: green when online, grey when not. Drawn into the row's
      // graphics after the background so it sits on top.
      entry.bg.fillStyle(friend.online ? THEME.online : THEME.offline, 1);
      entry.bg.fillCircle(16, ROW_H / 2, 4);

      // Invite button gating (see the header comment for why).
      const canInvite = Boolean(party) && !party.isFull && friend.online;
      entry.invite.setEnabled(canInvite);
      entry.invite.setLabel(
        !party ? 'No party' : party.isFull ? 'Full' : friend.online ? 'Invite' : 'Offline',
      );
    });

    // Overflow notice when the list exceeds what fits on screen.
    if (friends.length > MAX_ROWS) {
      this.hintLabel.setText(`+${friends.length - MAX_ROWS} more in your list`);
      this.hintLabel.setColor(THEME.accent);
    } else {
      this.hintLabel.setText('Tip: invite a friend, then let them invite you back.');
      this.hintLabel.setColor(THEME.textFaint);
    }
  }

  /**
   * Build one pooled friend row: background (+ presence dot), name, a "×"
   * remove button and the one-click Invite button.
   * @param {number} index
   * @returns {object} Pooled row entry.
   */
  _createRow(index) {
    const scene = this.scene;
    const depth = this.depth + 2;
    const x = this.panel.x + 20;
    const w = this.panel.width - 40;
    const y = this.listTop + index * (ROW_H + ROW_GAP);

    const bg = scene.add.graphics();
    bg.fillStyle(0x0b1424, 0.9);
    bg.fillRoundedRect(0, 0, w, ROW_H, 8);
    bg.lineStyle(1, THEME.panelBorder, 0.5);
    bg.strokeRoundedRect(0, 0, w, ROW_H, 8);

    const name = scene.add.text(32, ROW_H / 2, 'Friend', FONTS.body).setOrigin(0, 0.5);

    const entry = { bg, name, friend: null };

    // Both buttons are created in CONTAINER space (origin 0,0 panel-relative)
    // and then re-parented into the row, so they travel with it on re-render.
    entry.remove = new Button(scene, {
      x: w - 92,
      y: ROW_H / 2,
      width: 26,
      height: 26,
      label: '×',
      skin: 'ghost',
      fontSize: '17px',
      depth,
      onClick: () => this._onRemove(entry),
    });

    entry.invite = new Button(scene, {
      x: w - 34,
      y: ROW_H / 2,
      width: 62,
      height: 30,
      label: 'Invite',
      skin: 'primary',
      fontSize: '12px',
      depth,
      onClick: () => this._onInvite(entry),
    });

    entry.row = scene.add.container(x, y, [bg, name]).setScrollFactor(0).setDepth(depth);
    // Re-parent the button parts so the row container owns their transforms.
    entry.row.add([
      entry.remove.zone, entry.remove.bg, entry.remove.label,
      entry.invite.zone, entry.invite.bg, entry.invite.label,
    ]);

    return entry;
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * @param {string} text
   * @returns {void}
   */
  _onAdd(text) {
    const query = String(text || '').trim();
    if (!query) {
      this.net.setNotice('error', 'Enter a friend name or ID first.');
      return;
    }
    this.net.addFriend(query).then((res) => {
      // Clear the box only on success so a typo is not silently discarded.
      if (res?.ok) this.addField.setValue('', { silent: true });
    });
  }

  /**
   * @param {object} entry - Pooled row entry.
   * @returns {void}
   */
  _onRemove(entry) {
    if (entry.friend) this.net.removeFriend(entry.friend);
  }

  /**
   * @param {object} entry - Pooled row entry.
   * @returns {void}
   */
  _onInvite(entry) {
    if (entry.friend) this.net.inviteFriend(entry.friend);
  }

  /** @returns {void} */
  destroy() {
    this.panel.destroy();
    this.addField.destroy();
    this.addButton.destroy();
    this.emptyLabel.destroy();
    this.countLabel.destroy();
    this.hintLabel.destroy();
    this.rows.forEach((r) => {
      r.remove.destroy();
      r.invite.destroy();
      r.row.destroy();
    });
  }
}

export default FriendsPanel;
