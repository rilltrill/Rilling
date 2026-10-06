import { PWF, PW_BACKDROP_TPD, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';

/**
 * PixelWorld backdrop painters (sky band, skylines, mountains, volcano, storm,
 * dusk horizon) for `PwBackdrop`. Tiles span 360° of azimuth (2048 texels =
 * PW_BACKDROP_TPD 5.7 texels a degree ≈ one per retro pixel) and an elevation
 * band `el0`…`el1` (row 0 = el1 at the top). Painted like SNES / arcade
 * backdrops: banded gradients with dithered seams, hand-placed clusters, lit
 * rims on the side facing the moon / sun, haze toward the horizon — and the
 * bottom rows fade into the stage's fog colour, where the fogged street meets
 * them.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const TW = 2048;

/** Rows a band of `deg` degrees takes (multiple of 16). */
export function rowsFor(deg: number): number {
  return Math.max(16, Math.round((deg * PW_BACKDROP_TPD) / 16) * 16);
}

/** Elevation (deg) of a row's centre. */
const elOf = (y: number, h: number, el0: number, el1: number) => el1 - ((y + 0.5) / h) * (el1 - el0);
/** Column of an azimuth (deg). */
const colOf = (az: number) => Math.round((((az % 360) + 360) % 360) * (TW / 360));
/** Shortest wrapped column distance. */
const dcol = (a: number, b: number) => {
  const d = Math.abs(a - b) % TW;
  return Math.min(d, TW - d);
};

export interface NightSkyOpts {
  /** Colour at the horizon (≈ the stage fog) and at the top. */
  horizon: number;
  top: number;
  /** Moon azimuth / elevation (deg; azimuth from −Z toward +X). */
  moonAz: number;
  moonEl: number;
  el0: number;
  el1: number;
  /** Cloud cover 0…1. */
  clouds?: number;
}

/** Night sky: banded dark gradient (dithered seams), stars, the moon with maria and a halo, moonlit clouds. */
export function nightSkyTile(atlas: PwAtlas, o: NightSkyOpts): PwTile {
  const H = rowsFor(o.el1 - o.el0);
  return atlas.tile(`nightsky|${h6(o.horizon)}|${h6(o.top)}|${o.moonAz}|${o.moonEl}|${o.el0}|${o.el1}|${o.clouds ?? 0.5}`, TW, H, (c, k) => paintNightSky(c, k, o), { wrap: true });
}

export function paintNightSky(c: PwCanvas, k: PwKit, o: NightSkyOpts) {
  const rng = k.rng;
  const H = c.h;
  const sky = k.ramp(o.horizon, { light: 0.35, dark: 0.18, shift: 1.2 });
  const moonR = k.ramp(0xdfe6ff, { light: 0.5, sat: 0.6 });
  const star = k.ramp(0xc8d4ff, { light: 0.7 });
  const cloud = k.ramp(0x3a4260, { light: 0.4, sat: 0.9 });
  const mx = colOf(o.moonAz);
  const my = Math.round(((o.el1 - o.moonEl) / (o.el1 - o.el0)) * H);
  // Gradient: horizon = step 3 (the fog colour), climbing to step 0 overhead; dithered seams between bands.
  for (let y = 0; y < H; y++) {
    const el = elOf(y, H, o.el0, o.el1);
    const t = 3 - Math.min(3, Math.max(0, (el - 1) / 9) ** 0.8 * 1.15);
    c.rect(0, y, TW, 1, sky, t, PWF.DITHER);
  }
  // Moon glow: a step up in a wide soft disc round the moon (its box only).
  const GR = Math.ceil(14 * PW_BACKDROP_TPD);
  for (let y = Math.max(0, my - GR); y < Math.min(H, my + GR); y++) {
    for (let dxp = -GR; dxp <= GR; dxp++) {
      const dm = Math.hypot(dxp, y - my) / PW_BACKDROP_TPD;
      if (dm >= 14) continue;
      const x = (mx + dxp + TW) % TW;
      c.set(x, y, sky, Math.min(4, c.toneAt(x, y) + ((14 - dm) / 14) * 1.4), PWF.DITHER);
    }
  }
  // Stars: sparse, brighter higher up; a few twinkle crosses.
  for (let i = 0; i < 900; i++) {
    const x = rng.int(0, TW - 1);
    const y = rng.int(0, H - 1);
    const el = elOf(y, H, o.el0, o.el1);
    if (el < 7 + rng.next() * 6) continue;
    if (dcol(x, mx) < 90 && Math.abs(y - my) < 90) continue;
    const big = rng.chance(0.05);
    c.set(x, y, star, big ? 5 : rng.chance(0.4) ? 4 : 3, PWF.GLOW);
    if (big) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) c.set(x + dx, y + dy, star, 2, PWF.GLOW);
    }
  }
  // Clouds: flat-bottomed banks, lit on the moon side, dark undersides breaking into dither.
  const nc = Math.round(14 * (o.clouds ?? 0.5));
  for (let i = 0; i < nc; i++) {
    const cx = rng.int(0, TW - 1);
    const el = rng.range(3, 15);
    const cy = Math.round(((o.el1 - el) / (o.el1 - o.el0)) * H);
    const w = rng.int(140, 340);
    const hgt = rng.int(5, 11);
    cloudBank(c, cloud, cx, cy, w, hgt, mx < cx ? -1 : 1, rng.next() * 1000);
  }
  // The moon: disc with maria, lit limb, a halo ring of glow pixels.
  const R = 14;
  for (let y = -R - 2; y <= R + 2; y++) {
    for (let x = -R - 2; x <= R + 2; x++) {
      const d = Math.hypot(x, y);
      const px = (mx + x + TW) % TW;
      const py = my + y;
      if (d <= R) {
        const maria = smooth(x + 40, y + 40, 80, 80, 5, 3) > 0.62;
        const limb = d > R - 1.5 && x + y < 0;
        c.set(px, py, moonR, limb ? 5 : maria ? 3 : x + y > R * 0.7 ? 3 : 4, PWF.GLOW);
      } else if (d <= R + 1.6) c.set(px, py, sky, 4.5, PWF.GLOW | PWF.DITHER);
    }
  }
  // Craters (a dark dot with a lit lower-right rim).
  for (const [x, y] of [
    [-5, 3],
    [4, -4],
    [6, 5],
    [-2, -7],
  ]) {
    c.set((mx + x + TW) % TW, my + y, moonR, 2, PWF.GLOW);
    c.set((mx + x + 1 + TW) % TW, my + y + 1, moonR, 5, PWF.GLOW);
  }
}

