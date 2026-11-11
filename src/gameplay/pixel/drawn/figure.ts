import { J, HEADS, Skeleton, buildPose, project, type PoseKey, type ViewId } from './skeleton';
import { IndexedCanvas, Pen, MAX_CANVAS } from './raster';
import type { FigureDef } from './outfits';

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
  /** Sign making `n > 0` lateral (front/back views) or screen right (the others). */
  sg = new Float32Array(B.count);
  time = 0;
  /** Damage drawn into this frame (bits 0-1 left arm, 2-3 right arm: 0 whole, 1 forearm gone, 2 arm gone; bit 4 headless). */
  flags = 0;

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
    this.sg[B.head] = -1;
    let hx = sk.sx[J.head] - sk.sx[J.neck];
    let hy = sk.sy[J.head] - sk.sy[J.neck];
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
    this.sg[b] = sg;
  }

  /** Screen position (texels) of a control point; the base of everything a table says. */
  px(b: number, a: number, n: number) {
    const o = this.ox[b] + this.ax[b] * a * this.A[b] + -this.ay[b] * n * this.sg[b];
    return this.cx + o * this.S;
  }
  py(b: number, a: number, n: number) {
    const o = this.oy[b] + this.ay[b] * a * this.A[b] + this.ax[b] * n * this.sg[b];
    return this.cy - o * this.S;
  }

  /** Add one control point of bone `b`. */
  pt(b: number, a: number, n: number, corner = false) {
    this.pen.add(this.px(b, a, n), this.py(b, a, n), corner);
  }

  /** Add a table; its bone numbers are indexes into `map`. */
  pts(table: readonly Pt[], map: readonly number[]) {
    for (let i = 0; i < table.length; i++) {
      const p = table[i];
      this.pt(map[p[0]], p[1], p[2], p[3] === 1);
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
  wedge(inner: readonly Pt[], map: readonly number[], group: number, delta = -1) {
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
    pen.shade(group, delta);
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
    d.view = view;
    d.flags = flags;
    const sk = d.sk;
    buildPose(sk, key, def.ground !== false && !key.noGround);
    project(sk, view);
    d.S = pxTall / HEADS;
    // (The aim-fair head offset comes in whole texels: the head steps on the sprite's own grid.)
    sk.sx[J.head] += hx / d.S;
    sk.sy[J.head] += hy / d.S;
    d.cx = canvas.w / 2;
    d.cy = canvas.h - 8;
    d.lod = lod >= 0 ? lod : lodFor(d.S, -1);
    d.frames();
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
    buildPose(d.sk, key, !key.noGround);
    project(d.sk, view);
    return d.sk;
  }

  return { canvas, draw, paint, d, pose };
}
