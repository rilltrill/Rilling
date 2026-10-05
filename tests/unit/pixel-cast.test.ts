import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { createEnemy } from '../../src/content/registry';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS, type HitPart, type PickupKind } from '../../src/core/types';
import type { Entity } from '../../src/gameplay/Entity';
import { Pickup } from '../../src/gameplay/Pickup';
import { Projectile, type ProjectileOptions } from '../../src/gameplay/Projectile';
import { Kit } from '../../src/content/kit/ModelKit';
import { car } from '../../src/content/stages/z3/props';
import { bake, M as Z3M } from '../../src/content/stages/z3/bake';
import { tx } from '../../src/content/stages/d3/retro';
import { PixelFigure, PART, MAX_PRIMS, type FigureSample } from '../../src/gameplay/pixel/figure';
import { nullHud } from './sim';

/**
 * PixelCast props alignment: pickups and everything thrown at the camera are
 * painted (never the impostor bake), and the painting covers their hitboxes —
 * every hitbox centre lands on a painted texel of the right part, and the
 * sprite's silhouette matches the raycast one (trails, flames, a chain stub
 * and the halo's glow may add a little outside it).
 */

const GH = 288;
const W = 844;
const H = 390;
const GW = Math.round((GH * W) / H);
const PART_OF: Record<HitPart, number> = { head: PART.HEAD, torso: PART.TORSO, limb: PART.LIMB, tail: PART.TAIL, weak: PART.WEAK, armor: PART.ARMOR, body: PART.TORSO };

function makeWorld() {
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 7);
  world.viewport = { width: W, height: H };
  world.player.god = true;
  camera.position.set(0, 1.62, 0);
  camera.lookAt(0, 1.3, -6);
  camera.updateMatrixWorld();
  return { world, camera };
}

interface Check {
  centres: number;
  miss: string[];
  /** Sprite ∩ hitbox / hitbox (the sprite covers the target). */
  cover: number;
  /** Sprite area / hitbox area (it isn't bloated). */
  ratio: number;
  prims: number;
}

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const ray = new THREE.Raycaster();
const sample: FigureSample = { layer: -1, prim: -1, part: 0, mat: 0, depth: 0 };

/**
 * `skip`: hitboxes left out of the coverage grid (still in the centre checks) — the
 * pickups' halo ring is drawn as the art asks, a 1–2 px line, thinner than its 6 cm
 * tube hitbox (the rest of the tube stays shootable: generous, never a miss on art).
 */
function check(world: World, camera: THREE.PerspectiveCamera, e: Entity, skip?: (o: THREE.Object3D) => boolean): Check {
  world.scene.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  const f = new PixelFigure();
  f.begin(camera, GW, GH);
  expect(e.paintPixels!(f)).toBe(true);
  expect(f.count).toBeLessThanOrEqual(MAX_PRIMS);
  expect(f.overflow).toBe(0);
  expect(f.layout(1, 24, 256)).toBe(true);
  const boxes = world.shootables.objects.filter((o) => (o.userData.shot as { owner: Entity } | undefined)?.owner === e);
  const area = skip ? boxes.filter((o) => !skip(o)) : boxes;
  const shootIn = (ndc: THREE.Vector2, set: THREE.Object3D[]): number => {
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(set, false);
    return hits.length ? PART_OF[(hits[0].object.userData.shot as { part: HitPart }).part] : 0;
  };
  const shoot = (ndc: THREE.Vector2): number => shootIn(ndc, boxes);
  let centres = 0;
  const miss: string[] = [];
  for (const b of boxes) {
    const m = b as THREE.Mesh;
    if (!m.geometry || !m.visible) continue;
    m.geometry.computeBoundingBox();
    _box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    _box.getCenter(_v).project(camera);
    const ndc = new THREE.Vector2(_v.x, _v.y);
    const want = shoot(ndc);
    if (!want) continue;
    centres++;
    const tx = (((_v.x * 0.5 + 0.5) * GW - f.ox) / f.kpx) | 0;
    const ty = (((_v.y * 0.5 + 0.5) * GH - f.oy) / f.kpx) | 0;
    f.sample(tx + 0.5, ty + 0.5, sample);
    if (sample.layer < 0 || sample.part !== want) miss.push(`${m.name || m.geometry.type}@${tx},${ty}→${sample.layer < 0 ? 'empty' : sample.part}`);
  }
  let hit = 0;
  let spr = 0;
  let both = 0;
  // Grid over the sprite plus a margin (the hitbox may poke past the painting).
  for (let y = -6.5; y < f.H + 6; y += 1) {
    for (let x = -6.5; x < f.W + 6; x += 1) {
      const ndc = new THREE.Vector2(((f.ox + x * f.kpx) / GW) * 2 - 1, ((f.oy + y * f.kpx) / GH) * 2 - 1);
      const want = shootIn(ndc, area) > 0;
      f.sample(x, y, sample);
      const got = sample.layer >= 0;
      if (want) hit++;
      if (got) spr++;
      if (want && got) both++;
    }
  }
  return { centres, miss, cover: both / Math.max(1, hit), ratio: spr / Math.max(1, hit), prims: f.count };
}