/** A cloud bank: puffs along a flat base, lit rim toward the light (`side` −1 = light from the left). */
function cloudBank(c: PwCanvas, ramp: number, cx: number, base: number, w: number, h: number, side: number, seed: number) {
  const n = Math.max(3, Math.round(w / 28));
  // Each puff marks its own box in a scratch (coverage + the best light), then the bank is painted once.
  const x0 = Math.floor(cx - w / 2 - h * 2);
  const BW = Math.ceil(w + h * 4) + 2;
  const y0 = Math.floor(base - h * 2.4);
  const BH = base - y0 + 1;
  const lit = new Float32Array(BW * BH).fill(-9);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = h * (0.55 + 0.6 * Math.sin(t * Math.PI)) * (0.8 + hash2(i, 1, seed) * 0.4);
    const px = cx - w / 2 + t * w;
    const py = base - r * 0.55;
    for (let y = Math.max(y0, Math.floor(py - r)); y <= Math.min(base, Math.ceil(py + r)); y++) {
      const dy = y - py;
      for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
        const dx = x - px;
        if (dx * dx + dy * dy * 1.69 > r * r) continue;
        const l = (-dy / r) * 0.7 + (dx / r) * -side * 0.5;
        const j = (y - y0) * BW + (x - x0);
        if (l > lit[j]) lit[j] = l;
      }
    }
  }
  for (let y = y0; y <= base; y++) {
    if (y < 0 || y >= c.h) continue;
    for (let x = x0; x < x0 + BW; x++) {
      const l = lit[(y - y0) * BW + (x - x0)];
      if (l < -8) continue;
      const px = ((x % TW) + TW) % TW;
      const t = y > base - 2 ? 1.5 : l > 0.55 ? 3 : l > 0.15 ? 2 : 1;
      c.set(px, y, ramp, t, t === 1.5 ? PWF.GLOW | PWF.DITHER : PWF.GLOW);
    }
  }
}

