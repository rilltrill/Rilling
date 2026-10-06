import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD, textWidth } from './font';
import { hash2 } from './surfaces';

/**
 * ST. MERCY HOSPITAL vehicles for PIXEL WORLD: the ambulances and the car
 * park's cars keep their boxes (they are big, the light and the rail sweep
 * across them) but every face that sells them is a painted module — panel
 * seams, the red stripe, AMBULANCE lettering and the star of life, wheel
 * arches, door handles, glass with reflections, grilles and lamps, road
 * grime, rust and blood. 32 texels a metre.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const G = PWF.GLOW;

/** Star of life (blue, white-edged), centred at (cx, cy), `r` texels. */
function starOfLife(c: PwCanvas, k: PwKit, cx: number, cy: number, r: number) {
  const blue = k.ramp(0x2a5ab8, { light: 0.45, sat: 1.05 });
  const white = k.ramp(0xf0f0ea, { light: 0.25 });
  const arm = (a: number, ramp: number, grow: number) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let t = -r - grow; t <= r + grow; t++) for (let s = -2 - grow; s <= 2 + grow; s++) c.set(Math.round(cx + ca * t - sa * s), Math.round(cy + sa * t + ca * s), ramp, 3);
  };
  for (const a of [Math.PI / 2, Math.PI / 6, -Math.PI / 6]) arm(a, white, 1);
  for (const a of [Math.PI / 2, Math.PI / 6, -Math.PI / 6]) arm(a, blue, 0);
  // Rod and serpent.
  c.vline(cx, cy - r + 1, r * 2 - 1, white, 4);
  for (let t = -r + 2; t < r - 1; t += 2) c.set(cx + (t % 4 === 0 ? 1 : -1), cy + t, white, 3);
}

/** Road grime + rust along a panel's foot, a few dents. */
function grime(c: PwCanvas, k: PwKit, ramp: number, y0: number) {
  const rng = k.rng;
  for (let x = 0; x < c.w; x++) {
    const h = 3 + Math.round(hash2(x >> 2, 1, 3) * 5);
    for (let y = c.h - h; y < c.h; y++) if (c.at(x, y) && y >= y0) c.shift(x, y, -1, ramp);
  }
  for (let i = 0; i < 5; i++) {
    const x = rng.int(2, c.w - 4);
    const y = rng.int(y0, c.h - 3);
    c.cluster(x, y, rng.int(4, 9), 0, -1);
    c.shift(x - 1, y - 1, 1);
  }
}

/**
 * Ambulance box side (4.0 × 2.3 m → 128 × 74): white panels with seams and
 * rivets, the red stripe band, AMBULANCE in red caps, the star of life, a
 * wheel-arch shadow over the rear wheel (`rearLeft`: the rear is at u = 0),
 * grime, a bloody hand smear.
 */
