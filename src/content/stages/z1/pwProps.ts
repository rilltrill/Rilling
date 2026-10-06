import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { stoneTile } from '../../pixelworld/surfaces';
import { z1PropTiles, type Z1PropTiles } from '../../pixelworld/z1props';
import { boxFaces, cylinder } from './pwDiner';

/**
 * MAIN STREET's small furniture in ART: PIXEL WORLD (z1/pixel.ts calls this per
 * zone, before the generic re-texture): everything town.ts / props.ts tagged
 * `userData.pwProp` is painted as cut-out silhouettes on its faces instead of
 * re-textured boxes — benches, sawhorses, crates, the square's lamp posts and
 * globes (glowing cards), the fountain, the memorial plinth, the courthouse
 * pediment (a gable with its tympanum in place of the classic pyramid), the
 * floodlight's lens, the bandstand's stone base. Scenery only: none of these is
 * an occluder, a hit proxy or walkable.
 */

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const _o = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();

/** A flat n-gon disc at height `y` (wrap tile at world density), facing up. */
function disc(b: PwBatch, r: number, y: number, seg: number, tile: PwTile) {
  const c = new THREE.Vector3(0, y, 0);
  const uv = (p: THREE.Vector3) => [(p.x + r) * PW_TPM, (p.z + r) * PW_TPM];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = new THREE.Vector3(Math.sin(a0) * r, y, Math.cos(a0) * r);
    const p1 = new THREE.Vector3(Math.sin(a1) * r, y, Math.cos(a1) * r);
    b.tri(c.clone(), p0, p1, tile, [...uv(c), ...uv(p0), ...uv(p1)]);
  }
}

export class Z1Props {
  readonly t: Z1PropTiles;
  private stone: PwTile;
  constructor(private atlas: PwAtlas) {
    this.t = z1PropTiles(atlas);
    this.stone = stoneTile(atlas, { hex: 0x86827a });
  }

