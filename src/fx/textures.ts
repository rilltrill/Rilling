import * as THREE from 'three';

/**
 * Procedurally painted texture atlases for the FX system.
 *
 * Pixels are computed in plain JS (no <canvas>, no DOM) and uploaded as
 * DataTextures, so this works identically in the browser and in node unit
 * tests. The pixel data is generated lazily once per process and shared; each
 * Fx instance wraps it in its own texture (disposed with the Fx).
 *
 * Both atlases are 4 × 2 cells of 128 px. Cell (col, row) is addressed as
 * frame = row * 4 + col; row 0 is at v = 0 (DataTextures are not flipped).
 * Shapes stay inside a radius of ~0.48 of the cell so mip levels don't bleed.
 */
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;
const CELL = 128;
const W = CELL * ATLAS_COLS;
const H = CELL * ATLAS_ROWS;

/** Particle atlas frames. */
export const PF = {
  /** Soft gaussian glow (fire cores, flashes, mist). */
  GLOW: 0,
  /** Lumpy smoke/dust puff with baked top lighting. */
  SMOKE: 1,
  /** Ragged flame blob with a hot core. */
  FLAME: 2,
  /** Elongated hot streak (use with velocity stretch). */
  STREAK: 3,
  /** Liquid droplet with a rim and highlight. */
  DROP: 4,
  /** Hard irregular chip (concrete/dirt/wood bits). */
  CHIP: 5,
  /** Thin soft ring (shockwaves, ripples). */
  RING: 6,
  /** Four-point twinkle star. */
  STAR: 7,
} as const;

/** Decal atlas frames. */
export const DF = {
  SPLAT0: 0,
  SPLAT1: 1,
  SPLAT2: 2,
  SPLAT3: 3,
  HOLE: 4,
  SCORCH: 5,
  DRIPS: 6,
  DIRT: 7,
} as const;

// ─── Noise ───────────────────────────────────────────────────────────────────

/** 64×64 lattice of random values (value noise wraps around it). */
const LATTICE = (() => {
  const t = new Float32Array(64 * 64);
  let s = 0x9e3779b9;
  for (let i = 0; i < t.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    t[i] = s / 4294967296;
  }
  return t;
})();

function vnoise(x: number, y: number, seed: number): number {
  x += seed * 12.9898;
  y += seed * 7.233;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = xi & 63;
  const y0 = (yi & 63) << 6;
  const x1 = (x0 + 1) & 63;
  const y1 = (y0 + 64) & 4095;
  const a = LATTICE[y0 + x0];
  const b = LATTICE[y0 + x1];
  const c = LATTICE[y1 + x0];
  const d = LATTICE[y1 + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, seed + i * 31);
    norm += amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s / norm;
}

const RING_N = 512;

/** Precomputed noise around a circle (seamless in angle) — for ragged outlines. Look up with `ringAt`. */
function ringTable(freq: number, seed: number, oct = 3): Float32Array {
  const t = new Float32Array(RING_N + 1);
  for (let i = 0; i <= RING_N; i++) {
    const th = (i / RING_N) * Math.PI * 2;
    t[i] = fbm(Math.cos(th) * freq + 7.3, Math.sin(th) * freq + 3.1, seed, oct);
  }
  return t;
}

function ringAt(t: Float32Array, theta: number): number {
  let f = (theta / (Math.PI * 2)) * RING_N;
  if (f < 0) f += RING_N;
  const i = Math.floor(f);
  const k = f - i;
  return t[i] + (t[i + 1] - t[i]) * k;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Simple seeded LCG for shape layout (not per-pixel). */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Distance from p to segment a→b (and the param t along it, in `segT`). */
let segT = 0;
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-6;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / l2);
  segT = t;
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

type Painter = (x: number, y: number, out: Float32Array) => void;

interface CellJob {
  data: Uint8Array;
  frame: number;
  fn: Painter;
  /** Row strip [j0, j1) of the cell. */
  j0: number;
  j1: number;
}

/** Rows per job — keeps each slice to a few ms even on a cold JIT. */
const STRIP = 16;

