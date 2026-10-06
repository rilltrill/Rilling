import * as THREE from 'three';
import { ROOMS, railXAtZ } from './layout';
import { CELLS, HALL } from './containment';
import { ROOM_CONVERTERS, type D2PixelWorld, type RoomParts } from './pixel';
import { dropMeshes, emitMesh, paintGroup, type Paint } from './pixelMesh';
import { matIs, NX, NZ, voidPaint, paintRailings, paintSigns, paintWallTexts, roomRule, texOf, wallFace, X, Y, Z } from './pixelShared';
import type { GlassWall } from './setpieces';
import { baleTile, blastDoorTile, concreteColumnTile, dadoTile, dangerPictoTile, dragTrailTile, drainTile, floorLineTile, floorStencilTile, hallMarkTile, hazardBandTile, slabFloorTile, specimenBoardTile, strawTile, tankWallTile, tankXTile } from '../../pixelworld/d2contain';
import { classicBoard, d2SignTile } from '../../pixelworld/d2signs';
import { wallMarkTile } from '../../pixelworld/d2service';
import { crateTile } from '../../pixelworld/d2shop';
import { gratingTile } from '../../pixelworld/d2lab';
import { balustradeTile } from '../../pixelworld/d2lobby';
import { bloodDecal, gougeDecal, pocksDecal } from '../../pixelworld/d2decals';
import { tintFor } from '../../pixelworld/batch';
import { clawCrackTile, condensationTile, glassSheenTile } from '../../pixelworld/d2glass';
import { cableTrayTile, dripStainTile, fadedHazardTile, hallWallTile } from '../../pixelworld/d2walls';
import type { PwBatch } from '../../pixelworld/batch';

/** The CONTAINMENT WING and the HOLDING HALL (boss arena) in PIXEL WORLD. */

const _o = new THREE.Vector3();

/**
 * What is on a glass wall's pane (cut-out overlay just in front of it, in the wall's own frame):
 * sheen, smudges, scratches, condensation, and (`claw`) raking claw cracks. It hides with the
 * pane when the glass shatters (an allocation-free per-frame check).
 */
function glassOverlay(pw: D2PixelWorld, w: GlassWall, claw: number | null, tint?: number) {
  const a = pw.atlas;
  const { w: W, h: H } = w.o;
  const cb = pw.dynamic(w.root, true, (m) => {
    m.visible = w.pane.visible;
    pw.animators.push(() => {
      m.visible = w.pane.visible;
    });
  });
  cb.rect(_o.set(-W / 2, 0.2, 0.05), X, Y, W, H - 0.32, glassSheenTile(a, tint), { u0: 0, v0: 0 });
  cb.rect(_o.set(-W / 2, 0.2, 0.055), X, Y, W, 0.5, condensationTile(a, tint), { u0: 0, v0: 0 });
  if (claw !== null) cb.rect(_o.set(-1.0 + (claw % 2) * 0.6, H * 0.35, 0.06), X, Y, 2, 2, clawCrackTile(a, claw));
}

/** Re-paint a glass wall's baked steel frame (static) into the room's mesh; the pane, cracks and teeth stay classic. */
function glassFrames(pw: D2PixelWorld, walls: GlassWall[], b: PwBatch) {
  const g = pw.gen();
  walls.forEach((w, i) => {
    if (!w.broken) glassOverlay(pw, w, i % 3 === 1 ? i : null, w.o.tint);
  });
  for (const w of walls) {
    w.root.updateMatrixWorld(true);
    for (const ch of [...w.root.children]) {
      const m = ch as THREE.Mesh;
      if (!m.isMesh || m === w.pane) continue;
      const mat = m.material as THREE.MeshLambertMaterial;
      if (!mat.isMeshLambertMaterial || mat.transparent) continue;
      emitMesh(b, m, () => ({ tile: g.metal, map: 'local' }), m.matrixWorld, { vertexColors: true });
      w.root.remove(m);
    }
  }
}

