import { bayer, PWF, PW_BACKDROP_TPD, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2 } from './surfaces';
import { h6 } from './z3kit';

/**
 * HIGHWAY TO HELL (z3) panorama for ART: PIXEL WORLD, painted straight into
 * the canvas arrays (per-row / per-column work hoisted out of the texel loops):
 *  - SKY (wrap 2048 × 256, el −6…40°): the dusk as stepped bands — fog rose at
 *    the horizon, mauve, plum, purple, violet, indigo — warming into gold and
 *    orange toward the low sun and into a red fire glow over the burning city
 *    behind (ordered dither only on the seams); the sun sliced by thin cloud
 *    bars with stepped halo rings; long stratus streaks with sun-lit bellies;
 *    the city's smoke columns towering into the violet, fire-lit at the foot;
 *    a pale crescent moon, the first stars, a few crows;
 *  - HILLS (wrap 2048 × 64): two dry ranges, the near one darker, rims lit
 *    toward the sun, a line of pylons and the odd water tower / mast on the
 *    ridges, the foot melting into the fog;
 *  - CITY (panel, the burning skyline the truck is escaping): towers with
 *    setbacks, spires, a needle, cranes, window grids (dark, lit, burning
 *    floors), flames on the roofs, a fire line along the base.
 */

const TW = 2048;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function z3RowsFor(deg: number): number {
  return Math.max(16, Math.round((deg * PW_BACKDROP_TPD) / 16) * 16);
}

const colOf = (az: number) => Math.round((((az % 360) + 360) % 360) * (TW / 360));
const dAz = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bb = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bb;
}

export interface Z3SkyOpts {
  fog: number;
  el0: number;
  el1: number;
  sunAz: number;
  sunEl: number;
  cityAz: number;
}

/** Band floors (deg) and colours: cool (away from both), the sun side, the city's fire side. */
const BANDS = [-90, 0.8, 3, 7, 12, 19, 28];
const COOL = [0, 0xb4625a, 0xa05a68, 0x7a4a72, 0x573a70, 0x3c2c62, 0x281e52];
const WARM = [0, 0xf0a050, 0xe27c52, 0xc65c5c, 0x8e4666, 0x54366c, 0x2e2256];
const FIRE = [0, 0xcc4a32, 0xa64448, 0x80405e, 0x5a386e, 0x3c2c62, 0x281e52];
/** Sun-side families (0 = cool … 4 = hottest), city-side families (1…3). */
const SUN_LV = 4;
const CITY_LV = 3;

export function z3SkyTile(atlas: PwAtlas, o: Z3SkyOpts): PwTile {
  const H = z3RowsFor(o.el1 - o.el0);
  return atlas.tile(`z3sky|${h6(o.fog)}|${o.el0}|${o.el1}|${o.sunAz}|${o.sunEl}|${o.cityAz}`, TW, H, (c, k) => paintSky(c, k, o), { wrap: true });
}

