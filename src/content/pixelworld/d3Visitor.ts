import { bayer, PwCanvas, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, textWidth } from './font';
import { crack, hash2, smooth } from './surfaces';
import { d1Emblem } from './d1Tiles';

/**
 * TYRANT CHASE (d3) visitor centre for ART: PIXEL WORLD — the dark, storm-lashed
 * park lodge the raptors burst out of, painted like an arcade set piece:
 * rain-streaked ochre stucco, deep window reveals (dark glass mirroring the
 * storm, a couple still lit warm, one smashed), the tall atrium glass with a
 * rex skeleton looming inside under an emergency light, thatched pyramid roofs
 * with ragged straw eaves, fluted columns, a moulded portico, the VISITOR
 * CENTER marquee with half its bulbs dead, torn red banners with the park
 * emblem, heavy doors gouged by claws; outside: wet stone pavers with the park
 * emblem inlaid, a stone fountain, brick planters, the ticket kiosk.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Ochre stucco (wrap 64 × 64): trowelled patches, hairline cracks, damp stains, rain streaks. */
export function d3StuccoTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3stucco|${h6(o.hex)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.4, sat: 0.85 });
    c.rect(0, 0, 64, 64, s, (x, y) => {
      const n = smooth(x, y, 64, 64, 4, 3) * 0.7 + hash2(x >> 1, y >> 1, 4) * 0.3;
      return n > 0.68 ? 3.4 : n < 0.3 ? 2.6 : 3;
    });
    // Trowel arcs: short lit / dark crescents.
    for (let i = 0; i < 18; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      for (let j = 0; j < 6; j++) c.shift(wrap(x + j, 64), wrap(y + Math.round(Math.sin(j / 2) * 1.5), 64), j < 3 ? 0.6 : -0.5);
    }
    for (let i = 0; i < 4; i++) crack(c, rng, rng.int(0, 63), rng.int(0, 63), rng.int(8, 20), rng.next() * 6, { dt: -1.2, lip: 0.5, branch: 0.1 });
    for (let i = 0; i < 8; i++) c.streak(rng, rng.int(0, 63), rng.int(0, 63), rng.int(12, 34), -0.7, 0, rng.int(1, 2));
  }, { wrap: true });
}

export type WingWindow = 'dark' | 'lit' | 'broken' | 'flicker';

/**
 * A wing window with its surround (module 80 × 84 = 2.5 × 2.6 m; the 2 m opening
 * centred 0.15 m above the module's middle): a stucco lintel with a keystone, a
 * deep reveal (shadow top / left), a steel mullion cross, a stone sill with a
 * drip stain under it; glass by kind — dark (the storm sky in streaks), lit (a
 * warm room: a ceiling lamp, a fern, shelves of souvenirs), broken (a jagged
 * hole to the black interior, shards on the sill), flicker (cold strip light).
 */
