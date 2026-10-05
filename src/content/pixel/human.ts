import * as THREE from 'three';
import type { HumanoidRig } from '../kit/humanoid';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';
import { HAND, STAMP, dir8, stampSize } from '../../gameplay/pixel/stamps';

/**
 * ─── PixelCast humanoid painter ────────────────────────────────────────────
 *
 * Paints a `buildHumanoid` rig (zombies, civilians) as one continuous figure
 * from its live joints — anatomy first, then clothes, face, hair and gore. It
 * is drawn the way a sprite artist builds a figure, not as a stack of tubes:
 *
 *   torso layer   wide pelvis with a seat → narrow waist → deep ribcage → a
 *                 rounded upper back (zombies hunch, each its own amount) →
 *                 traps sloping into deltoids (one shoulder drops) → a neck
 *                 thrust forward; untucked hems hang over the waistband (ragged
 *                 on the dead), rag strips sway; drawn creases (belly Z folds,
 *                 armpit pulls, shoulder blades from behind); outfit details,
 *                 stains, wounds and ribs as decals.
 *   head layer    cranium + jaw (gapes) + cheekbones + brow ridge + nose + ears,
 *                 hair cap with matted tufts; the head lolls and rolls slowly.
 *                 Eyes and mouth are hand-pixelled STAMPS (stamps.ts) placed
 *                 where the rig's eyes / lips are (yaw and jaw just work), in
 *                 three sizes; tiny heads get a couple of plain pixels.
 *   arm layers    deltoid cap → biceps tapering into a bony elbow → forearm
 *                 swelling, then narrowing to a thin wrist → a cuff that hangs
 *                 over it → hand: a stamp (claw / open / fist, 8 directions)
 *                 up to ~11 texels, jointed fingers above. Inner-elbow Z folds.
 *   leg layers    thigh (quads forward) → knee knob → calf behind → ankle;
 *                 trousers fall straighter and break over the shoe in a wider
 *                 (ragged) cuff; knee and crotch creases; sole line, toe cap.
 *
 * Far-side limbs are a shade darker. Sizes are the rig's, slightly inside /
 * around its boxes, so the drawn figure covers every hitbox centre; everything
 * is in joint space, so any pose and any view (front, 3/4, side, back, lying
 * down) comes out right. Fast heads / hands leave a smear for a redraw.
 */

export type Outfit = 'casual' | 'office' | 'worker' | 'nurse' | 'cop' | 'doctor' | 'patient' | 'soldier' | 'biker' | 'flannel' | 'scientist' | 'ranger';

export interface HumanLook {
  /** Zombie (rot, glowing eyes, snarl) vs living (warm skin, whites of the eyes). */
  dead: boolean;
  skin: number;
  bulk: number;
  headSize: number;
  armLength: number;
  hair: number | null;
  longHair: boolean;
  bun: boolean;
  eyes: number;
  shirt: number;
  shirtPat: 'cloth' | 'plaid' | 'gown' | 'camo' | 'leather';
  sleeves: 'none' | 'short' | 'long';
  sleeveColor: number;
  pants: number;
  pantsPat: 'denim' | 'cloth' | 'gown' | 'camo';
  bareLegs: boolean;
  shoes: number;
  outfit: Outfit;
  /** Accessories (null = none). */
  tie: number | null;
  jacket: number | null;
  vest: number | null;
  hat: number | null;
  belt: number | null;
  beard: number | null;
  /** Under-shirt / tee showing at the collar or open front. */
  inner: number | null;
  badge: number | null;
  // Face.
  mouthOpen: boolean;
  drool: boolean;
  faceWound: number;
  // Gore (zombies).
  rags: number;
  ribs: number;
  chestBlood: boolean;
  bellyWound: number;
  bite: number;
  armWound: number;
  legWound: number;
  blood: number;
  /** Per-character randomness for the painter (never the world RNG). */
  seed: number;
}

export function humanLook(o: Partial<HumanLook> = {}): HumanLook {
  return {
    dead: true,
    skin: 0xa9b79a,
    bulk: 1,
    headSize: 1,
    armLength: 1,
    hair: 0x2a2018,
    longHair: false,
    bun: false,
    eyes: 0xffe9a0,
    shirt: 0x4b5a6b,
    shirtPat: 'cloth',
    sleeves: 'long',
    sleeveColor: o.shirt ?? 0x4b5a6b,
    pants: 0x2e3d5c,
    pantsPat: 'denim',
    bareLegs: false,
    shoes: 0x1c1c1c,
    outfit: 'casual',
    tie: null,
    jacket: null,
    vest: null,
    hat: null,
    belt: null,
    beard: null,
    inner: null,
    badge: null,
    mouthOpen: true,
    drool: false,
    faceWound: 0,
    rags: 0,
    ribs: 0,
    chestBlood: false,
    bellyWound: 0,
    bite: 0,
    armWound: 0,
    legWound: 0,
    blood: 0x7a0c0c,
    seed: 1,
    ...o,
  };
}

/** Per-redraw state the painter needs beyond the rig's joints. */
export interface HumanPose {
  /** Arms lost: [left, right] — 0 intact, 1 forearm gone, 2 whole arm gone. */
  severed: readonly number[];
  headless: boolean;
  /** Jaw 0 shut … 1 gaping. */
  jaw: number;
  /** Expression. */
  face: 'zombie' | 'scream' | 'calm';
  /** Squash on a hit (0..1). */
  squash: number;
  /** Seconds (secondary motion: rags, hair). */
  time: number;
  /** Ground speed m/s (cloth sway). */
  speed: number;
  /** Legs gone (crawlers: torso drags on the ground). */
  legless?: boolean;
  /** Hand stamps: `HAND.CLAW` (default for the dead), `OPEN` (the living), `FIST`. */
  hand?: number;
  /** Motion smears (0..1) behind a fast head / hand — lunges, swipes. Needs `mem`. */
  smear?: number;
  /** Per-character memory (smears): from `humanMem()`, owned by the character. */
  mem?: HumanMem;
  /** Extra shapes inside the torso layer (bellies, throat sacs): melt into the trunk. */
  torso?: (f: PixelFigure) => void;
  /** Extra layers after the figure (armour plates, spikes, glowing weak spots). */
  extra?: (f: PixelFigure) => void;
  /** Thickness multipliers matching scaled 3D limbs: arms [left, right], legs, neck (brutes, bloaters). */
  armW?: readonly number[];
  legW?: number;
  neckW?: number;
  /** false = no pelvis (crawlers torn in half). */
  pelvis?: boolean;
}

/** World scale of a joint (its matrix's X column length). */
function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Mats {
  skin: number;
  /** Head skin: the same skin with less rot, so the face stays readable. */
  face: number;
  shirt: number;
  sleeve: number;
  pants: number;
  shoes: number;
  hair: number;
  blood: number;
  gore: number;
  bone: number;
  mouth: number;
  teeth: number;
  // Outfit details (0 = unused).
  inner: number;
  collar: number;
  tie: number;
  badge: number;
  jacket: number;
  vest: number;
  band: number;
  belt: number;
  buckle: number;
  cord: number;
  lanyard: number;
  card: number;
  ribs: number;
  beard: number;
  eyeGlow: number;
  eyeWhite: number;
  pupil: number;
  lens: number;
  frame: number;
  pouch: number;
  handle: number;
  steel: number;
  hat: number;
  hatTrim: number;
  cross: number;
}

/** Materials per look, resolved once (no key strings or lookups per redraw). */
const matCache = new WeakMap<HumanLook, Mats>();

