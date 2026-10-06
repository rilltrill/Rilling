import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD, FONT_TALL, textWidth } from './font';
import { darken, hash2, smooth } from './surfaces';

/**
 * MAIN STREET facade extras for ART: PIXEL WORLD — what breaks the box
 * silhouettes and the blank walls:
 *  - `z1StringCourse` / `z1Coping`: stone bands between floors and the coping
 *    on top of a parapet (wrap along u);
 *  - `z1Pediment`: cut-out parapet crowns over the cornice (stepped gable with
 *    a datestone, a segmental arch with the building's name, a balustrade),
 *    so the roofline seen down the street is jagged, not a straight box edge;
 *  - roof clutter as cut-out pixel planes (chimney pots, TV aerials, vent
 *    cowls), laid as crossed quads so they read from the street and from
 *    along it;
 *  - fire escapes as cut-out ironwork (railing, slatted platform, stair run,
 *    drop ladder) instead of stacks of thin boxes;
 *  - `z1GhostSign`: faded painted advertisements on the exposed side walls
 *    (paint flaked off in clusters, the brick showing through).
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** Stone string course between floors (wrap, 64 × 16; the band is the bottom 8 rows = 0.25 m): lit drip edge, shadow below. */
export function z1StringCourse(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(
    `z1course|${h6(hex)}`,
    64,
    16,
    (c, k) => {
      const s = k.ramp(hex, { light: 0.45, sat: 0.75 });
      const y0 = 8;
      c.rect(0, y0, c.w, 8, s, 3);
      c.hline(0, y0, c.w, s, 4);
      c.hline(0, y0 + 1, c.w, s, 4);
      c.hline(0, y0 + 5, c.w, s, 2);
      c.hline(0, y0 + 6, c.w, s, 1);
      c.hline(0, y0 + 7, c.w, s, 0);
      for (let x = 0; x < c.w; x += 32) c.vline(x, y0 + 1, 5, s, 1);
      c.scatter(k.rng, 0, y0 + 2, c.w, 3, 6, 0, -1, { shapes: 3 });
    },
    { wrap: true },
  );
}

/** Parapet coping (wrap, 64 × 16; the stones are the bottom 8 rows): rounded stones on top, a drip shadow under them. */
export function z1Coping(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(
    `z1coping|${h6(hex)}`,
    64,
    16,
    (c, k) => {
      const s = k.ramp(hex, { light: 0.45, sat: 0.75 });
      for (let x = 0; x < c.w; x++) {
        const lx = x % 16;
        const top = 8 + (lx === 0 ? 2 : 1);
        for (let y = top; y < c.h; y++) {
          const t = y === top ? 4 : y < 12 ? 3 : y === 12 ? 2 : y === 13 ? 1 : 0;
          c.set(x, y, s, lx === 0 && y < 13 ? 1 : t);
        }
      }
    },
    { wrap: true },
  );
}

export type PedimentKind = 'stepped' | 'arch' | 'panel' | 'balustrade';

/**
 * A cut-out parapet crown laid over the cornice (128 × 48 = 4 × 1.5 m): brick
 * or plaster in the wall's own (neutral, tinted) colour, stone coping, and a
 * datestone / name panel. `text` is painted in raised capitals.
 */
export function z1Pediment(atlas: PwAtlas, kind: PedimentKind, text: string, o: { wall: 'brick' | 'plaster'; stone: number }): PwTile {
  return atlas.tile(`z1pedi|${kind}|${text}|${o.wall}|${h6(o.stone)}`, 128, 48, (c, k) => paintPediment(c, k, kind, text, o));
}

