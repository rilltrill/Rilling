import * as THREE from 'three';
import { atlasCode, stampInfo } from './stamps';

/**
 * PixelCast figures: a character's sprite frame described as a short list of
 * 2D PRIMITIVES — tapered round cones ("uneven capsules") in sprite texels,
 * grouped in LAYERS. A painter (content/pixel/*) builds one per redraw from the
 * live 3D rig: it takes world points on the rig's joints, the figure projects
 * them through the main camera onto the retro pixel grid, and radii given in
 * metres become texels at that depth. So every shape lands exactly where the
 * rig — and its hitboxes — are on screen, in any pose and from any side.
 *
 * Inside a layer, solid primitives melt together (polynomial smooth-min with a
 * per-primitive blend radius): shoulders flow into arms, the neck into the
 * skull, a dinosaur's snout into its neck, body and tail — one continuous
 * silhouette whose shading normal is the gradient of the blended field.
 * Layers composite by depth (an arm in front of the chest gets an inner
 * contour where the depth jumps). DECAL primitives paint material onto their
 * layer only where it is already covered (eye sockets, mouths, stains, ties,
 * badges) — they never change the silhouette.
 *
 * Pure maths (no DOM / GL): node tests build and sample figures (see `sample`).
 */

/** Most primitives one figure may hold (the GPU table has this many rows). */
export const MAX_PRIMS = 160;
/** Floats per primitive (6 RGBA32F texels; the last is its texel bounding box). */
export const PRIM_FLOATS = 24;
/** Most layers per figure (4 bits in the G-buffer). */
export const MAX_LAYERS = 15;

/** Primitive flags. */
export const PF = {
  /** Paints material on its layer where covered; no coverage of its own. */
  DECAL: 1,
  /** Unlit (eyes, glints): full colour, no shading / outline. */
  GLOW: 2,
  /** Never outlined (tiny details that must keep their colour). */
  NO_OUTLINE: 4,
  /** Ragged edge only toward the B end (hems, torn sleeves). */
  RAG_END: 8,
  /** Spiky ragged edge (hair, quills, torn rags). */
  SPIKY: 16,
  /** A tooth row: little triangles on both sides of the axis (the lip hides one side). */
  TEETH: 32,
  /** Flat-shaded (no inflation normal): decals, cloth panels. */
  FLAT: 64,
  /** Tone bias applies to the decal only (doesn't recolour, darkens/lightens the layer). */
  SHADE_ONLY: 128,
  /** A hand-pixelled bitmap (`stamps.ts`), drawn screen-aligned by whole texels. */
  STAMP: 256,
} as const;

/** Hit-part code of a primitive (alignment tests / gore). */
export const PART = { NONE: 0, HEAD: 1, TORSO: 2, LIMB: 3, TAIL: 4, WEAK: 5, ARMOR: 6 } as const;
export type PartCode = (typeof PART)[keyof typeof PART];

export interface PrimOpts {
  /** Material used beyond `split` along the axis (0..1). */
  matB?: number;
  split?: number;
  /** Smooth-blend radius with what the layer holds so far (metres). Default: the layer's. */
  k?: number;
  /** Ragged-edge amplitude (metres) and features per metre along the edge. */
  rag?: number;
  ragFreq?: number;
  seed?: number;
  flags?: number;
  /** Tone bias (−1..1): darker / lighter than the lighting says. */
  tone?: number;
  /** Pattern coordinate along the axis at A (metres; stripes run continuously along chains). */
  u0?: number;
  part?: PartCode;
  /** Smallest radius in texels (default 0.55 — one-texel lines survive). */
  minPx?: number;
  /**
   * Depth bias (metres, negative = nearer) for which primitive's material shows
   * where several of one layer overlap: a hair cap with −0.03 wins over the
   * forehead it sits on, so the hairline is the cap's edge.
   */
  zBias?: number;
}

export interface LayerOpts {
  /** Default smooth-blend radius of its primitives (metres). */
  k?: number;
  /** Tone bias for the whole layer (far-side limbs are drawn a shade darker). */
  tone?: number;
  /** Extra depth (metres): push a layer behind its neighbours (mouth interiors). */
  depth?: number;
}

/** Offsets inside a primitive's PRIM_FLOATS. */
const AX = 0,
  AY = 1,
  BX = 2,
  BY = 3,
  RA = 4,
  RB = 5,
  ZA = 6,
  ZB = 7,
  MA = 8,
  MB = 9,
  SPLIT = 10,
  K = 11,
  LAYER = 12,
  FLAGS = 13,
  RAG = 14,
  SEED = 15,
  U0 = 16,
  ULEN = 17,
  TONE = 18,
  PARTI = 19,
  BB0 = 20,
  BB1 = 21,
  BB2 = 22,
  BB3 = 23;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _ca = new THREE.Vector3();
const _cb = new THREE.Vector3();

/**
 * Nearest view depth (metres) a primitive is drawn at: parts closer to the lens
 * are cut there (see `emit`), so a tail sweeping past the camera stays sane.
 */
export const NEAR_CLIP = 0.3;
/** Largest texel size (retro px): closer than that the sprite clips, it never turns into a mosaic. */
export const MAX_KPX = 3;

