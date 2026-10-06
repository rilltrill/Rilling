import { PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2 } from './surfaces';
import { dith, fill, h6, wander, wcluster, wrapI, wscatter, wset, wshift } from './z3kit';

/**
 * HIGHWAY TO HELL (z3) road painters for ART: PIXEL WORLD — the interstate as
 * a 90s arcade background artist would paint it (Beast Busters / Final Fight
 * streets, Duke 3D's freeways): designed features, never speckle.
 *  - LANES (wrap 128 × 512 = 4 × 16 m, one per lane with its own offset):
 *    sun-bleached asphalt with the two tyre-polished wheel paths, the oil-drip
 *    streak down the middle, glossy black tar-snake crack seals wandering
 *    across, saw-cut patches, sparse aggregate chips;
 *  - SHOULDER / MEDIAN: pale dusty asphalt, the rumble strip's milled grooves,
 *    blown sand and gravel at the edge, weeds in the cracks, litter;
 *  - LINES (cut-out ribbons): worn thermoplastic paint, chipped edges, tyre
 *    grime, glass-bead glints; dashes 3 m on, 7 m off;
 *  - DECALS (laid by rule, never in the repeat): skid marks, oil stains, the
 *    scorch under a burnt wreck, glass, blood smears and pools, potholes,
 *    alligator-cracked patches;
 *  - SCRUB: the dry dusk verge either side (cracked earth, tufts, pebbles).
 */

export interface Z3RoadPalette {
  asphalt: number;
  polish: number;
  old: number;
  tar: number;
  oil: number;
  shoulder: number;
  dust: number;
  white: number;
  yellow: number;
}

export const Z3_ROAD: Z3RoadPalette = {
  asphalt: 0x4c4854,
  polish: 0x58525c,
  old: 0x433f4a,
  tar: 0x1e1b22,
  oil: 0x2a2630,
  shoulder: 0x55505a,
  dust: 0x6e6058,
  white: 0xd8d2c4,
  yellow: 0xd8a428,
};

/** Lane tile: two lane variants side by side (u 0…128 our lanes, 128…256 the oncoming ones; 4 m each, a 3.7–3.8 m lane uses the left part), 8 m along. */
export const LANE_W = 128;
export const LANE_H = 256;

/** The interstate's lanes (one wrap tile: both variants side by side; a ribbon picks one with `u0`). */
export function z3LaneTile(atlas: PwAtlas, p: Z3RoadPalette = Z3_ROAD): PwTile {
  return atlas.tile(`z3lanes|${h6(p.asphalt)}`, LANE_W * 2, LANE_H, (c, k) => {
    for (const v of [0, 1]) {
      const sub = new PwCanvas(LANE_W, LANE_H);
      paintLane(sub, k, v, p);
      c.blit(sub, v * LANE_W, 0);
    }
  }, { wrap: true });
}

