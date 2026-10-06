import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, textWidth } from './font';
import { NEUTRAL_HEX } from './retexture';
import { crack, hash2 } from './surfaces';
import { bloodSplat, clawMarks, plate, recordFit, rivet, scuffs, shiftW, stencil, waterStain, wrapI } from './d2kit';

/**
 * RESEARCH LABS · the SERVICE LEVEL (maintenance tunnels, pump room): a
 * walkway deck of grating plates with hazard-striped edges, tunnel walls of
 * board-formed concrete over green corrugated cladding, painted pipes with
 * flanges, oil-stained floor slabs, coolant tanks, pump motors with cooling
 * fins and nameplates.
 */

const N = NEUTRAL_HEX;

/**
 * The tunnel walkway (a ribbon along the rail: u across 5.5 m, v along):
 * grating plates in 1 m frames, hazard-striped kick strips at both edges, a
 * drain gutter, scuffs and a dragged blood trail. 176 × 64.
 */
export function tunnelDeckTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2tunneldeck',
    176,
    64,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(0x565a60, { light: 0.55, sat: 0.6 });
      const voidR = k.ramp(0x101216, { light: 0.4 });
      const yel = k.ramp(0xe8c020, { light: 0.45 });
      const blk = k.ramp(0x1a1a1e, { light: 0.4 });
      const W = 166;
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 176; x++) {
          if (x >= W) {
            c.set(x, y, m, 2);
            continue;
          }
          // Edges: concrete gutter (0…4), hazard strip (5…14), the grating between.
          const e = Math.min(x, W - 1 - x);
          if (e < 5) c.set(x, y, voidR, e === 4 ? 2 : 1.5);
          else if (e < 15) c.set(x, y, Math.floor((y + (x < W / 2 ? x : -x)) / 5) % 2 ? blk : yel, e === 5 ? 4 : e === 14 ? 2 : 3);
          else {
            // Chequer plate walkway (low-frequency: no shimmer at grazing angles): raised lozenges, plate seams.
            const ly = y % 32;
            const lx = e - 15;
            if (ly === 0 || ly === 1) c.set(x, y, m, ly === 0 ? 1.5 : 3.75);
            else {
              const dx = lx % 8;
              const dy = y % 8;
              const loz = (dx + dy) % 8 === 3 && ((Math.floor(lx / 8) + Math.floor(y / 8)) % 2 === 0) ? 4 : (dx + 8 - dy) % 8 === 3 && ((Math.floor(lx / 8) + Math.floor(y / 8)) % 2 === 1) ? 4 : 0;
              c.set(x, y, m, loz || 2.75);
            }
          }
        }
      }
      // Bolts at the plate frames, scuffs, a dragged blood trail along the walk.
      for (let x = 20; x < W - 20; x += 16) rivet(c, x, 2, m, 3);
      scuffs(c, rng, 15, 0, W - 30, 64, 20, 1);
      for (let y = 0; y < 64; y++) {
        const x = Math.round(70 + Math.sin(y * 0.15) * 4);
        if (bayer(x, y) < 0.7) c.set(x, y, k.ramp(0x5a0808, { light: 0.35 }), 1.5);
        if (bayer(x + 1, y) < 0.4) c.set(x + 1, y, k.ramp(0x5a0808, { light: 0.35 }), 2);
      }
    },
    { wrap: true },
  );
}

/**
 * Tunnel wall elevation (a vertical ribbon along the tunnel: u along, v from the
 * floor, 3.5 m): green corrugated cladding to 1.2 m (ribs, laps, bolts, rust,
 * kicks), a painted yellow line, board-formed concrete above with tie holes,
 * water stains and soot from the lamps. 128 × 112.
 */
