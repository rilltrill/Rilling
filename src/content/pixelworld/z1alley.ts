import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD, textWidth } from './font';
import { NEUTRAL_HEX, neutral } from './retexture';
import { hash2 } from './surfaces';

/**
 * The back alley (and the street's small hardware) in ART: PIXEL WORLD:
 *  - `z1Graffiti`: spray-painted words as cut-out decals — fat letters with a
 *    dark outline, a highlight along their tops, overspray specks and drips;
 *  - dumpsters (ribbed steel with a stencil, rust, a tag), a heap of bin bags
 *    as a cut-out for crossed planes;
 *  - the ROAD CLOSED barricade board, a news box front, a mailbox, a bench's
 *    slats, a lamp pole and its sodium head.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** A spray-painted word (cut-out), caps 14 texels (0.44 m). Returns the tile; lay it at `size / 0.44` scale. */
export function z1Graffiti(atlas: PwAtlas, word: string, color: number): PwTile {
  const s = 2;
  const tw = textWidth(word, FONT_BOLD, { scale: s });
  const W = tw + 8;
  const H = 7 * s + 12;
  return atlas.tile(`z1graf|${word}|${h6(color)}`, W, H, (c, k) => {
    const fill = k.ramp(color, { light: 0.45, sat: 1.05 });
    const out = k.ramp(0x14141a, { light: 0.4 });
    const x = 4;
    const y = 3;
    // Outline: the word drawn dark one texel round, then the fill with a lit top band.
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) drawText(c, word, x + dx, y + dy, FONT_BOLD, out, 1, { scale: s });
    drawText(c, word, x, y, FONT_BOLD, fill, 3, { scale: s, shadeFn: (_u, v) => (v < 0.25 ? 1 : v > 0.8 ? -1 : 0) });
    // Drips off the bottoms of a few letters, overspray specks round the word.
    for (let i = 0; i < Math.max(2, word.length >> 1); i++) {
      const dx = x + k.rng.int(2, tw - 3);
      let yy = y + 7 * s;
      while (yy > y && c.at(dx, yy) !== fill) yy--;
      if (c.at(dx, yy) !== fill) continue;
      const len = k.rng.int(3, 9);
      for (let j = 1; j <= len; j++) c.set(dx, yy + j, fill, j === len ? 4 : 2);
    }
    for (let i = 0; i < word.length * 4; i++) {
      const px = k.rng.int(0, W - 1);
      const py = k.rng.int(0, H - 1);
      if (!c.at(px, py)) c.set(px, py, fill, 2);
    }
  });
}

export interface Z1AlleyTiles {
  dumpSide: PwTile;
  dumpEnd: PwTile;
  dumpLid: PwTile;
  bags: PwTile;
  roadClosed: PwTile;
  newsFront: PwTile;
  mailbox: PwTile;
  slats: PwTile;
  pole: PwTile;
  lampHead: PwTile;
}

export function z1AlleyTiles(a: PwAtlas): Z1AlleyTiles {
  return {
    dumpSide: neutral(a.tile('z1al|dumpside', 70, 40, (c, k) => paintDumpster(c, k, true)), NEUTRAL_HEX),
    dumpEnd: neutral(a.tile('z1al|dumpend', 42, 40, (c, k) => paintDumpster(c, k, false)), NEUTRAL_HEX),
    dumpLid: a.tile('z1al|dumplid', 32, 32, paintLid, { wrap: true }),
    bags: a.tile('z1al|bags', 64, 36, paintBags),
    roadClosed: a.tile('z1al|roadclosed', 80, 19, paintRoadClosed),
    newsFront: neutral(a.tile('z1al|newsbox', 16, 30, paintNewsBox), NEUTRAL_HEX),
    mailbox: a.tile('z1al|mailbox', 16, 24, paintMailbox),
    slats: a.tile('z1al|slats', 32, 16, paintSlats, { wrap: true }),
    pole: a.tile('z1al|pole', 16, 64, paintPole, { wrap: true }),
    lampHead: a.tile('z1al|lamphead', 30, 16, paintLampHead),
  };
}

/** Dumpster side / end (NEUTRAL: tinted per bin): vertical ribs, a stencil, rust round the foot, a tag. */
function paintDumpster(c: PwCanvas, k: PwKit, side: boolean) {
  const W = c.w;
  const H = c.h;
  const p = k.ramp(NEUTRAL_HEX, { light: 0.5, sat: 1 });
  const rust = k.ramp(0x8a4a24, { light: 0.4 });
  const ink = k.ramp(0xe8e4d8, { light: 0.3 });
  for (let x = 0; x < W; x++) c.rect(x, 0, 1, H, p, x % 12 === 0 ? 4 : x % 12 === 1 ? 2 : 3);
  c.rect(0, 0, W, 3, p, 4);
  c.hline(0, 3, W, p, 1);
  c.rect(0, H - 4, W, 4, p, 2);
  if (side) {
    c.rect(14, 12, 42, 11, p, 2);
    drawText(c, 'WASTE CO', 16, 15, FONT_3x5, ink, 2);
    drawText(c, 'NO DUMPING', 16, 26, FONT_3x5, ink, 1);
  }
  for (let i = 0; i < 18; i++) {
    const x = k.rng.int(0, W - 1);
    const len = k.rng.int(3, 14);
    for (let j = 0; j < len; j++) if (hash2(x, j, 3) > j / len - 0.2) c.tint(x, H - 1 - j, rust, 0);
  }
  for (let i = 0; i < 10; i++) c.cluster(k.rng.int(0, W - 3), k.rng.int(4, H - 6), k.rng.int(0, 6), rust, 2);
}