/** Pending cell paints (generation is time-sliced across frames, see `pumpFxAtlases`). */
let queue: CellJob[] | null = null;
let queueIndex = 0;
let particleJobsEnd = 0;
let particleData: Uint8Array | null = null;
let decalData: Uint8Array | null = null;

/** Queue one cell. `fn` gets cell-local coords in [-0.5, 0.5] (y up) and writes rgba (0..1). */
function paintCell(data: Uint8Array, frame: number, fn: Painter) {
  for (let j0 = 0; j0 < CELL; j0 += STRIP) queue!.push({ data, frame, fn, j0, j1: j0 + STRIP });
}

const _out = new Float32Array(4);

function runCell({ data, frame, fn, j0, j1 }: CellJob) {
  const col = frame % ATLAS_COLS;
  const row = Math.floor(frame / ATLAS_COLS);
  const out = _out;
  for (let j = j0; j < j1; j++) {
    const y = (j + 0.5) / CELL - 0.5;
    const rowOff = (row * CELL + j) * W;
    for (let i = 0; i < CELL; i++) {
      const x = (i + 0.5) / CELL - 0.5;
      out[0] = out[1] = out[2] = 1;
      out[3] = 0;
      fn(x, y, out);
      const o = (rowOff + col * CELL + i) * 4;
      data[o] = Math.round(clamp01(out[0]) * 255);
      data[o + 1] = Math.round(clamp01(out[1]) * 255);
      data[o + 2] = Math.round(clamp01(out[2]) * 255);
      data[o + 3] = Math.round(clamp01(out[3]) * 255);
    }
  }
}

// ─── Particle atlas ──────────────────────────────────────────────────────────

