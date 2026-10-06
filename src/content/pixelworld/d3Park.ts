import { bayer, PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD, textWidth } from './font';
import { crack, hash2, smooth } from './surfaces';
import { d1Emblem } from './d1Tiles';

/**
 * TYRANT CHASE (d3) park hardware for ART: PIXEL WORLD: the T-rex paddock's
 * board-formed concrete pylons (lift lines, tie holes, rust bleeding from the
 * insulators, a hazard band, moss at the foot), its high-voltage wire spans
 * (cut-out, sagging, one vined, one with a torn warning tape), the dangling
 * live cables, the big DANGER / HIGH VOLTAGE boards; the park's lamp posts
 * (flaking green paint), wooden direction boards with painted arrows, the
 * roadblock's sawhorse boards and fuel drums.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** Board-formed concrete (wrap 32 × 64 = 1 × 2 m): lift lines every 0.5 m, tie holes, chips, water stains. */
export function d3ConcreteTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3concrete|${h6(o.hex)}`, 32, 64, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.4, sat: 0.8 });
    // Board marks: each 4-texel board a slightly different tone (the formwork's grain), lift lines.
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 32; x++) {
        const board = (y >> 2) & 3;
        let t = board === 1 ? 3.3 : board === 3 ? 2.8 : 3;
        if (y % 16 === 0) t = 1.6;
        else if (y % 16 === 1) t = 3.8;
        if (hash2(x >> 2, y, 3) > 0.93) t -= 0.6;
        c.set(x, y, s, t);
      }
    }
    // Tie holes: dark sockets with a lit lower-right lip.
    for (let y = 8; y < 64; y += 16) {
      for (const x of [7, 23]) {
        c.set(x, y, s, 0.6);
        c.set(x + 1, y, s, 1);
        c.set(x, y + 1, s, 1);
        c.set(x + 1, y + 1, s, 4);
      }
    }
    // Chips and pores.
    for (let i = 0; i < 26; i++) c.cluster(rng.int(0, 31), rng.int(0, 63), i, 0, i % 3 ? -0.8 : 0.8);
    // Water stains: streaks running down.
    for (let i = 0; i < 5; i++) c.streak(rng, rng.int(0, 31), rng.int(0, 63), rng.int(10, 30), -0.7, 0, rng.int(1, 2));
  }, { wrap: true });
}

/**
 * A paddock pylon face (module 29 × 304 = 0.9 × 9.5 m): board-formed concrete,
 * a yellow / black hazard band at the foot (0.6–1.4 m), rust bleeding down from
 * each insulator arm, a stencilled HV bolt sign and number, cracks, moss and
 * splash-back at the foot. `variant` 1 is weathered harder.
 */
export function d3PylonFaceModule(atlas: PwAtlas, o: { hex: number; rust: number; moss: number }, variant: number): PwTile {
  const W = 29;
  const H = 304;
  return atlas.tile(`d3pylon|${h6(o.hex)}|${variant}`, W, H, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.4, sat: 0.8 });
    const rust = k.ramp(o.rust, { light: 0.4 });
    const moss = k.ramp(o.moss, { light: 0.45 });
    const yl = k.ramp(0xe0b020, { light: 0.45, sat: 1.05 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    const Y = (m: number) => Math.round(H - m * 32);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const board = (y >> 2) & 3;
        let t = board === 1 ? 3.3 : board === 3 ? 2.8 : 3;
        if (y % 16 === 0) t = 1.6;
        else if (y % 16 === 1) t = 3.8;
        // Arrises: the left edge lit, the right in shade.
        if (x === 0) t += 0.8;
        else if (x === W - 1) t -= 1;
        c.set(x, y, s, t);
      }
    }
    for (let y = 8; y < H; y += 16) {
      for (const x of [6, 22]) {
        c.set(x, y, s, 0.6);
        c.set(x + 1, y + 1, s, 4);
      }
    }
    // Rust bleeding down from each insulator arm (heights 1.3 + i × 1.5 m).
    for (let i = 0; i < 6; i++) {
      const y0 = Y(1.3 + i * 1.5) + 2;
      for (let j = 0; j < 3; j++) {
        const x = 9 + j * 5 + rng.int(-2, 2);
        const len = rng.int(14, 40) + variant * 10;
        for (let q = 0; q < len; q++) {
          const t = q / len;
          if (t > 0.5 && bayer(x, y0 + q) < (t - 0.5) * 2) continue;
          c.tint(x + (q % 9 === 4 ? 1 : 0), y0 + q, rust, -0.3);
        }
      }
      // The arm's bolt plate.
      c.rect(10, y0 - 4, 9, 4, s, 2.2);
      c.hline(10, y0 - 4, 9, s, 3.8);
    }
    // Hazard band (0.6–1.4 m): diagonal yellow / black, chipped.
    const b0 = Y(1.4);
    const b1 = Y(0.6);
    for (let y = b0; y < b1; y++) {
      for (let x = 0; x < W; x++) {
        const stripe = ((x + y) >> 3) & 1;
        const chip = hash2(x, y, 31 + variant) > 0.9;
        if (chip) continue;
        c.set(x, y, stripe ? ink : yl, stripe ? 1.4 : y === b0 ? 4 : 3);
      }
    }
    // Stencil: a lightning bolt in a triangle, and HV, at 3 m.
    const sy = Y(3.4);
    for (let j = 0; j < 12; j++) {
      const half = Math.round(j * 0.55);
      c.set(14 - half, sy + j, yl, 3.6);
      c.set(14 + half, sy + j, yl, 3.6);
    }
    c.hline(8, sy + 12, 13, yl, 3.6);
    for (const [x, y] of [[15, 3], [14, 4], [13, 5], [14, 6], [15, 6], [14, 7], [13, 8], [12, 9]]) c.set(x, sy + y, ink, 1);
    drawText(c, 'HV', 8, sy + 16, FONT_3x5, yl, 3.4);
    // Cracks, chipped arrises.
    for (let i = 0; i < 3 + variant * 2; i++) crack(c, rng, rng.int(2, W - 3), rng.int(20, H - 40), rng.int(8, 22), Math.PI / 2 + rng.spread(0.5), { dt: -1.4, lip: 0.6, wrapX: false });
    for (let i = 0; i < 12; i++) c.shift(rng.chance(0.5) ? 0 : W - 1, rng.int(0, H - 1), -1.2);
    // Foot: moss creeping up, splash-back.
    for (let x = 0; x < W; x++) {
      const h = Math.round(4 + smooth(x, 0, W, 8, 4, 9 + variant) * 10);
      for (let j = 0; j < h; j++) {
        const y = H - 1 - j;
        if (y < b1 && hash2(x, y, 7) > 0.6) continue;
        if (j > h - 3 && hash2(x, y, 8) > 0.5) continue;
        c.set(x, y, moss, j === h - 1 ? 4 : j % 3 === 0 ? 2.4 : 3);
      }
    }
  });
}

/** Insulator arm side (module 42 × 8 = 1.3 × 0.25 m): dark steel channel with brown glazed insulator stacks. */
export function d3InsulatorModule(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3insulator`, 42, 8, (c, k) => {
    const st = k.ramp(0x3a3e44, { light: 0.5, sat: 0.6 });
    const cer = k.ramp(0x7a3a20, { light: 0.5, sat: 1.0 });
    c.rect(0, 0, 42, 8, st, 2.6);
    c.hline(0, 0, 42, st, 4);
    c.hline(0, 7, 42, st, 1);
    for (const x0 of [3, 15, 27, 37]) {
      for (let d = 0; d < 3; d++) {
        c.vline(x0 + d * 1, 1, 6, cer, d === 0 ? 4.4 : d === 1 ? 3 : 1.8);
      }
    }
  });
}

