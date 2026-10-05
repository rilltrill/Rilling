import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { createEnemy } from '../../src/content/registry';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS, type HitPart } from '../../src/core/types';
import type { Entity } from '../../src/gameplay/Entity';
import type { Enemy } from '../../src/gameplay/Enemy';
import { PixelFigure, PART, PF, MAX_PRIMS, MAX_WIDE, PRIM_FLOATS, PRIM_LAYOUT, type FigureSample } from '../../src/gameplay/pixel/figure';
import { Mat, material } from '../../src/gameplay/pixel/materials';
import { nullHud } from './sim';

/**
 * PixelCast alignment for the DEAD ZONE bosses painted in content/pixel/bossesZombie.ts
 * (Patient Zero, the Behemoth): in every sampled pose / attack / phase the painted sprite
 * must show what the hitboxes are — each hitbox centre shows the part a real raycast through
 * that pixel hits (eyes, heart, glowing tips, wound and skull as WEAK; ribs, hat, rebar as
 * ARMOR), the silhouettes overlap and the parts agree almost everywhere.
 */

const GH = 288;
const W = 844;
const H = 390;
const GW = Math.round((GH * W) / H);

const PART_NAME = ['none', 'head', 'torso', 'limb', 'tail', 'weak', 'armor'];
const PART_OF: Record<HitPart, number> = { head: PART.HEAD, torso: PART.TORSO, limb: PART.LIMB, tail: PART.TAIL, weak: PART.WEAK, armor: PART.ARMOR, body: PART.TORSO };

function makeWorld() {
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 7);
  world.viewport = { width: W, height: H };
  world.player.god = true;
  return { world, camera };
}

interface Check {
  centres: number;
  centreHits: number;
  centreMiss: string[];
  iou: number;
  partAgree: number;
  conf: string;
  prims: number;
  weakShown: number;
}

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const ray = new THREE.Raycaster();
const sample: FigureSample = { layer: -1, prim: -1, part: 0, mat: 0, depth: 0 };

