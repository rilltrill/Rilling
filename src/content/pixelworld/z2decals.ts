import { bayer, PW_TPM_NEAR, PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_5x7 } from './font';
import { darken, hash2 } from './surfaces';

/**
 * ST. MERCY HOSPITAL decals (cut-out modules laid a few millimetres off a
 * surface): the storytelling layer over the wrap tiles — water stains and
 * cracks, ghosts of pictures taken down, blood (hand prints, wipes, spatter,
 * pools, drag trails, words), scattered charts, ceiling holes. Stains are
 * painted per wall colour (tinted toward it) so they sit IN the paint instead
 * of floating on it. Blood, papers and floor stains are painted natively at 96 texels a metre
 * (the density of the corridor surfaces they lie on); the rest at 32.
 */


/**
 * Blood is DRIED: a maroon that stays under the scenery's mid tones. (The first pass's saturated
 * red was the colour of the hit flash and the blood FX, laid down the middle of the lane and
 * across the walls enemies stand against: docs/pixelworld2/plan-z2.md §0.)
 */
const BLOOD = 0x561418;
/** The grey the NEUTRAL stain decals are painted round (tinted per wall / floor / ceiling colour). */
export const STAIN_BASE = 0xd0ccc4;
const BLOOD_DARK = 0x34100f;

/** Wet-blood ramps (fresh red / old brown) for a painter. */
function bloodRamps(k: { ramp(hex: number, o?: object): number }) {
  return { fresh: k.ramp(BLOOD, { light: 0.22, sat: 0.95, dark: 0.5 }), old: k.ramp(BLOOD_DARK, { light: 0.2, sat: 0.9, dark: 0.55 }) };
}

/** An irregular blob mask (radius wobble) — true inside. */
function blobIn(x: number, y: number, cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.28): boolean {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const d2 = dx * dx + dy * dy;
  // Cheap rejects outside the wobble's range.
  const lo = 1 - wob;
  const hi = 1 + wob;
  if (d2 < lo * lo) return true;
  if (d2 > hi * hi) return false;
  const a = Math.atan2(dy, dx);
  const r = 1 + wob * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 + seed * 2.1) * 0.3 + Math.sin(a * 9 + seed * 0.7) * 0.2);
  return d2 < r * r;
}

// ─── Native kit (96 texels a metre) ──────────────────────────────────────────

const TAU = Math.PI * 2;

/**
 * Native blood: dried, dark and desaturated, well under the hit flash and the telegraph rings.
 * Tones: 0 the dark rim, 1 the wet core, 2-3 the film drying at the edges, 4 a glint, never 5.
 */
function driedBlood(k: PwKit): number {
  return k.ramp(0x472326, { light: 0.24, sat: 0.62, dark: 0.55 });
}

/** Smooth periodic value noise, -1..1 (`cells` knots over `period`): edges that wander in runs, not per texel. */
function wob(t: number, period: number, cells: number, salt: number): number {
  const u = ((((t % period) + period) % period) / period) * cells;
  const i = Math.floor(u);
  const f = u - i;
  const a = hash2(i % cells, 1, salt);
  const b = hash2((i + 1) % cells, 1, salt);
  return (a + (b - a) * f * f * (3 - 2 * f)) * 2 - 1;
}

/** One decal's coverage: shapes stamped in, then shaded by how deep a texel lies inside them. */
class Stain {
  readonly a: Uint8Array;
  constructor(readonly w: number, readonly h: number, private readonly wrapV = false) {
    this.a = new Uint8Array(w * h);
  }
  at(x: number, y: number): number {
    if (this.wrapV) y = ((y % this.h) + this.h) % this.h;
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x;
  }
  get(x: number, y: number): number {
    const i = this.at(x, y);
    return i < 0 ? 0 : this.a[i];
  }
  put(x: number, y: number, v = 1) {
    const i = this.at(Math.round(x), Math.round(y));
    if (i >= 0) this.a[i] = v;
  }
  disc(cx: number, cy: number, rx: number, ry: number, v = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.put(x, y, v);
      }
    }
  }
  lobed(cx: number, cy: number, rx: number, ry: number, seed: number, wobble = 0.3, v = 1) {
    const m = 1 + wobble;
    for (let y = Math.floor(cy - ry * m); y <= Math.ceil(cy + ry * m); y++) {
      for (let x = Math.floor(cx - rx * m); x <= Math.ceil(cx + rx * m); x++) if (blobIn(x, y, cx, cy, rx, ry, seed, wobble)) this.put(x, y, v);
    }
  }
  stroke(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, v = 1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5) + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const r = Math.max(0.6, r0 + (r1 - r0) * t);
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, v);
    }
  }
  /** Depth of every covered texel: 1 on the rim, 2 inside it, … capped at `max`. */
  depth(max: number): Uint8Array {
    const d = new Uint8Array(this.w * this.h);
    let rest: number[] = [];
    for (let i = 0; i < this.a.length; i++) if (this.a[i]) rest.push(i);
    for (let L = 1; L <= max && rest.length; L++) {
      const hit = L === 1 ? (x: number, y: number) => this.get(x, y) === 0 : (x: number, y: number) => {
        const j = this.at(x, y);
        return j >= 0 && d[j] === L - 1;
      };
      const next: number[] = [];
      for (const i of rest) {
        const x = i % this.w;
        const y = (i - x) / this.w;
        if (hit(x - 1, y) || hit(x + 1, y) || hit(x, y - 1) || hit(x, y + 1)) d[i] = L;
        else next.push(i);
      }
      rest = next;
    }
    for (const i of rest) d[i] = max;
    return d;
  }
}

/** Paint a stain: `tone(x, y, value, depth)` per covered texel (below 0 leaves it clear). Returns the depths. */
function paintStain(c: PwCanvas, s: Stain, r: number, tone: (x: number, y: number, v: number, d: number) => number, max = 7): Uint8Array {
  const d = s.depth(max);
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      if (!s.a[i]) continue;
      const t = tone(x, y, s.a[i], d[i]);
      if (t >= 0) c.set(x, y, r, t);
    }
  }
  return d;
}

/** A 2-texel drip down from (x, y0), ending in a bead (values 4 and 5). Returns the bead. */
function drip(s: Stain, x: number, y0: number, len: number): [number, number] {
  const ix = Math.round(x);
  const iy = Math.round(y0);
  const n = Math.max(2, Math.min(len, s.h - iy - 5));
  for (let y = iy; y < iy + n; y++) {
    s.put(ix, y, 4);
    s.put(ix + 1, y, 4);
  }
  s.disc(ix + 0.5, iy + n + 1, 2.2, 2.7, 5);
  return [ix, iy + n + 1];
}