function mats(L: HumanLook): Mats {
  let m = matCache.get(L);
  if (m) return m;
  const skin = L.dead ? Mat.deadSkin(L.skin) : Mat.liveSkin(L.skin);
  const blood = Mat.blood(L.blood);
  const stain = L.dead ? blood : 0;
  const cloth = (hex: number, pat: HumanLook['shirtPat'] | HumanLook['pantsPat']): number => {
    switch (pat) {
      case 'plaid':
        return Mat.plaid(hex);
      case 'gown':
        return Mat.gown(hex);
      case 'camo':
        return Mat.camo(hex);
      case 'leather':
        return Mat.leather(hex);
      case 'denim':
        return Mat.denim(hex);
      default:
        return Mat.cloth(hex, { stain });
    }
  };
  let hat = 0;
  let hatTrim = 0;
  if (L.hat !== null) {
    switch (L.outfit) {
      case 'worker':
      case 'soldier':
        hat = Mat.gloss(L.hat);
        break;
      case 'ranger':
        hat = Mat.leather(L.hat);
        hatTrim = Mat.leather(0x3a2a18);
        break;
      case 'cop':
        hat = Mat.cloth(L.hat);
        hatTrim = Mat.leather(0x141416);
        break;
      case 'patient':
        hat = Mat.cloth(L.hat, { stain: blood });
        break;
      default:
        hat = Mat.cloth(L.hat);
    }
  }
  m = {
    skin,
    face: L.dead ? Mat.deadSkin(L.skin, 0.4) : skin,
    // (A shirt the colour of the skin is a bare torso: brutes.)
    shirt: L.shirt === L.skin && L.jacket === null ? skin : cloth(L.jacket ?? L.shirt, L.shirtPat),
    sleeve: L.sleeveColor === L.skin && L.jacket === null ? skin : cloth(L.jacket ?? L.sleeveColor, L.shirtPat),
    pants: L.bareLegs ? skin : cloth(L.pants, L.pantsPat),
    shoes: L.bareLegs ? skin : Mat.leather(L.shoes),
    hair: Mat.hair(L.hair ?? 0x2a2018),
    blood,
    gore: Mat.gore(),
    bone: Mat.bone(),
    mouth: Mat.mouth(),
    teeth: Mat.teeth(L.dead ? 0xc8bc8c : 0xf0ece0),
    inner: L.inner !== null ? Mat.cloth(L.inner, { stain }) : 0,
    collar: Mat.cloth(L.inner ?? 0xe4e4e0),
    tie: L.tie !== null ? Mat.cloth(L.tie) : 0,
    badge: L.badge !== null ? Mat.gloss(L.badge) : 0,
    jacket: L.jacket !== null ? Mat.cloth(L.jacket) : 0,
    vest: L.vest !== null ? (L.outfit === 'worker' ? Mat.hivis(L.vest) : Mat.cloth(L.vest)) : 0,
    band: Mat.gloss(0xe0e4e8),
    belt: L.belt !== null ? Mat.leather(L.belt) : 0,
    buckle: Mat.gloss(0xc8a840),
    cord: Mat.leather(0x404448),
    lanyard: Mat.flat(0x2a5aa0),
    card: Mat.flat(0xf0f0f0),
    ribs: Mat.ribs(),
    beard: L.beard !== null ? Mat.hair(L.beard) : 0,
    eyeGlow: Mat.glow(L.eyes),
    eyeWhite: Mat.flat(0xf2eee4),
    pupil: Mat.flat(0x1e140e),
    lens: Mat.flat(0xa8e0f8),
    frame: Mat.flat(0x1a1a1a),
    pouch: Mat.leather(0x5a3a1e),
    handle: Mat.leather(0x9a6c3a),
    steel: Mat.gloss(0x60646c),
    hat,
    hatTrim,
    cross: Mat.flat(0xe02020),
  };
  matCache.set(L, m);
  return m;
}

const D = PF.FLAT;

// ─── Scratch (one figure is painted at a time; no allocation per redraw) ─────

/** A stand-in joint whose matrix is a live joint's, tilted (head loll): painters read only `matrixWorld`. */
const headProxy = { matrixWorld: new THREE.Matrix4() } as unknown as THREE.Object3D;
const _rot = new THREE.Matrix4();
const _eul = new THREE.Euler();
const P0 = { x: 0, y: 0, z: 0 };
const P1 = { x: 0, y: 0, z: 0 };

function tilted(h: THREE.Object3D, pitch: number, roll: number): THREE.Object3D {
  _rot.makeRotationFromEuler(_eul.set(pitch, 0, roll));
  headProxy.matrixWorld.multiplyMatrices(h.matrixWorld, _rot);
  return headProxy;
}

/** Texels a length of `m` metres at `p` covers (using the sprite's last texel size). */
function tx(f: PixelFigure, p: THREE.Vector3, m: number): number {
  return f.px(p, m) / f.kHint;
}

/** Per-character memory for smears (previous screen positions of the fast parts). */
export interface HumanMem {
  valid: boolean;
  t: number;
  head: THREE.Vector3;
  handL: THREE.Vector3;
  handR: THREE.Vector3;
}

export function humanMem(): HumanMem {
  return { valid: false, t: 0, head: new THREE.Vector3(), handL: new THREE.Vector3(), handR: new THREE.Vector3() };
}