export function d3WingWindowModule(atlas: PwAtlas, kind: WingWindow, o: { wall: number; stone: number; frame: number }): PwTile {
  const W = 80;
  const H = 84;
  return atlas.tile(`d3wingwin|${kind}|${h6(o.wall)}`, W, H, (c, k) => {
    const rng = k.rng;
    const wall = k.ramp(o.wall, { light: 0.4, sat: 0.85 });
    const stone = k.ramp(o.stone, { light: 0.4, sat: 0.8 });
    const fr = k.ramp(o.frame, { light: 0.5, sat: 0.6 });
    const glass = k.ramp(0x1a2840, { light: 0.55, sat: 0.9 });
    const warm = k.ramp(0xd8823a, { light: 0.5, sat: 1.0 });
    const cold = k.ramp(0x8aa8d8, { light: 0.5, sat: 0.7 });
    const ink = k.ramp(0x101014, { light: 0.4 });
    const leaf = k.ramp(0x2a4a28, { light: 0.45 });
    c.rect(0, 0, W, H, wall, 3);
    // Opening (64 × 64) with its reveal.
    const ox = 8;
    const oy = 9;
    const ow = 64;
    const oh = 64;
    // Lintel with a keystone.
    c.rect(ox - 4, oy - 7, ow + 8, 6, stone, 3);
    c.hline(ox - 4, oy - 7, ow + 8, stone, 4.2);
    c.hline(ox - 4, oy - 2, ow + 8, stone, 1.6);
    c.rect(W / 2 - 4, oy - 9, 8, 9, stone, 3.4);
    c.vline(W / 2 - 4, oy - 9, 9, stone, 4.2);
    c.vline(W / 2 + 3, oy - 9, 9, stone, 1.8);
    // Glass.
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const px = ox + x;
        const py = oy + y;
        if (kind === 'lit') {
          // The lamp's pool on the ceiling, falling off down the room (stepped).
          const d = Math.hypot((x - 30) / 34, (y - 6) / 40);
          c.set(px, py, warm, d < 0.35 ? 4.2 : d < 0.7 ? 3.4 : d < 1 ? 2.8 : 2.2, PWF.GLOW);
        } else if (kind === 'flicker') {
          c.set(px, py, cold, y < 6 ? 4 : y < 30 ? 3.2 : 2.6, PWF.GLOW);
        } else {
          // Storm sky in the glass: diagonal streaks, darker toward the bottom.
          const streak = (((x + y * 0.6) | 0) % 23) < 3;
          c.set(px, py, glass, streak ? 3.4 : y < oh * 0.4 ? 2.6 : 2);
        }
      }
    }
    if (kind === 'lit' || kind === 'flicker') {
      // Interior silhouettes in the glow: a hanging lamp, shelves, a fern in a pot.
      const sil = ink;
      c.vline(ox + 30, oy, 8, sil, 1);
      c.rect(ox + 26, oy + 8, 9, 3, sil, 1);
      for (const sy of [36, 46]) c.rect(ox + 2, oy + sy, 24, 2, sil, 1.2);
      for (let i = 0; i < 6; i++) c.rect(ox + 3 + i * 4, oy + 31 + (i % 2), 3, 5, sil, 1.6);
      c.rect(ox + 46, oy + 52, 8, 12, sil, 1);
      for (let f = 0; f < 7; f++) {
        const a = -Math.PI / 2 + (f - 3) * 0.45;
        for (let s = 0; s < 12; s++) c.set(ox + 50 + Math.round(Math.cos(a) * s), oy + 52 + Math.round(Math.sin(a) * s * 0.8 + (s * s) / 30), kind === 'lit' ? leaf : sil, 1.2);
      }
    }
    if (kind === 'broken') {
      // A jagged hole to the black interior, cracks radiating.
      const hx = ox + 22;
      const hy = oy + 20;
      for (let y = -14; y <= 14; y++) {
        for (let x = -16; x <= 16; x++) {
          const a = Math.atan2(y, x);
          const r = 11 + Math.sin(a * 5) * 4 + Math.sin(a * 11) * 2;
          if (Math.hypot(x, y) < r) c.set(hx + x, hy + y, ink, 0.6);
        }
      }
      for (let i = 0; i < 9; i++) {
        let a = (i / 9) * Math.PI * 2;
        let x = hx + Math.cos(a) * 13;
        let y = hy + Math.sin(a) * 12;
        for (let j = 0; j < 14; j++) {
          if (x < ox || x >= ox + ow || y < oy || y >= oy + oh) break;
          c.set(Math.round(x), Math.round(y), glass, 4.4);
          a += (hash2(i, j, 3) - 0.5) * 0.7;
          x += Math.cos(a);
          y += Math.sin(a);
        }
      }
    }
    // Reveal: the top / left inside edge in shadow, the bottom / right catching the light.
    c.rect(ox, oy, ow, 3, wall, 1.4);
    c.rect(ox, oy, 3, oh, wall, 1.8);
    c.rect(ox + ow - 2, oy, 2, oh, wall, 3.6);
    // Mullion cross.
    c.rect(ox + ow / 2 - 2, oy + 3, 4, oh - 3, fr, 3);
    c.vline(ox + ow / 2 - 2, oy + 3, oh - 3, fr, 4.2);
    c.rect(ox + 3, oy + oh / 2 - 2, ow - 3, 4, fr, 3);
    c.hline(ox + 3, oy + oh / 2 - 2, ow - 3, fr, 4.2);
    c.hline(ox + 3, oy + oh / 2 + 1, ow - 3, fr, 1.6);
    // Sill (stone, lit top, its shadow on the wall) and the drip stain under it.
    c.rect(ox - 4, oy + oh, ow + 8, 5, stone, 3);
    c.hline(ox - 4, oy + oh, ow + 8, stone, 4.4);
    c.hline(ox - 4, oy + oh + 5, ow + 8, wall, 1.6);
    for (let i = 0; i < 9; i++) c.streak(rng, ox + rng.int(0, ow), oy + oh + 6, rng.int(4, H - oy - oh - 6), -0.8, wall);
    if (kind === 'broken') for (let i = 0; i < 8; i++) c.set(ox + rng.int(4, ow - 4), oy + oh + 1, glass, 4.6);
  });
}