function convertWing(pw: D2PixelWorld, parts: RoomParts) {
  const R = ROOMS.wing;
  const a = pw.atlas;
  const b = pw.main('wing');
  const g = pw.gen();
  const { stat, shell } = parts;
  const floor = slabFloorTile(a);
  const straw = strawTile(a);
  const bale = baleTile(a);
  const hazard = hazardBandTile(a);
  const door = blastDoorTile(a, 0);
  const cx = railXAtZ(R.z0);

  pw.copyShell(shell, b, () => ({ tile: g.concrete, map: 'world' }));
  dropMeshes(stat, (m) => m.userData.pw === 'claw');
  paintSigns(pw, stat, b);
  paintWallTexts(pw, stat, b);
  const rule = roomRule(pw, (m, _face, tag, wface): Paint | null | undefined => {
    switch (tag) {
      case 'bale':
        return { tile: bale, map: 'fit' };
      case 'blastDoor':
        return wface === 'pz' ? { tile: door, map: 'fit' } : { tile: g.metal, map: 'local', tint: 0x5e646c };
    }
    if (matIs(m, 0x5e6064, 'concrete')) return wface === 'py' ? { tile: floor, map: 'world' } : null;
    if (texOf(m) === 'concrete') return { tile: g.concrete, map: 'world' };
    if (texOf(m) === 'sand') return wface === 'py' ? { tile: straw, map: 'world' } : { tile: straw, map: 'local' };
    if (texOf(m) === 'hazard') return { tile: hazard, map: 'world' };
    return undefined;
  });
  paintGroup(stat, b, rule, { move: true });
  glassFrames(pw, (parts.cells as GlassWall[]) ?? [], b);
  // Claw gouges inside the pens (where the classic marks were), danger pictograms on the cell piers.
  const gouge = gougeDecal(a, 2);
  for (const side of [-1, 1]) {
    const bx = side < 0 ? R.x0 : R.x1;
    for (const [z0, z1] of CELLS.zs) {
      const zc = (z0 + z1) / 2;
      const x = bx - side * 0.215;
      b.rect(_o.set(x, 1.8, zc + (side < 0 ? 1 : -1) * 2.2), side < 0 ? NZ : Z, Y, 1.5, 1.0, gouge, { tintRGB: tintFor(gouge, 0x6e7076) });
    }
  }
  for (const z of [-305, -316]) for (const gx of [CELLS.leftGlassX, CELLS.rightGlassX]) {
    const s = gx < 11 ? 1 : -1;
    b.rect(_o.set(gx + s * 0.36, 3.2, z + (s > 0 ? 0.5 : -0.5)), s > 0 ? NZ : Z, Y, 1, 1, dangerPictoTile(a));
  }
  // Teal dado along the corridor walls (between the cell piers there is glass).
  const dado = dadoTile(a, 0x376660);
  for (const x of [R.x0 + 0.205, R.x1 - 0.205]) {
    b.rect(_o.set(x, 0, x < 11 ? R.z0 : R.z1), x < 11 ? NZ : Z, Y, R.z0 - R.z1, 2.5, dado, { u0: 0, v0: 0 });
  }
  b.rect(_o.set(cx - 0.5, 0.013, -309), X, NZ, 1, 3, dragTrailTile(a));
  b.rect(_o.set(cx + 1.6, 0.013, -320), X, NZ, 1, 1, bloodDecal(a, 3, false));
}

