import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { tintFor, type PwBatch, type PwRectOpts } from '../../pixelworld/batch';
import { z3BumperTile, z3BurntShell, z3CarPaintTop, z3CarScreen, z3TyreTile, z3WheelFace } from '../../pixelworld/z3cars';
import {
  z3ArmyCabSide, z3BusWindows, z3CanvasCover, z3ChromeTile, z3FlammableBand, z3OliveTile, z3Placard, z3SemiCabBack, z3SemiCabSide, z3SemiGrille, z3SemiHoodSide, z3TankShell, z3TrackTile,
  z3TrailerBack, z3TrailerSide, z3MarkerLamp, z3Deflector, z3UnitStencil,
} from '../../pixelworld/z3trucks';
import { box, cylinder, type Face, type FaceTiles } from './pwShapes';
import { PAL } from './props';
import { liftPaint } from './pwVehicles';

/** Hex (sRGB) of a NEUTRAL tint's linear ratio (triangles take a hex tint). */
function hexOf(o: PwRectOpts): number {
  const t = o.tintRGB;
  return t ? new THREE.Color().setRGB(t[0], t[1], t[2]).getHex() : 0xffffff;
}

/**
 * HIGHWAY TO HELL's big vehicles in ART: PIXEL WORLD: each classic part (box /
 * cylinder / sphere) of the semi, the reefer trailer, the bus, the tanker, the
 * army truck and the tank re-emitted in place with painted modules on its faces,
 * chosen by what the part is (its material colour and size as the builder made
 * it). Parts are emitted in `root`'s frame: a group whose meshes are its direct
 * or nested children (`rel` = the part relative to it).
 */

const _inv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

type Part = { mesh: THREE.Mesh; rel: THREE.Matrix4; hex: number; glow: boolean };

/** The meshes under `g` with their transform relative to `g` (or to the world when `world`). */
export function partsOf(g: THREE.Object3D, world = false): Part[] {
  g.updateMatrixWorld(true);
  _inv.copy(g.matrixWorld).invert();
  const out: Part[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.pixelWorld) return;
    const mat = m.material as THREE.MeshLambertMaterial;
    const rel = world ? m.matrixWorld.clone() : _rel.multiplyMatrices(_inv, m.matrixWorld).clone();
    out.push({ mesh: m, rel, hex: mat.color?.getHex() ?? 0, glow: (mat as unknown as THREE.MeshBasicMaterial).isMeshBasicMaterial === true });
  });
  return out;
}

const isBox = (m: THREE.Mesh) => (m.geometry as THREE.BoxGeometry).type === 'BoxGeometry';
const isCyl = (m: THREE.Mesh) => (m.geometry as THREE.CylinderGeometry).type === 'CylinderGeometry';
const bp = (m: THREE.Mesh) => (m.geometry as THREE.BoxGeometry).parameters;
const cp = (m: THREE.Mesh) => (m.geometry as THREE.CylinderGeometry).parameters;
const near = (a: number, b: number, e = 0.02) => Math.abs(a - b) < e;

export class Z3Trucks {
  readonly t;
  readonly marker: PwTile;

  constructor(readonly atlas: PwAtlas) {
    const a = atlas;
    this.t = {
      top: z3CarPaintTop(a),
      burnt: z3BurntShell(a),
      tyre: [z3TyreTile(a), z3TyreTile(a, true)],
      wheel: [z3WheelFace(a, 0), z3WheelFace(a, 1), z3WheelFace(a, 2)],
      black: z3BumperTile(a, true),
      chrome: z3ChromeTile(a),
      steel: z3ChromeTile(a, true),
      screen: [z3CarScreen(a, 0), z3CarScreen(a, 3)],
      olive: z3OliveTile(a),
      canvas: z3CanvasCover(a),
      armyCab: z3ArmyCabSide(a),
      track: z3TrackTile(a),
      busWin: z3BusWindows(a),
      shell: z3TankShell(a),
      band: z3FlammableBand(a),
      placard: z3Placard(a),
    };
    this.marker = z3MarkerLamp(a);
  }

