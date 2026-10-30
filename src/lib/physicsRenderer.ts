/**
 * Debris Derby — High-End WebGL Physics Renderer.
 *
 * Implements:
 * 1. Procedural multi-layer starfield with parallax tracking ship movement/thrust
 * 2. Massive curved Earth limb with Rayleigh-style atmospheric rim glow
 * 3. Varied faceted grey polygon debris with subtle white outlines
 * 4. Glowing sky-blue tether connecting ship to grabbed debris
 * 5. Dotted forward trajectory preview: --sky for retrograde, --pink for prograde
 * 6. Top/bottom shade gradient overlay
 * 7. Flash screen --pink on tether snap
 */

export interface RendererOptions {
  canvas: HTMLCanvasElement;
}

// Strict palette tokens
const NIGHT = [6 / 255, 13 / 255, 31 / 255]; // #060D1F
const SKY = [56 / 255, 189 / 255, 248 / 255]; // #38BDF8
const PINK = [255 / 255, 45 / 255, 149 / 255]; // #FF2D95
const WHITE = [1.0, 1.0, 1.0];

const BG_VS = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const BG_FS = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_parallax;
uniform vec2 u_planetCenter;
uniform float u_planetRadius;
uniform float u_flashPink;

const vec3 C_NIGHT = vec3(0.0235, 0.051, 0.1216);
const vec3 C_SKY   = vec3(0.2196, 0.7412, 0.9725);
const vec3 C_PINK  = vec3(1.0, 0.1765, 0.5843);
const vec3 C_WHITE = vec3(1.0, 1.0, 1.0);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float starLayer(vec2 uv, float scale, float threshold, float twinkleSpeed, float seed) {
  vec2 gv = fract(uv * scale) - 0.5;
  vec2 id = floor(uv * scale) + seed;
  float n = hash21(id);
  if (n < threshold) return 0.0;

  vec2 offset = vec2(hash21(id + 1.2), hash21(id + 2.7)) - 0.5;
  float d = length(gv - offset * 0.7);

  float twinkle = 0.75 + 0.25 * sin(u_time * twinkleSpeed + n * 6.283);
  float brightness = (n - threshold) / (1.0 - threshold);
  return smoothstep(0.05, 0.0, d) * brightness * twinkle;
}

void main() {
  vec2 fragCoord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec2 uv = fragCoord / max(u_resolution.x, u_resolution.y);

  // Parallax starfield
  vec3 color = C_NIGHT;
  float s1 = starLayer(uv + u_parallax * 0.0003, 70.0, 0.94, 2.5, 11.0);
  float s2 = starLayer(uv + u_parallax * 0.0007, 130.0, 0.96, 3.2, 43.0);
  float s3 = starLayer(uv + u_parallax * 0.0012, 220.0, 0.98, 4.0, 97.0);
  float totalStars = s1 * 0.6 + s2 * 0.85 + s3 * 1.0;
  color += C_WHITE * totalStars;

  // Earth limb & Atmosphere
  float dist = length(fragCoord - u_planetCenter);
  float d = dist - u_planetRadius;

  if (d < 0.0) {
    // Inside planet surface: #060D1F with subtle rim transition
    float rimDepth = smoothstep(-30.0, 0.0, d);
    color = mix(C_NIGHT * 0.6, C_NIGHT + C_SKY * 0.12, rimDepth);
  } else {
    // Atmospheric glow extending upward from the planet edge
    float rimGlow = exp(-d / 14.0) * 1.5;
    float upperAtmosphere = exp(-d / 70.0) * 0.5 + exp(-d / 180.0) * 0.2;
    float atmosphere = rimGlow + upperAtmosphere;
    color += C_SKY * atmosphere;
  }

  // The Shade: linear-gradient(180deg, rgba(6,13,31,0.1), transparent 50%, rgba(6,13,31,0.8))
  float ny = fragCoord.y / u_resolution.y;
  float shadeAlpha = 0.0;
  if (ny < 0.5) {
    shadeAlpha = mix(0.1, 0.0, ny * 2.0);
  } else {
    shadeAlpha = mix(0.0, 0.8, (ny - 0.5) * 2.0);
  }
  color = mix(color, C_NIGHT, shadeAlpha);

  // Screen flash --pink on tether snap
  if (u_flashPink > 0.0) {
    color = mix(color, C_PINK, u_flashPink * 0.6);
  }

  float bgAlpha = d < 0.0 ? 1.0 : 0.65;
  gl_FragColor = vec4(color, bgAlpha);
}
`;

const GEO_VS = `
attribute vec2 a_pos;
attribute vec4 a_color;
uniform vec2 u_resolution;
varying vec4 v_color;

