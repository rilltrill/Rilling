import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5 } from './font';
import { hash2 } from './surfaces';

/**
 * MAIN STREET's small furniture in ART: PIXEL WORLD — no more boxes: each piece
 * is painted on its faces as a cut-out silhouette, the way a background artist
 * draws street furniture:
 *  - the park bench: slatted seat and back on cast-iron S-legs (front / back,
 *    the leg profile at the ends, slats from above);
 *  - the police sawhorse: two striped boards (orange / white chevrons with a
 *    stencil) on splayed A-legs, the legs alone seen end-on;
 *  - the shipping crate: boards in a frame with a diagonal brace, a stencil, a
 *    split board;
 *  - the square's cast-iron lamp posts (fluted, a collar and a foot) and their
 *    globes as glowing cards with a stepped halo;
 *  - the fountain (stone basin with a lip and moss, the water, the fluted
 *    column and bowl), the memorial's granite plinth with its bronze plate and
 *    a wreath, the courthouse's tympanum (the scales of justice in relief);
 *  - the floodlight's lens.
 */

const F = PWF.GLOW;

export interface Z1PropTiles {
  benchFront: PwTile;
  benchEnd: PwTile;
  benchTop: PwTile;
  sawFront: PwTile;
  sawEnd: PwTile;
  crate: PwTile;
  cratePlain: PwTile;
  post: PwTile;
  globe: PwTile;
  basin: PwTile;
  water: PwTile;
  column: PwTile;
  plinth: PwTile;
  tympanum: PwTile;
  flood: PwTile;
}

export function z1PropTiles(a: PwAtlas): Z1PropTiles {
  return {
    benchFront: a.tile('z1prop|bench|f', 58, 28, paintBenchFront),
    benchEnd: a.tile('z1prop|bench|e', 16, 28, paintBenchEnd),
    benchTop: a.tile('z1prop|bench|t', 58, 14, paintBenchTop),
    sawFront: a.tile('z1prop|saw|f', 78, 38, paintSawFront),
    sawEnd: a.tile('z1prop|saw|e', 20, 38, paintSawEnd),
    crate: a.tile('z1prop|crate|0', 26, 26, (c, k) => paintCrate(c, k, true)),
    cratePlain: a.tile('z1prop|crate|1', 26, 26, (c, k) => paintCrate(c, k, false)),
    post: a.tile('z1prop|post', 16, 64, paintPost, { wrap: true }),
    globe: a.tile('z1prop|globe', 22, 22, paintGlobe),
    basin: a.tile('z1prop|basin', 64, 32, paintBasin, { wrap: true }),
    water: a.tile('z1prop|water', 64, 64, paintWater, { wrap: true }),
    column: a.tile('z1prop|col', 32, 32, paintColumn, { wrap: true }),
    plinth: a.tile('z1prop|plinth', PLINTH_W, PLINTH_H, paintPlinth),
    tympanum: a.tile('z1prop|tymp', 228, 36, paintTympanum),
    flood: a.tile('z1prop|flood', 26, 16, paintFlood),
  };
}

// ─── Bench ──────────────────────────────────────────────────────────────────

