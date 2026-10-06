/**
 * PixelCast STAMPS: hand-pixelled little bitmaps for the parts the eye goes to
 * — eyes, mouths, hands, claws — that rules and round cones can't draw well at
 * 3–8 texels. They are code, not image files (the game's art is procedural):
 * each stamp is a few strings of cell codes, drawn screen-aligned, placed from
 * the live 3D rig (an eye stamp sits where that eye is, so yaw and the jaw work
 * as before), scaled by whole texels and picked per size class.
 *
 * Cell codes (one character per cell, top row first):
 *   .        transparent
 *   a–f      material slot 0, ramp step 0–5      g–l  slot 1, steps 0–5
 *   m–r      slot 2, steps 0–5                   s–x  slot 3, steps 0–5
 *   1 2 3    darken whatever is under it by 1/2/3 steps (decal stamps)
 *   +        lighten it by one step
 *   A–D      slot 0–3 at full brightness, unlit (glowing eyes)
 *
 * Slots are the materials the painter passes with the stamp (`PixelFigure.stamp`).
 * Hands come in two authored directions (pointing right, pointing up-right);
 * the other six are exact mirrors / transposes, so the pixels stay clean.
 *
 * Pure data (no DOM / GL): node tests read stamps through `stampCell`.
 */

export interface StampDef {
  /** Rows, top first (all the same width). */
  rows: string[];
  /** Anchor cell (column, row from the top): placed at the stamp's world point. */
  ax: number;
  ay: number;
}

export interface Stamp {
  w: number;
  h: number;
  /** Anchor cell, bottom-up (row 0 = bottom). */
  ax: number;
  ay: number;
  /** Atlas position of the bottom-left cell. */
  x0: number;
  y0: number;
}

/** Stamp atlas size (cells). */
export const STAMP_ATLAS = 128;

const CODE: Record<string, number> = { '.': 0, ' ': 0, '1': 31, '2': 32, '3': 33, '+': 40, A: 50, B: 51, C: 52, D: 53 };
for (let i = 0; i < 24; i++) CODE[String.fromCharCode(97 + i)] = 1 + i;

// ─── The stamps ────────────────────────────────────────────────────────────
// Eyes are authored for the eye on the VIEWER'S LEFT (the nose is to the right);
// the painter mirrors them for the other eye.

/** Zombie eye: a sunken socket, deepest under the brow, with a glowing pin (slot 0). */
const ZEYE: StampDef[] = [
  { rows: ['22.', '2A2', '.1.'], ax: 1, ay: 1 },
  { rows: ['1222', '2A32', '.22.'], ax: 1, ay: 1 },
  { rows: ['.2222', '23A32', '23332', '.122.'], ax: 2, ay: 1 },
];
/** Living eye, calm: brow (slot 3), white (slot 1), pupil (slot 2). */
const LEYE: StampDef[] = [
  { rows: ['tt', 'kn'], ax: 0, ay: 1 },
  { rows: ['.tt', 'jkn', '.1.'], ax: 1, ay: 1 },
  { rows: ['.ttt', 'tu..', 'jkno', '.11.'], ax: 2, ay: 2 },
];
/** Living eye, screaming: brows up, whites all round the pupil. */
const SEYE: StampDef[] = [
  { rows: ['t.', 'kk', 'n.'], ax: 0, ay: 1 },
  { rows: ['tt.', '.1.', 'knk', '.k.'], ax: 1, ay: 2 },
  { rows: ['.tt.', 't..t', '.kk.', 'knok', '.kk.'], ax: 1, ay: 3 },
];
/**
 * Zombie mouth, by jaw opening (closed / open / gaping) × size: interior slot 0,
 * teeth slot 1, lip shade from the skin under it. Anchor = centre of the upper lip.
 */
