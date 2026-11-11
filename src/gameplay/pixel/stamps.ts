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

/** Stamp atlas size (cells; 256 since the PIXEL CAST 2 face sets joined it). */
export const STAMP_ATLAS = 256;

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

// ─── PIXEL CAST 2: bigger, clearer faces (four size classes) ────────────────
// A face must read on a figure 40–60 px tall and be a pleasure at 150: eyes and
// mouths are drawn bolder and in one more size at each end. Size class from the
// head's height in texels (`celSize`): XS < 10.5, S < 14.5, M < 21, L above.
// Eyes are authored for the eye on the VIEWER'S LEFT (the nose is to the right).

/** Zombie eye: a heavy brow shadow over a near-black socket, a glowing pin (slot 0) turned to the nose, a bag under it. */
const ZEYE2: StampDef[] = [
  { rows: ['22', '3A'], ax: 1, ay: 1 },
  { rows: ['222', '3A3'], ax: 1, ay: 1 },
  { rows: ['2222', '33A3', '.11.'], ax: 2, ay: 1 },
  { rows: ['.3333.', '333AA3', '333AA3', '.3333.', '..11..'], ax: 3, ay: 1 },
];
/** Zombie mouth [closed snarl / open / gaping][size]: interior slot 0, teeth slot 1 (two tones: separate teeth). */
const ZMOUTH2: StampDef[][] = [
  [
    { rows: ['222'], ax: 1, ay: 0 },
    { rows: ['2kjk2', '.222.'], ax: 2, ay: 0 },
    { rows: ['2kjkjk2', '.22222.'], ax: 3, ay: 0 },
    { rows: ['2kjkjkjk2', '2jkjkjkj2', '.2222222.'], ax: 4, ay: 0 },
  ],
  [
    { rows: ['2k2', '.a.'], ax: 1, ay: 0 },
    { rows: ['2kjk2', 'baaab', '.2a2.'], ax: 2, ay: 0 },
    { rows: ['2kjkjk2', 'baaaaab', '.kjkjk.', '..222..'], ax: 3, ay: 0 },
    { rows: ['2kjkjkjk2', 'baaaaaaab', 'baaabbaab', '.jkjkjkj.', '..22222..'], ax: 4, ay: 0 },
  ],
  [
    { rows: ['2k2', 'aaa', '.a.'], ax: 1, ay: 0 },
    { rows: ['2kjk2', 'baaab', 'aaaaa', '.jkj.', '..2..'], ax: 2, ay: 0 },
    { rows: ['2kjkjk2', 'baaaaab', 'baaaaab', 'aabbbaa', '.kjkjk.', '..222..'], ax: 3, ay: 0 },
    { rows: ['2kjkjkjk2', 'baaaaaaab', 'baaaaaaab', 'baabbbaab', 'aabbbbbaa', '.jkjkjkj.', '..22222..'], ax: 4, ay: 0 },
  ],
];
/** Nose shadow / nostrils under the nose tip (zombies and the living) [size]. */
const NOSE2: StampDef[] = [
  { rows: ['1'], ax: 0, ay: 0 },
  { rows: ['2'], ax: 0, ay: 0 },
  { rows: ['2.2'], ax: 1, ay: 0 },
  { rows: ['.1.1.', '22.22'], ax: 2, ay: 1 },
];
/**
 * Living eyes [size]: brow slot 3, white slot 1, pupil / lid line slot 2.
 * calm, scream (brows arched high, whites round a centred pupil), terror (brows pulled
 * up at the inner end, a small pupil in a wide white), relief (shut in a smiling arc),
 * strain (squeezed shut toward the nose, brows knitted).
 */
