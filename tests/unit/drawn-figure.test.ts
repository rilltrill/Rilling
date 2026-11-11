import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { createEnemy } from '../../src/content/registry';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Civilian, type CivPhase } from '../../src/gameplay/Civilian';
import type { Enemy } from '../../src/gameplay/Enemy';
import { DrawnCast, newDrawnSprite } from '../../src/gameplay/pixel/drawn/DrawnCast';
import { setCastLook } from '../../src/gameplay/pixel/look';
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
