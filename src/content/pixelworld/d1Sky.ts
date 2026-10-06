import { PW_BACKDROP_TPD, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';

/**
 * JUNGLE RUN (d1) panorama painters for ART: PIXEL WORLD, painted straight
 * into the canvas arrays (per-row / per-column work hoisted out of the texel
 * loops), the way 16-bit arcade backdrops were painted:
 *  - SKY: hard colour bands climbing from the fog-coloured horizon haze to
 *    the zenith blue — no dither rows: each band edge wanders gently (long
 *    swells), thin stratus streaks drift through the lower bands; cumulus
 *    piled from lobes of varied size (painted far-to-near, so every lower lobe
 *    lays its lit crown over the shaded underside of the one behind it): warm
 *    white crowns toward the sun, cool grey-violet flanks, a flat dark belly,
 *    satellite puffs; low clouds hazed toward the horizon colour;
 *  - RANGE: keyframed ridges crowned with scalloped canopy, each crown lit on
 *    the sun side; slopes covered in overlapping canopy clumps (no single-texel
 *    noise), gullies splitting light and shade, mist pockets in the valleys,
 *    and stepped haze bands at the foot whose edges follow the treetops, down
 *    to the fog colour;
 *  - TREELINE: a continuous far canopy (broadleaf crowns, umbrella trees,
 *    palms) in two haze steps, sitting in the fog band so it is never an
 *    empty white strip;
 *  - ESCARPMENT: a jungle-topped tableland with jointed cliff faces, hanging
 *    vines and waterfall threads (the boss chase looks back at it).
 */

const TW = 2048;
const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** Rows for a band of `deg` degrees (multiple of 16). */
export function d1RowsFor(deg: number): number {
  return Math.max(16, Math.round((deg * PW_BACKDROP_TPD) / 16) * 16);
}

const colOf = (az: number) => Math.round((((az % 360) + 360) % 360) * (TW / 360));

/** sRGB mix of two colours (palette building, never per texel). */
export function mixHex(a: number, b: number, t: number): number {
  const m = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** Signed azimuth difference b − a in degrees (−180…180). */
export const dAz = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

type Rng = { next(): number; range(a: number, b: number): number; int(a: number, b: number): number; chance(p: number): boolean };

// ─── Sky ─────────────────────────────────────────────────────────────────────

export interface D1SkyOpts {
  horizon: number;
  top: number;
  el0: number;
  el1: number;
  sunAz: number;
  clouds: number;
}

/** Band edges (degrees) and how far each band has climbed from the horizon colour to the zenith. */
const SKY_EDGES = [0.9, 2.4, 4.4, 7, 10.5, 15, 21, 28];
const SKY_MIX = [0, 0.13, 0.26, 0.4, 0.53, 0.66, 0.78, 0.89, 1];

/** The day sky band (wrap 2048 × rows). */
export function d1SkyTile(atlas: PwAtlas, o: D1SkyOpts): PwTile {
  const H = d1RowsFor(o.el1 - o.el0);
  return atlas.tile(`d1sky2|${h6(o.horizon)}|${h6(o.top)}|${o.el0}|${o.el1}|${o.sunAz}|${o.clouds}`, TW, H, (c, k) => paintSky(c, k, o, H), { wrap: true });
}

function paintSky(c: PwCanvas, k: PwKit, o: D1SkyOpts, H: number) {
  const rng = k.rng;
  const bands = SKY_MIX.map((m) => k.ramp(mixHex(o.horizon, o.top, m), { light: 0.35, dark: 0.7, sat: 1 }));
  // Each band edge swells up and down along the horizon (long, gentle: haze layers, not terrain).
  const wob = new Float32Array(TW);
  for (let x = 0; x < TW; x++) wob[x] = (smooth(x, 0, TW, 8, 12, 61) - 0.5) * 0.9 + (smooth(x, 0, TW, 8, 40, 62) - 0.5) * 0.45;
  const R = c.ramp;
  const T = c.tone;
  const F = c.flag;
  const elOf = (y: number) => o.el1 - ((y + 0.5) / H) * (o.el1 - o.el0);
  const rowOf = (el: number) => Math.round(((o.el1 - el) / (o.el1 - o.el0)) * H - 0.5);
  let wMax = 0;
  for (let x = 0; x < TW; x++) wMax = Math.max(wMax, Math.abs(wob[x]));
  const bandOf = (e: number) => {
    let b = 0;
    while (b < SKY_EDGES.length && e > SKY_EDGES[b]) b++;
    return b;
  };
  F.fill(0);
  for (let y = 0; y < H; y++) {
    const el = elOf(y);
    const amp = 0.35 + Math.max(0, el) * 0.09;
    const row = y * TW;
    const b0 = bandOf(el - wMax * amp);
    const b1 = bandOf(el + wMax * amp);
    T.fill(3, row, row + TW);
    if (b0 === b1) {
      // No band edge crosses this row: one colour.
      R.fill(bands[b0], row, row + TW);
      continue;
    }
    for (let x = 0; x < TW; x++) {
      const e = el + wob[x] * amp;
      let b = b0;
      while (b < b1 && e > SKY_EDGES[b]) b++;
      R[row + x] = bands[b];
    }
  }
  // Stratus streaks in the lower bands: long thin wisps of a paler band, tapered.
  for (let i = 0; i < 46; i++) {
    const cx = rng.int(0, TW - 1);
    const el = rng.range(1.6, 13);
    const y = rowOf(el);
    let b = 0;
    while (b < SKY_EDGES.length && el > SKY_EDGES[b]) b++;
    const len = rng.int(40, 220);
    const th = rng.chance(0.3) ? 2 : 1;
    const ramp = bands[Math.max(0, b - (rng.chance(0.3) ? 2 : 1))];
    if (b < 1) continue;
    for (let dx = -len; dx <= len; dx++) {
      const f = 1 - Math.abs(dx) / len;
      const t2 = f > 0.6 ? th : f > 0.15 ? 1 : 0;
      for (let j = 0; j < t2; j++) {
        const yy = y + j + Math.round(Math.sin(dx * 0.02 + i) * 1.2);
        if (yy < 0 || yy >= H) continue;
        const ii = yy * TW + ((cx + dx + TW) % TW);
        R[ii] = ramp;
        T[ii] = j === 0 && f > 0.5 ? 3.6 : 3;
      }
    }
  }
  // Cumulus: lit crowns toward the sun.
  const warm = k.ramp(0xf4f0e4, { light: 0.6, dark: 0.55, sat: 0.8 });
  const cool = k.ramp(0xaeb6cc, { light: 0.4, dark: 0.55, sat: 0.95, shift: 1.3 });
  const warmHz = k.ramp(mixHex(0xf4f0e4, o.horizon, 0.45), { light: 0.45, dark: 0.6, sat: 0.8 });
  const coolHz = k.ramp(mixHex(0xaeb6cc, o.horizon, 0.45), { light: 0.4, dark: 0.6, sat: 0.95 });
  const sunCol = colOf(o.sunAz);
  const n = Math.round(19 * o.clouds);
  // Stratified across the horizon (no rows): one cloud per slot, jittered, sizes from a skewed spread.
  for (let i = 0; i < n; i++) {
    const cx = Math.round(((i + rng.range(0.1, 0.9)) / n) * TW);
    const big = rng.next();
    const el = big > 0.75 ? rng.range(2.5, 6) : rng.range(5, 25);
    const base = rowOf(el);
    const sizeK = 0.55 + (el / 25) * 0.6;
    const w = (big > 0.75 ? rng.range(110, 220) : rng.range(36, 150)) * sizeK;
    const h = w * (big > 0.75 ? rng.range(0.42, 0.62) : rng.range(0.26, 0.42));
    const side = (sunCol - cx + TW) % TW > TW / 2 ? -1 : 1;
    const hz = el < 6;
    cumulus(c, rng, cx, base, w, h, side, hz ? warmHz : warm, hz ? coolHz : cool);
    // Satellite puffs drifting off the cloud.
    const sat = rng.int(0, 2);
    for (let s = 0; s < sat; s++) {
      const sx = cx + (rng.chance(0.5) ? -1 : 1) * (w * 0.5 + rng.range(8, 34));
      const sr = rng.range(4, 4 + w * 0.06);
      cumulus(c, rng, Math.round(sx), base - rng.int(0, 4), sr * 3, sr * 1.6, side, hz ? warmHz : warm, hz ? coolHz : cool);
    }
  }
}

/**
 * A cumulus `w` wide, `h` tall standing on row `base`: lobes of varied radius
 * under a domed envelope plus a lumpy crown, painted top lobes first so the
 * lower (nearer) lobes lay their lit tops over the shaded undersides behind.
 */
function cumulus(c: PwCanvas, rng: Rng, cx: number, base: number, w: number, h: number, side: number, warm: number, cool: number) {
  const W = c.w;
  const lobes: [number, number, number][] = [];
  const n = Math.max(3, Math.round(w / 12));
  for (let i = 0; i < n; i++) {
    const t = (i + rng.range(0.15, 0.85)) / n;
    const env = Math.pow(Math.sin(t * Math.PI), 0.75) * h;
    const r = Math.max(2.5, Math.min(w * 0.16, env * rng.range(0.42, 0.7)));
    lobes.push([cx - w / 2 + t * w, base - Math.max(r * rng.range(0.5, 0.85), env - r * 1.1), r]);
    // A crown lobe on top of the taller ones (lumpy tops).
    if (env > h * 0.55 && rng.next() < 0.75) {
      const r2 = r * rng.range(0.45, 0.75);
      lobes.push([cx - w / 2 + t * w + rng.range(-r, r) * 0.6, base - env + r2 * rng.range(0.6, 1.1), r2]);
    }
  }
  lobes.sort((a, b) => a[1] - b[1]);
  const lx = side * 0.62;
  const ly = 0.62;
  const lz = 0.48;
  const bellyY = base - Math.max(1.5, h * 0.12);
  // The cloud's overall form (an ellipsoid) sets the light; each lobe only adds a step at its rim.
  const gcy = base - h * 0.45;
  const gw = w * 0.55;
  for (const [px, py, r] of lobes) {
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(c.h - 1, Math.ceil(Math.min(base, py + r)));
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - py) / r;
      const span = Math.sqrt(Math.max(0, 1 - dy * dy)) * r;
      const xa = Math.ceil(px - span);
      const xb = Math.floor(px + span);
      const gy = (y + 0.5 - gcy) / (h * 0.6);
      for (let x = xa; x <= xb; x++) {
        const nx = (x + 0.5 - px) / r;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - dy * dy));
        const local = nx * lx - dy * ly + nz * lz;
        const gx = (x + 0.5 - cx) / gw;
        const global = gx * side * 0.55 - gy * 0.6;
        const l = global * 0.75 + local * 0.45;
        const i = y * W + (((x % W) + W) % W);
        let ramp = warm;
        let t: number;
        if (y >= base - 1) {
          ramp = cool;
          t = 2.2;
        } else if (y > bellyY) {
          ramp = cool;
          t = l > 0.2 ? 3.4 : 2.8;
        } else if (l > 0.62) t = 5;
        else if (l > 0.3) t = 4;
        else if (l > 0.02) t = 3;
        else {
          ramp = cool;
          t = l > -0.3 ? 4 : 3;
        }
        c.ramp[i] = ramp;
        c.tone[i] = t;
        c.flag[i] = 0;
      }
    }
  }
}