/** Paint a humanoid rig. Returns false when it can't (nothing to draw). */
export function paintHuman(f: PixelFigure, r: HumanoidRig, L: HumanLook, st: HumanPose): boolean {
  if (!r.root.visible) return false;
  // 1 texel per retro pixel up to ~240 px tall (≈ 1.9 m away); closer, texels grow (arcade sprite scaling).
  f.maxTexels = 240;
  const M = mats(L);
  const s = scaleOf(r.hips);
  const b = L.bulk;
  const sb = Math.sqrt(b);
  const torsoDepth = f.depth(f.at(r.spine, 0, 0.25, 0));
  const sd = L.seed;
  // Character: zombies hunch and slump (each its own way), the living stand straighter.
  const hunch = L.dead ? 0.55 + 0.45 * hash(sd * 1.3) : 0.12;
  const slump = L.dead ? (hash(sd * 2.9) - 0.5) * 2 : 0;
  const t = st.time;

  // ── Smears: a fast-moving head / hand leaves a streak for a redraw or two ──
  if (st.mem && st.smear !== undefined && st.smear > 0) paintSmears(f, r, M, st, s);

  // ── Torso ──────────────────────────────────────────────────────────────
  f.layer(0.045 * s, PART.TORSO);
  const hipX = f.dir(r.hips, 1, 0, 0);
  const hipZ = f.dir(r.hips, 0, 0, 1);
  const spX = f.dir(r.spine, 1, 0, 0);
  const spZ = f.dir(r.spine, 0, 0, 1);
  // The trunk is built from horizontal SLICES (hips → waist → ribs → chest), each a
  // flat pill across the body whose ends are the flanks — melted together they make
  // one torso that narrows at the waist and fills out at the chest, without the
  // round caps of a vertical tube bulging past the hips (and bulky bodies stay
  // inside their boxes). From the side each slice is the trunk's depth there.
  const spY = f.dir(r.spine, 0, 1, 0);
  const hipY = f.dir(r.hips, 0, 1, 0);
  const hz = 0.022 * hunch;
  if (st.pelvis !== false) trunkSlice(f, r.hips, hipY, hipZ, -0.025, 0.0, 0.168 * b, 0.078, 0.104 * sb, s, M.pants).u(0);
  trunkSlice(f, r.spine, spY, spZ, 0.08, 0.008 + hz * 0.3, 0.15 * b, 0.085, 0.1 * sb, s, M.shirt).u(0.08);
  trunkSlice(f, r.spine, spY, spZ, 0.23, 0.012 + hz * 0.6, 0.163 * b, 0.1, 0.108 * sb, s, M.shirt).u(0.23);
  trunkSlice(f, r.spine, spY, spZ, 0.37 - 0.012 * hunch, hz, 0.185 * b, 0.09, 0.11 * sb, s, M.shirt).u(0.37);
  void hipX;
  void spX;
  // Upper-back hump (a rounded back in profile).
  f.cone(f.at(r.spine, 0, 0.27, -0.035 - 0.015 * hunch), f.at(r.spine, 0, 0.4, -0.03 - 0.02 * hunch), 0.085 * sb * s, 0.08 * sb * s, M.shirt).k(0.05 * s);
  // Shoulder girdle: traps sloping from the neck into each deltoid; one shoulder drops.
  const shX = 0.2 * b + 0.018;
  const trapX = 0.19 * b + 0.026;
  for (let side = 1; side >= -1; side -= 2) {
    const drop = 0.016 * slump * side;
    f.cone(f.at(r.chest, side * 0.05, 0.035, -0.01), f.at(r.chest, side * trapX, -0.035 - drop, hz * 0.6), 0.058 * s, 0.07 * s, M.shirt).k(0.05 * s);
  }
  // Neck: thrust forward on the hunched dead.
  const nw = st.neckW ?? 1;
  // (A thick neck stays thick at the shoulders, not under the jaw: the head is shot there.)
  f.cone(f.at(r.chest, 0, -0.02, -0.006 + hz), f.at(r.neck, 0, nw > 1.2 ? 0.04 : 0.075, 0.004), 0.054 * nw * s, 0.047 * Math.min(nw, 1.3) * s, M.skin).k(0.03 * s);
  // Untucked shirts: a hem that hangs over the waistband (ragged on the dead) — a silhouette break.
  const untucked = L.outfit === 'casual' || L.outfit === 'worker' || L.outfit === 'flannel' || L.outfit === 'biker' || L.outfit === 'patient' || L.outfit === 'nurse';
  if (untucked) {
    const hy = L.outfit === 'patient' || L.outfit === 'nurse' ? -0.08 : -0.035;
    f.cone(f.at(r.spine, -0.11 * b, hy, 0.01), f.at(r.spine, 0.11 * b, hy + 0.008, 0.01), 0.058 * sb * s, 0.058 * sb * s, M.shirt)
      .k(0.02 * s)
      .z(-0.03)
      .rag((L.dead ? 0.012 : 0.004) * s, PF.SPIKY)
      .seed(sd % 13);
  }
  // Ragged shirt strips hanging below the hem (zombies), swaying with the walk.
  for (let i = 0; i < L.rags; i++) {
    const h = hash(sd + i * 3.1);
    const x = (h * 2 - 1) * 0.13 * b;
    const back = hash(sd + i * 7.7) < 0.35;
    const z = (back ? -1 : 1) * 0.1 * sb;
    const sway = Math.sin(t * (5 + h * 3) + i * 2) * 0.02 * (0.5 + Math.min(1, st.speed));
    f.cone(f.at(r.spine, x, 0.02, z), f.at(r.spine, x + sway, -0.11 - h * 0.06, z * 1.08), 0.034 * s, 0.012 * s, M.shirt)
      .k(0.01 * s)
      .rag(0.012 * s, PF.SPIKY | PF.RAG_END)
      .seed(i * 13 + 5);
  }
  // Arms torn off at the shoulder: the stump is part of the trunk (it wins over the
  // shirt there), with a knob of bone and blood running down the side.
  for (let side = 1; side >= -1; side -= 2) {
    if ((st.severed[side > 0 ? 0 : 1] ?? 0) < 2) continue;
    f.ball(f.at(r.chest, side * (shX + 0.02), -0.035, 0), 0.068 * s, M.gore)
      .rag(0.012 * s, PF.SPIKY)
      .seed(9 + side)
      .z(-0.08)
      .k(0.02 * s);
    f.ball(f.at(r.chest, side * (shX + 0.055), -0.03, 0.01), 0.02 * s, M.bone).z(-0.1).k(0.004 * s);
    f.decal(f.at(r.chest, side * shX, -0.06, 0.06), f.at(r.spine, side * 0.17 * b, 0.12, 0.08), 0.03 * s, 0.012 * s, M.blood).flag(D).rag(0.008 * s);
  }
  // Clothing details (decals: paint only where the trunk is).
  const front = f.facing(f.at(r.spine, 0, 0.25, 0.1), spZ);
  torsoDetails(f, r, L, M, front, 0.11 * sb, b, s);
  torsoFolds(f, r, L, M, front, 0.11 * sb, b, s, hunch);
  if (L.outfit === 'flannel') {
    // Tool belt: a leather pouch on the left hip, a hammer hanging on the right.
    f.cone(f.at(r.hips, 0.12 * b, 0.03, 0.105), f.at(r.hips, 0.125 * b, -0.04, 0.115), 0.036 * s, 0.034 * s, M.pouch).k(0.005 * s);
    f.cone(f.at(r.hips, -0.13 * b, 0.02, 0.12), f.at(r.hips, -0.13 * b, -0.13, 0.13), 0.012 * s, 0.011 * s, M.handle).k(0.002 * s);
    f.cone(f.at(r.hips, -0.17 * b, 0.04, 0.125), f.at(r.hips, -0.09 * b, 0.04, 0.125), 0.016 * s, 0.016 * s, M.steel).k(0.002 * s);
  }
  if (st.torso) st.torso(f);

  // ── Head ───────────────────────────────────────────────────────────────
  if (!st.headless) {
    // Head loll: the dead tip and roll their heads, slowly and each differently.
    const roll = L.dead ? 0.1 * Math.sin(t * 0.9 + sd) + 0.08 * (hash(sd * 4.1) - 0.5) : 0.03 * Math.sin(t * 1.7 + sd);
    const pitch = L.dead ? 0.06 + 0.05 * Math.sin(t * 0.7 + sd * 1.7) : 0;
    paintHead(f, r, tilted(r.head, pitch, roll), L, M, st, s);
  } else {
    // Neck stump: torn flesh and a knob of spine.
    f.layer(0.02 * s, PART.TORSO);
    f.cone(f.at(r.neck, 0, 0.02, 0), f.at(r.neck, 0, 0.1, 0.0), 0.054 * s, 0.05 * s, M.gore)
      .rag(0.01 * s, PF.SPIKY | PF.RAG_END)
      .seed(3);
    f.ball(f.at(r.neck, 0, 0.115, -0.01), 0.018 * s, M.bone);
  }

  // ── Arms ───────────────────────────────────────────────────────────────
  for (let side = 1; side >= -1; side -= 2) {
    const sev = st.severed[side > 0 ? 0 : 1] ?? 0;
    const arm = side > 0 ? r.armL : r.armR;
    if (sev >= 2) continue; // (stump painted with the trunk)
    const mid = f.depth(f.at(arm.shoulder, 0, -0.25, 0));
    f.layer(0.035 * s, PART.LIMB, mid > torsoDepth + 0.05 ? -0.1 : 0);
    paintArm(f, arm.shoulder, sev >= 1 ? null : arm.elbow, side, L, M, s * (st.armW?.[side > 0 ? 0 : 1] ?? 1), st, r.chest);
  }

  // ── Legs ───────────────────────────────────────────────────────────────
  if (!st.legless) {
    for (let side = 1; side >= -1; side -= 2) {
      const leg = side > 0 ? r.legL : r.legR;
      const mid = f.depth(f.at(leg.knee, 0, 0, 0));
      f.layer(0.04 * s, PART.LIMB, mid > torsoDepth + 0.06 ? -0.09 : 0);
      paintLeg(f, leg.hip, leg.knee, side, L, M, s * (st.legW ?? 1));
    }
  }
  if (st.extra) st.extra(f);

  if (st.squash > 0) {
    const q = st.squash;
    f.warp(f.at(r.hips, 0, -0.9, 0), 1 + 0.07 * q, 1 - 0.06 * q);
  }
  return true;
}

/**
 * One horizontal slice of the trunk on joint `j`: a pill across the body at height
 * `y` (joint units), half-width `hw`, half-height `rv` (both × bulk already), depth
 * half `rd` toward z; `z` pushes it forward (hunch).
 */
function trunkSlice(f: PixelFigure, j: THREE.Object3D, up: THREE.Vector3, fwd: THREE.Vector3, y: number, z: number, hw: number, rv: number, rd: number, s: number, mat: number): PixelFigure {
  const x = Math.max(0.001, hw - rv);
  return f.coneE(f.at(j, -x, y, z), f.at(j, x, y, z), up, fwd, rv * s, rd * s, rv * s, rd * s, mat).k(0.06 * s);
}

/**
 * Smears: when the head or a hand jumped more than a few texels since the last
 * redraw (a lunge, a swipe), a flat streak trails behind it for that frame —
 * the classic hand-drawn motion smear. Drawn behind the body, hits nothing.
 */
function paintSmears(f: PixelFigure, r: HumanoidRig, M: Mats, st: HumanPose, s: number) {
  const mem = st.mem!;
  const head = f.at(r.head, 0, 0.13, 0.02);
  const hl = f.at(r.armL.elbow, 0, -0.3, 0);
  const hr = f.at(r.armR.elbow, 0, -0.3, 0);
  const fresh = mem.valid && st.time - mem.t < 0.2 && st.time > mem.t;
  if (fresh) {
    f.layer(0.02 * s, PART.NONE, 0.05, 0.25);
    smear(f, mem.head, head, 0.1 * s, M.skin, st.smear!);
    smear(f, mem.handL, hl, 0.05 * s, M.skin, st.smear!);
    smear(f, mem.handR, hr, 0.05 * s, M.skin, st.smear!);
  }
  mem.head.copy(head);
  mem.handL.copy(hl);
  mem.handR.copy(hr);
  mem.t = st.time;
  mem.valid = true;
}

function smear(f: PixelFigure, from: THREE.Vector3, to: THREE.Vector3, r: number, mat: number, amount: number) {
  const a = f.project(from, P0);
  const b = f.project(to, P1);
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  if (px < 5) return;
  // A tapering streak from the part back along its path (at most ~70 % of the jump).
  const tail = f.mix(to, from, Math.min(0.7, 0.7 * amount));
  f.cone(to, tail, r * 0.85, r * 0.25, mat).flag(PF.FLAT).tone(0.12).min(0.5);
}