export interface SkylineOpts {
  /** Building silhouette colour (hazed toward the fog for far layers). */
  hex: number;
  /** Fog colour the bottom rows fade into. */
  fog: number;
  el0: number;
  el1: number;
  /** Lit-window density 0…1. */
  lights?: number;
  /** Tallest buildings (fraction of the band). */
  tall?: number;
  /** Moon azimuth (deg): rooftops get a lit rim on that side. */
  moonAz?: number;
  seed?: number;
}

/**
 * Night city skyline (cut out above the roofs): blocks and towers with setbacks,
 * parapets, water tanks on legs, antennas with red beacons, a lit sign or two,
 * window grids (floors lit / dark, warm / cool), rims toward the moon, fading
 * into the fog at the foot.
 */
export function skylineTile(atlas: PwAtlas, o: SkylineOpts): PwTile {
  const H = rowsFor(o.el1 - o.el0);
  return atlas.tile(`skyline|${h6(o.hex)}|${h6(o.fog)}|${o.el0}|${o.el1}|${o.lights ?? 0.5}|${o.tall ?? 0.8}|${o.moonAz ?? 0}|${o.seed ?? 0}`, TW, H, (c, k) => paintSkyline(c, k, o), { wrap: true });
}

export function paintSkyline(c: PwCanvas, k: PwKit, o: SkylineOpts) {
  const rng = k.rng;
  const H = c.h;
  const body = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
  const fog = k.ramp(o.fog, { light: 0.3 });
  const warm = k.ramp(0xffc477, { light: 0.4 });
  const cool = k.ramp(0xa8c4ff, { light: 0.4 });
  const red = k.ramp(0xff3020, { light: 0.4 });
  const moonCol = colOf(o.moonAz ?? 0);
  const ground = H - 1;
  let x = 0;
  let b = 0;
  while (x < TW) {
    const wdt = rng.int(18, 70);
    const tall = rng.chance(0.18);
    const hh = Math.round(H * (tall ? rng.range(0.55, o.tall ?? 0.8) : rng.range(0.18, 0.45)));
    const top = ground - hh;
    const litLeft = ((moonCol - x + TW) % TW) > TW / 2;
    // Body (with a setback on tall ones).
    const setback = tall && rng.chance(0.6) ? rng.int(4, Math.max(5, wdt >> 2)) : 0;
    const setH = setback ? Math.round(hh * rng.range(0.15, 0.3)) : 0;
    for (let yy = top; yy <= ground; yy++) {
      const inset = yy < top + setH ? setback : 0;
      for (let xx = x + inset; xx < x + wdt - inset; xx++) {
        const px = xx % TW;
        const edge = litLeft ? xx === x + inset : xx === x + wdt - inset - 1;
        c.set(px, yy, body, yy === top || yy === top + setH ? 3 : edge ? 3 : 2);
      }
    }
    // Roof furniture.
    const roofX = x + setback + rng.int(2, Math.max(3, wdt - setback * 2 - 10));
    const rt = rng.next();
    if (rt < 0.3) {
      // Water tank on legs.
      const tx = roofX;
      const ty = top - 9;
      c.rect(tx % TW, ty, 7, 6, body, 2);
      c.hline(tx % TW, ty, 7, body, 3);
      c.rect((tx + 1) % TW, ty - 2, 5, 2, body, 2);
      c.vline((tx + 1) % TW, ty + 6, 3, body, 2);
      c.vline((tx + 5) % TW, ty + 6, 3, body, 2);
    } else if (rt < 0.55 || tall) {
      // Antenna with a red beacon.
      const ax = roofX + 3;
      const ah = rng.int(6, tall ? 26 : 12);
      c.vline(ax % TW, top - ah, ah, body, 2);
      c.set(ax % TW, top - ah - 1, red, 5, PWF.GLOW);
      c.set(ax % TW, top - ah, red, 3, PWF.GLOW);
    } else if (rt < 0.7) {
      // Parapet + a rooftop sign frame.
      c.hline(x % TW, top - 1, wdt, body, 3);
      for (let i = x; i < x + wdt; i += 3) c.set(i % TW, top - 2, body, 2);
    }
    // Windows: a grid per floor (3 rows / floor), floors lit or dark, warm or cool.
    const lights = o.lights ?? 0.5;
    for (let yy = top + 3; yy < ground - 4; yy += 3) {
      const floorLit = hash2(b, yy, 3) < lights * 0.55;
      for (let xx = x + 2 + (setback && yy < top + setH ? setback : 0); xx < x + wdt - 2 - (setback && yy < top + setH ? setback : 0); xx += 2) {
        const on = floorLit ? hash2(xx, yy, 5) < 0.75 : hash2(xx, yy, 6) < lights * 0.12;
        if (!on) continue;
        const r = hash2(b, 7, 9) < 0.7 ? warm : cool;
        c.set(xx % TW, yy, r, hash2(xx, yy, 8) < 0.25 ? 4 : 3, PWF.GLOW);
      }
    }
    x += wdt + (rng.chance(0.25) ? rng.int(1, 6) : 0);
    b++;
  }
  // Foot: fade into the fog colour (dithered).
  for (let y = H - 14; y < H; y++) {
    const t = (y - (H - 14)) / 14;
    for (let xx = 0; xx < TW; xx++) {
      if (!c.at(xx, y)) continue;
      if (t > 0.85 || c.toneAt(xx, y) < 6 && hashDither(xx, y) < t) c.set(xx, y, fog, 3);
    }
  }
}

