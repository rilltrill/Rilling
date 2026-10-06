import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5 } from './font';
import { hash2 } from './surfaces';
import { sprayInto, z1PieceSpec } from './z1graffiti';

/**
 * MAIN STREET shop bays painted for z1 alone (wrap along u, 128 × 112 = one
 * 4 m bay, like the toolkit's `shopfrontModule`): the coin laundry — a calm
 * night-lit interior instead of a blown-out white box.
 */

/** The coin laundry bay: washers in a row, dryers stacked on the back wall (two of them turning, warm), a folding table, OPEN 24 HRS on the glass. */
export function z1LaundryBay(atlas: PwAtlas): PwTile {
  return atlas.tile('z1shop|laundry', 128, 112, paintLaundry, { wrap: true });
}

/** The police station lobby bay: the front desk behind its glass, WANTED bills on a cork board, a bench, the flag, blinds half down. */
export function z1PoliceBay(atlas: PwAtlas, board = true): PwTile {
  return atlas.tile(`z1shop|police|${board ? 1 : 0}`, 128, 112, (c, k) => paintPolice(c, k, board), { wrap: true });
}

function paintPolice(c: PwCanvas, k: PwKit, board: boolean) {
  const W = c.w;
  const H = c.h;
  const F = PWF.GLOW;
  const frame = k.ramp(0x34343b, { light: 0.45, sat: 0.5 });
  const riser = k.ramp(0x2a3a4a, { light: 0.42, sat: 0.9 });
  const wall = k.ramp(0xa8c0d8, { light: 0.45, sat: 0.6 });
  const tube = k.ramp(0xe8f4ff, { light: 0.3 });
  const desk = k.ramp(0x5a4a3a, { light: 0.42 });
  const cork = k.ramp(0x9a7448, { light: 0.4 });
  const paper = k.ramp(0xe8e0c8, { light: 0.35, sat: 0.5 });
  const ink = k.ramp(0x1a1c22, { light: 0.4 });
  const blue = k.ramp(0x2a4a8a, { light: 0.45 });
  const red = k.ramp(0xc8382a, { light: 0.45 });
  const blind = k.ramp(0xc8c4b8, { light: 0.4, sat: 0.4 });
  const steel = k.ramp(0x8a8c90, { light: 0.5, sat: 0.4 });
  const transomH = 14;
  const gy0 = transomH + 1;
  const riserH = 21;
  const gy1 = H - riserH - 3;
  c.rect(0, 0, W, transomH + 1, frame, 2);
  c.hline(0, 0, W, frame, 4);
  c.rect(0, transomH - 3, W, 3, frame, 3);
  c.hline(0, transomH, W, frame, 1);
  c.rect(0, gy1 + 1, W, H - gy1 - 1, riser, 3);
  c.hline(0, gy1 + 1, W, frame, 4);
  for (let x = 6; x < W; x += 32) c.rect(x, gy1 + 7, 24, riserH - 9, riser, 2);
  // Lobby wall (GLOW at mid tones), tubes.
  for (let y = gy0; y <= gy1; y++) for (let x = 2; x < W; x++) c.set(x, y, wall, y < gy0 + 6 ? 4 : y > gy1 - 14 ? 2 : 3, F | PWF.DITHER);
  for (let x = 10; x < W - 20; x += 44) c.rect(x, gy0 + 1, 26, 1, tube, 5, F);
  if (board) {
    // Cork board with WANTED bills (one bay of the lobby).
    c.rect(8, gy0 + 10, 40, 24, cork, 3, F);
    c.frame(8, gy0 + 10, 40, 24, desk, 2, F);
    for (let i = 0; i < 3; i++) {
      const x0 = 11 + i * 12;
      c.rect(x0, gy0 + 13, 10, 13, paper, 3, F);
      c.ellipse(x0 + 5, gy0 + 18, 2.5, 3, ink, 2, F);
      c.hline(x0 + 1, gy0 + 23, 8, ink, 1, F);
      c.set(x0 + 5, gy0 + 13, red, 4, F);
    }
    drawText(c, 'WANTED', 13, gy0 + 27, FONT_3x5, ink, 1, { flag: F });
  } else {
    // The other bays: a row of plastic chairs under a framed city map, a water cooler.
    c.rect(10, gy0 + 8, 34, 22, paper, 2, F);
    c.frame(10, gy0 + 8, 34, 22, desk, 2, F);
    for (let i = 0; i < 5; i++) c.line(12 + i * 6, gy0 + 10, 16 + i * 5, gy0 + 27, blue, 2, F);
    c.hline(12, gy0 + 18, 30, red, 2, F);
    for (let i = 0; i < 4; i++) {
      const x0 = 8 + i * 9;
      c.rect(x0, gy1 - 13, 7, 2, blue, 3, F);
      c.rect(x0 + 5, gy1 - 19, 2, 6, blue, 2, F);
      c.vline(x0 + 1, gy1 - 11, 5, steel, 2, F);
    }
    c.rect(48, gy1 - 18, 6, 18, steel, 3, F);
    c.rect(48, gy1 - 26, 6, 8, k.ramp(0x8ac8f0, { light: 0.35 }), 3, F);
  }
  // The flag on its pole.
  c.vline(56, gy0 + 6, 40, steel, 4, F);
  c.rect(57, gy0 + 7, 14, 9, red, 3, F);
  for (let y = gy0 + 8; y < gy0 + 16; y += 2) c.hline(57, y, 14, paper, 3, F);
  c.rect(57, gy0 + 7, 6, 5, blue, 3, F);
  // Front desk behind its glass screen, a monitor, the duty officer's lamp.
  c.rect(76, gy1 - 22, 48, 22, desk, 3, F);
  c.hline(76, gy1 - 22, 48, desk, 4, F);
  c.rect(78, gy0 + 16, 44, gy1 - 22 - gy0 - 16, k.ramp(0xc8dce8, { light: 0.35 }), 4, F);
  c.frame(78, gy0 + 16, 44, gy1 - 22 - gy0 - 16, steel, 3, F);
  c.rect(90, gy1 - 30, 12, 8, ink, 1, F);
  c.rect(91, gy1 - 29, 10, 5, k.ramp(0x4aa8ff, { light: 0.4 }), 3, F);
  // A bench by the wall.
  c.rect(10, gy1 - 8, 36, 2, desk, 3, F);
  c.vline(12, gy1 - 6, 6, desk, 2, F);
  c.vline(43, gy1 - 6, 6, desk, 2, F);
  // Blinds half down over the right of the glass (lit, not glowing: the street side).
  for (let y = gy0; y < gy0 + 14; y++) c.hline(76, y, W - 76, blind, (y - gy0) % 3 === 2 ? 2 : 3);
  // Mullion.
  c.rect(0, gy0, 3, gy1 - gy0 + 1, frame, 3);
  c.vline(0, gy0, gy1 - gy0 + 1, frame, 4);
  c.vline(2, gy0, gy1 - gy0 + 1, frame, 2);
}

