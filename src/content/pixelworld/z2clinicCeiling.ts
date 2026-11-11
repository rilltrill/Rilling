import type { PwAtlas, PwKit, PwTile } from './atlas';
import { PWF, type PwCanvas } from './canvas';
import { pwBlob } from './brush2i';
import { hash2 } from './surfaces';
import { Z2_PUDDLE_FRAMES } from './z2bay';

/**
 * ST. MERCY HOSPITAL (z2), PIXEL WORLD 2 — the suspended CEILING of the clinical ground floor,
 * drawn as what it is: a grid of lay-in boards between T-bars, with the light fittings IN the
 * grid (a fitting is one cell by two) and their light on the boards round them as whole tone
 * steps on whole boards.
 *
 * The grid is 0.625 m (40 texels at 64 a metre): the classic fittings are 0.66 × 1.26 m, so a
 * cell by two is their size. Its lines run through the world at x = i · 0.625 and at
 * z = −44 ± 0.3125 + j · 0.625 — the rail's line down corridor A, the ward and the nurse station
 * (z = −44) is the middle of a row of cells, so the corridor's fittings sit in the middle of the
 * frame; the stage moves every fitting the few centimetres it takes to sit in its cells
 * (`z2CeilingSnap`).
 */

/** Ceiling grid, metres, and texels at the ceiling's density. */
export const Z2_CEIL_GRID = 0.625;
const CELL = 40;
const D = 64;
const SOFT = { dark: 0.5, light: 0.4, sat: 1 };

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * Where a fitting (or a hole) of one cell by two sits in the grid: the centre nearest (x, z)
 * that puts it exactly on its cells. `alongX`: its long side runs along world x.
 */
export function z2CeilingSnap(x: number, z: number, alongX: boolean, cells: 1 | 2 = 2): [number, number] {
  const G = Z2_CEIL_GRID;
  const z0 = -44 + G / 2;
  const line = (v: number, o: number) => o + Math.round((v - o) / G) * G;
  const mid = (v: number, o: number) => o + (Math.floor((v - o) / G) + 0.5) * G;
  if (cells === 1) return [mid(x, 0), mid(z, z0)];
  return alongX ? [line(x, 0), mid(z, z0)] : [mid(x, 0), line(z, z0)];
}

interface CeilRamps {
  T: number;
  old: number;
  fresh: number;
  bar: number;
  stain: number;
  metal: number;
  dark: number;
}

function ceilRamps(k: PwKit, hex: number): CeilRamps {
  return {
    T: k.ramp(hex, SOFT),
    old: k.ramp(mix(hex, 0x8a8468, 0.22), SOFT),
    fresh: k.ramp(mix(hex, 0xa4aca4, 0.4), SOFT),
    bar: k.ramp(mix(hex, 0xb0b8b0, 0.5), { dark: 0.45, light: 0.4 }),
    stain: k.ramp(mix(hex, 0x6a5a38, 0.5), { dark: 0.55, light: 0.3 }),
    metal: k.ramp(0x8a9290, { dark: 0.45, light: 0.45 }),
    dark: k.ramp(0x24282c, { dark: 0.7, light: 0.35 }),
  };
}

/**
 * One cell of the grid: its T-bars along its top and left (two texels: lit, then in shadow) and
 * the board in it, drawn by `kind` — plain (fissures as short shaped strokes in two directions),
 * yellowed, a newer replacement, sagging out of its bars, ringed by an old leak, a corner broken
 * into the void. `up` lifts the board by whole tone steps (a fitting's light on it).
 * `put` writes a texel (the caller wraps or clips).
 */