export function tunnelWallTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2tunnelwall',
    128,
    112,
    (c, k) => {
      const rng = k.rng;
      const conc = k.ramp(0x666462, { light: 0.45, sat: 0.6 });
      const clad = k.ramp(0x3e5a48, { light: 0.5, sat: 0.9 });
      const rust = k.ramp(0x8a4a24, { light: 0.4 });
      const yel = k.ramp(0xd0a820, { light: 0.45 });
      const H = 112;
      const cladTop = H - 38;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < 128; x++) {
          if (y >= cladTop) {
            // Ribs 8 texels apart in 2-texel bands (a 4-texel rib crawls in motion).
            const RIB = [3.75, 3.75, 3, 3, 2, 2, 2.5, 2.5];
            let t = RIB[x % 8];
            if (y === cladTop) t = 4.5;
            else if (y === cladTop + 1) t = 1.5;
            if ((x & 63) === 0) t = 1.25;
            c.set(x, y, clad, t);
          } else {
            const course = Math.floor(y / 8);
            const ly = y % 8;
            let t = 3 + (hash2(Math.floor((x + course * 19) / 48), course, 7) - 0.5) * 0.5;
            if (ly === 0) t -= 0.75;
            else if (ly === 7) t += 0.5;
            c.set(x, y, conc, t);
          }
        }
      }
      // Painted yellow line over the cladding.
      for (let x = 0; x < 128; x++) {
        c.set(x, cladTop - 3, yel, 3.5);
        c.set(x, cladTop - 2, yel, 3);
      }
      // Bolts on the cladding laps, rust runs, kicks.
      for (let x = 2; x < 128; x += 8) for (const y of [cladTop + 3, H - 3]) rivet(c, x, y, clad, 3);
      for (let i = 0; i < 12; i++) {
        const x = rng.int(0, 127);
        const y0 = cladTop + 4;
        const len = rng.int(6, 26);
        for (let j = 0; j < len; j++) if (bayer(x, y0 + j) < 1 - j / len) c.tint(x, Math.min(H - 1, y0 + j), rust, -0.25);
      }
      scuffs(c, rng, 0, H - 14, 128, 12, 16, -1);
      // Tie holes, water stains seeping down, soot.
      for (let ty = 10; ty < cladTop - 6; ty += 24) for (let tx = 16; tx < 128; tx += 32) {
        c.set(tx, ty, conc, 1);
        c.set(tx + 1, ty + 1, conc, 4);
      }
      for (let i = 0; i < 6; i++) {
        const x = rng.int(0, 127);
        const len = rng.int(20, 60);
        for (let j = 0; j < len; j++) for (let q = 0; q < 3; q++) if (bayer(x + q, j) < 0.55 - (j / len) * 0.5) shiftW(c, x + q, j, -0.75);
      }
      for (let y = 0; y < 20; y++) for (let x = 0; x < 128; x++) if (bayer(x, y) < (20 - y) / 40) c.shift(x, y, -0.75);
      crack(c, rng, 90, 20, 30, Math.PI / 2, { dt: -1.5, lip: 0.75, branch: 0.1 });
    },
    { wrap: true },
  );
}

/** Painted pipe skin (cylinder-wrapped; NEUTRAL): a bolted flange every 2 m, a colour band, chipped paint, rust spots, a drip. 32 × 64. */
export function pipeTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2pipe',
    32,
    64,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(N, { light: 0.55, sat: 0.6 });
      const rust = k.ramp(0x8a4a24, { light: 0.4 });
      c.rect(0, 0, 32, 64, m, 3);
      // Flange (rows 0…4): a raised collar with bolt heads.
      for (let y = 0; y < 5; y++) c.hline(0, y, 32, m, y === 0 ? 4.5 : y === 4 ? 1.5 : 3.5);
      for (let x = 2; x < 32; x += 6) c.set(x, 2, m, 1);
      // A band (a darker painted ring) and chips.
      for (let y = 30; y < 34; y++) c.hline(0, y, 32, m, y === 30 ? 2 : 1.75);
      c.scatter(rng, 0, 6, 32, 56, 18, 0, -1, { shapes: 4 });
      for (let i = 0; i < 4; i++) c.cluster(rng.int(0, 30), rng.int(8, 60), rng.int(2, 9), rust, 2.5);
      for (let j = 0; j < 14; j++) if (bayer(16, 6 + j) < 1 - j / 14) c.tint(16, 6 + j, rust, -0.25);
    },
    { wrap: true },
  );
  t.neutral = N;
  return t;
}

