import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD, neonText, textWidth } from './font';
import { hash2 } from './surfaces';

/**
 * The town square and THE BUTCHER's arena in ART: PIXEL WORLD — the boss is on
 * screen longest in front of PRIME MEATS, so its front is painted like a
 * brawler's boss-stage backdrop:
 *  - the display windows: a red-lit cold room behind the glass (white tiles
 *    smeared with blood, a hook rail with sides of beef, hams and sausage
 *    links, price cards, cleavers on a magnet bar, trays on the counter);
 *  - the doorway (before the doors burst): a red corridor of tiles and hooks
 *    leading back into the dark; the doors themselves (porthole, kick plate,
 *    bloody hand prints);
 *  - the striped awning and its lettered valance, the cleaver-shaped neon
 *    blade sign, white glazed tiles under the windows;
 *  - the newsstand / coffee kiosks, the courthouse (ashlar, fluted columns,
 *    arched windows, bronze doors, the carved frieze, the clock faces) and the
 *    war memorial's bronze soldier as a cut-out.
 */

const F = PWF.GLOW;
const h6 = (n: number) => n.toString(16).padStart(6, '0');

export interface Z1SquareTiles {
  meatWindow: PwTile;
  meatDoorway: PwTile;
  meatDoor: PwTile;
  awning: PwTile;
  valance: PwTile;
  cleaver: PwTile;
  /** The other face (the cleaver mirrored, its lettering not). */
  cleaverL: PwTile;
  butcherTiles: PwTile;
  kioskWall: PwTile;
  /** Bills pasted over a kiosk's boards (cut-out collage, its own colours): two sheets, each face an 80-texel crop. */
  bills: PwTile;
  bills2: PwTile;
  /** Two tied bundles of the evening paper (cut-out). */
  bundle: PwTile;
  /** Kiosk roof fascia (wrap; the board in the bottom 8 rows): green newsstand / red coffee stand. */
  fasciaGreen: PwTile;
  fasciaRed: PwTile;
  newsHatch: PwTile;
  coffeeHatch: PwTile;
  ashlar: PwTile;
  column: PwTile;
  courtWinLit: PwTile;
  courtWinDark: PwTile;
  courtDoor: PwTile;
  frieze: PwTile;
  clock: PwTile;
  statue: PwTile;
  booksWindow: PwTile;
  toysWindow: PwTile;
  /** The bandstand: a turned white post, a spindle balustrade and a gingerbread lace valance (cut-outs), fish-scale shingles, beadboard soffit, its white eave board. */
  bandPost: PwTile;
  balustrade: PwTile;
  lace: PwTile;
  shingles: PwTile;
  beadboard: PwTile;
  eave: PwTile;
}

export function z1SquareTiles(a: PwAtlas): Z1SquareTiles {
  return {
    meatWindow: a.tile('z1sq|meatwin2', 134, 77, paintMeatWindow),
    meatDoorway: a.tile('z1sq|doorway', 102, 109, paintDoorway),
    meatDoor: a.tile('z1sq|meatdoor', 50, 102, paintMeatDoor),
    awning: a.tile('z1sq|awning', 96, 64, paintAwning, { wrap: true }),
    valance: a.tile('z1sq|valance', 448, 16, paintValance),
    cleaver: a.tile('z1sq|cleaver|r', 77, 45, (c, k) => paintCleaver(c, k, false)),
    cleaverL: a.tile('z1sq|cleaver|l', 77, 45, (c, k) => paintCleaver(c, k, true)),
    butcherTiles: a.tile('z1sq|btiles2', 64, 32, paintButcherTiles, { wrap: true }),
    kioskWall: a.tile('z1sq|kiosk', 64, 64, paintKioskWall, { wrap: true }),
    bills: a.tile('z1sq|bills2|0', 128, 48, (c, k) => paintBills(c, k, 0)),
    bills2: a.tile('z1sq|bills2|1', 128, 48, (c, k) => paintBills(c, k, 1)),
    bundle: a.tile('z1sq|bundle', 24, 14, paintBundle),
    fasciaGreen: a.tile('z1sq|fascia|g', 64, 16, (c, k) => paintFascia(c, k, 0x3a6a52, 0xe8d8a0), { wrap: true }),
    fasciaRed: a.tile('z1sq|fascia|r', 64, 16, (c, k) => paintFascia(c, k, 0x7a3434, 0xe8d8a0), { wrap: true }),
    newsHatch: a.tile('z1sq|news', 61, 32, (c, k) => paintHatch(c, k, 'news')),
    coffeeHatch: a.tile('z1sq|coffee', 61, 32, (c, k) => paintHatch(c, k, 'coffee')),
    ashlar: a.tile('z1sq|ashlar', 64, 64, paintAshlar, { wrap: true }),
    column: a.tile('z1sq|column', 32, 32, paintColumn, { wrap: true }),
    courtWinLit: a.tile('z1sq|cwin|1', 45, 77, (c, k) => paintCourtWindow(c, k, true)),
    courtWinDark: a.tile('z1sq|cwin|0', 45, 77, (c, k) => paintCourtWindow(c, k, false)),
    courtDoor: a.tile('z1sq|cdoor', 96, 134, paintCourtDoor),
    frieze: a.tile('z1sq|frieze', 448, 26, paintFrieze),
    clock: a.tile('z1sq|clock', 64, 64, paintClock),
    statue: a.tile('z1sq|statue', 40, 80, paintStatue),
    booksWindow: a.tile('z1sq|books', 208, 74, (c, k) => paintShopWindow(c, k, 'books')),
    toysWindow: a.tile('z1sq|toys', 208, 74, (c, k) => paintShopWindow(c, k, 'toys')),
    bandPost: a.tile('z1sq|bpost', 21, 90, paintBandPost),
    balustrade: a.tile('z1sq|balus', 77, 26, paintBalustrade),
    lace: a.tile('z1sq|lace', 64, 16, paintLace, { wrap: true }),
    shingles: a.tile('z1sq|shingle', 64, 32, paintShingles, { wrap: true }),
    beadboard: a.tile('z1sq|bead', 64, 64, paintBeadboard, { wrap: true }),
    eave: a.tile('z1sq|fascia|w', 64, 16, (c, k) => paintFascia(c, k, 0xe0dccf, 0x8a2a2a), { wrap: true }),
  };
}

// ─── PRIME MEATS ────────────────────────────────────────────────────────────

/**
 * Red-lit cold-room display (GLOW), 4.2 × 2.4 m — held at calm mid values (the
 * Butcher fights in front of it): a dark oxblood back wall, the carcasses on the
 * hook rail as low-contrast silhouettes with one lit edge, the glass fogged
 * with condensation at the top (cleared by drips running down), a single lit
 * price card and the counter's steel lip. The strongest contrast is kept for
 * the sign and the awning above.
 */