/** A small wet highlight, only where the stain is deep enough to hold one. */
function glint(c: PwCanvas, s: Stain, d: Uint8Array, r: number, x: number, y: number, len: number) {
  for (let j = 0; j < len; j++) {
    const i = s.at(x + j, y);
    if (i >= 0 && d[i] >= 2) c.set(x + j, y, r, 4);
    const q = s.at(x + j - 1, y + 1);
    if (q >= 0 && d[q] >= 2 && j < len - 1) c.set(x + j - 1, y + 1, r, 3);
  }
}

/** The drag smear (a wrap ribbon, or a short stroke with its ends painted out). */
function paintDrag(c: PwCanvas, k: PwKit, bandW: number, variant: number, wrap: boolean) {
  const W = c.w;
  const H = c.h;
  const r = driedBlood(k);
  const rng = k.rng;
  const s = new Stain(W, H, wrap);
  const Y = (y: number) => (wrap ? ((y % H) + H) % H : y);
  const ph = variant * 2.1 + 0.6;
  const wave = (y: number, n: number, p: number) => Math.sin((y / H) * TAU * n + p);
  const cx = (y: number) => bandW / 2 + wave(y, 1, ph) * bandW * 0.045 + wave(y, 3, ph * 1.7) * bandW * 0.018;
  const halfW = bandW * 0.27;
  const cs = Math.max(4, Math.round(H / 10));
  const cf = Math.max(6, Math.round(H / 5));
  // Where the body came off the floor: the smear closes and only the fingers go on.
  // (Every 2 m, so a ribbon cut to whole runs starts and ends in one, never across the smear.)
  const lifts = wrap ? [0, 0.5] : [];
  const body = (y: number) => {
    let m = wrap ? 1 : Math.min(1, Math.min(y, H - 1 - y) / (H * 0.24));
    for (const t of lifts) {
      const d0 = Math.abs(y / H - t);
      m = Math.min(m, Math.max(0, Math.min(1, (Math.min(d0, 1 - d0) - 0.008) / 0.04)));
    }
    return m;
  };
  for (let y = 0; y < H; y++) {
    const m = body(y);
    if (m <= 0) continue;
    const hw = halfW + wave(y, 2, ph * 2.3) * bandW * 0.03 + wave(y, 5, ph) * bandW * 0.012;
    const x0 = Math.round(cx(y) - hw + wob(y, H, cs, 11 + variant) * bandW * 0.045 + wob(y, H, cf, 12) * 1.4);
    const x1 = Math.round(cx(y) + hw + wob(y, H, cs, 13 + variant) * bandW * 0.045 + wob(y, H, cf, 14) * 1.4);
    for (let x = x0; x <= x1; x++) {
      // The smear opens out of (and closes into) combed lanes: never a rounded end.
      if (m < 1 && hash2(Math.floor((x - cx(y) + 64) / 3), 3, 21 + variant) > m * 1.15) continue;
      s.put(x, y);
    }
  }
  // Islands of bare floor where the smear skipped.
  for (let i = 0; i < H / 40; i++) {
    const y = rng.range(0, H);
    s.lobed(cx(y) + (i % 2 ? 1 : -1) * rng.range(0.4, 0.85) * halfW, y, rng.range(1.6, 3.2), rng.range(4, 11), i + 0.5, 0.3, 0);
  }
  // Finger tracks, 2 texels wide, wavering and skipping: dark grooves, and two wiped bare to the floor.
  const grooves: Array<[number, number]> = [];
  const skip = Math.max(6, Math.round(H / 18));
  [-0.78, -0.4, -0.02, 0.38, 0.76].forEach((o, f) => {
    for (let y = 0; y < H; y++) {
      if (!wrap && body(y) < 0.35) continue;
      if (wob(y, H, skip, 60 + f + variant * 7) > 0.62) continue;
      const x = Math.round(cx(y) + o * halfW + wob(y, H, Math.max(5, Math.round(H / 24)), 70 + f) * 1.6);
      const v = f % 2 ? 0 : 2;
      s.put(x, y, v);
      s.put(x + 1, y, v);
      if (v) grooves.push([x + 2, y]);
    }
  });
  // Heel gouges: a crescent scraped bare, the blood ridged along its far side.
  const gouges = wrap ? (variant ? [[0.06, 1], [0.46, -1], [0.58, 1]] : [[0.12, -1], [0.54, 1], [0.66, -1]]) : [];
  for (const [t, side] of gouges) s.lobed(cx(t * H) + side * halfW * 0.5, t * H, 6.5, 4.4, t * 9, 0.18, 0);
  const d = paintStain(c, s, r, (x, y, v, dep) => {
    if (v === 2) return 0;
    if (dep === 1) return wob(y + x * 3, H, cs, 33) > 0.1 ? 0 : 1;
    const lane = Math.floor((x - cx(y) + 64) / 4);
    if (dep <= 3) return wob(y + lane * 37, H, cs, 40) > 0 ? 3 : 2;
    // Long runs along the drag: wet lanes between lanes of drying film.
    return wob(y + lane * 23, H, Math.max(5, Math.round(H / 24)), 44 + (lane & 3)) > 0.05 ? 1 : 2;
  });
  // Each groove's lit lip.
  for (const [x, y] of grooves) {
    const n = s.at(x, y);
    if (n >= 0 && s.a[n] === 1 && d[n] >= 2) c.set(x, Y(y), r, 3);
  }
  // Streaks of film along the drag.
  for (let i = 0; i < H / 16; i++) {
    const off = (hash2(i, 3, 51 + variant) * 2 - 1) * halfW * 0.9;
    const y0 = Math.floor(hash2(i, 5, 52 + variant) * H);
    const len = 12 + Math.floor(hash2(i, 7, 53) * Math.min(70, H * 0.6));
    const tone = hash2(i, 9, 54) > 0.7 ? 3 : 2;
    const wide = hash2(i, 11, 55) > 0.7 ? 2 : 1;
    for (let j = 0; j < len; j++) {
      const y = y0 + j;
      const x = Math.round(cx(y) + off + wob(y, H, cs, 70 + i) * 1.2);
      for (let q = 0; q < wide; q++) {
        const n = s.at(x + q, y);
        if (n >= 0 && s.a[n] === 1 && d[n] >= 3) c.set(x + q, Y(y), r, tone);
      }
    }
  }
  // The ridge along each gouge's far side.
  for (const [t, side] of gouges) {
    for (let a = 0; a <= Math.PI; a += 0.12) {
      const x = Math.round(cx(t * H) + side * halfW * 0.5 + Math.cos(a) * 7);
      const y = Math.round(t * H + Math.sin(a) * 5);
      if (s.get(x, y)) c.set(x, Y(y), r, 0);
    }
  }
  // Flakes broken off the dried sides.
  for (let i = 0; i < H / 7; i++) {
    const y = Math.floor(rng.next() * H);
    const x = Math.round(cx(y) + (rng.chance(0.5) ? 1 : -1) * (halfW + rng.range(2, 8)));
    const len = rng.int(2, 6);
    const tone = rng.chance(0.5) ? 3 : 2;
    if (x < 1 || x >= bandW - 1) continue;
    for (let j = 0; j < len; j++) if (s.get(x, y + j) === 0 && Y(y + j) < H) c.set(x, Y(y + j), r, tone);
    if (s.get(x + 1, y + 1) === 0 && Y(y + 1) < H) c.set(x + 1, Y(y + 1), r, tone);
  }
  // One small glint per ~60 texels, where it is still wet.
  for (let y = 24; y < H - 6; y += 60) {
    const gy = y + Math.floor(hash2(y, 2, 61 + variant) * 16) - 8;
    const gx = Math.round(cx(gy) + (hash2(y, 4, 62) * 2 - 1) * halfW * 0.55);
    const n = s.at(gx, gy);
    if (n < 0 || d[n] < 3) continue;
    c.set(gx, Y(gy), r, 4);
    c.set(gx, Y(gy + 1), r, 4);
    c.set(gx + 1, Y(gy + 1), r, 3);
    c.set(gx, Y(gy + 3), r, 3);
  }
}