// ─── Ranges ──────────────────────────────────────────────────────────────────

export interface D1RangeOpts {
  /** Canopy colour (already hazed for its distance). */
  hex: number;
  /** The fog colour (the foot fades into it in steps). */
  haze: number;
  el0: number;
  el1: number;
  lightAz: number;
  /** Azimuth of u = 0 (the layer's yaw), for placing keyframes and the light. */
  yaw: number;
  /** Ridge keyframes: [azimuth, height 0…1 of the band]. */
  peaks: [number, number][];
  /** Canopy crown radius on the ridge (texels). */
  crown: number;
  seed: number;
  /** Rows (from the foot) fully hazed (the fog colour). */
  fogRows: number;
}

/** A jungle range (wrap 2048 × rows, cut out above the canopy). */
export function d1RangeTile(atlas: PwAtlas, o: D1RangeOpts): PwTile {
  const H = d1RowsFor(o.el1 - o.el0);
  const pk = o.peaks.map((p) => p.join(':')).join(',');
  return atlas.tile(`d1range2|${h6(o.hex)}|${h6(o.haze)}|${o.el0}|${o.el1}|${o.lightAz}|${o.yaw}|${pk}|${o.crown}|${o.seed}|${o.fogRows}`, TW, H, (c, k) => paintRange(c, k, o, H), { wrap: true });
}

