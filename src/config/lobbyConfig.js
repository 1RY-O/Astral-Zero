/**
 * Astral Zero — Lobby / party / match configuration (FRONTEND).
 * ============================================================
 * Every magic number for the Phase 2 lobby UI lives here so the scenes and
 * widget classes stay declarative and can be re-skinned in one place.
 *
 * Layout values are in *game* pixels (1280x720) because Phaser's Scale.FIT
 * mode maps them onto whatever size the browser window happens to be.
 */

/** Screen size the lobby is designed against (mirrors GAME_CONFIG). */
export const LOBBY = {
  width: 1280,
  height: 720,

  /** Header bar height (logo + connection status). */
  headerHeight: 74,

  /** Gap between the two main columns and their edge margins. */
  gutter: 22,

  /** Outer margin from the screen edge to the first panel. */
  margin: 34,

  /** Inner padding used by every Panel widget. */
  padding: 20,

  /** Bottom bar that hosts the mode selector + primary action button. */
  footerHeight: 176,
};

/**
 * Party rules. Mirrors what the backend enforces so the UI can disable
 * buttons instead of letting the player submit an invalid request.
 */
export const PARTY = {
  /** Hard cap from the game design (Phase 2 spec). */
  maxMembers: 4,
  /** Party codes are exactly this many characters (A-Z0-9). */
  codeLength: 6,
  /** Row geometry of the member list. */
  memberRowHeight: 52,
  memberRowGap: 8,
  /** How long a freshly created/joined party code stays highlighted. */
  codeHighlightMs: 2600,
};

/**
 * Game modes offered in the lobby.
 *
 * `id` values are exactly the strings sent to the backend (`party_set_mode`,
 * `queue_join`, `party_start_match`) and expected back in the match payload.
 */
export const MATCH_MODES = {
  ffa: {
    id: 'ffa',
    name: 'Free-for-All',
    short: 'FFA',
    accent: '#ff6b8b',
    description: 'No teams. Every janitor for themselves — last one sweeping wins.',
    minPlayers: 2,
    maxPlayers: PARTY.maxMembers,
    teams: false,
    botCount: 0,
    friendly: false,
  },
  tdm: {
    id: 'tdm',
    name: 'Team Deathmatch',
    short: 'TDM',
    accent: '#4ade80',
    description: 'Two crews of two. Shared goal, shared trash pile.',
    minPlayers: 2,
    maxPlayers: 4,
    teams: true,
    teamCount: 2,
    teamNames: ['Cyan Crew', 'Amber Crew'],
    botCount: 0,
    friendly: false,
  },
  bot_practice: {
    id: 'bot_practice',
    name: 'Bot Practice',
    short: 'BOTS',
    accent: '#ff9f43',
    description: 'Friendly scrapyard sparring against bots only. Zero stakes, max mop time.',
    minPlayers: 1,
    maxPlayers: 4,
    teams: false,
    botCount: 3,
    friendly: true,
  },
  /**
   * Phase 5 (contract 1.4.0): gather scrap and bank it at a station.
   *
   * FFA-shaped (no teams, everyone for themselves) with a shared world goal, so
   * it is deliberately `friendly: false` and `teams: false`. The objective is
   * economic rather than violent: you still fight over tokens, but the win
   * condition is a banked total, not a body count.
   */
  scrap_collector: {
    id: 'scrap_collector',
    name: 'Scrap Collector',
    short: 'SCRAP',
    accent: '#ffd166',
    description: 'Hoard the debris and bank it. First to 20 scrap wins the shift.',
    minPlayers: 2,
    maxPlayers: 8,
    teams: false,
    botCount: 0,
    friendly: false,
    /** Server's `gameModes.scrap_collector.bankLimit`. */
    bankLimit: 20,
  },
};

/** Display order of the mode cards in the selector. */
export const MODE_ORDER = ['ffa', 'tdm', 'bot_practice', 'scrap_collector'];

/** Mode selected before the player touches anything. */
export const DEFAULT_MODE = 'ffa';

/**
 * Team definitions. Colours are used for name tags, HUD accents and bot
 * tints so a player can always tell who they are rooting for.
 */
export const TEAMS = {
  red: { id: 'red', name: 'Cyan Crew', color: '#38e1ff', colorInt: 0x38e1ff },
  blue: { id: 'blue', name: 'Amber Crew', color: '#ff9f43', colorInt: 0xff9f43 },
  solo: { id: 'solo', name: 'Solo', color: '#7fe7ff', colorInt: 0x7fe7ff },
};

/**
 * Where players/bots are placed in the arena, per team. Coordinates are
 * world pixels inside the 1280x720 gray-box arena.
 *
 * These are only fallbacks: when the match payload carries spawn points the
 * backend wins (see MatchModel.normalizeMatch).
 */
export const MATCH_SPAWNS = {
  solo: [
    { x: 320, y: 600 },
    { x: 960, y: 600 },
    { x: 640, y: 620 },
    { x: 180, y: 600 },
  ],
  team: {
    red: [
      { x: 260, y: 600 },
      { x: 420, y: 600 },
    ],
    blue: [
      { x: 1020, y: 600 },
      { x: 860, y: 600 },
    ],
  },
  bots: [
    { x: 1040, y: 600 },
    { x: 880, y: 600 },
    { x: 700, y: 600 },
    { x: 520, y: 600 },
    { x: 340, y: 600 },
    { x: 180, y: 600 },
  ],
};

/** How many characters to render in a player's HUD tag. */
export const HUD = {
  nameTagFontSize: '13px',
  scoreFontSize: '15px',
  /** Vertical offset of the name tag above the sprite (sprite is 56px tall). */
  nameTagOffset: -46,
};
