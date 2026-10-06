import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD, FONT_5x7, textWidth } from './font';
import { hash2, smooth } from './surfaces';

/**
 * The overturned school bus in ART: PIXEL WORLD. It lies on its side with its
 * roof to the street, so the roof is the face that matters: chrome-yellow
 * sheet with transverse ribs and rivet rows, the two escape hatches, SCHOOL
 * BUS in black, the scrapes of the slide, dents, bullet holes, rust, and the
 * engine fire's soot creeping back from the crushed nose. Plus the ends (the
 * windscreen and grille, the emergency door) and the windowed sides.
 * Canvas row 0 is the face's "up" as the bus lies (its local +X).
 */

const YEL = 0xd29a16;

export interface Z1BusTiles {
  roof: PwTile;
  side: PwTile;
  front: PwTile;
  nose: PwTile;
  rear: PwTile;
  door: PwTile;
  yellow: PwTile;
}

export function z1BusTiles(a: PwAtlas): Z1BusTiles {
  return {
    roof: a.tile('z1bus|roof', 308, 80, paintRoof),
    side: a.tile('z1bus|side', 308, 68, paintSide),
    front: a.tile('z1bus|front', 80, 68, paintFront),
    nose: a.tile('z1bus|nose', 74, 32, paintNose),
    rear: a.tile('z1bus|rear', 80, 68, paintRear),
    door: a.tile('z1bus|door', 61, 61, paintDoor),
    yellow: a.tile('z1bus|yellow', 32, 32, (c, k) => {
      const y = k.ramp(YEL, { light: 0.5, sat: 1 });
      c.rect(0, 0, c.w, c.h, y, 3);
      for (let i = 0; i < 6; i++) c.cluster(k.rng.int(0, 30), k.rng.int(0, 30), k.rng.int(0, 4), 0, -1);
    }, { wrap: true }),
  };
}

/** Soot creeping back from the burning end (x1): blotches that thicken toward it, blistered paint at their edge. */
function soot(c: PwCanvas, k: PwKit, x0: number, x1: number) {
  const s = k.ramp(0x1a1614, { light: 0.4 });
  const rust = k.ramp(0x7a3a1c, { light: 0.4 });
  const W = x1 - x0;
  for (let y = 0; y < c.h; y++) {
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / W;
      const n = smooth(x, y, 64, 64, 6, 41) * 0.8 + hash2(x >> 1, y >> 1, 42) * 0.2;
      if (n < t * 1.05 - 0.15) c.tint(x, y, s, t > 0.7 ? -1 : 0);
      else if (n < t * 1.05 - 0.05) c.tint(x, y, rust, 0);
    }
  }
}