/** Seen from the front (1.8 × 0.85 m): back slats leaning, the seat's front slat, two cast-iron S-legs, cut out between. */
function paintBenchFront(c: PwCanvas, k: PwKit) {
  const wood = k.ramp(0x7a5434, { light: 0.4 });
  const iron = k.ramp(0x2a2c30, { light: 0.45 });
  const W = c.w;
  // Back slats (rows 1…12), each a board with a lit top edge, a dark gap between.
  for (const y0 of [1, 5, 9]) {
    c.rect(2, y0, W - 4, 3, wood, 3);
    c.hline(2, y0, W - 4, wood, 4);
    for (let i = 0; i < 4; i++) c.hline(4 + Math.floor(hash2(i, y0, 3) * (W - 14)), y0 + 1, 4 + i, wood, 2);
  }
  // The seat's front slat.
  c.rect(1, 15, W - 2, 3, wood, 3);
  c.hline(1, 15, W - 2, wood, 4);
  c.hline(1, 17, W - 2, wood, 2);
  // Cast-iron legs: an S-curve from the backrest down to a scrolled foot.
  for (const lx of [3, W - 6]) {
    for (let y = 0; y < 28; y++) {
      const off = Math.round(Math.sin((y / 28) * Math.PI * 1.3) * 1.5);
      c.set(lx + off, y, iron, 2);
      c.set(lx + off + 1, y, iron, y < 14 ? 3 : 1);
      c.set(lx + off + 2, y, iron, 1);
    }
    c.hline(lx - 2, 27, 7, iron, 2);
    c.set(lx - 2, 26, iron, 2);
    c.set(lx + 4, 26, iron, 2);
  }
}

/** The end of a bench: the leg's profile with the seat and backrest boards' ends. */
function paintBenchEnd(c: PwCanvas, k: PwKit) {
  const wood = k.ramp(0x7a5434, { light: 0.4 });
  const iron = k.ramp(0x2a2c30, { light: 0.45 });
  // Leg profile: the seat bearer, the raked back, two scrolled feet.
  for (let y = 0; y < 16; y++) c.set(11 - Math.round(y * 0.25), y, iron, 2);
  c.hline(1, 16, 14, iron, 2);
  c.hline(1, 17, 14, iron, 1);
  for (let y = 17; y < 28; y++) {
    c.set(3 + Math.round((y - 17) * 0.15), y, iron, 2);
    c.set(12 - Math.round((y - 17) * 0.15), y, iron, 2);
  }
  c.hline(1, 27, 4, iron, 2);
  c.hline(11, 27, 4, iron, 2);
  // Board ends (seat across the top of the bearer, the back slats leaning).
  for (let i = 0; i < 4; i++) c.rect(1 + i * 3, 14, 2, 2, wood, 3);
  for (let i = 0; i < 3; i++) c.rect(9 - i, 2 + i * 4, 3, 2, wood, 3);
}

/** Seat from above: slats running along, gaps between. */
function paintBenchTop(c: PwCanvas, k: PwKit) {
  const wood = k.ramp(0x7a5434, { light: 0.4 });
  for (const y0 of [1, 5, 9]) {
    c.rect(0, y0, c.w, 3, wood, 3);
    c.hline(0, y0, c.w, wood, 4);
    for (let i = 0; i < 3; i++) c.set(Math.floor(hash2(i, y0, 7) * c.w), y0 + 1, wood, 2);
  }
}

// ─── Sawhorse ───────────────────────────────────────────────────────────────

/** A police sawhorse (2.4 × 1.2 m): two boards in orange and white chevrons, POLICE stencilled, splayed legs. */
function paintSawFront(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const org = k.ramp(0xe8742a, { light: 0.45 });
  const wht = k.ramp(0xe8e4d8, { light: 0.3, sat: 0.5 });
  const legs = k.ramp(0xc8c4ba, { light: 0.4, sat: 0.5 });
  const ink = k.ramp(0x1a1a20, { light: 0.4 });
  const dirt = k.ramp(0x5a4a3a, { light: 0.4 });
  // Legs behind the boards: two A-frames splaying to the ground.
  for (const lx of [8, W - 9]) {
    for (let y = 2; y < H; y++) {
      const s = Math.round((y - 2) * 0.18);
      c.set(lx - s, y, legs, 3);
      c.set(lx - s + 1, y, legs, 2);
      c.set(lx + s + 2, y, legs, 2);
    }
  }
  // Boards: top (rows 2…9) and lower (rows 18…23), chevrons, chipped, a stencil on the top one.
  const board = (y0: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = 0; x < W; x++) {
        const band = Math.floor((x + (y - y0) + 200) / 6) % 2;
        c.set(x, y, band ? org : wht, y === y0 ? 4 : y === y0 + h - 1 ? 2 : 3);
      }
    }
    for (let i = 0; i < 8; i++) c.cluster(Math.floor(hash2(i, y0, 5) * (W - 3)), y0 + 1 + Math.floor(hash2(y0, i, 6) * (h - 3)), i % 4, dirt, 2);
  };
  board(2, 8);
  board(18, 6);
  c.rect(26, 3, 26, 6, wht, 3);
  drawText(c, 'POLICE', 27, 4, FONT_3x5, ink, 1);
}

