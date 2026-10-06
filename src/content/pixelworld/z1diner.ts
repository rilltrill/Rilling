import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD } from './font';
import { hash2 } from './surfaces';

/**
 * The chrome diner on MAIN STREET in ART: PIXEL WORLD — painted like the diner
 * in a 16-bit brawler's second stage: fluted stainless steel with hard chrome
 * highlights, red enamel stripes, a black-and-white enamel checker band; and
 * behind the glass a lit room (GLOW texels — it shines into the wet street):
 * subway-tile wainscot under a peach wall, the menu board, a clock, the
 * kitchen pass with the cook and the heat lamps, the back bar with coffee urns
 * and the pie case, a checker floor, tufted red vinyl booths, formica tables,
 * chrome stools at the counter.
 */

const F = PWF.GLOW;

export interface Z1DinerTiles {
  flute: PwTile;
  stripe: PwTile;
  checker: PwTile;
  panel: PwTile;
  wall: PwTile;
  menu: PwTile;
  clock: PwTile;
  pass: PwTile;
  backbar: PwTile;
  floor: PwTile;
  ceiling: PwTile;
  counter: PwTile;
  chrome: PwTile;
  vinyl: PwTile;
  table: PwTile;
  stoolSide: PwTile;
  stoolTop: PwTile;
  door: PwTile;
}

export function z1DinerTiles(a: PwAtlas): Z1DinerTiles {
  return {
    flute: a.tile('z1diner|flute', 32, 32, paintFlute, { wrap: true }),
    stripe: a.tile('z1diner|stripe', 32, 16, paintStripe, { wrap: true }),
    checker: a.tile('z1diner|checker', 32, 16, paintCheckerBand, { wrap: true }),
    panel: a.tile('z1diner|panel', 64, 32, paintPanel, { wrap: true }),
    wall: a.tile('z1diner|wall', 64, 128, paintWall, { wrap: true }),
    menu: a.tile('z1diner|menu', 96, 48, paintMenu),
    clock: a.tile('z1diner|clock', 20, 20, paintClock),
    pass: a.tile('z1diner|pass', 80, 40, paintPass),
    backbar: a.tile('z1diner|backbar', 320, 45, paintBackbar),
    floor: a.tile('z1diner|floor', 64, 64, paintFloor, { wrap: true }),
    ceiling: a.tile('z1diner|ceiling', 64, 64, paintCeiling, { wrap: true }),
    counter: a.tile('z1diner|counter', 64, 48, paintCounter, { wrap: true }),
    chrome: a.tile('z1diner|chrome', 32, 16, paintChromeGlow, { wrap: true }),
    vinyl: a.tile('z1diner|vinyl', 32, 32, paintVinyl, { wrap: true }),
    table: a.tile('z1diner|table', 38, 22, paintTable),
    stoolSide: a.tile('z1diner|stoolside', 32, 16, paintStoolSide, { wrap: true }),
    stoolTop: a.tile('z1diner|stooltop', 16, 16, paintStoolTop),
    door: a.tile('z1diner|door', 45, 80, paintDoor),
  };
}

const steel = (k: PwKit) => k.ramp(0x9aa4ae, { light: 0.75, sat: 0.4 });

/** Fluted stainless (lit): 4-texel flutes, a seam with rivets every metre. */
function paintFlute(c: PwCanvas, k: PwKit) {
  const s = steel(k);
  for (let x = 0; x < c.w; x++) {
    const f = x & 3;
    c.rect(x, 0, 1, c.h, s, f === 0 ? 5 : f === 1 ? 4 : f === 2 ? 2 : 1);
  }
  c.hline(0, 0, c.w, s, 1);
  for (let x = 2; x < c.w; x += 8) c.set(x, 2, s, 5);
  // Rain streaks / grime toward the foot.
  for (let i = 0; i < 6; i++) {
    const x = k.rng.int(0, c.w - 1);
    for (let y = k.rng.int(16, 24); y < c.h; y++) c.shift(x, y, -1);
  }
}

/** Red enamel stripe with chrome edges (the band is the bottom 6 rows of the tile). */
function paintStripe(c: PwCanvas, k: PwKit) {
  const s = steel(k);
  const red = k.ramp(0xb02430, { light: 0.5, sat: 1.05 });
  c.hline(0, 10, c.w, s, 5);
  for (let y = 11; y < 15; y++) c.hline(0, y, c.w, red, y === 11 ? 4 : y === 14 ? 2 : 3);
  c.hline(0, 15, c.w, s, 1);
  for (let i = 0; i < 4; i++) c.set(k.rng.int(0, c.w - 1), k.rng.int(11, 14), red, 1);
}

