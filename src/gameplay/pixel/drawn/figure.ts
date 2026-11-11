import { BODY, J, HEADS, Skeleton, buildPose, project, type PoseKey, type ViewId } from './skeleton';
import { IndexedCanvas, Pen, MAX_CANVAS } from './raster';
import type { FigureDef } from './outfits';
import type { BandRow } from './body';

/**
 * DRAWN FIGURES: turns one (figure, pose, view, size) into an indexed sprite. Outlines live in
 * the outfit tables (`body.ts`, `outfits.ts`) as control points in BONE space; this file computes
 * the bones from the skeleton and owns the pen, so a table only says where a line goes.
 */

/** Bones (frames the control points of the tables live in). */
export const B = {
  pelvis: 0,
  waist: 1,
  chest: 2,
  neck: 3,
  head: 4,
  upL: 5,
  foL: 6,
  haL: 7,
  upR: 8,
  foR: 9,
  haR: 10,
  thL: 11,
  shL: 12,
  ftL: 13,
  thR: 14,
  shR: 15,
  ftR: 16,
  count: 17,
} as const;

/** A control point: bone, along (t 0..1 on limbs, hu up the axis on body frames), normal (hu), corner? */
export type Pt = readonly [number, number, number, (number | undefined)?];

const CANVAS = MAX_CANVAS;

/** The light comes from the upper left; shadow shapes go on the side away from it. */
const AWAY_X = 0.62;
const AWAY_Y = -0.78;

/** Level of detail from texels per head unit. `prev` (−1 = none) holds a figure that hovers at a threshold on one drawing. */
export function lodFor(hpx: number, prev: number): number {
  const lod = hpx < 11 ? 0 : hpx < 18 ? 1 : hpx < 30 ? 2 : 3;
  if (prev < 0 || lod === prev) return lod;
  const T = LOD_AT[Math.max(lod, prev) - 1];
  return Math.abs(hpx - T) < 0.5 ? prev : lod;
}
const LOD_AT = [11, 18, 30];

/** Everything a table's painter needs for one figure being drawn. */
export class Draw {
  readonly pen: Pen;
  readonly sk = new Skeleton();
  view: ViewId = 0;
  /** Texels per hu. */
  S = 20;
  /** Screen position (texels) of the figure's ground point. */
  cx = 0;
  cy = 0;
  /** Level of detail: 0 under 11 texels of head, 1 under 18, 2 under 30, 3 above. */
  lod = 3;
  /** Bone frames. */
  ox = new Float32Array(B.count);
  oy = new Float32Array(B.count);
  ax = new Float32Array(B.count);
  ay = new Float32Array(B.count);
  /** Length along the axis that `along` = 1 means (hu): a limb's 2D length; 1 on body frames. */
  A = new Float32Array(B.count);
  /** Scale on the normal (1 except where a bone is drawn foreshortened as a whole: a lying head). */
  N = new Float32Array(B.count);
  /** Sign making `n > 0` lateral (front/back views) or screen right (the others). */
  sg = new Float32Array(B.count);
  time = 0;
  /** Damage drawn into this frame (bits 0-1 left arm, 2-3 right arm: 0 whole, 1 forearm gone, 2 arm gone; bit 4 headless). */
  flags = 0;
  /** The pose being drawn. */
  key: PoseKey = {};
  /** Front and back views: an arm thrust at or away from the viewer (0 no, else 0..1 how far up), left and right. */
  readonly reach = new Float32Array(2);
  /** Front and back views: a shin folded back behind its thigh, left and right. */
  readonly shinBack = new Uint8Array(2);
  /** How far each foot is toward (+1) or away from (−1) the viewer, as the floor plane draws it. */
  readonly near = new Float32Array(2);
  /** The lying body's hand-plotted drawing is in use. */
  corpse = false;

  constructor(pen: Pen) {
    this.pen = pen;
  }

