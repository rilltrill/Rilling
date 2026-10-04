import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { Rng } from '../../../core/Rng';
import { addText, textWidth, verticalHeight } from './font';

/**
 * Static prop builders for MAIN STREET. Every builder returns a Group in local
 * coordinates (facing +Z unless noted) built only from cached Kit primitives,
 * so the scenery can be merged per zone with EnvKit.mergeStatic.
 */

// ─── Palette ────────────────────────────────────────────────────────────────

export const C = {
  sodium: 0xffa54a,
  neonPink: 0xff3c9a,
  neonCyan: 0x39e8ff,
  neonGreen: 0x4dff74,
  neonRed: 0xff2c2c,
  neonYellow: 0xffd23a,
  neonBlue: 0x4f7dff,
  neonOrange: 0xff8a2a,
  warmWin: 0xffc477,
  dimWin: 0xd8914a,
  tvWin: 0x7fa6ff,
};

export const M = {
  get trimDark() { return Kit.mat(0x26262c); },
  get trimLight() { return Kit.mat(0x77736a); },
  get winDark() { return Kit.mat(0x121722); },
  get winFrame() { return Kit.mat(0x1c1d22); },
  get winWarm() { return Kit.glow(C.warmWin, 0.62); },
  get winDim() { return Kit.glow(C.dimWin, 0.42); },
  get winTv() { return Kit.glow(C.tvWin, 0.5); },
  get door() { return Kit.mat(0x2b1f17); },
  get metal() { return Kit.mat(0x2a2c31); },
  get metalLight() { return Kit.mat(0x6a6e75); },
  get roof() { return Kit.mat(0x1c1d21); },
  get concrete() { return Kit.mat(0x4f5055); },
  get sidewalk() { return Kit.mat(0x46474c); },
  get curb() { return Kit.mat(0x606167); },
  get tire() { return Kit.mat(0x101012); },
  get carGlass() { return Kit.mat(0x18202e); },
  get chrome() { return Kit.mat(0x8c9198); },
  get headlight() { return Kit.glow(0xfff3d6, 1.4); },
  get taillight() { return Kit.glow(0xff2a1a, 1.1); },
  get blood() { return Kit.mat(0x3a0505); },
  get bloodWet() { return Kit.std(0x4a0606, 0.25, 0.1); },
  get wood() { return Kit.mat(0x4a3628); },
  get foliage() { return Kit.mat(0x22331f); },
  get bark() { return Kit.mat(0x2e241c); },
  get signBack() { return Kit.mat(0x18181c); },
  get orange() { return Kit.mat(0xd9641c); },
  get white() { return Kit.mat(0xdedad0); },
  get yellowPaint() { return Kit.mat(0xb89a3a); },
  get whitePaint() { return Kit.mat(0x8d8f94); },
  get sodiumGlow() { return Kit.glow(C.sodium, 1.6); },
};

export const BUILDING_COLORS = [0x5b3029, 0x4a3426, 0x4d4f57, 0x6a5a45, 0x34404e, 0x3c4a3e, 0x6e6658];
export const CAR_COLORS = [0x5a1a1a, 0x1d2c4a, 0x8a7c62, 0x5a5d62, 0x1f4f4f, 0x9a9a96, 0x3a2a48, 0x6b5020];

// ─── Small helpers ──────────────────────────────────────────────────────────

function box(g: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return Kit.add(g, Kit.box(w, h, d), mat, x, y, z, rx, ry, rz);
}

