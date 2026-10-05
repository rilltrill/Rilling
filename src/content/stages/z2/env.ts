import * as THREE from 'three';
import type { Environment } from '../../../gameplay/StageTypes';
import type { World } from '../../../gameplay/World';
import { EnvKit } from '../../kit/EnvKit';
import { Kit } from '../../kit/ModelKit';
import { Rng } from '../../../core/Rng';
import { clamp } from '../../../core/math';
import { B, RAIL_LENGTH, dAt, groundAt } from './layout';
import { bake } from './bake';
import { FloraField, floraArtToggle, floraAtlas, floraReach } from '../../pixel/floraField';
import { DEAD_TREE, GRASS } from '../../pixel/floraSpecies';
import { Z2_BIOME } from '../../pixel/floraBiomes';

/** The hospital's plants as pixel billboards (ART: SPRITES): dead trees in the car park, potted plants' blades. */
export const Z2_FLORA = [DEAD_TREE, GRASS];
import { type Z2Scene, type AccentLight, clearZ2Scene, setZ2Scene } from './scene';
import type { ZoneCtx } from './zonekit';
import { snapAmbulanceCrashed } from './setpieces';
import { buildBay, buildCorrA, buildCrashAmbulance, buildER, buildHub, buildWard } from './zonesUpper';
import { buildAtrium, buildCocoon, buildCorrB, buildCorrC, buildMorgue, buildOR, buildShafts, buildStair } from './zonesLower';

/** Key rail distances (computed from the layout, so beats follow rail edits). */
export const D = {
  erDoor: dAt(0, -26),
  erHold: dAt(0, -30.6),
  corrA: dAt(11, -44),
  corrAHold: dAt(19.5, -44),
  corrAMid: dAt(33, -44),
  ward: dAt(53, -44),
  wardHold: dAt(55.2, -44),
  hubHold: dAt(73.6, -44.1),
  stairDoor: dAt(79, -51),
  stairTop: dAt(79, -55.6),
  stairBot: dAt(79, -68.5),
  morgue: dAt(79, -75),
  morgueHold: dAt(79, -78.2),
  corrB: dAt(79, -95),
  or: dAt(79, -108),
  orHold: dAt(78.9, -111.6),
  orExit: dAt(71, -121),
  corrCHold: dAt(66.4, -121),
  atrium: dAt(52, -121),
  boss: RAIL_LENGTH,
};

interface FogZone {
  until: number;
  color: number;
  near: number;
  far: number;
  hemi: number;
}

const FOGS: FogZone[] = [
  { until: D.erDoor - 1, color: 0x16202e, near: 12, far: 72, hemi: 1.45 },
  { until: D.stairTop + 3, color: 0x0b1614, near: 5, far: 38, hemi: 1.0 },
  { until: D.morgue - 2, color: 0x0a1110, near: 4, far: 30, hemi: 0.9 },
  { until: D.corrB, color: 0x0a1418, near: 4, far: 32, hemi: 1.0 },
  { until: D.orExit, color: 0x0b1512, near: 5, far: 34, hemi: 1.0 },
  { until: D.atrium - 2, color: 0x120e0c, near: 4, far: 30, hemi: 0.9 },
  { until: Infinity, color: 0x170c0f, near: 9, far: 56, hemi: 1.05 },
];

const _cam = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Color();
const _processed = new WeakSet<object>();

/*
 * Photosensitivity: nothing that covers a large part of the screen may change
 * brightness more than ~3 times a second. Panel meshes switch at most every
 * PANEL_HOLD seconds, lights at most every LIGHT_HOLD seconds (and ramp
 * rather than snap), and power surges are a smooth brown-out.
 * With Settings.reduceFlashes everything is calmer still: no lightning flash
 * (thunder only), panels/lights switch at most about once a second, alarm and
 * police lights pulse slowly and shallowly, and surges don't wobble.
 */
const PANEL_HOLD = 0.2;
const LIGHT_HOLD = 0.45;
const CALM_PANEL_HOLD = 1.0;
const CALM_LIGHT_HOLD = 1.2;

/** Slow envelope of a bad tube (`blink`): the tube is mostly working while this is > -0.9. */
function blinkEnv(t: number, seed: number): number {
  return Math.sin(t * 0.9 + seed) + Math.sin(t * 2.3 + seed * 1.7) * 0.7;
}