function paintLid(c: PwCanvas, k: PwKit) {
  const p = k.ramp(0x24302a, { light: 0.4 });
  c.rect(0, 0, c.w, c.h, p, 3);
  for (let y = 0; y < c.h; y += 8) c.hline(0, y, c.w, p, 2);
  c.hline(0, 1, c.w, p, 4);
  c.scatter(k.rng, 0, 0, c.w, c.h, 8, 0, 1, { shapes: 3 });
}

/** A heap of black bin bags (cut-out, 2 × 1.1 m): knotted tops, glossy creases, one split, rubbish spilling. */
function paintBags(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const bag = k.ramp(0x1e2026, { light: 0.35, sat: 0.9 });
  const bag2 = k.ramp(0x22321e, { light: 0.35, sat: 1.1 });
  const trash = [0xc8c0a8, 0xc83a3a, 0x3a8ac8].map((h) => k.ramp(h, { light: 0.4 }));
  const blobs: [number, number, number, number, number][] = [
    [14, H - 12, 12, 10, bag],
    [36, H - 11, 13, 11, bag2],
    [52, H - 9, 10, 8, bag],
    [26, H - 22, 11, 9, bag],
    [44, H - 23, 9, 8, bag],
  ];
  for (const [cx, cy, rx, ry, r] of blobs) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1 || y >= H) continue;
        // Lit upper-left, dark lower-right, a glossy crease.
        // Black plastic: mostly dark, a hard glossy highlight on the upper-left of each bag.
        const l = -u * 0.5 - v * 0.7;
        c.set(x, y, r, l > 0.62 ? 4 : l > 0.25 ? 3 : l > -0.35 ? 2 : 1);
      }
    }
    // Knot.
    c.rect(cx - 1, Math.round(cy - ry) - 2, 3, 3, r, 2);
    c.set(cx - 2, Math.round(cy - ry) - 3, r, 3);
    c.set(cx + 2, Math.round(cy - ry) - 3, r, 3);
  }
  // A split bag spilling rubbish at the front.
  for (let i = 0; i < 14; i++) c.cluster(k.rng.int(4, W - 8), k.rng.int(H - 5, H - 2), k.rng.int(0, 6), trash[k.rng.int(0, 2)], 3);
  c.outline(0);
  void PWF;
}

/** ROAD CLOSED board: white face, orange border, black stencil letters, scuffs. 2.5 × 0.6 m. */
function paintRoadClosed(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const white = k.ramp(0xdedad0, { light: 0.35, sat: 0.6 });
  const orange = k.ramp(0xd9641c, { light: 0.45 });
  const ink = k.ramp(0x141414, { light: 0.4 });
  c.rect(0, 0, W, H, orange, 3);
  c.hline(0, 0, W, orange, 4);
  c.rect(2, 2, W - 4, H - 4, white, 3);
  const tw = textWidth('ROAD CLOSED', FONT_BOLD);
  drawText(c, 'ROAD CLOSED', Math.round((W - tw) / 2), 6, FONT_BOLD, ink, 1);
  c.scatter(k.rng, 2, 2, W - 4, H - 4, 10, 0, -1, { shapes: 3 });
  for (const x of [3, W - 4]) c.set(x, 3, white, 1);
}

/** News box front (NEUTRAL, tinted per box): the coin door with a newspaper behind its window, the brand plate. */
function paintNewsBox(c: PwCanvas, k: PwKit) {
  const p = k.ramp(NEUTRAL_HEX, { light: 0.5 });
  const glass = k.ramp(0x2a3040, { light: 0.4 });
  const paper = k.ramp(0xe0d8c0, { light: 0.35, sat: 0.4 });
  const ink = k.ramp(0x1a1a20, { light: 0.4 });
  c.rect(0, 0, c.w, c.h, p, 3);
  c.hline(0, 0, c.w, p, 5);
  c.rect(2, 4, 12, 11, glass, 2);
  c.rect(3, 6, 10, 8, paper, 3);
  drawText(c, 'DEAD', 3, 7, FONT_3x5, ink, 1);
  c.hline(4, 12, 8, ink, 2);
  c.rect(10, 17, 3, 4, p, 5);
  c.rect(2, 23, 12, 3, p, 2);
}

function paintMailbox(c: PwCanvas, k: PwKit) {
  const b = k.ramp(0x2a4888, { light: 0.45 });
  const w = k.ramp(0xe8e4d8, { light: 0.3 });
  c.rect(0, 0, c.w, c.h, b, 3);
  c.hline(0, 0, c.w, b, 5);
  c.rect(2, 4, 12, 2, b, 1);
  drawText(c, 'US', 4, 9, FONT_3x5, w, 3);
  drawText(c, 'MAIL', 0, 16, FONT_3x5, w, 3);
}

