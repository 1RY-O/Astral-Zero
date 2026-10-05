/**
 * Astral Zero — connection + CTA state resolver (FRONTEND).
 * ===========================================================
 * ONE pure function turns the network's raw state into everything the UI is
 * allowed to claim. The status pill, the Find Match button and the "can I
 * press this?" guards all read from here, which is what makes it structurally
 * impossible for the UI to show ONLINE while the socket is actually down.
 *
 * INPUTS (all REAL, none invented)
 *   state.connection   'idle' | 'connecting' | 'online' | 'offline'
 *                      (SocketClient.status, flipped by transport events)
 *   state.reconnecting boolean  — true while we are trying to re-acquire a
 *                      dropped match (NetworkManager)
 *   state.contractOk   boolean | null — /api/info says the backend implements
 *                      the lobby events. `false` means the buttons would
 *                      silently no-op, so we must say so.
 *   state.busy         string | null — an in-flight command
 *   state.queue        { mode, … } | null — we are searching for a match
 *   state.party        party | null
 *   state.room         room | null — a match is live / loading
 *
 * OUTPUT
 *   { key, label, color, text, tone, online, canAct, hint }
 *
 * DESIGN RULE
 * `canAct` is false for EVERYTHING except a genuinely online socket. A player
 * on a dead connection must not be able to fire a party_create that the
 * server will never receive — better a clearly-disabled, explained button.
 */

/** @typedef {import('../../net/NetworkManager.js').NetworkManager} NetworkManager */

/**
 * Resolve the connection pill state.
 *
 * @param {object} state - `net.state`.
 * @param {typeof import('../../config/uiTheme.js').CONNECTION_STATES} states
 * @returns {{key:string, label:string, color:number, text:string, tone:string,
 *   online:boolean, canAct:boolean, hint:string}}
 */
export function resolveConnection(state = {}, states) {
  // Reconnecting outranks everything: we WERE online, so telling the player
  // "OFFLINE" would be a lie, and silently showing "ONLINE" would be worse.
  if (state.reconnecting) {
    return withHint(states.reconnecting, state, 're-establishing the match link');
  }

  switch (state.connection) {
    case 'online':
      // Connected, but the backend is too old to understand the lobby. Say so
      // rather than letting every button fail silently.
      if (state.contractOk === false) {
        return withHint(
          { key: 'online', label: 'OUTDATED SERVER', color: 0xffd166, text: '#ffd166', tone: 'warning' },
          state,
          'the server does not support the lobby yet',
        );
      }
      return withHint(states.online, state, 'ready for launch');

    case 'connecting':
      return withHint(states.connecting, state, 'reaching the orbital relay');

    case 'offline':
      return withHint(states.offline, state, 'no link to the orbital relay');

    case 'idle':
    default:
      return withHint(states.idle, state, 'waking up the relay');
  }
}

/**
 * Attach a hint + the derived `online`/`canAct` flags.
 * @param {object} entry - A row from CONNECTION_STATES.
 * @param {object} state
 * @param {string} hint
 */
function withHint(entry, state, hint) {
  const online = state.connection === 'online' && state.contractOk !== false;
  return {
    key: entry.label,
    label: entry.label,
    color: entry.color,
    text: entry.text,
    tone: entry.tone,
    online,
    // A reconnecting client is deliberately NOT allowed to act: its session
    // is mid-flight, so a party_create now could race the re-registration.
    canAct: online && !state.reconnecting && !state.busy,
    hint,
  };
}

/**
 * Resolve the Find Match CTA.
 *
 * This is where "do not fake the state" is enforced structurally: the label,
 * colour and enabled flag are all returned together from the same snapshot,
 * so the button can never read "READY" while disabled, or be enabled while
 * the label says "OFFLINE".
 *
 * @param {object} state - `net.state`.
 * @param {typeof import('../../config/uiTheme.js').CTA_STATES} ctas
 * @returns {{key:string, label:string, sub:string, enabled:boolean, tone:string}}
 */
export function resolveCta(state = {}, ctas) {
  const conn = resolveConnection(state, {
    idle: { label: 'CONNECTING', color: 0x7fe7ff, text: '#7fe7ff', tone: 'info' },
    connecting: { label: 'CONNECTING', color: 0xffd166, text: '#ffd166', tone: 'warning' },
    online: { label: 'ONLINE', color: 0x4ade80, text: '#4ade80', tone: 'success' },
    reconnecting: { label: 'RECONNECTING', color: 0xffd166, text: '#ffd166', tone: 'warning' },
    offline: { label: 'OFFLINE', color: 0xff6b8b, text: '#ff6b8b', tone: 'error' },
  });

  // 1. No link → OFFLINE, whatever the party/queue state says. A queued or
  //    in-party button is meaningless without a socket.
  if (!conn.online) {
    return { key: 'offline', ...ctas.offline };
  }

  // 2. A match is already live or loading → LOADING (not "Find Match").
  if (state.room) {
    return { key: 'loading', ...ctas.loading };
  }

  // 3. Searching → SEARCHING, and clicking cancels.
  if (state.queue) {
    return { key: 'queued', ...ctas.queued };
  }

  // 4. In a party: only the leader may act; a follower waits.
  if (state.party) {
    if (state.party.isLeader) {
      return { key: 'leader', ...ctas.leader };
    }
    return { key: 'waiting', ...ctas.waiting };
  }

  // 5. Solo and ready.
  return { key: 'ready', ...ctas.ready };
}

export default resolveConnection;
