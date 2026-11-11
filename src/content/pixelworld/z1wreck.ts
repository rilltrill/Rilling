import type { PwPainter } from './atlas';
import { hash2 } from './surfaces';
import { vnoise } from './elevation';
import { PWF } from './canvas';

/**
 * The burning car on Main Street as a drawn flat (docs/PIXELWORLD3.md): the last thing on the street that still read as stacked
 * prisms, right beside painted walls. A three-quarter view of a burnt-out sedan, nose away to the left, tail toward the road: sagging roof,
 * window holes with the seat frames left in them, torn door skins, wheel arches and rims. The fire effect stays where it is, in front.
 */

/** Texels: 3.7 m across (a car 4.5 m long seen at about 30 degrees), 1.68 m tall, at 50 texels a metre. */
export const BURNT_CAR_W = 185;
export const BURNT_CAR_H = 84;
export const BURNT_CAR_TPM = 50;

/** Piecewise linear through (x, y) pairs. */
const pwl = (pts: readonly (readonly [number, number])[], x: number): number => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x0, y0] = pts[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
};

export const paintBurntCarFlat: PwPainter = (c, k) => {
  const W = BURNT_CAR_W;
  const H = BURNT_CAR_H;
  const char = k.ramp(0x2c2622, { light: 0.32, sat: 0.7, dark: 0.45 });
  const rust = k.ramp(0x7c4626, { light: 0.38, sat: 1.0, dark: 0.45 });
  const ash = k.ramp(0x8a8278, { light: 0.34, sat: 0.5, dark: 0.45 });
  const iron = k.ramp(0x3c3c44, { light: 0.34, sat: 0.6, dark: 0.45 });
  const ember = k.ramp(0xff7a28, { light: 0.5, sat: 1.1 });
  const seed = 411;
  const BELT: readonly (readonly [number, number])[] = [[8, 43], [30, 37], [96, 35], [150, 35], [180, 41]];
  const SILL: readonly (readonly [number, number])[] = [[8, 70], [60, 73], [140, 77], [181, 71]];
  const ROOF: readonly (readonly [number, number])[] = [[46, 14], [58, 9], [78, 12], [96, 15], [118, 11], [132, 14]];
  const FAR: [number, number, number] = [38, 62, 14];
  const NEAR: [number, number, number] = [136, 66, 18];
  // Ground: a ragged ring of ash and what ran out of the engine.
  for (let x = 2; x < W - 2; x++) {
    const reach = 3 + Math.round(vnoise(x, 9, seed) * 4);
    for (let j = 0; j < reach; j++) c.set(x, H - 1 - j, char, 0.5 + (j === reach - 1 && hash2(x, 3, seed) > 0.55 ? 0.6 : 0));
  }
  const belt = (x: number) => Math.round(pwl(BELT, x) + (vnoise(x, 23, seed + 3) - 0.5) * 2);
  const sill = (x: number) => Math.round(pwl(SILL, x) + (vnoise(x, 17, seed + 5) - 0.5) * 2);
  const inCircle = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
  // The side: char, rust and ash in ragged patches, brighter where the fire has scoured the top of the panel.
  for (let x = 8; x < 181; x++) {
    const yT = belt(x);
    const yB = sill(x);
    for (let y = yT; y < yB; y++) {
      if (inCircle(x, y, FAR[0], FAR[1], FAR[2] + 4) || inCircle(x, y, NEAR[0], NEAR[1], NEAR[2] + 4)) continue;
      const u = (y - yT) / Math.max(1, yB - yT);
      const n = hash2(x >> 2, y >> 2, seed + 7);
      const pick = n > 0.56 ? rust : n < 0.16 && u < 0.4 ? ash : char;
      c.set(x, y, pick, 2.6 - u * 1.3 + (hash2(x, y, seed + 9) > 0.82 ? 0.5 : 0));
    }
    // Rim of the belt: what the fire left of the moulding.
    c.set(x, yT, ash, 3.2);
    c.set(x, yT + 1, char, 1.6);
    if (hash2(x >> 1, 7, seed + 11) > 0.7) c.set(x, yT - 1, ember, 3.6, PWF.GLOW);
  }
  // Door seams, skins torn back.
  for (const dx of [72, 110]) {
    for (let y = belt(dx) + 2; y < sill(dx) - 1; y++) {
      c.set(dx, y, char, 0.7);
      c.set(dx + 1, y, ash, 2.2);
    }
  }
  for (let i = 0; i < 10; i++) {
    const hx = 60 + Math.floor(hash2(i, 1, seed + 13) * 110);
    const hy = 42 + Math.floor(hash2(i, 2, seed + 13) * 26);
    const hw = 3 + Math.floor(hash2(i, 3, seed + 13) * 6);
    c.ellipse(hx, hy, hw, 2 + (hw >> 2), char, 0.6);
    c.hline(hx - hw, hy - 2, hw * 2, ash, 3);
  }
  // A skin peeled back from the rear door, its bright edge caught by the fire.
  c.poly([92, 46, 104, 41, 110, 58, 101, 66, 90, 60], rust, 2);
  c.line(92, 46, 104, 41, ember, 3.4, PWF.GLOW);
  c.line(104, 41, 110, 58, rust, 3.4);
  yield0(c, char, seed);
  // Wheel arches and what is left of the wheels.
  for (const [cx, cy, r] of [FAR, NEAR] as const) {
    c.ellipse(cx, cy, r + 4, r + 4, char, 0.55);
    c.ellipse(cx, cy, r, r, char, 0.9);
    c.ellipse(cx, cy, r - 2, r - 2, iron, (u, v) => 2.2 + u * 0.7 - v * 0.5);
    c.ellipse(cx, cy, r - 6, r - 6, char, 1);
    for (let a = 0; a < 6; a++) {
      const t = (a / 6) * Math.PI * 2 + 0.4;
      c.line(cx, cy, cx + Math.cos(t) * (r - 5), cy + Math.sin(t) * (r - 5), iron, 2.9);
    }
    c.ellipse(cx, cy, 2.5, 2.5, rust, 3.2);
  }
  // The cabin: pillars, sagging roof, and the window holes with the frames of the seats still in them.
  const roof = (x: number) => Math.round(pwl(ROOF, x));
  for (let x = 44; x < 152; x++) {
    const yT = roof(Math.min(132, Math.max(46, x)));
    const yB = belt(x);
    for (let y = yT; y < yB; y++) c.set(x, y, char, 0.55 + (hash2(x >> 1, y >> 1, seed + 15) > 0.7 ? 0.5 : 0));
    // Roof skin, thin and buckled.
    for (let j = 0; j < 5; j++) c.set(x, yT - j, j > 3 ? ash : rust, j === 4 ? 3.6 : j === 3 ? 2.4 : 2 - j * 0.2);
    if (hash2(x >> 2, 3, seed + 17) > 0.55) c.set(x, yT - 5, ember, 3.2, PWF.GLOW);
  }
  // Pillars.
  const pillar = (x0: number, y0: number, x1: number, y1: number, tone: number) => {
    for (let i = 0; i < 5; i++) {
      c.line(x0 + i, y0, x1 + i, y1, i < 2 ? ash : rust, i === 0 ? tone + 1 : tone - i * 0.25);
    }
  };
  pillar(44, 36, 58, 12, 2.2);
  pillar(94, 36, 96, 16, 2.4);
  pillar(149, 36, 128, 13, 2.6);
  // Seat frames in the near window.
  for (let i = 0; i < 3; i++) {
    const sx = 104 + i * 12;
    c.rect(sx, 28, 8, 7, rust, 1.6);
    c.frame(sx, 28, 8, 7, iron, 2.6);
    c.line(sx + 2, 28, sx + 3, 18, iron, 2.2);
    c.line(sx + 6, 28, sx + 7, 18, iron, 2.2);
  }
  // Hood at the nose: crumpled, a flap sprung up. Boot lid at the tail, ajar.
  c.poly([10, 42, 26, 37, 46, 36, 44, 30, 22, 26, 10, 34], rust, (x) => 1.8 + (x & 1) * 0.3);
  c.line(10, 34, 22, 26, ash, 3.4);
  c.line(22, 26, 44, 30, ember, 3, PWF.GLOW);
  c.poly([151, 34, 181, 40, 183, 28, 158, 22], rust, (x) => 2 + (x & 1) * 0.2);
  c.line(158, 22, 183, 28, ash, 3.4);
  c.line(151, 34, 158, 22, char, 1);
  // The rear bumper hanging by one bolt.
  c.line(160, 74, 182, 62, iron, 2.6);
  c.line(160, 75, 182, 63, iron, 1.2);
  c.outline(0.5, false);
};

/** A few lumps of ash along the sill (kept out of the side loop so the patches stay readable). */
function yield0(c: Parameters<PwPainter>[0], char: number, seed: number) {
  for (let i = 0; i < 26; i++) {
    const x = 12 + Math.floor(hash2(i, 1, seed + 19) * 160);
    const y = 70 + Math.floor(hash2(i, 2, seed + 19) * 7);
    if (c.at(x, y)) c.set(x, y, char, 2.6);
  }
}
