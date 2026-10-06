import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { Kit } from '../../src/content/kit/ModelKit';
import { clearPwCache, PW_STATS } from '../../src/content/pixelworld/atlas';
import { park } from '../../src/content/stages/d3/env';
import { D3_SIGN_FITS } from '../../src/content/pixelworld/d3Park';
import { nullHud, simulateStage } from './sim';

/**
 * TYRANT CHASE (d3) in ART: PIXEL WORLD — the stage-specific identity checks:
 * the painted park must keep every occluder (the visitor-centre shell, the
 * roadblock car) as the classic geometry (hidden, still raycast), the same hit
 * proxies / entities / walkable ground / world RNG as PIXEL CAST, never let a
 * painted mesh be an occluder or a target, stay within the atlas budget, and
 * play exactly like PIXEL CAST.
 */

const stage = ALL_STAGES.find((s) => s.id === 'd3')!;

function build(art: 'sprites' | 'pixel' | '3d') {
  const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
  w.art = art;
  const runner = new StageRunner(w, stage);
  runner.start();
  w.scene.updateMatrixWorld(true);
  return { w, runner };
}

function pwMeshes(w: World): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  w.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.pixelWorld) out.push(m);
  });
  return out;
}

const box = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => Math.round(v * 1000));
};

/** Everything gameplay reads: occluders, hit proxies, entities, walkable ground, the RNG. */
function signature(w: World) {
  const ground: number[] = [];
  const env = park()!;
  for (let d = -10; d <= 600; d += 7) {
    for (const lat of [-30, -14, -6, -2, 0, 2, 6, 14, 30]) {
      const p = env.at(d, lat);
      ground.push(Math.round((w.env!.groundAt?.(p.x, p.z) ?? 0) * 1000));
    }
  }
  return {
    occluders: (w.env!.occluders ?? []).map(box),
    shootables: w.shootables.objects.map((o) => [String((o.userData.shot as { part?: string } | undefined)?.part), ...box(o)]),
    entities: w.entities.map((e) => [e.constructor.name, ...e.root.position.toArray().map((v) => Math.round(v * 1000))]),
    ground,
    rng: w.rng.state,
    mudPerch: env.mudPerch.toArray().map((v) => Math.round(v * 1000)),
  };
}

