import * as THREE from 'three';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat, PAT, hexToOklch, makeRamp, material, oklchToHex } from '../../gameplay/pixel/materials';
import { HAND, STAMP, dir8 } from '../../gameplay/pixel/stamps';

/**
 * ─── PixelCast: the DEAD ZONE bosses after the Butcher ──────────────────────
 *
 * Painters built from the bosses' live rigs, like the rest of the cast: every
 * shape is placed on a joint / mesh the hitboxes hang from, so the eye you
 * shoot is drawn where the eye's hit sphere is, in any pose.
 *
 *   PATIENT ZERO (z2)  a mound of fused patients sagging into a pool of flesh,
 *              in the 3D's muted dark meat reds: a lumpy base mound (tumours
 *              and knobs breaking the outline, a sagging roll with a crease
 *              over the pool, ooze and strands melting the contact edge into
 *              the pool) with the belly and chest hanging over it (their own
 *              layer: a contour and a cast shadow where they overhang), raw wet
 *              lumps with blister clusters, bone spikes breaking through, a
 *              stitched surgical scar, a torn hospital-gown scrap, veins that
 *              burn orange in the frenzy; the open chest (a wet cavity, the
 *              glowing heart — weak once the rib cage cracks open) behind two
 *              hinged halves of curved, tapering bone ribs (armour) that swing
 *              with the rig; a bald grey patient's head with lumps and a scalp
 *              vein breaking the dome, a glowing maw, tooth rows and a gaping
 *              jaw (bile-green in the spit windup); eight glowing eyes seated in
 *              flesh — the five on the head in one fleshy brow mass, the three
 *              on the body in lid rims — an amber ball, a hot centre, a slit
 *              pupil tracking you (burst eyes are stitched-shut lids, dead ones
 *              go dull); four tentacles traced along the live Bézier tubes
 *              (bulges travelling down them) ending in bone claws and a pustule
 *              that glows and pulses when the slam is armed, a glowing charge
 *              vein down the armed one and a smear behind the slam; fused
 *              victims (sunk heads with glowing eyes, reaching arms). Hits flash
 *              the part they hit on the next redraw (latched: a 0.06 s flash is
 *              never missed at 12 redraws/s); the flesh greys as it dies. The
 *              pool of flesh and the IV bags stay live 3D (floor / scenery: the
 *              sprite sinks into them). Gameplay parts are emitted first and the
 *              cosmetic details last (a full primitive table drops a vein, not
 *              an eye), and the boss opts into the wide paint class so its
 *              roaring tentacle spread keeps 1 texel per pixel.
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

/** The critical-hit flash colour (`Kit.glow(0xff3020, 1.2)`), linear like the material's. */
const FLASH_RED = new THREE.Color(0xff3020).multiplyScalar(1.2);

/**
 * Hit flash a mesh is showing (the bosses swap the hit part to a white / red glow): 0 none,
 * 1 white, 2 red. Matched exactly: an over-bright glow of the part's own (the heart's red,
 * the enraged core's white-hot) is not a flash.
 */
function flashOf(m: THREE.Mesh): number {
  const mat = m.material as THREE.MeshBasicMaterial;
  if (!mat || mat.isMeshBasicMaterial !== true || !mat.color) return 0;
  const c = mat.color;
  if (c.r > 1.05 && c.r === c.g && c.g === c.b) return 1;
  if (Math.abs(c.r - FLASH_RED.r) < 1e-3 && Math.abs(c.g - FLASH_RED.g) < 1e-3 && Math.abs(c.b - FLASH_RED.b) < 1e-3) return 2;
  return 0;
}

/** `o` is `anc` or hangs below it. */
function bossZUnder(o: THREE.Object3D | null, anc: THREE.Object3D): boolean {
  for (let p = o; p; p = p.parent) if (p === anc) return true;
  return false;
}

/**
 * Dead skin like `Mat.deadSkin` (rot patches in a sicker green, purple bruises,
 * ROT pattern) with its own chroma / highlight: the bosses keep their 3D's
 * muted olive instead of the walkers' punchier palette.
 */
function bossZDeadSkin(key: string, hex: number, rot: number, sat: number, light: number): number {
  return material(key, () => {
    const [L, C, h] = hexToOklch(hex);
    const toward = (t: number, k: number) => {
      const d = ((t - h + 540) % 360) - 180;
      return (h + d * k + 360) % 360;
    };
    return {
      ramp: makeRamp(hex, { light, sat }),
      pattern: PAT.ROT,
      scale: 0.07,
      strength: rot,
      secondary: Mat.flat(oklchToHex(L * 0.74, Math.max(C, 0.05) * 1.25, toward(110, 0.6)), `${key}rot`),
      tertiary: Mat.flat(oklchToHex(L * 0.62, Math.max(C, 0.04) * 1.1, toward(330, 0.7)), `${key}bruise`),
      glow: false,
      dither: 0.12,
      spec: 0.05,
    };
  });
}

/**
 * A motion smear's tail end: where a fast part (a hand, a slamming tip) was at
 * the last redraw, carried along by the body's own move since then (the rig
 * riding the truck, a leap, the emergence don't smear), clamped to 1.2 m and
 * 20 texels. Returns null when the move is too small to smear.
 */
function bossZSmearTail(f: PixelFigure, cur: THREE.Vector3, prev: THREE.Vector3, bodyNow: THREE.Vector3, bodyPrev: THREE.Vector3, minPx: number): THREE.Vector3 | null {
  const tail = f.vec().copy(prev).add(bodyNow).sub(bodyPrev);
  const a = f.project(tail, P0);
  const b = f.project(cur, P1);
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  if (px < minPx) return null;
  // Streak = 70 % of the way back; at most 1.2 m and 20 texels long.
  let k = 0.7;
  const m = cur.distanceTo(tail);
  if (m * k > 1.2) k = 1.2 / m;
  const lim = 20 * f.kHint;
  if (px * k > lim) k = lim / px;
  return tail.sub(cur).multiplyScalar(k).add(cur);
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
  /** Bézier control points P0..P3 in the BODY frame (and the tube's mesh: a hit on it flashes the tentacle). */
  tube: { readonly P: readonly THREE.Vector3[]; readonly mesh?: THREE.Object3D };
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
  /** Boss age when the last hit flash began (−9 = none yet). */
  flashAt: number;
  /** What that flash lit: the mesh hit (an eye, a pustule, the heart, a tube, flesh). */
  flashObj: THREE.Object3D | null;
  /** It was a critical (weak-point) hit: red, not white. */
  flashCrit: boolean;
}

export function pzPose(): PZPose {
  return { time: 0, state: 'entry', stateTime: 0, phase: 0, heartExposed: false, armed: -1, spit: 0, flinch: 0, flashAt: -9, flashObj: null, flashCrit: false };
}

const PZM = {
  ready: false,
  flesh: 0,
  fleshGrey: 0,
  tent: 0,
  raw: 0,
  skin: 0,
  face: 0,
  faceGrey: 0,
  lidRim: 0,
  bone: 0,
  claw: 0,
  cavity: 0,
  heart: 0,
  heartCore: 0,
  white: 0,
  red: 0,
  eye: 0,
  eyeF: 0,
  eyeHot: 0,
  eyeHotF: 0,
  bloodshot: 0,
  pupil: 0,
  lid: 0,
  seam: 0,
  deadEye: 0,
  maw: 0,
  mawDim: 0,
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
  gown: 0,
  nostril: 0,
  drool: 0,
};

function pzm() {
  if (!PZM.ready) {
    const M = PZM;
    M.ready = true;
    // Muted dark meat (the 3D's FLESH 0x8a4038 / RAW 0x9a2a26), matte: rot blotches in a
    // darker brown-red, purple bruising, dark veins (ROT pattern).
    M.flesh = material('pz|flesh', () => ({
      ramp: makeRamp(0xa2382c, { light: 0.44, sat: 1.0 }),
      pattern: PAT.MEAT,
      scale: 0.32,
      strength: 0.72,
      secondary: Mat.flat(0x7a2a22, 'pzrot'),
      tertiary: Mat.flat(0x5a2032, 'pzbruise'),
      glow: false,
      dither: 0.06,
      spec: 0.08,
    }));
    // Dying flesh: grey, desaturated, a sallow rot.
    M.fleshGrey = material('pz|fleshg', () => ({
      ramp: makeRamp(0x8e5c54, { light: 0.42, sat: 0.7 }),
      pattern: PAT.MEAT,
      scale: 0.32,
      strength: 0.8,
      secondary: Mat.flat(0x6a4a44, 'pzrotg'),
      tertiary: Mat.flat(0x4e3c48, 'pzbruiseg'),
      glow: false,
      dither: 0.06,
      spec: 0.03,
    }));
    // Tentacles: pebbled hide with soft seams (ringed, muscular), the 3D's flesh tone.
    M.tent = material('pz|tent', () => ({ ramp: makeRamp(0x9a362c, { light: 0.45, sat: 1.0 }), pattern: PAT.SCALES, scale: 0.36, strength: 0.7, secondary: 0, glow: false, dither: 0.12, spec: 0.1 }));
    // Raw wet lumps (the only bright, wet pinks): darker raw patches, pale blister clusters.
    M.raw = material('pz|raw', () => ({
      ramp: makeRamp(0xa83a32, { light: 0.5, sat: 1.05 }),
      pattern: PAT.MEAT,
      scale: 0.22,
      strength: 0.7,
      secondary: Mat.flat(0x7a2622, 'pzraw2'),
      tertiary: Mat.flat(0xc4766a, 'pzblister'),
      glow: false,
      dither: 0.06,
      spec: 0.32,
    }));
    M.gown = Mat.gown(0x6a8088);
    M.skin = Mat.deadSkin(0xa8948a, 0.7);
    // The patient's face: a greyer dead-patient tone (the 3D's SKIN 0xa8948a).
    M.face = material('pz|face', () => ({
      ramp: makeRamp(0xb89488, { light: 0.5, sat: 1.1, shift: 0.6 }),
      pattern: PAT.MEAT,
      scale: 0.16,
      strength: 0.45,
      secondary: Mat.flat(0x8a5652, 'pzsore'),
      tertiary: Mat.flat(0x6e5262, 'pzbruise2'),
      glow: false,
      dither: 0.06,
      spec: 0.05,
    }));
    M.faceGrey = material('pz|faceg', () => ({ ramp: makeRamp(0xa08c84, { light: 0.45, sat: 0.75, shift: 0.6 }), pattern: PAT.MEAT, scale: 0.16, strength: 0.45, secondary: Mat.flat(0x5e5050, 'pzsoreg'), tertiary: 0, glow: false, dither: 0.12, spec: 0.03 }));
    // Lid rims / the fleshy brow mass the eyes sit in: pink inflamed flesh with a lit top edge.
    M.lidRim = material('pz|lidrim', () => ({ ramp: makeRamp(0xa45a50, { light: 0.55, sat: 1.0 }), pattern: PAT.NONE, scale: 0.1, strength: 0, secondary: 0, glow: false, dither: 0.1, spec: 0.22 }));
    M.drool = Mat.blood(0x8a2a24);
    M.nostril = Mat.mouth(0x2a0a0a);
    M.bone = Mat.bone(0xe6d8b8);
    M.claw = Mat.bone(0xd8c6a2);
    M.cavity = Mat.mouth(0x240505);
    M.heart = Mat.glow(0xff2a2a);
    M.heartCore = Mat.glow(0xffa070);
    M.white = Mat.glow(0xffffff);
    M.red = Mat.glow(0xff3020);
    // Eyes: an amber ball with a hot centre (orange / gold in the frenzy).
    M.eye = Mat.glow(0xeaa21e);
    M.eyeF = Mat.glow(0xff6a16);
    M.eyeHot = Mat.glow(0xffe46a);
    M.eyeHotF = Mat.glow(0xffc23a);
    M.bloodshot = Mat.glow(0xc0301c);
    M.pupil = Mat.flat(0x140806, 'pzpupil');
    // A burst eye: a swollen lid sewn shut (lighter rim, dark seam, pale stitch ticks).
    M.lid = material('pz|lidshut', () => ({ ramp: makeRamp(0x8e4c46, { light: 0.55, sat: 1.0 }), pattern: PAT.NONE, scale: 0.1, strength: 0, secondary: 0, glow: false, dither: 0.1, spec: 0.15 }));
    M.seam = Mat.flat(0x1a0404, 'pzseam');
    M.deadEye = Mat.gloss(0x3a3020);
    M.maw = Mat.glow(0xff6a20);
    M.mawDim = Mat.glow(0xc44a18);
    M.mawBile = Mat.glow(0xb8ff3a);
    M.bile = Mat.glow(0xa6ff2a);
    M.gullet = Mat.mouth(0x3a0606);
    M.teeth = Mat.teeth(0xe8dcc0);
    M.vein = Mat.flat(0x3e1828, 'pzvein');
    M.veinHot = Mat.glow(0xff5a24);
    M.scar = Mat.flat(0x3a0a0e, 'pzscar');
    M.stitch = Mat.flat(0xd8cfa8, 'pzstitch');
    M.sore = Mat.gore(0x9a3418);
    M.pus = Mat.gore(0x8e2e1e);
    M.pusHot = Mat.glow(0xffa030);
    M.vEye = Mat.glow(0xffb040);
    M.vMouth = Mat.mouth(0x1a0404);
  }
  return PZM;
}

