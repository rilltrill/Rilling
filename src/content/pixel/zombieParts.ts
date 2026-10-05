import * as THREE from 'three';
import type { HumanoidRig } from '../kit/humanoid';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';

/**
 * ─── PixelCast special zombies: the parts the humanoid painter doesn't know ───
 *
 * Each special zombie paints its base body with `paintHuman` and adds these
 * through the pose's `torso` (melts into the trunk) / `extra` (own layers)
 * hooks — built from the same live joints / meshes its 3D model and hitboxes
 * use, so a pustule or a throat sac is drawn exactly where it is shot.
 *
 *   bloater   swollen belly (stretch marks, navel) in the trunk; glowing
 *             pustules (weak) with inflamed rims, only on the side facing us.
 *   spitter   glowing throat sac (weak) with dark veins and a rim; glowing
 *             veins down the chest.
 *   brute     riot armour as PART.ARMOR plates (brushed steel, rivets, a pale
 *             edge band): chest plate, shoulder pads, bracer, knee pads; bone
 *             spikes out of the back; the mutant arm's raw muscle and bone spurs;
 *             a stitched belly scar.
 *   crawler   torn waist: a ragged gore stump, a knob of spine and guts trailing
 *             along the ground.
 */

const XM = { ready: false, goo: 0, gooDark: 0, pus: 0, pusRim: 0, plate: 0, edge: 0, strip: 0, rivet: 0, muscle: 0, bone: 0, guts: 0, gore: 0, blood: 0, scar: 0 };

function xm() {
  if (!XM.ready) {
    XM.ready = true;
    XM.goo = Mat.glow(0x9dff4a);
    XM.gooDark = Mat.flat(0x2e6a12, 'vein');
    XM.pus = Mat.glow(0xe4ff5a);
    XM.pusRim = Mat.gore(0x8a5a1a);
    XM.plate = Mat.plate(0x3a4458);
    XM.edge = Mat.plate(0x66738e);
    XM.strip = Mat.flat(0xd8d8d0, 'strip');
    XM.rivet = Mat.gloss(0xa8b0c0);
    XM.muscle = Mat.gore(0x8a2420);
    XM.bone = Mat.bone();
    XM.guts = Mat.gore(0x9a4646);
    XM.gore = Mat.gore();
    XM.blood = Mat.blood();
    XM.scar = Mat.flat(0x2a1a1a, 'scar');
  }
  return XM;
}

function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

// ─── Bloater ───────────────────────────────────────────────────────────────

/** The belly (torso layer): a taut dome of skin with stretch marks and a navel. */
export function paintBloaterBelly(f: PixelFigure, belly: THREE.Object3D, skin: number) {
  const M = xm();
  const s = scaleOf(belly);
  f.ellipsoid(belly, 0, 0, 0, 0.48, 0.432, 0.44, skin).k(0.07 * s).z(-0.02);
  const fr = f.at(belly, 0, 0.0, 0.44);
  if (f.facing(fr, f.dir(belly, 0, 0, 1)) > 0) {
    // Stretch marks fanning out from the navel; a dark navel; a bruise.
    for (let i = 0; i < 4; i++) {
      const a = -0.6 + i * 0.45;
      f.decal(f.at(belly, Math.cos(a) * 0.12, Math.sin(a) * 0.1 - 0.02, 0.43), f.at(belly, Math.cos(a) * 0.3, Math.sin(a) * 0.24 - 0.05, 0.36), 0.008 * s, 0.006 * s, skin)
        .flag(PF.FLAT | PF.SHADE_ONLY)
        .tone(-0.32)
        .min(0.5);
    }
    const nv = f.at(belly, 0.0, -0.06, 0.44);
    f.decal(nv, nv, 0.02 * s, 0.02 * s, M.scar).flag(PF.FLAT).min(0.6);
    f.decal(f.at(belly, -0.12, 0.12, 0.41), f.at(belly, -0.06, 0.16, 0.42), 0.045 * s, 0.04 * s, skin).flag(PF.FLAT | PF.SHADE_ONLY).tone(-0.2).rag(0.01 * s, PF.SPIKY);
  }
}