/** Bench slats (wrap): weathered boards, gaps, bolt heads. */
function paintSlats(c: PwCanvas, k: PwKit) {
  const wd = k.ramp(0x5c4432, { light: 0.4 });
  for (let y = 0; y < c.h; y++) c.rect(0, y, c.w, 1, wd, y % 5 === 0 ? 1 : y % 5 === 1 ? 4 : 3);
  for (let x = 4; x < c.w; x += 16) c.set(x, 2, wd, 5);
  c.scatter(k.rng, 0, 0, c.w, c.h, 6, 0, -1, { shapes: 3 });
}

/** Lamp pole (wrap along v): painted steel with a lit left flank, flaking paint, stapled bills low down. */
function paintPole(c: PwCanvas, k: PwKit) {
  const p = k.ramp(0x34363d, { light: 0.5, sat: 0.7 });
  const rust = k.ramp(0x7a4024, { light: 0.4 });
  const paper = k.ramp(0xd8d0b8, { light: 0.35, sat: 0.5 });
  for (let x = 0; x < c.w; x++) c.rect(x, 0, 1, c.h, p, x < 3 ? 4 : x < 6 ? 3 : x < 12 ? 2 : 1);
  for (let i = 0; i < 6; i++) c.cluster(k.rng.int(0, 13), k.rng.int(0, 60), k.rng.int(0, 4), rust, 2);
  c.rect(2, 40, 10, 12, paper, 3);
  c.hline(3, 43, 8, k.ramp(0x1a1a20, { light: 0.4 }), 2);
  c.hline(3, 46, 6, k.ramp(0x1a1a20, { light: 0.4 }), 2);
}

/** The cobra head of a sodium lamp seen from the side and below: housing, the glowing refractor. */
function paintLampHead(c: PwCanvas, k: PwKit) {
  const p = k.ramp(0x4a4c52, { light: 0.5, sat: 0.6 });
  const glow = k.ramp(0xffa54a, { light: 0.6 });
  c.poly([0, 4, 6, 1, 26, 1, 30, 5, 28, 10, 2, 10], p, 3);
  c.hline(6, 1, 20, p, 5);
  c.rect(4, 10, 22, 4, glow, 4, PWF.GLOW);
  c.hline(6, 13, 18, glow, 5, PWF.GLOW);
}

// ─── Gas station ────────────────────────────────────────────────────────────

export interface Z1GasTiles {
  fascia: PwTile;
  band: PwTile;
  soffit: PwTile;
  logo: PwTile;
  price: PwTile;
  pillar: PwTile;
  ad: PwTile;
  tape: PwTile;
  /** The GAS & GO store window bay (wrap along u, 128 × 112 = one 4 m shop bay). */
  store: PwTile;
  /** A pump (destructible; painted over its hit boxes): front with the lit price display, the hose side, the plain side, the cap. */
  pumpFront: PwTile;
  pumpHose: PwTile;
  pumpSide: PwTile;
  pumpCap: PwTile;
  /** The propane exchange cage: front (tanks through the diamond mesh, the PROPANE sign), side, lid. */
  cageFront: PwTile;
  cageSide: PwTile;
  /** An explosive drum (wrap round its 0.33 m radius: 64 texels; 0.9 m tall in the bottom 29 rows) and its lid. */
  drum: PwTile;
  drumLid: PwTile;
  /** The canopy's top (seen when it buckles): pale roofing membrane in sheets, ponding stains, grit. */
  roofTop: PwTile;
}

export function z1GasTiles(a: PwAtlas): Z1GasTiles {
  return {
    fascia: a.tile('z1gas|fascia', 64, 32, paintFascia, { wrap: true }),
    band: a.tile('z1gas|band', 64, 16, paintBand, { wrap: true }),
    soffit: a.tile('z1gas|soffit', 64, 64, paintSoffit, { wrap: true }),
    logo: a.tile('z1gas|logo', 192, 24, paintLogo),
    price: a.tile('z1gas|price', 70, 77, paintPrice),
    pillar: a.tile('z1gas|pillar', 16, 32, paintPillar, { wrap: true }),
    ad: a.tile('z1gas|ad', 35, 54, paintAd),
    tape: a.tile('z1gas|tape', 96, 16, paintTape, { wrap: true }),
    store: a.tile('z1gas|store', 128, 112, paintStore, { wrap: true }),
    pumpFront: a.tile('z1gas|pumpF', 27, 56, paintPumpFront),
    pumpHose: a.tile('z1gas|pumpH', 18, 56, (c, k) => paintPumpSide(c, k, true)),
    pumpSide: a.tile('z1gas|pumpS', 18, 56, (c, k) => paintPumpSide(c, k, false)),
    pumpCap: a.tile('z1gas|pumpC', 29, 19, paintPumpCap),
    cageFront: a.tile('z1gas|cageF', 51, 54, (c, k) => paintCage(c, k, 3)),
    cageSide: a.tile('z1gas|cageS', 29, 54, (c, k) => paintCage(c, k, 1)),
    drum: a.tile('z1gas|drum', 64, 32, paintDrum, { wrap: true }),
    drumLid: a.tile('z1gas|drumLid', 22, 22, paintDrumLid),
    roofTop: a.tile('z1gas|roofTop', 64, 64, paintRoofTop, { wrap: true }),
  };
}

