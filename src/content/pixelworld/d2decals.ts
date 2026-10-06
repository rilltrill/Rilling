import type { PwAtlas, PwTile } from './atlas';
import { NEUTRAL_HEX } from './retexture';
import { bloodSmear, bloodSplat, bulletHole, clawMarks, handprint } from './d2kit';
import { hash2 } from './surfaces';

/**
 * RESEARCH LABS wall / floor decals (cut out, laid 1–2 cm off a surface):
 * claw gouges (NEUTRAL: tinted to the wall they scar), blood splats and
 * smears, bullet-pock clusters, scorch. The story of the night, placed by hand
 * by the room converters.
 */

/** Claw gouges torn through a wall's finish (neutral: tint to the wall). 48 × 32 (1.5 × 1 m). */
export function gougeDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`d2gouge|${variant}`, 48, 32, (c, k) => {
    const m = k.ramp(NEUTRAL_HEX, { light: 0.4, sat: 0.6 });
    // Paint gouges on a scratch layer, then keep only the touched texels (the rest is cut out).
    c.rect(0, 0, 48, 32, m, 3);
    const before = new Float32Array(c.tone);
    const a = variant % 2 ? 0.75 : 2.2;
    clawMarks(c, variant % 2 ? 8 : 38, variant % 2 ? 6 : 8, 30, a, { n: 4, gap: 4, depth: 2.5, wrap: false });
    if (variant > 1) clawMarks(c, 14, 20, 18, 0.5, { n: 3, gap: 3, depth: 2, wrap: false });
    for (let i = 0; i < c.tone.length; i++) if (c.tone[i] === before[i]) c.ramp[i] = 0;
  });
  t.neutral = NEUTRAL_HEX;
  return t;
}

/** A blood splat with drips (walls) or spatter (floors). 32 × 32 (1 × 1 m). */
export function bloodDecal(atlas: PwAtlas, variant = 0, wall = true): PwTile {
  return atlas.tile(`d2blood|${variant}|${wall ? 1 : 0}`, 32, 32, (c, k) => {
    const rng = k.rng;
    bloodSplat(c, rng, k, 14 + (variant % 3), wall ? 10 : 15, 3 + (variant % 2), { drips: wall ? 4 : 0, wrap: false, dir: wall ? Math.PI * 0.15 : rng.next() * 6 });
    if (variant % 3 === 1) handprint(c, k, 22, 16);
    if (!wall && variant % 2) bloodSmear(c, k, 16, 18, 28, 28, 2, { wrap: false });
  });
}

/** A burst of bullet pocks (a gunfight against a wall), neutral: tint to the wall. 32 × 24. */
export function pocksDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`d2pocks|${variant}`, 32, 24, (c, k) => {
    const m = k.ramp(NEUTRAL_HEX, { light: 0.4, sat: 0.6 });
    c.rect(0, 0, 32, 24, m, 3);
    const before = new Float32Array(c.tone);
    const rng = k.rng;
    for (let i = 0; i < 6 + variant; i++) bulletHole(c, rng, rng.int(3, 27), rng.int(3, 19), { cracks: hash2(i, variant, 3) > 0.4 });
    for (let i = 0; i < c.tone.length; i++) if (c.tone[i] === before[i]) c.ramp[i] = 0;
  });
  t.neutral = NEUTRAL_HEX;
  return t;
}

/** A splat of something spilled (sauce, oil, coolant): a blob with a wet rim and flecks. 32 × 32. */
export function splatDecal(atlas: PwAtlas, hex: number, variant = 0): PwTile {
  return atlas.tile(`d2splat|${hex.toString(16)}|${variant}`, 32, 32, (c, k) => {
    bloodSplat(c, k.rng, k, 16, 16, 6 + (variant % 3), { hex, wrap: false });
    if (variant % 2) bloodSmear(c, k, 18, 18, 30, 26, 2, { hex, wrap: false });
  });
}
