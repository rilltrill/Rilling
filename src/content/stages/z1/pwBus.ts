import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { roadSign } from '../../pixelworld/signs';
import { z1BusTiles, type Z1BusTiles } from '../../pixelworld/z1bus';
import type { Z1CarTiles } from '../../pixelworld/z1cars';
import { boxFaces, cylinder } from './pwDiner';
import type { PwPart } from './setpieces';

/**
 * The overturned school bus in ART: PIXEL WORLD (an animated group: it rocks,
 * its emergency door blows off). Its parts were recorded before the classic
 * merge (`PW_PARTS`); they are re-emitted here in the group's own frame with
 * the bus modules (z1bus.ts) — the roof panel facing the street, the windowed
 * sides, the windscreen and crushed nose, the rear with its door opening, the
 * door — and `generic` (the stage's Kit-texture rule) for the underbody.
 */

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _o = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Z1Bus {
  readonly t: Z1BusTiles;
  private stop: PwTile;
  constructor(atlas: PwAtlas, private car: Z1CarTiles) {
    this.t = z1BusTiles(atlas);
    this.stop = roadSign(atlas, 'stop').tile;
  }

  /**
   * Emit the recorded parts of the bus body or door group into `b` (group-local).
   * `generic(b, part)` paints anything without a bus module.
   */
  emit(b: PwBatch, parts: PwPart[], generic: (b: PwBatch, p: PwPart) => void) {
    const t = this.t;
    for (const part of parts) {
      const tag = part.tag;
      if (tag === 'window' || tag === 'windshield' || tag === 'text' || tag === 'hatch' || tag === 'hatchGrate' || tag === 'strip' || tag === 'doorGlass' || tag === 'doorBar') continue;
      const m = part.mesh;
      if ((m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) continue;
      b.setMatrix(_m.copy(part.rel));
      const geo = m.geometry as THREE.BoxGeometry;
      const p = geo.parameters;
      switch (tag) {
        case 'body':
          boxFaces(b, p.width, p.height, p.depth, { px: t.side, nx: t.side, pz: t.front, nz: t.rear, py: t.yellow }, { nx: { flipU: true } });
          break;
        case 'roofBand':
          // The roof as the bus lies: u along the bus toward its nose, v up (the bus's local +X).
          b.rect(_o.set(-p.width / 2, p.height / 2, -p.depth / 2), Z, X, p.depth, p.width, t.roof);
          boxFaces(b, p.width, p.height, p.depth, { px: t.yellow, nx: t.yellow, pz: t.yellow, nz: t.yellow });
          break;
        case 'nose':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.nose, px: t.yellow, nx: t.yellow, py: t.yellow });
          break;
        case 'door':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.door, nz: t.yellow, px: t.yellow, nx: t.yellow, py: t.yellow, ny: t.yellow });
          break;
        case 'stop':
          boxFaces(b, p.width, p.height, p.depth, { px: this.stop, nx: this.stop });
          break;
        case 'wheel': {
          const cg = m.geometry as THREE.CylinderGeometry;
          cylinder(b, cg.parameters.radiusTop, cg.parameters.height, 12, this.car.tire, this.car.wheel, 0, 16, true);
          break;
        }
        default:
          b.setMatrix(null);
          generic(b, part);
      }
    }
    b.setMatrix(null);
  }
}