/**
 * The gas station's store window, one 4 m bay: steel fascia band and kick
 * plate, a mullion, and through the glass a night-lit convenience store —
 * fluorescent tubes, the cooler wall at the back (lit doors, bottles in rows),
 * a snack aisle end-on, the counter with its lotto sign — with sale bills taped
 * to the inside of the glass and a reflection streak across it. Muted goods
 * colours so the bay stays calm when minified.
 */
function paintStore(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const F = PWF.GLOW;
  const steel = k.ramp(0x8a8c90, { light: 0.45, sat: 0.5 });
  const riser = k.ramp(0x7a2a24, { light: 0.42, sat: 0.9 });
  const back = k.ramp(0xd8f0e0, { light: 0.45, sat: 0.6 });
  const tube = k.ramp(0xf0fff8, { light: 0.3 });
  const cooler = k.ramp(0x9ab8c8, { light: 0.45, sat: 0.6 });
  const shelf = k.ramp(0x5a6a70, { light: 0.4 });
  const ink = k.ramp(0x1a1c22, { light: 0.4 });
  const red = k.ramp(0xc8382a, { light: 0.45 });
  const yel = k.ramp(0xe0c040, { light: 0.45 });
  const blue = k.ramp(0x3a6ab8, { light: 0.45 });
  const goods = [0xa85a4a, 0x5a7aa8, 0xb8a85a, 0x6a9a6a, 0xc8c0b0].map((h) => k.ramp(h, { light: 0.4, sat: 0.7 }));
  const transomH = 14;
  const gy0 = transomH + 1;
  const riserH = 21;
  const gy1 = H - riserH - 3;
  // Fascia band and transom bar; kick plate.
  c.rect(0, 0, W, transomH + 1, steel, 2);
  c.hline(0, 0, W, steel, 4);
  c.rect(0, transomH - 3, W, 3, steel, 3);
  c.hline(0, transomH, W, steel, 1);
  c.rect(0, gy1 + 1, W, H - gy1 - 1, riser, 3);
  c.hline(0, gy1 + 1, W, steel, 4);
  c.hline(0, gy1 + 2, W, steel, 2);
  for (let x = 6; x < W; x += 32) c.rect(x, gy1 + 7, 24, riserH - 9, riser, 2);
  c.hline(0, H - 1, W, riser, 1);
  // Interior: back wall, falloff from the tubes.
  for (let y = gy0; y <= gy1; y++) for (let x = 2; x < W; x++) c.set(x, y, back, y < gy0 + 8 ? 4 : y > gy1 - 14 ? 2 : 3, F | PWF.DITHER);
  for (let x = 10; x < W - 20; x += 44) c.rect(x, gy0 + 1, 26, 2, tube, 5, F);
  // The cooler wall: lit glass doors with bottles in rows, dark door frames.
  const cy0 = gy0 + 8;
  const cy1 = gy0 + 40;
  for (let d = 0; d < 5; d++) {
    const x0 = 6 + d * 24;
    c.rect(x0, cy0, 22, cy1 - cy0, cooler, 4, F);
    c.frame(x0, cy0, 22, cy1 - cy0, shelf, 2, F);
    c.vline(x0 + 19, cy0 + 10, 8, shelf, 1, F);
    for (let r = 0; r < 4; r++) {
      const ry = cy0 + 3 + r * 7;
      c.hline(x0 + 1, ry + 5, 20, shelf, 2, F);
      for (let bx = x0 + 2; bx < x0 + 19; bx += 3) {
        const col = goods[Math.floor(hash2(bx, r + d * 4, 7) * goods.length)];
        c.rect(bx, ry + 1, 2, 4, col, 3, F);
        c.set(bx, ry, col, 2, F);
      }
    }
  }
  // Snack aisle end-on (centre-left) and the counter (right) with the LOTTO sign above it.
  const ay = cy1 + 4;
  c.rect(18, ay, 30, gy1 - ay, shelf, 2, F);
  for (let r = 0; r < 4; r++) {
    c.hline(18, ay + 3 + r * 6, 30, shelf, 3, F);
    for (let x = 19; x < 47; x += 4) c.rect(x, ay + r * 6, 3, 3, goods[Math.floor(hash2(x, r, 11) * goods.length)], 3, F);
  }
  c.rect(72, gy1 - 18, 50, 18, shelf, 2, F);
  c.hline(72, gy1 - 18, 50, shelf, 4, F);
  c.rect(98, gy1 - 26, 14, 8, ink, 1, F);
  c.rect(99, gy1 - 25, 12, 5, k.ramp(0x4aa8ff, { light: 0.4 }), 3, F);
  c.rect(78, cy1 + 2, 30, 8, yel, 4, F);
  drawText(c, 'LOTTO', 80, cy1 + 3, FONT_3x5, ink, 1, { flag: F });
  // Bills taped inside the glass (backs to the street: lit through, non-glowing fronts).
  const bill = (x: number, y: number, w: number, h: number, bg: number, fg: number, text: string, text2?: string) => {
    c.rect(x, y, w, h, bg, 3);
    c.hline(x, y, w, bg, 4);
    drawText(c, text, x + 2, y + 2, FONT_3x5, fg, 4);
    if (text2) drawText(c, text2, x + 2, y + 8, FONT_3x5, fg, 4);
    c.set(x, y, k.ramp(0xd8d0a0, { light: 0.3 }), 4);
    c.set(x + w - 1, y, k.ramp(0xd8d0a0, { light: 0.3 }), 4);
  };
  bill(54, gy0 + 46, 22, 14, red, yel, 'COLD', 'BEER');
  bill(8, gy0 + 50, 16, 8, blue, tube, 'ICE');
  // Reflection streak across the glass (lit, not glowing).
  const refl = k.ramp(0xb8c8d8, { light: 0.35 });
  for (let y = gy0; y <= gy1; y++) {
    const x = Math.round(84 + (gy1 - y) * 0.6);
    for (let j = 0; j < 3; j++) if (x + j < W && hash2(x + j, y, 3) > 0.25) c.set(x + j, y, refl, 4);
  }
  // Mullion (left edge of the bay).
  c.rect(0, gy0, 3, gy1 - gy0 + 1, steel, 3);
  c.vline(0, gy0, gy1 - gy0 + 1, steel, 4);
  c.vline(2, gy0, gy1 - gy0 + 1, steel, 2);
}

