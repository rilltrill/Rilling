import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { EnvKit } from '../../kit/EnvKit';
import { bake, bakeInto, glow, mat } from './bake';
import { beacon, box, bush, cyl, fern, frameX, frameZ, lightPanel, palm, pipe, sign, slab, wallX, wallZ } from './build';
import type { Ctx, RoomOut } from './ctx';
import { pixelText } from './font';
import { ROOMS, dAtZ, railXAtZ } from './layout';
import { glassMat } from './lobby';
import { BurstDoor } from './setpieces';

// ─── Botanical atrium (greenhouse) ────────────────────────────────────────

export function buildGreenhouse(ctx: Ctx): RoomOut {
  const R = ROOMS.green;
  const rnd = () => ctx.rng.next();
  const root = new THREE.Group();
  root.name = 'green';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;
  const wallTop = 7;
  const ridge = R.h;
  const zc = (R.z0 + R.z1) / 2;
  const len = R.z0 - R.z1;

  const stone = mat(0x8a8478, 'concrete', 1, 0.6);
  const steel = mat(0x4a5a52, 'metal', 1.5);
  const soil = mat(0x3a2e22, 'dirt', 1, 0.8);
  const glass = glassMat(0x8ec8c0, 0.14);

  // Ground: soil beds + a flagstone path along the rail.
  slab(stat, soil, R.x0, R.x1, -0.1, 0, R.z1, R.z0);
  const pathFrom = dAtZ(R.z0) - 0.5;
  const pathTo = dAtZ(R.z1) + 0.5;
  stat.add(EnvKit.ribbon(ctx.curve, 3.6, mat(0x8e8676, 'rock', 1.5, 0.7), { from: pathFrom, to: pathTo, step: 1, y: 0.02 }));
  for (let d = pathFrom; d < pathTo; d += 1.1) {
    for (const s of [-1, 1]) {
      const p = EnvKit.besideRail(ctx.curve, d, s * 1.95, 0.08);
      const f = EnvKit.frameAt(ctx.curve, d);
      box(stat, mat(0x6a6458, 'rock', 2, 0.6), p.x, 0.08, p.z, 0.25, 0.2, 1.0, f.heading);
    }
  }

  // Concrete base + glass side walls with steel mullions.
  for (const x of [R.x0, R.x1]) {
    slab(shellG, stone, x - 0.25, x + 0.25, 0, 1.0, R.z1, R.z0);
    slab(stat, glass, x - 0.04, x + 0.04, 1.0, wallTop, R.z1, R.z0);
    for (let z = R.z1; z <= R.z0 + 0.01; z += 2.75) slab(stat, steel, x - 0.12, x + 0.12, 1.0, wallTop, z - 0.08, z + 0.08);
    slab(stat, steel, x - 0.12, x + 0.12, 3.9, 4.05, R.z1, R.z0);
    slab(stat, steel, x - 0.15, x + 0.15, wallTop - 0.1, wallTop + 0.1, R.z1, R.z0);
  }
  // End walls (gables). The near wall faces the gift shop doorway.
  const shopX = railXAtZ(R.z0);
  const hatchX = railXAtZ(R.z1);
  wallZ(stat, stone, R.z0 - 0.26, R.x0, R.x1, 4.4, [{ c: shopX, w: 3.6, h: 3.1 }], 0.1);
  slab(shellG, stone, R.x0, R.x1, 4.4, wallTop, R.z0 - 0.2, R.z0 + 0.2);
  const labWall = mat(0xd0d6d4, 'tiles', 1.2, 0.35);
  wallZ(shellG, labWall, R.z1, R.x0, R.x1, wallTop, [{ c: hatchX, w: 3.6, h: 3.2 }]);
  for (const z of [R.z0, R.z1]) {
    // Gable triangles (stacked slabs).
    for (let i = 0; i < 8; i++) {
      const y0 = wallTop + (i / 8) * (ridge - wallTop);
      const hw = R.x1 * (1 - i / 8);
      slab(stat, z === R.z1 ? labWall : stone, -hw, hw, y0, y0 + (ridge - wallTop) / 8 + 0.02, z - 0.2, z + 0.2);
    }
  }

  // Pitched glass roof, rafters, ridge beam and the night sky above.
  const slope = Math.atan2(ridge - wallTop, R.x1);
  const span = Math.hypot(ridge - wallTop, R.x1);
  for (const s of [-1, 1]) {
    Kit.add(stat, Kit.box(span, 0.05, len), glass, s * R.x1 / 2, (ridge + wallTop) / 2, zc, 0, 0, -s * slope);
    for (let z = R.z1; z <= R.z0 + 0.01; z += 4) Kit.add(stat, Kit.box(span, 0.22, 0.14), steel, s * R.x1 / 2, (ridge + wallTop) / 2 - 0.1, z, 0, 0, -s * slope);
    for (const t of [0.33, 0.66]) {
      Kit.add(stat, Kit.box(0.14, 0.14, len), steel, s * R.x1 * (1 - t), wallTop + (ridge - wallTop) * t - 0.1, zc);
    }
  }
  slab(stat, steel, -0.15, 0.15, ridge - 0.1, ridge + 0.15, R.z1, R.z0);
  slab(stat, am.sky, R.x0 - 6, R.x1 + 6, ridge + 1.6, ridge + 1.7, R.z1 - 6, R.z0 + 6);
  for (let i = 0; i < 40; i++) box(stat, glow(0xc8d8ff, 0.5 + rnd() * 0.7), R.x0 - 4 + rnd() * (R.x1 - R.x0 + 8), ridge + 1.55, R.z1 - 4 + rnd() * (len + 8), 0.08, 0.02, 0.08);
  Kit.add(stat, Kit.cyl(1.4, 1.4, 0.05, 16), glow(0xeef2ff, 1.2), -7, ridge + 1.5, R.z1 + 6);

  // Jungle silhouettes outside the glass.
  const dark = mat(0x0f1e14, 'leaves', 0.6, 0.5);
  const trunkDark = mat(0x16120e);
  for (let i = 0; i < 14; i++) {
    const s = i % 2 ? 1 : -1;
    const x = s * (17 + rnd() * 6);
    const z = R.z0 + 2 - i * 3.6 - rnd() * 2;
    const h = 7 + rnd() * 6;
    cyl(stat, trunkDark, x, h / 2, z, 0.25, h, 6);
    Kit.add(stat, Kit.jitter(Kit.ico(1, 1), 0.3, i + 3), dark, x, h, z, 0, i, 0, 3 + rnd() * 1.5, 2.2, 3 + rnd() * 1.5);
  }

  // Pond on the right with rocks, lily pads and a little fountain.
  const pond = new THREE.Vector3(6.2, 0, -104);
  Kit.add(stat, Kit.cyl(4.3, 4.3, 0.06, 20), mat(0x1c4a52, 'water', 1, 0.6), pond.x, 0.03, pond.z);
  Kit.add(stat, Kit.cyl(4.6, 4.7, 0.12, 20), mat(0x5a564e, 'rock', 2, 0.6), pond.x, 0.0, pond.z);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 4.4 + rnd() * 0.4;
    Kit.add(stat, Kit.jitter(Kit.ico(0.45, 0), 0.2, i), mat(0x6a6660, 'rock', 2, 0.7), pond.x + Math.cos(a) * r, 0.18, pond.z + Math.sin(a) * r, rnd(), rnd(), 0, 1 + rnd() * 0.6, 0.6, 1);
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 1.2 + rnd() * 2.6;
    Kit.add(stat, Kit.cyl(0.32, 0.32, 0.02, 8), mat(0x3a8a3a), pond.x + Math.cos(a) * r, 0.07, pond.z + Math.sin(a) * r);
  }
  cyl(stat, mat(0x7a766e, 'rock', 2), pond.x, 0.6, pond.z, 0.35, 1.2, 8);
  Kit.add(stat, Kit.cyl(0.08, 0.3, 1.0, 6), glow(0x9ae8ff, 0.55), pond.x, 1.6, pond.z);

  // Planting: palms, ferns, bushes, flowers, hanging vines. Beds stay clear
  // where dinos emerge so they never hide inside foliage.
  const clear: [number, number][] = [
    [-9.5, -100],
    [7.5, -111],
    [-12, -96],
    [11, -100],
    [-8, -112],
    [2, -121],
  ];
  const blocked = (x: number, z: number, r: number) => clear.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < r);
  const bedSpots: [number, number, number][] = [];
  for (let z = R.z0 - 4; z > R.z1 + 3; z -= 6.5) {
    bedSpots.push([-9.5 - rnd() * 2.5, z - rnd() * 2, 1]);
    if (Math.abs(z - pond.z) > 6) bedSpots.push([8.5 + rnd() * 3, z - rnd() * 2, 1]);
  }
  for (const [x, z] of bedSpots) if (!blocked(x, z, 1.8)) palm(stat, x, z, 4 + rnd() * 3, rnd, false);
  // Plants are placed relative to the (curving) path so they never grow into it.
  const fromPath = (z: number, s: number, a: number, b: number) => clampX(railXAtZ(z) + s * (a + rnd() * (b - a)));
  const clampX = (x: number) => Math.max(R.x0 + 1.2, Math.min(R.x1 - 1.2, x));
  for (let i = 0; i < 22; i++) {
    const s = i % 2 ? 1 : -1;
    const z = R.z0 - 2 - rnd() * (len - 4);
    const x = fromPath(z, s, 3.6, 12);
    if (Math.hypot(x - pond.x, z - pond.z) < 5.2 || blocked(x, z, 3)) continue;
    if (i % 3 === 0) bush(stat, x, z, 0.7 + rnd() * 0.7, i + 11, rnd() < 0.5 ? 0x2c6428 : 0x386e2a);
    else fern(stat, x, z, 1.1 + rnd() * 0.7, rnd);
  }
  const petals = [0xe04a6a, 0xf0c040, 0xe8e8f0, 0xd06aa0];
  for (let i = 0; i < 40; i++) {
    const s = i % 2 ? 1 : -1;
    const z = R.z0 - 3 - rnd() * (len - 6);
    const x = fromPath(z, s, 2.4, 5.5);
    if (Math.hypot(x - pond.x, z - pond.z) < 5.0) continue;
    cyl(stat, mat(0x2e6a28), x, 0.2, z, 0.015, 0.4, 4);
    Kit.add(stat, Kit.ico(0.09, 0), mat(petals[i % 4]), x, 0.42, z);
  }
  // Giant leaves (monstera-like) near the path edges.
  for (let i = 0; i < 10; i++) {
    const s = i % 2 ? 1 : -1;
    const z = R.z0 - 5 - i * 3.8;
    const x = fromPath(z, s, 3.0, 4.5);
    if (Math.hypot(x - pond.x, z - pond.z) < 5) continue;
    Kit.add(stat, Kit.cyl(0.6, 0.6, 0.02, 9), mat(0x2a7a34, 'leaves', 2, 0.4, true), x, 0.7, z, 0.6 * s, rnd() * 3, 0.4, 1, 1, 1.4);
    cyl(stat, mat(0x2e6a28), x, 0.35, z, 0.02, 0.7, 4);
  }
  for (let i = 0; i < 18; i++) {
    const x = R.x0 + 1.5 + rnd() * (R.x1 - R.x0 - 3);
    const z = R.z0 - 2 - rnd() * (len - 4);
    if (Math.abs(x - railXAtZ(z)) < 2.2) continue;
    const top = wallTop + (ridge - wallTop) * (1 - Math.abs(x) / R.x1) - 0.2;
    const l = 1.5 + rnd() * 3;
    pipe(stat, mat(0x2a5a26, 'leaves', 2, 0.4), new THREE.Vector3(x, top, z), new THREE.Vector3(x + rnd() * 0.4 - 0.2, top - l, z), 0.035, 4);
    Kit.add(stat, Kit.ico(0.14, 0), mat(0x3a7a30), x, top - l, z);
  }
  // Misting line under the roof.
  for (const x of [-5, 5]) {
    const y = wallTop + (ridge - wallTop) * (1 - 5 / R.x1) - 0.6;
    slab(stat, mat(0x9a9a9a, 'metal', 2), x - 0.03, x + 0.03, y - 0.03, y + 0.03, R.z1, R.z0);
    for (let z = R.z1 + 2; z < R.z0; z += 3) box(stat, mat(0x6a6a6a), x, y - 0.08, z, 0.06, 0.12, 0.06);
  }
  // Bed uplights + an info plaque + a bench.
  for (let d = pathFrom + 4; d < pathTo - 3; d += 7) {
    for (const s of [-1, 1]) {
      const p = EnvKit.besideRail(ctx.curve, d, s * 2.6);
      box(stat, glow(0x8af0a0, 0.9), p.x, 0.1, p.z, 0.22, 0.12, 0.22);
    }
  }
  sign(stat, 'PREHISTORIC FLORA', -4.2, 1.0, -86, 0.5, 0.04, 0x2a3a22, mat(0xe8e0c0));
  cyl(stat, mat(0x2a2a2a), -4.2, 0.45, -86.02, 0.04, 0.9, 6);
  {
    const b = new THREE.Group();
    b.position.set(2.8, 0, -116);
    b.rotation.y = -0.4;
    stat.add(b);
    box(b, mat(0x5e3e26, 'planks', 1.2), 0, 0.45, 0, 2, 0.08, 0.6);
    for (const sx of [-0.8, 0.8]) box(b, mat(0x3a3a3a), sx, 0.22, 0, 0.08, 0.45, 0.55);
  }
  // Hatchery entrance: sliding doors parked open, sign, beacons.
  frameZ(stat, mat(0x5a6068, 'metal', 1.5), R.z1 + 0.15, hatchX, 3.6, 3.2);
  slab(stat, glass, hatchX - 3.6, hatchX - 1.8, 0, 3.2, R.z1 + 0.25, R.z1 + 0.3);
  slab(stat, glass, hatchX + 1.8, hatchX + 3.6, 0, 3.2, R.z1 + 0.25, R.z1 + 0.3);
  sign(stat, 'HATCHERY', hatchX, 3.85, R.z1 + 0.3, 0, 0.075, 0x1a4a3a, glow(0x9affc0, 0.9));
  beacon(stat, am.strobe, hatchX - 2.6, 3.4, R.z1 + 0.25, 0);
  beacon(stat, am.strobe, hatchX + 2.6, 3.4, R.z1 + 0.25, 0);

  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice() };
}