  /** Compute the bones of the current (projected) skeleton for this view. */
  frames() {
    const { sk, view } = this;
    const sideL = view === 0 ? 1 : view === 4 ? -1 : 1;
    const sideR = view === 0 ? -1 : view === 4 ? 1 : 1;
    this.frame(B.pelvis, J.pelvis, J.waist, -1, 1);
    this.frame(B.waist, J.waist, J.chest, -1, 1);
    this.frame(B.chest, J.chest, J.neck, -1, 1);
    this.frame(B.neck, J.neck, J.head, -1, 1);
    // Head frame: the neck's direction plus the head's roll.
    this.ox[B.head] = sk.sx[J.head];
    this.oy[B.head] = sk.sy[J.head];
    this.A[B.head] = 1;
    this.N[B.head] = 1;
    this.sg[B.head] = -1;
    let hx = sk.sx[J.head] - sk.sx[J.neck];
    let hy = sk.sy[J.head] - sk.sy[J.neck];
    // Folded right over toward or away from the viewer, the neck points down the screen; a head
    // never hangs upside down in those views (it foreshortens instead).
    if ((view === 0 || view === 4) && hy < 0.25) {
      this.A[B.head] = 0.7;
      hy = 0.25;
    }
    const hl = Math.max(1e-4, Math.hypot(hx, hy));
    hx /= hl;
    hy /= hl;
    this.ax[B.head] = hx;
    this.ay[B.head] = hy;
    this.frame(B.upL, J.shL, J.elL, sideL, 0);
    this.frame(B.foL, J.elL, J.wrL, sideL, 0);
    this.frame(B.haL, J.wrL, J.tipL, sideL, 0);
    this.frame(B.upR, J.shR, J.elR, sideR, 0);
    this.frame(B.foR, J.elR, J.wrR, sideR, 0);
    this.frame(B.haR, J.wrR, J.tipR, sideR, 0);
    this.frame(B.thL, J.hipL, J.kneeL, sideL, 0);
    this.frame(B.shL, J.kneeL, J.ankleL, sideL, 0);
    this.frame(B.ftL, J.ankleL, J.toeL, sideL, 0);
    this.frame(B.thR, J.hipR, J.kneeR, sideR, 0);
    this.frame(B.shR, J.kneeR, J.ankleR, sideR, 0);
    this.frame(B.ftR, J.ankleR, J.toeR, sideR, 0);
  }

  private frame(b: number, ja: number, jb: number, sg: number, unit: number) {
    const sk = this.sk;
    let ax = sk.sx[jb] - sk.sx[ja];
    let ay = sk.sy[jb] - sk.sy[ja];
    const l = Math.hypot(ax, ay);
    if (l > 1e-3) {
      ax /= l;
      ay /= l;
    } else {
      ax = 0;
      ay = -1;
    }
    this.ox[b] = sk.sx[ja];
    this.oy[b] = sk.sy[ja];
    this.ax[b] = ax;
    this.ay[b] = ay;
    this.A[b] = unit > 0 ? 1 : l;
    this.N[b] = 1;
    this.sg[b] = sg;
  }

  /** Screen texels of a point given in screen head units from the ground point. */
  sx(x: number) {
    return this.cx + x * this.S;
  }
  sy(y: number) {
    return this.cy - y * this.S;
  }

  /** Screen position (texels) of a control point; the base of everything a table says. */
  px(b: number, a: number, n: number) {
    const o = this.ox[b] + this.ax[b] * a * this.A[b] + -this.ay[b] * n * this.sg[b] * this.N[b];
    return this.cx + o * this.S;
  }
  py(b: number, a: number, n: number) {
    const o = this.oy[b] + this.ay[b] * a * this.A[b] + this.ax[b] * n * this.sg[b] * this.N[b];
    return this.cy - o * this.S;
  }

  /** Add one control point of bone `b`. */
  pt(b: number, a: number, n: number, corner = false) {
    this.pen.add(this.px(b, a, n), this.py(b, a, n), corner);
  }

  /** Add a table; its bone numbers are indexes into `map`; `scale` widens the limb across its axis. */
  pts(table: readonly Pt[], map: readonly number[], scale = 1) {
    for (let i = 0; i < table.length; i++) {
      const p = table[i];
      this.pt(map[p[0]], p[1], p[2] * scale, p[3] === 1);
    }
  }

  /** +1 when a bone's `n > 0` side is the one away from the light, else −1. */
  away(b: number): number {
    const nx = -this.ay[b] * this.sg[b];
    const ny = this.ax[b] * this.sg[b];
    return nx * AWAY_X + ny * AWAY_Y >= 0 ? 1 : -1;
  }