export interface WireOpts {
  wire: number;
  vine: number;
  tape: number;
}

/**
 * A high-voltage span between two pylons (module 96 × 144 at 16 texels a metre =
 * 6 × 9 m, cut out): six sagging wires (rain glints along them), the porcelain
 * insulators at the ends; `variant` 1 a vine creeping along the lower wires,
 * 2 a torn warning tape fluttering from one.
 */
export function d3WireSpanModule(atlas: PwAtlas, o: WireOpts, variant: number): PwTile {
  const W = 96;
  const H = 144;
  const D = 16;
  return atlas.tile(`d3wires|${h6(o.wire)}|${variant}`, W, H, (c, k) => {
    const w = k.ramp(o.wire, { light: 0.55, sat: 0.6 });
    const vine = k.ramp(o.vine, { light: 0.45, sat: 1.05 });
    const tape = k.ramp(o.tape, { light: 0.45, sat: 1.05 });
    const ins = k.ramp(0x8a4a2a, { light: 0.5 });
    const hs = [1.3, 2.8, 4.3, 5.8, 7.3, 8.6];
    const rowOf = (h: number, x: number) => Math.round(H - 1 - h * D + Math.sin(((x + 0.5) / W) * Math.PI) * 0.18 * D);
    hs.forEach((h, wi) => {
      for (let x = 0; x < W; x++) c.set(x, rowOf(h, x), w, (x + wi * 13) % 11 === 0 ? 4.6 : (x + wi) % 3 === 0 ? 2 : 2.8);
      for (const x of [0, 1, W - 2, W - 1]) {
        c.set(x, rowOf(h, x) - 1, ins, 4);
        c.set(x, rowOf(h, x), ins, 3);
        c.set(x, rowOf(h, x) + 1, ins, 1.8);
      }
    });
    if (variant === 1) {
      for (let wi = 0; wi < 2; wi++) {
        for (let x = 4; x < W - 10; x++) {
          const y = rowOf(hs[wi], x) + Math.round(Math.sin(x * 0.6 + wi) * 1);
          c.set(x, y, vine, 3);
          if (hash2(x, wi, 5) > 0.72) {
            c.set(x, y + 1, vine, 4);
            c.set(x + 1, y + 1, vine, 2.4);
            if (hash2(x, wi, 6) > 0.6) c.set(x, y + 2, vine, 2);
          }
        }
      }
    }
    if (variant === 2) {
      // Warning tape tied to the third wire, torn, fluttering down.
      const x0 = 40;
      const y0 = rowOf(hs[2], x0);
      for (let j = 0; j < 22; j++) {
        const x = x0 + Math.round(Math.sin(j * 0.45) * 3 + j * 0.4);
        const y = y0 + j;
        const stripe = (j >> 2) & 1;
        c.set(x, y, tape, stripe ? 1.2 : 3.6);
        c.set(x + 1, y, tape, stripe ? 1 : 2.6);
      }
    }
  });
}