// ─── Hatchery lab ─────────────────────────────────────────────────────────

export interface HatchOut extends RoomOut {
  doorL: BurstDoor;
  doorR: BurstDoor;
}

export function buildHatchery(ctx: Ctx): HatchOut {
  const R = ROOMS.hatch;
  const rnd = () => ctx.rng.next();
  const root = new THREE.Group();
  root.name = 'hatch';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;
  const exitX = railXAtZ(R.z1);
  const doorLZ = -143;
  const doorRZ = -149;

  const white = mat(0xd2d8d6, 'tiles', 1.2, 0.35);
  const steelLight = mat(0xb4bac0, 'metal', 2, 0.45);
  const steelDark = mat(0x4a5058, 'metal', 1.5);
  const stripe = mat(0x2a8a5a);
  const glass = glassMat(0xb0e0d0, 0.16);

  slab(stat, mat(0xb2bab8, 'tiles', 0.8, 0.55), R.x0, R.x1, -0.1, 0.002, R.z1, R.z0);
  wallX(shellG, white, R.x0, R.z0, R.z1, R.h, [{ c: doorLZ, w: 2.2, h: 2.6 }]);
  wallX(shellG, white, R.x1, R.z0, R.z1, R.h, [{ c: doorRZ, w: 2.2, h: 2.6 }]);
  wallZ(shellG, white, R.z1, R.x0, R.x1, R.h, [{ c: exitX, w: 3.2, h: 2.9 }]);
  slab(shellG, mat(0xc4c8c6, 'tiles', 0.7, 0.3), R.x0, R.x1, R.h, R.h + 0.3, R.z1, R.z0);
  for (const x of [R.x0 + 0.21, R.x1 - 0.21]) slab(stat, stripe, x - 0.02, x + 0.02, 1.1, 1.3, R.z1, R.z0);
  slab(stat, stripe, R.x0, exitX - 1.8, 1.1, 1.3, R.z1 + 0.19, R.z1 + 0.23);
  slab(stat, stripe, exitX + 1.8, R.x1, 1.1, 1.3, R.z1 + 0.19, R.z1 + 0.23);
  frameX(stat, steelDark, R.x0, doorLZ, 2.2, 2.6);
  frameX(stat, steelDark, R.x1, doorRZ, 2.2, 2.6);
  frameZ(stat, steelDark, R.z1 + 0.1, exitX, 3.2, 2.9);

  // Ceiling light grid (a couple dead / flickering).
  for (let z = R.z0 - 3; z > R.z1 + 1; z -= 5) {
    for (const x of [-4.5, 0, 4.5]) {
      const dead = (x === 4.5 && z < -140) || (x === -4.5 && z > -135 && z < -128);
      lightPanel(stat, x, R.h, z, 1.4, 0.7, dead ? mat(0x6a6e70) : x === 0 && z < -145 ? am.flicker : glow(0xeaf6ff, 1.15));
    }
  }

  // Incubator tables.
  const dome = Kit.track(new THREE.SphereGeometry(1.45, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2));
  const tables: [number, number, number][] = [];
  for (const zc of [-130.7, -138.7, -146.7]) for (const s of [-1, 1]) tables.push([s * 4.65, zc, s]);
  tables.forEach(([x, z, s], i) => {
    const broken = i === 2;
    slab(stat, steelLight, x - 1.75, x + 1.75, 0.82, 0.9, z - 1.7, z + 1.7);
    for (const lx of [-1.6, 1.6]) for (const lz of [-1.55, 1.55]) box(stat, steelDark, x + lx, 0.41, z + lz, 0.07, 0.82, 0.07);
    slab(stat, steelDark, x - 1.6, x + 1.6, 0.25, 0.3, z - 1.55, z + 1.55);
    // Tray + eggs + dome.
    slab(stat, mat(0x3a3e44), x - 1.3, x + 1.3, 0.9, 1.02, z - 1.3, z + 1.3);
    slab(stat, mat(0xd8c8a0, 'sand', 3, 0.5), x - 1.2, x + 1.2, 1.0, 1.04, z - 1.2, z + 1.2);
    for (let ex = 0; ex < 3; ex++) {
      for (let ez = 0; ez < 3; ez++) {
        const px = x - 0.75 + ex * 0.75;
        const pz = z - 0.75 + ez * 0.75;
        if (broken && (ex + ez) % 2 === 0) {
          // Hatched: split shells.
          Kit.add(stat, Kit.sphere(0.16, 8, 4), mat(0xe8dcc0), px - 0.08, 1.07, pz, 0, 0, 0.6, 1, 0.6, 1);
          Kit.add(stat, Kit.sphere(0.14, 8, 4), mat(0xe8dcc0), px + 0.1, 1.06, pz + 0.05, 0, 0, -0.9, 1, 0.6, 1);
          continue;
        }
        Kit.add(stat, Kit.sphere(0.15, 8, 6), am.egg, px, 1.2, pz, rnd() * 0.3, 0, rnd() * 0.3, 1, 1.35, 1);
      }
    }
    if (!broken) {
      Kit.add(stat, dome, glass, x, 1.02, z, 0, 0, 0, 1, 0.42, 1);
    } else {
      for (let k = 0; k < 8; k++) box(stat, glass, x + rnd() * 3 - 1.5, 0.02, z + 2 + rnd() * 1.5, 0.3 + rnd() * 0.3, 0.02, 0.2 + rnd() * 0.3, rnd() * 3);
    }
    // Heat lamps on a gantry.
    pipe(stat, steelDark, new THREE.Vector3(x - 1.7, 0.9, z), new THREE.Vector3(x - 1.7, 2.4, z), 0.04, 6);
    pipe(stat, steelDark, new THREE.Vector3(x - 1.7, 2.4, z), new THREE.Vector3(x + 1.2, 2.4, z), 0.035, 6);
    for (const lz of [-0.7, 0.7]) {
      Kit.add(stat, Kit.cone(0.22, 0.25, 8), steelDark, x + 0.2, 2.28, z + lz);
      Kit.add(stat, Kit.sphere(0.1, 6, 4), am.egg, x + 0.2, 2.16, z + lz);
    }
    // Control box with a screen facing the aisle.
    box(stat, mat(0xe0e4e2), x - s * 1.85, 1.2, z + 1.2, 0.3, 0.5, 0.5);
    box(stat, am.screen, x - s * 2.01, 1.25, z + 1.2, 0.02, 0.3, 0.38);
  });

  // Embryo tanks along both walls.
  const tankSpots: [number, number][] = [];
  for (const z of [-128.5, -134.5, -152.5, -158.5]) tankSpots.push([R.x0 + 1.3, z]);
  for (const z of [-128.5, -134.5, -140.5, -156.5]) tankSpots.push([R.x1 - 1.3, z]);
  const embryo = mat(0x3a2a24);
  const bubbleSpots: THREE.Vector3[] = [];
  for (const [x, z] of tankSpots) {
    cyl(stat, steelDark, x, 0.2, z, 0.78, 0.4, 14);
    cyl(stat, steelDark, x, 3.15, z, 0.78, 0.3, 14);
    Kit.add(stat, Kit.cyl(0.66, 0.66, 2.7, 14), am.fluid, x, 1.75, z);
    Kit.add(stat, Kit.cyl(0.72, 0.72, 2.75, 14), glass, x, 1.75, z);
    // Curled embryo silhouette.
    const e = new THREE.Group();
    e.position.set(x, 1.8, z);
    e.rotation.y = rnd() * 6;
    stat.add(e);
    Kit.add(e, Kit.jitter(Kit.ico(0.28, 1), 0.06, Math.round(x * 10 + z)), embryo, 0, 0, 0, 0.3, 0, 0, 1, 0.8, 1.2);
    Kit.add(e, Kit.sphere(0.17, 8, 6), embryo, 0, 0.18, 0.28);
    Kit.add(e, Kit.cone(0.1, 0.5, 6), embryo, 0, -0.18, -0.3, 2.2, 0, 0);
    Kit.add(e, Kit.box(0.05, 0.22, 0.05), embryo, 0.12, -0.1, 0.18, 0.6, 0, 0);
    pipe(stat, mat(0x2a2e34), new THREE.Vector3(x, 0.4, z), new THREE.Vector3(x, 1.4, z), 0.02, 4);
    pipe(stat, mat(0x2a3a2a), new THREE.Vector3(x + 0.3, 3.3, z), new THREE.Vector3(x + 0.3, R.h, z), 0.06, 6);
    pipe(stat, mat(0x6a2a2a), new THREE.Vector3(x - 0.3, 3.3, z), new THREE.Vector3(x - 0.3, R.h, z), 0.05, 6);
    box(stat, mat(0xf0d020, 'hazard', 3), x + (x < 0 ? 0.8 : -0.8), 0.25, z, 0.02, 0.3, 0.9);
    bubbleSpots.push(new THREE.Vector3(x, 0.45, z));
  }
  // Rising bubbles (one instanced draw call).
  const per = 5;
  const bubbles = new THREE.InstancedMesh(Kit.sphere(0.045, 6, 4), Kit.glow(0xd8ffe8, 1.1), bubbleSpots.length * per);
  bubbles.frustumCulled = false;
  root.add(bubbles);
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  ctx.animators.push((_dt, t) => {
    if (!root.visible) return;
    let i = 0;
    for (let k = 0; k < bubbleSpots.length; k++) {
      const b = bubbleSpots[k];
      for (let j = 0; j < per; j++) {
        const ph = (t * (0.28 + j * 0.05) + j / per + k * 0.37) % 1;
        _p.set(b.x + Math.sin(t * 3 + j * 2 + k) * 0.25, b.y + ph * 2.6, b.z + Math.cos(t * 2.3 + j + k) * 0.25);
        _s.setScalar(0.6 + j * 0.15);
        _m.compose(_p, _q, _s);
        bubbles.setMatrixAt(i++, _m);
      }
    }
    bubbles.instanceMatrix.needsUpdate = true;
  });

  // Robotic arms over four of the tables (animated).
  const armMat = mat(0xe08a20, 'metal', 2, 0.4);
  const jointMat = mat(0x2a2c30, 'metal', 2);
  tables.slice(0, 4).forEach(([x, z, s], i) => {
    const bx = x - s * 1.45;
    const bz = z - 1.25;
    cyl(stat, jointMat, bx, 1.0, bz, 0.2, 0.2, 10);
    const yawP = new THREE.Group();
    yawP.position.set(bx, 1.1, bz);
    root.add(yawP);
    const shoulder = new THREE.Group();
    shoulder.position.set(0, 0.12, 0);
    yawP.add(shoulder);
    bakeInto(shoulder, (g) => {
      Kit.add(g, Kit.cyl(0.13, 0.13, 0.22, 10), jointMat, 0, 0, 0, 0, 0, Math.PI / 2);
      Kit.add(g, Kit.box(0.14, 0.82, 0.14), armMat, 0, 0.41, 0);
    });
    const elbow = new THREE.Group();
    elbow.position.set(0, 0.82, 0);
    shoulder.add(elbow);
    bakeInto(elbow, (g) => {
      Kit.add(g, Kit.cyl(0.1, 0.1, 0.18, 10), jointMat, 0, 0, 0, 0, 0, Math.PI / 2);
      Kit.add(g, Kit.box(0.11, 0.11, 0.7), armMat, 0, 0, 0.35);
      Kit.add(g, Kit.box(0.04, 0.14, 0.12), jointMat, 0.05, -0.04, 0.74);
      Kit.add(g, Kit.box(0.04, 0.14, 0.12), jointMat, -0.05, -0.04, 0.74);
      Kit.add(g, Kit.sphere(0.035, 6, 4), glow(0x60ff90, 1.4), 0, -0.07, 0.7);
    });
    const ph = i * 1.7;
    ctx.animators.push((_dt, t) => {
      if (!root.visible) return;
      const k = t * 0.55 + ph;
      yawP.rotation.y = (s > 0 ? -0.6 : 0.6) + Math.sin(k) * 0.8;
      shoulder.rotation.x = 0.35 + Math.sin(k * 1.3 + 1) * 0.3;
      elbow.rotation.x = 0.55 + Math.sin(k * 1.7 + 2) * 0.35 + Math.max(0, Math.sin(k * 3.1)) * 0.2;
    });
  });

  // Consoles + genome wall display by the exit.
  for (const s of [-1, 1]) {
    const cx = exitX + s * 5.5;
    slab(stat, mat(0xd8dcda), cx - 2, cx + 2, 0, 0.85, R.z1 + 0.3, R.z1 + 1.1);
    slab(stat, mat(0x3a3e44), cx - 2.05, cx + 2.05, 0.85, 0.9, R.z1 + 0.25, R.z1 + 1.15);
    for (const dx of [-1.2, 0, 1.2]) {
      box(stat, mat(0x1a1c20), cx + dx, 1.25, R.z1 + 0.55, 0.8, 0.5, 0.06);
      box(stat, am.screen, cx + dx, 1.25, R.z1 + 0.59, 0.7, 0.4, 0.02);
      for (let k = 0; k < 6; k++) {
        const yy = 1.08 + k * 0.06;
        const off = Math.sin(k * 1.1 + dx) * 0.12;
        box(stat, glow(0xff60a0, 1), cx + dx + off, yy, R.z1 + 0.61, 0.04, 0.03, 0.01);
        box(stat, glow(0x60ffb0, 1), cx + dx - off, yy, R.z1 + 0.61, 0.04, 0.03, 0.01);
      }
    }
    // Sequencer bars high on the wall.
    for (let k = 0; k < 14; k++) {
      const col = [0xff5050, 0x50ff80, 0x5090ff, 0xffd040][k % 4];
      box(stat, glow(col, 0.8), cx - 1.8 + k * 0.28, 3.2 + Math.sin(k * 2.1) * 0.25, R.z1 + 0.24, 0.18, 0.5 + Math.abs(Math.cos(k * 1.3)) * 0.5, 0.02);
    }
  }
  sign(stat, 'STAFF CAFETERIA', exitX, 3.45, R.z1 + 0.28, 0, 0.055, 0x2a2a2e, mat(0xf0f0f0));
  // Signs, hazard tape, claw marks, debris.
  sign(stat, 'LAB B', R.x0 + 0.25, 2.95, doorLZ, Math.PI / 2, 0.06, 0x1a4a3a, mat(0xe8fff0));
  sign(stat, 'LAB C', R.x1 - 0.25, 2.95, doorRZ, -Math.PI / 2, 0.06, 0x1a4a3a, mat(0xe8fff0));
  pixelText(stat, 'GENETICS DIV.', mat(0x2a8a5a), R.x0 + 0.22, 3.8, -136, 0.09, Math.PI / 2, 0.03);
  for (let i = 0; i < 4; i++) box(stat, mat(0x2a2220), R.x0 + 0.23, 1.6 + i * 0.12, doorLZ + 1.6 + i * 0.1, 0.02, 0.05, 1.0, 0, 0, 0.6);
  for (let i = 0; i < 14; i++) box(stat, mat(0xf0eee8), -2 + rnd() * 4, 0.006, -127 - rnd() * 30, 0.22, 0.004, 0.3, rnd() * 3);
  box(stat, mat(0x3a0806), -1.2, 0.006, -144, 0.8, 0.004, 2.6, 0.3);
  box(stat, mat(0x2a2c30), 1.9, 0.3, -152, 0.4, 0.05, 0.4, 0, 0, 1.3);
  beacon(stat, am.strobe, R.x0 + 0.25, 3.5, -131, Math.PI / 2);
  beacon(stat, am.strobe, R.x1 - 0.25, 3.5, -137, -Math.PI / 2);
  beacon(stat, am.strobe, R.x0 + 0.25, 3.5, -155, Math.PI / 2);

  // Side doors (raptors smash through) + dark corridors behind them.
  for (const [x, z, s] of [
    [R.x0, doorLZ, -1],
    [R.x1, doorRZ, 1],
  ] as [number, number, number][]) {
    slab(stat, mat(0x101214), x + s * 0.2, x + s * 4, 0, 2.8, z - 1.6, z + 1.6);
  }
  const doorL = new BurstDoor({ hinge: new THREE.Vector3(R.x0 + 0.05, 0, doorLZ + 1.1), w: 2.2, h: 2.6, yaw: Math.PI / 2, swing: -1, kind: 'blast', style: 'lab' });
  const doorR = new BurstDoor({ hinge: new THREE.Vector3(R.x1 - 0.05, 0, doorRZ + 1.1), w: 2.2, h: 2.6, yaw: Math.PI / 2, swing: 1, kind: 'blast', style: 'lab' });
  root.add(doorL.root, doorR.root);

  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice(), doorL, doorR };
}
