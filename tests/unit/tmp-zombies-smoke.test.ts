import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { createEnemy } from '../../src/content/registry';
import '../../src/content/enemies/zombies';
import type { Enemy } from '../../src/gameplay/Enemy';
import type { ShotTag } from '../../src/gameplay/Shootables';
import type { EntryKind } from '../../src/core/types';
import { nullHud } from './sim';
import { Kit } from '../../src/content/kit/ModelKit';

function makeWorld() {
  const camera = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
  const w = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 7);
  w.viewport = { width: 844, height: 390 };
  w.player.god = true;
  w.rig.setPath([
    [0, 0, 0],
    [0, 0, -100],
  ]);
  return w;
}

function step(w: World, secs: number) {
  const dt = 1 / 30;
  for (let t = 0; t < secs; t += dt) {
    w.update(dt);
    w.scene.updateMatrixWorld();
  }
}

function meshCount(e: Enemy) {
  let n = 0;
  let vis = 0;
  e.model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      n++;
      let p: THREE.Object3D | null = o;
      let v = true;
      while (p) {
        if (!p.visible) v = false;
        p = p.parent;
      }
      if (v) vis++;
    }
  });
  return { n, vis };
}

function shoot(w: World, e: Enemy, part?: string, damage = 1) {
  const objs = w.shootables.active().filter((o) => (o.userData.shot as ShotTag).owner === e && (!part || (o.userData.shot as ShotTag).part === part));
  if (!objs.length) return null;
  const o = objs[Math.floor(w.rng.next() * objs.length)];
  const point = o.getWorldPosition(new THREE.Vector3());
  const tag = o.userData.shot as ShotTag;
  return e.onShot({
    object: o,
    part: tag.part,
    point,
    normal: null,
    dir: new THREE.Vector3(0, 0, -1),
    distance: 5,
    damage,
    weapon: 'pistol',
    assisted: false,
    screenX: 0,
    screenY: 0,
  });
}

const TYPES = ['walker', 'runner', 'crawler', 'brute', 'spitter', 'bloater'];
const ENTRIES: EntryKind[] = ['walk', 'rise', 'drop', 'leap', 'burst'];

describe('zombie roster smoke', () => {
  for (const type of TYPES) {
    it(`${type}: all entries, hits, deaths`, () => {
      const w = makeWorld();
      const stats: string[] = [];
      for (const entry of ENTRIES) {
        for (const frame of ['world', 'rig'] as const) {
          const pos = frame === 'rig' ? new THREE.Vector3(1, entry === 'drop' ? 3 : 0, -10) : new THREE.Vector3(1, entry === 'drop' ? 3 : 0, -10);
          const e = createEnemy(type, w, { pos, frame, entry, hpMul: 1, speedMul: 1, opts: { variant: 'random' } });
          w.add(e);
          const mc = meshCount(e);
          stats.push(`${entry}/${frame}: meshes=${mc.n} visible=${mc.vis} hp=${e.maxHp}`);
          expect(mc.vis).toBeLessThanOrEqual(26);
          step(w, 3);
          // limb hits (sever), then kill
          for (let i = 0; i < 6 && e.state !== 'dying'; i++) shoot(w, e, 'limb', 1);
          step(w, 0.3);
          let guard = 0;
          while (e.state !== 'dying' && !e.removed && guard++ < 60) {
            shoot(w, e, guard % 3 === 0 ? 'head' : undefined, 1);
            step(w, 0.1);
          }
          expect(e.state === 'dying' || e.removed).toBe(true);
          step(w, 4);
          expect(e.removed).toBe(true);
        }
      }
      // Let a few attack the player.
      for (let i = 0; i < 3; i++) {
        const e = createEnemy(type, w, { pos: new THREE.Vector3(i - 1, 0, -6), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: {} });
        w.add(e);
      }
      step(w, 20);
      const hurt = w.player.damageTaken;
      stats.push(`damageTaken after 20s with 3 ${type}s: ${hurt}`);
      console.log(type, '\n  ' + stats.join('\n  '));
      expect(hurt).toBeGreaterThan(0);
      w.dispose();
      Kit.disposeAll();
    });
  }
});