// ─── Wall decals ─────────────────────────────────────────────────────────────

/**
 * Water stain on a painted wall (NEUTRAL: tinted per wall): a tide-marked
 * bloom (a darker ring, a tea-coloured inside broken into clusters), runs
 * dribbling down from its lower edge. 40 × 48.
 */
export function waterStainDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2stain|${variant}`, 40, 48, (c, k) => {
    const rng = k.rng;
    const ring = k.ramp(0x9a8a70, { light: 0.35, sat: 0.9 });
    const fill = k.ramp(0xc4b8a0, { light: 0.35, sat: 0.85 });
    const cx = 20;
    const cy = 15 + variant * 2;
    const rx = 15 - variant * 3;
    const ry = 11;
    const seed = variant * 3.1 + 1;
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 40; x++) {
        if (!blobIn(x, y, cx, cy, rx, ry, seed)) continue;
        const edge = !blobIn(x, y, cx, cy, rx - 1.6, ry - 1.4, seed);
        const inner = !blobIn(x, y, cx + 2, cy + 1, rx * 0.62, ry * 0.6, seed + 2) && blobIn(x, y, cx + 2, cy + 1, rx * 0.62 + 1, ry * 0.6 + 1, seed + 2);
        if (edge || inner) c.set(x, y, ring, hash2(x, y, 3) > 0.85 ? 2 : 3);
      }
    }
    // Inside: tea-coloured clusters, denser toward the bottom (where the water pooled).
    for (let i = 0; i < 70; i++) {
      const x = rng.int(cx - rx + 2, cx + rx - 3);
      const y = rng.int(cy - ry + 2, cy + ry - 2);
      if (blobIn(x, y, cx, cy, rx - 2, ry - 2, seed) && rng.next() < (y - (cy - ry)) / (ry * 2)) c.cluster(x, y, rng.int(0, 9), fill, 3);
    }
    for (let i = 0; i < 2 + variant; i++) {
      let x = cx - rx * 0.6 + rng.next() * rx * 1.2;
      const len = rng.int(8, 18);
      for (let j = 0; j < len; j++) {
        const y = Math.round(cy + ry * 0.7 + j);
        if (y >= c.h) break;
        if (j > len * 0.6 && bayer(Math.round(x), y) < (j - len * 0.6) / (len * 0.4)) continue;
        c.set(Math.round(x), y, ring, 3);
        if (rng.chance(0.08)) x += rng.chance(0.5) ? 1 : -1;
      }
    }
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Ghost of a picture / notice board that hung here (NEUTRAL): an unfaded rectangle, a nail hole, a tape curl. */
export function pictureGhostDecal(atlas: PwAtlas, variant = 0): PwTile {
  const W = variant ? 28 : 40;
  const H = variant ? 36 : 30;
  const t = atlas.tile(`z2ghost|${variant}`, W, H, (c, k) => {
    const fresh = k.ramp(0xe6e2d8, { light: 0.3, sat: 0.8 });
    const dirt = k.ramp(0xa8a49a, { light: 0.35 });
    c.rect(0, 0, W, H, fresh, 3);
    c.hline(0, 0, W, dirt, 3);
    c.vline(W - 1, 0, H, dirt, 3);
    c.set(W >> 1, 2, dirt, 0);
    c.set((W >> 1) + 1, 3, fresh, 5);
    c.rect(1, H - 4, 3, 3, fresh, 4);
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Plaster crack from a corner (NEUTRAL): a split with a lit lip, a spall at the root. 32 × 48. */
export function wallCrackDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2crack|${variant}`, 32, 48, (c, k) => {
    const rng = k.rng;
    const w = k.ramp(STAIN_BASE, { light: 0.4, sat: 0.95 });
    const dark = k.ramp(darken(STAIN_BASE, 0.45), { light: 0.3 });
    const run = (x: number, y: number, a: number, len: number, depth: number) => {
      for (let i = 0; i < len; i++) {
        const ix = Math.round(x);
        const iy = Math.round(y);
        if (ix < 1 || iy < 1 || ix > 30 || iy > 46) return;
        c.set(ix, iy, dark, 1);
        c.set(ix + 1, iy, w, 4);
        a += rng.spread(0.45);
        x += Math.cos(a);
        y += Math.sin(a);
        if (depth < 2 && rng.chance(0.07)) run(x, y, a + (rng.chance(0.5) ? 0.9 : -0.9), Math.floor(len * 0.45), depth + 1);
      }
    };
    run(variant ? 4 : 16, 2, Math.PI / 2 + rng.spread(0.3), 42, 0);
    c.ellipse(variant ? 5 : 16, 4, 3, 2, w, 2);
    c.hline(variant ? 3 : 14, 2, 5, dark, 2);
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** A hand slid down a wall: fingers, a palm, five streaks to the rail, 2-texel drips ending in beads, one darker rim. 96 x 144 (a shorter 80 x 112). */
export function handprintDecal(atlas: PwAtlas, variant = 0): PwTile {
  const W = variant ? 80 : 96;
  const H = variant ? 112 : 144;
  return atlas.tile(`z2hands|${variant}|n96`, W, H, (c, k) => {
    const r = driedBlood(k);
    const s = new Stain(W, H);
    const hx = variant ? 38 : 44;
    const hy = variant ? 31 : 33;
    const flip = variant ? -1 : 1;
    // Palm 22 x 26, four fingers fanned up, the thumb out to the side.
    s.lobed(hx, hy, 11, 13, variant + 1.7, 0.14);
    for (const [fx, l] of [[-8.5, 14], [-3, 17], [3, 16], [8.5, 12]] as const) s.stroke(hx + fx * flip, hy - 11, hx + fx * 1.25 * flip, hy - 11 - l, 2.3, 1.7);
    s.stroke(hx - 10 * flip, hy + 3, hx - 19 * flip, hy - 8, 2.9, 2);
    // The slide: five streaks off the palm, thinning and drying toward their ends, skipping now and then.
    const lens = variant ? [18, 30, 36, 28, 16] : [62, 84, 74, 90, 56];
    const beads: Array<[number, number]> = [];
    [-9, -4.5, 0, 4.5, 9].forEach((o, i) => {
      let px = hx + o * flip;
      let py = hy + 9;
      const n = Math.ceil(lens[i] / 6);
      for (let j = 1; j <= n; j++) {
        const nx = px + wob(j + i * 5, 64, 16, 80 + i + variant) * 1.6;
        const ny = py + lens[i] / n;
        if (j < 3 || wob(j + i * 9, 64, 20, 90 + i) < 0.62) s.stroke(px, py, nx, ny, 1.9 - (1.1 * (j - 1)) / n, 1.9 - (1.1 * j) / n, j / n > 0.72 ? 3 : 2);
        px = nx;
        py = ny;
      }
      if (i % 2 === 0 || variant) beads.push(drip(s, px, py, 7 + ((i * 7) % 9)));
    });
    const d = paintStain(c, s, r, (_x, _y, v, dep) => {
      if (v === 4) return 1;
      if (v === 5) return dep === 1 ? 0 : 1;
      if (dep === 1) return 0;
      if (v === 3) return 3;
      if (v === 2) return 2;
      return dep >= 5 ? 1 : 2;
    });
    // Wet where it pooled in the palm and at the end of each bead.
    glint(c, s, d, r, hx - 3, hy - 3, 3);
    glint(c, s, d, r, hx + 4, hy + 4, 2);
    for (const [bx, by] of beads) c.set(bx - 1, by - 1, r, 4);
  }, { density: PW_TPM_NEAR });
}

/** A palm dragged along a wall, 2.25 m of it: a planted blot, streaks thinning and drying along the stroke, drips with beads below. 216 x 80. */
export function bloodWipeDecal(atlas: PwAtlas, variant = 0): PwTile {
  const W = 216;
  const H = 80;
  return atlas.tile(`z2wipe|${variant}|n96`, W, H, (c, k) => {
    const r = driedBlood(k);
    const s = new Stain(W, H);
    const cy = (x: number) => 26 + variant * 7 + wob(x, W, 7, 31 + variant) * 4;
    const top = (x: number) => (1 - (x / W) * 0.78) * 15;
    for (let x = 8; x < W - 8; x++) {
      const a = Math.round(cy(x) - top(x) + wob(x, W, 26, 33) * 2.4);
      const b = Math.round(cy(x) + top(x) + wob(x, W, 26, 35) * 2.4);
      for (let y = a; y <= b; y++) s.put(x, y);
    }
    s.lobed(18, cy(18), 12, 15, 2.2 + variant, 0.25);
    // Fingers leave bare lanes along the stroke, opening as the hand lifts.
    for (let f = 0; f < 4; f++) {
      const o = -9 + f * 6;
      for (let x = 34 + f * 11; x < W - 8; x++) {
        if (wob(x, W, 14, 40 + f + variant * 5) > 0.5) continue;
        const y = Math.round(cy(x) + (o * top(x)) / 15);
        s.put(x, y, 0);
        s.put(x, y + 1, 0);
      }
    }
    const beads: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) {
      const x = 22 + i * 28 + Math.round(hash2(i, 1, 50 + variant) * 16);
      beads.push(drip(s, x, Math.round(cy(x) + top(x)) - 1, 8 + Math.round(hash2(i, 2, 51 + variant) * 22)));
    }
    const d = paintStain(c, s, r, (x, y, v, dep) => {
      if (v === 4) return 1;
      if (v === 5) return dep === 1 ? 0 : 1;
      if (dep === 1) return 0;
      if (x > 150) return 3;
      if (x > 80) return wob(y * 11 + x, W, 13, 60 + (y >> 2)) > -0.2 ? 2 : 3;
      return dep >= 5 ? 1 : 2;
    });
    glint(c, s, d, r, 16, Math.round(cy(16)) - 4, 3);
    glint(c, s, d, r, 58, Math.round(cy(58)) + 3, 2);
    for (const [bx, by] of beads) c.set(bx - 1, by - 1, r, 4);
  }, { density: PW_TPM_NEAR });
}

