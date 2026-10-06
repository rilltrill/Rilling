import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, neonText, textWidth } from './font';
import { NEUTRAL_HEX } from './retexture';
import { crack, hash2 } from './surfaces';
import { REX, silhouette } from './d2art';
import { bloodSmear, bloodSplat, bulletHole, clawMarks, plate, rivet, scuffs, shiftW, stencil, wrapI } from './d2kit';

/**
 * RESEARCH LABS · CONTAINMENT: straw-strewn pens and hay bales, heavy slab
 * floors scarred by claws and forklift tyres, board-formed concrete columns,
 * the specimen tank's algae-streaked back wall, blast doors, the SPECIMEN X
 * board, drains and hatches — the Holding Hall is the boss arena, on screen
 * longest, so it carries the most story: impact craters, drag trails,
 * gouges, painted arena markings.
 */

const N = NEUTRAL_HEX;

/** Pen straw (world): golden strands criss-crossing over darker matted straw, dung clumps, a trampled trail. 128 × 128. */
export function strawTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2straw',
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const s = k.ramp(0x9a8448, { light: 0.5, sat: 0.95 });
      const dung = k.ramp(0x4a3a22, { light: 0.4 });
      c.rect(0, 0, 128, 128, s, 2);
      for (let i = 0; i < 700; i++) {
        const x = rng.int(0, 127);
        const y = rng.int(0, 127);
        const a = rng.next() * Math.PI;
        const len = rng.int(3, 9);
        const t = rng.chance(0.3) ? 4 : rng.chance(0.5) ? 3 : 2.5;
        for (let j = 0; j < len; j++) c.set(wrapI(Math.round(x + Math.cos(a) * j), 128), wrapI(Math.round(y + Math.sin(a) * j), 128), s, t);
      }
      for (let i = 0; i < 8; i++) {
        const x = rng.int(4, 124);
        const y = rng.int(4, 124);
        c.ellipse(x, y, rng.int(2, 4), rng.int(1, 3), dung, (u, v) => (u + v < -0.5 ? 3.5 : 2));
      }
      for (let y = 0; y < 128; y++) for (let x = 50; x < 80; x++) if (bayer(x, y) < 0.3) c.shift(x, y, -1);
    },
    { wrap: true },
  );
}

/** A hay bale face (fit): compressed straw in flakes, two twine bands, loose ends. 32 × 24. */
export function baleTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2bale', 32, 24, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(0xc0a050, { light: 0.5, sat: 0.95 });
    const tw = k.ramp(0x6a4a2a, { light: 0.4 });
    for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) c.set(x, y, s, x % 6 === 0 ? 2 : (x * 7 + y * 3) % 5 === 0 ? 4 : 3);
    for (let i = 0; i < 40; i++) {
      const x = rng.int(0, 31);
      const y = rng.int(0, 23);
      c.line(x, y, x + rng.int(-3, 3), y + rng.int(1, 3), s, rng.chance(0.5) ? 4 : 2);
    }
    for (const y of [6, 17]) {
      c.hline(0, y, 32, tw, 3);
      c.hline(0, y + 1, 32, tw, 1.5);
    }
    c.frame(0, 0, 32, 24, s, 2);
  });
}

/**
 * The holding hall's slab floor (world): 2 m slabs with saw-cut joints, an
 * impact crater with radial cracks, forklift tyre tracks, claw gouges, drag
 * stains, concrete chunks. 128 × 128 (NEUTRAL).
 */
