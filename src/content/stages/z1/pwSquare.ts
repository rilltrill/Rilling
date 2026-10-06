import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { tintFor, type PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { NEUTRAL_HEX, neutral } from '../../pixelworld/retexture';
import { metalTile } from '../../pixelworld/surfaces';
import { z1SquareTiles, type Z1SquareTiles } from '../../pixelworld/z1square';
import { boxFaces } from './pwDiner';
import type { PwPart } from './setpieces';

/**
 * The town square in ART: PIXEL WORLD (zone E): every mesh town.ts tagged
 * `userData.pwSq` — PRIME MEATS' display windows, doorway, awning, cleaver
 * sign; the kiosks' walls and hatches; the courthouse's windows, door, frieze
 * and clock faces; the bookshop / toyshop windows; the memorial's soldier —
 * is re-emitted with the square's modules (z1square.ts). The butcher's door
 * panels (animated) are painted from their recorded parts.
 */

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const _o = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Z1Square {
  readonly t: Z1SquareTiles;
  private kiosk: PwTile;
  private signMetal: PwTile;
  constructor(atlas: PwAtlas) {
    this.t = z1SquareTiles(atlas);
    this.kiosk = neutral(this.t.kioskWall, NEUTRAL_HEX);
    this.signMetal = metalTile(atlas, { hex: 0x1c1c22, rust: 0.2 });
  }

  /** Paint the tagged square meshes under `zone`; returns the classic meshes replaced. */
  convert(b: PwBatch, zone: THREE.Object3D): THREE.Object3D[] {
    zone.updateMatrixWorld(true);
    const t = this.t;
    const tagged: THREE.Object3D[] = [];
    let butcher: THREE.Object3D | null = null;
    zone.traverse((o) => {
      if (o.userData.pwSq) tagged.push(o);
      if (o.userData.pwButcher) butcher = o;
    });
    const drop: THREE.Object3D[] = [];
    for (const o of tagged) {
      const tag = o.userData.pwSq as string;
      const m = o as THREE.Mesh;
      const p = ((m.geometry as THREE.BoxGeometry | undefined)?.parameters ?? { width: 0, height: 0, depth: 0 }) as THREE.BoxGeometry['parameters'];
      b.setMatrix(o.matrixWorld);
      switch (tag) {
        case 'meatWindow':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.meatWindow });
          break;
        case 'meatDoorway':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.meatDoorway });
          break;
        case 'books':
        case 'toys':
          boxFaces(b, p.width, p.height, p.depth, { pz: tag === 'books' ? t.booksWindow : t.toysWindow });
          break;
        case 'courtWinLit':
        case 'courtWinDark':
          boxFaces(b, p.width, p.height, p.depth, { pz: tag === 'courtWinLit' ? t.courtWinLit : t.courtWinDark });
          break;
        case 'courtDoor':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.courtDoor });
          break;
        case 'frieze':
          boxFaces(b, p.width, p.height, p.depth, { pz: t.frieze, py: t.ashlar, px: t.ashlar, nx: t.ashlar, ny: t.ashlar });
          break;
        case 'awning': {
          // Each canvas strip: its top with the striped canvas (continuous across the strips), its front edge.
          const u0 = (o.position.x + 7) * PW_TPM;
          b.rect(_o.set(-p.width / 2, p.height / 2, p.depth / 2), X, NZ, p.width, p.depth, t.awning, { u0, v0: 0 });
          b.rect(_o.set(-p.width / 2, -p.height / 2, p.depth / 2), X, Y, p.width, p.height, t.awning, { u0, v0: 0 });
          b.rect(_o.set(-p.width / 2, -p.height / 2, -p.depth / 2), X, Z, p.width, p.depth, t.awning, { u0, v0: 0 });
          break;
        }
        case 'kioskBody': {
          const tint = { tintRGB: tintFor(this.kiosk, (m.material as THREE.MeshLambertMaterial).color.getHex()) };
          boxFaces(b, p.width, p.height, p.depth, { px: this.kiosk, nx: this.kiosk, pz: this.kiosk, nz: this.kiosk }, { px: tint, nx: tint, pz: tint, nz: tint });
          break;
        }
        case 'newsHatch':
        case 'coffeeHatch': {
          const h = tag === 'newsHatch' ? t.newsHatch : t.coffeeHatch;
          boxFaces(b, p.width, p.height, p.depth, { px: h, nx: h });
          break;
        }
        case 'clock': {
          // The face cylinder lies along the clock group's z: a square quad with the round dial (cut out at the corners).
          const r = (m.geometry as THREE.CylinderGeometry).parameters.radiusTop;
          b.setMatrix(o.parent!.matrixWorld);
          b.rect(_o.set(-r, -r, 0.06), X, Y, r * 2, r * 2, t.clock);
          break;
        }
        case 'statue': {
          // The bronze soldier as crossed cut-out planes on the plinth's bronze cap.
          b.setMatrix(o.parent!.matrixWorld);
          const w = t.statue.w / PW_TPM;
          const h = t.statue.h / PW_TPM;
          const y0 = 2.6;
          b.rect(_o.set(-w / 2, y0, 0), X, Y, w, h, t.statue);
          b.rect(_o.set(w / 2, y0, 0), NX, Y, w, h, t.statue, { flipU: true });
          b.rect(_o.set(0, y0, w / 2), NZ, Y, w, h, t.statue);
          b.rect(_o.set(0, y0, -w / 2), Z, Y, w, h, t.statue, { flipU: true });
          break;
        }
        case 'cleaver': {
          // The blade sign: its painted faces both sides, metal edges; the classic boxes go.
          b.setMatrix(o.matrixWorld);
          b.rect(_o.set(0.1, -0.7, 2.8), NZ, Y, 2.4, 1.4, t.cleaver);
          b.rect(_o.set(-0.1, -0.7, 0.4), Z, Y, 2.4, 1.4, t.cleaverL);
          for (const c of [...o.children]) o.remove(c);
          continue;
        }
        case 'drop':
          break;
        default:
          continue;
      }
      drop.push(o);
    }
    // PRIME MEATS: white glazed tiles under the windows, the awning's lettered valance.
    if (butcher) {
      const g = butcher as THREE.Object3D;
      b.setMatrix(g.matrixWorld);
      for (const [x0, x1] of [
        [-8, -1.95],
        [1.95, 8],
      ]) b.rect(_o.set(x0, 0, 0.21), X, Y, x1 - x0, 0.64, t.butcherTiles, { u0: 0, v0: 0 });
      b.rect(_o.set(-7, 3.01, 1.7), X, Y, 14, 0.5, t.valance);
    }
    b.setMatrix(null);
    void this.signMetal;
    return drop;
  }

  /** The butcher's door panel (animated group): painted from its recorded parts. `side` mirrors the right leaf. */
  door(b: PwBatch, parts: PwPart[], side: number) {
    for (const part of parts) {
      if (part.tag !== 'door') continue;
      const p = (part.mesh.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(_m.copy(part.rel));
      boxFaces(b, p.width, p.height, p.depth, { pz: this.t.meatDoor, nz: this.t.meatDoor, px: this.t.meatDoor, nx: this.t.meatDoor }, { pz: { flipU: side > 0 }, px: { sub: { x: 0, y: 0, w: 4, h: 102 } }, nx: { sub: { x: 0, y: 0, w: 4, h: 102 } } });
    }
    b.setMatrix(null);
  }
}
