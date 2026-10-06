import * as THREE from 'three';
import { Kit } from '../kit/ModelKit';
import { PW_ALIGN, PW_LEVELS, PW_TPM, PwCanvas, PwPalette, PwRng } from './canvas';

/**
 * PixelWorld atlas: every painted tile a stage uses (tileable surfaces, window /
 * door / shopfront modules, signs, decals, prop cut-outs) packed into ONE RGBA8
 * texture with hand-made mip levels.
 *
 *  - Tiles are REGISTERED while the stage builds (`tile(key, w, h, paint)` →
 *    a handle; the same key returns the same tile), PAINTED once in `build()`
 *    (deterministic: the painter's RNG is seeded by the tile key), and the
 *    painted atlas is cached by its tile list, so a RETRY / RESTART reuses it.
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

/** Debug / bench hook: the last atlases built (name → stats). */
export const PW_STATS = new Map<string, { w: number; h: number; tiles: number; bytes: number; ms: number; texels: number; cached: boolean }>();

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

  /** Paint and pack every registered tile (or reuse the cached atlas with the same tiles). */
  build(): PwAtlasData {
    if (this.data) return this.data;
    const list = [...this.tiles.values()];
    const sig = `${this.name}|${this.levels}|${list.map((t) => `${t.tile.key}:${t.tile.w}x${t.tile.h}${t.tile.wrap ? 'w' : ''}`).join(',')}`;
    let d = cache.get(sig);
    const cached = !!d;
    if (!d) {
      d = paintAtlas(list, this.levels, this.o.maxSize ?? 4096);
      cache.set(sig, d);
    }
    for (const t of list) {
      const r = d.rects.get(t.tile.key)!;
      t.tile.x = r.x;
      t.tile.y = r.y;
    }
    this.data = d;
    PW_STATS.set(this.name, { w: d.w, h: d.h, tiles: list.length, bytes: d.bytes, ms: cached ? 0 : d.ms, texels: d.texels, cached });
    // (Captures / bench read the stats from the page.)
    if (typeof window !== 'undefined') (window as unknown as { __pixelWorld?: unknown }).__pixelWorld = Object.fromEntries(PW_STATS);
    return d;
  }

  /** The GPU texture (nearest, hand-made mips; Kit-tracked). */
  texture(): THREE.DataTexture {
    if (this.tex) return this.tex;
    const d = this.build();
    const tex = new THREE.DataTexture(d.levels[0].data, d.w, d.h, THREE.RGBAFormat, THREE.UnsignedByteType);
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
    tex.addEventListener('dispose', () => {
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

function paintAtlas(list: { tile: PwTile; paint: PwPainter }[], levels: number, maxSize: number): PwAtlasData {
  const t0 = now();
  const pal = new PwPalette();
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
  const L0 = new Uint8Array(W * H * 4);
  let texels = 0;
  const rects = new Map<string, { x: number; y: number }>();
  const tms: [string, number][] = [];
  for (const it of items) {
    const { tile, paint } = it.t;
    const tp = now();
    const c = paintTile(tile.key, tile.w, tile.h, paint, pal);
    tms.push([tile.key, now() - tp]);
    const rgba = c.resolve(pal);
    texels += tile.w * tile.h;
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
    rects.set(tile.key, { x: it.x, y: it.y });
  }
  lastTileMs = tms.sort((a, b) => b[1] - a[1]).map(([k, ms]) => `${ms.toFixed(1)} ms  ${k}`);
  // Levels: per tile rect, palette-faithful 2×2 reduction.
  const out: PwAtlasData['levels'] = [{ data: L0, width: W, height: H }];
  if (levels <= 1) return { w: W, h: H, levels: out, rects, ms: now() - t0, bytes: L0.length, texels };
  let prev = L0;
  let pw = W;
  for (let l = 1; ; l++) {
    const lw = Math.max(1, W >> l);
    const lh = Math.max(1, H >> l);
    const data = new Uint8Array(lw * lh * 4);
    if (l < levels) {
      for (const it of items) reduceRect(prev, pw, data, lw, it.x >> l, it.y >> l, it.aw >> l, it.ah >> l);
    }
    out.push({ data, width: lw, height: lh });
    prev = data;
    pw = lw;
    if (lw === 1 && lh === 1) break;
  }
  const bytes = out.reduce((s, l) => s + l.data.length, 0);
  return { w: W, h: H, levels: out, rects, ms: now() - t0, bytes, texels };
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
}
