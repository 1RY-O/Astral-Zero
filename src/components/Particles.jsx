import { useEffect, useRef } from 'react';
import { Renderer, Camera, Geometry, Program, Mesh } from 'ogl';

const VERTEX_SHADER = `
attribute vec3 position;
attribute vec3 color;
attribute float size;
attribute float phase;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform vec2 uMouse;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = color;
  
  // Drift and orbital flutter
  vec3 pos = position;
  pos.x += sin(uTime * 0.35 + phase * 6.28) * 0.25;
  pos.y += cos(uTime * 0.3 + phase * 4.12) * 0.25;
  pos.z += sin(uTime * 0.25 + phase * 2.85) * 0.2;

  // Parallax tracking mouse
  pos.xy += uMouse * 0.4 * (pos.z + 2.5);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Point size attenuated by depth
  float dist = length(mvPosition.xyz);
  gl_PointSize = size * (380.0 / max(dist, 0.2));

  // Twinkle
  vAlpha = 0.35 + 0.65 * sin(uTime * 1.6 + phase * 6.28);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  // Smooth circular dropoff with glowing center
  float strength = 1.0 - smoothstep(0.0, 0.5, dist);
  strength = pow(strength, 1.4);

  gl_FragColor = vec4(vColor, strength * vAlpha);
}
`;

// Helper to convert hex to [r, g, b] normalized
function hexToRGB(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

export default function Particles({
  particleCount = 320,
  particleSpread = 14,
  speed = 0.08,
  particleColors = ['#FFFFFF', '#38BDF8', '#7DD3FC', '#FF2D95', '#FFFFFF'],
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    const renderer = new Renderer({
      alpha: true,
      depth: false,
      powerPreference: 'high-performance',
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const canvas = gl.canvas;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    container.appendChild(canvas);

    const camera = new Camera(gl, { fov: 45 });
    camera.position.set(0, 0, 10);

    // Generate particle attributes
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const phases = new Float32Array(particleCount);

    const colorRGBs = particleColors.map(hexToRGB);

    for (let i = 0; i < particleCount; i += 1) {
      const i3 = i * 3;
      // Distribute in a spherical cloud
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * particleSpread;

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7; // slight vertical compression
      positions[i3 + 2] = r * Math.cos(phi) - 2.0;

      const c = colorRGBs[Math.floor(Math.random() * colorRGBs.length)];
      colors[i3] = c[0];
      colors[i3 + 1] = c[1];
      colors[i3 + 2] = c[2];

      sizes[i] = 1.4 + Math.random() * 3.6;
      phases[i] = Math.random();
    }

    const geometry = new Geometry(gl, {
      position: { size: 3, data: positions },
      color: { size: 3, data: colors },
      size: { size: 1, data: sizes },
      phase: { size: 1, data: phases },
    });

    const program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: [0, 0] },
      },
    });

    const mesh = new Mesh(gl, {
      mode: gl.POINTS,
      geometry,
      program,
    });

    const targetMouse = [0, 0];
    const smoothMouse = [0, 0];

    const onPointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetMouse[0] = x;
      targetMouse[1] = -y;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      camera.perspective({ aspect: rect.width / rect.height });
    };

    window.addEventListener('resize', resize);
    resize();

    let lastTime = performance.now();
    let totalTime = 0;

    const loop = (now) => {
      rafId = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      totalTime += dt * speed;

      smoothMouse[0] += (targetMouse[0] - smoothMouse[0]) * 0.05;
      smoothMouse[1] += (targetMouse[1] - smoothMouse[1]) * 0.05;

      program.uniforms.uTime.value = totalTime;
      program.uniforms.uMouse.value = smoothMouse;

      mesh.rotation.y = totalTime * 0.15;
      mesh.rotation.x = Math.sin(totalTime * 0.1) * 0.08;

      renderer.render({ scene: mesh, camera });
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', resize);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [particleCount, particleSpread, speed, particleColors]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        ...style,
      }}
    />
  );
}
