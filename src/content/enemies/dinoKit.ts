import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { Textures, type TexName } from '../kit/Textures';
import { Enemy, ndcInPlayArea, type EnemyState } from '../../gameplay/Enemy';
import type { ShotHit } from '../../gameplay/Entity';
import type { SfxName } from '../../audio/names';
import { angleDelta, clamp, damp, lerp, TAU } from '../../core/math';

/**
 * Dinosaur model kit: painted low-poly geometry (vertex-coloured, countershaded
 * + striped, retro pixel-textured per surface), rig builders for theropods /
 * pteranodons / triceratops, and the `Dino` base class with shared behaviour
 * (airborne physics, hit flinches, lagging tails, momentum deaths, attack slots).
 *
 * All painted geometry is cached per (species, palette) and shares ONE
 * vertex-coloured skin material per species density. Every face also carries a
 * SURFACE (which of four pixel textures, its density and strength), so scales,
 * belly hide, feather quills, keratin horns/claws and clean teeth all render in
 * the same draw call — see `skinMat` / `SURF`.
 */

// ─── Geometry cache ─────────────────────────────────────────────────────────

const geoCache = new Map<string, THREE.BufferGeometry>();

/**
 * Cached custom geometry. Tracked by Kit (disposed between stages); the cache
 * entry evicts itself on dispose so the next stage rebuilds it.
 */
export function dgeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = make();
  g.userData.shared = true;
  g.addEventListener('dispose', () => {
    if (geoCache.get(key) === g) geoCache.delete(key);
  });
  Kit.track(g);
  geoCache.set(key, g);
  return g;
}

// ─── Skin surfaces & material ───────────────────────────────────────────────

/**
 * Gouraud-shaded skins (late-90s texture-mapped look) instead of flat facets.
 * Only geometry built with `Sculpt.smooth()` gets soft normals; anything else
 * keeps per-face normals and still renders faceted with this material.
 */
const SMOOTH_SKIN = true;
/**
 * Crease angle (degrees) for the roster's builders: 5+-sided limbs / bodies go
 * soft, 4-sided claws and teeth, caps and slab edges (90°) stay sharp.
 */
const SMOOTH_DEG = 80;
/** Strength of the silhouette rim glow (× albedo at grazing angles). */
const SKIN_RIM = 0.55;
/** Per-face colour jitter scale for the roster (the pixel textures carry the detail). */
const NOISE_K = 0.45;

/** Pixel textures the skin material can pick per face (index = `Surf.tex`). */
const SKIN_TEX = ['scales', 'hide', 'feathers', 'bark'] as const satisfies readonly TexName[];

/**
 * Per-face surface of the dino skin: which detail texture (index into
 * `SKIN_TEX`), its density relative to the species density (`k`, bigger =
 * finer) and how strongly it modulates the paint (`s`, 0 = clean).
 */
export interface Surf {
  readonly tex: 0 | 1 | 2 | 3;
  readonly k: number;
  readonly s: number;
}

/** Surface palette shared by the roster (and anything else built with `Sculpt`). */
export const SURF = {
  /** Default flank / limb scales. */
  scales: { tex: 0, k: 1, s: 0.5 },
  /** Bigger, bolder dorsal scutes along the back. */
  back: { tex: 0, k: 0.62, s: 0.62 },
  /** Fine wrinkled belly / throat skin. */
  belly: { tex: 1, k: 2.6, s: 0.4 },
  /** Bumpy pebbled hide (big herbivores, ptero bodies). */
  hide: { tex: 1, k: 1, s: 0.62 },
  /** Coarser, bolder hide bumps along a heavy back. */
  hideBack: { tex: 1, k: 0.7, s: 0.7 },
  /** Short fur-like pycnofibres (ptero bodies). */
  fuzz: { tex: 2, k: 2.4, s: 0.45 },
  /** Thin leathery membrane (ptero wings): fine wrinkles, softer. */
  membrane: { tex: 1, k: 2.2, s: 0.45 },
  /** Quills / crest feathers. */
  feathers: { tex: 2, k: 1.6, s: 0.6 },
  /** Keratin: horns, beaks — fibrous streaks. */
  horn: { tex: 3, k: 2.2, s: 0.42 },
  /** Bony plate (frill shields, cheek bosses). */
  bone: { tex: 1, k: 1.8, s: 0.3 },
  /** Claws: faint keratin grain. */
  claw: { tex: 3, k: 3, s: 0.3 },
  /** Mouth lining: wet, smooth. */
  mouth: { tex: 1, k: 4, s: 0.22 },
  /** Display membrane (dilo frill): bright paint with only a faint wrinkle. */
  frill: { tex: 1, k: 3, s: 0.16 },
  /** Teeth and anything that must read as clean paint. */
  clean: { tex: 0, k: 1, s: 0 },
} as const satisfies Record<string, Surf>;

/**
 * GLSL for the multi-surface projection. The geometry carries `aSurf` =
 * (texture index, density multiplier, strength, projection axis) per vertex,
 * constant over each face, so one draw call can mix scales, hide, feathers and
 * keratin. Projection is object-space planar on the face's dominant axis
 * (baked at build time — works with smooth normals), scaled by the mesh's
 * world scale so texel density stays constant in world units, like Kit.mat.
 */
const SKIN_VERT_DECL = `#include <common>
attribute vec4 aSurf;
attribute vec4 aStripe;
attribute vec4 aStripeCol;
varying vec4 vSurf;
varying vec3 vSkinPos;
varying vec4 vStripe;
varying vec4 vStripeCol;
varying vec3 vObjPos;`;
const SKIN_VERT_MAIN = `#include <begin_vertex>
vSkinPos = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
vObjPos = position;
vSurf = aSurf;
vStripe = aStripe;
vStripeCol = aStripeCol;`;
const SKIN_FRAG_DECL = `#include <common>
uniform sampler2D uSkin0;
uniform sampler2D uSkin1;
uniform sampler2D uSkin2;
uniform sampler2D uSkin3;
uniform vec4 uSkinDens;
uniform vec4 uSkinGain;
uniform float uSkinLit;
uniform float uSkinRim;
varying vec4 vSurf;
varying vec3 vSkinPos;
varying vec4 vStripe;
varying vec4 vStripeCol;
varying vec3 vObjPos;`;
const SKIN_FRAG_MAIN = `#include <color_fragment>
{
  // Painted stripes, evaluated per pixel (see StripeSpec): hard pixel edges
  // while a band spans a few pixels, fading to the average tone when too fine
  // to resolve (no shimmer on tiny / distant animals).
  float sc = (vObjPos.z + abs(vObjPos.y) * vStripe.y) * vStripe.x + abs(vObjPos.x) * vStripeCol.w + vStripe.w;
  float sfw = fwidth(sc);
  if (vStripe.z > 0.0) {
    float cov = mix(step(fract(sc), vStripe.z), vStripe.z, clamp((sfw - 0.22) * 3.0, 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * vStripeCol.rgb, cov);
  }
  vec2 suv = vSurf.w < 0.5 ? vSkinPos.zy : (vSurf.w < 1.5 ? vSkinPos.xz : vSkinPos.xy);
  suv *= vSurf.y;
  // Sample every slot (outside branches: safe implicit derivatives), then pick.
  vec3 s0 = texture2D(uSkin0, suv * uSkinDens.x).rgb * uSkinGain.x;
  vec3 s1 = texture2D(uSkin1, suv * uSkinDens.y).rgb * uSkinGain.y;
  vec3 s2 = texture2D(uSkin2, suv * uSkinDens.z).rgb * uSkinGain.z;
  vec3 s3 = texture2D(uSkin3, suv * uSkinDens.w).rgb * uSkinGain.w;
  float id = vSurf.x;
  vec3 st = id < 0.5 ? s0 : (id < 1.5 ? s1 : (id < 2.5 ? s2 : s3));
  diffuseColor.rgb *= mix(vec3(1.0), st, vSurf.z);
}`;
// Albedo-proportional glow (uSkinLit) + a soft silhouette rim so creatures pop
// off dark foliage / night skies through the arcade monitor pass.
const SKIN_EMIT = `#include <emissivemap_fragment>
{
  float rim = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * (uSkinLit + uSkinRim * rim * rim * rim);
}`;

const skinCache = new Map<string, THREE.MeshLambertMaterial>();

/** Builds one skin material instance (uncached, untracked). */
function buildSkin(density: number, lit: number, rim: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: !SMOOTH_SKIN });
  // Marks the material as textured: Kit.applyTexture() leaves it alone.
  m.userData.retroTex = 'scales';
  const t = SKIN_TEX.map((n) => Textures.get(n));
  const uniforms = {
    uSkin0: { value: t[0].texture },
    uSkin1: { value: t[1].texture },
    uSkin2: { value: t[2].texture },
    uSkin3: { value: t[3].texture },
    uSkinDens: { value: new THREE.Vector4(t[0].density * density, t[1].density * density, t[2].density * density, t[3].density * density) },
    uSkinGain: { value: new THREE.Vector4(t[0].gain, t[1].gain, t[2].gain, t[3].gain) },
    uSkinLit: { value: lit },
    uSkinRim: { value: rim },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', SKIN_VERT_DECL).replace('#include <begin_vertex>', SKIN_VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', SKIN_FRAG_DECL)
      .replace('#include <color_fragment>', SKIN_FRAG_MAIN)
      .replace('#include <emissivemap_fragment>', SKIN_EMIT);
  };
  // One program for every dino skin: density / glow are uniforms.
  m.customProgramCacheKey = () => 'dinoSkin2';
  return m;
}

function makeSkin(density: number, lit: number, rim = SKIN_RIM): THREE.MeshLambertMaterial {
  const key = `${density}|${lit}|${rim}`;
  const hit = skinCache.get(key);
  if (hit) return hit;
  const m = buildSkin(density, lit, rim);
  m.userData.shared = true;
  m.addEventListener('dispose', () => {
    if (skinCache.get(key) === m) skinCache.delete(key);
  });
  skinCache.set(key, m);
  return Kit.track(m);
}

/**
 * Shared vertex-coloured, pixel-textured skin material (see `SURF`). `density`
 * sets the texture scale per species (bigger = finer); per-face surfaces
 * multiply it. Cached per density, tracked by Kit, evicted on dispose.
 */
export const skinMat = (density = 1): THREE.MeshLambertMaterial => makeSkin(density, 0);

/**
 * `skinMat` that never goes fully black: it also emits `k` × its own (painted,
 * textured) albedo. Undersides seen from below against a dark sky — pteros in
 * the night storm — keep their paint pattern and silhouette instead of taking
 * the hemisphere light's dark ground colour. Cached per (density, k).
 */
export function selfLitSkin(density: number, k: number, rim = SKIN_RIM): THREE.MeshLambertMaterial {
  return makeSkin(density, k, rim);
}

