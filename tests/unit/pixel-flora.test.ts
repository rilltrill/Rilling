import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FLORA_LEVELS, FloraField, floraArtToggle, paintFloraAtlas, type FloraAtlasData } from '../../src/content/pixel/floraField';
import { ALL_SPECIES } from '../../src/content/pixel/floraSpecies';
import { D1_BIOME, D3_BIOME, Z1_BIOME } from '../../src/content/pixel/floraBiomes';
import { RIM_ALPHA } from '../../src/content/pixel/floraPaint';
import { Kit, RETRO_FOLIAGE } from '../../src/content/kit/ModelKit';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { nullHud } from './sim';

/**
 * FLORA (ART: SPRITES scenery): hand-pixelled plant billboards. Plants have no
 * hitboxes — what must hold is that the art is sound (every variant painted at
 * every mip level, palettised, deterministic, no level-switch pops), that the
 * billboards stand where the 3D plants stand, are never raycast nor bullet
 * occluders, and that the ART setting swaps 3D plants and billboards live.
 */

function fnv(data: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619);
  return h >>> 0;
}

/** Opaque coverage and mean luminance of one sprite at one level. */
function stats(a: FloraAtlasData, sp: { x: number; y: number; w: number; h: number }, l: number) {
  const lv = a.levels[l];
  let n = 0;
  let lum = 0;
  for (let y = sp.y >> l; y < (sp.y + sp.h) >> l; y++) {
    for (let x = sp.x >> l; x < (sp.x + sp.w) >> l; x++) {
      const id = lv.data[y * lv.width + x];
      if (!id) continue;
      n++;
      lum += a.palette[id * 4] * 0.3 + a.palette[id * 4 + 1] * 0.59 + a.palette[id * 4 + 2] * 0.11;
    }
  }
  return { cov: n / ((sp.w >> l) * (sp.h >> l)), lum: n ? lum / n : 0, n };
}

