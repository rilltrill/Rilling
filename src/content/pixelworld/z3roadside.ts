import type { PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2 } from './surfaces';
import { dith, fill, G, h6, rivet, rustRun, wscatter, wset, wshift } from './z3kit';

/**
 * HIGHWAY TO HELL (z3) roadside painters for ART: PIXEL WORLD:
 *  - JERSEY barrier side (a module per 4 m segment, unfolded foot → lower
 *    slope → upper face): slip-formed concrete, the slope break catching the
 *    light, black tyre-rub scuffs low down, the drain slot, chipped joints,
 *    rust from the connecting pins, stencils / reflectors / graffiti on some;
 *    its top strip with the lifting loops;
 *  - GUARD RAIL: the galvanised W-beam (crests lit, troughs dark, splice bolts,
 *    rust, dents), its I-beam posts with blockouts and delineators;
 *  - POLES: galvanised light poles, cobra-head lamps (lens glowing or dead),
 *    weathered wooden utility poles with steps, staples and torn flyers, the
 *    crossarm with glass insulators, transformer cans.
 */

/** Jersey barrier: side module 128 × 32 (the unfolded 4 m × ~1 m face), `variant` 0…4 (4 = smashed). */
export const JERSEY_SIDE = { w: 128, h: 32 } as const;
/** Rows of the unfolded side (from the top of the module): upper face, lower slope, foot. */
export const JERSEY_ROWS = { upper: 20, slope: 8, foot: 4 } as const;

export function z3JerseySide(atlas: PwAtlas, variant: number, hex = 0x9a948c): PwTile {
  return atlas.tile(`z3jersey|${variant}|${h6(hex)}`, JERSEY_SIDE.w, JERSEY_SIDE.h, (c, k) => paintJersey(c, k, variant, hex));
}

