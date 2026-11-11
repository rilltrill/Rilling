import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { PW_ALIGN, PW_LEVELS, PW_PAL_W, PW_TPM, PW_TPM_MID, PWI, PwCanvas, PwPalette, PwRng, pwIndexToRgba, pwPalAt } from './canvas';
import { pwUpscale2x } from './upscale';

/**
 * PixelWorld atlas: every painted tile a stage uses (tileable surfaces, window /
 * door / shopfront modules, signs, decals, prop cut-outs) packed into ONE INDEXED
 * texture (two bytes a texel: ramp id, tone, glow — `PWI`) with hand-made mip
 * levels, and a small palette texture (a row a ramp, `PW_PAL_W` tones: the six
 * painted ones, deeper and brighter steps round them).
 *
 *  - Tiles are REGISTERED while the stage builds (`tile(key, w, h, paint)` →
 *    a handle; the same key returns the same tile), LAID OUT in `build()` (the
 *    rects are known at once, so meshes can be built) and PAINTED — at once, or,
 *    while a stage loads behind its intro card (`pwDeferPaint`), as a job that
 *    `pwPaintStep` runs a few milliseconds a frame (deterministic either way: the
 *    painter's RNG is seeded by the tile key). Code that rewrites painted levels
 *    registers with `post()` (it runs once the paint is done).
 *  - Painted atlases are cached by their tile list (a RETRY / RESTART reuses
 *    them) and persisted (`store.ts`: IndexedDB, keyed by atlas name + build
 *    version + tile list), so a stage loaded before skips painting altogether.
 *  - A tile painted below `PW_TPM_MID` texels a metre is STORED AT 2× (`scale`
 *    2) unless it or its atlas opts out: its level 0 is the pixel-art upscaler's
 *    copy (`upscale.ts`: smoothed shapes, re-dithered bands), its level 1 the
 *    texels exactly as painted, and so on down — the shader doubles the texel
 *    coords of such a tile and picks its level one step later, so nothing else
 *    changes: UVs, sizes and densities stay in PAINTED texels everywhere. A tile
 *    registered at `PW_TPM_MID` or more is stored as painted (`scale` 1).
 *  - Rects are aligned so that every level of every tile stays inside its own
 *    rect (16 painted texels for a first-pass tile, as its five levels need; 32
 *    stored texels once an atlas holds dense tiles and carries a sixth level):
 *    no bleeding, and tileable surfaces wrap inside their rect in the shader.
 *  - Mips are made per tile, palette-faithful: each level texel is the source
 *    texel nearest the 2×2 average (a real texel of the tile, never a blend),
 *    cut-out / glow / lit decided by majority — the hand-pixelled look holds at
 *    every distance and nothing crawls.
 *  - Clamp tiles (modules) get their last row / column extended into the
 *    alignment gutter, so coarse levels never fetch an empty texel.
 * Node-safe until `texture()` (tests paint and inspect atlases headless).
 */

export interface PwTile {
  readonly key: string;
  /** Painted size (texels). */
  readonly w: number;
  readonly h: number;
  /** Tileable (repeats in the shader) vs a module (clamped to its rect). */
  readonly wrap: boolean;
  /** PAINTED texels per metre when laid on a surface (default PW_TPM; the tiers: `PW_TPM_MID` …). */
  readonly density: number;
  /** Stored texels per painted texel: 2 = level 0 is the pixel-art upscaler's copy (see the header). */
  readonly scale: 1 | 2;
  /**
   * A NEUTRAL tile (painted round a light grey): the colour comes from the vertex
   * tint (`retexture` sets it from each material), so one painted tile serves every
   * car, crate and pipe colour. Holds the painted base colour (sRGB hex).
   */
  neutral?: number;
  /** Atlas position (STORED level-0 texels, bottom-left; set by `build()`). */
  x: number;
  y: number;
}

/** Options of `PwAtlas.tile`. */
export interface PwTileOptions {
  wrap?: boolean;
  /** Painted texels a metre (default PW_TPM). */
  density?: number;
  /**
   * false = never stored at 2× (a tile only ever seen from far away, or one whose texels must
   * stay as painted). Default: stored at 2× when painted below `PW_TPM_MID`.
   */
  upscale?: boolean;
  /**
   * Animated strips: the number of equal frames stacked in the tile (the upscaler then smooths
   * each frame on its own instead of across the seam between two).
   */
  frames?: number;
}

