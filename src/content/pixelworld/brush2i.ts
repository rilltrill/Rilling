import type { PwTile } from './atlas';
import type { PwCanvas, PwRng } from './canvas';
import { hash2 } from './surfaces';

/**
 * PIXEL WORLD 2 — the INTERIOR brush (docs/PIXELWORLD2.md §4): what the painters of rooms and
 * corridors share. A wall seen from 2–3 m is not a wrap tile with stickers: it is a SEQUENCE OF
 * PANELS, each one painting 6–8 m long and the full height of the wall (plaster, dado, wainscot,
 * skirting and everything fixed to them, in one picture), laid by a hand-written table.
 *
 * The first part of this file is geometry: where each panel falls along a wall, and which piece
 * of which panel a solid piece of the wall shows (`pwPanelCuts`). The classic shell builds a wall
 * as boxes between its door and window openings; a converter asks, for the room-side face of
 * each box, for its cuts and lays one module rect per cut (`batch.rect(…, { sub, flipU })`).
 * Openings need nothing: there is no box there. The second part is the brushes panels, floors
 * and ceilings are painted with (ceramic fields, mouldings, peel, stains, contact shadow, lamp
 * pools).
 *
 * Conventions (the same as every PixelWorld painter):
 *  - a panel is a MODULE (clamped, not wrapped), painted at one density, `tile.w / density`
 *    metres long and `tile.h / density` metres high; the floor line is the BOTTOM row of the
 *    canvas, so a cut's `sub.y` is texels above the floor;
 *  - `along` runs left → right as the wall is seen from the room;
 *  - a FLIPPED panel is mirrored left ↔ right: never put lettering in a panel that may be
 *    flipped (signs are their own overlay modules).
 */

/** One panel of a wall's layout table. */
export interface PwPanelSpan {
  /** Where the panel starts, metres along the wall (left → right seen from the room). */
  at: number;
  panel: PwTile;
  /** Mirrored left ↔ right. */
  flip?: boolean;
}

