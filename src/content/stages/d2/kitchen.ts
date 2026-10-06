import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { bake, bakeInto, glow, mat } from './bake';
import { beacon, box, decal, floorQuad, frameX, frameZ, hazardBand, lightPanel, pipe, sign, slab, vent, wallX, wallZ } from './build';
import type { Ctx, RoomOut } from './ctx';
import { pixelText } from './font';
import { ROOMS, railXAtZ } from './layout';
import { BurstDoor } from './setpieces';
import { S } from './surf';

// ─── Staff kitchen ────────────────────────────────────────────────────────

export interface KitchenOut extends RoomOut {
  freezer: BurstDoor;
}

export function buildKitchen(ctx: Ctx): KitchenOut {
  const R = ROOMS.kitchen;
  const rnd = () => ctx.rng.next();
  const root = new THREE.Group();
  root.name = 'kitchen';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;
  const exitX = railXAtZ(R.z1);
  const freezerZ = -183.5;

  // Canteen palette: glazed wall tiles, painted block upper walls, stainless
  // counters, a chequered vinyl floor.
  const tile = mat(0xd8dcd4, 'tiles', 1.6, 0.7);
  const upper = mat(0x8a9aa0, 'concrete', 1, 0.6);
  const steel = S.steel(0xb8bec4);
  const steelDark = S.metal(0x5e646c);
  const black = S.metal(0x1e1e22);

  floorQuad(stat, mat(0xc4c4bc, 'checker', 1.2, 0.85), R.x0, R.x1, R.z1, R.z0, 0.002);
  wallX(shellG, upper, R.x0, R.z0, R.z1, R.h);
  wallX(shellG, upper, R.x1, R.z0, R.z1, R.h, [{ c: freezerZ, w: 2.0, h: 2.6 }]);
  wallZ(shellG, upper, R.z1, R.x0, R.x1, R.h, [{ c: exitX, w: 3.4, h: 2.8 }]);
  slab(shellG, mat(0xa4a8a6, 'tiles', 0.7, 0.55), R.x0, R.x1, R.h, R.h + 0.3, R.z1, R.z0);
  // Tiled lower walls.
  for (const x of [R.x0 + 0.22, R.x1 - 0.22]) slab(stat, tile, x - 0.03, x + 0.03, 0, 2.0, R.z1, R.z0).userData.pw = 'tiling';
  slab(stat, tile, R.x0, exitX - 1.9, 0, 2.0, R.z1 + 0.19, R.z1 + 0.24).userData.pw = 'tiling';
  slab(stat, tile, exitX + 1.9, R.x1, 0, 2.0, R.z1 + 0.19, R.z1 + 0.24).userData.pw = 'tiling';
  frameZ(stat, steelDark, R.z1 + 0.1, exitX, 3.4, 2.8);
  frameX(stat, steelDark, R.x1, freezerZ, 2.0, 2.6);

  // Swing doors from the hatchery, parked open.
  const hx = railXAtZ(R.z0);
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    p.position.set(hx + s * 1.6, 0, R.z0 - 0.25);
    p.rotation.y = s > 0 ? -1.35 : 1.35 + Math.PI;
    stat.add(p);
    box(p, steel, 0.8, 1.25, 0, 1.55, 2.3, 0.06);
    Kit.add(p, Kit.cyl(0.18, 0.18, 0.07, 10), steel, 0.8, 1.75, 0, Math.PI / 2, 0, 0);
  }

  // Lights.
  for (let z = R.z0 - 3; z > R.z1 + 1; z -= 6) {
    for (const x of [-4.5, 4.5]) lightPanel(stat, x, R.h, z, 1.5, 0.5, z < -180 && x < 0 ? am.flicker : glow(0xf0f4ff, 1.1));
  }

  // Islands (stainless) with a cross-aisle between them.
  const islands: [number, number, number, number][] = [];
  for (const s of [-1, 1]) {
    islands.push([s * 3.8, s * 5.4, -167, -176]);
    islands.push([s * 3.8, s * 5.4, -178.6, -187.6]);
  }
  for (const [xa, xb, z0, z1] of islands) {
    const x0 = Math.min(xa, xb);
    const x1 = Math.max(xa, xb);
    slab(stat, steelDark, x0 + 0.05, x1 - 0.05, 0.1, 0.88, z1 + 0.05, z0 - 0.05).userData.pw = 'island';
    slab(stat, steel, x0, x1, 0.88, 0.95, z1, z0);
    slab(stat, black, x0 + 0.1, x1 - 0.1, 0, 0.1, z1 + 0.1, z0 - 0.1);
    for (let z = z0 - 1.1; z > z1 + 0.5; z -= 2.2) {
      box(stat, steelDark, (x0 + x1) / 2 + (x0 < 0 ? 0.81 : -0.81), 0.5, z, 0.02, 0.62, 1.8).userData.pw = 'cabDoor';
      box(stat, steel, (x0 + x1) / 2 + (x0 < 0 ? 0.83 : -0.83), 0.7, z, 0.03, 0.05, 0.5).userData.pw = 'cabDoor';
    }
    // Clutter on the counter tops.
    const cx = (x0 + x1) / 2;
    for (let z = z0 - 0.7; z > z1 + 0.5; z -= 1.2 + rnd() * 0.6) {
      const r = rnd();
      if (r < 0.25) {
        Kit.add(stat, Kit.cyl(0.24, 0.22, 0.32, 10), steel, cx + rnd() * 0.4 - 0.2, 1.11, z);
        Kit.add(stat, Kit.cyl(0.25, 0.25, 0.03, 10), steelDark, cx + rnd() * 0.4 - 0.2, 1.28, z);
      } else if (r < 0.5) {
        box(stat, S.plain(0xa87a4a), cx, 0.97, z, 0.6, 0.04, 0.4, rnd());
        for (let k = 0; k < 3; k++) Kit.add(stat, Kit.ico(0.07, 0), S.plain([0xd03020, 0x50a030, 0xe0a020][k]), cx + rnd() * 0.4 - 0.2, 1.03, z + rnd() * 0.3 - 0.15);
      } else if (r < 0.75) {
        Kit.add(stat, Kit.cyl(0.18, 0.12, 0.12, 10), S.plain(0xe8e8e4), cx, 1.01, z);
        box(stat, S.plain(0x2a2a2a), cx + 0.25, 0.97, z + 0.2, 0.32, 0.015, 0.05, 0.6);
      } else {
        Kit.add(stat, Kit.cyl(0.22, 0.22, 0.04, 10), black, cx, 0.98, z);
        box(stat, black, cx + 0.32, 0.98, z, 0.35, 0.03, 0.05);
      }
    }
    // Pot rack above.
    const ry = 2.55;
    slab(stat, steelDark, cx - 0.04, cx + 0.04, ry - 0.02, ry + 0.02, z1 + 0.3, z0 - 0.3);
    pipe(stat, steelDark, new THREE.Vector3(cx, ry, z0 - 0.5), new THREE.Vector3(cx, R.h, z0 - 0.5), 0.02, 4);
    pipe(stat, steelDark, new THREE.Vector3(cx, ry, z1 + 0.5), new THREE.Vector3(cx, R.h, z1 + 0.5), 0.02, 4);
    for (let z = z0 - 0.8; z > z1 + 0.6; z -= 0.75) {
      const pr = 0.13 + rnd() * 0.1;
      pipe(stat, black, new THREE.Vector3(cx, ry, z), new THREE.Vector3(cx, ry - 0.25, z), 0.008, 3).userData.pw = 'panHook';
      Kit.add(stat, Kit.cyl(pr, pr * 0.9, 0.04 + rnd() * 0.18, 10), rnd() < 0.5 ? steelDark : S.metal(0xa05a30), cx, ry - 0.3 - pr, z, Math.PI / 2, 0, 0).userData.pw = 'pan';
    }
  }

  // Wall counters with stoves, ovens, sinks and a long extractor hood.
  for (const s of [-1, 1]) {
    const xa = s * 9;
    const xb = s * 7.9;
    const x0 = Math.min(xa, xb);
    const x1 = Math.max(xa, xb);
    const runs: [number, number][] = s > 0 ? [[-162.4, freezerZ + 1.3], [freezerZ - 1.3, -193.6]] : [[-162.4, -193.6]];
    for (const [z0, z1] of runs) {
      slab(stat, steelDark, x0, x1, 0, 0.9, z1, z0).userData.pw = 'counterBase';
      slab(stat, steel, x0 - 0.05, x1 + 0.05, 0.9, 0.96, z1, z0);
    }
    const front = s * 7.88;
    for (let z = -165; z > -192; z -= 3.4) {
      if (s > 0 && Math.abs(z - freezerZ) < 2) continue;
      const kind = Math.abs(Math.round(z)) % 3;
      if (kind === 0) {
        // Gas range: four burners with live flames.
        for (const dz of [-0.45, 0.45]) {
          for (const dx of [-0.25, 0.25]) {
            Kit.add(stat, Kit.cyl(0.14, 0.14, 0.03, 10), black, (x0 + x1) / 2 + dx, 0.98, z + dz);
            Kit.add(stat, Kit.cone(0.1, 0.12, 8), am.flame, (x0 + x1) / 2 + dx, 1.05, z + dz);
          }
        }
        box(stat, black, front - s * 0.01, 0.48, z, 0.02, 0.62, 1.4).userData.pw = 'rangeFront';
        box(stat, S.plain(0xd04020), front - s * 0.02, 0.85, z - 0.5, 0.02, 0.05, 0.05).userData.pw = 'knob';
      } else if (kind === 1) {
        box(stat, black, front - s * 0.01, 0.5, z, 0.02, 0.55, 1.2).userData.pw = 'ovenFront';
        box(stat, steel, front - s * 0.03, 0.82, z, 0.03, 0.04, 0.9).userData.pw = 'knob';
      } else {
        slab(stat, S.steel(0x7a8088), (x0 + x1) / 2 - 0.35, (x0 + x1) / 2 + 0.35, 0.8, 0.96, z - 0.5, z + 0.5).userData.pw = 'sink';
        pipe(stat, steel, new THREE.Vector3(s * 8.8, 0.96, z), new THREE.Vector3(s * 8.8, 1.4, z), 0.025, 5);
        pipe(stat, steel, new THREE.Vector3(s * 8.8, 1.4, z), new THREE.Vector3(s * 8.5, 1.35, z), 0.02, 5);
      }
    }
    // Hood + duct + wall shelves with plates.
    slab(stat, steel, Math.min(s * 9, s * 7.6), Math.max(s * 9, s * 7.6), 2.4, 3.1, -192, -164).userData.pw = 'hood';
    slab(stat, steelDark, Math.min(s * 8.9, s * 8.3), Math.max(s * 8.9, s * 8.3), 3.1, R.h, -180, -176);
    for (let z = -166; z > -192; z -= 4) {
      if (s > 0 && Math.abs(z - freezerZ) < 2) continue;
      for (let k = 0; k < 5; k++) Kit.add(stat, Kit.cyl(0.13, 0.13, 0.02, 10), S.plain(0xf0f0ea), s * 8.7, 2.05, z - 0.6 + k * 0.3, 0, 0, Math.PI / 2 - s * 0.2);
    }
  }
  // Walk-in freezer interior (frosty), visible once its door is blown.
  slab(stat, S.steel(0xa8c8d8), R.x1 + 0.2, R.x1 + 4.2, 0, 2.8, freezerZ - 1.8, freezerZ + 1.8);
  box(stat, glow(0x9ad8ff, 0.7), R.x1 + 2.2, 2.7, freezerZ, 1.2, 0.05, 0.4);
  for (let k = 0; k < 3; k++) {
    pipe(stat, S.plain(0x2a2a2a), new THREE.Vector3(R.x1 + 1.5 + k * 0.8, 2.8, freezerZ - 0.6 + k * 0.5), new THREE.Vector3(R.x1 + 1.5 + k * 0.8, 2.0, freezerZ - 0.6 + k * 0.5), 0.02, 3);
    Kit.add(stat, Kit.capsule(0.22, 0.6, 2, 7), S.plain(0x9a2a2a), R.x1 + 1.5 + k * 0.8, 1.45, freezerZ - 0.6 + k * 0.5);
  }
  sign(stat, 'FREEZER', R.x1 - 0.25, 2.95, freezerZ, -Math.PI / 2, 0.06, 0x2a3a4a, glow(0xbfe8ff, 0.8));
  const freezer = new BurstDoor({ hinge: new THREE.Vector3(R.x1 - 0.05, 0, freezerZ + 1.0), w: 2.0, h: 2.6, yaw: Math.PI / 2, swing: 1, kind: 'blast', style: 'steel' });
  root.add(freezer.root);

  // Floor mess: dropped pans, spilled sauce, a blood trail into the freezer.
  for (let i = 0; i < 5; i++) Kit.add(stat, Kit.cyl(0.22, 0.22, 0.03, 10), black, -2 + rnd() * 4, 0.015, -168 - rnd() * 20);
  decal(stat, S.plain(0x8a2a10), -1.5, 0.006, -172, 1.2, 0.8, 0.5).userData.pw = 'sauce';
  for (let i = 0; i < 6; i++) decal(stat, S.plain(0x3a0806), 3 + i * 0.95, 0.006, -181 - i * 0.4, 0.5, 0.3, rnd()).userData.pw = 'bloodSpot';
  // Trolley.
  slab(stat, steel, -2.6, -1.8, 0.7, 0.75, -189.5, -188.4);
  slab(stat, steel, -2.6, -1.8, 0.2, 0.25, -189.5, -188.4);
  for (const [dx, dz] of [
    [-2.55, -189.45],
    [-1.85, -189.45],
    [-2.55, -188.45],
    [-1.85, -188.45],
  ]) box(stat, steelDark, dx, 0.4, dz, 0.03, 0.75, 0.03);
  beacon(stat, am.strobe, R.x0 + 0.25, 3.3, -170, Math.PI / 2);
  beacon(stat, am.strobe, R.x1 - 0.25, 3.3, -175, -Math.PI / 2);
  sign(stat, 'SERVER ROOM', exitX, 3.35, R.z1 + 0.3, 0, 0.055, 0x2a2a2e, S.plain(0xd8e8ff));
  pixelText(stat, 'KITCHEN', S.plain(0x5a6068), R.x0 + 0.24, 3.4, -177, 0.12, Math.PI / 2, 0.03);

  ctx.pw?.room('kitchen', { root, stat, shell: shellG, freezer });
  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice(), freezer };
}