/** Height profile (0…1) through keyframes, cosine-eased, wrapping round the horizon. */
function keyframed(x: number, yaw: number, ks: [number, number][]): number {
  const az = (((yaw + (x / TW) * 360) % 360) + 360) % 360;
  for (let i = 0; i < ks.length; i++) {
    const [a0, h0] = ks[i];
    const [a1r, h1] = ks[(i + 1) % ks.length];
    const a1 = i + 1 < ks.length ? a1r : a1r + 360;
    const aa = az < a0 ? az + 360 : az;
    if (aa >= a0 && aa <= a1) {
      const t = (aa - a0) / Math.max(1e-6, a1 - a0);
      return h0 + (h1 - h0) * (0.5 - 0.5 * Math.cos(t * Math.PI));
    }
  }
  return ks[0][1];
}

function paintRange(c: PwCanvas, k: PwKit, o: D1RangeOpts, H: number) {
  const rng = k.rng;
  const seed = o.seed;
  const ks = o.peaks.map(([a, h]) => [((a % 360) + 360) % 360, h] as [number, number]).sort((p, q) => p[0] - q[0]);
  // Haze levels: the canopy, two steps toward the fog, the fog itself.
  const lv = [0, 0.32, 0.62, 1].map((m) => k.ramp(mixHex(o.hex, o.haze, m), { light: 0.42, dark: 0.55, sat: 1 }));
  const mist = k.ramp(mixHex(o.haze, 0xffffff, 0.12), { light: 0.35, sat: 0.9 });
  // Ridge (texel row of the bare ridge per column).
  const ridge = new Float32Array(TW);
  for (let x = 0; x < TW; x++) {
    const h = keyframed(x, o.yaw, ks) + (smooth(x, 0, TW, 8, 14, 31 + seed) - 0.5) * 0.22 + (smooth(x, 0, TW, 8, 56, 33 + seed) - 0.5) * 0.08;
    ridge[x] = H - 1 - Math.max(0.04, Math.min(0.97, h)) * (H - 4);
  }
  const light = colOf(o.lightAz - o.yaw);
  const towardOf = (x: number) => ((light - x + TW) % TW < TW / 2 ? 1 : -1);
  // Per column: the slope's facing (lit where it climbs toward the sun) — smoothed over ±6.
  const litCol = new Int8Array(TW);
  for (let x = 0; x < TW; x++) litCol[x] = (ridge[(x + 6) % TW] - ridge[(x - 6 + TW) % TW]) * towardOf(x) < -0.6 ? 1 : 0;
  // Gullies: down from each saddle (a local low of the ridge), wandering, widening.
  const gully = new Int8Array(TW * H);
  let last = -99;
  for (let g0 = 0; g0 < TW; g0 += 4) {
    const a = ridge[(g0 - 24 + TW) % TW];
    const b = ridge[g0];
    const d = ridge[(g0 + 24) % TW];
    if (!(b > a + 1.5 && b > d + 1.5) || g0 - last < 40) continue;
    last = g0;
    let x = g0;
    for (let y = Math.round(ridge[g0]) + 2; y < H; y++) {
      const wd = 1 + Math.floor((y - ridge[g0]) * 0.18);
      for (let dx = -wd; dx <= wd; dx++) gully[y * TW + ((Math.round(x) + dx + TW) % TW)] = dx < 0 ? -1 : 1;
      x += (hash2(g0, y, 9 + seed) - 0.5) * 1.2;
    }
  }
  // Foot haze: the band edge follows a row of treetops (half-disc bumps) — level per texel.
  const scal = new Float32Array(TW);
  for (let x = 0, cx = 0, r = 4; x < TW; x++) {
    if (x >= cx) {
      r = 2.5 + hash2(x, 3, 40 + seed) * 4;
      cx = x + Math.round(r * 2);
    }
    const u = (x - (cx - r)) / r;
    scal[x] = Math.sqrt(Math.max(0, 1 - u * u)) * 3;
  }
  const fogTop = H - o.fogRows;
  const lvAt = (x: number, y: number) => {
    const d = y + scal[x];
    return d > fogTop + 3 ? 3 : d > fogTop - 3 ? 2 : d > fogTop - 10 ? 1 : 0;
  };
  // Haze level per texel (255 = not painted): everywhere (the ridge crowns), and below the ridge only (the slope canopy).
  const lvlAll = new Uint8Array(TW * H);
  const lvlBody = new Uint8Array(TW * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < TW; x++) {
      const l = lvAt(x, y);
      lvlAll[y * TW + x] = l;
      lvlBody[y * TW + x] = y < ridge[x] + 0.5 ? 255 : l;
    }
  }
  const R = c.ramp;
  const T = c.tone;
  const F = c.flag;
  // Body: slopes in two tones by facing; gullies split light and shade.
  for (let x = 0; x < TW; x++) {
    const top = Math.max(0, Math.ceil(ridge[x]));
    const tw = towardOf(x);
    for (let y = top; y < H; y++) {
      const i = y * TW + x;
      const g = gully[i];
      let t = litCol[x] ? 3 : 2;
      if (g) t = g === tw ? 3.4 : 1.6;
      const l = lvlAll[i];
      R[i] = lv[l];
      T[i] = 3 + (t - 3) * (1 - l * 0.3);
      F[i] = 0;
    }
  }
  // Canopy over the slopes: crowns in staggered rows (fish scales), painted top row first so each
  // row's lit caps overlap the shaded skirts of the row above — reads as forest, not speckle.
  const cr = o.crown;
  const rowStep = Math.max(2, Math.round(cr * 1.35));
  for (let ry = 0, rowN = 0; ry < H + cr; ry += rowStep, rowN++) {
    const off = rowN & 1 ? cr : 0;
    for (let x0 = off; x0 < TW + off; ) {
      const r = cr * (0.7 + hash2(x0, rowN, 60 + seed) * 0.5);
      const x = x0 % TW;
      const y = ry + (hash2(x0, rowN, 61 + seed) - 0.5) * cr * 0.8;
      if (y > ridge[x] + r * 0.7 && y < fogTop + 4) crown(c, x, y, r, towardOf(x), lvlBody, lv, litCol[x] ? 0.15 : -0.45, true);
      x0 += Math.max(2, Math.round(r * (1.5 + hash2(x0, rowN, 62 + seed) * 0.6)));
    }
  }
  // Mist pockets in the valleys (where the ridge dips): banks of low lobes, lit on top, ragged below.
  for (let n = 0; n < 6; n++) {
    let x = rng.int(0, TW - 1);
    for (let s = 0; s < 40; s++) {
      const nx = (x + 3) % TW;
      if (ridge[nx] > ridge[x]) x = nx;
    }
    const y0 = Math.min(fogTop - 3, ridge[x] + rng.range(5, 11));
    const L = rng.int(20, 70);
    for (let dx = -L; dx <= L; ) {
      const env = Math.sqrt(Math.max(0, 1 - (dx / L) ** 2));
      const r = 2 + env * rng.range(2, 4.5);
      for (let ddy = -Math.ceil(r); ddy <= Math.ceil(r * 0.7); ddy++) {
        const span = ddy < 0 ? Math.sqrt(Math.max(0, r * r - ddy * ddy)) * 1.8 : r * 1.8 - ddy * 0.6;
        for (let ddx = -Math.floor(span); ddx <= Math.floor(span); ddx++) {
          const xx = (x + dx + ddx + TW) % TW;
          const yy = Math.round(y0 + ddy);
          if (yy <= ridge[xx] + 1 || yy >= H) continue;
          // The underside frays into the trees.
          if (ddy > 0 && hash2(xx, yy, 77) < ddy / (r * 0.8)) continue;
          const i = yy * TW + xx;
          R[i] = mist;
          T[i] = ddy < -r * 0.5 ? 3.6 : 3;
          F[i] = 0;
        }
      }
      dx += Math.max(3, Math.round(r * 1.6));
    }
  }
  // Ridge crowns: the canopy silhouette, crown by crown.
  for (let x = 0; x < TW; ) {
    const r = cr * (0.75 + hash2(x, 1, 50 + seed) * 0.6);
    crown(c, x, ridge[x] + r * 0.35, r, towardOf(x), lvlAll, lv, litCol[x] ? 0.3 : -0.2, true);
    x += Math.max(2, Math.round(r * (1 + hash2(x, 2, 51 + seed) * 0.8)));
  }
}

