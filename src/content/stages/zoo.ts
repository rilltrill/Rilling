import * as THREE from 'three';
import type { V3 } from '../../core/types';
import type { Beat, Environment, StageDef, WaveDef } from '../../gameplay/StageTypes';
import { EnvKit } from '../kit/EnvKit';
import { Kit } from '../kit/ModelKit';

/**
 * Developer arena: `?stage=zoo&zoo=walker,runner,brute` spawns the listed enemy
 * ids (or a boss id) in a lit test arena so models/animations/AI can be
 * inspected and screenshotted in isolation. Add `&zooEnv=night` for darkness,
 * `&zooDrive=1` to test enemies chasing a moving rig, `&zooBoss=butcher` for a boss.
 */
export function zooStage(params: URLSearchParams): StageDef {
  const types = (params.get('zoo') ?? 'walker').split(',').filter(Boolean);
  const night = params.get('zooEnv') === 'night';
  const drive = params.get('zooDrive') === '1';
  const boss = params.get('zooBoss');
  const rail: V3[] = [];
  for (let i = 0; i <= 12; i++) rail.push([Math.sin(i * 0.4) * 6, 0, -i * 50]);
  const waves: WaveDef[] = [];
  const positions: V3[] = [
    [-4, 0, 14],
    [4, 0, 15],
    [0, 0, 18],
    [-7, 0, 20],
    [7, 0, 20],
  ];
  for (let w = 0; w < 3; w++) {
    waves.push({
      spawns: types.map((type, i) => ({ type, pos: positions[i % positions.length], t: i * 0.6, entry: drive ? 'walk' : undefined })),
    });
  }
  const beats: Beat[] = [{ kind: 'banner', text: 'ZOO', sub: types.join(' · '), duration: 1 }];
  if (drive) {
    beats.push({ kind: 'move', to: 500, speed: 12, mode: 'drive', weapon: 'turret', waves: waves.map((w, i) => ({ ...w, start: { after: i * 8 } })) });
  } else {
    beats.push({ kind: 'hold', waves });
  }
  if (boss) {
    beats.push({ kind: 'boss', boss, pos: drive ? [0, 0, -18] : [0, 0, 22], moveTo: drive ? 600 : undefined, speed: 12, look: drive ? { yaw: 180 } : undefined });
  }
  return {
    id: 'zoo',
    campaign: 'zombie',
    index: 0,
    name: 'ZOO',
    rail,
    mode: drive ? 'drive' : 'walk',
    weapon: drive ? 'turret' : null,
    beats,
    buildEnvironment(world, curve): Environment {
      const root = new THREE.Group();
      const bg = night ? 0x0d1220 : 0xa9c7d8;
      world.scene.background = new THREE.Color(bg);
      world.scene.fog = new THREE.Fog(bg, 25, 140);
      EnvKit.lights(root, {
        sky: night ? 0x8090c0 : 0xe8f4ff,
        ground: night ? 0x303040 : 0x556644,
        hemi: night ? 1.2 : 1.6,
        sun: 0xfff2dd,
        sunIntensity: night ? 0.8 : 2.2,
      });
      root.add(EnvKit.ground(900, night ? 0x2b2f38 : 0x6b7d58, 0, -300));
      root.add(EnvKit.ribbon(curve, 10, Kit.mat(night ? 0x3a3d46 : 0x9a9080)));
      const grid = new THREE.GridHelper(900, 180, 0x000000, 0x000000);
      (grid.material as THREE.Material).opacity = 0.12;
      (grid.material as THREE.Material).transparent = true;
      Kit.track(grid.geometry);
      Kit.track(grid.material as THREE.Material);
      grid.position.set(0, 0.02, -300);
      root.add(grid);
      world.scene.add(root);
      return { root, surface: 'concrete' };
    },
  };
}
