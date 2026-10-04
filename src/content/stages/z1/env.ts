import * as THREE from 'three';
import type { Environment } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { EnvKit } from '../../kit/EnvKit';
import { ROOF_PADS } from './layout';
import { buildTown, type Town, type ZoneId } from './town';
import { bakeMerge } from './bake';
import { FirePlume, Rain, nightSky } from './vfx';

/** Per-world handles the stage script needs (set pieces, lights). */
export interface Z1Scene {
  town: Town;
  /** Objects hidden when farther than the fog (destructibles etc.). */
  cullables: { obj: THREE.Object3D; pos: THREE.Vector3; r: number }[];
  /** Seconds since the environment was built (drives flicker cycles). */
  t: number;
  /** Fade the red butcher-shop light up for the boss entrance. */
  bossLight: number;
}

const SCENES = new WeakMap<World, Z1Scene>();
export function z1Scene(world: World): Z1Scene | undefined {
  return SCENES.get(world);
}

const FOG = 0x1a2133;
const FOG_NEAR = 12;
const FOG_FAR = 82;
const MOON_DIR = new THREE.Vector3(-0.3, 0.3, -1).normalize();
/** Moonlight comes from higher than the visible moon so streets get more top light. */
const LIGHT_DIR = new THREE.Vector3(-0.4, 0.85, -0.6).normalize();

const _cam = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _c = new THREE.Color();

interface AccentSpot {
  /** Active while rig.d is in [from, to). */
  from: number;
  to: number;
  pos: THREE.Vector3;
  color: number;
  intensity: number;
  distance: number;
  mode: 'steady' | 'police' | 'buzz' | 'flicker';
}