function ceilCell(c: PwCanvas, x0: number, y0: number, R: CeilRamps, h: number, seed: number, up = 0, wrap = true) {
  const W = c.w;
  const H = c.h;
  const X = (x: number) => (wrap ? ((x % W) + W) % W : x);
  const Y = (y: number) => (wrap ? ((y % H) + H) % H : y);
  const set = (x: number, y: number, r: number, t: number) => c.set(X(x), Y(y), r, t);
  const shift = (x: number, y: number, dt: number) => c.shift(X(x), Y(y), dt);
  const kind = h > 0.86 ? 'old' : h > 0.8 ? 'fresh' : h < 0.1 ? 'sag' : h < 0.15 ? 'leak' : h < 0.185 ? 'broken' : 'plain';
  const ramp = kind === 'old' ? R.old : kind === 'fresh' ? R.fresh : R.T;
  const base = 3 + up;
  for (let y = 2; y < CELL; y++) for (let x = 2; x < CELL; x++) set(x0 + x, y0 + y, ramp, base);
  // The board's fissures: a dozen short strokes, most straight, some leaning (a new board has few).
  const n = kind === 'fresh' ? 4 : 11;
  for (let i = 0; i < n; i++) {
    const fx = 4 + Math.floor(hash2(x0 * 7 + i, y0, seed + 1) * (CELL - 12));
    const fy = 4 + Math.floor(hash2(x0, y0 * 7 + i, seed + 2) * (CELL - 8));
    const lean = hash2(x0 + i, y0 + i, seed + 3);
    const len = 3 + (i % 4);
    for (let q = 0; q < len; q++) shift(x0 + fx + q, y0 + fy + (lean > 0.6 ? q >> 1 : lean < 0.15 ? -(q >> 1) : 0), -1);
  }
  // The board's bevelled edge inside its bars: a step down along the bottom and right (it sits in a rebate).
  for (let i = 2; i < CELL; i++) {
    shift(x0 + i, y0 + CELL - 1, -1);
    shift(x0 + CELL - 1, y0 + i, -1);
  }
  if (kind === 'sag') {
    // Sagging out of its bars: its own shadow inside the top and left edges, its low corner catching light.
    for (let i = 2; i < CELL; i++) {
      shift(x0 + i, y0 + 2, -1);
      shift(x0 + i, y0 + 3, i % 5 ? -1 : 0);
      shift(x0 + 2, y0 + i, -1);
      if (i > CELL - 14) shift(x0 + i, y0 + CELL - 2, 1);
    }
  } else if (kind === 'leak') {
    // An old leak: a lobed stain with a darker tide rim and a washed middle, a second ring inside it.
    const cx = x0 + 10 + Math.floor(hash2(x0, y0, seed + 5) * 20);
    const cy = y0 + 10 + Math.floor(hash2(x0, y0, seed + 6) * 20);
    const r = 9 + Math.floor(hash2(x0, y0, seed + 7) * 8);
    const ph = hash2(x0, y0, seed + 8) * 6.28;
    for (let y = -r - 5; y <= r + 5; y++) {
      for (let x = -r - 6; x <= r + 6; x++) {
        const px = cx + x;
        const py = cy + y;
        if (px < x0 + 2 || py < y0 + 2 || px >= x0 + CELL || py >= y0 + CELL) continue;
        if (!pwBlob(x, y, r + 3, r, ph, ph * 1.7, 0.2)) continue;
        const rim = !pwBlob(x, y, r + 1.5, r - 1.5, ph, ph * 1.7, 0.2);
        const inner = pwBlob(x - 1, y, r * 0.5, r * 0.45, ph * 2, ph, 0.25);
        const innerRim = inner && !pwBlob(x - 1, y, r * 0.5 - 1.2, r * 0.45 - 1.2, ph * 2, ph, 0.25);
        c.tint(X(px), Y(py), R.stain, rim || innerRim ? -1 : inner ? 0 : 1);
      }
    }
  } else if (kind === 'broken') {
    // A corner broken off into the void: dark, the broken edge lit along its lower lip, crumbs on the bar.
    const s = 9 + Math.floor(hash2(x0, y0, seed + 9) * 7);
    const right = hash2(x0, y0, seed + 10) > 0.5;
    for (let j = 0; j <= s; j++) {
      for (let i = 0; i <= s - j + (j % 3 === 1 ? 1 : 0); i++) {
        const x = right ? x0 + CELL - 1 - i : x0 + 2 + i;
        const lip = i >= s - j - (j % 3 === 1 ? 0 : 1);
        set(x, y0 + 2 + j, lip ? ramp : R.dark, lip ? Math.min(5, base + 2) : j < 2 ? 0 : 1);
      }
    }
  }
  // T-bars: the first texel lit, the second in shadow; a clip where they cross.
  for (let i = 0; i < CELL; i++) {
    set(x0 + i, y0, R.bar, 4);
    set(x0 + i, y0 + 1, R.bar, 2);
    set(x0, y0 + i, R.bar, 4);
    set(x0 + 1, y0 + i, R.bar, 2);
  }
  set(x0, y0, R.bar, 5);
  set(x0 + 1, y0 + 1, R.bar, 1);
  // A bar joint part-way along, on some.
  if (h > 0.4 && h < 0.6) {
    set(x0 + 20, y0, R.bar, 2);
    set(x0 + 21, y0, R.bar, 5);
  }
}

