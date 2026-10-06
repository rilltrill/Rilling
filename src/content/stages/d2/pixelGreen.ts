import * as THREE from 'three';
import { ROOMS, railXAtZ } from './layout';
import { ROOM_CONVERTERS, type D2PixelWorld, type RoomParts } from './pixel';
import { dropMeshes, emitMesh, neutralTint, paintGroup, relativeMatrix, type Paint } from './pixelMesh';
import { centreOf, matIs, NZ, paintDoor, voidPaint, paintSigns, paintWallTexts, roomRule, texOf, wallFace, X, Y, Z } from './pixelShared';
import type { BurstDoor } from './setpieces';
import { ashlarPlinthTile, canopyFasciaTile, flagstoneTile, glazingTile, jungleFlatTile, rubbleTile, soilTile } from '../../pixelworld/d2green';
import { moonTile, nightSkyPlaneTile, bloodDragTile, paperTile, vineCurtainTile } from '../../pixelworld/d2lobby';
import { acousticTile } from '../../pixelworld/d2shop';
import { biohazardTile, gratingTile, helixScreenTile, hoseCardTile, incubatorApronTile, incubatorPanelTile, nestTile, sequencerTile, subwayTileWall, vinylFloorTile } from '../../pixelworld/d2lab';
import { gougeDecal } from '../../pixelworld/d2decals';
import { condensationTile, glassSheenTile } from '../../pixelworld/d2glass';
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

  const ashlar = ashlarPlinthTile(a);
  pw.copyShell(shell, b, (m, _f, _c2, wface) => {
    // The far end: an ashlar plinth (the glazing and the jungle beyond are laid over the wall above it).
    if (texOf(m) === 'tiles') return wallFace(wface) ? { tile: ashlar, map: 'world' } : { tile: g.plaster, map: 'world', tint: 0x9a917e };
    return { tile: rubble, map: 'world' };
  });
  void lab;
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

  // What is on the side glass (inside face, behind the mullions): sheen, smudges, condensation at the foot.
  const sheen = glassSheenTile(a, 0x9ad0c8);
  const dew = condensationTile(a, 0xb8e8e0);
  for (const sgn of [-1, 1]) {
    const x = sgn < 0 ? R.x0 + 0.05 : R.x1 - 0.05;
    const ux = sgn < 0 ? NZ : Z;
    const z = sgn < 0 ? R.z0 : R.z1;
    b.rect(_o.set(x, 1.0, z), ux, Y, R.z0 - R.z1, 6.0, sheen, { u0: 0, v0: 0 });
    b.rect(_o.set(x + (sgn < 0 ? 0.004 : -0.004), 1.0, z), ux, Y, R.z0 - R.z1, 0.5, dew, { u0: 0, v0: 0 });
  }
  // Gables: true triangles (the classic stacks stepped slabs).
  const near = R.z0 - 0.2;
  const far = R.z1 + 0.2;
  worldTri(b, new THREE.Vector3(R.x1, wallTop, near), new THREE.Vector3(R.x0, wallTop, near), new THREE.Vector3(0, ridge + 0.1, near), rubble, neutralTint(rubble, _c.setHex(0x8e877a)));
  // The far end as a glazed greenhouse end over its ashlar plinth: the night jungle (unlit, the
  // lightning brightens it) behind steel glazing, a true gable, the lit HATCHERY doorway with a canopy.
  endGlazing(pw, R, wallTop, ridge, far);
  // Night sky over the glass roof, jungle flats beyond the side glass (unlit, lightning brightens them).
  const sky = pw.sky('green');
  sky.rect(_o.set(-100, ridge + 8, -190), X, Z, 200, 130, nightSkyPlaneTile(pw.skyAtlas), { u0: 0, v0: 0 });
  sky.rect(_o.set(-14, ridge + 7.9, -132), X, Z, 6, 6, moonTile(pw.skyAtlas));
  const flat = jungleFlatTile(pw.skyAtlas);
  sky.rect(_o.set(-27, -0.5, -58), NZ, Y, 90, 18, flat, { u0: 0, v0: 0 });
  sky.rect(_o.set(27, -0.5, -148), Z, Y, 90, 18, flat, { u0: 97, v0: 0 });
  void railXAtZ;
}

