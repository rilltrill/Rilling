import * as THREE from 'three';
import { PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { PAT, makeRamp, material, type PatternId } from '../../gameplay/pixel/materials';

/**
 * ─── PixelCast prop kit (cast*.ts painters) ────────────────────────────────
 *
 * Helpers for painting PROPS — pickups, thrown things, debris — with the same
 * primitives the character painters use, the way a sprite artist draws hard
 * objects: boxes as their visible faces (flat triangles, each face a step of
 * the material's ramp by how it faces the sprite light, one outline round the
 * lot), cylinders as an exact silhouette (side quad + the two end ellipses)
 * with banded highlight / shadow, hoops as the visible half of a ring, glints
 * and sparkle stars in screen space. Everything is placed from the prop's own
 * live 3D mesh frame, so a tumbling barrel tumbles and the sprite covers the
 * hitbox in every pose. Allocation-free: scratch vectors come from the figure.
 */

/** The sprite artist's light (PixelCast `DEFAULT_CAST.light`), normalised. */
const LL = Math.hypot(-0.55, 0.62, 0.56);
const LX = -0.55 / LL;
const LY = 0.62 / LL;
const LZ = 0.56 / LL;
/** Paint-pass tone of a face-on flat primitive (ambient 0.2 + diffuse 0.76 · Lz). */
const FLAT = 0.2 + 0.76 * LZ;

/** Camera basis of the current redraw (world → view directions): right, up, back. */
const CV = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, bx: 0, by: 0, bz: 1 };

/** Take the camera basis for this redraw (call once at the top of a prop painter). */
export function castView(cam: THREE.Camera) {
  const e = cam.matrixWorld.elements;
  const r = Math.hypot(e[0], e[1], e[2]) || 1;
  const u = Math.hypot(e[4], e[5], e[6]) || 1;
  const b = Math.hypot(e[8], e[9], e[10]) || 1;
  CV.rx = e[0] / r;
  CV.ry = e[1] / r;
  CV.rz = e[2] / r;
  CV.ux = e[4] / u;
  CV.uy = e[5] / u;
  CV.uz = e[6] / u;
  CV.bx = e[8] / b;
  CV.by = e[9] / b;
  CV.bz = e[10] / b;
}

/** Camera right / up (world, unit) into `out` (scratch vectors are the caller's). */
export function camRight(out: THREE.Vector3): THREE.Vector3 {
  return out.set(CV.rx, CV.ry, CV.rz);
}
export function camUp(out: THREE.Vector3): THREE.Vector3 {
  return out.set(CV.ux, CV.uy, CV.uz);
}

/**
 * Tone bias that makes a FLAT primitive with world normal `n` read like a lit
 * plane: brighter turned toward the upper-left light, a shadow step turned
 * away (relative to a face-on flat primitive). `gain` exaggerates it.
 */
export function faceTone(n: THREE.Vector3, gain = 1): number {
  const vx = n.x * CV.rx + n.y * CV.ry + n.z * CV.rz;
  const vy = n.x * CV.ux + n.y * CV.uy + n.z * CV.uz;
  const vz = n.x * CV.bx + n.y * CV.by + n.z * CV.bz;
  const d = vx * LX + vy * LY + vz * LZ;
  // A little wrap so a face turned away is a dark step, not black.
  const t = 0.22 + 0.74 * Math.max((d + 0.18) / 1.18, 0);
  return (t - FLAT) * gain;
}

/** Screen-space direction (x right, y up) of world direction `d`, as a 2D dot with the light: > 0 = toward the light. */
export function litSide(d: THREE.Vector3): number {
  const vx = d.x * CV.rx + d.y * CV.ry + d.z * CV.rz;
  const vy = d.x * CV.ux + d.y * CV.uy + d.z * CV.uz;
  return vx * LX + vy * LY;
}

/** Scale of a joint (its matrix's X column length). */
export function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

/** Cheap deterministic hash 0..1 (never the world RNG). */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Materials ───────────────────────────────────────────────────────────────

export interface CastMatOpts {
  light?: number;
  dark?: number;
  sat?: number;
  scale?: number;
  strength?: number;
  dither?: number;
  spec?: number;
  secondary?: number;
  shadowHue?: number;
}