export function slabFloorTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2slabfloor',
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(N, { light: 0.45, sat: 0.5 });
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const sx = x >> 6;
          const sy = y >> 6;
          let t = 3 + (hash2(sx, sy, 5) - 0.5) * 0.5;
          if ((x & 63) === 0 || (y & 63) === 0) t = 1.25;
          else if ((x & 63) === 1 || (y & 63) === 1) t = 3.75;
          c.set(x, y, m, t);
        }
      }
      c.scatter(rng, 0, 0, 128, 128, 160, 0, -0.75, { shapes: 3 });
      c.scatter(rng, 0, 0, 128, 128, 60, 0, 0.75, { shapes: 2 });
      // Impact crater: a dished pit (shadowed upper-left rim, lit lower-right), radial cracks, chunks.
      const cx = 40;
      const cy = 86;
      c.ellipseShade(cx, cy, 9, 6, (d) => (d < 0.55 ? -1.5 : d < 0.8 ? -0.75 : 0));
      for (let y = -7; y <= 7; y++) for (let x = -10; x <= 10; x++) {
        const d = (x / 10) ** 2 + (y / 7) ** 2;
        if (d > 0.7 && d < 1 && x + y > 0) c.shift(cx + x, cy + y, 1);
      }
      for (let i = 0; i < 6; i++) crack(c, rng, cx + Math.cos(i) * 9, cy + Math.sin(i) * 6, rng.int(10, 22), i + rng.spread(0.3), { dt: -1.75, lip: 0.75, branch: 0.12 });
      for (let i = 0; i < 6; i++) c.cluster(cx + rng.int(-14, 14), cy + rng.int(-10, 10), rng.int(4, 9), 0, 1);
      // Forklift tracks: two parallel dark dashed bands.
      for (let x = 0; x < 128; x++) for (const y0 of [20, 30]) {
        const y = y0 + Math.round(Math.sin(x * 0.05) * 2);
        if (bayer(x, y) < 0.6) c.shift(x, y, -0.75);
        if (bayer(x, y + 1) < 0.4) c.shift(x, y + 1, -0.75);
      }
      clawMarks(c, 92, 50, 34, 0.35, { n: 4, gap: 4, depth: 2.5 });
      clawMarks(c, 70, 110, 26, -0.2, { n: 3, gap: 4, depth: 2 });
    },
    { wrap: true },
  );
  t.neutral = N;
  return t;
}

/** Board-formed round column (cylinder-wrapped; NEUTRAL): vertical staves, pour joints, bug holes, a gouge exposing rebar. 64 × 128. */
export function concreteColumnTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2conccolumn',
    64,
    128,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(N, { light: 0.45, sat: 0.5 });
      const rebar = k.ramp(0x8a4a24, { light: 0.45 });
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 64; x++) {
          const stave = Math.floor(x / 6);
          let t = 3 + (hash2(stave, Math.floor(y / 40), 3) - 0.5) * 0.5;
          if (x % 6 === 0) t -= 0.75;
          if (y % 40 === 0) t = 1.5;
          else if (y % 40 === 1) t = 3.75;
          c.set(x, y, m, t);
        }
      }
      c.scatter(rng, 0, 0, 64, 128, 60, 0, -1, { shapes: 3 });
      // A gouge: chipped concrete, two rusty rebars showing.
      c.ellipseShade(30, 70, 8, 12, (d) => (d < 0.7 ? -1.25 : d < 1 ? 0.75 : 0));
      for (let y = 60; y < 81; y++) {
        c.set(27, y, rebar, y % 3 ? 3 : 2);
        c.set(33, y, rebar, y % 3 ? 3 : 2);
      }
      for (let y = 0; y < 128; y += 6) for (let x = 0; x < 64; x++) if (hash2(x, y, 41) > 0.97) c.shift(x, y, -1);
    },
    { wrap: true },
  );
  t.neutral = N;
  return t;
}

/** Hazard stripes for painted floor bands (ribbon: u across 0.5 m, v along): worn yellow / black diagonals with scuffed edges. 16 × 32. */
export function hazardBandTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2hazardband',
    16,
    32,
    (c, k) => {
      const yel = k.ramp(0xe8c020, { light: 0.45 });
      const blk = k.ramp(0x1e1e22, { light: 0.4 });
      for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
        const s = Math.floor((x + y) / 8) % 2;
        c.set(x, y, s ? blk : yel, x === 0 || x === 15 ? 2 : 3);
      }
      for (let i = 0; i < 18; i++) c.cluster(k.rng.int(0, 15), k.rng.int(0, 31), k.rng.int(0, 3), 0, -1);
    },
    { wrap: true },
  );
}

