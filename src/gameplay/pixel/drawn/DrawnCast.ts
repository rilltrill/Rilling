import * as THREE from 'three';
import { lodFor, makeFigureRenderer } from './figure';
import type { FigureDef } from './outfits';
import { MAX_CANVAS, RAMP_TONES } from './raster';
import { HEADS, J, type PoseKey, type ViewId } from './skeleton';
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

const _rp = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
/** Most rasters a frame (each ≈ 1 ms at the biggest size: the rest wait a frame or two). */
export const MAX_RASTERS = 3;
/** Milliseconds of rastering a frame may spend (the first raster always runs). */
const RASTER_BUDGET_MS = 2.5;
/** Whole figure texels tall (above: texels double). */
export const MAX_FIGURE_PX = 440;
const SHELF_STEP = 16;
/** Neck bend past this (hu) is taken by moving the whole sprite: a head pulled off its neck is the worst of the two errors. */
const NECK_BEND = 0.35;
/** Most the drawn head may sink into the neck, and stretch out of it (hu). */
const NECK_DOWN = 0.15;
const NECK_UP = 0.2;
/** Head-offset buckets a redraw may travel: a state change must not snap the head across the neck. */
const HEAD_TRAVEL = 2;

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
  /**
   * The rig's arm angles (degrees; swing forward, outward, elbow flex), when the drawn arms should
   * follow it: seen from the side the arms cross the torso (a hit there is a limb hit on the
   * rig), and in a windup the reach has to be where the hands are. `armsAlways`: in every view.
   */
  armsFromRig: boolean;
  armsAlways: boolean;
  aL: [number, number, number];
  aR: [number, number, number];
  /** The rig takes no more hits: the head stays where the drawing puts it instead of following the falling rig. */
  free: boolean;
}

const DEG = 180 / Math.PI;

/** Reads the rig's arm rotations into a query: same axes as the hand-drawn keyframes (a forward swing is the rig's negative x rotation). */
export function rigArms(q: DrawnQuery, armL: { shoulder: THREE.Object3D; elbow: THREE.Object3D }, armR: { shoulder: THREE.Object3D; elbow: THREE.Object3D }) {
  q.aL[0] = -armL.shoulder.rotation.x * DEG;
  q.aL[1] = armL.shoulder.rotation.z * DEG;
  q.aL[2] = -armL.elbow.rotation.x * DEG;
  q.aR[0] = -armR.shoulder.rotation.x * DEG;
  q.aR[1] = -armR.shoulder.rotation.z * DEG;
  q.aR[2] = -armR.elbow.rotation.x * DEG;
  q.armsFromRig = true;
}

/** Arm-angle buckets for the cache key: 20° steps are finer than a sprite's arm can show at these sizes. */
function bucket(v: number, lo: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.round((v - lo) / 20)));
}

/** The sprite's own pose: `key` with its arms replaced by the query's rig arms (quantised). */
function withRigArms(key: PoseKey, q: DrawnQuery, st: DrawnSprite): PoseKey {
  const pk = st.scratch;
  Object.assign(pk, ZERO_POSE, key);
  const aL = st.scratchL;
  const aR = st.scratchR;
  aL[0] = bucket(q.aL[0], -60, 12) * 20 - 60;
  aL[1] = key.aL?.[1] ?? 10;
  aL[2] = bucket(q.aL[2], 0, 8) * 20;
  aL[3] = key.aL?.[3] ?? 0;
  aR[0] = bucket(q.aR[0], -60, 12) * 20 - 60;
  aR[1] = key.aR?.[1] ?? 10;
  aR[2] = bucket(q.aR[2], 0, 8) * 20;
  aR[3] = key.aR?.[3] ?? 0;
  pk.aL = aL;
  pk.aR = aR;
  return pk;
}

const projX = (P: ArrayLike<number>, gw: number, x: number, z: number) => (((P[0] * x + P[8] * z) / -z) * 0.5 + 0.5) * gw;
const projY = (P: ArrayLike<number>, gh: number, y: number, z: number) => (((P[5] * y + P[9] * z) / -z) * 0.5 + 0.5) * gh;

