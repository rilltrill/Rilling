import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { Rng } from '../../../core/Rng';
import {
  BUILDING_COLORS, C, CAR_COLORS, GROUND_H, M, bench, boardSign, bladeSign, building, buildingHeight,
  car, crate, dumpster, hydrant, mailbox, newsBox, paintedText, sawhorse, schoolBus, streetLamp, streetTree, trafficCone,
  trashBags, trashCan, utilityPole, wallDetails, type BuildingSpec,
} from './props';
import { addText } from './font';
import { FirePlume, LightBeams, LightPools } from './vfx';
import { BurstDoors, BusWreck, GasStation, mergedGroup } from './setpieces';
import {
  ALLEY_N, ALLEY_S, BUS_POS, BUS_YAW, CROSS_Z0, CROSS_Z1, GAS_Z0, GAS_Z1, MAIN_FACADE, SECOND_E, SECOND_W, SECOND_X, SQ_X0, SQ_X1, SQ_Z0, SQ_Z1,
} from './layout';

/** Direction a facade faces. E = +X, W = -X, S = +Z, N = -Z. */
export type Facing = 'E' | 'W' | 'N' | 'S';
const ROT: Record<Facing, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

export type ZoneId = 'A' | 'B' | 'C' | 'D' | 'E';

/** Animated bits collected while building (kept out of the merged scenery). */
export interface TownAnim {
  /** Police light bars: pairs of [red, blue] meshes. */
  lightbars: THREE.Object3D[][];
  /** Things that blink on/off with a period (s) and duty cycle. */
  blinkers: { obj: THREE.Object3D; period: number; duty: number; phase: number }[];
  /** Neon that buzzes irregularly. */
  buzz: { obj: THREE.Object3D; seed: number }[];
  /** Marquee chase-light sets (alternate). */
  chase: THREE.Object3D[];
  fires: { plume: FirePlume; pos: THREE.Vector3; light: number }[];
  /** Flickering street lamp: glow mesh + instance indices in pools/beams. */
  badLamp: { glow: THREE.Object3D; pool: number; beam: number; color: number } | null;
}

export interface Town {
  zones: Record<ZoneId, THREE.Group>;
  pools: LightPools;
  beams: LightBeams;
  anim: TownAnim;
  gas: GasStation;
  bus: BusWreck;
  doors: BurstDoors;
  /** Diner pane slots (world centre bottom, yaw, width, height). */
  dinerPanes: { pos: THREE.Vector3; yaw: number; w: number; h: number }[];
  pumps: THREE.Vector3[];
  barrels: THREE.Vector3[];
  propane: THREE.Vector3;
  extraBarrels: THREE.Vector3[];
  /** Invisible proxy walls that stop bullets (facades away from the fights). */
  occluders: THREE.Mesh[];
  /** Extra non-merged objects added straight to the root. */
  dynamic: THREE.Group;
  /** Animated / special objects, grouped by zone so they cull with it. */
  dynZones: Record<ZoneId, THREE.Group>;
}

export function zoneFor(x: number, z: number): ZoneId {
  if (z > -60 && x > -30) return 'A';
  if (x > -12 && z > -215) return 'B';
  if (z > -200) return 'C';
  if (z > SQ_Z0 + 2) return 'D';
  return 'E';
}

