/**
 * Pixel-art sprites for the arcade front-end, drawn as ASCII grids and turned
 * into crisp SVG (shape-rendering: crispEdges) — inline markup for icons that
 * change colour, data-URI CSS variables for repeated sprites (ammo pips…).
 * Sizes in CSS should be whole multiples of the grid so pixels stay square.
 */
import type { WeaponId } from '../core/types';

export type Palette = Record<string, string>;

/** Shared palette letters: K outline, W white, C currentColor. */
const BASE: Palette = { K: '#000', W: '#fff', C: 'currentColor' };

function gridSize(rows: readonly string[]) {
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  return { w, h: rows.length };
}

/** One <path> per colour, one sub-path per horizontal run. */
function paths(rows: readonly string[], pal: Palette): string {
  const runs = new Map<string, string>();
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      const col = pal[c] ?? BASE[c];
      if (!col) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < row.length && row[e] === c) e++;
      runs.set(col, (runs.get(col) ?? '') + `M${x} ${y}h${e - x}v1h${x - e}z`);
      x = e;
    }
  }
  let out = '';
  for (const [col, d] of runs) out += `<path fill="${col}" d="${d}"/>`;
  return out;
}

/** Inline SVG for a sprite. */
export function pixelSvg(rows: readonly string[], pal: Palette = {}, cls = ''): string {
  const { w, h } = gridSize(rows);
  return `<svg class="px ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges" aria-hidden="true">${paths(rows, pal)}</svg>`;
}

