import * as THREE from 'three';
import { Boss } from '../../../gameplay/Boss';
import type { EnemySpawn } from '../../../gameplay/Enemy';
import type { ShotHit } from '../../../gameplay/Entity';
import type { World } from '../../../gameplay/World';
import { clamp, damp } from '../../../core/math';
import { Kit } from '../../kit/ModelKit';
import { createEnemy, registerEnemy } from '../../registry';
import { z1Scene } from './env';
import { bakeInto } from './bake';
import type { HitPart } from '../../../core/types';

/** Chest pustules [x, y, z, radius, hp] in chest space; belly ones in spine space. */
const PUS_CHEST: [number, number, number, number, number][] = [
  [-0.66, 0.7, 0.28, 0.17, 7],
  [0.72, 0.62, 0.3, 0.15, 7],
  [-0.42, 0.33, 0.5, 0.12, 5],
];
const PUS_BELLY: [number, number, number, number, number][] = [
  [-0.32, 0.45, 0.62, 0.16, 7],
  [0.3, 0.25, 0.63, 0.15, 7],
  [-0.05, 0.1, 0.66, 0.13, 6],
];

/**
 * THE BUTCHER — stage 1 boss of DEAD ZONE.
 *
 * A ~3.2 m mutated butcher: chain-mail apron (armour), cleaver grafted to the
 * right arm (armour), a meat hook on a chain in the left hand, an exposed
 * beating heart in the chest and glowing pustules (weak points), glowing eyes
 * (the head is worth much more while he roars).
 *
 * Phase 1 (100–66%): cleaver slams, hook throws, charges.
 * Phase 2 (66–33%):  rips off the apron (3 more pustules), summons walkers,
 *                    adds barrel / car-door throws.
 * Phase 3 (< 33%):   frenzy — faster windups, double slams, hook volleys.
 * Every attack is telegraphed: slams and charges with the ring on his heart
 * (enough weak-point damage interrupts them), throws as shootable projectiles.
 */

type Part = { mesh: THREE.Mesh; hp: number; popped: boolean };

const SKIN = 0xa08474;
const SKIN_DARK = 0x6e5048;
const PANTS = 0x2e2a28;
const BLOOD = 0x4a0808;

/** Charge wind-up (s): not shortened by later phases. */
const CHARGE_WIND = 0.85;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();

export class Butcher extends Boss {
  // Rig.
  private hips!: THREE.Group;
  private spine!: THREE.Group;
  private chest!: THREE.Group;
  private head!: THREE.Group;
  private jaw!: THREE.Group;
  private shL!: THREE.Group;
  private shR!: THREE.Group;
  private elL!: THREE.Group;
  private elR!: THREE.Group;
  private hipL!: THREE.Group;
  private hipR!: THREE.Group;
  private knL!: THREE.Group;
  private knR!: THREE.Group;
  private heart!: THREE.Mesh;
  private heartAnchor!: THREE.Object3D;
  private apron!: THREE.Group;
  private apronParts: THREE.Mesh[] = [];
  private pustules: Part[] = [];
  private bellyPustules: Part[] = [];
  private allPustules: Part[] = [];
  private relOut = { fwd: 0, right: 0 };
  private hookInHand!: THREE.Group;
  private handL!: THREE.Object3D;
  private propBarrel!: THREE.Group;
  private propDoor!: THREE.Group;
  private eyes: THREE.Mesh[] = [];
  private mouthGlow!: THREE.Mesh;
  private lookPivot = new THREE.Object3D();
  private hookGeo!: THREE.BufferGeometry;
  private hookGeoBig!: THREE.BufferGeometry;
  /** Thrown-object prototypes, built once and cloned per throw (shared geometry + materials). */
  private thrownHook!: THREE.Mesh;
  private thrownBarrel!: THREE.Mesh;
  private thrownDoor!: THREE.Mesh;

  // AI.
  private nextAttack = 2.0;
  private lastAttack = '';
  private dmgInState = 0;
  private flinchT = 0;
  private walkPhase = 0;
  private lastStep = 0;
  private strafeSeed = 0;
  private chargeT = 0;
  private chargeDur = 2;
  private volley = 0;
  private heavyKind: 'barrel' | 'door' = 'barrel';
  private comboLeft = 0;
  private apronOff = false;
  private apronVel = new THREE.Vector3();
  private apronSpin = new THREE.Vector3();
  private apronT = -1;
  private pendingPhase = 0;
  private deathBurst = false;
  private bloodT = 0;
  /** Heart swelling while he charges (bigger, brighter target: "shoot it to stop him"). */
  private heartSwell = 1;
  private roarSfx = false;
  /** One-shot flag for the current state (reset by go()). */
  private fired = false;

  constructor(world: World, spawn: EnemySpawn) {
    super(world, spawn);
  }

  protected override configure() {
    this.name = 'butcher';
    this.title = 'THE BUTCHER';
    this.maxHp = 175;
    this.speed = 1.4;
    this.attackRange = 3.4;
    this.points = 25000;
    this.phases = [0.66, 0.33];
    this.telegraphRadius = 0.55;
    this.bloodColor = 0x6a0808;
    this.sfxHit = 'hit_flesh';
    this.sfxDie = null;
    this.knockback = 0;
    this.deathDuration = 4.2;
  }

  // ─── Model ────────────────────────────────────────────────────────────────