function paintMeatWindow(c: PwCanvas, k: PwKit) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const wallR = k.ramp(0x5a1e1a, { light: 0.4, sat: 0.9 });
  const grout = k.ramp(0x3a1210, { light: 0.35 });
  const red = k.ramp(0xff3a2a, { light: 0.5 });
  const meat = k.ramp(0x6a1a16, { light: 0.4, sat: 1.0 });
  const meatLit = k.ramp(0xa8423a, { light: 0.4, sat: 1.0 });
  const fat = k.ramp(0xb88a78, { light: 0.35 });
  const steel = k.ramp(0x8a7a7a, { light: 0.45, sat: 0.4 });
  const fog = k.ramp(0xb87a70, { light: 0.35, sat: 0.6 });
  const card = k.ramp(0xe8dcc8, { light: 0.3 });
  const ink = k.ramp(0x1a1a20, { light: 0.4 });
  const frame = k.ramp(0x2a2a30, { light: 0.45 });
  // Back wall: big dull tiles in the red light (no pale grout grid).
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const joint = y % 10 === 0 || (x + ((y / 10) | 0) % 2 * 5) % 10 === 0;
      c.set(x, y, joint ? grout : wallR, joint ? 2 : y < 14 ? 2.8 : y > H - 22 ? 1.8 : 2.2, F);
    }
  }
  // The red tube along the top (thin: the eye goes to the sign above, not here).
  c.hline(4, 2, W - 8, red, 4, F);
  c.hline(4, 3, W - 8, red, 3, F);
  // Hook rail and three hanging sides of beef as dark shapes, the lamp catching their left edges.
  c.hline(2, 9, W - 4, steel, 2.6, F);
  for (const hx of [24, 66, 106]) {
    c.vline(hx, 10, 4, steel, 2.4, F);
    for (let y = 14; y < 54; y++) {
      const t = (y - 14) / 40;
      const hw = Math.round(3 + Math.sin(t * Math.PI) * 5 - t * 2);
      for (let x = hx - hw; x <= hx + hw; x++) {
        const edge = x <= hx - hw + 1;
        const marble = hash2(x >> 1, y, 3) > 0.88;
        c.set(x, y, edge ? meatLit : marble ? fat : meat, edge ? 3 : marble ? 1.8 : 2.2, F);
      }
    }
  }
  // One lit price card.
  c.rect(84, 46, 18, 9, card, 3.2, F);
  drawText(c, 'CHOPS', 85, 48, FONT_3x5, ink, 1, { flag: F });
  // The counter: a steel lip and a dark front.
  c.rect(0, H - 13, W, 13, k.ramp(0x3a2a2a, { light: 0.4 }), 1.6, F);
  c.hline(0, H - 13, W, steel, 3, F);
  for (let x = 6; x < W - 16; x += 26) c.rect(x, H - 16, 16, 3, meat, 2, F);
  // Condensation: the upper glass fogged (a dither thinning downwards), drips clearing runs through it.
  const runs = new Set<number>();
  for (let i = 0; i < 9; i++) runs.add(rng.int(4, W - 5));
  for (let y = 4; y < 36; y++) {
    const share = 0.5 * (1 - (y - 4) / 32);
    for (let x = 1; x < W - 1; x++) {
      if (runs.has(x) && y > 8) continue;
      if (hash2(x >> 1, y >> 1, 77) < share) c.set(x, y, fog, 2.4, F);
    }
  }
  for (const x of runs) c.set(x, 8 + (x % 5), fog, 3.2, F);
  c.frame(0, 0, W, H, frame, 2, F);
}

/** The doorway before the doors burst (GLOW): a red corridor of tiles and hooks into the dark. */
function paintDoorway(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const tile = k.ramp(0x9a3a30, { light: 0.4 });
  const dark = k.ramp(0x1a0606, { light: 0.4 });
  const red = k.ramp(0xff3a2a, { light: 0.5 });
  const steel = k.ramp(0x8a8a90, { light: 0.5, sat: 0.4 });
  const blood = k.ramp(0x5a0808, { light: 0.4 });
  const meat = k.ramp(0x7a2420, { light: 0.4 });
  // One-point perspective: the corridor's far end a dark rectangle in the middle.
  const fx0 = 36;
  const fx1 = 66;
  const fy0 = 30;
  const fy1 = 78;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= fx0 && x < fx1 && y >= fy0 && y < fy1) {
        c.set(x, y, dark, 1, F);
        continue;
      }
      // Which plane: left / right wall, ceiling, floor (by the diagonals to the corners).
      const lx = x < fx0 ? (fx0 - x) / fx0 : x >= fx1 ? (x - fx1) / (W - fx1) : 0;
      const ly = y < fy0 ? (fy0 - y) / fy0 : y >= fy1 ? (y - fy1) / (H - fy1) : 0;
      const depth = Math.max(lx, ly);
      if (ly > lx) {
        // Ceiling (red-lit) / floor (wet, blood).
        c.set(x, y, y < fy0 ? tile : blood, y < fy0 ? 2 + depth * 2 : 1 + depth * 2, F | PWF.DITHER);
      } else {
        // Walls: tile joints converging.
        const joint = Math.round(y / 6) % 2 === 0 && (y % 6 === 0);
        c.set(x, y, tile, joint ? 1 : 1.5 + depth * 2.5, F | PWF.DITHER);
      }
    }
  }
  // Hooks along the ceiling line with meat silhouettes, receding.
  for (const [x, s] of [
    [14, 1],
    [26, 0.75],
    [76, 0.75],
    [88, 1],
  ] as const) {
    const y0 = Math.round(fy0 - 22 * s);
    c.vline(x, y0, Math.round(6 * s), steel, 3, F);
    for (let y = 0; y < Math.round(26 * s); y++) {
      const hw = Math.round((2 + Math.sin((y / (26 * s)) * Math.PI) * 4) * s);
      c.hline(x - hw, y0 + Math.round(6 * s) + y, hw * 2 + 1, meat, 2, F);
    }
  }
  // A red lamp far off, a blood trail running in.
  c.rect(48, fy0 + 4, 6, 3, red, 5, F);
  for (let y = fy1; y < H; y++) {
    const w = 2 + Math.round((y - fy1) / 6);
    c.hline(50 - w + Math.round(Math.sin(y * 0.3) * 2), y, w * 2, blood, 2, F);
  }
}

