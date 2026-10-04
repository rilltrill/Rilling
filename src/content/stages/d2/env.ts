import * as THREE from 'three';
import type { Environment } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { Kit } from '../../kit/ModelKit';
import { EnvKit } from '../../kit/EnvKit';
import { Rng } from '../../../core/Rng';
import { clamp, damp, lerp } from '../../../core/math';
import type { AnimMats, Animator, Ctx } from './ctx';
import { ROOMS, TUNNEL, ceilingAt, dAtZ } from './layout';
import { buildLobby, buildShop } from './lobby';
import { buildGreenhouse, buildHatchery } from './green';
import { buildKitchen, buildServers } from './kitchen';
import { buildPump, buildTunnel } from './tunnels';
import { buildHall, buildWing } from './containment';
import type { BurstDoor, GlassWall, SkeletonDisplay } from './setpieces';
import type { Enemy } from '../../../gameplay/Enemy';

interface Zone {
  id: string;
  from: number;
  to: number;
  root: THREE.Group;
  shell: THREE.Object3D[];
}

interface Ambience {
  d: number;
  sky: number;
  ground: number;
  hemi: number;
  fog: number;
  near: number;
  far: number;
}

interface Accent {
  from: number;
  to: number;
  pos: THREE.Vector3 | 'follow';
  color: number;
  intensity: number;
  distance: number;
  mode: 'pulse' | 'steady' | 'flicker' | 'strobe' | 'rotate';
}

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();

const SCENES = new WeakMap<World, LabScene>();

/** Handles to the RESEARCH LABS environment (set pieces, lights) for the stage script and boss. */
export function labs(world: World): LabScene | null {
  return SCENES.get(world) ?? null;
}

/** Cheap deterministic 1D noise in [0, 1). */
function hashN(x: number): number {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hashN(i), hashN(i + 1), u);
}

export class LabScene {
  readonly root = new THREE.Group();
  readonly zones: Zone[] = [];
  readonly animators: Animator[] = [];
  readonly occluders: THREE.Object3D[] = [];
  readonly cullables: { obj: THREE.Object3D; d: number }[] = [];
  readonly doors: Record<string, BurstDoor> = {};
  private doorList: BurstDoor[] = [];
  cells: GlassWall[] = [];
  panes: GlassWall[] = [];
  skeleton!: SkeletonDisplay;
  banner!: THREE.Group;
  bulkhead!: THREE.Group;
  /** Spawn point inside the tunnel alcove. */
  alcove = new THREE.Vector3();
  readonly am: AnimMats;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly torch: THREE.SpotLight;
  readonly accent: THREE.PointLight;
  t = 0;
  /** 0..1 dims the lights (boss intro blackout). */
  dim = 0;
  dimTarget = 0;
  /** Boss-fight accent override: red alarm wash. */
  alarm = 0;
  private lightning = 0;
  private boltT = 3;
  private bolt2 = -1;
  /** Seconds into a reduced-flashing lightning swell (-1 = none). */
  private swellT = -1;
  private occKey = -1;
  private fx = new Rng(4242);
  private ambience: Ambience[] = [];
  private accents: Accent[] = [];
  private bulkOpen = 0;
  private bulkD = 0;
  private skyBase = new THREE.Color(0x0a1428);
  /** Vent drops already moved under the ceiling. */
  private drops = new WeakSet<Enemy>();

