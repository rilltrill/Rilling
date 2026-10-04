import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { Rng } from '../../../core/Rng';
import { C, G, M, MD } from './mats';

/**
 * Procedural hospital props. Everything is built from cached Kit primitives in
 * a local frame (facing +Z, floor at y = 0) inside a sub-group placed at
 * (x, y, z) rotated by `ry`, so the stage baker can merge it.
 */

type O = THREE.Object3D;

/** Box centred at (x, y, z). */
export function box(g: O, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(Kit.box(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

/** Box standing on y0. */
export function blk(g: O, w: number, h: number, d: number, mat: THREE.Material, x: number, y0: number, z: number, ry = 0): THREE.Mesh {
  return box(g, w, h, d, mat, x, y0 + h / 2, z, ry);
}

export function cyl(g: O, rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 8, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(Kit.cyl(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

export function grp(g: O, x: number, y: number, z: number, ry = 0): THREE.Group {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
  return s;
}

const steel = () => M(C.steel, 'metal', 2, 0.5);
const rubber = () => M(0x1c1e1e);
const white = () => M(0xd6dcd6);

// ─── Medical furniture ──────────────────────────────────────────────────────

export interface GurneyOpts {
  sheet?: number;
  body?: boolean;
  blood?: boolean;
  tipped?: boolean;
}

export function gurney(g: O, x: number, y: number, z: number, ry: number, o: GurneyOpts = {}): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const h = o.tipped ? null : s;
  const root = h ?? grp(s, 0, 0.33, 0, 0);
  if (o.tipped) root.rotation.z = Math.PI / 2 - 0.08;
  const st = steel();
  // Frame + legs + wheels.
  blk(root, 0.62, 0.06, 1.95, st, 0, 0.78, 0);
  for (const sx of [-0.26, 0.26]) {
    for (const sz of [-0.85, 0.85]) {
      cyl(root, 0.022, 0.022, 0.72, st, sx, 0.42, sz, 5);
      cyl(root, 0.06, 0.06, 0.05, rubber(), sx, 0.06, sz, 6, 0, 0, Math.PI / 2);
    }
  }
  box(root, 0.6, 0.04, 0.04, st, 0, 0.24, -0.85);
  box(root, 0.6, 0.04, 0.04, st, 0, 0.24, 0.85);
  // Side rails.
  box(root, 0.03, 0.2, 1.2, st, 0.31, 0.95, 0);
  box(root, 0.03, 0.2, 1.2, st, -0.31, 0.95, 0);
  // Mattress + sheet.
  blk(root, 0.58, 0.1, 1.9, M(0x2e4f63), 0, 0.84, 0);
  const sheet = M(o.sheet ?? C.sheet, 'cloth', 1, 0.6);
  blk(root, 0.6, 0.03, 1.6, sheet, 0, 0.94, 0.12);
  blk(root, 0.4, 0.1, 0.32, white(), 0, 0.94, -0.75);
  if (o.body) {
    // A shape under the sheet.
    box(root, 0.44, 0.22, 1.1, sheet, 0, 1.04, 0.2);
    box(root, 0.3, 0.2, 0.28, sheet, 0, 1.06, -0.52);
    box(root, 0.14, 0.18, 0.16, sheet, 0.1, 1.04, 0.86);
    box(root, 0.14, 0.18, 0.16, sheet, -0.1, 1.04, 0.86);
    // A grey arm slipping out.
    box(root, 0.08, 0.06, 0.5, M(0x8a9488), 0.32, 0.95, 0.1, 0.2, 0, -0.5);
  }
  if (o.blood) {
    blk(root, 0.42, 0.012, 0.5, M(C.blood), 0.04, 0.965, 0.2);
    blk(root, 0.2, 0.012, 0.3, M(C.bloodFresh), -0.1, 0.97, -0.25);
  }
  return s;
}

export function wheelchair(g: O, x: number, y: number, z: number, ry: number, tipped = false): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const r = tipped ? grp(s, 0, 0.32, 0, 0) : s;
  if (tipped) r.rotation.z = 1.45;
  const st = steel();
  const seat = M(0x1f2a30);
  blk(r, 0.46, 0.05, 0.44, seat, 0, 0.48, 0);
  box(r, 0.46, 0.46, 0.05, seat, 0, 0.78, -0.22, 0, -0.12);
  for (const sx of [-0.27, 0.27]) {
    cyl(r, 0.3, 0.3, 0.03, rubber(), sx, 0.3, -0.05, 12, 0, 0, Math.PI / 2);
    cyl(r, 0.05, 0.05, 0.035, st, sx, 0.3, -0.05, 6, 0, 0, Math.PI / 2);
    cyl(r, 0.07, 0.07, 0.03, rubber(), sx * 0.85, 0.07, 0.3, 8, 0, 0, Math.PI / 2);
    box(r, 0.03, 0.03, 0.4, st, sx * 0.95, 0.68, 0.0);
    cyl(r, 0.015, 0.015, 0.5, st, sx * 0.92, 0.75, -0.25, 5, -0.12);
    box(r, 0.04, 0.03, 0.18, st, sx * 0.6, 0.2, 0.36, 0, 0.5);
  }
  return s;
}

export function ivStand(g: O, x: number, y: number, z: number, bag = 0xd8e8d0, liquid = 0xc8d8a0): THREE.Group {
  const s = grp(g, x, y, z, 0);
  const st = steel();
  cyl(s, 0.015, 0.015, 1.95, st, 0, 0.98, 0, 5);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    box(s, 0.28, 0.025, 0.035, st, Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14, -a);
  }
  box(s, 0.34, 0.02, 0.02, st, 0, 1.92, 0);
  blk(s, 0.14, 0.22, 0.05, M(bag), 0.12, 1.6, 0);
  blk(s, 0.12, 0.1, 0.055, M(liquid), 0.12, 1.61, 0);
  cyl(s, 0.006, 0.006, 0.9, M(0xc8d0c8), 0.13, 1.15, 0.02, 4, 0.1);
  return s;
}

export interface BedOpts {
  sheet?: number;
  blood?: number;
  messy?: boolean;
  body?: boolean;
}

/** Hospital bed, head at local -Z (against the wall), foot at +Z. */
export function bed(g: O, x: number, y: number, z: number, ry: number, rng: Rng, o: BedOpts = {}): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const st = steel();
  const frame = M(0xb8beb8, 'metal', 2, 0.35);
  blk(s, 0.96, 0.1, 2.05, st, 0, 0.42, 0);
  for (const sx of [-0.42, 0.42]) {
    for (const sz of [-0.92, 0.92]) {
      blk(s, 0.05, 0.42, 0.05, st, sx, 0, sz);
      cyl(s, 0.05, 0.05, 0.05, rubber(), sx, 0.05, sz, 6, 0, 0, Math.PI / 2);
    }
  }
  // Head/foot boards.
  blk(s, 1.0, 0.78, 0.06, frame, 0, 0.4, -1.02);
  blk(s, 1.0, 0.45, 0.05, frame, 0, 0.42, 1.02);
  box(s, 0.9, 0.05, 0.06, M(0x6a7270), 0, 0.84, 1.02);
  // Rails.
  for (const sx of [-0.5, 0.5]) {
    box(s, 0.03, 0.03, 1.0, st, sx, 0.82, -0.2);
    box(s, 0.03, 0.03, 1.0, st, sx, 0.66, -0.2);
  }
  const sheet = M(o.sheet ?? C.sheet, 'cloth', 1, 0.6);
  blk(s, 0.9, 0.16, 1.95, M(0x6a8a94), 0, 0.52, 0);
  if (o.messy) {
    box(s, 0.95, 0.06, 1.0, sheet, 0.05, 0.71, 0.45, 0.25, 0.12, 0.06);
    box(s, 0.6, 0.05, 0.6, sheet, -0.35, 0.36, 0.7, 0.4, 0, 1.2);
  } else {
    blk(s, 0.94, 0.05, 1.5, sheet, 0, 0.68, 0.22);
    blk(s, 0.96, 0.06, 0.18, sheet, 0, 0.66, -0.55);
  }
  blk(s, 0.6, 0.12, 0.34, white(), 0, 0.68, -0.78);
  if (o.body) {
    box(s, 0.5, 0.24, 1.2, sheet, 0, 0.86, 0.2);
    box(s, 0.3, 0.22, 0.3, sheet, 0, 0.88, -0.62);
  }
  if (o.blood !== undefined) {
    blk(s, 0.5 + rng.range(0, 0.3), 0.012, 0.6 + rng.range(0, 0.4), M(o.blood), rng.spread(0.15), 0.735, rng.range(-0.3, 0.4));
    blk(s, 0.3, 0.012, 0.3, M(C.bloodDark), rng.spread(0.2), 0.74, -0.6);
  }
  return s;
}

/** Wall-mounted vitals monitor with a glowing trace. */
export function monitor(g: O, x: number, y: number, z: number, ry: number, on = true, color: number = C.screen): THREE.Group {
  const s = grp(g, x, y, z, ry);
  blk(s, 0.42, 0.32, 0.12, M(0x2a2e30), 0, 0, 0);
  box(s, 0.36, 0.25, 0.01, on ? G(0x0a2418, 1) : M(0x101414), 0, 0.16, 0.062);
  if (on) {
    // Jagged trace.
    const pts = [0, 0, 0.05, -0.06, 0.09, 0, 0, 0];
    for (let i = 0; i < pts.length; i++) box(s, 0.04, 0.012, 0.01, G(color, 1.3), -0.15 + i * 0.043, 0.16 + pts[i], 0.068);
    box(s, 0.05, 0.02, 0.01, G(0xff5040, 1.2), 0.13, 0.25, 0.068);
  }
  return s;
}

export function bedside(g: O, x: number, y: number, z: number, ry: number): THREE.Group {
  const s = grp(g, x, y, z, ry);
  blk(s, 0.45, 0.75, 0.42, M(0xa8b0aa), 0, 0, 0);
  box(s, 0.4, 0.01, 0.01, M(0x5a605c), 0, 0.5, 0.215);
  box(s, 0.08, 0.02, 0.02, steel(), 0, 0.6, 0.22);
  blk(s, 0.08, 0.12, 0.08, M(0xc8d8e0), -0.1, 0.75, 0.05);
  return s;
}

/** Row of linked waiting-room chairs along local X. */
export function chairRow(g: O, x: number, y: number, z: number, ry: number, n: number, color = 0x2f5a8a, missing: number[] = []): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const st = steel();
  const mat = M(color);
  const w = 0.56;
  const x0 = (-(n - 1) * w) / 2;
  blk(s, n * w, 0.05, 0.08, st, 0, 0.36, 0);
  for (let i = 0; i < n; i++) {
    const cx = x0 + i * w;
    if (!missing.includes(i)) {
      blk(s, 0.5, 0.06, 0.46, mat, cx, 0.42, 0.02);
      box(s, 0.5, 0.48, 0.05, mat, cx, 0.72, -0.22, 0, -0.12);
    }
  }
  for (let i = 0; i <= n; i += Math.max(1, Math.floor(n / 2))) {
    const cx = x0 - w / 2 + i * w;
    blk(s, 0.05, 0.38, 0.4, st, Math.min(cx, -x0 + w / 2), 0, 0);
  }
  return s;
}

export function vending(g: O, x: number, y: number, z: number, ry: number, color: number, lit = true, rng?: Rng): THREE.Group {
  const s = grp(g, x, y, z, ry);
  blk(s, 1.0, 1.95, 0.85, M(color), 0, 0, 0);
  blk(s, 0.06, 1.8, 0.04, M(0x1a1a1a), 0.22, 0.08, 0.43);
  // Product window.
  box(s, 0.62, 1.2, 0.02, lit ? G(0x8fb8c8, 0.55) : M(0x1c2428), -0.12, 1.15, 0.43);
  const cols = [0xd02a2a, 0x2a7ad0, 0xe0c020, 0x30a050, 0xe07020, 0xb040c0];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (rng && rng.chance(0.25)) continue;
      const k = rng ? rng.pick(cols) : cols[(r + c) % cols.length];
      box(s, 0.08, 0.14, 0.04, lit ? G(k, 0.9) : M(k), -0.36 + c * 0.12, 0.7 + r * 0.22, 0.45);
    }
  }
  box(s, 0.62, 0.12, 0.03, lit ? G(0xffffff, 1.1) : M(0x8a8a8a), -0.12, 1.86, 0.43);
  box(s, 0.5, 0.12, 0.06, M(0x111111), -0.12, 0.3, 0.44);
  return s;
}