/** The butcher's door panel (lit): heavy planks, a red-glowing porthole, kick plate, bloody hand prints. */
function paintMeatDoor(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const wood = k.ramp(0x4a301f, { light: 0.42, sat: 0.95 });
  const steel = k.ramp(0x9a9aa0, { light: 0.55, sat: 0.4 });
  const red = k.ramp(0xff5a3a, { light: 0.5 });
  const blood = k.ramp(0x6a0a0a, { light: 0.4 });
  for (let x = 0; x < W; x++) {
    const b = Math.floor(x / 10);
    c.rect(x, 0, 1, H, wood, x % 10 === 0 ? 1 : x % 10 === 1 ? 4 : hash2(b, 1, 3) > 0.5 ? 3 : 2.75);
  }
  c.frame(0, 0, W, H, wood, 1);
  // Porthole.
  const cx = W / 2;
  const cy = 26;
  for (let y = cy - 12; y <= cy + 12; y++) for (let x = cx - 12; x <= cx + 12; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= 11.5 && d > 9) c.set(x, y, steel, x + y < cx + cy ? 5 : 2);
    else if (d <= 9) c.set(x, y, red, d < 4 ? 5 : 4, F);
  }
  // Kick plate, push plate, bolts.
  c.rect(2, H - 16, W - 4, 13, steel, 3);
  c.hline(2, H - 16, W - 4, steel, 5);
  c.rect(W - 12, 46, 6, 14, steel, 4);
  for (const [x, y] of [[4, 4], [W - 6, 4], [4, H - 20], [W - 6, H - 20]]) c.set(x, y, steel, 5);
  // Bloody hand prints and a smear down from them.
  for (const [hx, hy] of [[14, 52], [26, 60]]) {
    c.ellipse(hx, hy, 3, 3.5, blood, 2);
    for (let f = 0; f < 4; f++) c.vline(hx - 3 + f * 2, hy - 7, 4, blood, 2);
    for (let j = 0; j < 14; j++) c.set(hx + (j % 3 === 0 ? 1 : 0), hy + 4 + j, blood, 2);
  }
}

/** Striped awning canvas (wrap, stripes running down the slope): red / cream, stains, the rib sag. */
function paintAwning(c: PwCanvas, k: PwKit) {
  const red = k.ramp(0x9a1a1a, { light: 0.45, sat: 1.05 });
  const cream = k.ramp(0xe0d8c8, { light: 0.32, sat: 0.6 });
  const blood = k.ramp(0x4a0606, { light: 0.4 });
  for (let x = 0; x < c.w; x++) {
    const st = Math.floor(x / 24) % 2;
    for (let y = 0; y < c.h; y++) {
      const sag = y % 32 < 2 ? 4 : y % 32 > 28 ? 2 : 3;
      c.set(x, y, st ? cream : red, st ? sag - 1 : sag);
    }
  }
  // Rain-water stains (darker blotches running down a stripe), a few blood drips at the lower edge.
  for (let i = 0; i < 4; i++) {
    const x = k.rng.int(2, c.w - 6);
    const y0 = k.rng.int(0, 40);
    for (let y = y0; y < Math.min(c.h, y0 + k.rng.int(10, 24)); y++) for (let j = 0; j < 3; j++) c.shift(x + j, y, -1);
  }
  for (let i = 0; i < 3; i++) c.cluster(k.rng.int(0, c.w - 3), k.rng.int(c.h - 8, c.h - 3), k.rng.int(0, 8), blood, 2);
}

/** The awning's lettered valance (14 × 0.5 m): scallops, PRIME MEATS · QUALITY CUTS · EST. 1922. */
function paintValance(c: PwCanvas, k: PwKit) {
  const red = k.ramp(0x9a1a1a, { light: 0.45, sat: 1.05 });
  const cream = k.ramp(0xe0d8c8, { light: 0.32, sat: 0.6 });
  const W = c.w;
  for (let x = 0; x < W; x++) {
    const lx = x % 16;
    const depth = 11 + Math.round(Math.sqrt(Math.max(0, 1 - ((lx - 7.5) / 8) ** 2)) * 4);
    for (let y = 0; y < depth; y++) c.set(x, y, red, y === 0 ? 4 : y >= depth - 1 ? 1 : 3);
  }
  const txt = 'PRIME MEATS  -  QUALITY CUTS  -  EST. 1922';
  const tw = textWidth(txt, FONT_5x7);
  drawText(c, txt, Math.round((W - tw) / 2), 2, FONT_5x7, cream, 3, { shadow: { ramp: red, tone: 1 } });
}

/** The cleaver-shaped neon blade sign (2.4 × 1.4 m, cut out round the cleaver): board, red tube outline, MEATS. */
function paintCleaver(c: PwCanvas, k: PwKit, mirror: boolean) {
  const W = c.w;
  const H = c.h;
  const mx = (x: number) => (mirror ? W - 1 - x : x);
  const board = k.ramp(0x1c1c22, { light: 0.5, sat: 0.8 });
  const neon = k.ramp(0xff4a3a, { light: 0.55, sat: 1.1 });
  const wood = k.ramp(0x4a301f, { light: 0.4 });
  // Blade: x 0…54, y 2…36 (rounded top-left corner); handle: x 54…77, y 8…20 (u runs out from the wall).
  const inBlade = (px: number, y: number) => {
    const x = mx(px);
    return x >= 0 && x < 54 && y >= 2 && y < 36 && !(x < 6 && y < 8 && Math.hypot(x - 6, y - 8) > 6);
  };
  const inHandle = (px: number, y: number) => {
    const x = mx(px);
    return x >= 54 && x < 75 && y >= 9 && y < 19;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inBlade(x, y)) c.set(x, y, board, y < 4 ? 3 : 2);
    else if (inHandle(x, y)) c.set(x, y, wood, y < 11 ? 4 : y > 16 ? 2 : 3);
  }
  // Rivets on the handle, the hole in the blade.
  for (const x of [58, 66]) c.set(mx(x), 13, board, 5);
  c.ellipse(mx(46), 10, 3, 3, board, 0);
  // Neon outline of the blade, MEATS in tube letters, a drip of red neon (blood) off the edge.
  for (let y = 2; y < 36; y++) for (let x = 0; x < W; x++) {
    if (!inBlade(x, y)) continue;
    const edge = !inBlade(x - 2, y) || !inBlade(x + 2, y) || !inBlade(x, y - 2) || !inBlade(x, y + 2);
    if (edge && (inBlade(x - 1, y) && inBlade(x + 1, y) && inBlade(x, y - 1) && inBlade(x, y + 1))) c.set(x, y, neon, 4, F);
  }
  neonText(c, 'MEATS', mirror ? W - 54 + 9 : 9, 13, FONT_5x7, neon, { core: 5, halo: 2 });
  for (let j = 0; j < 7; j++) c.set(mx(20), 36 + j, neon, j % 2 ? 3 : 4, F);
  c.ellipse(mx(20), 43, 1.2, 1.2, neon, 4, F);
}