function buildParticleAtlas(d: Uint8Array) {
  paintCell(d, PF.GLOW, (x, y, o) => {
    const r2 = (x * x + y * y) * 4; // r in 0..1 at cell edge
    const a = Math.exp(-r2 * 9) * 0.85 + Math.exp(-r2 * 40) * 0.4;
    o[3] = a * smooth(1, 0.85, Math.sqrt(r2));
  });

  paintCell(d, PF.SMOKE, (x, y, o) => {
    const r = Math.sqrt(x * x + y * y) * 2;
    const n = fbm(x * 5 + 11, y * 5 + 5, 101, 4);
    const lumps = fbm(x * 2.6 + 3, y * 2.6 + 9, 202, 3);
    const edge = r + (lumps - 0.5) * 0.55 + (n - 0.5) * 0.25;
    const dens = smooth(0.95, 0.25, edge);
    o[3] = dens * (0.55 + 0.45 * n);
    // Baked lighting: brighter on top, darker underneath, lumpy self-shadowing.
    const shade = 0.62 + 0.3 * clamp01(y * 1.6 + 0.5) + (n - 0.5) * 0.35;
    o[0] = o[1] = o[2] = shade;
  });

  paintCell(d, PF.FLAME, (x, y, o) => {
    const r = Math.sqrt(x * x + y * y) * 2;
    const n = fbm(x * 6 + 2, y * 6 - 4, 303, 4);
    const edge = r + (n - 0.5) * 0.7;
    const a = smooth(0.92, 0.15, edge);
    o[3] = a;
    // Hot core → cooler ragged edges (multiplied by the particle colour).
    const core = smooth(0.7, 0.0, edge);
    o[0] = 0.55 + 0.45 * core;
    o[1] = 0.4 + 0.6 * core;
    o[2] = 0.3 + 0.7 * core * core;
  });

  paintCell(d, PF.STREAK, (x, y, o) => {
    const ax = x * 2;
    const ay = y * 2;
    const a = Math.exp(-(ax * ax) * 30 - (ay * ay) * 3.2);
    o[3] = a * smooth(1, 0.8, Math.max(Math.abs(ax), Math.abs(ay)));
    const core = Math.exp(-(ax * ax) * 120 - (ay * ay) * 5);
    o[0] = 0.75 + 0.25 * core;
    o[1] = 0.7 + 0.3 * core;
    o[2] = 0.6 + 0.4 * core;
  });

  paintCell(d, PF.DROP, (x, y, o) => {
    const r = Math.sqrt(x * x + y * y) * 2;
    o[3] = smooth(0.82, 0.68, r);
    // Rim darkening + specular glint top-left.
    const hx = x + 0.12;
    const hy = y - 0.12;
    const spec = Math.exp(-(hx * hx + hy * hy) * 260);
    const s = 0.7 + 0.3 * smooth(0.8, 0.2, r) + spec * 0.6;
    o[0] = o[1] = o[2] = s;
  });

  {
    const rnd = lcg(77);
    const nv = 6;
    const ang: number[] = [];
    const rad: number[] = [];
    for (let i = 0; i < nv; i++) {
      ang.push(((i + rnd() * 0.6) / nv) * Math.PI * 2);
      rad.push(0.25 + rnd() * 0.17);
    }
    paintCell(d, PF.CHIP, (x, y, o) => {
      // Point-in-polygon via angular interpolation of the irregular outline.
      let th = Math.atan2(y, x);
      if (th < 0) th += Math.PI * 2;
      let k = 0;
      while (k < nv - 1 && ang[k + 1] <= th) k++;
      const a0 = ang[k];
      const a1 = k + 1 < nv ? ang[k + 1] : ang[0] + Math.PI * 2;
      const tt = th < a0 ? (th + Math.PI * 2 - a0) / (a1 - a0) : (th - a0) / (a1 - a0);
      const rr = rad[k] + (rad[(k + 1) % nv] - rad[k]) * tt;
      const r = Math.sqrt(x * x + y * y);
      o[3] = smooth(rr + 0.01, rr - 0.01, r);
      // Facet shading.
      o[0] = o[1] = o[2] = 0.72 + 0.28 * ((k % 3) / 2) + (x - y) * 0.2;
    });
  }

  paintCell(d, PF.RING, (x, y, o) => {
    const r = Math.sqrt(x * x + y * y) * 2;
    const ring = Math.exp(-((r - 0.82) * (r - 0.82)) * 260);
    const inner = smooth(0.84, 0.3, r) * 0.18 * smooth(0.0, 0.7, r);
    o[3] = (ring + inner) * smooth(1, 0.95, r);
  });

  paintCell(d, PF.STAR, (x, y, o) => {
    const ax = Math.abs(x) * 2;
    const ay = Math.abs(y) * 2;
    const r2 = ax * ax + ay * ay;
    const cross = Math.exp(-ax * 18) * Math.exp(-ay * 2.4) + Math.exp(-ay * 18) * Math.exp(-ax * 2.4);
    const a = cross * 0.9 + Math.exp(-r2 * 14) * 0.8;
    o[3] = a * smooth(1, 0.85, Math.max(ax, ay));
  });
}

// ─── Decal atlas ─────────────────────────────────────────────────────────────

