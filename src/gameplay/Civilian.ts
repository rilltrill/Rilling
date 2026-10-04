import * as THREE from 'three';
import type { Frame } from '../core/types';
import { Entity, type ShotHit, type ShotOutcome } from './Entity';
import type { World } from './World';
import { buildHumanoid, type HumanoidRig } from '../content/kit/humanoid';
import { Kit } from '../content/kit/ModelKit';
import { bakeHumanoid, releaseGeos, ZT, type BakedHumanoid, type ZSurface } from '../content/enemies/zombieKit';

interface CivLook {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  /** Bare forearms (short or rolled-up sleeves). */
  short?: boolean;
  /** Surface of the shirt and sleeves (default cloth). */
  shirtTex?: ZSurface;
}

/**
 * Bright, clean, saturated arcade palette with warm skin and hair: civilians
 * must read as "alive — don't shoot" next to the grey-green, blood-soaked
 * zombies, also on a dark CRT. Every look is chosen to NEVER match a zombie
 * variant wearing the same job (zombieKit `dressVariant`): living cops wear a
 * light-blue short-sleeve summer shirt and no cap (zombie cops: navy, peaked
 * cap), the living nurse wears purple scrubs and a white cap (zombie nurses:
 * teal / dusty pink / blue scrubs), the doctor's lab coat is open over a royal
 * blue shirt and stops at the waist (zombie doctors: closed coat with tails),
 * and the worker is a red buffalo-check flannel and jeans (zombie workers:
 * grey shirts, hi-vis vests, hard hats).
 */
const VARIANTS: Record<string, CivLook> = {
  default: { shirt: 0x3f86d0, pants: 0x3a5280, skin: 0xe0b48f, hair: 0x3b2a1a, short: true },
  scientist: { shirt: 0xf4f4f0, pants: 0x8a7a5c, skin: 0xd9a77f, hair: 0x5a4632 },
  ranger: { shirt: 0xb09a5a, pants: 0x6a5a38, skin: 0xc68e5e, hair: 0x4a3216, short: true },
  cop: { shirt: 0x7cacea, pants: 0x232c4a, skin: 0xb98060, hair: 0x1a1414, short: true },
  nurse: { shirt: 0xa04cc8, pants: 0xa04cc8, skin: 0xf0c8a0, hair: 0x6b3a1a, short: true },
  worker: { shirt: 0xc4382a, pants: 0x3a5a8a, skin: 0xa8714e, hair: 0x1a1a1a, short: true, shirtTex: ZT.PLAID },
};

/**
 * Innocent bystander. Don't shoot! Shooting one costs a life and points.
 * If they survive until the encounter is cleared, they're rescued for a bonus.
 *
 * Look: a humanoid with a screaming face and variant props (lab coat, ranger
 * hat, cop cap, hi-vis vest…), baked like the zombies into a few textured,
 * vertex-coloured meshes — faces and props cost no extra draw calls.
 */
export class Civilian extends Entity {
  private rig: HumanoidRig;
  private baked: BakedHumanoid;
  rescued = false;
  shot = false;
  private runDir = 1;

  constructor(world: World, pos: THREE.Vector3, frame: Frame, variant = 'default') {
    super(world);
    this.frame = frame;
    this.root.position.copy(pos);
    const v = VARIANTS[variant] ?? VARIANTS.default;
    const r = (this.rig = buildHumanoid({
      skin: v.skin,
      shirt: v.shirt,
      pants: v.pants,
      hair: v.hair,
      sleeves: v.shirt,
      shoes: 0x2a221c,
      height: 1.72,
    }));
    // The rig has bare forearms; long sleeves cover them.
    if (!v.short) for (const a of [r.armL, r.armR]) a.lower.material = Kit.mat(v.shirt);
    if (v.shirtTex !== undefined) {
      for (const m of [r.torsoMesh, r.armL.upper, r.armR.upper]) m.userData.t = v.shirtTex;
      if (!v.short) for (const a of [r.armL, r.armR]) a.lower.userData.t = v.shirtTex;
    }
    // Same hit zones as the plain rig: the neck block was never a target.
    const neck = r.neck.children.find((c) => (c as THREE.Mesh).isMesh);
    if (neck) neck.userData.z = 'none';
    dressCivilian(r, variant, v);
    this.baked = bakeHumanoid(this.rig, { skin: v.skin });
    this.root.add(this.rig.root);
    this.runDir = world.rng.chance(0.5) ? 1 : -1;
  }