/** A sawhorse end-on: the A-legs and the two boards' ends. */
function paintSawEnd(c: PwCanvas, k: PwKit) {
  const H = c.h;
  const legs = k.ramp(0xc8c4ba, { light: 0.4, sat: 0.5 });
  const org = k.ramp(0xe8742a, { light: 0.45 });
  for (let y = 2; y < H; y++) {
    const s = Math.round((y - 2) * 0.22);
    c.set(9 - s, y, legs, 3);
    c.set(10 + s, y, legs, 2);
  }
  c.rect(8, 2, 4, 8, org, 3);
  c.rect(8, 18, 4, 6, org, 3);
}

// ─── Crate ──────────────────────────────────────────────────────────────────

/** A crate face (0.8 m): boards inside a frame, a diagonal brace, a stencil on the front, a split board. */
function paintCrate(c: PwCanvas, k: PwKit, stencil: boolean) {
  const W = c.w;
  const H = c.h;
  const wood = k.ramp(0x8a6a44, { light: 0.4 });
  const frame = k.ramp(0x5a4430, { light: 0.4 });
  const ink = k.ramp(0x2a2420, { light: 0.4 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, wood, y % 6 === 0 ? 1.6 : y % 6 === 1 ? 3.6 : 3);
  c.frame(0, 0, W, H, frame, 2);
  c.frame(1, 1, W - 2, H - 2, frame, 3);
  c.hline(1, 1, W - 2, frame, 4);
  c.line(2, H - 3, W - 3, 2, frame, 3);
  c.line(3, H - 3, W - 3, 3, frame, 2);
  if (stencil) {
    drawText(c, 'MBK', 7, 7, FONT_3x5, ink, 1);
    drawText(c, 'FEED', 5, 14, FONT_3x5, ink, 1);
  }
  // A split board, a nail head or two.
  c.line(6, 19, 14, 20, wood, 1);
  for (const [x, y] of [[3, 3], [W - 4, 3], [3, H - 4], [W - 4, H - 4]]) c.set(x, y, frame, 5);
}

// ─── Square lamps ───────────────────────────────────────────────────────────

/** Cast-iron lamp post (wrap round the post): fluted, lit on its left. */
function paintPost(c: PwCanvas, k: PwKit) {
  const iron = k.ramp(0x2a3030, { light: 0.5, sat: 0.6 });
  for (let x = 0; x < c.w; x++) c.rect(x, 0, 1, c.h, iron, x % 4 === 0 ? 4 : x % 4 === 3 ? 1.6 : 2.6);
  // A collar every 2 m.
  c.rect(0, 30, c.w, 3, iron, 3.6);
  c.hline(0, 33, c.w, iron, 1);
}

/** A glowing globe card: the opal globe, its hot core, a stepped halo ring; cut out round it. */
function paintGlobe(c: PwCanvas, k: PwKit) {
  const glass = k.ramp(0xffe8c0, { light: 0.35 });
  const halo = k.ramp(0xc8a070, { light: 0.4 });
  const cx = c.w / 2;
  const cy = c.h / 2;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < 4.6) c.set(x, y, glass, d < 2.2 ? 5 : 4, F);
      else if (d < 6.4) c.set(x, y, glass, 3, F);
      else if (d < 9 && (x + y) % 2 === 0) c.set(x, y, halo, d < 7.6 ? 3 : 2, F);
      else if (d < 10.6 && x % 2 === 0 && y % 2 === 0) c.set(x, y, halo, 2, F);
    }
  }
}