  protected override build() {
    const skin = Kit.mat(SKIN);
    const skinDark = Kit.mat(SKIN_DARK);
    const pants = Kit.mat(PANTS);
    const boots = Kit.mat(0x1a1614);
    const blood = Kit.mat(BLOOD);
    const vein = Kit.mat(0x5a2a3a);
    // Self-lit steel: the moon is behind him, so a lit material would read as a
    // dark sliver against the night sky exactly when the raised cleaver matters.
    const steel = Kit.glow(0x8a95a3, 1.0);
    const iron = Kit.mat(0x5a5e65);
    const bone = Kit.mat(0xd8cdb0);
    const mail = Kit.mat(0x9aa2aa);
    const m = this.model;
    // Every joint is baked into one mesh per hit-zone (≈30 draw calls instead of ≈90).
    const bake = (parent: THREE.Object3D, part: HitPart | null, fn: (g: THREE.Group) => void) => {
      const out = bakeInto(parent, fn);
      if (part) for (const x of out) this.hitbox(x, part);
      return out;
    };

    // Legs.
    this.hips = Kit.pivot(m, 0, 1.25, 0, 'hips');
    bake(this.hips, 'torso', (g) => Kit.add(g, Kit.box(1.0, 0.42, 0.72), pants, 0, 0, 0));
    const leg = (side: 1 | -1) => {
      const hip = Kit.pivot(this.hips, side * 0.34, -0.08, 0);
      bake(hip, 'limb', (g) => Kit.add(g, Kit.box(0.44, 0.66, 0.48), pants, 0, -0.33, 0));
      const knee = Kit.pivot(hip, 0, -0.62, 0.02);
      bake(knee, 'limb', (g) => {
        Kit.add(g, Kit.box(0.38, 0.58, 0.4), pants, 0, -0.29, 0);
        Kit.add(g, Kit.box(0.46, 0.24, 0.72), boots, 0, -0.56, 0.12);
        Kit.add(g, Kit.box(0.4, 0.1, 0.42), blood, 0, -0.1, 0.01);
      });
      return { hip, knee };
    };
    const lL = leg(1);
    const lR = leg(-1);
    this.hipL = lL.hip;
    this.knL = lL.knee;
    this.hipR = lR.hip;
    this.knR = lR.knee;

    // Torso: gut + barrel chest, hunched.
    this.spine = Kit.pivot(this.hips, 0, 0.22, 0, 'spine');
    bake(this.spine, 'torso', (g) => {
      Kit.add(g, Kit.sphere(0.72, 10, 8), skin, 0, 0.35, 0.06, 0, 0, 0, 1.05, 0.88, 0.8);
      Kit.add(g, Kit.box(0.5, 0.06, 0.3), blood, 0.2, 0.0, 0.55, 0.4, 0, 0.2);
    });
    this.chest = Kit.pivot(this.spine, 0, 0.62, 0, 'chest');
    bake(this.chest, 'torso', (g) => {
      Kit.add(g, Kit.box(1.45, 0.95, 0.95), skin, 0, 0.22, 0);
      for (const sx of [1, -1]) Kit.add(g, Kit.ico(0.44, 0), skin, sx * 0.7, 0.52, -0.08, 0.3, sx * 0.5, 0, 1, 0.8, 1);
      Kit.add(g, Kit.ico(0.36, 0), skinDark, 0, 0.5, -0.35, 0, 0, 0, 1.6, 0.8, 1);
      // Blood smears + veins.
      Kit.add(g, Kit.box(0.5, 0.3, 0.02), blood, -0.35, 0.05, 0.48, 0, 0, 0.3);
      Kit.add(g, Kit.box(0.04, 0.6, 0.02), vein, -0.15, 0.35, 0.48, 0, 0, 0.4);
      Kit.add(g, Kit.box(0.04, 0.5, 0.02), vein, 0.6, 0.15, 0.48, 0, 0, -0.3);
      // Heart cavity (+X = his left) with ribs and veins.
      Kit.add(g, Kit.box(0.56, 0.56, 0.06), Kit.mat(0x2a0404), 0.33, 0.3, 0.47);
      for (const [dx, rz] of [[-0.3, 0.15], [0.3, -0.15]] as const) {
        for (let i = 0; i < 3; i++) Kit.add(g, Kit.box(0.06, 0.16, 0.08), bone, 0.33 + dx, 0.12 + i * 0.18, 0.5, 0, 0, rz);
      }
      for (const [dx, dy, rz] of [[0.18, 0.18, 0.7], [-0.17, 0.2, -0.6], [0.0, -0.22, 0]] as const) {
        Kit.add(g, Kit.box(0.05, 0.2, 0.05), Kit.glow(0xb01010, 1.2), 0.33 + dx, 0.3 + dy, 0.53, 0, 0, rz);
      }
      // Pustule rims.
      for (const [x, y, z, r] of PUS_CHEST) Kit.add(g, Kit.sphere(r * 1.25, 8, 6), Kit.mat(0x8a3a2a), x, y, z - r * 0.35, 0, 0, 0, 1, 1, 0.6);
      // Apron straps.
      for (const sx of [-1, 1]) Kit.add(g, Kit.box(0.08, 0.6, 0.06), Kit.mat(0x2a2420), sx * 0.66, 0.3, 0.46, 0, 0, -sx * 0.25);
      // Neck.
      Kit.add(g, Kit.box(0.36, 0.2, 0.36), skin, 0, 0.58, 0.32);
    });
    this.heart = Kit.add(this.chest, Kit.sphere(0.2, 10, 8), Kit.glow(0xff1a1a, 1.6), 0.33, 0.3, 0.55);
    this.heart.scale.set(1, 1.15, 0.9);
    this.hitbox(this.heart, 'weak');
    this.heartAnchor = this.heart;

    // Pustules (weak, pop individually).
    const pus = Kit.glow(0xff6a1a, 1.5);
    for (const [x, y, z, r, hp] of PUS_CHEST) {
      const mesh = Kit.add(this.chest, Kit.sphere(r, 8, 6), pus, x, y, z);
      this.hitbox(mesh, 'weak');
      this.pustules.push({ mesh, hp, popped: false });
    }
    // Belly pustules (hidden under the apron until phase 2).
    const bp = new THREE.Group();
    bp.name = 'bellyPustules';
    this.spine.add(bp);
    bake(bp, 'torso', (g) => {
      for (const [x, y, z, r] of PUS_BELLY) Kit.add(g, Kit.sphere(r * 1.25, 8, 6), Kit.mat(0x8a3a2a), x, y, z - r * 0.35, 0, 0, 0, 1, 1, 0.6);
    });
    for (const [x, y, z, r, hp] of PUS_BELLY) {
      const mesh = Kit.add(bp, Kit.sphere(r, 8, 6), pus, x, y, z);
      this.hitbox(mesh, 'weak');
      this.bellyPustules.push({ mesh, hp, popped: false });
    }
    bp.visible = false;
    this.allPustules = [...this.pustules, ...this.bellyPustules];

    // Chain-mail apron (armour) hanging from the chest.
    this.apron = Kit.pivot(this.chest, 0, -0.02, 0.6, 'apron');
    this.apron.rotation.x = -0.3;
    this.apronParts = bake(this.apron, 'armor', (g) => {
      Kit.add(g, Kit.box(1.25, 1.55, 0.07), mail, 0, -0.78, 0);
      const grid = Kit.mat(0x4a4e56);
      for (let i = 0; i < 6; i++) Kit.add(g, Kit.box(1.25, 0.025, 0.08), grid, 0, -0.1 - i * 0.27, 0.005);
      for (let i = 0; i < 5; i++) Kit.add(g, Kit.box(0.025, 1.55, 0.08), grid, -0.5 + i * 0.25, -0.78, 0.005);
      for (const [x, y, s] of [[-0.3, -0.5, 0.35], [0.25, -1.1, 0.45], [0.35, -0.3, 0.2], [-0.2, -1.35, 0.3]] as const) {
        Kit.add(g, Kit.box(s, s * 0.7, 0.09), blood, x, y, 0.01, 0, 0, x);
      }
    });

    // Head: small, low, forward.
    const neck = Kit.pivot(this.chest, 0, 0.58, 0.32);
    this.head = Kit.pivot(neck, 0, 0.08, 0.04, 'head');
    const headMeshes = bake(this.head, 'head', (g) => {
      Kit.add(g, Kit.box(0.48, 0.5, 0.5), skin, 0, 0.2, 0);
      Kit.add(g, Kit.box(0.5, 0.1, 0.12), skinDark, 0, 0.32, 0.22);
      Kit.add(g, Kit.box(0.52, 0.2, 0.52), Kit.mat(0xd8d0c4), 0, 0.53, -0.02, -0.08);
      Kit.add(g, Kit.box(0.54, 0.04, 0.54), Kit.mat(0x8a1a1a), 0, 0.45, -0.02, -0.08);
      Kit.add(g, Kit.box(0.18, 0.12, 0.02), blood, 0.12, 0.6, 0.24, 0, 0, 0.3);
    });
    this.headAnchor = headMeshes[0];
    const eyeGroup = new THREE.Group();
    this.head.add(eyeGroup);
    this.eyes = bake(eyeGroup, null, (g) => {
      for (const sx of [1, -1]) Kit.add(g, Kit.box(0.1, 0.055, 0.03), Kit.glow(0xffd23a, 1.8), sx * 0.12, 0.25, 0.255, 0, 0, -sx * 0.2);
    });
    this.jaw = Kit.pivot(this.head, 0, 0.04, 0.05, 'jaw');
    bake(this.jaw, 'head', (g) => {
      Kit.add(g, Kit.box(0.44, 0.15, 0.42), skinDark, 0, -0.05, 0.06);
      for (let i = 0; i < 4; i++) Kit.add(g, Kit.box(0.05, 0.07, 0.04), Kit.mat(0xe0d8b8), -0.15 + i * 0.1, 0.04, 0.26);
    });
    this.mouthGlow = Kit.add(this.head, Kit.box(0.32, 0.12, 0.06), Kit.glow(0xff4a1a, 1.6), 0, 0.04, 0.22);
    this.hitbox(this.mouthGlow, 'head');

    // Right arm: the cleaver.
    this.shR = Kit.pivot(this.chest, -0.9, 0.38, 0, 'shR');
    bake(this.shR, 'limb', (g) => {
      Kit.add(g, Kit.box(0.44, 0.82, 0.46), skin, 0, -0.38, 0);
      Kit.add(g, Kit.box(0.04, 0.5, 0.02), vein, 0.1, -0.4, 0.23, 0, 0, 0.3);
    });
    bake(this.shR, 'armor', (g) => {
      Kit.add(g, Kit.box(0.62, 0.26, 0.62), iron, -0.04, 0.05, 0, 0, 0, 0.25);
      for (const [x, z] of [[-0.2, 0.2], [0.15, 0.2], [-0.2, -0.2], [0.15, -0.2]]) Kit.add(g, Kit.sphere(0.04, 5, 4), mail, x - 0.04, 0.2, z);
    });
    this.elR = Kit.pivot(this.shR, 0, -0.8, 0);
    bake(this.elR, 'limb', (g) => {
      Kit.add(g, Kit.box(0.5, 0.74, 0.5), skin, 0, -0.34, 0);
      Kit.add(g, Kit.box(0.52, 0.12, 0.52), vein, 0, -0.68, 0);
      Kit.add(g, Kit.box(0.34, 0.22, 0.32), skinDark, 0, -0.8, 0);
      Kit.add(g, Kit.box(0.1, 0.4, 0.1), Kit.mat(0x3a2418), 0, -0.98, 0);
    });
    // Cleaver blade grafted to the wrist, edge forward.
    bake(this.elR, 'armor', (g) => {
      Kit.add(g, Kit.box(0.1, 1.3, 0.68), steel, 0, -1.72, 0.2);
      Kit.add(g, Kit.box(0.09, 1.3, 0.1), iron, 0, -1.72, -0.12);
      // Honed cutting edge catches the light: the raised cleaver reads against the night sky.
      Kit.add(g, Kit.box(0.11, 1.34, 0.06), Kit.glow(0xeef4ff, 1.4), 0, -1.72, 0.56);
      Kit.add(g, Kit.box(0.08, 0.9, 0.06), Kit.mat(0x6a0a0a), 0, -1.6, 0.4);
      Kit.add(g, Kit.cyl(0.07, 0.07, 0.09, 8), Kit.mat(0x111111), 0, -2.2, 0.05, 0, 0, Math.PI / 2);
    });

    // Left arm: chain-mail glove + meat hook on a chain.
    this.shL = Kit.pivot(this.chest, 0.88, 0.36, 0, 'shL');
    bake(this.shL, 'limb', (g) => Kit.add(g, Kit.box(0.38, 0.74, 0.4), skin, 0, -0.35, 0));
    this.elL = Kit.pivot(this.shL, 0, -0.72, 0);
    bake(this.elL, 'limb', (g) => {
      Kit.add(g, Kit.box(0.36, 0.66, 0.38), skin, 0, -0.32, 0);
      Kit.add(g, Kit.box(0.04, 0.4, 0.02), vein, 0.12, -0.2, 0.19, 0, 0, 0.3);
    });
    bake(this.elL, 'armor', (g) => Kit.add(g, Kit.box(0.42, 0.3, 0.44), mail, 0, -0.66, 0));
    this.handL = Kit.pivot(this.elL, 0, -0.86, 0.05);
    this.hookGeo = Kit.track(new THREE.TorusGeometry(0.2, 0.035, 4, 10, Math.PI * 1.45));
    this.hookGeoBig = Kit.track(new THREE.TorusGeometry(0.32, 0.075, 5, 10, Math.PI * 1.45));
    this.hookInHand = this.makeHook(true);
    this.hookInHand.position.set(0, -0.15, 0);
    this.handL.add(this.hookInHand);
    // Held props for heavy throws (hidden until used).
    this.propBarrel = this.makeBarrel();
    this.propDoor = this.makeDoor();
    this.propBarrel.visible = false;
    this.propDoor.visible = false;
    this.handL.add(this.propBarrel, this.propDoor);
    this.thrownHook = this.bakeProto((b) => this.hookParts(b, false));
    this.thrownBarrel = this.bakeProto((b) => this.barrelParts(b));
    this.thrownDoor = this.bakeProto((b) => this.doorParts(b));

    this.anchor = this.chest;
    this.lookPivot.position.set(0, 1.85, 0);
    this.root.add(this.lookPivot);
    this.strafeSeed = this.world.rng.next() * 10;
    this.spine.rotation.x = 0.28;
  }

