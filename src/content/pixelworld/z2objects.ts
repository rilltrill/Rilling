import { bayer, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, textWidth } from './font';
import { hash2 } from './surfaces';

/**
 * ST. MERCY HOSPITAL objects that were still flat-coloured boxes / cylinders
 * in PIXEL WORLD, painted over their unchanged geometry:
 *  - `z2FireDoorLeaf`: the hub's red fire doors (wired-glass vision panel,
 *    push bar, kick plate, hinges, FIRE DOOR KEEP SHUT, chips, a smear);
 *  - `z2CylTile`: wrap tiles wrapped ROUND cylinders (u = angle, v = height
 *    from the foot): the canopy pillars, their hazard collars, the bollards,
 *    lamp posts, the gas / oxygen cylinders (destructibles: painted on their
 *    own triangles), the autopsy pedestal;
 *  - `z2CopingTile`: the atrium fountain's stone coping (u round the ring,
 *    v round the tube: chipped top, a waterline stain on the pool side);
 *  - `z2FleshDrape`: flesh spilling over the fountain rim (cut out);
 *  - `z2PlankModule`: boards nailed across the boiler wall's KEEP OUT;
 *  - `z2RubbleTile`: the broken core showing on the boiler wall's blocks.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** Fire door leaf (1.7 × 2.75 m → 54 × 88), hinges on the right as painted (flip for the other face). */
