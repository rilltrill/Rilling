import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import type { Rng } from '../../../core/Rng';
import { tm } from './retro';

/**
 * Procedural tropical vegetation for JUNGLE RUN. Every builder returns a Group
 * with its origin on the ground; the scenery code positions it and then bakes
 * whole chunks with `merged()` (one draw call per chunk half, whatever the mix
 * of colours and retro textures), so triangle counts are what matter here.
 *
 * Retro texture densities: big canopy/far blobs use large leaves at low
 * strength (no shimmer in the distance), close fronds use smaller leaves.
 */
export const COL = {
  ground: 0x48672a,
  groundDark: 0x3a5622,
  groundLight: 0x5b7a30,
  litter: 0x6a5a34,
  // Light yellow ochre: a clear value/hue step under the tan raptors (0xa47c4a).
  road: 0xa8885a,
  roadTrack: 0x7a5d3e,
  verge: 0x6b8c34,
  fernA: 0x3d8a2c,
  fernB: 0x67a834,
  // Grey-brown, well away from raptor tan so leaping raptors keep their silhouette.
  palmTrunk: 0x766a58,
  palmRing: 0x52483a,
  palmFrond: 0x56962e,
  palmFrondDark: 0x3d7a28,
  trunk: 0x5a4632,
  canopyA: 0x2f6a28,
  canopyB: 0x46872e,
  canopyDark: 0x23511e,
  vine: 0x356a22,
  moss: 0x6e9a34,
  cycad: 0x6a9a2c,
  cycadTrunk: 0x6b5a3c,
  rock: 0x857f70,
  rockDark: 0x615c52,
  flowerR: 0xff5a3a,
  flowerY: 0xffd23a,
  flowerP: 0xff7ac0,
  coconut: 0x5a4024,
} as const;

function piv(parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(rx, ry, rz);
  parent.add(g);
  return g;
}

/**
 * Plant builders tag their group with `userData.flora` = the pixel species
 * (content/pixel/floraSpecies.ts) that stands in for it in ART: SPRITES (see
 * JungleEnv.floraSplit); the 3D geometry is the same in both modes.
 */
export class Flora {
  /** Jittered unit blobs (canopy, bushes). */
  private blobs: THREE.BufferGeometry[] = [];
  /** Cheaper 20-face blobs for distant canopy. */
  private lowBlobs: THREE.BufferGeometry[] = [];
  /** Jittered low-poly unit rocks. */
  private rocks: THREE.BufferGeometry[] = [];
  private bushes: THREE.BufferGeometry[] = [];
  /** Flat 7-gon for ground patches (only the top face is ever visible). */
  private disc: THREE.BufferGeometry;

