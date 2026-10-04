import * as THREE from 'three';
import type { Rng } from '../core/Rng';
import { newRange, uploadRange } from './upload';

/**
 * Physical chunks (gore, debris, shards) as one InstancedMesh per shape.
 * Chunks get a random non-uniform scale and tumble, bounce, settle on the floor,
 * lie there for a while and shrink away. Live chunks are packed at the front of
 * the instance buffers so only `count` instances are drawn/uploaded.
 */

export const GIB_FLAG = {
  /** Leaves a blood trail and a splat where it lands. */
  BLOODY: 1,
  /** Glows hot for a moment (explosion debris) — leaves an ember trail. */
  HOT: 2,
} as const;

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

export type GibLandFn = (x: number, y: number, z: number, r: number, g: number, b: number, size: number, flags: number) => void;
export type GibTrailFn = (x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, flags: number) => void;

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

export class GibMesh {
  readonly mesh: THREE.InstancedMesh;
  onLand: GibLandFn | null = null;
  onTrail: GibTrailFn | null = null;
  private d: Float32Array;
  private col: Float32Array;
  private n = 0;
  private recycle = 0;
  private matRange = newRange();
  private colRange = newRange();

  constructor(
    readonly capacity: number,
    shape: 'meat' | 'shard',
  ) {
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
    rng: Rng,
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
        if (py < contact) {
          py = contact;
          const impact = -vy;
          if (d[o + BOUNCES] === 0 && this.onLand) {
            this.onLand(px, d[o + FLOOR], pz, col[i * 3], col[i * 3 + 1], col[i * 3 + 2], Math.max(d[o + SX], sy, d[o + SZ]), flags);
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
        } else if (flags !== 0 && this.onTrail) {
          d[o + TRAIL] -= dt;
          if (d[o + TRAIL] <= 0) {
            d[o + TRAIL] = flags & GIB_FLAG.HOT ? 0.028 : 0.05;
            this.onTrail(px, py, pz, vx, vy, vz, col[i * 3], col[i * 3 + 1], col[i * 3 + 2], flags);
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

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