// ─── Server room ──────────────────────────────────────────────────────────

export interface ServersOut extends RoomOut {
  bulkhead: THREE.Group;
}

export function buildServers(ctx: Ctx): ServersOut {
  const R = ROOMS.servers;
  const rnd = () => ctx.rng.next();
  const root = new THREE.Group();
  root.name = 'servers';
  const stat = new THREE.Group();
  const shellG = new THREE.Group();
  const am = ctx.am;
  const exitX = railXAtZ(R.z1);

  // Machine-room palette: metal wall panels, near-black racks with grilled
  // server fronts (texture, not geometry), raised grated floor.
  const wall = mat(0x3c4450, 'metal', 1.2, 0.7);
  const rack = S.metal(0x24282e);
  const unit = S.grate(0x48505a);

  floorQuad(stat, S.grate(0x56606a), R.x0, R.x1, R.z1, R.z0, 0.002);
  wallX(shellG, wall, R.x0, R.z0, R.z1, R.h);
  wallX(shellG, wall, R.x1, R.z0, R.z1, R.h);
  wallZ(shellG, wall, R.z1, R.x0, R.x1, R.h, [{ c: exitX, w: 3.0, h: 2.8 }]);
  slab(shellG, mat(0x2e343c, 'grate', 0.8, 0.6), R.x0, R.x1, R.h, R.h + 0.3, R.z1, R.z0);
  // The kitchen side of the shared wall is built by the kitchen; add a server-side skin.
  wallZ(stat, wall, R.z0 - 0.25, R.x0, R.x1, R.h, [{ c: railXAtZ(R.z0), w: 3.4, h: 2.8 }], 0.08);

  // Cold-aisle floor glow strips.
  for (const s of [-1, 1]) slab(stat, glow(0x2a5aff, 1.1), s * 1.9 - 0.04, s * 1.9 + 0.04, 0.003, 0.012, R.z1 + 0.5, R.z0 - 0.5);

  // Rack rows perpendicular to the aisle, LEDs facing the camera.
  const rows = [-198.5, -203.5, -208.5, -213.5];
  for (const z of rows) {
    for (const s of [-1, 1]) {
      const xa = s * 2.3;
      const xb = s * 7.4;
      const x0 = Math.min(xa, xb);
      const x1 = Math.max(xa, xb);
      slab(stat, rack, x0, x1, 0, 2.3, z - 0.45, z + 0.45).userData.pw = 'rack';
      const n = 5;
      for (let i = 0; i < n; i++) {
        const cx = x0 + (i + 0.5) * ((x1 - x0) / n);
        for (let k = 0; k < 6; k++) {
          const y = 0.3 + k * 0.33;
          box(stat, unit, cx, y, z + 0.47, 0.86, 0.26, 0.04).userData.pw = 'unit';
          for (let l = 0; l < 4; l++) {
            if ((i * 7 + k * 3 + l + (s > 0 ? 1 : 0)) % 3 === 0) continue;
            box(stat, am.leds[(i + k + l) % 3], cx - 0.3 + l * 0.06, y + 0.06, z + 0.5, 0.03, 0.03, 0.02);
          }
          box(stat, rack, cx + 0.2, y - 0.02, z + 0.5, 0.3, 0.12, 0.02).userData.pw = 'unit';
        }
      }
      // End panel facing the aisle with a status screen + label.
      box(stat, S.metal(0x4a505a), xa, 1.15, z, 0.06, 2.3, 0.95).userData.pw = 'rackEnd';
      box(stat, am.screen, xa - s * 0.04, 1.6, z, 0.02, 0.3, 0.5);
      pixelText(stat, `${s < 0 ? 'A' : 'B'}${rows.indexOf(z) + 1}`, glow(0xa0c8ff, 0.8), xa - s * 0.04, 2.05, z, 0.04, -s * Math.PI / 2, 0.02);
    }
  }
  // Cable trays overhead with bundles.
  for (const s of [-1, 1]) {
    slab(stat, S.grate(0xb09028), s * 2.4 - 0.3, s * 2.4 + 0.3, 3.15, 3.2, R.z1 + 0.3, R.z0 - 0.3);
    for (const [dx, col] of [
      [-0.15, 0x2a5aaa],
      [0, 0xd0a020],
      [0.15, 0x1a1a1a],
    ] as [number, number][]) slab(stat, S.plain(col), s * 2.4 + dx - 0.05, s * 2.4 + dx + 0.05, 3.2, 3.3, R.z1 + 0.3, R.z0 - 0.3);
    for (let z = R.z0 - 2; z > R.z1; z -= 3) pipe(stat, S.plain(0x2a2a2a), new THREE.Vector3(s * 2.4, 3.2, z), new THREE.Vector3(s * 2.4, R.h, z), 0.015, 3);
  }
  for (let z = R.z0 - 3; z > R.z1 + 1; z -= 5) lightPanel(stat, 0, R.h, z, 1.6, 0.25, z < -208 ? am.flicker : glow(0xd8e8ff, 1.0));
  vent(stat, -1.1, R.h - 0.02, -201);
  vent(stat, 1.1, R.h - 0.02, -206);
  // Toppled rack + severed, sparking cable.
  const tipped = new THREE.Group();
  tipped.position.set(-5.2, 0, -216.2);
  tipped.rotation.set(0, 0.2, 0.9);
  stat.add(tipped);
  box(tipped, rack, 0, 1.15, 0, 0.9, 2.3, 0.9);
  for (let k = 0; k < 5; k++) box(tipped, am.leds[k % 3], 0.3, 0.4 + k * 0.35, 0.46, 0.04, 0.04, 0.02);
  const sparkAt = new THREE.Vector3(-3.6, 3.0, -215.5);
  pipe(stat, S.plain(0x1a1a1a), new THREE.Vector3(-3.6, R.h, -215.5), sparkAt, 0.03, 4);
  let sparkT = 0.5;
  ctx.animators.push((dt, _t, w) => {
    if (!root.visible) return;
    sparkT -= dt;
    if (sparkT <= 0) {
      sparkT = 0.8 + rnd() * 1.6;
      w.fx.sparks(sparkAt, null, 6);
    }
  });

  // Bulkhead into the maintenance tunnels: slides up as the player approaches.
  frameZ(stat, S.metal(0x3e444c), R.z1 + 0.1, exitX, 3.0, 2.8, 0.7);
  hazardBand(stat, exitX - 1.5, exitX + 1.5, R.z1 + 0.6, 0.5);
  sign(stat, 'MAINTENANCE B-2', exitX, 3.3, R.z1 + 0.42, 0, 0.045, 0x5a4a10, S.plain(0x101010));
  beacon(stat, am.strobe, exitX - 2.1, 2.6, R.z1 + 0.3, 0);
  beacon(stat, am.strobe, exitX + 2.1, 2.6, R.z1 + 0.3, 0);
  const bulkhead = new THREE.Group();
  bulkhead.position.set(exitX, 0, R.z1 + 0.05);
  bakeInto(bulkhead, (g) => {
    box(g, S.metal(0x5e646c), 0, 1.4, 0, 3.0, 2.8, 0.18);
    for (let i = 0; i < 4; i++) box(g, S.metal(0x3a3e44), 0, 0.4 + i * 0.66, 0.11, 2.9, 0.12, 0.05);
    box(g, S.hazard(), 0, 0.2, 0.12, 2.96, 0.36, 0.04);
  });
  root.add(bulkhead);

  ctx.pw?.room('servers', { root, stat, shell: shellG, bulkhead });
  bake(stat);
  bake(shellG);
  root.add(stat, shellG);
  return { root, shell: shellG.children.slice(), bulkhead };
}


