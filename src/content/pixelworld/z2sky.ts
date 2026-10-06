import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { bayer, PW_BACKDROP_TPD, PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';

/**
 * ST. MERCY HOSPITAL's night over the ambulance bay (PIXEL WORLD backdrop),
 * painted like an arcade backdrop rather than built from bands:
 *  - `z2StormSkyTile`: storm masses as unions of billows (every billow lit
 *    from the upper left with hard ramp steps and 1-texel dithered seams),
 *    stacked from flat far strata over the horizon to the big storm heads and
 *    the overcast deck overhead; cool moon-lit rims on the tops, undersides
 *    lit orange by the burning city (stronger over the fires), a moon half
 *    swallowed by a cloud head with a dithered halo, slanted rain curtains
 *    hanging from the cores, smoke columns rising from the fires into the
 *    cloud base. Laid on a sphere band up to `el1` (the deck's flat top row
 *    caps the dome), so the camera can look up at the hospital.
 *  - `z2CityTile`: the city beyond the car park — two depths of blocks and
 *    towers with setbacks, spires, water towers, a crane, a dead billboard,
 *    broken burning tops at the fires (`Z2_FIRES`, shared with the sky's
 *    smoke), lit-window patterns per building; the foot sinks into the fog.
 *  - `z2RoofsTile`: a nearer, darker layer of roofs (sawtooth sheds, a gas
 *    holder, stacks, a steeple, trees, poles and sagging wires) that drifts
 *    against the city (parallax).
 * All 1024 wide and laid twice round the horizon (the bay only ever looks
 * one way: the 180° repeat is never on screen twice).
 */

const W = 1024;
const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrapX = (x: number) => ((x % W) + W) % W;

/** Rows for an elevation band at the backdrop density (multiple of 16). */
export function skyRows(deg: number): number {
  return Math.max(16, Math.round((deg * PW_BACKDROP_TPD) / 16) * 16);
}

/** The city's fires (tile x, strength): burning roofs in the city, smoke and glow in the sky. */
export const Z2_FIRES: readonly (readonly [number, number])[] = [
  [118, 1],
  [300, 0.6],
  [452, 1.2],
  [640, 0.7],
  [806, 1],
  [944, 0.5],
];

/** Fire light at tile column x (0 … ~1.2): sum of the fires' falloffs (wrapping). */
function fireAt(x: number, reach = 90): number {
  let s = 0;
  for (const [fx, k] of Z2_FIRES) {
    let d = Math.abs(x - fx);
    if (d > W / 2) d = W - d;
    s += k * Math.exp(-(d / reach) * (d / reach));
  }
  return s;
}

/** Shader outputs (scratch, allocation-free): ramp, tone, flags. */
let oR = 0;
let oT = 0;
let oF = 0;

/**
 * Tileable 2D value noise on a cells × cells lattice over the unit square
 * (smoothstep-interpolated), its lattice held in the instance: the same field
 * as `smooth` without a lattice lookup per call (the sky paints ~10⁵ samples).
 */
class ValueNoise {
  private g: Float32Array;
  constructor(
    private cells: number,
    seed: number,
  ) {
    this.g = new Float32Array(cells * cells);
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) this.g[y * cells + x] = hash2(x, y, seed);
  }
  at(u: number, v: number): number {
    const n = this.cells;
    const fx = u * n;
    const fy = v * n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const ix0 = ((x0 % n) + n) % n;
    const iy0 = ((y0 % n) + n) % n;
    const ix1 = ix0 + 1 === n ? 0 : ix0 + 1;
    const iy1 = iy0 + 1 === n ? 0 : iy0 + 1;
    const g = this.g;
    const a = g[iy0 * n + ix0];
    const b = g[iy0 * n + ix1];
    const c = g[iy1 * n + ix0];
    const d = g[iy1 * n + ix1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
}

/** Snap a tone to ramp steps with a 1-texel dithered seam where it falls between two (into oT / oF). */
function stepTone(t: number) {
  const f = Math.floor(t);
  const r = t - f;
  if (r < 0.36) {
    oT = f;
    oF = 0;
  } else if (r > 0.64) {
    oT = f + 1;
    oF = 0;
  } else {
    oT = f + 0.5;
    oF = PWF.DITHER;
  }
}

export interface StormOpts {
  /** Fog colour (the horizon band meets the fogged scenery in it). */
  fog: number;
  el0: number;
  el1: number;
}

export function z2StormSkyTile(atlas: PwAtlas, o: StormOpts): PwTile {
  const H = skyRows(o.el1 - o.el0);
  return atlas.tile(`z2storm2|${h6(o.fog)}|${o.el0}|${o.el1}`, W, H, (c, k) => paintStorm(c, k, o), { wrap: true });
}

interface Puff {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** The head's top row and height (cores darken toward the bottom of a head). */
  top: number;
  hh: number;
}

interface BankSpec {
  /** Base elevation (deg) of the bank's floor. */
  el: number;
  rMin: number;
  rMax: number;
  /** Vertical squash of the billows (far strata are flat). */
  flat: number;
  /** Fraction of the horizon covered (0…1) and the coverage noise's cells round the tile. */
  cover: number;
  cells: number;
  seed: number;
  /** Body tone (cool ramp) and light amplitude. */
  tone: number;
  amp: number;
  /** Head height (texels) range and the chance of a towering head. */
  tall: number;
  tower: number;
  /** Warm underside depth (texels) and strength. */
  under: number;
  warm: number;
}

type Shader = (u: number, v: number, nz: number, y: number) => void;

function paintStorm(c: PwCanvas, k: PwKit, o: StormOpts) {
  const H = c.h;
  const span = o.el1 - o.el0;
  const rowOf = (e: number) => Math.round(((o.el1 - e) / span) * H);
  const elOf = (y: number) => o.el1 - ((y + 0.5) / H) * span;
  const night = k.ramp(0x101828, { dark: 0.5, light: 0.35, shift: 0.5 });
  const fog = k.ramp(o.fog, { light: 0.3, dark: 0.6 });
  const glow = k.ramp(0x3e2428, { light: 0.55, sat: 1.05 });
  const cool = k.ramp(0x2a3448, { dark: 0.4, light: 0.5, sat: 0.9 });
  const deckR = k.ramp(0x151b28, { dark: 0.55, light: 0.45, sat: 0.8 });
  const warm = k.ramp(0x5a3428, { dark: 0.45, light: 0.5, sat: 1.0 });
  const smoke = k.ramp(0x2a2422, { dark: 0.5, light: 0.5, sat: 0.8 });
  const moonR = k.ramp(0xaab8d0, { light: 0.55, dark: 0.5 });
  const rng = k.rng;
  const fireCol = new Float32Array(W);
  const nearCol = new Float32Array(W);
  const reachCol = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    fireCol[x] = fireAt(x);
    nearCol[x] = fireAt(x, 52);
    reachCol[x] = 3 + fireCol[x] * 9 + smooth(x, 0, W, 8, 24, 31) * 3;
  }
  const owner = new Uint8Array(W * H);

  // ── Background: deep zenith, night blue, the fire-lit haze over the horizon (blooms over the
  // fires, not a full-width band), the fog colour where the fogged scenery meets it.
  const yFog = rowOf(1.2);
  const yDeck = rowOf(39);
  // (Rows above the deck's edge are all deck: painted below.)
  for (let y = yDeck; y < H; y++) {
    const e = elOf(y);
    const i0 = y * W;
    for (let x = 0; x < W; x++) {
      const i = i0 + x;
      let r = night;
      let t = 3;
      let f = 0;
      if (e > 30) {
        t = e > 36 ? 2 : 2 + (36 - e) / 6;
        f = PWF.DITHER;
      } else if (y >= yFog) {
        r = fog;
        // A ragged seam into the glow (the bloom sinks to the horizon over the fires).
        if (y < yFog + 3 && bayer(x, y) < 0.5 * (1 - (y - yFog) / 3) * Math.min(1, fireCol[x])) {
          r = glow;
          t = 2;
        }
      } else {
        const reach = reachCol[x];
        if (e < reach) {
          const h = 1 - e / reach;
          r = glow;
          t = 2 + h * 1.7;
          f = PWF.DITHER;
          // Above the glow's edge: a dithered seam into the night.
          if (h < 0.18 && bayer(x, y) > h / 0.18) {
            r = night;
            t = 3;
            f = 0;
          }
        }
      }
      c.ramp[i] = r;
      c.tone[i] = t;
      c.flag[i] = f;
    }
  }

  // ── The moon, high on the left: a dithered halo, a disc lit from the left with maria clusters.
  const mx = 318;
  const my = rowOf(28);
  const mr = 11;
  for (let y = my - 30; y <= my + 30; y++) {
    for (let x = mx - 34; x <= mx + 34; x++) {
      const d = Math.hypot(x + 0.5 - mx, (y + 0.5 - my) * 1.05);
      if (d <= mr || d > 30) continue;
      const a = d < 17 ? 0.75 : d < 23 ? 0.45 : 0.16;
      if (bayer(x, y) < a) c.shift(x, y, 1);
    }
  }
  for (let y = my - mr; y <= my + mr; y++) {
    for (let x = mx - mr; x <= mx + mr; x++) {
      const u = (x + 0.5 - mx) / mr;
      const v = (y + 0.5 - my) / mr;
      const d = u * u + v * v;
      if (d > 1) continue;
      stepTone(3.4 + (-0.6 * u - 0.4 * v + 0.5 * Math.sqrt(1 - d)) * 1.4);
      c.set(x, y, moonR, Math.min(5, oT), oF);
    }
  }
  for (const [dx, dy, s] of [[-4, -3, 4], [3, 1, 6], [-1, 5, 3], [5, -5, 1], [-6, 2, 0], [1, -1, 7]]) c.cluster(mx + dx, my + dy, s, 0, -1);

  // ── Smoke columns from the fires: puffs lit warm from below, leaning downwind into the cloud base.
  const smokeCols = () => {
    for (const [fx, s] of Z2_FIRES) {
      const n = Math.round(12 + s * 9);
      for (let i = 0; i < n; i++) {
        const cx = fx + i * 2.4 + Math.sin(i * 0.8 + fx) * 2.5;
        const cy = rowOf(2.4 + i * 0.7);
        const r = 2.5 + i * 0.5 * (0.7 + s * 0.3);
        const lit = i < n * 0.65;
        drawPuff(c, owner, 9, { cx, cy, rx: r * 1.25, ry: r, top: 0, hh: 1 }, (u, v, nz) => {
          const below = 0.55 * v + 0.2 * u + 0.2 * nz;
          if (lit && below > 0.3) {
            oR = warm;
            stepTone(1.8 + (below - 0.3) * 2.4 * s);
          } else {
            oR = smoke;
            stepTone(1.6 - 0.5 * v + 0.4 * nz - 0.3 * u);
          }
        });
      }
    }
  };

  // ── Banks of heads, far / low first (each nearer, higher bank overlaps the one below).
  const banks: BankSpec[] = [
    { el: 2.4, rMin: 3, rMax: 6, flat: 0.5, cover: 0.7, cells: 11, seed: 401, tone: 2.3, amp: 0.9, tall: 7, tower: 0, under: 3, warm: 1.1 },
    { el: 6.5, rMin: 5, rMax: 10, flat: 0.62, cover: 0.5, cells: 9, seed: 411, tone: 2.2, amp: 1.0, tall: 26, tower: 0.2, under: 5, warm: 1 },
    { el: 12, rMin: 8, rMax: 15, flat: 0.7, cover: 0.46, cells: 7, seed: 421, tone: 2.1, amp: 1.15, tall: 44, tower: 0.25, under: 7, warm: 0.9 },
    { el: 18.5, rMin: 11, rMax: 21, flat: 0.74, cover: 0.5, cells: 6, seed: 431, tone: 1.9, amp: 1.25, tall: 62, tower: 0.3, under: 9, warm: 0.8 },
  ];
  const curtains: { x: number; w: number; y: number }[] = [];
  banks.forEach((b, bi) => {
    if (bi === 1) smokeCols();
    const id = bi + 1;
    const heads = bankHeads(rng, b, rowOf, bi === 3 ? mx + 18 : -1, my);
    let rTop = H;
    let rBot = 0;
    for (const p of heads) {
      rTop = Math.min(rTop, Math.floor(p.cy - p.ry));
      rBot = Math.max(rBot, Math.ceil(p.cy + p.ry));
    }
    for (const p of heads) {
      const core = 1 / Math.max(1, p.hh);
      drawPuff(c, owner, id, p, (u, v, nz, y) => {
        // Upper-left light on the billow, the head's core darker toward its bottom.
        const l = -0.45 * u - 0.62 * v + 0.55 * nz;
        oR = cool;
        stepTone(b.tone + l * b.amp - Math.max(0, (y - p.top) * core - 0.45) * 0.9);
      });
    }
    // Undersides lit by the fires: from each column's bottom edge up, warm steps dithered into the
    // body (deeper and brighter over the fires).
    const yLo = Math.min(H - 1, rowOf(b.el - 4));
    for (let x = 0; x < W; x++) {
      const fk = Math.min(1.25, nearCol[x] * 1.2 + fireCol[x] * 0.25) * b.warm;
      let y = yLo;
      while (y > 0 && owner[y * W + x] !== id) y--;
      if (y <= 0) continue;
      if (fk < 0.3) {
        // Away from the fires the bellies stay dark: a core step down, the very edge a hint of glow.
        for (let j = 0; j < 3; j++) {
          const i = (y - j) * W + x;
          if (y - j < 0 || owner[i] !== id || c.ramp[i] !== cool) break;
          c.tone[i] = j === 0 && bayer(x, y) < fk * 2 ? b.tone : Math.max(0.6, b.tone - 0.9);
          c.flag[i] = 0;
          if (j === 0 && fk > 0.12) c.ramp[i] = warm;
        }
        continue;
      }
      const depth = Math.max(2, Math.round(b.under * (0.4 + fk * 0.6)));
      for (let j = 0; j < depth; j++) {
        const yy = y - j;
        const i = yy * W + x;
        if (yy < 0 || owner[i] !== id) break;
        const q = j / depth;
        // The top of the lit band dithers into the cool body.
        if (q > 0.55 && bayer(x, yy) < (q - 0.55) / 0.45) continue;
        stepTone(1.4 + fk * 1.8 * (1 - q) + (j === 0 ? 0.3 : 0));
        c.ramp[i] = warm;
        c.tone[i] = oT;
        c.flag[i] = oF;
      }
    }
    if (bi >= 2) for (let i = 0; i < 6; i++) curtains.push({ x: rng.int(0, W - 1), w: rng.int(20, 50), y: rowOf(b.el) });
    // Moon-lit rims on the tops: a cool step up (two near the moon), broken far from it.
    for (let y = Math.max(1, rTop); y < Math.min(H - 1, rBot + 1); y++) {
      const i0 = y * W;
      for (let x = 1; x < W; x++) {
        const i = i0 + x;
        if (owner[i] !== id || owner[i - W] === id || c.ramp[i] !== cool) continue;
        const near = Math.abs(x - mx) < 150 && Math.abs(y - my) < 90;
        if (!near && bayer(x, y) < 0.35) continue;
        c.tone[i] = Math.min(5, Math.max(c.tone[i], b.tone + (near ? 2.3 : 1.2)));
        c.flag[i] = 0;
        if (near && c.ramp[i + W] === cool) {
          c.tone[i + W] = Math.min(5, Math.max(c.tone[i + W], b.tone + 1.3));
          c.flag[i + W] = 0;
        }
      }
    }
  });

  // ── The overcast deck overhead: a dark ceiling mottled in big soft masses (two tones, dithered
  // seams; the top rows stay one tone: they cap the dome), its lumpy underside hanging in billows.
  const n1 = new ValueNoise(26, 501);
  const n2 = new ValueNoise(78, 502);
  for (let y = 0; y < yDeck; y++) {
    const i0 = y * W;
    const capRow = y < 6;
    const fy = (y * 2.2) / W;
    let m = 0;
    for (let x = 0; x < W; x++) {
      const i = i0 + x;
      c.ramp[i] = deckR;
      owner[i] = 7;
      if (capRow) {
        c.tone[i] = 2;
        c.flag[i] = 0;
        continue;
      }
      // (Big soft masses: sampled every other texel.)
      if (!(x & 1)) m = n1.at(x / W, fy) * 0.7 + n2.at(x / W, fy) * 0.3;
      const fade = Math.min(1, (y - 6) / 10);
      const t = 2 + (m > 0.58 ? 1 : m < 0.36 ? -0.5 : 0) * fade;
      const near = m > 0.555 && m < 0.605;
      c.tone[i] = near ? 2.5 : t;
      c.flag[i] = near ? PWF.DITHER : 0;
    }
  }
  for (let x = 0; x < W; ) {
    const m = smooth(x, 0, W, 8, 7, 511) * 0.75 + smooth(x, 0, W, 8, 23, 512) * 0.25;
    const r = 8 + rng.next() * 16;
    if (m > 0.28) {
      const hang = (m - 0.28) * 34 * (0.6 + rng.next() * 0.6);
      const cx = x;
      const fk = Math.min(1.1, nearCol[wrapX(Math.round(cx))] * 1.3);
      drawPuff(c, owner, 7, { cx, cy: yDeck + hang * 0.45, rx: r * (1 + rng.next() * 0.4), ry: r * 0.55 + hang * 0.3, top: 0, hh: 1 }, (u, v, nz) => {
        // Lit from below: the hanging bellies catch the fires (dimly away from them).
        const l = 0.62 * v - 0.3 * u + 0.3 * nz;
        if (l > 0.58 && fk > 0.6) {
          oR = warm;
          stepTone(1.1 + (l - 0.58) * 2.6 * fk);
        } else {
          oR = deckR;
          stepTone(2 + l * 1.1);
        }
      });
    }
    x += r * (0.7 + rng.next() * 0.7);
  }

  // ── Rain curtains: slanted, dithered darkening under the cores, a few streak lines in them.
  const yEnd = rowOf(0.5);
  const yFade = rowOf(5);
  for (const cu of curtains) {
    for (let y = cu.y; y < Math.min(H, yEnd); y++) {
      const dy = y - cu.y;
      const fade = Math.min(1, dy / 8) * (1 - Math.max(0, (y - yFade) / Math.max(1, yEnd - yFade)));
      for (let j = 0; j < cu.w; j++) {
        const xx = wrapX(cu.x + j + Math.round(dy * 0.4));
        const i = y * W + xx;
        if (owner[i] >= 3 && owner[i] <= 7) continue;
        const a = Math.min(1, Math.min(j, cu.w - 1 - j) / 6) * fade * 0.55;
        if (bayer(xx, y) < a) c.shift(xx, y, -1);
        else if ((j + (dy >> 2)) % 6 === 0 && hash2(xx, dy >> 3, 77) < 0.55 * fade) c.shift(xx, y, -1);
      }
    }
  }

  // ── A few dim stars in the clear gaps.
  for (let i = 0; i < 46; i++) {
    const sx = rng.int(0, W - 1);
    const sy = rng.int(yDeck + 4, rowOf(24));
    const j = sy * W + sx;
    if (owner[j] !== 0 || c.ramp[j] !== night) continue;
    c.set(sx, sy, moonR, rng.chance(0.3) ? 3 : 2, PWF.GLOW);
  }
}

/**
 * Heads of one bank (where its coverage noise is high): a dome of billows
 * round a heap profile (crowns over bodies over a flat, slightly ragged
 * base), the odd towering head; `moonAt` ≥ 0 forces a head over the moon's
 * lower right (a disc half swallowed by cloud).
 */
function bankHeads(rng: PwKit['rng'], b: BankSpec, rowOf: (e: number) => number, moonAt: number, moonY: number): Puff[] {
  const out: Puff[] = [];
  const yb0 = rowOf(b.el);
  const head = (cx: number, hw: number, hh: number) => {
    const yb = yb0 + rng.int(-5, 4);
    const top = yb - hh;
    // Base: flattish billows, a little narrower than the heap and ragged (some sag lower).
    for (let x = cx - hw * 0.8; x <= cx + hw * 0.8; ) {
      const r = b.rMin + (b.rMax - b.rMin) * rng.next() * 0.7;
      out.push({ cx: x, cy: yb - r * b.flat * (0.25 + rng.next() * 0.4), rx: r * 1.2, ry: r * b.flat * 0.7, top, hh });
      x += r * (1.0 + rng.next() * 0.6);
    }
    // The heap: billows along a dome profile, smaller toward the crown.
    const n = Math.max(3, Math.round((hw * 2) / (b.rMin + b.rMax) * 2.2));
    for (let i = 0; i < n; i++) {
      const s = (i + rng.next() * 0.6) / n;
      const px = cx - hw + s * hw * 2;
      const prof = Math.sqrt(Math.max(0, 1 - ((px - cx) / hw) * ((px - cx) / hw)));
      const r = (b.rMin + (b.rMax - b.rMin) * rng.next()) * (0.6 + 0.5 * prof);
      out.push({ cx: px, cy: yb - prof * hh * 0.8 - r * b.flat * 0.2, rx: r, ry: r * b.flat, top, hh });
    }
    // Crown billows.
    const nc = 1 + Math.floor(rng.next() * 3);
    for (let i = 0; i < nc; i++) {
      const r = (b.rMin + (b.rMax - b.rMin) * rng.next()) * 0.7;
      out.push({ cx: cx + rng.spread(hw * 0.35), cy: top + r * b.flat * 0.9, rx: r, ry: r * b.flat * 1.05, top, hh });
    }
  };
  // (The moon's head: its crown reaches the disc's middle.)
  if (moonAt >= 0) head(moonAt, b.rMax * 2.2, Math.max(4, yb0 - moonY - 2));
  let x = rng.int(0, 30);
  while (x < W) {
    const m = smooth(x, 0, W, 8, b.cells, b.seed) * 0.8 + smooth(x, 0, W, 8, b.cells * 3, b.seed + 1) * 0.2;
    const thr = 1 - b.cover;
    const hw = (b.rMin + b.rMax) * (0.7 + rng.next() * 1.0);
    if (m > thr && Math.abs(x - moonAt) > hw) {
      const h = Math.min(1, (m - thr) / Math.max(0.05, b.cover * 0.7));
      const tower = rng.chance(b.tower) ? 1.6 : 1;
      head(x, hw, Math.max(3, Math.round(b.tall * (0.35 + 0.65 * h) * (0.7 + rng.next() * 0.5) * tower)));
    }
    x += hw * (1.2 + rng.next() * 0.9);
  }
  // Tops first: lower billows overlap the ones above them (nearer the eye in a heap).
  out.sort((a, c) => a.cy - c.cy);
  return out;
}

/** One billow (wrapping in x): `shade` sets oR / oT / oF from the normalised position. */
function drawPuff(c: PwCanvas, owner: Uint8Array, id: number, p: Puff, shade: Shader) {
  const y0 = Math.max(0, Math.floor(p.cy - p.ry));
  const y1 = Math.min(c.h - 1, Math.ceil(p.cy + p.ry));
  const x0 = Math.floor(p.cx - p.rx);
  const x1 = Math.ceil(p.cx + p.rx);
  const irx = 1 / p.rx;
  const iry = 1 / p.ry;
  for (let y = y0; y <= y1; y++) {
    const v = (y + 0.5 - p.cy) * iry;
    const v2 = v * v;
    if (v2 > 1) continue;
    const i0 = y * W;
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - p.cx) * irx;
      const d = u * u + v2;
      if (d > 1) continue;
      shade(u, v, Math.sqrt(1 - d), y);
      const i = i0 + (x < 0 ? x + W : x >= W ? x - W : x);
      c.ramp[i] = oR;
      c.tone[i] = oT < 0 ? 0 : oT > 5 ? 5 : oT;
      c.flag[i] = oF;
      owner[i] = id;
    }
  }
}