function paintLane(c: PwCanvas, k: PwKit, variant: number, p: Z3RoadPalette) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const A = k.ramp(p.asphalt, { light: 0.45, dark: 0.45, sat: 0.9 });
  const P = k.ramp(p.polish, { light: 0.45, dark: 0.45, sat: 0.8 });
  const O = k.ramp(p.old, { light: 0.4, dark: 0.45, sat: 0.9 });
  const T = k.ramp(p.tar, { light: 0.55, dark: 0.6, sat: 1.1 });
  const OIL = k.ramp(p.oil, { light: 0.5, sat: 1.2 });
  fill(c, A, 3);
  const R = c.ramp;
  const TN = c.tone;
  // Large irregular areas of older, rougher asphalt (blocky blobs 8×8 with ragged rims).
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const v = hash2(x >> 4, y >> 5, 11 + variant) * 0.6 + hash2((x + 8) >> 4, (y + 16) >> 5, 12 + variant) * 0.4 + hash2(x >> 1, y >> 1, 13) * 0.12;
      if (v <= 0.78) continue;
      const i = y * W + x;
      R[i] = R[i + 1] = R[i + W] = R[i + W + 1] = O;
    }
  }
  // Wheel paths: two polished bands (ragged edges), the lane's middle stripe of oil drips.
  const lane = 119;
  const paths = [Math.round(lane * 0.24), Math.round(lane * 0.76)];
  for (let y = 0; y < H; y++) {
    for (const cx of paths) {
      const half = 9 + Math.round(hash2(y >> 3, cx, 21) * 2);
      const off = Math.round(Math.sin(y * 0.021 + cx) * 1.5);
      for (let x = cx - half + off; x <= cx + half + off; x++) {
        const edge = Math.abs(x - cx - off) > half - 2;
        if (edge && hash2(x, y >> 1, 22) > 0.5) continue;
        const i = y * W + wrapI(x, W);
        R[i] = P;
        TN[i] = 3;
      }
    }
  }
  // Oil drips down the lane centre: elongated blotches in two dark steps.
  const mid = Math.round(lane / 2);
  for (let i = 0; i < 14; i++) {
    const y0 = rng.int(0, H - 1);
    const len = rng.int(6, 22);
    const wdt = rng.int(2, 5);
    const x0 = mid + rng.int(-6, 6);
    for (let y = 0; y < len; y++) {
      const ww = Math.round(wdt * Math.sin(((y + 0.5) / len) * Math.PI));
      for (let x = -ww; x <= ww; x++) {
        const core = Math.abs(x) < ww - 1 && y > 1 && y < len - 2;
        wset(c, x0 + x, y0 + y, OIL, core ? 2 : 3);
      }
    }
  }
  // Aggregate: sparse light chips (polished paths fewer) and dark pits.
  wscatter(c, rng, 0, 0, W, H, 260, 0, 1, { shapes: 3, only: A });
  wscatter(c, rng, 0, 0, W, H, 130, 0, 1, { shapes: 3, only: O });
  wscatter(c, rng, 0, 0, W, H, 70, 0, 1, { shapes: 2, only: P });
  wscatter(c, rng, 0, 0, W, H, 210, 0, -1, { shapes: 3 });
  // A saw-cut patch (straight edges, tar seal round it), darker newer asphalt.
  {
    const pw = rng.int(34, 70);
    const ph = rng.int(50, 110);
    const x0 = rng.int(4, lane - pw - 4);
    const y0 = rng.int(0, H - 1);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const edge = x === 0 || y === 0 || x === pw - 1 || y === ph - 1;
        wset(c, x0 + x, y0 + y, edge ? T : O, edge ? 1 : hash2(x >> 1, y >> 1, 31) > 0.86 ? 2 : 3);
      }
    }
    wscatter(c, rng, x0 + 1, y0 + 1, pw - 2, ph - 2, Math.round((pw * ph) / 60), 0, 1, { shapes: 2 });
    // Its seal has a lit top lip (a raised bead of tar).
    for (let x = 1; x < pw - 1; x++) wshift(c, x0 + x, y0 - 1, 0.8);
  }
  // Tar snakes: glossy crack seals meandering across the lane (they catch the dusk sky).
  const nSnake = variant === 0 ? 5 : 4;
  for (let i = 0; i < nSnake; i++) {
    const y = rng.int(0, H - 1);
    const fromLeft = rng.chance(0.5);
    const len = rng.int(50, 130);
    const [ex, ey] = wander(c, rng, fromLeft ? rng.int(-6, 20) : rng.int(lane - 20, lane + 6), y, len, fromLeft ? rng.spread(0.35) : Math.PI + rng.spread(0.35), T, 1, {
      width: rng.chance(0.6) ? 2 : 1,
      jitter: 0.55,
      glint: 0.18,
      lip: 0.6,
    });
    // A branch or two (the crack forked before it was sealed).
    if (rng.chance(0.6)) wander(c, rng, ex, ey, rng.int(10, 30), rng.chance(0.5) ? 1.2 : -1.2, T, 1, { jitter: 0.6, lip: 0.6 });
  }
  // A long longitudinal joint crack (unsealed: a dark line with a lit lip).
  {
    const x = rng.chance(0.5) ? rng.int(2, 6) : rng.int(lane - 6, lane - 2);
    const y = rng.int(0, H - 1);
    let xx = x;
    const len = rng.int(80, 200);
    for (let j = 0; j < len; j++) {
      wshift(c, xx, y + j, -1.4);
      wshift(c, xx + 1, y + j, 0.5);
      if (rng.chance(0.07)) xx += rng.chance(0.5) ? 1 : -1;
    }
  }
}