  /**
   * A shadow shape on the away side of a limb: `inner` is its inner edge (bone, along, normal
   * magnitude toward the away side); the outside is closed well past the limb (the fill clips to `group`).
   */
  wedge(inner: readonly Pt[], map: readonly number[], group: number, delta = -1, relative = false) {
    const pen = this.pen;
    pen.begin();
    for (let i = 0; i < inner.length; i++) {
      const p = inner[i];
      const b = map[p[0]];
      this.pt(b, p[1], p[2] * this.away(b), p[3] === 1);
    }
    for (let i = inner.length - 1; i >= 0; i--) {
      const p = inner[i];
      const b = map[p[0]];
      this.pt(b, p[1], (p[2] + 0.6) * this.away(b), true);
    }
    if (relative) pen.darken(group, -delta);
    else pen.shade(group, delta);
  }
}

/**
 * A shaped form on one side of a limb: `side` −1 = toward the light, +1 = away. Rows are (bone,
 * along, near edge, far edge); `delta` tone steps from the base (never stacks with another shade).
 */
export function band(d: Draw, tbl: readonly BandRow[], map: readonly number[], group: number, delta: number, side: number, relative = false) {
  const pen = d.pen;
  pen.begin();
  const sign = side * d.away(map[tbl[0][0]]);
  for (let i = 0; i < tbl.length; i++) {
    const r = tbl[i];
    d.pt(map[r[0]], r[1], r[2] * sign);
  }
  for (let i = tbl.length - 1; i >= 0; i--) {
    const r = tbl[i];
    d.pt(map[r[0]], r[1], r[3] * sign);
  }
  if (relative) pen.darken(group, -delta);
  else pen.shade(group, delta);
}

/**
 * Front and back views: arms thrust along the view axis. Bones cannot show this (an arm aimed at
 * the camera projects straight up), so the drawing is placed by hand: one hand comes in low over
 * the breastbone and big, the other reaches up at chin height off to the side. Hands never match:
 * two hands at one height, the same distance out, read as a figure holding its own head.
 */
function placeReach(d: Draw, key: PoseKey, view: ViewId) {
  const sk = d.sk;
  d.reach[0] = d.reach[1] = 0;
  if ((view !== 0 && view !== 4) || key.noReach) return;
  for (let s = 0; s < 2; s++) {
    const a = s === 0 ? key.aL : key.aR;
    const swing = a?.[0] ?? 0;
    if (swing <= 60) continue;
    const t = Math.max(0, Math.min(1, (swing - 70) / 55));
    d.reach[s] = 0.05 + t * 0.95;
    const sh = s === 0 ? J.shL : J.shR;
    const out = Math.sign(sk.sx[sh] - sk.sx[J.chest]) || (s === 0 ? 1 : -1);
    const x0 = sk.sx[sh];
    const y0 = sk.sy[sh];
    const lead = (s === 0) === (key.leadL === true);
    // Lead: rises from the belly to over the breastbone, near the centre line, big.
    // Other: from low on its own side up to the chin, wide of the head.
    const target = sk.sx[J.chest] + out * (lead ? 0.3 : 0.7);
    const wx = x0 + (target - x0) * (0.3 + 0.7 * t);
    const wy = lead ? y0 - 1.5 + 0.8 * t : y0 - 1.0 + 1.18 * t;
    const el = s === 0 ? J.elL : J.elR;
    const wr = s === 0 ? J.wrL : J.wrR;
    const tip = s === 0 ? J.tipL : J.tipR;
    sk.sx[el] = (x0 + wx) * 0.5 + out * 0.18;
    sk.sy[el] = (y0 + wy) * 0.5 - 0.22;
    sk.sx[wr] = wx;
    sk.sy[wr] = wy;
    // Fingers aimed at the camera are short on screen: the hand is wide and squat, not tall.
    const hl = (lead ? 0.72 : 0.58) + 0.12 * t;
    sk.sx[tip] = wx + out * hl * (0.12 + 0.22 * t);
    sk.sy[tip] = wy + hl * 0.95;
  }
}

/** How far toward or away from the viewer feet read on the street, hu of screen height per hu of depth. */
const FLOOR_NEAR = 0.36;
const FLOOR_FAR = 0.22;
/** Most a stride-leading shin is drawn on screen, against its full length: the knee is coming at the viewer. */
const NEAR_SHIN = 0.9;