export function ambulanceSide(atlas: PwAtlas, rearLeft: boolean): PwTile {
  return atlas.tile(`z2ambSide|${rearLeft ? 'l' : 'r'}`, 128, 74, (c, k) => {
    const white = k.ramp(0xd8dcd6, { light: 0.4, sat: 0.6 });
    const red = k.ramp(0xc42020, { light: 0.45, sat: 1.05 });
    const blood = k.ramp(0x6a0c0c, { light: 0.45, sat: 1.1 });
    const W = 128;
    const H = 74;
    c.rect(0, 0, W, H, white, 3);
    c.hline(0, 0, W, white, 5);
    c.hline(0, 1, W, white, 4);
    // Panel seams + rivet lines.
    for (const x of [32, 64, 96]) {
      c.vline(x, 2, H - 2, white, 1);
      c.vline(x + 1, 2, H - 2, white, 4);
      for (let y = 6; y < H - 6; y += 8) c.set(x + 3, y, white, 2);
    }
    // Stripe band (body y 1.11…1.39 → 0.66…0.94 m above the box bottom).
    const sy = H - 1 - 30;
    c.rect(0, sy, W, 9, red, 3);
    c.hline(0, sy, W, red, 4);
    c.hline(0, sy + 8, W, red, 1);
    // Lettering above the stripe, the star of life toward the cab.
    const text = 'AMBULANCE';
    const tw = textWidth(text, FONT_BOLD);
    drawText(c, text, rearLeft ? 14 : W - 14 - tw, sy - 11, FONT_BOLD, red, 3, { shadow: { ramp: white, tone: 1 } });
    starOfLife(c, k, rearLeft ? W - 26 : 26, 20, 10);
    // Wheel arch over the rear wheel (0.95 m from the back).
    const ax = rearLeft ? 30 : W - 30;
    for (let y = H - 10; y < H; y++) for (let x = ax - 15; x <= ax + 15; x++) {
      const d = Math.hypot(x - ax, (y - H) * 1.2);
      if (d < 13) c.set(x, y, k.ramp(0x101214, { light: 0.3 }), 1);
      else if (d < 15) c.set(x, y, white, 2);
    }
    grime(c, k, white, H - 14);
    // A bloody hand smear by the rear door.
    const bx = rearLeft ? 6 : W - 18;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 5; j++) if ((i + j) % 3 !== 2) c.set(bx + i, 34 + j + (i >> 2), blood, j === 0 ? 4 : 3);
  });
}

/** Ambulance rear door (1.1 × 2.2 m → 35 × 70): white, the stripe, a dark window with a reflection, handle, hinges. */
export function ambulanceDoor(atlas: PwAtlas): PwTile {
  return atlas.tile('z2ambDoor', 35, 70, (c, k) => {
    const white = k.ramp(0xd8dcd6, { light: 0.4, sat: 0.6 });
    const red = k.ramp(0xc42020, { light: 0.45, sat: 1.05 });
    const glass = k.ramp(0x1a2a34, { light: 0.5 });
    const blk = k.ramp(0x1c1e1e, { light: 0.4 });
    c.rect(0, 0, 35, 70, white, 3);
    c.frame(0, 0, 35, 70, white, 2);
    c.hline(0, 0, 35, white, 5);
    // Stripe (door y 0.62…0.88 m → rows from the bottom 20…28).
    c.rect(0, 70 - 28, 35, 8, red, 3);
    c.hline(0, 70 - 28, 35, red, 4);
    // Window (door y 1.35…1.95 m) with a diagonal reflection and wire mesh.
    c.rect(6, 70 - 62, 23, 19, glass, 2);
    c.frame(5, 70 - 63, 25, 21, blk, 2);
    for (let i = 0; i < 9; i++) c.set(10 + i, 70 - 47 - i, glass, 4);
    c.line(12, 70 - 46, 22, 70 - 56, glass, 3);
    // Handle, hinges, grime.
    c.rect(28, 70 - 38, 4, 2, blk, 3);
    for (const y of [8, 60]) c.rect(1, y, 3, 4, blk, 2);
    grime(c, k, white, 58);
    starOfLife(c, k, 17, 70 - 12, 5);
  });
}

