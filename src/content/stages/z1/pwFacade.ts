import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { WINDOW_M, windowModule, type WindowKind, type WindowStyle } from '../../pixelworld/facade';
import { hash2 } from '../../pixelworld/surfaces';
import {
  z1Aerial, z1Billboard, z1ChimneyPots, z1Coping, z1FeFloor, z1FeLadder, z1FeRail, z1FeStair, z1GhostSign, z1Pediment, z1StringCourse, z1Vent, type PedimentKind,
} from '../../pixelworld/z1facade';
import { FLOOR_H, GROUND_H, type FacadeRecord } from './props';

/**
 * MAIN STREET facade extras in ART: PIXEL WORLD (z1/pixel.ts `facade()` calls
 * these in the building's own frame: facade plane z = 0 facing +Z, x along it,
 * the body back to z = −d):
 *  - stone string courses between the upper floors;
 *  - a parapet over the cornice (the wall carried up, stone coping) with a
 *    cut-out crown (stepped gable / arch / panel / balustrade with a datestone),
 *    so rooflines seen down the street are jagged;
 *  - roof clutter as crossed cut-out planes (aerials, vent cowls, chimney pots);
 *  - side walls dressed like fronts: damp foot, windows per floor, a faded
 *    ghost sign on the tall ones (the intersections show these walls big);
 *  - fire escapes as cut-out ironwork; rooftop billboards painted.
 */

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const NY = new THREE.Vector3(0, -1, 0);
const _o = new THREE.Vector3();

const PEDIMENTS: { kind: PedimentKind; text: string }[] = [
  { kind: 'stepped', text: '1912' },
  { kind: 'arch', text: '1898' },
  { kind: 'panel', text: '1924' },
  { kind: 'balustrade', text: '' },
];

export interface WallSet {
  base: PwTile;
  foot: PwTile;
  head: PwTile;
  tintRGB: readonly number[] | undefined;
}

export class Z1FacadeExtras {
  private aerial: PwTile;
  private vent: PwTile;
  private pots: PwTile;
  constructor(private atlas: PwAtlas) {
    this.aerial = z1Aerial(atlas);
    this.vent = z1Vent(atlas);
    this.pots = z1ChimneyPots(atlas);
  }

  /** Stone string courses between the upper floors (under each upper window row but the first). */
  courses(b: PwBatch, rec: FacadeRecord, stone: number) {
    const t = z1StringCourse(this.atlas, stone);
    const floors = rec.spec.floors;
    for (let f = 1; f < floors - 1; f++) {
      const y = GROUND_H + f * FLOOR_H - 0.33;
      b.rect(_o.set(-rec.w / 2, y, 0.012), X, Y, rec.w, 0.25, t, { u0: 0, v0: 0 });
    }
  }

  /**
   * Parapet + crown over the cornice: the wall carried up 0.55 m with a coping,
   * a cut-out crown centred on the facade, and roof clutter behind.
   */
  crown(b: PwBatch, rec: FacadeRecord, index: number, wall: WallSet, stone: number, wallKind: 'brick' | 'plaster') {
    const { w, h, d } = rec;
    const a = this.atlas;
    const pH = 0.55;
    // Parapet wall + coping (the cornice box below projects in front of its foot).
    b.rect(_o.set(-w / 2 - 0.12, h, 0.12), X, Y, w + 0.24, pH, wall.base, { u0: 0, v0: (h - pH) * PW_TPM, tintRGB: wall.tintRGB });
    b.rect(_o.set(-w / 2 - 0.12, h + pH, 0.12), X, Y, w + 0.24, 0.25, z1Coping(a, stone), { u0: 0, v0: 0 });
    // Its back and ends (seen from along the street).
    b.rect(_o.set(w / 2 + 0.12, h, -0.1), NX, Y, w + 0.24, pH + 0.2, wall.base, { u0: 0, v0: 0, tintRGB: wall.tintRGB });
    b.rect(_o.set(w / 2 + 0.12, h, 0.12), NZ, Y, 0.22, pH + 0.2, wall.base, { u0: 0, v0: 0, tintRGB: wall.tintRGB });
    b.rect(_o.set(-w / 2 - 0.12, h, -0.1), Z, Y, 0.22, pH + 0.2, wall.base, { u0: 0, v0: 0, tintRGB: wall.tintRGB });
    // The crown (most buildings; tinted with the wall).
    const pick = hash2(index, 31, 7);
    if (pick < 0.85) {
      const p = PEDIMENTS[Math.floor(hash2(index, 32, 7) * PEDIMENTS.length)];
      // (One coping stone per wall kind: a handful of crowns for the whole stage.)
      const t = z1Pediment(a, p.kind, p.text, { wall: wallKind, stone: wallKind === 'brick' ? 0x86827a : 0x6a6a70 });
      t.neutral = wallKind === 'brick' ? 0xd8a890 : 0xd8d8d8;
      const tint = wall.tintRGB ? tintRGB(t, wall) : undefined;
      const cw = t.w / PW_TPM;
      const ch = t.h / PW_TPM;
      const cx = (hash2(index, 33, 7) - 0.5) * Math.max(0, w - cw - 2) * 0.5;
      b.rect(_o.set(cx - cw / 2, h + pH - 0.1, 0.13), X, Y, cw, ch, t, { tintRGB: tint });
      // Its back face (the crown seen from behind along the street: plain wall).
      b.rect(_o.set(cx + cw / 2, h + pH - 0.1, 0.11), NX, Y, cw, ch, t, { tintRGB: tint, flipU: true });
    }
    // Roof clutter: an aerial and / or a vent cowl, crossed planes standing on the roof.
    const n = hash2(index, 34, 7);
    if (n > 0.35) this.crossed(b, this.aerial, (hash2(index, 35, 7) - 0.5) * (w - 3), h, -1.5 - hash2(index, 36, 7) * (d - 4));
    if (n < 0.6) this.crossed(b, this.vent, (hash2(index, 37, 7) - 0.5) * (w - 2), h, -1 - hash2(index, 38, 7) * 3);
  }