  /** Paint the tagged props under `zone`; returns the classic meshes they replace. */
  convert(b: PwBatch, zone: THREE.Object3D): THREE.Object3D[] {
    zone.updateMatrixWorld(true);
    const found: THREE.Object3D[] = [];
    zone.traverse((o) => {
      if (o.userData.pwProp) found.push(o);
    });
    const drop: THREE.Object3D[] = [];
    const t = this.t;
    for (const o of found) {
      const kind = o.userData.pwProp as string;
      b.setMatrix(o.matrixWorld);
      switch (kind) {
        case 'bench': {
          // Front / back through the middle (the silhouette both ways), the ends, the seat from above.
          b.rect(_o.set(-0.9, 0, 0.02), X, Y, 1.8, 0.85, t.benchFront);
          b.rect(_o.set(0.9, 0, -0.02), NX, Y, 1.8, 0.85, t.benchFront, { flipU: true });
          b.rect(_o.set(0.88, 0, 0.25), NZ, Y, 0.5, 0.85, t.benchEnd);
          b.rect(_o.set(-0.88, 0, -0.25), Z, Y, 0.5, 0.85, t.benchEnd, { flipU: true });
          b.rect(_o.set(-0.9, 0.49, 0.22), X, NZ, 1.8, 0.44, t.benchTop);
          drop.push(...o.children);
          break;
        }
        case 'sawhorse': {
          b.rect(_o.set(-1.2, 0, 0.03), X, Y, 2.4, 1.2, t.sawFront);
          b.rect(_o.set(1.2, 0, -0.03), NX, Y, 2.4, 1.2, t.sawFront);
          for (const sx of [-1, 1]) {
            b.rect(_o.set(sx * 1.1, 0, sx * 0.31), sx > 0 ? NZ : Z, Y, 0.62, 1.2, t.sawEnd);
            b.rect(_o.set(sx * 1.1, 0, -sx * 0.31), sx > 0 ? Z : NZ, Y, 0.62, 1.2, t.sawEnd);
          }
          drop.push(...o.children);
          break;
        }
        case 'crate': {
          const s = (o.userData.pwSize as number) ?? 0.8;
          b.setMatrix(_m.copy(o.matrixWorld).multiply(_m2.makeTranslation(0, s / 2, 0)));
          boxFaces(b, s, s, s, { pz: t.crate, nz: t.crate, px: t.cratePlain, nx: t.cratePlain, py: t.cratePlain });
          drop.push(...o.children);
          break;
        }
        case 'sqLamp': {
          // The cast-iron post and its arm, the globes as glowing cards (three planes each: round from any side).
          b.setMatrix(_m.copy(o.matrixWorld).multiply(_m2.makeTranslation(0, 2.1, 0)));
          cylinder(b, 0.11, 4.2, 6, t.post, null, 0, 4.2 * PW_TPM);
          b.setMatrix(_m.copy(o.matrixWorld).multiply(_m2.makeTranslation(0, 4.2, 0)));
          boxFaces(b, 1.2, 0.08, 0.08, { pz: t.post, nz: t.post, py: t.post, ny: t.post });
          b.setMatrix(o.matrixWorld);
          for (const [gx, gy, gs] of [
            [-0.6, 4.45, 0.75],
            [0.6, 4.45, 0.75],
            [0, 4.75, 0.85],
          ] as const) {
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * Math.PI;
              _u.set(Math.cos(a), 0, -Math.sin(a));
              b.rect(_o.set(gx, gy - gs / 2, 0).addScaledVector(_u, -gs / 2), _u, Y, gs, gs, t.globe);
            }
          }
          drop.push(...o.children);
          break;
        }
        case 'fountain': {
          const at = (y: number) => b.setMatrix(_m.copy(o.matrixWorld).multiply(_m2.makeTranslation(0, y, 0)));
          at(0.35);
          cylinder(b, 3.25, 0.7, 16, t.basin, null, 32 - 0.7 * PW_TPM, 32);
          b.setMatrix(o.matrixWorld);
          disc(b, 3.3, 0.7, 16, this.stone);
          disc(b, 2.9, 0.715, 16, t.water);
          at(1.4);
          cylinder(b, 0.6, 1.6, 10, t.column, null, 0, 1.6 * PW_TPM);
          at(2.2);
          cylinder(b, 1.3, 0.3, 12, t.basin, null, 32 - 0.3 * PW_TPM, 32);
          b.setMatrix(o.matrixWorld);
          disc(b, 1.3, 2.35, 12, this.stone);
          disc(b, 1.12, 2.36, 12, t.water);
          at(2.8);
          cylinder(b, 0.25, 1.0, 8, t.column, null, 0, 32, true);
          drop.push(...o.children);
          break;
        }
        case 'plinth': {
          const m = o as THREE.Mesh;
          const p = (m.geometry as THREE.BoxGeometry).parameters;
          boxFaces(b, p.width, p.height, p.depth, { pz: t.plinth, nz: t.plinth, px: t.plinth, nx: t.plinth, py: this.stone });
          drop.push(o);
          break;
        }
        case 'pediment': {
          // A proper gable on the portico's frieze (14 m, 2.2 m high, 4 m deep): the tympanum, two raking slopes.
          b.setMatrix(o.parent!.matrixWorld);
          b.rect(_o.set(-7, 7.6, 4.02), X, Y, 14, 2.2, t.tympanum);
          const A = new THREE.Vector3(-7, 7.6, 4);
          const B = new THREE.Vector3(0, 9.8, 4);
          const C = new THREE.Vector3(0, 9.8, 0);
          const D = new THREE.Vector3(-7, 7.6, 0);
          const L = Math.hypot(7, 2.2) * PW_TPM;
          b.quad(A, B, C, D, this.stone, [0, 0, L, 0, L, 128, 0, 128]);
          b.quad(new THREE.Vector3(7, 7.6, 4), new THREE.Vector3(7, 7.6, 0), new THREE.Vector3(0, 9.8, 0), new THREE.Vector3(0, 9.8, 4), this.stone, [0, 0, 128, 0, 128, L, 0, L]);
          drop.push(o);
          break;
        }
        case 'flood': {
          const m = o as THREE.Mesh;
          const p = (m.geometry as THREE.BoxGeometry).parameters;
          boxFaces(b, p.width, p.height, p.depth, { pz: t.flood, nz: t.flood });
          drop.push(o);
          break;
        }
        case 'bandBase': {
          cylinder(b, 3.85, 0.8, 8, t.basin, null, 32 - 0.8 * PW_TPM, 32);
          disc(b, 3.85, 0.4, 8, this.stone);
          drop.push(o);
          break;
        }
      }
    }
    b.setMatrix(null);
    void this.atlas;
    return drop;
  }
}