/** `url("data:…")` for a sprite (no currentColor: give every colour explicitly). */
export function pixelUrl(rows: readonly string[], pal: Palette = {}): string {
  const { w, h } = gridSize(rows);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${paths(rows, pal)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ─── Sprites ────────────────────────────────────────────────────────────────

export const HEART = [
  '.KKK...KKK.',
  'KRRRK.KRRRK',
  'KRWWRKRRRRK',
  'KRWRRRRRRRK',
  'KRRRRRRRRDK',
  '.KRRRRRRDK.',
  '..KRRRRDK..',
  '...KRRDK...',
  '....KDK....',
  '.....K.....',
];
const HEART_FULL: Palette = { R: '#ff2a2a', D: '#a00010' };
const HEART_EMPTY: Palette = { R: '#3a1c24', W: '#4e2a33', D: '#2a1018' };

export const heartSvg = (full: boolean) => pixelSvg(HEART, full ? HEART_FULL : HEART_EMPTY, 'px-heart');

export const BOMB = [
  '.......Y.Y.',
  '........O..',
  '.......YOY.',
  '......F....',
  '.....F.....',
  '...KKKK....',
  '..KGGGGK...',
  '.KGWGGGGK..',
  'KGWGGGGGGK.',
  'KGGGGGGGGK.',
  'KGGGGGGGDK.',
  'KGGGGGGDDK.',
  '.KGGGGDDK..',
  '..KKKKKK...',
];
// F: the fuse in rope tan, so it reads (and joins the spark to the bomb) on black panels.
export const bombSvg = () => pixelSvg(BOMB, { Y: '#ffe000', O: '#ff7a00', F: '#c8a060', G: '#4a5a3a', D: '#26301c', W: '#b8c8a0' }, 'px-bomb');

export const SKULL = [
  '..CCCCC..',
  '.CCCCCCC.',
  'CCCCCCCCC',
  'CC..C..CC',
  'CC..C..CC',
  'CCCC.CCCC',
  '.CCCCCCC.',
  '..C.C.C..',
  '..CCCCC..',
];
export const skullSvg = (cls = '') => pixelSvg(SKULL, {}, `px-skull ${cls}`);

export const LOCK = [
  '..CCC..',
  '.C...C.',
  '.C...C.',
  'CCCCCCC',
  'CCC.CCC',
  'CCC.CCC',
  'CCCCCCC',
  'CCCCCCC',
];
export const lockSvg = () => pixelSvg(LOCK, {}, 'px-lock');

export const ARROW_UP = ['...C...', '..CCC..', '.CCCCC.', 'CCCCCCC'];
export const ARROW_DOWN = ['CCCCCCC', '.CCCCC.', '..CCC..', '...C...'];
export const ARROW_RIGHT = ['C...', 'CC..', 'CCC.', 'CCCC', 'CCC.', 'CC..', 'C...'];
export const ARROW_LEFT = ['...C', '..CC', '.CCC', 'CCCC', '.CCC', '..CC', '...C'];
export const arrowSvg = (dir: 'up' | 'down' | 'left' | 'right', cls = '') =>
  pixelSvg(dir === 'up' ? ARROW_UP : dir === 'down' ? ARROW_DOWN : dir === 'left' ? ARROW_LEFT : ARROW_RIGHT, {}, `px-arrow ${cls}`);

export const INFINITY = ['.CC...CC.', 'C..C.C..C', 'C...C...C', 'C..C.C..C', '.CC...CC.'];
export const infinitySvg = () => pixelSvg(INFINITY, {}, 'px-inf');

export const SWAP = ['....C...', 'CCCCCC..', '....C...', '........', '...C....', '..CCCCCC', '...C....'];
export const swapSvg = () => pixelSvg(SWAP, {}, 'px-swap');

/** Weapon silhouettes facing right (barrel right, grip lower-left). */
export const WEAPON_SPRITES: Record<WeaponId, string[]> = {
  pistol: [
    '.CCCCCCCCCCCCC',
    '.CCCCCCCCCCCCC',
    '.CCCCCCCCCCC..',
    '.CCCCC.C..C...',
    '.CCCC..CCC....',
    'CCCC..........',
    'CCCC..........',
    'CCC...........',
  ],
  shotgun: [
    '...........CCCCCCCCCCCCC',
    'CC.......CCCCCCCCCCCCCCC',
    'CCCC...CCCCCCCCCCCCCCC..',
    'CCCCCCCCCCC.C..CCCCCC...',
    'CCCCCCC.....CC..........',
    'CCCCC...................',
    'CCC.....................',
  ],
  smg: [
    '.....CCCCCCCCCC.....',
    'C...CCCCCCCCCCCCCCCC',
    'CC.CCCCCCCCCCCCC....',
    'CCCCC..CC.CCC.......',
    'CC.....CC..CC.......',
    '.......CC..CC.......',
    '...........CC.......',
    '...........CC.......',
  ],
  magnum: [
    '...............C',
    '.CCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCCC',
    'CCCCCCCCCC......',
    'CCCCC.C.C.......',
    'CCCC..CC........',
    'CCC.............',
    'CC..............',
  ],
  turret: [
    '....CCCC..............',
    '..CCCCCCCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCCCCCCCCC',
    '..CCCCCCCCCCCCCCCCCCC.',
    '....CCCC..............',
    '....C..C..............',
    '...CC..CC.............',
  ],
};

export function weaponSprite(id: WeaponId, cls = ''): string {
  return pixelSvg(WEAPON_SPRITES[id], {}, `px-weapon ${cls}`);
}

// ─── Ammo pips (CSS background sprites) ─────────────────────────────────────

const BULLET = ['.TT.', 'TWTT', 'TTTT', 'BBBB', 'BLBB', 'BLBB', 'BBBB', 'BBBB', 'DDDD'];
const SHELL = ['RRRR', 'RWRR', 'RRRR', 'RRRR', 'RRRR', 'RRRR', 'BBBB', 'BLBB', 'DDDD'];
const SMALL = ['.T.', 'TTT', 'BBB', 'BLB', 'BBB', 'DDD'];
const BIG = ['.SS.', 'SWSS', 'SSSS', 'SSSS', 'BBBB', 'BLBB', 'BLBB', 'BBBB', 'BBBB', 'DDDD'];
const BRASS: Palette = { T: '#e08a3a', W: '#fff4c0', B: '#ffc030', L: '#fff080', D: '#8a5a10' };
const RED_SHELL: Palette = { R: '#e02020', W: '#ff8a80', B: '#ffc030', L: '#fff080', D: '#8a5a10' };
const SILVER: Palette = { S: '#c8d0d8', W: '#ffffff', B: '#ffc030', L: '#fff080', D: '#8a5a10' };
const SPENT: Palette = { T: '#2a2a34', W: '#3a3a46', B: '#2a2a34', L: '#3a3a46', D: '#1a1a22', R: '#2a2a34', S: '#2a2a34' };

let installed = false;

/** Publish the repeated sprites as CSS custom properties on <html> (once). */
export function installPixelSprites(root: HTMLElement = document.documentElement) {
  if (installed) return;
  installed = true;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set('--px-bullet', pixelUrl(BULLET, BRASS));
  set('--px-bullet-off', pixelUrl(BULLET, SPENT));
  set('--px-shell', pixelUrl(SHELL, RED_SHELL));
  set('--px-shell-off', pixelUrl(SHELL, SPENT));
  set('--px-small', pixelUrl(SMALL, BRASS));
  set('--px-small-off', pixelUrl(SMALL, SPENT));
  set('--px-big', pixelUrl(BIG, SILVER));
  set('--px-big-off', pixelUrl(BIG, SPENT));
  set('--px-heart', pixelUrl(HEART, HEART_FULL));
}
