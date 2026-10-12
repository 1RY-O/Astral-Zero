/**
 * Astral Zero — character / loadout / ranked socket handlers (SERVER).
 * ============================================================
 * These are the only paths that may WRITE a player's character, loadout or
 * rating. All three are validated here against the shared roster and the
 * player's persisted unlocks; the client merely asks.
 *
 * Why a dedicated handler rather than a field on `player_join`: a character is
 * chosen between matches, not at join time, and re-joining to change a loadout
 * would be both wasteful and confusing.
 */

import { SOCKET_EVENTS } from '../events.js';
import { allow as allowEvent } from '../limits.js';
import {
  getBySocket,
  ensureProfile,
  setActiveCharacter,
  setLoadout,
  activeCharacterFor,
  saveProfile,
} from '../../players/playerStore.js';
import { persistence } from '../../players/persistence.js';
import { CHARACTERS, isKnownCharacter, STARTER_CHARACTER } from '../../shared/characters.js';
import { variantsFor, isKnownVariant, resolveLoadout } from '../../shared/loadouts.js';
import { rateFor, seasonId } from '../../shared/ranked.js';

/** Trim a profile to what the client needs to render the selection screen. */
function publicProfile(profile) {
  return {
    character: activeCharacterFor(profile.displayName || profile.key),
    unlockedCharacters: [...profile.unlockedCharacters],
    unlockedCosmetics: [...profile.unlockedCosmetics],
    mastery: { ...profile.mastery },
    loadouts: { ...profile.loadouts },
    totalXp: profile.totalXp,
    level: Math.floor(profile.totalXp / 1000) + 1,
    ranked: { ...profile.ranked },
  };
}

/**
 * Register character + loadout + ranked handlers on a socket.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @returns {void}
 */
export function registerProgressionHandlers(io, socket) {
  const requireProfile = () => {
    const player = getBySocket(socket.id);
    if (!player) {
      socket.emit(SOCKET_EVENTS.ERROR, { code: 'NOT_JOINED', message: 'Join before choosing a character.' });
      return null;
    }
    return { player, profile: ensureProfile(player.name) };
  };

  // -- Select character (+ optional loadout variant) -----------------------
  socket.on(SOCKET_EVENTS.CHARACTER_SET, (payload = {}, ack) => {
    if (!allowEvent('character_set', socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'RATE_LIMITED' });
      return;
    }
    const ctx = requireProfile();
    if (!ctx) {
      if (typeof ack === 'function') ack({ ok: false, error: 'NOT_JOINED' });
      return;
    }
    const { profile } = ctx;

    const res = setActiveCharacter(ctx.player.name, payload.character);
    if (!res.ok) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: res.error,
        message: res.error === 'LOCKED'
          ? 'That character is not unlocked yet.'
          : 'Unknown character.',
      });
      if (typeof ack === 'function') ack({ ok: false, error: res.error });
      return;
    }

    // A variant may arrive with the selection; validate it against the NEW
    // character (an old character's variant must not carry across).
    let variant = null;
    if (payload.variant !== undefined && payload.variant !== null && payload.variant !== '') {
      const v = setLoadout(ctx.player.name, res.character, payload.variant);
      if (!v.ok) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: v.error, message: 'Unknown loadout variant.' });
        if (typeof ack === 'function') ack({ ok: false, error: v.error });
        return;
      }
      variant = v.variant;
    } else {
      variant = profile.loadouts[res.character] || variantsFor(res.character)[0] || null;
    }

    // Reflect the change on the live session so the NEXT match uses it even if
    // the player never rejoins.
    ctx.player.character = res.character;
    ctx.player.loadoutVariant = variant;
    saveProfile(profile);

    socket.emit(SOCKET_EVENTS.CHARACTER_UPDATE, {
      character: res.character,
      variant,
      profile: publicProfile(profile),
      timestamp: Date.now(),
    });
    if (typeof ack === 'function') ack({ ok: true, character: res.character, variant });
  });

  // -- Ranked read (leaderboard + own standing) ----------------------------
  // Registered through the shared registry like every other event, so
  // `/api/info` advertises it and the client constant is the only spelling.
  socket.on(SOCKET_EVENTS.RANKED_BOARD, (payload = {}, ack) => {
    if (!allowEvent('ranked_board', socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'RATE_LIMITED' });
      return;
    }
    const player = getBySocket(socket.id);
    const own = player ? ensureProfile(player.name) : null;
    const season = seasonId();
    // The leaderboard is a READ of the durable store — no score is ever computed
    // here, and only PLACED players appear (see shared/ranked.js rule 2).
    const board = (persistence()?.leaderboard({ seasonId: season, limit: 25 }) || [])
      .map((e) => ({ ...e, league: rateFor(e.rating).id }));
    socket.emit(SOCKET_EVENTS.RANKED_UPDATE, {
      seasonId: season,
      you: own ? { placed: own.ranked.placed, rating: own.ranked.rating, league: rateFor(own.ranked.rating) } : null,
      leaderboard: board,
      timestamp: Date.now(),
    });
    if (typeof ack === 'function') ack({ ok: true });
  });
}

/**
 * The unlocked-set a fresh profile starts with: the starter only. Unlock paths
 * (progression rewards) grant the rest; nothing is ever auto-unlocked.
 * @param {object} profile
 * @returns {string[]}
 */
export function initialUnlocks(profile) {
  return [STARTER_CHARACTER];
}

export { publicProfile };