  /**
   * Bake a prop into ONE root mesh (the opaque body) with the rest as children.
   * Projectiles aim/hit-test their root mesh, so it must be the solid part.
   */
  private bakeProto(fn: (g: THREE.Group) => void): THREE.Mesh {
    const holder = new THREE.Group();
    const meshes = bakeInto(holder, fn);
    const main = meshes[0];
    for (let i = 1; i < meshes.length; i++) main.add(meshes[i]);
    holder.remove(main);
    return main;
  }

  private makeHook(withChain: boolean): THREE.Group {
    const g = new THREE.Group();
    bakeInto(g, (b) => this.hookParts(b, withChain));
    return g;
  }

  private hookParts(b: THREE.Group, withChain: boolean) {
    // Held hooks are small; thrown ones are chunky (with a hunk of meat) so they read and can be hit mid-air.
    const k = withChain ? 1 : 1.6;
    const iron = Kit.mat(0xa4a8ae);
    if (withChain) for (let i = 0; i < 3; i++) Kit.add(b, Kit.box(0.06, 0.12, 0.03), iron, 0, -i * 0.12, 0, 0, i % 2 ? Math.PI / 2 : 0, 0);
    if (!withChain) {
      // Meat chunk first: it is the solid body the projectile is aimed at.
      Kit.add(b, Kit.sphere(0.2, 7, 5), Kit.mat(0xb04848), 0.02, -0.12, 0, 0.3, 0, 0.4, 1.15, 0.9, 0.8);
      Kit.add(b, Kit.box(0.3, 0.06, 0.24), Kit.mat(0xe8d8c0), 0.02, -0.1, 0.02, 0, 0, 0.4);
    }
    const hk = new THREE.Mesh(withChain ? this.hookGeo : this.hookGeoBig, iron);
    hk.position.set(0.02, withChain ? -0.55 : 0, 0);
    hk.rotation.set(0, 0, Math.PI * 0.85);
    b.add(hk);
    Kit.add(b, Kit.cone(0.05 * k, 0.14 * k, 5), iron, 0.2 * k, withChain ? -0.48 : 0.07 * k, 0, 0, 0, 0.4);
    // Shank + rusty blood.
    Kit.add(b, Kit.box(0.07 * k, 0.32 * k, 0.07 * k), iron, -0.17 * k, withChain ? -0.4 : 0.15 * k, 0, 0, 0, 0.2);
    Kit.add(b, Kit.box(0.1 * k, 0.06 * k, 0.08 * k), Kit.mat(0x7a0a0a), 0.18 * k, withChain ? -0.62 : -0.06 * k, 0);
  }

  private makeBarrel(): THREE.Group {
    const g = new THREE.Group();
    bakeInto(g, (b) => this.barrelParts(b));
    return g;
  }

  private barrelParts(b: THREE.Group) {
    Kit.add(b, Kit.cyl(0.34, 0.34, 0.95, 10), Kit.mat(0xc22a20), 0, 0, 0);
    Kit.add(b, Kit.cyl(0.35, 0.35, 0.06, 10), Kit.mat(0x5a120e), 0, 0.25, 0);
    Kit.add(b, Kit.cyl(0.35, 0.35, 0.06, 10), Kit.mat(0x5a120e), 0, -0.25, 0);
    // Glowing hazard band all the way round + label: reads on a dark sky from any spin angle.
    Kit.add(b, Kit.cyl(0.352, 0.352, 0.08, 10), Kit.glow(0xffb020, 1.25), 0, 0.05, 0);
    Kit.add(b, Kit.box(0.3, 0.22, 0.03), Kit.glow(0xffd23a, 1.1), 0, -0.1, 0.34);
  }

  private makeDoor(): THREE.Group {
    const g = new THREE.Group();
    bakeInto(g, (b) => this.doorParts(b));
    return g;
  }