/** Paint `e` seen from `eye` looking at `look`, compare sprite parts with raycasts. */
function check(world: World, camera: THREE.PerspectiveCamera, e: Entity, eye: THREE.Vector3, look: THREE.Vector3): Check {
  world.scene.updateMatrixWorld(true);
  camera.position.copy(eye);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  const f = new PixelFigure();
  f.begin(camera, GW, GH);
  expect(e.paintPixels!(f)).toBe(true);
  expect(f.count).toBeLessThanOrEqual(MAX_PRIMS);
  expect(f.overflow, 'primitive table overflow').toBe(0);
  const prims = f.count;
  expect(f.layout(1, 24, 256)).toBe(true);
  const boxes = world.shootables.active().filter((o) => (o.userData.shot as { owner: Entity } | undefined)?.owner === e);
  const toTexel = (p: THREE.Vector3) => {
    _v.copy(p).project(camera);
    const px = (_v.x * 0.5 + 0.5) * GW;
    const py = (_v.y * 0.5 + 0.5) * GH;
    return { tx: (px - f.ox) / f.kpx, ty: (py - f.oy) / f.kpx, ndc: new THREE.Vector2(_v.x, _v.y), z: _v.z };
  };
  let firstHit: THREE.Object3D | null = null;
  const shoot = (ndc: THREE.Vector2): number => {
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(boxes, false);
    firstHit = hits.length ? hits[0].object : null;
    if (!hits.length) return 0;
    return PART_OF[(hits[0].object.userData.shot as { part: HitPart }).part];
  };
  let centres = 0;
  let centreHits = 0;
  let weakShown = 0;
  const centreMiss: string[] = [];
  for (const b of boxes) {
    const m = b as THREE.Mesh;
    const wantPart = (b.userData.shot as { part: HitPart }).part;
    if (!m.geometry) continue;
    m.geometry.computeBoundingBox();
    _box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    const t = toTexel(_box.getCenter(new THREE.Vector3()));
    if (t.z > 1 || Math.abs(t.ndc.x) > 1 || Math.abs(t.ndc.y) > 1) continue;
    const want = shoot(t.ndc);
    if (!want) continue;
    centres++;
    f.sample(Math.floor(t.tx) + 0.5, Math.floor(t.ty) + 0.5, sample);
    if (sample.part === want) {
      centreHits++;
      if (want === PART.WEAK) weakShown++;
    } else {
      // (`!` = the ray's first hit there is this very hitbox — e.g. an eye seen at its own centre.)
      const own = firstHit === b ? '!' : '';
      centreMiss.push(`${PART_NAME[want]}(${wantPart}${own})→${sample.layer < 0 ? 'empty' : PART_NAME[sample.part]}`);
    }
  }
  let both = 0;
  let either = 0;
  let agree = 0;
  const confusion: Record<string, number> = {};
  for (let y = 0.5; y < f.H; y += 2) {
    for (let x = 0.5; x < f.W; x += 2) {
      const px = f.ox + x * f.kpx;
      const py = f.oy + y * f.kpx;
      const ndc = new THREE.Vector2((px / GW) * 2 - 1, (py / GH) * 2 - 1);
      const want = shoot(ndc);
      f.sample(x, y, sample);
      const got = sample.layer >= 0 ? sample.part : 0;
      if (want || got) either++;
      if (want && got) {
        both++;
        if (want === got) agree++;
        else {
          const k = `${PART_NAME[want]}→${PART_NAME[got]}`;
          confusion[k] = (confusion[k] ?? 0) + 1;
        }
      }
    }
  }
  const conf = Object.entries(confusion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
  return { centres, centreHits, centreMiss, iou: both / Math.max(1, either), partAgree: agree / Math.max(1, both), conf, prims, weakShown };
}

function expectAligned(c: Check, label: string) {
  const info = `${label} prims ${c.prims} centres ${c.centreHits}/${c.centres} [${c.centreMiss.join(' ')}] iou ${c.iou.toFixed(2)} agree ${c.partAgree.toFixed(2)} (${c.conf})`;
  // (BOSSZ_REPORT=file: append each case's numbers there — look-dev / reports.)
  if (process.env.BOSSZ_REPORT) appendFileSync(process.env.BOSSZ_REPORT, `${label}: prims ${c.prims}, centres ${c.centreHits}/${c.centres}, iou ${c.iou.toFixed(2)}, agree ${c.partAgree.toFixed(2)}\n`);
  // Never a hitbox centre on an empty texel; a weak point seen at its own centre is drawn as weak
  // (the eyes' invisible fat-finger hit spheres reach past the drawn eye — there the flesh may show).
  expect(c.centreMiss.filter((m) => m.endsWith('empty')), `${info}: hitbox centre on an empty texel`).toEqual([]);
  expect(c.centreMiss.filter((m) => m.startsWith('weak(weak!)')), `${info}: weak point not drawn as weak`).toEqual([]);
  expect(c.centreHits / Math.max(1, c.centres), info).toBeGreaterThanOrEqual(0.8);
  expect(c.iou, `${info}: silhouette IoU`).toBeGreaterThan(0.72);
  expect(c.partAgree, `${info}: part agreement`).toBeGreaterThan(0.85);
}

function spawn(world: World, id: string, pos: THREE.Vector3): Enemy {
  const e = createEnemy(id, world, { pos, frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: {} });
  world.add(e);
  return e;
}

function run(e: Entity, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) e.update(1 / 60);
}

/** Paint `e` seen from `eye` looking at `look` (no layout yet). */
function paintAt(world: World, camera: THREE.PerspectiveCamera, e: Entity, eye: THREE.Vector3, look: THREE.Vector3): PixelFigure {
  world.scene.updateMatrixWorld(true);
  camera.position.copy(eye);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  const f = new PixelFigure();
  f.begin(camera, GW, GH);
  f.time = world.time;
  expect(e.paintPixels!(f)).toBe(true);
  return f;
}

/** Sample the laid-out figure at world point `p`. */
function sampleAt(f: PixelFigure, camera: THREE.PerspectiveCamera, p: THREE.Vector3): FigureSample {
  const q = p.clone().project(camera);
  f.sample(Math.floor(((q.x * 0.5 + 0.5) * GW - f.ox) / f.kpx) + 0.5, Math.floor(((q.y * 0.5 + 0.5) * GH - f.oy) / f.kpx) + 0.5, sample);
  return sample;
}

/** Motion-smear streaks in a laid-out figure (flat, part-less solids): their lengths in texels. */
function smears(f: PixelFigure): number[] {
  const out: number[] = [];
  for (let i = 0; i < f.count; i++) {
    const fl = f.get(i, 'flags');
    if (f.get(i, 'part') !== PART.NONE || !(fl & PF.FLAT) || fl & PF.DECAL) continue;
    out.push(Math.hypot(f.get(i, 'bx') - f.get(i, 'ax'), f.get(i, 'by') - f.get(i, 'ay')));
  }
  return out;
}