const PUMP_RED = 0xb82c22;

/** Red enamel with a lit left edge, a shadowed right one, scuffs, bullet dings and rust creeping up from the foot. */
function pumpEnamel(c: PwCanvas, k: PwKit, red: number) {
  const W = c.w;
  const H = c.h;
  const rust = k.ramp(0x6a3418, { light: 0.4 });
  for (let x = 0; x < W; x++) c.rect(x, 0, 1, H, red, x === 0 ? 4 : x === W - 1 ? 2 : 3);
  c.hline(0, 0, W, red, 5);
  for (let i = 0; i < 6; i++) c.cluster(Math.floor(hash2(i, W, 3) * (W - 2)), Math.floor(hash2(i, H, 4) * (H - 2)), i % 5, red, 2);
  for (let y = H - 9; y < H; y++) for (let x = 0; x < W; x++) if (hash2(x, y, 6) < (y - (H - 9)) / 11) c.set(x, y, rust, hash2(x, y, 7) < 0.5 ? 2 : 3);
}

/** Pump front (27 × 56 = 0.85 × 1.75 m): brand band, the lit price display, REG 87, louvred lower panel, kick plate. */
function paintPumpFront(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const red = k.ramp(PUMP_RED, { light: 0.5, sat: 1.05 });
  const white = k.ramp(0xf0ece0, { light: 0.3 });
  const ink = k.ramp(0x141418, { light: 0.4 });
  const cyan = k.ramp(0x9fe8ff, { light: 0.45 });
  const steel = k.ramp(0x9a9ca2, { light: 0.5, sat: 0.4 });
  pumpEnamel(c, k, red);
  // Brand band.
  c.rect(1, 1, W - 2, 5, white, 3);
  drawText(c, 'GAS', Math.round((W - textWidth('GAS', FONT_3x5)) / 2), 1, FONT_3x5, red, 3);
  // Price display (GLOW): dark bezel, cyan digits.
  c.rect(2, 7, W - 4, 15, ink, 1);
  c.frame(2, 7, W - 4, 15, steel, 3);
  c.rect(4, 9, W - 8, 11, cyan, 1, PWF.GLOW);
  drawText(c, '1.29', Math.round((W - textWidth('1.29', FONT_3x5)) / 2), 9, FONT_3x5, cyan, 5, { flag: PWF.GLOW });
  drawText(c, 'GAL', Math.round((W - textWidth('GAL', FONT_3x5)) / 2), 15, FONT_3x5, cyan, 3, { flag: PWF.GLOW });
  // Grade label, push button.
  c.rect(2, 24, W - 4, 7, white, 3);
  drawText(c, 'REG 87', 3, 25, FONT_3x5, ink, 1);
  c.rect(W - 6, 32, 3, 2, k.ramp(0xe8c040, { light: 0.4 }), 4);
  // Louvred lower panel.
  c.frame(2, 35, W - 4, 13, red, 1);
  for (let y = 37; y < 46; y += 2) c.hline(4, y, W - 8, red, 1);
  // Kick plate.
  c.rect(0, H - 6, W, 6, steel, 2);
  c.hline(0, H - 6, W, steel, 4);
}

/** Pump side (18 × 56 = 0.55 × 1.75 m): `hose` — the chrome nozzle in its holster and the black hose looping down. */
function paintPumpSide(c: PwCanvas, k: PwKit, hose: boolean) {
  const W = c.w;
  const H = c.h;
  const red = k.ramp(PUMP_RED, { light: 0.5, sat: 1.05 });
  const steel = k.ramp(0xb8bac0, { light: 0.55, sat: 0.4 });
  const black = k.ramp(0x18181c, { light: 0.4 });
  const white = k.ramp(0xf0ece0, { light: 0.3 });
  pumpEnamel(c, k, red);
  c.vline(Math.floor(W / 2), 2, H - 10, red, 2);
  c.rect(0, H - 6, W, 6, steel, 2);
  if (!hose) {
    // NO SMOKING decal.
    c.rect(3, 12, 12, 12, white, 3);
    c.ellipse(9, 18, 4, 4, red, 3);
    c.ellipse(9, 18, 2.5, 2.5, white, 3);
    c.line(6, 21, 12, 15, red, 3);
    return;
  }
  // Holster (chrome boot) and the nozzle handle, the hose swinging down to the ground and back up.
  c.rect(5, 16, 8, 14, steel, 3);
  c.vline(5, 16, 14, steel, 5);
  c.rect(7, 12, 4, 6, black, 1);
  c.rect(6, 10, 6, 3, steel, 4);
  for (let y = 30; y < H - 2; y++) {
    const t = (y - 30) / (H - 32);
    const x = Math.round(9 + Math.sin(t * Math.PI) * 5);
    c.set(x, y, black, 1);
    c.set(x + 1, y, black, 2);
  }
}

