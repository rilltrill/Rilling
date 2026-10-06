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
 *  - BOULDER: a rounded, fractured boulder — four or five facets in hard tone
 *    steps (lit upper left), lit ridges and dark crevices between them,
 *    cracks, grit, a moss cushion on top and grass blades at the foot;
 *    `boulderWide`: a low slab;
 *  - CLIFF_SPIRE: a jointed rock pillar — bedding planes with lit ledges and
 *    shadowed undersides, vertical joints, a lit left column and a shaded right,
 *    moss on the ledges, hanging vines, seeps, rubble at the foot;
 *    `cliffSpireWide`: a broad buttress of two pillars.
 * Colours: the biome's `extra` ramps rock / rockDark / rockLight / lichen.
 */

/** d1's biome plus the stone colours (d1 COL.rock / rockDark, the cliff stone). */
export const D1_STONE_BIOME: FloraBiome = {
  ...D1_BIOME,
  extra: {
    rock: { hex: 0x857f70, sat: 0.85, dark: 0.34, light: 0.36 },
    rockDark: { hex: 0x6a645a, sat: 0.85, dark: 0.34, light: 0.38 },
    rockLight: { hex: 0x948c7c, sat: 0.8, dark: 0.36, light: 0.34 },
    lichen: { hex: 0xa0a68a, sat: 0.7, dark: 0.4, light: 0.4 },
  },
};

const LX = -0.55;
const LY = 0.62;
const LZ = 0.56;
const lit = (nx: number, ny: number, nz: number) => 0.5 + 0.5 * (nx * LX + ny * LY + nz * LZ);
/** Quantise to the sprite artist's four hard steps. */
const step4 = (t: number) => Math.round(Math.max(0, Math.min(1, t)) * 4) / 4;

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

/**
 * A faceted stone silhouette (`pts`, level-0 texels) shaded facet by facet:
 * seeds spread inside; every texel takes its nearest seed's facet tone
 * (normal leaning out from the centre), crevices darken facet borders whose
 * tones differ, ridges catch the light on the lit side.
 */
function facetedStone(c: FloraCanvas, pts: number[], mat: number, cx: number, cy: number, rx: number, ry: number, rng: FloraRng, nSeeds: number, z = 0) {
  const seeds: { x: number; y: number; t: number }[] = [];
  for (let i = 0; i < nSeeds; i++) {
    const a = (i / nSeeds) * Math.PI * 2 + rng.spread(0.5);
    const r = i === 0 ? 0 : rng.range(0.35, 0.8);
    const x = cx + Math.cos(a) * rx * r;
    const y = cy + Math.sin(a) * ry * r;
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry + 0.25;
    const nz = rng.range(0.45, 0.9);
    const l = Math.hypot(nx, ny, nz);
    seeds.push({ x, y, t: step4(lit(nx / l, ny / l, nz / l) * 1.15 - 0.05) });
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
    if (edge < 1.1 && Math.abs(ta - seeds[b].t) > 0.2) return ta > seeds[b].t ? Math.min(1, ta + 0.25) : Math.max(0, ta - 0.3);
    return ta;
  }, { z });
}

