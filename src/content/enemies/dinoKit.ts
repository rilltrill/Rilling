import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { Enemy, type EnemyState } from '../../gameplay/Enemy';
import type { ShotHit } from '../../gameplay/Entity';
import type { SfxName } from '../../audio/names';
import { angleDelta, clamp, damp, lerp } from '../../core/math';

/**
 * Dinosaur model kit: painted low-poly geometry (vertex-coloured, flat shaded,
 * countershaded + striped), rig builders for theropods / pteranodons /
 * triceratops, and the `Dino` base class with shared behaviour (airborne
 * physics, hit flinches, lagging tails, momentum deaths, attack slots).
 *
 * All painted geometry is cached per (species, palette) and shares ONE
 * vertex-coloured Lambert material, so a pack of dinos costs a handful of
 * geometries and a single material.
 */

// ─── Geometry cache ─────────────────────────────────────────────────────────

const geoCache = new Map<string, THREE.BufferGeometry>();

/**
 * Cached custom geometry. Tracked by Kit (disposed between stages); the cache
 * entry evicts itself on dispose so the next stage rebuilds it.
 */
export function dgeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = make();
  g.userData.shared = true;
  g.addEventListener('dispose', () => {
    if (geoCache.get(key) === g) geoCache.delete(key);
  });
  Kit.track(g);
  geoCache.set(key, g);
  return g;
}

/** The single shared vertex-coloured skin material. */
export const skinMat = () => Kit.mat(0xffffff, { vertexColors: true });

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Transform matrix (build time only). Rotation order XYZ. */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_t.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

/** Deterministic hash in [0, 1) (build-time texture noise; not gameplay randomness). */
export function hash3(x: number, y: number, z: number, s = 0): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453;
  return h - Math.floor(h);
}

// ─── Painted geometry builder ──────────────────────────────────────────────

export type PaintFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;
export type Paint = number | PaintFn;

const _c = new THREE.Color();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Vector3();

interface SegOpts {
  sides?: number;
  rings?: number;
  /** Vertical drift of the far end (droop/rise). */
  dy?: number;
  /** Mid-length swelling (0.1 = 10 % fatter in the middle). */
  bulge?: number;
}

/**
 * Accumulates primitives into one non-indexed, per-face vertex-coloured
 * geometry. Paint functions get each face's centroid + normal in the final
 * (post-matrix) space, so `ny` is "dorsal-ness" for parts built upright.
 */
export class Sculpt {
  private pos: number[] = [];
  private col: number[] = [];

  constructor(
    private noise = 0.07,
    private seed = 1,
  ) {}

