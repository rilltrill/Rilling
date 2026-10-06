import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { Rng } from '../../../core/Rng';
import { addText, textWidth, verticalHeight } from './font';
import { texGlow } from './bake';
import type { TexName } from '../../kit/Textures';

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

/**
 * Shared material palette. Surfaces carry Kit retro textures (brick, concrete,
 * planks, metal…); the zone bake folds them all into one textured draw call.
 */
export const M = {
  get trimDark() { return Kit.tex('concrete', 0x34343b, 1.5, 0.8); },
  get trimLight() { return Kit.tex('concrete', 0x86827a, 1.5, 0.8); },
  get winDark() { return Kit.mat(0x141a26); },
  get winFrame() { return Kit.tex('metal', 0x24252c, 1.5, 0.6); },
  get winWarm() { return texGlow(C.warmWin, 0.62, 'wallpaper', 1, 0.3); },
  get winDim() { return texGlow(C.dimWin, 0.42, 'wallpaper', 1, 0.3); },
  get winTv() { return Kit.glow(C.tvWin, 0.5); },
  get door() { return Kit.tex('planks', 0x45301f, 1.2); },
  get metal() { return Kit.tex('metal', 0x34363d, 1.2, 0.8); },
  get metalLight() { return Kit.tex('metal', 0x6a6e75, 1.2, 0.8); },
  /** Boards nailed over windows. */
  get boards() { return Kit.tex('planks', 0x6e5440, 1.2); },
  get boardsDark() { return Kit.tex('planks', 0x4e3a2c, 1.2); },
  /** Roll-down shop shutters. */
  get shutter() { return Kit.tex('corrugated', 0x7a7e86, 1.5); },
  get roof() { return Kit.tex('asphalt', 0x24252b, 1, 0.8); },
  get concrete() { return Kit.tex('concrete', 0x55565b); },
  get sidewalk() { return Kit.tex('concrete', 0x4c4d53); },
  get curb() { return Kit.tex('concrete', 0x6e6f75, 1.5); },
  get tire() { return Kit.mat(0x121214); },
  get carGlass() { return Kit.mat(0x18202e); },
  get chrome() { return Kit.tex('metal', 0x8c9198, 1.5, 0.5); },
  get headlight() { return Kit.glow(0xfff3d6, 1.4); },
  get taillight() { return Kit.glow(0xff2a1a, 1.1); },
  get blood() { return Kit.mat(0x3a0505); },
  get bloodWet() { return Kit.std(0x4a0606, 0.25, 0.1); },
  get wood() { return Kit.tex('planks', 0x5c4432, 1.5); },
  get foliage() { return Kit.tex('leaves', 0x2c4424, 0.8); },
  get bark() { return Kit.tex('bark', 0x3e3024, 1.5); },
  get signBack() { return Kit.tex('metal', 0x1c1c22, 1.5, 0.5); },
  get orange() { return Kit.mat(0xd9641c); },
  /** Diagonal hazard stripes (barricade boards). */
  get hazard() { return Kit.tex('hazard', 0xd9641c, 1.2); },
  get white() { return Kit.mat(0xdedad0); },
  get yellowPaint() { return Kit.tex('asphalt', 0xb89a3a, 1, 0.55); },
  get whitePaint() { return Kit.tex('asphalt', 0x8d8f94, 1, 0.55); },
  get sodiumGlow() { return Kit.glow(C.sodium, 1.6); },
};

// Mid-tone albedos: the night lighting + the monitor's tone curve crush anything darker to black.
export const BUILDING_COLORS = [0x7a3a2c, 0x664632, 0x62656e, 0x8a7454, 0x445670, 0x4e6650, 0x8c8370];

/** Facade texture per building colour: red/brown/painted brick, stucco, concrete block. */
const FACADE_TEX: Record<number, TexName> = {
  0x7a3a2c: 'brick',
  0x664632: 'brick',
  0x62656e: 'concrete',
  0x8a7454: 'stucco',
  0x445670: 'brick',
  0x4e6650: 'stucco',
  0x8c8370: 'stucco',
};