/** Polynomial smooth-min share of `b` (0..1) in a blend of radius k. */
function shareB(a: number, b: number, k: number): number {
  if (k <= 1e-6) return b < a ? 1 : 0;
  return Math.min(1, Math.max(0, 0.5 + (0.5 * (a - b)) / k));
}

/** Signed distance from (px, py) to a 2D round cone (iq's uneven capsule). */
export function sdRoundCone(px: number, py: number, ax: number, ay: number, bx: number, by: number, ra: number, rb: number): number {
  const x = px - ax;
  const y = py - ay;
  const dx = bx - ax;
  const dy = by - ay;
  const h = dx * dx + dy * dy;
  const b = ra - rb;
  if (h <= b * b + 1e-6) return ra >= rb ? Math.hypot(x, y) - ra : Math.hypot(px - bx, py - by) - rb;
  const qx = Math.abs(x * dy - y * dx) / h;
  const qy = (x * dx + y * dy) / h;
  const cx = Math.sqrt(h - b * b);
  const cy = b;
  const k = cx * qy - cy * qx;
  const m = cx * qx + cy * qy;
  const n = qx * qx + qy * qy;
  if (k < 0) return Math.sqrt(h * n) - ra;
  if (k > cx) return Math.sqrt(h * (n + 1 - 2 * qy)) - rb;
  return m - ra;
}

/** Result of `PixelFigure.sample` (CPU reference of the GPU paint pass's coverage). */
export interface FigureSample {
  /** Visible layer (−1 = empty). */
  layer: number;
  /** Solid primitive closest to the texel in that layer. */
  prim: number;
  part: PartCode;
  mat: number;
  depth: number;
}

/**
 * One frame of a painted character. Lifecycle per redraw (SpriteArt):
 * `begin(camera, grid)` → the painter adds layers / primitives in WORLD space →
 * `layout(maxTexels)` picks the texel scale and the sprite rectangle →
 * `packInto()` for the GPU. Reused across redraws (no per-frame allocation).
 */
export class PixelFigure {
  /** Primitives in retro-pixel space while painting, texel space after `layout`. */
  readonly data = new Float32Array(MAX_PRIMS * PRIM_FLOATS);
  count = 0;
  /** Primitives dropped because the table was full (stats). */
  overflow = 0;
  /** Primitives cut (or dropped) at the near clip plane this frame. */
  clipped = 0;
  /** Current layer index (−1 before the first `layer()`). */
  private curLayer = -1;
  private layerK: number[] = [];
  private layerTone: number[] = [];
  private layerDepth: number[] = [];
  private layerPart: number[] = [];
  /** Index of the primitive just added (−1 = dropped) and its px-per-metre scale (modifiers). */
  private last = -1;
  private lastS = 1;
  // Projection.
  private V = new Float32Array(16);
  private P = new Float32Array(16);
  private gw = 1;
  private gh = 1;
  /** Retro pixels per metre at view depth 1 m. */
  private S = 1;
  /** Camera world position (facing tests). */
  readonly eye = new THREE.Vector3();
  /** Nearest view depth any point had (painting is refused when something reaches the camera). */
  minDepth = Infinity;
  // Layout results.
  /** Retro pixels per texel. */
  kpx = 1;
  /** Texel grid origin (retro px from the left / bottom edge) and size. */
  ox = 0;
  oy = 0;
  W = 0;
  H = 0;
  /** View-depth range of the figure (metres). */
  d0 = 0;
  d1 = 1;
  /** Texels per metre at depth 1 (after layout). */
  texS = 1;
  /** Layers after `layout`: count, [first, end) primitive per layer and each layer's texel bounding box. */
  layers = 0;
  readonly layerRange = new Float32Array(MAX_LAYERS * 2);
  readonly layerBox = new Float32Array(MAX_LAYERS * 4);
  /** World-space footprint of the figure (x/z min/max) for the ground shadow. */
  readonly foot = new THREE.Box3();
  /** Painter hint: most texels the sprite may be tall/wide before texels grow. */
  maxTexels = 140;
  /** World time of this redraw (painters animate secondary motion from it). */
  time = 0;
  /** Seconds since the previous redraw of the same sprite (0 on the first). */
  dt = 0;
  /** Stage darkness 0 (day) .. 1 (night): painters may add glows. */
  night = 0;
  /** Texel size (retro px) this sprite had last redraw: painters pick stamp sizes in texels. */
  kHint = 1;

  private pool: THREE.Vector3[] = [];
  private poolN = 0;
  /** Per-primitive minimum radius in texels (applied by `layout`). */
  private minPx = new Float32Array(MAX_PRIMS);
  private minPx2 = new Float32Array(MAX_PRIMS);

  // ─── Setup ────────────────────────────────────────────────────────────────

  /** Start a frame seen by `cam` on a retro grid of gw × gh pixels. */
  begin(cam: THREE.Camera & { projectionMatrix: THREE.Matrix4 }, gw: number, gh: number) {
    this.count = 0;
    this.overflow = 0;
    this.clipped = 0;
    this.curLayer = -1;
    this.layerK.length = 0;
    this.layerTone.length = 0;
    this.layerDepth.length = 0;
    this.layerPart.length = 0;
    this.last = -1;
    this.poolN = 0;
    this.V.set(cam.matrixWorldInverse.elements);
    this.P.set(cam.projectionMatrix.elements);
    this.gw = gw;
    this.gh = gh;
    this.S = (this.P[5] * gh) / 2;
    this.eye.setFromMatrixPosition(cam.matrixWorld);
    this.minDepth = Infinity;
    this.foot.makeEmpty();
    this.maxTexels = 140;
    this.kHint = 1;
  }