function paintSky(c: PwCanvas, k: PwKit, o: Z3SkyOpts) {
  const rng = k.rng;
  const H = c.h;
  const R = c.ramp;
  const T = c.tone;
  const F = c.flag;
  const fog = k.ramp(o.fog, { light: 0.35, dark: 0.5 });
  // Ramp per (family, band): family 0 cool, +1…+4 toward the sun, −1…−3 toward the fire.
  const fam = new Map<number, number[]>();
  for (let f = -CITY_LV; f <= SUN_LV; f++) {
    const row: number[] = [fog];
    for (let b = 1; b < BANDS.length; b++) {
      const hex = f > 0 ? mixHex(COOL[b], WARM[b], f / SUN_LV) : f < 0 ? mixHex(COOL[b], FIRE[b], -f / CITY_LV) : COOL[b];
      row.push(k.ramp(hex, { light: 0.4, dark: 0.55, sat: 1 }));
    }
    fam.set(f, row);
  }
  // Per column: the family value (continuous; dithered between neighbours), split into floor + fraction.
  const famLo = new Int8Array(TW);
  const famFr = new Float32Array(TW);
  const famV = new Float32Array(TW);
  for (let x = 0; x < TW; x++) {
    const az = (x / TW) * 360;
    const ds = dAz(az, o.sunAz);
    const dc = dAz(az, o.cityAz);
    const sw = ds < 95 ? Math.pow(Math.cos((ds / 95) * (Math.PI / 2)), 1.6) : 0;
    const cw = dc < 70 ? Math.pow(Math.cos((dc / 70) * (Math.PI / 2)), 1.4) : 0;
    const v = sw > cw ? sw * SUN_LV : -cw * CITY_LV;
    famV[x] = v;
    famLo[x] = Math.floor(v);
    famFr[x] = v - Math.floor(v);
  }
  const famRows: number[][] = [];
  for (let f = -CITY_LV; f <= SUN_LV + 1; f++) famRows.push(fam.get(Math.min(SUN_LV, f))!);
  // Per row: band index and its seam blend (±0.9° dithered across each band floor).
  const bandOf = new Int8Array(H);
  const seam = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    const el = o.el1 - ((y + 0.5) / H) * (o.el1 - o.el0);
    let b = 0;
    while (b + 1 < BANDS.length && el >= BANDS[b + 1]) b++;
    bandOf[y] = b;
    // Distance above the band's floor: within 0.9° we dither with the band below.
    const above = el - BANDS[b];
    seam[y] = b > 0 && above < 0.9 ? 0.5 + (above / 0.9) * 0.5 : 1;
  }
  for (let y = 0; y < H; y++) {
    const b = bandOf[y];
    const s = seam[y];
    const by = (y & 3) * 4;
    const row = y * TW;
    // The highest band steps one tone darker toward the zenith (a calmer top).
    const tn = b === BANDS.length - 1 && y < H * 0.12 ? 2.6 : 3;
    for (let x = 0; x < TW; x++) {
      const th = BAYER[by + (x & 3)];
      const rr = famRows[famLo[x] + CITY_LV + (famFr[x] > th ? 1 : 0)];
      const bb = s < 1 && th > s ? b - 1 : b;
      const i = row + x;
      R[i] = rr[bb];
      T[i] = bb === 0 ? 3 : tn;
    }
  }
  const sunX = colOf(o.sunAz);
  const rowOfEl = (el: number) => Math.round(((o.el1 - el) / (o.el1 - o.el0)) * H);
  const sunY = rowOfEl(o.sunEl);
  // Halo: stepped rings round the sun (one tone up, then a dithered half step).
  for (let y = sunY - 46; y <= sunY + 46; y++) {
    if (y < 0 || y >= H) continue;
    for (let dx = -60; dx <= 60; dx++) {
      const x = (sunX + dx + TW) % TW;
      const d = Math.sqrt(dx * dx * 0.55 + (y - sunY) * (y - sunY));
      const i = y * TW + x;
      if (bandOf[y] === 0) continue;
      if (d < 22) T[i] = Math.min(5, T[i] + 1);
      else if (d < 34 && BAYER[(y & 3) * 4 + (x & 3)] < (34 - d) / 12) T[i] = Math.min(5, T[i] + 1);
    }
  }
  // Sunset clouds: banks of lumpy puffs with dark bodies and sun-lit bellies (gold near the
  // sun, rose elsewhere, red over the fire), plus long thin streaks low down.
  const cloudCool = k.ramp(0x4a3456, { light: 0.4, sat: 0.9 });
  const cloudWarm = k.ramp(0x5a2c4a, { light: 0.45, sat: 1 });
  const rimCool = k.ramp(0xd88a8a, { light: 0.5 });
  const rimWarm = k.ramp(0xffc070, { light: 0.6, sat: 1.1 });
  const rimFire = k.ramp(0xe06040, { light: 0.5 });
  const rampsAt = (x: number) => {
    const fv = famV[((x % TW) + TW) % TW];
    return fv > 1.4 ? { body: cloudWarm, rim: rimWarm, hot: fv > 3 } : fv < -1 ? { body: cloudCool, rim: rimFire, hot: false } : { body: cloudCool, rim: rimCool, hot: false };
  };
  for (let n = 0; n < 14; n++) {
    const el = 2.5 + Math.pow(rng.next(), 1.1) * 17;
    const base = rowOfEl(el);
    const cx = rng.int(0, TW - 1);
    const L = Math.round((70 + rng.next() * 220) * (1.15 - el / 40));
    const hMax = Math.max(3, Math.round((5 + rng.next() * 9) * (1.1 - el / 40)));
    bank(c, rng, cx, base, L, hMax, rampsAt);
  }
  for (let n = 0; n < 16; n++) {
    const el = 1.6 + Math.pow(rng.next(), 2) * 10;
    const cy = rowOfEl(el);
    const cx = rng.int(0, TW - 1);
    const L = Math.round(30 + rng.next() * 140);
    const seed = rng.int(0, 9999);
    for (let dx = -L; dx <= L; dx++) {
      const x = (cx + dx + TW * 4) % TW;
      const u = dx / L;
      if (hash2(dx >> 2, seed, 5) > 0.9 || Math.abs(u) > 0.97) continue;
      const rs = rampsAt(x);
      const y = cy + (Math.abs(u) > 0.6 && hash2(dx >> 4, seed, 3) > 0.5 ? 1 : 0);
      if (y < 0 || y >= H) continue;
      R[y * TW + x] = rs.body;
      T[y * TW + x] = 2.6;
      if (y + 1 < H && Math.abs(u) < 0.8) {
        R[(y + 1) * TW + x] = rs.rim;
        T[(y + 1) * TW + x] = rs.hot ? 5 : 3;
      }
    }
  }
  // The sun: a white-gold disc, two bars of cloud sliding across it.
  const sun = k.ramp(0xffe8a0, { light: 0.7, sat: 1 });
  const sunR = 11;
  for (let y = -sunR; y <= sunR; y++) {
    for (let x = -sunR; x <= sunR; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > sunR + 0.3) continue;
      const yy = sunY + y;
      if (yy < 0 || yy >= H) continue;
      const bar = y === 3 || y === 4 || y === 7 || y === 9;
      const i = yy * TW + ((sunX + x + TW) % TW);
      if (bar) {
        R[i] = cloudWarm;
        T[i] = y === 3 || y === 7 ? 3 : 2;
        continue;
      }
      R[i] = sun;
      T[i] = d < sunR - 3 ? 5 : d < sunR - 1 ? 4 : 3;
      F[i] = PWF.GLOW;
    }
  }
  // Smoke columns over the burning city: billows climbing, bending downwind and spreading into a
  // flat drifting pall; dark brown-violet, fire-lit from beneath, the sky's light on their tops.
  const smoke = k.ramp(0x3c2a34, { light: 0.4, dark: 0.6, sat: 0.9 });
  const smokeLit = k.ramp(0x8a4a3c, { light: 0.5, sat: 1.1 });
  const cityX = colOf(o.cityAz);
  for (let n = 0; n < 6; n++) {
    const x0 = cityX + Math.round((rng.next() * 2 - 1) * 230);
    const big = n < 3;
    const topEl = big ? 15 + rng.next() * 10 : 7 + rng.next() * 6;
    const yBase = rowOfEl(0.6);
    const yTop = rowOfEl(topEl);
    const dir = rng.chance(0.7) ? 1 : -1;
    const rise = yBase - yTop;
    const R0 = big ? 4 : 2.5;
    const R1 = big ? 12 : 7;
    // Trunk: climbing nearly straight, swelling.
    let x = x0;
    const trunk = Math.round(rise / 3);
    for (let s2 = 0; s2 <= trunk; s2++) {
      const t = s2 / trunk;
      const y = Math.round(yBase - t * rise * 0.8);
      x = x0 + Math.round(dir * t * t * (big ? 18 : 10) + Math.sin(t * 8 + n) * 2);
      const r = R0 + (R1 - R0) * t;
      puff(c, x + Math.round((hash2(s2, n, 10) - 0.5) * r * 0.7), y, r * (0.85 + hash2(s2, n, 9) * 0.3), t < 0.1 ? smokeLit : smoke, t);
    }
    // Head: a cauliflower of billows where the column tops out.
    const hx = x;
    const hy = Math.round(yBase - rise * 0.85);
    for (let q = 0; q < (big ? 9 : 5); q++) {
      const a = (q / (big ? 9 : 5)) * Math.PI * 2;
      const r = R1 * (0.7 + hash2(q, n, 12) * 0.5);
      puff(c, hx + Math.round(Math.cos(a) * R1 * 0.9), hy + Math.round(Math.sin(a) * R1 * 0.55), r, smoke, 0.5);
    }
    // The drifting pall downwind: flattened billows thinning out (dithered).
    for (let q = 1; q <= (big ? 10 : 6); q++) {
      const t = q / (big ? 10 : 6);
      const px = hx + Math.round(dir * t * (big ? 230 : 120));
      const py = hy - Math.round(R1 * 0.4) + Math.round(t * 6 + Math.sin(q * 1.7 + n) * 3);
      puff(c, px, py, R1 * (0.8 - t * 0.35), smoke, 0.5, 2.2, 1 - t * 0.85);
    }
  }
  // A pale crescent moon high over the far side, a few first stars, crows.
  {
    const moon = k.ramp(0xeadce4, { light: 0.6, sat: 0.5 });
    const mx = colOf(o.cityAz + 58);
    const my = rowOfEl(27);
    for (let y = -6; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > 6.2) continue;
        const d2 = Math.sqrt((x + 2.6) * (x + 2.6) + (y - 1.2) * (y - 1.2));
        const i = (my + y) * TW + ((mx + x + TW) % TW);
        if (d2 < 5.4) T[i] = Math.min(5, T[i] + 0.6);
        else {
          R[i] = moon;
          T[i] = d > 5 ? 3 : 4;
          F[i] = PWF.GLOW;
        }
      }
    }
    const star = k.ramp(0xf0e0f0, { light: 0.6, sat: 0.4 });
    for (let s = 0; s < 70; s++) {
      const x = rng.int(0, TW - 1);
      const el = 21 + rng.next() * 19;
      if (famV[x] > 1) continue;
      const y = rowOfEl(el);
      if (y < 0 || y >= H) continue;
      const i = y * TW + x;
      R[i] = star;
      T[i] = rng.chance(0.25) ? 5 : 3;
      F[i] = PWF.GLOW;
    }
    const crow = k.ramp(0x1c1420, { light: 0.3 });
    for (let s = 0; s < 9; s++) {
      const x = (colOf(o.sunAz) + rng.int(-300, 300) + TW) % TW;
      const y = rowOfEl(5 + rng.next() * 12);
      const wing = rng.chance(0.5) ? 1 : 0;
      for (const [dx, dy] of [[-2, -wing], [-1, 0], [0, 1], [1, 0], [2, -wing]]) {
        const i = (y + dy) * TW + ((x + dx + TW) % TW);
        R[i] = crow;
        T[i] = 1;
        F[i] = 0;
      }
    }
  }
}

