/**
 * Astral Zero — TextField (reusable lobby text input).
 * ===========================================================
 * Phaser has no DOM-free text entry that behaves like an `<input>`, so this
 * widget keeps the *display* in Phaser and the *typing* in a hidden, real
 * HTML input. That is what makes the field behave natively: OS IME support,
 * paste, mobile keyboards, autocorrect off, and no per-key `keydown` soup.
 *
 * HOW IT WORKS
 *  1. A single hidden `<input>` element is created (and REUSED across every
 *     field in the scene) so only one element ever holds focus.
 *  2. Clicking the Phaser-drawn box focuses that hidden input and positions
 *     it over the box, so the real caret and mobile keyboard land correctly.
 *  3. Every `input` event is filtered through `sanitise` + `maxLength`, then
 *     re-rendered into the Phaser text and `onChange` fires.
 *  4. Enter fires `onSubmit`; Escape fires `onCancel`; blur ends the session.
 */

import { THEME, FONTS } from '../../config/uiTheme.js';

/**
 * Manager for the single hidden `<input>` shared by all TextFields in a scene.
 * Keeping it centralised means only one DOM node exists per page.
 */
class HiddenInput {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {import('./TextField.js').TextField|null} */
    this.owner = null;

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.setAttribute('autocorrect', 'off');
    // Visually hidden but still focusable and still a real text field.
    input.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'width:1px',
      'height:1px',
      'opacity:0',
      'z-index:1',
      'pointer-events:none',
      'border:0',
      'background:transparent',
      'color:transparent',
    ].join(';');

    this.input = input;
    scene.game.canvas.parentElement?.appendChild(input);

    input.addEventListener('input', () => this.owner?._handleInput());
    input.addEventListener('focus', () => this.owner?._handleFocus());
    input.addEventListener('blur', () => this.owner?._handleBlur());
    input.addEventListener('keydown', (event) => {
      if (!this.owner) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        this.owner._handleSubmit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.owner._handleCancel();
      }
      // Stop global game keys (Space = jump, arrows = move) from firing while
      // the player is typing a party code or a friend name.
      event.stopPropagation();
    });
  }

  /**
   * Mirror the Phaser-drawn box onto the real input so the OS caret, text
   * selection and mobile keyboard focus ring land in the right place.
   * @param {import('./TextField.js').TextField} field
   * @returns {void}
   */
  positionOver(field) {
    const bounds = this.scene.scale.canvasBounds;
    const { x: sx, y: sy } = this.scene.scale.displayScale;
    // `field` is drawn with scrollFactor 0, so the canvas rect plus the
    // scaled game coords place it exactly over the Phaser-drawn box.
    this.input.style.left = `${bounds.left + field.x * sx}px`;
    this.input.style.top = `${bounds.top + field.y * sy}px`;
    this.input.style.width = `${Math.max(1, field.width * sx)}px`;
    this.input.style.height = `${Math.max(1, field.height * sy)}px`;
  }

  /** @param {import('./TextField.js').TextField} field @returns {void} */
  focus(field) {
    this.owner = field;
    this.positionOver(field);
    this.input.value = field.value;
    this.input.focus({ preventScroll: true });
  }

  /** @returns {void} */
  blur() {
    this.input.blur();
  }

  /** @returns {void} */
  destroy() {
    this.input.remove();
  }
}

/** One hidden input per scene, created lazily on first TextField. */
const hiddenInputs = new WeakMap();

/**
 * @param {Phaser.Scene} scene
 * @returns {HiddenInput}
 */
function hiddenInputFor(scene) {
  let shared = hiddenInputs.get(scene);
  if (!shared) {
    shared = new HiddenInput(scene);
    hiddenInputs.set(scene, shared);
  }
  return shared;
}

export class TextField {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Left edge.
   * @param {number} opts.y - Top edge.
   * @param {number} opts.width
   * @param {number} [opts.height]
   * @param {string} [opts.placeholder]
   * @param {string} [opts.value] - Initial value.
   * @param {number} [opts.maxLength]
   * @param {(text: string) => string} [opts.sanitise] - Live filter.
   * @param {(text: string) => void} [opts.onChange]
   * @param {(text: string) => void} [opts.onSubmit]
   * @param {() => void} [opts.onCancel]
   * @param {number} [opts.depth]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.width = opts.width ?? 240;
    this.height = opts.height ?? 44;
    this.placeholder = opts.placeholder ?? '';
    this.maxLength = opts.maxLength ?? 24;
    this.sanitise = opts.sanitise ?? ((t) => t);
    this.onChange = opts.onChange ?? (() => {});
    this.onSubmit = opts.onSubmit ?? (() => {});
    this.onCancel = opts.onCancel ?? (() => {});
    this.depth = opts.depth ?? 10;

    /** Current field text. */
    this.value = opts.value ?? '';
    /** True while the player is typing in this field. */
    this.focused = false;

    this.bg = scene.add.graphics().setDepth(this.depth).setScrollFactor(0);

