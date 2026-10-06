import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { createEnemy } from '../../src/content/registry';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS, type HitPart } from '../../src/core/types';
import { Civilian } from '../../src/gameplay/Civilian';
import type { Entity, ShotHit } from '../../src/gameplay/Entity';
import type { Enemy } from '../../src/gameplay/Enemy';
import { PixelFigure, PART, sdRoundCone, sdTriangle, MAX_PRIMS, MAX_KPX, NEAR_CLIP, type FigureSample } from '../../src/gameplay/pixel/figure';
import { makeRamp, Mat, STEPS, materialTable } from '../../src/gameplay/pixel/materials';
import { nullHud } from './sim';

/**
 * PixelCast alignment: the painted sprite must show what the hitboxes are.
 * For sampled poses of each pilot character, every hitbox centre and a grid of
 * screen points is checked against a real raycast through the same pixel:
 * the part the sprite shows there (head / torso / limb / tail, or nothing) must
 * be the part a shot would hit.
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

function aim(camera: THREE.PerspectiveCamera) {
  camera.position.set(0, 1.62, 0);
  camera.lookAt(0, 1.15, -6);
  camera.updateMatrixWorld();
}

interface Check {
  centres: number;
  centreHits: number;
  centreMiss: string[];
  iou: number;
  partAgree: number;
  /** Most common disagreements (ray part → sprite part: count). */
  conf: string;
}

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const ray = new THREE.Raycaster();
const sample: FigureSample = { layer: -1, prim: -1, part: 0, mat: 0, depth: 0 };

/** Paint `e` with the main camera and compare sprite vs raycast at sampled points. */
function check(world: World, camera: THREE.PerspectiveCamera, e: Entity): Check {
  world.scene.updateMatrixWorld(true);
  aim(camera);
  const f = new PixelFigure();
  f.begin(camera, GW, GH);
  expect(e.paintPixels!(f)).toBe(true);
  expect(f.count).toBeLessThanOrEqual(MAX_PRIMS);
  expect(f.overflow).toBe(0);
  expect(f.layout(1, 24, 256)).toBe(true);
  const boxes = world.shootables.objects.filter((o) => (o.userData.shot as { owner: Entity } | undefined)?.owner === e);
  const toTexel = (p: THREE.Vector3) => {
    _v.copy(p).project(camera);
    const px = (_v.x * 0.5 + 0.5) * GW;
    const py = (_v.y * 0.5 + 0.5) * GH;
    return { tx: (px - f.ox) / f.kpx, ty: (py - f.oy) / f.kpx, ndc: new THREE.Vector2(_v.x, _v.y) };
  };
  const shoot = (ndc: THREE.Vector2): number => {
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(boxes, false);
    if (!hits.length) return 0;
    return PART_OF[(hits[0].object.userData.shot as { part: HitPart }).part];
  };
  // 1. Hitbox centres.
  let centres = 0;
  let centreHits = 0;
  const centreMiss: string[] = [];
  for (const b of boxes) {
    const m = b as THREE.Mesh;
    const wantPart = (b.userData.shot as { part: HitPart }).part;
    if (!m.geometry) continue;
    m.geometry.computeBoundingBox();
    _box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    const c = _box.getCenter(new THREE.Vector3());
    const t = toTexel(c);
    const want = shoot(t.ndc);
    if (!want) continue;
    centres++;
    f.sample(Math.floor(t.tx) + 0.5, Math.floor(t.ty) + 0.5, sample);
    if (sample.part === want) centreHits++;
    else centreMiss.push(`${PART_NAME[want]}(${wantPart})→${sample.layer < 0 ? 'empty' : PART_NAME[sample.part]}`);
  }
  // 2. Grid over the sprite: silhouette IoU and part agreement.
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
  return { centres, centreHits, centreMiss, iou: both / Math.max(1, either), partAgree: agree / Math.max(1, both), conf };
}

function hitOn(e: Enemy, obj: THREE.Object3D, part: HitPart, damage: number): ShotHit {
  const point = obj.getWorldPosition(new THREE.Vector3());
  const dir = point.clone().sub(new THREE.Vector3(0, 1.62, 0)).normalize();
  return { object: obj, part, point, normal: null, dir, distance: 4, damage, weapon: 'pistol', assisted: false, screenX: 400, screenY: 200 };
}

