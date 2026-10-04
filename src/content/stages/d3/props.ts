import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { blockText } from './font';
import { sway } from './bake';
import { clean, tx } from './retro';

/**
 * Builders for TYRANT CHASE's man-made scenery: paddock pylons, park tour
 * cars, lamp posts, the visitor centre, roadblock barriers, the trestle
 * bridge, the helipad, the helicopter and the fuel tank. Everything faces +Z
 * (toward the road when placed) with its base at y = 0.
 */

const _a = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

export const PAL = {
  concrete: 0x8c8a82,
  concreteDark: 0x5e5c56,
  metal: 0x3a3e42,
  metalLight: 0x6a7076,
  hazardY: 0xe0b020,
  wood: 0x6e5038,
  woodDark: 0x4a3424,
  stucco: 0x9c917c,
  stuccoDark: 0x7a705e,
  thatch: 0x4c3b28,
  glass: 0x1a2840,
  carWhite: 0xb4ae9c,
  carRed: 0xb8302a,
  carGreen: 0x2f7a3a,
  tire: 0x1c1c1e,
  warm: 0xffd9a0,
  amber: 0xffa020,
  red: 0xff2a1a,
} as const;

/** Cylinder from point a to point b (parent space). */
export function beam(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 5): THREE.Mesh {
  _a.subVectors(b, a);
  const len = _a.length();
  const m = Kit.add(parent, Kit.cyl(r, r, len, seg), mat);
  m.position.copy(a).addScaledVector(_a, 0.5);
  _q.setFromUnitVectors(_up, _a.normalize());
  m.quaternion.copy(_q);
  return m;
}

/** Sagging cable between two points: `n` straight pieces along a catenary-ish curve. */
export function cable(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, sag: number, r: number, mat: THREE.Material, n = 3) {
  let prev = a.clone();
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    beam(parent, prev, p, r, mat, 4);
    prev = p;
  }
}

/** Ring of boxes in the XZ plane (pad markings). */
export function ringOfBoxes(parent: THREE.Object3D, radius: number, width: number, n: number, mat: THREE.Material, y = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const seg = ((Math.PI * 2 * radius) / n) * 1.04;
    Kit.add(parent, Kit.box(seg, 0.04, width), mat, Math.cos(a) * radius, y, Math.sin(a) * radius, 0, -a + Math.PI / 2, 0);
  }
}

// ─── Paddock fence ──────────────────────────────────────────────────────────

/** Concrete pylon with insulator arms and a red aircraft lamp (glow) on top. */
export function pylon(h = 9.5, lamp = true): THREE.Group {
  const g = new THREE.Group();
  const conc = tx('concrete', PAL.concrete, 1.2, 1);
  Kit.add(g, Kit.box(0.9, h, 0.9), conc, 0, h / 2, 0);
  Kit.add(g, Kit.box(1.2, 0.5, 1.2), tx('concrete', PAL.concreteDark, 1.2, 1), 0, 0.25, 0);
  Kit.add(g, Kit.box(1.1, 0.3, 1.1), tx('concrete', PAL.concreteDark, 1.2, 1), 0, h + 0.15, 0);
  // Painted hazard band round the base (reads as "keep back" at arcade resolution).
  if (h > 5) Kit.add(g, Kit.box(0.94, 0.8, 0.94), tx('hazard', PAL.hazardY, 1.4, 1), 0, 1.0, 0);
  const ins = tx('metal', 0x34363c, 3, 0.6);
  for (let i = 0; i < 6; i++) {
    const y = 1.3 + i * ((h - 2) / 5);
    Kit.add(g, Kit.box(0.25, 0.12, 1.3), ins, 0, y, 0);
  }
  if (lamp) Kit.add(g, Kit.box(0.22, 0.22, 0.22), Kit.glow(0xff3020, 1.4), 0, h + 0.42, 0);
  return g;
}

/** DANGER sign plate (faces +Z). */
export function dangerSign(): THREE.Group {
  const g = new THREE.Group();
  const post = tx('metal', PAL.metal, 2, 0.7);
  Kit.add(g, Kit.box(3.6, 1.7, 0.08), tx('metal', 0xb02018, 1.6, 0.4, { emissive: 0x300806, emissiveIntensity: 0.6 }), 0, 0, 0);
  Kit.add(g, Kit.box(3.75, 0.12, 0.1), tx('hazard', PAL.hazardY, 2, 1), 0, 0.88, 0);
  Kit.add(g, Kit.box(3.75, 0.12, 0.1), tx('hazard', PAL.hazardY, 2, 1), 0, -0.88, 0);
  const white = clean(0xf2ece0, { emissive: 0x3a3a34, emissiveIntensity: 0.6 });
  const t1 = blockText('DANGER', 0.085, white, 0.04);
  t1.position.set(0, 0.05, 0.06);
  g.add(t1);
  const t2 = blockText('HIGH VOLTAGE', 0.042, white, 0.04);
  t2.position.set(0, -0.6, 0.06);
  g.add(t2);
  for (const sx of [-1.4, 1.4]) Kit.add(g, Kit.box(0.1, 3, 0.1), post, sx, -0.6, -0.08);
  return g;
}

