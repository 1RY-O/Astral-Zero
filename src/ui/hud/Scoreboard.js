/**
 * Astral Zero — Scoreboard (FRONTEND).
 * ============================================================
 * The Tab-to-peek table of everyone in the match.
 *
 * LAYOUT DECISION
 * TDM gets two side-by-side columns (one per team) because a merged list would
 * make "who is on my team" need mental arithmetic. Every other mode gets a
 * single column sorted by kills.
 *
 * DATA HONESTY
 * The server owns kills/deaths. Until it sends `score_update`, the scoreboard
 * renders REAL values it has received and shows a dash where a number is
 * unknown — it never invents zeroes, because a fabricated score reads as "you
 * have 0 kills" when it actually means "we do not know yet".
 */

import { THEME, FONTS } from '../../config/uiTheme.js';
import { TEAMS } from '../../config/lobbyConfig.js';

export class Scoreboard {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} [opts.depth]
   * @param {number} [opts.width]
   * @param {number} [opts.height]
   */
  constructor(scene, { depth = 240, width = 660, height = 400 } = {}) {
    this.scene = scene;
    this.depth = depth;
    this.width = width;
    this.height = height;

    this.container = scene.add.container(640, 360).setDepth(depth).setScrollFactor(0).setVisible(false);

    this.plate = scene.add
      .rectangle(0, 0, width, height, THEME.panel, 0.96)
      .setStrokeStyle(2, THEME.panelBorder)
      .setOrigin(0.5);

    this.title = scene.add
      .text(0, -height / 2 + 26, 'SCOREBOARD', { ...FONTS.h2, fontSize: '20px' })
      .setOrigin(0.5);

    this.body = scene.add.text(0, -height / 2 + 62, '', { ...FONTS.body }).setOrigin(0.5, 0);

    this.container.add([this.plate, this.title, this.body]);
  }

  /**
   * Rebuild the table from a roster.
   *
   * @param {object} data
   * @param {object[]} data.entities - Everyone in the match (humans + bots).
   * @param {string} data.mode
   * @param {string} data.localId
   * @param {object} [data.scores] - `{ [id]: { kills, deaths } }` from the server.
   * @returns {void}
   */
  render({ entities = [], mode, localId, scores = {} }) {
    const rows = entities.map((e) => ({
      name: e.name,
      id: e.id,
      team: e.team,
      isBot: e.isBot,
      hp: e.hp,
      maxHp: e.maxHp,
      alive: e.alive !== false && e.hp > 0,
      kills: scores[e.id]?.kills,
      deaths: scores[e.id]?.deaths,
    }));

    const teams = mode === 'tdm';
    const body = teams
      ? this._renderTeams(rows)
      : this._renderFlat(rows);

    this.title.setText(teams ? 'TEAM DEATHMATCH' : 'SCOREBOARD');
    this.body.setText(body);
  }

  /**
   * Single-column layout, sorted by kills (unknowns last).
   * @param {object[]} rows
   * @returns {string}
   */
  _renderFlat(rows) {
    const sorted = [...rows].sort((a, b) => (b.kills ?? -1) - (a.kills ?? -1) || a.name.localeCompare(b.name));

    const header = pad('PLAYER', 22) + pad('K', 6) + pad('D', 6) + 'HP';
    const body = sorted
      .map((r) => {
        const you = r.id === this.localId ? ' (you)' : '';
        const name = `${r.name}${you}${r.isBot ? '  ·bot' : ''}`;
        return (
          pad(name, 22) +
          pad(String(r.kills ?? '—'), 6) +
          pad(String(r.deaths ?? '—'), 6) +
          (r.alive ? `${Math.round(r.hp)}` : 'DEAD')
        );
      })
      .join('\n');

    return `${header}\n${'-'.repeat(46)}\n${body}`;
  }

  /**
   * Two-column team layout.
   * @param {object[]} rows
   * @returns {string}
   */
  _renderTeams(rows) {
    const build = (teamId, label) => {
      const list = rows.filter((r) => r.team === teamId);
      const scored = [...list].sort((a, b) => (b.kills ?? -1) - (a.kills ?? -1));
      const total = scored.reduce((sum, r) => sum + (r.kills ?? 0), 0);

      const head = `${label}   (${total} kills)`;
      const body = scored
        .map((r) => {
          const you = r.id === this.localId ? ' (you)' : '';
          return `  ${r.name}${you}${r.isBot ? ' ·bot' : ''}   ${r.kills ?? '—'}`;
        })
        .join('\n');
      return `${head}\n${body || '  (empty)'}\n`;
    };

    const left = build('red', TEAMS.red.name);
    const right = build('blue', TEAMS.blue.name);
    const leftLines = left.split('\n');
    const rightLines = right.split('\n');
    const height = Math.max(leftLines.length, rightLines.length);

    const out = [];
    for (let i = 0; i < height; i += 1) {
      out.push(`${(leftLines[i] ?? '').padEnd(30)}${rightLines[i] ?? ''}`);
    }
    return out.join('\n');
  }

  /** Show the board. @returns {void} */
  show() {
    this.container.setVisible(true);
  }

  /** Hide the board. @returns {void} */
  hide() {
    this.container.setVisible(false);
  }

  /** @returns {boolean} */
  get isVisible() {
    return this.container.visible;
  }

  /** @returns {void} */
  destroy() {
    this.container.destroy();
  }
}

/**
 * Monospace-ish padding that degrades gracefully with proportional fonts.
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
function pad(text, width) {
  return text.length >= width ? `${text} ` : text + ' '.repeat(width - text.length);
}

export default Scoreboard;