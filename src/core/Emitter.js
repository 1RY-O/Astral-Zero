/**
 * Astral Zero — minimal event emitter.
 * ============================================================
 * A ~40 line, dependency-free publish/subscribe helper.
 *
 * WHY NOT Phaser.Events.EventEmitter?
 *  - The network layer (`src/net/`) must stay usable (and unit-testable) in
 *    plain Node, with no canvas and no Phaser import.
 *  - We also want listeners that can be removed with the returned
 *    unsubscribe function, which keeps scene teardown leak-free:
 *
 *        const off = net.on('party', onParty);
 *        // ... later
 *        off();
 */

/** @typedef {(payload?: any) => void} ListenerFn */

export class Emitter {
  constructor() {
    /** @type {Map<string, Set<ListenerFn>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {ListenerFn} listener
   * @returns {() => void} Unsubscribe function (idempotent).
   */
  on(event, listener) {
    if (typeof listener !== 'function') return () => {};
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(listener);
    return () => this.off(event, listener);
  }

  /**
   * Subscribe to the next occurrence of an event only.
   * @param {string} event
   * @param {ListenerFn} listener
   * @returns {() => void} Unsubscribe function.
   */
  once(event, listener) {
    if (typeof listener !== 'function') return () => {};
    const wrapper = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove a single listener, or every listener for an event when
   * `listener` is omitted.
   * @param {string} event
   * @param {ListenerFn} [listener]
   * @returns {void}
   */
  off(event, listener) {
    const set = this._listeners.get(event);
    if (!set) return;
    if (listener) set.delete(listener);
    else this._listeners.delete(event);
  }

  /**
   * Fire an event. Listener exceptions are logged, never thrown, so one bad
   * UI listener can never break the network layer (or the game loop).
   * @param {string} event
   * @param {any} [payload]
   * @returns {void}
   */
  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    // Copy first: a listener may unsubscribe itself while we iterate.
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`[Emitter] listener for "${event}" threw:`, err);
      }
    }
  }

  /**
   * Drop every listener. Used by `NetworkManager.reset()` and tests.
   * @returns {void}
   */
  removeAllListeners() {
    this._listeners.clear();
  }
}

export default Emitter;
