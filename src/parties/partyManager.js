/**
 * Astral Zero — Party manager (Phase 2).
 * ============================================================
 * LOCKED REQUIREMENTS:
 *  - Max party size: 4
 *  - Create → 6-char alphanumeric code (e.g. "A7K9P2")
 *  - Join by code, leave, leader can start match
 *  - Real-time party state updates to ALL members (`party_update`)
 *
 * MODEL:
 *  party = {
 *    code: 'A7K9P2',
 *    leaderId: '<socketId>', leaderName: 'MopLord42',
 *    members: [{ id, socketId, name }],  // max 4, leader is members[0]
 *    mode: 'ffa' | 'tdm' | 'bot_practice' | null (last requested),
 *    createdAt: ms, roomId: null | string (while in a match)
 *  }
 *
 * NOTES:
 *  - leaderId is a SOCKET id (session-scoped). On leader disconnect we
 *    promote the oldest remaining member — parties survive churn.
 *  - Last member leaving DISBANDS the party (code becomes reusable).
 *  - Emitting is the HANDLER's job (needs `io`); this module only mutates
 *    state and returns { ok, party?, error? } results.
 *  - All in-memory Maps. No persistence in Phase 2.
 */

import config from '../server-config.js';

const parties = new Map(); // code → party
const socketToParty = new Map(); // socketId → code (one party at a time)

const MAX_SIZE = () => config.party?.maxSize || 4;
const CODE_LEN = () => config.party?.codeLength || 6;
const ALPHABET = () =>
  config.party?.codeAlphabet || 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a unique 6-char party code. Retries on collision
 * (collision chance is astronomically low, but we check anyway).
 * @returns {string}
 */
export function generateCode() {
  const alpha = ALPHABET();
  const len = CODE_LEN();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = '';
    for (let i = 0; i < len; i += 1) {
      code += alpha[Math.floor(Math.random() * alpha.length)];
    }
    if (!parties.has(code)) return code;
  }
  // Ultra-rare fallback: timestamp suffix (still 6 chars, still unique-ish).
  return `P${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

/** Public snapshot — safe to send to clients (no internal refs). */
export function toPublic(party) {
  if (!party) return null;
  return {
    code: party.code,
    leaderId: party.leaderId,
    leaderName: party.leaderName,
    members: party.members.map((m) => ({ ...m })),
    memberCount: party.members.length,
    maxSize: MAX_SIZE(),
    mode: party.mode,
    roomId: party.roomId,
    createdAt: party.createdAt,
  };
}

/** @param {string} socketId → party code or null */
export function getPartyCodeForSocket(socketId) {
  return socketToParty.get(socketId) || null;
}

/** @param {string} code → public party or null */
export function getParty(code) {
  const party = parties.get(String(code || '').toUpperCase());
  return party ? toPublic(party) : null;
}

/** Internal raw ref (for room/matchmaking wiring). Handlers prefer getParty. */
export function _getRawParty(code) {
  return parties.get(String(code || '').toUpperCase()) || null;
}

/**
 * Create a party. Creator becomes leader + first member.
 * If the socket is already in a party, we leave it first (one party max).
 * @param {object} leader { id, socketId, name }
 * @returns {{ ok: boolean, party?: object, error?: string }}
 */
export function createParty(leader) {
  if (!leader?.socketId) return { ok: false, error: 'NOT_JOINED' };
  leaveParty(leader.socketId); // idempotent: one party at a time

  const code = generateCode();
  const party = {
    code,
    leaderId: leader.socketId,
    leaderName: leader.name,
    members: [{ id: leader.id, socketId: leader.socketId, name: leader.name }],
    mode: null,
    createdAt: Date.now(),
    roomId: null,
  };
  parties.set(code, party);
  socketToParty.set(leader.socketId, code);
  return { ok: true, party: toPublic(party) };
}

/**
 * Join a party by code (case-insensitive, trimmed).
 * @param {object} member { id, socketId, name }
 * @param {string} code
 */
export function joinParty(member, code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { ok: false, error: 'MISSING_CODE' };
  const party = parties.get(normalized);
  if (!party) return { ok: false, error: 'PARTY_NOT_FOUND' };
  if (socketToParty.get(member.socketId) === normalized) {
    return { ok: true, party: toPublic(party), alreadyIn: true };
  }
  if (party.members.length >= MAX_SIZE()) {
    return { ok: false, error: 'PARTY_FULL' };
  }
  // One party at a time — silently leave the old one first.
  leaveParty(member.socketId);
  party.members.push({ id: member.id, socketId: member.socketId, name: member.name });
  socketToParty.set(member.socketId, normalized);
  return { ok: true, party: toPublic(party) };
}

/**
 * Leave the caller's party. Leader leaving promotes the next member.
 * Last member leaving disbands the party.
 * @param {string} socketId
 * @returns {{ ok: boolean, party?: object|null, disbanded?: boolean, wasLeader?: boolean }}
 */
export function leaveParty(socketId) {
  const code = socketToParty.get(socketId);
  if (!code) return { ok: true, party: null, disbanded: false, notInParty: true };
  const party = parties.get(code);
  socketToParty.delete(socketId);
  if (!party) return { ok: true, party: null, disbanded: true };

  const wasLeader = party.leaderId === socketId;
  party.members = party.members.filter((m) => m.socketId !== socketId);

  if (party.members.length === 0) {
    parties.delete(code);
    return { ok: true, party: null, disbanded: true, wasLeader, code };
  }
  if (wasLeader) {
    // Promote oldest remaining member (members[0] = longest tenure).
    party.leaderId = party.members[0].socketId;
    party.leaderName = party.members[0].name;
  }
  return { ok: true, party: toPublic(party), disbanded: false, wasLeader, code };
}

/**
 * Force-remove a socket (disconnect path). Same as leaveParty but
 * returns the raw party + code for broadcast fan-out.
 */
export function handleDisconnect(socketId) {
  const code = socketToParty.get(socketId);
  if (!code) return null;
  const result = leaveParty(socketId);
  const remaining = result.disbanded ? null : _getRawParty(code);
  return { code, ...result, remaining };
}

/** @param {string} socketId → true if this socket leads its party */
export function isLeader(socketId) {
  const code = socketToParty.get(socketId);
  if (!code) return false;
  return parties.get(code)?.leaderId === socketId;
}

/** Remember which room a party is playing in (cleared on match end). */
export function setPartyRoom(code, roomId) {
  const party = _getRawParty(code);
  if (party) party.roomId = roomId;
}

/** Remember last requested mode (lobby UI echo). */
export function setPartyMode(code, mode) {
  const party = _getRawParty(code);
  if (party) party.mode = mode;
}

/** Refresh a member's socket/name after re-join (same human, new socket). */
export function refreshMember(socketId, name) {
  const code = socketToParty.get(socketId);
  // NOTE: after reconnect the socketId CHANGES, so the old entry won't
  // match. Callers should re-join by code; this only refreshes display names
  // for still-connected members.
  if (!code) return;
  const party = parties.get(code);
  const member = party?.members.find((m) => m.socketId === socketId);
  if (member && name) member.name = name;
}

/** Debug helper. */
export function stats() {
  return { partyCount: parties.size, membersTracked: socketToParty.size };
}
