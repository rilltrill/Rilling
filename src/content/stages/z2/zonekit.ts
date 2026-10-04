import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { Rng } from '../../../core/Rng';
import { C, G, M, MB } from './mats';
import { box, ceilingPanel, grp } from './props';
import type { WallStyle } from './shell';
import type { Z2Scene } from './scene';
import { pixelText } from './font';
import { bakeInto } from './bake';

/** Build context shared by the zone builders. */
export interface ZoneCtx {
  rng: Rng;
  sc: Z2Scene;
  /** Parent for dynamic (non-baked) objects. */
  dyn: THREE.Group;
  /** Invisible proxy boxes that stop bullets. */
  occluders: THREE.Object3D[];
}

export const styles = {
  clinic: (): WallStyle => ({
    low: M(C.wallLow, 'tiles', 1, 0.55),
    high: M(C.wallHigh, 'stucco', 1, 0.45),
    lowH: 1.3,
    rail: M(C.wallRail),
    base: M(0x232826),
    trim: M(C.doorFrame),
  }),
  ward: (): WallStyle => ({
    low: M(0x35625a, 'tiles', 1, 0.5),
    high: M(0x8a9a8e, 'stucco', 1, 0.4),
    lowH: 1.1,
    rail: M(0xb9a07a),
    base: M(0x232826),
    trim: M(C.doorFrame),
  }),
  concrete: (): WallStyle => ({
    low: M(0x3d4a44, 'concrete', 1.5, 0.7),
    high: M(C.concrete, 'concrete', 1, 0.8),
    lowH: 1.2,
    base: M(0x1e2220),
    trim: M(0x5a5e58),
  }),
  morgue: (): WallStyle => ({
    low: M(C.tileLow, 'tiles', 1.2, 0.8),
    high: M(C.tileWhite, 'tiles', 1.2, 0.7),
    lowH: 1.5,
    base: M(0x2a3436),
    trim: M(C.steel),
  }),
  or: (): WallStyle => ({
    low: M(0x2f6252, 'tiles', 1.2, 0.7),
    high: M(C.orGreen, 'tiles', 1.2, 0.6),
    lowH: 1.6,
    base: M(0x1e2a26),
    trim: M(C.steel),
  }),
  atrium: (): WallStyle => ({
    low: M(C.marbleDark, 'concrete', 2, 0.5),
    high: M(0x8a8a80, 'stucco', 1, 0.4),
    lowH: 2.2,
    base: M(0x1e1e1c),
    trim: M(0x6a6a62),
  }),
  facade: (): WallStyle => ({
    low: M(0x3a3c3e, 'concrete', 2, 0.6),
    high: M(0x8a8478, 'concrete', 1, 0.8),
    lowH: 1.0,
    trim: M(0x4a4e52),
  }),
};

export const floorMat = () => M(C.floor, 'checker', 0.55, 0.28);
export const ceilMat = () => M(C.ceiling, 'tiles', 0.5, 0.85);

/** Static (baked) ceiling panel. */
export function panel(g: THREE.Object3D, x: number, y: number, z: number, ry = 0, on = true, warm = false) {
  ceilingPanel(g, x, y, z, ry, on, warm);
}

/**
 * Flickering ceiling panel: frame baked into `g`, diffuser added to the dynamic
 * group and registered with the scene.
 */
export function flickerPanel(ctx: ZoneCtx, g: THREE.Object3D, x: number, y: number, z: number, ry: number, mode: 'buzz' | 'blink' | 'dying', warm = false) {
  const s = grp(g, x, y, z, ry);
  box(s, 0.66, 0.05, 1.26, M(0xb8bcb4), 0, -0.02, 0);
  const on = G(warm ? C.panelWarm : C.panel, 1.15);
  const off = M(0x3a403c);
  const m = new THREE.Mesh(Kit.box(0.58, 0.03, 1.18), on);
  m.position.set(x, y - 0.05, z);
  m.rotation.y = ry;
  ctx.dyn.add(m);
  ctx.sc.flickers.push({ mesh: m, on, off, seed: ctx.rng.range(0, 50), mode, pos: new THREE.Vector3(x, y - 0.3, z), lit: true });
}