  constructor(readonly world: World, readonly curve: THREE.CatmullRomCurve3) {
    const am = (this.am = {
      strobe: this.tm(0xff2010),
      flicker: this.tm(0xe8f0ff),
      leds: [this.tm(0x30ff60), this.tm(0xffb020), this.tm(0x40a0ff)],
      egg: this.tm(0xffa050),
      fluid: Kit.track(new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, fog: false })),
      flame: this.tm(0x5080ff),
      screen: this.tm(0x70d8ff),
      sky: this.tm(0x0a1428),
      warn: this.tm(0xffa020),
      tank: this.tm(0x40c0ff),
    });
    void am;
    const scene = world.scene;
    scene.background = new THREE.Color(0x0c1018);
    scene.fog = new THREE.Fog(0x0c1018, 14, 60);
    const { hemi, sun } = EnvKit.lights(this.root, {
      sky: 0x9ab0d8,
      ground: 0x40363c,
      hemi: 1.7,
      sun: 0xd8e4ff,
      sunIntensity: 0.9,
      sunDir: [-0.3, 1, 0.45],
    });
    this.hemi = hemi;
    this.sun = sun;
    // Shoulder torch: whatever is in the middle of the frame always reads.
    this.torch = new THREE.SpotLight(0xfff0dc, 26, 30, 0.5, 0.75, 1.2);
    this.accent = new THREE.PointLight(0xff3020, 0, 18, 1.3);
    this.root.add(this.torch, this.torch.target, this.accent);
  }

  /** Tracked, per-stage animated glow material. */
  private tm(color: number): THREE.MeshBasicMaterial {
    return Kit.track(new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false }));
  }

  build() {
    const ctx: Ctx = { world: this.world, curve: this.curve, am: this.am, animators: this.animators, rng: new Rng(2024) };
    const zone = (id: string, from: number, to: number, out: { root: THREE.Group; shell: THREE.Object3D[] }) => {
      this.zones.push({ id, from, to, root: out.root, shell: out.shell });
      this.root.add(out.root);
    };
    const lobby = buildLobby(ctx);
    zone('lobby', 0, dAtZ(ROOMS.lobby.z1), lobby);
    this.skeleton = lobby.skeleton;
    this.banner = lobby.banner;
    this.doors.staff = lobby.staffDoor;
    const shop = buildShop(ctx);
    zone('shop', dAtZ(ROOMS.shop.z0), dAtZ(ROOMS.shop.z1), shop);
    this.doors.stock = shop.stockDoor;
    zone('green', dAtZ(ROOMS.green.z0), dAtZ(ROOMS.green.z1), buildGreenhouse(ctx));
    const hatch = buildHatchery(ctx);
    zone('hatch', dAtZ(ROOMS.hatch.z0), dAtZ(ROOMS.hatch.z1), hatch);
    this.doors.labL = hatch.doorL;
    this.doors.labR = hatch.doorR;
    const kitchen = buildKitchen(ctx);
    zone('kitchen', dAtZ(ROOMS.kitchen.z0), dAtZ(ROOMS.kitchen.z1), kitchen);
    this.doors.freezer = kitchen.freezer;
    const servers = buildServers(ctx);
    zone('servers', dAtZ(ROOMS.servers.z0), dAtZ(ROOMS.servers.z1), servers);
    this.bulkhead = servers.bulkhead;
    this.bulkD = dAtZ(-198.8);
    const tunnel = buildTunnel(ctx);
    zone('tunnel', dAtZ(TUNNEL.z0), dAtZ(TUNNEL.z1), tunnel);
    this.alcove.copy(tunnel.alcove);
    zone('pump', dAtZ(ROOMS.pump.z0), dAtZ(ROOMS.pump.z1), buildPump(ctx));
    const wing = buildWing(ctx);
    zone('wing', dAtZ(ROOMS.wing.z0), dAtZ(ROOMS.wing.z1), wing);
    this.cells = wing.cells;
    const hall = buildHall(ctx);
    zone('hall', dAtZ(ROOMS.hall.z0), dAtZ(ROOMS.hall.z1) + 60, hall);
    this.panes = hall.panes;

    const z = (zz: number) => dAtZ(zz);
    this.ambience = [
      { d: 0, sky: 0x9ab0d8, ground: 0x463a3e, hemi: 2.19, fog: 0x0e121c, near: 16, far: 66 },
      { d: z(-50), sky: 0x9ab0d8, ground: 0x463a3e, hemi: 2.19, fog: 0x0e121c, near: 16, far: 66 },
      { d: z(-60), sky: 0xb0a8c0, ground: 0x4a3c34, hemi: 2.12, fog: 0x12101a, near: 12, far: 48 },
      { d: z(-80), sky: 0xb0a8c0, ground: 0x4a3c34, hemi: 2.12, fog: 0x12101a, near: 12, far: 48 },
      { d: z(-86), sky: 0x8ab4c0, ground: 0x40392e, hemi: 2.31, fog: 0x0c1a1c, near: 14, far: 56 },
      { d: z(-120), sky: 0x8ab4c0, ground: 0x40392e, hemi: 2.31, fog: 0x0c1a1c, near: 14, far: 56 },
      { d: z(-128), sky: 0xb4d4cc, ground: 0x3a4a44, hemi: 2.38, fog: 0x0c1816, near: 12, far: 48 },
      { d: z(-158), sky: 0xb4d4cc, ground: 0x3a4a44, hemi: 2.38, fog: 0x0c1816, near: 12, far: 48 },
      { d: z(-166), sky: 0xb0bccc, ground: 0x3e3e40, hemi: 2.31, fog: 0x10141a, near: 12, far: 46 },
      { d: z(-190), sky: 0xb0bccc, ground: 0x3e3e40, hemi: 2.31, fog: 0x10141a, near: 12, far: 46 },
      { d: z(-198), sky: 0x8094d8, ground: 0x2a2c3a, hemi: 2.0, fog: 0x080c18, near: 10, far: 40 },
      { d: z(-214), sky: 0x8094d8, ground: 0x2a2c3a, hemi: 2.0, fog: 0x080c18, near: 10, far: 40 },
      // Service level: the warmer ground bounce lifts the corrugated ceilings and
      // pipe undersides out of black through the arcade monitor pass.
      { d: z(-222), sky: 0xa88488, ground: 0x54363a, hemi: 1.88, fog: 0x160a0a, near: 8, far: 36 },
      { d: z(-288), sky: 0xa88488, ground: 0x54363a, hemi: 1.88, fog: 0x160a0a, near: 8, far: 36 },
      { d: z(-298), sky: 0x98a8c4, ground: 0x34343c, hemi: 2.12, fog: 0x0c1018, near: 12, far: 52 },
      { d: z(-326), sky: 0x98a8c4, ground: 0x34343c, hemi: 2.12, fog: 0x0c1018, near: 12, far: 52 },
      { d: z(-334), sky: 0x8aa0c8, ground: 0x30323a, hemi: 2.12, fog: 0x080c14, near: 16, far: 64 },
    ];
    const V = (x: number, y: number, zz: number) => new THREE.Vector3(x, y, zz);
    this.accents = [
      { from: 0, to: z(-54), pos: V(-3, 7, -30), color: 0xff2a18, intensity: 22, distance: 28, mode: 'pulse' },
      { from: z(-54), to: z(-79), pos: V(4.5, 3.4, -74), color: 0xffa860, intensity: 14, distance: 14, mode: 'flicker' },
      // Warm grow-lamp over the planting beds: green/olive dinos pop against the dark foliage.
      { from: z(-79), to: z(-123), pos: V(-3.5, 3.4, -104), color: 0xffc888, intensity: 22, distance: 20, mode: 'steady' },
      { from: z(-123), to: z(-161), pos: V(0, 2.2, -142), color: 0x40ff70, intensity: 10, distance: 16, mode: 'pulse' },
      { from: z(-161), to: z(-193), pos: V(0, 3.4, -179), color: 0xc8dcff, intensity: 16, distance: 18, mode: 'flicker' },
      { from: z(-193), to: z(-216), pos: V(0, 3.0, -206), color: 0x3060ff, intensity: 16, distance: 16, mode: 'steady' },
      { from: z(-216), to: z(-277), pos: 'follow', color: 0xff2010, intensity: 16, distance: 13, mode: 'strobe' },
      { from: z(-277), to: z(-295), pos: V(11, 4.5, -286), color: 0xff2010, intensity: 18, distance: 16, mode: 'strobe' },
      { from: z(-295), to: z(-327), pos: V(11, 6.2, -312), color: 0xff8a20, intensity: 18, distance: 20, mode: 'rotate' },
      { from: z(-327), to: 1e9, pos: V(11, 5.5, -366), color: 0x40b0ff, intensity: 30, distance: 26, mode: 'steady' },
    ];
    // Intact glass stops bullets (nothing gets shot through a closed enclosure).
    for (const g of [...this.cells, ...this.panes]) g.onBreak = () => (this.occKey = -1);
    this.doorList = Object.values(this.doors);
    this.world.scene.add(this.root);
    this.update(0);
  }

  /**
   * The engine's 'drop' entry always starts 6 m up, which is above the
   * ceilings in here: move fresh vent drops to just under the ceiling and
   * puff the vent they come out of.
   */
  private fixVentDrops() {
    const w = this.world;
    for (const e of w.enemies()) {
      if (e.spawn.entry !== 'drop' || e.state !== 'entry' || this.drops.has(e)) continue;
      this.drops.add(e);
      const p = e.root.position;
      const ceil = ceilingAt(p.x, p.z);
      if (ceil > 20) continue;
      const g = w.groundAt(p.x, p.z);
      p.y = Math.min(p.y, Math.max(g + 0.5, ceil - 0.6));
      _v.set(p.x, ceil - 0.05, p.z);
      w.fx.dust(_v, 0.55, 0x7a7c82);
      w.fx.debris(_v, 0x5a5e66);
      w.audio.play('metal_clang', { volume: 0.35, pitch: 1.7, vary: 0.15 });
    }
  }

  /** Register an object that should only be visible near rail distance d. */
  cull(obj: THREE.Object3D, d: number) {
    this.cullables.push({ obj, d });
  }

  update(dt: number) {
    const w = this.world;
    const rig = w.rig;
    const d = rig.d;
    this.t += dt;
    const t = this.t;

    // Zone visibility (walls block sightlines; fog does the rest).
    let key = 0;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      z.root.visible = z.to >= d - 18 && z.from <= d + 62;
      if (z.from <= d + 34 && z.to >= d - 6) key |= 1 << i;
    }
    if (key !== this.occKey) {
      this.occKey = key;
      this.occluders.length = 0;
      for (let i = 0; i < this.zones.length; i++) {
        if (!(key & (1 << i))) continue;
        const zn = this.zones[i];
        this.occluders.push(...zn.shell);
        const glass = zn.id === 'wing' ? this.cells : zn.id === 'hall' ? this.panes : null;
        if (glass) for (const g of glass) if (!g.broken) this.occluders.push(g.pane);
      }
    }
    this.fixVentDrops();
    for (const c of this.cullables) c.obj.visible = c.d > d - 16 && c.d < d + 60;

    // Animated materials.
    // Settings.reduceFlashes ("calm"): no dropouts on the flickering panels, the
    // red beacons / alarm wash only swell gently, lightning is a soft glow.
    const calm = !!w.settings.reduceFlashes;
    const am = this.am;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.1);
    const k = calm ? 0.5 + 0.55 * pulse : 0.18 + 1.25 * pulse * pulse;
    am.strobe.color.setRGB(1.0 * k + 0.08, 0.1 * k, 0.06 * k);
    const fl = calm ? 0.95 + noise1(t * 3) * 0.06 : noise1(t * 9) > 0.8 || noise1(t * 1.7 + 30) > 0.86 ? 0.12 : 0.95 + noise1(t * 40) * 0.25;
    am.flicker.color.setRGB(0.92 * fl, 0.96 * fl, 1.05 * fl);
    for (let i = 0; i < 3; i++) {
      const on = noise1(t * (2.2 + i * 1.3) + i * 17) > 0.45;
      const base = i === 0 ? _c.setRGB(0.25, 1.2, 0.4) : i === 1 ? _c.setRGB(1.3, 0.7, 0.1) : _c.setRGB(0.3, 0.7, 1.4);
      am.leds[i].color.copy(base).multiplyScalar(on ? 1 : 0.15);
    }
    am.egg.color.setRGB(1.25, 0.62, 0.22).multiplyScalar(0.85 + 0.25 * Math.sin(t * 1.6));
    am.fluid.color.setRGB(0.25, 1.0, 0.45).multiplyScalar(0.75 + 0.2 * Math.sin(t * 0.9));
    am.flame.color.setRGB(0.35, 0.6, 1.3).multiplyScalar(0.75 + noise1(t * 14) * 0.5);
    am.screen.color.setRGB(0.45, 0.88, 1.1).multiplyScalar(0.85 + noise1(t * 6 + 3) * 0.2);
    const rot = Math.pow(Math.max(0, Math.sin(t * 2.4)), 4);
    am.warn.color.setRGB(1.3, 0.62, 0.1).multiplyScalar(0.2 + 1.1 * rot);
    am.tank.color.setRGB(0.25, 0.75, 1.3).multiplyScalar(0.8 + 0.2 * Math.sin(t * 0.7));

    // Lightning over the greenhouse.
    const gFrom = dAtZ(ROOMS.green.z0) - 14;
    const gTo = dAtZ(ROOMS.green.z1) + 4;
    if (d > gFrom && d < gTo) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        if (calm) this.swellT = 0;
        else {
          this.lightning = 1;
          this.bolt2 = 0.14;
        }
        this.boltT = this.fx.range(5, 9);
        const delay = this.fx.range(0.4, 1.1);
        w.later(delay, () => w.audio.play('thunder', { volume: 0.75, vary: 0.15 }));
      }
    }
    if (this.bolt2 > 0) {
      this.bolt2 -= dt;
      if (this.bolt2 <= 0) this.lightning = Math.max(this.lightning, 0.8);
    }
    this.lightning = Math.max(0, this.lightning - dt * 6);
    // Calm: a single soft swell (~25 % of the peak, 0.3 s rise, 1 s fade) instead of a double white-out.
    let swell = 0;
    if (this.swellT >= 0) {
      this.swellT += dt;
      const st = this.swellT;
      swell = 0.25 * (st < 0.3 ? st / 0.3 : Math.max(0, 1 - (st - 0.3)));
      if (st > 1.3) this.swellT = -1;
    }
    const bolt = calm ? Math.min(swell + this.lightning * 0.25, 0.3) : Math.max(this.lightning, swell);
    am.sky.color.copy(this.skyBase).lerp(_c.setRGB(0.75, 0.82, 1.0), bolt);

    // Ambience (hemisphere + fog) blended along the rail.
    const amb = this.ambience;
    let i0 = 0;
    while (i0 + 1 < amb.length && amb[i0 + 1].d <= d) i0++;
    const a = amb[i0];
    const b = amb[Math.min(i0 + 1, amb.length - 1)];
    const f = b.d > a.d ? clamp((d - a.d) / (b.d - a.d), 0, 1) : 0;
    this.dim = damp(this.dim, this.dimTarget, 3, dt);
    const dimK = 1 - this.dim * 0.55;
    this.hemi.color.set(a.sky).lerp(_c.set(b.sky), f);
    this.hemi.groundColor.set(a.ground).lerp(_c.set(b.ground), f);
    this.hemi.intensity = lerp(a.hemi, b.hemi, f) * dimK + bolt * 1.6;
    this.sun.intensity = 1.25 * dimK;
    const fog = w.scene.fog as THREE.Fog;
    fog.color.set(a.fog).lerp(_c.set(b.fog), f);
    fog.color.lerp(_c2.setRGB(0.35, 0.4, 0.55), bolt * 0.35);
    fog.near = lerp(a.near, b.near, f);
    fog.far = lerp(a.far, b.far, f);
    (w.scene.background as THREE.Color).copy(fog.color);

    // Accent light for the current zone.
    let acc = this.accents[this.accents.length - 1];
    for (const ac of this.accents) {
      if (d >= ac.from && d < ac.to) {
        acc = ac;
        break;
      }
    }
    if (acc.pos === 'follow') {
      rig.pointAt(Math.min(d + 7, rig.length), _v);
      _v.y += 2.6;
      this.accent.position.copy(_v);
    } else this.accent.position.copy(acc.pos);
    let ik = 1;
    switch (acc.mode) {
      case 'pulse':
        ik = 0.35 + 0.65 * pulse;
        break;
      case 'strobe':
        ik = calm ? 0.45 + 0.35 * pulse : 0.1 + 0.9 * pulse * pulse;
        break;
      case 'flicker':
        ik = calm ? 0.85 : fl > 0.5 ? 0.8 + noise1(t * 20) * 0.3 : 0.2;
        break;
      case 'rotate':
        ik = 0.25 + 0.75 * rot;
        break;
    }
    _c.set(acc.color);
    if (this.alarm > 0) _c.lerp(_c2.set(0xff2010), this.alarm * (calm ? 0.5 + 0.15 * pulse : 0.5 + 0.5 * pulse));
    this.accent.color.copy(_c);
    this.accent.intensity = acc.intensity * ik * dimK;
    this.accent.distance = acc.distance;

    // Torch follows the camera.
    const cam = w.camera;
    cam.getWorldDirection(_dir);
    this.torch.position.copy(cam.position).addScaledVector(_dir, -0.2);
    this.torch.position.y -= 0.15;
    this.torch.target.position.copy(cam.position).addScaledVector(_dir, 10);
    this.torch.target.updateMatrixWorld();
    this.torch.intensity = 26 * (1 - this.dim * 0.3);

    // Server-room bulkhead rises as the player approaches.
    if (d > this.bulkD) this.bulkOpen = Math.min(1, this.bulkOpen + dt * 0.7);
    const prevOpen = this.bulkhead.position.y;
    this.bulkhead.position.y = this.bulkOpen * this.bulkOpen * (3 - 2 * this.bulkOpen) * 2.75;
    if (prevOpen === 0 && this.bulkhead.position.y > 0) {
      w.audio.play('metal_clang', { volume: 0.7, pitch: 0.6 });
      w.audio.play('alarm', { volume: 0.25, pitch: 0.5 });
    }

    // Banner sway.
    this.banner.rotation.x = Math.sin(t * 0.7) * 0.035;
    this.banner.rotation.z = 0.04 + Math.sin(t * 0.43 + 1) * 0.015;

    // Set pieces.
    this.skeleton.update(dt, w);
    for (const door of this.doorList) door.update(dt, w);
    for (const c of this.cells) c.update(w);
    for (const fn of this.animators) fn(dt, t, w);
  }
}

export function buildLabs(world: World, curve: THREE.CatmullRomCurve3): Environment {
  const scene = new LabScene(world, curve);
  SCENES.set(world, scene);
  scene.build();
  return {
    root: scene.root,
    occluders: scene.occluders,
    surface: 'concrete',
    update: (dt) => scene.update(dt),
    dispose: () => {
      scene.root.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      SCENES.delete(world);
    },
  };
}