export function buildEnv(world: World, curve: THREE.CatmullRomCurve3): Environment {
  void curve;
  const root = new THREE.Group();
  root.name = 'z1-env';
  const scene = world.scene;
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, FOG_NEAR, FOG_FAR);

  // ─── Lights: moonlit fill, moon key, flashlight, two local accents ───────
  const { hemi, sun: moon } = EnvKit.lights(root, {
    sky: 0x8a9cd8,
    ground: 0x3a3236,
    hemi: 1.55,
    sun: 0xb4c4ff,
    sunIntensity: 1.25,
    sunDir: [LIGHT_DIR.x, LIGHT_DIR.y, LIGHT_DIR.z],
  });
  void hemi;
  void moon;
  // A soft shoulder-mounted flashlight that follows the camera: enemies in the
  // centre of the frame always pop, without lighting the whole street.
  const spot = new THREE.SpotLight(0xfff0d8, 32, 36, 0.5, 0.75, 1.15);
  spot.name = 'flashlight';
  root.add(spot, spot.target);
  // Fire light (follows the nearest burning thing) + accent (neon / police / bulbs).
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 16, 1.4);
  const accent = new THREE.PointLight(0xff3c9a, 0, 14, 1.4);
  root.add(fireLight, accent);

  // ─── Sky ──────────────────────────────────────────────────────────────────
  const sky = nightSky(MOON_DIR, FOG, 0x03050b);
  root.add(sky);

  // ─── Base ground ──────────────────────────────────────────────────────────
  root.add(EnvKit.ground(520, 0x1d1f25, -40, -150, -0.03));

  // ─── Town ─────────────────────────────────────────────────────────────────
  const town = buildTown();
  const zoneBoxes: { id: ZoneId; groups: THREE.Group[]; box: THREE.Box3 }[] = [];
  for (const id of Object.keys(town.zones) as ZoneId[]) {
    const g = town.zones[id];
    const d = town.dynZones[id];
    bakeMerge(g);
    root.add(g, d);
    g.updateMatrixWorld(true);
    d.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g).union(new THREE.Box3().setFromObject(d));
    zoneBoxes.push({ id, groups: [g, d], box });
  }
  root.add(town.dynamic);
  const pools = town.pools.build();
  const beams = town.beams.build();
  root.add(pools, beams);
  const rain = new Rain(420);
  root.add(rain.mesh);
  scene.add(root);

  const z: Z1Scene = { town, t: 0, bossLight: 0, cullables: [] };
  SCENES.set(world, z);

  // Accent light schedule along the rail.
  const accents: AccentSpot[] = [
    { from: 0, to: 34, pos: new THREE.Vector3(-4.8, 3.2, -7.5), color: 0xff2020, intensity: 12, distance: 14, mode: 'police' },
    { from: 34, to: 72, pos: new THREE.Vector3(-7.2, 3.0, -49), color: 0xff4aa8, intensity: 16, distance: 15, mode: 'buzz' },
    { from: 72, to: 112, pos: new THREE.Vector3(-6.5, 3.6, -81), color: 0xff4aa8, intensity: 12, distance: 12, mode: 'steady' },
    { from: 112, to: 160, pos: new THREE.Vector3(7, 3.6, -127), color: 0x4dff74, intensity: 14, distance: 13, mode: 'buzz' },
    { from: 160, to: 210, pos: new THREE.Vector3(-31, 3.0, -152.4), color: 0xffc070, intensity: 12, distance: 12, mode: 'flicker' },
    { from: 210, to: 250, pos: new THREE.Vector3(-53.6, 3.0, -188.5), color: 0xff2020, intensity: 12, distance: 14, mode: 'police' },
    { from: 250, to: 300, pos: new THREE.Vector3(-76, 4.4, -210), color: 0xe8f0ff, intensity: 30, distance: 18, mode: 'steady' },
    { from: 300, to: 999, pos: new THREE.Vector3(-58, 3.0, -300.5), color: 0xff3a2a, intensity: 18, distance: 16, mode: 'steady' },
  ];
  let accentIdx = -1;
  let accentFade = 0;
  let fireTarget: FirePlume | null = null;
  let fireFade = 0;

  const anim = town.anim;
  const gas = town.gas;
  const bus = town.bus;
  const doors = town.doors;
  const badLamp = anim.badLamp;
  const poolDef = badLamp ? town.pools.colorOf(badLamp.pool) : null;
  const beamDef = badLamp ? town.beams.colorOf(badLamp.beam) : null;

  const update = (dt: number, w: World) => {
    z.t += dt;
    const t = z.t;
    const cam = w.camera;
    cam.getWorldPosition(_cam);
    // Sky follows the camera on XZ so it always reads as infinitely far.
    sky.position.set(_cam.x, 0, _cam.z);

    // Flashlight: from just right of / below the eye, aimed where the camera looks.
    cam.getWorldDirection(_dir);
    _right.set(-_dir.z, 0, _dir.x).normalize();
    spot.position.copy(_cam).addScaledVector(_right, 0.35);
    spot.position.y -= 0.25;
    spot.target.position.copy(_cam).addScaledVector(_dir, 12);
    spot.target.position.y -= 0.6;
    spot.target.updateMatrixWorld();

    // Zone culling (anything farther than the fog is invisible anyway).
    for (const zb of zoneBoxes) {
      const vis = zb.box.distanceToPoint(_cam) < FOG_FAR + 6;
      for (const g of zb.groups) g.visible = vis;
    }
    for (const c of z.cullables) c.obj.visible = c.pos.distanceTo(_cam) < FOG_FAR + c.r;

    // Accent light: pick by rail distance, cross-fade on change.
    const d = w.rig.d;
    let want = accentIdx;
    for (let i = 0; i < accents.length; i++) if (d >= accents[i].from && d < accents[i].to) want = i;
    if (want !== accentIdx) {
      accentFade -= dt * 3;
      if (accentFade <= 0 || accentIdx < 0) {
        accentIdx = want;
        accentFade = 0;
        const a = accents[accentIdx];
        accent.position.copy(a.pos);
        accent.color.setHex(a.color);
        accent.distance = a.distance;
      }
    } else accentFade = Math.min(1, accentFade + dt * 2);
    if (accentIdx >= 0) {
      const a = accents[accentIdx];
      let k = 1;
      if (a.mode === 'police') {
        const ph = Math.floor(t * 4) % 2;
        accent.color.setHex(ph ? 0xff2020 : 0x2a50ff);
        k = 0.55 + 0.45 * Math.abs(Math.sin(t * 12.5));
      } else if (a.mode === 'buzz') {
        k = buzzK(t, 3.1);
      } else if (a.mode === 'flicker') {
        k = Math.sin(t * 9) > -0.85 ? 0.9 + 0.1 * Math.sin(t * 31) : 0.15;
      }
      let base = a.intensity;
      if (accentIdx === accents.length - 1) base *= 0.6 + z.bossLight;
      accent.intensity = base * k * accentFade;
    }

    // Fire light: hop to the nearest burning plume.
    let best: FirePlume | null = null;
    let bestD = 38;
    let bestBase = 0;
    for (const f of anim.fires) {
      if (!f.plume.active) continue;
      const dd = f.pos.distanceTo(_cam);
      if (dd < bestD) {
        bestD = dd;
        best = f.plume;
        bestBase = f.light;
      }
    }
    if (best !== fireTarget) {
      fireFade -= dt * 4;
      if (fireFade <= 0) {
        fireTarget = best;
        fireFade = 0;
        for (const f of anim.fires) if (f.plume === best) fireLight.position.copy(f.pos);
      }
    } else fireFade = Math.min(1, fireFade + dt * 2);
    fireLight.intensity = fireTarget ? bestBase * fireFade * (0.75 + 0.17 * Math.sin(t * 21) + 0.1 * Math.sin(t * 47 + 1.3)) : 0;

    // Fires (only the ones that are near are worth animating).
    for (const f of anim.fires) {
      const near = f.pos.distanceTo(_cam) < FOG_FAR;
      f.plume.group.visible = f.plume.active && near;
      if (near && f.plume.active) f.plume.update(dt);
    }

    // Police light bars.
    const ph = Math.floor(t * 4) % 2 === 0;
    for (let i = 0; i < anim.lightbars.length; i++) {
      anim.lightbars[i][0].visible = ph;
      anim.lightbars[i][1].visible = !ph;
    }
    // Blinkers + buzzing neon + chase lights.
    for (const b of anim.blinkers) b.obj.visible = ((t + b.phase) % b.period) / b.period < b.duty;
    // The buzz objects are the "off" overlays: visible = tube dark.
    for (const b of anim.buzz) b.obj.visible = buzzK(t, b.seed) < 0.5;
    const chaseOn = Math.floor(t * 4) % 2;
    for (let i = 0; i < anim.chase.length; i++) anim.chase[i].visible = i % 2 === chaseOn;
    // Failing street lamp.
    if (badLamp && poolDef && beamDef) {
      const on = buzzK(t * 0.7, 9.1) > 0.5;
      badLamp.glow.visible = on;
      const k = on ? 1 : 0.08;
      pools.setColorAt(badLamp.pool, _c.setHex(poolDef.color).multiplyScalar(poolDef.k * k));
      beams.setColorAt(badLamp.beam, _c.setHex(beamDef.color).multiplyScalar(beamDef.k * k));
      if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
      if (beams.instanceColor) beams.instanceColor.needsUpdate = true;
    }

    gas.update(dt);
    bus.update(dt, w);
    doors.update(dt, w);
    rain.update(dt, _cam);
    if (d > 290) kioskCollide(w);
  };

  return {
    root,
    occluders: town.occluders,
    surface: 'concrete',
    groundAt(x: number, zz: number) {
      for (const p of ROOF_PADS) if (x >= p.x0 && x <= p.x1 && zz >= p.z0 && zz <= p.z1) return p.y;
      return 0;
    },
    update,
    dispose() {
      SCENES.delete(world);
    },
  };
}

