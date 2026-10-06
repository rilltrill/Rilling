import { PWF, type PwCanvas } from './canvas';

/**
 * PixelWorld bitmap fonts — glyphs drawn as pixel art (code, not image files),
 * replacing the extruded 3D block letters on every sign.
 *
 *  - `FONT_5x7`  regular caps + lower case (9-row cell: 2 ascender rows above the
 *    x-height, 2 descender rows), digits, punctuation — notices, menus, plates;
 *  - `bold`      the 5×7 emboldened by one column: chunky arcade caps (shop boards,
 *    marquees, road signs) — as in Final Fight / Streets of Rage storefronts;
 *  - `tall`      the 5×7 doubled vertically: condensed tall caps (blade signs,
 *    cinema letters, hospital lettering);
 *  - `FONT_3x5`  tiny caps + digits (posters, plates, small print);
 *  - script      lower case slanted with baseline joins (`drawText(..., { script })`):
 *    neon script ("Diner", "Bar", "Cocktails").
 * Any font scales by whole texels (`scale`).
 */

export interface PixelFont {
  /** Cell width / height (texels, before scale). */
  w: number;
  h: number;
  /** Rows from the cell top to the baseline (the bottom of the caps). */
  base: number;
  glyphs: Map<string, string[]>;
  /** Gap between glyphs. */
  gap: number;
  /** Advance of a space. */
  space: number;
}

function parse(src: Record<string, string>, h: number, top = 0): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [k, v] of Object.entries(src)) {
    const rows = v.split('/');
    const out: string[] = [];
    for (let i = 0; i < top; i++) out.push('.'.repeat(rows[0].length));
    out.push(...rows);
    while (out.length < h) out.push('.'.repeat(rows[0].length));
    m.set(k, out);
  }
  return m;
}

const CAPS5x7: Record<string, string> = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '#####/...#./..#../...#./....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/...#./.##..',
  '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../..#../.#...',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '-': '...../...../...../.###./...../...../.....',
  "'": '..#../..#../.#.../...../...../...../.....',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
  '/': '...../....#/...#./..#../.#.../#..../.....',
  ':': '...../.##../.##../...../.##../.##../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  $: '..#../.####/#.#../.###./..#.#/####./..#..',
  '*': '...../..#../#.#.#/.###./#.#.#/..#../.....',
  '%': '##.../##..#/...#./..#../.#.../#..##/...##',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  '"': '.#.#./.#.#./...../...../...../...../.....',
};

const LOWER5x9: Record<string, string> = {
  a: '...../...../.###./....#/.####/#...#/.####/...../.....',
  b: '#..../#..../#.##./##..#/#...#/#...#/####./...../.....',
  c: '...../...../.###./#..../#..../#...#/.###./...../.....',
  d: '....#/....#/.##.#/#..##/#...#/#...#/.####/...../.....',
  e: '...../...../.###./#...#/#####/#..../.###./...../.....',
  f: '..##./.#..#/.#.../###../.#.../.#.../.#.../...../.....',
  g: '...../...../.####/#...#/#...#/.####/....#/#...#/.###.',
  h: '#..../#..../#.##./##..#/#...#/#...#/#...#/...../.....',
  i: '..#../...../.##../..#../..#../..#../.###./...../.....',
  j: '...#./...../..##./...#./...#./...#./...#./#..#./.##..',
  k: '#..../#..../#..#./#.#../##.../#.#../#..#./...../.....',
  l: '.##../..#../..#../..#../..#../..#../.###./...../.....',
  m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#/...../.....',
  n: '...../...../#.##./##..#/#...#/#...#/#...#/...../.....',
  o: '...../...../.###./#...#/#...#/#...#/.###./...../.....',
  p: '...../...../####./#...#/#...#/####./#..../#..../#....',
  q: '...../...../.####/#...#/#...#/.####/....#/....#/....#',
  r: '...../...../#.##./##..#/#..../#..../#..../...../.....',
  s: '...../...../.####/#..../.###./....#/####./...../.....',
  t: '.#.../.#.../###../.#.../.#.../.#..#/..##./...../.....',
  u: '...../...../#...#/#...#/#...#/#..##/.##.#/...../.....',
  v: '...../...../#...#/#...#/#...#/.#.#./..#../...../.....',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#./...../.....',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#/...../.....',
  y: '...../...../#...#/#...#/#...#/.####/....#/#...#/.###.',
  z: '...../...../#####/...#./..#../.#.../#####/...../.....',
};

