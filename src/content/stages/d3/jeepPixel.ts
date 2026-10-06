import * as THREE from 'three';
import type { TexName } from '../../kit/Textures';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { kitTile, retexture, type TileRule } from '../../pixelworld/retexture';
import { hazardTile } from '../../pixelworld/surfaces';
import {
  d3CanvasTile, d3EmblemDecal, d3HoodStencil, d3JeepMudTile, d3JeepPaintTile, d3JerryTile, d3MeshTile, d3SteelTile, d3TreadPlateTile, d3TyreTile,
} from '../../pixelworld/d3Jeep';
import { pwDecal } from '../d1/pwShapes';

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

  /** The body (built at the origin, before its leftovers are baked): mud-caked wings, the hood decals. */
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
    const batch = this.paint(b);
    const a = this.atlas;
    // Hood decals: on the raised bonnet panel (1.7 × 0.16 × 1.5 at y 0.98, z −2.35, tilted 0.04).
    const hood = new THREE.Matrix4().makeTranslation(0, 0.98, -2.35).multiply(new THREE.Matrix4().makeRotationX(0.04)).multiply(new THREE.Matrix4().makeTranslation(0, 0.0815, 0));
    batch.withMatrix(hood, () => {
      pwDecal(batch, -0.2, 0, -0.42, 0.3, 0.3, 0, d3EmblemDecal(a));
      pwDecal(batch, 0.05, 0, 0.3, 0.66, 0.11, 0, d3HoodStencil(a, { ink: 0xc8c0a0 }));
    });
    wingMat?.dispose();
  }

  /** Paint the atlas and add every batch's mesh to its group. */
  finish() {
    this.atlas.build();
    for (const { batch, parent } of this.batches) {
      const m = batch.build();
      if (!m) continue;
      m.name = 'pw:d3-jeep';
      parent.add(m);
    }
  }
}