/**
 * The per-vertex `pwRect` of a tile: atlas position (stored texels), then its PAINTED size —
 * width negative for a module (clamped to its rect), height negative for a tile stored at 2×.
 * `wrap` overrides the tile's own (a module laid as a wrapped strip, a wrap tile clamped).
 */
export function pwRect(t: PwTile, wrap = t.wrap): [number, number, number, number] {
  return [t.x, t.y, wrap ? t.w : -t.w, t.scale === 2 ? -t.h : t.h];
}

/** One level of an atlas: the same memory as bytes (what is uploaded and stored) and as texels. */
export interface PwLevel {
  /** Two bytes a texel, low byte first (RG8). */
  data: Uint8Array;
  /** The texels (`PWI`), rows bottom-up. (Typed arrays are in platform order: little-endian wherever the game runs.) */
  idx: Uint16Array;
  width: number;
  height: number;
}

function makeLevel(width: number, height: number): PwLevel {
  const idx = new Uint16Array(width * height);
  return { data: new Uint8Array(idx.buffer), idx, width, height };
}

/** A level from its stored bytes (the persistent store hands back `data` only). */
export function pwLevelOf(data: Uint8Array, width: number, height: number): PwLevel {
  return { data, idx: new Uint16Array(data.buffer, data.byteOffset, data.byteLength >> 1), width, height };
}

/** What a painter gets: the stage palette (`ramp(hex)` → ramp id) and its own RNG. */
export interface PwKit {
  pal: PwPalette;
  rng: PwRng;
  /** Ramp id for a base colour (+ makeRamp options; `cap` limits the top lightness). */
  ramp(hex: number, o?: Parameters<PwPalette['add']>[1]): number;
}

export type PwPainter = (c: PwCanvas, k: PwKit) => void;