/** Irregular buzz: mostly on, short drop-outs. Deterministic in t. */
function buzz(t: number, seed: number): boolean {
  const a = Math.sin(t * 1.7 + seed) + Math.sin(t * 2.9 + seed * 2.1) * 0.6;
  if (a > 1.2) return Math.sin(t * 57) > 0;
  return true;
}
/** Bad tube: bursts of rapid flicker, often off. */
function blink(t: number, seed: number): boolean {
  const slow = blinkEnv(t, seed);
  if (slow > 0.6) return true;
  if (slow < -0.9) return false;
  return Math.sin(t * 31 + seed * 3) + Math.sin(t * 47) * 0.5 > -0.2;
}
/** Nearly dead: off with occasional stutters. */
function dying(t: number, seed: number): boolean {
  const ph = (t * 0.45 + seed) % 4.2;
  if (ph < 0.35) return Math.sin(t * 60) > -0.3;
  return ph > 3.95 && ph < 4.0;
}

export function buildEnv(world: World, curve: THREE.CatmullRomCurve3): Environment {
  void curve;
  const rng = new Rng(2202);
  const scene = world.scene;
  const root = new THREE.Group();
  root.name = 'z2-env';
  const dyn = new THREE.Group();
  dyn.name = 'z2-dyn';
  root.add(dyn);
  scene.background = new THREE.Color(FOGS[0].color);
  const fog = new THREE.Fog(FOGS[0].color, FOGS[0].near, FOGS[0].far);
  scene.fog = fog;

  // ─── Lights: cool fill, top key, flashlight, two roaming accents ──────────
  const { hemi, sun } = EnvKit.lights(root, {
    sky: 0xa8c4d8,
    ground: 0x3a3230,
    hemi: 1.0,
    sun: 0xc8d4ff,
    sunIntensity: 0.9,
    sunDir: [0.25, 1, 0.35],
  });
  const flash = new THREE.SpotLight(0xfff2dc, 30, 32, 0.56, 0.7, 1.25);
  flash.name = 'flashlight';
  root.add(flash, flash.target);
  const accent = new THREE.PointLight(0xff2020, 0, 14, 1.4);
  accent.name = 'z2-accent';
  const flick = new THREE.PointLight(0xe6fff2, 0, 8, 1.5);
  flick.name = 'z2-flick';
  root.add(accent, flick);

  const sc: Z2Scene = {
    t: 0,
    flickers: [],
    curtains: [],
    drawers: [],
    vents: [],
    swingers: [],
    spinners: [],
    lightbars: [],
    doorSlots: [],
    doors: [],
    tanks: [],
    flyers: [],
    ambulance: null,
    wall: null,
    accents: [],
    cullables: [],
    fleshGlow: 0,
    surge: 0,
    cocoon: null,
    root,
  };
  setZ2Scene(world, sc);
  const occluders: THREE.Object3D[] = [];
  const ctx: ZoneCtx = { rng, sc, dyn, occluders };

  // Night sky over the bay (follows the camera on XZ).
  const sky = EnvKit.sky(0x05070d, 0x1a2436, 0x121b27, 300);
  root.add(sky);

  // ─── Zones (each baked to a handful of draws, culled by rail distance) ───
  const zones: { g: THREE.Group; from: number; to: number }[] = [];
  // ART: SPRITES plants: anything tagged `userData.flora` (the car park's dead trees, the potted
  // plants' blades) is a pixel billboard; its 3D meshes leave the zone for a zone group of their
  // own under `veg3D` (ART: 3D, culled with the zone).
  const veg3D = new THREE.Group();
  veg3D.name = 'z2-veg3d';
  const flora2d = new FloraField(floraAtlas(Z2_FLORA, Z2_BIOME, 'z2'), {
    far: 70,
    rim: 0x8aa0d0,
    rimStrength: 0.12,
    gain: 0.8,
    localCap: 0.3,
  });
  const fb = new THREE.Box3();
  const foot = new THREE.Vector3();
  const addZone = (g: THREE.Group, from: number, to: number) => {
    g.updateMatrixWorld(true);
    const found: THREE.Object3D[] = [];
    g.traverse((o) => {
      if (o.userData.flora) found.push(o);
    });
    if (found.length) {
      const vg = new THREE.Group();
      vg.name = `${g.name}-veg`;
      for (const o of found) {
        fb.setFromObject(o);
        o.getWorldPosition(foot);
        flora2d.fit(o.userData.flora as string, foot.x, foot.y, foot.z, floraReach(o, foot), fb.max.y - foot.y, {
          // (Blades in a pot stand on its rim.)
          perched: foot.y > 0.2,
          sway: o.userData.flora === 'deadTree' ? 0.05 : 0,
        });
        vg.attach(o);
      }
      bake(vg);
      veg3D.add(vg);
      zones.push({ g: vg, from, to });
    }
    bake(g);
    root.add(g);
    zones.push({ g, from, to });
  };
  const bay = buildBay(ctx);
  addZone(bay.near, -1, D.corrA + 3);
  // The open-air part of the bay is only ever seen from outside / the doorway.
  addZone(bay.field, -1, D.erDoor + 3);
  addZone(buildER(ctx), -1, D.ward - 8);
  addZone(buildCorrA(ctx), D.erDoor - 4, D.stairDoor);
  addZone(buildWard(ctx), D.corrA - 2, D.stairBot);
  addZone(buildHub(ctx), D.corrAMid, D.morgue + 4);
  addZone(buildStair(ctx), D.wardHold, D.corrB + 2);
  addZone(buildMorgue(ctx), D.stairDoor, D.or + 6);
  addZone(buildCorrB(ctx), D.stairBot - 3, D.orExit + 2);
  addZone(buildOR(ctx), D.morgue + 4, D.atrium + 8);
  addZone(buildCorrC(ctx), D.corrB + 4, Infinity);
  addZone(buildAtrium(ctx), D.or + 2, Infinity);
  buildCrashAmbulance(ctx);
  zones.push({ g: buildShafts(ctx), from: D.or, to: Infinity });
  buildCocoon(ctx);
  const vegPx = new THREE.Group();
  vegPx.name = 'z2-vegPx';
  vegPx.add(flora2d.build());
  root.add(veg3D, vegPx);
  const untoggle = floraArtToggle(scene, [vegPx], [veg3D]);

  // ─── Oxygen / gas cylinder spots (spawned as Destructibles in setup) ──────
  // (filled by the zone builders' exported constants in index.ts)

  // ─── Accent light schedule ────────────────────────────────────────────────
  const A = (from: number, to: number, x: number, y: number, z: number, color: number, intensity: number, distance: number, mode: AccentLight['mode']) =>
    sc.accents.push({ from, to, pos: new THREE.Vector3(x, y, z), color, intensity, distance, mode });
  A(-1, D.erDoor - 2, 5.4, 3.0, -16.4, 0xff2020, 16, 20, 'police');
  A(D.erDoor - 2, D.corrA + 2, 9.6, 3.4, -42.4, 0xff2a1a, 9, 13, 'strobe');
  A(D.corrA + 2, D.ward, 51.6, 2.7, -43, 0xff2a1a, 11, 15, 'strobe');
  A(D.ward, D.hubHold - 1, 63, 2.6, -40.2, 0x9ab0ff, 6, 14, 'steady');
  A(D.hubHold - 1, D.stairDoor + 1, 85.2, 1.5, -45.2, 0xffc070, 9, 12, 'buzz');
  A(D.stairDoor + 1, D.morgue + 1, 82.4, B + 3.0, -70, 0xff2a1a, 12, 14, 'strobe');
  A(D.morgue + 1, D.corrB + 1, 79, B + 3.2, -86, 0x8fe0ff, 10, 15, 'buzz');
  A(D.corrB + 1, D.or + 1, 80.9, B + 2.6, -107, 0xff2a1a, 9, 12, 'strobe');
  A(D.or + 1, D.orExit + 1, 82.6, B + 2.5, -118.2, 0xfff6e0, 16, 11, 'surgical');
  A(D.orExit + 1, D.atrium - 1, 60, B + 1.6, -124.6, 0xff7a2a, 10, 12, 'fire');
  A(D.atrium - 1, Infinity, 40.6, B + 0.9, -121, 0xff6a3a, 11, 15, 'flesh');
  let accentIdx = -1;
  let accentFade = 0;
  // Rate-limited on/off for the failing-lamp accent modes ('buzz', 'surgical').
  let accOn = true;
  let accHeld = 0;
  let accK = 1;
  // Roaming panel light: follows the nearest faulty panel in view, but on a
  // slow, rate-limited signal (the panel mesh itself does the fast flicker).
  let flickIdx = -1;
  let flickOn = true;
  let flickHeld = 0;
  let flickLevel = 0;

  // ─── Rain (bay only) ──────────────────────────────────────────────────────
  const RAIN = 280;
  const rainPos = new Float32Array(RAIN * 6);
  const rainFloor = new Float32Array(RAIN);
  const rainGeo = Kit.track(new THREE.BufferGeometry());
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
  rainGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const rain = new THREE.LineSegments(
    rainGeo,
    Kit.track(new THREE.LineBasicMaterial({ color: 0x8aa2c8, transparent: true, opacity: 0.4, fog: true })),
  );
  rain.frustumCulled = false;
  root.add(rain);
  const rainRng = new Rng(77);
  const placeDrop = (i: number, cx: number, cz: number, top: boolean) => {
    const x = cx + rainRng.spread(16);
    const z = cz + rainRng.spread(16) - 6;
    const y = top ? rainRng.range(8, 12) : rainRng.range(0, 12);
    const under = x > -10.2 && x < 10.2 && z > -26 && z < -10;
    rainFloor[i] = under ? 5.1 : 0;
    const o = i * 6;
    rainPos[o] = x;
    rainPos[o + 1] = y;
    rainPos[o + 2] = z;
    rainPos[o + 3] = x + 0.03;
    rainPos[o + 4] = y + 0.5;
    rainPos[o + 5] = z + 0.08;
  };
  for (let i = 0; i < RAIN; i++) placeDrop(i, 0, 10, false);

  scene.add(root);

  // Ambience: thunder + lightning outside, distant groans and clangs inside.
  let thunderT = 5;
  let flashT = 0;
  let ambT = 6;
  const ambRng = new Rng(9);

  let fogIdx = 0;
  const fogCol = new THREE.Color(FOGS[0].color);
  let fogNear = FOGS[0].near;
  let fogFar = FOGS[0].far;
  let hemiK = FOGS[0].hemi;

  const update = (dt: number, w: World) => {
    sc.t += dt;
    const t = sc.t;
    // Photosensitivity setting (live: the settings screen can change it mid-stage).
    const calm = w.settings.reduceFlashes;
    const panelHold = calm ? CALM_PANEL_HOLD : PANEL_HOLD;
    const lightHold = calm ? CALM_LIGHT_HOLD : LIGHT_HOLD;
    const d = w.rig.d;
    const cam = w.camera;
    cam.getWorldPosition(_cam);
    cam.getWorldDirection(_dir);
    sky.position.set(_cam.x, 0, _cam.z);
    sky.visible = d < D.corrA;

    // Flashlight from just below/right of the eye, aimed where the camera looks.
    _right.set(-_dir.z, 0, _dir.x).normalize();
    flash.position.copy(_cam).addScaledVector(_right, 0.3);
    flash.position.y -= 0.22;
    flash.target.position.copy(_cam).addScaledVector(_dir, 12);
    flash.target.position.y -= 0.5;
    flash.target.updateMatrixWorld();

    // Zone culling + fog per area.
    for (const z of zones) z.g.visible = d >= z.from && d <= z.to;
    for (const c of sc.cullables) c.obj.visible = c.pos.distanceToSquared(_cam) < 48 * 48;
    while (fogIdx < FOGS.length - 1 && d > FOGS[fogIdx].until) fogIdx++;
    while (fogIdx > 0 && d <= FOGS[fogIdx - 1].until) fogIdx--;
    const fz = FOGS[fogIdx];
    const k = 1 - Math.exp(-dt * 1.6);
    fogCol.lerp(_c.setHex(fz.color), k);
    fogNear += (fz.near - fogNear) * k;
    fogFar += (fz.far - fogFar) * k;
    hemiK += (fz.hemi - hemiK) * k;
    fog.color.copy(fogCol);
    fog.near = fogNear;
    fog.far = fogFar;
    (scene.background as THREE.Color).copy(fogCol);
    // Power surges: a smooth brown-out of the fill (a slow < 1.5 Hz wobble,
    // never a strobe) while the ceiling panels cut out together.
    sc.surge = Math.max(0, sc.surge - dt * 0.6);
    const surgeS = Math.min(1, sc.surge);
    const surgeK = 1 - 0.4 * surgeS * (calm ? 0.75 : 0.75 + 0.25 * Math.sin(t * 9));
    const blackout = sc.surge > 0.25;
    // Lightning (bay only).
    if (d < D.erDoor + 2) {
      thunderT -= dt;
      if (thunderT <= 0) {
        thunderT = ambRng.range(9, 16);
        flashT = 0.45;
        w.later(ambRng.range(0.4, 1.1), () => w.audio.play('thunder', { volume: 0.55, vary: 0.2 }));
      }
    }
    // One bright flash that fades out (no on/off double strobe).
    let bolt = 0;
    if (flashT > 0) {
      flashT = Math.max(0, flashT - dt);
      // (Reduced flashes: thunder only, the scene doesn't light up.)
      if (!calm) bolt = flashT > 0.36 ? 1.8 : 1.8 * Math.pow(flashT / 0.36, 1.6);
    }
    hemi.intensity = hemiK * surgeK + bolt;
    sun.intensity = 0.9 * surgeK + bolt * 0.6;
    ambT -= dt;
    if (ambT <= 0) {
      ambT = ambRng.range(6, 13);
      const r = ambRng.next();
      if (d > D.erDoor) {
        if (r < 0.55) w.audio.play('zombie_groan', { volume: 0.22, pitch: ambRng.range(0.6, 0.8), pan: ambRng.spread(0.8) });
        else if (r < 0.8) w.audio.play('metal_clang', { volume: 0.12, pitch: ambRng.range(0.5, 0.7), pan: ambRng.spread(0.9) });
        else w.audio.play('roar_distant', { volume: 0.25, pan: ambRng.spread(0.6) });
      } else if (r < 0.5) w.audio.play('roar_distant', { volume: 0.2, pan: ambRng.spread(0.8) });
    }

    // ── Flickering panels (small emissive meshes; ≤ 3 switches/s each) ──
    let best = -1;
    let bestD = 15 * 15;
    for (let i = 0; i < sc.flickers.length; i++) {
      const f = sc.flickers[i];
      const dd = f.pos.distanceToSquared(_cam);
      if (dd > 42 * 42) continue;
      f.held += dt;
      const lit = !blackout && (f.mode === 'buzz' ? buzz(t, f.seed) : f.mode === 'blink' ? blink(t, f.seed) : dying(t, f.seed));
      if (lit !== f.lit && (f.held >= panelHold || blackout)) {
        f.lit = lit;
        f.held = 0;
        f.mesh.material = lit ? f.on : f.off;
      }
      if (dd < bestD) {
        _v.subVectors(f.pos, _cam);
        if (_v.dot(_dir) > 0) {
          bestD = dd;
          best = i;
        }
      }
    }
    // The roaming light: a gentle 5 ↔ 2 swing on the tube's SLOW envelope,
    // switching at most every LIGHT_HOLD s and ramping instead of snapping.
    if (best !== flickIdx) {
      flickIdx = best;
      if (best >= 0) {
        const f = sc.flickers[best];
        f.mesh.getWorldPosition(flick.position);
        flick.position.y -= 0.35;
        // Hand over softly from the previous panel.
        flickLevel *= 0.5;
      }
    }
    let flickTarget = 0;
    if (best >= 0) {
      const f = sc.flickers[best];
      const want = !blackout && (f.mode === 'buzz' || (f.mode === 'blink' && blinkEnv(t, f.seed) > -0.9));
      flickHeld += dt;
      if (want !== flickOn && flickHeld >= lightHold) {
        flickOn = want;
        flickHeld = 0;
      }
      flickTarget = calm ? (flickOn ? 4.2 : 3) : flickOn ? 5 : 2;
    }
    flickLevel += (flickTarget - flickLevel) * (1 - Math.exp(-dt * 10));
    flick.intensity = flickLevel;

    // ── Accent light ──
    let want = accentIdx;
    for (let i = 0; i < sc.accents.length; i++) if (d >= sc.accents[i].from && d < sc.accents[i].to) want = i;
    if (want !== accentIdx) {
      accentFade -= dt * 3;
      if (accentFade <= 0 || accentIdx < 0) {
        accentIdx = want;
        accentFade = 0;
        const a = sc.accents[accentIdx];
        accent.position.copy(a.pos);
        accent.color.setHex(a.color);
        accent.distance = a.distance;
      }
    } else accentFade = Math.min(1, accentFade + dt * 1.5);
    if (accentIdx >= 0) {
      const a = sc.accents[accentIdx];
      let kk = 1;
      switch (a.mode) {
        case 'police': {
          // Red/blue alternation at 1.5 Hz with a gentle pulse (no strobe).
          const ph = Math.floor(t * (calm ? 1 : 3)) % 2;
          accent.color.setHex(ph ? 0xff2020 : 0x3050ff);
          kk = calm ? 0.6 : 0.8 + 0.2 * Math.abs(Math.sin(t * 3 * Math.PI));
          break;
        }
        case 'strobe':
          // Rotating alarm beacon; calm: a slow, shallow swell.
          kk = calm ? 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.6)) : 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(t * 3.4)), 3);
          break;
        case 'buzz':
        case 'surgical': {
          // Failing lamp: drop-outs are rate-limited and ramped.
          const raw = a.mode === 'buzz' ? buzz(t * 0.8, 4.2) : buzz(t * 0.5, 9.1);
          accHeld += dt;
          if (raw !== accOn && accHeld >= lightHold) {
            accOn = raw;
            accHeld = 0;
          }
          accK += ((accOn ? 1 : a.mode === 'buzz' ? 0.35 : 0.5) - accK) * (1 - Math.exp(-dt * 12));
          kk = accK;
          break;
        }
        case 'fire':
          kk = 0.82 + 0.1 * Math.sin(t * 5.1) + 0.08 * Math.sin(t * 8.3 + 1.3);
          break;
        case 'flesh':
          kk = (0.75 + 0.25 * Math.pow(Math.max(0, Math.sin(t * 2.6)), 6)) * (0.7 + sc.fleshGlow * 0.8);
          break;
        default:
          break;
      }
      accent.intensity = a.intensity * kk * accentFade;
    }

    // ── Cocoon heartbeat ──
    if (sc.cocoon) sc.cocoon.visible = d > D.or;
    if (sc.cocoon && sc.cocoon.visible) {
      const beat = Math.pow(Math.max(0, Math.sin(t * 2.4)), 6);
      sc.cocoon.scale.set(1 + beat * 0.05, 1 + beat * 0.07, 1 + beat * 0.05);
    }

    // ── Swinging / spinning things, light bars ──
    for (const s of sc.swingers) {
      s.obj.rotation.z = Math.sin(t * s.rate + s.phase) * s.amp;
      s.obj.rotation.x = Math.sin(t * s.rate * 0.7 + s.phase * 1.3) * s.amp * 0.6 + (s.obj.userData.baseX ?? 0);
    }
    for (const s of sc.spinners) s.obj.rotation.y += s.rate * dt;
    const ph = Math.floor(t * (calm ? 1 : 3)) % 2 === 0;
    for (const lb of sc.lightbars) {
      for (const m of lb.red) m.visible = ph;
      for (const m of lb.blue) m.visible = !ph;
    }

    // ── Triggers: curtains, doors, drawers, vents (driven by nearby enemies) ──
    const enemies = w.enemies();
    for (const e of enemies) {
      if (e.state === 'dying' || e.removed) continue;
      e.root.getWorldPosition(_w);
      // Spitters hold the spot they were placed at (counters, galleries).
      if (e.name === 'spitter' && !_processed.has(e) && Number.isFinite(e.distToPlayer)) {
        _processed.add(e);
        e.attackRange = Math.max(e.attackRange, e.distToPlayer - 0.2);
      }
      for (const c of sc.curtains) {
        if (c.open) continue;
        if (Math.abs(_w.x - c.pos.x) < 2.0 && Math.abs(_w.z - c.pos.z) < 1.2) openCurtain(w, c);
      }
      for (const door of sc.doors) {
        if (door.removed) continue;
        const slot = door.root.userData.slot as { centre: THREE.Vector3 } | undefined;
        if (!slot) continue;
        const dx = _w.x - slot.centre.x;
        const dz = _w.z - slot.centre.z;
        if (dx * dx + dz * dz < 0.95 * 0.95) door.destroy();
      }
      for (const dr of sc.drawers) {
        if (dr.open) continue;
        const dx = _w.x - dr.pos.x;
        const dz = _w.z - dr.pos.z;
        if (dx * dx + dz * dz < 0.8 && Math.abs(_w.y - dr.pos.y) < 1.2) openDrawer(w, dr);
      }
      for (const v of sc.vents) {
        if (v.dropped) continue;
        const dx = _w.x - v.pos.x;
        const dz = _w.z - v.pos.z;
        if (dx * dx + dz * dz < 0.9 && _w.y > v.floor + 0.9) dropVent(w, v);
      }
    }
    for (const c of sc.curtains) {
      if (!c.open || c.t >= 1) continue;
      c.t = Math.min(1, c.t + dt * 3.2);
      const e = 1 - (1 - c.t) * (1 - c.t);
      c.obj.position.copy(c.closed).addScaledVector(c.slide, e);
      c.obj.scale.x = 1 - 0.72 * e;
      c.obj.rotation.y = Math.sin(c.t * Math.PI) * 0.12;
    }
    for (const dr of sc.drawers) {
      if (!dr.open || dr.t >= 1) continue;
      dr.t = Math.min(1, dr.t + dt * 4);
      const e = 1 - (1 - dr.t) * (1 - dr.t);
      dr.door.rotation.y = dr.door.userData.baseRy + (dr.door.userData.openSign as number) * 1.9 * e;
      dr.tray.position.lerpVectors(dr.trayFrom, dr.trayTo, e);
    }
    for (const v of sc.vents) {
      if (!v.dropped || v.landed) continue;
      v.vy -= 18 * dt;
      v.grate.position.y += v.vy * dt;
      v.grate.rotation.x += v.spin * dt;
      v.grate.rotation.z += v.spin * 0.6 * dt;
      if (v.grate.position.y <= v.floor + 0.02) {
        v.grate.position.y = v.floor + 0.02;
        v.grate.rotation.set(0, v.grate.rotation.y, 0);
        v.landed = true;
        w.audio.play('metal_clang', { volume: 0.6, vary: 0.2 });
      }
    }

    // ── Debris flyers ──
    for (const f of sc.flyers) {
      if (f.rest) continue;
      f.vel.y -= 16 * dt;
      f.obj.position.addScaledVector(f.vel, dt);
      f.obj.rotation.x += f.spin.x * dt;
      f.obj.rotation.y += f.spin.y * dt;
      f.obj.rotation.z += f.spin.z * dt;
      if (f.obj.position.y <= f.floor + f.half) {
        f.obj.position.y = f.floor + f.half;
        if (Math.abs(f.vel.y) < 2) {
          f.rest = true;
          // Settle flat (thin axis vertical), keeping the heading.
          const yaw = f.obj.rotation.y;
          f.obj.rotation.order = 'YXZ';
          f.obj.rotation.set(-Math.PI / 2, yaw, 0);
        } else {
          f.vel.y *= -0.3;
          f.vel.x *= 0.5;
          f.vel.z *= 0.5;
          f.spin.multiplyScalar(0.5);
        }
      }
    }

    // ── Ambulance crash ──
    const ar = sc.ambulance;
    if (ar) updateAmbulance(w, ar, dt, d);

    // ── Breakable wall jitter ──
    const bw = sc.wall;
    if (bw && !bw.broken && bw.shake > 0) {
      bw.shake = Math.max(0, bw.shake - dt * 2.5);
      for (let i = 0; i < bw.pieces.length; i++) {
        const p = bw.pieces[i];
        p.rotation.z = Math.sin(t * 60 + i) * 0.03 * bw.shake;
        p.rotation.x = Math.sin(t * 47 + i * 2) * 0.05 * bw.shake;
      }
    }

    // ── Rain ──
    rain.visible = d < D.erDoor + 1;
    if (rain.visible) {
      const fall = 17 * dt;
      for (let i = 0; i < RAIN; i++) {
        const o = i * 6;
        rainPos[o + 1] -= fall;
        rainPos[o + 4] -= fall;
        if (rainPos[o + 1] < rainFloor[i]) placeDrop(i, _cam.x, _cam.z, true);
      }
      (rainGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  };

  return {
    root,
    occluders,
    surface: 'concrete',
    groundAt,
    update,
    dispose() {
      untoggle();
      clearZ2Scene(world);
    },
  };
}