/**
 * The atrium's glass front (module 192 × 144 at 16 texels a metre = 12 × 9 m):
 * a steel grid of 6 × 4 panes, the storm mirrored in streaks; inside, the
 * lobby's rex skeleton rears in silhouette against a red emergency glow, a
 * PRIMAL ISLAND banner hangs; two panes high up still lit warm, a few cracked.
 */
export function d3AtriumModule(atlas: PwAtlas): PwTile {
  const W = 192;
  const H = 144;
  return atlas.tile(`d3atrium`, W, H, (c, k) => {
    const glass = k.ramp(0x1a2840, { light: 0.55, sat: 0.9 });
    const fr = k.ramp(0x2e2a24, { light: 0.55, sat: 0.6 });
    const red = k.ramp(0x8a1a14, { light: 0.5, sat: 1.0 });
    const bone = k.ramp(0x0c0e14, { light: 0.4 });
    const warm = k.ramp(0xffa848, { light: 0.55, sat: 1.0 });
    const ban = k.ramp(0xa81e1a, { light: 0.45 });
    const gold = k.ramp(0xe0b040, { light: 0.45 });
    // Interior: dark glass, a red emergency glow pooling bottom-left (dithered falloff).
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dr = Math.hypot((x - 60) / 90, (y - 140) / 80);
        const streak = (((x + y * 0.55) | 0) % 37) < 4;
        if (dr < 1 && bayer(x, y) > dr * 1.1) c.set(x, y, red, dr < 0.5 ? 2.6 : 2, PWF.GLOW);
        else c.set(x, y, glass, streak ? 3.2 : y < 50 ? 2.6 : 2);
      }
    }
    // The rex skeleton (silhouette): skull, jaws, spine arching, ribs, legs, the tail sweeping right.
    const sx = 70;
    const sy = 40;
    c.poly([sx - 30, sy - 6, sx - 8, sy - 14, sx + 2, sy - 8, sx - 4, sy + 2, sx - 26, sy + 4], bone, 1);
    c.poly([sx - 28, sy + 6, sx - 6, sy + 4, sx - 10, sy + 10], bone, 1);
    for (let i = 0; i < 9; i++) c.set(sx - 26 + i * 2, sy + 5, red, 3, PWF.GLOW);
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const x = sx + i * 1.6;
      const y = sy - 4 + Math.sin(t * Math.PI) * -14 + t * 40;
      c.rect(Math.round(x), Math.round(y), 2, 3, bone, 1);
      if (i > 8 && i < 34 && i % 3 === 0) for (let r = 0; r < 18 - Math.abs(i - 20); r++) c.set(Math.round(x - 1), Math.round(y + 3 + r), bone, 1);
    }
    for (const [lx, ly] of [[sx + 22, sy + 24], [sx + 40, sy + 26]]) {
      c.line(lx, ly, lx - 6, ly + 26, bone, 1);
      c.line(lx + 1, ly, lx - 5, ly + 26, bone, 1);
      c.line(lx - 6, ly + 26, lx + 2, ly + 52, bone, 1);
      c.line(lx - 5, ly + 26, lx + 3, ly + 52, bone, 1);
      c.hline(lx - 2, ly + 53, 10, bone, 1);
    }
    c.line(sx + 14, sy + 12, sx + 4, sy + 26, bone, 1);
    // Banner hanging inside.
    c.rect(150, 10, 26, 60, ban, 2.2);
    c.rect(158, 26, 10, 10, gold, 2.6);
    drawText(c, 'PI', 158, 42, FONT_3x5, gold, 2.6);
    // Two warm panes high up.
    for (const [px, py] of [[64, 4], [128, 40]]) c.rect(px + 2, py + 2, 28, 30, warm, 3.6, PWF.GLOW);
    // Steel grid: 6 × 4 panes.
    for (let i = 0; i <= 6; i++) {
      const x = Math.min(W - 2, Math.round((i * W) / 6));
      c.rect(x - 1, 0, 3, H, fr, 3);
      c.vline(x - 1, 0, H, fr, 4.2);
      c.vline(x + 1, 0, H, fr, 1.6);
    }
    for (let j = 0; j <= 4; j++) {
      const y = Math.min(H - 2, Math.round((j * H) / 4));
      c.rect(0, y - 1, W, 3, fr, 3);
      c.hline(0, y - 1, W, fr, 4.2);
      c.hline(0, y + 1, W, fr, 1.6);
    }
    // Cracked panes: star cracks.
    for (const [cx, cy] of [[110, 100], [20, 60], [176, 120]]) {
      for (let r = 0; r < 7; r++) {
        let a = (r / 7) * Math.PI * 2;
        let x = cx;
        let y = cy;
        for (let j = 0; j < 12; j++) {
          c.set(Math.round(x), Math.round(y), glass, 4.6);
          a += (hash2(cx, r * 13 + j, 5) - 0.5) * 0.6;
          x += Math.cos(a);
          y += Math.sin(a);
        }
      }
    }
  });
}