    this.label = scene.add
      .text(this.x + 14, this.y + this.height / 2, '', {
        ...FONTS.body,
        fontFamily: 'Consolas, monospace',
        fontSize: '16px',
      })
      .setOrigin(0, 0.5)
      .setDepth(this.depth + 1)
      .setScrollFactor(0);

    // Click target: a Zone (not the text) so the whole box is clickable.
    this.zone = scene.add
      .zone(this.x, this.y, this.width, this.height)
      .setOrigin(0, 0)
      .setDepth(this.depth + 1)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', () => this.focus());

    this.hidden = hiddenInputFor(scene);
    this.redraw();
  }

  /**
   * Focus this field, blurring whichever other field owned the input.
   * @returns {void}
   */
  focus() {
    if (this.hidden.owner && this.hidden.owner !== this) {
      this.hidden.owner._setFocused(false);
    }
    this.hidden.focus(this);
    this._setFocused(true);
  }

  /**
   * @param {boolean} focused
   * @returns {void}
   */
  _setFocused(focused) {
    this.focused = focused;
    this.redraw();
  }

  /**
   * Read the real input, sanitise it, push it back if the filter changed it,
   * then notify listeners.
   * @returns {void}
   */
  _handleInput() {
    const raw = this.hidden.input.value ?? '';
    const clean = this.sanitise(raw).slice(0, this.maxLength);
    // If sanitising removed characters, write the clean value back into the
    // DOM so the caret does not fight the filter (e.g. "!" in a code field).
    if (clean !== raw) this.hidden.input.value = clean;
    if (clean === this.value) return;
    this.value = clean;
    this.redraw();
    this.onChange(clean);
  }

  /** @returns {void} */
  _handleFocus() {
    if (this.hidden.owner === this) this._setFocused(true);
  }

  /** @returns {void} */
  _handleBlur() {
    this._setFocused(false);
  }

  /** @returns {void} */
  _handleSubmit() {
    this._setFocused(false);
    this.onSubmit(this.value);
  }

  /** @returns {void} */
  _handleCancel() {
    this._setFocused(false);
    this.onCancel();
  }
/**
   * Repaint the box: background, border (highlighted while focused), the text
   * or the dimmed placeholder, plus a caret bar while focused.
   * @returns {void}
   */
  redraw() {
    const g = this.bg;
    g.clear();
    g.fillStyle(this.focused ? THEME.inputBg : 0x0a1223, this.focused ? 1 : 0.8);
    g.fillRoundedRect(this.x, this.y, this.width, this.height, 8);
    g.lineStyle(
      this.focused ? 2 : 1,
      this.focused ? THEME.panelBorderBright : THEME.panelBorder,
      1,
    );
    g.strokeRoundedRect(this.x, this.y, this.width, this.height, 8);

    const hasText = this.value.length > 0;
    this.label.setText(hasText ? this.value : this.placeholder);
    this.label.setColor(hasText ? THEME.textPrimary : THEME.textFaint);

    // A blinking caret makes focus visible; without it the hidden-input
    // approach would look like a dead box.
    if (this.focused) {
      const caretX = this.x + 14 + this.label.width + 2;
      g.fillStyle(THEME.accent, 0.9);
      g.fillRect(caretX, this.y + this.height / 2 - 10, 2, 20);
    }
  }

  /**
   * Replace the value programmatically.
   * @param {string} text
   * @param {{silent?: boolean}} [opts] - `silent` skips `onChange`.
   * @returns {void}
   */
  setValue(text, { silent = false } = {}) {
    const clean = this.sanitise(String(text ?? '')).slice(0, this.maxLength);
    if (clean === this.value) return;
    this.value = clean;
    if (this.focused) this.hidden.input.value = clean;
    this.redraw();
    if (!silent) this.onChange(clean);
  }

  /** @returns {string} */
  getValue() {
    return this.value;
  }

  /**
   * Show/hide the whole field. A hidden field is also made non-interactive so
   * the lobby cannot click an invisible box that is not on screen (the party
   * panel toggles this field when switching between the two party states).
   * @param {boolean} visible
   * @returns {void}
   */
  setVisible(visible) {
    this.bg.setVisible(visible);
    this.label.setVisible(visible);
    this.zone.setVisible(visible);
    if (visible) {
      this.zone.setInteractive({ useHandCursor: true });
      return;
    }
    // Drop focus first: leaving a hidden field focused would keep stealing
    // keystrokes (and keep the OS keyboard up) on mobile.
    if (this.focused) this.blur();
    this.zone.disableInteractive();
  }

  /** Drop focus (also used before switching scenes). @returns {void} */
  blur() {
    this._setFocused(false);
    if (this.hidden.owner === this) this.hidden.blur();
  }

  /** @returns {void} */
  destroy() {
    if (this.hidden.owner === this) {
      this.hidden.blur();
      this.hidden.owner = null;
    }
    this.bg.destroy();
    this.label.destroy();
    this.zone.destroy();
  }
}

export default TextField;