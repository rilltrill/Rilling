import type { PwCanvas, PwRng } from './canvas';
import { hash2 } from './surfaces';

/**
 * PIXEL WORLD 2 brushes: the shared hand of every exterior painter (docs/PIXELWORLD2.md §4).
 *
 * The first pass drew surfaces with fills, a scatter of clusters and a few lines; the result
 * read as "a texture on a box". These brushes draw FORMS the way a background artist of the
 * mid-2000s arcade boards did, with one rule each:
 *
 *  - an edge of anything raised or sunken is three things: a lit side, a shadow side and a cast
 *    shadow (`formRect`, `formMask`, `groove`, `ridge`);
 *  - wear is a SHAPE with its own light (`chip`, `bump`, `wearDrift`) — never a speck;
 *  - a change of value is a STEP whose edge is hand-wobbled and breaks into dashes (`band`,
 *    `contact`, `lightPool`) — never a gradient, never a checker screen;
 *  - water is drawn: runs that taper and pool (`drip`, `stainFan`), sheen as lens-shaped
 *    strokes (`sheen`), a light mirrored as a column of broken dashes (`wetStreak`);
 *  - grain is drifts of small clusters with a pit beside the chip (`aggregate`), masonry is
 *    units in runs of one tone with a lit arris and a shadowed joint (`courses`).
 *
 * Everything works in ramp space on a `PwCanvas` (shift a tone by whole steps, swap a ramp),
 * so it holds under the ramp-step light: no brush ever writes a colour.
 *
 * Light convention (canvas.ts): from the upper left. On a FLOOR tile painted with its far side
 * up (the way the rail sees it) that makes the far / left rim of a hole dark-inside and its
 * near / right rim lit, exactly as on a wall.
 *
 * `Brush2` wraps a canvas with the tile's wrap axes, so one painter serves wrap tiles and
 * modules; coordinates are canvas texels (y down). Sparse brushes go through `at()`; painters
 * of big ground modules fill their base passes on the typed arrays directly (`c.ramp`,
 * `c.tone`) and use the brushes for the forms.
 */

/** A seeded 1-D wobble in −1…1: a hand-drawn line is never straight. `period` > 0 makes it seamless on that length. */
export function wobbler(seed: number, period = 0, speed = 1): (t: number) => number {
  const p1 = hash2(seed, 1, 77) * 6.283;
  const p2 = hash2(seed, 2, 77) * 6.283;
  const p3 = hash2(seed, 3, 77) * 6.283;
  if (period > 0) {
    // Whole numbers of waves along the period.
    const k = 6.283185 / period;
    const n1 = Math.max(1, Math.round((period / 97) * speed));
    const n2 = Math.max(2, Math.round((period / 41) * speed));
    const n3 = Math.max(3, Math.round((period / 17) * speed));
    return (t) => 0.55 * Math.sin(t * k * n1 + p1) + 0.3 * Math.sin(t * k * n2 + p2) + 0.15 * Math.sin(t * k * n3 + p3);
  }
  const s = speed;
  return (t) => 0.55 * Math.sin(t * 0.065 * s + p1) + 0.3 * Math.sin(t * 0.153 * s + p2) + 0.15 * Math.sin(t * 0.37 * s + p3);
}

/**
 * A run pattern along a line: true inside dashes of `min`…`max` texels parted by gaps of
 * `gmin`…`gmax` — the broken stroke every stepped edge ends in. Deterministic in (i, seed).
 */
export function dashAt(i: number, seed: number, min = 2, max = 5, gmin = 1, gmax = 3): boolean {
  // Cells of the longest dash + gap; each cell holds one dash at a hashed offset.
  const cell = max + gmax;
  const ci = Math.floor(i / cell);
  const h = hash2(ci, seed, 311);
  const len = min + Math.floor(h * (max - min + 1));
  const gap = gmin + Math.floor(hash2(ci, seed, 312) * (gmax - gmin + 1));
  const off = Math.floor(hash2(ci, seed, 313) * Math.max(1, cell - len - gap + 1));
  const li = i - ci * cell;
  return li >= off && li < off + len;
}

/** An irregular lobed shape (a puddle, a patch, a stain, a chip) as a mask: `m[y * w + x]` = 1 inside. */
export interface Blob {
  m: Uint8Array;
  w: number;
  h: number;
}

/**
 * A lobed blob filling about a `w` × `h` box: a few overlapping ellipses strung along a wandering
 * spine, then one majority pass so no single texel sticks out — an outline with bays and
 * tongues, the way spilled or worn things are drawn. `lobes` 1 = an egg, 6 = a long ragged pool;
 * `smooth` 1…4 rounds the bays off (standing water, a stain that has spread).
 */