/** A smoke puff: a ragged disc (`sx` stretches it sideways), lit upper-left, shadowed lower-right; the foot (t < 0.12) glows with fire. */
function puff(c: PwCanvas, cx: number, cy: number, r: number, ramp: number, t: number, sx = 1, cover = 1) {
  const W = c.w;
  const R = c.ramp;
  const T = c.tone;
  const F = c.flag;
  const ri = Math.ceil(r);
  const rx = Math.ceil(r * sx);
  for (let y = -ri; y <= ri; y++) {
    const yy = cy + y;
    if (yy < 0 || yy >= c.h) continue;
    for (let x = -rx; x <= rx; x++) {
      const xs = x / sx;
      const d = Math.sqrt(xs * xs + y * y) + hash2((cx + x) >> 1, yy >> 1, 17) * 1.8;
      if (d > r) continue;
      if (cover < 1 && BAYER[(yy & 3) * 4 + ((cx + x) & 3)] > cover * (1.4 - d / r)) continue;
      const i = yy * W + (((cx + x) % W) + W) % W;
      const l = (-xs - y * 1.3) / r;
      // Rim light on the top edge, fire glow on the underside of the low billows.
      const rim = d > r - 1.6 && y < -r * 0.3;
      R[i] = ramp;
      T[i] = rim ? 4 : l > 0.45 ? 3.4 : l > -0.3 ? 2.6 : 2;
      F[i] = t < 0.12 && y > 0 ? PWF.GLOW : 0;
    }
  }
}