/** Reception / nurse-station counter (front faces +Z), `w` wide. */
export function counter(g: O, x: number, y: number, z: number, ry: number, w: number, rng: Rng, screens = 2): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const front = M(0x5c7a74, 'planks', 1.5, 0.35);
  const top = M(0xb9b3a2);
  blk(s, w, 1.1, 0.12, front, 0, 0, 0.4);
  blk(s, w + 0.1, 0.05, 0.38, top, 0, 1.1, 0.42);
  blk(s, w, 0.75, 0.7, M(0x7a7a70), 0, 0, -0.2);
  blk(s, w, 0.04, 0.75, top, 0, 0.75, -0.2);
  box(s, w, 0.05, 0.02, G(0x48c8b0, 0.7), 0, 0.95, 0.465);
  for (let i = 0; i < screens; i++) {
    const sx = -w / 2 + (w / screens) * (i + 0.5) + rng.spread(0.15);
    const t = grp(s, sx, 0.79, -0.25, Math.PI + rng.spread(0.3));
    blk(t, 0.06, 0.18, 0.06, M(0x202020), 0, 0, 0);
    blk(t, 0.52, 0.36, 0.05, M(0x1e2124), 0, 0.16, 0);
    box(t, 0.46, 0.3, 0.01, rng.chance(0.7) ? G(rng.pick([0x2a6aa8, 0x3a8a6a, 0x1a3a8a]), 0.9) : M(0x0c0c0c), 0, 0.34, -0.03);
    blk(t, 0.45, 0.02, 0.16, M(0x2a2a2a), 0, -0.0, -0.35);
  }
  // Papers / files.
  for (let i = 0; i < 4; i++) {
    blk(s, 0.22, 0.02 + rng.range(0, 0.05), 0.3, M(rng.pick([0xe8e8e0, 0xd8d0a0, 0xa8c8e0])), rng.spread(w / 2 - 0.3), 0.79, -0.25 + rng.spread(0.2), rng.spread(0.4));
  }
  return s;
}