function splatPainter(seed: number): Painter {
  const rnd = lcg(seed);
  const r0 = 0.15 + rnd() * 0.06;
  const sats: number[] = [];
  const nSat = 7 + Math.floor(rnd() * 8);
  for (let i = 0; i < nSat; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = 0.008 + rnd() * rnd() * 0.04;
    const dist = Math.min(0.47 - rad, r0 * (1.15 + rnd() * 1.5));
    sats.push(Math.cos(a) * dist, Math.sin(a) * dist, rad);
  }
  const spikes: number[] = [];
  const nSpk = 3 + Math.floor(rnd() * 5);
  for (let i = 0; i < nSpk; i++) {
    const a = rnd() * Math.PI * 2;
    const len = r0 + 0.08 + rnd() * (0.43 - r0 - 0.08);
    spikes.push(Math.cos(a), Math.sin(a), len, 0.018 + rnd() * 0.022);
  }
  const ring = ringTable(1.7, seed, 3);
  return (x, y, o) => {
    const r = Math.sqrt(x * x + y * y);
    const th = Math.atan2(y, x);
    const R = r0 * (0.78 + 0.5 * ringAt(ring, th));
    let a = smooth(R + 0.012, R - 0.012, r);
    let thick = smooth(R, R * 0.2, r);
    for (let i = 0; i < sats.length; i += 3) {
      const dx = x - sats[i];
      const dy = y - sats[i + 1];
      const lim = sats[i + 2] + 0.008;
      if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
      const dd = Math.sqrt(dx * dx + dy * dy);
      const s = smooth(sats[i + 2] + 0.006, sats[i + 2] - 0.006, dd);
      if (s > a) a = s;
    }
    for (let i = 0; i < spikes.length; i += 4) {
      const dd = segDist(x, y, spikes[i] * r0 * 0.6, spikes[i + 1] * r0 * 0.6, spikes[i] * spikes[i + 2], spikes[i + 1] * spikes[i + 2]);
      const w = spikes[i + 3] * (1 - segT * 0.85);
      const s = smooth(w + 0.006, w - 0.006, dd);
      if (s > a) a = s;
      // Teardrop blob at the spike tip.
      const tx = x - spikes[i] * spikes[i + 2];
      const ty = y - spikes[i + 1] * spikes[i + 2];
      const tb = smooth(0.022, 0.012, Math.sqrt(tx * tx + ty * ty));
      if (tb > a) a = tb;
    }
    const n = fbm(x * 9 + seed, y * 9, seed + 5, 3);
    o[3] = a * (0.88 + 0.12 * n);
    // Thick centre is darker/richer, thin edges lighter; dried darker rim.
    const rim = smooth(R - 0.03, R - 0.008, r) * smooth(R + 0.01, R - 0.004, r);
    const s = 0.78 + 0.22 * (1 - thick) - rim * 0.3 + (n - 0.5) * 0.18;
    o[0] = o[1] = o[2] = s;
  };
}

function buildDecalAtlas(d: Uint8Array) {
  paintCell(d, DF.SPLAT0, splatPainter(11));
  paintCell(d, DF.SPLAT1, splatPainter(29));
  paintCell(d, DF.SPLAT2, splatPainter(47));
  paintCell(d, DF.SPLAT3, splatPainter(83));

  {
    const rnd = lcg(5);
    const cracks: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd() * 0.8;
      cracks.push(Math.cos(a), Math.sin(a), 0.2 + rnd() * 0.2);
    }
    const ring = ringTable(2.2, 9, 3);
    paintCell(d, DF.HOLE, (x, y, o) => {
      const r = Math.sqrt(x * x + y * y);
      const th = Math.atan2(y, x);
      const hole = smooth(0.06, 0.045, r);
      const chipR = 0.12 + 0.07 * ringAt(ring, th);
      const chip = smooth(chipR + 0.01, chipR - 0.01, r);
      const powder = smooth(0.34, 0.06, r) * 0.35;
      let crack = 0;
      for (let i = 0; i < cracks.length; i += 3) {
        const dd = segDist(x, y, cracks[i] * 0.05, cracks[i + 1] * 0.05, cracks[i] * cracks[i + 2], cracks[i + 1] * cracks[i + 2]);
        const t = segT;
        const w = 0.006 * (1 - t * 0.7);
        crack = Math.max(crack, smooth(w + 0.004, w - 0.002, dd) * (1 - t * 0.5));
      }
      const a = Math.max(hole, chip * 0.75, powder, crack * 0.8);
      o[3] = a;
      const s = hole > 0.5 ? 0.05 : chip > 0.5 ? 0.42 + 0.2 * fbm(x * 30, y * 30, 3, 2) : 0.3;
      o[0] = o[1] = o[2] = s;
    });
  }

  const scorchRing = ringTable(2.5, 21, 3);
  const scorchRays = ringTable(9, 23, 2);
  paintCell(d, DF.SCORCH, (x, y, o) => {
    const r = Math.sqrt(x * x + y * y) * 2;
    const th = Math.atan2(y, x);
    const edge = r * (1 + 0.45 * (ringAt(scorchRing, th) - 0.5)) + (fbm(x * 7, y * 7, 22, 3) - 0.5) * 0.2;
    const rays = 0.6 + 0.4 * ringAt(scorchRays, th);
    const a = smooth(0.95, 0.25, edge) * (0.7 + 0.3 * rays);
    o[3] = a * 0.95;
    const n = fbm(x * 10 + 4, y * 10, 24, 3);
    o[0] = o[1] = o[2] = 0.25 + 0.35 * n + 0.3 * smooth(0.2, 0.9, edge);
  });

  {
    const rnd = lcg(91);
    const dots: number[] = [];
    for (let i = 0; i < 11; i++) {
      const a = rnd() * Math.PI * 2;
      const dist = Math.sqrt(rnd()) * 0.3;
      dots.push(Math.cos(a) * dist, Math.sin(a) * dist, 0.015 + rnd() * rnd() * 0.06);
    }
    paintCell(d, DF.DRIPS, (x, y, o) => {
      let a = 0;
      let thick = 0;
      for (let i = 0; i < dots.length; i += 3) {
        const dx = x - dots[i];
        const dy = y - dots[i + 1];
        const lim = dots[i + 2] * 1.2 + 0.008;
        if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
        const dd = Math.sqrt(dx * dx + dy * dy);
        const rad = dots[i + 2] * (0.85 + 0.3 * vnoise(Math.atan2(dy, dx) * 2 + i, i, 3));
        const s = smooth(rad + 0.006, rad - 0.006, dd);
        if (s > a) a = s;
        thick = Math.max(thick, smooth(rad, 0, dd));
      }
      o[3] = a;
      o[0] = o[1] = o[2] = 0.75 + 0.25 * (1 - thick);
    });
  }

  const dirtRing = ringTable(2, 41, 3);
  paintCell(d, DF.DIRT, (x, y, o) => {
    const r = Math.sqrt(x * x + y * y) * 2;
    const th = Math.atan2(y, x);
    const edge = r * (1 + 0.5 * (ringAt(dirtRing, th) - 0.5));
    const n = fbm(x * 14, y * 14, 42, 3);
    const speck = smooth(0.62, 0.7, fbm(x * 26 + 3, y * 26, 43, 2)) * smooth(1, 0.5, r);
    o[3] = Math.max(smooth(0.9, 0.3, edge) * (0.6 + 0.4 * n), speck * 0.8);
    o[0] = o[1] = o[2] = 0.45 + 0.4 * n;
  });
}