// ─── The city ───────────────────────────────────────────────────────────────

export interface CityOpts {
  hex: number;
  fog: number;
  el0: number;
  el1: number;
}

/** The city beyond the car park: two depths of silhouettes, lit windows, burning roofs (cut out above). */
export function z2CityTile(atlas: PwAtlas, o: CityOpts): PwTile {
  const H = skyRows(o.el1 - o.el0);
  return atlas.tile(`z2city2|${h6(o.hex)}|${h6(o.fog)}|${o.el0}|${o.el1}`, W, H, (c, k) => paintCity(c, k, o), { wrap: true });
}

function paintCity(c: PwCanvas, k: PwKit, o: CityOpts) {
  const rng = k.rng;
  const H = c.h;
  const span = o.el1 - o.el0;
  const ground = Math.round((o.el1 / span) * H);
  const back = k.ramp(0x232a3a, { light: 0.35, sat: 0.8 });
  const body = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
  const fog = k.ramp(o.fog, { light: 0.3 });
  const warm = k.ramp(0xffc070, { light: 0.4 });
  const cool = k.ramp(0x9cc4f0, { light: 0.4 });
  const tv = k.ramp(0x7a9cff, { light: 0.4 });
  const red = k.ramp(0xff3020, { light: 0.4 });
  const fire = k.ramp(0xff7a2a, { light: 0.55, sat: 1.1 });
  const ember = k.ramp(0xc8401a, { light: 0.5, sat: 1.1 });
  const fireCol = new Float32Array(W);
  for (let x = 0; x < W; x++) fireCol[x] = fireAt(x, 60);
  // Downtown: the skyline rises toward two clusters.
  const envAt = (x: number) => {
    const d1 = Math.min(Math.abs(x - 470), W - Math.abs(x - 470));
    const d2 = Math.min(Math.abs(x - 860), W - Math.abs(x - 860));
    return 0.22 + 0.78 * Math.exp(-(d1 / 120) * (d1 / 120)) + 0.45 * Math.exp(-(d2 / 70) * (d2 / 70));
  };
  const roof = new Int16Array(W).fill(ground);
  const fill = (x0: number, w: number, top: number, r: number, t: number, front: boolean) => {
    for (let x = x0; x < x0 + w; x++) {
      const px = wrapX(x);
      for (let y = Math.max(0, top); y < H; y++) c.set(px, y, r, t);
      if (front) roof[px] = Math.min(roof[px], top);
    }
  };

  // Back row: hazier, lighter blocks peeking over the front (a few lit points).
  for (let x = 0; x < W; ) {
    const w = rng.int(10, 30);
    const h = Math.round((6 + envAt(x) * 30) * rng.range(0.6, 1.15));
    const top = ground - h;
    fill(x, w, top, back, 2, false);
    c.hline(wrapX(x), top, w, back, 3);
    for (let i = 0; i < Math.round(w * h * 0.004); i++) c.set(wrapX(x + rng.int(1, w - 2)), rng.int(top + 2, ground - 2), warm, 2, PWF.GLOW);
    x += w + rng.int(0, 4);
  }

  // Front row: the buildings with character.
  let b = 0;
  for (let x = 0; x < W; ) {
    const burning = fireCol[wrapX(x + 6)] > 0.75;
    const tall = envAt(x) > 0.75 && rng.chance(0.55);
    const w = tall ? rng.int(12, 22) : rng.int(10, 34);
    const h = Math.round((4 + envAt(x) * 34) * rng.range(0.55, 1.05) + (tall ? 8 : 0));
    const top = Math.max(6, ground - h);
    const tone = b % 3 === 1 ? 1.5 : 2;
    const kind = burning ? 'burn' : tall ? (rng.chance(0.5) ? 'setback' : 'spire') : rng.pick(['flat', 'flat', 'water', 'billboard', 'crane', 'church', 'flat'] as const);
    fill(x, w, top, body, tone, true);
    const L = wrapX(x);
    // Lit by the glow from the left: a lighter left edge and roof line.
    c.vline(L, top, ground - top, body, tone + 1);
    c.hline(L, top, w, body, tone + 1);
    // Windows: a pattern per building (grid / bands / sparse) and a lit share; the power is out
    // in most, a floor or two still burns.
    const pat = b % 3;
    const litShare = burning ? 0.3 : tall ? 0.12 : 0.05;
    const litFloor = rng.int(0, 6);
    let floor = 0;
    for (let yy = top + 3; yy < ground - 2; yy += pat === 1 ? 3 : 2, floor++) {
      const bandLit = floor === litFloor && hash2(b, 1, 21) < 0.6;
      for (let xx = x + 2; xx < x + w - 2; xx += pat === 0 ? 2 : pat === 1 ? 1 : 3) {
        const px = wrapX(xx);
        const lit = bandLit || hash2(px, yy, 5 + b) < litShare;
        if (pat === 1 && !bandLit && hash2(px >> 2, yy, 9) < 0.5) continue;
        if (lit) {
          const hot = burning && yy < top + 8;
          c.set(px, yy, hot ? fire : hash2(b, floor, 3) < 0.7 ? warm : hash2(b, floor, 4) < 0.5 ? cool : tv, hot ? 4 : hash2(px, yy, 8) < 0.3 ? 3 : 2, PWF.GLOW);
        } else c.set(px, yy, body, tone - 1);
      }
    }
    // Roof character.
    const rx = x + rng.int(2, Math.max(3, w - 9));
    if (kind === 'setback') {
      // Two narrower tiers and a mast with a beacon.
      const t1 = rng.int(6, 10);
      fill(x + 2, w - 4, top - t1, body, tone, true);
      c.hline(wrapX(x + 2), top - t1, w - 4, body, tone + 1);
      c.vline(wrapX(x + 2), top - t1, t1, body, tone + 1);
      const t2 = rng.int(4, 7);
      fill(x + 5, Math.max(3, w - 10), top - t1 - t2, body, tone, true);
      const mx = wrapX(x + Math.floor(w / 2));
      const mh = rng.int(5, 10);
      c.vline(mx, top - t1 - t2 - mh, mh, body, tone);
      c.set(mx, top - t1 - t2 - mh - 1, red, 5, PWF.GLOW);
      for (let yy = top - t1 + 2; yy < top; yy += 2) if (rng.chance(0.4)) c.set(wrapX(x + 3 + rng.int(0, w - 7)), yy, warm, 2, PWF.GLOW);
    } else if (kind === 'spire') {
      const sw = Math.floor(w / 2);
      const cx = x + sw;
      for (let j = 0; j < 14; j++) {
        const half = Math.max(0, Math.round(sw * (1 - j / 14)));
        c.rect(wrapX(cx - half), top - j - 1, half * 2 + 1, 1, body, tone);
      }
      c.vline(wrapX(cx), top - 20, 6, body, tone);
      c.set(wrapX(cx), top - 21, red, 5, PWF.GLOW);
    } else if (kind === 'water') {
      // A wooden tank on legs with a conical cap.
      const tx = wrapX(rx);
      c.vline(tx, top - 3, 3, body, tone);
      c.vline(wrapX(rx + 5), top - 3, 3, body, tone);
      c.rect(tx, top - 8, 6, 5, body, tone);
      c.hline(tx, top - 6, 6, body, tone - 1);
      c.rect(wrapX(rx + 1), top - 9, 4, 1, body, tone);
      c.set(wrapX(rx + 2), top - 10, body, tone);
      c.vline(tx, top - 8, 5, body, tone + 1);
    } else if (kind === 'billboard') {
      // A dead billboard: the frame on two legs, a torn dark panel, one lamp still lit.
      const bw = Math.min(16, w - 2);
      const bx = wrapX(x + 1);
      c.vline(wrapX(x + 3), top - 3, 3, body, tone);
      c.vline(wrapX(x + bw - 2), top - 3, 3, body, tone);
      c.rect(bx, top - 9, bw, 6, body, tone - 0.5);
      c.hline(bx, top - 9, bw, body, tone + 1);
      for (let j = 0; j < 4; j++) if (rng.chance(0.5)) c.set(wrapX(x + 2 + rng.int(0, bw - 4)), top - 8 + rng.int(0, 3), back, 3);
      c.set(wrapX(x + bw - 1), top - 9, warm, 3, PWF.GLOW);
    } else if (kind === 'crane') {
      // A construction crane: a lattice mast, the jib, the counter-jib and a hanging hook line.
      const cx = wrapX(rx);
      const ch = rng.int(16, 24);
      for (let j = 0; j < ch; j++) {
        c.set(cx, top - j, body, tone);
        c.set(wrapX(cx + 1), top - j, body, tone);
        if (j % 3 === 0) c.set(wrapX(cx + (j % 6 === 0 ? 1 : 0)), top - j, back, 2);
      }
      const jy = top - ch;
      for (let j = -6; j < 22; j++) c.set(wrapX(cx + j), jy, body, tone);
      for (let j = 0; j < 22; j += 3) c.set(wrapX(cx + j), jy + 1, body, tone);
      c.rect(wrapX(cx - 6), jy, 3, 2, body, tone - 0.5);
      c.vline(wrapX(cx + 15), jy + 1, 7, body, tone);
      c.set(cx, jy - 1, red, 5, PWF.GLOW);
    } else if (kind === 'church') {
      const sx = wrapX(rx + 2);
      c.rect(wrapX(rx), top - 8, 5, 8, body, tone);
      for (let j = 0; j < 7; j++) c.hline(wrapX(rx + 2 - Math.floor(j / 3)), top - 15 + j, 1 + Math.floor(j / 3) * 2, body, tone);
      c.vline(sx, top - 19, 3, body, tone);
      c.hline(wrapX(rx + 1), top - 18, 3, body, tone);
      c.set(sx, top - 5, warm, 2, PWF.GLOW);
    } else if (kind === 'burn') {
      // Broken top: a jagged gap bitten out of the roof, flames standing in it, the top floors ablaze.
      for (let xx = x; xx < x + w; xx++) {
        const px = wrapX(xx);
        const bite = Math.round(Math.max(0, Math.sin(((xx - x) / w) * Math.PI) * 5 + (hash2(px, 3, 13) - 0.5) * 3));
        for (let j = 0; j < bite; j++) {
          const i = (top + j) * W + px;
          c.ramp[i] = 0;
          c.flag[i] = 0;
        }
        const fh = Math.round((2 + fireCol[px] * 5) * (0.5 + hash2(px, 7, 17)));
        for (let j = 0; j < fh; j++) {
          const yy = top + bite - 1 - j;
          if (j > fh * 0.6 && bayer(px, yy) < 0.5) continue;
          c.set(px, yy, j < 2 ? ember : fire, j === 0 ? 3 : j < fh * 0.5 ? 4 : 5, PWF.GLOW);
        }
      }
    } else {
      // Flat roof clutter: AC boxes, a stack.
      c.rect(wrapX(rx), top - 2, 3, 2, body, tone);
      if (rng.chance(0.5)) c.vline(wrapX(rx + 5), top - 4, 4, body, tone);
    }
    x += w + (rng.chance(0.25) ? rng.int(1, 4) : 0);
    b++;
  }
  // The fire-lit faces: buildings next to a fire catch an orange rim on their left edge.
  for (let x = 1; x < W; x++) {
    if (fireCol[x] < 0.5) continue;
    for (let y = roof[x]; y < ground; y++) {
      const i = y * W + x;
      if (c.ramp[i] === body && c.ramp[i - 1] !== body && bayer(x, y) < fireCol[x] * 0.6) c.set(x, y, ember, 2);
    }
  }
  // Foot: sinks into the fog (a dithered seam, then the fog colour).
  for (let y = ground - 6; y < H; y++) {
    const t = Math.min(1, (y - (ground - 6)) / 6);
    for (let xx = 0; xx < W; xx++) if (c.at(xx, y) && (y >= ground || bayer(xx, y) < t)) c.set(xx, y, fog, 3);
  }
}