export function crashCart(g: O, x: number, y: number, z: number, ry: number): THREE.Group {
  const s = grp(g, x, y, z, ry);
  blk(s, 0.7, 0.95, 0.5, M(0xb02828), 0, 0.08, 0);
  for (let i = 0; i < 4; i++) box(s, 0.66, 0.01, 0.01, M(0x5a1010), 0, 0.3 + i * 0.2, 0.255);
  for (let i = 0; i < 4; i++) box(s, 0.2, 0.025, 0.03, steel(), 0, 0.22 + i * 0.2, 0.26);
  blk(s, 0.42, 0.22, 0.3, M(0xe0d040), -0.08, 1.03, 0);
  box(s, 0.2, 0.12, 0.01, G(0x40ff80, 0.8), -0.08, 1.16, 0.15);
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.18, 0.18]) cyl(s, 0.04, 0.04, 0.04, rubber(), sx, 0.04, sz, 6, 0, 0, Math.PI / 2);
  return s;
}

export function laundryCart(g: O, x: number, y: number, z: number, ry: number): THREE.Group {
  const s = grp(g, x, y, z, ry);
  blk(s, 0.9, 0.06, 0.55, steel(), 0, 0.12, 0);
  blk(s, 0.86, 0.7, 0.5, M(0x3a5a8a, 'cloth', 1, 0.6), 0, 0.18, 0);
  box(s, 0.6, 0.18, 0.45, M(C.sheet, 'cloth', 1, 0.5), 0.05, 0.92, 0.02, 0, 0.2, 0.1);
  box(s, 0.3, 0.1, 0.3, M(C.blood), -0.2, 0.98, 0.0);
  for (const sx of [-0.38, 0.38]) for (const sz of [-0.2, 0.2]) cyl(s, 0.05, 0.05, 0.04, rubber(), sx, 0.05, sz, 6, 0, 0, Math.PI / 2);
  return s;
}