/** Rubber-sheathed HV cable (wrap 4 × 32, u across the cable): black with a wet highlight along it, binding wire. */
export function d3CableTile(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3cable`, 16, 32, (c, k) => {
    const r = k.ramp(0x26282c, { light: 0.55, sat: 0.6 });
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 16; x++) {
        const u = x % 4;
        c.set(x, y, r, u === 1 ? (y % 8 === 0 ? 4.6 : 3.4) : u === 0 ? 2.2 : 1.4);
      }
    }
    for (let x = 0; x < 16; x++) c.set(x, 20, r, 4);
  }, { wrap: true });
}

/**
 * The paddock's DANGER board (module 116 × 56 = 3.6 × 1.75 m): hazard trims
 * top and bottom, red enamel, DANGER in big white letters, HIGH VOLTAGE under
 * it, lightning flashes either side, bolts, rust bleeding from chips, rain
 * streaks, a couple of bullet holes.
 */
export function d3DangerBoardModule(atlas: PwAtlas, variant = 0): PwTile {
  const W = 116;
  const H = 56;
  return atlas.tile(`d3dangerboard|${variant}`, W, H, (c, k) => {
    const rng = k.rng;
    const red = k.ramp(0xb02018, { light: 0.45, sat: 1.0 });
    const wh = k.ramp(0xf2ece0, { light: 0.3, sat: 0.5 });
    const yl = k.ramp(0xe0b020, { light: 0.45, sat: 1.05 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    const rust = k.ramp(0x6a3218, { light: 0.4 });
    c.rect(0, 4, W, H - 8, red, 3);
    c.hline(0, 4, W, red, 4.2);
    c.hline(0, H - 5, W, red, 1.6);
    // Hazard trims.
    for (const y0 of [0, H - 4]) for (let y = y0; y < y0 + 4; y++) for (let x = 0; x < W; x++) c.set(x, y, ((x + y) >> 2) & 1 ? ink : yl, ((x + y) >> 2) & 1 ? 1.4 : y === y0 ? 4 : 3);
    // DANGER (bold ×2) and HIGH VOLTAGE.
    const tw = textWidth('DANGER', FONT_BOLD, { scale: 2 });
    drawText(c, 'DANGER', Math.round((W - tw) / 2), 9, FONT_BOLD, wh, 3.6, { scale: 2, shadow: { ramp: red, tone: 1 }, shadeFn: (_u, v) => (v < 0.25 ? 0.8 : 0) });
    const tw2 = textWidth('HIGH VOLTAGE', FONT_5x7);
    drawText(c, 'HIGH VOLTAGE', Math.round((W - tw2) / 2), 34, FONT_5x7, wh, 3.4, { shadow: { ramp: red, tone: 1.2 } });
    const tw3 = textWidth('KEEP OFF FENCE', FONT_3x5);
    drawText(c, 'KEEP OFF FENCE', Math.round((W - tw3) / 2), 44, FONT_3x5, yl, 3.6);
    // Lightning flashes either side.
    for (const x0 of [6, W - 16]) {
      const pts = [[6, 0], [2, 8], [6, 8], [1, 18], [9, 6], [5, 6], [9, 0]];
      c.poly(pts.flatMap(([x, y]) => [x0 + x, 12 + y]), yl, 3.8);
    }
    // Bolts in the corners.
    for (const [x, y] of [[2, 6], [W - 4, 6], [2, H - 8], [W - 4, H - 8]]) {
      c.set(x, y, wh, 4.4);
      c.set(x + 1, y + 1, red, 1);
    }
    // Chips with rust running from them, rain streaks, bullet holes.
    for (let i = 0; i < 14 + variant * 8; i++) {
      const x = rng.int(2, W - 3);
      const y = rng.int(6, H - 10);
      c.cluster(x, y, i, rust, 2.4);
      if (i % 2 === 0) for (let j = 1; j < rng.int(4, 12); j++) if (j < 6 || bayer(x, y + j) > 0.5) c.tint(x, y + j, rust, 0);
    }
    for (let i = 0; i < 12; i++) c.streak(rng, rng.int(1, W - 2), 5, rng.int(8, 30), -0.6, 0);
    for (const [x, y] of [[30 + variant * 40, 26], [88 - variant * 30, 18]]) {
      c.set(x, y, ink, 0);
      c.set(x + 1, y, ink, 0.6);
      c.set(x, y + 1, ink, 0.6);
      c.set(x - 1, y - 1, wh, 4.4);
      c.set(x + 2, y + 1, red, 4);
    }
  });
}

/** Lamp-post steel (wrap 16 × 32): dark green paint flaking to rust, drips, a rain glint down the lit side. */
export function d3PoleTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3pole|${h6(o.hex)}`, 16, 32, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(o.hex, { light: 0.5, sat: 0.9 });
    const rust = k.ramp(0x6a3a1c, { light: 0.42 });
    c.rect(0, 0, 16, 32, p, (x) => (x < 4 ? 3.6 : x < 10 ? 3 : 2.4));
    for (let y = 0; y < 32; y += 3) c.set(2, y, p, 4.6);
    for (let i = 0; i < 6; i++) c.cluster(rng.int(0, 15), rng.int(0, 31), i, rust, 2.8);
    for (let i = 0; i < 3; i++) c.streak(rng, rng.int(0, 15), rng.int(0, 31), rng.int(6, 16), -0.6, 0);
  }, { wrap: true });
}