const hashDither = (x: number, y: number) => {
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
};

export interface DaySkyOpts {
  horizon: number;
  top: number;
  el0: number;
  el1: number;
  /** Sun azimuth (deg) — clouds are lit on that side. */
  sunAz: number;
  clouds?: number;
  /**
   * Elevation (deg) the hazy horizon band reaches before the blue (default 9). Match
   * the stage fog: fogged scenery (distant trees) must sit on haze, not on blue.
   */
  haze?: number;
}

/** Day sky: banded blue (dithered seams), hazy horizon, cumulus with sunlit tops and blue-grey bellies. */
export function daySkyTile(atlas: PwAtlas, o: DaySkyOpts): PwTile {
  const H = rowsFor(o.el1 - o.el0);
  const hazeEl = o.haze ?? 9;
  return atlas.tile(`daysky|${h6(o.horizon)}|${h6(o.top)}|${o.el0}|${o.el1}|${o.sunAz}|${o.clouds ?? 0.5}|${hazeEl}`, TW, H, (c, k) => {
    const rng = k.rng;
    const top = k.ramp(o.top, { light: 0.5, dark: 0.6 });
    const hz = k.ramp(o.horizon, { light: 0.4, dark: 0.75 });
    const cl = k.ramp(0xe8eef2, { light: 0.4, dark: 0.55, sat: 0.7 });
    for (let y = 0; y < H; y++) {
      const el = elOf(y, H, o.el0, o.el1);
      // The haze gives way to the blue over a dithered crossover (no seam line between the ramps).
      const blue = Math.min(1, Math.max(0, (el - hazeEl + 3) / 6));
      for (let x = 0; x < TW; x++) {
        // Lower band: the hazy horizon ramp rising from step 3 to 4; above: the blue ramp from 4 to 2.
        if (blue < 1 && hashDither(x, y) >= blue) c.set(x, y, hz, 3 + Math.min(1, Math.max(0, el) / hazeEl), PWF.DITHER);
        else c.set(x, y, top, Math.max(2, 4 - Math.max(0, el - hazeEl) / 14), PWF.DITHER);
      }
    }
    const sunCol = colOf(o.sunAz);
    const n = Math.round(22 * (o.clouds ?? 0.5));
    for (let i = 0; i < n; i++) {
      const cx = rng.int(0, TW - 1);
      const el = rng.range(4, 26);
      const cy = Math.round(((o.el1 - el) / (o.el1 - o.el0)) * H);
      const w = rng.int(60, 200) * (1 - el / 60);
      const side = ((sunCol - cx + TW) % TW) > TW / 2 ? -1 : 1;
      cumulus(c, cl, cx, cy, w, rng.int(10, 24) * (1 - el / 60), side, rng.next() * 999);
    }
  }, { wrap: true });
}

