import * as THREE from 'three';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat, PAT, makeRamp, material } from '../../gameplay/pixel/materials';
import { HAND, STAMP, dir8 } from '../../gameplay/pixel/stamps';

/**
 * ─── PixelCast: the DEAD ZONE bosses after the Butcher ──────────────────────
 *
 * Painters built from the bosses' live rigs, like the rest of the cast: every
 * shape is placed on a joint / mesh the hitboxes hang from, so the eye you
 * shoot is drawn where the eye's hit sphere is, in any pose.
 *
 *   PATIENT ZERO (z2)  a mound of fused patients in a pool of flesh: lumpy
 *              pebbled hide melted into one silhouette (base mound → bloated
 *              belly → chest mass → shoulder humps → neck), raw wet lumps, bone
 *              spikes breaking through, a stitched surgical scar, veins that
 *              burn orange in the frenzy; the open chest (a wet cavity, the
 *              glowing heart with vessels and a glint — weak once the rib cage
 *              cracks open) behind two hinged halves of bone ribs (armour) that
 *              swing with the rig; a bald, lumpy patient's head with a glowing
 *              maw, tooth rows and a gaping jaw (bile-green in the spit windup,
 *              drool dribbling); eight glowing eyes in veiny sockets (amber
 *              ball, hot iris, a slit pupil tracking you, a glint — burst eyes
 *              are stitched-shut lids, dead ones go dull); four tentacles traced
 *              along the live Bézier tubes (peristaltic bulges travelling down
 *              them) ending in three-pronged bone claws and a pustule that glows
 *              and pulses when the slam is armed, a glowing charge vein running
 *              down the armed one and a smear behind the slam; fused victims
 *              (sunk heads with glowing eyes and screaming mouths, reaching
 *              arms with claw hands). The pool of flesh and the IV bags stay
 *              live 3D (they are floor / scenery: the sprite sinks into them).
 */

/** World scale of a joint (its matrix's X column length). */
function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

/** Direction of a Kit cone (+Y) rotated by Euler (rx, 0, rz) in its parent frame. */
function coneDir(rx: number, rz: number, out: { x: number; y: number; z: number }) {
  const x = -Math.sin(rz);
  const y0 = Math.cos(rz);
  out.x = x;
  out.y = y0 * Math.cos(rx);
  out.z = y0 * Math.sin(rx);
  return out;
}
const CD = { x: 0, y: 0, z: 0 };
const P0 = { x: 0, y: 0, z: 0 };
const P1 = { x: 0, y: 0, z: 0 };
const D = PF.FLAT;