/** The specimen tank's back wall (world): dark teal tiles, algae streaks, slime at the waterline, scratches. 128 × 128. */
export function tankWallTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2tankwall',
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const t = k.ramp(0x2a3c46, { light: 0.5, sat: 0.9 });
      const algae = k.ramp(0x2a5a38, { light: 0.5 });
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) c.set(x, y, t, (x & 15) === 0 || (y & 15) === 0 ? 2 : (x & 15) === 1 || (y & 15) === 1 ? 3.75 : 3);
      for (let i = 0; i < 18; i++) {
        const x = rng.int(0, 127);
        const len = rng.int(20, 90);
        for (let j = 0; j < len; j++) if (bayer(x, j) < 0.7 - j / len / 2) c.tint(x, j, algae, 0);
      }
      for (let i = 0; i < 4; i++) clawMarks(c, rng.int(10, 110), rng.int(20, 100), rng.int(16, 30), rng.range(0.6, 1.4), { n: 4, gap: 3, depth: 2 });
    },
    { wrap: true },
  );
}

/**
 * The SPECIMEN X board over the tank (fit, 6 × 2 m): a black riveted steel
 * board in a hazard frame, SPECIMEN X in red neon tubes, a CLASS 5
 * CONTAINMENT plate, warning triangles, a red skull pictogram. 192 × 64.
 */
export function specimenBoardTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2specimenboard', 192, 64, (c, k) => {
    const rng = k.rng;
    const b = k.ramp(0x18181e, { light: 0.45, sat: 0.6 });
    const yel = k.ramp(0xe8c020, { light: 0.45 });
    const blk = k.ramp(0x1a1a1e, { light: 0.4 });
    const red = k.ramp(0xff3020, { light: 0.6, sat: 1.1 });
    const cream = k.ramp(0xd8d0c0, { light: 0.4 });
    c.rect(0, 0, 192, 64, b, 2.5);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 192; x++) if (x < 4 || x >= 188 || y < 4 || y >= 60) c.set(x, y, Math.floor((x + y) / 5) % 2 ? blk : yel, 3);
    for (let x = 8; x < 188; x += 12) for (const y of [6, 57]) rivet(c, x, y, b, 3);
    const t = 'SPECIMEN X';
    const tw = textWidth(t, FONT_5x7, { scale: 4 });
    neonText(c, t, Math.round((192 - tw) / 2), 9, FONT_5x7, red, { scale: 4, core: 5, halo: 2 });
    plate(c, 46, 43, 100, 12, cream, { tone: 3 });
    const t2 = 'CLASS 5 CONTAINMENT';
    drawText(c, t2, 46 + Math.round((100 - textWidth(t2, FONT_3x5)) / 2), 47, FONT_3x5, blk, 1);
    for (const x of [16, 162]) {
      c.poly([x, 54, x + 7, 42, x + 14, 54], yel, 3);
      c.vline(x + 7, 46, 4, blk, 1);
      c.set(x + 7, 52, blk, 1);
    }
    bulletHole(c, rng, 150, 20);
    clawMarks(c, 20, 10, 24, 1.0, { n: 4, gap: 3, depth: 2, wrap: false });
  });
}