// ─── Fountain, memorial, courthouse ─────────────────────────────────────────

/** Fountain basin wall (wrap round it): dressed stone blocks, a lit coping lip, moss and a water line. */
function paintBasin(c: PwCanvas, k: PwKit) {
  const st = k.ramp(0x8a8478, { light: 0.38, sat: 0.5 });
  const moss = k.ramp(0x3e5a32, { light: 0.35 });
  const W = c.w;
  const H = c.h;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const row = y < 6 ? -1 : Math.floor((y - 6) / 9);
      const off = row % 2 ? 10 : 0;
      const joint = y === 6 || (y > 6 && (y - 6) % 9 === 0) || (row >= 0 && (x + off) % 20 === 0);
      c.set(x, y, st, y < 6 ? (y === 0 ? 4 : y === 5 ? 1.6 : 3.4) : joint ? 1.6 : hash2((x + off) / 20 | 0, row, 3) > 0.7 ? 2.6 : 3);
    }
  }
  for (let i = 0; i < 26; i++) c.cluster(k.rng.int(0, W - 3), k.rng.int(6, H - 3), k.rng.int(0, 9), moss, k.rng.chance(0.5) ? 2 : 3);
  for (let x = 0; x < W; x++) if (hash2(x >> 2, 9, 5) > 0.35) c.set(x, 7, moss, 2);
}

/** Still water in the basin: dark, the sky in long ripples, rings where the rain lands. */
function paintWater(c: PwCanvas, k: PwKit) {
  const w = k.ramp(0x142232, { light: 0.45, sat: 0.9 });
  const sky = k.ramp(0x4a5a84, { light: 0.35 });
  c.rect(0, 0, c.w, c.h, w, 2);
  for (let i = 0; i < 18; i++) {
    const x = k.rng.int(0, c.w - 10);
    const y = k.rng.int(0, c.h - 1);
    c.hline(x, y, k.rng.int(4, 10), w, 3);
  }
  for (let i = 0; i < 8; i++) {
    const x = k.rng.int(3, c.w - 4);
    const y = k.rng.int(3, c.h - 4);
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) c.set(x + dx, y + dy, sky, 2);
  }
}

/** Fluted stone column (wrap round it). */
function paintColumn(c: PwCanvas, k: PwKit) {
  const st = k.ramp(0x8a8478, { light: 0.38, sat: 0.5 });
  const moss = k.ramp(0x3e5a32, { light: 0.35 });
  for (let x = 0; x < c.w; x++) c.rect(x, 0, 1, c.h, st, x % 6 === 0 ? 1.6 : x % 6 === 1 ? 4 : 3);
  for (let i = 0; i < 6; i++) c.cluster(k.rng.int(0, c.w - 3), k.rng.int(c.h - 10, c.h - 3), k.rng.int(0, 9), moss, 2);
}

/** The memorial's plinth as a card (2.75 × 2.875 m): a real box's side faces read blue and pink in the hero shot, a cut-out drawing does not. */
export const PLINTH_W = 88;
export const PLINTH_H = 92;