export function fireExt(g: O, x: number, y: number, z: number, ry: number): THREE.Group {
  const s = grp(g, x, y, z, ry);
  cyl(s, 0.09, 0.09, 0.5, M(0xc81e1e), 0, 0.25, 0.1, 8);
  cyl(s, 0.03, 0.04, 0.1, M(0x222222), 0, 0.55, 0.1, 6);
  box(s, 0.3, 0.18, 0.02, G(0xff3020, 0.9), 0, 0.85, 0.01);
  return s;
}

export function wallClock(g: O, x: number, y: number, z: number, ry: number): THREE.Group {
  const s = grp(g, x, y, z, ry);
  cyl(s, 0.2, 0.2, 0.05, M(0x1a1a1a), 0, 0, 0.02, 12, Math.PI / 2);
  cyl(s, 0.17, 0.17, 0.02, M(0xe8e8e0), 0, 0, 0.045, 12, Math.PI / 2);
  box(s, 0.02, 0.12, 0.01, M(0x111111), 0.02, 0.04, 0.06, 0, 0, -0.4);
  box(s, 0.015, 0.15, 0.01, M(0x111111), -0.03, 0.05, 0.062, 0, 0, 0.6);
  return s;
}

export function trashBin(g: O, x: number, y: number, z: number, tipped = false): THREE.Group {
  const s = grp(g, x, y, z, 0);
  if (tipped) {
    cyl(s, 0.2, 0.17, 0.55, M(0x3a5a4a), 0, 0.2, 0, 8, Math.PI / 2 - 0.1);
    box(s, 0.4, 0.04, 0.5, M(0xd8d8d0), 0.1, 0.02, 0.45, 0.4);
  } else {
    cyl(s, 0.2, 0.17, 0.6, M(0x3a5a4a), 0, 0.3, 0, 8);
    cyl(s, 0.21, 0.21, 0.04, M(0x2a3a30), 0, 0.62, 0, 8);
  }
  return s;
}

export function plant(g: O, x: number, y: number, z: number, rng: Rng): THREE.Group {
  const s = grp(g, x, y, z, 0);
  cyl(s, 0.25, 0.2, 0.45, M(0x6a4a3a), 0, 0.22, 0, 8);
  const leaf = M(0x4a5a2a);
  const dead = M(0x7a6a3a);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.spread(0.3);
    const m = box(s, 0.12, 0.7, 0.03, rng.chance(0.5) ? leaf : dead, Math.cos(a) * 0.12, 0.75, Math.sin(a) * 0.12, -a, 0, 0);
    m.rotation.set(Math.sin(a) * 0.6, -a, -Math.cos(a) * 0.6);
  }
  return s;
}

export function whiteboard(g: O, x: number, y: number, z: number, ry: number, rng: Rng): THREE.Group {
  const s = grp(g, x, y, z, ry);
  box(s, 1.6, 1.0, 0.04, M(0x8a8f90), 0, 0, 0);
  box(s, 1.5, 0.9, 0.01, M(0xd8dcd8), 0, 0, 0.025);
  const ink = [M(0x203a8a), M(0xa02020), M(0x205a30)];
  for (let r = 0; r < 6; r++) {
    const len = rng.range(0.3, 1.2);
    box(s, len, 0.03, 0.005, rng.pick(ink), -0.65 + len / 2, 0.35 - r * 0.13, 0.033);
  }
  // Bloody hand-swipe.
  box(s, 0.5, 0.14, 0.005, M(C.bloodFresh), 0.3, -0.15, 0.034, 0, 0, -0.5);
  return s;
}

// ─── Lights / ceiling fixtures ─────────────────────────────────────────────

/** Recessed fluorescent panel; returns the diffuser mesh (for flicker). */
export function ceilingPanel(g: O, x: number, y: number, z: number, ry: number, on: boolean, warm = false): THREE.Mesh {
  const s = grp(g, x, y, z, ry);
  box(s, 0.66, 0.05, 1.26, M(0xb8bcb4), 0, -0.02, 0);
  const diff = box(s, 0.58, 0.03, 1.18, on ? G(warm ? C.panelWarm : C.panel, 1.15) : M(0x3a403c), 0, -0.05, 0);
  return diff;
}

/** Wall-mounted green EXIT sign (front faces +Z). */
export function exitSign(g: O, x: number, y: number, z: number, ry: number, label = 'EXIT'): THREE.Group {
  const s = grp(g, x, y, z, ry);
  box(s, 0.62, 0.24, 0.08, M(0x1d2420), 0, 0, 0);
  const px = 0.028;
  const w = (label.length * 6 - 1) * px;
  box(s, w + 0.06, 0.24 - 0.04, 0.01, G(0x0a3a18, 1), 0, 0, 0.045);
  // Glyphs approximated by the font module would be heavier; a solid glowing bar reads as a sign at range.
  box(s, w, 0.1, 0.012, G(C.exit, 1.4), 0, 0, 0.05);
  return s;
}

