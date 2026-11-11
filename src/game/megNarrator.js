/**
 * ASTRAL ZERO — MEG: The Chaotic Onboard AI Streamer.
 * Built for the NASA International Space Apps Challenge 2026.
 *
 * Implements:
 * - 8-second minimum global spacing between dialogue cues
 * - 2-minute non-repeat history per line
 * - Event-tagged dialogue triggers (latch, swing_peak, clean_deorbit, prograde_miss, collision, low_fuel, conjunction)
 * - Broadcast overlay feed format with live viewer engagement
 */

export const MEG_DIALOGUE_POOLS = {
  latch: [
    'TETHER HOOKED! Grab your popcorn chat, we are in the spin!',
    'Direct mooring hit! Hold on to your thruster mounts!',
    'LATCH LOCKED! Now match that tumble rate!',
  ],
  swing_peak: [
    'TETHER TENSION LOOKS JUICY! You are lined up for the drop!',
    'OH THAT WINDOW IS OPEN! Cut it cut it cut it!!',
    'Perigee dipping fast! Release right on the retrograde mark!',
  ],
  clean_deorbit: [
    'CLEAN RETROGRADE! That is how we deorbit on Channel 73!',
    'OH you clipped that release perfectly! Atmospheric furnace eats another one!',
    'Orbit zeroed! Salvage credits incoming!',
  ],
  campaign_win: [
    'gg. chat, we zeroed the perigee.',
    'Channel 73 signing off. That was a textbook deorbit series.',
  ],
  prograde_miss: [
    'Bro you launched it HIGHER! That is an orbital congestion fine, genius.',
    'Apogee went up, not down! Did you read the flight manual upside down?',
    'Chat is roasting your trajectory right now. Go round up your junk.',
  ],
  low_fuel: [
    'Fuel warning is screaming at us... chat says u sukk. prove em wrong.',
    'RCS tanks are coughing dust! Make this next swing count!',
    'Propellant gauge in the red! No more joyriding!',
  ],
  collision: [
    'OOF! That loud metallic crunch was our hull! Watch your radius!',
    'Tug meets 800 kilograms of dead steel! You cannot park there!',
  ],
  conjunction_warning: [
    'RED ALERT! Traffic control says a rogue chunk is crossing our shell in 30s!',
    'CONJUNCTION ALARM! Sling this hulk or we are both scrap metal!',
  ],
  boundary_warning: [
    'Drifting off-grid scrap-rat! Auto-RCS stabilizer engaging!',
    'Warning: edge of broadcast cone! Bringing you back to the hulk!',
    'Whoa there! Do not wander off into the void! Turn back to salvage zone!',
  ],
  idle_encourage: [
    'Channel 73 live feed running clean. 14k viewers watching this deorbit.',
    'Keep your vector steady. Angular momentum is your friend.',
  ],
};

export class MegStreamerNarrator {
  constructor({ minIntervalMs = 8000, repeatCooldownMs = 120000, onLine = () => {} } = {}) {
    this.minIntervalMs = minIntervalMs;
    this.repeatCooldownMs = repeatCooldownMs;
    this.onLine = onLine;

    this.lastTriggerTime = 0;
    this.history = new Map(); // text -> timestamp
    this.currentLine = 'Channel 73 stream online. Waiting for salvage lock...';
    this.viewerCount = 14892;
  }

  setListener(fn) {
    this.onLine = fn;
  }

  isAvailable(text, now = Date.now()) {
    const lastUsed = this.history.get(text) || 0;
    return now - lastUsed >= this.repeatCooldownMs;
  }

  trigger(eventTag, now = Date.now()) {
    if (now - this.lastTriggerTime < this.minIntervalMs) {
      return null; // Enforce strict 8s global spacing
    }

    const pool = MEG_DIALOGUE_POOLS[eventTag] || MEG_DIALOGUE_POOLS.idle_encourage;
    const available = pool.filter((line) => this.isAvailable(line, now));

    let chosen = '';
    if (available.length > 0) {
      chosen = available[Math.floor(Math.random() * available.length)];
    } else {
      // Pick oldest
      chosen = pool[0];
    }

    this.lastTriggerTime = now;
    this.history.set(chosen, now);
    this.currentLine = chosen;

    // Viewers react to events
    if (eventTag === 'clean_deorbit') this.viewerCount += Math.floor(Math.random() * 800 + 400);
    if (eventTag === 'collision') this.viewerCount -= Math.floor(Math.random() * 300 + 100);

    if (this.onLine) {
      this.onLine({
        text: chosen,
        eventTag,
        viewers: this.viewerCount,
      });
    }

    return chosen;
  }
}

export const megNarrator = new MegStreamerNarrator();