/** Black / white enamel checker band (two rows of 4-texel squares = the bottom 8 rows), chipped. */
function paintCheckerBand(c: PwCanvas, k: PwKit) {
  const wht = k.ramp(0xe8e4dc, { light: 0.3, sat: 0.5 });
  const blk = k.ramp(0x1c1c22, { light: 0.5 });
  for (let y = 8; y < 16; y++) {
    for (let x = 0; x < c.w; x++) {
      const on = ((x >> 2) + (y >> 2)) & 1;
      c.set(x, y, on ? blk : wht, (x & 3) === 0 || y === 8 ? 4 : (y & 3) === 3 ? 2 : 3);
    }
  }
  for (let i = 0; i < 5; i++) c.set(k.rng.int(0, c.w - 1), k.rng.int(9, 15), blk, 1);
}

/** Stainless panels with rivet lines (shell sides / back). */
function paintPanel(c: PwCanvas, k: PwKit) {
  const s = k.ramp(0x8a9098, { light: 0.6, sat: 0.4 });
  c.rect(0, 0, c.w, c.h, s, 3);
  for (let x = 0; x < c.w; x += 32) {
    c.vline(x, 0, c.h, s, 1);
    c.vline(x + 1, 0, c.h, s, 4);
    for (let y = 3; y < c.h; y += 6) c.set(x + 3, y, s, 5);
  }
  c.hline(0, 0, c.w, s, 1);
  c.hline(0, 1, c.w, s, 4);
  for (let i = 0; i < 4; i++) {
    const x = k.rng.int(0, c.w - 1);
    for (let y = 2; y < c.h; y++) if (hash2(x, y, 3) > 0.3) c.shift(x, y, -1);
  }
}

/** Interior wall (GLOW): subway-tile wainscot, chrome rail, a peach wall, a darker frieze. 2 × 4 m. */
function paintWall(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const tile = k.ramp(0xc8d8b8, { light: 0.35, sat: 0.8 });
  const grout = k.ramp(0x7a8a70, { light: 0.3 });
  const peach = k.ramp(0xd8a878, { light: 0.35, sat: 0.9 });
  const frieze = k.ramp(0x8a3a30, { light: 0.4 });
  const chrome = steel(k);
  const base = k.ramp(0x2a2a30, { light: 0.4 });
  // Rows top-down: 0–7 frieze, 8–83 wall, 84–87 chrome rail, 88–123 tiles, 124–127 baseboard.
  c.rect(0, 0, W, 8, frieze, 3, F);
  c.hline(0, 7, W, frieze, 1, F);
  for (let y = 8; y < 84; y++) c.rect(0, y, W, 1, peach, y < 14 ? 2 : 3, F);
  // A soft wash of light under each pendant (two per tile, dithered — the light falloff).
  for (const lx of [16, 48]) {
    for (let y = 8; y < 40; y++) for (let x = lx - 12; x <= lx + 12; x++) {
      const d = Math.hypot(x - lx, (y - 8) * 0.9) / 14;
      if (d < 1) c.set(x, y, peach, 3 + (1 - d) * 1.2, F | PWF.DITHER);
    }
  }
  c.rect(0, 84, W, 4, chrome, 4, F);
  c.hline(0, 84, W, chrome, 5, F);
  c.hline(0, 87, W, chrome, 2, F);
  for (let y = 88; y < 124; y++) {
    for (let x = 0; x < W; x++) {
      const row = (y - 88) >> 2;
      const off = row & 1 ? 4 : 0;
      const joint = (y - 88) % 4 === 0 || (x + off) % 8 === 0;
      c.set(x, y, joint ? grout : tile, joint ? 2 : (x + off) % 8 === 1 ? 4 : 3, F);
    }
  }
  c.rect(0, 124, W, 4, base, 2, F);
}

