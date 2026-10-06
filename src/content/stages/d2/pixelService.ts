import * as THREE from 'three';
import { EnvKit } from '../../kit/EnvKit';
import { CURVE, ROOMS, TUNNEL, TUNNEL_SPOTS, dAtZ, railXAtZ } from './layout';
import { ROOM_CONVERTERS, type D2PixelWorld, type RoomParts } from './pixel';
import { dropMeshes, paintGroup, type Paint } from './pixelMesh';
import { centreOf, matIs, NZ, paintSigns, paintWallTexts, roomRule, texOf, wallFace, X, Y, Z } from './pixelShared';
import { paintVents } from './pixelShop';
import type { PwBatch } from '../../pixelworld/batch';
import type { PwTile } from '../../pixelworld/atlas';
import { motorTile, oilyConcreteTile, pipeTile, pumpFaceTile, tankLabelTile, tankSkinTile, tunnelDeckTile, tunnelWallTile, wallMarkTile } from '../../pixelworld/d2service';
import { crateTile } from '../../pixelworld/d2shop';
import { drainTile } from '../../pixelworld/d2contain';
import { bloodDecal, splatDecal } from '../../pixelworld/d2decals';

/** The MAINTENANCE TUNNEL and the PUMP ROOM in PIXEL WORLD. */

const _o = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Pipe / tank / motor paint shared by the service rooms (cylinders by material). */
function servicePaint(pw: D2PixelWorld, m: THREE.Mesh, face: string): Paint | undefined {
  const isCyl = (m.geometry as THREE.BufferGeometry).type === 'CylinderGeometry';
  if (!isCyl || texOf(m) !== 'metal' || face === 'py' || face === 'ny') return undefined;
  const hex = (m.material as THREE.MeshLambertMaterial).color.getHex();
  if (hex === 0x3e6a52) return { tile: tankSkinTile(pw.atlas), map: 'cyl' };
  if (hex === 0x2e6098) return { tile: motorTile(pw.atlas), map: 'cyl' };
  return { tile: pipeTile(pw.atlas), map: 'cyl' };
}

/**
 * A wall strip along the curve (u along the path, v from the floor) facing the
 * tunnel's middle; `skip(d)` leaves the lower part out (the alcove opening).
 */
function wallRibbon(b: PwBatch, side: number, from: number, to: number, off: number, height: number, tile: PwTile, skip?: (d0: number, d1: number) => number) {
  const step = 1;
  let along = 0;
  for (let d = from; d < to - 1e-3; d += step) {
    const d1 = Math.min(to, d + step);
    const f0 = EnvKit.frameAt(CURVE, d);
    const f1 = EnvKit.frameAt(CURVE, d1);
    const p0 = f0.pos.clone().addScaledVector(f0.right, side * off);
    const p1 = f1.pos.clone().addScaledVector(f1.right, side * off);
    const len = p0.distanceTo(p1);
    const y0 = skip ? skip(d, d1) : 0;
    const u0 = along * tile.density;
    const u1 = (along + len) * tile.density;
    // Seen from inside: on the right wall the path runs to the viewer's left.
    if (side > 0) {
      _a.set(p1.x, y0, p1.z);
      _b.set(p0.x, y0, p0.z);
      _c.set(p0.x, height, p0.z);
      _d.set(p1.x, height, p1.z);
      b.quad(_a.clone(), _b.clone(), _c.clone(), _d.clone(), tile, [-u1, y0 * tile.density, -u0, y0 * tile.density, -u0, height * tile.density, -u1, height * tile.density]);
    } else {
      _a.set(p0.x, y0, p0.z);
      _b.set(p1.x, y0, p1.z);
      _c.set(p1.x, height, p1.z);
      _d.set(p0.x, height, p0.z);
      b.quad(_a.clone(), _b.clone(), _c.clone(), _d.clone(), tile, [u0, y0 * tile.density, u1, y0 * tile.density, u1, height * tile.density, u0, height * tile.density]);
    }
    along += len;
  }
}

/** The tunnel ceiling: a strip facing down along the curve. */
function ceilingRibbon(b: PwBatch, from: number, to: number, width: number, y: number, tile: PwTile, tint: number) {
  let along = 0;
  for (let d = from; d < to - 1e-3; d += 1) {
    const d1 = Math.min(to, d + 1);
    const f0 = EnvKit.frameAt(CURVE, d);
    const f1 = EnvKit.frameAt(CURVE, d1);
    const l0 = f0.pos.clone().addScaledVector(f0.right, -width / 2).setY(y);
    const r0 = f0.pos.clone().addScaledVector(f0.right, width / 2).setY(y);
    const l1 = f1.pos.clone().addScaledVector(f1.right, -width / 2).setY(y);
    const r1 = f1.pos.clone().addScaledVector(f1.right, width / 2).setY(y);
    const len = f0.pos.distanceTo(f1.pos);
    const v0 = along * tile.density;
    const v1 = (along + len) * tile.density;
    const w = width * tile.density;
    // Facing down: (left, next-left, next-right, right) runs counter-clockwise seen from below.
    b.quad(l0, l1, r1, r0, tile, [0, v0, 0, v1, w, v1, w, v0], tint);
    along += len;
  }
}

