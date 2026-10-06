import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FirePlume } from '../../src/content/stages/z1/vfx';

/**
 * ART: PIXEL WORLD's painted z1 smoke: a particle's first (stagger) life — `life` 0…4 s
 * against `max` 1 — must never be drawn as a billow from k = life / max > 1 (negative ages
 * made 40–176 m red-orange squares at the stage start and the gas-station inferno).
 */
function puffsOf(f: FirePlume): THREE.InstancedMesh {
  let im: THREE.InstancedMesh | null = null;
  f.group.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) im = o as THREE.InstancedMesh;
  });
  if (!im) throw new Error('no painted smoke');
  return im;
}

function check(f: FirePlume, scale: number, frames: number, label: string) {
  const im = puffsOf(f);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  let shown = 0;
  for (let n = 0; n < frames; n++) {
    f.update(1 / 60);
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      m.decompose(p, q, s);
      // A billow grows to 0.95 + 2.1 = 3.05 × the fire's scale at most.
      expect(s.x, `${label} frame ${n} puff ${i} scale`).toBeLessThanOrEqual(3.1 * scale);
      expect(s.y).toBeLessThanOrEqual(3.1 * scale);
      // Never below the fire nor far beside it (a column: ≤ 5 s × 1.6 m/s up, a few m of drift).
      expect(p.y, `${label} frame ${n} puff ${i} height`).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(1.4 * scale + 9);
      expect(Math.abs(p.x)).toBeLessThan(0.5 * scale + 2.5);
      expect(Math.abs(p.z)).toBeLessThan(0.8 * scale + 1.5);
      im.getColorAt(i, c);
      for (const v of [c.r, c.g, c.b]) {
        expect(v, `${label} frame ${n} puff ${i} colour`).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      if (s.x > 0.01) shown++;
    }
  }
  return shown;
}

describe('z1 painted smoke (PIXEL WORLD)', () => {
  const puff = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const mat = new THREE.MeshBasicMaterial();

  it('a fire burning since the stage began shows a standing column from the first frame, no giant puffs', () => {
    for (const scale of [1.15, 0.42, 0.55]) {
      const f = new FirePlume({ scale, embers: 20, smoke: 14, seed: 11 });
      f.pixelArt(puff, mat);
      f.update(1 / 60);
      const im = puffsOf(f);
      const m = new THREE.Matrix4();
      const s = new THREE.Vector3();
      let visible = 0;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        s.setFromMatrixScale(m);
        if (s.x > 0.01) visible++;
      }
      expect(visible, `scale ${scale}: a standing column on frame 1`).toBeGreaterThan(im.count / 2);
      check(f, scale, 6 * 60, `lit ${scale}`);
    }
  });

  it('a fire ignited in play builds its column up (nothing drawn from unborn particles)', () => {
    const f = new FirePlume({ scale: 1.6, embers: 20, smoke: 10, seed: 41 });
    f.active = false;
    f.pixelArt(puff, mat);
    f.update(1 / 60); // inactive: nothing moves
    f.active = true;
    f.update(1 / 60);
    const im = puffsOf(f);
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      s.setFromMatrixScale(m);
      expect(s.x, `puff ${i} hidden until spawned`).toBeLessThan(0.01);
    }
    expect(check(f, 1.6, 6 * 60, 'ignited')).toBeGreaterThan(0);
  });

  it('the classic smoke points are untouched (same colours with and without the painted puffs)', () => {
    const a = new FirePlume({ scale: 1, smoke: 12, seed: 5 });
    const b = new FirePlume({ scale: 1, smoke: 12, seed: 5 });
    b.pixelArt(puff, mat);
    for (let n = 0; n < 300; n++) {
      a.update(1 / 60);
      b.update(1 / 60);
    }
    const ca = (a as unknown as { smoke: { col: Float32Array; pos: Float32Array } }).smoke;
    const cb = (b as unknown as { smoke: { col: Float32Array; pos: Float32Array } }).smoke;
    expect(Array.from(cb.col)).toEqual(Array.from(ca.col));
    expect(Array.from(cb.pos)).toEqual(Array.from(ca.pos));
  });
});