/** Build the whole town. Static parts go into zone groups (merged by the caller). */
export function buildTown(): Town {
  const rng = new Rng(1931);
  const zones: Record<ZoneId, THREE.Group> = { A: new THREE.Group(), B: new THREE.Group(), C: new THREE.Group(), D: new THREE.Group(), E: new THREE.Group() };
  for (const k of Object.keys(zones) as ZoneId[]) zones[k].name = `zone${k}`;
  const pools = new LightPools();
  const beams = new LightBeams();
  const dynamic = new THREE.Group();
  dynamic.name = 'z1-dynamic';
  const dynZones: Record<ZoneId, THREE.Group> = { A: new THREE.Group(), B: new THREE.Group(), C: new THREE.Group(), D: new THREE.Group(), E: new THREE.Group() };
  for (const k of Object.keys(dynZones) as ZoneId[]) dynZones[k].name = `dyn${k}`;
  /** Add a non-merged object to the dynamic container of its zone (by its position unless given). */
  const addDyn = (o: THREE.Object3D, zone?: ZoneId) => {
    dynZones[zone ?? zoneFor(o.position.x, o.position.z)].add(o);
    return o;
  };
  const anim: TownAnim = { lightbars: [], blinkers: [], buzz: [], chase: [], fires: [], badLamp: null };
  const occluders: THREE.Mesh[] = [];

  /** Add a static object at world (x, z) with yaw, into the zone that contains it. */
  const put = (obj: THREE.Object3D, x: number, z: number, ry = 0, y = 0, zone?: ZoneId) => {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    zones[zone ?? zoneFor(x, z)].add(obj);
    return obj;
  };
  const boxAt = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0, zone?: ZoneId) =>
    put(Kit.mesh(Kit.box(w, h, d), mat), x, z, ry, y, zone);

  /** Building along a street: `a`/`b` are the along-street coordinates, `f` the facade line. */
  const bld = (spec: BuildingSpec, a: number, b: number, f: number, facing: Facing, r: Rng = rng) => {
    const w = Math.abs(a - b);
    const mid = (a + b) / 2;
    const g = building({ ...spec, w }, r);
    if (facing === 'E' || facing === 'W') put(g, f, mid, ROT[facing]);
    else put(g, mid, f, ROT[facing]);
    return g;
  };

  const occ = (x0: number, x1: number, z0: number, z1: number, h = 12) => {
    const m = new THREE.Mesh(Kit.box(Math.abs(x1 - x0), h, Math.abs(z1 - z0)), Kit.mat(0x000000));
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    m.visible = false;
    m.name = 'occluder';
    dynamic.add(m);
    occluders.push(m);
  };

  // ─── Ground, roads, sidewalks ─────────────────────────────────────────────
  const asphalt = Kit.std(0x1c1f26, 0.42, 0.1);
  const asphaltB = Kit.std(0x22252c, 0.5, 0.05);
  const plane = (w: number, d: number, mat: THREE.Material, x: number, z: number, y: number, zone: ZoneId) => {
    const m = Kit.mesh(Kit.plane(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    zones[zone].add(m);
    return m;
  };
  // Road surfaces split per zone so each zone culls on its own.
  plane(12, 100, asphalt, 0, -10, 0.01, 'A');
  plane(12, 145, asphalt, 0, -132.5, 0.01, 'B');
  plane(130, 14, asphalt, 0, (CROSS_Z0 + CROSS_Z1) / 2, 0.012, 'B');
  plane(39, 7, asphaltB, -29, (ALLEY_S + ALLEY_N) / 2, 0.01, 'C');
  plane(12, 90, asphalt, SECOND_X, -155, 0.01, 'C');
  plane(12, 62, asphalt, SECOND_X, -231, 0.01, 'D');
  plane(26, 36, Kit.mat(0x3c3d41), -80.5, (GAS_Z0 + GAS_Z1) / 2, 0.012, 'D');
  plane(SQ_X1 - SQ_X0 + 20, SQ_Z0 - SQ_Z1, Kit.mat(0x46443f), (SQ_X0 + SQ_X1) / 2 - 10, (SQ_Z0 + SQ_Z1) / 2, 0.01, 'E');

  const sidewalk = (x0: number, x1: number, z0: number, z1: number, curbSide: 'x0' | 'x1' | 'z0' | 'z1') => {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    boxAt(w, 0.15, d, M.sidewalk, cx, 0.075, cz);
    if (curbSide === 'x0' || curbSide === 'x1') boxAt(0.2, 0.17, d, M.curb, curbSide === 'x0' ? Math.min(x0, x1) + 0.1 : Math.max(x0, x1) - 0.1, 0.085, cz);
    else boxAt(w, 0.17, 0.2, M.curb, cx, 0.085, curbSide === 'z0' ? Math.max(z0, z1) - 0.1 : Math.min(z0, z1) + 0.1);
    // Expansion joints.
    if (d > w) for (let z = Math.min(z0, z1) + 2; z < Math.max(z0, z1); z += 3) boxAt(w, 0.01, 0.04, M.trimDark, cx, 0.152, z);
  };
  // Main Street.
  sidewalk(6, MAIN_FACADE, 40, -60, 'x0');
  sidewalk(6, MAIN_FACADE, -60, CROSS_Z0, 'x0');
  sidewalk(6, MAIN_FACADE, CROSS_Z1, -205, 'x0');
  sidewalk(-MAIN_FACADE, -6, 40, -60, 'x1');
  sidewalk(-MAIN_FACADE, -6, -60, CROSS_Z0, 'x1');
  sidewalk(-MAIN_FACADE, -6, CROSS_Z1, ALLEY_S, 'x1');
  sidewalk(-MAIN_FACADE, -6, ALLEY_N, -205, 'x1');
  // Second Street.
  sidewalk(SECOND_E - 3.5, SECOND_E, -110, ALLEY_S, 'x0');
  sidewalk(SECOND_E - 3.5, SECOND_E, ALLEY_N, -200, 'x0');
  sidewalk(SECOND_E - 3.5, SECOND_E, -200, SQ_Z0, 'x0');
  sidewalk(SECOND_W, SECOND_W + 3.5, -110, GAS_Z0, 'x1');
  sidewalk(SECOND_W, SECOND_W + 3.5, GAS_Z1, SQ_Z0, 'x1');

  // Lane markings: double yellow centre + dashed white parking lines.
  const markings = (cx: number, z0: number, z1: number, skip: [number, number][] = []) => {
    const inSkip = (z: number) => skip.some(([a, b]) => z <= a && z >= b);
    for (let z = z0; z > z1; z -= 6) {
      if (inSkip(z) || inSkip(z - 3)) continue;
      boxAt(0.12, 0.012, 3, M.yellowPaint, cx - 0.12, 0.02, z - 1.5);
      boxAt(0.12, 0.012, 3, M.yellowPaint, cx + 0.12, 0.02, z - 1.5);
      boxAt(0.12, 0.012, 3, M.yellowPaint, cx - 0.12, 0.02, z - 4.5);
      boxAt(0.12, 0.012, 3, M.yellowPaint, cx + 0.12, 0.02, z - 4.5);
      boxAt(0.12, 0.012, 2.2, M.whitePaint, cx - 3.6, 0.02, z - 1.5);
      boxAt(0.12, 0.012, 2.2, M.whitePaint, cx + 3.6, 0.02, z - 1.5);
    }
  };
  markings(0, 38, -200, [[CROSS_Z0 + 3, CROSS_Z1 - 3]]);
  markings(SECOND_X, -110, SQ_Z0, [[ALLEY_S + 2, ALLEY_N - 2]]);
  // Crosswalks + stop lines.
  const crosswalk = (cx: number, z: number, w = 12) => {
    for (let x = cx - w / 2 + 0.6; x < cx + w / 2; x += 1.1) boxAt(0.55, 0.012, 3, M.whitePaint, x, 0.021, z);
  };
  crosswalk(0, CROSS_Z0 - 1.8);
  crosswalk(0, CROSS_Z1 + 1.8);
  crosswalk(SECOND_X, SQ_Z0 + 1.8);
  // Puddles (glossy) and manholes.
  const puddle = Kit.std(0x07090e, 0.06, 0.35);
  const puddleSpots: [number, number, number][] = [
    [-2.4, -6, 1.6], [2.8, -27, 2.2], [-1.2, -52, 1.4], [3.5, -80, 1.8], [-3.6, -110, 2.4], [1.2, -133, 1.5],
    [-30, -155, 1.6], [-41, -156, 1.2], [-59.5, -185, 2.0], [-55.5, -214, 1.8], [-61, -238, 1.5], [-56, -276, 2.2], [-62, -290, 1.6],
  ];
  for (const [x, z, r] of puddleSpots) {
    const p = put(Kit.mesh(Kit.cyl(r, r, 0.012, 12), puddle), x, z, 0, 0.018);
    p.scale.set(1, 1, rng.range(0.5, 0.8));
    p.rotation.y = rng.next() * 3;
  }
  for (const [x, z] of [[1.8, -15], [-1.5, -70], [1.5, -120], [SECOND_X + 1.5, -205]] as const) {
    put(Kit.mesh(Kit.cyl(0.4, 0.4, 0.02, 10), Kit.mat(0x111215)), x, z, 0, 0.02);
  }

  // ─── Blood, debris and signs of panic ────────────────────────────────────
  const bloodPool = (x: number, z: number, s: number) => {
    const p = put(Kit.mesh(Kit.cyl(s, s, 0.012, 9), M.bloodWet), x, z, rng.next() * 3, 0.025);
    p.scale.set(1, 1, rng.range(0.5, 0.9));
    for (let i = 0; i < 4; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = s * rng.range(1.1, 2.4);
      boxAt(rng.range(0.1, 0.25), 0.01, rng.range(0.1, 0.3), M.blood, x + Math.cos(a) * d, 0.026, z + Math.sin(a) * d, a);
    }
  };
  const bloodTrail = (x: number, z: number, len: number, ry: number) => {
    for (let i = 0; i < len; i++) {
      boxAt(rng.range(0.25, 0.45), 0.01, 0.6, M.blood, x + Math.sin(ry) * i * 0.7 + rng.spread(0.1), 0.026, z + Math.cos(ry) * i * 0.7, ry + rng.spread(0.3));
    }
  };
  for (const [x, z, s] of [[-1.5, -24, 0.7], [4.5, -47, 0.5], [-5, -60, 0.6], [2, -92, 0.8], [-7.5, -115, 0.5], [-36, -154, 0.6], [-55, -182, 0.7], [-62, -226, 0.6], [-52, -268, 0.9]] as const) bloodPool(x, z, s);
  bloodTrail(-7.8, -40, 8, 0.3);
  bloodTrail(-60, -196, 7, -0.5);
  bloodTrail(-50, -283, 9, 0.9);
  const paper = Kit.mat(0x9a978c);
  for (let i = 0; i < 60; i++) {
    const zz = rng.range(30, -300);
    const xx = zz > -150 ? rng.range(-8, 8) : rng.range(SECOND_X - 7, SECOND_X + 7);
    boxAt(rng.range(0.2, 0.35), 0.01, rng.range(0.25, 0.4), paper, xx, 0.03, zz, rng.next() * 3);
  }

  // ─── Main Street buildings ────────────────────────────────────────────────
  const col = (i: number) => BUILDING_COLORS[i % BUILDING_COLORS.length];
  // East side (facing -X).
  bld({ w: 0, d: 14, floors: 3, color: col(0), shop: { interior: 0, awning: 0x3a2a24, shutter: true, board: { text: 'HARDWARE', color: C.neonOrange, size: 0.42 } } }, 40, 14, MAIN_FACADE, 'W');
  {
    const g = bld({ w: 0, d: 14, floors: 2, color: col(3), shop: { interior: 0xffd58a, interiorIntensity: 0.38, blade: { text: 'PAWN', color: C.neonYellow, size: 0.62 }, board: { text: 'LOANS', color: C.neonYellow, size: 0.45 } } }, 14, -4, MAIN_FACADE, 'W');
    // Pawnbroker's three golden balls.
    const gold = Kit.glow(0xffcf4a, 0.9);
    for (const [lx, ly] of [[-0.35, 0], [0.35, 0], [0, -0.55]] as const) Kit.add(g, Kit.sphere(0.24, 8, 6), gold, -5.5 + lx, 5.0 + ly, 1.4);
    Kit.add(g, Kit.box(0.06, 0.06, 1.4), M.metal, -5.5, 5.45, 0.7);
    pools.add(MAIN_FACADE - 2.5, 5, 3.2, C.neonYellow, 0.5);
    pools.addWall(MAIN_FACADE - 0.05, 5, 6, 3, C.neonYellow, -Math.PI / 2, 0.35);
  }
  bld({ w: 0, d: 14, floors: 4, color: col(2), fireEscape: true, shop: { interior: 0xd8f4ff, interiorIntensity: 0.45, awning: 0x1f3a6a, board: { text: 'LAUNDRY', color: C.neonCyan, size: 0.45 } } }, -4, -22, MAIN_FACADE, 'W');
  pools.add(MAIN_FACADE - 2, -13, 3, C.neonCyan, 0.4);
  // Rialto cinema (E4) with marquee.
  {
    const a = -22;
    const b = -42;
    const g = bld({ w: 0, d: 16, floors: 3, color: 0x5a2a30, trim: M.trimLight, shop: { interior: 0xffc68a, interiorIntensity: 0.55 } }, a, b, MAIN_FACADE, 'W');
    // Marquee box over the sidewalk.
    const mq = new THREE.Group();
    Kit.add(mq, Kit.box(14, 1.7, 3.2), Kit.mat(0x2a1a1e), 0, 0, 1.6);
    const board = Kit.glow(0xfff2d8, 0.85);
    Kit.add(mq, Kit.box(12.6, 1.15, 0.06), board, 0, 0, 3.22);
    const letters = Kit.mat(0x1a1214);
    const t1 = addText(mq, 'LAST SHOW', letters, { size: 0.42, depth: 0.04, stroke: 0.07 });
    t1.position.set(0, 0.18, 3.27);
    const t2 = addText(mq, 'TONIGHT', letters, { size: 0.3, depth: 0.04, stroke: 0.06 });
    t2.position.set(0, -0.32, 3.27);
    for (const sx of [-1, 1]) {
      Kit.add(mq, Kit.box(0.06, 1.15, 2.6), board, sx * 7.03, 0, 1.6);
    }
    mq.position.set(0, GROUND_H - 0.3, 0);
    g.add(mq);
    // Chase bulbs: dim base row + two bright alternating sets.
    const dim = Kit.glow(0xffb24a, 0.45);
    const lit = Kit.glow(0xffe0a0, 1.8);
    const setA = new THREE.Group();
    const setB = new THREE.Group();
    const bulb = Kit.sphere(0.075, 6, 4);
    let n = 0;
    for (const yy of [0.95, -0.95]) {
      for (let x = -6.9; x <= 6.9; x += 0.46) {
        Kit.add(g, bulb, dim, x, GROUND_H - 0.3 + yy, 3.25);
        Kit.add(n % 2 ? setA : setB, Kit.sphere(0.09, 6, 4), lit, x, GROUND_H - 0.3 + yy, 3.27);
        n++;
      }
    }
    // Vertical RIALTO blade with bulbs.
    const blade = bladeSign('RIALTO', C.neonRed, 0.75, 0x2a1a1e);
    blade.position.set(4.5, 10.2, 0);
    g.add(blade);
    // Posters.
    for (const [lx, c] of [[-5.6, 0x8a2a3a], [5.6, 0x2a5a8a]] as const) {
      Kit.add(g, Kit.box(1.1, 1.6, 0.06), Kit.glow(c, 0.45), lx, 1.7, 0.08);
    }
    // Ticket booth.
    Kit.add(g, Kit.box(1.6, 2.4, 1.2), Kit.mat(0x6a2a30), 0, 1.2, 0.7);
    Kit.add(g, Kit.box(1.2, 0.9, 0.05), Kit.glow(0xffd8a0, 0.6), 0, 1.6, 1.32);
    // Chase sets go into the dynamic group (positioned like g).
    for (const s of [setA, setB]) {
      s.position.copy(g.position);
      s.rotation.copy(g.rotation);
      mergedGroup(s);
      addDyn(s);
      anim.chase.push(s);
    }
    pools.add(MAIN_FACADE - 3, (a + b) / 2, 6, 0xffb862, 0.55);
    pools.addWall(MAIN_FACADE - 0.05, 2.5, (a + b) / 2, 5, 0xffb862, -Math.PI / 2, 0.3);
  }
  bld({ w: 0, d: 14, floors: 3, color: col(5), shop: { interior: 0, awning: 0x5a1f1f } }, -42, -58, MAIN_FACADE, 'W');
  bld({ w: 0, d: 14, floors: 2, color: col(1), shop: { interior: 0xffa080, interiorIntensity: 0.3, board: { text: 'LIQUOR', color: C.neonRed, size: 0.5 } } }, -58, -74, MAIN_FACADE, 'W');
  pools.add(MAIN_FACADE - 2, -66, 3, C.neonRed, 0.45);
  bld({ w: 0, d: 14, floors: 3, color: col(4), fireEscape: true, roof: 'billboard', shop: null }, -74, CROSS_Z0, MAIN_FACADE, 'W');
  bld({ w: 0, d: 14, floors: 3, color: col(6), shop: { interior: 0, awning: 0x1f4a3a } }, CROSS_Z1, -118, MAIN_FACADE, 'W');
  // Pharmacy (E9) with neon cross.
  {
    const g = bld({ w: 0, d: 14, floors: 2, color: col(5), trim: M.trimLight, shop: { interior: 0xd8ffe8, interiorIntensity: 0.42, board: { text: 'PHARMACY', color: C.neonGreen, size: 0.55 } } }, -118, -136, MAIN_FACADE, 'W');
    const cross = new THREE.Group();
    Kit.add(cross, Kit.box(0.25, 2.0, 2.0), M.signBack, 0, 0, 0);
    const gl = Kit.glow(C.neonGreen, 1.7);
    for (const sx of [-1, 1]) {
      Kit.add(cross, Kit.box(0.06, 1.5, 0.45), gl, sx * 0.14, 0, 0);
      Kit.add(cross, Kit.box(0.06, 0.45, 1.5), gl, sx * 0.14, 0, 0);
    }
    cross.position.set(-6, 6.0, 1.4);
    // The cross buzzes: keep it dynamic, positioned in world space.
    g.updateMatrixWorld(true);
    cross.applyMatrix4(g.matrixWorld);
    mergedGroup(cross);
    addDyn(cross);
    anim.buzz.push({ obj: cross, seed: 3.3 });
    // Shelves silhouettes inside.
    for (let i = 0; i < 3; i++) Kit.add(g, Kit.box(1.6, 1.4, 0.05), Kit.mat(0x2a3a32), -6 + i * 2.2, 1.3, 0.11);
    pools.add(MAIN_FACADE - 2.5, -127, 4, C.neonGreen, 0.5);
    pools.addWall(MAIN_FACADE - 0.05, 4.5, -127, 4, C.neonGreen, -Math.PI / 2, 0.35);
  }
  bld({ w: 0, d: 14, floors: 3, color: col(0), shop: null, fireEscape: true }, -136, -156, MAIN_FACADE, 'W');
  bld({ w: 0, d: 14, floors: 4, color: col(3), shop: { interior: 0, shutter: true } }, -156, -178, MAIN_FACADE, 'W');
  bld({ w: 0, d: 14, floors: 3, color: col(2), shop: null }, -178, -205, MAIN_FACADE, 'W');

  // West side (facing +X).
  bld({ w: 0, d: 14, floors: 2, color: col(6), shop: { interior: 0, awning: 0x6a1f1f, board: { text: 'BARBER', color: C.neonBlue, size: 0.45 } } }, 40, 16, -MAIN_FACADE, 'E');
  {
    const g = bld({ w: 0, d: 14, floors: 4, color: col(0), trim: M.trimLight, shop: { interior: 0xffd09a, interiorIntensity: 0.5, awning: 0x5a1a1a } }, 16, -6, -MAIN_FACADE, 'E');
    const bs = bladeSign('HOTEL', C.neonRed, 0.85);
    bs.position.set(-8.6, 10, 0);
    g.add(bs);
    pools.addWall(-MAIN_FACADE + 0.05, 10, 13.6, 5, C.neonRed, Math.PI / 2, 0.3);
  }
  bld({ w: 0, d: 14, floors: 2, color: col(3), shop: { interior: 0, awning: 0x7a5a1f, board: { text: 'CAFE', color: C.neonOrange, size: 0.5 } } }, -6, -24, -MAIN_FACADE, 'E');
  bld({ w: 0, d: 14, floors: 3, color: col(1), fireEscape: true, shop: null }, -24, -40, -MAIN_FACADE, 'E');
  const dinerPanes = buildDiner(zones.A, pools, addDyn, anim);
  bld({ w: 0, d: 14, floors: 3, color: col(4), shop: { interior: 0, shutter: true } }, -58, -74, -MAIN_FACADE, 'E');
  {
    const g = bld({ w: 0, d: 14, floors: 2, color: col(2), shop: { interior: 0xff6a9a, interiorIntensity: 0.32, blade: { text: 'BAR', color: C.neonPink, size: 0.75 } } }, -74, CROSS_Z0, -MAIN_FACADE, 'E');
    // Martini glass neon over the door.
    const gl = Kit.glow(C.neonCyan, 1.6);
    const mg = new THREE.Group();
    Kit.add(mg, Kit.cone(0.45, 0.55, 3), gl, 0, 0.3, 0, Math.PI, 0, 0, 1, 1, 0.12);
    Kit.add(mg, Kit.box(0.05, 0.55, 0.05), gl, 0, -0.25, 0);
    Kit.add(mg, Kit.box(0.4, 0.05, 0.05), gl, 0, -0.52, 0);
    mg.position.set(0, 3.9, 0.2);
    g.add(mg);
    pools.add(-MAIN_FACADE + 2.5, -81, 3.4, C.neonPink, 0.55);
    pools.addWall(-MAIN_FACADE + 0.05, 4.5, -81, 4, C.neonPink, Math.PI / 2, 0.4);
  }
  bld({ w: 0, d: 14, floors: 3, color: col(5), shop: null, roof: 'tank' }, CROSS_Z1, -118, -MAIN_FACADE, 'E');
  bld({ w: 0, d: 14, floors: 2, color: col(6), shop: { interior: 0, shutter: true, blade: { text: 'GUNS', color: C.neonOrange, size: 0.6 } } }, -118, -134, -MAIN_FACADE, 'E');
  bld({ w: 0, d: 14, floors: 3, color: col(0), shop: null, roof: 'tank' }, -134, ALLEY_S, -MAIN_FACADE, 'E');
  bld({ w: 0, d: 14, floors: 3, color: col(4), shop: { interior: 0, awning: 0x2a2a3a } }, ALLEY_N, -178, -MAIN_FACADE, 'E');
  bld({ w: 0, d: 14, floors: 2, color: col(2), shop: null }, -178, -205, -MAIN_FACADE, 'E');

  // Cross-street side buildings (seen when glancing down the intersection).
  for (const side of [1, -1]) {
    for (const [x0, x1, fl] of [[24, 40, 3], [40, 58, 2]] as const) {
      bld({ w: 0, d: 12, floors: fl, color: col(fl + (side > 0 ? 1 : 3)), shop: null }, side * x0, side * x1, CROSS_Z0, 'N');
      bld({ w: 0, d: 12, floors: fl + 1, color: col(fl + (side > 0 ? 2 : 4)), shop: null }, side * x0, side * x1, CROSS_Z1, 'S');
    }
  }
  // End of Main Street: wreck pile + barricade in the fog.
  {
    put(car({ color: CAR_COLORS[3], wrecked: true }), -2.5, -196, 1.2);
    put(car({ color: CAR_COLORS[0], burnt: true }), 2.2, -199, -0.4);
    put(car({ color: CAR_COLORS[5], wrecked: true }), 0.5, -203, 1.9);
    for (let x = -5; x <= 5; x += 2.5) put(sawhorse(), x, -192, rng.spread(0.3));
  }

  // Main Street occluders (facades well away from where enemies come from).
  occ(MAIN_FACADE, MAIN_FACADE + 14, 40, CROSS_Z0);
  occ(MAIN_FACADE, MAIN_FACADE + 14, CROSS_Z1, -205);
  occ(-MAIN_FACADE - 14, -MAIN_FACADE, 40, -40);
  occ(-MAIN_FACADE - 14, -MAIN_FACADE, -58, CROSS_Z0);
  occ(-MAIN_FACADE - 14, -MAIN_FACADE, CROSS_Z1, ALLEY_S);

  // ─── Main Street furniture & cars ─────────────────────────────────────────
  // Street lamps (alternating sides).
  const lamp = (x: number, z: number, side: 1 | -1, bad = false) => {
    const g = streetLamp();
    put(g, x, z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const hx = x - side * 2.2;
    const poolIdx = pools.add(hx - side * 0.4, z, 5.2, C.sodium, 0.62);
    const beamIdx = beams.add(hx, 6.3, z, 6.25, 2.5, C.sodium, 1);
    if (bad) {
      // Pull the glow out so it can flicker.
      const glowMesh = g.children[g.children.length - 1];
      g.remove(glowMesh);
      glowMesh.position.set(hx, 6.3, z);
      glowMesh.rotation.y = g.rotation.y;
      addDyn(glowMesh);
      anim.badLamp = { glow: glowMesh, pool: poolIdx, beam: beamIdx, color: C.sodium };
    }
  };
  for (const z of [6, -30, -62, -112, -144, -176]) lamp(8.9, z, 1);
  for (const z of [-14, -46, -78, -128, -160, -192]) lamp(-8.9, z, -1, z === -46);
  // Second Street lamps.
  for (const z of [-118, -146, -178, -210, -242]) lamp(SECOND_E - 0.6, z, 1);
  for (const z of [-130, -162, -194, -226, -256]) lamp(SECOND_W + 0.6, z, -1);

  // Street trees, hydrants, bins, news boxes along both Main Street sidewalks.
  for (const z of [28, -6, -38, -70, -108, -140, -170]) put(streetTree(rng), 7.8, z - 4);
  for (const z of [20, -22, -54, -104, -150]) put(streetTree(rng), -7.8, z);
  put(hydrant(), 6.6, -18);
  put(hydrant(), -6.6, -66);
  put(hydrant(), 6.6, -116);
  put(trashCan(), 6.8, -3);
  put(trashCan(), -6.8, -27);
  put(trashCan(), 6.8, -58);
  put(trashCan(), -6.8, -106);
  put(newsBox(0x2a4a8a), 6.9, -10.5, -Math.PI / 2);
  put(newsBox(0x9a2a1a), 6.9, -11.2, -Math.PI / 2);
  put(newsBox(0xb8a020), -6.9, -122, Math.PI / 2);
  put(mailbox(), -6.8, 4, Math.PI / 2);
  put(bench(), 8.7, -50, -Math.PI / 2);
  put(bench(), -8.7, -96 + 12, Math.PI / 2);
  // Utility poles with sagging wires along the east side.
  {
    const poles = [12, -36, -84, -132, -180];
    for (const z of poles) put(utilityPole(), 8.2, z);
    const wire = Kit.mat(0x101114);
    for (let i = 0; i < poles.length - 1; i++) {
      const z0 = poles[i];
      const z1 = poles[i + 1];
      for (const off of [-0.9, 0.9]) {
        const seg = 6;
        for (let k = 0; k < seg; k++) {
          const t0 = k / seg;
          const t1 = (k + 1) / seg;
          const y0 = 8.4 - Math.sin(t0 * Math.PI) * 0.9;
          const y1 = 8.4 - Math.sin(t1 * Math.PI) * 0.9;
          const za = z0 + (z1 - z0) * t0;
          const zb = z0 + (z1 - z0) * t1;
          const m = boxAt(0.03, 0.03, Math.hypot(zb - za, y1 - y0) + 0.02, wire, 8.2 + off, (y0 + y1) / 2, (za + zb) / 2);
          m.rotation.x = Math.atan2(y1 - y0, -(zb - za));
        }
      }
    }
  }
  // Hanging traffic light over the intersection (yellow blinks).
  {
    const zc = (CROSS_Z0 + CROSS_Z1) / 2;
    for (const x of [-7.6, 7.6]) {
      boxAt(0.22, 7.4, 0.22, M.metal, x, 3.7, CROSS_Z0 - 0.5);
    }
    boxAt(15.2, 0.05, 0.05, Kit.mat(0x101114), 0, 7.1, CROSS_Z0 - 0.5);
    const tl = new THREE.Group();
    Kit.add(tl, Kit.box(0.45, 1.3, 0.4), Kit.mat(0x2a2a1e), 0, 0, 0);
    Kit.add(tl, Kit.cyl(0.12, 0.12, 0.05, 8), Kit.mat(0x3a0a0a), 0, 0.4, 0.21, Math.PI / 2);
    Kit.add(tl, Kit.cyl(0.12, 0.12, 0.05, 8), Kit.mat(0x0a2a12), 0, -0.4, 0.21, Math.PI / 2);
    Kit.add(tl, Kit.cyl(0.12, 0.12, 0.05, 8), Kit.mat(0x3a2a0a), 0, 0, 0.21, Math.PI / 2);
    put(tl, 0, CROSS_Z0 - 0.5, 0, 6.4);
    const amber = Kit.mesh(Kit.cyl(0.13, 0.13, 0.06, 8), Kit.glow(0xffb020, 1.8));
    amber.rotation.x = Math.PI / 2;
    amber.position.set(0, 6.4, CROSS_Z0 - 0.5 + 0.22);
    addDyn(amber);
    anim.blinkers.push({ obj: amber, period: 1.1, duty: 0.5, phase: 0 });
    void zc;
  }

  // Cars on Main Street.
  const parked: [number, number, number, number, string[]?, boolean?][] = [
    // x, z, yaw, colour index, open doors, headlights
    [4.4, -2, Math.PI, 1],
    [4.6, -21.5, Math.PI + 0.05, 2],
    [-4.5, -30, 0.08, 4, ['fl']],
    [-4.6, -64, 0, 6],
    [4.5, -45, Math.PI - 0.1, 3, ['rr']],
    [-4.3, -86.5, 0.55, 5, ['fl', 'fr'], true],
    [4.5, -106, Math.PI, 7],
    [-4.4, -110, 0.12, 0, ['fl']],
    [-4.0, -136, 0.35, 1, ['fr']],
    [4.6, -150, Math.PI, 2],
    [-4.6, -172, 0, 3],
  ];
  for (const [x, z, ry, ci, open, hl] of parked) {
    put(car({ color: CAR_COLORS[ci], open, headlights: hl, taillights: !!hl }), x, z, ry);
    if (hl) {
      // Headlight beams across the road.
      const fx = Math.sin(ry);
      const fz = Math.cos(ry);
      for (const s of [-0.62, 0.62]) {
        const bx = x + fx * 2.3 + Math.cos(ry) * s;
        const bz = z + fz * 2.3 - Math.sin(ry) * s;
        beams.add(bx, 0.68, bz, 9, 1.6, 0xfff0d0, 0.8, -Math.PI / 2 + 0.06, ry);
      }
      pools.add(x + fx * 7, z + fz * 7, 4.5, 0xfff0d0, 0.35);
    }
  }
  // Burning car (right lane).
  {
    put(car({ color: 0, burnt: true }), 3.1, -66.5, Math.PI + 0.35);
    const plume = new FirePlume({ scale: 1.15, embers: 30, smoke: 14, seed: 11 });
    plume.group.position.set(3.1, 0.75, -66.5);
    addDyn(plume.group);
    anim.fires.push({ plume, pos: new THREE.Vector3(3.1, 1.6, -66.5), light: 34 });
    pools.add(3.1, -66.5, 7, 0xff7a2a, 0.75);
  }

  // ─── Police barricade (opening shot) ──────────────────────────────────────
  {
    const z = -2;
    put(sawhorse(), -4.7, z, 0.1);
    put(sawhorse(), -2.35, z - 0.3, -0.05);
    put(sawhorse(), 2.6, z - 0.2, 0.06);
    put(sawhorse(), 5.0, z + 0.2, -0.12);
    // One knocked flat in the gap — something came through here.
    const down = sawhorse();
    down.rotation.set(-Math.PI / 2 + 0.1, 0.4, 0);
    down.position.set(0.6, 0.15, z - 3.2);
    zones.A.add(down);
    // ROAD CLOSED board.
    const sign = new THREE.Group();
    Kit.add(sign, Kit.box(2.0, 0.55, 0.05), M.white, 0, 0, 0);
    Kit.add(sign, Kit.box(2.06, 0.6, 0.03), M.orange, 0, 0, -0.03);
    const t = paintedText('ROAD CLOSED', 0x141414, 0.3);
    t.position.z = 0.04;
    sign.add(t);
    put(sign, -2.35, z - 0.25, -0.05, 1.45);
    // Police tape between the outer sawhorses and the lamp.
    const tape = Kit.mat(0xd8b818);
    for (const [x0, x1] of [[-8.6, -5.9], [6.2, 8.6]] as const) {
      boxAt(Math.abs(x1 - x0), 0.07, 0.01, tape, (x0 + x1) / 2, 1.0, z, rng.spread(0.05));
    }
    for (let i = 0; i < 7; i++) put(trafficCone(), rng.range(-6, 6), z + rng.range(-1.5, 2.5), 0);
    // Police cruisers angled into a V.
    for (const [x, zz, ry, open] of [[-5.0, -7.5, Math.PI - 0.75, ['fr', 'rr']], [5.3, -8.6, Math.PI + 0.7, ['fl']]] as const) {
      const pc = car({ color: 0, police: true, open: [...open], headlights: true });
      const bars = pc.userData.lightbar as THREE.Mesh[];
      put(pc, x, zz, ry);
      // Lightbars flash: lift them out of the merged scenery.
      pc.updateMatrixWorld(true);
      for (const b of bars) {
        b.updateMatrixWorld(true);
        const m = b.matrixWorld.clone();
        b.parent?.remove(b);
        m.decompose(b.position, b.quaternion, b.scale);
        addDyn(b);
      }
      anim.lightbars.push(bars);
      pools.add(x, zz, 4, 0x4060ff, 0.3);
    }
    // Floodlight on a tripod aimed down the street.
    const tri = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      Kit.add(tri, Kit.box(0.05, 2.6, 0.05), M.metal, Math.cos(a) * 0.4, 1.25, Math.sin(a) * 0.4, Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15);
    }
    Kit.add(tri, Kit.box(0.9, 0.6, 0.4), M.metal, 0, 2.7, 0, -0.2);
    Kit.add(tri, Kit.box(0.8, 0.5, 0.05), Kit.glow(0xf4f8ff, 2), 0, 2.72, -0.22, -0.2);
    // Placed behind the barricade, aimed down the street (away from the player).
    put(tri, -7.2, z - 6.5, Math.PI - 0.3);
    beams.add(-7.2 - 0.07, 2.75, z - 6.5 - 0.22, 14, 2.2, 0xdfe8ff, 0.35, -Math.PI / 2 + 0.18, Math.PI - 0.3);
    pools.add(-4.5, z - 16, 4.5, 0xdfe8ff, 0.35);
  }

  // ─── Alley ───────────────────────────────────────────────────────────────
  {
    // Deep warehouse blocks forming the alley walls beyond Main Street's buildings.
    const wh = (x0: number, x1: number, z0: number, z1: number, floors: number, color: number) => {
      const h = buildingHeight(floors);
      boxAt(Math.abs(x1 - x0), h, Math.abs(z1 - z0), Kit.mat(color), (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      boxAt(Math.abs(x1 - x0) + 0.2, 0.4, Math.abs(z1 - z0) + 0.2, M.trimDark, (x0 + x1) / 2, h - 0.1, (z0 + z1) / 2);
    };
    wh(-48.5, -23.5, ALLEY_S, -128, 3, 0x4a3426);
    wh(-45, -23.5, ALLEY_N, -178, 3, 0x3a3a40);
    // Wall details on the alley-facing sides.
    const south = new THREE.Group(); // faces -Z (N)
    wallDetails(south, -19.5, 19.5, 3, rng, { fireEscapes: [-8, 9], doors: [-2, 13] });
    put(south, -29, ALLEY_S, ROT.N, 0, 'C');
    const north = new THREE.Group(); // faces +Z (S)
    wallDetails(north, -17.8, 17.8, 3, rng, { fireEscapes: [-8.8, 6], doors: [3] });
    put(north, -27.2, ALLEY_N, ROT.S, 0, 'C');
    // Dumpsters, bags, crates, pallets.
    put(dumpster(), -15, ALLEY_N + 0.9, 0, 0, 'C');
    put(dumpster(0x3a2a22), -42, ALLEY_S - 0.9, Math.PI, 0, 'C');
    put(trashBags(rng, 5), -17.8, ALLEY_N + 0.9, 0, 0, 'C');
    put(trashBags(rng, 4), -39, ALLEY_S - 0.8, 0, 0, 'C');
    put(crate(0.9), -24, ALLEY_S - 0.7, 0.3, 0, 'C');
    put(crate(0.7), -24.6, ALLEY_S - 0.8, 0.8, 0.9, 'C');
    put(crate(0.8), -33, ALLEY_N + 0.7, 0.2, 0, 'C');
    // Overhead wires.
    for (const x of [-14, -22, -34, -43]) boxAt(0.03, 0.03, 7, Kit.mat(0x101114), x, 7.6 + rng.spread(0.4), (ALLEY_S + ALLEY_N) / 2, 0, 'C');
    // Caged bulbs over the back doors.
    for (const [x, z, s] of [[-31, ALLEY_S - 0.3, -1], [-16.5 - 7.3, ALLEY_N + 0.3, 1], [-42, ALLEY_S - 0.3, -1]] as const) {
      const g = new THREE.Group();
      Kit.add(g, Kit.box(0.3, 0.12, 0.3), M.metal, 0, 0.1, 0);
      Kit.add(g, Kit.sphere(0.13, 8, 6), Kit.glow(0xffd08a, 1.7), 0, -0.05, 0.05);
      put(g, x, z, 0, 3.1, 'C');
      pools.add(x, z + s * 1.4, 3, 0xffc070, 0.55);
      pools.addWall(x, 2.6, z + s * 0.06, 2.4, 0xffc070, s > 0 ? 0 : Math.PI, 0.35);
    }
    // Trash-can fire.
    const fireX = -37.5;
    const fireZ = ALLEY_N + 1.3;
    put(trashCan(), fireX, fireZ, 0, 0, 'C');
    const plume = new FirePlume({ scale: 0.42, embers: 16, smoke: 8, spreadX: 0.25, spreadZ: 0.25, seed: 7 });
    plume.group.position.set(fireX, 0.95, fireZ);
    addDyn(plume.group);
    anim.fires.push({ plume, pos: new THREE.Vector3(fireX, 1.6, fireZ), light: 18 });
    pools.add(fireX, fireZ, 4, 0xff7a2a, 0.6);
    // Chain-link fence at the corner lot.
    const fence = new THREE.Group();
    const fm = Kit.mat(0x5a5e64, { transparent: true, opacity: 0.45 });
    Kit.add(fence, Kit.box(3.6, 2.4, 0.03), fm, 0, 1.2, 0);
    for (const x of [-1.8, 0, 1.8]) Kit.add(fence, Kit.cyl(0.04, 0.04, 2.5, 5), M.metalLight, x, 1.25, 0);
    put(fence, -46.8, ALLEY_N - 0.2, 0, 0, 'C');
    // Alley occluders: the walls themselves (enemies only ever come down the alley).
    occ(-48.5, -9.5, ALLEY_S, ALLEY_S + 6, 14);
    occ(-45, -9.5, ALLEY_N - 6, ALLEY_N, 14);
  }

  // ─── Second Street ────────────────────────────────────────────────────────
  {
    // East side (facing -X).
    bld({ w: 0, d: 25, floors: 3, color: col(1), shop: null }, -120, ALLEY_S, SECOND_E, 'W');
    bld({ w: 0, d: 14, floors: 2, color: col(4), shop: { interior: 0, awning: 0x3a3a1f } }, -164, -184, SECOND_E, 'W');
    bld({ w: 0, d: 14, floors: 3, color: col(6), fireEscape: true, shop: null }, -184, -204, SECOND_E, 'W');
    bld({ w: 0, d: 14, floors: 2, color: col(0), shop: { interior: 0xffc890, interiorIntensity: 0.35, blade: { text: 'MOTEL', color: C.neonBlue, size: 0.6 } } }, -204, -224, SECOND_E, 'W');
    pools.addWall(SECOND_E - 0.05, 5.5, -207, 4, C.neonBlue, -Math.PI / 2, 0.35);
    bld({ w: 0, d: 14, floors: 3, color: col(3), shop: null, roof: 'tank' }, -224, -240, SECOND_E, 'W');
    // Storefront the bus ploughed into.
    {
      const g = bld({ w: 0, d: 14, floors: 2, color: col(2), shop: { interior: 0, noWindow: true } }, -240, SQ_Z0, SECOND_E, 'W');
      Kit.add(g, Kit.box(8, 2.6, 0.2), Kit.mat(0x0a0a0c), -2, 1.5, -0.05);
      for (let i = 0; i < 10; i++) {
        Kit.add(g, Kit.box(rng.range(0.3, 0.9), rng.range(0.2, 0.5), rng.range(0.3, 0.8)), i % 2 ? M.concrete : Kit.mat(col(2)), rng.range(-6, 2), 0.2, rng.range(0.2, 2.2), rng.next(), rng.next(), 0);
      }
    }
    // West side (facing +X).
    bld({ w: 0, d: 14, floors: 3, color: col(5), shop: null }, -110, -146, SECOND_W, 'E');
    // Police station at the T-junction.
    {
      const g = bld({ w: 0, d: 16, floors: 3, color: 0x4a4e58, trim: M.trimLight, shop: { interior: 0xe0ecff, interiorIntensity: 0.5, board: { text: 'POLICE', color: 0x9fc8ff, size: 0.7 } } }, -146, -170, SECOND_W, 'E');
      // Blue lamps either side of the door.
      for (const lx of [-1.5, 1.5]) {
        Kit.add(g, Kit.box(0.3, 0.4, 0.3), Kit.glow(0x3a6aff, 1.8), 12 - 1.3 + lx, 2.9, 0.4);
      }
      // Steps.
      Kit.add(g, Kit.box(3.5, 0.18, 1.0), M.concrete, 10.7, 0.09, 0.6);
      Kit.add(g, Kit.box(3.5, 0.18, 0.6), M.concrete, 10.7, 0.27, 0.4);
      pools.addWall(SECOND_W + 0.05, 2.9, -168.7, 3.5, 0x3a6aff, Math.PI / 2, 0.35);
      pools.add(SECOND_W + 2.5, -158, 5, 0x9fc8ff, 0.35);
    }
    bld({ w: 0, d: 14, floors: 2, color: col(3), shop: { interior: 0, awning: 0x5a1f1f } }, -170, GAS_Z0, SECOND_W, 'E');
    bld({ w: 0, d: 14, floors: 3, color: col(1), shop: { interior: 0, shutter: true } }, GAS_Z1, -246, SECOND_W, 'E');
    bld({ w: 0, d: 14, floors: 2, color: col(4), shop: null }, -246, SQ_Z0, SECOND_W, 'E');
    occ(SECOND_W - 14, SECOND_W, -110, GAS_Z0);
    occ(SECOND_E, SECOND_E + 14, -164, -240);

    // Crashed police cruiser at the rescue spot (lights flashing).
    {
      const pc = car({ color: 0, police: true, open: ['fl', 'rl'], headlights: true, wrecked: true });
      const bars = pc.userData.lightbar as THREE.Mesh[];
      put(pc, -53.6, -188.5, Math.PI + 0.9);
      pc.updateMatrixWorld(true);
      for (const b of bars) {
        b.updateMatrixWorld(true);
        const m = b.matrixWorld.clone();
        b.parent?.remove(b);
        m.decompose(b.position, b.quaternion, b.scale);
        addDyn(b);
      }
      anim.lightbars.push(bars);
      pools.add(-53.6, -188.5, 4.5, 0x4060ff, 0.35);
      put(hydrant(), -51.6, -191);
    }
    // Parked / abandoned cars.
    put(car({ color: CAR_COLORS[6] }), SECOND_X - 4.5, -178, 0.05);
    put(car({ color: CAR_COLORS[1], open: ['fr'] }), SECOND_X + 4.4, -232, Math.PI - 0.1);
    put(car({ color: CAR_COLORS[2], open: ['fl'] }), SECOND_X - 3.6, -232.5, 0.35);
    put(car({ color: CAR_COLORS[4] }), SECOND_X - 4.5, -252, 0);
    for (const z of [-182, -214, -246]) put(streetTree(rng), SECOND_E - 1.6, z);
    put(trashCan(), SECOND_W + 1.2, -186);
    put(newsBox(0x2a4a8a), SECOND_E - 1.1, -196, -Math.PI / 2);
    // Bus stop shelter.
    {
      const g = new THREE.Group();
      Kit.add(g, Kit.box(3.2, 0.08, 1.4), M.metal, 0, 2.4, 0);
      for (const x of [-1.5, 1.5]) Kit.add(g, Kit.box(0.08, 2.4, 0.08), M.metal, x, 1.2, -0.6);
      Kit.add(g, Kit.box(3.0, 1.8, 0.04), Kit.mat(0x8fa8b8, { transparent: true, opacity: 0.3 }), 0, 1.3, -0.62);
      Kit.add(g, Kit.box(1.1, 1.7, 0.05), Kit.glow(0xe8e0c8, 0.5), 1.0, 1.3, -0.58);
      g.add(bench());
      put(g, SECOND_E - 1.3, -236, -Math.PI / 2);
    }
  }

  // ─── Gas station ─────────────────────────────────────────────────────────
  const gasCenter = new THREE.Vector3(-76, 0, (GAS_Z0 + GAS_Z1) / 2);
  const gas = new GasStation(gasCenter, [12, 18], 5.2);
  {
    const cz = gasCenter.z;
    // Canopy (animated group pivoting on its west edge).
    const cg = gas.canopy;
    const pivot = new THREE.Vector3(-82, 5.2, cz);
    cg.position.copy(pivot);
    const can = new THREE.Group();
    Kit.add(can, Kit.box(12, 0.75, 18), Kit.mat(0xdedad0), 0, 0, 0);
    Kit.add(can, Kit.box(12.05, 0.32, 18.05), Kit.mat(0xa82a22), 0, -0.05, 0);
    const under = Kit.glow(0xf2f6ff, 1.25);
    for (const x of [-3.5, 0, 3.5]) {
      for (const z of [-6, -2, 2, 6]) {
        const p = Kit.add(can, Kit.box(1.4, 0.05, 0.7), under, x, -0.4, z);
        gas.underGlow.push(p);
      }
    }
    // GAS letters on the fascia (facing the street, +X).
    const t = addText(can, 'GAS', Kit.glow(0xffffff, 1.4), { size: 0.5, depth: 0.05 });
    t.rotation.y = Math.PI / 2;
    t.position.set(6.05, 0.0, 0);
    can.position.set(6, 0, 0);
    cg.add(can);
    mergedGroup(can);
    // The merged under-glow meshes were removed by the merge: re-collect by material.
    gas.underGlow.length = 0;
    can.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === under) gas.underGlow.push(o);
    });
    addDyn(cg, 'D');
    // Pillars (static).
    for (const x of [-79, -73]) for (const z of [cz - 6, cz + 6]) boxAt(0.45, 5.2, 0.45, M.white, x, 2.6, z, 0, 'D');
    // Pump islands (pumps themselves are destructibles).
    for (const x of [-79, -73]) boxAt(1.4, 0.22, 7, M.concrete, x, 0.11, cz, 0, 'D');
    // Store.
    {
      const g = bld({ w: 0, d: 10, floors: 1, color: 0x6e6658, trim: M.trimLight, shop: { interior: 0xe8fff0, interiorIntensity: 0.6, board: { text: 'GAS & GO', color: C.neonRed, size: 0.5 } } }, GAS_Z0 - 4, GAS_Z1 + 4, -88, 'E');
      const open = boardSign('OPEN', C.neonRed, 0.32, { pad: 0.3 });
      open.position.set(-2.5, 2.6, 0.12);
      g.add(open);
      // Ice chest + tyre stack.
      Kit.add(g, Kit.box(1.6, 1.1, 0.8), Kit.mat(0xd8e0e8), 6, 0.55, 0.6);
      Kit.add(g, Kit.box(1.5, 0.3, 0.05), Kit.glow(0x6ab8ff, 0.8), 6, 0.8, 1.01);
      for (let i = 0; i < 4; i++) Kit.add(g, Kit.cyl(0.4, 0.4, 0.25, 10), M.tire, -7, 0.13 + i * 0.26, 1.2);
    }
    // Price sign on a pole by the street.
    {
      const g = new THREE.Group();
      Kit.add(g, Kit.cyl(0.15, 0.15, 7, 6), M.metal, 0, 3.5, 0);
      Kit.add(g, Kit.box(0.4, 3, 2.4), Kit.mat(0x1a1a1e), 0, 7.6, 0);
      put(g, -69.5, GAS_Z0 - 1.5, 0, 0, 'D');
      for (const side of [1, -1]) {
        const brand = new THREE.Group();
        Kit.add(brand, Kit.box(2.2, 1.0, 0.04), Kit.glow(0xc8281e, 1.1), 0, 0.7, 0);
        const lt = addText(brand, 'GAS', Kit.glow(0xffffff, 1.3), { size: 0.5, depth: 0.04 });
        lt.position.set(0, 0.7, 0.04);
        Kit.add(brand, Kit.box(2.2, 1.4, 0.04), Kit.mat(0x101012), 0, -0.6, 0);
        const price = addText(brand, '3.19', Kit.glow(0x6aff6a, 1.4), { size: 0.55, depth: 0.04 });
        price.position.set(0, -0.6, 0.04);
        brand.position.set(-69.5 + side * 0.22, 7.6, GAS_Z0 - 1.5);
        brand.rotation.y = (side * Math.PI) / 2;
        mergedGroup(brand);
        addDyn(brand, 'D');
        gas.priceGlow.push(brand);
      }
    }
    // Fires that appear once the pumps go up (inactive until then).
    for (const [x, z, s] of [[-79, cz, 1.0], [-73, cz - 2, 0.9], [-85.5, GAS_Z1 + 6, 0.8], [-72, cz + 7, 0.6]] as const) {
      const plume = new FirePlume({ scale: s, embers: 20, smoke: 10, spreadX: 0.9, spreadZ: 1.6, seed: Math.round(-x * 3) });
      plume.active = false;
      plume.group.position.set(x, 0.1, z);
      gas.fires.push(plume);
      addDyn(plume.group);
      anim.fires.push({ plume, pos: new THREE.Vector3(x, 1.5, z), light: 40 });
    }
    pools.add(-76, cz, 9, 0xe8f0ff, 0.4);
    // Pump + barrel layout.
    gas.spawnPoints = {
      pumps: [new THREE.Vector3(-73, 0.22, cz - 1.6), new THREE.Vector3(-79, 0.22, cz + 1.6)],
      barrels: [
        new THREE.Vector3(-71.6, 0, cz - 4.2),
        new THREE.Vector3(-70.9, 0, cz - 3.4),
        new THREE.Vector3(-80.6, 0, cz - 4.6),
        new THREE.Vector3(-76.5, 0, cz + 6.2),
        new THREE.Vector3(-84.6, 0, cz + 2.4),
        new THREE.Vector3(-74.2, 0, cz + 3.9),
      ],
      propane: new THREE.Vector3(-86.5, 0, GAS_Z1 + 6.5),
    };
  }

  // ─── Overturned school bus ───────────────────────────────────────────────
  let bus: BusWreck;
  {
    const body = schoolBus();
    mergedGroup(body);
    const door = new THREE.Group();
    Kit.add(door, Kit.box(1.9, 1.9, 0.12), Kit.mat(0xd29a16), 0, 0, 0);
    Kit.add(door, Kit.box(1.3, 0.7, 0.14), M.carGlass, 0, 0.4, 0);
    Kit.add(door, Kit.box(1.5, 0.12, 0.16), Kit.mat(0x18181a), 0, -0.45, 0);
    Kit.add(door, Kit.box(0.3, 0.2, 0.18), Kit.glow(0xff2a1a, 1), 0.7, 0.75, 0);
    // Door sits on the bus's rear face (local -Z) — in bus space.
    door.position.set(0, 1.75, -5.47);
    door.rotation.y = Math.PI;
    const holder = new THREE.Group();
    holder.add(body, door);
    // Lie it on its right side, underside facing the street (+Z), front into the shop.
    holder.rotation.set(0, Math.PI / 2 + BUS_YAW, -Math.PI / 2);
    holder.position.set(BUS_POS[0], 1.25, BUS_POS[2]);
    const engineFire = new FirePlume({ scale: 0.55, embers: 14, smoke: 10, spreadX: 0.5, spreadZ: 0.5, seed: 21 });
    bus = new BusWreck(new THREE.Group(), door, engineFire);
    bus.group.add(holder);
    addDyn(bus.group, 'D');
    // Engine fire at the crushed front end (world).
    const fwd = new THREE.Vector3(Math.sin(Math.PI / 2 + BUS_YAW), 0, Math.cos(Math.PI / 2 + BUS_YAW));
    const roofDir = new THREE.Vector3(Math.cos(Math.PI / 2 + BUS_YAW), 0, -Math.sin(Math.PI / 2 + BUS_YAW));
    const fp = new THREE.Vector3(BUS_POS[0], 0.6, BUS_POS[2]).addScaledVector(fwd, 5.2).addScaledVector(roofDir, 1.4);
    engineFire.group.position.copy(fp);
    addDyn(engineFire.group);
    anim.fires.push({ plume: engineFire, pos: fp.clone().setY(1.5), light: 22 });
    pools.add(fp.x, fp.z, 4, 0xff7a2a, 0.55);
    // Debris + skid marks.
    for (let i = 0; i < 8; i++) boxAt(0.5, 0.01, rng.range(2, 4), Kit.mat(0x0d0e10), SECOND_X - 1 + i * 0.25, 0.022, -232 - i * 1.8, -0.4);
    for (let i = 0; i < 12; i++) boxAt(rng.range(0.15, 0.5), rng.range(0.05, 0.2), rng.range(0.15, 0.5), i % 3 ? M.carGlass : Kit.mat(0xd29a16), BUS_POS[0] + rng.spread(6), 0.08, BUS_POS[2] + rng.range(1.5, 4.5), rng.next() * 3);
    // Bullets stop on the bus body (enemies only climb out of it toward the camera).
    const bocc = new THREE.Mesh(Kit.box(11.4, 2.4, 2.8), Kit.mat(0x000000));
    bocc.position.set(BUS_POS[0], 1.25, BUS_POS[2]).addScaledVector(roofDir, 1.45);
    bocc.rotation.y = BUS_YAW;
    bocc.visible = false;
    dynamic.add(bocc);
    occluders.push(bocc);
  }

  // ─── Town square ─────────────────────────────────────────────────────────
  const doors = new BurstDoors();
  {
    // Paving pattern.
    for (let x = SQ_X0 + 4; x < SQ_X1; x += 4) boxAt(0.08, 0.012, SQ_Z0 - SQ_Z1, M.trimDark, x, 0.018, (SQ_Z0 + SQ_Z1) / 2, 0, 'E');
    for (let z = SQ_Z0 - 4; z > SQ_Z1; z -= 4) boxAt(SQ_X1 - SQ_X0, 0.012, 0.08, M.trimDark, (SQ_X0 + SQ_X1) / 2, 0.018, z, 0, 'E');
    // West: low shop row (spitter rooftop) + 3-storey.
    {
      const h = 4.3;
      const g = new THREE.Group();
      Kit.add(g, Kit.box(20, h, 16), Kit.mat(0x5a4a3c), 0, h / 2, -8);
      Kit.add(g, Kit.box(20.2, 0.12, 16.2), M.roof, 0, h + 0.04, -8);
      Kit.add(g, Kit.box(20.3, 0.5, 0.35), M.trimLight, 0, h + 0.25, 0.05);
      for (const [lx, c, txt] of [[-5, 0xffd8a0, 'BOOKS'], [5, 0, 'TOYS']] as const) {
        Kit.add(g, Kit.box(6.5, 2.3, 0.1), c ? Kit.glow(c, 0.4) : M.winDark, lx, 1.8, 0.04);
        const s = boardSign(txt, c ? C.neonOrange : C.neonPink, 0.45, { pad: 0.5 });
        s.position.set(lx, 3.6, 0.15);
        g.add(s);
      }
      Kit.add(g, Kit.box(2.4, 0.1, 0.9), M.metal, 0, h - 0.6, 0.45);
      put(g, SQ_X0, -274, ROT.E, 0, 'E');
      // Rooftop clutter (behind where the spitter stands).
      boxAt(1.4, 0.9, 1.1, M.metalLight, -75, h + 0.45, -270, 0, 'E');
      boxAt(0.7, 1.5, 0.7, Kit.mat(0x3b2a24), -78, h + 0.75, -279, 0, 'E');
    }
    bld({ w: 0, d: 16, floors: 3, color: col(3), shop: { interior: 0, awning: 0x2a4a3a } }, -284, SQ_Z1, SQ_X0, 'E');
    // North: hotel, butcher, bank.
    bld({ w: 0, d: 16, floors: 4, color: col(0), trim: M.trimLight, shop: { interior: 0xffd09a, interiorIntensity: 0.4, awning: 0x3a1a1a, board: { text: 'GRAND HOTEL', color: C.neonYellow, size: 0.5 } } }, -90, -66, SQ_Z1, 'S');
    {
      // PRIME MEATS — the Butcher's lair.
      const x0 = -66;
      const x1 = -50;
      const g = bld({ w: 0, d: 16, floors: 2, color: 0x5a4a44, trim: M.trimLight, shop: { interior: 0, noWindow: true } }, x0, x1, SQ_Z1, 'S');
      const red = Kit.glow(0xff3a2a, 0.55);
      // Display windows either side of the doors with hanging carcasses.
      for (const lx of [-5, 5]) {
        Kit.add(g, Kit.box(4.2, 2.4, 0.1), red, lx, 1.85, 0.02);
        Kit.add(g, Kit.box(4.2, 0.06, 0.06), M.metal, lx, 2.85, 0.12);
        for (let i = 0; i < 3; i++) {
          const cx = lx - 1.3 + i * 1.3;
          Kit.add(g, Kit.capsule(0.28, 0.9, 2, 6), Kit.mat(0x2a0a0a), cx, 2.0, 0.12);
          Kit.add(g, Kit.box(0.03, 0.4, 0.03), M.metal, cx, 2.75, 0.12);
        }
        for (let i = 1; i < 3; i++) Kit.add(g, Kit.box(0.08, 2.4, 0.16), M.winFrame, lx - 2.1 + i * 1.4, 1.85, 0.07);
      }
      // Doorway (dark interior lit red) — the doors burst open before the boss.
      Kit.add(g, Kit.box(3.2, 3.4, 0.06), Kit.glow(0x7a1810, 0.6), 0, 1.7, 0.03);
      Kit.add(g, Kit.box(0.35, 3.6, 0.5), M.trimLight, -1.75, 1.8, 0.25);
      Kit.add(g, Kit.box(0.35, 3.6, 0.5), M.trimLight, 1.75, 1.8, 0.25);
      Kit.add(g, Kit.box(3.9, 0.4, 0.5), M.trimLight, 0, 3.6, 0.25);
      // Striped awning.
      for (let i = 0; i < 10; i++) {
        Kit.add(g, Kit.box(1.4, 0.08, 1.8), Kit.mat(i % 2 ? 0xe8e0d8 : 0x9a1a1a), -6.3 + i * 1.4, 3.85, 0.85, 0.34);
      }
      const sign = boardSign('PRIME MEATS', C.neonRed, 0.62, { pad: 0.8 });
      sign.position.set(0, 5.05, 0.25);
      g.add(sign);
      // Blade sign with a cleaver shape.
      const cl = new THREE.Group();
      Kit.add(cl, Kit.box(0.2, 1.4, 2.4), M.signBack, 0, 0, 1.6);
      const cg = Kit.glow(0xff4a3a, 1.6);
      for (const sx of [-1, 1]) {
        Kit.add(cl, Kit.box(0.05, 0.9, 1.3), cg, sx * 0.12, 0.05, 1.9);
        Kit.add(cl, Kit.box(0.05, 0.22, 0.9), cg, sx * 0.12, -0.15, 0.8);
      }
      cl.position.set(6.8, 7.5, 0);
      g.add(cl);
      // Door panels (world space, animated).
      const dm = Kit.mat(0x3a2418);
      const dg = Kit.glow(0xff5a3a, 0.5);
      for (const sx of [-1, 1]) {
        const p = new THREE.Group();
        Kit.add(p, Kit.box(1.55, 3.2, 0.12), dm, 0, 0, 0);
        Kit.add(p, Kit.box(0.9, 1.2, 0.14), dg, 0, 0.6, 0);
        Kit.add(p, Kit.box(0.1, 0.4, 0.2), M.chrome, -sx * 0.6, -0.1, 0.06);
        p.position.set((x0 + x1) / 2 + sx * 0.79, 1.6, SQ_Z1 + 0.1);
        mergedGroup(p);
        addDyn(p, 'E');
        doors.panels.push(p);
      }
      pools.add((x0 + x1) / 2, SQ_Z1 + 3, 6, 0xff3a2a, 0.6);
      pools.addWall((x0 + x1) / 2, 5, SQ_Z1 + 0.06, 6, 0xff3a2a, 0, 0.35);
    }
    bld({ w: 0, d: 16, floors: 2, color: 0x7a7468, trim: M.trimLight, shop: { interior: 0, board: { text: 'BANK', color: C.neonYellow, size: 0.6 } } }, -50, -30, SQ_Z1, 'S');
    bld({ w: 0, d: 16, floors: 3, color: col(2), shop: null }, -30, -10, SQ_Z1, 'S');
    // East: courthouse with clock tower.
    {
      const fx = SQ_X1;
      const g = new THREE.Group();
      const stone = Kit.mat(0x7a7468);
      const h = 11;
      Kit.add(g, Kit.box(36, h, 18), stone, 0, h / 2, -9);
      Kit.add(g, Kit.box(36.5, 0.8, 18.5), M.trimLight, 0, h, -9);
      // Portico.
      Kit.add(g, Kit.box(14, 0.8, 4), M.trimLight, 0, 7.2, 2);
      Kit.add(g, Kit.cone(8.2, 2.2, 3), M.trimLight, 0, 8.7, 2, 0, Math.PI / 2, 0, 1, 1, 0.3);
      for (let i = 0; i < 6; i++) Kit.add(g, Kit.cyl(0.38, 0.45, 6.8, 8), Kit.mat(0x8a847a), -6 + i * 2.4, 3.4, 3.4);
      for (let i = 0; i < 3; i++) Kit.add(g, Kit.box(14 - i * 0.6, 0.2, 1.2), M.concrete, 0, 0.1 + i * 0.2, 4.8 - i * 0.4);
      // Windows.
      for (let f = 0; f < 2; f++) {
        for (let i = 0; i < 10; i++) {
          const lx = -16 + i * 3.55;
          if (Math.abs(lx) < 7.5) continue;
          Kit.add(g, Kit.box(1.4, 2.4, 0.1), (i + f) % 3 === 0 ? M.winDim : M.winDark, lx, 2.5 + f * 4.5, 0.05);
        }
      }
      Kit.add(g, Kit.box(3, 4.2, 0.1), Kit.glow(0xffd8a0, 0.35), 0, 2.4, 0.05);
      // Clock tower.
      const tw = new THREE.Group();
      Kit.add(tw, Kit.box(6, 14, 6), stone, 0, 7, 0);
      Kit.add(tw, Kit.box(6.6, 0.6, 6.6), M.trimLight, 0, 14, 0);
      Kit.add(tw, Kit.box(5.2, 4, 5.2), Kit.mat(0x6a645a), 0, 16.3, 0);
      Kit.add(tw, Kit.cone(4.4, 5, 4), M.roof, 0, 20.8, 0, 0, Math.PI / 4, 0);
      const face = Kit.glow(0xfff0c8, 0.9);
      const hands = Kit.mat(0x1a1612);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        const cf = new THREE.Group();
        Kit.add(cf, Kit.cyl(1.7, 1.7, 0.1, 16), face, 0, 0, 0, Math.PI / 2);
        Kit.add(cf, Kit.box(0.12, 1.2, 0.05), hands, 0, 0.5, 0.08);
        Kit.add(cf, Kit.box(0.1, 0.9, 0.05), hands, 0.35, -0.2, 0.08, 0, 0, 2.2);
        cf.position.set(Math.sin(a) * 3.06, 11, Math.cos(a) * 3.06);
        cf.rotation.y = a;
        tw.add(cf);
      }
      tw.position.set(0, h, -9);
      g.add(tw);
      put(g, fx, -284, ROT.W, 0, 'E');
    }
    // Bandstand (second spitter perch).
    {
      const g = new THREE.Group();
      Kit.add(g, Kit.cyl(3.8, 3.9, 0.8, 8), M.concrete, 0, 0.4, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        Kit.add(g, Kit.cyl(0.1, 0.1, 2.8, 6), M.white, Math.cos(a) * 3.3, 2.2, Math.sin(a) * 3.3);
        Kit.add(g, Kit.box(2.4, 0.06, 0.06), M.white, Math.cos(a + Math.PI / 8) * 3.2, 1.6, Math.sin(a + Math.PI / 8) * 3.2, 0, -(a + Math.PI / 8) + Math.PI / 2, 0);
      }
      Kit.add(g, Kit.cyl(3.9, 3.9, 0.3, 8), Kit.mat(0x5a3a2e), 0, 3.6, 0);
      Kit.add(g, Kit.cyl(3.7, 3.95, 0.12, 8), M.white, 0, 3.4, 0);
      Kit.add(g, Kit.cone(0.9, 1.0, 8), Kit.mat(0x5a3a2e), 0, 4.25, 0);
      // String lights around the eave.
      const bulbs = Kit.glow(0xffe2a0, 1.5);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        Kit.add(g, Kit.sphere(0.07, 5, 4), bulbs, Math.cos(a) * 3.85, 3.3, Math.sin(a) * 3.85);
      }
      put(g, -48, -274, 0, 0, 'E');
      pools.add(-48, -274, 5, 0xffd08a, 0.4);
    }
    // Fountain + war memorial.
    {
      const g = new THREE.Group();
      Kit.add(g, Kit.cyl(3.2, 3.3, 0.7, 12), M.concrete, 0, 0.35, 0);
      Kit.add(g, Kit.cyl(2.9, 2.9, 0.1, 12), Kit.std(0x101c28, 0.1, 0.4), 0, 0.62, 0);
      Kit.add(g, Kit.cyl(0.5, 0.7, 1.6, 8), M.concrete, 0, 1.4, 0);
      Kit.add(g, Kit.cyl(1.4, 1.2, 0.3, 10), M.concrete, 0, 2.2, 0);
      Kit.add(g, Kit.cyl(0.2, 0.3, 1.0, 6), M.concrete, 0, 2.8, 0);
      put(g, -36, -293, 0, 0, 'E');
      const st = new THREE.Group();
      Kit.add(st, Kit.box(2, 2.2, 2), Kit.mat(0x6a665e), 0, 1.1, 0);
      Kit.add(st, Kit.box(1.4, 0.4, 1.4), Kit.mat(0x3a5a4a), 0, 2.4, 0);
      Kit.add(st, Kit.capsule(0.32, 0.9, 2, 6), Kit.mat(0x3a5a4a), 0, 3.3, 0);
      Kit.add(st, Kit.box(0.3, 0.3, 0.3), Kit.mat(0x3a5a4a), 0, 4.1, 0);
      Kit.add(st, Kit.box(0.12, 1.2, 0.12), Kit.mat(0x3a5a4a), 0.4, 3.8, 0, 0, 0, -0.5);
      put(st, -70, -296, 0.4, 0, 'E');
    }
    // Ornate lamp posts with globes + string lights across the square.
    const globe = Kit.glow(0xffe8c0, 1.4);
    const lampPos: [number, number][] = [[-64, -266], [-64, -300], [-28, -266], [-28, -300], [-46, -300], [-46, -266]];
    for (const [x, z] of lampPos) {
      const g = new THREE.Group();
      Kit.add(g, Kit.cyl(0.08, 0.14, 4.2, 6), M.metal, 0, 2.1, 0);
      Kit.add(g, Kit.box(1.2, 0.08, 0.08), M.metal, 0, 4.2, 0);
      for (const sx of [-0.6, 0.6]) Kit.add(g, Kit.sphere(0.24, 8, 6), globe, sx, 4.45, 0);
      Kit.add(g, Kit.sphere(0.28, 8, 6), globe, 0, 4.75, 0);
      put(g, x, z, 0, 0, 'E');
      pools.add(x, z, 4.5, 0xffd8a0, 0.45);
    }
    const bulb = Kit.sphere(0.06, 5, 4);
    const sl = Kit.glow(0xffd890, 1.6);
    const sl2 = Kit.glow(0xff8a6a, 1.4);
    for (const [[ax, az], [bx, bz]] of [[lampPos[0], lampPos[3]], [lampPos[1], lampPos[2]], [lampPos[4], lampPos[5]]] as const) {
      const n = 26;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const y = 4.6 - Math.sin(t * Math.PI) * 1.4;
        put(Kit.mesh(bulb, i % 3 ? sl : sl2), ax + (bx - ax) * t, az + (bz - az) * t, 0, y, 'E');
      }
    }
    // Trees, benches, abandoned stuff.
    for (const [x, z] of [[-62, -264], [-40, -264], [-30, -280], [-64, -287], [-30, -296]] as const) put(streetTree(rng), x, z, 0, 0, 'E');
    put(bench(), -40, -283, -Math.PI / 2, 0, 'E');
    put(bench(), -63.5, -280, Math.PI / 2, 0, 'E');
    put(car({ color: CAR_COLORS[5], open: ['fl'], headlights: true }), -40, -302, 1.3, 0, 'E');
    put(car({ color: CAR_COLORS[0], wrecked: true }), -63, -296, -0.5, 0, 'E');
    for (let i = 0; i < 6; i++) put(trafficCone(), -52 + rng.spread(8), -270 + rng.spread(6), rng.next(), 0, 'E');
    occ(SQ_X0 - 24, SQ_X0 - 16, -284, SQ_Z1); // west 3-storey back
    occ(-90, -66, SQ_Z1 - 16, SQ_Z1);
    occ(-50, -10, SQ_Z1 - 16, SQ_Z1);
    occ(SQ_X1, SQ_X1 + 18, -266, -302, 11);
  }

  const gp = gas.spawnPoints!;
  return {
    zones,
    pools,
    beams,
    anim,
    gas,
    bus,
    doors,
    dinerPanes,
    pumps: gp.pumps,
    barrels: gp.barrels,
    propane: gp.propane,
    extraBarrels: [new THREE.Vector3(-36.5, 0, ALLEY_N + 0.9), new THREE.Vector3(6.4, 0, -133.5), new THREE.Vector3(-62.8, 0, -282)],
    occluders,
    dynamic,
    dynZones,
  };
}