/** Ambulance cab front (2.2 × 1.35 m → 70 × 43): grille, headlamp housings, mirrored ECNALUBMA, bumper shadow. */
export function ambulanceFront(atlas: PwAtlas): PwTile {
  return atlas.tile('z2ambFront', 70, 43, (c, k) => {
    const white = k.ramp(0xd8dcd6, { light: 0.4, sat: 0.6 });
    const red = k.ramp(0xc42020, { light: 0.45, sat: 1.05 });
    const chrome = k.ramp(0xa8b0b4, { light: 0.55 });
    const blk = k.ramp(0x16191b, { light: 0.4 });
    c.rect(0, 0, 70, 43, white, 3);
    c.hline(0, 0, 70, white, 5);
    // Mirrored lettering across the top of the nose.
    const t = 'AMBULANCE';
    const tw = textWidth(t, FONT_3x5);
    drawText(c, t, (70 - tw) >> 1, 3, FONT_3x5, red, 3);
    for (let y = 3; y < 8; y++) {
      for (let x = 0; x < (tw >> 1); x++) {
        const a = ((70 - tw) >> 1) + x;
        const b = ((70 - tw) >> 1) + tw - 1 - x;
        const ia = y * 70 + a;
        const ib = y * 70 + b;
        const ra = c.ramp[ia];
        const ta = c.tone[ia];
        c.ramp[ia] = c.ramp[ib];
        c.tone[ia] = c.tone[ib];
        c.ramp[ib] = ra;
        c.tone[ib] = ta;
      }
    }
    // Grille: horizontal chrome slats, a badge.
    c.rect(14, 15, 42, 13, blk, 1);
    for (let y = 16; y < 27; y += 3) c.hline(15, y, 40, chrome, 3);
    c.rect(32, 19, 6, 5, chrome, 4);
    // Headlamp housings (the lamps themselves glow in front).
    for (const x of [4, 52]) {
      c.rect(x, 14, 14, 11, chrome, 2);
      c.rect(x + 2, 16, 10, 7, k.ramp(0xfff2c8, { light: 0.4 }), 3, G);
    }
    // Stripe + bumper shadow.
    c.rect(0, 30, 70, 5, red, 3);
    c.rect(0, 38, 70, 5, blk, 1);
    grime(c, k, white, 34);
  });
}

/** Ambulance cab side (1.9 × 1.35 m → 61 × 43): door seam, handle, the stripe, ST MERCY under the window. */
export function ambulanceCabSide(atlas: PwAtlas, frontLeft: boolean): PwTile {
  return atlas.tile(`z2ambCab|${frontLeft ? 'l' : 'r'}`, 61, 43, (c, k) => {
    const white = k.ramp(0xd8dcd6, { light: 0.4, sat: 0.6 });
    const red = k.ramp(0xc42020, { light: 0.45, sat: 1.05 });
    const blk = k.ramp(0x16191b, { light: 0.4 });
    c.rect(0, 0, 61, 43, white, 3);
    c.hline(0, 0, 61, white, 5);
    const dx = frontLeft ? 22 : 8;
    c.frame(dx, 1, 30, 40, white, 1);
    c.rect(frontLeft ? dx + 3 : dx + 24, 12, 4, 2, blk, 3);
    c.rect(0, 43 - 26, 61, 7, red, 3);
    c.hline(0, 43 - 26, 61, red, 4);
    drawText(c, 'ST MERCY', dx + 3, 4, FONT_3x5, red, 3);
    // Front wheel arch.
    const ax = frontLeft ? 9 : 52;
    for (let y = 33; y < 43; y++) for (let x = ax - 13; x <= ax + 13; x++) {
      const d = Math.hypot(x - ax, (y - 43) * 1.2);
      if (d < 11) c.set(x, y, k.ramp(0x101214, { light: 0.3 }), 1);
      else if (d < 13) c.set(x, y, white, 2);
    }
    grime(c, k, white, 30);
  });
}