/**
 * A cloud bank: overlapping puffs along a flat base `L` texels either side of `cx`, up to `hMax`
 * rows tall in the middle; a dark body, the sky's light on the crowns, a lit belly.
 */
function bank(c: PwCanvas, rng: { next(): number; int(a: number, b: number): number }, cx: number, base: number, L: number, hMax: number, rampsAt: (x: number) => { body: number; rim: number; hot: boolean }) {
  const W = c.w;
  const R = c.ramp;
  const T = c.tone;
  const F = c.flag;
  const top = new Int16Array(L * 2 + 1).fill(9999);
  const bot = new Int16Array(L * 2 + 1).fill(-1);
  const n = Math.max(3, Math.round(L / 10));
  for (let p = 0; p < n; p++) {
    const u = rng.next();
    const px = Math.round(-L + u * 2 * L);
    const env = Math.sin(u * Math.PI);
    const pr = Math.max(1.2, hMax * env * (0.35 + rng.next() * 0.75));
    const ax = pr * (2.2 + rng.next() * 1.8);
    // Some puffs sit lower (a ragged base), most on it.
    const by = base + (rng.next() < 0.25 ? -Math.round(pr * 0.6) : 0);
    for (let dx = -Math.ceil(ax); dx <= Math.ceil(ax); dx++) {
      const j = px + dx + L;
      if (j < 0 || j > L * 2) continue;
      const hh = Math.sqrt(Math.max(0, 1 - (dx / ax) ** 2)) * pr;
      const t = Math.round(by - hh);
      if (t < top[j]) top[j] = t;
      if (by > bot[j]) bot[j] = by;
    }
  }
  for (let j = 0; j <= L * 2; j++) {
    if (top[j] >= base || bot[j] < 0) continue;
    const x = (((cx - L + j) % W) + W) % W;
    const rs = rampsAt(x);
    const b = bot[j];
    for (let y = Math.max(0, top[j]); y <= b && y < c.h; y++) {
      const i = y * W + x;
      const d = y - top[j];
      R[i] = rs.body;
      T[i] = d === 0 ? 3.4 : d === 1 ? 3 : y >= b - 1 ? 2 : 2.4;
      F[i] = 0;
    }
    // Lit belly: the underside rim (two rows, hot, near the sun).
    if (j > 1 && j < L * 2 - 1 && b + 1 < c.h && b - top[j] > 1) {
      const i = (b + 1) * W + x;
      R[i] = rs.rim;
      T[i] = rs.hot ? 5 : 3.4;
      if (b + 2 < c.h && rs.hot && (j & 3) !== 0) {
        R[i + W] = rs.rim;
        T[i + W] = 3.4;
      }
      R[b * W + x] = rs.rim;
      T[b * W + x] = rs.hot ? 4 : 2.6;
    }
  }
}