/** Weathered granite, chipped outline, a bronze cap and dedication plate, a wreath, candles and flowers left at its ragged foot. Painted lit from the left; no side. */
function paintPlinth(c: PwCanvas, k: PwKit) {
  const W = PLINTH_W;
  const H = PLINTH_H;
  const gr = k.ramp(0x6a665e, { light: 0.38, sat: 0.5 });
  const moss = k.ramp(0x4a5a3e, { light: 0.34, sat: 0.7 });
  const bronze = k.ramp(0x3e6050, { light: 0.45 });
  const brass = k.ramp(0xb89a4a, { light: 0.4 });
  const leaf = k.ramp(0x2a4a2a, { light: 0.4 });
  const red = k.ramp(0xa82a2a, { light: 0.45 });
  const wax = k.ramp(0xd8c8a0, { light: 0.34 });
  const flame = k.ramp(0xffc060, { light: 0.5, sat: 1.1 });
  const ink = k.ramp(0x201c28, { light: 0.3 });
  const seed = 451;
  const stoneT = (x: number, y: number, base: number) => {
    const u = x / W;
    const grain = hash2(x >> 2, y >> 2, seed) > 0.82 ? -0.4 : 0;
    return base + (u < 0.28 ? 0.7 : u > 0.72 ? -0.55 : 0) + grain;
  };
  // Courses: the die between two runs of cornice stones. Each course its own width, each end chipped.
  const course = (x0: number, x1: number, y0: number, y1: number, base: number, chip: number) => {
    for (let y = y0; y < y1; y++) {
      const a = x0 + (hash2(y >> 1, 1, seed + 3) > 1 - chip ? 2 : 0);
      const b = x1 - (hash2(y >> 1, 2, seed + 3) > 1 - chip ? 2 : 0);
      for (let x = a; x < b; x++) c.set(x, y, gr, y === y0 ? stoneT(x, y, base + 0.9) : y === y1 - 1 ? stoneT(x, y, base - 1.1) : stoneT(x, y, base));
    }
  };
  course(2, W - 2, H - 8, H, 2.2, 0.4);
  course(8, W - 8, H - 15, H - 8, 2.6, 0.35);
  course(16, W - 16, 24, H - 15, 2.7, 0.3);
  course(8, W - 8, 18, 24, 3.0, 0.25);
  // Joints, cut by hand: not a grid.
  for (let j = 0; j < 4; j++) {
    const y = 34 + j * 13 + Math.round(hash2(j, 1, seed + 5) * 3);
    for (let x = 18; x < W - 18; x++) if (hash2(x >> 3, j, seed + 7) > 0.15) c.shift(x, y, -1.3);
    const vx = 26 + Math.floor(hash2(j, 2, seed + 7) * 34);
    for (let yy = y; yy < y + 12; yy++) c.shift(vx, yy, -1.1);
  }
  // Bronze cap on which the soldier stands: green with age, its edge lit.
  course(22, W - 22, 3, 18, 2.8, 0.2);
  for (let y = 3; y < 18; y++) for (let x = 22; x < W - 22; x++) c.tint(x, y, bronze, y < 6 ? 0.5 : 0);
  // Dedication plate, its letters clear, its corners bolted.
  c.rect(24, 28, W - 48, 22, bronze, 3);
  c.frame(24, 28, W - 48, 22, bronze, 4);
  drawText(c, 'OUR', 37, 31, FONT_3x5, brass, 4.4);
  drawText(c, 'FALLEN', 31, 38, FONT_3x5, brass, 4.2);
  for (const [bx, by] of [[26, 30], [W - 27, 30], [26, 47], [W - 27, 47]]) c.set(bx, by, brass, 4.6);
  for (let x = 26; x < W - 26; x += 3) for (let j = 0; j < 3 + (x % 7); j++) c.tint(x, 50 + j, bronze, -0.6);
  // A corner gone, chips and moss in the joints.
  c.poly([W - 18, 24, W - 8, 24, W - 8, 36, W - 14, 30], 0, 0);
  c.poly([16, H - 15, 26, H - 15, 22, H - 8, 14, H - 8], 0, 0);
  for (let i = 0; i < 22; i++) {
    const x = 18 + Math.floor(hash2(i, 3, seed + 9) * (W - 36));
    const y = 26 + Math.floor(hash2(i, 4, seed + 9) * (H - 44));
    if (c.at(x, y) === gr) c.tint(x, y, moss, 0);
  }
  // Wreath leaning at the foot.
  const wx = 30;
  const wy = H - 22;
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    for (const r of [11, 9, 7]) c.set(Math.round(wx + Math.cos(t) * r), Math.round(wy + Math.sin(t) * r), leaf, a % 3 ? 3 : 2);
  }
  c.rect(wx - 2, wy + 6, 4, 10, red, 3);
  c.poly([wx - 5, wy + 6, wx + 5, wy + 6, wx + 1, wy + 14], red, 3.4);
  // Candles and flowers; the wax has run.
  for (let i = 0; i < 6; i++) {
    const cx = 46 + i * 7 + Math.round(hash2(i, 5, seed + 11) * 3);
    const ch = 6 + Math.floor(hash2(i, 6, seed + 11) * 6);
    c.rect(cx, H - 8 - ch, 3, ch, wax, 3.2);
    c.hline(cx - 1, H - 8, 5, wax, 2.6);
    c.set(cx + 1, H - 9 - ch, flame, 4.8, PWF.GLOW);
    c.set(cx + 1, H - 10 - ch, flame, 3.6, PWF.GLOW);
  }
  for (let x = 6; x < W - 6; x += 5 + Math.floor(hash2(x, 2, seed + 13) * 4)) {
    c.set(x, H - 3, red, 3.6);
    c.set(x + 1, H - 2, leaf, 2.6);
  }
  // A ragged foot: the bottom row eaten, ash and rain-dark rubbish in the gaps.
  for (let x = 0; x < W; x++) {
    const bite = Math.floor(hash2(x >> 1, 7, seed + 15) * 3);
    for (let j = 0; j < bite; j++) if (hash2(x, j, seed + 17) > 0.45) c.set(x, H - 1 - j, 0, 0);
  }
  c.outline(0.5, false);
  void ink;
}