/** Thatch (wrap 64 × 64, courses along u): straw bundles in overlapping rows, each lit at its butt, shaded under; wet patches, moss. */
export function d3ThatchTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3thatch|${h6(o.hex)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const t = k.ramp(o.hex, { light: 0.45, sat: 0.95 });
    const moss = k.ramp(0x3f5a2e, { light: 0.42 });
    for (let y = 0; y < 64; y++) {
      const course = y % 8;
      for (let x = 0; x < 64; x++) {
        const straw = (x * 5 + (y >> 3) * 3) % 3;
        let tone = course === 7 ? 1.4 : course >= 5 ? 3.8 - straw * 0.4 : 3 - straw * 0.4;
        if (hash2(x, y >> 3, 9) > 0.9) tone -= 0.8;
        c.set(x, y, t, tone);
      }
    }
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (smooth(x, y, 64, 64, 4, 11) < 0.28) c.shift(x, y, -0.8);
    for (let i = 0; i < 10; i++) c.cluster(rng.int(0, 62), rng.int(0, 62), i, moss, 3);
  }, { wrap: true });
}

/** The ragged straw fringe hanging from an eave (wrap 64 × 16, cut out, u along the eave, v down from the edge at the top). */
export function d3FringeTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3fringe|${h6(o.hex)}`, 64, 16, (c, k) => {
    const t = k.ramp(o.hex, { light: 0.45, sat: 0.95 });
    for (let x = 0; x < 64; x++) {
      const len = 4 + Math.floor(hash2(x, 0, 21) * 6 + smooth(x, 0, 64, 4, 8, 22) * 6);
      for (let y = 0; y < Math.min(16, len); y++) c.set(x, y, t, y === 0 ? 1.6 : y === len - 1 ? 3.8 : x % 3 === 0 ? 2.2 : 3);
    }
  }, { wrap: true });
}

/** Fluted stone column (wrap 32 × 64, u round it): flutes lit / shaded, mortar joints every metre, stains. */
export function d3ColumnTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3column|${h6(o.hex)}`, 32, 64, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.4, sat: 0.8 });
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 32; x++) {
        const f = x % 4;
        c.set(x, y, s, y % 32 === 0 ? 1.6 : f === 0 ? 1.8 : f === 1 ? 3.8 : f === 2 ? 3.2 : 2.6);
      }
    }
    for (let i = 0; i < 6; i++) c.streak(rng, rng.int(0, 31), rng.int(0, 63), rng.int(10, 30), -0.7, 0);
    for (let i = 0; i < 8; i++) c.cluster(rng.int(0, 31), rng.int(0, 63), i, 0, -0.9);
  }, { wrap: true });
}

