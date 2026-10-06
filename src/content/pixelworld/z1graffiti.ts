import { PW_TPM, PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { FONT_5x7, rasterText } from './font';
import { hash2 } from './surfaces';

/**
 * MAIN STREET's spray paint in ART: PIXEL WORLD — graffiti the way a pixel
 * artist paints it on a Final Fight wall, not block-letter signs:
 *  - `throwup`: bubble letters — the letter skeleton fattened round (no square
 *    corners), a dark outline, a two-tone fill (a lit upper-left lobe, a second
 *    colour fading in at the bottom through a dither), a drop shadow, a halo of
 *    overspray dots and paint drips running off the bottoms;
 *  - `tag`: a scrawled signature — one thin slanted stroke per letter that
 *    joins along the baseline, letters hopping up and down, a swoosh under it,
 *    misted overspray and a drip;
 *  - `stencil`: a hasty warning sprayed through a stencil — broken letters
 *    (stencil bridges), a misty edge, runs.
 * Every piece is its own cut-out tile (lit by the scene like the wall), its
 * letters jittered per piece, so no two walls carry the same graffiti.
 */

export type Z1GrafStyle = 'throwup' | 'tag' | 'stencil';

const h6 = (n: number) => n.toString(16).padStart(6, '0');

export interface Z1GrafOpts {
  style: Z1GrafStyle;
  /** Main paint colour. */
  fill: number;
  /** Second fill colour (throw-ups) / outline (tags). */
  accent?: number;
  /** Outline colour (throw-ups). */
  outline?: number;
  /** Letter scale (texels per glyph cell; default 2 = 14-texel caps). */
  scale?: number;
  seed?: number;
}

/** A graffiti piece (cut-out); its size follows the word. Lay it at 32 texels a metre (`tile.w / PW_TPM`). */
export function z1Spray(atlas: PwAtlas, word: string, o: Z1GrafOpts): PwTile {
  const s = o.scale ?? 2;
  const m = layout(word, o.style, s, o.seed ?? 0);
  const pad = o.style === 'throwup' ? 5 : 4;
  const W = Math.max(16, m.w + pad * 2 + 2);
  const H = Math.max(16, m.h + pad * 2 + 8);
  const key = `z1spray|${o.style}|${word}|${h6(o.fill)}|${h6(o.accent ?? 0)}|${h6(o.outline ?? 0)}|${s}|${o.seed ?? 0}`;
  return atlas.tile(key, W, H, (c, k) => paint(c, k, m, pad, o));
}

/** Spray a piece straight into another painter's canvas with its top-left at (x, y) (shutters, hoardings). */
export function sprayInto(c: PwCanvas, k: PwKit, word: string, o: Z1GrafOpts, x: number, y: number) {
  const s = o.scale ?? 2;
  const m = layout(word, o.style, s, o.seed ?? 0);
  const pad = o.style === 'throwup' ? 5 : 4;
  const tmp = new PwCanvas(Math.max(16, m.w + pad * 2 + 2), Math.max(16, m.h + pad * 2 + 8));
  paint(tmp, k, m, pad, o);
  c.blit(tmp, x, y);
  return { w: tmp.w, h: tmp.h };
}

/** The piece (word + options) that `z1WallPiece(n)` paints. */
export function z1PieceSpec(n: number): { word: string; o: Z1GrafOpts } {
  const word = WORDS[(n * 7) % WORDS.length];
  const h = hash2(n, 3, 17);
  const style: Z1GrafStyle = word.includes(' ') ? (h < 0.5 ? 'stencil' : 'tag') : h < 0.6 ? 'throwup' : 'tag';
  const [fill, acc] = PAINTS[(n * 3 + 1) % PAINTS.length];
  return { word, o: { style, fill, accent: acc, outline: style === 'throwup' && hash2(n, 4, 17) > 0.6 ? 0xe8e4d8 : 0x14141a, scale: 2, seed: n } };
}

/** The pieces' metre size. */
export function z1SprayM(t: PwTile): { w: number; h: number } {
  return { w: t.w / PW_TPM, h: t.h / PW_TPM };
}

interface Mask {
  w: number;
  h: number;
  /** 1 = stroke (the letter skeleton, already fattened for the style). */
  d: Uint8Array;
}

/** Letters one by one (each hops / leans on its own), thin strokes for tags, fat round strokes for throw-ups. */
function layout(word: string, style: Z1GrafStyle, s: number, seed: number): Mask {
  const tube = style === 'tag' ? 1 : style === 'stencil' ? 0 : Math.max(2, s);
  const glyphs = [...word].map((ch, i) => {
    const r = rasterText(ch, FONT_5x7, { scale: s, tube: tube || undefined, script: style === 'tag' });
    const hop = style === 'stencil' ? 0 : Math.round((hash2(i, seed, 3) - 0.5) * (style === 'tag' ? 6 : 3));
    return { ch, r, hop };
  });
  const gap = style === 'throwup' ? -Math.max(1, s - 1) : style === 'tag' ? -2 * s - 1 : s;
  let w = 0;
  const space = 3 * s + Math.max(gap, s) + (style === 'tag' ? 3 * s : 0);
  for (const g of glyphs) w += g.ch === ' ' ? space : g.r.w + gap;
  w = Math.max(1, w - gap + (style === 'tag' ? 2 * s + 2 : 0));
  const top = 4;
  const h = 7 * s + top * 2 + 2;
  const d = new Uint8Array(w * h);
  let x = 0;
  for (const g of glyphs) {
    if (g.ch === ' ') {
      x += space;
      continue;
    }
    for (let y = 0; y < g.r.h; y++) {
      for (let xx = 0; xx < g.r.w; xx++) {
        if (!g.r.data[y * g.r.w + xx]) continue;
        // Stencil bridges: a gap across the middle of every upright.
        if (style === 'stencil' && Math.abs(y - g.r.h * 0.5) < s * 0.6 && xx % (s * 3) < s) continue;
        const X = x + xx;
        const Y = y + top + g.hop;
        if (X >= 0 && X < w && Y >= 0 && Y < h) d[Y * w + X] = 1;
      }
    }
    x += g.r.w + gap;
  }
  return { w, h, d };
}

function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const r2 = r * r + 0.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!src[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const X = x + dx;
          const Y = y + dy;
          if (X >= 0 && Y >= 0 && X < w && Y < h) out[Y * w + X] = 1;
        }
      }
    }
  }
  return out;
}