// ─── The diner ──────────────────────────────────────────────────────────────

/**
 * Classic chrome diner on the west side of Main Street (z -40 … -58), open
 * front with an interior you can see through the glass. Returns the slots for
 * the two shootable / smashable window panes.
 */
function buildDiner(zone: THREE.Group, pools: LightPools, addDyn: (o: THREE.Object3D) => THREE.Object3D, anim: TownAnim) {
  const g = new THREE.Group();
  const W = 18;
  const D = 11;
  const H = 4.4;
  const steel = Kit.mat(0x9aa4ae);
  const redStripe = Kit.mat(0x9a1f2a);
  // Shell: back wall, side walls, roof, floor (open front).
  Kit.add(g, Kit.box(W, H, 0.3), Kit.mat(0x8a8f96), 0, H / 2, -D);
  Kit.add(g, Kit.box(0.3, H, D), Kit.mat(0x8a8f96), -W / 2, H / 2, -D / 2);
  Kit.add(g, Kit.box(0.3, H, D), Kit.mat(0x8a8f96), W / 2, H / 2, -D / 2);
  Kit.add(g, Kit.box(W + 0.4, 0.4, D + 0.6), Kit.mat(0x5a5e66), 0, H + 0.2, -D / 2 + 0.2);
  // Front: kick panel and header with steel/red bands.
  Kit.add(g, Kit.box(W, 1.0, 0.3), steel, 0, 0.5, 0);
  Kit.add(g, Kit.box(W + 0.05, 0.18, 0.34), redStripe, 0, 0.75, 0);
  Kit.add(g, Kit.box(W, 1.15, 0.3), steel, 0, H - 0.58, 0);
  Kit.add(g, Kit.box(W + 0.05, 0.2, 0.34), redStripe, 0, H - 0.5, 0);
  // Interior (unlit glow surfaces = warm fluorescent light).
  const wall = Kit.glow(0xe8c890, 0.4);
  Kit.add(g, Kit.box(W - 0.6, H - 0.4, 0.05), wall, 0, H / 2, -D + 0.2);
  Kit.add(g, Kit.box(0.05, H - 0.4, D - 0.4), wall, -W / 2 + 0.2, H / 2, -D / 2);
  Kit.add(g, Kit.box(0.05, H - 0.4, D - 0.4), wall, W / 2 - 0.2, H / 2, -D / 2);
  Kit.add(g, Kit.box(W - 0.4, 0.05, D - 0.4), Kit.glow(0x6a5a48, 0.45), 0, H - 0.05, -D / 2);
  const tA = Kit.glow(0xd8d0c0, 0.32);
  const tB = Kit.mat(0x202022);
  for (let ix = 0; ix < 12; ix++) {
    for (let iz = 0; iz < 7; iz++) {
      Kit.add(g, Kit.box(1.5, 0.04, 1.5), (ix + iz) % 2 ? tA : tB, -W / 2 + 0.75 + ix * 1.5, 0.03, -0.75 - iz * 1.5);
    }
  }
  // Counter, stools, booths, pendant lamps.
  Kit.add(g, Kit.box(12, 1.1, 0.8), Kit.glow(0x8a2a2a, 0.45), -1, 0.55, -7);
  Kit.add(g, Kit.box(12.2, 0.08, 1.0), steel, -1, 1.12, -7);
  for (let i = 0; i < 8; i++) {
    Kit.add(g, Kit.cyl(0.25, 0.25, 0.1, 8), Kit.glow(0xc83030, 0.6), -6.2 + i * 1.5, 0.75, -5.9);
    Kit.add(g, Kit.cyl(0.04, 0.04, 0.7, 5), steel, -6.2 + i * 1.5, 0.35, -5.9);
  }
  for (const bx of [-6.5, -2.5, 1.5, 5.5]) {
    Kit.add(g, Kit.box(2.6, 0.5, 0.7), Kit.glow(0xb02a2a, 0.5), bx, 0.45, -1.2);
    Kit.add(g, Kit.box(2.6, 1.0, 0.2), Kit.glow(0xb02a2a, 0.5), bx, 0.95, -1.6);
    Kit.add(g, Kit.box(1.2, 0.06, 0.7), Kit.glow(0xe8e0d0, 0.4), bx, 0.75, -0.6);
  }
  for (let i = 0; i < 6; i++) Kit.add(g, Kit.sphere(0.22, 8, 6), Kit.glow(0xffe0a0, 1.5), -7 + i * 2.8, H - 0.9, -3.5);
  // Pie case / coffee machine silhouettes on the back counter.
  Kit.add(g, Kit.box(10, 1.4, 0.5), Kit.mat(0x3a3a3e), -1, 1.6, -10.4);
  // Window mullions and static glass (two panes are destructible, placed by the stage).
  const glass = Kit.mat(0x9fc8e8, { transparent: true, opacity: 0.22, smooth: true });
  const paneXs = [-6.6, -3.3, 0, 3.3];
  for (let i = 0; i <= 4; i++) Kit.add(g, Kit.box(0.14, 2.3, 0.2), steel, -8.25 + i * 3.3, 2.15, 0);
  for (let i = 0; i < paneXs.length; i++) {
    if (i === 1 || i === 3) continue;
    Kit.add(g, Kit.box(3.15, 2.3, 0.05), glass, paneXs[i], 2.15, 0);
  }
  // Door (glass) at the north end.
  Kit.add(g, Kit.box(1.4, 2.5, 0.08), Kit.glow(0xffe8c0, 0.3), 6.6, 1.25, 0.02);
  Kit.add(g, Kit.box(1.6, 0.1, 0.16), steel, 6.6, 2.55, 0.02);
  // "OPEN 24 HRS" sign in the window.
  const open = boardSign('OPEN', C.neonRed, 0.3, { pad: 0.3 });
  open.position.set(-6.6, 2.6, -0.2);
  g.add(open);
  // Rooftop DINER sign + EAT blade.
  const sign = new THREE.Group();
  Kit.add(sign, Kit.box(9.2, 2.1, 0.2), M.signBack, 0, 0, 0);
  const pink = Kit.glow(C.neonPink, 1.6);
  const cyan = Kit.glow(C.neonCyan, 1.6);
  addText(sign, 'DINER', pink, { size: 1.25, depth: 0.08 }).position.z = 0.12;
  for (const y of [-0.98, 0.98]) Kit.add(sign, Kit.box(9.0, 0.07, 0.07), cyan, 0, y, 0.12);
  for (const x of [-4.55, 4.55]) Kit.add(sign, Kit.box(0.07, 2.0, 0.07), cyan, x, 0, 0.12);
  Kit.add(sign, Kit.box(0.2, 1.2, 0.2), M.metal, -3, -1.6, -0.3);
  Kit.add(sign, Kit.box(0.2, 1.2, 0.2), M.metal, 3, -1.6, -0.3);
  sign.position.set(0, H + 1.9, -0.4);
  g.add(sign);
  const eat = bladeSign('EAT', C.neonCyan, 0.7);
  eat.position.set(-W / 2 + 0.6, 3.2, 0.1);
  g.add(eat);

  // Place: facade at x = -9.5 facing +X, centred at z = -49.
  const zc = -49;
  g.position.set(-MAIN_FACADE, 0, zc);
  g.rotation.y = ROT.E;
  zone.add(g);
  // The buzzing "R": a second copy of the letter that flickers on top.
  {
    const rr = new THREE.Group();
    addText(rr, 'R', Kit.glow(0x5a1a30, 1), { size: 1.25, depth: 0.1 });
    // Position of the 5th letter in a 5-letter word.
    const u = 1.25 / 6;
    rr.position.set((4 * 5.6 - (5 * 5.6 - 1.6) / 2) * u + 2 * u, 0, 0.14);
    sign.add(rr);
    g.updateMatrixWorld(true);
    const m = rr.matrixWorld.clone();
    sign.remove(rr);
    m.decompose(rr.position, rr.quaternion, rr.scale);
    mergedGroup(rr);
    addDyn(rr);
    anim.buzz.push({ obj: rr, seed: 7.7 });
  }
  pools.add(-MAIN_FACADE + 3, zc, 7, C.neonPink, 0.45);
  pools.add(-MAIN_FACADE + 2, zc - 3, 5, 0xffd8a0, 0.4);
  pools.addWall(-MAIN_FACADE + 0.35, H + 1.9, zc, 6, C.neonPink, Math.PI / 2, 0.25);

  // Destructible pane slots (world). Local x → world z = zc - x.
  return [1, 3].map((i) => ({
    pos: new THREE.Vector3(-MAIN_FACADE + 0.02, 1.0, zc - paneXs[i]),
    yaw: ROT.E,
    w: 3.15,
    h: 2.3,
  }));
}
