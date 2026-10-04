import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { C, G, M, T, TX } from './mats';
import {
  anesthesia,
  autopsyTable,
  blk,
  bloodPool,
  bodyBag,
  box,
  corpse,
  cyl,
  dragTrail,
  emergencyLamp,
  exitSign,
  fireExt,
  grp,
  gurney,
  ivStand,
  monitor,
  morgueWall,
  opTable,
  papers,
  pipe,
  plant,
  smear,
  surgicalLamp,
  trolley,
  wallSmear,
  wheelchair,
} from './props';
import { buildShell, wall } from './shell';
import { B, POOL, R, STAIR_BOT, STAIR_TOP } from './layout';
import { bakeInto } from './bake';
import { pixelText } from './font';
import {
  type ZoneCtx,
  danglingPanel,
  flickerPanel,
  panel,
  plateSign,
  sideRoom,
  sign,
  styles,
  vent,
} from './zonekit';

const bulkhead = (g: THREE.Object3D, x: number, y: number, z: number, ry: number, on = true) => {
  const s = grp(g, x, y, z, ry);
  box(s, 0.34, 0.2, 0.1, T(0x2a2e2c, TX.paint), 0, 0, 0.05);
  box(s, 0.28, 0.14, 0.04, on ? G(0xfff0c8, 1.4) : M(0x3a3a34), 0, 0, 0.11);
  for (let i = -1; i <= 1; i++) box(s, 0.02, 0.16, 0.02, M(0x1a1a1a), i * 0.09, 0, 0.14);
};

// ═══════════════════════════════════════════════════════════════════════════
// Stairwell (down to B1)
// ═══════════════════════════════════════════════════════════════════════════

