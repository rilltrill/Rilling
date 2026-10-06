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

/**
 * A snapped pylon stump's face (module 29 × 102 = 0.9 × 3.2 m, cut out at the top): darker
 * board-formed concrete (the spotlight never clips it), the top 0.5 m snapped off in a jagged
 * cut-out profile with rebar ends poking out, a crack network spreading down from the break, spall
 * chips (dark pits with lit lower lips), the hazard band square on the foot (0.2–0.8 m), soot and
 * moss at the base. `variant` changes the break.
 */
export function d3StumpFaceModule(atlas: PwAtlas, o: { hex: number; moss: number }, variant: number): PwTile {
  const W = 29;
  const H = 102;
  return atlas.tile(`d3stump|${h6(o.hex)}|${variant}`, W, H, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.35, sat: 0.8 });
    const rust = k.ramp(0x6a3a1c, { light: 0.42 });
    const moss = k.ramp(o.moss, { light: 0.45 });
    const yl = k.ramp(0xc8a020, { light: 0.4, sat: 1 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    const soot = k.ramp(0x1e1c1a, { light: 0.4 });
    // The break: a jagged top edge (rows from the top), deepest 16 rows down.
    const top = new Int16Array(W);
    for (let x = 0; x < W; x++) top[x] = Math.round(3 + Math.abs(Math.sin((x + variant * 7) * 0.45)) * 7 + hash2(x >> 1, variant, 41) * 6);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (y < top[x]) continue;
        const board = (y >> 2) & 3;
        let t = board === 1 ? 3.2 : board === 3 ? 2.8 : 3;
        if (y % 16 === 0) t = 2;
        if (x === 0) t += 0.6;
        else if (x === W - 1) t -= 1;
        // The fresh break is paler (raw aggregate), a dark lip under it.
        if (y < top[x] + 2) t = y === top[x] ? 3.8 : 3.4;
        c.set(x, y, s, t);
      }
    }
    // Rebar ends sticking up out of the break (2 texels, rust).
    for (const x of [5 + variant, 14, 22 - variant]) {
      const y0 = top[x];
      const len = 5 + ((x * 3 + variant) % 6);
      for (let j = 0; j < len; j++) {
        const xx = x + (j > len - 3 ? 1 : 0);
        c.set(xx, y0 - j, rust, j === len - 1 ? 3.6 : 2.6);
      }
    }
    // Crack network from the break down the face.
    for (let i = 0; i < 4; i++) crack(c, rng, rng.int(3, W - 4), top[rng.int(3, W - 4)] + 2, rng.int(14, 34), Math.PI / 2 + rng.spread(0.6), { dt: -1.4, lip: 0.6, wrapX: false, branch: 0.25 });
    // Spall chips: dark pits with a lit lower lip.
    for (let i = 0; i < 7; i++) {
      const x = rng.int(2, W - 4);
      const y = rng.int(20, H - 30);
      c.rect(x, y, 2, 2, s, 1.2);
      c.hline(x, y + 2, 2, s, 4);
    }
    // Hazard band square on the foot (0.2–0.8 m: rows from the bottom 6–26), 8-texel diagonal bands.
    for (let y = H - 26; y < H - 6; y++) for (let x = 0; x < W; x++) {
      const band = ((x + y) >> 3) & 1;
      if (hash2(x >> 1, y >> 1, 43 + variant) > 0.92) continue;
      c.set(x, y, band ? ink : yl, band ? 1.4 : y === H - 26 ? 3.6 : 2.8);
    }
    // Soot up the foot (dithered), then moss.
    for (let y = H - 18; y < H; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < (y - (H - 18)) / 20) c.set(x, y, soot, 2);
    for (let x = 0; x < W; x++) {
      const h = Math.round(2 + smooth(x, 0, W, 8, 4, 9 + variant) * 6);
      for (let j = 0; j < h; j++) if (hash2(x, j, 8) > 0.35) c.set(x, H - 1 - j, moss, j === h - 1 ? 3.6 : 2.4);
    }
  });
}

