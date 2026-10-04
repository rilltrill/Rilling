import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content/enemies/zombies';
import type { Beat, Environment, StageDef } from '../../src/gameplay/StageTypes';
import type { V3 } from '../../src/core/types';
import { simulateStage } from './sim';

function stage(beats: Beat[], mode: 'walk' | 'drive' = 'walk'): StageDef {
  const rail: V3[] = [];
  for (let i = 0; i <= 10; i++) rail.push([Math.sin(i * 0.4) * 4, 0, -i * 40]);
  return {
    id: 'tmpz',
    campaign: 'zombie',
    index: 0,
    name: 'TMP',
    rail,
    mode,
    beats,
    buildEnvironment(world): Environment {
      const root = new THREE.Group();
      world.scene.add(root);
      return { root };
    },
  };
}

describe('zombie roster in the stage simulator', () => {
  it('hold beats with every type and entry', () => {
    const s = stage([
      { kind: 'move', to: 10, speed: 3 },
      {
        kind: 'hold',
        waves: [
          { spawns: [{ type: 'walker', pos: [-3, 0, 12], count: 3, every: 0.5, offset: [3, 0, 1], opts: { variant: 'random' } }] },
          { spawns: [{ type: 'runner', pos: [-4, 0, 18], count: 2, every: 0.3, offset: [8, 0, 0] }, { type: 'runner', pos: [0, 0, 14], entry: 'leap' }] },
          { spawns: [{ type: 'crawler', pos: [-2, 0, 9], entry: 'rise' }, { type: 'crawler', pos: [2, 3, 8], entry: 'drop' }, { type: 'crawler', pos: [0, 0, 14] }] },
          { spawns: [{ type: 'spitter', pos: [-5, 0, 16] }, { type: 'spitter', pos: [5, 0, 20] }, { type: 'walker', pos: [0, 0, 10], entry: 'burst', opts: { variant: 'cop' } }] },
          { spawns: [{ type: 'bloater', pos: [-1, 0, 12] }, { type: 'walker', pos: [-2, 0, 13] }, { type: 'walker', pos: [0.5, 0, 13] }, { type: 'bloater', pos: [3, 0, 16] }] },
          { spawns: [{ type: 'brute', pos: [0, 0, 16] }, { type: 'walker', pos: [-3, 0, 10], entry: 'rise', count: 2, offset: [6, 0, 0], opts: { variant: 'soldier' } }] },
          { spawns: [{ type: 'brute', pos: [-3, 0, 14], entry: 'rise' }, { type: 'brute', pos: [3, 0, 14], entry: 'drop' }] },
        ],
      },
      { kind: 'move', to: 60, speed: 3.5 },
      {
        kind: 'hold',
        waves: [{ spawns: [{ type: 'crawler', pos: [0, 0, 16], count: 4, every: 0.6, offset: [1.5, 0, 0] }, { type: 'spitter', pos: [0, 0, 22] }] }],
      },
      { kind: 'boss', boss: 'brute', pos: [0, 0, 14] },
    ]);
    const r = simulateStage(s, { maxTime: 400 });
    console.log(JSON.stringify({ ...r, errors: r.errors.slice(0, 3) }));
    expect(r.errors).toEqual([]);
    expect(r.completed).toBe(true);
  });

  it('vehicle chase with rig-frame runners and walkers', () => {
    const s = stage(
      [
        {
          kind: 'move',
          to: 300,
          speed: 12,
          mode: 'drive',
          weapon: 'turret',
          waitClear: true,
          waves: [
            { spawns: [{ type: 'runner', pos: [-4, 0, -6], count: 3, every: 0.8, offset: [4, 0, 0] }] },
            { spawns: [{ type: 'runner', pos: [3, 0, 14], entry: 'leap' }, { type: 'walker', pos: [-3, 0, 12] }, { type: 'crawler', pos: [0, 0, 10] }], start: { after: 6 } },
            { spawns: [{ type: 'bloater', pos: [0, 0, 12] }, { type: 'spitter', pos: [4, 0, 16] }, { type: 'brute', pos: [-4, 0, 14] }], start: { after: 12 } },
          ],
        },
        { kind: 'boss', boss: 'walker', pos: [0, 0, 10] },
      ],
      'drive',
    );
    const r = simulateStage(s, { maxTime: 300 });
    console.log(JSON.stringify({ ...r, errors: r.errors.slice(0, 3) }));
    expect(r.errors).toEqual([]);
    expect(r.completed).toBe(true);
  });
});
