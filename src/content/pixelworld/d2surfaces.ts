import { bayer } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { NEUTRAL_HEX } from './retexture';
import { crack, darken, hash2, smooth } from './surfaces';
import { h6, rivet, shiftW, wrapI } from './d2kit';

/**
 * RESEARCH LABS generic re-paint set: NEUTRAL tiles (painted round a light grey,
 * tinted per material by vertex colour) for everything the room converters do
 * not paint by hand — props, frames, fixtures, furniture. Each is a designed
 * surface (panels, boards, brushed sheet, cast concrete) rather than noise, so
 * even a re-painted crate or bracket reads as a painted object.
 */

const N = NEUTRAL_HEX;

function neutral(t: PwTile): PwTile {
  t.neutral = N;
  return t;
}

/** Painted steel (machinery, frames, brackets): 32-texel panels, lit seam lips, rivet rows, chipped paint, scratches, a dent. 64 × 64. */
export function d2MetalTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2metal',
      64,
      64,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.5, sat: 0.6 });
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 64; x++) {
            const lx = x & 31;
            const ly = y & 31;
            let t = smooth(x, y, 64, 64, 4, 12) > 0.66 ? 2.75 : 3;
            if (ly === 0) t = 1;
            else if (ly === 1) t = 4;
            else if (lx === 0) t = 1.25;
            else if (lx === 1) t = 3.75;
            else if (ly === 31) t = 2.25;
            c.set(x, y, m, t);
          }
        }
        // Rivet rows under each seam.
        for (let y = 0; y < 64; y += 32) for (let x = 5; x < 64; x += 8) rivet(c, x, y + 3, m, 3);
        // Chipped paint near the seams (darker primer showing), scratches (bright metal).
        for (let i = 0; i < 14; i++) {
          const sx = rng.int(0, 63);
          const sy = (rng.int(0, 1) * 32 + rng.int(2, 6)) & 63;
          c.cluster(sx, sy, rng.int(0, 9), 0, -1);
        }
        for (let i = 0; i < 6; i++) {
          const x = rng.int(4, 56);
          const y = rng.int(4, 56);
          c.lineShade(x, y, x + rng.int(3, 8), y + rng.int(-3, 3), 1.25);
        }
        // A dent: lit upper-left rim, shadowed lower-right.
        c.ellipseShade(44, 46, 5, 4, (d) => (d > 0.65 ? 0.75 : -0.5));
        // Grime running down from the seams.
        for (let i = 0; i < 6; i++) {
          const x = rng.int(0, 63);
          const y0 = rng.int(0, 1) * 32 + 2;
          const len = rng.int(5, 16);
          for (let j = 0; j < len; j++) if (bayer(x, y0 + j) < 1 - j / len) shiftW(c, x, y0 + j, -0.5);
        }
      },
      { wrap: true },
    ),
  );
}

/** Brushed stainless (benches, counters, hoods, tanks): horizontal grain runs, a panel joint, smudges, scratches. 64 × 64. */
export function d2SteelTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2steel',
      64,
      64,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.6, sat: 0.4 });
        c.rect(0, 0, 64, 64, m, 3);
        // Brushed grain: long horizontal runs a quarter step lighter / darker.
        for (let y = 0; y < 64; y++) {
          let x = rng.int(0, 63);
          const runs = 3 + (y % 3);
          for (let r = 0; r < runs; r++) {
            const len = rng.int(5, 16);
            const t = rng.chance(0.55) ? 3.5 : 2.6;
            for (let j = 0; j < len; j++) c.set(wrapI(x + j, 64), y, m, t);
            x += len + rng.int(2, 10);
          }
        }
        // Panel joint (vertical) with a lit lip.
        c.vline(0, 0, 64, m, 1);
        c.vline(1, 0, 64, m, 4.5);
        // Smudges (dithered) and scratches.
        for (let i = 0; i < 4; i++) {
          const x = rng.int(6, 58);
          const y = rng.int(6, 58);
          c.ellipseShade(x, y, rng.int(3, 6), rng.int(2, 4), (d) => (bayer(x, y) < 0.5 && d < 0.9 ? -0.5 : 0));
        }
        for (let i = 0; i < 5; i++) {
          const x = rng.int(4, 56);
          const y = rng.int(4, 56);
          c.lineShade(x, y, x + rng.int(4, 9), y + rng.int(-4, 4), 1.5);
        }
      },
      { wrap: true },
    ),
  );
}

