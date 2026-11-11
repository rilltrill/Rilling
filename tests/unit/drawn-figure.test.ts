import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { createEnemy } from '../../src/content/registry';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Civilian, type CivPhase } from '../../src/gameplay/Civilian';
import type { Enemy } from '../../src/gameplay/Enemy';
import { DrawnCast, newDrawnQuery, newDrawnSprite } from '../../src/gameplay/pixel/drawn/DrawnCast';
import { setCastLook } from '../../src/gameplay/pixel/look';
import { lodFor, makeFigureRenderer } from '../../src/gameplay/pixel/drawn/figure';
import { CIVBACK, CIVCOWER, CIVRUN, CIVSTAND, CIVWALK, ZDEATH, ZFALL, ZIDLE, ZLUNGE, ZSHAMBLE, ZSTAGGER, ZWINDUP } from '../../src/gameplay/pixel/drawn/poses';
import { FLANNEL, WORKER } from '../../src/gameplay/pixel/drawn/outfits';
import { HEADS, J, type PoseKey, type ViewId } from '../../src/gameplay/pixel/drawn/skeleton';
import { nullHud } from './sim';
import { drawnAim as check, drawnReport as report, type DrawnAimResult as Res } from './drawnAim';

/**
 * Aim fairness for drawn figures (castlook=d): the sprite is a 2D drawing anchored on the rig, the
 * rig stays the hitbox. Aiming at the drawn head must hit the head, at the drawn torso the torso
 * (strict), through the same projection the game uses. Arms are a drawing that does not follow the
 * rig's arm pose exactly: limbs are checked as "some part of the figure", not exactly.
 */

const W = 844;
const H = 390;

function makeWorld() {
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 7);
  world.viewport = { width: W, height: H };
  world.player.god = true;
  camera.position.set(0, 1.62, 0);
  camera.lookAt(0, 1.15, -6);
  camera.updateMatrixWorld();
  return { world, camera };
}

describe('drawn figures (aim)', () => {
  setCastLook('d');

  it('head and torso of the worker zombie line up with the rig, at every distance and view', () => {
    const rows: [string, Res][] = [];
    const dc = new DrawnCast(null);
    for (const dist of [3.2, 5, 9, 14]) {
      for (const yaw of [0, 25, 60, 90, 140, 180, -30, -100]) {
        const { world, camera } = makeWorld();
        const z = createEnemy('walker', world, { pos: new THREE.Vector3(0.6, 0, -dist), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: { variant: 'worker' } }) as Enemy;
        world.add(z);
        z.root.rotation.y = Math.atan2(-z.root.position.x, dist) + (yaw * Math.PI) / 180;
        const st = newDrawnSprite();
        for (let f = 0; f < 3; f++) {
          for (let i = 0; i < 9; i++) world.update(1 / 60);
          z.root.rotation.y = Math.atan2(-z.root.position.x, dist) + (yaw * Math.PI) / 180;
          rows.push([`walker d${dist} y${yaw} f${f} (${z.state})`, check(world, camera, z, dc, st)]);
        }
      }
    }
    const rep = report(rows);
    expect(rep.bad, JSON.stringify(rep.bad.slice(0, 20), null, 1)).toEqual([]);
  });

  it('windup, stagger: the head and torso stay fair', () => {
    const rows: [string, Res][] = [];
    const dc = new DrawnCast(null);
    for (const dist of [3.2, 6]) {
      for (const yaw of [0, 40]) {
        const { world, camera } = makeWorld();
        const z = createEnemy('walker', world, { pos: new THREE.Vector3(-0.5, 0, -dist), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: { variant: 'worker' } }) as Enemy;
        world.add(z);
        for (let i = 0; i < 40; i++) world.update(1 / 60);
        z.root.rotation.y = Math.atan2(-z.root.position.x, dist) + (yaw * Math.PI) / 180;
        z.setState('windup');
        const st = newDrawnSprite();
        for (const t of [0.2, 0.5, 0.8]) {
          for (let s = 0; s < t * z.windup * 60 && z.state === 'windup'; s++) z.update(1 / 60);
          if (z.state !== 'windup') continue;
          rows.push([`windup d${dist} y${yaw} ${t}`, check(world, camera, z, dc, st)]);
        }
      }
    }
    const rep = report(rows);
    expect(rep.bad, JSON.stringify(rep.bad.slice(0, 20), null, 1)).toEqual([]);
  });

  it('the civilian: running, cowering, pleading', () => {
    const rows: [string, Res][] = [];
    const dc = new DrawnCast(null);
    const phases: CivPhase[] = ['plead', 'cower', 'flee', 'hide', 'backaway'];
    for (const dist of [4, 8]) {
      for (const ph of phases) {
        for (const yaw of [0, 35, 90, 170]) {
          const { world, camera } = makeWorld();
          const c = new Civilian(world, new THREE.Vector3(-0.3, 0, -dist), 'world', 'worker', { act: 'plead' });
          world.add(c);
          c.root.rotation.y = Math.atan2(0.3, dist) + (yaw * Math.PI) / 180;
          c.debugPose(ph, 0.4);
          c.root.rotation.y = Math.atan2(0.3, dist) + (yaw * Math.PI) / 180;
          rows.push([`civ ${ph} d${dist} y${yaw}`, check(world, camera, c, dc, newDrawnSprite())]);
        }
      }
    }
    const rep = report(rows);
    expect(rep.bad, JSON.stringify(rep.bad.slice(0, 20), null, 1)).toEqual([]);
  });
});

