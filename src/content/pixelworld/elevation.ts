import { bayer, PWF, type PwCanvas, type PwRng } from './canvas';
import type { PwKit } from './atlas';
import { FONT_BOLD, rasterText } from './font';
import { hash2 } from './surfaces';

/**
 * Drawn elevations (docs/PIXELWORLD3.md, "Buildings"): the illustration kit a
 * painter uses to draw a whole building as ONE PICTURE on a flat card. Nothing
 * here tiles: the wall, its courses, each window, the roofline and the damage
 * are placed for this building, with one value structure over the picture.
 *
 * What makes it a drawing and not a box with a texture:
 *  - `top[]` is the drawn outline: parapets, gables and bites, never a ruler line;
 *  - every long horizontal runs through `sag()` and every long vertical through
 *    `lean()`: a pixel out here and there, the way a hand and an old wall do it;
 *  - brick is `courses()` drawn in patches and thinned out, not a tiled bond;
 *  - each window is drawn on its own, by kind (curtains, boards, cracks, a figure);
 *  - tones are the ramp's whole steps; dither only in the seam between two of them.
 *
 * Coordinates are canvas texels, y down, the wall's foot on the last row.
 */

/** Painted texels a metre of a building flat (PIXELWORLD2 §3: the nearest normal view is ≥ 6 m). */
export const FLAT_TPM = 32;
/** Texels of clear card left and right of the wall (cornices and signs overhang). */
export const FLAT_PAD = 16;

/** One-dimensional value noise, 0…1, over cells of `s` texels. */
export function vnoise(x: number, s: number, seed: number): number {
  const fx = x / s;
  const i = Math.floor(fx);
  const t = fx - i;
  const a = hash2(i, 11, seed);
  const b = hash2(i + 1, 11, seed);
  return a + (b - a) * (t * t * (3 - 2 * t));
}

/** Two-dimensional value noise, 0…1, over cells of `sx` × `sy` texels. */
export function vnoise2(x: number, y: number, sx: number, sy: number, seed: number): number {
  const fx = x / sx;
  const fy = y / sy;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const ux = tx * tx * (3 - 2 * tx);
  const uy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** The ramps of one building. */
export interface ElevRamps {
  wall: number;
  /** A shade off the wall: re-pointing, patches, the second skin. */
  alt: number;
  /** Mortar / the wall's darks (kept on the wall's own family). */
  mortar: number;
  brick: number;
  stone: number;
  iron: number;
  wood: number;
  ink: number;
  soot: number;
  rust: number;
  glassDark: number;
  glassSky: number;
  lamp: number;
  lampDeep: number;
  curtain: number;
  curtainB: number;
  frame: number;
}

export interface ElevWallColours {
  wall: number;
  alt?: number;
  brick?: number;
  stone?: number;
  frame?: number;
  /** Curtain fabric (lit windows). */
  curtain?: number;
}

export function elevRamps(k: PwKit, o: ElevWallColours): ElevRamps {
  const wall = k.ramp(o.wall, { light: 0.34, sat: 0.95, dark: 0.42 });
  const alt = k.ramp(o.alt ?? mix(o.wall, 0x3a3a48, 0.25), { light: 0.34, sat: 0.9, dark: 0.42 });
  return {
    wall,
    alt,
    mortar: alt,
    brick: k.ramp(o.brick ?? 0x7a4034, { light: 0.34, dark: 0.42 }),
    stone: k.ramp(o.stone ?? 0x8c8778, { light: 0.42, sat: 0.7, dark: 0.42 }),
    iron: k.ramp(0x363842, { light: 0.4, sat: 0.6, dark: 0.45 }),
    wood: k.ramp(0x7a5a3a, { light: 0.42, sat: 0.85, dark: 0.42 }),
    ink: k.ramp(0x201c30, { light: 0.3, dark: 0.5 }),
    soot: k.ramp(0x2c2838, { light: 0.25, dark: 0.5, sat: 0.6 }),
    rust: k.ramp(0x8a4a24, { light: 0.4 }),
    glassDark: k.ramp(0x161b30, { light: 0.32, sat: 0.8, dark: 0.45 }),
    glassSky: k.ramp(0x41527a, { light: 0.4, sat: 0.75 }),
    lamp: k.ramp(0xeab664, { light: 0.32, sat: 1.0, dark: 0.55 }),
    lampDeep: k.ramp(0xb0632e, { light: 0.34, sat: 1.05, dark: 0.45 }),
    curtain: k.ramp(o.curtain ?? 0x9a4a3a, { light: 0.38, sat: 0.9, dark: 0.5 }),
    curtainB: k.ramp(0x5a6a7a, { light: 0.4, sat: 0.8, dark: 0.5 }),
    frame: k.ramp(o.frame ?? 0x3e4240, { light: 0.34, sat: 0.7, dark: 0.45 }),
  };
}

/** Mix two sRGB hexes. */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}

/** What finishes an end of the card: a brick pier or a stone return, each with its side in shadow, toothing above. */
export type SideKind = 'pier' | 'stone';

export interface BrickOpts {
  /** Share of the wall drawn as brick (the rest stays flat). */
  amount?: number;
  ramp?: number;
  course?: number;
  len?: number;
}

/** A long line's hand: per column, how far this stretch has dropped, and what interrupts it (1 pier, 2 gone). */
interface LineBreaks {
  dy: Int8Array;
  st: Uint8Array;
}

export type WinKind = 'dark' | 'moon' | 'lit' | 'curtain' | 'blind' | 'figure' | 'tv' | 'boarded' | 'broken' | 'bricked' | 'ac';

export class Elev {
  readonly W: number;
  readonly H: number;
  readonly rng: PwRng;
  /** Wall columns: [x0, x1). */
  readonly x0: number;
  readonly x1: number;
  /** The drawn outline: top row of the wall per column (H = no wall there). */
  readonly top: Int16Array;
  /** Ragged left and right wall ends per row. */
  private readonly endL: Int16Array;
  private readonly endR: Int16Array;
  readonly r: ElevRamps;
  /** What stands at each end of the card (`sides`). */
  private sideL: SideKind = 'pier';
  private sideR: SideKind = 'pier';
  private carved = false;
  private finished = false;
  private brickOpts: BrickOpts = {};
  /** Where things have happened on the wall: brick shows round them, grime runs from them. */
  private readonly spots: { x: number; y: number; rx: number; ry: number }[] = [];
  private readonly splash: { x: number; s: number }[] = [];
  private readonly bites: { x0: number; x1: number }[] = [];
  private readonly joists: { x0: number; x1: number }[] = [];
  private readonly runs = new Map<number, LineBreaks>();
  /** The hand-shaped seam of `value`, once per picture. */
  private wob?: Float32Array;

  constructor(
    readonly c: PwCanvas,
    readonly k: PwKit,
    readonly seed: number,
    colours: ElevWallColours,
    readonly pad = FLAT_PAD,
    readonly tpm = FLAT_TPM,
  ) {
    this.W = c.w;
    this.H = c.h;
    this.rng = k.rng;
    this.x0 = pad;
    this.x1 = c.w - pad;
    this.top = new Int16Array(c.w).fill(c.h);
    this.endL = new Int16Array(c.h);
    this.endR = new Int16Array(c.h);
    this.r = elevRamps(k, colours);
    // The ends of a wall are drawn too (`carveEnds`: once the outline is known).
    for (let y = 0; y < c.h; y++) {
      this.endL[y] = this.x0;
      this.endR[y] = this.x1;
    }
  }

  /** Column `m` metres from the wall's left end. */
  X(m: number): number {
    return this.x0 + Math.round(m * this.tpm);
  }

  /** Row of a height `m` metres above the street. */
  Y(m: number): number {
    return this.H - Math.round(m * this.tpm);
  }

  /** A horizontal's hand: an integer offset that moves a pixel every so often along x. */
  sag(x: number, salt = 0): number {
    return Math.round((vnoise(x, 130, this.seed + 17 * salt + 3) - 0.5) * 2.6 + (vnoise(x, 41, this.seed + 17 * salt + 9) - 0.5) * 1.3);
  }

  /** A vertical's lean: an integer offset along y. */
  lean(y: number, salt = 0): number {
    return Math.round((vnoise(y, 170, this.seed + 19 * salt + 5) - 0.5) * 2.4);
  }

  /** Inside the drawn wall? */
  inWall(x: number, y: number): boolean {
    return y >= this.top[x | 0] && x >= this.endL[y | 0] && x < this.endR[y | 0];
  }

  // ─── The outline ──────────────────────────────────────────────────────────

  /** Set the wall's top between metres `a` … `b` (from the left end) at height `hM`; `sag` wobbles it. */
  parapet(a: number, b: number, hM: number, salt = 1): this {
    const y = this.Y(hM);
    for (let x = this.X(a); x < this.X(b); x++) this.top[x] = y + this.sag(x, salt);
    return this;
  }

  /** A stepped gable centred on `cM`: stairs up to `hM` from the current top, each step `stepW` metres wide. */
  steppedGable(cM: number, halfM: number, hM: number, steps = 4): this {
    const y1 = this.Y(hM);
    const cx = this.X(cM);
    const half = Math.round(halfM * this.tpm);
    const sw = Math.max(4, Math.floor(half / steps));
    for (let x = cx - half; x <= cx + half; x++) {
      const s = Math.min(steps, Math.floor((half - Math.abs(x - cx)) / sw) + 1);
      const y = Math.round(this.top[x] + ((y1 - this.top[x]) * s) / steps);
      this.top[x] = Math.min(this.top[x], y) + (s === steps ? this.sag(x, 2) : 0);
    }
    return this;
  }

  /** A curved (Dutch) gable centred on `cM`. */
  curvedGable(cM: number, halfM: number, hM: number): this {
    const y1 = this.Y(hM);
    const cx = this.X(cM);
    const half = Math.round(halfM * this.tpm);
    for (let x = cx - half; x <= cx + half; x++) {
      const t = 1 - Math.abs(x - cx) / half;
      const s = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      const y = Math.round(this.top[x] + (y1 - this.top[x]) * s);
      if (y < this.top[x]) this.top[x] = y;
    }
    return this;
  }

  /** A straight-sided pediment centred on `cM`, apex at `hM`. */
  pediment(cM: number, halfM: number, hM: number): this {
    const yApex = this.Y(hM);
    const cx = this.X(cM);
    const half = Math.round(halfM * this.tpm);
    for (let x = cx - half; x <= cx + half; x++) {
      const y = Math.round(yApex + (Math.abs(x - cx) / half) * (this.top[x] - yApex));
      if (y < this.top[x]) this.top[x] = y;
    }
    return this;
  }

