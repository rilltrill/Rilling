import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { C, G, M, T, TX } from './mats';
import {
  ambulance,
  bed,
  bedside,
  blk,
  bloodPool,
  bodyBag,
  box,
  car,
  chairRow,
  corpse,
  counter,
  crashCart,
  cyl,
  dragTrail,
  fireExt,
  grp,
  gurney,
  ivStand,
  laundryCart,
  monitor,
  papers,
  plant,
  pwTag,
  smear,
  trashBin,
  vending,
  wallClock,
  wallSmear,
  wheelchair,
  whiteboard,
} from './props';
import { type Opening, buildShell, wall } from './shell';
import { R } from './layout';
import { pixelText } from './font';
import { bake, bakeInto } from './bake';
import {
  type ZoneCtx,
  ceilMat,
  danglingPanel,
  flickerPanel,
  floorMat,
  occluder,
  panel,
  plateSign,
  sideRoom,
  sign,
  styles,
  vent,
} from './zonekit';
import { exitSign, emergencyLamp } from './props';

// ═══════════════════════════════════════════════════════════════════════════
// Ambulance bay (exterior, night, rain)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The bay is built as two zones: `near` (facade, entrance, canopy — also seen
 * from just inside the ER) and `field` (ground, car park, wings, debris) which
 * env.ts culls once the camera is through the doors, so its baked batches don't
 * cost triangles behind the camera in the ER.
 */
