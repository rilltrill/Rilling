import * as THREE from 'three';
import { Kit, type MatOptions, type TexName } from '../../kit/ModelKit';
import { TEX_NAMES, Textures } from '../../kit/Textures';

/**
 * Retro texturing for TYRANT CHASE.
 *
 * All 26 Kit pixel textures are packed into one sampler2DArray so a single
 * baked material can show ANY texture per vertex (layer, density, strength,
 * gain travel in the `aTex` attribute). Baked scenery therefore costs one draw
 * call per (side × sway) bucket no matter how many surfaces it textures, and
 * every source material keeps its own texScale / texStrength.
 *
 * The projection is the engine's (content/kit/ModelKit.ts): object-space planar
 * on the dominant normal axis, hard switches, texture × colour with the
 * texture's mean-brightness gain — so baked and live (Kit.mat) surfaces match.
 *
 * Modes:
 *  - 'bake'    per-vertex texture (`aTex` = layer, repeats/m, strength, gain as
 *              floats; sculpted creature meshes with smooth normals)
 *  - 'packed'  the baked-scenery layout, 20 bytes per vertex (see `PACKED`):
 *              position + `aCol` (sRGB colour bytes + sway weight) + `aTex`
 *              bytes; no normal attribute — the projection axis comes from
 *              screen derivatives of the object-space position (the facet
 *              normal; the Lambert lighting is flat-shaded from derivatives too)
 *  - 'uniform' one texture for the whole material (optionally also modulating
 *              the emissive term: wet puddles that glow with the sky)
 *  - 'terrain' three fixed layers picked per texel by per-vertex coverage
 *              weights (`aTexW` = dirt, rock) through an ordered dither —
 *              chunky pixel transitions like a 90s terrain blend.
 * `unscaled` projects the raw vertex position (ignores the model scale) so a
 * breathing / squashing mesh doesn't make its texels crawl.
 */

export interface TexSpec {
  name: TexName;
  scale: number;
  strength: number;
}

const SIZE = 64;
const info = new WeakMap<THREE.Material, TexSpec>();

/** Kit.mat with a retro texture, remembering scale/strength for the baker. */
export function tx(name: TexName, color: number, scale = 1, strength = 1, o: MatOptions = {}): THREE.MeshLambertMaterial {
  const m = Kit.mat(color, { ...o, tex: name, texScale: scale, texStrength: strength });
  info.set(m, { name, scale, strength });
  return m;
}

/** Untextured Kit.mat (glows-adjacent paint, signage, glass): no grain when baked either. */
export function clean(color: number, o: MatOptions = {}): THREE.MeshLambertMaterial {
  const m = Kit.mat(color, { ...o, tex: 'none' });
  info.set(m, { name: 'grain', scale: 1, strength: 0 });
  return m;
}

/** Texture spec of a source material (registered via tx/clean, else Kit's defaults). */
export function texOf(m: THREE.Material): TexSpec {
  const t = info.get(m);
  if (t) return t;
  const n = m.userData.retroTex as TexName | undefined;
  if (!n) return { name: 'grain', scale: 1, strength: 0 };
  return { name: n, scale: 1, strength: n === 'grain' ? 0.6 : 1 };
}

let arr: THREE.DataArrayTexture | null = null;

/** All Kit textures as one 64×64×26 array texture (nearest, mipmapped, sRGB). */
export function retroArray(): THREE.DataArrayTexture {
  if (arr) return arr;
  const n = TEX_NAMES.length;
  const data = new Uint8Array(SIZE * SIZE * 4 * n);
  TEX_NAMES.forEach((name, layer) => {
    const { data: src, size } = Textures.pixels(name);
    const k = SIZE / size;
    const o = layer * SIZE * SIZE * 4;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const s = (Math.floor(y / k) * size + Math.floor(x / k)) * 4;
        const d = o + (y * SIZE + x) * 4;
        data[d] = src[s];
        data[d + 1] = src[s + 1];
        data[d + 2] = src[s + 2];
        data[d + 3] = 255;
      }
    }
  });
  const t = new THREE.DataArrayTexture(data, SIZE, SIZE, n);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  t.name = 'd3:retroArray';
  arr = t;
  Kit.track({
    dispose() {
      t.dispose();
      if (arr === t) arr = null;
    },
  });
  return t;
}