function paintRoof(c: PwCanvas, k: PwKit) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const y = k.ramp(YEL, { light: 0.5, sat: 1 });
  const ink = k.ramp(0x141414, { light: 0.4 });
  const steel = k.ramp(0xb8b4a8, { light: 0.5, sat: 0.5 });
  const rust = k.ramp(0x7a3a1c, { light: 0.4 });
  const blood = k.ramp(0x5a0808, { light: 0.4 });
  const red = k.ramp(0xc82818, { light: 0.5 });
  c.rect(0, 0, W, H, y, 3);
  // Rolled edges (top / bottom rows), transverse ribs with rivet rows.
  c.hline(0, 0, W, y, 2);
  c.hline(0, 1, W, y, 5);
  c.hline(0, H - 2, W, y, 2);
  c.hline(0, H - 1, W, y, 1);
  for (let x = 6; x < W; x += 19) {
    c.vline(x, 2, H - 4, y, 4);
    c.vline(x + 1, 2, H - 4, y, 2);
    for (let r = 4; r < H - 4; r += 5) c.set(x + 3, r, y, 5);
  }
  // Escape hatches (rear ≈ u 38, front ≈ u 261): frame, grille, latch.
  for (const hx of [38, 261]) {
    const x0 = hx - 15;
    const y0 = (H >> 1) - 15;
    c.rect(x0, y0, 30, 30, steel, 3);
    c.frame(x0, y0, 30, 30, steel, 1);
    c.hline(x0, y0, 30, steel, 5);
    for (let yy = y0 + 4; yy < y0 + 26; yy += 3) c.hline(x0 + 4, yy, 22, steel, 1);
    c.rect(x0 + 12, y0 + 26, 6, 3, red, 3);
  }
  // SCHOOL BUS, black, a little worn.
  const txt = 'SCHOOL BUS';
  const tw = textWidth(txt, FONT_BOLD, { scale: 2 });
  drawText(c, txt, ((W - tw) >> 1) + 2, (H >> 1) - 7, FONT_BOLD, ink, 2, { scale: 2 });
  drawText(c, 'MILLBROOK SCHOOL DIST 7', (W >> 1) - 50, H - 12, FONT_3x5, ink, 2);
  // Scrapes from the slide: long lit scratches (bare metal), a few dents (dark crease, lit lip).
  for (let i = 0; i < 14; i++) {
    const x0 = rng.int(0, W - 60);
    const yy = rng.int(4, H - 6);
    const len = rng.int(20, 70);
    for (let j = 0; j < len; j++) if (hash2(x0 + j, yy, 7) > 0.15) c.set(x0 + j, yy + (j > len / 2 && i % 3 === 0 ? 1 : 0), steel, 4);
  }
  for (let i = 0; i < 5; i++) {
    const cx = rng.int(20, W - 20);
    const cy = rng.int(10, H - 10);
    c.ellipseShade(cx, cy, rng.int(5, 9), rng.int(3, 5), (d) => (d < 0.5 ? -1 : d < 0.8 ? 0 : 1));
  }
  // Bullet holes: dark pit, bright torn rim.
  for (let i = 0; i < 9; i++) {
    const hx = rng.int(60, W - 60);
    const hy = rng.int(6, H - 8);
    c.set(hx, hy, ink, 0);
    c.set(hx + 1, hy, ink, 1);
    c.set(hx - 1, hy - 1, steel, 5);
  }
  // Rust blooms along the rolled edges, a bloody hand smear by the rear hatch.
  for (let i = 0; i < 22; i++) c.cluster(rng.int(0, W - 3), rng.chance(0.5) ? rng.int(1, 4) : rng.int(H - 6, H - 3), rng.int(0, 6), rust, 2);
  for (let j = 0; j < 4; j++) c.line(56 + j * 2, 18, 62 + j * 3, 36, blood, 2);
  // The crashed nose end (right): soot from the engine fire.
  soot(c, k, W - 70, W);
}

function paintSide(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const y = k.ramp(YEL, { light: 0.5, sat: 1 });
  const ink = k.ramp(0x161618, { light: 0.4 });
  const glass = k.ramp(0x1e2638, { light: 0.4 });
  const sky = k.ramp(0x5a6a94, { light: 0.35 });
  c.rect(0, 0, W, H, y, 3);
  c.hline(0, 0, W, y, 5);
  // Windows (rows 6–30) every 36.8 texels from u 25.6.
  for (let i = 0; i < 8; i++) {
    const cx = Math.round(25.6 + 36.8 * i);
    c.rect(cx - 16, 5, 32, 27, ink, 1);
    const broken = i === 2 || i === 6;
    for (let yy = 7; yy < 30; yy++) {
      for (let xx = cx - 14; xx < cx + 14; xx++) {
        if (broken && Math.hypot(xx - cx, yy - 18) < 7 + hash2(xx, yy, 3) * 3) {
          c.set(xx, yy, ink, 0);
          continue;
        }
        const d = (xx - yy + 400) % 22;
        c.set(xx, yy, d < 3 ? sky : glass, d < 3 ? 3 : 2);
      }
    }
    c.hline(cx - 14, 18, 28, ink, 1);
  }
  // Rub rails (black), the district lettering between them.
  c.rect(0, 39, W, 6, ink, 2);
  c.hline(0, 39, W, ink, 4);
  c.rect(0, 56, W, 4, ink, 2);
  drawText(c, 'MILLBROOK SCHOOL DIST 7', 60, 47, FONT_5x7, ink, 1);
  soot(c, k, W - 60, W);
  void PWF;
}