/**
 * A private, Kit-tracked instance of the skin material for effects that animate
 * the material itself (colour / opacity, e.g. a cloak shimmer) while keeping
 * per-pixel stripes and surface textures. Safe to mutate; never shared.
 */
export function ownSkinMat(density = 1, lit = 0, rim = SKIN_RIM): THREE.MeshLambertMaterial {
  return Kit.track(buildSkin(density, lit, rim));
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Transform matrix (build time only). Rotation order XYZ. */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_t.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

/** Deterministic hash in [0, 1) (build-time texture noise; not gameplay randomness). */
export function hash3(x: number, y: number, z: number, s = 0): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453;
  return h - Math.floor(h);
}

// ─── Painted geometry builder ──────────────────────────────────────────────

/**
 * Stripes drawn per pixel by the skin shader (crisp bands with chunky pixel
 * edges instead of jagged per-face triangles): a face (with ny > `minNy`, if
 * given) shows `color` wherever frac((z + |y|·slant)·freq + |x|·xFreq + phase) < w,
 * in the geometry's own (Sculpt) coordinates.
 */
export interface StripeSpec {
  freq: number;
  slant: number;
  w: number;
  phase: number;
  color: number;
  minNy?: number;
  /** Bands across X (mirrored about x = 0), e.g. wing finger lines. */
  xFreq?: number;
}

type Face6 = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;
/** A painter; `stripe` (fixed, or chosen per face from centroid + normal) adds shader stripes. */
export type PaintFn = Face6 & { stripe?: StripeSpec | ((x: number, y: number, z: number, nx: number, ny: number, nz: number) => StripeSpec | null) };
export type Paint = number | PaintFn;

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Vector3();

interface SegOpts {
  sides?: number;
  rings?: number;
  /** Vertical drift of the far end (droop/rise). */
  dy?: number;
  /** Mid-length swelling (0.1 = 10 % fatter in the middle). */
  bulge?: number;
}

/**
 * Accumulates primitives into one non-indexed, per-face vertex-coloured
 * geometry. Paint functions get each face's centroid + normal in the final
 * (post-matrix) space, so `ny` is "dorsal-ness" for parts built upright.
 *
 * Every face also records a `Surf` (pixel texture for `skinMat`): the current
 * one set with `as()`, unless its painted colour is listed in `keyed()` (e.g.
 * palette claw → keratin, teeth → clean). `smooth()` gives each primitive soft
 * (Gouraud) normals across shallow edges while creases stay sharp.
 */
export class Sculpt {
  private pos: number[] = [];
  private col: number[] = [];
  private nrm: number[] = [];
  private sur: number[] = [];
  private stp: number[] = [];
  private stc: number[] = [];
  private cur: Surf = SURF.scales;
  private keys: Map<number, Surf> | null = null;
  /** cos of the crease angle: neighbouring faces closer than this are smoothed (2 = flat). */
  private smoothCos = 2;
  private noiseK = 1;

  constructor(
    private noise = 0.07,
    private seed = 1,
  ) {}

  /** Surface for subsequently added primitives. */
  as(s: Surf): this {
    this.cur = s;
    return this;
  }

  /** Per-colour surface overrides (exact painted colour → surface). */
  keyed(keys: Map<number, Surf> | null): this {
    this.keys = keys;
    return this;
  }

  /**
   * Soft normals within each primitive across edges sharper than `deg` degrees
   * stay creased (crease-angle smoothing); `noiseK` scales the per-face colour
   * jitter (textures carry the detail now, so painted facets can be calmer).
   */
  smooth(deg: number, noiseK = 1): this {
    this.smoothCos = deg > 0 ? Math.cos((deg * Math.PI) / 180) : 2;
    this.noiseK = noiseK;
    return this;
  }

  add(src: THREE.BufferGeometry, paint: Paint, m?: THREE.Matrix4, noise = this.noise): this {
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (m) g.applyMatrix4(m);
    // Mirroring matrices flip the winding; swap two vertices to keep faces outward.
    const flip = !!m && m.determinant() < 0;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const start = this.pos.length;
    const smooth = this.smoothCos <= 1;
    // Corner key → flat list of (area-weighted) face normals meeting there.
    const acc = smooth ? new Map<string, number[]>() : null;
    const vkey = (v: THREE.Vector3) => `${Math.round(v.x * 2e4)},${Math.round(v.y * 2e4)},${Math.round(v.z * 2e4)}`;
    noise *= this.noiseK;
    for (let i = 0; i + 2 < p.count; i += 3) {
      _pa.fromBufferAttribute(p, i);
      _pb.fromBufferAttribute(p, flip ? i + 2 : i + 1);
      _pc.fromBufferAttribute(p, flip ? i + 1 : i + 2);
      _n.subVectors(_pb, _pa).cross(_m.subVectors(_pc, _pa));
      const area2 = _n.length();
      if (area2 * area2 < 1e-14) continue; // degenerate (cone apex / zero-radius caps)
      _n.divideScalar(area2);
      const cx = (_pa.x + _pb.x + _pc.x) / 3;
      const cy = (_pa.y + _pb.y + _pc.y) / 3;
      const cz = (_pa.z + _pb.z + _pc.z) / 3;
      const hex = typeof paint === 'number' ? paint : paint(cx, cy, cz, _n.x, _n.y, _n.z);
      _c.setHex(hex);
      const k = 1 + (hash3(cx * 3.1, cy * 3.1, cz * 3.1, this.seed) - 0.5) * 2 * noise;
      const sp = typeof paint === 'number' ? undefined : paint.stripe;
      const st = typeof sp === 'function' ? sp(cx, cy, cz, _n.x, _n.y, _n.z) : sp;
      const striped = !!st && st.w > 0 && (st.minNy === undefined || _n.y > st.minNy);
      if (striped) _c2.setHex(st.color).multiplyScalar(k);
      const s = this.keys?.get(hex) ?? this.cur;
      // Dominant axis of the face normal picks the texture projection plane.
      const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
      const axis = ax > ay && ax > az ? 0 : ay > az ? 1 : 2;
      for (const v of [_pa, _pb, _pc]) {
        this.pos.push(v.x, v.y, v.z);
        this.col.push(_c.r * k, _c.g * k, _c.b * k);
        this.nrm.push(_n.x, _n.y, _n.z);
        this.sur.push(s.tex, s.k, s.s, axis);
        if (striped) {
          this.stp.push(st.freq, st.slant, st.w, st.phase);
          this.stc.push(_c2.r, _c2.g, _c2.b, st.xFreq ?? 0);
        } else {
          this.stp.push(0, 0, 0, 0);
          this.stc.push(0, 0, 0, 0);
        }
        if (acc) {
          const key = vkey(v);
          const a = acc.get(key);
          if (a) a.push(_n.x, _n.y, _n.z, area2);
          else acc.set(key, [_n.x, _n.y, _n.z, area2]);
        }
      }
    }
    if (acc) {
      // Crease-angle smoothing: each corner averages only the faces within the
      // crease angle of its own face, so caps / slab edges / 4-sided claws stay sharp
      // without pulling the soft sides next to them out of shape.
      const P = this.pos;
      const N = this.nrm;
      const c = this.smoothCos;
      for (let i = start; i < P.length; i += 3) {
        const a = acc.get(vkey(_pa.set(P[i], P[i + 1], P[i + 2])))!;
        const fx = N[i], fy = N[i + 1], fz = N[i + 2];
        let sx = 0, sy = 0, sz = 0;
        for (let j = 0; j < a.length; j += 4) {
          if (a[j] * fx + a[j + 1] * fy + a[j + 2] * fz < c) continue;
          sx += a[j] * a[j + 3];
          sy += a[j + 1] * a[j + 3];
          sz += a[j + 2] * a[j + 3];
        }
        const l = Math.hypot(sx, sy, sz);
        if (l < 1e-12) continue;
        N[i] = sx / l;
        N[i + 1] = sy / l;
        N[i + 2] = sz / l;
      }
    }
    g.dispose();
    return this;
  }

