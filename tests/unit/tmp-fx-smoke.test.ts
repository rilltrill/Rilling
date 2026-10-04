import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Fx } from '../../src/fx/Fx';

describe('fx smoke', () => {
  it('runs every effect headlessly without allocating new pools', () => {
    const t0 = performance.now();
    const fx = new Fx();
    const t1 = performance.now();
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5), new THREE.DirectionalLight(0xffffff, 2));
    scene.add(fx.group);
    const cam = new THREE.PerspectiveCamera(60, 2, 0.05, 400);
    cam.position.set(0, 1.7, 10);
    cam.updateMatrixWorld();
    fx.attachCamera(cam);
    fx.setViewportHeight(390, 2);
    fx.groundAt = () => 0;
    const p = new THREE.Vector3(0, 1.5, 0);
    const d = new THREE.Vector3(0, 0, -1);
    for (let f = 0; f < 600; f++) {
      if (f % 3 === 0) fx.blood(p, d, { color: 0x8a0a0a, amount: 1.5 });
      if (f % 5 === 0) fx.blood(p, null, { color: 0x7dff3a, amount: 2.2 });
      if (f % 7 === 0) fx.impact(new THREE.Vector3(1, 0.02, -3), new THREE.Vector3(0, 1, 0), ['concrete', 'dirt', 'metal', 'wood', 'grass', 'water'][f % 6]);
      if (f % 11 === 0) fx.impact(new THREE.Vector3(1, 1.2, -3), null, 'metal');
      if (f % 13 === 0) fx.sparks(p, new THREE.Vector3(1, 0, 0), 8);
      if (f % 17 === 0) fx.dust(p, 1.5, 0x8a7a5a);
      if (f % 60 === 0) fx.explosion(new THREE.Vector3(0, 0.3, -5), 1 + (f % 120 === 0 ? 1.2 : 0));
      if (f % 19 === 0) fx.debris(p, 0xd29a16);
      if (f % 23 === 0) fx.sparkle(p, 0xffd040);
      if (f % 4 === 0) fx.muzzleFlash(1);
      if (f % 9 === 0) fx.gibs(p, 0x5c0b0b, 6, 0.08);
      fx.update(1 / 60);
    }
    fx.clear();
    fx.update(1 / 60);
    fx.dispose();
    const t2 = performance.now();
    console.log(`fx construct ${(t1 - t0).toFixed(1)} ms, 600 frames ${(t2 - t1).toFixed(1)} ms`);
    expect(fx.group.children.length).toBe(6);
  });
});
