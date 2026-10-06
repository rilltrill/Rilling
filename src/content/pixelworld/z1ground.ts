import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD } from './font';
import { cells, darken, hash2, smooth } from './surfaces';

/**
 * MAIN STREET (z1) ground painters for ART: PIXEL WORLD — the wet night street
 * the way a Final Fight / Streets of Rage background artist paints it:
 *  - `z1AsphaltTile`: dark wet asphalt with only a sprinkle of aggregate, long
 *    tar-sealed cracks that catch the light, a saw-cut utility patch, alligator
 *    cracking, wet dips (no per-texel speckle: the street reads as one dark
 *    surface with designed features, not as a noise field);
 *  - `z1PavingTile`: the town square's flagstones — random-length stones in
 *    courses, each with its own tone and a lit upper-left arris, moss and grit
 *    in the joints, a cracked / sunken flag holding water;
 *  - `z1GroundDecals`: ONE sheet of cut-out decals laid flat over the road and
 *    sidewalks (manhole, storm drain, puddles that mirror the neon, oil with its
 *    rainbow rim, potholes, tar patches, skid marks, blood, litter, a cellar
 *    hatch, road lettering) — every decal sits on its own 16-texel cell, so no
 *    level of the mip chain mixes two of them.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrapI = (v: number, n: number) => ((v % n) + n) % n;

// ─── Asphalt ────────────────────────────────────────────────────────────────

export interface Z1AsphaltOpts {
  hex: number;
  /** 0…1 wear: cracks, patches. */
  wear?: number;
  seed?: number;
}

/** Wet night asphalt, 256 × 256 (8 m). */
export function z1AsphaltTile(atlas: PwAtlas, o: Z1AsphaltOpts): PwTile {
  return atlas.tile(`z1asphalt|${h6(o.hex)}|${o.wear ?? 0.6}|${o.seed ?? 0}`, 256, 256, (c, k) => paintZ1Asphalt(c, k, o), { wrap: true });
}