/** Menu board (GLOW): black letter board in a chrome frame, white 3×5 type. 3 × 1.5 m. */
function paintMenu(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const chrome = steel(k);
  const board = k.ramp(0x1c1c24, { light: 0.4 });
  const ink = k.ramp(0xf0ece0, { light: 0.3 });
  const red = k.ramp(0xe04040, { light: 0.4 });
  c.rect(0, 0, W, H, chrome, 3, F);
  c.hline(0, 0, W, chrome, 5, F);
  c.hline(0, H - 1, W, chrome, 1, F);
  c.rect(2, 2, W - 4, H - 4, board, 2, F);
  drawText(c, 'MENU', 4, 4, FONT_BOLD, red, 4, { flag: F });
  const items = [
    ['BURGER', '25'],
    ['CHILI', '20'],
    ['FRIES', '10'],
    ['PIE', '15'],
    ['COFFEE', '5'],
    ['SHAKE', '20'],
  ];
  items.forEach(([n, p], i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const x = 4 + col * 46;
    const y = 15 + row * 9;
    drawText(c, n, x, y, FONT_3x5, ink, 4, { flag: F });
    drawText(c, p, x + 34, y, FONT_3x5, ink, 4, { flag: F });
  });
}

function paintClock(c: PwCanvas, k: PwKit) {
  const face = k.ramp(0xf0ece0, { light: 0.3 });
  const rim = k.ramp(0xc83030, { light: 0.4 });
  const ink = k.ramp(0x1c1c24, { light: 0.4 });
  const R = 9.6;
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const d = Math.hypot(x - 9.5, y - 9.5);
    if (d > R) continue;
    c.set(x, y, d > R - 2 ? rim : face, d > R - 2 ? (x + y < 19 ? 4 : 2) : 4, F);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.set(Math.round(9.5 + Math.cos(a) * 6), Math.round(9.5 + Math.sin(a) * 6), ink, 2, F);
  }
  c.line(10, 10, 10, 4, ink, 1, F);
  c.line(10, 10, 14, 12, ink, 1, F);
}

/** Kitchen pass-through (GLOW): stainless shelf, heat lamps, plates up, order slips, the cook behind. 2.5 × 1.25 m. */
function paintPass(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const chrome = steel(k);
  const kitchen = k.ramp(0xd8c890, { light: 0.4 });
  const heat = k.ramp(0xff8a3a, { light: 0.5 });
  const cook = k.ramp(0xe8e4dc, { light: 0.3 });
  const skin = k.ramp(0xc89070, { light: 0.4 });
  const plate = k.ramp(0xf0ece0, { light: 0.3 });
  const food = k.ramp(0x8a5a2a, { light: 0.4 });
  const paper = k.ramp(0xf0e8c0, { light: 0.3 });
  c.rect(0, 0, W, H, chrome, 3, F);
  c.rect(3, 3, W - 6, H - 12, kitchen, 2, F | PWF.DITHER);
  // The cook: white hat and jacket, a face, an arm reaching to the pass.
  const cx = 52;
  c.rect(cx - 4, 5, 9, 5, cook, 4, F);
  c.ellipse(cx, 13, 3.5, 4, skin, 3, F);
  c.rect(cx - 7, 17, 15, 14, cook, 3, F);
  c.vline(cx - 7, 17, 14, cook, 4, F);
  c.line(cx + 7, 20, cx + 14, 27, cook, 3, F);
  // Heat lamps (glowing orange) and the plates under them.
  for (const hx of [12, 30]) {
    c.rect(hx - 4, 3, 9, 3, chrome, 2, F);
    c.rect(hx - 3, 6, 7, 1, heat, 5, F);
    c.rect(hx - 6, H - 13, 12, 2, plate, 4, F);
    c.rect(hx - 4, H - 15, 8, 2, food, 3, F);
  }
  // Order slips on the rail.
  for (let x = 6; x < W - 10; x += 9) {
    c.rect(x, 3, 5, 7, paper, 4, F);
    c.hline(x + 1, 5, 3, food, 2, F);
  }
  c.rect(0, H - 9, W, 9, chrome, 4, F);
  c.hline(0, H - 9, W, chrome, 5, F);
  c.hline(0, H - 1, W, chrome, 1, F);
}

