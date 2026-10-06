import * as THREE from 'three';
import type { PwAtlas, PwTile } from '../../pixelworld/atlas';
import { tintFor, type PwBatch } from '../../pixelworld/batch';
import { PW_TPM } from '../../pixelworld/canvas';
import { acUnitModule, doorModule, DOOR_M, drainpipeTile, WINDOW_M, windowModule, type WindowKind } from '../../pixelworld/facade';
import { chainFenceTile } from '../../pixelworld/props';
import { metalTile } from '../../pixelworld/surfaces';
import { z1AlleyTiles, z1GasTiles, z1Graffiti, type Z1AlleyTiles, type Z1GasTiles } from '../../pixelworld/z1alley';
import { boxFaces, cylinder } from './pwDiner';
import type { Z1FacadeExtras } from './pwFacade';
import type { PwPart } from './setpieces';

/**
 * MAIN STREET's small hardware and the back alley in ART: PIXEL WORLD:
 *  - alley walls (`wallDetails`, tagged `pwAlley`): painted windows (boarded /
 *    lit / dark), steel service doors, drainpipes, AC units, fire escapes as
 *    cut-out ironwork and the spray-painted words as graffiti decals;
 *  - dumpsters, bag heaps (crossed cut-outs), the chain-link fence;
 *  - lamp poles and heads, news boxes, the mailbox, the ROAD CLOSED board,
 *    police tape, the bus shelter's lightbox ad;
 *  - the gas station's canopy (fascia, red band, soffit, the lit GAS & GO
 *    logo), its price sign and its pillars (animated: painted in their frames).
 */

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NX = new THREE.Vector3(-1, 0, 0);
const NZ = new THREE.Vector3(0, 0, -1);
const _o = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();

export class Z1Street {
  readonly t: Z1AlleyTiles;
  readonly gas: Z1GasTiles;
  private metal: PwTile;
  private fence: PwTile;
  constructor(
    private atlas: PwAtlas,
    private extras: Z1FacadeExtras,
  ) {
    this.t = z1AlleyTiles(atlas);
    this.gas = z1GasTiles(atlas);
    this.metal = metalTile(atlas, { hex: 0x34363d, rust: 0.5 });
    this.fence = chainFenceTile(atlas, { hex: 0x6a6e74, rust: 0.4 });
  }

  /** Paint a zone's tagged street hardware and alley walls; returns the classic meshes replaced. */
  convert(b: PwBatch, zone: THREE.Object3D): THREE.Object3D[] {
    zone.updateMatrixWorld(true);
    const drop: THREE.Object3D[] = [];
    const walls: THREE.Object3D[] = [];
    const parts: THREE.Mesh[] = [];
    const groups: THREE.Object3D[] = [];
    zone.traverse((o) => {
      if (o.userData.pwWall) walls.push(o);
      if (o.userData.pwPart && (o as THREE.Mesh).isMesh && !o.userData.pwCar && !isCarPart(o)) parts.push(o as THREE.Mesh);
      if (o.userData.pwBags || o.userData.pwFence || o.userData.pwRoadClosed) groups.push(o);
    });
    for (const w of walls) drop.push(...this.wall(b, w));
    for (const m of parts) if (this.part(b, m)) drop.push(m);
    for (const g of groups) {
      b.setMatrix(g.matrixWorld);
      if (g.userData.pwBags) {
        // A heap of bags: crossed cut-out planes over the classic blobs' spot.
        const w = this.t.bags.w / PW_TPM;
        const h = this.t.bags.h / PW_TPM;
        b.rect(_o.set(-w / 2, 0, 0), X, Y, w, h, this.t.bags);
        b.rect(_o.set(w / 2, 0, 0), NX, Y, w, h, this.t.bags, { flipU: true });
        b.rect(_o.set(0, 0, w / 2), NZ, Y, w, h, this.t.bags);
        b.rect(_o.set(0, 0, -w / 2), Z, Y, w, h, this.t.bags, { flipU: true });
      } else if (g.userData.pwFence) {
        // Chain link both ways (cut out), the classic posts stay.
        b.rect(_o.set(-1.8, 0, 0.01), X, Y, 3.6, 2.4, this.fence, { u0: 0, v0: 0 });
        b.rect(_o.set(1.8, 0, -0.01), NX, Y, 3.6, 2.4, this.fence, { u0: 0, v0: 0 });
      } else {
        // ROAD CLOSED: the painted board on both faces.
        b.rect(_o.set(-1.28, -0.3, 0.03), X, Y, 2.56, 0.6, this.t.roadClosed);
        b.rect(_o.set(1.28, -0.3, -0.04), NX, Y, 2.56, 0.6, this.t.roadClosed);
      }
      for (const c of [...g.children]) {
        const m = c as THREE.Mesh;
        // Keep the fence posts (cylinders); everything else of these groups is painted.
        if (g.userData.pwFence && (m.geometry as THREE.CylinderGeometry)?.type === 'CylinderGeometry') continue;
        drop.push(c);
      }
    }
    b.setMatrix(null);
    return drop;
  }