/** Shoulder (wrap 96 × 256 = 3 × 8 m): `rumble` grooves on the side next to the lane (left / right edge). */
export function z3ShoulderTile(atlas: PwAtlas, side: 'left' | 'right', p: Z3RoadPalette = Z3_ROAD): PwTile {
  return atlas.tile(`z3shoulder|${side}|${h6(p.shoulder)}`, 96, 256, (c, k) => paintShoulder(c, k, side, p), { wrap: true });
}

function paintShoulder(c: PwCanvas, k: PwKit, side: 'left' | 'right', p: Z3RoadPalette) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const S = k.ramp(p.shoulder, { light: 0.45, dark: 0.45, sat: 0.8 });
  const Du = k.ramp(p.dust, { light: 0.45, sat: 0.8 });
  const T = k.ramp(p.tar, { light: 0.55, dark: 0.6 });
  const weed = k.ramp(0x6a6a34, { light: 0.4 });
  const glass = k.ramp(0x9ab8c8, { light: 0.5 });
  const tread = k.ramp(0x222024, { light: 0.4 });
  fill(c, S, 3);
  // The lane edge is at x = 0 (left) or x = W (right): grooves 2 m long rows near it, sand drifts away from it.
  const nearX = (d: number) => (side === 'left' ? d : W - 1 - d);
  for (let y = 0; y < H; y += 10) {
    for (let d = 8; d < 30; d++) {
      const x = nearX(d);
      wset(c, x, y, S, 1);
      wset(c, x, y + 1, S, 1.5);
      wset(c, x, y + 2, S, 4);
    }
  }
  // Blown sand and grit thickening toward the outer edge (dithered rim, clusters).
  for (let y = 0; y < H; y++) {
    const reach = 18 + Math.round(8 * Math.sin(y * 0.05) + 5 * Math.sin(y * 0.17 + 1));
    for (let d = 0; d < reach; d++) {
      const x = nearX(W - 1 - d);
      const t = 1 - d / reach;
      if (!dith(x, y, t * 1.3)) continue;
      wset(c, x, y, Du, d < reach * 0.4 ? 3 : 2);
    }
  }
  wscatter(c, rng, 0, 0, W, H, 300, 0, 1, { shapes: 3 });
  wscatter(c, rng, 0, 0, W, H, 260, 0, -1, { shapes: 3 });
  // Cracks with weeds pushing through near the outer edge.
  for (let i = 0; i < 5; i++) {
    const y = rng.int(0, H - 1);
    const x0 = nearX(W - 1 - rng.int(4, 30));
    wander(c, rng, x0, y, rng.int(18, 40), side === 'left' ? Math.PI + rng.spread(0.6) : rng.spread(0.6), T, 1, { jitter: 0.7, lip: 0.5 });
    for (let j = 0; j < 3; j++) {
      const wx = x0 + rng.int(-3, 3);
      const wy = y + rng.int(-2, 2);
      wset(c, wx, wy, weed, 3);
      wset(c, wx, wy - 1, weed, 4);
      wset(c, wx + 1, wy, weed, 2);
    }
  }
  // Debris: a shredded tyre tread, glass glints.
  {
    const x = nearX(rng.int(34, 60));
    const y = rng.int(0, H - 1);
    for (let j = 0; j < 22; j++) {
      const xx = x + Math.round(Math.sin(j * 0.4) * 3);
      wset(c, xx, y + j, tread, j % 3 === 0 ? 2 : 1);
      wset(c, xx + 1, y + j, tread, 1);
    }
  }
  for (let i = 0; i < 14; i++) wcluster(c, rng.int(0, W - 1), rng.int(0, H - 1), rng.int(0, 2), glass, rng.chance(0.4) ? 5 : 3);
}