  add(src: THREE.BufferGeometry, paint: Paint, m?: THREE.Matrix4, noise = this.noise): this {
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (m) g.applyMatrix4(m);
    // Mirroring matrices flip the winding; swap two vertices to keep faces outward.
    const flip = !!m && m.determinant() < 0;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i + 2 < p.count; i += 3) {
      _pa.fromBufferAttribute(p, i);
      _pb.fromBufferAttribute(p, flip ? i + 2 : i + 1);
      _pc.fromBufferAttribute(p, flip ? i + 1 : i + 2);
      _n.subVectors(_pb, _pa).cross(_m.subVectors(_pc, _pa));
      if (_n.lengthSq() < 1e-14) continue; // degenerate (cone apex / zero-radius caps)
      _n.normalize();
      const cx = (_pa.x + _pb.x + _pc.x) / 3;
      const cy = (_pa.y + _pb.y + _pc.y) / 3;
      const cz = (_pa.z + _pb.z + _pc.z) / 3;
      _c.setHex(typeof paint === 'number' ? paint : paint(cx, cy, cz, _n.x, _n.y, _n.z));
      const k = 1 + (hash3(cx * 3.1, cy * 3.1, cz * 3.1, this.seed) - 0.5) * 2 * noise;
      for (const v of [_pa, _pb, _pc]) {
        this.pos.push(v.x, v.y, v.z);
        this.col.push(_c.r * k, _c.g * k, _c.b * k);
      }
    }
    g.dispose();
    return this;
  }

  /** Elliptic frustum along +Z from 0 to `len`; r0/r1 = [half-width, half-height]. Ridge on top. */
  seg(len: number, r0: readonly [number, number], r1: readonly [number, number], paint: Paint, m?: THREE.Matrix4, o: SegOpts = {}): this {
    const g = new THREE.CylinderGeometry(1, 1, 1, o.sides ?? 6, o.rings ?? 1, false);
    const p = g.attributes.position as THREE.BufferAttribute;
    const bulge = o.bulge ?? 0;
    const dy = o.dy ?? 0;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5;
      const b = 1 + bulge * Math.sin(Math.PI * t);
      const rx = lerp(r0[0], r1[0], t) * b;
      const ry = lerp(r0[1], r1[1], t) * b;
      p.setXYZ(i, p.getX(i) * rx, -p.getZ(i) * ry + dy * t * t, t * len);
    }
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  /** Ellipsoid. */
  blob(rx: number, ry: number, rz: number, paint: Paint, m?: THREE.Matrix4, ws = 8, hs = 6): this {
    const g = new THREE.SphereGeometry(1, ws, hs);
    g.scale(rx, ry, rz);
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  /** Cone with its base at y = 0 and tip at y = h (orient with `m`). */
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

  /**
   * Thin plate from a polar grid in the XY plane facing +Z (front) and -Z (back):
   * angles a0→a1 (radians, 0 = +X, π/2 = +Y), `rings` radii (fractions of R),
   * `rim(i)` multiplies the outer radius per spoke (scallops). Thickness `th`.
   */
  fan(R: number, a0: number, a1: number, spokes: number, rings: number[], rim: (i: number) => number, th: number, paint: Paint, m?: THREE.Matrix4): this {
    const pos: number[] = [];
    const pt = (ri: number, si: number, z: number): [number, number, number] => {
      const a = a0 + ((a1 - a0) * si) / spokes;
      const rr = ri < 0 ? 0 : rings[ri] * R * (ri === rings.length - 1 ? rim(si) : 1 + (rim(si) - 1) * rings[ri]);
      return [Math.cos(a) * rr, Math.sin(a) * rr, z];
    };
    const tri = (a: number[], b: number[], c: number[], wantZ: number) => {
      // Orient so the normal's z sign matches wantZ.
      const ux = b[0] - a[0], uy = b[1] - a[1];
      const vx = c[0] - a[0], vy = c[1] - a[1];
      const nz = ux * vy - uy * vx;
      if (nz * wantZ >= 0) pos.push(...a, ...b, ...c);
      else pos.push(...a, ...c, ...b);
    };
    for (const side of [1, -1]) {
      const z = (side * th) / 2;
      for (let si = 0; si < spokes; si++) {
        for (let ri = -1; ri < rings.length - 1; ri++) {
          const a = pt(ri, si, z), b = pt(ri + 1, si, z), c = pt(ri + 1, si + 1, z), d = pt(ri, si + 1, z);
          if (ri < 0) tri(a, b, c, side);
          else {
            tri(a, b, c, side);
            tri(a, c, d, side);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  /**
   * Flat polygon (convex, points in XZ) extruded in Y: top faces +Y, bottom -Y,
   * with per-vertex thickness (airfoil wings, crests).
   */
  slab(pts: readonly (readonly [number, number])[], thick: readonly number[], paint: Paint, m?: THREE.Matrix4): this {
    const pos: number[] = [];
    const n = pts.length;
    let cx = 0, cz = 0;
    for (const p of pts) {
      cx += p[0] / n;
      cz += p[1] / n;
    }
    const top = (i: number) => [pts[i][0], thick[i] / 2, pts[i][1]];
    const bot = (i: number) => [pts[i][0], -thick[i] / 2, pts[i][1]];
    const orient = (a: number[], b: number[], c: number[], hx: number, hy: number, hz: number) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * hx + ny * hy + nz * hz >= 0) pos.push(...a, ...b, ...c);
      else pos.push(...a, ...c, ...b);
    };
    for (let i = 1; i < n - 1; i++) {
      orient(top(0), top(i), top(i + 1), 0, 1, 0);
      orient(bot(0), bot(i), bot(i + 1), 0, -1, 0);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const hx = (pts[i][0] + pts[j][0]) / 2 - cx;
      const hz = (pts[i][1] + pts[j][1]) / 2 - cz;
      orient(top(i), bot(i), bot(j), hx, 0, hz);
      orient(top(i), bot(j), top(j), hx, 0, hz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ─── Palettes & painters ───────────────────────────────────────────────────

export interface Palette {
  key: string;
  base: number;
  back: number;
  belly: number;
  stripe: number;
  /** Crest / frill / quill colour. */
  accent: number;
  accent2: number;
  claw: number;
  teeth: number;
  mouth: number;
  eye: number;
}

const frac = (v: number) => v - Math.floor(v);

/**
 * Countershaded skin: dark back, pale belly, optional slanted stripes across
 * the body (stripes per metre along Z) and dapple spots.
 */
export function skin(p: Palette, stripes = 0, o: { w?: number; slant?: number; phase?: number; spots?: number; belly?: number } = {}): PaintFn {
  const w = o.w ?? 0.3;
  const slant = o.slant ?? 0.6;
  const bellyY = o.belly ?? -0.42;
  return (x, y, z, _nx, ny) => {
    let col = p.base;
    if (ny < bellyY) col = p.belly;
    else if (ny > 0.62) col = p.back;
    if (stripes > 0 && ny > -0.3 && frac((z + Math.abs(y) * slant) * stripes + (o.phase ?? 0)) < w) col = p.stripe;
    if (o.spots && ny > -0.25 && hash3(x * 9, y * 9, z * 9, 3) < o.spots) col = p.stripe;
    return col;
  };
}

/** Limb paint: base with a darker front and scaly noise. */
export function limbPaint(p: Palette): PaintFn {
  return (_x, _y, _z, _nx, ny, nz) => (nz > 0.55 ? p.back : ny < -0.6 ? p.belly : p.base);
}

// ─── Theropod rig (compy / raptor / dilo) ──────────────────────────────────

export interface TheroSpec {
  key: string;
  pal: Palette;
  hipGap: number;
  thigh: number;
  shin: number;
  meta: number;
  toe: number;
  /** Leg thickness multiplier. */
  legR: number;
  footH: number;
  hips: readonly [number, number, number];
  torso: { len: number; r0: readonly [number, number]; r1: readonly [number, number]; rise: number };
  neck: { lens: readonly number[]; r0: readonly [number, number]; r1: readonly [number, number]; rest: readonly number[] };
  headRest: number;
  skull: { len: number; r: readonly [number, number] };
  snout: { len: number; r1: readonly [number, number]; drop: number };
  jaw: { len: number; r0: readonly [number, number]; r1: readonly [number, number] };
  tail: { lens: readonly number[]; r0: readonly [number, number]; taper: number; rest: readonly number[] };
  arm: { upper: number; fore: number; r: number; claw: number };
  stripes: number;
  spots?: number;
  teeth: number;
  sickle: boolean;
  /** Quill crest size (0 = none). */
  quills: number;
  /** Dilophosaurus twin head crests. */
  crests?: boolean;
  eyeSize: number;
  /** Compsognathus-style mesh budget: merge hips+arms into torso, jaw into head, meta+foot. */
  compact?: boolean;
}

export interface TheroLeg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  toe: THREE.Group;
}

export interface TheroRig {
  pelvis: THREE.Group;
  body: THREE.Group;
  chest: THREE.Group;
  torso: THREE.Mesh;
  neck: THREE.Group[];
  head: THREE.Group;
  headMesh: THREE.Mesh;
  jaw: THREE.Group | null;
  mouth: THREE.Group;
  tail: THREE.Group[];
  legs: TheroLeg[];
  arms: { shoulder: THREE.Group; elbow: THREE.Group }[];
  hipH: number;
  /** Head height / forward offset in model space at rest. */
  headH: number;
  headFwd: number;
  meshes: { head: THREE.Mesh[]; torso: THREE.Mesh[]; limb: THREE.Mesh[]; tail: THREE.Mesh[] };
}

/** Rest joint angles for digitigrade legs (hip forward, knee back, ankle forward). */
export const LEG_REST = { hip: -0.55, knee: 1.15, ankle: -0.95 } as const;
export const ARM_REST = { shoulder: 0.35, elbow: -1.45 } as const;

export function theroLegHeight(s: TheroSpec, hip: number = LEG_REST.hip, knee: number = LEG_REST.knee, ankle: number = LEG_REST.ankle): number {
  const a1 = hip;
  const a2 = hip + knee;
  const a3 = a2 + ankle;
  return s.thigh * Math.cos(a1) + s.shin * Math.cos(a2) + s.meta * Math.cos(a3) + s.footH;
}

const lerp2 = (a: readonly [number, number], b: readonly [number, number], t: number): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

function eyesGeo(x: number, y: number, z: number, size: number): THREE.BufferGeometry {
  return dgeo(`eyes|${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}|${size}`, () =>
    new Sculpt(0)
      .box(size * 0.7, size, size * 1.5, 0xffffff, M(x, y, z, 0, 0.35, 0))
      .box(size * 0.7, size, size * 1.5, 0xffffff, M(-x, y, z, 0, -0.35, 0))
      .build(),
  );
}

/** Builds the theropod skeleton + painted meshes under `model` (facing +Z, feet at y = 0). */
export function buildTheropod(model: THREE.Group, s: TheroSpec): TheroRig {
  const mat = skinMat();
  const p = s.pal;
  const K = `${s.key}|${p.key}`;
  const meshes: TheroRig['meshes'] = { head: [], torso: [], limb: [], tail: [] };
  const hipH = theroLegHeight(s);
  const pelvis = Kit.pivot(model, 0, hipH, 0, 'pelvis');
  const body = Kit.pivot(pelvis, 0, 0, 0, 'body');
  const sk = s.skull;
  const sn = s.snout;
  const T = s.torso;

  // Arms are built pointing down from the shoulder / elbow pivots.
  const armUpper = (sc: Sculpt, m: THREE.Matrix4) => {
    const a = s.arm;
    sc.seg(a.upper + 0.02, [a.r, a.r * 1.15], [a.r * 0.8, a.r * 0.9], skin(p), m.clone().multiply(M(0, 0.02, 0, Math.PI / 2)), { sides: 5 });
  };
  const armFore = (sc: Sculpt, m: THREE.Matrix4) => {
    const a = s.arm;
    sc.seg(a.fore, [a.r * 0.8, a.r * 0.85], [a.r * 0.6, a.r * 0.6], skin(p), m.clone().multiply(M(0, 0, 0, Math.PI / 2)), { sides: 5 });
    for (let i = -1; i <= 1; i++) {
      sc.cone(a.r * 0.32, a.claw, p.claw, m.clone().multiply(M(i * a.r * 0.45, -a.fore + 0.01, a.r * 0.2, Math.PI + 0.4, 0, i * 0.15)), 4);
    }
  };

  // ── Torso ──
  const chest = Kit.pivot(body, 0, 0.02, 0.06, 'chest');
  const torsoGeo = dgeo(`${K}|torso`, () => {
    const sc = new Sculpt(0.07, 2);
    sc.seg(T.len, T.r0, T.r1, skin(p, s.stripes, { spots: s.spots }), M(0, 0, -0.02), { sides: 8, rings: 4, dy: T.rise, bulge: 0.1 });
    if (s.compact) {
      sc.blob(s.hips[0], s.hips[1], s.hips[2], skin(p, s.stripes, { phase: 0.4, spots: s.spots }), M(0, 0.01, -0.08), 8, 5);
      for (const side of [1, -1]) {
        // Folded arms merged into the torso (fixed pose).
        const sm = M(side * T.r0[0] * 0.55, -T.r1[1] * 0.3, T.len * 0.8, ARM_REST.shoulder);
        armUpper(sc, sm);
        armFore(sc, sm.clone().multiply(M(0, -s.arm.upper, 0, ARM_REST.elbow)));
      }
    }
    return sc.build();
  });
  const torso = Kit.add(chest, torsoGeo, mat);
  meshes.torso.push(torso);
  if (!s.compact) {
    const hipsGeo = dgeo(`${K}|hips`, () =>
      new Sculpt(0.07, 1).blob(s.hips[0], s.hips[1], s.hips[2], skin(p, s.stripes, { phase: 0.4, spots: s.spots }), M(0, 0.02, -0.08), 8, 6).build(),
    );
    meshes.torso.push(Kit.add(body, hipsGeo, mat));
  }

  // ── Neck ──
  const neck: THREE.Group[] = [];
  let parent: THREE.Object3D = chest;
  let nz = T.len - 0.05;
  let ny = T.rise + T.r1[1] * 0.25;
  const nN = s.neck.lens.length;
  for (let i = 0; i < nN; i++) {
    const n = Kit.pivot(parent, 0, ny, nz, 'neck' + i);
    n.rotation.order = 'YXZ';
    n.rotation.x = s.neck.rest[i];
    const r0 = lerp2(s.neck.r0, s.neck.r1, i / nN);
    const r1 = lerp2(s.neck.r0, s.neck.r1, (i + 1) / nN);
    const len = s.neck.lens[i];
    const g = dgeo(`${K}|neck${i}`, () =>
      new Sculpt(0.06, 3 + i).seg(len + 0.06, r0, r1, skin(p, 0, { spots: s.spots }), M(0, 0, -0.04), { sides: 6, rings: 2 }).build(),
    );
    meshes.torso.push(Kit.add(n, g, mat));
    neck.push(n);
    parent = n;
    nz = len;
    ny = 0;
  }

  // ── Head ──
  const head = Kit.pivot(parent, 0, 0, nz, 'head');
  head.rotation.order = 'YXZ';
  head.rotation.x = s.headRest;
  const snoutY0 = -sk.r[1] * 0.12;
  const snoutR0: [number, number] = [sk.r[0] * 0.85, sk.r[1] * 0.78];
  const snoutAt = (t: number) => ({
    z: sk.len - 0.03 + t * sn.len,
    rx: lerp(snoutR0[0], sn.r1[0], t),
    ry: lerp(snoutR0[1], sn.r1[1], t),
    y: snoutY0 - sn.drop * t * t,
  });
  const jawY = -sk.r[1] * 0.55;
  const jawZ = -0.02;
  const headPaint: PaintFn = (x, y, z, nx, nyy) => {
    if (nyy < -0.5) return p.belly;
    // Dark mask band through the eyes, lighter lips.
    if (Math.abs(nx) > 0.5 && z > sk.len * 0.1 && z < sk.len * 0.9 && y > -0.01) return p.stripe;
    if (nyy > 0.6) return p.back;
    return z > sk.len + sn.len * 0.55 && y < snoutY0 ? p.belly : p.base;
  };
  const buildJaw = (sc: Sculpt, m: THREE.Matrix4) => {
    const J = s.jaw;
    sc.seg(J.len, J.r0, J.r1, (_x, _y, _z, _nx, nyy) => (nyy > 0.7 ? p.mouth : nyy < -0.3 ? p.belly : p.base), m.clone().multiply(M(0, 0, jawZ - 0.02)), { sides: 6 });
    sc.box(J.r0[0] * 0.9, 0.012, J.len * 0.7, p.mouth, m.clone().multiply(M(0, J.r0[1] * 0.6, J.len * 0.4)));
    for (let i = 0; i < s.teeth; i++) {
      const t = 0.18 + (0.78 * i) / Math.max(1, s.teeth - 1);
      const rx = lerp(J.r0[0], J.r1[0], t);
      const ry = lerp(J.r0[1], J.r1[1], t);
      const h = 0.03 + 0.012 * Math.sin(i * 2.3);
      for (const side of [1, -1]) sc.cone(0.009, h * (s.key === 'compy' ? 0.5 : 1), p.teeth, m.clone().multiply(M(side * rx * 0.72, ry * 0.55, jawZ + t * J.len, 0.15, 0, 0)), 4);
    }
  };
  const headGeo = dgeo(`${K}|head`, () => {
    const sc = new Sculpt(0.05, 7);
    sc.seg(sk.len + 0.08, [sk.r[0] * 0.92, sk.r[1] * 0.9], sk.r, headPaint, M(0, 0.01, -0.08), { sides: 6, rings: 2, bulge: 0.1 });
    sc.seg(sn.len, snoutR0, sn.r1, headPaint, M(0, snoutY0, sk.len - 0.03), { sides: 6, rings: 2, dy: -sn.drop });
    // Palate (visible when the jaw opens).
    sc.box(snoutR0[0] * 1.1, 0.014, sn.len * 0.85, p.mouth, M(0, snoutY0 - snoutR0[1] * 0.62, sk.len + sn.len * 0.35));
    // Brow ridges + nostrils.
    for (const side of [1, -1]) {
      sc.box(sk.r[0] * 0.5, sk.r[1] * 0.28, sk.len * 0.62, p.back, M(side * sk.r[0] * 0.62, sk.r[1] * 0.8, sk.len * 0.45, 0.1, 0, side * 0.35));
      const tip = snoutAt(0.88);
      sc.box(0.012, 0.012, 0.02, p.mouth, M(side * tip.rx * 0.55, tip.y + tip.ry * 0.5, tip.z));
    }
    // Upper teeth along the lip line.
    for (let i = 0; i < s.teeth; i++) {
      const t = 0.12 + (0.84 * i) / Math.max(1, s.teeth - 1);
      const a = snoutAt(t);
      const h = (0.034 + 0.016 * Math.sin(i * 1.7 + 1)) * (s.key === 'compy' ? 0.5 : 1);
      for (const side of [1, -1]) sc.cone(0.01, h, p.teeth, M(side * a.rx * 0.78, a.y - a.ry * 0.55, a.z, Math.PI - 0.1, 0, 0), 4);
    }
    if (s.quills > 0) {
      const q = s.quills;
      for (let i = 0; i < 6; i++) {
        const z = sk.len * 0.55 - i * 0.055 * q;
        const len = 0.1 * q * (1 - i * 0.1);
        for (const side of [1, -1]) {
          sc.cone(0.018 * q, len, i % 2 ? p.accent2 : p.accent, M(side * sk.r[0] * 0.35, sk.r[1] * 0.75, z, -1.05 - i * 0.08, 0, side * 0.35), 4);
        }
      }
    }
    if (s.crests) {
      // Two thin half-moon crests running along the skull (Dilophosaurus).
      for (const side of [1, -1]) {
        sc.add(
          new THREE.CylinderGeometry(1, 1, 1, 12),
          (_x, y) => (y > sk.r[1] + 0.08 ? p.accent : p.accent2),
          M(side * 0.028, sk.r[1] * 0.85, sk.len * 0.45 + sn.len * 0.2, 0, 0, Math.PI / 2, 0.11, 0.012, 0.22),
          0.03,
        );
      }
    }
    if (s.compact) buildJaw(sc, M(0, jawY, 0, 0.18));
    return sc.build();
  });
  const headMesh = Kit.add(head, headGeo, mat);
  meshes.head.push(headMesh);
  const eyeZ = sk.len * 0.42;
  Kit.add(head, eyesGeo(sk.r[0] * 0.86, sk.r[1] * 0.32, eyeZ, s.eyeSize), Kit.glow(p.eye, 1.15));
  let jaw: THREE.Group | null = null;
  if (!s.compact) {
    jaw = Kit.pivot(head, 0, jawY, 0, 'jaw');
    const jawGeo = dgeo(`${K}|jaw`, () => {
      const sc = new Sculpt(0.05, 9);
      buildJaw(sc, new THREE.Matrix4());
      return sc.build();
    });
    meshes.head.push(Kit.add(jaw, jawGeo, mat));
  }
  const tipA = snoutAt(0.92);
  const mouth = Kit.pivot(head, 0, tipA.y - tipA.ry, tipA.z, 'mouth');

  // ── Tail ──
  const tail: THREE.Group[] = [];
  let tp: THREE.Object3D = body;
  let tz = -s.hips[2] * 0.72;
  let ty = 0.05;
  let tr: [number, number] = [s.tail.r0[0], s.tail.r0[1]];
  for (let i = 0; i < s.tail.lens.length; i++) {
    const seg = Kit.pivot(tp, 0, ty, tz, 'tail' + i);
    seg.rotation.x = s.tail.rest[i] ?? 0;
    const len = s.tail.lens[i];
    const last = i === s.tail.lens.length - 1;
    const r1: [number, number] = last ? [0.012, 0.014] : [tr[0] * s.tail.taper, tr[1] * s.tail.taper];
    const r0 = tr;
    const g = dgeo(`${K}|tail${i}`, () =>
      new Sculpt(0.06, 11 + i)
        .seg(len + 0.05, r0, r1, skin(p, s.stripes * 1.3, { phase: i * 0.37, spots: s.spots, w: 0.36 }), M(0, 0, 0.04, 0, Math.PI, 0), { sides: 6, rings: 3 })
        .build(),
    );
    meshes.tail.push(Kit.add(seg, g, mat));
    tail.push(seg);
    tp = seg;
    tz = -len;
    ty = 0;
    tr = r1;
  }

  // ── Legs ──
  const legs: TheroLeg[] = [];
  const L = s.legR;
  const lp = limbPaint(p);
  const footGeo = (sc: Sculpt, m: THREE.Matrix4) => {
    const fh = s.footH;
    // Heel pad.
    sc.blob(0.045 * L, fh * 0.6, 0.06 * L, lp, m.clone().multiply(M(0, -fh * 0.4, 0.0)), 6, 4);
    for (const tx of [-0.022, 0.026]) {
      sc.seg(s.toe, [0.026 * L, fh * 0.42], [0.016 * L, fh * 0.3], lp, m.clone().multiply(M(tx * L, -fh * 0.55, 0, 0.05, tx * 2.2, 0)), { sides: 5 });
      sc.cone(0.012 * L, 0.045 * L, p.claw, m.clone().multiply(M(tx * L * 1.2, -fh * 0.6, s.toe + 0.005, Math.PI / 2 + 0.5, 0, 0)), 4);
    }
    // Hallux (dew claw) at the back.
    sc.cone(0.01 * L, 0.04 * L, p.claw, m.clone().multiply(M(0.03 * L, -fh * 0.2, -0.03, -Math.PI / 2 - 0.3, 0, 0)), 4);
    if (s.sickle) {
      // Raised inner toe with the big hooked killing claw.
      sc.seg(0.07, [0.02, 0.022], [0.016, 0.018], lp, m.clone().multiply(M(0.05, -fh * 0.3, 0.0, -0.9, 0.3, 0)), { sides: 5 });
      sc.cone(0.022, 0.13, p.claw, m.clone().multiply(M(0.07, 0.035, 0.055, 0.45, 0, -0.1)), 5);
    }
  };
  for (const side of [1, -1]) {
    const hip = Kit.pivot(pelvis, side * s.hipGap, -0.02, 0, 'hip');
    const thighGeo = dgeo(`${K}|thigh`, () =>
      new Sculpt(0.07, 21).seg(s.thigh + 0.08, [0.11 * L, 0.17 * L], [0.058 * L, 0.075 * L], skin(p, s.stripes * 0.8, { slant: 0, spots: s.spots }), M(0, 0.08, 0, Math.PI / 2), { sides: 6, rings: 2, bulge: 0.18 }).build(),
    );
    meshes.limb.push(Kit.add(hip, thighGeo, mat));
    const knee = Kit.pivot(hip, 0, -s.thigh, 0, 'knee');
    const shinGeo = dgeo(`${K}|shin`, () => new Sculpt(0.07, 22).seg(s.shin + 0.04, [0.068 * L, 0.09 * L], [0.04 * L, 0.048 * L], lp, M(0, 0.04, 0, Math.PI / 2), { sides: 5 }).build());
    meshes.limb.push(Kit.add(knee, shinGeo, mat));
    const ankle = Kit.pivot(knee, 0, -s.shin, 0, 'ankle');
    const toe = Kit.pivot(ankle, 0, -s.meta, 0, 'toe');
    if (s.compact) {
      const g = dgeo(`${K}|metafoot`, () => {
        const sc = new Sculpt(0.07, 23);
        sc.seg(s.meta + 0.02, [0.036 * L, 0.04 * L], [0.03 * L, 0.034 * L], lp, M(0, 0.02, 0, Math.PI / 2), { sides: 5 });
        footGeo(sc, M(0, -s.meta, 0, -(LEG_REST.hip + LEG_REST.knee + LEG_REST.ankle)));
        return sc.build();
      });
      meshes.limb.push(Kit.add(ankle, g, mat));
    } else {
      const g = dgeo(`${K}|meta`, () => new Sculpt(0.07, 23).seg(s.meta + 0.03, [0.042 * L, 0.05 * L], [0.036 * L, 0.042 * L], lp, M(0, 0.03, 0, Math.PI / 2), { sides: 5 }).build());
      meshes.limb.push(Kit.add(ankle, g, mat));
      const fg = dgeo(`${K}|foot${side}`, () => {
        const sc = new Sculpt(0.07, 24);
        // Mirror the foot for the right side so the sickle claw is always on the inside.
        footGeo(sc, side > 0 ? new THREE.Matrix4() : M(0, 0, 0, 0, 0, 0, -1, 1, 1));
        return sc.build();
      });
      meshes.limb.push(Kit.add(toe, fg, mat));
    }
    legs.push({ hip, knee, ankle, toe });
  }

  // ── Arms ──
  const arms: TheroRig['arms'] = [];
  if (!s.compact) {
    for (const side of [1, -1]) {
      const shoulder = Kit.pivot(chest, side * T.r0[0] * 0.6, -T.r1[1] * 0.25, T.len * 0.78, 'shoulder');
      shoulder.rotation.x = ARM_REST.shoulder;
      const ag = dgeo(`${K}|upperarm`, () => {
        const sc = new Sculpt(0.06, 31);
        armUpper(sc, new THREE.Matrix4());
        return sc.build();
      });
      meshes.limb.push(Kit.add(shoulder, ag, mat));
      const elbow = Kit.pivot(shoulder, 0, -s.arm.upper, 0, 'elbow');
      elbow.rotation.x = ARM_REST.elbow;
      const fg = dgeo(`${K}|forearm`, () => {
        const sc = new Sculpt(0.06, 32);
        armFore(sc, new THREE.Matrix4());
        return sc.build();
      });
      meshes.limb.push(Kit.add(elbow, fg, mat));
      arms.push({ shoulder, elbow });
    }
  }

  // Measure the head position at rest (model space).
  model.updateMatrixWorld(true);
  const hp = new THREE.Vector3();
  headMesh.localToWorld(hp.set(0, 0, sk.len * 0.5));
  model.worldToLocal(hp);
  return {
    pelvis,
    body,
    chest,
    torso,
    neck,
    head,
    headMesh,
    jaw,
    mouth,
    tail,
    legs,
    arms,
    hipH,
    headH: hp.y,
    headFwd: hp.z + sk.len * 0.5 + sn.len,
    meshes,
  };
}

/**
 * Poses one digitigrade leg. `ph` is the stride phase, `run` 0..1 the stride
 * amplitude, `crouch` 0..1, `air` 0..1 (leap pose, claws forward). Returns the
 * vertical extent hip→sole so the caller can plant the body on the stance leg.
 */
export function poseTheroLeg(s: TheroSpec, leg: TheroLeg, ph: number, run: number, crouch: number, air: number, stride = 0.55): number {
  const sn = Math.sin(ph);
  const lift = Math.max(0, Math.cos(ph)) * run;
  let hip = LEG_REST.hip - sn * stride * run - crouch * 0.45;
  let knee = LEG_REST.knee + lift * 0.95 + crouch * 0.85;
  let ankle = LEG_REST.ankle - lift * 0.75 - crouch * 0.5;
  // Leap pose: thighs up, shins and feet thrust forward so the claws lead.
  hip = lerp(hip, -1.15, air);
  knee = lerp(knee, 0.3, air);
  ankle = lerp(ankle, 0.05, air);
  leg.hip.rotation.x = hip;
  leg.knee.rotation.x = knee;
  leg.ankle.rotation.x = ankle;
  leg.toe.rotation.x = -(hip + knee + ankle) + lift * 0.9 - air * 0.4;
  return theroLegHeight(s, hip, knee, ankle);
}

// ─── Pteranodon ────────────────────────────────────────────────────────────

export interface PteroRig {
  body: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  /** [left(+X), right(-X)] */
  shoulders: THREE.Group[];
  wrists: THREE.Group[];
  legs: THREE.Group;
  meshes: { head: THREE.Mesh[]; torso: THREE.Mesh[]; limb: THREE.Mesh[] };
}

export const PTERO_PAL: Palette = {
  key: 'ptero',
  base: 0x6a5a4a,
  back: 0x3e342c,
  belly: 0xcbbca0,
  stripe: 0x2e2620,
  accent: 0xc8401e,
  accent2: 0x7a1e10,
  claw: 0x1e1a16,
  teeth: 0xe8dfc8,
  mouth: 0x7a2a26,
  eye: 0xff9a2a,
};

export function buildPtero(model: THREE.Group, p: Palette = PTERO_PAL): PteroRig {
  const mat = skinMat();
  const K = `ptero|${p.key}`;
  const body = Kit.pivot(model, 0, 0, 0, 'body');
  const meshes: PteroRig['meshes'] = { head: [], torso: [], limb: [] };
  const torsoGeo = dgeo(`${K}|torso`, () => {
    const sc = new Sculpt(0.06, 41);
    sc.seg(0.62, [0.1, 0.11], [0.15, 0.16], skin(p), M(0, 0, -0.38), { sides: 8, rings: 3, bulge: 0.15 });
    sc.cone(0.07, 0.2, skin(p), M(0, 0, -0.36, -Math.PI / 2), 5);
    return sc.build();
  });
  meshes.torso.push(Kit.add(body, torsoGeo, mat));
  const neck = Kit.pivot(body, 0, 0.06, 0.22, 'neck');
  neck.rotation.order = 'YXZ';
  neck.rotation.x = -0.35;
  const neckGeo = dgeo(`${K}|neck`, () => new Sculpt(0.06, 42).seg(0.34, [0.08, 0.09], [0.055, 0.065], skin(p), M(0, 0, -0.03), { sides: 6 }).build());
  meshes.torso.push(Kit.add(neck, neckGeo, mat));
  const head = Kit.pivot(neck, 0, 0, 0.3, 'head');
  head.rotation.order = 'YXZ';
  head.rotation.x = 0.4;
  const beak = 0xd8b060;
  const beakDark = 0x8a6a30;
  const headGeo = dgeo(`${K}|head`, () => {
    const sc = new Sculpt(0.05, 43);
    sc.seg(0.2, [0.06, 0.07], [0.055, 0.06], skin(p), M(0, 0, -0.06), { sides: 6, bulge: 0.12 });
    // Long toothless upper beak.
    sc.seg(0.78, [0.045, 0.05], [0.006, 0.008], (_x, _y, z) => (z > 0.7 ? beakDark : beak), M(0, -0.005, 0.12), { sides: 6, rings: 2, dy: -0.04 });
    // Swept-back crest blade.
    sc.seg(0.6, [0.032, 0.085], [0.016, 0.03], (_x, y) => (y > 0.1 ? p.accent : p.accent2), M(0, 0.06, 0.05, -2.75, 0, 0), { sides: 6, rings: 2 });
    return sc.build();
  });
  meshes.head.push(Kit.add(head, headGeo, mat));
  Kit.add(head, eyesGeo(0.056, 0.025, 0.03, 0.036), Kit.glow(p.eye, 1.2));
  const jaw = Kit.pivot(head, 0, -0.035, 0.1, 'jaw');
  const jawGeo = dgeo(`${K}|jaw`, () =>
    new Sculpt(0.05, 44).seg(0.7, [0.04, 0.025], [0.005, 0.005], (_x, _y, z) => (z > 0.6 ? beakDark : beak), M(0, -0.01, 0), { sides: 5 }).build(),
  );
  meshes.head.push(Kit.add(jaw, jawGeo, mat));

  // Wings: leading edge thick (arm bones), trailing edge thin membrane.
  const wingPaint: PaintFn = (x, _y, z, _nx, ny) => {
    if (ny > 0.3) return frac(Math.abs(x) * 2.6 + z * 0.8) < 0.18 ? p.stripe : p.back;
    if (ny < -0.3) return frac(Math.abs(x) * 2.6) < 0.12 ? p.base : p.belly;
    return p.base;
  };
  const inner: [number, number][] = [
    [0, 0.17],
    [0.98, 0.13],
    [0.98, -0.1],
    [0.55, -0.32],
    [0.0, -0.46],
  ];
  const innerT = [0.09, 0.07, 0.02, 0.014, 0.03];
  const outer: [number, number][] = [
    [0, 0.13],
    [0.6, 0.06],
    [1.25, -0.24],
    [0.75, -0.22],
    [0.0, -0.1],
  ];
  const outerT = [0.07, 0.04, 0.012, 0.01, 0.02];
  const shoulders: THREE.Group[] = [];
  const wrists: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const sh = Kit.pivot(body, side * 0.11, 0.06, 0.1, 'shoulder');
    sh.rotation.order = 'YXZ';
    const mirror = (pts: [number, number][]) => pts.map(([x, z]) => [x * side, z] as [number, number]);
    const ig = dgeo(`${K}|wingIn${side}`, () => new Sculpt(0.05, 45).slab(mirror(inner), innerT, wingPaint).build());
    meshes.limb.push(Kit.add(sh, ig, mat));
    const wr = Kit.pivot(sh, side * 0.98, 0, 0, 'wrist');
    const og = dgeo(`${K}|wingOut${side}`, () => {
      const sc = new Sculpt(0.05, 46).slab(mirror(outer), outerT, wingPaint);
      // Little clawed fingers at the wrist.
      sc.cone(0.012, 0.07, p.claw, M(side * 0.02, 0.02, 0.15, 0.9, 0, 0), 4);
      return sc.build();
    });
    meshes.limb.push(Kit.add(wr, og, mat));
    shoulders.push(sh);
    wrists.push(wr);
  }
  const legs = Kit.pivot(body, 0, -0.06, -0.3, 'legs');
  const legGeo = dgeo(`${K}|legs`, () => {
    const sc = new Sculpt(0.06, 47);
    for (const side of [1, -1]) {
      sc.seg(0.34, [0.03, 0.035], [0.018, 0.02], skin(p), M(side * 0.08, 0, 0, 0.2, Math.PI + side * 0.12, 0), { sides: 5 });
      for (let i = -1; i <= 1; i++) sc.cone(0.008, 0.06, p.claw, M(side * 0.1 + i * 0.012, -0.08, -0.36, -1.9, 0, 0), 3);
    }
    return sc.build();
  });
  meshes.limb.push(Kit.add(legs, legGeo, mat));
  return { body, neck, head, jaw, shoulders, wrists, legs, meshes };
}

// ─── Triceratops ───────────────────────────────────────────────────────────

export interface TrikeLeg {
  upper: THREE.Group;
  lower: THREE.Group;
  front: boolean;
  side: number;
  len: [number, number];
}

export interface TrikeRig {
  body: THREE.Group;
  bodyMesh: THREE.Mesh;
  neck: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  tail: THREE.Group[];
  legs: TrikeLeg[];
  hipH: number;
  meshes: { head: THREE.Mesh[]; torso: THREE.Mesh[]; limb: THREE.Mesh[]; tail: THREE.Mesh[]; armor: THREE.Mesh[] };
}

export const TRIKE_PAL: Palette = {
  key: 'trike',
  base: 0x7c7150,
  back: 0x544b34,
  belly: 0xbcae86,
  stripe: 0x433b29,
  accent: 0x9a3a1c,
  accent2: 0xc0903c,
  claw: 0x2e2a22,
  teeth: 0xe9dfc6,
  mouth: 0x6a2622,
  eye: 0xffa040,
};

export function buildTrike(model: THREE.Group, p: Palette = TRIKE_PAL): TrikeRig {
  const mat = skinMat();
  const K = `trike|${p.key}`;
  const meshes: TrikeRig['meshes'] = { head: [], torso: [], limb: [], tail: [], armor: [] };
  // Leg geometry drives the body height.
  const rear: [number, number] = [0.74, 0.64];
  const front: [number, number] = [0.6, 0.56];
  const foot = 0.1;
  const hipH = rear[0] * Math.cos(0.12) + rear[1] * Math.cos(0.12) + foot;
  const body = Kit.pivot(model, 0, hipH + 0.08, 0, 'body');
  const bodyGeo = dgeo(`${K}|body`, () => {
    const sc = new Sculpt(0.06, 51);
    const sp = skin(p, 0.9, { w: 0.3, slant: 0.3 });
    sc.blob(0.92, 0.84, 1.55, sp, M(0, 0.06, 0.28), 10, 8);
    sc.blob(0.84, 0.8, 0.95, sp, M(0, 0.12, -0.68), 8, 6);
    // Shoulder and haunch masses.
    for (const side of [1, -1]) {
      sc.blob(0.36, 0.52, 0.55, sp, M(side * 0.64, -0.2, -0.75), 6, 5);
      sc.blob(0.3, 0.44, 0.44, sp, M(side * 0.66, -0.34, 1.2), 6, 5);
    }
    return sc.build();
  });
  const bodyMesh = Kit.add(body, bodyGeo, mat);
  meshes.torso.push(bodyMesh);

  // Neck + head.
  const neck = Kit.pivot(body, 0, -0.05, 1.7, 'neck');
  neck.rotation.order = 'YXZ';
  neck.rotation.x = 0.12;
  const neckGeo = dgeo(`${K}|neck`, () => new Sculpt(0.06, 52).seg(0.62, [0.5, 0.52], [0.4, 0.44], skin(p), M(0, 0, -0.08), { sides: 8 }).build());
  meshes.torso.push(Kit.add(neck, neckGeo, mat));
  const head = Kit.pivot(neck, 0, 0, 0.5, 'head');
  head.rotation.order = 'YXZ';
  head.rotation.x = 0.12;
  const beak = 0x35302a;
  const headGeo = dgeo(`${K}|head`, () => {
    const sc = new Sculpt(0.05, 53);
    const hp: PaintFn = (_x, y, z, _nx, ny) => (z > 1.0 && y < 0.05 ? beak : ny > 0.6 ? p.back : ny < -0.5 ? p.belly : p.base);
    sc.seg(0.9, [0.44, 0.5], [0.33, 0.36], hp, M(0, 0, -0.3), { sides: 8, rings: 2 });
    sc.seg(0.75, [0.31, 0.34], [0.09, 0.11], hp, M(0, -0.04, 0.52), { sides: 6, rings: 2, dy: -0.28 });
    // Hooked beak tip.
    sc.cone(0.085, 0.22, beak, M(0, -0.34, 1.16, 2.5, 0, 0), 5);
    // Cheek bosses.
    for (const side of [1, -1]) sc.cone(0.1, 0.2, p.back, M(side * 0.36, -0.12, 0.05, 0, 0, -side * 1.9), 5);
    return sc.build();
  });
  meshes.head.push(Kit.add(head, headGeo, mat));
  Kit.add(head, eyesGeo(0.37, 0.14, 0.3, 0.085), Kit.glow(p.eye, 1.1));
  const hornGeo = dgeo(`${K}|horns`, () => {
    const sc = new Sculpt(0.04, 54);
    const hornPaint = (y0: number, len: number): PaintFn => (_x, y, z) => {
      const t = clamp((Math.hypot(y - y0, z) - 0.05) / len, 0, 1);
      return t > 0.72 ? 0x3a3428 : t > 0.45 ? 0xbdb196 : p.teeth;
    };
    for (const side of [1, -1]) {
      sc.cone(0.1, 1.0, hornPaint(0.36, 1.0), M(side * 0.22, 0.36, 0.28, 1.18, 0, -side * 0.12), 7);
    }
    sc.cone(0.085, 0.32, hornPaint(0.18, 0.32), M(0, 0.18, 0.86, 0.5, 0, 0), 6);
    return sc.build();
  });
  meshes.armor.push(Kit.add(head, hornGeo, mat));
  const frillGeo = dgeo(`${K}|frill`, () => {
    const sc = new Sculpt(0.05, 55);
    const R = 1.05;
    const fp: PaintFn = (x, y, _z, _nx, _ny, nz) => {
      const r = Math.hypot(x, y) / R;
      if (nz < -0.3) return r > 0.8 ? p.back : p.base;
      if (r > 0.9) return p.teeth;
      if (r > 0.72) return p.accent;
      if (r > 0.62) return p.accent2;
      // Eye-spots on the shield.
      if (r > 0.3 && hash3(Math.round(x * 4), Math.round(y * 4), 1, 5) < 0.22) return p.stripe;
      return r < 0.35 ? p.back : p.base;
    };
    const tilt = M(0, 0.22, -0.3, -0.85, 0, 0);
    sc.fan(R, -0.3, Math.PI + 0.3, 14, [0.35, 0.68, 1], (i) => (i % 2 ? 1.0 : 0.94), 0.1, fp, tilt);
    // Epoccipital spikes around the rim.
    for (let i = 0; i <= 14; i++) {
      const a = -0.32 + ((Math.PI + 0.64) * i) / 14;
      const m = tilt.clone().multiply(M(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, 0, 0, 0, a - Math.PI / 2));
      sc.cone(0.05, 0.1, p.teeth, m, 4);
    }
    return sc.build();
  });
  meshes.armor.push(Kit.add(head, frillGeo, mat));
  const jaw = Kit.pivot(head, 0, -0.3, 0.05, 'jaw');
  const jawGeo = dgeo(`${K}|jaw`, () => {
    const sc = new Sculpt(0.05, 56);
    sc.seg(1.0, [0.3, 0.14], [0.08, 0.06], (_x, _y, z, _nx, ny) => (z > 0.8 ? beak : ny > 0.6 ? p.mouth : ny < -0.4 ? p.belly : p.base), M(0, 0, -0.1), { sides: 6, dy: 0.04 });
    return sc.build();
  });
  meshes.head.push(Kit.add(jaw, jawGeo, mat));

  // Tail.
  const tail: THREE.Group[] = [];
  let tp: THREE.Object3D = body;
  let tz = -1.4;
  let r: [number, number] = [0.5, 0.52];
  const tl = [0.78, 0.7, 0.62];
  for (let i = 0; i < tl.length; i++) {
    const seg = Kit.pivot(tp, 0, i === 0 ? 0.04 : 0, tz, 'tail' + i);
    seg.rotation.x = i === 0 ? -0.12 : -0.06;
    const last = i === tl.length - 1;
    const r1: [number, number] = last ? [0.04, 0.05] : [r[0] * 0.62, r[1] * 0.62];
    const r0 = r;
    const len = tl[i];
    const g = dgeo(`${K}|tail${i}`, () => new Sculpt(0.06, 57 + i).seg(len + 0.1, r0, r1, skin(p, 0.9, { w: 0.3, phase: i * 0.3 }), M(0, 0, 0.1, 0, Math.PI, 0), { sides: 7, rings: 2 }).build());
    meshes.tail.push(Kit.add(seg, g, mat));
    tail.push(seg);
    tp = seg;
    tz = -len;
    r = r1;
  }

  // Legs (columnar, elephant-like feet).
  const legs: TrikeLeg[] = [];
  const lp = limbPaint(p);
  const legGeos = (isFront: boolean) => {
    const [a, b] = isFront ? front : rear;
    const ru: [number, number] = isFront ? [0.25, 0.3] : [0.32, 0.44];
    const up = dgeo(`${K}|leg${isFront ? 'F' : 'R'}u`, () =>
      new Sculpt(0.06, 61).seg(a + 0.16, ru, [0.2, 0.23], skin(p, 0.9, { slant: 0, w: 0.3 }), M(0, 0.16, 0, Math.PI / 2), { sides: 7, bulge: 0.15 }).build(),
    );
    const lo = dgeo(`${K}|leg${isFront ? 'F' : 'R'}l`, () => {
      const sc = new Sculpt(0.07, 62);
      sc.seg(b + 0.04, [0.19, 0.2], [0.16, 0.17], lp, M(0, 0.04, 0, Math.PI / 2), { sides: 7 });
      sc.add(new THREE.CylinderGeometry(0.19, 0.23, foot, 8), lp, M(0, -b - foot / 2 + 0.02, 0.03));
      for (let i = -1; i <= 1; i++) sc.cone(0.05, 0.1, p.claw, M(i * 0.1, -b - foot + 0.04, 0.2, Math.PI / 2 + 0.25, 0, 0), 4);
      return sc.build();
    });
    return { up, lo };
  };
  for (const isFront of [true, false]) {
    const g = legGeos(isFront);
    for (const side of [1, -1]) {
      // Pivot heights put both pairs of feet on the ground at rest (body sits at hipH + 0.08).
      const upper = Kit.pivot(body, side * (isFront ? 0.64 : 0.58), isFront ? -0.3 : -0.08, isFront ? 1.18 : -0.75, 'leg');
      upper.rotation.z = isFront ? -side * 0.1 : 0;
      meshes.limb.push(Kit.add(upper, g.up, mat));
      const lower = Kit.pivot(upper, 0, -(isFront ? front[0] : rear[0]), 0, 'lowerleg');
      meshes.limb.push(Kit.add(lower, g.lo, mat));
      legs.push({ upper, lower, front: isFront, side, len: isFront ? front : rear });
    }
  }
  return { body, bodyMesh, neck, head, jaw, tail, legs, hipH, meshes };
}

// ─── Dino base class ───────────────────────────────────────────────────────

const GRAVITY = 22;
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Shared dinosaur behaviour on top of `Enemy`:
 *  - `lift`: model height above the root (leaps/flight) — immune to the base
 *    class's ground snap, so arcs never hitch.
 *  - airborne ballistic falls (knocked out of a leap), hit flinches, a lagging
 *    tail spring driven by turn rate, travel-facing when chasing a vehicle.
 *  - momentum deaths: the body keeps its (world) velocity, tumbles if it died
 *    in the air, slides, topples onto its side and sinks.
 *  - attack-slot helpers for custom attack states.
 */
export abstract class Dino extends Enemy {
  /** Model height above root.y (metres). */
  protected lift = 0;
  protected liftVel = 0;
  private prevLift = 0;
  /** Measured velocity in the entity's frame (m/s). */
  protected readonly vel = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private prevYaw = 0;
  protected yawRate = 0;
  /** Ballistic flight after being knocked out of the air. */
  protected airborne = false;
  protected readonly airVel = new THREE.Vector3();
  /** Hit reaction impulse (decays). */
  protected flinch = 0;
  protected flinchSide = 1;
  protected flinchHead = false;
  /** Lagging tail swing from turning (spring). */
  protected tailSwing = 0;
  private tailSwingV = 0;
  /** Seconds before the next attack may start. */
  protected cooldown = 0;
  /** 0..1 weight for facing the travel direction while riding along in the rig frame. */
  protected travelFacing = 0.85;
  /** Pitched idle vocalisation. */
  protected idleCall: { name: SfxName; pitch: number; vol: number; min: number; max: number } | null = null;
  private idleT = 2;

  // Death.
  protected readonly deathVel = new THREE.Vector3();
  protected deathVy = 0;
  protected deathSide = 1;
  protected deathTumble = 0;
  protected deathLanded = false;
  protected deathY = 0;
  /** Seconds after death before toppling starts / how long it takes. */
  protected toppleDelay = 0.1;
  protected toppleDur = 0.55;
  protected topple = 0;
  /** Height the model must rise when lying on its side (half body width). */
  protected lieHeight = 0.2;
  protected deathTime = 3.0;
  protected sinkDepth = 0.9;
  protected deathFriction = 3.5;
  protected landShake = 0.04;
  protected landDust = 0.8;
  private toppleHit = false;

  override onAdded(): void {
    super.onAdded();
    this.prevPos.copy(this.root.position);
    this.prevYaw = this.root.rotation.y;
    this.idleT = this.world.rng.range(1, 4);
  }

  override setState(s: EnemyState) {
    super.setState(s);
    // Custom attack states re-create their own telegraph right after.
    if (s !== 'windup') this.telegraph = null;
  }

  /** Grab one of the world's attack slots (fair cap on simultaneous attackers). */
  protected takeSlot(): boolean {
    if (!this.usesAttackSlot || this.holdsSlot) return true;
    if (this.world.attackSlots > 0) {
      this.world.attackSlots--;
      this.holdsSlot = true;
      return true;
    }
    return false;
  }

  /** Switch to a custom attack state while keeping (or taking) an attack slot. */
  protected enterAttack(state: string): boolean {
    if (this.usesAttackSlot && !this.holdsSlot && this.world.attackSlots <= 0) return false;
    this.setState(state);
    if (this.usesAttackSlot && !this.holdsSlot) {
      this.world.attackSlots = Math.max(0, this.world.attackSlots - 1);
      this.holdsSlot = true;
    }
    return true;
  }

  /** Play a sound with distance attenuation and pitch. */
  sfx(name: SfxName, vol = 1, pitch = 1, vary = 0.1) {
    const v = vol * clamp(1.4 - this.distToPlayer / 30, 0.25, 1);
    this.world.audio.play(name, { volume: v, pitch, vary });
  }

  override faceToward(target: THREE.Vector3, dt: number, rate = 6) {
    let yaw = Math.atan2(target.x - this.root.position.x, target.z - this.root.position.z);
    const rig = this.world.rig;
    if (this.frame === 'rig' && rig.speed > 1 && this.travelFacing > 0) {
      // Riding along with a vehicle: face where we're actually going (world-relative).
      const vx = this.vel.x;
      const vz = this.vel.z - rig.speed;
      const travel = Math.atan2(vx, vz);
      const w = clamp(rig.speed / 7, 0, 1) * this.travelFacing;
      yaw = travel + angleDelta(travel, yaw) * (1 - w);
    }
    this.root.rotation.y += angleDelta(this.root.rotation.y, yaw) * (1 - Math.exp(-rate * dt));
  }

  /** Called when an airborne dino touches down. */
  protected onLand(): void {
    this.world.fx.dust(this.worldPos(_v), 0.5);
  }

  override update(dt: number): void {
    if (this.airborne && this.state !== 'dying' && dt > 0) {
      this.airVel.y -= GRAVITY * dt;
      this.lift += this.airVel.y * dt;
      this.root.position.x += this.airVel.x * dt;
      this.root.position.z += this.airVel.z * dt;
      this.airVel.x *= Math.exp(-1.5 * dt);
      this.airVel.z *= Math.exp(-1.5 * dt);
      if (this.lift <= 0) {
        this.lift = 0;
        this.airborne = false;
        this.airVel.set(0, 0, 0);
        this.onLand();
      }
    }
    super.update(dt);
    if (this.removed || dt <= 0) return;
    if (this.state !== 'dying') {
      this.vel.subVectors(this.root.position, this.prevPos).divideScalar(dt);
      if (this.vel.lengthSq() > 900) this.vel.setLength(30);
      this.liftVel = (this.lift - this.prevLift) / dt;
      this.yawRate = this.yawRate * 0.6 + (angleDelta(this.prevYaw, this.root.rotation.y) / dt) * 0.4;
    }
    this.prevPos.copy(this.root.position);
    this.prevLift = this.lift;
    this.prevYaw = this.root.rotation.y;
    this.flinch = Math.max(0, this.flinch - dt * 3.5);
    this.cooldown -= dt;
    // Tail spring: swings opposite to turns, overshoots, settles.
    const target = clamp(-this.yawRate * 0.22, -0.7, 0.7);
    this.tailSwingV += ((target - this.tailSwing) * 55 - this.tailSwingV * 7) * dt;
    this.tailSwing += this.tailSwingV * dt;
    if (this.idleCall && this.state !== 'dying') {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        const c = this.idleCall;
        this.idleT = this.world.rng.range(c.min, c.max);
        this.sfx(c.name, c.vol, c.pitch, 0.15);
      }
    }
  }

  protected override animate(dt: number): void {
    if (!(this.state === 'entry' && this.spawn.entry === 'rise')) this.model.position.y = this.lift + this.deathY;
    this.pose(dt);
  }

  /** Subclass procedural animation (joints only). */
  protected abstract pose(dt: number): void;

  protected override onDamaged(hit: ShotHit, amount: number): void {
    const e = this.model.matrixWorld.elements;
    const d = hit.dir.x * e[0] + hit.dir.y * e[1] + hit.dir.z * e[2];
    this.flinchSide = d >= 0 ? 1 : -1;
    this.flinch = Math.min(1.3, this.flinch + 0.5 + amount * 0.15);
    this.flinchHead = hit.part === 'head';
  }

  /** Knock the dino into a ballistic fall (frame coords). */
  protected launch(vx: number, vy: number, vz: number) {
    this.airborne = true;
    this.airVel.set(vx, vy, vz);
  }

  protected override onDeath(_hit: ShotHit | null): void {
    this.deathSide = this.flinchSide;
    this.deathVel.copy(this.vel).setY(0);
    if (this.airborne) this.deathVel.add(_v.set(this.airVel.x, 0, this.airVel.z));
    if (this.spawn.frame === 'rig') {
      // Convert rig-relative motion to world motion (we were carried by the vehicle).
      const rig = this.world.rig;
      this.deathVel.applyQuaternion(rig.space.quaternion);
      const h = rig.space.rotation.y;
      this.deathVel.x += -Math.sin(h) * rig.speed;
      this.deathVel.z += -Math.cos(h) * rig.speed;
    }
    if (this.deathVel.lengthSq() > 256) this.deathVel.setLength(16);
    this.deathVy = this.airborne ? this.airVel.y : clamp(this.liftVel, -8, 8);
    this.deathTumble = this.lift > 0.25 ? (this.world.rng.chance(0.5) ? 1 : -1) * this.world.rng.range(5, 9) : 0;
    this.airborne = false;
    this.deathLanded = this.lift <= 0.01;
  }

  /** Called once when the falling corpse hits the ground. */
  protected onDeathLand(): void {
    this.world.fx.dust(this.worldPos(_v), this.landDust);
    if (this.landShake > 0) this.world.rig.shake(this.landShake * clamp(1.5 - this.distToPlayer / 20, 0.2, 1));
  }

  /** Called once when the body slams onto its side. */
  protected onToppleImpact(): void {
    this.world.fx.dust(this.worldPos(_v), this.landDust * 0.8);
  }

  protected override updateDeath(dt: number): boolean {
    const t = this.stateTime;
    const pos = this.root.position;
    pos.x += this.deathVel.x * dt;
    pos.z += this.deathVel.z * dt;
    // Never slide a corpse into the camera.
    this.playerPos(_p);
    _v.set(pos.x - _p.x, 0, pos.z - _p.z);
    const d = _v.length();
    if (d < 2.6 && d > 0.001) {
      _v.divideScalar(d);
      const toward = -(this.deathVel.x * _v.x + this.deathVel.z * _v.z);
      if (toward > 0) this.deathVel.addScaledVector(_v, toward);
      pos.addScaledVector(_v, (2.6 - d) * Math.min(1, dt * 4));
    }
    if (!this.deathLanded) {
      this.deathVy -= GRAVITY * dt;
      this.lift += this.deathVy * dt;
      this.model.rotation.x += this.deathTumble * dt;
      if (this.lift <= 0) {
        this.lift = 0;
        this.deathVy = 0;
        this.deathLanded = true;
        this.onDeathLand();
      }
    } else {
      this.deathVel.multiplyScalar(Math.exp(-this.deathFriction * dt));
      this.model.rotation.x = damp(this.model.rotation.x, 0, 7, dt);
    }
    pos.y = this.groundY(pos.x, pos.z);
    const k = clamp((t - this.toppleDelay) / this.toppleDur, 0, 1);
    // Ease-in fall with a small bounce at the end.
    const e = k < 1 ? k * k : 1;
    const bounce = k >= 1 ? Math.sin(Math.min(1, (t - this.toppleDelay - this.toppleDur) / 0.3) * Math.PI) * 0.06 : 0;
    this.topple = e;
    if (k >= 0.95 && !this.toppleHit) {
      this.toppleHit = true;
      this.onToppleImpact();
    }
    this.model.rotation.z = -this.deathSide * (e * 1.42 - bounce);
    const sinkStart = this.deathTime - 0.9;
    this.deathY = e * this.lieHeight - Math.max(0, t - sinkStart) * (this.sinkDepth / 0.9);
    return t > this.deathTime;
  }
}