/** Pustules (weak points): glowing domes with an inflamed rim, own layer, only those facing us. */
export function paintPustules(f: PixelFigure, pustules: readonly THREE.Mesh[], belly: THREE.Object3D, chest: THREE.Object3D) {
  const M = xm();
  f.layer(0.002, PART.WEAK, 0, -0.04);
  for (let i = 0; i < pustules.length; i++) {
    const p = pustules[i];
    if (!p.visible) continue;
    const g = p.geometry as THREE.BufferGeometry & { parameters?: { radius?: number } };
    const r = (g.parameters?.radius ?? 0.07) * scaleOf(p);
    const c = f.at(p, 0, 0, 0);
    const parent = p.parent === belly ? belly : chest;
    _c.setFromMatrixPosition(parent.matrixWorld);
    _n.subVectors(c, _c).normalize();
    if (f.facing(c, _n) < 0.05) continue;
    f.ball(c, r * 1.3, M.pusRim).flag(PF.FLAT).z(0.01);
    f.ball(c, r, M.pus).flag(PF.GLOW).z(-0.01);
  }
}

// ─── Spitter ───────────────────────────────────────────────────────────────

/** Glowing chest veins (torso layer decals). */
export function paintSpitterVeins(f: PixelFigure, r: HumanoidRig, chestZ: number) {
  const M = xm();
  const s = scaleOf(r.chest);
  if (f.facing(f.at(r.chest, 0, -0.1, chestZ), f.dir(r.chest, 0, 0, 1)) < 0) return;
  f.decal(f.at(r.chest, -0.06, -0.01, chestZ), f.at(r.chest, -0.075, -0.15, chestZ), 0.01 * s, 0.008 * s, M.goo).flag(PF.FLAT | PF.GLOW).min(0.5);
  f.decal(f.at(r.chest, 0.05, -0.0, chestZ), f.at(r.chest, 0.065, -0.1, chestZ), 0.01 * s, 0.008 * s, M.goo).flag(PF.FLAT | PF.GLOW).min(0.5);
  f.decal(f.at(r.chest, -0.075, -0.15, chestZ), f.at(r.chest, -0.03, -0.24, chestZ), 0.008 * s, 0.006 * s, M.goo).flag(PF.FLAT | PF.GLOW).min(0.5);
}

/** The swollen throat sac (weak point): a glowing bulb with dark veins and a rim. */
export function paintSac(f: PixelFigure, pivot: THREE.Object3D) {
  if (!pivot.visible) return;
  const M = xm();
  const s = scaleOf(pivot);
  if (s < 0.05) return;
  f.layer(0.01 * s, PART.WEAK, 0, -0.02);
  f.ellipsoid(pivot, 0, 0, 0.03, 0.15, 0.125, 0.13, M.gooDark).flag(PF.FLAT).z(0.01);
  f.ellipsoid(pivot, 0, 0, 0.03, 0.135, 0.11, 0.12, M.goo).flag(PF.GLOW).z(-0.01).k(0.002);
  for (let i = 0; i < 3; i++) {
    const a = 0.6 + i * 0.9;
    f.decal(f.at(pivot, Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.15), f.at(pivot, Math.cos(a) * 0.12, Math.sin(a) * 0.09, 0.11), 0.007 * s, 0.006 * s, M.gooDark).flag(PF.FLAT).min(0.5);
  }
}

// ─── Brute ─────────────────────────────────────────────────────────────────

export interface BruteParts {
  r: HumanoidRig;
  bulk: number;
  chestW: number;
  /** Torso half-depth (the plates sit on it). */
  bz: number;
  armLen: number;
  /** +1 = the left arm is the mutant, −1 the right. */
  mutant: number;
}

const SPIKES: readonly (readonly [number, number, number, number])[] = [
  [0.13, 0.46, -0.35, 0.3],
  [-0.1, 0.44, -0.45, 0.26],
  [0.0, 0.3, -0.9, 0.22],
  [-0.17, 0.32, -0.7, 0.2],
];