/** Portico fascia (wrap 64 × 32 = 2 × 1 m): a moulded cornice over a dentil course and a frieze, drip-stained. */
export function d3FasciaTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3fascia|${h6(o.hex)}`, 64, 32, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.4, sat: 0.85 });
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 64; x++) {
        let t = 3;
        if (y < 4) t = y === 0 ? 4.2 : y === 3 ? 1.4 : 3.4;
        else if (y < 9) t = x % 6 < 3 ? (x % 6 === 0 ? 3.8 : 3.2) : 1.2;
        else if (y === 9) t = 1.6;
        else if (y === 10) t = 3.8;
        else if (y > 28) t = y === 29 ? 1.6 : 2.6;
        c.set(x, y, s, t);
      }
    }
    for (let i = 0; i < 10; i++) c.streak(rng, rng.int(0, 63), 11, rng.int(6, 18), -0.9, 0, rng.int(1, 2));
  }, { wrap: true });
}

/**
 * VISITOR CENTER marquee (module 416 × 45 = 13 × 1.4 m): a dark riveted board,
 * the letters made of bulbs (each a glowing 3 × 3 with a hot centre; dead ones
 * dark sockets), a bulb border, rust bleeding from the rivets.
 */
export function d3MarqueeModule(atlas: PwAtlas, text: string): PwTile {
  const W = 416;
  const H = 45;
  return atlas.tile(`d3marquee|${text}`, W, H, (c, k) => {
    const rng = k.rng;
    const board = k.ramp(0x2e261c, { light: 0.5, sat: 0.7 });
    const bulb = k.ramp(0xffd8a0, { light: 0.55, sat: 0.9 });
    const sock = k.ramp(0x4a4034, { light: 0.45 });
    const rust = k.ramp(0x6a3218, { light: 0.4 });
    c.rect(0, 0, W, H, board, 2.4);
    c.hline(0, 0, W, board, 4);
    c.hline(0, H - 1, W, board, 0.8);
    c.frame(2, 2, W - 4, H - 4, board, 3.4);
    const S = 4;
    const tw = textWidth(text, FONT_5x7) * S;
    const x0 = Math.round((W - tw) / 2);
    const y0 = Math.round((H - 7 * S) / 2);
    // Rasterise the text once at scale 1 (a scratch canvas), then a bulb per glyph texel.
    const scratch = new PwCanvas(textWidth(text, FONT_5x7) + 1, 8);
    drawText(scratch, text, 0, 0, FONT_5x7, 1, 3);
    const mask: number[][] = [];
    for (let y = 0; y < scratch.h; y++) for (let x = 0; x < scratch.w; x++) if (scratch.at(x, y)) mask.push([x, y]);
    let n = 0;
    for (const [gx, gy] of mask) {
      const bx = x0 + gx * S;
      const by = y0 + gy * S;
      const dead = (n++ * 37 + gx * 7) % 13 < 2;
      if (dead) {
        c.rect(bx, by, 3, 3, sock, 1.6);
        c.set(bx, by, sock, 3.4);
        continue;
      }
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) c.set(bx + x, by + y, bulb, x === 1 && y === 1 ? 5 : x === 1 || y === 1 ? 4 : 3, PWF.GLOW);
    }
    // Border bulbs (most dead).
    for (let x = 6; x < W - 6; x += 8) {
      for (const y of [5, H - 7]) {
        const on = hash2(x, y, 3) > 0.62;
        c.rect(x, y, 2, 2, on ? bulb : sock, on ? 4 : 1.8, on ? PWF.GLOW : 0);
      }
    }
    // Rivets with rust runs.
    for (let x = 12; x < W; x += 40) {
      for (const y of [3, H - 4]) {
        c.set(x, y, board, 4.4);
        for (let j = 1; j < rng.int(3, 9); j++) c.tint(x, y + j, rust, 0);
      }
    }
  });
}

/** A torn park banner (module 64 × len·32, cut out): red cloth in folds, the gold diamond and emblem, a ragged torn foot, rain-dark streaks. */
export function d3BannerModule(atlas: PwAtlas, lenM: number): PwTile {
  const W = 64;
  const H = Math.round(lenM * 32);
  return atlas.tile(`d3banner|${H}`, W, H, (c, k) => {
    const rng = k.rng;
    const red = k.ramp(0xa81e1a, { light: 0.45, sat: 1.0 });
    const gold = k.ramp(0xe0b040, { light: 0.45, sat: 1.0 });
    const foot = new Int16Array(W);
    for (let x = 0; x < W; x++) foot[x] = H - 1 - Math.round(hash2(x >> 2, 1, H) * 14 + (x > W * 0.6 ? 10 : 0) * smooth(x, 0, W, 8, 3, 2));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (y > foot[x]) continue;
        const fold = Math.sin((x / W) * Math.PI * 3);
        c.set(x, y, red, y < 3 ? 1.6 : fold > 0.55 ? 3.6 : fold < -0.55 ? 2.2 : 3);
      }
    }
    // Pole sleeve at the top.
    c.rect(0, 0, W, 3, red, 1.4);
    c.hline(0, 3, W, red, 3.8);
    // The gold diamond with the emblem (1.6 m down).
    const cy = Math.min(H - 20, 51);
    for (let y = -16; y <= 16; y++) for (let x = -16; x <= 16; x++) if (Math.abs(x) + Math.abs(y) <= 16) c.set(32 + x, cy + y, gold, Math.abs(x) + Math.abs(y) > 14 ? 1.8 : x + y < 0 ? 3.8 : 3.2);
    d1Emblem(c, k, 32, cy, 9);
    for (let i = 0; i < 8; i++) c.streak(rng, rng.int(0, W - 1), rng.int(4, H - 10), rng.int(8, 30), -0.8, red);
  });
}

/** A heavy lodge door leaf (module 72 × 156 = 2.25 × 4.9 m): planked timber, an inset glass panel, a brass push plate, claw gouges. */
export function d3LodgeDoorModule(atlas: PwAtlas): PwTile {
  const W = 72;
  const H = 156;
  return atlas.tile(`d3lodgedoor`, W, H, (c, k) => {
    const rng = k.rng;
    const wood = k.ramp(0x5e3e26, { light: 0.42 });
    const glass = k.ramp(0x26364e, { light: 0.5, sat: 0.9 });
    const brass = k.ramp(0xc0a050, { light: 0.5 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, wood, x % 12 === 0 ? 1.4 : x % 12 === 1 ? 3.8 : hash2(x >> 2, y >> 3, 3) > 0.85 ? 2.4 : 3);
    c.frame(0, 0, W, H, wood, 1.8);
    // Inset glass (upper part) with a muntin and a storm streak.
    c.rect(13, 14, 46, 64, wood, 1.4);
    for (let y = 16; y < 76; y++) for (let x = 15; x < 57; x++) c.set(x, y, glass, (((x + y) | 0) % 19) < 3 ? 3.4 : y < 40 ? 2.6 : 2);
    c.vline(35, 16, 60, wood, 3);
    c.hline(15, 46, 42, wood, 3);
    // Push plate + kick plate.
    c.rect(56, 86, 8, 22, brass, 3.4);
    c.vline(56, 86, 22, brass, 4.6);
    c.rect(4, H - 16, W - 8, 10, brass, 2.6);
    c.hline(4, H - 16, W - 8, brass, 4);
    // Claw gouges (three, raked down).
    for (let g = 0; g < 3; g++) {
      for (let s = 0; s < 36; s++) {
        const x = 18 + g * 6 + Math.round(s * 0.35);
        const y = 92 + s;
        c.set(x, y, wood, 0.6);
        c.set(x + 1, y, wood, 4.4);
      }
    }
    for (let i = 0; i < 12; i++) c.streak(rng, rng.int(2, W - 3), rng.int(2, H - 30), rng.int(8, 24), -0.6, wood);
  });
}

/** The dark lobby behind the doorway (module 80 × 84 at 16 texels a metre = 5 × 5.25 m): a red emergency light, an EXIT sign, debris. */
export function d3LobbyModule(atlas: PwAtlas): PwTile {
  const W = 80;
  const H = 84;
  return atlas.tile(`d3lobby`, W, H, (c, k) => {
    const dark = k.ramp(0x0e1016, { light: 0.4 });
    const red = k.ramp(0x8a1a14, { light: 0.5 });
    const exit = k.ramp(0x30d050, { light: 0.5 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - 60) / 40, (y - 10) / 50);
      c.set(x, y, d < 1 && bayer(x, y) > d ? red : dark, d < 1 ? 2 : y > 70 ? 2 : 1.4, d < 1 && bayer(x, y) > d ? PWF.GLOW : 0);
    }
    c.rect(54, 4, 14, 6, exit, 3.6, PWF.GLOW);
    drawText(c, 'EXIT', 55, 5, FONT_3x5, dark, 1);
    c.hline(0, 70, W, dark, 2.6);
  });
}

/** Wet stone pavers (wrap 64 × 64, 0.5 m slabs): per-slab tones, dark joints with moss, chips, a lit edge, sky glints. */
export function d3PaverTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3paver|${h6(o.hex)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.4, sat: 0.8 });
    const moss = k.ramp(0x34492d, { light: 0.42 });
    const sky = k.ramp(0x5a6a90, { light: 0.4 });
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const by = y >> 4;
        const ly = y & 15;
        // Running bond: every other course shifted half a slab.
        const bx2 = ((x + (by & 1) * 8) >> 4) & 3;
        const lx2 = (x + (by & 1) * 8) & 15;
        const tone = hash2(bx2, by, 2) > 0.7 ? 3.2 : hash2(bx2, by, 3) > 0.75 ? 2.8 : 3;
        if (lx2 === 0 || ly === 0) c.set(x, y, hash2(x, y, 4) > 0.7 ? moss : s, 1.8);
        else if (ly === 1) c.set(x, y, s, tone + 0.5);
        else if (lx2 === 15 || ly === 15) c.set(x, y, s, tone - 0.4);
        else c.set(x, y, s, tone);
      }
    }
    for (let i = 0; i < 20; i++) c.cluster(rng.int(0, 63), rng.int(0, 63), i, 0, -0.8);
    for (let i = 0; i < 10; i++) {
      const x = rng.int(2, 60);
      const y = rng.int(2, 62);
      for (let j = 0; j < rng.int(2, 5); j++) c.set(x + j, y, sky, 2.6);
    }
    for (let i = 0; i < 3; i++) crack(c, rng, rng.int(0, 63), rng.int(0, 63), rng.int(6, 14), rng.next() * 6, { dt: -1.2, lip: 0.5 });
  }, { wrap: true });
}

/**
 * A mosaic inlaid in the paving (module 96 × 96 at 16 texels a metre = 6 m): rings
 * of dark and rust tesserae round a compass star, three claw slashes across it
 * (the park's raptor mark) in ochre — muted stone colours, worn, wet.
 */
export function d3MosaicModule(atlas: PwAtlas): PwTile {
  return atlas.tile(`d3mosaic|2`, 96, 96, (c, k) => {
    const dark = k.ramp(0x3a3832, { light: 0.4, sat: 0.8 });
    const rust = k.ramp(0x6a3a2a, { light: 0.42, sat: 0.85 });
    const ochre = k.ramp(0x8a7040, { light: 0.42, sat: 0.85 });
    const pale = k.ramp(0x8a867c, { light: 0.4, sat: 0.7 });
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        const dx = x + 0.5 - 48;
        const dy = y + 0.5 - 48;
        const d = Math.hypot(dx, dy);
        if (d > 47.5) continue;
        const a = Math.atan2(dy, dx);
        // Tesserae: a 3-texel grid, each a step lighter or darker.
        const tv = hash2(x / 3 | 0, y / 3 | 0, 7) > 0.5 ? 0.3 : -0.2;
        const joint = x % 3 === 0 || y % 3 === 0 ? -0.6 : 0;
        let r = pale;
        if (d > 43) r = dark;
        else if (d > 39) r = rust;
        else if (d > 37) r = dark;
        else {
          // Eight-point star.
          const star = Math.abs(Math.cos(a * 4)) * 20 + 12;
          if (d < star) r = (Math.floor((a + Math.PI) / (Math.PI / 4)) & 1) ? rust : dark;
        }
        c.set(x, y, r, 3 + tv + joint);
      }
    }
    // Three claw slashes across the star.
    for (let g = 0; g < 3; g++) {
      for (let s2 = 0; s2 < 52; s2++) {
        const x = 26 + g * 9 + Math.round(s2 * 0.5);
        const y = 22 + s2;
        const w = s2 < 6 || s2 > 46 ? 1 : 2;
        for (let j = 0; j < w + 1; j++) c.set(x + j, y, ochre, j === 0 ? 3.6 : 3);
      }
    }
    c.scatter(k.rng, 8, 8, 80, 80, 40, 0, -1, { shapes: 4 });
  });
}

/** Small brick (wrap 32 × 32): 4 × 8 texel bricks in bond, dark mortar, a chipped one, moss. */
export function d3BrickTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3brick|${h6(o.hex)}`, 32, 32, (c, k) => {
    const b = k.ramp(o.hex, { light: 0.42, sat: 0.95 });
    const m = k.ramp(0x4a4038, { light: 0.4 });
    const moss = k.ramp(0x3f5a2e, { light: 0.42 });
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const row = y >> 2;
      const lx = (x + (row & 1) * 4) & 7;
      if ((y & 3) === 3 || lx === 7) c.set(x, y, m, 2);
      else c.set(x, y, b, (y & 3) === 0 ? 3.6 : hash2((x + (row & 1) * 4) >> 3, row, 3) > 0.7 ? 2.6 : 3);
    }
    c.scatter(k.rng, 0, 0, 32, 32, 6, moss, 3, { shapes: 5 });
  }, { wrap: true });
}