function convertHall(pw: D2PixelWorld, parts: RoomParts) {
  const R = ROOMS.hall;
  const H = HALL;
  const a = pw.atlas;
  const b = pw.main('hall');
  const cards = pw.card('hall');
  const g = pw.gen();
  const { stat, shell } = parts;
  const floor = slabFloorTile(a);
  const column = concreteColumnTile(a);
  const hazard = hazardBandTile(a);
  const crate = crateTile(a, 0x6a5236);
  const catwalk = gratingTile(a, 0x464c54);
  const tankWall = tankWallTile(a);
  const hallWall = hallWallTile(a);

  pw.copyShell(shell, b, () => ({ tile: hallWall, map: 'world' }));
  dropMeshes(stat, (m) => m.userData.pw === 'claw' || m.userData.pw === 'ring');
  // The SPECIMEN X lettering becomes one lit board (below).
  paintWallTexts(pw, stat, b, { skip: (t) => t === 'SPECIMEN X' || t === 'CLASS 5 CONTAINMENT' });
  paintSigns(pw, stat, b);
  paintRailings(pw, stat, cards, balustradeTile(a, { rail: 0x4e5560, bar: 0x5e646c }));
  const rule = roomRule(pw, (m, face, tag, wface): Paint | null | undefined => {
    switch (tag) {
      case 'column':
        return wallFace(face) ? { tile: column, map: 'cyl' } : { tile: g.concrete, map: 'local' };
      case 'buttress':
        return { tile: hallWall, map: 'world', tint: 0x50545c };
      case 'truss':
        return { tile: g.metal, map: 'local' };
      case 'catwalk':
        return { tile: catwalk, map: 'world' };
      case 'drain':
        return face === 'py' ? { tile: drainTile(a), map: 'fit' } : { tile: g.metal, map: 'local' };
      case 'crate':
        return { tile: crate, map: 'fit' };
      case 'void':
        return voidPaint(pw, m, wface, 11);
      case 'bloodDrag':
        return { tile: dragTrailTile(a), map: 'fit' };
    }
    if (matIs(m, 0x5a5e62, 'concrete')) return wface === 'py' ? { tile: floor, map: 'world' } : null;
    if (matIs(m, 0x2a3c46, 'tiles')) return { tile: tankWall, map: 'world' };
    if (texOf(m) === 'concrete') return { tile: g.concrete, map: 'world' };
    return undefined;
  });
  paintGroup(stat, b, rule, { move: true });
  glassFrames(pw, (parts.panes as GlassWall[]) ?? [], b);

  // Arena markings: a painted hazard ring round the drain (the classic dashes), hazard feet on the buttresses.
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    ring.push(new THREE.Vector3(H.center.x + Math.cos(t) * 7.5, 0, H.center.z + Math.sin(t) * 7.5));
  }
  // Worn cream (the boss's telegraph rings are yellow / orange: the floor ring must not compete).
  b.ribbon(ring, 0.4, floorLineTile(a, 0xd8d0b0), { y: 0.011 });
  let bay = 0;
  for (let z = R.z0 - 3; z > H.tankZ; z -= 6) {
    bay++;
    for (const x of [R.x0 + 0.5, R.x1 - 0.5]) {
      const inward = x < 11 ? 1 : -1;
      // Bay numbers stencilled on the buttress faces.
      const num = wallMarkTile(a, `0${bay}`, 0xd8d0b8, 4, 0, 44);
      const nW = num.wM;
      b.rect(_o.set(x + inward * 0.512, 2.9, z + (inward > 0 ? nW / 2 : -nW / 2)), inward > 0 ? NZ : Z, Y, nW, num.hM, num.tile);
      // Room-facing face and both side faces of the buttress, 1.2 m of stripes.
      b.rect(_o.set(x + inward * 0.51, 0, z + (inward > 0 ? 0.5 : -0.5)), inward > 0 ? NZ : Z, Y, 1.0, 1.2, hazard, { u0: 0, v0: 0 });
      b.rect(_o.set(x - 0.5, 0, z + 0.51), X, Y, 1.0, 1.2, hazard, { u0: 0, v0: 0 });
      b.rect(_o.set(x + 0.5, 0, z - 0.51), NX, Y, 1.0, 1.2, hazard, { u0: 0, v0: 0 });
    }
  }
  // The SPECIMEN X board over the tank, a painted warning X on the tank's back wall.
  const board = specimenBoardTile(a);
  b.rect(_o.set(H.center.x - board.wM / 2, 9.7 - board.hM * 0.6, H.tankZ + 0.32), X, Y, board.wM, board.hM, board.tile);
  b.rect(_o.set(H.center.x - 3, 1.2, R.z1 + 0.32), X, Y, 6, 6, tankXTile(a));
  // Teal dado round the hall (the gate openings left clear).
  const dado = dadoTile(a, 0x376660);
  for (const x of [R.x0 + 0.205, R.x1 - 0.205]) {
    const ux = x < 11 ? NZ : Z;
    const runs: [number, number][] = [[R.z0, H.gateZ + 1.8], [H.gateZ - 1.8, H.tankZ + 0.3]];
    for (const [z0, z1] of runs) b.rect(_o.set(x, 0, x < 11 ? z0 : z1), ux, Y, z0 - z1, 2.5, dado, { u0: 0, v0: 0 });
  }
  // KEEP CLEAR stencilled across the floor in front of the tank; walkway lines from the gates.
  const keep = floorStencilTile(a, 'KEEP CLEAR', 3);
  const kw = (keep.w / 32) * 1.4;
  b.rect(_o.set(H.center.x - kw / 2, 0.012, H.tankZ + 4.2), X, NZ, kw, (keep.h / 32) * 1.4, keep);
  const line = hazardBandTile(a);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? R.x0 + 0.3 : H.center.x + 7.8;
    const x1 = s < 0 ? H.center.x - 7.8 : R.x1 - 0.3;
    b.ribbon([new THREE.Vector3(x0, 0, H.gateZ), new THREE.Vector3(x1, 0, H.gateZ)], 0.3, line, { y: 0.011 });
  }
  // Lit DANGER boxes over the pen gates, numbers stencilled on the pillars.
  const dB = classicBoard('DANGER', 0.06);
  const danger = d2SignTile(a, { text: 'DANGER', px: 0.06, board: 0x1a1a20, ink: 0xff3020, glow: true, ...dB });
  for (const s of [-1, 1]) {
    const x = s < 0 ? R.x0 + 0.215 : R.x1 - 0.215;
    b.rect(_o.set(x, 4.95, H.gateZ + (s < 0 ? dB.w / 2 : -dB.w / 2)), s < 0 ? NZ : Z, Y, dB.w, dB.h, danger);
  }
  H.pillars.forEach((p, i) => {
    const t = wallMarkTile(a, ['A1', 'B1', 'A2', 'B2'][i], 0xe0d8c0, 4, 0, 40);
    b.rect(_o.set(p.x - t.wM / 2, 2.6, p.z + 1.12), X, Y, t.wM, t.hM, t.tile);
  });
  // Stencilled markings on the long walls, pocks and gouges round the arena, gouges on the pillars.
  const big = hallMarkTile(a, 'HOLDING HALL X', 4);
  b.rect(_o.set(R.x0 + 0.215, 6.6, -336), NZ, Y, big.wM, big.hM, big.tile);
  b.rect(_o.set(R.x1 - 0.215, 6.6, -336 - big.wM), Z, Y, big.wM, big.hM, big.tile);
  for (const [s, lbl] of [[-1, 'PEN A'], [1, 'PEN B']] as const) {
    const t = hallMarkTile(a, lbl, 2, 0xe0b020);
    const x = s < 0 ? R.x0 + 0.215 : R.x1 - 0.215;
    b.rect(_o.set(x, 4.25, H.gateZ + (s < 0 ? t.wM / 2 : -t.wM / 2)), s < 0 ? NZ : Z, Y, t.wM, t.hM, t.tile);
  }
  // The long walls' story: drip stains under the catwalks, a cable tray and conduit, a faded
  // hazard band up high, SECTOR X stencilled at eye level between the buttresses.
  const tray = cableTrayTile(a);
  const band = fadedHazardTile(a);
  const sector = hallMarkTile(a, 'SECTOR X', 2, 0xc8c0a8);
  for (const s of [-1, 1]) {
    const x = s < 0 ? R.x0 + 0.212 : R.x1 - 0.212;
    const ux = s < 0 ? NZ : Z;
    const zA = s < 0 ? R.z0 : H.tankZ;
    const len = R.z0 - H.tankZ;
    b.rect(_o.set(x, 7.5, zA), ux, Y, len, 0.5, tray, { u0: 0, v0: 0 });
    b.rect(_o.set(x, 9.0, zA), ux, Y, len, 0.5, band, { u0: 0, v0: 0 });
    let i = 0;
    for (let z = R.z0 - 6; z > H.tankZ + 2; z -= 6) {
      const zc = z;
      b.rect(_o.set(x + s * -0.002, 3.9, zc + (s < 0 ? 1 : -1)), ux, Y, 2, 2, dripStainTile(a, i + (s > 0 ? 1 : 0)));
      if (i % 2 === 1 && Math.abs(zc - H.gateZ) > 2.5) b.rect(_o.set(x + s * -0.004, 2.75, zc + (s < 0 ? sector.wM / 2 : -sector.wM / 2)), ux, Y, sector.wM, sector.hM, sector.tile);
      i++;
    }
  }
  const wall = 0x646870;
  const gouge = gougeDecal(a, 0);
  const pocks = pocksDecal(a, 3);
  for (const [x, y, z, k] of [
    [R.x0 + 0.215, 1.6, -345, 0],
    [R.x0 + 0.215, 2.4, -360, 1],
    [R.x1 - 0.215, 1.9, -350, 2],
    [R.x1 - 0.215, 1.3, -366, 0],
  ] as const) {
    const t = k === 1 ? pocks : gougeDecal(a, k);
    b.rect(_o.set(x, y, z), x < 11 ? NZ : Z, Y, 1.5, 1.0, t, { tintRGB: tintFor(gouge, wall) });
  }
  for (const p of H.pillars) b.rect(_o.set(p.x + 1.115, 1.4, p.z + 0.75), NZ, Y, 1.5, 1.0, gouge, { tintRGB: tintFor(gouge, wall) });
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + i * 1.7;
    b.rect(_o.set(x, 1.2 + (i % 2) * 2.1, H.tankZ + 0.34), X, Y, 1.5, 1.0, gougeDecal(a, (i % 3) + 1), { tintRGB: tintFor(gouge, 0x4e5560) });
  }
  // Floor story: drag trails from the broken tank, blood, a scorch of spilled coolant.
  b.rect(_o.set(2.6, 0.013, -362), X, NZ, 1, 3, dragTrailTile(a));
  b.rect(_o.set(13.4, 0.013, -346), X, NZ, 1, 1, bloodDecal(a, 0, false));
  b.rect(_o.set(6.2, 0.013, -352.5), X, NZ, 1, 1, bloodDecal(a, 4, false));
}

ROOM_CONVERTERS.set('wing', convertWing);
ROOM_CONVERTERS.set('hall', convertHall);