/**
 * The suspended ceiling: 320 × 320 at 64 texels a metre (5 m, wrapped), eight cells each way.
 * No two boards alike (`ceilCell`), and what a ceiling carries in its grid: a square air
 * diffuser in one cell (louvres stepping in, dust streaked away from it), two sprinkler heads,
 * a smoke detector, dust and dead flies gathered along the bars.
 */
export function z2ClinicCeiling(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(
    `z2clinic|ceiling|${hex.toString(16)}`,
    320,
    320,
    (c, k) => {
      const rng = k.rng;
      const R = ceilRamps(k, hex);
      // (Rows: the bars lie on v ≡ 4, 5 of 40 from the canvas's bottom row — see the header.)
      const Y0 = 34;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) ceilCell(c, i * CELL, Y0 + j * CELL, R, hash2(i, j, 81), 80);
      const wy = (y: number) => ((y % c.h) + c.h) % c.h;
      // The air diffuser: one cell, four louvres stepping in to a dark throat; dust blown out across its neighbours.
      {
        const x0 = 5 * CELL + 2;
        const y0 = Y0 + 2 * CELL + 2;
        for (let r = 0; r < 19; r++) {
          const t = r === 0 ? 4 : r >= 15 ? 0 : r % 4 === 0 ? 5 : r % 4 === 1 ? 3 : r % 4 === 2 ? 2 : 1;
          const ramp = r >= 15 ? R.dark : R.metal;
          for (let i = r; i < 38 - r; i++) {
            c.set(x0 + i, wy(y0 + r), ramp, t);
            c.set(x0 + i, wy(y0 + 37 - r), ramp, r >= 15 ? 0 : t === 5 ? 1 : t === 1 ? 4 : t);
            c.set(x0 + r, wy(y0 + i), ramp, t);
            c.set(x0 + 37 - r, wy(y0 + i), ramp, r >= 15 ? 0 : t === 5 ? 1 : t === 1 ? 4 : t);
          }
        }
        for (let i = 0; i < 46; i++) {
          const a = rng.next() * 6.28;
          const d = 26 + rng.next() * 16;
          const px = x0 + 19 + Math.round(Math.cos(a) * d);
          const py = y0 + 19 + Math.round(Math.sin(a) * d);
          const len = rng.int(3, 7);
          for (let q = 0; q < len; q++) {
            const sx = px + Math.round(Math.cos(a) * q);
            const sy = py + Math.round(Math.sin(a) * q);
            if (c.at(sx, wy(sy)) !== R.bar && c.at(sx, wy(sy)) !== R.metal) c.shift(sx, wy(sy), -1);
          }
        }
      }
      // Sprinkler heads (an escutcheon with a deflector, its shadow) and a smoke detector (a low dome).
      for (const [cx, cy] of [[1 * CELL + 21, Y0 + 5 * CELL + 21], [6 * CELL + 21, Y0 + 6 * CELL + 21]]) {
        c.ellipse(cx + 1.5, wy(cy + 1.5), 3.6, 3.6, R.T, 1);
        c.ellipse(cx, wy(cy), 3.4, 3.4, R.metal, (u, v) => (u + v < -0.5 ? 5 : u + v > 0.7 ? 2 : 3));
        c.set(cx, wy(cy), R.metal, 1);
        c.set(cx - 1, wy(cy), R.metal, 1);
        c.set(cx + 1, wy(cy), R.metal, 5);
      }
      {
        const cx = 2 * CELL + 21;
        const cy = wy(Y0 + 1 * CELL + 21);
        c.ellipse(cx + 2, cy + 2, 6.5, 6.5, R.T, 1);
        c.ellipse(cx, cy, 6.2, 6.2, R.fresh, (u, v) => (u * u + v * v > 0.75 ? (u + v < 0 ? 5 : 2) : u + v < -0.4 ? 5 : 4));
        for (let a = 0; a < 6.28; a += 0.8) c.set(Math.round(cx + Math.cos(a) * 3.4), Math.round(cy + Math.sin(a) * 3.4), R.dark, 2);
      }
      // Dust and dead flies gathered along the bars (clusters, never specks).
      for (let i = 0; i < 26; i++) {
        const bx = rng.int(0, 7) * CELL + 3 + rng.int(0, 2);
        const by = wy(Y0 + rng.int(0, 7) * CELL + rng.int(4, 36));
        c.cluster(bx, by, rng.int(0, 5), 0, -1);
      }
    },
    { wrap: true, density: D },
  );
}