export function blob(rng: PwRng, w: number, h: number, lobes = 4, round = 0.5, smooth = 0): Blob {
  w = Math.max(2, Math.round(w));
  h = Math.max(2, Math.round(h));
  const m = new Uint8Array(w * h);
  const long = w >= h;
  const L = long ? w : h;
  const S = long ? h : w;
  let c = S * (0.35 + rng.next() * 0.3);
  for (let k = 0; k < lobes; k++) {
    const t = lobes === 1 ? 0.5 : k / (lobes - 1);
    // Along the spine: fat in the middle, thin toward the ends.
    const taper = 1 - Math.abs(t - 0.5) * (1.1 - round * 0.6);
    const ra = Math.max(1.2, (L / (lobes + 1)) * (0.8 + rng.next() * 0.7));
    const rb = Math.max(1, S * 0.5 * taper * (0.6 + rng.next() * 0.5));
    const a = ra + t * (L - 2 * ra);
    c = Math.min(S - rb, Math.max(rb, c + rng.spread(S * 0.22)));
    const cx = long ? a : c;
    const cy = long ? c : a;
    const rx = long ? ra : rb;
    const ry = long ? rb : ra;
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(h - 1, Math.ceil(cy + ry)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(w - 1, Math.ceil(cx + rx)); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        if (u * u + v * v <= 1) m[y * w + x] = 1;
      }
    }
  }
  // `smooth` passes of a 5 × 5 majority melt the lobes into one outline (a sheet of water, not a cloud).
  for (let p = 0; p < smooth && w > 8 && h > 8; p++) {
    const o = m.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let n = 0;
        for (let j = -2; j <= 2; j++) {
          const yy = y + j;
          if (yy < 0 || yy >= h) continue;
          for (let i = -2; i <= 2; i++) {
            const xx = x + i;
            if (xx >= 0 && xx < w) n += o[yy * w + xx];
          }
        }
        m[y * w + x] = n >= 13 ? 1 : 0;
      }
    }
  }
  if (w > 4 && h > 4) {
    // Majority of the 3 × 3: fills pinholes, takes off single-texel spikes.
    const o = m.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const n = o[i - w - 1] + o[i - w] + o[i - w + 1] + o[i - 1] + o[i + 1] + o[i + w - 1] + o[i + w] + o[i + w + 1];
        if (o[i] && n <= 2) m[i] = 0;
        else if (!o[i] && n >= 6) m[i] = 1;
      }
    }
  }
  return { m, w, h };
}

/**
 * A shore: one closed outline with a few broad bays and points (a puddle, a pool of oil or blood, a
 * scorch) — an ellipse whose radius swells and shrinks round the compass in two to five slow
 * waves, `rough` 0…1 their depth. Where `blob` reads as lobes run together, this reads as one
 * sheet lying on a surface.
 */
export function shore(rng: PwRng, w: number, h: number, rough = 0.5): Blob {
  w = Math.max(3, Math.round(w));
  h = Math.max(3, Math.round(h));
  const m = new Uint8Array(w * h);
  const ph = [rng.next() * 6.283, rng.next() * 6.283, rng.next() * 6.283, rng.next() * 6.283];
  const am = [0.16 + rng.next() * 0.1, 0.1 + rng.next() * 0.08, 0.06 + rng.next() * 0.05, 0.04 + rng.next() * 0.03];
  // (The outline is kept inside the box: the base radius leaves room for the largest swell.)
  const base = 1 / (1 + rough * (am[0] + am[1] + am[2] + am[3]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5 - w / 2) / (w / 2);
      const v = (y + 0.5 - h / 2) / (h / 2);
      const a = Math.atan2(v, u);
      const r = base * (1 + rough * (am[0] * Math.sin(a * 2 + ph[0]) + am[1] * Math.sin(a * 3 + ph[1]) + am[2] * Math.sin(a * 5 + ph[2]) + am[3] * Math.sin(a * 8 + ph[3])));
      if (u * u + v * v <= r * r) m[y * w + x] = 1;
    }
  }
  return { m, w, h };
}

/** A filled ellipse / disc as a mask (covers, lids, discs: anything turned). */
export function discBlob(w: number, h: number): Blob {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5 - w / 2) / (w / 2);
      const v = (y + 0.5 - h / 2) / (h / 2);
      if (u * u + v * v <= 1) m[y * w + x] = 1;
    }
  }
  return { m, w, h };
}

/** How a form's edges are drawn (tone steps). */
export interface FormOpts {
  /** Raised (lit top / left, dark bottom / right, a cast shadow) or sunken (the reverse inside, no cast). Default raised. */
  raised?: boolean;
  /** Steps the lit edge gains (default 1). */
  lit?: number;
  /** Steps the shadow edge loses (default 1). */
  dark?: number;
  /** Steps the surface below-right loses in the cast shadow (default 1; 0 = none). */
  cast?: number;
  /** Cast shadow length in texels (default 1). */
  castLen?: number;
  /** Shift every texel of the shape first (a chip's floor is darker: −1). */
  fill?: number;
  /** Recolour the shape (a patch of another material) before its edges are drawn; `tone` then sets its flat tone. */
  ramp?: number;
  tone?: number;
  /** Only touch texels of this ramp (stay inside one material). */
  only?: number;
}

export class Brush2 {
  readonly w: number;
  readonly h: number;
  readonly R: Uint16Array;
  readonly T: Float32Array;
  readonly F: Uint8Array;
  readonly wrapX: boolean;
  readonly wrapY: boolean;
  constructor(
    readonly c: PwCanvas,
    o: { wrapX?: boolean; wrapY?: boolean } = {},
  ) {
    this.w = c.w;
    this.h = c.h;
    this.R = c.ramp;
    this.T = c.tone;
    this.F = c.flag;
    this.wrapX = !!o.wrapX;
    this.wrapY = !!o.wrapY;
  }

