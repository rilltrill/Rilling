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
    glassDark: k.ramp(0x1f2a48, { light: 0.4, sat: 1.0, dark: 0.45 }),
    glassSky: k.ramp(0x4e6696, { light: 0.46, sat: 0.9 }),
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
    // The ends of a wall are drawn too: a pixel out here and there, a slow lean.
    for (let y = 0; y < c.h; y++) {
      this.endL[y] = this.x0 + Math.round((vnoise(y, 90, seed + 71) - 0.5) * 2.4 + this.lean(y, 3));
      this.endR[y] = this.x1 + Math.round((vnoise(y, 80, seed + 73) - 0.5) * 2.4 + this.lean(y, 5));
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

  /** A wooden water tank on an iron trestle, standing behind the wall. */
  tank(cM: number, baseM: number, o: { w?: number; h?: number } = {}): this {
    const { c, r, seed } = this;
    const cx = this.X(cM);
    const yB = this.Y(baseM);
    const w = Math.round((o.w ?? 2.5) * this.tpm);
    const h = Math.round((o.h ?? 2.2) * this.tpm);
    const legs = 26;
    // Trestle.
    const yLeg = yB - legs;
    for (const lx of [-w / 2 + 3, -w / 6, w / 6, w / 2 - 3]) {
      c.line(cx + lx - 2, yLeg, cx + lx - 3, yB + 6, r.iron, 2);
      c.line(cx + lx, yLeg, cx + lx - 1, yB + 6, r.iron, 3);
    }
    c.line(cx - w / 2 + 2, yLeg + 4, cx + w / 2 - 3, yB - 2, r.iron, 2);
    c.line(cx + w / 2 - 2, yLeg + 4, cx - w / 2 + 3, yB - 2, r.iron, 1);
    c.hline(cx - w / 2 + 1, yLeg + 1, w - 2, r.iron, 3);
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

  /** Fill the outline with the wall's base tone. */
  fill(ramp: number = this.r.wall, tone = 3): this {
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

  /** A horizontal band of `h` rows: the top lit, the bottom shadowed, a cast shadow on the wall under it. */
  band(y: number, h: number, ramp: number = this.r.stone, o: { x0?: number; x1?: number; gaps?: [number, number][]; salt?: number; shadow?: number } = {}): this {
    const { c } = this;
    const x0 = o.x0 ?? this.x0;
    const x1 = o.x1 ?? this.x1;
    const salt = o.salt ?? 2;
    const inGap = (x: number) => o.gaps?.some(([a, b]) => x >= a && x < b) ?? false;
    for (let x = x0; x < x1; x++) {
      if (inGap(x)) continue;
      const yy = y + this.sag(x, salt);
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
   * shadow on the wall. `gaps` (columns) are where it has been shot or has fallen off: the
   * band stops with a rough end and the brick shows.
   */
  cornice(y: number, o: { ramp?: number; gaps?: [number, number][]; x0?: number; x1?: number; h?: number; salt?: number } = {}): this {
    const { c, r, seed } = this;
    const ramp = o.ramp ?? r.stone;
    const x0 = o.x0 ?? this.x0 - 3;
    const x1 = o.x1 ?? this.x1 + 3;
    const h = o.h ?? 13;
    const salt = o.salt ?? 2;
    const inGap = (x: number) => o.gaps?.some(([a, b]) => x >= a - 2 && x < b + 2) ?? false;
    let dx = x0 + 3;
    for (let x = x0; x < x1; x++) {
      if (inGap(x)) {
        for (let j = 2; j < h + 3; j++) if (this.inWall(x, y + j)) this.c.shift(x, y + j, -1);
        continue;
      }
      const yy = y + this.sag(x, salt);
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
    void v;
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
    const { c, r, k, seed } = this;
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
      const tvR = k.ramp(0x5a86c8, { light: 0.34 });
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
        c.rect(x + 6, y + h - 12, w - 12, 8, tvR, 4.2, G);
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
    // Unlit panes: the night in them — dark glass, a broken reflection, sometimes a torn blind or cardboard.
    const dark = kind !== 'moon';
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const t = dark ? 1.2 + (j < 5 ? -0.4 : 0.3 * ((i + (j >> 2)) & 1)) : 3 - (j / h) * 1.8;
        c.set(x + i, y + j, r.glassDark, t);
      }
    }
    // The reflection: a stepped diagonal band, each pane catching it at a different place.
    const panes = 2;
    for (let p = 0; p < panes; p++) {
      const py0 = y + (p * h) / panes;
      const py1 = y + ((p + 1) * h) / panes;
      const bx = Math.round(hash2(v, p, 3) * (w - 6));
      for (let j = Math.floor(py0); j < py1; j++) {
        const c0 = bx + Math.round((j - py0) * 0.6);
        for (let i = 0; i < 3 + (j % 9 < 3 ? 2 : 0); i++) {
          const px = x + ((c0 + i) % w);
          c.set(px, j, r.glassSky, dark ? 1.7 + (i === 0 ? 0.9 : 0) : 3.6);
        }
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
    if (hash2(v, 7, 3) > 0.74) {
      const cx = x + 4 + Math.floor(hash2(v, 8, 3) * (w - 8));
      const cy = y + 4 + Math.floor(hash2(v, 9, 3) * (h - 8));
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * 6.28 + hash2(v, a, 21);
        c.line(cx, cy, cx + Math.round(Math.cos(ang) * (3 + (a % 3) * 3)), cy + Math.round(Math.sin(ang) * (3 + (a % 3) * 3)), r.glassSky, 3.4);
      }
    }
    void seed;
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
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!c.at(x, y)) continue;
        const i = y * W + x;
        if (c.flag[i] & PWF.GLOW) continue;
        const f = field(x, y) * Math.abs(strength);
        if (f <= 0) continue;
        const whole = Math.floor(f);
        const frac = f - whole;
        // Whole tones with a hand-shaped edge: a slow wobble moves the threshold, and only a
        // hair's width at the edge is dithered, however gentle the gradient is.
        const wob = (vnoise2(x, y, 9, 7, this.seed + 401) - 0.5) * 0.22;
        const v = frac + wob;
        const up = v > 0.5 + seam * 0.16 ? 1 : v < 0.5 - seam * 0.16 ? 0 : bayer(x, y) < 0.5 ? 1 : 0;
        const step = whole + up;
        if (step) c.shift(x, y, sign * step);
      }
    }
    return this;
  }

  /** Rising damp and street grime along the foot of the wall: a ragged band, darker, with moss flecks at the very bottom. */
  footGrime(heightM = 0.9): this {
    const { c, x0, x1, H, seed, r } = this;
    const moss = this.k.ramp(0x4a5a30, { light: 0.3, sat: 0.8, dark: 0.45 });
    for (let x = x0; x < x1; x++) {
      const top = H - Math.round((heightM * this.tpm) * (0.55 + vnoise(x, 23, seed + 501) * 0.7));
      for (let y = top; y < H; y++) {
        if (!c.at(x, y) || c.flag[y * c.w + x] & PWF.GLOW) continue;
        c.shift(x, y, y > H - 6 ? -2 : -1);
      }
      if (hash2(x >> 1, 3, seed) > 0.8) {
        const y = H - 2 - Math.floor(hash2(x, 5, seed) * 8);
        if (c.at(x, y)) c.ramp[y * c.w + x] = moss;
      }
    }
    void r;
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
    const { k, seed, r } = this;
    const hexes = [0xb8a878, 0x8a4a3a, 0x4a6a8a, 0xc8b89a, 0x6a7a3a];
    let px = x;
    let i = 0;
    while (px < x + w - 10) {
      const bw = 14 + Math.round(hash2(i, 3, seed) * 14);
      const bh = 16 + Math.round(hash2(i, 5, seed) * 14);
      const by = y + Math.round(hash2(i, 7, seed) * Math.max(1, h - bh));
      this.poster(px, by, bw, bh, hexes[Math.floor(hash2(i, 9, seed) * hexes.length)]);
      px += Math.round(bw * 0.7);
      i++;
    }
    void k;
    void r;
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
  shutters(x: number, y: number, w: number, h: number, hex: number, state: 'open' | 'hang' = 'open', v = 0): this {
    const { c, k, r } = this;
    const ramp = k.ramp(hex, { light: 0.34, sat: 0.85, dark: 0.45 });
    const sw = Math.round(w * 0.42);
    const leaf = (lx: number, ly: number, droop: number) => {
      c.rect(lx, ly, sw, h, r.ink, 0);
      c.rect(lx + 1, ly + 1, sw - 2, h - 2, ramp, 3);
      for (let j = 3; j < h - 3; j += 3) c.hline(lx + 2, ly + j, sw - 4, ramp, 1);
      c.vline(lx + 1, ly + 1, h - 2, ramp, 4);
      c.vline(lx + sw - 2, ly + 1, h - 2, ramp, 1);
      void droop;
    };
    leaf(x - sw - 1, y, 0);
    if (state === 'open') {
      leaf(x + w + 1, y, 0);
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
    void v;
    return this;
  }

  /** Paste a poster or a band of bills on the wall (lit corners, a torn strip). */
  poster(x: number, y: number, w: number, h: number, hex: number): this {
    const { c, k, r, rng } = this;
    const ramp = k.ramp(hex, { light: 0.4, sat: 0.8, dark: 0.5 });
    c.rect(x, y, w, h, ramp, 3);
    c.rect(x + 2, y + 2, w - 4, Math.max(1, Math.round(h * 0.35)), ramp, 1);
    for (let i = 0; i < 3; i++) c.hline(x + 3, y + Math.round(h * 0.45) + i * 3, w - 6, ramp, 2 - (i & 1));
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
  tag(x: number, y: number, word: string, hex: number, outlineHex: number, scale = 2): this {
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
            if (this.inWall(px + dx, py + dy)) c.set(px + dx, py + dy, line, 1.4);
          }
        }
        if (this.inWall(px, py)) c.set(px, py, fill, 3 + ((mx + my) % 7 === 0 ? 1 : 0));
      }
    }
    // Runs.
    for (let i = 0; i < 5; i++) {
      const rx = x + 4 + Math.floor(this.rng.next() * (m.w - 8));
      const ry = y + m.h;
      for (let j = 0; j < 4 + Math.floor(this.rng.next() * 10); j++) if (this.inWall(rx, ry + j)) c.set(rx, ry + j, fill, 2 + (j & 1));
    }
    return this;
  }

  /**
   * A shop front drawn as one picture across [x0, x1) from the pavement up to row `yTop`:
   * fascia, transom, glass over a riser, a recessed door. `room` draws what is behind the glass.
   */
  shopfront(x0: number, x1: number, yTop: number, o: { room: (rx: number, ry: number, rw: number, rh: number) => void; door?: number; riser?: number; frameRamp?: number; fascia?: number; bays?: number; doorKind?: 'dark' | 'lit' }): this {
    const { c, r, H, seed } = this;
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
    c.rect(x0 - 3, yTop, x1 - x0 + 6, fasH, fas, 2);
    c.hline(x0 - 3, yTop, x1 - x0 + 6, fas, 4);
    c.hline(x0 - 3, yTop + 1, x1 - x0 + 6, fas, 3);
    c.hline(x0 - 3, yTop + fasH - 1, x1 - x0 + 6, fas, 1);
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
    c.hline(x0 - 3, yBase, x1 - x0 + 6, riser, 4);
    c.hline(x0 - 3, yBase + 1, x1 - x0 + 6, fr, 1);
    for (let x = x0 + 5; x < x1 - 20; x += 36) {
      c.rect(x, yBase + 5, 30, riserH - 10, riser, 1);
      c.hline(x, yBase + 5, 30, riser, 0);
      c.hline(x, yBase + riserH - 5, 30, riser, 3);
    }
    // Recessed door: dark niche, door with a pane, step at the foot.
    if (dx !== null) {
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
    void seed;
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
    const bays = o.bays ?? Math.max(1, Math.round(w / 104));
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
      // Ceiling.
      c.poly([bx0, yTop, bx1, yTop, bwx1, bwy0, bwx0, bwy0], ceilR, lit ? 3 : 2, G);
      for (let px = bx0; px < bx1; px++) {
        for (let py = yTop; py < bwy0; py++) {
          const d = (vy - py) / (vy - yTop);
          const lat = (px - vx) / d;
          for (const a of [-0.28, 0.1, 0.42]) if (Math.abs(lat - a * cw) < 3) c.set(px, py, tube, lit ? 5 : 3, G);
        }
      }
      // Floor: a perspective chequer.
      c.poly([bx0, yBot, bx1, yBot, bwx1, bwy1, bwx0, bwy1], floorR, 2, G);
      for (let py = Math.ceil(bwy1); py < yBot; py++) {
        const d = (py - vy) / (yBot - vy);
        const rowN = Math.floor(5 / d);
        for (let px = bx0; px < bx1; px++) {
          const colN = Math.floor((px - vx) / d / 14);
          if ((rowN + colN) & 1) c.set(px, py, floorR, lit ? 3.2 : 2.6, G);
        }
      }
      // Side walls (a stripe of shelf along them).
      c.poly([bx0, yTop, bwx0, bwy0, bwx0, bwy1, bx0, yBot], wall, lit ? 2.3 : 1.7, G);
      c.poly([bx1, yTop, bwx1, bwy0, bwx1, bwy1, bx1, yBot], wall, lit ? 2.6 : 1.9, G);
      // Back wall.
      c.rect(bwx0, bwy0, bwx1 - bwx0, bwy1 - bwy0, wall, lit ? 3 : 2, G);
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
        if (((d + w * 2) % 150) < 7) c.tone[idx] = Math.min(5, c.tone[idx] + (lit ? 0.7 : 1.1));
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
        c.rect(x + w * 0.5 - 8, cy - 14, 18, 14, r.stone, 3.2, G);
        c.rect(x + w * 0.5 - 6, cy - 12, 14, 6, r.ink, 1, G);
      } else {
        c.rect(x + w * 0.2, y + 2, w * 0.6, Math.round(h * 0.3), palette[0], 3.2, G);
        c.frame(x + w * 0.2, y + 2, w * 0.6, Math.round(h * 0.3), r.ink, 1, G);
      }
    } else if (kind === 'lobby') {
      const dy = y + Math.round(h * 0.58);
      c.rect(x + 3, dy, w - 6, h - (dy - y) - 1, r.wood, 2.6, G);
      c.hline(x + 3, dy, w - 6, r.wood, 4, G);
      for (let i = 8; i < w - 8; i += 12) c.vline(x + i, dy + 2, h - (dy - y) - 4, r.wood, 1.6, G);
      for (let i = 0; i < Math.floor((w - 8) / 11); i++) {
        c.rect(x + 4 + i * 11, y + 4, 7, 8, r.iron, 2, G);
        c.set(x + 5 + i * 11, y + 7, palette[2], 4, G);
      }
      // A framed film poster or two on the wall behind the desk.
      c.rect(x + w * 0.12, y + 4, 12, 15, palette[0], 3, G);
      c.frame(x + w * 0.12, y + 4, 12, 15, r.ink, 1, G);
      c.rect(x + w * 0.74, y + 4, 12, 15, palette[1], 3, G);
      c.frame(x + w * 0.74, y + 4, 12, 15, r.ink, 1, G);
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
    const { c, r, seed } = this;
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
    void seed;
    void bay;
  }
}

export type RoomKind = 'laundry' | 'pawn' | 'liquor' | 'cafe' | 'bar' | 'lobby' | 'closed' | 'meats' | 'empty';
