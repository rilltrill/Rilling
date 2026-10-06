import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { cells, crack, hash2 } from './surfaces';
import { BRACHIO, frond, palmShape, silhouette } from './d2art';
import { chunky2, scuffs, shiftW, wrapI } from './d2kit';

/**
 * RESEARCH LABS · the BOTANICAL ATRIUM: dark planting-bed loam with clods,
 * leaf litter, seedlings and three-toed tracks pressed in; crazy-paving
 * flagstones with moss in the joints; a rough stone plinth under the glass;
 * night-jungle flats beyond the glass (canopies, palms, a brachiosaur neck
 * against the sky).
 */

/** Planting-bed loam (world, 4 m): clods lit on top, leaf litter, twigs, moss, seedlings, dino tracks pressed in. 128 × 128. */
export function soilTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2soil',
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const soil = k.ramp(0x46362a, { light: 0.45, sat: 0.9 });
      const litter = k.ramp(0x8a5a2a, { light: 0.45 });
      const moss = k.ramp(0x3a6a2a, { light: 0.5 });
      const sprout = k.ramp(0x5a9a3a, { light: 0.5 });
      c.rect(0, 0, 128, 128, soil, 3);
      // Clods: 2–4 texel lumps lit on top, shadow below.
      for (let i = 0; i < 160; i++) {
        const x = rng.int(0, 127);
        const y = rng.int(0, 127);
        const w = rng.int(2, 4);
        for (let j = 0; j < w; j++) {
          c.set(wrapI(x + j, 128), y, soil, 3.75);
          c.set(wrapI(x + j, 128), wrapI(y + 1, 128), soil, 3.25);
          c.set(wrapI(x + j, 128), wrapI(y + 2, 128), soil, 2.25);
        }
      }
      // Leaf litter: small fallen leaves (2–4 texels) in autumn browns, curled.
      for (let i = 0; i < 70; i++) {
        const x = rng.int(0, 127);
        const y = rng.int(0, 127);
        const t = rng.chance(0.5) ? 3 : 2;
        c.set(x, y, litter, t + 1);
        c.set(wrapI(x + 1, 128), y, litter, t);
        c.set(wrapI(x + 1, 128), wrapI(y + 1, 128), litter, t - 1);
        if (rng.chance(0.5)) c.set(wrapI(x + 2, 128), wrapI(y + 1, 128), litter, t);
      }
      // Twigs.
      for (let i = 0; i < 10; i++) {
        const x = rng.int(0, 120);
        const y = rng.int(0, 125);
        const len = rng.int(4, 8);
        const dy = rng.int(-2, 2);
        c.line(x, y, x + len, y + dy, litter, 2);
      }
      // Moss patches and seedlings.
      for (let i = 0; i < 9; i++) {
        const cx = rng.int(0, 127);
        const cy = rng.int(0, 127);
        for (let j = 0; j < 14; j++) c.cluster(wrapI(cx + rng.int(-5, 5), 128), wrapI(cy + rng.int(-3, 3), 128), rng.int(0, 5), moss, rng.chance(0.5) ? 3 : 2);
      }
      for (let i = 0; i < 26; i++) {
        const x = rng.int(1, 126);
        const y = rng.int(2, 126);
        c.set(x, y, sprout, 2);
        c.set(x - 1, y - 1, sprout, 4);
        c.set(x + 1, y - 1, sprout, 3);
      }
      // Three-toed tracks pressed into the loam (dark imprint, lit rim on the lower-right).
      for (const [tx, ty, a] of [[30, 40, 0.3], [52, 76, 0.2], [90, 100, 0.5]] as const) {
        const put = (x: number, y: number) => {
          shiftW(c, x, y, -1.5);
          shiftW(c, x + 1, y + 1, 1);
        };
        for (let s = 0; s < 4; s++) put(Math.round(tx), Math.round(ty + s));
        for (const da of [-0.6, 0, 0.6]) for (let s = 1; s < 7; s++) put(Math.round(tx + Math.sin(a + da) * s), Math.round(ty - Math.cos(a + da) * s));
      }
    },
    { wrap: true },
  );
}

