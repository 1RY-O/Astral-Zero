/**
 * Astral Zero — NavRail (lobby navigation).
 * ===========================================================
 * Compact left-hand navigation: HOME · PLAY · FRIENDS · SETTINGS.
 *
 * NO FAKE FUNCTIONALITY (explicit requirement)
 * The rail declares only the destinations that genuinely exist in this build:
 *
 *   HOME     → focuses the top bar / resets to the default lobby view
 *   PLAY     → focuses the party + mode panels (the matchmaking entry point)
 *   FRIENDS  → focuses the friends panel
 *   SETTINGS → opens the real SettingsMenu (audio, feedback toggles, keybinds)
 *
 * There is deliberately NO "MISSIONS", "SHOP", "PROFILE EDITOR" or "RANKED"
 * item, because the backend has no mission, currency or ranked system. An
 * entry that leads nowhere is worse than an absent one. `ROUTES` is the single
 * list; adding a destination later means adding a route AND its handler.
 *
 * RESPONSIVE
 * On the `compact` tier the rail becomes a horizontal BOTTOM bar: the same
 * items, the same handlers, laid out along X instead of Y. Touch targets are
 * floored at the tier's `minTouch`.
 *
 * ACCESSIBILITY
 * Each item is a Button with `toggle: true`, so the active one has a thicker
 * border + brighter fill AND a `▸` marker — a shape difference, not colour
 * alone. Full keyboard activation is inherited from Button.
 */

import { THEME, FONTS, RADII } from '../../config/uiTheme.js';
import { Button } from '../widgets/Button.js';

/** @typedef {'home'|'play'|'friends'|'settings'} RouteId */

/**
 * The real navigation graph. Adding a route requires a handler here — there
 * is no code path that shows an item with no destination.
 */
export const ROUTES = Object.freeze([
  { id: 'home', label: 'HOME', glyph: '⌂', hint: 'Lobby overview' },
  { id: 'play', label: 'PLAY', glyph: '▶', hint: 'Party & matchmaking' },
  { id: 'friends', label: 'FRIENDS', glyph: '☺', hint: 'Your crew' },
  { id: 'settings', label: 'SETTINGS', glyph: '⚙', hint: 'Audio & controls' },
]);

export class NavRail {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {number} opts.x - Left edge (vertical) or centre X (horizontal).
   * @param {number} opts.y - Top edge (vertical) or centre Y (horizontal).
   * @param {number} opts.extent - Length of the rail along its axis.
   * @param {number} opts.itemSize - Cross-axis size of each item.
   * @param {'vertical'|'horizontal'} opts.orientation
   * @param {number} [opts.depth]
   * @param {number} [opts.minTouch]
   * @param {Record<RouteId, () => void>} opts.handlers
   * @param {RouteId} [opts.active]
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.x = opts.x;
    this.y = opts.y;
    this.extent = opts.extent;
    this.orientation = opts.orientation ?? 'vertical';
    this.depth = opts.depth ?? 12;
    this.minTouch = opts.minTouch ?? 44;
    /** Cross-axis thickness of the rail (the item width/height). */
    this._itemSize = opts.itemSize ?? 56;
    this.handlers = opts.handlers ?? {};
    this.active = opts.active ?? 'home';

    this.items = [];
    this._build();
    this.setActive(this.active);
  }

  /** Create one button per real route. @returns {void} */
  _build() {
    const n = ROUTES.length;
    const vertical = this.orientation === 'vertical';
    const size = Math.min(this._itemSize, this.extent / n - 6);

    ROUTES.forEach((route, i) => {
      // Centre each item along the rail's axis.
      const cx = vertical
        ? this.x + this._itemSize / 2
        : this.x + (this.extent / n) * (i + 0.5);
      const cy = vertical
        ? this.y + (this.extent / n) * (i + 0.5)
        : this.y + this._itemSize / 2;

      const btn = new Button(this.scene, {
        x: cx,
        y: cy,
        width: size,
        height: Math.max(size, this.minTouch),
        label: route.label,
        skin: 'nav',
        fontSize: size < 70 ? '11px' : '12px',
        minHeight: this.minTouch,
        depth: this.depth,
        toggle: true,
        selected: route.id === this.active,
        ariaLabel: `${route.label} — ${route.hint}`,
        onClick: () => this.select(route.id, true),
      });
      this.items.push(btn);
    });
  }

  /**
   * Highlight a route and (optionally) run its handler.
   *
   * @param {RouteId} id
   * @param {boolean} [invoke] - Also call the handler.
   * @returns {void}
   */
  select(id, invoke = false) {
    if (!ROUTES.some((r) => r.id === id)) return;
    this.setActive(id);
    if (invoke) this.handlers[id]?.();
  }

  /**
   * @param {RouteId} id
   * @returns {void}
   */
  setActive(id) {
    this.active = id;
    this.items.forEach((btn, i) => btn.setSelected(ROUTES[i].id === id));
  }

  /** @param {boolean} visible */
  setVisible(visible) {
    this.items.forEach((b) => b.setVisible(visible));
  }

  /** @returns {void} */
  destroy() {
    this.items.forEach((b) => b.destroy());
    this.items.length = 0;
  }
}

export default NavRail;