const ZERO_POSE: PoseKey = { px: 0, py: 0, pz: 0, lean: 0, tilt: 0, turn: 0, sLean: 0, sTilt: 0, sTurn: 0, cLean: 0, cTilt: 0, cTurn: 0, hPitch: 0, hRoll: 0, hYaw: 0, noGround: false };


export function newDrawnQuery(): DrawnQuery {
  return { def: null, frames: null, frame: 0, flags: 0, scale: 1, head: new THREE.Vector3(), chest: new THREE.Vector3(), lockView: false, armsFromRig: false, armsAlways: false, aL: [0, 0, 0], aR: [0, 0, 0], free: false };
}

interface Entry {
  /** The two halves of the cache key (small integers: `Map` lookups stay free of boxed numbers). */
  key: number;
  sub: number;
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

/** Per-sprite state: the current view, and where the last frame went (retro pixels; read by aim checks). */
export interface DrawnSprite {
  view: ViewId;
  mirror: boolean;
  /** Retro pixels per texel. */
  k: number;
  /** Sprite rectangle: left and bottom edges (retro pixels, y up), depth of the plane. */
  left: number;
  bottom: number;
  depth: number;
  /** The drawing asked for (tools re-render it to read its parts); the head offset in texels. */
  size: number;
  hx: number;
  hy: number;
  frame: number;
  pose: PoseKey | null;
  def: FigureDef | null;
  flags: number;
  /** Level of detail (with hysteresis, so a figure hovering at a threshold does not flicker between two drawings). */
  lod: number;
  /** Set when `pose` holds the rig's arms, so it is rebuilt only when they change. */
  frames: readonly PoseKey[] | null;
  arms: number;
  scratch: PoseKey;
  scratchL: [number, number, number, number];
  scratchR: [number, number, number, number];
}

export function newDrawnSprite(): DrawnSprite {
  return { view: 0, mirror: false, k: 1, left: 0, bottom: 0, depth: 1, size: 0, hx: 0, hy: 0, frame: 0, pose: null, def: null, flags: 0, lod: -1, frames: null, arms: 0, scratch: {}, scratchL: [0, 0, 0, 0], scratchR: [0, 0, 0, 0] };
}

export type Placement = Entry | 'away' | 'near' | 'wait';

export class DrawnCast {
  readonly atlas: THREE.DataTexture;
  readonly palette: THREE.DataTexture;
  private data = new Uint8Array(ATLAS * ATLAS);
  private pal = new Uint8Array(RAMP_TONES * RAMPS.length * 4);
  private colors = rampColors();
  private renderer: THREE.WebGLRenderer | null;
  private fig = makeFigureRenderer();
  private entries = new Map<number, Map<number, Entry>>();
  private entryCount = 0;
  /** Arm-bucket tuples seen so far, as small numbers (the cache key has no room for the raw product). */
  private armIds = new Map<number, number>();
  /** Head and chest joints of a (pose, frame, view), computed once: placement runs on every redraw. */
  private jointCache = new Map<number, Float32Array>();
  private shelves: Shelf[] = [];
  private nextShelfY = 0;
  private upload = new Uint8Array(MAX_CANVAS * MAX_CANVAS);
  private frame = 0;
  private atlasReady = false;
  /** Per-figure-and-view centroid offsets (see `bias`). */
  private biases = new Map<number, Float32Array>();
  /** Rasters this frame, and the milliseconds they took. */
  rasters = 0;
  private rasterSpent = 0;
  // Stats.
  stats = { rasters: 0, hits: 0, misses: 0, near: 0, rasterMs: 0, entries: 0 };

