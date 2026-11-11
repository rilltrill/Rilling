import * as THREE from 'three';
import { makeFigureRenderer } from './figure';
import type { FigureDef } from './outfits';
import { RAMP_TONES } from './raster';
import { J, type PoseKey, type ViewId } from './skeleton';
import { RAMPS, rampColors } from './palette';
import { POSE_INDEX } from './poses';

/**
 * DRAWN FIGURES in the game: the indexed sprite atlas (docs/PIXELWORLD3.md, "Display"). Frames are
 * rasterised on the CPU at the exact on-screen size (1 sprite texel = 1 frame pixel), cached by
 * (figure, pose, frame, view, size, head offset, damage) in a shelf atlas with shelf-level LRU; at
 * most a few rasters run per frame, the rest wait and show the nearest cached size meanwhile. The
 * texture holds palette indices (one byte per texel): a stage's step-lighting is a colour lookup,
 * no frame is ever repainted for it.
 */

export const ATLAS_SIZE = 2048;
const ATLAS = ATLAS_SIZE;
/** Most rasters a frame (each ≈ 1 ms at the biggest size: the rest wait a frame or two). */
export const MAX_RASTERS = 3;
/** Whole figure texels tall (above: texels double). */
export const MAX_FIGURE_PX = 440;
const SHELF_STEP = 16;

/** Figure sizes come in steps: 2 px at figures up to 100 tall, then 4. */
export function sizeStep(px: number): number {
  return px < 100 ? Math.max(20, Math.round(px / 2) * 2) : Math.round(px / 4) * 4;
}

/** A frame the figure system was asked to show (the entity fills this; no allocation per redraw). */
export interface DrawnQuery {
  def: FigureDef | null;
  frames: readonly PoseKey[] | null;
  frame: number;
  /** 0..31: bit 0-1 left arm, 2-3 right arm (0 whole, 1 forearm gone, 2 arm gone), bit 4 headless. */
  flags: number;
  /** Rig scale (height relative to the 1.78 m rig). */
  scale: number;
  /** World positions of the rig's head centre and chest, for aim-fair placement. */
  head: THREE.Vector3;
  chest: THREE.Vector3;
  /** Keep the current view (while falling the rig's axes say nothing about facing). */
  lockView: boolean;
}

export function newDrawnQuery(): DrawnQuery {
  return { def: null, frames: null, frame: 0, flags: 0, scale: 1, head: new THREE.Vector3(), chest: new THREE.Vector3(), lockView: false };
}

interface Entry {
  key: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ground point, sprite texels from the left / top of the unflipped image. */
  gx: number;
  gy: number;
  shelf: Shelf;
  /** Frame last used. */
  used: number;
}

interface Shelf {
  y: number;
  h: number;
  x: number;
  entries: Entry[];
  /** Frame any of its entries was last used (LRU evicts the whole shelf). */
  last: number;
}

/** Per-sprite state: the current view's hysteresis. */
export interface DrawnSprite {
  view: ViewId;
  mirror: boolean;
}

export function newDrawnSprite(): DrawnSprite {
  return { view: 0, mirror: false };
}

export class DrawnCast {
  readonly atlas: THREE.DataTexture;
  readonly palette: THREE.DataTexture;
  private data = new Uint8Array(ATLAS * ATLAS);
  private pal = new Uint8Array(RAMP_TONES * RAMPS.length * 4);
  private colors = rampColors();
  private renderer: THREE.WebGLRenderer;
  private fig = makeFigureRenderer();
  private entries = new Map<number, Entry>();
  private shelves: Shelf[] = [];
  private nextShelfY = 0;
  private upload = new Uint8Array(480 * 480);
  private frame = 0;
  private atlasReady = false;
  /** Rasters this frame. */
  rasters = 0;
  // Stats.
  stats = { rasters: 0, hits: 0, misses: 0, near: 0, rasterMs: 0, entries: 0 };

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const t = new THREE.DataTexture(this.data, ATLAS, ATLAS, THREE.RedFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    this.atlas = t;
    const p = new THREE.DataTexture(this.pal, RAMP_TONES, RAMPS.length, THREE.RGBAFormat, THREE.UnsignedByteType);
    p.minFilter = THREE.NearestFilter;
    p.magFilter = THREE.NearestFilter;
    p.colorSpace = THREE.NoColorSpace;
    p.needsUpdate = true;
    this.palette = p;
    this.setStageLight(0, 0);
  }

  /** The stage's colour lookup: `step` whole tones for everything but the ink; ramps darker than `floor` (display luma) stay. */
  setStageLight(step: number, floor: number) {
    const c = this.colors;
    const n = RAMPS.length;
    for (let r = 0; r < n; r++) {
      const base = c[r * RAMP_TONES + 3];
      const lum = (0.2126 * ((base >> 16) & 255) + 0.7152 * ((base >> 8) & 255) + 0.0722 * (base & 255)) / 255;
      const s = lum < floor ? 0 : step;
      for (let t = 0; t < RAMP_TONES; t++) {
        const tt = t === 0 ? 0 : Math.max(1, Math.min(RAMP_TONES - 1, t + s));
        const col = c[r * RAMP_TONES + tt];
        const i = (r * RAMP_TONES + t) * 4;
        this.pal[i] = (col >> 16) & 255;
        this.pal[i + 1] = (col >> 8) & 255;
        this.pal[i + 2] = col & 255;
        this.pal[i + 3] = 255;
      }
    }
    this.palette.needsUpdate = true;
  }

  /** Start of a frame: the raster budget. */
  beginFrame() {
    this.frame++;
    this.rasters = 0;
  }