/** A solid piece of the wall's room-side face: metres along the wall and above the floor. */
export interface PwWallPiece {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

/** One module rect to lay: the piece of `tile` a part of the wall shows. */
export interface PwPanelCut extends PwWallPiece {
  tile: PwTile;
  /** Texels of the panel, x from its left edge AS PAINTED, y from its bottom row. */
  sub: { x: number; y: number; w: number; h: number };
  flipU: boolean;
}

/**
 * A wall's layout table from a list of panels laid end to end from `start`: each is as long as
 * its tile says. `flips[i]` mirrors the i-th. The last panel may run past the end of the wall
 * (the cuts stop at the pieces).
 */
export function pwPanelRun(start: number, panels: readonly PwTile[], flips: readonly boolean[] = []): PwPanelSpan[] {
  const out: PwPanelSpan[] = [];
  let at = start;
  panels.forEach((panel, i) => {
    out.push({ at, panel, flip: !!flips[i] });
    at += panel.w / panel.density;
  });
  return out;
}

/**
 * The cuts of one solid piece of a wall: its overlap with every panel of the layout, as module
 * sub-rects. Nothing is returned for the parts of the piece no panel covers, or above a panel's
 * height (the caller decides what a wall taller than its panels shows there). Cuts narrower or
 * lower than `eps` metres are dropped (a piece that ends on a panel joint).
 */
export function pwPanelCuts(layout: readonly PwPanelSpan[], piece: PwWallPiece, eps = 1e-4): PwPanelCut[] {
  const out: PwPanelCut[] = [];
  for (const s of layout) {
    const t = s.panel;
    const d = t.density;
    const len = t.w / d;
    const a0 = Math.max(piece.a0, s.at);
    const a1 = Math.min(piece.a1, s.at + len);
    const y0 = Math.max(piece.y0, 0);
    const y1 = Math.min(piece.y1, t.h / d);
    if (a1 - a0 <= eps || y1 - y0 <= eps) continue;
    const w = (a1 - a0) * d;
    // A mirrored panel shows its right end at the span's left: the cut is taken from the other side.
    const x = s.flip ? t.w - (a1 - s.at) * d : (a0 - s.at) * d;
    out.push({ a0, a1, y0, y1, tile: t, sub: { x, y: y0 * d, w, h: (y1 - y0) * d }, flipU: !!s.flip });
  }
  return out;
}

// ─── Paint ───────────────────────────────────────────────────────────────────
//
// The brushes below draw the FORMS an interior is made of, in the passes of the art bible
// (§4.1): construction with a lit and a shadow edge, wear as shapes with their own light and
// shadow side, contact shadow where things meet. They take canvas texels (x right, y down) and
// ramps; nothing here knows a stage. Light is the sprite artist's: from the upper left.

/**
 * Smooth value noise over a canvas, for BIG shapes (a coat of paint showing through, where damp
 * gathers, where a line has worn): a lattice of `cell` texels, made once, sampled per texel with
 * no lookups. Thresholded by the painters into hard-edged shapes — never used as a tone.
 */
export class PwField {
  private g: Float32Array;
  private gw: number;
  constructor(w: number, h: number, private cell: number, seed: number) {
    this.gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    this.g = new Float32Array(this.gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < this.gw; x++) this.g[y * this.gw + x] = hash2(x, y, seed);
  }
  /** 0…1 at canvas texel (x, y) (x, y ≥ 0). */
  at(x: number, y: number): number {
    const fx = x / this.cell;
    const fy = y / this.cell;
    const x0 = fx | 0;
    const y0 = fy | 0;
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const i = y0 * this.gw + x0;
    const a = this.g[i];
    const b = this.g[i + 1];
    const c = this.g[i + this.gw];
    const d = this.g[i + this.gw + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
}

/** Canvas row of a point `v` texels above the canvas's bottom row (panels are measured up from the floor). */
export function pwRowUp(c: PwCanvas, v: number): number {
  return c.h - 1 - Math.floor(v);
}

export interface PwCeramicOpts {
  /** The field (canvas texels, `y` = its top row). Courses are counted from its BOTTOM row. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tile pitch in texels, grout line included (4 or more: see the note on regular patterns in the bible). */
  tw: number;
  th: number;
  /** Glaze ramp of the field, and of the odd batches (replaced tiles, a darker firing). */
  glaze: number;
  batches?: readonly number[];
  grout: number;
  /** What shows where a tile is gone: the adhesive bed. */
  bed: number;
  /** Seed of this field's tile-by-tile variation. */
  seed: number;
  /** Share of tiles that are chipped, cracked or gone (default 0.05). */
  wear?: number;
  /** Stagger alternate courses by half a tile. */
  bond?: boolean;
  /** Courses (from the bottom) of the capping row: bullnose tiles a step lighter, never damaged. -1 = none. */
  cap?: number;
}

/**
 * A field of glazed ceramic tiles, each one drawn: a lit top and left edge with a glint in the
 * corner, a shadowed bottom and right edge, a grout line that is darker under a tile than beside
 * it, tiles of another batch here and there — and damage as shapes: a chipped corner showing
 * the bed with a dark break line, a crack with a lit lip, a tile gone (a recess: shadow under its
 * top and left reveal, light on the bottom and right, the comb marks of the adhesive).
 * Grout is kept close to the glaze in value so the grid reads up close and melts far away.
 */
export function pwCeramic(c: PwCanvas, o: PwCeramicOpts) {
  const { tw, th, glaze, grout, bed, seed } = o;
  const wear = o.wear ?? 0.05;
  const batches = o.batches ?? [];
  const rows = Math.ceil(o.h / th);
  const cols = Math.ceil(o.w / tw) + 1;
  const y1 = o.y + o.h; // one past the bottom row
  const areas = new PwField(cols + 2, rows * 2 + 2, 8, seed + 17);
  for (let r = 0; r < rows; r++) {
    const off = o.bond && r & 1 ? tw >> 1 : 0;
    for (let q = -1; q < cols; q++) {
      const cx = o.x + q * tw + off; // cell's left column
      const cy = y1 - (r + 1) * th; // cell's top row
      const hs = hash2(q, r, seed);
      const capRow = o.cap === r;
      // Damage comes in groups (a blow, a failed patch of adhesive): a 3 × 2 neighbourhood goes bad
      // together — some of its tiles gone, the rest chipped or cracked; elsewhere the odd chip.
      const bad = hash2(Math.floor(q / 3), r >> 1, seed + 13) < wear * 0.9;
      const state = capRow ? 3 : bad ? (hs < 0.38 ? 0 : hs < 0.62 ? 1 : hs < 0.85 ? 2 : 3) : hs < wear * 0.35 ? 1 : hs < wear * 0.6 ? 2 : 3; // gone, chipped, cracked, whole
      const hb = hash2(q, r, seed + 7);
      // Batches: the first follows broad shapes (a darker firing laid together, grime that built up
      // in one place), the others are single replaced tiles.
      const area = batches.length > 0 && areas.at(q + 1, r * 2) < 0.3;
      const ramp = area ? batches[0] : batches.length > 1 && hb > 0.93 ? batches[1 + (Math.floor(hb * 97) % (batches.length - 1))] : glaze;
      const iw = tw - 1;
      const ih = th - 1;
      for (let ly = 0; ly < th; ly++) {
        const y = cy + ly;
        if (y < o.y || y >= y1) continue;
        for (let lx = 0; lx < tw; lx++) {
          const x = cx + lx;
          if (x < o.x || x >= o.x + o.w) continue;
          // Grout: the course joint lies in the shadow of the tile above it, the upright joint beside it.
          if (ly === ih) {
            c.set(x, y, grout, 1);
            continue;
          }
          if (lx === iw) {
            c.set(x, y, grout, 2);
            continue;
          }
          if (state === 0) {
            // A tile gone: the bed, combed; a recess (shadow at the top and left, light at the bottom and right).
            let t = ly & 1 ? 2 : 1;
            if (ly < 2 || lx < 1) t = 0;
            else if (ly === ih - 1 || lx === iw - 1) t = 3;
            c.set(x, y, bed, t);
            continue;
          }
          let t = capRow ? 4 : 3;
          if (ly === 0 && lx < iw - 1) t += 1;
          else if (lx === 0 && ly < ih - 2) t += 1;
          else if (ly === ih - 1 && lx > 0) t -= 1;
          else if (lx === iw - 1 && ly > 0) t -= 1;
          // The glint: a small L in the upper left, on most tiles (a matt or dirty one has none).
          if (hb < 0.3 && ((ly === 1 && (lx === 1 || lx === 2)) || (ly === 2 && lx === 1))) t = 5;
          else if (hb > 0.3 && hb < 0.42 && ly === 1 && lx >= 1 && lx <= (iw >> 1)) t = 4;
          c.set(x, y, ramp, t);
        }
      }
      if (state === 1) {
        // A chipped corner: the bed in a small triangle, the break line dark on its lit side.
        const k = 2 + Math.floor(hb * 3);
        const right = hs * 1000 % 2 >= 1;
        const low = hs * 500 % 2 >= 1;
        for (let j = 0; j <= k; j++) {
          for (let i = 0; i <= k - j; i++) {
            const x = right ? cx + iw - 1 - i : cx + i;
            const y = low ? cy + ih - 1 - j : cy + j;
            if (x < o.x || x >= o.x + o.w || y < o.y || y >= y1) continue;
            c.set(x, y, i + j === k ? ramp : bed, i + j === k ? 1 : low ? 3 : 2);
          }
        }
      } else if (state === 2) {
        // A crack across the tile, corner to edge: a dark line, a lit lip on its lower side.
        const x0 = cx + 1 + Math.floor(hb * (iw - 3));
        const dir = hs * 1000 % 2 >= 1 ? 1 : -1;
        let x = x0;
        for (let ly = 0; ly < ih; ly++) {
          const y = cy + ly;
          if (x >= cx && x < cx + iw && x >= o.x && x < o.x + o.w && y >= o.y && y < y1) {
            c.set(x, y, ramp, 1);
            if (x + 1 < cx + iw && ly > 0) c.shift(x + 1, y, 1, ramp);
          }
          if (hash2(q * 31 + ly, r, seed + 3) > 0.45) x += dir;
        }
      }
    }
  }
}

/**
 * A horizontal moulding seen from the front (a crash rail, a dado, a skirting, trunking): `h`
 * rows from `y` down, modelled as a form — a lit top edge, the face, a core shadow toward the
 * underside, the underside dark — with joints every `joint` texels (a dark line, a lit one after it).
 */
export function pwMoulding(c: PwCanvas, x: number, y: number, w: number, h: number, ramp: number, o: { joint?: number; phase?: number; top?: number; face?: number } = {}) {
  const face = o.face ?? 3;
  for (let j = 0; j < h; j++) {
    const t = j === 0 ? (o.top ?? face + 2) : j === 1 && h > 5 ? face + 1 : j === h - 1 ? face - 2 : j >= h - 1 - Math.max(1, h >> 2) ? face - 1 : face;
    c.hline(x, y + j, w, ramp, t);
  }
  if (o.joint) {
    for (let jx = x + ((o.phase ?? 0) % o.joint); jx < x + w; jx += o.joint) {
      c.shade(jx, y + 1, 1, h - 1, -1, ramp);
      c.shade(jx + 1, y + 1, 1, h - 2, 1, ramp);
    }
  }
}

/**
 * The shadow a projecting thing throws on the wall under it: `depth` rows a step darker from
 * row `y`, the last one broken into dashes (a shaped edge, not a checker). `only` = one ramp.
 */
export function pwShadowUnder(c: PwCanvas, x: number, y: number, w: number, depth: number, seed = 0, dt = -1) {
  c.shade(x, y, w, depth - 1, dt);
  for (let i = 0; i < w; i++) if (hash2((x + i) >> 2, y, seed) > 0.4) c.shift(x + i, y + depth - 1, dt);
}

/**
 * Contact shadow of a box-like fixture fixed to a wall: a step darker along its bottom and its
 * right side (`d` texels), drawn BEFORE the fixture is painted over it.
 */
export function pwCast(c: PwCanvas, x: number, y: number, w: number, h: number, d = 2) {
  c.shade(x + d, y + h, w, d, -1);
  c.shade(x + w, y + d, d, h - d, -1);
}

/**
 * Ambient occlusion where a wall meets a ceiling (`dir` 1: the band hangs down from row `y`) or
 * a floor / a ledge (`dir` −1: it climbs from row `y`): two rows two steps down, `rows` rows one
 * step down, then two rows of thinning dashes.
 */
export function pwAoBand(c: PwCanvas, x: number, y: number, w: number, rows: number, dir: 1 | -1, seed = 0) {
  for (let j = 0; j < rows + 2; j++) {
    const yy = y + j * dir;
    if (j < 2) c.shade(x, yy, w, 1, -2);
    else if (j < rows) c.shade(x, yy, w, 1, -1);
    else {
      const keep = j === rows ? 0.35 : 0.7;
      for (let i = 0; i < w; i++) if (hash2((x + i) >> 2, j, seed) > keep) c.shift(x + i, yy, -1);
    }
  }
}

/** An irregular blob: true inside. `p1`, `p2` = phases of its lobes (0…2π), `lob` their depth. */
function blobIn(dx: number, dy: number, rx: number, ry: number, p1: number, p2: number, lob: number): boolean {
  const u = dx / rx;
  const v = dy / ry;
  const d = Math.sqrt(u * u + v * v);
  if (d > 1 + lob * 1.6) return false;
  const a = Math.atan2(v, u);
  return d < 1 + lob * Math.sin(a * 3 + p1) + lob * 0.6 * Math.sin(a * 7 + p2);
}

/**
 * Paint come away from a wall: an irregular patch showing the coat underneath (`under`, and in
 * the middle of a big one the bare plaster `bare`). It is a shallow recess: a shadow line inside
 * its upper and left edge (the paint film's thickness), the curled lip of the film lit along its
 * lower and right edge, a few flakes below it.
 */
export function pwPeel(c: PwCanvas, rng: PwRng, cx: number, cy: number, rx: number, ry: number, paint: number, under: number, bare = 0) {
  const p1 = rng.next() * 6.28;
  const p2 = rng.next() * 6.28;
  const inside = (x: number, y: number) => blobIn(x - cx, y - cy, rx, ry, p1, p2, 0.22);
  const x0 = Math.floor(cx - rx * 1.5);
  const x1 = Math.ceil(cx + rx * 1.5);
  const y0 = Math.floor(cy - ry * 1.5);
  const y1 = Math.ceil(cy + ry * 1.5);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) {
        // The film's lip, just outside the patch below and to the right of it.
        if (inside(x - 1, y) || inside(x, y - 1)) c.set(x, y, paint, 5);
        continue;
      }
      const edge = !inside(x, y - 1) || !inside(x - 1, y);
      const deep = bare && blobIn(x - cx - rx * 0.1, y - cy, rx * 0.5, ry * 0.5, p2, p1, 0.3);
      c.set(x, y, deep ? bare : under, edge ? 1 : deep && !blobIn(x - cx - rx * 0.1 - 1, y - cy - 1, rx * 0.5, ry * 0.5, p2, p1, 0.3) ? 2 : 3);
    }
  }
  for (let i = 0; i < 3; i++) c.cluster(Math.round(cx + rng.spread(rx)), Math.round(cy + ry + 2 + rng.next() * ry * 0.8), rng.int(0, 3), under, 3);
}