  /** A police-cruiser door torn off at the hinges: white with a red/blue stripe. */
  private doorParts(b: THREE.Group) {
    const white = Kit.mat(0xe8e8e0);
    Kit.add(b, Kit.box(1.15, 0.65, 0.08), white, 0, -0.2, 0);
    Kit.add(b, Kit.box(1.0, 0.42, 0.06), Kit.mat(0x18202e), 0.05, 0.33, 0);
    Kit.add(b, Kit.box(1.0, 0.06, 0.08), white, 0.05, 0.55, 0);
    Kit.add(b, Kit.box(0.08, 0.5, 0.08), white, 0.55, 0.3, 0);
    Kit.add(b, Kit.box(0.08, 0.5, 0.08), white, -0.47, 0.3, 0);
    Kit.add(b, Kit.box(0.22, 0.05, 0.1), Kit.mat(0x8c9198), -0.2, -0.05, 0.05);
    for (const sz of [1, -1]) {
      Kit.add(b, Kit.box(1.16, 0.08, 0.02), Kit.glow(0x3a6aff, 1.3), 0, -0.3, sz * 0.045);
      Kit.add(b, Kit.box(1.16, 0.04, 0.02), Kit.glow(0xff2a2a, 1.3), 0, -0.4, sz * 0.045);
    }
  }

  override onAdded(): void {
    super.onAdded();
    this.world.rig.lookAtObject(this.lookPivot, 1.6);
    this.setState('intro');
  }

  // ─── Damage ───────────────────────────────────────────────────────────────

  protected override damageMultiplier(hit: ShotHit): number {
    const vulnerable = this.state === 'stumble' || this.state === 'flinch' || this.state === 'slamStuck';
    if (hit.part === 'weak') return vulnerable ? 1.5 : 1;
    if (hit.part === 'head') return this.mouthOpen() ? 1.2 : 0.4;
    // Body shots chip a little (a missed heart shot still counts for something).
    return 0.25;
  }

  private mouthOpen(): boolean {
    return this.state === 'roar' || this.state === 'phase' || this.state === 'intro' || this.state === 'chargeWind';
  }

  protected override onDamaged(hit: ShotHit, amount: number): void {
    if (hit.part === 'weak' || hit.part === 'head') {
      this.dmgInState += amount;
      this.flinchT = Math.min(1.4, this.flinchT + 0.45);
      // Pustules pop after enough damage.
      for (const list of [this.pustules, this.bellyPustules]) {
        for (const p of list) {
          if (p.popped || p.mesh !== hit.object) continue;
          p.hp -= amount;
          if (p.hp <= 0) this.popPustule(p, hit);
        }
      }
    }
    super.onDamaged(hit, amount);
  }

  private popPustule(p: Part, hit: ShotHit) {
    p.popped = true;
    p.mesh.visible = false;
    this.world.shootables.remove(p.mesh);
    this.world.fx.blood(hit.point, hit.dir, { color: 0xd8a020, amount: 1.8 });
    this.world.fx.gibs(hit.point, 0x8a2a1a, 4, 0.08);
    this.world.audio.play('gib', { volume: 0.9 });
    this.world.hitStop(0.05);
    this.world.rig.shake(0.2);
    // Bonus damage (keeps the hp bar honest: never below 1 from a pop alone).
    if (this.hp > 0) this.hp = Math.max(1, this.hp - 8);
    const pts = this.world.score.add(500);
    this.world.hud.popup(`+${pts}`, hit.screenX, hit.screenY - 30, 'points');
    const p2 = this.phaseFor();
    if (p2 > this.phase) {
      this.phase = p2;
      this.onPhase(p2);
    }
    this.flinchT = 1.4;
  }

  protected override onPhase(phase: number): void {
    this.pendingPhase = phase;
  }

  // ─── AI helpers ───────────────────────────────────────────────────────────

  /** Like moveToward but never turns the body (he always squares up to the player). */
  private slide(target: THREE.Vector3, speed: number, dt: number, stopAt = 0): number {
    _v.set(target.x - this.root.position.x, 0, target.z - this.root.position.z);
    const dist = _v.length();
    const remaining = dist - stopAt;
    if (remaining <= 0.001) {
      this.moveSpeed = 0;
      return Math.max(0, remaining);
    }
    const step = Math.min(remaining, speed * dt);
    this.root.position.addScaledVector(_v, step / dist);
    this.moveSpeed = dt > 0 ? step / dt : 0;
    return remaining - step;
  }

  private go(s: string) {
    this.telegraph = null;
    this.dmgInState = 0;
    this.roarSfx = false;
    this.fired = false;
    // Only the pick-up → throw sequence may carry a prop; anything else (phase
    // change, end of a hook volley…) leaves him with just the hook in hand.
    if (s !== 'heavyPick' && s !== 'heavyThrow') this.resetHands();
    this.setState(s);
  }

  /** Drop any held barrel / door (with a clatter if one was up) and restore the hook. */
  private resetHands() {
    const held = this.propBarrel.visible ? this.propBarrel : this.propDoor.visible ? this.propDoor : null;
    if (held) {
      held.getWorldPosition(_v);
      this.world.fx.debris(_v, held === this.propBarrel ? 0xc22a20 : 0xe8e8e0);
      this.world.audio.play('hit_world', { volume: 0.6, pitch: 0.7 });
    }
    this.propBarrel.visible = false;
    this.propDoor.visible = false;
    this.hookInHand.visible = true;
  }

  /** Rig-relative [right, forward] → world point on the ground. */
  private rel(right: number, fwd: number, out: THREE.Vector3): THREE.Vector3 {
    const rig = this.world.rig.space;
    const h = rig.rotation.y;
    _f.set(-Math.sin(h), 0, -Math.cos(h));
    _r.set(Math.cos(h), 0, -Math.sin(h));
    return out.copy(rig.position).addScaledVector(_f, fwd).addScaledVector(_r, right).setY(0);
  }

  /** Distance ahead of the player along the rail forward axis, and lateral offset. */
  private relOf(pos: THREE.Vector3): { fwd: number; right: number } {
    const rig = this.world.rig.space;
    const h = rig.rotation.y;
    _v.subVectors(pos, rig.position);
    this.relOut.fwd = _v.x * -Math.sin(h) + _v.z * -Math.cos(h);
    this.relOut.right = _v.x * Math.cos(h) - _v.z * Math.sin(h);
    return this.relOut;
  }

  private get speedMul() {
    return this.phase === 0 ? 1 : this.phase === 1 ? 1.2 : 1.45;
  }

  private get windMul() {
    return this.phase === 0 ? 1 : this.phase === 1 ? 0.9 : 0.8;
  }

  /**
   * Weak-point damage needed to interrupt a slam / charge: two pistol hits on a
   * weak spot (weak ×2 → 2 per hit) in every phase.
   */
  private get interruptNeed() {
    return this.phase === 0 ? 3 : 4;
  }

  /** Charges are stopped by one heart hit in phase 1 (it teaches the move), two later. */
  private get chargeNeed() {
    return this.phase === 0 ? 2 : this.interruptNeed;
  }

  private standDist() {
    return this.phase === 2 ? 7.2 : 8.2;
  }

  private chooseAttack(): string {
    const r = this.world.rng;
    const dist = this.relOf(this.root.position).fwd;
    const opts: [string, number][] = [];
    opts.push(['slam', 3.5]);
    opts.push(['hook', 3]);
    if (dist > 6.5) opts.push(['charge', this.phase === 0 ? 1.6 : 2.2]);
    if (this.phase >= 1) opts.push(['heavy', 2.8]);
    // Avoid repeating the same thing three times running.
    const filtered = opts.map(([k, w]) => [k, k === this.lastAttack ? w * 0.4 : w] as [string, number]);
    const total = filtered.reduce((n, [, w]) => n + w, 0);
    let x = r.next() * total;
    for (const [k, w] of filtered) {
      x -= w;
      if (x <= 0) return k;
    }
    return 'slam';
  }

  private startAttack(kind: string) {
    this.lastAttack = kind;
    switch (kind) {
      case 'slam':
        this.comboLeft = this.phase === 2 ? 1 : 0;
        this.go('slamStep');
        break;
      case 'hook':
        this.volley = this.phase === 2 ? 3 : this.phase === 1 ? 2 : 1;
        this.go('hookWind');
        break;
      case 'heavy':
        this.heavyKind = this.world.rng.chance(0.5) ? 'barrel' : 'door';
        this.go('heavyPick');
        break;
      case 'charge':
        this.go('chargeWind');
        break;
    }
  }

