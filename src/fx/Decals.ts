import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS } from './textures';
import { newRange } from './upload';

/**
 * Pooled projected-quad decals (blood pools, bullet holes, scorch marks) in one
 * instanced draw call. Each decal is a flat quad oriented to a surface normal.
 * Spawn/fade animation runs in the vertex shader from the decal's birth time, so
 * the CPU only writes a decal when it is spawned (or re-timed). Slots are reused
 * oldest-first; once the ring wraps, the decal `PREFADE_AHEAD` slots ahead of the
 * cursor is told to fade out over `PREFADE` seconds, so recycled decals have
 * (nearly) faded away instead of popping out while still opaque.
 */

const G = 16;
/** Slots ahead of the write cursor that get an early fade-out. */
const PREFADE_AHEAD = 40;
/** Seconds of the early fade-out. */
const PREFADE = 1.2;

const VERT = /* glsl */ `
  attribute vec4 iPosSize;
  attribute vec4 iNrmAng;
  attribute vec4 iColor;
  attribute vec4 iTime;
  uniform vec2 uAtlas;
  uniform float uTime;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    float age = uTime - iTime.x;
    float life = iTime.y;
    float fadeDur = iTime.z;
    // w = atlas frame + grow-in seconds (< 1) packed together.
    float f = floor(iTime.w);
    float spread = iTime.w - f;
    if (age < 0.0 || age > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vColor = vec4(0.0);
      vUv = vec2(0.0);
      return;
    }
    vec3 n = iNrmAng.xyz;
    vec3 ref = abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t = normalize(cross(ref, n));
    vec3 b = cross(n, t);
    float c = cos(iNrmAng.w);
    float s = sin(iNrmAng.w);
    vec3 T = t * c + b * s;
    vec3 B = b * c - t * s;
    // Splats spread out quickly, then sit; fade over the last fadeDur seconds.
    float k = spread > 0.0 ? smoothstep(0.0, spread, age) : 1.0;
    float sz = iPosSize.w * (0.45 + 0.55 * k);
    vec3 wp = iPosSize.xyz + (T * position.x + B * position.y) * sz;
    vec4 mvPosition = modelViewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float fade = clamp((life - age) / fadeDur, 0.0, 1.0);
    float a = iColor.a * min(1.0, age / 0.05) * fade;
    vColor = vec4(iColor.rgb, a);
    vec2 cell = vec2(mod(f, uAtlas.x), floor(f / uAtlas.x));
    vUv = (cell + uv) / uAtlas;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vColor.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb * t.rgb * uLight, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class DecalSystem {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private gpu: Float32Array;
  private buf: THREE.InstancedInterleavedBuffer;
  private geo: THREE.InstancedBufferGeometry;
  private cursor = 0;
  private used = 0;
  private time = 0;
  // Two dirty slot ranges (new decals, and the pre-faded ones further ahead).
  private aMin = 0;
  private aMax = -1;
  private bMin = 0;
  private bMax = -1;
  private rangeA = newRange();
  private rangeB = newRange();

  constructor(
    readonly capacity: number,
    map: THREE.Texture,
  ) {
    this.gpu = new Float32Array(capacity * G);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    this.buf = new THREE.InstancedInterleavedBuffer(this.gpu, G, 1);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPosSize', new THREE.InterleavedBufferAttribute(this.buf, 4, 0));
    geo.setAttribute('iNrmAng', new THREE.InterleavedBufferAttribute(this.buf, 4, 4));
    geo.setAttribute('iColor', new THREE.InterleavedBufferAttribute(this.buf, 4, 8));
    geo.setAttribute('iTime', new THREE.InterleavedBufferAttribute(this.buf, 4, 12));
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = geo;
    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uAtlas: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
        uTime: { value: 0 },
        uLight: { value: new THREE.Color(1, 1, 1) },
        uMap: { value: null },
      },
    ]);
    uniforms.uMap.value = map;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    // Before other transparent things (glass, particles) — decals sit on opaque surfaces.
    this.mesh.renderOrder = -2;
    this.mesh.visible = false;
    this.mesh.name = 'fx-decals';
  }

  get lightUniform(): THREE.Color {
    return this.mat.uniforms.uLight.value as THREE.Color;
  }

  get count(): number {
    return this.used;
  }

  /**
   * Add a decal. `nx,ny,nz` is the (unit) surface normal, `angle` the spin around
   * it, `spread` seconds of grow-in (0 = instant, < 1), colour in linear RGB.
   */
  add(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    size: number,
    angle: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
    life: number,
    frame: number,
    spread = 0.2,
  ) {
    const cap = this.capacity;
    const i = this.cursor;
    this.cursor = (i + 1) % cap;
    if (this.used < cap) this.used++;
    // Start fading the decal that this ring will overwrite PREFADE_AHEAD adds from now.
    const j = (i + PREFADE_AHEAD) % cap;
    if (j < this.used && j !== i) this.prefade(j);
    const o = i * G;
    const d = this.gpu;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = size;
    d[o + 4] = nx;
    d[o + 5] = ny;
    d[o + 6] = nz;
    d[o + 7] = angle;
    d[o + 8] = r;
    d[o + 9] = g;
    d[o + 10] = b;
    d[o + 11] = alpha;
    d[o + 12] = this.time;
    d[o + 13] = life;
    d[o + 14] = Math.max(0.05, Math.min(5, life * 0.4));
    d[o + 15] = frame + Math.min(0.95, Math.max(0, spread));
    this.markDirty(i);
  }

  /**
   * Most recent decal (among the last `lookback` added) whose atlas frame is in the
   * bit `mask`, centred within `radius` of (x, z), younger than `maxAge` s and of a
   * similar colour (sum of |Δrgb| ≤ 0.15); -1 if none.
   */
  findNear(x: number, z: number, radius: number, maxAge: number, mask: number, r: number, g: number, b: number, lookback = 16): number {
    const cap = this.capacity;
    const d = this.gpu;
    const n = Math.min(lookback, this.used);
    const r2 = radius * radius;
    let k = this.cursor;
    for (let c = 0; c < n; c++) {
      k = k === 0 ? cap - 1 : k - 1;
      const o = k * G;
      const age = this.time - d[o + 12];
      if (age > maxAge) break; // the ring is in birth order: the rest are older still
      if (((1 << Math.floor(d[o + 15])) & mask) === 0) continue;
      const dx = d[o] - x;
      const dz = d[o + 2] - z;
      if (dx * dx + dz * dz > r2) continue;
      if (Math.abs(d[o + 8] - r) + Math.abs(d[o + 9] - g) + Math.abs(d[o + 10] - b) > 0.15) continue;
      return k;
    }
    return -1;
  }

  /** Grow decal `slot` (from `findNear`) by `grow`× its size, up to `maxSize`; darken/thicken a little. */
  grow(slot: number, grow: number, maxSize: number) {
    const o = slot * G;
    const d = this.gpu;
    const s = d[o + 3];
    if (s < maxSize) d[o + 3] = Math.min(maxSize, s * grow);
    d[o + 11] = Math.min(1, d[o + 11] + 0.03);
    this.markDirty(slot);
  }

  update(dt: number) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    if (this.aMax >= 0) {
      const ranges = this.buf.updateRanges;
      ranges.length = 0;
      const ra = this.rangeA;
      ra.start = this.aMin * G;
      ra.count = (this.aMax - this.aMin + 1) * G;
      ranges.push(ra);
      if (this.bMax >= 0) {
        const rb = this.rangeB;
        rb.start = this.bMin * G;
        rb.count = (this.bMax - this.bMin + 1) * G;
        ranges.push(rb);
      }
      this.buf.needsUpdate = true;
      this.aMax = this.bMax = -1;
    }
    this.geo.instanceCount = this.used;
    this.mesh.visible = this.used > 0;
  }

  /** Re-time slot `j` to fade out within PREFADE seconds, continuing from its current opacity. */
  private prefade(j: number) {
    const d = this.gpu;
    const o = j * G;
    const age = this.time - d[o + 12];
    const life = d[o + 13];
    const left = life - age;
    if (left <= 0) return;
    const f = Math.min(1, left / d[o + 14]);
    const nl = age + f * PREFADE;
    if (nl >= life) return;
    d[o + 13] = nl;
    d[o + 14] = PREFADE;
    this.markDirty(j);
  }

  private markDirty(k: number) {
    if (this.aMax < 0) {
      this.aMin = this.aMax = k;
    } else if (k >= this.aMin - 4 && k <= this.aMax + 4) {
      if (k < this.aMin) this.aMin = k;
      if (k > this.aMax) this.aMax = k;
    } else if (this.bMax < 0) {
      this.bMin = this.bMax = k;
    } else {
      if (k < this.bMin) this.bMin = k;
      if (k > this.bMax) this.bMax = k;
    }
  }

  clear() {
    this.gpu.fill(0);
    this.cursor = 0;
    this.used = 0;
    this.aMax = this.bMax = -1;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
    this.buf.clearUpdateRanges();
    this.buf.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