/** A fitting's module: three cells by four (the fitting, one by two, in its middle), texels. */
export const Z2_TROFFER_W = 3 * CELL;
export const Z2_TROFFER_H = 4 * CELL;
/** The fitting itself inside its module (texels from the module's left / bottom): what a flickering diffuser shows. */
export const Z2_TROFFER_BODY = { x: CELL, y: CELL, w: CELL + 2, h: 2 * CELL + 2 };

/**
 * A recessed light fitting in its cells, with what it does to the ceiling round it. The fitting:
 * a pressed frame (lit along its top and left, its inner return in shadow), a prismatic lens that
 * glows — the prisms a lattice, two tubes behind it as hot bands with dark cathode ends, dust
 * and flies settled in its low corners. Its light on the ceiling is paint: the six boards that
 * share an edge with it are a whole tone step up, with their bars and fissures, and a band of a
 * second step hugs the frame — light as steps on whole boards, never a gradient or a veil. A dead
 * fitting is a grey lens with the tubes' shadows and a leak's tide mark, and no light.
 */
export function z2ClinicTroffer(atlas: PwAtlas, state: 'on' | 'warm' | 'off', ceiling: number): PwTile {
  const on = state !== 'off';
  return atlas.tile(`z2clinic|troffer|${state}|${ceiling.toString(16)}`, on ? Z2_TROFFER_W : CELL + 2, on ? Z2_TROFFER_H : 2 * CELL + 2, (c, k) => {
    const R = ceilRamps(k, ceiling);
    const frame = k.ramp(0xb4bab2, { dark: 0.45, light: 0.4 });
    const lens = k.ramp(state === 'off' ? 0x68706c : state === 'warm' ? 0xf4e4c0 : 0xdcf2e8, { dark: 0.6, light: 0.5, sat: 0.8 });
    const G = on ? PWF.GLOW : 0;
    // (Module rows: bars on y ≡ 38, 39 of 40, so its bottom-left texel is a crossing of the grid.)
    const fx = on ? CELL : 0;
    const fy = on ? 38 : 0;
    if (on) {
      // The boards round it (rows of cells −1…2; the fitting is cells 0 and 1 of the middle column):
      // the six that share an edge with the fitting are a step up, the block's corners are not — a stepped lozenge.
      for (let j = -1; j <= 3; j++) {
        for (let i = 0; i < 3; i++) {
          const lit = i === 1 ? j === -1 || j === 2 : j === 0 || j === 1;
          ceilCell(c, i * CELL, 38 + j * CELL, R, 0.2 + hash2(i, j, 97) * 0.55, 90, lit ? 1 : 0, false);
        }
      }
      // The second step: a band of six texels hugging the frame, its outer edge in dashes.
      for (let y = fy - 8; y < fy + 2 * CELL + 10; y++) {
        for (let x = fx - 8; x < fx + CELL + 10; x++) {
          const dx = Math.max(0, fx - x, x - (fx + CELL + 1));
          const dy = Math.max(0, fy - y, y - (fy + 2 * CELL + 1));
          const d = Math.max(dx, dy);
          if (d === 0 || d > 8 || dx + dy > 12) continue;
          if (d > 6 && hash2(x >> 2, y >> 2, 99) > 0.45) continue;
          if (c.at(x, y) === R.T) c.shift(x, y, 1);
        }
      }
    }
    const W = CELL + 2;
    const H = 2 * CELL + 2;
    // The frame: three texels — a lit outer edge (top, left), its face, the inner return in shadow; dark where it is seen from below-right.
    c.rect(fx, fy, W, H, frame, 3);
    c.hline(fx, fy, W, frame, 5);
    c.vline(fx, fy, H, frame, 5);
    c.hline(fx + 1, fy + H - 1, W - 1, frame, 1);
    c.vline(fx + W - 1, fy + 1, H - 1, frame, 1);
    c.frame(fx + 2, fy + 2, W - 4, H - 4, frame, 2);
    c.hline(fx + 2, fy + 2, W - 4, frame, 1);
    c.vline(fx + 2, fy + 2, H - 4, frame, 1);
    for (const [sx, sy] of [[fx + 1, fy + 1], [fx + W - 2, fy + 1], [fx + 1, fy + H - 2], [fx + W - 2, fy + H - 2], [fx + 1, fy + (H >> 1)], [fx + W - 2, fy + (H >> 1)]]) c.set(sx, sy, frame, 0);
    // The lens: prisms as a lattice of small pyramids (lit ridge, shadowed valley).
    const lx = fx + 3;
    const ly = fy + 3;
    const lw = W - 6;
    const lh = H - 6;
    c.rect(lx, ly, lw, lh, lens, on ? 3 : 2, G);
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        const a = (x + y) % 6;
        const b = (x - y + 600) % 6;
        if (a === 0 || b === 0) c.set(lx + x, ly + y, lens, on ? 2 : 1, G);
        else if (on && (a === 3 || b === 3)) c.set(lx + x, ly + y, lens, 4, G);
      }
    }
    // Two tubes behind it: hot bands with a softer edge, dark at their cathode ends.
    for (const tx of [lx + 7, lx + lw - 12]) {
      for (let y = 5; y < lh - 5; y++) {
        const end = y < 8 || y >= lh - 8;
        for (let q = 0; q < 5; q++) {
          const edge = q === 0 || q === 4;
          const t = !on ? (edge ? 1 : y % 9 === 0 ? 1 : 2) : end ? (edge ? 3 : 4) : edge ? 4 : 5;
          if (!on && edge && (y & 1)) continue;
          c.set(tx + q, ly + y, lens, t, G);
        }
      }
      // (The tube's pins and lampholder at either end.)
      c.rect(tx + 1, ly + 3, 3, 2, frame, on ? 2 : 1);
      c.rect(tx + 1, ly + lh - 5, 3, 2, frame, on ? 2 : 1);
    }
    // Dust and flies settled along the lens's low edges, thick in the corners (unlit: they are silhouettes on it).
    const fly = k.ramp(0x3a3c30, { dark: 0.6, light: 0.3 });
    for (let x = 0; x < lw; x++) {
      const v = Math.min(x, lw - 1 - x);
      const depth = v < 3 ? 4 : v < 7 ? 2 : hash2(x >> 2, 5, 101) > 0.5 ? 1 : 0;
      for (let q = 0; q < depth; q++) if (hash2(x, q, 102) > 0.2) c.set(lx + x, ly + lh - 1 - q, fly, q === 0 ? 2 : 3);
    }
    for (const [x, y] of [[5, 9], [6, 10], [lw - 7, 30], [lw - 6, 31], [lw - 8, 31], [12, lh - 12], [13, lh - 13]]) c.set(lx + x, ly + y, fly, 2);
    if (!on) {
      // A leak got in: its tide mark across the dead lens.
      for (let x = 2; x < lw - 2; x++) {
        const y = ly + 24 + Math.round(Math.sin(x * 0.45) * 3 + Math.sin(x * 0.17) * 2);
        c.set(lx + x, y, lens, 0);
        if (x % 3) c.set(lx + x, y + 1, lens, 3);
      }
    }
  }, { density: D });
}