/** Cast-off, never a disc: a small misshapen impact, teardrops thrown along a fan with their tails pointing away, runs below ending in beads. 120 x 120. */
export function spatterDecal(atlas: PwAtlas, variant = 0): PwTile {
  const W = 120;
  const H = 120;
  return atlas.tile(`z2spatter|${variant}|n96`, W, H, (c, k) => {
    const rng = k.rng;
    const r = driedBlood(k);
    const s = new Stain(W, H);
    const ox = 42 + variant * 8;
    const oy = 66;
    s.lobed(ox, oy, 12, 8, 1.3 + variant, 0.42);
    s.lobed(ox + 9, oy - 5, 6, 4, 3.1 + variant, 0.3);
    const flung = 0.65 + variant * 0.3;
    for (let i = 0; i < 52; i++) {
      const back = i % 7 === 0;
      const a = (back ? Math.PI : 0) - flung + rng.spread(back ? 0.5 : 0.8);
      const dist = 12 + Math.pow(rng.next(), 1.3) * (back ? 22 : 66);
      const size = Math.max(0.7, 2.6 - dist / 28) * rng.range(0.7, 1.1);
      const x = ox + Math.cos(a) * dist;
      const y = oy + Math.sin(a) * dist;
      const tail = 2 + size * rng.range(2, 4.5);
      s.stroke(x, y, x + Math.cos(a) * tail, y + Math.sin(a) * tail, size, 0.6);
    }
    const beads: Array<[number, number]> = [];
    for (let i = 0; i < 4; i++) beads.push(drip(s, ox - 8 + i * 6 + rng.int(-1, 1), oy + 3, rng.int(10, 34)));
    const d = paintStain(c, s, r, (_x, _y, v, dep) => {
      if (v === 4) return 1;
      if (v === 5) return dep === 1 ? 0 : 1;
      if (dep === 1) return 1;
      return dep >= 3 ? 1 : 2;
    });
    glint(c, s, d, r, ox - 3, oy - 2, 2);
    for (const [bx, by] of beads) c.set(bx - 1, by - 1, r, 4);
  }, { density: PW_TPM_NEAR });
}