/** Packed per-vertex params for a spec: [layer, repeats per metre, strength, gain]. */
export function packTex(s: TexSpec, out: number[] | Float32Array = [0, 0, 0, 0], o = 0): number[] | Float32Array {
  const rt = Textures.get(s.name);
  out[o] = TEX_NAMES.indexOf(s.name);
  out[o + 1] = rt.density * s.scale;
  out[o + 2] = s.strength;
  out[o + 3] = rt.gain;
  return out;
}

/**
 * The packed baked-scenery vertex layout (`mode: 'packed'`), 20 B per vertex
 * instead of 56 (position, normal, colour, aTex and aSway as floats):
 *   position  3 × float32
 *   aCol      4 × uint8 normalised: sRGB-encoded colour (8-bit precision where
 *             the eye needs it — dark night colours keep their hue) + sway
 *             weight / SWAY_MAX in the alpha byte
 *   aTex      4 × uint8: [layer, repeats per metre (log: exp2(b / 32 − 4),
 *             0.0625…16 in 2.2 % steps), strength × 255, gain × 100]
 */
export const PACKED = {
  /** Sway weight (metres of bend at the top) that the alpha byte 255 stands for. */
  SWAY_MAX: 1.5,
};

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Packed per-vertex texture bytes for a spec (see PACKED). */
export function packTexBytes(s: TexSpec, out: Uint8Array | number[] = [0, 0, 0, 0], o = 0): Uint8Array | number[] {
  const rt = Textures.get(s.name);
  out[o] = TEX_NAMES.indexOf(s.name);
  out[o + 1] = byte((Math.log2(Math.max(1e-3, rt.density * s.scale)) + 4) * 32);
  out[o + 2] = byte(s.strength * 255);
  out[o + 3] = byte(rt.gain * 100);
  return out;
}

const _srgb = new THREE.Color();

/** sRGB colour bytes (+ an alpha byte) of a linear working-space colour. */
export function packColor(c: THREE.Color, alpha: number, out: Uint8Array | number[] = [0, 0, 0, 0], o = 0): Uint8Array | number[] {
  _srgb.copy(c).convertLinearToSRGB();
  out[o] = byte(_srgb.r * 255);
  out[o + 1] = byte(_srgb.g * 255);
  out[o + 2] = byte(_srgb.b * 255);
  out[o + 3] = byte(alpha * 255);
  return out;
}

const TEX_FN = /* glsl */ `
  vec3 d3RetroTex(vec2 ruv, vec4 p) {
    return texture(uD3Arr, vec3(ruv * p.y, floor(p.x + 0.5))).rgb * p.w;
  }
`;

/** Projection on the dominant axis of the interpolated normal attribute. */
const PROJ = /* glsl */ `
  vec2 d3RetroUV() {
    vec3 an = abs(vD3Nrm);
    return (an.x > an.y && an.x > an.z) ? vD3Pos.zy : ((an.y > an.z) ? vD3Pos.xz : vD3Pos.xy);
  }
${TEX_FN}`;

/**
 * Projection on the dominant axis of the FACET normal (screen derivatives of the
 * object-space position): one clean projection per low-poly face, no normal
 * attribute needed. Evaluated outside any branch (derivatives need uniform flow).
 */
const PROJ_D = /* glsl */ `
  vec2 d3RetroUVd() {
    vec3 an = abs(cross(dFdx(vD3Pos), dFdy(vD3Pos)));
    return (an.x > an.y && an.x > an.z) ? vD3Pos.zy : ((an.y > an.z) ? vD3Pos.xz : vD3Pos.xy);
  }
${TEX_FN}`;

/** GLSL: sRGB transfer → linear (exactly three's sRGBTransferEOTF), for packed colour bytes. */
const SRGB_EOTF = /* glsl */ `
  vec3 d3Lin(vec3 c) {
    return mix(c * 0.0773993808, pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), step(vec3(0.04045), c));
  }
`;

const BAYER = /* glsl */ `
  float d3Bayer(vec2 c) {
    const float B[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    ivec2 q = ivec2(mod(c, 4.0));
    return (B[q.x + q.y * 4] + 0.5) / 16.0;
  }
`;

export interface RetroHookOptions {
  mode: 'bake' | 'packed' | 'uniform' | 'terrain';
  /** Uniform mode: the texture. */
  spec?: TexSpec;
  /** Also multiply the emissive term by the texture (uniform mode). */
  emissive?: boolean;
  /** Project the raw vertex position (ignore the model scale). */
  unscaled?: boolean;
  /** Terrain only: [grass, dirt, rock] specs. */
  layers?: [TexSpec, TexSpec, TexSpec];
  /** Terrain only: dither cells per metre. */
  ditherCells?: number;
}

