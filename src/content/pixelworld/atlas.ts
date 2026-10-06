import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { PW_ALIGN, PW_LEVELS, PW_TPM, PwCanvas, PwPalette, PwRng } from './canvas';

/**
 * PixelWorld atlas: every painted tile a stage uses (tileable surfaces, window /
 * door / shopfront modules, signs, decals, prop cut-outs) packed into ONE RGBA8
 * texture with hand-made mip levels.
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
 *  - Rects are aligned to PW_ALIGN (16) texels, so every one of the PW_LEVELS
 *    (5) levels of every tile stays inside its own rect: no bleeding, and
 *    tileable surfaces wrap inside their rect in the shader.
 *  - Mips are made per tile, palette-faithful: each level texel is the source
 *    texel nearest the 2×2 average (a real ramp colour, never a blurred blend),
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
  /** Texels per metre when laid on a surface (default PW_TPM). */
  readonly density: number;
  /**
   * A NEUTRAL tile (painted round a light grey): the colour comes from the vertex
   * tint (`retexture` sets it from each material), so one painted tile serves every
   * car, crate and pipe colour. Holds the painted base colour (sRGB hex).
   */
  neutral?: number;
  /** Atlas position (level-0 texels, bottom-left; set by `build()`). */
  x: number;
  y: number;
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
  /** RGBA8 levels (rows bottom-up), level 0 first, down to 1×1 (levels ≥ PW_LEVELS blank). */
  levels: { data: Uint8Array; width: number; height: number }[];
  /** Tile rects by key. */
  rects: Map<string, { x: number; y: number }>;
  /** CPU ms painting + packing + mips. */
  ms: number;
  /** GPU bytes (all levels). */
  bytes: number;
  /** Texels painted (level 0, tiles only). */
  texels: number;
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
      if (st && st.sig === pwSigHash(j.data.sig)) st.ms = j.active;
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
export const PW_STATS = new Map<string, { w: number; h: number; tiles: number; bytes: number; ms: number; texels: number; cached: boolean; stored: boolean; sig: string }>();

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
  private tiles = new Map<string, { tile: PwTile; paint: PwPainter }>();
  private data: PwAtlasData | null = null;
  private tex: THREE.DataTexture | null = null;
  constructor(
    readonly name: string,
    readonly o: { levels?: number; maxSize?: number } = {},
  ) {}

  get levels(): number {
    return this.o.levels ?? PW_LEVELS;
  }

  /** Register (or fetch) a tile. Wrap tiles must be multiples of PW_ALIGN in both sizes. */
  tile(key: string, w: number, h: number, paint: PwPainter, o: { wrap?: boolean; density?: number } = {}): PwTile {
    const hit = this.tiles.get(key);
    if (hit) return hit.tile;
    if (this.data) throw new Error(`pixelworld atlas ${this.name}: tile '${key}' registered after build()`);
    const wrap = !!o.wrap;
    if (wrap && (w % PW_ALIGN || h % PW_ALIGN)) throw new Error(`pixelworld: wrap tile '${key}' must be a multiple of ${PW_ALIGN} (${w}×${h})`);
    const tile: PwTile = { key, w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)), wrap, density: o.density ?? PW_TPM, x: -1, y: -1 };
    this.tiles.set(key, { tile, paint });
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
      { wrap: base.wrap, density: base.density },
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
    return `${this.name}|${this.levels}|${[...this.tiles.values()].map((t) => `${t.tile.key}:${t.tile.w}x${t.tile.h}${t.tile.wrap ? 'w' : ''}`).join(',')}`;
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
      const job = layoutAtlas(this.name, sig, list, this.levels, this.o.maxSize ?? 4096);
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
    PW_STATS.set(this.name, { w: d.w, h: d.h, tiles: list.length, bytes: d.bytes, ms: cached ? 0 : d.ms, texels: d.texels, cached, stored: !!d.restored, sig: pwSigHash(sig) });
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

  /** The GPU texture (nearest, hand-made mips; Kit-tracked). Uploaded once painted. */
  texture(): THREE.DataTexture {
    if (this.tex) return this.tex;
    const d = this.build();
    const tex = new THREE.DataTexture(d.levels[0].data, d.w, d.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    // A deferred paint fills the same arrays in place: upload again once it is done (nothing renders before).
    if (!d.painted) jobs.find((j) => j.data === d)?.after.push(() => (tex.needsUpdate = true));
    // One level (backdrops: painted at the screen's own density, never minified much): no mip chain at all.
    if (d.levels.length > 1) tex.mipmaps = d.levels.map((l) => ({ data: l.data, width: l.width, height: l.height })) as unknown as typeof tex.mipmaps;
    tex.generateMipmaps = false;
    tex.minFilter = d.levels.length > 1 ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.unpackAlignment = 4;
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
 * the job that paints it: one step per tile (paint, resolve, copy into level 0),
 * then one per tile and level (the palette-faithful reduction).
 */
function layoutAtlas(name: string, sig: string, list: { tile: PwTile; paint: PwPainter }[], levels: number, maxSize: number): PaintJob {
  const A = Math.max(1, 1 << (levels - 1));
  // Shelf packing, tallest first, into a power-of-two width.
  const items = list.map((t) => ({ t, aw: alignUp(t.tile.w, A), ah: alignUp(t.tile.h, A), x: 0, y: 0 }));
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
  if (H > maxSize) throw new Error(`pixelworld atlas overflow: ${W}×${sy + shelf} > ${maxSize}`);
  const out: PwAtlasData['levels'] = [{ data: new Uint8Array(W * H * 4), width: W, height: H }];
  // Levels: down to 1×1 (those past `levels` stay blank); one level only for backdrops.
  if (levels > 1) {
    for (let l = 1; ; l++) {
      const lw = Math.max(1, W >> l);
      const lh = Math.max(1, H >> l);
      out.push({ data: new Uint8Array(lw * lh * 4), width: lw, height: lh });
      if (lw === 1 && lh === 1) break;
    }
  }
  const rects = new Map<string, { x: number; y: number }>();
  let texels = 0;
  for (const it of items) {
    rects.set(it.t.tile.key, { x: it.x, y: it.y });
    texels += it.t.tile.w * it.t.tile.h;
  }
  const bytes = out.reduce((s, l) => s + l.data.length, 0);
  const data: PwAtlasData = { name, sig, w: W, h: H, levels: out, rects, ms: 0, bytes, texels, painted: false };
  return { data, steps: paintSteps(items, out, W, levels), active: 0, after: [] };
}

function* paintSteps(items: { t: { tile: PwTile; paint: PwPainter }; aw: number; ah: number; x: number; y: number }[], out: PwAtlasData['levels'], W: number, levels: number): Generator<void, void, void> {
  const pal = new PwPalette();
  const L0 = out[0].data;
  const tms: [string, number][] = [];
  for (const it of items) {
    const { tile, paint } = it.t;
    const tp = now();
    const c = paintTile(tile.key, tile.w, tile.h, paint, pal);
    tms.push([tile.key, now() - tp]);
    const rgba = c.resolve(pal);
    // Copy rows flipped (texture row 0 = the tile's bottom row); clamp tiles extend their last row /
    // column into the alignment gutter (coarse levels never fetch an empty texel).
    const rowBytes = tile.w * 4;
    for (let ty = 0; ty < it.ah; ty++) {
      if (ty >= tile.h && tile.wrap) break;
      const cy = tile.h - 1 - Math.min(ty, tile.h - 1);
      const di = ((it.y + ty) * W + it.x) * 4;
      L0.set(rgba.subarray(cy * rowBytes, cy * rowBytes + rowBytes), di);
      if (!tile.wrap && it.aw > tile.w) {
        const last = cy * rowBytes + rowBytes - 4;
        for (let tx = tile.w; tx < it.aw; tx++) L0.set(rgba.subarray(last, last + 4), di + tx * 4);
      }
    }
    yield;
  }
  lastTileMs = tms.sort((a, b) => b[1] - a[1]).map(([k, ms]) => `${ms.toFixed(1)} ms  ${k}`);
  // Levels: per tile rect, palette-faithful 2×2 reduction (a tile's chain at a time).
  if (levels <= 1) return;
  for (const it of items) {
    for (let l = 1; l < levels && l < out.length; l++) reduceRect(out[l - 1].data, out[l - 1].width, out[l].data, out[l].width, it.x >> l, it.y >> l, it.aw >> l, it.ah >> l);
    yield;
  }
}

/**
 * One level down inside a rect: each output texel is the source texel (of the
 * 2×2) nearest their average colour, among the class (cut / glow / lit) most of
 * them share — glow winning ties and a lone glow texel over cut-out, so neon
 * and lit windows keep reading at a distance.
 */
function reduceRect(src: Uint8Array, sw: number, dst: Uint8Array, dw: number, x0: number, y0: number, w: number, h: number) {
  for (let y = 0; y < h; y++) {
    const sy = (y0 + y) * 2;
    for (let x = 0; x < w; x++) {
      const sx = (x0 + x) * 2;
      const i0 = (sy * sw + sx) * 4;
      const i1 = i0 + 4;
      const i2 = i0 + sw * 4;
      const i3 = i2 + 4;
      const a0 = src[i0 + 3];
      const a1 = src[i1 + 3];
      const a2 = src[i2 + 3];
      const a3 = src[i3 + 3];
      const di = ((y0 + y) * dw + x0 + x) * 4;
      const cut = (a0 === 0 ? 1 : 0) + (a1 === 0 ? 1 : 0) + (a2 === 0 ? 1 : 0) + (a3 === 0 ? 1 : 0);
      const lit = (a0 === 255 ? 1 : 0) + (a1 === 255 ? 1 : 0) + (a2 === 255 ? 1 : 0) + (a3 === 255 ? 1 : 0);
      const glow = 4 - cut - lit;
      // Light sources survive the distance: a glowing texel (a 1-texel neon tube, a
      // star, a lit window) beats the cut-out around it and wins ties with lit.
      if (cut >= 3 && glow === 0) {
        dst[di] = dst[di + 1] = dst[di + 2] = dst[di + 3] = 0;
        continue;
      }
      // Otherwise the class most of the four share.
      const want = glow > 0 && glow >= lit ? 1 : 255;
      const ok0 = want === 255 ? a0 === 255 : a0 !== 0 && a0 !== 255;
      const ok1 = want === 255 ? a1 === 255 : a1 !== 0 && a1 !== 255;
      const ok2 = want === 255 ? a2 === 255 : a2 !== 0 && a2 !== 255;
      const ok3 = want === 255 ? a3 === 255 : a3 !== 0 && a3 !== 255;
      let n = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      if (ok0) (r += src[i0]), (g += src[i0 + 1]), (b += src[i0 + 2]), n++;
      if (ok1) (r += src[i1]), (g += src[i1 + 1]), (b += src[i1 + 2]), n++;
      if (ok2) (r += src[i2]), (g += src[i2 + 1]), (b += src[i2 + 2]), n++;
      if (ok3) (r += src[i3]), (g += src[i3 + 1]), (b += src[i3 + 2]), n++;
      r /= n;
      g /= n;
      b /= n;
      // The texel nearest that average: a real ramp colour, never a blend.
      let best = i0;
      let bd = Infinity;
      const near = (i: number, ok: boolean) => {
        if (!ok) return;
        const dr = src[i] - r;
        const dg = src[i + 1] - g;
        const db = src[i + 2] - b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) {
          bd = d;
          best = i;
        }
      };
      near(i0, ok0);
      near(i1, ok1);
      near(i2, ok2);
      near(i3, ok3);
      dst[di] = src[best];
      dst[di + 1] = src[best + 1];
      dst[di + 2] = src[best + 2];
      dst[di + 3] = src[best + 3];
    }
  }
}

/** Clear the painted-atlas cache (tests). */
export function clearPwCache() {
  cache.clear();
  jobs.length = 0;
  unsaved.length = 0;
}