const ZMOUTH: StampDef[][] = [
  [
    { rows: ['2222'], ax: 1, ay: 0 },
    { rows: ['.222.', '2bbb2', '.111.'], ax: 2, ay: 0 },
    { rows: ['.2222.', '2bkbk2', '.1111.'], ax: 2, ay: 0 },
  ],
  [
    { rows: ['2kk2', '.aa.'], ax: 1, ay: 0 },
    { rows: ['2kjk2', 'babab', '.1a1.'], ax: 2, ay: 0 },
    { rows: ['2kjjk2', 'baaaab', 'bajaab', '.1111.'], ax: 2, ay: 0 },
  ],
  [
    { rows: ['2kk2', 'aaaa', '.ja.'], ax: 1, ay: 0 },
    { rows: ['2kjk2', 'baaab', 'aaaaa', '.jak.', '..1..'], ax: 2, ay: 0 },
    { rows: ['2kjjk2', 'kaaaak', 'baaaab', 'baaaab', '.jaaj.', '..11..'], ax: 2, ay: 0 },
  ],
];
/** Living mouth: calm (a lip line) and screaming (an open O with teeth). */
const LMOUTH: StampDef[][] = [
  [
    { rows: ['22'], ax: 0, ay: 0 },
    { rows: ['.2.', '2.2'], ax: 1, ay: 0 },
    { rows: ['.22.', '2..2'], ax: 1, ay: 0 },
  ],
  [
    { rows: ['kk', 'aa'], ax: 0, ay: 0 },
    { rows: ['kkk', 'aba', '.a.'], ax: 1, ay: 0 },
    { rows: ['.kkk.', 'kaaak', 'baaab', '.aaa.'], ax: 2, ay: 0 },
  ],
];
/** Theropod eye (slot 0 glows, slot 1 slit pupil, brow ridge shadow over it). Faces the snout on the right. */
const REYE: StampDef[] = [
  { rows: ['22', 'Ag'], ax: 0, ay: 1 },
  { rows: ['322.', '2AgA', '.11.'], ax: 1, ay: 1 },
  { rows: ['3222.', '2AAgA', '1AAgA', '.111.'], ax: 2, ay: 2 },
];
/**
 * Hands (solid stamps, slot 0 = skin; the resolve pass adds their outline).
 * [pose][size]: each pose authored pointing RIGHT (wrist on the left edge) and
 * UP-RIGHT (wrist at the bottom-left corner). Anchor = the wrist cell.
 */
const HANDS: { right: StampDef[]; diag: StampDef[] }[] = [
  // Claw: fingers splayed and hooked (zombies).
  {
    right: [
      { rows: ['..d.d', '.dd.d', 'dddd.', 'cdd.d', '.c...'], ax: 0, ay: 2 },
      { rows: ['...d.e.', '..dd.d.', '.ddedd.e', 'dddddd.', 'cdddd.d', '.cdd..c', '..c....'], ax: 0, ay: 3 },
    ],
    diag: [
      { rows: ['.d.d.', 'd.dd.', '.ddd.', 'ddd..', 'cc...'], ax: 0, ay: 4 },
      { rows: ['..d..d.', '.d..dd.', '..ddd.d', '.dddd..', 'ddddc..', 'dddc...', 'cc.....'], ax: 0, ay: 6 },
    ],
  },
  // Open hand, fingers together, thumb out (civilians: hands up, waving).
  {
    right: [
      { rows: ['..dd.', '.dddd', 'ddddd', 'cdc..', '.c...'], ax: 0, ay: 2 },
      { rows: ['..ddd..', '.dddddd', 'ddeeddd', 'dddddd.', 'cdd.c..', '.cd....', '..c....'], ax: 0, ay: 3 },
    ],
    diag: [
      { rows: ['..dd.', '.ddd.', 'dddd.', 'ddc..', 'c....'], ax: 0, ay: 4 },
      { rows: ['...dd..', '..dedd.', '.ddddd.', 'dddddc.', 'ddddc..', 'cdc....', 'c......'], ax: 0, ay: 6 },
    ],
  },
  // Fist (brutes).
  {
    right: [
      { rows: ['.ddd.', 'ddedd', 'ddddd', 'cdcd.', '.cc..'], ax: 0, ay: 2 },
      { rows: ['.dddd..', 'ddedddd', 'ddeeddd', 'ddddddd', 'cddcdc.', '.cccc..'], ax: 0, ay: 3 },
    ],
    diag: [
      { rows: ['.ddd.', 'ddedd', 'ddddd', 'cddc.', '.cc..'], ax: 0, ay: 4 },
      { rows: ['..ddd..', '.ddeddd', 'ddeeddd', 'ddddddd', 'cdddddc', '.cdddc.', '..ccc..'], ax: 0, ay: 6 },
    ],
  },
];

