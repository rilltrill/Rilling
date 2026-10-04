import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { bake, glow, mat } from './bake';
import { beacon, box, cyl, decal, floorQuad, hazardBand, pipe, railing, sign, slab, wallX, wallZ } from './build';
import type { Ctx, RoomOut } from './ctx';
import { pixelText } from './font';
import { ROOMS, railXAtZ } from './layout';
import { glassMat } from './lobby';
import { GlassWall } from './setpieces';
import { steamVents } from './tunnels';
import { S } from './surf';

/** Cell layout of the containment wing (shared with the stage script). */
export const CELLS = {
  zs: [
    [-294.4, -305],
    [-305, -316],
    [-316, -327.6],
  ] as [number, number][],
  leftGlassX: 5,
  rightGlassX: 17,
};

/** Boss hall layout (shared with the boss AI). */
export const HALL = {
  center: new THREE.Vector3(11, 0, -355),
  pillars: [
    new THREE.Vector3(3, 0, -347),
    new THREE.Vector3(19, 0, -347),
    new THREE.Vector3(3, 0, -363),
    new THREE.Vector3(19, 0, -363),
  ],
  tankZ: -372,
  paneXs: [2, 8, 14, 20],
  gateZ: -352,
  /** Arena bounds for the boss. */
  x0: 0.5,
  x1: 21.5,
  zNear: -341.5,
  zFar: -369,
};

export interface WingOut extends RoomOut {
  cells: GlassWall[];
}

