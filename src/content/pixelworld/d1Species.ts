import { FloraCanvas, FF, type FloraRng } from '../pixel/floraPaint';
import type { FloraBiome, FloraMats, FloraSpecies } from '../pixel/floraSpecies';
import { D1_BIOME } from '../pixel/floraBiomes';

/**
 * JUNGLE RUN (d1) stone billboards for ART: PIXEL WORLD — the "super scaler"
 * way arcade rail shooters drew scenery (Beast Busters, Operation Wolf): every
 * boulder and cliff pillar is a hand-pixelled sprite standing on the ground,
 * not a faceted low-poly blob. Painted with the FLORA machinery (palette
 * ramps, four hand-painted levels, Doom-style yaw billboards lit like the
 * scenery) so they sit with the plants:
 *  - BOULDER / BOULDER_MID / BOULDER_WIDE: irregular fractured boulders in
 *    three aspects (picked by the classic rock's own proportions so the
 *    footprint matches) — five to eight facets lit from the upper left in
 *    hard steps (dark mid-tones, like the classic rock), crack lines with a lit
 *    lip, chipped edges, lichen clusters, moss patches on some, a few blades
 *    at the foot; never a flat top edge;
 *  - BOULDER_RIVER / BOULDER_RIVER_WIDE: the same standing in the river — a
 *    dark wet band with a sheen above it, a ring of white water round the
 *    foot, no grass;
 *  - CLIFF_SPIRE: a broken jungle crag — a jagged, stepped silhouette with
 *    overhangs (no straight edge longer than a dozen texels), slanted fracture
 *    facets lit on the left, short strata that wave and pinch out, pits and
 *    lichen, the shadow side in the ramp's violet steps (never near-black),
 *    moss tongues draped from ledges, root and vine curtains, a ragged crown
 *    of canopy overhanging the top; CLIFF_SPIRE_WIDE: two or three such
 *    pillars at different depths.
 * Colours: the biome's `extra` ramps (rock / rockDark / rockLight / lichen /
 * lichenRust / wet / foam).
 */

/** d1's biome plus the stone colours (darker mid-tones, like the classic rock material). */
export const D1_STONE_BIOME: FloraBiome = {
  ...D1_BIOME,
  extra: {
    rock: { hex: 0x77705f, sat: 0.85, dark: 0.42, light: 0.38 },
    rockDark: { hex: 0x625c51, sat: 0.85, dark: 0.42, light: 0.38 },
    rockLight: { hex: 0x857c6a, sat: 0.8, dark: 0.42, light: 0.36 },
    lichen: { hex: 0xa8aa78, sat: 0.8, dark: 0.45, light: 0.4 },
    lichenRust: { hex: 0xb07a46, sat: 0.9, dark: 0.45, light: 0.4 },
    wet: { hex: 0x46483e, sat: 0.8, dark: 0.45, light: 0.5 },
    foam: { hex: 0xdcecee, sat: 0.6, dark: 0.6, light: 0.3 },
  },
};

const LX = -0.55;
const LY = 0.62;
const LZ = 0.56;
const lit = (nx: number, ny: number, nz: number) => 0.5 + 0.5 * (nx * LX + ny * LY + nz * LZ);
/** Tones that land exactly on ramp steps (no dither): step 1…5. */
const S1 = 0;
const S2 = 0.25;
const S3 = 0.5;
const S4 = 0.75;
const S5 = 1;
const q = (t: number) => Math.round(Math.max(0, Math.min(1, t)) * 4) / 4;

function stoneOf(m: FloraMats, v: number): number {
  const e = m.extra;
  return [e.rock, e.rockDark, e.rockLight][v % 3] ?? m.barkDark;
}

/** Dark ground contact under a sprite (soft, no outline). */
function contact(c: FloraCanvas, cx: number, half: number, mat: number) {
  c.poly([cx - half, 0, cx + half, 0, cx + half * 0.8, 1.4, cx - half * 0.8, 1.4], mat, 0, { z: -30, flag: FF.SOFT });
}

/** Grass blades along the foot. */
function footGrass(c: FloraCanvas, m: FloraMats, rng: FloraRng, x0: number, x1: number, n: number) {
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0, x1);
    const h = rng.range(2, 6);
    const lean = rng.spread(1.6);
    if ((i * 0.618034) % 1 >= c.density) continue;
    c.line(x, 0.5, x + lean, h, i % 3 ? m.grass : m.grassLight, i % 2 ? 0.62 : 0.5, 20);
  }
}