describe('FLORA atlas', () => {
  const atlases = [
    ['d1', paintFloraAtlas(ALL_SPECIES, D1_BIOME, 'd1')],
    ['d3', paintFloraAtlas(ALL_SPECIES, D3_BIOME, 'd3')],
    ['z1', paintFloraAtlas(ALL_SPECIES, Z1_BIOME, 'z1')],
  ] as const;

  it('paints every variant of every species at every painted level, packed without overlaps', () => {
    for (const [, a] of atlases) {
      const rects: { x: number; y: number; w: number; h: number }[] = [];
      for (const sp of ALL_SPECIES) {
        const list = a.sprites.get(sp.key)!;
        expect(list, sp.key).toHaveLength(sp.variants);
        list.forEach((r, v) => {
          expect(r.variant).toBe(v);
          // Aligned so every painted mip level lands on whole texels.
          const align = 1 << (FLORA_LEVELS - 1);
          for (const k of [r.x, r.y, r.w, r.h]) expect(k % align, `${sp.key} rect alignment`).toBe(0);
          expect(r.x + r.w).toBeLessThanOrEqual(a.w);
          expect(r.y + r.h).toBeLessThanOrEqual(a.h);
          // The foot (trunk base) is inside the sprite and the plant stands on its bottom row.
          expect(r.foot).toBeGreaterThan(0);
          expect(r.foot).toBeLessThan(r.w);
          for (let l = 0; l < FLORA_LEVELS; l++) expect(stats(a, r, l).n, `${sp.key}#${v} level ${l}`).toBeGreaterThan(0);
          const lv = a.levels[0];
          let bottom = 0;
          for (let x = r.x; x < r.x + r.w; x++) if (lv.data[r.y * lv.width + x]) bottom++;
          expect(bottom, `${sp.key}#${v} touches the ground`).toBeGreaterThan(0);
          rects.push(r);
        });
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const p = rects[i];
          const q = rects[j];
          const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  it('is deterministic (same atlas every load, different variants per stage)', () => {
    const again = paintFloraAtlas(ALL_SPECIES, D1_BIOME, 'd1');
    const d1 = atlases[0][1];
    for (let l = 0; l < FLORA_LEVELS; l++) expect(fnv(again.levels[l].data)).toBe(fnv(d1.levels[l].data));
    expect(fnv(again.palette)).toBe(fnv(d1.palette));
    const other = paintFloraAtlas(ALL_SPECIES, D1_BIOME, 'other');
    expect(fnv(other.levels[0].data)).not.toBe(fnv(d1.levels[0].data));
  });

  it('stays palettised and small (one byte per texel, ≤ 255 colours, ≤ 1.5 MB with mips)', () => {
    for (const [id, a] of atlases) {
      expect(a.colours, id).toBeLessThanOrEqual(255);
      expect(a.w).toBeLessThanOrEqual(1024);
      expect(a.h).toBeLessThanOrEqual(1024);
      const bytes = a.levels.reduce((s, l) => s + l.data.length, 0) + a.palette.length;
      expect(bytes, `${id} atlas bytes`).toBeLessThanOrEqual(1.5 * 1024 * 1024);
      // Full mip chain down to 1×1 (texture completeness); levels past the painted ones are blank.
      expect(a.levels[a.levels.length - 1].width).toBe(1);
      expect(a.levels[a.levels.length - 1].height).toBe(1);
      // Entry 0 is transparent; lit-edge colours carry the rim flag.
      expect(a.palette[3]).toBe(0);
      let rim = 0;
      for (let i = 1; i <= a.colours; i++) {
        const al = a.palette[i * 4 + 3];
        expect([255, RIM_ALPHA]).toContain(al);
        if (al === RIM_ALPHA) rim++;
      }
      expect(rim, `${id} has lit-edge (rim) colours`).toBeGreaterThan(0);
    }
  });

  it('keeps the hand-painted mip levels consistent (no pop when a plant switches level)', () => {
    for (const [id, a] of atlases) {
      for (const sp of ALL_SPECIES) {
        for (const r of a.sprites.get(sp.key)!) {
          const s0 = stats(a, r, 0);
          for (const l of [1, 2]) {
            const s = stats(a, r, l);
            expect(Math.abs(s.lum - s0.lum) / s0.lum, `${id} ${sp.key}#${r.variant} level ${l} brightness`).toBeLessThan(0.22);
            expect(s.cov / s0.cov, `${id} ${sp.key}#${r.variant} level ${l} coverage`).toBeLessThan(1.7);
            expect(s.cov / s0.cov).toBeGreaterThan(0.75);
          }
        }
      }
    }
  });
});

describe('FLORA billboards', () => {
  const atlas = paintFloraAtlas(ALL_SPECIES, D1_BIOME, 'unit');

  it('draws every plant in one instanced call and is never raycast', () => {
    const f = new FloraField(atlas, { far: 120 });
    expect(f.add('palm', 1, 0, -5, 9, { sway: 0.3 })).toBe(true);
    expect(f.add('fern', -2, 0, -6, 1.4, { tint: 0.9 })).toBe(true);
    expect(f.add('nope', 0, 0, 0, 1)).toBe(false);
    expect(f.add('fern', 0, 0, 0, 0)).toBe(false);
    const m = f.build();
    const g = m.geometry as THREE.InstancedBufferGeometry;
    expect(g.isInstancedBufferGeometry).toBe(true);
    expect(g.instanceCount).toBe(2);
    expect(g.getAttribute('position').count).toBe(4);
    expect((g.getAttribute('iPos') as THREE.InstancedBufferAttribute).array.length).toBe(6);
    // Width follows the sprite's aspect (square texels): heightFor() is its inverse.
    const dim = g.getAttribute('iDim') as THREE.InstancedBufferAttribute;
    expect(f.heightFor('palm', dim.getX(0), 1, -5)).toBeCloseTo(9, 4);
    const hits: THREE.Intersection[] = [];
    m.raycast(new THREE.Raycaster(new THREE.Vector3(1, 3, 0), new THREE.Vector3(0, 0, -1)), hits);
    expect(hits).toHaveLength(0);
    expect(m.frustumCulled).toBe(false);
  });

  it('patches every Lambert shader hook it relies on (three r186 chunk names)', () => {
    const f = new FloraField(atlas, { far: 100, rim: 0x8aa4d8 });
    f.add('bush', 0, 0, 0, 1);
    const m = f.build().material as THREE.MeshLambertMaterial;
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    for (const inc of ['<beginnormal_vertex>', '<begin_vertex>']) expect(shader.vertexShader).not.toContain(`#include ${inc}`);
    expect(shader.vertexShader).toContain('vFTex');
    expect(shader.vertexShader).toContain('if (fCull) gl_Position');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
    expect(shader.fragmentShader).toContain('texelFetch(uFAtlas');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += uFRim');
    for (const u of ['uFAtlas', 'uFPal', 'uFTime', 'uFWind', 'uFFar', 'uFRim']) expect(shader.uniforms[u], u).toBeDefined();
    // Palettised atlas: R8 indices, nearest texels, the whole mip chain uploaded as painted.
    const tex = shader.uniforms.uFAtlas.value as THREE.DataTexture;
    expect(tex.format).toBe(THREE.RedFormat);
    expect(tex.generateMipmaps).toBe(false);
    expect(tex.mipmaps.length).toBe(atlas.levels.length);
    expect(tex.unpackAlignment).toBe(1);
  });

  it('swaps 3D plants and billboards live with the ART setting (also while frozen)', () => {
    const scene = new THREE.Scene();
    let prevCalls = 0;
    scene.onBeforeRender = () => {
      prevCalls++;
    };
    const px = new THREE.Group();
    const p3 = new THREE.Group();
    const was = RETRO_FOLIAGE.value;
    RETRO_FOLIAGE.value = 1;
    const off = floraArtToggle(scene, [px], [p3]);
    expect(px.visible).toBe(true);
    expect(p3.visible).toBe(false);
    RETRO_FOLIAGE.value = 0;
    const r = undefined as unknown as THREE.WebGLRenderer;
    const cam = new THREE.PerspectiveCamera();
    scene.onBeforeRender(r, scene, cam, undefined as never, undefined as never, undefined as never);
    expect(px.visible).toBe(false);
    expect(p3.visible).toBe(true);
    expect(prevCalls).toBe(1);
    off();
    RETRO_FOLIAGE.value = was;
  });
});

/** Distance (m, XZ) from p to the stage rail. */
function railDist(curve: THREE.Curve<THREE.Vector3>, p: THREE.Vector3): number {
  const len = curve.getLength();
  const q = new THREE.Vector3();
  let best = Infinity;
  for (let d = 0; d <= len; d += 1) {
    curve.getPointAt(Math.min(1, d / len), q);
    best = Math.min(best, Math.hypot(q.x - p.x, q.z - p.z));
  }
  return best;
}

describe.each([
  ['d1', 'd1-vegPx', 'd1-veg3d', 600, 3.4],
  ['d3', 'd3-vegPx', 'd3-veg3d', 600, 3.4],
  ['z1', 'z1-vegPx', 'z1-veg3d', 15, 4.5],
] as const)('FLORA in stage %s', (id, pxName, d3Name, minPlants, roadClear) => {
  afterAll(() => Kit.disposeAll());

  it('stands a billboard where every plant stands, off the road; 3D and SPRITES swap live; occluders untouched', () => {
    const stage = ALL_STAGES.find((s) => s.id === id)!;
    const was = RETRO_FOLIAGE.value;
    RETRO_FOLIAGE.value = 1;
    const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400);
    const world = new World(camera, new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS, haptics: false }, 99);
    world.viewport = { width: 844, height: 390 };
    new StageRunner(world, stage).start();
    const env = world.env!;
    const px = world.scene.getObjectByName(pxName)!;
    const p3 = world.scene.getObjectByName(d3Name)!;
    expect(px, pxName).toBeDefined();
    expect(p3, d3Name).toBeDefined();
    const bb = px.getObjectByName('flora-billboards') as THREE.Mesh;
    expect(bb).toBeDefined();
    const g = bb.geometry as THREE.InstancedBufferGeometry;
    expect(g.instanceCount, `${id} plants`).toBeGreaterThanOrEqual(minPlants);
    // Built in SPRITES: billboards on, 3D plants off; ART: 3D swaps them back on the next render.
    expect(px.visible).toBe(true);
    expect(p3.visible).toBe(false);
    RETRO_FOLIAGE.value = 0;
    world.scene.onBeforeRender(undefined as never, world.scene, camera, undefined as never, undefined as never, undefined as never);
    expect(px.visible).toBe(false);
    expect(p3.visible).toBe(true);
    // 3D plants are still there to show (meshes under the 3D group).
    let meshes3d = 0;
    p3.traverse((o) => ((o as THREE.Mesh).isMesh ? meshes3d++ : 0));
    expect(meshes3d).toBeGreaterThan(0);
    // Billboards are scenery only: never occluders.
    for (const o of env.occluders ?? []) {
      let isFlora = false;
      o.traverse((c) => (c === bb || c === px ? (isFlora = true) : 0));
      expect(isFlora).toBe(false);
    }
    // Feet on the ground beside the road, sizes plausible.
    const pos = g.getAttribute('iPos') as THREE.InstancedBufferAttribute;
    const dim = g.getAttribute('iDim') as THREE.InstancedBufferAttribute;
    const p = new THREE.Vector3();
    const curve = world.rig.curve!;
    // (A few stand in raised planters or on far hillsides where gameplay's groundAt
    // approximates the terrain mesh: the billboard foot is the 3D plant's own.)
    let floating = 0;
    for (let i = 0; i < g.instanceCount; i++) {
      p.fromBufferAttribute(pos, i);
      const ground = env.groundAt ? env.groundAt(p.x, p.z) : 0;
      if (Math.abs(p.y - ground) > (id === 'z1' ? 0.25 : 0.6)) floating++;
      expect(dim.getY(i)).toBeGreaterThan(0.3);
      expect(dim.getY(i)).toBeLessThan(26);
      if (i % 7 === 0) expect(railDist(curve, p), `${id} plant ${i} off the road`).toBeGreaterThan(roadClear);
    }
    expect(floating / g.instanceCount, `${id} plants off the ground`).toBeLessThan(0.01);
    RETRO_FOLIAGE.value = was;
    env.dispose?.();
  });
});