describe('drawn figures (the neck)', () => {
  setCastLook('d');
  const limit = (st: { hx: number; hy: number; size: number; k: number }) => {
    const S = (st.size * st.k) / HEADS;
    // The vertical offset, in the same quantised units `place` stores: 0.2 hu up, 0.15 down, one quantum of rounding.
    return { up: 0.2 * S + (st.size >= 100 ? 2 : 1.5), down: 0.15 * S + (st.size >= 100 ? 2 : 1.5) };
  };

  it('a walker\'s head never leaves its neck, in any state or at any distance', () => {
    for (const dist of [3, 5, 8, 12]) {
      const { world, camera } = makeWorld();
      const z = createEnemy('walker', world, { pos: new THREE.Vector3(0.4, 0, -dist), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: { variant: 'worker' } }) as Enemy;
      world.add(z);
      for (let i = 0; i < 30; i++) world.update(1 / 60);
      const dc = new DrawnCast(null);
      const st = newDrawnSprite();
      const q = newDrawnQuery();
      for (const state of ['advance', 'windup', 'recover', 'stagger', 'dying'] as const) {
        z.setState(state);
        for (let f = 0; f < 10; f++) {
          world.update(1 / 60);
          world.scene.updateMatrixWorld(true);
          camera.updateMatrixWorld();
          expect(z.drawnFigure!(q), state).toBe(true);
          dc.beginFrame();
          const r = dc.place(camera, z.root, q, 720, 288, st);
          if (typeof r !== 'object') continue;
          const L = limit(st);
          expect(st.hy, `${state} @${dist} f${f}`).toBeLessThanOrEqual(L.up);
          expect(st.hy, `${state} @${dist} f${f}`).toBeGreaterThanOrEqual(-L.down);
        }
      }
    }
  });

  it('a civilian\'s head never leaves its neck, cowering included', () => {
    const phases: CivPhase[] = ['plead', 'cower', 'flee', 'hide', 'backaway', 'startle', 'stumble', 'leave', 'arrive'];
    for (const ph of phases) {
      const { world, camera } = makeWorld();
      const c = new Civilian(world, new THREE.Vector3(-0.3, 0, -4), 'world', 'worker', { act: 'plead' });
      world.add(c);
      const dc = new DrawnCast(null);
      const st = newDrawnSprite();
      const q = newDrawnQuery();
      for (let f = 0; f < 12; f++) {
        c.debugPose(ph, 0.05 + f * 0.08);
        world.scene.updateMatrixWorld(true);
        expect(c.drawnFigure!(q), ph).toBe(true);
        dc.beginFrame();
        const r = dc.place(camera, c.root, q, 720, 288, st);
        if (typeof r !== 'object') continue;
        const L = limit(st);
        expect(st.hy, `${ph} f${f}`).toBeLessThanOrEqual(L.up);
        expect(st.hy, `${ph} f${f}`).toBeGreaterThanOrEqual(-L.down);
      }
    }
  });
});