/** Broken concrete seen from above (module 32 × 32, the stump's top): rubble lumps, rebar ends, rain in the hollows. */
export function d3RubbleTopModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3rubbletop|${h6(o.hex)}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.35, sat: 0.8 });
    const rust = k.ramp(0x6a3a1c, { light: 0.42 });
    const wat = k.ramp(0x2a3850, { light: 0.4 });
    c.rect(0, 0, 32, 32, s, 2.4);
    for (let i = 0; i < 16; i++) {
      const x = rng.int(1, 30);
      const y = rng.int(1, 30);
      const r = rng.int(1, 3);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) c.set(x + dx, y + dy, s, dy < 0 ? 3.6 : dy > 0 ? 2 : 3);
    }
    c.ellipse(20, 12, 4, 3, wat, 2.6);
    for (const [x, y] of [[8, 8], [16, 22], [25, 18]]) c.rect(x, y, 2, 2, rust, 3);
  });
}

/** A scorch on the ground (decal 64 × 64 = 2 m, cut out): charred black in the middle, ragged soot fingers, burnt grass at the edge. */
export function d3ScorchDecal(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3scorch`, 64, 64, (c, k) => {
    const soot = k.ramp(0x1a1816, { light: 0.4 });
    const burnt = k.ramp(0x3a2e1e, { light: 0.42 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const a = Math.atan2(y - 32, x - 32);
      const r = (0.75 + Math.sin(a * 5) * 0.12 + Math.sin(a * 11 + 1) * 0.08) * 32;
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / r;
      if (d > 1 || bayer(x >> 1, y >> 1) < (d - 0.6) * 2.2) continue;
      c.set(x, y, d < 0.75 ? soot : burnt, d < 0.4 ? 1.4 : 2);
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

/**
 * A run of the old paddock fence along the treeline (module 96 × 48 at 16 texels a metre = 6 × 3 m,
 * cut out): concrete posts at both ends, four sagging cables in 2-texel strokes (a glint along
 * each); `variant` 1: the span torn, its cables hanging to the ground; 2: the far post leaning,
 * a vine climbing it and a DANGER plate on it.
 */
export function d3TornFenceModule(atlas: PwAtlas, variant: number): PwTile {
  const W = 96;
  const H = 48;
  return atlas.tile(`d3tornfence|${variant}`, W, H, (c, k) => {
    const conc = k.ramp(0x6e6c66, { light: 0.35, sat: 0.8 });
    const wire = k.ramp(0x5a5e62, { light: 0.55, sat: 0.6 });
    const vine = k.ramp(0x355f36, { light: 0.45 });
    const red = k.ramp(0xb02018, { light: 0.45 });
    const wh = k.ramp(0xf2ece0, { light: 0.3, sat: 0.5 });
    const post = (x0: number, lean: number) => {
      for (let y = 4; y < H; y++) {
        const x = x0 + Math.round(((H - y) / H) * lean);
        c.set(x, y, conc, 3.6);
        c.set(x + 1, y, conc, 3);
        c.set(x + 2, y, conc, 2);
      }
      return x0 + lean;
    };
    const ax = post(1, 0);
    const bx = variant === 2 ? post(W - 8, 5) : post(W - 4, 0);
    for (let i = 0; i < 4; i++) {
      const y0 = 10 + i * 9;
      if (variant === 1 && i < 3) {
        // Torn: from each post the cable droops to the ground mid-span.
        for (const [sx, dir] of [[ax + 3, 1], [bx - 1, -1]] as [number, number][]) {
          const len = 18 + i * 7;
          for (let j = 0; j < len; j++) {
            const x = sx + dir * j;
            const y = Math.min(H - 1, Math.round(y0 + (j * j) / (len * 0.55) * 0.9));
            c.set(x, y, wire, j % 11 === 3 ? 4.4 : 3);
            c.set(x, y + 1, wire, 1.8);
          }
        }
        continue;
      }
      for (let x = ax + 3; x < bx; x++) {
        const t = (x - ax) / (bx - ax);
        const y = Math.round(y0 + Math.sin(t * Math.PI) * 3);
        c.set(x, y, wire, (x + i * 7) % 13 === 0 ? 4.4 : 3);
        c.set(x, y + 1, wire, 1.8);
      }
    }
    if (variant === 2) {
      for (let y = 8; y < H; y++) {
        const x = bx - 1 + Math.round(Math.sin(y * 0.5) * 1.5);
        c.set(x, y, vine, 2.6);
        if (y % 4 === 0) for (const dx of [-2, -1, 1, 2]) c.set(x + dx, y + (Math.abs(dx) > 1 ? 1 : 0), vine, dx < 0 ? 3.4 : 2.2);
      }
      c.rect(bx - 8, 18, 10, 7, red, 3);
      c.rect(bx - 7, 20, 8, 2, wh, 3.6);
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
 * The paddock's DANGER board (module 240 × 116 = the 3.75 × 1.82 m board at 64 texels a metre):
 * hazard trims top and bottom, red enamel, DANGER and HIGH VOLTAGE in 4-texel strokes on a 4-texel
 * grid (whole letters through level 2: they read from the road), KEEP OFF FENCE in 2-texel
 * strokes, lightning flashes either side, bolts, chips with rust runs, rain streaks and bullet
 * holes — all in 2 × 2 cells so the levels keep them.
 */
export function d3DangerBoardModule(atlas: PwAtlas, variant = 0): PwTile {
  const W = 240;
  const H = 116;
  const key = `d3dangerboard2|${variant}`;
  const twD = textWidth('DANGER', FONT_BOLD, { scale: 4 });
  const twH = textWidth('HIGH VOLTAGE', FONT_3x5, { scale: 4 });
  recordFit(key, 'DANGER', W, H, Math.max(twD, twH), 28 + 20, 8);
  return atlas.tile(key, W, H, (c, k) => {
    const rng = k.rng;
    const red = k.ramp(0xb02018, { light: 0.45, sat: 1.0 });
    const wh = k.ramp(0xf2ece0, { light: 0.3, sat: 0.5 });
    const yl = k.ramp(0xe0b020, { light: 0.45, sat: 1.05 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    const rust = k.ramp(0x6a3218, { light: 0.4 });
    c.rect(0, 8, W, H - 16, red, 3);
    c.rect(0, 8, W, 2, red, 4.2);
    c.rect(0, H - 10, W, 2, red, 1.6);
    // Hazard trims (8 rows, 8-texel diagonal bands).
    for (const y0 of [0, H - 8]) for (let y = y0; y < y0 + 8; y++) for (let x = 0; x < W; x++) {
      const band = ((x + y) >> 3) & 1;
      c.set(x, y, band ? ink : yl, band ? 1.4 : y < y0 + 2 ? 4 : 3);
    }
    drawText(c, 'DANGER', Math.round((W - twD) / 8) * 4, 16, FONT_BOLD, wh, 3.6, { scale: 4, shadow: { ramp: red, tone: 1 }, shadowD: 2 });
    drawText(c, 'HIGH VOLTAGE', Math.round((W - twH) / 8) * 4, 56, FONT_3x5, wh, 3.6, { scale: 4, shadow: { ramp: red, tone: 1.2 }, shadowD: 2 });
    const tw3 = textWidth('KEEP OFF FENCE', FONT_3x5, { scale: 2 });
    drawText(c, 'KEEP OFF FENCE', Math.round((W - tw3) / 4) * 2, 86, FONT_3x5, yl, 3.6, { scale: 2 });
    // Lightning flashes either side (a 2× bolt).
    for (const x0 of [12, W - 32]) {
      const pts = [[12, 0], [4, 16], [12, 16], [2, 36], [18, 12], [10, 12], [18, 0]];
      c.poly(pts.flatMap(([x, y]) => [x0 + x, 20 + y]), yl, 3.8);
    }
    // Bolts in the corners (2 × 2 heads, a dark lower lip).
    for (const [x, y] of [[4, 12], [W - 6, 12], [4, H - 14], [W - 6, H - 14]]) {
      c.rect(x, y, 2, 2, wh, 4.4);
      c.rect(x + 1, y + 2, 2, 1, red, 1);
    }
    // Chips (2 × 2) with rust running from the top ones, rain streaks, bullet holes.
    for (let i = 0; i < 14 + variant * 10; i++) {
      const x = rng.int(1, (W >> 1) - 2) * 2;
      const y = rng.chance(0.5) ? rng.int(5, 7) * 2 : rng.int(23, 26) * 2;
      c.rect(x, y, 2, 2, rust, 2.4);
      if (i % 2 === 0 && y < 16) for (let j = 2; j < rng.int(6, 18); j++) if (j < 8 || bayer(x, y + j) > 0.5) c.tint(x, y + j, rust, 0);
    }
    for (let i = 0; i < 16; i++) c.streak(rng, rng.int(1, W - 2), 10, rng.int(10, 40), -0.6, 0);
    for (const [x, y] of [[60 + variant * 80, 50], [176 - variant * 60, 36]]) {
      c.rect(x, y, 2, 2, ink, 0);
      c.rect(x - 2, y - 2, 2, 2, wh, 4.4);
      c.rect(x + 2, y + 2, 2, 2, red, 1.6);
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

/** Sign layouts as painted (the identity test checks every text fits its board with a margin). */
export const D3_SIGN_FITS: { key: string; text: string; W: number; H: number; tw: number; th: number; margin: number }[] = [];

function recordFit(key: string, text: string, W: number, H: number, tw: number, th: number, margin: number) {
  if (!D3_SIGN_FITS.some((f) => f.key === key)) D3_SIGN_FITS.push({ key, text, W, H, tw, th, margin });
}

/**
 * A wooden direction board (module): weathered planks, a darker frame, the text in cream paint
 * with a dark drop shadow and a hand-painted arrow (`<` / `>` in the text), nail heads, moss on
 * the top edge. Painted at the CLASSIC letter size (`px` m a glyph pixel) with 4-texel strokes on
 * a 4-texel grid from the tile's bottom: the atlas's levels 1 and 2 hold the very same letters,
 * whole, so the board reads at the distance it is seen from; the grain is calmed behind the
 * letters. `wM` × `hM` = the classic board.
 */
export function d3SignBoardModule(atlas: PwAtlas, text: string, wM: number, hM: number, px: number): PwTile {
  const S = 4;
  const D = S / px;
  const W = Math.max(16, Math.round(wM * D));
  const H = Math.max(8, Math.round(hM * D));
  const left = text.startsWith('<');
  const right = text.endsWith('>');
  const words = text.replace(/[<>]/g, '').trim();
  const arrowW = left || right ? 7 * S + S : 0;
  // Bold where it fits with a clear margin, the regular face otherwise.
  const f = textWidth(words, FONT_BOLD, { scale: S }) + arrowW + 2 * S <= W ? FONT_BOLD : FONT_5x7;
  const tw = textWidth(words, f, { scale: S });
  const th = 7 * S;
  const total = tw + arrowW;
  // Grid-aligned origin: x to S, the text's bottom S-aligned from the tile's bottom.
  const x0 = Math.round((W - total) / 2 / S) * S + (left ? arrowW : 0);
  const gapB = Math.round((H - th) / 2 / S) * S;
  const y0 = H - th - gapB;
  const key = `d3signboard2|${text}|${W}|${H}`;
  recordFit(key, text, W, H, total, th, S);
  return atlas.tile(key, W, H, (c, k) => {
    const rng = k.rng;
    const wood = k.ramp(0x5e442c, { light: 0.42 });
    const ink = k.ramp(0xe8d8a8, { light: 0.35, sat: 0.8 });
    const moss = k.ramp(0x4a6a2a, { light: 0.45 });
    // Planks across (S-aligned seams), each its own tone; the grain only away from the letters.
    const pl = S * 3;
    for (let y = 0; y < H; y++) {
      const yb = H - 1 - y;
      const p = Math.floor(yb / pl);
      const inText = y >= y0 - S && y < y0 + th + S;
      for (let x = 0; x < W; x++) {
        let t = p % 2 ? 2.8 : 3.1;
        if (yb % pl === pl - 1) t = 1.4;
        else if (yb % pl === pl - 2) t = 3.8;
        else if (!inText && hash2(x >> 3, y, 4 + p) > 0.86) t -= 0.7;
        c.set(x, y, wood, t);
      }
    }
    c.frame(0, 0, W, H, wood, 1.6);
    c.frame(1, 1, W - 2, H - 2, wood, 1.6);
    c.hline(2, 2, W - 4, wood, 4);
    drawText(c, words, x0, y0, f, ink, 3.4, { scale: S, shadow: { ramp: wood, tone: 0.8 } });
    const arrow = (ax: number, dir: number) => {
      // A solid head (S-grid steps, its tip at ax + 3S·dir on the middle row) and a 3-cell shaft.
      for (let j = 0; j < 7; j++) {
        const half = 3 - Math.abs(3 - j);
        for (let i = 0; i <= half; i++) c.rect(ax + dir * i * S, y0 + j * S, S, S, ink, 3.4);
      }
      for (let i = 1; i <= 3; i++) c.rect(ax - dir * i * S, y0 + 3 * S, S, S, ink, 3.4);
    };
    if (left) arrow(x0 - arrowW + 3 * S, -1);
    if (right) arrow(x0 + tw + 4 * S, 1);
    // Paint worn off in whole S × S cells (a few), nails, chips off the letters, moss along the top.
    for (let i = 0; i < 3; i++) {
      const cx = Math.floor(rng.next() * (W / S)) * S;
      const cy = y0 + Math.floor(rng.next() * 7) * S;
      if (c.at(cx, cy) === ink && c.at(cx + S, cy) === ink) for (let q = 0; q < S * S; q++) c.set(cx + (q % S), cy + Math.floor(q / S), wood, 2.6);
    }
    for (const x of [4, W - 5]) for (let p = 0; p * pl < H; p++) c.set(x, H - 1 - p * pl - Math.floor(pl / 2), wood, 4.4);
    for (let i = 0; i < Math.round((W * H) / 160); i++) {
      const x = rng.int(2, W - 3);
      const y = rng.int(2, H - 3);
      if (c.at(x, y) !== ink) c.cluster(x, y, i, 0, -0.8);
    }
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

/**
 * A road flare lying on the ground (decal 16 × 16 = 0.5 m, cut out): the red paper tube (lit
 * paint, a highlight along it, the cap), its burning head white-hot with a yellow ring (glow),
 * a few sparks and slag drops beside it. `hex` = the flame colour (red, or a dying orange).
 */
export function d3FlareDecal(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3flare2|${h6(o.hex)}`, 16, 16, (c, k) => {
    const tube = k.ramp(0xb02818, { light: 0.45, sat: 1 });
    const fl = k.ramp(o.hex, { light: 0.55, sat: 1 });
    const hot = k.ramp(0xfff0d0, { light: 0.5, sat: 0.6 });
    for (let j = 0; j < 9; j++) {
      c.set(3 + j, 11 - (j >> 1), tube, 3.2);
      c.set(3 + j, 12 - (j >> 1), tube, 2);
    }
    c.set(3, 11, tube, 1.4);
    c.set(3, 12, tube, 1.4);
    // The burning head (the tube's far end): white core, a ring of flame.
    for (const [x, y, t] of [[12, 6, 5], [13, 6, 5], [12, 7, 4.6], [13, 5, 4.2], [11, 6, 4], [14, 6, 3.6], [12, 5, 3.8], [13, 7, 3.6]] as [number, number, number][]) c.set(x, y, t > 4.4 ? hot : fl, t, PWF.GLOW);
    for (const [x, y] of [[15, 3], [10, 3], [14, 9], [9, 8]]) c.set(x, y, fl, 4, PWF.GLOW);
  });
}