function paintPediment(c: PwCanvas, k: PwKit, kind: PedimentKind, text: string, o: { wall: 'brick' | 'plaster'; stone: number }) {
  const W = c.w;
  const H = c.h;
  // The wall: neutral (tinted per building like its facade) brick courses or plaster.
  const wall = k.ramp(o.wall === 'brick' ? 0xd8a890 : 0xd8d8d8, { light: 0.4 });
  const mortar = k.ramp(o.wall === 'brick' ? 0x9a8a80 : 0xb8b8b8, { light: 0.32, sat: 0.7 });
  const stone = k.ramp(o.stone, { light: 0.45, sat: 0.75 });
  // Outline of the crown (top edge y as a function of x).
  const topAt = (x: number): number => {
    const cx = W / 2;
    const d = Math.abs(x + 0.5 - cx);
    if (kind === 'stepped') return d < 18 ? 2 : d < 34 ? 12 : d < 50 ? 22 : 32;
    if (kind === 'arch') return Math.round(4 + (d / (W / 2)) ** 2 * 28);
    if (kind === 'panel') return d < 30 ? 6 : 30;
    return 26; // balustrade: low, the balusters stand on it
  };
  for (let x = 0; x < W; x++) {
    const t0 = topAt(x);
    for (let y = t0; y < H; y++) {
      if (o.wall === 'brick') {
        const row = (y - H) & 3;
        const joint = row === 0 || ((x + (((y >> 2) & 1) ? 5 : 0)) % 11 === 0);
        c.set(x, y, joint ? mortar : wall, joint ? 2 : hash2(x / 11 | 0, y >> 2, 7) > 0.8 ? 2 : 3);
      } else c.set(x, y, wall, 3);
    }
    // Coping along the crown's top edge (and down its steps): lit top, dark drip under it.
    c.set(x, t0, stone, 4);
    c.set(x, t0 + 1, stone, 3);
    c.set(x, t0 + 2, stone, 2);
    c.set(x, t0 + 3, wall, 1);
  }
  // Vertical risers of the steps get stone too.
  for (let x = 1; x < W; x++) {
    const a = topAt(x - 1);
    const b = topAt(x);
    if (a === b) continue;
    const xs = a > b ? x : x - 1;
    for (let y = Math.min(a, b); y <= Math.max(a, b) + 2; y++) c.set(xs, y, stone, a > b ? 4 : 2);
  }
  if (kind === 'balustrade') {
    // Balusters between a top rail and the plinth, cut out between them.
    c.rect(0, 10, W, 3, stone, 3);
    c.hline(0, 10, W, stone, 4);
    for (let x = 2; x < W - 2; x += 6) {
      for (let y = 13; y < 26; y++) {
        const bw = y < 16 || y > 22 ? 2 : 3;
        for (let j = 0; j < bw; j++) c.set(x + j, y, stone, j === 0 ? 4 : j === bw - 1 ? 2 : 3);
      }
    }
    // Posts at the ends and the middle.
    for (const px of [0, W / 2 - 3, W - 6]) {
      c.rect(px, 6, 6, 20, stone, 3);
      c.vline(px, 6, 20, stone, 4);
      c.vline(px + 5, 6, 20, stone, 2);
      c.hline(px, 6, 6, stone, 4);
    }
  }
  // Datestone / name panel: a raised stone tablet with the text in raised caps.
  if (text) {
    const f = text.length <= 4 ? FONT_BOLD : FONT_5x7;
    const tw = textWidth(text, f);
    const pw = Math.min(W - 8, tw + 10);
    const ph = 13;
    const px = Math.round((W - pw) / 2);
    const py = kind === 'balustrade' ? 30 : kind === 'arch' ? 16 : kind === 'stepped' ? 18 : 14;
    c.rect(px, py, pw, ph, stone, 3);
    c.hline(px, py, pw, stone, 4);
    c.vline(px, py, ph, stone, 4);
    c.hline(px, py + ph - 1, pw, stone, 1);
    c.vline(px + pw - 1, py, ph, stone, 1);
    drawText(c, text, px + Math.round((pw - tw) / 2), py + 3, f, stone, 2, { shadow: { ramp: stone, tone: 4 }, shadowD: -1 });
  }
  // Weathering: drip stains from the coping.
  for (let i = 0; i < 10; i++) {
    const x = k.rng.int(2, W - 3);
    const y0 = topAt(x) + 4;
    const len = k.rng.int(3, 9);
    for (let j = 0; j < len; j++) if (j < len * 0.6 || hash2(x, j, 3) > j / len) c.shift(x, y0 + j, -1);
  }
}

/** Chimney pots on a stack (cut-out, 32 × 24): two clay pots, a cowl, soot. Laid as crossed quads on a brick stack. */
export function z1ChimneyPots(atlas: PwAtlas): PwTile {
  return atlas.tile('z1pots', 32, 24, (c, k) => {
    const clay = k.ramp(0x9a5a3a, { light: 0.4 });
    const soot = k.ramp(0x1c1a1c, { light: 0.4 });
    const stone = k.ramp(0x7a766e, { light: 0.4 });
    // Stack cap.
    c.rect(0, 18, 32, 6, stone, 3);
    c.hline(0, 18, 32, stone, 4);
    c.hline(0, 23, 32, stone, 1);
    for (const [x, h] of [
      [5, 14],
      [18, 10],
    ] as const) {
      for (let y = 18 - h; y < 18; y++) {
        const w = y < 18 - h + 2 ? 8 : 6;
        const x0 = x + (8 - w) / 2;
        for (let j = 0; j < w; j++) c.set(x0 + j, y, clay, j === 0 ? 4 : j === w - 1 ? 1 : 3);
      }
      c.hline(x, 18 - h, 8, soot, 1);
    }
    // A bent tin cowl on the short pot.
    c.rect(17, 4, 10, 3, stone, 2);
    c.hline(17, 4, 10, stone, 4);
  });
}