/**
 * A water stain run down a wall from row `y` (a leak at a ceiling line, under a pipe): tongues
 * of uneven length with rounded ends, the wall recoloured to `stain` inside them, a darker tide
 * line along their edges and lower ends, a pale washed streak down the middle of the long ones.
 */
export function pwWaterStain(c: PwCanvas, rng: PwRng, x: number, y: number, w: number, len: number, stain: number) {
  const n = Math.max(2, Math.round(w / 9));
  const L = new Float32Array(w);
  for (let i = 0; i < n; i++) {
    const tx = rng.next() * w;
    const hw = 3 + rng.next() * (w / n) * 0.9;
    const tl = len * (0.35 + rng.next() * 0.65) * (1 - Math.abs(tx / w - 0.5) * 0.7);
    for (let q = Math.max(0, Math.floor(tx - hw)); q < Math.min(w, tx + hw); q++) {
      const u = (q - tx) / hw;
      L[q] = Math.max(L[q], tl * Math.pow(1 - u * u, 0.45));
    }
  }
  const inS = (q: number, j: number) => q >= 0 && q < w && j >= 0 && j < L[q];
  for (let q = 0; q < w; q++) {
    for (let j = 0; j < L[q]; j++) {
      const rim = !inS(q - 1, j) || !inS(q + 1, j) || !inS(q, j + 1);
      c.tint(x + q, y + j, stain, rim ? -1 : 0);
    }
    // The washed streak: where the water still runs the wall is a step paler.
    if (L[q] > len * 0.55 && inS(q - 2, 4) && inS(q + 2, 4) && hash2(q >> 1, 0, x) > 0.55) for (let j = 3; j < L[q] - 4; j++) if (hash2(q >> 1, j >> 3, x + 1) > 0.25) c.shift(x + q, y + j, 1, stain);
  }
}

