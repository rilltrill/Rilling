import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, type TexName } from '../../kit/ModelKit';
import { EnvKit } from '../../kit/EnvKit';

/**
 * Colour-baking merge for the labs. Scenery materials are created through
 * `mat()` / `glow()` below, which remember their (texture, side) recipe.
 * `bake(group)` then folds every such mesh into ONE vertex-coloured mesh per
 * recipe (plain / tiles / metal / …, plus one unlit glow mesh), so a whole
 * room costs a handful of draw calls while keeping its retro textures.
 * Anything else (animated, transparent, emissive) is merged per material.
 */

interface Recipe {
  kind: 'lambert' | 'glow';
  tex: TexName | null;
  scale: number;
  strength: number;
  double: boolean;
}

const recipes = new WeakMap<THREE.Material, Recipe>();

/** Flat-shaded scenery material (optionally retro-textured) that bakes into vertex colours. */
export function mat(color: number, tex?: TexName, scale = 1, strength = 1, double = false): THREE.MeshLambertMaterial {
  const m = Kit.mat(color, tex ? { tex, texScale: scale, texStrength: strength, side: double ? THREE.DoubleSide : undefined } : { side: double ? THREE.DoubleSide : undefined });
  if (!recipes.has(m)) recipes.set(m, { kind: 'lambert', tex: tex ?? null, scale, strength, double });
  return m;
}

/** Unlit glow that bakes into a shared vertex-coloured glow mesh. */
export function glow(color: number, intensity = 1): THREE.MeshBasicMaterial {
  const m = Kit.glow(color, intensity);
  if (!recipes.has(m)) recipes.set(m, { kind: 'glow', tex: null, scale: 1, strength: 1, double: false });
  return m;
}

const bakedGlowMats = new Map<string, THREE.Material>();

function targetMaterial(r: Recipe): THREE.Material {
  if (r.kind === 'glow') {
    let m = bakedGlowMats.get('glow');
    if (!m) {
      m = Kit.track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
      m.addEventListener('dispose', () => bakedGlowMats.delete('glow'));
      bakedGlowMats.set('glow', m);
    }
    return m;
  }
  return Kit.mat(0xffffff, {
    vertexColors: true,
    side: r.double ? THREE.DoubleSide : undefined,
    ...(r.tex ? { tex: r.tex, texScale: r.scale, texStrength: r.strength } : {}),
  });
}

function keyOf(r: Recipe) {
  return `${r.kind}|${r.tex ?? ''}|${r.scale}|${r.strength}|${r.double ? 1 : 0}`;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

/**
 * Merge every static mesh under `group` (skipping `userData.noMerge`) into as
 * few meshes as possible. Originals are removed; merged meshes are added to
 * `group` and returned.
 */
export function bake(group: THREE.Object3D): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const lists = new Map<string, { recipe: Recipe; geos: THREE.BufferGeometry[] }>();
  const remove: THREE.Mesh[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material) || mesh.userData.noMerge) return;
    const r = recipes.get(mesh.material);
    if (!r) return;
    const src = mesh.geometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    g.applyMatrix4(_m);
    if (_m.determinant() < 0) {
      // Mirrored: flip winding so faces stay outward.
      const p = g.attributes.position as THREE.BufferAttribute;
      const n = g.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i + 2 < p.count; i += 3) {
        for (const a of [p, n]) {
          const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
          a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
          a.setXYZ(i + 2, x, y, z);
        }
      }
    }
    const c = (mesh.material as THREE.MeshBasicMaterial).color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const k = keyOf(r);
    let entry = lists.get(k);
    if (!entry) {
      entry = { recipe: r, geos: [] };
      lists.set(k, entry);
    }
    entry.geos.push(g);
    remove.push(mesh);
  });
  for (const m of remove) m.parent?.remove(m);
  const out: THREE.Mesh[] = [];
  for (const { recipe, geos } of lists.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(Kit.track(merged), targetMaterial(recipe));
    mesh.userData.noMerge = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    out.push(mesh);
  }
  out.push(...EnvKit.mergeStatic(group));
  return out;
}

/**
 * Build meshes into a temporary group, bake them and attach the results to
 * `parent` in the same local frame (for animated parts: one mesh per joint).
 */
export function bakeInto(parent: THREE.Object3D, build: (g: THREE.Group) => void): THREE.Mesh[] {
  const g = new THREE.Group();
  build(g);
  const meshes = bake(g);
  for (const m of meshes) {
    g.remove(m);
    m.matrixAutoUpdate = true;
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    parent.add(m);
  }
  return meshes;
}