function expectCovered(c: Check, label: string, o: { cover?: number; ratio?: number } = {}) {
  const info = `${label}: centres ${c.centres - c.miss.length}/${c.centres} [${c.miss.join(' ')}] cover ${c.cover.toFixed(2)} ratio ${c.ratio.toFixed(2)} prims ${c.prims}`;
  if (process.env.CAST_REPORT) console.log(info);
  expect(c.centres, info).toBeGreaterThan(0);
  expect(c.miss, info).toEqual([]);
  expect(c.cover, info).toBeGreaterThanOrEqual(o.cover ?? 0.85);
  expect(c.ratio, info).toBeLessThanOrEqual(o.ratio ?? 1.6);
  expect(c.ratio, info).toBeGreaterThanOrEqual(0.7);
}

// ─── Pickups ─────────────────────────────────────────────────────────────────

describe('PixelCast pickups (painted, covering their hitboxes)', () => {
  const kinds: PickupKind[] = ['health', 'shotgun', 'smg', 'magnum', 'bomb', 'points'];
  for (const kind of kinds) {
    it(`${kind}: spinning and bobbing, near and far`, () => {
      const { world, camera } = makeWorld();
      const p = new Pickup(world, kind, new THREE.Vector3(0.6, 1.35, -3.6), 'world');
      world.add(p);
      for (const [t, z] of [
        [0.2, -3.6],
        [0.9, -3.6],
        [1.6, -7],
      ] as const) {
        p.root.position.z = z;
        for (let a = 0; a < t; a += 1 / 60) p.update(1 / 60);
        expectCovered(
          check(world, camera, p, (o) => o.name === 'halo'),
          `${kind} t${t} z${z}`,
          { ratio: 1.9 },
        );
      }
    });
  }
});

// ─── Thrown things ───────────────────────────────────────────────────────────

type Maker = (world: World) => Partial<ProjectileOptions>;

const detached = new WeakMap<World, Record<string, unknown>>();
function boss<T>(world: World, id: string): T {
  let m = detached.get(world);
  if (!m) detached.set(world, (m = {}));
  if (!m[id]) {
    const b = createEnemy(id, world, { pos: new THREE.Vector3(0, -50, 0), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: {} });
    b.buildDetached();
    m[id] = b;
  }
  return m[id] as T;
}

