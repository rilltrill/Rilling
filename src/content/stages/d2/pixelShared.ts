import * as THREE from 'three';
import type { TexName } from '../../kit/Textures';
import type { PwTile } from '../../pixelworld/atlas';
import type { PwBatch } from '../../pixelworld/batch';
import { d2DoorTile, d2SignTile, d2WallTextTile, type SignSpec } from '../../pixelworld/d2signs';
import { balustradeTile } from '../../pixelworld/d2lobby';
import type { BurstDoor } from './setpieces';
import type { D2PixelWorld } from './pixel';
import { dropMeshes, emitMesh, paintGroup, tagOf, type Face, type MeshRule, type Paint } from './pixelMesh';

/**
 * Shared pieces of the RESEARCH LABS room converters: material queries, the
 * room rule (tags first, then the generic painted set), signs, wall lettering,
 * railings and doors.
 */

export const X = new THREE.Vector3(1, 0, 0);
export const Y = new THREE.Vector3(0, 1, 0);
export const Z = new THREE.Vector3(0, 0, 1);
export const NX = new THREE.Vector3(-1, 0, 0);
export const NY = new THREE.Vector3(0, -1, 0);
export const NZ = new THREE.Vector3(0, 0, -1);

const _o = new THREE.Vector3();
const _p = new THREE.Vector3();

/** The Kit texture of a mesh's material. */
export function texOf(m: THREE.Mesh): TexName | undefined {
  return (m.material as THREE.Material).userData.retroTex as TexName | undefined;
}

/** The sRGB hex colour of a mesh's material. */
export function hexOf(m: THREE.Mesh): number {
  return (m.material as THREE.MeshLambertMaterial).color?.getHex?.() ?? 0xffffff;
}

/** Same material recipe (colour, optional Kit texture)? */
export function matIs(m: THREE.Mesh, hex: number, tex?: TexName): boolean {
  return hexOf(m) === hex && (tex === undefined || texOf(m) === tex);
}

/** Is `face` a wall face (vertical)? */
export const wallFace = (f?: Face) => f !== 'py' && f !== 'ny';

/**
 * A room rule: `special` sees the mesh, its tag and the face first (a Paint,
 * `null` to drop the face, `undefined` to fall through to the generic set).
 */
export function roomRule(pw: D2PixelWorld, special: (m: THREE.Mesh, face: Face, tag: string | undefined, wface: Face, col?: THREE.Color) => Paint | null | undefined): MeshRule {
  return (m, face, col, wface) => {
    const r = special(m, face, tagOf(m), wface ?? face, col);
    if (r !== undefined) return r;
    return pw.genericPaint(m, face, 'local');
  };
}

/** The sign groups under `root` (tagged by `sign()`). */
export function signGroups(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.pw === 'sign') out.push(o);
  });
  return out;
}

/**
 * Paint every classic `sign()`: its board's front face takes the painted sign
 * module (fit), the other faces a dark plain finish; the block letters go.
 */
export function paintSigns(pw: D2PixelWorld, root: THREE.Object3D, b: PwBatch) {
  for (const s of signGroups(root)) {
    const spec = s.userData.pwSign as SignSpec;
    const tile = d2SignTile(pw.atlas, spec);
    dropMeshes(s, (m) => m.userData.pw !== 'signBoard');
    s.updateMatrixWorld(true);
    for (const m of s.children) {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.pw !== 'signBoard') continue;
      emitMesh(b, mesh, (_m, face) => (face === 'pz' ? { tile, map: 'fit' } : { tile: pw.gen().metal, map: 'local', tint: 0x2a2a30 }));
      s.remove(mesh);
    }
  }
}

/** Painted wall lettering for every classic `pixelText` group under `root` not handled already (not on a sign). */
export function paintWallTexts(pw: D2PixelWorld, root: THREE.Object3D, b: PwBatch, o: { skip?: (text: string) => boolean; color?: (text: string, c: number) => number } = {}) {
  const groups: THREE.Object3D[] = [];
  root.traverse((g) => {
    if (g.userData.pwText && !(g.parent && g.parent.userData.pw === 'sign')) groups.push(g);
  });
  for (const g of groups) {
    const rec = g.userData.pwText as { str: string; px: number; color: number; glow: boolean };
    dropMeshes(g, () => true);
    if (o.skip?.(rec.str)) continue;
    const t = d2WallTextTile(pw.atlas, rec.str, rec.px, o.color ? o.color(rec.str, rec.color) : rec.color, rec.glow);
    g.updateMatrixWorld(true);
    b.withMatrix(g.matrixWorld, () => b.rect(_o.set(-t.wM / 2, -t.hM / 2, 0.012), X, Y, t.wM, t.hM, t.tile));
  }
}

/** Replace the classic railings under `root` with painted cut-out balustrade cards (two-sided batch). */
export function paintRailings(pw: D2PixelWorld, root: THREE.Object3D, cards: PwBatch, tile?: PwTile) {
  const recs = new Set<{ x0: number; z0: number; x1: number; z1: number; y: number; hex: number }>();
  root.traverse((o) => {
    if (o.userData.pw === 'railing' && o.userData.pwRail) recs.add(o.userData.pwRail);
  });
  dropMeshes(root, (m) => m.userData.pw === 'railing');
  for (const r of recs) {
    const t = tile ?? balustradeTile(pw.atlas, { bar: r.hex });
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const ux = new THREE.Vector3(r.x1 - r.x0, 0, r.z1 - r.z0).normalize();
    cards.rect(_o.set(r.x0, r.y, r.z0), ux, Y, len, 1.06, t, { u0: 0, v0: 0 });
  }
}

/**
 * Re-paint a burst door: the baked leaf is replaced (in the leaf's own frame, so
 * it swings / flies with it) by a box whose faces carry the painted door.
 */
export function paintDoor(pw: D2PixelWorld, door: BurstDoor) {
  const o = door.o;
  const panel = door.root.children[0];
  if (!panel) return;
  dropMeshes(panel, () => true);
  const b = pw.dynamic(panel);
  const t = d2DoorTile(pw.atlas, o.style, o.w - 0.04, o.h - 0.02);
  const g = pw.gen();
  const edge = o.style === 'wood' ? g.wood : g.metal;
  const tint = o.style === 'wood' ? 0x5a3a22 : 0x6a7078;
  b.box(o.w / 2, o.h / 2, 0, o.w - 0.04, o.h - 0.02, 0.09, { pz: t, nz: t });
  b.box(o.w / 2, o.h / 2, 0, o.w - 0.04, o.h - 0.02, 0.09, { px: edge, nx: edge, py: edge, ny: edge }, { tint });
}

/** Paint a group's static dressing with `rule` and remove it from the classic bake. */
export function moveAll(root: THREE.Object3D, b: PwBatch, rule: MeshRule) {
  return paintGroup(root, b, rule, { move: true });
}

/** World position of a mesh's centre. */
export function centreOf(m: THREE.Object3D, out = _p): THREE.Vector3 {
  return out.setFromMatrixPosition(m.matrixWorld);
}
