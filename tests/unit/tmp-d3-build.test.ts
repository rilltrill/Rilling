import { it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { Kit } from '../../src/content/kit/ModelKit';
import '../../src/content';
import { stage } from '../../src/content/stages/d3';
import { nullHud } from './sim';
import { ParkEnv } from '../../src/content/stages/d3/env';
import { Baker } from '../../src/content/stages/d3/bake';
const times: Record<string, number> = {};
const wrap = (proto: any, name: string) => {
  const f = proto[name];
  proto[name] = function (...a: unknown[]) { const t = performance.now(); const r = f.apply(this, a); times[name] = (times[name] ?? 0) + performance.now() - t; return r; };
};
for (const n of ['buildTerrain', 'buildRoad', 'buildVegetation', 'buildPaddock', 'buildLamps', 'buildVisitorCentre', 'buildRoadblock', 'buildMud', 'buildBridge', 'buildHelipad', 'spawnTank', 'commit']) wrap(ParkEnv.prototype, n);
wrap(Baker.prototype, 'bake');

it('d3 build time', { timeout: 60000 }, () => {
  for (let i = 0; i < 2; i++) {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.05, 400);
    const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 1);
    world.rig.setPath(stage.rail);
    const t0 = performance.now();
    const env = stage.buildEnvironment(world, world.rig.curve!);
    const t1 = performance.now();
    let meshes = 0, tris = 0;
    env.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    console.log(`build ${(t1 - t0).toFixed(0)} ms, meshes=${meshes}, total tris=${Math.round(tris)}`, JSON.stringify(Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Math.round(v)]))));
    for (const k of Object.keys(times)) delete times[k];
    world.dispose();
    Kit.disposeAll();
  }
});