/** Frames of the animated strips of the clinical floor (the stage's one animated material plays them at 7 fps). */
export const Z2_CLINIC_FRAMES = Z2_PUDDLE_FRAMES;
/** Where the failing end of a lit fitting's second tube lies in its module (texels from its left / bottom), and its size. */
export const Z2_TUBE_END = { x: CELL + 3 + CELL - 4 - 12, y: CELL + 3 + 5, w: 5, h: 14 };

/**
 * A fluorescent tube's failing end, as a loop: 4 frames of 5 × 14 texels (dark, struck, dark,
 * half) laid over the end of a lit fitting's second tube. Small on purpose: a flicker the eye
 * catches, never a light that changes the room (the bible's §4.7).
 */
export function z2ClinicTubeFlicker(atlas: PwAtlas, warm: boolean): PwTile {
  const { w, h } = Z2_TUBE_END;
  return atlas.tile(`z2clinic|tube|${warm ? 1 : 0}`, w, h * Z2_CLINIC_FRAMES, (c, k) => {
    const lens = k.ramp(warm ? 0xf4e4c0 : 0xdcf2e8, { dark: 0.6, light: 0.5, sat: 0.8 });
    // (Frame 0 is the strip's BOTTOM block: the material steps up through it.)
    [2, 5, 2, 3].forEach((t, f) => {
      const y0 = c.h - (f + 1) * h;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c.set(x, y0 + y, lens, x === 0 || x === w - 1 ? Math.max(2, t - 1) : y > h - 4 ? Math.max(2, t - 1) : t, PWF.GLOW);
    });
  }, { density: D, frames: Z2_CLINIC_FRAMES });
}