/** Facade material for a building body (brick at 0.7: chunky ~0.3 m courses that survive the 288-line monitor). */
export function facadeMat(color: number, tex?: TexName): THREE.MeshLambertMaterial {
  const t = tex ?? FACADE_TEX[color] ?? 'stucco';
  return Kit.tex(t, color, t === 'brick' ? 0.7 : 1, 1);
}
// Saturated-but-dusty paint jobs (sheet-metal texture on top).
export const CAR_COLORS = [0x7a2020, 0x24386a, 0x9a8a68, 0x666a70, 0x246262, 0xa6a6a0, 0x4a3460, 0x86642a];

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
  // ART: PIXEL WORLD repaints this sign with pixel-font neon (see z1/pixel.ts).
  const w = textWidth(text, size) + (opts.pad ?? size * 0.9);
  const h = size * 1.7;
  g.userData.pwSign = { kind: 'board', text, color, size, frame: opts.frame !== false, back: opts.back, bw: w, bh: h };
  box(g, w, h, 0.14, opts.back !== undefined ? Kit.tex('metal', opts.back, 1.5, 0.5) : M.signBack, 0, 0, -0.07).userData.pwFacade = 'signBack';
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
  g.userData.pwSign = { kind: 'blade', text, color, size, back };
  const h = verticalHeight(text, size) + size * 1.1;
  const out = size * 1.9;
  box(g, 0.22, h, out, Kit.tex('metal', back, 1.5, 0.5), 0, 0, out / 2 + 0.35).userData.pwFacade = 'signBack';
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
  /** Display window boarded up with planks. */
  boarded?: boolean;
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
  /** Facade texture (default: picked from the colour). */
  tex?: TexName;
}

export const GROUND_H = 4.6;
export const FLOOR_H = 3.2;

/**
 * What a building's facade shows, recorded while `building()` builds it (no
 * extra rng draws): ART: PIXEL WORLD paints it (z1/pixel.ts) in place of the
 * meshes tagged `userData.pwFacade` (window boxes, shop glass, doors…).
 */
export interface FacadeRecord {
  spec: BuildingSpec;
  w: number;
  d: number;
  h: number;
  /** Trim is the light stone (else the dark). */
  trimLight: boolean;
  windows: { x: number; y: number; kind: 'warm' | 'dim' | 'tv' | 'dark'; boarded: boolean; ghoul: boolean; blind: boolean }[];
  /** Ground floor. */
  shop: ShopSpec | null;
  /** Shop window x / width, door x. */
  shopX: number;
  shopW: number;
  doorX: number;
  /** Residential ground-floor windows lit (dim). */
  groundLit: boolean;
  fireEscapeX: number | null;
}

/** Tag a mesh PIXEL WORLD replaces with painted modules (`kind`: what it was). */
function pwTag<T extends THREE.Object3D>(o: T, kind: string): T {
  o.userData.pwFacade = kind;
  return o;
}

export function buildingHeight(floors: number) {
  return GROUND_H + FLOOR_H * (floors - 1) + 0.7;
}

