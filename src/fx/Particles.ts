import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS } from './textures';

/**
 * Pooled GPU particles drawn as ONE instanced quad mesh (one draw call).
 *
 * Each particle is a camera-facing quad textured from the particle atlas. It can
 * instead be stretched along its screen-space velocity (sparks, blood streaks)
 * or lie flat on the XZ plane (shockwave rings, ripples). Live particles are kept
 * packed at the front of the buffers (swap-remove) so only the live range is
 * simulated and uploaded each frame. Zero allocations after construction.
 */

/** Particle behaviour flags. */
export const PFLAG = {
  /** Bounce off the floor (sparks, chips). */
  BOUNCE: 1,
  /** Die when reaching the floor (liquid droplets). */
  DIE_ON_FLOOR: 2,
  /** Report the floor contact via `onLand` (blood drops → decals). */
  LAND_EVENT: 4,
  /** Lie flat on the XZ plane instead of facing the camera. */
  FLAT: 8,
  /** Settle and stay on the floor (stop moving) instead of bouncing. */
  SETTLE: 16,
} as const;

/** Spawn description — fill a reusable instance and pass it to `spawn` (no allocations). */
export class PSpec {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** Seconds visible (after `delay`). */
  life = 1;
  /** Seconds before the particle appears (it stays frozen until then). */
  delay = 0;
  /** Quad width in metres at birth / at death (eased out). */
  size0 = 0.1;
  size1 = 0.1;
  rot = 0;
  rotV = 0;
  /** Downward acceleration (m/s²); negative = buoyant. */
  grav = 0;
  /** Exponential velocity damping per second. */
  drag = 0;
  /** Colour at birth / at death (linear RGB; additive pools may exceed 1). */
  r0 = 1;
  g0 = 1;
  b0 = 1;
  r1 = 1;
  g1 = 1;
  b1 = 1;
  /** Peak opacity. */
  alpha = 1;
  /** Fraction of life spent fading in. */
  fadeIn = 0.05;
  /** Fraction of life after which it starts fading out. */
  fadeOut = 0.5;
  frame = 0;
  /** Velocity stretch (seconds of travel the streak covers); 0 = round billboard. */
  stretch = 0;
  flags = 0;
  /** Floor height for collisions (only used with floor flags). */
  floor = -1e9;
  /** Free value passed back through `onLand` (e.g. decal size). */
  tag = 0;

  reset(): this {
    this.vx = this.vy = this.vz = 0;
    this.life = 1;
    this.delay = 0;
    this.size0 = this.size1 = 0.1;
    this.rot = this.rotV = 0;
    this.grav = this.drag = 0;
    this.r0 = this.g0 = this.b0 = this.r1 = this.g1 = this.b1 = 1;
    this.alpha = 1;
    this.fadeIn = 0.05;
    this.fadeOut = 0.5;
    this.frame = 0;
    this.stretch = 0;
    this.flags = 0;
    this.floor = -1e9;
    this.tag = 0;
    return this;
  }

  pos(p: THREE.Vector3): this {
    this.x = p.x;
    this.y = p.y;
    this.z = p.z;
    return this;
  }

  vel(x: number, y: number, z: number): this {
    this.vx = x;
    this.vy = y;
    this.vz = z;
    return this;
  }

  color(c: THREE.Color, k = 1): this {
    this.r0 = this.r1 = c.r * k;
    this.g0 = this.g1 = c.g * k;
    this.b0 = this.b1 = c.b * k;
    return this;
  }

  rgb0(r: number, g: number, b: number): this {
    this.r0 = r;
    this.g0 = g;
    this.b0 = b;
    return this;
  }

  rgb1(r: number, g: number, b: number): this {
    this.r1 = r;
    this.g1 = g;
    this.b1 = b;
    return this;
  }

  size(a: number, b = a): this {
    this.size0 = a;
    this.size1 = b;
    return this;
  }
}

// CPU layout (floats per particle).
const S = 32;
const PX = 0,
  PY = 1,
  PZ = 2,
  VX = 3,
  VY = 4,
  VZ = 5,
  AGE = 6,
  LIFE = 7,
  DELAY = 8,
  S0 = 9,
  S1 = 10,
  ROT = 11,
  ROTV = 12,
  GRAV = 13,
  DRAG = 14,
  R0 = 15,
  G0 = 16,
  B0 = 17,
  R1 = 18,
  G1 = 19,
  B1 = 20,
  A0 = 21,
  FIN = 22,
  FOUT = 23,
  FRAME = 24,
  STRETCH = 25,
  FLOOR = 26,
  FLAGS = 27,
  TAG = 28;

// GPU layout (floats per instance).
const G = 16;