function paintLaundry(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const F = PWF.GLOW;
  const frame = k.ramp(0x8a8c90, { light: 0.45, sat: 0.5 });
  const riser = k.ramp(0x2a3a4a, { light: 0.42, sat: 0.9 });
  const wall = k.ramp(0x7a9a94, { light: 0.45, sat: 0.6 });
  const tube = k.ramp(0xe8fff8, { light: 0.3 });
  const enamel = k.ramp(0xb8bcb8, { light: 0.45, sat: 0.4 });
  const glass = k.ramp(0x2a3440, { light: 0.4 });
  const warm = k.ramp(0xffb860, { light: 0.4 });
  const table = k.ramp(0x7a6a5a, { light: 0.4 });
  const ink = k.ramp(0x1a1c22, { light: 0.4 });
  const red = k.ramp(0xc8382a, { light: 0.45 });
  const clothes = [0xc84a4a, 0x4a7ac8, 0xe8d84a, 0x6ab86a, 0xd8d0c0].map((h) => k.ramp(h, { light: 0.4, sat: 0.8 }));
  const transomH = 14;
  const gy0 = transomH + 1;
  const riserH = 21;
  const gy1 = H - riserH - 3;
  // Fascia band, transom, bulkhead.
  c.rect(0, 0, W, transomH + 1, frame, 2);
  c.hline(0, 0, W, frame, 4);
  c.rect(0, transomH - 3, W, 3, frame, 3);
  c.hline(0, transomH, W, frame, 1);
  c.rect(0, gy1 + 1, W, H - gy1 - 1, riser, 3);
  c.hline(0, gy1 + 1, W, frame, 4);
  for (let x = 6; x < W; x += 32) c.rect(x, gy1 + 7, 24, riserH - 9, riser, 2);
  // Back wall (GLOW, mid tones: lit, not blown out), the tubes.
  for (let y = gy0; y <= gy1; y++) for (let x = 2; x < W; x++) c.set(x, y, wall, y < gy0 + 6 ? 4 : y > gy1 - 12 ? 2 : 3, F | PWF.DITHER);
  for (let x = 12; x < W - 20; x += 46) c.rect(x, gy0 + 1, 24, 1, tube, 5, F);
  // Dryers stacked on the back wall: square doors with round windows; two are running (warm, tumbling clothes).
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 6; i++) {
      const x0 = 6 + i * 20;
      const y0 = gy0 + 6 + row * 17;
      c.rect(x0, y0, 18, 16, enamel, 3, F);
      c.hline(x0, y0, 18, enamel, 4, F);
      const running = (i + row * 3) % 5 === 1;
      c.ellipse(x0 + 9, y0 + 8, 5.5, 5.5, ink, 1, F);
      c.ellipse(x0 + 9, y0 + 8, 4.5, 4.5, running ? warm : glass, running ? 3 : 2, F);
      if (running) for (let j = 0; j < 5; j++) c.set(x0 + 6 + Math.floor(hash2(i, j, 3) * 6), y0 + 6 + Math.floor(hash2(j, i, 4) * 5), clothes[j % clothes.length], 3, F);
      c.set(x0 + 15, y0 + 2, running ? red : ink, running ? 4 : 1, F);
    }
  }
  // Washers in a row in front (top loaders' lids and round front windows), the folding table.
  const wy = gy1 - 16;
  for (let i = 0; i < 4; i++) {
    const x0 = 4 + i * 22;
    c.rect(x0, wy, 19, 16, enamel, 3, F);
    c.hline(x0, wy, 19, enamel, 5, F);
    c.rect(x0 + 1, wy + 1, 17, 3, enamel, 2, F);
    c.ellipse(x0 + 9.5, wy + 10, 4.5, 4.5, ink, 1, F);
    c.ellipse(x0 + 9.5, wy + 10, 3.5, 3.5, glass, 2, F);
    c.set(x0 + 8, wy + 9, clothes[i], 3, F);
    c.set(x0 + 10, wy + 11, clothes[(i + 2) % 5], 3, F);
  }
  c.rect(94, wy + 4, 30, 3, table, 3, F);
  c.vline(96, wy + 7, 9, table, 2, F);
  c.vline(121, wy + 7, 9, table, 2, F);
  c.rect(100, wy, 8, 4, clothes[1], 3, F);
  c.rect(110, wy + 1, 7, 3, clothes[0], 3, F);
  // OPEN 24 HRS bill on the glass (lit through: glowing red letters on white).
  c.rect(86, gy0 + 44, 30, 9, k.ramp(0xf0ece0, { light: 0.3 }), 4, F);
  drawText(c, 'OPEN 24', 88, gy0 + 46, FONT_3x5, red, 3, { flag: F });
  // Reflection streak, mullion.
  const refl = k.ramp(0xb8c8d8, { light: 0.35 });
  for (let y = gy0; y <= gy1; y++) {
    const x = Math.round(30 + (gy1 - y) * 0.6);
    for (let j = 0; j < 2; j++) if (hash2(x + j, y, 3) > 0.3) c.set(x + j, y, refl, 4);
  }
  c.rect(0, gy0, 3, gy1 - gy0 + 1, frame, 3);
  c.vline(0, gy0, gy1 - gy0 + 1, frame, 4);
  c.vline(2, gy0, gy1 - gy0 + 1, frame, 2);
}