/** Nearer roofs (a darker layer that drifts against the city): sheds, a gas holder, stacks, trees, poles, wires. */
export function z2RoofsTile(atlas: PwAtlas, o: CityOpts): PwTile {
  const H = skyRows(o.el1 - o.el0);
  return atlas.tile(`z2roofs|${h6(o.hex)}|${h6(o.fog)}|${o.el0}|${o.el1}`, W, H, (c, k) => paintRoofs(c, k, o), { wrap: true });
}

function paintRoofs(c: PwCanvas, k: PwKit, o: CityOpts) {
  const rng = k.rng;
  const H = c.h;
  const span = o.el1 - o.el0;
  const ground = Math.round((o.el1 / span) * H);
  const body = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
  const fog = k.ramp(o.fog, { light: 0.3 });
  const rim = k.ramp(0x7a3a24, { light: 0.4, sat: 1.0 });
  const warm = k.ramp(0xffc070, { light: 0.4 });
  const tree = k.ramp(0x12181a, { light: 0.35 });
  const set = (x: number, y: number, r: number, t: number, f = 0) => c.set(wrapX(x), y, r, t, f);
  const poles: number[] = [];
  for (let x = 0; x < W; ) {
    const kind = rng.pick(['shed', 'shed', 'house', 'house', 'trees', 'gas', 'stack', 'steeple', 'trees', 'tank'] as const);
    let w = 20;
    if (kind === 'shed') {
      // Sawtooth factory roof.
      w = rng.int(28, 60);
      const top = ground - rng.int(6, 10);
      for (let xx = 0; xx < w; xx++) {
        const tooth = 4 - Math.floor((xx % 8) / 2);
        for (let y = top - tooth; y < H; y++) set(x + xx, y, body, 2);
        if (xx % 8 === 0) for (let j = 0; j < 4; j++) set(x + xx, top - 4 + j, body, 3);
      }
      for (let j = 0; j < w; j += rng.int(5, 9)) if (rng.chance(0.25)) set(x + j, top + 3, warm, 2, PWF.GLOW);
    } else if (kind === 'house') {
      w = rng.int(12, 18);
      const top = ground - rng.int(5, 8);
      const half = Math.floor(w / 2);
      for (let xx = 0; xx < w; xx++) {
        const g = Math.round(Math.min(xx, w - 1 - xx) * 0.6);
        for (let y = top - g; y < H; y++) set(x + xx, y, body, 2);
      }
      set(x + half + 3, top - Math.round(half * 0.6) - 1, body, 2);
      set(x + half + 3, top - Math.round(half * 0.6) - 2, body, 2);
      if (rng.chance(0.3)) set(x + 3, top + 3, warm, 3, PWF.GLOW);
    } else if (kind === 'trees') {
      w = rng.int(14, 30);
      for (let i = 0; i < w / 5; i++) {
        const cx = x + i * 5 + rng.int(0, 3);
        const r = rng.int(3, 6);
        const cy = ground - 3 - r;
        for (let y = cy - r; y <= ground; y++) {
          for (let xx = cx - r; xx <= cx + r; xx++) {
            const d = Math.hypot(xx - cx, (y - cy) * 1.2);
            if (y < cy ? d > r - (hash2(xx, y, 3) < 0.3 ? 1 : 0) : Math.abs(xx - cx) > r) continue;
            set(xx, y, tree, 2);
          }
        }
      }
    } else if (kind === 'gas') {
      // A gas holder: a round frame of uprights and rings, the bell inside.
      w = 30;
      const top = ground - 16;
      for (let xx = 2; xx < w - 2; xx++) for (let y = top + 3 + Math.round(Math.abs(xx - w / 2) / 6); y < H; y++) set(x + xx, y, body, 2);
      for (let xx = 0; xx < w; xx += 5) for (let y = top; y < ground; y++) set(x + xx, y, body, 2);
      for (const yy of [top, top + 6, top + 11]) for (let xx = 0; xx < w; xx++) set(x + xx, yy, body, 2);
    } else if (kind === 'stack') {
      w = 14;
      const top = ground - 6;
      for (let xx = 0; xx < w; xx++) for (let y = top; y < H; y++) set(x + xx, y, body, 2);
      const sh = rng.int(18, 26);
      for (let y = ground - sh; y < top; y++) for (let j = 0; j < 3; j++) set(x + 6 + j, y, body, j === 0 ? 3 : 2);
      for (let j = 0; j < 3; j++) set(x + 6 + j, ground - sh + 3, rim, 3);
      set(x + 7, ground - sh - 1, warm, 4, PWF.GLOW);
    } else if (kind === 'steeple') {
      w = 12;
      const top = ground - 9;
      for (let xx = 0; xx < w; xx++) for (let y = top; y < H; y++) set(x + xx, y, body, 2);
      for (let j = 0; j < 12; j++) for (let q = -Math.floor(j / 4); q <= Math.floor(j / 4); q++) set(x + 6 + q, top - 12 + j, body, 2);
      set(x + 6, top - 15, body, 2);
      set(x + 6, top - 14, body, 2);
      set(x + 5, top - 14, body, 2);
      set(x + 7, top - 14, body, 2);
    } else {
      // A water tank on a lattice.
      w = 14;
      const top = ground - 6;
      for (let xx = 0; xx < w; xx++) for (let y = top; y < H; y++) set(x + xx, y, body, 2);
      for (let y = top - 8; y < top; y++) {
        set(x + 4, y, body, 2);
        set(x + 10, y, body, 2);
        if (y % 3 === 0) for (let q = 4; q <= 10; q++) set(x + q, y, body, 2);
      }
      for (let y = top - 15; y < top - 8; y++) for (let q = 3; q <= 11; q++) set(x + q, y, body, q === 3 ? 3 : 2);
    }
    if (rng.chance(0.45)) poles.push(x + w + 2);
    x += w + rng.int(2, 10);
  }
  // Rim: the glow behind lights the top edge of every silhouette (stronger toward the fires).
  for (let x = 0; x < W; x++) {
    const fk = fireAt(x, 80);
    for (let y = 1; y < ground; y++) {
      const i = y * W + x;
      if (!c.ramp[i] || c.ramp[i - W] || c.flag[i] & PWF.GLOW) continue;
      if (bayer(x, y) < 0.35 + fk * 0.6) c.set(x, y, rim, fk > 0.6 ? 3 : 2);
    }
  }
  // Utility poles with sagging wires between them.
  for (let i = 0; i < poles.length; i++) {
    const px = poles[i];
    for (let y = ground - 20; y < ground; y++) set(px, y, body, 2);
    for (const dx of [-2, -1, 1, 2]) set(px + dx, ground - 19, body, 2);
    const nx = i + 1 < poles.length ? poles[i + 1] : poles[0] + W;
    const len = nx - px;
    if (len > 160) continue;
    for (let j = 1; j < len; j++) {
      const sag = Math.round(Math.sin((j / len) * Math.PI) * Math.min(5, len / 14));
      const xx = wrapX(px + j);
      const y = ground - 19 + sag;
      if (!c.at(xx, y)) c.set(xx, y, body, 2);
    }
  }
  // Foot into the fog.
  for (let y = ground - 5; y < H; y++) {
    const t = Math.min(1, (y - (ground - 5)) / 5);
    for (let xx = 0; xx < W; xx++) if (c.at(xx, y) && (y >= ground || bayer(xx, y) < t)) c.set(xx, y, fog, 3);
  }
}