/** A message daubed in blood with a finger (wobbly 5×7 letters at ×2, runs under them). */
export function bloodWordsDecal(atlas: PwAtlas, text: string): PwTile {
  const W = Math.min(256, text.length * 13 + 12);
  return atlas.tile(`z2words|${text}`, Math.ceil(W / 2) * 2, 36, (c, k) => {
    const rng = k.rng;
    const { fresh, old } = bloodRamps(k);
    // Draw the letters, then jitter each column a little (a shaky hand).
    const tmp = c;
    drawText(tmp, text, 6, 6, FONT_5x7, fresh, 3, { scale: 2, spacing: 1 });
    for (let x = 0; x < c.w; x++) {
      const dy = Math.round(Math.sin(x * 0.21 + 1.3) * 1.2);
      if (!dy) continue;
      const col: [number, number][] = [];
      for (let y = 0; y < c.h; y++) {
        const i = y * c.w + x;
        col.push([c.ramp[i], c.tone[i]]);
      }
      for (let y = 0; y < c.h; y++) {
        const sy = y - dy;
        const [r, t] = sy >= 0 && sy < c.h ? col[sy] : [0, 0];
        if (r) c.set(x, y, r, t);
        else c.ramp[y * c.w + x] = 0;
      }
    }
    // Runs from the bottoms of strokes; thin strokes darker (the finger running dry).
    for (let x = 0; x < c.w; x++) {
      for (let y = c.h - 2; y > 0; y--) {
        if (c.at(x, y) && !c.at(x, y + 1) && rng.chance(0.18)) {
          const len = rng.int(2, 9);
          for (let j = 1; j <= len; j++) if (y + j < c.h) c.set(x, y + j, old, j === len ? 2 : 3);
          break;
        }
      }
    }
    for (let i = 0; i < 30; i++) {
      const x = rng.int(0, c.w - 1);
      const y = rng.int(0, c.h - 1);
      if (c.at(x, y) === fresh) c.set(x, y, fresh, rng.chance(0.3) ? 4 : 2);
    }
  });
}

// ─── Floor decals ────────────────────────────────────────────────────────────

/**
 * A pool of blood (top view), designed: lobes where the floor's fall carried it, a dark outer edge,
 * a meniscus just inside it catching the light in broken arcs, shallow film at the margin, a deep
 * dark middle, the troffer overhead broken across the surface, drops thrown clear. 128 x 112 (`big` 192 x 168).
 */
export function bloodPoolDecal(atlas: PwAtlas, variant = 0, big = false): PwTile {
  const W = big ? 192 : 128;
  const H = big ? 168 : 112;
  const S = W / 128;
  return atlas.tile(`z2pool|${variant}|${big ? 'L' : 'M'}|n96`, W, H, (c, k) => {
    const rng = k.rng;
    const r = driedBlood(k);
    const s = new Stain(W, H);
    const seed = variant * 2.3 + 0.7;
    const cx = W / 2;
    const cy = H / 2;
    s.lobed(cx, cy, (42 - variant * 4) * S, 31 * S, seed, 0.28);
    for (let i = 0; i < 6; i++) {
      const a = seed + i * 1.05 + rng.range(-0.25, 0.25);
      const dist = rng.range(30, 38) * S;
      s.lobed(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist * 0.78, rng.range(8, 14) * S, rng.range(6, 10) * S, seed + i, 0.3);
    }
    const drops: Array<[number, number]> = [];
    for (let i = 0; i < 15; i++) {
      const a = rng.next() * TAU;
      const dist = rng.range(46, 56) * S;
      const rr = rng.range(0.9, 2.6);
      const x = cx + Math.cos(a) * dist;
      const y = cy + Math.sin(a) * dist * 0.8;
      s.disc(x, y, rr * 1.25, rr);
      if (rr > 1.8) drops.push([Math.round(x), Math.round(y)]);
    }
    const d = paintStain(c, s, r, (x, y, _v, dep) => {
      if (dep === 1) return 0;
      if (dep === 2) {
        const a = Math.atan2(y - cy, x - cx);
        return Math.sin(a * 3 + seed) > 0.05 && wob(a, TAU, 16, 81 + variant) > -0.25 ? 3 : 1;
      }
      if (dep <= 4) return 2;
      if (blobIn(x, y, cx + (variant - 1) * 12 * S, cy + 6 * S, 16 * S, 10 * S, seed + 5, 0.35)) return 0;
      if (blobIn(x, y, cx - 20 * S, cy - 12 * S, 11 * S, 7 * S, seed + 7, 0.35)) return 2;
      return 1;
    });
    // The troffer, a long pale bar in pieces (two tubes: one bright, one dim beside it).
    const bx = cx - (6 + variant * 4) * S;
    const by = cy - 19 * S;
    for (const [p0, pl] of [[0, 9], [12, 7], [22, 13], [37, 6]] as const) {
      for (let j = 0; j < pl * S; j++) {
        const y = Math.round(by + p0 * S + j);
        const xs = Math.round(bx + Math.sin(y * 0.22) * 1.6);
        const hw = Math.round((2.4 + wob(y, 64, 9, 90) * 0.9) * S);
        for (let q = -hw; q <= hw; q++) if (d[s.at(xs + q, y)] >= 3) c.set(xs + q, y, r, Math.abs(q) === hw ? 3 : 4);
        if (j % 7 < 4 && d[s.at(xs + hw + 4, y)] >= 3) { c.set(xs + hw + 4, y, r, 3); c.set(xs + hw + 5, y, r, 3); }
      }
    }
    for (const [x, y] of drops) c.set(x - 1, y - 1, r, 3);
  }, { density: PW_TPM_NEAR });
}

/**
 * Drag trail (wrap along v: laid as a ribbon 0.8 m wide, so only the first 77 of the 96 texels show):
 * a body-wide smear, five finger tracks held through it and on across the lifts, heel gouges, a wet
 * core drying and flaking at its edges. Two variants. 96 x 384 (0.8 x 4 m of drag).
 */
export function dragTrailTile(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2drag|${variant}|n96`, 96, 384, (c, k) => paintDrag(c, k, 76.8, variant, true), { wrap: true, density: PW_TPM_NEAR });
}

/** A short smear (a stair's width of it), ends painted out rather than cut. 72 x 30. */
export function bloodSmearDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2smear|${variant}|n96`, 72, 30, (c, k) => paintDrag(c, k, 72, variant, false), { density: PW_TPM_NEAR });
}