/** Pump cap (29 × 19: the 0.18 m band on the bottom 6 rows, the lid above): white enamel, red pinstripe. */
function paintPumpCap(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const w = k.ramp(0xdedad0, { light: 0.4, sat: 0.5 });
  const red = k.ramp(PUMP_RED, { light: 0.5 });
  c.rect(0, 0, W, H, w, 3);
  c.frame(0, 0, W, H - 6, w, 2);
  c.hline(0, H - 6, W, w, 5);
  c.hline(0, H - 3, W, red, 3);
  c.hline(0, H - 1, W, w, 1);
}

/** Propane exchange cage (1.6 / 0.9 × 1.7 m): white tanks behind a diamond wire mesh in a steel frame; the front carries the PROPANE sign. */
function paintCage(c: PwCanvas, k: PwKit, tanks: number) {
  const W = c.w;
  const H = c.h;
  const steel = k.ramp(0x44474e, { light: 0.5, sat: 0.6 });
  const dark = k.ramp(0x14161a, { light: 0.4 });
  const tank = k.ramp(0xd8d8d0, { light: 0.45, sat: 0.4 });
  const red = k.ramp(0xff5030, { light: 0.45 });
  const white = k.ramp(0xf0ece0, { light: 0.3 });
  c.rect(0, 0, W, H, dark, 1);
  // Tanks: rounded shoulders, a collar with handle holes, a foot ring, the top valve.
  const tw = 13;
  for (let i = 0; i < tanks; i++) {
    const x0 = Math.round((W - tanks * (tw + 3)) / 2) + i * (tw + 3) + 1;
    for (let y = 16; y < H - 4; y++) {
      for (let x = 0; x < tw; x++) {
        const u = (x + 0.5) / tw - 0.5;
        const sh = y < 21 ? Math.sqrt(Math.max(0, 0.25 - ((21 - y) / 12) ** 2)) : 0.5;
        if (Math.abs(u) > sh) continue;
        c.set(x0 + x, y, tank, u < -0.25 ? 4 : u > 0.3 ? 2 : 3);
      }
    }
    c.rect(x0 + 4, 11, 5, 5, tank, 2);
    c.rect(x0 + 5, 12, 3, 2, dark, 1);
    c.rect(x0 + 5, 9, 3, 2, steel, 4);
    c.hline(x0 + 1, H - 9, tw - 2, tank, 2);
  }
  // Diamond mesh over everything, the frame.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 6 === 0 || (x - y + 600) % 6 === 0) c.set(x, y, steel, (x + y) % 12 === 0 ? 3 : 2);
  c.frame(0, 0, W, H, steel, 3);
  c.hline(0, 0, W, steel, 5);
  if (tanks > 1) {
    c.rect(8, 2, W - 16, 9, red, 3, PWF.GLOW);
    drawText(c, 'PROPANE', Math.round((W - textWidth('PROPANE', FONT_3x5)) / 2), 4, FONT_3x5, white, 4, { flag: PWF.GLOW });
  }
}

/**
 * Explosive drum (wrap 64 × 32; rows 3…31 = the 0.9 m drum, bottom up): red
 * steel shaded round, two rolling hoops, the yellow FLAMMABLE diamond (GLOW,
 * as the classic label glows) centred on u = 0, rust and runs.
 */
function paintDrum(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const red = k.ramp(0xa82018, { light: 0.45, sat: 1.1 });
  const dark = k.ramp(0x5a120e, { light: 0.45 });
  const yel = k.ramp(0xffd23a, { light: 0.45 });
  const ink = k.ramp(0x1a1a1e, { light: 0.4 });
  const rust = k.ramp(0x6a3418, { light: 0.4 });
  for (let x = 0; x < W; x++) {
    // Lit from the street side: one bright stripe, falling off round the back.
    const a = (x / W) * Math.PI * 2;
    const l = Math.cos(a - 0.6);
    c.rect(x, 0, 1, H, red, l > 0.93 ? 4 : l > -0.3 ? 3 : 2);
  }
  // Hoops (≈ 0.25 m and 0.75 m up: rows from the bottom), top and bottom chimes.
  for (const r of [H - 1 - 8, H - 1 - 24]) {
    c.hline(0, r, W, dark, 2);
    c.hline(0, r - 1, W, red, 4);
  }
  c.hline(0, H - 29, W, dark, 1);
  c.hline(0, H - 1, W, dark, 1);
  // The FLAMMABLE diamond, front and back (u = 0, wrapping over the tile edge, and u = 32).
  const cy = H - 1 - 14;
  for (const u0 of [0, W / 2]) {
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 6) continue;
        const x = (u0 + dx + W) % W;
        const edge = Math.abs(dx) + Math.abs(dy) === 6;
        c.set(x, cy + dy, edge ? ink : yel, edge ? 1 : 3, edge ? 0 : PWF.GLOW);
      }
    }
    // A flame glyph in the diamond.
    for (const [dx, dy] of [[0, -3], [0, -2], [-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2], [1, 2]]) c.set((u0 + dx + W) % W, cy + dy, ink, 1);
  }
  // Rust blooms and runs, a dent.
  for (let i = 0; i < 10; i++) c.cluster(Math.floor(hash2(i, 1, 5) * (W - 3)), H - 1 - Math.floor(hash2(i, 2, 5) * 27), i % 6, rust, 2);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(hash2(i, 3, 5) * W);
    for (let y = H - 26; y < H - 26 + 4 + (i % 3) * 3; y++) c.set(x, y, rust, 2);
  }
}

