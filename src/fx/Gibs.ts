import * as THREE from 'three';
import { FxRng } from './FxRng';
import { newRange, uploadRange } from './upload';

/**
 * Physical chunks (gore, debris, shards) as one InstancedMesh per shape.
 * Chunks get a random non-uniform scale and tumble, bounce, settle on the floor,
 * lie there for a while and shrink away. Live chunks are packed at the front of
 * the instance buffers so only `count` instances are drawn/uploaded.
 */

export const GIB_FLAG = {
  /** Drips a short blood trail while flying. */
  BLOODY: 1,
  /** Glows hot for a moment (explosion debris) — leaves an ember trail. */
  HOT: 2,
  /** Leaves a blood splat where it first lands. */
  SPLAT: 4,
  /** Leaves a few drip spots where it first lands. */
  DRIP: 8,
} as const;

const TRAIL_FLAGS = GIB_FLAG.BLOODY | GIB_FLAG.HOT;
/** Bloody chunks only drip while flung fast or just after the hit (no dotted arcs). */
const BLOOD_TRAIL_TIME = 0.35;
const BLOOD_TRAIL_SPEED2 = 3 * 3;

// CPU layout.
const S = 24;
const PX = 0,
  PY = 1,
  PZ = 2,
  VX = 3,
  VY = 4,
  VZ = 5,
  RX = 6,
  RY = 7,
  RZ = 8,
  WX = 9,
  WY = 10,
  WZ = 11,
  SX = 12,
  SY = 13,
  SZ = 14,
  AGE = 15,
  LIFE = 16,
  FLOOR = 17,
  FLAGS = 18,
  TRAIL = 19,
  REST = 20,
  BOUNCES = 21;

/**
 * First floor contact. Payload in `GibMesh.ev` (reused, read synchronously):
 * [x, floorY, z, r, g, b, size, flags].
 */
export type GibLandFn = (ev: Float32Array) => void;
/**
 * Trail tick while flying. Payload in `GibMesh.ev`:
 * [x, y, z, vx, vy, vz, r, g, b, flags, floorY].
 * (One typed array instead of ten numbers: doubles passed to a non-inlined call get boxed.)
 */
export type GibTrailFn = (ev: Float32Array) => void;

/** Irregular jittered polyhedron: vertices displaced consistently by position hash (stays watertight). */
function jitterGeo(base: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const g = base.index ? base.toNonIndexed() : base;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const key = (x: number, y: number, z: number) => Math.round(x * 1000) * 73856093 ^ Math.round(y * 1000) * 19349663 ^ Math.round(z * 1000) * 83492791;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let h = Math.imul(key(x, y, z) ^ seed, 2654435761);
    const r1 = ((h >>> 0) % 1000) / 1000;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    const r2 = ((h >>> 0) % 1000) / 1000;
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    const r3 = ((h >>> 0) % 1000) / 1000;
    pos.setXYZ(i, x * (1 + (r1 - 0.5) * amount), y * (1 + (r2 - 0.5) * amount), z * (1 + (r3 - 0.5) * amount));
  }
  if (g !== base) base.dispose();
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/**
 * ART: SPRITES look for gibs: each chunk is a camera-facing pixel-art chunk
 * snapped to the retro pixel grid, drawn the way the PixelCast sprites are —
 * a ragged lobed blob (meat) or an angular splinter (shards) whose outline
 * turns as the chunk tumbles, three hard tone steps from the upper-left light,
 * a 1-px dark edge, a wet highlight speck on meat and a pale bone fleck on
 * some chunks, a bright facet edge on shards. No tumbling cubes next to
 * pixel-art characters, no soft gradients. Same instances, same physics —
 * only the draw changes.
 */