/** A heavy blast door leaf (fit; 16 texels a metre): ribs, hazard chevrons, a stencilled X, rivets, dents, gouges. 58 × 100. */
export function blastDoorTile(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`d2blastdoor|${variant}`, 58, 100, (c, k) => {
    const rng = k.rng;
    const m = k.ramp(0x5e646c, { light: 0.55, sat: 0.6 });
    const yel = k.ramp(0xe0b020, { light: 0.45 });
    const blk = k.ramp(0x1a1a1e, { light: 0.4 });
    const ink = k.ramp(0xc02020, { light: 0.45 });
    for (let y = 0; y < 100; y++) for (let x = 0; x < 58; x++) c.set(x, y, m, y % 20 === 0 ? 1.5 : y % 20 === 1 ? 4 : 3);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 58; x++) if (x < 6 || x >= 52) c.set(x, y, Math.floor((y + (x < 6 ? x : -x)) / 4) % 2 ? blk : yel, 3);
    for (let y = 4; y < 100; y += 10) for (const x of [8, 49]) rivet(c, x, y, m, 3);
    stencil(c, 'X', 16, 30, FONT_5x7, ink, { scale: 5, tone: 3, rng, runs: 2 });
    c.ellipseShade(38, 70, 6, 8, (d) => (d > 0.6 ? 0.75 : -1));
    clawMarks(c, 30, 76, 22, 1.3, { n: 4, gap: 3, depth: 2.5, wrap: false });
    if (variant) bulletHole(c, rng, 20, 20);
  });
}

/** A round drain grate (fit on a disc, cut out round): slots, a rim, rust. 40 × 40. */
export function drainTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2drain', 40, 40, (c, k) => {
    const m = k.ramp(0x3a3e44, { light: 0.55, sat: 0.6 });
    const voidR = k.ramp(0x0a0c10, { light: 0.4 });
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20);
      if (d > 19.5) continue;
      if (d > 17) c.set(x, y, m, x + y < 40 ? 4 : 2);
      else c.set(x, y, (y % 4 < 2 && Math.abs(x - 20) < 15) ? voidR : m, y % 4 === 2 ? 3.5 : 2.5);
    }
    c.scatter(k.rng, 4, 4, 32, 32, 10, 0, -0.75, { shapes: 3 });
  });
}

/** Stencilled arena markings for the walls (cut out): HOLDING HALL X with a red rule. */
export function hallMarkTile(atlas: PwAtlas, text: string, scale: number, hex = 0xd8d0b8): { tile: PwTile; wM: number; hM: number } {
  const tw = textWidth(text, FONT_5x7, { scale });
  const W = tw + 8;
  const H = 7 * scale + 10;
  const tile = atlas.tile(`d2hallmark|${text}|${scale}|${hex.toString(16)}`, W, H, (c, k) => {
    const ink = k.ramp(hex, { light: 0.45 });
    const red = k.ramp(0xb02018, { light: 0.45 });
    stencil(c, text, 4, 2, FONT_5x7, ink, { scale, tone: 3, rng: k.rng, runs: 4, overspray: false });
    for (let x = 4; x < W - 4; x++) {
      c.set(x, H - 4, red, 3);
      c.set(x, H - 3, red, 2.5);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (c.at(x, y) && hash2(x, y, 29) > 0.88) c.set(x, y, 0, 0);
  });
  return { tile, wM: W / 32, hM: H / 32 };
}

/** A drag trail of blood across a floor (cut out, 1 × 3 m). 32 × 96. */
export function dragTrailTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2dragtrail', 32, 96, (c, k) => {
    const rng = k.rng;
    bloodSplat(c, rng, k, 16, 8, 6, { wrap: false, dir: Math.PI / 2 });
    bloodSmear(c, k, 16, 10, 12, 90, 5, { wrap: false });
    bloodSmear(c, k, 19, 30, 22, 80, 2, { wrap: false });
  });
}

/** A park-poster-style warning painted at the cell pens (cut out): a T. rex head silhouette in a red ring. 32 × 32. */
export function dangerPictoTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2dangerpicto', 32, 32, (c, k) => {
    const red = k.ramp(0xc02020, { light: 0.45 });
    const w = k.ramp(0xe8e0c8, { light: 0.4 });
    const blk = k.ramp(0x1a1a1e, { light: 0.4 });
    c.ellipse(16, 16, 15, 15, red, 3);
    c.ellipse(16, 16, 12, 12, w, 3);
    silhouette(c, REX, 5, 9, 22, 14, blk, { shade: false, tone: 2 });
    for (let i = -9; i < 10; i++) {
      c.set(16 + i, 16 - i, red, 3);
      c.set(17 + i, 16 - i, red, 3);
    }
    void scuffs;
    void shiftW;
    void PWF;
  });
}

