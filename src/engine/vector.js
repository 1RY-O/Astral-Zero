/**
 * ASTRAL ZERO — 2D vector math helpers.
 * Rewritten in the new style. Raw mechanical utility only.
 */

export class Vec {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy(v) { this.x = v.x; this.y = v.y; return this; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  scale(s) { this.x *= s; this.y *= s; return this; }
  length() { return Math.hypot(this.x, this.y); }
  lengthSq() { return this.x * this.x + this.y * this.y; }
  normalize() { const l = this.length(); if (l > 0) this.scale(1 / l); return this; }
  dist(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  cross(v) { return this.x * v.y - this.y * v.x; }
  rotate(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const x = this.x * c - this.y * s;
    this.y = this.x * s + this.y * c;
    this.x = x;
    return this;
  }
  clamp(max) {
    const l = this.length();
    if (l > max) this.scale(max / l);
    return this;
  }
  static fromAngle(a) { return new Vec(Math.cos(a), Math.sin(a)); }
  static zero() { return new Vec(0, 0); }
}

export function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function lerpVec(a, b, t, out = new Vec()) {
  return out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
}