/** A small-town commercial building, facade at z = 0 facing +Z, body extends to -d. */
export function building(s: BuildingSpec, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const { w, d, floors } = s;
  const h = buildingHeight(floors);
  const body = facadeMat(s.color, s.tex);
  const trim = s.trim ?? (rng.chance(0.5) ? M.trimLight : M.trimDark);
  const rec: FacadeRecord = { spec: s, w, d, h, trimLight: trim === M.trimLight, windows: [], shop: s.shop ?? null, shopX: -w * 0.12, shopW: w * 0.6, doorX: w / 2 - 1.3, groundLit: false, fireEscapeX: null };
  g.userData.pwBuilding = rec;
  pwTag(box(g, w, h, d, body, 0, h / 2, -d / 2), 'body');
  // Pilasters + cornice + floor band.
  box(g, 0.45, h, 0.2, trim, w / 2 - 0.22, h / 2, 0.08);
  box(g, 0.45, h, 0.2, trim, -w / 2 + 0.22, h / 2, 0.08);
  pwTag(box(g, w + 0.25, 0.45, 0.55, trim, 0, h - 0.22, 0.16), 'cornice');
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
      pwTag(box(g, 1.35, 1.95, 0.08, M.winFrame, x, y, 0.03), 'win');
      const r = rng.next();
      const mat = r < lit * 0.6 ? M.winWarm : r < lit * 0.85 ? M.winDim : r < lit ? M.winTv : M.winDark;
      pwTag(box(g, 1.12, 1.7, 0.1, mat, x, y, 0.04), 'win');
      pwTag(box(g, 1.5, 0.1, 0.25, trim, x, y - 0.98, 0.1), 'win');
      const wr: FacadeRecord['windows'][number] = { x, y, kind: mat === M.winWarm ? 'warm' : mat === M.winDim ? 'dim' : mat === M.winTv ? 'tv' : 'dark', boarded: false, ghoul: false, blind: false };
      rec.windows.push(wr);
      // Some dark windows are boarded up (reuses the window roll: no extra rng draws).
      if (mat === M.winDark && r > 0.88) {
        pwTagNew(g, () => boardUp(g, x, y, 1.3, 1.85, 0.1), 'win');
        wr.boarded = true;
      }
      if (mat !== M.winDark && s.ghouls !== false && rng.chance(0.16)) {
        // Something standing in the window…
        pwTag(box(g, 0.42, 0.95, 0.02, Kit.mat(0x0b0b0e), x + rng.spread(0.2), y - 0.35, 0.1), 'win');
        pwTag(box(g, 0.24, 0.26, 0.02, Kit.mat(0x0b0b0e), x + rng.spread(0.1), y + 0.28, 0.1), 'win');
        wr.ghoul = true;
      } else if (mat !== M.winDark && rng.chance(0.4)) {
        // Half-drawn blind.
        pwTag(box(g, 1.12, 0.6, 0.02, Kit.tex('cloth', 0x5a4a38, 0.5), x, y + 0.55, 0.1), 'win');
        wr.blind = true;
      }
    }
  }

  // Fire escape on the facade.
  if (s.fireEscape && floors >= 3) {
    const fx = rng.chance(0.5) ? -w / 4 : w / 4;
    pwTagNew(g, () => addFireEscape(g, floors, fx), 'fireEscape');
    rec.fireEscapeX = fx;
  }

  // Ground floor.
  const shop = s.shop;
  if (shop) {
    const ww = w * 0.6;
    const wx = -w * 0.12;
    const dx = w / 2 - 1.3;
    if (!shop.noWindow) {
      // Lit shop interiors read as tiled walls behind the glass.
      const imat = shop.interior ? texGlow(shop.interior, shop.interiorIntensity ?? 0.5, 'tiles', 1, 0.3) : M.winDark;
      pwTag(box(g, ww, 2.4, 0.1, imat, wx, 1.85, 0.04), 'shop');
      for (let i = 1; i < 3; i++) pwTag(box(g, 0.09, 2.4, 0.16, M.winFrame, wx - ww / 2 + (ww * i) / 3, 1.85, 0.07), 'shop');
      if (shop.boarded) pwTagNew(g, () => boardUp(g, wx, 1.85, ww + 0.1, 2.5, 0.18), 'shop');
    }
    pwTag(box(g, ww + 0.2, 0.65, 0.2, trim, wx, 0.33, 0.1), shop.noWindow ? 'keep' : 'shop');
    pwTag(box(g, ww + 0.3, 0.12, 0.2, trim, wx, 3.1, 0.1), shop.noWindow ? 'keep' : 'shop');
    // Door with a small lit pane.
    pwTag(box(g, 1.15, 2.6, 0.12, M.door, dx, 1.3, 0.04), 'door');
    if (shop.interior) pwTag(box(g, 0.6, 0.9, 0.04, Kit.glow(shop.interior, (shop.interiorIntensity ?? 0.5) * 0.8), dx, 1.85, 0.11), 'door');
    if (shop.shutter) {
      // Half-closed roll-down shutter over the window.
      pwTag(box(g, ww + 0.1, 1.3, 0.06, M.shutter, wx, 2.4, 0.16), 'shop');
      for (let i = 0; i < 4; i++) pwTag(box(g, ww + 0.1, 0.03, 0.08, M.metal, wx, 1.85 + i * 0.3, 0.18), 'shop');
    }
    if (shop.awning !== undefined) {
      const aw = w * 0.86;
      const am = Kit.tex('cloth', shop.awning, 0.5);
      pwTag(box(g, aw, 0.08, 1.8, am, 0, 3.55, 0.85, 0.34), 'awning');
      pwTag(box(g, aw, 0.36, 0.05, am, 0, 3.1, 1.72), 'valance');
    }
    if (shop.board) {
      const b = boardSign(shop.board.text, shop.board.color, shop.board.size ?? 0.55, { pad: 0.6 });
      b.position.set(0, 4.15, 0.2);
      g.add(b);
    }
  } else {
    // Residential ground floor: entrance + two dark windows.
    pwTag(box(g, 1.3, 2.7, 0.12, M.door, 0, 1.35, 0.04), 'door');
    box(g, 1.7, 0.2, 0.5, trim, 0, 2.85, 0.25);
    const r = rng.next();
    rec.doorX = 0;
    rec.groundLit = r < 0.3;
    for (const sx of [-1, 1]) {
      const x = sx * w * 0.28;
      pwTag(box(g, 1.6, 1.8, 0.08, M.winFrame, x, 1.8, 0.03), 'groundWin');
      pwTag(box(g, 1.4, 1.6, 0.1, r < 0.3 ? M.winDim : M.winDark, x, 1.8, 0.04), 'groundWin');
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
    pwTag(box(g, 0.7, 1.6, 0.7, Kit.tex('brick', 0x5a3a30, 1.2), rng.spread(w * 0.35), h + 0.8, -d * 0.75), 'keep').userData.pwChimney = true;
  } else if (roof === 'billboard') {
    const bb = new THREE.Group();
    box(bb, 0.15, 3, 0.15, M.metal, -2.4, 1.5, -0.4);
    box(bb, 0.15, 3, 0.15, M.metal, 2.4, 1.5, -0.4);
    const paper = (c: number) => Kit.tex('stucco', c, 1.5, 0.6);
    // ART: PIXEL WORLD paints an advertisement on the board (z1/pixel.ts) in place of the paper blocks.
    box(bb, 6.2, 3, 0.15, paper(0x8a7f62), 0, 4, 0).userData.pwBillboard = 'board';
    box(bb, 2.6, 2.4, 0.04, paper(0x9a3a2a), -1.5, 4, 0.1).userData.pwBillboard = 'paper';
    box(bb, 2.6, 0.5, 0.04, paper(0x2a3a5a), 1.5, 4.7, 0.1).userData.pwBillboard = 'paper';
    box(bb, 2.6, 0.3, 0.04, paper(0x2a3a5a), 1.5, 4.0, 0.1).userData.pwBillboard = 'paper';
    box(bb, 2.6, 0.3, 0.04, paper(0x2a3a5a), 1.5, 3.4, 0.1).userData.pwBillboard = 'paper';
    bb.position.set(0, h, -d * 0.3);
    g.add(bb);
  }
  return g;
}

