import * as THREE from 'three';
import { PwAtlas } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { Z1_FLATS, type FlatDef } from '../../pixelworld/z1flats';
import { FLAT_TPM } from '../../pixelworld/elevation';
import { PW_TPM } from '../../pixelworld/canvas';
import { sidewalkTile } from '../../pixelworld/surfaces';
import type { PwTile } from '../../pixelworld/atlas';
import {
  DINER_FRONT_H,
  DINER_FRONT_TPM,
  DINER_FRONT_W,
  DINER_SIGN_STRUTS,
  MARQUEE_END_H,
  MARQUEE_BOARD_H,
  MARQUEE_BOARD_W,
  MARQUEE_END_W,
  MARQUEE_H,
  MARQUEE_SOFFIT_H,
  MARQUEE_SOFFIT_W,
  MARQUEE_W,
  paintDinerFront,
  paintDinerSign,
  paintMarqueeBoard,
  paintMarqueeEnd,
  paintMarqueeFace,
  paintMarqueeSoffit,
  type DinerSignLayout,
} from '../../pixelworld/z1dinerflat';
import { BURNT_CAR_H, BURNT_CAR_TPM, BURNT_CAR_W, paintBurntCarFlat } from '../../pixelworld/z1wreck';
import type { ZoneId } from './town';

/**
 * Drawn flats on the set (docs/PIXELWORLD3.md, "Buildings"): where a painted
 * building exists (`pixelworld/z1flats.ts`) its visible meshes go and a flat
 * card takes the facade's place. Nothing here touches gameplay: occluders are
 * the stage's own, the hidden boxes stay, enemies walk the same ground.
 *
 * Staging per flat, chosen by looking at frames from the road and the holds:
 *  - `parallel`: on the old street face;
 *  - `raked`: turned about its far end toward the oncoming camera, like theatre
 *    wings; the near end swings back INSIDE the old footprint, so the flat never
 *    crosses the sidewalk. Saw-tooth across the street's side, and the box's long
 *    converging lines are gone (each tooth is a picture seen more nearly square on);
 *  - `facing`: square to the camera at the end of a street (boss square);
 *  - `end`: a second flat on the box's end wall, square to a cross street (the two
 *    corner buildings at the crossing).
 */

export type FlatStaging = 'parallel' | 'raked' | 'facing';

interface Placement {
  /** Which FlatDef (and the building's identity, its z or x). */
  def: string;
  staging: FlatStaging;
  /** A flat on this box's end wall (world x centre, world z; faces +z, down the street at the player). */
  end?: { def: string; x: number; z: number };
}

/** How far a raked flat is turned (radians). (35 degrees: each wing is seen nearly square on, and even the 22 m hotel's near end stays inside its old 14 m footprint.) */
export const FLAT_RAKE = (35 * Math.PI) / 180;

/** Dev: `&pwflats=parallel` stages every flat on the old street face, `&pwflats=<degrees>` rakes them that much (look-dev). */
const FLAT_MODE = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('pwflats') ?? '';

/** Buildings drawn so far, by the facade centre's world position (rounded x, z). */
const AT: Record<string, Placement> = {
  // East side of Main Street, from the barricade to the burning car.
  '10,5': { def: 'pawn', staging: 'raked' },
  '10,-13': { def: 'laundry', staging: 'raked' },
  '10,-32': { def: 'rialto', staging: 'parallel' }, // (the marquee stands on the old facade, the chase bulbs with it)
  '10,-50': { def: 'boarded', staging: 'raked' },
  '10,-66': { def: 'liquor', staging: 'raked' },
  '10,-81': { def: 'billblock', staging: 'raked' },
  // West side.
  '-9,5': { def: 'hotel', staging: 'raked' },
  '-9,-15': { def: 'cafe', staging: 'raked' },
  '-9,-32': { def: 'w4', staging: 'raked' },
  '-9,-66': { def: 'w6', staging: 'raked' },
  '-9,-81': { def: 'bar', staging: 'raked' },
  // The two corners past the crossing: the street side raked as the rest, the end wall square to the crossing.
  '10,-110': { def: 'cornerE-side', staging: 'raked', end: { def: 'cornerE', x: 16.5, z: -102 } },
  '-9,-110': { def: 'cornerW-side', staging: 'raked', end: { def: 'cornerW', x: -16.5, z: -102 } },
  // The boss square.
  '-58,-304': { def: 'meats', staging: 'facing' },
  '-40,-304': { def: 'bank', staging: 'facing' },
  '-66,-294': { def: 'shutterblock', staging: 'raked' },
  '-78,-304': { def: 'grand', staging: 'facing' },
};