  /** Emit a box part with per-face tiles (in the batch's current transform × part). */
  private box(b: PwBatch, p: Part, faces: FaceTiles, o: Partial<Record<Face, PwRectOpts>> = {}, all: PwRectOpts = {}) {
    const g = bp(p.mesh);
    const prev = b.matrix.clone();
    b.setMatrix(prev.clone().multiply(p.rel));
    box(b, 0, 0, 0, g.width, g.height, g.depth, faces, o, all);
    b.setMatrix(prev);
  }

  /** A cylinder part (axis = its local y) with `tile` round it and an optional cap module on the +y end. */
  private cyl(b: PwBatch, p: Part, tile: PwTile, cap?: PwTile, capBottom?: PwTile) {
    const g = cp(p.mesh);
    const prev = b.matrix.clone();
    b.setMatrix(prev.clone().multiply(p.rel));
    const sides = Math.max(6, g.radialSegments);
    cylinder(b, V(0, -g.height / 2, 0), V(0, g.height / 2, 0), g.radiusBottom, g.radiusTop, sides, tile, { capB: cap });
    if (capBottom) cylinder(b, V(0, g.height / 2, 0), V(0, -g.height / 2, 0), g.radiusTop, g.radiusBottom, sides, tile, { capB: capBottom });
    b.setMatrix(prev);
  }

  /** A wheel part (tyre cylinder): tread round, the hub face on both ends. */
  private wheel(b: PwBatch, p: Part, burnt: boolean, face = 0) {
    this.cyl(b, p, this.t.tyre[burnt ? 1 : 0], this.t.wheel[burnt ? 2 : face], this.t.wheel[burnt ? 2 : face]);
  }

  /** Common: tyre and hub cylinders → wheels (hub skipped), any other cylinder → chrome / steel. */
  private genericCyl(b: PwBatch, p: Part, burnt: boolean, face = 0) {
    const hex = p.hex;
    if (hex === PAL.tyre || hex === 0x141414) this.wheel(b, p, burnt, face);
    // (Hub caps: the wheel face covers them.)
    else if (near(cp(p.mesh).height, 0.28)) return;
    else this.cyl(b, p, burnt ? this.t.burnt : hex === 0xc4c8d0 ? this.t.chrome : this.t.steel);
  }