const CAPS3x5: Record<string, string> = {
  A: '.#./#.#/###/#.#/#.#',
  B: '##./#.#/##./#.#/##.',
  C: '.##/#../#../#../.##',
  D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###',
  F: '###/#../##./#../#..',
  G: '.##/#../#.#/#.#/.##',
  H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###',
  J: '..#/..#/..#/#.#/.#.',
  K: '#.#/#.#/##./#.#/#.#',
  L: '#../#../#../#../###',
  M: '#.#/###/#.#/#.#/#.#',
  N: '##./#.#/#.#/#.#/#.#',
  O: '.#./#.#/#.#/#.#/.#.',
  P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/##./.##',
  R: '##./#.#/##./#.#/#.#',
  S: '.##/#../.#./..#/##.',
  T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###',
  V: '#.#/#.#/#.#/#.#/.#.',
  W: '#.#/#.#/###/###/#.#',
  X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.',
  Z: '###/..#/.#./#../###',
  '0': '###/#.#/#.#/#.#/###',
  '1': '.#./##./.#./.#./###',
  '2': '##./..#/.#./#../###',
  '3': '##./..#/.#./..#/##.',
  '4': '#.#/#.#/###/..#/..#',
  '5': '###/#../##./..#/##.',
  '6': '.##/#../###/#.#/###',
  '7': '###/..#/.#./.#./.#.',
  '8': '###/#.#/###/#.#/###',
  '9': '###/#.#/###/..#/##.',
  '.': '.../.../.../.../.#.',
  ',': '.../.../.../.#./#..',
  '-': '.../.../###/.../...',
  '!': '.#./.#./.#./.../.#.',
  "'": '.#./.#./.../.../...',
  '/': '..#/..#/.#./#../#..',
  ':': '.../.#./.../.#./...',
  '&': '.#./#.#/.#./#.#/.##',
  '+': '.../.#./###/.#./...',
  '?': '##./..#/.#./.../.#.',
  $: '.##/##./.#./.##/##.',
  '%': '#.#/..#/.#./#../#.#',
};

/** Regular 5×7 caps + 5×9 lower case (caps sit in rows 0–6, baseline under row 6). */
export const FONT_5x7: PixelFont = (() => {
  const g = parse(CAPS5x7, 9);
  for (const [k, v] of parse(LOWER5x9, 9)) g.set(k, v);
  return { w: 5, h: 9, base: 7, glyphs: g, gap: 1, space: 3 };
})();

/** Tiny 3×5 caps and digits. */
export const FONT_3x5: PixelFont = { w: 3, h: 5, base: 5, glyphs: parse(CAPS3x5, 5), gap: 1, space: 2 };

/** Emboldened copy of a font (each glyph ORed with itself shifted one column right). */
export function boldFont(f: PixelFont): PixelFont {
  const g = new Map<string, string[]>();
  for (const [k, rows] of f.glyphs) {
    g.set(
      k,
      rows.map((r) => {
        let o = '';
        for (let i = 0; i <= r.length; i++) o += r[i] === '#' || r[i - 1] === '#' ? '#' : '.';
        return o;
      }),
    );
  }
  return { w: f.w + 1, h: f.h, base: f.base, glyphs: g, gap: f.gap, space: f.space + 1 };
}

/** Copy of a font stretched vertically by a whole factor (tall condensed caps). */
export function tallFont(f: PixelFont, k = 2): PixelFont {
  const g = new Map<string, string[]>();
  for (const [key, rows] of f.glyphs) {
    const out: string[] = [];
    for (const r of rows) for (let i = 0; i < k; i++) out.push(r);
    g.set(key, out);
  }
  return { w: f.w, h: f.h * k, base: f.base * k, glyphs: g, gap: f.gap, space: f.space };
}

export const FONT_BOLD = boldFont(FONT_5x7);
export const FONT_TALL = tallFont(FONT_5x7, 2);

export interface TextOpts {
  /** Whole-texel scale. */
  scale?: number;
  /** Extra texels between glyphs (before scale). */
  spacing?: number;
  flag?: number;
  /** Neon script: slant + baseline joins (lower case reads best). */
  script?: boolean;
  /** Drop shadow (raised letters): ramp + tone, offset down-right by `shadowD` texels. */
  shadow?: { ramp: number; tone: number };
  shadowD?: number;
  /** Per-texel tone function (x, y within the glyph cell, 0…1) — lit tops, bevelled letters. */
  shadeFn?: (u: number, v: number) => number;
  /** Vertical: letters stacked top to bottom (blade signs). */
  vertical?: boolean;
  /**
   * Tube letters: each glyph cell becomes a node and neighbouring cells are joined
   * by `tube`-texel lines through their centres — thin bent-glass neon at any
   * scale instead of fat blocks (0 / undefined = solid blocks).
   */
  tube?: number;
}

