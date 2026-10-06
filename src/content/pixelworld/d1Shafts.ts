import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from '../kit/ModelKit';

/**
 * Sun shafts for JUNGLE RUN's ART: PIXEL WORLD: instead of one pale additive
 * slab per shaft, each plane draws a few hard-edged RAYS of light in three
 * stepped strengths (the way 16-bit games did light beams): the ray mask comes
 * from the plane's u (a hashed set of rays of different widths, tapering at
 * the plane's edges), the strength from v (strongest where it leaves the
 * canopy, gone before the ground). Additive, no depth writes, fogged like the
 * classic shafts.
 */

const VERT = /* glsl */ `
  varying vec2 vShUv;
`;
const FRAG = /* glsl */ `
  varying vec2 vShUv;
  uniform float uShK;
  float shHash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
`;

/** The dithered shaft material (one per stage; `strength` = how much light a full ray adds). */
export function d1ShaftMaterial(color = 0xfff1c0, strength = 0.1): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const uniforms = { uShK: { value: strength } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT}`)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vShUv = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG}`).replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      {
        // Rays across the plane: 5 slots, each lit or not, of its own width; the plane's edges fade.
        float slot = floor(vShUv.x * 5.0);
        float f = fract(vShUv.x * 5.0);
        float on = step(0.45, shHash(slot + 3.1));
        float w = 0.25 + 0.5 * shHash(slot + 7.7);
        float ray = on * step(abs(f - 0.5), w * 0.5);
        float edge = smoothstep(0.0, 0.15, vShUv.x) * smoothstep(1.0, 0.85, vShUv.x);
        // Strong up in the canopy, fading toward the ground (in three stepped bands).
        float fall = floor(clamp(vShUv.y * 1.15, 0.0, 1.0) * 3.0 + 0.5) / 3.0;
        // Hard-edged, in three steps of light (no per-pixel stipple: through the CRT mask that turns to colour noise).
        float a = floor(ray * edge * fall * 3.0 + 0.5) / 3.0;
        if (a <= 0.0) discard;
        diffuseColor.a = uShK * a;
      }
      #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => 'd1Shaft3';
  m.name = 'pw:d1-shafts';
  return Kit.track(m);
}

/** Merge a group's shaft planes into one mesh KEEPING their uv (the classic merge drops it). Removes the planes. */
export function mergeShafts(group: THREE.Object3D, mat: THREE.Material): THREE.Mesh | null {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const m4 = new THREE.Matrix4();
  const geos: THREE.BufferGeometry[] = [];
  const rm: THREE.Object3D[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'uv') g.deleteAttribute(name);
    m4.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(m4);
    geos.push(g);
    rm.push(m);
  });
  for (const m of rm) m.parent?.remove(m);
  for (const c of [...group.children]) group.remove(c);
  if (!geos.length) return null;
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return null;
  const mesh = new THREE.Mesh(Kit.track(merged), mat);
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 3;
  mesh.raycast = () => {};
  mesh.userData.pixelWorld = true;
  group.add(mesh);
  return mesh;
}