/** Riot armour (PART.ARMOR plates), back spikes, the mutant arm's muscle and spurs. */
export function paintBruteArmour(f: PixelFigure, B: BruteParts, severed: readonly number[]) {
  const M = xm();
  const r = B.r;
  const s = scaleOf(r.spine);
  const sp = r.spine;
  const w = B.chestW;
  const bz = B.bz;
  // Chest plate with a pale edge band, an ID strip and rivets (only from the front: it's on the chest).
  const chestOn = f.facing(f.at(sp, 0, 0.36, bz + 0.05), f.dir(sp, 0, 0, 1));
  if (chestOn > -0.1) {
    f.layer(0.012 * s, PART.ARMOR, 0, -0.03);
    f.cone(f.at(sp, -w * 0.33, 0.33, bz + 0.03), f.at(sp, w * 0.33, 0.33, bz + 0.03), 0.105 * s, 0.105 * s, M.plate);
    f.cone(f.at(sp, -w * 0.4, 0.455, bz + 0.04), f.at(sp, w * 0.4, 0.455, bz + 0.04), 0.022 * s, 0.022 * s, M.edge).z(-0.03);
  }
  if (chestOn > 0) {
    f.decal(f.at(sp, -0.08, 0.38, bz + 0.05), f.at(sp, 0.08, 0.38, bz + 0.05), 0.016 * s, 0.016 * s, M.strip).flag(PF.FLAT);
    for (let i = -1; i <= 1; i += 2) {
      const rv = f.at(sp, i * w * 0.36, 0.27, bz + 0.05);
      f.decal(rv, rv, 0.012 * s, 0.012 * s, M.rivet).min(0.5);
    }
  }
  // Shoulder pads (slanted, two tiers).
  f.layer(0.012 * s, PART.ARMOR);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    if ((severed[i] ?? 0) >= 2) continue;
    const sh = i === 0 ? r.armL.shoulder : r.armR.shoulder;
    f.cone(f.at(sh, -side * 0.04, 0.095, 0), f.at(sh, side * 0.14, 0.005, 0), 0.07 * s, 0.06 * s, M.plate).k(0.01 * s);
    f.cone(f.at(sh, side * 0.0, -0.005, 0), f.at(sh, side * 0.16, -0.065, 0), 0.05 * s, 0.045 * s, M.edge).k(0.01 * s).z(0.005);
  }
  // Bracer on the normal forearm.
  const norm = B.mutant > 0 ? 1 : 0;
  if ((severed[norm] ?? 0) === 0) {
    const el = norm === 0 ? r.armL.elbow : r.armR.elbow;
    f.layer(0.012 * s, PART.ARMOR, 0, -0.03);
    f.cone(f.at(el, 0, -0.03 * B.armLen, 0), f.at(el, 0, -0.21 * B.armLen, 0), 0.088 * s, 0.084 * s, M.plate);
    f.cone(f.at(el, 0, -0.03 * B.armLen, 0), f.at(el, 0, -0.03 * B.armLen, 0), 0.09 * s, 0.09 * s, M.edge).z(-0.005);
  }
  // Knee pads.
  for (let i = 0; i < 2; i++) {
    const kn = i === 0 ? r.legL.knee : r.legR.knee;
    f.layer(0.01 * s, PART.ARMOR, 0, -0.03);
    f.ellipsoid(kn, 0, -0.03, 0.125, 0.1, 0.09, 0.04, M.plate);
  }
  // Bone spikes bursting out of the upper back.
  f.layer(0.01 * s, PART.NONE);
  for (let i = 0; i < SPIKES.length; i++) {
    const [x, y, rx, len] = SPIKES[i];
    const rz = -x * 1.8;
    // Kit.cone points +Y, rotated (rx, 0, rz): direction = Rx·Rz·(0, 1, 0).
    const dx = -Math.sin(rz);
    const dy = Math.cos(rz) * Math.cos(rx);
    const dz = Math.cos(rz) * Math.sin(rx);
    const cx = x * B.bulk;
    const cz = -bz - 0.03;
    f.cone(f.at(sp, cx - (dx * len) / 2, y - (dy * len) / 2, cz - (dz * len) / 2), f.at(sp, cx + (dx * len) / 2, y + (dy * len) / 2, cz + (dz * len) / 2), 0.045 * s, 0.006 * s, M.bone).min(0.5);
  }
  // The mutant arm: raw muscle bulging through the skin, bone spurs along the forearm.
  const mi = B.mutant > 0 ? 0 : 1;
  if ((severed[mi] ?? 0) < 2) {
    const ms = B.mutant;
    const sh = mi === 0 ? r.armL.shoulder : r.armR.shoulder;
    f.layer(0.02 * s, PART.LIMB, 0, -0.012);
    f.cone(f.at(sh, 0, -0.08, 0.075), f.at(sh, 0, -0.24, 0.07), 0.06 * s, 0.05 * s, M.muscle).rag(0.008 * s, PF.SPIKY);
    if ((severed[mi] ?? 0) === 0) {
      const el = mi === 0 ? r.armL.elbow : r.armR.elbow;
      f.cone(f.at(el, 0, -0.04, 0.075), f.at(el, 0, -0.13, 0.072), 0.05 * s, 0.045 * s, M.muscle).rag(0.008 * s, PF.SPIKY);
      for (let i = 0; i < 3; i++) {
        const y = -0.05 - i * 0.08;
        const len = 0.13;
        const dx = ms * Math.sin(1.2);
        const dy = Math.cos(1.2);
        f.cone(f.at(el, ms * 0.07 - (dx * len) / 2, y - (dy * len) / 2, -0.02), f.at(el, ms * 0.07 + (dx * len) / 2, y + (dy * len) / 2, -0.02), 0.025 * s, 0.004 * s, M.bone).part(PART.NONE).min(0.5);
      }
    }
  }
}

