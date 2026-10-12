/**
 * Astral Zero — URL-hash navigation (app shell).
 * ============================================================
 * The URL hash (`#home` · `#lobby` · `#friends` · `#settings`) is the source
 * of truth for the lobby/home shell. The back button, a refresh and a deep
 * link all resolve through here.
 *
 * Routes:
 *   #home     → HomeScene (brand + PLAY)
 *   #lobby    → LobbyScene (party · mode · friends · settings)
 *   #friends  → LobbyScene (friends panel focus)
 *   #settings → LobbyScene (settings menu)
 *
 * This module is pure UI plumbing: route ids ↔ real Phaser scene keys. It
 * never touches the network or the socket, and it never holds scene CLASSES
 * (those live in `src/main.js`, which owns the Phaser scene list — keeping
 * classes out of here avoids an import cycle between scenes and the router).
 */

/** Valid route ids. */
export const ROUTES = Object.freeze(['home', 'lobby', 'friends', 'settings']);

/** Route id → real Phaser scene key (matches SCENES in gameConfig.js). */
export const ROUTE_SECTORS = Object.freeze({
  home: 'HomeScene',
  lobby: 'LobbyScene',
  friends: 'LobbyScene',
  settings: 'LobbyScene',
});

export function currentRoute() {
  if (typeof window === 'undefined') return 'home';
  try {
    const raw = window.location.hash.replace(/^#/, '').trim().toLowerCase();
    if (!raw) return 'home';
    return ROUTES.includes(raw) ? raw : 'home';
  } catch {
    return 'home';
  }
}

export function navigate(id) {
  if (typeof window === 'undefined') return;
  try {
    const clean = String(id ?? '').trim().toLowerCase();
    if (!ROUTES.includes(clean)) return;
    if (window.location.hash === `#${clean}`) return;
    window.location.hash = clean;
  } catch {
    /* hash assignment failed — ignore */
  }
}

export function sceneKey(id) {
  return ROUTE_SECTORS[id] ?? 'HomeScene';
}
