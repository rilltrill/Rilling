import * as THREE from 'three';
import type { Environment } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { Destructible } from '../../../gameplay/Props';
import { EnvKit } from '../../kit/EnvKit';
import { Kit } from '../../kit/ModelKit';
import { clamp, smoothstep } from '../../../core/math';
import { Rng } from '../../../core/Rng';
import { M, bake } from './bake';
import { D } from './layout';
import { PAL, S, car, tankerTank } from './props';
import { DuskSky, SKY } from './sky';
import { FireField, type FireEmitter } from './vfx';
import {
  BRIDGE,
  CHUNK,
  TUNNEL,
  buildBarricade,
  buildBay,
  buildBillboards,
  buildBridge,
  buildFurniture,
  buildOutskirts,
  buildOverpass,
  buildPileup,
  buildRoad,
  buildStartApron,
  buildTankerSite,
  buildTunnel,
  chunksOf,
  makeCtx,
  scatterCars,
  scatterVerge,
  type Ctx,
} from './scenery';

/**
 * HIGHWAY TO HELL environment: a dusk interstate out of a burning city —
 * outskirts, a multi-car pile-up, an overpass, billboard alley, an overturned
 * tanker, a tunnel through the ridge and a long suspension bridge over the bay.
 *
 * Static scenery is baked per 50 m chunk and distance-culled. Set pieces are
 * triggered by the truck's rail position, so they work with any beat order
 * (and with ?beat= debugging).
 */

const POLICE_RED = new THREE.Color(0xff1a10);
const POLICE_BLUE = new THREE.Color(0x2a50ff);
const FOG_NEAR = 28;
const FOG_FAR = 185;
const CULL = FOG_FAR + 15;
const HEMI = 1.75;
const SUN = 1.55;

interface Tween {
  t: number;
  dur: number;
  fn(k: number, dt: number): void;
  end?(): void;
}

interface ChunkInfo {
  group: THREE.Group;
  centre: THREE.Vector3;
  radius: number;
}

/** Runtime handles the stage script, the truck and the boss talk to. */
export class Z3Scene {
  t = 0;
  readonly fires: FireField;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly fireLight: THREE.PointLight;
  readonly accent: THREE.PointLight;
  /** Red emergency beacon on the truck (boss fight) — 0..1. */
  beacon = 0;
  /** Tunnel power: 1 normal, 0 dark (stall). */
  power = 1;
  stalled = false;
  readonly tweens: Tween[] = [];
  tunnelLights: THREE.Object3D | null = null;
  fixtures: THREE.Vector3[] = [];
  police = new THREE.Vector3();
  chunks: ChunkInfo[] = [];
  // Set pieces.
  blocker: THREE.Group | null = null;
  rammed = false;
  overpassCar: THREE.Group | null = null;
  overpassFell = false;
  overpassBurnt: THREE.Group | null = null;
  overpassFire: FireEmitter | null = null;
  tankModel: THREE.Group | null = null;
  tank: Destructible | null = null;
  tankBlown = false;
  tankHalves: THREE.Group[] = [];
  tankFires: FireEmitter[] = [];
  gate: THREE.Group[] = [];
  beams: THREE.Object3D[] = [];
  gateBroken = false;
  private flickerT = 0;
  private stallSeq = 0;

  constructor(
    readonly world: World,
    readonly root: THREE.Group,
    readonly ctx: Ctx,
  ) {
    this.fires = ctx.fires;
    const { hemi, sun } = EnvKit.lights(root, {
      sky: 0xffb48a,
      ground: 0x4a3a58,
      hemi: HEMI,
      sun: 0xffc48a,
      sunIntensity: SUN,
      sunDir: [0.72, 0.55, -0.42],
    });
    this.hemi = hemi;
    this.sun = sun;
    this.fireLight = new THREE.PointLight(0xff7a2a, 0, 26, 1.4);
    this.accent = new THREE.PointLight(0xff2020, 0, 20, 1.4);
    root.add(this.fireLight, this.accent);
  }

  tween(dur: number, fn: (k: number, dt: number) => void, end?: () => void) {
    this.tweens.push({ t: 0, dur, fn, end });
  }

  // ─── Set pieces ──────────────────────────────────────────────────────────