describe('drawn figures (the drawing)', () => {
  const r = makeFigureRenderer();
  const front = ZSHAMBLE.map((k) => {
    const sk = r.pose(k, 0);
    return { ankL: sk.sx[J.ankleL], ankR: sk.sx[J.ankleR], pelvis: sk.sx[J.pelvis], pelvisY: sk.sy[J.pelvis] };
  });
  const side = ZSHAMBLE.map((k) => {
    const sk = r.pose(k, 2);
    return { ankL: sk.sx[J.ankleL], ankR: sk.sx[J.ankleR], toeL: sk.sy[J.toeL], toeR: sk.sy[J.toeR] };
  });

  it('the front walk keeps the feet near the centre line and the weight over them', () => {
    for (const f of front) {
      expect(Math.abs(f.ankL)).toBeLessThan(0.52);
      expect(Math.abs(f.ankR)).toBeLessThan(0.52);
    }
    const px = front.map((f) => f.pelvis);
    expect(Math.max(...px) - Math.min(...px)).toBeGreaterThan(0.4);
  });

  it('the hips drop on contact and rise over the passing leg', () => {
    const py = front.map((f) => f.pelvisY);
    expect(Math.max(...py) - Math.min(...py)).toBeGreaterThan(0.18);
  });

  it('the toes stay on the street through the whole side-view cycle', () => {
    for (const f of side) {
      expect(f.toeL).toBeLessThan(0.16);
      expect(f.toeR).toBeLessThan(0.16);
    }
  });

  it('a stride crosses over several frames, not two', () => {
    const steps = side.map((f, i) => Math.abs(side[(i + 1) % side.length].ankR - f.ankR));
    expect(Math.max(...steps)).toBeLessThan(0.45);
  });

  /** The silhouette's outer width at a row (0..1 down), within ±1 head unit of the centre line, arms out of the way. */
  const widths = (def: typeof WORKER) => {
    const f = r.draw(def, { aL: [0, 110, 0], aR: [0, 110, 0], lL: [0, 2, 0], lR: [0, 2, 0] }, 0, 0, 180);
    const S = 180 / HEADS;
    const cx = Math.round(f.gx);
    const row = (y: number) => {
      let a = 1e9;
      let b = -1;
      for (let x = Math.max(0, cx - Math.round(S)); x < Math.min(f.w, cx + Math.round(S)); x++) {
        if (f.pixels[y * f.w + x]) {
          a = Math.min(a, x);
          b = Math.max(b, x);
        }
      }
      return b < 0 ? 0 : b - a + 1;
    };
    let hips = 0;
    let waist = 1e9;
    for (let y = Math.floor(f.h * 0.36); y < f.h * 0.46; y++) waist = Math.min(waist, row(y));
    for (let y = Math.floor(f.h * 0.46); y < f.h * 0.66; y++) hips = Math.max(hips, row(y));
    let inseam = f.h;
    for (let y = f.h - 1; y > f.h * 0.3; y--) {
      if (!f.pixels[y * f.w + cx]) inseam = y;
      else if (inseam !== f.h) break;
    }
    return { hips, waist, inseamUp: (f.h - inseam) / f.h };
  };

  it('a figure is built like a man, not a pear: hips measured at the widest row, inseam on the silhouette', () => {
    const w = widths(WORKER);
    expect(w.hips).toBeGreaterThanOrEqual(38);
    expect(w.hips).toBeLessThanOrEqual(41);
    expect(w.waist).toBeGreaterThanOrEqual(31);
    expect(w.waist).toBeLessThan(w.hips);
    const c = widths(FLANNEL);
    expect(c.hips).toBeLessThanOrEqual(41);
    expect(c.waist).toBeGreaterThanOrEqual(29);
    // (Canon: the crotch at mid-height. The 180-texel silhouette opens within the two-texel row of 46 to 50 %.)
    expect(w.inseamUp).toBeGreaterThan(0.45);
    expect(w.inseamUp).toBeLessThan(0.5);
  });

  it('the front walk has a stride: boots apart, the leading one lower than the trailing one', () => {
    for (const [def, F, min] of [
      [WORKER, ZSHAMBLE, 8],
      [FLANNEL, CIVWALK, 6],
    ] as const) {
      let clear = 0;
      let soles = 0;
      for (let i = 0; i < F.length; i++) {
        r.draw(def, F, i, 0, 180);
        const c = r.canvas;
        const a = [1e9, -1, -1];
        const b = [1e9, -1, -1];
        for (let y = c.y0; y <= c.y1; y++) {
          for (let x = c.x0; x <= c.x1; x++) {
            const g = c.group[y * c.w + x];
            const t = g === 3 ? a : g === 4 ? b : null;
            if (!t) continue;
            t[0] = Math.min(t[0], x);
            t[1] = Math.max(t[1], x);
            t[2] = Math.max(t[2], y);
          }
        }
        if (Math.max(a[0], b[0]) - Math.min(a[1], b[1]) - 1 >= 0) clear++;
        soles = Math.max(soles, Math.abs(a[2] - b[2]));
      }
      expect(clear, `${def.name}: frames with the boots apart`).toBeGreaterThanOrEqual(min);
      expect(soles, `${def.name}: sole offset`).toBeGreaterThanOrEqual(7);
    }
  });

  it('backing away never crosses the feet (the side view keeps two legs)', () => {
    for (const k of CIVBACK) {
      const sk = r.pose(k, 2);
      expect(Math.abs(sk.sx[J.ankleL] - sk.sx[J.ankleR])).toBeGreaterThan(0.59);
    }
  });

  it('the front corpse is a body seen from its feet: a person wide, not a starfish', () => {
    const f = r.draw(WORKER, ZDEATH, ZDEATH.length - 1, 0, 180);
    expect(f.w).toBeLessThanOrEqual(90);
    expect(f.h).toBeLessThanOrEqual(82);
    expect(f.h).toBeGreaterThanOrEqual(68);
  });

  it('far figures are one connected shape (no pixels floating off a hat, a hand or a boot)', () => {
    const parts = (f: ReturnType<typeof r.draw>) => {
      const seen = new Uint8Array(f.w * f.h);
      let n = 0;
      for (let i = 0; i < f.w * f.h; i++) {
        if (!f.pixels[i] || seen[i]) continue;
        n++;
        const st = [i];
        seen[i] = 1;
        while (st.length) {
          const k = st.pop()!;
          const x = k % f.w;
          for (const m of [x > 0 ? k - 1 : -1, x < f.w - 1 ? k + 1 : -1, k - f.w, k + f.w, x > 0 ? k - f.w - 1 : -1, x < f.w - 1 ? k - f.w + 1 : -1, x > 0 ? k + f.w - 1 : -1, x < f.w - 1 ? k + f.w + 1 : -1]) {
            if (m >= 0 && m < f.w * f.h && f.pixels[m] && !seen[m]) {
              seen[m] = 1;
              st.push(m);
            }
          }
        }
      }
      return n;
    };
    const cases: [typeof WORKER, readonly PoseKey[]][] = [
      [WORKER, ZIDLE],
      [WORKER, ZSHAMBLE],
      [WORKER, ZWINDUP],
      [FLANNEL, CIVSTAND],
      [FLANNEL, CIVRUN],
      [FLANNEL, CIVCOWER],
    ];
    const bad: string[] = [];
    for (const [def, F] of cases) {
      for (let i = 0; i < F.length; i++) {
        for (const v of [0, 1, 2, 3, 4] as ViewId[]) {
          for (const sz of [24, 30, 40, 50, 60, 70, 80, 90]) {
            const f = r.draw(def, F, i, v, sz);
            const p = parts(f);
            if (p !== 1) bad.push(`${def.name} ${F.indexOf(F[i])} v${v} @${sz}: ${p} parts`);
          }
        }
      }
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('every pose stays a body: the head is on the neck for all key frames and views', () => {
    // Direct joint check: the head joint never sits below the shoulder line except in a lying pose.
    const all: [string, readonly PoseKey[]][] = [['zidle', ZIDLE], ['zshamble', ZSHAMBLE], ['zwindup', ZWINDUP], ['zstagger', ZSTAGGER], ['zlunge', ZLUNGE], ['zfall', ZFALL], ['civstand', CIVSTAND], ['civrun', CIVRUN], ['civwalk', CIVWALK], ['civback', CIVBACK]];
    for (const [name, F] of all) {
      for (const k of F) {
        for (const v of [0, 1, 2, 3, 4] as ViewId[]) {
          const sk = r.pose(k, v);
          const neck = sk.sy[J.neck];
          expect(sk.sy[J.head] - neck, `${name} v${v}`).toBeGreaterThan(0.25);
        }
      }
    }
  });

  it('the level of detail holds near a threshold', () => {
    expect(lodFor(11.2, 0)).toBe(0);
    expect(lodFor(10.8, 1)).toBe(1);
    expect(lodFor(12, 0)).toBe(1);
    expect(lodFor(10, 1)).toBe(0);
  });
});