/** Caged red emergency lamp (static part). Returns the lamp holder group. */
export function emergencyLamp(g: O, x: number, y: number, z: number, ry: number): THREE.Group {
  const s = grp(g, x, y, z, ry);
  box(s, 0.22, 0.08, 0.14, M(0x2a2a2a), 0, 0, 0.0);
  cyl(s, 0.08, 0.09, 0.12, G(C.red, 1.6), 0, -0.1, 0.0, 8);
  return s;
}

// ─── Gore & mess ────────────────────────────────────────────────────────────

/** Flat smear on a floor (y = floor). */
export function smear(g: O, x: number, y: number, z: number, len: number, w: number, ry: number, color: number = C.blood): void {
  box(g, w, 0.012, len, M(color), x, y + 0.008, z, ry);
}

export function bloodPool(g: O, x: number, y: number, z: number, r: number, rng: Rng): void {
  const mat = M(C.bloodDark);
  cyl(g, r, r, 0.012, mat, x, y + 0.006, z, 10);
  for (let i = 0; i < 4; i++) {
    const a = rng.next() * Math.PI * 2;
    const rr = r * rng.range(0.25, 0.5);
    cyl(g, rr, rr, 0.012, M(C.blood), x + Math.cos(a) * r * 0.9, y + 0.007, z + Math.sin(a) * r * 0.9, 8);
  }
}

/** Drag trail: series of overlapping smears from (x0,z0) to (x1,z1). */
export function dragTrail(g: O, x0: number, z0: number, x1: number, z1: number, y: number, rng: Rng): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const n = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    smear(g, x0 + dx * k + rng.spread(0.1), y + i * 0.0004, z0 + dz * k + rng.spread(0.1), (len / n) * 1.1, rng.range(0.1, 0.2), ry + rng.spread(0.15), rng.chance(0.2) ? C.blood : C.bloodDark);
  }
}

/** Bloody hand prints / smear on a wall. Wall plane faces +Z in the sub-group. */
export function wallSmear(g: O, x: number, y: number, z: number, ry: number, rng: Rng, big = false): void {
  const s = grp(g, x, y, z, ry);
  const mat = M(rng.chance(0.5) ? C.bloodFresh : C.blood);
  if (big) {
    box(s, 0.9, 0.5, 0.01, mat, 0, 0, 0, 0, 0, rng.spread(0.4));
    for (let i = 0; i < 4; i++) box(s, 0.05, rng.range(0.3, 0.8), 0.01, mat, -0.35 + i * 0.22, -0.4, 0.002);
  }
  for (let i = 0; i < 3; i++) {
    const hx = rng.spread(0.5);
    const hy = rng.spread(0.3);
    box(s, 0.1, 0.12, 0.01, mat, hx, hy, 0.004);
    for (let f = 0; f < 4; f++) box(s, 0.02, 0.07, 0.01, mat, hx - 0.04 + f * 0.027, hy + 0.09, 0.004, 0, 0, (f - 1.5) * 0.15);
    box(s, 0.03, rng.range(0.15, 0.45), 0.01, mat, hx, hy - 0.2, 0.004);
  }
}

/** Scattered papers / charts on a floor area. */
export function papers(g: O, cx: number, cz: number, rx: number, rz: number, n: number, y: number, rng: Rng): void {
  const mats = [MD(0xe8e8e0), MD(0xd8d4b8), MD(0xc8d8e8), MD(0xe0e0d8)];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(Kit.box(0.21, 0.004, 0.29), rng.pick(mats));
    m.position.set(cx + rng.spread(rx), y + 0.012 + i * 0.0002, cz + rng.spread(rz));
    m.rotation.set(rng.spread(0.05), rng.next() * Math.PI, rng.spread(0.05));
    g.add(m);
  }
}

export function bodyBag(g: O, x: number, y: number, z: number, ry: number): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const mat = M(0x1c2a26, 'cloth', 1, 0.5);
  box(s, 0.55, 0.26, 1.7, mat, 0, 0.13, 0);
  box(s, 0.4, 0.24, 0.35, mat, 0, 0.14, -0.95);
  box(s, 0.02, 0.01, 1.9, M(0x7a7a6a), 0.08, 0.265, -0.1);
  return s;
}

/** A corpse lying on the floor (simple humanoid boxes). */
export function corpse(g: O, x: number, y: number, z: number, ry: number, rng: Rng, shirt = 0x8fb4c4): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const skin = M(rng.pick([0x8a9a80, 0x9aa08a, 0x7a8a7a]));
  const cloth = M(shirt, 'cloth', 1, 0.5);
  box(s, 0.42, 0.18, 0.62, cloth, 0, 0.09, 0);
  box(s, 0.22, 0.2, 0.24, skin, 0.03, 0.1, 0.48, 0.3);
  box(s, 0.12, 0.1, 0.6, cloth, 0.3, 0.06, 0.1, -0.5);
  box(s, 0.12, 0.1, 0.55, skin, -0.32, 0.06, 0.25, 0.7);
  box(s, 0.16, 0.12, 0.8, M(0x3a3f4a), 0.1, 0.06, -0.68, 0.1);
  box(s, 0.16, 0.12, 0.8, M(0x3a3f4a), -0.12, 0.06, -0.7, -0.15);
  bloodPool(s, 0.1, 0, 0.3, 0.55, rng);
  return s;
}