/** Tag every object `build` adds to `g` (boards and other multi-mesh helpers). */
function pwTagNew(g: THREE.Object3D, build: () => void, kind: string) {
  const n = g.children.length;
  build();
  for (let i = n; i < g.children.length; i++) pwTag(g.children[i], kind);
}

/** Planks nailed over a window opening (wall facing +Z): a board panel + a diagonal brace. */
export function boardUp(g: THREE.Object3D, x: number, y: number, w: number, h: number, z: number) {
  box(g, w, h, 0.04, M.boards, x, y, z);
  const len = Math.hypot(w, h) * 0.92;
  const a = Math.atan2(h, w) * (Math.floor(x * 7.3 + y) % 2 ? 1 : -1);
  box(g, len, 0.17, 0.05, M.boardsDark, x, y, z + 0.04, 0, 0, a);
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
  // ART: PIXEL WORLD paints what each tagged mesh records (`userData.pwAlley`, z1/pwAlley.ts); the rng draws are unchanged.
  g.userData.pwWall = { x0, x1, floors };
  const tag = <T extends THREE.Object3D>(o: T, rec: Record<string, unknown>) => {
    o.userData.pwAlley = rec;
    return o;
  };
  for (let f = 1; f < floors; f++) {
    const y = GROUND_H + 0.35 + (f - 1) * FLOOR_H + 1.0;
    for (let x = x0 + 2; x < x1 - 1.5; x += rng.range(3.2, 5)) {
      tag(box(g, 1.1, 1.5, 0.08, M.winFrame, x, y, 0.03), { kind: 'drop' });
      const lit = rng.chance(0.18);
      const glass = tag(box(g, 0.9, 1.3, 0.1, lit ? M.winDim : M.winDark, x, y, 0.04), { kind: 'win', x, y, lit, boarded: false });
      if (!lit && rng.chance(0.3)) {
        pwTagNew(g, () => boardUp(g, x, y, 1.0, 1.4, 0.1), 'alley');
        (glass.userData.pwAlley as { boarded: boolean }).boarded = true;
      }
    }
  }
  for (const dx of opts.doors ?? []) {
    tag(box(g, 1.2, 2.5, 0.1, M.metal, dx, 1.25, 0.04), { kind: 'door', x: dx });
    tag(box(g, 1.6, 0.12, 0.6, M.metal, dx, 2.85, 0.3), { kind: 'canopy', x: dx });
  }
  for (const fx of opts.fireEscapes ?? []) pwTagNew(g, () => addFireEscape(g, floors, fx, 1.2), 'alley');
  (g.userData.pwWall as { fireEscapes?: number[] }).fireEscapes = opts.fireEscapes ?? [];
  // Drain pipes and AC units.
  for (let x = x0 + rng.range(1, 4); x < x1; x += rng.range(7, 11)) {
    tag(box(g, 0.14, GROUND_H + FLOOR_H * (floors - 1), 0.14, M.metal, x, (GROUND_H + FLOOR_H * (floors - 1)) / 2, 0.1), { kind: 'pipe', x, h: GROUND_H + FLOOR_H * (floors - 1) });
  }
  for (let i = 0; i < floors; i++) {
    if (!rng.chance(0.6)) continue;
    const x = rng.range(x0 + 2, x1 - 2);
    const y = GROUND_H + 0.6 + rng.int(0, floors - 2) * FLOOR_H;
    tag(box(g, 0.8, 0.55, 0.6, M.metalLight, x, y, 0.32), { kind: 'ac', x, y });
  }
  // Spray-painted tags and messages.
  const gcol = [0xc83a8a, 0x3ac8d8, 0xd8c83a, 0x4ad86a, 0xe8e8e8, 0xc83a3a];
  const words = ['HELP', 'RUN', 'ZED', 'NO EXIT', 'THEY BITE', 'GOD HELP US', 'KZ', 'DEAD END'];
  for (let i = 0; i < 3; i++) {
    const x = rng.range(x0 + 3, x1 - 3);
    const word = rng.pick(words);
    const col = rng.pick(gcol);
    const size = rng.range(0.35, 0.6);
    const t = addText(g, word, Kit.mat(col), { size, depth: 0.02, stroke: 0.07 });
    t.position.set(x, rng.range(1.2, 2.4), 0.05);
    t.rotation.z = rng.spread(0.12);
    tag(t, { kind: 'graffiti', word, col, size });
  }
}