/** Drawn creases: Z folds at the waist on a hunched trunk, armpit pulls, shoulder blades from behind. */
function torsoFolds(f: PixelFigure, r: HumanoidRig, L: HumanLook, M: Mats, front: number, fz: number, b: number, s: number, hunch: number) {
  const sp = r.spine;
  const fold = M.shirt;
  if (front > 0.1 && hunch > 0.3 && L.vest === null) {
    // Belly folds where the shirt bunches over the hunch: two short broken strokes.
    f.decal(f.at(sp, -0.09 * b, 0.12, fz), f.at(sp, -0.03 * b, 0.105, fz), 0.006 * s, 0.006 * s, fold).flag(D | PF.SHADE_ONLY).tone(-0.38).min(0.5);
    f.decal(f.at(sp, 0.02 * b, 0.135, fz), f.at(sp, 0.08 * b, 0.115, fz), 0.006 * s, 0.006 * s, fold).flag(D | PF.SHADE_ONLY).tone(-0.38).min(0.5);
    f.decal(f.at(sp, -0.05 * b, 0.07, fz), f.at(sp, 0.03 * b, 0.06, fz), 0.006 * s, 0.006 * s, fold).flag(D | PF.SHADE_ONLY).tone(-0.3).min(0.5);
  }
  if (front > 0.1) {
    // Armpit pulls: strokes from each armpit toward the breastbone (a lit ridge beside them).
    for (let side = 1; side >= -1; side -= 2) {
      const x0 = side * 0.17 * b;
      f.decal(f.at(sp, x0, 0.37, fz), f.at(sp, side * 0.1 * b, 0.3, fz), 0.006 * s, 0.006 * s, fold).flag(D | PF.SHADE_ONLY).tone(-0.32).min(0.5);
      f.decal(f.at(sp, x0 - side * 0.01, 0.4, fz), f.at(sp, side * 0.11 * b, 0.335, fz), 0.005 * s, 0.005 * s, fold).flag(D | PF.SHADE_ONLY).tone(0.2).min(0.45);
    }
  } else if (front < -0.2) {
    // From behind: shoulder blades and the spine groove.
    for (let side = 1; side >= -1; side -= 2) {
      f.decal(f.at(sp, side * 0.06 * b, 0.4, -fz), f.at(sp, side * 0.1 * b, 0.28, -fz), 0.006 * s, 0.006 * s, fold).flag(D | PF.SHADE_ONLY).tone(-0.3).min(0.5);
    }
    f.decal(f.at(sp, 0, 0.42, -fz), f.at(sp, 0, 0.12, -fz), 0.006 * s, 0.006 * s, fold).flag(D | PF.SHADE_ONLY).tone(-0.22).min(0.5);
  }
}

/** Trunk decals: outfit details, stains, wounds. */
function torsoDetails(f: PixelFigure, r: HumanoidRig, L: HumanLook, M: Mats, front: number, fz: number, b: number, s: number) {
  const sp = r.spine;
  const seenFront = front > -0.15;
  const o = L.outfit;
  if (seenFront) {
    // Collar / neckline (skin V for scrubs and tees).
    if (o === 'nurse' || o === 'patient' || (o === 'casual' && L.sleeves !== 'long')) {
      f.decal(f.at(sp, -0.055, 0.46, fz), f.at(sp, 0, 0.38, fz), 0.02 * s, 0.012 * s, M.skin).flag(D);
      f.decal(f.at(sp, 0.055, 0.46, fz), f.at(sp, 0, 0.38, fz), 0.02 * s, 0.012 * s, M.skin).flag(D);
    }
    if (M.inner) {
      // Under-shirt in an open front / at the collar.
      if (L.jacket !== null) f.decal(f.at(sp, 0, 0.455, fz), f.at(sp, 0, 0.2, fz), 0.062 * s, 0.01 * s, M.inner).flag(D);
      else if (o === 'biker' || o === 'casual') f.decal(f.at(sp, 0, 0.46, fz), f.at(sp, 0, 0.04, fz), 0.055 * s, 0.045 * s, M.inner).flag(D);
      else f.decal(f.at(sp, -0.04, 0.455, fz), f.at(sp, 0.04, 0.455, fz), 0.022 * s, 0.022 * s, M.inner).flag(D);
    }
    if (o === 'office' || o === 'doctor' || o === 'scientist' || o === 'cop') {
      // Shirt collar points.
      const col = L.jacket !== null || o === 'doctor' ? M.collar : M.shirt;
      f.decal(f.at(sp, -0.06, 0.465, fz), f.at(sp, -0.015, 0.42, fz), 0.016 * s, 0.01 * s, col).flag(D).tone(0.08);
      f.decal(f.at(sp, 0.06, 0.465, fz), f.at(sp, 0.015, 0.42, fz), 0.016 * s, 0.01 * s, col).flag(D).tone(0.08);
    }
    if (M.tie) {
      // Knot, then the blade widening down to a point.
      f.decal(f.at(sp, 0, 0.44, fz), f.at(sp, 0.002, 0.425, fz), 0.016 * s, 0.014 * s, M.tie).flag(D);
      f.decal(f.at(sp, 0.002, 0.415, fz), f.at(sp, 0.008, 0.2, fz), 0.009 * s, 0.02 * s, M.tie).flag(D);
    }
    if (M.badge) f.decal(f.at(sp, 0.09 * b, 0.34, fz), f.at(sp, 0.09 * b, 0.32, fz), 0.017 * s, 0.017 * s, M.badge).flag(D);
    if (o === 'doctor' || o === 'scientist') {
      // Stethoscope / pens.
      f.decal(f.at(sp, -0.07, 0.44, fz), f.at(sp, 0.0, 0.3, fz), 0.006 * s, 0.006 * s, M.cord).flag(D);
      f.decal(f.at(sp, 0.07, 0.44, fz), f.at(sp, 0.0, 0.3, fz), 0.006 * s, 0.006 * s, M.cord).flag(D);
    }
    if (o === 'nurse') {
      // ID card on a lanyard.
      f.decal(f.at(sp, 0.06 * b, 0.4, fz), f.at(sp, 0.085 * b, 0.33, fz), 0.005 * s, 0.005 * s, M.lanyard).flag(D);
      f.decal(f.at(sp, 0.085 * b, 0.32, fz), f.at(sp, 0.085 * b, 0.29, fz), 0.02 * s, 0.02 * s, M.card).flag(D);
    }
    // Open jacket edges / lapels.
    if (M.jacket) {
      f.decal(f.at(sp, -0.06, 0.45, fz), f.at(sp, -0.04, 0.22, fz), 0.012 * s, 0.01 * s, M.jacket).flag(D).tone(-0.12);
      f.decal(f.at(sp, 0.06, 0.45, fz), f.at(sp, 0.04, 0.22, fz), 0.012 * s, 0.01 * s, M.jacket).flag(D).tone(-0.12);
    }
  }
  // Vests wrap all the way round (hi-vis, tactical).
  if (M.vest) {
    // (A horizontal capsule: it covers the trunk from the hem up, never the belt / hips.)
    f.decal(f.at(sp, -0.1 * b, 0.24, 0), f.at(sp, 0.1 * b, 0.24, 0), 0.205 * s, 0.205 * s, M.vest).flag(D);
    if (o === 'worker') {
      // Reflective bands (2 texels, a glint) + the open front with its zip seams.
      f.decal(f.at(sp, -0.2 * b, 0.16, 0), f.at(sp, 0.2 * b, 0.16, 0), 0.018 * s, 0.018 * s, M.band).flag(D);
      f.decal(f.at(sp, -0.2 * b, 0.29, 0), f.at(sp, 0.2 * b, 0.29, 0), 0.018 * s, 0.018 * s, M.band).flag(D);
      if (seenFront) {
        f.decal(f.at(sp, 0, 0.45, fz), f.at(sp, 0, 0.1, fz), 0.03 * s, 0.025 * s, M.shirt).flag(D);
        for (let sd = 1; sd >= -1; sd -= 2) {
          f.decal(f.at(sp, sd * 0.04, 0.44, fz), f.at(sp, sd * 0.035, 0.09, fz), 0.006 * s, 0.006 * s, M.vest).flag(D | PF.SHADE_ONLY).tone(-0.3).min(0.5);
          f.decal(f.at(sp, sd * 0.13 * b, 0.44, fz), f.at(sp, sd * 0.15 * b, 0.32, fz), 0.006 * s, 0.006 * s, M.vest).flag(D | PF.SHADE_ONLY).tone(-0.25).min(0.5);
        }
      }
    } else {
      f.decal(f.at(sp, -0.08, 0.22, fz + 0.03), f.at(sp, -0.08, 0.16, fz + 0.03), 0.035 * s, 0.035 * s, M.vest).flag(D).tone(0.1);
      f.decal(f.at(sp, 0.08, 0.22, fz + 0.03), f.at(sp, 0.08, 0.16, fz + 0.03), 0.035 * s, 0.035 * s, M.vest).flag(D).tone(0.1);
    }
  }
  // Belt across the hips.
  if (M.belt) {
    f.decal(f.at(r.hips, -0.18 * b, 0.05, 0.06), f.at(r.hips, 0.18 * b, 0.05, 0.06), 0.024 * s, 0.024 * s, M.belt).flag(D);
    if (seenFront) f.decal(f.at(r.hips, 0, 0.05, 0.11), f.at(r.hips, 0.0, 0.05, 0.11), 0.017 * s, 0.017 * s, M.buckle).flag(D);
  }
  if (o === 'flannel' && seenFront) {
    // Button placket.
    f.decal(f.at(sp, 0.005, 0.44, fz), f.at(sp, 0.005, 0.05, fz), 0.008 * s, 0.008 * s, M.shirt).flag(D | PF.SHADE_ONLY).tone(-0.2);
  }
  // Gore.
  if (L.dead && seenFront) {
    if (L.ribs !== 0) {
      f.decal(f.at(sp, L.ribs * 0.08 * b, 0.36, fz), f.at(sp, L.ribs * 0.07 * b, 0.2, fz), 0.065 * s, 0.055 * s, M.ribs).flag(D).rag(0.012 * s, PF.SPIKY);
    }
    if (L.chestBlood) {
      // Blood down the front from the mouth: a drip trail, not a bib.
      f.decal(f.at(sp, 0.01, 0.46, fz), f.at(sp, 0.025, 0.34, fz), 0.04 * s, 0.022 * s, M.blood)
        .flag(D)
        .rag(0.016 * s, PF.SPIKY | PF.RAG_END)
        .seed(4);
      f.decal(f.at(sp, 0.03, 0.34, fz), f.at(sp, 0.035, 0.24, fz), 0.012 * s, 0.008 * s, M.blood).flag(D).min(0.5);
      f.decal(f.at(sp, -0.02, 0.4, fz), f.at(sp, -0.025, 0.3, fz), 0.009 * s, 0.006 * s, M.blood).flag(D).min(0.5);
    }
    if (L.bellyWound !== 0) {
      f.decal(f.at(sp, L.bellyWound * 0.08, 0.14, fz), f.at(sp, L.bellyWound * 0.06, 0.1, fz), 0.05 * s, 0.04 * s, M.blood).flag(D).rag(0.012 * s, PF.SPIKY);
    }
    if (L.bite !== 0) {
      f.decal(f.at(sp, L.bite * 0.11 * b, 0.07, fz), f.at(sp, L.bite * 0.09 * b, 0.05, fz), 0.045 * s, 0.035 * s, M.skin).flag(D).rag(0.012 * s, PF.SPIKY).seed(7);
      f.decal(f.at(sp, L.bite * 0.1 * b, 0.065, fz), f.at(sp, L.bite * 0.1 * b, 0.06, fz), 0.02 * s, 0.02 * s, M.blood).flag(D);
    }
    // Torn holes showing rotten skin, and a spatter of blood across the cloth.
    for (let i = 0; i < 2; i++) {
      const hx = (hash(L.seed * 1.7 + i * 5.3) * 2 - 1) * 0.12 * b;
      const hy = 0.12 + hash(L.seed * 2.3 + i * 3.1) * 0.24;
      const hr = (0.022 + hash(L.seed + i * 9.1) * 0.02) * s;
      f.decal(f.at(sp, hx, hy, fz), f.at(sp, hx + 0.01, hy - 0.03, fz), hr, hr * 0.8, M.skin).flag(D).rag(0.01 * s, PF.SPIKY).seed(40 + i);
      // Dark wound inside, a short drip below it.
      f.decal(f.at(sp, hx + 0.004, hy - 0.01, fz), f.at(sp, hx + 0.006, hy - 0.018, fz), hr * 0.45, hr * 0.35, M.skin).flag(D | PF.SHADE_ONLY).tone(-0.45);
      f.decal(f.at(sp, hx + 0.008, hy - 0.03, fz), f.at(sp, hx + 0.01, hy - 0.07, fz), 0.006 * s, 0.005 * s, M.blood).flag(D);
    }
    const bx = (hash(L.seed * 3.9) * 2 - 1) * 0.1 * b;
    f.decal(f.at(sp, bx, 0.3, fz), f.at(sp, bx + 0.05, 0.16, fz), 0.03 * s, 0.012 * s, M.blood).flag(D).rag(0.018 * s, PF.SPIKY).seed(51);
  }
  // Back view: a long bloody smear down the back.
  if (L.dead && front < -0.2) {
    f.decal(f.at(sp, 0.03, 0.4, -fz), f.at(sp, 0.06, 0.1, -fz), 0.04 * s, 0.02 * s, M.blood).flag(D).rag(0.015 * s, PF.SPIKY).seed(52);
  }
}