  // ─── Painter API ──────────────────────────────────────────────────────────

  /** A scratch vector valid until the next `begin` (no allocation after warm-up). */
  vec(): THREE.Vector3 {
    let v = this.pool[this.poolN];
    if (!v) this.pool.push((v = new THREE.Vector3()));
    this.poolN++;
    return v;
  }

  /** World position of joint-local point (x, y, z) of `obj` (scratch vector). */
  at(obj: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Vector3 {
    return this.vec().set(x, y, z).applyMatrix4(obj.matrixWorld);
  }

  /** World direction of joint-local axis (x, y, z) of `obj`, normalised (scratch vector). */
  dir(obj: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 {
    const e = obj.matrixWorld.elements;
    const v = this.vec().set(e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z);
    const l = v.length();
    return l > 1e-9 ? v.divideScalar(l) : v.set(0, 1, 0);
  }

  /** Point `p + d * s` (scratch vector). */
  add(p: THREE.Vector3, d: THREE.Vector3, s = 1): THREE.Vector3 {
    return this.vec().copy(p).addScaledVector(d, s);
  }

  /** Linear mix of two points (scratch vector). */
  mix(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
    return this.vec().copy(a).lerp(b, t);
  }

  /**
   * How much a surface with world normal `n` faces the camera from point `p`:
   * 1 = straight at it, 0 = edge-on, < 0 = facing away.
   */
  facing(p: THREE.Vector3, n: THREE.Vector3): number {
    _v.subVectors(this.eye, p);
    const l = _v.length();
    return l > 1e-6 ? _v.dot(n) / l : 0;
  }

  /** Screen-space (retro px) position of a world point: x right, y up; also its view depth. */
  project(p: THREE.Vector3, out: { x: number; y: number; z: number }) {
    const V = this.V;
    const P = this.P;
    const vx = V[0] * p.x + V[4] * p.y + V[8] * p.z + V[12];
    const vy = V[1] * p.x + V[5] * p.y + V[9] * p.z + V[13];
    const vz = V[2] * p.x + V[6] * p.y + V[10] * p.z + V[14];
    const w = Math.max(1e-4, -vz);
    out.x = (((P[0] * vx + P[8] * vz) / w) * 0.5 + 0.5) * this.gw;
    out.y = (((P[5] * vy + P[9] * vz) / w) * 0.5 + 0.5) * this.gh;
    out.z = -vz;
    return out;
  }

  /** Retro pixels per metre at world point `p`. */
  pxPerM(p: THREE.Vector3): number {
    const V = this.V;
    const vz = V[2] * p.x + V[6] * p.y + V[10] * p.z + V[14];
    return this.S / Math.max(1e-4, -vz);
  }

  /**
   * Start a new layer: its primitives melt together (default blend radius `k`,
   * metres); layers composite by depth. `part` = the hit part its primitives draw
   * (override per primitive with `.part()`), `tone` darkens / lightens the whole
   * layer (far-side limbs), `depth` pushes it back (mouth interiors).
   */
  layer(k = 0.04, part: PartCode = PART.NONE, tone = 0, depth = 0): this {
    if (this.curLayer < MAX_LAYERS - 1) {
      this.curLayer++;
      this.layerK.push(k);
      this.layerTone.push(tone);
      this.layerDepth.push(depth);
      this.layerPart.push(part);
    }
    return this;
  }

  // ─── Modifiers: patch the primitive just added (chainable, allocation-free) ──

  /** Hit part this primitive draws (tests / gore); default: the layer's. */
  part(p: PartCode): this {
    if (this.last >= 0) this.data[this.last * PRIM_FLOATS + PARTI] = p;
    return this;
  }
  /** Smooth-blend radius (metres) with what the layer holds so far. */
  k(m: number): this {
    if (this.last >= 0) this.data[this.last * PRIM_FLOATS + K] = m * this.lastS;
    return this;
  }
  /** Ragged edge: amplitude (metres) and edge style flags (`PF.SPIKY`, `PF.RAG_END`). */
  rag(m: number, flags = 0): this {
    if (this.last >= 0) {
      const o = this.last * PRIM_FLOATS;
      this.data[o + RAG] = m * this.lastS;
      this.data[o + FLAGS] = (this.data[o + FLAGS] | flags) >>> 0;
    }
    return this;
  }
  /** Add flags (`PF.*`). */
  flag(f: number): this {
    if (this.last >= 0) {
      const o = this.last * PRIM_FLOATS + FLAGS;
      this.data[o] = (this.data[o] | f) >>> 0;
    }
    return this;
  }
  /** Tone bias (−1..1): darker / lighter than the lighting says. */
  tone(t: number): this {
    if (this.last >= 0) this.data[this.last * PRIM_FLOATS + TONE] += t;
    return this;
  }
  /**
   * Depth bias (metres, negative = nearer) for which primitive's material shows
   * where several of one layer overlap: a hair cap with −0.03 wins over the
   * forehead it sits on, so the hairline is the cap's edge.
   */
  z(m: number): this {
    if (this.last >= 0) {
      const o = this.last * PRIM_FLOATS;
      this.data[o + ZA] += m;
      this.data[o + ZB] += m;
    }
    return this;
  }
  /** A second material beyond `split` (0..1) along the axis (sleeve → bare forearm). */
  mat2(mat: number, split: number): this {
    if (this.last >= 0) {
      const o = this.last * PRIM_FLOATS;
      this.data[o + MB] = mat;
      this.data[o + SPLIT] = split;
    }
    return this;
  }
  /** Pattern coordinate along the axis at A (metres; stripes run on along chains). */
  u(u0: number): this {
    if (this.last >= 0) this.data[this.last * PRIM_FLOATS + U0] = u0;
    return this;
  }
  /** Noise seed (ragged edges, patterns). */
  seed(n: number): this {
    if (this.last >= 0) this.data[this.last * PRIM_FLOATS + SEED] = n;
    return this;
  }
  /** Smallest radius in texels (default 0.55 — one-texel lines survive). */
  min(px: number): this {
    if (this.last >= 0) this.minPx[this.last] = px;
    return this;
  }

  /** Solid tapered round cone from world point a (radius ra, metres) to b (rb). */
  cone(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, mat: number, o?: PrimOpts): this {
    this.emit(a, b, ra, rb, mat, 0, o);
    return this;
  }

  /** A ball (solid circle) of radius r at world point c. */
  ball(c: THREE.Vector3, r: number, mat: number, o?: PrimOpts): this {
    this.emit(c, c, r, r, mat, 0, o);
    return this;
  }

  /** Painted onto the current layer where it is covered (no coverage of its own). */
  decal(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, mat: number, o?: PrimOpts): this {
    this.emit(a, b, ra, rb, mat, PF.DECAL, o);
    return this;
  }

  /**
   * A hand-pixelled STAMP (`stamps.ts`): its anchor cell lands on world point
   * `p`; one cell is `cellM` metres there, rounded to WHOLE texels (≥ 1) by
   * `layout` — pixel art is never resampled. Materials fill the stamp's slots
   * 0–3. Decal stamps (default) paint onto the current layer where it is covered
   * (eyes, mouths); `solid` ones add coverage of their own (hands, claws) and get
   * the layer's outline. `mirror` flips it left–right.
   */
  stamp(p: THREE.Vector3, cellM: number, id: number, m0: number, m1 = 0, m2 = 0, m3 = 0, mirror = false, solid = false): this {
    if (this.curLayer < 0) this.layer();
    if (this.count >= MAX_PRIMS || id < 0) {
      if (id >= 0) this.overflow++;
      this.last = -1;
      return this;
    }
    const z = this.depth(p);
    if (z < NEAR_CLIP) {
      this.last = -1;
      return this;
    }
    const i = this.count++;
    const d = this.data;
    const off = i * PRIM_FLOATS;
    const pa = this.project(p, PA);
    const sa = this.S / pa.z;
    d[off + AX] = pa.x;
    d[off + AY] = pa.y;
    // (B = A until layout: bounds, warps and squashes treat the stamp as a point.)
    d[off + BX] = pa.x;
    d[off + BY] = pa.y;
    d[off + RA] = cellM * sa;
    d[off + RB] = 0;
    const zz = pa.z + this.layerDepth[this.curLayer];
    d[off + ZA] = zz;
    d[off + ZB] = zz;
    d[off + MA] = m0;
    d[off + MB] = m1;
    d[off + SPLIT] = m2;
    d[off + K] = 0;
    d[off + LAYER] = this.curLayer;
    d[off + FLAGS] = PF.STAMP | (solid ? 0 : PF.DECAL);
    d[off + RAG] = mirror ? 1 : 0;
    d[off + SEED] = id;
    d[off + U0] = m3;
    d[off + ULEN] = 0;
    d[off + TONE] = this.layerTone[this.curLayer];
    d[off + PARTI] = this.layerPart[this.curLayer];
    this.minPx[i] = 0;
    this.last = i;
    this.lastS = sa;
    if (solid) {
      this.minDepth = Math.min(this.minDepth, pa.z);
      this.foot.expandByPoint(p);
    }
    return this;
  }

  /** Texels one stamp cell of `cellM` metres at world point `p` would be (k = 1): pick stamp sizes. */
  px(p: THREE.Vector3, m: number): number {
    return m * this.pxPerM(p);
  }

  /**
   * Round cone whose cross-section is an ELLIPSE: at each end the radius drawn is
   * the projected half-width of the ellipse with semi-axes `rx`·ux and `ry`·uy
   * (world directions ⟂ the axis), across the axis as seen on screen. Torsos,
   * dinosaur bodies and tails read wide from the front and slim from the side.
   */
  coneE(a: THREE.Vector3, b: THREE.Vector3, ux: THREE.Vector3, uy: THREE.Vector3, rxA: number, ryA: number, rxB: number, ryB: number, mat: number, o?: PrimOpts): this {
    // Screen-space axis direction.
    const pa = this.project(a, PA);
    const pb = this.project(b, PB);
    let nx = -(pb.y - pa.y);
    let ny = pb.x - pa.x;
    const l = Math.hypot(nx, ny);
    const V = this.V;
    // View-space xy of the cross-section axes (directions: rotation only).
    const uxx = V[0] * ux.x + V[4] * ux.y + V[8] * ux.z;
    const uxy = V[1] * ux.x + V[5] * ux.y + V[9] * ux.z;
    const uyx = V[0] * uy.x + V[4] * uy.y + V[8] * uy.z;
    const uyy = V[1] * uy.x + V[5] * uy.y + V[9] * uy.z;
    let ra: number;
    let rb: number;
    if (l > 0.5) {
      nx /= l;
      ny /= l;
      const sx = uxx * nx + uxy * ny;
      const sy = uyx * nx + uyy * ny;
      ra = Math.hypot(rxA * sx, ryA * sy);
      rb = Math.hypot(rxB * sx, ryB * sy);
    } else {
      // Seen end-on: the larger projected semi-axis.
      ra = Math.max(rxA * Math.hypot(uxx, uxy), ryA * Math.hypot(uyx, uyy));
      rb = Math.max(rxB * Math.hypot(uxx, uxy), ryB * Math.hypot(uyx, uyy));
    }
    this.emit(a, b, ra, rb, mat, 0, o);
    return this;
  }

  /**
   * Solid ELLIPSOID at joint-local centre (cx, cy, cz) of `obj` with semi-axes
   * rx, ry, rz along the joint's own X / Y / Z (metres, joint scale applied).
   * Drawn as its exact projected ellipse (as a stadium: a round cone along the
   * major axis with the minor radius) — skulls, hips, bellies, dino thighs.
   */
  ellipsoid(obj: THREE.Object3D, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, mat: number, o?: PrimOpts): this {
    const e = obj.matrixWorld.elements;
    const c = this.at(obj, cx, cy, cz);
    const V = this.V;
    // View-space xy of each world semi-axis (joint axes carry the joint's scale).
    let m00 = 0;
    let m01 = 0;
    let m11 = 0;
    for (let i = 0; i < 3; i++) {
      const r = i === 0 ? rx : i === 1 ? ry : rz;
      const wx = e[i * 4] * r;
      const wy = e[i * 4 + 1] * r;
      const wz = e[i * 4 + 2] * r;
      const vx = V[0] * wx + V[4] * wy + V[8] * wz;
      const vy = V[1] * wx + V[5] * wy + V[9] * wz;
      m00 += vx * vx;
      m01 += vx * vy;
      m11 += vy * vy;
    }
    const tr = (m00 + m11) / 2;
    const dd = Math.sqrt(Math.max(0, ((m00 - m11) / 2) ** 2 + m01 * m01));
    const A = Math.sqrt(tr + dd);
    const B = Math.sqrt(Math.max(1e-10, tr - dd));
    const th = 0.5 * Math.atan2(2 * m01, m00 - m11);
    // Major axis direction in view space → back to world (camera right / up).
    const half = A - B;
    const ux = Math.cos(th) * half;
    const uy = Math.sin(th) * half;
    // Camera right = row 0 of V's rotation, camera up = row 1.
    const a = this.vec().set(c.x + V[0] * ux + V[1] * uy, c.y + V[4] * ux + V[5] * uy, c.z + V[8] * ux + V[9] * uy);
    const b = this.vec().set(c.x - V[0] * ux - V[1] * uy, c.y - V[4] * ux - V[5] * uy, c.z - V[8] * ux - V[9] * uy);
    this.emit(a, b, B, B, mat, 0, o);
    return this;
  }

  /** View depth (metres in front of the camera) of a world point. */
  depth(p: THREE.Vector3): number {
    const V = this.V;
    return -(V[2] * p.x + V[6] * p.y + V[10] * p.z + V[14]);
  }

  /**
   * Squash & stretch: scale everything painted so far by (sx, sy) about the
   * screen position of world point `pivot` (hit reactions, landings).
   */
  warp(pivot: THREE.Vector3, sx: number, sy: number) {
    const c = this.project(pivot, PA);
    const d = this.data;
    const rs = Math.sqrt(sx * sy);
    for (let i = 0; i < this.count; i++) {
      const o = i * PRIM_FLOATS;
      d[o + AX] = c.x + (d[o + AX] - c.x) * sx;
      d[o + BX] = c.x + (d[o + BX] - c.x) * sx;
      d[o + AY] = c.y + (d[o + AY] - c.y) * sy;
      d[o + BY] = c.y + (d[o + BY] - c.y) * sy;
      d[o + RA] *= rs;
      d[o + RB] *= rs;
    }
  }

  private emit(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, mat: number, flags: number, o?: PrimOpts): number {
    if (this.curLayer < 0) this.layer();
    if (this.count >= MAX_PRIMS) {
      this.overflow++;
      this.last = -1;
      return -1;
    }
    // Near-plane clip: a part reaching beside / behind the camera (a tail sweeping
    // past the lens, a pounce) must not project to enormous coordinates — that would
    // blow the whole sprite up into giant texels. Cut it at NEAR_CLIP (radius
    // interpolated); drop it when it is wholly behind.
    const za = this.depth(a);
    const zc = this.depth(b);
    if (za < NEAR_CLIP || zc < NEAR_CLIP) {
      if (za < NEAR_CLIP && zc < NEAR_CLIP) {
        this.clipped++;
        this.last = -1;
        return -1;
      }
      const t = (NEAR_CLIP - za) / (zc - za);
      if (za < NEAR_CLIP) {
        a = _ca.copy(a).lerp(b, t);
        ra = ra + (rb - ra) * t;
      } else {
        b = _cb.copy(a).lerp(b, t);
        rb = ra + (rb - ra) * t;
      }
      this.clipped++;
    }
    const i = this.count++;
    const d = this.data;
    const off = i * PRIM_FLOATS;
    const pa = this.project(a, PA);
    const pb = this.project(b, PB);
    const sa = this.S / pa.z;
    const sb = this.S / pb.z;
    const ld = this.layerDepth[this.curLayer];
    d[off + AX] = pa.x;
    d[off + AY] = pa.y;
    d[off + BX] = pb.x;
    d[off + BY] = pb.y;
    d[off + RA] = ra * sa;
    d[off + RB] = rb * sb;
    const zb = ld + (o?.zBias ?? 0);
    d[off + ZA] = pa.z + zb;
    d[off + ZB] = pb.z + zb;
    d[off + MA] = mat;
    d[off + MB] = o?.matB ?? mat;
    d[off + SPLIT] = o?.split ?? 2;
    d[off + K] = (o?.k ?? this.layerK[this.curLayer]) * 0.5 * (sa + sb);
    d[off + LAYER] = this.curLayer;
    d[off + FLAGS] = flags | (o?.flags ?? 0);
    d[off + RAG] = (o?.rag ?? 0) * 0.5 * (sa + sb);
    d[off + SEED] = o?.seed ?? (i * 7.31) % 97;
    d[off + U0] = o?.u0 ?? 0;
    d[off + ULEN] = _w.subVectors(b, a).length();
    d[off + TONE] = (o?.tone ?? 0) + this.layerTone[this.curLayer];
    d[off + PARTI] = o?.part ?? this.layerPart[this.curLayer];
    // Min radius (texels are ≥ 1 retro px; layout re-applies it in texels).
    this.minPx[i] = o?.minPx ?? 0.55;
    this.last = i;
    this.lastS = 0.5 * (sa + sb);
    if (!(flags & PF.DECAL)) {
      this.minDepth = Math.min(this.minDepth, pa.z, pb.z);
      this.foot.expandByPoint(a);
      this.foot.expandByPoint(b);
    }
    return i;
  }

  /** Read back a primitive's field (tests / debugging). */
  get(i: number, field: 'ax' | 'ay' | 'bx' | 'by' | 'ra' | 'rb' | 'layer' | 'part' | 'mat' | 'flags'): number {
    const o = i * PRIM_FLOATS;
    const f = { ax: AX, ay: AY, bx: BX, by: BY, ra: RA, rb: RB, layer: LAYER, part: PARTI, mat: MA, flags: FLAGS }[field];
    return this.data[o + f];
  }

  // ─── Layout ───────────────────────────────────────────────────────────────

  /**
   * Choose the texel scale (`kpx` retro px per texel: 1, or more once the figure
   * is taller than `maxTexels`; `prevK` gives hysteresis), the texel grid
   * (aligned to the retro pixels) and convert every primitive to texel space.
   * Primitives are re-ordered per layer: solids first, then decals (a decal
   * always sees its layer's whole silhouette). Returns false when nothing is
   * on screen. `clip` = retro-px margin kept beyond the screen edges.
   */
  layout(prevK = 1, clip = 24, maxSize = 256): boolean {
    const n = this.count;
    if (n === 0) return false;
    const d = this.data;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = i * PRIM_FLOATS;
      if (d[o + FLAGS] & PF.DECAL) continue;
      const r = d[o + FLAGS] & PF.STAMP ? d[o + RA] * 8 : Math.max(d[o + RA], d[o + RB]) + d[o + RAG] + 1;
      x0 = Math.min(x0, d[o + AX] - r, d[o + BX] - r);
      x1 = Math.max(x1, d[o + AX] + r, d[o + BX] + r);
      y0 = Math.min(y0, d[o + AY] - r, d[o + BY] - r);
      y1 = Math.max(y1, d[o + AY] + r, d[o + BY] + r);
      const rmA = d[o + RA] * (d[o + ZA] / this.S);
      const rmB = d[o + RB] * (d[o + ZB] / this.S);
      z0 = Math.min(z0, d[o + ZA] - rmA, d[o + ZB] - rmB);
      z1 = Math.max(z1, d[o + ZA] + rmA, d[o + ZB] + rmB);
    }
    if (!(x1 > x0)) return false;
    // Clip to the screen (plus a margin: the sprite may move a little between redraws).
    const cx0 = Math.max(x0, -clip);
    const cy0 = Math.max(y0, -clip);
    const cx1 = Math.min(x1, this.gw + clip);
    const cy1 = Math.min(y1, this.gh + clip);
    if (!(cx1 > cx0 && cy1 > cy0)) return false;
    // Texel scale from the WHOLE figure's size (a character half off screen keeps its
    // texels) — unless it reaches far past the screen (a body sweeping by the lens):
    // then from what is on screen, so it never turns into a mosaic of giant blocks.
    let size = Math.max(y1 - y0, (x1 - x0) * 0.75);
    if (size > 1.5 * this.gh) size = Math.max(cy1 - cy0, (cx1 - cx0) * 0.75);
    let k = Math.max(1, Math.ceil(size / this.maxTexels - 0.08));
    // Hysteresis: a character hovering at the boundary doesn't pop between sizes.
    if (prevK === k - 1 && size < this.maxTexels * prevK * 1.18) k = prevK;
    else if (prevK === k + 1 && size > this.maxTexels * k * 0.85) k = prevK;
    k = Math.min(k, MAX_KPX);
    k = Math.max(k, Math.ceil((Math.max(cx1 - cx0, cy1 - cy0) + 4) / maxSize));
    this.kpx = k;
    const gx0 = Math.floor(cx0 / k) - 1;
    const gy0 = Math.floor(cy0 / k) - 1;
    this.W = Math.min(Math.ceil(cx1 / k) + 1 - gx0, maxSize);
    this.H = Math.min(Math.ceil(cy1 / k) + 1 - gy0, maxSize);
    this.ox = gx0 * k;
    this.oy = gy0 * k;
    this.d0 = Math.max(0.05, z0 - 0.05);
    this.d1 = Math.max(this.d0 + 0.1, z1 + 0.05);
    this.texS = this.S / k;
    // To texel space, sorted per layer (solids, then decals) — stable.
    const tmp = SORT;
    let w = 0;
    const layers = this.curLayer + 1;
    for (let L = 0; L < layers; L++) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
          const o = i * PRIM_FLOATS;
          if (d[o + LAYER] !== L || (d[o + FLAGS] & PF.DECAL ? 1 : 0) !== pass) continue;
          const t = w * PRIM_FLOATS;
          for (let j = 0; j < PRIM_FLOATS; j++) tmp[t + j] = d[o + j];
          const mp = this.minPx[i];
          this.minPx2[w] = mp;
          if (d[o + FLAGS] & PF.STAMP) {
            // Stamp: whole-texel cells, its anchor cell's centre on the anchor's texel.
            const st = stampInfo(d[o + SEED]);
            const cell = Math.max(1, Math.round(d[o + RA] / k));
            const mir = d[o + RAG] > 0.5;
            const ax = mir ? st.w - 1 - st.ax : st.ax;
            const sx = Math.floor((d[o + AX] - this.ox) / k) - ax * cell - ((cell - 1) >> 1);
            const sy = Math.floor((d[o + AY] - this.oy) / k) - st.ay * cell - ((cell - 1) >> 1);
            tmp[t + AX] = sx;
            tmp[t + AY] = sy;
            tmp[t + BX] = st.x0;
            tmp[t + BY] = st.y0;
            tmp[t + RA] = cell;
            tmp[t + RB] = st.w;
            tmp[t + SEED] = st.h;
            tmp[t + BB0] = sx;
            tmp[t + BB1] = sy;
            tmp[t + BB2] = sx + st.w * cell;
            tmp[t + BB3] = sy + st.h * cell;
            w++;
            continue;
          }
          const ax = (d[o + AX] - this.ox) / k;
          const ay = (d[o + AY] - this.oy) / k;
          const bx = (d[o + BX] - this.ox) / k;
          const by = (d[o + BY] - this.oy) / k;
          const ra = Math.max(d[o + RA] / k, mp);
          const rb = Math.max(d[o + RB] / k, mp);
          const kk = d[o + K] / k;
          const rag = d[o + RAG] / k;
          tmp[t + AX] = ax;
          tmp[t + AY] = ay;
          tmp[t + BX] = bx;
          tmp[t + BY] = by;
          tmp[t + RA] = ra;
          tmp[t + RB] = rb;
          tmp[t + K] = kk;
          tmp[t + RAG] = rag;
          // Texel bounding box (the paint pass rejects a primitive with one fetch).
          const reach = (d[o + FLAGS] & PF.TEETH ? 2 * Math.max(ra, rb) : Math.max(ra, rb)) + kk + rag + 1;
          tmp[t + BB0] = Math.min(ax, bx) - reach;
          tmp[t + BB1] = Math.min(ay, by) - reach;
          tmp[t + BB2] = Math.max(ax, bx) + reach;
          tmp[t + BB3] = Math.max(ay, by) + reach;
          w++;
        }
      }
    }
    // Layer table: primitive range + bounding box of its solids (a texel outside
    // it can't be covered by the layer, so the paint pass skips the whole layer).
    const lr = this.layerRange;
    const lb = this.layerBox;
    let L = -1;
    for (let i = 0; i < w; i++) {
      const t = i * PRIM_FLOATS;
      const li = tmp[t + LAYER];
      if (li !== L) {
        if (L >= 0) lr[L * 2 + 1] = i;
        for (let q = L + 1; q <= li; q++) {
          lr[q * 2] = i;
          lr[q * 2 + 1] = i;
          lb[q * 4] = 1e9;
          lb[q * 4 + 1] = 1e9;
          lb[q * 4 + 2] = -1e9;
          lb[q * 4 + 3] = -1e9;
        }
        L = li;
      }
      if (tmp[t + FLAGS] & PF.DECAL) continue;
      lb[L * 4] = Math.min(lb[L * 4], tmp[t + BB0]);
      lb[L * 4 + 1] = Math.min(lb[L * 4 + 1], tmp[t + BB1]);
      lb[L * 4 + 2] = Math.max(lb[L * 4 + 2], tmp[t + BB2]);
      lb[L * 4 + 3] = Math.max(lb[L * 4 + 3], tmp[t + BB3]);
    }
    if (L >= 0) lr[L * 2 + 1] = w;
    this.layers = L + 1;
    // (Whole-array copies: no subarray views allocated per redraw.)
    d.set(tmp);
    this.minPx.set(this.minPx2);
    this.count = w;
    return true;
  }

  // ─── CPU reference (tests) ────────────────────────────────────────────────

  /**
   * What the paint pass shows at texel (x, y) — texel centres are at +0.5 —
   * after `layout`: the visible layer (nearest covered one), its closest solid
   * primitive and that primitive's hit part. Ragged edges and decals are
   * ignored (they never decide which PART a texel belongs to).
   */
  sample(x: number, y: number, out: FigureSample = { layer: -1, prim: -1, part: PART.NONE, mat: 0, depth: Infinity }): FigureSample {
    const d = this.data;
    out.layer = -1;
    out.prim = -1;
    out.part = PART.NONE;
    out.mat = 0;
    out.depth = Infinity;
    let cur = -1;
    let lD = 1e9;
    let lZ = 0;
    let cD = 1e9;
    let cZ = 1e9;
    let cCov = false;
    let cI = -1;
    const commit = () => {
      if (cur >= 0 && lD <= 0 && cI >= 0 && lZ < out.depth) {
        out.depth = lZ;
        out.layer = cur;
        out.prim = cI;
        out.part = d[cI * PRIM_FLOATS + PARTI] as PartCode;
        out.mat = d[cI * PRIM_FLOATS + MA];
      }
    };
    for (let i = 0; i < this.count; i++) {
      const o = i * PRIM_FLOATS;
      const L = d[o + LAYER];
      if (L !== cur) {
        commit();
        cur = L;
        lD = 1e9;
        lZ = 0;
        cD = 1e9;
        cZ = 1e9;
        cCov = false;
        cI = -1;
      }
      if (d[o + FLAGS] & PF.DECAL) continue;
      if (d[o + FLAGS] & PF.STAMP) {
        // Solid stamp: covered where its cell has a code (hard edge, no blend).
        const cell = d[o + RA];
        const sw = d[o + RB];
        const qx = Math.floor((x - d[o + AX]) / cell);
        const qy = Math.floor((y - d[o + AY]) / cell);
        if (qx < 0 || qy < 0 || qx >= sw || qy >= d[o + SEED]) continue;
        const cxs = d[o + RAG] > 0.5 ? sw - 1 - qx : qx;
        if (!atlasCode(d[o + BX] + cxs, d[o + BY] + qy)) continue;
        const z = d[o + ZA];
        if (lD > 1e8) lZ = z;
        lD = Math.min(lD, -0.5);
        if (!cCov || z < cZ) {
          cCov = true;
          cZ = z;
          cD = -0.5;
          cI = i;
        }
        continue;
      }
      const ax = d[o + AX];
      const ay = d[o + AY];
      const bx = d[o + BX];
      const by = d[o + BY];
      const di = sdRoundCone(x, y, ax, ay, bx, by, d[o + RA], d[o + RB]);
      const k = d[o + K];
      const wb = shareB(lD, di, k);
      const hh = k > 0 ? Math.max(k - Math.abs(lD - di), 0) / k : 0;
      const dx = bx - ax;
      const dy = by - ay;
      const h = dx * dx + dy * dy;
      const t = h > 1e-6 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / h)) : 0;
      const z = d[o + ZA] + (d[o + ZB] - d[o + ZA]) * t;
      lZ = lD > 1e8 ? z : lZ + (z - lZ) * wb;
      lD = Math.min(lD, di) - hh * hh * k * 0.25;
      // Front-most covering primitive (else the nearest) — same rule as the GPU.
      const R = Math.max(d[o + RA] + (d[o + RB] - d[o + RA]) * t, 1e-3);
      const cxp = ax + dx * t;
      const cyp = ay + dy * t;
      const xr = Math.min(Math.hypot(x - cxp, y - cyp) / R, 1);
      const zf = z - ((R * z) / this.texS) * Math.sqrt(Math.max(0, 1 - xr * xr));
      const covers = di < 0;
      if (covers ? !cCov || zf < cZ : !cCov && di < cD) {
        cCov = covers;
        cZ = zf;
        cD = di;
        cI = i;
      }
    }
    commit();
    return out;
  }
}

const PA = { x: 0, y: 0, z: 0 };
const PB = { x: 0, y: 0, z: 0 };
const SORT = new Float32Array(MAX_PRIMS * PRIM_FLOATS);

/** Field offsets (the GPU shader reads the same layout). */
export const PRIM_LAYOUT = { AX, AY, BX, BY, RA, RB, ZA, ZB, MA, MB, SPLIT, K, LAYER, FLAGS, RAG, SEED, U0, ULEN, TONE, PARTI, BB0, BB1, BB2, BB3 } as const;