function cyl(g: THREE.Object3D, rt: number, rb: number, h: number, seg: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return Kit.add(g, Kit.cyl(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
}

// ─── Signs ──────────────────────────────────────────────────────────────────

/** Flat sign board with neon letters, facing +Z, centred at origin. */
export function boardSign(text: string, color: number, size = 0.7, opts: { frame?: boolean; back?: number; pad?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const w = textWidth(text, size) + (opts.pad ?? size * 0.9);
  const h = size * 1.7;
  box(g, w, h, 0.14, opts.back !== undefined ? Kit.mat(opts.back) : M.signBack, 0, 0, -0.07);
  const glow = Kit.glow(color, 1.5);
  addText(g, text, glow, { size, depth: 0.06 }).position.z = 0.03;
  if (opts.frame !== false) {
    const t = 0.05;
    box(g, w - 0.1, t, t, glow, 0, h / 2 - 0.08, 0.02);
    box(g, w - 0.1, t, t, glow, 0, -h / 2 + 0.08, 0.02);
    box(g, t, h - 0.1, t, glow, w / 2 - 0.08, 0, 0.02);
    box(g, t, h - 0.1, t, glow, -w / 2 + 0.08, 0, 0.02);
  }
  return g;
}

/**
 * Vertical blade sign projecting from a facade (like the classic "HOTEL" signs).
 * Local: attaches at origin on the wall, sticks out along +Z, letters on both faces (±X).
 */
export function bladeSign(text: string, color: number, size = 0.62, back = 0x1a1a20): THREE.Group {
  const g = new THREE.Group();
  const h = verticalHeight(text, size) + size * 1.1;
  const out = size * 1.9;
  box(g, 0.22, h, out, Kit.mat(back), 0, 0, out / 2 + 0.35);
  // Brackets.
  box(g, 0.08, 0.08, 0.5, M.metal, 0, h / 2 - 0.2, 0.2);
  box(g, 0.08, 0.08, 0.5, M.metal, 0, -h / 2 + 0.2, 0.2);
  const glow = Kit.glow(color, 1.6);
  for (const side of [1, -1]) {
    const t = addText(g, text, glow, { size, vertical: true, depth: 0.05 });
    t.rotation.y = (side * Math.PI) / 2;
    t.position.set(side * 0.13, 0, out / 2 + 0.35);
    // Neon outline.
    const ol = new THREE.Group();
    const tt = 0.05;
    box(ol, tt, h - 0.12, tt, glow, 0, 0, out / 2 - 0.06);
    box(ol, tt, h - 0.12, tt, glow, 0, 0, -out / 2 + 0.06);
    box(ol, tt, tt, out - 0.12, glow, 0, h / 2 - 0.06, 0);
    box(ol, tt, tt, out - 0.12, glow, 0, -h / 2 + 0.06, 0);
    ol.position.set(side * 0.13, 0, out / 2 + 0.35);
    g.add(ol);
  }
  return g;
}

// ─── Buildings ──────────────────────────────────────────────────────────────

export interface ShopSpec {
  /** Interior glow colour (0 = dark / closed). */
  interior: number;
  interiorIntensity?: number;
  awning?: number;
  board?: { text: string; color: number; size?: number };
  blade?: { text: string; color: number; size?: number; y?: number };
  shutter?: boolean;
  /** Leave the display window out (a Destructible pane goes there instead). */
  noWindow?: boolean;
}

export interface BuildingSpec {
  w: number;
  d: number;
  floors: number;
  color: number;
  trim?: THREE.Material;
  shop?: ShopSpec | null;
  litChance?: number;
  fireEscape?: boolean;
  roof?: 'tank' | 'ac' | 'billboard' | 'none';
  /** Silhouettes in lit windows. */
  ghouls?: boolean;
}

export const GROUND_H = 4.6;
export const FLOOR_H = 3.2;

export function buildingHeight(floors: number) {
  return GROUND_H + FLOOR_H * (floors - 1) + 0.7;
}

/** A small-town commercial building, facade at z = 0 facing +Z, body extends to -d. */
export function building(s: BuildingSpec, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const { w, d, floors } = s;
  const h = buildingHeight(floors);
  const body = Kit.mat(s.color);
  const trim = s.trim ?? (rng.chance(0.5) ? M.trimLight : M.trimDark);
  box(g, w, h, d, body, 0, h / 2, -d / 2);
  // Pilasters + cornice + floor band.
  box(g, 0.45, h, 0.2, trim, w / 2 - 0.22, h / 2, 0.08);
  box(g, 0.45, h, 0.2, trim, -w / 2 + 0.22, h / 2, 0.08);
  box(g, w + 0.25, 0.45, 0.55, trim, 0, h - 0.22, 0.16);
  box(g, w + 0.25, 0.14, d + 0.2, M.roof, 0, h + 0.07, -d / 2);
  box(g, w, 0.28, 0.3, trim, 0, GROUND_H, 0.12);

  // Upper windows.
  const cols = Math.max(1, Math.floor((w - 1.4) / 2.5));
  const span = (w - 1.4) / cols;
  const lit = s.litChance ?? 0.3;
  for (let f = 1; f < floors; f++) {
    const y = GROUND_H + 0.35 + (f - 1) * FLOOR_H + 1.15;
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + 0.7 + span * (c + 0.5);
      box(g, 1.35, 1.95, 0.08, M.winFrame, x, y, 0.03);
      const r = rng.next();
      const mat = r < lit * 0.6 ? M.winWarm : r < lit * 0.85 ? M.winDim : r < lit ? M.winTv : M.winDark;
      box(g, 1.12, 1.7, 0.1, mat, x, y, 0.04);
      box(g, 1.5, 0.1, 0.25, trim, x, y - 0.98, 0.1);
      if (mat !== M.winDark && s.ghouls !== false && rng.chance(0.16)) {
        // Something standing in the window…
        box(g, 0.42, 0.95, 0.02, Kit.mat(0x0b0b0e), x + rng.spread(0.2), y - 0.35, 0.1);
        box(g, 0.24, 0.26, 0.02, Kit.mat(0x0b0b0e), x + rng.spread(0.1), y + 0.28, 0.1);
      } else if (mat !== M.winDark && rng.chance(0.4)) {
        // Half-drawn blind.
        box(g, 1.12, 0.6, 0.02, Kit.mat(0x5a4a38), x, y + 0.55, 0.1);
      }
    }
  }

  // Fire escape on the facade.
  if (s.fireEscape && floors >= 3) addFireEscape(g, floors, rng.chance(0.5) ? -w / 4 : w / 4);

  // Ground floor.
  const shop = s.shop;
  if (shop) {
    const ww = w * 0.6;
    const wx = -w * 0.12;
    const dx = w / 2 - 1.3;
    if (!shop.noWindow) {
      const imat = shop.interior ? Kit.glow(shop.interior, shop.interiorIntensity ?? 0.5) : M.winDark;
      box(g, ww, 2.4, 0.1, imat, wx, 1.85, 0.04);
      for (let i = 1; i < 3; i++) box(g, 0.09, 2.4, 0.16, M.winFrame, wx - ww / 2 + (ww * i) / 3, 1.85, 0.07);
    }
    box(g, ww + 0.2, 0.65, 0.2, trim, wx, 0.33, 0.1);
    box(g, ww + 0.3, 0.12, 0.2, trim, wx, 3.1, 0.1);
    // Door with a small lit pane.
    box(g, 1.15, 2.6, 0.12, M.door, dx, 1.3, 0.04);
    if (shop.interior) box(g, 0.6, 0.9, 0.04, Kit.glow(shop.interior, (shop.interiorIntensity ?? 0.5) * 0.8), dx, 1.85, 0.11);
    if (shop.shutter) {
      // Half-closed roll-down shutter over the window.
      box(g, ww + 0.1, 1.3, 0.06, M.metalLight, wx, 2.4, 0.16);
      for (let i = 0; i < 4; i++) box(g, ww + 0.1, 0.03, 0.08, M.metal, wx, 1.85 + i * 0.3, 0.18);
    }
    if (shop.awning !== undefined) {
      const aw = w * 0.86;
      const am = Kit.mat(shop.awning);
      box(g, aw, 0.08, 1.8, am, 0, 3.55, 0.85, 0.34);
      box(g, aw, 0.36, 0.05, am, 0, 3.1, 1.72);
    }
    if (shop.board) {
      const b = boardSign(shop.board.text, shop.board.color, shop.board.size ?? 0.55, { pad: 0.6 });
      b.position.set(0, 4.15, 0.2);
      g.add(b);
    }
  } else {
    // Residential ground floor: entrance + two dark windows.
    box(g, 1.3, 2.7, 0.12, M.door, 0, 1.35, 0.04);
    box(g, 1.7, 0.2, 0.5, trim, 0, 2.85, 0.25);
    const r = rng.next();
    for (const sx of [-1, 1]) {
      const x = sx * w * 0.28;
      box(g, 1.6, 1.8, 0.08, M.winFrame, x, 1.8, 0.03);
      box(g, 1.4, 1.6, 0.1, r < 0.3 ? M.winDim : M.winDark, x, 1.8, 0.04);
    }
  }
  if (shop?.blade) {
    const bs = bladeSign(shop.blade.text, shop.blade.color, shop.blade.size ?? 0.6);
    bs.position.set(w / 2 - 0.8, shop.blade.y ?? Math.min(h - 2.6, GROUND_H + 2.6), 0);
    g.add(bs);
  }

  // Roof clutter for the skyline silhouette.
  const roof = s.roof ?? rng.pick(['tank', 'ac', 'ac', 'none'] as const);
  if (roof === 'tank') {
    const tx = rng.spread(w * 0.25);
    const tz = -d * 0.55;
    for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) box(g, 0.12, 1.4, 0.12, M.metal, tx + lx, h + 0.7, tz + lz);
    box(g, 2.0, 0.12, 2.0, M.metal, tx, h + 1.4, tz);
    cyl(g, 1.05, 1.05, 2.2, 10, M.wood, tx, h + 2.55, tz);
    Kit.add(g, Kit.cone(1.15, 0.8, 10), M.roof, tx, h + 4.05, tz);
  } else if (roof === 'ac') {
    box(g, 1.4, 0.9, 1.1, M.metalLight, rng.spread(w * 0.3), h + 0.5, -d * 0.4);
    box(g, 0.7, 1.6, 0.7, Kit.mat(0x3b2a24), rng.spread(w * 0.35), h + 0.8, -d * 0.75);
  } else if (roof === 'billboard') {
    const bb = new THREE.Group();
    box(bb, 0.15, 3, 0.15, M.metal, -2.4, 1.5, -0.4);
    box(bb, 0.15, 3, 0.15, M.metal, 2.4, 1.5, -0.4);
    box(bb, 6.2, 3, 0.15, Kit.mat(0x8a7f62), 0, 4, 0);
    box(bb, 2.6, 2.4, 0.04, Kit.mat(0x9a3a2a), -1.5, 4, 0.1);
    box(bb, 2.6, 0.5, 0.04, Kit.mat(0x2a3a5a), 1.5, 4.7, 0.1);
    box(bb, 2.6, 0.3, 0.04, Kit.mat(0x2a3a5a), 1.5, 4.0, 0.1);
    box(bb, 2.6, 0.3, 0.04, Kit.mat(0x2a3a5a), 1.5, 3.4, 0.1);
    bb.position.set(0, h, -d * 0.3);
    g.add(bb);
  }
  return g;
}

/** Fire escape (platforms, rails, stairs) on a wall facing +Z, centred on x. */
export function addFireEscape(g: THREE.Object3D, floors: number, x: number, out = 1.1) {
  const m = M.metal;
  for (let f = 1; f < floors; f++) {
    const y = GROUND_H + (f - 1) * FLOOR_H + 0.2;
    box(g, 3.0, 0.07, out, m, x, y, out / 2);
    box(g, 3.0, 0.05, 0.05, m, x, y + 0.95, out);
    box(g, 0.05, 0.05, out, m, x - 1.5, y + 0.95, out / 2);
    box(g, 0.05, 0.05, out, m, x + 1.5, y + 0.95, out / 2);
    for (let i = 0; i <= 6; i++) box(g, 0.03, 0.95, 0.03, m, x - 1.5 + i * 0.5, y + 0.47, out);
    if (f < floors - 1) {
      const len = Math.hypot(2.2, FLOOR_H);
      box(g, len, 0.07, 0.6, m, x + 0.2, y + FLOOR_H / 2, out * 0.45, 0, 0, Math.atan2(FLOOR_H, 2.2));
    }
  }
  // Drop ladder (pulled up).
  const y0 = GROUND_H + 0.2;
  box(g, 0.05, 2.0, 0.05, m, x + 1.1, y0 - 1.0, out - 0.1);
  box(g, 0.05, 2.0, 0.05, m, x + 1.5, y0 - 1.0, out - 0.1);
  for (let i = 0; i < 5; i++) box(g, 0.45, 0.04, 0.04, m, x + 1.3, y0 - 0.2 - i * 0.4, out - 0.1);
}

/** Windows, doors, pipes on a plain wall (alley sides). Wall plane z = 0 facing +Z, from x0 to x1. */
export function wallDetails(g: THREE.Object3D, x0: number, x1: number, floors: number, rng: Rng, opts: { fireEscapes?: number[]; doors?: number[] } = {}) {
  for (let f = 1; f < floors; f++) {
    const y = GROUND_H + 0.35 + (f - 1) * FLOOR_H + 1.0;
    for (let x = x0 + 2; x < x1 - 1.5; x += rng.range(3.2, 5)) {
      box(g, 1.1, 1.5, 0.08, M.winFrame, x, y, 0.03);
      const lit = rng.chance(0.18);
      box(g, 0.9, 1.3, 0.1, lit ? M.winDim : M.winDark, x, y, 0.04);
      if (!lit && rng.chance(0.3)) box(g, 1.0, 1.4, 0.03, Kit.mat(0x3a2e22), x, y, 0.1); // boarded
    }
  }
  for (const dx of opts.doors ?? []) {
    box(g, 1.2, 2.5, 0.1, M.metal, dx, 1.25, 0.04);
    box(g, 1.6, 0.12, 0.6, M.metal, dx, 2.85, 0.3);
  }
  for (const fx of opts.fireEscapes ?? []) addFireEscape(g, floors, fx, 1.2);
  // Drain pipes and AC units.
  for (let x = x0 + rng.range(1, 4); x < x1; x += rng.range(7, 11)) {
    box(g, 0.14, GROUND_H + FLOOR_H * (floors - 1), 0.14, M.metal, x, (GROUND_H + FLOOR_H * (floors - 1)) / 2, 0.1);
  }
  for (let i = 0; i < floors; i++) {
    if (!rng.chance(0.6)) continue;
    const x = rng.range(x0 + 2, x1 - 2);
    const y = GROUND_H + 0.6 + rng.int(0, floors - 2) * FLOOR_H;
    box(g, 0.8, 0.55, 0.6, M.metalLight, x, y, 0.32);
  }
  // Spray-painted tags and messages.
  const gcol = [0xc83a8a, 0x3ac8d8, 0xd8c83a, 0x4ad86a, 0xe8e8e8, 0xc83a3a];
  const words = ['HELP', 'RUN', 'ZED', 'NO EXIT', 'THEY BITE', 'GOD HELP US', 'KZ', 'DEAD END'];
  for (let i = 0; i < 3; i++) {
    const x = rng.range(x0 + 3, x1 - 3);
    const t = addText(g, rng.pick(words), Kit.mat(rng.pick(gcol)), { size: rng.range(0.35, 0.6), depth: 0.02, stroke: 0.07 });
    t.position.set(x, rng.range(1.2, 2.4), 0.05);
    t.rotation.z = rng.spread(0.12);
  }
}

// ─── Street furniture ───────────────────────────────────────────────────────

/** Sodium street lamp. Pole at origin, arm reaches toward +Z (the road). Lamp head at (0, 6.4, 2.2). */
export function streetLamp(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, 0.08, 0.13, 6.6, 6, M.metal, 0, 3.3, 0);
  box(g, 0.34, 0.5, 0.34, M.metal, 0, 0.25, 0);
  box(g, 0.1, 0.1, 2.3, M.metal, 0, 6.5, 1.1);
  box(g, 0.5, 0.2, 0.95, M.metal, 0, 6.42, 2.2);
  box(g, 0.38, 0.05, 0.75, M.sodiumGlow, 0, 6.3, 2.2);
  return g;
}

