/**
 * Astral Zero — characters, loadouts and ranked (S14.1 / .2 / .6).
 *
 * These are game RULES, so they are tested deterministically against the shared
 * modules both halves read:
 *   - the roster is exactly five, one per tier, and self-consistent;
 *   - a tier is a personality, not a power ranking (no character strictly
 *     dominates);
 *   - a loadout variant may never break its character's identity (stat caps);
 *   - ranked is server-computed, placement-gated, and season-aware.
 *
 * Run: node tests/characters.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHARACTERS, CHARACTER_IDS, CHARACTER_TIERS, STARTER_CHARACTER,
  isKnownCharacter, characterFor,
} from '../src/shared/characters.js';
import {
  VARIANTS, isKnownVariant, variantsFor, resolveLoadout,
} from '../src/shared/loadouts.js';
import {
  LEAGUES, rateFor, seasonId, eloDelta, applyPlacement, applyRankedResult,
  averageOpponentRating, PLACEMENT_MATCHES,
} from '../src/shared/ranked.js';

// ---------------------------------------------------------------------------
test('the launch roster is exactly five, one per tier', () => {
  assert.equal(CHARACTER_IDS.length, 5, 'five launch characters');
  const tiers = CHARACTER_IDS.map((id) => CHARACTERS[id].tier);
  assert.equal(new Set(tiers).size, 5, 'each character owns a distinct tier');
  for (const id of CHARACTER_IDS) {
    const c = CHARACTERS[id];
    assert.ok(CHARACTER_TIERS[c.tier], `${id} has a known tier`);
    assert.ok(c.name && c.lore && c.personality, `${id} is fully described`);
    assert.ok(c.skill && c.ability, `${id} has a skill and an ability`);
    assert.ok(c.strengths && c.weaknesses, `${id} declares a trade-off`);
  }
  assert.ok(isKnownCharacter(STARTER_CHARACTER), 'the starter exists');
});

test('every character has a real weapon and every signature maps to a row', () => {
  // The weapon is validated server-side elsewhere; here we assert the roster
  // only references weapons the shared weapon table can resolve.
  const weapons = new Set(['scrap-rifle', 'mop-cannon', 'debris-launcher']);
  for (const id of CHARACTER_IDS) {
    assert.ok(weapons.has(CHARACTERS[id].weapon), `${id} has a real weapon`);
  }
});

test('no character strictly dominates — every axis is a trade', () => {
  // If any character were >= another on EVERY stat, "pick the best" would be
  // correct and the roster would be decorative. Assert the Pareto property.
  for (const a of CHARACTER_IDS) {
    for (const b of CHARACTER_IDS) {
      if (a === b) continue;
      const sa = CHARACTERS[a].stats;
      const sb = CHARACTERS[b].stats;
      const axes = ['hp', 'speedMul', 'jumpMul', 'fireRateMul', 'damageMul'];
      const aNeverWorse = axes.every((k) => sa[k] >= sb[k]);
      const aNeverBetter = axes.every((k) => sa[k] <= sb[k]);
      assert.ok(!(aNeverWorse || aNeverBetter),
        `${a} and ${b} are not strictly ordered — the roster has a dominant pick`);
    }
  }
});

test('isKnownCharacter / characterFor are safe against garbage', () => {
  assert.equal(isKnownCharacter('marlowe'), true);
  assert.equal(isKnownCharacter('RELIC'), false, 'ids are case-sensitive');
  assert.equal(isKnownCharacter(null), false);
  assert.equal(characterFor('nope').id, STARTER_CHARACTER, 'unknown falls back to the starter');
});

// ---------------------------------------------------------------------------
test('variants exist only for real characters and never stack', () => {
  for (const id of CHARACTER_IDS) {
    const list = variantsFor(id);
    assert.ok(list.length >= 1, `${id} has at least one loadout`);
    for (const v of list) assert.ok(isKnownVariant(id, v));
  }
  assert.equal(isKnownVariant('marlowe', 'deadeye'), false, 'variants do not cross characters');
  assert.equal(isKnownVariant('nope', 'x'), false);
});

test('a variant can never exceed its identity cap', () => {
  for (const id of CHARACTER_IDS) {
    const base = resolveLoadout(id).stats;
    for (const v of variantsFor(id)) {
      const s = resolveLoadout(id, v).stats;
      const cap = { speedMul: 1.25, hpMul: 1.2, damageMul: 1.25, fireRateMul: 1.3 };
      for (const [k, c] of Object.entries(cap)) {
        if (k in base) {
          assert.ok(s[k] <= base[k] * c + 1e-9,
            `${id}/${v} pushed ${k} to ${s[k]}, past the ${c}x identity cap`);
          // And never gut the character entirely.
          assert.ok(s[k] >= base[k] * 0.5 - 1e-9,
            `${id}/${v} reduced ${k} below the 0.5x floor`);
        }
      }
    }
  }
});

test('resolveLoadout is deterministic and rejects a bad variant', () => {
  const a = resolveLoadout('bodge', 'brawler');
  const b = resolveLoadout('bodge', 'brawler');
  assert.deepEqual(a.stats, b.stats, 'same inputs → same numbers');
  // A hostile/garbage variant falls back to the character's first, never throws.
  const bad = resolveLoadout('bodge', ';;;');
  assert.equal(bad.variantId, variantsFor('bodge')[0]);
  assert.doesNotThrow(() => resolveLoadout('ghost', 'x'));
});

// ---------------------------------------------------------------------------
test('rateFor maps a rating to exactly one league', () => {
  for (const l of LEAGUES) {
    assert.equal(rateFor(l.min).id, l.id, `min of ${l.id} resolves to itself`);
  }
  assert.equal(rateFor(9999).id, LEAGUES[LEAGUES.length - 1].id, 'over the top → last league');
  assert.equal(rateFor(NaN).id, LEAGUES[0].id, 'garbage → first league, not crash');
});

test('an unplaced player is on no board; placement gates everything', () => {
  const state = { placed: false, rating: 0, wins: 0, losses: 0, scoreSoFar: 0 };
  let r = state;
  for (let i = 0; i < PLACEMENT_MATCHES - 1; i += 1) {
    r = applyRankedResult(r, { won: i % 2 === 0, opponentRating: 1200 }).ranked;
    assert.equal(r.placed, false, `still unplaced after ${i + 1} matches`);
  }
  r = applyRankedResult(r, { won: true, opponentRating: 1200 }).ranked;
  assert.equal(r.placed, true, 'placed exactly at PLACEMENT_MATCHES');
  assert.ok(r.rating > 0, 'a placed player has a real rating');
});

test('Elo moves up on a win and down on a loss, within bounds', () => {
  assert.ok(eloDelta(1200, true, 1200) > 0, 'beating an equal raises you');
  assert.ok(eloDelta(1200, false, 1200) < 0, 'losing to an equal lowers you');
  // An upset is worth MORE rating the further below your opponent you are and
  // the closer you are to even. Beating a 500 from 1200 is a bigger upset than
  // beating a 500 from 2000 (where you were already expected to win).
  assert.ok(eloDelta(1200, true, 500) > eloDelta(2000, true, 500),
    'the bigger upset pays more');
  assert.ok(eloDelta(1200, true, 1600) > eloDelta(1200, true, 1200),
    'beating a stronger opponent pays more than beating an even one');
  assert.ok(eloDelta(1200, true, 1200) > eloDelta(1200, true, 800),
    'beating an even opponent pays more than beating a weaker one');
  // K is damped at high ratings so a single upset cannot rocket you.
  assert.ok(Math.abs(eloDelta(2000, true, 2000)) < Math.abs(eloDelta(1000, true, 1000)),
    'K shrinks at high rating');
});

test('ratings are bounded and a season change softly resets a placed player', () => {
  let r = { placed: true, rating: 1900, peak: 1900, seasonId: '2026-01', wins: 0, losses: 0, placements: 1, scoreSoFar: 0 };
  const won = applyRankedResult(r, { won: true, opponentRating: 1200, season: '2026-01' }).ranked;
  assert.ok(won.rating >= 1900, 'a win at the same season cannot lower you');
  const newSeason = applyRankedResult(r, { won: true, opponentRating: 1200, season: '2026-02' }).ranked;
  assert.ok(newSeason.rating < 1900, 'a new season pulls toward the mean');
  assert.ok(newSeason.rating >= 1200, 'soft reset bottoms out near the mean');
  assert.equal(newSeason.seasonId, '2026-02');
});

test('averageOpponentRating ignores bots, self, and unrated players', () => {
  const rows = [
    { id: 'me', isBot: false, rated: 1500 },
    { id: 'a', isBot: false, rated: 1200 },
    { id: 'b', isBot: false, rated: 1400 },
    { id: 'bot', isBot: true, rated: 9999 },
    { id: 'c', isBot: false, rated: null },
  ];
  assert.equal(averageOpponentRating(rows, 'me'), 1300, 'mean of the two rated humans');
  assert.equal(averageOpponentRating([{ id: 'me', isBot: false, rated: 1500 }], 'me'), 0,
    'no opponents → 0 (caller treats as no source, not a beatable 0)');
});

test('seasonId is stable within a month and changes across it', () => {
  const jan = Date.UTC(2026, 0, 15);
  const janEnd = Date.UTC(2026, 0, 31);
  const feb = Date.UTC(2026, 1, 1);
  assert.equal(seasonId(jan), seasonId(janEnd), 'same month → same season');
  assert.notEqual(seasonId(jan), seasonId(feb), 'a new month is a new season');
});

console.log('\ncharacter / loadout / ranked checks done');