// ─── Morgue / surgery ───────────────────────────────────────────────────────

/** Wall of morgue cold-storage doors; front faces +Z. Returns the door slot centres (local). */
export function morgueWall(g: O, x: number, y: number, z: number, ry: number, cols: number, rows: number, skip: Set<string>): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const w = cols * 0.78;
  const st = M(C.steel, 'metal', 3, 0.6);
  blk(s, w + 0.2, rows * 0.72 + 0.35, 0.4, M(0x6a7476, 'metal', 2, 0.5), 0, 0, -0.2);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cx = -w / 2 + 0.39 + c * 0.78;
      const cy = 0.25 + 0.36 + r * 0.72;
      if (skip.has(`${c},${r}`)) {
        box(s, 0.66, 0.6, 0.02, M(0x0b0f10), cx, cy, 0.005);
        continue;
      }
      box(s, 0.68, 0.62, 0.04, st, cx, cy, 0.02);
      box(s, 0.06, 0.2, 0.05, M(0x3a3e40), cx + 0.26, cy, 0.05);
      box(s, 0.18, 0.08, 0.01, M(0xe8e4d0), cx - 0.14, cy + 0.18, 0.045);
    }
  }
  return s;
}

/** Steel autopsy table (long axis along local Z). */
export function autopsyTable(g: O, x: number, y: number, z: number, ry: number, rng: Rng, o: { body?: boolean; open?: boolean } = {}): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const st = M(C.steel, 'metal', 3, 0.5);
  blk(s, 0.32, 0.8, 0.32, M(C.steelDark), 0, 0, 0);
  blk(s, 0.9, 0.06, 2.1, st, 0, 0.82, 0);
  box(s, 0.9, 0.08, 0.04, st, 0, 0.92, 1.03);
  box(s, 0.9, 0.08, 0.04, st, 0, 0.92, -1.03);
  box(s, 0.04, 0.08, 2.1, st, 0.45, 0.92, 0);
  box(s, 0.04, 0.08, 2.1, st, -0.45, 0.92, 0);
  blk(s, 0.12, 0.05, 0.12, M(0x1a1a1a), 0, 0.86, 0.85);
  if (o.body) {
    const sheet = M(0xb8c4c0, 'cloth', 1, 0.5);
    box(s, 0.55, 0.26, 1.2, sheet, 0, 1.0, 0.1);
    box(s, 0.3, 0.24, 0.3, sheet, 0, 1.0, -0.72);
    box(s, 0.12, 0.2, 0.14, sheet, 0.1, 0.98, 0.82);
    box(s, 0.12, 0.2, 0.14, sheet, -0.1, 0.98, 0.82);
    box(s, 0.12, 0.02, 0.1, M(0xd8d0c0), 0.12, 0.9, 0.98); // toe tag
    if (o.open) box(s, 0.4, 0.02, 0.5, M(C.bloodFresh), 0, 1.135, 0.0);
  } else {
    blk(s, 0.5, 0.012, 0.7, M(C.blood), rng.spread(0.15), 0.88, rng.spread(0.4));
  }
  // Instrument tray on a stand.
  const t = grp(s, 0.75, 0, -0.5, 0);
  cyl(t, 0.02, 0.02, 1.0, st, 0, 0.5, 0, 5);
  blk(t, 0.45, 0.03, 0.32, st, 0, 1.0, 0);
  for (let i = 0; i < 4; i++) box(t, 0.02, 0.01, 0.18, M(0xd0d8dc), -0.15 + i * 0.1, 1.04, 0, rng.spread(0.3));
  return s;
}

/** Big round surgical lamp hanging from the ceiling at `yCeil`. */
export function surgicalLamp(g: O, x: number, yCeil: number, z: number, lampY: number): THREE.Group {
  const s = grp(g, x, 0, z, 0);
  const arm = M(0xd8dcd8);
  cyl(s, 0.12, 0.12, 0.1, arm, 0, yCeil - 0.05, 0, 8);
  cyl(s, 0.05, 0.05, yCeil - lampY - 0.3, arm, 0, (yCeil + lampY + 0.3) / 2, 0, 6);
  for (const sx of [-0.55, 0.55]) {
    const h = grp(s, sx, lampY, 0.1 * Math.sign(sx), 0);
    cyl(h, 0.42, 0.5, 0.18, arm, 0, 0, 0, 12);
    cyl(h, 0.44, 0.44, 0.02, G(0xfffbe8, 1.6), 0, -0.1, 0, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cyl(h, 0.08, 0.08, 0.02, G(0xffffff, 2), Math.cos(a) * 0.26, -0.11, Math.sin(a) * 0.26, 8);
    }
  }
  box(s, 1.1, 0.06, 0.06, arm, 0, lampY + 0.25, 0);
  return s;
}

export function opTable(g: O, x: number, y: number, z: number, ry: number, rng: Rng): THREE.Group {
  const s = grp(g, x, y, z, ry);
  blk(s, 0.4, 0.75, 0.6, M(0x5a6266), 0, 0, 0);
  blk(s, 0.7, 0.12, 2.1, M(0x2a4a5a), 0, 0.78, 0);
  blk(s, 0.72, 0.03, 2.0, M(0x6a9a8a, 'cloth', 1, 0.5), 0, 0.9, 0.05);
  blk(s, 0.8, 0.012, 0.9, M(C.bloodFresh), rng.spread(0.05), 0.93, 0.1);
  blk(s, 0.3, 0.012, 0.5, M(C.bloodDark), 0.25, 0.935, -0.4);
  // Straps (snapped).
  box(s, 0.76, 0.02, 0.08, M(0x3a2a1a), 0, 0.94, 0.5);
  box(s, 0.3, 0.02, 0.08, M(0x3a2a1a), 0.5, 0.6, -0.3, 0, 0, 1.2);
  return s;
}