  /** Elliptic frustum along +Z from 0 to `len`; r0/r1 = [half-width, half-height]. Ridge on top. */
  seg(len: number, r0: readonly [number, number], r1: readonly [number, number], paint: Paint, m?: THREE.Matrix4, o: SegOpts = {}): this {
    const g = new THREE.CylinderGeometry(1, 1, 1, o.sides ?? 6, o.rings ?? 1, false);
    const p = g.attributes.position as THREE.BufferAttribute;
    const bulge = o.bulge ?? 0;
    const dy = o.dy ?? 0;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5;
      const b = 1 + bulge * Math.sin(Math.PI * t);
      const rx = lerp(r0[0], r1[0], t) * b;
      const ry = lerp(r0[1], r1[1], t) * b;
      p.setXYZ(i, p.getX(i) * rx, -p.getZ(i) * ry + dy * t * t, t * len);
    }
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  /** Ellipsoid. */
  blob(rx: number, ry: number, rz: number, paint: Paint, m?: THREE.Matrix4, ws = 8, hs = 6): this {
    const g = new THREE.SphereGeometry(1, ws, hs);
    g.scale(rx, ry, rz);
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  /** Cone with its base at y = 0 and tip at y = h (orient with `m`). */
  cone(r: number, h: number, paint: Paint, m?: THREE.Matrix4, seg = 5): this {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.translate(0, h / 2, 0);
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  box(w: number, h: number, d: number, paint: Paint, m?: THREE.Matrix4): this {
    const g = new THREE.BoxGeometry(w, h, d);
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  /**
   * Thin plate from a polar grid in the XY plane facing +Z (front) and -Z (back):
   * angles a0→a1 (radians, 0 = +X, π/2 = +Y), `rings` radii (fractions of R),
   * `rim(i)` multiplies the outer radius per spoke (scallops). Thickness `th`.
   */
  fan(R: number, a0: number, a1: number, spokes: number, rings: number[], rim: (i: number) => number, th: number, paint: Paint, m?: THREE.Matrix4): this {
    const pos: number[] = [];
    const pt = (ri: number, si: number, z: number): [number, number, number] => {
      const a = a0 + ((a1 - a0) * si) / spokes;
      const rr = ri < 0 ? 0 : rings[ri] * R * (ri === rings.length - 1 ? rim(si) : 1 + (rim(si) - 1) * rings[ri]);
      return [Math.cos(a) * rr, Math.sin(a) * rr, z];
    };
    const tri = (a: number[], b: number[], c: number[], wantZ: number) => {
      // Orient so the normal's z sign matches wantZ.
      const ux = b[0] - a[0], uy = b[1] - a[1];
      const vx = c[0] - a[0], vy = c[1] - a[1];
      const nz = ux * vy - uy * vx;
      if (nz * wantZ >= 0) pos.push(...a, ...b, ...c);
      else pos.push(...a, ...c, ...b);
    };
    for (const side of [1, -1]) {
      const z = (side * th) / 2;
      for (let si = 0; si < spokes; si++) {
        for (let ri = -1; ri < rings.length - 1; ri++) {
          const a = pt(ri, si, z), b = pt(ri + 1, si, z), c = pt(ri + 1, si + 1, z), d = pt(ri, si + 1, z);
          if (ri < 0) tri(a, b, c, side);
          else {
            tri(a, b, c, side);
            tri(a, c, d, side);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  /**
   * Flat polygon (convex, points in XZ) extruded in Y: top faces +Y, bottom -Y,
   * with per-vertex thickness (airfoil wings, crests).
   */
  slab(pts: readonly (readonly [number, number])[], thick: readonly number[], paint: Paint, m?: THREE.Matrix4): this {
    const pos: number[] = [];
    const n = pts.length;
    let cx = 0, cz = 0;
    for (const p of pts) {
      cx += p[0] / n;
      cz += p[1] / n;
    }
    const top = (i: number) => [pts[i][0], thick[i] / 2, pts[i][1]];
    const bot = (i: number) => [pts[i][0], -thick[i] / 2, pts[i][1]];
    const orient = (a: number[], b: number[], c: number[], hx: number, hy: number, hz: number) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * hx + ny * hy + nz * hz >= 0) pos.push(...a, ...b, ...c);
      else pos.push(...a, ...c, ...b);
    };
    for (let i = 1; i < n - 1; i++) {
      orient(top(0), top(i), top(i + 1), 0, 1, 0);
      orient(bot(0), bot(i), bot(i + 1), 0, -1, 0);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const hx = (pts[i][0] + pts[j][0]) / 2 - cx;
      const hz = (pts[i][1] + pts[j][1]) / 2 - cz;
      orient(top(i), bot(i), bot(j), hx, 0, hz);
      orient(top(i), bot(j), top(j), hx, 0, hz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.add(g, paint, m);
    g.dispose();
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.sur, 4));
    g.setAttribute('aStripe', new THREE.Float32BufferAttribute(this.stp, 4));
    g.setAttribute('aStripeCol', new THREE.Float32BufferAttribute(this.stc, 4));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ─── Palettes & painters ───────────────────────────────────────────────────

export interface Palette {
  key: string;
  base: number;
  back: number;
  belly: number;
  stripe: number;
  /** Crest / frill / quill colour. */
  accent: number;
  accent2: number;
  claw: number;
  teeth: number;
  mouth: number;
  eye: number;
}

/**
 * Countershaded skin: dark back, pale belly, optional slanted stripes across
 * the body (stripes per metre along Z) and dapple spots.
 */
export function skin(p: Palette, stripes = 0, o: { w?: number; slant?: number; phase?: number; spots?: number; belly?: number } = {}): PaintFn {
  const w = o.w ?? 0.3;
  const slant = o.slant ?? 0.6;
  const bellyY = o.belly ?? -0.42;
  const fn: PaintFn = (x, y, z, _nx, ny) => {
    let col = p.base;
    if (ny < bellyY) col = p.belly;
    else if (ny > 0.62) col = p.back;
    // Stripes: per pixel in the skin shader (see StripeSpec).
    if (o.spots && ny > -0.25 && hash3(x * 9, y * 9, z * 9, 3) < o.spots) col = p.stripe;
    return col;
  };
  if (stripes > 0) fn.stripe = { freq: stripes, slant, w, phase: o.phase ?? 0, color: p.stripe, minNy: -0.3 };
  return fn;
}

/** Limb paint: base with a darker front and scaly noise. */
export function limbPaint(p: Palette): PaintFn {
  return (_x, _y, _z, _nx, ny, nz) => (nz > 0.55 ? p.back : ny < -0.6 ? p.belly : p.base);
}

/**
 * Palette colours that get their own surface wherever they are painted:
 * dorsal scutes, wrinkled belly, keratin claws, clean teeth, wet mouth.
 * `heavy` (triceratops) swaps scales for pebbled hide and bone-white trim.
 */
export function palKeys(p: Palette, heavy = false): Map<number, Surf> {
  return new Map<number, Surf>([
    [p.back, heavy ? SURF.hideBack : SURF.back],
    [p.belly, SURF.belly],
    [p.claw, SURF.claw],
    [p.teeth, heavy ? SURF.bone : SURF.clean],
    [p.mouth, SURF.mouth],
  ]);
}

/** A `Sculpt` set up for the roster: soft normals, calm paint jitter, surfaces. */
export function dsculpt(noise: number, seed: number, keys: Map<number, Surf> | null = null, base: Surf = SURF.scales): Sculpt {
  return new Sculpt(noise, seed).smooth(SMOOTH_DEG, NOISE_K).keyed(keys).as(base);
}

// ─── Theropod rig (compy / raptor / dilo) ──────────────────────────────────

export interface TheroSpec {
  key: string;
  pal: Palette;
  hipGap: number;
  thigh: number;
  shin: number;
  meta: number;
  toe: number;
  /** Leg thickness multiplier. */
  legR: number;
  footH: number;
  hips: readonly [number, number, number];
  torso: { len: number; r0: readonly [number, number]; r1: readonly [number, number]; rise: number };
  neck: { lens: readonly number[]; r0: readonly [number, number]; r1: readonly [number, number]; rest: readonly number[] };
  headRest: number;
  skull: { len: number; r: readonly [number, number] };
  snout: { len: number; r1: readonly [number, number]; drop: number };
  jaw: { len: number; r0: readonly [number, number]; r1: readonly [number, number] };
  tail: { lens: readonly number[]; r0: readonly [number, number]; taper: number; rest: readonly number[] };
  arm: { upper: number; fore: number; r: number; claw: number };
  stripes: number;
  spots?: number;
  teeth: number;
  sickle: boolean;
  /** Quill crest size (0 = none). */
  quills: number;
  /** Dilophosaurus twin head crests. */
  crests?: boolean;
  eyeSize: number;
  /** Compsognathus-style mesh budget: merge hips+arms into torso, jaw into head, meta+foot. */
  compact?: boolean;
  /** Scale-texture density (bigger = finer scales). */
  texDensity?: number;
}

export interface TheroLeg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  toe: THREE.Group;
}

export interface TheroRig {
  pelvis: THREE.Group;
  body: THREE.Group;
  chest: THREE.Group;
  torso: THREE.Mesh;
  neck: THREE.Group[];
  head: THREE.Group;
  headMesh: THREE.Mesh;
  jaw: THREE.Group | null;
  mouth: THREE.Group;
  tail: THREE.Group[];
  legs: TheroLeg[];
  arms: { shoulder: THREE.Group; elbow: THREE.Group }[];
  hipH: number;
  /** Head height / forward offset in model space at rest. */
  headH: number;
  headFwd: number;
  meshes: { head: THREE.Mesh[]; torso: THREE.Mesh[]; limb: THREE.Mesh[]; tail: THREE.Mesh[] };
}

/** Rest joint angles for digitigrade legs (hip forward, knee back, ankle forward). */
export const LEG_REST = { hip: -0.55, knee: 1.15, ankle: -0.95 } as const;
export const ARM_REST = { shoulder: 0.35, elbow: -1.45 } as const;

export function theroLegHeight(s: TheroSpec, hip: number = LEG_REST.hip, knee: number = LEG_REST.knee, ankle: number = LEG_REST.ankle): number {
  const a1 = hip;
  const a2 = hip + knee;
  const a3 = a2 + ankle;
  return s.thigh * Math.cos(a1) + s.shin * Math.cos(a2) + s.meta * Math.cos(a3) + s.footH;
}

const lerp2 = (a: readonly [number, number], b: readonly [number, number], t: number): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

function eyesGeo(x: number, y: number, z: number, size: number): THREE.BufferGeometry {
  return dgeo(`eyes|${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}|${size}`, () =>
    new Sculpt(0)
      .box(size * 0.7, size, size * 1.5, 0xffffff, M(x, y, z, 0, 0.35, 0))
      .box(size * 0.7, size, size * 1.5, 0xffffff, M(-x, y, z, 0, -0.35, 0))
      .build(),
  );
}

/** Builds the theropod skeleton + painted meshes under `model` (facing +Z, feet at y = 0). */
export function buildTheropod(model: THREE.Group, s: TheroSpec): TheroRig {
  const mat = skinMat(s.texDensity ?? 1.6);
  const p = s.pal;
  const K = `${s.key}|${p.key}`;
  const keys = palKeys(p);
  const mk = (noise: number, seed: number) => dsculpt(noise, seed, keys);
  const meshes: TheroRig['meshes'] = { head: [], torso: [], limb: [], tail: [] };
  const hipH = theroLegHeight(s);
  const pelvis = Kit.pivot(model, 0, hipH, 0, 'pelvis');
  const body = Kit.pivot(pelvis, 0, 0, 0, 'body');
  const sk = s.skull;
  const sn = s.snout;
  const T = s.torso;

  // Arms are built pointing down from the shoulder / elbow pivots.
  const armUpper = (sc: Sculpt, m: THREE.Matrix4) => {
    const a = s.arm;
    sc.seg(a.upper + 0.02, [a.r, a.r * 1.15], [a.r * 0.8, a.r * 0.9], skin(p), m.clone().multiply(M(0, 0.02, 0, Math.PI / 2)), { sides: 5 });
  };
  const armFore = (sc: Sculpt, m: THREE.Matrix4) => {
    const a = s.arm;
    sc.seg(a.fore, [a.r * 0.8, a.r * 0.85], [a.r * 0.6, a.r * 0.6], skin(p), m.clone().multiply(M(0, 0, 0, Math.PI / 2)), { sides: 5 });
    for (let i = -1; i <= 1; i++) {
      sc.cone(a.r * 0.32, a.claw, p.claw, m.clone().multiply(M(i * a.r * 0.45, -a.fore + 0.01, a.r * 0.2, Math.PI + 0.4, 0, i * 0.15)), 4);
    }
  };

  // ── Torso ──
  const chest = Kit.pivot(body, 0, 0.02, 0.06, 'chest');
  const torsoGeo = dgeo(`${K}|torso`, () => {
    const sc = mk(0.07, 2);
    sc.seg(T.len, T.r0, T.r1, skin(p, s.stripes, { spots: s.spots }), M(0, 0, -0.02), { sides: 8, rings: 4, dy: T.rise, bulge: 0.1 });
    if (s.compact) {
      sc.blob(s.hips[0], s.hips[1], s.hips[2], skin(p, s.stripes, { phase: 0.4, spots: s.spots }), M(0, 0.01, -0.08), 8, 5);
      for (const side of [1, -1]) {
        // Folded arms merged into the torso (fixed pose).
        const sm = M(side * T.r0[0] * 0.55, -T.r1[1] * 0.3, T.len * 0.8, ARM_REST.shoulder);
        armUpper(sc, sm);
        armFore(sc, sm.clone().multiply(M(0, -s.arm.upper, 0, ARM_REST.elbow)));
      }
    }
    return sc.build();
  });
  const torso = Kit.add(chest, torsoGeo, mat);
  meshes.torso.push(torso);
  if (!s.compact) {
    const hipsGeo = dgeo(`${K}|hips`, () =>
      mk(0.07, 1).blob(s.hips[0], s.hips[1], s.hips[2], skin(p, s.stripes, { phase: 0.4, spots: s.spots }), M(0, 0.02, -0.08), 8, 6).build(),
    );
    meshes.torso.push(Kit.add(body, hipsGeo, mat));
  }

  // ── Neck ──
  const neck: THREE.Group[] = [];
  let parent: THREE.Object3D = chest;
  let nz = T.len - 0.05;
  let ny = T.rise + T.r1[1] * 0.25;
  const nN = s.neck.lens.length;
  for (let i = 0; i < nN; i++) {
    const n = Kit.pivot(parent, 0, ny, nz, 'neck' + i);
    n.rotation.order = 'YXZ';
    n.rotation.x = s.neck.rest[i];
    const r0 = lerp2(s.neck.r0, s.neck.r1, i / nN);
    const r1 = lerp2(s.neck.r0, s.neck.r1, (i + 1) / nN);
    const len = s.neck.lens[i];
    const g = dgeo(`${K}|neck${i}`, () =>
      mk(0.06, 3 + i).seg(len + 0.06, r0, r1, skin(p, 0, { spots: s.spots }), M(0, 0, -0.04), { sides: 6, rings: 2 }).build(),
    );
    meshes.torso.push(Kit.add(n, g, mat));
    neck.push(n);
    parent = n;
    nz = len;
    ny = 0;
  }

  // ── Head ──
  const head = Kit.pivot(parent, 0, 0, nz, 'head');
  head.rotation.order = 'YXZ';
  head.rotation.x = s.headRest;
  const snoutY0 = -sk.r[1] * 0.12;
  const snoutR0: [number, number] = [sk.r[0] * 0.85, sk.r[1] * 0.78];
  const snoutAt = (t: number) => ({
    z: sk.len - 0.03 + t * sn.len,
    rx: lerp(snoutR0[0], sn.r1[0], t),
    ry: lerp(snoutR0[1], sn.r1[1], t),
    y: snoutY0 - sn.drop * t * t,
  });
  const jawY = -sk.r[1] * 0.55;
  const jawZ = -0.02;
  const headPaint: PaintFn = (x, y, z, nx, nyy) => {
    if (nyy < -0.5) return p.belly;
    // Dark mask band through the eyes, lighter lips.
    if (Math.abs(nx) > 0.5 && z > sk.len * 0.1 && z < sk.len * 0.9 && y > -0.01) return p.stripe;
    if (nyy > 0.6) return p.back;
    return z > sk.len + sn.len * 0.55 && y < snoutY0 ? p.belly : p.base;
  };
  const buildJaw = (sc: Sculpt, m: THREE.Matrix4) => {
    const J = s.jaw;
    sc.seg(J.len, J.r0, J.r1, (_x, _y, _z, _nx, nyy) => (nyy > 0.7 ? p.mouth : nyy < -0.3 ? p.belly : p.base), m.clone().multiply(M(0, 0, jawZ - 0.02)), { sides: 6 });
    sc.box(J.r0[0] * 0.9, 0.012, J.len * 0.7, p.mouth, m.clone().multiply(M(0, J.r0[1] * 0.6, J.len * 0.4)));
    for (let i = 0; i < s.teeth; i++) {
      const t = 0.18 + (0.78 * i) / Math.max(1, s.teeth - 1);
      const rx = lerp(J.r0[0], J.r1[0], t);
      const ry = lerp(J.r0[1], J.r1[1], t);
      const h = 0.03 + 0.012 * Math.sin(i * 2.3);
      for (const side of [1, -1]) sc.cone(0.009, h * (s.key === 'compy' ? 0.5 : 1), p.teeth, m.clone().multiply(M(side * rx * 0.72, ry * 0.55, jawZ + t * J.len, 0.15, 0, 0)), 4);
    }
  };
  const headGeo = dgeo(`${K}|head`, () => {
    const sc = mk(0.05, 7);
    sc.seg(sk.len + 0.08, [sk.r[0] * 0.92, sk.r[1] * 0.9], sk.r, headPaint, M(0, 0.01, -0.08), { sides: 6, rings: 2, bulge: 0.1 });
    sc.seg(sn.len, snoutR0, sn.r1, headPaint, M(0, snoutY0, sk.len - 0.03), { sides: 6, rings: 2, dy: -sn.drop });
    // Palate (visible when the jaw opens).
    sc.box(snoutR0[0] * 1.1, 0.014, sn.len * 0.85, p.mouth, M(0, snoutY0 - snoutR0[1] * 0.62, sk.len + sn.len * 0.35));
    // Brow ridges + nostrils.
    for (const side of [1, -1]) {
      sc.box(sk.r[0] * 0.5, sk.r[1] * 0.28, sk.len * 0.62, p.back, M(side * sk.r[0] * 0.62, sk.r[1] * 0.8, sk.len * 0.45, 0.1, 0, side * 0.35));
      const tip = snoutAt(0.88);
      sc.box(0.012, 0.012, 0.02, p.mouth, M(side * tip.rx * 0.55, tip.y + tip.ry * 0.5, tip.z));
    }
    // Upper teeth along the lip line.
    for (let i = 0; i < s.teeth; i++) {
      const t = 0.12 + (0.84 * i) / Math.max(1, s.teeth - 1);
      const a = snoutAt(t);
      const h = (0.034 + 0.016 * Math.sin(i * 1.7 + 1)) * (s.key === 'compy' ? 0.5 : 1);
      for (const side of [1, -1]) sc.cone(0.01, h, p.teeth, M(side * a.rx * 0.78, a.y - a.ry * 0.55, a.z, Math.PI - 0.1, 0, 0), 4);
    }
    if (s.quills > 0) {
      const q = s.quills;
      sc.as(SURF.feathers);
      for (let i = 0; i < 6; i++) {
        const z = sk.len * 0.55 - i * 0.055 * q;
        const len = 0.1 * q * (1 - i * 0.1);
        for (const side of [1, -1]) {
          sc.cone(0.018 * q, len, i % 2 ? p.accent2 : p.accent, M(side * sk.r[0] * 0.35, sk.r[1] * 0.75, z, -1.05 - i * 0.08, 0, side * 0.35), 4);
        }
      }
      sc.as(SURF.scales);
    }
    if (s.crests) {
      // Two thin half-moon crests running along the skull (Dilophosaurus).
      sc.as(SURF.bone);
      for (const side of [1, -1]) {
        sc.add(
          new THREE.CylinderGeometry(1, 1, 1, 12),
          (_x, y) => (y > sk.r[1] + 0.08 ? p.accent : p.accent2),
          M(side * 0.028, sk.r[1] * 0.85, sk.len * 0.45 + sn.len * 0.2, 0, 0, Math.PI / 2, 0.11, 0.012, 0.22),
          0.03,
        );
      }
      sc.as(SURF.scales);
    }
    if (s.compact) buildJaw(sc, M(0, jawY, 0, 0.18));
    return sc.build();
  });
  const headMesh = Kit.add(head, headGeo, mat);
  meshes.head.push(headMesh);
  const eyeZ = sk.len * 0.42;
  Kit.add(head, eyesGeo(sk.r[0] * 0.86, sk.r[1] * 0.32, eyeZ, s.eyeSize), Kit.glow(p.eye, 1.15));
  let jaw: THREE.Group | null = null;
  if (!s.compact) {
    jaw = Kit.pivot(head, 0, jawY, 0, 'jaw');
    const jawGeo = dgeo(`${K}|jaw`, () => {
      const sc = mk(0.05, 9);
      buildJaw(sc, new THREE.Matrix4());
      return sc.build();
    });
    meshes.head.push(Kit.add(jaw, jawGeo, mat));
  }
  const tipA = snoutAt(0.92);
  const mouth = Kit.pivot(head, 0, tipA.y - tipA.ry, tipA.z, 'mouth');

  // ── Tail ──
  const tail: THREE.Group[] = [];
  let tp: THREE.Object3D = body;
  let tz = -s.hips[2] * 0.72;
  let ty = 0.05;
  let tr: [number, number] = [s.tail.r0[0], s.tail.r0[1]];
  for (let i = 0; i < s.tail.lens.length; i++) {
    const seg = Kit.pivot(tp, 0, ty, tz, 'tail' + i);
    seg.rotation.x = s.tail.rest[i] ?? 0;
    const len = s.tail.lens[i];
    const last = i === s.tail.lens.length - 1;
    const r1: [number, number] = last ? [0.012, 0.014] : [tr[0] * s.tail.taper, tr[1] * s.tail.taper];
    const r0 = tr;
    const g = dgeo(`${K}|tail${i}`, () =>
      mk(0.06, 11 + i)
        .seg(len + 0.05, r0, r1, skin(p, s.stripes * 1.3, { phase: i * 0.37, spots: s.spots, w: 0.36 }), M(0, 0, 0.04, 0, Math.PI, 0), { sides: 6, rings: 3 })
        .build(),
    );
    meshes.tail.push(Kit.add(seg, g, mat));
    tail.push(seg);
    tp = seg;
    tz = -len;
    ty = 0;
    tr = r1;
  }

  // ── Legs ──
  const legs: TheroLeg[] = [];
  const L = s.legR;
  const lp = limbPaint(p);
  const footGeo = (sc: Sculpt, m: THREE.Matrix4) => {
    const fh = s.footH;
    // Heel pad.
    sc.blob(0.045 * L, fh * 0.6, 0.06 * L, lp, m.clone().multiply(M(0, -fh * 0.4, 0.0)), 6, 4);
    for (const tx of [-0.022, 0.026]) {
      sc.seg(s.toe, [0.026 * L, fh * 0.42], [0.016 * L, fh * 0.3], lp, m.clone().multiply(M(tx * L, -fh * 0.55, 0, 0.05, tx * 2.2, 0)), { sides: 5 });
      sc.cone(0.012 * L, 0.045 * L, p.claw, m.clone().multiply(M(tx * L * 1.2, -fh * 0.6, s.toe + 0.005, Math.PI / 2 + 0.5, 0, 0)), 4);
    }
    // Hallux (dew claw) at the back.
    sc.cone(0.01 * L, 0.04 * L, p.claw, m.clone().multiply(M(0.03 * L, -fh * 0.2, -0.03, -Math.PI / 2 - 0.3, 0, 0)), 4);
    if (s.sickle) {
      // Raised inner toe with the big hooked killing claw.
      sc.seg(0.07, [0.02, 0.022], [0.016, 0.018], lp, m.clone().multiply(M(0.05, -fh * 0.3, 0.0, -0.9, 0.3, 0)), { sides: 5 });
      sc.cone(0.022, 0.13, p.claw, m.clone().multiply(M(0.07, 0.035, 0.055, 0.45, 0, -0.1)), 5);
    }
  };
  for (const side of [1, -1]) {
    const hip = Kit.pivot(pelvis, side * s.hipGap, -0.02, 0, 'hip');
    const thighGeo = dgeo(`${K}|thigh`, () =>
      mk(0.07, 21).seg(s.thigh + 0.08, [0.11 * L, 0.17 * L], [0.058 * L, 0.075 * L], skin(p, s.stripes * 0.8, { slant: 0, spots: s.spots }), M(0, 0.08, 0, Math.PI / 2), { sides: 6, rings: 2, bulge: 0.18 }).build(),
    );
    meshes.limb.push(Kit.add(hip, thighGeo, mat));
    const knee = Kit.pivot(hip, 0, -s.thigh, 0, 'knee');
    const shinGeo = dgeo(`${K}|shin`, () => mk(0.07, 22).seg(s.shin + 0.04, [0.068 * L, 0.09 * L], [0.04 * L, 0.048 * L], lp, M(0, 0.04, 0, Math.PI / 2), { sides: 5 }).build());
    meshes.limb.push(Kit.add(knee, shinGeo, mat));
    const ankle = Kit.pivot(knee, 0, -s.shin, 0, 'ankle');
    const toe = Kit.pivot(ankle, 0, -s.meta, 0, 'toe');
    if (s.compact) {
      const g = dgeo(`${K}|metafoot`, () => {
        const sc = mk(0.07, 23);
        sc.seg(s.meta + 0.02, [0.036 * L, 0.04 * L], [0.03 * L, 0.034 * L], lp, M(0, 0.02, 0, Math.PI / 2), { sides: 5 });
        footGeo(sc, M(0, -s.meta, 0, -(LEG_REST.hip + LEG_REST.knee + LEG_REST.ankle)));
        return sc.build();
      });
      meshes.limb.push(Kit.add(ankle, g, mat));
    } else {
      const g = dgeo(`${K}|meta`, () => mk(0.07, 23).seg(s.meta + 0.03, [0.042 * L, 0.05 * L], [0.036 * L, 0.042 * L], lp, M(0, 0.03, 0, Math.PI / 2), { sides: 5 }).build());
      meshes.limb.push(Kit.add(ankle, g, mat));
      const fg = dgeo(`${K}|foot${side}`, () => {
        const sc = mk(0.07, 24);
        // Mirror the foot for the right side so the sickle claw is always on the inside.
        footGeo(sc, side > 0 ? new THREE.Matrix4() : M(0, 0, 0, 0, 0, 0, -1, 1, 1));
        return sc.build();
      });
      meshes.limb.push(Kit.add(toe, fg, mat));
    }
    legs.push({ hip, knee, ankle, toe });
  }

  // ── Arms ──
  const arms: TheroRig['arms'] = [];
  if (!s.compact) {
    for (const side of [1, -1]) {
      const shoulder = Kit.pivot(chest, side * T.r0[0] * 0.6, -T.r1[1] * 0.25, T.len * 0.78, 'shoulder');
      shoulder.rotation.x = ARM_REST.shoulder;
      const ag = dgeo(`${K}|upperarm`, () => {
        const sc = mk(0.06, 31);
        armUpper(sc, new THREE.Matrix4());
        return sc.build();
      });
      meshes.limb.push(Kit.add(shoulder, ag, mat));
      const elbow = Kit.pivot(shoulder, 0, -s.arm.upper, 0, 'elbow');
      elbow.rotation.x = ARM_REST.elbow;
      const fg = dgeo(`${K}|forearm`, () => {
        const sc = mk(0.06, 32);
        armFore(sc, new THREE.Matrix4());
        return sc.build();
      });
      meshes.limb.push(Kit.add(elbow, fg, mat));
      arms.push({ shoulder, elbow });
    }
  }

  // Measure the head position at rest (model space).
  model.updateMatrixWorld(true);
  const hp = new THREE.Vector3();
  headMesh.localToWorld(hp.set(0, 0, sk.len * 0.5));
  model.worldToLocal(hp);
  return {
    pelvis,
    body,
    chest,
    torso,
    neck,
    head,
    headMesh,
    jaw,
    mouth,
    tail,
    legs,
    arms,
    hipH,
    headH: hp.y,
    headFwd: hp.z + sk.len * 0.5 + sn.len,
    meshes,
  };
}

/**
 * Poses one digitigrade leg. `ph` is the stride phase, `run` 0..1 the stride
 * amplitude, `crouch` 0..1, `air` 0..1 (leap pose, claws forward). Returns the
 * vertical extent hip→sole so the caller can plant the body on the stance leg.
 */
export function poseTheroLeg(s: TheroSpec, leg: TheroLeg, ph: number, run: number, crouch: number, air: number, stride = 0.55): number {
  const sn = Math.sin(ph);
  const lift = Math.max(0, Math.cos(ph)) * run;
  let hip = LEG_REST.hip - sn * stride * run - crouch * 0.45;
  let knee = LEG_REST.knee + lift * 0.95 + crouch * 0.85;
  let ankle = LEG_REST.ankle - lift * 0.75 - crouch * 0.5;
  // Leap pose: thighs up, shins and feet thrust forward so the claws lead.
  hip = lerp(hip, -1.15, air);
  knee = lerp(knee, 0.3, air);
  ankle = lerp(ankle, 0.05, air);
  leg.hip.rotation.x = hip;
  leg.knee.rotation.x = knee;
  leg.ankle.rotation.x = ankle;
  leg.toe.rotation.x = -(hip + knee + ankle) + lift * 0.9 - air * 0.4;
  return theroLegHeight(s, hip, knee, ankle);
}

// ─── Pteranodon ────────────────────────────────────────────────────────────

export interface PteroRig {
  body: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  /** [left(+X), right(-X)] */
  shoulders: THREE.Group[];
  wrists: THREE.Group[];
  legs: THREE.Group;
  /** Glowing eyes + crest tip (one mesh). */
  glow: THREE.Mesh;
  meshes: { head: THREE.Mesh[]; torso: THREE.Mesh[]; limb: THREE.Mesh[] };
}

export const PTERO_PAL: Palette = {
  key: 'ptero',
  base: 0x7c6a56,
  back: 0x463a30,
  // Players nearly always see a pteranodon from below: a warm pale belly and
  // wing linings (with dark finger bands) keep it readable against both a
  // stormy night sky and a hazy day sky.
  belly: 0xdcc49c,
  stripe: 0x342a22,
  accent: 0xd8461e,
  accent2: 0x7a1e10,
  claw: 0x1e1a16,
  teeth: 0xe8dfc8,
  mouth: 0x7a2a26,
  eye: 0xffa030,
};

export function buildPtero(model: THREE.Group, p: Palette = PTERO_PAL): PteroRig {
  // Self-lit undersides for the night sky; a softer rim so the pale lining
  // doesn't bloom into the bright day sky.
  const mat = selfLitSkin(2, 0.3, 0.22);
  const K = `ptero|${p.key}`;
  const beak = 0xd8b060;
  const beakDark = 0x8a6a30;
  // Wings / body choose their surface per part; only hard parts are colour-keyed.
  const keys = new Map<number, Surf>([
    [p.claw, SURF.claw],
    [p.mouth, SURF.mouth],
    [beak, SURF.horn],
    [beakDark, SURF.horn],
  ]);
  const mk = (noise: number, seed: number, base: Surf) => dsculpt(noise, seed, keys, base);
  const body = Kit.pivot(model, 0, 0, 0, 'body');
  const meshes: PteroRig['meshes'] = { head: [], torso: [], limb: [] };
  const torsoGeo = dgeo(`${K}|torso`, () => {
    // Furry pycnofibre body.
    const sc = mk(0.06, 41, SURF.fuzz);
    sc.seg(0.62, [0.1, 0.11], [0.15, 0.16], skin(p), M(0, 0, -0.38), { sides: 8, rings: 3, bulge: 0.15 });
    sc.cone(0.07, 0.2, skin(p), M(0, 0, -0.36, -Math.PI / 2), 5);
    return sc.build();
  });
  meshes.torso.push(Kit.add(body, torsoGeo, mat));
  const neck = Kit.pivot(body, 0, 0.06, 0.22, 'neck');
  neck.rotation.order = 'YXZ';
  neck.rotation.x = -0.35;
  const neckGeo = dgeo(`${K}|neck`, () => mk(0.06, 42, SURF.fuzz).seg(0.34, [0.08, 0.09], [0.055, 0.065], skin(p), M(0, 0, -0.03), { sides: 6 }).build());
  meshes.torso.push(Kit.add(neck, neckGeo, mat));
  const head = Kit.pivot(neck, 0, 0, 0.3, 'head');
  head.rotation.order = 'YXZ';
  head.rotation.x = 0.4;
  const headGeo = dgeo(`${K}|head`, () => {
    const sc = mk(0.05, 43, SURF.hide);
    sc.seg(0.2, [0.06, 0.07], [0.055, 0.06], skin(p), M(0, 0, -0.06), { sides: 6, bulge: 0.12 });
    // Long toothless upper beak.
    sc.seg(0.78, [0.045, 0.05], [0.006, 0.008], (_x, _y, z) => (z > 0.7 ? beakDark : beak), M(0, -0.005, 0.12), { sides: 6, rings: 2, dy: -0.04 });
    // Swept-back crest blade.
    sc.as(SURF.bone).seg(0.6, [0.032, 0.085], [0.016, 0.03], (_x, y) => (y > 0.1 ? p.accent : p.accent2), M(0, 0.06, 0.05, -2.75, 0, 0), { sides: 6, rings: 2 });
    return sc.build();
  });
  meshes.head.push(Kit.add(head, headGeo, mat));
  // Glowing eyes + crest tip in one mesh: a warm spark that marks the head at range.
  const glowGeo = dgeo(`${K}|glow`, () => {
    const sc = new Sculpt(0);
    const e = 0.05;
    for (const side of [1, -1]) sc.box(e * 0.7, e, e * 1.5, 0xffffff, M(side * 0.058, 0.026, 0.03, 0, side * 0.35, 0));
    // Sheath over the last third of the crest blade (same frame as the blade, slightly larger).
    sc.seg(0.22, [0.025, 0.052], [0.019, 0.036], 0xffffff, M(0, 0.06, 0.05, -2.75, 0, 0).multiply(M(0, 0, 0.41)), { sides: 6 });
    return sc.build();
  });
  const glow = Kit.add(head, glowGeo, Kit.glow(p.eye, 1.15));
  const jaw = Kit.pivot(head, 0, -0.035, 0.1, 'jaw');
  const jawGeo = dgeo(`${K}|jaw`, () =>
    mk(0.05, 44, SURF.horn).seg(0.7, [0.04, 0.025], [0.005, 0.005], (_x, _y, z) => (z > 0.6 ? beakDark : beak), M(0, -0.01, 0), { sides: 5 }).build(),
  );
  meshes.head.push(Kit.add(jaw, jawGeo, mat));

  // Wings: leading edge thick (arm bones), trailing edge thin membrane.
  const wingPaint: PaintFn = (_x, _y, z, _nx, ny, nz) => {
    if (ny > 0.3) return p.back;
    // Pale lining; darker trailing membrane edge.
    if (ny < -0.3) return z < -0.3 ? p.base : p.belly;
    // Leading edge (arm bones) pale too, so the wing outline reads from any angle.
    return nz > 0.4 ? p.belly : p.base;
  };
  // Wing-bone bands on top and finger lines on the lining, drawn per pixel.
  const topBands: StripeSpec = { freq: 0.8, slant: 0, xFreq: 2.6, w: 0.18, phase: 0, color: p.stripe };
  const liningBands: StripeSpec = { freq: 0, slant: 0, xFreq: 2.6, w: 0.12, phase: 0.04, color: p.base };
  wingPaint.stripe = (_x, _y, z, _nx, ny) => (ny > 0.3 ? topBands : ny < -0.3 && z >= -0.3 ? liningBands : null);
  const inner: [number, number][] = [
    [0, 0.17],
    [0.98, 0.13],
    [0.98, -0.1],
    [0.55, -0.32],
    [0.0, -0.46],
  ];
  const innerT = [0.09, 0.07, 0.02, 0.014, 0.03];
  const outer: [number, number][] = [
    [0, 0.13],
    [0.6, 0.06],
    [1.25, -0.24],
    [0.75, -0.22],
    [0.0, -0.1],
  ];
  const outerT = [0.07, 0.04, 0.012, 0.01, 0.02];
  const shoulders: THREE.Group[] = [];
  const wrists: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const sh = Kit.pivot(body, side * 0.11, 0.06, 0.1, 'shoulder');
    sh.rotation.order = 'YXZ';
    const mirror = (pts: [number, number][]) => pts.map(([x, z]) => [x * side, z] as [number, number]);
    const ig = dgeo(`${K}|wingIn${side}`, () => mk(0.05, 45, SURF.membrane).slab(mirror(inner), innerT, wingPaint).build());
    meshes.limb.push(Kit.add(sh, ig, mat));
    const wr = Kit.pivot(sh, side * 0.98, 0, 0, 'wrist');
    const og = dgeo(`${K}|wingOut${side}`, () => {
      const sc = mk(0.05, 46, SURF.membrane).slab(mirror(outer), outerT, wingPaint);
      // Little clawed fingers at the wrist.
      sc.cone(0.012, 0.07, p.claw, M(side * 0.02, 0.02, 0.15, 0.9, 0, 0), 4);
      return sc.build();
    });
    meshes.limb.push(Kit.add(wr, og, mat));
    shoulders.push(sh);
    wrists.push(wr);
  }
  const legs = Kit.pivot(body, 0, -0.06, -0.3, 'legs');
  const legGeo = dgeo(`${K}|legs`, () => {
    const sc = mk(0.06, 47, SURF.scales);
    for (const side of [1, -1]) {
      sc.seg(0.34, [0.03, 0.035], [0.018, 0.02], skin(p), M(side * 0.08, 0, 0, 0.2, Math.PI + side * 0.12, 0), { sides: 5 });
      for (let i = -1; i <= 1; i++) sc.cone(0.008, 0.06, p.claw, M(side * 0.1 + i * 0.012, -0.08, -0.36, -1.9, 0, 0), 3);
    }
    return sc.build();
  });
  meshes.limb.push(Kit.add(legs, legGeo, mat));
  return { body, neck, head, jaw, shoulders, wrists, legs, glow, meshes };
}

// ─── Triceratops ───────────────────────────────────────────────────────────

export interface TrikeLeg {
  upper: THREE.Group;
  lower: THREE.Group;
  front: boolean;
  side: number;
  len: [number, number];
}

export interface TrikeRig {
  body: THREE.Group;
  bodyMesh: THREE.Mesh;
  neck: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  tail: THREE.Group[];
  legs: TrikeLeg[];
  hipH: number;
  meshes: { head: THREE.Mesh[]; torso: THREE.Mesh[]; limb: THREE.Mesh[]; tail: THREE.Mesh[]; armor: THREE.Mesh[] };
}

export const TRIKE_PAL: Palette = {
  key: 'trike',
  // Warm earth brown (pops against jungle greens) with chocolate saddle bands,
  // pale belly and a hot red / amber display frill.
  base: 0x8e6c48,
  back: 0x5c4230,
  belly: 0xd4c098,
  stripe: 0x60442c,
  accent: 0xc8361a,
  accent2: 0xe8a238,
  claw: 0x2e2a22,
  teeth: 0xe9dfc6,
  mouth: 0x6a2622,
  eye: 0xffa040,
};

export function buildTrike(model: THREE.Group, p: Palette = TRIKE_PAL): TrikeRig {
  const mat = skinMat(0.9);
  const K = `trike|${p.key}`;
  const beak = 0x35302a;
  const keys = palKeys(p, true);
  keys.set(beak, SURF.horn);
  const mk = (noise: number, seed: number, base: Surf = SURF.hide) => dsculpt(noise, seed, keys, base);
  const meshes: TrikeRig['meshes'] = { head: [], torso: [], limb: [], tail: [], armor: [] };
  // Leg geometry drives the body height.
  const rear: [number, number] = [0.74, 0.64];
  const front: [number, number] = [0.6, 0.56];
  const foot = 0.1;
  const hipH = rear[0] * Math.cos(0.12) + rear[1] * Math.cos(0.12) + foot;
  const body = Kit.pivot(model, 0, hipH + 0.08, 0, 'body');
  const bodyGeo = dgeo(`${K}|body`, () => {
    const sc = mk(0.06, 51);
    const sp = skin(p, 0.75, { w: 0.24, slant: 0.3 });
    sc.blob(0.92, 0.84, 1.55, sp, M(0, 0.06, 0.28), 10, 8);
    sc.blob(0.84, 0.8, 0.95, sp, M(0, 0.12, -0.68), 8, 6);
    // Shoulder and haunch masses.
    for (const side of [1, -1]) {
      sc.blob(0.36, 0.52, 0.55, sp, M(side * 0.64, -0.2, -0.75), 6, 5);
      sc.blob(0.3, 0.44, 0.44, sp, M(side * 0.66, -0.34, 1.2), 6, 5);
    }
    return sc.build();
  });
  const bodyMesh = Kit.add(body, bodyGeo, mat);
  meshes.torso.push(bodyMesh);

  // Neck + head.
  const neck = Kit.pivot(body, 0, -0.05, 1.7, 'neck');
  neck.rotation.order = 'YXZ';
  neck.rotation.x = 0.12;
  const neckGeo = dgeo(`${K}|neck`, () => mk(0.06, 52).seg(0.62, [0.5, 0.52], [0.4, 0.44], skin(p), M(0, 0, -0.08), { sides: 8 }).build());
  meshes.torso.push(Kit.add(neck, neckGeo, mat));
  const head = Kit.pivot(neck, 0, 0, 0.5, 'head');
  head.rotation.order = 'YXZ';
  head.rotation.x = 0.12;
  const headGeo = dgeo(`${K}|head`, () => {
    const sc = mk(0.05, 53);
    const hp: PaintFn = (_x, y, z, _nx, ny) => (z > 1.0 && y < 0.05 ? beak : ny > 0.6 ? p.back : ny < -0.5 ? p.belly : p.base);
    sc.seg(0.9, [0.44, 0.5], [0.33, 0.36], hp, M(0, 0, -0.3), { sides: 8, rings: 2 });
    sc.seg(0.75, [0.31, 0.34], [0.09, 0.11], hp, M(0, -0.04, 0.52), { sides: 6, rings: 2, dy: -0.28 });
    // Hooked beak tip.
    sc.cone(0.085, 0.22, beak, M(0, -0.34, 1.16, 2.5, 0, 0), 5);
    // Cheek bosses.
    for (const side of [1, -1]) sc.cone(0.1, 0.2, p.back, M(side * 0.36, -0.12, 0.05, 0, 0, -side * 1.9), 5);
    return sc.build();
  });
  meshes.head.push(Kit.add(head, headGeo, mat));
  Kit.add(head, eyesGeo(0.37, 0.14, 0.3, 0.085), Kit.glow(p.eye, 1.1));
  const hornGeo = dgeo(`${K}|horns`, () => {
    // Keratin sheaths: no colour keys (the bone-white base is horn too).
    const sc = dsculpt(0.04, 54, null, SURF.horn);
    const hornPaint = (y0: number, len: number): PaintFn => (_x, y, z) => {
      const t = clamp((Math.hypot(y - y0, z) - 0.05) / len, 0, 1);
      return t > 0.72 ? 0x3a3428 : t > 0.45 ? 0xbdb196 : p.teeth;
    };
    for (const side of [1, -1]) {
      sc.cone(0.1, 1.0, hornPaint(0.36, 1.0), M(side * 0.22, 0.36, 0.28, 1.18, 0, -side * 0.12), 7);
    }
    sc.cone(0.085, 0.32, hornPaint(0.18, 0.32), M(0, 0.18, 0.86, 0.5, 0, 0), 6);
    return sc.build();
  });
  meshes.armor.push(Kit.add(head, hornGeo, mat));
  const frillGeo = dgeo(`${K}|frill`, () => {
    const sc = mk(0.05, 55, SURF.bone);
    const R = 1.05;
    const fp: PaintFn = (x, y, _z, _nx, _ny, nz) => {
      const r = Math.hypot(x, y) / R;
      if (nz < -0.3) return r > 0.8 ? p.back : p.base;
      if (r > 0.9) return p.teeth;
      if (r > 0.72) return p.accent;
      if (r > 0.62) return p.accent2;
      // Eye-spots on the shield.
      if (r > 0.3 && hash3(Math.round(x * 4), Math.round(y * 4), 1, 5) < 0.22) return p.stripe;
      return r < 0.35 ? p.back : p.base;
    };
    const tilt = M(0, 0.22, -0.3, -0.85, 0, 0);
    sc.fan(R, -0.3, Math.PI + 0.3, 14, [0.35, 0.68, 1], (i) => (i % 2 ? 1.0 : 0.94), 0.1, fp, tilt);
    // Epoccipital spikes around the rim.
    for (let i = 0; i <= 14; i++) {
      const a = -0.32 + ((Math.PI + 0.64) * i) / 14;
      const m = tilt.clone().multiply(M(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, 0, 0, 0, a - Math.PI / 2));
      sc.cone(0.05, 0.1, p.teeth, m, 4);
    }
    return sc.build();
  });
  meshes.armor.push(Kit.add(head, frillGeo, mat));
  const jaw = Kit.pivot(head, 0, -0.3, 0.05, 'jaw');
  const jawGeo = dgeo(`${K}|jaw`, () => {
    const sc = mk(0.05, 56);
    sc.seg(1.0, [0.3, 0.14], [0.08, 0.06], (_x, _y, z, _nx, ny) => (z > 0.8 ? beak : ny > 0.6 ? p.mouth : ny < -0.4 ? p.belly : p.base), M(0, 0, -0.1), { sides: 6, dy: 0.04 });
    return sc.build();
  });
  meshes.head.push(Kit.add(jaw, jawGeo, mat));

  // Tail.
  const tail: THREE.Group[] = [];
  let tp: THREE.Object3D = body;
  let tz = -1.4;
  let r: [number, number] = [0.5, 0.52];
  const tl = [0.78, 0.7, 0.62];
  for (let i = 0; i < tl.length; i++) {
    const seg = Kit.pivot(tp, 0, i === 0 ? 0.04 : 0, tz, 'tail' + i);
    seg.rotation.x = i === 0 ? -0.12 : -0.06;
    const last = i === tl.length - 1;
    const r1: [number, number] = last ? [0.04, 0.05] : [r[0] * 0.62, r[1] * 0.62];
    const r0 = r;
    const len = tl[i];
    const g = dgeo(`${K}|tail${i}`, () => mk(0.06, 57 + i).seg(len + 0.1, r0, r1, skin(p, 0.75, { w: 0.24, phase: i * 0.3 }), M(0, 0, 0.1, 0, Math.PI, 0), { sides: 7, rings: 2 }).build());
    meshes.tail.push(Kit.add(seg, g, mat));
    tail.push(seg);
    tp = seg;
    tz = -len;
    r = r1;
  }

  // Legs (columnar, elephant-like feet).
  const legs: TrikeLeg[] = [];
  const lp = limbPaint(p);
  const legGeos = (isFront: boolean) => {
    const [a, b] = isFront ? front : rear;
    const ru: [number, number] = isFront ? [0.25, 0.3] : [0.32, 0.44];
    const up = dgeo(`${K}|leg${isFront ? 'F' : 'R'}u`, () =>
      mk(0.06, 61).seg(a + 0.16, ru, [0.2, 0.23], skin(p), M(0, 0.16, 0, Math.PI / 2), { sides: 7, bulge: 0.15 }).build(),
    );
    const lo = dgeo(`${K}|leg${isFront ? 'F' : 'R'}l`, () => {
      const sc = mk(0.07, 62);
      sc.seg(b + 0.04, [0.19, 0.2], [0.16, 0.17], lp, M(0, 0.04, 0, Math.PI / 2), { sides: 7 });
      sc.add(new THREE.CylinderGeometry(0.19, 0.23, foot, 8), lp, M(0, -b - foot / 2 + 0.02, 0.03));
      for (let i = -1; i <= 1; i++) sc.cone(0.05, 0.1, p.claw, M(i * 0.1, -b - foot + 0.04, 0.2, Math.PI / 2 + 0.25, 0, 0), 4);
      return sc.build();
    });
    return { up, lo };
  };
  for (const isFront of [true, false]) {
    const g = legGeos(isFront);
    for (const side of [1, -1]) {
      // Pivot heights put both pairs of feet on the ground at rest (body sits at hipH + 0.08).
      const upper = Kit.pivot(body, side * (isFront ? 0.64 : 0.58), isFront ? -0.3 : -0.08, isFront ? 1.18 : -0.75, 'leg');
      upper.rotation.z = isFront ? -side * 0.1 : 0;
      meshes.limb.push(Kit.add(upper, g.up, mat));
      const lower = Kit.pivot(upper, 0, -(isFront ? front[0] : rear[0]), 0, 'lowerleg');
      meshes.limb.push(Kit.add(lower, g.lo, mat));
      legs.push({ upper, lower, front: isFront, side, len: isFront ? front : rear });
    }
  }
  return { body, bodyMesh, neck, head, jaw, tail, legs, hipH, meshes };
}

// ─── Dino base class ───────────────────────────────────────────────────────

const GRAVITY = 22;
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ndc = new THREE.Vector3();

/**
 * Shared dinosaur behaviour on top of `Enemy`:
 *  - `lift`: model height above the root (leaps/flight) — immune to the base
 *    class's ground snap, so arcs never hitch.
 *  - airborne ballistic falls (knocked out of a leap), hit flinches, a lagging
 *    tail spring driven by turn rate, travel-facing when chasing a vehicle.
 *  - momentum deaths: the body keeps its (world) velocity, tumbles if it died
 *    in the air, slides, topples onto its side and sinks.
 *  - attack-slot helpers for custom attack states.
 *  - attack FRAMING: custom attacks (pounces, dives, spits, charges) may only
 *    start where the player can see them (`spotNdc`, `staysFramed` predicts the
 *    camera's turn), and a telegraph that leaves the play area — off screen or
 *    under a HUD panel — is called off (`framingLost`) instead of landing blind.
 */
export abstract class Dino extends Enemy {
  /** Model height above root.y (metres). */
  protected lift = 0;
  protected liftVel = 0;
  private prevLift = 0;
  /** Measured velocity in the entity's frame (m/s). */
  protected readonly vel = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private prevYaw = 0;
  protected yawRate = 0;
  /** Ballistic flight after being knocked out of the air. */
  protected airborne = false;
  protected readonly airVel = new THREE.Vector3();
  /** Hit reaction impulse (decays). */
  protected flinch = 0;
  protected flinchSide = 1;
  protected flinchHead = false;
  /** Lagging tail swing from turning (spring). */
  protected tailSwing = 0;
  private tailSwingV = 0;
  /** Seconds before the next attack may start. */
  protected cooldown = 0;
  /** 0..1 weight for facing the travel direction while riding along in the rig frame. */
  protected travelFacing = 0.85;
  /** Pitched idle vocalisation. */
  protected idleCall: { name: SfxName; pitch: number; vol: number; min: number; max: number } | null = null;
  private idleT = 2;
  /**
   * Smoothed yaw rate of the camera relative to this dino's frame (rad/s, + = the
   * view swinging LEFT, so things on screen slide right). Shake-free.
   */
  protected camYawRate = 0;
  private prevCamYaw = 0;
  /** Last projected anchor position (NDC) from `spotNdc()`. */
  protected sx = 0;
  protected sy = 0;
  /** Attack-framing watchdog: seconds out of the play area (in a row / in total). */
  private outRun = 0;
  private outSum = 0;

  // Death.
  protected readonly deathVel = new THREE.Vector3();
  protected deathVy = 0;
  protected deathSide = 1;
  protected deathTumble = 0;
  /** Pitch somersault rate while a corpse falls (fitted to land after whole turns). */
  protected deathSpin = 0;
  /** Height of the body's centre above the feet: somersaults pivot around it, not the toes. */
  protected spinPivot = 0;
  protected deathLanded = false;
  protected deathY = 0;
  /** Seconds after death before toppling starts / how long it takes. */
  protected toppleDelay = 0.1;
  protected toppleDur = 0.55;
  protected topple = 0;
  /** Height the model must rise when lying on its side (half body width). */
  protected lieHeight = 0.2;
  protected deathTime = 3.0;
  protected sinkDepth = 0.9;
  protected deathFriction = 3.5;
  protected landShake = 0.04;
  protected landDust = 0.8;
  private toppleHit = false;

  override onAdded(): void {
    super.onAdded();
    this.prevPos.copy(this.root.position);
    this.prevYaw = this.root.rotation.y;
    this.idleT = this.world.rng.range(1, 4);
    this.prevCamYaw = this.camYaw();
  }

  override setState(s: EnemyState) {
    super.setState(s);
    // Custom attack states re-create their own telegraph right after.
    if (s !== 'windup') this.telegraph = null;
    else this.watchStart();
  }

  // ── Attack framing ──

  /** Shake-free camera yaw, relative to the rig for rig-frame dinos (they ride with it). */
  private camYaw(): number {
    const rig = this.world.rig;
    return rig.viewModelHolder.rotation.y - (this.frame === 'rig' ? rig.space.rotation.y : 0);
  }

  /** Project the anchor to NDC into `sx`/`sy`. Returns false when it is behind the camera. */
  protected spotNdc(obj: THREE.Object3D = this.anchor): boolean {
    obj.getWorldPosition(_ndc).project(this.world.camera);
    this.sx = _ndc.x;
    this.sy = _ndc.y;
    return _ndc.z < 1;
  }

  /**
   * Will something at NDC x stay inside |x| < `limit` for another `t` seconds of
   * the camera's current turn? Attacks don't start while the view is swinging
   * away from them (boss framing, look-backs, a vehicle racing past).
   */
  protected staysFramed(x: number, t: number, limit = 0.9): boolean {
    const cam = this.world.camera;
    const tanH = Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
    const a = Math.atan(x * tanH) + this.camYawRate * t;
    return Math.abs(a) < 1.45 && Math.abs(Math.tan(a)) < limit * tanH;
  }

  /** Arm the framing watchdog for a fresh telegraph. */
  protected watchStart() {
    this.outRun = 0;
    this.outSum = 0;
  }

  /**
   * Fairness watchdog for attacks: call every frame while the telegraph is up.
   * True when the attack must be called off because the player can't see it:
   * its anchor has been outside the play area (off screen, or under a HUD
   * panel) for more than `maxRun` seconds in a row, or for more than `maxShare`
   * of the attack's whole telegraph (`total` seconds).
   */
  protected framingLost(dt: number, total: number, maxRun = 0.2, maxShare = 0.25): boolean {
    const a = this.telegraph?.anchor ?? this.anchor;
    a.getWorldPosition(_ndc).project(this.world.camera);
    if (ndcInPlayArea(_ndc.x, _ndc.y, _ndc.z, 0.98)) this.outRun = 0;
    else {
      this.outRun += dt;
      this.outSum += dt;
    }
    return this.outRun > maxRun || this.outSum > total * maxShare;
  }

  /** Grab one of the world's attack slots (fair cap on simultaneous attackers). */
  protected takeSlot(): boolean {
    if (!this.usesAttackSlot || this.holdsSlot) return true;
    if (this.world.attackSlots > 0) {
      this.world.attackSlots--;
      this.holdsSlot = true;
      return true;
    }
    return false;
  }

  /** Switch to a custom attack state while keeping (or taking) an attack slot. */
  protected enterAttack(state: string): boolean {
    if (this.usesAttackSlot && !this.holdsSlot && this.world.attackSlots <= 0) return false;
    this.setState(state);
    if (this.usesAttackSlot && !this.holdsSlot) {
      this.world.attackSlots = Math.max(0, this.world.attackSlots - 1);
      this.holdsSlot = true;
    }
    return true;
  }

  /** Play a sound with distance attenuation and pitch. */
  sfx(name: SfxName, vol = 1, pitch = 1, vary = 0.1) {
    const v = vol * clamp(1.4 - this.distToPlayer / 30, 0.25, 1);
    this.world.audio.play(name, { volume: v, pitch, vary });
  }

  override faceToward(target: THREE.Vector3, dt: number, rate = 6) {
    let yaw = Math.atan2(target.x - this.root.position.x, target.z - this.root.position.z);
    const rig = this.world.rig;
    if (this.frame === 'rig' && rig.speed > 1 && this.travelFacing > 0) {
      // Riding along with a vehicle: face where we're actually going (world-relative).
      const vx = this.vel.x;
      const vz = this.vel.z - rig.speed;
      const travel = Math.atan2(vx, vz);
      const w = clamp(rig.speed / 7, 0, 1) * this.travelFacing;
      yaw = travel + angleDelta(travel, yaw) * (1 - w);
    }
    this.root.rotation.y += angleDelta(this.root.rotation.y, yaw) * (1 - Math.exp(-rate * dt));
  }

  /** Called when an airborne dino touches down. */
  protected onLand(): void {
    this.world.fx.dust(this.worldPos(_v), 0.5);
  }

  override update(dt: number): void {
    if (this.airborne && this.state !== 'dying' && dt > 0) {
      this.airVel.y -= GRAVITY * dt;
      this.lift += this.airVel.y * dt;
      this.root.position.x += this.airVel.x * dt;
      this.root.position.z += this.airVel.z * dt;
      this.airVel.x *= Math.exp(-1.5 * dt);
      this.airVel.z *= Math.exp(-1.5 * dt);
      if (this.lift <= 0) {
        this.lift = 0;
        this.airborne = false;
        this.airVel.set(0, 0, 0);
        this.onLand();
      }
    }
    super.update(dt);
    if (this.removed || dt <= 0) return;
    if (this.state !== 'dying') {
      this.vel.subVectors(this.root.position, this.prevPos).divideScalar(dt);
      if (this.vel.lengthSq() > 900) this.vel.setLength(30);
      this.liftVel = (this.lift - this.prevLift) / dt;
      this.yawRate = this.yawRate * 0.6 + (angleDelta(this.prevYaw, this.root.rotation.y) / dt) * 0.4;
      const cy = this.camYaw();
      const turn = clamp(angleDelta(this.prevCamYaw, cy) / dt, -6, 6);
      this.camYawRate += (turn - this.camYawRate) * Math.min(1, dt * 8);
      this.prevCamYaw = cy;
    }
    this.prevPos.copy(this.root.position);
    this.prevLift = this.lift;
    this.prevYaw = this.root.rotation.y;
    this.flinch = Math.max(0, this.flinch - dt * 3.5);
    this.cooldown -= dt;
    // Tail spring: swings opposite to turns, overshoots, settles.
    const target = clamp(-this.yawRate * 0.22, -0.7, 0.7);
    this.tailSwingV += ((target - this.tailSwing) * 55 - this.tailSwingV * 7) * dt;
    this.tailSwing += this.tailSwingV * dt;
    if (this.idleCall && this.state !== 'dying') {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        const c = this.idleCall;
        this.idleT = this.world.rng.range(c.min, c.max);
        this.sfx(c.name, c.vol, c.pitch, 0.15);
      }
    }
  }

  protected override animate(dt: number): void {
    if (!(this.state === 'entry' && this.spawn.entry === 'rise')) this.model.position.y = this.lift + this.deathY;
    if (this.state === 'dying' && this.spinPivot > 0) {
      // Pitch around the body's centre rather than the feet (the model's origin).
      const rx = this.model.rotation.x;
      const h = this.spinPivot * Math.cos(this.model.rotation.z);
      this.model.position.y += h * (1 - Math.cos(rx));
      this.model.position.z = -h * Math.sin(rx);
    }
    this.pose(dt);
  }

  /** Subclass procedural animation (joints only). */
  protected abstract pose(dt: number): void;

  protected override onDamaged(hit: ShotHit, amount: number): void {
    const e = this.model.matrixWorld.elements;
    const d = hit.dir.x * e[0] + hit.dir.y * e[1] + hit.dir.z * e[2];
    this.flinchSide = d >= 0 ? 1 : -1;
    this.flinch = Math.min(1.3, this.flinch + 0.5 + amount * 0.15);
    this.flinchHead = hit.part === 'head';
  }

  /** Knock the dino into a ballistic fall (frame coords). */
  protected launch(vx: number, vy: number, vz: number) {
    this.airborne = true;
    this.airVel.set(vx, vy, vz);
  }

  protected override onDeath(_hit: ShotHit | null): void {
    this.deathSide = this.flinchSide;
    this.deathVel.copy(this.vel).setY(0);
    if (this.airborne) this.deathVel.add(_v.set(this.airVel.x, 0, this.airVel.z));
    if (this.spawn.frame === 'rig') {
      // Convert rig-relative motion to world motion (we were carried by the vehicle).
      const rig = this.world.rig;
      this.deathVel.applyQuaternion(rig.space.quaternion);
      const h = rig.space.rotation.y;
      this.deathVel.x += -Math.sin(h) * rig.speed;
      this.deathVel.z += -Math.cos(h) * rig.speed;
    }
    if (this.deathVel.lengthSq() > 256) this.deathVel.setLength(16);
    this.deathVy = this.airborne ? this.airVel.y : clamp(this.liftVel, -8, 8);
    // Base-class entries ('leap', 'drop', ledge jumps) carry height in root.y rather than
    // `lift`: hand it over so the corpse falls from where it was instead of popping down.
    // (die() has already re-parented a rig-frame root into the world, so this is world space.)
    const pos = this.root.position;
    const g = this.groundY(pos.x, pos.z);
    const h = pos.y - g;
    if (h > 0.05) {
      this.lift += h;
      pos.y = g;
      this.deathVy += clamp(this.vel.y, -14, 10);
    }
    if (this.lift > 0.25) {
      // Shot out of the air: the hit checks most of the lunge (plus a little arcade
      // knockback), so bodies don't sail into the lens and pile up at the camera.
      this.playerPos(_p);
      _v.set(pos.x - _p.x, 0, pos.z - _p.z);
      if (_v.lengthSq() > 1e-6) {
        _v.normalize();
        const toward = -(this.deathVel.x * _v.x + this.deathVel.z * _v.z);
        if (toward > 0) this.deathVel.addScaledVector(_v, toward * 0.65);
        this.deathVel.addScaledVector(_v, 1.8);
      }
    }
    this.deathTumble = this.lift > 0.25 ? (this.world.rng.chance(0.5) ? 1 : -1) * this.world.rng.range(5, 9) : 0;
    this.deathSpin = this.fitSpin(this.deathTumble);
    this.airborne = false;
    this.deathLanded = this.lift <= 0.01;
  }

  /**
   * Somersault rate close to `rate` that completes whole turns exactly at
   * touchdown, so the corpse lands feet-down and never swings through the
   * ground while settling. Short falls get no somersault (0).
   */
  protected fitSpin(rate: number): number {
    if (rate === 0 || this.lift <= 0.01) return 0;
    const vy = this.deathVy;
    const tLand = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * this.lift)) / GRAVITY;
    const n = Math.floor((Math.abs(rate) * tLand) / TAU + 0.35);
    return n > 0 ? (Math.sign(rate) * TAU * n) / tLand : 0;
  }

  /** Called once when the falling corpse hits the ground. */
  protected onDeathLand(): void {
    this.world.fx.dust(this.worldPos(_v), this.landDust);
    if (this.landShake > 0) this.world.rig.shake(this.landShake * clamp(1.5 - this.distToPlayer / 20, 0.2, 1));
  }

  /** Called once when the body slams onto its side. */
  protected onToppleImpact(): void {
    this.world.fx.dust(this.worldPos(_v), this.landDust * 0.8);
  }

  protected override updateDeath(dt: number): boolean {
    const t = this.stateTime;
    const pos = this.root.position;
    pos.x += this.deathVel.x * dt;
    pos.z += this.deathVel.z * dt;
    // Never slide a corpse into the camera.
    this.playerPos(_p);
    _v.set(pos.x - _p.x, 0, pos.z - _p.z);
    const d = _v.length();
    if (d < 2.6 && d > 0.001) {
      _v.divideScalar(d);
      const toward = -(this.deathVel.x * _v.x + this.deathVel.z * _v.z);
      if (toward > 0) this.deathVel.addScaledVector(_v, toward);
      pos.addScaledVector(_v, (2.6 - d) * Math.min(1, dt * 4));
    }
    if (!this.deathLanded) {
      this.deathVy -= GRAVITY * dt;
      this.lift += this.deathVy * dt;
      this.model.rotation.x += this.deathSpin * dt;
      if (this.lift <= 0) {
        this.lift = 0;
        this.deathVy = 0;
        this.deathLanded = true;
        // Settle the short way round.
        this.model.rotation.x = angleDelta(0, this.model.rotation.x);
        this.onDeathLand();
      }
    } else {
      this.deathVel.multiplyScalar(Math.exp(-this.deathFriction * dt));
      this.model.rotation.x = damp(this.model.rotation.x, 0, 7, dt);
    }
    pos.y = this.groundY(pos.x, pos.z);
    const k = clamp((t - this.toppleDelay) / this.toppleDur, 0, 1);
    // Ease-in fall with a small bounce at the end.
    const e = k < 1 ? k * k : 1;
    const bounce = k >= 1 ? Math.sin(Math.min(1, (t - this.toppleDelay - this.toppleDur) / 0.3) * Math.PI) * 0.06 : 0;
    this.topple = e;
    if (k >= 0.95 && !this.toppleHit) {
      this.toppleHit = true;
      this.onToppleImpact();
    }
    this.model.rotation.z = -this.deathSide * (e * 1.42 - bounce);
    const sinkStart = this.deathTime - 0.9;
    this.deathY = e * this.lieHeight - Math.max(0, t - sinkStart) * (this.sinkDepth / 0.9);
    return t > this.deathTime;
  }
}