export function z2FireDoorLeaf(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2firedoor|${h6(hex)}`, 54, 88, (c, k) => {
    const rng = k.rng;
    const W = 54;
    const H = 88;
    const d = k.ramp(hex, { light: 0.45, sat: 0.95 });
    const primer = k.ramp(0x8a8a7a, { light: 0.35, sat: 0.4 });
    const steel = k.ramp(0x9aa2a4, { light: 0.55, sat: 0.4 });
    const glass = k.ramp(0x1a2628, { light: 0.5 });
    const wire = k.ramp(0x6a7478, { light: 0.4 });
    const plate = k.ramp(0xe8e6dc, { light: 0.25 });
    const ink = k.ramp(0xb81e14, { light: 0.4 });
    const blood = k.ramp(0x5c0909, { light: 0.45, sat: 1.1 });
    c.rect(0, 0, W, H, d, 3);
    // Edges: lit top / left, dark right / bottom; a pressed stile line round the leaf.
    c.hline(0, 0, W, d, 5);
    c.vline(0, 0, H, d, 4);
    c.vline(W - 1, 0, H, d, 1);
    c.hline(0, H - 1, W, d, 1);
    c.frame(4, 4, W - 8, H - 16, d, 2);
    c.hline(5, 5, W - 10, d, 4);
    // Wired-glass vision panel (upper middle): steel bead, dark glass, diamond wire, a reflection.
    const vx = 18;
    const vy = 12;
    const vw = 16;
    const vh = 26;
    c.rect(vx - 2, vy - 2, vw + 4, vh + 4, steel, 2);
    c.hline(vx - 2, vy - 2, vw + 4, steel, 4);
    c.vline(vx - 2, vy - 2, vh + 4, steel, 4);
    c.rect(vx, vy, vw, vh, glass, 2);
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) if ((x + y) % 5 === 0 || (x - y + 50) % 5 === 0) c.set(vx + x, vy + y, wire, 2);
    for (let j = 0; j < 9; j++) c.set(vx + 3 + j, vy + 14 - j, glass, 4);
    for (let j = 0; j < 5; j++) c.set(vx + 9 + j, vy + 20 - j, glass, 3);
    // FIRE DOOR / KEEP SHUT plate under the glass.
    const py = vy + vh + 5;
    c.rect(15, py, 24, 13, plate, 3);
    c.hline(15, py, 24, plate, 4);
    c.hline(15, py + 12, 24, plate, 1);
    for (const [t, y] of [['FIRE DOOR', py + 1], ['KEEP', py + 7]] as const) {
      const tw = textWidth(t, FONT_3x5, {});
      drawText(c, t, 27 - Math.round(tw / 2), y, FONT_3x5, ink, 3, {});
    }
    // Push bar across at 1 m: brackets at both ends, the bar lit on top.
    const by = H - 34;
    c.rect(6, by, W - 12, 3, steel, 3);
    c.hline(6, by, W - 12, steel, 5);
    c.hline(6, by + 3, W - 12, d, 1);
    for (const x of [6, W - 10]) {
      c.rect(x, by - 2, 4, 7, steel, 2);
      c.hline(x, by - 2, 4, steel, 4);
    }
    // Kick plate (0.3 m), scuffed by boots and trolleys.
    c.rect(2, H - 11, W - 4, 9, steel, 3);
    c.hline(2, H - 11, W - 4, steel, 5);
    c.hline(2, H - 3, W - 4, steel, 1);
    for (let i = 0; i < 9; i++) {
      const x = rng.int(3, W - 8);
      const y = H - rng.int(4, 9);
      c.lineShade(x, y, x + rng.int(2, 6), y + rng.int(-1, 1), -1);
    }
    // Hinges on the right edge.
    for (const y of [8, 42, 74]) {
      c.rect(W - 4, y, 3, 7, steel, 2);
      c.vline(W - 4, y, 7, steel, 4);
      c.set(W - 3, y + 3, steel, 0);
    }
    // Chipped paint (primer showing), worst round the bar and the foot; scuffs.
    for (let i = 0; i < 16; i++) {
      const x = rng.int(2, W - 6);
      const y = rng.chance(0.5) ? rng.int(by - 6, by + 8) : rng.int(H - 20, H - 12);
      c.cluster(x, y, rng.int(0, 9), primer, rng.chance(0.5) ? 3 : 2);
    }
    c.scatter(rng, 3, 8, W - 6, H - 22, 14, 0, -1, { shapes: 4 });
    // A bloody hand dragged across the bar.
    for (let j = 0; j < 12; j++) for (let i = 0; i < 5; i++) if ((i + j) % 5 !== 4 && hash2(i, j, 3) > 0.15) c.set(10 + i + (j >> 2), by - 8 + j, blood, j < 3 ? 4 : 3);
  });
}

export type CylKind = 'pillar' | 'collar' | 'bollard' | 'post' | 'gas' | 'oxygen';

/** Size (w × h texels, wrap) of each cylinder tile: w = once round, h ≥ the height painted. */
export const CYL_SIZE: Record<CylKind, [number, number]> = {
  pillar: [64, 160],
  collar: [48, 32],
  bollard: [32, 32],
  post: [16, 192],
  gas: [48, 48],
  oxygen: [48, 48],
};

/**
 * A tile wrapped round a cylinder: u once round (x), v up from the foot
 * (canvas row h − 1 − vt): lit on the left half of the turn, dark on the right
 * (a round form under the stage lights, painted like the cast's props).
 */
export function z2CylTile(atlas: PwAtlas, kind: CylKind, hex: number): PwTile {
  const [w, h] = CYL_SIZE[kind];
  return atlas.tile(`z2cyl|${kind}|${h6(hex)}`, w, h, (c, k) => paintCyl(c, k, kind, hex), { wrap: true });
}

function paintCyl(c: PwCanvas, k: PwKit, kind: CylKind, hex: number) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const row = (vt: number) => H - 1 - vt;
  // Round shading across the turn: + on the lit quarter, − on the far side.
  const turn = (x: number) => {
    const a = (x / W) * Math.PI * 2;
    return Math.cos(a - 0.6);
  };
  const body = k.ramp(hex, { light: 0.45, sat: 0.95 });
  const shade = (x: number, base: number) => base + (turn(x) > 0.55 ? 1 : turn(x) < -0.5 ? -1 : 0);
  if (kind === 'pillar') {
    // Board-formed concrete: plank joints every 0.3 m, tie holes, grime running down, a spall.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, body, shade(x, 3));
    for (let vt = 10; vt < H; vt += 10) for (let x = 0; x < W; x++) if (hash2(x >> 2, vt, 3) > 0.2) c.shift(x, row(vt), -1);
    for (let i = 0; i < 6; i++) c.set(rng.int(0, W - 1), row(rng.int(20, H - 8)), body, 1);
    for (let i = 0; i < 9; i++) c.streak(rng, rng.int(0, W - 1), row(H - 2), rng.int(30, 110), -1);
    // A chunk spalled off by the crash: rebar showing.
    const sx = 40;
    const sy = row(64);
    for (let y = -5; y <= 5; y++) for (let x = -6; x <= 6; x++) if ((x * x) / 36 + (y * y) / 25 < 1 - hash2(x, y, 9) * 0.3) c.set(sx + x, sy + y, body, y < 0 ? 1 : 2);
    c.hline(sx - 4, sy + 1, 9, k.ramp(0x6a3a22, { light: 0.4 }), 2);
    // Grime at the foot (above the collar), a soot smudge from the burning ambulance.
    c.shade(0, row(40), W, 12, (x, y) => (bayer(x, y) < (y - row(40)) / 12 ? -1 : 0));
    // A flyer pasted on (MISSING), torn.
    const fx = 14;
    const fy = row(60);
    const paper = k.ramp(0xd8d4c4, { light: 0.25 });
    c.rect(fx, fy, 9, 12, paper, 3);
    c.rect(fx + 2, fy + 2, 5, 4, paper, 1);
    for (let j = 0; j < 3; j++) c.hline(fx + 1, fy + 7 + j * 2 - 1, 7, paper, 2);
    c.set(fx + 8, fy + 11, 0, 0);
    c.set(fx + 7, fy + 11, 0, 0);
    return;
  }
  if (kind === 'collar') {
    // Hazard collar: black / yellow diagonal bands, scuffed by bumpers, chipped to the concrete.
    const black = k.ramp(0x1c1c1e, { light: 0.35 });
    const conc = k.ramp(0x7a7870, { light: 0.4 });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const band = Math.floor((x + (H - y)) / 8) % 2 === 0;
        c.set(x, y, band ? body : black, shade(x, band ? 3 : 2));
      }
    }
    c.hline(0, row(28), W, body, 4);
    // Bumper scuffs: dark rubber smears at bumper height, chips showing concrete.
    for (let i = 0; i < 7; i++) {
      const x = rng.int(0, W - 8);
      const y = row(rng.int(10, 18));
      for (let j = 0; j < rng.int(4, 9); j++) c.set(x + j, y + (j % 3 === 0 ? 1 : 0), black, 1);
    }
    for (let i = 0; i < 10; i++) c.cluster(rng.int(0, W - 2), row(rng.int(2, 26)), rng.int(0, 9), conc, 3);
    // Grime splash at the foot.
    for (let x = 0; x < W; x++) for (let vt = 0; vt < 5; vt++) if (bayer(x, vt) < 1 - vt / 5) c.shift(x, row(vt), -1);
    return;
  }
  if (kind === 'bollard') {
    // Yellow steel bollard: a black reflective band near the cap, rust chips, a dent, grime at the foot.
    const black = k.ramp(0x1c1c1e, { light: 0.4 });
    const rust = k.ramp(0x7a3a1c, { light: 0.4 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, body, shade(x, 3));
    for (let x = 0; x < W; x++) {
      c.set(x, row(28), body, shade(x, 4));
      for (let vt = 21; vt < 25; vt++) c.set(x, row(vt), black, (x + vt) % 6 === 0 ? 3 : shade(x, 2));
    }
    for (let i = 0; i < 8; i++) c.cluster(rng.int(0, W - 2), row(rng.int(2, 20)), rng.int(0, 9), rust, 2);
    for (let i = 0; i < 3; i++) c.streak(rng, rng.int(0, W - 1), row(19), rng.int(4, 12), -1);
    c.rect(20, row(14), 4, 3, body, 2);
    for (let x = 0; x < W; x++) for (let vt = 0; vt < 4; vt++) if (bayer(x, vt) < 1 - vt / 4) c.shift(x, row(vt), -1);
    return;
  }
  if (kind === 'post') {
    // Painted steel lamp post: rust bleeding from the joints, a stencilled number, a flyer taped round it.
    const rust = k.ramp(0x7a3a1c, { light: 0.4 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, body, shade(x, 3));
    for (const vt of [6, 64, 128]) {
      c.hline(0, row(vt), W, body, 4);
      c.hline(0, row(vt - 1), W, body, 1);
      for (let i = 0; i < 3; i++) c.streak(rng, rng.int(0, W - 1), row(vt - 2), rng.int(6, 20), -1);
      c.cluster(rng.int(0, W - 3), row(vt - 1), 4, rust, 2);
    }
    const num = k.ramp(0xe8e4d0, { light: 0.3 });
    drawText(c, '27', 3, row(50), FONT_3x5, num, 3, {});
    const paper = k.ramp(0xd8d4c4, { light: 0.25 });
    c.rect(0, row(44), 10, 9, paper, 3);
    c.hline(0, row(40), 10, paper, 1);
    for (let x = 0; x < W; x++) for (let vt = 0; vt < 6; vt++) if (bayer(x, vt) < 1 - vt / 6) c.shift(x, row(vt), -1);
    return;
  }
  // Gas / oxygen cylinders (1.2 m bodies): a vertical highlight stripe, a label band with a
  // stencilled warning, dents, chipped paint, a collar ring under the shoulder.
  const steel = k.ramp(0x8a9094, { light: 0.5, sat: 0.4 });
  const label = k.ramp(kind === 'gas' ? 0xe8d040 : 0xe8e8e0, { light: 0.3 });
  const ink = k.ramp(kind === 'gas' ? 0x1a1a1a : 0x1f6a3c, { light: 0.35 });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = turn(x);
      c.set(x, y, body, t > 0.8 ? 5 : t > 0.45 ? 4 : t < -0.55 ? 2 : 3);
    }
  }
  // Label band at the middle (wraps a third of the way round, on the lit side).
  const ly = row(24);
  for (let y = ly - 5; y <= ly + 5; y++) for (let x = 2; x < 24; x++) c.set(x, y, label, y === ly - 5 ? 4 : y === ly + 5 ? 2 : 3);
  const text = kind === 'gas' ? 'FLAM' : 'O2';
  drawText(c, text, 13 - Math.round(textWidth(text, FONT_3x5, {}) / 2), ly - 2, FONT_3x5, ink, 3, {});
  if (kind === 'gas') {
    // The flame diamond beside the word.
    const red = k.ramp(0xc82a1e, { light: 0.4 });
    for (let j = 0; j < 4; j++) c.hline(27 - j, ly - 3 + j, 1 + j * 2, red, 3);
    for (let j = 0; j < 3; j++) c.hline(25 + j, ly + 1 + j, 5 - j * 2, red, 3);
  }
  // Collar ring under the shoulder, scuffs, dents, chips.
  c.hline(0, row(36), W, steel, 4);
  c.hline(0, row(35), W, steel, 2);
  for (let i = 0; i < 4; i++) {
    const x = rng.int(0, W - 6);
    const y = row(rng.int(4, 32));
    c.ellipseShade(x + 3, y, 3, 2, (d) => (d < 0.5 ? -1 : 0));
  }
  for (let i = 0; i < 12; i++) c.cluster(rng.int(0, W - 2), row(rng.int(1, 34)), rng.int(0, 9), steel, 3);
  for (let x = 0; x < W; x++) for (let vt = 0; vt < 3; vt++) if (bayer(x, vt) < 1 - vt / 3) c.shift(x, row(vt), -1);
}

/** Autopsy pedestal face (0.32 × 0.8 m → 10 × 26): brushed steel, a seam, a drain valve, a rust ring, blood runs. */
export function z2PedestalFace(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z2pedestal|${v}`, 10, 26, (c, k) => {
    const rng = k.rng;
    const st = k.ramp(0x5a6266, { light: 0.55, sat: 0.4 });
    const rust = k.ramp(0x7a3a1c, { light: 0.4 });
    const blood = k.ramp(0x4a0606, { light: 0.4, sat: 1.1 });
    for (let y = 0; y < 26; y++) for (let x = 0; x < 10; x++) c.set(x, y, st, (x * 7 + (y >> 3)) % 5 === 0 ? 4 : 3);
    c.vline(0, 0, 26, st, 4);
    c.vline(9, 0, 26, st, 2);
    c.hline(0, 0, 10, st, 5);
    c.hline(0, 12, 10, st, 1);
    if (v === 0) {
      // Drain valve: a tap with a red handle.
      c.rect(3, 15, 4, 3, st, 1);
      c.rect(4, 14, 2, 1, k.ramp(0xa82a1a, { light: 0.4 }), 3);
      c.set(5, 18, st, 0);
    }
    for (let x = 0; x < 10; x++) {
      c.set(x, 24, rust, 2);
      if (hash2(x, v, 3) > 0.4) c.set(x, 23, rust, 3);
      c.set(x, 25, st, 1);
    }
    for (let i = 0; i < 2 + v; i++) {
      const x = rng.int(1, 8);
      const len = rng.int(5, 14);
      for (let y = 0; y < len; y++) if (!(y > len * 0.6 && bayer(x, y) < 0.5)) c.set(x, y, blood, y < 2 ? 3 : 2);
    }
  });
}