export interface PwAtlasData {
  /** Atlas name and tile-list signature (the cache / store key). */
  name: string;
  sig: string;
  w: number;
  h: number;
  /** Indexed levels (rows bottom-up), level 0 first, down to 1×1 (levels ≥ `mips` blank). */
  levels: PwLevel[];
  /** Levels that hold texels (the shader never picks a coarser one). */
  mips: number;
  /**
   * The palette: RGBA8 (sRGB) rows of `PW_PAL_W`, row = ramp id (`PwPalette.rgba`, cut to its
   * rows). Empty until painted.
   */
  pal: Uint8Array;
  /** Tile rects by key. */
  rects: Map<string, { x: number; y: number }>;
  /** CPU ms painting + packing + mips. */
  ms: number;
  /** Bytes of the levels and the palette (the same on the GPU and in the CPU copy). */
  bytes: number;
  /** Texels painted (the tiles at their painted size). */
  texels: number;
  /** Tiles stored at 2×. */
  up: number;
  /** False while its paint job is pending (a deferred load): levels hold zeros until then. */
  painted: boolean;
  /** Came back from the persistent store: painted AND post-processed (`post()` callbacks are skipped). */
  restored?: boolean;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const alignUp = (v: number, a: number) => Math.ceil(v / a) * a;

/**
 * The 2× fallback (on by default; `&pwup=0`: every tile stored as painted, the first pass's
 * atlases — the parity check, A/B). Read when a tile is REGISTERED: set it before a stage builds.
 */
let upscaleOn = true;
export function pwUpscale(on: boolean) {
  upscaleOn = on;
}

/** Painted atlases by signature (CPU data survives stage restarts; GPU textures are per stage). */
const cache = new Map<string, PwAtlasData>();

/** A pending paint job (deferred loads): steps of a few ms each, then the post passes and texture refresh. */
interface PaintJob {
  data: PwAtlasData;
  steps: Generator<void, void, void>;
  /** CPU ms spent in the job's steps (the idle frames between them excluded). */
  active: number;
  /** Run once painted, in order: `post()` passes, then texture refreshes. */
  after: ((d: PwAtlasData) => void)[];
}
const jobs: PaintJob[] = [];
let deferPaint = false;

/** Bench hook: the longest single deferred paint step this session (one tile, or one tile's mip chain). */
export const PW_PAINT_STATS = { maxStep: 0, maxStepAtlas: '' };

/**
 * Defer painting (Game, around a stage build behind its intro card / loading screen):
 * `build()` lays atlases out and queues their painting for `pwPaintStep`.
 * Off (the default: tests, tools, the attract demo) `build()` paints at once.
 */
export function pwDeferPaint(on: boolean) {
  deferPaint = on;
}

/** Paint jobs still pending. */
export function pwPaintPending(): number {
  return jobs.length;
}

/**
 * Run pending paint jobs for about `budgetMs` (a step is one tile painted or one
 * tile's mip chain: well under a frame). Returns true when nothing is pending.
 */
export function pwPaintStep(budgetMs = Infinity): boolean {
  const end = now() + budgetMs;
  while (jobs.length) {
    const j = jobs[0];
    const t = now();
    const r = j.steps.next();
    const dt = now() - t;
    j.active += dt;
    if (dt > PW_PAINT_STATS.maxStep) {
      PW_PAINT_STATS.maxStep = dt;
      PW_PAINT_STATS.maxStepAtlas = j.data.name;
    }
    if (r.done) {
      jobs.shift();
      j.data.ms = j.active;
      j.data.painted = true;
      const st = PW_STATS.get(j.data.name);
      if (st && st.sig === pwSigHash(j.data.sig)) {
        st.ms = j.active;
        st.bytes = j.data.bytes;
        st.ramps = j.data.pal.length / (PW_PAL_W * 4) - 1;
      }
      publishStats();
      for (const f of j.after) f(j.data);
      j.after.length = 0;
    }
    if (now() >= end) break;
  }
  return jobs.length === 0;
}

/**
 * Drop pending paint jobs (the load was abandoned): their half-painted atlases leave the cache.
 * `keep` spares some (the title backdrop's, still painting behind the menus).
 */
export function pwPaintCancel(keep?: (d: PwAtlasData) => boolean) {
  for (let i = jobs.length - 1; i >= 0; i--) {
    const j = jobs[i];
    if (keep?.(j.data)) continue;
    if (cache.get(j.data.sig) === j.data) cache.delete(j.data.sig);
    jobs.splice(i, 1);
  }
}

/** Is this atlas the title backdrop's (names `menu-…`: they live for the session)? */
export function pwMenuAtlas(d: { name: string }): boolean {
  return d.name === 'menu' || d.name.startsWith('menu-');
}

/** A painted atlas the persistent store handed back (painted and post-processed). */
export function pwCacheRestored(d: PwAtlasData) {
  if (!cache.has(d.sig)) cache.set(d.sig, d);
}

/** Is an atlas with this signature in the session cache (painted or pending)? */
export function pwCached(sig: string): boolean {
  return cache.has(sig);
}

/**
 * Keep the session cache to the atlases whose name starts with one of `prefixes`
 * (the stage being loaded, the title screen): the others go (the persistent store
 * still has them), so a session's CPU copies stay one stage's worth.
 */
export function pwCacheKeep(prefixes: readonly string[]) {
  for (const [sig, d] of cache) {
    if (!d.painted) continue;
    if (!prefixes.some((p) => pwPrefixOf(d, p))) cache.delete(sig);
  }
}

/** Whether the session cache holds a painted atlas of `prefix` (its name is `prefix` or starts with `prefix-`). */
export function pwCacheHas(prefix: string): boolean {
  for (const d of cache.values()) if (d.painted && pwPrefixOf(d, prefix)) return true;
  return false;
}

const pwPrefixOf = (d: PwAtlasData, p: string) => d.name === p || d.name.startsWith(`${p}-`);

/** Atlases painted (not restored) this session and not yet handed to the store: the store's write queue. */
const unsaved: PwAtlasData[] = [];
let collectUnsaved = false;

/** Collect freshly painted atlases for the persistent store (on while a store is open). */
export function pwCollectUnsaved(on: boolean) {
  collectUnsaved = on;
  if (!on) unsaved.length = 0;
}

/** Take the painted atlases waiting to be persisted (finished jobs only). */
export function pwTakeUnsaved(): PwAtlasData[] {
  const out: PwAtlasData[] = [];
  for (let i = unsaved.length - 1; i >= 0; i--) {
    if (!unsaved[i].painted) continue;
    out.push(unsaved[i]);
    unsaved.splice(i, 1);
  }
  return out;
}

/** Put back atlases taken but not written yet (the next flush takes them). */
export function pwReturnUnsaved(list: PwAtlasData[]) {
  if (collectUnsaved) unsaved.push(...list);
}

function publishStats() {
  // (Captures / bench read the stats from the page.)
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __pixelWorld?: unknown; __pwPaint?: unknown };
    w.__pixelWorld = Object.fromEntries(PW_STATS);
    w.__pwPaint = PW_PAINT_STATS;
  }
}

/** The stored texel format (part of every signature: an atlas kept in another format is repainted). */
export const PW_FORMAT = 2;