/** Head, face and hair. `h` is the head joint, possibly tilted (head loll). */
function paintHead(f: PixelFigure, r: HumanoidRig, h: THREE.Object3D, L: HumanLook, M: Mats, st: HumanPose, s: number) {
  const hs = L.headSize;
  const face = f.facing(f.at(h, 0, 0.14 * hs, 0.12 * hs), f.dir(h, 0, 0, 1));
  // Long hair falls behind the head and shoulders (own layer, behind).
  if (L.hair !== null && L.longHair) {
    f.layer(0.03 * s, PART.NONE);
    const sway = Math.sin(st.time * 3.1 + L.seed) * 0.015;
    f.cone(f.at(h, 0, 0.2 * hs, -0.06 * hs), f.at(h, sway, -0.05, -0.1 * hs), 0.105 * hs * s, 0.085 * s, M.hair)
      .rag(0.014 * s, PF.SPIKY | PF.RAG_END)
      .seed(11)
      .z(0.05);
  }
  f.layer(0.03 * s, PART.HEAD);
  const jaw = st.jaw;
  // Cranium: a projected ellipsoid, a touch deeper than wide.
  f.ellipsoid(h, 0, 0.15 * hs, -0.004, 0.114 * hs, 0.128 * hs, 0.126 * hs, M.face);
  // Jaw + chin (drops open around the hinge): square on the living, gaunt on the dead.
  const ja = jaw * 0.55;
  const cy = 0.035 - Math.sin(ja) * 0.06;
  const cz = 0.085 * Math.cos(ja) - 0.01;
  f.cone(f.at(h, 0, 0.085 * hs, -0.035 * hs), f.at(h, 0, cy * hs, cz * hs), 0.08 * hs * s, (L.dead ? 0.042 : 0.05) * hs * s, M.face).k(0.03 * s);
  // Cheekbones + a heavy brow ridge (they break the egg outline of the head).
  if (L.dead) {
    f.cone(f.at(h, -0.075 * hs, 0.172 * hs, 0.092 * hs), f.at(h, 0.075 * hs, 0.172 * hs, 0.092 * hs), 0.024 * hs * s, 0.024 * hs * s, M.face).k(0.012 * s);
  }
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.ball(f.at(h, sd * 0.078 * hs, 0.11 * hs, 0.07 * hs), 0.03 * hs * s, M.face).k(0.015 * s);
  }
  // Nose and ears stick out of the silhouette in profile.
  f.cone(f.at(h, 0, 0.145 * hs, 0.118 * hs), f.at(h, 0, 0.104 * hs, 0.148 * hs), 0.017 * hs * s, 0.021 * hs * s, M.face).k(0.01 * s);
  for (let sd = 1; sd >= -1; sd -= 2) {
    f.cone(f.at(h, sd * 0.108 * hs, 0.152 * hs, -0.012), f.at(h, sd * 0.116 * hs, 0.126 * hs, -0.018), 0.019 * hs * s, 0.015 * hs * s, M.face).k(0.008 * s);
  }
  // Hair cap: sits on the skull, its front edge is the hairline.
  if (L.hair !== null) {
    // Under a hat that covers the crown the cap sits lower (a nurse cap or bandage doesn't).
    const crownHat = L.hat !== null && L.outfit !== 'nurse' && L.outfit !== 'patient';
    const top = crownHat ? 0.17 : 0.2;
    f.ellipsoid(h, 0, top * hs, -0.022 * hs, 0.124 * hs, 0.088 * hs, 0.132 * hs, M.hair)
      .rag(0.012 * s, PF.SPIKY)
      .seed(21)
      .z(-0.03)
      .k(0.01 * s);
    // Back of the head.
    f.ellipsoid(h, 0, 0.14 * hs, -0.06 * hs, 0.116 * hs, 0.105 * hs, 0.075 * hs, M.hair).z(-0.01).k(0.01 * s);
    if (L.bun) f.ball(f.at(h, 0, 0.2 * hs, -0.14 * hs), 0.05 * hs * s, M.hair).part(PART.NONE).k(0.02 * s);
    if (L.dead && !crownHat) {
      // Matted tufts sticking up and out (each zombie its own).
      for (let i = 0; i < 4; i++) {
        const a = hash(L.seed * 3.3 + i * 1.9) * 2 - 1;
        const x = a * 0.08 * hs;
        const z = (hash(L.seed + i * 5.1) - 0.6) * 0.16 * hs;
        const len = (0.045 + 0.04 * hash(L.seed * 1.1 + i)) * hs;
        f.cone(f.at(h, x, 0.25 * hs, z), f.at(h, x + a * len * 0.9, 0.25 * hs + len, z - len * 0.4), 0.018 * hs * s, 0.004 * s, M.hair)
          .k(0.01 * s)
          .z(-0.03)
          .min(0.5);
      }
    }
  }
  if (M.beard && face > -0.2) {
    f.decal(f.at(h, -0.07 * hs, 0.08 * hs, 0.1 * hs), f.at(h, 0.07 * hs, 0.08 * hs, 0.1 * hs), 0.04 * hs * s, 0.04 * hs * s, M.beard).rag(0.006 * s, PF.SPIKY);
  }

  // ── Face (only while it's turned to the camera) ──
  if (face > 0.05) {
    const ey = 0.148 * hs;
    const ez = 0.114 * hs;
    // Head height in texels picks hand-pixelled stamps (eyes, mouth) or, when tiny, a couple of pixels.
    const headTx = tx(f, f.at(h, 0, 0.13 * hs, 0), 0.26 * hs * s);
    const useStamps = headTx >= 9;
    const size = stampSize(headTx);
    const cellM = (0.26 * hs * s) / (size === 0 ? 12 : size === 1 ? 18 : 26);
    const nose = f.project(f.at(h, 0, 0.12 * hs, 0.14 * hs), P0);
    const nx = nose.x;
    for (let sd = 1; sd >= -1; sd -= 2) {
      const eye = f.at(h, sd * 0.048 * hs, ey, ez);
      // Only the eye on the near side when nearly in profile.
      if (f.facing(eye, f.dir(h, sd * 0.55, 0, 1)) < 0.12) continue;
      const mirror = nx < f.project(eye, P1).x;
      if (useStamps) {
        if (L.dead) f.stamp(eye, cellM, STAMP.zeye[size], M.eyeGlow, 0, 0, 0, mirror);
        else f.stamp(eye, cellM, (st.face === 'scream' ? STAMP.seye : STAMP.leye)[size], 0, M.eyeWhite, M.pupil, L.hair !== null ? M.hair : M.skin, mirror);
      } else if (L.dead) {
        f.decal(f.at(h, sd * 0.05 * hs, ey + 0.004, ez), f.at(h, sd * 0.044 * hs, ey - 0.006, ez), 0.022 * hs * s, 0.018 * hs * s, M.skin).flag(D | PF.SHADE_ONLY).tone(-0.55);
        f.decal(eye, eye, 0.009 * hs * s, 0.009 * hs * s, M.eyeGlow).flag(D | PF.GLOW).min(0.5);
      } else {
        f.decal(eye, eye, 0.012 * hs * s, 0.012 * hs * s, M.pupil).flag(D).min(0.5);
      }
    }
    if (L.outfit === 'scientist') {
      // Glasses: two pale lenses, and the bridge.
      for (let sd = 1; sd >= -1; sd -= 2) f.decal(f.at(h, sd * 0.05 * hs, ey, ez + 0.008), f.at(h, sd * 0.046 * hs, ey, ez + 0.008), 0.022 * hs * s, 0.02 * hs * s, M.lens).flag(D).tone(0.1);
      f.decal(f.at(h, -0.03 * hs, ey + 0.008, ez + 0.01), f.at(h, 0.03 * hs, ey + 0.008, ez + 0.01), 0.006 * hs * s, 0.006 * hs * s, M.frame).flag(D);
    }
    // Mouth: hand-pixelled by how far the jaw hangs open (closed / open / gaping).
    const open = st.face === 'calm' ? 0.05 : Math.max(jaw, L.mouthOpen ? 0.25 : 0.05);
    const my = 0.074 * hs - open * 0.012 * hs;
    const mouth = f.at(h, 0, my, 0.118 * hs);
    if (useStamps) {
      const mm = nx < f.project(mouth, P1).x - 0.5;
      if (L.dead) f.stamp(mouth, cellM, STAMP.zmouth[open < 0.3 ? 0 : open < 0.62 ? 1 : 2][size], M.mouth, M.teeth, 0, 0, mm);
      else f.stamp(mouth, cellM, STAMP.lmouth[st.face === 'scream' ? 1 : 0][size], M.mouth, M.teeth, 0, 0, mm);
    } else {
      const mw = 0.04 * hs;
      const mr = (0.008 + open * 0.02) * hs * s;
      f.decal(f.at(h, -mw, my, 0.11 * hs), f.at(h, mw, my, 0.11 * hs), mr, mr, M.mouth).flag(D);
    }
    if (L.dead && hash(L.seed * 5.1) < 0.35) {
      // Rotted-away nose: a dark hole.
      const nh = f.at(h, 0, 0.112 * hs, 0.13 * hs);
      f.decal(nh, nh, 0.011 * hs * s, 0.011 * hs * s, M.mouth).flag(D).min(0.5);
    }
    if (L.dead && (L.drool || jaw > 0.4)) {
      const dy = Math.min(0.03, (st.time * 0.07 + L.seed) % 0.04);
      f.decal(f.at(h, 0.02 * hs, my - 0.01 * hs, 0.112 * hs), f.at(h, 0.022 * hs, my - 0.04 * hs - dy, 0.105 * hs), 0.009 * hs * s, 0.006 * hs * s, M.blood).flag(D).min(0.5);
    }
    if (L.faceWound !== 0) {
      f.decal(f.at(h, L.faceWound * 0.065 * hs, 0.11 * hs, 0.1 * hs), f.at(h, L.faceWound * 0.06 * hs, 0.09 * hs, 0.1 * hs), 0.025 * hs * s, 0.02 * hs * s, M.blood).flag(D).rag(0.006 * s, PF.SPIKY);
    }
  }
  // Hats: their own layer (outlined, composited by depth over the head).
  if (M.hat) {
    // (A hat is on the head joint: a shot there is a head shot.)
    f.layer(0.01 * s, PART.HEAD);
    paintHat(f, h, L, M, s, hs);
  }
}