/** Stitched belly scar and a dark bruise (torso layer decals). */
export function paintBruteScars(f: PixelFigure, r: HumanoidRig, bz: number) {
  const M = xm();
  const s = scaleOf(r.spine);
  if (f.facing(f.at(r.spine, 0, 0.12, bz), f.dir(r.spine, 0, 0, 1)) < 0) return;
  f.decal(f.at(r.spine, 0.03, 0.01, bz), f.at(r.spine, 0.07, 0.19, bz), 0.01 * s, 0.01 * s, M.scar).flag(PF.FLAT).min(0.5);
  for (let i = 0; i < 4; i++) {
    const y = 0.04 + i * 0.04;
    const x = 0.04 + 0.008 * i;
    f.decal(f.at(r.spine, x - 0.025, y, bz), f.at(r.spine, x + 0.03, y + 0.008, bz), 0.006 * s, 0.006 * s, M.scar).flag(PF.FLAT).min(0.5);
  }
  f.decal(f.at(r.spine, -0.14, 0.1, bz), f.at(r.spine, -0.1, 0.14, bz), 0.05 * s, 0.04 * s, M.blood).flag(PF.FLAT).rag(0.012 * s, PF.SPIKY);
}

// ─── Crawler ───────────────────────────────────────────────────────────────

/** Torn waist (torso layer): ragged gore, a knob of spine, guts trailing behind along `drag`. */
export function paintCrawlerWaist(f: PixelFigure, r: HumanoidRig, drag: THREE.Object3D, bulk: number) {
  const M = xm();
  const s = scaleOf(r.spine);
  f.cone(f.at(r.spine, -0.11 * bulk, -0.03, 0), f.at(r.spine, 0.11 * bulk, -0.03, 0), 0.075 * s, 0.075 * s, M.gore)
    .rag(0.016 * s, PF.SPIKY)
    .seed(23)
    .z(-0.02);
  f.cone(f.at(drag, 0, 0.0, -0.04), f.at(drag, 0, -0.17, -0.05), 0.028 * s, 0.022 * s, M.bone).z(-0.03).k(0.005 * s);
  f.cone(f.at(drag, 0.06, -0.02, 0.03), f.at(drag, 0.09, -0.2, 0.05), 0.042 * s, 0.034 * s, M.guts).k(0.02 * s);
  f.cone(f.at(drag, 0.0, -0.14, 0.05), f.at(drag, 0.05, -0.34, 0.08), 0.036 * s, 0.028 * s, M.guts).k(0.02 * s);
  f.cone(f.at(drag, -0.06, -0.02, 0.0), f.at(drag, -0.11, -0.28, 0.0), 0.034 * s, 0.02 * s, M.blood).k(0.02 * s);
}