/** Rounded fractured boulder (48 × 40, 1.2 m): facets, cracks, moss cushion on top (most variants), grass at the foot. */
export const BOULDER: FloraSpecies = {
  key: 'boulder',
  w: 48,
  h: 40,
  heightM: 1.2,
  variants: 4,
  paint(c, m, rng, v) {
    const mat = stoneOf(m, v);
    const W = this.w;
    const cx = W / 2 + rng.spread(1.5);
    const rx = W * 0.44;
    const ry = this.h * 0.46;
    const cy = ry + 0.5;
    const n = 10;
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.spread(0.18);
      const r = rng.range(0.84, 1);
      pts.push(cx + Math.cos(a) * rx * r, Math.max(0.5, cy + Math.sin(a) * ry * r * (Math.sin(a) > 0 ? 1 : 0.9)));
    }
    contact(c, cx, rx * 0.95, m.barkDark);
    facetedStone(c, pts, mat, cx, cy, rx, ry, rng, 6);
    // Cracks: a couple of dark lines down from the top, a lit lip beside them.
    for (let i = 0; i < 2; i++) {
      let x = cx + rng.spread(rx * 0.5);
      let y = cy + ry * rng.range(0.3, 0.7);
      for (let j = 0; j < 8; j++) {
        const nx = x + rng.spread(2);
        const ny = y - rng.range(1.5, 3);
        c.line(x, y, nx, ny, mat, 0.08, 4, FF.THIN);
        x = nx;
        y = ny;
      }
    }
    // Lichen flecks on the lit side.
    if (m.extra.lichen) for (let i = 0; i < 6; i++) c.ellipse(cx - rx * rng.range(0.1, 0.6), cy + ry * rng.range(-0.1, 0.5), 1.2, 0.9, m.extra.lichen, { z: 5, bias: 0.1, amp: 0.2 });
    // Moss cushion on top.
    if (v !== 1) c.mass(cx - rx * 0.12, cy + ry * 0.72, rx * (0.45 + 0.1 * (v % 2)), ry * 0.22, m.moss, rng, { z: 8, puff: 2.6, droop: 0.5, glint: 1 });
    footGrass(c, m, rng, cx - rx, cx + rx, 10);
  },
};

/** A low slab of stone (`boulderWide`, 64 × 24): a split ledge, lit top face, dark front, moss along the top. */
export const BOULDER_WIDE: FloraSpecies = {
  key: 'boulderWide',
  w: 64,
  h: 24,
  heightM: 0.75,
  variants: 2,
  paint(c, m, rng, v) {
    const mat = stoneOf(m, v + 1);
    const W = this.w;
    const cx = W / 2;
    const rx = W * 0.46;
    const ry = this.h * 0.5;
    const cy = ry - 0.5;
    const pts: number[] = [cx - rx, 0.5, cx - rx * 0.98, ry * 0.9, cx - rx * 0.6, ry * 1.7, cx + rx * 0.2, ry * 1.85, cx + rx * 0.85, ry * 1.5, cx + rx, ry * 0.6, cx + rx * 0.9, 0.5];
    contact(c, cx, rx, m.barkDark);
    facetedStone(c, pts, mat, cx, cy, rx, ry, rng, 5);
    // The top face (lit) and the split.
    c.line(cx + rng.spread(6), 1, cx + rng.spread(4), ry * 1.6, mat, 0.05, 4, FF.THIN);
    c.mass(cx - rx * 0.2, ry * 1.65, rx * 0.5, 2.5, m.moss, rng, { z: 8, puff: 2.2, droop: 0.6 });
    footGrass(c, m, rng, cx - rx, cx + rx, 12);
  },
};

/**
 * A jointed rock pillar (`cliffSpire`, 64 × 176 ≈ 16 m): strata 10–18 texels
 * high, each with a lit ledge top and a shadowed underside, block joints,
 * lit-left / shaded-right column bands, moss on ledges, hanging vines, seeps,
 * a jagged top and rubble at the foot. `wide` paints a broad buttress.
 */