export function buildStair(ctx: ZoneCtx): THREE.Group {
  const { rng } = ctx;
  const g = new THREE.Group();
  g.name = 'stair';
  const r = R.stair;
  const cx = (r.x0 + r.x1) / 2;
  const w = r.x1 - r.x0;
  const conc = T(C.concrete, TX.concrete);
  const st = styles.concrete();
  const top = 3.6;
  // Upper landing slab.
  box(g, w, 0.5, -STAIR_TOP + r.z1, conc, cx, -0.25, (STAIR_TOP + r.z1) / 2);
  box(g, w - 0.4, 0.012, 0.18, T(0xd0a82a, TX.hazard), cx, 0.006, STAIR_TOP + 0.1);
  // Steps (solid down to B1).
  const n = Math.round((STAIR_TOP - STAIR_BOT) / 0.3);
  const rise = -B / n;
  for (let i = 0; i < n - 1; i++) {
    const t = -(i + 1) * rise;
    const z0 = STAIR_TOP - i * 0.3;
    box(g, w, t - B, 0.3, conc, cx, (t + B) / 2, z0 - 0.15);
    box(g, w - 0.3, 0.025, 0.05, M(0x1c1e1c), cx, t + 0.012, z0 - 0.03);
  }
  // Lower landing + soffit (underside of the ground floor) + ceiling.
  box(g, w, 0.2, STAIR_BOT - r.z0, T(0x4e524c, TX.concrete), cx, B - 0.1, (STAIR_BOT + r.z0) / 2);
  box(g, w, 0.5, STAIR_BOT - r.z0, conc, cx, -0.05, (STAIR_BOT + r.z0) / 2);
  box(g, w + 0.3, 0.2, r.z1 - r.z0 + 0.3, T(0x5a5c56, TX.concrete), cx, top + 0.1, (r.z0 + r.z1) / 2);
  // Walls: full-height sides, end wall above the soffit (the morgue builds the lower one).
  wall(g, 'z', r.z0, r.z1, r.x0, B, top, [], st, 0.3, 1);
  wall(g, 'z', r.z0, r.z1, r.x1, B, top, [], st, 0.3, -1);
  wall(g, 'x', r.x0, r.x1, r.z0, -0.3, top, [], { ...st, lowH: 99 }, 0.3, 1);
  // Handrails along the flight.
  const len = Math.hypot(STAIR_TOP - STAIR_BOT, -B);
  const tilt = -Math.atan2(-B, STAIR_TOP - STAIR_BOT);
  for (const x of [r.x0 + 0.35, r.x1 - 0.35]) {
    const h = grp(g, x, 0.95 + B / 2, (STAIR_TOP + STAIR_BOT) / 2, 0);
    h.rotation.x = tilt;
    cyl(h, 0.035, 0.035, len + 1.4, T(C.stairRail, TX.paint), 0, 0, 0, 6, Math.PI / 2);
    for (let k = -3; k <= 3; k++) box(h, 0.03, 0.12, 0.03, M(0x4a4a44), (x < cx ? -1 : 1) * 0.07, 0, k * 1.5);
  }
  // Painted level marker + signs on the end wall (seen from the top).
  pixelText(g, 'B1', cx, 1.9, r.z0 + 0.17, 0, { px: 0.12, mat: M(0xc9a227), depth: 0.01 });
  plateSign(g, 'MORGUE v', cx, 0.85, r.z0 + 0.17, 0, 0.04, 0xffffff, 0x3a4a5a);
  sign(g, 'MORGUE', cx, B + 3.25, r.z0 + 0.19, 0, 0.04, 0x9fe8ff, 0x101418, 1.2);
  // Lights.
  bulkhead(g, r.x0 + 0.16, 2.4, -54, Math.PI / 2);
  bulkhead(g, r.x1 - 0.16, 2.4, -55, -Math.PI / 2);
  bulkhead(g, r.x0 + 0.16, 0.8, -63, Math.PI / 2, false);
  bulkhead(g, r.x1 - 0.16, 0.2, -64.5, -Math.PI / 2);
  bulkhead(g, r.x0 + 0.16, B + 2.4, -71, Math.PI / 2);
  emergencyLamp(g, r.x1 - 0.2, B + 3.0, -70, -Math.PI / 2);
  flickerPanel(ctx, g, cx, top, -54.5, 0, 'blink');
  panel(g, cx - 2, top, -60.5, 0, false);
  vent(ctx, g, 77.4, top, -62.4, B * ((STAIR_TOP + 62.4) / (STAIR_TOP - STAIR_BOT)));
  vent(ctx, g, 80.8, top, -59.6, B * ((STAIR_TOP + 59.6) / (STAIR_TOP - STAIR_BOT)));
  // Gore: blood smeared down the steps, a body at the bottom.
  for (let i = 0; i < n - 1; i += 2) {
    const t = -(i + 1) * rise;
    smear(g, cx - 1 + rng.spread(0.3), t, STAIR_TOP - i * 0.3 - 0.15, 0.3, 0.5, rng.spread(0.3), rng.chance(0.4) ? C.bloodFresh : C.blood);
  }
  corpse(g, 77.3, B, -69.4, 2.2, rng, 0xe2e2da);
  wheelchair(g, 81.2, B, -68.6, -0.6, true);
  papers(g, cx, -72, 3, 2.5, 20, B, rng);
  wallSmear(g, r.x1 - 0.17, -1.6, -66, -Math.PI / 2, rng, true);
  fireExt(g, r.x0 + 0.16, 0.9, -52.6, Math.PI / 2);
  exitSign(g, cx, 3.3, -51.2, Math.PI);
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// Morgue (B1)
// ═══════════════════════════════════════════════════════════════════════════

/** Dynamic drawer slots: [wall 'e'|'w', col, row]. */
export const MORGUE_DRAWERS: ['e' | 'w', number, number][] = [
  ['e', 1, 1],
  ['e', 4, 2],
  ['e', 6, 1],
  ['w', 1, 1],
  ['w', 4, 1],
];
const MW = { cols: { e: 8, w: 6 }, z: -85, xe: 86.65, xw: 71.35 };

/** World position just in front of a dynamic drawer (for spawning). */
export function drawerFront(wallSide: 'e' | 'w', col: number, row: number): [number, number, number] {
  const cols = MW.cols[wallSide];
  const cx = -(cols * 0.78) / 2 + 0.39 + col * 0.78;
  const cy = 0.61 + row * 0.72;
  if (wallSide === 'e') return [MW.xe - 0.55, B + cy + 0.05, MW.z + cx];
  return [MW.xw + 0.55, B + cy + 0.05, MW.z - cx];
}

export function buildMorgue(ctx: ZoneCtx): THREE.Group {
  const { rng, sc } = ctx;
  const g = new THREE.Group();
  g.name = 'morgue';
  const r = R.morgue;
  buildShell(g, {
    ...r,
    style: styles.morgue(),
    floor: T(0x4e5c5a, TX.floorTile),
    ceiling: T(0x6a7470, TX.ceiling),
    sides: {
      zMax: [{ at: 79, w: 3.6, h: 2.8 }],
      zMin: [{ at: 79, w: 4.6, h: 3.0 }],
    },
  });
  // Cold-storage walls.
  const skipE = new Set(MORGUE_DRAWERS.filter((d) => d[0] === 'e').map((d) => `${d[1]},${d[2]}`));
  const skipW = new Set(MORGUE_DRAWERS.filter((d) => d[0] === 'w').map((d) => `${d[1]},${d[2]}`));
  morgueWall(g, MW.xe, B, MW.z, -Math.PI / 2, MW.cols.e, 3, skipE);
  morgueWall(g, MW.xw, B, MW.z, Math.PI / 2, MW.cols.w, 3, skipW);
  sign(g, 'COLD STORAGE', MW.xe - 0.05, B + 3.0, MW.z, -Math.PI / 2, 0.04, 0x9fe8ff, 0x101418, 1.1);
  // Dynamic drawers.
  for (const [side, col, row] of MORGUE_DRAWERS) {
    const [fx, fy, fz] = drawerFront(side, col, row);
    const dirX = side === 'e' ? -1 : 1;
    const faceX = side === 'e' ? MW.xe - 0.02 : MW.xw + 0.02;
    // Hinge on the slot's left edge (seen from the room).
    const hingeZ = fz + (side === 'e' ? -0.34 : 0.34);
    const door = new THREE.Group();
    door.position.set(faceX, fy - 0.05, hingeZ);
    door.rotation.y = side === 'e' ? -Math.PI / 2 : Math.PI / 2;
    door.userData.baseRy = door.rotation.y;
    door.userData.openSign = -1;
    ctx.dyn.add(door);
    bakeInto(door, (h) => {
      box(h, 0.68, 0.62, 0.04, T(C.steel, TX.steel), 0.34, 0, 0);
      box(h, 0.06, 0.2, 0.05, M(0x3a3e40), 0.6, 0, 0.03);
      box(h, 0.18, 0.08, 0.01, M(0xe8e4d0), 0.2, 0.18, 0.025);
    });
    const tray = new THREE.Group();
    const trayFrom = new THREE.Vector3(faceX - dirX * 1.0, fy - 0.3, fz);
    const trayTo = new THREE.Vector3(faceX + dirX * 0.7, fy - 0.3, fz);
    tray.position.copy(trayFrom);
    ctx.dyn.add(tray);
    bakeInto(tray, (h) => {
      box(h, 1.8, 0.05, 0.6, T(C.steel, TX.steel), 0, 0, 0);
      box(h, 1.5, 0.04, 0.5, T(0xb8c4c0, TX.cloth), 0, 0.04, 0);
      box(h, 0.5, 0.02, 0.4, M(C.bloodFresh), dirX * 0.4, 0.065, 0);
    });
    sc.drawers.push({ door, tray, trayFrom, trayTo, pos: new THREE.Vector3(fx, fy, fz), t: 0, open: false });
  }
  // Autopsy tables.
  autopsyTable(g, 75, B, -80.6, 0, rng, { body: true });
  autopsyTable(g, 83, B, -80.6, 0, rng, { body: true, open: true });
  autopsyTable(g, 75, B, -89.4, 0, rng);
  autopsyTable(g, 83, B, -89.4, 0, rng, { body: true });
  // Hanging scales (swing).
  for (const [sx, sz] of [[75, -86.5], [83, -84.0]] as [number, number][]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, -0.35, sz);
    ctx.dyn.add(pivot);
    bakeInto(pivot, (h) => {
      cyl(h, 0.01, 0.01, 1.2, M(0x3a3a3a), 0, -0.6, 0, 4);
      cyl(h, 0.12, 0.12, 0.1, M(0xd8dcd8), 0, -1.25, 0, 10, Math.PI / 2);
      cyl(h, 0.25, 0.22, 0.08, T(C.steel, TX.steel), 0, -1.6, 0, 10);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        cyl(h, 0.006, 0.006, 0.35, M(0x3a3a3a), Math.cos(a) * 0.1, -1.45, Math.sin(a) * 0.1, 3);
      }
    });
    sc.swingers.push({ obj: pivot, amp: 0.06, rate: 0.9 + rng.next() * 0.4, phase: rng.next() * 6 });
  }
  // Sinks along the south wall, drain, gurneys with body bags.
  blk(g, 4.2, 0.9, 0.7, T(C.steel, TX.steel), 74, B, -94.4);
  for (const sx of [72.8, 75.2]) box(g, 0.8, 0.02, 0.5, M(0x2a3034), sx, B + 0.91, -94.4);
  for (const sx of [72.8, 75.2]) cyl(g, 0.02, 0.02, 0.4, T(C.steel, TX.steel), sx, B + 1.1, -94.65, 5);
  box(g, 0.6, 0.02, 0.6, T(0x7a807c, TX.grate), 79, B + 0.01, -85);
  const gb = grp(g, 85.4, B, -93, 0.1);
  gurney(gb, 0, 0, 0, Math.PI / 2, { sheet: 0x2a3a34 });
  bodyBag(gb, 0, 0.98, 0, Math.PI / 2);
  gurney(g, 72.6, B, -77.6, 0.15, { body: true, blood: true });
  bodyBag(g, 80.9, B, -93.6, 1.4);
  ivStand(g, 84.6, B, -78.0);
  // Pipes and ceiling lights.
  pipe(g, 72.4, -75, 72.4, -95, -0.7, 0.09, T(0x5a6a7a, TX.paint));
  pipe(g, 85.6, -75, 85.6, -95, -0.75, 0.12, T(0x8a4a2a, TX.paint));
  for (let z = -77.6; z > -95; z -= 3.6) {
    for (const x of [75, 83]) {
      if (x === 83 && z < -80 && z > -82) flickerPanel(ctx, g, x, B + r.h, z, 0, 'buzz');
      else if (x === 75 && z < -87 && z > -89) flickerPanel(ctx, g, x, B + r.h, z, 0, 'dying');
      else panel(g, x, B + r.h, z, 0, !(x === 75 && z < -91));
    }
  }
  danglingPanel(ctx, g, 79, B + r.h, -82.4, 1.4);
  // Gore.
  dragTrail(g, 79.4, -75.5, 82.4, -88, B, rng);
  bloodPool(g, 83, B, -82.4, 0.8, rng);
  bloodPool(g, 76.6, B, -91.2, 0.6, rng);
  wallSmear(g, 71.17, B + 1.0, -78.4, Math.PI / 2, rng, true);
  wallSmear(g, 86.83, B + 2.0, -92, -Math.PI / 2, rng);
  papers(g, 79, -86, 4, 7, 26, B, rng);
  plateSign(g, 'AUTHORIZED ONLY', 79, B + 3.2, -94.82, 0, 0.03, 0xffffff, 0x8a1a1a);
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// Corridor B (service corridor to surgery)
// ═══════════════════════════════════════════════════════════════════════════

