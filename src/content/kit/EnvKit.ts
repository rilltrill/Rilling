import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from './ModelKit';
import { Rng } from '../../core/Rng';

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _m = new THREE.Matrix4();

export interface CurveFrame {
  /** Point on the rail at distance d. */
  pos: THREE.Vector3;
  /** Unit tangent (flattened to XZ). */
  forward: THREE.Vector3;
  /** Unit right vector (XZ). */
  right: THREE.Vector3;
  /** Yaw such that an object's -Z faces along the rail (same convention as the rig). */
  heading: number;
}

/** Helpers for building scenery along the rail. */
export const EnvKit = {
  /** Frame (position + orientation) at metre-distance `d` along `curve`. */
  frameAt(curve: THREE.Curve<THREE.Vector3>, d: number): CurveFrame {
    const len = curve.getLength();
    const u = THREE.MathUtils.clamp(d / len, 0, 1);
    const pos = curve.getPointAt(u, new THREE.Vector3());
    curve.getTangentAt(u, _t);
    const forward = new THREE.Vector3(_t.x, 0, _t.z);
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const heading = Math.atan2(-forward.x, -forward.z);
    return { pos, forward, right, heading };
  },

  /** World position at rail distance d, `side` metres to the right (negative = left), `up` metres up. */
  besideRail(curve: THREE.Curve<THREE.Vector3>, d: number, side: number, up = 0): THREE.Vector3 {
    const f = EnvKit.frameAt(curve, d);
    return f.pos.addScaledVector(f.right, side).setY(f.pos.y + up);
  },

  /**
   * Call `place` repeatedly along the rail. Useful for buildings, trees, lamp posts.
   * `place` receives a frame and must return an Object3D (or null to skip); it is
   * positioned for you at `pos + right * lateral` and rotated to face the rail.
   */
  scatterAlong(
    root: THREE.Object3D,
    curve: THREE.Curve<THREE.Vector3>,
    opts: {
      from?: number;
      to?: number;
      spacing: number;
      /** Lateral distance range from the rail (metres). */
      lateral: [number, number];
      sides?: 'both' | 'left' | 'right';
      jitter?: number;
      seed?: number;
      /** Rotate objects so their +Z faces the rail. */
      faceRail?: boolean;
      place(rng: Rng, i: number, side: 1 | -1, frame: CurveFrame): THREE.Object3D | null;
    },
  ): THREE.Object3D[] {
    const rng = new Rng(opts.seed ?? 7);
    const len = curve.getLength();
    const from = opts.from ?? 0;
    const to = Math.min(opts.to ?? len, len);
    const out: THREE.Object3D[] = [];
    const sides: (1 | -1)[] = opts.sides === 'left' ? [-1] : opts.sides === 'right' ? [1] : [-1, 1];
    let i = 0;
    for (let d = from; d <= to; d += opts.spacing) {
      for (const side of sides) {
        const dd = d + rng.spread((opts.jitter ?? 0) * opts.spacing);
        const f = EnvKit.frameAt(curve, dd);
        const obj = opts.place(rng, i++, side, f);
        if (!obj) continue;
        const lat = rng.range(opts.lateral[0], opts.lateral[1]) * side;
        obj.position.copy(f.pos).addScaledVector(f.right, lat).add(obj.position);
        if (opts.faceRail !== false) obj.rotation.y += f.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        root.add(obj);
        out.push(obj);
      }
    }
    return out;
  },

  /**
   * Flat ribbon following the curve (roads, paths, rails, rivers).
   * Returns a tracked mesh. `uRepeat` metres per texture/colour band are irrelevant
   * for plain colours; vertex colours can stripe the road via `stripe`.
   */
  ribbon(
    curve: THREE.Curve<THREE.Vector3>,
    width: number,
    mat: THREE.Material,
    opts: { from?: number; to?: number; step?: number; y?: number; offset?: number } = {},
  ): THREE.Mesh {
    const len = curve.getLength();
    const from = opts.from ?? 0;
    const to = Math.min(opts.to ?? len, len);
    const step = opts.step ?? 2;
    const pos: number[] = [];
    const idx: number[] = [];
    let n = 0;
    for (let d = from; d <= to + 0.001; d += step) {
      const f = EnvKit.frameAt(curve, Math.min(d, to));
      const c = f.pos.clone().addScaledVector(f.right, opts.offset ?? 0);
      const y = c.y + (opts.y ?? 0.01);
      pos.push(c.x - f.right.x * width / 2, y, c.z - f.right.z * width / 2);
      pos.push(c.x + f.right.x * width / 2, y, c.z + f.right.z * width / 2);
      if (n > 0) {
        const a = (n - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // Winding (left, right, nextLeft) / (right, nextRight, nextLeft) faces +Y.
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(Kit.track(g), mat);
  },

  /** Large flat ground plane centred on (x, z). */
  ground(size: number, color: number, x = 0, z = 0, y = 0): THREE.Mesh {
    const m = new THREE.Mesh(Kit.plane(size, size), Kit.mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  },

  /** Gradient sky dome (unlit, no fog). */
  sky(top: number, horizon: number, bottom = horizon, radius = 320): THREE.Mesh {
    const g = Kit.track(new THREE.SphereGeometry(radius, 16, 10));
    const colors: number[] = [];
    const ct = new THREE.Color(top);
    const ch = new THREE.Color(horizon);
    const cb = new THREE.Color(bottom);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / radius;
      if (y >= 0) c.copy(ch).lerp(ct, Math.pow(y, 0.6));
      else c.copy(ch).lerp(cb, Math.min(1, -y * 3));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const m = new THREE.Mesh(
      g,
      Kit.track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })),
    );
    m.renderOrder = -1;
    m.frustumCulled = false;
    m.name = 'sky';
    return m;
  },

  /** Standard light rig: hemisphere fill + directional key. Returns the lights. */
  lights(
    scene: THREE.Object3D,
    o: { sky: number; ground: number; hemi: number; sun: number; sunIntensity: number; sunDir?: [number, number, number] },
  ) {
    const hemi = new THREE.HemisphereLight(o.sky, o.ground, o.hemi);
    const sun = new THREE.DirectionalLight(o.sun, o.sunIntensity);
    const d = o.sunDir ?? [0.4, 1, 0.3];
    sun.position.set(d[0], d[1], d[2]).multiplyScalar(50);
    scene.add(hemi, sun);
    return { hemi, sun };
  },

  /**
   * Merge all static meshes under `group` into one mesh per material (huge draw-call
   * saver for scenery). Source meshes are removed. Don't use on anything that moves,
   * is shootable or is an occluder you need individually.
   */
  mergeStatic(group: THREE.Object3D): THREE.Mesh[] {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const toRemove: THREE.Mesh[] = [];
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      // Skip already-baked vertex-coloured meshes (merging would strip their colours).
      if (!m.isMesh || Array.isArray(m.material) || m.userData.noMerge || (m.material as THREE.MeshLambertMaterial).vertexColors) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      // Keep only attributes every geometry shares so mergeGeometries succeeds.
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      _m.multiplyMatrices(inv, m.matrixWorld);
      g.applyMatrix4(_m);
      const list = byMat.get(m.material) ?? [];
      list.push(g);
      byMat.set(m.material, list);
      toRemove.push(m);
    });
    for (const m of toRemove) m.parent?.remove(m);
    const out: THREE.Mesh[] = [];
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(Kit.track(merged), mat);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      out.push(mesh);
    }
    return out;
  },

  /** Deterministic RNG for scenery. */
  rng(seed: number) {
    return new Rng(seed);
  },

  /** Utility: world point → reuse vector. */
  v(x: number, y: number, z: number) {
    return _p.set(x, y, z).clone();
  },
};