/** A flare's burning plume (module 8 × 16 = 0.25 × 0.5 m upright, cut out, glow): a white-hot root, a short ragged tongue, sparks, a wisp. */
export function d3FlarePlumeModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3flareplume|${h6(o.hex)}`, 8, 16, (c, k) => {
    const fl = k.ramp(o.hex, { light: 0.55, sat: 1 });
    const hot = k.ramp(0xfff0d0, { light: 0.5, sat: 0.6 });
    const smoke = k.ramp(0x6a6a72, { light: 0.4, sat: 0.4 });
    c.rect(3, 13, 2, 3, hot, 5, PWF.GLOW);
    for (const [x, y, t] of [[2, 14, 3.6], [5, 14, 3.4], [3, 12, 4], [4, 11, 3.8], [3, 10, 3.4], [4, 9, 3], [2, 12, 3], [5, 12, 3.2], [4, 7, 2.6]] as [number, number, number][]) c.set(x, y, fl, t, PWF.GLOW);
    for (const [x, y] of [[1, 9], [6, 6], [2, 4]]) c.set(x, y, fl, 4.2, PWF.GLOW);
    for (const [x, y] of [[4, 3], [5, 2], [4, 1], [3, 0]]) c.set(x, y, smoke, 2.6);
  });
}

/**
 * The light a flare throws on the wet ground (decal 64 × 64 = 2 m, cut out, unlit): two steps —
 * a small inner pool and an ordered-dithered outer ring in 2-texel cells — low-saturation, dark
 * tones (a tint over the asphalt, never a flat red plate), no long axis.
 */
export function d3FlarePoolDecal(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3flarepool2|${h6(o.hex)}`, 64, 64, (c, k) => {
    const p = k.ramp(o.hex, { light: 0.35, dark: 0.5, sat: 0.55 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32;
      if (d > 0.95) continue;
      const b = bayer(x >> 1, y >> 1);
      if (d < 0.38) c.set(x, y, p, b < 0.75 ? 1.6 : 1.1, PWF.GLOW);
      else if (b < 0.5 - (d - 0.38) * 0.7) c.set(x, y, p, 1.1, PWF.GLOW);
    }
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

/**
 * A fuel fire (animated module 32 × 48 a frame, D3_ANIM_FRAMES frames, cut out; `variant` 0 / 1 so
 * neighbouring cards never match): three to five teardrop tongues whose heights, widths and
 * places change frame by frame — white-yellow cores, orange bodies, yellow-orange licking tips
 * (never a red picket), a dark-red ragged foot of embers with bright coals, sparks breaking off.
 */
export function d3FireModule(atlas: PwAtlas, frames: number, variant = 0): PwTile {
  const W = 32;
  const FH = 48;
  return atlas.tile(`d3fire|${frames}|3|${variant}`, W, FH * frames, (c, k) => {
    const fire = k.ramp(0xff7a14, { light: 0.5, sat: 1.15 });
    const core = k.ramp(0xffe070, { light: 0.55, sat: 1.0 });
    const red = k.ramp(0xc02a10, { light: 0.45, sat: 1.15 });
    const R = c.ramp;
    const T = c.tone;
    const F = c.flag;
    const tx = new Float32Array(5);
    const th = new Float32Array(5);
    const thw = new Float32Array(5);
    const tsw = new Float32Array(5);
    for (let f = 0; f < frames; f++) {
      const y0 = c.h - (f + 1) * FH;
      const n = 3 + ((f + variant * 2) % 3);
      for (let i = 0; i < n; i++) {
        const q = hash2(i, f, 61 + variant);
        tx[i] = 4 + ((i + 0.5) / n) * 24 + (hash2(i, f, 62 + variant) - 0.5) * 6;
        th[i] = (0.45 + q * 0.55) * (i === (f + variant) % n ? 1 : 0.85);
        thw[i] = 3.4 + hash2(i, f, 63 + variant) * 3.4;
        tsw[i] = (hash2(i, f, 64 + variant) - 0.5) * 5;
      }
      for (let vt = 0; vt < FH; vt++) {
        const h = vt / FH;
        const row = (y0 + FH - 1 - vt) * W;
        for (let x = 0; x < W; x++) {
          let best = 9;
          let tip = 0;
          for (let i = 0; i < n; i++) {
            const top = th[i];
            if (h > top) continue;
            const u = h / top;
            const half = thw[i] * (1 - u) * (1 - u * 0.35) + 0.6;
            const d = Math.abs(x + 0.5 - tx[i] - tsw[i] * u * u) / half;
            if (d < best) {
              best = d;
              tip = u;
            }
          }
          if (best > 1) continue;
          let r = fire;
          let t = best < 0.55 ? 3.6 : 3;
          if (vt < 6) {
            // The ragged ember foot: dark red, gaps, a few bright coals.
            if (hash2(x, vt + f * 7, 65 + variant) < 0.18 + (5 - vt) * 0.05) continue;
            r = vt < 3 ? red : fire;
            t = hash2(x >> 1, f, 66) > 0.85 ? 4 : vt < 3 ? 2.4 : 2.8;
          } else if (best < 0.32 && tip < 0.55) {
            r = core;
            t = tip < 0.3 ? 4.6 : 4;
          } else if (tip > 0.8) {
            r = core;
            t = 3;
          } else if (best > 0.82) t = 2.4;
          const j = row + x;
          R[j] = r;
          T[j] = t;
          F[j] = PWF.GLOW;
        }
      }
      // Sparks above the licks.
      for (let i = 0; i < 4; i++) c.set(Math.floor(hash2(i, f, 67 + variant) * W), y0 + Math.floor(hash2(i, f, 68 + variant) * FH * 0.4), core, 4.4, PWF.GLOW);
    }
  });
}

/** A windsock (module 84 × 26 = 2.6 × 0.8 m, cut out, the mast end on the LEFT): orange / white bands tapering, wet, a frayed tail. */
export function d3WindsockModule(atlas: PwAtlas): PwTile {
  const W = 84;
  const H = 26;
  return atlas.tile(`d3windsock`, W, H, (c, k) => {
    const or = k.ramp(0xe05a1a, { light: 0.5, sat: 1.05 });
    const wh = k.ramp(0xe8e0d0, { light: 0.3, sat: 0.5 });
    const st = k.ramp(0x9a9a96, { light: 0.5, sat: 0.6 });
    for (let x = 0; x < W; x++) {
      const t = x / W;
      const half = 12 - t * 6 + Math.sin(t * 9) * 0.8;
      const cy = 12 + t * 3 + Math.sin(t * 7) * 1.2;
      const band = Math.floor(t * 5) % 2 === 0 ? or : wh;
      for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) {
        const v = (y - (cy - half)) / (half * 2);
        c.set(x, y, band, v < 0.18 ? 4 : v > 0.8 ? 1.8 : (x % 9) === 0 ? 2.4 : 3);
      }
    }
    c.rect(0, 0, 3, H, st, 3.4);
    for (let y = 4; y < 22; y++) if (hash2(y, 1, 3) > 0.5) c.set(W - 1, y, 0, 0);
  });
}

/** Hanging vines (module 32 × 96 = 1 × 3 m, cut out): five strands from the top, heart-shaped leaves along them, lit on the left. */
export function d3VineModule(atlas: PwAtlas, o: { hex: number }, variant = 0): PwTile {
  const W = 32;
  const H = 96;
  return atlas.tile(`d3vine|${h6(o.hex)}|${variant}`, W, H, (c, k) => {
    const g = k.ramp(o.hex, { light: 0.45, sat: 1.05 });
    const stem = k.ramp(0x4a4a2a, { light: 0.4 });
    for (let s = 0; s < 5; s++) {
      const x0 = 3 + s * 6 + Math.round(hash2(s, variant, 3) * 3);
      const len = Math.round(H * (0.45 + hash2(s, variant, 4) * 0.55));
      let x = x0;
      for (let y = 0; y < len; y++) {
        if (y % 7 === 3) x += hash2(s, y, variant) > 0.5 ? 1 : -1;
        c.set(x, y, stem, 2.4);
        if (y % 5 === 2 && y > 2) {
          const side = (y >> 2) & 1 ? 1 : -1;
          for (const [dx, dy, t] of [[side, 0, 3.4], [side * 2, 0, 3], [side, 1, 2.6], [side * 2, 1, 2.2], [side * 2, -1, 4], [side * 3, 0, 2.6]] as [number, number, number][]) c.set(x + dx, y + dy, g, side < 0 && t > 3 ? 4.2 : t);
        }
      }
    }
  });
}