function paintJersey(c: PwCanvas, k: PwKit, variant: number, hex: number) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const C = k.ramp(hex, { light: 0.45, dark: 0.45, sat: 0.8 });
  const dirt = k.ramp(0x6e6050, { light: 0.4, sat: 0.8 });
  const rub = k.ramp(0x26242a, { light: 0.4 });
  const rust = k.ramp(0x8a4a24, { light: 0.4 });
  const U = JERSEY_ROWS.upper;
  const S = U + JERSEY_ROWS.slope;
  fill(c, C, 3);
  // Slip-form drag lines along the upper face (every few rows, broken), the slope a step darker.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (y < U) {
        if (y % 5 === 2 && hash2(x >> 3, y, 3) > 0.45) c.tone[i] = 2.6;
      } else if (y < S) c.tone[i] = 2.6;
      else c.tone[i] = 2.2;
    }
  }
  // The top edge and the slope break catch the light; the break's lower lip shades.
  c.hline(0, 0, W, C, 4);
  c.hline(0, U, W, C, 3.6);
  c.hline(0, U - 1, W, C, 2.4);
  c.hline(0, S, W, C, 1.8);
  // Joints at both ends: a dark seam, chipped corners.
  for (const x of [0, W - 1]) {
    c.vline(x, 0, H, C, 1.4);
    for (let j = 0; j < 4; j++) if (hash2(x, j, variant) > 0.4) c.set(x === 0 ? 1 : W - 2, rng.int(0, H - 1), C, 1.6);
  }
  // Pores / chips (clusters), dirt splashed up the foot and the slope.
  wscatter(c, rng, 1, 1, W - 2, H - 2, 60, 0, -0.8, { shapes: 3 });
  wscatter(c, rng, 1, 1, W - 2, U, 30, 0, 0.6, { shapes: 2 });
  for (let x = 0; x < W; x++) {
    const reach = 6 + Math.round(hash2(x >> 2, 1, 5 + variant) * 6);
    for (let y = H - reach; y < H; y++) if (dith(x, y, ((y - (H - reach)) / reach) * 1.4)) c.tint(x, y, dirt, -0.4);
  }
  // Tyre rubber scuffs on the lower slope / upper face (long dark streaks, lighter tails).
  const nRub = variant === 0 ? 1 : 3;
  for (let i = 0; i < nRub; i++) {
    const x0 = rng.int(4, W - 40);
    const y0 = rng.int(U - 6, S);
    const len = rng.int(16, 46);
    for (let j = 0; j < len; j++) {
      const y = y0 + Math.round(Math.sin(j * 0.12 + i) * 1.5);
      if (j > len * 0.7 && !dith(x0 + j, y, (len - j) / (len * 0.3))) continue;
      c.set(x0 + j, y, rub, j % 9 === 0 ? 2 : 1);
      if (hash2(j, i, 9) > 0.5) c.set(x0 + j, y + 1, rub, 2);
    }
  }
  // Drain slot at the foot (dark rectangle, lit lower lip).
  if (variant !== 3) {
    const x = 52 + variant * 6;
    c.rect(x, H - 4, 18, 3, C, 0.6);
    c.hline(x, H - 1, 18, C, 3.2);
  }
  // Connecting-pin rust bleeding down from both ends.
  for (const x of [3, W - 5]) rustRun(c, rng, x, 2, rng.int(8, 18), rust);
  if (variant === 1) {
    // A stencilled route marker.
    const ink = k.ramp(0x2a2a30, { light: 0.4 });
    for (let j = 0; j < 4; j++) for (let x = 0; x < 3; x++) if (hash2(x, j, 31) > 0.25) c.set(96 + j * 4 + x, 7 + (x & 1), ink, 2);
    c.rect(94, 5, 20, 1, ink, 2);
    c.rect(94, 11, 20, 1, ink, 2);
  }
  if (variant === 2) {
    // A spray tag (2–3 colours with a darker outline, drips).
    const pal = [k.ramp(0xd83a2a, { light: 0.4 }), k.ramp(0x3a8ad8, { light: 0.4 }), k.ramp(0xe8d040, { light: 0.4 })];
    const col = pal[rng.int(0, 2)];
    let x = rng.int(20, 50);
    let y = 9;
    for (let j = 0; j < 46; j++) {
      c.set(x, y, col, 3);
      c.set(x, y + 1, col, 3);
      c.shift(x + 1, y + 2, -1);
      x += 1;
      y += rng.int(-1, 1);
      if (y < 4) y = 4;
      if (y > 15) y = 15;
      if (rng.chance(0.12)) for (let d = 2; d < rng.int(3, 7); d++) c.set(x, y + d, col, 2);
    }
  }
  if (variant === 4) {
    // Smashed: a big spalled bite out of the upper face, cracks, rebar showing.
    const cx = rng.int(40, 80);
    for (let y = 0; y < 14; y++) {
      for (let x = -14; x < 14; x++) {
        const d = (x * x) / 196 + (y * y) / 196 + hash2(x >> 1, y >> 1, 41) * 0.3;
        if (d > 1) continue;
        c.set(cx + x, y, C, d < 0.6 ? 1.4 : 2);
      }
    }
    for (let j = 0; j < 3; j++) {
      const rx = cx - 8 + j * 7;
      c.vline(rx, 2, 8, rust, 2);
      c.set(rx, 1, rust, 3);
    }
    for (let i = 0; i < 4; i++) {
      let x = cx + rng.int(-10, 10);
      let y = 12;
      for (let j = 0; j < 16; j++) {
        c.shift(x, y, -1.6);
        y++;
        x += rng.int(-1, 1);
      }
    }
  }
  // An amber reflector on the upper face of some.
  if (variant === 0 || variant === 3) {
    const amber = k.ramp(0xe89a2a, { light: 0.5 });
    c.rect(62, 4, 4, 3, amber, 4);
    c.set(62, 4, amber, 5);
  }
}

/** The barrier's top strip (10 texels across ≈ 0.3 m): weathered edge, lifting loops, bird droppings. 128 × 16 module. */
export function z3JerseyTop(atlas: PwAtlas, hex = 0x9a948c): PwTile {
  return atlas.tile(`z3jerseytop|${h6(hex)}`, 128, 16, (c, k) => {
    const rng = k.rng;
    const C = k.ramp(hex, { light: 0.45, dark: 0.45, sat: 0.8 });
    const steel = k.ramp(0x6a6460, { light: 0.4 });
    fill(c, C, 3.4);
    c.hline(0, 0, 128, C, 4);
    c.hline(0, 15, 128, C, 4);
    c.vline(0, 0, 16, C, 1.6);
    c.vline(127, 0, 16, C, 1.6);
    wscatter(c, rng, 0, 0, 128, 16, 30, 0, -0.8, { shapes: 3 });
    for (const x of [30, 98]) {
      c.rect(x, 5, 6, 6, steel, 2);
      c.rect(x + 1, 6, 4, 4, C, 2);
      c.set(x, 5, steel, 4);
    }
  });
}

