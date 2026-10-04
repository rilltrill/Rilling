import * as THREE from 'three';
import type { CampaignId, V3 } from '../../core/types';
import type { Beat, Environment, StageDef } from '../../gameplay/StageTypes';
import { EnvKit } from '../kit/EnvKit';
import { Kit } from '../kit/ModelKit';

/**
 * Minimal stage used as a stand-in until a stage module is fully authored.
 * Straight-ish rail, flat ground, fog, a few boxes, three encounters.
 */
export function placeholderStage(
  id: string,
  campaign: CampaignId,
  index: number,
  name: string,
  enemy: string,
  mode: 'walk' | 'drive' = 'walk',
): StageDef {
  const rail: V3[] = [
    [0, 0, 0],
    [0, 0, -30],
    [6, 0, -60],
    [0, 0, -90],
    [0, 0, -120],
  ];
  const beats: Beat[] = [
    { kind: 'banner', text: name, sub: `STAGE ${index + 1}`, duration: 2 },
    { kind: 'move', to: 20, speed: mode === 'drive' ? 10 : 3.2 },
    {
      kind: 'hold',
      label: 'first contact',
      waves: [
        { spawns: [{ type: enemy, pos: [-3, 0, 14] }, { type: enemy, pos: [3, 0, 16], t: 0.6 }] },
        { spawns: [{ type: enemy, pos: [0, 0, 18], count: 3, every: 0.8, offset: [2, 0, 0] }] },
      ],
      pickups: [{ kind: 'shotgun', pos: [4, 1.2, 9] }],
    },
    { kind: 'move', to: 70, speed: mode === 'drive' ? 12 : 3.5 },
    {
      kind: 'hold',
      label: 'ambush',
      civilians: [{ pos: [1.5, 0, 9] }],
      waves: [{ spawns: [{ type: enemy, pos: [-4, 0, 12], count: 4, every: 0.5, offset: [2.5, 0, 1] }] }],
      pickups: [{ kind: 'health', pos: [-3, 1.2, 7] }],
    },
    { kind: 'move', to: 110, speed: mode === 'drive' ? 12 : 3.5 },
  ];
  return {
    id,
    campaign,
    index,
    name,
    tagline: 'Placeholder stage',
    rail,
    mode,
    beats,
    buildEnvironment(world, curve): Environment {
      const root = new THREE.Group();
      const night = campaign === 'zombie';
      world.scene.background = new THREE.Color(night ? 0x0b0f1a : 0x9fc4a8);
      world.scene.fog = new THREE.Fog(night ? 0x0b0f1a : 0x9fc4a8, 12, 90);
      EnvKit.lights(root, {
        sky: night ? 0x6070a0 : 0xd8f0ff,
        ground: night ? 0x202018 : 0x3a5030,
        hemi: night ? 0.7 : 1.2,
        sun: night ? 0x8090c0 : 0xfff0d0,
        sunIntensity: night ? 0.6 : 1.6,
      });
      root.add(EnvKit.ground(400, night ? 0x2a2a2e : 0x4f7a3a, 0, -60));
      root.add(EnvKit.ribbon(curve, 8, Kit.mat(night ? 0x3a3a40 : 0x8a7350)));
      const props = new THREE.Group();
      EnvKit.scatterAlong(props, curve, {
        spacing: 9,
        lateral: [7, 12],
        seed: 3,
        place: (rng) => {
          const g = new THREE.Group();
          const h = rng.range(3, 9);
          Kit.add(g, Kit.box(4, h, 4), Kit.mat(night ? 0x3d3f48 : 0x2f5a2a), 0, h / 2, 0);
          return g;
        },
      });
      EnvKit.mergeStatic(props);
      root.add(props);
      world.scene.add(root);
      return { root, surface: night ? 'concrete' : 'dirt' };
    },
  };
}
