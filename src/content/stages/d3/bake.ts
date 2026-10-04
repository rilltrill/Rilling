import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, type TexName } from '../../kit/ModelKit';

/**
 * Static-scenery baking for TYRANT CHASE.
 *
 * `Baker.bake(group)` merges every opaque Lambert/Basic mesh under `group` into
 * ONE vertex-coloured mesh per (retro texture × side × sway) bucket. Colours
 * come from each source material (so dozens of Kit.mat colours collapse into a
 * single draw call) and glow (unlit) materials are baked into one unlit mesh.
 *
 * Swaying foliage: put `userData.sway = { amp, h }` on a plant's root group
 * (amp = metres of sway at the top, h = plant height). Its meshes are baked
 * with a per-vertex weight into a material whose vertex shader bends the plant
 * in the wind — zero CPU cost per frame (one uniform update).
 */

export interface SwaySpec {
  amp: number;
  h: number;
}

const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _col = new THREE.Color();
const _em = new THREE.Color();
const _o = new THREE.Vector3();

interface Bucket {
  geos: THREE.BufferGeometry[];
  tex: string;
  side: THREE.Side;
  sway: boolean;
  glow: boolean;
}

export class Baker {
  /** Shared wind uniforms: uTime (s), uWind.xz = direction, uWind.y = gust offset. */
  readonly uniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3(0.8, 0, 0.6) },
  };
  private swayMats = new Map<string, THREE.Material>();
  private glowMat: THREE.MeshBasicMaterial | null = null;

  /** Advance the wind (call every frame). `gust` is an extra push in metres-ish. */
  wind(dt: number, gust: number) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value.y = gust;
  }

  private glowMaterial(): THREE.MeshBasicMaterial {
    if (!this.glowMat) {
      this.glowMat = Kit.track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
    }
    return this.glowMat;
  }

  /** Lambert material bending vertices by their `aSway` weight. */
  swayMaterial(tex: string, side: THREE.Side): THREE.Material {
    const key = `${tex}|${side}`;
    let m = this.swayMats.get(key);
    if (m) return m;
    const base = tex
      ? Kit.mat(0xffffff, { vertexColors: true, tex: tex as TexName, side })
      : Kit.mat(0xffffff, { vertexColors: true, side });
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side });
    const uniforms = this.uniforms;
    mat.onBeforeCompile = (shader, renderer) => {
      base.onBeforeCompile(shader, renderer);
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWind = uniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uTime;\nuniform vec3 uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float ph = position.x * 0.17 + position.z * 0.13;
            float s = sin(uTime * 1.7 + ph) * 0.55 + sin(uTime * 4.1 + ph * 1.9) * 0.22 + uWind.y;
            transformed.x += uWind.x * aSway * s;
            transformed.z += uWind.z * aSway * s;
            transformed.y -= aSway * abs(s) * 0.18;
          }`,
        );
    };
    const baseKey = base.customProgramCacheKey();
    mat.customProgramCacheKey = () => `${baseKey}|d3sway`;
    m = Kit.track(mat);
    this.swayMats.set(key, m);
    return m;
  }

  /**
   * Merge `group`'s static meshes in place (sources removed, baked meshes added
   * as direct children). Meshes flagged `userData.noMerge`, transparent ones and
   * non-Lambert/Basic materials are hoisted and kept as-is. Returns the baked meshes.
   */
  bake(group: THREE.Object3D): THREE.Mesh[] {
    group.updateMatrixWorld(true);
    _inv.copy(group.matrixWorld).invert();
    const buckets = new Map<string, Bucket>();
    const remove: THREE.Mesh[] = [];
    const visit = (o: THREE.Object3D, sway: { spec: SwaySpec; baseY: number } | null) => {
      let sw = sway;
      const spec = o.userData.sway as SwaySpec | undefined;
      if (spec) {
        _o.setFromMatrixPosition(o.matrixWorld).applyMatrix4(_inv);
        sw = { spec, baseY: _o.y };
      }
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !mesh.userData.noMerge && !Array.isArray(mesh.material)) {
        const mat = mesh.material as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number };
        const lambert = (mat as THREE.MeshLambertMaterial).isMeshLambertMaterial;
        const basic = (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
        if ((lambert || basic) && !mat.transparent && mat.color && !(mat as THREE.MeshLambertMaterial).vertexColors) {
          const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
          _m.multiplyMatrices(_inv, mesh.matrixWorld);
          geo.applyMatrix4(_m);
          const n = geo.attributes.position.count;
          const cols = new Float32Array(n * 3);
          _col.copy(mat.color);
          if (lambert && mat.emissive) _col.add(_em.copy(mat.emissive).multiplyScalar((mat.emissiveIntensity ?? 1) * 0.8));
          for (let i = 0; i < n; i++) {
            cols[i * 3] = _col.r;
            cols[i * 3 + 1] = _col.g;
            cols[i * 3 + 2] = _col.b;
          }
          geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          const swaying = lambert && !!sw;
          if (swaying) {
            const pos = geo.attributes.position as THREE.BufferAttribute;
            const w = new Float32Array(n);
            const { spec, baseY } = sw!;
            for (let i = 0; i < n; i++) {
              const k = THREE.MathUtils.clamp((pos.getY(i) - baseY) / spec.h, 0, 1.3);
              w[i] = spec.amp * k * k;
            }
            geo.setAttribute('aSway', new THREE.BufferAttribute(w, 1));
          }
          const tex = basic ? '' : ((mat.userData.retroTex as string | undefined) ?? '');
          const side = mat.side;
          const key = `${basic ? 'glow' : tex}|${side}|${swaying ? 1 : 0}`;
          let b = buckets.get(key);
          if (!b) {
            b = { geos: [], tex: tex === 'grain' ? '' : tex, side, sway: swaying, glow: basic };
            buckets.set(key, b);
          }
          b.geos.push(geo);
          remove.push(mesh);
        }
      }
      for (const c of o.children) visit(c, sw);
    };
    visit(group, null);
    for (const m of remove) m.parent?.remove(m);
    // Hoist leftovers (transparent / special meshes) and drop empty pivots.
    const keep: THREE.Object3D[] = [];
    group.traverse((o) => {
      if (o !== group && ((o as THREE.Mesh).isMesh || (o as THREE.Light).isLight || (o as THREE.LineSegments).isLineSegments)) keep.push(o);
    });
    for (const o of keep) group.attach(o);
    for (const c of [...group.children]) if (!keep.includes(c)) group.remove(c);
    const out: THREE.Mesh[] = [];
    for (const b of buckets.values()) {
      const geo = mergeGeometries(b.geos, false);
      b.geos.forEach((g) => g.dispose());
      if (!geo) continue;
      geo.computeBoundingSphere();
      let mat: THREE.Material;
      if (b.glow) mat = this.glowMaterial();
      else if (b.sway) mat = this.swayMaterial(b.tex, b.side);
      else
        mat = b.tex
          ? Kit.mat(0xffffff, { vertexColors: true, tex: b.tex as TexName, side: b.side })
          : Kit.mat(0xffffff, { vertexColors: true, side: b.side });
      const mesh = new THREE.Mesh(Kit.track(geo), mat);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}

/** Mark a plant/banner root as swaying (see Baker). Returns the object. */
export function sway<T extends THREE.Object3D>(o: T, amp: number, h: number): T {
  o.userData.sway = { amp, h } satisfies SwaySpec;
  return o;
}