  private summon(kinds: string[]) {
    const w = this.world;
    const spots: [number, number][] = [[-4.8, 8.5], [4.6, 9.5], [-2.6, 12], [3, 13], [0.5, 10.5]];
    kinds.forEach((type, i) => {
      w.later(0.25 + i * 0.45, () => {
        if (this.state === 'dying' || this.removed) return;
        const [rx, fz] = spots[i % spots.length];
        const pos = this.rel(rx + w.rng.spread(0.6), fz + w.rng.spread(0.8), new THREE.Vector3());
        try {
          const e = createEnemy(type, w, {
            pos,
            frame: 'world',
            entry: 'rise',
            hpMul: 1,
            speedMul: 1,
            opts: { variant: w.rng.pick(['worker', 'civilian', 'office']) },
          });
          w.add(e);
        } catch (err) {
          console.error('[butcher] summon failed', err);
        }
      });
    });
  }

  private roarFx(volume = 1) {
    this.world.audio.play('brute_roar', { volume, pitch: 0.62, vary: 0.05 });
    this.world.audio.play('zombie_groan', { volume: volume * 0.6, pitch: 0.5 });
    this.world.rig.shake(0.35);
  }

  private stompFx(scale = 0.5) {
    this.world.audio.play('stomp', { volume: 0.55 * scale + 0.2, pitch: 0.8, vary: 0.1 });
    this.world.fx.dust(this.root.position, 0.5 * scale + 0.3, 0x4a4440);
    this.world.rig.shake(0.05 + scale * 0.06);
  }

  // ─── State machine ───────────────────────────────────────────────────────

  protected override entryUpdate(_dt: number): boolean {
    return true;
  }

  protected override advanceUpdate(_dt: number): void {
    this.go('stalk');
  }

  protected override customUpdate(dt: number): void {
    const t = this.stateTime;
    this.playerPos(_p);
    // Phase transitions interrupt anything except the intro.
    if (this.pendingPhase > 0 && this.state !== 'intro' && this.state !== 'phase') {
      this.go('phase');
      return;
    }
    switch (this.state) {
      case 'intro': {
        // Shoulder out of the shop, then roar.
        if (!this.fired) {
          this.fired = true;
          const sc = z1Scene(this.world);
          if (sc) sc.bossLight = 1;
          if (sc) sc.town.doors.burst(this.world, this.world.rig.space.position);
          this.world.audio.play('boss_warning', { volume: 0.6 });
        }
        if (t < 1.4) {
          this.rel(0, this.standDist() + 7.5, _w);
          this.slide(_w, 3.2, dt, 0);
        } else if (!this.roarSfx) {
          this.roarSfx = true;
          this.roarFx(1);
        }
        this.faceToward(_p, dt, 4);
        if (t > 3.3) this.go('stalk');
        break;
      }
      case 'stalk': {
        const sway = Math.sin(this.age * 0.55 + this.strafeSeed) * 2.4;
        this.rel(sway, this.standDist(), _w);
        this.slide(_w, this.speed * this.speedMul, dt, 0.15);
        this.faceToward(_p, dt, 5);
        this.nextAttack -= dt;
        if (this.nextAttack <= 0) {
          this.startAttack(this.chooseAttack());
        } else if (this.age > 10 && this.world.rng.chance(dt * 0.04)) {
          this.go('roar');
        }
        break;
      }
      case 'slamStep': {
        const rr = this.relOf(this.root.position);
        this.rel(clamp(rr.right, -1.5, 1.5), 4.0, _w);
        const rem = this.slide(_w, 3.4 * this.speedMul, dt, 0);
        this.faceToward(_p, dt, 8);
        if (rem < 0.15 || t > 3) this.go('slam');
        break;
      }
      case 'slam': {
        const wind = 2.0 * this.windMul;
        this.faceToward(_p, dt, 6);
        if (this.dmgInState >= this.interruptNeed) {
          this.interrupted();
          break;
        }
        if (this.telegraphAttack(wind, () => this.slamLand(), this.heartAnchor)) {
          this.go('slamStuck');
        }
        break;
      }
      case 'slamStuck': {
        if (t > 1.05 * this.windMul + 0.15) {
          if (this.comboLeft > 0) {
            this.comboLeft--;
            this.go('slam');
          } else {
            this.go('backoff');
          }
        }
        break;
      }
      case 'flinch': {
        // Reel back a step.
        this.rel(this.relOf(this.root.position).right, this.relOf(this.root.position).fwd + 1, _w);
        if (t < 0.5) this.slide(_w, 1.8, dt, 0);
        this.faceToward(_p, dt, 3);
        if (t > 1.35) this.go('backoff');
        break;
      }
      case 'backoff': {
        const rr = this.relOf(this.root.position);
        this.rel(rr.right * 0.9, this.standDist(), _w);
        const rem = this.slide(_w, 2.2 * this.speedMul, dt, 0.1);
        this.faceToward(_p, dt, 8);
        if (rem < 0.2 || t > 3.5) {
          this.nextAttack = this.cooldown();
          this.go('stalk');
        }
        break;
      }
      case 'hookWind': {
        this.faceToward(_p, dt, 8);
        const wind = 0.8 * this.windMul;
        if (t >= wind && !this.fired) {
          this.fired = true;
          this.throwHook();
        }
        if (t > wind + 0.35) {
          this.volley--;
          if (this.volley > 0) {
            this.go('hookWind');
            this.stateTime = 0.35 * this.windMul;
          } else {
            this.nextAttack = this.cooldown();
            this.go('stalk');
          }
        }
        if (t > wind + 0.2 && !this.hookInHand.visible) this.hookInHand.visible = true;
        break;
      }
      case 'heavyPick': {
        this.faceToward(_p, dt, 6);
        if (t > 0.45 && !this.fired) {
          this.fired = true;
          this.propBarrel.visible = this.heavyKind === 'barrel';
          this.propDoor.visible = this.heavyKind === 'door';
          this.hookInHand.visible = false;
          this.world.audio.play('hit_world', { volume: 0.7, pitch: 0.6 });
        }
        if (t > 0.8 * this.windMul) this.go('heavyThrow');
        break;
      }
      case 'heavyThrow': {
        this.faceToward(_p, dt, 6);
        const wind = 0.75 * this.windMul;
        // Released as the arm swings through shoulder height (one projectile per throw).
        if (t >= wind + 0.1 && !this.fired) {
          this.fired = true;
          this.throwHeavy();
        }
        if (t > wind + 0.6) {
          this.nextAttack = this.cooldown();
          this.go('stalk');
        }
        break;
      }
      case 'chargeWind': {
        this.faceToward(_p, dt, 8);
        if (!this.roarSfx) {
          this.roarSfx = true;
          this.roarFx(0.8);
          // Fair in every phase: a fixed 0.85 s wind-up and a run of at least
          // 0.7 s, so there is always ≥ 1.5 s to land the weak-point hits that
          // trip him (one in phase 1, two later; the heart swells as a target).
          const dist = Math.max(0, this.relOf(this.root.position).fwd - 2.7);
          const runSpeed = Math.min(6.5 * this.speedMul, dist / 0.7);
          this.chargeDur = CHARGE_WIND + (runSpeed > 0 ? dist / runSpeed : 0.7);
          this.chargeT = 0;
        }
        this.chargeT += dt;
        this.updateChargeTelegraph();
        if (this.dmgInState >= this.chargeNeed) {
          this.stumbled();
          break;
        }
        if (t > CHARGE_WIND) {
          const carried = this.dmgInState;
          this.go('charge');
          this.dmgInState = carried;
        }
        break;
      }
      case 'charge': {
        this.chargeT += dt;
        this.updateChargeTelegraph();
        if (this.dmgInState >= this.chargeNeed) {
          this.stumbled();
          break;
        }
        const rr = this.relOf(this.root.position);
        this.rel(clamp(rr.right, -1.2, 1.2), 2.7, _w);
        const remainT = Math.max(0.05, this.chargeDur - this.chargeT);
        const dist = this.root.position.distanceTo(_w);
        this.slide(_w, Math.max(2, dist / remainT), dt, 0);
        this.faceToward(_p, dt, 10);
        if (this.chargeT >= this.chargeDur) {
          this.telegraph = null;
          this.world.hurtPlayer(1, this.title);
          this.world.audio.play('crash', { volume: 0.9 });
          this.world.audio.play('stomp', { volume: 1, pitch: 0.7 });
          this.world.rig.shake(0.9);
          this.go('backoff');
        }
        break;
      }
      case 'stumble': {
        // Tripped by the damage: down on one knee, heart exposed.
        if (t < 0.4) {
          this.rel(this.relOf(this.root.position).right, Math.max(3, this.relOf(this.root.position).fwd - 0.6), _w);
          this.slide(_w, 2, dt, 0);
        }
        if (t > 1.9) this.go('backoff');
        break;
      }
      case 'roar': {
        this.faceToward(_p, dt, 4);
        if (t > 0.2 && !this.roarSfx) {
          this.roarSfx = true;
          this.roarFx(0.9);
        }
        if (t > 1.7) {
          this.nextAttack = Math.min(this.nextAttack, 0.6);
          this.go('stalk');
        }
        break;
      }
      case 'phase': {
        this.faceToward(_p, dt, 4);
        const p = this.pendingPhase;
        if (!this.fired) {
          this.fired = true;
          this.roarFx(1.1);
          this.world.hud.banner(p === 1 ? 'HE\'S ENRAGED!' : 'FRENZY!', p === 1 ? 'SHOOT THE PUSTULES' : 'FINISH HIM', 1.6);
        }
        if (p === 1 && t > 0.55 && !this.apronOff) this.ripApron();
        if (t > 1.0 && !this.roarSfx) {
          this.roarSfx = true;
          if (p === 1) this.summon(['walker', 'walker', 'walker']);
          else this.summon(['walker', 'crawler', 'walker', 'runner']);
          if (p === 2) {
            // Restore + forget cached materials first so a hit-flash can't revert the swap.
            this.refreshMeshes();
            for (const e of this.eyes) e.material = Kit.glow(0xff3a1a, 2.4);
            this.heart.material = Kit.glow(0xff2a10, 2.4);
          }
        }
        if (t > 2.2) {
          this.pendingPhase = 0;
          this.nextAttack = 1.2;
          this.go('stalk');
        }
        break;
      }
      default:
        this.go('stalk');
    }
  }

