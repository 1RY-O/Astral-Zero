import Phaser from 'phaser';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { THEME, FONTS, SURFACES } from '../config/uiTheme.js';
import { Button } from '../ui/widgets/Button.js';

/** localStorage key for the one-time first-match tutorial. */
export const TUTORIAL_KEY = 'astral-zero:first-tutorial';

/**
 * Load the tutorial flag. `false` = never shown → the overlay appears on the
 * player's first server-confirmed arena entry.
 * @returns {boolean}
 */
export function loadTutorialSeen() {
  try {
    const raw = window.localStorage.getItem(TUTORIAL_KEY);
    return raw === '1';
  } catch {
    return false; // private mode / blocked storage → show it once
  }
}

/**
 * Mark the tutorial as seen so it never appears again.
 * @returns {void}
 */
export function markTutorialSeen() {
  try {
    window.localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* non-fatal */
  }
}

/**
 * First-in-arena training overlay (shown once per device, on the first
 * server-confirmed arena entry). Launched alongside the Arena (not instead
 * of it) via `scene.launch`, so the match keeps running behind the dim.
 *
 * Teaches ONLY implemented controls (see InputManager KEY_BINDINGS +
 * ArenaScene fire/weapon bindings): move A/D/arrows, jump Space/W/up,
 * aim mouse, fire click/tap-hold, weapon Q, leave/reset, H to reopen.
 * There is no reload and no character abilities in this build, so the
 * briefing never mentions them.
 */
export class FirstTimeTutorial extends Phaser.Scene {
  constructor() {
    super('FirstTimeTutorial');
  }

  /** Step index. @type {number} */
  _index = 0;

  /** @returns {void} */
  create() {
    this._index = 0;
    this._steps = [
      { glyph: '◀ ▶', text: 'MOVE with A / D or the left and right arrows.' },
      { glyph: '▲', text: 'JUMP with SPACE, W or the up arrow.' },
      { glyph: '◎', text: 'AIM with the mouse — always tracking the cursor.' },
      { glyph: '●', text: 'FIRE with left click / tap. Hold for sustained fire. Switch weapon with Q.' },
      { glyph: '↻', text: 'Practice calm windows keep bots off you at first. Leave via the HUD Leave button, reset practice with ↻, reopen this briefing with H.' },
    ];
    this._build();
    this._showStep(0);
  }

  /** @returns {void} */
  _build() {
    // Dim the arena behind the overlay and swallow clicks meant for the game.
    this.background = this.add
      .rectangle(0, 0, GAME_CONFIG.width, GAME_CONFIG.height, SURFACES.scrim, 0.88)
      .setDepth(340)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive();

    this.title = this.add
      .text(GAME_CONFIG.width / 2, 52, 'YOUR FIRST MATCH', {
        ...FONTS.title,
        fontSize: '24px',
        color: THEME.textPrimary,
      })
      .setOrigin(0.5)
      .setDepth(360)
      .setScrollFactor(0);

    this.glyphText = this.add
      .text(GAME_CONFIG.width / 2, 150, '', {
        ...FONTS.title,
        fontSize: '54px',
        color: THEME.accent,
      })
      .setOrigin(0.5)
      .setDepth(360)
      .setScrollFactor(0);

    this.stepText = this.add
      .text(GAME_CONFIG.width / 2, 230, '', {
        ...FONTS.body,
        fontSize: '17px',
        color: THEME.textPrimary,
        align: 'center',
        wordWrap: { width: 560 },
      })
      .setOrigin(0.5, 0)
      .setDepth(360)
      .setScrollFactor(0);

    this.progressText = this.add
      .text(GAME_CONFIG.width / 2, 300, '', {
        ...FONTS.tiny,
        fontSize: '13px',
        color: THEME.textDim,
      })
      .setOrigin(0.5)
      .setDepth(360)
      .setScrollFactor(0);

    this.backButton = new Button(this, {
      x: GAME_CONFIG.width / 2 - 130,
      y: GAME_CONFIG.height - 96,
      width: 200,
      height: 46,
      label: 'BACK',
      skin: 'ghost',
      depth: 370,
      onClick: () => this._back(),
    });

    this.nextButton = new Button(this, {
      x: GAME_CONFIG.width / 2 + 130,
      y: GAME_CONFIG.height - 96,
      width: 200,
      height: 46,
      label: 'NEXT',
      skin: 'cta',
      depth: 370,
      onClick: () => this._next(),
    });

    this.skipButton = new Button(this, {
      x: GAME_CONFIG.width / 2,
      y: GAME_CONFIG.height - 40,
      width: 200,
      height: 34,
      label: 'Skip tutorial',
      skin: 'ghost',
      fontSize: '12px',
      depth: 370,
      onClick: () => this._skip(),
    });
  }

  /**
   * Render step `i` (clamped) with Back/Next/Done states.
   * @param {number} i
   * @returns {void}
   */
  _showStep(i) {
    const last = this._steps.length - 1;
    this._index = Math.max(0, Math.min(last, i));
    const step = this._steps[this._index];
    this.glyphText?.setText(step.glyph);
    this.stepText?.setText(step.text);
    this.progressText?.setText(`STEP ${this._index + 1} OF ${this._steps.length}`);
    this.backButton?.setEnabled(this._index > 0);
    this.backButton?.setVisible(this._index > 0);
    this.nextButton?.setLabel(this._index === last ? 'DONE' : 'NEXT');
  }

  /** @returns {void} */
  _next() {
    if (this._index >= this._steps.length - 1) this._dismiss();
    else this._showStep(this._index + 1);
  }

  /** @returns {void} */
  _back() {
    this._showStep(this._index - 1);
  }

  /** Skipping still marks seen — the player chose not to be taught. */
  _skip() {
    this._dismiss();
  }

  /** @returns {void} */
  _dismiss() {
    markTutorialSeen();
    try {
      this.scene.stop();
    } catch {
      /* already stopping */
    }
  }
}
