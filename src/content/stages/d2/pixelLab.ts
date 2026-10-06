import * as THREE from 'three';
import { ROOMS } from './layout';
import { ROOM_CONVERTERS, type D2PixelWorld, type RoomParts } from './pixel';
import { dropMeshes, paintGroup, type Paint } from './pixelMesh';
import { centreOf, matIs, NZ, paintDoor, paintSigns, paintWallTexts, roomRule, texOf, wallFace, X, Y, Z } from './pixelShared';
import { paintVents } from './pixelShop';
import type { BurstDoor } from './setpieces';
import { acousticTile } from '../../pixelworld/d2shop';
import {
  applianceTile, bulkheadTile, cableDropTile, gratingTile, kitchenChequerTile, kitchenNoticesTile, rackEndTile, rackFrontTile, raisedFloorTile, serverWallTile,
} from '../../pixelworld/d2lab';
import { cabinetFrontTile, hoodFrontTile, hoodUndersideTile, islandEndTile, kitchenWallTile, panCardTile, sootDecalTile } from '../../pixelworld/d2kitchen';
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
  const wall = kitchenWallTile(a);
  const ceil = acousticTile(a);
  const floor = kitchenChequerTile(a);
  const cab = cabinetFrontTile(a);
  const hood = hoodFrontTile(a);
  const hoodUnder = hoodUndersideTile(a);
  const islandEnd = islandEndTile(a);
  const freezerZ = -183.5;
  const cards = pw.card('kitchen');

  pw.copyShell(shell, b, (m, _f, _c, wface) => {
    if (wface === 'ny') return { tile: ceil, map: 'world' };
    if (wface === 'py') return null;
    return { tile: wall, map: 'world' };
  });
  // The pans on the pot racks become pixel billboards (their hooks with them).
  const pans: THREE.Vector3[] = [];
  stat.traverse((o) => {
    if (o.userData.pw === 'pan') pans.push(centreOf(o).clone());
  });
  dropMeshes(stat, (m) => ['cabDoor', 'rangeFront', 'ovenFront', 'knob', 'pan', 'panHook'].includes(m.userData.pw));
  paintSigns(pw, stat, b);
  paintWallTexts(pw, stat, b);
  const ventRule = paintVents(pw, stat);
  const rule = roomRule(pw, (m, face, tag, wface): Paint | null | undefined => {
    const v = ventRule(m, wface);
    if (v !== undefined) return v;
    switch (tag) {
      case 'tiling':
        return wallFace(wface) ? { tile: wall, map: 'world' } : { tile: g.plaster, map: 'local', tint: 0xd8dcd4 };
      case 'island':
        if (wface === 'px' || wface === 'nx') return { tile: cab, map: 'world', v0: -0.1 * 32, tint: 0x9aa0a8 };
        if (wface === 'pz' || wface === 'nz') return { tile: islandEnd, map: 'fit', flipU: face === 'nz' };
        return { tile: g.steel, map: 'local' };
      case 'counterBase': {
        const into = centreOf(m).x < 0 ? 'px' : 'nx';
        return wface === into ? { tile: cab, map: 'world', tint: 0x9aa0a8 } : { tile: g.steel, map: 'local' };
      }
      case 'hood': {
        const into = centreOf(m).x < 0 ? 'px' : 'nx';
        if (wface === into) return { tile: hood, map: 'world', v0: -2.4 * 32 };
        if (wface === 'ny') return { tile: hoodUnder, map: 'world' };
        return { tile: g.steel, map: 'local', tint: 0xb8bec4 };
      }
      case 'sauce':
        return { tile: splatDecal(a, 0x8a2a10, 1), map: 'fit' };
      case 'bloodSpot':
        return { tile: bloodDecal(a, 1, false), map: 'fit' };
    }
    if (matIs(m, 0xc4c4bc, 'checker')) return wface === 'py' ? { tile: floor, map: 'world' } : null;
    if (matIs(m, 0x8a9aa0, 'concrete')) return { tile: wall, map: 'world' };
    return undefined;
  });
  paintGroup(stat, b, rule, { move: true });

  // Appliance fronts along the wall counters (where the classic oven / range boxes were), soot and grease over the ranges.
  for (const s of [-1, 1]) {
    const x = s * 7.9 - s * 0.012;
    const ux = s < 0 ? NZ : Z;
    for (let z = -165; z > -192; z -= 3.4) {
      if (s > 0 && Math.abs(z - freezerZ) < 2) continue;
      const kind = Math.abs(Math.round(z)) % 3;
      const t = applianceTile(a, kind === 0 ? 'range' : kind === 1 ? 'oven' : 'sink');
      b.rect(_o.set(x, 0.0, z + (s < 0 ? 0.7 : -0.7)), ux, Y, 1.4, 0.9, t);
      if (kind === 0) {
        const wx = s * 8.74;
        b.rect(_o.set(wx, 0.98, z + (s < 0 ? 0.75 : -0.75)), ux, Y, 1.5, 1.4, sootDecalTile(a, Math.round(z) & 1));
      }
    }
  }
  // Pans and pots on S-hooks under the racks (cards turned a little toward the aisle).
  pans.forEach((p, i) => {
    const inward = p.x < 0 ? 1 : -1;
    const yaw = inward * 0.35;
    const u = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const w = 0.42;
    const h = 0.63;
    cards.rect(_o.set(p.x - u.x * w / 2, 2.55 - h, p.z - u.z * w / 2), u, Y, w, h, panCardTile(a, i));
  });
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
  // Cables dropping from the overhead trays to the rack tops (breaking the boxes' top line).
  const sc = pw.card('servers');
  [-198.5, -203.5, -208.5, -213.5].forEach((z, i) => {
    for (const s of [-1, 1]) {
      const x = s * 2.75;
      sc.rect(_o.set(x - 0.375, 2.3, z + 0.1), X, Y, 0.75, 0.9, cableDropTile(a, i + (s > 0 ? 1 : 0)));
    }
  });
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
