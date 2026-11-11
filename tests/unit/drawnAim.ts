import * as THREE from 'three';
import type { World } from '../../src/gameplay/World';
import type { HitPart } from '../../src/core/types';
import type { Entity } from '../../src/gameplay/Entity';
import { DrawnCast, newDrawnQuery, type DrawnSprite } from '../../src/gameplay/pixel/drawn/DrawnCast';
import { PART } from '../../src/gameplay/pixel/figure';
import { expect } from 'vitest';

/**
 * Aim checks for drawn figures (castlook=d), shared by the alignment tests: where the sprite draws
 * the head / torso, a real raycast must hit the head / torso of the rig (the hitbox), and the
 * hitbox centres must land on drawn body. See `drawnReport` for what is strict.
 */

const GH = 288;
const GW = Math.round((288 * 844) / 390);
const PART_OF: Record<HitPart, number> = { head: PART.HEAD, torso: PART.TORSO, limb: PART.LIMB, tail: PART.TAIL, weak: PART.WEAK, armor: PART.ARMOR, body: PART.TORSO };

const ray = new THREE.Raycaster();

export interface DrawnAimResult {
  hRay: string;
  tRay: string;
  headPart: number;
  torsoPart: number;
  headCount: number;
  torsoCount: number;
}

export function drawnAim(world: World, camera: THREE.PerspectiveCamera, e: Entity, dc: DrawnCast, st: DrawnSprite): DrawnAimResult {
  world.scene.updateMatrixWorld(true);
  camera.position.set(0, 1.62, 0);
  camera.lookAt(0, 1.15, -6);
  camera.updateMatrixWorld();
  const q = newDrawnQuery();
  expect(e.drawnFigure!(q), 'figure drawn').toBe(true);
  dc.beginFrame();
  const r = dc.place(camera, e.root, q, GW, GH, st);
  expect(typeof r, 'placed').toBe('object');
  const map = dc.debugParts(st.def!, st.pose!, st.view, st.size, st.hx, st.hy, st.flags);
  const boxes = world.shootables.objects.filter((o) => (o.userData.shot as { owner: Entity } | undefined)?.owner === e);
  // Retro px of a sprite texel centre.
  const spX = (col: number) => st.left + (col + 0.5) * st.k;
  const spY = (row: number) => st.bottom + (map.h - row - 0.5) * st.k;
  const shoot1 = (x: number, y: number): string => {
    ray.setFromCamera(new THREE.Vector2((x / GW) * 2 - 1, (y / GH) * 2 - 1), camera);
    const hits = ray.intersectObjects(boxes, false);
    if (!hits.length) return 'miss';
    return String((hits[0].object.userData.shot as { part: HitPart }).part);
  };
  // A small target: one retro pixel either way of the aim point still counts (the sprite grid is a 1-pixel rounding of the rig).
  const shoot = (x: number, y: number): string => {
    const c = shoot1(x, y);
    if (c !== 'miss' && c !== 'limb') return c;
    for (let i = 0; i < 4; i++) {
      const c2 = shoot1(x + (i === 0 ? 1.5 : i === 1 ? -1.5 : 0), y + (i === 2 ? 1.5 : i === 3 ? -1.5 : 0));
      if (c2 !== 'miss' && c2 !== 'limb') return c2;
    }
    return c;
  };
  const col = (i: number) => (st.mirror ? map.w - 1 - i : i);
  let hc = 0,
    hx = 0,
    hy = 0,
    tc = 0,
    tx = 0,
    ty = 0;
  for (let j = 0; j < map.h; j++) {
    for (let i = 0; i < map.w; i++) {
      const p = map.part[j * map.w + col(i)];
      if (p === PART.HEAD) {
        hc++;
        hx += i;
        hy += j;
      } else if (p === PART.TORSO) {
        tc++;
        tx += i;
        ty += j;
      }
    }
  }
  // Nearest drawn texel of that part to its centroid, as scripts/pixel-aim.mjs does.
  // (Texels near a drawn limb are not the aim point: where the arm lies over the torso, both hits are fair.)
  const clearOfLimb = (i: number, j: number, r: number) => {
    for (let y = j - r; y <= j + r; y++) {
      for (let x = i - r; x <= i + r; x++) {
        if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
        if (map.part[y * map.w + col(x)] === PART.LIMB) return false;
      }
    }
    return true;
  };
  const nearestOf = (part: number, cx: number, cy: number) => {
    let bd = Infinity;
    let bx = 0;
    let by = 0;
    for (let pass = 0; pass < 2 && bd === Infinity; pass++) for (let j = 0; j < map.h; j++) {
      for (let i = 0; i < map.w; i++) {
        if (map.part[j * map.w + col(i)] !== part) continue;
        if (pass === 0 && !clearOfLimb(i, j, Math.max(1, Math.round(map.h / 40)))) continue;
        const d = (i - cx) ** 2 + (j - cy) ** 2;
        if (d < bd) {
          bd = d;
          bx = i;
          by = j;
        }
      }
    }
    return [bx, by] as const;
  };
  const [nx, ny] = hc ? nearestOf(PART.HEAD, hx / hc, hy / hc) : [0, 0];
  const hRay = hc ? shoot(spX(nx), spY(ny)) : 'no head drawn';
  const [mx, my] = tc ? nearestOf(PART.TORSO, tx / tc, ty / tc) : [0, 0];
  const tRay = tc ? shoot(spX(mx), spY(my)) : 'no torso drawn';
  // The other way: where the hitboxes project, what is drawn?
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  const drawnAt = (want: HitPart): number => {
    let best = 0;
    for (const b of boxes) {
      const shot = b.userData.shot as { part: HitPart };
      if (PART_OF[shot.part] !== PART_OF[want]) continue;
      const m = b as THREE.Mesh;
      m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      box.getCenter(v).project(camera);
      const px = (v.x * 0.5 + 0.5) * GW;
      const py = (v.y * 0.5 + 0.5) * GH;
      const i = Math.floor((px - st.left) / st.k);
      const j = map.h - 1 - Math.floor((py - st.bottom) / st.k);
      if (i >= 0 && j >= 0 && i < map.w && j < map.h) {
        const p = map.part[j * map.w + col(i)];
        if (p === PART_OF[want]) return p;
        best = p || best;
      }
    }
    return best;
  };
  return { hRay, tRay, headPart: drawnAt('head'), torsoPart: drawnAt('torso'), headCount: hc, torsoCount: tc };
}

/**
 * Head strict everywhere (it is never under an arm unless the rig's is too: the civilian's cower, a
 * `covered` case). Torso strict in front and back views; in 3/4 and side views a sample can land on
 * the rig's own arm, which crosses the torso there in the rig as in the drawing (reported, not hidden).
 */
export function drawnReport(rows: [string, DrawnAimResult][]) {
  let limbTorso = 0;
  const bad = rows.filter(([l, r]) => {
    const side = / y(35|40|60|90|-100|-30|140)/.test(l) || / y(25)/.test(l);
    const cover = /cower|hide/.test(l);
    if (cover) return false;
    if (r.hRay !== 'head') return true;
    if (r.tRay === 'limb' && side) {
      limbTorso++;
      return false;
    }
    if (!/torso|body/.test(r.tRay)) return true;
    return r.headPart === 0;
  });
  console.warn(`aim: ${rows.length} checks, ${limbTorso} torso samples landed on the rig's arm in 3/4 or side views`);
  return { n: rows.length, bad: bad.map(([l, r]) => `${l}: head→${r.hRay} torso→${r.tRay} headDraw=${r.headPart} torsoDraw=${r.torsoPart}`) };
}

