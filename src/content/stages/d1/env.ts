import * as THREE from 'three';
import type { Environment } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import type { Destructible } from '../../../gameplay/Props';
import { EnvKit, type CurveFrame } from '../../kit/EnvKit';
import { Kit } from '../../kit/ModelKit';
import { Rng } from '../../../core/Rng';
import { clamp, easeInOutSine } from '../../../core/math';
import { Flora, COL } from './flora';
import { Herd } from './herd';
import {
  buildBarricade,
  buildFallenTree,
  buildGate,
  buildTourCar,
  fencePost,
  fenceSpan,
  fuelDrum,
  merged,
  signpost,
  warningSign,
  type FallenTree,
  type GateParts,
} from './props';
import { D, RIVER, RIVER_WIDTH } from './layout';

/**
 * JUNGLE RUN environment: a lush tropical park road by day — dirt road, giant
 * ferns, palms, cycads, vine-hung rainforest giants, an electric fence, a big
 * wooden gate with torches, a meadow with grazing long-necks, cliffs with a
 * waterfall feeding the river the road fords, and misty mountains around a
 * smoking volcano. Static scenery is baked into one vertex-coloured mesh per
 * 60 m chunk (one draw call each, frustum-culled per chunk).
 */

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

type Layer = 'verge' | 'near' | 'mid' | 'fill' | 'far' | 'patch' | 'rock';

const ROAD_MIN: Record<Layer, number> = { verge: 4.3, near: 6.4, mid: 9, fill: 7.5, far: 17, patch: 3.9, rock: 4.6 };

const FOG_FAR = 140;

let current: JungleEnv | null = null;

/** The live environment (set by buildJungle) — beats use it to trigger set pieces. */
export function jungle(): JungleEnv | null {
  return current;
}

export function buildJungle(world: World, curve: THREE.CatmullRomCurve3): Environment {
  const env = new JungleEnv(world, curve);
  current = env;
  return env.environment;
}

export class JungleEnv {
  readonly root = new THREE.Group();
  readonly environment: Environment;
  private len: number;
  private railX: Float32Array;
  private railZ: Float32Array;
  private railFrom = -80;
  private riverCurve: THREE.CatmullRomCurve3;
  private riverX: Float32Array;
  private riverZ: Float32Array;
  private flora = new Flora();
  /** Vegetation chunk meshes, hidden when entirely inside the fog. */
  private chunks: THREE.Mesh[] = [];
  private backdrop = new THREE.Group();
  private time = 0;

  // Set pieces.
  private gate!: GateParts;
  private gateT = -1;
  private fenceBreak = new THREE.Group();
  private fenceT = -1;
  private fenceSparks: THREE.Vector3[] = [];
  private oldBreakSpark = new THREE.Vector3();
  private sparkT = 0;
  private tree!: FallenTree;
  private treeT = -1;
  private drums: Destructible[] = [];
  private car = new THREE.Group();
  private carT = -1;
  private carVel = new THREE.Vector3();
  private carSpin = 0;
  private carBounced = false;
  private herd!: Herd;
  private stampedeTriggered = false;
  // Water.
  private streaks!: THREE.InstancedMesh;
  private streakPhase: number[] = [];
  private fallTop = new THREE.Vector3();
  private fallRight = new THREE.Vector3();
  private fallNormal = new THREE.Vector3();
  private foam!: THREE.InstancedMesh;
  private foamU: number[] = [];
  private mist: THREE.Mesh[] = [];
  private splashT = 0;
  // Volcano smoke.
  private smoke!: THREE.InstancedMesh;
  private smokeBase = new THREE.Vector3();

  constructor(private world: World, private curve: THREE.CatmullRomCurve3) {
    this.len = curve.getLength();
    // Rail polyline (extrapolated past both ends) for clearance checks.
    const n = Math.ceil((this.len - this.railFrom + 80) / 2);
    this.railX = new Float32Array(n);
    this.railZ = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = this.P(this.railFrom + i * 2, 0);
      this.railX[i] = p.x;
      this.railZ[i] = p.z;
    }
    // River.
    this.riverCurve = new THREE.CatmullRomCurve3(
      RIVER.map(([d, lat]) => this.P(d, lat)),
      false,
      'centripetal',
    );
    const rl = this.riverCurve.getLength();
    const rn = Math.ceil(rl / 2) + 1;
    this.riverX = new Float32Array(rn);
    this.riverZ = new Float32Array(rn);
    for (let i = 0; i < rn; i++) {
      this.riverCurve.getPointAt(Math.min(1, (i * 2) / rl), _v);
      this.riverX[i] = _v.x;
      this.riverZ[i] = _v.z;
    }

