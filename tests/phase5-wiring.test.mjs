/**
 * Astral Zero — Phase 5 scene wiring test.
 * ============================================================
 * There is no browser driver in this repo, so the arena itself cannot be booted
 * headlessly. What CAN be verified statically is the thing that actually breaks
 * in practice: that every Phase 5 system the scene claims to use is really
 * imported, really constructed, and really cleaned up.
 *
 * This reads ArenaScene.js as source and asserts the integration points exist.
 * It is a poor substitute for a real play-test, and it is deliberately explicit
 * about that — a static check cannot prove the game runs, only that the wiring
 * was not forgotten.
 *
 * Run with: npm run test:wiring
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n--- ${t} ---`);

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

const scene = read('src/scenes/ArenaScene.js');
const combatFx = read('src/ui/fx/CombatFx.js');

// ===========================================================================
section('Phase 5 modules are imported by the scene');
// ===========================================================================
for (const [name, path] of [
  ['AudioManager', '../audio/AudioManager.js'],
  ['SpectatorCam', '../camera/SpectatorCam.js'],
  ['AmbientFx', '../ui/fx/AmbientFx.js'],
  ['MatchSummary', '../ui/hud/MatchSummary.js'],
  ['SettingsMenu', '../ui/menus/SettingsMenu.js'],
]) {
  ok(scene.includes(`import { ${name} } from '${path}'`), `${name} is imported from ${path}`);
}
ok(scene.includes("from '../config/maps.js'"), 'map definitions are imported');

// ===========================================================================
section('Systems are constructed during create(), before the network binds');
// ===========================================================================
{
  const bindMenusAt = scene.indexOf('this._bindMenus();');
  const bindNetAt = scene.indexOf('this._bindNetwork();');
  ok(bindMenusAt > -1, '_bindMenus() is called during create()');
  ok(bindMenusAt < bindNetAt,
    '_bindMenus() runs BEFORE _bindNetwork(), so early socket events are not muted');
}

// ===========================================================================
section('Map geometry comes from the server, not a client guess');
// ===========================================================================
{
  // Phase 5: the server ships the authoritative map in `room_joined.map`.
  ok(scene.includes("from '../config/maps.js'"), 'the map adapter is imported');
  ok(scene.includes('mapFromWire('), 'the map is built via the server-payload adapter');
  ok(scene.includes('this._buildWorldFromServer()'), 'the world is built from the server map');
  ok(scene.includes('this.world = new WorldRenderer(this)'), 'the world renderer is constructed');
  // The old client-side layouts must be GONE: a guess about collision is a
  // guaranteed desync from the sim.
  ok(!/ARENA\.platforms|ARENA\.ground|ARENA\.spawn/.test(scene),
    'no geometry is taken from the legacy static ARENA constant');
  ok(!scene.includes('mapFor('), 'the legacy mapFor() geometry lookup is not used');
  ok(!/_createPlatforms/.test(scene), 'the old client-side platform builder is gone');
  // Collision bounds must follow the server's own bounds.
  ok(scene.includes('physics.world.setBounds('), 'physics bounds are set from the server map');
  ok(scene.includes('this.mapDef.bounds'), 'bounds are read from the authoritative payload');
}

// ===========================================================================
section('Spectator cam replaces the main rig while dead');
// ===========================================================================
{
  ok(scene.includes('this.spectator?.mode'), 'the frame loop checks whether spectating');
  ok(scene.includes('this.spectator.update(delta)') && scene.includes('this.cameraRig.update(delta'),
    'exactly one rig writes the camera per frame');
  ok(scene.includes('this._enterSpectate()'), 'death enters the spectator rig');
  ok(scene.includes('this._exitSpectate()'), 'respawn hands the camera back');
}

// ===========================================================================
section('Every shake routes through the accessibility setting');
// ===========================================================================
{
  // Direct rig calls are the thing that would bypass the setting, so assert
  // they appear only inside the helper.
  const helper = scene.slice(scene.indexOf('  _shake(angle, strength, opts)'));
  const helperBody = helper.slice(0, helper.indexOf('\n  }\n'));
  ok(helperBody.includes('if (!settings.get(\'screenShake\')) return;'),
    '_shake() returns early when screen shake is disabled');
  const outside = scene.replace(helperBody, '');
  ok(!/cameraRig\.shake\(|cameraRig\.recoil\(/.test(outside),
    'no call site bypasses _shake() and shakes the camera directly');
}

// ===========================================================================
section('Audio cues are wired to the right gameplay events');
// ===========================================================================
{
  const cues = {
    'weaponFire': 'shot',
    'hitMarker': 'confirmed hit',
    'hitMarkerPredicted': 'predicted hit',
    'killConfirm': 'kill',
    'death': 'our death',
    'countdownBeep': 'countdown',
    'countdownGo': 'match start',
    'medal': 'medal',
    'respawn': 'respawn',
  };
  for (const [cue, what] of Object.entries(cues)) {
    ok(scene.includes(`play('${cue}')`), `a cue plays for ${what} ('${cue}')`);
  }
  ok(scene.includes('isLooping(\'lowHealthPulse\')'), 'the low-health alarm is a managed loop');
  ok(scene.includes("this.audio?.stopAll()"), 'all loops are stopped on match end and shutdown');
}

// ===========================================================================
section('Tab visibility is handled');
// ===========================================================================
{
  ok(scene.includes("addEventListener('visibilitychange'"), 'a visibilitychange listener is registered');
  ok(scene.includes("removeEventListener('visibilitychange'"), 'and is removed on shutdown (no leak)');
  ok(scene.includes('suspendForBackground()'), 'audio suspends when the tab is hidden');
  ok(scene.includes('this.ambient?.setActive(!this._pageHidden)'),
    'ambience freezes while the tab is hidden');
  // A hidden tab must not keep holding the trigger.
  ok(scene.includes('this._fireHeld = false; // never resume holding the trigger'),
    'the fire input is released on tab hide');
}

// ===========================================================================
section('Tracers and damage numbers come from the pool');
// ===========================================================================
{
  ok(combatFx.includes('new FxPool('), 'CombatFx builds object pools');
  ok(!/this\.scene\.add\s*\n?\s*\.line\(/.test(combatFx), 'tracers no longer allocate a new line per shot');
  ok(combatFx.includes('this._updatePools()'), 'pooled effects are advanced every frame');
  // The early-return that used to skip the update would strand pooled effects.
  const upd = combatFx.slice(combatFx.indexOf('  update() {'), combatFx.indexOf('  update() {') + 400);
  ok(upd.indexOf('this._updatePools()') < upd.indexOf('if (this.hitMarker.alpha <= 0) return;'),
    'the pool update happens BEFORE the hit-marker early return');
}

// ===========================================================================
section('Phase 5 world + scrap + spectator surfaces are wired');
// ===========================================================================
{
  ok(scene.includes("this.stream.on('snapshot'"), 'the snapshot stream is consumed for tokens');
  ok(scene.includes('syncTokens('), 'scrap tokens are reconciled from the snapshot');
  ok(scene.includes("this.stream.on('scrap'"), 'scrap_event is consumed for pickup/deposit FX');
  ok(scene.includes('setScrap('), 'the carried-scrap HUD counter is driven');
  ok(scene.includes('getMap?.()'), 'the scene reads the authoritative map off the stream');

  // No local XP maths may survive: the server owns progression now.
  ok(!/computeMatchXp|awardXp|rankProgress/.test(scene),
    'no local XP/medal calculation remains in the scene');
  ok(!/totalXp/.test(scene), 'no local XP is written anywhere');
}

// ===========================================================================
section('Lobby can act on the server\'s canSpectate hint');
// ===========================================================================
{
  const lobby = read('src/scenes/LobbyScene.js');
  const mode = read('src/ui/lobby/ModeSelector.js');
  const net = read('src/net/NetworkManager.js');

  ok(net.includes('canSpectate'), 'NetworkManager reads the canSpectate hint');
  ok(net.includes("emit('spectate-offer'"), 'the hint is republished as a lobby event');
  ok(mode.includes('spectateOffer'), 'the mode selector renders the offer');
  ok(mode.includes('onSpectate'), 'the selector exposes a spectate action');
  ok(lobby.includes('_joinAsSpectator'), 'the lobby implements the spectate action');
  ok(lobby.includes('net.lateJoin('), 'spectating retries room_join');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