/** A small cluster (2–5 texels) at level-0 (x, y), one tone; `ys` up. */
function cluster(c: FloraCanvas, x: number, y: number, mat: number, tone: number, z: number, shape: number) {
  const S = [[0, 0, 1, 0], [0, 0, 0, 1, 1, 1], [0, 0, 1, 0, 1, 1, 2, 1], [1, 0, 0, 1, 1, 1], [0, 0, 1, 0, 2, 0]][shape % 5];
  for (let i = 0; i < S.length; i += 2) c.set(Math.floor((x + S[i]) * c.s), Math.floor((y - S[i + 1]) * c.s), mat, tone, z);
}

/**
 * A faceted stone silhouette (`pts`, level-0 texels) shaded facet by facet:
 * seeds spread inside; every texel takes its nearest seed's facet tone
 * (normal leaning out from the centre, quantised to dark mid-tones), crevices
 * darken facet borders whose tones differ, ridges catch the light.
 */
function facetedStone(c: FloraCanvas, pts: number[], mat: number, cx: number, cy: number, rx: number, ry: number, rng: FloraRng, nSeeds: number, z = 0) {
  const seeds: { x: number; y: number; t: number }[] = [];
  for (let i = 0; i < nSeeds; i++) {
    const a = (i / nSeeds) * Math.PI * 2 + rng.spread(0.5);
    const r = i === 0 ? 0 : rng.range(0.35, 0.85);
    const x = cx + Math.cos(a) * rx * r;
    const y = cy + Math.sin(a) * ry * r;
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry + 0.2;
    const nz = rng.range(0.4, 0.85);
    const l = Math.hypot(nx, ny, nz);
    // Dark mid-tones: most facets on steps 2–3, the upper-left ones on 4.
    seeds.push({ x, y, t: Math.min(S4, q(lit(nx / l, ny / l, nz / l) * 1.05 - 0.22)) });
  }
  c.poly(pts, mat, (x, y) => {
    let d1 = Infinity;
    let d2 = Infinity;
    let a = 0;
    let b = 0;
    for (let i = 0; i < seeds.length; i++) {
      const dx = x - seeds[i].x;
      const dy = (y - seeds[i].y) * 1.3;
      const d = dx * dx + dy * dy;
      if (d < d1) {
        d2 = d1;
        b = a;
        d1 = d;
        a = i;
      } else if (d < d2) {
        d2 = d;
        b = i;
      }
    }
    const ta = seeds[a].t;
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    if (edge < 1.1 && Math.abs(ta - seeds[b].t) > 0.2) return ta > seeds[b].t ? Math.min(S5, ta + S2) : Math.max(S1, ta - S2);
    return ta;
  }, { z });
}

/** An irregular boulder outline (no flat top): `n` vertices round an ellipse, radii jittered, a chip or two. */
function boulderOutline(rng: FloraRng, cx: number, cy: number, rx: number, ry: number, n: number, flatFoot: boolean): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.spread(0.16);
    // Tops bulge and dent (never a level edge); the foot sits on the ground.
    const r = Math.sin(a) > 0.2 ? rng.range(0.74, 1.04) : rng.range(0.86, 1);
    let y = cy + Math.sin(a) * ry * r;
    if (flatFoot) y = Math.max(0.5, y);
    pts.push(cx + Math.cos(a) * rx * r, y);
  }
  return pts;
}

/** Cracks, chips and lichen over a painted boulder (bounding box cx ± rx, 0…top). */
function boulderDetail(c: FloraCanvas, m: FloraMats, rng: FloraRng, mat: number, cx: number, cy: number, rx: number, ry: number, n: { cracks: number; lichen: number }) {
  // Cracks: dark lines wandering down from the top, a lit lip on their left.
  for (let i = 0; i < n.cracks; i++) {
    let x = cx + rng.spread(rx * 0.5);
    let y = cy + ry * rng.range(0.35, 0.75);
    const len = rng.int(4, 9);
    for (let j = 0; j < len; j++) {
      const nx = x + rng.spread(1.6);
      const ny = y - rng.range(1.2, 2.6);
      c.line(x, y, nx, ny, mat, S1, 4, FF.THIN);
      c.line(x - 1, y, nx - 1, ny, mat, S4, 3, FF.THIN);
      x = nx;
      y = ny;
    }
  }
  // Lichen clusters on the lit (upper left) side; rust-orange ones here and there.
  for (let i = 0; i < n.lichen; i++) {
    const x = cx - rx * rng.range(0, 0.65);
    const y = cy + ry * rng.range(-0.1, 0.6);
    const mt = rng.chance(0.15) && m.extra.lichenRust ? m.extra.lichenRust : m.extra.lichen;
    if (mt) cluster(c, x, y, mt, rng.chance(0.5) ? S4 : S3, 5, rng.int(0, 4));
  }
}

