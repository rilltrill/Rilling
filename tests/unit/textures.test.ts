import { describe, expect, it } from 'vitest';
import { TEX_NAMES, Textures } from '../../src/content/kit/Textures';
import { Kit } from '../../src/content/kit/ModelKit';

describe('retro procedural textures', () => {
  it.each(TEX_NAMES.map((n) => [n]))('%s generates a power-of-two, opaque, non-flat texture', (name) => {
    const { data, size } = Textures.pixels(name);
    expect([32, 64]).toContain(size);
    expect(data.length).toBe(size * size * 4);
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i + 3]).toBe(255);
      min = Math.min(min, data[i]);
      max = Math.max(max, data[i]);
    }
    expect(max - min).toBeGreaterThan(20); // has visible detail
    const rt = Textures.get(name);
    expect(rt.gain).toBeGreaterThan(0.9);
    expect(rt.gain).toBeLessThan(2.6);
    expect(rt.density).toBeGreaterThan(0);
  });

  it('is deterministic across regenerations', () => {
    const a = Array.from(Textures.pixels('brick').data);
    Textures.disposeAll();
    const b = Array.from(Textures.pixels('brick').data);
    expect(a).toEqual(b);
  });

  it('Kit.mat caches textured materials separately and injects the projection shader', () => {
    const plain = Kit.mat(0x884422);
    const bricks = Kit.mat(0x884422, { tex: 'brick' });
    expect(plain).not.toBe(bricks);
    expect(Kit.mat(0x884422, { tex: 'brick' })).toBe(bricks);
    expect(bricks.userData.retroTex).toBe('brick');
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>',
    };
    bricks.onBeforeCompile(shader as never, undefined as never);
    expect(shader.fragmentShader).toContain('uRetroMap');
    expect(shader.vertexShader).toContain('vRetroPos');
    expect(shader.uniforms.uRetroMap).toBeDefined();
    Kit.disposeAll();
  });
});

describe('Kit.applyTexture on custom materials', () => {
  it('chains an existing onBeforeCompile and is idempotent', async () => {
    const THREE = await import('three');
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    let prevRan = false;
    m.onBeforeCompile = () => {
      prevRan = true;
    };
    Kit.applyTexture(m, 'skin', 3);
    Kit.applyTexture(m, 'cloth', 3); // second call ignored
    expect(m.userData.retroTex).toBe('skin');
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>',
    };
    m.onBeforeCompile(shader as never, undefined as never);
    expect(prevRan).toBe(true);
    expect(shader.fragmentShader).toContain('uRetroMap');
    m.dispose();
  });
});
