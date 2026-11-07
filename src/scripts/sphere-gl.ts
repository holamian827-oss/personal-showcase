/**
 * 零依赖 WebGL2 线框球。
 * 对比 R3F 版本：没有 React / three.js 运行时，1 个 shader program，
 * 线框、点云、轨道环分 3 次 draw call，首屏 JS 从 ~300 KB gzip 降到 ~10 KB。
 */

import wasmUrl from '../wasm/sphere-core.wasm?url';

type Vec3 = [number, number, number];
type Quality = 'high' | 'low';

type SphereWasm = {
  memory: WebAssembly.Memory;
  __new: (size: number, id: number) => number;
  fillParticles: (count: number, ptr: number) => void;
};

/** 核心粒子分布由 WASM 生成；失败时保留 JS 版本，不影响渲染。 */
async function particlesFromWasm(count: number): Promise<Float32Array | null> {
  try {
    const response = await fetch(wasmUrl);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {
      env: {
        abort: () => {
          throw new Error('wasm abort');
        },
      },
    });
    const wasm = instance.exports as unknown as SphereWasm;
    const ptr = wasm.__new(count * 5 * 4, 0);
    wasm.fillParticles(count, ptr);
    return new Float32Array(wasm.memory.buffer, ptr, count * 5).slice();
  } catch {
    return null;
  }
}

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function icosahedron(level: number) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: Vec3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => normalize(v as Vec3));

  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let l = 0; l < level; l++) {
    const cache = new Map<string, number>();
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const va = verts[a];
      const vb = verts[b];
      verts.push(normalize([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]));
      const index = verts.length - 1;
      cache.set(key, index);
      return index;
    };

    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  const seen = new Set<string>();
  const edges: number[] = [];
  for (const [a, b, c] of faces) {
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(i, j);
    }
  }

  return { verts, edges };
}

function fibonacciPoints(count: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const radius = 1.38 + (Math.random() - 0.5) * 0.1;
    out[i * 3] = Math.cos(theta) * r * radius;
    out[i * 3 + 1] = y * radius;
    out[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return out;
}

function ringPoints(segments: number) {
  const out = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out[i * 3] = Math.cos(a) * 1.75;
    out[i * 3 + 1] = Math.sin(a) * 1.75;
    out[i * 3 + 2] = 0;
  }
  return out;
}

const VERT = `#version 300 es
precision highp float;

in vec3 aPos;
uniform mat4 uProj;
uniform vec4 uRot;     // xyz = euler, w = uniform scale
uniform vec3 uOffset;
uniform float uPointSize;
uniform float uIsPoint;

out float vFade;

vec3 rotX(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}
vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
vec3 rotZ(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

void main() {
  vec3 p = aPos * uRot.w;
  p = rotZ(p, uRot.z);
  p = rotY(p, uRot.y);
  p = rotX(p, uRot.x);
  p += uOffset;

  vec4 mv = vec4(p, 1.0) + vec4(0.0, 0.0, -4.7, 0.0);
  gl_Position = uProj * mv;
  gl_PointSize = uIsPoint > 0.5 ? uPointSize / max(-mv.z, 0.1) : 1.0;
  vFade = smoothstep(0.0, 0.35, -mv.z);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec4 uColor;
uniform float uIsPoint;

in float vFade;
out vec4 outColor;

void main() {
  if (uIsPoint > 0.5) {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
  }
  outColor = vec4(uColor.rgb, uColor.a * vFade);
}
`;

const PARTICLE_VERT = `#version 300 es
precision highp float;

in vec3 aDir;
in float aSeed;
in float aRadius;

uniform mat4 uProj;
uniform float uTime;
uniform vec2 uMouse;
uniform float uPointSize;
uniform float uScroll;

out float vAlpha;
out float vMix;

vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

void main() {
  float spin = uTime * (0.06 + aSeed * 0.1);
  vec3 d = rotY(aDir, spin);
  float wobble = sin(uTime * 0.5 + aSeed * 30.0) * 0.05;
  float r = aRadius + wobble - uScroll * 0.25;
  vec3 p = d * r;

  p.x += uMouse.x * 0.18 * (aRadius - 1.5);
  p.y += uMouse.y * 0.12 * (aRadius - 1.5);

  vec4 mv = vec4(p, 1.0) + vec4(0.0, 0.0, -4.7, 0.0);
  gl_Position = uProj * mv;
  gl_PointSize = uPointSize * (0.55 + aSeed * 0.9) / max(-mv.z, 0.1);

  vAlpha = 0.2 + aSeed * 0.42;
  vMix = step(0.84, aSeed);
}
`;

const PARTICLE_FRAG = `#version 300 es
precision highp float;

in float vAlpha;
in float vMix;
out vec4 outColor;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;

  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  vec3 col = mix(vec3(0.945, 0.945, 0.918), vec3(0.788, 1.0, 0.239), vMix);
  outColor = vec4(col, a);
}
`;