/** The median strip between the barriers' feet (wrap 96 × 256): dusty, littered, darker in the barrier's shadow at `shadowX`. */
export function z3MedianTile(atlas: PwAtlas, p: Z3RoadPalette = Z3_ROAD): PwTile {
  return atlas.tile(`z3median|${h6(p.shoulder)}`, 96, 256, (c, k) => {
    const rng = k.rng;
    const W = c.w;
    const H = c.h;
    const S = k.ramp(p.shoulder, { light: 0.45, dark: 0.45, sat: 0.8 });
    const Du = k.ramp(p.dust, { light: 0.45, sat: 0.8 });
    const litter = [k.ramp(0xc8c0a8, { light: 0.4 }), k.ramp(0x8a3a2a, { light: 0.4 }), k.ramp(0x3a5a8a, { light: 0.4 })];
    fill(c, S, 3);
    // Sand banked against both sides of the barrier (x 38…64 is under it).
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = x < 38 ? 38 - x : x > 64 ? x - 64 : 0;
        const reach = 14 + 5 * Math.sin(y * 0.07 + (x < 38 ? 0 : 2));
        if (d > reach) continue;
        const t = 1 - d / reach;
        if (!dith(x, y, t * 1.2)) continue;
        wset(c, x, y, Du, d < 4 ? 2 : 3);
      }
    }
    wscatter(c, rng, 0, 0, W, H, 220, 0, 1, { shapes: 3 });
    wscatter(c, rng, 0, 0, W, H, 200, 0, -1, { shapes: 3 });
    // Litter blown against the barrier: cans, wrappers, paper.
    for (let i = 0; i < 16; i++) {
      const x = rng.chance(0.5) ? rng.int(28, 37) : rng.int(65, 74);
      const y = rng.int(0, H - 1);
      const r = rng.pick(litter);
      wset(c, x, y, r, 3);
      wset(c, x + 1, y, r, 4);
      if (rng.chance(0.5)) wset(c, x, y + 1, r, 2);
    }
  }, { wrap: true });
}

export type LineKind = 'dash' | 'white' | 'yellow';

/** Painted line ribbons (cut out round the paint): 16 texels across (0.5 m), the line 5 texels in the middle. */
export function z3LineTile(atlas: PwAtlas, kind: LineKind, p: Z3RoadPalette = Z3_ROAD): PwTile {
  const H = kind === 'dash' ? 320 : 128;
  return atlas.tile(`z3line|${kind}|${h6(kind === 'yellow' ? p.yellow : p.white)}`, 16, H, (c, k) => {
    const rng = k.rng;
    const col = k.ramp(kind === 'yellow' ? p.yellow : p.white, { light: 0.35, dark: 0.5, sat: 0.9 });
    const grime = k.ramp(0x6a6460, { light: 0.4 });
    const x0 = 5;
    const lw = 5;
    for (let y = 0; y < H; y++) {
      // Dash: on for 3 m centred on the tile's ends (rows 0…47 and H-48…H-1), off between.
      if (kind === 'dash' && y >= 48 && y < H - 48) continue;
      const end = kind === 'dash' ? Math.min(Math.abs(y - 47.5), Math.abs(y - (H - 48.5))) : 99;
      for (let x = x0; x < x0 + lw; x++) {
        // Chipped edges (more near the dash ends), flakes missing inside now and then.
        const edge = x === x0 || x === x0 + lw - 1;
        const h = hash2(x, y >> 1, 3);
        if (edge && h > 0.72) continue;
        if (end < 3 && hash2(x, y, 4) > 0.5) continue;
        if (!edge && hash2(x >> 1, y >> 2, 5) > 0.95) continue;
        c.set(x, y, col, x === x0 ? 2.6 : 3);
      }
    }
    // Tyre grime smudges and glass-bead glints.
    for (let i = 0; i < Math.round(H / 24); i++) {
      const y = rng.int(0, H - 1);
      for (let j = 0; j < rng.int(3, 8); j++) for (let x = x0; x < x0 + lw; x++) if (c.at(x, y + j) && hash2(x, y + j, 7) > 0.35) c.tint(x, y + j, grime, -0.5);
    }
    for (let i = 0; i < Math.round(H / 6); i++) {
      const x = x0 + rng.int(0, lw - 1);
      const y = rng.int(0, H - 1);
      if (c.at(x, y) === col) c.set(x, y, col, 5);
    }
  }, { wrap: true });
}

// ─── Road decals (cut-out modules laid flat on the asphalt) ──────────────────

/** Paired skid marks (`curve` bends them): 40 × 192 (1.25 × 6 m). */
export function z3SkidDecal(atlas: PwAtlas, variant: number): PwTile {
  return atlas.tile(`z3skid|${variant}`, 40, 192, (c, k) => {
    const rng = k.rng;
    const r = k.ramp(0x1c1a20, { light: 0.4 });
    const bend = (variant - 0.5) * 14;
    for (const off of [6, 30]) {
      for (let y = 4; y < 188; y++) {
        const t = y / 192;
        const x = off + Math.round(bend * t * t);
        const fade = t < 0.2 ? t / 0.2 : 1;
        for (let j = 0; j < 4; j++) {
          if (!dith(x + j, y, fade * (j === 0 || j === 3 ? 0.55 : 1))) continue;
          c.set(x + j, y, r, j === 1 ? 1 : 2);
        }
      }
    }
    void rng;
  });
}