  /** Texel index of (x, y) on this tile (wrapped on its wrap axes), −1 outside. */
  at(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.w) {
      if (!this.wrapX) return -1;
      x = ((x % this.w) + this.w) % this.w;
    }
    if (y < 0 || y >= this.h) {
      if (!this.wrapY) return -1;
      y = ((y % this.h) + this.h) % this.h;
    }
    return y * this.w + x;
  }

  set(x: number, y: number, ramp: number, tone: number, flag = 0) {
    const i = this.at(x, y);
    if (i < 0) return;
    this.R[i] = ramp;
    this.T[i] = tone;
    this.F[i] = flag;
  }

  /** Shift a painted texel's tone by `dt` steps (clamped 0…5); `only` limits it to one ramp. */
  shift(x: number, y: number, dt: number, only = 0) {
    const i = this.at(x, y);
    if (i < 0 || !this.R[i] || (only && this.R[i] !== only)) return;
    const t = this.T[i] + dt;
    this.T[i] = t < 0 ? 0 : t > 5 ? 5 : t;
  }

  /** Recolour a painted texel, keeping its tone (+ `dt`): a stain, rust, moss, a tint of light on whatever is there. */
  tint(x: number, y: number, ramp: number, dt = 0, only = 0) {
    const i = this.at(x, y);
    if (i < 0 || !this.R[i] || (only && this.R[i] !== only)) return;
    this.R[i] = ramp;
    const t = this.T[i] + dt;
    this.T[i] = t < 0 ? 0 : t > 5 ? 5 : t;
  }

  rampAt(x: number, y: number): number {
    const i = this.at(x, y);
    return i < 0 ? 0 : this.R[i];
  }

  toneAt(x: number, y: number): number {
    const i = this.at(x, y);
    return i < 0 ? 0 : this.T[i];
  }

  /** A horizontal run: `ramp` 0 shifts what is there by `tone`. */
  hrun(x: number, y: number, len: number, ramp: number, tone: number, flag = 0) {
    for (let k = 0; k < len; k++) {
      if (ramp) this.set(x + k, y, ramp, tone, flag);
      else this.shift(x + k, y, tone);
    }
  }

  vrun(x: number, y: number, len: number, ramp: number, tone: number, flag = 0) {
    for (let k = 0; k < len; k++) {
      if (ramp) this.set(x, y + k, ramp, tone, flag);
      else this.shift(x, y + k, tone);
    }
  }

  // ─── Forms: lit edge + shadow edge + cast shadow ──────────────────────────

  /**
   * The edges of a rectangle already painted, as a FORM. Raised (a slab, a cover, a board, a
   * kerbstone): the top row and left column gain `lit`, the bottom row and right column lose
   * `dark`, and the surface below and to the right loses `cast` for `castLen` texels (the cast
   * shadow starts one texel in from the upper-right and lower-left corners, as a raking light
   * draws it). Sunken (a hole, a recess, a joint): the top / left inside is the shadowed reveal,
   * the bottom / right inside catches the light; nothing is cast outside.
   */
  formRect(x: number, y: number, w: number, h: number, o: FormOpts = {}) {
    const m = new Uint8Array(w * h).fill(1);
    this.formMask({ m, w, h }, x, y, o);
  }

  /**
   * The same for any shape (`blob`, `discBlob`, or a mask a painter rasterised itself): a texel
   * of the shape whose upper or left neighbour is outside is on the lit side, one whose lower or
   * right neighbour is outside is on the shadow side.
   */
  formMask(b: Blob, ox: number, oy: number, o: FormOpts = {}) {
    const { m, w, h } = b;
    const raised = o.raised !== false;
    const lit = o.lit ?? 1;
    const dark = o.dark ?? 1;
    const cast = raised ? (o.cast ?? 1) : 0;
    const castLen = o.castLen ?? 1;
    const only = o.only ?? 0;
    const inM = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const i = this.at(ox + x, oy + y);
        // (A shape with its own `ramp` is painted on bare canvas too: a decal, a cut-out.)
        if (i < 0 || (!this.R[i] && !(o.ramp && o.tone !== undefined)) || (only && this.R[i] !== only)) continue;
        if (o.ramp) {
          this.R[i] = o.ramp;
          this.F[i] = 0;
          if (o.tone !== undefined) this.T[i] = o.tone;
        }
        let dt = o.fill ?? 0;
        const up = !inM(x, y - 1) || !inM(x - 1, y);
        const dn = !inM(x, y + 1) || !inM(x + 1, y);
        // (A one-texel-thin part is both: it takes the shadow, so thin tongues stay dark lines.)
        if (raised) dt += dn ? -dark : up ? lit : 0;
        else dt += up ? -dark : dn ? lit : 0;
        if (dt) {
          const t = this.T[i] + dt;
          this.T[i] = t < 0 ? 0 : t > 5 ? 5 : t;
        }
      }
    }
    if (!cast) return;
    // Cast shadow: outside texels diagonally below-right of the shape, `castLen` deep.
    for (let y = 0; y < h + castLen; y++) {
      for (let x = 0; x < w + castLen; x++) {
        if (inM(x, y)) continue;
        let hit = false;
        for (let k = 1; k <= castLen && !hit; k++) hit = inM(x - k, y - k) || inM(x - k, y - k + 1) || inM(x - k + 1, y - k);
        if (hit) this.shift(ox + x, oy + y, -cast, only);
      }
    }
  }

  /**
   * A groove along a polyline (a joint, a crack, a saw cut, a seam between sheets): a dark line
   * `width` texels wide with a lit lip on its lower / right side — the far wall of the cut is in
   * shadow, the near edge catches the light. `breakup` 0…1 leaves gaps in the lip (old, rounded
   * edges); `pts` are x, y pairs.
   */
  groove(pts: readonly number[], o: { dt?: number; lip?: number; width?: number; breakup?: number; seed?: number; ramp?: number; tone?: number; only?: number } = {}) {
    const dt = o.dt ?? -1;
    const lip = o.lip ?? 1;
    const wd = o.width ?? 1;
    const seed = o.seed ?? 0;
    let n = 0;
    for (let s = 0; s + 3 < pts.length; s += 2) {
      let x0 = Math.round(pts[s]);
      let y0 = Math.round(pts[s + 1]);
      const x1 = Math.round(pts[s + 2]);
      const y1 = Math.round(pts[s + 3]);
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      // The lip lies below a mostly-horizontal run and to the right of a mostly-vertical one.
      const horiz = dx >= -dy;
      let err = dx + dy;
      for (;;) {
        for (let k = 0; k < wd; k++) {
          const px = horiz ? x0 : x0 + k;
          const py = horiz ? y0 + k : y0;
          if (o.ramp) this.set(px, py, o.ramp, o.tone ?? 1);
          else this.shift(px, py, dt, o.only);
        }
        if (lip && !(o.breakup && dashAt(n, seed, 2, 4, 3, 9) && hash2(n >> 3, seed, 5) < o.breakup)) {
          if (horiz) this.shift(x0, y0 + wd, lip, o.only);
          else this.shift(x0 + wd, y0, lip, o.only);
        }
        n++;
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    }
  }

  /**
   * A crack: a groove that wanders from (x, y) for `len` texels around heading `dir` (radians,
   * 0 = +x), thins to nothing at its end, may fork (`branch` = chance per texel), and keeps a
   * lit lip only along its fatter first part. Returns its end point.
   */
  crack(rng: PwRng, x: number, y: number, len: number, dir: number, o: { dt?: number; lip?: number; wander?: number; branch?: number; fat?: number; only?: number; ramp?: number; tone?: number } = {}): [number, number] {
    let a = dir;
    let px = x;
    let py = y;
    const dt = o.dt ?? -1;
    const lip = o.lip ?? 1;
    const wander = o.wander ?? 0.5;
    const fat = Math.round(len * (o.fat ?? 0.25));
    // Cracks run in short straight facets, turning at joints (a drawn crack is angular, never a wiggle).
    let facet = rng.int(3, 8);
    for (let i = 0; i < len; i++) {
      const ix = Math.round(px);
      const iy = Math.round(py);
      if (o.ramp) this.set(ix, iy, o.ramp, o.tone ?? 1);
      else this.shift(ix, iy, dt, o.only);
      const horiz = Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a));
      if (i < fat) {
        // The fat part: two texels wide, the lip beyond it.
        if (horiz) {
          if (o.ramp) this.set(ix, iy + 1, o.ramp, o.tone ?? 1);
          else this.shift(ix, iy + 1, dt, o.only);
          if (lip) this.shift(ix, iy + 2, lip, o.only);
        } else {
          if (o.ramp) this.set(ix + 1, iy, o.ramp, o.tone ?? 1);
          else this.shift(ix + 1, iy, dt, o.only);
          if (lip) this.shift(ix + 2, iy, lip, o.only);
        }
      } else if (lip && i < len * 0.7) {
        if (horiz) this.shift(ix, iy + 1, lip, o.only);
        else this.shift(ix + 1, iy, lip, o.only);
      }
      if (--facet <= 0) {
        facet = rng.int(3, 9);
        a += rng.spread(wander);
        // Pull back toward the heading: a crack has a direction.
        a += (dir - a) * 0.25;
      }
      px += Math.cos(a);
      py += Math.sin(a);
      if (o.branch && i > 4 && rng.chance(o.branch)) {
        this.crack(rng, px, py, Math.round((len - i) * (0.3 + rng.next() * 0.3)), a + (rng.chance(0.5) ? 1 : -1) * (0.6 + rng.next() * 0.5), { ...o, branch: 0, fat: 0 });
      }
    }
    return [px, py];
  }

  /**
   * A chip / pit / spall: a small lobed hole (`size` ≈ its longer side, 3…12 texels) with its
   * floor a step down, a shadowed upper-left reveal and a lit lower-right lip. Wear with a light
   * side and a shadow side, where the first pass put a speck.
   */
  chip(rng: PwRng, x: number, y: number, size: number, o: { depth?: number; lip?: number; only?: number; ramp?: number; tone?: number } = {}) {
    const w = Math.max(2, Math.round(size));
    const h = Math.max(2, Math.round(size * (0.45 + rng.next() * 0.4)));
    const b = blob(rng, w, h, w > 6 ? 3 : 2, 0.7);
    this.formMask(b, Math.round(x - w / 2), Math.round(y - h / 2), { raised: false, fill: -(o.depth ?? 1) + 1, dark: 1, lit: 0, only: o.only, ramp: o.ramp, tone: o.tone });
    // The lit lip sits just OUTSIDE the lower / right edge (the broken edge of the surface catches the light).
    const lip = o.lip ?? 1;
    if (!lip) return;
    const ox = Math.round(x - w / 2);
    const oy = Math.round(y - h / 2);
    for (let yy = 0; yy <= h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const inside = yy < h && b.m[yy * w + xx] === 1;
        const above = yy > 0 && b.m[(yy - 1) * w + xx] === 1;
        if (!inside && above) this.shift(ox + xx, oy + yy, lip, o.only);
      }
    }
  }

  /**
   * A bump / blob standing on the surface (a tar blot, gum, a rivet, a pebble, a patch of paint
   * left behind): lit upper-left edge, dark lower-right edge, one texel of cast shadow. `fill` shifts
   * its whole face (a paler scab of stone: fill 1, lit 0).
   */
  bump(rng: PwRng, x: number, y: number, size: number, o: { ramp?: number; tone?: number; lit?: number; dark?: number; cast?: number; castLen?: number; fill?: number; only?: number } = {}) {
    const w = Math.max(2, Math.round(size));
    const h = Math.max(2, Math.round(size * (0.5 + rng.next() * 0.4)));
    this.formMask(blob(rng, w, h, w > 6 ? 3 : 2, 0.8), Math.round(x - w / 2), Math.round(y - h / 2), { raised: true, lit: o.lit ?? 1, dark: o.dark ?? 1, cast: o.cast ?? 1, castLen: o.castLen, fill: o.fill, ramp: o.ramp, tone: o.tone, only: o.only });
  }

  /**
   * Wear placed the way it happens: `n` chips (or `bumps`) in a few DRIFTS — clouds stretched
   * along `dirY` (1 = along y: a wheel path, a drip line; 0 = along x) — instead of an even
   * sprinkle. Sizes 2…`max`: most small, a few big.
   */
  wearDrift(rng: PwRng, x: number, y: number, w: number, h: number, n: number, o: { drifts?: number; max?: number; dirY?: number; bumps?: boolean; only?: number; ramp?: number; tone?: number; depth?: number } = {}) {
    const drifts = Math.max(1, o.drifts ?? Math.ceil(n / 7));
    const max = o.max ?? 7;
    const along = o.dirY ?? 1;
    for (let d = 0; d < drifts; d++) {
      const cx = x + rng.next() * w;
      const cy = y + rng.next() * h;
      const sx = (along ? 0.05 : 0.22) * w + 3;
      const sy = (along ? 0.22 : 0.05) * h + 3;
      const k = Math.round(n / drifts);
      for (let i = 0; i < k; i++) {
        // (Two uniforms summed: denser at the drift's heart.)
        const px = cx + (rng.next() + rng.next() - 1) * sx;
        const py = cy + (rng.next() + rng.next() - 1) * sy;
        if (px < x || py < y || px >= x + w || py >= y + h) continue;
        const r = rng.next();
        const size = r > 0.9 ? max : r > 0.6 ? Math.max(3, max * 0.6) : 2 + rng.next() * 1.5;
        if (o.bumps) this.bump(rng, px, py, size, { only: o.only, ramp: o.ramp, tone: o.tone });
        else this.chip(rng, px, py, size, { only: o.only, ramp: o.ramp, tone: o.tone, depth: o.depth });
      }
    }
  }

  // ─── Value: stepped bands, contact shadows, light pools ───────────────────

  /**
   * A stepped value band inside a rectangle: strongest at `side` (shifted by `dt`, whole steps),
   * weakening toward the opposite side in `steps` steps. Every step edge is hand-wobbled (`wob`
   * texels) and ends in one row of broken dashes a texel beyond it — the artist's dither: a
   * shaped fringe, never a checker field. The damp foot of a wall, grime under a cornice, a
   * gutter's dark, the falloff of a lamp.
   */
  band(x: number, y: number, w: number, h: number, side: 'top' | 'bottom' | 'left' | 'right', o: { dt?: number; steps?: number; wob?: number; seed?: number; only?: number; reach?: number; dash?: boolean } = {}) {
    const dt = o.dt ?? -1;
    const steps = Math.max(1, o.steps ?? Math.max(1, Math.round(Math.abs(dt))));
    const seed = o.seed ?? 0;
    const horiz = side === 'top' || side === 'bottom';
    const L = horiz ? w : h;
    const D = horiz ? h : w;
    const reach = (o.reach ?? 1) * D;
    const wob = o.wob ?? Math.min(3, D * 0.08);
    const per = (horiz ? this.wrapX && w === this.w : this.wrapY && h === this.h) ? L : 0;
    const each = dt / steps;
    for (let k = 0; k < steps; k++) {
      // Step k reaches (k + 1) / steps of the way; each adds one share of dt (they stack).
      const depth = (reach * (steps - k)) / steps;
      const wf = wobbler(seed * 13 + k, per);
      for (let i = 0; i < L; i++) {
        const e = Math.max(0, Math.round(depth + wob * wf(i)));
        const fringe = o.dash !== false && dashAt(i, seed * 7 + k, 2, 6, 2, 5);
        for (let d = 0; d < Math.min(D, e + 2); d++) {
          if (d >= e && !(fringe && d === e + 1)) continue;
          const px = horiz ? x + i : side === 'left' ? x + d : x + w - 1 - d;
          const py = horiz ? (side === 'top' ? y + d : y + h - 1 - d) : y + i;
          this.shift(px, py, each, o.only);
        }
      }
    }
  }

  /**
   * Contact shadow / ambient occlusion where a plane meets another or a thing stands on it: a
   * hard dark line at the contact (`dt`, default −2) and one softer step (`dt` / 2) `depth` texels
   * out whose edge breaks into dashes. `side` = which way the shadow spreads from the line
   * (x, y) → `len` texels along.
   */
  contact(x: number, y: number, len: number, side: 'below' | 'above' | 'left' | 'right', o: { dt?: number; depth?: number; line?: number; seed?: number; only?: number } = {}) {
    const dt = o.dt ?? -2;
    const depth = o.depth ?? 4;
    const line = o.line ?? 1;
    const seed = o.seed ?? 0;
    const horiz = side === 'below' || side === 'above';
    const sg = side === 'below' || side === 'right' ? 1 : -1;
    const wf = wobbler(seed * 31 + 5, 0, 2);
    for (let i = 0; i < len; i++) {
      const e = Math.max(line, Math.round(depth + wf(i) * depth * 0.3));
      const fringe = dashAt(i, seed + 9, 2, 5, 2, 4);
      for (let d = 0; d <= e + 1; d++) {
        if (d >= e && !(fringe && d === e + 1)) continue;
        const px = horiz ? x + i : x + sg * d;
        const py = horiz ? y + sg * d : y + i;
        this.shift(px, py, d < line ? dt : dt / 2, o.only);
      }
    }
  }

  /**
   * A painted pool of light on a surface, in whole tone steps: `steps` rings (2…4), the outer one
   * lifting the paint by one step, each ring inside it by one more. Ring edges are hand-wobbled
   * and end in a row of broken dashes (wet ground: `dash` 'h' draws them as horizontal strokes
   * all round, so the pool looks mirrored in water; 'edge' follows the ring). `tint` recolours
   * the innermost `tintRings` rings to the light's own ramp at the surface's tone (neon tints
   * what is near it); `squash` < 1 flattens the top half (a pool at the foot of a wall).
   * Only shifts tones and swaps ramps, so it stays palette-true under the ramp-step light.
   */
  lightPool(cx: number, cy: number, rx: number, ry: number, o: { steps?: number; seed?: number; wob?: number; tint?: number; tintRings?: number; dash?: 'h' | 'edge' | 'none'; only?: number; max?: number; skip?: (ramp: number) => boolean } = {}) {
    const steps = Math.max(1, o.steps ?? 3);
    const seed = o.seed ?? 0;
    const wob = o.wob ?? 0.07;
    const dash = o.dash ?? 'h';
    const tintRings = o.tintRings ?? 1;
    const max = o.max ?? 5;
    // Ring k (0 = outer) ends at radius r_k; inner rings are smaller by even shares, the core a little bigger.
    const rk = (k: number) => 1 - (k / steps) * 0.86;
    const wfs: ((t: number) => number)[] = [];
    for (let k = 0; k < steps; k++) wfs.push(wobbler(seed * 17 + k * 3, 6.283185, 1));
    const x0 = Math.floor(cx - rx * 1.12);
    const x1 = Math.ceil(cx + rx * 1.12);
    const y0 = Math.floor(cy - ry * 1.12);
    const y1 = Math.ceil(cy + ry * 1.12);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        const r = Math.sqrt(u * u + v * v);
        if (r > 1.12) continue;
        const a = Math.atan2(v, u);
        let lift = 0;
        for (let k = 0; k < steps; k++) {
          const edge = rk(k) * (1 + wob * wfs[k](a));
          // Inside the ring, or on its dashed fringe: a broken stroke one row beyond the edge.
          const d = (edge - r) * (dash === 'h' ? ry : Math.min(rx, ry));
          if (d >= 0) lift = k + 1;
          else if (dash !== 'none' && d > -2.2 && d < -0.9 && dashAt(dash === 'h' ? x : Math.round(a * rx), seed + k * 5 + (dash === 'h' ? y : 0), 2, 6, 2, 5)) lift = k + 1;
          else break;
        }
        if (!lift) continue;
        const i = this.at(x, y);
        if (i < 0 || !this.R[i] || (o.only && this.R[i] !== o.only) || o.skip?.(this.R[i])) continue;
        if (o.tint && lift > steps - tintRings) this.R[i] = o.tint;
        const t = this.T[i] + lift;
        this.T[i] = t > max ? Math.max(this.T[i], max) : t;
      }
    }
  }

  // ─── Water: drips, stains, sheen, mirrored light ──────────────────────────

  /**
   * A run of water / rust / grime from (x, y) DOWN the canvas for `len` texels: `width` wide at
   * its head, tapering, wandering a texel now and then, its tail breaking into dashes; `wet`
   * adds a one-step lit edge on its right (a run that still glistens); `pool` ends it in a small
   * lobed blot. `ramp` recolours (rust, moss, lime), else tones shift by `dt`.
   */
  drip(rng: PwRng, x: number, y: number, len: number, o: { dt?: number; ramp?: number; width?: number; wet?: boolean; pool?: number; only?: number; wander?: number } = {}) {
    const dt = o.dt ?? -1;
    const w0 = o.width ?? 2;
    let px = x;
    const seed = Math.round(x * 31 + y * 17);
    for (let k = 0; k < len; k++) {
      const t = k / Math.max(1, len);
      const wd = Math.max(1, Math.round(w0 * (1 - t * 0.8)));
      // The last third is dashes.
      if (t > 0.66 && !dashAt(k, seed, 2, 4, 1, 3)) continue;
      for (let j = 0; j < wd; j++) {
        if (o.ramp) this.tint(px + j, y + k, o.ramp, dt, o.only);
        else this.shift(px + j, y + k, dt, o.only);
      }
      if (o.wet && t < 0.6) this.shift(px + wd, y + k, 1, o.only);
      if (rng.chance(o.wander ?? 0.07)) px += rng.chance(0.5) ? 1 : -1;
    }
    if (o.pool) {
      const b = blob(rng, o.pool, Math.max(2, Math.round(o.pool * 0.5)), 2, 0.8);
      for (let yy = 0; yy < b.h; yy++) {
        for (let xx = 0; xx < b.w; xx++) {
          if (!b.m[yy * b.w + xx]) continue;
          if (o.ramp) this.tint(px - (b.w >> 1) + xx, y + len + yy, o.ramp, dt, o.only);
          else this.shift(px - (b.w >> 1) + xx, y + len + yy, dt, o.only);
        }
      }
    }
  }

  /**
   * The stain under something that drips (a sill, a bolt, a pipe bracket, a sign): `n` drips
   * across `w` texels, the middle ones longest, plus one solid row right under the edge.
   */
  stainFan(rng: PwRng, x: number, y: number, w: number, len: number, o: { dt?: number; ramp?: number; n?: number; only?: number } = {}) {
    const n = o.n ?? Math.max(2, Math.round(w / 4));
    this.hrun(x, y, w, 0, o.dt ?? -1);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const fall = 1 - Math.abs(t - 0.5) * 1.3;
      this.drip(rng, x + Math.round(t * (w - 1)) + rng.int(-1, 1), y + 1, Math.max(2, Math.round(len * fall * (0.5 + rng.next() * 0.5))), { dt: o.dt, ramp: o.ramp, width: rng.chance(0.3) ? 2 : 1, only: o.only });
    }
  }

  /**
   * One stroke of wet sheen: a horizontal lens (thick in the middle, one texel at the tips) in
   * `ramp` at `tone`, its tips a step dimmer, optionally a brighter core row. The unit every wet
   * surface is drawn with — never a dot, never a checker.
   */
  stroke(x: number, y: number, len: number, thick: number, ramp: number, tone: number, o: { core?: number; only?: (ramp: number) => boolean; flag?: number } = {}) {
    for (let j = 0; j < thick; j++) {
      // Rows away from the middle are shorter (a lens), and offset a texel so it reads hand-set.
      const mid = (thick - 1) / 2;
      const inset = Math.round((Math.abs(j - mid) * len) / (thick + 1));
      for (let k = inset; k < len - inset; k++) {
        const i = this.at(x + k, y + j);
        if (i < 0 || !this.R[i] || (o.only && !o.only(this.R[i]))) continue;
        const tip = k === inset || k === len - inset - 1;
        this.R[i] = ramp;
        this.T[i] = tip ? tone - 1 : o.core !== undefined && Math.abs(j - mid) < 0.6 && k > inset + 1 && k < len - inset - 2 ? o.core : tone;
        this.F[i] = o.flag ?? 0;
      }
    }
  }

  /**
   * Wet sheen over an area: `n` strokes in drifts stretched along y (the way water lies in a
   * wheel path), lengths `min`…`max`, mostly 2 texels thick (they must survive the first far
   * level), a few fat ones with a bright core.
   */
  sheen(rng: PwRng, x: number, y: number, w: number, h: number, n: number, ramp: number, tone: number, o: { min?: number; max?: number; fat?: number; only?: (ramp: number) => boolean; drifts?: number; core?: number } = {}) {
    const min = o.min ?? 4;
    const max = o.max ?? 12;
    const drifts = Math.max(1, o.drifts ?? Math.ceil(n / 6));
    for (let d = 0; d < drifts; d++) {
      const cx = x + rng.next() * w;
      const cy = y + rng.next() * h;
      const k = Math.round(n / drifts);
      for (let i = 0; i < k; i++) {
        const len = rng.int(min, max);
        const px = Math.round(cx + (rng.next() + rng.next() - 1) * Math.min(w * 0.5, 14) - len / 2);
        // (Even rows: a 2-texel stroke then falls inside one texel of the next level.)
        const py = Math.round((cy + (rng.next() + rng.next() - 1) * h * 0.2) / 2) * 2;
        if (px < x - 2 || px + len > x + w + 2 || py < y || py >= y + h) continue;
        const fat = rng.chance(o.fat ?? 0.15);
        this.stroke(px, py, fat ? len + 6 : len, fat ? 4 : 2, ramp, tone, { core: fat ? (o.core ?? tone + 1) : undefined, only: o.only });
      }
    }
  }

  /**
   * A light mirrored in wet ground: a column of broken horizontal dashes running DOWN the canvas
   * from its root (x, y) — widest and brightest at the root, each row its own width, some rows
   * missing, the column wavering and thinning to single dashes. `tone` is the root's tone (the
   * tail ends two steps under it); `flag` PWF.GLOW for a light that must hold its colour.
   */
  wetStreak(rng: PwRng, x: number, y: number, len: number, width: number, ramp: number, tone: number, o: { flag?: number; only?: (ramp: number) => boolean; rows?: number; gap?: number } = {}) {
    const rows = o.rows ?? 2;
    let cx = x;
    for (let k = 0; k < len; k += rows) {
      const t = k / Math.max(1, len);
      // More rows drop out toward the tail.
      if (rng.next() < (o.gap ?? 0.25) + t * 0.45) continue;
      const wd = Math.max(2, Math.round(width * (1 - t * 0.75) * (0.45 + rng.next() * 0.55)));
      cx += rng.int(-1, 1);
      const tn = tone - (t > 0.7 ? 2 : t > 0.35 ? 1 : 0);
      for (let j = 0; j < rows; j++) {
        for (let q = 0; q < wd; q++) {
          const i = this.at(cx - (wd >> 1) + q, y + k + j);
          if (i < 0 || !this.R[i] || (o.only && !o.only(this.R[i]))) continue;
          this.R[i] = ramp;
          this.T[i] = q === 0 || q === wd - 1 ? Math.max(0, tn - 1) : tn;
          this.F[i] = o.flag ?? 0;
        }
      }
    }
  }

  // ─── Grain and masonry ────────────────────────────────────────────────────

  /**
   * Stone grain as a pixel artist sets it: DRIFTS of small light chips (2…4 texels, hand shapes),
   * about one in three with a dark pit at its lower right, the drifts stretched along y. Between
   * drifts the surface rests. `n` chips in all.
   */
  aggregate(rng: PwRng, x: number, y: number, w: number, h: number, n: number, o: { drifts?: number; up?: number; down?: number; only?: number; stretch?: number } = {}) {
    const drifts = Math.max(1, o.drifts ?? Math.ceil(n / 9));
    const up = o.up ?? 1;
    const down = o.down ?? -1;
    const st = o.stretch ?? 3;
    for (let d = 0; d < drifts; d++) {
      const cx = x + rng.next() * w;
      const cy = y + rng.next() * h;
      const r = 6 + rng.next() * 10;
      const k = Math.round(n / drifts);
      for (let i = 0; i < k; i++) {
        const px = Math.round(cx + (rng.next() + rng.next() - 1) * r);
        const py = Math.round(cy + (rng.next() + rng.next() - 1) * r * st);
        if (px < x || py < y || px >= x + w - 1 || py >= y + h - 1) continue;
        const s = GRAINS[Math.floor(rng.next() * GRAINS.length)];
        for (let q = 0; q < s.length; q += 2) this.shift(px + s[q], py + s[q + 1], up, o.only);
        if (rng.chance(0.35)) {
          this.shift(px + 1, py + 2, down, o.only);
          this.shift(px + 2, py + 2, down, o.only);
        }
      }
    }
  }

  /**
   * Masonry drawn unit by unit over a rectangle: courses `uh` texels high of units `uw` wide
   * (± `vary`), in running bond (or `bond` 'stack' / 'random' lengths), each unit a flat tone
   * with a lit top / left arris and its joint in shadow on the lower / right — and tone or ramp
   * changing in RUNS of `run[0]`…`run[1]` units, not per unit: masonry reads as courses with
   * a few bricks picked out, not as confetti. `each` is called per unit for extras (a chipped
   * corner, a replaced stone, moss). Joints are `joint` texels (2 survives the first far level).
   */
  courses(
    rng: PwRng,
    x: number,
    y: number,
    w: number,
    h: number,
    o: {
      uw: number;
      uh: number;
      ramps: readonly number[];
      tone?: number;
      joint?: number;
      jointRamp?: number;
      jointTone?: number;
      bond?: 'running' | 'stack' | 'random' | 'third';
      vary?: number;
      run?: readonly [number, number];
      /** Chance a run is a step lighter / darker than the base tone. */
      toneVar?: number;
      lit?: number;
      each?: (u: { x: number; y: number; w: number; h: number; col: number; row: number; ramp: number; tone: number }) => void;
    },
  ) {
    const joint = o.joint ?? 1;
    const tone = o.tone ?? 3;
    const lit = o.lit ?? 1;
    const run = o.run ?? [3, 6];
    const jr = o.jointRamp ?? o.ramps[0];
    const jt = o.jointTone ?? 1;
    let row = 0;
    for (let cy = y; cy < y + h; cy += o.uh, row++) {
      const uh = Math.min(o.uh, y + h - cy);
      let cx = x - (o.bond === 'stack' ? 0 : o.bond === 'third' ? ((row % 3) * o.uw) / 3 : o.bond === 'random' ? rng.int(0, o.uw - 1) : row % 2 ? o.uw / 2 : 0);
      cx = Math.round(cx);
      let left = 0;
      let ramp = o.ramps[0];
      let tn = tone;
      let col = 0;
      while (cx < x + w) {
        const uw = Math.max(joint + 2, Math.round(o.uw + (o.vary ? rng.spread(o.vary) : 0)));
        if (left-- <= 0) {
          left = rng.int(run[0], run[1]);
          ramp = o.ramps[Math.floor(rng.next() * o.ramps.length)];
          const r = rng.next();
          tn = tone + (r < (o.toneVar ?? 0.3) / 2 ? -1 : r > 1 - (o.toneVar ?? 0.3) / 2 ? 1 : 0);
        }
        const x0 = Math.max(x, cx);
        const x1 = Math.min(x + w, cx + uw);
        for (let yy = cy; yy < cy + uh; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const i = this.at(xx, yy);
            if (i < 0) continue;
            const lx = xx - cx;
            const ly = yy - cy;
            // Joint on the lower / right (in shadow); the arris under / right of the previous joint is lit.
            const isJoint = lx >= uw - joint || ly >= o.uh - joint;
            this.R[i] = isJoint ? jr : ramp;
            this.T[i] = isJoint ? jt : ly === 0 || lx === 0 ? Math.min(5, tn + lit) : tn;
            this.F[i] = 0;
          }
        }
        o.each?.({ x: cx, y: cy, w: uw - joint, h: o.uh - joint, col, row, ramp, tone: tn });
        cx += uw;
        col++;
      }
    }
  }
}