function particleField(count: number) {
  const data = new Float32Array(count * 5);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dir = normalize([
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
    ]);
    const seed = Math.random();
    const radius = 1.65 + Math.pow(Math.random(), 1.6) * 0.95;
    data[i * 5] = dir[0];
    data[i * 5 + 1] = dir[1];
    data[i * 5 + 2] = dir[2];
    data[i * 5 + 3] = seed;
    data[i * 5 + 4] = radius;
  }
  return data;
}

function perspective(aspect: number, fovDeg = 42, near = 0.1, far = 30) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

const detectQuality = (): Quality => {
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= 4 || memory <= 4 || window.matchMedia('(max-width: 720px)').matches
    ? 'low'
    : 'high';
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function mountSphere(canvas: HTMLCanvasElement): (() => void) | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });

  if (!gl) return null;

  const quality = detectQuality();
  const level = quality === 'high' ? 3 : 2;
  const pointCount = quality === 'high' ? 1200 : 560;
  const maxDpr = quality === 'high' ? 1.5 : 1.1;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const uniforms = {
    proj: gl.getUniformLocation(program, 'uProj'),
    rot: gl.getUniformLocation(program, 'uRot'),
    offset: gl.getUniformLocation(program, 'uOffset'),
    pointSize: gl.getUniformLocation(program, 'uPointSize'),
    isPoint: gl.getUniformLocation(program, 'uIsPoint'),
    color: gl.getUniformLocation(program, 'uColor'),
  };
  const aPos = gl.getAttribLocation(program, 'aPos');

  // ---- 粒子层：独立的轻量 program，一次 draw call ----
  const pVertex = compile(gl.VERTEX_SHADER, PARTICLE_VERT);
  const pFragment = compile(gl.FRAGMENT_SHADER, PARTICLE_FRAG);
  if (!pVertex || !pFragment) return null;

  const particleProgram = gl.createProgram();
  if (!particleProgram) return null;
  gl.attachShader(particleProgram, pVertex);
  gl.attachShader(particleProgram, pFragment);
  gl.linkProgram(particleProgram);
  if (!gl.getProgramParameter(particleProgram, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(particleProgram));
    return null;
  }

  const particleUniforms = {
    proj: gl.getUniformLocation(particleProgram, 'uProj'),
    time: gl.getUniformLocation(particleProgram, 'uTime'),
    mouse: gl.getUniformLocation(particleProgram, 'uMouse'),
    pointSize: gl.getUniformLocation(particleProgram, 'uPointSize'),
    scroll: gl.getUniformLocation(particleProgram, 'uScroll'),
  };
  const particleAttribs = {
    dir: gl.getAttribLocation(particleProgram, 'aDir'),
    seed: gl.getAttribLocation(particleProgram, 'aSeed'),
    radius: gl.getAttribLocation(particleProgram, 'aRadius'),
  };

  const { verts, edges } = icosahedron(level);
  const positions = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => {
    positions[i * 3] = v[0];
    positions[i * 3 + 1] = v[1];
    positions[i * 3 + 2] = v[2];
  });
  const edgePositions = new Float32Array(edges.length * 3);
  edges.forEach((index, i) => {
    const v = verts[index];
    edgePositions[i * 3] = v[0];
    edgePositions[i * 3 + 1] = v[1];
    edgePositions[i * 3 + 2] = v[2];
  });

  const createBuffer = (data: Float32Array) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  };

  const edgeBuffer = createBuffer(edgePositions);
  const pointBuffer = createBuffer(fibonacciPoints(pointCount));
  const ringBuffer = createBuffer(ringPoints(180));
  const satelliteBuffer = createBuffer(new Float32Array([0, 0, 0]));
  const particleCount = quality === 'high' ? 12000 : 4500;
  const particleBuffer = createBuffer(particleField(particleCount));

  // 异步用 WASM 生成的分布替换 JS 版本
  particlesFromWasm(particleCount).then((data) => {
    if (!data) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    canvas.dataset.wasm = '1';
  });

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  let dpr = 1;
  let width = 1;
  let height = 1;
  let proj = perspective(1);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    width = Math.max(1, Math.round(rect.width * dpr));
    height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    proj = perspective(width / height);
  };

  const draw = (
    buffer: WebGLBuffer,
    mode: number,
    count: number,
    color: [number, number, number, number],
    pointSize: number,
    rot: [number, number, number, number],
    offset: [number, number, number],
  ) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(uniforms.rot, rot[0], rot[1], rot[2], rot[3]);
    gl.uniform3f(uniforms.offset, offset[0], offset[1], offset[2]);
    gl.uniform4f(uniforms.color, color[0], color[1], color[2], color[3]);
    gl.uniform1f(uniforms.pointSize, pointSize);
    gl.uniform1f(uniforms.isPoint, mode === gl.POINTS ? 1 : 0);
    gl.drawArrays(mode, 0, count);
  };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let running = true;
  let raf = 0;
  let live = false;
  let start = performance.now() / 1000;

  const onPointer = (event: PointerEvent) => {
    mouse.tx = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (event.clientY / window.innerHeight) * 2 - 1;
  };

  const render = (now: number) => {
    if (!running) return;
    const t = reduced ? 0 : now / 1000 - start;

    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    const scroll = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1);
    const breathe = reduced ? 1 : 1 + Math.sin(t * 0.85) * 0.012;
    const scale = breathe * (1 - scroll * 0.12);
    const offsetY = scroll * -0.35;
    const euler = reduced ? [0.12, 0, 0] : [mouse.y * 0.22, t * 0.14 + mouse.x * 0.45, -mouse.x * 0.1];
    const sphereRot: [number, number, number, number] = [euler[0], euler[1], euler[2], scale * 1.32];
    const pointRot: [number, number, number, number] = [euler[0], euler[1], euler[2], scale];

    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(uniforms.proj, false, proj);

    const ringRotX = 1.15 + Math.sin(t * 0.25) * 0.08;
    const ringRotZ = 0.2 + t * 0.06;

    // 粒子层先画，视觉上在球体后面
    gl.useProgram(particleProgram);
    gl.uniformMatrix4fv(particleUniforms.proj, false, proj);
    gl.uniform1f(particleUniforms.time, t);
    gl.uniform2f(particleUniforms.mouse, mouse.x, mouse.y);
    gl.uniform1f(
      particleUniforms.pointSize,
      (quality === 'high' ? 1.45 : 1.8) * dpr * 4.7,
    );
    gl.uniform1f(particleUniforms.scroll, scroll);

    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.enableVertexAttribArray(particleAttribs.dir);
    gl.vertexAttribPointer(particleAttribs.dir, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(particleAttribs.seed);
    gl.vertexAttribPointer(particleAttribs.seed, 1, gl.FLOAT, false, 20, 12);
    gl.enableVertexAttribArray(particleAttribs.radius);
    gl.vertexAttribPointer(particleAttribs.radius, 1, gl.FLOAT, false, 20, 16);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, particleCount);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.disableVertexAttribArray(particleAttribs.dir);
    gl.disableVertexAttribArray(particleAttribs.seed);
    gl.disableVertexAttribArray(particleAttribs.radius);

    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.proj, false, proj);

    draw(
      ringBuffer,
      gl.LINE_STRIP,
      181,
      [0.945, 0.945, 0.918, 0.22],
      0,
      [ringRotX, 0, ringRotZ, 1],
      [0, offsetY, 0],
    );

    draw(
      edgeBuffer,
      gl.LINES,
      edges.length,
      [0.945, 0.945, 0.918, 0.36],
      0,
      sphereRot,
      [0, offsetY, 0],
    );

    draw(
      pointBuffer,
      gl.POINTS,
      pointCount,
      [0.788, 1, 0.239, 0.78],
      (quality === 'high' ? 1.25 : 1.6) * dpr * 4.7,
      pointRot,
      [0, offsetY, 0],
    );

    // 轨道上的卫星点
    const sx = Math.cos(ringRotZ) * 1.75;
    const sy = Math.sin(ringRotZ) * 1.75;
    const cy = Math.cos(ringRotX);
    const sy2 = Math.sin(ringRotX);
    draw(
      satelliteBuffer,
      gl.POINTS,
      1,
      [0.788, 1, 0.239, 1],
      5 * dpr * 4.7,
      [0, 0, 0, 1],
      [sx, sy * cy + offsetY, sy * sy2],
    );

    if (!live) {
      live = true;
      document.querySelector('.hero__stage')?.classList.add('is-live');
    }

    if (reduced) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(render);
  };

  resize();
  raf = requestAnimationFrame(render);

  window.addEventListener('pointermove', onPointer, { passive: true });

  const hero = document.querySelector('.hero');
  const observer = hero
    ? new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !running && !reduced) {
            running = true;
            start = performance.now() / 1000;
            raf = requestAnimationFrame(render);
          } else if (!entry.isIntersecting && running && !reduced) {
            running = false;
            cancelAnimationFrame(raf);
          }
        },
        { rootMargin: '160px' },
      )
    : null;
  if (hero && observer) observer.observe(hero);

  const onVisibility = () => {
    if (reduced) return;
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      start = performance.now() / 1000;
      raf = requestAnimationFrame(render);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onResize = () => {
    resize();
    if (reduced) render(performance.now());
  };
  window.addEventListener('resize', onResize);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    observer?.disconnect();
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    gl.deleteBuffer(edgeBuffer);
    gl.deleteBuffer(pointBuffer);
    gl.deleteBuffer(ringBuffer);
    gl.deleteBuffer(satelliteBuffer);
    gl.deleteBuffer(particleBuffer);
    gl.deleteProgram(program);
    gl.deleteProgram(particleProgram);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteShader(pVertex);
    gl.deleteShader(pFragment);
  };
}