  /** Truck shoves the pile-up car out of the middle lane. */
  ram() {
    const b = this.blocker;
    if (!b || this.rammed) return;
    this.rammed = true;
    const w = this.world;
    w.audio.play('crash', { volume: 1 });
    w.audio.play('metal_clang', { volume: 0.7, pitch: 0.8 });
    w.rig.shake(0.55);
    w.haptic(90);
    const p0 = b.position.clone();
    const r0 = b.rotation.y;
    const f = this.ctx.frame(D.PILEUP);
    const p1 = p0.clone().addScaledVector(f.right, -7).addScaledVector(f.forward, 6);
    w.fx.sparks(p0.clone().setY(0.6), null, 14);
    w.fx.debris(p0.clone().setY(0.8), 0x7a1c1c);
    this.tween(
      1.0,
      (k) => {
        const e = 1 - (1 - k) * (1 - k);
        b.position.lerpVectors(p0, p1, e);
        b.position.y = Math.sin(k * Math.PI) * 1.1;
        b.rotation.y = r0 + e * 2.6;
        b.rotation.z = Math.sin(k * Math.PI) * 0.5;
      },
      () => {
        b.rotation.z = 0;
        w.fx.dust(b.position.clone(), 1.2);
        w.audio.play('crash', { volume: 0.5, pitch: 0.9 });
      },
    );
  }

  /** A car smashes through the overpass parapet and explodes on the road ahead. */
  dropOverpassCar() {
    const c = this.overpassCar;
    if (!c || this.overpassFell) return;
    this.overpassFell = true;
    const w = this.world;
    const f = this.ctx.frame(D.OVERPASS);
    const p0 = c.position.clone();
    const p1 = p0.clone().addScaledVector(f.forward, -5.5);
    const land = this.ctx.at(D.OVERPASS - 13, -4.2, 0);
    const yaw = c.rotation.y;
    w.audio.play('crash', { volume: 0.9 });
    w.fx.debris(p0.clone().addScaledVector(f.forward, -4).setY(7.8), PAL.concrete);
    w.fx.dust(p0.clone().addScaledVector(f.forward, -5).setY(7.5), 1.2, 0x9a948c);
    this.tween(
      1.25,
      (k) => {
        if (k < 0.32) {
          const u = k / 0.32;
          c.position.lerpVectors(p0, p1, u);
          c.rotation.x = u * 0.35;
        } else {
          const u = (k - 0.32) / 0.68;
          c.position.lerpVectors(p1, land, u);
          c.position.y = p1.y + (land.y - p1.y) * u * u + 0.9 * Math.sin(u * Math.PI) * (1 - u);
          c.rotation.x = 0.35 + u * 1.9;
          c.rotation.y = yaw + u * 0.6;
        }
      },
      () => {
        c.visible = false;
        if (this.overpassBurnt) this.overpassBurnt.visible = true;
        if (this.overpassFire) this.overpassFire.on = true;
        w.explode(land.clone().setY(1), 7, 12);
        w.fx.explosion(land.clone().setY(1.6), 1.3);
      },
    );
  }

  /** Spawn the shootable tanker (call at the tanker hold's start). */
  armTanker(): Destructible | null {
    const m = this.tankModel;
    if (!m || this.tank || this.tankBlown) return this.tank;
    const w = this.world;
    const pos = m.position.clone();
    const rotY = m.rotation.y;
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.y = rotY;
    holder.add(m);
    this.tank = new Destructible(w, {
      model: holder,
      pos,
      frame: 'world',
      hp: 9,
      points: 1500,
      explode: { radius: 13, damage: 40 },
      onDestroy: () => this.blowTanker(pos),
    });
    w.add(this.tank);
    return this.tank;
  }

  /** Force the tanker to blow (if the player didn't). */
  detonateTanker() {
    if (this.tank && !this.tank.removed) this.tank.destroy();
    else if (!this.tankBlown && this.tankModel) {
      this.tankModel.visible = false;
      this.blowTanker(this.tankModel.position.clone());
    }
  }