  constructor() {
    this.disc = Kit.track(new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2));
    for (let i = 0; i < 6; i++) this.blobs.push(Kit.jitter(Kit.ico(1, 1), 0.32, 11 + i * 7));
    for (let i = 0; i < 6; i++) this.lowBlobs.push(Kit.jitter(Kit.ico(1, 0), 0.3, 41 + i * 9));
    for (let i = 0; i < 6; i++) this.rocks.push(Kit.jitter(Kit.ico(1, 0), 0.45, 31 + i * 5));
    for (let i = 0; i < 6; i++) this.bushes.push(Kit.jitter(Kit.ico(1, 0), 0.38, 71 + i * 3));
  }

  blob(rng: Rng) {
    return rng.pick(this.blobs);
  }

  lowBlob(rng: Rng) {
    return rng.pick(this.lowBlobs);
  }

  rockGeo(rng: Rng) {
    return rng.pick(this.rocks);
  }

  /** Giant arching fern (1.2–2.6 m). */
  fern(rng: Rng, scale = 1): THREE.Group {
    const g = new THREE.Group();
    g.userData.flora = 'fern';
    const n = rng.int(5, 7);
    const s = scale * rng.range(0.8, 1.25);
    const a0 = rng.next() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const mat = tm(rng.chance(0.5) ? COL.fernA : COL.fernB, 'leaves', 0.9, 0.7);
      const yaw = a0 + (i / n) * Math.PI * 2 + rng.spread(0.3);
      const tilt = rng.range(0.55, 1.05);
      const L = rng.range(1.0, 1.5) * s;
      const p = piv(g, 0, 0.1, 0, 0, yaw, 0);
      const base = piv(p, 0, 0, 0, tilt, 0, 0);
      // Lower half widens, upper half tapers to a drooping tip.
      Kit.add(base, Kit.cyl(0.26, 0.05, L, 3), mat, 0, L / 2, 0, 0, 0, 0, 1, 1, 0.3);
      const tip = piv(base, 0, L, 0, rng.range(0.5, 0.9), 0, 0);
      Kit.add(tip, Kit.cone(0.26, L * 0.9, 3), mat, 0, L * 0.45, 0, 0, 0, 0, 1, 1, 0.3);
    }
    return g;
  }

  /** Coconut palm with a gently curved, ringed trunk (7–11 m). */
  palm(rng: Rng): THREE.Group {
    const g = new THREE.Group();
    g.userData.flora = 'palm';
    const segs = 5;
    const segH = rng.range(1.5, 2.1);
    const lean = rng.range(0.03, 0.09);
    let parent: THREE.Object3D = piv(g, 0, 0, 0, 0, rng.next() * Math.PI * 2, 0);
    for (let i = 0; i < segs; i++) {
      const r = 0.22 - i * 0.018;
      Kit.add(parent, Kit.cyl(r - 0.03, r + 0.02, segH, 5), tm(i % 2 ? COL.palmRing : COL.palmTrunk, 'bark', 1.2, 0.75), 0, segH / 2, 0);
      parent = piv(parent, 0, segH, 0, lean, 0, 0);
    }
    // Crown.
    const nf = rng.int(8, 10);
    for (let i = 0; i < nf; i++) {
      const mat = tm(i % 3 === 0 ? COL.palmFrondDark : COL.palmFrond, 'leaves', 0.9, 0.7);
      const yaw = (i / nf) * Math.PI * 2 + rng.spread(0.25);
      const p = piv(parent, 0, 0.1, 0, 0, yaw, 0);
      const a = piv(p, 0, 0, 0, rng.range(0.7, 1.15), 0, 0);
      const L1 = rng.range(1.5, 1.9);
      Kit.add(a, Kit.cyl(0.42, 0.08, L1, 3), mat, 0, L1 / 2, 0, 0, 0, 0, 1, 1, 0.16);
      const b = piv(a, 0, L1, 0, rng.range(0.55, 0.85), 0, 0);
      const L2 = rng.range(1.4, 1.9);
      Kit.add(b, Kit.cone(0.42, L2, 3), mat, 0, L2 / 2, 0, 0, 0, 0, 1, 1, 0.16);
    }
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI * 2;
      Kit.add(parent, Kit.ico(0.18, 0), tm(COL.coconut, 'hide', 4, 0.6), Math.cos(a) * 0.22, -0.25, Math.sin(a) * 0.22);
    }
    return g;
  }

  /** Huge rainforest tree: buttress roots, tall trunk, layered canopy, hanging vines (14–19 m). */
  bigTree(rng: Rng, vines = true): THREE.Group {
    const g = new THREE.Group();
    g.userData.flora = 'jungleTree';
    const H = rng.range(10, 14);
    const bark = tm(COL.trunk, 'bark', 0.7);
    Kit.add(g, Kit.cyl(0.55, 0.85, H, 7), bark, 0, H / 2, 0);
    // Buttress roots.
    const nr = rng.int(3, 5);
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * Math.PI * 2 + rng.spread(0.4);
      const r = piv(g, Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7, 0, -a, 0);
      Kit.add(r, Kit.box(1.6, 1.8, 0.22), bark, 0.4, 0.7, 0, 0, 0, -0.5);
    }
    // Moss band.
    Kit.add(g, Kit.cyl(0.66, 0.74, 1.4, 7), tm(COL.moss, 'grass', 1.2, 0.9), 0, H * 0.45, 0);
    // Branches + canopy.
    const nb = rng.int(3, 5);
    for (let i = 0; i < nb; i++) {
      const a = rng.next() * Math.PI * 2;
      const y = H * rng.range(0.85, 1.05);
      const rad = rng.range(2.2, 3.6);
      const b = piv(g, 0, H * 0.78, 0, 0, a, 0);
      Kit.add(b, Kit.cyl(0.18, 0.3, rad * 1.2, 5), bark, 0, rad * 0.45, rad * 0.35, 0.9, 0, 0);
      const cm = tm(rng.pick([COL.canopyA, COL.canopyB, COL.canopyDark]), 'leaves', 0.55, 0.85);
      const s = rng.range(2.6, 3.8);
      Kit.add(g, this.lowBlob(rng), cm, Math.sin(a) * rad, y + rng.range(0, 1.5), Math.cos(a) * rad, 0, rng.next() * 6, 0, s, s * 0.6, s);
    }
    Kit.add(g, this.blob(rng), tm(COL.canopyA, 'leaves', 0.55, 0.85), 0, H + 1.2, 0, 0, rng.next() * 6, 0, 3.4, 2.2, 3.4);
    if (vines) {
      const nv = rng.int(2, 4);
      const vm = tm(COL.vine, 'leaves', 2, 0.6);
      for (let i = 0; i < nv; i++) {
        const a = rng.next() * Math.PI * 2;
        const rad = rng.range(1.5, 3.2);
        const len = rng.range(3, 7);
        Kit.add(g, Kit.box(0.07, len, 0.07), vm, Math.sin(a) * rad, H - len / 2 + 0.5, Math.cos(a) * rad, rng.spread(0.06), 0, rng.spread(0.06));
      }
      // Vines wrapped around the trunk.
      for (let i = 0; i < 2; i++) {
        Kit.add(g, Kit.box(0.1, H * 0.5, 0.1), vm, Math.cos(i * 2.1) * 0.66, H * (0.3 + i * 0.15), Math.sin(i * 2.1) * 0.66, 0.25, i * 2.1, 0.25);
      }
    }
    return g;
  }

  /** Background treeline filler: trunk + big dark canopy blobs. */
  canopy(rng: Rng): THREE.Group {
    const g = new THREE.Group();
    g.userData.flora = 'canopyTree';
    const H = rng.range(7, 12);
    Kit.add(g, Kit.cyl(0.4, 0.6, H, 5), tm(COL.trunk, 'bark', 0.6, 0.85), 0, H / 2, 0);
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const s = rng.range(3.5, 5.5);
      Kit.add(
        g,
        this.lowBlob(rng),
        tm(rng.pick([COL.canopyDark, COL.canopyA, COL.canopyDark]), 'leaves', 0.4, 0.7),
        rng.spread(2.5),
        H + rng.range(-1.5, 2),
        rng.spread(2.5),
        0,
        rng.next() * 6,
        0,
        s,
        s * rng.range(0.55, 0.8),
        s,
      );
    }
    return g;
  }

  /** Cycad: stubby scaly trunk with a stiff crown of fronds. */
  cycad(rng: Rng): THREE.Group {
    const g = new THREE.Group();
    g.userData.flora = 'cycad';
    const h = rng.range(0.6, 1.6);
    Kit.add(g, Kit.cyl(0.26, 0.34, h, 6), tm(COL.cycadTrunk, 'scales', 0.9), 0, h / 2, 0);
    const n = rng.int(9, 12);
    const m = tm(COL.cycad, 'leaves', 1, 0.7);
    for (let i = 0; i < n; i++) {
      const p = piv(g, 0, h, 0, 0, (i / n) * Math.PI * 2 + rng.spread(0.2), 0);
      const t = piv(p, 0, 0, 0, rng.range(0.6, 1.1), 0, 0);
      const L = rng.range(1.2, 1.8);
      Kit.add(t, Kit.cone(0.16, L, 3), m, 0, L / 2, 0, 0, 0, 0, 1, 1, 0.35);
    }
    return g;
  }

  /** Leafy bush with the odd tropical flower. */
  bush(rng: Rng, scale = 1, flowers = true): THREE.Group {
    const g = new THREE.Group();
    g.userData.flora = 'bush';
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const s = rng.range(0.8, 1.3) * scale;
      Kit.add(
        g,
        rng.pick(this.bushes),
        tm(rng.pick([COL.canopyB, COL.canopyA, COL.fernA]), 'leaves', 0.8, 0.85),
        rng.spread(0.9) * scale,
        s * 0.55,
        rng.spread(0.9) * scale,
        0,
        rng.next() * 6,
        0,
        s,
        s * 0.75,
        s,
      );
    }
    if (flowers && rng.chance(0.35)) {
      const fm = tm(rng.pick([COL.flowerR, COL.flowerY, COL.flowerP]), 'none', 1, 1, { emissive: 0x401008, emissiveIntensity: 0.3 });
      for (let i = 0; i < 3; i++) {
        Kit.add(g, Kit.ico(0.08, 0), fm, rng.spread(0.9) * scale, rng.range(0.7, 1.15) * scale, rng.spread(0.9) * scale);
      }
    }
    return g;
  }

  /** Boulder / cliff stone (light or dark grey); `scale` < 1 for huge cliff faces. */
  rockMat(light: boolean, scale = 0.8): THREE.MeshLambertMaterial {
    return tm(light ? COL.rock : COL.rockDark, 'rock', scale);
  }

  /** Mossy boulder. */
  rock(rng: Rng, s = 1): THREE.Group {
    const g = new THREE.Group();
    const geo = this.rockGeo(rng);
    Kit.add(g, geo, this.rockMat(rng.chance(0.5)), 0, s * 0.35, 0, 0, rng.next() * 6, 0, s * rng.range(0.9, 1.4), s * rng.range(0.6, 0.9), s);
    if (s > 0.8 && rng.chance(0.6)) {
      Kit.add(g, geo, tm(COL.moss, 'grass', 1.2, 0.9), 0, s * 0.62, 0, 0, rng.next() * 6, 0, s * 0.8, s * 0.25, s * 0.75);
    }
    return g;
  }

  /** Tall grass tuft. */
  grass(rng: Rng): THREE.Group {
    const g = new THREE.Group();
    g.userData.flora = 'grass';
    const m = tm(rng.chance(0.5) ? COL.verge : COL.fernB, 'grass', 1.2, 0.6);
    const n = rng.int(4, 6);
    for (let i = 0; i < n; i++) {
      const h = rng.range(0.6, 1.2);
      Kit.add(g, Kit.cone(0.07, h, 3), m, rng.spread(0.3), h / 2, rng.spread(0.3), rng.spread(0.3), 0, rng.spread(0.3));
    }
    return g;
  }

  /** Flat ground-cover patch (moss, leaf litter), sunk just below the road/verge ribbons (top at y ≈ -0.03). */
  patch(rng: Rng): THREE.Group {
    const g = new THREE.Group();
    const s = rng.range(1.5, 4);
    const k = rng.int(0, 2);
    const mat = k === 2 ? tm(COL.litter, 'leaves', 0.7) : tm(k ? COL.groundLight : COL.groundDark, 'grass', 0.4);
    Kit.add(g, this.disc, mat, 0, -0.03, 0, 0, rng.next() * 6, 0, s, 1, s * rng.range(0.5, 1));
    return g;
  }
}