// ─── Vehicles ────────────────────────────────────────────────────────────────

/** Park tour SUV (white with red/green livery stripes). `crushed` flattens the roof. */
export function tourCar(crushed = false): THREE.Group {
  const g = new THREE.Group();
  const white = tx('metal', PAL.carWhite, 1.4, 0.5);
  const under = tx('metal', 0x2e2c2a, 2, 0.7);
  const red = tx('metal', PAL.carRed, 1.4, 0.5);
  const green = tx('metal', PAL.carGreen, 1.4, 0.5);
  const dark = tx('metal', 0x2a2c30, 2, 0.6);
  const glass = clean(PAL.glass, { emissive: 0x08101c, emissiveIntensity: 1 });
  const tire = tx('asphalt', PAL.tire, 3, 0.8);
  Kit.add(g, Kit.box(2.0, 1.0, 4.6), white, 0, 0.95, 0);
  const roofH = crushed ? 0.45 : 0.95;
  Kit.add(g, Kit.box(1.86, roofH, 2.7), white, 0, 1.45 + roofH / 2, -0.35, crushed ? 0.08 : 0, 0, crushed ? 0.12 : 0);
  // Windows.
  for (const sx of [-1, 1]) Kit.add(g, Kit.box(0.04, roofH * 0.7, 2.4), glass, sx * 0.94, 1.45 + roofH * 0.55, -0.35);
  Kit.add(g, Kit.box(1.7, roofH * 0.7, 0.04), glass, 0, 1.45 + roofH * 0.55, 1.0);
  // Livery.
  for (const sx of [-1, 1]) {
    Kit.add(g, Kit.box(0.04, 0.16, 4.62), red, sx * 1.01, 1.05, 0);
    Kit.add(g, Kit.box(0.04, 0.1, 4.62), green, sx * 1.01, 0.86, 0);
  }
  // Bumpers, bull bar, light bar.
  Kit.add(g, Kit.box(2.1, 0.28, 0.25), dark, 0, 0.55, 2.38);
  Kit.add(g, Kit.box(2.1, 0.28, 0.25), dark, 0, 0.55, -2.38);
  if (!crushed) Kit.add(g, Kit.box(1.5, 0.14, 0.3), tx('metal', 0x8a6a20, 3, 0.5), 0, 2.48, 0.2);
  for (const sx of [-0.65, 0.65]) Kit.add(g, Kit.box(0.3, 0.18, 0.05), clean(0xd8d0a0, { emissive: 0x403820, emissiveIntensity: 1 }), sx, 0.95, 2.31);
  // Chassis underside, axles, exhaust + wheels.
  Kit.add(g, Kit.box(1.9, 0.12, 4.3), under, 0, 0.42, 0);
  for (const sz of [-1.45, 1.45]) Kit.add(g, Kit.cyl(0.08, 0.08, 1.9, 6), under, 0, 0.45, sz, 0, 0, Math.PI / 2);
  Kit.add(g, Kit.cyl(0.06, 0.06, 3.6, 6), tx('metal', 0x4a4642, 3, 0.6), 0.5, 0.36, -0.3, Math.PI / 2, 0, 0);
  for (const sx of [-1, 1]) for (const sz of [-1.45, 1.45]) Kit.add(g, Kit.cyl(0.45, 0.45, 0.36, 10), tire, sx * 0.92, 0.45, sz, 0, 0, Math.PI / 2);
  if (crushed) g.scale.set(1.05, 0.92, 1);
  return g;
}

/** Utility truck stuck in the mud. Returns the group and its blinking hazard lamps. */
export function maintenanceTruck(): { root: THREE.Group; hazards: THREE.Mesh[] } {
  const g = new THREE.Group();
  const yellow = tx('metal', 0xb08a28, 1.4, 0.6);
  const dark = tx('asphalt', 0x2a2c2e, 3, 0.8);
  const glass = clean(PAL.glass, { emissive: 0x08101c, emissiveIntensity: 1 });
  Kit.add(g, Kit.box(2.2, 1.6, 2.0), yellow, 0, 1.5, 1.8);
  Kit.add(g, Kit.box(2.0, 0.6, 0.05), glass, 0, 1.95, 2.81);
  Kit.add(g, Kit.box(2.3, 0.9, 4.0), tx('corrugated', 0x6a6a62, 1.4, 0.8), 0, 1.15, -1.3);
  Kit.add(g, Kit.box(2.3, 0.15, 4.0), tx('hazard', PAL.hazardY, 2, 1), 0, 1.67, -1.3);
  for (const sx of [-1, 1]) for (const sz of [-2.4, -0.6, 1.9]) Kit.add(g, Kit.cyl(0.5, 0.5, 0.4, 10), dark, sx * 1.02, 0.4, sz, 0, 0, Math.PI / 2);
  // Crane arm.
  Kit.add(g, Kit.box(0.3, 0.3, 4.2), yellow, 0.5, 2.6, -1.2, -0.35, 0, 0);
  const hazards: THREE.Mesh[] = [];
  for (const sx of [-0.8, 0.8]) {
    const h = Kit.add(g, Kit.box(0.22, 0.16, 0.08), Kit.glow(PAL.amber, 1.8), sx, 2.38, 2.0);
    h.userData.noMerge = true;
    hazards.push(h);
  }
  return { root: g, hazards };
}