const VERT = /* glsl */ `
  attribute vec4 iPosSize;
  attribute vec4 iColor;
  attribute vec4 iVelRot;
  attribute vec4 iMisc;
  uniform vec2 uAtlas;
  uniform float uHalfH;
  uniform float uMinPx;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    float size = iPosSize.w;
    float alpha = iColor.a;
    vec4 mvPosition;
    if (iMisc.z > 0.5) {
      // Flat on the ground plane.
      float c = cos(iVelRot.w);
      float s = sin(iVelRot.w);
      vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * size;
      mvPosition = modelViewMatrix * vec4(iPosSize.xyz + vec3(q.x, 0.0, q.y), 1.0);
    } else {
      mvPosition = modelViewMatrix * vec4(iPosSize.xyz, 1.0);
      float depth = max(0.05, -mvPosition.z);
      // Keep tiny particles at least uMinPx wide (fade them instead) so they don't shimmer away.
      float minSize = uMinPx * depth / (projectionMatrix[1][1] * uHalfH);
      if (size < minSize) {
        alpha *= size / minSize;
        size = minSize;
      }
      vec2 ax;
      vec2 ay;
      if (iMisc.y > 0.0) {
        vec3 vv = (modelViewMatrix * vec4(iVelRot.xyz, 0.0)).xyz;
        vec2 sd = vv.xy * depth + mvPosition.xy * vv.z;
        float l = length(sd);
        vec2 d = l > 1e-5 ? sd / l : vec2(0.0, 1.0);
        // Screen-projected speed only (motion towards the camera shouldn't make long streaks).
        float sp = length(vv.xy - mvPosition.xy * (vv.z / -depth));
        float len = size + sp * iMisc.y;
        ay = d * len;
        ax = vec2(-d.y, d.x) * size;
        mvPosition.xy -= d * (len - size) * 0.5;
      } else {
        float c = cos(iVelRot.w);
        float s = sin(iVelRot.w);
        ax = vec2(c, s) * size;
        ay = vec2(-s, c) * size;
      }
      mvPosition.xy += ax * position.x + ay * position.y;
    }
    gl_Position = projectionMatrix * mvPosition;
    float f = iMisc.x;
    vec2 cell = vec2(mod(f, uAtlas.x), floor(f / uAtlas.x));
    vUv = (cell + uv) / uAtlas;
    vColor = vec4(iColor.rgb, alpha);
    #include <fog_vertex>
  }
`;

/** Normal-blended, approximately lit (smoke, dust, blood). */
const FRAG_SOFT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vColor.a;
    if (a < 0.006) discard;
    gl_FragColor = vec4(vColor.rgb * t.rgb * uLight, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** Additive, unlit (fire, sparks, flashes). Fog fades it out instead of tinting. */
const FRAG_GLOW = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vColor.a;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      a *= 1.0 - fogF;
    #endif
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb * t.rgb, a);
    #include <colorspace_fragment>
  }
