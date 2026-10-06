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
    plinth: a.tile('z1prop|plinth', 64, 70, paintPlinth),
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

/** The memorial's plinth face (2 × 2.2 m): granite courses, a bronze dedication plate, a wreath at its foot. */
function paintPlinth(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const gr = k.ramp(0x6a665e, { light: 0.38, sat: 0.5 });
  const bronze = k.ramp(0x3e6050, { light: 0.45 });
  const brass = k.ramp(0xb89a4a, { light: 0.4 });
  const leaf = k.ramp(0x2a4a2a, { light: 0.4 });
  const red = k.ramp(0xa82a2a, { light: 0.45 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, gr, y % 18 === 0 ? 1.6 : y % 18 === 1 ? 3.8 : (x + (Math.floor(y / 18) % 2) * 16) % 32 === 0 ? 1.6 : 3);
  // Cornice and plinth base mouldings.
  c.rect(0, 0, W, 4, gr, 3.8);
  c.hline(0, 4, W, gr, 1);
  c.rect(0, H - 6, W, 6, gr, 2.6);
  c.hline(0, H - 6, W, gr, 4);
  // Bronze plate, green with age, raised letters.
  c.rect(10, 16, W - 20, 22, bronze, 3);
  c.frame(10, 16, W - 20, 22, bronze, 4);
  drawText(c, 'OUR', 26, 19, FONT_3x5, brass, 3);
  drawText(c, 'FALLEN', 20, 25, FONT_3x5, brass, 3);
  drawText(c, '1917-19', 18, 31, FONT_3x5, brass, 2.4);
  // Verdigris runs below the plate.
  for (let x = 12; x < W - 12; x += 5) for (let j = 0; j < 4 + (x % 7); j++) c.tint(x, 38 + j, bronze, -0.6);
  // A wreath leaning on the foot: a ring of leaves with a red ribbon.
  for (let a = 0; a < 40; a++) {
    const t = (a / 40) * Math.PI * 2;
    c.set(Math.round(W / 2 + Math.cos(t) * 9), Math.round(H - 15 + Math.sin(t) * 8), leaf, a % 3 ? 3 : 2);
    c.set(Math.round(W / 2 + Math.cos(t) * 8), Math.round(H - 15 + Math.sin(t) * 7), leaf, 2);
  }
  c.rect(W / 2 - 2, H - 8, 4, 6, red, 3);
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