function paint(c: PwCanvas, k: PwKit, m: Mask, pad: number, o: Z1GrafOpts) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const fill = k.ramp(o.fill, { light: 0.45, sat: 1.05 });
  const acc = k.ramp(o.accent ?? o.fill, { light: 0.45, sat: 1.05 });
  const out = k.ramp(o.outline ?? 0x14141a, { light: 0.4 });
  // The piece's own frame: the mask placed at (pad, pad).
  const at = (mask: Uint8Array, x: number, y: number) => {
    const X = x - pad;
    const Y = y - pad;
    return X >= 0 && Y >= 0 && X < m.w && Y < m.h && mask[Y * m.w + X] === 1;
  };
  const drips = (mask: Uint8Array, ramp: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const x = pad + rng.int(1, Math.max(2, m.w - 2));
      let y = H - 1;
      while (y > 0 && !at(mask, x, y)) y--;
      if (!at(mask, x, y)) continue;
      const len = rng.int(3, 9);
      for (let j = 1; j <= len && y + j < H - 1; j++) c.set(x, y + j, ramp, j === len ? 3.5 : 2.5);
      if (y + len + 1 < H) c.set(x, y + len + 1, ramp, 2);
    }
  };
  const mist = (mask: Uint8Array, ramp: number, n: number, reach: number) => {
    for (let i = 0; i < n; i++) {
      const x = rng.int(0, W - 1);
      const y = rng.int(0, H - 1);
      if (c.at(x, y)) continue;
      // Only near the paint: within `reach` texels of a stroke.
      let near = false;
      for (let dy = -reach; dy <= reach && !near; dy++) for (let dx = -reach; dx <= reach && !near; dx++) near = at(mask, x + dx, y + dy);
      if (near) c.set(x, y, ramp, 2.5);
    }
  };
  if (o.style === 'throwup') {
    const r = Math.max(1, Math.round((o.scale ?? 2) * 0.6));
    const F = dilate(m.d, m.w, m.h, r);
    const O = dilate(F, m.w, m.h, 1);
    // Drop shadow (outline colour) two texels down-right, then outline, then the fill.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(O, x - 2, y - 2) && !at(O, x, y)) c.set(x, y, out, 0.5);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(O, x, y) && !at(F, x, y)) c.set(x, y, out, 1);
    let y0 = H;
    let y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(F, x, y)) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!at(F, x, y)) continue;
        const v = (y - y0) / Math.max(1, y1 - y0);
        // Lower third fades to the accent colour through an ordered dither.
        const b = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16;
        const r2 = v > 0.55 && b < (v - 0.55) / 0.3 ? acc : fill;
        // Lit upper-left lobe: texels whose up / left neighbour is outline.
        const lit = !at(F, x, y - 1) || !at(F, x - 1, y);
        const dark = !at(F, x, y + 1) || !at(F, x + 1, y);
        c.set(x, y, r2, lit ? 4 : dark ? 2 : 3);
      }
    }
    // A shine dash on a few letters.
    for (let i = 0; i < 3; i++) {
      const x = pad + rng.int(2, Math.max(3, m.w - 4));
      for (let y = 0; y < H; y++) if (at(F, x, y) && at(F, x, y + 2) && c.at(x, y + 1)) {
        c.set(x, y + 1, fill, 5);
        c.set(x, y + 2, fill, 5);
        break;
      }
    }
    drips(F, r === 1 ? fill : acc, Math.max(2, Math.round(m.w / 22)));
    mist(O, fill, Math.round((W * H) / 40), 2);
  } else if (o.style === 'tag') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(m.d, x, y)) c.set(x, y, fill, 3);
    // A second pass a texel down-right in the accent (a fat marker's double line), then the swoosh.
    if (o.accent !== undefined) for (let y = H - 1; y > 0; y--) for (let x = W - 1; x > 0; x--) if (at(m.d, x - 1, y - 1) && !c.at(x, y)) c.set(x, y, acc, 2);
    const sy = pad + m.h - 4;
    for (let x = pad - 2; x < pad + m.w + 2; x++) {
      const y = Math.round(sy + Math.sin(((x - pad) / m.w) * Math.PI) * 2.5);
      if (x >= 0 && x < W && y < H) c.set(x, y, fill, 3);
    }
    drips(m.d, fill, 1);
    mist(m.d, fill, Math.round((W * H) / 70), 1);
  } else {
    const F = dilate(m.d, m.w, m.h, 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(F, x, y)) c.set(x, y, fill, (x + y) % 7 === 0 ? 2 : 3);
    drips(F, fill, Math.max(2, Math.round(m.w / 14)));
    mist(F, fill, Math.round((W * H) / 30), 1);
  }
}