function glyphOf(f: PixelFont, ch: string): string[] | undefined {
  return f.glyphs.get(ch) ?? f.glyphs.get(ch.toUpperCase());
}

/** Glyph width (columns actually used, so proportional text reads tighter). */
function glyphW(rows: string[]): number {
  let w = 0;
  for (const r of rows) {
    const k = r.lastIndexOf('#');
    if (k + 1 > w) w = k + 1;
  }
  return Math.max(1, w);
}

/** Width in texels of `text` set in `f`. */
export function textWidth(text: string, f: PixelFont, o: TextOpts = {}): number {
  const s = o.scale ?? 1;
  const sp = f.gap + (o.spacing ?? 0);
  if (o.vertical) return f.w * s;
  let w = 0;
  for (const ch of text) {
    const g = glyphOf(f, ch);
    w += (ch === ' ' || !g ? f.space : glyphW(g)) + sp;
  }
  w -= sp;
  const slant = o.script ? Math.ceil(f.h * 0.25) : 0;
  return Math.max(0, w * s + slant * s);
}

/** Height in texels (vertical: the stacked column). */
export function textHeight(text: string, f: PixelFont, o: TextOpts = {}): number {
  const s = o.scale ?? 1;
  if (!o.vertical) return f.h * s;
  const n = [...text].length;
  return (n * (f.base + 2) - 2) * s;
}

export interface TextMask {
  w: number;
  h: number;
  /** 1 = letter texel; (u, v) of each texel within its glyph for shading. */
  data: Uint8Array;
  u: Float32Array;
  v: Float32Array;
}

/** Rasterise `text` into a mask (no canvas): every font / layout rule lives here. */
export function rasterText(text: string, f: PixelFont, o: TextOpts = {}): TextMask {
  const s = o.scale ?? 1;
  const sp = f.gap + (o.spacing ?? 0);
  const slant = o.script ? 0.25 : 0;
  const W = Math.max(1, textWidth(text, f, o) + s);
  const H = Math.max(1, textHeight(text, f, o) + s);
  const data = new Uint8Array(W * H);
  const U = new Float32Array(W * H);
  const V = new Float32Array(W * H);
  const dot = (x: number, y: number, u: number, v: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    data[y * W + x] = 1;
    U[y * W + x] = u;
    V[y * W + x] = v;
  };
  const tw = o.tube ?? 0;
  /** A tube segment between two points (`tw` texels thick). */
  const seg = (x0: number, y0: number, x1: number, y1: number, u: number, v: number) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      for (let a = 0; a < tw; a++) for (let b = 0; b < tw; b++) dot(x + a - (tw - 1) / 2, y + b - (tw - 1) / 2, u, v);
    }
  };
  let cx = 0;
  let cy = 0;
  let prev: [number, number] | null = null;
  const baseY = (f.base - 0.5) * s;
  for (const ch of text) {
    const g = glyphOf(f, ch);
    if (ch === ' ' || !g) {
      if (o.vertical) cy += (f.base + 2) * s;
      else cx += (f.space + sp) * s;
      prev = null;
      continue;
    }
    const gw = glyphW(g);
    const on = (k: number, r: number) => r >= 0 && r < g.length && k >= 0 && k < g[r].length && g[r][k] === '#';
    // Slant per OUTPUT row (continuous), so scaled letters lean smoothly.
    const sx = (y: number) => (slant ? (baseY - y) * slant : 0);
    let firstBase: [number, number] | null = null;
    let lastBase: [number, number] | null = null;
    for (let r = 0; r < g.length; r++) {
      for (let k = 0; k < g[r].length; k++) {
        if (!on(k, r)) continue;
        const u = k / Math.max(1, gw - 1);
        const v = r / Math.max(1, f.base - 1);
        if (tw) {
          const ny = (r + 0.5) * s;
          const nx = (k + 0.5) * s + sx(ny);
          const X = cx + nx;
          const Y = cy + ny;
          let linked = false;
          // Right, down, and the diagonals not already covered by two orthogonal links.
          for (const [dk, dr] of [
            [1, 0],
            [0, 1],
            [1, 1],
            [-1, 1],
          ] as const) {
            if (!on(k + dk, r + dr)) continue;
            if (dk !== 0 && dr !== 0 && (on(k + dk, r) || on(k, r + dr))) continue;
            const ny2 = (r + dr + 0.5) * s;
            seg(X, Y, cx + (k + dk + 0.5) * s + sx(ny2), cy + ny2, u, v);
            linked = true;
          }
          const isolated = !linked && !on(k - 1, r) && !on(k, r - 1) && !on(k - 1, r - 1) && !on(k + 1, r - 1);
          if (isolated) seg(X, Y, X, Y, u, v);
          if (r === f.base - 1) {
            if (!firstBase) firstBase = [X, Y];
            lastBase = [X, Y];
          }
        } else {
          for (let a = 0; a < s; a++) {
            for (let b = 0; b < s; b++) {
              const y = r * s + b;
              dot(cx + k * s + a + sx(y), cy + y, u, v);
            }
          }
          if (r === f.base - 1) {
            if (!firstBase) firstBase = [cx + k * s + sx(r * s), cy + r * s + s - 1];
            lastBase = [cx + (k + 1) * s - 1 + sx(r * s), cy + r * s + s - 1];
          }
        }
      }
    }
    // Script: a thin join from the previous letter's baseline to this one.
    if (o.script && prev && firstBase) {
      const t0 = tw || Math.max(1, s >> 1);
      for (let x = prev[0]; x <= firstBase[0]; x++) for (let b = 0; b < t0; b++) dot(x, prev[1] - b, 0.5, 1);
    }
    if (o.vertical) {
      cy += (f.base + 2) * s;
      prev = null;
    } else {
      prev = o.script ? lastBase : null;
      cx += (gw + sp) * s;
    }
  }
  return { w: W, h: H, data, u: U, v: V };
}