export function buildWing(ctx: Ctx): WingOut {
  const R = ROOMS.wing;
  const rnd = () => ctx.rng.next();
  const root = new THREE.Group();
  root.name = 'wing';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;
  const cx = railXAtZ(R.z0);

  // Containment palette: cast concrete (walls, dividers and floor share one
  // recipe), painted steel frames, straw-strewn cells.
  const concrete = S.concrete(0x6e7076);
  const cellWall = S.concrete(0x625c54);
  const steel = S.metal(0x4e5560);
  const glass = glassMat(0x9cc8dc, 0.2);

  floorQuad(stat, S.concrete(0x5e6064), R.x0, R.x1, R.z1, R.z0, 0.002);
  wallX(shellG, concrete, R.x0, R.z0, R.z1, R.h);
  wallX(shellG, concrete, R.x1, R.z0, R.z1, R.h);
  wallZ(shellG, concrete, R.z1, R.x0, R.x1, R.h, [{ c: cx, w: 6.2, h: 6 }]);
  wallZ(stat, concrete, R.z0 - 0.3, R.x0, R.x1, R.h, [{ c: cx, w: 4.4, h: 3.8 }], 0.2);
  slab(shellG, S.concrete(0x3a3c42), R.x0, R.x1, R.h, R.h + 0.3, R.z1, R.z0);

  // Hazard lines along the cell fronts.
  for (const x of [CELLS.leftGlassX + 0.5, CELLS.rightGlassX - 0.5]) floorQuad(stat, S.hazard(), x - 0.2, x + 0.2, R.z1 + 0.4, R.z0 - 0.4, 0.014);

  // Cells: dividers, interiors, glass fronts.
  const cells: GlassWall[] = [];
  const states = ['broken', 'cracked', 'broken', 'intact', 'trike', 'broken'];
  let ci = 0;
  for (const side of [-1, 1]) {
    const gx = side < 0 ? CELLS.leftGlassX : CELLS.rightGlassX;
    const bx = side < 0 ? R.x0 : R.x1;
    const xa = Math.min(gx, bx);
    const xb = Math.max(gx, bx);
    for (const z of [-305, -316]) slab(shellG, cellWall, xa, xb, 0, R.h, z - 0.3, z + 0.3);
    for (const z of [-294.4, -305, -316, -327.6]) {
      box(stat, steel, gx, R.h / 2, z, 0.7, R.h, 0.7);
      beacon(stat, am.warn, gx - side * 0.36, 6.2, z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    slab(stat, steel, gx - 0.3, gx + 0.3, 6.2, R.h, R.z1, R.z0);
    CELLS.zs.forEach(([z0, z1], k) => {
      const zc = (z0 + z1) / 2;
      const num = side < 0 ? 1 + k * 2 : 2 + k * 2;
      // Interior: hay floor, trough, chains, claw marks, number.
      floorQuad(stat, mat(0x806e42, 'sand', 1.5, 0.8), xa, xb, z1 + 0.3, z0 - 0.3, 0.02);
      for (let h = 0; h < 4; h++) {
        const hx = xa + 0.8 + rnd() * (xb - xa - 1.6);
        const hz = zc + (rnd() - 0.5) * 7;
        box(stat, mat(0xc0a050, 'sand', 1.5, 0.8), hx, 0.3, hz, 1.1, 0.6, 0.7, rnd());
      }
      slab(stat, steel, bx - side * 0.2 - 0.5, bx - side * 0.2 + 0.5, 0.3, 0.8, zc - 1.6, zc + 1.6);
      for (let c = 0; c < 3; c++) {
        const chx = (xa + xb) / 2 + (rnd() - 0.5) * 3;
        const chz = zc + (rnd() - 0.5) * 6;
        const l = 1.5 + rnd() * 2.5;
        pipe(stat, S.metal(0x3e3e42), new THREE.Vector3(chx, R.h, chz), new THREE.Vector3(chx, R.h - l, chz), 0.035, 4);
        Kit.add(stat, Kit.cyl(0.18, 0.18, 0.05, 8), S.metal(0x3e3e42), chx, R.h - l - 0.08, chz, Math.PI / 2, 0, 0);
      }
      pixelText(stat, `C-${num}`, S.plain(0xd8d0b8), bx - side * 0.22, 4.2, zc, 0.18, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0.03);
      box(stat, glow(0x6a8ab0, 0.55), (xa + xb) / 2, R.h - 0.1, zc, xb - xa - 1, 0.06, 0.3);
      for (let m = 0; m < 4; m++) box(stat, S.plain(0x2a2420), bx - side * 0.22, 2 + m * 0.15, zc - 2 + m * 0.2, 0.02, 0.06, 1.4, 0, 0, 0.7 * side);
      // Front glass.
      const st = states[ci++];
      const g = new GlassWall({ center: new THREE.Vector3(gx, 0, zc), w: z0 - z1 - 0.8, h: 6, yaw: Math.PI / 2, proximity: st === 'trike' }, glass);
      root.add(g.root);
      if (st === 'broken') {
        g.setBroken();
        for (let s = 0; s < 10; s++) box(stat, glass, gx - side * (0.5 + rnd() * 2.5), 0.02, zc + (rnd() - 0.5) * 8, 0.3 + rnd() * 0.4, 0.02, 0.2 + rnd() * 0.3, rnd() * 3);
      }
      if (st === 'cracked') g.setCracked(2);
      sign(stat, `CELL ${num}`, gx - side * 0.4, 6.6, zc, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0.06, 0x2a2c30, glow(0xffd080, 0.85));
      cells.push(g);
    });
  }
  // Corridor details.
  for (let z = R.z0 - 4; z > R.z1 + 2; z -= 8) {
    pipe(stat, S.metal(0x1a1a1a), new THREE.Vector3(cx, R.h, z), new THREE.Vector3(cx, 5.6, z), 0.02, 4);
    Kit.add(stat, Kit.cone(0.6, 0.45, 10), S.metal(0x3a4048), cx, 5.5, z);
    Kit.add(stat, Kit.cyl(0.42, 0.42, 0.04, 10), glow(0xffe4b8, 1.05), cx, 5.27, z);
  }
  sign(stat, 'DO NOT TAP ON GLASS', CELLS.rightGlassX - 0.45, 1.5, -310.5, -Math.PI / 2, 0.035, 0xd0d0c8, S.plain(0x8a1010));
  sign(stat, 'DANGER', CELLS.leftGlassX + 0.45, 1.6, -321.8, Math.PI / 2, 0.06, 0xe0b020, S.plain(0x101010));
  // Huge blast doors into the hall, slid open (one buckled).
  slab(stat, S.metal(0x5e646c), cx - 6.6, cx - 3.0, 0, 6.2, R.z1 + 0.25, R.z1 + 0.85);
  const bent = box(stat, S.metal(0x5e646c), cx + 4.6, 3.1, R.z1 + 0.6, 3.4, 6.2, 0.6, -0.12, 0, 0.04);
  void bent;
  hazardBand(stat, cx - 3.1, cx + 3.1, R.z1 + 0.5, 0.6);
  sign(stat, 'HOLDING HALL X', cx, 6.75, R.z1 + 0.32, 0, 0.08, 0x3a0a0a, glow(0xff4030, 0.95));
  beacon(stat, am.strobe, cx - 3.6, 5.6, R.z1 + 0.3, 0);
  beacon(stat, am.strobe, cx + 3.6, 5.6, R.z1 + 0.3, 0);

  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice(), cells };
}

export interface HallOut extends RoomOut {
  panes: GlassWall[];
}

export function buildHall(ctx: Ctx): HallOut {
  const R = ROOMS.hall;
  const rnd = () => ctx.rng.next();
  const root = new THREE.Group();
  root.name = 'hall';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;
  const H = HALL;

  // Holding-hall palette: one concrete recipe for walls, buttresses and
  // pillars (big 0.8 texel scale), steel trusses, a stained floor.
  const concrete = mat(0x646870, 'concrete', 0.8, 0.8);
  const dark = mat(0x464a52, 'concrete', 0.8, 0.8);
  const steel = S.metal(0x4e5560);
  const glass = glassMat(0x8ac0e0, 0.18);

  floorQuad(stat, mat(0x5a5e62, 'concrete', 0.6, 0.85), R.x0, R.x1, R.z1, R.z0, 0.002);
  wallX(shellG, concrete, R.x0, R.z0, R.z1, R.h, [{ c: H.gateZ, w: 3.6, h: 3.8 }]);
  wallX(shellG, concrete, R.x1, R.z0, R.z1, R.h, [{ c: H.gateZ, w: 3.6, h: 3.8 }]);
  wallZ(shellG, concrete, R.z1, R.x0, R.x1, R.h);
  wallZ(stat, concrete, R.z0 - 0.3, R.x0, R.x1, R.h, [{ c: H.center.x, w: 6.2, h: 6 }], 0.2);
  slab(shellG, mat(0x34363c, 'concrete', 0.8, 0.8), R.x0, R.x1, R.h, R.h + 0.3, R.z1, R.z0);
  // Buttresses + ceiling trusses.
  for (let z = R.z0 - 3; z > H.tankZ; z -= 6) {
    for (const x of [R.x0 + 0.5, R.x1 - 0.5]) box(stat, dark, x, R.h / 2, z, 1.0, R.h, 1.0);
    slab(stat, steel, R.x0, R.x1, R.h - 0.6, R.h - 0.3, z - 0.15, z + 0.15);
  }
  // Floor markings: hazard ring, drains, puddles.
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    box(stat, S.hazard(), H.center.x + Math.cos(a) * 7.5, 0.008, H.center.z + Math.sin(a) * 7.5, 0.35, 0.01, 1.2, -a);
  }
  for (const [x, z, r] of [
    [7, -350, 1.6],
    [15.5, -358, 2.2],
    [10, -366, 1.4],
    [1, -341, 1.2],
  ]) Kit.add(stat, Kit.cyl(r, r, 0.01, 12), S.water(0x22343e), x, 0.006, z, 0, 0, 0, 1, 1, 0.6 + (x % 3) * 0.1);
  Kit.add(stat, Kit.cyl(0.6, 0.6, 0.02, 10), S.grate(0x2a2c30), H.center.x, 0.006, H.center.z);
  // Pillars.
  for (const p of H.pillars) {
    cyl(stat, concrete, p.x, R.h / 2, p.z, 1.1, R.h, 14);
    Kit.add(stat, Kit.cyl(1.16, 1.16, 0.6, 14), S.hazard(), p.x, 0.5, p.z);
    box(stat, steel, p.x, R.h - 0.6, p.z, 2.6, 0.5, 2.6);
    beacon(stat, am.strobe, p.x, 4.2, p.z + 1.1, 0);
    for (let m = 0; m < 4; m++) box(stat, S.plain(0x2a2420), p.x + 1.05, 1.6 + m * 0.14, p.z + 0.2 - m * 0.15, 0.02, 0.06, 0.9, 0, 0, 0.6);
  }
  // Catwalks along the side walls.
  for (const s of [-1, 1]) {
    const xw = s < 0 ? R.x0 : R.x1;
    const xe = xw - s * 2.6;
    slab(stat, S.grate(0x464c54), Math.min(xw, xe), Math.max(xw, xe), 5.9, 6.0, H.tankZ + 1, R.z0 - 1);
    railing(stat, xe, R.z0 - 1, xe, H.tankZ + 1, 6.0);
    for (let z = R.z0 - 4; z > H.tankZ + 2; z -= 8) box(stat, steel, xe, 3.0, z, 0.15, 6.0, 0.15);
  }
  // Hanging industrial lamps.
  for (const [x, z] of [
    [5, -341],
    [17, -341],
    [8, -357],
    [14, -357],
  ]) {
    pipe(stat, S.metal(0x161618), new THREE.Vector3(x, R.h, z), new THREE.Vector3(x, 7.4, z), 0.025, 4);
    Kit.add(stat, Kit.cone(0.9, 0.6, 12), S.metal(0x3a4048), x, 7.2, z);
    Kit.add(stat, Kit.cyl(0.65, 0.65, 0.05, 12), glow(0xfff0d0, 1.2), x, 6.9, z);
  }
  // Minion gates (raised) + dark corridors.
  for (const s of [-1, 1]) {
    const x = s < 0 ? R.x0 : R.x1;
    slab(stat, S.plain(0x0c0d10), Math.min(x + s * 0.2, x + s * 6), Math.max(x + s * 0.2, x + s * 6), 0, 3.9, H.gateZ - 1.9, H.gateZ + 1.9);
    box(stat, steel, x - s * 0.1, 3.6, H.gateZ, 0.25, 0.5, 3.6);
    for (let k = 0; k < 7; k++) box(stat, steel, x - s * 0.05, 3.55, H.gateZ - 1.5 + k * 0.5, 0.1, 0.5, 0.08);
    hazardBand(stat, x - 0.3, x + 0.3, H.gateZ, 3.6);
    beacon(stat, am.warn, x - s * 0.3, 4.4, H.gateZ, s < 0 ? Math.PI / 2 : -Math.PI / 2);
  }

  // The specimen tank: curb, mullions, glass panes, interior.
  slab(stat, dark, R.x0 + 6, R.x1 - 6, 0, 0.4, H.tankZ - 0.4, H.tankZ + 0.4);
  slab(shellG, concrete, R.x0, R.x1, 8.4, R.h, H.tankZ - 0.3, H.tankZ + 0.3);
  slab(shellG, concrete, R.x0, -1.4, 0, 8.4, H.tankZ - 0.3, H.tankZ + 0.3);
  slab(shellG, concrete, 23.4, R.x1, 0, 8.4, H.tankZ - 0.3, H.tankZ + 0.3);
  for (const x of [-1, 5, 11, 17, 23]) box(stat, steel, x, 4.2, H.tankZ, 0.6, 8.4, 0.7);
  const panes: GlassWall[] = [];
  H.paneXs.forEach((x, i) => {
    const g = new GlassWall({ center: new THREE.Vector3(x, 0.4, H.tankZ), w: 5.4, h: 8.0, yaw: 0, tint: 0x8ac0e0 }, glass);
    root.add(g.root);
    if (i === 0) g.setBroken();
    if (i === 1) g.setCracked(2);
    panes.push(g);
  });
  // Tank interior.
  const tz0 = H.tankZ - 0.4;
  const tz1 = R.z1;
  floorQuad(stat, S.water(0x1e3440), R.x0, R.x1, tz1, tz0, 0.02);
  slab(stat, mat(0x2a3c46, 'tiles', 0.6, 0.7), R.x0, R.x1, 0, R.h, tz1 + 0.2, tz1 + 0.3);
  for (const x of [-1, 23]) box(stat, am.tank, x + (x < 0 ? 1.2 : -1.2), 0.08, (tz0 + tz1) / 2, 0.15, 0.08, tz0 - tz1 - 0.6);
  box(stat, am.tank, 11, 0.08, tz1 + 0.6, 22, 0.08, 0.15);
  box(stat, am.tank, 11, 7.9, (tz0 + tz1) / 2, 22, 0.08, 0.2);
  for (let i = 0; i < 6; i++) {
    const x = 1 + i * 4;
    const l = 2 + rnd() * 3;
    pipe(stat, S.metal(0x3e3e42), new THREE.Vector3(x, R.h, -377), new THREE.Vector3(x + rnd() - 0.5, R.h - l, -377 + rnd() - 0.5), 0.05, 4);
  }
  Kit.add(stat, Kit.cyl(1.6, 1.6, 0.25, 16), S.metal(0x6a6e74), 12, 4.5, -378, 0.3, 0, Math.PI / 2 + 0.4, 1, 1, 1);
  Kit.add(stat, Kit.cyl(1.25, 1.25, 0.3, 16), S.grate(0x1a2a34), 12, 4.5, -378, 0.3, 0, Math.PI / 2 + 0.4, 1, 1, 1);
  for (let i = 0; i < 14; i++) box(stat, S.plain(0x2a2420), -0.5 + rnd() * 8, 0.6 + rnd() * 6, H.tankZ - 0.05, 0.03, 0.06, 1.2 + rnd(), 0, rnd() * 3, rnd() * 3);
  // Glass shards from the escape.
  for (let i = 0; i < 18; i++) box(stat, glass, 0 + rnd() * 6, 0.02, H.tankZ + 0.6 + rnd() * 6, 0.3 + rnd() * 0.5, 0.02, 0.2 + rnd() * 0.4, rnd() * 3);
  // Sign above the tank.
  pixelText(stat, 'SPECIMEN X', glow(0xff3020, 1.1), 11, 9.7, H.tankZ + 0.35, 0.16, 0, 0.06);
  pixelText(stat, 'CLASS 5 CONTAINMENT', S.plain(0xd8d0c0), 11, 8.9, H.tankZ + 0.35, 0.05, 0, 0.03);
  // Debris: crates, a dropped tranq rifle, a toppled cart.
  for (const [x, z, s, r] of [
    [-3, -340, 1.1, 0.3],
    [-2, -341.5, 0.8, 0.9],
    [25, -344, 1.0, 0.1],
    [26, -366, 1.2, 0.5],
    [-4, -368, 1.0, 0.2],
  ]) box(stat, S.planks(0x6a5236), x, s / 2, z, s, s, s, r);
  box(stat, S.metal(0x1a1a1a), 6.5, 0.05, -339, 1.1, 0.06, 0.08, 0.8);
  box(stat, S.planks(0x5a3a1a), 6.0, 0.06, -339.3, 0.4, 0.08, 0.1, 0.8);
  decal(stat, S.plain(0x3a0806), 9, 0.006, -344, 2.2, 1.0, 0.6);

  steamVents(ctx, root, [
    { pos: new THREE.Vector3(-1, 7.2, H.tankZ + 0.6), dir: new THREE.Vector3(0.3, -0.2, 1).normalize(), power: 1.1 },
    { pos: new THREE.Vector3(23, 7.2, H.tankZ + 0.6), dir: new THREE.Vector3(-0.3, -0.2, 1).normalize(), power: 1.1 },
  ]);

  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice(), panes };
}