export interface Z3HillsOpts {
  near: number;
  far: number;
  fog: number;
  el0: number;
  el1: number;
  sunAz: number;
  cityAz: number;
}

/** Two dry ranges with pylons and masts on the ridges (wrap 2048 × 64, cut out above). */
export function z3HillsTile(atlas: PwAtlas, o: Z3HillsOpts): PwTile {
  const H = z3RowsFor(o.el1 - o.el0);
  return atlas.tile(`z3hills|${h6(o.near)}|${h6(o.far)}|${o.el0}|${o.el1}|${o.sunAz}|${o.cityAz}`, TW, H, (c, k) => {
    const rng = k.rng;
    const R = c.ramp;
    const T = c.tone;
    const F = c.flag;
    const far = k.ramp(o.far, { light: 0.4, sat: 0.9 });
    const near = k.ramp(o.near, { light: 0.4, sat: 0.9 });
    const fog = k.ramp(o.fog, { light: 0.35, dark: 0.5 });
    const red = k.ramp(0xff3020, { light: 0.4 });
    const rowOfEl = (el: number) => Math.round(((o.el1 - el) / (o.el1 - o.el0)) * H);
    const horizon = rowOfEl(0);
    const sunX = colOf(o.sunAz);
    const cityX = colOf(o.cityAz);
    // Ridges (per column, in rows): sums of hashed bumps at a few scales.
    const ridge = (x: number, seed: number, amp: number, base: number) => {
      let v = 0;
      for (const [s, a] of [[340, 0.55], [120, 0.3], [36, 0.12], [9, 0.04]] as const) {
        const xs = x / s;
        const i0 = Math.floor(xs);
        const f = xs - i0;
        const sm = f * f * (3 - 2 * f);
        const n = Math.round(TW / s);
        const a0 = hash2(((i0 % n) + n) % n, seed, 1);
        const a1 = hash2((((i0 + 1) % n) + n) % n, seed, 1);
        v += (a0 + (a1 - a0) * sm) * a;
      }
      return Math.round(base - v * amp);
    };
    const farTop = new Int16Array(TW);
    const nearTop = new Int16Array(TW);
    for (let x = 0; x < TW; x++) {
      // Lower in front of the city skyline (it carries its own foreground).
      const dc = Math.min(Math.abs(x - cityX), TW - Math.abs(x - cityX)) / TW;
      const dip = dc < 0.12 ? 0.35 + dc * 5 : 1;
      farTop[x] = ridge(x, 7, (H * 0.72) * dip, horizon + 1);
      nearTop[x] = ridge(x + 900, 8, (H * 0.4) * dip, horizon + 4);
    }
    for (let x = 0; x < TW; x++) {
      const towardSun = ((sunX - x + TW) % TW) < TW / 2 ? 1 : -1;
      const fSlope = (farTop[(x + 2) % TW] - farTop[(x - 2 + TW) % TW]) * towardSun;
      const nSlope = (nearTop[(x + 2) % TW] - nearTop[(x - 2 + TW) % TW]) * towardSun;
      for (let y = Math.max(0, farTop[x]); y < H; y++) {
        const i = y * TW + x;
        const isNear = y >= nearTop[x];
        const top = isNear ? nearTop[x] : farTop[x];
        const slope = isNear ? nSlope : fSlope;
        const depth = y - top;
        let t = isNear ? 2 : 3;
        if (depth === 0) t += slope < 0 ? 1 : 0.5;
        else if (slope < -1 && depth < 3) t += 1;
        // Gullies: darker vertical strokes down the faces.
        if (hash2(x >> 2, 0, isNear ? 3 : 4) > 0.82 && depth > 2 && ((y + x) & 3) !== 0) t -= 1;
        R[i] = isNear ? near : far;
        T[i] = t;
        F[i] = 0;
        // Haze to the fog toward the foot (dithered).
        const yb = (y - horizon) / Math.max(1, H - horizon);
        if (y > horizon - 2 && BAYER[(y & 3) * 4 + (x & 3)] < Math.min(1, (yb + 0.15) * 1.6)) {
          R[i] = fog;
          T[i] = 3;
        }
      }
    }
    // Pylons along the far ridge (lattice towers with drooping lines between), masts with red beacons.
    let prev = -1;
    let prevY = 0;
    for (let x = 30; x < TW; x += 54 + rng.int(0, 20)) {
      const dc = Math.min(Math.abs(x - cityX), TW - Math.abs(x - cityX));
      if (dc < 300) {
        prev = -1;
        continue;
      }
      const base = nearTop[x] < farTop[x] ? nearTop[x] : farTop[x];
      const top = base - 13;
      for (let y = top; y < base; y++) {
        const half = Math.round(((y - top) / 13) * 3) + 1;
        R[y * TW + x - half] = near;
        T[y * TW + x - half] = 1;
        R[y * TW + x + half] = near;
        T[y * TW + x + half] = 1;
        if ((y - top) % 3 === 0) for (let j = -half; j <= half; j++) ((R[y * TW + x + j] = near), (T[y * TW + x + j] = 1));
      }
      for (let j = -4; j <= 4; j++) ((R[(top + 2) * TW + x + j] = near), (T[(top + 2) * TW + x + j] = 1));
      R[(top - 1) * TW + x] = near;
      T[(top - 1) * TW + x] = 1;
      if (prev >= 0) {
        // The line sagging between the two arms.
        const span = x - prev;
        for (let s = 1; s < span; s++) {
          const u = s / span;
          const y = Math.round(prevY + (top + 2 - prevY) * u + Math.sin(u * Math.PI) * 4);
          if (!R[y * TW + prev + s]) {
            R[y * TW + prev + s] = near;
            T[y * TW + prev + s] = 1;
          }
        }
      }
      prev = x;
      prevY = top + 2;
      if (rng.chance(0.18)) {
        // A radio mast with a blinking-red top (painted on).
        const mx = x + 22;
        const mb = farTop[mx % TW];
        for (let y = mb - 22; y < mb; y++) ((R[y * TW + mx] = far), (T[y * TW + mx] = 2));
        R[(mb - 23) * TW + mx] = red;
        T[(mb - 23) * TW + mx] = 5;
        F[(mb - 23) * TW + mx] = PWF.GLOW;
      }
    }
    void bayer;
  }, { wrap: true });
}