/** Oxblood glazed tiles under the windows with a dark trim line (wrap, 64 × 32 = 2 × 1 m), chipped — low-key, not a pale band. */
function paintButcherTiles(c: PwCanvas, k: PwKit) {
  const w = k.ramp(0x6a2422, { light: 0.4, sat: 0.9 });
  const grout = k.ramp(0x3a1614, { light: 0.3 });
  const trim = k.ramp(0x2a2a2e, { light: 0.4 });
  const chip = k.ramp(0x9a8478, { light: 0.3 });
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const joint = y % 8 === 0 || x % 8 === 0;
    c.set(x, y, joint ? grout : w, joint ? 2 : x % 8 === 1 || y % 8 === 1 ? 3.4 : 2.8);
  }
  c.rect(0, 0, c.w, 3, trim, 3);
  c.hline(0, 0, c.w, trim, 4);
  for (let i = 0; i < 5; i++) c.cluster(k.rng.int(0, c.w - 3), k.rng.int(6, c.h - 3), k.rng.int(0, 3), chip, 2);
}

// ─── Kiosks ─────────────────────────────────────────────────────────────────

/** Kiosk wall (NEUTRAL, tinted per kiosk): tongue-and-groove boards, pasted bills, grime at the foot. */
function paintKioskWall(c: PwCanvas, k: PwKit) {
  const p = k.ramp(0xd8d8d8, { light: 0.45 });
  const paper = k.ramp(0xe8e0c8, { light: 0.35, sat: 0.5 });
  const ink = k.ramp(0x2a2a30, { light: 0.4 });
  for (let x = 0; x < c.w; x++) c.rect(x, 0, 1, c.h, p, x % 8 === 0 ? 1 : x % 8 === 1 ? 4 : 3);
  // Pasted bills (paper reads pale under the tint).
  for (const [x, y] of [[6, 10], [36, 18]] as const) {
    c.rect(x, y, 16, 20, paper, 3);
    c.hline(x, y, 16, paper, 4);
    drawText(c, 'EXTRA', x + 1, y + 2, FONT_3x5, ink, 1);
    for (let l = 0; l < 3; l++) c.hline(x + 2, y + 9 + l * 3, 12, ink, 2);
  }
  for (let y = c.h - 10; y < c.h; y++) for (let x = 0; x < c.w; x++) if (hash2(x, y, 4) < (y - (c.h - 10)) / 10) c.shift(x, y, -1);
}

/**
 * Bills on a kiosk (80 × 48, cut-out): the evening paper's EXTRA, a MISSING
 * poster with its photo, a gig bill for THE GHOULS, a torn cola ad — overlapping,
 * corners lifting, paste runs and rain streaks; the boards show between them.
 */
function paintBills(c: PwCanvas, k: PwKit, v: number) {
  const rng = k.rng;
  const paper = k.ramp(0xe8e0c8, { light: 0.4, sat: 0.5 });
  const white = k.ramp(0xf0f0ea, { light: 0.35, sat: 0.3 });
  const ink = k.ramp(0x1e1e24, { light: 0.4 });
  const red = k.ramp(0xc8302a, { light: 0.45, sat: 1.1 });
  const yel = k.ramp(0xe8c83a, { light: 0.45 });
  const blue = k.ramp(0x2a5aa8, { light: 0.45 });
  const photo = k.ramp(0x8a8478, { light: 0.5, sat: 0.3 });
  const skin = k.ramp(0xc89878, { light: 0.4 });
  const tape = k.ramp(0xd8c890, { light: 0.3 });
  /** A sheet with a ragged torn bottom edge (or right edge) and a lifted top corner. */
  const sheet = (x: number, y: number, w: number, h: number, ramp: number, seed: number) => {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const torn = yy > h - 4 && hash2(xx >> 1, seed, 9) * 4 < yy - (h - 4);
        if (torn) continue;
        c.set(x + xx, y + yy, ramp, xx === 0 || yy === 0 ? 4 : 3);
      }
    }
    // Lifted corner: the back of the paper (darker) folded over.
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4 - i; j++) c.set(x + w - 1 - j, y + i, ramp, 1);
    c.rect(x + 1, y, 3, 2, tape, 3);
  };
  // Torn remains of older bills underneath (strips).
  for (let i = 0; i < 8; i++) {
    const x = rng.int(0, 118);
    const y = rng.int(2, 40);
    c.rect(x, y, rng.int(4, 9), rng.int(3, 7), [paper, yel, white][i % 3], 2);
  }
  if (v === 1) {
    paintBillsB(c, k, sheet, { paper, white, ink, red, yel, blue, photo, skin });
  } else {
  // EXTRA — the evening paper's bill.
  sheet(0, 6, 31, 36, paper, 1);
  drawText(c, 'EXTRA', 1, 11, FONT_5x7, ink, 1);
  c.hline(2, 19, 27, ink, 1);
  drawText(c, 'DEAD', 3, 21, FONT_5x7, red, 2);
  drawText(c, 'WALK', 3, 29, FONT_5x7, red, 2);
  for (let l = 0; l < 2; l++) c.hline(3, 37 + l * 2, 22 - (l % 2) * 6, ink, 3);
  // MISSING with a photo.
  sheet(31, 2, 29, 30, white, 2);
  drawText(c, 'MISSING', 32, 4, FONT_3x5, ink, 1);
  c.rect(38, 10, 15, 12, photo, 2);
  c.ellipse(45, 15, 3, 3.5, skin, 2);
  c.rect(41, 19, 8, 3, photo, 1);
  c.rect(43, 13, 4, 1, ink, 1);
  for (let l = 0; l < 3; l++) c.hline(34, 24 + l * 2, 20 - l * 4, ink, 2);
  // THE GHOULS — a gig bill, red and yellow, pasted over the MISSING poster's corner.
  sheet(56, 10, 24, 34, red, 3);
  c.rect(57, 13, 22, 9, yel, 3);
  drawText(c, 'THE', 62, 15, FONT_3x5, red, 1);
  drawText(c, 'GHOULS', 57, 24, FONT_3x5, yel, 4);
  c.ellipse(68, 33, 5, 4, white, 4);
  c.set(66, 32, ink, 0);
  c.set(70, 32, ink, 0);
  c.hline(66, 35, 5, ink, 0);
  drawText(c, 'FRI', 58, 38, FONT_3x5, white, 4);
  // A torn strip of cola ad across the corner.
  sheet(20, 36, 18, 10, blue, 4);
  drawText(c, 'COLA', 22, 38, FONT_3x5, white, 4);
  // LOST DOG with a drawing, a civil defence notice half torn away.
  sheet(82, 4, 22, 28, paper, 5);
  drawText(c, 'LOST', 85, 6, FONT_3x5, ink, 1);
  drawText(c, 'DOG', 87, 12, FONT_3x5, ink, 1);
  c.ellipse(92, 22, 6, 3.5, photo, 3);
  c.ellipse(87, 19, 2.5, 2.5, photo, 3);
  for (const lx of [88, 91, 94, 97]) c.vline(lx, 25, 3, photo, 2);
  c.set(86, 18, ink, 0);
  sheet(104, 14, 24, 30, yel, 6);
  c.rect(106, 17, 20, 7, ink, 1);
  drawText(c, 'CIVIL', 107, 18, FONT_3x5, yel, 4);
  drawText(c, 'DEFENSE', 105, 26, FONT_3x5, ink, 1);
  c.ellipse(116, 36, 4, 4, red, 3);
  c.hline(112, 36, 9, white, 4);
  }
  // Paste runs and rain streaks down the lower edges.
  for (let i = 0; i < 24; i++) {
    const x = rng.int(0, 127);
    const y0 = rng.int(20, 40);
    for (let y = y0; y < Math.min(47, y0 + rng.int(3, 9)); y++) if (c.at(x, y)) c.shift(x, y, -1);
  }
}