export function anesthesia(g: O, x: number, y: number, z: number, ry: number): THREE.Group {
  const s = grp(g, x, y, z, ry);
  blk(s, 0.7, 1.2, 0.6, M(0xc8ccc4), 0, 0.1, 0);
  blk(s, 0.5, 0.4, 0.06, M(0x202428), 0, 1.35, 0.1);
  box(s, 0.44, 0.32, 0.01, G(0x082a2a, 1), 0, 1.55, 0.135);
  box(s, 0.35, 0.02, 0.01, G(C.screen, 1.4), 0, 1.6, 0.14);
  box(s, 0.3, 0.02, 0.01, G(0xffd040, 1.2), 0, 1.5, 0.14);
  cyl(s, 0.08, 0.08, 0.5, M(0x2a7a3a), -0.25, 0.4, 0.33, 8);
  cyl(s, 0.08, 0.08, 0.5, M(0x2a4aa8), 0.0, 0.4, 0.33, 8);
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.22, 0.22]) cyl(s, 0.05, 0.05, 0.04, rubber(), sx, 0.05, sz, 6, 0, 0, Math.PI / 2);
  return s;
}

/** Instrument trolley. */
export function trolley(g: O, x: number, y: number, z: number, ry: number, rng: Rng): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const st = steel();
  blk(s, 0.8, 0.03, 0.5, st, 0, 0.85, 0);
  blk(s, 0.8, 0.03, 0.5, st, 0, 0.3, 0);
  for (const sx of [-0.38, 0.38]) for (const sz of [-0.23, 0.23]) cyl(s, 0.015, 0.015, 0.85, st, sx, 0.45, sz, 4);
  blk(s, 0.6, 0.012, 0.35, MD(0x3a7a6a), 0, 0.88, 0);
  for (let i = 0; i < 6; i++) box(s, 0.02, 0.012, rng.range(0.12, 0.2), M(0xd0d8dc), -0.22 + i * 0.09, 0.9, 0, rng.spread(0.3));
  blk(s, 0.15, 0.06, 0.1, M(C.bloodFresh), 0.2, 0.89, 0.1);
  return s;
}

/** Green oxygen cylinder model (for an explosive Destructible). Base at y = 0. */
export function oxygenModel(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, 0.17, 0.17, 1.15, M(0x1f7a3a), 0, 0.6, 0, 10);
  cyl(g, 0.1, 0.17, 0.18, M(0xe8e8e0), 0, 1.25, 0, 10);
  cyl(g, 0.035, 0.035, 0.14, M(0x6a6a5a), 0, 1.4, 0, 6);
  box(g, 0.2, 0.16, 0.02, G(0xffd23a, 1), 0, 0.75, 0.17);
  box(g, 0.36, 0.04, 0.36, M(0x3a3a3a), 0, 0.02, 0);
  return g;
}

/** Red flammable gas cylinder model. */
export function gasModel(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, 0.2, 0.2, 1.2, M(0xb3261e), 0, 0.62, 0, 10);
  cyl(g, 0.12, 0.2, 0.16, M(0x8a1a14), 0, 1.3, 0, 10);
  cyl(g, 0.04, 0.04, 0.12, M(0x3a3a3a), 0, 1.44, 0, 6);
  box(g, 0.26, 0.2, 0.02, G(0xffd23a, 1), 0, 0.8, 0.2);
  return g;
}

/** Hospital door panel (local: hinge at x=0, door spans +X, front faces +Z, bottom at 0). */
export function doorPanel(w: number, h: number, color: number = C.door, windowGlow = false): THREE.Group {
  const g = new THREE.Group();
  box(g, w, h, 0.06, M(color, 'planks', 1.2, 0.25), w / 2, h / 2, 0);
  box(g, w - 0.08, 0.3, 0.07, M(C.kick, 'metal', 3, 0.5), w / 2, 0.17, 0);
  box(g, 0.28, 0.5, 0.07, windowGlow ? G(0x2a4a4a, 1) : M(0x0d1414), w / 2, h * 0.7, 0);
  box(g, 0.05, 0.22, 0.12, M(0x3a3e40), w - 0.12, h * 0.48, 0);
  box(g, 0.24, 0.06, 0.075, M(0xe8e4d0), w / 2, h * 0.55, 0);
  return g;
}

// ─── Vehicles ───────────────────────────────────────────────────────────────

export interface Ambulance {
  root: THREE.Group;
  body: THREE.Group;
  doorL: THREE.Group;
  doorR: THREE.Group;
  red: THREE.Mesh[];
  blue: THREE.Mesh[];
  head: THREE.Mesh[];
}

