import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { cells, crack, hash2 } from './surfaces';
import { BRACHIO, frond, palmShape, silhouette } from './d2art';
import { scuffs, shiftW, wrapI } from './d2kit';

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
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const v = cells(x, y, 128, 128, 5, 5, 31, 0.9);
          const id = v.id;
          const ramp = hash2(id, 1, 3) > 0.55 ? s2 : s;
          // Mortar joints 2+ texels wide (a hairline joint crawls in motion), moss in 2×2 clumps.
          if (v.edge < 2.1) {
            // (The joint is the stone a step and a half down: dark enough to draw the slabs, never a black hairline.)
            c.set(x, y, hash2(x >> 1, y >> 1, 5) > 0.62 ? moss : ramp, hash2(x >> 2, y >> 2, 9) > 0.5 ? 1.75 : 1.5);
            continue;
          }
          let t = 3 + (hash2(id, 2, 3) - 0.5) * 0.6;
          // Bevel: a 2-texel lit edge where the joint is above / left, a shade below / right.
          if (v.edge < 4.1) t += v.dx + v.dy < 0 ? 0.75 : -0.5;
          c.set(x, y, ramp, t);
        }
      }
      // Wear: a few larger chips and pits (clusters of 4–5 texels), not per-texel flecks.
      c.scatter(rng, 0, 0, 128, 128, 26, 0, -0.75, { shapes: 9 });
      crack(c, rng, 70, 30, 18, 1.1, { dt: -1.5, lip: 0.75 });
      scuffs(c, rng, 0, 0, 128, 128, 20, 0.6);
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
 * A night-jungle flat beyond the glass (unlit): night sky with stars dithered
 * lighter toward the treeline, a far canopy band with a brachiosaur neck, the
 * near canopy (black-green crowns with moonlit rims), palm crowns, fern fronds.
 * 256 × 144 (wrap along u; 8 texels a metre: 32 × 18 m).
 */
export function jungleFlatTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2jungleflat',
    256,
    144,
    (c, k) => {
      const rng = k.rng;
      const sky = k.ramp(0x14264a, { light: 0.5, sat: 1.0 });
      const star = k.ramp(0xd0dcff, { light: 0.6 });
      const far = k.ramp(0x1c3040, { light: 0.4, sat: 0.9 });
      const near = k.ramp(0x0e1c16, { light: 0.4, sat: 0.9 });
      const rim = k.ramp(0x4a6a6a, { light: 0.4 });
      const H = 144;
      for (let y = 0; y < H; y++) for (let x = 0; x < 256; x++) c.set(x, y, sky, 2 + (y / H) * 1.4, PWF.GLOW | PWF.DITHER);
      for (let i = 0; i < 90; i++) c.set(rng.int(0, 255), rng.int(0, 80), star, rng.chance(0.2) ? 5 : 3, PWF.GLOW);
      // Far canopy: a soft lumpy band (rounded crowns), moonlit tops.
      for (let x = 0; x < 256; x++) {
        const top = Math.round(84 + Math.sin(x * 0.05) * 6 + Math.sin(x * 0.17) * 3 - Math.abs(Math.sin(x * 0.31)) * 4);
        for (let y = top; y < H; y++) c.set(x, y, far, y === top ? 3 : y < top + 3 ? 2.5 : 2, PWF.GLOW);
      }
      silhouette(c, BRACHIO, 90, 52, 46, 34, far, { tone: 2, shade: false, flag: PWF.GLOW });
      // Near canopy: big crowns with moonlit rims.
      for (let x = 0; x < 256; x++) {
        const crown = Math.abs(Math.sin(x * 0.045 + 2)) * 18 + Math.abs(Math.sin(x * 0.13 + 1)) * 6;
        const top = Math.round(116 - crown);
        for (let y = top; y < H; y++) c.set(x, y, near, 1.5, PWF.GLOW);
        c.set(x, top, rim, 2.5, PWF.GLOW);
        if (hash2(x, 1, 3) > 0.5) c.set(x, top + 1, rim, 2, PWF.GLOW);
      }
      // Palms poking above, fern fronds at the foot.
      for (let i = 0; i < 3; i++) palmShape(c, 30 + i * 90, 118, 36 + i * 4, near, 1.5, (i % 2 ? 1 : -1) * 0.18, PWF.GLOW);
      for (let i = 0; i < 12; i++) frond(c, rng.int(0, 255), 142, -1.2 - rng.next() * 0.8, rng.int(8, 14), near, 1.5, PWF.GLOW);
    },
    { wrap: true, density: 8 },
  );
}