const GIB_SPRITE_VERT = /* glsl */ `
  uniform vec2 uTarget;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vPx;
  varying float vSeed;
  varying float vAng;
  void main() {
    vUv = uv;
    vCol = instanceColor;
    vec3 c = instanceMatrix[3].xyz;
    float sz = (length(instanceMatrix[0].xyz) + length(instanceMatrix[1].xyz) + length(instanceMatrix[2].xyz)) / 3.0;
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    vec4 cc = projectionMatrix * mv;
    float ppm = projectionMatrix[1][1] * 0.5 * uTarget.y / max(cc.w, 1e-3);
    float px = clamp(floor(sz * 0.85 * ppm + 0.5), 1.0, 24.0);
    vPx = px;
    // Spin of the tumbling chunk as seen on screen (its local X axis, view space).
    vec3 ax = (modelViewMatrix * vec4(instanceMatrix[0].xyz, 0.0)).xyz;
    vAng = atan(ax.y, ax.x);
    vec2 pc = (cc.xy / cc.w * 0.5 + 0.5) * uTarget;
    vec2 corner = floor(pc - 0.5 * px + 0.5);
    vec2 ndc = (corner + uv * px) / uTarget * 2.0 - 1.0;
    vSeed = float(gl_InstanceID);
    gl_Position = vec4(ndc * cc.w, cc.z, cc.w);
  }
`;
const GIB_SPRITE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uLight;
  uniform float uShard;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vPx;
  varying float vSeed;
  varying float vAng;
  float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  // Outline radius toward direction d (unit square coords): lobed meat or a splinter.
  float radius(vec2 d) {
    float a = atan(d.y, d.x) - vAng;
    float h1 = hash(vSeed + 0.3) * 6.2832;
    float h2 = hash(vSeed + 7.1) * 6.2832;
    if (uShard > 0.5) {
      // A long splinter: a stretched diamond with a chipped corner.
      vec2 r = vec2(cos(a), sin(a));
      float e = abs(r.x) / 1.0 + abs(r.y) / 0.5;
      return (0.95 + 0.12 * sin(3.0 * a + h1)) / max(e, 1e-3);
    }
    return 0.86 + 0.15 * sin(3.0 * a + h1) + 0.08 * sin(5.0 * a + h2);
  }
  float inside(vec2 q) {
    vec2 d = (q / vPx) * 2.0 - 1.0;
    return length(d) <= radius(d) ? 1.0 : 0.0;
  }
  void main() {
    vec2 q = floor(vUv * vPx) + 0.5;
    if (vPx > 2.5 && inside(q) < 0.5) discard;
    vec2 d = (q / vPx) * 2.0 - 1.0;
    // Three hard steps from the upper-left light (a lit cap, the base, a shadow side).
    float l = dot(d, vec2(-0.6, 0.8));
    float tone = l > 0.28 ? 1.22 : l < -0.3 ? 0.6 : 0.92;
    if (uShard > 0.5) {
      // Two facets split along the splinter, a bright edge between them.
      vec2 ax = vec2(cos(vAng), sin(vAng));
      float side = d.x * -ax.y + d.y * ax.x;
      tone = side > 0.0 ? 1.18 : 0.72;
      if (vPx > 4.5 && abs(side) < 1.0 / vPx) tone = 1.45;
    }
    vec3 col = vCol * uLight * tone;
    if (vPx > 3.5) {
      // 1-px dark edge on chunks big enough to carry one.
      float n = inside(q + vec2(1.0, 0.0)) * inside(q - vec2(1.0, 0.0)) * inside(q + vec2(0.0, 1.0)) * inside(q - vec2(0.0, 1.0));
      if (n < 0.5) col = vCol * uLight * 0.34;
      else if (uShard < 0.5) {
        // Wet speck up-left of the middle; a pale bone fleck on every third chunk.
        vec2 sp = floor(vec2(0.36, 0.64) * vPx) + 0.5;
        if (q == sp) col = mix(col, vec3(1.0, 0.92, 0.86), 0.7);
        vec2 bp = floor(vec2(0.6 + 0.15 * sin(vAng), 0.4) * vPx) + 0.5;
        if (hash(vSeed + 3.3) > 0.66 && vPx > 5.5 && (q == bp || q == bp + vec2(1.0, 0.0))) col = vec3(0.86, 0.8, 0.66) * uLight;
      }
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class GibMesh {
  readonly mesh: THREE.InstancedMesh;
  /** The tumbling-chunk look (ART: 3D) while the pixel-blob look is on. */
  private solid: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null;
  private spriteGeo: THREE.BufferGeometry | null = null;
  private spriteMat: THREE.ShaderMaterial | null = null;
  onLand: GibLandFn | null = null;
  onTrail: GibTrailFn | null = null;
  /** Event payload for `onLand` / `onTrail`. */
  readonly ev = new Float32Array(11);
  private rng: FxRng;
  private d: Float32Array;
  private col: Float32Array;
  private n = 0;
  private recycle = 0;
  private matRange = newRange();
  private colRange = newRange();

  constructor(
    readonly capacity: number,
    private readonly shape: 'meat' | 'shard',
  ) {
    this.rng = new FxRng(shape === 'meat' ? 0x5eed1 : 0x5eed2);
    this.d = new Float32Array(capacity * S);
    const geo =
      shape === 'meat'
        ? jitterGeo(new THREE.IcosahedronGeometry(0.5, 0), 0.55, 17)
        : jitterGeo(new THREE.OctahedronGeometry(0.5, 0), 0.7, 41);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.col = new Float32Array(capacity * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.col, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.name = `fx-gibs-${shape}`;
  }

  get count(): number {
    return this.n;
  }

  spawn(
    p: THREE.Vector3,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    sx: number,
    sy: number,
    sz: number,
    life: number,
    floor: number,
    flags: number,
    rng: FxRng,
  ) {
    let i = this.n;
    if (i >= this.capacity) i = this.recycle = (this.recycle + 1) % this.capacity;
    else this.n++;
    const d = this.d;
    const o = i * S;
    d[o + PX] = p.x;
    d[o + PY] = p.y;
    d[o + PZ] = p.z;
    d[o + VX] = vx;
    d[o + VY] = vy;
    d[o + VZ] = vz;
    d[o + RX] = rng.next() * 6.28;
    d[o + RY] = rng.next() * 6.28;
    d[o + RZ] = rng.next() * 6.28;
    d[o + WX] = rng.spread(14);
    d[o + WY] = rng.spread(14);
    d[o + WZ] = rng.spread(14);
    d[o + SX] = sx;
    d[o + SY] = sy;
    d[o + SZ] = sz;
    d[o + AGE] = 0;
    d[o + LIFE] = life;
    d[o + FLOOR] = floor;
    d[o + FLAGS] = flags;
    d[o + TRAIL] = rng.next() * 0.05;
    d[o + REST] = 0;
    d[o + BOUNCES] = 0;
    const c = i * 3;
    this.col[c] = color.r;
    this.col[c + 1] = color.g;
    this.col[c + 2] = color.b;
  }

  update(dt: number) {
    const d = this.d;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.col;
    let n = this.n;
    let i = 0;
    while (i < n) {
      const o = i * S;
      const age = d[o + AGE] + dt;
      if (age >= d[o + LIFE]) {
        n--;
        if (i !== n) {
          d.copyWithin(o, n * S, n * S + S);
          col[i * 3] = col[n * 3];
          col[i * 3 + 1] = col[n * 3 + 1];
          col[i * 3 + 2] = col[n * 3 + 2];
        }
        continue;
      }
      d[o + AGE] = age;
      const sy = d[o + SY];
      // Contact radius while tumbling (average half-extent, a bit inside the jittered hull).
      const contact = d[o + FLOOR] + (d[o + SX] + sy + d[o + SZ]) * 0.13;
      if (d[o + REST] === 0) {
        let vx = d[o + VX];
        let vy = d[o + VY] - 14 * dt;
        let vz = d[o + VZ];
        let px = d[o + PX] + vx * dt;
        let py = d[o + PY] + vy * dt;
        let pz = d[o + PZ] + vz * dt;
        const flags = d[o + FLAGS];
        if (py < contact && vy <= 0) {
          py = contact;
          const impact = -vy;
          if (d[o + BOUNCES] === 0 && this.onLand) {
            const ev = this.ev;
            ev[0] = px;
            ev[1] = d[o + FLOOR];
            ev[2] = pz;
            ev[3] = col[i * 3];
            ev[4] = col[i * 3 + 1];
            ev[5] = col[i * 3 + 2];
            ev[6] = Math.max(d[o + SX], sy, d[o + SZ]);
            ev[7] = flags;
            this.onLand(ev);
          }
          d[o + BOUNCES]++;
          if (impact < 1.6 || d[o + BOUNCES] > 3) {
            // Settle: lie on a side with the long (local Z) axis horizontal — RX ∈ {0, π},
            // RZ ∈ {0, π/2} picks whether local Y or X points up — resting on the floor.
            vx = vy = vz = 0;
            d[o + REST] = 1;
            d[o + RX] = Math.cos(d[o + RX]) >= 0 ? 0 : Math.PI;
            const onSide = Math.abs(Math.sin(d[o + RZ])) > 0.7071;
            d[o + RZ] = onSide ? Math.PI / 2 : 0;
            py = d[o + FLOOR] + (onSide ? d[o + SX] : sy) * 0.4;
          } else {
            vy = impact * 0.32;
            vx *= 0.55;
            vz *= 0.55;
            d[o + WX] *= 0.5;
            d[o + WY] *= 0.5;
            d[o + WZ] *= 0.5;
          }
        } else if ((flags & TRAIL_FLAGS) !== 0 && this.onTrail) {
          d[o + TRAIL] -= dt;
          if (d[o + TRAIL] <= 0) {
            const hot = (flags & GIB_FLAG.HOT) !== 0;
            d[o + TRAIL] = hot ? 0.028 : this.rng.range(0.03, 0.08);
            if (hot || age < BLOOD_TRAIL_TIME || vx * vx + vy * vy + vz * vz > BLOOD_TRAIL_SPEED2) {
              const ev = this.ev;
              ev[0] = px;
              ev[1] = py;
              ev[2] = pz;
              ev[3] = vx;
              ev[4] = vy;
              ev[5] = vz;
              ev[6] = col[i * 3];
              ev[7] = col[i * 3 + 1];
              ev[8] = col[i * 3 + 2];
              ev[9] = flags;
              ev[10] = d[o + FLOOR];
              this.onTrail(ev);
            }
          }
        }
        d[o + VX] = vx;
        d[o + VY] = vy;
        d[o + VZ] = vz;
        d[o + PX] = px;
        d[o + PY] = py;
        d[o + PZ] = pz;
        if (d[o + REST] === 0) {
          d[o + RX] += d[o + WX] * dt;
          d[o + RY] += d[o + WY] * dt;
          d[o + RZ] += d[o + WZ] * dt;
        }
      }
      // Shrink away over the last 0.6 s (sinking slightly into the floor).
      const left = d[o + LIFE] - age;
      const k = left < 0.6 ? left / 0.6 : 1;
      this.writeMatrix(m, i * 16, o, k, d[o + REST] === 1 ? (1 - k) * sy * 0.4 : 0);
      i++;
    }
    this.n = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      uploadRange(this.mesh.instanceMatrix, this.matRange, 0, n * 16);
      uploadRange(this.mesh.instanceColor!, this.colRange, 0, n * 3);
    }
  }

  /** Compose T * R(euler XYZ) * S straight into the instance matrix array. */
  private writeMatrix(m: Float32Array, mo: number, o: number, k: number, sink: number) {
    const d = this.d;
    const x = d[o + RX];
    const y = d[o + RY];
    const z = d[o + RZ];
    const a = Math.cos(x);
    const b = Math.sin(x);
    const c = Math.cos(y);
    const dd = Math.sin(y);
    const e = Math.cos(z);
    const f = Math.sin(z);
    const ae = a * e;
    const af = a * f;
    const be = b * e;
    const bf = b * f;
    const sx = d[o + SX] * k;
    const sy = d[o + SY] * k;
    const sz = d[o + SZ] * k;
    m[mo] = c * e * sx;
    m[mo + 1] = (af + be * dd) * sx;
    m[mo + 2] = (bf - ae * dd) * sx;
    m[mo + 3] = 0;
    m[mo + 4] = -c * f * sy;
    m[mo + 5] = (ae - bf * dd) * sy;
    m[mo + 6] = (be + af * dd) * sy;
    m[mo + 7] = 0;
    m[mo + 8] = dd * sz;
    m[mo + 9] = -b * c * sz;
    m[mo + 10] = a * c * sz;
    m[mo + 11] = 0;
    m[mo + 12] = d[o + PX];
    m[mo + 13] = d[o + PY] - sink;
    m[mo + 14] = d[o + PZ];
    m[mo + 15] = 1;
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  /**
   * Pixel-blob gibs (ART: SPRITES) on / off. `light` = approximate scene light
   * (shared colour), `target` = the main render target size in pixels (shared).
   */
  setSprite(on: boolean, light?: THREE.Color, target?: { value: THREE.Vector2 }) {
    if (on && !this.solid && light && target) {
      this.solid = { geo: this.mesh.geometry, mat: this.mesh.material as THREE.Material };
      this.spriteGeo ??= new THREE.PlaneGeometry(1, 1);
      this.spriteMat ??= new THREE.ShaderMaterial({
        vertexShader: GIB_SPRITE_VERT,
        fragmentShader: GIB_SPRITE_FRAG,
        uniforms: { uLight: { value: light }, uTarget: target, uShard: { value: this.shape === 'shard' ? 1 : 0 } },
        fog: false,
      });
      this.spriteMat.uniforms.uTarget = target;
      this.spriteMat.uniforms.uLight.value = light;
      this.mesh.geometry = this.spriteGeo;
      this.mesh.material = this.spriteMat;
    } else if (!on && this.solid) {
      this.mesh.geometry = this.solid.geo;
      this.mesh.material = this.solid.mat;
      this.solid = null;
    }
  }

  dispose() {
    this.setSprite(false);
    this.spriteGeo?.dispose();
    this.spriteMat?.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