  constructor(renderer: THREE.WebGLRenderer | null) {
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

  /**
   * The stage's colour lookup: `step` whole tones for everything but the ink; ramps darker than
   * `floor` (display luma) stay; every tone then leans `tintAmt` toward the stage's key colour, once
   * at stage load, so a figure takes the colour of the place it stands in.
   */
  setStageLight(step: number, floor: number, tint = 0, tintAmt = 0) {
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
        const a = t === 0 ? tintAmt * 0.5 : tintAmt;
        this.pal[i] = Math.round(((col >> 16) & 255) * (1 - a) + ((tint >> 16) & 255) * a);
        this.pal[i + 1] = Math.round(((col >> 8) & 255) * (1 - a) + ((tint >> 8) & 255) * a);
        this.pal[i + 2] = Math.round((col & 255) * (1 - a) + (tint & 255) * a);
        this.pal[i + 3] = 255;
      }
    }
    this.palette.needsUpdate = true;
  }

  /** Start of a frame: the raster budget. */
  beginFrame() {
    this.frame++;
    this.rasters = 0;
    this.rasterSpent = 0;
  }

  /** Bytes used on the GPU. */
  bytes(): number {
    return ATLAS * ATLAS + RAMP_TONES * RAMPS.length * 4;
  }

  private static key(fig: number, pose: number, frame: number, view: number, size: number): number {
    return size + 1000 * (fig + 16 * (pose + 32 * (frame + 16 * view)));
  }

  private static sub(hx: number, hy: number, flags: number, arms: number, lod: number): number {
    return hx + 32 * (hy + 64 * (flags + 32 * (lod + 4 * arms)));
  }

  private lookup(key: number, sub: number): Entry | undefined {
    const m = this.entries.get(key);
    return m ? m.get(sub) : undefined;
  }

  /** A small number for this tuple of arm buckets (the table is only ever flushed with the frames that use it). */
  private armId(raw: number): number {
    let id = this.armIds.get(raw);
    if (id === undefined) {
      if (this.armIds.size >= 1000) {
        this.armIds.clear();
        this.entries.clear();
        this.entryCount = 0;
        for (const s of this.shelves) {
          s.entries.length = 0;
          s.x = 0;
        }
      }
      id = this.armIds.size + 1;
      this.armIds.set(raw, id);
    }
    return id;
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
    for (const e of lru.entries) {
      const m = this.entries.get(e.key);
      if (m && m.delete(e.sub)) this.entryCount--;
      if (m && m.size === 0) this.entries.delete(e.key);
    }
    lru.entries.length = 0;
    lru.x = 0;
    lru.last = this.frame;
    return lru;
  }

  /** Raster `def` into the atlas. Null when no budget or no space. */
  private raster(key: number, sub: number, def: FigureDef, pose: PoseKey, view: ViewId, size: number, hx: number, hy: number, flags: number, lod: number): Entry | null {
    const t0 = performance.now();
    const f = this.fig;
    f.paint(def, pose, view, size, hx, hy, flags, lod);
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
    const e: Entry = { key, sub, x, y, w, h, gx: d.cx - canvas.x0, gy: d.cy - canvas.y0, shelf, used: this.frame };
    shelf.entries.push(e);
    let m = this.entries.get(key);
    if (!m) {
      m = new Map();
      this.entries.set(key, m);
    }
    m.set(sub, e);
    this.entryCount++;
    this.rasters++;
    this.stats.rasters++;
    const spent = performance.now() - t0;
    this.rasterSpent += spent;
    this.stats.rasterMs += spent;
    this.stats.entries = this.entryCount;
    return e;
  }