export function hydrant(): THREE.Group {
  const g = new THREE.Group();
  const red = Kit.mat(0x8a1a14);
  cyl(g, 0.14, 0.16, 0.6, 8, red, 0, 0.3, 0);
  Kit.add(g, Kit.sphere(0.15, 8, 5), red, 0, 0.62, 0);
  cyl(g, 0.06, 0.06, 0.4, 6, red, 0, 0.42, 0, 0, 0, Math.PI / 2);
  return g;
}

export function trashCan(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, 0.3, 0.26, 0.95, 8, Kit.mat(0x2d3a2e), 0, 0.48, 0);
  cyl(g, 0.33, 0.33, 0.06, 8, M.metal, 0, 0.98, 0);
  return g;
}

export function newsBox(color: number): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.5, 0.95, 0.45, Kit.mat(color), 0, 0.6, 0);
  box(g, 0.4, 0.3, 0.02, M.winDark, 0, 0.8, 0.23);
  box(g, 0.08, 0.25, 0.08, M.metal, 0, 0.1, 0);
  return g;
}

export function bench(): THREE.Group {
  const g = new THREE.Group();
  box(g, 1.8, 0.07, 0.45, M.wood, 0, 0.45, 0);
  box(g, 1.8, 0.4, 0.06, M.wood, 0, 0.75, -0.22, -0.15);
  box(g, 0.06, 0.45, 0.4, M.metal, -0.8, 0.22, 0);
  box(g, 0.06, 0.45, 0.4, M.metal, 0.8, 0.22, 0);
  return g;
}