/**
 * A prop material (cached by its arguments; keys start with 'cast-' so they
 * never collide with the character library): `hex` lands on the base step of a
 * hand-built ramp, `pattern` = one of the paint pass's surface patterns.
 */
export function castMat(hex: number, pattern: PatternId = PAT.NONE, o: CastMatOpts = {}): number {
  return material(`cast-${hex}|${pattern}|${o.light ?? ''}|${o.dark ?? ''}|${o.sat ?? ''}|${o.scale ?? ''}|${o.strength ?? ''}|${o.dither ?? ''}|${o.spec ?? ''}|${o.secondary ?? ''}|${o.shadowHue ?? ''}`, () => ({
    ramp: makeRamp(hex, { light: o.light ?? 0.55, dark: o.dark ?? 0.36, sat: o.sat ?? 1.08, shadowHue: o.shadowHue }),
    pattern,
    scale: o.scale ?? 0.1,
    strength: o.strength ?? 0.5,
    secondary: o.secondary ?? 0,
    glow: false,
    dither: o.dither ?? 0.1,
    spec: o.spec ?? 0,
  }));
}

/** Wood: plank grain (fine strands), matte. */
export function woodMat(hex: number): number {
  return castMat(hex, PAT.HAIR, { light: 0.5, dark: 0.4, strength: 0.55, dither: 0.08 });
}

/** Enamel / paint / polished stone: a clean ramp, no pattern, hard steps. */
export function enamelMat(hex: number, light = 0.7, dark = 0.4): number {
  return castMat(hex, PAT.NONE, { light, dark, sat: 1.15, dither: 0, strength: 0 });
}

// ─── Boxes ───────────────────────────────────────────────────────────────────

