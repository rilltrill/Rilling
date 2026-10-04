import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from '../../kit/ModelKit';
import { PACKED, bakedLambert, packColor, packTexBytes, retroHook, texOf } from './retro';

/**
 * Static-scenery baking for TYRANT CHASE.
 *
 * `Baker.bake(group)` merges every opaque Lambert/Basic mesh under `group` into
 * ONE vertex-coloured mesh per (side × sway) bucket. Colours come from each
 * source material and so does its retro texture: name, texScale and
 * texStrength travel per vertex (`aTex`, see retro.ts), so dozens of textured
 * Kit materials collapse into a single draw call. Glow (unlit) materials are
 * baked into one unlit mesh.
 *
 * Memory: lit buckets use the packed 20-byte vertex layout (retro.ts `PACKED`:
 * float position + sRGB colour/sway bytes + texture-parameter bytes, no
 * normals — flat shading and the texture projection both come from screen
 * derivatives). d3 bakes ≈ 1 M vertices (mostly foliage), so this keeps the
 * stage at ≈ 20 MB of vertex data instead of ≈ 55 MB with float attributes.
 * Glow buckets (small; colours may exceed 1) keep float position + colour.
 * The CPU copies stay alive on purpose: three.js re-uploads them after a
 * WebGL context restore.
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

interface BucketMeta {
  key: string;
  side: THREE.Side;
  sway: boolean;
  glow: boolean;
}

interface Bucket extends BucketMeta {
  geos: THREE.BufferGeometry[];
}

/**
 * A baked plant/prop variant: raw per-bucket vertex data in its own local space.
 * Lit buckets: `col` = packed aCol bytes (4/vertex) and `tex` = aTex bytes;
 * glow buckets: `col` = float RGB (3/vertex), `tex` = null.
 */
export interface Prefab {
  buckets: { meta: BucketMeta; pos: Float32Array; col: Uint8Array | Float32Array; tex: Uint8Array | null }[];
}

const _tb = new Uint8Array(4);
const _cb = new Uint8Array(4);

export class Baker {
  /** Shared wind uniforms: uTime (s), uWind.xz = direction, uWind.y = gust offset. */
  readonly uniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3(0.8, 0, 0.6) },
  };
  private mats = new Map<string, THREE.Material>();
  private glowMat: THREE.MeshBasicMaterial | null = null;

  /** Advance the wind (call every frame). `gust` is an extra push in metres-ish. */
  wind(dt: number, gust: number) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value.y = gust;
  }

  private glowMaterial(): THREE.MeshBasicMaterial {
    if (!this.glowMat) {
      this.glowMat = Kit.track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true }));
    }
    return this.glowMat;
  }

  /** Per-vertex-textured Lambert bending vertices by their `aSway` weight. */
  swayMaterial(side: THREE.Side): THREE.Material {
    const key = `sway|${side}`;
    let m = this.mats.get(key);
    if (m) return m;
    const mat = Kit.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side }));
    const uniforms = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWind = uniforms.uWind;
      // The sway weight rides in the packed colour's alpha byte (aCol is declared by the retro hook).
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float aSway = aCol.a * ${PACKED.SWAY_MAX.toFixed(3)};
            float ph = position.x * 0.17 + position.z * 0.13;
            float s = sin(uTime * 1.7 + ph) * 0.55 + sin(uTime * 4.1 + ph * 1.9) * 0.22 + uWind.y;
            transformed.x += uWind.x * aSway * s;
            transformed.z += uWind.z * aSway * s;
            transformed.y -= aSway * abs(s) * 0.18;
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'd3sway2';
    m = retroHook(mat, { mode: 'packed' });
    this.mats.set(key, m);
    return m;
  }

  /** Per-vertex-textured static Lambert for one face side. */
  litMaterial(side: THREE.Side): THREE.Material {
    const key = `lit|${side}`;
    let m = this.mats.get(key);
    if (!m) {
      m = bakedLambert({ side, packed: true });
      this.mats.set(key, m);
    }
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
          for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name);
          _m.multiplyMatrices(_inv, mesh.matrixWorld);
          geo.applyMatrix4(_m);
          const n = geo.attributes.position.count;
          _col.copy(mat.color);
          if (lambert && mat.emissive) _col.add(_em.copy(mat.emissive).multiplyScalar((mat.emissiveIntensity ?? 1) * 0.8));
          const swaying = lambert && !!sw;
          if (basic) {
            // Glow: float colour (unlit, may exceed 1).
            const cols = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
              cols[i * 3] = _col.r;
              cols[i * 3 + 1] = _col.g;
              cols[i * 3 + 2] = _col.b;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          } else {
            // Packed: sRGB colour bytes + sway weight byte, texture-parameter bytes.
            const cb = new Uint8Array(n * 4);
            const tb = new Uint8Array(n * 4);
            packColor(_col, 0, _cb);
            packTexBytes(texOf(mat), _tb);
            for (let i = 0; i < n; i++) {
              cb.set(_cb, i * 4);
              tb.set(_tb, i * 4);
            }
            if (swaying) {
              const pos = geo.attributes.position as THREE.BufferAttribute;
              const { spec, baseY } = sw!;
              for (let i = 0; i < n; i++) {
                const k = THREE.MathUtils.clamp((pos.getY(i) - baseY) / spec.h, 0, 1.3);
                cb[i * 4 + 3] = Math.min(255, Math.round(((spec.amp * k * k) / PACKED.SWAY_MAX) * 255));
              }
            }
            geo.setAttribute('aCol', new THREE.BufferAttribute(cb, 4, true));
            geo.setAttribute('aTex', new THREE.BufferAttribute(tb, 4, false));
          }
          const side = mat.side;
          const key = `${basic ? 'glow' : 'lit'}|${side}|${swaying ? 1 : 0}`;
          let b = buckets.get(key);
          if (!b) {
            b = { key, geos: [], side, sway: swaying, glow: basic };
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
      const mesh = new THREE.Mesh(Kit.track(geo), this.materialFor(b));
      mesh.userData.bucket = { key: b.key, side: b.side, sway: b.sway, glow: b.glow } satisfies BucketMeta;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      out.push(mesh);
    }
    return out;
  }

  materialFor(b: BucketMeta): THREE.Material {
    if (b.glow) return this.glowMaterial();
    if (b.sway) return this.swayMaterial(b.side);
    return this.litMaterial(b.side);
  }

  /** Bake a plant/prop (built at the origin) into a reusable vertex-data prefab. */
  prefab(group: THREE.Object3D): Prefab {
    group.position.set(0, 0, 0);
    const meshes = this.bake(group);
    const buckets: Prefab['buckets'] = [];
    for (const m of meshes) {
      const g = m.geometry;
      const meta = m.userData.bucket as BucketMeta;
      const tx = g.getAttribute('aTex') as THREE.BufferAttribute | undefined;
      buckets.push({
        meta,
        pos: (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array,
        col: (g.getAttribute(meta.glow ? 'color' : 'aCol') as THREE.BufferAttribute).array as Uint8Array | Float32Array,
        tex: tx ? (tx.array as Uint8Array) : null,
      });
    }
    return { buckets };
  }
}