/** The ticket kiosk's window (module 52 × 26 = 1.6 × 0.8 m): a warm-lit hatch, a TICKETS board over it, a clerk's empty stool, a price list. */
export function d3KioskWindowModule(atlas: PwAtlas): PwTile {
  const W = 52;
  const H = 26;
  return atlas.tile(`d3kioskwin`, W, H, (c, k) => {
    const warm = k.ramp(0xffc070, { light: 0.55 });
    const ink = k.ramp(0x2a1c10, { light: 0.4 });
    const board = k.ramp(0x2f5a2a, { light: 0.45 });
    const cream = k.ramp(0xe8d8a0, { light: 0.4 });
    c.rect(0, 0, W, 8, board, 3);
    const tw = textWidth('TICKETS', FONT_3x5);
    drawText(c, 'TICKETS', Math.round((W - tw) / 2), 1, FONT_3x5, cream, 3.6);
    c.rect(0, 8, W, H - 8, warm, 3.6, PWF.GLOW);
    c.rect(4, 10, 12, 10, cream, 3, PWF.GLOW);
    for (let y = 12; y < 19; y += 2) c.hline(5, y, 9, ink, 1, PWF.GLOW);
    c.rect(30, 16, 6, 2, ink, 1, PWF.GLOW);
    c.vline(31, 18, 8, ink, 1, PWF.GLOW);
    c.vline(35, 18, 8, ink, 1, PWF.GLOW);
    c.hline(0, 8, W, ink, 1);
    c.frame(0, 0, W, H, ink, 1.4);
  });
}

/** A floodlight head (module 64 × 26 = 2 × 0.8 m): a steel housing with three dead lamps behind cracked glass. */
export function d3FloodheadModule(atlas: PwAtlas, lit: boolean): PwTile {
  const W = 64;
  const H = 26;
  return atlas.tile(`d3flood|${lit ? 1 : 0}`, W, H, (c, k) => {
    const st = k.ramp(0x2a2c30, { light: 0.5, sat: 0.6 });
    const lamp = k.ramp(lit ? 0xf0f4ff : 0x4a4e58, { light: 0.5 });
    c.rect(0, 0, W, H, st, 2.6);
    c.hline(0, 0, W, st, 4);
    c.hline(0, H - 1, W, st, 1);
    for (const x0 of [4, 24, 44]) {
      c.rect(x0, 5, 16, 16, st, 1.2);
      c.ellipse(x0 + 8, 13, 6.5, 6.5, lamp, (u, v) => (lit ? (u * u + v * v < 0.3 ? 5 : 4) : u + v < -0.6 ? 3.6 : 2.2), lit ? PWF.GLOW : 0);
      if (!lit) c.line(x0 + 4, 8, x0 + 11, 17, lamp, 4.4);
    }
  });
}

