import * as THREE from 'three';
import type { TexName } from '../../kit/Textures';
import { PwAtlas, type PwTile } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { kitTile, retexture, type TileRule } from '../../pixelworld/retexture';
import { fabricTile, grateTile, planksTile } from '../../pixelworld/surfaces';
import { d1EmblemDecal, d1HoodStencil, d1HoodStripeDecal, d1JeepMudTile, d1JeepPaintTile, d1JerryTile, d1SteelTile, d1TreadPlateTile, d1TubeTile } from '../../pixelworld/d1Jeep';
import { d1TreadTile } from '../../pixelworld/d1Props';
import { pwCylinder, pwDecal } from './pwShapes';

/**
 * The park jeep (first-person view model) in ART: PIXEL WORLD: its own small
 * atlas painted at JEEP_TPM; the body and gun meshes are re-emitted with
 * painted tiles by material (olive drab, khaki, mud, steel, tread, diamond
 * plate, canvas, jerry-can red) — the same geometry, so the view is framed
 * exactly as before — plus the emblem and a stencilled number as decals on the
 * hood. The windscreen glass, lamps and the heat-glowing barrel stay classic.
 */
export class D1JeepPixel {
  readonly atlas = new PwAtlas('d1-jeep');
  private body: PwBatch;
  private kick: PwBatch;
  private mount: PwBatch;
  private rule: TileRule;

  constructor() {
    const a = this.atlas;
    this.body = new PwBatch(a);
    this.kick = new PwBatch(a);
    this.mount = new PwBatch(a);
    const mud = 0x8a6e48;
    const olive = d1JeepPaintTile(a, { hex: 0x4e6a40, primer: 0xb8a070, steel: 0x8a8c88, mud });
    const khaki = d1JeepPaintTile(a, { hex: 0xc8ac70, primer: 0x8a7a50, steel: 0x8a8c88, mud, rivets: false });
    const oliveGun = d1JeepPaintTile(a, { hex: 0x4a5a34, primer: 0xb8a070, steel: 0x8a8c88, mud, rivets: false });
    const wing = d1JeepMudTile(a, { hex: 0x6a5a3a, under: 0x5a5c3a });
    const splat = d1JeepMudTile(a, { hex: mud, under: 0x4e6a40 });
    const steel = d1SteelTile(a, { hex: 0x5e6264 });
    const dark = d1SteelTile(a, { hex: 0x2c3032 });
    const hoop = d1SteelTile(a, { hex: 0x5a6a48 });
    const tread = d1TreadTile(a, { hex: 0x262826, mud });
    const plate = d1TreadPlateTile(a, { hex: 0x5a5a52, mud });
    const jerry = d1JerryTile(a, { hex: 0x9a2c1a });
    const seat = fabricTile(a, { hex: 0x7a5a3c });
    const grille = grateTile(a, { hex: 0x2a2e2c });
    const crate = planksTile(a, { hex: 0x4a5a34, horizontal: true });
    const byHex = new Map<number, PwTile>([
      [0x4e6a40, olive],
      [0xc8ac70, khaki],
      [0x5a5c3a, wing],
      [0x8a6e48, splat],
      [0x262826, tread],
      [0x5e6264, steel],
      [0x5a6a48, hoop],
      [0x30343a, steel],
      [0x1c1d20, dark],
      [0x9a2c1a, jerry],
      [0x7a5a3c, seat],
      [0x4a4a40, plate],
    ]);
    this.rule = (mat, _nx, ny) => {
      const hex = (mat as THREE.MeshLambertMaterial).color.getHex();
      const tex = mat.userData.retroTex as TexName | undefined;
      if (hex === 0x2a2e2c) return tex === 'grate' ? grille : dark;
      if (hex === 0x4a5a34) return tex === 'planks' ? crate : oliveGun;
      return byHex.get(hex) ?? kitTile(a, tex, hex, ny);
    };
  }