const LEYE2: Record<'calm' | 'scream' | 'terror' | 'relief' | 'strain', StampDef[]> = {
  // (XS and S carry NO pure white: a lone white pixel on a small dark face reads as a
  // zombie's glowing pin. Whites start at M; an eye is never wider than ~28 % of the head.)
  calm: [
    { rows: ['n'], ax: 0, ay: 0 },
    { rows: ['ttt', '...', '.n.'], ax: 1, ay: 2 },
    { rows: ['tttt', '....', '.nn.', 'lnnl', '.11.'], ax: 2, ay: 3 },
    { rows: ['tttt.', '.....', 'nnnnn', 'llnnl', '.111.'], ax: 2, ay: 3 },
  ],
  scream: [
    { rows: ['t', '.', 'n', 'n'], ax: 0, ay: 2 },
    { rows: ['.tt', 't..', 'ini', '.n.'], ax: 1, ay: 2 },
    { rows: ['.tt.', 't..t', '....', 'lnnl', 'lnnl', '.ll.'], ax: 2, ay: 3 },
    { rows: ['.ttt.', 't...t', '.nnn.', 'nlnln', 'nllln', '.111.'], ax: 2, ay: 3 },
  ],
  terror: [
    { rows: ['t', 'n', 'n'], ax: 0, ay: 1 },
    { rows: ['..t', 'tt.', 'ini', 'ini'], ax: 1, ay: 2 },
    { rows: ['..tt', 'tt..', '.nn.', 'llnl', 'llnl', '.ll.'], ax: 2, ay: 4 },
    { rows: ['...tt', 'ttt..', '.nnn.', 'nllln', 'nlnln', '.lll.'], ax: 2, ay: 4 },
  ],
  relief: [
    { rows: ['nn'], ax: 0, ay: 0 },
    { rows: ['ttt', '...', '.n.', 'n.n'], ax: 1, ay: 2 },
    { rows: ['tttt', '....', '.nn.', 'n..n'], ax: 2, ay: 2 },
    { rows: ['.ttt.', '.....', '.222.', '2...2'], ax: 2, ay: 2 },
  ],
  strain: [
    { rows: ['nn'], ax: 0, ay: 0 },
    { rows: ['tt.', '..t', 'nn.', '..n'], ax: 1, ay: 2 },
    { rows: ['tt..', '..tt', 'nn..', '..nn', 'nn..'], ax: 2, ay: 3 },
    { rows: ['tt...', '..ttt', '22...', '..222', '22...'], ax: 2, ay: 3 },
  ],
};
/** Living mouths [size]: calm (a worried line), scream (an open O, teeth on top), gasp, smile, gritted teeth. Interior slot 0, teeth slot 1. */
const LMOUTH3: Record<'calm' | 'scream' | 'gasp' | 'smile' | 'grit', StampDef[]> = {
  calm: [
    { rows: ['22'], ax: 0, ay: 0 },
    { rows: ['222'], ax: 1, ay: 0 },
    { rows: ['.222.', '2...2'], ax: 2, ay: 0 },
    { rows: ['..222..', '.2...2.'], ax: 3, ay: 0 },
  ],
  scream: [
    { rows: ['aa', 'aa'], ax: 0, ay: 0 },
    { rows: ['kkk', 'aaa', '.a.'], ax: 1, ay: 0 },
    { rows: ['.kkk.', 'aaaaa', 'aaaaa', '.aba.'], ax: 2, ay: 0 },
    { rows: ['.kkkkk.', 'aaaaaaa', 'aaaaaaa', 'aabbbaa', '.aaaaa.'], ax: 3, ay: 0 },
  ],
  gasp: [
    { rows: ['aa'], ax: 0, ay: 0 },
    { rows: ['.a.', 'aaa', '.a.'], ax: 1, ay: 0 },
    { rows: ['.aa.', 'aaaa', '.aa.'], ax: 1, ay: 0 },
    { rows: ['.aaa.', 'aaaaa', 'aaaaa', '.aaa.'], ax: 2, ay: 0 },
  ],
  smile: [
    { rows: ['2.2', '.2.'], ax: 1, ay: 0 },
    { rows: ['2.2', '.2.'], ax: 1, ay: 0 },
    { rows: ['2...2', '.kkk.', '..a..'], ax: 2, ay: 0 },
    { rows: ['2.....2', '.kkkkk.', '.aaaaa.', '..aaa..'], ax: 3, ay: 0 },
  ],
  grit: [
    { rows: ['kk'], ax: 0, ay: 0 },
    { rows: ['2kjk2', '.111.'], ax: 2, ay: 0 },
    { rows: ['2kjkjk2', '.11111.'], ax: 3, ay: 0 },
    { rows: ['2kjkjkjk2', '2jkjkjkj2', '.1111111.'], ax: 4, ay: 0 },
  ],
};


