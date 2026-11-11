import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clearPwCache, PwAtlas } from '../../src/content/pixelworld/atlas';
import { PwBatch } from '../../src/content/pixelworld/batch';
import { PWI, PW_TPM_NEAR } from '../../src/content/pixelworld/canvas';
import { pwPanelCuts, pwPanelRun } from '../../src/content/pixelworld/brush2i';
import { Kit } from '../../src/content/kit/ModelKit';

/**
 * The interior brush's PANEL layout (brush2i.ts): which piece of which panel a solid piece of a
 * wall shows — and, through a real atlas and batch, that a cut laid with `rect({ sub, flipU })`
 * fetches the texels the painter put there (the floor line is the canvas's bottom row).
 */

const D = PW_TPM_NEAR;

/** A 2 m × 1 m panel at 96: tone = a code of where the texel is (column third, lower / upper half). */
function marker(atlas: PwAtlas, key: string) {
  return atlas.tile(
    key,
    2 * D,
    1 * D,
    (c, k) => {
      const r = k.ramp(0x808080);
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) c.set(x, y, r, Math.floor((x * 3) / c.w) + (y >= c.h / 2 ? 0 : 3));
    },
    { density: D },
  );
}

describe('interior brush: panel layout', () => {
  it('cuts a wall piece into panel sub-rects that meet exactly at the joints', () => {
    const atlas = new PwAtlas('brush2i-a');
    const a = marker(atlas, 'a');
    const b = marker(atlas, 'b');
    const run = pwPanelRun(10, [a, b, a], [false, true, false]);
    expect(run.map((s) => s.at)).toEqual([10, 12, 14]);
    // A piece from 11 m to 13.5 m, 0.25 m to 0.75 m above the floor: half of the first panel, three quarters of the second.
    const cuts = pwPanelCuts(run, { a0: 11, a1: 13.5, y0: 0.25, y1: 0.75 });
    expect(cuts.length).toBe(2);
    expect(cuts[0]).toMatchObject({ a0: 11, a1: 12, tile: a, flipU: false, sub: { x: 1 * D, y: 0.25 * D, w: 1 * D, h: 0.5 * D } });
    // The mirrored panel shows its right end first: its cut is taken from the far side.
    expect(cuts[1]).toMatchObject({ a0: 12, a1: 13.5, tile: b, flipU: true, sub: { x: 0.5 * D, y: 0.25 * D, w: 1.5 * D, h: 0.5 * D } });
    // Texels are conserved: the cuts cover the piece once.
    expect(cuts.reduce((s, c) => s + c.sub.w, 0)).toBeCloseTo(2.5 * D, 6);
    // Outside every panel, above the panels, and on a joint: nothing.
    expect(pwPanelCuts(run, { a0: 0, a1: 10, y0: 0, y1: 1 })).toEqual([]);
    expect(pwPanelCuts(run, { a0: 10, a1: 11, y0: 1, y1: 2 })).toEqual([]);
    expect(pwPanelCuts(run, { a0: 16, a1: 20, y0: 0, y1: 1 })).toEqual([]);
    // A piece taller than the panel is cut at the panel's height.
    expect(pwPanelCuts(run, { a0: 10, a1: 11, y0: 0.5, y1: 3 })[0].sub).toEqual({ x: 0, y: 0.5 * D, w: 1 * D, h: 0.5 * D });
  });

  it('a cut laid in a batch fetches the painted texels: floor at the bottom, mirrored when flipped', () => {
    clearPwCache();
    const atlas = new PwAtlas('brush2i-b');
    const t = marker(atlas, 'm');
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, 1, 0);
    const batch = new PwBatch(atlas);
    // The LOWER LEFT sixth of the wall (first third of the length, lower half), plain and mirrored.
    const piece = { a0: 0, a1: 2 / 3, y0: 0, y1: 0.5 };
    const plain = pwPanelCuts(pwPanelRun(0, [t]), piece)[0];
    const flipped = pwPanelCuts(pwPanelRun(0, [t], [true]), piece)[0];
    for (const c of [plain, flipped]) batch.rect(new THREE.Vector3(c.a0, c.y0, 0), X, Y, c.a1 - c.a0, c.y1 - c.y0, c.tile, { sub: c.sub, flipU: c.flipU });
    const mesh = batch.build()!;
    const d = atlas.build();
    const uv = mesh.geometry.getAttribute('pwUv');
    const rect = mesh.geometry.getAttribute('pwRect');
    const pos = mesh.geometry.getAttribute('position');
    const lv = d.levels[0];
    /** The painted tone the shader's module fetch gives a point just inside a quad's corner. */
    const toneNear = (quad: number, corner: 'bl' | 'tr') => {
      // Quad vertices: bottom-left, bottom-right, top-right, top-left.
      const i0 = quad * 4;
      const iA = i0 + (corner === 'bl' ? 0 : 2);
      const iB = i0 + (corner === 'bl' ? 2 : 0);
      // A point 1 % of the way from this corner toward the opposite one.
      const u = uv.getX(iA) + (uv.getX(iB) - uv.getX(iA)) * 0.01;
      const v = uv.getY(iA) + (uv.getY(iB) - uv.getY(iA)) * 0.01;
      const w = -rect.getZ(iA); // module: width stored negative
      const h = Math.abs(rect.getW(iA));
      const tx = Math.min(w - 1, Math.max(0, Math.floor(u)));
      const ty = Math.min(h - 1, Math.max(0, Math.floor(v)));
      const texel = lv.idx[(rect.getY(iA) + ty) * lv.width + rect.getX(iA) + tx];
      return (texel & PWI.TONE) >> PWI.TONE_SHIFT;
    };
    // The geometry is where the piece is.
    expect([pos.getX(0), pos.getY(0), pos.getX(2), pos.getY(2)].map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0, 0.667, 0.5]);
    // Plain: lower left of the picture = column third 0, lower half (tone 0); its top right still third 0, lower half.
    expect(toneNear(0, 'bl')).toBe(0);
    expect(toneNear(0, 'tr')).toBe(0);
    // Mirrored: the same place on the wall shows the picture's RIGHT third (tone 2), still the lower half.
    expect(toneNear(1, 'bl')).toBe(2);
    expect(toneNear(1, 'tr')).toBe(2);
    Kit.disposeAll();
  });
});
