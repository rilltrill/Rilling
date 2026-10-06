import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { hash2, hazardTile } from '../../pixelworld/surfaces';
import { railingTile } from '../../pixelworld/props';
import {
  z3BridgeSteel, z3CableTile, z3CastLetters, z3FanEnd, z3FanTile, z3FasciaTile, z3FloodHead, z3GraffitiWords, z3HighwaySign, z3PierTile, z3PortalTile, z3RiprapTile,
  z3SandbagTile, z3SignBack, z3SoffitTile, z3SosMarker, z3SoundWallTile, z3TrussTile, z3TunnelCeil, z3TunnelWall,
} from '../../pixelworld/z3structures';
import { z3CobraHead, z3FootingTile, z3SteelPoleTile } from '../../pixelworld/z3roadside';
import { z3ChromeTile } from '../../pixelworld/z3trucks';
import { box, card, cylinder, type FaceTiles } from './pwShapes';
import { partsOf } from './pwTrucks';

/**
 * HIGHWAY TO HELL's structures in ART: PIXEL WORLD: highway signs, the
 * gantry and bridge trusses as open lattices, the overpass (fascia, soffit,
 * piers, railing, riprap embankments), the sound wall and its warnings, the
 * tunnel bore and portals, the suspension bridge (deck, stiffening truss,
 * railing, cables, suspenders, towers, lamps), the barricade's sandbags and
 * floodlights. Each painter emits into the chunk batch (world frame) and
 * returns the classic meshes it replaced.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);
const Y = V(0, 1, 0);
const near = (a: number, b: number, e = 0.03) => Math.abs(a - b) < e;
const _m = new THREE.Matrix4();

export class Z3Structures {
  readonly t;

  constructor(readonly atlas: PwAtlas) {
    const a = atlas;
    this.t = {
      signBack: z3SignBack(a),
      trussGrey: z3TrussTile(a, 0x6a6e74),
      trussRed: z3TrussTile(a, 0xb8442a),
      steel: z3ChromeTile(a, true),
      pole: z3SteelPoleTile(a),
      fascia: z3FasciaTile(a),
      soffit: z3SoffitTile(a),
      pier: z3PierTile(a),
      riprap: z3RiprapTile(a),
      railing: railingTile(a, { hex: 0x8a8e94 }),
      railingRed: railingTile(a, { hex: 0xb8442a }),
      sound: [z3SoundWallTile(a, 0), z3SoundWallTile(a, 1)],
      tunWall: z3TunnelWall(a, 0),
      sos: z3SosMarker(a),
      tunCeil: z3TunnelCeil(a),
      portal: z3PortalTile(a),
      fan: z3FanTile(a),
      fanEnd: z3FanEnd(a),
      bsteel: z3BridgeSteel(a),
      bsteelDark: z3BridgeSteel(a, 0x84301f),
      cable: z3CableTile(a),
      hazard: hazardTile(a, {}),
      footing: z3FootingTile(a),
      cobra: z3CobraHead(a, true),
      flood: z3FloodHead(a),
      sandbag: [1, 2, 3, 4].map((r) => z3SandbagTile(a, r)),
    };
  }

  /** A box skinned with an open truss on its four long (x-running) faces, the tile's height over the box's. */
  trussBox(b: PwBatch, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tile: PwTile) {
    // Square panels: the tile's height spans the face's height.
    const uLen = (sx / sy) * tile.h;
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    const H = tile.h;
    // Front (+z), back (−z): v over the height.
    b.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), tile, [0, 0, uLen, 0, uLen, H, 0, H]);
    b.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), tile, [0, 0, uLen, 0, uLen, H, 0, H]);
    // Top / bottom: v over the depth.
    const uTop = (sx / sz) * tile.h;
    b.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), tile, [0, 0, uTop, 0, uTop, H, 0, H]);
    b.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), tile, [0, 0, uTop, 0, uTop, H, 0, H]);
  }

  /** A highway sign group (`signPanel()`): the painted face, a galvanised back, steel edges. */
  sign(b: PwBatch, g: THREE.Object3D, rec: { lines: string[]; w: number; h: number; color: number }) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const face = z3HighwaySign(this.atlas, rec.lines, rec.w, rec.h, rec.color);
    box(b, 0, 0, 0, rec.w, rec.h, 0.12, { pz: face, nz: this.t.signBack, px: this.t.steel, nx: this.t.steel, py: this.t.steel, ny: this.t.steel });
    b.setMatrix(null);
  }

  /** The gantry over the lanes: lattice beams on steel posts (its signs are painted on their own). */
  gantry(b: PwBatch, g: THREE.Object3D): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    g.updateMatrixWorld(true);
    for (const c of g.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh) continue;
      const d = (m.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(m.matrixWorld);
      if (d.width > 10) this.trussBox(b, 0, 0, 0, d.width, d.height, d.depth, this.t.trussGrey);
      else box(b, 0, 0, 0, d.width, d.height, d.depth, { px: this.t.pole, nx: this.t.pole, pz: this.t.pole, nz: this.t.pole, py: this.t.steel });
      out.push(m);
    }
    b.setMatrix(null);
    return out;
  }

  /** The overpass: deck fascia + soffit, girders, parapet, open railing, piers, riprap embankments. */
  overpass(b: PwBatch, g: THREE.Object3D): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const t = this.t;
    g.updateMatrixWorld(true);
    let railDone = false;
    for (const c of g.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || c.userData.pw) continue;
      const d = (m.geometry as THREE.BoxGeometry).parameters;
      if (!d || d.width === undefined) continue;
      b.setMatrix(m.matrixWorld);
      const f = (all: PwTile, o: FaceTiles = {}) => ({ px: all, nx: all, pz: all, nz: all, py: all, ny: all, ...o });
      if (near(d.width, 80) && near(d.height, 1)) {
        if (near(d.depth, 12)) box(b, 0, 0, 0, d.width, d.height, d.depth, f(t.fascia, { py: t.soffit, ny: t.soffit }));
        else box(b, 0, 0, 0, d.width, d.height, d.depth, f(t.pier, { py: t.fascia }));
      } else if (near(d.width, 80) && near(d.height, 0.8)) box(b, 0, 0, 0, d.width, d.height, d.depth, f(t.soffit));
      else if (near(d.width, 80) && near(d.height, 0.3)) box(b, 0, 0, 0, d.width, d.height, d.depth, f(t.fascia));
      else if (d.width < 0.1 || (near(d.width, 80) && d.height < 0.1)) {
        // The open railing: one painted cut-out run along the near edge.
        if (!railDone) {
          railDone = true;
          b.setMatrix(g.matrixWorld);
          card(b, V(-3, 7.98, 5.85), X, Y, 80, 0.86, t.railing);
        }
      } else if (near(d.width, 1.4) && near(d.height, 6.3)) box(b, 0, 0, 0, d.width, d.height, d.depth, f(t.pier));
      else if (near(d.width, 1.8)) box(b, 0, 0, 0, d.width, d.height, d.depth, f(t.fascia, { ny: t.soffit }));
      else if (near(d.width, 14)) {
        // Embankment: a riprap slope down and away from the road, a plain abutment face toward it.
        const s = m.position.x > 0 ? 1 : -1;
        b.setMatrix(g.matrixWorld);
        const xi = m.position.x - s * 7;
        const xo = m.position.x + s * 9;
        const yT = 7.3;
        const z0 = -7;
        const z1 = 7;
        // Abutment face (toward the road).
        const n = s > 0 ? V(xi, 0, z1) : V(xi, 0, z0);
        b.rect(n, V(0, 0, s > 0 ? -1 : 1), Y, 14, yT, t.pier);
        // Slope (riprap), from the top edge down to the ground away from the road.
        if (s > 0) b.quad(V(xi, yT, z1), V(xo, 0, z1), V(xo, 0, z0), V(xi, yT, z0), t.riprap, [0, 0, 360, 0, 360, 448, 0, 448]);
        else b.quad(V(xi, yT, z0), V(xo, 0, z0), V(xo, 0, z1), V(xi, yT, z1), t.riprap, [0, 0, 360, 0, 360, 448, 0, 448]);
        // Side triangles.
        for (const z of [z0, z1]) {
          const front = z === z1;
          const A = V(xi, 0, z);
          const B = V(xo, 0, z);
          const C = V(xi, yT, z);
          const cw = (s > 0) === front;
          if (cw) b.tri(A, B, C, t.riprap, [0, 0, 300, 0, 0, 230]);
          else b.tri(B, A, C, t.riprap, [300, 0, 0, 0, 0, 230]);
        }
      } else continue;
      out.push(m);
    }
    b.setMatrix(null);
    return out;
  }

  /** A sound-wall panel group: fluted panel faces, the post. */
  soundWall(b: PwBatch, g: THREE.Object3D, i: number): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const p of partsOf(g, true)) {
      const d = (p.mesh.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(p.rel);
      if (near(d.height, 4.6)) {
        const tile = this.t.sound[hash2(i, 0, 3) > 0.7 ? 1 : 0];
        box(b, 0, 0, 0, d.width, d.height, d.depth, { nx: tile, px: tile, py: this.t.fascia }, { px: { flipU: true } });
      } else box(b, 0, 0, 0, d.width, d.height, d.depth, { nx: this.t.pier, px: this.t.pier, pz: this.t.pier, nz: this.t.pier, py: this.t.fascia });
      out.push(p.mesh);
    }
    b.setMatrix(null);
    return out;
  }

  /** Spray-painted words on the sound wall (the block-letter group's place). */
  graffiti(b: PwBatch, g: THREE.Object3D, rec: { text: string; color: number }) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const s = z3GraffitiWords(this.atlas, rec.text, rec.color);
    b.rect(V(-s.wM / 2, -s.hM / 2, 0.01), X, Y, s.wM, s.hM, s.tile);
    b.setMatrix(null);
  }

  /** A 6 m tunnel segment: tiled walls, the sooty ceiling, the fixture housings. */
  tunnelSeg(b: PwBatch, g: THREE.Object3D, rec: { i: number }): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const t = this.t;
    for (const p of partsOf(g, true)) {
      const d = (p.mesh.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(p.rel);
      const x = p.mesh.position.x;
      if (near(d.height, 7.4) && near(d.width, 0.5)) {
        const tile = t.tunWall;
        // The face toward the road (the left wall's +x side, the right wall's −x side).
        if (x < 0) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: tile, py: t.tunCeil });
        else box(b, 0, 0, 0, d.width, d.height, d.depth, { nx: tile, py: t.tunCeil }, { nx: { flipU: true } });
        // An SOS marker every fifth segment.
        if (rec.i % 5 === 2) {
          const s = x < 0 ? 1 : -1;
          b.rect(V(s * 0.27, -0.2, s * 0.4), V(0, 0, -s), Y, 0.8, 0.4, t.sos);
        }
      } else if (near(d.height, 0.18) && d.width > 0.52) {
        // The hazard stripe along the kick band.
        if (x < 0) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.hazard, py: t.hazard });
        else box(b, 0, 0, 0, d.width, d.height, d.depth, { nx: t.hazard, py: t.hazard });
      } else if (near(d.height, 0.6)) box(b, 0, 0, 0, d.width, d.height, d.depth, { ny: t.tunCeil });
      else if (near(d.height, 0.18)) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.steel, nx: t.steel, pz: t.steel, nz: t.steel, ny: t.steel });
      // (The grime box: the wall module paints its kick band.)
      out.push(p.mesh);
    }
    b.setMatrix(null);
    return out;
  }

  /** A jet fan (cylinder along local y): the drum + grille ends. */
  fan(b: PwBatch, m: THREE.Mesh) {
    const g = (m.geometry as THREE.CylinderGeometry).parameters;
    b.setMatrix(m.matrixWorld);
    cylinder(b, V(0, -g.height / 2, 0), V(0, g.height / 2, 0), g.radiusBottom, g.radiusTop, 10, this.t.fan, { capB: this.t.fanEnd });
    cylinder(b, V(0, g.height / 2, 0), V(0, -g.height / 2, 0), g.radiusTop, g.radiusBottom, 10, this.t.fan, { capB: this.t.fanEnd });
    b.setMatrix(null);
  }

  /** A tunnel portal: board-formed concrete, the hazard band, cast letters, the oncoming bore's dark mouth. */
  portal(b: PwBatch, g: THREE.Object3D, dir: number): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const t = this.t;
    let letters = false;
    for (const p of partsOf(g, true)) {
      const m = p.mesh;
      if ((m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) continue;
      if (m.userData.pwText) {
        letters = true;
        out.push(m);
        continue;
      }
      const d = (m.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(p.rel);
      const hex = (m.material as THREE.MeshLambertMaterial).color.getHex();
      if (near(d.height, 0.6)) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.hazard, nx: t.hazard, pz: t.hazard, nz: t.hazard, py: t.hazard, ny: t.hazard });
      else if (hex === 0x0c0c10) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.soffit, nx: t.soffit, pz: t.soffit, nz: t.soffit, ny: t.soffit }, {}, { tint: 0x303038 });
      else box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.portal, nx: t.portal, pz: t.portal, nz: t.portal, py: t.portal, ny: t.soffit });
      out.push(m);
    }
    if (letters && dir > 0) {
      g.updateMatrixWorld(true);
      b.setMatrix(g.matrixWorld);
      const s = z3CastLetters(this.atlas, 'ROUTE 9 TUNNEL');
      b.rect(V(0.7 - s.wM / 2, 7.4 + 3.0 - s.hM / 2, 1.04), X, Y, s.wM, s.hM, s.tile);
    }
    b.setMatrix(null);
    return out;
  }

  /** A 10 m bridge segment: deck edges + soffit, the open stiffening truss, cross beam, parapets, railing. */
  bridgeSeg(b: PwBatch, g: THREE.Object3D): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const t = this.t;
    let rails = 0;
    for (const p of partsOf(g, true)) {
      const m = p.mesh;
      const d = (m.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(p.rel);
      if (near(d.height, 1.6)) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.fascia, nx: t.fascia, ny: t.soffit });
      else if (near(d.height, 3.2)) this.trussBoxZ(b, d.width, d.height, d.depth, t.trussRed);
      else if (near(d.height, 4.2)) {
        // (The diagonal: the lattice draws the web.)
      } else if (near(d.height, 0.3)) box(b, 0, 0, 0, d.width, d.height, d.depth, { pz: t.bsteelDark, nz: t.bsteelDark, ny: t.bsteelDark, py: t.bsteelDark });
      else if (near(d.height, 0.8)) box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t.fascia, nx: t.fascia, py: t.fascia, pz: t.fascia, nz: t.fascia });
      else if (near(d.height, 0.12) && d.depth > 5) {
        // The top rail: a painted cut-out railing over the parapet in its place.
        const pos = m.position;
        void pos;
        b.setMatrix(p.rel.clone().multiply(_m.makeTranslation(0, -0.34, 0)));
        const r = new THREE.Vector3(0, 0, -1);
        card(b, V(0, 0, 0), r, Y, d.depth, 0.68, t.railingRed);
        rails++;
      }
      out.push(m);
    }
    void rails;
    b.setMatrix(null);
    return out;
  }

  /** An open truss box whose long axis is local z (the bridge's stiffening truss). */
  private trussBoxZ(b: PwBatch, sx: number, sy: number, sz: number, tile: PwTile) {
    const prev = b.matrix.clone();
    b.setMatrix(prev.clone().multiply(_m.makeRotationY(Math.PI / 2)));
    this.trussBox(b, 0, 0, 0, sz, sy, sx, tile);
    b.setMatrix(prev);
  }

  /** A suspender rope / main cable segment (cylinder along local y). */
  cable(b: PwBatch, m: THREE.Mesh, thin: boolean) {
    const g = (m.geometry as THREE.CylinderGeometry).parameters;
    b.setMatrix(m.matrixWorld);
    cylinder(b, V(0, -g.height / 2, 0), V(0, g.height / 2, 0), g.radiusBottom, g.radiusTop, thin ? 4 : 6, thin ? this.t.steel : this.t.cable);
    b.setMatrix(null);
  }

  /** A bridge lamp post (pole, arm, cobra head with a lit lens). */
  bridgeLamp(b: PwBatch, g: THREE.Object3D) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    cylinder(b, V(0, 0, 0), V(0, 8, 0), 0.13, 0.09, 6, this.t.pole);
    cylinder(b, V(0, 7.95, 0), V(0, 7.95, 1.5), 0.05, 0.045, 4, this.t.pole);
    box(b, 0, 7.9, 1.75, 0.34, 0.3, 0.9, { px: this.t.cobra, nx: this.t.cobra, py: this.t.steel, ny: this.t.cobra }, { px: { flipU: true }, ny: { sub: { x: 8, y: 1, w: 22, h: 2 } } });
    b.setMatrix(null);
  }

  /** A bridge tower: riveted red legs with bands, caps, open portal bracing, piers in the water. */
  tower(b: PwBatch, g: THREE.Object3D): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const t = this.t;
    for (const p of partsOf(g, true)) {
      const m = p.mesh;
      if ((m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) continue;
      const d = (m.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(p.rel);
      const all = (tile: PwTile) => ({ px: tile, nx: tile, pz: tile, nz: tile, py: tile, ny: tile });
      if (near(d.width, 7)) box(b, 0, 0, 0, d.width, d.height, d.depth, all(t.footing));
      else if (d.width > 20) {
        if (m.position.y > 45) box(b, 0, 0, 0, d.width, d.height, d.depth, all(t.bsteel));
        else this.trussBox(b, 0, 0, 0, d.width, d.height, d.depth, t.trussRed);
      } else if (near(d.height, 0.25) || near(d.height, 2)) box(b, 0, 0, 0, d.width, d.height, d.depth, all(t.bsteelDark));
      else box(b, 0, 0, 0, d.width, d.height, d.depth, all(t.bsteel));
      out.push(m);
    }
    b.setMatrix(null);
    return out;
  }

  /** A sandbag wall section (`sandbags()` group: bags along local x): one painted wall in place of the bags. */
  sandbags(b: PwBatch, g: THREE.Object3D, rec: { len: number; rows: number }) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const tile = this.t.sandbag[Math.max(1, Math.min(4, rec.rows)) - 1];
    const H = 1.0;
    const L = rec.len + 0.3;
    // Front and back faces (the tile's top courses are cut out above `rows`).
    b.rect(V(-L / 2, 0, 0.21), X, Y, L, H, tile, { u0: 0, v0: 0 });
    b.rect(V(L / 2, 0, -0.21), V(-1, 0, 0), Y, L, H, tile, { u0: 7, v0: 0 });
    // The top course seen from above: a strip of bags.
    const top = rec.rows * 0.24;
    b.rect(V(-L / 2, top, 0.21), X, V(0, 0, -1), L, 0.42, tile, { u0: 0, v0: 2 });
    b.setMatrix(null);
  }

  /** A floodlight tower: lattice mast, the lamp head (glowing). */
  flood(b: PwBatch, g: THREE.Object3D, rec: { h: number; w: number }) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const t = this.t;
    box(b, 0, rec.h / 2, 0, 0.28, rec.h, 0.28, { px: t.pole, nx: t.pole, pz: t.pole, nz: t.pole });
    box(b, 0, rec.h + 0.2, 0, rec.w, rec.w * 0.5, 0.4, { pz: t.flood, nz: t.steel, px: t.steel, nx: t.steel, py: t.steel, ny: t.steel });
    b.setMatrix(null);
  }

  /** Hazard-striped parts (the barricade blocks' bands, the gate posts). */
  hazard(b: PwBatch, m: THREE.Mesh) {
    const d = (m.geometry as THREE.BoxGeometry).parameters;
    b.setMatrix(m.matrixWorld);
    const t = this.t.hazard;
    box(b, 0, 0, 0, d.width, d.height, d.depth, { px: t, nx: t, pz: t, nz: t, py: t });
    b.setMatrix(null);
  }
}