// ─── Atlas ─────────────────────────────────────────────────────────────────

const atlas = new Uint8Array(STAMP_ATLAS * STAMP_ATLAS);
const stamps: Stamp[] = [];
let cx = 0;
let cy = 0;
let rowH = 0;

function grid(d: StampDef): { w: number; h: number; c: number[][] } {
  const h = d.rows.length;
  const w = Math.max(...d.rows.map((r) => r.length));
  const c = d.rows.map((r) => {
    const out: number[] = [];
    for (let x = 0; x < w; x++) out.push(CODE[r[x] ?? '.'] ?? 0);
    return out;
  });
  return { w, h, c };
}

/** Add a grid (rows top-first) to the atlas; returns its stamp id. */
function put(c: number[][], ax: number, ay: number): number {
  const h = c.length;
  const w = c[0].length;
  if (cx + w > STAMP_ATLAS) {
    cx = 0;
    cy += rowH + 1;
    rowH = 0;
  }
  if (cy + h > STAMP_ATLAS) throw new Error('stamp atlas full');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) atlas[(cy + (h - 1 - y)) * STAMP_ATLAS + cx + x] = c[y][x];
  stamps.push({ w, h, ax, ay: h - 1 - ay, x0: cx, y0: cy });
  cx += w + 1;
  rowH = Math.max(rowH, h);
  return stamps.length - 1;
}

function add(d: StampDef): number {
  const g = grid(d);
  return put(g.c, d.ax, d.ay);
}

const mirrorX = (c: number[][]) => c.map((r) => r.slice().reverse());
const mirrorY = (c: number[][]) => c.slice().reverse();
const transpose = (c: number[][]) => c[0].map((_, x) => c.map((r) => r[x]));

/**
 * 8 directions of a hand from its RIGHT and UP-RIGHT drawings, in the order
 * E, NE, N, NW, W, SW, S, SE (screen space, y up).
 */
function hand8(right: StampDef, diag: StampDef): number[] {
  const R = grid(right);
  const Dg = grid(diag);
  const ids: number[] = new Array(8);
  // E: as drawn.
  ids[0] = put(R.c, right.ax, right.ay);
  // NE: as drawn.
  ids[1] = put(Dg.c, diag.ax, diag.ay);
  // N: transpose of E flipped vertically (wrist at the bottom).
  {
    const t = mirrorY(transpose(R.c));
    ids[2] = put(t, right.ay, R.w - 1 - right.ax);
  }
  // NW: NE mirrored in x.
  ids[3] = put(mirrorX(Dg.c), Dg.w - 1 - diag.ax, diag.ay);
  // W: E mirrored in x.
  ids[4] = put(mirrorX(R.c), R.w - 1 - right.ax, right.ay);
  // SW: NE mirrored in both.
  ids[5] = put(mirrorY(mirrorX(Dg.c)), Dg.w - 1 - diag.ax, Dg.h - 1 - diag.ay);
  // S: transpose of E (wrist at the top).
  ids[6] = put(transpose(R.c), right.ay, right.ax);
  // SE: NE mirrored in y.
  ids[7] = put(mirrorY(Dg.c), diag.ax, Dg.h - 1 - diag.ay);
  return ids;
}

/** Stamp ids: [size] for eyes, [state][size] for mouths, [pose][size][dir8] for hands. */
export const STAMP = {
  zeye: ZEYE.map(add),
  leye: LEYE.map(add),
  seye: SEYE.map(add),
  reye: REYE.map(add),
  zmouth: ZMOUTH.map((s) => s.map(add)),
  lmouth: LMOUTH.map((s) => s.map(add)),
  hand: HANDS.map((p) => p.right.map((r, i) => hand8(r, p.diag[i]))),
};