/** Sunlit cumulus: puffs, bright tops toward the sun, blue-grey shaded bellies, flat base. */
function cumulus(c: PwCanvas, ramp: number, cx: number, base: number, w: number, h: number, side: number, seed: number) {
  const n = Math.max(3, Math.round(w / 18));
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = h * (0.5 + 0.7 * Math.sin(t * Math.PI)) * (0.75 + hash2(i, 2, seed) * 0.5);
    puffs.push([cx - w / 2 + t * w, base - r * 0.6, r]);
  }
  for (let y = Math.floor(base - h * 2.2); y <= base; y++) {
    if (y < 0 || y >= c.h) continue;
    for (let x = Math.floor(cx - w / 2 - h); x <= cx + w / 2 + h; x++) {
      let lit = -2;
      for (const [px, py, r] of puffs) {
        const dx = x - px;
        const dy = y - py;
        if (dx * dx + dy * dy * 1.4 > r * r) continue;
        const l = (-dy / r) * 0.75 + (dx / r) * side * 0.45;
        lit = Math.max(lit, l);
      }
      if (lit < -1.5) continue;
      const px = ((x % TW) + TW) % TW;
      const t = y >= base - 1 ? 2 : lit > 0.45 ? 5 : lit > 0 ? 4 : lit > -0.4 ? 3 : 2;
      c.set(px, y, ramp, t);
    }
  }
}

export interface RangeOpts {
  /** Rock / vegetation colour (pre-hazed for distance) and the haze it fades into. */
  hex: number;
  haze: number;
  el0: number;
  el1: number;
  /** Ridge height (fraction of the band) and roughness. */
  height?: number;
  rough?: number;
  /** Jungle-clad (tree clumps on the slopes) vs bare rock / desert mesas. */
  jungle?: boolean;
  mesas?: boolean;
  /** Sun / moon azimuth for the lit flanks. */
  lightAz: number;
  seed?: number;
}

/**
 * Mountain range (cut out above the ridge): ridgeline from layered noise
 * (mesas: flat tops and cliffs), lit flanks facing the light, gullies, tree
 * clumps on jungle slopes, haze thickening toward the foot (dithered).
 */