// ─── Street furniture ───────────────────────────────────────────────────────

/** Sodium street lamp. Pole at origin, arm reaches toward +Z (the road). Lamp head at (0, 6.4, 2.2). */
export function streetLamp(): THREE.Group {
  const g = new THREE.Group();
  // (ART: PIXEL WORLD paints the tagged pole and head — z1/pwStreet.ts.)
  cyl(g, 0.08, 0.13, 6.6, 6, M.metal, 0, 3.3, 0).userData.pwPart = 'pole';
  box(g, 0.34, 0.5, 0.34, M.metal, 0, 0.25, 0);
  box(g, 0.1, 0.1, 2.3, M.metal, 0, 6.5, 1.1);
  box(g, 0.5, 0.2, 0.95, M.metal, 0, 6.42, 2.2).userData.pwPart = 'lampHead';
  box(g, 0.38, 0.05, 0.75, M.sodiumGlow, 0, 6.3, 2.2);
  return g;
}

export function hydrant(): THREE.Group {
  const g = new THREE.Group();
  g.userData.flora = 'hydrant'; // a pixel billboard in ART: SPRITES (see town.ts)
  const red = Kit.tex('metal', 0xa82218, 2, 0.6);
  cyl(g, 0.14, 0.16, 0.6, 8, red, 0, 0.3, 0);
  Kit.add(g, Kit.sphere(0.15, 8, 5), red, 0, 0.62, 0);
  cyl(g, 0.06, 0.06, 0.4, 6, red, 0, 0.42, 0, 0, 0, Math.PI / 2);
  return g;
}

export function trashCan(): THREE.Group {
  const g = new THREE.Group();
  g.userData.flora = 'trashCan'; // a pixel billboard in ART: SPRITES (see town.ts)
  cyl(g, 0.3, 0.26, 0.95, 8, Kit.tex('corrugated', 0x3c4c42, 2), 0, 0.48, 0);
  cyl(g, 0.33, 0.33, 0.06, 8, M.metal, 0, 0.98, 0);
  return g;
}

export function newsBox(color: number): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.5, 0.95, 0.45, Kit.tex('metal', color, 2, 0.5), 0, 0.6, 0).userData.pwPart = 'newsBox';
  box(g, 0.4, 0.3, 0.02, M.winDark, 0, 0.8, 0.23).userData.pwPart = 'drop';
  box(g, 0.08, 0.25, 0.08, M.metal, 0, 0.1, 0);
  return g;
}

export function bench(): THREE.Group {
  const g = new THREE.Group();
  // ART: PIXEL WORLD paints it as a slatted cast-iron bench (z1/pwProps.ts).
  g.userData.pwProp = 'bench';
  box(g, 1.8, 0.07, 0.45, M.wood, 0, 0.45, 0);
  box(g, 1.8, 0.4, 0.06, M.wood, 0, 0.75, -0.22, -0.15);
  box(g, 0.06, 0.45, 0.4, M.metal, -0.8, 0.22, 0);
  box(g, 0.06, 0.45, 0.4, M.metal, 0.8, 0.22, 0);
  return g;
}

export function mailbox(): THREE.Group {
  const g = new THREE.Group();
  const blue = Kit.tex('metal', 0x2a4888, 2, 0.5);
  box(g, 0.5, 0.75, 0.5, blue, 0, 0.75, 0).userData.pwPart = 'mailbox';
  cyl(g, 0.25, 0.25, 0.5, 8, blue, 0, 1.12, 0, Math.PI / 2, 0, 0);
  box(g, 0.08, 0.4, 0.08, M.metal, 0, 0.2, 0);
  return g;
}