// ─── Picking pieces ────────────────────────────────────────────────────────

const WORDS = ['RUN', 'NO HOPE', 'RIP', 'HELP', 'KRUSH', 'MBK', 'Z', 'GO WEST', 'DEAD', 'BITERS', 'SK8', 'ROT', 'NOT SAFE', 'MAX 79', 'EAT', 'BONZ', 'LOST'];
const PAINTS: [number, number][] = [
  [0xe84a9a, 0xffd23a],
  [0x3ad8b8, 0x2a6ae8],
  [0xffd23a, 0xe8642a],
  [0xe8e4d8, 0x8a8ab0],
  [0xd83a3a, 0xffa03a],
  [0x8ae84a, 0x2aa86a],
  [0x6a8aff, 0xd84ae8],
];

/**
 * The piece for wall `n` (a running count of the stage's walls): consecutive
 * walls never repeat a word (the list is walked with a stride co-prime to its
 * length), the style and paints hashed per wall.
 */
export function z1WallPiece(atlas: PwAtlas, n: number): PwTile {
  const { word, o } = z1PieceSpec(n);
  return z1Spray(atlas, word, o);
}

/** The alley's spray-painted words (the classic letters' word and colour): style by the word. */
export function z1AlleyPiece(atlas: PwAtlas, word: string, color: number, n: number): PwTile {
  const long = word.length > 6;
  const style: Z1GrafStyle = long ? (n % 2 ? 'stencil' : 'tag') : n % 3 === 1 ? 'tag' : 'throwup';
  return z1Spray(atlas, word, { style, fill: color, accent: PAINTS[n % PAINTS.length][1], scale: 2, seed: n + 40 });
}
