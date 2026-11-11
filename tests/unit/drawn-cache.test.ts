import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import '../../src/content';
import { createEnemy } from '../../src/content/registry';
import { World } from '../../src/gameplay/World';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import type { Enemy } from '../../src/gameplay/Enemy';
import { DrawnCast, MAX_RASTERS, newDrawnQuery, newDrawnSprite, type DrawnSprite } from '../../src/gameplay/pixel/drawn/DrawnCast';
import { setCastLook, setDrawnEveryone } from '../../src/gameplay/pixel/look';
import { nullHud } from './sim';

/** Melee range: the drawing never gives way to the hidden rig while any of the figure is on screen. */
describe('drawn figure at the lens', () => {
  it('a walker close to the camera always places a sprite, at both camera heights', () => {
    setCastLook('d');
    setDrawnEveryone(true);
    try {
      for (const camY of [1.6, 2.5]) {
        const camera = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
        const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 7);
        world.viewport = { width: 844, height: 390 };
        world.player.god = true;
        const GW = Math.round((288 * 844) / 390);
        const z = createEnemy('walker', world, { pos: new THREE.Vector3(0, 0, -3), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: {} }) as Enemy;
        world.add(z);
        const dc = new DrawnCast(null);
        const q = newDrawnQuery();
        const st = newDrawnSprite();
        // (From a 2.5 m vehicle camera a walker nearer than 1.1 m is entirely below the frame: nothing to draw.)
        for (let d = camY > 2 ? 1.1 : 0.6; d <= 3.01; d += 0.2) {
          z.root.position.set(0, 0, camera.position.z - d);
          world.update(1 / 60);
          camera.position.set(0, camY, 0);
          camera.lookAt(0, camY - 0.47, -6);
          camera.updateMatrixWorld();
          world.scene.updateMatrixWorld(true);
          dc.beginFrame();
          q.flags = 0;
          expect(z.drawnFigure!(q), 'figure drawn').toBe(true);
          const r = dc.place(camera, z.root, q, GW, 288, st);
          expect(typeof r, `depth ${d.toFixed(1)} height ${camY}: ${String(r)}`).toBe('object');
        }
        // A windup, raised arms at the biggest size: the canvas holds it without clipping.
        z.setState('windup');
        for (let t = 0; t < 0.5; t += 1 / 60) z.update(1 / 60);
        z.root.position.set(0, 0, camera.position.z - 0.6);
        world.scene.updateMatrixWorld(true);
        dc.beginFrame();
        q.flags = 0;
        z.drawnFigure!(q);
        expect(typeof dc.place(camera, z.root, q, GW, 288, st), 'windup placed').toBe('object');
      }
    } finally {
      setCastLook('b');
      setDrawnEveryone(false);
    }
  });
});

/** The figure cache under a horde: the raster cap is never exceeded and frames repeat. */
describe('drawn figure cache', () => {
  it('a walking horde stays inside the raster budget', () => {
    setCastLook('d');
    setDrawnEveryone(true);
    try {
      const camera = new THREE.PerspectiveCamera(58, 844 / 390, 0.05, 400);
      const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 7);
      world.viewport = { width: 844, height: 390 };
      world.player.god = true;
      const GW = Math.round((288 * 844) / 390);
      const zs: Enemy[] = [];
      const sts: DrawnSprite[] = [];
      for (let i = 0; i < 12; i++) {
        const z = createEnemy('walker', world, { pos: new THREE.Vector3(-4 + (i % 4) * 2.6, 0, -5 - (i % 3) * 3.5 - i * 0.4), frame: 'world', entry: 'walk', hpMul: 1, speedMul: 1, opts: {} }) as Enemy;
        world.add(z);
        zs.push(z);
        sts.push(newDrawnSprite());
      }
      const dc = new DrawnCast(null);
      const q = newDrawnQuery();
      let max = 0;
      let drawn = 0;
      for (let f = 0; f < 480; f++) {
        world.update(1 / 60);
        camera.position.set(0, 1.62, 0);
        camera.lookAt(0, 1.15, -6);
        camera.updateMatrixWorld();
        world.scene.updateMatrixWorld(true);
        dc.beginFrame();
        // A 12 Hz redraw per zombie, round-robin like SpriteArt.
        for (let i = 0; i < zs.length; i++) {
          if ((f + i) % 5 !== 0 || zs[i].removed) continue;
          q.flags = 0;
          if (!zs[i].drawnFigure!(q)) continue;
          dc.place(camera, zs[i].root, q, GW, 288, sts[i]);
          drawn++;
        }
        max = Math.max(max, dc.rasters);
      }
      const s = dc.stats;
      expect(max).toBeLessThanOrEqual(MAX_RASTERS);
      expect(drawn).toBeGreaterThan(200);
      expect(s.rasters).toBeGreaterThan(0);
      const asked = s.hits + s.misses;
      // DRAWN_NUMBERS=/path: the raster and cache numbers for the look-dev report.
      if (process.env.DRAWN_NUMBERS) writeFileSync(process.env.DRAWN_NUMBERS, `drawn cache: ${drawn} redraws; hits ${((s.hits / asked) * 100).toFixed(1)} %; rastered ${s.rasters}; near-size reuse ${s.near}; entries ${s.entries}; avg raster ${(s.rasterMs / Math.max(1, s.rasters)).toFixed(2)} ms; biggest raster count per frame ${max}\n`);
    } finally {
      setCastLook('b');
      setDrawnEveryone(false);
    }
  });
});