/** Oil-stained floor slabs (world): saw-cut joints every 2 m, trowel arcs, oil blots, a painted walkway line, scuffs. 128 × 128. */
export function oilyConcreteTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(
    `d2oilfloor|${hex.toString(16)}`,
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(hex, { light: 0.45, sat: 0.6 });
      const oil = k.ramp(0x1e1c22, { light: 0.55, sat: 1.0 });
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          let t = 3;
          if ((x & 63) === 0 || (y & 63) === 0) t = 1.5;
          else if ((x & 63) === 1 || (y & 63) === 1) t = 3.75;
          else if (Math.abs(Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) * Math.cos(y * 0.09)) > 0.95) t = 3.5;
          c.set(x, y, m, t);
        }
      }
      c.scatter(rng, 0, 0, 128, 128, 50, 0, -0.75, { shapes: 3 });
      for (let i = 0; i < 5; i++) {
        const cx = rng.int(8, 120);
        const cy = rng.int(8, 120);
        const rx = rng.int(4, 11);
        const ry = rng.int(3, 7);
        for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
          const d = (x / rx) ** 2 + (y / ry) ** 2 + (hash2(cx + x, cy + y, 3) - 0.5) * 0.4;
          if (d > 1) continue;
          // Solid dark pool, a dithered rim, one small off-centre sheen (a centred one reads as a ring / a letter O).
          const rim = d > 0.72;
          const sheen = !rim && Math.abs(x / rx + 0.35) < 0.12 && y < 0 && y > -ry * 0.7;
          c.set(wrapI(cx + x, 128), wrapI(cy + y, 128), oil, rim ? (bayer(cx + x, cy + y) < 0.5 ? 1.75 : 2.25) : sheen ? 2.5 : 1);
        }
      }
      crack(c, rng, 30, 90, 26, 0.3, { dt: -1.5, lip: 0.75, branch: 0.1 });
      scuffs(c, rng, 0, 0, 128, 128, 30, -0.75);
    },
    { wrap: true },
  );
}

/** Coolant tank skin (cylinder-wrapped along its axis; NEUTRAL): weld seams, rivet rows, a stencil band, rust weeping from the seams. 64 × 64. */
export function tankSkinTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2tankskin',
    64,
    64,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(N, { light: 0.5, sat: 0.6 });
      const rust = k.ramp(0x8a4a24, { light: 0.4 });
      c.rect(0, 0, 64, 64, m, 3);
      for (let y = 0; y < 64; y += 32) {
        c.hline(0, y, 64, m, 1.5);
        c.hline(0, y + 1, 64, m, 4);
        for (let x = 2; x < 64; x += 5) c.set(x, y + 3, m, 4.5);
      }
      c.vline(20, 0, 64, m, 1.5);
      c.vline(21, 0, 64, m, 3.75);
      for (let i = 0; i < 8; i++) {
        const x = rng.int(0, 63);
        const y0 = rng.int(0, 1) * 32 + 2;
        const len = rng.int(6, 20);
        for (let j = 0; j < len; j++) if (bayer(x, y0 + j) < 1 - j / len) c.tint(x, wrapI(y0 + j, 64), rust, 0);
      }
      c.scatter(rng, 0, 0, 64, 64, 14, 0, -0.75, { shapes: 4 });
    },
    { wrap: true },
  );
  t.neutral = N;
  return t;
}

/** Motor housing with cooling fins (cylinder-wrapped; NEUTRAL): fins every 3 texels round the axis, a terminal box seam. 32 × 32. */
export function motorTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2motor',
    32,
    32,
    (c, k) => {
      const m = k.ramp(N, { light: 0.55, sat: 0.6 });
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, m, y % 3 === 0 ? 4.25 : y % 3 === 1 ? 3 : 1.5);
      c.scatter(k.rng, 0, 0, 32, 32, 6, 0, -0.75, { shapes: 3 });
    },
    { wrap: true },
  );
  t.neutral = N;
  return t;
}

