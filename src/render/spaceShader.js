/**
 * ASTRAL ZERO — Acid-Wave Hybrid Procedural Shader.
 * Renders a slow, luminous, liquid acid-wave gradient field
 * bleeding Terminal Riot Signal Cyan (#4DFFDF) into Plasma Magenta / Grid Violet (#8C4DFF / #FF4DE1).
 * Built for the NASA International Space Apps Challenge 2026.
 */

export class SpaceBackgroundShader {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, depth: false });
    this.program = null;
    this.timeUniform = null;
    this.resolutionUniform = null;
    this.mouseUniform = null;
    this.mouse = { x: 0.5, y: 0.5 };
    this.startTime = performance.now();

    if (this.gl) {
      this.init();
    }
  }

  init() {
    const gl = this.gl;

    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;

      // 2D Hash function
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // 2D Value Noise
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      // Fractional Brownian Motion (3 Octaves for silky liquid performance)
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
        for (int i = 0; i < 3; ++i) {
          v += a * noise(p);
          p = rot * p * 2.0 + shift;
          a *= 0.5;
        }
        return v;
      }

      // Star glints
      float stars(vec2 uv, float scale, float speed) {
        vec2 p = uv * scale + vec2(u_time * speed * 0.02, -u_time * speed * 0.01);
        vec2 id = floor(p);
        vec2 gv = fract(p) - 0.5;
        float n = hash(id);
        float d = length(gv);
        float star = smoothstep(0.09 * n, 0.0, d) * step(0.965, n);
        return star * (0.5 + 0.5 * sin(u_time * 3.0 + n * 6.28));
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
        uv += (u_mouse - 0.5) * 0.06;

        float t = u_time * 0.14;

        // Domain warping: liquid folds
        vec2 q = vec2(
          fbm(uv * 1.5 + vec2(t * 0.25, -t * 0.15)),
          fbm(uv * 1.5 + vec2(-t * 0.18, t * 0.22))
        );

        vec2 r = vec2(
          fbm(uv * 2.0 + 3.0 * q + vec2(t * 0.35, t * 0.10)),
          fbm(uv * 2.0 + 3.0 * q + vec2(-t * 0.12, -t * 0.30))
        );

        float f = fbm(uv * 1.8 + 4.0 * r);

        // Terminal Riot Palette Colors
        vec3 deepVacuum   = vec3(0.045, 0.020, 0.085); // #0D0618
        vec3 plasmaViolet = vec3(0.48, 0.18, 0.88);    // Grid Violet #8C4DFF / Plasma #FF4DE1
        vec3 signalCyan   = vec3(0.20, 0.95, 0.82);    // Signal Cyan #4DFFDF
        vec3 solarAmber   = vec3(1.00, 0.55, 0.20);    // Solar Gold #FF9E3D

        // Liquid color bleed interpolation
        vec3 col = deepVacuum;
        col = mix(col, plasmaViolet, smoothstep(0.15, 0.70, f * 1.15));
        col = mix(col, signalCyan, smoothstep(0.40, 0.90, length(q) * f));
        col = mix(col, solarAmber, smoothstep(0.80, 1.05, f + r.x * 0.35) * 0.35);

        // Retain dark contrast in hero reading zone so ASCII stays razor sharp
        col *= 0.75 + 0.25 * smoothstep(0.0, 1.2, length(uv));

        // Subtle twinkling star field layer over the liquid ripples
        col += vec3(0.9, 0.95, 1.0) * stars(uv, 35.0, 0.15) * 0.7;
        col += vec3(0.3, 1.0, 0.85) * stars(uv, 60.0, 0.08) * 0.5;

        // Subtle analog cathode scanlines
        float scanline = sin(gl_FragCoord.y * 1.8) * 0.04;
        col -= scanline;

        // Vignette
        vec2 sc = gl_FragCoord.xy / u_resolution.xy;
        float vig = sc.x * sc.y * (1.0 - sc.x) * (1.0 - sc.y);
        col *= clamp(pow(16.0 * vig, 0.30), 0.0, 1.0);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('SpaceBackgroundShader link error:', gl.getProgramInfoLog(program));
      return;
    }

    this.program = program;
    gl.useProgram(program);

    // Fullscreen quad
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posAttr = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    this.timeUniform = gl.getUniformLocation(program, 'u_time');
    this.resolutionUniform = gl.getUniformLocation(program, 'u_resolution');
    this.mouseUniform = gl.getUniformLocation(program, 'u_mouse');

    this.resize(this.canvas.width, this.canvas.height);
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('SpaceBackgroundShader compile error:', gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  resize(w, h) {
    if (!this.gl || !this.program) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.resolutionUniform, w, h);
  }

  setMouse(x, y) {
    this.mouse.x = x / (this.canvas.width || 1);
    this.mouse.y = 1.0 - y / (this.canvas.height || 1);
  }

  render(now = performance.now()) {
    const gl = this.gl;
    if (!gl || !this.program) return;

    const time = (now - this.startTime) / 1000;

    gl.useProgram(this.program);
    gl.uniform1f(this.timeUniform, time);
    gl.uniform2f(this.mouseUniform, this.mouse.x, this.mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