`;

export type LandFn = (x: number, y: number, z: number, r: number, g: number, b: number, tag: number) => void;

export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  /** Called when a LAND_EVENT particle touches its floor. */
  onLand: LandFn | null = null;
  private cpu: Float32Array;
  private gpu: Float32Array;
  private buf: THREE.InstancedInterleavedBuffer;
  private geo: THREE.InstancedBufferGeometry;
  private n = 0;
  private recycle = 0;

  constructor(
    readonly capacity: number,
    additive: boolean,
    map: THREE.Texture,
  ) {
    this.cpu = new Float32Array(capacity * S);
    this.gpu = new Float32Array(capacity * G);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    this.buf = new THREE.InstancedInterleavedBuffer(this.gpu, G, 1);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPosSize', new THREE.InterleavedBufferAttribute(this.buf, 4, 0));
    geo.setAttribute('iColor', new THREE.InterleavedBufferAttribute(this.buf, 4, 4));
    geo.setAttribute('iVelRot', new THREE.InterleavedBufferAttribute(this.buf, 4, 8));
    geo.setAttribute('iMisc', new THREE.InterleavedBufferAttribute(this.buf, 4, 12));
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = geo;

    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uAtlas: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
        uHalfH: { value: 200 },
        uMinPx: { value: additive ? 1.6 : 1.3 },
        uLight: { value: new THREE.Color(1, 1, 1) },
        uMap: { value: null },
      },
    ]);
    uniforms.uMap.value = map;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: additive ? FRAG_GLOW : FRAG_SOFT,
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: !additive,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    this.mesh.visible = false;
    this.mesh.name = additive ? 'fx-glow' : 'fx-soft';
  }

  get count(): number {
    return this.n;
  }

  get lightUniform(): THREE.Color {
    return this.mat.uniforms.uLight.value as THREE.Color;
  }

  setViewport(halfHeightPx: number) {
    this.mat.uniforms.uHalfH.value = halfHeightPx;
  }

  /** Spawn one particle. When full, the oldest-indexed slot is recycled. */
  spawn(s: PSpec) {
    let i = this.n;
    if (i >= this.capacity) {
      // Full: recycle slots round-robin (spreads the damage across effects).
      i = this.recycle = (this.recycle + 1) % this.capacity;
    } else this.n++;
    const d = this.cpu;
    const o = i * S;
    d[o + PX] = s.x;
    d[o + PY] = s.y;
    d[o + PZ] = s.z;
    d[o + VX] = s.vx;
    d[o + VY] = s.vy;
    d[o + VZ] = s.vz;
    d[o + AGE] = 0;
    d[o + LIFE] = Math.max(0.01, s.life);
    d[o + DELAY] = s.delay;
    d[o + S0] = s.size0;
    d[o + S1] = s.size1;
    d[o + ROT] = s.rot;
    d[o + ROTV] = s.rotV;
    d[o + GRAV] = s.grav;
    d[o + DRAG] = s.drag;
    d[o + R0] = s.r0;
    d[o + G0] = s.g0;
    d[o + B0] = s.b0;
    d[o + R1] = s.r1;
    d[o + G1] = s.g1;
    d[o + B1] = s.b1;
    d[o + A0] = s.alpha;
    d[o + FIN] = Math.max(0.001, s.fadeIn);
    d[o + FOUT] = Math.min(0.999, s.fadeOut);
    d[o + FRAME] = s.frame;
    d[o + STRETCH] = s.stretch;
    d[o + FLOOR] = s.floor;
    d[o + FLAGS] = s.flags;
    d[o + TAG] = s.tag;
  }

  update(dt: number) {
    const d = this.cpu;
    const g = this.gpu;
    let n = this.n;
    let i = 0;
    while (i < n) {
      const o = i * S;
      const age = d[o + AGE] + dt;
      const delay = d[o + DELAY];
      const life = d[o + LIFE];
      if (age >= delay + life) {
        n--;
        if (i !== n) d.copyWithin(o, n * S, n * S + S);
        continue;
      }
      d[o + AGE] = age;
      const go = i * G;
      const t = age - delay;
      if (t < 0) {
        g[go + 3] = 0;
        g[go + 7] = 0;
        i++;
        continue;
      }
      const step = Math.min(dt, t);
      // Physics.
      const dr = Math.exp(-d[o + DRAG] * step);
      let vx = d[o + VX] * dr;
      let vy = d[o + VY] * dr - d[o + GRAV] * step;
      let vz = d[o + VZ] * dr;
      let px = d[o + PX] + vx * step;
      let py = d[o + PY] + vy * step;
      let pz = d[o + PZ] + vz * step;
      const flags = d[o + FLAGS];
      const floor = d[o + FLOOR];
      if (flags !== 0 && py < floor && vy < 0) {
        if (flags & PFLAG.LAND_EVENT && this.onLand) {
          this.onLand(px, floor, pz, d[o + R0], d[o + G0], d[o + B0], d[o + TAG]);
          d[o + FLAGS] = flags & ~PFLAG.LAND_EVENT;
        }
        if (flags & PFLAG.DIE_ON_FLOOR) {
          // Expire now; removed next frame.
          d[o + AGE] = delay + life;
          py = floor;
          vx = vy = vz = 0;
        } else if (flags & PFLAG.SETTLE) {
          py = floor;
          vx = vy = vz = 0;
          d[o + GRAV] = 0;
          d[o + ROTV] = 0;
        } else if (flags & PFLAG.BOUNCE) {
          py = floor;
          vy = -vy * 0.32;
          vx *= 0.55;
          vz *= 0.55;
        }
      }
      d[o + VX] = vx;
      d[o + VY] = vy;
      d[o + VZ] = vz;
      d[o + PX] = px;
      d[o + PY] = py;
      d[o + PZ] = pz;
      const rot = d[o + ROT] + d[o + ROTV] * step;
      d[o + ROT] = rot;

      // Appearance over normalised life.
      const k = t / life;
      const ke = 1 - (1 - k) * (1 - k);
      const size = d[o + S0] + (d[o + S1] - d[o + S0]) * ke;
      const fin = Math.min(1, k / d[o + FIN]);
      const fo = d[o + FOUT];
      const fout = k <= fo ? 1 : 1 - (k - fo) / (1 - fo);
      const alpha = d[o + A0] * fin * fout * fout;

      g[go] = px;
      g[go + 1] = py;
      g[go + 2] = pz;
      g[go + 3] = size;
      g[go + 4] = d[o + R0] + (d[o + R1] - d[o + R0]) * k;
      g[go + 5] = d[o + G0] + (d[o + G1] - d[o + G0]) * k;
      g[go + 6] = d[o + B0] + (d[o + B1] - d[o + B0]) * k;
      g[go + 7] = alpha;
      g[go + 8] = vx;
      g[go + 9] = vy;
      g[go + 10] = vz;
      g[go + 11] = rot;
      g[go + 12] = d[o + FRAME];
      g[go + 13] = d[o + STRETCH];
      g[go + 14] = flags & PFLAG.FLAT ? 1 : 0;
      i++;
    }
    this.n = n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.buf.clearUpdateRanges();
      this.buf.addUpdateRange(0, n * G);
      this.buf.needsUpdate = true;
    }
  }

  clear() {
    this.n = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
