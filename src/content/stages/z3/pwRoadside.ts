import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { tintFor, type PwBatch } from '../../pixelworld/batch';
import { hash2 } from '../../pixelworld/surfaces';
import {
  JERSEY_ROWS, JERSEY_SIDE, z3CobraHead, z3CrossarmModule, z3FootingTile, z3JerseySide, z3JerseyTop, z3RailPost, z3SteelPoleTile, z3TransformerTile, z3WBeamTile,
  z3WoodPoleTile,
} from '../../pixelworld/z3roadside';
import { box, card, cylinder, profileStrip } from './pwShapes';

/**
 * HIGHWAY TO HELL roadside furniture in ART: PIXEL WORLD: jersey barriers as
 * real sloped New Jersey profiles (foot, lower slope, upper face, top) with a
 * painted module per segment; the W-beam guard rail as its corrugated
 * profile; galvanised light poles with cobra-head lamps; wooden utility poles
 * with their crossarms, insulators and the odd transformer can.
 */

/** Jersey profile (half-widths, heights): foot, slope break, top. */
const J = { foot: 0.4, footH: 0.08, brk: 0.27, brkH: 0.3, top: 0.15, topH: 0.92 };

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();

export class Z3Roadside {
  readonly t;

  constructor(readonly atlas: PwAtlas) {
    const a = atlas;
    this.t = {
      jersey: [0, 1, 2, 3].map((v) => z3JerseySide(a, v)),
      jerseyHit: z3JerseySide(a, 4),
      jerseyTop: z3JerseyTop(a),
      armyJersey: [z3JerseySide(a, 0, 0xb8b4a8), z3JerseySide(a, 3, 0xb8b4a8)],
      armyTop: z3JerseyTop(a, 0xb8b4a8),
      wbeam: z3WBeamTile(a),
      post: [z3RailPost(a, false), z3RailPost(a, true)],
      steel: z3SteelPoleTile(a),
      cobra: [z3CobraHead(a, false), z3CobraHead(a, true)],
      footing: z3FootingTile(a),
      wood: z3WoodPoleTile(a),
      crossarm: z3CrossarmModule(a),
      transformer: z3TransformerTile(a),
    };
  }

  /** A jersey segment (`seg` group: length along local z). */
  jersey(b: PwBatch, seg: THREE.Object3D, rec: { len: number; color: number }) {
    seg.updateMatrixWorld(true);
    b.setMatrix(seg.matrixWorld);
    const p = seg.getWorldPosition(_v);
    const h = hash2(Math.round(p.x * 7), Math.round(p.z * 7), 3);
    const army = rec.color === 0xb8b4a8;
    const hit = rec.color !== 0x9a948c && !army;
    const side = army ? this.t.armyJersey[h > 0.5 ? 1 : 0] : hit ? this.t.jerseyHit : this.t.jersey[Math.floor(h * 4) % 4];
    const top = army ? this.t.armyTop : this.t.jerseyTop;
    const L = rec.len;
    const uLen = Math.min(JERSEY_SIDE.w, (L * JERSEY_SIDE.w) / 4);
    const H = JERSEY_SIDE.h;
    const rows = [
      [J.foot, 0, J.foot, J.footH, 0, JERSEY_ROWS.foot],
      [J.foot, J.footH, J.brk, J.brkH, JERSEY_ROWS.foot, JERSEY_ROWS.foot + JERSEY_ROWS.slope],
      [J.brk, J.brkH, J.top, J.topH, JERSEY_ROWS.foot + JERSEY_ROWS.slope, H],
    ] as const;
    for (const s of [1, -1]) {
      // The far side reads as another segment (offset into the module).
      for (const [x0, y0, x1, y1, vA, vB] of rows) profileStrip(b, s, x0, y0, x1, y1, L, side, s > 0 ? 0 : JERSEY_SIDE.w - uLen, uLen, vA, vB);
    }
    // Top strip.
    b.quad(new THREE.Vector3(-J.top, J.topH, L / 2), new THREE.Vector3(J.top, J.topH, L / 2), new THREE.Vector3(J.top, J.topH, -L / 2), new THREE.Vector3(-J.top, J.topH, -L / 2), top, [0, 0, 0, 16, uLen, 16, uLen, 0]);
    b.setMatrix(null);
  }