/** The back bar (GLOW): coffee urns, the pie case, a malt mixer, cups, the register. 10 × 1.4 m. */
function paintBackbar(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const chrome = steel(k);
  const wood = k.ramp(0x6a3a2a, { light: 0.4 });
  const glass = k.ramp(0xa8c8d0, { light: 0.4 });
  const pie = k.ramp(0xd8a050, { light: 0.4 });
  const cherry = k.ramp(0xc02030, { light: 0.4 });
  const cup = k.ramp(0xf0ece0, { light: 0.3 });
  const green = k.ramp(0x4aa86a, { light: 0.4 });
  // Cabinet: wood doors under a chrome counter.
  c.rect(0, 0, W, H, wood, 3, F);
  for (let x = 2; x < W; x += 20) {
    c.rect(x, 22, 17, 20, wood, 2, F);
    c.frame(x, 22, 17, 20, wood, 4, F);
    c.set(x + 14, 32, chrome, 5, F);
  }
  c.rect(0, 18, W, 4, chrome, 4, F);
  c.hline(0, 18, W, chrome, 5, F);
  // On the counter (rows 0–17): urns, the pie case, the mixer, cup stacks, the register.
  const urn = (x: number) => {
    for (let y = 2; y < 18; y++) {
      const hw = y < 4 ? 3 : 5;
      for (let j = -hw; j <= hw; j++) c.set(x + j, y, chrome, j < -hw + 2 ? 5 : j > hw - 2 ? 2 : 4, F);
    }
    c.rect(x - 1, 12, 3, 2, k.ramp(0x2a2a30, { light: 0.4 }), 2, F);
  };
  urn(14);
  urn(30);
  // Pie case: glass dome on a chrome base, three pies inside.
  c.rect(52, 4, 60, 14, glass, 3, F);
  c.frame(52, 4, 60, 14, chrome, 4, F);
  for (let i = 0; i < 3; i++) {
    const px = 58 + i * 18;
    c.rect(px, 11, 14, 4, pie, 3, F);
    c.hline(px, 11, 14, pie, 4, F);
    if (i === 1) for (let j = 0; j < 5; j++) c.set(px + 2 + j * 2, 10, cherry, 3, F);
  }
  c.hline(54, 6, 56, glass, 5, F);
  // Malt mixer.
  c.rect(130, 4, 8, 14, green, 3, F);
  c.rect(131, 12, 6, 6, chrome, 4, F);
  // Cup stacks.
  for (let x = 160; x < 220; x += 8) for (let y = 17; y > 6; y -= 3) if (hash2(x, y, 3) > 0.25) c.rect(x, y - 2, 5, 3, cup, y % 2 ? 4 : 3, F);
  // The register.
  c.rect(250, 4, 26, 14, chrome, 3, F);
  c.rect(254, 1, 18, 5, chrome, 4, F);
  c.rect(256, 2, 6, 2, green, 5, F);
  for (let x = 254; x < 272; x += 4) c.rect(x, 9, 3, 2, cup, 4, F);
  drawText(c, 'PIE', 290, 6, FONT_BOLD, cherry, 4, { flag: F });
}

/** Black-and-white checker floor (GLOW), 8-texel squares, scuffed. */
function paintFloor(c: PwCanvas, k: PwKit) {
  const wht = k.ramp(0xc8c4b8, { light: 0.3, sat: 0.5 });
  const blk = k.ramp(0x26262c, { light: 0.4 });
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const on = ((x >> 3) + (y >> 3)) & 1;
      c.set(x, y, on ? blk : wht, (x & 7) === 0 || (y & 7) === 0 ? 2 : 3, F);
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = k.rng.int(0, c.w - 4);
    const y = k.rng.int(0, c.h - 1);
    c.lineShade(x, y, x + k.rng.int(1, 4), y, -1);
  }
}

function paintCeiling(c: PwCanvas, k: PwKit) {
  const s = k.ramp(0x9a8a6a, { light: 0.35 });
  c.rect(0, 0, c.w, c.h, s, 2, F);
  for (let y = 0; y < c.h; y += 16) c.hline(0, y, c.w, s, 1, F);
  for (let x = 0; x < c.w; x += 16) c.vline(x, 0, c.h, s, 1, F);
}

/** Counter front (GLOW): steel cap, red quilted panel with chrome trim, a kick plate (the bottom 35 rows). */
function paintCounter(c: PwCanvas, k: PwKit) {
  const chrome = steel(k);
  const red = k.ramp(0xa82030, { light: 0.45, sat: 1.05 });
  const H = c.h;
  for (let y = H - 35; y < H; y++) {
    const r = y - (H - 35);
    for (let x = 0; x < c.w; x++) {
      if (r < 3) c.set(x, y, chrome, r === 0 ? 5 : 4, F);
      else if (r < 29) {
        // Quilting: diamonds with a button at each crossing.
        const d1 = (x + r) % 8;
        const d2 = (x - r + 800) % 8;
        c.set(x, y, red, d1 === 0 || d2 === 0 ? 2 : r < 6 ? 4 : 3, F);
        if (d1 === 0 && d2 === 0) c.set(x, y, chrome, 4, F);
      } else c.set(x, y, chrome, r === 29 ? 4 : 2, F);
    }
  }
}