/** Hit flash a mesh is showing (the bosses swap the hit part to a white / red glow): 0 none, 1 white, 2 red. */
function flashOf(m: THREE.Mesh): number {
  const mat = m.material as THREE.MeshBasicMaterial;
  if (!mat || mat.isMeshBasicMaterial !== true || !mat.color) return 0;
  const c = mat.color;
  if (c.b > 1.05 && c.g > 1.05) return 1;
  if (c.r > 1.05 && c.g < 0.4 && c.b < 0.4) return 2;
  return 0;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT ZERO (z2)
// ═══════════════════════════════════════════════════════════════════════════

export interface PZEyeRig {
  mesh: THREE.Mesh;
  /** Pupil holder (tracks the camera); the pupil sits on its +Z. */
  pupil: THREE.Object3D;
  lid: THREE.Mesh;
  big: boolean;
}

export interface PZTentRig {
  /** Bézier control points P0..P3 in the BODY frame. */
  tube: { readonly P: readonly THREE.Vector3[] };
  side: number;
  upper: boolean;
  tip: THREE.Object3D;
  pustule: THREE.Mesh;
}

export interface PZRig {
  body: THREE.Object3D;
  torso: THREE.Object3D;
  chest: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  mouthGlow: THREE.Object3D;
  heart: THREE.Mesh;
  /** Rib arcs (torus quarters) and the two sternum halves, as built (4 ribs + sternum per side). */
  ribs: readonly THREE.Mesh[];
  eyes: readonly PZEyeRig[];
  tents: readonly PZTentRig[];
  /** Every flesh mesh (the fused victims and reaching arms are found among them). */
  flesh: readonly THREE.Mesh[];
  /** Floor-level parts that stay live 3D in SPRITES (the pool of flesh, the IV bags). */
  live: readonly THREE.Object3D[];
}

export interface PZPose {
  /** Boss age (the tubes' peristaltic wave runs on it). */
  time: number;
  state: string;
  stateTime: number;
  phase: number;
  heartExposed: boolean;
  /** Index of the tentacle whose slam is armed (glowing tip), −1 = none. */
  armed: number;
  /** Spit windup progress 0..1 (0 = not spitting). */
  spit: number;
  /** Hit flinch 0..1. */
  flinch: number;
}

export function pzPose(): PZPose {
  return { time: 0, state: 'entry', stateTime: 0, phase: 0, heartExposed: false, armed: -1, spit: 0, flinch: 0 };
}

const PZM = {
  ready: false,
  flesh: 0,
  tent: 0,
  raw: 0,
  dark: 0,
  skin: 0,
  face: 0,
  bone: 0,
  claw: 0,
  cavity: 0,
  rim: 0,
  heart: 0,
  heartCore: 0,
  heartDead: 0,
  vessel: 0,
  white: 0,
  red: 0,
  eye: 0,
  eyeF: 0,
  iris: 0,
  irisF: 0,
  pupil: 0,
  socket: 0,
  lid: 0,
  seam: 0,
  deadEye: 0,
  maw: 0,
  mawBile: 0,
  bile: 0,
  gullet: 0,
  teeth: 0,
  vein: 0,
  veinHot: 0,
  scar: 0,
  stitch: 0,
  sore: 0,
  pus: 0,
  pusHot: 0,
  vEye: 0,
  vMouth: 0,
  band: 0,
  gown: 0,
  nostril: 0,
  drool: 0,
  wave: 0,
};

function pzm() {
  if (!PZM.ready) {
    const M = PZM;
    M.ready = true;
    // Mottled flesh: rot blotches in a darker raw red, purple bruising, dark veins (ROT pattern).
    M.flesh = material('pz|flesh', () => ({
      ramp: makeRamp(0xc44232, { light: 0.55, sat: 1.3 }),
      pattern: PAT.ROT,
      scale: 0.1,
      strength: 0.8,
      secondary: Mat.flat(0x86221e, 'pzrot'),
      tertiary: Mat.flat(0x5a2440, 'pzbruise'),
      glow: false,
      dither: 0.12,
      spec: 0.25,
    }));
    // Tentacles: pebbled hide with hard seams (ringed, muscular).
    M.tent = material('pz|tent', () => ({ ramp: makeRamp(0xb8483a, { light: 0.55, sat: 1.2 }), pattern: PAT.SCALES, scale: 0.36, strength: 1, secondary: 0, glow: false, dither: 0.12, spec: 0.3 }));
    M.gown = Mat.gown(0x8fb0b0);
    M.raw = Mat.gore(0xc0302a);
    M.dark = Mat.hide(0x6a1c1c, { scale: 0.42 });
    M.skin = Mat.deadSkin(0xb49484, 0.7);
    M.face = material('pz|face', () => ({
      ramp: makeRamp(0xd8ac9c, { light: 0.62, sat: 1.3 }),
      pattern: PAT.ROT,
      scale: 0.07,
      strength: 0.4,
      secondary: Mat.flat(0xa4545a, 'pzsore'),
      tertiary: Mat.flat(0x7a4a6a, 'pzbruise2'),
      glow: false,
      dither: 0.12,
      spec: 0.1,
    }));
    M.drool = Mat.blood(0x8a2a24);
    M.nostril = Mat.mouth(0x2a0a0a);
    M.bone = Mat.bone(0xf2e6c8);
    M.claw = Mat.bone(0xe0d0ae);
    M.cavity = Mat.mouth(0x240505);
    M.rim = Mat.gore(0x7a1612);
    M.heart = Mat.glow(0xff2a2a);
    M.heartCore = Mat.glow(0xffa070);
    M.heartDead = Mat.gore(0x4a0a0a);
    M.vessel = Mat.gore(0x5a0a0a);
    M.white = Mat.glow(0xffffff);
    M.red = Mat.glow(0xff3020);
    M.eye = Mat.glow(0xf2b42a);
    M.eyeF = Mat.glow(0xff7a1a);
    M.iris = Mat.glow(0xfff07a);
    M.irisF = Mat.glow(0xffd23a);
    M.pupil = Mat.flat(0x140806, 'pzpupil');
    M.socket = Mat.hide(0x3a0e10, { scale: 0.2 });
    M.lid = Mat.hide(0x4a1414, { scale: 0.12 });
    M.seam = Mat.flat(0x1a0404, 'pzseam');
    M.deadEye = Mat.gloss(0x3a3020);
    M.maw = Mat.glow(0xff6a20);
    M.mawBile = Mat.glow(0xb8ff3a);
    M.bile = Mat.glow(0xa6ff2a);
    M.gullet = Mat.mouth(0x3a0606);
    M.teeth = Mat.teeth(0xf4ecd4);
    M.vein = Mat.flat(0x4a1a2e, 'pzvein');
    M.veinHot = Mat.glow(0xff5a24);
    M.scar = Mat.flat(0x3a0a0e, 'pzscar');
    M.stitch = Mat.flat(0xd8cfa8, 'pzstitch');
    M.sore = Mat.gore(0xb03a1a);
    M.pus = Mat.gore(0x8e2e1e);
    M.pusHot = Mat.glow(0xffa030);
    M.vEye = Mat.glow(0xffb040);
    M.vMouth = Mat.mouth(0x1a0404);
    M.band = Mat.flat(0xe8ecf0, 'pzband');
  }
  return PZM;
}

/** Fused victims / reaching arms found in the flesh meshes, and per-rig memory (smears). */
interface PZMem {
  victims: THREE.Object3D[];
  arms: THREE.Object3D[];
  eyeR: number[];
  tipPrev: THREE.Vector3[];
  tipT: number;
  tipValid: boolean;
}
const pzMem = new WeakMap<PZRig, PZMem>();

function boxIs(m: THREE.Mesh, w: number, h: number): boolean {
  const p = (m.geometry as THREE.BoxGeometry).parameters as { width?: number; height?: number } | undefined;
  return !!p && Math.abs((p.width ?? 0) - w) < 1e-4 && Math.abs((p.height ?? 0) - h) < 1e-4;
}

function pzInit(R: PZRig): PZMem {
  let m = pzMem.get(R);
  if (m) return m;
  m = { victims: [], arms: [], eyeR: [], tipPrev: R.tents.map(() => new THREE.Vector3()), tipT: 0, tipValid: false };
  // Victim heads are 0.24 × 0.3 boxes on a pivot; reaching arms start with a 0.12 × 0.6 upper arm.
  for (const fm of R.flesh) {
    const par = fm.parent;
    if (!par) continue;
    if (boxIs(fm, 0.24, 0.3) && !m.victims.includes(par)) m.victims.push(par);
    else if (boxIs(fm, 0.12, 0.6) && !m.arms.includes(par)) m.arms.push(par);
  }
  for (const e of R.eyes) {
    const g = e.mesh.geometry as THREE.SphereGeometry;
    m.eyeR.push((g.parameters as { radius?: number } | undefined)?.radius ?? 0.2);
  }
  // The pool of flesh and the IV bags are floor / scenery: they stay live 3D.
  for (const o of R.live) o.traverse((c) => (c.userData.spriteKeep3D = true));
  pzMem.set(R, m);
  return m;
}

/** A Bézier point of a tentacle tube (body frame) → world (scratch vector). */
function bez(f: PixelFigure, body: THREE.Object3D, P: readonly THREE.Vector3[], s: number): THREE.Vector3 {
  const u = 1 - s;
  const a = u * u * u;
  const b = 3 * u * u * s;
  const c = 3 * u * s * s;
  const d = s * s * s;
  return f.at(body, a * P[0].x + b * P[1].x + c * P[2].x + d * P[3].x, a * P[0].y + b * P[1].y + c * P[2].y + d * P[3].y, a * P[0].z + b * P[1].z + c * P[2].z + d * P[3].z);
}

const TENT_S = [0, 0.2, 0.4, 0.6, 0.8, 1];

export function paintPatientZero(f: PixelFigure, R: PZRig, st: PZPose): boolean {
  if (!R.body.visible) return false;
  f.maxTexels = 240;
  const M = pzm();
  const mem = pzInit(R);
  const s = scaleOf(R.body);
  const t = st.time;
  const dying = st.state === 'dying';
  const frenzy = st.phase >= 2 && !dying;
  const beat = Math.pow(Math.max(0, Math.sin(t * (1.3 + st.phase * 0.9) * Math.PI * 2)), 8);
  const veinM = frenzy && beat > 0.15 ? M.veinHot : frenzy ? M.raw : M.vein;
  const tor = R.torso;
  const ch = R.chest;
  const bd = R.body;
  // Dying flesh greys and darkens as it collapses.
  const rot = dying ? -Math.min(0.3, st.stateTime * 0.08) : 0;

  // ── Body: base mound → bloated belly → chest mass → shoulder humps → neck ──
  f.layer(0.32 * s, PART.TORSO, rot);
  f.ellipsoid(bd, 0, 1.0, 0, 2.75, 1.55, 2.5, M.flesh).k(0.3 * s).u(0.3).seed(3);
  f.ellipsoid(bd, 1.25, 0.8, 1.15, 1.3, 0.8, 1.3, M.raw).k(0.3 * s).seed(5);
  f.ellipsoid(bd, -1.45, 0.72, 0.95, 1.15, 0.66, 1.15, M.dark).k(0.3 * s).seed(7);
  f.ellipsoid(tor, 0, 0.8, 0.1, 1.72, 1.5, 1.42, M.flesh).k(0.42 * s).u(1.1).seed(9);
  f.ellipsoid(tor, 0.72, 0.6, 0.95, 0.66, 0.66, 0.66, M.raw).k(0.2 * s).seed(11);
  f.ellipsoid(ch, 0, 0.12, -0.25, 1.9, 1.42, 1.2, M.flesh).k(0.42 * s).u(2.3).seed(13);
  for (let sd = 1; sd >= -1; sd -= 2) f.ellipsoid(ch, sd * 1.55, 0.55, -0.35, 0.92, 0.74, 0.92, M.raw).k(0.32 * s).seed(15 + sd);
  const nk = R.head.parent ?? ch;
  f.cone(f.at(nk, 0, -0.25, -0.05), f.at(nk, 0, 0.62, 0.02), 0.74 * s, 0.56 * s, M.flesh).k(0.3 * s).u(3.1);
  // Tumours breaking the mound's outline (lumpy, not a smooth egg).
  f.ball(f.at(bd, -2.45, 1.35, 0.2), 0.55 * s, M.flesh).k(0.25 * s);
  f.ball(f.at(bd, 2.5, 1.25, -0.1), 0.5 * s, M.dark).k(0.25 * s);
  // Front details (decals, only while the front faces us).
  const front = f.facing(f.at(tor, 0, 0.8, 1.4), f.dir(tor, 0, 0, 1));
  if (front > -0.05) {
    // Torn chest cavity: a raw rim, the dark wet hole the heart sits in.
    f.decal(f.at(ch, 0, 0.42, 0.95), f.at(ch, 0, -0.55, 0.95), 0.92 * s, 0.86 * s, M.rim).flag(D).rag(0.07 * s, PF.SPIKY).seed(21);
    f.decal(f.at(ch, 0, 0.32, 0.95), f.at(ch, 0, -0.45, 0.95), 0.74 * s, 0.7 * s, M.cavity).flag(D).rag(0.05 * s, PF.SPIKY).seed(22);
    // Belly folds where the chest overhangs, and under the belly.
    f.decal(f.at(tor, -1.1, 1.85, 1.2), f.at(tor, -0.2, 1.62, 1.45), 0.035 * s, 0.03 * s, M.flesh).flag(D | PF.SHADE_ONLY).tone(-0.42).min(0.5);
    f.decal(f.at(tor, 0.35, 1.6, 1.45), f.at(tor, 1.15, 1.82, 1.2), 0.035 * s, 0.03 * s, M.flesh).flag(D | PF.SHADE_ONLY).tone(-0.42).min(0.5);
    // Stitched surgical scar down the belly (the patient), stitches across it.
    f.decal(f.at(tor, -0.35, 1.35, 1.5), f.at(tor, -0.05, 0.25, 1.48), 0.045 * s, 0.04 * s, M.scar).flag(D).min(0.5);
    for (let i = 0; i < 2; i++) {
      const y = 1.05 - i * 0.42;
      const x = -0.32 + (1.2 - y) * 0.27;
      f.decal(f.at(tor, x - 0.13, y + 0.02, 1.5), f.at(tor, x + 0.13, y - 0.02, 1.5), 0.022 * s, 0.022 * s, M.stitch).flag(D | PF.NO_OUTLINE).min(0.5);
    }
    // Veins: branching dark lines (they burn orange in the frenzy).
    f.decal(f.at(tor, 0.95, 1.7, 1.3), f.at(tor, 0.55, 0.6, 1.5), 0.04 * s, 0.025 * s, veinM).flag(D).min(0.5);
    f.decal(f.at(ch, -1.1, 0.9, 0.85), f.at(ch, -0.75, -0.2, 1.05), 0.04 * s, 0.025 * s, veinM).flag(D).min(0.5);
    f.decal(f.at(bd, -1.9, 1.3, 1.4), f.at(bd, -0.9, 0.55, 2.2), 0.04 * s, 0.025 * s, veinM).flag(D).min(0.5);
    // A scrap of hospital gown stretched over the shoulder hump (the patient it once was).
    f.decal(f.at(ch, 1.15, 1.05, 0.25), f.at(ch, 1.75, 0.25, 0.45), 0.42 * s, 0.32 * s, M.gown).flag(D).rag(0.07 * s, PF.SPIKY).seed(33);
    // Something moving under the skin: a swelling crawling across the belly.
    {
      const k = (t * 0.23) % 1;
      const bx = -1.1 + 2.2 * k;
      const by = 0.75 + Math.sin(k * 6.3) * 0.25;
      f.decal(f.at(tor, bx, by, 1.45), f.at(tor, bx + 0.12, by + 0.05, 1.45), 0.2 * s, 0.17 * s, M.flesh).flag(D | PF.SHADE_ONLY).tone(0.22).min(0.5);
    }
    // Weeping sores.
    f.decal(f.at(tor, -1.0, 0.55, 1.25), f.at(tor, -0.92, 0.48, 1.27), 0.13 * s, 0.11 * s, M.sore).flag(D).rag(0.03 * s, PF.SPIKY).seed(31);
    f.decal(f.at(bd, 1.6, 1.2, 1.75), f.at(bd, 1.7, 1.12, 1.75), 0.11 * s, 0.1 * s, M.sore).flag(D).rag(0.03 * s, PF.SPIKY).seed(32);
  }

  // ── Bone spikes breaking through the shoulders, the spine ridge ──
  f.layer(0.03 * s, PART.TORSO, rot);
  for (let sd = 1; sd >= -1; sd -= 2) {
    for (let i = 0; i < 3; i++) {
      const x = i === 0 ? 1.75 : i === 1 ? 1.3 : 2.05;
      const y = i === 0 ? 1.1 : i === 1 ? 1.25 : 0.6;
      const z = i === 0 ? -0.5 : i === 1 ? -0.8 : -0.2;
      const rz = i === 0 ? -0.55 : i === 1 ? -0.3 : -1.0;
      const rx = i === 0 ? -0.2 : i === 1 ? -0.45 : 0.1;
      const l = i === 0 ? 1.1 : i === 1 ? 0.9 : 0.8;
      coneDir(rx, sd * rz, CD);
      const h = l * 0.5;
      f.cone(f.at(ch, sd * x - CD.x * h, y - CD.y * h, z - CD.z * h), f.at(ch, sd * x + CD.x * h, y + CD.y * h, z + CD.z * h), 0.14 * s, 0.012 * s, M.bone).min(0.5).u(i);
    }
  }
  for (let i = 0; i < (front > 0.3 ? 0 : 2); i++) {
    const h = (0.9 - i * 0.08) * 0.5;
    coneDir(-0.9, 0, CD);
    const y = 3.4 - i * 0.6;
    const z = -1.25 + i * 0.05;
    f.cone(f.at(tor, -CD.x * h, y - CD.y * h, z - CD.z * h), f.at(tor, CD.x * h, y + CD.y * h, z + CD.z * h), (0.14 - i * 0.012) * s, 0.01 * s, M.bone).min(0.5);
  }

  // ── Heart (armour behind the ribs; weak once exposed): a glowing bulb with vessels ──
  if (R.heart.visible) {
    f.layer(0.03 * s, st.heartExposed ? PART.WEAK : PART.ARMOR, 0, 0);
    const hf = flashOf(R.heart);
    const hm = hf === 1 ? M.white : hf === 2 ? M.red : M.heart;
    f.ellipsoid(R.heart, 0, 0, 0, 0.44, 0.44, 0.42, hm).flag(PF.GLOW);
    const hs = scaleOf(R.heart);
    f.decal(f.at(R.heart, 0.02, -0.02, 0.4), f.at(R.heart, 0.02, -0.02, 0.4), (0.18 + 0.1 * beat) * hs, (0.18 + 0.1 * beat) * hs, M.heartCore).flag(D | PF.GLOW);
    f.decal(f.at(R.heart, -0.17, 0.18, 0.4), f.at(R.heart, -0.13, 0.2, 0.4), 0.055 * hs, 0.04 * hs, M.white).flag(D | PF.GLOW | PF.NO_OUTLINE).min(0.5);
    // Vessels tying it into the cavity.
    for (let i = 0; i < 2; i++) {
      const a = 0.9 + i * 2.6;
      f.cone(f.at(R.heart, Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.1), f.at(R.heart, Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.05), 0.07 * hs, 0.05 * hs, M.vessel).k(0.04 * hs).part(PART.TORSO);
    }
  }

  // ── Rib cage (armour): two hinged halves of curved bone ribs and the sternum ──
  f.layer(0.012 * s, PART.ARMOR, rot + 0.12, -0.12 * s);
  for (let i = 0; i < R.ribs.length; i++) {
    const rb = R.ribs[i];
    if (!rb.visible) continue;
    const rs = scaleOf(rb);
    if (i % 5 === 4) {
      // Sternum half.
      f.cone(f.at(rb, 0, 0.7, 0), f.at(rb, 0, -0.7, 0), 0.085 * rs, 0.075 * rs, M.bone).u(0.4);
      continue;
    }
    // Torus quarter (local XY plane, radius 1.25): flank → front — the middle ribs in two
    // curved pieces, the top and bottom ones as one (the layer sits a little forward).
    const r0 = 1.25;
    const a2 = Math.PI / 2 + 0.06;
    const p0 = f.at(rb, r0, 0, 0);
    const p2 = f.at(rb, r0 * Math.cos(a2), r0 * Math.sin(a2), 0);
    const j = i % 5;
    if (j === 1 || j === 2) {
      const a1 = Math.PI / 4;
      const p1 = f.at(rb, r0 * Math.cos(a1), r0 * Math.sin(a1), 0);
      f.cone(p0, p1, 0.1 * rs, 0.09 * rs, M.bone).u(i * 0.3);
      f.cone(p1, p2, 0.09 * rs, 0.075 * rs, M.bone).u(i * 0.3 + 0.9);
    } else f.cone(p0, p2, 0.1 * rs, 0.075 * rs, M.bone).u(i * 0.3);
  }

  // ── Head: a bald, lumpy patient's skull, cheeks, the lip over the maw, the jaw ──
  const h = R.head;
  const sh = scaleOf(h);
  const jw = R.jaw;
  f.layer(0.16 * sh, PART.TORSO, rot);
  f.ellipsoid(h, 0, 0.72, -0.06, 0.98, 0.95, 0.9, M.face).k(0.12 * sh).u(0.2).seed(41);
  f.ellipsoid(h, -0.6, 0.95, -0.2, 0.5, 0.5, 0.5, M.raw).k(0.18 * sh).seed(43);
  f.ellipsoid(h, 0.55, 1.15, -0.3, 0.4, 0.4, 0.4, M.dark).k(0.18 * sh).seed(45);
  // Puffy cheeks, swollen bags under the eye cluster, a stubby rotted nose.
  for (let sd = 1; sd >= -1; sd -= 2) f.ball(f.at(h, sd * 0.5, 0.38, 0.6), 0.3 * sh, M.face).k(0.14 * sh);
  f.cone(f.at(h, -0.55, 0.58, 0.8), f.at(h, 0.55, 0.58, 0.8), 0.1 * sh, 0.1 * sh, M.face).k(0.08 * sh).z(-0.04);
  f.cone(f.at(h, 0, 0.62, 0.9), f.at(h, 0, 0.44, 1.0), 0.09 * sh, 0.12 * sh, M.face).k(0.06 * sh).z(-0.06);
  // The throat behind the mouth (fills the gap as the jaw drops).
  f.ellipsoid(h, 0, 0.05, 0.45, 0.44, 0.36, 0.36, M.gullet).k(0.06 * sh);
  // Jaw: a heavy slab hanging from the hinge, a chin.
  f.coneE(f.at(jw, -0.3, -0.12, 0.4), f.at(jw, 0.3, -0.12, 0.4), f.dir(jw, 0, 1, 0), f.dir(jw, 0, 0, 1), 0.13 * sh, 0.36 * sh, 0.13 * sh, 0.36 * sh, M.face).k(0.06 * sh);
  f.ball(f.at(jw, 0, -0.18, 0.66), 0.16 * sh, M.face).k(0.08 * sh);
  // Mouth: the maw (a glowing throat between the jaws — bile-green in the spit windup), tooth
  // rows in front of it (TEETH zigzags: the lips in front hide their roots), then the lips.
  {
    const up = f.at(h, 0, 0.3, 0.88);
    const lo = f.at(jw, 0, 0.0, 0.74);
    const mc = f.mix(up, lo, 0.5);
    const gap = Math.max(0.07 * sh, up.distanceTo(lo) * 0.5);
    const ax = f.dir(h, 1, 0, 0);
    const mawM = st.spit > 0.35 ? M.mawBile : dying ? M.gullet : M.maw;
    f.cone(f.add(mc, ax, -0.34 * sh), f.add(mc, ax, 0.34 * sh), gap, gap, mawM)
      .flag(PF.FLAT | (dying ? 0 : PF.GLOW))
      .k(0.02 * sh)
      .z(-0.02);
  }
  f.cone(f.at(h, -0.38, 0.31, 0.9), f.at(h, 0.38, 0.31, 0.9), 0.065 * sh, 0.065 * sh, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.08).seed(4);
  f.cone(f.at(jw, -0.35, 0.0, 0.76), f.at(jw, 0.35, 0.0, 0.76), 0.06 * sh, 0.06 * sh, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.08).seed(9);
  f.cone(f.at(h, -0.46, 0.41, 0.85), f.at(h, 0.46, 0.41, 0.85), 0.08 * sh, 0.08 * sh, M.face).k(0.04 * sh).z(-0.12);
  f.cone(f.at(jw, -0.4, -0.1, 0.78), f.at(jw, 0.4, -0.1, 0.78), 0.075 * sh, 0.075 * sh, M.face).k(0.04 * sh).z(-0.12);
  const face = f.facing(f.at(h, 0, 0.6, 0.95), f.dir(h, 0, 0, 1));
  if (face > -0.2) {
    // Shadow under the eye cluster, nostrils; blood-tinged drool swinging from the lip.
    f.decal(f.at(h, -0.42, 0.68, 0.92), f.at(h, 0.42, 0.68, 0.92), 0.07 * sh, 0.07 * sh, M.face).flag(D | PF.SHADE_ONLY).tone(-0.3);
    f.decal(f.at(h, -0.07, 0.45, 1.04), f.at(h, 0.07, 0.45, 1.04), 0.035 * sh, 0.035 * sh, M.nostril).flag(D).min(0.5);
    // Scalp vein, a stitched scar over the crown.
    f.decal(f.at(h, -0.55, 1.45, 0.52), f.at(h, -0.15, 1.6, 0.56), 0.035 * sh, 0.03 * sh, M.scar).flag(D).min(0.5);
    if (!dying && st.spit <= 0.2 && st.state !== 'spit') {
      const sw = Math.sin(t * 2.3) * 0.05;
      const len = 0.25 + 0.12 * Math.sin(t * 0.9);
      f.cone(f.at(jw, 0.26, 0.0, 0.8), f.at(jw, 0.26 + sw, -len, 0.82), 0.035 * sh, 0.02 * sh, M.drool).part(PART.NONE).z(-0.2).min(0.5);
    }
    if (st.spit > 0.2 || st.state === 'spit') {
      // Bile dribbling over the lower teeth.
      const dy = (t * 0.9) % 0.35;
      f.cone(f.at(jw, 0.12, 0.08, 0.8), f.at(jw, 0.13, -0.2 - dy, 0.82), 0.05 * sh, 0.03 * sh, M.bile).flag(PF.GLOW).part(PART.NONE).z(-0.2).min(0.5);
      f.cone(f.at(jw, -0.18, 0.08, 0.78), f.at(jw, -0.19, -0.08 - dy * 0.6, 0.8), 0.04 * sh, 0.025 * sh, M.bile).flag(PF.GLOW).part(PART.NONE).z(-0.2).min(0.5);
    }
  }

  // ── Eyes (weak): veiny socket, amber glowing ball, hot iris, slit pupil, glint ──
  f.layer(0.004 * s, PART.WEAK, 0, -0.12 * s);
  for (let i = 0; i < R.eyes.length; i++) {
    const e = R.eyes[i];
    const hold = e.mesh.parent;
    if (!hold) continue;
    const r = mem.eyeR[i] ?? 0.2;
    const es = scaleOf(hold);
    const c = f.at(hold, 0, 0, 0);
    // Only eyes facing the camera (the mound hides the rest).
    if (f.facing(c, f.dir(hold, 0, 0, 1)) < -0.25) continue;
    if (r >= 0.195) f.ball(f.at(hold, 0, 0, -0.3 * r), r * 1.32 * es, M.socket).part(PART.TORSO).flag(PF.FLAT).z(0.04);
    if (e.lid.visible) {
      // Burst: a stitched-shut lid.
      f.ellipsoid(e.lid, 0, 0, 0, r * 1.1, r * 1.1, r * 0.6, M.lid).part(PART.TORSO);
      f.decal(f.at(hold, -r * 0.85, 0.02 * r, r * 0.6), f.at(hold, r * 0.85, -0.02 * r, r * 0.6), r * 0.12 * es, r * 0.12 * es, M.seam).flag(D).min(0.5);
      continue;
    }
    if (!e.mesh.visible) continue;
    const fl = flashOf(e.mesh);
    const dead = !(e.mesh.material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    const ball = fl === 1 ? M.white : fl === 2 ? M.red : dead ? M.deadEye : frenzy ? M.eyeF : M.eye;
    f.ball(c, r * es, ball).flag(dead ? 0 : PF.GLOW).z(-0.02);
    if (fl || dead) continue;
    // Iris toward the pupil, then the slit.
    const pc = f.at(e.pupil, 0, 0, r * 0.92);
    if (r > 0.25) f.decal(f.mix(c, pc, 0.55), f.mix(c, pc, 0.55), r * 0.62 * es, r * 0.62 * es, frenzy ? M.irisF : M.iris).flag(D | PF.GLOW);
    f.decal(f.at(e.pupil, 0, r * 0.42, r * 0.92), f.at(e.pupil, 0, -r * 0.42, r * 0.92), r * 0.2 * es, r * 0.2 * es, M.pupil).flag(D | PF.NO_OUTLINE).min(0.5);
    if (r > 0.25) f.decal(f.at(hold, -r * 0.42, r * 0.45, r * 0.8), f.at(hold, -r * 0.42, r * 0.45, r * 0.8), r * 0.13 * es, r * 0.13 * es, M.white).flag(D | PF.GLOW | PF.NO_OUTLINE).min(0.5);
  }

  // ── Fused victims: sunk heads with glowing eyes and screaming mouths, reaching arms ──
  f.layer(0.03 * s, PART.TORSO, rot - 0.04);
  for (let i = 0; i < mem.victims.length; i++) {
    const v = mem.victims[i];
    const vs = scaleOf(v);
    f.ellipsoid(v, 0, 0.01, 0, 0.14, 0.17, 0.15, M.skin).k(0.05 * vs);
    if (f.facing(f.at(v, 0, 0, 0.14), f.dir(v, 0, 0, 1)) > 0.05) {
      f.decal(f.at(v, -0.07, 0.05, 0.14), f.at(v, 0.07, 0.05, 0.14), 0.026 * vs, 0.026 * vs, dying ? M.vMouth : M.vEye).flag(D | PF.GLOW).min(0.5);
      const mp = f.at(v, 0, -0.07, 0.14);
      f.decal(mp, f.at(v, 0, -0.1, 0.14), 0.035 * vs, 0.03 * vs, M.vMouth).flag(D).min(0.5);
    }
  }
  for (let i = 0; i < mem.arms.length; i++) {
    const a = mem.arms[i];
    const as = scaleOf(a);
    // Twitching fingers: the forearm sways a little (drawn only — the rig arm is static).
    const tw = Math.sin(t * 3.1 + i * 2.3) * 0.03;
    f.cone(f.at(a, 0, 0.02, 0), f.at(a, 0, 0.58, 0.01), 0.085 * as, 0.065 * as, M.skin);
    const wr = f.at(a, tw, 0.97, 0.25);
    f.cone(f.at(a, 0, 0.55, 0.01), wr, 0.07 * as, 0.05 * as, M.skin);
    if (i === 0) f.decal(f.at(a, 0, 0.85, 0.18), f.at(a, 0, 0.9, 0.21), 0.055 * as, 0.055 * as, M.band).flag(D).min(0.5);
    const len = f.px(wr, 0.17 * as) / f.kHint;
    if (len >= 3 && len < 11) {
      const e0 = f.project(f.at(a, 0, 0.6, 0.02), P0);
      const w1 = f.project(wr, P1);
      f.stamp(wr, (0.17 * as) / 5, STAMP.hand[HAND.CLAW][0][dir8(w1.x - e0.x, w1.y - e0.y)], M.skin, 0, 0, 0, false, true);
    } else f.ball(f.at(a, 0, 1.02, 0.28), 0.07 * as, M.skin);
  }

  // ── Tentacles (tail): traced along the live tubes, bulges travelling down them ──
  const bodyMid = f.depth(f.at(tor, 0, 1, 0));
  for (let ti = 0; ti < R.tents.length; ti++) {
    const tn = R.tents[ti];
    const P = tn.tube.P;
    const armed = st.armed === ti;
    const far = f.depth(bez(f, bd, P, 0.6)) > bodyMid + 0.4;
    f.layer(0.06 * s, PART.TAIL, far ? -0.1 : 0);
    const r0 = tn.upper ? 0.5 : 0.42;
    const r1 = 0.11;
    const wave = armed ? 2 : 1;
    const thick = dying ? 0.9 : 1;
    let prev = bez(f, bd, P, 0);
    let rPrev = r0 * thick * (1 + wave * 0.16 * Math.sin(-t * 4)) * s;
    let u = 0;
    for (let k = 1; k < TENT_S.length; k++) {
      const q = TENT_S[k];
      const p = bez(f, bd, P, q);
      const r = (r0 + (r1 - r0) * Math.pow(q, 0.85)) * thick * (1 + wave * 0.16 * Math.sin(q * 10 - t * 4)) * s;
      f.cone(prev, p, rPrev, r, M.tent).u(u).k(0.05 * s).seed(ti * 7 + k);
      u += prev.distanceTo(p);
      prev = p;
      rPrev = r;
    }
    // The armed tentacle: a glowing charge vein running down to the tip.
    if (armed) {
      const pulse = (t * 2.2) % 1;
      for (let k = 1; k < TENT_S.length - 1; k++) {
        const a = bez(f, bd, P, TENT_S[k]);
        const b = bez(f, bd, P, Math.min(1, TENT_S[k + 1] + 0.02));
        const on = Math.abs(TENT_S[k] - pulse) < 0.3;
        f.decal(a, b, 0.07 * s, 0.05 * s, on ? M.pusHot : M.veinHot).flag(D | PF.GLOW).min(0.5);
      }
    } else if (frenzy) {
      const a = bez(f, bd, P, 0.2);
      const b = bez(f, bd, P, 0.62);
      f.decal(a, b, 0.05 * s, 0.03 * s, veinM).flag(D).min(0.5);
    }
    // Tip: three-pronged bone claw and the pustule.
    const tip = tn.tip;
    const ts = scaleOf(tip);
    f.cone(f.at(tip, 0, 0.02, 0), f.at(tip, 0, 0.6, 0), 0.13 * ts, 0.012 * ts, M.claw).part(PART.NONE).k(0.02 * ts).min(0.5);
    for (let sd = -1; sd <= 1; sd += 2) {
      coneDir(0, sd * -0.8, CD);
      const bx = sd * 0.12;
      f.cone(f.at(tip, bx - CD.x * 0.17, 0.18 - CD.y * 0.17, 0), f.at(tip, bx + CD.x * 0.18, 0.18 + CD.y * 0.18, 0), 0.08 * ts, 0.01 * ts, M.claw).part(PART.NONE).k(0.02 * ts).min(0.5);
    }
    const pf = flashOf(tn.pustule);
    const pm = pf === 1 ? M.white : pf === 2 ? M.red : armed ? M.pusHot : M.pus;
    const ps = scaleOf(tn.pustule);
    f.ball(f.at(tn.pustule, 0, 0, 0), 0.24 * ps, pm).flag(armed || pf ? PF.GLOW : 0).part(armed ? PART.WEAK : PART.TAIL).z(-0.03).k(0.03 * ps);
    if (armed && !pf) f.decal(f.at(tn.pustule, -0.08, 0.08, 0.2), f.at(tn.pustule, -0.08, 0.08, 0.2), 0.07 * ps, 0.07 * ps, M.white).flag(D | PF.GLOW | PF.NO_OUTLINE).min(0.5);
  }
  // ── Smear behind a slamming tip (one redraw) ──
  const tipNow = st.state === 'slam' && st.armed < 0;
  const fresh = mem.tipValid && st.time - mem.tipT < 0.2 && st.time > mem.tipT;
  if (tipNow && fresh) {
    f.layer(0.02 * s, PART.NONE, 0.08, 0.3);
    for (let ti = 0; ti < R.tents.length; ti++) {
      const cur = f.at(R.tents[ti].tip, 0, 0, 0);
      const a = f.project(mem.tipPrev[ti], P0);
      const b = f.project(cur, P1);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 6) continue;
      f.cone(cur, f.mix(cur, mem.tipPrev[ti], 0.7), 0.3 * s, 0.08 * s, M.tent).flag(PF.FLAT).tone(0.12).min(0.5);
    }
  }
  for (let ti = 0; ti < R.tents.length; ti++) R.tents[ti].tip.getWorldPosition(mem.tipPrev[ti]);
  mem.tipT = st.time;
  mem.tipValid = true;

  // Hit squash (≤ 7 %).
  if (st.flinch > 0.05 && !dying) {
    const q = st.flinch * st.flinch;
    f.warp(f.at(bd, 0, 0, 0), 1 + 0.035 * q, 1 - 0.03 * q);
  }
  void hash;
  return true;
}