/** Hand-set grain chips (dx, dy pairs): two-, three- and four-texel shapes, no single texels. */
const GRAINS: readonly (readonly number[])[] = [
  [0, 0, 1, 0],
  [0, 0, 1, 0, 2, 0],
  [0, 0, 0, 1],
  [0, 0, 1, 0, 1, 1],
  [0, 0, 1, 0, 0, 1],
  [1, 0, 0, 1, 1, 1],
  [0, 0, 1, 0, 2, 0, 1, 1],
  [0, 0, 1, 1, 2, 1],
];

/**
 * A low-frequency value field over a tile, as large ragged REGIONS instead of a gradient: value
 * noise on a lattice of `cell` texels, sampled per `block` × `block` texels (default 4: region
 * edges come out as pixel steps), seamless on the wrap axes. For big ground / wall modules:
 * `f[(y >> shift) * fw + (x >> shift)]`, never a per-texel noise call.
 */
export function regionField(w: number, h: number, cell: number, seed: number, o: { wrapX?: boolean; wrapY?: boolean; block?: number } = {}): { f: Float32Array; fw: number; fh: number; shift: number } {
  const block = o.block ?? 4;
  const shift = Math.round(Math.log2(block));
  const fw = Math.ceil(w / block);
  const fh = Math.ceil(h / block);
  const nx = Math.max(1, Math.round(w / cell));
  const ny = Math.max(1, Math.round(h / cell));
  const lat = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) lat[j * (nx + 1) + i] = hash2(o.wrapX && i === nx ? 0 : i, o.wrapY && j === ny ? 0 : j, seed);
  }
  const f = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) {
    const gy = ((y + 0.5) / fh) * ny;
    const j = Math.min(ny - 1, Math.floor(gy));
    const ty = gy - j;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < fw; x++) {
      const gx = ((x + 0.5) / fw) * nx;
      const i = Math.min(nx - 1, Math.floor(gx));
      const tx = gx - i;
      const sx = tx * tx * (3 - 2 * tx);
      const a = lat[j * (nx + 1) + i];
      const b = lat[j * (nx + 1) + i + 1];
      const c = lat[(j + 1) * (nx + 1) + i];
      const d = lat[(j + 1) * (nx + 1) + i + 1];
      f[y * fw + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return { f, fw, fh, shift };
}