function paintFront(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const y = k.ramp(YEL, { light: 0.5, sat: 1 });
  const ink = k.ramp(0x161618, { light: 0.4 });
  const glass = k.ramp(0x1e2638, { light: 0.4 });
  const sky = k.ramp(0x5a6a94, { light: 0.35 });
  c.rect(0, 0, W, H, y, 3);
  // Destination sign, the split windscreen (cracked), the lamps.
  c.rect(20, 2, 40, 8, ink, 1);
  drawText(c, 'SCHOOL', 22, 3, FONT_5x7, y, 4);
  c.rect(4, 14, W - 8, 28, ink, 1);
  for (let yy = 16; yy < 40; yy++) for (let xx = 6; xx < W - 6; xx++) {
    if (xx === W >> 1) continue;
    const d = (xx - yy * 1.2 + 200) % 30;
    c.set(xx, yy, d < 3 ? sky : glass, d < 3 ? 3 : 2);
  }
  for (let r = 0; r < 7; r++) {
    const a = (r / 7) * Math.PI * 2;
    for (let j = 1; j < 10; j++) c.set(Math.round(22 + Math.cos(a) * j), Math.round(26 + Math.sin(a) * j * 0.7), sky, 4);
  }
  soot(c, k, 0, W);
}

function paintNose(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const y = k.ramp(YEL, { light: 0.5, sat: 1 });
  const ink = k.ramp(0x161618, { light: 0.4 });
  const chrome = k.ramp(0xa8acb4, { light: 0.6, sat: 0.4 });
  const lamp = k.ramp(0xd8d4c0, { light: 0.5 });
  c.rect(0, 0, W, H, y, 3);
  // Crumpled grille, round headlamps (one smashed), the soot.
  c.rect(20, 6, 34, 20, ink, 1);
  for (let yy = 8; yy < 24; yy += 3) c.hline(22, yy, 30, chrome, yy % 2 ? 2 : 3);
  for (const [hx, ok] of [[10, true], [W - 11, false]] as const) {
    c.ellipse(hx, 14, 6, 6, chrome, 3);
    c.ellipse(hx, 14, 4.5, 4.5, ok ? lamp : ink, ok ? 3 : 0);
  }
  for (let i = 0; i < 4; i++) c.line(20 + i * 9, 6, 24 + i * 9, 26, y, 1);
  soot(c, k, 0, W);
}

function paintRear(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const y = k.ramp(YEL, { light: 0.5, sat: 1 });
  const ink = k.ramp(0x161618, { light: 0.4 });
  const dark = k.ramp(0x0e0e12, { light: 0.4 });
  const red = k.ramp(0x8a1a12, { light: 0.5 });
  c.rect(0, 0, W, H, y, 3);
  // The emergency door's opening (dark interior once it's blown off), lettering over it, tail lamps.
  c.rect(9, 6, 62, 62, ink, 1);
  c.rect(11, 8, 58, 60, dark, 1);
  drawText(c, 'EMERGENCY DOOR', 12, 1, FONT_3x5, ink, 1);
  for (const lx of [2, W - 7]) {
    c.rect(lx, 12, 5, 8, red, 3);
    c.rect(lx, 24, 5, 8, red, 2);
  }
}

function paintDoor(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const y = k.ramp(YEL, { light: 0.5, sat: 1 });
  const ink = k.ramp(0x161618, { light: 0.4 });
  const glass = k.ramp(0x1e2638, { light: 0.4 });
  const sky = k.ramp(0x5a6a94, { light: 0.35 });
  const chrome = k.ramp(0xa8acb4, { light: 0.6, sat: 0.4 });
  c.rect(0, 0, W, H, y, 3);
  c.frame(0, 0, W, H, y, 2);
  c.hline(0, 0, W, y, 5);
  // Window (top), the handle bar, EMERGENCY EXIT.
  c.rect(9, 4, 43, 24, ink, 1);
  for (let yy = 6; yy < 26; yy++) for (let xx = 11; xx < 50; xx++) {
    const d = (xx - yy + 100) % 18;
    c.set(xx, yy, d < 3 ? sky : glass, d < 3 ? 3 : 2);
  }
  c.rect(12, 40, 37, 4, ink, 2);
  c.rect(14, 41, 33, 2, chrome, 4);
  const tw = textWidth('EMERGENCY', FONT_3x5);
  drawText(c, 'EMERGENCY', (W - tw) >> 1, 31, FONT_3x5, ink, 1);
  drawText(c, 'EXIT', (W - 15) >> 1, 48, FONT_3x5, ink, 1);
  c.scatter(k.rng, 2, 2, W - 4, H - 4, 10, 0, -1, { shapes: 4 });
}
