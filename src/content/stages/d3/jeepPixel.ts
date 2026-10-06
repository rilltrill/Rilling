import * as THREE from 'three';
import type { TexName } from '../../kit/Textures';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { kitTile, retexture, type TileRule } from '../../pixelworld/retexture';
import { hazardTile } from '../../pixelworld/surfaces';
import {
  d3BarTile, d3CanvasTile, d3EmblemDecal, d3HoodMarking, d3JeepMudTile, d3JeepPaintTile, d3JerryTile, d3MeshTile, d3SillTile, d3SteelTile, d3TreadPlateTile, d3TubeTile, d3TyreTile,
} from '../../pixelworld/d3Jeep';
import { pwCylinder, pwDecal, pwPanel } from '../d1/pwShapes';

/**
 * The ranger jeep (first-person view model, and the jeep left on the helipad)
 * in ART: PIXEL WORLD: its own small atlas painted at D3_JEEP_TPM; every
 * static mesh of the body, the gun and the helicopter cabin re-emitted with a
 * painted tile picked by material (olive drab, mud-caked wings, the sand
 * stripe, gunmetal, tyres, diamond plate, canvas, jerry-can red, helicopter
 * white) — the same geometry, so the view is framed exactly as before — plus
 * the park emblem and a stencilled RANGER number on the hood. Glass, lamps,
 * the beacon, the heat-glowing barrel and the muzzle flash stay classic.
 */
/** The last jeep atlas built (the look-dev bench re-paints it to time it). */
export let D3_JEEP_ATLAS: PwAtlas | null = null;

export class D3JeepPixel {
  readonly atlas = new PwAtlas('d3-jeep');
  private batches: { batch: PwBatch; parent: THREE.Object3D }[] = [];
  private rule: TileRule;
  private wing: PwTile;

  constructor() {
    const a = this.atlas;
    const mud = 0x6a5236;
    const olive = d3JeepPaintTile(a, { hex: 0x3e5a3a, primer: 0x8a7a50, steel: 0x8a8c88, mud });
    const oliveDark = d3JeepPaintTile(a, { hex: 0x2c4029, primer: 0x8a7a50, steel: 0x8a8c88, mud, rivets: false });
    const sand = d3JeepPaintTile(a, { hex: 0x8a7a50, primer: 0x5a4c30, steel: 0x8a8c88, mud, rivets: false });
    const oliveGun = d3JeepPaintTile(a, { hex: 0x44552f, primer: 0x8a7a50, steel: 0x8a8c88, mud, rivets: false });
    this.wing = d3JeepMudTile(a, { hex: 0x5a4430, under: 0x2c4029 });
    const splat = d3JeepMudTile(a, { hex: 0x4e3c2a, under: 0x3e5a3a });
    const steel = d3SteelTile(a, { hex: 0x4e5256 });
    const gun = d3SteelTile(a, { hex: 0x34383c });
    const gunDark = d3SteelTile(a, { hex: 0x222326 });
    const frame = d3SteelTile(a, { hex: 0x22262c, calm: true });
    const brass = d3SteelTile(a, { hex: 0xd0b020 });
    const heli = d3JeepPaintTile(a, { hex: 0xc8ccd0, primer: 0x8a8c88, steel: 0x6a6e72, mud: 0x8a8070 });
    const tyre = d3TyreTile(a, { hex: 0x1e2022, mud });
    const grille = d3MeshTile(a, { hex: 0x2a2c2e });
    const plate = d3TreadPlateTile(a, { hex: 0x4a4a42, mud });
    const floor = d3TreadPlateTile(a, { hex: 0x34363a, mud: 0x2a2a2a });
    const seat = d3CanvasTile(a, { hex: 0x5e4e38 });
    const bag = d3CanvasTile(a, { hex: 0x4a5a34 });
    const jerry = d3JerryTile(a, { hex: 0x7a3020 });
    const byHex = new Map<number, PwTile>([
      [0x3e5a3a, olive],
      [0x2c4029, oliveDark],
      [0x8a7a50, sand],
      [0x4e5256, steel],
      [0x1e2022, tyre],
      [0x2a2c2e, grille],
      [0x4e3c2a, splat],
      [0x5e4e38, seat],
      [0x3e3e36, plate],
      [0x7a3020, jerry],
      [0x4a5a34, bag],
      [0x34383c, gun],
      [0x222326, gunDark],
      [0x44552f, oliveGun],
      [0x22262c, frame],
      [0xc8ccd0, heli],
      [0x34363a, floor],
      [0xd0b020, brass],
    ]);
    this.rule = (mat, _nx, ny) => {
      if (mat.userData.d3Wing) return this.wing;
      const hex = (mat as THREE.MeshLambertMaterial).color.getHex();
      const tex = mat.userData.retroTex as TexName | undefined;
      if (tex === 'hazard') return hazardTile(a, {});
      return byHex.get(hex) ?? kitTile(a, tex, hex, ny);
    };
  }