/** Crazy-paving flagstones (world): irregular slabs, each its own tone with a lit upper-left edge, mossy mortar joints, a cracked one. 128 × 128. */
export function flagstoneTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2flagstone',
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const s = k.ramp(0x958c7a, { light: 0.45, sat: 0.8 });
      const s2 = k.ramp(0x8a7e6a, { light: 0.45, sat: 0.8 });
      const moss = k.ramp(0x3a6a2a, { light: 0.5 });
      // The slab layout on a half-resolution grid (every feature lands 2 texels wide, a quarter of the work).
      for (let hy = 0; hy < 64; hy++) {
        for (let hx = 0; hx < 64; hx++) {
          const v = cells(hx, hy, 64, 64, 5, 5, 31, 0.9);
          const id = v.id;
          const ramp = hash2(id, 1, 3) > 0.55 ? s2 : s;
          let t: number;
          let r = ramp;
          // Mortar joints (the stone a step and a half down, moss in clumps), a lit / shaded bevel band.
          if (v.edge < 1.05) {
            // (Soft contrast: the path is right under the camera, a hard joint flickers as it slides past.)
            if (hash2(hx, hy, 5) > 0.7) r = moss;
            t = r === moss ? 2.25 : 2;
          } else {
            t = 3 + (hash2(id, 2, 3) - 0.5) * 0.5;
            if (v.edge < 2.05) t += v.dx + v.dy < 0 ? 0.5 : -0.25;
          }
          c.rect(hx * 2, hy * 2, 2, 2, r, t);
        }
      }
      // Wear: a few larger chips and pits (clusters of 4–5 texels), not per-texel flecks.
      c.scatter(rng, 0, 0, 128, 128, 26, 0, -0.75, { shapes: 9 });
      crack(c, rng, 70, 30, 18, 1.1, { dt: -1.5, lip: 0.75 });
      scuffs(c, rng, 0, 0, 128, 128, 20, 0.6);
      chunky2(c);
    },
    { wrap: true },
  );
}

/** Rough stone plinth / kerb (world, v from the floor): coursed rubble blocks, moss along the foot, soil splash. 64 × 64 (NEUTRAL). */
export function rubbleTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2rubble',
    64,
    64,
    (c, k) => {
      const rng = k.rng;
      const s = k.ramp(0xd8d8d8, { light: 0.45, sat: 0.6 });
      const moss = k.ramp(0x7aa06a, { light: 0.45 });
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const v = cells(x, y, 64, 64, 4, 8, 47, 0.7, 2.2);
          if (v.edge < 0.9) {
            c.set(x, y, s, 1);
            continue;
          }
          let t = 3 + (hash2(v.id, 4, 1) - 0.5) * 0.7;
          if (v.edge < 1.9) t += v.dy < 0 ? 1 : -0.75;
          c.set(x, y, s, t);
        }
      }
      c.scatter(rng, 0, 0, 64, 64, 30, 0, -0.75, { shapes: 3 });
      // Moss at the foot (bottom rows), creeping up the joints.
      for (let x = 0; x < 64; x++) {
        const h = 2 + Math.round(Math.abs(Math.sin(x * 0.3)) * 3 + hash2(x, 3, 3) * 2);
        for (let y = 63 - h; y < 64; y++) if (bayer(x, y) < 0.8) c.set(x, y, moss, y === 63 - h ? 3.5 : 2.5);
      }
    },
    { wrap: true },
  );
  t.neutral = 0xd8d8d8;
  return t;
}

/**
 * A night-jungle flat beyond the glass (unlit): a night sky dithered lighter
 * toward the treeline with stars; then three layered planes, each a step
 * darker and nearer — a hazy far ridge, a far canopy of rounded crowns with a
 * brachiosaur neck rising out of it, a mid canopy of big crowns with moonlit
 * crescents on their upper-left, and near palms and fern fronds in black-green
 * against them. 256 × 144 (wrap along u; 8 texels a metre: 32 × 18 m).
 */