export function rangeTile(atlas: PwAtlas, o: RangeOpts): PwTile {
  const H = rowsFor(o.el1 - o.el0);
  return atlas.tile(`range|${h6(o.hex)}|${h6(o.haze)}|${o.el0}|${o.el1}|${o.height ?? 0.7}|${o.rough ?? 0.5}|${o.jungle ? 1 : 0}|${o.mesas ? 1 : 0}|${o.lightAz}|${o.seed ?? 0}`, TW, H, (c, k) => {
    const rng = k.rng;
    const rock = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
    const haze = k.ramp(o.haze, { light: 0.35 });
    const lightCol = colOf(o.lightAz);
    const seed = o.seed ?? 0;
    const ridge = new Float32Array(TW);
    let rMax = 0;
    for (let x = 0; x < TW; x++) {
      const base = smooth(x, 0, TW, 8, 6, 31 + seed);
      const r = base * base * 1.6 * 0.6 + smooth(x, 0, TW, 8, 17, 32 + seed) * 0.28 + smooth(x, 0, TW, 8, 64, 33 + seed) * 0.12 * (o.rough ?? 0.5) * 2;
      ridge[x] = r;
      rMax = Math.max(rMax, r);
    }
    // Normalised (never clipped flat at the band's top: only mesas have flat tops).
    for (let x = 0; x < TW; x++) {
      let r = Math.pow(ridge[x] / rMax, 0.7);
      if (o.mesas) r = r > 0.55 ? 0.55 + (r - 0.55) * 0.15 : r < 0.42 ? r * 0.6 : r;
      ridge[x] = H - 1 - r * (H - 6) * (o.height ?? 0.7);
    }
    // The bare slope lights the flanks; the canopy crowns (jungle) only shade their own few texels.
    const bare = ridge.slice();
    const crownSide = new Int8Array(TW);
    if (o.jungle) {
      // Canopy line: the ridge is a row of tree crowns (round bumps, 2–4 texels), not smooth rock.
      for (let cx = 0; cx < TW; ) {
        const rad = 2 + Math.floor(hash2(cx, 1, 50 + seed) * 3);
        const top = bare[cx] + rad * 0.4;
        for (let dx = -rad; dx <= rad; dx++) {
          const x = (cx + dx + TW) % TW;
          const y = top - Math.sqrt(rad * rad - dx * dx);
          if (y < ridge[x]) {
            ridge[x] = y;
            crownSide[x] = dx < 0 ? -1 : 1;
          }
        }
        cx += rad + 1 + Math.floor(hash2(cx, 2, 51 + seed) * 3);
      }
    }
    for (let x = 0; x < TW; x++) {
      const top = Math.round(ridge[x]);
      const flank = Math.round(bare[x]);
      // Facing the light (a slope smoothed over ±3 texels, so flanks don't strobe column by column).
      const towardLight = ((lightCol - x + TW) % TW) < TW / 2 ? 1 : -1;
      const litAt = (xs: number) => ((bare[(xs + 3 + TW) % TW] - bare[(xs - 3 + TW * 2) % TW]) / 3) * towardLight < -0.15;
      const lit = litAt(x);
      const crownLit = crownSide[x] === towardLight;
      for (let y = Math.max(0, top); y < H; y++) {
        const depth = (y - top) / Math.max(1, H - top);
        // Down the face the light / shadow divide wanders (spurs and gullies), never a straight vertical slab.
        const below = y - flank;
        const xs = below > 1 ? x + Math.round((smooth(x, y, TW, H, 40, 45 + seed) - 0.5) * Math.min(40, below * 1.2)) : x;
        let t = (below > 1 ? litAt(xs) : lit) ? 3 : 2;
        if (y < flank) t = crownLit ? 4 : 3;
        if (y === top) t = lit || crownLit ? 4 : 3;
        // Gullies: darker vertical-ish runs below the ridge notches.
        if (smooth(x, y * 0.25, TW, H, 90, 41 + seed) > 0.72) t -= 1;
        c.set(x, y, rock, t);
        if (o.jungle && depth > 0.04 && hash2(x >> 1, y >> 1, 7 + seed) > 0.8) c.set(x, y, rock, t + (hash2(x, y, 8) > 0.5 ? 1 : -1));
        // Haze: thicker toward the foot.
        if (depth > 0.62 && hashDither(x, y) < (depth - 0.62) * 2) c.set(x, y, haze, 3);
      }
    }
    void rng;
  }, { wrap: true });
}

export interface VolcanoOpts {
  hex: number;
  haze: number;
  el0: number;
  el1: number;
  /** Azimuth of the cone's centre (deg) and its half-width (deg) at the foot. */
  az: number;
  halfWidth: number;
  lightAz: number;
}

/**
 * A smoking volcano (cut out elsewhere: lay it as a layer in front of the range):
 * a cone with lava streaks (glow), a glowing crater rim, a leaning smoke column
 * with lit / shaded puffs, jungle on its lower flanks fading into haze.
 */