const THROWN: Record<string, { make: Maker; cover?: number; ratio?: number }> = {
  'spitter acid': { make: () => ({ color: 0x7dff3a, flightTime: 1.6, burst: 'goo', source: 'spitter' }), ratio: 2.2 },
  'dilo venom': {
    make: () => {
      const glob = new THREE.Group();
      Kit.add(glob, Kit.sphere(0.17, 8, 6), Kit.glow(0xa8f040, 1.35));
      Kit.add(glob, Kit.sphere(0.09, 6, 4), Kit.glow(0xe0ff80, 1.5), 0.13, 0.07, 0.04);
      Kit.add(glob, Kit.sphere(0.07, 6, 4), Kit.glow(0x88d020, 1.3), -0.11, -0.08, -0.05);
      return { flightTime: 1.5, arc: 0.9, color: 0xa8f040, size: 0.2, spin: 7, source: 'dilo', burst: 'goo', mesh: glob };
    },
    ratio: 2.4,
  },
  'Patient Zero bile': {
    make: () => {
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(Kit.ico(0.3, 1), Kit.glow(0xa6ff2a, 1.5)));
      mesh.add(new THREE.Mesh(Kit.ico(0.36, 0), Kit.mat(0x4a6a10, { transparent: true, opacity: 0.55 })));
      return { mesh, flightTime: 1.8, arc: 0.15, color: 0xa6ff2a, size: 0.36, spin: 5, source: 'PATIENT ZERO', burst: 'goo' };
    },
    ratio: 2,
  },
  'Butcher hook': { make: (w) => ({ mesh: boss<{ thrownHook: THREE.Mesh }>(w, 'butcher').thrownHook.clone(), size: 0.5, spin: 8, source: 'THE BUTCHER', burst: 'debris', color: 0x8a8f96, sfxDestroy: 'hit_armor' }), ratio: 2.4, cover: 0.8 },
  'Butcher barrel': { make: (w) => ({ mesh: boss<{ thrownBarrel: THREE.Mesh }>(w, 'butcher').thrownBarrel.clone(), size: 0.5, spin: 5, source: 'THE BUTCHER', burst: 'explode', color: 0xc22a20 }) },
  'Butcher door': { make: (w) => ({ mesh: boss<{ thrownDoor: THREE.Mesh }>(w, 'butcher').thrownDoor.clone(), size: 0.6, spin: 6, source: 'THE BUTCHER', burst: 'debris', color: 0xe8e8e0 }) },
  'Carnotaur boulder': { make: (w) => ({ mesh: boss<{ thrownRock(): THREE.Object3D }>(w, 'carnotaur').thrownRock(), size: 0.5, color: 0x8a7d6a, spin: 5, burst: 'debris', source: 'HORNED DEVIL' }), ratio: 1.9 },
  // (Comb fronds: leaflets with gaps over the 3D's solid frond boards — a shot in a gap still hits.)
  'Tyrant palm': { make: (w) => ({ mesh: boss<{ debrisMesh(k: number): THREE.Object3D }>(w, 'tyrant').debrisMesh(0), size: 0.55, color: 0x6e5d4a, spin: 4, burst: 'debris', source: 'THE TYRANT', sfxDestroy: 'wood_break' }), cover: 0.72 },
  'Tyrant rock': { make: (w) => ({ mesh: boss<{ debrisMesh(k: number): THREE.Object3D }>(w, 'tyrant').debrisMesh(1), size: 0.55, color: 0x8a7d6a, spin: 4, burst: 'debris', source: 'THE TYRANT' }), ratio: 1.9 },
  'Tyrant panel': { make: (w) => ({ mesh: boss<{ debrisMesh(k: number): THREE.Object3D }>(w, 'tyrant').debrisMesh(2), size: 0.55, color: 0x8a7d6a, spin: 4, burst: 'debris', source: 'THE TYRANT' }) },
  'falling branch': {
    make: () => {
      const g = new THREE.Group();
      Kit.add(g, Kit.cyl(0.13, 0.18, 1.7, 6), tx('bark', 0x7a6650, 1.5, 0.9), 0, 0, 0, Math.PI / 2, 0, 0.1);
      Kit.add(g, Kit.cone(0.55, 1.2, 5), tx('leaves', 0x4a7b42, 2, 0.8), 0, 0, 1.2, Math.PI / 2, 0, 0);
      Kit.add(g, Kit.sphere(0.2, 6, 4), Kit.glow(0xff8a30, 1.6), 0, 0, -0.85);
      return { mesh: g, size: 0.5, color: 0x6e5d4a, spin: 5, burst: 'debris', source: 'FALLING BRANCH', sfxDestroy: 'wood_break' };
    },
    ratio: 2.4,
    cover: 0.8,
  },
  'Behemoth car': {
    make: (w) => {
      const mesh = new THREE.Group();
      const c = car(w.rng, { color: 0x7a1c1c, lights: true });
      c.position.y = -0.7;
      mesh.add(c);
      bake(mesh);
      return { mesh, size: 1.3, spin: 2.6, source: 'THE BEHEMOTH', burst: 'explode', sfxDestroy: 'explosion' };
    },
  },
  'Behemoth slab': {
    make: () => {
      const mesh = new THREE.Group();
      Kit.add(mesh, Kit.box(2.2, 0.6, 1.6), Z3M.lam(0x8a847c, 'concrete', 0.8, 0.9), 0, 0, 0);
      Kit.add(mesh, Kit.cyl(0.05, 0.05, 1.2, 5), Z3M.lam(0x8a4a2a, 'metal', 1.4, 1), 0.8, 0.3, 0.5, 0.6, 0, 0.3);
      bake(mesh);
      return { mesh, size: 1.0, spin: 4, source: 'THE BEHEMOTH', burst: 'debris', sfxDestroy: 'crash' };
    },
  },
};

describe('PixelCast thrown things (painted, covering their hitboxes)', () => {
  for (const [name, spec] of Object.entries(THROWN)) {
    it(`${name}: tumbling in flight`, () => {
      const { world, camera } = makeWorld();
      const big = name.startsWith('Behemoth');
      const p = new Projectile(world, { from: new THREE.Vector3(0.8, 2.2, big ? -14 : -7), damage: 1, hp: 1, points: 100, ...spec.make(world) });
      world.add(p);
      const mesh = (p as unknown as { mesh: THREE.Object3D }).mesh;
      let n = 0;
      for (const [t, rx, ry] of [
        [0.15, 0.3, 0.2],
        [0.5, 1.4, 2.1],
        [0.85, 2.6, 4.2],
      ] as const) {
        for (let a = 0; a < t - (n ? [0.15, 0.5, 0.85][n - 1] : 0); a += 1 / 60) p.update(1 / 60);
        mesh.rotation.set(rx, ry, 0);
        n++;
        if (p.removed) break;
        expectCovered(check(world, camera, p), `${name} t${t}`, spec);
      }
    });
  }
});