/**
 * The containment dado (world, v from the floor, 2.4 m): heavy teal enamel
 * over the concrete, a yellow / black hazard rail at the top, chipped edges
 * showing the grey beneath, kick marks, a stencilled bay number. 64 × 80.
 */
export function dadoTile(atlas: PwAtlas, hex = 0x2a4a4a): PwTile {
  return atlas.tile(
    `d2dado|${hex.toString(16)}`,
    64,
    80,
    (c, k) => {
      const rng = k.rng;
      const paint = k.ramp(hex, { light: 0.45, sat: 0.9 });
      const conc = k.ramp(0x6a6a70, { light: 0.4 });
      const yel = k.ramp(0xe0b020, { light: 0.45 });
      const blk = k.ramp(0x1a1a1e, { light: 0.4 });
      const top = 80 - 77; // 2.4 m
      for (let y = 0; y < 80; y++) {
        for (let x = 0; x < 64; x++) {
          if (y < top) continue;
          if (y < top + 4) c.set(x, y, Math.floor((x + y) / 4) % 2 ? blk : yel, y === top ? 4 : y === top + 3 ? 2 : 3);
          else c.set(x, y, paint, y === top + 4 ? 1.75 : y > 76 ? 2 : (x & 31) === 0 ? 2.25 : 3);
        }
      }
      // Panel seams, chips showing the concrete, kick marks.
      for (let i = 0; i < 16; i++) {
        const x = rng.int(0, 63);
        const y = rng.int(top + 5, 78);
        c.cluster(x, y, rng.int(0, 9), conc, 3);
      }
      scuffs(c, rng, 0, 66, 64, 12, 12, -1);
      for (let x = 0; x < 64; x++) for (let y = 70; y < 80; y++) if (bayer(x, y) < (y - 70) / 14) c.shift(x, y, -0.75);
    },
    { wrap: true },
  );
}

/** Floor stencil lettering (cut out, laid flat): KEEP CLEAR in worn yellow with a border line. */
export function floorStencilTile(atlas: PwAtlas, text: string, scale = 4): PwTile {
  const tw = textWidth(text, FONT_5x7, { scale, spacing: 1 });
  const W = tw + 12;
  const H = 7 * scale + 14;
  return atlas.tile(`d2floorstencil|${text}|${scale}`, W, H, (c, k) => {
    const ink = k.ramp(0xd8b020, { light: 0.4, sat: 0.9 });
    for (let x = 2; x < W - 2; x++) {
      c.set(x, 2, ink, 3);
      c.set(x, 3, ink, 3);
      c.set(x, H - 4, ink, 3);
      c.set(x, H - 3, ink, 3);
    }
    drawText(c, text, 6, 7, FONT_5x7, ink, 3, { scale, spacing: 1 });
    // Worn by feet and claws: the paint flakes in patches.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (c.at(x, y) && (hash2(x >> 1, y >> 1, 13) > 0.8 || hash2(x, y, 14) > 0.93)) c.set(x, y, 0, 0);
  });
}

/** A huge warning X painted on the tank's back wall (cut out): red bars with a hazard border, splashed and clawed. 96 × 96. */
export function tankXTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2tankx', 96, 96, (c, k) => {
    const red = k.ramp(0xa01818, { light: 0.45, sat: 1.0 });
    const yel = k.ramp(0xe0b020, { light: 0.45 });
    for (let i = 0; i < 96; i++) {
      for (let w = -7; w <= 7; w++) {
        const edge = Math.abs(w) >= 6;
        c.set(i + w, i, edge ? yel : red, edge ? 3 : 3);
        c.set(95 - i + w, i, edge ? yel : red, edge ? 3 : 3);
      }
    }
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (c.at(x, y) && hash2(x >> 2, y >> 2, 7) > 0.85) c.set(x, y, 0, 0);
    clawMarks(c, 30, 40, 40, 1.1, { n: 4, gap: 4, depth: 3, wrap: false });
  });
}
