import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { tintFor, type PwBatch, type PwRectOpts } from '../../pixelworld/batch';
import { windowModule, WINDOW_M, shopfrontModule, SHOPFRONT_H_M, type WindowKind } from '../../pixelworld/facade';
import { hash2 } from '../../pixelworld/surfaces';
import { neonSign } from '../../pixelworld/signs';
import { picketFenceTile, railingTile } from '../../pixelworld/props';
import {
  z3BillboardBack, z3BillboardFace, z3CanopyFascia, z3ChimneyTile, z3CladdingTile, z3FireWindow, z3GasSign, z3HouseDoor, z3LitStrip, z3MotelDoor, z3MotelWindow,
  z3BrickTile, z3PumpFront, z3RollerDoor, z3ShingleTile, z3SidingTile, z3StuccoTile, z3Antenna, z3CompanyName, z3GrimeRuns, z3OpenBay, z3SootPlume,
} from '../../pixelworld/z3buildings';
import { z3TyreTile } from '../../pixelworld/z3cars';
import { z3SteelPoleTile } from '../../pixelworld/z3roadside';
import { z3FasciaTile, z3SoffitTile } from '../../pixelworld/z3structures';
import { box, card, cylinder } from './pwShapes';
import { partsOf } from './pwTrucks';

/**
 * HIGHWAY TO HELL's roadside buildings in ART: PIXEL WORLD (painters in
 * `pixelworld/z3buildings.ts`): clapboard houses with gables, shingled roofs,
 * chimneys, curtained / burning windows and porch doors; the gas station's
 * canopy, pumps, store and lightbox pole sign; ribbed warehouses with roller
 * shutters and lit names; the motel with numbered doors, an upper walkway and
 * its neon; the billboards as painted posters; the burning outskirts' brick
 * blocks behind the start.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);
const Y = V(0, 1, 0);
const near = (a: number, b: number, e = 0.03) => Math.abs(a - b) < e;
const _m = new THREE.Matrix4();

const COMPANIES = ['ACME FREIGHT', 'DELTA STORAGE', 'U-STOR-IT', 'MIDWEST COLD', 'TRI-STATE'];

export class Z3Buildings {
  readonly t;

  constructor(readonly atlas: PwAtlas) {
    const a = atlas;
    this.t = {
      siding: z3SidingTile(a),
      chimney: z3ChimneyTile(a),
      fire: [z3FireWindow(a, 0), z3FireWindow(a, 1)],
      canopy: z3CanopyFascia(a),
      pump: z3PumpFront(a),
      gasSign: z3GasSign(a),
      white: z3SteelPoleTile(a, 0xd8d4cc),
      steel: z3SteelPoleTile(a),
      cladding: z3CladdingTile(a),
      fascia: z3FasciaTile(a),
      soffit: z3SoffitTile(a, 0x8a8478),
      plaster: z3StuccoTile(a),
      brick: z3BrickTile(a),
      bbBack: z3BillboardBack(a),
      railing: railingTile(a, { hex: 0xc8c0b0 }),
      picket: picketFenceTile(a, { hex: 0xd8d0c0 }),
      antenna: z3Antenna(a),
      soot: z3SootPlume(a),
      grime: z3GrimeRuns(a),
      openBay: z3OpenBay(a),
      tyre: z3TyreTile(a),
    };
  }

  private tinted(t: PwTile, hex: number): PwRectOpts {
    return { tintRGB: tintFor(t, hex) };
  }

  /** A clapboard house (`house()` group, front = +z). */
  house(b: PwBatch, g: THREE.Object3D, r: { w: number; dpt: number; h: number; wall: number; roof: number; burning: boolean; wins: number[] }) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const t = this.t;
    const a = this.atlas;
    const p = g.getWorldPosition(new THREE.Vector3());
    const hv = hash2(Math.round(p.x), Math.round(p.z), 31);
    const sid = this.tinted(t.siding, r.wall);
    const { w, dpt, h } = r;
    box(b, 0, h / 2, 0, w, h, dpt, { px: t.siding, nx: t.siding, pz: t.siding, nz: t.siding }, {}, { ...sid, u0: 0, v0: 0 });
    // Gables at both ends (siding), under the roof's ridge.
    const ridge = dpt * 0.34;
    for (const s of [1, -1]) {
      const x = (s * w) / 2;
      const A = V(x, h, s * (dpt / 2));
      const B = V(x, h, -s * (dpt / 2));
      const C = V(x, h + ridge, 0);
      b.setMatrix(g.matrixWorld);
      // (tintRGB by a temporary rect call: tri takes a hex tint — use the neutral-ratio through a rect-less path.)
      b.tri(A, B, C, t.siding, [0, 0, dpt * 32, 0, (dpt / 2) * 32, ridge * 32], tintHex(t.siding, r.wall));
    }
    // Roof slabs (the classic two, shingled), a chimney.
    const sh = z3ShingleTile(a, r.roof, r.burning);
    for (const s of [-1, 1]) {
      _m.compose(V(0, h + dpt * 0.18, s * dpt * 0.24), new THREE.Quaternion().setFromEuler(new THREE.Euler(s * 0.62, 0, 0)), V(1, 1, 1));
      b.setMatrix(g.matrixWorld.clone().multiply(_m));
      box(b, 0, 0, 0, w + 0.6, 0.25, dpt * 0.58, { py: sh, pz: t.fascia, nz: t.fascia, px: t.fascia, nx: t.fascia, ny: t.soffit });
    }
    b.setMatrix(g.matrixWorld);
    if (hv > 0.35) box(b, w * 0.28, h + ridge * 0.55, -dpt * 0.12, 0.7, ridge * 0.9 + 0.8, 0.7, { px: t.chimney, nx: t.chimney, pz: t.chimney, nz: t.chimney, py: t.fascia });
    // Windows and the door on the front.
    const style = { frame: 0xe0d8c8, stone: 0x8a8070 };
    r.wins.forEach((kind, i) => {
      const x = i === 0 ? -w / 3 : w / 3;
      const y = h * 0.55;
      if (kind === 2) {
        const ft = t.fire[i & 1];
        b.rect(V(x - 0.75, y - 1.3, dpt / 2 + 0.03), X, Y, 1.5, 2.0, ft);
      } else {
        const k: WindowKind = kind === 1 ? 'warm' : hash2(i, Math.round(p.z), 7) > 0.7 ? 'boarded' : hash2(i, Math.round(p.x), 8) > 0.5 ? 'blinds' : 'dark';
        b.rect(V(x - WINDOW_M.w / 2, y - WINDOW_M.openY, dpt / 2 + 0.03), X, Y, WINDOW_M.w, WINDOW_M.h, windowModule(a, k, style, i & 1));
      }
    });
    const door = z3HouseDoor(a, hv > 0.5 ? 0x5a2a22 : 0x2a3a4a, !r.burning && hv > 0.3);
    b.rect(V(-0.56, 0, dpt / 2 + 0.03), X, Y, 1.125, 2.25, door);
    // ── What makes it a house, not a box: corner boards, a concrete foundation, gutters under
    // the eaves, a porch (posts, a little shingled roof, steps), soot climbing over the burnt
    // windows, an antenna on the ridge, a picket fence and a tyre in the yard.
    const trim = t.white;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, sx * (w / 2), h / 2, sz * (dpt / 2), 0.16, h, 0.16, { px: trim, nx: trim, pz: trim, nz: trim });
    box(b, 0, 0.2, 0, w + 0.08, 0.4, dpt + 0.08, { px: t.fascia, nx: t.fascia, pz: t.fascia, nz: t.fascia, py: t.fascia });
    for (const s of [-1, 1]) box(b, 0, h + 0.02, s * (dpt / 2 + 0.38), w + 0.6, 0.12, 0.12, { py: t.steel, pz: t.steel, nz: t.steel, ny: t.steel, px: t.steel, nx: t.steel });
    const pz = dpt / 2 + 1.2;
    for (const px of [-1.0, 1.0]) box(b, px, 1.25, pz, 0.12, 2.5, 0.12, { px: trim, nx: trim, pz: trim, nz: trim });
    _m.compose(V(0, 2.55, dpt / 2 + 0.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, 0)), V(1, 1, 1));
    b.setMatrix(g.matrixWorld.clone().multiply(_m));
    box(b, 0, 0, 0, 2.6, 0.1, 1.5, { py: sh, pz: t.fascia, px: t.fascia, nx: t.fascia, ny: t.soffit });
    b.setMatrix(g.matrixWorld);
    box(b, 0, 0.12, dpt / 2 + 0.55, 1.6, 0.24, 1.0, { py: t.fascia, pz: t.fascia, px: t.fascia, nx: t.fascia });
    r.wins.forEach((kind, i) => {
      if (kind !== 2) return;
      const x = i === 0 ? -w / 3 : w / 3;
      const top = h * 0.55 + 0.62;
      const ph = Math.min(2.0, h + 0.1 - top);
      if (ph > 0.4) b.rect(V(x - 0.75, top, dpt / 2 + 0.035), X, Y, 1.5, ph, t.soot, { sub: { x: 0, y: 0, w: 48, h: Math.max(1, Math.round((ph / 2.0) * 64)) } });
    });
    if (hv < 0.75) card(b, V(-w * 0.2 - 0.5, h + ridge * 0.55, 0), X, Y, 1, 1.5, t.antenna);
    const fz = dpt / 2 + 3.2;
    card(b, V(-w / 2 - 1, 0, fz), X, Y, w + 2, 1.0, t.picket);
    if (hv > 0.3) cylinder(b, V(w * 0.3, 0.2, fz - 1.2), V(w * 0.3, 0.4, fz - 1.2), 0.38, 0.38, 8, t.tyre);
    b.setMatrix(null);
  }

  /** The gas station: canopy, pillars, pumps, the store. */
  gas(b: PwBatch, g: THREE.Object3D): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const t = this.t;
    for (const p of partsOf(g, true)) {
      const m = p.mesh;
      const glow = (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      const d = (m.geometry as THREE.BoxGeometry).parameters;
      if (glow) {
        // The store window's glow: the shopfront paints it.
        if (near(d.width, 8)) out.push(m);
        continue;
      }
      b.setMatrix(p.rel);
      if (near(d.width, 0.5) && near(d.height, 5)) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.white, nx: t.white, pz: t.white, nz: t.white });
      else if (near(d.width, 14)) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.canopy, nx: t.canopy, pz: t.canopy, nz: t.canopy, py: t.steel, ny: t.soffit });
      else if (near(d.width, 14.1)) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.white, nx: t.white, pz: t.white, nz: t.white, ny: t.white });
      else if (near(d.width, 0.9)) box(b, 0, 0, 0, d.width, d.height, d.depth, { pz: t.pump, nz: t.pump, px: t.white, nx: t.white, py: t.white });
      else if (near(d.width, 12)) {
        box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.brick, nx: t.brick, pz: t.brick, nz: t.brick, py: t.fascia }, {}, { tintRGB: tintFor(t.brick, 0x9a8a74) });
        // Store front on the face toward the pumps (−z): two lit bays and a door.
        const shop = shopfrontModule(this.atlas, { widthM: 4, goods: 'liquor', lit: 0xfff0c0, riser: 0x5a2a2a, frame: 0x8a8c90 });
        b.rect(V(4.5, -d.height / 2, -d.depth / 2 - 0.02), V(-1, 0, 0), Y, 8, SHOPFRONT_H_M, shop, { u0: 0, v0: 0 });
      } else continue;
      out.push(m);
    }
    b.setMatrix(null);
    return out;
  }

  /** The 24-hour pole sign. */
  gasSign(b: PwBatch, g: THREE.Object3D) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    cylinder(b, V(0, 0, 0), V(0, 11.7, 0), 0.3, 0.3, 8, this.t.steel);
    box(b, 0, 13, 0, 5, 2.6, 0.6, { pz: this.t.gasSign, nz: this.t.gasSign, px: this.t.canopy, nx: this.t.canopy, py: this.t.steel, ny: this.t.steel });
    b.setMatrix(null);
  }

  /** A warehouse (front = +z): ribbed cladding, roller shutters, the roof edge, a lit company name. */
  warehouse(b: PwBatch, g: THREE.Object3D, r: { w: number; h: number; dep: number; hex: number; lit: boolean; i: number }): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const t = this.t;
    let n = 1 + (r.i % 7);
    for (const p of partsOf(g, false)) {
      const m = p.mesh;
      const d = (m.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(g.matrixWorld.clone().multiply(p.rel));
      const glow = (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      if (glow) {
        const name = COMPANIES[r.i % COMPANIES.length];
        b.rect(V(-d.width / 2, -d.height / 2, d.depth / 2 + 0.01), X, Y, d.width, d.height, z3LitStrip(this.atlas, name, Math.round(d.width)));
      } else if (near(d.width, r.w)) {
        box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.cladding, nx: t.cladding, pz: t.cladding, nz: t.cladding }, {}, { tintRGB: tintFor(t.cladding, r.hex) });
        // Grime weeping from the roof edge on every face; the company's name painted big on the
        // front (unlit ones) or on the side.
        const gH = Math.min(3, d.height * 0.45);
        const top = d.height / 2 - gH;
        b.rect(V(-d.width / 2, top, d.depth / 2 + 0.015), X, Y, d.width, gH, t.grime, { u0: 0, v0: 0 });
        b.rect(V(d.width / 2, top, -d.depth / 2 - 0.015), V(-1, 0, 0), Y, d.width, gH, t.grime, { u0: 17, v0: 0 });
        b.rect(V(d.width / 2 + 0.015, top, d.depth / 2), V(0, 0, -1), Y, d.depth, gH, t.grime, { u0: 31, v0: 0 });
        b.rect(V(-d.width / 2 - 0.015, top, -d.depth / 2), V(0, 0, 1), Y, d.depth, gH, t.grime, { u0: 7, v0: 0 });
        const name = z3CompanyName(this.atlas, COMPANIES[r.i % COMPANIES.length]);
        const k = Math.min(1, (d.depth - 2) / name.wM);
        if (r.lit) b.rect(V(d.width / 2 + 0.02, -0.2, (name.wM * k) / 2), V(0, 0, -1), Y, name.wM * k, name.hM * k, name.tile);
        else {
          const k2 = Math.min(1, (d.width - 4) / name.wM);
          b.rect(V((-name.wM * k2) / 2, d.height / 2 - 1.6 - name.hM * k2, d.depth / 2 + 0.02), X, Y, name.wM * k2, name.hM * k2, name.tile);
        }
      } else if (near(d.width, 4) && near(d.height, 4.5)) {
        const open = hash2(r.i, n, 41) > 0.62;
        box(b, 0, 0, 0, d.width, d.height, d.depth, { pz: open ? t.openBay : z3RollerDoor(this.atlas, 1 + (n % 3)), px: t.steel, nx: t.steel, py: t.steel });
        n++;
      }
      else box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.steel, nx: t.steel, pz: t.steel, nz: t.steel, py: t.steel });
      out.push(m);
    }
    b.setMatrix(null);
    return out;
  }

  /** The motel (front = +z): stucco, numbered doors, curtained windows, an upper walkway, the roof. */
  motel(b: PwBatch, g: THREE.Object3D, r: { wins: number[] }): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const t = this.t;
    let door = 101;
    let wi = 0;
    for (const c of g.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh) continue;
      const d = (m.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(m.matrixWorld);
      if (near(d.width, 34)) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.plaster, nx: t.plaster, pz: t.plaster, nz: t.plaster }, {}, { tintRGB: tintFor(t.plaster, 0xa07460) });
      else if (near(d.width, 34.4)) box(b, 0, 0, 0, d.width, d.height, d.depth, { py: z3ShingleTile(this.atlas, 0x4a3028), pz: t.fascia, nz: t.fascia, px: t.fascia, nx: t.fascia, ny: t.soffit });
      else if (near(d.height, 2.1)) b.rect(V(-0.5, -1.05, 0.06), X, Y, 1, 2.1, z3MotelDoor(this.atlas, door++));
      else if (near(d.height, 1)) {
        const lit = r.wins[wi++] === 1;
        b.rect(V(-0.56, -0.62, 0.06), X, Y, 1.12, 1.12, z3MotelWindow(this.atlas, lit));
      } else continue;
      out.push(m);
    }
    // Upper walkway with its railing and posts (scenery only).
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    box(b, 0, 2.95, 5.8, 34, 0.18, 1.6, { pz: t.fascia, py: t.soffit, ny: t.soffit, px: t.fascia, nx: t.fascia });
    card(b, V(0, 3.5, 6.55), X, Y, 34, 0.9, t.railing);
    for (let x = -16; x <= 16; x += 4) box(b, x, 1.43, 6.5, 0.16, 2.86, 0.16, { px: t.white, nx: t.white, pz: t.white, nz: t.white });
    b.setMatrix(null);
    return out;
  }

  /** The motel's neon pole sign. */
  motelSign(b: PwBatch, g: THREE.Object3D) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    cylinder(b, V(0, 0, 0), V(0, 8.6, 0), 0.25, 0.25, 6, this.t.steel);
    const motel = neonSign(this.atlas, 'MOTEL', 0xff3a8a, { cap: 0.75, minW: 220, minH: 46, back: 0x1a1a24 });
    const vac = neonSign(this.atlas, 'VACANCY', 0x40ff90, { cap: 0.3, minW: 220, minH: 24, back: 0x1a1a24, border: false });
    box(b, 0, 9.6, 0, 7, 2.2, 0.4, { px: this.t.steel, nx: this.t.steel, py: this.t.steel, ny: this.t.steel });
    for (const s of [1, -1]) {
      const z = s * 0.21;
      const right = s > 0 ? X : V(-1, 0, 0);
      const x0 = s > 0 ? -3.5 : 3.5;
      b.rect(V(x0, 9.6 - 0.35, z), right, Y, 7, 1.45, motel.tile);
      b.rect(V(x0, 8.5, z), right, Y, 7, 0.75, vac.tile);
    }
    b.setMatrix(null);
  }

  /** A billboard: steel legs, the painted poster face, a planked back with braces. */
  billboard(b: PwBatch, g: THREE.Object3D, r: { art: string; lit: boolean }): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const t = this.t;
    const face = z3BillboardFace(this.atlas, r.art);
    void face;
    for (const p of partsOf(g, false)) {
      const m = p.mesh;
      const glow = (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      if (glow && !m.userData.pwText) continue;
      out.push(m);
      if (m.parent !== g) continue;
      b.setMatrix(g.matrixWorld.clone().multiply(p.rel));
      if ((m.geometry as THREE.CylinderGeometry).type === 'CylinderGeometry') {
        const d = (m.geometry as THREE.CylinderGeometry).parameters;
        cylinder(b, V(0, -d.height / 2, 0), V(0, d.height / 2, 0), d.radiusBottom, d.radiusTop, 8, t.steel);
        continue;
      }
      const d = (m.geometry as THREE.BoxGeometry).parameters;
      if (near(d.width, 12.4)) box(b, 0, 0, 0, d.width, d.height, d.depth, { nz: t.bbBack, px: t.bbBack, nx: t.bbBack, py: t.bbBack, ny: t.bbBack, pz: r.art === 'motel' ? null : t.bbBack });
      else box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.steel, nx: t.steel, pz: t.steel, nz: t.steel, py: t.steel, ny: t.steel });
    }
    // The poster (12 × 5 m) just proud of the backing.
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    b.rect(V(-6, 9, 0.11), X, Y, 12, 5, face);
    if (r.art === 'motel') b.rect(V(6, 9, -0.37), V(-1, 0, 0), Y, 12, 5, face, { flipU: true });
    b.setMatrix(null);
    return out;
  }

  /** A burning-outskirts brick block behind the start (window face = −z). */
  block(b: PwBatch, m: THREE.Mesh, r: { w: number; h: number; dep: number; hex: number; wins: [number, number, number][] }) {
    const t = this.t;
    m.updateMatrixWorld(true);
    b.setMatrix(m.matrixWorld);
    box(b, 0, 0, 0, r.w, r.h, r.dep, { px: t.brick, nx: t.brick, pz: t.brick, nz: t.brick }, {}, { tintRGB: tintFor(t.brick, r.hex), u0: 0, v0: 0 });
    const style = { frame: 0x3a3a42, stone: 0x4a4a52 };
    for (const [fx, fy, kind] of r.wins) {
      const y = fy - r.h / 2;
      if (kind === 2) b.rect(V(fx + 0.75, y - 1.3, -r.dep / 2 - 0.03), V(-1, 0, 0), Y, 1.5, 2.0, t.fire[Math.round(fx * 3) & 1]);
      else {
        const k: WindowKind = kind === 1 ? 'warm' : hash2(Math.round(fx * 7), Math.round(fy), 3) > 0.75 ? 'broken' : 'dark';
        b.rect(V(fx + WINDOW_M.w / 2, y - WINDOW_M.openY, -r.dep / 2 - 0.03), V(-1, 0, 0), Y, WINDOW_M.w, WINDOW_M.h, windowModule(this.atlas, k, style, Math.round(fx) & 1));
      }
    }
    b.setMatrix(null);
  }

  /** A block's roof cap. */
  blockRoof(b: PwBatch, m: THREE.Mesh) {
    const d = (m.geometry as THREE.BoxGeometry).parameters;
    b.setMatrix(m.matrixWorld);
    box(b, 0, 0, 0, d.width, d.height, d.depth, { px: this.t.fascia, nx: this.t.fascia, pz: this.t.fascia, nz: this.t.fascia, py: this.t.soffit });
    b.setMatrix(null);
  }
}

/** Hex vertex tint equivalent of a NEUTRAL tile's colour ratio (for `tri`, which takes a hex tint). */
function tintHex(tile: PwTile, hex: number): number {
  const [r, g, b] = tintFor(tile, hex);
  const c = new THREE.Color().setRGB(r, g, b);
  return c.getHex();
}