/** Ground zombies keep this far from a newsstand's walls (more than one frame's step). */
const KIOSK_MARGIN = 0.75;

/**
 * Newsstand kiosks: their flat roofs are walkable ground (groundAt), which the
 * rooftop spitters stand on. Runs before the entities each frame:
 * - zombies on a roof are kept on it (never step off and hover);
 * - zombies on the street are pushed out around the kiosk walls, so they never
 *   clip through them nor get snapped up onto the roof by the ground clamp.
 */
function kioskCollide(w: World) {
  for (const e of w.enemies()) {
    if (e.frame !== 'world' || e.isBoss || e.state === 'dying') continue;
    const p = e.root.position;
    for (const pad of ROOF_PADS) {
      const x0 = pad.x0 - KIOSK_MARGIN;
      const x1 = pad.x1 + KIOSK_MARGIN;
      const z0 = pad.z0 - KIOSK_MARGIN;
      const z1 = pad.z1 + KIOSK_MARGIN;
      if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
      if (p.y > pad.y - 0.8) {
        p.x = Math.min(pad.x1 - 0.3, Math.max(pad.x0 + 0.3, p.x));
        p.z = Math.min(pad.z1 - 0.3, Math.max(pad.z0 + 0.3, p.z));
      } else {
        const dl = p.x - x0;
        const dr = x1 - p.x;
        const dn = p.z - z0;
        const ds = z1 - p.z;
        const m = Math.min(dl, dr, dn, ds);
        if (m === dl) p.x = x0;
        else if (m === dr) p.x = x1;
        else if (m === dn) p.z = z0;
        else p.z = z1;
      }
    }
  }
}

/** Irregular neon buzz: mostly on (1), with short dropouts (0). Deterministic in t. */
function buzzK(t: number, seed: number): number {
  const a = Math.sin(t * 1.7 + seed) + Math.sin(t * 2.9 + seed * 2.1) * 0.6;
  if (a > 1.25) return Math.sin(t * 60) > 0 ? 1 : 0;
  return 1;
}