const defs = new Map(Z1_FLATS.map((d) => [d.id, d]));

const _o = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NZ = new THREE.Vector3(0, 0, -1);

/** The flat of a building group, if it has one (keyed by which side of the street it stands on and where). */
function placementOf(g: THREE.Object3D): Placement | null {
  return AT[`${Math.round(g.position.x)},${Math.round(g.position.z)}`] ?? null;
}

export class Z1Flats {
  readonly atlas = new PwAtlas('z1-flats', { upscale: false, skyline: true });
  private batches = new Map<ZoneId, PwBatch>();
  /** The diner's front and sign: their light is painted on, so no local lamp bands them (one extra draw call in that zone). */
  private ownLight = new Map<ZoneId, PwBatch>();
  private tiles = new Map<string, PwTile>();
  /** Old facade stretches of the flats that were swung back: wall light decals there have nothing to land on. */
  private swung: { x: number; z0: number; z1: number }[] = [];

  /** Did a flat swing back from this point of its old facade (x, z)? */
  swungAt(x: number, z: number): boolean {
    return this.swung.some((s) => Math.abs(s.x - x) < 0.7 && z >= s.z0 && z <= s.z1);
  }

  /** Is this building group drawn as a flat? */
  has(g: THREE.Object3D): boolean {
    return placementOf(g) !== null;
  }

  private batch(id: ZoneId): PwBatch {
    let b = this.batches.get(id);
    if (!b) this.batches.set(id, (b = new PwBatch(this.atlas)));
    return b;
  }

  private ownLightBatch(id: ZoneId): PwBatch {
    let b = this.ownLight.get(id);
    if (!b) this.ownLight.set(id, (b = new PwBatch(this.atlas)));
    return b;
  }

  /** Stage one building: drop its visible meshes, lay its flat (and cards), rake it, floor what opened up. */
  stage(id: ZoneId, g: THREE.Object3D, ground: PwBatch, sidewalkAtlas: PwAtlas) {
    const p = placementOf(g)!;
    const def = defs.get(p.def)!;
    const rec = g.userData.pwBuilding as { w: number };
    const b = this.batch(id);
    // Everything visible goes but the signs (kept: they ride with the flat and are painted as cards).
    for (const c of [...g.children]) if (!c.userData.pwSign && !c.userData.pwSq) g.remove(c);
    // Near end +z. East side (rot −90°): local +x is the near end; west side (rot +90°): local −x.
    // (The square's west-side block faces east: its far end is local +x like the street's west side.)
    const east = g.position.x > 0;
    const farLocalX = east ? -rec.w / 2 : rec.w / 2;
    const numeric = FLAT_MODE && !Number.isNaN(Number(FLAT_MODE));
    const staging: FlatStaging = FLAT_MODE === 'parallel' ? 'parallel' : p.staging;
    const rake = numeric ? (Number(FLAT_MODE) * Math.PI) / 180 : FLAT_RAKE;
    if (staging === 'raked') {
      g.updateMatrix();
      const pivot = new THREE.Vector3(farLocalX, 0, 0).applyMatrix4(g.matrix);
      const oldNear = new THREE.Vector3(-farLocalX, 0, 0).applyMatrix4(g.matrix);
      const yaw = (east ? 1 : -1) * rake;
      const rel = g.position.clone().sub(pivot).applyAxisAngle(Y, yaw);
      g.position.copy(pivot).add(rel);
      g.rotation.y += yaw;
      g.updateMatrix();
      const near = new THREE.Vector3(-farLocalX, 0, 0).applyMatrix4(g.matrix);
      // The sidewalk that opens up in front of the swung-back flat.
      this.wedge(ground, sidewalkAtlas, pivot, near, oldNear);
      this.swung.push({ x: pivot.x, z0: Math.min(pivot.z, oldNear.z), z1: Math.max(pivot.z, oldNear.z) });
    }
    g.updateMatrixWorld(true);
    this.lay(b, g, def);
    if (p.end) this.end(b, p.end);
  }