export function jungleFlatTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2jungleflat|r3',
    256,
    144,
    (c, k) => {
      const rng = k.rng;
      const sky = k.ramp(0x14264a, { light: 0.5, sat: 1.0 });
      const star = k.ramp(0xd0dcff, { light: 0.6 });
      const ridge = k.ramp(0x22384c, { light: 0.4, sat: 0.8 });
      const far = k.ramp(0x1c3a3a, { light: 0.4, sat: 0.9 });
      const mid = k.ramp(0x14301e, { light: 0.45, sat: 0.95 });
      const near = k.ramp(0x0a160e, { light: 0.4, sat: 0.9 });
      const H = 144;
      const W = 256;
      const G = PWF.GLOW;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, sky, 2 + (y / H) * 1.4, G | PWF.DITHER);
      for (let i = 0; i < 90; i++) c.set(rng.int(0, W - 1), rng.int(0, 70), star, rng.chance(0.2) ? 5 : 3, G);
      // Hazy far ridge.
      for (let x = 0; x < W; x++) {
        const top = Math.round(70 + Math.sin((x / W) * Math.PI * 4) * 5 + Math.sin((x / W) * Math.PI * 10 + 1) * 2);
        for (let y = top; y < H; y++) c.set(x, y, ridge, y < top + 2 ? 2.5 : 2, G);
      }
      /** A crown: a disc with a moonlit crescent on its upper-left (2 texels), wrapping in u. */
      const crown = (cx: number, cy: number, r: number, ramp: number, tone: number, lit: number) => {
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
          for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            const u = (x + 0.5 - cx) / r;
            const v = (y + 0.5 - cy) / r;
            const d = u * u + v * v;
            if (d > 1 || y < 0 || y >= H) continue;
            // Crescent: inside the disc but outside the same disc shifted down-right.
            const u2 = (x + 0.5 - cx - 2.2) / r;
            const v2 = (y + 0.5 - cy - 2.2) / r;
            const rim = u2 * u2 + v2 * v2 > 1 && u + v < 0.2;
            c.set(((x % W) + W) % W, y, ramp, rim ? lit : tone, G);
          }
        }
      };
      // Far canopy: a row of rounded crowns, the brachiosaur neck out of it.
      for (let x = -8; x < W + 8; x += 9) crown(x + rng.range(-2, 2), 86 + Math.sin(x * 0.07) * 4 + rng.range(-2, 2), rng.range(6, 10), far, 2, 2.75);
      for (let y = 92; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, far, 2, G);
      silhouette(c, BRACHIO, 90, 50, 46, 34, far, { tone: 2, shade: false, flag: G });
      for (let i = 0; i < 6; i++) c.set(122 + i, 52 + (i >> 1), far, 2.75, G);
      // Mid canopy: bigger crowns, moonlit crescents.
      for (let x = -12; x < W + 12; x += 15) crown(x + rng.range(-3, 3), 106 + Math.sin(x * 0.045 + 2) * 6 + rng.range(-2, 2), rng.range(10, 15), mid, 1.5, 2.5);
      for (let y = 114; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, mid, 1.5, G);
      // Near: palms above the canopy line, big fern fronds at the foot (black-green).
      for (let i = 0; i < 3; i++) palmShape(c, 30 + i * 90, 124, 40 + i * 5, near, 1.25, (i % 2 ? 1 : -1) * 0.18, G);
      for (let i = 0; i < 16; i++) {
        const x = rng.int(0, W - 1);
        frond(c, x, 143, -1.0 - rng.next() * 1.1, rng.int(14, 24), near, 1.25, G);
      }
      for (let y = 132; y < H; y++) for (let x = 0; x < W; x++) if (hash2(x >> 2, y >> 1, 3) > 0.35 - (y - 132) * 0.06) c.set(x, y, near, 1.25, G);
    },
    { wrap: true, density: 8 },
  );
}

/**
 * The atrium end's plinth (world, v from the floor; 1 m): two courses of tooled
 * ashlar in bond (2-texel recessed joints, chamfered lit arrises), a projecting
 * coping with a drip shadow at 1 m, moss and soil splash at the foot. 64 × 32.
 */