function convertTunnel(pw: D2PixelWorld, parts: RoomParts) {
  const a = pw.atlas;
  const b = pw.main('tunnel');
  const g = pw.gen();
  const { stat } = parts;
  const dA = dAtZ(TUNNEL.z0 - 0.2);
  const dB = dAtZ(TUNNEL.z1 + 0.2);
  const half = TUNNEL.half;
  const H = TUNNEL.h;
  const alcoveD = TUNNEL_SPOTS.alcove;
  const wall = tunnelWallTile(a);
  const crate = crateTile(a, 0x6a5236);

  // Shell walls / ceiling: painted strips along the curve (the classic segments stay the occluders, hidden).
  dropMeshes(stat, (m) => m.userData.pw === 'deck' || m.userData.pw === 'clad' || m.userData.pw === 'alcoveTop');
  b.ribbon(Array.from({ length: Math.ceil(dB - dA) + 1 }, (_, i) => EnvKit.frameAt(CURVE, Math.min(dB, dA + i)).pos.clone()), half * 2, tunnelDeckTile(a), { y: 0.012, v0: 0 });
  for (const s of [-1, 1]) {
    wallRibbon(b, s, dA, dB, half - 0.005, H, wall, s < 0 ? (d0, d1) => (d1 > alcoveD - 1.1 && d0 < alcoveD + 1.1 ? 2.6 : 0) : undefined);
  }
  ceilingRibbon(b, dA, dB, half * 2 + 0.6, H - 0.005, g.corrugated, 0x4a4c52);
  paintSigns(pw, stat, b);
  paintWallTexts(pw, stat, b, { color: (t, c) => c });
  const ventRule = paintVents(pw, stat);
  const rule = roomRule(pw, (m, face, tag, wface): Paint | null | undefined => {
    const v = ventRule(m, wface);
    if (v !== undefined) return v;
    if (tag === 'crate') return { tile: crate, map: 'fit' };
    return servicePaint(pw, m, face);
  });
  paintGroup(stat, b, rule, { move: true });
  // Stencilled direction marks and a blood smear by the alcove.
  const mark = (dd: number, side: number, y: number, t: PwTile, wM: number, hM: number) => {
    const f = EnvKit.frameAt(CURVE, dd);
    const p = f.pos.clone().addScaledVector(f.right, side * (half - 0.02));
    const ux = f.forward.clone().multiplyScalar(side > 0 ? -1 : 1);
    b.rect(_o.set(p.x - ux.x * wM / 2, y, p.z - ux.z * wM / 2), ux, Y, wM, hM, t);
  };
  // (Classic sizes: PUMP ROOM glyph pixel 0.05 m, B-2 0.09 m.)
  const m1 = wallMarkTile(a, 'PUMP ROOM', 0xe8e8e8, 2, 1, 2 / 0.05);
  mark(dA + 26, -1, 2.0, m1.tile, m1.wM, m1.hM);
  const m2 = wallMarkTile(a, 'B-2', 0xe0b020, 4, 0, 4 / 0.09);
  mark(dA + 40, 1, 1.9, m2.tile, m2.wM, m2.hM);
  const blood = bloodDecal(a, 1, true);
  mark(alcoveD + 2.2, -1, 1.2, blood, 1, 1);
}

function convertPump(pw: D2PixelWorld, parts: RoomParts) {
  const R = ROOMS.pump;
  const a = pw.atlas;
  const b = pw.main('pump');
  const g = pw.gen();
  const { stat, shell } = parts;
  const floor = oilyConcreteTile(a, 0x5a5854);
  const cx = railXAtZ(R.z0);

  pw.copyShell(shell, b, (m, _f, _c2, wface) => {
    if (texOf(m) === 'corrugated') return wface === 'ny' ? { tile: g.corrugated, map: 'world' } : wface === 'py' ? null : { tile: g.corrugated, map: 'world' };
    return { tile: g.concrete, map: 'world' };
  });
  paintSigns(pw, stat, b);
  paintWallTexts(pw, stat, b);
  let pumpN = 0;
  const rule = roomRule(pw, (m, face, tag, wface): Paint | null | undefined => {
    switch (tag) {
      case 'band':
        return { tile: g.corrugated, map: 'world' };
      case 'pumpBox': {
        const into = centreOf(m).x < 11 ? 'px' : 'nx';
        if (wface === into) return { tile: pumpFaceTile(a, (m.userData.pwPump ??= ++pumpN)), map: 'fit' };
        return { tile: g.metal, map: 'local' };
      }
      case 'void':
        return { tile: g.plain, map: 'local', tint: 0x0c0d10 };
      case 'drain':
        return face === 'py' ? { tile: drainTile(a), map: 'fit' } : { tile: g.metal, map: 'local' };
    }
    if (matIs(m, 0x5a5854, 'concrete')) return wface === 'py' ? { tile: floor, map: 'world' } : null;
    if (matIs(m, 0x3e6a52, 'metal') && (m.geometry as THREE.BufferGeometry).type === 'SphereGeometry') return { tile: tankSkinTile(a), map: 'local' };
    return servicePaint(pw, m, face);
  });
  paintGroup(stat, b, rule, { move: true });
  // Tank labels facing the room, oil and coolant spills.
  for (const s of [-1, 1]) {
    const tx = cx + s * 5.2;
    const tz = R.z1 + 3.2;
    b.rect(_o.set(tx - 0.75, 1.3, tz + 1.17), X, Y, 1.5, 0.5, tankLabelTile(a, s < 0 ? 'COOLANT' : 'H2O'));
  }
  b.rect(_o.set(cx + 2.2, 0.012, -282), X, NZ, 1.6, 1.6, splatDecal(a, 0x1e1c22, 2));
  b.rect(_o.set(cx - 3.4, 0.012, -285), X, NZ, 1.2, 1.2, bloodDecal(a, 2, false));
  void wallFace;
  void Z;
}

ROOM_CONVERTERS.set('tunnel', convertTunnel);
ROOM_CONVERTERS.set('pump', convertPump);