/** Box ambulance, length along local Z (front at +Z), ~6.2 m long. */
export function ambulance(): Ambulance {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const white = M(0xd8dcd6, 'metal', 1, 0.25);
  const red = M(0xc42020);
  const dark = M(0x111416);
  const glass = M(0x1a2a34);
  // Box body (rear) + cab.
  blk(body, 2.3, 2.3, 4.0, white, 0, 0.45, -0.95);
  blk(body, 2.2, 1.35, 1.9, white, 0, 0.45, 2.0);
  box(body, 2.1, 0.7, 0.9, white, 0, 2.05, 1.55, 0, 0.5);
  box(body, 2.0, 0.62, 0.05, glass, 0, 2.08, 2.0, 0, 0.62);
  box(body, 0.04, 0.55, 1.0, glass, 1.1, 2.0, 1.75);
  box(body, 0.04, 0.55, 1.0, glass, -1.1, 2.0, 1.75);
  // Stripes + crosses.
  box(body, 2.32, 0.28, 4.02, red, 0, 1.25, -0.95);
  box(body, 2.22, 0.2, 1.92, red, 0, 1.25, 2.0);
  for (const sx of [-1.16, 1.16]) {
    box(body, 0.02, 0.6, 0.18, red, sx, 2.0, -0.6);
    box(body, 0.02, 0.18, 0.6, red, sx, 2.0, -0.6);
  }
  blk(body, 0.6, 0.02, 0.6, red, 0, 2.75, -1.0);
  // Bumpers, grille, wheels.
  blk(body, 2.3, 0.3, 0.2, dark, 0, 0.35, 3.0);
  blk(body, 2.3, 0.25, 0.15, dark, 0, 0.35, -3.0);
  box(body, 1.4, 0.4, 0.05, M(0x2a2e30), 0, 0.95, 2.97);
  const tyre = M(0x141414);
  const rim = M(0x8a8e90);
  for (const sx of [-1.05, 1.05]) {
    for (const sz of [-2.0, 1.95]) {
      cyl(body, 0.42, 0.42, 0.3, tyre, sx, 0.42, sz, 10, 0, 0, Math.PI / 2);
      cyl(body, 0.22, 0.22, 0.32, rim, sx, 0.42, sz, 8, 0, 0, Math.PI / 2);
    }
  }
  // Headlights / tail lights.
  const head = [box(body, 0.32, 0.18, 0.04, G(0xfff2c8, 1.6), 0.75, 0.95, 3.0), box(body, 0.32, 0.18, 0.04, G(0xfff2c8, 1.6), -0.75, 0.95, 3.0)];
  box(body, 0.16, 0.3, 0.04, G(0xff2a1a, 1.2), 1.0, 1.0, -2.97);
  box(body, 0.16, 0.3, 0.04, G(0xff2a1a, 1.2), -1.0, 1.0, -2.97);
  // Light bar.
  blk(body, 1.8, 0.14, 0.3, dark, 0, 2.38, 0.95);
  const redL: THREE.Mesh[] = [];
  const blueL: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const m = box(body, 0.38, 0.14, 0.26, G(i % 2 ? 0x2a50ff : 0xff2020, 1.8), -0.66 + i * 0.44, 2.6, 0.95);
    (i % 2 ? blueL : redL).push(m);
  }
  redL.push(box(body, 0.3, 0.14, 0.1, G(0xff2020, 1.8), 0.85, 2.6, -2.9));
  blueL.push(box(body, 0.3, 0.14, 0.1, G(0x2a50ff, 1.8), -0.85, 2.6, -2.9));
  // Rear doors on hinges.
  const mk = (side: 1 | -1) => {
    const p = new THREE.Group();
    p.position.set(side * 1.13, 0.5, -2.96);
    body.add(p);
    box(p, 1.1, 2.2, 0.06, white, -side * 0.55, 1.1, 0);
    box(p, 1.1, 0.26, 0.07, red, -side * 0.55, 0.75, 0);
    box(p, 0.7, 0.6, 0.07, glass, -side * 0.55, 1.65, 0);
    return p;
  };
  const doorL = mk(1);
  const doorR = mk(-1);
  // Dark interior visible when the doors open.
  box(body, 2.1, 2.0, 0.05, M(0x1a1e1e), 0, 1.5, -2.85);
  for (const m of [...redL, ...blueL, ...head]) m.userData.noMerge = true;
  return { root, body, doorL, doorR, red: redL, blue: blueL, head };
}

/** Parked car silhouette (front at +Z). */
export function car(g: O, x: number, y: number, z: number, ry: number, color: number): THREE.Group {
  const s = grp(g, x, y, z, ry);
  const paint = M(color, 'metal', 1, 0.2);
  blk(s, 1.8, 0.7, 4.3, paint, 0, 0.3, 0);
  blk(s, 1.6, 0.6, 2.2, paint, 0, 1.0, -0.3);
  box(s, 1.62, 0.5, 0.05, M(0x141c22), 0, 1.25, 0.82, 0, 0.5);
  box(s, 1.62, 0.5, 0.05, M(0x141c22), 0, 1.25, -1.42, 0, -0.5);
  const tyre = M(0x141414);
  for (const sx of [-0.85, 0.85]) for (const sz of [-1.35, 1.35]) cyl(s, 0.33, 0.33, 0.24, tyre, sx, 0.33, sz, 8, 0, 0, Math.PI / 2);
  return s;
}

/** Straight pipe between two points at height y (along X or Z). */
export function pipe(g: O, x0: number, z0: number, x1: number, z1: number, y: number, r: number, mat: THREE.Material): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const s = grp(g, (x0 + x1) / 2, y, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0));
  cyl(s, r, r, len, mat, 0, 0, 0, 6, Math.PI / 2);
}
