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
import { Destructible } from '../../src/gameplay/Props';
import { jungle } from '../../src/content/stages/d1/env';

/**
 * JUNGLE RUN (d1) in ART: PIXEL WORLD — the stage-specific identity checks on
 * top of pixel-world.test.ts (budgets, occluders, ground, RNG): the painted
 * park must play exactly like PIXEL CAST, keep every occluder as the classic
 * (hidden) geometry, and keep the jeep framed as before.
 */

const stage = (id: string) => ALL_STAGES.find((s) => s.id === id)!;

function build(art: '3d' | 'sprites' | 'pixel') {
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

  it('destructibles and hit proxies are identical in CLASSIC, PIXEL CAST and PIXEL WORLD (drums, fence section, tree halves)', { timeout: 180_000 }, () => {
    // Per ART: every fuel drum (the fallen-tree three + the boss road four) is spawned, then a fan of
    // rays is cast at each drum and across the breakable fence section and both tree halves against
    // what bullets can hit (the shootables + the occluders). PIXEL WORLD paints the drums over their
    // classic hit meshes (undrawn, same geometry and side), so every hit must land at the same
    // distance on the same kind of thing.
    const run = (art: '3d' | 'sprites' | 'pixel') => {
      clearPwCache();
      const { w } = build(art);
      const env = jungle()!;
      env.spawnDrums(w);
      env.spawnBossDrums(w);
      w.scene.updateMatrixWorld(true);
      const drums = w.entities.filter((e): e is Destructible => e instanceof Destructible);
      const targets = [...w.shootables.active(), ...(w.env!.occluders ?? [])];
      const ray = new THREE.Raycaster();
      const out: string[] = [`drums ${drums.length}`, `shootables ${w.shootables.active().length}`, `hitboxes ${drums.map((d) => w.shootables.objects.filter((o) => (o.userData.shot as { owner: unknown }).owner === d).length).join(',')}`];
      const cast = (o: THREE.Vector3, d: THREE.Vector3) => {
        ray.set(o, d.normalize());
        const h = ray.intersectObjects(targets, false)[0];
        if (!h) return '-';
        const tag = h.object.userData.shot as { owner: unknown } | undefined;
        return `${Math.round(h.distance * 1000)}:${tag ? drums.indexOf(tag.owner as Destructible) : 'occ'}`;
      };
      const p = new THREE.Vector3();
      for (const d of drums) {
        d.root.getWorldPosition(p);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          for (const y of [0.15, 0.5, 0.85]) out.push(cast(new THREE.Vector3(p.x + Math.sin(a) * 4, p.y + y + 0.3, p.z + Math.cos(a) * 4), new THREE.Vector3(-Math.sin(a) * 4, -0.3, -Math.cos(a) * 4)));
        }
      }
      // Across the fence section and the tree halves (rays toward them from the road).
      for (const name of ['fence', 'tree'] as const) {
        const at = name === 'fence' ? env.P(166, -10) : env.P(247, 0);
        for (let k = -3; k <= 3; k++) out.push(cast(new THREE.Vector3(at.x + 8, 1.2, at.z + k), new THREE.Vector3(-1, 0, 0)));
      }
      w.dispose();
      Kit.disposeAll();
      return out;
    };
    const a = run('3d');
    const b = run('sprites');
    const c = run('pixel');
    expect(a.length).toBeGreaterThan(80);
    expect(a.filter((h) => h !== '-').length).toBeGreaterThan(40);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
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