// ─── Road furniture ──────────────────────────────────────────────────────────

/** Park lamp post. `on` = lit (bulb glow baked); returns the bulb for flickering lamps. */
export function lampPost(on: boolean): { root: THREE.Group; bulb: THREE.Mesh } {
  const g = new THREE.Group();
  const pole = tx('metal', 0x34403a, 2.5, 0.7);
  Kit.add(g, Kit.cyl(0.18, 0.22, 0.6, 6), pole, 0, 0.3, 0);
  Kit.add(g, Kit.cyl(0.07, 0.1, 5.6, 6), pole, 0, 3.0, 0);
  Kit.add(g, Kit.box(0.1, 0.1, 1.5), pole, 0, 5.7, 0.7);
  Kit.add(g, Kit.cyl(0.32, 0.2, 0.3, 6), pole, 0, 5.62, 1.4);
  const bulb = Kit.add(g, Kit.cyl(0.24, 0.24, 0.08, 6), on ? Kit.glow(PAL.warm, 1.6) : clean(0x3a3a34), 0, 5.44, 1.4);
  return { root: g, bulb };
}

/** Hazard-striped barrier on A-frame legs, with a blinking amber lamp. */
export function sawhorse(): { root: THREE.Group; lamp: THREE.Mesh } {
  const g = new THREE.Group();
  const wood = tx('planks', 0xd8d0c0, 3, 0.7);
  Kit.add(g, Kit.box(2.6, 0.32, 0.08), tx('hazard', PAL.hazardY, 2.5, 1), 0, 0.95, 0);
  Kit.add(g, Kit.box(2.6, 0.22, 0.08), tx('hazard', PAL.hazardY, 2.5, 1), 0, 0.45, 0);
  for (const sx of [-1.1, 1.1]) {
    Kit.add(g, Kit.box(0.08, 1.2, 0.08), wood, sx, 0.6, 0.25, -0.35, 0, 0);
    Kit.add(g, Kit.box(0.08, 1.2, 0.08), wood, sx, 0.6, -0.25, 0.35, 0, 0);
  }
  const lamp = Kit.add(g, Kit.cyl(0.11, 0.11, 0.16, 6), Kit.glow(PAL.amber, 2), -1.1, 1.22, 0);
  lamp.userData.noMerge = true;
  return { root: g, lamp };
}

/** Wooden direction sign with block text. */
export function roadSign(text: string, px = 0.09): THREE.Group {
  const g = new THREE.Group();
  const w = text.length * 6 * px + 0.5;
  const wood = tx('planks', 0x5e442c, 2, 0.9);
  Kit.add(g, Kit.box(w, px * 7 + 0.4, 0.1), wood, 0, 2.2, 0);
  for (const sx of [-w / 2 + 0.25, w / 2 - 0.25]) Kit.add(g, Kit.box(0.14, 2.4, 0.14), wood, sx, 1.2, -0.08);
  const t = blockText(text, px, clean(0xe8d8a8, { emissive: 0x2a2416, emissiveIntensity: 0.8 }), 0.03);
  t.position.set(0, 2.2 - px * 3.5, 0.06);
  g.add(t);
  return g;
}

// ─── Visitor centre ──────────────────────────────────────────────────────────

export interface VisitorParts {
  root: THREE.Group;
  /** Static parts to bake (the building — these stop bullets). */
  shell: THREE.Group;
  /** Static plaza dressing to bake that must NOT stop bullets (the fountain sits in the fight zone). */
  plaza: THREE.Group;
  doorL: THREE.Group;
  doorR: THREE.Group;
  /** Flickering lit windows (not baked). */
  flicker: THREE.Mesh[];
  beacon: THREE.Mesh;
  /** Local position of the doorway (ground). */
  door: THREE.Vector3;
}

/**
 * Grand visitor centre: stucco wings under steep thatched pyramid roofs, a
 * taller glass atrium, a colonnade with torn banners, "VISITOR CENTER" lettering
 * (half the bulbs dead) and big double doors (animated separately).
 */