/**
 * Depth drawn on the street, for the views that look along the walk: a foot coming at the viewer
 * lands lower on the screen, one going away sits higher, and the near leg's knee and shin are drawn
 * as the foreshortened part. Nothing is rotated: it is the floor plane a sprite artist plots by eye.
 */
function floorDepth(d: Draw, key: PoseKey, view: ViewId) {
  const sk = d.sk;
  d.near[0] = d.near[1] = 0;
  if (view === 2 || key.noGround) return;
  for (let s = 0; s < 2; s++) {
    const kn = s === 0 ? J.kneeL : J.kneeR;
    const an = s === 0 ? J.ankleL : J.ankleR;
    const to = s === 0 ? J.toeL : J.toeR;
    const zA = sk.sz[an];
    const zK = sk.sz[kn];
    sk.sy[kn] -= zK * (zK > 0 ? FLOOR_NEAR : FLOOR_FAR);
    sk.sy[an] -= zA * (zA > 0 ? FLOOR_NEAR : FLOOR_FAR);
    sk.sy[to] -= zA * (zA > 0 ? FLOOR_NEAR : FLOOR_FAR);
    d.near[s] = Math.max(-1, Math.min(1, zA / 0.72));
    if ((view === 0 || view === 4) && d.near[s] > 0.3) {
      // The near leg: the knee comes forward over a shorter shin.
      const L = Math.hypot(sk.sx[an] - sk.sx[kn], sk.sy[an] - sk.sy[kn]);
      const short = BODY.shin * NEAR_SHIN;
      if (L > short) {
        const k = short / L;
        sk.sx[kn] = sk.sx[an] + (sk.sx[kn] - sk.sx[an]) * k;
        sk.sy[kn] = sk.sy[an] + (sk.sy[kn] - sk.sy[an]) * k;
      }
    }
  }
}

/** A corpse seen from its feet, in head units, as a sprite artist plots it (x right, y up, on the street). */
const CORPSE: readonly (readonly [number, number, number])[] = [
  [J.pelvis, 0.0, 1.14],
  [J.waist, 0.02, 1.42],
  [J.chest, 0.0, 1.74],
  [J.neck, -0.04, 2.0],
  [J.head, 0.14, 2.28],
  [J.shL, 0.58, 1.86],
  [J.elL, 1.02, 1.52],
  [J.wrL, 0.6, 1.26],
  [J.tipL, 0.14, 1.22],
  [J.shR, -0.58, 1.86],
  [J.elR, -1.06, 1.52],
  [J.wrR, -1.3, 1.0],
  [J.tipR, -1.42, 0.6],
  [J.hipL, 0.34, 1.02],
  [J.kneeL, 0.48, 0.74],
  [J.ankleL, 0.64, 0.46],
  [J.toeL, 0.88, 0.86],
  [J.hipR, -0.34, 1.02],
  [J.kneeR, -0.44, 0.76],
  [J.ankleR, -0.6, 0.46],
  [J.toeR, -0.84, 0.84],
];

function placeCorpse(d: Draw) {
  const sk = d.sk;
  for (let i = 0; i < CORPSE.length; i++) {
    const c = CORPSE[i];
    sk.sx[c[0]] = c[1];
    sk.sy[c[0]] = c[2];
  }
}

/** Front and back views: a shin going far back is hidden behind the thigh and stays under the knee. */
function placeShins(d: Draw, view: ViewId) {
  const sk = d.sk;
  d.shinBack[0] = d.shinBack[1] = 0;
  if (view !== 0 && view !== 4) return;
  for (let s = 0; s < 2; s++) {
    const kn = s === 0 ? J.kneeL : J.kneeR;
    const an = s === 0 ? J.ankleL : J.ankleR;
    const to = s === 0 ? J.toeL : J.toeR;
    const z = sk.z[an] - sk.z[kn];
    if (z > -0.77 * 1.3) continue;
    d.shinBack[s] = 1;
    const dx = Math.max(-0.1, Math.min(0.1, sk.sx[an] - sk.sx[kn]));
    const mv = sk.sx[kn] + dx - sk.sx[an];
    sk.sx[an] += mv;
    sk.sx[to] += mv;
  }
}

export interface RenderedFigure {
  w: number;
  h: number;
  pixels: Uint8Array;
  part: Uint8Array;
  mirror: boolean;
  /** Ground point within the sprite (texels from the sprite's left / top). */
  gx: number;
  gy: number;
  /** Centre of the drawn head and chest, sprite texels from the ground point (hu). */
  headX: number;
  headY: number;
  chestX: number;
  chestY: number;
}