/**
 * Where the ceiling is open, on the grid: `cells` 1 = one board gone, 2 = a fitting's cells
 * (the fitting hangs below by its wires). The void above, drawn: the dark of the plenum, two
 * timber joists crossing it lit along one edge, a ribbed flexible duct, a cable sagging across,
 * the hangers' wires — and the broken edges of the neighbouring boards, lit along the lip that
 * faces the room. The bars round the hole stay (the grid outlives its boards).
 */
export function z2ClinicCeilingHole(atlas: PwAtlas, ceiling: number, cells: 1 | 2, variant = 0): PwTile {
  const W = CELL + 2;
  const H = cells * CELL + 2;
  return atlas.tile(`z2clinic|hole|${ceiling.toString(16)}|${cells}|${variant}`, W, H, (c, k) => {
    const rng = k.rng;
    const R = ceilRamps(k, ceiling);
    const wood = k.ramp(0x5a4a38, { dark: 0.55, light: 0.35 });
    const duct = k.ramp(0x7c8488, { dark: 0.5, light: 0.45 });
    const wool = k.ramp(0x8a7a48, { dark: 0.55, light: 0.3 });
    c.rect(0, 0, W, H, R.dark, 0);
    // Deep in the void: the slab's underside as faint broad strokes.
    for (let i = 0; i < 5 * cells; i++) {
      const y = rng.int(4, H - 5);
      const x = rng.int(3, W - 14);
      c.hline(x, y, rng.int(5, 12), R.dark, 1);
    }
    // Joists across it: six texels, the lower edge lit by the room, a nail line.
    for (let j = 0; j < cells; j++) {
      const y = 9 + j * CELL + variant * 7 + rng.int(0, 5);
      c.rect(2, y, W - 4, 6, wood, 2);
      c.hline(2, y + 5, W - 4, wood, 4);
      c.hline(2, y, W - 4, wood, 1);
      for (let x = 6; x < W - 4; x += 9) c.set(x, y + 2, wood, 0);
    }
    // The flexible duct: ribbed, crossing at a slant, lit along its lower left.
    {
      const y0 = (cells === 2 ? 44 : 22) + variant * 3;
      for (let x = 2; x < W - 2; x++) {
        const cy = y0 + Math.round((x - W / 2) * 0.28 + Math.sin(x * 0.2) * 1.5);
        for (let q = -4; q <= 4; q++) {
          const rib = (x + (q >> 1)) % 3 === 0;
          c.set(x, cy + q, duct, rib ? 1 : q < -2 ? 1 : q > 2 ? 4 : q > 0 ? 3 : 2);
        }
      }
    }
    // Insulation slumped over one edge, a cable sagging across, hanger wires.
    for (let x = 3; x < 20; x++) {
      const hgt = Math.round(5 + Math.sin(x * 0.7) * 2 + (x % 5 === 0 ? 1 : 0));
      for (let q = 0; q < hgt; q++) c.set(variant ? W - 1 - x : x, 2 + q, wool, q === hgt - 1 ? 4 : q % 3 === 0 ? 2 : 3);
    }
    for (let x = 3; x < W - 3; x++) {
      const u = (x - 3) / (W - 6);
      const y = Math.round(H * 0.55 + Math.sin(u * Math.PI) * 9 - 9 + variant * 4);
      c.set(x, y, R.dark, 3);
      if (x % 4) c.set(x, y + 1, R.dark, 2);
    }
    for (const x of [8, W - 11]) for (let y = 2; y < H - 3; y++) if (y % 7 < 5) c.set(x, y, R.metal, y % 7 === 0 ? 5 : 3);
    // The ragged edge of what is left of the boards, along two sides: bites of board, lit on the lip.
    for (let i = 2; i < H - 2; i++) {
      const bite = Math.floor(hash2(i >> 2, variant, 111) * 5);
      for (let q = 0; q < bite; q++) c.set(variant ? 2 + q : W - 3 - q, i, R.T, q === bite - 1 ? 5 : 3);
    }
    for (let i = 2; i < W - 2; i++) {
      const bite = Math.floor(hash2(i >> 2, variant + 3, 112) * 4);
      for (let q = 0; q < bite; q++) c.set(i, H - 3 - q, R.T, q === bite - 1 ? 5 : 3);
    }
    // The bars round it, kept (two texels: lit, in shadow).
    c.hline(0, 0, W, R.bar, 4);
    c.hline(0, 1, W, R.bar, 2);
    c.hline(0, H - 2, W, R.bar, 4);
    c.hline(0, H - 1, W, R.bar, 2);
    c.vline(0, 0, H, R.bar, 4);
    c.vline(1, 0, H, R.bar, 2);
    c.vline(W - 2, 0, H, R.bar, 4);
    c.vline(W - 1, 0, H, R.bar, 2);
  }, { density: D });
}

