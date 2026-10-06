import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { clearPwCache, PW_STATS } from '../../src/content/pixelworld/atlas';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { Kit } from '../../src/content/kit/ModelKit';
import { z2Scene } from '../../src/content/stages/z2/scene';
import { Destructible } from '../../src/gameplay/Props';
import { nullHud, simulateStage } from './sim';

/**
 * ST. MERCY HOSPITAL (z2) in ART: PIXEL WORLD — budgets and gameplay identity
 * (the z2 counterpart of the z1 / d1 checks in pixel-world.test.ts).
 */

const stage = (id: string) => ALL_STAGES.find((s) => s.id === id)!;

function build(art: 'sprites' | 'pixel' | '3d') {
  const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
  w.art = art;
  const runner = new StageRunner(w, stage('z2'));
  runner.start();
  w.scene.updateMatrixWorld(true);
  return w;
}

function pwMeshes(w: World): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  w.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.pixelWorld) out.push(m);
  });
  return out;
}

const r3 = (v: number) => Math.round(v * 1000);
const boxOf = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(r3);
};

describe('z2 ST. MERCY HOSPITAL in PIXEL WORLD', () => {
  it('builds painted scenery within budget; occluders, ground, set pieces, destructibles and the RNG identical to PIXEL CAST', { timeout: 180_000 }, () => {
    clearPwCache();
    PW_STATS.clear();
    const px = build('pixel');
    const meshes = pwMeshes(px);
    expect(meshes.length).toBeGreaterThan(20);
    const stats = [...PW_STATS.values()];
    const bytes = stats.reduce((s, a) => s + a.bytes, 0);
    const paint = stats.reduce((s, a) => s + a.ms, 0);
    console.log(
      `z2 PIXEL WORLD: ${[...PW_STATS].map(([n, a]) => `${n} ${a.w}×${a.h} ${(a.bytes / 1048576).toFixed(1)} MB ${a.ms.toFixed(0)} ms ${a.tiles} tiles`).join(', ')}, ` +
        `${(bytes / 1048576).toFixed(1)} MB, paint ${paint.toFixed(0)} ms, ${meshes.length} PW meshes`,
    );
    // Atlas memory (world + sky, all levels) within the per-stage budget.
    expect(bytes).toBeLessThanOrEqual(24 * 1048576);
    // PixelWorld meshes are scenery: never occluders, never raycast.
    const occ = new Set(px.env!.occluders ?? []);
    for (const m of meshes) {
      expect(occ.has(m)).toBe(false);
      const hits: THREE.Intersection[] = [];
      m.raycast(new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)), hits);
      expect(hits).toEqual([]);
    }
    const sp = build('sprites');
    expect(pwMeshes(sp)).toEqual([]);
    // Same occluders (count, placement), same walkable ground.
    const occOf = (w: World) => (w.env!.occluders ?? []).map(boxOf);
    expect(occOf(px)).toEqual(occOf(sp));
    for (const [x, z] of [[0, 0], [0, -30], [30, -44], [79, -60], [79, -64], [80, -85], [89, -117], [35, -121], [-10, 10]]) {
      expect(px.env!.groundAt?.(x, z)).toBe(sp.env!.groundAt?.(x, z));
    }
    // Set pieces gameplay reads (door slots, drawers, vents, curtains, flicker panels, tanks) identical in number and place.
    const a = z2Scene(px)!;
    const b = z2Scene(sp)!;
    const pos = (v: THREE.Vector3) => [v.x, v.y, v.z].map(r3);
    expect(a.doorSlots.map((d) => [...pos(d.hinge), r3(d.ry), ...pos(d.centre)])).toEqual(b.doorSlots.map((d) => [...pos(d.hinge), r3(d.ry), ...pos(d.centre)]));
    expect(a.drawers.map((d) => pos(d.pos))).toEqual(b.drawers.map((d) => pos(d.pos)));
    expect(a.vents.map((v) => [...pos(v.pos), r3(v.floor)])).toEqual(b.vents.map((v) => [...pos(v.pos), r3(v.floor)]));
    expect(a.curtains.map((c) => pos(c.pos))).toEqual(b.curtains.map((c) => pos(c.pos)));
    expect(a.flickers.map((f) => pos(f.pos))).toEqual(b.flickers.map((f) => pos(f.pos)));
    expect(a.tanks.map((t) => [...pos(t.pos), t.kind])).toEqual(b.tanks.map((t) => [...pos(t.pos), t.kind]));
    expect(a.accents.length).toBe(b.accents.length);
    // Destructibles (doors, cylinders): same hit boxes.
    const dest = (w: World) => w.entities.filter((e) => e instanceof Destructible).map((e) => boxOf(e.root));
    expect(dest(px).length).toBeGreaterThan(4);
    expect(dest(px)).toEqual(dest(sp));
    // The world RNG is untouched by the scenery.
    expect(px.rng.state).toBe(sp.rng.state);
    px.dispose();
    sp.dispose();
    Kit.disposeAll();
  });

  it('plays exactly like PIXEL CAST (stage simulator)', { timeout: 300_000 }, () => {
    const a = simulateStage(stage('z2'), { art: 'sprites', maxTime: 120 });
    const b = simulateStage(stage('z2'), { art: 'pixel', maxTime: 120 });
    expect(b.errors).toEqual([]);
    expect({ ...b, errors: [] }).toEqual({ ...a, errors: [] });
  });
});
