import * as THREE from 'three';
import type { TexName } from '../../kit/Textures';
import type { PwTile } from '../../pixelworld/atlas';
import { planarUv, type PwBatch, type PwRectOpts } from '../../pixelworld/batch';
import { NEUTRAL_HEX } from '../../pixelworld/retexture';
import type { Z2Billboards } from '../../pixelworld/z2billboard';
import { B } from './layout';
import type { Z2PixelWorld } from './pixel';

/**
 * ST. MERCY HOSPITAL in ART: PIXEL WORLD — what the converter (pixel.ts) and
 * its parts (pwBay / pwShell / pwProps / pwBasement / pwAtrium) share: the
 * records, the REGISTRY the parts sign up to, and the emitters all of them use.
 *
 * The converter walks a zone and asks the registry what to do: a handler per
 * tag kind (`pwTag` in the classic builders), a chain of tile rules by material
 * preset, colour and ZONE, emitters for special meshes, and hooks before /
 * after a zone. A part owns its cases; no part imports another part.
 */

/** Painted re-texture rule result: a tile, and a vertex tint (sRGB hex) for NEUTRAL tiles. */
export interface Pick {
  tile: PwTile;
  tint: number;
}

export interface Job {
  parent: THREE.Object3D;
  batch: PwBatch;
  bills: Z2Billboards;
  /** Animated strips (puddles), one material plays them. */
  anim: PwBatch | null;
  /** Additive light pools laid on the ground: [colour, x, y, z, w, d, strength]. */
  pools: number[][];
  /** Brightness of its painted surfaces (× the stage gain). */
  gain?: number;
  /** Floor height of a zone (troffer light pools land on it); undefined for set pieces. */
  floor?: number;
  /** The zone's name ('' for a set piece: a curtain, a drawer, the crashing ambulance…). */
  zone: string;
}

/** A wall / floor / ceiling piece seen by the converter (world-axis box), for the decal scatter. */
export interface Piece {
  box: THREE.Box3;
  kind: 'wallHi' | 'wallLo' | 'block' | 'floor' | 'ceil';
  hex: number;
}

export const X = new THREE.Vector3(1, 0, 0);
export const Y = new THREE.Vector3(0, 1, 0);
export const Z = new THREE.Vector3(0, 0, 1);
export const NX = new THREE.Vector3(-1, 0, 0);
export const NZ = new THREE.Vector3(0, 0, -1);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();
const _lc = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _col = new THREE.Color();
const _base = new THREE.Color();

/** Linear-ratio tint that turns a NEUTRAL tile (painted round `base`) into `hex`, as an sRGB hex for PwBatch. */
export function tintHex(hex: number, base: number): number {
  _col.setHex(hex);
  _base.setHex(base);
  _col.setRGB(Math.min(1, _col.r / Math.max(1e-4, _base.r)), Math.min(1, _col.g / Math.max(1e-4, _base.g)), Math.min(1, _col.b / Math.max(1e-4, _base.b)));
  return _col.getHex();
}

/** A tile painted in its own colours. */
export const own = (tile: PwTile): Pick => ({ tile, tint: 0xffffff });

/** A NEUTRAL tile (painted round `base`) tinted to `hex`. */
export function neutral(tile: PwTile, hex: number, base = NEUTRAL_HEX): Pick {
  tile.neutral = base;
  return { tile, tint: tintHex(hex, base) };
}

/** Lay a module rect in an object's frame. */
export function lay(b: PwBatch, m: THREE.Matrix4, o: THREE.Vector3, ux: THREE.Vector3, vy: THREE.Vector3, w: number, h: number, t: PwTile, opts: PwRectOpts = {}) {
  b.setMatrix(m);
  b.rect(o, ux, vy, w, h, t, opts);
  b.setMatrix(null);
}

/** Which decal family a shell piece belongs to (by its material preset). */
export function pieceKind(m: THREE.MeshLambertMaterial): Piece['kind'] | null {
  const k = `${m.userData.retroTex}|${m.userData.retroScale}|${m.userData.retroStrength}`;
  switch (k) {
    case 'stucco|1|0.65':
    case 'wallpaper|1|0.4':
      return m.side === THREE.BackSide ? null : 'wallHi';
    case 'tiles|1.2|0.62':
      return 'wallLo';
    case 'brick|1.25|0.5':
      return 'block';
    case 'checker|0.55|0.34':
    case 'checker|0.32|0.36':
    case 'tiles|0.5|0.85':
    case 'asphalt|1.6|0.6':
      return 'floor';
    case 'tiles|0.5|0.8':
      return 'ceil';
    default:
      return null;
  }
}

/** Mark a tile NEUTRAL (painted round `base`) and return it. */
export function neutral0(t: PwTile, base: number): PwTile {
  t.neutral = base;
  return t;
}

/** Vertex tint for a decal on a surface of colour `hex` (NEUTRAL decals take the surface's colour). */
export function decalTint(t: PwTile, hex: number): number {
  return t.neutral === undefined ? 0xffffff : tintHex(hex, t.neutral);
}