/**
 * The renderer: reusable canvas and pen (no allocation per figure beyond the copy `draw` hands back
 * to the sheet tools; the game's path writes straight into its atlas).
 */
export function makeFigureRenderer() {
  const canvas = new IndexedCanvas(CANVAS, CANVAS);
  const pen = new Pen(canvas);
  const d = new Draw(pen);

  /** Paint figure `def` in pose `key` into the canvas; `pxTall` = texels of a 6.25-head figure. */
  function paint(def: FigureDef, key: PoseKey, view: ViewId, pxTall: number, hx = 0, hy = 0, flags = 0, lod = -1) {
    canvas.clear();
    pen.reset();
    if ((view === 0 || view === 4) && key.front) key = key.front;
    // (A corpse has one drawing for the views that look along it.)
    if (key.corpse) view = 0;
    d.view = view;
    d.flags = flags;
    const sk = d.sk;
    d.key = key;
    buildPose(sk, key, def.ground !== false && !key.noGround);
    project(sk, view);
    d.S = pxTall / HEADS;
    // (The aim-fair head offset comes in whole texels: the head steps on the sprite's own grid.)
    sk.sx[J.head] += hx / d.S;
    sk.sy[J.head] += hy / d.S + (def.neck ?? 0);
    d.cx = canvas.w / 2;
    d.cy = canvas.h - 8;
    d.lod = lod >= 0 ? lod : lodFor(d.S, -1);
    d.corpse = key.corpse === true;
    if (d.corpse) placeCorpse(d);
    else floorDepth(d, key, view);
    placeReach(d, key, view);
    placeShins(d, view);
    // A crouch seen from the front: the thighs come at the viewer, so the knees are drawn out to
    // the sides, or the crouched figure reads as a short man standing up.
    if (key.kneeSpread && (view === 0 || view === 4)) {
      sk.sx[J.kneeL] = view === 0 ? key.kneeSpread : -key.kneeSpread;
      sk.sx[J.kneeR] = view === 0 ? -key.kneeSpread : key.kneeSpread;
    }
    d.frames();
    if (d.corpse) {
      // Seen end on from the feet, the torso is short and the head small and far.
      d.A[B.pelvis] = d.A[B.waist] = d.A[B.chest] = 0.6;
      d.A[B.head] = d.N[B.head] = 0.72;
    }
    // Sleeves flow into the shoulder, trousers into the hip: no seam line round the joint.
    const R = 0.38 * d.S;
    pen.suppress(d.cx + sk.sx[J.shL] * d.S, d.cy - sk.sy[J.shL] * d.S, R);
    pen.suppress(d.cx + sk.sx[J.shR] * d.S, d.cy - sk.sy[J.shR] * d.S, R);
    def.paint(d, view);
    pen.ink();
    return d;
  }

  /** Paint and hand back a trimmed copy of the sprite (sheet tools, tests). */
  function draw(def: FigureDef, frames: PoseKey | readonly PoseKey[], i: number, view: ViewId, pxTall: number): RenderedFigure {
    const key = Array.isArray(frames) ? (frames as readonly PoseKey[])[i % (frames as readonly PoseKey[]).length] : (frames as PoseKey);
    paint(def, key, view, pxTall);
    const { x0, y0, x1, y1, w: cw, idx } = canvas;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const pixels = new Uint8Array(w * h);
    const part = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        pixels[y * w + x] = idx[(y + y0) * cw + x + x0];
        part[y * w + x] = canvas.part[(y + y0) * cw + x + x0];
      }
    }
    return {
      w,
      h,
      pixels,
      part,
      mirror: false,
      gx: d.cx - x0,
      gy: d.cy - y0,
      headX: d.sk.sx[J.head],
      headY: d.sk.sy[J.head],
      chestX: d.sk.sx[J.chest],
      chestY: d.sk.sy[J.chest],
    };
  }

  /** The skeleton of a pose for one view, without drawing it (placement). */
  function pose(key: PoseKey, view: ViewId) {
    if ((view === 0 || view === 4) && key.front) key = key.front;
    buildPose(d.sk, key, !key.noGround);
    project(d.sk, view);
    return d.sk;
  }

  return { canvas, draw, paint, d, pose };
}