/**
 * A lamp's pool on a wall, as whole tone steps (the bible's §5: light moves paint along its own
 * ramp): two steps up in the core, one in the ring round it, and an outer ring broken into
 * horizontal dashes that thin toward the edge. Never brighter than `cap`.
 */
export function pwLampPool(c: PwCanvas, cx: number, cy: number, rx: number, ry: number, seed = 0, cap = 5) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx;
      const v = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(u * u + v * v);
      if (d > 1) continue;
      let dt = d < 0.4 ? 2 : d < 0.72 ? 1 : hash2(x >> 2, y, seed) > (d - 0.72) / 0.28 ? 1 : 0;
      if (!dt || !c.at(x, y)) continue;
      dt = Math.min(dt, cap - c.toneAt(x, y));
      if (dt > 0) c.shift(x, y, dt);
    }
  }
}

/** Short horizontal scrapes (a trolley's bumper, a bed end) in a band `h` rows high: dark dashes, a few with a lit edge under them. */
export function pwScrapes(c: PwCanvas, rng: PwRng, x: number, y: number, w: number, h: number, n: number, o: { len?: number; only?: number } = {}) {
  for (let i = 0; i < n; i++) {
    const sx = x + Math.floor(rng.next() * w);
    const sy = y + Math.floor(rng.next() * h);
    const len = Math.floor((o.len ?? 14) * (0.4 + rng.next()));
    for (let q = 0; q < len; q++) {
      if (q > len * 0.7 && rng.chance(0.4)) continue;
      c.shift(sx + q, sy, -1, o.only ?? 0);
    }
    if (rng.chance(0.4)) for (let q = 2; q < len - 2; q++) c.shift(sx + q, sy + 1, 1, o.only ?? 0);
  }
}