export function isGlow(o: THREE.Object3D): boolean {
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  return !!m && !Array.isArray(m) && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial === true;
}

/** Floor height per zone (wall tiles are laid with v from the floor). */
export const ZONE_FLOOR: Record<string, number> = {
  bay: 0,
  bayField: 0,
  er: 0,
  corrA: 0,
  ward: 0,
  hub: 0,
  morgue: B,
  corrB: B,
  or: B,
  corrC: B,
  atrium: B,
};

/**
 * Where each zone's decal counter starts (`Z2PixelWorld.nDecal` staggers coplanar decals by a
 * few tenths of a millimetre, cycling). It used to run on from zone to zone, so repainting one
 * zone re-staggered every zone built after it; each zone now starts from the count the first
 * pass reached there — the same stagger as before, and no zone depends on another.
 */
export const ZONE_DECAL0: Record<string, number> = {
  bay: 0,
  bayField: 0,
  er: 40,
  corrA: 126,
  ward: 219,
  hub: 285,
  stair: 340,
  morgue: 365,
  corrB: 421,
  or: 428,
  corrC: 480,
  atrium: 497,
};

/** Wainscot / wall tiles per material colour. */
export const GLAZED: Record<number, { tw?: number; th?: number; bond?: boolean; grime?: number; grout?: number; calm?: boolean; foot?: boolean }> = {
  0x2a6258: { grime: 0.6 },
  0x2e6a5e: { grime: 0.5 },
  0x587478: { tw: 16, th: 12, grime: 0.8 },
  0x9fb2b4: { tw: 16, th: 12, grime: 0.4, grout: 0x7a8486, foot: false },
  0x2a6a56: { tw: 16, th: 16, grime: 0.5, calm: true },
  0x3a7462: { grime: 0.45, calm: true, foot: false },
};

/**
 * Re-emit a geometry's triangles (placed by `m`, in the batch's frame) with a
 * tile per face from `pick` (sees the WORLD normal of the visible side):
 * planar texel UVs on each face's dominant axis — in world space (`world`:
 * courses run on across pieces; wall v measured from `floorY`) or in the
 * object's scaled frame. `flip` emits the back face (BackSide room shells).
 */
export function emitMesh(b: PwBatch, geo: THREE.BufferGeometry, m: THREE.Matrix4, pick: (nx: number, ny: number, nz: number) => Pick | null, o: { world: boolean; flip: boolean; floorY: number }) {
  const p = geo.getAttribute('position');
  const index = geo.index;
  const triCount = index ? index.count : p.count;
  const e = m.elements;
  const sx = Math.hypot(e[0], e[1], e[2]);
  const sy = Math.hypot(e[4], e[5], e[6]);
  const sz = Math.hypot(e[8], e[9], e[10]);
  const prev = b.matrix.clone();
  b.setMatrix(null);
  for (let i = 0; i + 2 < triCount; i += 3) {
    const i0 = index ? index.getX(i) : i;
    let i1 = index ? index.getX(i + 1) : i + 1;
    let i2 = index ? index.getX(i + 2) : i + 2;
    if (o.flip) [i1, i2] = [i2, i1];
    _la.fromBufferAttribute(p, i0);
    _lb.fromBufferAttribute(p, i1);
    _lc.fromBufferAttribute(p, i2);
    _a.copy(_la).applyMatrix4(m);
    _b.copy(_lb).applyMatrix4(m);
    _c.copy(_lc).applyMatrix4(m);
    _e1.subVectors(_b, _a);
    _e2.subVectors(_c, _a);
    _n.crossVectors(_e1, _e2);
    if (_n.lengthSq() < 1e-12) continue;
    _n.normalize();
    const pk = pick(_n.x, _n.y, _n.z);
    if (!pk) continue;
    const t = pk.tile;
    let ua: number, va: number, ub: number, vb: number, uc: number, vc: number;
    if (o.world) {
      [ua, va] = planarUv(_a, _n, t.density);
      [ub, vb] = planarUv(_b, _n, t.density);
      [uc, vc] = planarUv(_c, _n, t.density);
      if (Math.abs(_n.y) <= 0.7) {
        const off = o.floorY * t.density;
        va -= off;
        vb -= off;
        vc -= off;
      }
    } else {
      _la.set(_la.x * sx, _la.y * sy, _la.z * sz);
      _lb.set(_lb.x * sx, _lb.y * sy, _lb.z * sz);
      _lc.set(_lc.x * sx, _lc.y * sy, _lc.z * sz);
      _e1.subVectors(_lb, _la);
      _e2.subVectors(_lc, _la);
      _e1.cross(_e2);
      if (_e1.lengthSq() < 1e-12) continue;
      _e1.normalize();
      [ua, va] = planarUv(_la, _e1, t.density);
      [ub, vb] = planarUv(_lb, _e1, t.density);
      [uc, vc] = planarUv(_lc, _e1, t.density);
    }
    // Keep texel coords small (precision): shift by whole tile periods.
    const su = Math.floor(Math.min(ua, ub, uc) / t.w) * t.w;
    const sv = Math.floor(Math.min(va, vb, vc) / t.h) * t.h;
    b.tri(_a, _b, _c, t, [ua - su, va - sv, ub - su, vb - sv, uc - su, vc - sv], pk.tint);
  }
  b.setMatrix(prev);
}