/** An oil / fuel stain with an iridescent rim: 64 × 48. */
export function z3OilDecal(atlas: PwAtlas, variant: number): PwTile {
  return atlas.tile(`z3oil|${variant}`, 64, 48, (c, k) => {
    const oil = k.ramp(0x221e28, { light: 0.6, sat: 1.4 });
    const rim = k.ramp(0x4a3a6a, { light: 0.6, sat: 1.4 });
    const sheen = k.ramp(0x6a5a3a, { light: 0.6, sat: 1.3 });
    const rx = 28;
    const ry = 18;
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 64; x++) {
        const u = (x - 32) / rx;
        const v = (y - 24) / ry;
        const n = hash2(x >> 2, y >> 2, 40 + variant) * 0.35 + hash2(x >> 3, y >> 3, 41 + variant) * 0.3;
        const d = u * u + v * v + n - 0.3;
        if (d > 1) continue;
        if (d > 0.82) c.set(x, y, rim, 3);
        else if (d > 0.7 && hash2(x, y, 42) > 0.5) c.set(x, y, sheen, 3);
        else c.set(x, y, oil, d < 0.3 ? 1 : 2);
      }
    }
    // Drips trailing off it.
    for (let i = 0; i < 4; i++) {
      const x = 10 + i * 13 + (variant % 3);
      for (let y = 0; y < 6; y++) if (!c.at(x, 40 + y)) c.set(x, 40 + y, oil, 2);
    }
  });
}

/** The scorch under a burnt-out wreck (soot, melted tyre rings, charred debris): 96 × 128 (3 × 4 m). */
export function z3ScorchDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z3scorch', 96, 128, (c, k) => {
    const rng = k.rng;
    const soot = k.ramp(0x1a1618, { light: 0.4 });
    const ash = k.ramp(0x6a625e, { light: 0.4 });
    const rust = k.ramp(0x6a3a22, { light: 0.4 });
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 96; x++) {
        const u = (x - 48) / 46;
        const v = (y - 64) / 62;
        const n = hash2(x >> 2, y >> 2, 51) * 0.4 + hash2(x >> 3, y >> 3, 52) * 0.3;
        const d = u * u + v * v + n - 0.35;
        if (d > 1) continue;
        if (d > 0.75 && !dith(x, y, (1 - d) * 4)) continue;
        c.set(x, y, soot, d < 0.4 ? 1 : 2);
      }
    }
    // Melted-tyre rings at the four wheels, ash and rust flakes.
    for (const [wx, wy] of [[22, 30], [74, 30], [22, 98], [74, 98]]) {
      for (let a = 0; a < 24; a++) {
        const t = (a / 24) * Math.PI * 2;
        c.set(wx + Math.round(Math.cos(t) * 6), wy + Math.round(Math.sin(t) * 9), soot, 0);
      }
    }
    for (let i = 0; i < 40; i++) c.cluster(rng.int(10, 86), rng.int(10, 118), rng.int(0, 5), rng.chance(0.6) ? ash : rust, rng.chance(0.5) ? 3 : 2);
  });
}