function spawn(world: World, id: string, x: number, z: number, opts: Record<string, unknown> = {}): Enemy {
  const e = createEnemy(id, world, { pos: new THREE.Vector3(x, 0, z), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts });
  world.add(e);
  return e;
}

function run(e: Entity, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) e.update(1 / 60);
}

function expectAligned(c: Check, label: string) {
  const info = `${label} centres ${c.centreHits}/${c.centres} [${c.centreMiss.join(' ')}] iou ${c.iou.toFixed(2)} agree ${c.partAgree.toFixed(2)}`;
  // Never a hitbox centre on an empty texel; a head centre always shows head (headshots are ×2.5).
  expect(c.centreMiss.filter((m) => m.endsWith('empty')), `${info}: hitbox centre on an empty texel`).toEqual([]);
  expect(c.centreMiss.filter((m) => m.includes('(head)')), `${info}: head hitbox centre not drawn as head`).toEqual([]);
  // Elsewhere only junctions may disagree (a thigh meeting the hips at the same depth…).
  expect(c.centreHits / Math.max(1, c.centres), info).toBeGreaterThanOrEqual(0.75);
  // The silhouettes match and the parts agree almost everywhere they overlap.
  expect(c.iou, `${label} silhouette IoU`).toBeGreaterThan(0.72);
  expect(c.partAgree, `${label} part agreement (${c.conf})`).toBeGreaterThan(0.85);
}

describe('PixelCast figures', () => {
  it('triangle distance is exact on simple cases', () => {
    // Right triangle (0,0) (4,0) (0,4).
    expect(sdTriangle(1, 1, 0, 0, 4, 0, 0, 4)).toBeCloseTo(-1, 5);
    expect(sdTriangle(-2, 1, 0, 0, 4, 0, 0, 4)).toBeCloseTo(2, 5);
    expect(sdTriangle(1, -3, 0, 0, 4, 0, 0, 4)).toBeCloseTo(3, 5);
  });

  it('round cone distance is exact on simple cases', () => {
    expect(sdRoundCone(0, 0, 0, 0, 10, 0, 2, 2)).toBeCloseTo(-2, 5);
    expect(sdRoundCone(5, 3, 0, 0, 10, 0, 2, 2)).toBeCloseTo(1, 5);
    expect(sdRoundCone(-3, 0, 0, 0, 10, 0, 2, 1)).toBeCloseTo(1, 5);
    expect(sdRoundCone(12, 0, 0, 0, 10, 0, 2, 1)).toBeCloseTo(1, 5);
    // Degenerate (one end swallows the other) is a disc.
    expect(sdRoundCone(0, 4, 0, 0, 0.5, 0, 3, 1)).toBeCloseTo(1, 5);
  });

  it('builds hue-shifted ramps and a material table', () => {
    const r = makeRamp(0x7a8c4e);
    expect(r).toHaveLength(STEPS);
    const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
    for (let i = 1; i < r.length; i++) expect(lum(r[i])).toBeGreaterThan(lum(r[i - 1]));
    const a = Mat.cloth(0x335577);
    expect(Mat.cloth(0x335577)).toBe(a);
    expect(Mat.cloth(0x335578)).not.toBe(a);
    const t = materialTable();
    expect(t.data[a * t.cols * 4 + 3]).toBe(255);
  });
});

