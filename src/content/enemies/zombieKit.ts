import * as THREE from 'three';
import type { Rng } from '../../core/Rng';
import type { HitPart } from '../../core/types';
import { Kit, RETRO_DETAIL } from '../kit/ModelKit';
import { Textures, type TexName } from '../kit/Textures';
import { buildHumanoid, type HumanoidRig, type Limb, type LegLimb } from '../kit/humanoid';
import { humanLook, type HumanLook, type Outfit } from '../pixel/human';

/** Painter seeds for ART: SPRITES looks (never the world RNG: gameplay stays identical in both ART modes). */
let lookSeed = 1;

/**
 * Zombie model kit: palettes, outfits, gore dressing, a draw-call saving
 * "bake" step and pose helpers shared by every zombie in `zombies.ts`.
 *
 * Pipeline: `new ZBody(...)` builds a humanoid rig and tags every mesh with a
 * hit zone → dress it (`dressVariant`, `addGore`, `addFace`, type-specific
 * parts) → `finish()` merges all static meshes that hang off the same joint
 * and share a zone into ONE vertex-coloured mesh. A dressed walker ends up at
 * ~13 draw calls instead of ~30, and every zombie shares a single material.
 *
 * Retro surfaces: that one material carries SEVERAL pixel textures (rotting
 * skin, cloth, riot-armour metal, wet gore, hair, leather, camo…). Each baked
 * part stores its surface class (`ZT`) plus a random texture offset in a
 * per-vertex attribute, so a cop's shirt, his face and his duty belt are all
 * textured differently without a single extra draw call. See `ZSURF`.
 *
 * Animated sub-parts (spitter throat sac, bloater belly) get their own pivot;
 * meshes flagged `userData.keep` (individually poppable pustules) are left alone.
 */

export type Zone = HitPart | 'none';

// ─── Palettes ────────────────────────────────────────────────────────────────

/** Sickly zombie skin tones (pale so they read at night). */
export const SKIN_TONES = [0xa9b79a, 0x93a77e, 0xa3ab9e, 0x96a2ae, 0xb4ae84, 0x86926f, 0x8a8c78, 0x7a7660] as const;
export const BLOOD = 0x6a0c0c;
export const BLOOD_DARK = 0x3a0606;
export const GORE = 0x7a1612;
export const BONE = 0xd8cfb0;
export const GUTS = 0x9a4646;
export const GOO = 0x7dff3a;

/** Emission of skin (fraction of its own colour) — pale highlights at night. */
const SKIN_E = 0.26;
const CLOTH_E = 0.03;
const TEETH = 0xd8d0b0;
const MOUTH = 0x1a0606;
/** Exposed muscle (brutes). */
export const MUSCLE = 0x6a1a16;

// ─── Retro surfaces ─────────────────────────────────────────────────────────

/**
 * Surface classes of baked parts. Set `mesh.userData.t` to force one;
 * otherwise it is inferred at bake time (armour zone → METAL, blood/gore
 * colours → GORE, bone → BONE, skin → SKIN, everything else CLOTH).
 * BONE doubles as a subtle grit for hard plastics (hard hats); FLESH is clean,
 * living skin for civilians (same texture, faint and without the purple veins).
 */
export const ZT = { SKIN: 0, CLOTH: 1, METAL: 2, GORE: 3, HAIR: 4, LEATHER: 5, BONE: 6, CAMO: 7, GOWN: 8, FLAT: 9, FLESH: 10, PLAID: 11 } as const;
export type ZSurface = (typeof ZT)[keyof typeof ZT];

/**
 * Pixel texture per surface class (indexed by `ZT`). `scale` multiplies the
 * texture's own density (< 1 = chunkier texels): zombies are mostly seen from
 * 3–12 m at ~288 lines, so texels are kept around 2 cm — one or two screen
 * pixels — instead of dissolving into mip-mapped mush.
 *
 * CLOTH stays soft (the 'cloth' weave turns into knit rows on big bright
 * garments) and SKIN veins are mostly desaturated (the raw texture's tinted
 * veins quantise into magenta speckle on large pale bodies). PLAID is the
 * living worker's buffalo-check flannel — a pattern no zombie wears.
 */
const ZSURF: { tex: TexName | null; scale: number; strength: number; sat?: number }[] = [
  /* SKIN    */ { tex: 'skin', scale: 0.8, strength: 0.75, sat: 0.25 },
  /* CLOTH   */ { tex: 'cloth', scale: 0.8, strength: 0.6 },
  /* METAL   */ { tex: 'metal', scale: 2, strength: 0.9 },
  /* GORE    */ { tex: 'hide', scale: 2.5, strength: 1 },
  /* HAIR    */ { tex: 'bark', scale: 2.5, strength: 1 },
  /* LEATHER */ { tex: 'hide', scale: 3, strength: 0.65 },
  /* BONE    */ { tex: 'hide', scale: 4, strength: 0.35 },
  /* CAMO    */ { tex: 'leaves', scale: 2, strength: 1 },
  /* GOWN    */ { tex: 'wallpaper', scale: 2.2, strength: 0.6 },
  /* FLAT    */ { tex: null, scale: 1, strength: 0 },
  /* FLESH   */ { tex: 'skin', scale: 0.8, strength: 0.3, sat: 0 },
  /* PLAID   */ { tex: 'checker', scale: 4, strength: 0.42 },
];

/**
 * Added to a part's surface class when its texture must stick to the surface
 * (parts under a pivot whose SCALE is animated — the bloater's swelling belly):
 * the shader then projects in the mesh's own unscaled space, so the pattern
 * stretches with the skin instead of crawling across it.
 */
const ZT_LOCAL = 16;

const GORE_COLORS = new Set<number>([BLOOD, BLOOD_DARK, GORE, GUTS, MUSCLE, MOUTH, 0x2a1a1a]);

/** Per-part texture offsets so no two zombies (or limbs) show the same pattern in the same spot. */
let texSeed = 1;
function texOffset(): number {
  texSeed = (Math.imul(texSeed, 1103515245) + 12345) & 0x7fffffff;
  return (texSeed / 0x7fffffff) * 4;
}

/** Surface class of a part about to be baked. */
function surfaceOf(m: THREE.Mesh, color: number): number {
  const t = m.userData.t as number | undefined;
  if (t !== undefined) return t;
  if (m.userData.z === 'armor') return ZT.METAL;
  if (GORE_COLORS.has(color)) return ZT.GORE;
  if (color === BONE || color === TEETH) return ZT.BONE;
  if (m.userData.e === SKIN_E) return ZT.SKIN;
  return ZT.CLOTH;
}

/**
 * GLSL for the multi-surface texture lookup. The projection plane comes from
 * the screen-space derivative face normal (smooth-normal parts such as the
 * bloater belly still get one crisp plane per triangle). Position derivatives
 * are taken once, in uniform control flow, and swizzled to the chosen plane;
 * the part's class then does ONE explicit-gradient fetch (`textureGrad`) from
 * its own texture — one fetch per fragment instead of one per texture, correct
 * mip selection, and the per-part texture offsets never feed the gradients (no
 * mip seam where two parts meet).
 */