export function mailbox(): THREE.Group {
  const g = new THREE.Group();
  const blue = Kit.mat(0x1f3566);
  box(g, 0.5, 0.75, 0.5, blue, 0, 0.75, 0);
  cyl(g, 0.25, 0.25, 0.5, 8, blue, 0, 1.12, 0, Math.PI / 2, 0, 0);
  box(g, 0.08, 0.4, 0.08, M.metal, 0, 0.2, 0);
  return g;
}

export function trafficCone(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.4, 0.04, 0.4, M.orange, 0, 0.02, 0);
  Kit.add(g, Kit.cone(0.15, 0.6, 8), M.orange, 0, 0.32, 0);
  cyl(g, 0.095, 0.115, 0.12, 8, M.white, 0, 0.3, 0);
  return g;
}

/** Striped police sawhorse barrier, ~2.4 m wide, facing +Z. */
export function sawhorse(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) box(g, 0.4, 0.26, 0.05, i % 2 ? M.white : M.orange, -1.0 + i * 0.4, 0.95, 0, 0, 0, 0.0);
  for (let i = 0; i < 6; i++) box(g, 0.4, 0.2, 0.05, i % 2 ? M.orange : M.white, -1.0 + i * 0.4, 0.45, 0);
  for (const sx of [-1.1, 1.1]) {
    box(g, 0.08, 1.15, 0.08, M.white, sx, 0.55, 0.22, -0.32);
    box(g, 0.08, 1.15, 0.08, M.white, sx, 0.55, -0.22, 0.32);
  }
  return g;
}