/** The second kiosk's bills: CURFEW, a revival meeting, FIGHT NITE, a ROOM TO LET card, a torn cola strip. */
function paintBillsB(
  c: PwCanvas,
  k: PwKit,
  sheet: (x: number, y: number, w: number, h: number, ramp: number, seed: number) => void,
  r: { paper: number; white: number; ink: number; red: number; yel: number; blue: number; photo: number; skin: number },
) {
  const green = k.ramp(0x3a7a4a, { light: 0.45 });
  const purple = k.ramp(0x5a3a7a, { light: 0.45 });
  // CURFEW — the city's notice with its seal.
  sheet(0, 3, 39, 40, r.white, 11);
  drawText(c, 'CITY OF', 6, 6, FONT_3x5, r.ink, 1);
  c.ellipse(19, 17, 5, 5, r.blue, 2);
  c.ellipse(19, 17, 3, 3, r.white, 3);
  drawText(c, 'CURFEW', 2, 25, FONT_5x7, r.red, 2);
  drawText(c, '8 PM', 9, 34, FONT_5x7, r.ink, 1);
  // REPENT — a revival meeting in purple and white.
  sheet(38, 8, 24, 34, purple, 12);
  drawText(c, 'REPENT', 39, 11, FONT_3x5, r.white, 4);
  c.vline(49, 18, 12, r.yel, 4);
  c.hline(45, 22, 9, r.yel, 4);
  drawText(c, 'TENT', 42, 33, FONT_3x5, r.yel, 4);
  // FIGHT NITE — boxing bill, two silhouettes squaring up.
  sheet(62, 2, 30, 38, r.yel, 13);
  drawText(c, 'FIGHT', 65, 4, FONT_5x7, r.red, 2);
  c.ellipse(70, 17, 2, 2, r.ink, 1);
  c.rect(68, 19, 4, 8, r.ink, 1);
  c.hline(72, 21, 4, r.ink, 1);
  c.ellipse(84, 17, 2, 2, r.ink, 1);
  c.rect(82, 19, 4, 8, r.ink, 1);
  c.hline(78, 21, 4, r.ink, 1);
  drawText(c, 'NITE', 67, 31, FONT_5x7, r.ink, 1);
  // ROOM TO LET card, a torn green cola strip.
  sheet(94, 6, 20, 16, r.paper, 14);
  drawText(c, 'ROOM', 96, 8, FONT_3x5, r.ink, 1);
  drawText(c, 'TO LET', 95, 14, FONT_3x5, r.ink, 1);
  sheet(100, 26, 28, 14, green, 15);
  drawText(c, 'SUNSHINE', 101, 30, FONT_3x5, r.white, 4);
  sheet(30, 38, 22, 9, r.red, 16);
  drawText(c, 'VOTE', 33, 40, FONT_3x5, r.white, 4);
}

/** Two bundles of the evening paper, tied with string (24 × 14, cut-out). */
function paintBundle(c: PwCanvas, k: PwKit) {
  const paper = k.ramp(0xd8d0bc, { light: 0.4, sat: 0.4 });
  const ink = k.ramp(0x2a2a30, { light: 0.4 });
  const string = k.ramp(0xa87a4a, { light: 0.3 });
  for (const [x, y, w, h] of [
    [1, 6, 14, 8],
    [10, 1, 13, 6],
  ] as const) {
    c.rect(x, y, w, h, paper, 3);
    c.hline(x, y, w, paper, 4);
    for (let yy = y + 2; yy < y + h; yy += 2) c.hline(x + 1, yy, w - 2, paper, 2);
    c.rect(x + 2, y + 1, w - 4, 1, ink, 2);
    c.vline(x + (w >> 1), y, h, string, 3);
    c.frame(x, y, w, h, paper, 1);
  }
}

/** Kiosk fascia: a painted board in the stand's colour with a cream pinstripe and a scalloped tin drip edge. */
function paintFascia(c: PwCanvas, k: PwKit, hex: number, cream: number) {
  const b = k.ramp(hex, { light: 0.45 });
  const s = k.ramp(cream, { light: 0.35 });
  const tin = k.ramp(0x9a9a9e, { light: 0.5, sat: 0.3 });
  const W = c.w;
  // Rows 8…15 (the bottom 8 rows; texture v 0…8): board, stripe, scallops.
  c.rect(0, 8, W, 8, b, 3);
  c.hline(0, 8, W, b, 4);
  c.hline(0, 10, W, s, 3);
  for (let x = 0; x < W; x++) {
    const p = x % 8;
    const d = Math.abs(p - 3.5);
    c.set(x, 13, tin, 3);
    if (d < 3) c.set(x, 14, tin, d < 1.5 ? 4 : 2);
    if (d < 1.5) c.set(x, 15, tin, 1);
    else if (d >= 3) c.set(x, 15, b, 1);
  }
  for (let x = 2; x < W; x += 16) c.set(x, 12, b, 1);
  c.rect(0, 0, W, 8, b, 2);
}

/** The serving hatch (GLOW): papers and magazines on racks / the coffee urn, cups and doughnuts. */
function paintHatch(c: PwCanvas, k: PwKit, kind: 'news' | 'coffee') {
  const W = c.w;
  const H = c.h;
  const back = k.ramp(kind === 'news' ? 0xfff0c0 : 0xffd8a0, { light: 0.4 });
  const shelf = k.ramp(0x6a4a30, { light: 0.4 });
  const cols = [0xc83a3a, 0x3a8ac8, 0xe8d83a, 0xe8e8e8, 0x4aa84a].map((h) => k.ramp(h, { light: 0.4 }));
  const ink = k.ramp(0x1a1a20, { light: 0.4 });
  const steel = k.ramp(0xb8b8c0, { light: 0.6, sat: 0.4 });
  c.rect(0, 0, W, H, back, 3, F | PWF.DITHER);
  c.hline(0, 0, W, back, 5, F);
  if (kind === 'news') {
    for (let r = 0; r < 3; r++) {
      const y = 3 + r * 9;
      c.hline(1, y + 8, W - 2, shelf, 2, F);
      for (let x = 2; x < W - 6; x += 7) {
        const col = cols[Math.floor(hash2(x, r, 5) * cols.length)];
        c.rect(x, y, 6, 8, col, 3, F);
        c.hline(x + 1, y + 2, 4, ink, 1, F);
        c.hline(x + 1, y + 4, 3, ink, 2, F);
      }
    }
    drawText(c, 'DAILY', 3, 1, FONT_3x5, ink, 1, { flag: F });
  } else {
    // Urn, cup stacks, a tray of doughnuts, the price board.
    c.rect(4, 6, 10, 20, steel, 4, F);
    c.rect(6, 4, 6, 2, steel, 5, F);
    c.rect(8, 18, 2, 3, ink, 1, F);
    for (let x = 18; x < 30; x += 4) for (let y = 22; y > 10; y -= 3) c.rect(x, y, 3, 3, cols[3], 4, F);
    c.rect(32, 22, 18, 3, shelf, 2, F);
    for (let x = 33; x < 49; x += 5) {
      c.ellipse(x + 2, 20, 2.2, 1.6, k.ramp(0xc8904a, { light: 0.4 }), 3, F);
      c.set(x + 2, 20, ink, 1, F);
    }
    c.rect(34, 3, 24, 13, ink, 1, F);
    drawText(c, 'JOE 5c', 35, 4, FONT_3x5, back, 4, { flag: F });
    drawText(c, 'DONUT', 35, 10, FONT_3x5, back, 4, { flag: F });
  }
  c.rect(0, H - 3, W, 3, shelf, 3, F);
}