export function volcanoTile(atlas: PwAtlas, o: VolcanoOpts): PwTile {
  const H = rowsFor(o.el1 - o.el0);
  // A narrow panel (the cone's azimuth span + room for the smoke): lay it as a layer with `span`.
  const W = Math.round((volcanoSpan(o) * TW) / 360 / 16) * 16;
  return atlas.tile(`volcano|${h6(o.hex)}|${h6(o.haze)}|${o.el0}|${o.el1}|${o.halfWidth}|${o.lightAz - o.az}`, W, H, (c, k) => {
    const TW = c.w;
    const rng = k.rng;
    const rock = k.ramp(o.hex, { light: 0.4, sat: 0.85 });
    const haze = k.ramp(o.haze, { light: 0.35 });
    const lava = k.ramp(0xff6a20, { light: 0.6, sat: 1.1 });
    const smoke = k.ramp(0x9a9890, { light: 0.4, sat: 0.6 });
    // Centred in the panel (the layer's yaw puts the panel's middle at `o.az`).
    const cx = Math.round(TW / 2);
    const hw = o.halfWidth * (2048 / 360);
    const peak = Math.round(H * 0.18);
    const craterW = hw * 0.16;
    const towardLight = ((((o.lightAz - o.az) % 360) + 360) % 360) < 180 ? 1 : -1;
    for (let y = peak; y < H; y++) {
      const t = (y - peak) / (H - peak);
      // Concave flanks (steep near the top).
      const half = craterW + (hw - craterW) * Math.pow(t, 1.6);
      for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
        const x = (cx + dx + TW) % TW;
        const side = dx * towardLight > 0 ? 1 : 0;
        let tone = side ? 3 : 2;
        if (Math.abs(dx) > half - 1) tone = side ? 3 : 1;
        // Ridges / gullies down the flank.
        const g = smooth((dx / Math.max(1, half)) * 64 + 64, y * 0.15, 128, H, 16, 5);
        if (g > 0.68) tone += 1;
        else if (g < 0.3) tone -= 1;
        c.set(x, y, rock, Math.max(0, tone));
        if (t > 0.45 && hash2(x >> 1, y >> 1, 3) > 0.75) c.set(x, y, rock, tone + (hash2(x, y, 4) > 0.5 ? 1 : -1));
        if (t > 0.5 && hashDither(x, y) < (t - 0.5) * 1.6) c.set(x, y, haze, 3);
      }
    }
    // Crater rim glow and lava streaks.
    c.rect(cx - Math.round(craterW), peak, Math.round(craterW * 2), 2, lava, 4, PWF.GLOW);
    c.hline(cx - Math.round(craterW) + 2, peak - 1, Math.round(craterW * 2) - 4, lava, 5, PWF.GLOW);
    for (let s = 0; s < 3; s++) {
      let x = cx + rng.int(-Math.round(craterW), Math.round(craterW));
      for (let y = peak + 2; y < peak + rng.int(14, Math.round((H - peak) * 0.45)); y++) {
        c.set((x + TW) % TW, y, lava, y < peak + 8 ? 5 : 4, PWF.GLOW);
        if (rng.chance(0.3)) x += rng.chance(0.5) ? 1 : -1;
      }
    }
    // Smoke column leaning with the wind, puffs lit on the light side.
    let sx = cx;
    for (let i = 0; i < 26; i++) {
      const sy = peak - 4 - i * 5;
      if (sy < 0) break;
      const r = 5 + i * 0.9;
      sx += 2;
      for (let y = -Math.ceil(r); y <= r; y++) {
        for (let x = -Math.ceil(r); x <= r; x++) {
          const d = Math.hypot(x, y * 1.2) + (hash2(x + i * 7, y, 5) - 0.5) * 3;
          if (d > r) continue;
          const lit = (-y / r) * 0.6 + (x / r) * towardLight * 0.5;
          c.set((sx + x + TW) % TW, sy + y, smoke, lit > 0.35 ? 4 : lit > -0.2 ? 3 : 2, d > r - 1.5 ? PWF.DITHER : 0);
        }
      }
    }
  });
}

/** Azimuth span (deg) of a volcano panel: the cone plus room for its leaning smoke. */
export function volcanoSpan(o: { halfWidth: number }): number {
  return o.halfWidth * 2 + 16;
}

export interface StormSkyOpts {
  horizon: number;
  top: number;
  el0: number;
  el1: number;
}