// ─── PIXEL CAST 2: big hands ────────────────────────────────────────────────
// Hands of 11 texels and more are stamps too (they were jointed cone fingers): a palm,
// fingers two texels wide with their separations drawn, a knuckle shadow, dark nails on
// the dead. [pose][size]: L (about 12 cells), XL (about 16); authored like HANDS (pointing
// RIGHT and UP-RIGHT, anchor = the wrist cell). Fists and thumbs-up have the L size only.
const HANDS_L: { right: StampDef[]; diag: StampDef[] }[] = [
  {
    right: [{ rows: ['....dd.......', '...ddd..ddb..', '..ddd..ddd.b.', '.ddd.dddd....', 'ddddddd.dddb.', 'ddeddddddd.b.', 'dddddcd......', 'dddddddddddb.', 'cddddcdddd.b.', 'cdddd........', '.cddddddddb..', '..ccdcddd.b..', '.....c.......'], ax: 0, ay: 6 }, { rows: ['.....ddd.........', '....dddd...dddb..', '...dddd...dddd.b.', '..dddd..ddddd..b.', '.dddd.dddddd.....', 'ddddddddd..ddddb.', 'dddedddddddddd.bb', 'ddeeddddcdddd..b.', 'dddddddcd........', 'dddddddddddddddb.', 'cddddddcdddddd.bb', 'cdddddcddddd...b.', 'cdddddd..........', '.cdddddddddddb...', '.ccddddcddddd.b..', '..cccdcddd....b..', '......c..........'], ax: 0, ay: 8 }],
    diag: [{ rows: ['.......b..bb.', '......dd..d..', '..b..dd..dd.b', '..dd.dd.dd.dd', '...dddddd.dd.', '.b.ddddddd...', '.dddddeddd...', '..ddddddd....', '..dddddd.....', '.dddddc......', 'ddddcc.......', 'dddc.........', 'cc...........'], ax: 0, ay: 12 }, { rows: ['.........bb...bb.', '........dd....dd.', '...b...ddd...dd..', '...dd..dd...ddd.b', '...ddd.dd..ddd.bb', '....dddddd.dd.dd.', '.bb.dddddddd.ddd.', '.ddd.ddddddddd...', '..ddddddeedddd...', '...ddddddedddd...', '...dddddddddd....', '..ddddddddddd....', '.dddddddddcc.....', 'ddddddddcc.......', 'dddddddc.........', 'cddddc...........', '.ccc.............'], ax: 0, ay: 16 }],
  },
  {
    right: [{ rows: ['...ddde.....', '.dddddddddd.', 'ddddddcccccc', 'ddeddddddddd', 'dddddccccccc', 'dddddddddddd', 'cdddccccccc.', '.cdddddddd..'], ax: 0, ay: 4 }, { rows: ['....dddde.......', '...ddddd........', '.ddddddddddddde.', 'ddddddddddddddde', 'dddddddccccccccc', 'ddedddddddddddde', 'ddeeddddcccccccc', 'dddddddddddddde.', 'cdddddddcccccc..', 'cddddddddddddd..', '.cccdddddddd....'], ax: 0, ay: 6 }],
    diag: [{ rows: ['.......de...', '......dcde..', '.....dcdcde.', '.e..dcdcdcd.', '.dd.dddcdc..', '.dddddddcd..', '..dddedddc..', '..ddddddc...', '.ddddddc....', 'dddddc......', 'ddddc.......', 'cdc.........'], ax: 0, ay: 11 }, { rows: ['..........dde...', '.........ddcde..', '........ddcddde.', '.......ddcddcde.', '.e....ddcddcddd.', '.dd...dddddcddc.', '.ddd.ddddddddc..', '.dddddddddddcd..', '..dddddeedddc...', '..ddddddedddc...', '..dddddddddc....', '.dddddddddc.....', 'dddddddddc......', 'dddddddcc.......', 'cdddddc.........', '.cccc...........'], ax: 0, ay: 15 }],
  },
  {
    right: [{ rows: ['..dddd.....', '.ddeddded..', 'dddddddcde.', 'ddedddddcd.', 'ddddddddde.', 'ddddddddcd.', 'cddddddde..', 'cddcdddcd..', '.ccccccc...'], ax: 0, ay: 4 }],
    diag: [{ rows: ['....ded....', '...ddcded..', '..dddddcde.', '.ddeddddcd.', '.ddddddddd.', 'ddddddddd..', 'dddddddc...', 'cddddcc....', '.cddc......', '.cc........'], ax: 0, ay: 9 }],
  },
  {
    right: [{ rows: ['.....de....', '.....dd....', '.....dd....', '.....dd....', '..dddddd...', '.ddedddded.', 'dddddddcde.', 'ddedddddcd.', 'ddddddddde.', 'cdddddddcd.', 'cddcdddcd..', '.ccccccc...'], ax: 0, ay: 8 }],
    diag: [{ rows: ['....de.....', '....dd.....', '....dd.....', '....ddded..', '...ddddcde.', '..ddeddddd.', '.dddddddcd.', '.ddddddddd.', 'dddddddd...', 'dddddddc...', 'cddddcc....', '.cddc......', '.cc........'], ax: 0, ay: 12 }],
  },
];