// ─── The bandstand ──────────────────────────────────────────────────────────

const PAINT_WHITE = 0xe4e0d4;

/** A turned bandstand post (21 × 90: round the 0.1 m post, its 2.8 m): white paint, rings and a vase near the foot and head, chips to the grey wood. */
function paintBandPost(c: PwCanvas, k: PwKit) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const p = k.ramp(PAINT_WHITE, { light: 0.45, sat: 0.4 });
  const wood = k.ramp(0x6a6458, { light: 0.4 });
  // Round shading: lit down one side of the wrap, shadow down the other.
  for (let x = 0; x < W; x++) {
    const t = Math.cos(((x + 0.5) / W) * Math.PI * 2);
    c.rect(x, 0, 1, H, p, t > 0.5 ? 4 : t > -0.3 ? 3 : 2);
  }
  // Turned details: collar rings at the head, a vase and rings at the foot (a rail meets it at ~0.8 m).
  for (const y of [3, 4, 9, 10, H - 4, H - 3, H - 22, H - 21]) c.shade(0, y, W, 1, -2);
  for (const y of [5, 11, H - 23]) c.shade(0, y, W, 1, 1);
  for (let y = H - 20; y < H - 6; y++) if (y % 4 === 0) c.shade(0, y, W, 1, -1);
  // Chips and grime.
  for (let i = 0; i < 14; i++) c.cluster(rng.int(0, W - 2), rng.int(0, H - 2), rng.int(0, 4), wood, 2);
  for (let y = H - 8; y < H; y++) for (let x = 0; x < W; x++) if (hash2(x, y, 5) < (y - (H - 8)) / 9) c.shift(x, y, -1);
}

/** A spindle balustrade between two posts (77 × 26 ≈ 2.4 × 0.8 m, cut-out): moulded top rail, bottom rail, turned spindles. */
function paintBalustrade(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const p = k.ramp(PAINT_WHITE, { light: 0.45, sat: 0.4 });
  // Top rail (lit top, shadow lip), bottom rail.
  c.rect(0, 0, W, 4, p, 3);
  c.hline(0, 0, W, p, 5);
  c.hline(0, 3, W, p, 1);
  c.rect(0, H - 5, W, 3, p, 3);
  c.hline(0, H - 5, W, p, 4);
  c.hline(0, H - 3, W, p, 1);
  // Spindles: 2 texels wide with a bulb in the middle, every 6.
  for (let x = 3; x < W - 2; x += 6) {
    for (let y = 4; y < H - 5; y++) {
      const m = Math.abs(y - (H - 1) / 2);
      c.set(x, y, p, 4);
      c.set(x + 1, y, p, 2);
      if (m < 3) {
        c.set(x - 1, y, p, 3);
        c.set(x + 2, y, p, 1);
      }
    }
  }
}

/** Gingerbread lace hanging under the eave (wrap 64 × 16; rows 4…15 used): a fret band, drops and pierced roundels (cut-out). */
function paintLace(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const p = k.ramp(PAINT_WHITE, { light: 0.45, sat: 0.4 });
  c.rect(0, 4, W, 2, p, 4);
  c.hline(0, 6, W, p, 2);
  for (let x = 0; x < W; x++) {
    const q = x % 16;
    const d = Math.abs(q - 7.5);
    // Scalloped arches between drops, a pierced roundel in each.
    const depth = Math.round(2 + Math.sqrt(Math.max(0, 64 - d * d)) * 0.7);
    for (let y = 7; y < 7 + depth && y < 16; y++) {
      const rx = q - 7.5;
      const ry = y - 10.5;
      if (rx * rx + ry * ry < 5 && y > 8) continue;
      c.set(x, y, p, y === 6 + depth ? 2 : 3);
    }
    if (q === 0 || q === 15) for (let y = 7; y < 16; y++) c.set(x, y, p, 3);
  }
}

/** Fish-scale cedar shingles (wrap 64 × 32): staggered courses of round-butted shingles, each course lapping the one below, weathered brown, moss. */
function paintShingles(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const s = k.ramp(0x6a4232, { light: 0.45, sat: 0.9 });
  const moss = k.ramp(0x3e5a32, { light: 0.4 });
  const put = (x: number, y: number, t: number) => c.set(((x % W) + W) % W, ((y % H) + H) % H, s, t);
  // Courses 8 texels apart; draw bottom-up so each course's round butts lie over the course below.
  for (let row = H / 8 - 1; row >= 0; row--) {
    for (let i = 0; i < W / 8; i++) {
      const cx = i * 8 + (row % 2) * 4 + 3.5;
      const y0 = row * 8;
      const tone = 3 + (hash2(i, row, 3) < 0.25 ? 1 : hash2(i, row, 4) < 0.2 ? -1 : 0);
      for (let yy = 0; yy < 11; yy++) {
        for (let xx = -4; xx < 4; xx++) {
          const x = Math.floor(cx + xx + 0.5);
          // The butt: square above, a half-round below (radius 4 about yy = 6).
          const dy = yy - 6;
          const d = Math.hypot(xx + 0.5, Math.max(0, dy));
          if (d > 4) continue;
          let t = tone;
          if (d > 3.2 && dy > 0) t = 1;
          else if (xx === -4) t = tone - 1;
          else if (xx === -3 && yy < 5) t = tone + 1;
          put(x, y0 + yy, t);
        }
      }
      // The shadow the butt casts on the course below.
      for (let xx = -2; xx < 2; xx++) put(Math.floor(cx + xx + 0.5), y0 + 11, 1);
    }
  }
  for (let i = 0; i < 6; i++) c.cluster(Math.floor(hash2(i, 1, 9) * (W - 3)), Math.floor(hash2(i, 2, 9) * (H - 3)), i % 6, moss, 2);
}

