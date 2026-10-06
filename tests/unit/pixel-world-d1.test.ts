import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { Kit } from '../../src/content/kit/ModelKit';
import { clearPwCache, PW_STATS } from '../../src/content/pixelworld/atlas';
import { nullHud, simulateStage } from './sim';

/**
 * JUNGLE RUN (d1) in ART: PIXEL WORLD — the stage-specific identity checks on
 * top of pixel-world.test.ts (budgets, occluders, ground, RNG): the painted
 * park must play exactly like PIXEL CAST, keep every occluder as the classic
 * (hidden) geometry, and keep the jeep framed as before.
 */

const stage = (id: string) => ALL_STAGES.find((s) => s.id === id)!;

function build(art: 'sprites' | 'pixel') {
  const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
  w.art = art;
  const runner = new StageRunner(w, stage('d1'));
  runner.start();
  w.scene.updateMatrixWorld(true);
  return { w, runner };
}

describe('d1 JUNGLE RUN in PIXEL WORLD', () => {
  it('occluders stay the classic meshes (hidden, still raycast); no PixelWorld mesh is ever an occluder or raycastable', { timeout: 120_000 }, () => {
    clearPwCache();
    const { w } = build('pixel');
    const occ = w.env!.occluders ?? [];
    expect(occ.length).toBe(2);
    let meshes = 0;
    for (const o of occ) {
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        expect(m.userData.pixelWorld, 'a PixelWorld mesh inside an occluder').toBeFalsy();
        meshes++;
      });
    }
    expect(meshes).toBeGreaterThan(0);
    // A ray down the road at the right-hand gate pillar still hits it (hidden meshes are raycast like visible ones),
    // exactly where it hits in PIXEL CAST.
    const hitAt = (ww: World) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(5.2, 4, 0), new THREE.Vector3(0, 0, -1));
      const hits = ray.intersectObjects(ww.env!.occluders ?? [], true);
      return hits.length ? Math.round(hits[0].distance * 1000) : -1;
    };
    const ref = build('sprites').w;
    expect(hitAt(w)).toBeGreaterThan(0);
    expect(hitAt(w)).toBe(hitAt(ref));
    ref.dispose();
    // PixelWorld meshes never report raycast hits.
    w.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.userData.pixelWorld) return;
      const out: THREE.Intersection[] = [];
      m.raycast(new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)), out);
      expect(out.length).toBe(0);
    });
    w.dispose();
    Kit.disposeAll();
  });

  it('the atlases stay within budget (≤ 24 MB all levels)', { timeout: 120_000 }, () => {
    clearPwCache();
    PW_STATS.clear();
    const { w } = build('pixel');
    const bytes = [...PW_STATS.values()].reduce((s, a) => s + a.bytes, 0);
    expect(bytes).toBeLessThanOrEqual(24 * 1048576);
    expect(PW_STATS.has('d1')).toBe(true);
    expect(PW_STATS.has('d1-jeep')).toBe(true);
    w.dispose();
    Kit.disposeAll();
  });

  it('plays exactly like PIXEL CAST (stage simulator)', { timeout: 600_000 }, () => {
    const a = simulateStage(stage('d1'), { art: 'sprites', maxTime: 600 });
    expect(a.completed).toBe(true);
    const b = simulateStage(stage('d1'), { art: 'pixel', maxTime: 600 });
    expect(b.errors).toEqual([]);
    expect({ ...b, errors: [] }).toEqual({ ...a, errors: [] });
  });
});