  private blowTanker(pos: THREE.Vector3) {
    if (this.tankBlown) return;
    this.tankBlown = true;
    const w = this.world;
    w.hud.prompt(null);
    w.fx.explosion(pos.clone().setY(2.5), 2.0);
    w.rig.shake(0.9);
    w.hud.flash('#ffb060', 0.35);
    w.haptic(200);
    w.later(0.25, () => {
      w.fx.explosion(this.ctx.at(D.TANKER + 3, 6.5, 2), 1.4);
      w.audio.play('explosion', { volume: 0.8, pitch: 0.7 });
    });
    w.later(0.5, () => w.fx.explosion(pos.clone().setY(4), 1.6));
    for (const f of this.tankFires) f.on = true;
    const f = this.ctx.frame(D.TANKER);
    this.tankHalves.forEach((h, i) => {
      h.visible = true;
      const p0 = h.position.clone();
      const p1 = p0.clone().addScaledVector(f.right, i === 0 ? -6 : 4.5).addScaledVector(f.forward, 3);
      const r0 = h.rotation.y;
      this.tween(1.1, (k) => {
        const e = 1 - (1 - k) * (1 - k);
        h.position.lerpVectors(p0, p1, e);
        h.position.y = Math.sin(k * Math.PI) * 3.2;
        h.rotation.y = r0 + (i === 0 ? 0.9 : -0.7) * e;
        h.rotation.x = (i === 0 ? 1 : -1) * e * 0.4;
      });
    });
  }

  /** The truck's engine dies inside the tunnel: power flickers out. */
  stall() {
    this.stalled = true;
    this.stallSeq = 0;
    this.flickerT = 0;
    this.world.audio.play('alarm', { volume: 0.35, pitch: 0.7 });
  }

  restart() {
    this.stalled = false;
    this.power = 1;
    if (this.tunnelLights) this.tunnelLights.visible = true;
    this.world.audio.play('engine_rev', { volume: 0.9 });
  }

  breakGate() {
    if (this.gateBroken) return;
    this.gateBroken = true;
    const w = this.world;
    w.audio.play('metal_clang', { volume: 1 });
    w.audio.play('crash', { volume: 0.8 });
    w.rig.shake(0.45);
    w.haptic(80);
    const f = this.ctx.frame(D.BARRICADE);
    this.gate.forEach((g, i) => {
      const s = i === 0 ? -1 : 1;
      const p0 = g.position.clone();
      const p1 = p0.clone().addScaledVector(f.right, s * 6).addScaledVector(f.forward, 9);
      const r0 = g.rotation.clone();
      w.fx.sparks(p0.clone().setY(1.2), null, 10);
      this.tween(1.1, (k) => {
        const e = 1 - (1 - k) * (1 - k);
        g.position.lerpVectors(p0, p1, e);
        g.position.y = Math.sin(k * Math.PI) * 2.2 * (1 - k * 0.6);
        g.rotation.set(r0.x - e * 1.4, r0.y + s * e * 2.2, r0.z + s * e * 0.8);
      });
    });
  }

  // ─── Per-frame ───────────────────────────────────────────────────────────