  /** Re-paint `g`'s static meshes into a batch laid in `g`'s own frame (`skip` keeps a mesh classic); returns the batch. */
  paint(g: THREE.Object3D, skip?: (m: THREE.Mesh) => boolean): PwBatch {
    g.updateMatrixWorld(true);
    const b = new PwBatch(this.atlas);
    b.setMatrix(g.matrixWorld.clone().invert());
    retexture(g, b, this.rule, { world: () => false, skip });
    b.setMatrix(null);
    this.batches.push({ batch: b, parent: g });
    return b;
  }

  /**
   * The body (built at the origin, before its leftovers are baked): mud-caked wings, every long
   * steel tube (roll hoop, bull bars) painted round as a tube, the hood's one marking (RANGER 12:
   * no emblem on the hood — at the bottom of the screen all stage it read as a target), the park
   * emblem on the doors instead.
   */
  paintBody(b: THREE.Group) {
    // The wings (the angled boxes over the front wheels) get the caked-mud tile.
    let wingMat: THREE.Material | null = null;
    for (const c of b.children) {
      const m = c as THREE.Mesh;
      const p = (m.geometry as THREE.BoxGeometry | undefined)?.parameters as { width?: number; depth?: number } | undefined;
      if (m.isMesh && p && Math.abs((p.width ?? 0) - 0.36) < 1e-3 && Math.abs((p.depth ?? 0) - 1.2) < 1e-3) {
        wingMat ??= (m.material as THREE.Material).clone();
        wingMat.userData.d3Wing = true;
        m.material = wingMat;
      }
    }
    const tubes = this.takeTubes(b, 0x4e5256);
    const batch = this.paint(b);
    this.tubes(batch, tubes, d3TubeTile(this.atlas, { hex: 0x4e5256, primer: 0x8a8c88 }));
    const a = this.atlas;
    // The hood marking: on the raised bonnet panel (1.7 × 0.16 × 1.5 at y 0.98, z −2.35, tilted 0.04), between the stripes.
    const hood = new THREE.Matrix4().makeTranslation(0, 0.98, -2.35).multiply(new THREE.Matrix4().makeRotationX(0.04)).multiply(new THREE.Matrix4().makeTranslation(0, 0.0815, 0));
    batch.withMatrix(hood, () => pwDecal(batch, 0, 0, -0.38, 0.66, 0.68, 0, d3HoodMarking(a, { ink: 0x9a9478 })));
    // The park emblem on both doors (the side walls' outer faces, x = ±0.975).
    const em = d3EmblemDecal(a);
    for (const sx of [-1, 1]) pwPanel(batch, new THREE.Vector3(sx * 0.977, 1.1, -0.2), new THREE.Vector3(0, 0, sx), new THREE.Vector3(0, 1, 0), 0.36, 0.36, em);
    wingMat?.dispose();
  }

