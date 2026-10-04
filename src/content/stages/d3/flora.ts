import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { Rng } from '../../../core/Rng';
import { sway } from './bake';

/** Night-jungle palette (lifted a little so silhouettes read under moonlight). */
export const FLORA = {
  frond: [0x3f6d3a, 0x4a7b42, 0x355f36, 0x557f3e],
  canopy: [0x2d5631, 0x274b2c, 0x355f38, 0x3a5a2a],
  fern: [0x3f7444, 0x4b7d3e, 0x356a3c],
  palmTrunk: 0x6e5d4a,
  palmRing: 0x4c3f32,
  trunk: 0x4f4335,
  vine: 0x2f4a26,
  rock: [0x5a5850, 0x4c4a44, 0x666258],
  coconut: 0x4a3a22,
  ear: [0x2f6a3a, 0x3a7a44],
} as const;

/**
 * Procedural tropical plants. One instance per environment: holds the shared
 * custom geometries (fronds, jittered blobs) so hundreds of plants reuse them.
 */
export class Flora {
  private frondGeos: THREE.BufferGeometry[] = [];
  private fernGeo: THREE.BufferGeometry;
  private earGeo: THREE.BufferGeometry;
  private blobs: THREE.BufferGeometry[] = [];
  private lowBlobs: THREE.BufferGeometry[] = [];
  private rocks: THREE.BufferGeometry[] = [];

  constructor() {
    this.frondGeos = [this.frond(3.4, 0.62, 1.5, 0.5), this.frond(3.0, 0.55, 1.9, 0.35), this.frond(3.8, 0.66, 1.2, 0.6)];
    this.fernGeo = this.frondN(1.5, 0.32, 0.7, 0.55, 3);
    this.earGeo = this.leaf(1.1, 0.75);
    for (let i = 0; i < 4; i++) this.blobs.push(Kit.jitter(Kit.ico(1, 1), 0.22, 11 + i * 7));
    for (let i = 0; i < 3; i++) this.lowBlobs.push(Kit.jitter(Kit.ico(1, 0), 0.18, 23 + i * 5));
    for (let i = 0; i < 3; i++) this.rocks.push(Kit.jitter(Kit.ico(1, 0), 0.32, 41 + i * 5));
  }

  /**
   * Pinnate frond along +Z: V-creased strip that rises then droops, with a
   * serrated edge. DoubleSide material expected.
   */
  private frond(len: number, width: number, droop: number, rise: number): THREE.BufferGeometry {
    return this.frondN(len, width, droop, rise, 5);
  }