/** A rooftop TV aerial (cut-out, 48 × 64): mast, guy wires, a fishbone of elements. */
export function z1Aerial(atlas: PwAtlas): PwTile {
  return atlas.tile('z1aerial', 48, 64, (c, k) => {
    const m = k.ramp(0x6a6e76, { light: 0.5, sat: 0.6 });
    c.vline(24, 6, 58, m, 3);
    c.vline(25, 6, 58, m, 1);
    for (let i = 0; i < 6; i++) {
      const y = 8 + i * 4;
      const hw = 18 - i * 2;
      c.hline(24 - hw, y, hw * 2 + 2, m, 3);
    }
    c.hline(10, 34, 30, m, 2);
    // Guy wires to the roof.
    c.line(24, 30, 2, 63, m, 1);
    c.line(25, 30, 46, 63, m, 1);
  });
}

/** A mushroom vent cowl on a short pipe (cut-out, 16 × 24). */
export function z1Vent(atlas: PwAtlas): PwTile {
  return atlas.tile('z1vent', 16, 24, (c, k) => {
    const m = k.ramp(0x8a8e94, { light: 0.5, sat: 0.6 });
    const rust = k.ramp(0x7a4024, { light: 0.4 });
    c.rect(5, 8, 6, 16, m, 3);
    c.vline(5, 8, 16, m, 4);
    c.vline(10, 8, 16, m, 1);
    c.rect(1, 4, 14, 4, m, 3);
    c.hline(1, 4, 14, m, 4);
    c.hline(1, 7, 14, m, 1);
    c.rect(4, 1, 8, 3, m, 4);
    for (let j = 0; j < 6; j++) c.set(9, 9 + j * 2, rust, 2);
  });
}

// ─── Fire escapes (cut-out ironwork) ───────────────────────────────────────

/** Fire-escape railing (wrap, 32 × 32 = 1 m): top rail, balusters every 4 texels, a kick rail, rust runs. */
export function z1FeRail(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(
    `z1ferail|${h6(hex)}`,
    32,
    32,
    (c, k) => {
      const m = k.ramp(hex, { light: 0.45, sat: 0.8 });
      const rust = k.ramp(0x7a4024, { light: 0.4 });
      c.rect(0, 0, c.w, 2, m, 3);
      c.hline(0, 0, c.w, m, 4);
      c.rect(0, 26, c.w, 2, m, 3);
      c.hline(0, 26, c.w, m, 4);
      for (let x = 1; x < c.w; x += 4) c.vline(x, 2, 24, m, x % 8 === 1 ? 3 : 2);
      // Slatted platform edge seen at the bottom.
      c.rect(0, 28, c.w, 4, m, 2);
      c.hline(0, 28, c.w, m, 4);
      c.hline(0, 31, c.w, m, 0);
      for (let i = 0; i < 5; i++) {
        const x = k.rng.int(0, c.w - 1);
        for (let j = 0; j < 4; j++) if (c.at(x, 28 + j)) c.tint(x, 28 + j, rust, 0);
      }
    },
    { wrap: true },
  );
}

/** Fire-escape platform slats seen from below (wrap, 32 × 32, cut out between the slats). */
export function z1FeFloor(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(
    `z1fefloor|${h6(hex)}`,
    32,
    32,
    (c, k) => {
      const m = k.ramp(hex, { light: 0.45, sat: 0.8 });
      for (let y = 0; y < c.h; y += 4) {
        c.hline(0, y, c.w, m, 2);
        c.hline(0, y + 1, c.w, m, 1);
      }
      c.vline(0, 0, c.h, m, 3);
      c.vline(16, 0, c.h, m, 1);
    },
    { wrap: true },
  );
}