void main() {
  vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}
`;

const GEO_FS = `
precision highp float;
varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation error: ${info}`);
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

interface ParticlePolygon {
  numPoints: number;
  angles: number[];
  radii: number[];
}

export class WebGLPhysicsRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private bgProgram: WebGLProgram | null = null;
  private geoProgram: WebGLProgram | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private geoBuffer: WebGLBuffer | null = null;

  // Uniform locations
  private bgUniforms: Record<string, WebGLUniformLocation | null> = {};
  private geoUniforms: Record<string, WebGLUniformLocation | null> = {};

  // Geometry batch
  private maxVertices = 16384;
  private vertexData = new Float32Array(16384 * 6); // x, y, r, g, b, a
  private vertexCount = 0;

  // Cached debris polygon definitions
  private polygonCache = new Map<string, ParticlePolygon>();

  // Smooth parallax tracking
  private parallaxX = 0;
  private parallaxY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl =
      (canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      }) as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      console.warn('WebGL not supported; falling back to 2D canvas');
      return;
    }
    this.gl = gl;
    this.initGL();
  }

  private initGL() {
    const gl = this.gl;
    if (!gl) return;

    this.bgProgram = createProgram(gl, BG_VS, BG_FS);
    this.bgUniforms = {
      resolution: gl.getUniformLocation(this.bgProgram, 'u_resolution'),
      time: gl.getUniformLocation(this.bgProgram, 'u_time'),
      parallax: gl.getUniformLocation(this.bgProgram, 'u_parallax'),
      planetCenter: gl.getUniformLocation(this.bgProgram, 'u_planetCenter'),
      planetRadius: gl.getUniformLocation(this.bgProgram, 'u_planetRadius'),
      flashPink: gl.getUniformLocation(this.bgProgram, 'u_flashPink'),
    };

    this.geoProgram = createProgram(gl, GEO_VS, GEO_FS);
    this.geoUniforms = {
      resolution: gl.getUniformLocation(this.geoProgram, 'u_resolution'),
    };

    // Fullscreen quad buffer
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    // Dynamic geometry buffer
    this.geoBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
  }

  private getPolygon(id: string, radius: number): ParticlePolygon {
    let poly = this.polygonCache.get(id);
    if (!poly) {
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0;
      }
      const absHash = Math.abs(hash);
      const numPoints = 5 + (absHash % 3); // 5, 6, or 7-sided polygon
      const angles: number[] = [];
      const radii: number[] = [];

      for (let i = 0; i < numPoints; i++) {
        const baseAngle = (i / numPoints) * Math.PI * 2;
        const jitterA = (((absHash * (i + 1) * 7) % 100) / 100 - 0.5) * 0.35;
        angles.push(baseAngle + jitterA);

        const rFactor = 0.75 + (((absHash * (i + 2) * 13) % 100) / 100) * 0.45;
        radii.push(rFactor);
      }
      poly = { numPoints, angles, radii };
      this.polygonCache.set(id, poly);
    }
    return poly;
  }

  private pushVertex(x: number, y: number, r: number, g: number, b: number, a: number) {
    if (this.vertexCount >= this.maxVertices) return;
    const idx = this.vertexCount * 6;
    this.vertexData[idx] = x;
    this.vertexData[idx + 1] = y;
    this.vertexData[idx + 2] = r;
    this.vertexData[idx + 3] = g;
    this.vertexData[idx + 4] = b;
    this.vertexData[idx + 5] = a;
    this.vertexCount++;
  }

  private drawLineSegment(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number,
    color: number[],
    alpha: number = 1.0,
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1e-5;
    const nx = (-dy / len) * (width * 0.5);
    const ny = (dx / len) * (width * 0.5);

    const [r, g, b] = color;
    // Triangle 1
    this.pushVertex(x1 + nx, y1 + ny, r, g, b, alpha);
    this.pushVertex(x2 + nx, y2 + ny, r, g, b, alpha);
    this.pushVertex(x1 - nx, y1 - ny, r, g, b, alpha);

    // Triangle 2
    this.pushVertex(x1 - nx, y1 - ny, r, g, b, alpha);
    this.pushVertex(x2 + nx, y2 + ny, r, g, b, alpha);
    this.pushVertex(x2 - nx, y2 - ny, r, g, b, alpha);
  }

  private drawCircle(
    cx: number,
    cy: number,
    radius: number,
    color: number[],
    alpha: number = 1.0,
    segments = 16,
  ) {
    const [r, g, b] = color;
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      this.pushVertex(cx, cy, r, g, b, alpha);
      this.pushVertex(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, r, g, b, alpha);
      this.pushVertex(cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius, r, g, b, alpha);
    }
  }

  public render(world: any, width: number, height: number, timeSeconds: number) {
    const gl = this.gl;
    if (!gl) {
      this.render2DFallback(world, width, height, timeSeconds);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    gl.viewport(0, 0, width * dpr, height * dpr);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Parallax update based on ship / anchor position and thrust
    const anchor = world.anchor;
    if (anchor) {
      const defaultX = width * 0.5;
      const defaultY = height * 0.22;
      const dx = anchor.x - defaultX;
      const dy = anchor.y - defaultY;
      this.parallaxX += (dx * 2.0 - this.parallaxX) * 0.08;
      this.parallaxY += (dy * 2.0 - this.parallaxY) * 0.08;
      if (world.thrusting) {
        this.parallaxX += (Math.random() - 0.5) * 4.0;
        this.parallaxY += (Math.random() - 0.5) * 4.0;
      }
    }

    const limb = world.getPlanetLimb ? world.getPlanetLimb() : {
      cx: width * 0.5,
      cy: height - 40 + Math.max(width, height) * 2,
      r: Math.max(width, height) * 2,
    };

    // 1. Render Background Shader (Starfield + Earth Limb + Atmospheric Glow + Shade)
    if (this.bgProgram && this.quadBuffer) {
      gl.useProgram(this.bgProgram);
      gl.uniform2f(this.bgUniforms.resolution, width, height);
      gl.uniform1f(this.bgUniforms.time, timeSeconds);
      gl.uniform2f(this.bgUniforms.parallax, this.parallaxX, this.parallaxY);
      gl.uniform2f(this.bgUniforms.planetCenter, limb.cx, limb.cy);
      gl.uniform1f(this.bgUniforms.planetRadius, limb.r);
      gl.uniform1f(this.bgUniforms.flashPink, world.flashPink || 0);

      const aPos = gl.getAttribLocation(this.bgProgram, 'a_pos');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(aPos);
    }

    // 2. Build and Render Dynamic Geometry (Debris, Ship, Tether, Trajectory)
    this.vertexCount = 0;
    const grabbed = world.grabbed;

    // A. Trajectory Preview: Dotted line from grabbed object
    if (grabbed) {
      const dt = 1 / 60;
      const vx = (grabbed.x - grabbed.px) / dt;
      const vy = (grabbed.y - grabbed.py) / dt;
      const isPrograde = vx > 0;
      const trajColor = isPrograde ? PINK : SKY;

      let simX = grabbed.x;
      let simY = grabbed.y;
      let simVx = vx;
      let simVy = vy;

      // Predict 80 steps forward
      for (let step = 0; step < 80; step++) {
        simX += simVx * dt;
        simY += simVy * dt;
        simVx *= 0.9995;
        simVy *= 0.9995;

        // Draw glowing dots every 4 steps
        if (step % 4 === 0 && step > 0) {
          const alpha = 1.0 - step / 85;
          this.drawCircle(simX, simY, 2.5, trajColor, alpha * 0.9, 8);
          // Glow halo
          this.drawCircle(simX, simY, 5.0, trajColor, alpha * 0.25, 8);
        }
      }
    }

    // Celestial Moon: Rendered in Level 2 for "Two-Body Problem: Gravity Assist"
    if (world.levelId === 2) {
      const moonX = width * 0.76;
      const moonY = height * 0.18;
      const moonR = 26;
      this.drawCircle(moonX, moonY, moonR + 12, SKY, 0.12, 24);
      this.drawCircle(moonX, moonY, moonR + 4, WHITE, 0.22, 24);
      this.drawCircle(moonX, moonY, moonR, [0.88, 0.92, 0.96], 0.95, 28);
      this.drawCircle(moonX - 7, moonY - 6, 5, [0.72, 0.76, 0.82], 0.65, 12);
      this.drawCircle(moonX + 8, moonY + 7, 6, [0.72, 0.76, 0.82], 0.65, 12);
      this.drawCircle(moonX - 4, moonY + 9, 3.5, [0.72, 0.76, 0.82], 0.65, 12);
      this.drawCircle(moonX + 4, moonY - 8, 3.5, [0.72, 0.76, 0.82], 0.65, 12);
    }

    // B. Tether: Glowing --sky line connecting ship to grabbed debris
    if (world.tether && grabbed && anchor) {
      const tension = world.tension || 0;
      const tetherColor = tension > 20 ? PINK : SKY;
      // Outer glow line
      this.drawLineSegment(anchor.x, anchor.y, grabbed.x, grabbed.y, 8.0, tetherColor, 0.35);
      // Inner sharp core line
      this.drawLineSegment(anchor.x, anchor.y, grabbed.x, grabbed.y, 2.5, WHITE, 0.9);
      this.drawLineSegment(anchor.x, anchor.y, grabbed.x, grabbed.y, 3.5, tetherColor, 0.85);
    }

    // C. Floating Debris: Varied grey polygons with subtle --white outlines
    for (const p of world.particles) {
      if (p.fixed) continue;
      const isGrab = p === grabbed;
      const poly = this.getPolygon(p.id, p.radius);
      const n = poly.numPoints;

      // Center point for fan triangulation
      const cx = p.x;
      const cy = p.y;

      // Polygon fill (varied faceted grey shading)
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const a1 = poly.angles[i];
        const a2 = poly.angles[next];
        const r1 = p.radius * poly.radii[i];
        const r2 = p.radius * poly.radii[next];

        const p1x = cx + Math.cos(a1) * r1;
        const p1y = cy + Math.sin(a1) * r1;
        const p2x = cx + Math.cos(a2) * r2;
        const p2y = cy + Math.sin(a2) * r2;

        // Facet tone based on angle for high-end 3D metallic feel
        const shade = 0.22 + 0.18 * Math.cos(a1 - 0.7);
        const [fr, fg, fb] = isGrab ? [0.45, 0.15, 0.3] : [shade, shade * 1.05, shade * 1.15];

        this.pushVertex(cx, cy, fr, fg, fb, 1.0);
        this.pushVertex(p1x, p1y, fr, fg, fb, 1.0);
        this.pushVertex(p2x, p2y, fr, fg, fb, 1.0);
      }

      // Subtle --white outline
      const outlineColor = isGrab ? SKY : WHITE;
      const outlineAlpha = isGrab ? 0.95 : 0.65;
      const lineWidth = isGrab ? 2.0 : 1.2;

      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const a1 = poly.angles[i];
        const a2 = poly.angles[next];
        const r1 = p.radius * poly.radii[i];
        const r2 = p.radius * poly.radii[next];

        const p1x = cx + Math.cos(a1) * r1;
        const p1y = cy + Math.sin(a1) * r1;
        const p2x = cx + Math.cos(a2) * r2;
        const p2y = cy + Math.sin(a2) * r2;

        this.drawLineSegment(p1x, p1y, p2x, p2y, lineWidth, outlineColor, outlineAlpha);
      }

      // If grabbed: add highlight ring
      if (isGrab) {
        this.drawCircle(cx, cy, p.radius + 8, PINK, 0.25, 20);
      }
    }

    // D. Player Ship / Anchor: Sleek cleanup tug with thruster plume
    if (anchor) {
      const ax = anchor.x;
      const ay = anchor.y;

      // Thruster plume when thrusting
      if (world.thrusting) {
        const flameLen = 18 + Math.random() * 8;
        this.drawCircle(ax, ay - flameLen * 0.5, 4.0, PINK, 0.75, 10);
        this.drawCircle(ax, ay - flameLen * 0.8, 6.0, SKY, 0.5, 10);
      }

      // Sleek tug ship: triangular hull
      const shipSize = 12;
      const tipX = ax;
      const tipY = ay + shipSize;
      const leftX = ax - shipSize * 0.8;
      const leftY = ay - shipSize * 0.6;
      const rightX = ax + shipSize * 0.8;
      const rightY = ay - shipSize * 0.6;

      // Hull fill (sleek deep substrate with sky trim)
      this.pushVertex(tipX, tipY, SKY[0], SKY[1], SKY[2], 0.9);
      this.pushVertex(leftX, leftY, NIGHT[0] * 3, NIGHT[1] * 3, NIGHT[2] * 3, 1.0);
      this.pushVertex(rightX, rightY, NIGHT[0] * 3, NIGHT[1] * 3, NIGHT[2] * 3, 1.0);

      // Hull outlines
      this.drawLineSegment(tipX, tipY, leftX, leftY, 1.8, WHITE, 0.95);
      this.drawLineSegment(tipX, tipY, rightX, rightY, 1.8, WHITE, 0.95);
      this.drawLineSegment(leftX, leftY, rightX, rightY, 1.5, SKY, 0.8);

      // Cockpit / Winch core
      this.drawCircle(ax, ay - 1, 3.2, WHITE, 1.0, 10);
      this.drawCircle(ax, ay - 1, 5.0, SKY, 0.45, 10);
    }

    // Draw dynamic geometry batch
    if (this.geoProgram && this.geoBuffer && this.vertexCount > 0) {
      gl.useProgram(this.geoProgram);
      gl.uniform2f(this.geoUniforms.resolution, width, height);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        this.vertexData.subarray(0, this.vertexCount * 6),
      );

      const aPos = gl.getAttribLocation(this.geoProgram, 'a_pos');
      const aColor = gl.getAttribLocation(this.geoProgram, 'a_color');

      gl.enableVertexAttribArray(aPos);
      gl.enableVertexAttribArray(aColor);

      const stride = 6 * 4; // 6 floats * 4 bytes
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 2 * 4);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

      gl.disableVertexAttribArray(aPos);
      gl.disableVertexAttribArray(aColor);
    }
  }

  // Fallback for headless environments without WebGL context
  private render2DFallback(
    world: any,
    width: number,
    height: number,
    _timeSeconds: number,
  ) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = '#060D1F';
    ctx.fillRect(0, 0, width, height);

    // Earth limb
    const limb = world.getPlanetLimb ? world.getPlanetLimb() : {
      cx: width * 0.5,
      cy: height - 40 + Math.max(width, height) * 2,
      r: Math.max(width, height) * 2,
    };

    ctx.beginPath();
    ctx.arc(limb.cx, limb.cy, limb.r, 0, Math.PI * 2);
    ctx.fillStyle = '#060D1F';
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Tether
    if (world.tether && world.grabbed && world.anchor) {
      ctx.beginPath();
      ctx.moveTo(world.anchor.x, world.anchor.y);
      ctx.lineTo(world.grabbed.x, world.grabbed.y);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Particles
    for (const p of world.particles) {
      if (p.fixed) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p === world.grabbed ? '#FF2D95' : 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }
}