/** The courthouse tympanum (a 228 × 36 module laid over the pediment's face, cut out above its rakes): the scales of justice between laurels. */
function paintTympanum(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const st = k.ramp(0x8a847a, { light: 0.38, sat: 0.5 });
  for (let y = 0; y < H; y++) {
    const half = ((y + 1) / H) * (W / 2);
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x + 0.5 - W / 2);
      if (d > half) continue;
      // The raking cornice: two lit / shadowed bands along the slopes, the base moulding.
      const edge = half - d;
      c.set(x, y, st, edge < 2 ? 4 : edge < 4 ? 1.6 : y > H - 4 ? (y === H - 4 ? 4 : 2.4) : 2.8);
    }
  }
  // The relief: scales hanging from a beam on a post, laurel sprays either side (raised: lit top-left).
  const cx = W / 2;
  c.vline(cx, 10, 20, st, 4);
  c.vline(cx + 1, 10, 20, st, 1.6);
  c.hline(cx - 18, 12, 37, st, 4);
  c.hline(cx - 18, 13, 37, st, 1.6);
  for (const sx of [-1, 1]) {
    const px = cx + sx * 16;
    c.line(px, 13, px - 4, 22, st, 3.6);
    c.line(px, 13, px + 4, 22, st, 3.6);
    c.hline(px - 5, 23, 11, st, 4);
    c.hline(px - 4, 24, 9, st, 1.6);
    for (let i = 0; i < 9; i++) {
      const lx = cx + sx * (30 + i * 5);
      const ly = 26 - Math.round(Math.sin((i / 9) * Math.PI) * 6);
      c.set(lx, ly, st, 4);
      c.set(lx + sx, ly - 1, st, 4);
      c.set(lx, ly + 1, st, 1.6);
    }
  }
}

/** The floodlight's face (GLOW): a lens grid in a dark reflector rim. */
function paintFlood(c: PwCanvas, k: PwKit) {
  const rim = k.ramp(0x3a3c44, { light: 0.4 });
  const lens = k.ramp(0xe8f0ff, { light: 0.3 });
  c.rect(0, 0, c.w, c.h, rim, 2);
  c.hline(0, 0, c.w, rim, 4);
  for (let y = 2; y < c.h - 2; y++) {
    for (let x = 2; x < c.w - 2; x++) {
      const cell = (x - 2) % 4 === 3 || (y - 2) % 4 === 3;
      c.set(x, y, lens, cell ? 3 : (x + y) % 5 === 0 ? 5 : 4, F);
    }
  }
}
