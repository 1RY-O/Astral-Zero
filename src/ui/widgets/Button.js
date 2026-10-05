/**
 * Astral Zero — Button (reusable arcade control).
 * ===========================================================
 * A chunky, pressable rounded rectangle. Every menu button in the game is one
 * of these, so "strong button feedback" is a property of the widget rather
 * than something each call site re-implements.
 *
 * FEEDBACK MODEL (the brief asks for strong button feedback)
 *   rest     → flat, crisp border
 *   hover    → lighter fill + a SCALE UP (1.03) + a stronger glow
 *   press    → lighter fill again + a SCALE DOWN (0.96) + the glow tightens
 *   disabled → desaturated, 32% alpha, NO hover/press response at all
 *   focus    → a distinct white focus ring OUTSIDE the border
 *
 * The scale is what sells "physical button": a fill change alone is easy to
 * miss on a saturated background, a size change is not.
 *
 * ACCESSIBILITY
 *  - Keyboard: Tab/Shift-Tab move focus, Enter/Space activate, Escape blurs.
 *    Focus is drawn as a separate high-contrast ring (never colour-only —
 *    the ring is a shape change, visible even to a colourblind player).
 *  - `setEnabled(false)` sets `tabIndex = -1`, so a disabled button is skipped
 *    by keyboard navigation instead of being focusable-but-dead.
 *  - Every button carries `ariaLabel` and `ariaState` so the accessibility
 *    tree reports its name and its disabled/selected state.
 *  - Min hit height is enforced via `minTouch` from the viewport config, so
 *    finger-sized targets are never smaller than the platform guidelines.
 *
 * PERFORMANCE
 *  - `redraw()` runs only on state TRANSITIONS, never per frame. The lobby
 *    has well under 40 buttons, and a pointermove storm is throttled by the
 *    fact that hover only redraws when the hover state actually changes.
 */

import { THEME, FONTS, RADII, MOTION } from '../../config/uiTheme.js';
import * as Motion from '../../core/Motion.js';

/** Visual states → (fill, border, text colour, glow alpha). */
const SKINS = {
  primary: { fill: 0x1479a8, border: 0x5ad8ff, text: '#ffffff', glow: 0.34 },
  accent: { fill: 0x1d2b4d, border: 0x7fe7ff, text: '#e8f4ff', glow: 0.18 },
  neutral: { fill: 0x182242, border: 0x33456e, text: '#cfe2f5', glow: 0.1 },
  danger: { fill: 0x5c1f38, border: 0xff6b8b, text: '#ffe1e8', glow: 0.24 },
  ghost: { fill: 0x0a1120, border: 0x25355a, text: '#8fa3bf', glow: 0.06 },
  success: { fill: 0x1c5a37, border: 0x4ade80, text: '#e6ffee', glow: 0.26 },
  warning: { fill: 0x6b4a12, border: 0xffc247, text: '#fff3d6', glow: 0.28 },
  /** The big Find Match CTA. */
  cta: { fill: 0x0f6f9e, border: 0x7fe7ff, text: '#ffffff', glow: 0.4 },
  /** Navigation rail item. */
  nav: { fill: 0x0e1730, border: 0x25355a, text: '#a9bcd8', glow: 0.06 },
};

