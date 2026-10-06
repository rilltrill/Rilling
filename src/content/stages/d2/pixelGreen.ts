import * as THREE from 'three';
import { ROOMS, railXAtZ } from './layout';
import { ROOM_CONVERTERS, type D2PixelWorld, type RoomParts } from './pixel';
import { dropMeshes, emitMesh, neutralTint, paintGroup, relativeMatrix, type Paint } from './pixelMesh';
import { centreOf, matIs, NZ, paintDoor, paintSigns, paintWallTexts, roomRule, texOf, wallFace, X, Y, Z } from './pixelShared';
import type { BurstDoor } from './setpieces';
import { flagstoneTile, jungleFlatTile, rubbleTile, soilTile } from '../../pixelworld/d2green';
import { moonTile, nightSkyPlaneTile, bloodDragTile, paperTile } from '../../pixelworld/d2lobby';
import { acousticTile } from '../../pixelworld/d2shop';
import { biohazardTile, gratingTile, helixScreenTile, nestTile, sequencerTile, subwayTileWall, vinylFloorTile } from '../../pixelworld/d2lab';
import { gougeDecal } from '../../pixelworld/d2decals';
import { tintFor } from '../../pixelworld/batch';
import { hash2 } from '../../pixelworld/surfaces';
import { planarUv } from '../../pixelworld/batch';
import type { PwBatch } from '../../pixelworld/batch';
import type { PwTile } from '../../pixelworld/atlas';

/** The BOTANICAL ATRIUM and the HATCHERY in PIXEL WORLD. */

const _o = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

/** A world-projected triangle (wall gables). */
function worldTri(b: PwBatch, a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3, tile: PwTile, tint: number) {
  _n.subVectors(bb, a).cross(_o.subVectors(c, a)).normalize();
  const n = _n.clone();
  const [ua, va] = planarUv(a, n, tile.density);
  const [ub, vb] = planarUv(bb, n, tile.density);
  const [uc, vc] = planarUv(c, n, tile.density);
  const su = Math.floor(Math.min(ua, ub, uc) / tile.w) * tile.w;
  const sv = Math.floor(Math.min(va, vb, vc) / tile.h) * tile.h;
  b.tri(a, bb, c, tile, [ua - su, va - sv, ub - su, vb - sv, uc - su, vc - sv], tint);
}

function convertGreen(pw: D2PixelWorld, parts: RoomParts) {
  const R = ROOMS.green;
  const a = pw.atlas;
  const b = pw.main('green');
  const g = pw.gen();
  const { stat, shell } = parts;
  const soil = soilTile(a);
  const flags = flagstoneTile(a);
  const rubble = rubbleTile(a);
  const lab = subwayTileWall(a, { tw: 16, th: 8, stack: true });
  const wallTop = 7;
  const ridge = R.h;

  pw.copyShell(shell, b, (m, _f, _c2, wface) => {
    if (texOf(m) === 'tiles') return wallFace(wface) ? { tile: lab, map: 'world' } : { tile: g.plaster, map: 'world', tint: 0xccd4d2 };
    return { tile: rubble, map: 'world' };
  });
  dropMeshes(stat, (m) => m.userData.pw === 'gable' || m.userData.pw === 'sky');
  paintSigns(pw, stat, b);
  paintWallTexts(pw, stat, b);
  const rule = roomRule(pw, (m, _face, tag, wface): Paint | null | undefined => {
    switch (tag) {
      case 'path':
        return wface === 'py' ? { tile: flags, map: 'world' } : null;
      case 'kerb':
        return { tile: rubble, map: 'local' };
    }
    if (matIs(m, 0x46362a, 'dirt')) return wface === 'py' ? { tile: soil, map: 'world' } : null;
    if (matIs(m, 0x8e877a, 'concrete')) return { tile: rubble, map: 'world' };
    if (texOf(m) === 'rock') return { tile: g.rock, map: 'local' };
    return undefined;
  });
  paintGroup(stat, b, rule, { move: true });

  // Gables: true triangles (the classic stacks stepped slabs).
  const near = R.z0 - 0.2;
  const far = R.z1 + 0.2;
  worldTri(b, new THREE.Vector3(R.x1, wallTop, near), new THREE.Vector3(R.x0, wallTop, near), new THREE.Vector3(0, ridge + 0.1, near), rubble, neutralTint(rubble, _c.setHex(0x8e877a)));
  worldTri(b, new THREE.Vector3(R.x0, wallTop, far), new THREE.Vector3(R.x1, wallTop, far), new THREE.Vector3(0, ridge + 0.1, far), lab, neutralTint(lab, _c.setHex(0xccd4d2)));
  // Night sky over the glass roof, jungle flats beyond the side glass (unlit, lightning brightens them).
  const sky = pw.sky('green');
  sky.rect(_o.set(-100, ridge + 8, -190), X, Z, 200, 130, nightSkyPlaneTile(pw.skyAtlas), { u0: 0, v0: 0 });
  sky.rect(_o.set(-14, ridge + 7.9, -132), X, Z, 6, 6, moonTile(pw.skyAtlas));
  const flat = jungleFlatTile(pw.skyAtlas);
  sky.rect(_o.set(-27, -0.5, -58), NZ, Y, 90, 18, flat, { u0: 0, v0: 0 });
  sky.rect(_o.set(27, -0.5, -148), Z, Y, 90, 18, flat, { u0: 97, v0: 0 });
  void railXAtZ;
}

