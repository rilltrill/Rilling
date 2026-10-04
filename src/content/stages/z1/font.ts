import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';

/**
 * Tiny stroke font for neon signs and painted lettering. Each glyph is a list of
 * line segments on a 4 × 6 grid (x right, y up). Strokes become thin boxes, so a
 * word is a handful of cached box geometries — merged later with the scenery.
 */
type Seg = [number, number, number, number];

const G: Record<string, Seg[]> = {
  A: [[0, 0, 0, 4], [0, 4, 2, 6], [2, 6, 4, 4], [4, 4, 4, 0], [0, 3, 4, 3]],
  B: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [0, 3, 3, 3], [3, 3, 4, 2], [4, 2, 4, 1], [4, 1, 3, 0], [3, 0, 0, 0]],
  C: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0]],
  D: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 1], [4, 1, 3, 0], [3, 0, 0, 0]],
  E: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [0, 3, 3, 3]],
  F: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 3, 3, 3]],
  G: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 2, 3]],
  H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  I: [[2, 0, 2, 6], [1, 6, 3, 6], [1, 0, 3, 0]],
  K: [[0, 0, 0, 6], [0, 3, 4, 6], [0, 3, 4, 0]],
  L: [[0, 6, 0, 0], [0, 0, 4, 0]],
  M: [[0, 0, 0, 6], [0, 6, 2, 3], [2, 3, 4, 6], [4, 6, 4, 0]],
  N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  O: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0]],
  P: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3]],
  Q: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0], [2.5, 1.5, 4.5, -0.5]],
  R: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3], [1.5, 3, 4, 0]],
  S: [[4, 6, 0, 6], [0, 6, 0, 3], [0, 3, 4, 3], [4, 3, 4, 0], [4, 0, 0, 0]],
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  U: [[0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 6]],
  V: [[0, 6, 2, 0], [2, 0, 4, 6]],
  W: [[0, 6, 1, 0], [1, 0, 2, 3], [2, 3, 3, 0], [3, 0, 4, 6]],
  X: [[0, 0, 4, 6], [0, 6, 4, 0]],
  Y: [[0, 6, 2, 3], [4, 6, 2, 3], [2, 3, 2, 0]],
  Z: [[0, 6, 4, 6], [4, 6, 0, 0], [0, 0, 4, 0]],
  '0': [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0]],
  '1': [[2, 0, 2, 6], [2, 6, 1, 5]],
  '2': [[0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0], [0, 0, 4, 0]],
  '3': [[0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0], [1, 3, 4, 3]],
  '4': [[0, 6, 0, 3], [0, 3, 4, 3], [4, 6, 4, 0]],
  '5': [[4, 6, 0, 6], [0, 6, 0, 3], [0, 3, 4, 3], [4, 3, 4, 0], [4, 0, 0, 0]],
  '6': [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3]],
  '7': [[0, 6, 4, 6], [4, 6, 1, 0]],
  '8': [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0], [0, 3, 4, 3]],
  '9': [[4, 3, 0, 3], [0, 3, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0]],
  '.': [[1.8, 0, 2.2, 0]],
  '-': [[1, 3, 3, 3]],
  '+': [[2, 1.5, 2, 4.5], [0.5, 3, 3.5, 3]],
};

/** Width of one glyph cell (grid units) including spacing. */
const ADV = 5.6;

export interface TextOptions {
  /** Letter height in metres. */
  size: number;
  /** Stroke thickness in metres (default size * 0.11). */
  stroke?: number;
  /** Depth of the stroke boxes. */
  depth?: number;
  /** Stack letters vertically (blade signs). */
  vertical?: boolean;
}

/** Width in metres of a horizontal word. */
export function textWidth(text: string, size: number): number {
  const u = size / 6;
  return Math.max(0, text.length * ADV - (ADV - 4)) * u;
}

/**
 * Build a word from stroke boxes into `parent`. The text is centred on the
 * parent's origin in its XY plane, facing +Z.
 */
export function addText(parent: THREE.Object3D, text: string, mat: THREE.Material, o: TextOptions): THREE.Group {
  const g = new THREE.Group();
  const u = o.size / 6;
  const t = o.stroke ?? o.size * 0.11;
  const depth = o.depth ?? t;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i].toUpperCase();
    const segs = G[ch];
    if (!segs) continue;
    let ox: number;
    let oy: number;
    if (o.vertical) {
      ox = -2 * u;
      oy = ((n - 1) / 2 - i) * 7.6 * u - 3 * u;
    } else {
      ox = (i * ADV - (n * ADV - (ADV - 4)) / 2) * u;
      oy = -3 * u;
    }
    for (const [x0, y0, x1, y1] of segs) {
      const dx = (x1 - x0) * u;
      const dy = (y1 - y0) * u;
      const len = Math.hypot(dx, dy) + t;
      const m = Kit.add(g, Kit.box(len, t, depth), mat, ox + (x0 * u + dx / 2), oy + (y0 * u + dy / 2), 0);
      m.rotation.z = Math.atan2(dy, dx);
    }
  }
  parent.add(g);
  return g;
}

/** Height in metres of a vertical (stacked) word. */
export function verticalHeight(text: string, size: number): number {
  const u = size / 6;
  return (text.length - 1) * 7.6 * u + 6 * u;
}