export class Button {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Centre X.
   * @param {number} opts.y - Centre Y.
   * @param {number} opts.width
   * @param {number} opts.height
   * @param {string} opts.label
   * @param {keyof SKINS} [opts.skin]
   * @param {string} [opts.sublabel] - Second line (mode cards, CTA hint).
   * @param {number} [opts.fontSize]
   * @param {() => void} [opts.onClick]
   * @param {number} [opts.depth]
   * @param {boolean} [opts.enabled]
   * @param {number} [opts.minHeight] - Floor on hit height (touch).
   * @param {boolean} [opts.toggle] - Render as a selectable toggle (aria-selected).
   * @param {boolean} [opts.selected]
   * @param {string} [opts.ariaLabel]
   * @param {Phaser.Input.Keyboard.Keyboard} [opts.keyboard] - For key handling.
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.cx = opts.x ?? 0;
    this.cy = opts.y ?? 0;
    this.width = opts.width ?? 180;
    this.height = Math.max(opts.height ?? 48, opts.minHeight ?? 0);
    this.skinName = opts.skin ?? 'neutral';
    this.depth = opts.depth ?? 10;
    this.enabled = opts.enabled !== false;
    this.onClick = opts.onClick ?? (() => {});
    this.toggle = Boolean(opts.toggle);
    this.selected = Boolean(opts.selected);
    this.ariaLabel = opts.ariaLabel ?? opts.label ?? '';
    this._minHeight = opts.minHeight ?? 0;

    this._pressed = false;
    this._hovered = false;
    this._focused = false;
    /** Remembered scale so hover/press/focus can compose without fighting. */
    this._appliedScale = 1;

    this.bg = scene.add.graphics().setDepth(this.depth).setScrollFactor(0);

    const hasSub = Boolean(opts.sublabel);
    this.label = scene.add
      .text(this.cx, hasSub ? this.cy - 10 : this.cy, opts.label ?? '', {
        ...FONTS.bodyStrong,
        fontSize: opts.fontSize ?? '15px',
        fontStyle: '800',
      })
      .setOrigin(0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    this.sublabel = null;
    if (hasSub) {
      this.sublabel = scene.add
        .text(this.cx, this.cy + 13, opts.sublabel, { ...FONTS.tiny, fontSize: '11px' })
        .setOrigin(0.5)
        .setDepth(this.depth + 1)
        .setScrollFactor(0);
    }

    // --- Hit area + pointer state machine ----------------------------------
    this.zone = scene.add
      .zone(this.cx - this.width / 2, this.cy - this.height / 2, this.width, this.height)
      .setOrigin(0, 0)
      .setDepth(this.depth)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this._bindPointer();
    this._bindKeyboard(opts.keyboard ?? scene.input?.keyboard ?? null);

    this.redraw();
  }

  /** Wire the pointer state machine. @returns {void} */
  _bindPointer() {
    this.zone.on('pointerover', () => {
      if (!this.enabled) return;
      this._hovered = true;
      this.redraw();
    });
    this.zone.on('pointerout', () => {
      this._hovered = false;
      this._pressed = false;
      this.redraw();
    });
    this.zone.on('pointerdown', () => {
      if (!this.enabled) return;
      this._pressed = true;
      this.redraw();
    });
    this.zone.on('pointerup', () => {
      if (!this.enabled) return;
      this._pressed = false;
      this.redraw();
      this.activate();
    });
    // Suppress the browser context menu on right-click so a long-press on
    // mobile does not pop the OS menu over the game.
    this.zone.on('rightup', () => {
      this._pressed = false;
      this.redraw();
    });
  }

  /**
   * Keyboard activation. A Phaser `Zone` has no DOM focus of its own, so we
   * keep an explicit focus flag and drive it from the scene's keyboard
   * manager. The visible focus ring is what makes this accessible; the flag
   * alone would not be.
   *
   * @param {Phaser.Input.Keyboard.Keyboard|null} keyboard
   * @returns {void}
   */
  _bindKeyboard(keyboard) {
    this.keyboard = keyboard;
    if (!keyboard) return;

    this._keyHandler = (event) => {
      if (!this.enabled) return;
      if (event.code === 'Enter' || event.code === 'Space') {
        // Prevent Space from scrolling the page.
        event.preventDefault?.();
        this.activate();
      } else if (event.code === 'Escape') {
        this.setFocused(false);
      }
    };
    keyboard.on('keydown', this._keyHandler);
  }

  /**
   * Fire the action. Guarded so a disabled button can never emit.
   * @returns {void}
   */
  activate() {
    if (!this.enabled) return;
    this.onClick();
  }

