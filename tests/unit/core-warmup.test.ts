/** Shader warm-up (perf-1): prototypes of everything a stage spawns, built without side effects. */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import { ALL_STAGES } from '../../src/content';
import { buildWarmupSet, stageRoster } from '../../src/gameplay/Warmup';
import { nullHud } from './sim';

describe('shader warm-up set', () => {
  for (const id of ['z1', 'd1']) {
    it(`${id}: builds every enemy type / pickup without touching the stage`, { timeout: 60_000 }, () => {
      const stage = ALL_STAGES.find((s) => s.id === id)!;
      const roster = stageRoster(stage);
      const boss = stage.beats.find((b) => b.kind === 'boss');
      expect(boss && roster.enemies.has(boss.boss)).toBe(true);
      expect(roster.pickups.size).toBeGreaterThan(0);

      const cam = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
      const w = new World(cam, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 5);
      const runner = new StageRunner(w, stage);
      runner.start();
      let bossStarts = 0;
      w.events.on('boss-start', () => bossStarts++);
      const rng = w.rng.state;
      const sceneKids = w.scene.children.length;
      const rigKids = w.rig.space.children.length;
      const shootables = w.shootables.objects.length;
      const ents = w.entities.length;

      const set = buildWarmupSet(w, stage);
      expect(set.count).toBeGreaterThanOrEqual(roster.enemies.size);
      let meshes = 0;
      set.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      expect(meshes).toBeGreaterThan(50);
      w.scene.add(set.group);
      set.dispose();

      expect(w.rng.state).toBe(rng); // a seeded stage plays the same with or without warm-up
      expect(w.scene.children.length).toBe(sceneKids);
      expect(w.rig.space.children.length).toBe(rigKids);
      expect(w.shootables.objects.length).toBe(shootables);
      expect(w.entities.length).toBe(ents);
      expect(bossStarts).toBe(0);
      expect(w.boss).toBeNull();
      w.dispose();
      Kit.disposeAll();
    });
  }
});