/** Corner signs of each face (+X, −X, +Y, −Y, +Z, −Z), counter-clockwise seen from outside. */
const FACES: readonly (readonly number[])[] = [
  [1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1],
  [-1, -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1],
  [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1],
  [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1],
  [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
  [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1],
];
/** Face normal axis (0 x, 1 y, 2 z) and sign. */
const FACE_AXIS = [0, 0, 1, 1, 2, 2];
const FACE_SIGN = [1, -1, 1, -1, 1, -1];

/** Result of `box`: which faces were drawn (bit i = face i) and their tones. */
export const BOX = { mask: 0, tone: [0, 0, 0, 0, 0, 0] };

const _n = new THREE.Vector3();
const _c = new THREE.Vector3();

/**
 * A box (centre cx, cy, cz, half sizes hx, hy, hz in `obj`'s frame) drawn as
 * its visible faces: two flat triangles per face, each face toned by how it
 * faces the light (`gain`), corners rounded by `round` metres. `mat` for all
 * faces, or per axis (`matY` the top, `matBottom` the underside, `matZ`). Faces melt into the
 * current layer (one silhouette, one outline). Sets `BOX`.
 */
export function box(f: PixelFigure, obj: THREE.Object3D, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, mat: number, round = 0, gain = 1, matY = mat, matZ = mat, matBottom = matY): number {
  let mask = 0;
  for (let i = 0; i < 6; i++) {
    const ax = FACE_AXIS[i];
    const sg = FACE_SIGN[i];
    const n = f.dir(obj, ax === 0 ? sg : 0, ax === 1 ? sg : 0, ax === 2 ? sg : 0);
    _c.set(cx + (ax === 0 ? sg * hx : 0), cy + (ax === 1 ? sg * hy : 0), cz + (ax === 2 ? sg * hz : 0)).applyMatrix4(obj.matrixWorld);
    if (f.facing(_c, n) < 0.02) continue;
    mask |= 1 << i;
    const t = faceTone(n, gain);
    BOX.tone[i] = t;
    const q = FACES[i];
    const a = f.at(obj, cx + q[0] * hx, cy + q[1] * hy, cz + q[2] * hz);
    const b = f.at(obj, cx + q[3] * hx, cy + q[4] * hy, cz + q[5] * hz);
    const c = f.at(obj, cx + q[6] * hx, cy + q[7] * hy, cz + q[8] * hz);
    const d = f.at(obj, cx + q[9] * hx, cy + q[10] * hy, cz + q[11] * hz);
    const m = ax === 0 ? mat : ax === 1 ? (sg > 0 ? matY : matBottom) : matZ;
    f.tri(a, b, c, m, round).tone(t);
    f.tri(a, c, d, m, round).tone(t);
  }
  BOX.mask = mask;
  return mask;
}

/** World normal of box face `i` of `obj` (scratch vector). */
export function faceNormal(f: PixelFigure, obj: THREE.Object3D, i: number): THREE.Vector3 {
  const ax = FACE_AXIS[i];
  const sg = FACE_SIGN[i];
  return f.dir(obj, ax === 0 ? sg : 0, ax === 1 ? sg : 0, ax === 2 ? sg : 0);
}

/**
 * A drawn line on a surface (seam, crease, scratch, stripe): a SHADE_ONLY decal
 * between two points of `obj`'s frame — it darkens / lightens whatever it lies on.
 */
export function line(f: PixelFigure, obj: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, tone: number, mat: number) {
  f.decal(f.at(obj, x0, y0, z0), f.at(obj, x1, y1, z1), r, r, mat).flag(PF.FLAT | PF.SHADE_ONLY | PF.NO_OUTLINE).tone(tone).min(0.5);
}

/** A painted band / panel (its own material) between two points of `obj`'s frame. */
export function paint(f: PixelFigure, obj: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, mat: number, tone = 0) {
  f.decal(f.at(obj, x0, y0, z0), f.at(obj, x1, y1, z1), r, r, mat).flag(PF.FLAT).tone(tone).min(0.5);
}

// ─── Cylinders, hoops ────────────────────────────────────────────────────────

const _ax = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Vector3();
const _m = new THREE.Vector3();
/** Cylinder axis frame: axis = local Y of this proxy (so `ellipsoid` draws the end discs). */
const capProxy = { matrixWorld: new THREE.Matrix4() } as unknown as THREE.Object3D;
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Result of `cylinder`: which end faces the camera (+1 = B end, −1 = A end, 0 = side-on) and the lit side's screen sign. */
export const CYL = { cap: 0, lit: 1 };

/**
 * A cylinder from world point a to b of radius r as its exact silhouette: the
 * side quad (two flat triangles across the axis, seen from the eye) melted
 * with the two end discs (flat projected ellipses). The visible end is toned
 * by how it faces the light; a highlight band runs down the lit side and a
 * shadow band down the other (`bands` 0 = none). Returns the visible end.
 */
export function cylinder(f: PixelFigure, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: number, capMat = mat, bands = 1, round = 0): number {
  _ax.subVectors(b, a);
  const len = _ax.length();
  if (len < 1e-5) return 0;
  _ax.divideScalar(len);
  // Side direction: ⟂ the axis and the line of sight (the silhouette's edge).
  _m.addVectors(a, b).multiplyScalar(0.5);
  _e.subVectors(f.eye, _m);
  _s.crossVectors(_ax, _e);
  if (_s.lengthSq() < 1e-10) _s.set(CV.rx, CV.ry, CV.rz);
  _s.normalize();
  const lit = litSide(_s) >= 0 ? 1 : -1;
  CYL.lit = lit;
  const p0 = f.add(a, _s, r);
  const p1 = f.add(a, _s, -r);
  const p2 = f.add(b, _s, -r);
  const p3 = f.add(b, _s, r);
  f.tri(p0, p1, p2, mat, round);
  f.tri(p0, p2, p3, mat, round);
  // End discs (ellipses): a frame whose Y is the axis.
  _q.setFromUnitVectors(_up, _ax);
  const fa = f.facing(a, _n.copy(_ax).negate());
  const fb = f.facing(b, _ax);
  let cap = 0;
  for (let k = 0; k < 2; k++) {
    const p = k === 0 ? a : b;
    const fc = k === 0 ? fa : fb;
    capProxy.matrixWorld.compose(p, _q, _c.set(1, 1, 1));
    f.ellipsoid(capProxy, 0, 0, 0, r, Math.min(r, len) * 0.02, r, fc > 0 ? capMat : mat).flag(PF.FLAT);
    if (fc > 0.02) {
      f.tone(faceTone(k === 0 ? _n.copy(_ax).negate() : _ax, 1.1) + 0.05);
      cap = k === 0 ? -1 : 1;
    }
  }
  CYL.cap = cap;
  if (bands > 0) {
    // Sprite-artist cylinder shading: a bright band a third in on the lit side, a shadow band along the other edge.
    const hl = f.add(a, _s, lit * r * 0.42);
    const hl2 = f.add(b, _s, lit * r * 0.42);
    f.decal(hl, hl2, r * 0.2, r * 0.2, mat).flag(PF.FLAT | PF.SHADE_ONLY | PF.NO_OUTLINE).tone(0.16 * bands).min(0.5);
    const sh = f.add(a, _s, -lit * r * 0.82);
    const sh2 = f.add(b, _s, -lit * r * 0.82);
    f.decal(sh, sh2, r * 0.3, r * 0.3, mat).flag(PF.FLAT | PF.SHADE_ONLY | PF.NO_OUTLINE).tone(-0.2 * bands).min(0.5);
  }
  return cap;
}

/**
 * The visible half of a ring round `obj`'s local axis `axis` (0 x, 1 y, 2 z) at
 * `c` along it, radius `r`: `n` short cones (radius `w`), only those turned
 * toward the camera (or all with `all`). Rims, hazard bands, bark rings, halos.
 * `decal` paints the layer only where covered (bands on a body).
 */
export function hoop(f: PixelFigure, obj: THREE.Object3D, axis: number, c: number, r: number, w: number, mat: number, decal: boolean, n = 12, all = false, tone = 0, flags = 0) {
  let px = 0;
  let py = 0;
  let pz = 0;
  let prevOk = false;
  for (let i = 0; i <= n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const ca = Math.cos(ang) * r;
    const sa = Math.sin(ang) * r;
    // Local point on the ring (u, v ⟂ axis).
    const x = axis === 0 ? c : ca;
    const y = axis === 0 ? ca : axis === 1 ? c : sa;
    const z = axis === 2 ? c : sa;
    _c.set(x, y, z).applyMatrix4(obj.matrixWorld);
    const rad = f.dir(obj, axis === 0 ? 0 : ca, axis === 0 ? ca : axis === 1 ? 0 : sa, axis === 2 ? 0 : sa);
    const ok = all || f.facing(_c, rad) > -0.08;
    if (i > 0 && ok && prevOk) {
      const a = f.at(obj, px, py, pz);
      const b = f.at(obj, x, y, z);
      if (decal) f.decal(a, b, w, w, mat).flag(PF.FLAT | flags).tone(tone).min(0.5);
      else f.cone(a, b, w, w, mat).flag(flags).tone(tone).min(0.5);
    }
    px = x;
    py = y;
    pz = z;
    prevOk = ok;
  }
}

// ─── Screen-space sparkle ────────────────────────────────────────────────────

const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

/**
 * A four-point sparkle star at world point p: arms `len` metres long (1-texel
 * lines), a bright centre; `diag` adds short diagonal arms. Unlit, never
 * outlined — the classic item glint. `mat` should be a glow material.
 */
export function sparkle(f: PixelFigure, p: THREE.Vector3, len: number, mat: number, diag = 0, core = 0.22) {
  camRight(_r);
  camUp(_u);
  const fl = PF.GLOW | PF.NO_OUTLINE | PF.FLAT;
  f.cone(f.add(p, _r, -len), f.add(p, _r, len), len * 0.05, len * 0.05, mat).flag(fl).min(0.5);
  f.cone(f.add(p, _u, -len), f.add(p, _u, len), len * 0.05, len * 0.05, mat).flag(fl).min(0.5);
  if (diag > 0) {
    const d = len * diag * 0.7071;
    _c.copy(_r).add(_u);
    f.cone(f.add(p, _c, -d), f.add(p, _c, d), len * 0.04, len * 0.04, mat).flag(fl).min(0.5);
    _c.copy(_r).sub(_u);
    f.cone(f.add(p, _c, -d), f.add(p, _c, d), len * 0.04, len * 0.04, mat).flag(fl).min(0.5);
  }
  if (core > 0) f.ball(p, len * core, mat).flag(fl).min(0.6);
}

/** World point `p` offset by (dx, dy) metres in screen space (scratch vector). */
export function screenOff(f: PixelFigure, p: THREE.Vector3, dx: number, dy: number): THREE.Vector3 {
  return f.vec().set(p.x + CV.rx * dx + CV.ux * dy, p.y + CV.ry * dx + CV.uy * dy, p.z + CV.rz * dx + CV.uz * dy);
}