/**
 * A ceiling vent's opening behind its grate (0.75 m, 48 × 48 at 64): a pressed steel boot, its
 * four inner faces going back into the dark (the upper and left ones in shadow, the lower and
 * right ones catching the room's light), a damper blade across the throat.
 */
export function z2ClinicVentHole(atlas: PwAtlas): PwTile {
  return atlas.tile('z2clinic|venthole', 48, 48, (c, k) => {
    const metal = k.ramp(0x7a8284, { dark: 0.45, light: 0.45 });
    const dark = k.ramp(0x24282c, { dark: 0.7, light: 0.35 });
    c.rect(0, 0, 48, 48, metal, 3);
    c.bevel(0, 0, 48, 48, true, 2, 1);
    for (let r = 3; r < 24; r++) {
      const t = r < 14 ? (r % 5 === 3 ? 1 : 2) : 0;
      const ramp = r < 14 ? metal : dark;
      for (let i = r; i < 48 - r; i++) {
        c.set(i, r, ramp, r < 14 ? Math.max(0, t - 1) : 0);
        c.set(r, i, ramp, r < 14 ? Math.max(0, t - 1) : 0);
        c.set(i, 47 - r, ramp, r < 14 ? t + 1 : 1);
        c.set(47 - r, i, ramp, r < 14 ? t + 1 : 1);
      }
    }
    for (let x = 15; x < 33; x++) {
      c.set(x, 22 + ((x - 15) >> 3), metal, 2);
      c.set(x, 23 + ((x - 15) >> 3), metal, 0);
    }
  }, { density: D });
}

/** The ceiling and its fittings at the sizes the stage uses (look-dev dumps, benches). */
export function z2ClinicCeilingTiles(atlas: PwAtlas, ceiling = 0x7a827c): PwTile[] {
  return [
    z2ClinicCeiling(atlas, ceiling),
    z2ClinicTroffer(atlas, 'on', ceiling),
    z2ClinicTroffer(atlas, 'warm', ceiling),
    z2ClinicTroffer(atlas, 'off', ceiling),
    z2ClinicTubeFlicker(atlas, false),
    z2ClinicTubeFlicker(atlas, true),
    z2ClinicCeilingHole(atlas, ceiling, 2, 0),
    z2ClinicCeilingHole(atlas, ceiling, 1, 0),
    z2ClinicCeilingHole(atlas, ceiling, 1, 1),
    z2ClinicVentHole(atlas),
  ];
}