export function paintZ1Asphalt(c: PwCanvas, k: PwKit, o: Z1AsphaltOpts) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const wear = o.wear ?? 0.6;
  const a = k.ramp(o.hex, { light: 0.36, sat: 0.9 });
  // Older / newer asphalt: a ramp a shade darker at the same step (low-contrast areas, no blobs).
  const b = k.ramp(darken(o.hex, 0.88), { light: 0.36, sat: 0.95 });
  const tar = k.ramp(darken(o.hex, 0.62), { light: 0.5, sat: 1.0 });
  const sky = k.ramp(0x56648a, { light: 0.3, sat: 0.9 });
  const R = c.ramp;
  const T = c.tone;
  const s0 = (o.seed ?? 0) * 7;
  T.fill(3);
  // Older / newer areas (sampled per 2 × 2 block: their edges are ragged pixel steps).
  for (let by = 0; by < H; by += 2) {
    for (let bx = 0; bx < W; bx += 2) {
      const r = smooth(bx + 1, by + 1, W, H, 4, 2 + s0) < 0.42 ? b : a;
      const i = by * W + bx;
      R[i] = R[i + 1] = R[i + W] = R[i + W + 1] = r;
    }
  }
  // Aggregate: a sprinkle (≈ 2 % of texels), two-texel chips, low contrast.
  for (let i = 0; i < 340; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    c.shift(x, y, 1);
    if (rng.chance(0.5)) c.shift(wrapI(x + 1, W), y, 1);
  }
  for (let i = 0; i < 300; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    c.shift(x, y, -1);
    if (rng.chance(0.4)) c.shift(x, wrapI(y + 1, H), -1);
  }
  // Saw-cut utility patch: straight seams sealed with tar, the infill newer (darker, smoother).
  {
    const px = rng.int(0, W - 1);
    const py = rng.int(0, H - 1);
    const pw = rng.int(30, 44);
    const ph = rng.int(90, 130);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const ix = wrapI(px + x, W);
        const iy = wrapI(py + y, H);
        const i = iy * W + ix;
        const edge = x === 0 || y === 0 || x === pw - 1 || y === ph - 1;
        R[i] = edge ? tar : b;
        T[i] = edge ? 1 : 3;
        if ((x === pw - 2 || y === ph - 2) && !edge) T[i] = 4;
      }
    }
    for (let i = 0; i < 30; i++) c.shift(wrapI(px + rng.int(2, pw - 3), W), wrapI(py + rng.int(2, ph - 3), H), 1);
  }
  // Tar snakes: long sealed cracks, a glint on their upper-left edge now and then (wet tar shines).
  const nSnakes = Math.round(4 + wear * 5);
  for (let s = 0; s < nSnakes; s++) {
    let x = rng.int(0, W - 1);
    let y = rng.int(0, H - 1);
    let ang = rng.next() * Math.PI * 2;
    const len = rng.int(40, 120);
    const fat = rng.chance(0.4);
    for (let j = 0; j < len; j++) {
      const ix = wrapI(Math.round(x), W);
      const iy = wrapI(Math.round(y), H);
      c.set(ix, iy, tar, 1);
      if (fat) c.set(wrapI(ix + 1, W), iy, tar, 1);
      if (j % 9 === 4) c.set(wrapI(ix - 1, W), wrapI(iy - 1, H), sky, 2);
      ang += rng.spread(0.35);
      x += Math.cos(ang);
      y += Math.sin(ang);
      if (rng.chance(0.03)) ang += rng.chance(0.5) ? 1.1 : -1.1;
    }
  }
  // Alligator cracking: one worn area of small polygonal cells.
  {
    const cx = rng.int(0, W - 1);
    const cy = rng.int(0, H - 1);
    const RR = rng.int(18, 26);
    for (let y = -RR; y <= RR; y++) {
      for (let x = -RR; x <= RR; x++) {
        const d = (x * x + y * y) / (RR * RR);
        if (d > 1) continue;
        const ix = wrapI(cx + x, W);
        const iy = wrapI(cy + y, H);
        const v = cells(ix, iy, W, H, 40, 40, 71);
        if (v.edge < 0.6 && hash2(ix >> 1, iy >> 1, 13) > d * 0.7) {
          c.set(ix, iy, tar, 1);
          c.shift(wrapI(ix + 1, W), wrapI(iy + 1, H), 1);
        }
      }
    }
  }
  // Wet sheen: the cool sky caught in a few broad smears of short streaks (never dots).
  for (let p = 0; p < 4; p++) {
    const cx = rng.int(0, W - 1);
    const cy = rng.int(0, H - 1);
    for (let j = 0; j < 9; j++) {
      const x = cx + rng.int(-18, 18);
      const y = cy + rng.int(-7, 7);
      const n = rng.int(3, 7);
      for (let q = 0; q < n; q++) {
        const ix = wrapI(x + q, W);
        const iy = wrapI(y, H);
        if (R[iy * W + ix] !== tar) c.set(ix, iy, sky, q === 0 || q === n - 1 ? 1 : 2);
      }
    }
  }
}

// ─── Square paving ──────────────────────────────────────────────────────────

/**
 * The town square's paving, 256 × 256 (8 m): herringbone brick pavers (8 × 4
 * texels = 25 × 12.5 cm) framed by granite sett bands on a 4 m grid — each
 * brick its own tone with a lit upper-left arris, moss and grit in a few
 * joints, a missing brick holding water, sunken wet patches.
 */
export function z1PavingTile(atlas: PwAtlas, o: { brick: number; granite: number; moss?: number }): PwTile {
  return atlas.tile(`z1paving|${h6(o.brick)}|${h6(o.granite)}|${h6(o.moss ?? 0x3e5a32)}`, 256, 256, (c, k) => paintZ1Paving(c, k, o), { wrap: true });
}