export function visitorCentre(): VisitorParts {
  const root = new THREE.Group();
  const shell = new THREE.Group();
  const plaza = new THREE.Group();
  root.add(shell, plaza);
  const stucco = tx('stucco', PAL.stucco, 1, 1);
  const stuccoDark = tx('stucco', PAL.stuccoDark, 1, 1);
  const thatch = tx('bark', PAL.thatch, 0.9, 1);
  const thatchDark = tx('bark', 0x3a2c1e, 0.9, 1);
  const glass = clean(PAL.glass, { emissive: 0x0a1424, emissiveIntensity: 1 });
  const frame = tx('metal', 0x2e2a24, 2.5, 0.6);
  const lit = Kit.glow(0xffa848, 1.05);
  const W = 40;
  const D = 16;
  // Wings (on a weathered concrete plinth).
  Kit.add(shell, Kit.box(W, 8, D), stucco, 0, 4, -D / 2 - 1);
  Kit.add(shell, Kit.box(W + 0.16, 1.1, D + 0.16), tx('concrete', 0x6e685c, 1.2, 1), 0, 0.55, -D / 2 - 1);
  Kit.add(shell, Kit.box(W + 0.6, 0.6, D + 0.6), stuccoDark, 0, 8.1, -D / 2 - 1);
  // Atrium.
  Kit.add(shell, Kit.box(15, 12.5, 14), stucco, 0, 6.25, -8);
  // Wing roofs (square pyramids) + central roof.
  for (const sx of [-12.5, 12.5]) {
    Kit.add(shell, Kit.cone(11.4, 6.5, 4), thatch, sx, 8.4 + 3.25, -9, 0, Math.PI / 4, 0);
    Kit.add(shell, Kit.cone(0.5, 1.6, 4), thatchDark, sx, 15.2, -9, 0, Math.PI / 4, 0);
  }
  Kit.add(shell, Kit.cone(11.2, 9.5, 4), thatchDark, 0, 12.4 + 4.75, -8, 0, Math.PI / 4, 0);
  Kit.add(shell, Kit.cone(0.6, 2.4, 4), thatch, 0, 23.2, -8, 0, Math.PI / 4, 0);
  // Atrium glass front (grid of panes) — the big dark window.
  const gw = 12;
  const gh = 9;
  Kit.add(shell, Kit.box(gw, gh, 0.1), glass, 0, 2.8 + gh / 2, -0.95);
  for (let i = 0; i <= 6; i++) Kit.add(shell, Kit.box(0.14, gh, 0.2), frame, -gw / 2 + (i * gw) / 6, 2.8 + gh / 2, -0.88);
  for (let j = 0; j <= 4; j++) Kit.add(shell, Kit.box(gw, 0.14, 0.2), frame, 0, 2.8 + (j * gh) / 4, -0.88);
  // A couple of warm panes still lit high up in the atrium.
  Kit.add(shell, Kit.box(1.9, 2.1, 0.12), lit, -3, 9.6, -0.9);
  Kit.add(shell, Kit.box(1.9, 2.1, 0.12), lit, 4.9, 7.4, -0.9);
  // Wing windows.
  const flicker: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      for (let row = 0; row < 2; row++) {
        const x = side * (9.5 + i * 2.9);
        const y = 2.4 + row * 3.2;
        const isLit = (i + row * 3 + (side > 0 ? 1 : 0)) % 5 === 0;
        const isFlicker = side > 0 && i === 2 && row === 0;
        const m = Kit.add(shell, Kit.box(2.0, 2.0, 0.12), isFlicker ? Kit.glow(0xc8e0ff, 0.9) : isLit ? lit : glass, x, y, -0.95);
        if (isFlicker) {
          m.userData.noMerge = true;
          flicker.push(m);
        }
        // Window frame + mullion cross.
        Kit.add(shell, Kit.box(0.12, 2.0, 0.18), frame, x, y, -0.9);
        Kit.add(shell, Kit.box(2.0, 0.12, 0.18), frame, x, y, -0.9);
        Kit.add(shell, Kit.box(2.3, 0.18, 0.3), stuccoDark, x, y - 1.1, -0.85);
      }
    }
  }
  // Colonnade + portico.
  const col = tx('concrete', 0xb0a68e, 1.4, 0.8);
  for (const x of [-12, -7.5, -3.2, 3.2, 7.5, 12]) {
    Kit.add(shell, Kit.cyl(0.5, 0.58, 7.2, 8), col, x, 3.6, 2.6);
    Kit.add(shell, Kit.box(1.4, 0.4, 1.4), col, x, 0.2, 2.6);
    Kit.add(shell, Kit.box(1.3, 0.35, 1.3), col, x, 7.3, 2.6);
  }
  Kit.add(shell, Kit.box(28, 0.8, 5), stuccoDark, 0, 7.8, 1.6);
  // "VISITOR CENTER" — half the letters' bulbs are dead.
  const letters = blockText('VISITOR CENTER', 0.13, Kit.glow(0xffd8a0, 0.95), 0.08);
  letters.position.set(0, 7.48, 4.12);
  shell.add(letters);
  let li = 0;
  letters.children.forEach((c) => {
    li++;
    // Kill a few "bulbs" (pixels) in a deterministic pattern.
    if ((li * 37) % 11 < 3) (c as THREE.Mesh).material = clean(0x3a3428);
  });
  Kit.add(shell, Kit.box(13, 1.4, 0.15), tx('metal', 0x2e261c, 1.5, 0.7), 0, 7.95, 4.08);
  // Floor + step.
  Kit.add(shell, Kit.box(W + 2, 0.3, 7), tx('tiles', 0x7c7a72, 0.7, 0.8), 0, 0.15, 1.5);
  Kit.add(shell, Kit.box(18, 0.15, 1.2), tx('concrete', 0x6c6a62, 1.2, 0.9), 0, 0.075, 5.4);
  // Dark doorway behind the doors.
  Kit.add(shell, Kit.box(4.8, 5.2, 0.4), clean(0x0e1016), 0, 2.9, -0.8);
  Kit.add(shell, Kit.box(5.6, 0.4, 0.6), frame, 0, 5.6, -0.7);
  for (const sx of [-2.6, 2.6]) Kit.add(shell, Kit.box(0.4, 5.4, 0.6), frame, sx, 2.9, -0.7);
  // Torn banners (sway).
  for (const [x, len] of [[-5.3, 6.2], [5.3, 3.4]] as const) {
    const b = new THREE.Group();
    b.position.set(x, 7.4, 4.25);
    shell.add(b);
    Kit.add(b, Kit.box(2.0, len, 0.05), tx('cloth', 0xa81e1a, 1.2, 0.9), 0, -len / 2, 0);
    Kit.add(b, Kit.box(1.0, 1.0, 0.07), tx('cloth', 0xe0b040, 1.2, 0.6), 0, -1.6, 0, 0, 0, Math.PI / 4);
    Kit.add(b, Kit.box(0.6, 0.6, 0.08), clean(0x1a1410), 0, -1.6, 0, 0, 0, Math.PI / 4);
    // Banner sways from the top: a negative height makes the weight grow downward.
    sway(b, 0.45, -len);
  }
  // Fountain on the plaza.
  const basin = tx('concrete', 0x8a867c, 1.4, 0.9);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    Kit.add(plaza, Kit.box(1.9, 0.6, 0.4), basin, Math.cos(a) * 2.9, 0.3, 12 + Math.sin(a) * 2.9, 0, -a + Math.PI / 2, 0);
  }
  Kit.add(plaza, Kit.cyl(2.8, 2.8, 0.1, 10), tx('water', 0x2e4260, 1.6, 0.7, { emissive: 0x0c1626, emissiveIntensity: 1 }), 0, 0.45, 12);
  Kit.add(plaza, Kit.cyl(0.4, 0.6, 2.2, 8), basin, 0, 1.1, 12);
  Kit.add(plaza, Kit.sphere(0.55, 8, 6), Kit.glow(0xffb050, 0.8), 0, 2.6, 12);
  // Doors (pivot at the outer edges).
  const doorMat = tx('planks', 0x5e3e26, 1.6, 0.9);
  const doorGlass = clean(0x26364e, { emissive: 0x0a1424, emissiveIntensity: 1 });
  const makeDoor = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 2.3, 0.3, -0.45);
    const d = new THREE.Group();
    d.position.set(-side * 1.15, 0, 0);
    pivot.add(d);
    Kit.add(d, Kit.box(2.25, 4.9, 0.22), doorMat, 0, 2.45, 0);
    Kit.add(d, Kit.box(1.4, 2.0, 0.24), doorGlass, 0, 3.3, 0);
    Kit.add(d, Kit.box(0.12, 0.6, 0.3), tx('metal', 0xc0a050, 4, 0.5), -side * 0.9, 2.3, 0.08);
    root.add(pivot);
    return pivot;
  };
  const doorL = makeDoor(-1);
  const doorR = makeDoor(1);
  // Red emergency beacon above the doors.
  const beacon = Kit.add(root, Kit.box(0.8, 0.3, 0.3), Kit.glow(PAL.red, 2), 0, 6.1, -0.4);
  return { root, shell, plaza, doorL, doorR, flicker, beacon, door: new THREE.Vector3(0, 0, 1.5) };
}