// ─── Trigger actions ────────────────────────────────────────────────────────

function openCurtain(w: World, c: Z2Scene['curtains'][number]) {
  c.open = true;
  c.t = 0;
  w.audio.play('whoosh', { volume: 0.6, vary: 0.2, pitch: 0.8 });
}

function openDrawer(w: World, dr: Z2Scene['drawers'][number]) {
  dr.open = true;
  dr.t = 0;
  w.audio.play('metal_clang', { volume: 0.9, vary: 0.15 });
  w.audio.play('door', { volume: 0.5, pitch: 1.4 });
  w.rig.shake(0.08);
  w.fx.dust(_v.copy(dr.pos), 0.4, 0xa8b4b8);
}

function dropVent(w: World, v: Z2Scene['vents'][number]) {
  v.dropped = true;
  v.vy = 0.5;
  v.spin = w.rng.range(3, 6) * (w.rng.chance(0.5) ? 1 : -1);
  w.audio.play('metal_clang', { volume: 0.8, vary: 0.2, pitch: 1.2 });
  w.fx.dust(_v.copy(v.pos).setY(v.pos.y - 0.2), 0.5, 0x8a8a80);
}

function updateAmbulance(w: World, ar: NonNullable<Z2Scene['ambulance']>, dt: number, d: number) {
  const a = ar.amb;
  // Debug starts past the bay: show it already crashed.
  if (ar.state === 'idle' && d > 32) snapAmbulanceCrashed(ar);
  if (ar.state === 'driving') {
    ar.t = Math.min(1, ar.t + dt / 1.35);
    const k = ar.t;
    a.root.visible = true;
    a.root.position.lerpVectors(ar.from, ar.to, k);
    // Swerve (perpendicular to the travel direction).
    const sw = Math.sin(k * Math.PI) * 1.2;
    a.root.position.x += Math.cos(ar.yawFrom) * sw;
    a.root.position.z -= Math.sin(ar.yawFrom) * sw;
    a.root.rotation.y = ar.yawFrom + Math.cos(k * Math.PI) * 0.12;
    a.body.rotation.z = Math.sin(k * Math.PI * 2) * 0.05;
    if (k >= 1) {
      ar.state = 'crashed';
      ar.t = 0;
      ar.doorsT = -0.75;
      _v.copy(ar.to).add(_w.set(Math.sin(ar.yawFrom) * 3.0, 1.0, Math.cos(ar.yawFrom) * 3.0));
      w.audio.play('crash', { volume: 1 });
      w.audio.play('glass', { volume: 0.8 });
      w.audio.play('explosion', { volume: 0.5, pitch: 0.8 });
      w.rig.shake(0.7);
      w.haptic(120);
      w.fx.explosion(_v, 0.7);
      w.fx.sparks(_v, null, 30);
      w.fx.debris(_v, 0xd8dcd6);
      w.fx.dust(_v.setY(0.2), 1.6, 0x6a6460);
      for (const f of ar.flames) f.obj.visible = true;
    }
    return;
  }
  if (ar.state !== 'crashed') return;
  if (ar.t < 1) {
    ar.t = Math.min(1, ar.t + dt * 3);
    const e = 1 - (1 - ar.t) * (1 - ar.t);
    a.root.rotation.y = ar.yawFrom + (ar.yawTo - ar.yawFrom) * e;
    a.body.rotation.z = Math.sin(ar.t * Math.PI) * 0.12;
    a.body.rotation.x = Math.sin(ar.t * Math.PI) * -0.05;
  }
  if (ar.doorsT < 1) {
    const prev = ar.doorsT;
    ar.doorsT = Math.min(1, ar.doorsT + dt * 2.6);
    if (prev < 0 && ar.doorsT >= 0) {
      w.audio.play('metal_clang', { volume: 1, pitch: 0.8 });
      w.audio.play('door', { volume: 0.8, pitch: 0.7 });
      w.rig.shake(0.2);
    }
    const e = clamp(ar.doorsT, 0, 1);
    const o = 1 - (1 - e) * (1 - e) * (1 - e);
    a.doorL.rotation.y = -1.9 * o;
    a.doorR.rotation.y = 1.9 * o;
  }
  // Fire on the crumpled bonnet + smoke.
  const t = w.time;
  for (const f of ar.flames) {
    if (!f.obj.visible) continue;
    const s = f.scale * (0.8 + 0.25 * Math.sin(t * 13 + f.seed) + 0.15 * Math.sin(t * 29 + f.seed * 2));
    f.obj.scale.set(1 + 0.1 * Math.sin(t * 9 + f.seed), s, 1);
  }
  ar.smokeT -= dt;
  if (ar.smokeT <= 0 && a.root.visible && d < 40) {
    ar.smokeT = 0.22;
    a.root.localToWorld(_v.set(0, 2.2, 2.6));
    w.fx.dust(_v, 0.5, 0x2a2826);
  }
}

