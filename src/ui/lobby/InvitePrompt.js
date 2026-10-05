/**
 * Astral Zero — InvitePrompt (incoming party invite).
 * ===========================================================
 * When a friend invites us, the server pushes `party_invited`. This widget
 * slides in as a modal-ish banner in the middle of the lobby with the shared
 * code and Accept / Decline buttons.
 *
 * Accept simply joins the code that came with the invite — that is exactly
 * what the backend expects (`party_join`), so there is no extra "accept"
 * round-trip to model.
 *
 * It auto-dismisses after `timeoutMs` so an invite can never block the lobby
 * forever if the player walks away from the keyboard.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { Panel } from '../widgets/Panel.js';
import { Button } from '../widgets/Button.js';

export class InvitePrompt {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} [opts.x] - Centre X.
   * @param {number} [opts.y] - Centre Y.
   * @param {import('../../net/NetworkManager.js').NetworkManager} opts.net
   * @param {number} [opts.depth]
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.net = opts.net;
    this.depth = opts.depth ?? 200;
    this.cx = opts.x ?? 640;
    this.cy = opts.y ?? 300;
    this.w = 420;
    this.h = 176;

    this.panel = new Panel(scene, {
      x: this.cx - this.w / 2,
      y: this.cy - this.h / 2,
      width: this.w,
      height: this.h,
      title: 'PARTY INVITE',
      accent: THEME.panelBorderBright,
      depth: this.depth,
    });

    this.body = scene.add
      .text(this.cx, this.cy - 26, '', { ...FONTS.body, align: 'center' })
      .setOrigin(0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.codeText = scene.add
      .text(this.cx, this.cy + 4, '', { ...FONTS.code, fontSize: '28px', fontStyle: '700' })
      .setOrigin(0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.accept = new Button(scene, {
      x: this.cx - 84,
      y: this.cy + this.h / 2 - 34,
      width: 150,
      height: 44,
      label: 'Join Party',
      skin: 'primary',
      depth: this.depth + 2,
      onClick: () => this._onAccept(),
    });

    this.decline = new Button(scene, {
      x: this.cx + 84,
      y: this.cy + this.h / 2 - 34,
      width: 150,
      height: 44,
      label: 'Decline',
      skin: 'ghost',
      depth: this.depth + 2,
      onClick: () => this._onDecline(),
    });

    /** @type {Phaser.Time.TimerEvent|null} */
    this._timer = null;
    this.setVisible(false);
  }

  /**
   * Show the prompt for an invite from `party_invited`.
   * @param {{code: string, fromName: string, memberCount: number}} invite
   * @returns {void}
   */
  present(invite) {
    if (!invite?.code) return;

    this.body.setText(`${invite.fromName} invited you (${invite.memberCount}/4 in party)`);
    this.codeText.setText(invite.code);
    this.setVisible(true);

    // Pop-in so the prompt is noticed.
    this.panel.bg.setAlpha(0);
    this.scene.tweens.add({ targets: this.panel.bg, alpha: 1, duration: 160 });

    // Auto-dismiss so the lobby is never blocked by a stale invite.
    this._timer?.remove();
    this._timer = this.scene.time.delayedCall(15000, () => this._onDecline());
  }

  /** @param {boolean} visible @returns {void} */
  setVisible(visible) {
    this.panel.setVisible(visible);
    this.body.setVisible(visible);
    this.codeText.setVisible(visible);
    this.accept.setVisible(visible);
    this.decline.setVisible(visible);
    if (!visible) this._timer?.remove();
  }

  /** @returns {void} */
  _onAccept() {
    this.setVisible(false);
    this.net.acceptInvite();
  }

  /** @returns {void} */
  _onDecline() {
    this.setVisible(false);
    this.net.declineInvite();
  }

  /** @returns {void} */
  destroy() {
    this._timer?.remove();
    this.panel.destroy();
    this.body.destroy();
    this.codeText.destroy();
    this.accept.destroy();
    this.decline.destroy();
  }
}

export default InvitePrompt;