/**
 * The lamp head seen from below / the side (module 24 × 12 = 0.75 × 0.375 m): the
 * pressed-steel hood, its lit rim, a hot glass bowl under it (glow), bugs.
 */
export function d3LampHeadModule(atlas: PwAtlas, lit: boolean): PwTile {
  return atlas.tile(`d3lamphead|${lit ? 1 : 0}`, 24, 12, (c, k) => {
    const p = k.ramp(0x34403a, { light: 0.5 });
    const glass = k.ramp(lit ? 0xffd9a0 : 0x4a4a44, { light: 0.5 });
    for (let y = 0; y < 7; y++) {
      const half = 6 + y;
      for (let x = 12 - half; x < 12 + half; x++) c.set(x, y, p, y === 0 ? 4 : x < 12 - half + 2 ? 3.6 : x > 12 + half - 3 ? 2 : 2.8);
    }
    c.hline(0, 7, 24, p, 1.4);
    for (let y = 8; y < 12; y++) {
      const half = 9 - (y - 8) * 2;
      for (let x = 12 - half; x < 12 + half; x++) c.set(x, y, glass, lit ? (y === 8 ? 5 : 4) : y === 8 ? 3.6 : 2.4, lit ? PWF.GLOW : 0);
    }
  });
}

/**
 * A wooden direction board (module, cut out at its ragged ends): weathered
 * planks, a darker frame, the text in cream paint with a hand-painted arrow
 * (`<` / `>` in the text), nail heads, moss on the top edge, chips. Sized to
 * the classic board (`wM` × `hM`).
 */