  override onAdded(): void {
    const z = this.baked.zones;
    for (const m of z.head) this.hitbox(m, 'head');
    for (const m of z.torso) this.hitbox(m, 'torso');
    for (const m of z.limb) this.hitbox(m, 'limb');
    // Face the player.
    const p = this.frame === 'rig' ? new THREE.Vector3() : this.world.rig.space.position;
    this.root.rotation.y = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
    this.world.audio.play('civilian_scream', { volume: 0.6, vary: 0.2 });
  }

  override dispose(): void {
    super.dispose();
    releaseGeos(this.baked.geos);
  }

  /** Called by the stage runner when the encounter is cleared. */
  rescue() {
    if (this.shot || this.rescued) return;
    this.rescued = true;
    this.world.shootables.removeOwner(this);
    this.world.onCivilianRescued(this);
    this.age = 0;
  }

  update(dt: number): void {
    this.age += dt;
    const r = this.rig;
    if (this.shot) {
      const k = Math.min(1, this.age / 0.6);
      r.root.rotation.x = -k * 1.4;
      if (this.age > 2) this.removed = true;
      return;
    }
    if (this.rescued) {
      // Thumbs-up then run off to the side.
      this.root.rotation.y += (this.runDir * Math.PI / 2 - this.root.rotation.y) * Math.min(1, dt * 4);
      const s = Math.min(1, this.age) * 5;
      this.root.translateZ(s * dt);
      const ph = this.age * 12;
      r.legL.hip.rotation.x = Math.sin(ph) * 0.9;
      r.legR.hip.rotation.x = -Math.sin(ph) * 0.9;
      r.armL.shoulder.rotation.x = -Math.sin(ph) * 0.8;
      r.armR.shoulder.rotation.x = Math.sin(ph) * 0.8;
      if (this.age > 3) this.removed = true;
      return;
    }
    // Panicked waving.
    const t = this.age * 7;
    r.armL.shoulder.rotation.z = 2.6 + Math.sin(t) * 0.35;
    r.armR.shoulder.rotation.z = -2.6 - Math.sin(t + 1) * 0.35;
    r.chest.rotation.y = Math.sin(t * 0.5) * 0.15;
    r.head.rotation.y = Math.sin(t * 0.3) * 0.4;
  }

  override onShot(hit: ShotHit): ShotOutcome {
    if (this.shot || this.rescued) return { kind: 'civilian', counts: false };
    this.shot = true;
    this.age = 0;
    this.world.shootables.removeOwner(this);
    this.world.fx.blood(hit.point, hit.dir, { color: 0x9a0a0a, amount: 1 });
    this.world.onCivilianShot(this, hit);
    return { kind: 'civilian', counts: false };
  }
}

// ─── Look ────────────────────────────────────────────────────────────────────

/** Add a box to a joint before baking (surface `t`, self-lit `e`). */
function part(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, t?: ZSurface, e?: number, rx = 0, rz = 0) {
  const m = Kit.add(parent, Kit.box(w, h, d), Kit.mat(color), x, y, z, rx, 0, rz);
  if (t !== undefined) m.userData.t = t;
  if (e !== undefined) m.userData.e = e;
  return m;
}

/**
 * A prop that sticks out past the plain rig's silhouette (hat brims, nurse cap,
 * hair bun): baked into a separate, never-registered mesh so the "don't shoot"
 * area stays exactly the body's (shots pass the brim to the zombie behind).
 */