/** Scattered charts (cut out): curled sheets with a header, printed text blocks, a dog-ear and a contact shadow; one with a boot print, one dabbed. 96 x 76. */
export function papersDecal(atlas: PwAtlas, variant = 0): PwTile {
  const W = 96;
  const H = 76;
  return atlas.tile(`z2papers|${variant}|n96`, W, H, (c, k) => {
    const rng = k.rng;
    const pale = [k.ramp(0xbdbaad, { light: 0.14, sat: 0.5 }), k.ramp(0xb4a884, { light: 0.14, sat: 0.6 }), k.ramp(0x9ea8b2, { light: 0.14, sat: 0.6 })];
    const ink = k.ramp(0x3e4048, { light: 0.2, sat: 0.6 });
    const shadow = k.ramp(0x282a30, { light: 0.1, sat: 0.4 });
    const blood = driedBlood(k);
    const hw = 15;
    const hh = 20;
    const sheet = (cx: number, cy: number, ang: number, pr: number, foot: boolean, dab: boolean) => {
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const uAt = (x: number, y: number) => (x - cx) * ca + (y - cy) * sa;
      const vAt = (x: number, y: number) => -(x - cx) * sa + (y - cy) * ca;
      const bow = (u: number) => Math.sin(((u + hw) / (2 * hw)) * Math.PI) * 1.8;
      const inside = (x: number, y: number) => {
        const u = uAt(x, y);
        const v = vAt(x, y);
        return u >= -hw && u <= hw && v >= -hh + bow(u) * 0.6 && v <= hh - bow(u) && u + v <= hw + hh - 6;
      };
      const ext = Math.ceil(Math.hypot(hw, hh)) + 2;
      const x0 = Math.round(cx) - ext;
      const y0 = Math.round(cy) - ext;
      for (let y = y0; y <= y0 + ext * 2; y++) for (let x = x0; x <= x0 + ext * 2; x++) if (!inside(x, y) && (inside(x - 1, y) || inside(x, y - 1))) c.set(x, y, shadow, 1);
      for (let y = y0; y <= y0 + ext * 2; y++) {
        for (let x = x0; x <= x0 + ext * 2; x++) {
          if (!inside(x, y)) continue;
          const u = uAt(x, y);
          const v = vAt(x, y);
          const fold = u + v > hw + hh - 12;
          // Paper never goes above tone 4; the curled edges roll a tone down.
          c.set(x, y, pr, fold ? 4 : u < -hw + 3 || v > hh - bow(u) - 2 ? 2 : 3);
          if (fold) continue;
          const row = Math.floor(v + hh);
          const col = Math.floor(u + hw);
          const head = row >= 4 && row < 7 && col >= 4 && col < 20;
          const block = (row >= 11 && row < 23 && row % 3 === 2) || (row >= 27 && row < 37 && row % 3 === 0);
          const word = block && col >= 3 && col < 27 - hash2(row, 1, 3) * 9 && hash2(Math.floor(col / 4), row, 5) > 0.2 && col % 5 !== 4;
          if (head) c.set(x, y, ink, 2);
          else if (word) c.set(x, y, ink, 3);
          if (foot && (blobIn(u, v, 2, -5, 6.5, 10, 2.3, 0.12) || blobIn(u, v, 1, 11, 5.5, 4.5, 1.1, 0.12)) && Math.floor(v + 200) % 3 !== 0) c.set(x, y, blood, 2);
          if (dab && blobIn(u, v, -7, 12, 5, 4, 3.3, 0.4)) c.set(x, y, blood, 2);
        }
      }
    };
    const n = 2 + (variant % 2);
    for (let i = 0; i < n; i++) {
      const cx = 26 + (44 * (i + rng.next() * 0.5)) / Math.max(1, n - 0.5);
      const cy = 28 + rng.next() * 18;
      sheet(cx, cy, rng.spread(0.24) + (i % 2 ? 0.2 : -0.16), pale[(i + variant) % 3], variant === 1 && i === n - 1, variant === 2 && i === n - 1);
    }
  }, { density: PW_TPM_NEAR });
}

/** A floor drain: a rust-stained seat, a machined rim, bars over a black sump with rust bleeding across them. 64 x 64. */
export function drainDecal(atlas: PwAtlas): PwTile {
  const W = 64;
  return atlas.tile('z2drain|n96', W, W, (c, k) => {
    const m = k.ramp(0x6a6e6a, { light: 0.45, sat: 0.5 });
    const rust = k.ramp(0x5c3f2c, { light: 0.35, sat: 0.6 });
    const cx = 31.5;
    const s = new Stain(W, W);
    s.lobed(cx, cx, 28, 28, 2.7, 0.1);
    paintStain(c, s, rust, (x, y, _v, d) => {
      if (Math.hypot(x - cx, y - cx) <= 23) return -1;
      const a = Math.atan2(y - cx, x - cx);
      if (d === 1) return wob(a, TAU, 22, 6) > -0.3 ? 2 : -1;
      return wob(a, TAU, 14, 9) > 0.1 ? 3 : 2;
    });
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const rr = Math.hypot(x - cx, y - cx);
        if (rr > 23) continue;
        const a = Math.atan2(y - cx, x - cx);
        if (rr > 20) {
          c.set(x, y, m, rr > 22 ? 2 : rr <= 21 && wob(a, TAU, 18, 4) > -0.2 ? 4 : 3);
          continue;
        }
        const row = (y + 3) % 6;
        const rusted = blobIn(x, y, 22, 18, 7, 5, 1.7, 0.35) || blobIn(x, y, 41, 42, 6, 8, 3.1, 0.35);
        if (row >= 4) c.set(x, y, m, 0);
        else if (rusted) c.set(x, y, rust, row === 0 ? 3 : 2);
        else c.set(x, y, m, row === 0 ? 4 : row === 3 ? 2 : 3);
      }
    }
  }, { density: PW_TPM_NEAR });
}

/** Spilled pills, a syringe and a dropped glove (top view). 32 × 24. */
export function pillsDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z2pills', 32, 24, (c, k) => {
    const rng = k.rng;
    const pill = [k.ramp(0xe8e4d8, { light: 0.3 }), k.ramp(0xd85a3a, { light: 0.4 }), k.ramp(0x4a8ad8, { light: 0.4 })];
    const glove = k.ramp(0x8ab0d8, { light: 0.4 });
    const steel = k.ramp(0xb8c0c4, { light: 0.5 });
    for (let i = 0; i < 14; i++) {
      const x = rng.int(2, 20);
      const y = rng.int(2, 20);
      const p = pill[i % 3];
      c.set(x, y, p, 4);
      c.set(x + 1, y, p, 2);
    }
    // Syringe: barrel, plunger, needle.
    c.line(18, 6, 28, 10, steel, 4);
    c.line(18, 7, 28, 11, steel, 2);
    c.line(28, 10, 31, 11, steel, 5);
    // Glove: palm + fingers.
    c.ellipse(9, 16, 4, 3, glove, 3);
    for (let f = 0; f < 4; f++) c.line(6 + f * 2, 13, 5 + f * 2, 10, glove, 3);
  });
}

