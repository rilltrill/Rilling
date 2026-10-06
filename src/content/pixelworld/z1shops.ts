import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5 } from './font';
import { hash2 } from './surfaces';

/**
 * MAIN STREET shop bays painted for z1 alone (wrap along u, 128 × 112 = one
 * 4 m bay, like the toolkit's `shopfrontModule`): the coin laundry — a calm
 * night-lit interior instead of a blown-out white box.
 */

/** The coin laundry bay: washers in a row, dryers stacked on the back wall (two of them turning, warm), a folding table, OPEN 24 HRS on the glass. */
export function z1LaundryBay(atlas: PwAtlas): PwTile {
  return atlas.tile('z1shop|laundry', 128, 112, paintLaundry, { wrap: true });
}

function paintLaundry(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const F = PWF.GLOW;
  const frame = k.ramp(0x8a8c90, { light: 0.45, sat: 0.5 });
  const riser = k.ramp(0x2a3a4a, { light: 0.42, sat: 0.9 });
  const wall = k.ramp(0xb8d8d0, { light: 0.45, sat: 0.6 });
  const tube = k.ramp(0xe8fff8, { light: 0.3 });
  const enamel = k.ramp(0xd8dcd8, { light: 0.45, sat: 0.4 });
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
