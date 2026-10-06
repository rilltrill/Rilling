import { type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2 } from './surfaces';

/**
 * The lobby T-rex's skull as painted cut-outs (ART: PIXEL WORLD): when the
 * display comes down, the skull falls as three crossed cards in the skull's
 * own frame (the profile, the top, the back) instead of a stack of boxes —
 * from any angle at least one card shows a skull: the cut-out openings (orbit,
 * antorbital and temporal fenestrae, nostril, the jaw's fenestra), the tooth
 * rows, the hanging jaw, fossil-cast bone lit from the upper left with a
 * selective dark outline, cast seams and pitting.
 *
 * Skull frame (metres, as `SkeletonDisplay` builds it, before its −0.18 tilt):
 * x toward the snout (−0.8 … 1.45), y up (−1.1 … 0.65), z across (±0.5).
 */
export const SKULL_PROFILE = { x0: -0.8, y0: -1.1, w: 2.25, h: 1.75 };
export const SKULL_TOP = { x0: -0.8, z0: -0.5, w: 2.25, d: 1.0 };
export const SKULL_BACK = { z0: -0.5, y0: -0.4, d: 1.0, h: 1.0 };
const TPM = 32;
const BONE = 0xdccca4;

type Pt = [number, number];

function inPoly(x: number, y: number, p: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, a = 0): boolean {
  const dx = x - cx;
  const dy = y - cy;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const u = (dx * c + dy * s) / rx;
  const v = (-dx * s + dy * c) / ry;
  return u * u + v * v <= 1;
}

/**
 * Raster a shape: `solid(x, y)` (metres) → 0 outside, 1 bone, 2 tooth, 3 dark (a socket
 * seen through); `toM(u, v)` maps a texel centre to metres. Outline (step 0) where bone
 * meets outside below / right, a lit rim top / left, cast seams and pits.
 */
function raster(c: PwCanvas, k: PwKit, toM: (u: number, v: number) => Pt, solid: (x: number, y: number) => number, seed: number) {
  const bone = k.ramp(BONE, { light: 0.5, sat: 0.7 });
  const tooth = k.ramp(0xf4ecd8, { light: 0.55, sat: 0.5 });
  const dark = k.ramp(0x241a12, { light: 0.4 });
  const W = c.w;
  const H = c.h;
  const m = new Uint8Array(W * H);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const [x, y] = toM(u + 0.5, v + 0.5);
    m[v * W + u] = solid(x, y);
  }
  const at = (u: number, v: number) => (u < 0 || v < 0 || u >= W || v >= H ? 0 : m[v * W + u]);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const s = m[v * W + u];
    if (!s) continue;
    if (s === 3) {
      c.set(u, v, dark, 0.6);
      continue;
    }
    const ramp = s === 2 ? tooth : bone;
    const up = at(u, v - 1);
    const left = at(u - 1, v);
    const down = at(u, v + 1);
    const right = at(u + 1, v);
    let t = s === 2 ? 3.6 : 3;
    if (!down || !right || down === 3 || right === 3) t = s === 2 ? 2.2 : 1; // outline / shadowed edge
    else if (!up || !left || up === 3 || left === 3) t = s === 2 ? 4.6 : 4.2; // lit rim
    else if (s === 1) {
      // Shading: a darker lower third, pits and cast seams.
      const [, y] = toM(u + 0.5, v + 0.5);
      if (hash2(u, v, seed) > 0.93) t = 2;
      else if (hash2(u >> 2, v >> 1, seed + 1) > 0.9) t = 2.4;
      else if (y < -0.25 && v % 3 === 0 && hash2(u >> 1, v, seed + 2) > 0.5) t = 2.4;
    }
    c.set(u, v, ramp, t);
  }
}