/** Hand poses (`THUMB`: a thumbs-up fist — rescued civilians). */
export const HAND = { CLAW: 0, OPEN: 1, FIST: 2, THUMB: 3 } as const;

// ─── Civilians: more faces, a thumbs-up, speech bubbles ─────────────────────
// (Added after the stamps above, so their atlas cells never move.)

/** Living eye, terrified: brows pulled up at the inner end, whites all round a small pupil. */
const TEYE: StampDef[] = [
  { rows: ['.t', 'kk', 'n.'], ax: 0, ay: 1 },
  { rows: ['..t', 'tt.', 'knk', '.k.'], ax: 1, ay: 2 },
  { rows: ['...t', '.tt.', 't...', 'kknk', '.kk.'], ax: 1, ay: 3 },
];
/** Living eye, relieved: shut in a smiling arc (^), brows relaxed. */
const HEYE: StampDef[] = [
  { rows: ['.t', '22'], ax: 0, ay: 1 },
  { rows: ['.tt', '...', '.2.', '2.2'], ax: 1, ay: 2 },
  { rows: ['.ttt', '....', '.22.', '2..2'], ax: 1, ay: 2 },
];
/** Living eye, squeezed shut (straining, flinching): a `>` toward the nose, brows knitted down. */
const QEYE: StampDef[] = [
  { rows: ['tt', '22'], ax: 0, ay: 1 },
  { rows: ['tt.', '2.t', '.22', '2..'], ax: 1, ay: 2 },
  { rows: ['tt..', '..tt', '2...', '.222', '2...'], ax: 1, ay: 3 },
];
/** Living mouths: gasp (a small O), open smile, gritted teeth. [state][size], like LMOUTH. */
const LMOUTH2: StampDef[][] = [
  [
    { rows: ['aa'], ax: 0, ay: 0 },
    { rows: ['.a.', 'aaa', '.a.'], ax: 1, ay: 0 },
    { rows: ['.aa.', 'aaaa', 'aaaa', '.aa.'], ax: 1, ay: 0 },
  ],
  [
    { rows: ['2.2', '.2.'], ax: 1, ay: 0 },
    { rows: ['2...2', '.kkk.', '..a..'], ax: 2, ay: 0 },
    { rows: ['2....2', '.kkkk.', '.aaaa.', '..aa..'], ax: 2, ay: 0 },
  ],
  [
    { rows: ['kk'], ax: 0, ay: 0 },
    { rows: ['2kjk2', '.111.'], ax: 2, ay: 0 },
    { rows: ['2kjjk2', '.1111.'], ax: 2, ay: 0 },
  ],
];
/** Thumbs-up: a fist, the thumb standing up off it (authored like HANDS: pointing right / up-right). */
const THUMB_HAND: { right: StampDef[]; diag: StampDef[] } = {
  right: [
    { rows: ['...d.', '...d.', '.dddd', 'ddedd', 'ddddd', 'cdcc.'], ax: 0, ay: 4 },
    { rows: ['....dd.', '....de.', '....dd.', '.dddddd', 'ddeeddd', 'ddddddd', 'cddcdc.'], ax: 0, ay: 5 },
  ],
  diag: [
    { rows: ['..d..', '..d..', '.ddd.', 'dddd.', 'ddc..', 'c....'], ax: 0, ay: 5 },
    { rows: ['...dd..', '...dd..', '..dddd.', '.ddeddd', 'ddddddc', 'dddddc.', 'cdc....', 'c......'], ax: 0, ay: 7 },
  ],
};

/** 3×5 pixel font (4 wide where it reads better) for the speech bubbles. */
const GLYPH: Record<string, string[]> = {
  H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
  P: ['XXX', 'X.X', 'XXX', 'X..', 'X..'],
  T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
  K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'],
  S: ['.XX', 'X..', '.X.', '..X', 'XX.'],
  '!': ['X', 'X', 'X', '.', 'X'],
};

/**
 * A speech bubble: dark letters on a pale fill inside a dark 1-cell border with
 * rounded corners, and a tail under the middle. Slot 0 = fill (`f`, its lightest
 * step), slot 1 = ink (`g`, its darkest). Anchor = the tail's tip.
 */
