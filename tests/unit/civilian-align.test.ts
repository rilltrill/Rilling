import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS, type HitPart } from '../../src/core/types';
import { Civilian, type CivPhase } from '../../src/gameplay/Civilian';
import type { Entity } from '../../src/gameplay/Entity';
import { PixelFigure, PART, MAX_PRIMS, MAX_LAYERS, type FigureSample } from '../../src/gameplay/pixel/figure';
import { CIV_STAMP, STAMP, stampReach } from '../../src/gameplay/pixel/stamps';
import { nullHud } from './sim';

/**
 * PixelCast alignment for every civilian pose (the act repertoire in
 * gameplay/Civilian.ts): the painted sprite must show what the hitboxes are —
 * the same check as pixelcast.test.ts (hitbox centres + a grid of screen points
 * against real raycasts through the same pixel), for each act, front-on and in
 * the three-quarter views they are seen in, plus the zombie holding a grabbed
 * civilian. Speech bubbles are drawn but never a target.
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
  aim(camera);
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
  conf: string;
  prims: number;
  bubbleTexels: number;
}

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const ray = new THREE.Raycaster();
const sample: FigureSample = { layer: -1, prim: -1, part: 0, mat: 0, depth: 0 };

function check(world: World, camera: THREE.PerspectiveCamera, e: Entity): Check {
  world.scene.updateMatrixWorld(true);
  aim(camera);
  const f = new PixelFigure();
  f.begin(camera, GW, GH);
  expect(e.paintPixels!(f)).toBe(true);
  expect(f.overflow).toBe(0);
  const prims = f.count;
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
  let both = 0;
  let either = 0;
  let agree = 0;
  let bubbleTexels = 0;
  const confusion: Record<string, number> = {};
  for (let y = 0.5; y < f.H; y += 2) {
    for (let x = 0.5; x < f.W; x += 2) {
      const px = f.ox + x * f.kpx;
      const py = f.oy + y * f.kpx;
      const want = shoot(new THREE.Vector2((px / GW) * 2 - 1, (py / GH) * 2 - 1));
      f.sample(x, y, sample);
      const got = sample.layer >= 0 ? sample.part : 0;
      if (sample.layer >= 0 && sample.part === PART.NONE && !want) bubbleTexels++;
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
  return { centres, centreHits, centreMiss, iou: both / Math.max(1, either), partAgree: agree / Math.max(1, both), conf, prims, bubbleTexels };
}

function expectAligned(c: Check, label: string) {
  const info = `${label} centres ${c.centreHits}/${c.centres} [${c.centreMiss.join(' ')}] iou ${c.iou.toFixed(2)} agree ${c.partAgree.toFixed(2)} (${c.conf})`;
  expect(c.centreMiss.filter((m) => m.endsWith('empty')), `${info}: hitbox centre on an empty texel`).toEqual([]);
  expect(c.centreMiss.filter((m) => m.includes('(head)')), `${info}: head hitbox centre not drawn as head`).toEqual([]);
  expect(c.centreHits / Math.max(1, c.centres), info).toBeGreaterThanOrEqual(0.75);
  expect(c.iou, `${info}: silhouette IoU`).toBeGreaterThan(0.72);
  expect(c.partAgree, `${info}: part agreement`).toBeGreaterThan(0.85);
  expect(c.prims, `${label} primitives`).toBeLessThanOrEqual(MAX_PRIMS);
}

function civ(world: World, variant: string, act: Civilian['act'], x = -0.3, z = -4.2): Civilian {
  const c = world.add(new Civilian(world, new THREE.Vector3(x, 0, z), 'world', variant, { act }));
  // (In plain view they'd run in from the edge: hold them on their spot.)
  c.debugPose('cower', 0);
  c.root.position.set(x, 0, z);
  return c;
}

/** Views (yaw from facing the camera) each act is seen in: cowering / pleading / thanking face the
 *  player (turned up to ~1 rad away), hiding shows its back, running, tripping and backing off any way. */
