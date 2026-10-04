import { it } from 'vitest';
import * as THREE from 'three';
import { Flora } from '../../src/content/stages/d1/flora';
import { Rng } from '../../src/core/Rng';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { nullHud } from './sim';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Kit } from '../../src/content/kit/ModelKit';
import '../../src/content';
import { stage } from '../../src/content/stages/d1';

function tris(o: THREE.Object3D) {
  let n = 0;
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const c = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    n += c * ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
  });
  return n;
}

it('d1 triangle budget', () => {
  const f = new Flora();
  const r = new Rng(1);
  const avg = (fn: () => THREE.Object3D) => {
    let s = 0;
    for (let i = 0; i < 20; i++) s += tris(fn());
    return Math.round(s / 20);
  };
  console.log({
    fern: avg(() => f.fern(r)),
    palm: avg(() => f.palm(r)),
    bigTree: avg(() => f.bigTree(r)),
    canopy: avg(() => f.canopy(r)),
    cycad: avg(() => f.cycad(r)),
    bush: avg(() => f.bush(r)),
    rock: avg(() => f.rock(r)),
    grass: avg(() => f.grass(r)),
    patch: avg(() => f.patch(r)),
  });
  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 1);
  const runner = new StageRunner(world, stage);
  runner.start();
  const env = world.env!.root;
  const rows: string[] = [];
  env.children.forEach((c, i) => {
    const t = tris(c);
    if (t > 3000) {
      const sph = new THREE.Box3().setFromObject(c).getBoundingSphere(new THREE.Sphere());
      rows.push(`${i} ${c.type} ${c.name} tris=${t} centre=${sph.center.x.toFixed(0)},${sph.center.z.toFixed(0)} r=${sph.radius.toFixed(0)}`);
    }
  });
  console.log(rows.join('\n'));
  console.log('total env tris', tris(env), 'viewmodel', tris(world.rig.viewModelHolder));
  world.dispose();
  Kit.disposeAll();
});