/** A pump housing face (fit, 1.4 × 1.2 m): louvred grille, a riveted nameplate PUMP n, a hazard label, oil streaks. 45 × 38. */
export function pumpFaceTile(atlas: PwAtlas, n: number): PwTile {
  return atlas.tile(`d2pumpface|${n}`, 45, 38, (c, k) => {
    const m = k.ramp(0x5e646c, { light: 0.55, sat: 0.6 });
    const plateR = k.ramp(0xc8a24c, { light: 0.5 });
    const ink = k.ramp(0x1a1a1e, { light: 0.4 });
    const yel = k.ramp(0xe0b020, { light: 0.45 });
    c.rect(0, 0, 45, 38, m, 3);
    c.frame(0, 0, 45, 38, m, 1.5);
    c.hline(0, 0, 45, m, 4);
    for (let y = 18; y < 34; y += 2) {
      c.hline(4, y, 26, m, 1.25);
      c.hline(4, y + 1, 26, m, 4);
    }
    plate(c, 4, 4, 26, 10, plateR, { tone: 3 });
    drawText(c, `PUMP ${n}`, 7, 7, FONT_3x5, ink, 1.5);
    c.poly([34, 14, 38, 6, 42, 14], yel, 3);
    c.set(38, 10, ink, 1);
    for (const [x, y] of [[2, 2], [41, 2], [2, 34], [41, 34]]) rivet(c, x, y, m, 3);
    for (let j = 0; j < 12; j++) if (bayer(36, 20 + j) < 1 - j / 12) c.shift(36, 20 + j, -1);
  });
}

/** A stencilled tank label plate (fit): COOLANT / H2O with a hazard diamond. 48 × 16. */
export function tankLabelTile(atlas: PwAtlas, text: string): PwTile {
  return atlas.tile(`d2tanklabel|${text}`, 48, 16, (c, k) => {
    const p = k.ramp(0xe8e0c0, { light: 0.4 });
    const ink = k.ramp(0x1a1a1e, { light: 0.4 });
    const red = k.ramp(0xc02020, { light: 0.45 });
    plate(c, 0, 0, 48, 16, p, { tone: 3 });
    const tw = textWidth(text, FONT_5x7);
    drawText(c, text, 14 + Math.round((32 - tw) / 2), 4, FONT_5x7, ink, 2);
    c.poly([7, 2, 13, 8, 7, 14, 1, 8], red, 3);
    c.poly([7, 4, 11, 8, 7, 12, 3, 8], p, 3);
    c.scatter(k.rng, 1, 1, 46, 14, 8, 0, -1, { shapes: 3 });
  });
}

/**
 * A stencilled wall marking (cut out): text (+ an arrow), runs, worn in 2-texel
 * flakes. `scale` (2 or 4 texels a glyph pixel, text on whole glyph cells, so
 * the levels keep the letters whole) laid at `D` texels a metre.
 */
export function wallMarkTile(atlas: PwAtlas, text: string, hex: number, scale: 2 | 4 = 2, arrow: -1 | 0 | 1 = 1, D = 32): { tile: PwTile; wM: number; hM: number; w: number; h: number } {
  const tw = textWidth(text, FONT_5x7, { scale });
  const m = scale;
  const aw = arrow ? 7 * scale + 2 * scale : 0;
  const W = tw + 2 * m + aw;
  const H = 7 * scale + 2 * m;
  const key = `d2wallmark|${text}|${hex.toString(16)}|${scale}|${arrow}`;
  recordFit(key, text, W - aw, H, tw, 7 * scale, m);
  const tile = atlas.tile(key, W, H, (c, k) => {
    const ink = k.ramp(hex, { light: 0.45 });
    const x0 = arrow < 0 ? aw + m : m;
    stencil(c, text, x0, m, FONT_5x7, ink, { scale, tone: 3, rng: k.rng, runs: 2, overspray: false });
    if (arrow) {
      const ax = arrow > 0 ? tw + 2 * m : m;
      const cy = m + Math.round(3.5 * scale);
      const L = 7 * scale;
      for (let i = 0; i < L; i++) {
        const x = arrow > 0 ? ax + i : ax + L - 1 - i;
        const hh = i > L - 3 * scale ? L - i : scale >> 1;
        for (let j = -hh; j < hh; j++) c.set(x, cy + j, ink, 3);
      }
    }
    // Worn paint: flakes in 2-texel clusters (never per-texel speckle: the marks must read at a distance).
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (c.at(x, y) && hash2(x >> 1, y >> 1, 23) > 0.95) c.set(x, y, 0, 0);
  });
  return { tile, wM: W / D, hM: H / D, w: W, h: H };
}

/** Keep the shared helpers referenced. */
export const _serviceRefs = [bloodSplat, clawMarks, waterStain, PWF];