/**
 * A line painted along a wall (a wayfinding stripe, a dado line) `h` rows high from row `y`,
 * worn the way paint wears: eaten from its upper or lower edge in runs, broken through in a few
 * places — never a dashed line.
 */
export function pwPaintedLine(c: PwCanvas, x: number, y: number, w: number, h: number, ramp: number, seed: number, tone = 3) {
  const f = new PwField(w, 1, 8, seed);
  for (let i = 0; i < w; i++) {
    const n = f.at(i, 0);
    if (n < 0.1) continue; // worn through
    const fromTop = n < 0.22 ? 1 + (hash2((x + i) >> 2, 0, seed) > 0.5 ? 1 : 0) : 0;
    const fromBot = n > 0.8 ? 1 : 0;
    for (let j = fromTop; j < h - fromBot; j++) c.set(x + i, y + j, ramp, j === fromTop ? tone + 1 : tone);
  }
}

/**
 * Mould and damp bloom along a line (under a ceiling, over a skirting): shaped clusters of
 * `ramp`, thick at row `y` and thinning over `depth` rows in direction `dir` (1 = downward).
 */
export function pwBloom(c: PwCanvas, x: number, y: number, w: number, depth: number, dir: 1 | -1, ramp: number, seed: number, amount = 0.5) {
  const fine = new PwField(w, depth * 2, 5, seed);
  const broad = new PwField(w, depth, 11, seed + 1);
  for (let j = 0; j < depth; j++) {
    const fall = 1 - j / depth;
    for (let i = 0; i < w; i++) {
      const n = fine.at(i, j * 2) * 0.65 + broad.at(i, j) * 0.35;
      if (n < amount * fall * fall * 0.72) c.tint(x + i, y + j * dir, ramp, n < amount * fall * fall * 0.4 ? -1 : 0);
    }
  }
}