/** A stair run between two platforms (module, cut-out, 72 × 104 = 2.25 × 3.25 m): stringers, treads, the handrail. */
export function z1FeStair(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z1festair|${h6(hex)}`, 72, 104, (c, k) => {
    const m = k.ramp(hex, { light: 0.45, sat: 0.8 });
    const W = c.w;
    const H = c.h;
    // Stringer from the lower left up to the upper right.
    for (let x = 0; x < W; x++) {
      const y = Math.round(H - 4 - (x / W) * (H - 8));
      c.set(x, y, m, 3);
      c.set(x, y + 1, m, 3);
      c.set(x, y + 2, m, 1);
      // Handrail 1 m above.
      c.set(x, y - 30, m, 4);
      c.set(x, y - 29, m, 2);
      if (x % 12 === 2) c.vline(x, y - 29, 29, m, 2);
    }
    // Treads every ~6 texels along the run (seen edge-on: lit nosing).
    for (let x = 3; x < W; x += 6) {
      const y = Math.round(H - 4 - (x / W) * (H - 8));
      c.hline(x - 3, y - 1, 6, m, 4);
    }
  });
}

/** Drop ladder (wrap along v, 16 × 32): two rails, rungs every 6 texels. */
export function z1FeLadder(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(
    `z1feladder|${h6(hex)}`,
    16,
    32,
    (c, k) => {
      const m = k.ramp(hex, { light: 0.45, sat: 0.8 });
      c.vline(1, 0, c.h, m, 4);
      c.vline(2, 0, c.h, m, 2);
      c.vline(13, 0, c.h, m, 3);
      c.vline(14, 0, c.h, m, 1);
      for (let y = 2; y < c.h; y += 6) c.hline(3, y, 10, m, 3);
    },
    { wrap: true },
  );
}

// ─── Ghost signs ────────────────────────────────────────────────────────────

const GHOSTS = [
  { lines: ['DR. KELSO\'S', 'TONIC', 'CURES ALL ILLS'], ground: 0x2a3a6a, ink: 0xe8dcb0, accent: 0xc83a2a },
  { lines: ['MAYFLOWER', 'FLOUR', 'BAKES BETTER'], ground: 0x8a2a24, ink: 0xe8dcb0, accent: 0xe0b040 },
  { lines: ['STAR', 'LAUNDRY', 'WE NEVER CLOSE'], ground: 0x2a5a3a, ink: 0xe8e0c8, accent: 0xe8c040 },
];

/**
 * A faded painted advertisement on a side wall (cut-out decal, 192 × 96 = 6 ×
 * 3 m): ground colour, border, big tall letters, a slogan — flaked off in
 * clusters so the wall shows through, the paint a step dimmer for the years.
 */
export function z1GhostSign(atlas: PwAtlas, v: number): PwTile {
  const g = GHOSTS[((v % GHOSTS.length) + GHOSTS.length) % GHOSTS.length];
  return atlas.tile(`z1ghost|${g.lines[0]}`, 192, 96, (c, k) => {
    const W = c.w;
    const H = c.h;
    const ground = k.ramp(g.ground, { light: 0.35, sat: 0.6 });
    const ink = k.ramp(g.ink, { light: 0.3, sat: 0.6 });
    const acc = k.ramp(g.accent, { light: 0.3, sat: 0.6 });
    c.rect(0, 0, W, H, ground, 2);
    c.frame(3, 3, W - 6, H - 6, ink, 2);
    c.frame(5, 5, W - 10, H - 10, acc, 2);
    const [l1, l2, l3] = g.lines;
    const w1 = textWidth(l1, FONT_BOLD, { scale: 2 });
    drawText(c, l1, Math.round((W - w1) / 2), 10, FONT_BOLD, ink, 3, { scale: 2 });
    const w2 = textWidth(l2, FONT_TALL, { scale: 2 });
    drawText(c, l2, Math.round((W - w2) / 2), 30, FONT_TALL, acc, 3, { scale: 2, shadow: { ramp: ground, tone: 0 } });
    const w3 = textWidth(l3, FONT_5x7);
    drawText(c, l3, Math.round((W - w3) / 2), H - 18, FONT_5x7, ink, 3);
    // Years of weather: flaked paint (cut out in clusters), streaks washing down.
    const R = c.ramp;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Flaked in patches (worst near the foot and the edges), ragged at 2-texel grain.
        const edge = Math.min(x, W - 1 - x, y, H - 1 - y) < 6 ? 0.12 : 0;
        const n = smooth(x, y, W, H, 8, 31 + v) * 0.75 + hash2(x >> 1, y >> 1, 33 + v) * 0.25 + (y / H) * 0.12 + edge;
        if (n > 0.74) R[y * W + x] = 0;
      }
    }
    for (let i = 0; i < 24; i++) {
      const x = k.rng.int(0, W - 1);
      const y0 = k.rng.int(0, H >> 1);
      for (let j = 0; j < k.rng.int(8, 30); j++) c.shift(x, y0 + j, -1);
    }
    void FONT_3x5;
    void PWF;
    void darken;
  });
}

// ─── Rooftop billboard ──────────────────────────────────────────────────────

/**
 * A rooftop billboard advertisement (module, 192 × 96 = 6 × 3 m) — painted
 * like a 50s poster: a sunburst, a giant cola bottle, the slogan in fat
 * letters, the paper sheets' seams, a strip torn away, rust runs from the frame.
 */
export function z1Billboard(atlas: PwAtlas): PwTile {
  return atlas.tile('z1billboard', 192, 96, (c, k) => {
    const W = c.w;
    const H = c.h;
    const sky = k.ramp(0x3a8ac8, { light: 0.4, sat: 0.8 });
    const sun = k.ramp(0xe8c040, { light: 0.4 });
    const red = k.ramp(0xc8302a, { light: 0.45 });
    const cream = k.ramp(0xe8dcb8, { light: 0.35, sat: 0.6 });
    const ink = k.ramp(0x1a1a24, { light: 0.4 });
    const glass = k.ramp(0x5a3a24, { light: 0.45 });
    const frame = k.ramp(0x3a3c44, { light: 0.45, sat: 0.7 });
    const rust = k.ramp(0x7a4024, { light: 0.4 });
    // Sunburst rays from behind the bottle.
    const cx = 48;
    const cy = 52;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = Math.atan2(y - cy, x - cx);
        const ray = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24) % 2 === 0;
        c.set(x, y, ray ? sun : sky, ray ? 3 : 2);
      }
    }
    // The bottle: a fat contour bottle with a label and a highlight.
    for (let y = 14; y < 90; y++) {
      const t = (y - 14) / 76;
      const half = t < 0.18 ? 4 : t < 0.35 ? 4 + (t - 0.18) * 60 : t < 0.55 ? 14 - Math.sin((t - 0.35) * 15) * 2 : 14;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        const u = (x - (cx - half)) / (half * 2);
        c.set(x, y, glass, u < 0.2 ? 4 : u > 0.8 ? 1 : 2);
      }
    }
    c.rect(cx - 5, 10, 11, 5, red, 3);
    c.rect(cx - 13, 52, 27, 14, cream, 3);
    drawText(c, 'SUN', cx - 9, 56, FONT_BOLD, red, 3);
    c.vline(cx - 8, 30, 50, cream, 5);
    // Slogan panel.
    c.rect(90, 8, 96, 80, cream, 3);
    c.frame(90, 8, 96, 80, red, 3);
    drawText(c, 'SUNSHINE', 96, 14, FONT_BOLD, red, 3, { scale: 1, shadow: { ramp: ink, tone: 1 } });
    drawText(c, 'COLA', 100, 28, FONT_TALL, red, 3, { scale: 2, shadow: { ramp: ink, tone: 1 } });
    drawText(c, 'ICE COLD 5c', 98, 70, FONT_5x7, ink, 2);
    // Paper sheet seams, a torn strip, weather.
    for (let x = 0; x < W; x += 48) c.vline(x, 0, H, cream, 1);
    for (let y = 30; y < 44; y++) for (let x = 150; x < 192; x++) if (hash2(x >> 1, y, 9) > (y - 30) / 20) c.ramp[y * W + x] = 0;
    for (let i = 0; i < 16; i++) {
      const x = k.rng.int(0, W - 1);
      for (let j = 0; j < k.rng.int(6, 22); j++) c.shift(x, j, -1);
    }
    // Steel frame round the board, rust runs at its foot.
    c.frame(0, 0, W, H, frame, 3);
    c.hline(0, 0, W, frame, 4);
    c.hline(0, H - 1, W, frame, 1);
    for (let i = 0; i < 8; i++) {
      const x = k.rng.int(2, W - 3);
      for (let j = 0; j < k.rng.int(4, 12); j++) if (c.at(x, H - 2 - j)) c.tint(x, H - 2 - j, rust, 0);
    }
  });
}
