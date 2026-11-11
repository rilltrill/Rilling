import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { clearPwCache, type PwAtlas, type PwTile } from '../../src/content/pixelworld/atlas';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { Kit } from '../../src/content/kit/ModelKit';
import { z2Scene } from '../../src/content/stages/z2/scene';
import { nullHud } from './sim';

/**
 * z2 PIXEL WORLD geometry fingerprint (skipped unless PW_GEOM is set):
 *   PW_GEOM=/tmp/pw2/z2/geom-a.json npx vitest run tests/unit/pixel-world-z2-geom.test.ts
 * writes, for the stage as built at load, every mesh that carries painted attributes (the zone
 * batches, set pieces, the doors / cylinders / wall blocks painted in place) — where it hangs,
 * its vertices, texel UVs, tints, triangles, the TILE KEY of every vertex and its material
 * groups — and every mesh left classic. Atlas positions are deliberately not part of it (tiles
 * are named by key), so the file is the same for two builds that draw the same thing. `order`
 * is a hash of the tile keys in the order they were registered (the atlas layout, its store key
 * and the ramp ids follow it); PW_GEOM_ORDER=1 also writes the keys themselves, to find where
 * two builds part.
 *
 * The check for a refactor of the converter that must not change what is drawn: dump before,
 * dump after, compare the files. (Frame captures cannot show that: rain and animation move on
 * the wall clock, two captures of one build already differ in a few hundred pixels.)
 */
const OUT = process.env.PW_GEOM;

function fnv(h: number, v: number): number {
  return Math.imul(h ^ (v | 0), 16777619) >>> 0;
}

function hashArr(a: ArrayLike<number>, scale: number): string {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = fnv(h, Math.round(a[i] * scale));
  return h.toString(16).padStart(8, '0');
}

function hashStrs(a: string[]): string {
  let h = 2166136261;
  for (const s of a) {
    for (let i = 0; i < s.length; i++) h = fnv(h, s.charCodeAt(i));
    h = fnv(h, 0x1f);
  }
  return h.toString(16).padStart(8, '0');
}

function path(o: THREE.Object3D): string {
  const names: string[] = [];
  for (let p: THREE.Object3D | null = o; p; p = p.parent) names.push(p.name || p.type);
  return names.reverse().join('/');
}

describe.skipIf(!OUT)('z2 PIXEL WORLD geometry fingerprint', () => {
  it('writes the fingerprint', { timeout: 180_000 }, () => {
    clearPwCache();
    const w = new World(new THREE.PerspectiveCamera(60, 844 / 390, 0.05, 400), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
    w.art = 'pixel';
    new StageRunner(w, ALL_STAGES.find((s) => s.id === 'z2')!).start();
    w.scene.updateMatrixWorld(true);
    const atlas = z2Scene(w)!.pw!.atlas as PwAtlas;
    const tiles = [...(atlas as unknown as { tiles: Map<string, { tile: PwTile }> }).tiles.values()].map((t) => t.tile);
    const byPos = new Map<number, PwTile>();
    for (const t of tiles) byPos.set(t.x * 65536 + t.y, t);
    const painted: unknown[] = [];
    const classic: unknown[] = [];
    const used = new Map<string, number>();
    w.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      const rect = g.getAttribute('pwRect');
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (!rect) {
        const pos = g.getAttribute('position');
        classic.push({ at: path(m), verts: pos?.count ?? 0, pos: pos ? hashArr(pos.array, 1e4) : '', world: hashArr(m.matrixWorld.elements, 1e4), mat: mats.map((x) => `${x.type}:${(x as THREE.MeshLambertMaterial).color?.getHexString?.() ?? ''}`).join(',') });
        return;
      }
      const keys: string[] = [];
      for (let i = 0; i < rect.count; i++) {
        const t = byPos.get(rect.getX(i) * 65536 + rect.getY(i));
        const k = t ? `${t.key}${rect.getZ(i) > 0 ? '~' : ''}` : `?${rect.getX(i)},${rect.getY(i)}`;
        keys.push(k);
        if (i % 3 === 0) used.set(k, (used.get(k) ?? 0) + 1);
      }
      const uv = g.getAttribute('pwUv');
      const col = g.getAttribute('color');
      painted.push({
        at: path(m),
        verts: rect.count,
        tris: (g.index ? g.index.count : rect.count) / 3,
        pos: hashArr(g.getAttribute('position').array, 1e4),
        world: hashArr(m.matrixWorld.elements, 1e4),
        uv: uv ? hashArr(uv.array, 1e2) : '',
        col: col ? hashArr(col.array, 1) : '',
        idx: g.index ? hashArr(g.index.array, 1) : '',
        tiles: hashStrs(keys),
        groups: g.groups.map((x) => `${x.start}+${x.count}>${x.materialIndex}`).join(' '),
        // Level bias, paint gain, glow gain of each material (the uniforms of `pwMaterial`).
        mats: mats
          .map((x) => {
            const u = x.userData.pw as Record<string, { value: unknown } | undefined> | undefined;
            const n = (k: string) => (typeof u?.[k]?.value === 'number' ? (u[k]!.value as number) : '-');
            return `${n('uPwBias')}|${n('uPwGain')}|${n('uPwGlow')}`;
          })
          .join(','),
      });
    });
    const out = {
      painted,
      classic,
      // Triangles' first vertices per tile key: which tiles are laid, and how often.
      used: [...used].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      // The registered tiles (sorted: the order they were registered in may differ between builds).
      tiles: tiles.map((t) => `${t.key} ${t.w}x${t.h} ${t.wrap ? 'w' : 'm'} d${t.density} s${t.scale}`).sort(),
      // …and in registration order (the atlas layout follows it), for the record.
      order: hashStrs(tiles.map((t) => t.key)),
      ...(process.env.PW_GEOM_ORDER ? { orderKeys: tiles.map((t) => t.key) } : {}),
    };
    writeFileSync(OUT!, JSON.stringify(out, null, 1));
    w.dispose();
    Kit.disposeAll();
  });
});