  /** A bite out of the outline at metres `aM`, `wM` wide, `dM` deep: broken edge with rubble steps. */
  bite(aM: number, wM: number, dM: number): this {
    const x0 = this.X(aM);
    const x1 = this.X(aM + wM);
    const d = Math.round(dM * this.tpm);
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / Math.max(1, x1 - x0);
      const v = Math.sin(t * Math.PI);
      const j = Math.round((vnoise(x, 5, this.seed + 201) - 0.5) * 6);
      this.top[x] += Math.max(0, Math.round(v * d) + j);
    }
    this.bites.push({ x0, x1 });
    return this;
  }

  /** What stands at each end of the card: `pier` (brick pier with its return in shadow), `stone` (a stone return). */
  sides(l: SideKind, r: SideKind): this {
    this.sideL = l;
    this.sideR = r;
    return this;
  }

  /**
   * A length of the roofline raised (`dy` < 0) or dropped by whole courses, its ends built, not
   * cut: the height change happens over a few columns in brick steps. A flat is never a rectangle
   * with one bump: every building takes at least two of these away from its gable.
   */
  lift(aM: number, bM: number, dy: number): this {
    const x0 = this.X(aM);
    const x1 = this.X(bM);
    const ramp = 8;
    for (let x = x0 - ramp; x < x1 + ramp; x++) {
      if (x < this.x0 || x >= this.x1 || this.top[x] >= this.H) continue;
      const t = Math.min(1, Math.min(x - x0 + ramp, x1 + ramp - x) / ramp);
      this.top[x] += Math.round((dy * Math.floor(t * 4)) / 4);
    }
    return this;
  }

  /** A corner of the wall gone, `w` texels in (20–60), `d` deep: courses stepping back from the end. */
  cornerBite(left: boolean, w: number, d: number): this {
    for (let i = 0; i < w; i++) {
      const x = left ? this.x0 + i : this.x1 - 1 - i;
      const t = 1 - i / w;
      const course = Math.floor(i / 7);
      const j = Math.round((hash2(course, 3, this.seed + 211) - 0.5) * 8);
      this.top[x] += Math.max(0, Math.round((d * t * t) / 4) * 4 + (t > 0.2 ? j : 0));
    }
    this.bites.push(left ? { x0: this.x0, x1: this.x0 + w } : { x0: this.x1 - w, x1: this.x1 });
    return this;
  }

  /**
   * A storey fallen in: from `aM` to `bM` the wall stops at a torn line about `hM` above the street
   * (brick stepped and ragged, joist stumps left sticking out of it into the night).
   */
  collapse(aM: number, bM: number, hM: number): this {
    const x0 = this.X(aM);
    const x1 = this.X(bM);
    const y0 = this.Y(hM);
    const W = x1 - x0;
    const { seed } = this;
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / W;
      // Slumps toward the far end, in runs of courses, with a bite or two.
      const slope = (1 - Math.cos(t * Math.PI)) * 0.5 * Math.round(0.9 * this.tpm);
      const n = (vnoise(x, 9, seed + 231) - 0.5) * 16 + (vnoise(x, 34, seed + 233) - 0.5) * 22;
      const y = Math.floor((y0 + slope + n) / 4) * 4;
      this.top[x] = Math.max(this.top[x], y);
    }
    this.bites.push({ x0, x1 });
    this.joists.push({ x0, x1 });
    return this;
  }

  /** Paint a stack behind the wall: everything above the outline stays visible. */
  chimney(cM: number, wM: number, topM: number, baseM: number, o: { pots?: number; stone?: boolean } = {}): this {
    const { c, r, seed } = this;
    const hw = Math.round((wM * this.tpm) / 2);
    const cx = this.X(cM);
    const yT = this.Y(topM);
    const yB = this.Y(baseM) + 6;
    const ramp = o.stone ? r.stone : r.brick;
    c.rect(cx - hw, yT + 5, hw * 2, yB - yT - 5, ramp, 3);
    for (let y = yT + 5; y < yB; y += 3) {
      const off = ((y >> 1) & 1) * 3;
      for (let x = cx - hw; x < cx + hw; x++) {
        if (hash2(y, x >> 3, seed + 5) > 0.72) c.set(x, y, ramp, 2);
        if ((x - cx + off) % 6 === 0 && hash2(x, y, seed + 7) > 0.5) c.set(x, y, ramp, 2);
      }
    }
    c.vline(cx - hw, yT + 5, yB - yT - 5, ramp, 4);
    c.rect(cx + hw - 2, yT + 5, 2, yB - yT - 5, ramp, 1);
    // Cap and pots.
    c.rect(cx - hw - 2, yT + 2, hw * 2 + 4, 4, r.stone, 3);
    c.hline(cx - hw - 2, yT + 2, hw * 2 + 4, r.stone, 4);
    c.hline(cx - hw - 2, yT + 5, hw * 2 + 4, r.stone, 1);
    for (let p = 0; p < (o.pots ?? 2); p++) {
      const px = cx - hw + 3 + ((hw * 2 - 7) * (p + 0.5)) / Math.max(1, o.pots ?? 2);
      c.rect(px, yT - 6, 5, 8, r.rust, 3);
      c.vline(px, yT - 6, 8, r.rust, 4);
      c.vline(px + 4, yT - 6, 8, r.rust, 1);
      c.hline(px - 1, yT - 7, 7, r.rust, 3);
    }
    return this;
  }

  /**
   * A wooden water tank on an iron trestle, standing behind the wall. The legs are wide enough,
   * and rim-lit, to read against the night sky from the road, and they land on a drawn strip of
   * tarred roof (`roofStrip`): a tank with thin dark legs floats.
   */
  tank(cM: number, baseM: number, o: { w?: number; h?: number } = {}): this {
    const { c, r, seed } = this;
    const cx = this.X(cM);
    const yB = this.Y(baseM);
    const w = Math.round((o.w ?? 2.5) * this.tpm);
    const h = Math.round((o.h ?? 2.2) * this.tpm);
    const legs = 28;
    const yLeg = yB - legs;
    const iron = r.stone;
    // Trestle: three heavy posts, two diagonals (a lit edge, a dark one).
    for (const lx of [-w / 2 + 3, 0, w / 2 - 6]) {
      const x0 = cx + Math.round(lx);
      for (let i = 0; i < 6; i++) c.line(x0 + i, yLeg, x0 + i - 1, yB + 2, iron, i === 0 ? 3.6 : i === 5 ? 0.8 : 2);
    }
    for (let i = -1; i <= 1; i++) {
      c.line(cx - w / 2 + 6, yLeg + 3 + i, cx + w / 2 - 8, yB - 6 + i, iron, i === 0 ? 2.4 : 1.2);
      c.line(cx + w / 2 - 6, yLeg + 3 + i, cx - w / 2 + 8, yB - 6 + i, iron, i === 0 ? 2.8 : 1);
    }
    c.rect(cx - w / 2 + 3, yLeg, w - 6, 3, iron, 3);
    this.roofStrip(cx - w / 2 - 6, cx + w / 2 + 6, yB + 2);
    // The barrel: staves, hoops, a conical cap.
    const yT = yLeg - h;
    c.rect(cx - w / 2, yT, w, h, r.wood, 3);
    for (let x = cx - w / 2; x < cx + w / 2; x += 4) c.vline(x + Math.round(hash2(x, 3, seed) * 1), yT, h, r.wood, 2);
    c.rect(cx - w / 2, yT, 3, h, r.wood, 4);
    c.rect(cx + w / 2 - 6, yT, 6, h, r.wood, 1);
    for (const hy of [yT + 5, yT + h / 2 - 2, yT + h - 6]) {
      c.hline(cx - w / 2, hy, w, r.iron, 3);
      c.hline(cx - w / 2, hy + 1, w, r.iron, 1);
    }
    c.frame(cx - w / 2, yT, w, h, r.iron, 1);
    // Cap: a cone, one side catching the moon.
    const capH = Math.round(w * 0.42);
    const pts = [cx - w / 2 - 3, yT, cx + w / 2 + 3, yT, cx + 3, yT - capH, cx - 3, yT - capH];
    c.poly(pts, r.iron, (x, y) => (x + (y - yT) * 0.9 < cx - 3 ? 4 : x > cx + w * 0.22 ? 1 : 2));
    c.hline(cx - w / 2 - 3, yT, w + 6, r.iron, 1);
    return this;
  }

  /** The strip of tarred roof and stubby parapet a tank or a billboard stands on (so it is seen to land). */
  roofStrip(x0: number, x1: number, y: number): this {
    const { c, r } = this;
    for (let x = x0; x < x1; x++) {
      const h = 4 + Math.round(hash2(x >> 3, 5, this.seed + 3) * 3);
      c.rect(x, y, 1, h, r.stone, 2);
      c.set(x, y, r.stone, 3.6);
      c.set(x, y + h - 1, r.stone, 0.8);
    }
    return this;
  }

  /** A TV aerial: mast and elements, a few pixels wide at most. */
  aerial(cM: number, baseM: number, hM = 2.6, tilt = 0): this {
    const { c, r } = this;
    const x0 = this.X(cM);
    const y0 = this.Y(baseM);
    const h = Math.round(hM * this.tpm);
    c.line(x0, y0, x0 + tilt, y0 - h, r.iron, 2);
    for (let i = 0; i < 4; i++) {
      const y = y0 - h + 4 + i * 7;
      const hw = 10 - i * 2;
      c.line(x0 - hw + tilt, y + (i & 1), x0 + hw + tilt, y - (i & 1), r.iron, i === 0 ? 3 : 2);
    }
    return this;
  }

  /** Roof vent / cowl: a small drawn cut-out behind the wall. */
  vent(cM: number, baseM: number): this {
    const { c, r } = this;
    const cx = this.X(cM);
    const yB = this.Y(baseM);
    c.rect(cx - 5, yB - 18, 10, 18, r.iron, 3);
    c.vline(cx - 5, yB - 18, 18, r.iron, 4);
    c.rect(cx + 2, yB - 18, 3, 18, r.iron, 1);
    c.rect(cx - 8, yB - 24, 16, 6, r.iron, 3);
    c.hline(cx - 8, yB - 24, 16, r.iron, 4);
    c.hline(cx - 8, yB - 19, 16, r.iron, 1);
    return this;
  }

  // ─── The wall ─────────────────────────────────────────────────────────────

  /** An end's edge: a pixel or two out, moving every 6 to 10 rows (the hand; a card must not end on a ruler). */
  private edgeJog(y: number, salt: number): number {
    const span = 6 + Math.floor(hash2(salt, 5, this.seed) * 5);
    const seg = Math.floor((y + hash2(salt, 3, this.seed) * span) / span);
    const h = hash2(seg, salt, this.seed + 77);
    return h < 0.3 ? 0 : h < 0.65 ? 1 : h < 0.88 ? 2 : 3;
  }

  /** Cut the card's two ends once the outline is known: the wobble, and the brick toothing up the top third. */
  private carveEnds() {
    if (this.carved) return;
    this.carved = true;
    const { H, x0, x1, top, seed } = this;
    for (let y = 0; y < H; y++) {
      this.endL[y] = Math.max(x0, x0 + this.edgeJog(y, 101) + this.lean(y, 3));
      this.endR[y] = Math.min(x1, x1 - this.edgeJog(y, 103) + this.lean(y, 5));
    }
    // Toothing: pairs of courses cut back 4 to 10 texels, shallowing toward the pier below.
    const tooth = (yt: number, left: boolean) => {
      const salt = left ? 701 : 703;
      const third = Math.round((H - yt) * 0.36);
      for (let y = yt; y < yt + third && y < H; y++) {
        const cn = Math.floor((y - yt) / 4);
        const group = Math.floor(cn / 2);
        const h = hash2(group, salt, seed + 41);
        const step = h < 0.34 ? 4 : h < 0.7 ? 7 : 10;
        const fade = 1 - (y - yt) / third;
        const inset = group & 1 ? Math.round(step * (0.45 + fade * 0.55)) : Math.round(hash2(cn, salt, seed + 43) * 2);
        if (left) this.endL[y] += inset;
        else this.endR[y] -= inset;
      }
    };
    tooth(Math.min(top[x0 + 3], top[x0 + 14]), true);
    tooth(Math.min(top[x1 - 4], top[x1 - 15]), false);
  }

  /** Fill the outline with the wall's base tone. */
  fill(ramp: number = this.r.wall, tone = 3): this {
    this.carveEnds();
    const { c, x0, x1, H } = this;
    for (let x = x0 - 3; x < x1 + 3; x++) {
      for (let y = this.top[x]; y < H; y++) {
        if (x >= this.endL[y] && x < this.endR[y]) c.set(x, y, ramp, tone);
      }
    }
    return this;
  }

  /**
   * Brick drawn as courses and patches. A course is 4 rows, a brick 10 long (a little over life
   * size: 8 × 3 reads as hatching at this distance; bricks that big read as brick): only where the
   * patch field (big soft shapes) passes the threshold is the course drawn, and it thins out to
   * nothing at the patch's edge: between the patches the wall is one flat tone, as an artist
   * leaves it. A brick's mortar is its bottom row and right end, a step down; a few lit, a few dark.
   */
  courses(o: { ramp?: number; x0?: number; x1?: number; y0?: number; y1?: number; density?: number; patch?: number; course?: number; len?: number; salt?: number } = {}): this {
    const { c, seed } = this;
    const ramp = o.ramp ?? this.r.wall;
    const x0 = o.x0 ?? this.x0;
    const x1 = o.x1 ?? this.x1;
    const y0 = o.y0 ?? 0;
    const y1 = o.y1 ?? this.H;
    const COURSE = o.course ?? 4;
    const LEN = o.len ?? 10;
    const salt = o.salt ?? 1;
    const dens = o.density ?? 0.45;
    const pcell = o.patch ?? 70;
    for (let y = Math.floor(y0 / COURSE) * COURSE; y < y1; y += COURSE) {
      const cn = Math.floor(y / COURSE);
      const off = cn & 1 ? LEN >> 1 : 0;
      const band = Math.floor(cn / 6);
      const jog = Math.round(hash2(cn, 17, seed) * 3);
      for (let bx = Math.floor((x0 + off) / LEN) - 1; bx * LEN - off < x1; bx++) {
        const bx0 = bx * LEN - off + jog;
        const cx = bx0 + (LEN >> 1);
        if (cx < x0 || cx >= x1) continue;
        const yy = y + this.sag(cx, band + salt * 7);
        const f = vnoise2(cx, y, pcell, pcell * 0.65, seed + salt * 13);
        const thresh = 1 - dens - 0.08;
        const on = f + (hash2(bx, cn, seed + 21) - 0.5) * 0.28 > thresh;
        if (!on) continue;
        const h = hash2(bx, cn, seed + 37);
        const dt = h < 0.14 ? -1 : h > 0.9 ? 1 : 0;
        for (let x = bx0; x < bx0 + LEN; x++) {
          for (let j = 0; j < COURSE; j++) {
            const yy2 = yy + j;
            if (c.at(x, yy2) !== ramp || !this.inWall(x, yy2)) continue;
            const mortar = j === COURSE - 1 || x === bx0 + LEN - 1;
            c.tone[yy2 * c.w + x] = mortar ? 2 : 3 + dt;
          }
        }
      }
    }
    return this;
  }

  /** Set the wall's brick (drawn last, when the picture knows where its damage and sills are). */
  brick(o: BrickOpts = {}): this {
    this.brickOpts = o;
    return this;
  }

  /**
   * Brick as it is drawn, not as it is built: most of the wall stays one flat tone, the eye's rest
   * for windows and ironwork. Coursed groups of 3 to 8 bricks (highlight on top, shadow under and
   * at the joint) cluster where a painter would put them: the corners, under the sills, round the
   * damage, along the top. `amount` is the share of the wall (0.3 to 0.4).
   */
  brickwork(o: BrickOpts = {}): this {
    const { c, seed, W, H, x0, x1, top, spots } = this;
    if (o.amount === 0) return this;
    const ramp = o.ramp ?? this.r.wall;
    const amount = o.amount ?? 0.35;
    const COURSE = o.course ?? 4;
    const LEN = o.len ?? 10;
    // Where the eye goes, on a coarse grid (cheap: this runs over every picture of the stage).
    const G = 8;
    const gw = Math.ceil(W / G);
    const gh = Math.ceil(H / G);
    const A = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      const y = gy * G + 4;
      for (let gx = 0; gx < gw; gx++) {
        const x = gx * G + 4;
        const yTop = x < W ? top[x] : H;
        if (y < yTop || x < x0 || x >= x1) {
          A[gy * gw + gx] = -9;
          continue;
        }
        let a = Math.max(0, 1 - Math.min(x - x0, x1 - x) / 52) * 0.95;
        a = Math.max(a, Math.max(0, 1 - (y - yTop) / 54) * 0.85);
        a = Math.max(a, Math.max(0, 1 - (H - y) / 40) * 0.4);
        for (const s of spots) {
          const u = (x - s.x) / s.rx;
          const v = (y - s.y) / s.ry;
          a = Math.max(a, 1 - Math.sqrt(u * u + v * v));
        }
        A[gy * gw + gx] = a + (vnoise2(x, y, 76, 52, seed + 13) - 0.42) * 0.62;
      }
    }
    const walls = [...A].filter((v) => v > -9).sort((p, q) => q - p);
    const thresh = walls[Math.min(walls.length - 1, Math.floor(walls.length * amount * 1.08))] ?? 1;
    const tones = c.tone;
    const rampArr = c.ramp;
    for (let y = 0; y < H; y += COURSE) {
      const cn = y / COURSE;
      const off = cn & 1 ? LEN >> 1 : 0;
      let x = x0 + off + Math.floor(hash2(cn, 3, seed + 53) * LEN);
      const band = Math.floor(cn / 6);
      while (x < x1) {
        const gx = Math.min(gw - 1, x >> 3);
        const gy = Math.min(gh - 1, y >> 3);
        if (A[gy * gw + gx] < thresh) {
          x += LEN;
          continue;
        }
        const n = 3 + Math.floor(hash2(x, cn, seed + 51) * 6);
        for (let b = 0; b < n; b++) {
          const bx0 = x + b * LEN;
          const cx = bx0 + (LEN >> 1);
          if (cx >= x1) break;
          const yy = y + this.sag(cx, band + 11);
          const h = hash2(bx0, cn, seed + 37);
          const dv = h < 0.2 ? -0.7 : h > 0.86 ? 0.5 : 0;
          for (let i = 0; i < LEN; i++) {
            for (let j = 0; j < COURSE; j++) {
              const xx = bx0 + i;
              const yr = yy + j;
              if (xx < 0 || xx >= W || yr < 0 || yr >= H) continue;
              const q = yr * W + xx;
              if (rampArr[q] !== ramp || !this.inWall(xx, yr)) continue;
              const d = j === COURSE - 1 || i === LEN - 1 ? -1.3 : j === 0 ? 0.8 : 0;
              tones[q] = Math.max(0, Math.min(5, tones[q] + d + dv));
            }
          }
        }
        x += n * LEN + LEN * (1 + Math.floor(hash2(x, cn, seed + 57) * 3));
      }
    }
    return this;
  }

  /** Shift the tone of a wall-ramp texel. */
  shadeW(x: number, y: number, dt: number, ramp: number = this.r.wall) {
    if (this.c.at(x, y) === ramp) this.c.shift(x, y, dt);
  }

  /** A broad patch of the wall re-laid in `ramp` (ragged edge, a step apart). */
  patch(x0: number, y0: number, w: number, h: number, ramp: number, tone = 3): this {
    const { c, seed } = this;
    for (let y = y0; y < y0 + h; y++) {
      const l = Math.round(hash2(y >> 2, 17, seed + x0) * 6);
      const r = Math.round(hash2(y >> 2, 23, seed + w) * 6);
      for (let x = x0 + l; x < x0 + w - r; x++) {
        if (c.at(x, y) === this.r.wall) c.set(x, y, ramp, tone);
      }
    }
    return this;
  }

  /** Plaster fallen away: a torn hole showing the brick, lit lip on the lower right. */
  bareBrick(cx: number, cy: number, rx: number, ry: number, salt = 0): this {
    const { c, seed, r } = this;
    const inside = (x: number, y: number) => {
      const a = Math.atan2((y - cy) / ry, (x - cx) / rx);
      const rr = 1 + 0.3 * Math.sin(a * 3 + seed + salt) + 0.18 * Math.sin(a * 7 + salt * 2);
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      return u * u + v * v < rr * rr;
    };
    for (let y = cy - ry * 2; y < cy + ry * 2; y++) {
      for (let x = cx - rx * 2; x < cx + rx * 2; x++) {
        if (!inside(x, y) || !this.inWall(x, y)) continue;
        c.set(x, y, r.brick, 3);
      }
    }
    this.courses({ ramp: r.brick, x0: cx - rx * 2, x1: cx + rx * 2, y0: cy - ry * 2, y1: cy + ry * 2, density: 0.95, salt: 7, patch: 30 });
    // The torn lip: dark top-left inside, lit plaster edge at the lower right.
    for (let y = cy - ry * 2; y < cy + ry * 2; y++) {
      for (let x = cx - rx * 2; x < cx + rx * 2; x++) {
        if (inside(x, y)) {
          if (!inside(x - 1, y) || !inside(x, y - 1)) c.shift(x, y, -1.5);
        } else if ((inside(x - 1, y) || inside(x, y - 1)) && this.inWall(x, y)) c.shift(x, y, 1);
      }
    }
    this.spots.push({ x: cx, y: cy, rx: rx * 2.4, ry: ry * 2.4 });
    return this;
  }

  /**
   * A hole knocked through the wall, drawn over the architecture so it CUTS it: cornice, sill and
   * window head stop at its edge. Dark inside with a charred joist, a ragged 2–3 texel inner edge
   * of raw brick, a lit lip on the lower right, rubble staining the wall below it.
   */
  breach(cx: number, cy: number, rx: number, ry: number, o: { salt?: number; lintel?: boolean; rubble?: number } = {}): this {
    const { c, seed, r } = this;
    const salt = o.salt ?? 1;
    const rad = (x: number, y: number) => {
      const a = Math.atan2((y - cy) / ry, (x - cx) / rx);
      const rr = 1 + 0.2 * Math.sin(a * 3 + seed + salt) + 0.12 * Math.sin(a * 5 + salt * 2 + 1);
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      return Math.sqrt(u * u + v * v) / rr;
    };
    const R = 1.6;
    const y0 = Math.floor(cy - ry * R);
    const y1 = Math.ceil(cy + ry * R);
    const x0 = Math.floor(cx - rx * R);
    const x1 = Math.ceil(cx + rx * R);
    // Decided brick by brick (a hole in a wall has the outline of the bricks that have gone),
    // the room behind a shade above black at the bottom so it reads as a room, not a hole in the paper.
    for (let y = y0; y <= y1; y++) {
      const cn = y >> 2;
      for (let x = x0; x <= x1; x++) {
        if (!c.at(x, y)) continue;
        const bx = Math.floor((x + (cn & 1) * 5) / 10);
        const px = bx * 10 + 5 - (cn & 1) * 5;
        const py = cn * 4 + 2;
        const d = rad(px, py) + (hash2(bx, cn, seed + salt * 3) - 0.5) * 0.12;
        if (d > 1.14) continue;
        if (d > 0.93) {
          // A surviving half-brick of the broken edge: its own light, a dark mortar joint.
          const m = (y & 3) === 3 || (x + (cn & 1) * 5) % 10 === 0;
          c.set(x, y, r.brick, m ? 0.9 : 2.1 + (hash2(bx, cn, seed + salt) > 0.55 ? 0.8 : 0));
        } else {
          const low = (y - cy) / ry;
          c.set(x, y, r.ink, 0.45 + (low > 0.3 ? 0.55 : 0) + (hash2(x >> 3, y >> 3, seed + 3) > 0.74 ? 0.4 : 0));
        }
      }
    }
    // Charred joists running back into the dark, not quite parallel.
    for (let i = -1; i <= 1; i++) {
      const ly = cy + ry * (0.15 + i * 0.28);
      c.line(cx - rx * 0.75, ly, cx + rx * 0.65, ly + i * 3, r.wood, 1.1);
    }
    if (o.lintel) {
      // A stone lintel come down into the hole, one end still on its bearing: thick, two-toned, its edge broken.
      const lw = rx * 1.15;
      const a = [cx - lw, cy - ry * 0.55, cx - lw + 7, cy - ry * 0.55 - 7, cx + lw, cy + ry * 0.4 - 7, cx + lw - 6, cy + ry * 0.4];
      c.poly(a, r.stone, 2.4);
      c.line(a[0], a[1], a[6], a[7], r.stone, 0.9);
      c.line(a[2], a[3], a[4], a[5], r.stone, 3.6);
    }
    // Rubble staining down the wall: a few dark runs and flakes of the brick dust.
    const n = o.rubble ?? 7;
    for (let i = 0; i < n; i++) {
      const sx = Math.round(cx - rx * 0.9 + (i / Math.max(1, n - 1)) * rx * 1.8);
      const sy = Math.round(cy + ry * (0.55 + hash2(i, 3, seed) * 0.5));
      const len = 18 + Math.round(hash2(i, 7, seed + salt) * 56);
      for (let j = 0; j < len; j++) {
        const xx = sx + Math.round(Math.sin(j * 0.22 + i) * 1.2);
        if (!this.inWall(xx, sy + j)) continue;
        c.shift(xx, sy + j, j < len * 0.6 ? -1.5 : -0.8);
        if (hash2(xx, sy + j, seed + 9) > 0.86) c.tint(xx, sy + j, r.brick, 0);
      }
    }
    this.spots.push({ x: cx, y: cy, rx: rx * 2.2, ry: ry * 2.2 });
    this.splash.push({ x: cx, s: 0.9 });
    return this;
  }

  /** A wandering crack, lit lip on one side. */
  crack(x: number, y: number, len: number, dir = 1.7, branch = 0.05): this {
    const { c, rng } = this;
    let a = dir;
    let px = x;
    let py = y;
    for (let i = 0; i < len; i++) {
      if (!this.inWall(px, py)) break;
      c.shift(px, py, -1.5);
      c.shift(px + 1, py, 0.8);
      a += (rng.next() - 0.5) * 0.7;
      px += Math.round(Math.cos(a));
      py += Math.max(0, Math.round(Math.sin(a)));
      if (rng.chance(branch)) this.crack(px, py, Math.round(len * 0.4), a + (rng.chance(0.5) ? 0.8 : -0.8), 0);
    }
    return this;
  }

  /** Rain and rust running down from (x, y). */
  streak(x: number, y: number, len: number, dt = -1, width = 1): this {
    this.c.streak(this.rng, x, y, len, dt, 0, width);
    return this;
  }

  /** Scorch going up a wall from a window: a stepped, flame-shaped soot shadow. */
  scorch(cx: number, y: number, w: number, h: number): this {
    const { c, seed } = this;
    this.spots.push({ x: cx, y: y - h * 0.4, rx: w, ry: h * 0.7 });
    this.splash.push({ x: cx, s: 0.5 });
    for (let j = 0; j < h; j++) {
      const t = j / h;
      const hw = Math.round((w / 2) * (1 - t * 0.75 + Math.sin(j * 0.2 + seed) * 0.08));
      for (let x = cx - hw; x <= cx + hw; x++) {
        const edge = Math.abs(x - cx) / Math.max(1, hw);
        const dt = -1 - (t < 0.45 ? 1 : 0) - (edge < 0.5 && t < 0.7 ? 1 : 0);
        if (edge > 0.78 && bayer(x, y - j) > 0.5) continue;
        if (this.inWall(x, y - j)) c.shift(x, y - j, dt);
      }
    }
    return this;
  }

  /** Bullet pocks: small dark clusters, a lit lip below. */
  pocks(x0: number, y0: number, w: number, h: number, n: number): this {
    const { rng } = this;
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.floor(rng.next() * w);
      const y = y0 + Math.floor(rng.next() * h);
      if (!this.inWall(x, y)) continue;
      this.c.shift(x, y, -2);
      this.c.shift(x + 1, y, -1);
      this.c.shift(x, y + 1, 1);
    }
    return this;
  }

  // ─── Architecture ─────────────────────────────────────────────────────────

  /**
   * How a long horizontal is broken: a run of 80 to 110 texels (2.5 to 3.5 m) never goes on
   * unbroken. At each break either a pier interrupts it, the next stretch has dropped 6 to 14
   * texels, or 20 to 40 texels of it are gone and the raw brick shows. Foreshortened, those
   * breaks are what stops a wall's long lines reading as a modelled box.
   */
  private breaks(salt: number): LineBreaks {
    let b = this.runs.get(salt);
    if (b) return b;
    const { W, seed, x0, x1 } = this;
    const dy = new Int8Array(W);
    const st = new Uint8Array(W);
    let x = x0 + 10 + Math.floor(hash2(1, salt, seed + 601) * 40);
    let cur = 0;
    for (let i = 0; x < x1; i++) {
      const len = 80 + Math.floor(hash2(i, salt, seed + 603) * 31);
      const k = hash2(i, salt, seed + 607);
      if (k < 0.34) {
        const pw = 10 + Math.floor(hash2(i, salt, seed + 609) * 5);
        st.fill(1, Math.max(0, x), Math.min(W, x + pw));
        if (cur) cur = 0;
      } else if (k < 0.7) {
        cur = cur ? 0 : 6 + Math.floor(hash2(i, salt, seed + 611) * 9);
      } else {
        const gw = 20 + Math.floor(hash2(i, salt, seed + 613) * 21);
        st.fill(2, Math.max(0, x), Math.min(W, x + gw));
      }
      dy.fill(cur, Math.max(0, x), Math.min(W, x + len));
      x += len;
    }
    b = { dy, st };
    this.runs.set(salt, b);
    return b;
  }

  /** Raw brick where a moulding has fallen away (one column of it, in courses, rough). */
  private rawBand(x: number, y: number, h: number) {
    const { c, r, seed } = this;
    for (let j = 0; j < h; j++) {
      const yy = y + j;
      if (!this.inWall(x, yy)) continue;
      const cn = yy >> 2;
      const mortar = (yy & 3) === 3 || (x + (cn & 1) * 5) % 10 === 0;
      c.set(x, yy, r.brick, mortar ? 1.1 : 2 + (hash2(x >> 3, cn, seed + 33) > 0.7 ? 0.7 : 0));
    }
  }

  /** A pier breaking through a moulding: its block stands forward, lit left, shadow right and under. */
  private linePier(a: number, b: number, y: number, h: number, ramp: number) {
    const { c } = this;
    for (let x = a; x < b; x++) {
      for (let j = -4; j < h + 5; j++) {
        if (!this.inWall(x, y + j)) continue;
        c.set(x, y + j, ramp, x === a ? 3.5 : x === b - 1 ? 1 : j === -4 ? 3.4 : j >= h + 3 ? 1.2 : 2.5);
      }
      c.shift(x, y + h + 5, -1.6);
    }
    for (let j = -4; j < h + 5; j++) c.shift(b, y + j, -1.4);
  }

  /** A horizontal band of `h` rows: the top lit, the bottom shadowed, a cast shadow on the wall under it. Broken like every long line. */
  band(y: number, h: number, ramp: number = this.r.stone, o: { x0?: number; x1?: number; gaps?: [number, number][]; salt?: number; shadow?: number } = {}): this {
    const { c } = this;
    const x0 = o.x0 ?? this.x0;
    const x1 = o.x1 ?? this.x1;
    const salt = o.salt ?? 2;
    const brk = this.breaks(salt + 64);
    const inGap = (x: number) => o.gaps?.some(([a, b]) => x >= a && x < b) ?? false;
    let pier = -1;
    for (let x = x0; x < x1; x++) {
      const st = brk.st[x];
      if (st === 1 && pier < 0) pier = x;
      if (st !== 1 && pier >= 0) {
        this.linePier(pier, x, y + brk.dy[pier], h, ramp);
        pier = -1;
      }
      if (st === 1) continue;
      if (inGap(x) || st === 2) {
        this.rawBand(x, y + brk.dy[x], h + 1);
        continue;
      }
      const yy = y + this.sag(x, salt) + brk.dy[x];
      for (let j = 0; j < h; j++) {
        if (!this.inWall(x, yy + j) && j < h - 1) continue;
        const t = j === 0 ? 3.6 : j === h - 1 ? 1 : 2.8;
        c.set(x, yy + j, ramp, t);
      }
      for (let j = 0; j < (o.shadow ?? 2); j++) this.c.shift(x, yy + h + j, j === 0 ? -1.5 : -0.8);
    }
    return this;
  }

  /**
   * A cornice: lit crown, cove in shadow, frieze with dentils at wandering spacing, a cast
   * shadow on the wall. Broken every 2.5 to 3.5 m like every long line. `gaps` (columns), a
   * bite in the outline and any stretch the wall has lost are where it has fallen off: the
   * band stops with a rough end and the brick shows.
   */
  cornice(y: number, o: { ramp?: number; gaps?: [number, number][]; x0?: number; x1?: number; h?: number; salt?: number } = {}): this {
    const { c, r, seed } = this;
    const ramp = o.ramp ?? r.stone;
    const x0 = o.x0 ?? this.x0 - 3;
    const x1 = o.x1 ?? this.x1 + 3;
    const h = o.h ?? 13;
    const salt = o.salt ?? 2;
    const brk = this.breaks(salt);
    const gone = (x: number) => (o.gaps?.some(([a, b]) => x >= a - 2 && x < b + 2) ?? false) || brk.st[x] === 2 || this.top[x] > y + brk.dy[x] + 3;
    let dx = x0 + 3;
    let pier = -1;
    for (let x = x0; x < x1; x++) {
      const st = brk.st[x];
      if (st === 1 && pier < 0) pier = x;
      if (st !== 1 && pier >= 0) {
        this.linePier(pier, x, y + brk.dy[pier], h, ramp);
        pier = -1;
      }
      if (st === 1) continue;
      if (gone(x)) {
        this.rawBand(x, y + brk.dy[x], h + 3);
        for (let j = 2; j < h + 3; j++) if (this.inWall(x, y + brk.dy[x] + j) && hash2(x, j, seed + 37) > 0.7) this.c.shift(x, y + brk.dy[x] + j, -1);
        continue;
      }
      const yy = y + this.sag(x, salt) + brk.dy[x];
      for (let j = 0; j < h; j++) {
        // crown | cove | fillet | frieze | bed mould
        let t: number;
        if (j === 0) t = 4;
        else if (j === 1) t = 3;
        else if (j <= 4) t = 2 + (j === 2 ? 1 : 0) - (j === 4 ? 1 : 0);
        else if (j === 5) t = 4;
        else if (j <= h - 3) t = 3;
        else t = j === h - 1 ? 0 : 1;
        // End caps fade darker.
        if (x < x0 + 2 || x >= x1 - 2) t = Math.max(0, t - 1);
        c.set(x, yy + j, ramp, t);
      }
      // Dentils: small blocks hanging under the frieze, spaced by hand.
      const dj = h - 4;
      if (x >= dx && x < dx + 5) {
        for (let j = 0; j < 3; j++) c.set(x, yy + dj + j, ramp, x === dx ? 4 : x === dx + 4 ? 1 : 3);
        for (let j = 3; j < 5; j++) this.c.shift(x, yy + dj + j, -1.5);
      }
      if (x === dx + 4) dx += 9 + Math.round(hash2(x, 3, seed) * 3);
      // Cast shadow under the moulding: two rows, the second ragged.
      this.c.shift(x, yy + h, -2);
      if (hash2(x >> 1, 9, seed) > 0.35) this.c.shift(x, yy + h + 1, -1);
    }
    return this;
  }

  /** Coping along the outline: a stone cap following `top[]` (not through gaps). */
  coping(ramp: number = this.r.stone, h = 3, gaps?: [number, number][]): this {
    const { c } = this;
    const inGap = (x: number) => gaps?.some(([a, b]) => x >= a && x < b) ?? false;
    for (let x = this.x0; x < this.x1; x++) {
      if (inGap(x)) continue;
      const y = this.top[x];
      if (y >= this.H) continue;
      for (let j = 0; j < h; j++) c.set(x, y + j, ramp, j === 0 ? 4 : j === h - 1 ? 1 : 3);
      this.c.shift(x, y + h, -1.5);
      this.c.shift(x, y + h + 1, -0.8);
    }
    return this;
  }

  /**
   * A bay recessed in the wall: its inside a tone or two down, a hard shadow cast down the side
   * and along the head by what stands in front of it. Draw the window rows over it afterwards.
   */
  recess(x0: number, x1: number, y0: number, y1: number): this {
    const { c, seed } = this;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!this.inWall(x, y)) continue;
        const head = y - y0 < 10 + Math.floor(vnoise(x, 12, seed + 91) * 5);
        const side = x - x0 < 8;
        c.shift(x, y, head || side ? -2 : -1);
      }
    }
    // The recess's reveals: a lit return on the right, a dark edge on the left.
    for (let y = y0; y < y1; y++) {
      c.shift(x1 - 1 + this.lean(y, 9), y, 1.6);
      c.shift(x0 + this.lean(y, 9), y, -1);
    }
    return this;
  }

  /** A round arch through the wall from the street up, dark inside, stone voussoirs round it, a dim lamp far down the passage. */
  archway(cx: number, yTop: number, halfW: number, h: number): this {
    const { c, r } = this;
    const yFoot = yTop + h;
    const hw = halfW;
    for (let y = yTop; y < yFoot; y++) {
      const v = (y - yTop) / Math.max(1, hw * 0.9);
      const span = v >= 1 ? hw : Math.round(hw * Math.sqrt(Math.max(0, 1 - (1 - v) * (1 - v))));
      for (let x = cx - span - 3; x <= cx + span + 3; x++) {
        const inside = Math.abs(x - cx) <= span;
        if (inside) c.set(x, y, r.ink, 0.5 + (y > yFoot - 16 ? 0.6 : 0));
      }
    }
    // Voussoirs.
    for (let a = 0; a <= 16; a++) {
      const t = (a / 16) * Math.PI;
      const ox = cx + Math.cos(Math.PI - t) * (hw + 5);
      const oy = yTop + hw * 0.9 - Math.sin(t) * (hw * 0.9 + 5);
      const n = 9 - Math.abs(a - 8) * 0.2;
      c.line(ox, oy, ox + Math.cos(Math.PI - t) * n, oy - Math.sin(t) * n, r.stone, a % 2 ? 3.4 : 2.6);
    }
    c.rect(cx - 5, yTop - 8, 10, 14, r.stone, 3.6);
    c.vline(cx - 5, yTop - 8, 14, r.stone, 4.2);
    c.vline(cx + 4, yTop - 8, 14, r.stone, 1.4);
    // Jambs.
    for (const s of [-1, 1]) {
      for (let y = yTop + Math.round(hw * 0.9); y < yFoot; y++) {
        const xe = cx + s * (hw + 1) + this.lean(y, 7);
        for (let i = 0; i < 7; i++) c.set(xe + s * i, y, r.stone, (y >> 3) & 1 ? 2.8 : 3.4);
      }
    }
    // The far end of the passage: a lit yard seen through it, its floor line, a dim lamp high up.
    const yf = yFoot - 16;
    c.rect(cx - 12, yf - 56, 24, 56, r.alt, 1.3);
    c.hline(cx - 12, yf - 1, 24, r.stone, 2);
    c.ellipse(cx + 3, yf - 44, 3, 3, r.lamp, 3, PWF.GLOW);
    for (let i = 0; i <= 12; i++) c.set(cx - 12 - i, yf + Math.round(i * 0.8), r.stone, 1.3);
    for (let i = 0; i <= 12; i++) c.set(cx + 12 + i, yf + Math.round(i * 0.8), r.stone, 1.3);
    return this;
  }

  /**
   * A three-sided oriel on brackets, carried up the wall between `yBase` (the street end, y larger)
   * and `yTop`, `wTex` wide: lit centre light, one curtain, a dark side, a little roof over it.
   */
  oriel(cx: number, yBase: number, yTop: number, wTex: number, kinds: WinKind[]): this {
    const { c, r } = this;
    const hw = wTex >> 1;
    for (let y = yTop; y < yBase; y++) {
      for (let x = cx - hw; x < cx + hw; x++) {
        const u = (x - cx) / hw;
        // Three planes: left shaded, centre lit, right darker.
        const t = u < -0.55 ? 1.9 : u > 0.55 ? 1.4 : 3;
        c.set(x, y, r.stone, t);
      }
    }
    for (let x = cx - hw - 3; x < cx + hw + 3; x++) {
      c.set(x, yTop, r.stone, 4);
      c.set(x, yTop + 1, r.stone, 3.2);
      c.shift(x, yBase, -1.4);
      c.shift(x, yBase + 1, -0.9);
    }
    // Brackets under it.
    for (const s of [-1, 0, 1]) {
      const bx = cx + s * (hw - 6);
      c.poly([bx - 5, yBase, bx + 5, yBase, bx + 2, yBase + 14, bx - 2, yBase + 14], r.stone, 2.6);
    }
    // Lead cap.
    c.poly([cx - hw - 3, yTop, cx - hw + 12, yTop - 10, cx + hw - 12, yTop - 10, cx + hw + 3, yTop], r.iron, (x) => (x < cx ? 3 : 1.8));
    c.hline(cx - hw + 12, yTop - 10, wTex - 24, r.iron, 3.6);
    const paneH = yBase - yTop - 16;
    this.window(cx - hw + 8, yTop + 8, 20, paneH, kinds[0], { head: 'none', sill: false });
    this.window(cx - 18, yTop + 8, 36, paneH, kinds[1], { head: 'none', sill: false });
    this.window(cx + hw - 28, yTop + 8, 20, paneH, kinds[2], { head: 'none', sill: false });
    return this;
  }

  /** A round corner turret drawn up the end of the wall from the street to a cap above the roofline, windows on the round. */
  turret(cx: number, rw: number, yFoot: number, yTop: number): this {
    const { c, r, k } = this;
    const hw = rw >> 1;
    const slate = k.ramp(0x3a4250, { light: 0.32, sat: 0.7, dark: 0.45 });
    const copper = k.ramp(0x6aa080, { light: 0.34, sat: 0.8, dark: 0.45 });
    const yCap = yTop + Math.round((yFoot - yTop) * 0.12);
    for (let y = yCap; y < yFoot; y++) {
      for (let x = cx - hw; x <= cx + hw; x++) {
        const u = (x - cx) / hw;
        const t = u < -0.8 ? 1.6 : u < -0.4 ? 3.3 : u < 0.2 ? 2.8 : u < 0.65 ? 2 : 1.2;
        c.set(x, y, r.stone, t + ((y >> 2) & 1 ? 0.15 : -0.1));
      }
    }
    for (let x = cx - hw - 4; x <= cx + hw + 4; x++) {
      c.set(x, yCap, r.stone, 4);
      c.set(x, yCap + 1, r.stone, 3);
      c.shift(x, yCap + 2, -1.6);
    }
    // Windows around it: each floor one tall one on the turret's face.
    for (let y = yFoot - 150; y > yCap + 50; y -= 102) this.window(cx - 13, y - 58, 26, 58, y < yFoot - 300 ? 'lit' : 'dark', { head: 'arch', sill: true });
    // Conical slated cap and the finial.
    const cone = yCap - yTop;
    for (let y = yTop; y < yCap; y++) {
      const w2 = Math.round(hw * ((y - yTop) / cone) * 1.1);
      for (let x = cx - w2; x <= cx + w2; x++) {
        const u = (x - cx) / Math.max(1, w2);
        const band = ((y - yTop + ((x >> 2) & 1) * 2) >> 2) & 1 ? 0.3 : -0.2;
        c.set(x, y, slate, (u < -0.5 ? 3.4 : u < 0.2 ? 2.4 : 1.4) + band);
      }
    }
    c.vline(cx, yTop - 12, 12, copper, 3.4);
    c.ellipse(cx, yTop - 12, 3, 3, copper, 3.6);
    c.hline(cx - 4, yTop - 3, 9, copper, 2.4);
    return this;
  }

  /** Vertical stone pilaster or quoin strip, `w` texels wide, leaning with the wall. */
  pilaster(x: number, y0: number, y1: number, w: number, ramp: number = this.r.stone): this {
    const { c } = this;
    for (let y = y0; y < y1; y++) {
      const xx = x + this.lean(y, 7);
      for (let i = 0; i < w; i++) {
        c.set(xx + i, y, ramp, i === 0 ? 4 : i === w - 1 ? 1 : 3);
      }
      c.shift(xx + w, y, -1.5);
      c.shift(xx + w + 1, y, -0.8);
    }
    return this;
  }

  // ─── Windows ──────────────────────────────────────────────────────────────

  /**
   * One upper-storey window, drawn: surround, recess, sashes and its own story. (x, y) = the
   * opening's top-left; w × h its size. `head`: stone lintel, a flat brick arch or a pediment hood.
   */
  window(x: number, y: number, w: number, h: number, kind: WinKind, o: { head?: 'lintel' | 'arch' | 'hood' | 'none'; sill?: boolean; v?: number; tilt?: number } = {}): this {
    const { c, r, seed } = this;
    const v = o.v ?? Math.floor(hash2(x, y, seed + 41) * 1000);
    const head = o.head ?? 'lintel';
    this.spots.push({ x: x + w / 2, y: y + h + 9, rx: w * 0.95, ry: 15 });
    // Surround: a shadow halo on the wall round the opening, then the head and the sill.
    this.halo(x - 2, y - 2, w + 4, h + 4);
    this.windowHead(x, y, w, head, v);
    // The opening: a recess, its top and left reveals in shadow.
    c.rect(x, y, w, h, r.ink, 1);
    this.glass(x + 3, y + 3, w - 6, h - 6, kind, v);
    this.sashes(x, y, w, h, kind, v);
    // The reveal's shadow falls across the top of the frame.
    for (let i = 0; i < w; i++) c.shift(x + i, y + 1, -1);
    for (let i = 0; i < h; i++) c.shift(x + 1, y + i, -0.6);
    if (o.sill !== false) this.sill(x, y + h, w, v);
    // Rain has run down from the corners of the sill on about half of them.
    if (o.sill !== false && hash2(v, 3, seed) > 0.4) {
      const sx = x + Math.round(hash2(v, 5, seed) * w);
      this.streak(sx, y + h + 5, 18 + Math.round(hash2(v, 7, seed) * 34));
    }
    return this;
  }

  private halo(x: number, y: number, w: number, h: number) {
    const { c } = this;
    for (let j = 0; j < h; j++) {
      c.shift(x, y + j, -0.7);
      c.shift(x + w - 1, y + j, -0.7);
    }
    for (let i = 0; i < w; i++) {
      c.shift(x + i, y, -0.7);
      c.shift(x + i, y + h - 1, -0.7);
    }
  }

  private windowHead(x: number, y: number, w: number, head: 'lintel' | 'arch' | 'hood' | 'none', v: number) {
    const { c, r } = this;
    if (head === 'none') return;
    if (head === 'lintel') {
      c.rect(x - 3, y - 6, w + 6, 5, r.stone, 3);
      c.hline(x - 3, y - 6, w + 6, r.stone, 4);
      c.hline(x - 3, y - 2, w + 6, r.stone, 1);
      c.vline(x - 3, y - 6, 5, r.stone, 4);
      c.vline(x + w + 2, y - 6, 5, r.stone, 1);
      for (let i = 0; i < w + 6; i++) if (hash2(i >> 1, v, 3) > 0.55) c.shift(x - 3 + i, y - 1, -1);
      return;
    }
    if (head === 'arch') {
      // Soldier bricks in a shallow arch, a keystone in the middle.
      const hw = Math.round(w / 2) + 3;
      const cx = x + w / 2;
      for (let i = -hw; i <= hw; i++) {
        const lift = Math.round((1 - (i / hw) * (i / hw)) * 3);
        const col = x + w / 2 + i;
        for (let j = 0; j < 6; j++) {
          const yy = y - 7 - lift + j;
          const b = Math.floor((i + 100) / 3);
          const t = hash2(b, 2, v) > 0.6 ? 2 : 3;
          c.set(col, yy, j === 0 ? r.stone : r.brick, j === 0 ? 4 : (i + 100) % 3 === 0 ? 1 : t);
        }
        c.shift(col, y - 1 - lift, -1.2);
      }
      c.rect(cx - 2, y - 11, 5, 9, r.stone, 3);
      c.vline(cx - 2, y - 11, 9, r.stone, 4);
      c.vline(cx + 2, y - 11, 9, r.stone, 1);
      c.hline(cx - 2, y - 11, 5, r.stone, 4);
      return;
    }
    // Hood: a small pediment on two corbels.
    const px = x - 5;
    const pw = w + 10;
    c.rect(px, y - 5, pw, 5, r.stone, 3);
    c.hline(px, y - 5, pw, r.stone, 4);
    c.hline(px, y - 1, pw, r.stone, 1);
    for (let i = 0; i < pw; i++) {
      const d = Math.abs(i - pw / 2);
      const up = Math.round(Math.max(0, 7 - (d / pw) * 16));
      for (let j = 1; j <= up; j++) c.set(px + i, y - 5 - j, r.stone, j === up ? 4 : 3);
    }
    for (const sx of [px + 2, px + pw - 5]) {
      c.rect(sx, y, 3, 4, r.stone, 3);
      c.hline(sx, y + 3, 3, r.stone, 1);
    }
    for (let i = 0; i < pw; i++) c.shift(px + i, y, -1.2);
  }

  private sill(x: number, y: number, w: number, v: number) {
    const { c, r } = this;
    const lx = x - 3;
    const lw = w + 6;
    c.rect(lx, y, lw, 3, r.stone, 3);
    c.hline(lx, y, lw, r.stone, 4);
    c.hline(lx, y + 2, lw, r.stone, 1);
    c.set(lx, y + 1, r.stone, 4);
    c.set(lx + lw - 1, y + 1, r.stone, 1);
    for (let i = 0; i < lw; i++) {
      c.shift(lx + i, y + 3, -1.5);
      if (hash2(i >> 1, v, 4) > 0.3) c.shift(lx + i, y + 4, -1);
    }
    // A chipped sill now and then.
    if (hash2(v, 9, 3) > 0.7) {
      const cx = lx + 3 + Math.round(hash2(v, 11, 3) * (lw - 8));
      c.rect(cx, y, 3, 2, r.ink, 1);
    }
  }

  /** The two sashes of a window (frame paint over the glass; meeting rail near the middle). */
  private sashes(x: number, y: number, w: number, h: number, kind: WinKind, v: number) {
    const { c, r } = this;
    if (kind === 'boarded' || kind === 'bricked') return;
    const f = r.frame;
    const meet = y + Math.round(h * (0.44 + hash2(v, 1, 5) * 0.06));
    // Frame: dull paint, one highlight row on the top rail and the left stile only.
    c.rect(x + 1, y + 1, w - 2, 2, f, 2.2);
    c.rect(x + 1, y + h - 3, w - 2, 2, f, 1.6);
    c.rect(x + 1, y + 1, 2, h - 2, f, 2.2);
    c.rect(x + w - 3, y + 1, 2, h - 2, f, 1.6);
    c.hline(x + 1, y + 1, w - 2, f, 3.2);
    c.vline(x + 1, y + 1, h - 2, f, 3);
    // Meeting rail, its underside dark.
    c.hline(x + 3, meet, w - 6, f, 3.2);
    c.hline(x + 3, meet + 1, w - 6, f, 2.2);
    c.hline(x + 3, meet + 2, w - 6, f, 0.6);
    // Glazing bars: two-over-two on most (some single panes, one lost its bar).
    if (hash2(v, 2, 5) > 0.3 && kind !== 'broken') {
      const mx = x + Math.round(w / 2) + Math.round((hash2(v, 3, 5) - 0.5) * 2);
      c.vline(mx, y + 3, meet - y - 3, f, 2);
      if (hash2(v, 4, 5) > 0.45) c.vline(mx, meet + 3, y + h - 3 - meet - 3, f, 2);
    }
    // Paint gone from the frame in places: a pixel or two of raw wood.
    for (let i = 0; i < 4; i++) {
      const fx = x + 1 + Math.floor(hash2(v, 10 + i, 7) * (w - 2));
      const fy = y + 1 + Math.floor(hash2(v, 20 + i, 7) * 2);
      c.set(fx, fy, r.wood, 2);
    }
  }

  /** The pane area of a window: (x, y, w, h) inside the frame. */
  private glass(x: number, y: number, w: number, h: number, kind: WinKind, v: number) {
    const { c, r, k } = this;
    const G = PWF.GLOW;
    if (kind === 'boarded') {
      // Boards: 3–5 planks nailed across, not one sheet; a gap or two shows the dark.
      const n = 4 + (v % 2);
      let yy = y - 1;
      for (let i = 0; i < n && yy < y + h; i++) {
        const ph = 7 + Math.round(hash2(v, i, 1) * 4);
        const tilt = (hash2(v, i, 2) - 0.5) * 4;
        const tone = 2.5 + hash2(v, i, 3) * 1.5;
        for (let px = x - 2; px < x + w + 2; px++) {
          const off = Math.round((tilt * (px - x)) / w);
          for (let j = 0; j < ph; j++) {
            const t = j === 0 ? tone + 1 : j === ph - 1 ? 1 : tone;
            c.set(px, yy + off + j, r.wood, t);
          }
        }
        // Nails and a split.
        c.set(x, yy + 3, r.iron, 4);
        c.set(x + w - 2, yy + 4, r.iron, 4);
        if (hash2(v, i, 5) > 0.5) c.hline(x + 4 + (i * 3) % 9, yy + 3 + (i & 1), 8, r.wood, 1);
        yy += ph + (hash2(v, i, 7) > 0.7 ? 2 : 1);
      }
      // A diagonal brace on some.
      if (v % 3 === 0) {
        c.line(x, y + h - 2, x + w - 1, y + 2, r.wood, 4);
        c.line(x, y + h - 1, x + w - 1, y + 3, r.wood, 1);
      }
      return;
    }
    if (kind === 'bricked') {
      c.rect(x - 2, y - 2, w + 4, h + 4, r.mortar, 3);
      this.courses({ ramp: r.mortar, x0: x - 2, x1: x + w + 2, y0: y - 2, y1: y + h + 2, density: 0.9, salt: 11, patch: 20 });
      return;
    }
    if (kind === 'ac') {
      this.glass(x, y, w, h, 'dark', v);
      const ay = y + h - 16;
      c.rect(x + 1, ay, w - 2, 16, r.iron, 3);
      c.hline(x + 1, ay, w - 2, r.iron, 4);
      for (let i = 0; i < 4; i++) c.hline(x + 3, ay + 4 + i * 3, w - 6, r.iron, 1);
      return;
    }
    const lit = kind === 'lit' || kind === 'curtain' || kind === 'blind' || kind === 'figure' || kind === 'tv';
    if (lit) {
      // A dim room behind it: never a flat yellow pane. The body of the window is the deep warm
      // tone, with the light only where a lamp hangs (a small bright core), wallpaper dashes, shadows of furniture.
      const tv = kind === 'tv';
      const tvR = k.ramp(0x3f5f94, { light: 0.34 });
      const body = tv ? tvR : r.lampDeep;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const d = (i & 3) === 1 && ((j + (i >> 2)) & 7) < 5 ? 0.5 : 0;
          c.set(x + i, y + j, body, (j < h * 0.45 ? 3 : 2.3) + d, G);
        }
      }
      // The lamp's pool: an ellipse of lit wall, its core small and warm.
      const lx = x + Math.round(w * (0.3 + hash2(v, 1, 9) * 0.4));
      const ly = y + Math.round(h * 0.28);
      if (tv) {
        c.rect(x + 3, y + h - 15, w - 6, 13, tvR, 2, G);
        c.rect(x + 6, y + h - 12, w - 12, 8, tvR, 3.6, G);
      } else {
        c.ellipse(lx, ly, w * 0.42, h * 0.36, r.lamp, 2.6, G);
        c.ellipse(lx, ly, w * 0.26, h * 0.2, r.lamp, 3.6, G);
        c.rect(lx - 2, y, 5, 8, r.ink, 1, G);
        c.ellipse(lx, y + 9, 4, 2, r.lamp, 4.6, G);
      }
      // Furniture, a picture, a figure's shadow: one of a handful.
      const u = v % 5;
      if (u === 0) {
        c.rect(x + 3, y + 8, 7, 10, r.lampDeep, 1, G);
        c.frame(x + 2, y + 7, 9, 12, r.ink, 1, G);
      } else if (u === 1) {
        c.rect(x + 2, y + h - 12, 11, 12, r.ink, 0.6, G);
        c.hline(x + 2, y + h - 12, 11, r.lampDeep, 2.4, G);
      } else if (u === 2) {
        for (let i = 0; i < 5; i++) c.rect(x + w - 12, y + 9 + i * 7, 8, 5, r.lampDeep, 1.2 + (i & 1) * 0.8, G);
      } else if (u === 3) {
        // A plant on a sill.
        c.ellipse(x + w * 0.7, y + h - 12, 6, 6, r.ink, 1, G);
        c.rect(x + w * 0.7 - 3, y + h - 7, 6, 7, r.wood, 2, G);
      }
      if (kind === 'curtain') {
        const hl = Math.round(w * 0.3 + hash2(v, 2, 9) * 3);
        const hr = Math.round(w * 0.22 + hash2(v, 3, 9) * 3);
        const cramp = v % 2 ? r.curtain : r.curtainB;
        for (let j = 0; j < h; j++) {
          const sway = Math.round(Math.sin(j * 0.21 + v) * 1.4);
          for (let i = 0; i < hl + sway; i++) c.set(x + i, y + j, cramp, (j < 4 ? 2.6 : 1.6) + ((i + 2) % 4 === 0 ? 1.2 : 0), G);
          for (let i = 0; i < hr - sway; i++) c.set(x + w - 1 - i, y + j, cramp, (j < 4 ? 2.6 : 1.5) + ((i + 1) % 4 === 0 ? 1.2 : 0), G);
        }
        c.hline(x, y + 1, w, r.ink, 1, G);
      } else if (kind === 'blind') {
        const down = Math.round(h * (0.5 + hash2(v, 5, 9) * 0.3));
        for (let j = 0; j < down; j++) c.hline(x, y + j, w, r.lampDeep, j % 3 === 2 ? 1 : 2.2, G);
        c.hline(x, y + down, w, r.ink, 0.5, G);
        c.rect(x + w * 0.5 - 1, y + down, 2, 3, r.stone, 3, G);
      } else if (kind === 'figure') {
        const fx = x + Math.round(w * (0.42 + hash2(v, 6, 9) * 0.2));
        const by = y + h - 1;
        c.ellipse(fx, y + h * 0.42, 5, 6, r.ink, 0.4, G);
        c.poly([fx - 10, by, fx - 7, y + h * 0.56, fx + 7, y + h * 0.56, fx + 11, by], r.ink, 0.4, G);
        c.rect(fx + 8, y + h * 0.28, 3, 7, r.ink, 0.4, G);
        c.rect(fx + 7, y + h * 0.38, 3, 9, r.ink, 0.4, G);
        c.rect(fx - 11, y + h * 0.5, 3, 7, r.ink, 0.4, G);
        c.rect(x + w * 0.2, y + h * 0.3, 2, 8, r.lamp, 4, G);
      }
      return;
    }
    // Unlit panes: the night in them — near black, one low moon streak across a single pane, the odd
    // torn blind or cardboard square. (Bright reflections read as repeated stickers.)
    const dark = kind !== 'moon';
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const t = dark ? 0.9 + (j < 5 ? -0.3 : 0.15 * ((i + (j >> 2)) & 1)) : 2.2 - (j / h) * 1.3;
        c.set(x + i, y + j, r.glassDark, t);
      }
    }
    {
      const p = hash2(v, 41, 3) > 0.5 ? 0 : 1;
      const py0 = y + (p * h) / 2 + 2;
      const py1 = y + ((p + 1) * h) / 2 - 2;
      const bx = Math.round(hash2(v, 43, 3) * Math.max(1, w - 6));
      for (let j = Math.floor(py0); j < py1; j++) {
        const c0 = bx + Math.round((j - py0) * 0.6);
        const sw = 2 + (j % 11 < 3 ? 1 : 0);
        for (let i = 0; i < sw; i++) c.set(x + ((c0 + i) % w), j, r.glassSky, dark ? 1.3 : 2.6);
      }
    }
    if (kind === 'broken') {
      c.rect(x, y, w, h, r.ink, 0.5);
      const n = 11;
      for (let i = 0; i < n; i++) {
        const side = i % 4;
        const px = side === 1 ? x + w - 1 : side === 3 ? x : x + Math.floor(hash2(v, i, 11) * w);
        const py = side === 0 ? y : side === 2 ? y + h - 1 : y + Math.floor(hash2(v, i, 13) * h);
        const ex = x + w / 2 + (hash2(v, i, 17) - 0.5) * w * 0.6;
        const ey = y + h / 2 + (hash2(v, i, 19) - 0.5) * h * 0.6;
        c.poly([px, py, px + 3, py, ex, ey], r.glassSky, i % 3 === 0 ? 3.6 : 1.6);
      }
      const hx = x + Math.round(hash2(v, 2, 19) * (w - 8));
      for (let j = 0; j < h * 0.75; j++) {
        const sw = 5 + Math.round(Math.sin(j * 0.3) * 1.2);
        for (let i = 0; i < sw; i++) c.set(hx + i, y + j, r.curtainB, i === 0 ? 1 : 2 - (i & 1));
      }
      return;
    }
    // A torn blind or a square of cardboard taped in a pane, on some.
    const w2 = v % 4;
    if (w2 === 1) {
      const down = Math.round(h * 0.3 + hash2(v, 3, 7) * 12);
      for (let j = 0; j < down; j++) for (let i = (j >> 2) & 1 ? 0 : 1; i < w; i += 3) c.set(x + i, y + j, r.curtainB, 1 + ((j + i) % 5 === 0 ? 1 : 0));
    } else if (w2 === 2) {
      const py = y + h - 16;
      c.rect(x + 3, py, w - 6, 13, r.wood, 2.6);
      c.frame(x + 3, py, w - 6, 13, r.wood, 3.6);
      c.hline(x + 6, py + 5, w - 12, r.wood, 1.4);
    }
    if (hash2(v, 7, 3) > 0.75) {
      const cx = x + 4 + Math.floor(hash2(v, 8, 3) * (w - 8));
      const cy = y + 4 + Math.floor(hash2(v, 9, 3) * (h - 8));
      const shape = v % 3;
      if (shape === 0) {
        for (let a = 0; a < 5; a++) {
          const ang = (a / 5) * 6.28 + hash2(v, a, 21);
          c.line(cx, cy, cx + Math.round(Math.cos(ang) * (3 + (a % 3) * 3)), cy + Math.round(Math.sin(ang) * (3 + (a % 3) * 3)), r.glassSky, 2.4);
        }
      } else if (shape === 1) {
        // One long crack from a corner, with a fork.
        c.line(x, y + 3, cx, cy, r.glassSky, 2.4);
        c.line(cx, cy, x + w - 2, cy + 6, r.glassSky, 2);
        c.line(cx, cy, cx - 3, y + h - 2, r.glassSky, 2);
      } else {
        // A corner gone, a dark triangle with a lit edge.
        c.poly([x + w - 1, y, x + w - 1, y + 14, x + w - 15, y], r.ink, 0.3);
        c.line(x + w - 1, y + 14, x + w - 15, y, r.glassSky, 2.6);
      }
    }
  }

  // ─── Value structure: the picture's own light ─────────────────────────────

  /**
   * A broad shift of the whole picture: `field` (x, y) in steps-to-add (0 = untouched, fractional
   * values round to WHOLE tones). Dither appears only in the seam between two whole tones, a few
   * texels wide (`seam`, in tone units), never as a screen-door over the wall.
   */
  value(field: (x: number, y: number) => number, strength: number, seam = 0.14): this {
    const { c, W, H } = this;
    const sign = Math.sign(strength);
    const abs = Math.abs(strength);
    const w2 = (W + 1) >> 1;
    if (!this.wob) {
      // (Per picture, and at half resolution: the same hand-shaped edge at a fraction of the cost.)
      const h2 = (H + 1) >> 1;
      const t = new Float32Array(w2 * h2);
      for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) t[y * w2 + x] = (vnoise2(x * 2, y * 2, 9, 7, this.seed + 401) - 0.5) * 0.22;
      this.wob = t;
    }
    const wob = this.wob;
    const { ramp, flag, tone } = c;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!ramp[i] || flag[i] & PWF.GLOW) continue;
        const f = field(x, y) * abs;
        if (f <= 0) continue;
        const whole = Math.floor(f);
        // Whole tones with a hand-shaped edge: a slow wobble moves the threshold, and only a
        // hair's width at the edge is dithered, however gentle the gradient is.
        const v = f - whole + wob[(y >> 1) * w2 + (x >> 1)];
        const up = v > 0.5 + seam * 0.16 ? 1 : v < 0.5 - seam * 0.16 ? 0 : bayer(x, y) < 0.5 ? 1 : 0;
        const step = whole + up;
        if (step) tone[i] = Math.max(0, Math.min(5, tone[i] + sign * step));
      }
    }
    return this;
  }

  /**
   * Everything that goes on last because it depends on what the picture holds: the brick (it
   * clusters round the damage and under the sills), the torn edges of what has been bitten away,
   * the card's two drawn ends.
   */
  finish(): this {
    if (this.finished) return this;
    this.finished = true;
    this.brickwork(this.brickOpts);
    this.dressBites();
    this.dressEnd(true);
    this.dressEnd(false);
    return this;
  }

  /** The torn edge of a bite or a fallen storey: a dark inner lip of raw brick, stains under it, joist stumps. */
  private dressBites() {
    const { c, r, seed } = this;
    for (const { x0, x1 } of this.bites) {
      for (let x = x0; x < x1; x++) {
        const y0 = this.top[x];
        const d = 2 + Math.round(hash2(x >> 2, 3, seed + 81) * 2);
        for (let j = 0; j < d; j++) if (this.inWall(x, y0 + j)) c.set(x, y0 + j, r.brick, j === 0 ? 1.1 : 1.9 + (hash2(x, j, seed + 83) > 0.7 ? 0.8 : 0));
        c.shift(x, y0 + d, -1);
      }
      for (let x = x0 + 4; x < x1 - 3; x += 7 + Math.floor(hash2(x, 5, seed + 87) * 11)) {
        const len = 14 + Math.floor(hash2(x, 9, seed + 87) * 44);
        const y0 = this.top[x] + 3;
        for (let j = 0; j < len; j++) if (this.inWall(x, y0 + j)) c.shift(x, y0 + j, j < len * 0.6 ? -1.4 : -0.7);
      }
    }
    for (const { x0, x1 } of this.joists) {
      for (let x = x0 + 12; x < x1 - 8; x += 26 + Math.floor(hash2(x, 3, seed + 93) * 30)) {
        const y0 = this.top[x] + 4;
        const len = 12 + Math.floor(hash2(x, 7, seed + 93) * 16);
        const slant = Math.round((hash2(x, 11, seed + 93) - 0.5) * 8);
        c.line(x, y0, x + slant, y0 - len, r.wood, 1.8);
        c.line(x + 1, y0, x + slant + 1, y0 - len, r.wood, 0.9);
      }
    }
  }

  /** One end of the card: a pier or stone return with its side in shadow, plinth at the foot (the toothing above it is cut out of the outline). */
  private dressEnd(left: boolean) {
    const { c, r, H, seed, x0, x1, top } = this;
    const kind = left ? this.sideL : this.sideR;
    const salt = left ? 811 : 813;
    const stone = kind === 'stone';
    const ramp = stone ? r.stone : r.wall;
    const sideRamp = r.soot;
    const pw = 12 + Math.floor(hash2(salt, 3, seed) * 8);
    const yt = Math.min(top[left ? x0 + 3 : x1 - 4], top[left ? x0 + 14 : x1 - 15]);
    const y0 = yt + Math.round((H - yt) * 0.36);
    const dir = left ? 1 : -1;
    const span = 14 + Math.floor(hash2(salt, 5, seed) * 10);
    for (let y = y0; y < H; y++) {
      const xe = left ? this.endL[y] : this.endR[y] - 1;
      const n = y >= H - 18 ? pw + 3 : pw;
      const joint = (y - y0) % span === 0 && hash2(y, salt, seed + 7) > 0.3;
      for (let i = 0; i < n; i++) {
        const x = xe + dir * i;
        if (!this.inWall(x, y) || c.flag[y * c.w + x] & PWF.GLOW) continue;
        if (i < 4) c.set(x, y, sideRamp, i === 0 ? 0.7 : 1.5 + (i === 3 ? 0.6 : 0) + (joint ? -0.6 : 0));
        else if (i === 4) c.set(x, y, ramp, 3.9);
        else if (i === n - 1) c.shift(x, y, -1.2);
        else c.set(x, y, ramp, (y === H - 18 ? 3.6 : joint ? 1.8 : 2.9) + (i > n * 0.7 ? -0.4 : 0));
      }
    }
  }

  /** Rising damp and street grime at the foot: its height is this building's own, and it climbs under what feeds it: a downpipe's splash, a doorway's wear, a soot plume. */
  footGrime(heightM = 0.9): this {
    const { c, x0, x1, H, seed, splash } = this;
    const moss = this.k.ramp(0x4a5a30, { light: 0.3, sat: 0.8, dark: 0.45 });
    const base = 0.18 + hash2(1, 9, seed) * 0.4;
    for (let x = x0; x < x1; x++) {
      let hm = heightM * base * (0.4 + vnoise(x, 37, seed + 501) * 1.2);
      for (const s of splash) {
        const d = Math.abs(x - s.x);
        if (d < 34) hm = Math.max(hm, s.s * heightM * (1.5 - d / 26) * (0.7 + vnoise(x, 7, seed + 503) * 0.6));
      }
      const top = H - Math.round(hm * this.tpm);
      for (let y = top; y < H; y++) {
        if (!c.at(x, y) || c.flag[y * c.w + x] & PWF.GLOW) continue;
        c.shift(x, y, y > H - 6 ? -2 : -1);
      }
      if (hash2(x >> 1, 3, seed) > 0.8) {
        const y = H - 2 - Math.floor(hash2(x, 5, seed) * 8);
        if (c.at(x, y)) c.ramp[y * c.w + x] = moss;
      }
    }
    return this;
  }

  /**
   * A wall's pool of painted light (`glow` not used: the wall lit): rings of whole tones with a seam
   * of dither between them, its shape a lamp's cone on a wall (narrower on top) — `tintRamp` recolours
   * the inner ring. `up`: tones added at the core (never more than 2: keep it mid contrast).
   */
  pool(cx: number, cy: number, rx: number, ry: number, up: number, tintRamp = 0): this {
    const { c, seed } = this;
    for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++) {
      for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
        if (!c.at(x, y) || c.flag[y * c.w + x] & PWF.GLOW) continue;
        const v = (y - cy) / ry;
        // Narrower on top: a lamp's cone rather than a disc.
        const widen = 0.72 + 0.28 * Math.max(0, (v + 1) / 2);
        const u = (x - cx) / (rx * widen);
        const wob = 1 + 0.05 * Math.sin(Math.atan2(v, u) * 5 + seed) + 0.03 * Math.sin(Math.atan2(v, u) * 13 + seed * 2);
        const d = Math.sqrt(u * u + v * v) / wob;
        if (d > 1) continue;
        let t = up;
        if (d > 0.55) t = up - 1;
        if (d > 0.8) t = bayer(x, y) < (1 - d) / 0.2 ? up - 1 : 0;
        if (t > 0) c.shift(x, y, t);
        if (tintRamp && d < 0.62 && c.at(x, y) !== this.r.ink) c.ramp[y * c.w + x] = tintRamp;
      }
    }
    return this;
  }

  /** Ink down the shadow side and along the outline: what makes a flat read as a drawing. */
  ink(): this {
    const { c, W, H } = this;
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!c.ramp[i] || c.flag[i] & PWF.GLOW) continue;
        const up = !c.at(x, y - 1);
        const dn = !c.at(x, y + 1);
        const lf = !c.at(x - 1, y);
        const rt = !c.at(x + 1, y);
        if (up || dn || lf || rt) out[i] = 1;
      }
    }
    for (let i = 0; i < W * H; i++) {
      if (out[i]) c.tone[i] = Math.min(c.tone[i], 0.6);
    }
    return this;
  }

  /** Vertical boards nailed over an opening, each drawn: width and height vary, grain, knots, nails, gaps at the top. */
  planks(x: number, y: number, w: number, h: number): this {
    const { c, r, seed } = this;
    let px = x;
    let i = 0;
    while (px < x + w) {
      const bw = 14 + Math.round(hash2(i, 3, seed) * 10);
      const inset = Math.round(hash2(i, 5, seed) * 6);
      const bh = h - inset - Math.round(hash2(i, 7, seed) * 8);
      const base = 2.2 + hash2(i, 9, seed) * 1.2;
      const yy = y + inset;
      for (let j = 0; j < bh; j++) {
        for (let k = 0; k < bw; k++) {
          // Grain: long wandering lines, a knot or two.
          const grain = vnoise2(px + k, j, 2.4, 40, seed + 23);
          const t = base + (grain > 0.62 ? 0.8 : grain < 0.34 ? -0.7 : 0);
          c.set(px + k, yy + j, r.wood, k === 0 ? t + 1 : k === bw - 1 ? 1 : t);
        }
      }
      // Knots, nails, a split.
      if (hash2(i, 11, seed) > 0.5) c.ellipse(px + bw * 0.5, yy + bh * (0.3 + hash2(i, 13, seed) * 0.4), 2.4, 3.2, r.wood, 1);
      for (const ny of [yy + 4, yy + bh - 6]) {
        c.set(px + 3, ny, r.iron, 4);
        c.set(px + bw - 4, ny + 1, r.iron, 4);
      }
      if (hash2(i, 15, seed) > 0.6) c.vline(px + 5 + (i % 6), yy + 10, Math.round(bh * 0.45), r.wood, 0.8);
      // The gap under the board's foot shows the dark.
      px += bw + (hash2(i, 17, seed) > 0.75 ? 2 : 1);
      i++;
    }
    return this;
  }

  /** A clump of bills pasted over each other at eye level. */
  bills(x: number, y: number, w: number, h: number): this {
    const { seed } = this;
    const hexes = [0x6e6856, 0x5a4638, 0x3e4656, 0x6a6452, 0x4e543a];
    let px = x;
    let i = 0;
    while (px < x + w - 10) {
      const bw = 12 + Math.round(hash2(i, 3, seed) * 12);
      const bh = 13 + Math.round(hash2(i, 5, seed) * 12);
      const by = y + Math.round(hash2(i, 7, seed) * Math.max(1, h - bh));
      this.poster(px, by, bw, bh, hexes[Math.floor(hash2(i, 9, seed) * hexes.length)]);
      px += Math.round(bw * 0.7);
      i++;
    }
    return this;
  }

  /** A little wall hardware: a gas meter box, a louvred vent, a pipe stub, a junction box. */
  fixture(x: number, y: number, kind: 'meter' | 'vent' | 'box'): this {
    const { c, r } = this;
    if (kind === 'meter') {
      c.rect(x, y, 16, 22, r.iron, 2.4);
      c.hline(x, y, 16, r.iron, 4);
      c.rect(x + 2, y + 3, 12, 6, r.glassDark, 2);
      c.ellipse(x + 8, y + 15, 4, 4, r.iron, 1.4);
      c.vline(x + 7, y + 22, 8, r.iron, 2);
      c.shift(x + 16, y + 2, -1);
    } else if (kind === 'vent') {
      c.rect(x, y, 20, 12, r.stone, 2.6);
      c.frame(x, y, 20, 12, r.stone, 1);
      for (let j = 2; j < 11; j += 2) c.hline(x + 1, y + j, 18, r.iron, 1);
    } else {
      c.rect(x, y, 14, 16, r.rust, 2.4);
      c.hline(x, y, 14, r.rust, 3.6);
      c.rect(x + 3, y + 4, 8, 8, r.iron, 1.4);
      c.vline(x + 6, y + 16, 12, r.iron, 2);
    }
    return this;
  }

  /** A bedsheet hung from a window with a word on it: `word` in the rough font, stained, ragged foot. */
  sheet(x: number, y: number, w: number, h: number, word: string): this {
    const { c, r, seed } = this;
    for (let j = 0; j < h; j++) {
      const sag = Math.round(Math.sin((j / h) * 3.1) * 2);
      const foot = j > h - 8 ? Math.round(hash2(j, 3, seed) * 6) : 0;
      for (let i = sag + foot; i < w - foot; i++) c.set(x + i, y + j, r.stone, i < sag + 2 ? 4 : i > w - 3 - foot ? 2 : 3);
    }
    const m = rasterText(word, FONT_BOLD, { scale: 2 });
    const tx = x + Math.round((w - m.w) / 2);
    const ty = y + Math.round((h - m.h) / 2);
    for (let my = 0; my < m.h; my++) for (let mx = 0; mx < m.w; mx++) if (m.data[my * m.w + mx]) c.set(tx + mx, ty + my, r.curtain, 1);
    for (let i = 0; i < w; i++) if (i % 7 < 2) this.c.shift(x + i, y + h + 1, -1);
    return this;
  }

  /** Washing on a line between two windows. */
  clothesline(x0: number, x1: number, y: number, n = 4): this {
    const { c, r, seed } = this;
    const hexes = [0x8a7a6a, 0x5a6a7a, 0x8a4a4a, 0x7a8a6a];
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / (x1 - x0);
      c.set(x, y + Math.round(Math.sin(t * Math.PI) * 5), r.ink, 1);
    }
    for (let i = 0; i < n; i++) {
      const ramp = this.k.ramp(hexes[Math.floor(hash2(i, 5, seed) * hexes.length)], { light: 0.34, dark: 0.45 });
      const t = (i + 0.5) / n;
      const px = Math.round(x0 + (x1 - x0) * t) - 6;
      const py = y + Math.round(Math.sin(t * Math.PI) * 5);
      c.rect(px, py + 1, 12, 15, ramp, 2.6);
      c.rect(px - 3, py + 2, 3, 7, ramp, 2.2);
      c.rect(px + 12, py + 2, 3, 7, ramp, 2.2);
      c.hline(px, py + 15, 12, ramp, 1);
    }
    return this;
  }

  // ─── More of the drawing ──────────────────────────────────────────────────

  /** A cast-iron drainpipe with its brackets and a rusty shoe. */
  drainpipe(xM: number, topM: number, bottomM = 0): this {
    const { c, r } = this;
    const x = this.X(xM);
    const y0 = this.Y(topM);
    const y1 = this.Y(bottomM);
    for (let y = y0; y < y1; y++) {
      const xx = x + this.lean(y, 2);
      c.set(xx, y, r.iron, 4);
      c.set(xx + 1, y, r.iron, 3);
      c.set(xx + 2, y, r.iron, 2);
      c.set(xx + 3, y, r.iron, 1);
      c.shift(xx + 4, y, -1.5);
      if ((y - y0) % 47 === 0) c.rect(xx - 1, y, 6, 2, r.iron, 3);
    }
    // Hopper head and rust.
    c.rect(x - 2, y0 - 4, 8, 4, r.iron, 2);
    c.hline(x - 2, y0 - 4, 8, r.iron, 4);
    c.streak(this.rng, x + 4, y0 + 2, 60, -1);
    this.splash.push({ x: x + 2, s: 1.1 });
    return this;
  }

  /** A sagging service cable from (x0, y0) to (x1, y1), metres. */
  wire(ax: number, ay: number, bx: number, by: number, sag = 0.6): this {
    const { c, r } = this;
    const x0 = this.X(ax);
    const x1 = this.X(bx);
    const y0 = this.Y(ay);
    const y1 = this.Y(by);
    const n = Math.abs(x1 - x0);
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n);
      const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag * this.tpm);
      const x = x0 + Math.round((x1 - x0) * t);
      c.set(x, y, r.ink, 1);
    }
    return this;
  }

  /** A faded painted sign on the wall (lettering already gone in places): `text` drawn by caller; this lays its faded ground. */
  ghostGround(x: number, y: number, w: number, h: number, ramp: number): this {
    const { c } = this;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!this.inWall(x + i, y + j)) continue;
        if (bayer(x + i, y + j) < 0.34 + vnoise2(x + i, y + j, 26, 16, this.seed + 91) * 0.34) c.ramp[(y + j) * c.w + x + i] = ramp;
      }
    }
    return this;
  }

  /** Louvred shutters, one at each side of an opening; `state`: open (flat to the wall) or `hang` (one has dropped on its hinge). */
  shutters(x: number, y: number, w: number, h: number, hex: number, state: 'open' | 'hang' = 'open'): this {
    const { c, k, r } = this;
    const ramp = k.ramp(hex, { light: 0.34, sat: 0.85, dark: 0.45 });
    const sw = Math.round(w * 0.42);
    const leaf = (lx: number, ly: number) => {
      c.rect(lx, ly, sw, h, r.ink, 0);
      c.rect(lx + 1, ly + 1, sw - 2, h - 2, ramp, 3);
      for (let j = 3; j < h - 3; j += 3) c.hline(lx + 2, ly + j, sw - 4, ramp, 1);
      c.vline(lx + 1, ly + 1, h - 2, ramp, 4);
      c.vline(lx + sw - 2, ly + 1, h - 2, ramp, 1);
    };
    leaf(x - sw - 1, y);
    if (state === 'open') {
      leaf(x + w + 1, y);
    } else {
      // Dropped on its top hinge: the leaf hangs at an angle, its foot out from the wall.
      const lx = x + w + 2;
      for (let j = 0; j < h; j++) {
        const off = Math.round(j * 0.32);
        c.rect(lx + off, y + j, sw, 1, ramp, j % 3 === 0 ? 1 : 3);
        c.set(lx + off - 1, y + j, r.ink, 0);
        c.set(lx + off + sw, y + j, r.ink, 0);
      }
    }
    return this;
  }

  /** Paste a poster or a band of bills on the wall (lit corners, a torn strip). */
  poster(x: number, y: number, w: number, h: number, hex: number): this {
    const { c, k, r, rng } = this;
    const ramp = k.ramp(hex, { light: 0.4, sat: 0.8, dark: 0.5 });
    c.rect(x, y, w, h, ramp, 2.6);
    c.rect(x + 2, y + 2, w - 4, Math.max(1, Math.round(h * 0.35)), ramp, 1.2);
    for (let i = 0; i < 3; i++) c.hline(x + 3, y + Math.round(h * 0.45) + i * 3, w - 6, ramp, 1.8 - (i & 1) * 0.6);
    // Dirt on the paper: a corner gone darker, a streak.
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (hash2(x + i, y + j, 77) < 0.1) c.shift(x + i, y + j, -1);
    // Torn corner, a curled edge, the bill's shadow on the wall.
    const tearY = y + h - 4 - Math.floor(rng.next() * 6);
    for (let i = 0; i < w; i++) if (i % 7 < 4) c.set(x + i, tearY + (i & 1), r.ink, 1);
    c.hline(x, y, w, ramp, 4);
    for (let j = 0; j < h; j++) c.shift(x + w, y + j, -1);
    return this;
  }

  /**
   * Spray paint: a word in fat letters (the font doubled, leaning a touch), an outline in the second
   * colour, runs of paint below the strokes.
   */
  tag(x: number, y: number, word: string, hex: number, outlineHex: number, scale = 2, o: { metal?: boolean } = {}): this {
    const { c, k } = this;
    const fill = k.ramp(hex, { light: 0.46, sat: 1.0, dark: 0.5 });
    const line = k.ramp(outlineHex, { light: 0.42, sat: 0.95, dark: 0.5 });
    const m = rasterText(word, FONT_BOLD, { scale });
    for (let my = 0; my < m.h; my++) {
      for (let mx = 0; mx < m.w; mx++) {
        if (!m.data[my * m.w + mx]) continue;
        const px = x + mx - Math.round((my * 3) / m.h);
        const py = y + my;
        // Outline: the texels around the stroke.
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const q = (my + dy) * m.w + mx + dx;
          if (my + dy < 0 || my + dy >= m.h || mx + dx < 0 || mx + dx >= m.w || !m.data[q]) {
            if (this.inWall(px + dx, py + dy)) c.set(px + dx, py + dy, line, o.metal ? 1 + c.toneAt(px + dx, py + dy) * 0.3 : 1.4);
          }
        }
        if (!this.inWall(px, py)) continue;
        // On shutters the paint takes the slat's own light: it is sprayed on metal, not printed over it.
        const base = o.metal ? 2.2 + (c.toneAt(px, py) - 2.4) * 0.75 : 3;
        c.set(px, py, fill, base + ((mx + my) % 7 === 0 ? 0.6 : 0));
      }
    }
    // Runs: on slats they catch on each edge and step sideways as they go down.
    const nRuns = o.metal ? 9 : 5;
    for (let i = 0; i < nRuns; i++) {
      const rx = x + 4 + Math.floor(this.rng.next() * (m.w - 8));
      const ry = y + m.h;
      const len = (o.metal ? 10 : 4) + Math.floor(this.rng.next() * (o.metal ? 22 : 10));
      for (let j = 0; j < len; j++) {
        const jx = o.metal ? (((ry + j) / 7) | 0) % 2 : 0;
        if (!this.inWall(rx + jx, ry + j)) continue;
        c.set(rx + jx, ry + j, fill, o.metal ? 1.4 + (c.toneAt(rx + jx, ry + j) - 1.4) * 0.5 + (j & 1) * 0.4 : 2 + (j & 1));
      }
    }
    return this;
  }

  /**
   * Rolling steel shutters: 7-texel slats in three tones lit from above, each bay its own weight,
   * dents and creases, guide rails, a heavy bottom rail with padlocks; one bay can be stuck half up
   * on a black interior. Mid values, on purpose: a shutter is a thing, never a black slab.
   */
  rollerShutter(x0: number, x1: number, yTop: number, yBot: number, o: { hex?: number; bays?: number; raised?: { bay: number; lift: number } } = {}): this {
    const { c, k, r, seed } = this;
    const metal = k.ramp(o.hex ?? 0x7a7f88, { light: 0.36, sat: 0.7, dark: 0.42 });
    const bays = o.bays ?? Math.max(2, Math.round((x1 - x0) / 130));
    const SLAT = 7;
    const hood = 9;
    for (let x = x0 - 4; x < x1 + 4; x++) {
      const yy = yTop + this.sag(x, 19) + (hash2(x >> 5, 3, seed + 131) > 0.72 ? 1 : 0);
      for (let j = 0; j < hood; j++) c.set(x, yy + j, metal, j === 0 ? 3.9 : j === 1 ? 3 : j === hood - 1 ? 0.8 : 2.2);
      c.shift(x, yy + hood, -1.2);
    }
    const yFirst = yTop + hood + 1;
    for (let b = 0; b < bays; b++) {
      const bx0 = x0 + Math.round(((x1 - x0) * b) / bays) + 3;
      const bx1 = x0 + Math.round(((x1 - x0) * (b + 1)) / bays) - 3;
      const lift = o.raised?.bay === b ? o.raised.lift : 0;
      const yEnd = yBot - lift;
      const base = 2.2 + hash2(b, 3, seed + 137) * 0.7;
      if (lift) {
        // What is behind a shutter stuck half up: black, a counter's edge, something on the floor.
        c.rect(bx0, yEnd, bx1 - bx0, yBot - yEnd, r.ink, 0.5);
        c.rect(bx0 + 6, yEnd + Math.round(lift * 0.45), bx1 - bx0 - 12, 3, r.wood, 1.6);
        for (let i = 0; i < 4; i++) c.rect(bx0 + 10 + i * 34, yEnd + Math.round(lift * 0.45) - 8, 12, 8, r.iron, 1.2 + (i & 1));
      }
      for (let x = bx0; x < bx1; x++) {
        for (let y = yFirst; y < yEnd - 5; y++) {
          const n = Math.floor((y - yFirst) / SLAT);
          const dent = Math.round((vnoise2(x, n * 3, 26, 2, seed + b * 7 + 3) - 0.5) * 3.2);
          const row = (((y - yFirst + dent) % SLAT) + SLAT) % SLAT;
          const tone = row === 0 ? base + 1.3 : row <= 2 ? base + 0.1 : row <= 4 ? base - 0.4 : row === 5 ? base - 1 : base - 1.6;
          c.set(x, y, metal, tone);
        }
        // Bottom rail: heavy, lit along its top, grime on it.
        for (let j = 0; j < 5; j++) c.set(x, yEnd - 5 + j, metal, j === 0 ? 3.8 : j === 4 ? 0.8 : 2.6);
      }
      // Big dents and rust running from the rail.
      for (let i = 0; i < 3; i++) {
        const dx = bx0 + 14 + Math.floor(hash2(b, i, seed + 141) * Math.max(1, bx1 - bx0 - 28));
        const dy = yFirst + 10 + Math.floor(hash2(b, i, seed + 143) * Math.max(1, yEnd - yFirst - 28));
        c.ellipseShade(dx, dy, 13 + i * 3, 7, (d) => (d < 0.55 ? -1 : d < 1 ? -0.6 : 0));
      }
      for (let x = bx0 + 8; x < bx1 - 4; x += 16 + Math.floor(hash2(x, b, seed + 147) * 22)) c.streak(this.rng, x, yEnd - 5, 8 + (x % 16), -1);
      // Padlocks on the rail.
      for (const px of [bx0 + 12, bx1 - 16]) {
        c.rect(px, yEnd - 8, 7, 8, r.stone, 2.8);
        c.frame(px, yEnd - 8, 7, 8, r.iron, 1);
        c.rect(px + 2, yEnd - 12, 3, 4, r.iron, 3);
      }
      // Guide rails.
      for (const gx of [bx0 - 3, bx1]) {
        for (let y = yFirst; y < yBot; y++) {
          c.set(gx + this.lean(y, 11), y, r.iron, 3.6);
          c.set(gx + 1 + this.lean(y, 11), y, r.iron, 2);
          c.set(gx + 2 + this.lean(y, 11), y, r.iron, 1);
        }
      }
    }
    return this;
  }

  /** Security bars: fewer and heavier than a comb, two tones each, cross-rails, one bent, one gone. */
  bars(x0: number, x1: number, y0: number, y1: number, spacing = 18): this {
    const { c, r, seed } = this;
    let i = 0;
    for (let x = x0 + (spacing >> 1); x < x1; x += spacing, i++) {
      const h = hash2(i, 3, seed + 151);
      if (h > 0.9) continue;
      const bent = h < 0.14;
      for (let y = y0; y < y1; y++) {
        const t = (y - y0) / (y1 - y0);
        const off = bent ? Math.round(Math.sin(t * Math.PI) * 6) : 0;
        c.set(x + off, y, r.iron, 3.8);
        c.set(x + off + 1, y, r.iron, 2.6);
        c.set(x + off + 2, y, r.iron, 1);
      }
    }
    for (const f of [0.12, 0.86]) {
      const y = Math.round(y0 + (y1 - y0) * f);
      for (let x = x0; x < x1; x++) {
        const yy = y + this.sag(x, 23);
        c.set(x, yy, r.iron, 3.6);
        c.set(x, yy + 1, r.iron, 2.2);
        c.set(x, yy + 2, r.iron, 0.8);
      }
    }
    return this;
  }

  /**
   * A shop front drawn as one picture across [x0, x1) from the pavement up to row `yTop`:
   * fascia, transom, glass over a riser, a recessed door. `room` draws what is behind the glass.
   */
  shopfront(x0: number, x1: number, yTop: number, o: { room: (rx: number, ry: number, rw: number, rh: number) => void; door?: number; riser?: number; frameRamp?: number; fascia?: number; bays?: number; doorKind?: 'dark' | 'lit' }): this {
    const { c, r, H } = this;
    const fr = o.frameRamp ?? r.iron;
    const fas = o.fascia ?? fr;
    const riser = o.riser ?? r.stone;
    const riserH = 22;
    const fasH = 16;
    const yGlass = yTop + fasH + 8;
    const yBase = H - riserH;
    const doorW = 44;
    const dx = o.door === undefined ? null : Math.max(x0 + 2, Math.min(x1 - doorW - 2, o.door));
    // Fascia: a painted board under a moulding (the sign goes on it as a separate card).
    // Fascia: follows the sag of the wall (a board's edge, not a ruler's), with a hand-drawn underline.
    const fbrk = this.breaks(131);
    for (let x = x0 - 3; x < x1 + 3; x++) {
      const yy = yTop + this.sag(x, 13) + Math.round(fbrk.dy[x] / 4);
      if (fbrk.st[x] === 2) {
        // The board has gone here: the frame behind it, in the dark.
        c.rect(x, yy + 2, 1, fasH - 2, r.ink, 0.8);
        continue;
      }
      for (let j = 0; j < fasH; j++) c.set(x, yy + j, fas, j === 0 ? 4 : j === 1 ? 3 : j === fasH - 1 ? 1 : 2);
      if (fbrk.st[x] === 1) for (let j = 2; j < fasH - 1; j++) c.shift(x, yy + j, 0.8);
      c.shift(x, yy + fasH, -1.2);
    }
    // Transom panes, dull glass over the door height.
    c.rect(x0, yTop + fasH, x1 - x0, 8, r.ink, 1);
    for (let x = x0 + 2; x < x1 - 2; x += 13) c.rect(x, yTop + fasH + 1, 11, 6, r.glassDark, 2 + (x % 3 === 0 ? 0.8 : 0));
    // The room behind the glass, the full width.
    const roomW = x1 - x0;
    o.room(x0, yGlass, roomW, yBase - yGlass);
    // Glazing bars and pier posts.
    const bays = o.bays ?? Math.max(2, Math.round(roomW / 72));
    for (let i = 0; i <= bays; i++) {
      const bx = Math.round(x0 + (roomW * i) / bays);
      c.vline(bx - 1, yGlass, yBase - yGlass, fr, 3);
      c.vline(bx, yGlass, yBase - yGlass, fr, 1);
      c.vline(bx + 1, yGlass, yBase - yGlass, fr, 2);
    }
    c.hline(x0, yGlass - 1, roomW, fr, 4);
    c.hline(x0, yGlass, roomW, fr, 2);
    // Riser / stallboard: panels, damp at the foot.
    c.rect(x0 - 3, yBase, x1 - x0 + 6, riserH, riser, 2);
    for (let x = x0 - 3; x < x1 + 3; x++) {
      const yy = yBase + this.sag(x, 21);
      c.set(x, yy, riser, 4);
      c.set(x, yy + 1, fr, 1);
    }
    for (let x = x0 + 5; x < x1 - 20; x += 36) {
      c.rect(x, yBase + 5, 30, riserH - 10, riser, 1);
      c.hline(x, yBase + 5, 30, riser, 0);
      c.hline(x, yBase + riserH - 5, 30, riser, 3);
    }
    // Recessed door: dark niche, door with a pane, step at the foot.
    if (dx !== null) {
      this.splash.push({ x: dx + doorW / 2, s: 0.6 });
      const y0 = yTop + fasH + 8;
      c.rect(dx, y0, doorW, H - y0, r.ink, 0);
      c.rect(dx + 3, y0 + 3, doorW - 6, H - y0 - 3, r.wood, 2);
      c.vline(dx + 3, y0 + 3, H - y0 - 3, r.wood, 3);
      c.vline(dx + doorW - 4, y0 + 3, H - y0 - 3, r.wood, 1);
      const paneTone = o.doorKind === 'lit' ? 4 : 2;
      const paneRamp = o.doorKind === 'lit' ? r.lamp : r.glassDark;
      const flag = o.doorKind === 'lit' ? PWF.GLOW : 0;
      c.rect(dx + 8, y0 + 8, doorW - 16, 26, paneRamp, paneTone, flag);
      c.frame(dx + 7, y0 + 7, doorW - 14, 28, r.wood, 3);
      c.rect(dx + doorW - 12, y0 + 42, 3, 8, r.stone, 4);
      // Step.
      c.rect(dx - 2, H - 5, doorW + 4, 5, r.stone, 3);
      c.hline(dx - 2, H - 5, doorW + 4, r.stone, 4);
    }
    return this;
  }

  /**
   * What is behind a shop's glass: the space divided into bays, each its own small room drawn in
   * one-point perspective (ceiling tubes converging, chequered floor, side walls) with the goods of
   * `kind` on its back wall and in front. Lit rooms are GLOW (they ignore the night); a dark shop
   * keeps the same drawing in deep tones. Reflections of the street run over the glass.
   */
  room(x: number, y: number, w: number, h: number, kind: RoomKind, o: { lit?: boolean; hex?: number; bays?: number } = {}): this {
    const { c, k, seed } = this;
    const lit = o.lit ?? true;
    const G = lit ? PWF.GLOW : 0;
    const wallHex = o.hex ?? (lit ? 0xb88a4a : 0x3a4458);
    const wall = k.ramp(wallHex, { light: 0.34, sat: lit ? 1 : 0.8, dark: 0.45 });
    const floorHex = lit ? mix(wallHex, 0x503828, 0.55) : 0x2c3442;
    const floorR = k.ramp(floorHex, { light: 0.34, dark: 0.45 });
    const ceilR = k.ramp(lit ? mix(wallHex, 0xf0d8a8, 0.4) : 0x323a4c, { light: 0.34 });
    const tube = k.ramp(lit ? 0xfff0c8 : 0x8a90a0, { light: 0.3 });
    const bays = o.bays ?? Math.max(1, Math.round(w / 180));
    const yTop = y;
    const yBot = y + h;
    for (let b = 0; b < bays; b++) {
      const bx0 = Math.round(x + (w * b) / bays);
      const bx1 = Math.round(x + (w * (b + 1)) / bays);
      const cw = bx1 - bx0;
      const vx = bx0 + cw * (0.42 + hash2(b, 1, seed) * 0.16);
      const vy = yTop + h * 0.42;
      const sb = 0.58;
      const bwx0 = vx + (bx0 - vx) * sb;
      const bwx1 = vx + (bx1 - vx) * sb;
      const bwy0 = vy + (yTop - vy) * sb;
      const bwy1 = vy + (yBot - vy) * sb;
      // Ceiling: mid tone (a lit room is glow: its big planes stay well under the lamps and the game).
      c.poly([bx0, yTop, bx1, yTop, bwx1, bwy0, bwx0, bwy0], ceilR, lit ? 2.6 : 2, G);
      for (let px = bx0; px < bx1; px++) {
        for (let py = yTop; py < bwy0; py++) {
          const d = (vy - py) / (vy - yTop);
          const lat = (px - vx) / d;
          for (const a of [-0.28, 0.1, 0.42]) if (Math.abs(lat - a * cw) < 3) c.set(px, py, tube, lit ? 4.6 : 3, G);
        }
      }
      // Floor: a perspective chequer.
      c.poly([bx0, yBot, bx1, yBot, bwx1, bwy1, bwx0, bwy1], floorR, lit ? 1.8 : 1.8, G);
      for (let py = Math.ceil(bwy1); py < yBot; py++) {
        const d = (py - vy) / (yBot - vy);
        const rowN = Math.floor(5 / d);
        for (let px = bx0; px < bx1; px++) {
          const colN = Math.floor((px - vx) / d / 14);
          if ((rowN + colN) & 1) c.set(px, py, floorR, lit ? 2.6 : 2.2, G);
        }
      }
      // Side walls: a dado rail running back to the vanishing point, wallpaper dashes.
      c.poly([bx0, yTop, bwx0, bwy0, bwx0, bwy1, bx0, yBot], wall, lit ? 1.7 : 1.5, G);
      c.poly([bx1, yTop, bwx1, bwy0, bwx1, bwy1, bx1, yBot], wall, lit ? 2.0 : 1.7, G);
      for (const sideX of [bx0, bx1 - 1]) {
        const inner = sideX === bx0 ? bwx0 : bwx1;
        const n = Math.round(Math.abs(inner - sideX));
        for (let i = 0; i <= n; i++) {
          const t = i / Math.max(1, n);
          const rx = sideX + (inner - sideX) * t;
          const railY = yTop + h * 0.62 + (bwy1 - yBot) * t * 0.55;
          c.set(rx, railY, wall, 3.4, G);
          c.set(rx, railY + 1, wall, 1, G);
          for (let j = 5; j < 60; j += 11) c.set(rx, yTop + j * (1 - t * 0.4), wall, 2.6, G);
          // Panel uprights every so often: pilasters along the wall (closer together further in).
          if (i % Math.max(8, Math.round(26 * (1 - t * 0.5))) === 0) {
            const y0 = yTop + (bwy0 - yTop) * t + 3;
            const y1 = yBot + (bwy1 - yBot) * t;
            for (let yy = Math.round(y0); yy < y1; yy++) {
              c.set(rx, yy, wall, 3, G);
              c.set(rx + 1, yy, wall, 1, G);
            }
          }
        }
      }
      // Back wall: picture rail, wainscot below it.
      c.rect(bwx0, bwy0, bwx1 - bwx0, bwy1 - bwy0, wall, lit ? 2.4 : 1.9, G);
      c.hline(Math.round(bwx0), Math.round(bwy0) + 2, Math.round(bwx1 - bwx0), wall, 3.2, G);
      {
        const wy = Math.round(bwy0 + (bwy1 - bwy0) * 0.62);
        c.hline(Math.round(bwx0), wy, Math.round(bwx1 - bwx0), wall, 3.4, G);
        c.hline(Math.round(bwx0), wy + 1, Math.round(bwx1 - bwx0), wall, 1, G);
        for (let i = 0; i < bwx1 - bwx0; i += 7) c.vline(Math.round(bwx0) + i, wy + 2, Math.round(bwy1) - wy - 2, wall, 1.6, G);
      }
      c.vline(Math.round(bwx0), Math.round(bwy0), Math.round(bwy1 - bwy0), wall, 1, G);
      c.vline(Math.round(bwx1) - 1, Math.round(bwy0), Math.round(bwy1 - bwy0), wall, 1, G);
      c.hline(Math.round(bwx0), Math.round(bwy1) - 1, Math.round(bwx1 - bwx0), floorR, 1, G);
      this.goods(Math.round(bwx0) + 1, Math.round(bwy0) + 2, Math.round(bwx1 - bwx0) - 2, Math.round(bwy1 - bwy0) - 3, kind, wall, lit, b);
      this.frontOfShop(bx0, yTop, cw, h, kind, lit, b);
    }
    // Reflections on the glass: a diagonal band of the street's night, on lit rooms a paler one.
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const d = i - j * 0.7;
        const idx = (y + j) * c.w + x + i;
        if (((d + w * 2) % 150) < 5) c.tone[idx] = Math.min(5, c.tone[idx] + (lit ? 0.4 : 1.1));
      }
    }
    return this;
  }

  /** The goods against a room's back wall. */
  private goods(x: number, y: number, w: number, h: number, kind: RoomKind, wall: number, lit: boolean, bay: number) {
    const { c, r, k, seed } = this;
    const G = lit ? PWF.GLOW : 0;
    const shelf = (sy: number, sh = 2) => {
      c.rect(x, sy, w, sh, r.wood, lit ? 2.4 : 1.5, G);
      c.hline(x, sy, w, r.wood, lit ? 3.8 : 2, G);
      c.hline(x, sy + sh, w, wall, 1, G);
    };
    const palette = [0xc84a4a, 0x3a7ad0, 0xe8c83a, 0x4aa86a, 0xe8d8c0, 0xc8742a].map((hx) => k.ramp(hx, { light: 0.38, sat: 0.9, dark: 0.5 }));
    if (kind === 'laundry') {
      // Front loaders along the back, shirts on a rail above them.
      const my = y + Math.round(h * 0.42);
      const my1 = y + h - 2;
      for (let i = 2; i + 20 < w; i += 22) {
        const col = palette[4];
        c.rect(x + i, my, 20, my1 - my, col, 3.4, G);
        c.frame(x + i, my, 20, my1 - my, r.iron, 2, G);
        const cx = x + i + 10;
        const cy = my + Math.round((my1 - my) * 0.56);
        c.ellipse(cx, cy, 6, 6, r.ink, 1, G);
        c.ellipse(cx, cy, 4, 4, r.glassSky, 3.2, G);
        c.rect(x + i + 2, my + 2, 6, 2, r.iron, 1, G);
      }
      for (let i = 3; i < w - 12; i += 15) {
        const col = palette[((i / 15 + bay * 2) | 0) % 6];
        const sy = y + 2 + (i % 3);
        c.rect(x + i, sy, 10, 13, col, 3, G);
        c.rect(x + i - 2, sy + 1, 2, 6, col, 2.4, G);
        c.rect(x + i + 10, sy + 1, 2, 6, col, 2.4, G);
      }
    } else if (kind === 'pawn') {
      shelf(y + Math.round(h * 0.32));
      shelf(y + Math.round(h * 0.68));
      let i = 2;
      while (i < w - 18) {
        const pick = hash2(i, bay + 3, seed);
        const sy = y + (i % 2 ? 2 : Math.round(h * 0.36));
        if (pick < 0.3) {
          c.ellipse(x + i + 7, sy + 13, 6, 8, r.wood, 3, G);
          c.rect(x + i + 6, sy, 2, 9, r.wood, 3.6, G);
          c.ellipse(x + i + 7, sy + 13, 1.6, 2, r.ink, 0, G);
        } else if (pick < 0.62) {
          c.rect(x + i, sy + 3, 18, 14, r.iron, 2, G);
          c.rect(x + i + 2, sy + 5, 12, 9, r.glassSky, 3, G);
          c.hline(x + i + 3, sy + 6, 8, r.glassSky, 4.6, G);
          c.vline(x + i + 8, sy + 5, 9, r.ink, 1, G);
        } else {
          const col = palette[(i / 5) % 6 | 0];
          c.rect(x + i + 1, sy + 4, 9, 11, col, 3, G);
          c.rect(x + i + 3, sy + 2, 5, 2, col, 4, G);
        }
        i += 20 + Math.round(hash2(i, bay, seed + 9) * 6);
      }
    } else if (kind === 'liquor') {
      for (let row = 0; row < 3; row++) {
        const sy = y + 1 + Math.round((row * h) / 3);
        shelf(sy + Math.round(h / 3) - 2);
        let i = 2;
        while (i < w - 6) {
          const col = palette[(hash2(i, row + bay, seed) * 6) | 0];
          const bh = 7 + Math.round(hash2(i, row + 7, seed) * 7);
          const by = sy + Math.round(h / 3) - 2 - bh;
          c.rect(x + i, by, 4, bh, col, 2.4, G);
          c.rect(x + i + 1, by - 3, 2, 3, col, 2, G);
          c.vline(x + i, by, bh, col, 3.8, G);
          c.hline(x + i, by + bh - 4, 3, r.stone, 4, G);
          i += 5 + Math.round(hash2(i, row, seed + 3) * 3);
        }
      }
    } else if (kind === 'cafe' || kind === 'bar') {
      const cy = y + Math.round(h * 0.55);
      c.rect(x, cy, w, h - (cy - y), r.wood, lit ? 2.3 : 1.2, G);
      c.hline(x, cy, w, r.wood, lit ? 3.8 : 2, G);
      // Back bar: bottles or cups, a coffee machine, a mirror.
      for (let i = 4; i < w - 6; i += 7 + (i % 4)) {
        const col = palette[((i * 3) >> 2) % 6];
        const bh = kind === 'bar' ? 9 + (i % 5) : 6;
        c.rect(x + i, cy - bh, 4, bh, col, 2.6, G);
        c.rect(x + i + 1, cy - bh - 2, 2, 2, col, 2, G);
      }
      if (kind === 'cafe') {
        const cx0 = x + w * (0.25 + (((bay * 37) % 5) / 5) * 0.5);
        if (bay % 2 === 0) {
          c.rect(cx0 - 8, cy - 14, 18, 14, r.stone, 3.2, G);
          c.rect(cx0 - 6, cy - 12, 14, 6, r.ink, 1, G);
        } else {
          // A cake stand under a dome.
          c.ellipse(cx0, cy - 10, 8, 8, r.glassSky, 3.4, G);
          c.rect(cx0 - 6, cy - 9, 12, 7, palette[0], 3.4, G);
          c.hline(cx0 - 8, cy - 2, 16, r.wood, 3, G);
        }
      } else {
        c.rect(x + w * 0.2, y + 2, w * 0.6, Math.round(h * 0.3), palette[0], 3.2, G);
        c.frame(x + w * 0.2, y + 2, w * 0.6, Math.round(h * 0.3), r.ink, 1, G);
      }
    } else if (kind === 'lobby') {
      const dy = y + Math.round(h * 0.58);
      const mode = bay % 3;
      if (mode === 0) {
        // Reception: a long desk, the key rack, a framed poster.
        c.rect(x + 3, dy, w - 6, h - (dy - y) - 1, r.wood, 2.6, G);
        c.hline(x + 3, dy, w - 6, r.wood, 4, G);
        for (let i = 8; i < w - 8; i += 12) c.vline(x + i, dy + 2, h - (dy - y) - 4, r.wood, 1.6, G);
        for (let i = 0; i < Math.floor((w - 8) / 11); i++) {
          c.rect(x + 4 + i * 11, y + 4, 7, 8, r.iron, 2, G);
          c.set(x + 5 + i * 11, y + 7, palette[(i + bay) % 6], 4, G);
        }
      } else if (mode === 1) {
        // The grand stair going up to the left, a banister, a potted palm.
        for (let i = 0; i < 9; i++) c.rect(x + 2 + i * 7, y + h - 3 - i * 4, w * 0.5, 4, r.wood, 3 - (i & 1) * 0.8, G);
        c.line(x + 2, y + h - 2, x + 2 + 8 * 7, y + h - 3 - 8 * 4 - 8, r.wood, 4.4, G);
        c.ellipse(x + w * 0.82, y + h - 16, 6, 8, r.stone, 1.6, G);
        c.rect(x + w * 0.82 - 4, y + h - 9, 8, 9, r.wood, 2.4, G);
      } else {
        // A bench, a chandelier, framed views.
        c.rect(x + 5, dy + 4, w * 0.4, 5, r.wood, 2.6, G);
        c.hline(x + 5, dy + 4, w * 0.4, r.wood, 3.8, G);
        for (const fx of [0.14, 0.42]) c.vline(x + w * fx, dy + 9, h - (dy - y) - 10, r.wood, 1.6, G);
        c.ellipse(x + w * 0.65, y + 8, 7, 4, r.lamp, 4, G);
        c.rect(x + w * 0.2, y + 3, 14, 10, palette[3], 2.6, G);
        c.frame(x + w * 0.2, y + 3, 14, 10, r.ink, 1, G);
        c.rect(x + w * 0.7, y + 3, 14, 10, palette[1], 2.6, G);
        c.frame(x + w * 0.7, y + 3, 14, 10, r.ink, 1, G);
      }
    } else if (kind === 'closed') {
      shelf(y + Math.round(h * 0.42));
      for (let i = 4; i < w - 22; i += 30 + (i % 13)) c.rect(x + i, y + Math.round(h * 0.42) - 6, 12, 6, palette[((i >> 2) + bay) % 6], 1.6, G);
    } else if (kind === 'meats') {
      c.hline(x, y + 2, w, r.iron, 4, G);
      for (let i = 6; i < w - 10; i += 18) {
        const col = k.ramp(0x7a2018, { light: 0.34, dark: 0.45 });
        c.vline(x + i + 5, y + 2, 5, r.iron, 3, G);
        c.ellipse(x + i + 5, y + 18, 5, 11, col, (u, v) => 2 + (u < 0 ? 1 : 0) - v, G);
      }
    }
  }

  /** What stands near the glass: rails, tables, display stands (drawn big: close to the viewer). */
  private frontOfShop(x: number, y: number, w: number, h: number, kind: RoomKind, lit: boolean, bay: number) {
    const { c, r } = this;
    const G = lit ? PWF.GLOW : 0;
    const base = y + h;
    if (kind === 'pawn' || kind === 'closed') {
      // A low display: boxes and a gun rack in silhouette against the lit room.
      c.rect(x + 2, base - 9, w - 4, 9, r.wood, lit ? 2 : 1.2, G);
      c.hline(x + 2, base - 9, w - 4, r.wood, lit ? 3.4 : 2, G);
    } else if (kind === 'laundry') {
      // A folding table with a basket.
      c.rect(x + w * 0.1, base - 22, w * 0.5, 3, r.stone, lit ? 3.4 : 2, G);
      for (const lx of [0.14, 0.54]) c.vline(x + w * lx, base - 19, 19, r.iron, 2, G);
      c.rect(x + w * 0.32, base - 32, 14, 10, r.stone, 2.2, G);
    } else if (kind === 'cafe' || kind === 'bar') {
      // Stools and table tops, near and dark.
      for (let i = 6; i < w - 10; i += 28 + (i % 6)) {
        c.rect(x + i, base - 26, 13, 2, r.ink, 0.6, G);
        c.vline(x + i + 6, base - 24, 24, r.ink, 0.5, G);
        c.rect(x + i + 2, base - 2, 9, 2, r.ink, 0.5, G);
      }
    } else if (kind === 'lobby') {
      // A velvet rope and two brass posts across the front of the room.
      for (const lx of [0.15, 0.85]) {
        c.rect(x + w * lx - 2, base - 14, 4, 14, r.stone, 3.6, G);
        c.ellipse(x + w * lx, base - 16, 3, 3, r.stone, 4, G);
      }
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const sy = base - 15 + Math.round(Math.sin(t * Math.PI) * 6);
        c.set(x + w * (0.15 + 0.7 * t), sy, r.curtain, 3, G);
      }
    } else if (kind === 'liquor') {
      // A wine rack in front of the back wall.
      c.rect(x + 2, base - 16, w - 4, 16, r.wood, 1.6, G);
      for (let i = 4; i < w - 4; i += 6) c.vline(x + i, base - 16, 16, r.wood, 3.4, G);
    }
  }
}

export type RoomKind = 'laundry' | 'pawn' | 'liquor' | 'cafe' | 'bar' | 'lobby' | 'closed' | 'meats' | 'empty';