/** PIXEL CAST 2 face stamps (ids): [size] for eyes / nose, [state][size] for the zombie mouth. */
export const CEL_STAMP = {
  zeye: ZEYE2.map(add),
  zmouth: ZMOUTH2.map((st) => st.map(add)),
  nose: NOSE2.map(add),
  leye: {
    calm: LEYE2.calm.map(add),
    scream: LEYE2.scream.map(add),
    terror: LEYE2.terror.map(add),
    relief: LEYE2.relief.map(add),
    strain: LEYE2.strain.map(add),
  },
  lmouth: {
    calm: LMOUTH3.calm.map(add),
    scream: LMOUTH3.scream.map(add),
    gasp: LMOUTH3.gasp.map(add),
    smile: LMOUTH3.smile.map(add),
    grit: LMOUTH3.grit.map(add),
  },
};

/** The size between the old stamps (7 cells) and L: about 10 cells — claw (three fingers and a thumb at this size) and open hand. */
const HANDS_M: { right: StampDef; diag: StampDef }[] = [
  {
    right: { rows: ['...dd.....', '..ddd.ddb.', '.ddd.ddd.b', 'ddddddd...', 'ddeddddddb', 'dddddddd.b', 'cdddd.....', 'cdddddddb.', '.cddddd..b', '..cc......'], ax: 0, ay: 5 },
    diag: { rows: ['......b.b.', '.....dd.d.', '..b.dd.dd.', '..dddd.d.b', '...dddddd.', '.b.ddddd..', '.ddddedd..', '..ddddd...', '.ddddc....', 'dddcc.....'], ax: 0, ay: 9 },
  },
  {
    right: { rows: ['..ddde....', '.ddddddde.', 'ddddcccccc', 'ddeddddddd', 'dddddccccc', 'cdddddddd.', '.ccccc....'], ax: 0, ay: 3 },
    diag: { rows: ['.....de..', '....dcde.', '...dcdcd.', '.e.ddcdc.', '.ddddddd.', '..ddeddc.', '.dddddc..', 'ddddc....', 'cdc......'], ax: 0, ay: 8 },
  },
];