  /** One alley wall (`wallDetails` group): windows, doors, pipes, AC units, fire escapes, graffiti. */
  private wall(b: PwBatch, g: THREE.Object3D): THREE.Object3D[] {
    const a = this.atlas;
    const rec = g.userData.pwWall as { x0: number; x1: number; floors: number; fireEscapes: number[] };
    // (The dark-trim facade style: the alley shares the street's painted windows.)
    const style = { frame: 0x3a3a42, stone: 0x4a4a52 };
    const drop: THREE.Object3D[] = [];
    b.setMatrix(g.matrixWorld);
    for (const c of g.children) {
      const r = c.userData.pwAlley as { kind: string; x: number; y: number; lit?: boolean; boarded?: boolean; h?: number; word?: string; col?: number; size?: number } | undefined;
      if (c.userData.pwFacade === 'alley') {
        drop.push(c);
        continue;
      }
      if (!r) continue;
      switch (r.kind) {
        case 'win': {
          const kind: WindowKind = r.boarded ? 'boarded' : r.lit ? 'dim' : Math.floor(r.x * 7) % 5 === 0 ? 'broken' : 'dark';
          const t = windowModule(a, kind, style, Math.abs(Math.round(r.x)) % 2);
          b.rect(_o.set(r.x - WINDOW_M.w / 2, r.y - WINDOW_M.openY, 0.015), X, Y, WINDOW_M.w, WINDOW_M.h, t);
          break;
        }
        case 'door': {
          const t = doorModule(a, 'metal', { hex: 0x45301f, stone: 0x4a4a52 });
          b.rect(_o.set(r.x - DOOR_M.w / 2, 0, 0.02), X, Y, DOOR_M.w, DOOR_M.h, t);
          break;
        }
        case 'canopy':
          continue;
        case 'pipe':
          b.rect(_o.set(r.x - 0.25, 0, 0.04), X, Y, 0.5, r.h ?? 6, drainpipeTile(a, { hex: 0x3a3c44 }), { u0: 0, v0: 0 });
          break;
        case 'ac':
          b.rect(_o.set(r.x - 0.44, r.y - 0.34, 0.03), X, Y, 28 / PW_TPM, 22 / PW_TPM, acUnitModule(a));
          break;
        case 'graffiti': {
          const t = z1Graffiti(a, r.word ?? 'RUN', r.col ?? 0xc83a8a);
          const k = (r.size ?? 0.45) / 0.44;
          const w = (t.w / PW_TPM) * k;
          const h = (t.h / PW_TPM) * k;
          // Centred like the classic letters, tilted as they were.
          const rz = c.rotation.z;
          _u.set(Math.cos(rz), Math.sin(rz), 0);
          _v.set(-Math.sin(rz), Math.cos(rz), 0);
          _o.set(c.position.x, c.position.y, 0.035).addScaledVector(_u, -w / 2).addScaledVector(_v, -h * 0.62);
          b.rect(_o, _u, _v, w, h, t);
          break;
        }
        case 'drop':
          break;
        default:
          continue;
      }
      drop.push(c);
    }
    for (const fx of rec.fireEscapes ?? []) this.extras.fireEscape(b, rec.floors, fx, 1.2);
    b.setMatrix(null);
    return drop;
  }