// ─── Bridge ──────────────────────────────────────────────────────────────────

/** One 4 m deck section (planks + stringers + side rails), all in one wood texture. */
export function bridgeSegment(len: number, width: number, broken = false): THREE.Group {
  const g = new THREE.Group();
  const plank = tx('planks', 0x74583a, 1.3, 1);
  const dark = tx('planks', 0x4e3a26, 1.3, 1);
  Kit.add(g, Kit.box(width, 0.22, len - 0.04), plank, 0, -0.11, 0);
  for (const sx of [-1, 1]) {
    Kit.add(g, Kit.box(0.35, 0.55, len), dark, sx * (width / 2 - 0.6), -0.48, 0);
    Kit.add(g, Kit.box(0.3, 0.3, len), dark, sx * (width / 2 + 0.1), 0.02, 0);
    for (let i = 0; i < 2; i++) Kit.add(g, Kit.box(0.16, 1.15, 0.16), dark, sx * (width / 2 + 0.1), 0.6, -len / 2 + 0.3 + i * (len / 2));
    if (!broken || sx > 0) Kit.add(g, Kit.box(0.14, 0.16, len), plank, sx * (width / 2 + 0.1), 1.15, 0);
  }
  return g;
}

/** Trestle tower (posts + X bracing) from y = -h up to 0. */
export function trestle(h: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const wood = tx('bark', 0x5a442e, 1.4, 0.9);
  const half = width / 2 - 0.4;
  for (const sx of [-1, 1]) for (const sz of [-0.9, 0.9]) Kit.add(g, Kit.box(0.4, h + 0.6, 0.4), wood, sx * half * (1 + 0.08), -h / 2 - 0.5, sz);
  const levels = Math.max(2, Math.round(h / 4));
  for (let i = 0; i < levels; i++) {
    const y0 = -h + (i * h) / levels;
    const y1 = -h + ((i + 1) * h) / levels;
    for (const sz of [-0.9, 0.9]) {
      beam(g, new THREE.Vector3(-half, y0, sz), new THREE.Vector3(half, y1 - 0.6, sz), 0.1, wood, 4);
      beam(g, new THREE.Vector3(half, y0, sz), new THREE.Vector3(-half, y1 - 0.6, sz), 0.1, wood, 4);
    }
    Kit.add(g, Kit.box(width, 0.25, 0.3), wood, 0, y1 - 0.6, 0.9);
    Kit.add(g, Kit.box(width, 0.25, 0.3), wood, 0, y1 - 0.6, -0.9);
  }
  return g;
}