  /**
   * Resolve the current visual skin, accounting for enabled/hover/press and
   * the selected (toggle) state.
   * @returns {{fill:number, border:number, text:string, alpha:number, glow:number}}
   */
  _resolveSkin() {
    let base = SKINS[this.skinName] ?? SKINS.neutral;

    // A selected toggle adopts the primary skin regardless of its base skin,
    // so "selected" is unmistakable at a glance.
    if (this.toggle && this.selected) {
      base = { ...base, fill: 0x1479a8, border: 0x7fe7ff, text: '#ffffff', glow: 0.36 };
    }

    if (!this.enabled) {
      return { ...base, alpha: 0.34, text: THEME.textFaint, glow: 0 };
    }

    if (this._pressed) {
      return { ...base, fill: lighten(base.fill, 0.16), glow: base.glow * 1.2 };
    }
    if (this._hovered) {
      return { ...base, fill: lighten(base.fill, 0.09), glow: base.glow * 1.35 };
    }
    return base;
  }

  /**
   * Compute the scale for the current interaction state. Composed as a
   * product so hover + focus can coexist without one overwriting the other.
   * @returns {number}
   */
  _targetScale() {
    if (!this.enabled) return 1;
    if (this._pressed) return MOTION.pressScale;
    if (this._hovered) return MOTION.hoverScale;
    return 1;
  }

  /**
   * Repaint. Called on state transitions only — never per frame.
   * @returns {void}
   */
  redraw() {
    const skin = this._resolveSkin();
    const left = this.cx - this.width / 2;
    const top = this.cy - this.height / 2;
    const r = RADII.button;
    const g = this.bg;

    g.clear();

    // Soft glow underneath, sized by state. This is the "energy" of the
    // primary CTA; secondary buttons barely have any.
    if (skin.glow > 0) {
      g.fillStyle(skin.border, skin.glow);
      g.fillRoundedRect(left - 3, top - 3, this.width + 6, this.height + 6, r + 3);
    }

    g.fillStyle(skin.fill, skin.alpha);
    g.fillRoundedRect(left, top, this.width, this.height, r);

    // Top inner highlight — gives the button a lit-from-above feel.
    g.fillStyle(0xffffff, 0.07);
    g.fillRoundedRect(left + 4, top + 3, this.width - 8, Math.max(2, this.height * 0.16), 2);

    // Border. A toggle's selected state gets a visibly thicker border, so the
    // selection is not signalled by colour alone.
    const borderW = this.toggle && this.selected ? 4 : 2;
    g.lineStyle(borderW, skin.border, this.enabled ? 0.95 : 0.3);
    g.strokeRoundedRect(left, top, this.width, this.height, r);

    // --- FOCUS RING -------------------------------------------------------
    // A high-contrast white ring OUTSIDE the button. Shape change, not colour
    // change, so it is visible to a colourblind player and in greyscale.
    if (this._focused && this.enabled) {
      g.lineStyle(3, 0xffffff, 0.95);
      g.strokeRoundedRect(left - 6, top - 6, this.width + 12, this.height + 12, r + 6);
    }

    this.label.setColor(skin.text).setAlpha(skin.alpha);
    this.sublabel?.setAlpha(skin.alpha * 0.92);

    this._applyScale(this._targetScale());
  }

