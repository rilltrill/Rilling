import { describe, it } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';

/** Scene signature of a stage build in an ART style (D1_SIG=1): every object, transform, material, geometry hashed. */
describe.skipIf(!process.env.D1_SIG)('stage scene signature', () => {
  it('hashes the d1 scene in 3d / sprites', { timeout: 600_000 }, async () => {
    const { World } = await import('../../src/gameplay/World');
    const { StageRunner } = await import('../../src/gameplay/StageRunner');
    const { AudioSystem } = await import('../../src/audio/Audio');
    const { DEFAULT_SETTINGS } = await import('../../src/core/types');
    const { ALL_STAGES } = await import('../../src/content');
    const { nullHud } = await import('./sim');
    for (const art of ['3d', 'sprites'] as const) {
      const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, art }, 7);
      w.art = art;
      const runner = new StageRunner(w, ALL_STAGES.find((s) => s.id === (process.env.D1_SIG_STAGE ?? 'd1'))!);
      runner.start();
      // A few frames of play (the env update and the view model run).
      for (let i = 0; i < 30; i++) runner.update(w.update(1 / 60));
      w.scene.updateMatrixWorld(true);
      const h = createHash('sha256');
      let n = 0;
      const geos = new Map<THREE.BufferGeometry, string>();
      w.scene.traverse((o) => {
        n++;
        h.update(`${o.type}|${o.name}|${o.visible}|${o.matrixWorld.elements.map((v) => v.toFixed(4)).join(',')}|${o.renderOrder}|${o.frustumCulled}`);
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mt of mats) {
            const l = mt as THREE.MeshLambertMaterial;
            h.update(`${mt.type}|${l.color?.getHexString?.() ?? ''}|${mt.transparent}|${mt.side}|${JSON.stringify(Object.keys(mt.userData).sort())}|${(mt as THREE.MeshBasicMaterial).map ? 'map' : ''}`);
          }
          let gs = geos.get(m.geometry);
          if (!gs) {
            const gh = createHash('sha256');
            for (const [k, a] of Object.entries(m.geometry.attributes)) {
              gh.update(k);
              const arr = (a as THREE.BufferAttribute).array as ArrayLike<number> & { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
              gh.update(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
            }
            if (m.geometry.index) gh.update(new Uint8Array(m.geometry.index.array.buffer));
            gs = gh.digest('hex').slice(0, 16);
            geos.set(m.geometry, gs);
          }
          h.update(gs);
        }
      });
      console.log(`SIG ${art} objects=${n} rng=${w.rng.state} hash=${h.digest('hex').slice(0, 24)}`);
      w.dispose();
    }
  });
});