/** Private boss fields / methods the tests drive (JS has no privacy; TS needs the cast). */
type Any = Record<string, unknown> & { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('PixelCast alignment: Patient Zero (z2 boss)', () => {
  const EYE = new THREE.Vector3(0, 1.62, 0);
  const LOOK = new THREE.Vector3(0, 2.6, -13);

  function pz() {
    const { world, camera } = makeWorld();
    const e = spawn(world, 'patient_zero', new THREE.Vector3(0, 0, -13));
    e.root.rotation.y = 0;
    run(e, 4.2);
    return { world, camera, e, b: e as unknown as Any };
  }

  it('emerged and idle, then seen from the side', () => {
    const { world, camera, e } = pz();
    expect(e.state).toBe('idle');
    const c = check(world, camera, e, EYE, LOOK);
    expectAligned(c, 'pz idle');
    expect(c.weakShown, 'eyes drawn as weak').toBeGreaterThanOrEqual(5);
    e.root.rotation.y = 0.6;
    run(e, 0.05);
    expectAligned(check(world, camera, e, EYE, LOOK), 'pz 3/4 view');
  });

  it('attacks: bile spit windup (maw open), armed tentacle slam (glowing tip = weak) and the strike', () => {
    const { world, camera, e, b } = pz();
    b.volley = 2;
    b.spat = 0;
    e.setState('spit');
    run(e, 0.95);
    expectAligned(check(world, camera, e, EYE, LOOK), 'pz spit windup');
    e.setState('idle');
    b.nextAttack = 99;
    run(e, 0.6);
    b.beginSlam();
    run(e, 1.0);
    expect(e.state).toBe('slam');
    const c = check(world, camera, e, EYE, LOOK);
    expectAligned(c, 'pz slam armed');
    // The armed tip is a weak point and drawn as one.
    const tip = (b.slamTent as { pustule: THREE.Mesh }).pustule;
    world.scene.updateMatrixWorld(true);
    const f = new PixelFigure();
    f.begin(camera, GW, GH);
    e.paintPixels!(f);
    f.layout(1, 24, 256);
    const p = tip.getWorldPosition(new THREE.Vector3()).project(camera);
    f.sample(Math.floor(((p.x * 0.5 + 0.5) * GW - f.ox) / f.kpx) + 0.5, Math.floor(((p.y * 0.5 + 0.5) * GH - f.oy) / f.kpx) + 0.5, sample);
    expect(sample.part).toBe(PART.WEAK);
    // Strike (the tentacle whips down in front of the player).
    run(e, 0.75);
    expectAligned(check(world, camera, e, EYE, LOOK), 'pz slam strike');
  });

  it('phases: rib cage cracked open (heart exposed = weak), frenzy, a burst eye', () => {
    const { world, camera, e, b } = pz();
    e.hp = e.maxHp * 0.6;
    b.phase = 1;
    b.pendingPhase = 1;
    e.setState('roar');
    run(e, 2.3);
    expect(b.heartExposed).toBe(true);
    const c = check(world, camera, e, EYE, LOOK);
    expectAligned(c, 'pz ribs open');
    b.pendingPhase = 0;
    b.phase = 2;
    e.hp = e.maxHp * 0.3;
    e.setState('idle');
    b.nextAttack = 99;
    run(e, 0.8);
    expectAligned(check(world, camera, e, EYE, LOOK), 'pz frenzy');
    // Worst case for the primitive table: frenzy veins + an armed tentacle's charge vein.
    b.beginSlam();
    run(e, 1.0);
    const worst = check(world, camera, e, EYE, LOOK);
    expectAligned(worst, 'pz frenzy slam armed');
    // (Gameplay parts are emitted first: an overflow would drop cosmetics — and there is headroom.)
    expect(worst.prims).toBeLessThanOrEqual(140);
    e.setState('idle');
    b.nextAttack = 99;
    run(e, 0.3);
    b.burstEye((b.eyes as unknown[])[0]);
    run(e, 0.1);
    expectAligned(check(world, camera, e, EYE, LOOK), 'pz burst eye');
  });

  it('the roar spreads the tentacles past the 256-texel cap: the wide paint class keeps 1 texel per pixel', () => {
    const { world, camera, e, b } = pz();
    e.hp = e.maxHp * 0.6;
    b.phase = 1;
    b.pendingPhase = 1;
    e.setState('roar');
    let widest = 0;
    for (let i = 0; i < 6; i++) {
      run(e, 0.4);
      const f = paintAt(world, camera, e, EYE, LOOK);
      expect(f.layout(1, 24, 256)).toBe(true);
      expect(f.kpx, `texel size ${(i + 1) * 0.4} s into the roar`).toBe(1);
      expect(f.W).toBeLessThanOrEqual(MAX_WIDE);
      if (f.W > widest && f.W > 256) {
        // (A figure that doesn't opt in grows its texels at the cap.)
        const g = paintAt(world, camera, e, EYE, LOOK);
        g.maxWide = 0;
        g.layout(1, 24, 256);
        expect(g.kpx).toBe(2);
      }
      widest = Math.max(widest, f.W);
    }
    expect(widest, 'the roar is wider than the 256 cap (the case the wide class is for)').toBeGreaterThan(256);
  });

  it('hit flashes are latched: a flash that began between redraws shows on the next redraw only (eye red, body brighter)', () => {
    const { world, camera, e, b } = pz();
    const fleshId = material('pz|flesh', () => {
      throw new Error('painter material missing');
    });
    const fleshTone = (f: PixelFigure) => {
      let m = -9;
      for (let i = 0; i < f.count; i++) if (f.get(i, 'mat') === fleshId && !(f.get(i, 'flags') & PF.DECAL)) m = Math.max(m, f.data[i * PRIM_FLOATS + PRIM_LAYOUT.TONE]);
      return m;
    };
    const base = fleshTone(paintAt(world, camera, e, EYE, LOOK));
    // A critical hit on the big eye flashed after that redraw — and was over (0.06 s) before the next.
    const eye = (b.eyes as { mesh: THREE.Mesh; hit: THREE.Mesh }[])[0];
    run(e, 0.02);
    b.lastHit = { object: eye.hit, part: 'weak' };
    b.lastFlash = e.age;
    run(e, 0.07);
    let f = paintAt(world, camera, e, EYE, LOOK);
    f.layout(1, 24, 256);
    expect(sampleAt(f, camera, eye.mesh.getWorldPosition(new THREE.Vector3())).mat, 'latched red flash on the eye').toBe(Mat.glow(0xff3020));
    run(e, 0.08);
    f = paintAt(world, camera, e, EYE, LOOK);
    f.layout(1, 24, 256);
    expect(sampleAt(f, camera, eye.mesh.getWorldPosition(new THREE.Vector3())).mat, 'one redraw only').not.toBe(Mat.glow(0xff3020));
    // A body hit (the belly): the flesh layers brighten for one redraw.
    const belly = (b.fleshMeshes as THREE.Mesh[]).find((m) => m.parent === b.torso)!;
    run(e, 0.01);
    b.lastHit = { object: belly, part: 'torso' };
    b.lastFlash = e.age;
    run(e, 0.02);
    expect(fleshTone(paintAt(world, camera, e, EYE, LOOK)) - base, 'body flash').toBeGreaterThanOrEqual(0.3);
    run(e, 0.08);
    expect(fleshTone(paintAt(world, camera, e, EYE, LOOK)) - base).toBeLessThan(0.05);
  });

  it('death: convulsing, heart ruptured, sinking into the pool (still painted)', () => {
    const { world, camera, e } = pz();
    e.die(null);
    run(e, 1.6);
    world.scene.updateMatrixWorld(true);
    camera.position.copy(EYE);
    camera.lookAt(LOOK);
    camera.updateMatrixWorld();
    const f = new PixelFigure();
    f.begin(camera, GW, GH);
    expect(e.paintPixels!(f)).toBe(true);
    expect(f.overflow).toBe(0);
    expect(f.layout(1, 24, 256)).toBe(true);
  });
});

describe('PixelCast alignment: the Behemoth (z3 boss)', () => {
  // The truck camera looks back at the giant (eye ~2.6 m up, slight upward pitch).
  const EYE = new THREE.Vector3(0, 2.6, 0);
  const LOOK = new THREE.Vector3(0, 4.4, -15);

  function behemoth() {
    const { world, camera } = makeWorld();
    const e = spawn(world, 'behemoth', new THREE.Vector3(0, 0, -15));
    run(e, 5.0);
    return { world, camera, e, b: e as unknown as Any };
  }
  /** Stand it in front of the camera (the pose comes from the joints, the place is free). */
  function place(e: Enemy, yaw = 0, z = -15) {
    e.root.position.set(0, 0, z);
    e.root.rotation.set(0, yaw, 0);
    e.root.updateMatrixWorld(true);
  }

  it('lumbering run: front and 3/4 views', () => {
    const { world, camera, e, b } = behemoth();
    expect(b.bs).toBe('chase');
    place(e);
    const c = check(world, camera, e, EYE, LOOK);
    expectAligned(c, 'behemoth run');
    expect(c.weakShown, 'core / eyes / skull drawn as weak').toBeGreaterThanOrEqual(3);
    place(e, 0.7);
    expectAligned(check(world, camera, e, EYE, LOOK), 'behemoth 3/4');
    place(e, -1.2);
    expectAligned(check(world, camera, e, EYE, LOOK), 'behemoth side');
  });

  it('attacks: car hauled back to throw (car = weak), double-fist slam windup, the slam', () => {
    const { world, camera, e, b } = behemoth();
    b.go('grab');
    run(e, 1.3);
    expect(b.bs).toBe('throwWind');
    place(e);
    expectAligned(check(world, camera, e, EYE, LOOK), 'behemoth throw windup (car)');
    b.holding = null;
    b.heldCar.visible = false;
    b.go('slamWind');
    run(e, 1.0);
    place(e);
    expectAligned(check(world, camera, e, EYE, LOOK), 'behemoth slam windup');
    run(e, 0.6);
    place(e);
    expectAligned(check(world, camera, e, EYE, LOOK), 'behemoth slam');
  });

  it('phase 2: concrete slab, lamp-post club windup; phase 3: hot core, swipe windup; staggered', () => {
    const { world, camera, e, b } = behemoth();
    b.phase = 1;
    b.roared = 1;
    b.pendingRoar = 1;
    b.attacks = 2;
    b.go('grab');
    run(e, 1.3);
    expect(b.holding).toBe('slab');
    place(e);
    expectAligned(check(world, camera, e, EYE, LOOK), 'behemoth slab windup');
    b.holding = null;
    b.heldSlab.visible = false;
    b.hasClub = true;
    b.club.visible = true;
    b.go('clubWind');
    run(e, 1.3);
    place(e, 0.3, -12);
    expectAligned(check(world, camera, e, EYE, LOOK), 'behemoth club windup');
    b.phase = 2;
    b.roared = 2;
    b.pendingRoar = 2;
    b.go('swipeWind');
    run(e, 1.0);
    place(e, 0, -12);
    expectAligned(check(world, camera, e, EYE, LOOK), 'behemoth swipe windup (hot core)');
    b.go('reel');
    run(e, 0.8);
    place(e);
    expectAligned(check(world, camera, e, EYE, LOOK), 'behemoth staggered');
  });

  it('smears only on swings, measured against the body: a 6 m jump of the giant draws none, a wild swing is clamped', () => {
    const { world, camera, e, b } = behemoth();
    b.go('swipe');
    run(e, 0.05);
    place(e);
    paintAt(world, camera, e, EYE, LOOK);
    // The whole giant jumps 6 m sideways between redraws (a placement jump, the rig, a leap): no smear.
    run(e, 0.02);
    place(e);
    e.root.position.x += 6;
    let f = paintAt(world, camera, e, EYE, LOOK);
    f.layout(1, 24, 256);
    expect(smears(f), 'no smear for a body move').toEqual([]);
    // A wild swing (the arm flung through 2 rad between redraws): smeared, at most 20 texels.
    run(e, 0.02);
    place(e);
    e.root.position.x += 6;
    paintAt(world, camera, e, EYE, LOOK);
    run(e, 0.06);
    place(e);
    e.root.position.x += 6;
    (b.shR as THREE.Object3D).rotation.x += 2;
    f = paintAt(world, camera, e, EYE, LOOK);
    f.layout(1, 24, 256);
    const sm = smears(f);
    expect(sm.length, 'a swing smears').toBeGreaterThan(0);
    for (const l of sm) expect(l, 'smear length (texels)').toBeLessThanOrEqual(20.5);
    // Running (not a swing): never smeared, however the hands move.
    b.go('chase');
    run(e, 0.02);
    place(e);
    paintAt(world, camera, e, EYE, LOOK);
    run(e, 0.06);
    place(e);
    (b.shR as THREE.Object3D).rotation.x += 2;
    f = paintAt(world, camera, e, EYE, LOOK);
    f.layout(1, 24, 256);
    expect(smears(f)).toEqual([]);
  });

  it('death: staggering, then toppling (still painted, no overflow)', () => {
    const { world, camera, e } = behemoth();
    e.die(null);
    for (const t of [1.0, 1.4]) {
      run(e, t);
      world.scene.updateMatrixWorld(true);
      camera.position.copy(e.root.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 2.6, 15));
      camera.lookAt(e.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 3, 0)));
      camera.updateMatrixWorld();
      const f = new PixelFigure();
      f.begin(camera, GW, GH);
      expect(e.paintPixels!(f)).toBe(true);
      expect(f.overflow).toBe(0);
      expect(f.layout(1, 24, 256)).toBe(true);
    }
  });
});