// ─── Each real thrower → its look ────────────────────────────────────────────

/**
 * Thrown kinds are recognised from the thrower's options and mesh (a thrower may
 * also say `pixel:`). This table drives each REAL throw in the game (the bosses'
 * own throw methods, the spitters, the storm's falling branches) and checks the
 * look it gets — a colour / size / mesh tweak in a boss file that would silently
 * swap a look (a rock painted as a chunk) fails here instead.
 */
describe('PixelCast thrown kinds (every real thrower gets its intended look)', () => {
  type Dyn = Record<string, unknown>;
  /** Call a (private) method of the real thrower. */
  const call = (e: Dyn, m: string, ...a: unknown[]) => (e[m] as (...a: unknown[]) => unknown).apply(e, a);
  type Thrower = { id: string; want: string[]; fire: (e: Dyn) => void; detached?: boolean };
  const THROWERS: Record<string, Thrower> = {
    'z1 spitter acid': { id: 'spitter', want: ['glob'], fire: (e) => call(e, 'strike') },
    'd1 dilo venom': { id: 'dilo', want: ['glob'], fire: (e) => call(e, 'spit') },
    'z1 Butcher hook, drum, door': {
      id: 'butcher',
      want: ['hook', 'barrel', 'door'],
      detached: true,
      fire: (e) => {
        call(e, 'throwHook');
        e.heavyKind = 'barrel';
        call(e, 'throwHeavy');
        e.heavyKind = 'door';
        (e.propBarrel as THREE.Object3D).visible = false;
        call(e, 'throwHeavy');
      },
    },
    'z2 Patient Zero bile': { id: 'patient_zero', want: ['glob'], detached: true, fire: (e) => call(e, 'spitGlob') },
    'z3 Behemoth car, slab': {
      id: 'behemoth',
      want: ['car', 'slab'],
      detached: true,
      fire: (e) => {
        call(e, 'release', 'car');
        call(e, 'release', 'slab');
      },
    },
    'd1 Carnotaur boulder': { id: 'carnotaur', want: ['rock'], detached: true, fire: (e) => call(e, 'flingRock') },
    'd3 Tyrant palm, rock, panel': {
      id: 'tyrant',
      want: ['palm', 'rock', 'panel'],
      detached: true,
      fire: (e) => {
        const from = new THREE.Vector3(0.5, 2, -9);
        e.phase = 0;
        call(e, 'fling', from, 0);
        call(e, 'fling', from, 1);
        e.phase = 1;
        call(e, 'fling', from, 0);
      },
    },
  };
  for (const [name, t] of Object.entries(THROWERS)) {
    it(name, () => {
      const { world, camera } = makeWorld();
      const kinds: string[] = [];
      const f = new PixelFigure();
      const add = world.add.bind(world);
      world.add = (<T extends Entity>(e: T): T => {
        const r = add(e);
        if (e instanceof Projectile) {
          world.scene.updateMatrixWorld(true);
          f.begin(camera, GW, GH);
          e.paintPixels(f);
          kinds.push((e as unknown as { px: { kind: string } }).px.kind);
        }
        return r;
      }) as typeof world.add;
      const e = createEnemy(t.id, world, { pos: new THREE.Vector3(0.4, 0, -9), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: {} });
      if (t.detached) e.buildDetached();
      else world.add(e);
      e.root.position.set(0.4, 0, -9);
      e.root.lookAt(camera.position.x, 0, camera.position.z);
      world.scene.add(e.root);
      world.scene.updateMatrixWorld(true);
      t.fire(e as unknown as Dyn);
      expect(kinds, name).toEqual(t.want);
    });
  }
  it('d3 storm: falling burning branches', { timeout: 60_000 }, async () => {
    const { world, camera } = makeWorld();
    const kinds: string[] = [];
    const f = new PixelFigure();
    // The storm's own stage (its park env is what the hazard needs).
    const { ALL_STAGES } = await import('../../src/content/stages');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    new StageRunner(world, ALL_STAGES.find((st) => st.id === 'd3')!).start();
    const add = world.add.bind(world);
    world.add = (<T extends Entity>(e: T): T => {
      const r = add(e);
      if (e instanceof Projectile) {
        world.scene.updateMatrixWorld(true);
        f.begin(camera, GW, GH);
        e.paintPixels(f);
        kinds.push((e as unknown as { px: { kind: string } }).px.kind);
      }
      return r;
    }) as typeof world.add;
    const { lightningTree } = await import('../../src/content/stages/d3/hazards');
    world.update(1 / 60);
    // (Rig-relative [right, up, forward], as the stage calls it.)
    lightningTree(world, [-2, 4.5, 16], 2);
    for (let i = 0; i < 90; i++) world.update(1 / 60);
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['branch']));
  });
});
