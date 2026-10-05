import * as THREE from 'three';
import { Textures, type TexName } from './Textures';

/**
 * Global multiplier on the strength of every character's pixel texture (Kit
 * retro textures, zombie and dino skins). 1 = as authored. ART: SPRITES raises it
 * only while baking sprites, so surface detail survives the bake.
 */
export const RETRO_DETAIL = { value: 1 };
/**
 * ART: SPRITES — foliage ('leaves' materials) drawn as leaf clumps: dark gaps
 * between clumps, lit leaf tips, and a ragged leafy outline where a face turns
 * away (instead of a faceted blob). A shared uniform: flips live with the ART
 * setting, no recompile. ART: 3D keeps the plain look (0).
 */
export const RETRO_FOLIAGE = { value: 0 };

/** GLSL declarations for `foliageGlsl` (uniform `uFoliage` = RETRO_FOLIAGE, value noise). */
export const FOLIAGE_DECL = /* glsl */ `
  uniform float uFoliage;
  float fHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fHash(i), fHash(i + vec3(1, 0, 0)), f.x), mix(fHash(i + vec3(0, 1, 0)), fHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(fHash(i + vec3(0, 0, 1)), fHash(i + vec3(1, 0, 1)), f.x), mix(fHash(i + vec3(0, 1, 1)), fHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;

/**
 * GLSL (after `color_fragment`, Lambert — needs `vViewPosition`): when `cond`
 * holds in SPRITES, foliage at object-space position `pos` becomes leaf clumps —
 * a ragged leafy outline where a face turns away (never on flat ground patches),
 * dark gaps between clumps, lit leaf tips.
 */
export function foliageGlsl(pos: string, cond = 'true'): string {
  return /* glsl */ `
  if (uFoliage > 0.5 && (${cond})) {
    vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    float facing = abs(dot(fn, normalize(vViewPosition)));
    float up = abs(dot(fn, vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1])));
    float fc = fNoise(${pos} * 3.2);
    float fl = fNoise(${pos} * 8.0 + 11.0);
    if (up < 0.88 && facing < 0.6 && fl < (0.6 - facing) * 1.9) discard;
    // Clumps: a dark gap where two clumps meet, a lit rim on each clump's top, leaf tips.
    float gap = smoothstep(0.42, 0.34, fc);
    float top = fNoise(${pos} * 3.2 + vec3(0.0, -0.12, 0.0));
    diffuseColor.rgb *= gap > 0.5 ? 0.5 : (top < fc - 0.06 ? 1.22 : (fl > 0.68 ? 1.12 : 1.0));
  }`;
}

export type { TexName } from './Textures';

/**
 * Procedural low-poly model toolkit.
 *
 * RULES for content code:
 *  - Geometries and materials from Kit are CACHED and SHARED. Never mutate them
 *    (no geo.translate(), no mat.color.set()). Position/rotate/scale the Mesh instead.
 *  - Anything you create yourself (custom BufferGeometry, cloned materials) must be
 *    passed through `Kit.track()` so it is disposed when the stage ends.
 *  - Everything is flat-shaded Lambert by default — cheap on mobile and gives
 *    the chunky arcade look.
 */
const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();
const tracked = new Set<{ dispose(): void }>();

const k = (n: number) => Math.round(n * 1000) / 1000;

function cachedGeo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g as T;
}

function cachedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m as T;
}

export interface MatOptions {
  emissive?: number;
  emissiveIntensity?: number;
  /** Smooth shading instead of flat. */
  smooth?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  /** Skip fog (for skyboxes / far glows). */
  fog?: boolean;
  vertexColors?: boolean;
  /**
   * Retro pixel texture (see content/kit/Textures.ts → TEX_NAMES), multiplied with
   * the colour. Projected in object space, so no UVs are needed and texel density
   * stays constant in world units. 'none' disables the default grain.
   */
  tex?: TexName | 'none';
  /** Texture density multiplier (2 = texels twice as small). Default 1. */
  texScale?: number;
  /** 0..1 how strongly the texture modulates the colour. Default 1 (grain: 0.6). */
  texStrength?: number;
}

/**
 * Inject object-space planar texture projection into a Lambert material.
 * The dominant axis of the object-space normal picks the projection plane —
 * hard switches (no blending) for a crisp, period-accurate look.
 */
function applyRetroTexture(
  m: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.MeshPhongMaterial,
  name: TexName,
  scale: number,
  strength: number,
) {
  const rt = Textures.get(name);
  const uniforms = {
    uRetroMap: { value: rt.texture },
    uRetroScale: { value: rt.density * scale },
    uRetroStrength: { value: strength },
    uRetroGain: { value: rt.gain },
    uRetroDetail: RETRO_DETAIL,
    uFoliage: RETRO_FOLIAGE,
  };
  const leafy = name === 'leaves';
  m.userData.retroTex = name;
  // Bakers that merge Kit materials into vertex-coloured batches read these.
  m.userData.retroScale = scale;
  m.userData.retroStrength = strength;
  // Chain any hook the material already had (e.g. custom emission masks).
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey?.();
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRetroPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 retroScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        vRetroPos = position * retroScale;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uRetroMap;
        uniform float uRetroScale;
        uniform float uRetroStrength;
        uniform float uRetroGain;
        uniform float uRetroDetail;
        varying vec3 vRetroPos;
        ${leafy ? FOLIAGE_DECL : ''}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // Face normal from screen-space derivatives: no mid-face seams on smooth-shaded cylinders.
          vec3 an = abs(cross(dFdx(vRetroPos), dFdy(vRetroPos)));
          vec2 ruv = (an.x > an.y && an.x > an.z) ? vRetroPos.zy : ((an.y > an.z) ? vRetroPos.xz : vRetroPos.xy);
          vec3 rtex = texture2D(uRetroMap, ruv * uRetroScale).rgb * uRetroGain;
          diffuseColor.rgb *= max(mix(vec3(1.0), rtex, uRetroStrength * uRetroDetail), vec3(0.0));
        }${leafy ? foliageGlsl('vRetroPos') : ''}`,
      );
  };
  m.customProgramCacheKey = () => `retroTex2${leafy ? '|fol' : ''}|${prevKey ?? ''}`;
  m.needsUpdate = true;
}