/** Street tree in a sidewalk planter. */
export function streetTree(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  box(g, 1.2, 0.12, 1.2, M.curb, 0, 0.06, 0);
  const h = rng.range(2.6, 3.4);
  cyl(g, 0.09, 0.13, h, 6, M.bark, 0, h / 2, 0);
  const s = rng.range(0.9, 1.25);
  Kit.add(g, Kit.ico(1.3, 0), M.foliage, 0, h + 0.6, 0, rng.next(), rng.next(), 0, s, s * 0.85, s);
  Kit.add(g, Kit.ico(0.9, 0), M.foliage, 0.6, h + 1.3, 0.2, rng.next(), 0, 0, s);
  return g;
}

/** Utility / telephone pole with a crossbar (wires added separately). */
export function utilityPole(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, 0.12, 0.16, 9, 6, Kit.mat(0x3a2c20), 0, 4.5, 0);
  box(g, 2.2, 0.14, 0.14, Kit.mat(0x3a2c20), 0, 8.4, 0);
  cyl(g, 0.22, 0.22, 0.6, 6, M.metalLight, 0.45, 7.8, 0.2);
  return g;
}

export function dumpster(color = 0x2a4a32): THREE.Group {
  const g = new THREE.Group();
  const m = Kit.mat(color);
  box(g, 2.2, 1.25, 1.3, m, 0, 0.75, 0);
  box(g, 2.3, 0.1, 1.4, Kit.mat(0x1f2a22), 0, 1.42, -0.05, -0.25);
  for (const sx of [-0.9, 0.9]) cyl(g, 0.1, 0.1, 0.1, 6, M.tire, sx, 0.1, 0.5, Math.PI / 2);
  return g;
}