  private cooldown() {
    const r = this.world.rng;
    return this.phase === 0 ? r.range(1.5, 2.3) : this.phase === 1 ? r.range(1.1, 1.7) : r.range(0.7, 1.2);
  }

  private updateChargeTelegraph() {
    if (!this.telegraph) this.telegraph = { progress: 0, anchor: this.heartAnchor, radius: this.telegraphRadius };
    this.telegraph.progress = clamp(this.chargeT / this.chargeDur, 0, 1);
  }

  private interrupted() {
    this.world.audio.play('brute_roar', { volume: 0.7, pitch: 0.9 });
    this.world.audio.play('hit_armor', { volume: 0.8, pitch: 0.7 });
    this.world.hud.popup('INTERRUPTED!', this.world.viewport.width / 2, this.world.viewport.height * 0.3, 'combo');
    this.world.rig.shake(0.25);
    this.go('flinch');
  }

  private stumbled() {
    this.world.audio.play('stomp', { volume: 1, pitch: 0.6 });
    this.world.audio.play('crash', { volume: 0.6, pitch: 0.7 });
    this.world.fx.dust(this.root.position, 1.6, 0x4a4440);
    this.world.rig.shake(0.5);
    this.world.hud.popup('STAGGERED!', this.world.viewport.width / 2, this.world.viewport.height * 0.3, 'combo');
    this.go('stumble');
  }

  private slamLand() {
    const w = this.world;
    w.hurtPlayer(1, this.title);
    w.audio.play('stomp', { volume: 1, pitch: 0.65 });
    w.audio.play('crash', { volume: 0.8, pitch: 0.8 });
    w.rig.shake(0.85);
    this.rel(this.relOf(this.root.position).right - 0.4, Math.max(1.5, this.relOf(this.root.position).fwd - 1.6), _w);
    w.fx.dust(_w, 1.6, 0x4a4440);
    w.fx.sparks(_w.setY(0.1), null, 16);
  }

  /**
   * Launch point for a throw: the hand, but never above `maxAbove` over his
   * chest and a step toward the player. With the distance-scaled arc below the
   * whole flight stays on screen and under the boss health bar.
   */
  private launchFrom(hand: THREE.Object3D, maxAbove: number): THREE.Vector3 {
    hand.getWorldPosition(_v);
    this.chest.getWorldPosition(_w);
    _v.y = Math.min(_v.y, _w.y + maxAbove);
    this.playerPos(_p);
    _f.subVectors(_p, this.root.position).setY(0).normalize();
    return _v.addScaledVector(_f, 0.5).clone();
  }

  /** Arc height for a throw from `from`: flatter up close (a high lob would leave the screen). */
  private arcFor(from: THREE.Vector3, max: number): number {
    this.playerPos(_p);
    return clamp((Math.hypot(from.x - _p.x, from.z - _p.z) - 1) * 0.09, 0.2, max);
  }

  private throwHook() {
    this.hookInHand.visible = false;
    const from = this.launchFrom(this.hookInHand, 0.45);
    const ft = (this.phase === 0 ? 1.65 : this.phase === 1 ? 1.45 : 1.25) + (this.volley > 1 ? 0.1 * this.volley : 0);
    this.throwProjectile(from, {
      mesh: this.thrownHook.clone(),
      flightTime: ft,
      arc: this.arcFor(from, 0.6),
      hp: 1,
      points: 150,
      size: 0.5,
      spin: 8,
      source: this.title,
      burst: 'debris',
      color: 0x8a8f96,
      sfxDestroy: 'hit_armor',
    });
    this.world.audio.play('spit', { volume: 0.5, pitch: 0.4 });
  }

  private throwHeavy() {
    // Throw whatever is actually in his hand (heavyKind may have been re-rolled).
    const barrel = this.propBarrel.visible || (!this.propDoor.visible && this.heavyKind === 'barrel');
    const prop = barrel ? this.propBarrel : this.propDoor;
    const from = this.launchFrom(prop, 0.3);
    this.propBarrel.visible = false;
    this.propDoor.visible = false;
    this.throwProjectile(from, {
      mesh: (barrel ? this.thrownBarrel : this.thrownDoor).clone(),
      flightTime: barrel ? 2.0 : 2.1,
      arc: this.arcFor(from, barrel ? 0.6 : 0.5),
      hp: barrel ? 2 : 3,
      points: barrel ? 300 : 250,
      size: barrel ? 0.5 : 0.6,
      spin: barrel ? 5 : 6,
      source: this.title,
      burst: barrel ? 'explode' : 'debris',
      color: barrel ? 0xc22a20 : 0xe8e8e0,
      sfxDestroy: barrel ? 'explosion' : 'crash',
    });
    this.world.audio.play('stomp', { volume: 0.5, pitch: 1.1 });
  }

  private ripApron() {
    this.apronOff = true;
    for (const p of this.apronParts) this.world.shootables.remove(p);
    this.apron.updateMatrixWorld(true);
    this.world.scene.attach(this.apron);
    this.apron.getWorldDirection(_v);
    this.apronVel.copy(_v).multiplyScalar(2.5).setY(3.2);
    this.apronVel.x += 2.5;
    this.apronSpin.set(3, 2, 1.5);
    this.apronT = 0;
    this.refreshMeshes();
    const bp = this.spine.getObjectByName('bellyPustules');
    if (bp) bp.visible = true;
    this.world.audio.play('hit_armor', { volume: 1, pitch: 0.6 });
    this.world.audio.play('crash', { volume: 0.7, pitch: 1.2 });
    this.world.fx.sparks(this.apron.getWorldPosition(_v), null, 20);
    this.world.fx.blood(_v, null, { color: this.bloodColor, amount: 1.5 });
  }

