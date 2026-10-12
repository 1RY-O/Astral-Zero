/**
 * Astral Zero — identity + payload hygiene (SERVER).
 * ============================================================
 * `player_join` used to accept any name: `String(payload.name).slice(0,24)`
 * with no charset, no control-character filter and no shape rules. That matters
 * for three reasons, all of which are security problems rather than cosmetics:
 *
 *  1. HIJACK. Friends lists, first-match protection and progression are all
 *     keyed on the normalised name. A second client claiming an existing name
 *     silently inherits that player's friends, veteran status and XP. There is
 *     no authentication in this project, so the name IS the identity and it has
 *     to be treated as an untrusted credential, not a display string.
 *  2. SPOOFING. Nothing stopped one client from impersonating another player's
 *     exact display name inside a room — kill feed, scoreboard and party rosters
 *     all render names verbatim.
 *  3. LOG INJECTION. Names were echoed straight into console.log; a name
 *     containing newlines or ANSI escapes rewrites the server log.
 *
 * This module owns that boundary: one sanitiser for display names, plus a
 * generic bounded-string helper used everywhere a client string reaches the
 * server or the log.
 */

export const DEFAULT_NAME = 'Unnamed Janitor';

/**
 * Normalise a name into an identity key: lowercase, trimmed, collisions folded.
 * Kept byte-identical to the historical `normalizeKey` so existing profiles,
 * friend edges and protection state keep matching after this hardening lands.
 * @param {string} name
 * @returns {string}
 */
export function normalizeKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

/**
 * Sanitise a display name for use as a player identity.
 *
 * Rules, in order of intent:
 *  - strip control characters (log injection, console corruption, spoofed
 *    newlines inside kill feeds);
 *  - collapse whitespace so "Bob   Smith" cannot exist twice with different
 *    identity keys;
 *  - cap length at 24 (the UI's own limit), counting in code points rather than
 *    UTF-16 units so an astral-plane nickname cannot overflow the field;
 *  - fall back to the default when nothing survives.
 *
 * @param {unknown} raw client-supplied value
 * @returns {string} safe display name
 */
export function sanitizeName(raw) {
  let s = typeof raw === 'string' ? raw : '';
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  // Fold other invisible / direction-override characters that are used to
  // spoof one player as another in a rendered list.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return DEFAULT_NAME;
  return [...s].slice(0, 24).join('');
}

/**
 * A safe, bounded string for any other client-supplied field (map ids, codes,
 * difficulty labels...). Never throws, never returns undefined.
 *
 * @param {unknown} raw
 * @param {number} [max] - Max characters.
 * @returns {string}
 */
export function safeString(raw, max = 64) {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, max);
}

/**
 * Make a value safe to write into a log line: collapses newlines/escapes so a
 * hostile name cannot forge a log entry.
 * @param {unknown} raw
 * @returns {string}
 */
export function logSafe(raw) {
  return safeString(raw, 120).replace(/[\r\n\t]+/g, ' ');
}
