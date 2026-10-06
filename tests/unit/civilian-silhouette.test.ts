import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Civilian, type CivPhase } from '../../src/gameplay/Civilian';
import type { Entity } from '../../src/gameplay/Entity';
import type { HumanoidRig } from '../../src/content/kit/humanoid';
import { PixelFigure, PART, type FigureSample } from '../../src/gameplay/pixel/figure';
import { CIV_STAMP } from '../../src/gameplay/pixel/stamps';
import { nullHud } from './sim';

/**
 * What the calling-for-help gestures READ as on the phone, in ART: SPRITES at
 * gameplay distances (8, 12, 16 m on an 844×390 screen, one texel a pixel) —
 * the hitbox alignment (civilian-align) can pass while the silhouette is wrong:
 * an elbow lifted out to shoulder height with the forearm folded back to the
 * face paints, at 40-odd texels tall, as an arm held straight out (a T-pose).
 * For every HELP! (near, far / perched), calling peek and thanks pose, front-on
 * and in the three-quarter views they are seen in:
 *
 * - no arm out to the side: the widest painted row between the shoulders and
 *   the top of the head is at most 2.2× the shoulder width;
 * - no hand up over the head (≤ 2 texels above its top);
 * - the hand calling out is AT the mouth: arm texels within 2 texels of it;
 * - the sprite's silhouette matches the 3D body's (hitbox raycasts) there too.
 */

const W = 844;
const H = 390;
const GH = 390;
const GW = Math.round((GH * W) / H);

function makeWorld() {
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 7);
  world.viewport = { width: W, height: H };
  world.player.god = true;
  return { world, camera };
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const ray = new THREE.Raycaster();
const sample: FigureSample = { layer: -1, prim: -1, part: 0, mat: 0, depth: 0 };

interface Read {
  /** Widest painted row between the shoulders and the head top ÷ the shoulder width (texels). */
  wide: number;
  /** Texels any arm reaches above the top of the head. */
  over: number;
  /** Nearest arm texel to the mouth (texels). */
  mouth: number;
  /** Sprite vs 3D body silhouette. */
  iou: number;
}

function read(world: World, camera: THREE.PerspectiveCamera, c: Civilian): Read {
  world.scene.updateMatrixWorld(true);
  const rig = (c as unknown as { rig: HumanoidRig }).rig;
  const f = new PixelFigure();
  f.begin(camera, GW, GH);
  expect(c.paintPixels(f)).toBe(true);
  expect(f.layout(1, 24, 256)).toBe(true);
  const toT = (p: THREE.Vector3) => {
    _v.copy(p).project(camera);
    return [((_v.x * 0.5 + 0.5) * GW - f.ox) / f.kpx, ((_v.y * 0.5 + 0.5) * GH - f.oy) / f.kpx];
  };
  const part = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= f.W || y >= f.H) return -1;
    f.sample(Math.floor(x) + 0.5, Math.floor(y) + 0.5, sample);
    return sample.layer < 0 ? -1 : sample.part;
  };
  // Shoulder width (texels) at the chest's depth, whatever way it's turned.
  rig.chest.getWorldPosition(_a);
  const depth = -_a.applyMatrix4(camera.matrixWorldInverse).z;
  const focal = GH / 2 / Math.tan((camera.fov * Math.PI) / 360);
  const shoulderW = ((0.48 * rig.scale) / depth) * (focal / f.kpx);
  const [, ySh] = toT(rig.armL.shoulder.getWorldPosition(_a));
  const [, ySh2] = toT(rig.armR.shoulder.getWorldPosition(_b));
  const [, yTop] = toT(rig.head.localToWorld(_a.set(0, 0.27, 0)));
  const [mx, my] = toT(rig.head.localToWorld(_b.set(0, 0.062, 0.13)));
  let wide = 0;
  let over = 0;
  for (let y = 0; y < f.H; y++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = 0; x < f.W; x++) {
      const pt = part(x, y + 0.5);
      if (pt <= PART.NONE) continue;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
      if (pt === PART.LIMB && y > yTop) over = Math.max(over, y - yTop);
    }
    if (hi >= lo && y >= Math.min(ySh, ySh2) && y <= yTop) wide = Math.max(wide, hi - lo + 1);
  }
  let mouth = Infinity;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (part(mx + dx, my + dy) === PART.LIMB) mouth = Math.min(mouth, Math.hypot(dx, dy));
  // Silhouette vs the 3D body (its hitboxes are the body's boxes).
  const boxes = world.shootables.objects.filter((o) => (o.userData.shot as { owner: Entity } | undefined)?.owner === c);
  let both = 0;
  let either = 0;
  const ndc = new THREE.Vector2();
  for (let y = 0; y < f.H; y++) {
    for (let x = 0; x < f.W; x++) {
      const got = part(x + 0.5, y + 0.5) > PART.NONE;
      ndc.set(((f.ox + (x + 0.5) * f.kpx) / GW) * 2 - 1, ((f.oy + (y + 0.5) * f.kpx) / GH) * 2 - 1);
      ray.setFromCamera(ndc, camera);
      const want = ray.intersectObjects(boxes, false).length > 0;
      if (want || got) either++;
      if (want && got) both++;
    }
  }
  return { wide: wide / shoulderW, over, mouth, iou: both / Math.max(1, either) };
}