// ─── Helipad + helicopter ────────────────────────────────────────────────────

export interface HelipadParts {
  root: THREE.Group;
  /** Two alternating sets of edge lights (blink). */
  edgeA: THREE.Group;
  edgeB: THREE.Group;
}

export function helipad(half: number): HelipadParts {
  const root = new THREE.Group();
  // Pad, paint and stripes share one concrete projection: the paint is worn into the slab.
  const conc = tx('concrete', 0x6e6e6a, 0.8, 1);
  Kit.add(root, Kit.box(half * 2, 0.3, half * 2), conc, 0, 0.15 - 0.02, 0);
  const yellow = tx('concrete', 0xd8b028, 0.8, 0.7, { emissive: 0x2a2008, emissiveIntensity: 1 });
  const white = tx('concrete', 0xe8e8e0, 0.8, 0.7, { emissive: 0x262624, emissiveIntensity: 1 });
  ringOfBoxes(root, half * 0.62, 0.5, 40, yellow, 0.31);
  // Big H (along the rail: the bar crosses the road direction).
  Kit.add(root, Kit.box(1.1, 0.04, 7), white, -2.4, 0.31, 0);
  Kit.add(root, Kit.box(1.1, 0.04, 7), white, 2.4, 0.31, 0);
  Kit.add(root, Kit.box(3.8, 0.04, 1.0), white, 0, 0.31, 0);
  // Hazard border.
  for (const s of [-1, 1]) {
    Kit.add(root, Kit.box(half * 2, 0.06, 0.5), tx('hazard', PAL.hazardY, 1.5, 1), 0, 0.3, s * (half - 0.25));
    Kit.add(root, Kit.box(0.5, 0.06, half * 2), tx('hazard', PAL.hazardY, 1.5, 1), s * (half - 0.25), 0.3, 0);
  }
  const edgeA = new THREE.Group();
  const edgeB = new THREE.Group();
  root.add(edgeA, edgeB);
  const ga = Kit.glow(0x60ff70, 1.8);
  const gb = Kit.glow(0xffc030, 1.8);
  const n = 10;
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const t = -half + (i * 2 * half) / n;
    for (const [x, z] of [[t, -half], [t, half], [-half, t], [half, t]] as const) {
      // Skip the road entrance (both ends of the pad along the rail are the road).
      if (Math.abs(x) < 4.2 && Math.abs(Math.abs(z) - half) < 0.01) continue;
      Kit.add(k++ % 2 ? edgeA : edgeB, Kit.box(0.28, 0.2, 0.28), k % 2 ? ga : gb, x, 0.4, z);
    }
  }
  // Windsock.
  const pole = tx('metal', 0x9a9a96, 3, 0.6);
  const ws = new THREE.Group();
  ws.position.set(half + 3, 0, -half + 3);
  root.add(ws);
  Kit.add(ws, Kit.cyl(0.08, 0.1, 6, 5), pole, 0, 3, 0);
  const sock = new THREE.Group();
  sock.position.set(0, 5.8, 0);
  ws.add(sock);
  for (let i = 0; i < 4; i++) {
    Kit.add(sock, Kit.cyl(0.42 - i * 0.07, 0.35 - i * 0.07, 0.6, 7), tx('cloth', i % 2 ? 0xe8e0d0 : 0xe05a1a, 1.5, 0.7, { side: THREE.DoubleSide }), 0.35 + i * 0.6, 0, 0, 0, 0, Math.PI / 2 + 0.25);
  }
  sway(ws, 0.4, 6);
  // Control hut.
  const hut = new THREE.Group();
  hut.position.set(-half - 5, 0, half - 6);
  root.add(hut);
  Kit.add(hut, Kit.box(4, 3, 3.2), tx('corrugated', 0x6e7470, 1.2, 1), 0, 1.5, 0);
  Kit.add(hut, Kit.box(4.4, 0.2, 3.6), tx('metal', 0x3a3c3e, 1.5, 0.8), 0, 3.05, 0);
  Kit.add(hut, Kit.box(1.6, 0.9, 0.08), Kit.glow(0xffd090, 0.9), 0.6, 1.8, 1.62);
  Kit.add(hut, Kit.box(0.9, 2, 0.08), tx('metal', 0x2e3032, 2, 0.7), -1.1, 1.0, 1.62);
  // Floodlight mast.
  const mast = new THREE.Group();
  mast.position.set(half + 2, 0, half - 2);
  root.add(mast);
  Kit.add(mast, Kit.cyl(0.14, 0.2, 9, 6), tx('metal', 0x4a4e52, 2.5, 0.7), 0, 4.5, 0);
  Kit.add(mast, Kit.box(1.8, 0.7, 0.4), tx('metal', 0x2e3032, 2.5, 0.7), 0, 9.1, 0);
  for (const sx of [-0.55, 0, 0.55]) Kit.add(mast, Kit.box(0.42, 0.42, 0.08), Kit.glow(0xf0f4ff, 1.4), sx, 9.1, -0.22);
  return { root, edgeA, edgeB };
}