export function trashBags(rng: Rng, n = 4): THREE.Group {
  const g = new THREE.Group();
  const m = Kit.mat(0x141518);
  for (let i = 0; i < n; i++) {
    const s = rng.range(0.32, 0.45);
    Kit.add(g, Kit.ico(s, 0), m, rng.spread(0.9), s * 0.75, rng.spread(0.6), rng.next(), rng.next(), 0, 1, 0.8, 1);
  }
  return g;
}

export function crate(s = 0.8): THREE.Group {
  const g = new THREE.Group();
  box(g, s, s, s, M.wood, 0, s / 2, 0);
  box(g, s + 0.02, 0.08, s + 0.02, Kit.mat(0x3a2a1e), 0, s * 0.85, 0);
  box(g, s + 0.02, 0.08, s + 0.02, Kit.mat(0x3a2a1e), 0, s * 0.15, 0);
  return g;
}

// ─── Vehicles ───────────────────────────────────────────────────────────────

export interface CarOptions {
  color: number;
  /** Open doors: 'fl' | 'fr' | 'rl' | 'rr' (front/rear, left/right). */
  open?: string[];
  headlights?: boolean;
  taillights?: boolean;
  burnt?: boolean;
  police?: boolean;
  /** Smashed windscreen / crumpled hood. */
  wrecked?: boolean;
}