describe('PixelCast alignment (sprite parts land on the hitboxes)', () => {
  for (const variant of ['office', 'worker', 'nurse']) {
    it(`walker ${variant}: walking, winding up, staggered, armless, dying`, () => {
      const { world, camera } = makeWorld();
      aim(camera);
      const e = spawn(world, 'walker', 0.4, -4.2, { variant });
      e.root.rotation.y = 0.35;
      run(e, 0.6);
      expectAligned(check(world, camera, e), `${variant} walk`);
      e.setState('windup');
      run(e, e.windup * 0.8);
      expectAligned(check(world, camera, e), `${variant} windup`);
      e.stagger();
      run(e, 0.12);
      expectAligned(check(world, camera, e), `${variant} stagger`);
      const z = e as unknown as { sever(side: number, whole: boolean, hit: ShotHit): void; r: { armL: { shoulder: THREE.Object3D } } };
      z.sever(1, true, hitOn(e, z.r.armL.shoulder, 'limb', 4));
      run(e, 0.3);
      expectAligned(check(world, camera, e), `${variant} armless`);
      e.root.rotation.y = 1.4;
      run(e, 0.05);
      expectAligned(check(world, camera, e), `${variant} side view`);
    });
  }

  it('walker dying (falls, still painted where the corpse is)', () => {
    const { world, camera } = makeWorld();
    const e = spawn(world, 'walker', -0.3, -5, { variant: 'office' });
    run(e, 0.3);
    e.onShot(hitOn(e, e.anchor, 'torso', 9));
    run(e, 0.25);
    // Hitboxes are unregistered on death; the sprite still follows the falling rig.
    world.scene.updateMatrixWorld(true);
    aim(camera);
    const f = new PixelFigure();
    f.begin(camera, GW, GH);
    expect(e.paintPixels!(f)).toBe(true);
    expect(f.layout(1, 24, 256)).toBe(true);
    const head = toNdc(camera, (e as unknown as { r: { head: THREE.Object3D } }).r.head, 0.13);
    const s2 = f.sample((((head.x * 0.5 + 0.5) * GW - f.ox) | 0) + 0.5, (((head.y * 0.5 + 0.5) * GH - f.oy) | 0) + 0.5);
    expect(s2.part).toBe(PART.HEAD);
  });

  it('runner: sprinting, winding up', () => {
    const { world, camera } = makeWorld();
    const e = spawn(world, 'runner', -0.4, -5, { variant: 'office' });
    run(e, 0.3);
    expectAligned(check(world, camera, e), 'runner run');
    e.setState('windup');
    run(e, e.windup * 0.7);
    expectAligned(check(world, camera, e), 'runner windup');
  });

  it('civilian worker calling for help', () => {
    const { world, camera } = makeWorld();
    const c = new Civilian(world, new THREE.Vector3(-0.3, 0, -4), 'world', 'worker');
    world.add(c);
    // (In plain view a civilian runs in from the edge: hold this one on the spot, calling out.)
    c.debugPose('plead', 0);
    c.root.position.set(-0.3, 0, -4);
    run(c, 0.4);
    expect(c.state).toBe('plead');
    expectAligned(check(world, camera, c), 'civilian');
  });

  for (const variant of ['tan', 'red']) {
    it(`raptor ${variant}: prowling, crouched, pouncing`, () => {
      const { world, camera } = makeWorld();
      const e = spawn(world, 'raptor', 0.5, -7, { variant });
      e.root.rotation.y = 1.2;
      run(e, 0.2);
      e.root.rotation.y = 1.2;
      run(e, 0.02);
      expectAligned(check(world, camera, e), `${variant} side`);
      e.root.rotation.y = 0.5;
      e.setState('windup');
      run(e, e.windup * 0.7);
      expectAligned(check(world, camera, e), `${variant} windup`);
      run(e, e.windup * 0.3 + 0.2);
      expectAligned(check(world, camera, e), `${variant} pounce`);
    });

    it(`raptor ${variant}: head-on pounce at the camera (the maw)`, () => {
      const { world, camera } = makeWorld();
      const e = spawn(world, 'raptor', 0.2, -6.5, { variant });
      run(e, 0.1);
      e.root.rotation.y = 0;
      e.setState('windup');
      run(e, e.windup * 0.9);
      e.root.rotation.y = 0;
      run(e, 0.02);
      expectAligned(check(world, camera, e), `${variant} head-on windup`);
      run(e, e.windup * 0.1 + 0.15);
      expectAligned(check(world, camera, e), `${variant} head-on pounce`);
    });
  }
});