/**
 * A hat brim / visor: two crossing cones (side to side, back to front) rather than a
 * flat ellipsoid — a projected ellipse carries one depth, so a tilted brim's far half
 * would cover the face; cones get each end's true depth.
 */
function brim(f: PixelFigure, h: THREE.Object3D, y: number, z0: number, z1: number, wx: number, r: number, mat: number, k: number, tone: number) {
  f.cone(f.at(h, -wx, y, (z0 + z1) / 2), f.at(h, wx, y, (z0 + z1) / 2), r, r, mat).k(k).tone(tone);
  f.cone(f.at(h, 0, y, z0), f.at(h, 0, y - r * 0.3, z1), r * 1.2, r, mat).k(k).tone(tone);
}

function paintHat(f: PixelFigure, h: THREE.Object3D, L: HumanLook, M: Mats, s: number, hs: number) {
  const m = M.hat;
  switch (L.outfit) {
    case 'worker':
      // Dome + brim.
      f.ellipsoid(h, 0, 0.245 * hs, -0.005, 0.128 * hs, 0.075 * hs, 0.138 * hs, m).k(0.005 * s);
      brim(f, h, 0.205 * hs, -0.11 * hs, 0.2 * hs, 0.135 * hs, 0.018 * hs * s, m, 0.012 * s, -0.05);
      break;
    case 'cop':
      f.ellipsoid(h, 0, 0.255 * hs, -0.005, 0.124 * hs, 0.05 * hs, 0.13 * hs, m).k(0.01 * s);
      f.cone(f.at(h, -0.07 * hs, 0.215 * hs, 0.11 * hs), f.at(h, 0.07 * hs, 0.215 * hs, 0.11 * hs), 0.014 * hs * s, 0.014 * hs * s, M.hatTrim).k(0.003 * s);
      f.cone(f.at(h, 0, 0.22 * hs, 0.06 * hs), f.at(h, 0, 0.212 * hs, 0.155 * hs), 0.016 * hs * s, 0.012 * hs * s, M.hatTrim).k(0.003 * s);
      break;
    case 'ranger':
      f.ellipsoid(h, 0, 0.255 * hs, -0.005, 0.12 * hs, 0.065 * hs, 0.128 * hs, m).k(0.01 * s);
      brim(f, h, 0.21 * hs, -0.2 * hs, 0.21 * hs, 0.2 * hs, 0.016 * hs * s, m, 0.02 * s, -0.04);
      f.decal(f.at(h, -0.12 * hs, 0.225 * hs, 0.0), f.at(h, 0.12 * hs, 0.225 * hs, 0.0), 0.012 * hs * s, 0.012 * hs * s, M.hatTrim).flag(D);
      break;
    case 'nurse': {
      f.ellipsoid(h, 0, 0.275 * hs, 0.03 * hs, 0.08 * hs, 0.035 * hs, 0.055 * hs, m).k(0.006 * s);
      if (f.facing(f.at(h, 0, 0.28 * hs, 0.085 * hs), f.dir(h, 0, 0, 1)) > 0.1) {
        f.decal(f.at(h, -0.014 * hs, 0.28 * hs, 0.085 * hs), f.at(h, 0.014 * hs, 0.28 * hs, 0.085 * hs), 0.005 * s, 0.005 * s, M.cross).flag(D | PF.NO_OUTLINE);
        f.decal(f.at(h, 0, 0.294 * hs, 0.085 * hs), f.at(h, 0, 0.266 * hs, 0.085 * hs), 0.005 * s, 0.005 * s, M.cross).flag(D | PF.NO_OUTLINE);
      }
      break;
    }
    case 'patient':
      // Head bandage: a band round the skull.
      f.ellipsoid(h, 0, 0.215 * hs, 0.0, 0.124 * hs, 0.032 * hs, 0.13 * hs, m).k(0.004 * s);
      break;
    case 'soldier':
      f.ellipsoid(h, 0, 0.215 * hs, -0.005, 0.138 * hs, 0.1 * hs, 0.15 * hs, m).part(PART.ARMOR).k(0.01 * s);
      break;
    default:
      // Beanie / cap / bandana.
      f.ellipsoid(h, 0, 0.225 * hs, -0.01, 0.12 * hs, 0.07 * hs, 0.128 * hs, m).k(0.01 * s);
  }
}