  /** Chimney pots on a classic chimney stack (the stack itself is re-painted brick). */
  chimneyPots(b: PwBatch, m: THREE.Mesh) {
    const p = (m.geometry as THREE.BoxGeometry).parameters;
    const c = m.position;
    this.crossed(b, this.pots, c.x, c.y + p.height / 2 - 0.05, c.z);
  }

  /** A cut-out sprite as two crossed planes (each two-faced) standing at (x, y, z). */
  crossed(b: PwBatch, t: PwTile, x: number, y: number, z: number) {
    const w = t.w / PW_TPM;
    const h = t.h / PW_TPM;
    b.rect(_o.set(x - w / 2, y, z), X, Y, w, h, t);
    b.rect(_o.set(x + w / 2, y, z), NX, Y, w, h, t, { flipU: true });
    b.rect(_o.set(x, y, z + w / 2), NZ, Y, w, h, t);
    b.rect(_o.set(x, y, z - w / 2), Z, Y, w, h, t, { flipU: true });
  }

  /**
   * Side walls (and the back): damp foot / head bands like the front, a window
   * per bay on every upper floor, a faded ghost sign high on the tall ones.
   */
  sides(b: PwBatch, rec: FacadeRecord, index: number, wall: WallSet, style: WindowStyle) {
    const { w, h, d } = rec;
    const a = this.atlas;
    const footH = 1.25;
    const headH = 1.0;
    const bodyH = Math.max(0, h - footH - headH);
    const vTop = h * PW_TPM;
    const shift = Math.round((Math.ceil(vTop / wall.head.h) * wall.head.h - vTop) / 8) * 8;
    const o = { tintRGB: wall.tintRGB };
    for (const side of [1, -1]) {
      // Right side (+x) runs from the front (z 0) back; left side (−x) from the back to the front.
      const ux = side > 0 ? NZ : Z;
      const ox = side * (w / 2);
      const oz = side > 0 ? 0 : -d;
      b.rect(_o.set(ox, 0, oz), ux, Y, d, footH, wall.foot, { ...o, u0: 0, v0: 0 });
      b.rect(_o.set(ox, footH, oz), ux, Y, d, bodyH, wall.base, { ...o, u0: 0, v0: footH * PW_TPM });
      b.rect(_o.set(ox, footH + bodyH, oz), ux, Y, d, headH, wall.head, { ...o, u0: 0, v0: (h - headH) * PW_TPM + shift });
      // Ghost sign high on a tall, deep wall.
      const ghost = rec.spec.floors >= 3 && d >= 12 && hash2(index, side, 41) > 0.4;
      const gw = 6;
      const gh = 3;
      const gy = h - 1.2 - gh;
      if (ghost) {
        const t = z1GhostSign(a, Math.floor(hash2(index, side, 42) * 3));
        const along = 1.5 + hash2(index, side, 43) * (d - gw - 3);
        const z0 = side > 0 ? -along : -along - gw;
        b.rect(_o.set(ox + side * 0.012, gy, side > 0 ? z0 : z0), ux, Y, gw, gh, t);
      }
      // Windows: one per ~3.4 m bay on each upper floor (skipping the ghost sign), a few lit.
      const bays = Math.max(1, Math.floor((d - 1.5) / 3.4));
      for (let f = 1; f < rec.spec.floors; f++) {
        const wy = GROUND_H + 0.35 + (f - 1) * FLOOR_H + 1.15;
        const y0 = wy - WINDOW_M.openY;
        if (ghost && y0 + WINDOW_M.h > gy - 0.1) continue;
        for (let i = 0; i < bays; i++) {
          const along = 1.4 + (i + 0.5) * ((d - 2.8) / bays);
          const r = hash2(index * 7 + side, f * 13 + i, 44);
          const kind: WindowKind = r < 0.12 ? 'dim' : r < 0.18 ? 'warm' : r < 0.3 ? 'boarded' : r < 0.36 ? 'broken' : 'dark';
          const t = windowModule(a, kind, style, (i + f) % 2);
          // Module centred at `along` metres back from the front corner.
          const zc = -along;
          const zs = side > 0 ? zc + WINDOW_M.w / 2 : zc - WINDOW_M.w / 2;
          b.rect(_o.set(ox + side * 0.015, y0, zs), ux, Y, WINDOW_M.w, WINDOW_M.h, t);
        }
      }
    }
    // Back wall (rarely seen): plain.
    b.rect(_o.set(w / 2, 0, -d), NX, Y, w, h, wall.base, { ...o, u0: 0, v0: 0 });
  }

