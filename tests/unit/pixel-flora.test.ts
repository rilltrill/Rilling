import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FLORA_LEVELS,
  FLORA_MAX_HEIGHT_K,
  FloraField,
  floraArtToggle,
  floraLevelFor,
  floraLightsChunk,
  paintFloraAtlas,
  type FloraAtlasData,
  type FloraSprite,
} from '../../src/content/pixel/floraField';
import { ALL_SPECIES, floraMats, type FloraSpecies } from '../../src/content/pixel/floraSpecies';
import { STREET_PROPS } from '../../src/content/pixel/floraProps';
import { D1_BIOME, D2_BIOME, D3_BIOME, Z1_BIOME, Z2_BIOME, Z3_BIOME } from '../../src/content/pixel/floraBiomes';
import { D2_FLORA } from '../../src/content/stages/d2/env';
import { Z2_FLORA } from '../../src/content/stages/z2/env';
import { Z3_FLORA } from '../../src/content/stages/z3/env';
import { FloraPalette, RIM_ALPHA } from '../../src/content/pixel/floraPaint';
import { hexToOklch } from '../../src/gameplay/pixel/materials';
import { cameraAtBeat, render3D, renderBillboards } from './floraProxy';
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

/**
 * CPU twin of the billboard's texel pick: the sprite drawn at `rho` level-0
 * texels per screen pixel (sub-pixel phase px, py), the level chosen like the
 * shader (`floraLevelFor`), nearest texels. Returns the drawn mask.
 */
function pick(a: FloraAtlasData, sp: FloraSprite, rho: number, px: number, py: number) {
  const l = floraLevelFor(rho);
  const lv = a.levels[l];
  const W = Math.ceil(sp.w / rho) + 1;
  const H = Math.ceil(sp.h / rho) + 1;
  const img = new Uint8Array(W * H);
  let n = 0;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const tx = Math.floor((i + 0.5 + px) * rho);
      const ty = Math.floor((j + 0.5 + py) * rho);
      if (tx >= sp.w || ty >= sp.h) continue;
      if (lv.data[((sp.y + ty) >> l) * lv.width + ((sp.x + tx) >> l)]) {
        img[j * W + i] = 1;
        n++;
      }
    }
  }
  return { img, W, H, l, cov: (n * rho * rho) / (sp.w * sp.h) };
}

/** The level's own texels of a sprite as a mask. */
function levelMask(a: FloraAtlasData, sp: FloraSprite, l: number) {
  const lv = a.levels[l];
  const W = sp.w >> l;
  const H = sp.h >> l;
  const img = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img[y * W + x] = lv.data[((sp.y >> l) + y) * lv.width + (sp.x >> l) + x] ? 1 : 0;
  return { img, W, H };
}

/** 8-connected pieces of a mask. */
function pieces(img: Uint8Array, W: number, H: number): number {
  const seen = new Uint8Array(W * H);
  const st: number[] = [];
  let c = 0;
  for (let i = 0; i < W * H; i++) {
    if (!img[i] || seen[i]) continue;
    c++;
    seen[i] = 1;
    st.push(i);
    while (st.length) {
      const k = st.pop()!;
      const x = k % W;
      const y = (k / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx;
          const Y = y + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const q = Y * W + X;
          if (img[q] && !seen[q]) {
            seen[q] = 1;
            st.push(q);
          }
        }
      }
    }
  }
  return c;
}