/** PixelWorld textures alive now (Game uploads them while a stage loads: no upload hitch in play). */
export const PW_LIVE_TEXTURES = new Set<THREE.Texture>();

/** Debug: the tiles of the last atlas painted, largest first ("key w×h"). */
let lastTiles: string[] = [];
let lastTileMs: string[] = [];
export function PW_DEBUG_TILES(): string[] {
  return lastTiles;
}
/** Debug: paint time per tile of the last atlas painted, slowest first. */
export function PW_DEBUG_TILE_MS(): string[] {
  return lastTileMs;
}

/**
 * Debug / bench hook: the last atlases built (name → stats). `ms` = CPU paint time
 * (0 when reused), `cached` = reused from the session cache or the store, `stored`
 * = came back from the persistent store, `sig` = a hash of the tile list.
 */
export const PW_STATS = new Map<string, { w: number; h: number; tiles: number; bytes: number; ms: number; texels: number; up: number; mips: number; ramps: number; cached: boolean; stored: boolean; sig: string }>();

/** A short hash of a signature (stats, store keys). */
export function pwSigHash(sig: string): string {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < sig.length; i++) {
    const c = sig.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = (Math.imul(b, 33) + c) | 0;
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${sig.length.toString(36)}`;
}

export class PwAtlas {
  private tiles = new Map<string, { tile: PwTile; paint: PwPainter; frames: number }>();
  private data: PwAtlasData | null = null;
  private tex: THREE.DataTexture | null = null;
  private palTex: THREE.DataTexture | null = null;
  /**
   * `levels`: painted levels of a tile at its painted size (default PW_LEVELS; 1 = a backdrop:
   * no mip chain). `upscale: false`: no tile of this atlas is stored at 2× (the default for a
   * one-level atlas: backdrops are painted at the screen's own density).
   */
  constructor(
    readonly name: string,
    readonly o: { levels?: number; maxSize?: number; upscale?: boolean } = {},
  ) {}

  /** Painted levels of a tile at its painted size. */
  get paintedLevels(): number {
    return this.o.levels ?? PW_LEVELS;
  }

  /**
   * Levels of the texture (the shader's coarsest pick): the painted ones, plus one while the
   * atlas holds a dense tile (stored at 2×, or painted at `PW_TPM_MID` or more) — a 2× tile's
   * level 0 is the upscaler's, its painted levels follow. Final once `build()` has run.
   */
  get levels(): number {
    return this.data ? this.data.mips : storedLevels(this.paintedLevels, [...this.tiles.values()]);
  }

  /** Register (or fetch) a tile. Wrap tiles must be multiples of 16 painted texels in both sizes (32 from `PW_TPM_MID` up). */
  tile(key: string, w: number, h: number, paint: PwPainter, o: PwTileOptions = {}): PwTile {
    const hit = this.tiles.get(key);
    if (hit) return hit.tile;
    if (this.data) throw new Error(`pixelworld atlas ${this.name}: tile '${key}' registered after build()`);
    const wrap = !!o.wrap;
    const density = o.density ?? PW_TPM;
    const up = upscaleOn && (this.o.upscale ?? this.paintedLevels > 1) && o.upscale !== false && density < PW_TPM_MID;
    // Every level of a wrap tile must hold a whole number of texels (a tile painted dense has one level more).
    const A = PW_ALIGN * (!up && density >= PW_TPM_MID && this.paintedLevels > 1 ? 2 : 1);
    if (wrap && (w % A || h % A)) throw new Error(`pixelworld: wrap tile '${key}' must be a multiple of ${A} (${w}×${h})`);
    const tile: PwTile = { key, w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)), wrap, density, scale: up ? 2 : 1, x: -1, y: -1 };
    this.tiles.set(key, { tile, paint, frames: Math.max(1, o.frames ?? 1) });
    return tile;
  }

  /**
   * A weathered / altered VARIANT of a registered tile: painted by the base tile's
   * painter with the base tile's RNG seed (same bricks, slabs, cracks), then `post`.
   * Pieces of one surface can switch between variants without a seam (a facade's
   * damp foot band, its drip-stained top band).
   */
  variant(base: PwTile, suffix: string, post: PwPainter): PwTile {
    const def = this.tiles.get(base.key);
    if (!def) throw new Error(`pixelworld: variant of unknown tile '${base.key}'`);
    const paint = def.paint;
    return this.tile(
      `${base.key}|${suffix}`,
      base.w,
      base.h,
      (c, k) => {
        const seeded = { ...k, rng: new PwRng(hashStr(base.key)) };
        paint(c, seeded);
        post(c, { ...k, rng: new PwRng(hashStr(`${base.key}|${suffix}`)) });
      },
      { wrap: base.wrap, density: base.density, upscale: base.scale === 2, frames: def.frames },
    );
  }

  has(key: string): boolean {
    return this.tiles.has(key);
  }

  get(key: string): PwTile | undefined {
    return this.tiles.get(key)?.tile;
  }

  get built(): boolean {
    return !!this.data;
  }

  /** The signature of the registered tile list (the cache / store key). */
  signature(): string {
    return `${this.name}|i${PW_FORMAT}|${this.paintedLevels}|${[...this.tiles.values()].map((t) => `${t.tile.key}:${t.tile.w}x${t.tile.h}${t.tile.wrap ? 'w' : ''}${t.tile.scale === 2 ? `^${t.frames}` : t.tile.density >= PW_TPM_MID ? 'd' : ''}`).join(',')}`;
  }

  /**
   * Lay out every registered tile (rects known on return) and paint them — now, or
   * as a deferred job (`pwDeferPaint`) — or reuse the cached / stored atlas with
   * the same tiles. Rewrites of the painted levels go through `post()`.
   */
  build(): PwAtlasData {
    if (this.data) return this.data;
    const list = [...this.tiles.values()];
    const sig = this.signature();
    let d = cache.get(sig);
    const cached = !!d;
    if (!d) {
      const job = layoutAtlas(this.name, sig, list, this.paintedLevels, this.o.maxSize ?? 4096);
      d = job.data;
      cache.set(sig, d);
      if (collectUnsaved) unsaved.push(d);
      if (deferPaint) jobs.push(job);
      else {
        const t0 = now();
        while (!job.steps.next().done);
        d.ms = now() - t0;
        d.painted = true;
      }
    }
    for (const t of list) {
      const r = d.rects.get(t.tile.key)!;
      t.tile.x = r.x;
      t.tile.y = r.y;
    }
    this.data = d;
    PW_STATS.set(this.name, { w: d.w, h: d.h, tiles: list.length, bytes: d.bytes, ms: cached ? 0 : d.ms, texels: d.texels, up: d.up, mips: d.mips, ramps: Math.max(0, d.pal.length / (PW_PAL_W * 4) - 1), cached, stored: !!d.restored, sig: pwSigHash(sig) });
    publishStats();
    return d;
  }

  /**
   * Run `fn` on the painted levels (a pass that re-makes levels: calm far levels, ink,
   * flame coverage) — at once when painted, else when the deferred paint job ends.
   * Skipped for an atlas the persistent store handed back (stored after its passes).
   * Register right after `build()`, before the stage build returns.
   */
  post(fn: (d: PwAtlasData) => void) {
    const d = this.build();
    if (d.restored) return;
    if (d.painted) fn(d);
    else jobs.find((j) => j.data === d)!.after.push(fn);
  }

  /** The indexed texture (RG8, nearest, hand-made mips; Kit-tracked). Uploaded once painted. */
  texture(): THREE.DataTexture {
    if (this.tex) return this.tex;
    const d = this.build();
    const tex = new THREE.DataTexture(d.levels[0].data, d.w, d.h, THREE.RGFormat, THREE.UnsignedByteType);
    // A deferred paint fills the same arrays in place: upload again once it is done (nothing renders before).
    if (!d.painted) jobs.find((j) => j.data === d)?.after.push(() => (tex.needsUpdate = true));
    // One level (backdrops: painted at the screen's own density, never minified much): no mip chain at all.
    if (d.levels.length > 1) tex.mipmaps = d.levels.map((l) => ({ data: l.data, width: l.width, height: l.height })) as unknown as typeof tex.mipmaps;
    tex.generateMipmaps = false;
    tex.minFilter = d.levels.length > 1 ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    // Indices, not colour: no sRGB decode, and rows of two bytes a texel (odd level widths).
    tex.colorSpace = THREE.NoColorSpace;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    tex.name = `pw:${this.name}`;
    this.tex = Kit.track(tex);
    PW_LIVE_TEXTURES.add(tex);
    tex.addEventListener('dispose', () => {
      PW_LIVE_TEXTURES.delete(tex);
      if (this.tex === tex) this.tex = null;
    });
    return tex;
  }

  /**
   * The palette texture (RGBA8 sRGB, `PW_PAL_W` wide, a row a ramp; Kit-tracked). Made while a
   * deferred paint is still pending it has every row a palette can have (the ramps are only
   * known once the tiles are painted) and is filled when the paint ends.
   */
  palette(): THREE.DataTexture {
    if (this.palTex) return this.palTex;
    const d = this.build();
    const rows = d.painted ? d.pal.length / (PW_PAL_W * 4) : PWI.RAMP + 1;
    const data = d.painted ? d.pal : new Uint8Array(rows * PW_PAL_W * 4);
    const tex = new THREE.DataTexture(data, PW_PAL_W, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    if (!d.painted) {
      jobs.find((j) => j.data === d)?.after.push((x) => {
        data.set(x.pal);
        tex.needsUpdate = true;
      });
    }
    tex.generateMipmaps = false;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.name = `pw:${this.name}:palette`;
    this.palTex = Kit.track(tex);
    PW_LIVE_TEXTURES.add(tex);
    tex.addEventListener('dispose', () => {
      PW_LIVE_TEXTURES.delete(tex);
      if (this.palTex === tex) this.palTex = null;
    });
    return tex;
  }
}

/** Levels of the texture for an atlas of `painted` levels holding `list` (see `PwAtlas.levels`). */
function storedLevels(painted: number, list: { tile: PwTile }[]): number {
  return painted + (list.some((t) => t.tile.scale === 2 || (painted > 1 && t.tile.density >= PW_TPM_MID)) ? 1 : 0);
}

/**
 * One level of one tile at its PAINTED scale — `k` 0 = the texels as painted, 1 = half size… —
 * wherever the atlas stores it (a 2× tile keeps the upscaler's copy one level above). For the
 * passes that re-make levels and for tests: `idx[(y + row) * width + x + col]`, rows bottom-up.
 * Null past the last level that holds texels.
 */
export function pwTileLevel(d: PwAtlasData, t: PwTile, k: number): { idx: Uint16Array; width: number; x: number; y: number } | null {
  const l = k + (t.scale === 2 ? 1 : 0);
  if (l >= d.mips) return null;
  return { idx: d.levels[l].idx, width: d.levels[l].width, x: t.x >> l, y: t.y >> l };
}

/** A level as RGBA8 at the painted tones (look-dev dumps, tests; alpha classes as `PwCanvas.resolve`). */
export function pwLevelRgba(d: PwAtlasData, l: number): Uint8Array {
  return pwIndexToRgba(d.levels[l].idx, d.pal);
}

/** Paint a tile on its own canvas (used by `build()` and by look-dev dumps). */
export function paintTile(key: string, w: number, h: number, paint: PwPainter, pal: PwPalette): PwCanvas {
  const c = new PwCanvas(w, h);
  const rng = new PwRng(hashStr(key));
  paint(c, { pal, rng, ramp: (hex, o) => pal.add(hex, o) });
  return c;
}

/**
 * Lay out an atlas (shelf packing: rects known at once, levels allocated) and return
 * the job that paints it: one step per tile (paint, upscale, copy into its levels),
 * then one per tile and level (the palette-faithful reduction).
 */
function layoutAtlas(name: string, sig: string, list: { tile: PwTile; paint: PwPainter; frames: number }[], painted: number, maxSize: number): PaintJob {
  const levels = storedLevels(painted, list);
  const A = Math.max(1, 1 << (levels - 1));
  // Shelf packing, tallest first, into a power-of-two width (sizes in STORED texels).
  const items = list.map((t) => ({ t, aw: alignUp(t.tile.w * t.tile.scale, A), ah: alignUp(t.tile.h * t.tile.scale, A), x: 0, y: 0 }));
  lastTiles = [...items].sort((a, b) => b.aw * b.ah - a.aw * a.ah).map((it) => `${it.t.tile.key} ${it.aw}×${it.ah}`);
  const area = items.reduce((s, it) => s + it.aw * it.ah, 0);
  const widest = items.reduce((m, it) => Math.max(m, it.aw), A);
  let W = 256;
  while ((W < widest || W * W < area * 1.15) && W < maxSize) W *= 2;
  const order = [...items].sort((a, b) => b.ah - a.ah || b.aw - a.aw);
  let sx = 0;
  let sy = 0;
  let shelf = 0;
  for (const it of order) {
    if (sx + it.aw > W) {
      sx = 0;
      sy += shelf;
      shelf = 0;
    }
    it.x = sx;
    it.y = sy;
    sx += it.aw;
    shelf = Math.max(shelf, it.ah);
  }
  // Height: only aligned (WebGL2 mips any size; a power of two would waste up to half the atlas).
  const H = Math.max(A, alignUp(sy + shelf, Math.max(A, 16)));
  if (W < widest || H > maxSize) throw new Error(`pixelworld atlas '${name}' overflow: ${Math.max(W, widest)}×${sy + shelf} > ${maxSize} (opt far tiles out of the 2× fallback, or split the atlas)`);
  const out: PwLevel[] = [makeLevel(W, H)];
  // Levels: down to 1×1 (those past `levels` stay blank); one level only for backdrops.
  if (levels > 1) {
    for (let l = 1; ; l++) {
      const lw = Math.max(1, W >> l);
      const lh = Math.max(1, H >> l);
      out.push(makeLevel(lw, lh));
      if (lw === 1 && lh === 1) break;
    }
  }
  const rects = new Map<string, { x: number; y: number }>();
  let texels = 0;
  let up = 0;
  for (const it of items) {
    rects.set(it.t.tile.key, { x: it.x, y: it.y });
    texels += it.t.tile.w * it.t.tile.h;
    if (it.t.tile.scale === 2) up++;
  }
  const bytes = out.reduce((s, l) => s + l.data.length, 0);
  const data: PwAtlasData = { name, sig, w: W, h: H, levels: out, mips: levels, pal: new Uint8Array(0), rects, ms: 0, bytes, texels, up, painted: false };
  return { data, steps: paintSteps(items, data, levels), active: 0, after: [] };
}

/**
 * Copy a tile's texels (`src`: `w` × `h`, rows top-down) into a level at (x, y), rows flipped
 * (texture row 0 = the tile's bottom row), filling its aligned rect `aw` × `ah`: a clamp tile
 * extends its last row / column into the gutter (coarse levels never fetch an empty texel), a
 * wrap tile repeats (its coarsest levels stay whole when the rect is wider than the tile).
 */
function putTile(lv: PwLevel, x: number, y: number, src: Uint16Array, w: number, h: number, aw: number, ah: number, wrap: boolean) {
  const dst = lv.idx;
  const W = lv.width;
  for (let ty = 0; ty < ah; ty++) {
    const cy = h - 1 - (wrap ? ty % h : Math.min(ty, h - 1));
    const di = (y + ty) * W + x;
    dst.set(src.subarray(cy * w, cy * w + w), di);
    for (let tx = w; tx < aw; tx++) dst[di + tx] = src[cy * w + (wrap ? tx % w : w - 1)];
  }
}

function* paintSteps(items: { t: { tile: PwTile; paint: PwPainter; frames: number }; aw: number; ah: number; x: number; y: number }[], d: PwAtlasData, levels: number): Generator<void, void, void> {
  const pal = new PwPalette();
  const out = d.levels;
  const tms: [string, number][] = [];
  // Scratch for a tile's texels and its 2× copy (copied into the levels at once): the biggest tile's worth, once.
  const most = items.reduce((m, it) => Math.max(m, it.t.tile.w * it.t.tile.h), 1);
  const texels = new Uint16Array(most);
  const doubled = new Uint16Array(items.some((it) => it.t.tile.scale === 2) ? most * 4 : 0);
  for (const it of items) {
    const { tile, paint, frames } = it.t;
    const tp = now();
    const c = paintTile(tile.key, tile.w, tile.h, paint, pal);
    tms.push([tile.key, now() - tp]);
    c.index(texels);
    if (tile.scale === 2) {
      // Level 0: the upscaler's copy; level 1: the texels exactly as painted.
      putTile(out[0], it.x, it.y, pwUpscale2x(c, tile.wrap, frames, texels, doubled), tile.w * 2, tile.h * 2, it.aw, it.ah, tile.wrap);
      if (levels > 1) putTile(out[1], it.x >> 1, it.y >> 1, texels, tile.w, tile.h, it.aw >> 1, it.ah >> 1, tile.wrap);
    } else putTile(out[0], it.x, it.y, texels, tile.w, tile.h, it.aw, it.ah, tile.wrap);
    yield;
  }
  lastTileMs = tms.sort((a, b) => b[1] - a[1]).map(([k, ms]) => `${ms.toFixed(1)} ms  ${k}`);
  d.pal = pal.rows();
  d.bytes += d.pal.length;
  // Levels: per tile rect, palette-faithful 2×2 reduction (a tile's chain at a time), from the painted texels down.
  for (const it of items) {
    for (let l = it.t.tile.scale === 2 ? 2 : 1; l < levels && l < out.length; l++) reduceRect(out[l - 1].idx, out[l - 1].width, out[l].idx, out[l].width, it.x >> l, it.y >> l, it.aw >> l, it.ah >> l, d.pal);
    yield;
  }
}

/**
 * One level down inside a rect: each output texel is the source texel (of the
 * 2×2) nearest their average colour, among the class (cut / glow / lit) most of
 * them share — glow winning ties and a lone glow texel over cut-out, so neon
 * and lit windows keep reading at a distance. `pal`: the palette rows (colours).
 */
function reduceRect(src: Uint16Array, sw: number, dst: Uint16Array, dw: number, x0: number, y0: number, w: number, h: number, pal: Uint8Array) {
  const RAMP = PWI.RAMP;
  const GLOW = PWI.GLOW;
  for (let y = 0; y < h; y++) {
    let i0 = (y0 + y) * 2 * sw + x0 * 2;
    let di = (y0 + y) * dw + x0;
    for (let x = 0; x < w; x++, i0 += 2, di++) {
      const t0 = src[i0];
      const t1 = src[i0 + 1];
      const t2 = src[i0 + sw];
      const t3 = src[i0 + sw + 1];
      // (Most blocks are one texel four times.)
      if (t0 === t1 && t0 === t2 && t0 === t3) {
        dst[di] = t0;
        continue;
      }
      // Classes: 0 = cut out, 1 = glow, 2 = lit.
      const c0 = t0 & RAMP ? (t0 & GLOW ? 1 : 2) : 0;
      const c1 = t1 & RAMP ? (t1 & GLOW ? 1 : 2) : 0;
      const c2 = t2 & RAMP ? (t2 & GLOW ? 1 : 2) : 0;
      const c3 = t3 & RAMP ? (t3 & GLOW ? 1 : 2) : 0;
      const cut = (c0 === 0 ? 1 : 0) + (c1 === 0 ? 1 : 0) + (c2 === 0 ? 1 : 0) + (c3 === 0 ? 1 : 0);
      const lit = (c0 === 2 ? 1 : 0) + (c1 === 2 ? 1 : 0) + (c2 === 2 ? 1 : 0) + (c3 === 2 ? 1 : 0);
      const glow = 4 - cut - lit;
      // Light sources survive the distance: a glowing texel (a 1-texel neon tube, a
      // star, a lit window) beats the cut-out around it and wins ties with lit.
      if (cut >= 3 && glow === 0) {
        dst[di] = 0;
        continue;
      }
      // Otherwise the class most of the four share.
      const want = glow > 0 && glow >= lit ? 1 : 2;
      let n = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      const p0 = pwPalAt(t0);
      const p1 = pwPalAt(t1);
      const p2 = pwPalAt(t2);
      const p3 = pwPalAt(t3);
      if (c0 === want) (r += pal[p0]), (g += pal[p0 + 1]), (b += pal[p0 + 2]), n++;
      if (c1 === want) (r += pal[p1]), (g += pal[p1 + 1]), (b += pal[p1 + 2]), n++;
      if (c2 === want) (r += pal[p2]), (g += pal[p2 + 1]), (b += pal[p2 + 2]), n++;
      if (c3 === want) (r += pal[p3]), (g += pal[p3 + 1]), (b += pal[p3 + 2]), n++;
      r /= n;
      g /= n;
      b /= n;
      // The texel nearest that average: a real texel of the tile, never a blend.
      let best = t0;
      let bd = Infinity;
      if (c0 === want) {
        const dd = (pal[p0] - r) ** 2 + (pal[p0 + 1] - g) ** 2 + (pal[p0 + 2] - b) ** 2;
        if (dd < bd) (bd = dd), (best = t0);
      }
      if (c1 === want) {
        const dd = (pal[p1] - r) ** 2 + (pal[p1 + 1] - g) ** 2 + (pal[p1 + 2] - b) ** 2;
        if (dd < bd) (bd = dd), (best = t1);
      }
      if (c2 === want) {
        const dd = (pal[p2] - r) ** 2 + (pal[p2 + 1] - g) ** 2 + (pal[p2 + 2] - b) ** 2;
        if (dd < bd) (bd = dd), (best = t2);
      }
      if (c3 === want) {
        const dd = (pal[p3] - r) ** 2 + (pal[p3 + 1] - g) ** 2 + (pal[p3 + 2] - b) ** 2;
        if (dd < bd) (bd = dd), (best = t3);
      }
      dst[di] = best;
    }
  }
}

/** Clear the painted-atlas cache (tests). */
export function clearPwCache() {
  cache.clear();
  jobs.length = 0;
  unsaved.length = 0;
}