/** Blood: a pool with spatter, or a drag smear (`kind` 0 / 1): 64 × 64 / 48 × 128. */
export function z3BloodDecal(atlas: PwAtlas, kind: number): PwTile {
  const W = kind === 0 ? 64 : 48;
  const H = kind === 0 ? 64 : 128;
  return atlas.tile(`z3blood|${kind}`, W, H, (c, k) => {
    const rng = k.rng;
    const b = k.ramp(0x6a0c0a, { light: 0.4, sat: 1.1 });
    if (kind === 0) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const u = (x - 30) / 20;
          const v = (y - 34) / 15;
          const d = u * u + v * v + hash2(x >> 2, y >> 2, 61) * 0.5 - 0.2;
          if (d > 1) continue;
          c.set(x, y, b, d < 0.5 ? 2 : 3);
        }
      }
      for (let i = 0; i < 26; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(20, 30);
        c.cluster(32 + Math.round(Math.cos(a) * r), 32 + Math.round(Math.sin(a) * r * 0.9), rng.int(0, 4), b, 3);
      }
      // Glossy highlight.
      c.set(26, 30, b, 5);
      c.set(27, 30, b, 4);
    } else {
      // Drag smear: streaks along the length thinning out, hand-print smudges.
      for (let y = 0; y < H; y++) {
        const t = y / H;
        const wdt = 18 * (1 - t * 0.7);
        for (let x = 0; x < W; x++) {
          const u = Math.abs(x - 24 - Math.sin(t * 5) * 4) / wdt;
          if (u > 1) continue;
          const streak = hash2(x, 0, 62) > 0.3;
          if (!streak && hash2(x, y >> 3, 63) > 0.4) continue;
          if (t > 0.6 && !dith(x, y, (1 - t) * 2.5)) continue;
          c.set(x, y, b, streak ? 2 : 3);
        }
      }
    }
  });
}

/** Glass and car debris (crumbs of windscreen, a bumper strip, lamp shards): 64 × 48. */
export function z3DebrisDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z3debris', 64, 48, (c, k) => {
    const rng = k.rng;
    const glass = k.ramp(0x9ab8c8, { light: 0.5 });
    const chrome = k.ramp(0x8a8c92, { light: 0.55 });
    const red = k.ramp(0xb02018, { light: 0.4 });
    const black = k.ramp(0x1c1c20, { light: 0.4 });
    for (let i = 0; i < 70; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.pow(rng.next(), 0.7) * 26;
      const x = 32 + Math.round(Math.cos(a) * r);
      const y = 24 + Math.round(Math.sin(a) * r * 0.75);
      c.set(x, y, glass, rng.chance(0.3) ? 5 : 3);
    }
    for (let x = 10; x < 34; x++) c.set(x, 12 + (x >> 3), black, 2);
    for (let x = 10; x < 34; x++) c.set(x, 13 + (x >> 3), chrome, 4);
    for (let i = 0; i < 6; i++) c.cluster(rng.int(36, 56), rng.int(26, 40), rng.int(0, 4), red, 3);
  });
}

/** A pothole with a dusk-lit puddle: 48 × 40. */
export function z3PotholeDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z3pothole', 48, 40, (c, k) => {
    const rim = k.ramp(0x3a3640, { light: 0.4 });
    const pit = k.ramp(0x241f28, { light: 0.4 });
    const sky = k.ramp(0xb06a5a, { light: 0.5 });
    const crumb = k.ramp(0x5a5460, { light: 0.4 });
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 48; x++) {
        const u = (x - 24) / 20;
        const v = (y - 20) / 15;
        const d = u * u + v * v + hash2(x >> 2, y >> 2, 71) * 0.3;
        if (d > 1.05) continue;
        if (d > 0.8) c.set(x, y, crumb, hash2(x, y, 72) > 0.5 ? 4 : 2);
        else if (d > 0.6) c.set(x, y, v < 0 ? pit : rim, v < 0 ? 1 : 3);
        else c.set(x, y, v < -0.1 ? pit : sky, v < -0.1 ? 1 : 2 + (u < -0.2 && v < 0.2 ? 1 : 0));
      }
    }
  });
}

// ─── Ground ────────────────────────────────────────────────────────────────