export function buildBay(ctx: ZoneCtx): { near: THREE.Group; field: THREE.Group } {
  const { rng } = ctx;
  const g = new THREE.Group();
  g.name = 'bay';
  const f = new THREE.Group();
  f.name = 'bayField';
  // Ground: asphalt apron, kerb + sidewalk along the facade.
  // (Stops at the facade line: the ER / corridor floors are at the same height.)
  box(f, 80, 0.2, 61, T(0x3a3e46, TX.asphalt), 0, -0.1, 4.5);
  box(g, 40, 0.14, 3.6, T(0x66665e, TX.concrete), 0, 0.07, -24.2);
  box(g, 40, 0.16, 0.2, T(0x8a8a80, TX.concrete), 0, 0.08, -22.4);
  // Lane paint: ambulance-only box, hatching in front of the doors.
  const yellow = M(0xb8962a);
  for (const sx of [-4.6, 4.6]) box(f, 0.14, 0.012, 28, yellow, sx, 0.008, -8);
  for (let i = 0; i < 7; i++) box(f, 0.25, 0.012, 3.2, yellow, -3 + i, 0.009, -20, 0.6);
  pixelText(f, 'AMBULANCE', 0, 0.012, -9.5, 0, { px: 0.1, mat: M(0x6a6a64), depth: 0.01 }).rotation.set(-Math.PI / 2, 0, 0);
  // Puddles.
  for (let i = 0; i < 9; i++) {
    const r = rng.range(0.6, 1.6);
    const p = pwTag(cyl(f, r, r, 0.01, T(0x243444, TX.water), rng.spread(9), 0.006, rng.range(-20, 18), 10), 'puddle', { r });
    p.scale.z = rng.range(0.5, 1);
  }

  // ─── Facade ──────────────────────────────────────────────────────────────
  wall(g, 'x', -34, 34, -26, 0, 16, [{ at: 0, w: 5.2, h: 3.4, frame: true }, { at: -7, w: 5, h: 2.4, y0: 0.9 }, { at: 7, w: 5, h: 2.4, y0: 0.9 }], styles.facade(), 0.3, 1);
  // Ground-floor windows (dark glass with a faint interior glow).
  for (const sx of [-7, 7]) {
    box(g, 5, 2.4, 0.05, Kit.mat(0x6a8a90, { transparent: true, opacity: 0.35 }), sx, 2.1, -26);
    for (let k = -2; k <= 2; k++) box(g, 0.06, 2.4, 0.1, M(0x2a2e30), sx + k * 1.25, 2.1, -25.9);
  }
  // Upper floors: window grid; a few lit.
  const winDark = M(0x0f1720);
  const lit = [G(0x9fc8b0, 0.55), G(0xd8c890, 0.5), G(0x8ab0d8, 0.45)];
  for (let fl = 0; fl < 3; fl++) {
    const y = 6.2 + fl * 3.3;
    for (let x = -32; x <= 32; x += 3.2) {
      if (Math.abs(x) < 9.6 && fl === 2) continue;
      const on = rng.chance(0.18);
      pwTag(box(g, 1.7, 1.7, 0.1, on ? rng.pick(lit) : winDark, x, y, -25.82), 'win', { on, fl });
      pwTag(box(g, 1.9, 0.12, 0.25, T(0x7a766c, TX.concrete), x, y - 0.92, -25.75), 'sill');
    }
  }
  // Hospital name sign on the roofline.
  sign(g, 'ST MERCY HOSPITAL', 0, 13.3, -25.7, 0, 0.15, 0xdff4ff, 0x1a2024, 1.25, [3, 12]);
  box(g, 18.5, 0.25, 0.5, T(0x3a3e42, TX.paint), 0, 12.2, -25.6);
  // Big red cross.
  pwTag(box(g, 0.9, 2.6, 0.2, G(0xff2a2a, 1.4), 12.5, 13.3, -25.7), 'cross');
  pwTag(box(g, 2.6, 0.9, 0.2, G(0xff2a2a, 1.4), 12.5, 13.3, -25.7), 'crossBar');

  // ─── Entrance: broken sliding doors ──────────────────────────────────────
  const glass = Kit.mat(0x8ab8c0, { transparent: true, opacity: 0.28 });
  const alu = T(0x8a9094, TX.steel);
  box(g, 5.4, 0.25, 0.4, alu, 0, 3.5, -26);
  for (const sx of [-1, 1]) {
    // Panels slid open (left one shattered).
    if (sx < 0) {
      box(g, 0.08, 3.3, 0.12, alu, -2.55, 1.65, -25.95);
      box(g, 1.3, 0.08, 0.12, alu, -1.95, 0.05, -25.95);
    } else {
      box(g, 1.3, 3.3, 0.04, glass, 2.0, 1.65, -25.9);
      box(g, 1.34, 0.08, 0.1, alu, 2.0, 3.28, -25.9);
      box(g, 0.06, 3.3, 0.1, alu, 1.35, 1.65, -25.9);
    }
  }
  // Glass shards on the floor.
  for (let i = 0; i < 26; i++) {
    const m = box(g, rng.range(0.08, 0.3), 0.01, rng.range(0.08, 0.3), glass, rng.range(-3, 0.5), 0.02, rng.range(-25.5, -22), rng.next() * 3);
    m.rotation.x = rng.spread(0.1);
  }
  sign(g, 'EMERGENCY', 0, 3.95, -25.7, 0, 0.05, 0xff3a2a, 0x1a0c0c, 1.6);

  // ─── Canopy (porte-cochère) ──────────────────────────────────────────────
  const conc = T(0x7a7870, TX.concrete);
  box(g, 20, 0.5, 16, conc, 0, 4.85, -18);
  box(g, 20.2, 0.9, 0.4, T(0x3a3e44, TX.ribbed), 0, 4.75, -10);
  for (const sx of [-8.6, 8.6]) {
    for (const sz of [-12.5, -21]) {
      cyl(g, 0.38, 0.38, 4.6, conc, sx, 2.3, sz, 10);
      cyl(g, 0.42, 0.42, 0.9, T(0xd0a82a, TX.hazard), sx, 0.45, sz, 10);
    }
  }
  // Fascia sign (one dead letter).
  sign(g, 'EMERGENCY', 0, 4.78, -9.78, 0, 0.085, 0xff2a1a, null, 1.7, [5]);
  // Warm canopy downlights.
  for (const sx of [-5, 0, 5]) for (const sz of [-14, -20]) panel(g, sx, 4.6, sz, Math.PI / 2, true, true);
  // Bollards along the kerb.
  for (let x = -16; x <= 16; x += 2.6) {
    if (Math.abs(x) < 3.5) continue;
    cyl(g, 0.12, 0.12, 0.9, T(0xc9a227, TX.paint), x, 0.45, -22.1, 8);
  }

  // ─── Left wing + right-side car park ─────────────────────────────────────
  box(f, 16, 12, 38, T(0x7a5446, TX.brick), -26, 6, -7);
  for (let fl = 0; fl < 3; fl++) {
    for (let z = -24; z <= 10; z += 3.2) {
      const on = rng.chance(0.12);
      pwTag(box(f, 0.1, 1.6, 1.7, on ? rng.pick(lit) : winDark, -17.95, 2.4 + fl * 3.4, z), 'wingWin', { on, fl });
    }
  }
  sign(f, 'OUTPATIENTS', -17.85, 10.6, -8, Math.PI / 2, 0.11, 0x9fd8ff, 0x101418, 1.1, [2, 7]);
  // Low wall + fence on the right.
  box(f, 0.4, 0.9, 50, T(0x5e5e58, TX.concrete), 18, 0.45, 0);
  for (let z = -24; z <= 24; z += 2.5) cyl(f, 0.04, 0.04, 2.4, M(0x4a4e50), 18, 1.6, z, 5);
  pwTag(box(f, 0.03, 1.5, 50, Kit.mat(0x8a9498, { transparent: true, opacity: 0.4, tex: 'grate', texScale: 1.5, texStrength: 1 }), 18, 1.75, 0), 'fence');
  car(f, 23, 0, -12, 0.1, 0x6a2a2a);
  car(f, 23.5, 0, -4, -0.05, 0x2a3a5a);
  car(f, 24, 0, 8, 3.1, 0x8a8a84);
  // Street lamps (warm heads; one dead).
  for (const [lx, lz, on] of [[16.5, -14, true], [16.5, 6, false], [-15.5, 14, true]] as [number, number, boolean][]) {
    cyl(f, 0.08, 0.1, 6, T(0x3a3e40, TX.paint), lx, 3, lz, 6);
    box(f, 1.2, 0.08, 0.1, T(0x3a3e40, TX.paint), lx - Math.sign(lx) * 0.6, 6, lz);
    box(f, 0.6, 0.12, 0.3, on ? G(0xffd9a0, 1.5) : M(0x2a2a2a), lx - Math.sign(lx) * 1.1, 5.92, lz);
  }
  // Dead trees on the right.
  for (const [tx, tz] of [[21, 16], [27, -20], [29, 2]] as [number, number][]) {
    // (One group per tree: a pixel billboard stands in for it in ART: SPRITES, see env.ts.)
    const t = grp(f, tx, 0, tz);
    t.userData.flora = 'deadTree';
    cyl(t, 0.18, 0.28, 4, T(0x3a3028, TX.bark), 0, 2, 0, 6);
    for (let i = 0; i < 4; i++) {
      const a = rng.next() * 6.28;
      const b = box(t, 0.08, 1.8, 0.08, T(0x3a3028, TX.bark), Math.cos(a) * 0.5, 4.2, Math.sin(a) * 0.5);
      b.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    }
  }
  // Distant skyline blocks to the right (beyond the fog edge they read as silhouettes).
  for (let i = 0; i < 6; i++) {
    const h = rng.range(10, 26);
    pwTag(box(f, rng.range(8, 14), h, rng.range(8, 14), T(0x1e222a, TX.concrete), 44 + rng.range(0, 10), h / 2, -40 + i * 14), 'skyline');
  }

  // ─── Parked ambulance (lights going) ─────────────────────────────────────
  const ambB = ambulance();
  ambB.root.position.set(5.6, 0, -19.4);
  ambB.root.rotation.y = -0.08;
  f.add(ambB.root);
  ctx.sc.lightbars.push({ red: ambB.red, blue: ambB.blue });
  occluder(ctx, 5.6, 1.6, -19.7, 2.3, 3.2, 6.0, -0.08);

  // ─── Debris & gore ───────────────────────────────────────────────────────
  gurney(f, -3.6, 0, -2.5, 0.9, { tipped: true, sheet: C.sheetBlue, blood: true });
  wheelchair(f, 3.4, 0, 3, 2.4);
  ivStand(f, -1.6, 0, 6.5, 0xd8e8d0);
  bodyBag(f, -6.2, 0, -14, 0.4);
  bodyBag(f, -7.5, 0, -6, 1.6);
  corpse(f, 2.8, 0, -7.5, 2.6, rng, 0x2e4a7a);
  trashBin(f, -11, 0, -21, true);
  trashBin(f, 11, 0, -21);
  dragTrail(f, -1, -9, 0.4, -24.5, 0, rng);
  dragTrail(f, 3, -6.5, 1.2, -16, 0, rng);
  bloodPool(f, -1.2, 0, -8.6, 0.9, rng);
  papers(f, 0, -12, 6, 10, 40, 0, rng);
  // Traffic cones.
  for (const [cx, cz] of [[-5, 4], [-4.2, 6.4], [5.2, -1]] as [number, number][]) {
    pwTag(cyl(f, 0.02, 0.22, 0.7, M(0xe0601a), cx, 0.35, cz, 8), 'cone', { foot: 0.35 });
    pwTag(box(f, 0.45, 0.04, 0.45, M(0x1a1a1a), cx, 0.02, cz), 'coneBase');
  }
  return { near: g, field: f };
}