  /** Re-paint the jeep body group (before it is merged); the emblem discs become a decal. */
  paintBody(b: THREE.Group) {
    b.updateMatrixWorld(true);
    // The emblem's two flat discs → one painted decal.
    for (const c of [...b.children]) {
      const m = c as THREE.Mesh;
      const hex = m.isMesh ? (m.material as THREE.MeshLambertMaterial).color?.getHex() : -1;
      if (m.isMesh && m.geometry.type === 'CylinderGeometry' && (hex === 0xf4c43a || hex === 0xe0401a) && m.position.y > 0.9) b.remove(m);
    }
    // The roll hoop tubes: painted round as tubes (a highlight along the top, a dark underside,
    // chips at irregular spacing, rust at the welds) instead of a planar-projected steel texture.
    const a = this.atlas;
    // (The front roll bar and the bull bars too: every long tube of the body.)
    const tubes = new Map<number, PwTile>([
      [0x5a6a48, d1TubeTile(a, { hex: 0x5a6a48, primer: 0xb8a070 })],
      [0x2a2e2c, d1TubeTile(a, { hex: 0x34383a, primer: 0x8a8c88 })],
      [0x5e6264, d1TubeTile(a, { hex: 0x5e6264, primer: 0xa8aaa6 })],
    ]);
    const inv = b.matrixWorld.clone().invert();
    for (const c of [...b.children]) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.geometry.type !== 'CylinderGeometry') continue;
      const tube = tubes.get((m.material as THREE.MeshLambertMaterial).color?.getHex());
      const p = (m.geometry as THREE.CylinderGeometry).parameters;
      if (!tube || p.height < 0.3 || p.radiusTop > 0.06) continue;
      this.body.withMatrix(inv.clone().multiply(m.matrixWorld), () => pwCylinder(this.body, new THREE.Vector3(0, -p.height / 2, 0), new THREE.Vector3(0, p.height / 2, 0), p.radiusBottom, p.radiusTop, 10, tube));
      b.remove(m);
    }
    retexture(b, this.body, this.rule, { world: () => false });
    const m = new THREE.Matrix4().makeRotationX(0.04);
    this.body.withMatrix(new THREE.Matrix4().makeTranslation(0.42, 0.937, -1.95).multiply(m), () => pwDecal(this.body, 0, 0, 0, 0.42, 0.42, 0, d1EmblemDecal(a)));
    this.body.withMatrix(new THREE.Matrix4().makeTranslation(-0.45, 0.937, -1.62).multiply(m), () => pwDecal(this.body, 0, 0, 0, 0.6, 0.1, 0, d1HoodStencil(a, { ink: 0x3a4a2a })));
    // The centre stripe worn: chips, scratches, mud flung back from the bull bar.
    this.body.withMatrix(new THREE.Matrix4().makeTranslation(0, 0.957, -1.72).multiply(m), () => pwDecal(this.body, 0, 0, 0, 0.26, 1.05, 0, d1HoodStripeDecal(a, { hex: 0x46603a, primer: 0xb8a070, mud: 0x8a6e48 })));
  }

  /** Re-paint the gun (the kick group's parts in its own frame, the pedestal in the mount's); `keep` stays classic. */
  paintGun(mount: THREE.Group, kick: THREE.Group, keep: THREE.Mesh[]) {
    mount.updateMatrixWorld(true);
    this.kick.setMatrix(kick.matrixWorld.clone().invert());
    retexture(kick, this.kick, this.rule, { world: () => false, skip: (m) => keep.includes(m) });
    this.kick.setMatrix(null);
    this.mount.setMatrix(mount.matrixWorld.clone().invert());
    retexture(mount, this.mount, this.rule, { world: () => false, skip: (m) => m.parent !== mount });
    this.mount.setMatrix(null);
  }

  /** Paint the atlas, add the meshes to their groups. */
  finish(body: THREE.Object3D, mount: THREE.Object3D, kick: THREE.Object3D) {
    this.atlas.build();
    for (const [b, parent] of [[this.body, body], [this.mount, mount], [this.kick, kick]] as [PwBatch, THREE.Object3D][]) {
      const m = b.build();
      if (m) {
        m.name = 'pw:d1-jeep';
        parent.add(m);
      }
    }
  }
}