  private tile(key: string, tw: number, th: number, paint: import('../../pixelworld/atlas').PwPainter, density = FLAT_TPM) {
    let t = this.tiles.get(key);
    if (!t) this.tiles.set(key, (t = this.atlas.tile(`flat|${key}`, tw, th, paint, { upscale: false, density })));
    return t;
  }

  private lay(b: PwBatch, g: THREE.Object3D, def: FlatDef) {
    const tMain = this.tile(def.reuse ?? def.id, def.tw, def.th, def.paint);
    const wm = def.tw / FLAT_TPM;
    const hm = def.th / FLAT_TPM;
    b.setMatrix(g.matrixWorld);
    b.rect(_o.set(-wm / 2 + (def.xOffset ?? 0), 0, 0), X, Y, wm, hm, tMain, { tint: def.tint });
    for (const c of def.cards ?? []) {
      const t = this.tile(`${def.id}-${c.id}`, c.tw, c.th, c.paint);
      const cw = c.tw / FLAT_TPM;
      const ch = c.th / FLAT_TPM;
      b.rect(_o.set(c.x - cw / 2, c.y, c.z), X, Y, cw, ch, t);
    }
    b.setMatrix(null);
  }

  /** A flat on a box's end wall, square to the crossing (world position; faces +z). */
  private end(b: PwBatch, e: { def: string; x: number; z: number }) {
    const def = defs.get(e.def)!;
    const t = this.tile(def.id, def.tw, def.th, def.paint);
    const wm = def.tw / FLAT_TPM;
    const hm = def.th / FLAT_TPM;
    b.rect(_o.set(e.x - wm / 2, 0, e.z), X, Y, wm, hm, t);
    for (const c of def.cards ?? []) {
      const ct = this.tile(`${def.id}-${c.id}`, c.tw, c.th, c.paint);
      const cw = c.tw / FLAT_TPM;
      const ch = c.th / FLAT_TPM;
      b.rect(_o.set(e.x + c.x - cw / 2, c.y, e.z + c.z), X, Y, cw, ch, ct);
    }
  }

  /** Floor a triangle of old footprint at kerb height (the sidewalk's own tile). */
  private wedge(ground: PwBatch, atlas: PwAtlas, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    const pa = a.clone().setY(0.145);
    const pb = b.clone().setY(0.145);
    const pc = c.clone().setY(0.145);
    const t = sidewalkTile(atlas, { hex: 0x56575d });
    const d = t.density;
    const uvs = [pa, pb, pc].flatMap((v) => [v.x * d, -v.z * d]);
    // (Winding so the triangle's face points up, whichever way round the three points come.)
    const up = pb.clone().sub(pa).cross(pc.clone().sub(pa)).y > 0;
    if (up) ground.tri(pa, pb, pc, t, uvs);
    else ground.tri(pa, pc, pb, t, [uvs[0], uvs[1], uvs[4], uvs[5], uvs[2], uvs[3]]);
  }

  /** The diner as a cut-out front: the classic front's bands go, holes are left where the glass and the door are. */
  stageDiner(id: ZoneId, g: THREE.Object3D) {
    const b = this.ownLightBatch(id);
    g.updateMatrixWorld(true);
    const t = this.tile('diner-front', DINER_FRONT_W, DINER_FRONT_H, paintDinerFront, DINER_FRONT_TPM);
    b.setMatrix(g.matrixWorld);
    b.rect(_o.set(-9.25, 0, 0.18), X, Y, DINER_FRONT_W / DINER_FRONT_TPM, DINER_FRONT_H / DINER_FRONT_TPM, t);
    b.setMatrix(null);
  }

  /** The "Diner" sign's sheet (its board frame `s`): on the same footing as the front it stands on, its halo painted. */
  stageDinerSign(id: ZoneId, s: THREE.Object3D, l: DinerSignLayout, cyan: number, pink: number) {
    const b = this.ownLightBatch(id);
    s.updateMatrixWorld(true);
    const t = this.tile(`diner-sign-${l.w}x${l.h}`, l.w, l.h + DINER_SIGN_STRUTS, paintDinerSign(l, cyan, pink), PW_TPM);
    b.setMatrix(s.matrixWorld);
    b.rect(_o.set(-l.w / 2 / PW_TPM, -l.h / 2 / PW_TPM - DINER_SIGN_STRUTS / PW_TPM, 0.01), X, Y, l.w / PW_TPM, (l.h + DINER_SIGN_STRUTS) / PW_TPM, t);
    b.setMatrix(null);
  }