/** Dry dusk scrubland (wrap 256 × 256 = 8 m): cracked earth plates, dead grass tufts, pebbles, a tyre rut. */
export function z3ScrubTile(atlas: PwAtlas, o: { hex: number; grass: number }): PwTile {
  return atlas.tile(`z3scrub|${h6(o.hex)}|${h6(o.grass)}`, 256, 256, (c, k) => {
    const rng = k.rng;
    const W = c.w;
    const H = c.h;
    const E = k.ramp(o.hex, { light: 0.45, dark: 0.45, sat: 0.9 });
    const E2 = k.ramp(0x4a3e34, { light: 0.4, sat: 0.9 });
    const Gr = k.ramp(o.grass, { light: 0.5, sat: 0.9 });
    const St = k.ramp(0x7a7068, { light: 0.5 });
    fill(c, E, 3);
    const R = c.ramp;
    const TN = c.tone;
    // Darker earth in broad patches.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = hash2(x >> 5, y >> 5, 81) * 0.55 + hash2((x + 16) >> 5, (y + 16) >> 5, 82) * 0.45 + hash2(x >> 1, y >> 1, 83) * 0.1;
        if (v > 0.66) {
          const i = y * W + x;
          R[i] = E2;
          TN[i] = 3;
        }
      }
    }
    // Cracked earth: short dark crack walks (shifts of what is there).
    for (let i = 0; i < 60; i++) {
      let x = rng.int(0, W - 1);
      let y = rng.int(0, H - 1);
      let a = rng.next() * Math.PI * 2;
      for (let j = 0; j < rng.int(6, 14); j++) {
        wshift(c, x, y, -1.2);
        a += rng.spread(0.9);
        x += Math.round(Math.cos(a));
        y += Math.round(Math.sin(a));
      }
    }
    // Pebbles: a lit top-left, a shadow below-right.
    for (let i = 0; i < 160; i++) {
      const x = rng.int(0, W - 1);
      const y = rng.int(0, H - 1);
      wset(c, x, y, St, rng.chance(0.3) ? 4 : 3);
      if (rng.chance(0.5)) wset(c, x + 1, y, St, 2);
      wshift(c, x + 1, y + 1, -1);
    }
    // Dead grass tufts (fans of blades, lit tips), in clumps.
    for (let i = 0; i < 70; i++) {
      const cx = rng.int(0, W - 1);
      const cy = rng.int(0, H - 1);
      const n = rng.int(1, 4);
      for (let j = 0; j < n; j++) {
        const x = cx + rng.int(-6, 6);
        const y = cy + rng.int(-4, 4);
        for (let b = -2; b <= 2; b++) {
          const hgt = 3 + ((b + 7) % 3);
          for (let t = 0; t < hgt; t++) wset(c, x + b + Math.round((b * t) / 3), y - t, Gr, t === hgt - 1 ? 4 : t === 0 ? 2 : 3);
        }
        wshift(c, x, y + 1, -1);
      }
    }
    wscatter(c, rng, 0, 0, W, H, 500, 0, 1, { shapes: 3, only: E });
    wscatter(c, rng, 0, 0, W, H, 400, 0, -1, { shapes: 3 });
  }, { wrap: true });
}

/** The tanker's fuel spill (module 160 × 96 = 5 × 3 m): an oily sheet with a rainbow rim, the dusk in it, runnels. */
export function z3SpillDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z3spill', 160, 96, (c, k) => {
    const oil = k.ramp(0x3a3446, { light: 0.6, sat: 1.2 });
    const rim = k.ramp(0x6a4a8a, { light: 0.6, sat: 1.4 });
    const gold = k.ramp(0x9a8a4a, { light: 0.6, sat: 1.3 });
    const sky = k.ramp(0xb07a78, { light: 0.55, sat: 0.8 });
    for (let y = 0; y < 96; y += 1) {
      for (let x = 0; x < 160; x++) {
        const u = (x - 80) / 76;
        const v = (y - 48) / 44;
        const n = hash2(x >> 3, y >> 3, 91) * 0.35 + hash2(x >> 4, y >> 4, 92) * 0.3;
        const d = u * u + v * v + n - 0.32;
        if (d > 1) continue;
        // A dark wet slick: the dusk sky caught in smeared, broken patches (not bands), a thin
        // petrol rainbow only where the film thins at the edge, the tarmac grain showing through.
        const g = hash2(x, y, 93);
        const smear = hash2((x + (y >> 1)) >> 4, y >> 2, 94) * 0.6 + hash2(x >> 3, y >> 1, 95) * 0.4;
        if (d > 0.9) {
          if (hash2(x >> 2, y >> 2, 96) > 0.45) c.set(x, y, (x >> 2) & 1 ? rim : gold, 2.4 + g * 0.6);
          else c.set(x, y, oil, 2.2);
        } else if (smear > 0.72 && d < 0.8) c.set(x, y, sky, smear > 0.84 ? 3.1 : (x + y) & 1 ? 2.6 : 2.2);
        else c.set(x, y, oil, g > 0.93 ? 2.6 : g < 0.12 ? 1.2 : d > 0.6 ? 1.9 : 1.6);
      }
    }
  });
}