const FRONT = [0, 0.95, -0.95, 1.5, -1.5];
const REAR = [Math.PI, Math.PI + 0.6, Math.PI - 0.6, 1.5, -1.5];
const ALL = [0, 0.9, -0.9, 2.3, -2.3, Math.PI];

/** [phase, seconds into it, options, label, views]. */
const POSES: [CivPhase, number, Parameters<Civilian['debugPose']>[2], string, number[]][] = [
  ['arrive', 0.3, {}, 'running in', ALL],
  ['plead', 0.1, {}, 'HELP! calling, hand at the mouth, waving (key A)', FRONT],
  ['plead', 0.3, { bubble: CIV_STAMP.bubble.help }, 'HELP! with its bubble (key B)', FRONT],
  ['plead', 0.1, { far: true }, 'HELP! far off: the arm overhead', FRONT],
  ['startle', 0.05, {}, 'startled', FRONT],
  // (Cowering keeps three-quarters to the camera, turning as it moves: never seen from behind.)
  ['cower', 1.2, { peek: 0 }, 'cowering on one knee, hands on the head', FRONT],
  ['cower', 1.2, { peek: 0, flinch: true }, 'cowering, flinching', FRONT],
  ['cower', 1.7, { peek: 1 }, 'cowering, peeking out between the forearms', FRONT],
  ['cower', 1.7, { peek: 1, peekCam: true, bubble: CIV_STAMP.bubble.help }, 'cowering, calling HELP! to the player', FRONT],
  ['hide', 0.8, { peek: 0 }, 'hiding, braced, hand over the mouth', REAR],
  ['hide', 1.3, { peek: 1, glance: 1 }, 'hiding, peeking, glancing back', REAR],
  // (Backing away keeps within 0.7 rad of facing the camera: never seen from behind.)
  ['backaway', 0.6, {}, 'backing away, hand up at it', FRONT],
  ['backaway', 1.4, { bubble: CIV_STAMP.bubble.help }, 'backing away, HELP! over the shoulder', FRONT],
  ['fall', 0.15, {}, 'tripping backwards', ALL],
  ['fall', 0.6, {}, 'on the seat, scooting back', ALL],
  ['fall', 1.25, {}, 'rolling over', ALL],
  ['fall', 1.55, {}, 'scrambling up', ALL],
  ['flee', 0.4, { look: 0 }, 'running', ALL],
  ['flee', 0.7, { look: 1 }, 'running, looking back', ALL],
  ['stumble', 0.1, {}, 'tripping', ALL],
  ['stumble', 0.4, {}, 'on all fours', ALL],
  ['stumble', 0.7, {}, 'scrambling up', ALL],
  // (Rescued civilians — thanking, jogging off — have no hitboxes left; see below.)
  ['thanks', 0.6, { thumb: true, bubble: CIV_STAMP.bubble.thanks }, 'thumbs-up, THANKS!', FRONT],
  ['thanks', 0.7, { thumb: false }, 'waving thanks', FRONT],
];