describe('PixelCast alignment: the rest of the z1 / d1 rosters', () => {
  // [id, x, z, opts, yaw] — yaw 0.4 is a 3/4 front view; big quadrupeds are checked in a 3/4 side view.
  const cases: [string, number, number, Record<string, unknown>, number?][] = [
    ['crawler', 0.2, -4, {}],
    ['bloater', 0.3, -5.5, {}],
    ['spitter', -0.3, -6, {}],
    ['brute', 0.2, -7, {}],
    ['riot_z2', -0.2, -5, {}],
    ['compy', 0.2, -4, {}],
    ['dilo', 0.3, -7, {}],
    ['ptero', 0.3, -6, {}],
    ['trike', 0.5, -12, {}, 1.0],
  ];
  for (const [id, x, z, opts, yaw] of cases) {
    it(`${id}: advancing and winding up`, () => {
      const { world, camera } = makeWorld();
      const e = spawn(world, id, x, z, opts);
      e.root.rotation.y = yaw ?? 0.4;
      run(e, 0.3);
      expectAligned(check(world, camera, e), `${id} advance`);
      e.setState('windup');
      run(e, Math.min(e.windup * 0.7, 1));
      expectAligned(check(world, camera, e), `${id} windup`);
    });
  }
});

describe('PixelCast near the camera (no giant texels)', () => {
  it('a raptor whose tail sweeps past the lens keeps small texels', () => {
    const { world, camera } = makeWorld();
    const e = spawn(world, 'raptor', 0.35, -1.4, { variant: 'green' });
    run(e, 0.1);
    for (let i = 0; i <= 8; i++) {
      // Turn it so the tail swings from behind the camera, past its side, to the far side.
      e.root.rotation.y = Math.PI + (i / 8 - 0.5) * 2.4;
      e.root.position.set(0.35 + (i - 4) * 0.08, 0, -1.4);
      run(e, 0.02);
      world.scene.updateMatrixWorld(true);
      aim(camera);
      const f = new PixelFigure();
      f.begin(camera, GW, GH);
      expect(e.paintPixels!(f)).toBe(true);
      if (!f.layout(1, 24, 256)) continue;
      expect(f.kpx, `sweep ${i}`).toBeLessThanOrEqual(3);
      expect(f.W).toBeLessThanOrEqual(256);
      expect(f.H).toBeLessThanOrEqual(256);
      expect(f.minDepth).toBeGreaterThanOrEqual(NEAR_CLIP - 1e-6);
    }
  });

  it('mid-range figures are painted at one texel per pixel (hands and faces are stamps, not bounds)', () => {
    const { world, camera } = makeWorld();
    for (const id of ['walker', 'raptor']) {
      const e = spawn(world, id, 0.2, -5, id === 'walker' ? { variant: 'worker' } : {});
      run(e, 0.3);
      world.scene.updateMatrixWorld(true);
      aim(camera);
      const f = new PixelFigure();
      f.begin(camera, GW, GH);
      expect(e.paintPixels!(f)).toBe(true);
      expect(f.layout(1, 24, 256)).toBe(true);
      expect(f.kpx, id).toBe(1);
      expect(f.W, id).toBeLessThan(160);
      e.root.visible = false;
      world.shootables.removeOwner(e);
    }
  });

  it('a walker stepping in to 1 m stays a sprite with ≤ 3 px texels', () => {
    const { world, camera } = makeWorld();
    const e = spawn(world, 'walker', 0.1, -1.0, { variant: 'worker' });
    run(e, 0.3);
    e.root.position.set(0.1, 0, -1.0);
    world.scene.updateMatrixWorld(true);
    aim(camera);
    const f = new PixelFigure();
    f.begin(camera, GW, GH);
    expect(e.paintPixels!(f)).toBe(true);
    expect(f.layout(1, 24, 256)).toBe(true);
    expect(f.kpx).toBeLessThanOrEqual(MAX_KPX);
    // The head is still drawn as head right in front of the lens.
    const head = toNdc(camera, (e as unknown as { r: { head: THREE.Object3D } }).r.head, 0.13);
    const s2 = f.sample((((head.x * 0.5 + 0.5) * GW - f.ox) / f.kpx | 0) + 0.5, (((head.y * 0.5 + 0.5) * GH - f.oy) / f.kpx | 0) + 0.5);
    expect(s2.part).toBe(PART.HEAD);
  });
});

function toNdc(camera: THREE.Camera, obj: THREE.Object3D, y: number): THREE.Vector3 {
  return obj.localToWorld(new THREE.Vector3(0, y, 0)).project(camera);
}
