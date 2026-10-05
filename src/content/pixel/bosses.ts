import * as THREE from 'three';
import { PART, PF, type PixelFigure } from '../../gameplay/pixel/figure';
import { Mat } from '../../gameplay/pixel/materials';

/**
 * ─── PixelCast bosses ──────────────────────────────────────────────────────
 *
 * Painters for the bosses, built from their live joints / meshes exactly like
 * the regular cast (so the heart you shoot is drawn where the heart hitbox is).
 *
 *   butcher    (z1) a 3 m hunchback: barrel chest and gut in horizontal slices,
 *              shoulder humps and a hunched back; an open heart cavity with bone
 *              ribs and the glowing heart (weak); glowing pustules (weak) with
 *              inflamed rims; a canvas apron banded with iron (armour) until he
 *              rips it off; a small head in a stained cap, slit eyes, a glowing
 *              maw when the jaw drops; the cleaver grafted to his right wrist
 *              (a squared blade with a bright honed edge), an iron pauldron; a
 *              chain-mail glove swinging a meat hook on a chain; held barrel /
 *              cruiser door when he throws them.
 */

function scaleOf(o: THREE.Object3D): number {
  const e = o.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

const BM = { ready: false, skin: 0, skinDark: 0, pants: 0, boots: 0, blood: 0, vein: 0, steel: 0, edge: 0, iron: 0, bone: 0, mail: 0, apron: 0, band: 0, cap: 0, capBand: 0, heart: 0, cavity: 0, pus: 0, pusRim: 0, eye: 0, maw: 0, teeth: 0, strap: 0, handle: 0, barrel: 0, barrelBand: 0, hazard: 0, door: 0, glass: 0, stripeB: 0, stripeR: 0 };

function bm() {
  if (!BM.ready) {
    BM.ready = true;
    BM.skin = Mat.deadSkin(0xa69074, 0.6);
    BM.skinDark = Mat.deadSkin(0x725a4a, 0.5);
    BM.pants = Mat.cloth(0x3a3430, { stain: Mat.blood(0x4a0808) });
    BM.boots = Mat.leather(0x2c2420);
    BM.blood = Mat.blood(0x4a0808);
    BM.vein = Mat.flat(0x5a2a3a, 'vein');
    BM.steel = Mat.plate(0x8a95a3);
    BM.edge = Mat.glow(0xeef4ff);
    BM.iron = Mat.plate(0x5e626a);
    BM.bone = Mat.bone(0xd8cdb0);
    BM.mail = Mat.plate(0x9aa2aa);
    BM.apron = Mat.cloth(0xc4beb2, { stain: Mat.blood(0x4a0808), strength: 0.8 });
    BM.band = Mat.plate(0x4e525a);
    BM.cap = Mat.cloth(0xd8d0c4, { stain: Mat.blood(0x4a0808) });
    BM.capBand = Mat.cloth(0x8a1a1a);
    BM.heart = Mat.glow(0xff2a1a);
    BM.cavity = Mat.mouth(0x2a0404);
    BM.pus = Mat.glow(0xff8a2a);
    BM.pusRim = Mat.gore(0x8a3a2a);
    BM.eye = Mat.glow(0xffd23a);
    BM.maw = Mat.glow(0xff5a1a);
    BM.teeth = Mat.teeth(0xe0d8b8);
    BM.strap = Mat.leather(0x3a3028);
    BM.handle = Mat.leather(0x4a3020);
    BM.barrel = Mat.plate(0xc22a20);
    BM.barrelBand = Mat.flat(0x5a120e, 'barrel');
    BM.hazard = Mat.glow(0xffb020);
    BM.door = Mat.plate(0xe8e8e0);
    BM.glass = Mat.gloss(0x18202e);
    BM.stripeB = Mat.glow(0x3a6aff);
    BM.stripeR = Mat.glow(0xff2a2a);
  }
  return BM;
}

export interface ButcherRig {
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  chest: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  shL: THREE.Object3D;
  shR: THREE.Object3D;
  elL: THREE.Object3D;
  elR: THREE.Object3D;
  hipL: THREE.Object3D;
  hipR: THREE.Object3D;
  knL: THREE.Object3D;
  knR: THREE.Object3D;
  heart: THREE.Mesh;
  apron: THREE.Object3D;
  handL: THREE.Object3D;
  hook: THREE.Object3D;
  barrel: THREE.Object3D;
  door: THREE.Object3D;
  mouthGlow: THREE.Object3D;
  /** Chest pustules then belly pustules: mesh + radius (hidden = popped / not yet shown). */
  pustules: readonly { mesh: THREE.Mesh; r: number; belly: boolean }[];
  bellyGroup: THREE.Object3D | null;
}

export interface ButcherPose {
  apronOn: boolean;
  time: number;
}

const _a = new THREE.Vector3();
const _n = new THREE.Vector3();

/** A horizontal pill across joint `j` (x from −hw to hw at height y, depth half rd toward z). */
function slice(f: PixelFigure, j: THREE.Object3D, y: number, z: number, hw: number, rv: number, rd: number, s: number, mat: number) {
  const x = Math.max(0.001, hw - rv);
  return f.coneE(f.at(j, -x, y, z), f.at(j, x, y, z), f.dir(j, 0, 1, 0), f.dir(j, 0, 0, 1), rv * s, rd * s, rv * s, rd * s, mat);
}

export function paintButcher(f: PixelFigure, B: ButcherRig, st: ButcherPose): boolean {
  f.maxTexels = 240;
  const M = bm();
  const s = scaleOf(B.hips);
  const alive = B.spine.visible;
  const cz = 0.48;

  if (alive) {
    // ── Trunk: hips, gut, barrel chest, shoulder humps, hunched back, neck ──
    f.layer(0.12 * s, PART.TORSO);
    slice(f, B.hips, 0.0, 0.0, 0.5, 0.21, 0.36, s, M.pants).k(0.08 * s);
    f.ellipsoid(B.spine, 0, 0.35, 0.06, 0.756, 0.634, 0.576, M.skin).k(0.14 * s);
    slice(f, B.chest, 0.22, 0, 0.725, 0.475, 0.475, s, M.skin).k(0.14 * s);
    for (let sd = 1; sd >= -1; sd -= 2) f.ellipsoid(B.chest, sd * 0.7, 0.52, -0.08, 0.44, 0.35, 0.44, M.skin).k(0.12 * s);
    f.ellipsoid(B.chest, 0, 0.5, -0.35, 0.576, 0.288, 0.36, M.skinDark).k(0.14 * s);
    f.cone(f.at(B.chest, 0, 0.5, 0.3), f.at(B.chest, 0, 0.7, 0.34), 0.2 * s, 0.17 * s, M.skin).k(0.06 * s);
    // Front details (decals): blood smear, veins, the heart cavity with ribs, pustule rims, apron straps.
    const ch = B.chest;
    if (f.facing(f.at(ch, 0, 0.3, cz), f.dir(ch, 0, 0, 1)) > -0.1) {
      f.decal(f.at(ch, -0.55, 0.12, cz), f.at(ch, -0.2, 0.0, cz), 0.14 * s, 0.1 * s, M.blood).flag(PF.FLAT).rag(0.04 * s, PF.SPIKY).seed(3);
      f.decal(f.at(ch, -0.22, 0.6, cz), f.at(ch, -0.08, 0.12, cz), 0.02 * s, 0.016 * s, M.vein).flag(PF.FLAT).min(0.5);
      f.decal(f.at(ch, 0.55, 0.35, cz), f.at(ch, 0.66, -0.05, cz), 0.02 * s, 0.016 * s, M.vein).flag(PF.FLAT).min(0.5);
      // Heart cavity (his left = +x): dark hole, bone ribs either side, red veins.
      f.decal(f.at(ch, 0.33, 0.42, cz), f.at(ch, 0.33, 0.18, cz), 0.25 * s, 0.25 * s, M.cavity).flag(PF.FLAT).rag(0.02 * s, PF.SPIKY).seed(8);
      for (let sd = -1; sd <= 1; sd += 2) {
        for (let i = 0; i < 3; i++) {
          const y = 0.12 + i * 0.18;
          f.decal(f.at(ch, 0.33 + sd * 0.27, y + 0.07, cz + 0.02), f.at(ch, 0.33 + sd * 0.33, y - 0.07, cz + 0.02), 0.032 * s, 0.03 * s, M.bone).min(0.5);
        }
      }
      for (let i = 0; i < 3; i++) {
        const a = 0.7 + i * 2.1;
        f.decal(f.at(ch, 0.33 + Math.cos(a) * 0.08, 0.3 + Math.sin(a) * 0.08, cz + 0.03), f.at(ch, 0.33 + Math.cos(a) * 0.22, 0.3 + Math.sin(a) * 0.22, cz + 0.03), 0.02 * s, 0.014 * s, M.heart).flag(PF.FLAT | PF.GLOW).min(0.5);
      }
      for (let sd = -1; sd <= 1; sd += 2) {
        f.decal(f.at(ch, sd * 0.62, 0.58, cz), f.at(ch, sd * 0.72, 0.02, cz), 0.04 * s, 0.04 * s, M.strap).flag(PF.FLAT);
      }
    }
    f.decal(f.at(B.spine, 0.1, 0.0, 0.62), f.at(B.spine, 0.35, 0.1, 0.55), 0.06 * s, 0.03 * s, M.blood).flag(PF.FLAT).rag(0.02 * s, PF.SPIKY);

    // ── Heart (weak point): a throbbing glowing bulb in the cavity ──
    f.layer(0.02 * s, PART.WEAK, 0, -0.05);
    const hs = scaleOf(B.heart);
    f.ellipsoid(B.heart, 0, 0, 0, 0.2, 0.2, 0.2, M.heart).flag(PF.GLOW);
    f.ball(f.at(B.heart, -0.04, 0.06, 0.12), 0.05 * hs, M.edge).flag(PF.GLOW).z(-0.02).min(0.5);
    // ── Pustules (weak): glowing domes in inflamed rims, those facing us ──
    for (let i = 0; i < B.pustules.length; i++) {
      const p = B.pustules[i];
      if (!p.mesh.visible || (p.belly && !(B.bellyGroup?.visible ?? false))) continue;
      const c = f.at(p.mesh, 0, 0, 0);
      _a.setFromMatrixPosition((p.belly ? B.spine : B.chest).matrixWorld);
      _n.subVectors(c, _a).normalize();
      if (f.facing(c, _n) < 0.05) continue;
      const r = p.r * scaleOf(p.mesh);
      f.ball(c, r * 1.3, M.pusRim).flag(PF.FLAT).z(0.02);
      f.ball(c, r, M.pus).flag(PF.GLOW).z(-0.02);
    }

    // ── Apron (armour): heavy canvas, iron bands, blood ──
    if (st.apronOn && B.apron.visible) {
      const ap = B.apron;
      f.layer(0.04 * s, PART.ARMOR, 0, -0.04);
      const ax = f.dir(ap, 1, 0, 0);
      const az = f.dir(ap, 0, 0, 1);
      for (let i = -1; i <= 1; i++) {
        f.coneE(f.at(ap, i * 0.42, -0.12, 0), f.at(ap, i * 0.42 + i * 0.03, -1.42, 0), ax, az, 0.21 * s, 0.035 * s, 0.22 * s, 0.035 * s, M.apron)
          .flag(PF.FLAT)
          .rag(0.012 * s, PF.RAG_END)
          .seed(30 + i);
      }
      if (f.facing(f.at(ap, 0, -0.7, 0.04), az) > 0) {
        // A few riveted iron bands (a full grid at this size reads as a cage).
        for (let i = 0; i < 3; i++) {
          const y = -0.12 - i * 0.6;
          f.decal(f.at(ap, -0.62, y, 0.04), f.at(ap, 0.62, y, 0.04), 0.024 * s, 0.024 * s, M.band).min(0.5);
          for (let k = -1; k <= 1; k += 2) {
            const rv = f.at(ap, k * 0.45, y, 0.05);
            f.decal(rv, rv, 0.02 * s, 0.02 * s, M.mail).min(0.5);
          }
        }
        for (let k = -1; k <= 1; k += 2) f.decal(f.at(ap, k * 0.3, -0.1, 0.04), f.at(ap, k * 0.3, -1.3, 0.04), 0.016 * s, 0.016 * s, M.band).min(0.5);
        f.decal(f.at(ap, -0.3, -0.45, 0.05), f.at(ap, -0.15, -0.6, 0.05), 0.14 * s, 0.1 * s, M.blood).flag(PF.FLAT).rag(0.04 * s, PF.SPIKY).seed(41);
        f.decal(f.at(ap, 0.25, -1.05, 0.05), f.at(ap, 0.3, -1.25, 0.05), 0.16 * s, 0.12 * s, M.blood).flag(PF.FLAT).rag(0.05 * s, PF.SPIKY).seed(42);
      }
    }

    // ── Head: small and low, a stained cap, slit eyes, a glowing maw ──
    const h = B.head;
    f.layer(0.04 * s, PART.HEAD);
    f.ellipsoid(h, 0, 0.2, 0, 0.25, 0.26, 0.26, M.skin);
    f.cone(f.at(h, -0.22, 0.32, 0.22), f.at(h, 0.22, 0.32, 0.22), 0.06 * s, 0.06 * s, M.skinDark).k(0.04 * s);
    f.cone(f.at(B.jaw, -0.18, -0.05, 0.08), f.at(B.jaw, 0.18, -0.05, 0.08), 0.085 * s, 0.085 * s, M.skinDark).k(0.03 * s);
    f.ellipsoid(h, 0, 0.53, -0.02, 0.27, 0.12, 0.27, M.cap).z(-0.04).k(0.02 * s);
    f.cone(f.at(h, -0.27, 0.45, -0.02), f.at(h, 0.27, 0.45, -0.02), 0.025 * s, 0.025 * s, M.capBand).z(-0.06).k(0.005 * s);
    if (f.facing(f.at(h, 0, 0.25, 0.26), f.dir(h, 0, 0, 1)) > 0.05) {
      for (let sd = 1; sd >= -1; sd -= 2) {
        f.decal(f.at(h, sd * 0.07, 0.262, 0.26), f.at(h, sd * 0.17, 0.24, 0.26), 0.026 * s, 0.022 * s, M.eye).flag(PF.FLAT | PF.GLOW).min(0.6);
      }
      if (B.mouthGlow.visible) f.decal(f.at(h, -0.12, 0.04, 0.24), f.at(h, 0.12, 0.04, 0.24), 0.05 * s, 0.05 * s, M.maw).flag(PF.FLAT | PF.GLOW);
      f.cone(f.at(B.jaw, -0.15, 0.04, 0.27), f.at(B.jaw, 0.15, 0.04, 0.27), 0.03 * s, 0.03 * s, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(-0.02).seed(4);
      f.decal(f.at(h, 0.08, 0.6, 0.25), f.at(h, 0.16, 0.56, 0.25), 0.06 * s, 0.04 * s, M.blood).flag(PF.FLAT).rag(0.02 * s, PF.SPIKY);
    }
  }

  // ── Right arm: the cleaver ──
  {
    f.layer(0.08 * s, PART.LIMB);
    f.cone(f.at(B.shR, 0, 0.05, 0), f.at(B.shR, 0, -0.76, 0), 0.23 * s, 0.2 * s, M.skin);
    f.cone(f.at(B.elR, 0, 0.0, 0), f.at(B.elR, 0, -0.66, 0), 0.25 * s, 0.22 * s, M.skin);
    f.cone(f.at(B.elR, 0, -0.66, 0), f.at(B.elR, 0, -0.84, 0), 0.24 * s, 0.17 * s, M.skinDark);
    f.decal(f.at(B.elR, -0.2, -0.68, 0.22), f.at(B.elR, 0.2, -0.68, 0.22), 0.04 * s, 0.04 * s, M.vein).flag(PF.FLAT);
    f.decal(f.at(B.shR, 0.1, -0.2, 0.23), f.at(B.shR, 0.14, -0.6, 0.23), 0.02 * s, 0.016 * s, M.vein).flag(PF.FLAT).min(0.5);
    f.cone(f.at(B.elR, 0, -0.84, 0), f.at(B.elR, 0, -1.12, 0), 0.06 * s, 0.05 * s, M.handle);
    // Pauldron.
    f.layer(0.02 * s, PART.ARMOR, 0, -0.02);
    f.ellipsoid(B.shR, -0.04, 0.05, 0, 0.32, 0.14, 0.32, M.iron);
    // Cleaver blade (armour): three strips side by side make a squared slab, a dark spine, the honed edge.
    f.layer(0.03 * s, PART.ARMOR);
    const bx = f.dir(B.elR, 1, 0, 0);
    const bzv = f.dir(B.elR, 0, 0, 1);
    for (let i = -1; i <= 1; i++) {
      const z = 0.2 + i * 0.2;
      f.coneE(f.at(B.elR, 0, -1.1, z), f.at(B.elR, 0, -2.34, z), bx, bzv, 0.05 * s, 0.13 * s, 0.05 * s, 0.13 * s, M.steel).k(0.06 * s).u(i * 0.2);
    }
    f.coneE(f.at(B.elR, 0, -1.1, -0.1), f.at(B.elR, 0, -2.34, -0.1), bx, bzv, 0.06 * s, 0.05 * s, 0.06 * s, 0.05 * s, M.iron).k(0.02 * s).z(-0.01);
    f.coneE(f.at(B.elR, 0, -1.08, 0.55), f.at(B.elR, 0, -2.36, 0.55), bx, bzv, 0.055 * s, 0.03 * s, 0.055 * s, 0.03 * s, M.edge).flag(PF.GLOW).k(0.005 * s).z(-0.02);
    f.decal(f.at(B.elR, 0.05, -1.2, 0.38), f.at(B.elR, 0.05, -2.0, 0.42), 0.04 * s, 0.03 * s, M.blood).flag(PF.FLAT).rag(0.02 * s, PF.SPIKY).seed(11);
  }

  // ── Left arm: chain-mail glove, the meat hook ──
  {
    f.layer(0.07 * s, PART.LIMB);
    f.cone(f.at(B.shL, 0, 0.04, 0), f.at(B.shL, 0, -0.7, 0), 0.2 * s, 0.18 * s, M.skin);
    f.cone(f.at(B.elL, 0, 0.0, 0), f.at(B.elL, 0, -0.56, 0), 0.19 * s, 0.17 * s, M.skin);
    f.decal(f.at(B.elL, 0.12, -0.05, 0.19), f.at(B.elL, 0.14, -0.4, 0.19), 0.02 * s, 0.016 * s, M.vein).flag(PF.FLAT).min(0.5);
    f.layer(0.03 * s, PART.ARMOR, 0, -0.01);
    f.ellipsoid(B.elL, 0, -0.66, 0, 0.22, 0.16, 0.23, M.mail);
    if (B.hook.visible) {
      // Chain, then the hook's curve and point.
      const hk = B.hook;
      f.layer(0.004 * s, PART.NONE);
      f.cone(f.at(hk, 0, 0.05, 0), f.at(hk, 0, -0.32, 0), 0.032 * s, 0.03 * s, M.iron).min(0.5);
      let prev = f.at(hk, -0.17, -0.25, 0);
      f.cone(prev, f.at(hk, -0.17, -0.55, 0), 0.035 * s, 0.035 * s, M.iron).min(0.5);
      prev = f.at(hk, -0.17, -0.55, 0);
      for (let i = 0; i <= 5; i++) {
        const a = Math.PI + (i / 5) * Math.PI * 1.1;
        const p = f.at(hk, 0.02 + Math.cos(a) * 0.19, -0.55 + Math.sin(a) * 0.19, 0);
        f.cone(prev, p, 0.035 * s, 0.032 * s, M.iron).min(0.5);
        prev = p;
      }
      f.cone(prev, f.add(prev, f.dir(hk, -0.3, 1, 0), 0.12 * s), 0.03 * s, 0.006 * s, M.iron).min(0.5);
    }
    if (B.barrel.visible) {
      const br = B.barrel;
      f.layer(0.02 * s, PART.NONE);
      f.coneE(f.at(br, 0, 0.47, 0), f.at(br, 0, -0.47, 0), f.dir(br, 1, 0, 0), f.dir(br, 0, 0, 1), 0.34 * s, 0.34 * s, 0.34 * s, 0.34 * s, M.barrel).k(0.01 * s);
      for (let i = -1; i <= 1; i += 2) f.decal(f.at(br, -0.36, i * 0.25, 0.0), f.at(br, 0.36, i * 0.25, 0.0), 0.04 * s, 0.04 * s, M.barrelBand).min(0.5);
      f.decal(f.at(br, -0.36, 0.05, 0), f.at(br, 0.36, 0.05, 0), 0.045 * s, 0.045 * s, M.hazard).flag(PF.GLOW).min(0.5);
    }
    if (B.door.visible) {
      const dr = B.door;
      f.layer(0.02 * s, PART.NONE);
      const dx = f.dir(dr, 1, 0, 0);
      const dz = f.dir(dr, 0, 0, 1);
      f.coneE(f.at(dr, -0.42, -0.2, 0), f.at(dr, 0.42, -0.2, 0), f.dir(dr, 0, 1, 0), dz, 0.33 * s, 0.04 * s, 0.33 * s, 0.04 * s, M.door);
      f.coneE(f.at(dr, -0.3, 0.33, 0), f.at(dr, 0.4, 0.33, 0), f.dir(dr, 0, 1, 0), dz, 0.22 * s, 0.03 * s, 0.22 * s, 0.03 * s, M.glass);
      f.decal(f.at(dr, -0.58, -0.3, 0.05), f.at(dr, 0.58, -0.3, 0.05), 0.04 * s, 0.04 * s, M.stripeB).flag(PF.GLOW).min(0.5);
      f.decal(f.at(dr, -0.58, -0.4, 0.05), f.at(dr, 0.58, -0.4, 0.05), 0.022 * s, 0.022 * s, M.stripeR).flag(PF.GLOW).min(0.5);
      void dx;
    }
  }

  // ── Legs ──
  for (let i = 0; i < 2; i++) {
    const hip = i === 0 ? B.hipL : B.hipR;
    const kn = i === 0 ? B.knL : B.knR;
    f.layer(0.08 * s, PART.LIMB);
    f.cone(f.at(hip, 0, 0.05, 0), f.at(hip, 0, -0.6, 0.01), 0.23 * s, 0.2 * s, M.pants);
    f.cone(f.at(kn, 0, 0.02, 0), f.at(kn, 0, -0.46, 0), 0.2 * s, 0.17 * s, M.pants);
    f.cone(f.at(kn, 0, -0.54, -0.2), f.at(kn, 0, -0.58, 0.42), 0.14 * s, 0.12 * s, M.boots).k(0.06 * s);
    f.decal(f.at(kn, -0.2, -0.1, 0.21), f.at(kn, 0.2, -0.1, 0.21), 0.05 * s, 0.05 * s, M.blood).flag(PF.FLAT).rag(0.02 * s, PF.SPIKY);
  }
  void st.time;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Carnotaur (d1): the horned devil
// ═══════════════════════════════════════════════════════════════════════════

export interface CarnoRig {
  hips: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  jaw: THREE.Object3D;
  mouth: THREE.Object3D;
  tail: readonly THREE.Object3D[];
  legs: readonly { hip: THREE.Object3D; knee: THREE.Object3D; ankle: THREE.Object3D }[];
  arms: readonly THREE.Object3D[];
  eyes: readonly THREE.Mesh[];
}

export interface CarnoPose {
  frenzy: boolean;
  time: number;
}

const CM = { ready: false, hide: 0, dark: 0, belly: 0, plate: 0, horn: 0, hornTip: 0, teeth: 0, claw: 0, eye: 0, eyeF: 0, gullet: 0, throat: 0, tongue: 0, nostril: 0 };

function cm() {
  if (!CM.ready) {
    CM.ready = true;
    CM.belly = Mat.hide(0xd9b48a, { scale: 0.3 });
    CM.hide = Mat.hide(0x8e3a20, { stripes: 0.8, stripe: 0x5a2014, belly: CM.belly, scale: 0.55 });
    CM.dark = Mat.hide(0x5a2014, { scale: 0.3 });
    CM.plate = Mat.hide(0x4a2416, { scale: 0.12 });
    CM.horn = Mat.bone(0xeadfc4);
    CM.hornTip = Mat.gloss(0x2e2018);
    CM.teeth = Mat.teeth(0xf2ead2);
    CM.claw = Mat.gloss(0x2a2420);
    CM.eye = Mat.glow(0xff3010);
    CM.eyeF = Mat.glow(0xffb020);
    CM.gullet = Mat.mouth(0x5a0c0c);
    CM.throat = Mat.glow(0xff4a1a);
    CM.tongue = Mat.gore(0xb04050);
    CM.nostril = Mat.mouth(0x1a0c08);
  }
  return CM;
}

const _hd = new THREE.Vector3();

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

export function paintCarnotaur(f: PixelFigure, C: CarnoRig, st: CarnoPose): boolean {
  f.maxTexels = 240;
  const M = cm();
  const s = scaleOf(C.hips);
  const hp = C.hips;
  const h = C.head;
  // ── Body line: tail tip → hips → chest → neck (one melted layer, 'body') ──
  f.layer(0.25 * s, PART.TORSO);
  let u = 0;
  f.ellipsoid(hp, 0, 0.15, 0.55, 0.82, 0.88, 1.85, M.hide).u(u).k(0.3 * s);
  f.ellipsoid(hp, 0, 0.0, -0.75, 0.7, 0.76, 0.9, M.hide).u(u + 1.4).k(0.3 * s);
  f.ellipsoid(hp, 0, -0.42, 0.75, 0.62, 0.48, 1.5, M.belly).k(0.2 * s).z(0.05);
  // Neck: a thick column up to the head.
  const nk = C.neck;
  f.coneE(f.at(nk, 0, 0.02, -0.1), f.at(nk, 0, 0.42, 0.72), f.dir(nk, 1, 0, 0), f.dir(nk, 0, 1, 0), 0.55 * s, 0.6 * s, 0.45 * s, 0.5 * s, M.hide)
    .u(u - 1)
    .k(0.25 * s);
  // Tail: tapering, the pattern running on.
  u = 2.4;
  for (let i = 0; i < C.tail.length; i++) {
    const seg = C.tail[i];
    const r0 = 0.52 - i * 0.09;
    const r1 = i === C.tail.length - 1 ? 0.06 : r0 - 0.09;
    f.coneE(f.at(seg, 0, 0, 0.05), f.at(seg, 0, 0, -1.0), f.dir(seg, 1, 0, 0), f.dir(seg, 0, 1, 0), r0 * s, r0 * 1.05 * s, r1 * s, r1 * 1.05 * s, M.hide)
      .part(PART.TAIL)
      .u(u)
      .k(0.2 * s);
    u += 0.95 * (1.2 + i * 0.2);
  }
  // ── Armour: back osteoderms and neck plates (bony cones), tail spikes ──
  f.layer(0.02 * s, PART.ARMOR);
  for (let i = 0; i < 7; i++) {
    const z = -1.0 + i * 0.45;
    for (let sd = -1; sd <= 1; sd += 2) {
      coneDir(0, sd * -0.25, CD);
      const y = 0.98 - Math.abs(z - 0.5) * 0.08;
      f.cone(f.at(hp, sd * 0.32 - CD.x * 0.16, y - CD.y * 0.16, z), f.at(hp, sd * 0.32 + CD.x * 0.16, y + CD.y * 0.16, z), 0.13 * s, 0.02 * s, M.plate).min(0.5);
    }
  }
  for (let i = 0; i < 3; i++) {
    for (let sd = -1; sd <= 1; sd += 2) {
      coneDir(-0.3, sd * -0.25, CD);
      const x = sd * 0.24;
      const y = 0.72 - i * 0.05;
      const z = 0.05 + i * 0.32;
      f.cone(f.at(nk, x - CD.x * 0.13, y - CD.y * 0.13, z - CD.z * 0.13), f.at(nk, x + CD.x * 0.13, y + CD.y * 0.13, z + CD.z * 0.13), 0.11 * s, 0.02 * s, M.plate).min(0.5);
    }
  }
  f.layer(0.02 * s, PART.TAIL);
  for (let i = 0; i < C.tail.length; i++) {
    const r = 0.52 - i * 0.09;
    f.cone(f.at(C.tail[i], 0, r * 0.85, -0.4), f.at(C.tail[i], 0, r * 0.95 + 0.12, -0.45), 0.07 * s, 0.01 * s, M.dark).min(0.5);
  }

  // ── Head (hit as 'torso'): short, deep, bumpy; snout, brow ridges, horns, eyes ──
  f.layer(0.12 * s, PART.TORSO);
  const hx = f.dir(h, 1, 0, 0);
  const hy = f.dir(h, 0, 1, 0);
  f.ellipsoid(h, 0, 0.12, 0.32, 0.52, 0.5, 0.62, M.hide).k(0.2 * s);
  f.coneE(f.at(h, 0, 0, 0.58), f.at(h, 0, 0, 1.52), hx, hy, 0.36 * s, 0.28 * s, 0.24 * s, 0.19 * s, M.hide).k(0.15 * s).u(0.3);
  f.coneE(f.at(h, 0, 0.2, 0.68), f.at(h, 0, 0.17, 1.33), hx, hy, 0.24 * s, 0.12 * s, 0.16 * s, 0.08 * s, M.dark).k(0.08 * s);
  for (let sd = -1; sd <= 1; sd += 2) {
    f.cone(f.at(h, sd * 0.3, 0.55, 0.2), f.at(h, sd * 0.42, 0.52, 0.64), 0.1 * s, 0.09 * s, M.dark).k(0.08 * s);
    f.ball(f.at(h, sd * 0.34, -0.12, 0.6), 0.16 * s, M.hide).k(0.1 * s);
  }
  // Upper tooth rows.
  for (let sd = -1; sd <= 1; sd += 2) {
    f.cone(f.at(h, sd * 0.3, -0.36, 0.72), f.at(h, sd * 0.24, -0.36, 1.45), 0.06 * s, 0.05 * s, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(0.05).seed(3 + sd);
  }
  // Jaw.
  const jw = C.jaw;
  f.coneE(f.at(jw, 0, -0.08, 0.0), f.at(jw, 0, -0.08, 1.24), f.dir(jw, 1, 0, 0), f.dir(jw, 0, 1, 0), 0.34 * s, 0.15 * s, 0.22 * s, 0.1 * s, M.hide).k(0.04 * s).u(0.2);
  f.coneE(f.at(jw, 0, -0.2, 0.1), f.at(jw, 0, -0.2, 1.0), f.dir(jw, 1, 0, 0), f.dir(jw, 0, 1, 0), 0.23 * s, 0.06 * s, 0.2 * s, 0.05 * s, M.belly).k(0.04 * s).z(-0.02);
  for (let sd = -1; sd <= 1; sd += 2) {
    f.cone(f.at(jw, sd * 0.26, 0.06, 0.55), f.at(jw, sd * 0.24, 0.06, 1.18), 0.05 * s, 0.045 * s, M.teeth).flag(PF.TEETH | PF.NO_OUTLINE).k(0.001).z(0.05).seed(7 + sd);
  }
  // Nostrils, and warts along the snout.
  if (f.facing(f.at(h, 0, 0.1, 1.5), f.dir(h, 0, 0.2, 1)) > -0.2) {
    for (let sd = -1; sd <= 1; sd += 2) {
      const no = f.at(h, sd * 0.13, 0.08, 1.52);
      f.decal(no, no, 0.045 * s, 0.04 * s, M.nostril).flag(PF.FLAT).min(0.5);
    }
  }
  // Horns (armour): outward-and-up cones with dark tips.
  f.layer(0.02 * s, PART.ARMOR);
  for (let sd = -1; sd <= 1; sd += 2) {
    coneDir(0.25, sd * -1.05, CD);
    const bx = sd * 0.42;
    const by = 0.62;
    const bz = 0.22;
    const base = f.at(h, bx, by, bz);
    const tip = f.at(h, bx + CD.x * 0.8, by + CD.y * 0.8, bz + CD.z * 0.8);
    f.cone(base, tip, 0.2 * s, 0.075 * s, M.horn).u(0);
    f.cone(tip, f.at(h, bx + CD.x * 1.0, by + CD.y * 1.0, bz + CD.z * 1.0), 0.08 * s, 0.01 * s, M.hornTip).min(0.5);
    f.cone(f.at(h, bx - CD.x * 0.04, by - CD.y * 0.04, bz - CD.z * 0.04), f.at(h, bx + CD.x * 0.08, by + CD.y * 0.08, bz + CD.z * 0.08), 0.235 * s, 0.22 * s, M.plate);
  }
  // Eyes (weak): glowing slits under the brow, bulging past the skull.
  f.layer(0.01 * s, PART.WEAK, 0, -0.05);
  for (let i = 0; i < C.eyes.length; i++) {
    const e = C.eyes[i];
    if (!e.visible) continue;
    _hd.setFromMatrixPosition(e.matrixWorld);
    f.ellipsoid(e, 0, 0, 0, 0.08, 0.09, 0.17, st.frenzy ? M.eyeF : M.eye).flag(PF.GLOW);
  }
  // The open mouth (weak): dark gullet, tongue, glowing throat — while the jaws part.
  if (C.mouth.visible) {
    const mo = C.mouth;
    f.layer(0.04 * s, PART.WEAK, 0, 0.08);
    f.coneE(f.at(mo, 0, 0, -0.35), f.at(mo, 0, 0, 0.55), f.dir(mo, 1, 0, 0), f.dir(mo, 0, 1, 0), 0.26 * s, 0.18 * s, 0.26 * s, 0.18 * s, M.gullet);
    f.cone(f.at(mo, 0, -0.14, -0.1), f.at(mo, 0, -0.14, 0.58), 0.08 * s, 0.07 * s, M.tongue).z(-0.03);
    f.ellipsoid(mo, 0, 0.02, -0.28, 0.24, 0.19, 0.14, M.throat).flag(PF.GLOW).z(-0.06);
  }

  // ── Legs ──
  for (let i = 0; i < C.legs.length; i++) {
    const L = C.legs[i];
    const sd = i === 0 ? -1 : 1;
    f.layer(0.15 * s, PART.LIMB);
    f.ellipsoid(L.hip, 0, -0.42, 0.05, 0.46, 0.78, 0.62, M.hide).u(1.2 + i);
    f.decal(f.at(L.hip, sd * 0.42, -0.1, 0.05), f.at(L.hip, sd * 0.42, -0.6, 0.05), 0.12 * s, 0.1 * s, M.dark).flag(PF.SHADE_ONLY).tone(-0.15);
    f.cone(f.at(L.knee, 0, 0.05, -0.02), f.at(L.knee, 0, -0.86, -0.2), 0.21 * s, 0.17 * s, M.hide).u(2.2);
    f.cone(f.at(L.ankle, 0, 0.0, 0.0), f.at(L.ankle, 0, -0.36, 0.08), 0.14 * s, 0.12 * s, M.dark);
    f.cone(f.at(L.ankle, 0, -0.4, -0.06), f.at(L.ankle, 0, -0.42, 0.5), 0.12 * s, 0.1 * s, M.dark).k(0.06 * s);
    for (let c = -1; c <= 1; c++) {
      f.cone(f.at(L.ankle, c * 0.14, -0.42, 0.5), f.at(L.ankle, c * 0.15, -0.46, 0.74), 0.05 * s, 0.01 * s, M.claw).min(0.5);
    }
  }
  // ── Tiny arms ──
  f.layer(0.03 * s, PART.LIMB);
  for (let i = 0; i < C.arms.length; i++) {
    const a = C.arms[i];
    f.cone(f.at(a, 0, 0.02, 0.0), f.at(a, 0, -0.29, 0.18), 0.065 * s, 0.055 * s, M.hide);
    f.cone(f.at(a, 0, -0.29, 0.18), f.at(a, 0, -0.32, 0.3), 0.04 * s, 0.01 * s, M.claw).min(0.5);
  }
  void st.time;
  return true;
}