// ─── The registry ────────────────────────────────────────────────────────────

/** A tagged object being converted. */
export interface TagCtx {
  pw: Z2PixelWorld;
  o: THREE.Object3D;
  b: PwBatch;
  /** The object's matrix in the frame of the group being converted. */
  m: THREE.Matrix4;
  /** The inverse world matrix of the group being converted. */
  inv: THREE.Matrix4;
  info: Record<string, unknown> & { kind: string };
  /** A hash of where it stands (variants by place, never by RNG). */
  hsh: number;
  root: THREE.Object3D;
}

/**
 * Paints what a tagged object stands for: true = the classic object goes, false = it stays (and is
 * re-textured generically), undefined = not mine (the next handler of the kind is asked).
 */
export type TagHandler = (c: TagCtx) => boolean | undefined;

/** A material on a face, to be given a painted tile. */
export interface PickQuery {
  tex: TexName | undefined;
  /** `texture|scale|strength` of the Kit material (mats.ts `TX`). */
  preset: string;
  hex: number;
  face: 'up' | 'down' | 'side';
  /** The zone being converted ('' for set pieces and things painted after the build). */
  zone: string;
}

/** A tile rule: a Pick, null = leave the face out, undefined = not mine (the next rule is asked). */
export type PickRule = (pw: Z2PixelWorld, q: PickQuery) => Pick | null | undefined;

/** A static mesh about to be re-textured generically. */
export interface MeshCtx {
  pw: Z2PixelWorld;
  b: PwBatch;
  mesh: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  /** The mesh's matrix in the frame of the group being converted. */
  rel: THREE.Matrix4;
  pick: (nx: number, ny: number, nz: number) => Pick | null;
  /** A zone (world-mapped surfaces) rather than a set piece. */
  world: boolean;
  floorY: number;
  zone: string;
}

/** Emits a mesh its own way (round things, shell pieces laid as panels…): true = done, the generic emit is skipped. */
export type MeshEmitter = (c: MeshCtx) => boolean;

export type ZoneHook = (pw: Z2PixelWorld, b: PwBatch, g: THREE.Group) => void;
export type ScatterFn = (pw: Z2PixelWorld, b: PwBatch, pieces: Piece[], zone: string, floorY: number) => void;
/** A `bakeInto` set piece about to be converted (in its parent's frame). */
export type IntoHook = (pw: Z2PixelWorld, g: THREE.Group, b: PwBatch) => void;
/** Tiles that are only laid after the atlas is built (dynamic things) must be registered before it. */
export type PrebuildHook = (pw: Z2PixelWorld, dyn: { doorColors: number[] }) => void;

export class Z2Registry {
  readonly tags = new Map<string, TagHandler[]>();
  readonly picks: PickRule[] = [];
  readonly meshes: MeshEmitter[] = [];
  readonly preps = new Map<string, ZoneHook[]>();
  readonly dresses = new Map<string, ZoneHook[]>();
  readonly scatters = new Map<string, ScatterFn>();
  readonly intos: IntoHook[] = [];
  readonly prebuilds: { fn: PrebuildHook; order: number }[] = [];

  /** A handler for tag kinds (asked in registration order until one answers). */
  tag(kinds: readonly string[], fn: TagHandler) {
    for (const k of kinds) {
      const l = this.tags.get(k);
      if (l) l.push(fn);
      else this.tags.set(k, [fn]);
    }
  }

  /** A tile rule (asked in registration order until one answers). */
  pick(fn: PickRule) {
    this.picks.push(fn);
  }

  mesh(fn: MeshEmitter) {
    this.meshes.push(fn);
  }

  /** Before a zone's objects are converted. */
  prep(zones: readonly string[], fn: ZoneHook) {
    for (const z of zones) this.preps.set(z, [...(this.preps.get(z) ?? []), fn]);
  }

  /** After a zone's objects, shell and decals: its composed dressing. */
  dress(zones: readonly string[], fn: ZoneHook) {
    for (const z of zones) this.dresses.set(z, [...(this.dresses.get(z) ?? []), fn]);
  }

  /** The decal pass over a zone's shell pieces (one per zone; the last registered wins). */
  scatter(zones: readonly string[], fn: ScatterFn) {
    for (const z of zones) this.scatters.set(z, fn);
  }

  into(fn: IntoHook) {
    this.intos.push(fn);
  }

  /**
   * `order`: when it runs among the prebuild hooks (ascending). Its own number, not the order the
   * parts sign up in (that one is the tile rules' order): the atlas is laid out in the order tiles
   * are registered, and a refactor that only moves code must not move a tile.
   */
  prebuild(fn: PrebuildHook, order: number) {
    this.prebuilds.push({ fn, order });
    this.prebuilds.sort((a, b) => a.order - b.order);
  }
}