/**
 * Sedan, front toward +Z, ≈ 4.5 × 1.8 × 1.45 m. Character left = +X.
 * Returns the group; for police cars `userData.lightbar = [red, blue]` meshes
 * (keep the car out of merged scenery if you want them to flash).
 */
export function car(o: CarOptions): THREE.Group {
  const g = new THREE.Group();
  const paint = o.burnt ? Kit.mat(0x1d1917) : o.police ? Kit.mat(0x111216) : Kit.mat(o.color);
  const glass = o.burnt ? Kit.mat(0x050505) : M.carGlass;
  box(g, 1.82, 0.62, 4.5, paint, 0, 0.62, 0);
  box(g, 1.8, 0.1, 1.25, paint, 0, 0.96, 1.55, o.wrecked ? 0.22 : 0.05);
  box(g, 1.62, 0.5, 2.15, glass, 0, 1.17, -0.25);
  box(g, 1.66, 0.08, 1.85, paint, 0, 1.45, -0.3);
  // Pillars.
  box(g, 1.66, 0.5, 0.12, paint, 0, 1.17, 0.78, -0.4);
  box(g, 1.66, 0.5, 0.12, paint, 0, 1.17, -1.33, 0.35);
  if (o.police) {
    // White door panels + lightbar.
    for (const sx of [1, -1]) box(g, 0.04, 0.5, 2.0, M.white, sx * 0.92, 0.66, -0.15);
    box(g, 1.3, 0.12, 0.34, M.metal, 0, 1.55, -0.3);
    const red = box(g, 0.6, 0.14, 0.3, Kit.glow(0xff2020, 1.6), 0.32, 1.58, -0.3);
    const blue = box(g, 0.6, 0.14, 0.3, Kit.glow(0x2050ff, 1.6), -0.32, 1.58, -0.3);
    red.userData.noMerge = true;
    blue.userData.noMerge = true;
    g.userData.lightbar = [red, blue];
  }
  const bumper = o.burnt ? Kit.mat(0x2a2522) : M.chrome;
  box(g, 1.86, 0.2, 0.16, bumper, 0, 0.42, 2.27);
  box(g, 1.86, 0.2, 0.16, bumper, 0, 0.42, -2.27);
  box(g, 1.0, 0.22, 0.04, M.winFrame, 0, 0.66, 2.26);
  const wheel = Kit.cyl(0.35, 0.35, 0.26, 10);
  for (const [x, z] of [[0.86, 1.4], [-0.86, 1.4], [0.86, -1.4], [-0.86, -1.4]]) {
    Kit.add(g, wheel, M.tire, x, 0.35, z, 0, 0, Math.PI / 2);
    if (!o.burnt) Kit.add(g, Kit.cyl(0.18, 0.18, 0.28, 8), M.metalLight, x, 0.35, z, 0, 0, Math.PI / 2);
  }
  if (!o.burnt) {
    const hl = o.headlights ? M.headlight : Kit.mat(0xb8b4a0);
    box(g, 0.36, 0.15, 0.05, hl, 0.62, 0.68, 2.26);
    box(g, 0.36, 0.15, 0.05, hl, -0.62, 0.68, 2.26);
    const tl = o.taillights ? M.taillight : Kit.mat(0x5a1410);
    box(g, 0.4, 0.14, 0.05, tl, 0.6, 0.72, -2.26);
    box(g, 0.4, 0.14, 0.05, tl, -0.6, 0.72, -2.26);
  }
  for (const d of o.open ?? []) {
    const side = d[1] === 'l' ? 1 : -1;
    const front = d[0] === 'f';
    const hingeZ = front ? 0.95 : -0.25;
    const pivot = Kit.pivot(g, side * 0.91, 0, hingeZ);
    pivot.rotation.y = side * (front ? 1.0 : 0.85);
    box(pivot, 0.07, 0.6, 1.05, paint, 0, 0.66, -0.52);
    box(pivot, 0.04, 0.42, 0.9, glass, 0, 1.18, -0.5);
  }
  return g;
}