function bubbleDef(text: string): StampDef {
  const glyphs = [...text].map((ch) => GLYPH[ch]);
  const tw = glyphs.reduce((n, g) => n + g[0].length, 0) + glyphs.length - 1;
  const w = tw + 4;
  const rows: string[] = [];
  const line = (cell: (x: number) => string) => {
    let s = '';
    for (let x = 0; x < w; x++) s += cell(x);
    rows.push(s);
  };
  const mid = w >> 1;
  line((x) => (x === 0 || x === w - 1 ? '.' : 'g'));
  line((x) => (x === 0 || x === w - 1 ? 'g' : 'f'));
  for (let y = 0; y < 5; y++) {
    let s = 'gf';
    glyphs.forEach((g, i) => {
      s += g[y].replace(/X/g, 'g').replace(/\./g, 'f');
      if (i < glyphs.length - 1) s += 'f';
    });
    rows.push(s + 'fg');
  }
  line((x) => (x === 0 || x === w - 1 ? 'g' : 'f'));
  line((x) => (x === 0 || x === w - 1 ? '.' : x === mid ? 'f' : 'g'));
  line((x) => (x === mid - 1 || x === mid + 1 ? 'g' : x === mid ? 'f' : '.'));
  line((x) => (x === mid ? 'g' : '.'));
  return { rows, ax: mid, ay: rows.length - 1 };
}

/** Civilian faces and speech bubbles (stamp ids, like STAMP's). */
export const CIV_STAMP = {
  /** Eyes [size]: terror, relief (^), squeezed shut. */
  teye: TEYE.map(add),
  heye: HEYE.map(add),
  qeye: QEYE.map(add),
  /** Mouths [state][size]: 0 gasp, 1 smile, 2 gritted teeth. */
  lmouth: LMOUTH2.map((s) => s.map(add)),
  /** Speech bubbles. */
  bubble: { help: add(bubbleDef('HELP!')), thanks: add(bubbleDef('THANKS!')) },
};
// The thumbs-up joins the hand poses (STAMP.hand[HAND.THUMB]).
STAMP.hand.push(THUMB_HAND.right.map((r, i) => hand8(r, THUMB_HAND.diag[i])));

/**
 * How far (in cells) a stamp may reach from its anchor, for the figure's bounds:
 * 8 — the reach every stamp always had — for all that fit in it (eyes, mouths,
 * hands: their figures lay out exactly as before); a speech bubble gets its real
 * extent, with room for its cells rounding up to whole texels on a close figure.
 */
export function stampReach(id: number): number {
  const s = stamps[id];
  if (!s) return 8;
  const e = Math.max(s.ax + 1, s.w - s.ax, s.ay + 1, s.h - s.ay);
  return e <= 8 ? 8 : Math.ceil(e * 1.6) + 1;
}

export function stampInfo(id: number): Stamp {
  return stamps[id];
}

/** Code of cell (x, y) (bottom-up) of stamp `id`, mirrored in x if asked (0 = transparent). */
export function stampCell(id: number, x: number, y: number, mirror = false): number {
  const s = stamps[id];
  if (!s || x < 0 || y < 0 || x >= s.w || y >= s.h) return 0;
  const qx = mirror ? s.w - 1 - x : x;
  return atlas[(s.y0 + y) * STAMP_ATLAS + s.x0 + qx];
}

/** Code at atlas cell (x, y). */
export function atlasCode(x: number, y: number): number {
  return x < 0 || y < 0 || x >= STAMP_ATLAS || y >= STAMP_ATLAS ? 0 : atlas[y * STAMP_ATLAS + x];
}

/** The atlas (R8 codes) for the GPU. */
export function stampAtlas(): Uint8Array {
  return atlas;
}

/** Pick a size class (0 small, 1 medium, 2 large) for a feature `px` texels tall at head scale. */
export function stampSize(headPx: number): number {
  return headPx < 15 ? 0 : headPx < 23 ? 1 : 2;
}

/** 8-way direction index (E, NE, N, … SE) of a screen vector (y up). */
export function dir8(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx);
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}