/** A dried spill as irregular rings (NEUTRAL): a lobed outline, a tide line a tone down, a broken dried band and an older ring inside it, a pale broken streak of the troffer in the damp middle. 128 x 88. */
export function floorStainDecal(atlas: PwAtlas, variant = 0): PwTile {
  const W = 128;
  const H = 88;
  const t = atlas.tile(`z2fstain|${variant}|n96`, W, H, (c, k) => {
    const r = k.ramp(variant ? 0x8a8070 : 0x908c84, { light: 0.35, sat: 0.4 });
    const s = new Stain(W, H);
    const seed = variant + 4.2;
    const cx = W / 2;
    const cy = H / 2;
    s.lobed(cx, cy, 42, 25, seed, 0.38);
    s.lobed(cx + (variant ? -26 : 24), cy + (variant ? -7 : 8), 24, 14, seed + 2.1, 0.38);
    s.lobed(cx + (variant ? 28 : -24), cy + (variant ? 9 : -9), 16, 11, seed + 3.7, 0.36);
    paintStain(c, s, r, (x, y, _v, d) => {
      const a = Math.atan2(y - cy, x - cx);
      if (d === 1) return wob(a, TAU, 30, 5 + variant) > -0.4 ? 2 : -1;
      if (d <= 4) return wob(a, TAU, 24, 7 + variant) > 0 ? 3 : -1;
      if (d >= 9 && d <= 10) return wob(a, TAU, 18, 13 + variant) > 0.05 ? 3 : -1;
      return -1;
    }, 12);
    const sy = Math.round(cy) - 4 + variant * 3;
    for (const [x0, len] of [[-22, 14], [-5, 7], [6, 19], [28, 5]] as const) {
      c.hline(Math.round(cx) + x0, sy, len, r, 4);
      c.hline(Math.round(cx) + x0 + 1, sy + 1, Math.max(1, len - 2), r, 4);
    }
  }, { density: PW_TPM_NEAR });
  t.neutral = STAIN_BASE;
  return t;
}

/** Floor crack in tile / screed with a lifted chip (NEUTRAL). 40 × 24. */
export function floorCrackDecal(atlas: PwAtlas): PwTile {
  const t = atlas.tile('z2fcrack', 40, 24, (c, k) => {
    const rng = k.rng;
    const d = k.ramp(darken(STAIN_BASE, 0.45), { light: 0.3 });
    const l = k.ramp(STAIN_BASE, { light: 0.45 });
    let x = 2;
    let y = 12;
    let a = rng.spread(0.3);
    for (let i = 0; i < 38; i++) {
      c.set(Math.round(x), Math.round(y), d, 1);
      c.set(Math.round(x), Math.round(y) + 1, l, 4);
      a += rng.spread(0.5);
      a = Math.max(-0.8, Math.min(0.8, a));
      x += Math.cos(a);
      y += Math.sin(a);
      if (y < 2 || y > 21) a = -a;
    }
  });
  t.neutral = STAIN_BASE;
  return t;
}

// ─── Ceiling decals ──────────────────────────────────────────────────────────

/**
 * A missing ceiling tile (1 m, sits in the grid): the black void of the
 * plenum, a duct's lit underside crossing it, a cable loop, insulation tufts,
 * the broken edge of the tile left in the grid. 32 × 32.
 */
export function ceilingHoleDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2hole|${variant}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const voidR = k.ramp(0x101214, { light: 0.3 });
    const duct = k.ramp(0x7a7e80, { light: 0.5, sat: 0.5 });
    const ins = k.ramp(0xc8a860, { light: 0.4 });
    const cable = k.ramp(0x2a2a30, { light: 0.4 });
    c.rect(1, 1, 30, 30, voidR, 1);
    if (variant === 0) {
      c.rect(1, 10, 30, 9, duct, 2);
      c.hline(1, 10, 30, duct, 4);
      c.hline(1, 18, 30, duct, 1);
      for (let x = 5; x < 31; x += 8) c.vline(x, 10, 9, duct, 1);
    } else {
      // A pipe with a bracket.
      c.rect(1, 20, 30, 3, duct, 3);
      c.hline(1, 20, 30, duct, 4);
      c.rect(14, 15, 2, 5, cable, 2);
    }
    for (let i = 0; i < 2; i++) {
      const x0 = rng.int(3, 26);
      for (let j = 0; j < 14; j++) c.set(x0 + Math.round(Math.sin(j * 0.5) * 3), 2 + j * 2, cable, 3);
    }
    for (let i = 0; i < 5; i++) c.cluster(rng.int(2, 28), rng.int(2, 28), rng.int(4, 9), ins, rng.chance(0.5) ? 2 : 3);
    // Broken tile edge left in the grid (top-left) and the grid's lip.
    c.poly([1, 1, 14, 1, 9, 5, 4, 4, 1, 8], k.ramp(0xb8bcb0, { light: 0.4, sat: 0.6 }), 2);
  });
}

