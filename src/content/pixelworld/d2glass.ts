import type { PwAtlas, PwTile } from './atlas';
import { hash2 } from './surfaces';

/**
 * RESEARCH LABS · what is ON the glass (cut-out overlays laid a hair in front
 * of the classic transparent panes): sheen streaks, greasy smudges and hand
 * prints, scratches, condensation beading along the bottom, claw-scored
 * cracks — so the big panes read as glass, not as flat tinted planes.
 */

/**
 * Glass sheen (world / pane frame, 4 × 2 m, cut out): one broken diagonal
 * streak of pale reflection (3 texels) with a thin echo — once per 4 m, so the
 * repeat never reads as hatching — a few greasy smudges in 2×2 clumps, a palm
 * print, fine scratches (2-texel dashes). 128 × 64.
 */
export function glassSheenTile(atlas: PwAtlas, hex = 0xb8e0e8): PwTile {
  return atlas.tile(
    `d2glasssheen|${hex.toString(16)}`,
    128,
    64,
    (c, k) => {
      const g = k.ramp(hex, { light: 0.45, sat: 0.7 });
      const smudge = k.ramp(0x8a9a9c, { light: 0.4, sat: 0.4 });
      // One broad streak (4 texels, soft: a step over the glass) and a thin echo — wide enough not to
      // flicker when the pane is seen edge-on from the aisle.
      for (let i = 0; i < 64; i++) {
        const x = 70 + Math.round(i * 0.7);
        const y = 63 - i;
        if (i % 13 < 9) {
          c.set(x, y, g, 2.75);
          c.set(x + 1, y, g, 3);
          c.set(x + 2, y, g, 3);
          c.set(x + 3, y, g, 2.75);
        }
        if (i % 9 < 5 && i > 10) {
          c.set(x + 10, y, g, 2.5);
          c.set(x + 11, y, g, 2.5);
        }
      }
      for (let i = 0; i < 5; i++) {
        const cx = 6 + i * 23;
        const cy = 18 + (i % 2) * 24;
        for (let y = 0; y < 6; y += 2) for (let x = 0; x < 8; x += 2) if (hash2(cx + x, cy + y, 5) > 0.5) c.rect(cx + x, cy + y, 2, 2, smudge, 2.5);
      }
      c.rect(32, 34, 5, 4, smudge, 2.75);
      for (let f = 0; f < 4; f++) c.rect(32 + f * 2 - (f > 1 ? 1 : 0), 29 + (f === 1 || f === 2 ? 0 : 1), 1, 5 - (f === 0 || f === 3 ? 1 : 0), smudge, 2.75);
      for (let i = 0; i < 6; i++) {
        const x = 8 + i * 19;
        const y = 54 - (i % 3) * 9;
        c.rect(x, y, 2, 1, g, 3.25);
        c.rect(x + 2, y - 1, 2, 1, g, 3.25);
      }
    },
    { wrap: true },
  );
}

/** Condensation beading along a pane's foot (world strip, 2 × 0.5 m, cut out): beads in a ragged band (the lower 8 rows), a few runs above. 64 × 16. */
export function condensationTile(atlas: PwAtlas, hex = 0xc8e8f0): PwTile {
  return atlas.tile(
    `d2condense|${hex.toString(16)}`,
    64,
    16,
    (c, k) => {
      const g = k.ramp(hex, { light: 0.5, sat: 0.6 });
      // Beads in 4×2 clumps along the foot (sparse, soft), a run or two above.
      for (let x = 0; x < 64; x += 4) {
        const h = 2 + Math.floor(hash2(x >> 2, 1, 3) * 3) * 2;
        for (let y = 16 - h; y < 16; y += 2) if (hash2(x >> 2, y >> 1, 5) > 0.45) c.rect(x, y, 4, 2, g, y === 16 - h ? 3.25 : 2.75);
        if (hash2(x, 2, 7) > 0.85) for (let y = 6; y < 16 - h; y++) c.rect(x + 1, y, 2, 1, g, 2.75);
      }
    },
    { wrap: true },
  );
}

/** Claw-scored cracks on a cell pane (cut out, 2 × 2 m): four raking gouges with chips flaking off, a crack star where a claw stuck. 64 × 64. */
export function clawCrackTile(atlas: PwAtlas, v = 0): PwTile {
  return atlas.tile(`d2clawcrack|${v % 2}`, 64, 64, (c, k) => {
    const g = k.ramp(0xe0f4f8, { light: 0.5, sat: 0.5 });
    const ang = v % 2 ? 1.1 : 0.85;
    for (let s = 0; s < 4; s++) {
      const x0 = 12 + s * 7;
      const y0 = 8 + s * 2;
      const len = 40 - Math.abs(s - 1.5) * 6;
      for (let j = 0; j < len; j++) {
        const x = Math.round(x0 + Math.cos(ang) * j * 0.6);
        const y = Math.round(y0 + Math.sin(ang) * j);
        c.set(x, y, g, j < 3 || j > len - 4 ? 3 : 4);
        c.set(x + 1, y, g, 3);
        if (hash2(x, y, 3) > 0.85) c.rect(x + 2, y, 2, 2, g, 3.5);
      }
    }
    // Crack star.
    const cx = 34;
    const cy = 40;
    for (let r = 0; r < 7; r++) {
      const a = r * 0.9 + 0.3;
      const len = 8 + (r % 3) * 5;
      for (let j = 2; j < len; j++) c.set(Math.round(cx + Math.cos(a) * j), Math.round(cy + Math.sin(a) * j), g, j < 4 ? 4.5 : 3.5);
    }
  });
}