  update(dt: number) {
    const w = this.world;
    this.t += dt;
    const t = this.t;
    const cam = w.camera.position;
    const d = w.rig.d;

    // Chunk culling (fog hides everything past CULL anyway).
    for (const c of this.chunks) {
      const vis = c.centre.distanceTo(cam) - c.radius < CULL;
      if (c.group.visible !== vis) c.group.visible = vis;
    }
    this.fires.update(t, cam);

    // Set-piece triggers.
    if (!this.rammed && d >= D.PILEUP - 4.2) this.ram();
    if (!this.overpassFell && d >= D.OVERPASS - 36 && d < D.OVERPASS) this.dropOverpassCar();
    if (!this.gateBroken && d >= D.BARRICADE - 3.6) this.breakGate();
    if (!this.tankBlown && d > D.TANKER - 7) this.detonateTanker();
    // Checkpoint searchlights sweeping the dusk sky.
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      b.rotation.z = Math.sin(t * 0.45 + i * 2.1) * 0.38 + (i === 0 ? -0.2 : 0.2);
      b.rotation.x = Math.sin(t * 0.31 + i) * 0.18;
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = clamp(tw.t / tw.dur, 0, 1);
      tw.fn(k, dt);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.end?.();
      }
    }

    // Tunnel darkness.
    const inside = smoothstep(D.TUNNEL_FROM - 4, D.TUNNEL_FROM + 12, d) * (1 - smoothstep(D.TUNNEL_TO - 14, D.TUNNEL_TO + 2, d));
    const rf = w.settings.reduceFlashes;
    if (this.stalled && rf) {
      // REDUCE FLASHING: the power just dies (no stutter).
      this.power = 0;
    } else if (this.stalled) {
      this.flickerT -= dt;
      if (this.flickerT <= 0) {
        this.stallSeq++;
        const off = this.stallSeq < 8 ? this.stallSeq % 2 === 1 : w.rng.chance(0.82);
        this.power = off ? 0 : 1;
        this.flickerT = this.stallSeq < 8 ? 0.08 + w.rng.next() * 0.12 : w.rng.range(0.15, 1.4) * (off ? 1.4 : 0.25);
        if (!off && this.stallSeq > 8) w.audio.play('hit_world', { volume: 0.15, pitch: 2 });
      }
    }
    if (this.tunnelLights) this.tunnelLights.visible = this.power > 0.5;
    const dark = inside * (this.power > 0.5 ? 1 : 1.25);
    this.hemi.intensity = HEMI * (1 - 0.62 * Math.min(1, dark));
    this.sun.intensity = SUN * (1 - 0.92 * Math.min(1, dark));

    // Fire light: nearest burning thing, flickering.
    const near = this.fires.nearest();
    if (near && near.dist < 45 * 45) {
      this.fireLight.position.copy(near.pos);
      this.fireLight.position.y += 1.6 * near.size;
      const fl = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7.3 + 1);
      this.fireLight.intensity = 26 * Math.min(1.6, near.size) * fl;
    } else this.fireLight.intensity = 0;

    // Accent light: police strobes / tunnel sodium strobe / stall headlight / boss beacon.
    const a = this.accent;
    if (this.beacon > 0) {
      const rig = w.rig;
      rig.space.updateMatrixWorld();
      a.position.set(0, 4.5, 7);
      rig.space.localToWorld(a.position);
      const spin = Math.max(0, Math.sin(t * 9));
      a.color.setHex(0xff3018);
      a.distance = 40;
      a.intensity = this.beacon * (rf ? 60 + 15 * spin : 40 + 70 * spin * spin);
    } else if (inside > 0.05) {
      if (this.stalled) {
        // Truck headlights sputtering in the dark.
        w.rig.space.updateMatrixWorld();
        a.position.set(0, 2.2, -7);
        w.rig.space.localToWorld(a.position);
        a.color.setHex(0xfff0c8);
        a.distance = 24;
        a.intensity = this.power > 0.5 ? 24 : rf ? 9 : 9 + 5 * Math.sin(t * 31);
      } else {
        // Snap to the nearest fixture ahead; flare as each one passes overhead.
        let best = -1;
        let bd = Infinity;
        for (let i = 0; i < this.fixtures.length; i++) {
          const dd = this.fixtures[i].distanceToSquared(cam);
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        }
        if (best >= 0) {
          a.position.copy(this.fixtures[best]);
          a.color.setHex(0xffa040);
          a.distance = 16;
          const k = Math.exp(-bd / 30);
          a.intensity = (12 + 34 * k) * inside;
        }
      }
    } else if (d > D.PILEUP - 70 && d < D.PILEUP + 40) {
      a.position.copy(this.police);
      a.distance = 18;
      if (rf) {
        a.color.copy(POLICE_RED).lerp(POLICE_BLUE, 0.5 + 0.5 * Math.sin(t * 1.6));
        a.intensity = 18;
      } else {
        const red = Math.floor(t * 5) % 2 === 0;
        a.color.setHex(red ? 0xff1a10 : 0x2a50ff);
        a.intensity = 22 * (0.6 + 0.4 * Math.abs(Math.sin(t * 15.7)));
      }
    } else a.intensity = 0;
  }
}

const SCENES = new WeakMap<World, Z3Scene>();
export function z3Scene(world: World): Z3Scene | undefined {
  return SCENES.get(world);
}