/**
 * Collects prefab placements (prefab + transform) and builds one mesh per
 * bucket — the fast path for thousands of plants (no temporary Object3Ds).
 */
export class Sink {
  private items: { p: Prefab; m: THREE.Matrix4 }[] = [];

  add(p: Prefab, m: THREE.Matrix4) {
    this.items.push({ p, m: m.clone() });
  }

  get empty(): boolean {
    return this.items.length === 0;
  }

  build(baker: Baker): THREE.Mesh[] {
    const groups = new Map<string, { meta: BucketMeta; parts: { b: Prefab['buckets'][number]; m: THREE.Matrix4 }[]; n: number }>();
    for (const it of this.items) {
      for (const b of it.p.buckets) {
        let g = groups.get(b.meta.key);
        if (!g) {
          g = { meta: b.meta, parts: [], n: 0 };
          groups.set(b.meta.key, g);
        }
        g.parts.push({ b, m: it.m });
        g.n += b.pos.length / 3;
      }
    }
    const out: THREE.Mesh[] = [];
    for (const g of groups.values()) {
      const glow = g.meta.glow;
      const pos = new Float32Array(g.n * 3);
      const col = glow ? new Float32Array(g.n * 3) : new Uint8Array(g.n * 4);
      const tex = glow ? null : new Uint8Array(g.n * 4);
      const cw = glow ? 3 : 4;
      let o = 0;
      for (const { b, m } of g.parts) {
        const e = m.elements;
        const cnt = b.pos.length / 3;
        for (let i = 0; i < cnt; i++) {
          const x = b.pos[i * 3];
          const y = b.pos[i * 3 + 1];
          const z = b.pos[i * 3 + 2];
          const j = (o + i) * 3;
          pos[j] = e[0] * x + e[4] * y + e[8] * z + e[12];
          pos[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          pos[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
        col.set(b.col, o * cw);
        if (tex && b.tex) tex.set(b.tex, o * 4);
        o += cnt;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (glow) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      else {
        geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4, true));
        geo.setAttribute('aTex', new THREE.BufferAttribute(tex!, 4, false));
      }
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(Kit.track(geo), baker.materialFor(g.meta));
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      out.push(mesh);
    }
    this.items.length = 0;
    return out;
  }
}

/** Mark a plant/banner root as swaying (see Baker). Returns the object. */
export function sway<T extends THREE.Object3D>(o: T, amp: number, h: number): T {
  o.userData.sway = { amp, h } satisfies SwaySpec;
  return o;
}
