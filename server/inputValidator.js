/**
 * ASTRAL ZERO — Input Validation & Sanitization Engine
 *
 * Principles:
 * - Zero-trust: Validate all incoming HTTP and WebSocket payloads.
 * - Strict schema matching: Reject malformed, oversized, or un-whitelisted properties.
 * - Socket packet flood protection: Per-socket rate limiter.
 */

const VALID_ZONES = new Set(['LEO', 'MEO', 'GEO']);

/**
 * Validates zone parameter for deploy_tug, buy_auto_tug, and emergency_purge.
 * @param {any} payload
 * @returns {{ valid: boolean, zone: string, error?: string }}
 */
export function validateZonePayload(payload) {
  if (payload === null || typeof payload !== 'object') {
    return { valid: false, zone: 'LEO', error: 'Payload must be a valid JSON object' };
  }

  const rawZone = payload.zone || payload.zoneId || payload.deptId;
  if (typeof rawZone !== 'string') {
    return { valid: false, zone: 'LEO', error: 'Zone must be a string' };
  }

  const cleanZone = rawZone.trim().toUpperCase();
  if (!VALID_ZONES.has(cleanZone)) {
    return { valid: false, zone: 'LEO', error: `Invalid zone: '${rawZone}'. Allowed: LEO, MEO, GEO.` };
  }

  return { valid: true, zone: cleanZone };
}

/**
 * Socket Rate Limiter (Per-socket packet flood protection).
 * Rejects clients emitting more than 25 socket events per second.
 */
export class SocketRateLimiter {
  constructor(maxEventsPerSec = 25) {
    this.maxEvents = maxEventsPerSec;
    this.buckets = new Map(); // socketId -> { count, resetAt }
  }

  isRateLimited(socketId) {
    const now = Date.now();
    let bucket = this.buckets.get(socketId);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 1, resetAt: now + 1000 };
      this.buckets.set(socketId, bucket);
      return false;
    }

    bucket.count++;
    if (bucket.count > this.maxEvents) {
      return true;
    }

    return false;
  }

  cleanup(socketId) {
    this.buckets.delete(socketId);
  }
}

export const socketLimiter = new SocketRateLimiter(25);