export function trafficCone(): THREE.Group {
  const g = new THREE.Group();
  g.userData.flora = 'cone'; // a pixel billboard in ART: SPRITES (see town.ts)
  box(g, 0.4, 0.04, 0.4, M.orange, 0, 0.02, 0);
  Kit.add(g, Kit.cone(0.15, 0.6, 8), M.orange, 0, 0.32, 0);
  cyl(g, 0.095, 0.115, 0.12, 8, M.white, 0, 0.3, 0);
  return g;
}

/** Police sawhorse barrier with hazard-striped boards, ~2.4 m wide, facing +Z. */
export function sawhorse(): THREE.Group {
  const g = new THREE.Group();
  // ART: PIXEL WORLD paints its striped boards and splayed legs (z1/pwProps.ts).
  g.userData.pwProp = 'sawhorse';
  box(g, 2.4, 0.26, 0.05, M.hazard, 0, 0.95, 0);
  box(g, 2.4, 0.2, 0.05, M.hazard, 0, 0.45, 0);
  const legs = Kit.tex('planks', 0xc8c4ba, 2, 0.5);
  for (const sx of [-1.1, 1.1]) {
    box(g, 0.08, 1.15, 0.08, legs, sx, 0.55, 0.22, -0.32);
    box(g, 0.08, 1.15, 0.08, legs, sx, 0.55, -0.22, 0.32);
  }
  return g;
}

/**
 * Street tree in a sidewalk planter. The trunk + crown sit in a child group
 * tagged `userData.flora` (the pixel species standing in for them in ART:
 * SPRITES, see town.ts); the planter stays 3D in both modes.
 */
export function streetTree(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  box(g, 1.2, 0.12, 1.2, M.curb, 0, 0.06, 0);
  const t = new THREE.Group();
  t.userData.flora = 'streetTree';
  g.add(t);
  const h = rng.range(2.6, 3.4);
  cyl(t, 0.09, 0.13, h, 6, M.bark, 0, h / 2, 0);
  const s = rng.range(0.9, 1.25);
  Kit.add(t, Kit.ico(1.3, 0), M.foliage, 0, h + 0.6, 0, rng.next(), rng.next(), 0, s, s * 0.85, s);
  Kit.add(t, Kit.ico(0.9, 0), M.foliage, 0.6, h + 1.3, 0.2, rng.next(), 0, 0, s);
  return g;
}

/** Utility / telephone pole with a crossbar (wires added separately). */
export function utilityPole(): THREE.Group {
  const g = new THREE.Group();
  const wood = Kit.tex('bark', 0x4c3a2e, 1.5);
  cyl(g, 0.12, 0.16, 9, 6, wood, 0, 4.5, 0);
  box(g, 2.2, 0.14, 0.14, Kit.tex('planks', 0x4c3a2e, 1.5), 0, 8.4, 0);
  cyl(g, 0.22, 0.22, 0.6, 6, M.metalLight, 0.45, 7.8, 0.2);
  return g;
}

export function dumpster(color = 0x2a4a32): THREE.Group {
  const g = new THREE.Group();
  const m = Kit.tex('metal', color, 1);
  box(g, 2.2, 1.25, 1.3, m, 0, 0.75, 0).userData.pwPart = 'dumpBody';
  box(g, 2.3, 0.1, 1.4, Kit.tex('metal', 0x24302a, 1.2), 0, 1.42, -0.05, -0.25).userData.pwPart = 'dumpLid';
  for (const sx of [-0.9, 0.9]) cyl(g, 0.1, 0.1, 0.1, 6, M.tire, sx, 0.1, 0.5, Math.PI / 2);
  return g;
}

export function trashBags(rng: Rng, n = 4): THREE.Group {
  const g = new THREE.Group();
  // ART: PIXEL WORLD stands a painted heap of bags (crossed cut-outs) in their place.
  g.userData.pwBags = n;
  const m = Kit.tex('hide', 0x24262c, 1.5, 0.8);
  for (let i = 0; i < n; i++) {
    const s = rng.range(0.32, 0.45);
    Kit.add(g, Kit.ico(s, 0), m, rng.spread(0.9), s * 0.75, rng.spread(0.6), rng.next(), rng.next(), 0, 1, 0.8, 1);
  }
  return g;
}