/** The atrium's far end: jungle flats behind cut-out glazing (around the door), a canopy and vines over the door. */
function endGlazing(pw: D2PixelWorld, R: (typeof ROOMS)['green'], wallTop: number, ridge: number, wallZ: number) {
  const a = pw.atlas;
  const b = pw.main('green');
  const cards = pw.card('green');
  const sky = pw.sky('green');
  const flat = jungleFlatTile(pw.skyAtlas);
  const glaze = glazingTile(a);
  const hatchX = railXAtZ(R.z1);
  const doorW = 3.6;
  const doorH = 3.2;
  const zJ = wallZ + 0.02;
  const zG = wallZ + 0.035;
  const dL = hatchX - doorW / 2;
  const dR = hatchX + doorW / 2;
  // Rectangles round the door, then the gable triangle (both layers aligned to the world).
  const rects: [number, number, number, number][] = [
    [R.x0, 1, dL, wallTop],
    [dR, 1, R.x1, wallTop],
    [dL, doorH, dR, wallTop],
  ];
  for (const [x0, y0, x1, y1] of rects) {
    sky.rect(_o.set(x0, y0, zJ), X, Y, x1 - x0, y1 - y0, flat, { u0: x0 * flat.density, v0: y0 * flat.density });
    b.rect(_o.set(x0, y0, zG), X, Y, x1 - x0, y1 - y0, glaze, { u0: x0 * 32 + 3, v0: y0 * 32 - 32 });
  }
  const A = new THREE.Vector3(R.x0, wallTop, zJ);
  const B = new THREE.Vector3(R.x1, wallTop, zJ);
  const C = new THREE.Vector3(0, ridge + 0.1, zJ);
  worldTri(sky, A, B, C, flat, 0xffffff);
  const gUv = (p: THREE.Vector3) => [p.x * 32 + 3, p.y * 32 - 32];
  const G = [A, B, C].map((p) => p.clone().setZ(zG));
  const uv = G.flatMap(gUv);
  const su = Math.floor(Math.min(uv[0], uv[2], uv[4]) / 64) * 64;
  const sv = Math.floor(Math.min(uv[1], uv[3], uv[5]) / 64) * 64;
  b.tri(G[0], G[1], G[2], glaze, [uv[0] - su, uv[1] - sv, uv[2] - su, uv[3] - sv, uv[4] - su, uv[5] - sv]);
  // Entrance canopy (fascia lamps glowing), vines hanging off it and off the eaves.
  const fascia = canopyFasciaTile(a);
  const g = pw.gen();
  b.box(hatchX, 3.29, wallZ + 0.35, 5.0, 0.19, 0.6, { pz: fascia, px: g.metal, nx: g.metal, py: g.metal, ny: g.metal }, {});
  for (const [x, y, w, h, v] of [
    [hatchX - 2.5, 3.38, 1.4, 1.5, 0],
    [hatchX + 1.1, 3.38, 1.4, 1.5, 1],
    [R.x0 + 1.0, wallTop, 2, 1.5, 1],
    [-6.5, wallTop + 0.1, 2, 1.5, 0],
    [4.8, wallTop + 0.1, 2, 1.5, 1],
    [R.x1 - 3.0, wallTop, 2, 1.5, 0],
  ] as const) {
    cards.rect(_o.set(x, y - h, wallZ + (y < 4 ? 0.66 : 0.06)), X, Y, w, h, vineCurtainTile(a, v));
  }
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
        return voidPaint(pw, m, wface, 0);
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
  // Incubators: an apron under each table top (vent louvres, a sticker), the control panel with its lit
  // readout and a clipboard on the aisle side, a coolant hose drooping to the floor — the classic
  // tables stop reading as plain plates on legs.
  const apron = incubatorApronTile(a);
  const cardsH = pw.card('hatch');
  [
    [-4.65, -130.7],
    [4.65, -130.7],
    [-4.65, -138.7],
    [-4.65, -146.7],
    [4.65, -146.7],
  ].forEach(([x, z], i) => {
    const s = x < 0 ? -1 : 1;
    const panel = incubatorPanelTile(a, i);
    const aisle = s < 0 ? 'px' : 'nx';
    b.box(x, 0.635, z, 3.4, 0.37, 3.3, { [aisle]: panel, [aisle === 'px' ? 'nx' : 'px']: apron, pz: apron, nz: apron } as Record<string, PwTile>);
    const hx = x - s * 1.72;
    cardsH.rect(_o.set(hx, 0, z - 1.1), Z, Y, 0.5, 1.0, hoseCardTile(a));
  });
  // Claw gouges by LAB B's door.
  const gouge = gougeDecal(a, 3);
  b.rect(_o.set(R.x0 + 0.215, 1.35, -140.2), NZ, Y, 1.5, 1.0, gouge, { tintRGB: tintFor(gouge, 0xc6d0cc) });
  for (const d of ['doorL', 'doorR']) if (parts[d]) paintDoor(pw, parts[d] as BurstDoor);
}

ROOM_CONVERTERS.set('green', convertGreen);
ROOM_CONVERTERS.set('hatch', convertHatch);