function paintSpire(c: FloraCanvas, m: FloraMats, rng: FloraRng, v: number, W: number, H: number, wide: boolean) {
  const mat = stoneOf(m, v);
  const dark = m.extra.rockDark ?? mat;
  const cx = W / 2 + rng.spread(2);
  const half0 = W * (wide ? 0.46 : 0.42);
  const half1 = W * (wide ? 0.3 : 0.26);
  // Strata boundaries (from the foot up) and their ledge offsets.
  const strata: number[] = [0];
  while (strata[strata.length - 1] < H) strata.push(strata[strata.length - 1] + rng.int(10, 18));
  const offL: number[] = strata.map(() => rng.spread(3));
  const offR: number[] = strata.map(() => rng.spread(3));
  const topY = H - rng.int(4, 12);
  const edgeAt = (y: number, side: number) => {
    const k = Math.min(1, y / topY);
    const half = half0 + (half1 - half0) * k;
    let s = 0;
    while (s + 1 < strata.length && strata[s + 1] <= y) s++;
    const o = side < 0 ? offL[s] : offR[s];
    return cx + side * (half + o + Math.sin(y * 0.21 + side * 2 + v) * 1.2);
  };
  // Silhouette: the edges up to `topY`, then a jagged crown (a zigzag between the edges).
  const crownN = wide ? 9 : 6;
  const cxL = edgeAt(topY, -1);
  const cxR = edgeAt(topY, 1);
  const crown: number[] = [];
  for (let i = 0; i <= crownN; i++) crown.push(topY + (i % 2 ? rng.range(2, H - topY) : rng.range(-2, 2)));
  const crownAt = (x: number) => {
    const f = ((x - cxL) / Math.max(1, cxR - cxL)) * crownN;
    const i = Math.max(0, Math.min(crownN - 1, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - i));
    return crown[i] + (crown[i + 1] - crown[i]) * t;
  };
  contact(c, cx, half0 * 1.05, m.barkDark);
  // Fracture planes: a few big slanted facets breaking the bands (lit when they face up-left).
  const planes: { x: number; y: number; a: number; lit: boolean }[] = [];
  for (let i = 0; i < (wide ? 5 : 3); i++) planes.push({ x: cx + rng.spread(half0 * 0.7), y: rng.range(8, topY - 8), a: rng.range(0.5, 1.1) * (rng.chance(0.5) ? 1 : -1), lit: rng.chance(0.55) });
  // Fill row by row at this canvas's resolution (a per-row span: no polygon test per texel).
  const sc = c.s;
  for (let iy = 0; iy < c.h; iy++) {
    const y = (iy + 0.5) / sc;
    const inCrown = y > topY;
    const ye = Math.min(y, topY);
    const xl = edgeAt(ye, -1);
    const xr = edgeAt(ye, 1);
    let s0 = 0;
    while (s0 + 1 < strata.length && strata[s0 + 1] <= y) s0++;
    const y0 = strata[s0];
    const y1 = strata[s0 + 1] ?? H;
    const ix0 = Math.max(0, Math.floor(xl * sc));
    const ix1 = Math.min(c.w - 1, Math.ceil(xr * sc));
    for (let ix = ix0; ix <= ix1; ix++) {
      const x = (ix + 0.5) / sc;
      if (x < xl || x > xr) continue;
      if (inCrown && y > crownAt(x)) continue;
      const u = (x - xl) / Math.max(1, xr - xl);
      // Column bands (exact ramp steps — no dither): lit left, base, shade, deep shade at the right edge.
      let t = u < 0.2 ? 0.75 : u < 0.56 ? 0.5 : u < 0.86 ? 0.25 : 0;
      if (wide && Math.abs(u - 0.5) < 0.035) t = 0; // the cleft between the two pillars
      for (const p of planes) {
        const dy = y - (p.y + (x - p.x) * p.a * 0.35);
        if (dy < 0 && dy > -9 && Math.abs(x - p.x) < half0 * 0.5) t = p.lit ? Math.min(1, t + 0.25) : Math.max(0, t - 0.25);
      }
      // Ledge: the stratum's top row catches the light, its underside is in shadow.
      if (y > y1 - 1.2) t = Math.min(1, t + 0.25);
      else if (y < y0 + 1) t = Math.max(0, t - 0.25);
      c.set(ix, iy, mat, t, 0);
    }
  }
  // Long joints: cracks wandering down through several strata (dark, a lit texel to their left).
  for (let i = 0; i < (wide ? 6 : 4); i++) {
    let x = cx + rng.spread(half0 * 0.75);
    let y = rng.range(topY * 0.4, topY - 2);
    const len = rng.range(20, 60);
    for (let j = 0; j < len && y > 2; j++) {
      const nx = x + rng.spread(0.7);
      const ny = y - 1;
      c.line(x, y, nx, ny, mat, 0, 3, FF.THIN);
      if (j % 4 < 2) c.line(x - 1, y, nx - 1, ny, mat, 0.75, 3, FF.THIN);
      x = nx;
      y = ny;
    }
  }
  // Moss on ledges + drips, seeps below some ledges, vines hanging from the crown.
  for (let s = 1; s < strata.length - 1; s++) {
    const y = strata[s];
    if (y > topY) break;
    const xl = edgeAt(y, -1);
    const xr = edgeAt(y, 1);
    const runs = wide ? 3 : 2;
    for (let r = 0; r < runs; r++) {
      if (rng.next() > 0.7) continue;
      const x0 = rng.range(xl + 1, xr - 6);
      const len = rng.range(3, 9);
      c.poly([x0, y - 1, x0 + len, y - 1, x0 + len - 1, y + 1.2, x0 + 1, y + 1.2], m.moss, 0.72, { z: 6 });
      for (let k = 0; k < 2; k++) {
        const dx = x0 + rng.range(0, len);
        c.line(dx, y - 1, dx, y - rng.range(2, 5), m.moss, 0.42, 6);
      }
    }
    if (rng.chance(0.35)) {
      const sx = rng.range(xl + 2, xr - 2);
      c.line(sx, y - 1, sx + rng.spread(1), y - rng.range(6, 16), dark, 0, 2);
    }
  }
  const vines = wide ? 4 : 2;
  for (let i = 0; i < vines; i++) {
    if (rng.next() > 0.75) continue;
    const vx = rng.range(edgeAt(topY, -1) + 2, edgeAt(topY, 1) - 2);
    const len = rng.range(18, 60);
    let x = vx;
    for (let y = topY; y > topY - len; y -= 1) {
      x += Math.sin(y * 0.3 + i) * 0.25;
      c.set(Math.floor(x * c.s), Math.floor(y * c.s), m.vine, 0.45, 9, FF.THIN);
      if ((Math.floor(y) % 4 === 0) && c.s >= 0.5) {
        c.set(Math.floor(x * c.s) + 1, Math.floor(y * c.s), m.vine, 0.7, 9, FF.THIN);
        c.set(Math.floor(x * c.s) - 1, Math.floor(y * c.s) - 1, m.vine, 0.3, 9, FF.THIN);
      }
    }
  }
  // Rubble + grass at the foot.
  for (let i = 0; i < (wide ? 6 : 4); i++) {
    const rx = rng.range(2.5, 5);
    const x = cx + rng.spread(half0);
    c.ellipse(x, rx * 0.6, rx, rx * 0.7, rng.chance(0.5) ? mat : dark, { z: 12, amp: 1.2, bias: -0.05 });
  }
  footGrass(c, m, rng, cx - half0, cx + half0, wide ? 24 : 16);
}

export const CLIFF_SPIRE: FloraSpecies = {
  key: 'cliffSpire',
  w: 64,
  h: 176,
  heightM: 16,
  variants: 2,
  paint(c, m, rng, v) {
    paintSpire(c, m, rng, v, this.w, this.h, false);
  },
};

export const CLIFF_SPIRE_WIDE: FloraSpecies = {
  key: 'cliffSpireWide',
  w: 112,
  h: 128,
  heightM: 12,
  variants: 2,
  paint(c, m, rng, v) {
    paintSpire(c, m, rng, v, this.w, this.h, true);
  },
};

/** Every d1 stone species (one FLORA atlas). */
export const D1_STONES = [BOULDER, BOULDER_WIDE, CLIFF_SPIRE, CLIFF_SPIRE_WIDE];