  /** A guard-rail beam segment (the classic 0.08 × 0.3 × 4 box): its W profile on the road side. */
  rail(b: PwBatch, m: THREE.Mesh, side: number) {
    m.updateMatrixWorld(true);
    b.setMatrix(m.matrixWorld);
    const g = (m.geometry as THREE.BoxGeometry).parameters;
    const L = g.depth;
    const H = g.height;
    // Road side is −x for the right rail (side +1), +x for the far-left one.
    const s = -side;
    const pr: [number, number][] = [
      [0, -H / 2],
      [0.05, -H / 2 + H * 0.2],
      [0, 0],
      [0.05, H / 2 - H * 0.2],
      [0, H / 2],
    ];
    const t = this.t.wbeam;
    const p = m.getWorldPosition(_v);
    const u0 = Math.floor(hash2(Math.round(p.x), Math.round(p.z), 5) * 4) * 32;
    for (let i = 0; i < pr.length - 1; i++) {
      const [d0, y0] = pr[i];
      const [d1, y1] = pr[i + 1];
      const vA = 1 + (14 * (y0 + H / 2)) / H;
      const vB = 1 + (14 * (y1 + H / 2)) / H;
      profileStrip(b, s, 0.04 + d0, y0, 0.04 + d1, y1, L, t, u0, 128, vA, vB);
    }
    // Back face and the top lip.
    profileStrip(b, -s, 0.04, -H / 2, 0.04, H / 2, L, t, u0, 128, 1, 15);
    b.setMatrix(null);
  }

  /** A guard-rail post (classic 0.12 × 0.75 × 0.12 box). */
  post(b: PwBatch, m: THREE.Mesh) {
    m.updateMatrixWorld(true);
    b.setMatrix(m.matrixWorld);
    const g = (m.geometry as THREE.BoxGeometry).parameters;
    const p = m.getWorldPosition(_v);
    const t = this.t.post[hash2(Math.round(p.x), Math.round(p.z), 9) > 0.7 ? 1 : 0];
    box(b, 0, 0, 0, g.width, g.height, g.depth, { px: t, nx: t, pz: this.t.post[0], nz: this.t.post[0], py: this.t.post[0] });
    b.setMatrix(null);
  }

  /** A highway light pole (`lightPole()` group: pole along y, arms along local z). */
  lightPole(b: PwBatch, g: THREE.Object3D, rec: { two: boolean; lit: boolean }) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const t = this.t;
    cylinder(b, new THREE.Vector3(0, 0.45, 0), new THREE.Vector3(0, 10.05, 0), 0.16, 0.1, 6, t.steel);
    box(b, 0, 0.25, 0, 0.5, 0.5, 0.5, { px: t.footing, nx: t.footing, pz: t.footing, nz: t.footing, py: t.footing });
    const cobra = t.cobra[rec.lit ? 1 : 0];
    for (const s of rec.two ? [-1, 1] : [1]) {
      cylinder(b, new THREE.Vector3(0, 9.72, 0), new THREE.Vector3(0, 10.08, s * 2.2), 0.05, 0.045, 4, t.steel);
      // Cobra head: the side module on both long sides, lens strip underneath.
      _m.makeTranslation(0, 10.0, s * 2.65);
      if (s < 0) _m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      const prev = b.matrix.clone();
      b.setMatrix(prev.clone().multiply(_m));
      // (Module length 32 texels = 1 m: drawn 0.95 m along +z from the arm, 0.36 m tall.)
      box(b, 0, 0, 0, 0.36, 0.34, 0.95, { px: cobra, nx: cobra, py: t.steel, ny: cobra }, { px: { flipU: true }, ny: { sub: { x: 8, y: 1, w: 22, h: 2 } } });
      b.setMatrix(prev);
    }
    b.setMatrix(null);
  }

  /** A wooden utility pole (`p` group: pole leaning about z, crossarm along local x). */
  utilityPole(b: PwBatch, g: THREE.Object3D, rec: { lean: number }) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const t = this.t;
    const lean = rec.lean;
    const up = new THREE.Vector3(-Math.sin(lean), Math.cos(lean), 0);
    const p = g.getWorldPosition(_v);
    const hv = hash2(Math.round(p.x), Math.round(p.z), 11);
    cylinder(b, new THREE.Vector3(0, 0, 0), up.clone().multiplyScalar(11), 0.17, 0.13, 6, t.wood, { v0: Math.floor(hv * 128) });
    // Crossarm (box) + the insulators card over it.
    const c = up.clone().multiplyScalar(10.3);
    const prev = b.matrix.clone();
    b.setMatrix(prev.clone().multiply(_m.makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationZ(lean))));
    box(b, 0, 0, 0, 2.6, 0.16, 0.16, { pz: t.crossarm, nz: t.crossarm, py: t.wood, ny: t.wood }, { pz: { sub: { x: 0, y: 0, w: 96, h: 6 } }, nz: { sub: { x: 0, y: 0, w: 96, h: 6 }, flipU: true } });
    card(b, _u.set(0, 0.32, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 2.6, 0.48, t.crossarm, { sub: { x: 0, y: 6, w: 96, h: 14 } });
    b.setMatrix(prev);
    if (hv > 0.62) {
      // A transformer can strapped below the arm.
      const tc = up.clone().multiplyScalar(8.9).add(new THREE.Vector3(0, 0, 0.32));
      cylinder(b, tc.clone().addScaledVector(up, -0.45), tc.clone().addScaledVector(up, 0.45), 0.28, 0.28, 8, t.transformer, { capB: t.footing });
    }
    b.setMatrix(null);
  }

  /** Tint helper for neutral tiles. */
  static tint(tile: PwTile, hex: number) {
    return tintFor(tile, hex);
  }
}
