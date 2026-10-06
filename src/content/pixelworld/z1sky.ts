import { PWF, PW_BACKDROP_TPD, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, textWidth } from './font';
import { rowsFor } from './sky';
import { hash2, smooth } from './surfaces';

/**
 * MAIN STREET's painted night for ART: PIXEL WORLD (2048 texels round, one
 * level, unlit):
 *  - `z1NightSkyTile`: banded night gradient with dithered seams; a gibbous
 *    moon painted like a Castlevania moon (maria in three tones, a lit limb, the
 *    terminator falling into shadow, craters) with a dithered halo instead of a
 *    hard ring and a cloud wisp drawn across its face; layered cloud banks lit
 *    on the moon side; and, low on the horizon, the glow of the town burning —
 *    orange under-lit smoke columns leaning with the wind at a few azimuths;
 *  - `z1TownlineTile`: the small town's near roofline against that sky —
 *    gables, chimneys, a church steeple, the water tower with the town's name,
 *    a grain elevator, tree clumps, power poles and their sagging lines, a few
 *    lit windows — fading into the fog at its foot.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const TW = 2048;
const elOf = (y: number, h: number, el0: number, el1: number) => el1 - ((y + 0.5) / h) * (el1 - el0);
const colOf = (az: number) => Math.round((((az % 360) + 360) % 360) * (TW / 360));
const dcol = (a: number, b: number) => {
  const d = Math.abs(a - b) % TW;
  return Math.min(d, TW - d);
};
const wrapX = (x: number) => ((x % TW) + TW) % TW;

export interface Z1SkyOpts {
  horizon: number;
  top: number;
  moonAz: number;
  moonEl: number;
  el0: number;
  el1: number;
  /** Azimuths (deg) of the fires glowing on the horizon. */
  fires: number[];
}

export function z1NightSkyTile(atlas: PwAtlas, o: Z1SkyOpts): PwTile {
  const H = rowsFor(o.el1 - o.el0);
  return atlas.tile(`z1sky|${h6(o.horizon)}|${h6(o.top)}|${o.moonAz}|${o.moonEl}|${o.el0}|${o.el1}|${o.fires.join(',')}`, TW, H, (c, k) => paintSky(c, k, o), { wrap: true });
}