export function d3SignBoardModule(atlas: PwAtlas, text: string, wM: number, hM: number): PwTile {
  const W = Math.max(16, Math.round(wM * 32));
  const H = Math.max(8, Math.round(hM * 32));
  return atlas.tile(`d3signboard|${text}|${W}|${H}`, W, H, (c, k) => {
    const rng = k.rng;
    const wood = k.ramp(0x5e442c, { light: 0.42 });
    const ink = k.ramp(0xe8d8a8, { light: 0.35, sat: 0.8 });
    const moss = k.ramp(0x4a6a2a, { light: 0.45 });
    // Planks across, each with its own tone and grain.
    const pl = Math.max(5, Math.round(H / 3));
    for (let y = 0; y < H; y++) {
      const p = Math.floor(y / pl);
      for (let x = 0; x < W; x++) {
        let t = p % 2 ? 2.8 : 3.1;
        if (y % pl === 0) t = 1.4;
        else if (y % pl === 1) t = 3.8;
        else if (hash2(x >> 3, y, 4 + p) > 0.86) t -= 0.7;
        c.set(x, y, wood, t);
      }
    }
    c.frame(0, 0, W, H, wood, 1.6);
    c.hline(1, 1, W - 2, wood, 4);
    // Text (bold, as tall as fits) with painted arrows.
    const left = text.startsWith('<');
    const right = text.endsWith('>');
    const words = text.replace(/[<>]/g, '').trim();
    // The largest whole scale (≤ 3) whose text + arrow fits the board.
    let scale = Math.max(1, Math.min(3, Math.floor((H - 8) / 7)));
    const fit = (sc: number) => textWidth(words, FONT_BOLD, { scale: sc }) + (left || right ? Math.round(7 * sc * 1.2) + 4 : 0) <= W - 8;
    while (scale > 1 && !fit(scale)) scale--;
    const tw = textWidth(words, FONT_BOLD, { scale });
    const arrowW = left || right ? Math.round(7 * scale * 1.2) + 4 : 0;
    const x0 = Math.round((W - tw - arrowW) / 2) + (left ? arrowW : 0);
    const y0 = Math.round((H - 7 * scale) / 2);
    drawText(c, words, x0, y0, FONT_BOLD, ink, 3.4, { scale, shadow: { ramp: wood, tone: 1 } });
    const arrow = (ax: number, dir: number) => {
      const s = 7 * scale;
      const cy = y0 + s / 2;
      for (let j = 0; j < s; j++) {
        const half = Math.round((j < s / 2 ? j : s - 1 - j) * 0.9);
        for (let i = 0; i <= half; i++) c.set(ax + dir * (Math.round(s * 0.5) - i), y0 + j, ink, 3.4);
      }
      for (let i = 0; i < Math.round(s * 0.6); i++) for (let j = -1; j <= 1; j++) c.set(ax - dir * i, Math.round(cy) + j, ink, 3.4);
    };
    if (left) arrow(x0 - arrowW + 2, -1);
    if (right) arrow(x0 + tw + arrowW - 2, 1);
    // Paint wear (gaps in the letters), nails, chips, moss along the top edge.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (c.at(x, y) === ink && hash2(x, y, 9) > 0.86) c.set(x, y, wood, 2.6);
    for (const x of [3, W - 4]) for (let p = 0; p * pl < H; p++) c.set(x, p * pl + Math.floor(pl / 2), wood, 4.4);
    for (let i = 0; i < Math.round((W * H) / 80); i++) c.cluster(rng.int(1, W - 2), rng.int(1, H - 2), i, 0, -0.8);
    for (let x = 0; x < W; x++) {
      const n = smooth(x, 0, W, 8, 4, 3);
      if (n < 0.5) continue;
      c.set(x, 0, moss, 4);
      if (n > 0.65) c.set(x, 1, moss, 2.6);
    }
  });
}

/**
 * The roadblock's barrier board (module 84 × 10 = 2.6 × 0.32 m, front and
 * back): reflective chevrons, ROAD CLOSED stencil, scuffs, splintered ends.
 */