  /** The burning car as a drawn flat (`g`: the car group, its meshes dropped): the card stands just behind the fire, square to the road. */
  stageBurntCar(id: ZoneId, g: THREE.Object3D) {
    const b = this.batch(id);
    const t = this.tile('burnt-car', BURNT_CAR_W, BURNT_CAR_H, paintBurntCarFlat, BURNT_CAR_TPM);
    const w = BURNT_CAR_W / BURNT_CAR_TPM;
    const h = BURNT_CAR_H / BURNT_CAR_TPM;
    // (Yaw from the road's centreline a car length before it: the card is seen nearly square on from where the beat is played.)
    const yaw = -0.21;
    const ux = Math.cos(yaw);
    const uz = -Math.sin(yaw);
    const cx = g.position.x + Math.sin(yaw) * -0.6;
    const cz = g.position.z + Math.cos(yaw) * -0.6;
    b.rect(_o.set(cx - (ux * w) / 2, -0.03, cz - (uz * w) / 2), new THREE.Vector3(ux, 0, uz), Y, w, h, t);
  }

  /** The marquee as three drawn cards: a shaped face, a painted soffit under it, a flared end. `s` is the marquee group (the box front is at z 3.2). */
  stageMarquee(id: ZoneId, s: THREE.Object3D) {
    const b = this.batch(id);
    s.updateMatrixWorld(true);
    b.setMatrix(s.matrixWorld);
    const fw = MARQUEE_W / FLAT_TPM;
    const fh = MARQUEE_H / FLAT_TPM;
    b.rect(_o.set(-fw / 2, -fh / 2 - 0.1, 3.24), X, Y, fw, fh, this.tile('marquee-face', MARQUEE_W, MARQUEE_H, paintMarqueeFace));
    // Soffit: the underside, facing the street below; the wall end warm, the front end lit by the street.
    const sw = MARQUEE_SOFFIT_W / FLAT_TPM;
    const sd = MARQUEE_SOFFIT_H / FLAT_TPM;
    b.rect(_o.set(-sw / 2, -0.85, 0.02), X, Z, sw, sd, this.tile('marquee-soffit', MARQUEE_SOFFIT_W, MARQUEE_SOFFIT_H, paintMarqueeSoffit));
    // Ends: flared wings against the wall (near end is seen coming up the road).
    const ew = MARQUEE_END_W / FLAT_TPM;
    const eh = MARQUEE_END_H / FLAT_TPM;
    // The lettered board, panelled; a dropped panel hangs below the classic board's line.
    const bw = MARQUEE_BOARD_W / FLAT_TPM;
    const bh = MARQUEE_BOARD_H / FLAT_TPM;
    b.rect(_o.set(-bw / 2, 0.5625 - bh, 3.29), X, Y, bw, bh, this.tile('marquee-board', MARQUEE_BOARD_W, MARQUEE_BOARD_H, paintMarqueeBoard, PW_TPM));
    const end = this.tile('marquee-end', MARQUEE_END_W, MARQUEE_END_H, paintMarqueeEnd);
    b.rect(_o.set(7.05, -eh / 2 - 0.1, 3.2), NZ, Y, ew, eh, end);
    b.rect(_o.set(-7.05, -eh / 2 - 0.1, 0), Z, Y, ew, eh, end, { flipU: true });
    b.setMatrix(null);
  }

  /** Build the flats' meshes (one draw call a zone) after the atlas is painted. */
  finish(zones: Record<ZoneId, THREE.Group>, gain: (id: ZoneId) => number) {
    this.atlas.build();
    for (const [id, b] of this.batches) {
      const mesh = b.build(undefined, { gain: gain(id) });
      if (mesh) zones[id].add(mesh);
    }
    for (const [id, b] of this.ownLight) {
      const mesh = b.build(undefined, { gain: gain(id), noLocal: true });
      if (mesh) zones[id].add(mesh);
    }
  }
}