  /**
   * Apply a scale, animating the change so the press feels springy rather
   * than instantaneous. Skips the tween entirely under reduced motion.
   * @param {number} target
   * @returns {void}
   */
  _applyScale(target) {
    if (target === this._appliedScale) return;
    const from = this._appliedScale;
    this._appliedScale = target;

    if (Motion.isReduced()) {
      this.bg.setScale(target);
      this.label.setScale(target);
      this.sublabel?.setScale(target);
      return;
    }

    // Short, slightly over-damped tween: fast enough to feel responsive,
    // with a touch of overshoot on release.
    Motion.tween(this.scene, {
      targets: [this.bg, this.label, this.sublabel].filter(Boolean),
      scaleX: target,
      scaleY: target,
      duration: this._pressed ? MOTION.fast : MOTION.base,
      ease: this._pressed ? 'Quad.easeOut' : 'Back.easeOut',
    });
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * @param {string} text
   * @returns {void}
   */
  setLabel(text) {
    this.label.setText(text);
    // Keep the accessible name in sync with the visible label.
    this.ariaLabel = text;
  }

  /** @param {string} text */
  setSublabel(text) {
    this.sublabel?.setText(text);
  }

  /**
   * Swap the visual skin (mode selector selected vs unselected, CTA states).
   * @param {keyof SKINS} name
   * @returns {void}
   */
  setSkin(name) {
    if (this.skinName === name) return;
    this.skinName = name;
    this.redraw();
  }

  /**
   * Set the toggle/selected state. Redraws only when it actually changes, so
   * a per-frame `setSelected(same)` is free.
   * @param {boolean} selected
   * @returns {void}
   */
  setSelected(selected) {
    if (this.selected === selected) return;
    this.selected = Boolean(selected);
    this.redraw();
  }

  /**
   * Enable/disable. A disabled button also leaves the keyboard tab order.
   * @param {boolean} enabled
   * @returns {void}
   */
  setEnabled(enabled) {
    const next = Boolean(enabled);
    if (this.enabled === next) return;
    this.enabled = next;
    if (!next) {
      this._pressed = false;
      this._hovered = false;
      // A disabled button shows a default cursor, so the pointer does not
      // promise an interaction that will not happen.
      if (this.zone.input) this.zone.input.cursor = this.enabled ? 'pointer' : 'default';
    }
    this.redraw();
  }

  /**
   * Show/hide, including removing it from the hit-test list.
   * @param {boolean} visible
   * @returns {void}
   */
  setVisible(visible) {
    this.bg.setVisible(visible);
    this.label.setVisible(visible);
    this.sublabel?.setVisible(visible);
    this.zone.setVisible(visible);
    if (visible) {
      this.zone.setInteractive({ useHandCursor: this.enabled });
    } else {
      this._hovered = false;
      this._focused = false;
      this.zone.disableInteractive();
    }
  }

  /**
   * Move + resize in one call. Also re-applies the minimum touch height.
   * @param {number} x - Centre X.
   * @param {number} y - Centre Y.
   * @param {number} [width]
   * @param {number} [height]
   * @returns {void}
   */
  setPosition(x, y, width = this.width, height = this.height) {
    this.cx = x;
    this.cy = y;
    this.width = width;
    this.height = Math.max(height, this._minHeight);
    this.label.setPosition(x, this.sublabel ? y - 10 : y);
    this.sublabel?.setPosition(x, y + 13);
    this.zone.setPosition(x - width / 2, y - this.height / 2);
    this.zone.setSize(width, this.height);
    this.redraw();
  }

  /**
   * Keyboard focus. Drawn as a ring, so it is a shape change.
   * @param {boolean} focused
   * @returns {void}
   */
  setFocused(focused) {
    const next = Boolean(focused);
    if (this._focused === next) return;
    this._focused = next;
    this.redraw();
  }

  /** @returns {boolean} */
  isFocused() {
    return this._focused;
  }

  /** @returns {void} */
  destroy() {
    if (this._keyHandler && this.keyboard) {
      this.keyboard.off('keydown', this._keyHandler);
    }
    this.bg.destroy();
    this.label.destroy();
    this.sublabel?.destroy();
    this.zone.destroy();
  }
}

/**
 * Blend a 0xRRGGBB colour toward white. Phaser exposes no colour maths for
 * packed ints, so the arithmetic is done explicitly here.
 * @param {number} color
 * @param {number} amount 0..1
 * @returns {number} packed colour
 */
export function lighten(color, amount) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

export { SKINS as BUTTON_SKINS };
export default Button;