/** The crashing ambulance (dynamic): built in its own group. */
export function buildCrashAmbulance(ctx: ZoneCtx) {
  const amb = ambulance();
  amb.doorL.userData.noMerge = true;
  amb.doorR.userData.noMerge = true;
  // (PIXEL WORLD paints the body and both doors first, in their own frames.)
  ctx.pw?.paintAmbulance(amb);
  // Bake the body (lights + doors stay separate).
  bake(amb.body);
  bake(amb.doorL);
  bake(amb.doorR);
  ctx.dyn.add(amb.root);
  const flames: { obj: THREE.Object3D; seed: number; scale: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    f.position.set(-0.6 + i * 0.6, 1.5, 2.6);
    bakeInto(f, (h) => {
      box(h, 0.35, 0.8, 0.35, G(0xff6a1a, 1.6), 0, 0.4, 0, 0.6);
      box(h, 0.22, 0.6, 0.22, G(0xffd04a, 1.8), 0, 0.35, 0, 0.2);
    });
    f.visible = false;
    amb.body.add(f);
    flames.push({ obj: f, seed: ctx.rng.range(0, 10), scale: 0.8 + ctx.rng.next() * 0.5 });
  }
  ctx.sc.lightbars.push({ red: amb.red, blue: amb.blue });
  // Swerves in from the access road and ploughs into the front-left canopy pillar.
  const from = new THREE.Vector3(30, 0, -3);
  const to = new THREE.Vector3(-5.28, 0, -11.2);
  const dir = new THREE.Vector3().subVectors(to, from);
  const yaw = Math.atan2(dir.x, dir.z);
  amb.root.position.copy(from);
  amb.root.rotation.y = yaw;
  amb.root.visible = false;
  ctx.sc.ambulance = {
    amb,
    t: 0,
    state: 'idle',
    from,
    to,
    yawFrom: yaw,
    yawTo: yaw - 0.32,
    doorsT: -1,
    flames,
    smokeT: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ER / triage
// ═══════════════════════════════════════════════════════════════════════════

export function buildER(ctx: ZoneCtx): THREE.Group {
  const { rng } = ctx;
  const g = new THREE.Group();
  g.name = 'er';
  const r = R.er;
  buildShell(g, {
    ...r,
    style: styles.clinic(),
    floor: floorMat(),
    ceiling: ceilMat(),
    sides: {
      zMax: null,
      xMax: [{ at: -44, w: 4.6, h: 3.0 }],
      xMin: [{ at: -31.5, w: 1.6, h: 2.3 }, { at: -44.5, w: 1.6, h: 2.3 }],
    },
  });
  // Side rooms behind the west doors.
  sideRoom(g, -14.4, -11.15, -33.5, -29.5, 0, 3, 0x1a2422);
  sideRoom(g, -14.4, -11.15, -46.5, -42.5, 0, 3, 0x241a1a);
  sign(g, 'X-RAY', -10.8, 2.65, -31.5, Math.PI / 2, 0.035, 0xbfe8ff, 0x101418, 1.1);
  sign(g, 'TRIAGE', -10.8, 2.65, -44.5, Math.PI / 2, 0.035, 0xbfe8ff, 0x101418, 1.1);
  // Ceiling panels (grid; a few broken / flickering).
  for (let x = -8; x <= 8; x += 4) {
    for (let z = -29; z >= -47; z -= 3.6) {
      const k = `${x},${z}`;
      if (k === '-4,-36.2' || k === '4,-43.4') continue;
      if (k === '0,-36.2') flickerPanel(ctx, g, x, r.h, z, 0, 'blink');
      else if (k === '-8,-43.4') flickerPanel(ctx, g, x, r.h, z, 0, 'dying');
      else if (k === '8,-32.6') flickerPanel(ctx, g, x, r.h, z, 0, 'buzz');
      else panel(g, x, r.h, z, 0, !(k === '4,-29' || k === '-8,-29'));
    }
  }
  danglingPanel(ctx, g, -4, r.h, -36.2, Math.PI / 2 + 0.3);
  vent(ctx, g, 2.4, r.h, -39.5, 0);
  vent(ctx, g, -2.2, r.h, -45.5, 0);

  // Reception desk (left) — runners vault it.
  counter(g, -6, 0, -35.4, 0, 5.2, rng, 3);
  occluder(ctx, -6, 0.55, -35.0, 5.2, 1.1, 0.25);
  box(g, 0.14, 1.1, 1.4, T(0x5c7a74, TX.wood), -8.55, 0.55, -35.9);
  sign(g, 'ER', -6, 3.1, -49.8, 0, 0.12, 0xff3020, 0x1a0c0c, 1.5);
  plateSign(g, 'RECEPTION', -6, 2.3, -49.82, 0, 0.04, 0x1a2a2a, 0xc8d4cc);
  wallSmear(g, -6.5, 1.0, -34.85, 0, rng, true);
  smear(g, -6, 1.16, -35.2, 1.4, 0.4, 1.4, C.bloodFresh);
  // Behind the desk: filing cabinets, chairs.
  for (let i = 0; i < 4; i++) pwTag(blk(g, 0.5, 1.3, 0.6, T(0x7a807c, TX.paint), -9.6 + i * 0.55, 0, -38.3), 'filing', { foot: 0.65 });
  papers(g, -6, -37, 2.5, 1.2, 18, 0, rng);
  // Waiting area (right): chair rows facing the desk.
  chairRow(g, 4.4, 0, -33.5, -Math.PI / 2, 5, 0x2f5a8a, [2]);
  chairRow(g, 7.2, 0, -33.5, -Math.PI / 2, 5, 0x2f5a8a);
  chairRow(g, 4.4, 0, -38.5, -Math.PI / 2, 3, 0x2f5a8a, [0]);
  const tipped = grp(g, 6.8, 0.3, -39.6, 0.6);
  tipped.rotation.z = 1.5;
  chairRow(tipped, 0, 0, 0, 0, 2, 0x2f5a8a);
  vending(g, 10.4, 0, -28.4, -Math.PI / 2, 0xb02a2a, true, rng);
  vending(g, 10.4, 0, -29.6, -Math.PI / 2, 0x2a4a9a, true, rng);
  plant(g, 9.9, 0, -38.8, rng);
  // TV with an emergency broadcast.
  const tv = pwTag(grp(g, 10.8, 2.6, -35.5, -Math.PI / 2), 'tv');
  box(tv, 1.5, 0.9, 0.1, M(0x151515), 0, 0, 0);
  box(tv, 1.36, 0.78, 0.01, G(0x1a3a8a, 1.1), 0, 0, 0.055);
  box(tv, 1.36, 0.16, 0.01, G(0xff2020, 1.4), 0, -0.22, 0.06);
  pixelText(tv, 'STAY INDOORS', 0, 0.1, 0.062, 0, { px: 0.016, mat: G(0xffffff, 1.4), depth: 0.005 });
  wallClock(g, 10.82, 3.3, -40, -Math.PI / 2);
  // Triage bays at the back (curtains on rails).
  for (let i = 0; i < 3; i++) {
    const bx = -8 + i * 2.8;
    box(g, 0.04, 0.04, 3, T(0xb0b4b0, TX.steel), bx - 1.35, 3.6, -48.4);
    gurney(g, bx, 0, -48.6, Math.PI, { body: i === 1, blood: i !== 0, sheet: C.sheet });
    curtainPanel(g, bx - 1.35, -48.4, 2.6, 'z', i === 2 ? C.curtainAlt : C.curtain);
  }
  // Crash cart, gurney, wheelchair, IVs, corpse, trails.
  crashCart(g, 7.8, 0, -45.6, -1.2);
  gurney(g, 3.4, 0, -46.8, 1.4, { blood: true });
  wheelchair(g, -2.6, 0, -33, 0.7, true);
  ivStand(g, 2.6, 0, -41.6);
  ivStand(g, -9.4, 0, -46, 0xe0d0d0, 0xa82020);
  corpse(g, 6.2, 0, -42.2, 1.1, rng, 0xd8dcd8);
  dragTrail(g, 0.6, -27, 2.8, -40, 0, rng);
  dragTrail(g, 5, -43, 10.6, -44.4, 0, rng);
  bloodPool(g, 3.4, 0, -40.2, 0.8, rng);
  papers(g, 2, -36, 6, 8, 34, 0, rng);
  wallSmear(g, 10.84, 1.4, -42.2, -Math.PI / 2, rng);
  // Signs: way to the ward.
  plateSign(g, 'WARD 3 >', 10.82, 3.35, -44, -Math.PI / 2, 0.05, 0xffffff, 0x2a5a9a);
  exitSign(g, 0, 3.7, -26.3, Math.PI);
  emergencyLamp(g, 10.6, 3.45, -41.2, -Math.PI / 2);
  return g;
}

/** Static hanging curtain panel along an axis (folded fabric). */
export function curtainPanel(g: THREE.Object3D, x: number, z: number, len: number, axis: 'x' | 'z', color: number, y0 = 0.45, y1 = 3.55) {
  const mat = T(color, TX.curtain);
  const n = Math.max(2, Math.round(len / 0.32));
  const h = y1 - y0;
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n - 0.5;
    const off = (i % 2 ? 0.05 : -0.05);
    if (axis === 'x') box(g, len / n + 0.03, h, 0.04, mat, x + k * len, y0 + h / 2, z + off);
    else box(g, 0.04, h, len / n + 0.03, mat, x + off, y0 + h / 2, z + k * len);
  }
  if (axis === 'x') box(g, len, 0.04, 0.04, T(0xb0b4b0, TX.steel), x, y1 + 0.03, z);
  else box(g, 0.04, 0.04, len, T(0xb0b4b0, TX.steel), x, y1 + 0.03, z);
}

// ═══════════════════════════════════════════════════════════════════════════
// Corridor A
// ═══════════════════════════════════════════════════════════════════════════

/** Corridor A's third ceiling vent (x, z): a crawler drops out of it in the "corridor vent" hold. */
export const CORR_A_VENT: [number, number] = [37, -43.4];

/** Door slots in corridor A: [x, side (−1 = zMin wall / left, +1 = zMax wall / right)]. */
export const CORR_A_DOORS: [number, -1 | 1][] = [
  [24, -1],
  [29.5, 1],
  [38, -1],
  [44.5, 1],
];

export function buildCorrA(ctx: ZoneCtx): THREE.Group {
  const { rng, sc } = ctx;
  const g = new THREE.Group();
  g.name = 'corrA';
  const r = R.corrA;
  const left: Opening[] = CORR_A_DOORS.filter((d) => d[1] < 0).map((d) => ({ at: d[0], w: 1.3, h: 2.25 }));
  const right: Opening[] = CORR_A_DOORS.filter((d) => d[1] > 0).map((d) => ({ at: d[0], w: 1.3, h: 2.25 }));
  right.push({ at: 17, w: 2.6, h: 1.1, y0: 1.1 });
  buildShell(g, { ...r, style: styles.clinic(), floor: floorMat(), ceiling: ceilMat(), sides: { xMin: null, xMax: null, zMin: left, zMax: right } });
  // Office window (dark glass with blinds) at x = 17.
  box(g, 2.6, 1.1, 0.04, Kit.mat(0x5a7a80, { transparent: true, opacity: 0.3 }), 17, 1.65, -41.7);
  for (let i = 0; i < 6; i++) box(g, 2.56, 0.04, 0.03, M(0x8a8e88), 17, 1.2 + i * 0.18, -41.62, 0, 0.5);
  sideRoom(g, 15.3, 18.7, -41.55, -38.6, 0, 3, 0x1c2220);
  // Side rooms behind the doors + door slots.
  for (const [x, side] of CORR_A_DOORS) {
    const zw = side < 0 ? r.z0 : r.z1;
    const z0 = side < 0 ? zw - 3.4 : zw + 0.15;
    const z1 = side < 0 ? zw - 0.15 : zw + 3.4;
    sideRoom(g, x - 1.7, x + 1.7, z0, z1, 0, 3, rng.pick([0x26302c, 0x302c22, 0x262a32]), undefined, TX.paper);
    // A bed silhouette and a faint window inside.
    const zb = side < 0 ? zw - 2.6 : zw + 2.6;
    blk(g, 0.9, 0.6, 2.0, T(0x3a4440, TX.cloth), x + 0.6, 0, zb, Math.PI / 2);
    box(g, 1.2, 0.9, 0.02, G(0x2a3a5a, 0.6), x - 0.4, 1.8, side < 0 ? zw - 3.38 : zw + 3.38);
    // Room number plate.
    plateSign(g, `3${Math.round(x)}`, x + 0.95, 1.75, zw - side * 0.17, side < 0 ? 0 : Math.PI, 0.016, 0x1a1a1a, 0xd8d8cc);
    // Door slot: hinge at the left edge (as seen from the corridor).
    const ry = side < 0 ? 0 : Math.PI;
    const hingeX = side < 0 ? x - 0.65 : x + 0.65;
    sc.doorSlots.push({
      hinge: new THREE.Vector3(hingeX, 0, zw),
      ry,
      w: 1.3,
      h: 2.2,
      out: new THREE.Vector3(0, 0, -side),
      centre: new THREE.Vector3(x, 0, zw),
      color: rng.pick([0x5f7f7a, 0x6a7a5a, 0x5a6a7f]),
    });
  }
  // Ceiling panels every 2.8 m; some faulty.
  let i = 0;
  for (let x = 13; x < 53; x += 2.8, i++) {
    if (i === 5) danglingPanel(ctx, g, x, r.h, -44, 0.25);
    else if (i === 2 || i === 9) flickerPanel(ctx, g, x, r.h, -44, Math.PI / 2, 'blink');
    else if (i === 7 || i === 12) flickerPanel(ctx, g, x, r.h, -44, Math.PI / 2, 'dying');
    else if (i === 11) panel(g, x, r.h, -44, Math.PI / 2, false);
    else panel(g, x, r.h, -44, Math.PI / 2, true);
  }
  vent(ctx, g, 27, r.h, -43.2, 0);
  vent(ctx, g, 33.4, r.h, -44.7, 0);
  // (The "corridor vent" crawler's: ~6 m ahead of the corridor-vent stop at x 31.)
  vent(ctx, g, CORR_A_VENT[0], r.h, CORR_A_VENT[1], 0);
  // Furniture along the walls.
  gurney(g, 20.5, 0, -45.6, Math.PI / 2, { body: true, blood: true });
  gurney(g, 34.5, 0, -42.4, Math.PI / 2 + 0.08, { sheet: C.sheetBlue });
  wheelchair(g, 26.5, 0, -42.4, -1.2);
  wheelchair(g, 41, 0, -45.4, 2.2, true);
  ivStand(g, 22.4, 0, -45.6);
  ivStand(g, 36.2, 0, -42.2, 0xe0d0d0, 0x9a1a1a);
  crashCart(g, 31.6, 0, -45.7, 0);
  laundryCart(g, 48.5, 0, -42.5, 0.2);
  fireExt(g, 15, 0.9, -46.15, 0);
  wallClock(g, 33, 2.55, -41.85, Math.PI);
  trashBin(g, 47, 0, -45.6, true);
  plateSign(g, 'WARD 3 >', 20, 2.6, -41.86, Math.PI, 0.045, 0xffffff, 0x2a5a9a);
  plateSign(g, '< ER', 40, 2.6, -46.14, 0, 0.045, 0xffffff, 0x9a2a2a);
  // Gore.
  dragTrail(g, 12, -44.4, 52, -43.2, 0, rng);
  bloodPool(g, 29.5, 0, -43.1, 0.7, rng);
  bloodPool(g, 44, 0, -44.8, 0.6, rng);
  for (const [x, side] of [[19, 1], [31, -1], [36, 1], [47, -1]] as [number, number][]) wallSmear(g, x, 1.3, side > 0 ? -41.84 : -46.16, side > 0 ? Math.PI : 0, rng, x === 31);
  papers(g, 32, -44, 18, 1.6, 60, 0, rng);
  corpse(g, 39.5, 0, -44.9, 1.9, rng, 0x8fd1c6);
  // Far-end red emergency lamp + exit sign.
  emergencyLamp(g, 52.6, 2.9, -42.2, -Math.PI / 2);
  exitSign(g, 52.6, 2.9, -45.6, -Math.PI / 2);
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// Ward 3 (curtained beds) — the curtains are dynamic
// ═══════════════════════════════════════════════════════════════════════════

export const WARD_BEDS_X = [55.6, 59.8, 64, 68.2, 72.4];
/** Bed foot-end z (aisle side) for the north (+1) and south (−1) rows. */
export const WARD_FOOT_Z = { n: -39.3, s: -48.7 };
/** Front curtain line z. */
export const WARD_CURTAIN_Z = { n: -40.15, s: -47.85 };
/** Which beds get a closed (dynamic) front curtain: [bedIndex, row]. */
export const WARD_CURTAINS: [number, 'n' | 's'][] = [
  [1, 'n'],
  [2, 's'],
  [3, 'n'],
  [4, 's'],
];

export function buildWard(ctx: ZoneCtx): THREE.Group {
  const { rng, sc } = ctx;
  const g = new THREE.Group();
  g.name = 'ward';
  const r = R.ward;
  const wins = [56, 62, 68.5].map((x) => ({ at: x, w: 1.8, h: 1.2, y0: 1.5 }));
  buildShell(g, {
    ...r,
    style: styles.ward(),
    floor: T(0x5a685e, TX.lino),
    ceiling: ceilMat(),
    sides: {
      xMin: [{ at: -44, w: 4.6, h: 3.0 }],
      xMax: [{ at: -44, w: 8, h: 3.0 }],
      zMin: wins,
      zMax: wins,
    },
  });
  // Moonlit windows with blinds.
  for (const x of [56, 62, 68.5]) {
    for (const z of [r.z0, r.z1]) {
      const inward = z === r.z0 ? 1 : -1;
      pwTag(box(g, 1.8, 1.2, 0.04, G(C.moon, 0.55), x, 2.1, z - inward * 0.1), 'moonWin', { inward });
      for (let i = 0; i < 7; i++) pwTag(box(g, 1.78, 0.05, 0.03, M(0x8a908c), x, 1.56 + i * 0.17, z + inward * 0.02, 0, 0.6 * inward), 'blind');
    }
  }
  sign(g, 'WARD 3', 53.2, 3.1, -40.5, Math.PI / 2, 0.05, 0xbfe8ff, 0x101418, 1.1);
  // Beds, partitions, monitors.
  const closed = new Set(WARD_CURTAINS.map(([i, row]) => `${i}${row}`));
  WARD_BEDS_X.forEach((bx, i) => {
    for (const row of ['n', 's'] as const) {
      const north = row === 'n';
      const wallZ = north ? r.z1 : r.z0;
      const cz = north ? wallZ - 0.15 - 1.07 : wallZ + 0.15 + 1.07;
      const ry = north ? Math.PI : 0;
      const bloody = rng.chance(0.55);
      const isClosed = closed.has(`${i}${row}`);
      if (!(i === 3 && row === 's')) bed(g, bx, 0, cz, ry, rng, { messy: rng.chance(0.5), blood: bloody ? (rng.chance(0.5) ? C.blood : C.bloodFresh) : undefined, body: !isClosed && rng.chance(0.2) });
      bedside(g, bx + 1.3, 0, wallZ - (north ? 0.45 : -0.45), ry);
      monitor(g, bx - 0.9, 1.6, wallZ - (north ? 0.2 : -0.2), ry, rng.chance(0.6));
      if (rng.chance(0.6)) ivStand(g, bx - 0.95, 0, cz + (north ? -0.4 : 0.4));
      // Curtain rails above every bed; closed cubicles get full side partitions,
      // open beds just have their curtains bunched against the wall.
      const zA = wallZ - (north ? 0.15 : -0.15);
      const zB = north ? WARD_CURTAIN_Z.n : WARD_CURTAIN_Z.s;
      const len = Math.abs(zB - zA);
      const zc = (zA + zB) / 2;
      const col = i % 2 ? C.curtain : C.curtainAlt;
      for (const sx of [-2.0, 2.0]) box(g, 0.04, 0.04, len, T(0xb0b4b0, TX.steel), bx + sx, 2.8, zc);
      box(g, 4.0, 0.04, 0.04, T(0xb0b4b0, TX.steel), bx, 2.8, zB);
      for (const sx of [-1.9, 1.9]) box(g, 0.02, 0.8, 0.02, M(0x7a7e7a), bx + sx, 3.2, zB);
      if (isClosed) {
        curtainPanel(g, bx - 2.0, zc, len, 'z', col, 0.62, 2.75);
        curtainPanel(g, bx + 2.0, zc, len, 'z', col, 0.62, 2.75);
      } else if (rng.chance(0.6)) {
        const sx = rng.chance(0.5) ? -1.95 : 1.95;
        curtainPanel(g, bx + sx, zA + (north ? -0.5 : 0.5), 0.9, 'z', col, 0.62, 2.75);
      }
    }
  });
  // Toppled bed in the aisle.
  bed(g, 64.4, 0, -49.0, 0.42, rng, { messy: true, blood: C.bloodFresh });
  // Dynamic front curtains.
  for (const [i, row] of WARD_CURTAINS) {
    const bx = WARD_BEDS_X[i];
    const z = row === 'n' ? WARD_CURTAIN_Z.n : WARD_CURTAIN_Z.s;
    const holder = new THREE.Group();
    holder.position.set(bx - 1.95, 0, z);
    ctx.dyn.add(holder);
    const color = rng.pick([C.curtain, C.curtainAlt, 0xc8b8a0]);
    bakeInto(holder, (h) => {
      const mat = T(color, TX.curtain);
      const n = 12;
      const w = 3.9 / n;
      for (let k = 0; k < n; k++) box(h, w + 0.03, 2.13, 0.04, mat, (k + 0.5) * w, 0.62 + 1.065, k % 2 ? 0.05 : -0.05);
      // Bloody hand smear and a silhouette shadow.
      box(h, 0.5, 0.4, 0.06, M(C.blood), 2.0 + rng.spread(0.8), 1.4, row === 'n' ? -0.04 : 0.04);
    });
    sc.curtains.push({
      obj: holder,
      pos: new THREE.Vector3(bx, 0, z),
      closed: holder.position.clone(),
      slide: new THREE.Vector3(rng.chance(0.5) ? 0 : 2.9, 0, 0),
      t: 0,
      open: false,
    });
  }
  // Ceiling panels (two rows).
  for (let x = 55; x < 75; x += 3.4) {
    for (const z of [-41.6, -46.4]) {
      if (x > 64 && x < 66 && z < -45) flickerPanel(ctx, g, x, r.h, z, Math.PI / 2, 'blink');
      else if (x > 57 && x < 59 && z > -42) flickerPanel(ctx, g, x, r.h, z, Math.PI / 2, 'dying');
      else panel(g, x, r.h, z, Math.PI / 2, !(x > 70 && z > -42));
    }
  }
  vent(ctx, g, 61.6, r.h, -44.6, 0);
  // Aisle mess.
  wheelchair(g, 58.3, 0, -46.6, 0.8);
  gurney(g, 70.2, 0, -41.2, -0.25, { blood: true });
  papers(g, 64, -44, 9, 2.2, 50, 0, rng);
  dragTrail(g, 53, -44, 66, -40.2, 0, rng);
  bloodPool(g, 66.2, 0, -40.6, 0.7, rng);
  // Food trays on the floor.
  for (let k = 0; k < 3; k++) pwTag(box(g, 0.4, 0.03, 0.3, M(0xc8b8a0), 60 + k * 3.3 + rng.spread(0.5), 0.015, -44 + rng.spread(2), rng.next() * 3), 'tray');
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// Nurse station hub
// ═══════════════════════════════════════════════════════════════════════════

export function buildHub(ctx: ZoneCtx): THREE.Group {
  const { rng } = ctx;
  const g = new THREE.Group();
  g.name = 'hub';
  const r = R.hub;
  buildShell(g, {
    ...r,
    style: styles.clinic(),
    floor: floorMat(),
    ceiling: ceilMat(),
    sides: {
      xMin: null,
      zMax: [{ at: 83.5, w: 2.8, h: 2.5 }],
      zMin: [{ at: 79, w: 3.6, h: 2.8 }],
    },
  });
  // Dark corridor north.
  sideRoom(g, 82.0, 85.0, -37.15 + 0.0, -27, 0, 2.9, 0x141a18, (s) => {
    box(s, 0.6, 0.03, 1.2, G(0x6a2020, 0.8), 83.5, 2.85, -31);
  });
  // Nurse station: U counter facing west.
  counter(g, 82.4, 0, -44, -Math.PI / 2, 7.2, rng, 3);
  occluder(ctx, 82.75, 0.55, -44, 0.25, 1.1, 7.2);
  counter(g, 84.4, 0, -47.6, 0, 3.2, rng, 1);
  counter(g, 84.4, 0, -40.4, Math.PI, 3.2, rng, 1);
  // Back wall: medicine shelves, whiteboard, sign.
  for (let i = 0; i < 4; i++) {
    blk(g, 1.1, 2.0, 0.45, T(0xb8bcb4, TX.paint), 88.5, 0, -47 + i * 1.2, -Math.PI / 2);
    for (let k = 0; k < 3; k++) blk(g, 0.9, 0.12, 0.3, M(rng.pick([0xd8d0b0, 0x9ab8d8, 0xd89a9a])), 88.4, 0.5 + k * 0.5, -47 + i * 1.2, -Math.PI / 2);
  }
  whiteboard(g, 88.8, 1.7, -41.6, -Math.PI / 2, rng);
  sign(g, 'NURSES', 84.4, 2.95, -44, -Math.PI / 2, 0.06, 0x8affd0, 0x101814, 1.3);
  cyl(g, 0.01, 0.01, 0.5, M(0x222222), 84.4, 3.4, -45.5, 4);
  cyl(g, 0.01, 0.01, 0.5, M(0x222222), 84.4, 3.4, -42.5, 4);
  // Desk lamp glow.
  box(g, 0.25, 0.12, 0.25, G(0xffd890, 1.5), 85.4, 1.0, -45.6);
  // Panels.
  for (let x = 77; x < 89; x += 3.4) {
    for (const z of [-40.5, -47.5]) {
      if (x > 83 && x < 85 && z > -41) flickerPanel(ctx, g, x, r.h, z, 0, 'buzz', true);
      else panel(g, x, r.h, z, 0, !(x > 86 && z < -47));
    }
  }
  // Fire doors to the stairwell (swung open) + signs.
  for (const sx of [-1, 1]) {
    const dg = grp(g, 79 + sx * 1.75, 0, -51.0, -sx * 0.25);
    blk(dg, 0.06, 2.75, 1.7, T(0x9a2a22, TX.paint), 0, 0, 0.88);
    box(dg, 0.08, 0.5, 0.3, M(0x101414), 0, 1.9, 0.88);
  }
  sign(g, 'STAIRS', 79, 3.1, -50.82, 0, 0.045, 0xbfe8ff, 0x101418, 1.1);
  exitSign(g, 81.6, 2.9, -50.8, 0);
  plateSign(g, 'B1 MORGUE', 76.2, 2.0, -50.84, 0, 0.035, 0xffffff, 0x3a4a5a);
  // Mess.
  wheelchair(g, 78, 0, -40.4, 2.6);
  gurney(g, 87.2, 0, -38.6, 0.2, { body: true, sheet: C.sheetBlue });
  ivStand(g, 76.2, 0, -48.8);
  vending(g, 88.4, 0, -49.6, -Math.PI / 2, 0x2a6a4a, true, rng);
  plant(g, 75.8, 0, -38, rng);
  papers(g, 80, -44, 3, 5, 40, 0, rng);
  dragTrail(g, 77, -44.5, 79, -51, 0, rng);
  wallSmear(g, 88.84, 1.3, -38.6, -Math.PI / 2, rng, true);
  bloodPool(g, 80.2, 0, -47.6, 0.6, rng);
  return g;
}