/** Guard rail W-beam, laid on its front face (wrap 128 × 16 = 4 m × 0.5 m; the beam rows 2…13). */
export function z3WBeamTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3wbeam', 128, 16, (c, k) => {
    const rng = k.rng;
    const g = k.ramp(0x9aa0a4, { light: 0.5, sat: 0.5 });
    const rust = k.ramp(0x8a4a24, { light: 0.45 });
    const dirt = k.ramp(0x6e6050, { light: 0.4 });
    // Profile rows (top → bottom): edge, crest, slope, trough, slope, crest, edge.
    const prof = [3.4, 4.6, 4, 3, 2.2, 1.6, 1.6, 2.2, 3, 4, 4.4, 3.6, 2.4, 1.6];
    for (let y = 0; y < 14; y++) c.hline(0, y + 1, 128, g, prof[y]);
    // Splice: overlapping plate edge + 8 bolts at x 0…10.
    c.vline(10, 1, 14, g, 1.4);
    c.vline(11, 1, 14, g, 4.4);
    for (const by of [3, 11]) for (const bx of [2, 6]) rivet(c, bx, by, g, 3);
    // Post bolt in the trough every 2 m.
    for (const x of [64]) {
      c.rect(x - 1, 6, 3, 3, g, 1);
      c.set(x - 1, 6, g, 5);
    }
    // Rust weeping from the bolts and the lower edge, road grime along the bottom.
    for (const x of [3, 7, 64]) rustRun(c, rng, x, 8, rng.int(4, 8), rust);
    for (let x = 0; x < 128; x++) if (hash2(x >> 2, 0, 3) > 0.4) c.tint(x, 13, dirt, -0.4);
    for (let x = 0; x < 128; x++) if (hash2(x >> 3, 1, 4) > 0.7) c.tint(x, 12, dirt, 0);
    // Dents: a crumpled stretch (the crest flattened, dark creases).
    const dx = rng.int(30, 90);
    for (let j = 0; j < 14; j++) {
      c.shift(dx + j, 2, -1.2);
      if (j % 4 === 1) c.vline(dx + j, 2, 9, g, 1.4);
    }
  }, { wrap: true });
}

/** A guard-rail post front (I-beam with its blockout and, sometimes, a delineator): 8 × 28 module. */
export function z3RailPost(atlas: PwAtlas, reflector: boolean): PwTile {
  return atlas.tile(`z3railpost|${reflector ? 1 : 0}`, 8, 28, (c, k) => {
    const g = k.ramp(0x6a6e74, { light: 0.5, sat: 0.5 });
    const rust = k.ramp(0x8a4a24, { light: 0.45 });
    c.rect(1, 0, 6, 28, g, 2.6);
    c.vline(1, 0, 28, g, 4);
    c.vline(6, 0, 28, g, 1.4);
    c.rect(3, 2, 2, 24, g, 2);
    for (let y = 18; y < 28; y++) if (hash2(y, 0, 5) > 0.4) c.tint(3 + (y & 1), y, rust, -0.4);
    if (reflector) {
      const w = k.ramp(0xf0f0e8, { light: 0.4 });
      c.rect(2, 1, 4, 4, w, 4);
      c.rect(3, 2, 2, 2, k.ramp(0xe89a2a, { light: 0.5 }), 5, G);
    }
  });
}

/** Galvanised steel pole skin (wrap 32 × 64, u round the pole): zinc mottle, a seam, rust low down, a flyer. */
export function z3SteelPoleTile(atlas: PwAtlas, hex = 0x5a5e66): PwTile {
  return atlas.tile(`z3steelpole|${h6(hex)}`, 32, 64, (c, k) => {
    const rng = k.rng;
    const g = k.ramp(hex, { light: 0.5, sat: 0.6 });
    fill(c, g, 3);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) if (hash2(x >> 2, y >> 3, 7) > 0.7) c.tone[y * 32 + x] = 2.6;
    c.vline(9, 0, 64, g, 4);
    c.vline(10, 0, 64, g, 3.6);
    c.vline(24, 0, 64, g, 2);
    wscatter(c, rng, 0, 0, 32, 64, 20, 0, -0.8, { shapes: 2 });
  }, { wrap: true });
}

/** Cobra-head lamp housing (side view, cut out): 32 × 12; `lit` glows the lens strip under it. */
export function z3CobraHead(atlas: PwAtlas, lit: boolean): PwTile {
  return atlas.tile(`z3cobra|${lit ? 1 : 0}`, 32, 12, (c, k) => {
    const g = k.ramp(0x8a8e96, { light: 0.5, sat: 0.5 });
    const lens = k.ramp(lit ? 0xffb050 : 0x5a5450, { light: 0.6 });
    // Teardrop body: a rounded nose (right), tapering into the arm socket (left).
    for (let x = 0; x < 32; x++) {
      const t = x / 31;
      const top = Math.round(6 - 5 * Math.sqrt(Math.max(0, t * (1.15 - t))) * 1.6);
      const bot = 8;
      for (let y = Math.max(0, top); y <= bot; y++) c.set(x, y, g, y === top ? 4.4 : y < 5 ? 3.4 : 2.4);
    }
    for (let x = 8; x < 30; x++) c.set(x, 9, lens, lit ? 5 : 2, lit ? G : 0);
    for (let x = 10; x < 28; x++) c.set(x, 10, lens, lit ? 4 : 1.6, lit ? G : 0);
    c.outline(0);
  });
}