/** Fountain coping (wrap: u round the ring, v once round the tube — 0 the outer side, 16 the top, 32 the pool side). */
export function z2CopingTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2coping|${h6(hex)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const st = k.ramp(hex, { light: 0.45, sat: 0.8 });
    const stain = k.ramp(0x3a2420, { light: 0.4, sat: 0.9 });
    const blood = k.ramp(0x5c0909, { light: 0.45, sat: 1.1 });
    const moss = k.ramp(0x3a4a32, { light: 0.4 });
    const row = (vt: number) => 63 - (vt & 63);
    for (let vt = 0; vt < 64; vt++) {
      // Light round the tube: the top (vt ≈ 16) lit, the pool side and the underside dark.
      const a = (vt / 64) * Math.PI * 2;
      const lit = Math.sin(a);
      const t = lit > 0.7 ? 4 : lit > 0.2 ? 3 : lit > -0.4 ? 2 : 1;
      for (let x = 0; x < 64; x++) c.set(x, row(vt), st, t);
    }
    // Coping stones: joints every 21 texels round the ring, chipped arrises on the top.
    for (const x of [0, 21, 42]) {
      for (let vt = 0; vt < 40; vt++) c.set(x, row(vt), st, 1);
      for (let vt = 0; vt < 40; vt++) if (vt % 9 === 4) c.set(x + 1, row(vt), st, 4);
    }
    for (let i = 0; i < 14; i++) {
      const x = rng.int(0, 63);
      const vt = rng.int(9, 24);
      c.cluster(x, row(vt), rng.int(0, 9), st, rng.chance(0.5) ? 1 : 2);
    }
    // Waterline on the pool side: a dark tide band with a ragged top, blood dried in it.
    for (let x = 0; x < 64; x++) {
      const top = 26 + Math.round(hash2(x >> 1, 1, 5) * 3);
      for (let vt = top; vt < 44; vt++) c.set(x, row(vt), vt < top + 2 ? stain : blood, vt < top + 2 ? 2 : 1);
    }
    // Moss / grime on the outer foot.
    for (let x = 0; x < 64; x++) for (let vt = 56; vt < 64; vt++) if (bayer(x, vt) < 0.5) c.set(x, row(vt), moss, 2);
    for (let x = 0; x < 64; x++) for (let vt = 0; vt < 4; vt++) if (bayer(x, vt) < 0.6 - vt * 0.15) c.set(x, row(vt), moss, 2);
  }, { wrap: true });
}