export interface HeliParts {
  root: THREE.Group;
  body: THREE.Group;
  rotor: THREE.Group;
  tailRotor: THREE.Group;
  beacon: THREE.Mesh;
  strobe: THREE.Mesh;
}

/** Rescue helicopter facing +Z (nose), skids at y = 0. */
export function helicopter(): HeliParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const white = tx('metal', 0xccd0d4, 1.5, 0.7);
  const navy = tx('metal', 0x22304e, 1.5, 0.7);
  const orange = tx('metal', 0xe06a1a, 1.5, 0.7);
  const glass = clean(0x223858, { emissive: 0x0e1c30, emissiveIntensity: 1 });
  const dark = tx('metal', 0x24262a, 3, 0.6);
  // Cabin + nose.
  Kit.add(body, Kit.box(2.3, 1.9, 3.6), white, 0, 1.85, 0);
  Kit.add(body, Kit.box(2.32, 0.7, 3.62), navy, 0, 1.15, 0);
  Kit.add(body, Kit.sphere(1.25, 10, 8), white, 0, 1.75, 1.75, 0, 0, 0, 0.92, 0.78, 1.2);
  Kit.add(body, Kit.sphere(1.18, 10, 8), glass, 0, 2.0, 2.05, 0, 0, 0, 0.86, 0.6, 1.0);
  Kit.add(body, Kit.box(2.34, 0.16, 3.64), orange, 0, 1.55, 0);
  // Engine housing + tail boom + fins.
  Kit.add(body, Kit.box(1.5, 0.7, 2.6), white, 0, 3.1, -0.6);
  Kit.add(body, Kit.cyl(0.32, 0.6, 5.6, 8), white, 0, 2.3, -4.4, Math.PI / 2, 0, 0);
  Kit.add(body, Kit.box(0.12, 1.6, 1.1), navy, 0, 3.0, -7.0, -0.3, 0, 0);
  Kit.add(body, Kit.box(1.8, 0.1, 0.6), navy, 0, 2.3, -6.3);
  // Open side door: dark interior with a warm cabin light.
  Kit.add(body, Kit.box(0.05, 1.4, 1.5), clean(0x14161c), 1.16, 1.85, -0.3);
  Kit.add(body, Kit.box(0.04, 0.3, 0.9), Kit.glow(0xffc880, 0.8), 1.1, 2.4, -0.3);
  // Skids.
  for (const sx of [-1, 1]) {
    Kit.add(body, Kit.cyl(0.07, 0.07, 4.4, 6), dark, sx * 1.15, 0.12, 0.2, Math.PI / 2, 0, 0);
    for (const sz of [-1.0, 1.2]) Kit.add(body, Kit.box(0.08, 0.9, 0.08), dark, sx * 1.05, 0.55, sz, 0, 0, sx * 0.25);
  }
  // Nav lights.
  Kit.add(body, Kit.box(0.14, 0.14, 0.14), Kit.glow(0xff2020, 2), -1.2, 1.6, 1.0);
  Kit.add(body, Kit.box(0.14, 0.14, 0.14), Kit.glow(0x20ff40, 2), 1.2, 1.6, 1.0);
  const beacon = Kit.add(root, Kit.box(0.22, 0.18, 0.22), Kit.glow(0xff2a10, 2.4), 0, 3.55, -1.4);
  beacon.userData.noMerge = true;
  const strobe = Kit.add(root, Kit.box(0.16, 0.16, 0.16), Kit.glow(0xffffff, 3), 0, 3.85, -7.5);
  strobe.userData.noMerge = true;
  // Main rotor.
  const rotor = new THREE.Group();
  rotor.position.set(0, 3.75, -0.4);
  root.add(rotor);
  Kit.add(rotor, Kit.cyl(0.18, 0.22, 0.4, 8), dark, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const p = Kit.pivot(rotor, 0, 0.12, 0);
    p.rotation.y = (i / 4) * Math.PI * 2;
    Kit.add(p, Kit.box(5.4, 0.05, 0.36), dark, 2.85, 0, 0, 0.06, 0, 0);
  }
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.15, 3.0, -7.25);
  root.add(tailRotor);
  for (let i = 0; i < 2; i++) Kit.add(tailRotor, Kit.box(0.04, 1.4, 0.16), dark, 0, 0, 0, i * (Math.PI / 2), 0, 0);
  return { root, body, rotor, tailRotor, beacon, strobe };
}