  // ─── Animation ────────────────────────────────────────────────────────────

  protected override animate(dt: number): void {
    const s = this.state;
    const t = this.stateTime;
    const a = this.age;
    this.flinchT = Math.max(0, this.flinchT - dt * 4);
    // Apron flying away.
    if (this.apronT >= 0 && this.apronT < 2.5) {
      this.apronT += dt;
      this.apronVel.y -= 14 * dt;
      this.apron.position.addScaledVector(this.apronVel, dt);
      this.apron.rotation.x += this.apronSpin.x * dt;
      this.apron.rotation.z += this.apronSpin.z * dt;
      if (this.apron.position.y < 0.1) {
        this.apron.position.y = 0.1;
        this.apronVel.set(0, 0, 0);
        this.apronSpin.multiplyScalar(0);
        this.apron.rotation.x = -Math.PI / 2;
      }
    }
    if (s === 'dying') return;

    // Heart beat + pustule throb.
    const bpm = this.phase === 0 ? 1.2 : this.phase === 1 ? 1.6 : 2.2;
    const beat = Math.pow(Math.max(0, Math.sin(a * Math.PI * 2 * bpm)), 6);
    this.heartSwell = damp(this.heartSwell, s === 'chargeWind' || s === 'charge' ? 1.5 : 1, 8, dt);
    const hs = this.heartSwell;
    this.heart.scale.set((1 + beat * 0.25) * hs, (1.15 + beat * 0.3) * hs, (0.9 + beat * 0.2) * hs);
    for (let i = 0; i < this.allPustules.length; i++) {
      const p = this.allPustules[i];
      if (p.popped) continue;
      p.mesh.scale.setScalar(1 + Math.sin(a * 5 + p.mesh.position.x * 9) * 0.08);
    }

    // Locomotion.
    const spd = this.moveSpeed;
    this.walkPhase += dt * (1.2 + spd * 2.2);
    const walk = clamp(spd / 1.2, 0, 1);
    const sw = Math.sin(this.walkPhase) * 0.5 * walk;
    let hipL = sw;
    let hipR = -sw;
    let knL = Math.max(0, -Math.cos(this.walkPhase)) * 0.7 * walk;
    let knR = Math.max(0, Math.cos(this.walkPhase)) * 0.7 * walk;
    let hipsY = 1.25 - Math.abs(Math.cos(this.walkPhase)) * 0.06 * walk;
    // Heavy footsteps.
    const step = Math.floor(this.walkPhase / Math.PI);
    if (walk > 0.3 && step !== this.lastStep) this.stompFx(walk);
    this.lastStep = step;

    // Base pose (breathing, hunch).
    const breathe = Math.sin(a * 1.6) * 0.04;
    let spineX = 0.28 + breathe;
    let spineZ = Math.sin(this.walkPhase) * 0.06 * walk;
    let chestY = Math.sin(a * 0.7) * 0.08;
    let headX = -0.15 + Math.sin(a * 2.3) * 0.05;
    let headZ = Math.sin(a * 1.3) * 0.08;
    let jaw = 0.08 + Math.max(0, Math.sin(a * 3.1)) * 0.06;
    // Right (cleaver) arm hangs heavy, swings with the walk.
    let shRx = -0.15 - sw * 0.5;
    let shRz = -0.2;
    let elRx = -0.35;
    /** Forearm twist: turns the cleaver's broad face toward the player while it is raised. */
    let elRy = 0;
    // Left arm swings the hook.
    let shLx = -0.25 + sw * 0.5 + Math.sin(a * 2.2) * 0.08;
    let shLz = 0.25;
    let elLx = -0.5;

    switch (s) {
      case 'intro':
      case 'roar':
      case 'phase': {
        const k = s === 'intro' ? clamp((t - 1.3) / 0.4, 0, 1) * (1 - clamp((t - 3.0) / 0.3, 0, 1)) : clamp(t / 0.35, 0, 1) * (1 - clamp((t - (s === 'phase' ? 1.9 : 1.4)) / 0.3, 0, 1));
        spineX = 0.28 - 0.5 * k;
        headX = -0.15 - 0.55 * k;
        jaw = 0.1 + 0.55 * k + Math.sin(a * 40) * 0.04 * k;
        shRx = -0.15 - 0.9 * k;
        shRz = -0.2 - 0.9 * k;
        shLx = -0.25 - 0.9 * k;
        shLz = 0.25 + 0.9 * k;
        elRx = -0.35 - 0.4 * k;
        elLx = -0.5 - 0.4 * k;
        chestY = Math.sin(a * 9) * 0.05 * k;
        if (s === 'phase' && this.pendingPhase === 1 && t > 0.3 && t < 0.8) {
          // Tearing at the apron.
          shLx = -1.2;
          shLz = -0.3;
          elLx = -1.6;
        }
        break;
      }
      case 'slam': {
        const wind = 2.0 * this.windMul;
        const raise = clamp(t / (wind - 0.2), 0, 1);
        const down = clamp((t - (wind - 0.18)) / 0.18, 0, 1);
        const up = raise * (1 - down);
        shRx = -0.15 - 2.85 * up + 0.9 * down;
        shRz = -0.2 + 0.15 * up;
        elRx = -0.35 - 0.6 * up + 0.3 * down;
        elRy = -1.45 * up;
        spineX = 0.28 - 0.35 * up + 0.55 * down;
        headX = -0.15 - 0.25 * up;
        jaw = 0.1 + 0.35 * up;
        hipsY -= 0.08 * up;
        shLx = -0.5 * up;
        shLz = 0.6 * up;
        // Trembling at the top of the windup.
        chestY = Math.sin(a * 30) * 0.03 * raise;
        break;
      }
      case 'slamStuck': {
        // Cleaver buried in the asphalt; tugging at it.
        const tug = Math.sin(t * 9) * 0.06;
        shRx = 0.75 + tug;
        elRx = -0.05;
        spineX = 0.85 + tug * 0.5;
        hipsY -= 0.18;
        knL = knR = 0.35;
        hipL = hipR = -0.3;
        headX = 0.25;
        break;
      }
      case 'flinch':
      case 'stumble': {
        const dur = s === 'flinch' ? 1.35 : 1.9;
        const k = clamp(t / 0.25, 0, 1) * (1 - clamp((t - (dur - 0.4)) / 0.4, 0, 1));
        if (s === 'stumble') {
          // Down on one knee.
          hipsY -= 0.55 * k;
          hipL = -0.9 * k;
          knL = 1.6 * k;
          hipR = 0.6 * k;
          knR = 1.7 * k;
          spineX = 0.28 + 0.35 * k;
          shRx = 0.2 * k;
          elRx = -0.2;
          shLx = -0.5 * k;
          headX = -0.2 + Math.sin(t * 7) * 0.1 * k;
        } else {
          spineX = 0.28 - 0.45 * k;
          shRx = -0.15 + 0.6 * k;
          shRz = -0.2 - 0.6 * k;
          shLz = 0.25 + 0.7 * k;
          headX = -0.15 - 0.4 * k;
          jaw = 0.1 + 0.4 * k;
        }
        chestY = Math.sin(t * 13) * 0.12 * k;
        break;
      }
      case 'hookWind': {
        const wind = 0.8 * this.windMul;
        const k = clamp(t / wind, 0, 1);
        const rel = clamp((t - wind) / 0.25, 0, 1);
        // Whirl the hook overhead, then fling it forward.
        shLx = -1.6 * k * (1 - rel) - 0.9 * rel;
        shLz = 0.25 + 0.8 * k * (1 - rel);
        elLx = -0.9 * k + Math.sin(a * 18) * 0.25 * k * (1 - rel);
        chestY = -0.35 * k * (1 - rel) + 0.3 * rel;
        spineX = 0.28 - 0.15 * k + 0.3 * rel;
        break;
      }
      case 'heavyPick': {
        const k = clamp(t / 0.45, 0, 1);
        spineX = 0.28 + 0.75 * k;
        hipsY -= 0.3 * k;
        knL = knR = 0.6 * k;
        hipL = hipR = -0.5 * k;
        shLx = -0.9 * k;
        elLx = -0.3;
        headX = 0.2 * k;
        break;
      }
      case 'heavyThrow': {
        const wind = 0.75 * this.windMul;
        const k = clamp(t / wind, 0, 1);
        const rel = clamp((t - wind) / 0.2, 0, 1);
        spineX = 0.28 + 0.75 * (1 - k) - 0.3 * k * (1 - rel) + 0.4 * rel;
        hipsY -= 0.3 * (1 - k);
        shLx = -0.9 - 2.0 * k * (1 - rel) + 0.6 * rel;
        shLz = 0.25 + 0.2 * k;
        elLx = -0.3 - 0.9 * k * (1 - rel);
        shRx = -0.6 * k;
        chestY = -0.3 * k * (1 - rel) + 0.25 * rel;
        break;
      }
      case 'chargeWind': {
        const k = clamp(t / 0.3, 0, 1);
        spineX = 0.28 + 0.45 * k;
        headX = 0.25 * k;
        jaw = 0.1 + 0.5 * k;
        shRx = 0.3 * k;
        shRz = -0.6 * k;
        shLz = 0.6 * k;
        hipL = -0.3 * k + Math.sin(t * 14) * 0.2 * k; // scraping a foot
        knL = 0.4 * k;
        break;
      }
      case 'charge': {
        spineX = 0.75;
        headX = 0.3;
        jaw = 0.5;
        shRx = -0.6 + sw * 0.6;
        shRz = -0.5;
        shLx = -0.6 - sw * 0.6;
        shLz = 0.5;
        break;
      }
      default:
        break;
    }

    // Camera framing: look higher while the cleaver is up, lower when he's down on a knee.
    const lookY = s === 'slam' || s === 'slamStuck' ? 2.55 : s === 'stumble' ? 1.5 : s === 'charge' || s === 'chargeWind' ? 1.75 : 1.85;
    this.lookPivot.position.y = damp(this.lookPivot.position.y, lookY, 2.5, dt);

    // Hit flinch overlay.
    spineX -= this.flinchT * 0.12;
    headX -= this.flinchT * 0.15;

    const r = Math.min(1, dt * 14);
    this.hips.position.y = damp(this.hips.position.y, hipsY, 14, dt);
    this.hipL.rotation.x += (hipL - this.hipL.rotation.x) * r;
    this.hipR.rotation.x += (hipR - this.hipR.rotation.x) * r;
    this.knL.rotation.x += (knL - this.knL.rotation.x) * r;
    this.knR.rotation.x += (knR - this.knR.rotation.x) * r;
    this.spine.rotation.x += (spineX - this.spine.rotation.x) * r;
    this.spine.rotation.z += (spineZ - this.spine.rotation.z) * r;
    this.chest.rotation.y += (chestY - this.chest.rotation.y) * r;
    this.head.rotation.x += (headX - this.head.rotation.x) * r;
    this.head.rotation.z += (headZ - this.head.rotation.z) * r;
    this.jaw.rotation.x += (jaw - this.jaw.rotation.x) * Math.min(1, dt * 18);
    const ra = s === 'slam' ? Math.min(1, dt * 22) : r;
    this.shR.rotation.x += (shRx - this.shR.rotation.x) * ra;
    this.shR.rotation.z += (shRz - this.shR.rotation.z) * ra;
    this.elR.rotation.x += (elRx - this.elR.rotation.x) * ra;
    this.elR.rotation.y += (elRy - this.elR.rotation.y) * ra;
    this.shL.rotation.x += (shLx - this.shL.rotation.x) * r;
    this.shL.rotation.z += (shLz - this.shL.rotation.z) * r;
    this.elL.rotation.x += (elLx - this.elL.rotation.x) * r;
    this.mouthGlow.visible = this.jaw.rotation.x > 0.3;
  }