/**
 * Add the d3 retro projection to a Lambert material (chains an existing
 * onBeforeCompile). The geometry must carry `aTex` (bake) or `aTexW` (terrain).
 */
export function retroHook<T extends THREE.MeshLambertMaterial>(m: T, o: RetroHookOptions): T {
  const tex = retroArray();
  const uniforms: Record<string, THREE.IUniform> = { uD3Arr: { value: tex } };
  if (o.mode === 'uniform') {
    uniforms.uD3Spec = { value: new THREE.Vector4(...(packTex(o.spec!) as [number, number, number, number])) };
  }
  if (o.mode === 'terrain') {
    const L = o.layers!;
    uniforms.uD3L0 = { value: new THREE.Vector4(...(packTex(L[0]) as [number, number, number, number])) };
    uniforms.uD3L1 = { value: new THREE.Vector4(...(packTex(L[1]) as [number, number, number, number])) };
    uniforms.uD3L2 = { value: new THREE.Vector4(...(packTex(L[2]) as [number, number, number, number])) };
    uniforms.uD3Cells = { value: o.ditherCells ?? 5 };
  }
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey?.();
  const terrain = o.mode === 'terrain';
  const uni = o.mode === 'uniform';
  const packed = o.mode === 'packed';
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    const attr = terrain
      ? 'attribute vec2 aTexW;\nvarying vec2 vD3W;'
      : uni
        ? ''
        : packed
          ? `attribute vec4 aCol;\nattribute vec4 aTex;\nvarying vec4 vD3Tex;\n${SRGB_EOTF}`
          : 'attribute vec4 aTex;\nvarying vec4 vD3Tex;';
    const vary = packed ? 'varying vec3 vD3Pos;' : 'varying vec3 vD3Pos;\nvarying vec3 vD3Nrm;';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vary}\n${attr}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${
          o.unscaled
            ? 'vD3Pos = position;'
            : 'vD3Pos = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));'
        }
        ${packed ? '' : 'vD3Nrm = normal;'}
        ${terrain ? 'vD3W = aTexW;' : uni ? '' : packed ? 'vD3Tex = vec4(aTex.x, exp2(aTex.y * 0.03125 - 4.0), aTex.z * 0.00392157, aTex.w * 0.01);' : 'vD3Tex = aTex;'}`,
      );
    // Packed colour: sRGB bytes → linear working space (no `color` attribute).
    if (packed) shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', 'vColor = vec4(d3Lin(aCol.rgb), 1.0);');
    const fragDecl = terrain
      ? `uniform vec4 uD3L0;\nuniform vec4 uD3L1;\nuniform vec4 uD3L2;\nuniform float uD3Cells;\nvarying vec2 vD3W;\n${BAYER}`
      : uni
        ? 'uniform vec4 uD3Spec;'
        : 'varying vec4 vD3Tex;';
    // d3T = the texture factor (declared in main's scope so the emissive can reuse it).
    const fragBody = terrain
      ? `vec3 d3T = vec3(1.0);
        {
          vec2 ruv = d3RetroUV();
          // Dithered pixel transitions up close; a plain 50 % cut once the dither
          // cells shrink below ~a pixel (no distant shimmer).
          vec2 cell = ruv * uD3Cells;
          float far = smoothstep(0.4, 0.9, max(fwidth(cell.x), fwidth(cell.y)));
          float th = mix(d3Bayer(floor(cell)), 0.5, far);
          vec4 p = vD3W.y > th ? uD3L2 : (vD3W.x > th ? uD3L1 : uD3L0);
          d3T = mix(vec3(1.0), d3RetroTex(ruv, p), p.z);
        }
        diffuseColor.rgb *= d3T;`
      : uni
        ? `vec3 d3T = mix(vec3(1.0), d3RetroTex(d3RetroUV(), uD3Spec), uD3Spec.z);
          diffuseColor.rgb *= d3T;`
        : packed
          ? `vec3 d3T = mix(vec3(1.0), d3RetroTex(d3RetroUVd(), vD3Tex), vD3Tex.z);
          diffuseColor.rgb *= d3T;`
          : `vec3 d3T = vec3(1.0);
          if (vD3Tex.z > 0.001) d3T = mix(vec3(1.0), d3RetroTex(d3RetroUV(), vD3Tex), vD3Tex.z);
          diffuseColor.rgb *= d3T;`;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform highp sampler2DArray uD3Arr;\n${vary}\n${fragDecl}\n${packed ? PROJ_D : PROJ}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fragBody}`);
    if (o.emissive) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= d3T;',
      );
    }
  };
  const key = `d3retro|${o.mode}|${o.unscaled ? 1 : 0}|${o.emissive ? 1 : 0}|${prevKey ?? ''}`;
  m.customProgramCacheKey = () => key;
  m.userData.retroTex = o.mode === 'uniform' ? o.spec!.name : `d3${o.mode}`;
  m.needsUpdate = true;
  return m;
}