/** Flesh spilling over the fountain rim (cut out): lobes with a glossy ridge, veins, a drip. 32 × 28. */
export function z2FleshDrape(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z2drape|${v}`, 32, 28, (c, k) => {
    const rng = k.rng;
    const fl = k.ramp(0x7a2a2a, { light: 0.5, sat: 1.05 });
    const dk = k.ramp(0x4a1212, { light: 0.45, sat: 1.05 });
    const vein = k.ramp(0x2a0a14, { light: 0.4 });
    // Lobed hem: a ragged lower edge, longer lobes in the middle.
    const hem = new Int16Array(32);
    for (let x = 0; x < 32; x++) hem[x] = Math.round(10 + Math.sin(x * 0.55 + v * 2) * 4 + Math.sin(x * 1.3 + v) * 2 + (1 - Math.abs(x - 16) / 16) * 9);
    for (let x = 0; x < 32; x++) {
      for (let y = 0; y < hem[x]; y++) {
        const edge = y >= hem[x] - 2;
        c.set(x, y, edge ? dk : fl, edge ? (y === hem[x] - 1 ? 1 : 2) : y < 3 ? 4 : (x + y) % 7 === 0 ? 2 : 3);
      }
    }
    // Glossy ridge along the rim, veins branching down.
    for (let x = 1; x < 31; x++) if (hash2(x, v, 2) > 0.3) c.set(x, 1, fl, 5);
    for (let i = 0; i < 3; i++) {
      let x = rng.int(4, 27);
      for (let y = 2; y < hem[x] - 2; y++) {
        c.set(x, y, vein, 2);
        if (rng.chance(0.3)) x += rng.chance(0.5) ? 1 : -1;
        x = Math.max(1, Math.min(30, x));
      }
    }
    // A drip hanging from the longest lobe.
    const dx = 15 + (v % 3);
    for (let y = hem[dx]; y < Math.min(28, hem[dx] + 5); y++) c.set(dx, y, dk, 2);
    c.outline(0, false);
  });
}

/** A board nailed across the wall (2.4 × 0.28 m → 76 × 9): grain, knots, nail heads, its cast shadow under it. */
export function z2PlankModule(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z2plank|${v}`, 76, 10, (c, k) => {
    const rng = k.rng;
    const wd = k.ramp(v ? 0x8a6a44 : 0x7a5a3a, { light: 0.45, sat: 0.9 });
    const nail = k.ramp(0x9aa0a4, { light: 0.5 });
    for (let y = 0; y < 8; y++) for (let x = 0; x < 76; x++) c.set(x, y, wd, y === 0 ? 4 : y === 7 ? 1 : 3);
    // Grain: long darker streaks, a knot, split ends.
    for (let i = 0; i < 6; i++) {
      const y = rng.int(1, 6);
      const x = rng.int(0, 60);
      c.hline(x, y, rng.int(8, 22), wd, 2);
    }
    c.ellipse(rng.int(20, 56), 4, 2, 1.5, wd, 1);
    c.set(0, 3, 0, 0);
    c.set(0, 4, 0, 0);
    c.set(75, 5, 0, 0);
    for (const x of [3, 72]) {
      c.set(x, 2, nail, 4);
      c.set(x, 5, nail, 4);
      c.set(x + 1, 6, wd, 1);
    }
    // Cast shadow on the wall under the board (dithered: it falls off).
    for (let x = 2; x < 76; x++) {
      const s = k.ramp(0x101010, { light: 0.2 });
      c.set(x, 8, s, 1);
      if (bayer(x, 9) < 0.5) c.set(x, 9, s, 1);
    }
  });
}