/** Fused victims / reaching arms found in the flesh meshes, and per-rig memory (smears, latched flashes). */
interface PZMem {
  victims: THREE.Object3D[];
  arms: THREE.Object3D[];
  eyeR: number[];
  tipPrev: THREE.Vector3[];
  bodyPrev: THREE.Vector3;
  bodyNow: THREE.Vector3;
  tipT: number;
  tipValid: boolean;
  /** Boss age of the previous redraw (a flash that began since then is painted now). */
  paintT: number;
}
const pzMem = new WeakMap<PZRig, PZMem>();

function boxIs(m: THREE.Mesh, w: number, h: number): boolean {
  const p = (m.geometry as THREE.BoxGeometry).parameters as { width?: number; height?: number } | undefined;
  return !!p && Math.abs((p.width ?? 0) - w) < 1e-4 && Math.abs((p.height ?? 0) - h) < 1e-4;
}

function pzInit(R: PZRig): PZMem {
  let m = pzMem.get(R);
  if (m) return m;
  m = { victims: [], arms: [], eyeR: [], tipPrev: R.tents.map(() => new THREE.Vector3()), bodyPrev: new THREE.Vector3(), bodyNow: new THREE.Vector3(), tipT: 0, tipValid: false, paintT: -1 };
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
  // The pool of flesh and the IV bags are floor / scenery: they stay live 3D (SpriteArt reads the
  // flag right after this paint, before it hides the model: the first SPRITES frame keeps them too).
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

export function paintPatientZero(f: PixelFigure, R: PZRig, st: PZPose): boolean {
  if (!R.body.visible) return false;
  f.maxTexels = 240;
  // Wide paint class: the roaring tentacle spread (≈ 300 texels) keeps 1 texel per pixel.
  f.maxWide = 512;
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
  // Dying flesh darkens (a notch by 2 s) and greys out as it collapses.
  const rot = dying ? -Math.min(0.24, st.stateTime * 0.12) : 0;
  const grey = dying && st.stateTime > 1.1;
  const fleshM = grey ? M.fleshGrey : M.flesh;
  const rawM = grey ? M.fleshGrey : M.raw;
  const faceM = grey ? M.faceGrey : M.face;
  const tentM = grey ? M.fleshGrey : M.tent;

  // ── Hit flash, latched: a flash that began since the last redraw is painted now
  // (it lasts 0.06 s, redraws come every 0.083 s), on the part it hit ──
  const latched = st.flashAt > mem.paintT && st.flashAt <= t + 1e-6 && st.flashObj !== null;
  const fObj = latched ? st.flashObj : null;
  const fKind = st.flashCrit ? 2 : 1;
  let bodyFlash = 0;
  let headFlash = 0;
  let tentFlash = -1;
  if (fObj) {
    let special = fObj === R.heart;
    for (let i = 0; i < R.eyes.length && !special; i++) special = R.eyes[i].mesh === fObj;
    for (let i = 0; i < R.tents.length && !special; i++) {
      if (R.tents[i].pustule === fObj) special = true;
      else if (R.tents[i].tube.mesh === fObj) {
        tentFlash = i;
        special = true;
      }
    }
    if (!special) {
      if (bossZUnder(fObj, R.head)) headFlash = 0.45;
      else bodyFlash = 0.4;
    }
  }
  const flashFor = (m: THREE.Mesh) => flashOf(m) || (fObj === m ? fKind : 0);

  // ═══ Gameplay parts first (a full primitive table drops cosmetics, never these) ═══

  // ── Eyes (weak): the head's five seated in one fleshy brow mass, the body's three in
  // lid rims; an amber ball (drawn a little inside the eye, so flesh always shows between
  // neighbours). (Hot centres, slit pupils and glints come with the cosmetics.) ──
  const h = R.head;
  const sh = scaleOf(h);
  f.layer(0.02 * s, PART.WEAK, rot, -0.1 * s);
  const eyesL = f.layerIndex;
  const headOn = f.facing(f.at(h, 0, 1.0, 1.0), f.dir(h, 0, 0, 1));
  if (headOn > -0.5) f.ellipsoid(h, 0, 1.08, 0.56, 0.74, 0.58, 0.3, faceM).tone(0.05).k(0.06 * sh).flag(PF.PLANAR).part(PART.TORSO);
  for (let i = 0; i < R.eyes.length; i++) {
    const e = R.eyes[i];
    const hold = e.mesh.parent;
    if (!hold) continue;
    const r = mem.eyeR[i] ?? 0.2;
    const es = scaleOf(hold);
    const c = f.at(hold, 0, 0, 0);
    // (Eyes turned away are still drawn: their hit spheres poke out of the flesh; depth hides the rest.)
    if (f.facing(c, f.dir(hold, 0, 0, 1)) < -0.6) continue;
    const onBody = hold.parent !== h;
    if (e.lid.visible) {
      // Burst: a swollen lid sewn shut (flesh: its hit sphere is gone).
      f.ellipsoid(e.lid, 0, 0, 0, r * 1.05, r * 1.05, r * 0.6, M.lid).part(PART.TORSO);
      continue;
    }
    if (!e.mesh.visible) continue;
    if (onBody) f.ellipsoid(hold, 0, 0, -0.25 * r, r * 1.25, r * 1.25, r * 0.55, M.lidRim).k(0.03 * es);
    const fl = flashFor(e.mesh);
    const dead = !(e.mesh.material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    const ball = fl === 1 ? M.white : fl === 2 ? M.red : dead ? M.deadEye : frenzy ? M.eyeF : M.eye;
    f.ball(c, r * 0.88 * es, ball).flag(dead ? 0 : PF.GLOW).z(-0.03).k(0.001);
  }

  // ── Heart (armour behind the ribs; weak once exposed): a glowing, beating bulb ──
  if (R.heart.visible) {
    f.layer(0.03 * s, st.heartExposed ? PART.WEAK : PART.ARMOR, 0, 0);
    const hf = flashFor(R.heart);
    const hm = hf === 1 ? M.white : hf === 2 ? M.red : M.heart;
    f.ellipsoid(R.heart, 0, 0, 0, 0.44, 0.44, 0.42, hm).flag(PF.GLOW);
    const hs = scaleOf(R.heart);
    if (!hf) {
      f.decal(f.at(R.heart, 0.02, -0.02, 0.4), f.at(R.heart, 0.02, -0.02, 0.4), (0.18 + 0.1 * beat) * hs, (0.18 + 0.1 * beat) * hs, M.heartCore).flag(D | PF.GLOW);
      f.decal(f.at(R.heart, -0.17, 0.18, 0.4), f.at(R.heart, -0.13, 0.2, 0.4), 0.055 * hs, 0.04 * hs, M.white).flag(D | PF.GLOW | PF.NO_OUTLINE).min(0.5);
    }
  }

  // ── Rib cage (armour): two hinged halves of curved bone ribs and the sternum. Each rib
  // arcs down toward the flank and tapers from a knob at the sternum to a thin tip ──
  f.layer(0.01 * s, PART.ARMOR, rot, -0.12 * s);
  for (let i = 0; i < R.ribs.length; i++) {
    const rb = R.ribs[i];
    if (!rb.visible) continue;
    const rs = scaleOf(rb);
    const j = i % 5;
    if (j === 4) {
      // Sternum half: a knobbly bar.
      f.cone(f.at(rb, 0, 0.7, 0), f.at(rb, 0, -0.7, 0), 0.085 * rs, 0.07 * rs, M.bone).u(0.4);
      continue;
    }
    // Torus quarter (local XY plane, radius 1.25; local +Z points down): front (sternum)
    // end → the middle of the arc (the two middle ribs) → the flank end, which droops a little
    // while the cage is shut.
    const r0 = 1.25;
    const a2 = Math.PI / 2 + 0.06;
    const pf = f.at(rb, r0 * Math.cos(a2), r0 * Math.sin(a2), 0);
    const pm = f.at(rb, r0 * 0.7071, r0 * 0.7071, 0);
    const pl = f.at(rb, r0, 0, st.heartExposed ? 0 : 0.16 + j * 0.03);
    if (j === 1 || j === 2) {
      f.cone(pf, pm, 0.11 * rs, 0.09 * rs, M.bone).u(i * 0.3);
      f.cone(pm, pl, 0.09 * rs, 0.06 * rs, M.bone).u(i * 0.3 + 0.9);
    } else f.cone(pf, pl, 0.105 * rs, 0.06 * rs, M.bone).u(i * 0.3);
  }

  // ── Tentacles (tail): traced along the live tubes, bulges travelling down them ──
  const bodyMid = f.depth(f.at(tor, 0, 1, 0));
  for (let ti = 0; ti < R.tents.length; ti++) {
    const tn = R.tents[ti];
    const P = tn.tube.P;
    const armed = st.armed === ti;
    const far = f.depth(bez(f, bd, P, 0.6)) > bodyMid + 0.4;
    f.layer(0.06 * s, PART.TAIL, (far ? -0.1 : 0) + (tentFlash === ti ? 0.45 : 0) + rot);
    const r0 = tn.upper ? 0.5 : 0.42;
    const r1 = 0.11;
    const wave = armed ? 2 : 1;
    const thick = dying ? 0.9 : 1;
    // Segments along the curve: more when it is stretched (the slam reaches the player).
    const len = P[0].distanceTo(P[1]) + P[1].distanceTo(P[2]) + P[2].distanceTo(P[3]);
    const nSeg = Math.min(9, Math.max(5, Math.ceil(len / 1.5)));
    let prev = bez(f, bd, P, 0);
    let rPrev = r0 * thick * (1 + wave * 0.16 * Math.sin(-t * 4)) * s;
    let u = 0;
    for (let k = 1; k <= nSeg; k++) {
      const q = k / nSeg;
      const p = bez(f, bd, P, q);
      const r = (r0 + (r1 - r0) * Math.pow(q, 0.85)) * thick * (1 + wave * 0.16 * Math.sin(q * 10 - t * 4)) * s;
      f.cone(prev, p, rPrev, r, tentM).u(u).k(0.05 * s).seed(ti * 7 + k).flag(PF.PLANAR);
      u += prev.distanceTo(p);
      prev = p;
      rPrev = r;
    }
    // Tip: the bone claw (three prongs when armed; else two up top, one below) and the pustule.
    const tip = tn.tip;
    const ts = scaleOf(tip);
    f.cone(f.at(tip, 0, 0.02, 0), f.at(tip, 0, 0.6, 0), 0.13 * ts, 0.012 * ts, M.claw).part(PART.NONE).k(0.02 * ts).min(0.5);
    for (let sd = -1; sd <= 1; sd += 2) {
      if (!armed && (sd !== tn.side || !tn.upper)) continue;
      coneDir(0, sd * -0.8, CD);
      const bx = sd * 0.12;
      f.cone(f.at(tip, bx - CD.x * 0.17, 0.18 - CD.y * 0.17, 0), f.at(tip, bx + CD.x * 0.18, 0.18 + CD.y * 0.18, 0), 0.08 * ts, 0.01 * ts, M.claw).part(PART.NONE).k(0.02 * ts).min(0.5);
    }
    const pf = flashFor(tn.pustule);
    const pm = pf === 1 ? M.white : pf === 2 ? M.red : armed ? M.pusHot : M.pus;
    const ps = scaleOf(tn.pustule);
    f.ball(f.at(tn.pustule, 0, 0, 0), 0.24 * ps, pm).flag(armed || pf ? PF.GLOW : 0).part(armed ? PART.WEAK : PART.TAIL).z(-0.03).k(0.03 * ps);
    // The armed tentacle: a glowing charge vein running down to the tip (a pulse travelling down it).
    if (armed) {
      const pulse = (t * 2.2) % 1;
      f.decal(bez(f, bd, P, 0.15), bez(f, bd, P, 0.58), 0.07 * s, 0.055 * s, pulse < 0.5 ? M.pusHot : M.veinHot).flag(D | PF.GLOW).min(0.5);
      f.decal(bez(f, bd, P, 0.56), bez(f, bd, P, 1.0), 0.055 * s, 0.045 * s, pulse >= 0.5 ? M.pusHot : M.veinHot).flag(D | PF.GLOW).min(0.5);
    } else if (frenzy && tn.upper) {
      f.decal(bez(f, bd, P, 0.2), bez(f, bd, P, 0.62), 0.05 * s, 0.03 * s, veinM).flag(D).min(0.5);
    }
  }

  // ── Head: a bald, grey patient's skull with lumps and a raised scalp vein breaking the
  // dome, the throat, the heavy jaw, the glowing maw between tooth rows, the lips, a nose ──
  const jw = R.jaw;
  f.layer(0.16 * sh, PART.TORSO, rot + headFlash);
  const headL = f.layerIndex;
  f.ellipsoid(h, 0, 0.72, -0.06, 0.98, 0.95, 0.9, faceM).k(0.12 * sh).u(0.2).seed(41).flag(PF.PLANAR);
  f.ellipsoid(h, -0.62, 1.0, -0.18, 0.46, 0.44, 0.46, rawM).k(0.08 * sh).seed(43).flag(PF.PLANAR);
  f.ellipsoid(h, 0.58, 1.2, -0.3, 0.38, 0.36, 0.38, faceM).tone(-0.14).k(0.08 * sh).flag(PF.PLANAR);
  f.cone(f.at(h, -0.42, 1.55, 0.36), f.at(h, 0.12, 1.66, 0.12), 0.055 * sh, 0.04 * sh, rawM).tone(-0.18).k(0.015 * sh).min(0.6);
  f.cone(f.at(h, 0, 0.62, 0.9), f.at(h, 0, 0.44, 1.0), 0.09 * sh, 0.12 * sh, faceM).k(0.06 * sh).z(-0.06);
  // The throat behind the mouth (fills the gap as the jaw drops).
  f.ellipsoid(h, 0, 0.05, 0.45, 0.44, 0.36, 0.36, M.gullet).k(0.06 * sh);
  // Jaw: a heavy slab hanging from the hinge, its front edge the chin.
  f.coneE(f.at(jw, -0.3, -0.12, 0.4), f.at(jw, 0.3, -0.12, 0.4), f.dir(jw, 0, 1, 0), f.dir(jw, 0, 0, 1), 0.13 * sh, 0.36 * sh, 0.13 * sh, 0.36 * sh, faceM).k(0.06 * sh);
  // Mouth: the maw (a glowing throat between the jaws — bile-green in the spit windup; it
  // keeps glowing as it dies, dimmer, like the 3D), tooth rows (TEETH zigzags: the lips
  // in front hide their roots), then the lips.
  {
    const up = f.at(h, 0, 0.3, 0.88);
    const lo = f.at(jw, 0, 0.0, 0.74);
    const mc = f.mix(up, lo, 0.5);
    const gap = Math.max(0.07 * sh, up.distanceTo(lo) * 0.5);
    const ax = f.dir(h, 1, 0, 0);
    const mawM = st.spit > 0.35 ? M.mawBile : dying && st.stateTime > 2 ? M.mawDim : M.maw;
    // (Biased over the throat: the gullet's bulge would hide it with the jaw nearly shut.)
    f.cone(f.add(mc, ax, -0.34 * sh), f.add(mc, ax, 0.34 * sh), gap, gap, mawM).flag(PF.FLAT | PF.GLOW).k(0.02 * sh).z(-0.07);
  }
  f.cone(f.at(h, -0.38, 0.31, 0.9), f.at(h, 0.38, 0.31, 0.9), 0.065 * sh, 0.065 * sh, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.12).seed(4);
  f.cone(f.at(jw, -0.35, 0.0, 0.76), f.at(jw, 0.35, 0.0, 0.76), 0.06 * sh, 0.06 * sh, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.12).seed(9);
  f.cone(f.at(h, -0.46, 0.41, 0.85), f.at(h, 0.46, 0.41, 0.85), 0.08 * sh, 0.08 * sh, faceM).k(0.04 * sh).z(-0.16);
  f.cone(f.at(jw, -0.4, -0.1, 0.78), f.at(jw, 0.4, -0.1, 0.78), 0.075 * sh, 0.075 * sh, faceM).k(0.04 * sh).z(-0.16);

  // ── The upper body hanging over the base mound (its own layer, pulled a little
  // forward: a contour and a cast-shadow step where the belly and chest overhang) ──
  f.layer(0.3 * s, PART.TORSO, rot + bodyFlash, -0.1 * s);
  const upperL = f.layerIndex;
  f.ellipsoid(tor, 0, 0.8, 0.1, 1.72, 1.5, 1.42, fleshM).rag(0.04 * s).u(1.1).seed(9).flag(PF.PLANAR);
  f.ellipsoid(tor, 0.72, 0.6, 0.95, 0.62, 0.62, 0.62, rawM).k(0.16 * s).seed(11).flag(PF.PLANAR);
  f.ellipsoid(ch, 0, 0.12, -0.25, 1.9, 1.42, 1.2, fleshM).k(0.36 * s).u(2.3).seed(13).flag(PF.PLANAR);
  f.ellipsoid(ch, 1.55, 0.55, -0.35, 0.92, 0.74, 0.92, rawM).k(0.24 * s).seed(15).flag(PF.PLANAR);
  f.ellipsoid(ch, -1.55, 0.5, -0.35, 0.86, 0.72, 0.9, fleshM).tone(-0.08).k(0.24 * s).seed(16).flag(PF.PLANAR);
  const nk = h.parent ?? ch;
  f.cone(f.at(nk, 0, -0.25, -0.05), f.at(nk, 0, 0.62, 0.02), 0.74 * s, 0.56 * s, fleshM).k(0.3 * s).u(3.1).flag(PF.PLANAR);
  const front = f.facing(f.at(tor, 0, 0.8, 1.4), f.dir(tor, 0, 0, 1));
  if (front > -0.05) {
    // Torn chest cavity: a raw rim, the dark wet hole the heart sits in.
    f.decal(f.at(ch, 0, 0.42, 0.95), f.at(ch, 0, -0.55, 0.95), 0.92 * s, 0.86 * s, rawM).flag(D).rag(0.07 * s, PF.SPIKY).seed(21);
    f.decal(f.at(ch, 0, 0.32, 0.95), f.at(ch, 0, -0.45, 0.95), 0.74 * s, 0.7 * s, M.cavity).flag(D).rag(0.05 * s, PF.SPIKY).seed(22);
  }

  // ── The base mound: lumpy (a small blend radius keeps the lumps' notches), tumours and
  // knobs breaking the outline, a sagging roll over the pool, ooze and a strand melting
  // the contact edge into the pool ──
  f.layer(0.14 * s, PART.TORSO, rot + bodyFlash);
  const baseL = f.layerIndex;
  f.ellipsoid(bd, 0, 0.95, 0, 2.7, 1.5, 2.45, fleshM).rag(0.06 * s).u(0.3).seed(3).flag(PF.PLANAR);
  f.ellipsoid(bd, 1.25, 0.8, 1.15, 1.3, 0.78, 1.28, rawM).k(0.18 * s).seed(5).flag(PF.PLANAR);
  f.ellipsoid(bd, -1.45, 0.72, 0.95, 1.12, 0.64, 1.12, fleshM).tone(-0.25).k(0.18 * s).seed(7).flag(PF.PLANAR);
  // The sagging roll overhanging the pool.
  f.coneE(f.at(bd, -1.7, 0.42, 1.62), f.at(bd, 1.55, 0.36, 1.72), f.dir(bd, 0, 1, 0), f.dir(bd, 0, 0, 1), 0.36 * s, 0.55 * s, 0.32 * s, 0.55 * s, fleshM).k(0.08 * s).u(0.6).flag(PF.PLANAR);
  // Tumours and knobs (different on each side).
  f.ball(f.at(bd, -2.45, 1.35, 0.2), 0.52 * s, fleshM).k(0.12 * s).flag(PF.PLANAR);
  f.ball(f.at(bd, 2.5, 1.05, 0.55), 0.36 * s, rawM).k(0.08 * s);
  f.ball(f.at(bd, 2.05, 1.95, 0.3), 0.3 * s, fleshM).tone(-0.08).k(0.08 * s);
  // Ooze spreading on the pool, a strand of flesh sagging into it.
  f.ellipsoid(bd, -0.85, 0.2, 2.15, 0.62, 0.14, 0.42, rawM).k(0.16 * s).tone(-0.1);
  f.cone(f.at(bd, -0.25, 0.62, 2.0), f.at(bd, -0.28, 0.02, 2.14), 0.08 * s, 0.045 * s, fleshM).k(0.03 * s).tone(-0.06);

  // ── Bone spikes breaking through the shoulders, the spine ridge from behind ──
  f.layer(0.03 * s, PART.TORSO, rot);
  for (let sd = 1; sd >= -1; sd -= 2) {
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? 1.75 : 1.3;
      const y = i === 0 ? 1.1 : 1.25;
      const z = i === 0 ? -0.5 : -0.8;
      const rz = i === 0 ? -0.55 : -0.3;
      const rx = i === 0 ? -0.2 : -0.45;
      const l = i === 0 ? 1.1 : 0.9;
      coneDir(rx, sd * rz, CD);
      const hl = l * 0.5;
      f.cone(f.at(ch, sd * x - CD.x * hl, y - CD.y * hl, z - CD.z * hl), f.at(ch, sd * x + CD.x * hl, y + CD.y * hl, z + CD.z * hl), 0.14 * s, 0.012 * s, M.bone).min(0.5).u(i);
    }
  }
  for (let i = 0; i < (front > 0.3 ? 0 : 2); i++) {
    const hl = (0.9 - i * 0.08) * 0.5;
    coneDir(-0.9, 0, CD);
    const y = 3.4 - i * 0.6;
    const z = -1.25 + i * 0.05;
    f.cone(f.at(tor, -CD.x * hl, y - CD.y * hl, z - CD.z * hl), f.at(tor, CD.x * hl, y + CD.y * hl, z + CD.z * hl), (0.14 - i * 0.012) * s, 0.01 * s, M.bone).min(0.5);
  }

  // ── Fused victims: sunk heads with glowing eyes, reaching arms (one thick stroke each,
  // a clenched hand at the end) ──
  f.layer(0.03 * s, PART.TORSO, rot - 0.04 + bodyFlash);
  for (let i = 0; i < mem.victims.length; i++) {
    const v = mem.victims[i];
    const vs = scaleOf(v);
    f.ellipsoid(v, 0, 0.01, 0, 0.14, 0.17, 0.15, M.skin).k(0.05 * vs);
    if (f.facing(f.at(v, 0, 0, 0.14), f.dir(v, 0, 0, 1)) > 0.05) {
      f.decal(f.at(v, -0.07, 0.05, 0.14), f.at(v, 0.07, 0.05, 0.14), 0.026 * vs, 0.026 * vs, dying ? M.vMouth : M.vEye).flag(D | PF.GLOW).min(0.5);
    }
  }
  for (let i = 0; i < mem.arms.length; i++) {
    const a = mem.arms[i];
    const as = scaleOf(a);
    // One thick forearm swelling out of the flesh, a clawed hand (it twitches — drawn only).
    const tw = Math.sin(t * 3.1 + i * 2.3) * 0.04;
    const wr = f.at(a, tw, 0.95, 0.24);
    f.cone(f.at(a, 0, 0.0, 0), wr, 0.14 * as, 0.09 * as, M.skin).k(0.06 * as).min(1);
    const len = f.px(wr, 0.2 * as) / f.kHint;
    if (len >= 3 && len < 11) {
      const e0 = f.project(f.at(a, 0, 0.55, 0.05), P0);
      const w1 = f.project(wr, P1);
      f.stamp(wr, (0.2 * as) / 5, STAMP.hand[HAND.CLAW][0][dir8(w1.x - e0.x, w1.y - e0.y)], M.skin, 0, 0, 0, false, true);
    } else f.ball(f.at(a, tw, 1.02, 0.28), 0.09 * as, M.skin);
  }

  // ═══ Cosmetics (emitted last) ═══

  // Eyes: hot centres, then the slit pupils tracking you (over them), the big eye's glint and a
  // bloodshot stroke.
  f.reopen(eyesL);
  for (let i = 0; i < R.eyes.length; i++) {
    const e = R.eyes[i];
    const hold = e.mesh.parent;
    const r = mem.eyeR[i] ?? 0.2;
    if (!hold || r < 0.19 || e.lid.visible || !e.mesh.visible) continue;
    if (flashFor(e.mesh) || !(e.mesh.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) continue;
    const es = scaleOf(hold);
    const c = f.at(hold, 0, 0, 0);
    if (f.facing(c, f.dir(hold, 0, 0, 1)) < -0.6) continue;
    if (r >= 0.2) {
      const hc = f.mix(c, f.at(e.pupil, 0, 0, r * 0.92), 0.62);
      f.decal(hc, hc, r * 0.5 * es, r * 0.5 * es, frenzy ? M.eyeHotF : M.eyeHot).flag(D | PF.GLOW);
    }
    f.decal(f.at(e.pupil, 0, r * 0.5, r * 0.92), f.at(e.pupil, 0, -r * 0.5, r * 0.92), r * 0.13 * es, r * 0.13 * es, M.pupil).flag(D | PF.NO_OUTLINE).min(0.5);
    if (r > 0.3) {
      f.decal(f.at(hold, -r * 0.4, r * 0.42, r * 0.8), f.at(hold, -r * 0.4, r * 0.42, r * 0.8), r * 0.12 * es, r * 0.12 * es, M.white).flag(D | PF.GLOW | PF.NO_OUTLINE).min(0.5);
      f.decal(f.at(hold, r * 0.8, -r * 0.34, r * 0.5), f.at(hold, r * 0.36, -r * 0.12, r * 0.9), 0.035 * es, 0.02 * es, M.bloodshot).flag(D | PF.GLOW | PF.NO_OUTLINE).min(0.5);
    }
  }
  // A burst eye's seam and stitch ticks.
  for (let i = 0; i < R.eyes.length; i++) {
    const e = R.eyes[i];
    const hold = e.mesh.parent;
    if (!hold || !e.lid.visible) continue;
    const r = mem.eyeR[i] ?? 0.2;
    const es = scaleOf(hold);
    f.decal(f.at(hold, -r * 0.85, 0.02 * r, r * 0.6), f.at(hold, r * 0.85, -0.02 * r, r * 0.6), r * 0.1 * es, r * 0.1 * es, M.seam).flag(D).min(0.5);
    // (Stitch ticks across the seam: one tooth-row decal, the scar's trick.)
    f.decal(f.at(hold, -r * 0.7, 0.02 * r, r * 0.62), f.at(hold, r * 0.7, -0.02 * r, r * 0.62), r * 0.07 * es, r * 0.07 * es, M.stitch).flag(D | PF.TEETH | PF.NO_OUTLINE).min(0.5).seed(5);
  }

  // Head: the shadowed brow under the eye cluster, sunken cheeks, nostrils, drool / bile.
  const face = f.facing(f.at(h, 0, 0.6, 0.95), f.dir(h, 0, 0, 1));
  if (face > -0.2) {
    f.reopen(headL);
    f.decal(f.at(h, -0.42, 0.6, 0.92), f.at(h, 0.42, 0.6, 0.92), 0.075 * sh, 0.075 * sh, faceM).flag(D | PF.SHADE_ONLY).tone(-0.32);
    for (let sd = -1; sd <= 1; sd += 2) f.decal(f.at(h, sd * 0.52, 0.42, 0.72), f.at(h, sd * 0.46, 0.22, 0.74), 0.09 * sh, 0.06 * sh, faceM).flag(D | PF.SHADE_ONLY).tone(-0.22);
    f.decal(f.at(h, -0.07, 0.45, 1.04), f.at(h, 0.07, 0.45, 1.04), 0.035 * sh, 0.035 * sh, M.nostril).flag(D).min(0.5);
    if (st.spit > 0.2 || st.state === 'spit') {
      // Bile dribbling over the lower teeth.
      const dy = (t * 0.9) % 0.35;
      f.cone(f.at(jw, 0.12, 0.08, 0.8), f.at(jw, 0.13, -0.2 - dy, 0.82), 0.05 * sh, 0.03 * sh, M.bile).flag(PF.GLOW).part(PART.NONE).z(-0.2).min(0.5);
    } else if (!dying) {
      // Blood-tinged drool swinging from the corner of the mouth.
      const sw = Math.sin(t * 2.3) * 0.05;
      const len = 0.25 + 0.12 * Math.sin(t * 0.9);
      f.cone(f.at(jw, 0.3, 0.0, 0.78), f.at(jw, 0.3 + sw, -len, 0.8), 0.035 * sh, 0.02 * sh, M.drool).part(PART.NONE).z(-0.2).min(0.5);
    }
  }

  // Upper body: the stitched surgical scar, veins (orange in the frenzy), the gown scrap,
  // something crawling under the skin, a weeping sore.
  if (front > -0.05) {
    f.reopen(upperL);
    f.decal(f.at(tor, -0.35, 1.35, 1.5), f.at(tor, -0.05, 0.25, 1.48), 0.045 * s, 0.04 * s, M.scar).flag(D).min(0.5);
    f.decal(f.at(tor, -0.35, 1.3, 1.51), f.at(tor, -0.07, 0.3, 1.49), 0.022 * s, 0.022 * s, M.stitch).flag(D | PF.TEETH | PF.NO_OUTLINE).min(0.5).seed(2);
    f.decal(f.at(tor, 0.95, 1.7, 1.3), f.at(tor, 0.55, 0.6, 1.5), 0.04 * s, 0.025 * s, veinM).flag(D).min(0.5);
    f.decal(f.at(ch, -1.1, 0.9, 0.85), f.at(ch, -0.75, -0.2, 1.05), 0.04 * s, 0.025 * s, veinM).flag(D).min(0.5);
    // A scrap of hospital gown stretched over the shoulder hump: tattered hem, a fold.
    f.decal(f.at(ch, 1.15, 1.05, 0.25), f.at(ch, 1.72, 0.2, 0.45), 0.4 * s, 0.3 * s, M.gown).flag(D).rag(0.08 * s, PF.SPIKY | PF.RAG_END).seed(33);
    f.decal(f.at(ch, 1.3, 0.95, 0.4), f.at(ch, 1.58, 0.35, 0.5), 0.03 * s, 0.03 * s, M.gown).flag(D | PF.SHADE_ONLY).tone(-0.35).min(0.5);
    {
      const k = (t * 0.23) % 1;
      const bx = -1.1 + 2.2 * k;
      const by = 0.75 + Math.sin(k * 6.3) * 0.25;
      f.decal(f.at(tor, bx, by, 1.45), f.at(tor, bx + 0.12, by + 0.05, 1.45), 0.2 * s, 0.17 * s, fleshM).flag(D | PF.SHADE_ONLY).tone(0.22).min(0.5);
    }
    f.decal(f.at(tor, -1.0, 0.55, 1.25), f.at(tor, -0.92, 0.48, 1.27), 0.13 * s, 0.11 * s, M.sore).flag(D).rag(0.03 * s, PF.SPIKY).seed(31);
    // Base mound: the crease along the sagging roll's top.
    f.reopen(baseL);
    f.decal(f.at(bd, -1.6, 0.8, 2.0), f.at(bd, 1.45, 0.74, 2.1), 0.03 * s, 0.03 * s, fleshM).flag(D | PF.SHADE_ONLY).tone(-0.45).min(0.5);
  }

  // ── Smear behind a slamming tip (one redraw; relative to the body, clamped) ──
  bd.getWorldPosition(mem.bodyNow);
  const fresh = mem.tipValid && st.time - mem.tipT < 0.2 && st.time > mem.tipT && mem.bodyNow.distanceToSquared(mem.bodyPrev) < 0.25;
  if (st.state === 'slam' && st.armed < 0 && fresh) {
    f.layer(0.02 * s, PART.NONE, 0.08, 0.3);
    for (let ti = 0; ti < R.tents.length; ti++) {
      const cur = f.at(R.tents[ti].tip, 0, 0, 0);
      const tail = bossZSmearTail(f, cur, mem.tipPrev[ti], mem.bodyNow, mem.bodyPrev, 6 * f.kHint);
      if (tail) f.cone(cur, tail, 0.3 * s, 0.08 * s, tentM).flag(PF.FLAT).tone(0.12).min(0.5);
    }
  }
  for (let ti = 0; ti < R.tents.length; ti++) R.tents[ti].tip.getWorldPosition(mem.tipPrev[ti]);
  mem.bodyPrev.copy(mem.bodyNow);
  mem.tipT = st.time;
  mem.tipValid = true;
  mem.paintT = t;

  // Hit squash: a small one about the chest (the rig flinches too; on a sprite this tall a
  // big squash would slide the eyes off their hit spheres).
  if (st.flinch > 0.05 && !dying) {
    const q = st.flinch * st.flinch;
    f.warp(f.at(ch, 0, 0, 0), 1 + 0.015 * q, 1 - 0.012 * q);
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE BEHEMOTH (z3)
// ═══════════════════════════════════════════════════════════════════════════
//
//   A 7.6 m construction worker turned giant, hunched over the bridge deck, in
//   the 3D's olive / brown-grey palette: trunk in horizontal slices (jeans and a
//   work belt with a pouch and a hammer → a torn brown-grey shirt over a bare,
//   rotting belly → a barrel chest in the orange hi-vis vest with silver tape,
//   soaked dark with blood round the wound → traps sloping up into a thick
//   neck), rotting olive skin; the glowing CORE in a torn, charred ribcage (weak:
//   a red glowing band inside the charred edge, the yellow core with a white-hot
//   heart — enraged, it burns in concentric heat bands: red, orange, yellow, a
//   small white centre, pulsing — bone ribs across it, light spilling on the
//   vest); rusted rebar speared through the chest, a bent bar out of the
//   shoulder, a lump of concrete stuck to the back (armour); a square zombie head
//   (weak: a heavy forehead in the shadow of the brim, a brow ridge, cheekbones,
//   ears, a dropped jaw with tooth rows, orange-red slit eyes in dark sockets,
//   the split skull glowing under the brim) in a yellow hard hat (armour: a
//   domed crown with a ridge over the brim's shadowed lip); arms: deltoids, torn sleeve
//   hems, elbow knobs, forearms swelling to the wrist, a steel sheet strapped to
//   the left forearm (armour), huge hands with jointed fingers that twitch;
//   jeans with a ragged cuff over steel-toe work boots; from behind, shoulder
//   blades and a spine groove under the vest. In hand: a car (weak), a concrete
//   slab (weak) or the torn-off lamp post (armour). Fast swings (throws, the
//   club, the swipe, the slam) leave smears, measured against the body.

export interface BehemothRig {
  /** The enemy's root (smear memory resets when it is reparented on death). */
  root?: THREE.Object3D;
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  shL: THREE.Object3D;
  shR: THREE.Object3D;
  elL: THREE.Object3D;
  elR: THREE.Object3D;
  handL: THREE.Object3D;
  handR: THREE.Object3D;
  hipL: THREE.Object3D;
  hipR: THREE.Object3D;
  kneeL: THREE.Object3D;
  kneeR: THREE.Object3D;
  wound: THREE.Object3D;
  core: THREE.Mesh;
  /** Glowing weak meshes (core, rim, eyes, gash): white while a critical hit flashes them. */
  weak: readonly THREE.Mesh[];
  heldCar: THREE.Object3D;
  heldSlab: THREE.Object3D;
  club: THREE.Object3D;
}

export interface BehemothPose {
  time: number;
  /** Behaviour state ('chase', 'throwWind', 'slamWind', 'club', … or 'dying'). */
  bs: string;
  stateTime: number;
  phase: number;
}

export function behemothPose(): BehemothPose {
  return { time: 0, bs: 'intro', stateTime: 0, phase: 0 };
}

const BEM = {
  ready: false,
  skin: 0,
  skinDark: 0,
  face: 0,
  vest: 0,
  tape: 0,
  shirt: 0,
  jeans: 0,
  belt: 0,
  buckle: 0,
  pouch: 0,
  steel: 0,
  handle: 0,
  boot: 0,
  sole: 0,
  rust: 0,
  conc: 0,
  gore: 0,
  soak: 0,
  blood: 0,
  bone: 0,
  core: 0,
  coreOrange: 0,
  coreHot: 0,
  coreHi: 0,
  coreDead: 0,
  rim: 0,
  char: 0,
  eye: 0,
  eyeHot: 0,
  socket: 0,
  gash: 0,
  crack: 0,
  mouth: 0,
  teeth: 0,
  hat: 0,
  hatDark: 0,
  sticker: 0,
  glint: 0,
  guard: 0,
  strap: 0,
  white: 0,
  car: 0,
  glass: 0,
  tyre: 0,
  light: 0,
  pole: 0,
  lamp: 0,
  lampGlow: 0,
};

function bem() {
  if (!BEM.ready) {
    const M = BEM;
    M.ready = true;
    // Olive rot (the 3D's SKIN 0x84a872 / SKIN_DARK 0x5e7a52), not lime: chroma held under the walkers'.
    M.skin = bossZDeadSkin('bz|skin', 0x84a872, 0.6, 0.88, 0.55);
    M.skinDark = bossZDeadSkin('bz|skind', 0x5e7a52, 0.5, 0.88, 0.5);
    M.face = bossZDeadSkin('bz|face', 0x88a674, 0.4, 0.88, 0.55);
    M.vest = Mat.hivis(0xe8661a);
    M.tape = material('bz|tape', () => ({ ramp: makeRamp(0xe0e2d0, { light: 0.75, dark: 0.6 }), pattern: PAT.NONE, scale: 0.1, strength: 0, secondary: 0, glow: false, dither: 0.05, spec: 0.6 }));
    // The 3D's brown-grey shirt (0x5e5e4c) and faded jeans (0x34465e).
    M.shirt = Mat.cloth(0x5e5e4c, { stain: Mat.blood(0x4a0a08) });
    M.jeans = Mat.denim(0x34465e, Mat.blood(0x3a0a08));
    M.belt = Mat.leather(0x2a1e16);
    M.buckle = Mat.gloss(0xb0a070);
    M.pouch = Mat.leather(0x6a4426);
    M.steel = Mat.gloss(0x9a9a9a);
    M.handle = Mat.leather(0x8a5a2a);
    M.boot = Mat.leather(0x3a2a1c);
    M.sole = Mat.flat(0x1a1410, 'bzsole');
    M.rust = Mat.plate(0x8a421e);
    M.conc = Mat.camo(0x8a847c);
    M.gore = Mat.gore(0x6a1410);
    M.soak = Mat.blood(0x3a0806);
    M.blood = Mat.blood(0x5a0a08);
    M.bone = Mat.bone(0xe0d6b8);
    // The core: a yellow bulb with a white-hot heart; enraged, heat bands (red → orange → yellow → white).
    M.core = Mat.glow(0xffd84a);
    M.coreOrange = Mat.glow(0xff8a22);
    M.coreHot = Mat.glow(0xfff4c8);
    M.coreHi = Mat.glow(0xffffff);
    M.coreDead = Mat.gore(0x5a1a0e);
    M.rim = Mat.glow(0xff3a12);
    // The torn, charred edge of the wound (frames the glow).
    M.char = material('bz|char', () => ({ ramp: makeRamp(0x3a120c, { light: 0.35, dark: 0.5, sat: 1.0 }), pattern: PAT.WET, scale: 0.1, strength: 0.4, secondary: 0, glow: false, dither: 0.08, spec: 0.3 }));
    // Eyes: orange-red slits (a different hue from the hat), hotter when enraged.
    M.eye = Mat.glow(0xff5a1a);
    M.eyeHot = Mat.glow(0xffa040);
    M.socket = Mat.mouth(0x140a06);
    M.gash = Mat.glow(0xffa83a);
    M.crack = Mat.mouth(0x2a0604);
    M.mouth = Mat.mouth(0x3a0606);
    M.teeth = Mat.teeth(0xd8cca0);
    // Hard hat: hat-yellow all over the dome (a soft sheen, not a pale grey highlight).
    M.hat = material('bz|hat', () => ({ ramp: makeRamp(0xe8b818, { light: 0.42, sat: 1.15 }), pattern: PAT.NONE, scale: 0.1, strength: 0, secondary: 0, glow: false, dither: 0.06, spec: 0.25 }));
    M.hatDark = material('bz|hatd', () => ({ ramp: makeRamp(0xc0900e, { light: 0.3, sat: 1.05 }), pattern: PAT.NONE, scale: 0.1, strength: 0, secondary: 0, glow: false, dither: 0.06, spec: 0.2 }));
    M.sticker = Mat.flat(0x2a2a2a, 'bzsticker');
    M.glint = Mat.glow(0xfff6d0);
    M.guard = Mat.plate(0x7a7e86);
    M.strap = Mat.leather(0x3a2a1c);
    M.white = Mat.glow(0xffffff);
    M.car = Mat.gloss(0x2a5a8a);
    M.glass = Mat.gloss(0x1a2634);
    M.tyre = Mat.leather(0x18181a);
    M.light = Mat.glow(0xfff2c0);
    M.pole = Mat.plate(0x5a5e66);
    M.lamp = Mat.gloss(0x26262a);
    M.lampGlow = Mat.glow(0xffc070);
  }
  return BEM;
}

interface BeMem {
  /** The held car's box in its own frame (measured once). */
  car: THREE.Box3;
  handPrev: THREE.Vector3[];
  hipPrev: THREE.Vector3;
  hipNow: THREE.Vector3;
  parent: THREE.Object3D | null;
  t: number;
  valid: boolean;
}
const beMem = new WeakMap<BehemothRig, BeMem>();

function beInit(R: BehemothRig): BeMem {
  let m = beMem.get(R);
  if (m) return m;
  const car = new THREE.Box3();
  const inv = new THREE.Matrix4().copy(R.heldCar.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const bb = new THREE.Box3();
  R.heldCar.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!(o as THREE.Mesh).isMesh || !g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    rel.multiplyMatrices(inv, o.matrixWorld);
    bb.copy(g.boundingBox!).applyMatrix4(rel);
    car.union(bb);
  });
  if (car.isEmpty()) car.set(new THREE.Vector3(-2.2, -0.9, -0.9), new THREE.Vector3(2.2, 0.6, 0.9));
  m = { car, handPrev: [new THREE.Vector3(), new THREE.Vector3()], hipPrev: new THREE.Vector3(), hipNow: new THREE.Vector3(), parent: null, t: 0, valid: false };
  beMem.set(R, m);
  return m;
}

/** A horizontal pill across joint `j` (x ± hw at height y, z), vertical half `rv`, depth half `rd`. */
function slice(f: PixelFigure, j: THREE.Object3D, y: number, z: number, hw: number, rv: number, rd: number, s: number, mat: number) {
  const x = Math.max(0.001, hw - rv);
  return f.coneE(f.at(j, -x, y, z), f.at(j, x, y, z), f.dir(j, 0, 1, 0), f.dir(j, 0, 0, 1), rv * s, rd * s, rv * s, rd * s, mat);
}

/** Point along the x axis of a box rotated about z by `a` (Kit box at (x, y, z) in `j`), at offset `d`. */
function alongZ(f: PixelFigure, j: THREE.Object3D, x: number, y: number, z: number, a: number, d: number): THREE.Vector3 {
  return f.at(j, x + Math.cos(a) * d, y + Math.sin(a) * d, z);
}

export function paintBehemoth(f: PixelFigure, R: BehemothRig, st: BehemothPose): boolean {
  if (!R.hips.visible) return false;
  f.maxTexels = 240;
  const M = bem();
  const mem = beInit(R);
  const s = scaleOf(R.hips);
  const t = st.time;
  const dying = st.bs === 'dying';
  const hot = st.phase >= 2 && !dying;
  const flash = flashOf(R.core) !== 0;
  const ch = R.chest;
  const sp = R.spine;
  const hp = R.hips;
  // Dying: the core keeps burning (as the 3D's does all through the topple), guttering —
  // it stutters down to a dull ember now and then.
  const coreOn = !dying || Math.sin(st.stateTime * 31) > -0.55;
  const torsoDepth = f.depth(f.at(sp, 0, 0.6, 0));

  // ── Smears behind fast hands (throws, the club, the swipe, the slam) — measured against the
  // hips (the rig riding the truck, a leap, a placement jump never smear), clamped ──
  {
    const hl = f.at(R.handL, 0, -0.6, 0.1);
    const hr = f.at(R.handR, 0, -0.6, 0.1);
    hp.getWorldPosition(mem.hipNow);
    const par = R.root?.parent ?? null;
    if (par !== mem.parent) {
      mem.parent = par;
      mem.valid = false;
    }
    const swing = st.bs === 'throw' || st.bs === 'club' || st.bs === 'swipe' || st.bs === 'slam';
    const fresh = mem.valid && st.time - mem.t < 0.2 && st.time > mem.t;
    if (fresh && swing && !dying) {
      f.layer(0.03 * s, PART.NONE, 0.06, 0.6);
      for (let i = 0; i < 2; i++) {
        const cur = i === 0 ? hl : hr;
        const tail = bossZSmearTail(f, cur, mem.handPrev[i], mem.hipNow, mem.hipPrev, 7 * f.kHint);
        if (tail) f.cone(cur, tail, 0.45 * s, 0.12 * s, M.skin).flag(PF.FLAT).tone(0.12).min(0.5);
      }
    }
    mem.handPrev[0].copy(hl);
    mem.handPrev[1].copy(hr);
    mem.hipPrev.copy(mem.hipNow);
    mem.t = st.time;
    mem.valid = true;
  }

  // ── Trunk: jeans + belt → shirt over a bare belly → barrel chest in the vest → traps, neck ──
  // (Layers sit a little forward where the giant's boxes are deeper than a round limb: the
  // chest in front of the upper arms, the jaw in front of the neck, the guard over the forearm.)
  f.layer(0.16 * s, PART.TORSO, 0, -0.08 * s);
  slice(f, hp, -0.02, 0, 1.06, 0.46, 0.68, s, M.jeans).k(0.1 * s).u(0);
  slice(f, hp, 0.42, 0, 1.1, 0.12, 0.71, s, M.belt).k(0.03 * s).z(-0.02);
  slice(f, sp, 0.25, 0.04, 1.12, 0.4, 0.8, s, M.shirt).k(0.16 * s).u(0.3);
  slice(f, sp, 0.95, 0.0, 1.18, 0.42, 0.82, s, M.shirt).k(0.16 * s).u(0.9);
  slice(f, ch, 0.12, 0, 1.46, 0.48, 0.94, s, M.shirt).k(0.18 * s).u(1.4);
  slice(f, ch, 0.86, -0.02, 1.52, 0.56, 0.96, s, M.shirt).k(0.18 * s).u(2.0);
  // Traps sloping up from the deltoids to a thick neck.
  for (let sd = 1; sd >= -1; sd -= 2) f.cone(f.at(ch, sd * 0.35, 1.62, -0.18), f.at(ch, sd * 1.45, 1.3, -0.08), 0.42 * s, 0.4 * s, M.skin).k(0.2 * s);
  f.ellipsoid(ch, 0, 1.55, -0.2, 0.72, 0.32, 0.6, M.skin).k(0.15 * s);
  f.cone(f.at(R.neck, 0, -0.05, 0), f.at(R.neck, 0, 0.28, 0.0), 0.42 * s, 0.32 * s, M.skin).k(0.12 * s);
  // Untucked torn shirt hem hanging over the belt; rag strips swaying.
  f.cone(f.at(sp, -1.05, -0.12, 0.05), f.at(sp, 1.05, -0.1, 0.05), 0.2 * s, 0.2 * s, M.shirt).k(0.06 * s).z(-0.05).rag(0.06 * s, PF.SPIKY).seed(5);
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? -0.55 : 0.7;
    const sw = Math.sin(t * 2.6 + i * 2) * 0.08;
    f.cone(f.at(sp, x, -0.1, 0.78), f.at(sp, x + sw, -0.72, 0.84), 0.13 * s, 0.05 * s, M.shirt).k(0.03 * s).rag(0.04 * s, PF.SPIKY | PF.RAG_END).seed(11 + i);
  }
  // Tool pouch and hammer on the belt.
  f.ellipsoid(hp, 0.75, 0.18, 0.74, 0.26, 0.24, 0.17, M.pouch).k(0.03 * s);
  f.cone(f.at(hp, 0.98, 0.42, 0.86), f.at(hp, 0.88, -0.1, 0.86), 0.06 * s, 0.055 * s, M.handle).k(0.01 * s);
  f.cone(f.at(hp, 0.82, 0.44, 0.88), f.at(hp, 1.14, 0.38, 0.88), 0.07 * s, 0.07 * s, M.steel).k(0.01 * s);
  const front = f.facing(f.at(ch, 0, 0.55, 1.0), f.dir(ch, 0, 0, 1));
  if (front > -0.05) {
    // Hi-vis vest panels either side of the wound, silver tape, blood soaking the inner edges.
    for (let sd = 1; sd >= -1; sd -= 2) {
      f.decal(f.at(ch, sd * 1.05, 1.36, 1.0), f.at(ch, sd * 1.05, -0.26, 1.0), 0.47 * s, 0.47 * s, M.vest).flag(D).rag(0.03 * s, PF.SPIKY).seed(20 + sd);
      for (let k = 0; k < 2; k++) {
        const y = k === 0 ? 0.25 : 0.85;
        f.decal(f.at(ch, sd * 0.6, y, 1.02), f.at(ch, sd * 1.5, y, 1.02), 0.08 * s, 0.08 * s, M.tape).flag(D).min(0.5);
      }
      f.decal(f.at(ch, sd * 0.74, 1.2, 1.02), f.at(ch, sd * 0.8, -0.15, 1.02), 0.17 * s, 0.13 * s, M.soak).flag(D).rag(0.06 * s, PF.SPIKY).seed(24 + sd);
    }
    f.decal(f.at(ch, -0.5, -0.22, 1.02), f.at(ch, 0.5, -0.24, 1.02), 0.13 * s, 0.12 * s, M.soak).flag(D).rag(0.05 * s, PF.SPIKY).seed(27);
    // Light from the core spilling on the vest.
    if (coreOn && !dying) {
      const beat = scaleOf(R.core);
      f.decal(f.at(ch, 0, 0.55, 1.02), f.at(ch, 0, 0.55, 1.02), 0.78 * s * Math.min(1.2, beat), 0.78 * s, M.vest).flag(D | PF.SHADE_ONLY).tone(0.25);
    }
    // The torn shirt over a bare, rotting belly; a gash; belly folds; the buckle.
    f.decal(f.at(sp, -0.75, 0.62, 0.84), f.at(sp, 0.35, 0.3, 0.84), 0.36 * s, 0.32 * s, M.skin).flag(D).rag(0.06 * s, PF.SPIKY).seed(31);
    f.decal(f.at(sp, -0.5, 0.55, 0.9), f.at(sp, -0.3, 0.45, 0.9), 0.18 * s, 0.14 * s, M.gore).flag(D).rag(0.04 * s, PF.SPIKY).seed(32);
    f.decal(f.at(sp, -0.6, 0.22, 0.84), f.at(sp, 0.2, 0.18, 0.84), 0.03 * s, 0.03 * s, M.skin).flag(D | PF.SHADE_ONLY).tone(-0.4).min(0.5);
    f.decal(f.at(hp, -0.12, 0.42, 0.72), f.at(hp, 0.12, 0.42, 0.72), 0.1 * s, 0.1 * s, M.buckle).flag(D).min(0.5);
  } else if (front < -0.2) {
    // From behind: the vest's back panel and its tape, the spine groove, shoulder blades.
    f.decal(f.at(ch, -1.45, 0.55, -1.0), f.at(ch, 1.45, 0.55, -1.0), 0.85 * s, 0.85 * s, M.vest).flag(D);
    f.decal(f.at(ch, -1.5, 0.6, -1.02), f.at(ch, 1.5, 0.6, -1.02), 0.08 * s, 0.08 * s, M.tape).flag(D).min(0.5);
    f.decal(f.at(ch, -1.5, 0.2, -1.02), f.at(ch, 1.5, 0.2, -1.02), 0.08 * s, 0.08 * s, M.tape).flag(D).min(0.5);
    f.decal(f.at(ch, 0, 1.45, -1.0), f.at(sp, 0, 0.1, -0.84), 0.04 * s, 0.04 * s, M.shirt).flag(D | PF.SHADE_ONLY).tone(-0.38).min(0.5);
    for (let sd = 1; sd >= -1; sd -= 2) f.decal(f.at(ch, sd * 0.35, 1.2, -1.02), f.at(ch, sd * 0.95, 0.75, -1.02), 0.035 * s, 0.035 * s, M.vest).flag(D | PF.SHADE_ONLY).tone(-0.3).min(0.5);
  }

  // ── The wound (weak): a torn, charred edge, the glowing band inside it, the pulsing core
  // (enraged: red → orange → yellow heat bands round a small white centre), bone ribs across ──
  {
    const w = R.wound;
    const ws = scaleOf(w);
    const cs = scaleOf(R.core);
    const glow = coreOn || flash;
    // (Pulled forward over the vest's front while it faces us; from the side the chest hides it.)
    f.layer(0.03 * s, PART.WEAK, 0, -0.12 * s * Math.min(1, Math.max(0, front * 1.6)));
    // (The charred edge past the rim's hitbox is the torn chest — torso; the glowing band inside
    // it is the rim — weak.)
    f.ellipsoid(w, 0, 0, 0.0, 0.76, 0.78, 0.06, flash ? M.white : M.char).flag(PF.FLAT | (flash ? PF.GLOW : 0)).rag(0.08 * ws, PF.SPIKY).seed(41).part(PART.TORSO);
    f.ellipsoid(w, 0, 0, 0.02, 0.6, 0.62, 0.05, flash ? M.white : glow ? M.rim : M.char).flag(PF.FLAT | (glow ? PF.GLOW : 0)).rag(0.04 * ws, PF.SPIKY).seed(42).z(-0.02);
    const pulse = 1 + 0.1 * Math.sin(t * (hot ? 9 : 5));
    const coreM = flash ? M.white : !coreOn ? M.coreDead : hot ? M.coreOrange : M.core;
    f.ellipsoid(R.core, 0, 0, 0, 0.46, 0.46, 0.5, coreM).flag(glow ? PF.GLOW : 0).z(-0.04);
    // (The band decal above paints the whole layer: the core's own colour goes back on over it.)
    if (glow) f.decal(f.at(R.core, 0, 0, 0.45), f.at(R.core, 0, 0, 0.45), 0.44 * cs, 0.42 * cs, coreM).flag(D | PF.GLOW);
    if (coreOn && !flash) {
      if (hot) {
        // Heat bands: yellow, then a white centre at most 40 % of the core's radius.
        f.decal(f.at(R.core, -0.04, 0.05, 0.45), f.at(R.core, -0.04, 0.05, 0.45), 0.3 * cs * pulse, 0.3 * cs * pulse, M.core).flag(D | PF.GLOW);
        f.decal(f.at(R.core, -0.06, 0.08, 0.46), f.at(R.core, -0.06, 0.08, 0.46), 0.16 * cs * pulse, 0.15 * cs * pulse, M.coreHi).flag(D | PF.GLOW);
      } else f.decal(f.at(R.core, -0.1, 0.12, 0.45), f.at(R.core, -0.1, 0.12, 0.45), 0.2 * cs * pulse, 0.18 * cs * pulse, M.coreHot).flag(D | PF.GLOW);
    }
    // Ribs framing the wound (they are chest: torso).
    for (let i = 0; i < 3; i++) {
      for (let sd = 1; sd >= -1; sd -= 2) {
        const a = sd * 0.35;
        const y = 0.95 - i * 0.28;
        f.cone(alongZ(f, ch, sd * 0.38, y, 1.02, a, -0.26), alongZ(f, ch, sd * 0.38, y, 1.02, a, 0.26), 0.055 * s, 0.045 * s, M.bone).part(PART.TORSO).z(-0.08).k(0.01 * s);
      }
    }
  }

  // ── Rebar speared through the chest, a bent bar out of the shoulder, a lump of concrete (armour) ──
  f.layer(0.02 * s, PART.ARMOR);
  for (let i = 0; i < 3; i++) {
    const x = i === 0 ? 0.85 : i === 1 ? -0.9 : 0.3;
    const y = i === 0 ? 0.9 : i === 1 ? 0.3 : 0.05;
    const rx = i === 0 ? 0.35 : i === 1 ? -0.3 : 0.15;
    const rz = i === 0 ? 0.25 : i === 1 ? -0.2 : -0.4;
    const h = (i === 0 ? 4.2 : i === 1 ? 3.8 : 3.6) * 0.5;
    coneDir(Math.PI / 2 + rx, rz, CD);
    f.cone(f.at(ch, x - CD.x * h, y - CD.y * h, -CD.z * h), f.at(ch, x + CD.x * h, y + CD.y * h, CD.z * h), 0.085 * s, 0.075 * s, M.rust).min(0.6).u(i);
  }
  coneDir(0.4, 0.5, CD);
  f.cone(f.at(ch, -1.3 - CD.x * 1.1, 2.2 - CD.y * 1.1, -0.5 - CD.z * 1.1), f.at(ch, -1.3 + CD.x * 1.1, 2.2 + CD.y * 1.1, -0.5 + CD.z * 1.1), 0.085 * s, 0.07 * s, M.rust).min(0.6);
  f.ellipsoid(ch, 1.2, 1.25, -1.95, 0.38, 0.3, 0.33, M.conc).k(0.02 * s);

  // ── Head (weak): square zombie face — a heavy forehead in the brim's shadow, the brow
  // ridge, cheekbones, ears, a dropped jaw, tooth rows, orange-red slit eyes ──
  const h = R.head;
  const hs = scaleOf(h);
  const jw = R.jaw;
  f.layer(0.08 * s, PART.WEAK, 0, -0.18 * s);
  f.ellipsoid(h, 0, 0.48, -0.02, 0.53, 0.55, 0.56, M.face).k(0.08 * s).seed(51).flag(PF.PLANAR);
  f.cone(f.at(h, -0.36, 0.84, 0.36), f.at(h, 0.36, 0.84, 0.36), 0.15 * hs, 0.15 * hs, M.face).k(0.08 * s);
  // The brow ridge jutting over the eyes (lit on top: skin, not a dark band).
  f.cone(f.at(h, -0.44, 0.71, 0.42), f.at(h, 0.44, 0.71, 0.42), 0.11 * hs, 0.11 * hs, M.face).k(0.05 * s).z(-0.04).tone(0.04);
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.ball(f.at(h, sd * 0.32, 0.4, 0.4), 0.17 * hs, M.face).k(0.08 * s);
    f.cone(f.at(h, sd * 0.53, 0.56, 0.0), f.at(h, sd * 0.56, 0.36, -0.02), 0.11 * hs, 0.1 * hs, M.face).k(0.04 * s);
  }
  f.cone(f.at(h, 0, 0.6, 0.5), f.at(h, 0, 0.36, 0.62), 0.1 * hs, 0.13 * hs, M.skinDark).k(0.05 * s).z(-0.05);
  // Mouth: dark throat between the jaws, then the tooth rows.
  {
    const up = f.at(h, 0, 0.16, 0.48);
    const lo = f.at(jw, 0, 0.04, 0.46);
    const gap = Math.max(0.05 * hs, up.distanceTo(lo) * 0.5);
    const mc = f.mix(up, lo, 0.5);
    const ax = f.dir(h, 1, 0, 0);
    f.cone(f.add(mc, ax, -0.3 * hs), f.add(mc, ax, 0.3 * hs), gap, gap, M.mouth).flag(PF.FLAT).k(0.02 * s).z(-0.02);
  }
  f.coneE(f.at(jw, -0.28, -0.12, 0.16), f.at(jw, 0.28, -0.12, 0.16), f.dir(jw, 0, 1, 0), f.dir(jw, 0, 0, 1), 0.16 * hs, 0.36 * hs, 0.16 * hs, 0.36 * hs, M.face).k(0.05 * s);
  // A heavy chin at the front of the jaw (the jaw box's front edge).
  f.cone(f.at(jw, -0.2, -0.13, 0.4), f.at(jw, 0.2, -0.13, 0.4), 0.15 * hs, 0.15 * hs, M.face).k(0.05 * s);
  f.cone(f.at(h, -0.3, 0.17, 0.5), f.at(h, 0.3, 0.17, 0.5), 0.055 * hs, 0.055 * hs, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.06).seed(3);
  f.cone(f.at(jw, -0.27, 0.06, 0.47), f.at(jw, 0.27, 0.06, 0.47), 0.05 * hs, 0.05 * hs, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.06).seed(8);
  if (f.facing(f.at(h, 0, 0.5, 0.55), f.dir(h, 0, 0, 1)) > 0.0) {
    // The brim's shadow across the forehead (a dark band, then the skin of the brow).
    f.decal(f.at(h, -0.5, 0.905, 0.48), f.at(h, 0.5, 0.905, 0.48), 0.04 * hs, 0.04 * hs, M.face).flag(D | PF.SHADE_ONLY).tone(-0.5).min(0.5);
    // Orange-red slit eyes in dark sockets under the brow.
    const em = flashOf(R.weak[2] ?? R.core) ? M.white : hot ? M.eyeHot : M.eye;
    for (let sd = 1; sd >= -1; sd -= 2) {
      f.decal(f.at(h, sd * 0.13, 0.6, 0.56), f.at(h, sd * 0.35, 0.6, 0.56), 0.075 * hs, 0.07 * hs, M.socket).flag(D);
      f.decal(f.at(h, sd * 0.15, 0.605, 0.57), f.at(h, sd * 0.33, 0.6, 0.57), 0.032 * hs, 0.028 * hs, em).flag(D | PF.GLOW).min(0.5);
    }
    // Blood drooling from the jaw.
    const dl = 0.15 + 0.1 * Math.sin(t * 1.3);
    f.cone(f.at(jw, 0.18, -0.2, 0.5), f.at(jw, 0.19 + Math.sin(t * 2.1) * 0.03, -0.3 - dl, 0.52), 0.05 * hs, 0.03 * hs, M.blood).part(PART.NONE).z(-0.1).min(0.5);
  }
  // The split skull under the brim: a jagged dark crack slanting down the forehead, a thin hot
  // seam in it (orange, thin and diagonal: never a yellow band under the hat).
  {
    const a = -0.45;
    f.decal(alongZ(f, h, -0.16, 0.82, 0.52, a, -0.26), alongZ(f, h, -0.16, 0.82, 0.52, a, 0.26), 0.08 * hs, 0.06 * hs, M.crack).flag(D).rag(0.03 * hs, PF.SPIKY).seed(55);
    f.decal(alongZ(f, h, -0.16, 0.82, 0.53, a, -0.2), alongZ(f, h, -0.16, 0.82, 0.53, a, 0.2), 0.03 * hs, 0.025 * hs, flashOf(R.weak[4] ?? R.core) ? M.white : M.gash).flag(D | PF.GLOW).min(0.5);
  }

  // ── Hard hat (armour): a yellow domed crown over the brim, the ridge, sticker, glint ──
  // (The dome's lower half is inside the head: only the cap above the brim shows.)
  f.layer(0.02 * s, PART.ARMOR, 0, -0.24 * s);
  // (The crown a touch taller than the 3D's, so the dome reads above the brim from the truck.)
  f.ellipsoid(h, 0, 1.07, -0.02, 0.6, 0.4, 0.64, M.hat).k(0.02 * s).tone(0.04);
  // Brim: the lip overhanging the face, its underside in shadow (a flat pill across the front:
  // from below it shows above the forehead, never over it).
  f.coneE(f.at(h, -0.54, 0.955, 0.68), f.at(h, 0.54, 0.955, 0.68), f.dir(h, 0, 1, 0), f.dir(h, 0, 0, 1), 0.035 * hs, 0.19 * hs, 0.035 * hs, 0.19 * hs, M.hat).tone(-0.24).k(0.015 * s);
  // The whole disc, flat at its centre's depth: it shows out past the temples (and above the
  // head from below) while the face, nearer, hides its back half — like the 3D brim.
  f.ellipsoid(h, 0, 0.94, 0.08, 0.8, 0.035, 0.82, M.hat).flag(PF.FLAT).tone(-0.3).k(0.01 * s);
  if (f.facing(f.at(h, 0, 1.1, 0.6), f.dir(h, 0, 0.2, 1)) > 0.05) {
    f.decal(f.at(h, -0.16, 1.12, 0.6), f.at(h, 0.16, 1.12, 0.6), 0.08 * hs, 0.08 * hs, M.sticker).flag(D);
    // The raised centre ridge, front to back.
    f.decal(f.at(h, 0, 1.39, -0.1), f.at(h, 0, 1.22, 0.52), 0.07 * hs, 0.06 * hs, M.hatDark).flag(D);
    f.decal(f.at(h, -0.26, 1.24, 0.42), f.at(h, -0.16, 1.29, 0.38), 0.05 * hs, 0.04 * hs, M.glint).flag(D | PF.GLOW | PF.NO_OUTLINE).min(0.5);
  }

  // ── Arms: deltoid, torn sleeve, biceps → elbow knob → forearm → wrist; huge hands ──
  for (let sd = 1; sd >= -1; sd -= 2) {
    const sh = sd > 0 ? R.shL : R.shR;
    const el = sd > 0 ? R.elL : R.elR;
    const hd = sd > 0 ? R.handL : R.handR;
    const far = f.depth(f.at(el, 0, -0.5, 0)) > torsoDepth + 0.3;
    f.layer(0.12 * s, PART.LIMB, far ? -0.1 : 0);
    f.cone(f.at(sh, 0, 0.1, 0), f.at(sh, 0, -0.5, 0), 0.46 * s, 0.43 * s, M.shirt).k(0.1 * s);
    f.cone(f.at(sh, 0, -0.42, 0.02), f.at(sh, 0, -1.8, -0.02), 0.4 * s, 0.33 * s, M.skin);
    f.cone(f.at(sh, 0, -0.75, 0.05), f.at(sh, 0, -1.25, 0.04), 0.4 * s, 0.38 * s, M.skin).k(0.12 * s);
    f.cone(f.at(sh, 0, -0.42, 0), f.at(sh, 0, -0.62, 0), 0.44 * s, 0.46 * s, M.shirt).k(0.02 * s).rag(0.04 * s, PF.SPIKY | PF.RAG_END).seed(60 + sd);
    if (sd < 0 && f.facing(f.at(sh, 0, -1.1, 0.44), f.dir(sh, 0, 0, 1)) > 0) f.decal(f.at(sh, 0.1, -0.95, 0.44), f.at(sh, 0.1, -1.25, 0.44), 0.15 * s, 0.12 * s, M.gore).flag(D).rag(0.04 * s, PF.SPIKY).seed(63);
    f.ball(f.at(el, 0, 0.02, -0.08), 0.35 * s, M.skin).k(0.1 * s);
    f.cone(f.at(el, 0, -0.05, 0.02), f.at(el, 0, -0.55, 0.03), 0.34 * s, 0.38 * s, M.skin);
    f.cone(f.at(el, 0, -0.5, 0.02), f.at(el, 0, -1.78, 0), 0.38 * s, 0.3 * s, M.skin);
    // Hand: palm, knuckles, four jointed fingers hooked into claws (they twitch), a thumb.
    const tw = Math.sin(t * 5 + sd) * 0.06;
    f.coneE(f.at(hd, 0, -0.05, 0.05), f.at(hd, 0, -0.72, 0.06), f.dir(hd, 1, 0, 0), f.dir(hd, 0, 0, 1), 0.42 * s, 0.27 * s, 0.46 * s, 0.25 * s, M.skinDark).k(0.08 * s);
    for (let i = 0; i < 4; i++) {
      const x = -0.3 + i * 0.2;
      const curl = 0.12 + (i % 2 ? tw : -tw);
      f.cone(f.at(hd, x, -0.7, 0.06), f.at(hd, x * 1.05, -1.02, 0.15), 0.11 * s, 0.1 * s, M.skin).k(0.05 * s);
      f.cone(f.at(hd, x * 1.05, -1.0, 0.15), f.at(hd, x * 1.08, -1.24, 0.15 + curl), 0.095 * s, 0.06 * s, M.skin).k(0.03 * s);
    }
    f.cone(f.at(hd, sd * 0.4, -0.3, 0.18), f.at(hd, sd * 0.56, -0.68, 0.32), 0.12 * s, 0.09 * s, M.skin).k(0.05 * s);
    if (sd > 0) {
      // Steel sheet strapped to the left forearm (armour).
      f.layer(0.02 * s, PART.ARMOR, far ? -0.1 : 0, -0.15 * s);
      // (Axis shortened by the round caps: the plate spans the box, y −0.35 … −1.65.)
      f.coneE(f.at(el, 0, -0.8, 0), f.at(el, 0, -1.2, 0), f.dir(el, 1, 0, 0), f.dir(el, 0, 0, 1), 0.45 * s, 0.46 * s, 0.45 * s, 0.46 * s, M.guard).k(0.01 * s).u(0.2);
      for (let k = 0; k < 2; k++) {
        const y = k === 0 ? -0.6 : -1.4;
        f.decal(f.at(el, -0.46, y, 0.47), f.at(el, 0.46, y, 0.47), 0.06 * s, 0.06 * s, M.strap).flag(D).min(0.5);
      }
      f.decal(f.at(el, -0.3, -1.0, 0.47), f.at(el, 0.3, -1.05, 0.47), 0.03 * s, 0.03 * s, M.guard).flag(D | PF.SHADE_ONLY).tone(-0.3).min(0.5);
    }
  }

  // ── Legs: jeans (thigh, knee, shin), ragged cuff over steel-toe work boots ──
  for (let sd = 1; sd >= -1; sd -= 2) {
    const hip = sd > 0 ? R.hipL : R.hipR;
    const kn = sd > 0 ? R.kneeL : R.kneeR;
    const far = f.depth(f.at(kn, 0, 0, 0)) > torsoDepth + 0.3;
    f.layer(0.14 * s, PART.LIMB, far ? -0.1 : 0);
    f.cone(f.at(hip, 0, -0.18, 0), f.at(hip, 0, -1.72, 0.02), 0.38 * s, 0.4 * s, M.jeans);
    f.cone(f.at(hip, 0, -0.42, 0.08), f.at(hip, 0, -1.45, 0.1), 0.46 * s, 0.42 * s, M.jeans).k(0.12 * s);
    f.ball(f.at(kn, 0, 0.0, 0.1), 0.41 * s, M.jeans).k(0.1 * s);
    f.cone(f.at(kn, 0, 0.0, 0.0), f.at(kn, 0, -0.95, 0.0), 0.4 * s, 0.36 * s, M.jeans);
    f.cone(f.at(kn, 0, -0.82, 0.02), f.at(kn, 0, -0.98, 0.04), 0.42 * s, 0.46 * s, M.jeans).k(0.02 * s).rag(0.05 * s, PF.SPIKY | PF.RAG_END).seed(70 + sd);
    f.coneE(f.at(kn, 0, -1.17, -0.36), f.at(kn, 0, -1.22, 0.84), f.dir(kn, 1, 0, 0), f.dir(kn, 0, 1, 0), 0.46 * s, 0.3 * s, 0.45 * s, 0.25 * s, M.boot).k(0.06 * s);
    if (f.facing(f.at(kn, 0, -0.5, 0.45), f.dir(kn, 0, 0, 1)) > 0) {
      f.decal(f.at(hip, sd * 0.05, -1.3, 0.47), f.at(hip, sd * 0.05, -1.5, 0.47), 0.26 * s, 0.22 * s, M.skinDark).flag(D).rag(0.05 * s, PF.SPIKY).seed(73 + sd);
      f.decal(f.at(kn, -0.3, -0.12, 0.42), f.at(kn, 0.28, -0.18, 0.42), 0.03 * s, 0.03 * s, M.jeans).flag(D | PF.SHADE_ONLY).tone(-0.36).min(0.5);
      f.decal(f.at(kn, -0.45, -1.42, 0.3), f.at(kn, 0.45, -1.42, 0.9), 0.05 * s, 0.05 * s, M.sole).flag(D).min(0.5);
      f.decal(f.at(kn, 0, -1.15, 0.86), f.at(kn, 0, -1.15, 0.86), 0.16 * s, 0.13 * s, M.boot).flag(D | PF.SHADE_ONLY).tone(0.22);
    }
  }

  // ── In hand: a car / a concrete slab (weak — shoot it down) or the lamp post (armour) ──
  if (R.heldCar.visible) {
    const c = R.heldCar;
    const b = mem.car;
    const cs = scaleOf(c);
    const cx = (b.min.x + b.max.x) * 0.5;
    const cz = (b.min.z + b.max.z) * 0.5;
    const hl = (b.max.x - b.min.x) * 0.5;
    const hw = (b.max.z - b.min.z) * 0.5;
    const hh = b.max.y - b.min.y;
    const y0 = b.min.y;
    const yb = y0 + hh * 0.42;
    f.layer(0.05 * s, PART.WEAK);
    // Body: a slab with small rounded corners (two edge rods melted together, not one fat capsule).
    for (let k = 0; k < 2; k++) {
      const y = yb + (k === 0 ? -1 : 1) * hh * 0.13;
      f.coneE(f.at(c, cx - hl + hh * 0.15, y, cz), f.at(c, cx + hl - hh * 0.15, y, cz), f.dir(c, 0, 1, 0), f.dir(c, 0, 0, 1), hh * 0.15 * cs, hw * cs, hh * 0.15 * cs, hw * cs, M.car).k(0.12 * s).u(k * 0.2);
    }
    f.coneE(f.at(c, cx - hl * 0.36, y0 + hh * 0.76, cz), f.at(c, cx + hl * 0.24, y0 + hh * 0.76, cz), f.dir(c, 0, 1, 0), f.dir(c, 0, 0, 1), hh * 0.21 * cs, hw * 0.86 * cs, hh * 0.21 * cs, hw * 0.86 * cs, M.glass).k(0.08 * s);
    for (let i = 0; i < 4; i++) {
      const wx = cx + (i < 2 ? -1 : 1) * hl * 0.6;
      const wz = cz + (i % 2 ? -1 : 1) * hw * 0.92;
      f.ellipsoid(c, wx, y0 + hh * 0.21, wz, hh * 0.25, hh * 0.25, 0.16, M.tyre).k(0.01 * s);
    }
    // Windows along the side, a dark sill line.
    for (let sd = -1; sd <= 1; sd += 2) {
      const z = cz + sd * hw * 0.98;
      f.decal(f.at(c, cx - hl * 0.3, y0 + hh * 0.72, z), f.at(c, cx + hl * 0.2, y0 + hh * 0.72, z), hh * 0.12 * cs, hh * 0.12 * cs, M.glass).flag(D);
      f.decal(f.at(c, cx - hl * 0.9, yb - hh * 0.08, z), f.at(c, cx + hl * 0.9, yb - hh * 0.08, z), 0.03 * cs, 0.03 * cs, M.car).flag(D | PF.SHADE_ONLY).tone(-0.35).min(0.5);
    }
    for (let i = 0; i < 2; i++) {
      const lp = f.at(c, cx + hl * 0.98, yb + hh * 0.04, cz + (i ? -1 : 1) * hw * 0.62);
      f.decal(lp, lp, 0.13 * cs, 0.1 * cs, M.light).flag(D | PF.GLOW).min(0.5);
    }
  } else if (R.heldSlab.visible) {
    const c = R.heldSlab;
    f.layer(0.03 * s, PART.WEAK);
    f.coneE(f.at(c, -0.9, 0, 0), f.at(c, 0.9, 0, 0), f.dir(c, 0, 1, 0), f.dir(c, 0, 0, 1), 0.3 * s, 0.85 * s, 0.3 * s, 0.85 * s, M.conc).k(0.02 * s).rag(0.03 * s).seed(81);
    coneDir(0.6, 0.3, CD);
    f.cone(f.at(c, 0.8 - CD.x * 0.6, 0.3 - CD.y * 0.6, 0.5 - CD.z * 0.6), f.at(c, 0.8 + CD.x * 0.6, 0.3 + CD.y * 0.6, 0.5 + CD.z * 0.6), 0.05 * s, 0.045 * s, M.rust).min(0.5);
  }
  if (R.club.visible) {
    const c = R.club;
    f.layer(0.02 * s, PART.ARMOR);
    f.cone(f.at(c, 0, 0.4, 0), f.at(c, 0, -7.2, 0), 0.17 * s, 0.13 * s, M.pole).u(0);
    f.cone(f.at(c, 0, -7.15, -0.05), f.at(c, 0, -7.15, 1.75), 0.07 * s, 0.07 * s, M.pole).k(0.03 * s);
    f.ellipsoid(c, 0, -7.15, 1.75, 0.2, 0.1, 0.35, M.lamp).k(0.03 * s);
    const lg = f.at(c, 0, -7.27, 1.75);
    f.decal(lg, lg, 0.2 * s, 0.14 * s, M.lampGlow).flag(D | PF.GLOW);
    f.ellipsoid(c, 0, 0.3, 0, 0.27, 0.22, 0.27, M.conc).k(0.04 * s);
  }
  return true;
}
