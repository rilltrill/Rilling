import { it } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { nullHud } from './sim';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { Kit } from '../../src/content/kit/ModelKit';
import '../../src/content';
import { stage } from '../../src/content/stages/d1';

it('d1 view model projection', () => {
  const camera = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
  const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 1);
  const runner = new StageRunner(world, stage);
  runner.start(3);
  for (let i = 0; i < 200; i++) {
    world.update(1 / 30);
    runner.update(1 / 30);
  }
  world.scene.updateMatrixWorld(true);
  console.log('eye', world.rig.eyeHeight.toFixed(2), 'cam', camera.position.toArray().map((v) => v.toFixed(2)), 'rot', camera.rotation.x.toFixed(3), camera.rotation.y.toFixed(3));
  const holder = world.rig.viewModelHolder;
  console.log('holder', holder.position.toArray().map((v) => v.toFixed(2)), holder.rotation.y.toFixed(3));
  const vm = holder.children[0];
  const rows: string[] = [];
  vm.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!;
    const pts = [new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z), new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z), new THREE.Vector3(0, bb.max.y, (bb.min.z + bb.max.z) / 2)];
    const out = pts.map((p) => {
      p.applyMatrix4(m.matrixWorld).project(camera);
      return `(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`;
    });
    rows.push(`${m.name || m.type} verts=${m.geometry.attributes.position.count} top-front-corners ${out.join(' ')}`);
  });
  console.log(rows.join('\n'));
  // Where is the merged body's highest point on screen?
  const body = vm.children[0];
  let maxY = -9;
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const local = v.clone();
      v.project(camera);
      if (v.z < 1 && Math.abs(v.x) < 1 && v.y > maxY) {
        maxY = v.y;
        console.log('higher', v.y.toFixed(2), 'at world', local.toArray().map((x) => x.toFixed(2)));
      }
    }
  });
  world.dispose();
  Kit.disposeAll();
});