/** A water-stained ceiling tile (NEUTRAL, sits in the grid): concentric tea rings, a sag line, mould dots. 32 × 32. */
export function ceilingStainDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2cstain|${variant}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const base = k.ramp(darken(STAIN_BASE, 0.94), { light: 0.4, sat: 0.7 });
    const ring = k.ramp(0x9a8462, { light: 0.35 });
    const mould = k.ramp(0x5a6050, { light: 0.3 });
    c.rect(1, 1, 30, 30, base, 3);
    for (let y = 1; y < 31; y++) {
      for (let x = 1; x < 31; x++) {
        const out = blobIn(x, y, 16, 15, 12, 11, variant + 1.3, 0.3);
        const ring1 = out && !blobIn(x, y, 16, 15, 10.5, 9.5, variant + 1.3, 0.3);
        const ring2 = blobIn(x, y, 17, 16, 6, 5, variant + 2.6, 0.3) && !blobIn(x, y, 17, 16, 4.8, 3.8, variant + 2.6, 0.3);
        if (ring1 || ring2) c.set(x, y, ring, 3);
        else if (out && hash2(x >> 1, y >> 1, 3) > 0.7) c.set(x, y, ring, 4);
      }
    }
    for (let i = 0; i < 8; i++) c.set(rng.int(4, 27), rng.int(4, 27), mould, 2);
    c.hline(4, 22, 24, base, 1);
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Rain puddle on asphalt (cut out): dark mirror water, sky glints, ripple rings (GLOW). 64 × 40. */
export function puddleDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2puddle|${variant}`, 64, 40, (c, k) => {
    const rng = k.rng;
    const w = k.ramp(0x1c2838, { light: 0.4, sat: 1 });
    const sky = k.ramp(0x5a6a90, { light: 0.4 });
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 64; x++) {
        if (!blobIn(x, y, 32, 20, 28, 16, variant * 1.7 + 0.4, 0.3)) continue;
        const edge = !blobIn(x, y, 32, 20, 26.5, 14.5, variant * 1.7 + 0.4, 0.3);
        c.set(x, y, w, edge ? 3 : y < 14 ? 2 : 1);
      }
    }
    // Reflected sky glow (the lamps / the city) as broken horizontal glints, and ripple rings (outdoors).
    const indoor = variant >= 2;
    for (let i = 0; i < (indoor ? 4 : 10); i++) {
      const x = rng.int(10, 50);
      const y = rng.int(8, 32);
      const len = rng.int(2, 6);
      for (let j = 0; j < len; j++) if (c.at(x + j, y)) c.set(x + j, y, indoor ? w : sky, indoor ? 4 : j % 3 === 0 ? 4 : 3, indoor ? 0 : PWF.GLOW);
    }
    for (let i = 0; i < (indoor ? 0 : 4); i++) {
      const cx = rng.int(14, 50);
      const cy = rng.int(10, 30);
      const r = rng.range(2, 4);
      for (let a = 0; a < 6.28; a += 0.35) {
        const x = Math.round(cx + Math.cos(a) * r * 1.6);
        const y = Math.round(cy + Math.sin(a) * r * 0.7);
        if (c.at(x, y)) c.set(x, y, sky, 2, PWF.GLOW);
      }
    }
  });
}


/**
 * Broken wall tiles (NEUTRAL: tinted to the wall's glaze; laid snapped to the
 * tile grid): two or three tiles knocked off showing the mortar bed with its
 * comb ridges, a cracked tile, chipped edges. 3 × 2 tiles of `tw` × `th`.
 */
export function brokenTilesDecal(atlas: PwAtlas, tw: number, th: number, variant = 0): PwTile {
  const W = tw * 3;
  const H = th * 2;
  const t = atlas.tile(`z2broken|${tw}x${th}|${variant}`, W, H, (c, k) => {
    const rng = k.rng;
    const tile = k.ramp(STAIN_BASE, { light: 0.5, sat: 0.95 });
    const bed = k.ramp(0x8a8478, { light: 0.35, sat: 0.6 });
    const cells: [number, number, 'gone' | 'crack'][] = variant
      ? [[0, 1, 'gone'], [1, 1, 'gone'], [1, 0, 'crack'], [2, 1, 'crack']]
      : [[1, 0, 'gone'], [2, 0, 'gone'], [2, 1, 'gone'], [0, 0, 'crack']];
    for (const [cx, cy, kind] of cells) {
      const x0 = cx * tw;
      const y0 = cy * th;
      if (kind === 'gone') {
        for (let y = y0; y < y0 + th; y++) for (let x = x0; x < x0 + tw; x++) c.set(x, y, bed, (y - y0) % 3 === 0 ? 2 : 3);
        // Shadow under the upper edge of the hole (the tile above stands proud), chipped rim.
        c.hline(x0, y0, tw, bed, 1);
        c.vline(x0, y0, th, bed, 1);
        for (let i = 0; i < 3; i++) c.set(x0 + rng.int(1, tw - 2), y0 + th - 1, tile, 4);
      } else {
        for (let y = y0 + 1; y < y0 + th; y++) for (let x = x0 + 1; x < x0 + tw; x++) c.set(x, y, tile, 3);
        let x = x0 + 1;
        let y = y0 + 1 + rng.int(0, th - 3);
        for (let i = 0; i < tw + th; i++) {
          if (x >= x0 + tw || y >= y0 + th || y <= y0) break;
          c.set(x, y, tile, 1);
          if (rng.chance(0.6)) x++;
          else y += rng.chance(0.5) ? 1 : -1;
        }
      }
    }
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** A dropped meal tray (top view): the tray, an upturned plate, spilled peas and a cup. 16 × 12. */
export function trayDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z2tray', 16, 12, (c, k) => {
    const tray = k.ramp(0xc8b8a0, { light: 0.35 });
    const plate = k.ramp(0xe8e8e0, { light: 0.25 });
    const pea = k.ramp(0x6a8a2a, { light: 0.4 });
    c.rect(0, 1, 13, 10, tray, 3);
    c.hline(0, 1, 13, tray, 4);
    c.ellipse(5, 6, 3.5, 3, plate, 3);
    c.set(4, 5, plate, 5);
    for (const [x, y] of [[10, 3], [11, 7], [13, 9], [14, 4], [9, 9]]) c.set(x, y, pea, 3);
    c.ellipse(11, 4, 1.6, 1.6, k.ramp(0x9a6a3a, { light: 0.4 }), 3);
  });
}

/**
 * Grime at the ceiling line (NEUTRAL, tinted to the wall; cut out): a ragged
 * dark band under the ceiling with dribbles running down from it, the ends
 * dithered off. Placed by rule along walls (never in the wall's repeat). 64 × 14.
 */
export function ceilingGrimeDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2cgrime|${variant}`, 64, 14, (c, k) => {
    const g = k.ramp(darken(STAIN_BASE, 0.78), { light: 0.35, sat: 0.7 });
    for (let x = 0; x < 64; x++) {
      const edge = Math.min(x, 63 - x) / 10;
      const band = Math.round(1 + hash2(x >> 2, variant, 3) * 2);
      for (let y = 0; y < band; y++) if (bayer(x, y) < Math.min(1, edge)) c.set(x, y, g, y === 0 ? 2 : 3);
      if (hash2(x, variant, 5) > 0.82 && edge > 0.5) {
        const len = 3 + Math.floor(hash2(x, variant, 6) * 10);
        for (let y = band; y < band + len; y++) if (!(y > band + len * 0.6 && bayer(x, y) < 0.5)) c.set(x, y, g, 3);
      }
    }
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Mop splash above the skirting (NEUTRAL, cut out): grey arcs and dots a hand high. 64 × 10. */
export function mopSplashDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2mop|${variant}`, 64, 10, (c, k) => {
    const rng = k.rng;
    const g = k.ramp(darken(STAIN_BASE, 0.8), { light: 0.35, sat: 0.6 });
    for (let i = 0; i < 9; i++) {
      const x0 = rng.int(4, 54);
      const w = rng.int(4, 10);
      for (let j = 0; j < w; j++) {
        const y = 9 - Math.round(Math.sin((j / w) * Math.PI) * rng.range(2, 5));
        c.set(x0 + j, y, g, 3);
      }
    }
    for (let i = 0; i < 24; i++) c.set(rng.int(2, 61), rng.int(1, 9), g, 3);
    for (let x = 0; x < 64; x++) if (hash2(x >> 1, variant, 8) > 0.5) c.set(x, 9, g, 2);
  });
  t.neutral = STAIN_BASE;
  return t;
}