/** Yellow school bus, front toward +Z, ≈ 11 × 2.5 × 3 m (upright). */
export function schoolBus(): THREE.Group {
  const g = new THREE.Group();
  const yellow = Kit.mat(0xd29a16);
  const black = Kit.mat(0x18181a);
  box(g, 2.5, 2.1, 9.6, yellow, 0, 1.75, -0.6);
  box(g, 2.3, 1.0, 1.6, yellow, 0, 1.15, 4.9);
  box(g, 2.52, 0.18, 9.6, black, 0, 1.5, -0.6);
  box(g, 2.52, 0.12, 9.6, black, 0, 1.0, -0.6);
  box(g, 2.4, 0.2, 9.4, yellow, 0, 2.9, -0.6);
  // Windows along both sides.
  for (let i = 0; i < 8; i++) {
    const z = 3.4 - i * 1.15;
    for (const sx of [1, -1]) box(g, 0.06, 0.75, 0.95, M.carGlass, sx * 1.26, 2.25, z);
  }
  box(g, 2.3, 0.85, 0.08, M.carGlass, 0, 2.25, 4.15, -0.2);
  box(g, 2.5, 0.35, 0.2, black, 0, 0.75, 5.7);
  for (const z of [3.6, -3.4]) {
    for (const sx of [1.15, -1.15]) Kit.add(g, Kit.cyl(0.5, 0.5, 0.35, 10), M.tire, sx, 0.5, z, 0, 0, Math.PI / 2);
  }
  // Stop sign arm + lights.
  box(g, 0.06, 0.5, 0.5, Kit.mat(0x8a1a14), 1.3, 1.9, 3.2);
  box(g, 0.3, 0.2, 0.06, Kit.mat(0x8a2a10), 0.8, 2.75, 4.3);
  box(g, 0.3, 0.2, 0.06, Kit.mat(0x8a2a10), -0.8, 2.75, 4.3);
  // Rear frame around the emergency door (the door itself is a separate animated prop).
  box(g, 2.5, 0.2, 0.1, black, 0, 2.75, -5.42);
  return g;
}

// ─── Lettering for street paint / banners (not neon) ────────────────────────

export function paintedText(text: string, color: number, size: number): THREE.Group {
  const g = new THREE.Group();
  addText(g, text, Kit.mat(color), { size, depth: 0.03, stroke: size * 0.14 });
  return g;
}
