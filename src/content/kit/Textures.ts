import * as THREE from 'three';

/**
 * Procedural low-resolution "arcade era" textures.
 *
 * Every texture is generated at runtime into a tiny DataTexture (32–64 px) with a
 * limited number of grey levels and ordered dithering, sampled with NEAREST
 * magnification — the chunky texel look of late-90s arcade boards. No image files,
 * deterministic, and works headless (no canvas needed).
 *
 * Textures are DETAIL MAPS: mostly luminance, multiplied with the material colour,
 * so one 'brick' texture serves red brick, grey brick and painted brick. They are
 * applied via object-space projection in Kit.mat (no UVs required) — see ModelKit.
 */

export const TEX_NAMES = [
  'grain',
  'brick',
  'concrete',
  'asphalt',
  'planks',
  'metal',
  'corrugated',
  'tiles',
  'checker',
  'grass',
  'dirt',
  'leaves',
  'bark',
  'rock',
  'scales',
  'hide',
  'skin',
  'cloth',
  'stucco',
  'wallpaper',
  'carpet',
  'water',
  'sand',
  'grate',
  'hazard',
  'feathers',
] as const;

export type TexName = (typeof TEX_NAMES)[number];

interface TexDef {
  size: number;
  /** World metres covered by one repeat of the texture. */
  metres: number;
  /** Number of grey levels after quantisation (fewer = more retro). */
  levels: number;
  gen: (x: number, y: number, n: Noise, s: number) => number | [number, number, number];
}

