import { bayer, PW_BACKDROP_TPD, PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';
import { mixHex } from './z2surfaces';

/**
 * ST. MERCY HOSPITAL's night over the ambulance bay (PIXEL WORLD backdrop):
 *  - `z2StormSkyTile`: a low storm deck lit orange-brown from below by the
 *    burning city, heavier and bluer overhead, ragged cloud bands with lit
 *    undersides, rain shafts, a moon smothered behind the cloud; the top rows
 *    dissolve into the stage's fog / background colour (the band has no cap);
 *  - `z2CityTile`: the city beyond the car park fence — blocks and towers,
 *    a church spire, water tanks, a few lit windows, fires behind some roofs
 *    with smoke columns, red beacons; the foot fades into the fog.
 * Both 1024 wide and laid twice round the horizon (the bay only ever looks
 * one way: the 180° repeat is never on screen twice).
 */

const W = 1024;
const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** Rows for an elevation band at the backdrop density (multiple of 16). */
export function skyRows(deg: number): number {
  return Math.max(16, Math.round((deg * PW_BACKDROP_TPD) / 16) * 16);
}

export interface StormOpts {
  /** Fog colour (horizon) and the background colour above the band. */
  fog: number;
  top: number;
  /** City-fire glow under the clouds. */
  glow: number;
  el0: number;
  el1: number;
}

export function z2StormSkyTile(atlas: PwAtlas, o: StormOpts): PwTile {
  const H = skyRows(o.el1 - o.el0);
  return atlas.tile(`z2storm|${h6(o.fog)}|${h6(o.top)}|${h6(o.glow)}|${o.el0}|${o.el1}`, W, H, (c, k) => paintStorm(c, k, o), { wrap: true });
}

function paintStorm(c: PwCanvas, k: PwKit, o: StormOpts) {
  const rng = k.rng;
  const H = c.h;
  const el = (y: number) => o.el1 - ((y + 0.5) / H) * (o.el1 - o.el0);
  // Sky ramp from the background colour: step 3 = top (matches the background), lower steps never used;
  // a warm glow ramp near the horizon (the fires lighting the cloud base).
  const sky = k.ramp(o.top, { light: 0.25, dark: 0.6, shift: 0.6 });
  const fog = k.ramp(o.fog, { light: 0.3, dark: 0.6 });
  const glow = k.ramp(mixHex(o.fog, o.glow, 0.55), { light: 0.35, sat: 0.9 });
  const cloud = k.ramp(mixHex(o.top, 0x4a5470, 0.6), { light: 0.4, sat: 0.8 });
  const under = k.ramp(mixHex(o.fog, o.glow, 0.5), { light: 0.45, sat: 1 });
  // Base: background colour high up, fog colour toward the horizon, a warm band just above it (dithered seams).
  for (let y = 0; y < H; y++) {
    const e = el(y);
    if (e > 12) c.rect(0, y, W, 1, sky, 3);
    else if (e > 7) c.rect(0, y, W, 1, sky, 3 - (12 - e) / 10, PWF.DITHER);
    else if (e > 2.5) c.rect(0, y, W, 1, fog, 3);
    else c.rect(0, y, W, 1, fog, 3);
  }
  // Fire glow on the cloud base low over the horizon: wide soft blooms (dithered rims), where the city burns.
  for (let y = 0; y < H; y++) {
    const e = el(y);
    if (e > 9) continue;
    for (let x = 0; x < W; x++) {
      const n = smooth(x, 0, W, 16, 8, 81) * 0.7 + smooth(x, 0, W, 16, 24, 82) * 0.3;
      const reach = 1 + n * 8;
      if (e < reach) {
        const t = 2 + (1 - e / reach) * 1.6;
        c.set(x, y, glow, Math.min(3.6, t), PWF.DITHER);
      }
    }
  }
  // Cloud masses in layers, far (high, dark, cool) to near (low, lit warm from the fires below):
  // a puffy top silhouette (two noise octaves), a dark body, a ragged underside with a lit rim.
  const layers = [
    { e: 21, thick: 20, cells: 6, warm: 0 },
    { e: 15, thick: 24, cells: 8, warm: 0 },
    { e: 10, thick: 22, cells: 10, warm: 1 },
    { e: 5.5, thick: 18, cells: 14, warm: 2 },
  ];
  const deep = k.ramp(mixHex(o.top, 0x1a1e2a, 0.5), { light: 0.3, sat: 0.8 });
  layers.forEach((L, li) => {
    const base = Math.round(((o.el1 - L.e) / (o.el1 - o.el0)) * H);
    const seed = 120 + li * 7;
    for (let x = 0; x < W; x++) {
      const n = smooth(x, 0, W, 8, L.cells, seed) * 0.75 + smooth(x, 0, W, 8, L.cells * 4, seed + 1) * 0.25;
      if (n < 0.3) continue;
      const top = base - Math.round(L.thick * (n - 0.15) * 1.2);
      const bottom = base + Math.round((smooth(x, 3, W, 8, L.cells * 3, seed + 2) - 0.5) * 6);
      for (let y = Math.max(0, top); y <= Math.min(H - 1, bottom); y++) {
        const fromBottom = bottom - y;
        const fromTop = y - top;
        let r = li < 2 ? deep : cloud;
        let t = 2;
        if (fromBottom === 0) {
          r = L.warm ? under : cloud;
          t = L.warm === 2 ? 4 : 3;
        } else if (fromBottom === 1 && L.warm) {
          r = under;
          t = 3;
        } else if (fromTop === 0) {
          // The silhouette's top catches the sky light a little (cool rim), broken.
          if (bayer(x, y) < 0.35) continue;
          t = 3;
        } else if (fromBottom < 5 && L.warm) {
          r = under;
          t = 2;
        } else t = fromTop < 3 ? 2.5 : 2;
        c.set(x, y, r, t, t % 1 ? PWF.DITHER : 0);
      }
    }
  });
  // The moon smothered behind cloud: a pale smudge, a brighter rim on a cloud edge.
  const mx = 300;
  const my = Math.round(((o.el1 - (o.el1 - 6)) / (o.el1 - o.el0)) * H);
  for (let y = my - 12; y < my + 12; y++) {
    for (let x = mx - 26; x < mx + 26; x++) {
      const d = Math.hypot((x - mx) / 26, (y - my) / 12);
      if (d > 1 || y < 0 || y >= H) continue;
      c.shift(x, y, d < 0.5 ? 1.5 : 1);
    }
  }
  // Rain shafts: slanted streaky curtains under the cloud base (a step darker, broken).
  for (let i = 0; i < 14; i++) {
    const x0 = rng.int(0, W - 1);
    const w = rng.int(20, 60);
    const ytop = Math.round(H * rng.range(0.35, 0.6));
    for (let y = ytop; y < H; y++) {
      for (let x = x0; x < x0 + w; x += 3) {
        const xx = (x + Math.round((y - ytop) * 0.35)) % W;
        if (hash2(xx >> 1, y >> 2, i) > 0.55) c.shift(xx, y, -1);
      }
    }
  }
}

export interface CityOpts {
  hex: number;
  fog: number;
  fire: number;
  el0: number;
  el1: number;
  seed?: number;
}

/** The city beyond the car park: silhouettes, lit windows, fires and smoke (cut out above the roofs). */
export function z2CityTile(atlas: PwAtlas, o: CityOpts): PwTile {
  const H = skyRows(o.el1 - o.el0);
  return atlas.tile(`z2city|${h6(o.hex)}|${h6(o.fog)}|${h6(o.fire)}|${o.el0}|${o.el1}|${o.seed ?? 0}`, W, H, (c, k) => paintCity(c, k, o), { wrap: true });
}

function paintCity(c: PwCanvas, k: PwKit, o: CityOpts) {
  const rng = k.rng;
  const H = c.h;
  const body = k.ramp(o.hex, { light: 0.35, sat: 0.9 });
  const fog = k.ramp(o.fog, { light: 0.3 });
  const warm = k.ramp(0xffc477, { light: 0.4 });
  const cool = k.ramp(0xa8c4ff, { light: 0.4 });
  const red = k.ramp(0xff3020, { light: 0.4 });
  const fire = k.ramp(o.fire, { light: 0.5, sat: 1.1 });
  const smoke = k.ramp(mixHex(o.fog, 0x3a3030, 0.4), { light: 0.3 });
  const ground = H - 1;
  let x = 0;
  let b = 0;
  const roofs: number[] = new Array(W).fill(ground);
  while (x < W) {
    const wdt = rng.int(14, 46);
    const tall = rng.chance(0.15);
    const hh = Math.round(H * (tall ? rng.range(0.6, 0.9) : rng.range(0.2, 0.5)));
    const top = ground - hh;
    for (let yy = top; yy <= ground; yy++) {
      for (let xx = x; xx < x + wdt; xx++) {
        const px = xx % W;
        c.set(px, yy, body, yy === top ? 3 : xx === x ? 3 : 2);
        roofs[px] = Math.min(roofs[px], top);
      }
    }
    // Roof furniture: a water tank, a spire, an antenna with a beacon.
    const r = rng.next();
    const rx = x + rng.int(2, Math.max(3, wdt - 8));
    if (r < 0.2) {
      c.rect(rx % W, top - 7, 6, 5, body, 2);
      c.hline(rx % W, top - 7, 6, body, 3);
      c.vline((rx + 1) % W, top - 2, 2, body, 2);
      c.vline((rx + 4) % W, top - 2, 2, body, 2);
    } else if (r < 0.28) {
      // Church spire.
      for (let j = 0; j < 18; j++) {
        const half = Math.floor(j / 6);
        c.rect((rx + 2 - half) % W, top - 18 + j, 1 + half * 2, 1, body, 2);
      }
      c.vline((rx + 2) % W, top - 22, 4, body, 2);
      c.hline((rx + 1) % W, top - 21, 3, body, 2);
    } else if (r < 0.5 || tall) {
      const ah = rng.int(5, tall ? 18 : 9);
      c.vline((rx + 2) % W, top - ah, ah, body, 2);
      c.set((rx + 2) % W, top - ah - 1, red, 5, PWF.GLOW);
    }
    // Windows: mostly dark (the power is out) — a few lit floors, more toward the tall ones.
    for (let yy = top + 3; yy < ground - 3; yy += 3) {
      const lit = hash2(b, yy, 3) < (tall ? 0.22 : 0.08);
      for (let xx = x + 2; xx < x + wdt - 2; xx += 2) {
        if (!(lit ? hash2(xx, yy, 5) < 0.7 : hash2(xx, yy, 6) < 0.02)) continue;
        c.set(xx % W, yy, hash2(b, 9, 1) < 0.7 ? warm : cool, hash2(xx, yy, 8) < 0.25 ? 4 : 3, PWF.GLOW);
      }
    }
    x += wdt + (rng.chance(0.2) ? rng.int(1, 5) : 0);
    b++;
  }
  // Fires behind some roofs: a flickering crown of flame (GLOW), smoke columns leaning with the wind.
  for (let i = 0; i < 5; i++) {
    const fx = rng.int(0, W - 1);
    const roof = roofs[fx];
    const fw = rng.int(8, 18);
    for (let xx = fx - fw; xx < fx + fw; xx++) {
      const px = ((xx % W) + W) % W;
      const ry = roofs[px];
      const fh = Math.round((1 - Math.abs(xx - fx) / fw) * rng.range(3, 8));
      for (let j = 0; j < fh; j++) c.set(px, ry - 1 - j, fire, j === 0 ? 3 : j < fh / 2 ? 4 : 5, PWF.GLOW);
      // Windows below glow orange.
      if (hash2(px, 1, i) > 0.6) c.set(px, ry + 3, fire, 4, PWF.GLOW);
    }
    // Smoke: a column of dark puffs drifting right as it rises.
    for (let j = 0; j < 40; j++) {
      const sy = roof - 6 - j;
      if (sy < 1) break;
      const sx = fx + Math.round(j * 0.6 + Math.sin(j * 0.4) * 2);
      const r = 2 + j * 0.15;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = (((sx + dx) % W) + W) % W;
        const py = Math.round(sy + dy);
        if (py < 0 || py >= H || c.at(px, py)) continue;
        if (bayer(px, py) < 0.25 + j / 80) continue;
        c.set(px, py, smoke, 3);
      }
    }
  }
  // Foot fades into the fog.
  for (let y = H - 10; y < H; y++) {
    const t = (y - (H - 10)) / 10;
    for (let xx = 0; xx < W; xx++) if (c.at(xx, y) && bayer(xx, y) < t) c.set(xx, y, fog, 3);
  }
}