/**
 * A canopy crown (half-dome on a skirt) at (cx, cy) radius r: lit toward the
 * sun (`tw` = ±1) and up, a shadow crescent on the far lower side. `lvl` =
 * haze level per texel of the canvas (255 = do not paint); `wrapX` wraps
 * columns round a band (else columns outside the canvas are skipped).
 */
function crown(c: PwCanvas, cx: number, cy: number, r: number, tw: number, lvl: Uint8Array, lv: number[], bias: number, wrapX: boolean) {
  const W = c.w;
  const ri = Math.ceil(r);
  const x0 = Math.round(cx);
  const R = c.ramp;
  const T = c.tone;
  const sx = (tw * 0.5) / r;
  const sy = 0.8 / r;
  const b = bias * 0.5;
  for (let dy = -ri; dy <= Math.ceil(r * 0.6); dy++) {
    const y = Math.round(cy + dy);
    if (y < 0 || y >= c.h) continue;
    const span = Math.floor(dy < 0 ? Math.sqrt(Math.max(0, r * r - dy * dy)) : r);
    const row = y * W;
    const sdy = -dy * sy + b;
    for (let dx = -span; dx <= span; dx++) {
      let x = x0 + dx;
      if (wrapX) x = x < 0 ? x + W : x >= W ? x - W : x;
      else if (x < 0 || x >= W) continue;
      const i = row + x;
      const l = lvl[i];
      if (l === 255) continue;
      const s2 = dx * sx + sdy;
      const t = s2 > 0.6 ? 4 : s2 > -0.1 ? 3 : s2 > -0.6 ? 2 : 1.4;
      R[i] = lv[l];
      T[i] = 3 + (t - 3) * (1 - l * 0.3);
    }
  }
}

