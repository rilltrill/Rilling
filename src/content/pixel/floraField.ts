import * as THREE from 'three';
import { Kit, RETRO_FOLIAGE } from '../kit/ModelKit';
import { FloraCanvas, FloraPalette, FloraRng, resolveCanvas, RIM_ALPHA } from './floraPaint';
import { floraMats, type FloraBiome, type FloraSpecies } from './floraSpecies';

/**
 * FLORA billboards (ART: SPRITES scenery). The stage's plants are painted once
 * at load into a PALETTISED atlas (R8 colour indices + a 256-entry palette:
 * 1 byte per texel, like the indexed sprites of the era) with four HAND-PAINTED
 * mip levels (each level is the plant painted again at half the resolution,
 * not a filtered copy), and drawn as Doom-style billboards: every plant stands
 * upright and faces the camera's view plane (yaw only), so neighbouring plants
 * never cut through each other. All the plants of a stage are ONE instanced
 * draw call (4 vertices each); the fragment shader fetches whole texels
 * (`texelFetch`, level picked from the on-screen texel size), discards the
 * transparent ones (alpha-tested, depth-writing: correct against characters and
 * terrain), and is otherwise a MeshLambertMaterial: stage lights, lightning,
 * flashlight, fog and tone mapping like the 3D scenery — with two plant rules
 * (FRAG_LIGHT): sky light (hemisphere + sun / moon) lights a plant's top, while
 * local lights (lamps, neon, headlights, the flashlight) see a view-facing card
 * and are half desaturated and clamped, so a plant under a coloured lamp is
 * tinted, never bleached brighter than the cast; a per-stage gain matches the
 * plants to the stage's 3D vegetation.
 *
 * Wind: the vertex shader computes each plant's sway (shared clock, per-plant
 * phase) and the fragment shader shifts every texel ROW sideways by a whole
 * number of texels growing with height² — the trunk foot stays put and the
 * crown bends in crisp pixel steps (a raster wobble, never smeared texels).
 * Night: back-lit (right) exterior-edge texels (palette alpha = RIM_ALPHA) get
 * a cool rim so silhouettes read in the dark, as on the PixelCast sprites.
 *
 * Gameplay never sees these: they are not raycast, and bullet occluders /
 * collision stay the stage's own (invisible) meshes.
 */

/** Painted mip levels (level 0 = full size). Sprite rects are aligned to 2^LEVELS texels. */
export const FLORA_LEVELS = 4;
const ALIGN = 1 << (FLORA_LEVELS - 1);

export interface FloraSprite {
  key: string;
  variant: number;
  /** Atlas rect, level-0 texels (aligned to ALIGN). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Foot (trunk base) x from the rect's left edge, level-0 texels. */
  foot: number;
}