  private uploadRegion(x: number, y: number, w: number, h: number) {
    const r = this.renderer;
    if (!r) return; // (node tests rasterise without a GPU)
    const gl = r.getContext() as WebGL2RenderingContext;
    if (!this.atlasReady) {
      r.initTexture(this.atlas);
      this.atlasReady = true;
    }
    const tex = r.properties.get(this.atlas) as { __webglTexture: WebGLTexture };
    const st = r.state;
    // Through three's state tracker, so its texture-binding cache stays honest.
    st.bindTexture(gl.TEXTURE_2D, tex.__webglTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED, gl.UNSIGNED_BYTE, this.upload, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    st.unbindTexture();
  }

  /**
   * The frame to show for a query: the exact one, or one rastered now while there is budget; else
   * the nearest cached size of the same drawing (null only if nothing like it has been drawn yet).
   */
  frameFor(q: DrawnQuery, st: DrawnSprite, pose: PoseKey, fig: number, poseId: number, frameIndex: number, view: ViewId, size: number, hx: number, hy: number, tb: number, arms: number, lod: number): Entry | null {
    const flags = q.flags;
    const key = DrawnCast.key(fig, poseId, frameIndex, view, size);
    const hb = Math.round(hx / tb) + 16;
    const vb = Math.round(hy / tb) + 32;
    const sub = DrawnCast.sub(hb, vb, flags, arms, lod);
    const hit = this.lookup(key, sub);
    if (hit) {
      this.stats.hits++;
      hit.used = this.frame;
      hit.shelf.last = this.frame;
      return hit;
    }
    this.stats.misses++;
    if (this.rasters < MAX_RASTERS && (this.rasters === 0 || this.rasterSpent < RASTER_BUDGET_MS)) {
      const e = this.raster(key, sub, q.def!, pose, view, size, hx, hy, flags, lod);
      if (e) return e;
    }
    // Nearest cached size of this drawing.
    for (let d = 1; d <= 24; d++) {
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const sz = size + d * 2 * sgn;
        if (sz < 20) continue;
        const near = this.lookup(DrawnCast.key(fig, poseId, frameIndex, view, sz), sub);
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

  /**
   * Places a drawn figure for this redraw: the frame to show and where (`st`), or why not.
   * Feet on the rig's ground point; chest over the rig's chest (the sprite shifts sideways);
   * head on the rig's head (the neck is redrawn to reach it). Pure of GL: tests and tools call it too.
   */
  place(cam: THREE.PerspectiveCamera, root: THREE.Object3D, q: DrawnQuery, gw: number, gh: number, st: DrawnSprite): Placement {
    const P = cam.projectionMatrix.elements;
    const inv = cam.matrixWorldInverse;
    const m = root.matrixWorld.elements;
    _rp.setFromMatrixPosition(root.matrixWorld);
    _v.copy(_rp).applyMatrix4(inv);
    const D = -_v.z;
    if (D < cam.near * 2) return 'near';
    const gx = projX(P, gw, _v.x, _v.z);
    const gy = projY(P, gh, _v.y, _v.z);
    // Size: the rig's height at the ground point's depth, in frame pixels; texels double past the cap.
    const full = q.scale * 1.83 * ((P[5] * gh) / (2 * D));
    // Off screen is judged on the figure's whole rectangle: at melee range its feet are below the
    // frame while its chest fills it, and the drawing must not give way to the hidden rig.
    if (gx < -0.2 * gw - 0.5 * full || gx > 1.2 * gw + 0.5 * full || gy + full < 0 || gy > 1.5 * gh) return 'away';
    const k = full > MAX_FIGURE_PX ? Math.ceil(full / MAX_FIGURE_PX) : 1;
    // A size change is only taken once it has really moved (a figure walking toward the camera
    // would otherwise miss the cache on every redraw for a texel of height).
    let size = sizeStep(full / k);
    if (st.size !== 0 && Math.abs(full / k - st.size) < (st.size < 100 ? 2 : 4)) size = st.size;
    // View: the figure's forward against the camera, nearest drawn view (with hysteresis).
    _c.setFromMatrixPosition(cam.matrixWorld).sub(_rp);
    const cl = Math.sqrt(_c.x * _c.x + _c.z * _c.z);
    if (cl > 1e-4 && !q.lockView) {
      _c.x /= cl;
      _c.z /= cl;
      const fx = m[8];
      const fz = m[10];
      const cm = cam.matrixWorld.elements;
      const fr = fx * cm[0] + fz * cm[2];
      const fc = fx * _c.x + fz * _c.z;
      const a = Math.abs(Math.atan2(fr, fc)) / (Math.PI / 4);
      if (Math.abs(a - st.view) > 0.62) st.view = Math.round(a) as ViewId;
      st.mirror = fr < 0 && st.view !== 0 && st.view !== 4;
    }
    const v = st.view;
    const flip = st.mirror ? -1 : 1;
    const frames = q.frames!;
    let arms = 0;
    if (q.armsFromRig && (q.armsAlways || v === 1 || v === 2 || v === 3)) {
      arms = this.armId(1 + bucket(q.aL[0], -60, 12) + 12 * (bucket(q.aL[2], 0, 8) + 8 * (bucket(q.aR[0], -60, 12) + 12 * bucket(q.aR[2], 0, 8))));
    }
    const poseId = poseIdOf(frames);
    let pose: PoseKey;
    if (arms === 0) pose = frames[q.frame];
    else if (st.arms === arms && st.frames === frames && st.frame === q.frame && st.pose === st.scratch) pose = st.scratch;
    else pose = withRigArms(frames[q.frame], q, st);
    st.arms = arms;
    st.frames = frames;
    const bias = this.bias(q.def!, v);
    const sk = this.jointsOf(pose, poseId, q.frame, v);
    const S = (size * k) / HEADS;
    // Aim fairness: the sprite's torso goes over the rig's torso, its head over the rig's head
    // (each measured at its drawn centre).
    _v.copy(q.chest).applyMatrix4(inv);
    const rigCx = projX(P, gw, _v.x, _v.z) - gx;
    _v.copy(q.head).applyMatrix4(inv);
    const rigHx = projX(P, gw, _v.x, _v.z) - gx;
    const rigHy = projY(P, gh, _v.y, _v.z) - gy;
    let shift = Math.round(rigCx - flip * (sk[2] + bias[2]) * S);
    const lim = Math.round(1.2 * S);
    if (shift > lim) shift = lim;
    if (shift < -lim) shift = -lim;
    let wantX = (rigHx - shift) * flip - (sk[0] + bias[0]) * S;
    let wantY = rigHy - (sk[1] + bias[1]) * S;
    // Only so much neck: the rest of a sideways miss moves the whole sprite.
    const bend = NECK_BEND * S;
    if (wantX > bend || wantX < -bend) {
      const over = Math.round(wantX > 0 ? wantX - bend : wantX + bend);
      shift += over * flip;
      if (shift > lim) shift = lim;
      if (shift < -lim) shift = -lim;
      wantX = (rigHx - shift) * flip - (sk[0] + bias[0]) * S;
    }
    // Once it stops being shootable the head lies where the drawing puts it.
    if (q.free) wantX = wantY = 0;
    // The neck has a limit in length as well as sideways: no stalk, no head sunk in the chest. Past
    // it the head stays on the body; a ducking rig gets a ducking drawing instead (`civilianFrame`).
    const wantLo = -NECK_DOWN * S;
    const wantHi = NECK_UP * S;
    if (wantY < wantLo) wantY = wantLo;
    if (wantY > wantHi) wantY = wantHi;
    // The offset is whole texels (every other one on big and on far figures): the head then moves
    // on the sprite's grid instead of jumping by a fraction of a head unit, and far figures share rasters.
    // (Under 40 texels a head is 6 wide: a 2-texel step would be a third of it, so those stay exact.)
    const tb = size >= 100 || (size >= 40 && size < 60) ? 2 : 1;
    const lm = Math.round(0.7 * S);
    let hxq = Math.round(Math.max(-lm, Math.min(lm, wantX)) / k / tb) * tb;
    let hyq = Math.round(Math.max(-lm, Math.min(lm, wantY)) / k / tb) * tb;
    if (st.size !== 0) {
      const tx = Math.round(st.hx / tb) * tb;
      const ty = Math.round(st.hy / tb) * tb;
      const dx = hxq - tx;
      const dy = hyq - ty;
      hxq = Math.abs(dx) <= tb ? tx : tx + Math.max(-HEAD_TRAVEL * tb, Math.min(HEAD_TRAVEL * tb, dx));
      hyq = Math.abs(dy) <= tb ? ty : ty + Math.max(-HEAD_TRAVEL * tb, Math.min(HEAD_TRAVEL * tb, dy));
    }
    const lod = lodFor(size / HEADS, st.size === 0 ? -1 : st.lod);
    const entry = this.frameFor(q, st, pose, q.def!.id, poseId, q.frame, v, size, hxq, hyq, tb, arms, lod);
    if (!entry) return 'wait';
    st.k = k;
    st.size = size;
    st.hx = hxq;
    st.hy = hyq;
    st.pose = pose;
    st.def = q.def;
    st.frame = q.frame;
    st.flags = q.flags;
    st.lod = lod;
    st.depth = Math.max(D, cam.near * 4) - Math.min(0.1, D * 0.02);
    const gxs = st.mirror ? entry.w - entry.gx : entry.gx;
    st.left = Math.round(gx) + shift - gxs * k;
    st.bottom = Math.round(gy) + (entry.gy - entry.h) * k;
    return entry;
  }

  /** Re-renders a frame's part map (tests / aim tools): width, height and the buffer of PART codes. */
  debugParts(def: FigureDef, pose: PoseKey, view: ViewId, size: number, hx: number, hy: number, flags: number, lod = -1) {
    const f = this.fig;
    f.paint(def, pose, view, size, hx, hy, flags, lod);
    const c = f.canvas;
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    const part = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) part[j * w + i] = c.part[(j + c.y0) * c.w + i + c.x0];
    return { w, h, part, gx: f.d.cx - c.x0, gy: f.d.cy - c.y0 };
  }

  /**
   * The visual centre of the drawn head and torso, against the joints the figure is placed by (a
   * hat brim, a nose, the hair: the head's centre is not its joint), by view, in hu. Measured once
   * from a raster of the figure's rest pose; aim alignment uses it.
   */
  private bias(def: FigureDef, view: ViewId): Float32Array {
    let b = this.biases.get(def.id * 8 + view);
    if (b) return b;
    b = new Float32Array(4);
    this.biases.set(def.id * 8 + view, b);
    const f = this.fig;
    f.paint(def, def.rest, view, 160);
    const c = f.canvas;
    const S = 160 / HEADS;
    let hc = 0,
      hx = 0,
      hy = 0,
      tc = 0,
      tx = 0,
      ty = 0;
    for (let y = c.y0; y <= c.y1; y++) {
      for (let x = c.x0; x <= c.x1; x++) {
        const p = c.part[y * c.w + x];
        if (p === 1) {
          hc++;
          hx += x;
          hy += y;
        } else if (p === 2) {
          tc++;
          tx += x;
          ty += y;
        }
      }
    }
    const sk = f.d.sk;
    if (hc > 0) {
      b[0] = (hx / hc + 0.5 - f.d.cx) / S - sk.sx[J.head];
      b[1] = (f.d.cy - hy / hc - 0.5) / S - (sk.sy[J.head] - (def.neck ?? 0));
    }
    if (tc > 0) {
      b[2] = (tx / tc + 0.5 - f.d.cx) / S - sk.sx[J.chest];
      b[3] = (f.d.cy - ty / tc - 0.5) / S - sk.sy[J.chest];
    }
    return b;
  }

  /** Head x, y and chest x, y (hu) of a pose in a view. Arms do not move them, so rig arms need no entry of their own. */
  private jointsOf(pose: PoseKey, poseId: number, frame: number, view: ViewId): Float32Array {
    const id = poseId * 128 + frame * 8 + view;
    let j = this.jointCache.get(id);
    if (j) return j;
    const sk = this.fig.pose(pose, view);
    j = new Float32Array([sk.sx[J.head], sk.sy[J.head], sk.sx[J.chest], sk.sy[J.chest]]);
    this.jointCache.set(id, j);
    return j;
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