  /** A tagged street part (lamp, news box, mailbox, tape, ad, dumpster); false = not ours. */
  private part(b: PwBatch, m: THREE.Mesh): boolean {
    const t = this.t;
    const tag = m.userData.pwPart as string;
    b.setMatrix(m.matrixWorld);
    const p = (m.geometry as THREE.BoxGeometry).parameters;
    const tint = (tile: PwTile) => (tile.neutral !== undefined ? { tintRGB: tintFor(tile, (m.material as THREE.MeshLambertMaterial).color.getHex()) } : {});
    switch (tag) {
      case 'pole': {
        const cg = m.geometry as THREE.CylinderGeometry;
        cylinder(b, (cg.parameters.radiusTop + cg.parameters.radiusBottom) / 2, cg.parameters.height, 6, t.pole, null, 0, cg.parameters.height * PW_TPM);
        return true;
      }
      case 'lampHead':
        boxFaces(b, p.width, p.height, p.depth, { px: t.lampHead, nx: t.lampHead, py: this.metal, pz: this.metal, nz: this.metal }, { nx: { flipU: true } });
        return true;
      case 'newsBox': {
        const o = tint(t.newsFront);
        const mt = tint(this.metal);
        boxFaces(b, p.width, p.height, p.depth, { pz: t.newsFront, px: this.metal, nx: this.metal, nz: this.metal, py: this.metal }, { pz: o, px: mt, nx: mt, nz: mt, py: mt });
        return true;
      }
      case 'mailbox':
        boxFaces(b, p.width, p.height, p.depth, { pz: t.mailbox, nz: t.mailbox, px: t.mailbox, nx: t.mailbox });
        return true;
      case 'tape':
        // A taller painted tape (both faces): POLICE LINE DO NOT CROSS.
        b.rect(_o.set(-p.width / 2, -0.1, 0.006), X, Y, p.width, 6 / PW_TPM, this.gas.tape, { u0: 0, v0: 0 });
        b.rect(_o.set(p.width / 2, -0.1, -0.006), NX, Y, p.width, 6 / PW_TPM, this.gas.tape, { u0: 0, v0: 0 });
        return true;
      case 'adPanel':
        boxFaces(b, p.width, p.height, p.depth, { pz: this.gas.ad, nz: this.gas.ad });
        return true;
      case 'dumpBody': {
        const s = tint(t.dumpSide);
        boxFaces(b, p.width, p.height, p.depth, { pz: t.dumpSide, nz: t.dumpSide, px: t.dumpEnd, nx: t.dumpEnd, py: this.metal }, { pz: s, nz: s, px: s, nx: s, py: tint(this.metal) });
        return true;
      }
      case 'dumpLid':
        boxFaces(b, p.width, p.height, p.depth, { py: t.dumpLid, pz: t.dumpLid, px: t.dumpLid, nx: t.dumpLid, nz: t.dumpLid, ny: t.dumpLid });
        return true;
      case 'drop':
        return true;
      default:
        return false;
    }
  }

  /** The gas station canopy (animated group): fascia, red band, soffit, the GAS & GO logo toward the street. */
  canopy(b: PwBatch, parts: PwPart[]) {
    const g = this.gas;
    for (const part of parts) {
      if ((part.mesh.material as THREE.MeshBasicMaterial).isMeshBasicMaterial || part.tag === 'text') continue;
      const p = (part.mesh.geometry as THREE.BoxGeometry).parameters;
      b.setMatrix(_m.copy(part.rel));
      if (part.tag === 'canopy') {
        boxFaces(b, p.width, p.height, p.depth, { px: g.fascia, nx: g.fascia, pz: g.fascia, nz: g.fascia, ny: g.soffit, py: this.metal });
        // The logo on the street face (+x), centred along it.
        b.rect(_o.set(p.width / 2 + 0.03, -p.height / 2 + 0.05, 3), NZ, Y, 6, 0.75, g.logo);
      } else if (part.tag === 'canopyBand') boxFaces(b, p.width, p.height, p.depth, { px: g.band, nx: g.band, pz: g.band, nz: g.band }, {});
    }
    b.setMatrix(null);
  }

  /** One face of the price sign (its own animated group): the painted lightbox over the glowing classic. */
  price(b: PwBatch) {
    b.rect(_o.set(-1.1, -1.3, 0.035), X, Y, 2.2, 2.4, this.gas.price);
  }

  /** A canopy pillar (crumples when the canopy buckles), painted in its own frame. */
  pillar(b: PwBatch, w: number, h: number, d: number) {
    boxFaces(b, w, h, d, { px: this.gas.pillar, nx: this.gas.pillar, pz: this.gas.pillar, nz: this.gas.pillar }, {});
  }
}

/** Parts tagged inside a car / bus / diner group belong to those converters. */
function isCarPart(o: THREE.Object3D): boolean {
  for (let a: THREE.Object3D | null = o.parent; a; a = a.parent) if (a.userData.pwCar || a.userData.pwBus || a.userData.pwDinerRoot) return true;
  return false;
}