  /** Bytes used on the GPU. */
  bytes(): number {
    return ATLAS * ATLAS + RAMP_TONES * RAMPS.length * 4;
  }

  private static key(fig: number, pose: number, frame: number, view: number, size: number, hx: number, hy: number, flags: number): number {
    return size + 1000 * (fig + 16 * (pose + 32 * (frame + 16 * (view + 8 * (hx + 16 * (hy + 16 * flags))))));
  }

  /** Puts a shelf for a figure `h` tall; may evict the least recently used shelf. */
  private shelfFor(w: number, h: number): Shelf | null {
    const H = Math.ceil(h / SHELF_STEP) * SHELF_STEP;
    let best: Shelf | null = null;
    for (const s of this.shelves) {
      if (s.h >= H && s.h < H + SHELF_STEP * 2 && s.x + w <= ATLAS && (!best || s.h < best.h)) best = s;
    }
    if (best) return best;
    if (this.nextShelfY + H <= ATLAS) {
      const s: Shelf = { y: this.nextShelfY, h: H, x: 0, entries: [], last: this.frame };
      this.nextShelfY += H;
      this.shelves.push(s);
      return s;
    }
    // Evict the least recently used shelf (of a height that fits).
    let lru: Shelf | null = null;
    for (const s of this.shelves) if (s.h >= H && (!lru || s.last < lru.last)) lru = s;
    if (!lru) return null;
    for (const e of lru.entries) this.entries.delete(e.key);
    lru.entries.length = 0;
    lru.x = 0;
    lru.last = this.frame;
    return lru;
  }

  /** Raster `def` into the atlas. Null when no budget or no space. */
  private raster(key: number, def: FigureDef, pose: PoseKey, view: ViewId, size: number, hx: number, hy: number, flags: number): Entry | null {
    const t0 = performance.now();
    const f = this.fig;
    f.paint(def, pose, view, size, hx, hy, flags);
    const { canvas, d } = f;
    const w = canvas.x1 - canvas.x0 + 1;
    const h = canvas.y1 - canvas.y0 + 1;
    if (w <= 0 || h <= 0) return null;
    const shelf = this.shelfFor(w, h);
    if (!shelf || shelf.x + w > ATLAS) return null;
    const x = shelf.x;
    const y = shelf.y;
    shelf.x += w + 1;
    // Copy into the upload buffer and the CPU image (the DataTexture's own data for a context restore).
    const src = canvas.idx;
    const cw = canvas.w;
    const up = this.upload;
    let k = 0;
    const data = this.data;
    for (let j = 0; j < h; j++) {
      const row = (j + canvas.y0) * cw + canvas.x0;
      const dst = (y + j) * ATLAS + x;
      for (let i = 0; i < w; i++) {
        const v = src[row + i];
        up[k++] = v;
        data[dst + i] = v;
      }
    }
    this.uploadRegion(x, y, w, h);
    const e: Entry = { key, x, y, w, h, gx: d.cx - canvas.x0, gy: d.cy - canvas.y0, shelf, used: this.frame };
    shelf.entries.push(e);
    this.entries.set(key, e);
    this.rasters++;
    this.stats.rasters++;
    this.stats.rasterMs += performance.now() - t0;
    this.stats.entries = this.entries.size;
    return e;
  }

  private uploadRegion(x: number, y: number, w: number, h: number) {
    const r = this.renderer;
    const gl = r.getContext() as WebGL2RenderingContext;
    if (!this.atlasReady) {
      r.initTexture(this.atlas);
      this.atlasReady = true;
    }
    const tex = r.properties.get(this.atlas) as { __webglTexture: WebGLTexture };
    r.state.bindTexture(gl.TEXTURE_2D, tex.__webglTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED, gl.UNSIGNED_BYTE, this.upload, 0);
    r.state.reset(); // (three re-binds what it needs; its texture cache must not believe this one is still bound)
  }

  /**
   * The frame to show for a query: the exact one, or one rastered now while there is budget; else
   * the nearest cached size of the same drawing (null only if nothing like it has been drawn yet).
   */
  frameFor(q: DrawnQuery, frames: readonly PoseKey[], fig: number, poseId: number, frameIndex: number, view: ViewId, size: number, hx: number, hy: number): Entry | null {
    const flags = q.flags;
    const key = DrawnCast.key(fig, poseId, frameIndex, view, size, hx, hy, flags);
    const hit = this.entries.get(key);
    if (hit) {
      this.stats.hits++;
      hit.used = this.frame;
      hit.shelf.last = this.frame;
      return hit;
    }
    this.stats.misses++;
    if (this.rasters < MAX_RASTERS) {
      const e = this.raster(key, q.def!, frames[frameIndex], view, size, hx, hy, flags);
      if (e) return e;
    }
    // Nearest cached size of this drawing.
    for (let d = 1; d <= 24; d++) {
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const sz = size + d * 2 * sgn;
        if (sz < 20) continue;
        const near = this.entries.get(DrawnCast.key(fig, poseId, frameIndex, view, sz, hx, hy, flags));
        if (near) {
          this.stats.near++;
          near.used = this.frame;
          near.shelf.last = this.frame;
          return near;
        }
      }
    }
    return null;
  }

  /** Pose joints for placement (the skeleton of the pose that would be rastered). */
  joints(pose: PoseKey, view: ViewId) {
    return this.fig.pose(pose, view);
  }

  dispose() {
    this.atlas.dispose();
    this.palette.dispose();
  }
}

export function poseIdOf(frames: readonly PoseKey[]): number {
  return POSE_INDEX.get(frames) ?? 0;
}

export { J as DRAWN_J };