/** The skull in profile with the jaw hanging open (72 × 56 = 2.25 × 1.75 m). */
export function skullProfileTile(atlas: PwAtlas): PwTile {
  const W = Math.round(SKULL_PROFILE.w * TPM);
  const H = Math.round(SKULL_PROFILE.h * TPM);
  return atlas.tile('d2skull|profile|1', W, H, (c, k) => {
    const upper: Pt[] = [
      [-0.78, 0.5], [-0.55, 0.6], [-0.2, 0.62], [0.15, 0.48], [0.55, 0.3], [0.95, 0.2], [1.3, 0.1], [1.4, -0.02],
      [1.36, -0.16], [1.05, -0.24], [0.6, -0.3], [0.1, -0.32], [-0.3, -0.34], [-0.62, -0.4], [-0.8, -0.3], [-0.84, 0.1],
    ];
    // The jaw from its hinge (−0.45, −0.32), hanging open 0.42 rad below the skull line.
    const ja = -0.42 - 0.18;
    const jc = Math.cos(ja);
    const js = Math.sin(ja);
    const J = (l: number, o: number): Pt => [-0.45 + l * jc - o * js, -0.32 + l * js + o * jc];
    const jaw: Pt[] = [J(-0.12, 0.08), J(0.6, 0.12), J(1.55, 0.06), J(1.6, -0.05), J(1.0, -0.14), J(0.2, -0.24), J(-0.15, -0.16)];
    const solid = (x: number, y: number): number => {
      // Upper teeth: along the maxilla's lower edge (x 0 … 1.3), pointing down.
      if (x > -0.05 && x < 1.3 && y < -0.2 && y > -0.52) {
        const i = Math.floor((x + 0.05) / 0.13);
        const cx = -0.05 + (i + 0.5) * 0.13;
        const len = 0.22 - Math.abs(cx - 0.45) * 0.1;
        const edge = -0.26 - (cx - 0.1) * 0.06;
        const t = (edge - y) / len;
        if (t > 0 && t < 1 && Math.abs(x - cx) < 0.045 * (1 - t)) return 2;
      }
      // Lower teeth: up from the jaw's top edge.
      for (let i = 0; i < 7; i++) {
        const l = 0.3 + i * 0.17;
        const [bx, by] = J(l, 0.1);
        const len = 0.16;
        const dx = x - bx;
        const dy = y - by;
        // In the jaw frame: along the tooth (normal to the jaw, up) and across.
        const along = -dx * js + dy * jc;
        const across = dx * jc + dy * js;
        if (along > 0 && along < len && Math.abs(across) < 0.04 * (1 - along / len)) return 2;
      }
      if (inPoly(x, y, jaw)) {
        const [fx, fy] = J(0.3, -0.04);
        return inEllipse(x, y, fx, fy, 0.14, 0.05, ja) ? 0 : 1;
      }
      if (!inPoly(x, y, upper)) return 0;
      // Openings: lateral temporal, orbit, antorbital fenestra, nostril (cut out); the brow ridge stays.
      if (inEllipse(x, y, -0.52, 0.08, 0.12, 0.22, 0.2)) return 0;
      if (inEllipse(x, y, -0.16, 0.22, 0.12, 0.14)) return 3;
      if (inEllipse(x, y, 0.36, 0.03, 0.24, 0.12, -0.12)) return 0;
      if (inEllipse(x, y, 1.18, 0.0, 0.07, 0.045)) return 3;
      return 1;
    };
    raster(c, k, (u, v) => [SKULL_PROFILE.x0 + u / TPM, SKULL_PROFILE.y0 + SKULL_PROFILE.h - v / TPM], solid, 211);
  });
}

/** The skull from above (72 × 32 = 2.25 × 1 m): a wedge from the broad back to the snout, the openings in pairs. */
export function skullTopTile(atlas: PwAtlas): PwTile {
  const W = Math.round(SKULL_TOP.w * TPM);
  const H = Math.round(SKULL_TOP.d * TPM);
  return atlas.tile('d2skull|top|1', W, H, (c, k) => {
    const solid = (x: number, z: number): number => {
      if (x < -0.78 || x > 1.4) return 0;
      const t = (x + 0.78) / 2.18;
      const half = 0.44 * (1 - t) + 0.13 * t - (x > 1.25 ? (x - 1.25) * 0.6 : 0);
      if (Math.abs(z) > half) return 0;
      const az = Math.abs(z);
      if (inEllipse(x, az, -0.5, 0.24, 0.16, 0.09)) return 0;
      if (inEllipse(x, az, -0.16, 0.3, 0.1, 0.07)) return 3;
      if (inEllipse(x, az, 0.36, 0.17, 0.22, 0.05)) return 3;
      return 1;
    };
    raster(c, k, (u, v) => [SKULL_TOP.x0 + u / TPM, SKULL_TOP.z0 + SKULL_TOP.d - v / TPM], solid, 223);
  });
}

/** The back of the skull (32 × 32 = 1 × 1 m): the occiput round the dark foramen, the jaw hinges. */
export function skullBackTile(atlas: PwAtlas): PwTile {
  const N = Math.round(SKULL_BACK.d * TPM);
  return atlas.tile('d2skull|back|1', N, N, (c, k) => {
    const solid = (z: number, y: number): number => {
      const az = Math.abs(z);
      if (y > 0.55 || y < -0.38) return 0;
      const half = y > 0.2 ? 0.44 - (y - 0.2) * 0.9 : y > -0.2 ? 0.44 : 0.44 - (-0.2 - y) * 1.2;
      if (az > half) return 0;
      if (inEllipse(z, y, 0, 0.05, 0.07, 0.07)) return 3;
      if (inEllipse(az, y, 0.24, 0.22, 0.09, 0.12)) return 0;
      return 1;
    };
    raster(c, k, (u, v) => [SKULL_BACK.z0 + u / TPM, SKULL_BACK.y0 + SKULL_BACK.h - v / TPM], solid, 227);
  });
}