/** Timber boards (vertical / horizontal): 8-texel boards with their own tone, wavy grain, knots, gaps, nail heads. 64 × 64. */
export function d2WoodTile(atlas: PwAtlas, horizontal = false): PwTile {
  return neutral(
    atlas.tile(
      `d2wood|${horizontal ? 'h' : 'v'}`,
      64,
      64,
      (c, k) => {
        const rng = k.rng;
        const w = k.ramp(N, { light: 0.45, sat: 0.9 });
        const PW = 8;
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 64; x++) {
            const a = horizontal ? y : x;
            const b = horizontal ? x : y;
            const board = Math.floor(a / PW);
            const la = a % PW;
            const bt = [3, 2.75, 3.25, 3, 2.75, 3.25, 3, 3][board % 8];
            let t = la === 0 ? 1 : la === 1 ? bt + 0.75 : la === PW - 1 ? bt - 0.75 : bt;
            // Grain: wavy darker lines along the board.
            if (la > 1 && la < PW - 1) {
              const g = Math.sin((b + board * 23) * 0.11 + la * 1.7 + Math.sin(b * 0.05 + board) * 2);
              if (g > 0.93) t -= 0.75;
              else if (g < -0.97) t += 0.5;
            }
            // Butt joint once per board.
            if (b === Math.floor(hash2(board, 1, 5) * 64)) t = 1;
            c.set(x, y, w, t);
          }
        }
        // Knots and nail heads.
        for (let i = 0; i < 3; i++) {
          const bd = rng.int(0, 7);
          const ka = bd * PW + 4;
          const kb = rng.int(4, 60);
          const [x, y] = horizontal ? [kb, ka] : [ka, kb];
          c.ellipse(x, y, horizontal ? 2 : 1.4, horizontal ? 1.4 : 2, w, 1.5);
          c.set(x, y, w, 0.5);
        }
        for (let bd = 0; bd < 8; bd++) {
          const jb = Math.floor(hash2(bd, 1, 5) * 64);
          for (const off of [2, -3]) {
            const a = bd * PW + 3;
            const b = wrapI(jb + off, 64);
            const [x, y] = horizontal ? [b, a] : [a, b];
            c.set(x, y, w, 0.5);
            c.set(x + 1, y + 1, w, 4);
          }
        }
      },
      { wrap: true },
    ),
  );
}

/**
 * Board-formed cast concrete (labs' service and containment walls): plank
 * imprints in 5-texel courses (each its own tone, a lit lower lip), form-tie
 * holes on a grid, bug holes, a crack or two, efflorescence and rust runs. 128 × 128.
 */
export function d2ConcreteTile(atlas: PwAtlas, o: { ties?: boolean } = {}): PwTile {
  return neutral(
    atlas.tile(
      `d2concrete|${o.ties === false ? 0 : 1}`,
      128,
      128,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.45, sat: 0.5 });
        const rust = k.ramp(0xb08868, { light: 0.4 });
        const BH = 8;
        for (let y = 0; y < 128; y++) {
          const course = Math.floor(y / BH);
          const ly = y % BH;
          for (let x = 0; x < 128; x++) {
            // Board ends stagger per course.
            const bl = 48;
            const off = (course * 19) % bl;
            const bx = Math.floor((x + off) / bl);
            const lx = (x + off) % bl;
            let t = 3 + (hash2(bx, course, 7) - 0.5) * 0.5;
            if (smooth(x, y, 128, 128, 4, 21) > 0.7) t -= 0.5;
            if (ly === 0) t -= 0.75;
            else if (ly === BH - 1) t += 0.5;
            if (lx === 0 && hash2(bx, course, 9) > 0.4) t -= 0.5;
            c.set(x, y, m, t);
          }
        }
        // Bug holes (small voids with a lit lower lip).
        for (let i = 0; i < 60; i++) {
          const x = rng.int(0, 127);
          const y = rng.int(0, 127);
          shiftW(c, x, y, -1.5);
          shiftW(c, x, y + 1, 0.75);
        }
        // Form-tie holes on a 32 × 32 grid (plugged, darker), rust runs below some.
        if (o.ties !== false) {
          for (let ty = 12; ty < 128; ty += 32) {
            for (let tx = 16; tx < 128; tx += 32) {
              c.ellipse(tx, ty, 1.6, 1.6, m, 1.25);
              c.set(tx + 1, ty + 1, m, 4);
              if (hash2(tx, ty, 3) > 0.5) {
                const len = rng.int(6, 18);
                for (let j = 2; j < len; j++) if (bayer(tx, ty + j) < 1 - j / len) c.tint(tx, wrapI(ty + j, 128), rust, -0.25);
              }
            }
          }
        }
        // Cracks and water streaks.
        for (let i = 0; i < 2; i++) crack(c, rng, rng.int(0, 127), rng.int(0, 127), rng.int(14, 30), Math.PI / 2 + rng.spread(0.5), { dt: -1.5, lip: 0.75, branch: 0.08 });
        for (let i = 0; i < 8; i++) {
          const x = rng.int(0, 127);
          const y = rng.int(0, 127);
          const len = rng.int(12, 40);
          const w = rng.int(1, 3);
          for (let j = 0; j < len; j++) for (let q = 0; q < w; q++) if (bayer(x + q, y + j) < 0.55 - (j / len) * 0.4) shiftW(c, x + q, y + j, -0.5);
        }
      },
      { wrap: true },
    ),
  );
}