export function crate(s = 0.8): THREE.Group {
  const g = new THREE.Group();
  // ART: PIXEL WORLD paints its boards, brace and stencil (z1/pwProps.ts).
  g.userData.pwProp = 'crate';
  g.userData.pwSize = s;
  box(g, s, s, s, M.wood, 0, s / 2, 0);
  box(g, s + 0.02, 0.08, s + 0.02, M.boardsDark, 0, s * 0.85, 0);
  box(g, s + 0.02, 0.08, s + 0.02, M.boardsDark, 0, s * 0.15, 0);
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
  // ART: PIXEL WORLD paints every tagged part with car modules (z1/pwCars.ts); the record says how.
  g.userData.pwCar = o;
  const t = <T extends THREE.Object3D>(m: T, part: string) => {
    m.userData.pwPart = part;
    return m;
  };
  // Painted sheet metal: faint panel lines + rust; burnt wrecks are all rust and scorch.
  const paint = o.burnt ? Kit.tex('metal', 0x2e2622, 1) : o.police ? Kit.tex('metal', 0x18191f, 1, 0.5) : Kit.tex('metal', o.color, 1, 0.55);
  const glass = o.burnt ? Kit.mat(0x050505) : M.carGlass;
  t(box(g, 1.82, 0.62, 4.5, paint, 0, 0.62, 0), 'body');
  t(box(g, 1.8, 0.1, 1.25, paint, 0, 0.96, 1.55, o.wrecked ? 0.22 : 0.05), 'hood');
  t(box(g, 1.62, 0.5, 2.15, glass, 0, 1.17, -0.25), 'glass');
  t(box(g, 1.66, 0.08, 1.85, paint, 0, 1.45, -0.3), 'roof');
  // Pillars.
  t(box(g, 1.66, 0.5, 0.12, paint, 0, 1.17, 0.78, -0.4), 'pillar');
  t(box(g, 1.66, 0.5, 0.12, paint, 0, 1.17, -1.33, 0.35), 'pillar');
  if (o.police) {
    // White door panels + lightbar.
    for (const sx of [1, -1]) t(box(g, 0.04, 0.5, 2.0, M.white, sx * 0.92, 0.66, -0.15), 'police');
    t(box(g, 1.3, 0.12, 0.34, M.metal, 0, 1.55, -0.3), 'lightbase');
    const red = box(g, 0.6, 0.14, 0.3, Kit.glow(0xff2020, 1.6), 0.32, 1.58, -0.3);
    const blue = box(g, 0.6, 0.14, 0.3, Kit.glow(0x2050ff, 1.6), -0.32, 1.58, -0.3);
    red.userData.noMerge = true;
    blue.userData.noMerge = true;
    g.userData.lightbar = [red, blue];
  }
  const bumper = o.burnt ? Kit.tex('metal', 0x2a2522, 1.5) : M.chrome;
  t(box(g, 1.86, 0.2, 0.16, bumper, 0, 0.42, 2.27), 'bumper');
  t(box(g, 1.86, 0.2, 0.16, bumper, 0, 0.42, -2.27), 'bumper');
  t(box(g, 1.0, 0.22, 0.04, M.winFrame, 0, 0.66, 2.26), 'grille');
  const wheel = Kit.cyl(0.35, 0.35, 0.26, 10);
  for (const [x, z] of [[0.86, 1.4], [-0.86, 1.4], [0.86, -1.4], [-0.86, -1.4]]) {
    t(Kit.add(g, wheel, M.tire, x, 0.35, z, 0, 0, Math.PI / 2), 'wheel');
    if (!o.burnt) t(Kit.add(g, Kit.cyl(0.18, 0.18, 0.28, 8), M.metalLight, x, 0.35, z, 0, 0, Math.PI / 2), 'hub');
  }
  if (!o.burnt) {
    const hl = o.headlights ? M.headlight : Kit.mat(0xb8b4a0);
    t(box(g, 0.36, 0.15, 0.05, hl, 0.62, 0.68, 2.26), 'head');
    t(box(g, 0.36, 0.15, 0.05, hl, -0.62, 0.68, 2.26), 'head');
    const tl = o.taillights ? M.taillight : Kit.mat(0x5a1410);
    t(box(g, 0.4, 0.14, 0.05, tl, 0.6, 0.72, -2.26), 'tail');
    t(box(g, 0.4, 0.14, 0.05, tl, -0.6, 0.72, -2.26), 'tail');
  }
  for (const d of o.open ?? []) {
    const side = d[1] === 'l' ? 1 : -1;
    const front = d[0] === 'f';
    const hingeZ = front ? 0.95 : -0.25;
    const pivot = Kit.pivot(g, side * 0.91, 0, hingeZ);
    pivot.rotation.y = side * (front ? 1.0 : 0.85);
    t(box(pivot, 0.07, 0.6, 1.05, paint, 0, 0.66, -0.52), 'door');
    t(box(pivot, 0.04, 0.42, 0.9, glass, 0, 1.18, -0.5), 'doorGlass');
  }
  return g;
}