  // ─── Death: to his knees, then bursts ────────────────────────────────────

  protected override onDeath(_hit: ShotHit | null): void {
    this.telegraph = null;
    this.resetHands();
    this.roarFx(1);
    this.world.hud.banner('THE BUTCHER', 'IS DEAD', 2.2);
    const sc = z1Scene(this.world);
    if (sc) sc.bossLight = 0.2;
  }

  protected override updateDeath(dt: number): boolean {
    const t = this.stateTime;
    const w = this.world;
    // 0–1.2 s: knees buckle.
    const k = clamp(t / 1.1, 0, 1);
    const e = k * k * (3 - 2 * k);
    this.hips.position.y = 1.25 - 0.62 * e;
    this.hipL.rotation.x = -0.4 * e;
    this.hipR.rotation.x = -0.25 * e;
    this.knL.rotation.x = 1.75 * e;
    this.knR.rotation.x = 1.65 * e;
    this.shR.rotation.x = 0.4 * e;
    this.shR.rotation.z = -0.15;
    this.elR.rotation.x = -0.1;
    this.elR.rotation.y *= 0.9;
    this.shL.rotation.x = 0.2 * e;
    if (!this.deathBurst) {
      // 1.2–2.4 s: kneeling, howling at the sky, swelling.
      const h = clamp((t - 1.1) / 0.5, 0, 1);
      this.spine.rotation.x = 0.28 - 0.7 * h + Math.sin(t * 25) * 0.03 * h;
      this.head.rotation.x = -0.15 - 0.6 * h;
      this.jaw.rotation.x = 0.1 + 0.6 * h;
      this.mouthGlow.visible = h > 0.3;
      const swell = 1 + clamp((t - 1.3) / 1.1, 0, 1) * 0.8 + Math.sin(t * 30) * 0.05;
      this.heart.scale.setScalar(swell);
      for (const p of this.allPustules) if (!p.popped) p.mesh.scale.setScalar(swell);
      this.model.rotation.z = Math.sin(t * 17) * 0.02 * h;
      this.bloodT -= dt;
      if (t > 1.2 && this.bloodT <= 0) {
        this.bloodT = 0.14;
        this.heart.getWorldPosition(_v);
        w.fx.blood(_v, null, { color: this.bloodColor, amount: 0.7 });
      }
      if (t > 1.3 && t - dt <= 1.3) w.audio.play('brute_roar', { volume: 0.9, pitch: 0.5 });
      if (t >= 2.45) this.burst();
    } else {
      // Remains topple and sink.
      const s = clamp((t - 2.6) / 1.2, 0, 1);
      this.model.rotation.x = -s * s * 1.2;
      if (t > 3.2) this.model.position.y -= dt * 0.6;
    }
    return t > this.deathDuration;
  }

  private burst() {
    this.deathBurst = true;
    const w = this.world;
    this.chest.getWorldPosition(_v);
    _v.y += 0.2;
    w.audio.play('gib', { volume: 1, pitch: 0.7 });
    w.audio.play('explosion', { volume: 0.6, pitch: 0.55 });
    w.audio.play('hit_flesh', { volume: 1, pitch: 0.5 });
    w.rig.shake(0.9);
    w.hitStop(0.09);
    w.hud.flash('#7a0000', 0.3);
    w.fx.screenSplat(0x6a0808);
    for (let i = 0; i < 6; i++) {
      _w.set(Math.cos(i * 1.05), 0.6 + (i % 2) * 0.5, Math.sin(i * 1.05)).normalize();
      w.fx.blood(_v, _w, { color: i % 2 ? 0x6a0808 : 0x8a1010, amount: 2 });
    }
    w.fx.gibs(_v, 0x6a1010, 14, 0.2);
    w.fx.gibs(_v, SKIN, 8, 0.24);
    w.fx.gibs(_v, 0xd8cdb0, 4, 0.12);
    w.fx.dust(_v, 2.2, 0x4a0a0a);
    this.spine.visible = false;
    // Drop the cleaver (it stays behind as a trophy).
    w.fx.sparks(_v, null, 12);
  }
}

registerEnemy('butcher', (w, s) => new Butcher(w, s));