/** Trowelled plaster / render: broad sweeping trowel arcs (half-step tones, dithered edges), pocks, hairline cracks. 128 × 128. */
export function d2PlasterTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2plaster',
      128,
      128,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.4, sat: 0.7 });
        c.rect(0, 0, 128, 128, m, 3);
        // Trowel sweeps: arcs of slightly lighter / darker render.
        for (let i = 0; i < 26; i++) {
          const cx = rng.int(0, 127);
          const cy = rng.int(0, 127);
          const r = rng.int(10, 26);
          const a0 = rng.next() * Math.PI * 2;
          const sweep = rng.range(0.8, 1.6);
          const dt = rng.chance(0.5) ? 0.5 : -0.5;
          const thick = rng.int(3, 6);
          for (let a = 0; a < sweep; a += 1 / r) {
            for (let q = 0; q < thick; q++) {
              const rr = r + q;
              const x = Math.round(cx + Math.cos(a0 + a) * rr);
              const y = Math.round(cy + Math.sin(a0 + a) * rr * 0.6);
              if ((q === 0 || q === thick - 1) && bayer(x, y) < 0.5) continue;
              shiftW(c, x, y, dt);
            }
          }
        }
        c.scatter(rng, 0, 0, 128, 128, 50, 0, -1, { shapes: 3 });
        c.scatter(rng, 0, 0, 128, 128, 30, 0, 0.75, { shapes: 2 });
        for (let i = 0; i < 2; i++) crack(c, rng, rng.int(0, 127), rng.int(0, 127), rng.int(10, 24), Math.PI / 2 + rng.spread(0.7), { dt: -1.5, lip: 0.75, branch: 0.06 });
      },
      { wrap: true },
    ),
  );
}

/** Painted / plain board (signage backs, paper, voids): flat with faint brush strokes and a few chips. 64 × 64. */
export function d2PlainTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2plain',
      64,
      64,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.4, sat: 0.7 });
        c.rect(0, 0, 64, 64, m, 3);
        for (let y = 0; y < 64; y += 3) {
          const x = rng.int(0, 63);
          const len = rng.int(6, 20);
          for (let j = 0; j < len; j++) if (bayer(x + j, y) < 0.6) shiftW(c, x + j, y, rng.chance(0.5) ? 0.25 : -0.25);
        }
        c.scatter(rng, 0, 0, 64, 64, 10, 0, -1, { shapes: 3 });
      },
      { wrap: true },
    ),
  );
}

/** Woven cloth / plush: diagonal twill, a fold every half metre, a few stains. 64 × 64. */
export function d2ClothTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2cloth',
      64,
      64,
      (c, k) => {
        const m = k.ramp(N, { light: 0.45, sat: 0.9 });
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) c.set(x, y, m, (x + y * 2) % 6 === 0 ? 2.5 : (x + y * 2) % 6 === 3 ? 3.4 : 3);
        for (let x = 0; x < 64; x += 16) {
          c.vline(x, 0, 64, m, 4);
          c.vline(x + 1, 0, 64, m, 2.25);
        }
        c.scatter(k.rng, 0, 0, 64, 64, 8, 0, -1, { shapes: 8 });
      },
      { wrap: true },
    ),
  );
}

/** Fossil / bone: porous cast bone, pitted, hairline cracks, darker sutures. 64 × 64 (neutral: tinted bone / dark bone / socket). */
export function d2BoneTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2bone',
      64,
      64,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.45, sat: 0.8 });
        c.rect(0, 0, 64, 64, m, 3);
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (smooth(x, y, 64, 64, 4, 41) > 0.68) c.set(x, y, m, 3.5);
        // Pores: tiny dark pits with lit lips.
        for (let i = 0; i < 110; i++) {
          const x = rng.int(0, 63);
          const y = rng.int(0, 63);
          shiftW(c, x, y, -1.5);
          if (rng.chance(0.5)) shiftW(c, x + 1, y + 1, 0.75);
        }
        for (let i = 0; i < 4; i++) crack(c, rng, rng.int(0, 63), rng.int(0, 63), rng.int(6, 16), rng.next() * 6, { dt: -1.75, lip: 0.75 });
      },
      { wrap: true },
    ),
  );
}

/** A darker colour (for derived ramps). */
export { darken };

/** Tile key helper for callers composing keys. */
export { h6 };