/** Build the whole environment. */
export function buildHighway(world: World, curve: THREE.CatmullRomCurve3): Environment {
  const root = new THREE.Group();
  root.name = 'z3-env';
  const scene = world.scene;
  scene.background = new THREE.Color(SKY.fog);
  scene.fog = new THREE.Fog(SKY.fog, FOG_NEAR, FOG_FAR);

  const fires = new FireField(14, 130);
  root.add(fires.group);
  const ctx = makeCtx(curve, fires, root);
  const z = new Z3Scene(world, root, ctx);
  SCENES.set(world, z);
  const sky = new DuskSky();
  root.add(sky.group);

  // ─── Ground ───────────────────────────────────────────────────────────────
  // Dry dusk scrub either side of the interstate.
  const scrub = M.lam(0x56493a, 'dirt', 0.45, 1);
  const land = EnvKit.ribbon(curve, 520, scrub, { from: 0, to: D.BRIDGE_FROM + 6, step: 12, y: -0.05 });
  root.add(land);
  const behind = EnvKit.ground(560, 0x56493a, 0, 280, -0.06);
  behind.material = scrub;
  root.add(behind);

  // ─── Roads + furniture ────────────────────────────────────────────────────
  const len = curve.getLength();
  buildRoad(ctx, 0, len);
  buildStartApron(ctx, root);
  buildFurniture(ctx, 0, D.TUNNEL_FROM - 2);
  buildFurniture(ctx, D.TUNNEL_TO + 2, D.BRIDGE_FROM, { poles: true });
  buildFurniture(ctx, D.BRIDGE_FROM, D.BRIDGE_TO, { rails: false, poles: false });
  buildFurniture(ctx, D.BRIDGE_TO, len, { poles: false });

  // ─── Sections ─────────────────────────────────────────────────────────────
  buildOutskirts(ctx);
  scatterCars(ctx, 12, D.PILEUP - 18, 1.0, 0.25);
  buildPileup(ctx);
  scatterCars(ctx, D.PILEUP + 20, D.OVERPASS - 30, 0.8, 0.3);
  buildOverpass(ctx);
  scatterCars(ctx, D.OVERPASS + 14, D.TANKER - 22, 0.9, 0.4);
  buildBillboards(ctx);
  buildTankerSite(ctx);
  scatterCars(ctx, D.TANKER + 16, D.TUNNEL_FROM - 6, 0.7, 0.3);
  scatterVerge(ctx, 0, D.TUNNEL_FROM - 10);
  scatterVerge(ctx, D.TUNNEL_TO + 8, D.BRIDGE_FROM - 4);
  const tunnel = buildTunnel(ctx);
  scatterCars(ctx, D.TUNNEL_FROM + 8, D.STALL - 16, 0.5, 0.15);
  scatterCars(ctx, D.STALL + 22, D.TUNNEL_TO - 6, 0.5, 0.15);
  scatterCars(ctx, D.TUNNEL_TO + 6, D.BARRICADE - 16, 0.6, 0.3);
  buildBridge(ctx);
  buildBarricade(ctx);
  scatterCars(ctx, D.BARRICADE + 22, D.BRIDGE_TO - 10, 0.35, 0.4);
  buildBay(ctx, root);

  // ─── Dynamic set-piece objects (kept out of the bake) ────────────────────
  const rng = new Rng(4404);
  {
    const b = car(rng, { color: 0x7a1c1c, lights: true, doorOpen: true });
    bake(b);
    const g = new THREE.Group();
    g.add(b);
    ctx.put(g, D.PILEUP, 0.4, 0, Math.PI / 2 + 0.35, root);
    z.blocker = g;
    z.police = ctx.at(D.PILEUP - 9, -3.9, 1.9);
  }
  {
    const c = car(rng, { color: 0xb06a20, lights: true });
    bake(c);
    const g = new THREE.Group();
    g.add(c);
    // On the overpass deck, nose pointing at the parapet facing us.
    ctx.put(g, D.OVERPASS + 2.5, -3.9, 7.3, 0, root);
    z.overpassCar = g;
    const burnt = car(rng, { burnt: true });
    bake(burnt);
    burnt.rotation.z = Math.PI;
    burnt.position.y = 1.6;
    const bg = new THREE.Group();
    bg.add(burnt);
    ctx.put(bg, D.OVERPASS - 13, -4.2, 0, 0.6, root);
    bg.visible = false;
    z.overpassBurnt = bg;
    z.overpassFire = fires.add(ctx.at(D.OVERPASS - 13, -4.2, 0.8), 1.4, 1, false);
  }
  {
    const tank = tankerTank();
    bake(tank);
    ctx.put(tank, D.TANKER, -3.2, 0, 0.12, root);
    z.tankModel = tank;
    // Burnt halves (hidden until the blast).
    for (const s of [-1, 1]) {
      const h = new THREE.Group();
      Kit.add(h, Kit.cyl(1.35, 1.35, 5.2, 10, ), S.burnt(PAL.burnt), 0, 1.35, 0, 0, 0, Math.PI / 2);
      Kit.add(h, Kit.cyl(1.2, 1.4, 0.4, 10), S.burnt(0x8a3a1a), s * -2.7, 1.35, 0, 0, 0, Math.PI / 2);
      bake(h);
      ctx.put(h, D.TANKER, -3.2 + s * 2.8, 0, 0.12, root);
      h.visible = false;
      z.tankHalves.push(h);
    }
    for (const [x, sz] of [
      [-3.2, 2.6],
      [-8, 1.8],
      [2.5, 1.6],
    ] as const) {
      z.tankFires.push(fires.add(ctx.at(D.TANKER + 1, x, 0.4), sz, 1, false));
    }
  }
  {
    // Chain-link gate panels.
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const steel = S.steel(PAL.metal);
      Kit.add(g, Kit.box(2.5, 0.08, 0.08), steel, s * 1.25, 2.3, 0);
      Kit.add(g, Kit.box(2.5, 0.08, 0.08), steel, s * 1.25, 0.15, 0);
      Kit.add(g, Kit.box(0.08, 2.2, 0.08), steel, s * 2.45, 1.2, 0);
      Kit.add(g, Kit.box(0.08, 2.2, 0.08), steel, s * 0.05, 1.2, 0);
      Kit.add(g, Kit.box(2.4, 2.1, 0.03), Kit.mat(0x9a9ea4, { tex: 'grate', transparent: true, opacity: 0.85 }), s * 1.25, 1.22, 0);
      // Yellow warning plate (painted steel, readable).
      Kit.add(g, Kit.box(1.0, 0.5, 0.04), S.plate(0xe0b820), s * 1.25, 1.5, 0.05);
      Kit.add(g, Kit.box(0.7, 0.08, 0.05), S.clean(0x1a1a1a), s * 1.25, 1.5, 0.07);
      // Panels swing as a whole: bake each one (steel + plate = 1 draw, grate = 1).
      bake(g);
      ctx.put(g, D.BARRICADE, 0, 0, 0, root);
      z.gate.push(g);
    }
  }

  {
    // Searchlight beams over the SAFE ZONE (seen down the length of the bridge).
    const beamMat = Kit.track(
      new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    for (const x of [-16, 17]) {
      const pivot = new THREE.Group();
      ctx.put(pivot, D.END - 6, x, 10.5, 0, root);
      const cone = Kit.mesh(Kit.cyl(0.4, 4.5, 90, 10, ), beamMat);
      cone.position.y = 45;
      cone.renderOrder = 3;
      cone.frustumCulled = false;
      pivot.add(cone);
      z.beams.push(pivot);
    }
  }

  // ─── Bake chunks + landmarks ──────────────────────────────────────────────
  const lights = tunnel.lights;
  bake(lights);
  root.add(lights);
  z.tunnelLights = lights;
  z.fixtures = tunnel.fixtures;
  const all: THREE.Group[] = [...chunksOf(ctx).values(), ...ctx.landmarks];
  for (const g of all) {
    bake(g);
    root.add(g);
    const box = new THREE.Box3().setFromObject(g);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    z.chunks.push({ group: g, centre: sphere.center, radius: sphere.radius });
  }
  void CHUNK;
  scene.add(root);

  const zFrom = ctx.at(D.BRIDGE_FROM, 0).z;
  const zTo = ctx.at(D.BRIDGE_TO, 0).z;

  return {
    root,
    occluders: ctx.occluders,
    surface: 'concrete',
    groundAt(x: number, zz: number) {
      if (zz < zFrom && zz > zTo && (x < BRIDGE.L - 0.5 || x > BRIDGE.R + 0.5)) return BRIDGE.WATER;
      return 0;
    },
    update(dt: number, w: World) {
      sky.update(z.t + dt, w.camera.position);
      z.update(dt);
    },
    dispose() {
      SCENES.delete(world);
    },
  };
}

export { TUNNEL };