    this.build();
    world.scene.add(this.root);
    this.environment = {
      root: this.root,
      occluders: [this.gate.pillars, this.car],
      surface: 'dirt',
      update: (dt, w) => this.update(dt, w),
      dispose: () => {
        if (current === this) current = null;
      },
    };
  }

  // ─── Rail helpers ──────────────────────────────────────────────────────────

  /** Rail frame at distance d, extrapolated linearly beyond the ends. */
  F(d: number): CurveFrame {
    if (d < 0) {
      const f = EnvKit.frameAt(this.curve, 0);
      f.pos.addScaledVector(f.forward, d);
      return f;
    }
    if (d > this.len) {
      const f = EnvKit.frameAt(this.curve, this.len);
      f.pos.addScaledVector(f.forward, d - this.len);
      return f;
    }
    return EnvKit.frameAt(this.curve, d);
  }

  /** World point at rail distance d, `lat` metres right (negative = left), `y` up. */
  P(d: number, lat: number, y = 0): THREE.Vector3 {
    const f = this.F(d);
    return f.pos.addScaledVector(f.right, lat).setY(y);
  }

  private distRail(x: number, z: number, dHint: number): number {
    const i0 = Math.max(0, Math.floor((dHint - 70 - this.railFrom) / 2));
    const i1 = Math.min(this.railX.length - 1, Math.ceil((dHint + 70 - this.railFrom) / 2));
    let best = Infinity;
    for (let i = i0; i <= i1; i++) {
      const dx = this.railX[i] - x;
      const dz = this.railZ[i] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }

  private distRiver(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < this.riverX.length; i++) {
      const dx = this.riverX[i] - x;
      const dz = this.riverZ[i] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }

  private allowed(d: number, lat: number, layer: Layer, p: THREE.Vector3): boolean {
    const a = Math.abs(lat);
    if (this.distRail(p.x, p.z, d) < ROAD_MIN[layer]) return false;
    const dr = this.distRiver(p.x, p.z);
    const riverPad = layer === 'verge' || layer === 'patch' || layer === 'rock' ? 0.8 : layer === 'fill' ? 1.6 : 3.2;
    if (dr < RIVER_WIDTH / 2 + riverPad) return false;
    if (Math.abs(d - D.GATE) < 2.4 && a < 36) return false;
    if (d > D.MEADOW_FROM && d < D.MEADOW_TO) {
      if ((layer === 'mid' || layer === 'near' || layer === 'fill') && a < 46) return false;
      if (layer === 'far' && a < 62) return false;
      if (Math.abs(d - D.STAMPEDE_CROSS) < 10 && layer !== 'patch') return false;
    }
    if (lat < -7.6 && lat > -12.8 && d > D.FENCE_FROM - 3 && d < D.FENCE_TO + 3) return false;
    if (Math.abs(d - D.TREE) < 3.6 && a < 13 && layer !== 'patch') return false;
    if (Math.hypot(d - D.CAR, lat - D.CAR_SIDE) < 6) return false;
    if (Math.hypot(d - (D.CAR + 2), lat - 12.5) < 5.5 && layer !== 'patch') return false;
    if (lat < -15 && d > D.CLIFF_FROM && d < D.CLIFF_TO && (layer === 'mid' || layer === 'far' || layer === 'fill')) return false;
    if (d > D.BOSS_START - 20) {
      // Keep the riverside road open: the boss runs alongside and tumbles into the river.
      if ((layer === 'mid' || layer === 'near' || layer === 'fill') && lat > -12 && lat < 26) return false;
    }
    if (d > D.END - 4 && a < 8 && layer !== 'patch') return false;
    return true;
  }

  // ─── Build ─────────────────────────────────────────────────────────────────

  private build() {
    const w = this.world;
    const root = this.root;
    w.scene.background = new THREE.Color(0xb3cfc2);
    w.scene.fog = new THREE.Fog(0xb3cfc2, 24, FOG_FAR);
    EnvKit.lights(root, { sky: 0xeaf6ff, ground: 0x5a7430, hemi: 1.35, sun: 0xfff0d2, sunIntensity: 2.3, sunDir: [0.45, 1, 0.3] });

    this.buildBackdrop();
    root.add(EnvKit.ground(1600, COL.ground, 0, -340));
    this.buildRoad();
    this.buildRiver();
    this.buildVegetation();
    this.buildGate();
    this.buildFence();
    this.buildTree();
    this.buildMeadow();
    this.buildCliffs();
    this.buildEnd();
  }

  private buildBackdrop() {
    const b = this.backdrop;
    this.root.add(b);
    b.add(EnvKit.sky(0x3f8fd6, 0xcfe4dc, 0xa8c4b0, 330));
    const rng = new Rng(77);
    // Mountain ring (unfogged, pre-hazed colours).
    const far = new THREE.Group();
    const cone = Kit.jitter(Kit.cone(1, 1, 7), 0.12, 9);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rng.spread(0.1);
      const r = rng.range(240, 290);
      const h = rng.range(45, 95);
      const wdt = rng.range(70, 120);
      const col = rng.chance(0.5) ? 0x86a59b : 0x9bb6ae;
      Kit.add(far, cone, Kit.mat(col, { fog: false }), Math.sin(a) * r, h / 2 - 6, Math.cos(a) * r, 0, rng.next() * 6, 0, wdt, h, wdt * 0.8);
    }
    // Closer jungle-covered hills.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rng.spread(0.15);
      const r = rng.range(190, 220);
      const h = rng.range(22, 40);
      Kit.add(far, this.flora.blob(rng), Kit.mat(0x6f9480, { fog: false }), Math.sin(a) * r, h * 0.3, Math.cos(a) * r, 0, rng.next() * 6, 0, rng.range(40, 60), h, rng.range(30, 45));
    }
    // The volcano, ahead and to the left of the road.
    const vx = -95;
    const vz = -250;
    Kit.add(far, Kit.cyl(14, 105, 92, 12), Kit.mat(0x7c8a86, { fog: false }), vx, 40, vz);
    Kit.add(far, Kit.cyl(18, 22, 6, 12), Kit.mat(0x5f6664, { fog: false }), vx, 88, vz);
    // Clouds.
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = rng.range(150, 240);
      Kit.add(far, this.flora.blob(rng), Kit.mat(0xf4f8f8, { fog: false, emissive: 0xb0c4cc, emissiveIntensity: 0.55 }), Math.sin(a) * r, rng.range(95, 140), Math.cos(a) * r, 0, rng.next() * 6, 0, rng.range(25, 45), rng.range(5, 9), rng.range(14, 22));
    }
    EnvKit.mergeStatic(far);
    b.add(far);
    // Lava glow in the crater + a streak down the flank.
    Kit.add(b, Kit.cyl(15, 15, 1.5, 12), Kit.glow(0xff6a20, 1.3), vx, 91, vz);
    Kit.add(b, Kit.box(3, 30, 1), Kit.glow(0xc8461a, 1.0), vx + 6, 72, vz + 34, -0.75, 0, 0.1);
    // Smoke plume (instanced puffs that rise and swell).
    this.smokeBase.set(vx, 95, vz);
    this.smoke = new THREE.InstancedMesh(this.flora.blob(rng), Kit.mat(0xc8c6c0, { fog: false, emissive: 0x707070, emissiveIntensity: 0.6, transparent: true, opacity: 0.75 }), 7);
    this.smoke.frustumCulled = false;
    b.add(this.smoke);
  }

  private buildRoad() {
    const g = new THREE.Group();
    const c = this.curve;
    const to = this.len;
    g.add(EnvKit.ribbon(c, 7.2, Kit.mat(COL.road), { y: 0.02, step: 2, to }));
    for (const off of [-1.1, 1.1]) g.add(EnvKit.ribbon(c, 0.7, Kit.mat(COL.roadTrack), { y: 0.035, step: 2, offset: off, to }));
    for (const off of [-3.55, 3.55]) g.add(EnvKit.ribbon(c, 0.5, Kit.mat(0x86704c), { y: 0.03, step: 2, offset: off, to }));
    for (const off of [-4.4, 4.4]) g.add(EnvKit.ribbon(c, 1.8, Kit.mat(COL.verge), { y: 0.015, step: 2, offset: off, to }));
    // Puddles + embedded stones.
    const rng = new Rng(5);
    for (let d = 8; d < this.len; d += rng.range(10, 22)) {
      const lat = rng.spread(2.5);
      const p = this.P(d, lat, 0.045);
      if (Math.abs(d - D.FORD) < 14) continue;
      if (rng.chance(0.45)) {
        Kit.add(g, Kit.cyl(1, 1, 0.02, 9), Kit.mat(0x6b7f78, { emissive: 0x1a2a2a, emissiveIntensity: 0.5 }), p.x, 0.04, p.z, 0, rng.next() * 6, 0, rng.range(0.6, 1.3), 1, rng.range(0.4, 0.8));
      } else {
        Kit.add(g, this.flora.rockGeo(rng), Kit.mat(0x8c8270), p.x, 0.02, p.z, 0, rng.next() * 6, 0, 0.25, 0.1, 0.2);
      }
    }
    merged(g);
    this.root.add(g);
  }

  private buildRiver() {
    const rc = this.riverCurve;
    const g = new THREE.Group();
    g.add(EnvKit.ribbon(rc, RIVER_WIDTH + 4, Kit.mat(0x5e4e36), { y: 0.03, step: 2 }));
    g.add(EnvKit.ribbon(rc, RIVER_WIDTH + 1.2, Kit.mat(0x7a8a70), { y: 0.045, step: 2 }));
    merged(g);
    this.root.add(g);
    const water = EnvKit.ribbon(rc, RIVER_WIDTH, Kit.mat(0x2f9ab0, { emissive: 0x0c3a44, emissiveIntensity: 0.6, smooth: true }), { y: 0.075, step: 2 });
    this.root.add(water);
    const foamEdge = new THREE.Group();
    for (const off of [-RIVER_WIDTH / 2 + 0.35, RIVER_WIDTH / 2 - 0.35]) {
      foamEdge.add(EnvKit.ribbon(rc, 0.45, Kit.mat(0xd8eef2), { y: 0.085, step: 2, offset: off }));
    }
    merged(foamEdge);
    this.root.add(foamEdge);
    // Bank rocks + reeds, and stepping stones at the ford.
    const rocks = new THREE.Group();
    const rng = new Rng(31);
    const rl = rc.getLength();
    for (let s = 0; s < rl; s += 3.2) {
      const f = EnvKit.frameAt(rc, s);
      for (const side of [-1, 1]) {
        if (rng.chance(0.45)) continue;
        const lat = side * (RIVER_WIDTH / 2 + rng.range(-0.6, 1.6));
        const p = f.pos.clone().addScaledVector(f.right, lat);
        if (this.distRail(p.x, p.z, D.FORD) < 4.2) continue;
        if (rng.chance(0.6)) {
          const r = this.flora.rock(rng, rng.range(0.5, 1.3));
          r.position.copy(p).setY(0);
          rocks.add(r);
        } else {
          const gr = this.flora.grass(rng);
          gr.position.copy(p).setY(0);
          gr.scale.setScalar(1.4);
          rocks.add(gr);
        }
      }
    }
    // Ford boulders (things for compys to leap from) + one big flat rock in mid-stream.
    for (const [dd, lat, s] of [
      [D.FORD + 8, -5.5, 1.3],
      [D.FORD + 10, 5.8, 1.4],
      [D.FORD + 14, -7, 1.6],
      [D.FORD + 15, 7.5, 1.2],
      [D.FORD + 6, -3.8, 0.9],
      [D.FORD + 19, 3.5, 1.1],
      [D.FORD - 3, 6.5, 1.0],
    ] as [number, number, number][]) {
      const r = this.flora.rock(rng, s);
      r.position.copy(this.P(dd, lat));
      rocks.add(r);
    }
    merged(rocks);
    this.root.add(rocks);

    // Waterfall pouring off the cliff into the pool.
    const top = this.P(468, -36, 19);
    const pool = this.P(472, -28.5, 0);
    this.fallTop.copy(top);
    const toward = _w.subVectors(this.P(430, 0), pool).setY(0).normalize();
    this.fallNormal.copy(toward);
    this.fallRight.set(-toward.z, 0, toward.x);
    const fall = new THREE.Mesh(
      Kit.plane(6.5, 20),
      Kit.mat(0xcfeef6, { emissive: 0x5a8a9a, emissiveIntensity: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }),
    );
    fall.position.set(top.x, 9.6, top.z).addScaledVector(toward, 0.6);
    fall.rotation.y = Math.atan2(toward.x, toward.z);
    fall.rotation.x = -0.08;
    this.root.add(fall);
    this.streaks = new THREE.InstancedMesh(Kit.box(0.35, 2.6, 0.08), Kit.mat(0xffffff, { emissive: 0x9ab8c4, emissiveIntensity: 0.8 }), 18);
    this.streaks.frustumCulled = false;
    this.streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 18; i++) this.streakPhase.push(rng.next());
    this.root.add(this.streaks);
    // Mist at the base.
    const mistMat = Kit.mat(0xf2fafc, { transparent: true, opacity: 0.55, emissive: 0x8aa0a8, emissiveIntensity: 0.6 });
    for (let i = 0; i < 3; i++) {
      const m = Kit.add(this.root, this.flora.blob(rng), mistMat, pool.x + rng.spread(2.5), 1.2, pool.z + rng.spread(2), 0, rng.next() * 6, 0, 3.4, 1.8, 3.0);
      this.mist.push(m);
    }
    // Drifting foam flecks on the river.
    this.foam = new THREE.InstancedMesh(Kit.cyl(0.5, 0.5, 0.02, 6), Kit.mat(0xf0fafc, { emissive: 0x9ab4bc, emissiveIntensity: 0.6 }), 40);
    this.foam.frustumCulled = false;
    this.foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 40; i++) this.foamU.push(rng.next());
    this.root.add(this.foam);
  }

  private buildVegetation() {
    const rng = new Rng(2024);
    const f = this.flora;
    const CH = 60;
    const start = -40;
    const end = this.len + 70;
    for (let c0 = start; c0 < end; c0 += CH) {
      // Left and right halves are separate meshes so each can be frustum-culled.
      const gl = new THREE.Group();
      const gr = new THREE.Group();
      const sideGroup = (lat: number) => (lat < 0 ? gl : gr);
      const c1 = c0 + CH;
      const layer = (kind: Layer, step: number, lat: [number, number], make: (rng: Rng, d: number, lat: number) => THREE.Object3D | null) => {
        for (let d = c0 + rng.next() * step; d < c1; d += step * rng.range(0.7, 1.3)) {
          for (const side of [-1, 1]) {
            const l = side * rng.range(lat[0], lat[1]);
            const p = this.P(d, l);
            if (!this.allowed(d, l, kind, p)) continue;
            const o = make(rng, d, l);
            if (!o) continue;
            o.position.add(p);
            o.rotation.y += rng.next() * Math.PI * 2;
            o.userData.tint = rng.range(0.86, 1.12);
            sideGroup(l).add(o);
          }
        }
      };
      const meadow = (d: number) => d > D.MEADOW_FROM && d < D.MEADOW_TO;
      layer('patch', 5, [3.6, 24], (r) => f.patch(r));
      layer('verge', 2.7, [4.4, 8.5], (r, d) => {
        const x = r.next();
        if (meadow(d)) return x < 0.6 ? f.grass(r) : x < 0.8 ? f.fern(r, 0.8) : null;
        return x < 0.68 ? f.fern(r, r.range(0.85, 1.25)) : x < 0.82 ? f.grass(r) : f.bush(r, r.range(0.7, 1.1));
      });
      layer('near', 6.5, [6.5, 14], (r, d) => {
        const x = r.next();
        if (d > D.BOSS_START - 20) return null;
        return x < 0.45 ? f.palm(r) : x < 0.7 ? f.cycad(r) : f.bush(r, r.range(1.1, 1.6));
      });
      layer('mid', 10, [10, 24], (r) => {
        const x = r.next();
        return x < 0.55 ? f.bigTree(r) : x < 0.85 ? f.palm(r) : f.fern(r, 1.9);
      });
      layer('fill', 6, [8.5, 24], (r) => (r.chance(0.65) ? f.fern(r, r.range(1, 1.6)) : f.bush(r, r.range(1, 1.5))));
      layer('far', 6.5, [22, 48], (r) => (r.chance(0.85) ? f.canopy(r) : f.bigTree(r, false)));
      layer('rock', 14, [4.6, 16], (r) => f.rock(r, r.range(0.5, 1.4)));
      // Meadow extras: cycads, tall grass, lone trees and far treeline.
      if (c1 > D.MEADOW_FROM && c0 < D.MEADOW_TO) {
        for (let k = 0; k < 26; k++) {
          const d = rng.range(Math.max(c0, D.MEADOW_FROM), Math.min(c1, D.MEADOW_TO));
          const l = rng.spread(44);
          const p = this.P(d, l);
          if (Math.abs(l) < 5 || Math.abs(d - D.STAMPEDE_CROSS) < 10) continue;
          if (Math.hypot(d - D.CAR, l - D.CAR_SIDE) < 7) continue;
          const o = rng.chance(0.55) ? f.grass(rng) : rng.chance(0.6) ? f.cycad(rng) : f.rock(rng, rng.range(0.4, 1));
          o.position.add(p);
          o.scale.multiplyScalar(rng.range(1, 1.5));
          sideGroup(l).add(o);
        }
      }
      // Occasional park signposts.
      for (const sd of [14, 104, 286, 530]) {
        if (sd >= c0 && sd < c1) {
          const s = signpost(rng);
          const fr = this.F(sd);
          s.position.copy(fr.pos).addScaledVector(fr.right, 4.6);
          s.rotation.y = fr.heading + Math.PI / 2;
          gr.add(s);
        }
      }
      for (const g of [gl, gr]) {
        merged(g);
        this.root.add(g);
        for (const c of g.children) {
          const m = c as THREE.Mesh;
          if (!m.isMesh) continue;
          m.geometry.computeBoundingSphere();
          this.chunks.push(m);
        }
      }
    }
    // Dilo hiding bushes at the fallen tree, and the boulder for the bomb pickup in the meadow.
    const extra = new THREE.Group();
    for (const [d, l, s] of [
      [D.TREE - 2, -7.6, 1.7],
      [D.TREE - 1.5, 7.8, 1.6],
      [D.TREE - 6, -9.5, 1.4],
      [D.TREE - 5, 10.5, 1.5],
    ] as [number, number, number][]) {
      const b = f.bush(rng, s, true);
      b.position.copy(this.P(d, l));
      extra.add(b);
    }
    const rk = f.rock(rng, 1.4);
    rk.position.copy(this.P(D.TRIKE_HOLD + 12, -3.5));
    extra.add(rk);
    const rk2 = f.rock(rng, 1.5);
    rk2.position.copy(this.P(D.FORD_HOLD + 11, -3.5));
    extra.add(rk2);
    merged(extra);
    this.root.add(extra);
  }

  private place(obj: THREE.Object3D, d: number, lat: number, y = 0, yawOff = 0) {
    const f = this.F(d);
    obj.position.copy(f.pos).addScaledVector(f.right, lat);
    obj.position.y = y;
    obj.rotation.y = f.heading + yawOff;
    this.root.add(obj);
    return obj;
  }

  private buildGate() {
    this.gate = buildGate();
    this.place(this.gate.root, D.GATE, 0);
    // Visitor kiosk + flag poles before the gate.
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      for (const z of [4, 9]) {
        Kit.add(g, Kit.cyl(0.08, 0.1, 7, 6), Kit.mat(0x8a8a86), side * 6.5, 3.5, z);
        Kit.add(g, Kit.box(1.4, 0.9, 0.04), Kit.mat(side < 0 ? 0xd8401c : 0xf0c040), side * 6.5 + side * 0.72, 6.3, z);
      }
    }
    Kit.add(g, Kit.box(3.2, 2.6, 2.6), Kit.mat(0x8a6a44), -9, 1.3, 14);
    Kit.add(g, Kit.box(3.8, 0.3, 3.2), Kit.mat(0x3e5a2c), -9, 2.75, 14, 0, 0, 0.08);
    Kit.add(g, Kit.box(1.6, 0.9, 0.05), Kit.mat(0x2a2a26), -9, 1.6, 12.68);
    merged(g);
    this.place(g, D.GATE, 0);
  }

  private buildFence() {
    const s = new THREE.Group();
    const posts: THREE.Vector3[] = [];
    const yaws: number[] = [];
    for (let d = D.FENCE_FROM; d <= D.FENCE_TO; d += 5) {
      posts.push(this.P(d, D.FENCE_SIDE));
      yaws.push(this.F(d).heading);
    }
    const bi = Math.round((D.FENCE_BREAK - D.FENCE_FROM) / 5);
    const oldGap = Math.round((124 - D.FENCE_FROM) / 5);
    // Breakable section: posts bi, bi+1 and the spans touching them.
    const pivotP = posts[bi].clone().lerp(posts[bi + 1], 0.5);
    this.fenceBreak.position.copy(pivotP);
    this.fenceBreak.rotation.y = this.F(D.FENCE_BREAK).heading;
    this.root.add(this.fenceBreak);
    this.fenceBreak.updateMatrixWorld(true);
    const brk = new THREE.Group();
    posts.forEach((p, i) => {
      const target = i === bi || i === bi + 1 ? brk : s;
      const tilt = i === oldGap ? 0.35 : i === oldGap + 1 ? -0.25 : 0;
      fencePost(target, p, yaws[i], tilt);
      if (i % 3 === 1 && i !== bi && i !== bi + 1) {
        const f = this.F(D.FENCE_FROM + i * 5 + 0.4);
        const sp = f.pos.clone().addScaledVector(f.right, D.FENCE_SIDE + 0.3);
        warningSign(s, sp.x, 2.1, sp.z, f.heading + Math.PI / 2, i === oldGap + 3 ? 0.3 : 0);
      }
    });
    for (let i = 0; i < posts.length - 1; i++) {
      if (i === oldGap) {
        // Old damage: dangling wires in a gap.
        const a = posts[i];
        for (let k = 0; k < 3; k++) {
          const m = Kit.add(s, Kit.box(0.05, 2.4 - k * 0.5, 0.05), Kit.mat(0x9aa0a4), a.x, 3.6 - k * 0.9, a.z);
          m.rotation.set(0.5 + k * 0.2, yaws[i], 0.3);
        }
        this.oldBreakSpark.copy(a).setY(2.4);
        continue;
      }
      const target = i >= bi - 1 && i <= bi + 1 ? brk : s;
      fenceSpan(target, posts[i], posts[i + 1]);
    }
    const mid = Math.floor(bi);
    const f = this.F(D.FENCE_FROM + mid * 5 + 2.5);
    const sp = f.pos.clone().addScaledVector(f.right, D.FENCE_SIDE + 0.3);
    warningSign(brk, sp.x, 2.2, sp.z, f.heading + Math.PI / 2);
    // Re-parent the breakable bits under the pivot (keeps world transforms).
    this.root.add(brk);
    brk.updateMatrixWorld(true);
    for (const c of [...brk.children]) this.fenceBreak.attach(c);
    this.root.remove(brk);
    merged(this.fenceBreak);
    for (let k = 0; k < 5; k++) this.fenceSparks.push(posts[bi].clone().lerp(posts[bi + 1], k / 4).setY(0.9 + (k % 5) * 0.8));
    merged(s);
    this.root.add(s);
  }

  private buildTree() {
    const rng = new Rng(13);
    this.tree = buildFallenTree(this.flora, rng);
    this.place(this.tree.root, D.TREE, 0, 0, 0.12);
    // Ranger's abandoned supplies + a toppled signal pole by the trunk.
    const g = new THREE.Group();
    Kit.add(g, Kit.box(0.9, 0.6, 0.6), Kit.mat(0x5a6a3a), -3.2, 0.3, 1.6, 0, 0.3, 0);
    Kit.add(g, Kit.box(0.7, 0.5, 0.5), Kit.mat(0x6a5a3a), -2.6, 0.25, 2.4, 0, -0.2, 0);
    Kit.add(g, Kit.cyl(0.08, 0.08, 6, 6), Kit.mat(0x7a7a76), 4.5, 0.2, 2.4, 0, 0.6, Math.PI / 2 - 0.05);
    merged(g);
    this.place(g, D.TREE, 0);
  }

  private buildMeadow() {
    // Toppled tour vehicle on the right verge (lying on its side).
    const body = buildTourCar();
    body.rotation.z = Math.PI / 2 - 0.08;
    body.position.y = 1.0;
    this.car.add(body);
    this.place(this.car, D.CAR, D.CAR_SIDE, 0, 0.5);
    // A lone giant tree and a ranger watchtower out in the meadow.
    const g = new THREE.Group();
    const rng = new Rng(8);
    const t1 = this.flora.bigTree(rng);
    t1.scale.setScalar(1.3);
    t1.position.copy(this.P(D.MEADOW_FROM + 14, -24));
    g.add(t1);
    const t2 = this.flora.bigTree(rng);
    t2.position.copy(this.P(D.MEADOW_TO - 12, 30));
    g.add(t2);
    const tw = new THREE.Group();
    const wood = Kit.mat(0x7a5a38);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) Kit.add(tw, Kit.box(0.2, 7, 0.2), wood, x, 3.5, z);
    Kit.add(tw, Kit.box(2.6, 0.2, 2.6), wood, 0, 6.5, 0);
    Kit.add(tw, Kit.box(2.8, 0.15, 2.8), Kit.mat(0x4a3a26), 0, 8.6, 0);
    Kit.add(tw, Kit.cone(2.2, 1.2, 4), Kit.mat(0x6a4a2a), 0, 9.3, 0, 0, Math.PI / 4, 0);
    Kit.add(tw, Kit.box(2.6, 0.9, 0.08), wood, 0, 7.05, 1.3);
    tw.position.copy(this.P(D.STAMPEDE_WAIT - 6, 22));
    g.add(tw);
    merged(g);
    this.root.add(g);

    // Herd.
    const hadros: { from: THREE.Vector3; to: THREE.Vector3; delay: number; speed: number; scale: number }[] = [];
    const hr = new Rng(3);
    const rows = [-4, 0, 4, -1.5, 2.5, 6, -3, 1, 3.5];
    rows.forEach((row, i) => {
      const d = D.STAMPEDE_CROSS + row;
      hadros.push({
        from: this.P(d, -62 - hr.range(0, 8)),
        to: this.P(d + hr.spread(3), 66),
        delay: i * 0.38 + hr.range(0, 0.3),
        speed: hr.range(13, 16),
        scale: hr.range(0.85, 1.15),
      });
    });
    const giants = [
      { from: this.P(282, -50), to: this.P(372, -46), speed: 0.9 },
      { from: this.P(300, -60), to: this.P(380, -58), speed: 0.8 },
      { from: this.P(296, 54), to: this.P(370, 58), speed: 0.85 },
    ];
    this.herd = new Herd(hadros, giants);
    this.herd.giantsRange = [210, 395];
    this.root.add(this.herd.root);
  }

  private buildCliffs() {
    const g = new THREE.Group();
    const rng = new Rng(19);
    const rockCols = [0x8a8274, 0x77705f, 0x9a9282];
    for (let d = D.CLIFF_FROM; d < D.CLIFF_TO; d += 5) {
      for (let k = 0; k < 3; k++) {
        const lat = -rng.range(17, 30) - k * 8;
        const p = this.P(d + rng.spread(2), lat);
        if (this.distRiver(p.x, p.z) < RIVER_WIDTH / 2 + 2.5) continue;
        const h = rng.range(9, 15) + k * 4 + Math.max(0, 6 - Math.abs(d - 466) * 0.2);
        const s = rng.range(5, 8);
        Kit.add(g, this.flora.rockGeo(rng), Kit.mat(rng.pick(rockCols)), p.x, h * 0.45, p.z, 0, rng.next() * 6, 0, s, h * 0.55, s * 0.9);
        // Jungle on top + vines hanging down the face.
        Kit.add(g, this.flora.blob(rng), Kit.mat(rng.chance(0.5) ? COL.canopyA : COL.canopyDark), p.x, h * 0.98, p.z, 0, rng.next() * 6, 0, s * 0.9, 1.6, s * 0.8);
        if (rng.chance(0.6)) {
          const vl = rng.range(3, 7);
          Kit.add(g, Kit.box(0.5, vl, 0.2), Kit.mat(COL.vine), p.x + 2, h * 0.9 - vl / 2, p.z, 0, rng.next() * 6, 0);
        }
      }
    }
    // Cliff wall behind the waterfall.
    for (let k = 0; k < 6; k++) {
      const p = this.P(462 + k * 3.2, -40 - rng.range(0, 4));
      const h = rng.range(19, 24);
      Kit.add(g, this.flora.rockGeo(rng), Kit.mat(rng.pick(rockCols)), p.x, h * 0.45, p.z, 0, rng.next() * 6, 0, 5, h * 0.55, 4.5);
      Kit.add(g, this.flora.blob(rng), Kit.mat(COL.canopyA), p.x, h * 0.96, p.z, 0, 0, 0, 5, 1.8, 4.5);
    }
    merged(g);
    this.root.add(g);
  }

  private buildEnd() {
    const rng = new Rng(4);
    const b = buildBarricade(this.flora, rng);
    merged(b);
    this.place(b, D.END + 6, 0);
  }

  // ─── Set pieces (called from beats) ────────────────────────────────────────

  openGate(w: World) {
    if (this.gateT >= 0) return;
    this.gateT = 0;
    w.audio.play('door', { volume: 0.9, pitch: 0.6 });
    w.audio.play('engine_rev', { volume: 0.8 });
  }

  spawnDrums(w: World) {
    if (this.treeT >= 0 || this.drums.length) return;
    const onBlast = (ww: World) => this.blastTree(ww);
    const f = this.F(D.TREE - 1.55);
    const spots: [number, number][] = [
      [0.9, 0],
      [1.7, 0.3],
      [1.3, 0.95],
    ];
    for (const [lat, y] of spots) {
      const p = f.pos.clone().addScaledVector(f.right, lat);
      p.y = y;
      this.drums.push(w.add(fuelDrum(w, p, onBlast)));
    }
  }

  /** Detonate the drums (if still there) and blow the fallen tree off the road. */
  blastTree(w: World) {
    if (this.treeT >= 0) return;
    const live = this.drums.filter((d) => !d.removed);
    if (live.length) {
      live[0].destroy();
      return; // its onDestroy calls back here
    }
    this.treeT = 0;
    const p = this.P(D.TREE, 1, 1.2);
    w.fx.explosion(p, 1.6);
    w.fx.debris(p, 0x8a6a44);
    w.fx.debris(p.clone().setY(2), 0x5a4632);
    w.fx.dust(p, 2.5, 0x8a7a5a);
    w.audio.play('crash', { volume: 1 });
    w.audio.play('explosion', { volume: 0.8, pitch: 0.8 });
    w.rig.shake(0.6);
    w.hud.popup('PATH CLEAR!', w.viewport.width / 2, w.viewport.height * 0.35, 'combo');
  }

  flipCar(w: World) {
    if (this.carT >= 0) return;
    this.carT = 0;
    const f = this.F(D.CAR);
    this.carVel.copy(f.right).multiplyScalar(6.5).addScaledVector(f.forward, 2.5);
    this.carVel.y = 6.5;
    this.carSpin = 5.5;
    this.car.getWorldPosition(_v);
    _v.y = 1;
    w.fx.dust(_v, 2, 0x9a8a68);
    w.fx.sparks(_v, null, 16);
    w.audio.play('crash', { volume: 1 });
    w.audio.play('glass', { volume: 0.8 });
    w.rig.shake(0.5);
  }

  startStampede(w: World) {
    this.herd.start(w.time);
    if (!this.stampedeTriggered) {
      this.stampedeTriggered = true;
      w.hud.prompt('STAMPEDE!');
      w.audio.play('dino_roar', { volume: 0.7, pitch: 1.6 });
    }
  }

  /** Fuel drums along the river road the player can shoot as the boss runs past. */
  spawnBossDrums(w: World) {
    for (const [d, lat] of [
      [560, -4.4],
      [598, 4.2],
      [636, -4.6],
    ] as [number, number][]) {
      w.add(fuelDrum(w, this.P(d, lat)));
    }
  }

  // ─── Per-frame ─────────────────────────────────────────────────────────────

  private update(dt: number, w: World) {
    this.time += dt;
    const t = this.time;
    const d = w.rig.d;
    this.backdrop.position.set(w.camera.position.x, 0, w.camera.position.z);
    // Chunks fully inside the fog can't be seen: skip them.
    const cam = w.camera.position;
    for (let i = 0; i < this.chunks.length; i++) {
      const m = this.chunks[i];
      const bs = m.geometry.boundingSphere!;
      const dx = bs.center.x - cam.x;
      const dz = bs.center.z - cam.z;
      m.visible = Math.sqrt(dx * dx + dz * dz) - bs.radius < FOG_FAR;
    }

    // Torches.
    const fl = this.gate.flames;
    for (let i = 0; i < fl.length; i++) {
      const k = 1 + Math.sin(t * 13 + i * 1.7) * 0.18 + Math.sin(t * 23 + i) * 0.1;
      fl[i].scale.set(1 + Math.sin(t * 17 + i) * 0.08, k, 1 + Math.cos(t * 19 + i) * 0.08);
    }
    // Gate doors (also snap open if the run starts past them).
    if (this.gateT < 0 && d > D.GATE - 12) this.gateT = 5;
    if (this.gateT >= 0) {
      this.gateT += dt;
      const k = easeInOutSine(clamp(this.gateT / 2.6, 0, 1));
      this.gate.doorL.rotation.y = k * 1.75;
      this.gate.doorR.rotation.y = -k * 1.75;
    }

    // Electric fence: raptors smash through it.
    if (this.fenceT < 0 && d >= D.FENCE_BREAK - 12 && d < D.FENCE_TO) {
      this.fenceT = 0;
      for (const p of this.fenceSparks) w.fx.sparks(p, null, 10);
      w.audio.play('crash', { volume: 0.9 });
      w.audio.play('thunder', { volume: 0.5, pitch: 2.2 });
      w.rig.shake(0.3);
    }
    if (this.fenceT >= 0 && this.fenceT < 3) {
      this.fenceT += dt;
      const k = clamp(this.fenceT / 0.55, 0, 1);
      const bounce = k >= 1 ? Math.sin(Math.min(1, (this.fenceT - 0.55) / 0.3) * Math.PI) * 0.06 : 0;
      this.fenceBreak.rotation.z = -(k * k) * 1.38 + bounce;
    }
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = w.rng.range(0.25, 0.8);
      if (Math.abs(d - 124) < 50) {
        w.fx.sparks(this.oldBreakSpark, null, 6);
        if (Math.abs(d - 124) < 25) w.audio.play('hit_armor', { volume: 0.25, pitch: 1.8 });
      }
      if (this.fenceT > 0 && Math.abs(d - D.FENCE_BREAK) < 50) {
        const p = this.fenceSparks[Math.floor(w.rng.next() * this.fenceSparks.length)];
        _v.copy(p);
        _v.y = 0.3;
        w.fx.sparks(_v, null, 7);
      }
    }

    // Fallen tree halves fly apart.
    if (this.treeT < 0 && d > D.TREE - 6) this.treeT = 5;
    if (this.treeT >= 0 && this.treeT < 3) {
      this.treeT += dt;
      const k = clamp(this.treeT / 1.1, 0, 1);
      const arc = Math.sin(k * Math.PI);
      const L = this.tree.left;
      const R = this.tree.right;
      L.position.set(1.0 - 6.5 * k, arc * 2.6, -2.4 * k);
      L.rotation.set(-0.3 * k, 0.5 * k, 0.55 * k);
      R.position.set(1.0 + 6 * k, arc * 3.2, -3 * k);
      R.rotation.set(0.2 * k, -0.7 * k, -0.6 * k);
    }

    // Toppled car flung by the trike.
    if (this.carT < 0 && d > D.CAR - 12) this.carT = 99;
    if (this.carT >= 0 && this.carT < 4) {
      this.carT += dt;
      const p = this.car.position;
      this.carVel.y -= 20 * dt;
      p.addScaledVector(this.carVel, dt);
      this.car.rotation.x += this.carSpin * dt * 0.2;
      this.car.children[0].rotation.z += this.carSpin * dt;
      if (p.y < 0 && this.carVel.y < 0) {
        p.y = 0;
        if (!this.carBounced) {
          this.carBounced = true;
          this.carVel.multiplyScalar(0.35);
          this.carVel.y = 3;
          this.carSpin *= 0.4;
          w.audio.play('crash', { volume: 0.8 });
          this.car.getWorldPosition(_v);
          w.fx.dust(_v, 2.2, 0x9a8a68);
          w.rig.shake(0.3);
        } else {
          this.carVel.set(0, 0, 0);
          this.carSpin = 0;
          this.carT = 99;
        }
      }
    }

    // Stampede trigger (as the jeep rolls up to the meadow).
    if (!this.stampedeTriggered && d >= D.STAMPEDE_WAIT - 26 && d < D.STAMPEDE_CROSS) this.startStampede(w);
    this.herd.update(dt, w);

    // Waterfall streaks + mist + river foam (only when nearby).
    const nearWater = d > 380 && d < this.len;
    this.streaks.visible = nearWater && d < 520;
    this.foam.visible = nearWater;
    if (this.streaks.visible) {
      for (let i = 0; i < this.streakPhase.length; i++) {
        const ph = (this.streakPhase[i] + t * 0.55) % 1;
        const x = ((i * 0.37) % 1) * 5.6 - 2.8;
        _v.copy(this.fallTop).addScaledVector(this.fallRight, x).addScaledVector(this.fallNormal, 0.75 + ph * 0.6);
        _v.y = 19 - ph * 19;
        _e.set(-0.08, Math.atan2(this.fallNormal.x, this.fallNormal.z), 0);
        _q.setFromEuler(_e);
        _s.set(1, 0.6 + ph * 0.8, 1);
        _m.compose(_v, _q, _s);
        this.streaks.setMatrixAt(i, _m);
      }
      this.streaks.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < this.mist.length; i++) {
        const s = 1 + Math.sin(t * 1.3 + i * 2) * 0.12;
        this.mist[i].scale.set(3.4 * s, 1.8 * s, 3 * s);
      }
    }
    if (this.foam.visible) {
      const rl = 1 / this.riverCurve.getLength();
      for (let i = 0; i < this.foamU.length; i++) {
        let u = this.foamU[i] + dt * 1.6 * rl;
        if (u > 1) u -= 1;
        this.foamU[i] = u;
        this.riverCurve.getPointAt(u, _v);
        this.riverCurve.getTangentAt(u, _w);
        const off = (((i * 0.618) % 1) - 0.5) * (RIVER_WIDTH - 2);
        _v.x += -_w.z * off;
        _v.z += _w.x * off;
        _v.y = 0.09;
        _q.identity();
        _s.set(0.5 + (i % 3) * 0.3, 1, 0.3 + (i % 2) * 0.2);
        _m.compose(_v, _q, _s);
        this.foam.setMatrixAt(i, _m);
      }
      this.foam.instanceMatrix.needsUpdate = true;
    }
    // Splashing through the ford.
    const inFord = Math.abs(d - D.FORD) < 7.5;
    this.environment.surface = inFord ? 'water' : 'dirt';
    if (inFord && w.rig.speed > 0.6) {
      this.splashT -= dt;
      if (this.splashT <= 0) {
        this.splashT = 0.06;
        const f = w.rig.space;
        const h = f.rotation.y;
        for (const side of [-1, 1]) {
          _v.set(Math.cos(h) * side * 1.0 - Math.sin(h) * 2.4, 0.1, -Math.sin(h) * side * 1.0 - Math.cos(h) * 2.4).add(f.position);
          w.fx.dust(_v, 0.55, 0xdff3ff);
        }
      }
    }

    // Volcano smoke.
    for (let i = 0; i < 7; i++) {
      const ph = (t * 0.035 + i / 7) % 1;
      _v.copy(this.smokeBase);
      _v.y += ph * 70;
      _v.x += ph * 28 + Math.sin(i * 2.1) * 4;
      _v.z += Math.cos(i * 1.3) * 4;
      const s = (5 + ph * 17) * Math.min(1, (1 - ph) * 3);
      _q.identity();
      _s.set(s, s * 0.7, s);
      _m.compose(_v, _q, _s);
      this.smoke.setMatrixAt(i, _m);
    }
    this.smoke.instanceMatrix.needsUpdate = true;
  }
}
