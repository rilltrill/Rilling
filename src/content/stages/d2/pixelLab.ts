import * as THREE from 'three';
import { ROOMS } from './layout';
import { ROOM_CONVERTERS, type D2PixelWorld, type RoomParts } from './pixel';
import { dropMeshes, paintGroup, type Paint } from './pixelMesh';
import { centreOf, matIs, NZ, paintDoor, paintSigns, paintWallTexts, roomRule, texOf, wallFace, X, Y, Z } from './pixelShared';
import { paintVents } from './pixelShop';
import type { BurstDoor } from './setpieces';
import { acousticTile } from '../../pixelworld/d2shop';
import {
  applianceTile, blockworkTile, bulkheadTile, cabinetRunTile, gratingTile, hoodTile, kitchenChequerTile, kitchenNoticesTile, rackEndTile, rackFrontTile, raisedFloorTile, serverWallTile, subwayTileWall,
} from '../../pixelworld/d2lab';
import { bloodDecal, gougeDecal, splatDecal } from '../../pixelworld/d2decals';
import { tintFor } from '../../pixelworld/batch';

/** The staff KITCHEN and the SERVER ROOM in PIXEL WORLD. */

const _o = new THREE.Vector3();

function convertKitchen(pw: D2PixelWorld, parts: RoomParts) {
  const R = ROOMS.kitchen;
  const a = pw.atlas;
  const b = pw.main('kitchen');
  const g = pw.gen();
  const { stat, shell } = parts;
  const block = blockworkTile(a);
  const ceil = acousticTile(a);
  const floor = kitchenChequerTile(a);
  const tiles = subwayTileWall(a, { tw: 16, th: 8, stack: true });
  const cab = cabinetRunTile(a);
  const hood = hoodTile(a);
  const freezerZ = -183.5;

  pw.copyShell(shell, b, (m, _f, _c, wface) => {
    if (wface === 'ny') return { tile: ceil, map: 'world' };
    if (wface === 'py') return null;
    return { tile: block, map: 'world' };
  });
  dropMeshes(stat, (m) => ['cabDoor', 'rangeFront', 'ovenFront', 'knob'].includes(m.userData.pw));
  paintSigns(pw, stat, b);
  paintWallTexts(pw, stat, b);
  const ventRule = paintVents(pw, stat);
  const rule = roomRule(pw, (m, _face, tag, wface): Paint | null | undefined => {
    const v = ventRule(m, wface);
    if (v !== undefined) return v;
    switch (tag) {
      case 'tiling':
        return wallFace(wface) ? { tile: tiles, map: 'world' } : { tile: g.plaster, map: 'local', tint: 0xd8dcd4 };
      case 'island':
        return wface === 'px' || wface === 'nx' ? { tile: cab, map: 'world', v0: -0.1 * 32 } : { tile: g.steel, map: 'local' };
      case 'counterBase': {
        const into = centreOf(m).x < 0 ? 'px' : 'nx';
        return wface === into ? { tile: cab, map: 'world' } : { tile: g.steel, map: 'local' };
      }
      case 'hood': {
        const into = centreOf(m).x < 0 ? 'px' : 'nx';
        return wface === into ? { tile: hood, map: 'world', v0: -2.4 * 32 } : { tile: g.steel, map: 'local', tint: 0xb8bec4 };
      }
      case 'sauce':
        return { tile: splatDecal(a, 0x8a2a10, 1), map: 'fit' };
      case 'bloodSpot':
        return { tile: bloodDecal(a, 1, false), map: 'fit' };
    }
    if (matIs(m, 0xc4c4bc, 'checker')) return wface === 'py' ? { tile: floor, map: 'world' } : null;
    if (matIs(m, 0x8a9aa0, 'concrete')) return { tile: block, map: 'world' };
    return undefined;
  });
  paintGroup(stat, b, rule, { move: true });

  // Appliance fronts along the wall counters (where the classic oven / range boxes were).
  for (const s of [-1, 1]) {
    const x = s * 7.9 - s * 0.012;
    const ux = s < 0 ? NZ : Z;
    for (let z = -165; z > -192; z -= 3.4) {
      if (s > 0 && Math.abs(z - freezerZ) < 2) continue;
      const kind = Math.abs(Math.round(z)) % 3;
      const t = applianceTile(a, kind === 0 ? 'range' : kind === 1 ? 'oven' : 'sink');
      b.rect(_o.set(x, 0.0, z + (s < 0 ? 0.7 : -0.7)), ux, Y, 1.4, 0.9, t);
    }
  }
  // Notices on the upper wall, a gouge by the freezer.
  b.rect(_o.set(R.x0 + 0.215, 2.3, -170), NZ, Y, 1.5, 0.75, kitchenNoticesTile(a));
  const gouge = gougeDecal(a, 1);
  b.rect(_o.set(R.x1 - 0.215, 2.1, -180.5), Z, Y, 1.5, 1.0, gouge, { tintRGB: tintFor(gouge, 0x8a9aa0) });
  b.rect(_o.set(1.2, 0.012, -177), X, NZ, 1, 1, bloodDecal(a, 4, false));
  if (parts.freezer) paintDoor(pw, parts.freezer as BurstDoor);
}