export function ashlarPlinthTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2ashlar',
    64,
    32,
    (c, k) => {
      const s = k.ramp(0x9a917e, { light: 0.45, sat: 0.7 });
      const moss = k.ramp(0x4a6a32, { light: 0.45 });
      const soilR = k.ramp(0x46362a, { light: 0.4 });
      // Coping (rows 0–4: the top of the plinth at 1 m), then two courses of 13 rows.
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
          if (y < 5) {
            c.set(x, y, s, y === 0 ? 4.25 : y === 4 ? 1.5 : 3.5);
            continue;
          }
          const course = y < 18 ? 0 : 1;
          const ly = y - (course ? 18 : 5);
          const off = course ? 16 : 0;
          const lx = (x + off) % 32;
          const bid = Math.floor((x + off) / 32) + course * 7;
          if (lx < 2 || ly < 2) {
            c.set(x, y, s, 1.75);
            continue;
          }
          let t = 3 + (hash2(bid, 3, 5) - 0.5) * 0.5;
          if (lx === 2 || ly === 2) t += 0.75;
          else if (lx === 31 || ly === 12) t -= 0.75;
          c.set(x, y, s, t);
        }
      }
      // Drip shadow under the coping.
      for (let x = 0; x < 64; x++) c.shift(x, 5, -0.75);
      // Tooling: a few horizontal chisel strokes per block (2 texels), not speckle.
      for (let i = 0; i < 10; i++) {
        const x = k.rng.int(3, 60);
        const y = k.rng.int(8, 28);
        c.lineShade(x, y, x + 3, y, -0.5);
      }
      // Moss creeping up the foot, soil splash.
      for (let x = 0; x < 64; x += 2) {
        const h = 2 + Math.round(Math.abs(Math.sin(x * 0.21)) * 3 + hash2(x >> 1, 3, 7) * 3);
        for (let y = 32 - h; y < 32; y++) c.rect(x, y, 2, 1, hash2(x >> 1, y >> 1, 9) > 0.35 ? moss : soilR, y === 32 - h ? 3 : 2.25);
      }
    },
    { wrap: true },
  );
}

/**
 * Greenhouse glazing for the atrium's end (cut out, world, 2 × 2 m bays):
 * steel mullions (6 texels: lit left face, a dark right) and a glazing bar at
 * every 2 m, putty lines, a sheen streak across each pane and condensation
 * beading on the lower edge — the panes themselves are cut out (the night
 * jungle shows through). 64 × 64.
 */
export function glazingTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2glazing',
    64,
    64,
    (c, k) => {
      const m = k.ramp(0x4e6056, { light: 0.5, sat: 0.7 });
      const glass = k.ramp(0x8ec8c0, { light: 0.5, sat: 0.8 });
      // Mullion (x 0–5) and the glazing bar at the bottom of the bay (rows 60–63).
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 6; x++) c.set(x, y, m, x === 0 ? 4 : x === 1 ? 3.5 : x === 5 ? 1.5 : 2.75);
      }
      for (let x = 0; x < 64; x++) {
        for (let y = 60; y < 64; y++) c.set(x, y, m, y === 60 ? 4 : y === 63 ? 1.5 : 2.75);
      }
      // Putty edges round the pane.
      for (let y = 0; y < 60; y++) c.set(6, y, m, 2);
      for (let x = 6; x < 64; x++) c.set(x, 59, m, 2.25);
      // Sheen: two diagonal streaks of pale glass (2 texels), broken.
      for (let i = 0; i < 26; i++) {
        const x = 20 + i;
        const y = 50 - Math.round(i * 1.6);
        if (i % 9 > 6) continue;
        c.set(x, y, glass, 4);
        c.set(x + 1, y, glass, 3.5);
        c.set(x + 6, y + 4, glass, 3);
      }
      // Condensation beads along the bottom of the pane, a run or two.
      for (let x = 8; x < 62; x += 3) {
        if (hash2(x, 1, 5) > 0.45) c.set(x, 57, glass, 3);
        if (hash2(x, 2, 5) > 0.8) for (let j = 0; j < 4; j++) c.set(x, 53 + j, glass, 2.5);
      }
    },
    { wrap: true },
  );
}

/**
 * The hatchery entrance canopy's fascia (fit on a 5 × 0.19 m box front): a lit
 * steel lip, a park-green band with rivets, a row of lamps glowing along the
 * underside. 160 × 6.
 */
export function canopyFasciaTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2canopy', 160, 6, (c, k) => {
    const m = k.ramp(0x4a5a52, { light: 0.5, sat: 0.7 });
    const lamp = k.ramp(0xc8ffd8, { light: 0.6, sat: 0.9 });
    const green = k.ramp(0x1a4a3a, { light: 0.45 });
    c.rect(0, 0, 160, 6, m, 3);
    c.hline(0, 0, 160, m, 4.5);
    c.rect(0, 1, 160, 3, green, 3);
    for (let x = 4; x < 160; x += 12) c.set(x, 2, m, 4.5);
    c.hline(0, 4, 160, m, 2);
    for (let x = 6; x < 160; x += 16) {
      c.rect(x, 5, 6, 1, lamp, 4.5, PWF.GLOW);
      c.set(x - 1, 5, lamp, 2.5, PWF.GLOW);
      c.set(x + 6, 5, lamp, 2.5, PWF.GLOW);
    }
    void bayer;
  });
}