/**
 * PIXEL CAST 2 big hands (ids): [pose `HAND.*`][0 = M (≈ 10 cells), 1 = L (≈ 12), 2 = XL (≈ 16)][dir8].
 * (Fists and thumbs-up are drawn once, at about 11 cells: every size maps to it.)
 */
export const CEL_HAND: number[][][] = HANDS_L.map((p, i) => {
  const l = hand8(p.right[0], p.diag[0]);
  const m = HANDS_M[i] ? hand8(HANDS_M[i].right, HANDS_M[i].diag) : l;
  return [m, l, p.right[1] ? hand8(p.right[1], p.diag[1]) : l];
});

// ─── PIXEL CAST 2: the predator face ────────────────────────────────────────
// Eyes and nostrils are authored for the VIEWER'S LEFT (the nose to the right); teeth for
// the viewer's left of a jaw row, shaded on the side toward the nose. Mirrored by the painter.

/** Predator eye [XS, S, M, L]: slanted almond, dark socket (slot 1), lit iris (slot 0), a slit, a glint (slot 2) at L. */
const DINO_EYE: StampDef[] = [
  { rows: ['g..', 'AgA'], ax: 1, ay: 1 },
  { rows: ['gg...', 'gAgAg', '.ggg1'], ax: 2, ay: 1 },
  { rows: ['ggg....', 'gAgAgg.', 'gAgAAgg', '1ggdgg1', '.11111.'], ax: 3, ay: 2 },
  { rows: ['ggg......', 'gAAgggg..', 'gACgAAggg', 'gAAgAAddg', '1gdgddgg1', '.1ggggg1.', '..11111..'], ax: 4, ay: 3 },
];
/** Nostril [S, M, L]: a raked slit darkened into whatever hide lies under it. */
const DINO_NOSTRIL: StampDef[] = [
  { rows: ['3'], ax: 0, ay: 0 },
  { rows: ['.3', '3.'], ax: 1, ay: 0 },
  { rows: ['..+', '.33', '33.'], ax: 1, ay: 1 },
];
/** Upper tooth [S, M, L]: slot 0, anchored at the middle of its root (top row). */
const TOOTH_U: StampDef[] = [
  { rows: ['ee', 'ec', '.c'], ax: 1, ay: 0 },
  { rows: ['eee', 'eec', '.ec', '.c.'], ax: 1, ay: 0 },
  { rows: ['.eee.', 'eeeec', '.eec.', '.eec.', '..ec.', '..c..'], ax: 2, ay: 0 },
];
/** Lower tooth: the upper one turned point-up, anchored at its root (bottom row). */
const TOOTH_L: StampDef[] = TOOTH_U.map((d) => ({ rows: d.rows.slice().reverse(), ax: d.ax, ay: d.rows.length - 1 - d.ay }));

/** Side tooth (a rim running up the screen): the upper tooth turned to point RIGHT, toward the mouth's middle. */
const TOOTH_S: StampDef[] = TOOTH_U.map((d) => ({
  rows: Array.from({ length: d.rows[0].length }, (_, x) => d.rows.map((r) => r[x] ?? '.').join('')),
  ax: d.ay,
  ay: d.ax,
}));

/** Predator face stamps (ids): eye [XS, S, M, L]; nostril and teeth [S, M, L]. */
export const DINO_STAMP = {
  eye: DINO_EYE.map(add),
  nostril: DINO_NOSTRIL.map(add),
  toothU: TOOTH_U.map(add),
  toothL: TOOTH_L.map(add),
  toothS: TOOTH_S.map(add),
};

/** PIXEL CAST 2 face size class (0 XS … 3 L) for a head `headPx` texels tall. */
export function celSize(headPx: number): number {
  return headPx < 10.5 ? 0 : headPx < 14.5 ? 1 : headPx < 21 ? 2 : 3;
}

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