/**
 * A filled repair in a plastered wall: a patch of `ramp` set a hair proud (lit along its top and
 * left, a dark line under and to its right), sanding strokes across it.
 */
export function pwRepair(c: PwCanvas, x: number, y: number, w: number, h: number, ramp: number, seed: number) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      // Ragged ends: the filler was feathered out by hand.
      const inset = Math.floor(hash2(j >> 1, 0, seed) * 3);
      if (i < inset || i >= w - Math.floor(hash2(j >> 1, 1, seed) * 3)) continue;
      const stroke = (i + j * 2) % 9 === 0 && hash2(i >> 2, j >> 2, seed + 2) > 0.5;
      c.set(x + i, y + j, ramp, j === 0 || i === inset ? 4 : stroke ? 2 : 3);
    }
  }
  c.shade(x + 2, y + h, w - 3, 1, -1);
  c.shade(x + w, y + 2, 1, h - 2, -1);
}

/** A smudge (hands, shoulders, a trolley's corner): an irregular low shape a step darker — never an ellipse. */
export function pwSmudge(c: PwCanvas, rng: PwRng, cx: number, cy: number, rx: number, ry: number, dt = -1) {
  const p1 = rng.next() * 6.28;
  const p2 = rng.next() * 6.28;
  for (let y = Math.floor(cy - ry * 1.6); y <= Math.ceil(cy + ry * 1.6); y++) {
    for (let x = Math.floor(cx - rx * 1.6); x <= Math.ceil(cx + rx * 1.6); x++) {
      // Broken along its edge into dashes (a rubbed mark has no outline).
      if (!blobIn(x - cx, y - cy, rx, ry, p1, p2, 0.3)) continue;
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      if (u * u + v * v > 0.55 && hash2(x >> 1, y, Math.round(cx)) > 0.6) continue;
      c.shift(x, y, dt);
    }
  }
}