function paintChromeGlow(c: PwCanvas, k: PwKit) {
  const s = steel(k);
  for (let y = 0; y < c.h; y++) c.rect(0, y, c.w, 1, s, y % 8 < 2 ? 5 : y % 8 < 5 ? 4 : 2, F);
}

/** Tufted red vinyl (GLOW): diamond tufting, a button at each crossing, piping every 32. */
function paintVinyl(c: PwCanvas, k: PwKit) {
  const red = k.ramp(0xb02a2a, { light: 0.45, sat: 1.05 });
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const d1 = (x + y) % 8;
      const d2 = (x - y + 800) % 8;
      const t = d1 === 0 || d2 === 0 ? 2 : d1 < 3 && d2 > 4 ? 4 : 3;
      c.set(x, y, red, t, F);
    }
  }
  for (let y = 0; y < c.h; y += 8) for (let x = 0; x < c.w; x += 8) c.set(x, y, red, 0, F);
  c.hline(0, 0, c.w, red, 5, F);
}

function paintTable(c: PwCanvas, k: PwKit) {
  const top = k.ramp(0xe0d8c8, { light: 0.3, sat: 0.6 });
  const fleck = k.ramp(0x5a9ac8, { light: 0.4 });
  const chrome = steel(k);
  c.rect(0, 0, c.w, c.h, top, 3, F);
  // Boomerang formica pattern.
  for (let i = 0; i < 9; i++) {
    const x = k.rng.int(3, c.w - 6);
    const y = k.rng.int(3, c.h - 4);
    c.line(x, y, x + 2, y - 1, fleck, 3, F);
    c.line(x + 2, y - 1, x + 4, y, fleck, 3, F);
  }
  c.frame(0, 0, c.w, c.h, chrome, 4, F);
  // Ketchup and mustard, a napkin box.
  c.rect(16, 8, 2, 4, k.ramp(0xc02020, { light: 0.4 }), 3, F);
  c.rect(19, 8, 2, 4, k.ramp(0xe0c020, { light: 0.4 }), 3, F);
  c.rect(23, 8, 4, 3, chrome, 4, F);
}

function paintStoolSide(c: PwCanvas, k: PwKit) {
  const red = k.ramp(0xc83030, { light: 0.45, sat: 1.05 });
  const chrome = steel(k);
  for (let y = 0; y < c.h; y++) c.rect(0, y, c.w, 1, y < 4 ? red : chrome, y < 4 ? (y === 0 ? 4 : 3) : y % 4 === 0 ? 5 : 3, F);
}

function paintStoolTop(c: PwCanvas, k: PwKit) {
  const red = k.ramp(0xc83030, { light: 0.45, sat: 1.05 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 8) continue;
    c.set(x, y, red, d > 6.5 ? 2 : x + y < 12 ? 4 : 3, F);
  }
  c.set(7, 7, red, 1, F);
}

/** The diner's front door (GLOW): chrome frame, porthole glass full of warm light, the hours card, a push plate. */
function paintDoor(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const chrome = steel(k);
  const warm = k.ramp(0xf0c880, { light: 0.4 });
  const card = k.ramp(0xf0ece0, { light: 0.3 });
  const red = k.ramp(0xc02020, { light: 0.4 });
  c.rect(0, 0, W, H, chrome, 3, F);
  c.vline(0, 0, H, chrome, 5, F);
  c.vline(W - 1, 0, H, chrome, 1, F);
  c.rect(5, 5, W - 10, 46, warm, 3, F | PWF.DITHER);
  for (let y = 5; y < 51; y++) for (let x = 5; x < W - 5; x++) if ((x + y) % 23 < 2) c.set(x, y, warm, 5, F);
  c.rect(10, 18, 25, 11, card, 4, F);
  drawText(c, 'OPEN', 12, 19, FONT_3x5, red, 3, { flag: F });
  drawText(c, '24 HRS', 11, 24, FONT_3x5, red, 3, { flag: F });
  c.rect(6, 56, W - 12, 4, chrome, 5, F);
  drawText(c, 'PUSH', 14, 64, FONT_3x5, chrome, 1, { flag: F });
  c.rect(4, H - 10, W - 8, 8, chrome, 2, F);
  void FONT_5x7;
}
