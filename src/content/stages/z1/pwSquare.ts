import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { tintFor, type PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { NEUTRAL_HEX, neutral } from '../../pixelworld/retexture';
import { metalTile, roofTile } from '../../pixelworld/surfaces';
import { z1SquareTiles, type Z1SquareTiles } from '../../pixelworld/z1square';
import { boxFaces, cylinder } from './pwDiner';
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

/** A flat n-gon disc at height `y` (wrap tile mapped at world density), facing up or down. */
function disc(b: PwBatch, r: number, y: number, seg: number, tile: PwTile, up: boolean) {
  const c = new THREE.Vector3(0, y, 0);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = new THREE.Vector3(Math.sin(a0) * r, y, Math.cos(a0) * r);
    const p1 = new THREE.Vector3(Math.sin(a1) * r, y, Math.cos(a1) * r);
    const uv = (p: THREE.Vector3) => [(p.x + r) * PW_TPM, (p.z + r) * PW_TPM];
    if (up) b.tri(c.clone(), p0, p1, tile, [...uv(c), ...uv(p0), ...uv(p1)]);
    else b.tri(c.clone(), p1, p0, tile, [...uv(c), ...uv(p1), ...uv(p0)]);
  }
}

export class Z1Square {
  readonly t: Z1SquareTiles;
  private kiosk: PwTile;
  private signMetal: PwTile;
  private roof: PwTile;
  constructor(atlas: PwAtlas) {
    this.t = z1SquareTiles(atlas);
    this.kiosk = neutral(this.t.kioskWall, NEUTRAL_HEX);
    this.signMetal = metalTile(atlas, { hex: 0x1c1c22, rust: 0.2 });
    this.roof = roofTile(atlas, { hex: 0x2a2b31 });
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
          // Bills pasted on the three faces without the hatch (the front one under the sign), the evening
          // paper's bundles stacked at the front corner.
          const hatch = o.parent!.children.find((c) => c.userData.pwSq === 'newsHatch' || c.userData.pwSq === 'coffeeHatch');
          const facing = hatch && hatch.position.x < 0 ? -1 : 1;
          // Each kiosk its own sheet of bills, each face a different 80-texel crop of it.
          const sheet = hatch?.userData.pwSq === 'newsHatch' ? t.bills : t.bills2;
          const crop = (x: number) => ({ tint: bt, sub: { x, y: 0, w: 80, h: sheet.h } });
          const bw = 80 / PW_TPM;
          const bh = sheet.h / PW_TPM;
          const hw = p.width / 2 + 0.008;
          const hd = p.depth / 2 + 0.008;
          const y0 = -p.height / 2 + 0.28;
          // (Damp paper in the dark: a shade under full white.)
          const bt = 0xa8a4a0;
          b.rect(_o.set(-bw / 2 - 0.1, y0, hd), X, Y, bw, bh, sheet, crop(0));
          b.rect(_o.set(bw / 2 + 0.15, y0 + 0.1, -hd), NX, Y, bw, bh, sheet, crop(48));
          if (facing > 0) b.rect(_o.set(-hw, y0 - 0.05, -bw / 2 + 0.1), Z, Y, bw, bh, sheet, crop(24));
          else b.rect(_o.set(hw, y0 - 0.05, bw / 2), NZ, Y, bw, bh, sheet, crop(24));
          if (hatch?.userData.pwSq === 'newsHatch') {
            const uw = t.bundle.w / PW_TPM;
            const uh = t.bundle.h / PW_TPM;
            b.rect(_o.set(-p.width / 2 + 0.15, -p.height / 2, hd + 0.2), X, Y, uw, uh, t.bundle);
            b.rect(_o.set(p.width / 2 - 0.2 - uw, -p.height / 2, hd + 0.12), X, Y, uw, uh, t.bundle, { flipU: true });
          }
          break;
        }
        case 'kioskRoof': {
          // Tar-paper top, a painted fascia board with the scalloped tin drip edge all round.
          const green = o.parent!.children.some((c) => c.userData.pwSq === 'newsHatch');
          const f = green ? t.fasciaGreen : t.fasciaRed;
          const v = { u0: 0, v0: 0 };
          boxFaces(b, p.width, p.height, p.depth, { py: this.roof, ny: this.roof, px: f, nx: f, pz: f, nz: f }, { px: v, nx: v, pz: v, nz: v });
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
        case 'bandPost':
          cylinder(b, 0.1, 2.8, 6, t.bandPost, null, 0, t.bandPost.h);
          break;
        case 'bandRail': {
          // The rail (rail space: x along it, y up) becomes a spindle balustrade down to the plinth, seen from both sides.
          const h = 0.83;
          b.rect(_o.set(-1.2, 0.03 - h, 0), X, Y, 2.4, h, t.balustrade);
          b.rect(_o.set(1.2, 0.03 - h, 0), NX, Y, 2.4, h, t.balustrade, { flipU: true });
          break;
        }
        case 'bandRoof':
          // Fish-scale shingles round the edge and over the top.
          cylinder(b, 3.9, 0.3, 8, t.shingles, null, 0, 10);
          disc(b, 3.9, 0.15, 8, t.shingles, true);
          break;
        case 'bandEave': {
          // White eave board, beadboard soffit, and the gingerbread lace hung all round under it.
          cylinder(b, 3.95, 0.12, 8, t.eave, null, 3, 7);
          disc(b, 3.7, -0.06, 8, t.beadboard, false);
          const r = 3.86;
          const y1 = -0.06;
          const y0 = y1 - 12 / PW_TPM;
          let u = 0;
          for (let i = 0; i < 8; i++) {
            const a0 = (i / 8) * Math.PI * 2;
            const a1 = ((i + 1) / 8) * Math.PI * 2;
            const p0 = new THREE.Vector3(Math.sin(a0) * r, y0, Math.cos(a0) * r);
            const p1 = new THREE.Vector3(Math.sin(a1) * r, y0, Math.cos(a1) * r);
            const len = p0.distanceTo(p1) * PW_TPM;
            const q0 = p0.clone().setY(y1);
            const q1 = p1.clone().setY(y1);
            b.quad(p0, p1, q1, q0, t.lace, [u, 0, u + len, 0, u + len, 12, u, 12]);
            b.quad(p1.clone(), p0.clone(), q0.clone(), q1.clone(), t.lace, [u + len, 0, u, 0, u, 12, u + len, 12]);
            u += len;
          }
          break;
        }
        case 'bandCone': {
          // The cupola: shingled cone (ConeGeometry: base at -h/2, apex at +h/2).
          const r = 0.9;
          const h = 1.0;
          const sl = Math.hypot(r, h) * PW_TPM;
          const circ = 2 * Math.PI * r * PW_TPM;
          for (let i = 0; i < 8; i++) {
            const a0 = (i / 8) * Math.PI * 2;
            const a1 = ((i + 1) / 8) * Math.PI * 2;
            const u0 = (i / 8) * circ;
            const u1 = ((i + 1) / 8) * circ;
            b.tri(new THREE.Vector3(Math.sin(a0) * r, -h / 2, Math.cos(a0) * r), new THREE.Vector3(Math.sin(a1) * r, -h / 2, Math.cos(a1) * r), new THREE.Vector3(0, h / 2, 0), t.shingles, [u0, 0, u1, 0, (u0 + u1) / 2, sl]);
          }
          break;
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
