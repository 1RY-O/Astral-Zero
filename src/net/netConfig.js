/**
 * Astral Zero — network configuration (FRONTEND).
 * ============================================================
 * Resolves WHERE the game should open its Socket.io connection.
 *
 * Two very different deployments must both work:
 *
 *  1. **Vite dev** — the Phaser game runs on :5173 while the Express +
 *     Socket.io backend runs on :3000. Different origin ⇒ the URL must be
 *     passed explicitly or the handshake is rejected by CORS.
 *  2. **Production** — Express serves the built `dist/`, so game and socket
 *     share an origin and a bare same-origin connect is correct.
 *
 * Overrides, highest priority first:
 *   1. `?server=http://host:port` in the URL (handy for LAN/mobile testing)
 *   2. `VITE_SERVER_URL` in `.env` (set at build time by Vite)
 *   3. dev default `http://localhost:3000`
 *   4. same origin (production)
 */

/** Default backend origin used while developing with `npm run dev`. */
export const DEV_SERVER_URL = 'http://localhost:3000';

/** How long we wait for a Socket.io ack before giving up (ms). */
export const ACK_TIMEOUT_MS = 4000;

/** Reconnection behaviour (Socket.io defaults, spelled out for clarity). */
export const RECONNECT_OPTIONS = {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 8000,
};

/**
 * Strip a trailing slash so `url + '/api/info'` never double-slashes.
 * @param {string} url
 * @returns {string}
 */
function normalise(url) {
  return url.replace(/\/+$/, '');
}

/**
 * Query-string overrides, e.g. `?server=http://192.168.1.20:3000`.
 * @returns {string|null}
 */
function fromQueryString() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('server') || params.get('backend') || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the backend origin, or `null` when same-origin should be used.
 * @returns {string|null}
 */
export function resolveServerUrl() {
  const override = fromQueryString() || import.meta.env?.VITE_SERVER_URL || null;
  if (override) return normalise(override);
  if (import.meta.env?.DEV) return normalise(DEV_SERVER_URL);
  return null; // production: same origin as the page
}

/**
 * Build an absolute (or root-relative) URL for a backend HTTP endpoint such
 * as `/api/info`. Used for the contract-version handshake at boot.
 * @param {string} path - Must start with `/`.
 * @returns {string}
 */
export function resolveApiUrl(path) {
  const base = resolveServerUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${suffix}` : suffix;
}

/**
 * True when the developer forced offline demo mode (`?demo=1` / `?offline=1`).
 * The socket still connects (so the status pill is honest) but every lobby
 * command is served by DemoBackend instead of the network.
 * @returns {boolean}
 */
export function isDemoForced() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('demo') === '1' || params.get('offline') === '1';
  } catch {
    return false;
  }
}

/**
 * True when `?skipLobby` is present — boots straight into the arena, which is
 * handy while iterating on gameplay instead of the lobby UI.
 * @returns {boolean}
 */
export function isLobbySkipped() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('skipLobby');
  } catch {
    return false;
  }
}