/** Car body side (4.3 × 0.7 m → 138 × 22): two door seams, handles, a trim line, wheel arches, rust, dents. Per colour. */
export function carSide(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2carSide|${h6(hex)}`, 138, 22, (c, k) => {
    const p = k.ramp(hex, { light: 0.5, sat: 1 });
    const chrome = k.ramp(0xa8b0b4, { light: 0.55 });
    const blk = k.ramp(0x101214, { light: 0.3 });
    const rust = k.ramp(0x7a4024, { light: 0.4 });
    c.rect(0, 0, 138, 22, p, 3);
    c.hline(0, 0, 138, p, 5);
    c.hline(0, 1, 138, p, 4);
    c.hline(0, 9, 138, chrome, 4);
    for (const x of [46, 82]) {
      c.vline(x, 1, 18, p, 1);
      c.vline(x + 1, 1, 18, p, 4);
    }
    for (const x of [52, 88]) c.rect(x, 5, 4, 1, chrome, 4);
    // Wheel arches (wheels at ±1.35 m from the middle → 26 and 112).
    for (const ax of [26, 112]) {
      for (let y = 10; y < 22; y++) for (let x = ax - 14; x <= ax + 14; x++) {
        const d = Math.hypot(x - ax, (y - 22) * 1.1);
        if (d < 12) c.set(x, y, blk, 1);
        else if (d < 13.5) c.set(x, y, p, 1);
      }
    }
    // Rust bubbling along the sills, dents.
    for (let i = 0; i < 14; i++) c.cluster(k.rng.int(30, 100), k.rng.int(15, 20), k.rng.int(0, 9), rust, 3);
    for (let i = 0; i < 3; i++) {
      const x = k.rng.int(10, 128);
      c.ellipseShade(x, 6, 4, 2, (d) => (d < 0.5 ? -1 : d < 0.8 ? 1 : 0));
    }
    c.shade(0, 18, 138, 4, -1, p);
  });
}

/** Car cabin side (2.2 × 0.6 m → 70 × 19): dark glass with the lot lights reflected, a B pillar, chrome trim. Per colour. */
export function carCabin(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2carCab|${h6(hex)}`, 70, 19, (c, k) => {
    const p = k.ramp(hex, { light: 0.5, sat: 1 });
    const glass = k.ramp(0x18222c, { light: 0.55, sat: 0.8 });
    const chrome = k.ramp(0xa8b0b4, { light: 0.55 });
    c.rect(0, 0, 70, 19, p, 3);
    c.hline(0, 0, 70, p, 4);
    c.poly([5, 17, 10, 3, 33, 3, 33, 17], glass, 2);
    c.poly([37, 17, 37, 3, 60, 3, 66, 17], glass, 2);
    // Reflections: a pale diagonal and a lamp spot.
    for (let i = 0; i < 6; i++) c.set(16 + i, 14 - i * 2, glass, 4);
    c.set(48, 7, k.ramp(0xffd9a0, { light: 0.4 }), 4, G);
    c.hline(4, 18, 63, chrome, 4);
  });
}

/** Car nose or tail (1.8 × 0.7 m → 58 × 22): grille + headlamps (one smashed) / tail lamps + plate. Per colour. */
export function carEnd(atlas: PwAtlas, hex: number, front: boolean): PwTile {
  return atlas.tile(`z2carEnd|${h6(hex)}|${front ? 'f' : 'r'}`, 58, 22, (c, k) => {
    const p = k.ramp(hex, { light: 0.5, sat: 1 });
    const chrome = k.ramp(0xa8b0b4, { light: 0.55 });
    const blk = k.ramp(0x101214, { light: 0.3 });
    const plate = k.ramp(0xe0d8b0, { light: 0.3 });
    c.rect(0, 0, 58, 22, p, 3);
    c.hline(0, 0, 58, p, 5);
    if (front) {
      c.rect(16, 5, 26, 8, blk, 1);
      for (let y = 6; y < 13; y += 2) c.hline(17, y, 24, chrome, 3);
      c.rect(3, 5, 10, 6, chrome, 4);
      c.rect(45, 5, 10, 6, chrome, 2);
      c.rect(46, 6, 8, 4, blk, 1);
      c.line(46, 6, 52, 10, chrome, 5);
    } else {
      const red = k.ramp(0x8a1a14, { light: 0.45 });
      c.rect(3, 5, 11, 6, red, 3);
      c.rect(44, 5, 11, 6, red, 3);
      c.hline(3, 5, 11, red, 4);
      c.hline(44, 5, 11, red, 4);
    }
    c.rect(22, 14, 14, 5, plate, 3);
    drawText(c, front ? 'MRC' : '7GX', 23, 14, FONT_3x5, k.ramp(0x2a3a8a, { light: 0.4 }), 2);
    c.rect(0, 19, 58, 3, chrome, front ? 3 : 2);
    c.hline(0, 19, 58, chrome, 4);
  });
}