export interface FloraAtlasData {
  w: number;
  h: number;
  /** Index images, level 0 first, down to 1×1 (levels ≥ FLORA_LEVELS are blank, never sampled). */
  levels: { data: Uint8Array; width: number; height: number }[];
  /** 256 × RGBA8 sRGB; entry 0 = transparent, alpha RIM_ALPHA = back-lit exterior edge. */
  palette: Uint8Array;
  sprites: Map<string, FloraSprite[]>;
  /** Distinct colours used (≤ 255). */
  colours: number;
  /** CPU ms spent painting. */
  ms: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Paint every variant of `species` for `biome` and pack them (pure CPU, node-safe).
 * `biomeKey` makes the variants differ between stages.
 */
export function paintFloraAtlas(species: FloraSpecies[], biome: FloraBiome, biomeKey: string): FloraAtlasData {
  const t0 = now();
  const pal = new FloraPalette();
  const mats = floraMats(pal, biome);
  interface Painted {
    key: string;
    variant: number;
    w: number;
    h: number;
    foot: number;
    /** RGBA per level, cropped. */
    lv: { data: Uint8Array; w: number; h: number }[];
  }
  const painted: Painted[] = [];
  for (const sp of species) {
    for (let v = 0; v < sp.variants; v++) {
      const seed = hashStr(`${biomeKey}|${sp.key}|${v}`);
      const raw: { data: Uint8Array; w: number; h: number }[] = [];
      let covPrev = 0;
      for (let l = 0; l < FLORA_LEVELS; l++) {
        const paintAt = (density: number) => {
          const c = new FloraCanvas(sp.w >> l, sp.h >> l, 1 / (1 << l));
          c.density = density;
          sp.paint(c, mats, new FloraRng(seed), v);
          return c;
        };
        let c = paintAt(1);
        let cov = c.coverage();
        // Strand plants: thin this level until it covers what the finer level covers (no weight pop at the switch).
        if (sp.balance && l > 0 && cov > covPrev * 1.03) {
          let lo = 0.02;
          let hi = 1;
          let err = Math.abs(cov / covPrev - 1);
          for (let it = 0; it < 7; it++) {
            const mid = (lo + hi) / 2;
            const cm = paintAt(mid);
            const cv = cm.coverage();
            const e = Math.abs(cv / covPrev - 1);
            if (e < err) {
              c = cm;
              cov = cv;
              err = e;
            }
            if (cv > covPrev) hi = mid;
            else lo = mid;
          }
        }
        covPrev = cov;
        raw.push({ data: resolveCanvas(c, pal), w: c.w, h: c.h });
      }
      // Crop to the level-0 content (aligned), keeping the foot on the bottom row.
      const L0 = raw[0];
      let minX = L0.w;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < L0.h; y++) {
        for (let x = 0; x < L0.w; x++) {
          if (L0.data[(y * L0.w + x) * 4 + 3] === 0) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) continue;
      const x0 = Math.floor(minX / ALIGN) * ALIGN;
      const x1 = Math.min(sp.w, Math.ceil((maxX + 1) / ALIGN) * ALIGN);
      const y1 = Math.min(sp.h, Math.ceil((maxY + 1) / ALIGN) * ALIGN);
      const lv = raw.map((r, l) => {
        const cx0 = x0 >> l;
        const cw = (x1 - x0) >> l;
        const ch = y1 >> l;
        const out = new Uint8Array(cw * ch * 4);
        for (let y = 0; y < ch; y++) out.set(r.data.subarray((y * r.w + cx0) * 4, (y * r.w + cx0 + cw) * 4), y * cw * 4);
        return { data: out, w: cw, h: ch };
      });
      painted.push({ key: sp.key, variant: v, w: x1 - x0, h: y1, foot: sp.w / 2 - x0, lv });
    }
  }
  // Shelf packing (tallest first) into a power-of-two width.
  const area = painted.reduce((s, p) => s + p.w * p.h, 0);
  let W = 256;
  while (W * W < area * 1.25 && W < 2048) W *= 2;
  const order = painted.map((_, i) => i).sort((a, b) => painted[b].h - painted[a].h || painted[b].w - painted[a].w);
  const pos: { x: number; y: number }[] = new Array(painted.length);
  let sx = 0;
  let sy = 0;
  let shelfH = 0;
  for (const i of order) {
    const p = painted[i];
    if (sx + p.w > W) {
      sx = 0;
      sy += shelfH;
      shelfH = 0;
    }
    pos[i] = { x: sx, y: sy };
    sx += p.w;
    shelfH = Math.max(shelfH, p.h);
  }
  let H = ALIGN;
  while (H < sy + shelfH) H *= 2;
  // Palette: index 0 = transparent; colours (with the rim flag in alpha) as met.
  const palette = new Uint8Array(256 * 4);
  const index = new Map<number, number>();
  const nearest = (r: number, g: number, b: number, a: number): number => {
    let best = 1;
    let bd = Infinity;
    for (let i = 1; i < 256; i++) {
      const q = i * 4;
      if (palette[q + 3] !== a) continue;
      const d = (palette[q] - r) ** 2 + (palette[q + 1] - g) ** 2 + (palette[q + 2] - b) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  const indexOf = (r: number, g: number, b: number, a: number): number => {
    const k = ((r << 16) | (g << 8) | b) * 2 + (a === 255 ? 0 : 1);
    let id = index.get(k);
    if (id === undefined) {
      if (index.size < 255) {
        id = index.size + 1;
        palette.set([r, g, b, a], id * 4);
      } else id = nearest(r, g, b, a);
      index.set(k, id);
    }
    return id;
  };
  const levels: FloraAtlasData['levels'] = [];
  for (let l = 0, lw = W, lh = H; ; l++, lw = Math.max(1, lw >> 1), lh = Math.max(1, lh >> 1)) {
    const data = new Uint8Array(lw * lh);
    if (l < FLORA_LEVELS) {
      painted.forEach((p, i) => {
        const src = p.lv[l];
        const ox = pos[i].x >> l;
        const oy = pos[i].y >> l;
        for (let y = 0; y < src.h; y++) {
          for (let x = 0; x < src.w; x++) {
            const q = (y * src.w + x) * 4;
            const a = src.data[q + 3];
            if (a < 128) continue;
            data[(oy + y) * lw + ox + x] = indexOf(src.data[q], src.data[q + 1], src.data[q + 2], a === 255 ? 255 : RIM_ALPHA);
          }
        }
      });
    }
    levels.push({ data, width: lw, height: lh });
    if (lw === 1 && lh === 1) break;
  }
  const sprites = new Map<string, FloraSprite[]>();
  painted.forEach((p, i) => {
    let list = sprites.get(p.key);
    if (!list) sprites.set(p.key, (list = []));
    list.push({ key: p.key, variant: p.variant, x: pos[i].x, y: pos[i].y, w: p.w, h: p.h, foot: p.foot });
  });
  return { w: W, h: H, levels, palette, sprites, colours: index.size, ms: now() - t0 };
}

/** Painted atlases by biome key (CPU data survives stage restarts; GPU textures are per stage). */
const atlasCache = new Map<string, FloraAtlasData>();

export function floraAtlas(species: FloraSpecies[], biome: FloraBiome, biomeKey: string): FloraAtlasData {
  const key = `${biomeKey}|${species.map((s) => s.key).join(',')}`;
  let a = atlasCache.get(key);
  if (!a) {
    a = paintFloraAtlas(species, biome, biomeKey);
    atlasCache.set(key, a);
  }
  return a;
}

// ─── GPU ─────────────────────────────────────────────────────────────────────

const VERT_DECL = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iBox;
  attribute vec4 iDim;
  attribute vec4 iMisc;
  uniform float uFTime;
  uniform vec3 uFWind;
  uniform float uFFar;
  varying vec2 vFTex;
  varying float vFSway;
  varying vec3 vFLocN;
  flat varying vec4 vFBox;
  flat varying vec4 vFMisc;
`;

/** Sky-light normal of a billboard: (up, toward the viewer) — the top of a plant leaning toward the viewer. */
export const FLORA_SKY_NORMAL = [0.85, 0.45] as const;

// Camera right (flattened): every plant faces the view plane, yaw only.
const VERT_NORMAL = /* glsl */ `
  vec3 fR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  fR.y = 0.0;
  fR /= max(length(fR), 1e-4);
  vec3 fB = vec3(-fR.z, 0.0, fR.x);
  // Sky light (hemisphere + sun / moon, lightning): lit like the top of a plant leaning toward the viewer.
  vec3 objectNormal = normalize(vec3(0.0, ${FLORA_SKY_NORMAL[0].toFixed(2)}, 0.0) + fB * ${FLORA_SKY_NORMAL[1].toFixed(2)});
  // Local lights (lamps, neon, headlights, flashlight): a mostly view-facing card, so a light
  // behind or above the plant leaves it a silhouette instead of lighting the whole sprite.
  vFLocN = normalize(normalMatrix * normalize(fB * 0.9 + vec3(0.0, 0.3, 0.0)));
`;

const VERT_BEGIN = /* glsl */ `
  float fTexM = iDim.y / iBox.w;
  float fSwayM = (sin(uFTime * 1.7 + iDim.w) * 0.55 + sin(uFTime * 4.1 + iDim.w * 1.9) * 0.22 + uFWind.y) * iDim.z;
  float fMarg = abs(iDim.z) * 1.5 + fTexM;
  float fFoot = iMisc.x < 0.0 ? iBox.z - iMisc.z : iMisc.z;
  float fXm = mix(-fFoot * fTexM - fMarg, (iBox.z - fFoot) * fTexM + fMarg, position.x + 0.5);
  vec3 transformed = iPos + fR * fXm + vec3(0.0, position.y * iDim.y, 0.0);
  vFTex = vec2(fXm / fTexM + fFoot, position.y * iBox.w);
  vFSway = fSwayM / fTexM;
  vFBox = iBox;
  vFMisc = iMisc;
  vec2 fD = iPos.xz - cameraPosition.xz;
  bool fCull = dot(fD, fD) > uFFar * uFFar;
`;

const FRAG_DECL = /* glsl */ `
  uniform sampler2D uFAtlas;
  uniform sampler2D uFPal;
  uniform vec3 uFRim;
  uniform float uFGain;
  uniform float uFLocCap;
  varying vec2 vFTex;
  varying float vFSway;
  varying vec3 vFLocN;
  flat varying vec4 vFBox;
  flat varying vec4 vFMisc;
`;

/**
 * Mip bias: the next (coarser, hand-painted) level takes over as soon as a
 * texel would come out smaller than a screen pixel (log2 bias 1.0: a level is
 * shown at 1–2 pixels per texel, never minified). Nearest sampling of a
 * minified level skips texels differently every frame — 1-texel blades and
 * leaflets crawl as the rail camera moves; a level that is never minified
 * skips none.
 */
export const FLORA_MIP_BIAS = 1.0;

/** The shader's level pick for `rho` level-0 texels per screen pixel (CPU twin of FRAG_MAP, for tests). */
export function floraLevelFor(rho: number): number {
  return Math.max(0, Math.min(FLORA_LEVELS - 1, Math.floor(Math.log2(Math.max(rho, 1e-3)) + FLORA_MIP_BIAS)));
}

const FRAG_MAP = /* glsl */ `
  float fRim = 0.0;
  vec3 fPaint = vec3(0.0);
  {
    float h01 = clamp(vFTex.y / vFBox.w, 0.0, 1.0);
    float shift = floor(vFSway * h01 * h01 + 0.5);
    float tx = floor(vFTex.x - shift);
    float ty = floor(vFTex.y);
    if (tx < 0.0 || tx >= vFBox.z || ty < 0.0 || ty >= vFBox.w) discard;
    if (vFMisc.x < 0.0) tx = vFBox.z - 1.0 - tx;
    // Mip level from the on-screen texel size (texels per pixel), painted levels only.
    vec2 g = max(abs(dFdx(vFTex)), abs(dFdy(vFTex)));
    float rho = max(g.x, g.y);
    int lv = int(clamp(floor(log2(max(rho, 1e-3)) + ${FLORA_MIP_BIAS.toFixed(2)}), 0.0, ${(FLORA_LEVELS - 1).toFixed(1)}));
    ivec2 ip = (ivec2(vFBox.xy) >> lv) + (ivec2(int(tx), int(ty)) >> lv);
    float idx = texelFetch(uFAtlas, ip, lv).r;
    if (idx < 0.5 / 255.0) discard;
    vec4 pc = texelFetch(uFPal, ivec2(int(idx * 255.0 + 0.5), 0), 0);
    // Lighting runs on white (light only); the painted colour is applied after it (FRAG_LIGHT).
    fPaint = pc.rgb * vFMisc.y;
    fRim = pc.a < 0.99 ? 1.0 : 0.0;
  }
`;

/** Accumulator + normal for the local lights (point / spot), declared ahead of the light loops. */
const FRAG_LOCAL_DECL = /* glsl */ `
  ReflectedLight fLoc = ReflectedLight(vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
  vec3 fLocN = normalize(vFLocN);
`;

/**
 * Light → colour. Sky light (hemisphere + sun / moon, which carry the storm's
 * lightning) as it comes; local lights (lamps, neon, headlights, flashlight)
 * half desaturated and clamped (`uFLocCap`), so a coloured lamp tints a plant
 * without bleaching it and nothing lit by a lamp outshines the cast (PixelCast
 * sprites only take the stage tint). `uFGain` matches the plants' overall
 * brightness to the stage's 3D vegetation.
 */
const FRAG_LIGHT = /* glsl */ `
  #include <aomap_fragment>
  {
    vec3 fE = fLoc.directDiffuse;
    float fEl = dot(fE, vec3(0.2126, 0.7152, 0.0722));
    fE = min(mix(vec3(fEl), fE, 0.5), vec3(uFLocCap));
    vec3 fSky = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
    reflectedLight.directDiffuse = fPaint * (fSky + fE) * uFGain;
    reflectedLight.indirectDiffuse = vec3(0.0);
  }
`;

/** The point / spot light loops of three's light chunk, re-pointed at the local accumulator and normal. */
const RE_DIRECT_CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const RE_DIRECT_LOCAL = 'RE_Direct( directLight, geometryPosition, fLocN, geometryViewDir, geometryClearcoatNormal, material, fLoc );';

/** `lights_fragment_begin` with point and spot lights accumulated separately (null if three's chunk changed shape). */
export function floraLightsChunk(chunk: string = THREE.ShaderChunk.lights_fragment_begin): string | null {
  const cut = ['#if ( NUM_SUN_LIGHTS > 0 )', '#if ( NUM_DIR_LIGHTS > 0 )'].map((m) => chunk.indexOf(m)).filter((i) => i >= 0);
  if (!cut.length) return null;
  const at = Math.min(...cut);
  const head = chunk.slice(0, at);
  const local = head.split(RE_DIRECT_CALL);
  // Exactly the point and spot loops.
  if (local.length !== 3 || head.indexOf('NUM_POINT_LIGHTS') < 0 || head.indexOf('NUM_SPOT_LIGHTS') < 0) return null;
  return FRAG_LOCAL_DECL + local.join(RE_DIRECT_LOCAL) + chunk.slice(at);
}

export interface FloraFieldOptions {
  /** Plants farther than this (m, horizontal) from the camera are not drawn (fog). */
  far: number;
  /** Cool rim on the back-lit (right) exterior edge (linear RGB added as emission; 0 = off). */
  rim?: number;
  rimStrength?: number;
  /** Overall light multiplier (matches the plants to the stage's 3D vegetation; default 1). */
  gain?: number;
  /** Ceiling of the local-light (point / spot) term (default 0.6). */
  localCap?: number;
  /** Shared wind clock (s) and wind (y = gust); defaults to the field's own. */
  time?: { value: number };
  wind?: { value: THREE.Vector3 };
}

/** Tallest a billboard may stand relative to the 3D plant it replaces (it never hides much more than the plant did). */
export const FLORA_MAX_HEIGHT_K = 1.15;

const _rv = new THREE.Vector3();

/**
 * Rotation-independent width of a 3D plant: twice the largest horizontal
 * distance of its vertices from its foot (world space; call after
 * `updateMatrixWorld`). An AABB overstates a plant turned ~45° by up to √2.
 */
export function floraReach(o: THREE.Object3D, foot: THREE.Vector3): number {
  let r2 = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      _rv.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const d = (_rv.x - foot.x) ** 2 + (_rv.z - foot.z) ** 2;
      if (d > r2) r2 = d;
    }
  });
  return Math.sqrt(r2) * 2;
}

interface Inst {
  x: number;
  y: number;
  z: number;
  sp: FloraSprite;
  hM: number;
  flip: number;
  tint: number;
  sway: number;
  phase: number;
}

/**
 * Collects plant placements for one stage and builds the instanced billboard
 * mesh. Placement order is draw order (put the rail-near plants first).
 */
export class FloraField {
  private items: Inst[] = [];
  /** Height (m) of the 3D plant each billboard stands in for (NaN when placed with `add`): for audits / tests. */
  readonly refHeights: number[] = [];
  readonly time: { value: number };
  readonly wind: { value: THREE.Vector3 };
  constructor(
    readonly atlas: FloraAtlasData,
    private o: FloraFieldOptions,
  ) {
    this.time = o.time ?? { value: 0 };
    this.wind = o.wind ?? { value: new THREE.Vector3(0.8, 0, 0.6) };
  }

  get count(): number {
    return this.items.length;
  }

  /**
   * A plant of species `key` with its foot at (x, y, z), `heightM` tall (the
   * sprite keeps its aspect). Variant and mirroring come from the position
   * unless given; `sway` = metres of sway at the top.
   */
  add(key: string, x: number, y: number, z: number, heightM: number, o: { variant?: number; flip?: boolean; tint?: number; sway?: number } = {}): boolean {
    const list = this.atlas.sprites.get(key);
    if (!list || !list.length || !(heightM > 0)) return false;
    const h = hashStr(`${Math.round(x * 10)}|${Math.round(z * 10)}`);
    const sp = list[(o.variant ?? h) % list.length];
    const flip = o.flip === undefined ? ((h >>> 8) & 1 ? -1 : 1) : o.flip ? -1 : 1;
    this.items.push({ x, y, z, sp, hM: heightM, flip, tint: o.tint ?? 1, sway: o.sway ?? 0, phase: x * 0.17 + z * 0.13 });
    this.refHeights.push(NaN);
    return true;
  }

  /**
   * A billboard standing in for a 3D plant `widthM` wide (`floraReach`) and
   * `heightM` tall: picks, among the variants of `key` and of its `<key>Wide`
   * sibling (low, spreading sprites), one whose aspect suits the plant (by
   * position among those within `aspectTol` (1.3×) of the best fit — trees pass
   * a wider tolerance to keep every silhouette in play; `variants` restricts
   * the pick to those of `key`), and sizes it to span most of the plant's width
   * without standing taller than FLORA_MAX_HEIGHT_K × the 3D plant (and never
   * shorter than it). Returns the billboard's height (0 = unknown key).
   */
  fit(key: string, x: number, y: number, z: number, widthM: number, heightM: number, o: { variants?: number[]; tint?: number; sway?: number; aspectTol?: number } = {}): number {
    const base = this.atlas.sprites.get(key) ?? [];
    const cand = o.variants ? base.filter((s) => o.variants!.includes(s.variant)) : [...base, ...(this.atlas.sprites.get(`${key}Wide`) ?? [])];
    if (!cand.length || !(heightM > 0)) return 0;
    const want = Math.max(0.05, widthM * 0.75) / heightM;
    const score = (s: FloraSprite) => Math.abs(Math.log(s.w / s.h / want));
    let best = Infinity;
    for (const s of cand) best = Math.min(best, score(s));
    const pool = cand.filter((s) => score(s) <= best + Math.log(o.aspectTol ?? 1.3));
    const hsh = hashStr(`${Math.round(x * 10)}|${Math.round(z * 10)}`);
    const sp = pool[hsh % pool.length];
    const h = Math.min(heightM * FLORA_MAX_HEIGHT_K, Math.max(heightM, (widthM * 0.75 * sp.h) / sp.w));
    const flip = (hsh >>> 8) & 1 ? -1 : 1;
    this.items.push({ x, y, z, sp, hM: h, flip, tint: o.tint ?? 1, sway: o.sway ?? 0, phase: x * 0.17 + z * 0.13 });
    this.refHeights.push(heightM);
    return h;
  }

  /** Height (m) at which the sprite `add(key, x, ?, z, …)` would pick is `widthM` wide. */
  heightFor(key: string, widthM: number, x: number, z: number): number {
    const list = this.atlas.sprites.get(key);
    if (!list?.length) return 0;
    const sp = list[hashStr(`${Math.round(x * 10)}|${Math.round(z * 10)}`) % list.length];
    return (widthM * sp.h) / sp.w;
  }

  /** The instanced billboard mesh (one draw call). Textures and geometry are Kit-tracked. */
  build(): THREE.Mesh {
    const n = this.items.length;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const pos = new Float32Array(n * 3);
    const box = new Float32Array(n * 4);
    const dim = new Float32Array(n * 4);
    const misc = new Float32Array(n * 4);
    this.items.forEach((it, i) => {
      pos.set([it.x, it.y, it.z], i * 3);
      box.set([it.sp.x, it.sp.y, it.sp.w, it.sp.h], i * 4);
      dim.set([(it.hM * it.sp.w) / it.sp.h, it.hM, it.sway, it.phase], i * 4);
      misc.set([it.flip, it.tint, it.sp.foot, 0], i * 4);
    });
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('iBox', new THREE.InstancedBufferAttribute(box, 4));
    geo.setAttribute('iDim', new THREE.InstancedBufferAttribute(dim, 4));
    geo.setAttribute('iMisc', new THREE.InstancedBufferAttribute(misc, 4));
    geo.instanceCount = n;
    Kit.track(geo);
    const mesh = new THREE.Mesh(geo, this.material());
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.raycast = () => {};
    mesh.name = 'flora-billboards';
    // (Audit: the 3D plant height each billboard stands in for, NaN when placed with `add`.)
    mesh.userData.floraRef = Float32Array.from(this.refHeights);
    return mesh;
  }

  private material(): THREE.MeshLambertMaterial {
    const a = this.atlas;
    const tex = new THREE.DataTexture(a.levels[0].data, a.w, a.h, THREE.RedFormat, THREE.UnsignedByteType);
    tex.mipmaps = a.levels.map((l) => ({ data: l.data, width: l.width, height: l.height })) as unknown as typeof tex.mipmaps;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.NearestMipmapNearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.unpackAlignment = 1;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    tex.name = 'flora:atlas';
    const pal = new THREE.DataTexture(a.palette, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    pal.minFilter = pal.magFilter = THREE.NearestFilter;
    pal.colorSpace = THREE.SRGBColorSpace;
    pal.generateMipmaps = false;
    pal.needsUpdate = true;
    pal.name = 'flora:palette';
    Kit.track(tex);
    Kit.track(pal);
    const rim = new THREE.Color(this.o.rim ?? 0).multiplyScalar(this.o.rimStrength ?? 1);
    const uniforms = {
      uFAtlas: { value: tex },
      uFPal: { value: pal },
      uFTime: this.time,
      uFWind: this.wind,
      uFFar: { value: this.o.far },
      uFRim: { value: new THREE.Vector3(rim.r, rim.g, rim.b) },
      uFGain: { value: this.o.gain ?? 1 },
      uFLocCap: { value: this.o.localCap ?? 0.6 },
    };
    const lights = floraLightsChunk();
    if (!lights) throw new Error('flora: three lights_fragment_begin changed shape');
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    // (Exposed for tests and look-dev tuning.)
    m.userData.flora = uniforms;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
        .replace('#include <beginnormal_vertex>', VERT_NORMAL)
        .replace('#include <begin_vertex>', VERT_BEGIN)
        .replace('#include <fog_vertex>', '#include <fog_vertex>\n  if (fCull) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
        .replace('#include <map_fragment>', FRAG_MAP)
        .replace('#include <lights_fragment_begin>', lights)
        .replace('#include <aomap_fragment>', FRAG_LIGHT)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uFRim * fRim * vFMisc.y;');
    };
    m.customProgramCacheKey = () => 'floraBillboard2';
    m.name = 'flora-billboard';
    return Kit.track(m);
  }
}

/**
 * Show `sprites` only in ART: SPRITES and `threeD` only in ART: 3D, switching
 * live with the ART setting (`RETRO_FOLIAGE` is the SPRITES flag the game sets).
 * Checked at the start of every render of `scene` — also while the simulation
 * is frozen (pause screen, captures) — so it costs one compare per render.
 */
export function floraArtToggle(scene: THREE.Scene, sprites: THREE.Object3D[], threeD: THREE.Object3D[]): () => void {
  let applied = -1;
  const apply = () => {
    const on = RETRO_FOLIAGE.value > 0.5 ? 1 : 0;
    if (on === applied) return;
    applied = on;
    for (const o of sprites) o.visible = on === 1;
    for (const o of threeD) o.visible = on === 0;
  };
  apply();
  const prev = scene.onBeforeRender;
  // Explicit parameters (no rest array): nothing is allocated per render.
  scene.onBeforeRender = function (this: THREE.Scene, r, s, c, rt, m, g) {
    apply();
    prev.call(this, r, s, c, rt, m, g);
  };
  return () => {
    scene.onBeforeRender = prev;
  };
}