// ─── Treeline ────────────────────────────────────────────────────────────────

export interface D1TreelineOpts {
  hex: number;
  haze: number;
  el0: number;
  el1: number;
  lightAz: number;
  seed: number;
}

/**
 * The far treeline in the fog band (wrap 2048 × rows, cut out above): a
 * continuous canopy of broadleaf crowns with umbrella trees and palms rising
 * out of it, two haze steps (crowns, then the misty understorey), the lowest
 * rows the fog colour.
 */
export function d1TreelineTile(atlas: PwAtlas, o: D1TreelineOpts): PwTile {
  const H = d1RowsFor(o.el1 - o.el0);
  return atlas.tile(`d1treeline|${h6(o.hex)}|${h6(o.haze)}|${o.el0}|${o.el1}|${o.lightAz}|${o.seed}`, TW, H, (c, k) => {
    const rng = k.rng;
    const lv = [0.5, 0.68, 0.84, 1].map((m) => k.ramp(mixHex(o.hex, o.haze, m), { light: 0.35, dark: 0.6, sat: 1 }));
    const light = colOf(o.lightAz);
    const towardOf = (x: number) => ((light - x + TW) % TW < TW / 2 ? 1 : -1);
    // The canopy line (row per column); the fog colour below `fogRow`.
    const base = new Float32Array(TW);
    for (let x = 0; x < TW; x++) base[x] = H * 0.5 + (smooth(x, 0, TW, 8, 20, 70 + o.seed) - 0.5) * H * 0.3;
    const fogRow = H - Math.round(H * 0.22);
    const lvAt = (x: number, y: number) => (y >= fogRow ? 3 : y >= fogRow - 3 ? 2 : y >= base[x] + 4 ? 1 : 0);
    const lvl = new Uint8Array(TW * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < TW; x++) lvl[y * TW + x] = lvAt(x, y);
    for (let x = 0; x < TW; x++) {
      for (let y = Math.ceil(base[x]); y < H; y++) {
        const i = y * TW + x;
        c.ramp[i] = lv[lvAt(x, y)];
        c.tone[i] = y < fogRow ? 2.6 : 3;
      }
    }
    // Emergent trees first (the canopy crowns overlap their feet): umbrellas on thin trunks, palms.
    for (let n = 0; n < 170; n++) {
      const x = rng.int(0, TW - 1);
      const tall = rng.range(3, H * 0.4);
      const ty = Math.round(base[x] - tall);
      const tw = towardOf(x);
      for (let y = Math.max(0, ty); y < base[x] + 2; y++) {
        c.ramp[y * TW + x] = lv[0];
        c.tone[y * TW + x] = 2;
      }
      if (rng.chance(0.3)) {
        for (const d of [-1, 1]) {
          for (let j = 0; j < 5; j++) {
            const xx = (x + d * j + TW) % TW;
            const yy = ty + Math.floor((j * j) / 6);
            if (yy < 0) continue;
            c.ramp[yy * TW + xx] = lv[0];
            c.tone[yy * TW + xx] = d === tw ? 3.6 : 2.4;
          }
        }
      } else {
        const rx = rng.range(4, 8);
        for (let dy = -2; dy <= 1; dy++) {
          const span = dy === -2 ? rx * 0.6 : dy === 1 ? rx * 0.8 : rx;
          const yy = ty + dy;
          if (yy < 0) continue;
          for (let dx = -Math.floor(span); dx <= Math.floor(span); dx++) {
            const xx = (x + dx + TW) % TW;
            c.ramp[yy * TW + xx] = lv[0];
            c.tone[yy * TW + xx] = dy <= -1 ? (dx * tw > 0 ? 4 : 3) : dy === 1 ? 2 : dx * tw > rx * 0.3 ? 3.4 : 2.6;
          }
        }
      }
    }
    // Canopy crowns along the line.
    for (let x = 0; x < TW; ) {
      const r = rng.range(2.2, 4.5);
      crown(c, x, base[x] + rng.range(-1, 1.5), r, towardOf(x), lvl, lv, 0, true);
      x += Math.max(2, Math.round(r * rng.range(1, 1.7)));
    }
  }, { wrap: true });
}