function paintSky(c: PwCanvas, k: PwKit, o: Z1SkyOpts) {
  const rng = k.rng;
  const H = c.h;
  const sky = k.ramp(o.horizon, { light: 0.35, dark: 0.18, shift: 1.2 });
  const moonR = k.ramp(0xe6e8f4, { light: 0.45, sat: 0.5 });
  const star = k.ramp(0xc8d4ff, { light: 0.7 });
  const cloud = k.ramp(0x3a4260, { light: 0.42, sat: 0.9 });
  const fire = k.ramp(0xc84a1a, { light: 0.55, sat: 1.1 });
  const smoke = k.ramp(0x2a2428, { light: 0.4 });
  const R = c.ramp;
  const T = c.tone;
  const FL = c.flag;
  const mx = colOf(o.moonAz);
  const my = Math.round(((o.el1 - o.moonEl) / (o.el1 - o.el0)) * H);
  // Gradient: horizon = step 3 (the fog), climbing to step 0 overhead; dithered seams (one fill per row).
  for (let y = 0; y < H; y++) {
    const el = elOf(y, H, o.el0, o.el1);
    const t = 3 - Math.min(3, Math.max(0, (el - 1) / 9) ** 0.8 * 1.15);
    const i0 = y * TW;
    R.fill(sky, i0, i0 + TW);
    T.fill(t, i0, i0 + TW);
    FL.fill(PWF.DITHER, i0, i0 + TW);
  }
  // Fire glow on the horizon: a warm wash rising a few degrees at each fire's azimuth, dithered into the
  // sky (the share of fire texels falls off with the distance — no hard dome edge).
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (const az of o.fires) {
    const fx = colOf(az);
    const span = 90;
    for (let y = 0; y < H; y++) {
      const el = elOf(y, H, o.el0, o.el1);
      if (el > 9) continue;
      for (let dx = -span; dx <= span; dx++) {
        const d = Math.hypot(dx / span, Math.max(0, el) / 9);
        if (d >= 1) continue;
        const x = wrapX(fx + dx);
        const i = y * TW + x;
        const share = (1 - d) ** 1.6 * 0.95;
        if ((BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16 > share) continue;
        R[i] = fire;
        T[i] = d < 0.3 ? 2 : 1;
        FL[i] = 0;
      }
    }
  }
  // Moon halo: one step up in a soft, dithered disc (no hard ring).
  const GR = Math.ceil(11 * PW_BACKDROP_TPD);
  for (let y = Math.max(0, my - GR); y < Math.min(H, my + GR); y++) {
    for (let dxp = -GR; dxp <= GR; dxp++) {
      const dm = Math.hypot(dxp, y - my) / PW_BACKDROP_TPD;
      if (dm >= 11) continue;
      const i = y * TW + wrapX(mx + dxp);
      T[i] = Math.min(4.2, T[i] + ((11 - dm) / 11) ** 1.6 * 1.6);
    }
  }
  // Stars: sparse, brighter higher up, none in the moon's glow or over the fire glow.
  for (let i = 0; i < 700; i++) {
    const x = rng.int(0, TW - 1);
    const y = rng.int(0, H - 1);
    const el = elOf(y, H, o.el0, o.el1);
    if (el < 8 + rng.next() * 6) continue;
    if (dcol(x, mx) < 80 && Math.abs(y - my) < 80) continue;
    const big = rng.chance(0.05);
    c.set(x, y, star, big ? 5 : rng.chance(0.4) ? 4 : 3, PWF.GLOW);
    if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(wrapX(x + dx), y + dy, star, 2, PWF.GLOW);
  }
  // The moon (gibbous): maria in three tones, lit upper-left limb, the terminator on the right.
  const MR = 11;
  for (let y = -MR; y <= MR; y++) {
    for (let x = -MR; x <= MR; x++) {
      const d = Math.hypot(x, y);
      if (d > MR) continue;
      const px = wrapX(mx + x);
      const py = my + y;
      // Terminator: an ellipse offset to the right: the shadowed part of the disc.
      const term = (x - MR * 0.62) ** 2 / (MR * 0.75) ** 2 + (y * y) / (MR * 1.05) ** 2 < 1;
      const m = smooth(x + 40, y + 40, 80, 80, 6, 3);
      let t = 4;
      if (m > 0.66) t = 2;
      else if (m > 0.56) t = 3;
      if (d > MR - 1.4 && x + y < 0) t = 5;
      if (term) t = Math.max(1, t - 2);
      c.set(px, py, moonR, t, PWF.GLOW);
    }
  }
  for (const [x, y] of [[-5, 3], [-2, -6], [3, 5], [-7, -1]]) {
    c.set(wrapX(mx + x), my + y, moonR, 2, PWF.GLOW);
    c.set(wrapX(mx + x + 1), my + y + 1, moonR, 5, PWF.GLOW);
  }
  // Cloud banks: flat bellies, puffed tops lit on the moon side, layered.
  const banks: [number, number, number, number][] = [];
  for (let i = 0; i < 12; i++) banks.push([rng.int(0, TW - 1), rng.range(4, 16), rng.int(120, 320), rng.int(5, 11)]);
  // One wisp across the moon's lower half.
  banks.push([mx + 6, o.moonEl - 1.6, 90, 3]);
  // Stratus streaks: long thin dithered bands low in the sky.
  for (let i = 0; i < 9; i++) {
    const sx = rng.int(0, TW - 1);
    const sy = Math.round(((o.el1 - rng.range(2, 9)) / (o.el1 - o.el0)) * H);
    const len = rng.int(160, 420);
    for (let dx = 0; dx < len; dx++) {
      const u = dx / len;
      const th = Math.max(1, Math.round(Math.sin(u * Math.PI) * 3));
      for (let j = 0; j < th; j++) {
        const x = wrapX(sx + dx);
        if (BAY[((sy + j) & 3) * 4 + (x & 3)] / 16 > Math.sin(u * Math.PI) * 0.9) continue;
        c.set(x, sy + j, cloud, j === 0 ? 2 : 1, PWF.GLOW);
      }
    }
  }
  for (const [cx, el, w, h] of banks) {
    const base = Math.round(((o.el1 - el) / (o.el1 - o.el0)) * H);
    cloudBank(c, cloud, cx, base, w, h, mx < cx ? -1 : 1, hash2(cx, base, 5) * 1000);
  }
  // Smoke columns over the fires: broad billowing columns leaning with the wind, lumpy edges, lit
  // orange from below, thinning into the sky at the top.
  for (const az of o.fires) {
    const fx = colOf(az);
    const footY = Math.round(((o.el1 - 0.5) / (o.el1 - o.el0)) * H);
    const top = Math.round(H * 0.42);
    for (let y = footY; y > footY - top; y--) {
      const t = (footY - y) / top;
      const cx = fx + t * t * 40;
      const hw = 12 + t * 30;
      for (let dx = -Math.ceil(hw) - 6; dx <= Math.ceil(hw) + 6; dx++) {
        const x = wrapX(Math.round(cx + dx));
        // Billows: the edge pushed in and out by a lumpy noise (big round lobes, not a feather).
        const lobe = (smooth(x, y, TW, TW, 170, 11 + az) - 0.5) * 18;
        const e = Math.abs(dx) - (hw + lobe);
        if (e > 0) continue;
        // The top thins out into the sky (ordered dither).
        if (t > 0.6 && (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < (t - 0.6) / 0.4) continue;
        const i = y * TW + x;
        const rim = e > -2.5;
        const litLow = t < 0.3 && (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16 > t / 0.3;
        if (litLow) {
          R[i] = fire;
          T[i] = rim ? 1 : 2;
        } else {
          R[i] = smoke;
          // Billows lit on their upper-left (the moon), the lee side darker.
          const sh = smooth(x, y, TW, TW, 256, 12 + az);
          T[i] = rim ? (dx < 0 ? 3 : 1) : sh > 0.55 ? 3 : 2;
        }
        FL[i] = 0;
      }
    }
  }
}

/**
 * Cloud bank: a union of flattened puffs along a flat belly, shaded as one mass
 * the way a pixel artist shades a cloud — a lit crust along its top edge (two
 * steps toward the moon side), the body, a darker belly breaking into dither.
 */
function cloudBank(c: PwCanvas, ramp: number, cx: number, base: number, w: number, h: number, side: number, seed: number) {
  const n = Math.max(4, Math.round(w / 11));
  const x0 = Math.floor(cx - w / 2 - h * 3);
  const BW = Math.ceil(w + h * 6) + 2;
  const y0 = Math.floor(base - h * 2.6);
  const BH = base - y0 + 1;
  const mask = new Uint8Array(BW * BH);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = h * (0.45 + 0.7 * Math.sin(t * Math.PI)) * (0.55 + hash2(i, 1, seed) * 0.9);
    const px = cx - w / 2 + t * w + (hash2(i, 2, seed) - 0.5) * 10;
    const py = base - r * (0.35 + hash2(i, 3, seed) * 0.5);
    for (let y = Math.max(y0, Math.floor(py - r)); y <= Math.min(base, Math.ceil(py + r)); y++) {
      const dy = y - py;
      for (let x = Math.floor(px - r * 1.4); x <= Math.ceil(px + r * 1.4); x++) {
        const dx = x - px;
        if (dx * dx * 0.5 + dy * dy * 1.69 > r * r) continue;
        const j = (y - y0) * BW + (x - x0);
        if (j >= 0 && j < mask.length) mask[j] = 1;
      }
    }
  }
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let xx = 0; xx < BW; xx++) {
    let depth = 0;
    for (let yy = 0; yy < BH; yy++) {
      const j = yy * BW + xx;
      if (!mask[j]) {
        depth = 0;
        continue;
      }
      const y = y0 + yy;
      if (y < 0 || y >= c.h) {
        depth++;
        continue;
      }
      const x = wrapX(x0 + xx);
      // Edge toward the moon (side −1: the light comes from the left).
      const towardMoon = side < 0 ? !mask[j - 1] : !mask[j + 1];
      let t = depth < 1 ? 3 : depth < 3 ? 2 : 1;
      if (towardMoon && depth < 4) t = 3;
      const belly = base - y;
      if (belly < 2 && (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16 > 0.5) {
        depth++;
        continue;
      }
      c.set(x, y, ramp, t, PWF.GLOW);
      depth++;
    }
  }
}

// ─── The town's roofline ────────────────────────────────────────────────────

export interface Z1TownlineOpts {
  hex: number;
  fog: number;
  el0: number;
  el1: number;
  moonAz: number;
  /** Name painted on the water tower. */
  name: string;
}

export function z1TownlineTile(atlas: PwAtlas, o: Z1TownlineOpts): PwTile {
  const H = rowsFor(o.el1 - o.el0);
  return atlas.tile(`z1town|${h6(o.hex)}|${h6(o.fog)}|${o.el0}|${o.el1}|${o.moonAz}|${o.name}`, TW, H, (c, k) => paintTownline(c, k, o), { wrap: true });
}

function paintTownline(c: PwCanvas, k: PwKit, o: Z1TownlineOpts) {
  const rng = k.rng;
  const H = c.h;
  const body = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
  const fog = k.ramp(o.fog, { light: 0.3 });
  const warm = k.ramp(0xffc477, { light: 0.4 });
  const red = k.ramp(0xff3020, { light: 0.4 });
  const tree = k.ramp(0x14201c, { light: 0.4 });
  const moonCol = colOf(o.moonAz);
  const ground = H - 1;
  const put = (x: number, y: number, t: number, r = body, f = 0) => {
    if (y >= 0 && y < H) c.set(wrapX(x), y, r, t, f);
  };
  const fillCol = (x: number, top: number, t: number, r = body) => {
    for (let y = Math.max(0, top); y <= ground; y++) put(x, y, t, r);
  };
  const litSide = (x: number) => (wrapX(moonCol - x) > TW / 2 ? -1 : 1);
  let x = 0;
  let i = 0;
  while (x < TW) {
    const kind = rng.next();
    if (kind < 0.42) {
      // A gabled house / shop: a pitched roof (lit slope toward the moon), a chimney, a window or two.
      const w = rng.int(16, 34);
      const wall = Math.round(H * rng.range(0.16, 0.3));
      const pitch = rng.range(0.4, 0.75);
      const ridge = Math.round(wall + (w / 2) * pitch);
      for (let dx = 0; dx < w; dx++) {
        const roofH = Math.round(wall + (w / 2 - Math.abs(dx - w / 2)) * pitch);
        const lit = (dx < w / 2) === (litSide(x) < 0);
        fillCol(x + dx, ground - roofH, 2);
        put(x + dx, ground - roofH, lit ? 4 : 3);
        put(x + dx, ground - roofH + 1, lit ? 3 : 2);
      }
      if (rng.chance(0.6)) {
        const cx = x + rng.int(3, w - 5);
        for (let y = ground - ridge - 4; y < ground - wall; y++) for (let j = 0; j < 3; j++) put(cx + j, y, j === 0 ? 3 : 2);
      }
      for (let n = 0; n < rng.int(0, 2); n++) {
        const wx = x + rng.int(3, w - 5);
        const wy = ground - rng.int(3, Math.max(4, wall - 3));
        put(wx, wy, 4, warm, PWF.GLOW);
        put(wx + 1, wy, 3, warm, PWF.GLOW);
        put(wx, wy + 1, 3, warm, PWF.GLOW);
        put(wx + 1, wy + 1, 3, warm, PWF.GLOW);
      }
      x += w + rng.int(0, 3);
    } else if (kind < 0.7) {
      // Tree clump: lumpy crowns over the roofs.
      const w = rng.int(14, 30);
      const top = Math.round(H * rng.range(0.25, 0.45));
      for (let dx = 0; dx < w; dx++) {
        const u = dx / w;
        const h = top * (0.6 + 0.4 * Math.sin(u * Math.PI)) + (hash2(x + dx, i, 3) - 0.5) * 4 + Math.sin(dx * 0.9) * 2;
        fillCol(x + dx, ground - Math.round(h), 1, tree);
        put(x + dx, ground - Math.round(h), litSide(x) * (dx - w / 2) < 0 ? 3 : 2, tree);
      }
      x += Math.round(w * 0.7);
    } else if (kind < 0.9) {
      // A flat-roofed commercial block with a parapet and a lit sign.
      const w = rng.int(20, 44);
      const h = Math.round(H * rng.range(0.22, 0.38));
      for (let dx = 0; dx < w; dx++) {
        fillCol(x + dx, ground - h, 2);
        put(x + dx, ground - h, 3);
      }
      for (let dx = 0; dx < w; dx += 3) put(x + dx, ground - h - 1, 2);
      for (let yy = ground - h + 3; yy < ground - 3; yy += 3) {
        for (let dx = 2; dx < w - 2; dx += 3) if (hash2(x + dx, yy, 9) < 0.12) put(x + dx, yy, 3, warm, PWF.GLOW);
      }
      if (rng.chance(0.3)) for (let dx = 4; dx < Math.min(w - 4, 16); dx++) put(x + dx, ground - h - 3, 4, red, PWF.GLOW);
      x += w + rng.int(0, 2);
    } else {
      // Power pole with its lines sagging to the next.
      const ph = Math.round(H * 0.5);
      fillCol(x, ground - ph, 2);
      for (let dx = -3; dx <= 3; dx++) put(x + dx, ground - ph + 2, 2);
      for (let dx = 1; dx < 40; dx++) put(x + dx, ground - ph + 3 + Math.round(Math.sin((dx / 40) * Math.PI) * 4), 1);
      x += rng.int(4, 10);
    }
    i++;
  }
  // Landmarks: the church steeple, the water tower with the town's name, a grain elevator.
  const steeple = colOf(o.moonAz + 42);
  {
    const base = ground;
    const tw = 14;
    const th = Math.round(H * 0.55);
    for (let dx = 0; dx < tw; dx++) fillCol(steeple + dx, base - th, dx < 3 ? 3 : 2);
    // Spire.
    const sh = Math.round(H * 0.38);
    for (let y = 0; y < sh; y++) {
      const hw = Math.round((tw / 2) * (1 - y / sh));
      for (let dx = -hw; dx <= hw; dx++) put(steeple + tw / 2 + dx, base - th - y, dx < 0 ? 3 : 2);
    }
    put(steeple + tw / 2, base - th - sh - 1, 2);
    put(steeple + tw / 2, base - th - sh - 3, 2);
    for (let dx = -2; dx <= 2; dx++) put(steeple + tw / 2 + dx, base - th - sh - 2, 2);
    // Belfry louvres, a lit clock.
    c.rect(wrapX(steeple + 4), base - th + 4, 6, 6, warm, 3, PWF.GLOW);
    put(steeple + 7, base - th + 7, 1, warm, PWF.GLOW);
  }
  const tower = colOf(o.moonAz - 25);
  {
    const legsH = Math.round(H * 0.42);
    const tankH = Math.round(H * 0.26);
    const tw = 40;
    const top = ground - legsH - tankH;
    for (const lx of [3, 14, 25, 36]) for (let y = ground - legsH; y <= ground; y++) put(tower + lx, y, 2);
    for (let y = ground - legsH + 6; y < ground; y += 10) for (let dx = 3; dx <= 30; dx++) put(tower + dx, y + Math.round(Math.abs(dx - 16.5) * 0.3) - 3, 1);
    for (let y = top; y < ground - legsH; y++) {
      const round = y < top + 3 ? 2 - (y - top) : 0;
      for (let dx = round; dx < tw - round; dx++) put(tower + dx, y, dx < 6 ? 4 : dx > tw - 6 ? 2 : 3);
    }
    // Conical cap with a finial.
    for (let y = 0; y < 8; y++) for (let dx = y * 2; dx < tw - y * 2; dx++) put(tower + dx, top - 1 - y, dx < tw / 2 ? 3 : 2);
    put(tower + tw / 2, top - 10, 2);
    put(tower + tw / 2, top - 11, 5, red, PWF.GLOW);
    // The name in pale paint.
    const nameR = k.ramp(0xd8d4c8, { light: 0.3, sat: 0.5 });
    const nw = textWidth(o.name, FONT_3x5);
    drawText(c, o.name, wrapX(tower + Math.round((tw - nw) / 2)), top + Math.round(tankH / 2) - 2, FONT_3x5, nameR, 2);
  }
  const elevator = colOf(o.moonAz - 80);
  {
    const eh = Math.round(H * 0.62);
    for (let n = 0; n < 4; n++) for (let dx = 0; dx < 8; dx++) fillCol(elevator + n * 8 + dx, ground - eh + (dx === 0 || dx === 7 ? 2 : 0), dx < 2 ? 3 : 2);
    for (let dx = 0; dx < 14; dx++) fillCol(elevator + 32 + dx, ground - eh - 10, 2);
    put(elevator + 39, ground - eh - 12, 5, red, PWF.GLOW);
  }
  // Foot: fade into the fog (dithered).
  for (let y = H - 10; y < H; y++) {
    const t = (y - (H - 10)) / 10;
    for (let xx = 0; xx < TW; xx++) {
      if (!c.at(xx, y)) continue;
      const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      if (t > 0.8 || (B[(y & 3) * 4 + (xx & 3)] + 0.5) / 16 < t) c.set(xx, y, fog, 3);
    }
  }
}