/** [phase, seconds, options, label, a hand calls at the mouth]. */
const POSES: [CivPhase, number, Parameters<Civilian['debugPose']>[2], string, boolean][] = [
  ['plead', 0.1, {}, 'HELP! (wave key A)', true],
  ['plead', 0.3, { bubble: CIV_STAMP.bubble.help }, 'HELP! (wave key B)', true],
  ['plead', 0.1, { far: true }, 'HELP! far off / perched (key A)', true],
  ['plead', 0.3, { far: true }, 'HELP! far off / perched (key B)', true],
  ['cower', 1.7, { peek: 1, peekCam: true, bubble: CIV_STAMP.bubble.help }, 'cowering, calling HELP!', true],
  ['cower', 1.7, { peek: 0.5, peekCam: true, bubble: CIV_STAMP.bubble.help }, 'cowering, coming up to call', false],
  ['thanks', 0.6, { thumb: false }, 'waving thanks (key A)', false],
  ['thanks', 0.8, { thumb: false }, 'waving thanks (key B)', false],
  ['thanks', 0.6, { thumb: true }, 'thumbs-up', false],
];
/** Yaw off facing the camera: square, the 3/4 turn they act in, and further round. */
const VIEWS = [0, 0.42, -0.42, 0.9, -0.9];

describe('civilian silhouettes at phone scale (ART: SPRITES): no T-pose, no hands over the head, the calling hand at the mouth', () => {
  for (const variant of ['default', 'scientist', 'cop']) {
    it(`${variant}: HELP!, calling, thanks at 8 / 12 / 16 m`, { timeout: 120_000 }, () => {
      for (const dist of [8, 12, 16]) {
        for (const side of [1, -1]) {
          const { world, camera } = makeWorld();
          const x = side * 0.22 * dist;
          const c = world.add(new Civilian(world, new THREE.Vector3(x, 0, -dist), 'world', variant, { act: 'cower' }));
          c.root.position.set(x, 0, -dist);
          camera.position.set(0, 1.62, 0);
          camera.lookAt(0, 1.1, -dist);
          camera.updateMatrixWorld();
          for (const [phase, t, o, label, calls] of POSES) {
            for (const yaw of VIEWS) {
              c.root.rotation.y = Math.atan2(-x, dist) + yaw;
              c.debugPose(phase, t, o);
              const r = read(world, camera, c);
              if (process.env.CIVSIL_LOG) console.log(`SIL ${variant} ${label} d${dist} s${side} y${yaw} wide ${r.wide.toFixed(2)} over ${r.over} mouth ${r.mouth.toFixed(1)} iou ${r.iou.toFixed(2)}`);
              const info = `${variant} ${label} ${dist} m x ${x.toFixed(1)} yaw ${yaw}: wide ${r.wide.toFixed(2)}× shoulders, ${r.over} texels over the head, mouth ${r.mouth.toFixed(1)}, iou ${r.iou.toFixed(2)}`;
              expect(r.wide, `${info} — an arm out to the side`).toBeLessThanOrEqual(2.2);
              expect(r.over, `${info} — a hand over the head`).toBeLessThanOrEqual(2);
              if (calls) expect(r.mouth, `${info} — no hand at the mouth`).toBeLessThanOrEqual(2);
              expect(r.iou, `${info} — sprite vs 3D silhouette`).toBeGreaterThan(0.6);
            }
          }
          world.dispose();
        }
      }
    });
  }
});