/** Shared boulder painter: `river` = standing in water (wet band, foam ring, no grass). */
function paintBoulder(c: FloraCanvas, m: FloraMats, rng: FloraRng, v: number, W: number, H: number, aspect: 'round' | 'mid' | 'wide', river: boolean) {
  const mat = stoneOf(m, v + (aspect === 'wide' ? 1 : 0));
  const cx = W / 2 + rng.spread(1.5);
  const rx = W * 0.45;
  const ry = H * (aspect === 'round' ? 0.47 : 0.5);
  const cy = ry * (aspect === 'round' ? 0.98 : 0.86);
  if (!river) contact(c, cx, rx * 0.95, m.barkDark);
  const pts = boulderOutline(rng, cx, cy, rx, ry, aspect === 'round' ? 11 : 13, true);
  facetedStone(c, pts, mat, cx, cy, rx, ry, rng, aspect === 'round' ? 6 : 8);
  boulderDetail(c, m, rng, mat, cx, cy, rx, ry, { cracks: aspect === 'round' ? 2 : 3, lichen: aspect === 'round' ? 5 : 7 });
  // Moss patches (not a cap) on some.
  if (!river && (v === 0 || v === 2)) c.mass(cx - rx * rng.range(0.05, 0.35), cy + ry * rng.range(0.55, 0.75), rx * rng.range(0.22, 0.35), ry * 0.16, m.moss, rng, { z: 8, puff: 2.2, droop: 0.7, glint: 1 });
  if (river) {
    // Wet band: the waterline darkens the foot, a lit sheen just above it.
    const wet = m.extra.wet ?? mat;
    const wl = Math.max(3, H * 0.16);
    const sc = c.s;
    for (let iy = 0; iy < Math.ceil(wl * sc) + 1; iy++) {
      for (let ix = 0; ix < c.w; ix++) {
        const i = iy * c.w + ix;
        if (!c.mat[i]) continue;
        const y = (iy + 0.5) / sc;
        if (y < wl) c.set(ix, iy, wet, y > wl - 1 ? S3 : (ix + iy) % 7 === 0 ? S3 : S2, c.z[i]);
        else if (y < wl + 1.2 && hashI(ix, iy) > 0.4) c.set(ix, iy, mat, S5, c.z[i]);
      }
    }
    // White water round the foot: a broken band of foam lumps at the waterline, spilling past
    // both sides (cut out), lit crests over a cool shadowed underside, gaps where the wet rock shows.
    const foam = m.extra.foam ?? mat;
    for (let x = cx - rx - 5; x <= cx + rx + 5; ) {
      const len = rng.range(2.5, 6.5);
      const hgt = rng.range(2.2, 4.6);
      const y0 = rng.range(0, 1.2);
      if (rng.chance(0.88)) {
        c.poly([x, y0, x + len, y0, x + len * 0.8, y0 + hgt * 0.7, x + len * 0.45, y0 + hgt, x + len * 0.15, y0 + hgt * 0.75], foam, (_px, py) => (py > y0 + hgt * 0.62 ? S5 : py > y0 + hgt * 0.3 ? S4 : S3), { z: 30, flag: FF.SOFT });
      }
      x += len + rng.range(0, 2.5);
    }
    for (let i = 0; i < 7; i++) c.set(Math.floor((cx + rng.spread(rx + 6)) * c.s), Math.floor(rng.range(3.5, 6) * c.s), foam, S5, 31, FF.THIN);
  } else footGrass(c, m, rng, cx - rx, cx + rx, aspect === 'round' ? 8 : 12);
}