  private frondN(len: number, width: number, droop: number, rise: number, segs: number): THREE.BufferGeometry {
    const pos: number[] = [];
    const pt = (i: number, side: number): [number, number, number] => {
      const t = i / segs;
      const z = t * len;
      const yc = rise * t * len * 0.5 - droop * t * t;
      if (side === 0) return [0, yc, z];
      const serr = i % 2 === 0 ? 1 : 0.72;
      const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.04)), 0.7) * serr;
      return [side * w, yc - w * 0.32, z + w * 0.18];
    };
    for (let i = 0; i < segs; i++) {
      for (const side of [-1, 1]) {
        const a = pt(i, 0);
        const b = pt(i + 1, 0);
        const c = pt(i + 1, side);
        const d = pt(i, side);
        pos.push(...a, ...c, ...b, ...a, ...d, ...c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return Kit.track(g);
  }

  /** Broad elephant-ear leaf (flat diamond with a centre crease) along +Z. */
  private leaf(len: number, width: number): THREE.BufferGeometry {
    const pos = [
      0, 0, 0, width / 2, 0.05, len * 0.45, 0, -0.06, len * 0.5,
      0, 0, 0, 0, -0.06, len * 0.5, -width / 2, 0.05, len * 0.45,
      0, -0.06, len * 0.5, width / 2, 0.05, len * 0.45, 0, -0.15, len,
      0, -0.06, len * 0.5, 0, -0.15, len, -width / 2, 0.05, len * 0.45,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return Kit.track(g);
  }

  /** Curved coconut palm, 6–11 m. Sways (trunk bends, crown thrashes). */
  palm(rng: Rng, height = rng.range(6.5, 11), lean = rng.range(0.05, 0.22)): THREE.Group {
    const root = new THREE.Group();
    const bark = Kit.tex('bark', FLORA.palmTrunk, 1.5, 0.8);
    const ring = Kit.mat(FLORA.palmRing);
    const segs = 5;
    const segLen = height / segs;
    let parent: THREE.Object3D = root;
    const yawLean = rng.range(0, Math.PI * 2);
    root.rotation.y = yawLean;
    for (let i = 0; i < segs; i++) {
      const p = Kit.pivot(parent, 0, i === 0 ? 0 : segLen, 0);
      p.rotation.z = lean * (i === 0 ? 0.6 : 0.35 + i * 0.12);
      const r0 = 0.24 - i * 0.018;
      Kit.add(p, Kit.cyl(r0 - 0.018, r0, segLen + 0.04, 5), bark, 0, segLen / 2, 0);
      if (i === segs - 1) Kit.add(p, Kit.cyl(r0 + 0.03, r0 + 0.03, 0.14, 5), ring, 0, segLen * 0.95, 0);
      parent = p;
    }
    const crown = Kit.pivot(parent, 0, segLen, 0);
    const n = rng.int(7, 9);
    for (let i = 0; i < n; i++) {
      const f = Kit.pivot(crown, 0, 0.05, 0);
      f.rotation.set(0, (i / n) * Math.PI * 2 + rng.spread(0.25), 0);
      const geo = this.frondGeos[rng.int(0, this.frondGeos.length - 1)];
      const m = Kit.add(f, geo, Kit.mat(rng.pick(FLORA.frond), { side: THREE.DoubleSide, tex: 'leaves', texScale: 1.4, texStrength: 0.7 }));
      m.rotation.x = -rng.range(0.05, 0.45);
      m.scale.setScalar(rng.range(0.85, 1.15));
    }
    Kit.add(crown, Kit.ico(0.3, 0), Kit.mat(FLORA.coconut), 0, -0.22, 0, 0, 0, 0, 1, 0.7, 1);
    return sway(root, 0.55 + height * 0.03, height);
  }

  /** Big rainforest tree: buttressed trunk, layered canopy, hanging vines. */
  jungleTree(rng: Rng, height = rng.range(9, 15), lod = 1): THREE.Group {
    const root = new THREE.Group();
    root.rotation.y = rng.range(0, Math.PI * 2);
    const bark = Kit.tex('bark', FLORA.trunk, 1, 0.9);
    const r = rng.range(0.38, 0.55);
    Kit.add(root, Kit.cyl(r * 0.7, r, height, 7), bark, 0, height / 2, 0);
    for (let i = 0; i < (lod ? 3 : 0); i++) {
      const a = (i / 3) * Math.PI * 2 + rng.spread(0.4);
      Kit.add(root, Kit.box(0.14, 1.6, r * 2.6), bark, Math.cos(a) * r * 0.9, 0.7, Math.sin(a) * r * 0.9, 0, -a, 0);
    }
    const leaf = Kit.mat(rng.pick(FLORA.canopy), { side: THREE.DoubleSide, tex: 'leaves', texScale: 0.8, texStrength: 0.9 });
    const leaf2 = Kit.mat(rng.pick(FLORA.canopy), { side: THREE.DoubleSide, tex: 'leaves', texScale: 0.8, texStrength: 0.9 });
    const blobs = rng.int(3, 5);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + rng.spread(0.6);
      const d = i === 0 ? 0 : rng.range(1.4, 2.6);
      const s = rng.range(2.2, 3.4);
      Kit.add(root, rng.pick(lod ? this.blobs : this.lowBlobs), i % 2 ? leaf : leaf2, Math.cos(a) * d, height - rng.range(-0.3, 1.6), Math.sin(a) * d, 0, a, 0, s, s * 0.62, s);
    }
    // Branches reaching into the canopy.
    for (let i = 0; i < (lod ? 2 : 0); i++) {
      const a = rng.range(0, Math.PI * 2);
      Kit.add(root, Kit.cyl(0.1, 0.18, 3.2, 5), bark, Math.cos(a) * 0.9, height - 2.6, Math.sin(a) * 0.9, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    }
    const vine = Kit.mat(FLORA.vine);
    const vines = lod ? rng.int(2, 5) : 0;
    for (let i = 0; i < vines; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(1.2, 2.8);
      const l = rng.range(2.5, 6);
      Kit.add(root, Kit.cyl(0.03, 0.03, l, 3), vine, Math.cos(a) * d, height - 1.2 - l / 2, Math.sin(a) * d);
    }
    return sway(root, 0.28, height);
  }

  /** Ground fern (sways). */
  fern(rng: Rng, scale = rng.range(0.8, 1.5)): THREE.Group {
    const root = new THREE.Group();
    const mat = Kit.mat(rng.pick(FLORA.fern), { side: THREE.DoubleSide, tex: 'leaves', texScale: 2, texStrength: 0.6 });
    const n = rng.int(5, 7);
    for (let i = 0; i < n; i++) {
      const m = Kit.add(root, this.fernGeo, mat, 0, 0.05, 0);
      m.rotation.set(-rng.range(0.4, 0.8), (i / n) * Math.PI * 2 + rng.spread(0.3), 0, 'YXZ');
    }
    root.scale.setScalar(scale);
    return sway(root, 0.22 * scale, 1.2 * scale);
  }

  /** Elephant-ear plant: big leaves on stalks (sways). */
  earPlant(rng: Rng, scale = rng.range(0.9, 1.6)): THREE.Group {
    const root = new THREE.Group();
    const stalk = Kit.mat(0x3f6a34);
    const mat = Kit.mat(rng.pick(FLORA.ear), { side: THREE.DoubleSide, tex: 'leaves', texScale: 1.5, texStrength: 0.5 });
    const n = rng.int(4, 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.spread(0.4);
      const h = rng.range(0.7, 1.4);
      const p = Kit.pivot(root, Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15);
      p.rotation.set(0, -a + Math.PI / 2, 0);
      Kit.add(p, Kit.cyl(0.025, 0.035, h, 4), stalk, 0, h / 2, 0, 0.35, 0, 0);
      const lf = Kit.add(p, this.earGeo, mat, 0, h, h * 0.18);
      lf.rotation.x = rng.range(0.2, 0.6);
    }
    root.scale.setScalar(scale);
    return sway(root, 0.18 * scale, 1.4 * scale);
  }

  /** Dense undergrowth blob (static). */
  bush(rng: Rng, scale = rng.range(0.8, 1.6)): THREE.Group {
    const root = new THREE.Group();
    const leaf = Kit.mat(rng.pick(FLORA.canopy), { side: THREE.DoubleSide, tex: 'leaves', texScale: 1.6, texStrength: 0.8 });
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const s = rng.range(0.7, 1.1) * scale;
      Kit.add(root, rng.pick(this.blobs), leaf, rng.spread(0.7) * scale, s * 0.45, rng.spread(0.7) * scale, 0, rng.range(0, 3), 0, s, s * 0.7, s);
    }
    return sway(root, 0.06 * scale, 1.2 * scale);
  }

  rock(rng: Rng, scale = rng.range(0.5, 1.6)): THREE.Mesh {
    const m = Kit.mesh(rng.pick(this.rocks), Kit.tex('rock', rng.pick(FLORA.rock), 1, 0.9));
    m.scale.set(scale * rng.range(0.9, 1.4), scale * rng.range(0.5, 0.9), scale * rng.range(0.9, 1.3));
    m.rotation.y = rng.range(0, Math.PI * 2);
    m.position.y = scale * 0.2;
    return m;
  }

  /** A snapped palm trunk with a ragged frond tuft (roadside debris / thrown debris). */
  brokenPalm(rng: Rng, len = 4.5): THREE.Group {
    const g = new THREE.Group();
    const bark = Kit.tex('bark', FLORA.palmTrunk, 1.5, 0.8);
    Kit.add(g, Kit.cyl(0.2, 0.24, len, 6), bark, 0, 0, 0, Math.PI / 2, 0, 0);
    for (let i = 0; i < 4; i++) Kit.add(g, Kit.cyl(0.26, 0.26, 0.08, 6), Kit.mat(FLORA.palmRing), 0, 0, -len / 2 + 0.5 + i * (len / 4.5), Math.PI / 2, 0, 0);
    const mat = Kit.mat(FLORA.frond[0], { side: THREE.DoubleSide, tex: 'leaves', texScale: 1.4, texStrength: 0.7 });
    for (let i = 0; i < 5; i++) {
      const m = Kit.add(g, this.frondGeos[i % 3], mat, 0, 0, len / 2);
      m.rotation.set(rng.range(-0.6, 0.6), (i / 5) * Math.PI * 2, 0, 'YXZ');
      m.scale.setScalar(0.7);
    }
    return g;
  }
}