describe('d3 TYRANT CHASE in PIXEL WORLD', () => {
  it('occluders, hit proxies, entities, ground and the RNG match PIXEL CAST; painted scenery is never an occluder or a target; atlases within budget', { timeout: 240_000 }, () => {
    clearPwCache();
    PW_STATS.clear();
    const px = build('pixel').w;
    const sigPx = signature(px);
    const stats = [...PW_STATS.values()];
    const bytes = stats.reduce((s, a) => s + a.bytes, 0);
    console.log(`d3 PIXEL WORLD: ${[...PW_STATS].map(([n, a]) => `${n} ${a.w}×${a.h} ${(a.bytes / 1048576).toFixed(2)} MB ${a.ms.toFixed(0)} ms ${a.tiles} tiles`).join(', ')}; total ${(bytes / 1048576).toFixed(2)} MB`);
    expect(bytes).toBeLessThanOrEqual(24 * 1048576);
    expect(PW_STATS.has('d3')).toBe(true);
    expect(PW_STATS.has('d3-sky')).toBe(true);
    expect(PW_STATS.has('d3-jeep')).toBe(true);
    const meshes = pwMeshes(px);
    expect(meshes.length).toBeGreaterThan(10);
    // Signs: every painted text fits its board with a clear margin (the road boards, EVACUATE, DANGER).
    const texts = new Set(D3_SIGN_FITS.map((f) => f.text));
    for (const t of ['< VISITOR CENTER', 'HELIPAD >', 'HELIPAD', 'BRIDGE', 'EVACUATE', 'DANGER']) expect(texts.has(t), t).toBe(true);
    for (const f of D3_SIGN_FITS) {
      expect(f.tw + 2 * f.margin, `${f.key} width`).toBeLessThanOrEqual(f.W);
      expect(f.th + 2 * f.margin, `${f.key} height`).toBeLessThanOrEqual(f.H);
    }
    // Occluders: the classic meshes (hidden in PIXEL WORLD), never a painted one.
    const occ = px.env!.occluders ?? [];
    for (const o of occ) {
      o.traverse((c) => expect((c as THREE.Mesh).userData?.pixelWorld, 'a PixelWorld mesh inside an occluder').toBeFalsy());
    }
    // Painted meshes: no raycast hits, never in the shootables.
    const ray = new THREE.Raycaster();
    const c = new THREE.Vector3();
    for (const m of meshes) {
      new THREE.Box3().setFromObject(m).getCenter(c);
      ray.set(c.clone().add(new THREE.Vector3(0, 2, 6)), new THREE.Vector3(0, -2, -6).normalize());
      expect(ray.intersectObject(m, false)).toEqual([]);
      expect(px.shootables.objects.includes(m)).toBe(false);
    }
    const sp = build('sprites').w;
    const sigSp = signature(sp);
    expect(pwMeshes(sp)).toEqual([]);
    expect(sigPx).toEqual(sigSp);
    // Rays at the visitor centre's shell and the roadblock car still stop on them, at the same distances.
    const env = park()!;
    const hits = (w: World, from: THREE.Vector3, to: THREE.Vector3) => {
      const r = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, 200);
      return r.intersectObjects(w.env!.occluders ?? [], true).map((h) => Math.round(h.distance * 1000));
    };
    const shots: [THREE.Vector3, THREE.Vector3][] = [
      [env.at(170, 0, 1.6), env.at(184, -30, 4)],
      [env.at(176, -2, 1.6), env.at(186, -34, 8)],
      [env.at(240, 0, 1.6), env.at(253, 1.7, 1)],
    ];
    for (const [a, b] of shots) {
      const h = hits(sp, a, b);
      expect(h.length).toBeGreaterThan(0);
      expect(hits(px, a, b)).toEqual(h);
    }
    const cl = build('3d').w;
    expect(pwMeshes(cl)).toEqual([]);
    px.dispose();
    sp.dispose();
    cl.dispose();
    Kit.disposeAll();
  });

  it('drums and the fuel tank keep their classic hit meshes (raycast, not drawn) under the painted ones', { timeout: 240_000 }, () => {
    const { w } = build('pixel');
    const env = park()!;
    env.spawnRoadblockDrums(w);
    env.armFinale(w);
    w.scene.updateMatrixWorld(true);
    const props = w.entities.filter((e) => e.constructor.name === 'Destructible' || e.constructor.name === 'FuelTank');
    expect(props.length).toBeGreaterThanOrEqual(7);
    for (const e of props) {
      let painted = 0;
      e.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (m.userData.pixelWorld) {
          painted++;
          expect(w.shootables.objects.includes(m)).toBe(false);
        }
      });
      expect(painted, e.constructor.name).toBeGreaterThan(0);
      // Every hit mesh still raycasts.
      const own = w.shootables.objects.filter((o) => (o.userData.shot as { owner: unknown }).owner === e);
      expect(own.length).toBeGreaterThan(0);
      for (const o of own) {
        const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
        const r = new THREE.Raycaster(c.clone().add(new THREE.Vector3(0, 0, 8)), new THREE.Vector3(0, 0, -1));
        const r2 = new THREE.Raycaster(c.clone().add(new THREE.Vector3(8, 0, 0)), new THREE.Vector3(-1, 0, 0));
        expect(r.intersectObject(o, false).length + r2.intersectObject(o, false).length, e.constructor.name).toBeGreaterThan(0);
      }
    }
    w.dispose();
    Kit.disposeAll();
  });

  it('plays exactly like PIXEL CAST (stage simulator)', { timeout: 900_000 }, () => {
    const a = simulateStage(stage, { art: 'sprites', maxTime: 600 });
    expect(a.errors).toEqual([]);
    const b = simulateStage(stage, { art: 'pixel', maxTime: 600 });
    expect(b.errors).toEqual([]);
    expect({ ...b, errors: [] }).toEqual({ ...a, errors: [] });
  });
});