function surfaceShader() {
  const names: TexName[] = [];
  for (const s of ZSURF) if (s.tex && !names.includes(s.tex)) names.push(s.tex);
  const f = (n: number) => n.toFixed(5);
  const samplers = names.map((_, i) => `uniform sampler2D uZTex${i};`).join('\n');
  let select = '';
  ZSURF.forEach((s, i) => {
    const ti = s.tex ? names.indexOf(s.tex) : -1;
    const rt = s.tex ? Textures.get(s.tex) : null;
    const scale = rt ? rt.density * s.scale : 1;
    const gain = rt ? rt.gain : 1;
    select += `${i ? 'else ' : ''}if (zc < ${i}.5) { zi = ${ti}; zs = ${f(scale)}; zg = ${f(gain)}; zk = ${f(s.strength)}; zsat = ${f(s.sat ?? 1)}; }\n`;
  });
  let fetch = '';
  names.forEach((_, i) => {
    fetch += `${i ? 'else ' : ''}if (zi == ${i}) zp = textureGrad(uZTex${i}, zuv, zgx, zgy).rgb;\n`;
  });
  return {
    names,
    pars: `${samplers}\nuniform float uRetroDetail;\nvarying vec3 vZPos;\nvarying vec3 vZTex;`,
    main: `{
      vec3 zdx = dFdx(vZPos);
      vec3 zdy = dFdy(vZPos);
      vec3 an = abs(cross(zdx * 64.0, zdy * 64.0));
      vec2 ruv; vec2 zgx; vec2 zgy;
      if (an.x > an.y && an.x > an.z) { ruv = vZPos.zy; zgx = zdx.zy; zgy = zdy.zy; }
      else if (an.y > an.z) { ruv = vZPos.xz; zgx = zdx.xz; zgy = zdy.xz; }
      else { ruv = vZPos.xy; zgx = zdx.xy; zgy = zdy.xy; }
      float zc = floor(vZTex.x + 0.5);
      int zi = -1; float zs = 1.0; float zg = 1.0; float zk = 0.0; float zsat = 1.0;
      ${select}
      vec2 zuv = (ruv + vZTex.yz) * zs;
      zgx *= zs; zgy *= zs;
      vec3 zp = vec3(1.0);
      ${fetch}
      zp = mix(vec3(dot(zp, vec3(0.299, 0.587, 0.114))), zp, zsat);
      vec3 zf = max(mix(vec3(1.0), zp * zg, zk * uRetroDetail), vec3(0.0));
      diffuseColor.rgb *= zf;
      totalEmissiveRadiance *= zf;
    }`,
  };
}

const CASUAL_SHIRTS = [0x4b5a6b, 0x6b4545, 0x56663f, 0x7a6a50, 0x3d3d4d, 0x8a8a86, 0x9a7a34, 0x34587a, 0x7a3a4a, 0xc8c2b2, 0x2f5f56];
const CASUAL_PANTS = [0x2e3d5c, 0x3a4a6a, 0x8a7a5a, 0x262626, 0x4a4a4a, 0x3b4252, 0x4a3a2a];
const SHOES = [0x1c1c1c, 0x3a2a1a, 0x5a5a5a, 0x2a2a35];
const HAIR = [0x2a2018, 0x4a3018, 0x161616, 0x8a7040, 0x6a6a66, 0x5a2a14];

export const ZOMBIE_VARIANTS = ['civilian', 'cop', 'nurse', 'doctor', 'worker', 'office', 'patient', 'soldier', 'biker'] as const;
export type ZombieVariant = (typeof ZOMBIE_VARIANTS)[number];

// ─── Shared material + geometry baking ──────────────────────────────────────

const _col = new THREE.Color();
/** Baked geometries owned by live zombies (disposed with their zombie, or at stage end). */
const liveGeos = new Set<THREE.BufferGeometry>();
let guardLive = false;
let zMat: THREE.MeshLambertMaterial | null = null;
let zUniforms: Record<string, { value: THREE.Texture }> = {};
let zTexNames: TexName[] = [];

/** Register a sentinel with Kit so any still-live baked geometry is freed when the stage's GPU resources are disposed. */
function stageGuard() {
  if (guardLive) return;
  guardLive = true;
  Kit.track({
    dispose() {
      for (const g of liveGeos) g.dispose();
      liveGeos.clear();
      guardLive = false;
    },
  });
}

/** Free baked geometries (called when their zombie is removed). */
export function releaseGeos(list: THREE.BufferGeometry[]) {
  for (const g of list) {
    if (liveGeos.delete(g)) g.dispose();
  }
  list.length = 0;
}

/**
 * The one material every baked zombie mesh uses: flat Lambert with vertex
 * colours, where the vertex alpha channel is an EMISSION MASK (alpha 1 = no
 * glow, lower = self-lit by its own colour). Skin gets a little so pale
 * silhouettes still read in dark stages without lighting every zombie.
 */
export function zombieMaterial(): THREE.MeshLambertMaterial {
  if (!zMat) {
    const m = (zMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.emissive.setHex(0xffffff);
    const surf = surfaceShader();
    zTexNames = surf.names;
    zUniforms = {};
    for (let i = 0; i < surf.names.length; i++) zUniforms[`uZTex${i}`] = { value: Textures.get(surf.names[i]).texture };
    const uniforms = zUniforms;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.uniforms.uRetroDetail = RETRO_DETAIL;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 zTex;\nvarying vec3 vZPos;\nvarying vec3 vZTex;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // World-sized texels; surface-locked parts (class + ${ZT_LOCAL}) use their unscaled local space.
          bool zLoc = zTex.x > ${ZT_LOCAL - 0.5};
          vZPos = zLoc ? position : position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
          vZTex = vec3(zLoc ? zTex.x - ${ZT_LOCAL}.0 : zTex.x, zTex.yz);`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${surf.pars}`)
        .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb * ( 1.0 - vColor.a );')
        .replace('#include <color_fragment>', `#include <color_fragment>\n${surf.main}`);
    };
    m.customProgramCacheKey = () => 'overrun-zombie-emask-surf3';
    // Already textured: a later Kit.applyTexture() must not stack a second projection.
    m.userData.retroTex = 'skin';
  } else {
    // Textures are regenerated after a stage's GPU resources were disposed — follow them.
    for (let i = 0; i < zTexNames.length; i++) zUniforms[`uZTex${i}`].value = Textures.get(zTexNames[i]).texture;
  }
  Kit.track(zMat);
  return zMat;
}

function colorOf(m: THREE.Mesh): number {
  return (m.userData.c as number | undefined) ?? (m.material as THREE.MeshLambertMaterial).color.getHex();
}

const _nm = new THREE.Matrix3();