/**
 * Fresh tracked vertex-coloured flat Lambert using the per-vertex texture array.
 * `packed`: for the baker's packed 20-byte scenery layout (see PACKED) instead
 * of float colour/aTex/normal attributes (sculpted creatures).
 */
export function bakedLambert(o: { side?: THREE.Side; emissive?: number; unscaled?: boolean; packed?: boolean } = {}): THREE.MeshLambertMaterial {
  const m = Kit.track(
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: o.side ?? THREE.FrontSide }),
  );
  if (o.emissive !== undefined) m.emissive.setHex(o.emissive);
  return retroHook(m, { mode: o.packed ? 'packed' : 'bake', unscaled: o.unscaled });
}

/** Fill a geometry's `aTex` attribute with one spec for every vertex. */
export function setTex(g: THREE.BufferGeometry, s: TexSpec): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 4);
  const p = packTex(s) as number[];
  for (let i = 0; i < n; i++) a.set(p, i * 4);
  g.setAttribute('aTex', new THREE.BufferAttribute(a, 4));
  return g;
}

/**
 * Additive lamp light pool with a dithered radial falloff (needs `aR` = 0 at
 * the centre … 1 at the rim): pixels switch on/off through a 4×4 Bayer matrix
 * on the low-res arcade framebuffer instead of a hard-edged ellipse.
 */
export function ditherPool<T extends THREE.MeshBasicMaterial>(m: T): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aR;\nvarying float vD3R;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvD3R = aR;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vD3R;\n${BAYER}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float f = 1.0 - smoothstep(0.15, 1.0, vD3R);
          if (f * f < d3Bayer(floor(gl_FragCoord.xy))) discard;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'd3pool';
  m.needsUpdate = true;
  return m;
}

/** A tracked copy of `src` with the `aR` radial attribute (radius `r` in the XZ plane). */
export function radialGeometry(src: THREE.BufferGeometry, r: number): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const p = g.attributes.position as THREE.BufferAttribute;
  const a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = Math.min(1, Math.hypot(p.getX(i), p.getZ(i)) / r);
  g.setAttribute('aR', new THREE.BufferAttribute(a, 1));
  return Kit.track(g);
}

/**
 * Classic 90s cloud layer for a sky dome (MeshBasic, object space centred on
 * the camera): the texture is projected onto a virtual plane overhead
 * (direction.xz / direction.y), so cloud texels converge toward the horizon,
 * fade into the fog band and scroll with `offset` (wind).
 */
export function skyClouds<T extends THREE.MeshBasicMaterial>(
  m: T,
  spec: TexSpec,
  offset: { value: THREE.Vector2 },
  scale = 0.35,
): T {
  const tex = retroArray();
  const p = packTex(spec) as number[];
  const uniforms = {
    uD3Arr: { value: tex },
    uD3Cloud: { value: new THREE.Vector4(p[0], scale, spec.strength, p[3]) },
    uD3CloudOff: offset,
  };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vD3Dir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvD3Dir = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform highp sampler2DArray uD3Arr;\nuniform vec4 uD3Cloud;\nuniform vec2 uD3CloudOff;\nvarying vec3 vD3Dir;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 d = normalize(vD3Dir);
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.1) * uD3Cloud.y + uD3CloudOff;
            vec3 t = texture(uD3Arr, vec3(uv, uD3Cloud.x)).rgb * uD3Cloud.w;
            diffuseColor.rgb *= mix(vec3(1.0), t, uD3Cloud.z * smoothstep(0.02, 0.3, d.y));
          }
        }`,
      );
  };
  m.customProgramCacheKey = () => 'd3clouds';
  m.needsUpdate = true;
  return m;
}