export const Kit = {
  /** Flat-shaded Lambert material (cached by colour + options). */
  mat(color: number, o: MatOptions = {}): THREE.MeshLambertMaterial {
    const tex: TexName | null = o.tex === 'none' ? null : o.tex ?? (Kit.retro.grain ? 'grain' : null);
    const texScale = o.texScale ?? 1;
    const texStrength = o.texStrength ?? (o.tex ? 1 : 0.6);
    const key = `l|${color}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.smooth ? 1 : 0}|${o.side ?? ''}|${o.transparent ? o.opacity : ''}|${o.fog ?? ''}|${o.vertexColors ? 1 : 0}|${tex ?? ''}|${texScale}|${texStrength}`;
    return cachedMat(key, () => {
      const m = new THREE.MeshLambertMaterial({
        color,
        flatShading: !o.smooth,
        side: o.side ?? THREE.FrontSide,
        transparent: !!o.transparent,
        opacity: o.opacity ?? 1,
        fog: o.fog ?? true,
        vertexColors: !!o.vertexColors,
      });
      if (o.emissive !== undefined) {
        m.emissive.setHex(o.emissive);
        m.emissiveIntensity = o.emissiveIntensity ?? 1;
      }
      if (tex) applyRetroTexture(m, tex, texScale, texStrength);
      return m;
    });
  },

  /**
   * Add the retro pixel-texture projection to a material you created yourself
   * (vertex-coloured baked meshes, self-lit skins, Standard/Basic materials).
   * Chains any existing onBeforeCompile. Call once per material, before first render.
   */
  applyTexture(
    mat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.MeshPhongMaterial,
    name: TexName,
    scale = 1,
    strength = 1,
  ) {
    if (mat.userData.retroTex) return mat;
    applyRetroTexture(mat, name, scale, strength);
    return mat;
  },

  /** Shorthand: textured flat-shaded material, e.g. Kit.tex('brick', 0x8a3a2a). */
  tex(name: TexName, color: number, scale = 1, strength = 1): THREE.MeshLambertMaterial {
    return Kit.mat(color, { tex: name, texScale: scale, texStrength: strength });
  },

  /**
   * Global retro switches. `grain` gives every untextured Kit.mat a subtle pixel
   * grit so even flat colours read as "textured" at arcade resolution.
   */
  retro: { grain: true },

  /** Physically-based material for shiny/metal things (more expensive — use sparingly). */
  std(color: number, roughness = 0.6, metalness = 0.2, emissive?: number): THREE.MeshStandardMaterial {
    return cachedMat(`s|${color}|${roughness}|${metalness}|${emissive ?? ''}`, () => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
      if (emissive !== undefined) m.emissive.setHex(emissive);
      return m;
    });
  },

  /** Unlit, full-bright material for glowing eyes, weak points, lamps, muzzle flashes. */
  glow(color: number, intensity = 1, transparent = false, opacity = 1): THREE.MeshBasicMaterial {
    return cachedMat(`g|${color}|${intensity}|${transparent ? opacity : ''}`, () => {
      const c = new THREE.Color(color).multiplyScalar(intensity);
      return new THREE.MeshBasicMaterial({
        color: c,
        toneMapped: false,
        transparent,
        opacity,
        depthWrite: !transparent,
        fog: false,
      });
    });
  },

  box(w: number, h: number, d: number): THREE.BoxGeometry {
    return cachedGeo(`box|${k(w)}|${k(h)}|${k(d)}`, () => new THREE.BoxGeometry(w, h, d));
  },

  sphere(r: number, ws = 8, hs = 6): THREE.SphereGeometry {
    return cachedGeo(`sph|${k(r)}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  },

  /** Cylinder along Y, centred. */
  cyl(rt: number, rb: number, h: number, seg = 8): THREE.CylinderGeometry {
    return cachedGeo(`cyl|${k(rt)}|${k(rb)}|${k(h)}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  },

  /** Cone along +Y, centred. */
  cone(r: number, h: number, seg = 8): THREE.ConeGeometry {
    return cachedGeo(`cone|${k(r)}|${k(h)}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
  },

  /** Capsule along Y, centred; total height = len + 2r. */
  capsule(r: number, len: number, capSeg = 2, radSeg = 8): THREE.CapsuleGeometry {
    return cachedGeo(`cap|${k(r)}|${k(len)}|${capSeg}|${radSeg}`, () => new THREE.CapsuleGeometry(r, len, capSeg, radSeg));
  },

  plane(w: number, h: number, ws = 1, hs = 1): THREE.PlaneGeometry {
    return cachedGeo(`pl|${k(w)}|${k(h)}|${ws}|${hs}`, () => new THREE.PlaneGeometry(w, h, ws, hs));
  },

  /** Low-poly blob — an icosahedron, optionally squashed via mesh.scale. */
  ico(r: number, detail = 0): THREE.IcosahedronGeometry {
    return cachedGeo(`ico|${k(r)}|${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
  },

  /**
   * Organic randomised version of a geometry (rocks, bushes, gore). Not cached —
   * automatically tracked for disposal.
   */
  jitter(geo: THREE.BufferGeometry, amount: number, seed = 1): THREE.BufferGeometry {
    const g = geo.clone();
    const pos = g.attributes.position as THREE.BufferAttribute;
    let s = seed * 9301 + 49297;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280 - 0.5;
    };
    // Same displacement for coincident vertices so faces stay closed.
    const seen = new Map<string, [number, number, number]>();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      let d = seen.get(key);
      if (!d) {
        d = [rnd() * amount, rnd() * amount, rnd() * amount];
        seen.set(key, d);
      }
      pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
    }
    g.computeVertexNormals();
    return Kit.track(g);
  },

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
    return new THREE.Mesh(geo, mat);
  },

  /**
   * Create a mesh, add it to `parent` at (x, y, z) with optional rotation (radians)
   * and scale. Returns the mesh.
   */
  add(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = sx,
    sz = sx,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  },

  /** An empty pivot (joint) group added to parent at (x, y, z). */
  pivot(parent: THREE.Object3D, x = 0, y = 0, z = 0, name = ''): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.name = name;
    parent.add(g);
    return g;
  },

  /** Register a non-cached geometry/material/texture for disposal at stage end. */
  track<T extends { dispose(): void }>(x: T): T {
    tracked.add(x);
    return x;
  },

  /** Dispose every cached and tracked GPU resource. Called between stages. */
  disposeAll() {
    for (const g of geoCache.values()) g.dispose();
    for (const m of matCache.values()) m.dispose();
    for (const t of tracked) t.dispose();
    Textures.disposeAll();
    geoCache.clear();
    matCache.clear();
    tracked.clear();
  },

  stats() {
    return { geometries: geoCache.size, materials: matCache.size, tracked: tracked.size };
  },
};