export function d3BarrierBoardModule(atlas: PwAtlas, text: boolean): PwTile {
  const W = 84;
  const H = 10;
  return atlas.tile(`d3barrier|${text ? 1 : 0}`, W, H, (c, k) => {
    const yl = k.ramp(0xe0b020, { light: 0.45, sat: 1.05 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    const wh = k.ramp(0xf2ece0, { light: 0.3, sat: 0.5 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, ((x + y) >> 3) & 1 ? ink : yl, ((x + y) >> 3) & 1 ? 1.4 : y === 0 ? 4.2 : y === H - 1 ? 2 : 3.2);
    if (text) {
      const tw = textWidth('ROAD CLOSED', FONT_3x5);
      c.rect(Math.round((W - tw) / 2) - 2, 2, tw + 4, 7, wh, 3.4);
      drawText(c, 'ROAD CLOSED', Math.round((W - tw) / 2), 3, FONT_3x5, ink, 1.2);
    }
    for (let i = 0; i < 18; i++) c.cluster(k.rng.int(0, W - 1), k.rng.int(0, H - 1), i, 0, -0.9);
    for (const x of [0, 1, W - 2, W - 1]) for (let y = 0; y < H; y++) if (hash2(x, y, 4) > 0.6) c.set(x, y, 0, 0);
  });
}

/** Fuel drum side (wrap 64 × 32 = 2 × 1 m round the drum): enamel with rolling hoops, a hazard label, rust, dents. */
export function d3DrumTile(atlas: PwAtlas, o: { hex: number; label: number }): PwTile {
  return atlas.tile(`d3drum|${h6(o.hex)}`, 64, 32, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(o.hex, { light: 0.45, sat: 1.0 });
    const band = k.ramp(0x2e2a22, { light: 0.5 });
    const lab = k.ramp(o.label, { light: 0.45 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    const rust = k.ramp(0x6a3218, { light: 0.4 });
    c.rect(0, 0, 64, 32, p, (x) => ((x >> 2) % 4 === 0 ? 3.6 : 3));
    for (const y of [7, 23]) {
      c.hline(0, y, 64, band, 3.8);
      c.hline(0, y + 1, 64, band, 2.6);
      c.hline(0, y + 2, 64, band, 1.4);
    }
    // Label: a diamond with a flame, FLAMMABLE under it.
    c.rect(20, 11, 22, 10, lab, 3.6);
    for (let j = 0; j < 4; j++) c.hline(30 - j, 12 + j, 2 + j * 2, ink, 1);
    drawText(c, 'FUEL', 23, 15, FONT_3x5, ink, 1);
    for (let i = 0; i < 14; i++) c.cluster(rng.int(0, 63), rng.int(0, 31), i, rust, 2.4);
    for (let i = 0; i < 6; i++) c.streak(rng, rng.int(0, 63), rng.int(0, 10), rng.int(6, 20), -0.7, 0);
    // A dent.
    c.ellipseShade(48, 14, 5, 3, (d) => (d < 0.6 ? -1 : 0.6), p);
  }, { wrap: true });
}

/** A drum lid / end (module 22 × 22): rim, two bungs, rain water pooled, rust ring. */
export function d3DrumLidModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3drumlid|${h6(o.hex)}`, 22, 22, (c, k) => {
    const p = k.ramp(o.hex, { light: 0.45, sat: 1.0 });
    const wat = k.ramp(0x3a4a68, { light: 0.4 });
    c.ellipse(11, 11, 11, 11, p, (u, v) => (Math.hypot(u, v) > 0.85 ? (u + v < 0 ? 4 : 2) : 2.8));
    c.ellipse(13, 13, 5, 4, wat, 2.6);
    for (const [x, y] of [[6, 7], [15, 6]]) {
      c.set(x, y, p, 1);
      c.set(x + 1, y + 1, p, 4);
    }
  });
}

/** Paint the park emblem on a canvas (used by vehicle doors / signs). */
export function d3Emblem(c: PwCanvas, k: PwKit, cx: number, cy: number, r: number) {
  d1Emblem(c, k, cx, cy, r);
}

export { FONT_5x7 };

/** Palm trunk bark (wrap 32 × 32, u round the trunk): stacked leaf-scar rings (lit upper lip), fibres, lichen. */
export function d3PalmBarkTile(atlas: PwAtlas, o: { hex: number; ring: number }): PwTile {
  return atlas.tile(`d3palmbark|${h6(o.hex)}`, 32, 32, (c, k) => {
    const b = k.ramp(o.hex, { light: 0.45 });
    const r = k.ramp(o.ring, { light: 0.45 });
    const lich = k.ramp(0x7a8a6a, { light: 0.4 });
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const v = y % 8;
        const tilt = (x >> 3) & 1;
        const yy = (y + tilt) % 8;
        let t = yy === 0 ? 4 : yy === 1 ? 3.4 : yy === 7 ? 1.4 : (x + y * 3) % 7 === 0 ? 2.4 : 3;
        if (x % 8 === 7) t -= 0.6;
        c.set(x, y, v === 7 ? r : b, t);
      }
    }
    c.scatter(k.rng, 0, 0, 32, 32, 8, lich, 3.2, { shapes: 5 });
  }, { wrap: true });
}

/**
 * A palm frond (module 96 × 32 = 3 × 1 m, cut out): a midrib from the base (left)
 * arching to the tip (right), drooping leaflets either side — lit upper ones,
 * shaded lower ones — ragged and torn by the storm.
 */
export function d3FrondModule(atlas: PwAtlas, o: { hex: number; rib: number }, variant = 0): PwTile {
  const W = 96;
  const H = 32;
  return atlas.tile(`d3frond|${h6(o.hex)}|${variant}`, W, H, (c, k) => {
    const g = k.ramp(o.hex, { light: 0.45, sat: 1.05 });
    const rib = k.ramp(o.rib, { light: 0.45 });
    const ribY = (x: number) => Math.round(10 + (x / W) * (x / W) * 12);
    for (let x = 2; x < W - 2; x += 2) {
      const y0 = ribY(x);
      const len = Math.round(13 * Math.sin(((x + 4) / (W + 4)) * Math.PI) + 2);
      if (hash2(x, variant, 11) > 0.86) continue; // torn gaps
      for (const side of [-1, 1]) {
        for (let j = 1; j <= len; j++) {
          const px = x + Math.round(j * 0.55);
          const py = y0 + side * Math.round(j * 0.55) + (side > 0 ? Math.round((j * j) / 18) : Math.round((j * j) / 30));
          c.set(px, py, g, side < 0 ? (j === len ? 4.4 : 3.6) : j === len ? 2.6 : 2.2);
          if (j < len - 1) c.set(px + 1, py, g, side < 0 ? 3 : 1.6);
        }
      }
    }
    for (let x = 0; x < W - 4; x++) {
      c.set(x, ribY(x), rib, x < 20 ? 3.8 : 3.2);
      if (x < 30) c.set(x, ribY(x) + 1, rib, 2);
    }
  });
}

/** A burning road flare (module 16 × 16, laid flat, cut out): the red stick, its white-hot head, a dithered red halo on the wet road. */
export function d3FlareDecal(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3flare`, 16, 16, (c, k) => {
    const red = k.ramp(0xff3020, { light: 0.55, sat: 1.1 });
    const hot = k.ramp(0xffe0c0, { light: 0.5 });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d < 7.5 && bayer(x, y) > (d - 2) / 6) c.set(x, y, red, d < 4 ? 3.4 : 2.4, PWF.GLOW);
    }
    for (let j = 0; j < 6; j++) c.set(5 + j, 9 - (j >> 1), red, 3, PWF.GLOW);
    c.set(11, 6, hot, 5, PWF.GLOW);
    c.set(10, 6, hot, 4.4, PWF.GLOW);
  });
}

/** A wooden utility pole (wrap 16 × 64, u round it): weathered grey timber, climbing-spike holes, a rust-streaked tag. */
export function d3UtilityPoleTile(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3utilpole`, 16, 64, (c, k) => {
    const w = k.ramp(0x5a4c3c, { light: 0.42 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) c.set(x, y, w, x < 4 ? 3.5 : x > 11 ? 2.3 : (x + (y >> 3)) % 5 === 0 ? 2.6 : 3);
    for (let y = 6; y < 64; y += 14) c.set(7, y, w, 0.8);
    c.scatter(k.rng, 0, 0, 16, 64, 8, 0, -0.8, { shapes: 3 });
  }, { wrap: true });
}