// ─── Lit interiors in perspective ───────────────────────────────────────────

export type Z1LitKind = 'pharmacy' | 'liquor' | 'cinema' | 'lobby' | 'bar' | 'pawn';

/**
 * A lit shop seen through its window at night (wrap along u, one 4 m bay): a
 * room in one-point perspective at mid values — side walls lined with shelves
 * receding to a back wall, a floor of tiles / carpet converging, ceiling tubes
 * (the only pure white), the shop's own furniture (a counter, a gondola, a
 * concession stand, a front desk), a reflection streak on the glass. Riser and
 * frame in the facade's trim colours.
 */
export function z1LitBay(atlas: PwAtlas, kind: Z1LitKind, frame: number, riser: number): PwTile {
  const h6 = (n: number) => n.toString(16).padStart(6, '0');
  return atlas.tile(`z1lit|${kind}|${h6(frame)}|${h6(riser)}`, 128, 112, (c, k) => paintLitBay(c, k, kind, frame, riser), { wrap: true });
}

interface RoomLook {
  wall: number;
  floorA: number;
  floorB: number;
  ceil: number;
  tube: number;
}

const LOOKS: Record<Z1LitKind, RoomLook> = {
  pharmacy: { wall: 0x78a492, floorA: 0x969a92, floorB: 0x646c66, ceil: 0x6a7a72, tube: 0xf0fff8 },
  liquor: { wall: 0x8a6448, floorA: 0x7a5a44, floorB: 0x5a4234, ceil: 0x6a5a4a, tube: 0xfff0d0 },
  cinema: { wall: 0x8a2a2e, floorA: 0x7a1e24, floorB: 0x5a1418, ceil: 0x5a2a28, tube: 0xffe8b0 },
  lobby: { wall: 0x8a6a4c, floorA: 0x6a2a2a, floorB: 0x4a1c20, ceil: 0x7a6a54, tube: 0xffe8c0 },
  bar: { wall: 0x5a2a40, floorA: 0x4a3024, floorB: 0x3a241c, ceil: 0x3a1e2a, tube: 0xff9ac0 },
  pawn: { wall: 0x7a7a64, floorA: 0x6a6a64, floorB: 0x4a4a48, ceil: 0x5a5a50, tube: 0xf0ffe8 },
};