function hashI(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Rounded fractured boulder (48 × 40, 1.2 m). */
export const BOULDER: FloraSpecies = {
  key: 'boulder',
  w: 48,
  h: 40,
  heightM: 1.2,
  variants: 4,
  paint(c, m, rng, v) {
    paintBoulder(c, m, rng, v, this.w, this.h, 'round', false);
  },
};

/** A broader boulder (56 × 32). */
export const BOULDER_MID: FloraSpecies = {
  key: 'boulderMid',
  w: 56,
  h: 32,
  heightM: 1,
  variants: 3,
  paint(c, m, rng, v) {
    paintBoulder(c, m, rng, v, this.w, this.h, 'mid', false);
  },
};

/** A low slab of stone (64 × 24). */
export const BOULDER_WIDE: FloraSpecies = {
  key: 'boulderWide',
  w: 64,
  h: 24,
  heightM: 0.75,
  variants: 2,
  paint(c, m, rng, v) {
    paintBoulder(c, m, rng, v, this.w, this.h, 'wide', false);
  },
};

/** A boulder standing in the river (48 × 36): wet band, foam at the foot. */
export const BOULDER_RIVER: FloraSpecies = {
  key: 'boulderRiver',
  w: 48,
  h: 36,
  heightM: 1.1,
  variants: 2,
  paint(c, m, rng, v) {
    paintBoulder(c, m, rng, v, this.w, this.h, 'round', true);
  },
};

/** A low rock in the river (64 × 24). */
export const BOULDER_RIVER_WIDE: FloraSpecies = {
  key: 'boulderRiverWide',
  w: 64,
  h: 24,
  heightM: 0.75,
  variants: 2,
  paint(c, m, rng, v) {
    paintBoulder(c, m, rng, v, this.w, this.h, 'wide', true);
  },
};

/** Boulder families by aspect (w / h), for fitting a classic rock's footprint. */
export const D1_BOULDERS = {
  land: [['boulder', 48 / 40, 4], ['boulderMid', 56 / 32, 3], ['boulderWide', 64 / 24, 2]] as [string, number, number][],
  river: [['boulderRiver', 48 / 36, 2], ['boulderRiverWide', 64 / 24, 2]] as [string, number, number][],
};

// ─── Crags ───────────────────────────────────────────────────────────────────

interface Seg {
  y0: number;
  y1: number;
  dl: number;
  dr: number;
  /** Facet splits (fraction across) and their slant; strata lines in it. */
  f1: number;
  f2: number;
  slant: number;
  overhang: boolean;
  midLit: boolean;
}

/**
 * One crag pillar (level-0 texels, y up): foot centred on `cx`, `half0` wide at
 * the foot tapering to `half1` at `top`; `bias` shifts every tone (a pillar
 * standing back is darker); `z` its depth (pillars in front overlap with a
 * contour). Returns the crown line's mid height (for the canopy).
 */
function paintCrag(c: FloraCanvas, m: FloraMats, rng: FloraRng, mat: number, cx: number, half0: number, half1: number, top: number, bias: number, z: number) {
  const segs: Seg[] = [];
  for (let y = 0; y < top; ) {
    const h = rng.int(7, 19);
    const overhang = segs.length > 1 && rng.chance(0.28);
    const f1 = rng.range(0.14, 0.34);
    segs.push({
      y0: y,
      y1: Math.min(top, y + h),
      dl: rng.range(-3, 3) + (overhang ? rng.range(2, 5) : 0),
      dr: rng.range(-3, 3) + (overhang ? rng.range(1, 4) : 0),
      f1,
      f2: rng.range(Math.max(f1 + 0.2, 0.5), 0.82),
      slant: rng.range(-0.04, 0.04),
      overhang,
      midLit: rng.chance(0.3),
    });
    y += h;
  }
  const segAt = (y: number) => {
    let i = 0;
    while (i + 1 < segs.length && segs[i + 1].y0 <= y) i++;
    return i;
  };
  // Small jags on each edge: ±1 texel steps every 3–5 rows, a notch now and then.
  const jag = (y: number, side: number) => {
    const k = Math.floor(y / 4);
    const h = hashI(k * 7 + (side > 0 ? 3 : 0), Math.round(cx));
    return (h < 0.3 ? -1 : h > 0.75 ? 1 : 0) - (hashI(k, side * 5 + 11) > 0.9 ? 2 : 0);
  };
  const edge = (y: number, side: number) => {
    const s = segs[segAt(y)];
    const half = half0 + (half1 - half0) * Math.min(1, y / top);
    return cx + side * (half + (side < 0 ? s.dl : s.dr) + jag(y, side));
  };
  // Crown: a ragged ridge of 3–5 peaks above `top`.
  const xl0 = edge(top - 1, -1);
  const xr0 = edge(top - 1, 1);
  const peaks = rng.int(3, 5);
  const crownPts: number[] = [];
  for (let i = 0; i <= peaks * 2; i++) crownPts.push(top + (i % 2 ? rng.range(3, 12) : rng.range(-3, 2)));
  const crownAt = (x: number) => {
    const f = ((x - xl0) / Math.max(1, xr0 - xl0)) * peaks * 2;
    const i = Math.max(0, Math.min(peaks * 2 - 1, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - i));
    return crownPts[i] + (crownPts[i + 1] - crownPts[i]) * t;
  };
  // Strata: short wavy seams that pinch out (per segment: 1–3, partial width).
  const seams: { y: number; xa: number; xb: number; ph: number }[] = [];
  for (const s of segs) {
    const n = rng.int(0, 2);
    for (let i = 0; i < n; i++) {
      const xa = rng.range(-1, 0.4);
      seams.push({ y: s.y0 + (s.y1 - s.y0) * rng.range(0.25, 0.8), xa, xb: xa + rng.range(0.35, 0.8), ph: rng.next() * 6 });
    }
  }
  const sc = c.s;
  const yTop = Math.max(...crownPts);
  for (let iy = 0; iy < c.h; iy++) {
    const y = (iy + 0.5) / sc;
    if (y > yTop) break;
    const si = segAt(Math.min(y, top - 0.01));
    const s = segs[si];
    const above = segs[si + 1];
    const ye = Math.min(y, top - 0.01);
    const xl = edge(ye, -1);
    const xr = edge(ye, 1);
    const xlA = above ? cx - (half0 + (half1 - half0) * Math.min(1, above.y0 / top) + above.dl) : xl;
    const xrA = above ? cx + (half0 + (half1 - half0) * Math.min(1, above.y0 / top) + above.dr) : xr;
    const ix0 = Math.max(0, Math.floor(xl * sc));
    const ix1 = Math.min(c.w - 1, Math.ceil(xr * sc));
    for (let ix = ix0; ix <= ix1; ix++) {
      const x = (ix + 0.5) / sc;
      if (x < xl || x > xr) continue;
      if (y >= top && y > crownAt(x)) continue;
      const u = (x - xl) / Math.max(1, xr - xl);
      // Facets split by slanted fractures: lit left, a middle facet (sometimes catching the light), shaded right.
      const sl = (y - s.y0) * s.slant;
      let t = u < s.f1 + sl ? S4 : u < s.f2 + sl ? (s.midLit ? S4 : S3) : S2;
      if (u > 0.92) t = S2;
      // Ledge lip: where this segment juts beyond the one above, its top rows catch the light.
      if (y > s.y1 - 2 && (x < xlA - 0.5 || x > xrA + 0.5)) t = S5;
      // Under an overhang: the rows below it lie in its shadow.
      if (above?.overhang && y > s.y1 - 3) t = Math.max(S2, t - S2);
      // Crown rock: weathered, a step lighter on the left.
      if (y >= top) t = u < 0.45 ? S4 : S3;
      c.set(ix, iy, mat, q(Math.max(S2, Math.min(S5, t + bias))), z);
    }
  }
  // Seams: a dark wavy line with a lit row under it, pinching out at both ends.
  for (const sm of seams) {
    const ye = sm.y;
    const xl = edge(ye, -1);
    const xr = edge(ye, 1);
    const xa = xl + (xr - xl) * Math.max(0.05, sm.xa);
    const xb = xl + (xr - xl) * Math.min(0.95, sm.xb);
    for (let x = xa; x <= xb; x += 1 / sc) {
      const y = ye + Math.sin(x * 0.35 + sm.ph) * 1.2;
      const ix = Math.floor(x * sc);
      const iy = Math.floor(y * sc);
      if (!c.mat[iy * c.w + ix]) continue;
      c.set(ix, iy, mat, Math.max(S1, S2 + bias), z);
      if (iy - 1 >= 0 && c.mat[(iy - 1) * c.w + ix]) c.set(ix, iy - 1, mat, Math.min(S5, S4 + bias), z);
    }
  }
  // A long joint or two wandering down through several segments.
  for (let i = 0; i < 2; i++) {
    let x = cx + rng.spread(half0 * 0.6);
    let y = rng.range(top * 0.5, top - 4);
    const len = rng.range(18, 50);
    for (let j = 0; j < len && y > 3; j++) {
      const nx = x + rng.spread(0.8);
      c.line(x, y, nx, y - 1, mat, Math.max(S1, S2 + bias - 0.25), z + 1, FF.THIN);
      if (j % 3 === 0) c.line(x - 1, y, nx - 1, y - 1, mat, Math.min(S5, S4 + bias), z + 1, FF.THIN);
      x = nx;
      y -= 1;
    }
  }
  // Pits (pocked clusters) and lichen speckle clusters.
  for (let i = 0; i < Math.round((half0 * top) / 70); i++) {
    const y = rng.range(3, top - 3);
    const xl = edge(y, -1);
    const xr = edge(y, 1);
    const x = rng.range(xl + 2, xr - 2);
    if (rng.chance(0.55)) {
      cluster(c, x, y, mat, Math.max(S1, S2 + bias - 0.25), z + 1, rng.int(0, 4));
      c.set(Math.floor((x + 1) * sc), Math.floor((y - 1) * sc), mat, Math.min(S5, S4 + bias), z + 1);
    } else if (x < (xl + xr) / 2 + 2) {
      const lm = rng.chance(0.15) ? m.extra.lichenRust : m.extra.lichen;
      if (lm) cluster(c, x, y, lm, rng.chance(0.5) ? S4 : S3, z + 2, rng.int(0, 4));
    }
  }
  // Moss tongues draped from ledges (varied sizes), lit on top.
  for (const s of segs) {
    if (s.y1 >= top || !rng.chance(0.6)) continue;
    const xl = edge(s.y1 - 1, -1);
    const xr = edge(s.y1 - 1, 1);
    const n = rng.int(1, 2);
    for (let k = 0; k < n; k++) {
      const x0 = rng.range(xl + 1, xr - 4);
      const w = rng.range(2, 6);
      const len = rng.range(3, 13);
      for (let d = 0; d < len; d++) {
        const ww = w * (1 - d / len) * (0.8 + 0.2 * Math.sin(d * 1.3));
        const y = s.y1 - d;
        c.line(x0 + (w - ww) / 2 + Math.sin(d * 0.6) * 0.5, y, x0 + (w + ww) / 2, y, m.moss, d === 0 ? S4 : d > len - 2 ? S2 : S3, z + 6, FF.SOFT);
      }
    }
  }
  return { xl: xl0, xr: xr0, crownMid: crownPts.reduce((a, b) => a + b, 0) / crownPts.length };
}

/** Root / vine curtains from a crown, and the canopy overhanging it. */
function cragCrown(c: FloraCanvas, m: FloraMats, rng: FloraRng, xl: number, xr: number, y: number, z: number, curtains: number) {
  const w = xr - xl;
  for (let i = 0; i < curtains; i++) {
    const vx = rng.range(xl + 1, xr - 1);
    const len = rng.range(10, 46);
    const root = rng.chance(0.35);
    const mat = root ? m.barkDark : m.vine;
    let x = vx;
    for (let d = 0; d < len; d++) {
      x += Math.sin((y - d) * 0.3 + i) * 0.22;
      c.set(Math.floor(x * c.s), Math.floor((y - d) * c.s), mat, root ? S2 : S3, z + 9, FF.THIN);
      if (!root && d % 4 === 2 && c.s >= 0.5) {
        c.set(Math.floor((x + 1) * c.s), Math.floor((y - d) * c.s), m.vine, S4, z + 9, FF.THIN);
        c.set(Math.floor((x - 1) * c.s), Math.floor((y - d - 1) * c.s), m.leafDark, S2, z + 9, FF.THIN);
      }
    }
  }
  // Canopy cushion wider than the top, spilling down one side.
  c.mass(xl + w / 2, y + 3, w * 0.62, 5.5, m.leaf, rng, { z: z + 12, puff: 2.6, droop: 0.6, glint: 1 });
  c.mass(xl + w * (rng.chance(0.5) ? 0.15 : 0.85), y - 2, w * 0.22, 5, m.moss, rng, { z: z + 13, puff: 2.2, droop: 0.9, glint: 1 });
}

/** Rubble at the foot: irregular little rocks with lit tops, and grass. */
function rubble(c: FloraCanvas, m: FloraMats, rng: FloraRng, mat: number, cx: number, half: number, n: number) {
  for (let i = 0; i < n; i++) {
    const r = rng.range(2, 4.5);
    const x = cx + rng.spread(half * 1.05);
    c.poly([x - r, 0.3, x - r * 0.7, r * 0.8, x + r * 0.2, r * rng.range(0.9, 1.3), x + r, r * 0.5, x + r * 0.9, 0.3], mat, (px, py) => (py > r * 0.6 ? S4 : px > x + r * 0.3 ? S2 : S3), { z: 14 });
  }
}

function paintSpire(c: FloraCanvas, m: FloraMats, rng: FloraRng, v: number, W: number, H: number) {
  const mat = stoneOf(m, v === 1 ? 2 : 0);
  const cx = W / 2 + rng.spread(2);
  const half0 = W * 0.38;
  contact(c, cx, half0 * 1.1, m.barkDark);
  // Variant 1: a lower pillar standing behind on one side.
  if (v === 1) {
    const bx = cx + (rng.chance(0.5) ? -1 : 1) * W * 0.18;
    const b = paintCrag(c, m, rng, stoneOf(m, 1), bx, W * 0.26, W * 0.18, H * 0.55, 0, -20);
    cragCrown(c, m, rng, b.xl, b.xr, b.crownMid, -20, 2);
  }
  const top = H - rng.int(16, 24);
  const p = paintCrag(c, m, rng, mat, cx, half0, W * 0.24, top, 0, 0);
  cragCrown(c, m, rng, p.xl, p.xr, p.crownMid, 0, 4);
  rubble(c, m, rng, mat, cx, half0, 5);
  footGrass(c, m, rng, cx - half0, cx + half0, 16);
}

function paintSpireWide(c: FloraCanvas, m: FloraMats, rng: FloraRng, v: number, W: number, H: number) {
  const cx = W / 2;
  contact(c, cx, W * 0.47, m.barkDark);
  // Back pillar (tall, darker), then two in front at different heights.
  const back = paintCrag(c, m, rng, stoneOf(m, 1), cx + rng.spread(6), W * 0.24, W * 0.15, H - rng.int(18, 26), 0, -30);
  cragCrown(c, m, rng, back.xl, back.xr, back.crownMid, -30, 3);
  const left = paintCrag(c, m, rng, stoneOf(m, v ? 2 : 0), W * 0.3, W * 0.2, W * 0.13, H * rng.range(0.5, 0.66), 0, 0);
  cragCrown(c, m, rng, left.xl, left.xr, left.crownMid, 0, 2);
  const right = paintCrag(c, m, rng, stoneOf(m, v ? 0 : 2), W * 0.7, W * 0.19, W * 0.12, H * rng.range(0.38, 0.52), 0, 10);
  cragCrown(c, m, rng, right.xl, right.xr, right.crownMid, 10, 2);
  rubble(c, m, rng, stoneOf(m, v), cx, W * 0.42, 8);
  footGrass(c, m, rng, W * 0.06, W * 0.94, 24);
}

export const CLIFF_SPIRE: FloraSpecies = {
  key: 'cliffSpire',
  w: 64,
  h: 176,
  heightM: 16,
  variants: 2,
  paint(c, m, rng, v) {
    paintSpire(c, m, rng, v, this.w, this.h);
  },
};

export const CLIFF_SPIRE_WIDE: FloraSpecies = {
  key: 'cliffSpireWide',
  w: 112,
  h: 128,
  heightM: 12,
  variants: 2,
  paint(c, m, rng, v) {
    paintSpireWide(c, m, rng, v, this.w, this.h);
  },
};

/**
 * The shared stone set (boulder, wide boulder, crag spire, wide crag): d3 paints it in its own
 * biome, so it keeps these four species (and its atlas size) whatever d1 adds.
 */
export const D1_STONES = [BOULDER, BOULDER_WIDE, CLIFF_SPIRE, CLIFF_SPIRE_WIDE];

/** Every d1 stone species (one FLORA atlas): the shared set plus the mid boulder and the river rocks. */
export const D1_STONES_ALL = [BOULDER, BOULDER_MID, BOULDER_WIDE, BOULDER_RIVER, BOULDER_RIVER_WIDE, CLIFF_SPIRE, CLIFF_SPIRE_WIDE];