/** Storm sky: heavy cloud masses in dark bands, their edges lit (lightning / moon rim), rain curtains. */
export function stormSkyTile(atlas: PwAtlas, o: StormSkyOpts): PwTile {
  const H = rowsFor(o.el1 - o.el0);
  return atlas.tile(`stormsky|${h6(o.horizon)}|${h6(o.top)}|${o.el0}|${o.el1}`, TW, H, (c, k) => {
    const rng = k.rng;
    const sky = k.ramp(o.horizon, { light: 0.4, dark: 0.3 });
    const cl = k.ramp(o.top, { light: 0.55, sat: 0.9 });
    for (let y = 0; y < H; y++) {
      const el = elOf(y, H, o.el0, o.el1);
      for (let x = 0; x < TW; x++) c.set(x, y, sky, Math.max(1, 3 - Math.max(0, el) / 12), PWF.DITHER);
    }
    // Cloud masses: overlapping lobes, darker cores, lit upper rims.
    for (let i = 0; i < 60; i++) {
      const cx = rng.int(0, TW - 1);
      const cy = rng.int(-10, Math.round(H * 0.75));
      const r = rng.int(12, 40);
      for (let y = -r; y <= r; y++) {
        for (let x = -r * 2; x <= r * 2; x++) {
          const d = Math.hypot(x / 2, y) + (hash2(x + cx, y + cy, 3) - 0.5) * 4;
          if (d > r) continue;
          const py = cy + y;
          if (py < 0 || py >= H) continue;
          const rim = d > r - 2 && y < 0;
          c.set((cx + x + TW) % TW, py, cl, rim ? 3 : d < r * 0.5 ? 1 : 2, d > r - 2.5 && !rim ? PWF.DITHER : 0);
        }
      }
    }
    // Rain curtains: slanted streaks a step lighter.
    for (let i = 0; i < 400; i++) {
      const x = rng.int(0, TW - 1);
      const y = rng.int(Math.round(H * 0.3), H - 1);
      for (let j = 0; j < 6; j++) c.shift((x + (j >> 1)) % TW, y + j, 1);
    }
  }, { wrap: true });
}

export interface DuskSkyOpts {
  horizon: number;
  mid: number;
  top: number;
  el0: number;
  el1: number;
  sunAz: number;
  sunEl: number;
}

/** Dusk sky: warm horizon band, rose mid band, violet top (dithered seams), a low sun with a halo, streaks of cloud lit from below. */
export function duskSkyTile(atlas: PwAtlas, o: DuskSkyOpts): PwTile {
  const H = rowsFor(o.el1 - o.el0);
  return atlas.tile(`dusksky|${h6(o.horizon)}|${h6(o.mid)}|${h6(o.top)}|${o.el0}|${o.el1}|${o.sunAz}|${o.sunEl}`, TW, H, (c, k) => {
    const rng = k.rng;
    const hz = k.ramp(o.horizon, { light: 0.5 });
    const md = k.ramp(o.mid, { light: 0.45 });
    const tp = k.ramp(o.top, { light: 0.4 });
    const sun = k.ramp(0xfff0b0, { light: 0.6 });
    const sx = colOf(o.sunAz);
    const sy = Math.round(((o.el1 - o.sunEl) / (o.el1 - o.el0)) * H);
    for (let y = 0; y < H; y++) {
      const el = elOf(y, H, o.el0, o.el1);
      for (let x = 0; x < TW; x++) {
        if (el < 6) c.set(x, y, hz, 3 + (6 - Math.max(0, el)) / 6, PWF.DITHER);
        else if (el < 20) c.set(x, y, md, 3.5 - ((el - 6) / 14) * 1.2, PWF.DITHER);
        else c.set(x, y, tp, Math.max(1, 3 - (el - 20) / 16), PWF.DITHER);
      }
    }
    // Long clouds lit from below (sun side brighter).
    for (let i = 0; i < 26; i++) {
      const cx = rng.int(0, TW - 1);
      const cy = rng.int(Math.round(H * 0.2), Math.round(H * 0.8));
      const w = rng.int(40, 160);
      for (let x = -w; x <= w; x++) {
        const th = Math.max(1, Math.round(3 * (1 - Math.abs(x) / w)));
        for (let j = 0; j < th; j++) c.set((cx + x + TW) % TW, cy + j, md, j === th - 1 ? 5 : 4);
      }
    }
    // Sun disc + halo.
    for (let y = -16; y <= 16; y++) {
      for (let x = -16; x <= 16; x++) {
        const d = Math.hypot(x, y);
        if (d < 9) c.set((sx + x + TW) % TW, sy + y, sun, d < 7 ? 5 : 4, PWF.GLOW);
        else if (d < 16) c.shift((sx + x + TW) % TW, sy + y, (16 - d) / 7);
      }
    }
  }, { wrap: true });
}