// ─── The dome ───────────────────────────────────────────────────────────────

const SEG = 96;

/**
 * The storm band on a sphere (`el0` → `el1`, the tile laid `repeat` times
 * round) and a cap over it pinned to the tile's top row: the sky the camera
 * looks up into (a cylinder band would end in an arc at its top).
 */
export function z2SkyDome(tile: PwTile, mat: THREE.Material, o: { radius: number; el0: number; el1: number; repeat: number; yaw?: number }): THREE.Group {
  const g = new THREE.Group();
  g.name = 'z2-sky-dome';
  const d2r = Math.PI / 180;
  const yaw = o.yaw ?? 0;
  const rings = 28;
  const mk = (pos: number[], uv: number[], idx: number[]) => {
    const geo = new THREE.BufferGeometry();
    const n = pos.length / 3;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('pwUv', new THREE.Float32BufferAttribute(uv, 2));
    const rect = new Int16Array(n * 4);
    for (let i = 0; i < n; i++) rect.set([tile.x, tile.y, tile.w, tile.h], i * 4);
    geo.setAttribute('pwRect', new THREE.BufferAttribute(rect, 4));
    geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(n * 3).fill(255), 3, true));
    geo.setIndex(idx);
    const m = new THREE.Mesh(Kit.track(geo), mat);
    m.renderOrder = -7;
    m.frustumCulled = false;
    m.raycast = () => {};
    m.userData.pixelWorld = true;
    m.userData.noMerge = true;
    g.add(m);
  };
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= rings; j++) {
      const el = o.el0 + ((o.el1 - o.el0) * j) / rings;
      const y = o.radius * Math.sin(el * d2r);
      const rr = o.radius * Math.cos(el * d2r);
      for (let i = 0; i <= SEG; i++) {
        const a = (yaw + (360 * i) / SEG) * d2r;
        pos.push(Math.sin(a) * rr, y, -Math.cos(a) * rr);
        uv.push((tile.w * o.repeat * i) / SEG, (tile.h * j) / rings);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = j * (SEG + 1) + i;
        idx.push(a, a + 1, a + SEG + 2, a, a + SEG + 2, a + SEG + 1);
      }
    }
    mk(pos, uv, idx);
  }
  {
    const pos: number[] = [0, o.radius, 0];
    const uv: number[] = [tile.w / 2, tile.h - 0.5];
    const idx: number[] = [];
    const y = o.radius * Math.sin(o.el1 * d2r);
    const rr = o.radius * Math.cos(o.el1 * d2r);
    for (let i = 0; i <= SEG; i++) {
      const a = (yaw + (360 * i) / SEG) * d2r;
      pos.push(Math.sin(a) * rr, y, -Math.cos(a) * rr);
      uv.push((tile.w * o.repeat * i) / SEG, tile.h - 0.5);
    }
    for (let i = 0; i < SEG; i++) idx.push(0, i + 1, i + 2);
    mk(pos, uv, idx);
  }
  return g;
}