/**
 * Paint flaked off in small chips: `n` of them scattered round (cx, cy) within (rx, ry), each a
 * shape of 3–9 texels of the coat underneath with the film's shadow along its top and a lit lip
 * under it. Laid in loose GROUPS by the painters (round a big peel, along a rail, under a leak) —
 * a wall chips where it is knocked or damp, not evenly.
 */
export function pwChips(c: PwCanvas, rng: PwRng, cx: number, cy: number, rx: number, ry: number, n: number, paint: number, under: number) {
  for (let i = 0; i < n; i++) {
    // (Thick near the middle of the group.)
    const x = Math.round(cx + (rng.next() + rng.next() - 1) * rx);
    const y = Math.round(cy + (rng.next() + rng.next() - 1) * ry);
    const w = rng.int(2, 5);
    const h = rng.int(2, 4);
    for (let j = 0; j < h; j++) {
      const inset = j === 0 || j === h - 1 ? rng.int(0, 1) : 0;
      for (let q = inset; q < w - (j === h - 1 ? 1 : 0); q++) {
        if (c.at(x + q, y + j) !== paint) continue;
        c.set(x + q, y + j, under, j === 0 ? 1 : 3);
      }
    }
    for (let q = 1; q < w; q++) if (c.at(x + q, y + h) === paint) c.set(x + q, y + h, paint, 5);
  }
}

/** A rust weep: a thin run down a wall from a fixing at (x, y), `len` texels, a step darker, broken toward its end, a drop at the bottom. */
export function pwWeep(c: PwCanvas, x: number, y: number, len: number, ramp: number, seed: number) {
  let xx = x;
  for (let j = 0; j < len; j++) {
    if (j > len * 0.6 && hash2(x, j >> 1, seed) > 0.6) continue;
    c.tint(xx, y + j, ramp, j < 3 ? -1 : 0);
    if (j < len * 0.3) c.tint(xx + 1, y + j, ramp, 0);
    if (hash2(x, j >> 3, seed + 1) > 0.8) xx += hash2(x, j, seed + 2) > 0.5 ? 1 : -1;
  }
  c.tint(xx, y + len, ramp, -1);
  c.tint(xx + 1, y + len, ramp, -1);
}