describe('FLORA atlas', () => {
  // z1 also paints the street props (hydrants, trash cans, cones: its biome has their colours).
  const Z1_SPECIES: FloraSpecies[] = [...ALL_SPECIES, ...STREET_PROPS];
  const atlases = [
    ['d1', paintFloraAtlas(ALL_SPECIES, D1_BIOME, 'd1'), ALL_SPECIES],
    ['d3', paintFloraAtlas(ALL_SPECIES, D3_BIOME, 'd3'), ALL_SPECIES],
    ['z1', paintFloraAtlas(Z1_SPECIES, Z1_BIOME, 'z1'), Z1_SPECIES],
    // (The final pass: the d2 greenhouse beds, z2's car park + potted plants, z3's dusk verges.)
    ['d2', paintFloraAtlas(D2_FLORA, D2_BIOME, 'd2'), D2_FLORA],
    ['z2', paintFloraAtlas(Z2_FLORA, Z2_BIOME, 'z2'), Z2_FLORA],
    ['z3', paintFloraAtlas(Z3_FLORA, Z3_BIOME, 'z3'), Z3_FLORA],
  ] as const;

  it('paints every variant of every species at every painted level, packed without overlaps', () => {
    for (const [, a, species] of atlases) {
      const rects: { x: number; y: number; w: number; h: number }[] = [];
      for (const sp of species) {
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
    for (const [id, a, species] of atlases) {
      for (const sp of species) {
        for (const r of a.sprites.get(sp.key)!) {
          const s0 = stats(a, r, 0);
          for (const l of [1, 2]) {
            // (A level only a few texels tall — a far cone — is a handful of screen pixels.)
            if (r.h >> l < 16) continue;
            const s = stats(a, r, l);
            expect(Math.abs(s.lum - s0.lum) / s0.lum, `${id} ${sp.key}#${r.variant} level ${l} brightness`).toBeLessThan(0.22);
            expect(s.cov / s0.cov, `${id} ${sp.key}#${r.variant} level ${l} coverage`).toBeLessThan(1.7);
            expect(s.cov / s0.cov).toBeGreaterThan(0.75);
          }
        }
      }
    }
  });

  it('never crawls: a level is never shown minified, so grass / fern / frond coverage holds steady and every blade stays joined as the camera moves', () => {
    // The shader's level pick: a texel always covers at least one screen pixel (nearest sampling skips none).
    for (let k = 0; k < 200; k++) {
      const rho = 0.25 + k * 0.05;
      const l = floraLevelFor(rho);
      if (l < FLORA_LEVELS - 1) expect((1 << l) / rho, `rho ${rho}`).toBeGreaterThanOrEqual(1 - 1e-9);
    }
    // The rail camera sweeps a plant through 0.9–2 texels per pixel: 30 scales, 4 sub-pixel phases each.
    const phases = [
      [0, 0],
      [0.37, 0.21],
      [0.71, 0.55],
      [0.13, 0.83],
    ];
    // (d1 / d3 strand plants; the dead tree's twigs too.)
    for (const [id, a] of atlases.filter(([id]) => id === 'd1' || id === 'd3' || id === 'z3')) {
      for (const key of ['grass', 'fern', 'fernWide', 'cycad', 'palm', 'deadTree']) {
        for (const sp of a.sprites.get(key) ?? []) {
          let prev = 0;
          for (let k = 0; k < 30; k++) {
            const rho = 0.9 * Math.pow(2 / 0.9, k / 29);
            let cov = 0;
            for (const [px, py] of phases) {
              const r = pick(a, sp, rho, px, py);
              cov += r.cov / phases.length;
              // Blade connectivity: exactly the level's own pieces (no blade breaks off, no texel dropped).
              const own = levelMask(a, sp, r.l);
              expect(pieces(r.img, r.W, r.H), `${id} ${key}#${sp.variant} rho ${rho.toFixed(2)} pieces`).toBe(pieces(own.img, own.W, own.H));
            }
            // Coverage steady across each 2–3 % scale step (incl. the level switches).
            if (k) expect(Math.abs(cov - prev) / prev, `${id} ${key}#${sp.variant} rho ${rho.toFixed(2)} coverage step`).toBeLessThan(0.15);
            prev = cov;
          }
        }
      }
    }
  });

  it('puts the night rim on the back-lit (right) edge, never on the lit top-left one', () => {
    for (const [id, a, species] of atlases) {
      const lv = a.levels[0];
      for (const sp of species) {
        for (const r of a.sprites.get(sp.key)!) {
          let rim = 0;
          for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++) {
              const idx = lv.data[y * lv.width + x];
              if (!idx || a.palette[idx * 4 + 3] !== RIM_ALPHA) continue;
              rim++;
              // Its right neighbour is empty (the exterior edge away from the sprite light).
              const right = x + 1 < r.x + r.w ? lv.data[y * lv.width + x + 1] : 0;
              expect(right, `${id} ${sp.key}#${r.variant} rim at ${x - r.x},${y - r.y}`).toBe(0);
            }
          }
          expect(rim, `${id} ${sp.key}#${r.variant} has a back-lit rim`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('night biomes never paint a plant pale; street props keep their saturated identity colours (never white)', () => {
    for (const b of [D3_BIOME, Z1_BIOME, Z2_BIOME, D2_BIOME]) {
      const pal = new FloraPalette();
      const m = floraMats(pal, b);
      const plantMats = [m.leaf, m.leafLight, m.leafDark, m.frond, m.frondDark, m.fern, m.fernLight, m.bark, m.palmTrunk, m.grass, m.ear, m.vine];
      for (const id of plantMats) for (const c of pal.ramps[id - 1]) expect(hexToOklch(c)[0], `ramp ${id} step ${c.toString(16)}`).toBeLessThanOrEqual(b.cap! + 0.012);
    }
    const pal = new FloraPalette();
    const ex = floraMats(pal, Z1_BIOME).extra;
    const hue = (c: number) => hexToOklch(c)[2];
    const ramp = (k: string) => pal.ramps[ex[k] - 1];
    // Cone: orange (hue 35–75°), saturated on every lit step, never white; hydrant red; can green.
    for (const c of ramp('cone').slice(1)) {
      const [L, C] = hexToOklch(c);
      expect(hue(c)).toBeGreaterThan(35);
      expect(hue(c)).toBeLessThan(80);
      expect(C).toBeGreaterThan(0.09);
      expect(L).toBeLessThan(0.86);
    }
    for (const c of ramp('hydrant').slice(1, 5)) {
      expect(hexToOklch(c)[1]).toBeGreaterThan(0.08);
      expect(hue(c) < 45 || hue(c) > 345).toBe(true);
    }
    for (const c of ramp('can').slice(1, 5)) expect(hue(c)).toBeGreaterThan(120), expect(hue(c)).toBeLessThan(200);
    // The painted cone and hydrant mostly use their base / lit steps (not the pale top one).
    const a = atlases[2][1];
    for (const key of ['cone', 'hydrant']) {
      const sp = a.sprites.get(key)![0];
      const lv = a.levels[0];
      let top = 0;
      let n = 0;
      const topCol = ramp(key === 'cone' ? 'cone' : 'hydrant')[5];
      for (let y = sp.y; y < sp.y + sp.h; y++) {
        for (let x = sp.x; x < sp.x + sp.w; x++) {
          const id = lv.data[y * lv.width + x];
          if (!id) continue;
          n++;
          const c = (a.palette[id * 4] << 16) | (a.palette[id * 4 + 1] << 8) | a.palette[id * 4 + 2];
          if (c === topCol) top++;
        }
      }
      expect(top / n, `${key} top-step share`).toBeLessThan(0.12);
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

  it('lights plants like the cast: sky light on the top, local lights apart, half desaturated and clamped (three r186 chunks)', () => {
    const chunk = floraLightsChunk()!;
    expect(chunk, 'three lights_fragment_begin still has the expected shape').not.toBeNull();
    // Point + spot loops go to the local accumulator with the view-facing normal …
    const local = chunk.split('RE_Direct( directLight, geometryPosition, fLocN, geometryViewDir, geometryClearcoatNormal, material, fLoc );').length - 1;
    expect(local).toBe(2);
    const dirLoop = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
    expect(dirLoop).toBeGreaterThan(0);
    expect(chunk.indexOf('fLocN, geometryViewDir')).toBeGreaterThan(chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 )'));
    expect(chunk.lastIndexOf('fLocN, geometryViewDir')).toBeLessThan(dirLoop);
    // … sun / directional / hemisphere stay on the plant-top normal.
    expect(chunk.slice(dirLoop)).toContain('geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight');
    expect(chunk).toContain('getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal )');
    const f = new FloraField(atlas, { far: 100, gain: 0.7, localCap: 0.25 });
    f.add('bush', 0, 0, 0, 1);
    const m = f.build().material as THREE.MeshLambertMaterial;
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    expect(shader.fragmentShader).not.toContain('#include <lights_fragment_begin>');
    expect(shader.fragmentShader).toContain('min(mix(vec3(fEl), fE, 0.5), vec3(uFLocCap))');
    expect(shader.fragmentShader).toContain('fPaint * (fSky + fE) * uFGain');
    expect(shader.vertexShader).toContain('vFLocN = normalize(normalMatrix');
    expect(shader.uniforms.uFGain.value).toBe(0.7);
    expect(shader.uniforms.uFLocCap.value).toBe(0.25);
  });

  it('places by aspect: wide, low plants get the wide sprites and no billboard stands taller than 1.15× its 3D plant', () => {
    const a = paintFloraAtlas(ALL_SPECIES, D1_BIOME, 'unit-fit');
    const f = new FloraField(a, { far: 100 });
    const aspect = (key: string) => {
      const l = a.sprites.get(key)!;
      return l.reduce((s, r) => s + r.w / r.h, 0) / l.length;
    };
    // A fern as wide (×0.75 reach) as the wide sprites → a wide fern; one shaped like the upright ones → a normal one.
    const h1 = f.fit('fern', 0, 0, 0, (aspect('fernWide') * 1.1) / 0.75, 1.1);
    const h2 = f.fit('fern', 5, 0, 0, (aspect('fern') * 1.7) / 0.75, 1.7);
    const h3 = f.fit('bush', 9, 0, 3, 9, 1); // far wider than any sprite: capped
    expect(h1).toBeGreaterThanOrEqual(1.1);
    expect(h1).toBeLessThanOrEqual(1.1 * FLORA_MAX_HEIGHT_K);
    expect(h2).toBeGreaterThanOrEqual(1.7);
    expect(h2).toBeLessThanOrEqual(1.7 * FLORA_MAX_HEIGHT_K);
    expect(h3).toBeCloseTo(FLORA_MAX_HEIGHT_K, 5);
    const g = f.build().geometry as THREE.InstancedBufferGeometry;
    const box = g.getAttribute('iBox') as THREE.InstancedBufferAttribute;
    const wide = a.sprites.get('fernWide')!.map((s) => `${s.x},${s.y}`);
    expect(wide).toContain(`${box.getX(0)},${box.getY(0)}`);
    expect(a.sprites.get('fern')!.map((s) => `${s.x},${s.y}`)).toContain(`${box.getX(1)},${box.getY(1)}`);
    expect(a.sprites.get('bushWide')!.map((s) => `${s.x},${s.y}`)).toContain(`${box.getX(2)},${box.getY(2)}`);
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
    // Explicit parameters, no rest array: nothing allocated per render.
    expect(scene.onBeforeRender.length).toBe(6);
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

/**
 * Brightness check beats (CPU raster proxy, see floraProxy.ts): plants vs the 3D
 * plants under the stage's own lights. The proxy has no lightning, terrain
 * occlusion or retro textures, so its band is wider than the in-browser one
 * (the frames themselves, measured in SwiftShader with plants on / off: d3 b3
 * 1.15, d3 b7 0.94, z1 b4 0.90 — within ±15 %); it guards against the gain /
 * local-light clamp / night caps regressing (without them d3 runs ~1.7×).
 */
const LUM_BEATS: Record<string, number[]> = { d1: [], d3: [3, 7], z1: [4], d2: [], z2: [], z3: [] };

describe.each([
  ['d1', 'd1-vegPx', 'd1-veg3d', 600, 3.4],
  ['d3', 'd3-vegPx', 'd3-veg3d', 600, 3.4],
  ['z1', 'z1-vegPx', 'z1-veg3d', 40, 4.5],
  // (The final pass: d2's greenhouse + lobby, z2's car park + potted plants, z3's verges.)
  ['d2', 'd2-vegPx', 'd2-veg3d', 90, 1.8],
  ['z2', 'z2-vegPx', 'z2-veg3d', 5, 4],
  ['z3', 'z3-vegPx', 'z3-veg3d', 60, 9],
] as const)('FLORA in stage %s', (id, pxName, d3Name, minPlants, roadClear) => {
  afterAll(() => Kit.disposeAll());

  // (A whole stage build incl. the atlas paint + a CPU raster of two frames: give it room on a busy box.)
  it('stands a billboard where every plant stands, off the road; 3D and SPRITES swap live; occluders untouched', { timeout: 30000 }, () => {
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
    // (Plants perched on d1's cliff tops / rock faces stand where their 3D twins do, off the ground by design.)
    const perched = new Set(bb.userData.floraPerched as Uint32Array);
    // (d2: vines hang from the greenhouse roof and the lobby palms stand in pots; z2: 2 of its 5 plants are potted.)
    expect(perched.size / g.instanceCount, `${id} perched plants`).toBeLessThan(id === 'z2' ? 0.5 : id === 'd2' ? 0.3 : 0.12);
    for (let i = 0; i < g.instanceCount; i++) {
      if (perched.has(i)) continue;
      p.fromBufferAttribute(pos, i);
      const ground = env.groundAt ? env.groundAt(p.x, p.z) : 0;
      if (Math.abs(p.y - ground) > (id === 'z1' ? 0.25 : 0.6)) floating++;
      expect(dim.getY(i)).toBeGreaterThan(0.3);
      expect(dim.getY(i)).toBeLessThan(26);
      // (Small props — z1's barricade cones — may stand on the road; trees and plants never.)
      if (i % 7 === 0 && dim.getY(i) > 1.2) expect(railDist(curve, p), `${id} plant ${i} off the road`).toBeGreaterThan(roadClear);
    }
    expect(floating / g.instanceCount, `${id} plants off the ground`).toBeLessThan(0.01);
    // Never taller than the plant it stands in for (it never hides much more than the 3D plant did).
    const ref = bb.userData.floraRef as Float32Array;
    let fitted = 0;
    for (let i = 0; i < g.instanceCount; i++) {
      if (Number.isNaN(ref[i])) continue;
      fitted++;
      expect(dim.getY(i), `${id} billboard ${i} height vs its 3D plant's ${ref[i].toFixed(2)} m`).toBeLessThanOrEqual(ref[i] * FLORA_MAX_HEIGHT_K + 1e-4);
    }
    // (z1: the street props keep their 3D height exactly; only the trees are fitted.)
    expect(fitted / g.instanceCount, `${id} billboards fitted to a 3D plant`).toBeGreaterThan(id === 'z1' ? 0.15 : 0.99);
    // Night light: plants under the stage's own lights stay near their 3D twins' brightness.
    for (const beat of LUM_BEATS[id]) {
      cameraAtBeat(world, stage.beats, beat);
      for (let k = 0; k < 3; k++) env.update?.(1 / 60, world);
      world.camera.updateMatrixWorld(true);
      const a = render3D(world, p3);
      const b = renderBillboards(world, bb);
      expect(a.px, `${id} b${beat} 3D plants in view`).toBeGreaterThan(150);
      expect(b.px, `${id} b${beat} billboards in view`).toBeGreaterThan(150);
      const ratio = b.lum / a.lum;
      expect(ratio, `${id} b${beat} plants vs 3D plants (proxy)`).toBeGreaterThan(0.75);
      expect(ratio, `${id} b${beat} plants vs 3D plants (proxy)`).toBeLessThan(1.6);
    }
    RETRO_FOLIAGE.value = was;
    env.dispose?.();
  });
});
