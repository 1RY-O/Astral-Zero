/**
 * Astral Zero — ProfileCard (lobby header identity).
 * ===========================================================
 * Shows WHO you are: janitor name, and the two stats the backend actually
 * tracks per player.
 *
 * NO INVENTED CURRENCIES
 * The brief asks for "currencies/resources if they actually exist". They do
 * not. The backend has no shop, no coins and no premium currency, so this card
 * shows only real server data: the display name, and the mode/party context.
 * When a future phase adds real progression, that is where it goes — the card
 * is explicitly built to be extended, not to show placeholder zeroes.
 *
 * The name is a real interactive control (click to rename via the NameGate
 * flow), because a player who wants a different tag must be able to get one.
 */

import { THEME, FONTS, RADII } from '../../config/uiTheme.js';

export class ProfileCard {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Left edge.
   * @param {number} opts.y - Top edge.
   * @param {number} opts.width
   * @param {number} [opts.height]
   * @param {import('../../net/NetworkManager.js').NetworkManager} opts.net
   * @param {number} [opts.depth]
   * @param {() => void} [opts.onRename]
   */
  constructor(scene, { x, y, width, height = 58, net, depth = 12, onRename }) {
    this.scene = scene;
    this.net = net;
    this.onRename = onRename ?? (() => {});
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.depth = depth;

    this.bg = scene.add.graphics().setDepth(depth).setScrollFactor(0);

    // Avatar disc: a small orbit glyph standing in for a profile picture,
    // tinted with the brand cyan. Deterministic per name so it feels personal.
    this.avatar = scene.add.graphics().setDepth(depth + 1).setScrollFactor(0);
    this._drawAvatar();

    this.nameText = scene.add
      .text(x + 48, y + height / 2 - 8, 'JANITOR', { ...FONTS.bodyStrong, fontSize: '15px' })
      .setOrigin(0, 0.5)
      .setDepth(depth + 1)
      .setScrollFactor(0);

    this.subText = scene.add
      .text(x + 48, y + height / 2 + 11, '', { ...FONTS.tiny, fontSize: '11px' })
      .setOrigin(0, 0.5)
      .setDepth(depth + 1)
      .setScrollFactor(0);

    // Rename affordance. Small but a real 28px hit target.
    this.editBtn = scene.add
      .zone(x + width - 26, y + height / 2, 28, 28)
      .setOrigin(0.5)
      .setDepth(depth + 2)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.editGlyph = scene.add
      .text(x + width - 26, y + height / 2, '✎', { ...FONTS.body, fontSize: '14px', color: THEME.textDim })
      .setOrigin(0.5)
      .setDepth(depth + 2)
      .setScrollFactor(0);

    this.editBtn.on('pointerover', () => this.editGlyph.setColor(THEME.accent));
    this.editBtn.on('pointerout', () => this.editGlyph.setColor(THEME.textDim));
    this.editBtn.on('pointerup', () => this.onRename());

    this.refresh();
  }

  /**
   * Avatar disc + orbit ring + initial. Uses the brand mark language at a
   * small size, tinted by a simple hash of the name so different janitors look
   * different without needing real art.
   * @returns {void}
   */
  _drawAvatar() {
    const g = this.avatar;
    const cx = this.x + 26;
    const cy = this.y + this.height / 2;
    const r = 18;

    const name = this.net.state.player?.name ?? '';
    // Deterministic hue pick from the brand accents (cyan, amber, violet, green)
    // so the palette stays on-brand rather than using arbitrary HSL.
    const accents = [0x5ad8ff, 0xffc247, 0xb58cff, 0x4ade80];
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    const tint = accents[hash % accents.length];

    g.clear();
    g.fillStyle(0x0a1120, 1);
    g.fillCircle(cx, cy, r);
    g.lineStyle(2, tint, 0.9);
    g.strokeCircle(cx, cy, r);
    g.lineStyle(2, tint, 0.35);
    g.beginPath();
    g.arc(cx, cy, r * 0.62, Math.PI * 0.2, Math.PI * 1.7, false);
    g.strokePath();
    g.fillStyle(tint, 1);
    g.fillCircle(cx, cy, 3);
  }

  /**
   * Re-render name + context line from live state.
   * @returns {void}
   */
  refresh() {
    const state = this.net.state;
    const name = state.player?.name ?? 'JANITOR';

    this.nameText.setText(name.toUpperCase());

    // The context line is REAL state, not decoration: what you are about to do.
    let sub = 'Solo · pick a mode';
    if (state.party) {
      sub = `${state.party.isLeader ? 'Leading' : 'In'} party ${state.party.code ?? ''}`.trim();
    } else if (state.queue) {
      sub = 'Searching for a match…';
    } else if (state.room) {
      sub = 'In a match';
    }
    this.subText.setText(sub);

    this._drawAvatar();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} [width]
   * @returns {void}
   */
  setPosition(x, y, width = this.width) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.nameText.setPosition(x + 48, y + this.height / 2 - 8);
    this.subText.setPosition(x + 48, y + this.height / 2 + 11);
    this.editBtn.setPosition(x + width - 26, y + this.height / 2);
    this.editGlyph.setPosition(x + width - 26, y + this.height / 2);
    this._drawAvatar();
  }

  /** @returns {void} */
  destroy() {
    this.bg.destroy();
    this.avatar.destroy();
    this.nameText.destroy();
    this.subText.destroy();
    this.editGlyph.destroy();
    this.editBtn.destroy();
  }
}

export default ProfileCard;