/** Corridor B's ceiling vent (x, z): a crawler drops out of it in the service-corridor hold. */
export const CORR_B_VENT: [number, number] = [78.5, -100.6];
/** The DANGER door on corridor B's east wall: a breakable door slot (a runner smashes through it). */
export const CORR_B_DOOR = { x: R.corrB.x1, z: -104, w: 1.3, h: 2.2 };

export function buildCorrB(ctx: ZoneCtx): THREE.Group {
  const { rng, sc } = ctx;
  const g = new THREE.Group();
  g.name = 'corrB';
  const r = R.corrB;
  buildShell(g, {
    ...r,
    style: styles.concrete(),
    floor: T(0x4a4e4a, TX.concrete),
    ceiling: T(0x5a5e58, TX.concrete),
    sides: { zMin: null, zMax: null, xMin: [{ at: -100, w: 1.3, h: 2.2 }], xMax: [{ at: -104, w: 1.3, h: 2.2 }] },
  });
  // Closed LINEN door; the DANGER door is a breakable slot with a store room behind it.
  box(g, 0.06, 2.2, 1.3, T(0x5a6a6a, TX.paint), r.x0, B + 1.1, -100);
  const dz = CORR_B_DOOR.z;
  sideRoom(g, r.x1 + 0.15, r.x1 + 3.4, dz - 2.2, dz + 1.7, B, 2.9, 0x2a2018, (s) => {
    // Hazard store: drums and a crate stack in the dark.
    for (const [x, z] of [[r.x1 + 2.6, dz - 1.4], [r.x1 + 2.9, dz - 0.7], [r.x1 + 2.5, dz + 1.0]] as [number, number][]) {
      cyl(s, 0.3, 0.3, 0.9, T(0x8a6a1a, TX.paint), x, B + 0.45, z, 8);
      box(s, 0.62, 0.08, 0.06, M(0x1a1a1a), x, B + 0.62, z + 0.29);
    }
    box(s, 0.9, 0.7, 0.8, T(0x5a4a34, TX.wood), r.x1 + 2.8, B + 0.35, dz + 0.2);
    box(s, 0.7, 0.5, 0.6, T(0x6a5a40, TX.wood), r.x1 + 2.85, B + 0.95, dz + 0.15);
  });
  sc.doorSlots.push({
    hinge: new THREE.Vector3(r.x1, B, dz - CORR_B_DOOR.w / 2),
    ry: -Math.PI / 2,
    w: CORR_B_DOOR.w,
    h: CORR_B_DOOR.h,
    out: new THREE.Vector3(-1, 0, 0),
    centre: new THREE.Vector3(r.x1, B, dz),
    color: 0x6a5a4a,
  });
  plateSign(g, 'LINEN', r.x0 + 0.17, B + 2.5, -100, Math.PI / 2, 0.03, 0x1a1a1a, 0xd8d8cc);
  plateSign(g, 'DANGER', r.x1 - 0.17, B + 2.5, -104, -Math.PI / 2, 0.03, 0xffffff, 0x9a1a1a);
  // Pipes + cable tray.
  pipe(g, 77.2, -95, 77.2, -108, B + 2.85, 0.08, T(0x4a6a8a, TX.paint));
  pipe(g, 77.5, -95, 77.5, -108, B + 2.65, 0.06, T(0xa83a2a, TX.paint));
  pipe(g, 80.9, -95, 80.9, -108, B + 2.8, 0.1, T(0x7a6a4a, TX.paint));
  box(g, 0.4, 0.05, 13, T(0x6a6e6a, TX.grate), 80.4, B + 2.5, -101.5);
  flickerPanel(ctx, g, 79, B + r.h, -98, 0, 'blink');
  panel(g, 79, B + r.h, -102, 0, false);
  flickerPanel(ctx, g, 79, B + r.h, -106, 0, 'buzz');
  // (Left of the rail: its crawler comes in left of the DANGER-door runner's path.)
  vent(ctx, g, CORR_B_VENT[0], B + r.h, CORR_B_VENT[1], B);
  gurney(g, 77.6, B, -103, 0.05, { sheet: 0x2a3a34, body: true, blood: true });
  wheelchair(g, 80.5, B, -97.2, -2.2);
  dragTrail(g, 79, -95, 78.4, -108, B, rng);
  wallSmear(g, r.x1 - 0.17, B + 1.3, -99, -Math.PI / 2, rng, true);
  bulkhead(g, r.x0 + 0.16, B + 2.3, -96.5, Math.PI / 2);
  emergencyLamp(g, r.x1 - 0.18, B + 2.6, -107, -Math.PI / 2);
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// Operating theatre + observation gallery
// ═══════════════════════════════════════════════════════════════════════════

export const OR_TANKS: [number, number][] = [
  [85.4, -113.4],
  [74.2, -124.8],
  [85.6, -124.6],
];

export function buildOR(ctx: ZoneCtx): THREE.Group {
  const { rng } = ctx;
  const g = new THREE.Group();
  g.name = 'or';
  const r = R.or;
  const ga = R.gallery;
  buildShell(g, {
    ...r,
    style: styles.or(),
    floor: T(0x62726a, TX.terrazzo),
    ceiling: T(0x8a9490, TX.ceiling),
    sides: {
      zMax: [{ at: 79, w: 4.6, h: 3.0 }],
      xMin: [{ at: -121, w: 4.6, h: 3.0 }],
      xMax: [{ at: (ga.z0 + ga.z1) / 2, w: ga.z1 - ga.z0, h: 1.8, y0: ga.y - B }],
    },
  });
  // Observation gallery behind the glass.
  sideRoom(g, ga.x0 + 0.15, ga.x1, ga.z0, ga.z1, ga.y, ga.h, 0x1a2622);
  box(g, 0.04, 1.8, ga.z1 - ga.z0, Kit.mat(0x7ab8b0, { transparent: true, opacity: 0.16 }), r.x1, ga.y + 0.9, (ga.z0 + ga.z1) / 2);
  for (let k = 0; k < 4; k++) box(g, 0.08, 1.8, 0.08, M(0x5a6260), r.x1, ga.y + 0.9, ga.z0 + 1.8 + k * 1.8);
  box(g, 0.1, 0.06, ga.z1 - ga.z0, M(0x8a908c), ga.x0 + 0.5, ga.y + 0.95, (ga.z0 + ga.z1) / 2);
  for (const z of [-114, -116.5, -119]) box(g, 0.5, 0.45, 1.6, T(0x2a3a4a, TX.cloth), ga.x0 + 2.4, ga.y + 0.22, z);
  box(g, 0.6, 0.03, 1.2, G(0xd8e8d0, 0.9), ga.x0 + 2.0, ga.y + ga.h - 0.03, -114.5);
  box(g, 0.6, 0.03, 1.2, G(0xd8e8d0, 0.9), ga.x0 + 2.0, ga.y + ga.h - 0.03, -119.5);
  box(g, 0.05, 1.0, 6, G(0x3a5a50, 0.7), ga.x1 - 0.05, ga.y + 1.2, -117);
  // Theatre kit.
  opTable(g, 82.6, B, -118.2, 0, rng);
  surgicalLamp(g, 82.6, r.y + r.h, -118.2, B + 3.0);
  anesthesia(g, 84.6, B, -121.2, -Math.PI / 2);
  trolley(g, 80.6, B, -115.2, 0.3, rng);
  trolley(g, 84.8, B, -116.2, -1.4, rng);
  ivStand(g, 81.2, B, -120.6, 0xe0d0d0, 0x9a1a1a);
  ivStand(g, 84.2, B, -115.0);
  monitor(g, 85.2, B + 1.3, -119.0, -Math.PI / 2, true);
  const mstand = grp(g, 85.2, B, -119.0, 0);
  cyl(mstand, 0.03, 0.03, 1.3, T(C.steel, TX.steel), 0, 0.65, 0, 5);
  // X-ray light boxes on the north wall.
  for (const sx of [73.2, 74.8]) {
    box(g, 1.3, 0.9, 0.05, G(0xd8f0ff, 0.9), sx, B + 1.9, r.z1 - 0.17);
    for (let k = 0; k < 5; k++) box(g, 0.08, 0.5, 0.01, M(0x2a2e30), sx - 0.3 + k * 0.15, B + 1.9, r.z1 - 0.2, 0, 0, (k - 2) * 0.12);
  }
  // Scrub sink.
  blk(g, 2.6, 0.95, 0.6, T(C.steel, TX.steel), 76.4, B, r.z1 - 0.45);
  sign(g, 'OR 2', 79, B + 3.4, r.z1 - 0.19, Math.PI, 0.06, 0x9fffc8, 0x101814, 1.3);
  sign(g, 'SURGERY', 79, B + 3.4, r.z1 + 0.19, 0, 0.05, 0x9fffc8, 0x101814, 1.3);
  // Panels around the lamp.
  for (const [px, pz] of [[76, -111.5], [82, -111.5], [76, -124], [82.6, -124.4], [73, -117.5], [86, -110]] as [number, number][]) {
    if (px === 76 && pz === -124) flickerPanel(ctx, g, px, r.y + r.h, pz, Math.PI / 2, 'blink');
    else panel(g, px, r.y + r.h, pz, Math.PI / 2, !(px === 86));
  }
  // Gore & mess.
  bloodPool(g, 82.6, B, -118.2, 1.3, rng);
  dragTrail(g, 82, -119.6, 76.4, -123.4, B, rng);
  dragTrail(g, 79, -108.2, 81.6, -116.6, B, rng);
  for (let k = 0; k < 4; k++) box(g, rng.range(0.6, 1.2), 0.02, rng.range(0.5, 1), T(0x4a8a78, TX.cloth), 80 + rng.spread(4), B + 0.012, -118 + rng.spread(5), rng.next() * 3);
  wallSmear(g, r.x0 + 0.17, B + 1.5, -113, Math.PI / 2, rng, true);
  wallSmear(g, 86.83, B + 1.0, -110.6, -Math.PI / 2, rng);
  papers(g, 78, -117, 4, 6, 18, B, rng);
  for (let k = 0; k < 10; k++) box(g, 0.02, 0.012, rng.range(0.12, 0.2), M(0xd0d8dc), 81 + rng.spread(3), B + 0.01, -119 + rng.spread(3), rng.next() * 3);
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// Corridor C (boiler wall) + boiler room
// ═══════════════════════════════════════════════════════════════════════════

export const WALL_BREAK = { x: 60, w: 3.2, h: 2.7 };
/**
 * Ceiling vent in corridor C (x, z): ~5 m ahead of the corridor-C hold so the
 * crawler lands well in front of a stopped camera (clear of the x 61.2 panel).
 */
export const CORR_C_VENT: [number, number] = [61.6, -119.9];
export const GAS_CYL: [number, number][] = [
  [54.6, -119.4],
  [56.4, -122.8],
];

export function buildCorrC(ctx: ZoneCtx): THREE.Group {
  const { rng, sc } = ctx;
  const g = new THREE.Group();
  g.name = 'corrC';
  const r = R.corrC;
  buildShell(g, {
    ...r,
    style: styles.concrete(),
    floor: T(0x464a46, TX.concrete),
    ceiling: T(0x5a5e58, TX.concrete),
    sides: {
      xMin: null,
      xMax: null,
      zMin: [{ at: WALL_BREAK.x, w: WALL_BREAK.w, h: WALL_BREAK.h, frame: false }],
      zMax: [{ at: 66, w: 1.3, h: 2.2 }],
    },
  });
  box(g, 1.3, 2.2, 0.06, T(0x5a4a3a, TX.paint), 66, B + 1.1, r.z1);
  plateSign(g, 'STAFF ONLY', 66, B + 2.55, r.z1 - 0.17, Math.PI, 0.025, 0x1a1a1a, 0xd8d8cc);
  // Boiler room behind the breakable wall.
  const bo = R.boiler;
  sideRoom(g, bo.x0, bo.x1, bo.z0, bo.z1 - 0.15, B, bo.h, 0x221a14, (s) => {
    cyl(s, 1.0, 1.0, 4.0, T(0x6a3a2a, TX.paint), 60, B + 1.4, -126.8, 12, 0, 0, Math.PI / 2);
    box(s, 0.6, 0.4, 0.05, G(0xff7a2a, 1.6), 60, B + 1.1, -125.75);
    pipe(s, 57, -125, 63, -125, B + 3.0, 0.1, T(0x7a5a3a, TX.paint));
    cyl(s, 0.1, 0.1, 3, T(0x7a5a3a, TX.paint), 57.5, B + 1.6, -127.5, 6);
  });
  // The breakable wall: blocks filling the opening (dynamic).
  const holder = new THREE.Group();
  holder.position.set(WALL_BREAK.x, B, r.z0);
  ctx.dyn.add(holder);
  const pieces: THREE.Mesh[] = [];
  const cols = 4;
  const rows = 3;
  const pw = WALL_BREAK.w / cols;
  const ph = WALL_BREAK.h / rows;
  const blockMat = T(C.concrete, TX.block);
  const lowMat = T(0x3f5a4e, TX.block);
  for (let c = 0; c < cols; c++) {
    for (let rr = 0; rr < rows; rr++) {
      const m = new THREE.Mesh(Kit.box(pw - 0.02, ph - 0.02, 0.3), rr === 0 ? lowMat : blockMat);
      m.position.set(-WALL_BREAK.w / 2 + (c + 0.5) * pw, (rr + 0.5) * ph, 0);
      holder.add(m);
      pieces.push(m);
    }
  }
  // Cracks + warning stencil painted over the blocks.
  const deco = new THREE.Group();
  holder.add(deco);
  bakeInto(deco, (h) => {
    for (let k = 0; k < 6; k++) box(h, rng.range(0.4, 1.2), 0.03, 0.02, M(0x1a1a18), rng.spread(1.2), rng.range(0.5, 2.4), 0.16, 0, 0, rng.spread(1.2));
    pixelText(h, 'KEEP OUT', 0, 1.9, 0.165, 0, { px: 0.05, mat: M(0xc9a227), depth: 0.01 });
  });
  sc.wall = { pieces, holder, centre: new THREE.Vector3(WALL_BREAK.x, B + 1.3, r.z0), out: new THREE.Vector3(0, 0, 1), shake: 0, broken: false };
  // Pipes, trays, lamps.
  pipe(g, 52, r.z1 - 0.35, 71, r.z1 - 0.35, B + 3.0, 0.1, T(0x4a6a8a, TX.paint));
  pipe(g, 52, r.z1 - 0.6, 71, r.z1 - 0.6, B + 3.1, 0.07, T(0xa83a2a, TX.paint));
  pipe(g, 52, r.z0 + 0.4, 71, r.z0 + 0.4, B + 3.05, 0.12, T(0x7a6a4a, TX.paint));
  for (let x = 54; x < 71; x += 3.6) {
    if (x > 60 && x < 62) flickerPanel(ctx, g, x, B + r.h, -121, Math.PI / 2, 'blink');
    else if (x > 57 && x < 59) danglingPanel(ctx, g, x, B + r.h, -121, 0.3);
    else panel(g, x, B + r.h, -121, Math.PI / 2, x < 56);
  }
  // Vent a crawler drops out of on the way to the boiler wall.
  vent(ctx, g, CORR_C_VENT[0], B + r.h, CORR_C_VENT[1], B);
  emergencyLamp(g, 53, B + 2.7, r.z1 - 0.18, Math.PI);
  emergencyLamp(g, 69.5, B + 2.7, r.z0 + 0.18, 0);
  exitSign(g, 52.4, B + 2.9, -122.6, -Math.PI / 2);
  // Gore + puddles.
  dragTrail(g, 70, -121.4, 52, -120.2, B, rng);
  for (let i = 0; i < 4; i++) cyl(g, rng.range(0.4, 0.9), rng.range(0.4, 0.9), 0.01, T(0x222e36, TX.water), rng.range(53, 70), B + 0.006, -121 + rng.spread(1.4), 10);
  wallSmear(g, 57, B + 1.2, r.z1 - 0.17, Math.PI, rng, true);
  // (Under the smear, well ahead of the brute-hold camera.)
  corpse(g, 57.4, B, -119.45, Math.PI / 2 + 0.2, rng, 0x6fb8ac);
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// Atrium (boss arena)
// ═══════════════════════════════════════════════════════════════════════════

export const ATRIUM_LEVELS = [0, 4.5, 9];
export const BALCONY_DEPTH = 3.5;

export function buildAtrium(ctx: ZoneCtx): THREE.Group {
  const { rng, sc } = ctx;
  const g = new THREE.Group();
  g.name = 'atrium';
  const r = R.atrium;
  const topY = r.y + r.h;
  buildShell(g, {
    ...r,
    style: styles.atrium(),
    floor: T(C.marble, TX.marble),
    ceiling: null,
    sides: {
      xMax: [{ at: -121, w: 4.6, h: 3.0 }],
      zMax: [{ at: 40, w: 2.4, h: 2.6 }],
      zMin: [{ at: 40, w: 2.4, h: 2.6 }],
    },
  });
  sideRoom(g, 38.6, 41.4, -105.85, -103, B, 2.9, 0x141a18);
  sideRoom(g, 38.6, 41.4, -139, -136.15, B, 2.9, 0x141a18);
  // Balconies.
  const D = BALCONY_DEPTH;
  const slab = T(C.balcony, TX.concrete);
  const fascia = T(0xc8c8be, TX.plaster);
  const glass = Kit.mat(0x9fd0d0, { transparent: true, opacity: 0.18 });
  const railM = T(0x8a9094, TX.steel);
  const strips: [number, number, number, number][] = [
    [r.x0, r.x1, r.z1 - D, r.z1],
    [r.x0, r.x1, r.z0, r.z0 + D],
    [r.x0, r.x0 + D, r.z0 + D, r.z1 - D],
    [r.x1 - D, r.x1, r.z0 + D, r.z1 - D],
  ];
  for (const ly of ATRIUM_LEVELS) {
    for (const [x0, x1, z0, z1] of strips) box(g, x1 - x0, 0.45, z1 - z0, slab, (x0 + x1) / 2, ly - 0.225, (z0 + z1) / 2);
    // Inner edge: fascia + glass balustrade + top rail.
    const edges: [number, number, number, number][] = [
      [r.x0 + D, r.z1 - D, r.x1 - D, r.z1 - D],
      [r.x0 + D, r.z0 + D, r.x1 - D, r.z0 + D],
      [r.x0 + D, r.z0 + D, r.x0 + D, r.z1 - D],
      [r.x1 - D, r.z0 + D, r.x1 - D, r.z1 - D],
    ];
    for (const [ax, az, bx, bz] of edges) {
      const len = Math.hypot(bx - ax, bz - az);
      const along = Math.abs(bx - ax) > 0.1;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (along) {
        box(g, len + 0.1, 0.5, 0.12, fascia, mx, ly - 0.25, mz);
        box(g, len, 1.0, 0.03, glass, mx, ly + 0.5, mz);
        box(g, len, 0.06, 0.1, railM, mx, ly + 1.03, mz);
        for (let x = ax; x <= bx + 0.01; x += 2.5) box(g, 0.06, 1.05, 0.06, railM, x, ly + 0.52, mz);
      } else {
        box(g, 0.12, 0.5, len + 0.1, fascia, mx, ly - 0.25, mz);
        box(g, 0.03, 1.0, len, glass, mx, ly + 0.5, mz);
        box(g, 0.1, 0.06, len, railM, mx, ly + 1.03, mz);
        for (let z = az; z <= bz + 0.01; z += 2.5) box(g, 0.06, 1.05, 0.06, railM, mx, ly + 0.52, z);
      }
    }
    // Dark doorways + exit signs on the balcony walls.
    for (let x = r.x0 + 4; x < r.x1 - 3; x += 6.5) {
      box(g, 1.6, 2.4, 0.05, M(0x0c1010), x, ly + 1.2, r.z1 - 0.17);
      box(g, 1.6, 2.4, 0.05, M(0x0c1010), x + 2, ly + 1.2, r.z0 + 0.17);
      if (rng.chance(0.4)) box(g, 1.4, 0.8, 0.04, G(rng.pick([0x9fc8b0, 0xd8c890]), 0.4), x + 3.3, ly + 1.8, r.z1 - 0.16);
    }
  }
  // Columns at the balcony corners and mid-spans (none on the rail).
  for (const [cx, cz] of [
    [r.x0 + D, r.z1 - D],
    [r.x1 - D, r.z1 - D],
    [r.x0 + D, r.z0 + D],
    [r.x1 - D, r.z0 + D],
    [37, r.z1 - D],
    [37, r.z0 + D],
    [r.x0 + D, -121],
  ] as [number, number][]) {
    cyl(g, 0.45, 0.45, topY - B, T(0xa8a89e, TX.concrete), cx, (topY + B) / 2, cz, 10);
    cyl(g, 0.55, 0.55, 0.4, M(0x5a5a54), cx, B + 0.2, cz, 10);
  }
  // Skylight: beams + moonlit glass.
  for (let x = r.x0; x <= r.x1; x += 3) box(g, 0.25, 0.4, r.z1 - r.z0, T(0x1c2024, TX.paint), x, topY, (r.z0 + r.z1) / 2);
  for (let z = r.z0; z <= r.z1; z += 3) box(g, r.x1 - r.x0, 0.4, 0.25, T(0x1c2024, TX.paint), (r.x0 + r.x1) / 2, topY, z);
  box(g, r.x1 - r.x0, 0.05, r.z1 - r.z0, G(0x1a2a48, 1.0), (r.x0 + r.x1) / 2, topY + 0.3, (r.z0 + r.z1) / 2);
  for (let k = 0; k < 7; k++) box(g, 2.6, 0.06, 2.6, G(0x0c1018, 1), r.x0 + 1.5 + rng.int(0, 9) * 3, topY + 0.25, r.z0 + 1.5 + rng.int(0, 9) * 3);
  // Fountain basin (the pool grows in it).
  const ring = new THREE.Mesh(Kit.track(new THREE.TorusGeometry(5.2, 0.35, 6, 28)), T(0x8a867a, TX.concrete));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(POOL[0], B + 0.25, POOL[2]);
  g.add(ring);
  cyl(g, 5.1, 5.1, 0.1, T(0x3a0c0c, TX.flesh), POOL[0], B + 0.05, POOL[2], 24);
  // Flesh creeping out of the pool: veins across the floor and up the columns.
  const vein = T(C.flesh, TX.flesh);
  const veinDark = T(C.fleshDark, TX.flesh);
  const node = G(0xff4a2a, 1.3);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng.spread(0.15);
    let x = POOL[0] + Math.cos(a) * 5.4;
    let z = POOL[2] + Math.sin(a) * 5.4;
    let dir = a;
    const segs = rng.int(3, 7);
    for (let k = 0; k < segs; k++) {
      const len = rng.range(1.2, 2.4);
      const nx = x + Math.cos(dir) * len;
      const nz = z + Math.sin(dir) * len;
      if (nx < r.x0 + 0.5 || nx > r.x1 - 0.5 || nz < r.z0 + 0.5 || nz > r.z1 - 0.5) break;
      // Keep the approach to the camera mostly clean.
      if (nx > 44 && Math.abs(nz - -121) < 3) break;
      const w = Math.max(0.08, 0.32 - k * 0.04);
      box(g, w, 0.08, len + 0.1, k % 2 ? vein : veinDark, (x + nx) / 2, B + 0.04, (z + nz) / 2, Math.atan2(nx - x, nz - z));
      if (rng.chance(0.35)) {
        const s = cyl(g, w * 0.9, w * 0.9, 0.1, node, nx, B + 0.06, nz, 6);
        s.scale.y = 0.6;
      }
      x = nx;
      z = nz;
      dir += rng.spread(0.6);
    }
  }
  // Flesh membranes and drips on the balconies above the pool.
  for (let i = 0; i < 18; i++) {
    const side = rng.int(0, 3);
    const ly = rng.pick(ATRIUM_LEVELS);
    let x = 0;
    let z = 0;
    if (side === 0) [x, z] = [rng.range(26, 48), r.z1 - D];
    else if (side === 1) [x, z] = [rng.range(26, 48), r.z0 + D];
    else if (side === 2) [x, z] = [r.x0 + D, rng.range(-131, -111)];
    else continue;
    const len = rng.range(1.0, 3.5);
    box(g, 0.12, len, 0.12, rng.chance(0.5) ? vein : veinDark, x, ly - 0.45 - len / 2, z, 0, rng.spread(0.1), rng.spread(0.1));
    box(g, rng.range(0.8, 2.2), 0.5, 0.2, veinDark, x, ly - 0.2, z + (side === 0 ? -0.05 : 0.05));
  }
  // Furniture: information desk, benches, planters, dead piano of a lobby.
  const desk = grp(g, 29.5, B, -112.5, 0.4);
  blk(desk, 3.4, 1.1, 1.0, T(0x6a5a4a, TX.wood), 0, 0, 0);
  blk(desk, 3.5, 0.06, 1.1, M(0xb9b3a2), 0, 1.1, 0);
  sign(desk, 'INFORMATION', 0, 0.75, 0.52, 0, 0.03, 0xbfe8ff, 0x101418, 1.1);
  for (const [bx, bz, br] of [[30, -127.6, 0.2], [44.5, -110.4, 1.4], [44.8, -131.4, -1.2], [26.8, -124.6, 1.6]] as [number, number, number][]) {
    const b = grp(g, bx, B, bz, br);
    blk(b, 2.0, 0.08, 0.5, T(0x6a5038, TX.wood), 0, 0.42, 0);
    blk(b, 0.08, 0.42, 0.45, M(0x2a2a2a), -0.85, 0, 0);
    blk(b, 0.08, 0.42, 0.45, M(0x2a2a2a), 0.85, 0, 0);
  }
  plant(g, 47.4, B, -109.4, rng);
  plant(g, 47.4, B, -132.6, rng);
  plant(g, 26.4, B, -109.4, rng);
  gurney(g, 43.6, B, -127.4, 0.9, { blood: true, tipped: true });
  wheelchair(g, 45.2, B, -114.4, 2.0, true);
  corpse(g, 41.4, B, -116.8, 2.2, rng, 0xa8c8d0);
  corpse(g, 30.6, B, -130.2, -0.6, rng, 0xe2e2da);
  papers(g, 40, -121, 8, 9, 40, B, rng);
  // High on the top level: from the boss camera it sits above the action (behind
  // the boss bar), so it never competes with the glowing eyes.
  sign(g, 'ST MERCY', 22.18, ATRIUM_LEVELS[2] + 2.5, -121, Math.PI / 2, 0.1, 0xbfe8ff, 0x101418, 0.75, [3]);
  // Pendant lamps hanging from the skylight beams (dynamic swing).
  for (const [lx, lz, on] of [[30.5, -114, true], [42, -128, false], [29.5, -129, true], [43, -113.5, true]] as [number, number, boolean][]) {
    const p = new THREE.Group();
    p.position.set(lx, topY - 0.2, lz);
    ctx.dyn.add(p);
    const len = topY - 4.5 - B;
    bakeInto(p, (h) => {
      cyl(h, 0.012, 0.012, len, M(0x1a1a1a), 0, -len / 2, 0, 3);
      cyl(h, 0.15, 0.6, 0.45, T(0x2a2e30, TX.paint), 0, -len - 0.2, 0, 10);
      cyl(h, 0.5, 0.5, 0.03, on ? G(0xffe2b0, 1.1) : M(0x3a3a34), 0, -len - 0.42, 0, 10);
    });
    sc.swingers.push({ obj: p, amp: 0.035, rate: 0.5 + rng.next() * 0.3, phase: rng.next() * 6 });
  }
  // Emergency lamps on the lower walls.
  emergencyLamp(g, 51.75, B + 3.4, -117.6, -Math.PI / 2);
  emergencyLamp(g, 22.25, B + 3.4, -115, Math.PI / 2);
  exitSign(g, 40, B + 2.95, r.z1 - 0.18, Math.PI);
  exitSign(g, 40, B + 2.95, r.z0 + 0.18, 0);
  return g;
}

/** Pulsing flesh cocoon in the fountain — Patient Zero bursts out of it. */
export function buildCocoon(ctx: ZoneCtx) {
  const { rng } = ctx;
  const c = new THREE.Group();
  c.position.set(POOL[0], B, POOL[2]);
  ctx.dyn.add(c);
  bakeInto(c, (g) => {
    const mats = [T(C.flesh, TX.flesh), T(C.fleshDark, TX.flesh), T(0x9a2a26, TX.skin)];
    cyl(g, 4.9, 5.0, 0.16, T(0x4a0a0a, TX.flesh), 0, 0.1, 0, 24);
    const lumps: [number, number, number, number][] = [
      [0, 1.2, 0, 2.0],
      [0.3, 2.6, -0.2, 1.4],
      [-1.2, 0.8, 0.9, 1.0],
      [1.3, 0.7, 0.8, 0.9],
      [-0.4, 3.5, 0.1, 0.9],
      [1.0, 0.6, -1.2, 1.0],
    ];
    lumps.forEach(([x, y, z, r], i) => {
      const m = new THREE.Mesh(Kit.jitter(Kit.ico(r, 1), r * 0.22, 40 + i), mats[i % 3]);
      m.position.set(x, y, z);
      m.scale.set(1, i === 0 ? 0.75 : 1, 1);
      g.add(m);
    });
    // Glowing veins over the surface.
    for (let i = 0; i < 10; i++) {
      const a = rng.next() * Math.PI * 2;
      const y = rng.range(0.6, 3.4);
      const r = 1.9 - Math.abs(y - 1.6) * 0.35;
      box(g, 0.07, rng.range(0.6, 1.4), 0.07, G(0xff4a24, 1.2), Math.cos(a) * r, y, Math.sin(a) * r, 0, rng.spread(0.6), rng.spread(0.6));
    }
    // An arm and a face pressed against the membrane.
    box(g, 0.12, 0.7, 0.12, T(0xa8948a, TX.skin), 1.6, 1.8, 1.0, 0, 0.5, -0.8);
    box(g, 0.24, 0.3, 0.1, T(0xa8948a, TX.skin), 0.2, 2.5, 1.55, 0.2, 0, 0);
  });
  ctx.sc.cocoon = c;
}

/** Additive light shafts from the skylight (separate transparent mesh, not baked). */
export function buildShafts(ctx: ZoneCtx): THREE.Group {
  const r = R.atrium;
  const holder = new THREE.Group();
  ctx.dyn.add(holder);
  const mat = Kit.track(
    new THREE.MeshBasicMaterial({ color: 0x4a6aa8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  const geo = Kit.track(new THREE.CylinderGeometry(1.2, 2.6, r.h, 8, 1, true));
  for (const [sx, sz, tilt] of [[31, -116, 0.12], [40, -126, -0.1], [34.5, -127.5, 0.08]] as [number, number, number][]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(sx, r.y + r.h / 2, sz);
    m.rotation.z = tilt;
    m.renderOrder = 2;
    holder.add(m);
  }
  return holder;
}