function paintLitBay(c: PwCanvas, k: PwKit, kind: Z1LitKind, frameHex: number, riserHex: number) {
  const W = c.w;
  const H = c.h;
  const F = PWF.GLOW;
  const L = LOOKS[kind];
  const frame = k.ramp(frameHex, { light: 0.45, sat: 0.5 });
  const riser = k.ramp(riserHex, { light: 0.42, sat: 0.9 });
  const wall = k.ramp(L.wall, { light: 0.4, sat: 0.8 });
  const flA = k.ramp(L.floorA, { light: 0.4, sat: 0.8 });
  const flB = k.ramp(L.floorB, { light: 0.4, sat: 0.8 });
  const ceil = k.ramp(L.ceil, { light: 0.4, sat: 0.7 });
  const tube = k.ramp(L.tube, { light: 0.3 });
  const ink = k.ramp(0x1a1c22, { light: 0.4 });
  const wood = k.ramp(0x6a4a34, { light: 0.42 });
  const steel = k.ramp(0x9a9ca0, { light: 0.5, sat: 0.4 });
  const goods = [0xd84a4a, 0x4a7ad8, 0xe8d84a, 0x5ab86a, 0xe8e4d8, 0xd88a3a].map((h) => k.ramp(h, { light: 0.4, sat: 0.75 }));
  const barDark = k.ramp(0x2a1a24, { light: 0.4 });
  const transomH = 14;
  const gy0 = transomH + 1;
  const riserH = 21;
  const gy1 = H - riserH - 3;
  // Frame: fascia band, transom, bulkhead panels.
  c.rect(0, 0, W, transomH + 1, frame, 2);
  c.hline(0, 0, W, frame, 4);
  c.rect(0, transomH - 3, W, 3, frame, 3);
  c.hline(0, transomH, W, frame, 1);
  c.rect(0, gy1 + 1, W, H - gy1 - 1, riser, 3);
  c.hline(0, gy1 + 1, W, frame, 4);
  for (let x = 6; x < W; x += 32) {
    c.rect(x, gy1 + 7, 24, riserH - 9, riser, 2);
    c.hline(x, gy1 + 7 + riserH - 10, 24, riser, 4);
  }
  // The room: glass rect G, back wall B (scale sb round the vanishing point V).
  const gx0 = 3;
  const gx1 = W;
  const sb = 0.42;
  const vx = 70;
  const vy = gy0 + Math.round((gy1 - gy0) * 0.55);
  const bx0 = Math.round(vx + (gx0 - vx) * sb);
  const bx1 = Math.round(vx + (gx1 - vx) * sb);
  const by0 = Math.round(vy + (gy0 - vy) * sb);
  const by1 = Math.round(vy + (gy1 + 1 - vy) * sb);
  const depthOf = (t: number) => {
    const S = 1 - t * (1 - sb);
    return (1 / S - 1) / (1 / sb - 1);
  };
  const shelfV = [0.12, 0.3, 0.48, 0.66];
  for (let y = gy0; y <= gy1; y++) {
    for (let x = gx0; x < gx1; x++) {
      if (x >= bx0 && x < bx1 && y >= by0 && y < by1) {
        // Back wall: its own painting below; base here.
        const v = 1 - (y - by0) / (by1 - by0);
        c.set(x, y, wall, v < 0.08 ? 1.6 : 2.2, F);
        continue;
      }
      let t = 2;
      let plane = 0;
      if (x < bx0) {
        const tt = (x - gx0) / (bx0 - gx0);
        if (tt < t) (t = tt), (plane = 1);
      }
      if (x >= bx1) {
        const tt = (gx1 - 1 - x) / (gx1 - 1 - bx1);
        if (tt < t) (t = tt), (plane = 2);
      }
      if (y < by0) {
        const tt = (y - gy0) / (by0 - gy0);
        if (tt < t) (t = tt), (plane = 3);
      }
      if (y >= by1) {
        const tt = (gy1 - y) / (gy1 - by1);
        if (tt < t) (t = tt), (plane = 4);
      }
      const d = depthOf(Math.max(0, Math.min(1, t)));
      const S = 1 - t * (1 - sb);
      if (plane === 3) {
        // Ceiling: dark, the tube rows receding (two columns).
        const u = (x - vx) / S / ((gx1 - gx0) / 2);
        const row = Math.floor(d * 5);
        const inTube = Math.abs(((d * 5) % 1) - 0.5) < 0.12 && (Math.abs(u + 0.45) < 0.22 || Math.abs(u - 0.45) < 0.22) && row < 4;
        c.set(x, y, inTube ? tube : ceil, inTube ? 5 : 2 - d * 0.8, F);
      } else if (plane === 4) {
        // Floor: tiles / carpet converging.
        const u = (x - vx) / S / ((gx1 - gx0) / 2);
        const fi = Math.floor(d * 9);
        const fj = Math.floor(u * 4 + 8);
        const carpet = kind === 'cinema' || kind === 'lobby';
        const odd = carpet ? (fi + fj) % 3 === 0 : (fi + fj) % 2 === 0;
        c.set(x, y, odd ? flA : flB, (carpet ? 2.6 : 3) - d * 1.2, F);
      } else {
        // Side walls with shelving / panels.
        const top = gy0 + (by0 - gy0) * t;
        const bot = gy1 + (by1 - gy1) * t;
        const v = (bot - y) / Math.max(1, bot - top);
        let r = wall;
        let tn = 2.8 - d * 1.1;
        if (kind === 'pharmacy' || kind === 'liquor' || kind === 'pawn') {
          const onShelf = shelfV.some((sv) => Math.abs(v - sv) < 0.018 + 0.01 * (1 - d));
          const between = v > 0.12 && v < 0.82;
          if (onShelf) (r = steel), (tn = 3.2 - d);
          else if (between) {
            // Goods: little blocks along each shelf, smaller with depth.
            const cell = Math.floor(d * (kind === 'liquor' ? 26 : 18));
            const lane = Math.floor(v * 5.5);
            const gi = Math.floor(hash2(cell, lane + plane * 7, 3) * goods.length);
            const gap = hash2(cell, lane, 9) > 0.86;
            if (!gap) (r = kind === 'liquor' ? [goods[5], goods[3], goods[4]][gi % 3] : goods[gi]), (tn = 2.3 - d * 0.9);
          }
        } else if (kind === 'cinema' && v > 0.3 && v < 0.75 && Math.floor(d * 6) % 2 === 1) {
          // Posters in frames along the walls.
          r = goods[Math.floor(d * 6) % goods.length];
          tn = 2.6 - d;
        } else if (kind === 'lobby' && v < 0.4) {
          r = wood;
          tn = 2.6 - d;
        } else if (kind === 'bar' && v > 0.25 && v < 0.6) {
          r = barDark;
          tn = 2;
        }
        c.set(x, y, r, tn, F);
      }
    }
  }
  // Back wall furniture (in B: bw × bh texels).
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const counter = (col: number, top: number) => {
    const y0 = by1 - Math.round(bh * top);
    c.rect(bx0 + 2, y0, bw - 4, by1 - y0 + 6, col, 2.4, F);
    c.hline(bx0 + 2, y0, bw - 4, col, 3.6, F);
  };
  if (kind === 'pharmacy') {
    for (let s = 0; s < 3; s++) for (let x = bx0 + 2; x < bx1 - 2; x += 3) c.rect(x, by0 + 4 + s * 6, 2, 3, goods[(x + s) % goods.length], 2.4, F);
    counter(k.ramp(0xd8dcd4, { light: 0.4 }), 0.32);
    drawText(c, 'RX', bx0 + Math.round(bw / 2) - 4, by0 + 1, FONT_3x5, k.ramp(0x3ad86a, { light: 0.4 }), 4, { flag: F });
    // A gondola end cap in the middle of the floor, its shelves facing us.
    const gx = vx - 9;
    const gy = by1 + 6;
    c.rect(gx, gy - 14, 18, 16, steel, 2.6, F);
    for (let s = 0; s < 3; s++) for (let x = gx + 1; x < gx + 17; x += 2) c.rect(x, gy - 13 + s * 5, 1, 3, goods[(x * 3 + s) % goods.length], 3, F);
  } else if (kind === 'liquor') {
    for (let s = 0; s < 3; s++) for (let x = bx0 + 2; x < bx1 - 2; x += 2) c.rect(x, by0 + 3 + s * 6, 1, 4, [goods[5], goods[3], goods[4]][(x + s) % 3], 3, F);
    counter(wood, 0.3);
    c.rect(bx0 + 6, by1 - Math.round(bh * 0.3) - 4, 6, 4, ink, 1.4, F);
    c.rect(bx0 + 7, by1 - Math.round(bh * 0.3) - 3, 4, 2, k.ramp(0x4ad87a, { light: 0.4 }), 3, F);
  } else if (kind === 'cinema') {
    // Concession stand: popcorn machine (warm glow), candy case, a TICKETS window.
    counter(k.ramp(0xb8862a, { light: 0.42 }), 0.36);
    c.rect(bx0 + 4, by0 + 6, 9, 10, k.ramp(0xffd86a, { light: 0.35 }), 3.4, F);
    c.frame(bx0 + 4, by0 + 6, 9, 10, steel, 2.6, F);
    for (let i = 0; i < 6; i++) c.set(bx0 + 5 + i, by0 + 12 + (i % 3), k.ramp(0xfff4d0, { light: 0.3 }), 4.2, F);
    c.rect(bx1 - 16, by0 + 6, 12, 8, k.ramp(0x2a1a14, { light: 0.4 }), 1.4, F);
    drawText(c, 'SNACK', bx0 + Math.round(bw / 2) - 9, by0 + 1, FONT_3x5, k.ramp(0xffd86a, { light: 0.35 }), 4, { flag: F });
  } else if (kind === 'lobby') {
    // Front desk with its bell and lamp, the key rack behind, a stair rail going up on the right.
    counter(wood, 0.34);
    for (let r = 0; r < 3; r++) for (let x = bx0 + 6; x < bx0 + 22; x += 3) c.set(x, by0 + 5 + r * 3, steel, 3.6, F);
    c.rect(bx0 + 26, by1 - Math.round(bh * 0.34) - 5, 2, 5, steel, 3, F);
    c.ellipse(bx0 + 27, by1 - Math.round(bh * 0.34) - 6, 3, 2, k.ramp(0xffd890, { light: 0.35 }), 4, F);
    for (let i = 0; i < 8; i++) c.line(bx1 - 14 + i * 2, by1 - 2 - i * 3, bx1 - 12 + i * 2, by1 - 2 - i * 3, wood, 3, F);
    // A potted palm by the window.
    const px = gx0 + 12;
    for (let i = 0; i < 5; i++) c.line(px, gy1 - 18, px - 7 + i * 3.5, gy1 - 28 + Math.abs(i - 2) * 3, k.ramp(0x3a6a3a, { light: 0.4 }), 2.4, F);
    c.rect(px - 3, gy1 - 18, 7, 8, k.ramp(0x8a4a2a, { light: 0.4 }), 2.6, F);
  } else if (kind === 'bar') {
    // Back bar: lit bottle shelves (pink), a mirror, the counter with stools in front.
    for (let s = 0; s < 2; s++) for (let x = bx0 + 2; x < bx1 - 2; x += 2) c.rect(x, by0 + 4 + s * 6, 1, 4, goods[(x + s) % goods.length], 3.4, F);
    c.rect(bx0 + 3, by0 + 16, bw - 6, 4, k.ramp(0x8a6a9a, { light: 0.35 }), 3, F);
    counter(wood, 0.3);
    for (let i = 0; i < 4; i++) {
      const sx = bx0 + 6 + i * Math.round((bw - 10) / 4);
      c.rect(sx, by1 + 2, 4, 2, k.ramp(0xb02a3a, { light: 0.4 }), 3, F);
      c.vline(sx + 1, by1 + 4, 6, steel, 2.4, F);
    }
  } else {
    // Pawn: the cage counter (bars), guitars on the back wall, a TV glowing.
    for (let i = 0; i < 3; i++) {
      const gx = bx0 + 5 + i * 9;
      c.ellipse(gx + 2, by0 + 15, 3, 3.5, wood, 3, F);
      c.vline(gx + 2, by0 + 4, 9, wood, 2.4, F);
    }
    c.rect(bx1 - 16, by0 + 6, 12, 9, ink, 1.4, F);
    c.rect(bx1 - 15, by0 + 7, 10, 7, k.ramp(0x6ab8e8, { light: 0.35 }), 3.4, F);
    counter(steel, 0.3);
    for (let x = bx0 + 2; x < bx1 - 2; x += 3) c.vline(x, by1 - Math.round(bh * 0.3) - 12, 12, steel, 2.8, F);
  }
  // Glass: a reflection streak (the street lit behind the viewer) — lit, not glowing.
  const refl = k.ramp(0xb8c8d8, { light: 0.35 });
  for (let y = gy0; y <= gy1; y++) {
    const x = Math.round(26 + (gy1 - y) * 0.6);
    for (let j = 0; j < 3; j++) if (hash2(x + j, y, 3) > 0.35) c.set(x + j, y, refl, j === 1 ? 4 : 3);
  }
  // Mullion.
  c.rect(0, gy0, 3, gy1 - gy0 + 1, frame, 3);
  c.vline(0, gy0, gy1 - gy0 + 1, frame, 4);
  c.vline(2, gy0, gy1 - gy0 + 1, frame, 2);
}