  /** Remove `g`'s long thin cylinders of colour `hex` (tubes), returning their frames (relative to `g`) and sizes. */
  private takeTubes(g: THREE.Object3D, hex: number): { m: THREE.Matrix4; h: number; r0: number; r1: number }[] {
    g.updateMatrixWorld(true);
    const inv = g.matrixWorld.clone().invert();
    const out: { m: THREE.Matrix4; h: number; r0: number; r1: number }[] = [];
    for (const c of [...g.children]) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.geometry.type !== 'CylinderGeometry') continue;
      if ((m.material as THREE.MeshLambertMaterial).color?.getHex() !== hex) continue;
      const p = (m.geometry as THREE.CylinderGeometry).parameters;
      if (p.height < 0.3 || p.radiusTop > 0.08) continue;
      out.push({ m: inv.clone().multiply(m.matrixWorld), h: p.height, r0: p.radiusBottom, r1: p.radiusTop });
      g.remove(m);
    }
    return out;
  }

  private tubes(batch: PwBatch, list: { m: THREE.Matrix4; h: number; r0: number; r1: number }[], tile: PwTile) {
    for (const t of list) batch.withMatrix(t.m, () => pwCylinder(batch, new THREE.Vector3(0, -t.h / 2, 0), new THREE.Vector3(0, t.h / 2, 0), t.r0, t.r1, 10, tile));
  }

  /**
   * The helicopter cabin (its door frame, skid and struts painted as bars / tubes in calm steel,
   * the sill's hazard edge as 8-texel bands laid in the sill's own frame), then the rest as usual.
   */
  paintCabin(c: THREE.Group) {
    const a = this.atlas;
    c.updateMatrixWorld(true);
    const inv = c.matrixWorld.clone().invert();
    const frameHex = 0x22262c;
    const tubes = this.takeTubes(c, frameHex);
    const bars: { m: THREE.Matrix4; s: THREE.Vector3; sill: boolean }[] = [];
    for (const ch of [...c.children]) {
      const m = ch as THREE.Mesh;
      if (!m.isMesh || m.geometry.type !== 'BoxGeometry') continue;
      const mat = m.material as THREE.MeshLambertMaterial;
      const sill = mat.userData.retroTex === 'hazard';
      if (!sill && mat.color?.getHex() !== frameHex) continue;
      const p = (m.geometry as THREE.BoxGeometry).parameters;
      bars.push({ m: inv.clone().multiply(m.matrixWorld), s: new THREE.Vector3(p.width, p.height, p.depth), sill });
      c.remove(m);
    }
    const batch = this.paint(c);
    this.tubes(batch, tubes, d3TubeTile(a, { hex: frameHex, primer: 0x5a5e62 }));
    const bar = d3BarTile(a, { hex: frameHex });
    const sillT = d3SillTile(a);
    for (const b of bars) batch.withMatrix(b.m, () => (b.sill ? this.sill(batch, b.s, sillT) : this.bar(batch, b.s, bar)));
  }

  /** A box bar (centred, size `s`) as four long faces with the bar tile exactly across each face, and its ends. */
  private bar(batch: PwBatch, s: THREE.Vector3, tile: PwTile) {
    const dims = [s.x, s.y, s.z];
    const L = dims.indexOf(Math.max(...dims));
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    const vy = axes[L];
    for (const k of [0, 1, 2]) {
      if (k === L) continue;
      for (const sg of [-1, 1]) {
        const n = axes[k].clone().multiplyScalar(sg);
        const ux = vy.clone().cross(n);
        const across = Math.abs(ux.x) * s.x + Math.abs(ux.y) * s.y + Math.abs(ux.z) * s.z;
        const o = n.clone().multiplyScalar(dims[k] / 2).addScaledVector(ux, -across / 2).addScaledVector(vy, -dims[L] / 2);
        batch.rect(o, ux, vy, across, dims[L], tile, { uScale: 16 / (across * tile.density) });
      }
    }
    // Ends (rarely seen): the core tone.
    for (const sg of [-1, 1]) {
      const n = vy.clone().multiplyScalar(sg);
      const ux = axes[(L + 1) % 3].clone();
      const uy = n.clone().cross(ux);
      const w = dims[(L + 1) % 3];
      const h = dims[(L + 2) % 3];
      batch.rect(n.clone().multiplyScalar(dims[L] / 2).addScaledVector(ux, -w / 2).addScaledVector(uy, -h / 2), ux, uy, w, h, tile, { u0: 4, uScale: 0.01 });
    }
  }

  /** The sill (a box 2.7 long along x): the hazard bands on its top and its inner face, steel elsewhere. */
  private sill(batch: PwBatch, s: THREE.Vector3, tile: PwTile) {
    const steel = d3SteelTile(this.atlas, { hex: 0x22262c, calm: true });
    batch.box(0, 0, 0, s.x, s.y, s.z, { py: tile, pz: tile, nz: steel, px: steel, nx: steel, ny: null });
  }

  /** Paint the atlas and add every batch's mesh to its group. */
  finish() {
    this.atlas.build();
    D3_JEEP_ATLAS = this.atlas;
    for (const { batch, parent } of this.batches) {
      const m = batch.build();
      if (!m) continue;
      m.name = 'pw:d3-jeep';
      parent.add(m);
    }
  }
}