/** Fuel tank on a trailer (model for the finale Destructible). Faces +Z. */
export function fuelTank(): { root: THREE.Group; warn: THREE.Mesh } {
  const g = new THREE.Group();
  // Deep red with strong seams / rust so the big tank never bands into a flat blob.
  const red = tx('metal', 0x9e2a1e, 1.2, 0.9);
  const white = tx('metal', 0xd8d4c8, 1.2, 0.8);
  const dark = tx('metal', 0x2e3032, 2, 0.7);
  Kit.add(g, Kit.box(1.8, 0.25, 5.2), dark, 0, 0.75, 0);
  for (const sx of [-1, 1]) for (const sz of [-1.6, -0.6]) Kit.add(g, Kit.cyl(0.42, 0.42, 0.3, 10), tx('asphalt', PAL.tire, 3, 0.8), sx * 0.92, 0.42, sz, 0, 0, Math.PI / 2);
  Kit.add(g, Kit.box(0.2, 0.2, 1.6), dark, 0, 0.6, 3.1);
  Kit.add(g, Kit.cyl(1.15, 1.15, 4.8, 12), red, 0, 2.05, 0, Math.PI / 2, 0, 0);
  for (const z of [-2.42, 2.42]) Kit.add(g, Kit.cyl(1.0, 1.0, 0.12, 12), red, 0, 2.05, z, Math.PI / 2, 0, 0);
  Kit.add(g, Kit.cyl(1.17, 1.17, 0.5, 12), white, 0, 2.05, 0.6, Math.PI / 2, 0, 0);
  Kit.add(g, Kit.cyl(1.17, 1.17, 0.2, 12), white, 0, 2.05, -1.5, Math.PI / 2, 0, 0);
  Kit.add(g, Kit.box(1.2, 0.2, 0.7), dark, 0, 3.2, -0.4);
  Kit.add(g, Kit.cyl(0.12, 0.12, 0.5, 6), dark, 0.5, 3.3, 1.2);
  for (const sx of [-1, 1]) Kit.add(g, Kit.box(0.05, 0.9, 1.3), tx('hazard', PAL.hazardY, 2, 1), sx * 1.13, 2.05, -0.5);
  const warn = Kit.add(g, Kit.box(0.3, 0.2, 0.3), Kit.glow(PAL.amber, 2.2), 0, 3.35, 0.4);
  warn.userData.noMerge = true;
  return { root: g, warn };
}

/** Three-toed giant footprint decal (dark muddy water) on the XZ plane, toes toward +Z. */
export function footprint(parent: THREE.Object3D, mat: THREE.Material, x: number, z: number, yaw: number, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0.03, z);
  g.rotation.y = yaw;
  g.scale.setScalar(s);
  parent.add(g);
  Kit.add(g, Kit.cyl(0.55, 0.65, 0.02, 7), mat, 0, 0, 0, 0, 0, 0, 1, 1, 1.15);
  for (const a of [-0.45, 0, 0.45]) {
    const toe = Kit.add(g, Kit.box(0.32, 0.02, 1.1), mat, Math.sin(a) * 0.8, 0, 0.75 + Math.cos(a) * 0.15);
    toe.rotation.y = a;
  }
}