/**
 * One arm (current layer): deltoid cap → biceps tapering to a bony elbow →
 * forearm swelling below the elbow and narrowing to a thin wrist → cuff → hand.
 * `elbow` null = the forearm is gone (stump at the elbow).
 */
function paintArm(f: PixelFigure, sh: THREE.Object3D, elbow: THREE.Object3D | null, side: number, L: HumanLook, M: Mats, s: number, st: HumanPose, chest: THREE.Object3D | null) {
  const a = L.armLength;
  const bare = L.sleeves === 'none';
  const upperMat = bare ? M.skin : M.sleeve;
  const shortSleeve = L.sleeves === 'short';
  // Deltoid: a cap that swells past the upper arm (shoulder mass).
  f.cone(f.at(sh, 0.008 * side, 0.034, 0.004), f.at(sh, 0.01 * side, -0.115 * a, 0.006), 0.063 * s, 0.05 * s, upperMat).k(0.03 * s);
  // Upper arm: biceps in front, tapering into the elbow.
  f.cone(f.at(sh, 0, -0.07 * a, 0.006), f.at(sh, 0, -0.285 * a, -0.004), 0.051 * s, 0.04 * s, upperMat);
  if (shortSleeve) {
    f.mat2(M.skin, 0.42);
    // Sleeve hem: a ragged, flared cuff standing off the arm.
    f.cone(f.at(sh, 0, -0.085 * a, 0), f.at(sh, 0, -0.155 * a, 0), 0.06 * s, 0.064 * s, M.sleeve)
      .k(0.006 * s)
      .rag((L.dead ? 0.01 : 0.003) * s, PF.SPIKY | PF.RAG_END)
      .seed(31 + side);
  }
  if (!elbow) {
    // Forearm blown off: ragged stump with a knob of bone, blood running down.
    f.ball(f.at(sh, 0, -0.3 * a, 0), 0.052 * s, M.gore)
      .rag(0.01 * s, PF.SPIKY)
      .seed(17 + side)
      .z(-0.05);
    f.ball(f.at(sh, 0, -0.35 * a, 0), 0.018 * s, M.bone).z(-0.08);
    f.decal(f.at(sh, 0, -0.27 * a, 0.03), f.at(sh, 0, -0.18 * a, 0.035), 0.03 * s, 0.014 * s, M.blood).flag(D).rag(0.006 * s);
    return;
  }
  const longSleeve = L.sleeves === 'long';
  const foreMat = longSleeve ? M.sleeve : M.skin;
  // Elbow: a bony point on the back of the joint.
  f.ball(f.at(elbow, 0, 0.0, -0.014), 0.041 * s, longSleeve ? M.sleeve : M.skin).k(0.02 * s);
  // Forearm: muscle swell under the elbow, narrowing to a thin wrist.
  f.cone(f.at(elbow, 0, 0.01, 0.004), f.at(elbow, 0, -0.095 * a, 0.008), 0.044 * s, 0.05 * s, foreMat);
  f.cone(f.at(elbow, 0, -0.08 * a, 0.006), f.at(elbow, 0, -0.24 * a, 0.0), 0.049 * s, 0.031 * s, foreMat);
  if (longSleeve) {
    // Cuff: a wider band that hangs over the wrist (torn on the dead).
    f.cone(f.at(elbow, 0, -0.19 * a, 0.002), f.at(elbow, 0, -0.232 * a, 0.002), 0.042 * s, 0.043 * s, M.sleeve)
      .k(0.004 * s)
      .rag((L.dead ? 0.008 : 0.002) * s, PF.SPIKY | PF.RAG_END)
      .seed(41 + side);
  }
  // Drawn creases at the inner elbow: a Z fold on sleeves, a skin crease when bare.
  const bend = 1 - f.dir(sh, 0, -1, 0).dot(f.dir(elbow, 0, -1, 0));
  if (bend > 0.04 && f.facing(f.at(elbow, 0, 0, 0.05), f.dir(elbow, 0, 0, 1)) > 0) {
    const c = Math.min(1, bend * 3);
    const cm = longSleeve ? M.sleeve : M.skin;
    f.decal(f.at(elbow, side * 0.03, 0.035, 0.05), f.at(elbow, -side * 0.012, 0.008, 0.05), 0.006 * s, 0.006 * s, cm).flag(D | PF.SHADE_ONLY).tone(-0.4 * c).min(0.5);
    if (longSleeve) {
      f.decal(f.at(elbow, -side * 0.012, 0.008, 0.05), f.at(elbow, side * 0.02, -0.03, 0.05), 0.006 * s, 0.006 * s, cm).flag(D | PF.SHADE_ONLY).tone(-0.34 * c).min(0.5);
      f.decal(f.at(elbow, side * 0.034, 0.05, 0.05), f.at(elbow, side * 0.034, 0.05, 0.05), 0.007 * s, 0.007 * s, cm).flag(D | PF.SHADE_ONLY).tone(0.22).min(0.5);
    }
  }
  if (longSleeve && L.dead && hash(L.seed * 6.7 + side) < 0.45) {
    // A rip in the sleeve showing rotten skin.
    f.decal(f.at(elbow, 0, -0.1 * a, 0.045), f.at(elbow, 0.01, -0.15 * a, 0.045), 0.02 * s, 0.016 * s, M.skin).flag(D).rag(0.008 * s, PF.SPIKY).seed(70 + side);
  }
  if (L.dead && L.armWound === side) {
    f.decal(f.at(elbow, 0, -0.08 * a, 0.03), f.at(elbow, 0, -0.14 * a, 0.03), 0.04 * s, 0.035 * s, M.blood).flag(D).rag(0.008 * s);
  }
  paintHand(f, elbow, side, L, M, s, a, st.time, st.hand ?? (L.dead ? HAND.CLAW : HAND.OPEN), chest);
}

// Hand frame (module scratch: one hand is painted at a time).
const hWrist = new THREE.Vector3();
const hAlong = new THREE.Vector3();
const hSpread = new THREE.Vector3();
const hThick = new THREE.Vector3();
let hA = 1;
let hS = 1;
/** Hand-frame point: `y` along the arm (elbow units), `x` across the fan, `z` through the palm. */
function hp(f: PixelFigure, y: number, x: number, z: number): THREE.Vector3 {
  return f.vec().copy(hWrist).addScaledVector(hAlong, (y - 0.255) * hA * hS).addScaledVector(hSpread, x * hS).addScaledVector(hThick, z * hS);
}

/**
 * A hand. Small and mid-sized hands (≲ 11 texels) are hand-pixelled stamps —
 * claw, open hand or fist, in 8 directions along the forearm on screen; bigger
 * ones are built from a palm and jointed fingers fanned out on screen.
 */
function paintHand(f: PixelFigure, el: THREE.Object3D, side: number, L: HumanLook, M: Mats, s: number, a: number, time: number, pose: number, chest: THREE.Object3D | null) {
  hWrist.copy(f.at(el, 0, -0.252 * a, 0.004));
  const len = tx(f, hWrist, 0.17 * s);
  if (len >= 3 && len < 11) {
    const e = f.project(f.at(el, 0, -0.05, 0), P0);
    const w = f.project(hWrist, P1);
    const dir = dir8(w.x - e.x, w.y - e.y);
    const size = len < 7 ? 0 : 1;
    // Thumbs toward the body for hands pointing straight up / down.
    let mirror = false;
    if ((dir === 2 || dir === 6) && chest) mirror = f.project(f.at(chest, 0, 0, 0), P0).x < w.x;
    f.stamp(hWrist, (0.17 * s) / (size === 0 ? 5 : 7.5), STAMP.hand[pose][size][dir], M.skin, 0, 0, 0, mirror, true);
    return;
  }
  // Large hands: fanned out on screen. The spread axis is ⟂ both the forearm and the
  // view (the rig never turns its palms, so a raised hand would otherwise show its
  // thin edge as a spike).
  hAlong.copy(f.dir(el, 0, -1, 0));
  const view = f.vec().subVectors(f.eye, hWrist).normalize();
  const cr = f.vec().crossVectors(hAlong, view);
  const cl = cr.length();
  const jz = f.dir(el, 0, 0, 1);
  hSpread.copy(cl > 0.35 ? cr.divideScalar(cl) : jz);
  // Keep the thumb on the joint's front edge (its +Z side).
  if (hSpread.dot(jz) < 0) hSpread.negate();
  hThick.crossVectors(hSpread, hAlong).normalize();
  hA = a;
  hS = s;
  // Palm, knuckles.
  f.coneE(hp(f, 0.255, 0, 0), hp(f, 0.322, 0, 0), hThick, hSpread, 0.022 * s, 0.036 * s, 0.02 * s, 0.043 * s, M.skin).k(0.012 * s);
  if (pose === HAND.FIST) {
    f.coneE(hp(f, 0.3, 0, 0.01), hp(f, 0.34, 0, -0.01), hThick, hSpread, 0.03 * s, 0.045 * s, 0.028 * s, 0.042 * s, M.skin).k(0.01 * s);
    f.cone(hp(f, 0.28, 0.04, 0), hp(f, 0.31, 0.03, -0.02), 0.015 * s, 0.013 * s, M.skin).k(0.004 * s);
    return;
  }
  // Fingers: zombies claw (curled, splayed, twitching), the living keep them straighter.
  const claw = pose === HAND.CLAW;
  const curl = claw ? 0.6 + 0.25 * Math.sin(time * 6 + side) : 0.15;
  for (let i = 0; i < 4; i++) {
    const x = 0.034 - i * 0.022;
    const flen = 0.075 - Math.abs(i - 1.3) * 0.01;
    const fan = x * (claw ? 0.6 : 0.3);
    const k0 = hp(f, 0.318, x, 0);
    const mid = hp(f, 0.318 + flen * 0.55, x + fan * 0.6, -curl * 0.012);
    const tip = hp(f, 0.318 + flen * (1 - curl * 0.35), x + fan, -curl * 0.045);
    f.cone(k0, mid, 0.0135 * s, 0.012 * s, M.skin).k(0.004 * s);
    f.cone(mid, tip, 0.012 * s, claw ? 0.006 * s : 0.009 * s, M.skin).k(0.004 * s);
  }
  // Thumb.
  f.cone(hp(f, 0.27, 0.034, 0), hp(f, 0.315, 0.07, -0.01), 0.015 * s, 0.011 * s, M.skin).k(0.004 * s);
}