function init() {
  if (queue) return;
  queue = [];
  particleData = new Uint8Array(W * H * 4);
  buildParticleAtlas(particleData);
  particleJobsEnd = queue.length;
  decalData = new Uint8Array(W * H * 4);
  buildDecalAtlas(decalData);
}

/**
 * Paint pending atlas cells for up to `budgetMs` (at least one cell). Returns true
 * when both atlases are complete. Called by Fx.update every frame until done.
 */
export function pumpFxAtlases(budgetMs = 3): boolean {
  init();
  const q = queue!;
  const t0 = performance.now();
  while (queueIndex < q.length) {
    runCell(q[queueIndex++]);
    if (performance.now() - t0 >= budgetMs) break;
  }
  return queueIndex >= q.length;
}

/** Generate everything now (call from a loading screen / boot idle to avoid in-game work). */
export function prewarmFxAtlases() {
  pumpFxAtlases(Infinity);
}

export function particleAtlasReady(): boolean {
  return queue !== null && queueIndex >= particleJobsEnd;
}

export function decalAtlasReady(): boolean {
  return queue !== null && queueIndex >= queue.length;
}

function makeTexture(data: Uint8Array): THREE.DataTexture {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  // Upload right away even if not painted yet (all-transparent), so nothing samples
  // an incomplete texture; Fx re-flags it once the atlas is finished.
  t.needsUpdate = true;
  return t;
}

/** New texture over the shared particle atlas pixels. Caller disposes it. */
export function particleAtlasTexture(): THREE.DataTexture {
  init();
  return makeTexture(particleData!);
}

/** New texture over the shared decal atlas pixels. Caller disposes it. */
export function decalAtlasTexture(): THREE.DataTexture {
  init();
  return makeTexture(decalData!);
}
