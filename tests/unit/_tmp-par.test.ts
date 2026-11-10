import { describe, it } from 'vitest';
import * as THREE from 'three';
import { clearPwCache, PwAtlas, pwTileLevel, pwUpscale, type PwAtlasData, type PwTile } from '../../src/content/pixelworld/atlas';
import { ALL_STAGES } from '../../src/content';
import { World } from '../../src/gameplay/World';
import { StageRunner } from '../../src/gameplay/StageRunner';
import { AudioSystem } from '../../src/audio/Audio';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { nullHud } from './sim';

function grab(id: string): Map<string, { d: PwAtlasData; tiles: PwTile[] }> {
  clearPwCache();
  const out = new Map<string, { d: PwAtlasData; tiles: PwTile[] }>();
  const build = PwAtlas.prototype.build;
  PwAtlas.prototype.build = function (this: PwAtlas) {
    const d = build.call(this);
    const tiles = [...(this as unknown as { tiles: Map<string, { tile: PwTile }> }).tiles.values()].map((t) => ({ ...t.tile }));
    out.set(this.name, { d, tiles });
    return d;
  };
  const w = new World(new THREE.PerspectiveCamera(), new AudioSystem(), nullHud, { ...DEFAULT_SETTINGS }, 7);
  w.art = 'pixel';
  new StageRunner(w, ALL_STAGES.find((s) => s.id === id)!).start();
  w.dispose();
  PwAtlas.prototype.build = build;
  return out;
}

describe('tmp parity', () => {
  it('painted levels are the same texels with and without 2x storage', { timeout: 600_000 }, () => {
    for (const id of (process.env.PAR ?? 'z2').split(',')) {
      pwUpscale(false);
      const a = grab(id);
      pwUpscale(true);
      const b = grab(id);
      for (const [name, A] of a) {
        const B = b.get(name)!;
        let bad = 0;
        let n = 0;
        const worst: string[] = [];
        A.tiles.forEach((ta, i) => {
          const tb = B.tiles[i];
          for (let k = 0; k < 6; k++) {
            const la = pwTileLevel(A.d, ta, k);
            const lb = pwTileLevel(B.d, tb, k);
            if (!la || !lb) break;
            const w = ta.w >> k;
            const h = ta.h >> k;
            let diff = 0;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
              const pa = A.d.pal; const pb = B.d.pal;
              const va = la.idx[(la.y + y) * la.width + la.x + x];
              const vb = lb.idx[(lb.y + y) * lb.width + lb.x + x];
              if (va !== vb) diff++;
              void pa; void pb;
            }
            n++;
            if (diff) { bad++; if (worst.length < 8) worst.push(`${ta.key} ${ta.w}x${ta.h}${ta.wrap ? 'w' : ''} lv${k}: ${diff}/${w * h}`); }
          }
        });
        console.log(id, name, 'tile-levels', n, 'differ', bad, worst.join(' | '));
      }
    }
  });
});