/** Weathered wooden utility pole (wrap 32 × 128, u round the pole): grain, checks, staples and torn flyers, climbing steps. */
export function z3WoodPoleTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3woodpole', 32, 128, (c, k) => {
    const rng = k.rng;
    const w = k.ramp(0x5a4232, { light: 0.45, sat: 0.8 });
    const paper = [k.ramp(0xd8d0b8, { light: 0.35 }), k.ramp(0xc8a838, { light: 0.4 }), k.ramp(0xc85a4a, { light: 0.4 })];
    const steel = k.ramp(0x8a8c92, { light: 0.5 });
    fill(c, w, 3);
    // Vertical grain runs (meandering), checks (deep dark splits).
    for (let i = 0; i < 18; i++) {
      let x = rng.int(0, 31);
      const y0 = rng.int(0, 127);
      const len = rng.int(20, 90);
      const t = rng.chance(0.5) ? 2.4 : 3.6;
      for (let j = 0; j < len; j++) {
        wset(c, x, y0 + j, w, t);
        if (rng.chance(0.06)) x += rng.chance(0.5) ? 1 : -1;
      }
    }
    for (let i = 0; i < 4; i++) {
      const x = rng.int(0, 31);
      const y0 = rng.int(0, 127);
      for (let j = 0; j < rng.int(12, 30); j++) {
        wset(c, x, y0 + j, w, 1);
        wshift(c, x + 1, y0 + j, 0.8);
      }
    }
    // Staples / nails (bright dots), flyer scraps stapled on (torn corners, faded type rows).
    for (let i = 0; i < 26; i++) wset(c, rng.int(0, 31), rng.int(0, 127), steel, rng.chance(0.5) ? 4 : 2);
    for (let i = 0; i < 3; i++) {
      const p = paper[i];
      const x0 = rng.int(0, 22);
      const y0 = 70 + i * 16 + rng.int(-4, 4);
      const pw = rng.int(7, 11);
      const ph = rng.int(8, 13);
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          if ((y === ph - 1 || x === pw - 1) && hash2(x, y, i) > 0.4) continue;
          wset(c, x0 + x, y0 + y, p, y % 3 === 1 && x > 1 && x < pw - 2 ? 2 : 3.4);
        }
      }
    }
    // Climbing steps (steel pegs) up one side, from 2.5 m.
    for (let y = 4; y < 48; y += 10) {
      wset(c, 26, y, steel, 4);
      wset(c, 27, y, steel, 3);
      wshift(c, 27, y + 1, -1);
    }
  }, { wrap: true });
}

/** Crossarm with glass insulators (cut out above the arm): 96 × 20 (3 × 0.6 m), the arm along the bottom rows. */
export function z3CrossarmModule(atlas: PwAtlas): PwTile {
  return atlas.tile('z3crossarm', 96, 20, (c, k) => {
    const w = k.ramp(0x4a3828, { light: 0.45 });
    const glass = k.ramp(0x5a9a8a, { light: 0.55, sat: 1.1 });
    const steel = k.ramp(0x7a7c82, { light: 0.4 });
    c.rect(2, 13, 92, 6, w, 3);
    c.hline(2, 13, 92, w, 4);
    c.hline(2, 18, 92, w, 1.6);
    // Diagonal braces under the arm toward the pole (centre).
    for (const x of [6, 22, 74, 90]) {
      c.rect(x - 1, 6, 3, 7, steel, 2);
      for (let y = 0; y < 5; y++) {
        const yy = 1 + y;
        const half = y < 2 ? 1 : 2;
        for (let j = -half; j <= half; j++) c.set(x + j, yy, glass, j < 0 ? 4 : j > 0 ? 2.4 : 3.4);
      }
      c.hline(x - 2, 6, 5, glass, 2);
    }
    c.outline(0);
  });
}