  /** The semi tractor cab (`semiCab()`): paint per its colour, chrome, glass, chassis, wheels. */
  semi(b: PwBatch, g: THREE.Object3D, rec0: { color: number; burnt: boolean }) {
    const a = this.atlas;
    const rec = { ...rec0, color: liftPaint(rec0.color) };
    const burnt = rec.burnt;
    const side = z3SemiCabSide(a, rec.color, burnt);
    const hood = z3SemiHoodSide(a, rec.color, burnt);
    const grille = z3SemiGrille(a, burnt);
    const back = z3SemiCabBack(a, rec.color, burnt);
    const paint = burnt ? this.t.burnt : this.t.top;
    const tint: PwRectOpts = burnt ? {} : { tintRGB: tintFor(paint, rec.color) };
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    for (const p of partsOf(g)) {
      if (p.glow) continue;
      const m = p.mesh;
      if (isBox(m)) {
        const d = bp(m);
        if (near(d.width, 2.5) && near(d.height, 2.6)) this.box(b, p, { px: side, nx: side, pz: paint, nz: back, py: back }, { nx: { flipU: true }, pz: tint });
        else if (near(d.width, 2.4) && near(d.height, 1.2)) this.box(b, p, { px: hood, nx: hood, pz: paint, py: paint }, { nx: { flipU: true }, pz: tint, py: tint });
        else if (near(d.height, 0.9) && near(d.depth, 0.06)) this.box(b, p, { pz: this.t.screen[burnt ? 1 : 0] });
        else if (near(d.width, 1.6) && near(d.height, 1.0)) this.box(b, p, { pz: grille, px: this.t.chrome, nx: this.t.chrome, py: this.t.chrome });
        else this.box(b, p, { px: this.t.black, nx: this.t.black, pz: this.t.black, nz: this.t.black, py: this.t.black, ny: this.t.black });
      } else if (isCyl(m)) this.genericCyl(b, p, burnt, 1);
    }
    // Off the box: a roof air deflector, the cab marker lamps along the roof's front edge, a sun
    // visor over the windscreen, mirrors on their arms — the cab stops reading as a crate.
    const t = this.t;
    const dark = t.black;
    const fairing = z3Deflector(a, rec.color, burnt);
    const ramp = (x0: number, x1: number, zf: number, zb: number, y: number, hf: number, hb: number) => {
      const A = V(x0, y + hf, zf);
      const B = V(x1, y + hf, zf);
      const C = V(x1, y + hb, zb);
      const D = V(x0, y + hb, zb);
      b.quad(A, B, C, D, fairing, [0, 0, 64, 0, 64, 72, 0, 72]);
      b.quad(V(x1, y, zb), V(x0, y, zb), D, C, paint, [0, 0, (x1 - x0) * 32, 0, (x1 - x0) * 32, hb * 32, 0, hb * 32], burnt ? 0xffffff : hexOf(tint));
      for (const [x, s] of [[x0, -1], [x1, 1]] as const) {
        const P = [V(x, y, zf), V(x, y + hf, zf), V(x, y + hb, zb), V(x, y, zb)];
        if (s > 0) b.quad(P[0], P[3], P[2], P[1], dark, [0, 0, 8, 0, 8, 8, 0, 8]);
        else b.quad(P[3], P[0], P[1], P[2], dark, [0, 0, 8, 0, 8, 8, 0, 8]);
      }
    };
    ramp(-1.05, 1.05, 1.75, -0.45, 3.5, 0.04, 0.7);
    for (let i = 0; i < 5; i++) box(b, -0.6 + i * 0.3, 3.56, 1.86, 0.16, 0.1, 0.06, { pz: this.marker, py: dark, px: dark, nx: dark });
    box(b, 0, 3.38, 2.06, 2.36, 0.06, 0.34, { py: dark, ny: dark, pz: dark, px: dark, nx: dark });
    for (const s of [-1, 1]) {
      box(b, s * 1.42, 2.75, 1.98, 0.36, 0.05, 0.05, { py: t.chrome, ny: t.chrome, pz: t.chrome, nz: t.chrome });
      box(b, s * 1.62, 2.55, 1.98, 0.1, 0.5, 0.16, { px: dark, nx: dark, pz: t.chrome, nz: dark, py: t.chrome });
    }
    b.setMatrix(null);
  }

  /** The reefer trailer: livery sides, back doors, roof, chassis, landing legs, wheels (its block text goes). */
  trailer(b: PwBatch, g: THREE.Object3D, rec: { color: number; text: string }) {
    const a = this.atlas;
    const side = z3TrailerSide(a, rec.color, rec.text || 'FRESH FOODS');
    const back = z3TrailerBack(a, rec.color);
    const roof = this.t.top;
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    for (const p of partsOf(g)) {
      if (p.glow || p.mesh.userData.pwText) continue;
      const m = p.mesh;
      if (isBox(m)) {
        const d = bp(m);
        if (near(d.depth, 12.8) && near(d.height, 2.9)) this.box(b, p, { px: side, nx: side, pz: back, nz: back, py: roof }, { nx: { flipU: true }, py: { tintRGB: tintFor(roof, rec.color) } });
        else this.box(b, p, { px: this.t.black, nx: this.t.black, pz: this.t.black, nz: this.t.black, py: this.t.black, ny: this.t.black });
      } else if (isCyl(m)) this.genericCyl(b, p, false, 1);
    }
    b.setMatrix(null);
  }