/** Yellow school bus, front toward +Z, ≈ 11 × 2.5 × 3 m (upright). */
export function schoolBus(): THREE.Group {
  const g = new THREE.Group();
  // ART: PIXEL WORLD paints the tagged parts (z1/pwBus.ts).
  const t = <T extends THREE.Object3D>(m: T, part: string) => {
    m.userData.pwPart = part;
    return m;
  };
  const yellow = Kit.tex('metal', 0xd29a16, 1, 0.6);
  const black = Kit.tex('metal', 0x1c1c1f, 1.5, 0.6);
  t(box(g, 2.5, 2.1, 9.6, yellow, 0, 1.75, -0.6), 'body');
  t(box(g, 2.3, 1.0, 1.6, yellow, 0, 1.15, 4.9), 'nose');
  t(box(g, 2.52, 0.18, 9.6, black, 0, 1.5, -0.6), 'band');
  t(box(g, 2.52, 0.12, 9.6, black, 0, 1.0, -0.6), 'band');
  t(box(g, 2.4, 0.2, 9.4, yellow, 0, 2.9, -0.6), 'roofBand');
  // Windows along both sides.
  for (let i = 0; i < 8; i++) {
    const z = 3.4 - i * 1.15;
    for (const sx of [1, -1]) t(box(g, 0.06, 0.75, 0.95, M.carGlass, sx * 1.26, 2.25, z), 'window');
  }
  t(box(g, 2.3, 0.85, 0.08, M.carGlass, 0, 2.25, 4.15, -0.2), 'windshield');
  t(box(g, 2.5, 0.35, 0.2, black, 0, 0.75, 5.7), 'bumper');
  for (const z of [3.6, -3.4]) {
    for (const sx of [1.15, -1.15]) t(Kit.add(g, Kit.cyl(0.5, 0.5, 0.35, 10), M.tire, sx, 0.5, z, 0, 0, Math.PI / 2), 'wheel');
  }
  // Stop sign arm + lights.
  t(box(g, 0.06, 0.5, 0.5, Kit.tex('metal', 0x8a1a14, 2, 0.5), 1.3, 1.9, 3.2), 'stop');
  t(box(g, 0.3, 0.2, 0.06, Kit.mat(0x8a2a10), 0.8, 2.75, 4.3), 'lamp');
  t(box(g, 0.3, 0.2, 0.06, Kit.mat(0x8a2a10), -0.8, 2.75, 4.3), 'lamp');
  // Rear frame around the emergency door (the door itself is a separate animated prop).
  t(box(g, 2.5, 0.2, 0.1, black, 0, 2.75, -5.42), 'band');
  // Underbody: chassis rails, axles, fuel tank, exhaust (it ends up facing the street).
  const chassis = Kit.tex('metal', 0x1e1e21, 1.5);
  t(box(g, 2.3, 0.08, 10.6, chassis, 0, 0.68, -0.2), 'chassis');
  for (const x of [-0.6, 0.6]) t(box(g, 0.2, 0.25, 10.4, Kit.tex('metal', 0x2e2e31, 2), x, 0.55, -0.2), 'chassis');
  for (const z of [3.6, -3.4]) t(cyl(g, 0.1, 0.1, 2.3, 6, M.metal, 0, 0.5, z, 0, 0, Math.PI / 2), 'axle');
  t(box(g, 0.7, 0.4, 1.4, Kit.tex('metal', 0x3a3a3e, 2), 0.7, 0.45, 0.6), 'chassis');
  t(cyl(g, 0.07, 0.07, 6, 6, M.metalLight, -0.85, 0.45, -1.5, Math.PI / 2, 0, 0), 'axle');
  // SCHOOL BUS lettering on the roof edges front and back.
  for (const z of [4.22, -5.42]) {
    const tx = paintedText('SCHOOL BUS', 0x111111, 0.28);
    tx.position.set(0, 2.62, z + (z > 0 ? 0.06 : -0.06));
    if (z < 0) tx.rotation.y = Math.PI;
    g.add(t(tx, 'text'));
  }
  return g;
}

// ─── Lettering for street paint / banners (not neon) ────────────────────────

export function paintedText(text: string, color: number, size: number): THREE.Group {
  const g = new THREE.Group();
  addText(g, text, Kit.mat(color), { size, depth: 0.03, stroke: size * 0.14 });
  return g;
}
