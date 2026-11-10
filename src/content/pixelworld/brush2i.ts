import type { PwTile } from './atlas';

/**
 * PIXEL WORLD 2 — the INTERIOR brush (docs/PIXELWORLD2.md §4): what the painters of rooms and
 * corridors share. A wall seen from 2–3 m is not a wrap tile with stickers: it is a SEQUENCE OF
 * PANELS, each one painting 6–8 m long and the full height of the wall (plaster, dado, wainscot,
 * skirting and everything fixed to them, in one picture), laid by a hand-written table.
 *
 * This file holds the part of that which is geometry, not paint: where each panel falls along a
 * wall, and which piece of which panel a solid piece of the wall shows (`pwPanelCuts`). The
 * classic shell builds a wall as boxes between its door and window openings; a converter asks,
 * for the room-side face of each box, for its cuts and lays one module rect per cut
 * (`batch.rect(…, { sub, flipU })`). Openings need nothing: there is no box there.
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