/**
 * A leg: hip → thigh (quads forward) → knee knob → calf bulging behind → ankle;
 * trousers fall straighter and break over the shoe in a wider cuff.
 */
function paintLeg(f: PixelFigure, hip: THREE.Object3D, knee: THREE.Object3D, side: number, L: HumanLook, M: Mats, s: number) {
  const pm = M.pants;
  f.cone(f.at(hip, 0, 0.04, 0.004), f.at(hip, 0, -0.42, 0.012), 0.088 * s, 0.062 * s, pm);
  f.cone(f.at(hip, 0, -0.1, 0.022), f.at(hip, 0, -0.27, 0.02), 0.08 * s, 0.07 * s, pm).k(0.05 * s);
  // Knee: a knob at the front.
  f.ball(f.at(knee, 0, 0.004, 0.026), 0.058 * s, pm).k(0.03 * s);
  const torn = L.legWound === side && L.dead;
  if (L.bareLegs) {
    // Shin, calf muscle behind, slim ankle.
    f.cone(f.at(knee, 0, 0.0, 0.006), f.at(knee, 0, -0.37, 0.0), 0.056 * s, 0.034 * s, pm);
    f.cone(f.at(knee, 0, -0.06, -0.02), f.at(knee, 0, -0.22, -0.016), 0.062 * s, 0.05 * s, pm).k(0.04 * s);
  } else {
    // Trousers: straighter, the calf only a soft bulge; a cuff breaking over the shoe.
    f.cone(f.at(knee, 0, 0.01, 0.0), f.at(knee, 0, -0.34, -0.002), 0.062 * s, 0.052 * s, pm);
    if (torn) f.mat2(M.skin, 0.4);
    f.cone(f.at(knee, 0, -0.08, -0.018), f.at(knee, 0, -0.22, -0.012), 0.062 * s, 0.056 * s, pm).k(0.05 * s);
    f.cone(f.at(knee, 0, -0.3, 0.004), f.at(knee, 0, -0.372, 0.008), 0.058 * s, 0.066 * s, pm)
      .k(0.01 * s)
      .rag((L.dead ? 0.011 : 0.003) * s, PF.SPIKY | PF.RAG_END)
      .seed(50 + side);
  }
  if (torn) f.decal(f.at(knee, 0, -0.18, 0.06), f.at(knee, 0, -0.24, 0.06), 0.03 * s, 0.025 * s, M.blood).flag(D).rag(0.008 * s);
  // Drawn creases: across the front of a bent knee, the crotch pulls at the hip.
  const bend = 1 - f.dir(hip, 0, -1, 0).dot(f.dir(knee, 0, -1, 0));
  if (!L.bareLegs && f.facing(f.at(knee, 0, 0, 0.07), f.dir(knee, 0, 0, 1)) > 0) {
    const c = Math.min(1, 0.4 + bend * 4);
    f.decal(f.at(knee, -0.035, -0.035, 0.066), f.at(knee, 0.03, -0.05, 0.066), 0.006 * s, 0.006 * s, pm).flag(D | PF.SHADE_ONLY).tone(-0.36 * c).min(0.5);
    f.decal(f.at(knee, 0.025, 0.05, 0.075), f.at(knee, -0.025, 0.035, 0.075), 0.006 * s, 0.006 * s, pm).flag(D | PF.SHADE_ONLY).tone(-0.3 * c).min(0.5);
    f.decal(f.at(hip, -side * 0.045, -0.02, 0.075), f.at(hip, -side * 0.01, -0.1, 0.08), 0.006 * s, 0.006 * s, pm).flag(D | PF.SHADE_ONLY).tone(-0.3).min(0.5);
    // A lit ridge down the thigh's front crease.
    f.decal(f.at(hip, side * 0.015, -0.12, 0.085), f.at(hip, side * 0.012, -0.3, 0.08), 0.005 * s, 0.005 * s, pm).flag(D | PF.SHADE_ONLY).tone(0.16).min(0.45);
  }
  if (L.dead && !L.bareLegs) {
    // Grimy, blood-soaked cuff; a rip on one thigh; spatter.
    f.decal(f.at(knee, -0.07, -0.335, 0), f.at(knee, 0.07, -0.335, 0), 0.03 * s, 0.03 * s, pm).flag(D | PF.SHADE_ONLY).tone(-0.14);
    if (hash(L.seed * 4.3 + side) < 0.5) {
      f.decal(f.at(hip, 0.01, -0.2, 0.08), f.at(hip, 0.0, -0.26, 0.085), 0.026 * s, 0.02 * s, M.skin).flag(D).rag(0.01 * s, PF.SPIKY).seed(60 + side);
    } else {
      f.decal(f.at(hip, 0, -0.12, 0.08), f.at(hip, 0.02, -0.3, 0.08), 0.022 * s, 0.01 * s, M.blood).flag(D).rag(0.012 * s, PF.SPIKY).seed(62 + side);
    }
  }
  // Shoe: heel to toe, a sole line and a lit toe cap.
  f.cone(f.at(knee, 0, -0.395, -0.05), f.at(knee, 0, -0.425, 0.165), 0.05 * s, 0.042 * s, M.shoes).k(0.025 * s);
  if (!L.bareLegs) {
    f.decal(f.at(knee, 0, -0.452, -0.07), f.at(knee, 0, -0.452, 0.19), 0.012 * s, 0.012 * s, M.shoes).flag(D | PF.SHADE_ONLY).tone(-0.3).min(0.5);
    f.decal(f.at(knee, 0, -0.4, 0.15), f.at(knee, 0, -0.4, 0.15), 0.012 * s, 0.012 * s, M.shoes).flag(D | PF.SHADE_ONLY).tone(0.25).min(0.5);
  }
}

/**
 * A severed arm lying / tumbling in the world (`obj` = the pivot that flew off:
 * the shoulder for a whole arm, the elbow for a forearm). Gore at the joint.
 */
export function paintLooseArm(f: PixelFigure, obj: THREE.Object3D, whole: boolean, L: HumanLook): boolean {
  const M = mats(L);
  const s = scaleOf(obj);
  f.layer(0.035 * s, PART.NONE);
  if (whole) {
    let elbow: THREE.Object3D | null = null;
    for (const c of obj.children) if (!(c as THREE.Mesh).isMesh) elbow = c;
    paintArm(f, obj, elbow, 1, L, M, s, LOOSE, null);
    f.ball(f.at(obj, 0, 0.02, 0), 0.055 * s, M.gore).rag(0.008 * s, PF.SPIKY).z(-0.05);
  } else {
    const a = L.armLength;
    const foreMat = L.sleeves === 'long' ? M.sleeve : M.skin;
    f.cone(f.at(obj, 0, 0.01, 0.004), f.at(obj, 0, -0.095 * a, 0.008), 0.044 * s, 0.05 * s, foreMat);
    f.cone(f.at(obj, 0, -0.08 * a, 0.006), f.at(obj, 0, -0.24 * a, 0), 0.049 * s, 0.031 * s, foreMat);
    paintHand(f, obj, 1, L, M, s, a, 0, L.dead ? HAND.CLAW : HAND.OPEN, null);
    f.ball(f.at(obj, 0, 0.02, 0), 0.047 * s, M.gore).rag(0.008 * s, PF.SPIKY).z(-0.05);
    f.ball(f.at(obj, 0, 0.05, 0), 0.015 * s, M.bone).z(-0.06);
  }
  return true;
}

const LOOSE: HumanPose = { severed: [0, 0], headless: false, jaw: 0, face: 'zombie', squash: 0, time: 0, speed: 0 };