/**
 * Draw `text` with its cell's top-left at (x, y). Returns the width drawn.
 * Pixels take `ramp` / `tone` (+ `shadeFn(u, v)`) and `flag` (PWF.GLOW for lit letters).
 */
export function drawText(c: PwCanvas, text: string, x: number, y: number, f: PixelFont, ramp: number, tone: number, o: TextOpts = {}): number {
  const m = rasterText(text, f, o);
  const flag = o.flag ?? 0;
  const sd = o.shadowD ?? 1;
  if (o.shadow) {
    for (let my = 0; my < m.h; my++) for (let mx = 0; mx < m.w; mx++) if (m.data[my * m.w + mx]) c.set(x + mx + sd, y + my + sd, o.shadow.ramp, o.shadow.tone);
  }
  for (let my = 0; my < m.h; my++) {
    for (let mx = 0; mx < m.w; mx++) {
      const i = my * m.w + mx;
      if (!m.data[i]) continue;
      c.set(x + mx, y + my, ramp, o.shadeFn ? tone + o.shadeFn(m.u[i], m.v[i]) : tone, flag);
    }
  }
  return textWidth(text, f, o);
}

/**
 * Neon tube text: the letters as glowing tubes (`core` step, unlit) with a ring of
 * glow pixels a couple of steps down around every stroke (`halo`), the way arcade
 * backgrounds draw lit neon on a dark board. Returns the width drawn.
 */
export function neonText(c: PwCanvas, text: string, x: number, y: number, f: PixelFont, ramp: number, o: TextOpts & { core?: number; halo?: number; haloRamp?: number } = {}): number {
  const sc = o.scale ?? 1;
  const m = rasterText(text, f, { ...o, tube: o.tube ?? (sc >= 2 ? (sc >= 4 ? 2 : 1) + (sc >= 6 ? 1 : 0) : 0) });
  const hr = o.haloRamp ?? ramp;
  const halo = o.halo ?? 2;
  for (let my = -1; my <= m.h; my++) {
    for (let mx = -1; mx <= m.w; mx++) {
      const on = (a: number, b: number) => a >= 0 && b >= 0 && a < m.w && b < m.h && m.data[b * m.w + a] === 1;
      if (on(mx, my)) continue;
      if (on(mx + 1, my) || on(mx - 1, my) || on(mx, my + 1) || on(mx, my - 1)) c.set(x + mx, y + my, hr, halo, PWF.GLOW);
    }
  }
  const core = o.core ?? 5;
  for (let my = 0; my < m.h; my++) {
    for (let mx = 0; mx < m.w; mx++) {
      if (!m.data[my * m.w + mx]) continue;
      // Tube body one step under the hot core on its lower edge (a round tube, not a flat stroke).
      const lower = my + 1 >= m.h || !m.data[(my + 1) * m.w + mx];
      c.set(x + mx, y + my, ramp, lower ? core - 1 : core, PWF.GLOW);
    }
  }
  return textWidth(text, f, o);
}