/** Beadboard soffit (wrap 64 × 64): narrow white boards with a bead line, a little damp. */
function paintBeadboard(c: PwCanvas, k: PwKit) {
  const p = k.ramp(0xd8d4c8, { light: 0.4, sat: 0.4 });
  for (let x = 0; x < c.w; x++) c.rect(x, 0, 1, c.h, p, x % 4 === 0 ? 1 : x % 4 === 1 ? 4 : 3);
  for (let i = 0; i < 40; i++) c.shift(Math.floor(hash2(i, 3, 2) * c.w), Math.floor(hash2(i, 4, 2) * c.h), -1);
}

// ─── The courthouse ─────────────────────────────────────────────────────────

/** Rusticated ashlar (wrap, 64 × 64): 1 × 0.5 m blocks, chamfered joints, a lit arris, weathering. */
function paintAshlar(c: PwCanvas, k: PwKit) {
  const s = k.ramp(0x7a7468, { light: 0.42, sat: 0.7 });
  const s2 = k.ramp(0x6a665e, { light: 0.42, sat: 0.7 });
  for (let y = 0; y < c.h; y++) {
    const row = y >> 4;
    const off = row % 2 ? 16 : 0;
    for (let x = 0; x < c.w; x++) {
      const lx = (x + off) & 31;
      const ly = y & 15;
      const bid = ((x + off) >> 5) + row * 7;
      const r = hash2(bid, 1, 13) > 0.7 ? s2 : s;
      let t = 3;
      if (ly === 0 || lx === 0) t = 0;
      else if (ly === 1 || lx === 1) t = 4;
      else if (ly === 15 || lx === 31) t = 1;
      else if (ly === 14 || lx === 30) t = 2;
      c.set(x, y, r, t);
    }
  }
  c.scatter(k.rng, 0, 0, c.w, c.h, 30, 0, -1, { shapes: 4 });
  for (let i = 0; i < 6; i++) {
    const x = k.rng.int(0, c.w - 1);
    for (let y = k.rng.int(0, 40); y < c.h; y++) if (hash2(x, y, 3) > 0.4) c.shift(x, y, -1);
  }
}

/** Fluted column shaft (wrap, 32 × 32): 4-texel flutes, lit on the left, drum joints. */
function paintColumn(c: PwCanvas, k: PwKit) {
  const s = k.ramp(0x8a847a, { light: 0.45, sat: 0.6 });
  for (let x = 0; x < c.w; x++) c.rect(x, 0, 1, c.h, s, (x & 3) === 0 ? 1 : (x & 3) === 1 ? 4 : 3);
  c.hline(0, 0, c.w, s, 2);
  c.scatter(k.rng, 0, 0, c.w, c.h, 8, 0, -1, { shapes: 3 });
}

/** Tall round-headed window in a stone surround (45 × 77 = 1.4 × 2.4 m): lit (blinds) or dark. */
function paintCourtWindow(c: PwCanvas, k: PwKit, lit: boolean) {
  const W = c.w;
  const H = c.h;
  const s = k.ramp(0x9a948a, { light: 0.45, sat: 0.6 });
  const fr = k.ramp(0x2a2a30, { light: 0.45 });
  const room = k.ramp(lit ? 0xffd08a : 0x1c2434, { light: 0.4 });
  const sky = k.ramp(0x46557a, { light: 0.35 });
  const cx = W / 2;
  const R = W / 2 - 1;
  const inside = (x: number, y: number, inset: number) => {
    const r = R - inset;
    if (y < r + inset) return Math.hypot(x + 0.5 - cx, y - (r + inset)) <= r;
    return x >= inset && x < W - inset && y < H - inset;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y, 0)) continue;
    if (!inside(x, y, 4)) {
      c.set(x, y, s, x < cx ? 4 : 2);
      continue;
    }
    if (!inside(x, y, 6)) {
      c.set(x, y, fr, 2);
      continue;
    }
    if (lit) c.set(x, y, room, (y - 6) % 4 === 0 ? 2 : y < 30 ? 4 : 3, F);
    else {
      const d = (x - y + 200) % 26;
      c.set(x, y, d < 3 ? sky : room, 2);
    }
  }
  // Glazing bars, the keystone, the sill.
  c.vline(cx, 6, H - 12, fr, 1);
  for (let y = 30; y < H - 6; y += 14) c.hline(6, y, W - 12, fr, 1);
  c.rect(cx - 3, 0, 7, 6, s, 4);
  c.rect(0, H - 4, W, 4, s, 3);
  c.hline(0, H - 4, W, s, 5);
}

/** Bronze double doors under a lit transom (GLOW), 3 × 4.2 m. */
function paintCourtDoor(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const bronze = k.ramp(0x6a4a2a, { light: 0.5, sat: 0.9 });
  const warm = k.ramp(0xffd8a0, { light: 0.4 });
  const ink = k.ramp(0x1a1a20, { light: 0.4 });
  c.rect(0, 0, W, H, bronze, 2, F);
  // Transom (fanlight) with radiating bars.
  for (let y = 4; y < 40; y++) for (let x = 4; x < W - 4; x++) {
    const a = Math.atan2(40 - y, x - W / 2);
    const bar = Math.round(a * 4) % 2 === 0 && Math.abs(a * 4 - Math.round(a * 4)) < 0.15;
    c.set(x, y, bar ? bronze : warm, bar ? 2 : 4, F);
  }
  // Two leaves: lit glass panels (warm) in bronze, push bars, the gap.
  for (const lx of [6, W / 2 + 2]) {
    c.rect(lx, 46, W / 2 - 8, H - 52, bronze, 3, F);
    c.rect(lx + 5, 52, W / 2 - 18, 52, warm, 3, F | PWF.DITHER);
    c.rect(lx + 3, 110, W / 2 - 14, 3, bronze, 5, F);
  }
  c.vline(W / 2, 44, H - 44, ink, 0, F);
  c.frame(0, 0, W, H, bronze, 1, F);
}

/** The carved frieze over the portico (14 × 0.8 m): MILLBROOK COUNTY COURTHOUSE in incised caps. */
function paintFrieze(c: PwCanvas, k: PwKit) {
  const s = k.ramp(0x9a948a, { light: 0.45, sat: 0.6 });
  const W = c.w;
  const H = c.h;
  c.rect(0, 0, W, H, s, 3);
  c.hline(0, 0, W, s, 5);
  c.hline(0, 2, W, s, 1);
  c.hline(0, H - 3, W, s, 1);
  c.hline(0, H - 1, W, s, 2);
  const txt = 'MILLBROOK  COUNTY  COURTHOUSE';
  const tw = textWidth(txt, FONT_BOLD);
  // Incised: dark letters with a lit lower-right edge.
  drawText(c, txt, Math.round((W - tw) / 2), 8, FONT_BOLD, s, 1, { shadow: { ramp: s, tone: 4 } });
  c.scatter(k.rng, 0, 3, W, H - 6, 30, 0, -1, { shapes: 3 });
}