/** Seeded, tileable value-noise helpers. */
class Noise {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  /** Deterministic hash of integer lattice coords → [0,1). */
  hash(x: number, y: number, k = 0): number {
    let h = (x * 374761393 + y * 668265263 + (this.seed + k) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /** Tileable value noise with period `p` lattice cells over the texture. */
  value(x: number, y: number, size: number, cells: number, k = 0): number {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const w = (i: number) => ((i % cells) + cells) % cells;
    const a = this.hash(w(x0), w(y0), k);
    const b = this.hash(w(x0 + 1), w(y0), k);
    const c = this.hash(w(x0), w(y0 + 1), k);
    const d = this.hash(w(x0 + 1), w(y0 + 1), k);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  /** Fractal (fbm) tileable noise. */
  fbm(x: number, y: number, size: number, cells: number, octaves = 3, k = 0): number {
    let v = 0;
    let amp = 0.5;
    let total = 0;
    let c = cells;
    for (let i = 0; i < octaves; i++) {
      v += this.value(x, y, size, c, k + i * 17) * amp;
      total += amp;
      amp *= 0.5;
      c *= 2;
    }
    return v / total;
  }
  /** Distance to nearest feature point in a tileable cellular (Worley) grid. */
  cell(x: number, y: number, size: number, cells: number, k = 0): { d1: number; d2: number; id: number } {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    let d1 = 9;
    let d2 = 9;
    let id = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const gx = cx + i;
        const gy = cy + j;
        const wx = ((gx % cells) + cells) % cells;
        const wy = ((gy % cells) + cells) % cells;
        const px = gx + this.hash(wx, wy, k);
        const py = gy + this.hash(wx, wy, k + 7);
        const d = Math.hypot(px - fx, py - fy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = this.hash(wx, wy, k + 3);
        } else if (d < d2) d2 = d;
      }
    }
    return { d1, d2, id };
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const DEFS: Record<TexName, TexDef> = {
  // Fine grit applied to otherwise-flat materials.
  grain: {
    size: 32, metres: 0.8, levels: 5,
    gen: (x, y, n, s) => 0.82 + 0.18 * n.hash(x, y) * 0.6 + 0.18 * n.value(x, y, s, 8) * 0.6,
  },
  brick: {
    size: 64, metres: 1.6, levels: 6,
    gen: (x, y, n, s) => {
      const bh = 8;
      const bw = 16;
      const row = Math.floor(y / bh);
      const off = row % 2 ? bw / 2 : 0;
      const bx = Math.floor((x + off) / bw);
      const lx = (x + off) % bw;
      const ly = y % bh;
      if (ly === 0 || lx === 0) return 0.42 + n.hash(x, y) * 0.08; // mortar
      const tone = 0.72 + n.hash(bx, row, 3) * 0.24;
      const chip = n.hash(x, y, 5) > 0.93 ? -0.18 : 0;
      const edge = ly === bh - 1 || lx === bw - 1 ? -0.1 : ly === 1 ? 0.06 : 0;
      return tone + chip + edge + (n.value(x, y, s, 16) - 0.5) * 0.12;
    },
  },
  concrete: {
    size: 64, metres: 3, levels: 6,
    gen: (x, y, n, s) => {
      let v = 0.78 + (n.fbm(x, y, s, 4, 3) - 0.5) * 0.3 + (n.hash(x, y) - 0.5) * 0.1;
      // Expansion joints + hairline cracks.
      if (y % 32 === 0) v -= 0.25;
      const c = n.cell(x, y, s, 3, 9);
      if (c.d2 - c.d1 < 0.03) v -= 0.22;
      return v;
    },
  },
  asphalt: {
    size: 64, metres: 2.5, levels: 6,
    gen: (x, y, n, s) => {
      const speck = n.hash(x, y);
      let v = 0.6 + (n.fbm(x, y, s, 8, 2) - 0.5) * 0.25;
      if (speck > 0.9) v += 0.3;
      else if (speck < 0.08) v -= 0.15;
      const c = n.cell(x, y, s, 2, 4);
      if (c.d2 - c.d1 < 0.025) v -= 0.25; // patched cracks
      return v;
    },
  },
  planks: {
    size: 64, metres: 1.6, levels: 6,
    gen: (x, y, n, s) => {
      const pw = 10;
      const p = Math.floor(x / pw);
      const lx = x % pw;
      if (lx === 0) return 0.35;
      const end = Math.floor((y + n.hash(p, 0, 2) * s) % s);
      if (end === 0 && n.hash(p, 1) > 0.4) return 0.4;
      const grain = Math.sin((y * 0.45 + n.value(x, y, s, 4) * 9 + p * 3) * 1.3) * 0.08;
      const knot = n.cell(x, y, s, 3, p).d1 < 0.12 ? -0.2 : 0;
      return 0.75 + n.hash(p, 0, 5) * 0.2 + grain + knot + (lx === 1 ? 0.06 : 0);
    },
  },
  metal: {
    size: 64, metres: 2, levels: 6,
    gen: (x, y, n, s) => {
      const lx = x % 32;
      const ly = y % 32;
      let v = 0.78 + (n.fbm(x, y, s, 6, 2) - 0.5) * 0.18;
      if (lx === 0 || ly === 0) v = 0.42;
      if (lx === 31 || ly === 31) v = 0.95;
      const rivet = (lx === 3 || lx === 28) && (ly === 3 || ly === 28);
      if (rivet) v = 1;
      if ((lx === 4 || lx === 29) && (ly === 4 || ly === 29)) v = 0.45;
      // Scratches.
      if (n.hash(Math.floor((x + y) / 2), 0, 11) > 0.97) v += 0.12;
      // Rust blotches.
      const rust = n.fbm(x, y, s, 4, 3, 21);
      if (rust > 0.68) return [v * 0.95, v * 0.62, v * 0.42];
      return v;
    },
  },
  corrugated: {
    size: 32, metres: 1.2, levels: 6,
    gen: (x, y, n) => 0.7 + Math.sin((x / 32) * Math.PI * 8) * 0.22 + (n.hash(x, y) - 0.5) * 0.08,
  },
  tiles: {
    size: 64, metres: 1.2, levels: 6,
    gen: (x, y, n) => {
      const t = 16;
      const lx = x % t;
      const ly = y % t;
      if (lx === 0 || ly === 0) return 0.5;
      const tone = 0.88 + n.hash(Math.floor(x / t), Math.floor(y / t), 2) * 0.1;
      const stain = n.hash(x, y, 9) > 0.96 ? -0.15 : 0;
      return tone + stain + (lx === 1 || ly === 1 ? 0.06 : 0);
    },
  },
  checker: {
    size: 32, metres: 1.2, levels: 4,
    gen: (x, y, n) => {
      const c = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
      return (c ? 1 : 0.3) - n.hash(x, y) * 0.06;
    },
  },
  grass: {
    size: 64, metres: 2, levels: 6,
    gen: (x, y, n, s) => {
      const blade = n.value(x * 3, y * 0.6, s * 3, 24);
      const v = 0.62 + blade * 0.35 + (n.fbm(x, y, s, 4, 2) - 0.5) * 0.2;
      return [v * 0.95, v, v * 0.85];
    },
  },
  dirt: {
    size: 64, metres: 2.4, levels: 6,
    gen: (x, y, n, s) => {
      let v = 0.72 + (n.fbm(x, y, s, 6, 3) - 0.5) * 0.35;
      const peb = n.cell(x, y, s, 10, 3);
      if (peb.d1 < 0.18) v += 0.16 - peb.d1 * 0.6;
      if (n.hash(x, y) > 0.92) v -= 0.12;
      return v;
    },
  },
  leaves: {
    size: 64, metres: 1.6, levels: 6,
    gen: (x, y, n, s) => {
      const c = n.cell(x, y, s, 9, 5);
      const leaf = 1 - clamp01(c.d1 * 2.2);
      const v = 0.45 + leaf * 0.5 + c.id * 0.12 - (c.d2 - c.d1 < 0.06 ? 0.2 : 0);
      return [v * 0.92, v, v * 0.82];
    },
  },
  bark: {
    size: 32, metres: 1.4, levels: 6,
    gen: (x, y, n, s) => {
      const fibre = n.value(x * 4, y * 0.5, s * 4, 16);
      let v = 0.62 + fibre * 0.32;
      if (fibre < 0.22) v = 0.4;
      return v + (n.hash(x, y) - 0.5) * 0.06;
    },
  },
  rock: {
    size: 64, metres: 3, levels: 6,
    gen: (x, y, n, s) => {
      const c = n.cell(x, y, s, 5, 1);
      let v = 0.66 + c.id * 0.22 + (n.fbm(x, y, s, 8, 2) - 0.5) * 0.25;
      if (c.d2 - c.d1 < 0.05) v -= 0.3;
      return v;
    },
  },
  scales: {
    size: 32, metres: 0.6, levels: 6,
    gen: (x, y, n) => {
      const sx = 8;
      const sy = 6;
      const row = Math.floor(y / sy);
      const off = row % 2 ? sx / 2 : 0;
      const cx = (((x + off) % sx) + sx) % sx - sx / 2;
      const cy = (y % sy) - sy / 2;
      const d = Math.hypot(cx / (sx / 2), cy / (sy / 2));
      const v = d > 0.92 ? 0.48 : 0.95 - d * 0.28 + n.hash(Math.floor((x + off) / sx), row, 4) * 0.08;
      return v;
    },
  },
  hide: {
    size: 64, metres: 2.4, levels: 6,
    gen: (x, y, n, s) => {
      const c = n.cell(x, y, s, 12, 6);
      let v = 0.72 + (1 - clamp01(c.d1 * 1.8)) * 0.22 + (n.fbm(x, y, s, 4, 2) - 0.5) * 0.25;
      if (c.d2 - c.d1 < 0.07) v -= 0.2; // wrinkles between bumps
      return v;
    },
  },
  skin: {
    size: 32, metres: 0.5, levels: 5,
    gen: (x, y, n, s) => {
      let v = 0.82 + (n.fbm(x, y, s, 4, 3) - 0.5) * 0.32 + (n.hash(x, y) - 0.5) * 0.08;
      const vein = Math.abs(n.fbm(x, y, s, 4, 2, 8) - 0.5);
      if (vein < 0.012) return [v * 0.78, v * 0.6, v * 0.86]; // thin purplish veins
      const rot = n.cell(x, y, s, 5, 30);
      if (rot.d1 < 0.14 && rot.id > 0.55) return [v * 0.72, v * 0.58, v * 0.48]; // small rot sores
      return v;
    },
  },
  cloth: {
    size: 32, metres: 0.4, levels: 5,
    gen: (x, y, n, s) => {
      const weave = (x + y) % 2 === 0 ? 0.07 : -0.04;
      const seam = y % 16 === 0 ? -0.12 : 0;
      const stain = n.fbm(x, y, s, 4, 2, 13) > 0.8 ? -0.16 : 0;
      return 0.84 + weave + seam + (n.hash(x, y) - 0.5) * 0.1 + stain;
    },
  },
  stucco: {
    size: 64, metres: 2.4, levels: 6,
    gen: (x, y, n, s) => 0.8 + (n.fbm(x, y, s, 6, 3) - 0.5) * 0.28 + (n.hash(x, y) - 0.5) * 0.12,
  },
  wallpaper: {
    size: 32, metres: 0.9, levels: 5,
    gen: (x, y, n) => {
      const stripe = x % 16 < 8 ? 0.95 : 0.8;
      const dot = (x % 16 === 12 && y % 8 === 4) || (x % 16 === 4 && y % 8 === 0) ? -0.25 : 0;
      return stripe + dot - (n.hash(x, y) > 0.95 ? 0.1 : 0);
    },
  },
  carpet: {
    size: 32, metres: 1, levels: 5,
    gen: (x, y, n, s) => {
      const motif = (Math.floor(x / 4) + Math.floor(y / 4)) % 4 === 0 ? 0.15 : 0;
      return 0.72 + motif + (n.hash(x, y) - 0.5) * 0.18 + (n.value(x, y, s, 4) - 0.5) * 0.1;
    },
  },
  water: {
    size: 64, metres: 4, levels: 5,
    gen: (x, y, n, s) => {
      const r = Math.sin((y / s) * Math.PI * 12 + n.fbm(x, y, s, 4, 2) * 9);
      return 0.78 + r * 0.14 + (r > 0.92 ? 0.2 : 0);
    },
  },
  sand: {
    size: 64, metres: 2.5, levels: 5,
    gen: (x, y, n, s) => {
      const ripple = Math.sin((x / s) * Math.PI * 10 + n.fbm(x, y, s, 3, 2) * 6) * 0.08;
      return 0.85 + ripple + (n.hash(x, y) - 0.5) * 0.14;
    },
  },
  grate: {
    size: 32, metres: 0.8, levels: 4,
    gen: (x, y) => {
      const lx = x % 8;
      const ly = y % 8;
      return lx < 2 || ly < 2 ? 0.95 : 0.2;
    },
  },
  hazard: {
    size: 32, metres: 1, levels: 3,
    gen: (x, y) => (Math.floor((x + y) / 8) % 2 === 0 ? 1 : 0.18),
  },
  feathers: {
    size: 32, metres: 0.5, levels: 5,
    gen: (x, y, n) => {
      const row = Math.floor(y / 5);
      const off = row % 2 ? 3 : 0;
      const lx = (x + off) % 6;
      const ly = y % 5;
      const shaft = lx === 3 ? -0.15 : 0;
      return 0.9 - ly * 0.07 + shaft + (n.hash(x, y) - 0.5) * 0.08;
    },
  },
};

// 4×4 Bayer matrix for ordered dithering during quantisation.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

export interface RetroTexture {
  texture: THREE.DataTexture;
  /** Repeats per metre. */
  density: number;
  /** 1 / mean linear value — keeps average brightness when multiplying. */
  gain: number;
}

const cache = new Map<TexName, RetroTexture>();

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function generate(name: TexName): RetroTexture {
  const def = DEFS[name];
  const s = def.size;
  const data = new Uint8Array(s * s * 4);
  const n = new Noise(TEX_NAMES.indexOf(name) * 7919 + 101);
  const L = def.levels - 1;
  let sum = 0;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const raw = def.gen(x, y, n, s);
      const rgb = typeof raw === 'number' ? [raw, raw, raw] : raw;
      const d = BAYER[(y % 4) * 4 + (x % 4)];
      const i = (y * s + x) * 4;
      for (let c = 0; c < 3; c++) {
        const q = Math.round(clamp01(rgb[c]) * L + d) / L;
        const v = clamp01(q);
        data[i + c] = Math.round(v * 255);
        sum += srgbToLinear(v);
      }
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, s, s, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  tex.name = `retro:${name}`;
  const mean = sum / (s * s * 3);
  return { texture: tex, density: 1 / def.metres, gain: Math.min(2.5, 1 / Math.max(0.05, mean)) };
}

export const Textures = {
  get(name: TexName): RetroTexture {
    let t = cache.get(name);
    if (!t) {
      t = generate(name);
      cache.set(name, t);
    }
    return t;
  },
  /** Raw RGBA pixels (for tests / previews). */
  pixels(name: TexName): { data: Uint8Array; size: number } {
    const t = Textures.get(name).texture;
    return { data: t.image.data as Uint8Array, size: t.image.width };
  },
  disposeAll() {
    for (const t of cache.values()) t.texture.dispose();
    cache.clear();
  },
};
