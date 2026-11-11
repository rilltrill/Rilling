import * as THREE from 'three';
import { PwAtlas } from '../../pixelworld/atlas';
import { PwBatch } from '../../pixelworld/batch';
import { Z1_FLATS, type FlatDef } from '../../pixelworld/z1flats';
import { FLAT_PAD, FLAT_TPM } from '../../pixelworld/elevation';
import { sidewalkTile } from '../../pixelworld/surfaces';
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
 *  - `facing`: square to the camera at the end of a street (boss square).
 */

export type FlatStaging = 'parallel' | 'raked' | 'facing';

interface Placement {
  /** Which FlatDef (and the building's identity, its z or x). */
  def: string;
  staging: FlatStaging;
}

/** How far a raked flat is turned (radians). */
export const FLAT_RAKE = (25 * Math.PI) / 180;

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
  // The boss square.
  '-58,-304': { def: 'meats', staging: 'facing' },
  '-40,-304': { def: 'bank', staging: 'facing' },
  '-66,-294': { def: 'shutterblock', staging: 'raked' },
};

const defs = new Map(Z1_FLATS.map((d) => [d.id, d]));

const _o = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

/** The flat of a building group, if it has one (keyed by which side of the street it stands on and where). */
function placementOf(g: THREE.Object3D): Placement | null {
  return AT[`${Math.round(g.position.x)},${Math.round(g.position.z)}`] ?? null;
}

export class Z1Flats {
  readonly atlas = new PwAtlas('z1-flats', { upscale: false });
  private batches = new Map<ZoneId, PwBatch>();
  private tiles = new Map<string, import('../../pixelworld/atlas').PwTile>();

  /** Is this building group drawn as a flat? */
  has(g: THREE.Object3D): boolean {
    return placementOf(g) !== null;
  }

  private batch(id: ZoneId): PwBatch {
    let b = this.batches.get(id);
    if (!b) this.batches.set(id, (b = new PwBatch(this.atlas)));
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
    if (p.staging === 'raked') {
      g.updateMatrix();
      const pivot = new THREE.Vector3(farLocalX, 0, 0).applyMatrix4(g.matrix);
      const yaw = (east ? 1 : -1) * FLAT_RAKE;
      const rel = g.position.clone().sub(pivot).applyAxisAngle(Y, yaw);
      g.position.copy(pivot).add(rel);
      g.rotation.y += yaw;
      // The sidewalk that opens up in front of the swung-back flat.
      const nearS = new THREE.Vector3(-farLocalX, 0, 0);
      g.updateMatrix();
      this.wedge(ground, sidewalkAtlas, g.matrix, pivot, nearS);
    }
    g.updateMatrixWorld(true);
    this.lay(b, g, def);
  }

  private tile(key: string, tw: number, th: number, paint: import('../../pixelworld/atlas').PwPainter) {
    let t = this.tiles.get(key);
    if (!t) this.tiles.set(key, (t = this.atlas.tile(`flat|${key}`, tw, th, paint, { upscale: false, density: FLAT_TPM })));
    return t;
  }

  private lay(b: PwBatch, g: THREE.Object3D, def: FlatDef) {
    const tMain = this.tile(def.id, def.tw, def.th, def.paint);
    const wm = def.tw / FLAT_TPM;
    const hm = def.th / FLAT_TPM;
    b.setMatrix(g.matrixWorld);
    b.rect(_o.set(-wm / 2, 0, 0), X, Y, wm, hm, tMain);
    for (const c of def.cards ?? []) {
      const t = this.tile(`${def.id}-${c.id}`, c.tw, c.th, c.paint);
      const cw = c.tw / FLAT_TPM;
      const ch = c.th / FLAT_TPM;
      b.rect(_o.set(c.x - cw / 2, c.y, c.z), X, Y, cw, ch, t);
    }
    b.setMatrix(null);
  }

  /** Floor the wedge of old footprint in front of a swung-back flat: sidewalk at kerb height. */
  private wedge(ground: PwBatch, atlas: PwAtlas, m: THREE.Matrix4, far: THREE.Vector3, nearLocal: THREE.Vector3) {
    const near = nearLocal.clone().applyMatrix4(m);
    const onLine = new THREE.Vector3(far.x, 0.145, near.z);
    near.y = far.y = 0.145;
    const t = sidewalkTile(atlas, { hex: 0x56575d });
    const d = t.density;
    const uvs = [near, far, onLine].flatMap((v) => [v.x * d, -v.z * d]);
    const east = far.x > 0;
    if (east) ground.tri(near, onLine, far, t, [uvs[0], uvs[1], uvs[4], uvs[5], uvs[2], uvs[3]]);
    else ground.tri(near, far, onLine, t, uvs);
  }

  /** Build the flats' meshes (one draw call a zone) after the atlas is painted. */
  finish(zones: Record<ZoneId, THREE.Group>, gain: number) {
    this.atlas.build();
    for (const [id, b] of this.batches) {
      const mesh = b.build(undefined, { gain });
      if (mesh) zones[id].add(mesh);
    }
  }
}

void FLAT_PAD;