function convertHatch(pw: D2PixelWorld, parts: RoomParts) {
  const R = ROOMS.hatch;
  const a = pw.atlas;
  const b = pw.main('hatch');
  const g = pw.gen();
  const { stat, shell, root } = parts;
  const wall = subwayTileWall(a, { tw: 16, th: 8, stack: true });
  const ceil = acousticTile(a);
  const vinyl = vinylFloorTile(a);
  const grate = gratingTile(a, 0x5a6268);
  const nest = nestTile(a);
  const bio = biohazardTile(a);
  const drag = bloodDragTile(a);
  const exitX = railXAtZ(R.z1);

  pw.copyShell(shell, b, (m, _f, _c2, wface) => {
    if (wface === 'ny') return { tile: ceil, map: 'world' };
    if (wface === 'py') return null;
    return { tile: wall, map: 'world' };
  });
  // Monitors' helix bars and the sequencer bars become painted (glowing) displays.
  dropMeshes(stat, (m) => m.userData.pw === 'helix' || m.userData.pw === 'seqBar' || m.userData.pw === 'claw');
  paintSigns(pw, stat, b);
  paintWallTexts(pw, stat, b, { color: (t, c) => (t.startsWith('GENETICS') ? 0x2a8a5a : c) });
  const rule = roomRule(pw, (m, _face, tag, wface): Paint | null | undefined => {
    switch (tag) {
      case 'stripe':
        return { tile: wall, map: 'world', tint: 0x2a8a5a };
      case 'bioplate': {
        const into = centreOf(m).x < 0 ? 'px' : 'nx';
        return wface === into ? { tile: bio, map: 'fit' } : { tile: g.hazard, map: 'local' };
      }
      case 'paper': {
        const c = centreOf(m);
        return { tile: paperTile(a, Math.floor(hash2(Math.round(c.x * 10), Math.round(c.z * 10), 3) * 3)), map: 'fit' };
      }
      case 'bloodDrag':
        return { tile: drag, map: 'fit' };
      case 'void':
        return { tile: g.plain, map: 'local', tint: 0x101214 };
      case 'console':
        return { tile: g.steel, map: 'local' };
    }
    if (matIs(m, 0xa4aeac, 'tiles')) return wface === 'py' ? { tile: vinyl, map: 'world' } : null;
    if (matIs(m, 0x5a6268, 'grate')) return wface === 'py' ? { tile: grate, map: 'world' } : null;
    if (texOf(m) === 'sand') return { tile: nest, map: 'world' };
    return undefined;
  });
  paintGroup(stat, b, rule, { move: true });

  // Robot arms: each baked joint re-painted in its own frame (orange paint, dark joints).
  root.traverse((o) => {
    if (o.userData.pw !== 'arm') return;
    o.traverse((j) => {
      const list = j.children.filter((ch) => (ch as THREE.Mesh).isMesh && !(ch as THREE.Mesh).userData.pixelWorld) as THREE.Mesh[];
      if (!list.length) return;
      const jb = pw.dynamic(j);
      for (const m of list) {
        if ((m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) continue;
        emitMesh(jb, m, () => ({ tile: g.metal, map: 'local' }), relativeMatrix(m, j), { vertexColors: true });
        j.remove(m);
      }
    });
  });
  // Genome displays: the sequencer above each console, a helix on each monitor.
  for (const s of [-1, 1]) {
    const cx = exitX + s * 5.5;
    b.rect(_o.set(cx - 2, 2.45, R.z1 + 0.23), X, Y, 4, 1.5, sequencerTile(a));
    [-1.2, 0, 1.2].forEach((dx, i) => b.rect(_o.set(cx + dx - 0.35, 1.05, R.z1 + 0.605), X, Y, 0.7, 0.4, helixScreenTile(a, i + (s > 0 ? 1 : 0))));
  }
  // Claw gouges by LAB B's door.
  const gouge = gougeDecal(a, 3);
  b.rect(_o.set(R.x0 + 0.215, 1.35, -140.2), NZ, Y, 1.5, 1.0, gouge, { tintRGB: tintFor(gouge, 0xc6d0cc) });
  for (const d of ['doorL', 'doorR']) if (parts[d]) paintDoor(pw, parts[d] as BurstDoor);
}

ROOM_CONVERTERS.set('green', convertGreen);
ROOM_CONVERTERS.set('hatch', convertHatch);