// ─── Dark windows ───────────────────────────────────────────────────────────

export type Z1DarkKind = 'bank' | 'closed' | 'lease' | 'cafe' | 'barber' | 'shutter' | 'boarded';

/**
 * A shop window at night with the lights off (wrap along u, one bay): never a
 * black slab — the glass holds the street (a cool sky band, a warm streak of the
 * lamps behind the viewer, rain beads running), and behind it the shapes of the
 * room barely there: venetian blinds, chairs up on the tables, a barber's
 * chair, the bank's teller grille; CLOSED / FOR LEASE cards taped to the glass.
 */
export function z1DarkBay(atlas: PwAtlas, kind: Z1DarkKind, frame: number, riser: number, n = 0): PwTile {
  const h6 = (v: number) => v.toString(16).padStart(6, '0');
  const piece = kind === 'shutter' || kind === 'boarded';
  return atlas.tile(`z1dark|${kind}|${h6(frame)}|${h6(riser)}${piece ? `|${n}` : ''}`, 128, 112, (c, k) => paintDarkBay(c, k, kind, frame, riser, n), { wrap: true });
}

function paintDarkBay(c: PwCanvas, k: PwKit, kind: Z1DarkKind, frameHex: number, riserHex: number, n: number) {
  const W = c.w;
  const H = c.h;
  const F = PWF.GLOW;
  const frame = k.ramp(frameHex, { light: 0.45, sat: 0.5 });
  const riser = k.ramp(riserHex, { light: 0.42, sat: 0.9 });
  const glass = k.ramp(0x1c2232, { light: 0.4, sat: 0.9 });
  const sky = k.ramp(0x3a4668, { light: 0.4 });
  const warm = k.ramp(0x8a6a4a, { light: 0.4 });
  const dim = k.ramp(0x2a2a34, { light: 0.4 });
  const paper = k.ramp(0xd8d4c4, { light: 0.35, sat: 0.4 });
  const ink = k.ramp(0x1a1c22, { light: 0.4 });
  const red = k.ramp(0xb02a2a, { light: 0.45 });
  const steel = k.ramp(0x5a5e66, { light: 0.45, sat: 0.5 });
  const transomH = 14;
  const gy0 = transomH + 1;
  const riserH = 21;
  const gy1 = H - riserH - 3;
  c.rect(0, 0, W, transomH + 1, frame, 2);
  c.hline(0, 0, W, frame, 4);
  c.rect(0, transomH - 3, W, 3, frame, 3);
  c.hline(0, transomH, W, frame, 1);
  c.rect(0, gy1 + 1, W, H - gy1 - 1, riser, 3);
  c.hline(0, gy1 + 1, W, frame, 4);
  for (let x = 6; x < W; x += 32) {
    c.rect(x, gy1 + 7, 24, riserH - 9, riser, 2);
    c.hline(x, gy1 + 7 + riserH - 10, 24, riser, 4);
  }
  // The dark glass: the night sky reflected in its upper part (a band, dithered into the dark below).
  for (let y = gy0; y <= gy1; y++) {
    const v = (y - gy0) / (gy1 - gy0);
    for (let x = 3; x < W; x++) {
      const b = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16;
      if (v < 0.22 || (v < 0.36 && b > (v - 0.22) / 0.14)) c.set(x, y, sky, 1.6, F);
      else c.set(x, y, glass, v > 0.85 ? 1 : 1.6, F);
    }
  }
  // The room's shapes, barely lit (by the street through the glass).
  if (kind === 'bank') {
    // Teller counter with its brass grille, a vault door far back, a CLOSED sign.
    c.rect(3, gy1 - 22, W - 3, 22, dim, 2, F);
    c.hline(3, gy1 - 22, W - 3, steel, 2.6, F);
    for (let x = 6; x < W; x += 4) c.vline(x, gy1 - 44, 22, k.ramp(0x8a7a4a, { light: 0.4 }), 2.2, F);
    c.hline(3, gy1 - 44, W - 3, k.ramp(0x8a7a4a, { light: 0.4 }), 2.8, F);
    c.ellipse(96, gy0 + 22, 9, 9, steel, 1.8, F);
    c.ellipse(96, gy0 + 22, 6, 6, dim, 2.2, F);
    for (let i = 0; i < 4; i++) c.line(96, gy0 + 22, 96 + Math.cos(i * 1.57) * 5, gy0 + 22 + Math.sin(i * 1.57) * 5, steel, 2.6, F);
  } else if (kind === 'closed') {
    // Venetian blinds down to two thirds, the slats catching the street light.
    for (let y = gy0 + 2; y < gy0 + Math.round((gy1 - gy0) * 0.66); y++) c.hline(5, y, W - 8, k.ramp(0x8a8478, { light: 0.4 }), (y - gy0) % 3 === 2 ? 1.2 : 2.6);
    c.vline(30, gy0 + 2, Math.round((gy1 - gy0) * 0.66), steel, 1.6);
  } else if (kind === 'lease') {
    // Empty: a stepladder, a paint can, the floor's shine.
    c.line(40, gy1 - 2, 48, gy1 - 30, steel, 2.2, F);
    c.line(56, gy1 - 2, 48, gy1 - 30, steel, 2.2, F);
    for (let i = 1; i < 5; i++) c.hline(41 + i, gy1 - 2 - i * 6, 14 - i * 2, steel, 2.2, F);
    c.rect(70, gy1 - 6, 6, 6, k.ramp(0x6a7a9a, { light: 0.4 }), 2, F);
    c.hline(3, gy1 - 1, W - 3, sky, 1.4, F);
  } else if (kind === 'cafe') {
    // Chairs upside down on the tables.
    for (let i = 0; i < 3; i++) {
      const x0 = 10 + i * 38;
      c.rect(x0, gy1 - 16, 22, 2, dim, 2.4, F);
      c.vline(x0 + 10, gy1 - 14, 14, dim, 2, F);
      for (const cx of [x0 + 2, x0 + 13]) {
        c.rect(cx, gy1 - 22, 7, 2, dim, 2.2, F);
        c.vline(cx, gy1 - 30, 8, dim, 2, F);
        c.vline(cx + 6, gy1 - 30, 8, dim, 2, F);
      }
    }
  } else if (kind === 'barber') {
    // Barber: two chairs in silhouette, the mirror strip, the pole's stripes faint.
    c.hline(3, gy0 + 16, W - 3, sky, 2.2, F);
    c.rect(3, gy0 + 17, W - 3, 12, k.ramp(0x2a3448, { light: 0.4 }), 1.8, F);
    for (const x0 of [24, 76]) {
      c.rect(x0, gy1 - 26, 16, 12, dim, 2.2, F);
      c.rect(x0 - 2, gy1 - 16, 20, 3, dim, 2.4, F);
      c.vline(x0 + 7, gy1 - 13, 12, steel, 2.2, F);
      c.hline(x0 + 2, gy1 - 1, 12, steel, 2, F);
    }
  }
  // Warm streak of the lamps behind the viewer, rain beads running down the glass.
  for (let y = gy0; y <= gy1; y++) {
    const x = Math.round(18 + (gy1 - y) * 0.55);
    if (hash2(x, y, 5) > 0.3) c.set(x, y, warm, 2.6, F);
    if (hash2(x + 1, y, 6) > 0.5) c.set(x + 1, y, warm, 2, F);
  }
  for (let i = 0; i < 22; i++) {
    const x = 4 + Math.floor(hash2(i, 1, 21) * (W - 6));
    const y0 = gy0 + Math.floor(hash2(i, 2, 21) * (gy1 - gy0 - 8));
    const len = 2 + Math.floor(hash2(i, 3, 21) * 6);
    for (let j = 0; j < len; j++) c.set(x, y0 + j, sky, j === len - 1 ? 3.2 : 2.4, F);
  }
  // Cards taped to the glass (lit by the street, not glowing).
  if (kind === 'closed' || kind === 'bank') {
    c.rect(90, gy1 - 34, 26, 11, paper, 3);
    c.frame(90, gy1 - 34, 26, 11, red, 2.4);
    drawText(c, 'CLOSED', 92, gy1 - 31, FONT_3x5, red, 2.4);
  } else if (kind === 'lease') {
    c.rect(78, gy0 + 20, 34, 18, paper, 3);
    drawText(c, 'FOR', 88, gy0 + 22, FONT_3x5, red, 2.4);
    drawText(c, 'LEASE', 82, gy0 + 29, FONT_3x5, ink, 1);
  } else if (kind === 'shutter') {
    // A roll-down shutter pulled over the upper glass (slats, bottom bar, handles), sprayed over.
    const sh = k.ramp(0x7a7e86, { light: 0.5, sat: 0.6 });
    const rust = k.ramp(0x7a4a2a, { light: 0.4 });
    const sy1 = gy0 + Math.round((gy1 - gy0) * (0.55 + hash2(n, 1, 7) * 0.25));
    for (let y = gy0; y <= sy1; y++) for (let x = 3; x < W; x++) c.set(x, y, sh, (y - gy0) % 4 === 0 ? 2 : (y - gy0) % 4 === 1 ? 3.6 : 3);
    c.rect(3, sy1 + 1, W - 3, 3, sh, 2);
    c.hline(3, sy1 + 1, W - 3, sh, 4);
    for (const hx of [W * 0.3, W * 0.75]) c.rect(Math.round(hx) - 2, sy1 + 2, 5, 1, sh, 0);
    for (let i = 0; i < 5; i++) {
      const x = 6 + Math.floor(hash2(i, n, 9) * (W - 12));
      for (let j = 0; j < 6 + (i % 3) * 3; j++) c.tint(x, sy1 - j, rust, -0.5);
    }
    const { word, o } = z1PieceSpec(n + 11);
    sprayInto(c, k, word, o, 6 + Math.floor(hash2(n, 2, 7) * 20), gy0 + 2);
  } else if (kind === 'boarded') {
    // Plywood over the glass, a torn bill and a sprayed piece.
    const wood = k.ramp(0x6e5440, { light: 0.4, sat: 0.9 });
    const wood2 = k.ramp(0x7a6248, { light: 0.4, sat: 0.9 });
    for (let x = 3, b = 0; x < W; b++) {
      const bw = 30 + Math.floor(hash2(b, n, 3) * 14);
      const r = b % 2 ? wood2 : wood;
      c.rect(x, gy0 - 1, bw - 1, gy1 - gy0 + 2, r, 3);
      c.vline(x, gy0 - 1, gy1 - gy0 + 2, r, 4);
      c.vline(x + bw - 2, gy0 - 1, gy1 - gy0 + 2, r, 2);
      for (let g = 0; g < 5; g++) c.hline(x + 2 + Math.floor(hash2(b, g, 5) * (bw - 10)), gy0 + 3 + Math.floor(hash2(g, b, 6) * (gy1 - gy0 - 6)), 3 + (g % 4), r, 2);
      for (const yy of [gy0 + 3, gy1 - 3]) c.set(x + 3, yy, r, 0);
      x += bw;
    }
    c.rect(14, gy0 + 6, 22, 28, paper, 3);
    c.hline(14, gy0 + 6, 22, paper, 4);
    for (let l = 0; l < 5; l++) c.hline(16, gy0 + 10 + l * 4, 18 - (l % 2) * 6, ink, 2);
    const { word, o } = z1PieceSpec(n + 23);
    sprayInto(c, k, word, o, 40 + Math.floor(hash2(n, 3, 7) * 16), gy0 + 18);
  }
  // Mullion.
  c.rect(0, gy0, 3, gy1 - gy0 + 1, frame, 3);
  c.vline(0, gy0, gy1 - gy0 + 1, frame, 4);
  c.vline(2, gy0, gy1 - gy0 + 1, frame, 2);
}