/**
 * Merge meshes into one non-indexed geometry in their parent's space, in a
 * single pass (no intermediate clones). Lambert parts get an RGBA colour
 * attribute (alpha = 1 − emission). Palettes and gore are random per zombie,
 * so the result is owned by that zombie (see `releaseGeos`) rather than cached.
 * `local` = surface-locked texture projection (see `ZT_LOCAL`).
 */
function mergedGeo(list: THREE.Mesh[], colored: boolean, local = false): THREE.BufferGeometry {
  stageGuard();
  let count = 0;
  for (const m of list) {
    m.updateMatrix();
    const g = m.geometry;
    count += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = colored ? new Float32Array(count * 4) : null;
  const zt = colored ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const m of list) {
    const g = m.geometry;
    const P = g.attributes.position.array;
    const N = g.attributes.normal?.array;
    const idx = g.index ? g.index.array : null;
    const e = m.matrix.elements;
    const ne = _nm.getNormalMatrix(m.matrix).elements;
    let cr = 0;
    let cg = 0;
    let cb = 0;
    let ca = 1;
    let ts = 0;
    let tu = 0;
    let tv = 0;
    if (col) {
      const hex = colorOf(m);
      _col.setHex(hex);
      cr = _col.r;
      cg = _col.g;
      cb = _col.b;
      ca = 1 - Math.min(1, Math.max(0, (m.userData.e as number | undefined) ?? 0));
      ts = surfaceOf(m, hex) + (local ? ZT_LOCAL : 0);
      tu = texOffset();
      tv = texOffset();
    }
    const n = idx ? idx.length : P.length / 3;
    for (let i = 0; i < n; i++) {
      const v = (idx ? idx[i] : i) * 3;
      const x = P[v];
      const y = P[v + 1];
      const z = P[v + 2];
      const o3 = o * 3;
      pos[o3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (N) {
        const nx = N[v];
        const ny = N[v + 1];
        const nz = N[v + 2];
        const tx = ne[0] * nx + ne[3] * ny + ne[6] * nz;
        const ty = ne[1] * nx + ne[4] * ny + ne[7] * nz;
        const tz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const l = Math.hypot(tx, ty, tz) || 1;
        nor[o3] = tx / l;
        nor[o3 + 1] = ty / l;
        nor[o3 + 2] = tz / l;
      }
      if (col && zt) {
        const o4 = o * 4;
        col[o4] = cr;
        col[o4 + 1] = cg;
        col[o4 + 2] = cb;
        col[o4 + 3] = ca;
        zt[o3] = ts;
        zt[o3 + 1] = tu;
        zt[o3 + 2] = tv;
      }
      o++;
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) merged.setAttribute('color', new THREE.BufferAttribute(col, 4));
  if (zt) merged.setAttribute('zTex', new THREE.BufferAttribute(zt, 3));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  // 'shared' keeps World.dispose() from touching it; the owning zombie frees it.
  merged.userData.shared = true;
  liveGeos.add(merged);
  return merged;
}

/**
 * Merge static meshes that hang directly off the same joint and share a hit
 * zone into one mesh (Lambert parts → shared vertex-colour material; other
 * materials, e.g. glowing eyes, merge per material). Hidden meshes, meshes
 * with children and `userData.keep` meshes are left untouched.
 * Set `userData.texLocal` on a pivot whose scale is animated (swelling bellies)
 * so its parts' textures stretch with it instead of swimming.
 */
export function bakeTree(root: THREE.Object3D, out: THREE.BufferGeometry[] = []) {
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) nodes.push(o);
  });
  for (const p of nodes) {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const c of p.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.userData.keep || !m.visible || m.children.length) continue;
      const mat = m.material as THREE.Material;
      const lam = (mat as THREE.MeshLambertMaterial).isMeshLambertMaterial === true && !mat.transparent && !mat.vertexColors;
      const key = `${(m.userData.z as Zone | undefined) ?? 'none'}|${lam ? 'lam' : mat.uuid}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(m);
    }
    for (const [key, list] of groups) {
      const lam = key.endsWith('|lam');
      if (!lam && list.length < 2) continue;
      const geo = mergedGeo(list, lam, p.userData.texLocal === true);
      out.push(geo);
      const mesh = new THREE.Mesh(geo, lam ? zombieMaterial() : (list[0].material as THREE.Material));
      mesh.userData.z = list[0].userData.z ?? 'none';
      mesh.userData.baked = true;
      for (const m of list) p.remove(m);
      p.add(mesh);
    }
  }
}

/** Sort every visible mesh under `root` into hit-zone lists (by `userData.z`). */
export function collectZones(root: THREE.Object3D, zones: Record<Zone, THREE.Mesh[]>) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const z = (m.userData.z as Zone | undefined) ?? 'none';
    // Skip parts already hidden at build time (e.g. a missing arm).
    let n: THREE.Object3D | null = m;
    while (n && n !== root) {
      if (!n.visible) return;
      n = n.parent;
    }
    zones[z].push(m);
  });
  return zones;
}

/** A baked plain humanoid (see `bakeHumanoid`). */
export interface BakedHumanoid {
  zones: Record<Zone, THREE.Mesh[]>;
  /** Baked geometry owned by the caller — free with `releaseGeos` when it is removed. */
  geos: THREE.BufferGeometry[];
}

/**
 * Bake a living (civilian) humanoid with the same shared surface material as
 * the zombies: clean FLESH skin, cloth clothes, leather shoes, textured hair.
 * Parts added under the rig's joints before baking (faces, hats, vests) merge
 * for free; pre-set `userData.t` / `userData.e` on them to pick a surface or a
 * self-lit glow, and `userData.z = 'none'` on props that stick out past the
 * body (hat brims) so they bake into a mesh that is never registered as a
 * target. `skinGlow` / `clothGlow` = emission of skin / clothes so the
 * innocent stays readable in dark stages. Returns the hit-zone lists to register.
 */
export function bakeHumanoid(rig: HumanoidRig, o: { skin: number; skinGlow?: number; clothGlow?: number }): BakedHumanoid {
  const skinE = o.skinGlow ?? 0.14;
  const clothE = o.clothGlow ?? 0.07;
  const joints = new Map<THREE.Object3D, Zone>();
  joints.set(rig.head, 'head');
  for (const p of [rig.hips, rig.spine, rig.chest, rig.neck]) joints.set(p, 'torso');
  for (const a of [rig.armL, rig.armR]) joints.set(a.shoulder, 'limb').set(a.elbow, 'limb');
  for (const l of [rig.legL, rig.legR]) joints.set(l.hip, 'limb').set(l.knee, 'limb');
  const hair = new Set<THREE.Object3D>(rig.meshes.head.filter((m) => m !== rig.headMesh));
  rig.root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.z === undefined) {
      let p: THREE.Object3D | null = m.parent;
      while (p && !joints.has(p)) p = p.parent;
      m.userData.z = (p && joints.get(p)) ?? 'torso';
    }
    const skin = colorOf(m) === o.skin;
    if (m.userData.t === undefined) {
      m.userData.t = skin ? ZT.FLESH : hair.has(m) ? ZT.HAIR : m === rig.legL.foot || m === rig.legR.foot ? ZT.LEATHER : ZT.CLOTH;
    }
    if (m.userData.e === undefined) m.userData.e = skin ? skinE : clothE;
  });
  const geos: THREE.BufferGeometry[] = [];
  bakeTree(rig.root, geos);
  const zones: Record<Zone, THREE.Mesh[]> = { head: [], torso: [], limb: [], weak: [], armor: [], tail: [], body: [], none: [] };
  return { zones: collectZones(rig.root, zones), geos };
}

// ─── Body builder ────────────────────────────────────────────────────────────

export interface ZBodyOptions {
  height: number;
  skin: number;
  bulk?: number;
  headSize?: number;
  armLength?: number;
  /** null = bald. */
  hair?: number | null;
}

/**
 * A humanoid rig being dressed as a zombie. Coordinates passed to the helpers
 * are in the parent joint's space (unscaled 1.78 m humanoid units).
 */
export class ZBody {
  readonly rig: HumanoidRig;
  readonly skin: number;
  readonly bulk: number;
  readonly hs: number;
  readonly al: number;
  /** Hit-zone mesh lists, filled by finish(). */
  readonly zones: Record<Zone, THREE.Mesh[]> = { head: [], torso: [], limb: [], weak: [], armor: [], tail: [], body: [], none: [] };
  headMesh!: THREE.Mesh;
  readonly pelvis: THREE.Mesh;
  readonly neckMesh: THREE.Mesh;
  /** Geometry created by the bake (owned by this body). */
  readonly geos: THREE.BufferGeometry[] = [];
  /** What the PixelCast painter draws (ART: SPRITES): filled in as the body is dressed. */
  readonly look: HumanLook;
  private zoneOf = new Map<THREE.Object3D, Zone>();

  constructor(o: ZBodyOptions) {
    this.skin = o.skin;
    this.bulk = o.bulk ?? 1;
    this.hs = o.headSize ?? 1;
    this.al = o.armLength ?? 1;
    this.look = humanLook({
      dead: true,
      skin: o.skin,
      bulk: this.bulk,
      headSize: this.hs,
      armLength: this.al,
      hair: o.hair === undefined ? null : o.hair,
      seed: (lookSeed = (lookSeed * 48271) % 2147483647),
    });
    const r = (this.rig = buildHumanoid({
      height: o.height,
      skin: o.skin,
      bulk: this.bulk,
      headSize: this.hs,
      armLength: this.al,
      hair: o.hair === undefined ? null : o.hair,
    }));
    this.pelvis = r.meshes.torso[1];
    this.neckMesh = r.neck.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    const z = this.zoneOf;
    z.set(r.head, 'head');
    for (const p of [r.hips, r.spine, r.chest, r.neck]) z.set(p, 'torso');
    for (const a of [r.armL, r.armR]) z.set(a.shoulder, 'limb').set(a.elbow, 'limb');
    for (const l of [r.legL, r.legR]) z.set(l.hip, 'limb').set(l.knee, 'limb');
    for (const m of r.meshes.head) this.tag(m, 'head');
    for (const m of r.meshes.torso) this.tag(m, 'torso');
    for (const m of r.meshes.limbs) this.tag(m, 'limb');
    this.tag(this.neckMesh, 'torso');
    // Hair (the humanoid's scalp block) and shoes get their own surfaces.
    for (const m of r.meshes.head) if (m !== r.headMesh) m.userData.t = ZT.HAIR;
    for (const l of [r.legL, r.legR]) l.foot.userData.t = ZT.LEATHER;
  }

  private tag(m: THREE.Mesh, zone: Zone) {
    m.userData.z = zone;
    const skin = colorOf(m) === this.skin;
    m.userData.e = skin ? SKIN_E : CLOTH_E;
    if (skin) m.userData.t = ZT.SKIN;
  }

  zoneFor(parent: THREE.Object3D): Zone {
    let p: THREE.Object3D | null = parent;
    while (p) {
      const z = this.zoneOf.get(p);
      if (z) return z;
      p = p.parent;
    }
    return 'torso';
  }

  /** Front surface (z) of the torso in spine space. */
  get chestZ() {
    return 0.11 * Math.sqrt(this.bulk);
  }
  get chestW() {
    return 0.38 * this.bulk;
  }
  /** Front surface (z) of the face in head space. */
  get faceZ() {
    return 0.01 + 0.12 * this.hs;
  }

  /**
   * Add a coloured box. `e` = emission (0..1). Zone defaults to the joint's zone.
   * Body-skin coloured parts get the skin surface (+ its night glow); set
   * `userData.t` on the result to pick another surface (see `ZT`).
   */
  box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, e = 0, zone?: Zone): THREE.Mesh {
    const m = Kit.add(parent, Kit.box(w, h, d), Kit.mat(color), x, y, z, rx, ry, rz);
    m.userData.z = zone ?? this.zoneFor(parent);
    this.skinAware(m, color, e);
    return m;
  }

  /** Add any Kit geometry with a Lambert colour. */
  part(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, e = 0, zone?: Zone): THREE.Mesh {
    const m = Kit.add(parent, geo, Kit.mat(color), x, y, z, rx, ry, rz, sx, sy, sz);
    m.userData.z = zone ?? this.zoneFor(parent);
    this.skinAware(m, color, e);
    return m;
  }

  private skinAware(m: THREE.Mesh, color: number, e: number) {
    if (color === this.skin) {
      m.userData.t = ZT.SKIN;
      m.userData.e = e || SKIN_E;
    } else if (e) m.userData.e = e;
  }

  /** Same as `box`, with an explicit surface class. */
  sbox(t: ZSurface, parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, e = 0, zone?: Zone): THREE.Mesh {
    const m = this.box(parent, w, h, d, color, x, y, z, rx, ry, rz, e, zone);
    m.userData.t = t;
    return m;
  }

  /** Unlit glowing part (eyes, pustules, bile). */
  glow(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, intensity: number, x: number, y: number, z: number, zone?: Zone): THREE.Mesh {
    const m = Kit.add(parent, geo, Kit.glow(color, intensity), x, y, z);
    m.userData.z = zone ?? this.zoneFor(parent);
    return m;
  }

  recolor(m: THREE.Mesh, color: number, e = CLOTH_E, t: ZSurface = ZT.CLOTH) {
    m.material = Kit.mat(color);
    const skin = color === this.skin;
    m.userData.e = skin ? SKIN_E : e;
    m.userData.t = skin ? ZT.SKIN : t;
  }

  /** Recolour the standard clothing slots (`t` = their surface; shoes are leather). */
  clothes(o: { shirt?: number; sleeves?: 'none' | 'short' | 'long'; sleeveColor?: number; pants?: number; shins?: 'pants' | 'skin'; thighs?: 'pants' | 'skin'; shoes?: number; e?: number }, t: ZSurface = ZT.CLOTH) {
    const r = this.rig;
    const e = o.e ?? CLOTH_E;
    if (o.shirt !== undefined) this.recolor(r.torsoMesh, o.shirt, e, t);
    const sleeve = o.sleeveColor ?? o.shirt;
    if (o.sleeves && sleeve !== undefined) {
      for (const a of [r.armL, r.armR]) {
        this.recolor(a.upper, o.sleeves === 'none' ? this.skin : sleeve, e, t);
        this.recolor(a.lower, o.sleeves === 'long' ? sleeve : this.skin, e, t);
      }
    }
    if (o.pants !== undefined) {
      this.recolor(this.pelvis, o.pants, CLOTH_E, t);
      for (const l of [r.legL, r.legR]) {
        this.recolor(l.thigh, o.thighs === 'skin' ? this.skin : o.pants, CLOTH_E, t);
        this.recolor(l.shin, o.shins === 'skin' ? this.skin : o.pants, CLOTH_E, t);
      }
    }
    if (o.shoes !== undefined) for (const l of [r.legL, r.legR]) this.recolor(l.foot, o.shoes, CLOTH_E, ZT.LEATHER);
  }

  /** Bake static meshes and collect hit-zone lists. Call once, after all dressing. */
  finish() {
    bakeTree(this.rig.root, this.geos);
    const zones = this.zones;
    collectZones(this.rig.root, zones);
    this.headMesh =
      (this.rig.head.children.find((c) => (c as THREE.Mesh).isMesh && c.userData.z === 'head' && c.userData.baked && (c as THREE.Mesh).material === zombieMaterial()) as THREE.Mesh | undefined) ??
      zones.head[0] ??
      this.rig.headMesh;
  }

  /** Free the baked geometry (the zombie and its severed limbs must be gone). */
  dispose() {
    releaseGeos(this.geos);
  }
}

// ─── Dressing ────────────────────────────────────────────────────────────────

/** Glowing eyes + sunken brow + gaping mouth. */
export function addFace(b: ZBody, rng: Rng, eyeColor: number, eyeGlow = 1.6) {
  const h = b.rig.head;
  const hs = b.hs;
  const fz = b.faceZ;
  const eye = Kit.box(0.058 * hs, 0.036 * hs, 0.02);
  const eyeMat = Kit.glow(eyeColor, eyeGlow);
  for (const s of [1, -1]) {
    const m = Kit.add(h, eye, eyeMat, s * 0.052 * hs, 0.148 * hs, fz + 0.002);
    m.userData.z = 'head';
  }
  // Brow ridge (darker skin) makes the eyes look sunken.
  _col.setHex(b.skin).multiplyScalar(0.62);
  b.sbox(ZT.SKIN, h, 0.2 * hs, 0.028 * hs, 0.03, _col.getHex(), 0, 0.182 * hs, fz - 0.004);
  // Mouth: dark gash, sometimes a hanging jaw with teeth.
  const open = rng.chance(0.55);
  b.look.eyes = eyeColor;
  b.look.mouthOpen = open;
  b.box(h, 0.11 * hs, (open ? 0.05 : 0.03) * hs, 0.014, MOUTH, 0, 0.065 * hs, fz + 0.002);
  if (open) b.box(h, 0.08 * hs, 0.014 * hs, 0.016, TEETH, 0, 0.082 * hs, fz + 0.004);
  // Blood drool down the chin.
  if (rng.chance(0.6)) {
    b.look.drool = true;
    b.box(h, 0.03 * hs, 0.06 * hs, 0.012, BLOOD, rng.spread(0.03) * hs, 0.03 * hs, fz + 0.003);
  }
  // Face wound.
  if (rng.chance(0.35)) {
    const side = rng.chance(0.5) ? 1 : -1;
    b.look.faceWound = side;
    b.box(h, 0.06 * hs, 0.05 * hs, 0.012, BLOOD_DARK, side * 0.065 * hs, 0.1 * hs, fz + 0.002);
  }
  // Ears.
  b.box(h, 0.03, 0.06 * hs, 0.05 * hs, b.skin, 0.115 * hs, 0.14 * hs, -0.01);
  b.box(h, 0.03, 0.06 * hs, 0.05 * hs, b.skin, -0.115 * hs, 0.14 * hs, -0.01);
}

/** Torn clothes, wounds, exposed ribs, blood. `amount` 0..1+ scales how gory. */
export function addGore(b: ZBody, rng: Rng, shirt: number, amount = 1) {
  const r = b.rig;
  const fz = b.chestZ;
  const w = b.chestW;
  const sp = r.spine;
  // Ragged hem strips hanging below the shirt.
  const rags = rng.int(1, 3);
  const L = b.look;
  L.rags = rags + 1;
  for (let i = 0; i < rags; i++) {
    const x = rng.pick([-0.12, -0.05, 0.03, 0.1]) * b.bulk;
    const back = rng.chance(0.35);
    b.box(sp, rng.pick([0.06, 0.08, 0.1]), rng.pick([0.06, 0.09]), 0.02, shirt, x, -0.05, back ? -fz + 0.01 : fz - 0.01, 0, 0, rng.spread(0.25));
  }
  // Torso wound / exposed ribs.
  if (rng.chance(0.38 * amount)) {
    const side = rng.chance(0.5) ? 1 : -1;
    L.ribs = side;
    b.box(sp, 0.15, 0.17, 0.012, BLOOD_DARK, side * 0.08 * b.bulk, 0.29, fz + 0.004);
    for (let i = 0; i < 3; i++) b.box(sp, 0.12, 0.022, 0.014, BONE, side * 0.08 * b.bulk, 0.235 + i * 0.05, fz + 0.009);
  } else if (rng.chance(0.7 * amount)) {
    const x = rng.pick([-0.09, 0, 0.08]);
    L.bellyWound = x < 0 ? -1 : x > 0 ? 1 : 0.4;
    b.box(sp, 0.11, 0.12, 0.012, BLOOD, x * b.bulk, rng.pick([0.1, 0.2]), fz + 0.004);
  }
  // Bite wound / skin through torn shirt.
  if (rng.chance(0.45)) {
    const x = rng.pick([-0.1, 0.1]);
    L.bite = x < 0 ? -1 : 1;
    b.box(sp, 0.1, 0.08, 0.012, b.skin, x * b.bulk, 0.06, fz + 0.003, 0, 0, 0, SKIN_E);
  }
  // Feeding blood down the front.
  if (rng.chance(0.55 * amount)) {
    L.chestBlood = true;
    b.box(sp, w * 0.55, 0.09, 0.012, BLOOD, 0, 0.4, fz + 0.005);
    b.box(sp, 0.03, 0.14, 0.012, BLOOD, -0.05, 0.31, fz + 0.005);
    b.box(sp, 0.025, 0.1, 0.012, BLOOD, 0.04, 0.33, fz + 0.005);
  }
  // Arm wound band.
  if (rng.chance(0.5 * amount)) {
    const left = rng.chance(0.5);
    L.armWound = left ? 1 : -1;
    const a = left ? r.armL : r.armR;
    b.box(a.elbow, 0.096, 0.07, 0.106, BLOOD, 0, -0.11 * b.al, 0);
  }
  // Torn trouser leg showing a bloody shin.
  if (rng.chance(0.4 * amount)) {
    const left = rng.chance(0.5);
    L.legWound = left ? 1 : -1;
    const l = left ? r.legL : r.legR;
    b.box(l.knee, 0.085, 0.12, 0.012, b.skin, 0, -0.16, 0.069, 0, 0, 0, SKIN_E);
    b.box(l.knee, 0.05, 0.05, 0.014, BLOOD, 0.01, -0.15, 0.072);
  }
}

/** Record outfit details for the pixel-art painter. */
function wear(b: ZBody, outfit: Outfit, o: Partial<HumanLook>) {
  Object.assign(b.look, o);
  b.look.outfit = outfit;
  if (o.shirt !== undefined && o.sleeveColor === undefined) b.look.sleeveColor = o.shirt;
}

/** Optional long hair at the back of the head. */
function longHair(b: ZBody, color: number) {
  b.look.longHair = true;
  const hs = b.hs;
  b.sbox(ZT.HAIR, b.rig.head, 0.235 * hs, 0.22 * hs, 0.05, color, 0, 0.12 * hs, -0.125 * hs - 0.005);
}

/**
 * Clothe the body for a walker variant. Returns the main shirt colour (used
 * for ragged hem strips).
 */
export function dressVariant(b: ZBody, variant: string, rng: Rng): number {
  const r = b.rig;
  const hs = b.hs;
  const fz = b.chestZ;
  const w = b.chestW;
  const sp = r.spine;
  const head = r.head;
  const top = 0.26 * hs;
  switch (variant as ZombieVariant) {
    case 'cop': {
      const navy = rng.pick([0x2a3f6a, 0x263860]);
      wear(b, 'cop', { shirt: navy, sleeves: 'long', pants: 0x222c48, pantsPat: 'cloth', shoes: 0x1a1a1c, belt: 0x1e1a18, badge: 0xd4af37, tie: 0x1c2440 });
      b.clothes({ shirt: navy, sleeves: 'long', pants: 0x222c48, shoes: 0x1a1a1c });
      b.sbox(ZT.LEATHER, r.hips, 0.35 * b.bulk, 0.05, 0.21 * Math.sqrt(b.bulk), 0x1e1a18, 0, 0.055, 0); // duty belt
      b.sbox(ZT.FLAT, r.hips, 0.05, 0.035, 0.012, 0xc8a840, 0, 0.055, 0.105 * Math.sqrt(b.bulk) + 0.004);
      b.sbox(ZT.LEATHER, r.hips, 0.06, 0.1, 0.07, 0x221c1a, -0.17 * b.bulk, -0.01, 0); // holster
      b.sbox(ZT.FLAT, sp, 0.05, 0.06, 0.012, 0xd4af37, 0.09 * b.bulk, 0.34, fz + 0.004, 0, 0, 0, 0.35); // badge
      b.sbox(ZT.LEATHER, sp, 0.05, 0.08, 0.04, 0x161618, -0.12 * b.bulk, 0.42, fz - 0.01); // radio
      if (rng.chance(0.6)) {
        b.look.hat = navy;
        b.box(head, 0.245 * hs, 0.07 * hs, 0.255 * hs, navy, 0, top + 0.025 * hs, 0);
        b.sbox(ZT.LEATHER, head, 0.23 * hs, 0.018, 0.1 * hs, 0x141416, 0, top - 0.005, 0.15 * hs, 0.15, 0, 0);
        b.sbox(ZT.FLAT, head, 0.04 * hs, 0.035 * hs, 0.01, 0xd4af37, 0, top + 0.03 * hs, 0.128 * hs + 0.006, 0, 0, 0, 0.35);
      }
      return navy;
    }
    case 'nurse': {
      const scrubs = rng.pick([0x6fb8ac, 0xd48aac, 0x6a8fd0]);
      wear(b, 'nurse', { shirt: scrubs, sleeves: 'short', pants: scrubs, pantsPat: 'cloth', shoes: 0xd8d8d8 });
      b.clothes({ shirt: scrubs, sleeves: 'short', pants: scrubs, shoes: 0xd8d8d8 });
      b.sbox(ZT.FLAT, sp, 0.04, 0.055, 0.012, 0xf0f0f0, 0.08 * b.bulk, 0.3, fz + 0.004, 0, 0, 0, 0.1); // ID card
      b.sbox(ZT.FLAT, sp, 0.012, 0.12, 0.012, 0x2a5aa0, 0.06 * b.bulk, 0.38, fz + 0.004, 0, 0, 0.35);
      if (rng.chance(0.6)) {
        b.look.bun = true;
        if (b.look.hair === null) b.look.hair = 0x4a2a14;
        b.sbox(ZT.HAIR, head, 0.1 * hs, 0.1 * hs, 0.08 * hs, 0x4a2a14, 0, 0.22 * hs, -0.14 * hs); // bun
      }
      return scrubs;
    }
    case 'doctor': {
      const coat = 0xe2e2da;
      const trousers = rng.pick([0x3a3f4a, 0x2a2a30]);
      b.clothes({ shirt: coat, sleeves: 'long', pants: trousers, shoes: 0x1c1c1c });
      const inner = rng.pick([0x9ab8d8, 0xd8d0b8]);
      const tie = rng.pick([0x8a1a1a, 0x1a2a5a, 0x2a4a2a]);
      wear(b, 'doctor', { shirt: coat, sleeves: 'long', pants: trousers, pantsPat: 'cloth', shoes: 0x1c1c1c, inner, tie });
      b.box(sp, 0.1, 0.36, 0.012, inner, 0, 0.28, fz + 0.004); // shirt
      b.box(sp, 0.035, 0.26, 0.014, tie, 0, 0.26, fz + 0.008); // tie
      b.sbox(ZT.LEATHER, sp, 0.13, 0.016, 0.03, 0x404448, 0, 0.45, fz - 0.005, -0.3); // stethoscope
      b.sbox(ZT.LEATHER, sp, 0.016, 0.14, 0.016, 0x404448, 0.06, 0.37, fz + 0.004);
      // Coat tails hanging over the hips (front + back panels).
      const sb = Math.sqrt(b.bulk);
      b.box(r.hips, 0.4 * b.bulk, 0.34, 0.03, coat, 0, -0.14, 0.11 * sb + 0.01, 0, 0, 0, 0, 'torso');
      b.box(r.hips, 0.4 * b.bulk, 0.34, 0.03, coat, 0, -0.14, -0.11 * sb - 0.01, 0, 0, 0, 0, 'torso');
      return coat;
    }
    case 'worker': {
      const shirt = rng.pick([0x5a6a7a, 0x6a4a3a, 0x3a4a5a]);
      const sleeves = rng.chance(0.5) ? 'long' : 'short';
      b.clothes({ shirt, sleeves, pants: 0x34404f, shoes: 0x4a3018 });
      const vest = rng.pick([0xc8f020, 0xff7a1a]);
      wear(b, 'worker', { shirt, sleeves, pants: 0x34404f, pantsPat: 'denim', shoes: 0x4a3018, vest, belt: 0x3a2a1a });
      const sb = Math.sqrt(b.bulk);
      b.box(sp, w + 0.025, 0.36, 0.22 * sb + 0.025, vest, 0, 0.27, 0, 0, 0, 0, 0.32);
      for (const y of [0.18, 0.3]) {
        b.sbox(ZT.FLAT, sp, w + 0.03, 0.03, 0.22 * sb + 0.03, 0xd8d8d8, 0, y, 0, 0, 0, 0, 0.55);
      }
      if (rng.chance(0.75)) {
        const hat = rng.pick([0xf0c020, 0xf2f2f2, 0xe06a10]);
        b.look.hat = hat;
        b.part(head, Kit.cyl(0.13 * hs, 0.145 * hs, 0.1 * hs, 8), hat, 0, top + 0.03 * hs, 0, 0, 0, 0, 1, 1, 1.05, 0.12).userData.t = ZT.BONE;
        b.sbox(ZT.BONE, head, 0.3 * hs, 0.018, 0.32 * hs, hat, 0, top - 0.015 * hs, 0.02, 0, 0, 0, 0.12);
      }
      return shirt;
    }
    case 'office': {
      const shirt = rng.pick([0xe4e4e0, 0xb8cce0, 0xd8d0c0]);
      const jacket = rng.chance(0.4);
      const suit = rng.pick([0x2a2a30, 0x2a3348, 0x3a3a3a]);
      b.clothes({ shirt: jacket ? suit : shirt, sleeves: 'long', sleeveColor: jacket ? suit : shirt, pants: suit, shoes: 0x111111 });
      if (jacket) b.box(sp, 0.12, 0.3, 0.012, shirt, 0, 0.31, fz + 0.004);
      const tie = rng.pick([0x8a1a1a, 0x1a2a5a, 0x2a4a2a, 0x5a1a4a]);
      wear(b, 'office', { shirt, sleeves: 'long', pants: suit, pantsPat: 'cloth', shoes: 0x111111, tie, jacket: jacket ? suit : null, inner: jacket ? shirt : null, belt: 0x1a1412 });
      b.box(sp, 0.04, 0.3, 0.014, tie, rng.spread(0.015), 0.27, fz + 0.008, 0, 0, rng.spread(0.12));
      b.box(sp, 0.055, 0.04, 0.02, tie, 0, 0.43, fz + 0.008);
      return jacket ? suit : shirt;
    }
    case 'patient': {
      const gown = rng.pick([0xa8c8d0, 0xc0d4b8, 0xb8c0d8]);
      wear(b, 'patient', { shirt: gown, shirtPat: 'gown', sleeves: 'short', pants: gown, pantsPat: 'gown', bareLegs: true, shoes: b.skin, bellyWound: 0.4 });
      b.clothes({ shirt: gown, sleeves: 'short', pants: gown, thighs: 'skin', shins: 'skin', shoes: b.skin }, ZT.GOWN);
      const sb = Math.sqrt(b.bulk);
      // Gown skirt over the hips.
      b.sbox(ZT.GOWN, r.hips, 0.4 * b.bulk, 0.3, 0.025, gown, 0, -0.12, 0.105 * sb + 0.01, 0, 0, 0, 0, 'torso');
      b.sbox(ZT.GOWN, r.hips, 0.4 * b.bulk, 0.3, 0.025, gown, 0, -0.12, -0.105 * sb - 0.01, 0, 0, 0, 0, 'torso');
      b.sbox(ZT.GOWN, r.hips, 0.025, 0.3, 0.2 * sb, gown, 0.2 * b.bulk, -0.12, 0, 0, 0, 0, 0, 'torso');
      b.sbox(ZT.GOWN, r.hips, 0.025, 0.3, 0.2 * sb, gown, -0.2 * b.bulk, -0.12, 0, 0, 0, 0, 0, 'torso');
      b.sbox(ZT.FLAT, r.armL.elbow, 0.096, 0.03, 0.106, 0xf0f0f0, 0, -0.22 * b.al, 0); // wristband
      if (rng.chance(0.5)) {
        b.look.hat = 0xe8e8e0;
        b.box(head, 0.235 * hs, 0.05 * hs, 0.25 * hs, 0xe8e8e0, 0, 0.22 * hs, 0.002, 0, 0, 0.12, 0.15); // bandage
      }
      // Bloody gown stains.
      b.box(sp, 0.14, 0.12, 0.012, BLOOD, rng.pick([-0.08, 0.06]), 0.12, fz + 0.004);
      return gown;
    }
    case 'soldier': {
      const camo = rng.pick([0x56683a, 0x857852]);
      b.clothes({ shirt: camo, sleeves: 'long', pants: camo, shoes: 0x2e2418 }, ZT.CAMO);
      const sb = Math.sqrt(b.bulk);
      const vest = camo === 0x56683a ? 0x3c4629 : 0x665c3e;
      wear(b, 'soldier', { shirt: camo, shirtPat: 'camo', sleeves: 'long', pants: camo, pantsPat: 'camo', shoes: 0x2e2418, vest, belt: 0x2a2418, hat: camo === 0x56683a ? 0x48553a : 0x726848 });
      b.box(sp, w + 0.04, 0.3, 0.22 * sb + 0.05, vest, 0, 0.29, 0);
      b.box(sp, 0.08, 0.08, 0.04, vest, -0.08, 0.2, 0.11 * sb + 0.04);
      b.box(sp, 0.08, 0.08, 0.04, vest, 0.08, 0.2, 0.11 * sb + 0.04);
      // Helmet — armour: shots to the top of the head spark off.
      const helm = camo === 0x56683a ? 0x48553a : 0x726848;
      b.box(head, 0.27 * hs, 0.1 * hs, 0.29 * hs, helm, 0, top + 0.02 * hs, -0.005, 0, 0, 0, 0, 'armor');
      b.box(head, 0.3 * hs, 0.03 * hs, 0.32 * hs, helm, 0, top - 0.03 * hs, -0.01, 0, 0, 0, 0, 'armor');
      return camo;
    }
    case 'biker': {
      const tee = rng.pick([0x8a8a8a, 0xd0ccc0, 0x7a2a2a]);
      const leather = 0x2c2624;
      wear(b, 'biker', { shirt: leather, shirtPat: 'leather', sleeves: 'long', pants: 0x2e3a52, pantsPat: 'denim', shoes: 0x181616, inner: tee, jacket: leather });
      b.clothes({ shirt: leather, sleeves: 'long', pants: 0x2e3a52, shoes: 0x181616 }, ZT.LEATHER);
      // Jeans are cloth, not leather.
      for (const m of [b.pelvis, r.legL.thigh, r.legR.thigh, r.legL.shin, r.legR.shin]) m.userData.t = ZT.CLOTH;
      b.box(sp, 0.12, 0.42, 0.012, tee, 0, 0.23, fz + 0.004); // open jacket
      b.sbox(ZT.LEATHER, sp, 0.04, 0.42, 0.016, 0x3a3432, 0.08, 0.23, fz + 0.006);
      b.sbox(ZT.LEATHER, sp, 0.04, 0.42, 0.016, 0x3a3432, -0.08, 0.23, fz + 0.006);
      if (rng.chance(0.6)) {
        b.look.beard = 0x3a2a1a;
        b.sbox(ZT.HAIR, head, 0.2 * hs, 0.08 * hs, 0.04, 0x3a2a1a, 0, 0.05 * hs, b.faceZ - 0.006); // beard
      }
      if (rng.chance(0.35)) {
        const band = rng.pick([0x8a1a1a, 0x1c1c22]);
        b.look.hat = band;
        b.box(head, 0.24 * hs, 0.06 * hs, 0.26 * hs, band, 0, top - 0.005, 0, 0, 0, 0, 0.05);
      }
      return leather;
    }
    case 'civilian':
    default: {
      const shirt = rng.pick(CASUAL_SHIRTS);
      const sleeve = rng.next();
      const sleeves = sleeve < 0.2 ? 'none' : sleeve < 0.65 ? 'short' : 'long';
      const pants = rng.pick(CASUAL_PANTS);
      const shoes = rng.pick(SHOES);
      wear(b, 'casual', { shirt, sleeves, pants, pantsPat: 'denim', shoes });
      b.clothes({ shirt, sleeves, pants, shoes });
      return shirt;
    }
  }
}

/** Hair colour for a variant (null = bald / covered). */
export function hairFor(variant: string, rng: Rng): number | null {
  if (variant === 'soldier') return 0x1a1a1a;
  if (variant === 'biker') return rng.chance(0.5) ? null : 0x2a1a10;
  return rng.chance(0.82) ? rng.pick(HAIR) : null;
}

/** Long hair for some civilians/nurses/patients. */
export function maybeLongHair(b: ZBody, variant: string, hair: number | null, rng: Rng) {
  if (hair === null) return;
  if (variant === 'civilian' || variant === 'nurse' || variant === 'patient' || variant === 'office') {
    if (rng.chance(0.3)) longHair(b, hair);
  }
}

// ─── Joint positions ───────────────────────────────────────────────────────

/**
 * World position of a foot sole. (The bake merges the foot mesh into the shin,
 * so `LegLimb.foot` is no longer in the scene — measure from the knee.)
 */
export function footWorld(l: LegLimb, out: THREE.Vector3): THREE.Vector3 {
  l.knee.updateWorldMatrix(true, false);
  return l.knee.localToWorld(out.set(0, -0.44, 0.05));
}

// ─── Poses ──────────────────────────────────────────────────────────────────

/** Reset every joint to neutral (call at the start of each frame's pose). */
export function restPose(r: HumanoidRig, hipsY = 0.95) {
  r.root.position.set(0, 0, 0);
  r.root.rotation.set(0, 0, 0);
  r.hips.position.y = hipsY;
  r.hips.rotation.set(0, 0, 0);
  r.spine.rotation.set(0, 0, 0);
  r.chest.rotation.set(0, 0, 0);
  r.neck.rotation.set(0, 0, 0);
  r.head.rotation.set(0, 0, 0);
  resetArm(r.armL, 1);
  resetArm(r.armR, -1);
  resetLeg(r.legL);
  resetLeg(r.legR);
}

function resetArm(a: Limb, side: number) {
  a.shoulder.rotation.set(0, 0, side * 0.08);
  a.elbow.rotation.set(0, 0, 0);
}

function resetLeg(l: LegLimb) {
  l.hip.rotation.set(0, 0, 0);
  l.knee.rotation.set(0, 0, 0);
}

/**
 * Shambling walk with a limp. `limp` −1..1 picks the dragging leg (sign) and
 * how badly it drags. Returns the hip height drop (already applied).
 */
export function poseShamble(r: HumanoidRig, phase: number, amount: number, stride: number, limp: number, hipsY = 0.95) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const sl = stride * amount * (limp > 0 ? 1 - limp * 0.65 : 1);
  const sr = stride * amount * (limp < 0 ? 1 + limp * 0.65 : 1);
  r.legL.hip.rotation.x = s * sl;
  r.legR.hip.rotation.x = -s * sr;
  r.legL.knee.rotation.x = Math.max(0, -c) * sl * 1.4 + 0.06;
  r.legR.knee.rotation.x = Math.max(0, c) * sr * 1.4 + 0.06;
  // Dragging foot turned out.
  if (limp > 0) r.legL.hip.rotation.y = 0.25 * limp;
  else if (limp < 0) r.legR.hip.rotation.y = 0.25 * limp;
  const dip = Math.abs(c) * 0.035 * amount + (limp !== 0 ? Math.max(0, s * Math.sign(limp)) * 0.04 * Math.abs(limp) * amount : 0);
  r.hips.position.y = hipsY - dip;
  r.hips.rotation.z = s * 0.07 * amount;
  r.hips.rotation.y = s * 0.09 * amount;
}

/** Sprint cycle: big knee lift and drive. */
export function poseRun(r: HumanoidRig, phase: number, amount: number, hipsY = 0.95) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  r.legL.hip.rotation.x = s * 0.95 * amount - 0.15 * amount;
  r.legR.hip.rotation.x = -s * 0.95 * amount - 0.15 * amount;
  r.legL.knee.rotation.x = (0.25 + Math.max(0, -c) * 1.5) * amount;
  r.legR.knee.rotation.x = (0.25 + Math.max(0, c) * 1.5) * amount;
  r.hips.position.y = hipsY - 0.08 * amount + Math.abs(s) * 0.05 * amount;
  r.hips.rotation.y = s * 0.12 * amount;
}

/**
 * Crouch both legs by `c` (0 = standing, 1 = deep squat) keeping the feet on
 * the ground. Sets hip/knee rotations and hips height.
 */
export function poseCrouch(r: HumanoidRig, c: number, hipsY = 0.95) {
  const a = 1.0 * c; // thigh forward
  const k = 1.9 * c; // knee bend
  r.legL.hip.rotation.x = -a;
  r.legR.hip.rotation.x = -a;
  r.legL.knee.rotation.x = k;
  r.legR.knee.rotation.x = k;
  const h = 0.44 * Math.cos(a) + 0.42 * Math.cos(k - a);
  r.hips.position.y = hipsY - (0.86 - h);
}