/** Pole-top transformer can (wrap 32 × 32 round it): grey paint, bands, a warning label, rust streaks. */
export function z3TransformerTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3transformer', 32, 32, (c, k) => {
    const rng = k.rng;
    const g = k.ramp(0x7a8088, { light: 0.45, sat: 0.6 });
    const rust = k.ramp(0x8a4a24, { light: 0.4 });
    const label = k.ramp(0xe0c040, { light: 0.4 });
    fill(c, g, 3);
    c.hline(0, 2, 32, g, 4.4);
    c.hline(0, 3, 32, g, 2);
    c.hline(0, 27, 32, g, 4);
    c.hline(0, 28, 32, g, 2);
    c.rect(10, 12, 8, 6, label, 3);
    c.hline(10, 14, 8, k.ramp(0x1c1c20, { light: 0.4 }), 2);
    for (let i = 0; i < 4; i++) rustRun(c, rng, rng.int(0, 31), 4, rng.int(6, 16), rust);
  }, { wrap: true });
}

/** Rough concrete foundation / pier skin (wrap 64 × 64): form-tie holes, pour lines, stains. */
export function z3FootingTile(atlas: PwAtlas, hex = 0x6e6a66): PwTile {
  return atlas.tile(`z3footing|${h6(hex)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const C = k.ramp(hex, { light: 0.45, sat: 0.8 });
    fill(c, C, 3);
    for (let y = 0; y < 64; y += 16) c.hline(0, y, 64, C, 2.4);
    for (let y = 8; y < 64; y += 16) for (let x = 8; x < 64; x += 16) {
      c.set(x, y, C, 1.4);
      c.set(x + 1, y + 1, C, 3.8);
    }
    wscatter(c, rng, 0, 0, 64, 64, 50, 0, -0.8, { shapes: 3 });
    wscatter(c, rng, 0, 0, 64, 64, 30, 0, 0.6, { shapes: 2 });
  }, { wrap: true });
}

// ─── R2: the last classic glows ──────────────────────────────────────────────

/** A road flare (wrap 16 × 16 round the stick): red paper, a white band, the striker end. */
export function z3FlareStick(atlas: PwAtlas): PwTile {
  return atlas.tile('z3flarestick', 16, 16, (c, k) => {
    const red = k.ramp(0xc8281c, { light: 0.5 });
    const white = k.ramp(0xe8e4dc, { light: 0.4 });
    fill(c, red, 3);
    for (let x = 0; x < 16; x++) {
      c.set(x, 6, white, 3.6);
      c.set(x, 7, white, 3.2);
      c.set(x, 0, red, 4);
    }
  }, { wrap: true });
}

/** The burning end of a flare (module 8 × 8, glow): a white-hot core in a red bloom. */
export function z3FlareFire(atlas: PwAtlas): PwTile {
  return atlas.tile('z3flarefire', 8, 8, (c, k) => {
    const hot = k.ramp(0xffe0d0, { light: 0.6 });
    const red = k.ramp(0xff3020, { light: 0.5 });
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x - 3.5, y - 3.5);
      if (d < 2) c.set(x, y, hot, 5, G);
      else if (d < 4) c.set(x, y, red, d < 3 ? 4.6 : 3.6, G);
    }
  });
}

/** The red pool a flare throws on the asphalt (cut-out module 48 × 48): stepped rings, Bayer-thinned outward. */
export function z3FlarePool(atlas: PwAtlas): PwTile {
  return atlas.tile('z3flarepool', 48, 48, (c, k) => {
    const red = k.ramp(0xb02018, { light: 0.45 });
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const d = Math.hypot(x - 23.5, y - 23.5) / 24;
      if (d > 1) continue;
      // Three steps of light, each thinner (an ordered dither, never a smooth disc).
      const k2 = d < 0.3 ? 0.75 : d < 0.6 ? 0.45 : 0.2;
      if (!dith(x, y, k2)) continue;
      c.set(x, y, red, d < 0.3 ? 3.4 : d < 0.6 ? 2.6 : 2, G);
    }
  });
}

/** A tunnel light (module 16 × 64 over the 0.36 × 1.9 m lens): sodium tube behind a prismatic diffuser, end caps, louvres. */
export function z3TunnelLamp(atlas: PwAtlas): PwTile {
  return atlas.tile('z3tunlamp', 16, 64, (c, k) => {
    const hot = k.ramp(0xffc070, { light: 0.6 });
    const amber = k.ramp(0xffa040, { light: 0.5 });
    const cap = k.ramp(0x2a2a30, { light: 0.4 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) {
      if (y < 3 || y > 60 || x === 0 || x === 15) c.set(x, y, cap, y < 3 || y > 60 ? 2.4 : 1.8);
      else if (y % 6 === 0) c.set(x, y, amber, 3.4, G);
      else c.set(x, y, x > 5 && x < 10 ? hot : amber, x > 5 && x < 10 ? 5 : 4.2, G);
    }
  });
}