export function paintZ1Paving(c: PwCanvas, k: PwKit, o: { brick: number; granite: number; moss?: number }) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const br = k.ramp(o.brick, { light: 0.42, sat: 0.9 });
  const br2 = k.ramp(darken(o.brick, 0.86), { light: 0.42, sat: 0.95 });
  const br3 = k.ramp(0x7a5a3a, { light: 0.4, sat: 0.85 });
  const gran = k.ramp(o.granite, { light: 0.42, sat: 0.6 });
  const joint = k.ramp(darken(o.brick, 0.45), { light: 0.3 });
  const moss = k.ramp(o.moss ?? 0x3e5a32, { light: 0.35 });
  const water = k.ramp(0x1c2434, { light: 0.4 });
  const R = c.ramp;
  const T = c.tone;
  const BAND = 8;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const bx = x & 127;
      const by = y & 127;
      if (bx < BAND || by < BAND) {
        // Granite setts (8 × 8), joints dark, a lit arris, the odd darker sett.
        const sx = x >> 3;
        const sy = y >> 3;
        const lx = x & 7;
        const ly = y & 7;
        const jt = lx === 0 || ly === 0;
        R[i] = jt ? joint : gran;
        T[i] = jt ? 1 : lx === 1 || ly === 1 ? 4 : hash2(sx, sy, 71) > 0.8 ? 2 : 3;
        continue;
      }
      const X = x >> 2;
      const Y = y >> 2;
      const p = (((X - Y) % 4) + 4) % 4;
      const lx = x & 3;
      const ly = y & 3;
      let jt = false;
      let id = 0;
      let edgeLo = false;
      if (p === 0) {
        jt = lx === 0 || ly === 0;
        id = X * 977 + Y;
        edgeLo = ly === 3;
      } else if (p === 1) {
        jt = ly === 0;
        id = (X - 1) * 977 + Y;
        edgeLo = ly === 3 || lx === 3;
      } else if (p === 3) {
        jt = lx === 0 || ly === 0;
        id = X * 977 + Y;
        edgeLo = lx === 3;
      } else {
        jt = lx === 0;
        id = X * 977 + (Y - 1);
        edgeLo = lx === 3 || ly === 3;
      }
      if (jt) {
        const m = hash2(x >> 1, y >> 1, 5) > 0.93;
        R[i] = m ? moss : joint;
        T[i] = m ? 2 : 3;
        continue;
      }
      const v = hash2(id, 3, 17);
      R[i] = v < 0.2 ? br2 : v > 0.92 ? br3 : br;
      const lit = (p === 0 || p === 3 ? lx === 1 || ly === 1 : p === 1 ? ly === 1 : lx === 1);
      T[i] = lit ? 4 : edgeLo ? 2 : 3;
    }
  }
  // Sunken wet patches: a step darker in broad smooth areas, the sky caught at their far rim.
  // (Sampled per 4 × 4 block: the patch edges follow the brick grain.)
  for (let by = 0; by < H; by += 4) {
    for (let bx = 0; bx < W; bx += 4) {
      if (smooth(bx + 2, by + 2, W, H, 4, 77) >= 0.28) continue;
      for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 4; x++) T[y * W + x] = Math.max(0, T[y * W + x] - 1);
    }
  }
  // Missing bricks (water standing in the hole), grit.
  for (let m = 0; m < 4; m++) {
    const X = rng.int(4, 60);
    const Y = rng.int(4, 60);
    for (let y = Y * 4 + 1; y < Y * 4 + 4; y++) for (let x = X * 4 + 1; x < X * 4 + 8; x++) c.set(x, y, water, y === Y * 4 + 1 ? 3 : 1);
  }
  for (let g = 0; g < 160; g++) c.cluster(rng.int(0, W - 2), rng.int(0, H - 2), rng.int(0, 3), 0, rng.chance(0.6) ? -1 : 1);
}

// ─── Decal sheet ────────────────────────────────────────────────────────────

/** Sub-rect of the decal sheet (texels, canvas rows top-down → converted to tile v by `sub`). */
export interface DecalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Decals on the sheet: name → canvas rect (y down). Every rect starts on a 16-texel cell. */
export const Z1_DECALS = {
  manhole: { x: 0, y: 0, w: 32, h: 32 },
  drain: { x: 32, y: 0, w: 48, h: 16 },
  cellar: { x: 80, y: 0, w: 48, h: 48 },
  puddleA: { x: 128, y: 0, w: 96, h: 48 },
  puddleB: { x: 224, y: 0, w: 64, h: 32 },
  utility: { x: 32, y: 16, w: 16, h: 16 },
  gum: { x: 48, y: 16, w: 16, h: 16 },
  can: { x: 64, y: 16, w: 16, h: 16 },
  oil: { x: 0, y: 48, w: 48, h: 32 },
  pothole: { x: 48, y: 48, w: 48, h: 32 },
  patch: { x: 96, y: 48, w: 64, h: 48 },
  puddleC: { x: 160, y: 48, w: 64, h: 48 },
  blood: { x: 224, y: 32, w: 64, h: 48 },
  paperA: { x: 0, y: 80, w: 16, h: 16 },
  paperB: { x: 16, y: 80, w: 16, h: 16 },
  paperC: { x: 32, y: 80, w: 16, h: 16 },
  leaves: { x: 32, y: 32, w: 48, h: 16 },
  skid: { x: 0, y: 96, w: 128, h: 32 },
  slow: { x: 128, y: 96, w: 64, h: 32 },
  arrow: { x: 192, y: 96, w: 32, h: 32 },
  bloodTrail: { x: 224, y: 80, w: 64, h: 48 },
} as const;