  /** The (burnt) school bus on the overpass. */
  bus(b: PwBatch, g: THREE.Object3D, rec: { burnt: boolean }) {
    const burnt = rec.burnt;
    const paint = burnt ? this.t.burnt : this.t.top;
    const tint: PwRectOpts = burnt ? {} : { tintRGB: tintFor(paint, 0xe0a818) };
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    for (const p of partsOf(g)) {
      if (p.glow) continue;
      const m = p.mesh;
      if (isBox(m)) {
        const d = bp(m);
        if (near(d.width, 0.04)) this.box(b, p, { px: this.t.busWin, nx: this.t.busWin });
        else if (near(d.depth, 0.06)) this.box(b, p, { pz: this.t.screen[burnt ? 1 : 0] });
        else if (near(d.width, 0.05)) this.box(b, p, { px: this.t.black, nx: this.t.black, py: this.t.black });
        else this.box(b, p, { px: paint, nx: paint, pz: paint, nz: paint, py: paint }, {}, tint);
      } else if (isCyl(m)) this.genericCyl(b, p, burnt);
    }
    b.setMatrix(null);
  }

  /**
   * The tanker's tank (`tankerTank()`, its own frame): polished shell, bands, end caps, the FLAMMABLE
   * band and hazmat placards. Emitted in the group's LOCAL frame (`b` is a part batch).
   */
  tank(b: PwBatch, g: THREE.Object3D) {
    b.setMatrix(null);
    for (const p of partsOf(g)) {
      if (p.glow || p.mesh.userData.pwText) continue;
      const m = p.mesh;
      if (isCyl(m)) {
        const d = cp(m);
        if (d.height > 5) this.cyl(b, p, this.t.shell);
        else this.cyl(b, p, this.t.steel, this.t.steel, this.t.steel);
      } else if (isBox(m)) {
        const d = bp(m);
        if (near(d.width, 6)) this.box(b, p, { pz: this.t.band, py: this.t.steel, ny: this.t.steel });
        else this.box(b, p, { pz: this.t.placard });
      } else {
        // End caps (scaled spheres): the shell projected in the cap's own frame.
        b.geometry(m.geometry, p.rel, this.t.shell);
      }
    }
  }

  /** The army truck at the barricade: olive cab with star and stencils, canvas back, glass, chassis, wheels. */
  armyTruck(b: PwBatch, g: THREE.Object3D) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const t = this.t;
    for (const p of partsOf(g)) {
      if (p.glow || p.mesh.userData.pwText) continue;
      const m = p.mesh;
      if (isBox(m)) {
        const d = bp(m);
        if (near(d.width, 2.5) && near(d.height, 2.2)) this.box(b, p, { px: t.armyCab, nx: t.armyCab, pz: t.olive, nz: t.olive, py: t.olive }, { nx: { flipU: true } });
        else if (near(d.depth, 0.06)) this.box(b, p, { pz: t.screen[0] });
        else if (near(d.depth, 5.4)) {
          this.box(b, p, { px: t.canvas, nx: t.canvas, py: t.canvas, nz: t.canvas, pz: t.canvas });
          // The unit's stencil on both sides of the canvas.
          const prev = b.matrix.clone();
          b.setMatrix(prev.clone().multiply(p.rel));
          const st = z3UnitStencil(this.atlas);
          for (const s of [1, -1]) b.rect(V(s * (d.width / 2 + 0.01), -d.height / 2 + 0.25, s * 1.5), V(0, 0, -s), V(0, 1, 0), 3, 1, st);
          b.setMatrix(prev);
        }
        else this.box(b, p, { px: t.black, nx: t.black, pz: t.black, nz: t.black, py: t.black, ny: t.black });
      } else if (isCyl(m)) this.wheel(b, p, false, 1);
    }
    b.setMatrix(null);
  }

  /** The tank guarding the SAFE ZONE. */
  armyTank(b: PwBatch, g: THREE.Object3D) {
    g.updateMatrixWorld(true);
    b.setMatrix(g.matrixWorld);
    const t = this.t;
    for (const p of partsOf(g)) {
      if (p.glow || p.mesh.userData.pwText) continue;
      const m = p.mesh;
      if (isBox(m)) {
        const d = bp(m);
        if (near(d.width, 0.9)) this.box(b, p, { px: t.track, nx: t.track, pz: t.track, nz: t.track, py: t.track });
        else this.box(b, p, { px: t.olive, nx: t.olive, pz: t.olive, nz: t.olive, py: t.olive });
      } else if (isCyl(m)) this.cyl(b, p, t.steel);
    }
    b.setMatrix(null);
  }
}