function convertServers(pw: D2PixelWorld, parts: RoomParts) {
  const a = pw.atlas;
  const b = pw.main('servers');
  const g = pw.gen();
  const { stat, shell } = parts;
  const wall = serverWallTile(a);
  const ceil = gratingTile(a, 0x2e343c);
  const floor = raisedFloorTile(a);
  const rack = rackFrontTile(a);
  const rackEnd = rackEndTile(a);
  const tray = gratingTile(a, 0xb09028);

  pw.copyShell(shell, b, (m, _f, _c, wface) => {
    if (wface === 'ny') return { tile: ceil, map: 'world' };
    if (wface === 'py') return null;
    return { tile: wall, map: 'world' };
  });
  dropMeshes(stat, (m) => m.userData.pw === 'unit');
  paintSigns(pw, stat, b);
  paintWallTexts(pw, stat, b);
  const ventRule = paintVents(pw, stat);
  const rule = roomRule(pw, (m, face, tag, wface): Paint | null | undefined => {
    const v = ventRule(m, wface);
    if (v !== undefined) return v;
    switch (tag) {
      case 'rack':
        if (face === 'pz') return { tile: rack, map: 'fit' };
        if (face === 'nz') return { tile: rack, map: 'fit', flipU: false };
        return { tile: g.metal, map: 'local', tint: 0x24282e };
      case 'rackEnd': {
        const into = centreOf(m).x < 0 ? 'px' : 'nx';
        return wface === into ? { tile: rackEnd, map: 'fit' } : { tile: g.metal, map: 'local' };
      }
    }
    if (matIs(m, 0x56606a, 'grate')) return wface === 'py' ? { tile: floor, map: 'world' } : null;
    if (matIs(m, 0x3c4450, 'metal')) return { tile: wall, map: 'world' };
    if (matIs(m, 0xb09028, 'grate')) return { tile: tray, map: 'local' };
    void texOf;
    return undefined;
  });
  paintGroup(stat, b, rule, { move: true });
  if (parts.bulkhead) bulkhead(pw, parts.bulkhead as THREE.Group);
}

/** The sliding bulkhead: one painted blast door in its own (rising) frame. */
function bulkhead(pw: D2PixelWorld, g: THREE.Group) {
  dropMeshes(g, () => true);
  const b = pw.dynamic(g);
  const t = bulkheadTile(pw.atlas);
  const gen = pw.gen();
  b.box(0, 1.4, 0, 3.0, 2.8, 0.18, { pz: t, nz: t });
  b.box(0, 1.4, 0, 3.0, 2.8, 0.18, { px: gen.metal, nx: gen.metal, py: gen.metal, ny: gen.metal }, { tint: 0x5e646c });
}

ROOM_CONVERTERS.set('kitchen', convertKitchen);
ROOM_CONVERTERS.set('servers', convertServers);