/** Drum lid (planar across the disc): red steel, the rim ring, two bungs. */
function paintDrumLid(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const red = k.ramp(0xb3261e, { light: 0.5, sat: 1.05 });
  const dark = k.ramp(0x5a120e, { light: 0.45 });
  const steel = k.ramp(0x9a9ca2, { light: 0.5, sat: 0.4 });
  const r0 = W / 2;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - r0, y + 0.5 - r0);
    c.set(x, y, d > r0 - 2 ? dark : red, d > r0 - 2 ? 2 : d > r0 - 4 ? 4 : 3);
  }
  c.ellipse(r0 - 5, r0 - 2, 2, 2, steel, 3);
  c.ellipse(r0 + 5, r0 + 3, 1.5, 1.5, steel, 2);
}

/** Canopy top (wrap 64 × 64): pale membrane sheets with lapped seams, dark ponding stains, grit and a lost bottle cap. */
function paintRoofTop(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const m = k.ramp(0xb8b8b0, { light: 0.4, sat: 0.4 });
  const stain = k.ramp(0x6a6e70, { light: 0.4, sat: 0.4 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, m, y % 32 === 0 ? 4 : y % 32 === 1 ? 2 : 3);
  for (let i = 0; i < 3; i++) {
    const cx = Math.floor(hash2(i, 1, 13) * W);
    const cy = Math.floor(hash2(i, 2, 13) * H);
    for (let y = -6; y <= 6; y++) for (let x = -10; x <= 10; x++) if ((x * x) / 100 + (y * y) / 36 < 0.8 + (hash2(cx + x, cy + y, 3) - 0.5) * 0.4) c.set((cx + x + W) % W, (cy + y + H) % H, stain, 2);
  }
  c.scatter(k.rng, 0, 0, W, H, 18, stain, 1, { shapes: 2 });
}

/** Canopy fascia: white enamel panels with seams, rain streaks, a lit lip. */
function paintFascia(c: PwCanvas, k: PwKit) {
  const w = k.ramp(0xd2cec4, { light: 0.4, sat: 0.6 });
  c.rect(0, 0, c.w, c.h, w, 3);
  c.hline(0, 0, c.w, w, 5);
  c.hline(0, c.h - 1, c.w, w, 1);
  for (let x = 0; x < c.w; x += 32) c.vline(x, 0, c.h, w, 2);
  for (let i = 0; i < 6; i++) {
    const x = k.rng.int(0, c.w - 1);
    for (let y = 1; y < k.rng.int(8, 30); y++) if (hash2(x, y, 4) > 0.25) c.shift(x, y, -1);
  }
}

/** The red stripe (the bottom 10 rows of the tile = 0.32 m): enamel red with a chrome lip. */
function paintBand(c: PwCanvas, k: PwKit) {
  const r = k.ramp(0xa82a22, { light: 0.45, sat: 1.05 });
  const ch = k.ramp(0xb8bcc4, { light: 0.6, sat: 0.4 });
  c.hline(0, 6, c.w, ch, 5);
  for (let y = 7; y < 16; y++) c.hline(0, y, c.w, r, y === 7 ? 4 : y === 15 ? 2 : 3);
  for (let i = 0; i < 4; i++) c.set(k.rng.int(0, c.w - 1), k.rng.int(8, 14), r, 1);
}

/** Canopy soffit (seen from below): ribbed panels, grime round the fixtures, a few dead bugs. */
function paintSoffit(c: PwCanvas, k: PwKit) {
  const w = k.ramp(0xb8b4aa, { light: 0.4, sat: 0.5 });
  for (let x = 0; x < c.w; x++) c.rect(x, 0, 1, c.h, w, x % 8 === 0 ? 1 : x % 8 === 1 ? 4 : 3);
  for (let y = 0; y < c.h; y += 32) c.hline(0, y, c.w, w, 1);
  c.scatter(k.rng, 0, 0, c.w, c.h, 16, 0, -1, { shapes: 3 });
}

/** GAS & GO on the canopy's street face (GLOW letters on the white fascia, a red flame mark). 6 × 0.75 m. */
function paintLogo(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const w = k.ramp(0xd2cec4, { light: 0.4, sat: 0.6 });
  const red = k.ramp(0xff3020, { light: 0.55, sat: 1.1 });
  const amber = k.ramp(0xffb040, { light: 0.55 });
  c.rect(0, 0, W, H, w, 3);
  c.hline(0, 0, W, w, 5);
  const tw = textWidth('GAS & GO', FONT_BOLD, { scale: 2 });
  const x0 = Math.round((W - tw) / 2) + 10;
  drawText(c, 'GAS & GO', x0 + 1, 6, FONT_BOLD, k.ramp(0x5a1a14, { light: 0.4 }), 2, { scale: 2 });
  drawText(c, 'GAS & GO', x0, 5, FONT_BOLD, red, 4, { scale: 2, flag: PWF.GLOW, shadeFn: (_u, v) => (v < 0.3 ? 1 : 0) });
  // The flame mark.
  const fx = x0 - 18;
  c.poly([fx, 20, fx + 6, 3, fx + 9, 10, fx + 12, 6, fx + 14, 20], red, 4, PWF.GLOW);
  c.poly([fx + 4, 20, fx + 7, 11, fx + 10, 20], amber, 5, PWF.GLOW);
}

/** The price sign (lit): a red GAS lightbox over the black price board, glowing digits. 2.2 × 2.4 m. */
function paintPrice(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const red = k.ramp(0xc8281e, { light: 0.5, sat: 1.05 });
  const white = k.ramp(0xf0ece0, { light: 0.3 });
  const board = k.ramp(0x101012, { light: 0.4 });
  const green = k.ramp(0x6aff6a, { light: 0.5 });
  const frame = k.ramp(0x2a2a30, { light: 0.45 });
  c.rect(0, 0, W, H, frame, 3);
  c.rect(2, 2, W - 4, 30, red, 4, PWF.GLOW);
  c.hline(2, 2, W - 4, red, 5, PWF.GLOW);
  const tw = textWidth('GAS', FONT_BOLD, { scale: 2 });
  drawText(c, 'GAS', Math.round((W - tw) / 2), 9, FONT_BOLD, white, 4, { scale: 2, flag: PWF.GLOW });
  c.rect(2, 34, W - 4, H - 36, board, 2);
  drawText(c, 'REGULAR', 6, 38, FONT_3x5, white, 3, { flag: PWF.GLOW });
  const pw = textWidth('3.19', FONT_BOLD, { scale: 2 });
  drawText(c, '3.19', Math.round((W - pw) / 2), 48, FONT_BOLD, green, 4, { scale: 2, flag: PWF.GLOW });
  drawText(c, '9', W - 10, 50, FONT_3x5, green, 4, { flag: PWF.GLOW });
  drawText(c, 'CASH ONLY', 8, H - 9, FONT_3x5, white, 2, { flag: PWF.GLOW });
}

/** Canopy pillar (wrap along v): white enamel, a red band, scuffs and a sticker. */
function paintPillar(c: PwCanvas, k: PwKit) {
  const w = k.ramp(0xd2cec4, { light: 0.4, sat: 0.6 });
  for (let x = 0; x < c.w; x++) c.rect(x, 0, 1, c.h, w, x < 3 ? 4 : x > 12 ? 2 : 3);
  c.scatter(k.rng, 0, 0, c.w, c.h, 6, 0, -1, { shapes: 3 });
}

/** Bus-shelter lightbox ad (GLOW): the cola poster under its plastic. */
function paintAd(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const sky = k.ramp(0x3a8ac8, { light: 0.4, sat: 0.8 });
  const sun = k.ramp(0xe8c040, { light: 0.4 });
  const red = k.ramp(0xc8302a, { light: 0.45 });
  const cream = k.ramp(0xe8dcb8, { light: 0.35, sat: 0.6 });
  const glass = k.ramp(0x5a3a24, { light: 0.45 });
  const frame = k.ramp(0x3a3c44, { light: 0.45 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ray = Math.floor(((Math.atan2(y - 30, x - 17) + Math.PI) / (Math.PI * 2)) * 16) % 2 === 0;
    c.set(x, y, ray ? sun : sky, 3, PWF.GLOW);
  }
  for (let y = 12; y < 46; y++) {
    const t = (y - 12) / 34;
    const hw = t < 0.2 ? 2 : t < 0.4 ? 2 + (t - 0.2) * 25 : 7;
    for (let x = Math.round(17 - hw); x <= Math.round(17 + hw); x++) c.set(x, y, glass, x < 15 ? 4 : 2, PWF.GLOW);
  }
  c.rect(10, 30, 15, 6, cream, 4, PWF.GLOW);
  drawText(c, 'SUN', 11, 30, FONT_3x5, red, 3, { flag: PWF.GLOW });
  c.rect(0, H - 9, W, 9, cream, 4, PWF.GLOW);
  drawText(c, 'COLA', 9, H - 7, FONT_3x5, red, 3, { flag: PWF.GLOW });
  c.frame(0, 0, W, H, frame, 3);
}

/** Police tape (wrap along u, the band is the bottom 6 rows): yellow, POLICE LINE in black. */
function paintTape(c: PwCanvas, k: PwKit) {
  const y = k.ramp(0xd8b818, { light: 0.4 });
  const ink = k.ramp(0x141414, { light: 0.4 });
  for (let r = 10; r < 16; r++) c.hline(0, r, c.w, y, r === 10 ? 4 : 3);
  drawText(c, 'POLICE LINE', 2, 10, FONT_3x5, ink, 1);
  drawText(c, 'DO NOT', 52, 10, FONT_3x5, ink, 1);
}
