import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { packTex, type TexSpec } from './retro';

/**
 * Minimal painted-geometry builder for the Tyrant: primitives are transformed,
 * flattened to non-indexed triangles and coloured per face by a paint function
 * that receives the face centroid + normal in final space. One Sculpt = one
 * vertex-coloured BufferGeometry = one draw call. `build(texFor)` also maps
 * each face's paint colour to a retro texture (per-vertex `aTex`, retro.ts),
 * so hide, belly scales and clean teeth share that single draw call.
 */
export type Paint = number | ((x: number, y: number, z: number, nx: number, ny: number, nz: number) => number);

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Vector3();
const _col = new THREE.Color();

/** Transform matrix (rotation order XYZ). */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_t.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

function hash(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

export class Sculpt {
  private pos: number[] = [];
  private col: number[] = [];
  /** Paint colour of every face (for the texture lookup in build). */
  private hex: number[] = [];

  constructor(private noise = 0.08) {}

  add(src: THREE.BufferGeometry, paint: Paint, m?: THREE.Matrix4): this {
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (m) g.applyMatrix4(m);
    const flip = !!m && m.determinant() < 0;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i + 2 < p.count; i += 3) {
      _a.fromBufferAttribute(p, i);
      _b.fromBufferAttribute(p, flip ? i + 2 : i + 1);
      _c.fromBufferAttribute(p, flip ? i + 1 : i + 2);
      _n.subVectors(_b, _a).cross(_m.subVectors(_c, _a));
      if (_n.lengthSq() < 1e-14) continue;
      _n.normalize();
      const cx = (_a.x + _b.x + _c.x) / 3;
      const cy = (_a.y + _b.y + _c.y) / 3;
      const cz = (_a.z + _b.z + _c.z) / 3;
      const hex = typeof paint === 'number' ? paint : paint(cx, cy, cz, _n.x, _n.y, _n.z);
      _col.setHex(hex);
      this.hex.push(hex);
      const k = 1 + (hash(cx * 3.1, cy * 3.1, cz * 3.1) - 0.5) * 2 * this.noise;
      for (const v of [_a, _b, _c]) {
        this.pos.push(v.x, v.y, v.z);
        this.col.push(_col.r * k, _col.g * k, _col.b * k);
      }
    }
    g.dispose();
    return this;
  }

  /** Elliptic frustum along +Z from 0 to len; r = [half-width, half-height]. */
  seg(len: number, r0: readonly [number, number], r1: readonly [number, number], paint: Paint, m?: THREE.Matrix4, o: { sides?: number; rings?: number; dy?: number; bulge?: number } = {}): this {
    const g = new THREE.CylinderGeometry(1, 1, 1, o.sides ?? 8, o.rings ?? 2, false);
    const p = g.attributes.position as THREE.BufferAttribute;
    const bulge = o.bulge ?? 0;
    const dy = o.dy ?? 0;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5;
      const b = 1 + bulge * Math.sin(Math.PI * t);
      const rx = (r0[0] + (r1[0] - r0[0]) * t) * b;
      const ry = (r0[1] + (r1[1] - r0[1]) * t) * b;
      p.setXYZ(i, p.getX(i) * rx, -p.getZ(i) * ry + dy * t * t, t * len);
    }
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  blob(rx: number, ry: number, rz: number, paint: Paint, m?: THREE.Matrix4, ws = 10, hs = 7): this {
    const g = new THREE.SphereGeometry(1, ws, hs);
    g.scale(rx, ry, rz);
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  /** Cone with its base at y = 0 and tip at y = h. */
  cone(r: number, h: number, paint: Paint, m?: THREE.Matrix4, seg = 5): this {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.translate(0, h / 2, 0);
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  box(w: number, h: number, d: number, paint: Paint, m?: THREE.Matrix4): this {
    const g = new THREE.BoxGeometry(w, h, d);
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  build(texFor?: (paint: number) => TexSpec): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (texFor) {
      const a = new Float32Array(this.hex.length * 12);
      const packed = new Map<number, number[]>();
      for (let f = 0; f < this.hex.length; f++) {
        let p = packed.get(this.hex[f]);
        if (!p) {
          p = packTex(texFor(this.hex[f])) as number[];
          packed.set(this.hex[f], p);
        }
        for (let k = 0; k < 3; k++) a.set(p, (f * 3 + k) * 4);
      }
      g.setAttribute('aTex', new THREE.Float32BufferAttribute(a, 4));
    }
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return Kit.track(g);
  }
}