/** A clock face (GLOW): roman hour marks, pierced hands, a bronze bezel. */
function paintClock(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const face = k.ramp(0xfff0c8, { light: 0.35 });
  const bronze = k.ramp(0x6a4a2a, { light: 0.5 });
  const ink = k.ramp(0x1a1612, { light: 0.4 });
  const cx = W / 2 - 0.5;
  const R = W / 2 - 1;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cx);
    if (d > R) continue;
    if (d > R - 3) c.set(x, y, bronze, x + y < W ? 4 : 2, F);
    else c.set(x, y, face, d < R * 0.5 ? 4 : 3, F | PWF.DITHER);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = R - 9;
    const r1 = R - 4;
    for (let r = r0; r < r1; r++) {
      c.set(Math.round(cx + Math.sin(a) * r), Math.round(cx - Math.cos(a) * r), ink, 1, F);
      if (i % 3 === 0) c.set(Math.round(cx + Math.sin(a) * r) + 1, Math.round(cx - Math.cos(a) * r), ink, 1, F);
    }
  }
  // Hands at ten to midnight: clean stepped strokes (the hour hand doubled).
  const hand = (a: number, len: number, thick: boolean) => {
    const x0 = Math.round(cx);
    const ex = Math.round(cx + Math.sin(a) * len);
    const ey = Math.round(cx - Math.cos(a) * len);
    c.line(x0, x0, ex, ey, ink, 1, F);
    if (thick) c.line(x0 + 1, x0, ex + 1, ey, ink, 1, F);
  };
  hand(-Math.PI / 36, R * 0.5, true);
  hand(-Math.PI / 3, R * 0.78, false);
  c.ellipse(cx, cx, 2, 2, bronze, 4, F);
}

/** The war memorial's bronze soldier (cut-out, 1.25 × 2.5 m): verdigris, rifle at port, the helmet's brim lit. */
function paintStatue(c: PwCanvas, k: PwKit) {
  const b = k.ramp(0x3e6050, { light: 0.45, sat: 0.9 });
  const H = c.h;
  // Silhouette built from limbs (y down): boots, legs, coat, arms with the rifle, head + helmet.
  c.rect(12, H - 6, 8, 6, b, 2);
  c.rect(22, H - 6, 8, 6, b, 2);
  c.poly([13, H - 6, 19, H - 6, 20, H - 34, 14, H - 34], b, 3);
  c.poly([22, H - 6, 28, H - 6, 27, H - 34, 21, H - 34], b, 2);
  c.poly([11, H - 32, 30, H - 32, 28, H - 62, 13, H - 62], b, 3);
  c.ellipse(20, H - 68, 4.5, 5, b, 3);
  c.ellipse(20, H - 72, 7, 3, b, 4);
  c.hline(13, H - 70, 14, b, 5);
  // Arms + rifle across the chest.
  c.line(12, H - 58, 8, H - 46, b, 3);
  c.line(29, H - 58, 30, H - 46, b, 2);
  for (let i = 0; i < 3; i++) c.line(4 + i, H - 40, 33 + i, H - 70, b, i === 0 ? 4 : 2);
  // Lit left edges (the moon), verdigris streaks.
  c.outline(0);
  for (let i = 0; i < 10; i++) {
    const x = k.rng.int(10, 30);
    for (let y = k.rng.int(H - 70, H - 30); y < H - 6; y++) if (c.at(x, y) && hash2(x, y, 3) > 0.3) c.shift(x, y, 1);
  }
}

/** The square's shop windows (BOOKS lit, TOYS dark), 6.5 × 2.3 m. */
function paintShopWindow(c: PwCanvas, k: PwKit, kind: 'books' | 'toys') {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const lit = kind === 'books';
  const fl = lit ? F : 0;
  const back = k.ramp(lit ? 0xffd8a0 : 0x1c2232, { light: 0.4 });
  const wood = k.ramp(lit ? 0x8a5a3a : 0x2a2420, { light: 0.4 });
  const frame = k.ramp(0x2a2a30, { light: 0.45 });
  const sky = k.ramp(0x46557a, { light: 0.35 });
  c.rect(0, 0, W, H, back, lit ? 3 : 1, fl | (lit ? PWF.DITHER : 0));
  if (kind === 'books') {
    const spines = [0x8a2a2a, 0x2a4a8a, 0x2a6a3a, 0xc8a040, 0x5a2a6a, 0xd8d0c0].map((h) => k.ramp(h, { light: 0.4 }));
    for (let r = 0; r < 4; r++) {
      const y = 6 + r * 16;
      c.rect(2, y + 12, W - 4, 2, wood, 3, F);
      for (let x = 4; x < W - 6; ) {
        const bw = rng.int(2, 4);
        const bh = rng.int(7, 11);
        c.rect(x, y + 12 - bh, bw, bh, spines[rng.int(0, spines.length - 1)], rng.chance(0.3) ? 4 : 3, F);
        x += bw + (rng.chance(0.08) ? 3 : 0);
      }
    }
    // A reading lamp, the cat in the window.
    c.rect(170, 40, 12, 4, k.ramp(0x2a6a3a, { light: 0.4 }), 3, F);
    c.rect(175, 44, 2, 12, wood, 2, F);
    c.ellipse(40, H - 8, 6, 4, k.ramp(0x2a2420, { light: 0.4 }), 1, F);
    c.ellipse(36, H - 13, 3, 3, k.ramp(0x2a2420, { light: 0.4 }), 1, F);
  } else {
    // Dark toyshop: a teddy, a rocket, a train on a shelf, catching a little street light.
    const toy = k.ramp(0x6a4a3a, { light: 0.4 });
    const tin = k.ramp(0x7a2a2a, { light: 0.4 });
    c.rect(4, H - 18, W - 8, 3, wood, 2);
    c.ellipse(40, H - 30, 10, 11, toy, 2);
    c.ellipse(40, H - 46, 7, 7, toy, 2);
    c.ellipse(34, H - 52, 2.5, 2.5, toy, 2);
    c.ellipse(46, H - 52, 2.5, 2.5, toy, 2);
    c.poly([110, H - 18, 120, H - 18, 118, H - 54, 115, H - 62, 112, H - 54], tin, 2);
    for (let i = 0; i < 4; i++) c.rect(140 + i * 14, H - 28, 12, 9, i === 0 ? tin : toy, 2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - y + 300) % 48 < 3) c.set(x, y, sky, 2);
  }
  c.frame(0, 0, W, H, frame, 2, fl);
  for (let i = 1; i < 3; i++) c.vline(Math.round((W * i) / 3), 0, H, frame, 2, fl);
  void FONT_5x7;
  void h6;
}