function prop(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, t?: ZSurface, e?: number) {
  const m = part(parent, w, h, d, color, x, y, z, t, e);
  m.userData.z = 'none';
  return m;
}

/** Screaming face (dark eyes, raised brows, open mouth, nose, ears) + per-variant props. */
function dressCivilian(r: HumanoidRig, variant: string, v: CivLook) {
  const h = r.head;
  const fz = 0.13;
  const dark = 0x22140e;
  for (const s of [1, -1]) {
    part(h, 0.044, 0.034, 0.012, 0xf4f0e6, s * 0.052, 0.148, fz + 0.002, ZT.FLAT, 0.25); // eye white
    part(h, 0.022, 0.03, 0.012, dark, s * 0.05, 0.148, fz + 0.006, ZT.FLAT); // pupil
    part(h, 0.062, 0.016, 0.016, v.hair, s * 0.054, 0.186, fz + 0.002, ZT.HAIR, 0, 0, s * -0.25); // raised brow
    part(h, 0.03, 0.06, 0.05, v.skin, s * 0.115, 0.14, -0.01); // ear
  }
  part(h, 0.032, 0.05, 0.03, v.skin, 0, 0.115, fz + 0.012); // nose
  part(h, 0.06, 0.042, 0.012, 0x5a1414, 0, 0.062, fz + 0.002, ZT.FLAT); // screaming mouth
  part(h, 0.05, 0.01, 0.014, 0xf0ece0, 0, 0.078, fz + 0.004, ZT.FLAT); // teeth
  const sp = r.spine;
  const cz = 0.11;
  const top = 0.26;
  switch (variant) {
    case 'scientist': {
      // Lab coat worn OPEN over a royal-blue shirt and red tie, ending at the
      // waist (khaki trousers below), ID badge, glasses with a glint.
      part(sp, 0.17, 0.46, 0.012, 0x2f66d0, 0, 0.22, cz + 0.002);
      for (const s of [1, -1]) part(sp, 0.016, 0.46, 0.014, 0xc8c8c0, s * 0.092, 0.22, cz + 0.004); // lapel edges
      part(sp, 0.04, 0.3, 0.014, 0xd02428, 0, 0.27, cz + 0.008, ZT.FLAT, 0.08);
      part(sp, 0.055, 0.04, 0.016, 0xd02428, 0, 0.43, cz + 0.008, ZT.FLAT, 0.08);
      part(sp, 0.05, 0.06, 0.012, 0xf8f8f8, 0.13, 0.32, cz + 0.006, ZT.FLAT, 0.2);
      part(sp, 0.05, 0.015, 0.014, 0x2a5aa0, 0.13, 0.35, cz + 0.01, ZT.FLAT);
      for (const s of [1, -1]) part(h, 0.058, 0.044, 0.008, 0xa8e0f8, s * 0.052, 0.15, fz + 0.012, ZT.FLAT, 0.45); // glasses
      part(h, 0.17, 0.012, 0.01, 0x1a1a1a, 0, 0.172, fz + 0.012, ZT.FLAT);
      break;
    }
    case 'ranger': {
      // Wide-brim hat (not a target), pocket flaps, shoulder patch.
      prop(h, 0.24, 0.08, 0.26, 0x6e5a32, 0, top + 0.03, 0, ZT.LEATHER);
      prop(h, 0.4, 0.016, 0.42, 0x6e5a32, 0, top - 0.01, 0.01, ZT.LEATHER);
      prop(h, 0.245, 0.02, 0.265, 0x3a2a18, 0, top - 0.0, 0, ZT.LEATHER);
      for (const s of [1, -1]) part(sp, 0.09, 0.03, 0.012, 0x8a7840, s * 0.09, 0.38, cz + 0.004);
      part(r.armL.shoulder, 0.02, 0.08, 0.07, 0x2a6a3a, 0.052, -0.08, 0, ZT.FLAT);
      part(r.hips, 0.36, 0.05, 0.22, 0x3a2a18, 0, 0.055, 0, ZT.LEATHER);
      break;
    }
    case 'cop': {
      // Light-blue summer uniform, bare-headed: navy tie, epaulettes, pocket
      // flaps, gold badge, black duty belt. (Zombie cops: navy, peaked cap.)
      part(sp, 0.035, 0.26, 0.014, 0x1c2440, 0, 0.29, cz + 0.006);
      part(sp, 0.05, 0.035, 0.016, 0x1c2440, 0, 0.43, cz + 0.006);
      for (const s of [1, -1]) {
        part(sp, 0.08, 0.025, 0.012, 0x5a86c8, s * 0.1, 0.38, cz + 0.004); // pocket flap
        part(s > 0 ? r.armL.shoulder : r.armR.shoulder, 0.104, 0.016, 0.114, 0x1c2440, 0, -0.012, 0); // epaulette
        part(s > 0 ? r.armL.shoulder : r.armR.shoulder, 0.012, 0.07, 0.06, 0xd8b040, s * 0.052, -0.09, 0, ZT.FLAT, 0.2); // patch
      }
      part(sp, 0.05, 0.06, 0.012, 0xe8c040, 0.1, 0.32, cz + 0.006, ZT.FLAT, 0.4); // badge
      part(r.hips, 0.36, 0.05, 0.22, 0x161414, 0, 0.055, 0, ZT.LEATHER);
      part(r.hips, 0.05, 0.035, 0.012, 0xc8a840, 0, 0.055, 0.115, ZT.FLAT);
      break;
    }
    case 'nurse': {
      // Purple scrubs, white V-neck trim, white cap with a red cross, bun, ID card.
      part(sp, 0.12, 0.022, 0.012, 0xf4f4f4, 0, 0.44, cz + 0.004, ZT.FLAT, 0.15);
      part(sp, 0.04, 0.055, 0.012, 0xf8f8f8, 0.09, 0.3, cz + 0.004, ZT.FLAT, 0.2);
      part(sp, 0.012, 0.12, 0.012, 0xf4f4f4, 0.07, 0.38, cz + 0.004, ZT.FLAT, undefined, 0, 0.35);
      prop(h, 0.1, 0.1, 0.08, v.hair, 0, 0.22, -0.14, ZT.HAIR); // bun
      prop(h, 0.15, 0.06, 0.1, 0xf6f6f2, 0, top + 0.055, 0.03, ZT.FLAT, 0.3); // cap
      prop(h, 0.036, 0.012, 0.01, 0xe02020, 0, top + 0.06, 0.084, ZT.FLAT, 0.4); // red cross
      prop(h, 0.012, 0.036, 0.01, 0xe02020, 0, top + 0.06, 0.084, ZT.FLAT, 0.4);
      break;
    }
    case 'worker': {
      // Red buffalo-check flannel (rolled sleeves), jeans, white tee at the
      // collar, leather tool belt with a hammer. (Zombie workers: grey shirts,
      // hi-vis vests, hard hats.)
      part(sp, 0.1, 0.06, 0.012, 0xeeeae0, 0, 0.42, cz + 0.004, ZT.CLOTH, 0.12);
      part(r.hips, 0.36, 0.06, 0.225, 0x6a4424, 0, 0.05, 0, ZT.LEATHER);
      part(r.hips, 0.07, 0.08, 0.04, 0x5a3a1e, 0.12, 0.0, 0.11, ZT.LEATHER); // pouch
      part(r.hips, 0.024, 0.18, 0.024, 0x9a6c3a, -0.12, -0.06, 0.125, ZT.LEATHER); // hammer handle
      part(r.hips, 0.09, 0.03, 0.03, 0x60646c, -0.12, 0.04, 0.125, ZT.FLAT); // hammer head
      break;
    }
    default: {
      // Open shirt over a white tee.
      part(sp, 0.12, 0.4, 0.012, 0xe8e4da, 0, 0.24, cz + 0.004);
      break;
    }
  }
}