export interface Z3CityOpts {
  body: number;
  fog: number;
  span: number;
  el0: number;
  el1: number;
}

/** The burning skyline (a panel `span`° wide, cut out above the roofs). */
export function z3CityTile(atlas: PwAtlas, o: Z3CityOpts): PwTile {
  const W = Math.round((o.span * PW_BACKDROP_TPD) / 16) * 16;
  const H = z3RowsFor(o.el1 - o.el0);
  return atlas.tile(`z3city|${h6(o.body)}|${o.span}|${o.el0}|${o.el1}`, W, H, (c, k) => {
    const rng = k.rng;
    const body = k.ramp(o.body, { light: 0.45, sat: 1 });
    const body2 = k.ramp(0x342238, { light: 0.45, sat: 1 });
    const fog = k.ramp(o.fog, { light: 0.35 });
    const warm = k.ramp(0xffc477, { light: 0.45 });
    const dim = k.ramp(0xc89a6a, { light: 0.4 });
    const fire = k.ramp(0xff7a20, { light: 0.55, sat: 1.15 });
    const fireHot = k.ramp(0xffd060, { light: 0.6 });
    const red = k.ramp(0xff3020, { light: 0.4 });
    const R = c.ramp;
    const T = c.tone;
    const F = c.flag;
    const rowOfEl = (el: number) => Math.round(((o.el1 - el) / (o.el1 - o.el0)) * H);
    const ground = rowOfEl(0);
    const setT = (x: number, y: number, r: number, t: number, f = 0) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = y * W + x;
      R[i] = r;
      T[i] = t;
      F[i] = f;
    };
    // Back row (hazier, taller) then front row (darker, lower) — each a run of buildings.
    for (const pass of [0, 1]) {
      let x = rng.int(0, 6);
      let b = 0;
      while (x < W) {
        const centre = 1 - Math.abs((x - W / 2) / (W / 2));
        const wdt = rng.int(pass ? 14 : 10, pass ? 40 : 30);
        const tallK = Math.pow(centre, 0.8);
        const maxH = (ground - 4) * (pass ? 0.55 : 0.95);
        const hh = Math.round(Math.max(8, maxH * (0.22 + tallK * rng.range(0.35, 0.78))));
        const top = ground - hh;
        const r = pass ? body : body2;
        const setback = !pass && rng.chance(0.5) ? rng.int(3, Math.max(4, wdt >> 2)) : 0;
        const setH = setback ? Math.round(hh * rng.range(0.15, 0.3)) : 0;
        for (let y = top; y < H; y++) {
          const inset = y < top + setH ? setback : 0;
          for (let xx = x + inset; xx < x + wdt - inset && xx < W; xx++) {
            const edgeL = xx === x + inset;
            setT(xx, y, r, y === top || y === top + setH ? 3 : edgeL ? 2.4 : 2);
          }
        }
        // Spires, a needle tower, antennas with beacons, a crane on the tallest.
        const roofX = x + Math.floor(wdt / 2);
        const kind = rng.next();
        if (!pass && hh > maxH * 0.6 && kind < 0.35) {
          for (let s = 0; s < Math.round(hh * 0.35); s++) setT(roofX, top - setH - s, r, 2);
          setT(roofX, top - setH - Math.round(hh * 0.35), red, 5, PWF.GLOW);
        } else if (!pass && kind < 0.45 && b % 5 === 2) {
          // Needle: a pod on a thin shaft.
          const sh = Math.round(hh * 0.5);
          for (let s = 0; s < sh; s++) setT(roofX, top - s, r, 2);
          for (let s = -4; s <= 4; s++) for (let t = 0; t < 3; t++) setT(roofX + s, top - sh + t - 1, r, t === 0 ? 3 : 2);
          for (let s = -3; s <= 3; s += 2) setT(roofX + s, top - sh, warm, 4, PWF.GLOW);
        } else if (!pass && kind < 0.55) {
          // Construction crane: mast + jib + counter-jib.
          const ch = rng.int(14, 22);
          for (let s = 0; s < ch; s++) setT(roofX, top - s, r, 2);
          for (let s = -18; s <= 8; s++) setT(roofX + s, top - ch, r, 2);
          for (let s = 1; s < 8; s++) setT(roofX - 18 + Math.round(s * 0.3), top - ch + s, r, 2);
          setT(roofX, top - ch - 1, red, 5, PWF.GLOW);
        } else if (kind < 0.75) {
          // Water tank / rooftop box.
          for (let s = 0; s < 5; s++) for (let t = 0; t < 4; t++) setT(roofX - 2 + s, top - 4 + t, r, t === 0 ? 3 : 2);
        }
        // Windows: floors of 3 rows; most dark, some lit, some burning (with flames licking out).
        const burning = rng.chance(pass ? 0.18 : 0.35);
        const fireFloor0 = top + setH + rng.int(2, Math.max(3, hh >> 1));
        const fireFloors = rng.int(2, 5) * 3;
        for (let y = top + setH + 3; y < ground - 2; y += 3) {
          const floorLit = hash2(b, y, pass + 3) < 0.22;
          const onFire = burning && y >= fireFloor0 && y < fireFloor0 + fireFloors;
          for (let xx = x + 2 + setback; xx < x + wdt - 2 - setback; xx += 2) {
            if (xx >= W) break;
            if (onFire) {
              setT(xx, y, hash2(xx, y, 5) > 0.5 ? fireHot : fire, 4, PWF.GLOW);
              if (hash2(xx, y, 6) > 0.6) setT(xx, y - 1, fire, 3, PWF.GLOW);
            } else if (floorLit ? hash2(xx, y, 7) < 0.7 : hash2(xx, y, 8) < 0.06) {
              setT(xx, y, hash2(b, 9, 1) < 0.7 ? warm : dim, 3, PWF.GLOW);
            }
          }
        }
        if (burning) {
          // Flames out of the top of the burning floors / roof.
          const fy = Math.min(fireFloor0, ground - 4);
          for (let s = 0; s < Math.round(wdt * 0.8); s++) {
            const xx = x + 1 + Math.round(rng.next() * (wdt - 2));
            const fh = rng.int(2, 7);
            for (let t = 0; t < fh; t++) setT(xx, fy - t, t > fh - 3 ? fire : fireHot, t > fh - 3 ? 3 : 4, PWF.GLOW);
          }
        }
        x += wdt + (rng.chance(0.3) ? rng.int(1, 5) : 0);
        b++;
      }
    }
    // The fire line along the foot: a ragged glowing band, smoke darkening above it, then the fog.
    for (let x = 0; x < W; x++) {
      const fh = 2 + Math.round(hash2(x >> 2, 0, 11) * 4 + hash2(x >> 4, 0, 12) * 4);
      for (let t = 0; t < fh; t++) {
        const y = ground - t;
        if (!R[y * W + x]) continue;
        setT(x, y, t > fh - 2 ? fire : fireHot, t > fh - 2 ? 3 : 4, PWF.GLOW);
      }
      for (let y = ground + 1; y < H; y++) {
        const yb = (y - ground) / Math.max(1, H - ground);
        if (BAYER[(y & 3) * 4 + (x & 3)] < yb * 1.8 + 0.1) setT(x, y, fog, 3);
        else setT(x, y, fire, 2, PWF.GLOW);
      }
    }
  });
}