describe('PixelCast alignment: civilian acts (sprite parts land on the hitboxes)', () => {
  for (const variant of ['worker', 'nurse', 'scientist', 'default', 'cop', 'ranger']) {
    it(`${variant}: every pose, in the views it is seen in`, { timeout: 60_000 }, () => {
      const { world, camera } = makeWorld();
      const c = civ(world, variant, 'cower');
      for (const [phase, t, o, label, views] of POSES) {
        for (const yaw of views) {
          // (Turned first: some gestures pick their hand by the side they're seen from.)
          c.root.rotation.y = Math.atan2(-c.root.position.x, -c.root.position.z) + yaw;
          c.debugPose(phase, t, o);
          expectAligned(check(world, camera, c), `${variant} ${label} (yaw ${yaw.toFixed(2)})`);
        }
      }
    });
  }

  it('stamp reach: every older stamp keeps the 8-cell reach (their figures lay out as before); bubbles reach further', () => {
    const old = [...STAMP.zeye, ...STAMP.leye, ...STAMP.seye, ...STAMP.reye, ...STAMP.zmouth.flat(), ...STAMP.lmouth.flat(), ...STAMP.hand.flat(2)];
    for (const id of old) expect(stampReach(id), `stamp ${id}`).toBe(8);
    for (const id of [...CIV_STAMP.teye, ...CIV_STAMP.heye, ...CIV_STAMP.qeye, ...CIV_STAMP.lmouth.flat()]) expect(stampReach(id)).toBe(8);
    expect(stampReach(CIV_STAMP.bubble.help)).toBeGreaterThan(8);
    expect(stampReach(CIV_STAMP.bubble.thanks)).toBeGreaterThan(stampReach(CIV_STAMP.bubble.help));
  });

  it('once rescued (thanking, jogging off) a civilian is no target at all', () => {
    const { world } = makeWorld();
    const c = civ(world, 'worker', 'cower');
    expect(world.shootables.objects.some((o) => (o.userData.shot as { owner: Entity } | undefined)?.owner === c)).toBe(true);
    c.rescue();
    expect(c.state).toBe('thanks');
    expect(world.shootables.objects.some((o) => (o.userData.shot as { owner: Entity } | undefined)?.owner === c)).toBe(false);
  });

  it('speech bubbles are drawn, on a layer of their own, and never count as a target', () => {
    const { world, camera } = makeWorld();
    const c = civ(world, 'nurse', 'cower', 0.2, -5);
    c.debugPose('plead', 0.8, { bubble: CIV_STAMP.bubble.help });
    const with_ = check(world, camera, c);
    expect(with_.bubbleTexels, 'bubble texels painted').toBeGreaterThan(40);
    c.debugPose('plead', 0.8, { bubble: -1 });
    const without = check(world, camera, c);
    expect(without.bubbleTexels).toBeLessThan(with_.bubbleTexels / 4);
    // (The bubble takes one primitive and one layer.)
    expect(with_.prims - without.prims).toBe(1);
    const f = new PixelFigure();
    f.begin(camera, GW, GH);
    c.debugPose('plead', 0.8, { bubble: CIV_STAMP.bubble.thanks });
    c.paintPixels(f);
    expect(f.layerIndex + 1).toBeLessThanOrEqual(MAX_LAYERS);
  });

  it('grabbed: the civilian and the zombie holding on both line up, mid-struggle and on a yank; its head stays the frontmost thing there', { timeout: 60_000 }, () => {
    const { world, camera } = makeWorld();
    const c = civ(world, 'nurse', 'grabbed', 0.9, -5.2);
    const g = c.holder!;
    expect(g).toBeTruthy();
    for (const [t, yank] of [
      [0.6, 0],
      [1.4, 1],
      [2.9, 0.5],
    ]) {
      for (let i = 0; i < 10; i++) {
        c.update(1 / 60);
        g.update(1 / 60);
      }
      c.debugPose('grabbed', t, { yank });
      g.update(0);
      expectAligned(check(world, camera, c), `grabbed civilian t=${t} yank ${yank}`);
      expectAligned(check(world, camera, g), `grabbing zombie t=${t} yank ${yank}`);
      // A shot through the zombie's head hits the zombie.
      world.scene.updateMatrixWorld(true);
      const h = g.headAnchor!.getWorldPosition(new THREE.Vector3());
      ray.setFromCamera(new THREE.Vector2().copy(h.clone().project(camera) as unknown as THREE.Vector2), camera);
      const hit = ray.intersectObjects(world.shootables.objects, false)[0];
      expect((hit?.object.userData.shot as { owner: Entity } | undefined)?.owner).toBe(g);
    }
  });
});
