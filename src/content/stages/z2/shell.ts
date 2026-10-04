import * as THREE from 'three';
import { box } from './props';
import type { RoomRect } from './layout';

/**
 * Room shells: floor, ceiling and four walls with door/window openings.
 * Walls are centred on the room boundary (thickness `t`), so a shared wall is
 * built by exactly one of the two rooms (the other passes `null` for that side).
 */

export interface Opening {
  /** Centre along the wall (world x for zMin/zMax walls, world z for xMin/xMax walls). */
  at: number;
  w: number;
  h: number;
  /** Sill height above the wall bottom (windows). */
  y0?: number;
  /** Add a trim frame (default true). */
  frame?: boolean;
}

export interface WallStyle {
  low: THREE.Material;
  high: THREE.Material;
  /** Height of the low (wainscot) band above the wall bottom. */
  lowH: number;
  /** Bumper rail on the inner face at lowH. */
  rail?: THREE.Material;
  /** Skirting board. */
  base?: THREE.Material;
  trim?: THREE.Material;
}

/** undefined → solid wall, null → no wall, [] / [...] → wall with openings. */
export type SideSpec = Opening[] | null | undefined;

export interface ShellSpec extends RoomRect {
  style: WallStyle;
  sides?: { xMin?: SideSpec; xMax?: SideSpec; zMin?: SideSpec; zMax?: SideSpec };
  floor?: THREE.Material | null;
  ceiling?: THREE.Material | null;
  t?: number;
  /** Override wall bottom / top (default y … y + h). */
  wallBottom?: number;
  wallTop?: number;
}

export function buildShell(g: THREE.Object3D, r: ShellSpec) {
  const t = r.t ?? 0.3;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  if (r.floor) box(g, w, 0.2, d, r.floor, cx, r.y - 0.1, cz);
  if (r.ceiling) box(g, w + t, 0.2, d + t, r.ceiling, cx, r.y + r.h + 0.1, cz);
  const yb = r.wallBottom ?? r.y;
  const yt = r.wallTop ?? r.y + r.h;
  const s = r.sides ?? {};
  if (s.zMin !== null) wall(g, 'x', r.x0, r.x1, r.z0, yb, yt, s.zMin ?? [], r.style, t, 1);
  if (s.zMax !== null) wall(g, 'x', r.x0, r.x1, r.z1, yb, yt, s.zMax ?? [], r.style, t, -1);
  if (s.xMin !== null) wall(g, 'z', r.z0, r.z1, r.x0, yb, yt, s.xMin ?? [], r.style, t, 1);
  if (s.xMax !== null) wall(g, 'z', r.z0, r.z1, r.x1, yb, yt, s.xMax ?? [], r.style, t, -1);
}

/**
 * A wall running along `axis` from a0 to a1 at cross-coordinate `c`.
 * `inward` (+1/−1) is the direction of the room interior on the cross axis.
 */
export function wall(
  g: THREE.Object3D,
  axis: 'x' | 'z',
  a0: number,
  a1: number,
  c: number,
  yb: number,
  yt: number,
  openings: Opening[],
  st: WallStyle,
  t: number,
  inward: 1 | -1,
) {
  const ops = [...openings].sort((p, q) => p.at - q.at);
  let cur = a0 - t / 2;
  const end = a1 + t / 2;
  const piece = (p0: number, p1: number, y0: number, y1: number) => {
    if (p1 - p0 < 0.01 || y1 - y0 < 0.01) return;
    const split = yb + st.lowH;
    if (y0 < split) addPiece(g, axis, p0, p1, y0, Math.min(y1, split), c, t, st.low);
    if (y1 > split) addPiece(g, axis, p0, p1, Math.max(y0, split), y1, c, t, st.high);
    // Bumper rail + skirting on the interior face.
    if (st.rail && y0 <= split && y1 >= split + 0.05) addPiece(g, axis, p0, p1, split - 0.05, split + 0.07, c + inward * (t / 2 + 0.03), 0.07, st.rail);
    if (st.base && y0 <= yb + 0.01) addPiece(g, axis, p0, p1, yb, yb + 0.14, c + inward * (t / 2 + 0.015), 0.04, st.base);
  };
  for (const o of ops) {
    const oa = o.at - o.w / 2;
    const ob = o.at + o.w / 2;
    piece(cur, oa, yb, yt);
    const sill = yb + (o.y0 ?? 0);
    const top = sill + o.h;
    if (sill > yb) piece(oa, ob, yb, sill);
    if (top < yt) piece(oa, ob, top, yt);
    if (o.frame !== false && st.trim) {
      const jt = t + 0.08;
      addPiece(g, axis, oa - 0.1, oa, sill, top, c, jt, st.trim);
      addPiece(g, axis, ob, ob + 0.1, sill, top, c, jt, st.trim);
      addPiece(g, axis, oa - 0.1, ob + 0.1, top, top + 0.1, c, jt, st.trim);
      if (sill > yb) addPiece(g, axis, oa - 0.1, ob + 0.1, sill - 0.06, sill, c, jt + 0.04, st.trim);
    }
    cur = ob;
  }
  piece(cur, end, yb, yt);
}

function addPiece(g: THREE.Object3D, axis: 'x' | 'z', p0: number, p1: number, y0: number, y1: number, c: number, t: number, mat: THREE.Material) {
  const len = p1 - p0;
  const h = y1 - y0;
  const mid = (p0 + p1) / 2;
  if (axis === 'x') box(g, len, h, t, mat, mid, (y0 + y1) / 2, c);
  else box(g, t, h, len, mat, c, (y0 + y1) / 2, mid);
}
