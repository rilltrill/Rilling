import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { clearPwCache, PW_STATS } from '../../src/content/pixelworld/atlas';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { Kit } from '../../src/content/kit/ModelKit';
import { Destructible } from '../../src/gameplay/Props';
import { z3Scene } from '../../src/content/stages/z3/env';
import { nullHud, simulateStage } from './sim';

/**
 * HIGHWAY TO HELL (z3) in ART: PIXEL WORLD — budgets and gameplay identity
 * (the z3 counterpart of the z1 / d1 / z2 checks): painted scenery never takes a
 * hit, occluders / ground / set pieces / the tanker's hit boxes / the world RNG
 * are PIXEL CAST's, and the stage plays the same.
 */

const stage = (id: string) => ALL_STAGES.find((s) => s.id === id)!;

function build(art: 'sprites' | 'pixel' | '3d') {
  const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
  w.art = art;
  const runner = new StageRunner(w, stage('z3'));
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
const pos = (v: THREE.Vector3) => [v.x, v.y, v.z].map(r3);

describe('z3 HIGHWAY TO HELL in PIXEL WORLD', () => {
  it('builds painted scenery within budget; occluders, ground, set pieces, the tanker and the RNG identical to PIXEL CAST', { timeout: 240_000 }, () => {
    clearPwCache();
    PW_STATS.clear();
    const px = build('pixel');
    const meshes = pwMeshes(px);
    expect(meshes.length).toBeGreaterThan(20);
    const stats = [...PW_STATS.values()];
    const bytes = stats.reduce((s, a) => s + a.bytes, 0);
    console.log(
      `z3 PIXEL WORLD: ${[...PW_STATS].map(([n, a]) => `${n} ${a.w}×${a.h} ${(a.bytes / 1048576).toFixed(1)} MB ${a.ms.toFixed(0)} ms ${a.tiles} tiles`).join(', ')}, ` +
        `${(bytes / 1048576).toFixed(1)} MB, ${meshes.length} PW meshes`,
    );
    // Atlas memory (world + sky + fx + the pickup, all levels) within the per-stage budget.
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
    // Same occluders (count, placement), same walkable ground (road, verge, the bay under the bridge).
    const occOf = (w: World) => (w.env!.occluders ?? []).map(boxOf);
    expect(occOf(px).length).toBeGreaterThan(10);
    expect(occOf(px)).toEqual(occOf(sp));
    for (const [x, z] of [[0, 0], [0, -300], [12, -400], [-30, -760], [30, -900], [0, -1000], [-60, -1100]]) {
      expect(px.env!.groundAt?.(x, z)).toBe(sp.env!.groundAt?.(x, z));
    }
    // Set pieces the script / boss read: positions, the tunnel fixtures, the police light, chunk culling.
    const a = z3Scene(px)!;
    const b = z3Scene(sp)!;
    expect(pos(a.blocker!.position)).toEqual(pos(b.blocker!.position));
    expect(pos(a.overpassCar!.position)).toEqual(pos(b.overpassCar!.position));
    expect(pos(a.tankModel!.position)).toEqual(pos(b.tankModel!.position));
    expect(a.tankHalves.map((h) => pos(h.position))).toEqual(b.tankHalves.map((h) => pos(h.position)));
    expect(a.gate.map((g) => pos(g.position))).toEqual(b.gate.map((g) => pos(g.position)));
    expect(a.fixtures.map(pos)).toEqual(b.fixtures.map(pos));
    expect(pos(a.police)).toEqual(pos(b.police));
    expect(a.chunks.length).toBe(b.chunks.length);
    expect(a.fires.emitters.map((e) => [...pos(e.pos), r3(e.size)])).toEqual(b.fires.emitters.map((e) => [...pos(e.pos), r3(e.size)]));
    // The tanker (a destructible: every hit-box mesh): armed in both, the same hit boxes; its paint never registers.
    a.armTanker();
    b.armTanker();
    const dest = (w: World) => w.entities.filter((e) => e instanceof Destructible);
    const hitBoxes = (w: World) =>
      dest(w).flatMap((e) => {
        const out: number[][] = [];
        e.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && !m.userData.pixelWorld) out.push(boxOf(m));
        });
        return out;
      });
    expect(dest(px).length).toBe(1);
    expect(hitBoxes(px)).toEqual(hitBoxes(sp));
    expect(dest(px).map((e) => boxOf(e.root))).toEqual(dest(sp).map((e) => boxOf(e.root)));
    // Registered hit meshes: the same count, none of them painted.
    const shot = (w: World) => w.shootables.objects.filter((o) => (o.userData.shot as { owner: unknown }).owner === dest(w)[0]);
    expect(shot(px).length).toBe(shot(sp).length);
    expect(shot(px).some((o) => o.userData.pixelWorld)).toBe(false);
    // In PIXEL WORLD the classic meshes are hidden (material) but stay hittable (object visible).
    expect(shot(px).length).toBeGreaterThan(0);
    expect(px.shootables.active().filter((o) => (o.userData.shot as { owner: unknown }).owner === dest(px)[0]).length).toBe(shot(px).length);
    // The world RNG is untouched by the scenery.
    expect(px.rng.state).toBe(sp.rng.state);
    px.dispose();
    sp.dispose();
    Kit.disposeAll();
  });

  it('keeps the letters of its signs whole down the levels (sign fit)', { timeout: 60_000 }, async () => {
    // The story signs, painted alone: after the ink pass, every ink texel of the board's letters at
    // level 0 still has an ink parent at levels 1 and 2 (no bar of an E / Z dropped: "SAFT 7ONE").
    const { PwAtlas } = await import('../../src/content/pixelworld/atlas');
    const { z3HighwaySign, z3KeepOut } = await import('../../src/content/pixelworld/z3structures');
    const { z3FlammableBand } = await import('../../src/content/pixelworld/z3trucks');
    const { z3BillboardFace } = await import('../../src/content/pixelworld/z3buildings');
    const { z3InkLevels, Z3_INK_DEBUG } = await import('../../src/content/pixelworld/z3levels');
    clearPwCache();
    const a = new PwAtlas('z3-signfit');
    const tiles = [
      z3HighwaySign(a, ['SAFE ZONE', 'MILITARY CHECKPOINT'], 15.5, 2.9, 0x1a3a1a),
      z3HighwaySign(a, ['BRIDGE 3 MI', 'SAFE ZONE ^'], 7.4, 2.6, 0x1d6a3c),
      z3BillboardFace(a, 'repent'),
      z3KeepOut(a),
      z3FlammableBand(a),
    ];
    const data = a.build();
    z3InkLevels(data, tiles, undefined, true);
    for (const t of tiles) {
      const lv = Z3_INK_DEBUG.get(t.key);
      expect(lv, t.key).toBeTruthy();
      const m0 = lv![0];
      let ink = 0;
      for (let i = 0; i < m0.mask.length; i++) ink += m0.mask[i];
      expect(ink, t.key).toBeGreaterThan(50);
      for (const L of [1, 2]) {
        const ml = lv![L];
        let kept = 0;
        for (let y = 0; y < m0.h; y++) for (let x = 0; x < m0.w; x++) {
          if (!m0.mask[y * m0.w + x]) continue;
          const px = x >> L;
          const py = y >> L;
          if (px < ml.w && py < ml.h && ml.mask[py * ml.w + px]) kept++;
        }
        const recall = kept / ink;
        // (Two-texel letters — the plates — are three texels tall at level 2: their corners go.)
        const small = /keepout|flammable/.test(t.key);
        expect(recall, `${t.key} level ${L}`).toBeGreaterThan(L === 2 && small ? 0.85 : 0.95);
      }
    }
  });

  it('plays exactly like PIXEL CAST (stage simulator)', { timeout: 600_000 }, () => {
    const a = simulateStage(stage('z3'), { art: 'sprites', maxTime: 400 });
    const b = simulateStage(stage('z3'), { art: 'pixel', maxTime: 400 });
    expect(b.errors).toEqual([]);
    expect({ ...b, errors: [] }).toEqual({ ...a, errors: [] });
  });
});