/** A ceiling panel hanging by one corner from its wires, swinging and sparking. */
export function danglingPanel(ctx: ZoneCtx, g: THREE.Object3D, x: number, y: number, z: number, ry: number) {
  // Hole in the ceiling.
  box(g, 0.7, 0.02, 1.3, M(0x0c0e0e), x, y - 0.005, z, ry);
  const pivot = new THREE.Group();
  pivot.position.set(x, y - 0.02, z);
  pivot.rotation.y = ry;
  ctx.dyn.add(pivot);
  const hang = new THREE.Group();
  pivot.add(hang);
  hang.rotation.x = 1.15;
  bakeInto(hang, (h) => {
    box(h, 0.66, 0.05, 1.26, M(0xb8bcb4), 0, -0.02, 0.63);
    box(h, 0.01, 0.5, 0.01, M(0x1a1a1a), 0.25, -0.25, 0.0);
    box(h, 0.01, 0.4, 0.01, M(0x1a1a1a), -0.25, -0.2, 0.0);
  });
  const on = G(C.panel, 1.15);
  const off = M(0x3a403c);
  const diff = new THREE.Mesh(Kit.box(0.58, 0.03, 1.18), on);
  diff.position.set(0, -0.05, 0.63);
  hang.add(diff);
  ctx.sc.swingers.push({ obj: hang, amp: 0.12, rate: 1.3 + ctx.rng.next() * 0.5, phase: ctx.rng.next() * 6 });
  ctx.sc.flickers.push({ mesh: diff, on, off, seed: ctx.rng.range(0, 50), mode: 'blink', pos: new THREE.Vector3(x, y - 0.8, z), lit: true });
}

/** Ceiling vent: static dark hole + dynamic grate (falls out when a crawler drops through). */
export function vent(ctx: ZoneCtx, g: THREE.Object3D, x: number, y: number, z: number, floor: number) {
  box(g, 0.74, 0.02, 0.74, M(0x08090a), x, y - 0.004, z);
  box(g, 0.82, 0.03, 0.06, M(0x8a908c), x, y - 0.015, z - 0.4);
  box(g, 0.82, 0.03, 0.06, M(0x8a908c), x, y - 0.015, z + 0.4);
  const grate = new THREE.Mesh(Kit.box(0.7, 0.03, 0.7), M(0x9aa09c, 'grate', 1.5, 0.9));
  grate.position.set(x, y - 0.03, z);
  ctx.dyn.add(grate);
  ctx.sc.vents.push({ grate, pos: new THREE.Vector3(x, y, z), floor, vy: 0, spin: 0, dropped: false, landed: false });
}

/**
 * Dark side room seen through a doorway: a back-faced box (interior visible
 * from outside through the opening) with a little set dressing.
 */
export function sideRoom(g: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, y: number, h: number, color = 0x1a2220, extras?: (s: THREE.Object3D) => void) {
  const w = x1 - x0;
  const d = z1 - z0;
  box(g, w, h, d, MB(color, 'stucco', 1, 0.5), (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
  if (extras) extras(g);
}

/** Glowing sign with backing plate; front faces +Z of the sub-group. */
export function sign(g: THREE.Object3D, text: string, x: number, y: number, z: number, ry: number, px: number, color: number, plate: number | null = 0x14181a, intensity = 1.3, broken?: number[]) {
  const s = grp(g, x, y, z, ry);
  const w = (text.length * 6 - 1) * px;
  if (plate !== null) box(s, w + px * 4, px * 11, 0.04, M(plate), 0, 0, -0.02);
  pixelText(s, text, 0, 0, px * 0.3, 0, { px, mat: G(color, intensity), depth: px * 0.5, broken, brokenMat: M(0x2a1a1a) });
  return s;
}

/** Flat painted sign (unlit text on a light plate). */
export function plateSign(g: THREE.Object3D, text: string, x: number, y: number, z: number, ry: number, px: number, ink: number, plate: number) {
  const s = grp(g, x, y, z, ry);
  const w = (text.length * 6 - 1) * px;
  box(s, w + px * 4, px * 11, 0.03, M(plate), 0, 0, -0.015);
  pixelText(s, text, 0, 0, 0.004, 0, { px, mat: M(ink), depth: 0.01 });
  return s;
}

/** Invisible box that stops bullets. */
export function occluder(ctx: ZoneCtx, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0) {
  const m = new THREE.Mesh(Kit.box(w, h, d), Kit.mat(0xff00ff));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.visible = false;
  m.updateMatrixWorld(true);
  ctx.dyn.add(m);
  ctx.occluders.push(m);
}