// ─── Escarpment (the boss chase's horizon) ─────────────────────────────────────

export interface D1EscarpOpts {
  rock: number;
  canopy: number;
  water: number;
  haze: number;
  el0: number;
  el1: number;
  /** Azimuth span of the panel (deg) and its centre (for the light). */
  span: number;
  az: number;
  lightAz: number;
}

/** Panel width (texels) of an escarpment spanning `span` degrees. */
export function d1EscarpWidth(span: number): number {
  return Math.round((span * TW) / 360 / 16) * 16;
}

/**
 * A jungle tableland (panel, cut out above): flat-topped mesas with notched
 * rims and buttresses whose jointed faces are lit on the sun side, canopy
 * spilling over the rims, vine curtains, three waterfall threads with spray at
 * their feet, the slopes below lost in forest and then the fog. Its ends sink
 * into low hills so the panel never shows an edge.
 */
export function d1EscarpTile(atlas: PwAtlas, o: D1EscarpOpts): PwTile {
  const H = d1RowsFor(o.el1 - o.el0);
  const W = d1EscarpWidth(o.span);
  return atlas.tile(`d1escarp|${h6(o.rock)}|${h6(o.canopy)}|${h6(o.haze)}|${o.el0}|${o.el1}|${o.span}|${o.az}|${o.lightAz}`, W, H, (c, k) => {
    const rng = k.rng;
    const rk = [0.16, 0.34].map((m) => k.ramp(mixHex(o.rock, o.haze, m), { light: 0.4, dark: 0.55, sat: 1 }));
    const cv = [0.3, 0.5, 0.74, 1].map((m) => k.ramp(mixHex(o.canopy, o.haze, m), { light: 0.4, dark: 0.55, sat: 1 }));
    const wt = k.ramp(mixHex(o.water, 0xffffff, 0.2), { light: 0.4, sat: 0.8 });
    const tw = dAz(o.az, o.lightAz) > 0 ? 1 : -1;
    // Rim height per column (0…1 of the band): mesas, a gap, a lower shelf, ends sinking away.
    const rim = new Float32Array(W);
    const keys: [number, number][] = [[0, 0.04], [0.07, 0.16], [0.15, 0.6], [0.32, 0.64], [0.37, 0.48], [0.44, 0.5], [0.49, 0.78], [0.66, 0.74], [0.71, 0.55], [0.8, 0.6], [0.86, 0.32], [0.93, 0.14], [1, 0.04]];
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      let h = 0;
      for (let i = 1; i < keys.length; i++) {
        if (u > keys[i][0]) continue;
        const [u0, h0] = keys[i - 1];
        const [u1, h1] = keys[i];
        const t = (u - u0) / (u1 - u0);
        // Steep steps between levels (cliff ends), gently sloping tops.
        const s = Math.abs(h1 - h0) > 0.12 ? Math.min(1, Math.max(0, (t - 0.35) / 0.3)) : t;
        h = h0 + (h1 - h0) * s * s * (3 - 2 * s);
        break;
      }
      if (hash2(x >> 2, 1, 7) > 0.9) h -= 0.025;
      rim[x] = H - 1 - h * (H - 6) + (smooth(x, 0, W, 8, 30, 3) - 0.5) * 3;
    }
    // The forest line at the cliffs' foot wanders; the fog line below it.
    const forest = new Float32Array(W);
    for (let x = 0; x < W; x++) forest[x] = Math.max(rim[x] + 6, H * 0.6 + (smooth(x, 0, W, 8, 16, 4) - 0.5) * H * 0.16);
    const fogRow = H - Math.round(H * 0.16);
    // Buttresses: joints every 4–19 texels; each face lit on the sun side, some set back (darker),
    // ledges with a tuft of green on them, a slanted fracture now and then.
    const faceU = new Float32Array(W);
    const joint = new Uint8Array(W);
    const back = new Float32Array(W);
    const ledge = new Int16Array(W).fill(-1);
    for (let x0 = 0; x0 < W; ) {
      const x1 = Math.min(W, x0 + 4 + Math.floor(hash2(x0, 5, 9) * 16));
      joint[x0] = 1;
      const set = hash2(x0, 6, 9) > 0.6 ? -0.7 : 0;
      const ly = hash2(x0, 7, 9) > 0.45 ? Math.floor(hash2(x0, 8, 9) * 20) + 4 : -1;
      for (let x = x0; x < x1; x++) {
        faceU[x] = (x - x0) / Math.max(1, x1 - x0);
        back[x] = set;
        ledge[x] = ly;
      }
      x0 = x1;
    }
    for (let x = 0; x < W; x++) {
      const top = Math.max(0, Math.ceil(rim[x]));
      const u = tw > 0 ? 1 - faceU[x] : faceU[x];
      for (let y = top; y < H; y++) {
        const i = y * W + x;
        if (y >= fogRow) {
          c.ramp[i] = cv[3];
          c.tone[i] = 3;
        } else if (y >= forest[x]) {
          c.ramp[i] = cv[y > fogRow - 6 ? 2 : 1];
          c.tone[i] = 2.6;
        } else {
          // Cliff face: strata (wavy rows), joints, lit / shaded faces of each buttress.
          const jn = joint[x] && hash2(x, y >> 2, 13) > 0.25;
          let t = jn ? 1.4 : u < 0.3 ? 3.8 : u < 0.75 ? 3 : 2.3;
          t += back[x];
          const strat = (y + Math.round(Math.sin(x * 0.05) * 2) + 90) % 11;
          if (strat === 0) t -= 0.8;
          else if (strat === 1) t += 0.4;
          // A slanted fracture across the face.
          if (((x * 2 + y * 3) % 47 === 0) && hash2(x >> 3, y >> 3, 12) > 0.6) t = 1;
          const dl = y - top - ledge[x];
          if (ledge[x] >= 0 && dl === 0) t = 4.4;
          const deep = (y - rim[x]) / Math.max(1, forest[x] - rim[x]);
          c.ramp[i] = rk[deep > 0.7 ? 1 : 0];
          c.tone[i] = Math.max(0.6, Math.min(4.6, t));
          // Green on the ledge.
          if (ledge[x] >= 0 && (dl === -1 || dl === -2) && hash2(x, y, 14) > 0.35) {
            c.ramp[i] = cv[0];
            c.tone[i] = dl === -2 ? 3.6 : 2.6;
          }
        }
      }
    }
    // Waterfall threads: pale lines from the rim down to the forest, spray at the foot.
    for (const u of [0.24, 0.56, 0.76]) {
      let x = Math.round(u * W);
      for (let s = 0; s < 6; s++) if (rim[x + 1] > rim[x]) x++;
      const y0 = Math.ceil(rim[x]) + 1;
      const y1 = Math.floor(forest[x]);
      for (let y = y0; y < y1; y++) {
        const xx = x + Math.round(Math.sin(y * 0.4) * 0.5);
        c.ramp[y * W + xx] = wt;
        c.tone[y * W + xx] = (y + x) % 5 === 0 ? 2.6 : 3.6;
        if (y > y0 + 3 && (y & 3) !== 0) {
          c.ramp[y * W + xx + 1] = wt;
          c.tone[y * W + xx + 1] = 2.8;
        }
      }
      for (let dy = -3; dy <= 0; dy++) {
        for (let dx = -4 + Math.abs(dy); dx <= 4 - Math.abs(dy); dx++) {
          const yy = y1 + dy;
          c.ramp[yy * W + x + dx] = wt;
          c.tone[yy * W + x + dx] = dy === -3 ? 3.6 : 3;
        }
      }
    }
    // Vine curtains hanging from the rim.
    for (let n = 0; n < 160; n++) {
      const x = rng.int(2, W - 3);
      const len = rng.int(3, 18);
      const y0 = Math.ceil(rim[x]) + 2;
      for (let j = 0; j < len && y0 + j < forest[x]; j++) {
        const i = (y0 + j) * W + x;
        c.ramp[i] = cv[0];
        c.tone[i] = j === len - 1 ? 1.6 : 2.4;
      }
    }
    // Canopy spilling over the rim and the forest crowns along the cliffs' foot.
    const lvTop = new Uint8Array(W * H);
    const lvFoot = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        lvTop[y * W + x] = y < rim[x] - 9 ? 255 : 0;
        lvFoot[y * W + x] = y >= fogRow ? 3 : y > fogRow - 6 ? 2 : 1;
      }
    }
    for (let x = 0; x < W; ) {
      const r = rng.range(2.4, 4.6);
      crown(c, x, rim[Math.min(W - 1, x)] + r * 0.4, r, tw, lvTop, cv, 0, false);
      x += Math.max(2, Math.round(r * rng.range(0.9, 1.5)));
    }
    for (let row = 0; row < 4; row++) {
      for (let x = row & 1 ? 3 : 0; x < W; ) {
        const r = rng.range(2.6, 4.8);
        crown(c, x, forest[Math.min(W - 1, x)] + row * 4 + rng.range(0, 2), r, tw, lvFoot, cv, row === 0 ? 0.1 : -0.3, false);
        x += Math.max(2, Math.round(r * rng.range(1.2, 1.7)));
      }
    }
  });
}