export type Z1DecalName = keyof typeof Z1_DECALS;

/** The ground decal sheet (288 × 128 module). */
export function z1GroundDecals(atlas: PwAtlas): PwTile {
  return atlas.tile('z1decals', 288, 128, (c, k) => paintDecals(c, k));
}

/** `PwBatch.rect` sub-rect (tile texel space, v up) of a decal. */
export function decalSub(t: PwTile, name: Z1DecalName): { x: number; y: number; w: number; h: number } {
  const r = Z1_DECALS[name];
  return { x: r.x, y: t.h - r.y - r.h, w: r.w, h: r.h };
}

function paintDecals(c: PwCanvas, k: PwKit) {
  const rng = k.rng;
  const iron = k.ramp(0x3a3c44, { light: 0.45, sat: 0.8 });
  const rust = k.ramp(0x7a4024, { light: 0.4 });
  const water = k.ramp(0x161e2c, { light: 0.36, sat: 1 });
  const sky = k.ramp(0x4a5a84, { light: 0.35, sat: 0.9 });
  const tar = k.ramp(0x16171c, { light: 0.4 });
  const asphalt = k.ramp(0x2c2f37, { light: 0.36, sat: 0.9 });
  const neonP = k.ramp(0xff3c9a, { light: 0.5 });
  const neonC = k.ramp(0x39e8ff, { light: 0.5 });
  const sodium = k.ramp(0xffa54a, { light: 0.5 });
  const blood = k.ramp(0x5a0808, { light: 0.4, sat: 1.1 });
  const paper = k.ramp(0xb8b2a0, { light: 0.4, sat: 0.6 });
  const ink = k.ramp(0x2a2a30, { light: 0.4 });
  const paint = k.ramp(0xd8d4c8, { light: 0.3, sat: 0.6 });
  const leaf = k.ramp(0x6a5228, { light: 0.4 });
  const oilP = k.ramp(0x7a3a9a, { light: 0.45 });
  const oilT = k.ramp(0x2a8a7a, { light: 0.45 });
  const steel = k.ramp(0x5a5e66, { light: 0.5, sat: 0.6 });
  const R = Z1_DECALS;

  // Manhole: iron disc, a raised grid of bumps, a lettered ring, lit upper-left rim.
  {
    const { x: ox, y: oy } = R.manhole;
    const cx = ox + 15.5;
    const cy = oy + 15.5;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = ox + x + 0.5 - (cx + 0.5);
        const dy = oy + y + 0.5 - (cy + 0.5);
        const d = Math.hypot(dx, dy);
        if (d > 15.6) continue;
        let t = 2;
        if (d > 14.2) t = dx + dy < 0 ? 4 : 1;
        else if (d > 13) t = 1;
        else if (d > 10 && d < 11) t = 1;
        else if (d <= 10) t = (x >> 1) % 2 === (y >> 1) % 2 ? 3 : 2;
        c.set(ox + x, oy + y, iron, t);
      }
    }
    drawText(c, 'SEWER', ox + 7, oy + 3, FONT_3x5, iron, 4);
    drawText(c, '1931', ox + 9, oy + 24, FONT_3x5, iron, 4);
    // Rust bleeding out of the pick holes.
    for (const [x, y] of [[9, 15], [22, 16]]) {
      c.set(ox + x, oy + y, rust, 1);
      c.set(ox + x + 1, oy + y + 1, rust, 2);
    }
  }
  // Storm drain (curb inlet grate): frame, slots, the black drop below.
  {
    const { x: ox, y: oy } = R.drain;
    c.rect(ox, oy + 1, 48, 14, iron, 3);
    c.hline(ox, oy + 1, 48, iron, 4);
    c.hline(ox, oy + 14, 48, iron, 1);
    for (let x = ox + 3; x < ox + 46; x += 4) {
      c.rect(x, oy + 4, 2, 8, tar, 0);
      c.set(x + 2, oy + 4, iron, 4);
    }
    for (let i = 0; i < 6; i++) c.set(ox + rng.int(2, 45), oy + rng.int(3, 12), rust, 2);
    // Leaves caught in it.
    for (let i = 0; i < 4; i++) c.cluster(ox + rng.int(2, 42), oy + rng.int(3, 10), rng.int(0, 4), leaf, 3);
  }
  // Cellar hatch (steel double doors flush in the sidewalk): diamond plate, hinges, padlock.
  {
    const { x: ox, y: oy } = R.cellar;
    c.rect(ox, oy, 48, 48, steel, 2);
    c.frame(ox, oy, 48, 48, steel, 1);
    c.hline(ox, oy, 48, steel, 4);
    for (let y = oy + 2; y < oy + 46; y++) {
      for (let x = ox + 2; x < ox + 46; x++) {
        if (x === ox + 23 || x === ox + 24) {
          c.set(x, y, steel, x === ox + 23 ? 0 : 3);
          continue;
        }
        const d = ((x - ox) + (y - oy) * 2) % 6;
        const e = ((x - ox) - (y - oy) * 2 + 600) % 6;
        c.set(x, y, steel, d === 0 || e === 0 ? 3 : 2);
      }
    }
    for (const hy of [oy + 8, oy + 38]) {
      c.rect(ox + 3, hy, 8, 3, steel, 3);
      c.rect(ox + 37, hy, 8, 3, steel, 3);
    }
    c.rect(ox + 21, oy + 22, 6, 5, k.ramp(0xb08a3a, { light: 0.45 }), 3);
    for (let i = 0; i < 14; i++) c.tint(ox + rng.int(2, 45), oy + rng.int(30, 45), rust, -1);
  }
  // Puddles: dark mirrors with the sky on the far rim, reflected neon / sodium lights (GLOW), rain rings.
  const puddle = (ox: number, oy: number, w: number, h: number, seed: number, lights: number[]) => {
    const cx = ox + w / 2;
    const cy = oy + h / 2;
    const rx = w / 2 - 1;
    const ry = h / 2 - 1;
    for (let y = oy; y < oy + h; y++) {
      for (let x = ox; x < ox + w; x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        const d = u * u + v * v + (smooth(x - ox, y - oy, 64, 64, 4, seed) - 0.5) * 0.9;
        if (d > 1) continue;
        // Far rim (top) catches the sky, the near lip is wet dark asphalt; the body mirrors the night
        // sky (lighter than the road, as a puddle reads at night) with a darker band where a facade is reflected.
        if (d > 0.82) c.set(x, y, v < 0 ? sky : asphalt, v < 0 ? 3 : 1);
        else if (v > 0.25) c.set(x, y, water, 2);
        else c.set(x, y, sky, Math.abs(v + 0.35) < 0.14 ? 2 : 1);
      }
    }
    // Reflected lights: short vertical dashes (GLOW) stretched toward the viewer.
    lights.forEach((rmp, i) => {
      const lx = Math.round(ox + w * (0.25 + 0.5 * hash2(i, seed, 3)));
      const ly = Math.round(oy + h * 0.35);
      for (let j = 0; j < Math.round(h * 0.45); j++) {
        if (j > 2 && (j & 1)) continue;
        const x = lx + (j > 4 && hash2(i, j, seed) > 0.6 ? 1 : 0);
        const y = ly + j;
        if (c.at(x, y) === water || c.at(x, y) === sky) c.set(x, y, rmp, j < 2 ? 4 : 3, PWF.GLOW);
      }
    });
    // Rain rings: 3-texel arcs.
    for (let i = 0; i < Math.round((w * h) / 400); i++) {
      const x = ox + rng.int(4, w - 6);
      const y = oy + rng.int(3, h - 4);
      if (c.at(x, y) !== water && c.at(x, y) !== sky) continue;
      c.set(x, y, sky, 3);
      c.set(x + 1, y - 1, sky, 3);
      c.set(x + 2, y, sky, 3);
    }
  };
  puddle(R.puddleA.x, R.puddleA.y, R.puddleA.w, R.puddleA.h, 5, [neonP, sodium]);
  puddle(R.puddleB.x, R.puddleB.y, R.puddleB.w, R.puddleB.h, 7, [neonC]);
  puddle(R.puddleC.x, R.puddleC.y, R.puddleC.w, R.puddleC.h, 9, [sodium]);
  // Utility cover (small square iron lid), gum blots, a crushed can.
  {
    const { x: ox, y: oy } = R.utility;
    c.rect(ox + 1, oy + 1, 14, 14, iron, 3);
    c.frame(ox + 1, oy + 1, 14, 14, iron, 1);
    c.hline(ox + 1, oy + 1, 14, iron, 4);
    drawText(c, 'W', ox + 6, oy + 5, FONT_3x5, iron, 4);
    const g = R.gum;
    for (let i = 0; i < 5; i++) c.cluster(g.x + rng.int(1, 12), g.y + rng.int(1, 12), rng.int(0, 6), tar, 2);
    const cn = R.can;
    c.rect(cn.x + 3, cn.y + 5, 9, 5, k.ramp(0xb02a2a, { light: 0.5 }), 3);
    c.hline(cn.x + 3, cn.y + 5, 9, steel, 4);
    c.vline(cn.x + 11, cn.y + 5, 5, steel, 3);
    c.set(cn.x + 6, cn.y + 7, paint, 4);
  }
  // Oil stain with a rainbow rim (wet oil sheen).
  {
    const { x: ox, y: oy, w, h } = R.oil;
    const cx = ox + w / 2;
    const cy = oy + h / 2;
    for (let y = oy; y < oy + h; y++) {
      for (let x = ox; x < ox + w; x++) {
        const u = (x + 0.5 - cx) / (w / 2 - 1);
        const v = (y + 0.5 - cy) / (h / 2 - 1);
        const d = u * u + v * v + (hash2(x >> 1, y >> 1, 21) - 0.5) * 0.35;
        if (d > 1) continue;
        if (d > 0.86) c.set(x, y, (x + y) % 3 === 0 ? oilP : oilT, 1);
        else if (d < 0.3) c.set(x, y, tar, 2);
        else c.set(x, y, asphalt, 1);
      }
    }
  }
  // Pothole: broken asphalt lip (lit far edge, dark near wall), muddy water inside.
  {
    const { x: ox, y: oy, w, h } = R.pothole;
    const cx = ox + w / 2;
    const cy = oy + h / 2;
    for (let y = oy; y < oy + h; y++) {
      for (let x = ox; x < ox + w; x++) {
        const u = (x + 0.5 - cx) / (w / 2 - 1);
        const v = (y + 0.5 - cy) / (h / 2 - 1);
        const d = u * u + v * v + (hash2(x >> 1, y >> 1, 31) - 0.5) * 0.5;
        if (d > 1) continue;
        if (d > 0.72) c.set(x, y, asphalt, v < 0 ? 1 : 4);
        else c.set(x, y, water, v < -0.3 ? 2 : 1);
      }
    }
    for (let i = 0; i < 8; i++) c.cluster(ox + rng.int(2, w - 4), oy + rng.int(2, h - 4), rng.int(0, 3), asphalt, 3);
  }
  // Tar patch (newer, darker asphalt with a sealed seam).
  {
    const { x: ox, y: oy, w, h } = R.patch;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const j = hash2(x >> 2, y >> 2, 41) * 3;
        if (x < j || y < j || x > w - 1 - j || y > h - 1 - j) continue;
        const edge = x < j + 1 || y < j + 1 || x > w - 2 - j || y > h - 2 - j;
        c.set(ox + x, oy + y, edge ? tar : asphalt, edge ? 1 : hash2(x, y, 43) > 0.93 ? 3 : 2);
      }
    }
  }
  // Skid marks: two rubber streaks curving in, fading at the start.
  {
    const { x: ox, y: oy, w } = R.skid;
    for (const off of [7, 23]) {
      for (let x = 0; x < w; x++) {
        const t = x / w;
        const y = Math.round(oy + off + Math.sin(t * 2.2) * 3);
        for (let j = 0; j < 4; j++) {
          // Solid rubber, breaking up only where the tyre first bit (the start fades in).
          if (t < 0.3 && hash2(ox + x, y + j, 51) < (0.3 - t) * 3) continue;
          if ((j === 0 || j === 3) && hash2(ox + x, j, 52) < 0.25) continue;
          c.set(ox + x, y + j, tar, j === 0 || j === 3 ? 1 : 0);
        }
      }
    }
  }
  // Blood pool with spatter, and a drag trail.
  {
    const { x: ox, y: oy, w, h } = R.blood;
    const cx = ox + w * 0.45;
    const cy = oy + h * 0.5;
    for (let y = oy; y < oy + h; y++) {
      for (let x = ox; x < ox + w; x++) {
        const u = (x + 0.5 - cx) / (w * 0.32);
        const v = (y + 0.5 - cy) / (h * 0.3);
        const d = u * u + v * v + (smooth(x - ox, y - oy, 64, 48, 4, 3) - 0.5) * 1.1;
        if (d > 1) continue;
        c.set(x, y, blood, d > 0.8 ? 1 : d < 0.25 && v < 0 ? 3 : 2);
      }
    }
    // Wet highlight and spatter drops.
    c.hline(Math.round(cx - 6), Math.round(cy - 6), 4, blood, 4);
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = rng.range(w * 0.32, w * 0.48);
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * (h / w));
      if (x > ox && y > oy && x < ox + w - 2 && y < oy + h - 2) c.cluster(x, y, rng.int(0, 3), blood, 2);
    }
    const t = R.bloodTrail;
    let yy = t.y + 30;
    for (let x = t.x + 2; x < t.x + t.w - 2; x++) {
      yy += rng.int(-1, 1);
      yy = Math.max(t.y + 18, Math.min(t.y + 38, yy));
      const ww = Math.max(1, Math.round(5 * (1 - (x - t.x) / 70)));
      for (let j = -ww; j <= ww; j++) if (hash2(x, j, 3) > 0.2) c.set(x, yy + j, blood, Math.abs(j) === ww ? 1 : 2);
    }
    // A hand print where someone was dragged.
    const hx = t.x + 14;
    const hy = t.y + 8;
    c.ellipse(hx, hy + 4, 3, 2.5, blood, 2);
    for (let f = 0; f < 4; f++) c.vline(hx - 3 + f * 2, hy - 1, 3, blood, 2);
  }
  // Litter: a folded newspaper, a flyer, a coffee cup.
  {
    const a = R.paperA;
    c.rect(a.x + 1, a.y + 3, 14, 10, paper, 3);
    c.hline(a.x + 1, a.y + 3, 14, paper, 4);
    c.vline(a.x + 8, a.y + 3, 10, paper, 2);
    for (let l = 0; l < 4; l++) c.hline(a.x + 2, a.y + 5 + l * 2, 5, ink, 2);
    drawText(c, 'Z', a.x + 10, a.y + 5, FONT_3x5, ink, 1);
    const b = R.paperB;
    c.poly([b.x + 2, b.y + 4, b.x + 13, b.y + 2, b.x + 14, b.y + 12, b.x + 3, b.y + 14], k.ramp(0xd8c048, { light: 0.4 }), 3);
    c.hline(b.x + 5, b.y + 7, 6, ink, 2);
    const cc = R.paperC;
    c.rect(cc.x + 4, cc.y + 6, 8, 5, paint, 3);
    c.vline(cc.x + 4, cc.y + 6, 5, paint, 4);
    c.rect(cc.x + 11, cc.y + 6, 2, 5, k.ramp(0xb02a2a, { light: 0.4 }), 3);
    const lv = R.leaves;
    for (let i = 0; i < 14; i++) c.cluster(lv.x + rng.int(1, 45), lv.y + rng.int(1, 13), rng.int(0, 6), leaf, rng.chance(0.5) ? 3 : 2);
  }
  // Road lettering: SLOW, and a turn arrow (worn paint).
  {
    const s = R.slow;
    drawText(c, 'SLOW', s.x + 4, s.y + 6, FONT_BOLD, paint, 3, { scale: 2 });
    for (let i = 0; i < 40; i++) {
      const x = s.x + rng.int(0, s.w - 1);
      const y = s.y + rng.int(0, s.h - 1);
      if (c.at(x, y) === paint) c.ramp[y * c.w + x] = 0;
    }
    const a = R.arrow;
    c.rect(a.x + 13, a.y + 12, 6, 18, paint, 3);
    c.poly([a.x + 6, a.y + 13, a.x + 16, a.y + 2, a.x + 26, a.y + 13], paint, 3);
    for (let i = 0; i < 18; i++) {
      const x = a.x + rng.int(0, a.w - 1);
      const y = a.y + rng.int(0, a.h - 1);
      if (c.at(x, y) === paint) c.ramp[y * c.w + x] = 0;
    }
  }
}