  /** A fire escape as cut-out ironwork at facade x `fx` (replaces the classic bar stacks). */
  fireEscape(b: PwBatch, floors: number, fx: number, out = 1.1) {
    const a = this.atlas;
    const hex = 0x34363d;
    const rail = z1FeRail(a, hex);
    const floor = z1FeFloor(a, hex);
    const stair = z1FeStair(a, hex);
    const ladder = z1FeLadder(a, hex);
    for (let f = 1; f < floors; f++) {
      const y = GROUND_H + (f - 1) * FLOOR_H + 0.2;
      // Front railing (the platform edge in its bottom rows), the two ends, the slatted floor from below.
      b.rect(_o.set(fx - 1.5, y - 0.1, out), X, Y, 3.0, 1.0, rail, { u0: 0, v0: 0 });
      b.rect(_o.set(fx + 1.5, y - 0.1, out), NZ, Y, out, 1.0, rail, { u0: 0, v0: 0 });
      b.rect(_o.set(fx - 1.5, y - 0.1, 0.02), Z, Y, out, 1.0, rail, { u0: 0, v0: 0 });
      b.rect(_o.set(fx - 1.5, y - 0.04, 0.02), X, Z, 3.0, out - 0.02, floor, { u0: 0, v0: 0 });
      b.rect(_o.set(fx - 1.5, y - 0.03, out), X, NZ, 3.0, out - 0.02, floor, { u0: 0, v0: 0 });
      void NY;
      if (f < floors - 1) b.rect(_o.set(fx - 0.9, y, out * 0.45), X, Y, stair.w / PW_TPM, stair.h / PW_TPM, stair);
    }
    // The drop ladder, pulled up under the first platform.
    const y0 = GROUND_H + 0.2;
    b.rect(_o.set(fx + 1.05, y0 - 2.1, out - 0.1), X, Y, 0.5, 2.1, ladder, { u0: 0, v0: 0 });
  }

  /** A rooftop billboard: the board's face painted with an advertisement (the paper blocks go). */
  billboard(b: PwBatch, board: THREE.Mesh) {
    const p = (board.geometry as THREE.BoxGeometry).parameters;
    const t = z1Billboard(this.atlas);
    board.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(board.parent!.matrix, board.matrix);
    b.withMatrix(new THREE.Matrix4().multiplyMatrices(b.matrix, m), () => {
      b.rect(_o.set(-p.width / 2, -p.height / 2, p.depth / 2 + 0.005), X, Y, p.width, p.height, t);
    });
  }
}

/** Linear tint turning a neutral tile into the wall's colour (the wall set already carries it). */
function tintRGB(_t: PwTile, wall: WallSet): readonly number[] | undefined {
  return wall.tintRGB;
}