/** Broken block core (wrap): the grey aggregate inside a block, voids, a rebar stub, dust. */
export function z2RubbleTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z2rubble', 32, 32, (c, k) => {
    const rng = k.rng;
    const core = k.ramp(0x6a6a62, { light: 0.4, sat: 0.6 });
    const rebar = k.ramp(0x6a3a22, { light: 0.4 });
    c.rect(0, 0, 32, 32, core, 3);
    c.scatter(rng, 0, 0, 32, 32, 60, 0, -1, { shapes: 6 });
    c.scatter(rng, 0, 0, 32, 32, 40, 0, 1, { shapes: 4 });
    for (let i = 0; i < 4; i++) c.ellipse(rng.int(3, 28), rng.int(3, 28), rng.int(1, 3), rng.int(1, 2), core, 0);
    c.hline(4, 20, 12, rebar, 2);
    c.hline(4, 19, 12, rebar, 3);
  }, { wrap: true });
}


/** Dead creeper on the facade (2 × 4 m → 64 × 128, cut out): stems branching up from the foot, dry leaf clumps. */
export function z2VineModule(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z2vine|${v}`, 64, 128, (c, k) => {
    const rng = k.rng;
    const stem = k.ramp(0x3a3226, { light: 0.4, sat: 0.7 });
    const leaf = k.ramp(v ? 0x4a4a2a : 0x3a4a2a, { light: 0.45, sat: 0.8 });
    const grow = (x: number, y: number, a: number, len: number, depth: number) => {
      for (let j = 0; j < len; j++) {
        const xx = Math.round(x);
        const yy = Math.round(y);
        if (xx < 1 || xx > 62 || yy < 1) return;
        c.set(xx, yy, stem, depth ? 2 : 3);
        if (!depth) c.set(xx + 1, yy, stem, 1);
        if (rng.chance(0.12)) {
          // A clump of dry leaves.
          for (let n = 0; n < 4; n++) c.cluster(xx + rng.int(-3, 2), yy + rng.int(-2, 2), rng.int(0, 9), leaf, rng.chance(0.5) ? 3 : 2);
        }
        if (depth < 3 && rng.chance(0.06)) grow(x, y, a + (rng.chance(0.5) ? 0.7 : -0.7), Math.floor(len * 0.5), depth + 1);
        a += rng.spread(0.25);
        a = Math.max(-2.6, Math.min(-0.5, a));
        x += Math.cos(a);
        y += Math.sin(a);
      }
    };
    for (let i = 0; i < 3; i++) grow(16 + i * 14 + rng.int(-4, 4), 127, -1.57 + rng.spread(0.3), 100 + rng.int(0, 30), 0);
    c.outline(1, false);
  });
}

/** What hangs out of a ceiling hole (0.75 × 1.25 m → 24 × 40, cut out): insulation tufts, cables, a broken tile edge. */
export function z2DangleCard(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z2dangle|${v}`, 24, 40, (c, k) => {
    const rng = k.rng;
    const ins = k.ramp(0xc8a860, { light: 0.4, sat: 0.8 });
    const cable = k.ramp(0x2a2a30, { light: 0.4 });
    const tile = k.ramp(0xb8bcb0, { light: 0.4, sat: 0.6 });
    // Cables sagging down in loops.
    for (let i = 0; i < 2 + v; i++) {
      let x = rng.int(3, 20);
      const len = rng.int(18, 38);
      for (let y = 0; y < len; y++) {
        c.set(x, y, cable, y % 7 === 0 ? 3 : 2);
        if (rng.chance(0.25)) x += rng.chance(0.5) ? 1 : -1;
        x = Math.max(1, Math.min(22, x));
      }
      c.rect(x - 1, len, 3, 2, cable, 3);
    }
    // Insulation tufts hanging in clumps.
    for (let i = 0; i < 4; i++) {
      const x = rng.int(2, 18);
      const h = rng.int(6, 16);
      for (let y = 0; y < h; y++) for (let j = 0; j < 4 - (y >> 2); j++) if (!(y > h - 3 && bayer(x + j, y) < 0.5)) c.set(x + j, y, ins, (j + y) % 3 ? 3 : 2);
    }
    // A broken tile hanging by a corner.
    if (v === 1) c.poly([14, 0, 22, 2, 18, 12, 12, 9], tile, 2);
    c.outline(1, false);
  });
}

/**
 * A ceiling vent grate (0.7 m → 22 × 22): a frame and louvre slats 2 texels
 * thick on a 4-texel pitch (the first level keeps them as 1-texel slats, so
 * the grate never pops between slats and a flat panel as the camera nears),
 * dust on the lower edges, a rusted screw.
 */
export function z2VentModule(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2vent|${hex.toString(16)}`, 24, 24, (c, k) => {
    const m = k.ramp(hex, { light: 0.45, sat: 0.5 });
    const dark = k.ramp(0x14181a, { light: 0.3 });
    c.rect(0, 0, 24, 24, m, 3);
    c.hline(0, 0, 24, m, 4);
    c.vline(0, 0, 24, m, 4);
    c.hline(0, 23, 24, m, 1);
    c.vline(23, 0, 24, m, 1);
    for (let y = 4; y < 20; y += 4) {
      c.rect(4, y, 16, 2, dark, 1);
      c.rect(4, y + 2, 16, 2, m, 3);
      c.hline(4, y + 2, 16, m, 4);
    }
    c.set(2, 2, k.ramp(0x7a3a1c, { light: 0.4 }), 2);
    c.set(21, 21, m, 2);
  });
}
