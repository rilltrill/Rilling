import { bayer, PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { crack, hash2, smooth } from './surfaces';

/**
 * TYRANT CHASE (d3) ground for ART: PIXEL WORLD — the park road at night in a
 * thunderstorm, painted like an arcade backdrop (Sega's Jurassic Park, Beast
 * Busters): wet black-blue asphalt with tar-sealed cracks, polished wheel
 * paths catching the sky, worn yellow dashes and broken white edge lines, a
 * crumbling shoulder; muddy verges churned by tyres with gravel and grass
 * creeping in; the wet jungle floor (grass, leaf litter, roots, glints of
 * standing water); deep mud; river gravel; rain puddles with expanding ripple
 * rings (animated strips); the Tyrant's three-toed prints pressed into the mud
 * and cracked into the asphalt; tyre skids. Big tiles are painted straight into
 * the canvas arrays (per-row work hoisted) to keep the stage's paint time low.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Frames of every d3 animated strip (one material plays them all). */
export const D3_ANIM_FRAMES = 4;

/** Paint `F` frames of a pattern (vt = row within the frame from its bottom, f = frame). */
export function d3Frames(c: PwCanvas, F: number, paint: (x: number, vt: number, f: number, y: number) => void) {
  const FH = c.h / F;
  for (let f = 0; f < F; f++) {
    const y0 = c.h - (f + 1) * FH;
    for (let yl = 0; yl < FH; yl++) {
      const vt = FH - 1 - yl;
      for (let x = 0; x < c.w; x++) paint(x, vt, f, y0 + yl);
    }
  }
}

// ─── Shared clusters ─────────────────────────────────────────────────────────

/**
 * A clump of grass (wrapping in a `w` × `h` tile): a dark shadow under it, then
 * blades fanning out from the root — dark at the root, mid along the blade, a
 * lit tip; blades leaning left (toward the light) a step lighter. `size` 1…4.
 */
export function grassClump(c: PwCanvas, x: number, y: number, ramp: number, size: number, seed: number, shadow = true) {
  const W = c.w;
  const H = c.h;
  if (shadow) {
    for (let dx = -size - 1; dx <= size + 1; dx++) c.shift(wrap(x + dx, W), wrap(y + 1, H), -0.9);
    for (let dx = -size; dx <= size; dx++) c.shift(wrap(x + dx, W), wrap(y + 2, H), -0.6);
  }
  const n = 3 + size * 2;
  for (let b = 0; b < n; b++) {
    const u = (b + 0.5) / n - 0.5;
    const bx = x + Math.round(u * size * 2);
    const hgt = Math.round(2 + size * 1.4 + hash2(b, seed, 3) * (size + 2) - Math.abs(u) * size * 1.5);
    const lean = u * 1.3 + (hash2(b, seed, 4) - 0.5) * 0.6;
    const lit = lean < 0;
    for (let j = 0; j < hgt; j++) {
      const px = wrap(Math.round(bx + lean * j), W);
      const py = wrap(y - j, H);
      const t = j === hgt - 1 ? (lit ? 4.1 : 3.5) : j < 2 ? 1.8 : lit ? 3.2 : 2.7;
      c.set(px, py, ramp, t);
    }
  }
}

/** A fallen leaf (lens of 3–4 texels, lit upper edge, dark under-edge), wrapping. */
function leafAt(c: PwCanvas, x: number, y: number, ramp: number, vert: boolean, len: number) {
  const W = c.w;
  const H = c.h;
  for (let j = 0; j < len; j++) {
    const px = wrap(x + (vert ? 0 : j), W);
    const py = wrap(y + (vert ? j : 0), H);
    c.set(px, py, ramp, j === 0 || j === len - 1 ? 3 : 4.2);
    c.set(wrap(px + (vert ? 1 : 0), W), wrap(py + (vert ? 0 : 1), H), ramp, 1.6);
  }
}

// ─── The road ────────────────────────────────────────────────────────────────

export interface D3RoadOpts {
  /** Asphalt base colour. */
  hex: number;
  line: number;
  edge: number;
  gravel: number;
  grass: number;
  leaf: number;
}

/** Road tile width (texels) = 8 m: the 7.2 m carriageway + a crumbling 0.4 m shoulder each side (cut out past it). */
export const D3_ROAD_W = 256;

/**
 * The park road (wrap 256 × 320 = 8 × 10 m, v along the road): wet asphalt in
 * worn and patched areas (hard-edged, never a blur), darker polished wheel
 * paths, sparse aggregate, tar snakes, a patch, a pothole full of water, worn
 * yellow centre dashes every 6 m (one more faded), broken white edge lines, a
 * crumbled shoulder with gravel and grass, leaves blown onto the edges.
 */
export function d3RoadTile(atlas: PwAtlas, o: D3RoadOpts): PwTile {
  return atlas.tile(`d3road|${h6(o.hex)}|${h6(o.line)}|4`, D3_ROAD_W, 320, (c, k) => paintRoad(c, k, o), { wrap: true });
}

function paintRoad(c: PwCanvas, k: PwKit, o: D3RoadOpts) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const R = c.ramp;
  const T = c.tone;
  const asp = k.ramp(o.hex, { light: 0.42, dark: 0.4, sat: 0.9 });
  const tar = k.ramp(0x14161c, { light: 0.55, sat: 1.1 });
  const patch = k.ramp(0x2c2f36, { light: 0.4, sat: 0.9 });
  const yl = k.ramp(o.line, { light: 0.45, sat: 1.05 });
  const wh = k.ramp(o.edge, { light: 0.4, sat: 0.7 });
  const grav = k.ramp(o.gravel, { light: 0.45, sat: 0.7 });
  const grass = k.ramp(o.grass, { light: 0.45, sat: 1.05 });
  const leaf = k.ramp(o.leaf, { light: 0.42 });
  const sheen = k.ramp(0x6a7aa0, { light: 0.35, sat: 0.8 });
  // Ragged shoulder edges (per row).
  const eL = new Int16Array(H);
  const eR = new Int16Array(H);
  for (let y = 0; y < H; y++) {
    eL[y] = Math.round(3 + smooth(0, y, 8, H, 12, 61) * 9 + (hash2(0, y >> 1, 62) > 0.8 ? 2 : 0));
    eR[y] = Math.round(W - 4 - smooth(4, y, 8, H, 12, 63) * 9 - (hash2(1, y >> 1, 64) > 0.8 ? 2 : 0));
  }
  // Worn (paler) and resealed (darker) areas: a coarse 8 × 8 grid of hard-edged tones,
  // its borders roughened per texel by a hash (pixel-art "clusters", no dither).
  // (The noise on a 4-texel grid, interpolated per texel and thresholded with a little grain:
  // lobed, irregular outlines — never the grid's rectangles.)
  const GW = W >> 2;
  const GH = H >> 2;
  const noise = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) noise[gy * GW + gx] = smooth(gx * 4, gy * 4, W, H, 5, 13) * 0.7 + smooth(gx * 4, gy * 4, W, H, 14, 14) * 0.3;
  }
  const areaAt = (x: number, y: number) => {
    const fx = x / 4;
    const fy = y / 4;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const xa = ((x0 % GW) + GW) % GW;
    const xb = (xa + 1) % GW;
    const ya = ((y0 % GH) + GH) % GH;
    const yb = (ya + 1) % GH;
    const n = (noise[ya * GW + xa] * (1 - tx) + noise[ya * GW + xb] * tx) * (1 - ty) + (noise[yb * GW + xa] * (1 - tx) + noise[yb * GW + xb] * tx) * ty + (hash2(x >> 1, y >> 1, 15) - 0.5) * 0.06;
    return n > 0.66 ? 1 : n < 0.3 ? -1 : 0;
  };
  // Wheel paths (two per lane): polished, a half step darker.
  const pathMask = new Uint8Array(W);
  for (const px of [56, 96, 160, 200]) for (let x = px - 9; x <= px + 9; x++) pathMask[x] = 1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    const wob = Math.round(Math.sin((y / H) * Math.PI * 2) * 2);
    for (let x = 0; x < W; x++) {
      const i = row + x;
      if (x < eL[y] || x > eR[y]) {
        R[i] = 0;
        continue;
      }
      const a = areaAt(x, y);
      let t = a > 0 ? 3.4 : a < 0 ? 2.4 : 3;
      if (pathMask[(x - wob + W) % W]) t -= 0.5;
      if (x < eL[y] + 5 || x > eR[y] - 5) t = Math.min(t, (x + y) & 1 ? 2 : 2.4);
      R[i] = asp;
      T[i] = t;
    }
  }
  // Aggregate: sparse chips (a lit texel with a dark one under it) and pits.
  for (let i = 0; i < 520; i++) {
    const x = rng.int(12, W - 13);
    const y = rng.int(0, H - 2);
    if (c.at(x, y) !== asp) continue;
    if (i % 3) {
      c.shift(x, y, 1);
      c.shift(x, y + 1, -0.8);
    } else c.cluster(x, y, i % 3, 0, -0.8);
  }
  // Polished glints on the wheel paths: short broken reflections of the sky.
  for (let i = 0; i < 26; i++) {
    const px = [56, 96, 160, 200][i % 4] + rng.int(-4, 4);
    const y = rng.int(0, H - 8);
    const len = rng.int(3, 7);
    for (let j = 0; j < len; j++) if (c.at(px, y + j) === asp) c.set(px, y + j, sheen, j === 0 || j === len - 1 ? 1.6 : 2.2);
  }
  // A repair patch: blacker asphalt, smooth, with a tar seam and a lit lip on its lower edge.
  {
    const x0 = 130;
    const y0 = 40;
    const pw = 70;
    const ph = 58;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const j = hash2(x >> 2, y >> 2, 91) * 3;
        if (x < j || y < j || x >= pw - j || y >= ph - j) continue;
        const edge = x < j + 1 || y < j + 1 || x >= pw - j - 1 || y >= ph - j - 1;
        c.set(x0 + x, y0 + y, edge ? tar : patch, edge ? (y > ph / 2 ? 2.4 : 1.2) : (x + y * 3) % 17 === 0 ? 3.6 : 3);
      }
    }
  }
  // Pothole in the right lane: a broken-edged hollow full of rainwater (the sky in it), chips round it.
  {
    const cx = 192;
    const cy = 290;
    for (let y = -8; y <= 8; y++) {
      for (let x = -12; x <= 12; x++) {
        const d = Math.hypot(x / 12, y / 8) + (hash2(x + 40, y + 40, 94) - 0.5) * 0.25;
        if (d > 1.15) continue;
        if (d > 0.85) c.set(cx + x, cy + y, asp, y < 0 ? 1.4 : 4);
        else c.set(cx + x, cy + y, sheen, y < -3 ? 1.2 : y < 2 ? 2 : 2.6);
      }
    }
    for (let i = 0; i < 10; i++) c.cluster(cx + rng.int(-16, 16), cy + rng.int(-11, 11), i, asp, 1.4);
  }
  // Tar snakes: meandering sealed cracks (glossy black, a lit glint now and then).
  for (let i = 0; i < 9; i++) {
    let x = rng.int(20, W - 20);
    let y = rng.int(0, H - 1);
    let a = rng.next() * Math.PI * 2;
    const len = rng.int(30, 90);
    for (let j = 0; j < len; j++) {
      const ix = Math.round(x);
      const iy = wrap(Math.round(y), H);
      if (ix < 14 || ix > W - 15) break;
      c.set(ix, iy, tar, j % 13 === 6 ? 3.4 : 1);
      if (j % 2 === 0) c.set(ix + 1, iy, tar, 2);
      a += rng.spread(0.45);
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  // Long crack down the centre joint and a few branching transverse ones.
  for (let y = 0; y < H; y++) {
    const x = 128 + Math.round(smooth(0, y, 8, H, 6, 95) * 4 - 2);
    if (hash2(0, y >> 2, 96) > 0.25) c.shift(x, y, -1.4);
  }
  for (let i = 0; i < 5; i++) crack(c, rng, rng.int(20, W - 20), rng.int(0, H - 1), rng.int(14, 34), rng.chance(0.5) ? 0 : Math.PI, { dt: -1.6, lip: 0.7, wrapX: false, branch: 0.06 });
  // Centre dashes (2.6 m every 5 m): yellow paint worn through to the aggregate, chipped ends.
  for (let dsh = 0; dsh < 2; dsh++) {
    const y0 = 20 + dsh * 160;
    const worn = dsh === 1 ? 0.45 : 0.18;
    for (let y = 0; y < 83; y++) {
      for (let x = 126; x < 131; x++) {
        if ((y < 3 || y > 79) && hash2(x, y, 97 + dsh) > 0.5) continue;
        if (hash2(x, (y0 + y) >> 1, 98 + dsh) < worn) continue;
        const t = x === 126 ? 4 : x === 130 ? 2.4 : 3.2;
        c.set(x, wrap(y0 + y, H), yl, hash2(x, y, 99) > 0.9 ? 2.2 : t);
      }
    }
  }
  // Edge lines (0.3 m in, 0.12 m wide), broken every few metres, worn thin.
  for (const ex of [20, W - 25]) {
    for (let y = 0; y < H; y++) {
      const seg = Math.floor(y / 96);
      if (hash2(seg, ex, 101) < 0.3 && y % 96 > 70) continue;
      for (let x = ex; x < ex + 4; x++) {
        if (hash2(x, y >> 1, 102) < 0.14) continue;
        c.set(x, y, wh, x === ex ? 3.8 : x === ex + 3 ? 2.2 : 3);
      }
    }
  }
  // Shoulder: gravel and crumbled chunks of asphalt, grass in the broken edge.
  for (let i = 0; i < 220; i++) {
    const left = i % 2 === 0;
    const y = rng.int(0, H - 2);
    const x = left ? eL[y] + rng.int(0, 9) : eR[y] - rng.int(0, 9);
    if (!c.at(x, y)) continue;
    if (i % 5 === 0) {
      c.set(x, y, asp, 4);
      c.set(x + 1, y, asp, 3.4);
      c.set(x, y + 1, asp, 2.6);
      c.set(x + 1, y + 1, asp, 1.4);
    } else c.cluster(x, y, i, grav, i % 3 ? 3.2 : 4.4);
  }
  for (let i = 0; i < 26; i++) {
    const left = i % 2 === 0;
    const y = rng.int(4, H - 1);
    grassClump(c, left ? eL[y] + 2 : eR[y] - 2, y, grass, 1, i, false);
  }
  // Leaves and frond scraps blown onto the road, mostly near the edges.
  for (let i = 0; i < 46; i++) {
    const edge = rng.chance(0.75);
    const x = edge ? (rng.chance(0.5) ? rng.int(14, 48) : rng.int(W - 48, W - 15)) : rng.int(40, W - 40);
    const y = rng.int(0, H - 2);
    if (!c.at(x, y)) continue;
    leafAt(c, x, y, i % 3 === 0 ? grass : leaf, rng.chance(0.4), rng.int(2, 4));
  }
}

// ─── Verges ──────────────────────────────────────────────────────────────────

export interface D3VergeOpts {
  mud: number;
  grass: number;
  gravel: number;
  leaf: number;
  water: number;
  /** Outer edge on the left (the verge left of the road). */
  mirror?: boolean;
}

/**
 * A muddy verge (wrap 160 × 256 = 5 × 8 m, v along the road, cut out past the
 * grass tips of its outer edge): tyre-churned mud by the road — two ruts with
 * lit berms and rainwater in them, clods, gravel thrown off the shoulder —
 * then grass clumps taking over toward the jungle with leaves among them.
 * `mirror`: the outer edge on the left (u = 0).
 */
export function d3VergeTile(atlas: PwAtlas, o: D3VergeOpts): PwTile {
  return atlas.tile(`d3verge|${h6(o.mud)}|${h6(o.grass)}|${o.mirror ? 1 : 0}|2`, 160, 256, (c, k) => {
    const rng = k.rng;
    const W = c.w;
    const H = c.h;
    const mud = k.ramp(o.mud, { light: 0.42, sat: 0.95 });
    const grass = k.ramp(o.grass, { light: 0.45, sat: 1.05 });
    const grassD = k.ramp(0x2a3a24, { light: 0.4 });
    const grav = k.ramp(o.gravel, { light: 0.45, sat: 0.7 });
    const leaf = k.ramp(o.leaf, { light: 0.42 });
    const water = k.ramp(o.water, { light: 0.4, sat: 0.85 });
    const X = (u: number) => (o.mirror ? W - 1 - u : u);
    const mudTo = new Int16Array(H);
    const endU = new Int16Array(H);
    for (let y = 0; y < H; y++) {
      mudTo[y] = Math.round(46 + smooth(0, y, 8, H, 6, 111) * 40);
      endU[y] = Math.round(W - 14 - smooth(4, y, 8, H, 10, 112) * 26);
    }
    // Ground: mud by the road, dark sod under the grass beyond, hard edge roughened by the hash.
    for (let y = 0; y < H; y++) {
      for (let u = 0; u < W; u++) {
        if (u > endU[y]) continue;
        const x = X(u);
        const j = ((hash2(u >> 1, y >> 1, 113) * 7) | 0) - 3;
        if (u < mudTo[y] + j) c.set(x, y, mud, u < 8 ? 2.4 : 3);
        else c.set(x, y, grassD, 2.6);
      }
    }
    // Tyre ruts: dark grooves with a lit berm, rainwater lying in them in stretches.
    for (const ru of [18, 38]) {
      for (let y = 0; y < H; y++) {
        const uu = ru + Math.round(Math.sin((y / H) * Math.PI * 2 + ru) * 3);
        for (let d = -3; d <= 3; d++) {
          const x = X(uu + d);
          if (c.at(x, y) !== mud) continue;
          c.set(x, y, mud, Math.abs(d) === 3 ? 3.8 : Math.abs(d) === 2 ? 2 : 1.6);
        }
        if (hash2(ru, y >> 4, 116) > 0.45) for (let d = -1; d <= 1; d++) c.set(X(uu + d), y, water, d === -1 ? 1.8 : (y >> 2) % 5 === 0 ? 3.2 : 2.4);
      }
    }
    // Clods and tread scraps in the mud.
    for (let i = 0; i < 120; i++) {
      const u = rng.int(2, 70);
      const y = rng.int(0, H - 2);
      const x = X(u);
      if (c.at(x, y) !== mud) continue;
      c.set(x, y, mud, 4);
      c.set(X(u + 1), y, mud, 3.4);
      c.set(X(u + 1), y + 1, mud, 1.6);
    }
    // Gravel thrown off the shoulder (thinning outward), each stone lit with a shadow.
    for (let i = 0; i < 200; i++) {
      const u = Math.floor(Math.pow(rng.next(), 2) * 60);
      const y = rng.int(0, H - 2);
      const x = X(u);
      if (!c.at(x, y)) continue;
      c.set(x, y, grav, i % 4 === 0 ? 4.4 : 3.4);
      if (i % 3 === 0) c.set(X(u + 1), y, grav, 2.4);
      c.shift(X(u + 1), y + 1, -1);
    }
    // Grass clumps: sparse where the mud ends, a dense sward outward; the outermost tips make the edge.
    for (let i = 0; i < 300; i++) {
      const u = Math.round(40 + Math.pow(rng.next(), 0.55) * (W - 40));
      const y = rng.int(0, H - 1);
      if (u > endU[y] + 6) continue;
      if (u < mudTo[y] && rng.chance(0.7)) continue;
      grassClump(c, X(u), y, grass, u > endU[y] - 10 ? 1 : rng.int(1, 3), i);
    }
    // Leaves among the grass and on the mud edge.
    for (let i = 0; i < 70; i++) {
      const u = rng.int(30, W - 20);
      const y = rng.int(0, H - 2);
      const x = X(u);
      if (!c.at(x, y)) continue;
      leafAt(c, x, y, leaf, rng.chance(0.4), rng.int(2, 3));
    }
    // A few puddles in the churned mud mirroring the sky.
    for (let i = 0; i < 5; i++) {
      const cu = rng.int(10, 56);
      const cy = rng.int(0, H - 1);
      const rx = rng.int(4, 8);
      const ry = rng.int(3, 5);
      for (let y = -ry; y <= ry; y++) {
        for (let u = -rx; u <= rx; u++) {
          const d = (u / rx) ** 2 + (y / ry) ** 2 + (hash2(cu + u, cy + y, 118) - 0.5) * 0.4;
          if (d > 1) continue;
          const x = X(cu + u);
          const yy = wrap(cy + y, H);
          if (!c.at(x, yy)) continue;
          c.set(x, yy, d > 0.65 ? mud : water, d > 0.65 ? (y < 0 ? 1.6 : 3.8) : y < -ry * 0.3 ? 1.8 : (u + y) % 4 === 0 ? 3.2 : 2.6);
        }
      }
    }
  }, { wrap: true });
}

// ─── Terrain ─────────────────────────────────────────────────────────────────

export interface D3FloorOpts {
  hex: number;
  dark: number;
  leaf: number;
  water: number;
  stone: number;
}

/**
 * Wet jungle floor (wrap 128 × 128 = 4 m, world-projected): a dense sward of
 * grass clumps (lit tips, shadowed roots) over dark loam, thinning in patches
 * where the leaf litter, twigs, roots and pebbles show, glints of standing
 * water. Tinted per vertex (darker on the hills).
 */
export function d3FloorTile(atlas: PwAtlas, o: D3FloorOpts): PwTile {
  return atlas.tile(`d3floor|${h6(o.hex)}|${h6(o.dark)}|2`, 128, 128, (c, k) => {
    const rng = k.rng;
    const W = c.w;
    const H = c.h;
    const g = k.ramp(o.hex, { light: 0.45, sat: 1.05 });
    const sod = k.ramp(0x2a3a24, { light: 0.4 });
    const loam = k.ramp(o.dark, { light: 0.4 });
    const leaf = k.ramp(o.leaf, { light: 0.42 });
    const water = k.ramp(o.water, { light: 0.4, sat: 0.85 });
    const stone = k.ramp(o.stone, { light: 0.45, sat: 0.7 });
    // Sod under the grass, bare loam patches (hard edges roughened by the hash).
    const dens = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = smooth(x, y, W, H, 4, 121) * 0.75 + hash2(x >> 1, y >> 1, 122) * 0.25;
        dens[y * W + x] = n;
        if (n < 0.34) c.set(x, y, loam, n < 0.26 ? 2.4 : 3);
        else c.set(x, y, sod, (x * 3 + y * 5) % 11 === 0 ? 3 : 2.6);
      }
    }
    // Litter on the bare patches: leaves, twigs, a root, pebbles, a sliver of water.
    for (let i = 0; i < 70; i++) {
      const x = rng.int(0, W - 1);
      const y = rng.int(0, H - 1);
      if (dens[y * W + x] > 0.42) continue;
      leafAt(c, x, y, leaf, rng.chance(0.4), rng.int(2, 4));
    }
    for (let i = 0; i < 6; i++) {
      let x = rng.int(0, W - 1);
      let y = rng.int(0, H - 1);
      const dx = rng.spread(1);
      const dy = rng.spread(0.6);
      const n = rng.int(6, 16);
      for (let j = 0; j < n; j++) {
        c.set(wrap(Math.round(x), W), wrap(Math.round(y), H), loam, j % 4 === 0 ? 3.6 : 1);
        x += dx + rng.spread(0.3);
        y += dy + rng.spread(0.3);
      }
    }
    for (let i = 0; i < 18; i++) {
      const x = rng.int(0, W - 2);
      const y = rng.int(0, H - 2);
      c.set(x, y, stone, 4.2);
      c.set(x + 1, y, stone, 3.2);
      c.set(x + 1, y + 1, stone, 1.6);
      c.shift(x, y + 1, -1);
    }
    for (let i = 0; i < 6; i++) {
      const x = rng.int(0, W - 6);
      const y = rng.int(1, H - 1);
      if (dens[y * W + x] > 0.4) continue;
      const len = rng.int(3, 6);
      for (let j = 0; j < len; j++) c.set(x + j, y, water, j === 0 || j === len - 1 ? 2.4 : 3.2);
      c.hline(x, y - 1, len, loam, 1.4);
    }
    // The sward: clumps on a jittered grid, fewer (and smaller) where the ground is bare.
    for (let gy = 0; gy < H; gy += 6) {
      for (let gx = 0; gx < W; gx += 7) {
        const x = wrap(gx + rng.int(0, 6) + ((gy / 6) & 1) * 3, W);
        const y = wrap(gy + rng.int(0, 5), H);
        const d = dens[y * W + x];
        if (d < 0.36 && rng.chance(0.85)) continue;
        grassClump(c, x, y, g, d > 0.6 ? rng.int(2, 3) : 1, gx * 31 + gy);
      }
    }
  }, { wrap: true });
}

/** Deep churned mud (wrap 128 × 128): rainwater pools with lit rims, crossing tyre tracks, clods, stones, drowned grass. */
export function d3MudTile(atlas: PwAtlas, o: { hex: number; water: number }): PwTile {
  return atlas.tile(`d3mud|${h6(o.hex)}|${h6(o.water)}|2`, 128, 128, (c, k) => {
    const rng = k.rng;
    const W = c.w;
    const H = c.h;
    const m = k.ramp(o.hex, { light: 0.42, sat: 0.95 });
    const w = k.ramp(o.water, { light: 0.42, sat: 0.85 });
    const grass = k.ramp(0x34492d, { light: 0.45 });
    c.rect(0, 0, W, H, m, (x, y) => ((x * 7 + y * 3) % 13 === 0 ? 3.4 : (x + y * 5) % 17 === 0 ? 2.2 : 2.8));
    // Crossing tyre tracks: pairs of grooves with tread bars and a lit berm.
    for (const [x0, slope] of [[20, 0.18], [86, -0.12]] as [number, number][]) {
      for (let y = 0; y < H; y++) {
        for (const off of [0, 30]) {
          const cx = Math.round(x0 + off + y * slope);
          for (let d = -4; d <= 4; d++) {
            const x = wrap(cx + d, W);
            c.set(x, y, m, Math.abs(d) === 4 ? 3.8 : Math.abs(d) === 3 ? 1.6 : (y + (d & 1)) % 5 === 0 ? 1.6 : 2.2);
          }
        }
      }
    }
    // Rainwater pools: ragged lenses, the far rim in shadow, the near lip lit, sky in the water.
    for (let i = 0; i < 7; i++) {
      const cx = rng.int(0, W - 1);
      const cy = rng.int(0, H - 1);
      const rx = rng.int(6, 16);
      const ry = rng.int(4, 9);
      for (let y = -ry - 1; y <= ry + 1; y++) {
        for (let x = -rx - 1; x <= rx + 1; x++) {
          const d = (x / rx) ** 2 + (y / ry) ** 2 + (hash2(cx + x, cy + y, 133) - 0.5) * 0.35;
          if (d > 1.25) continue;
          const px = wrap(cx + x, W);
          const py = wrap(cy + y, H);
          if (d > 0.9) c.set(px, py, m, y < 0 ? 1.4 : 3.8);
          else c.set(px, py, w, y < -ry * 0.4 ? 1.8 : (x + y * 2) % 7 === 0 ? 3.2 : 2.4);
        }
      }
    }
    // Clods with lit tops, a few stones, drowned grass blades.
    for (let i = 0; i < 70; i++) {
      const x = rng.int(0, W - 2);
      const y = rng.int(0, H - 2);
      if (c.at(x, y) !== m) continue;
      c.set(x, y, m, 4.2);
      c.set(x + 1, y, m, 3.4);
      c.set(x, y + 1, m, 2);
      c.set(x + 1, y + 1, m, 1.2);
    }
    for (let i = 0; i < 14; i++) grassClump(c, rng.int(0, W - 1), rng.int(0, H - 1), grass, 1, i, false);
  }, { wrap: true });
}

/**
 * Gorge rock (wrap 64 × 64 = 2 m): wet basalt in strata — beds 6–11 texels thick, each its own
 * tone, a lit ledge on top and a shadowed undercut below, joints splitting the beds into blocks
 * (lit left edge / dark right), a few chips, moss clumps on the ledges. Placed by rule per bed
 * (cheap: no per-texel cell search).
 */
export function d3RockTile(atlas: PwAtlas, o: { hex: number; moss: number }): PwTile {
  return atlas.tile(`d3rock|${h6(o.hex)}|${h6(o.moss)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const r = k.ramp(o.hex, { light: 0.45, sat: 0.85 });
    const moss = k.ramp(o.moss, { light: 0.42, sat: 1.05 });
    const R = c.ramp;
    const T = c.tone;
    let y0 = 0;
    let bed = 0;
    while (y0 < 64) {
      const h = Math.min(64 - y0, 6 + Math.floor(hash2(bed, 1, 81) * 6));
      const base = hash2(bed, 2, 81) > 0.6 ? 3.2 : hash2(bed, 3, 81) > 0.5 ? 2.6 : 3;
      // Joints across the bed (block edges), offset bed to bed.
      const j0 = Math.floor(hash2(bed, 4, 81) * 16);
      const step = 12 + Math.floor(hash2(bed, 5, 81) * 10);
      for (let y = y0; y < y0 + h; y++) {
        const ly = y - y0;
        const row = y * 64;
        for (let x = 0; x < 64; x++) {
          const jx = (x - j0 + 64) % step;
          let t = base;
          if (ly === 0) t = base + 1;
          else if (ly === h - 1) t = 1;
          else if (jx === 0) t = 1.4;
          else if (jx === 1) t = base + 0.8;
          else if (jx === step - 1) t = base - 0.7;
          R[row + x] = r;
          T[row + x] = t;
        }
      }
      // Moss on the ledge (clumps).
      for (let x = 0; x < 64; x++) if (smooth(x, bed * 7, 64, 64, 6, 82) > 0.6) c.set(x, y0, moss, hash2(x, bed, 83) > 0.5 ? 3.6 : 2.8);
      y0 += h;
      bed++;
    }
    for (let i = 0; i < 22; i++) c.cluster(rng.int(0, 63), rng.int(0, 63), i, 0, i % 3 ? -0.8 : 0.8);
  }, { wrap: true });
}

/** River gravel of the gorge bed (wrap 64 × 64): rounded stones lit top-left in silt, wet. */
export function d3GravelTile(atlas: PwAtlas, o: { hex: number; silt: number }): PwTile {
  return atlas.tile(`d3gravel|${h6(o.hex)}|${h6(o.silt)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.45, sat: 0.8 });
    const silt = k.ramp(o.silt, { light: 0.4 });
    c.rect(0, 0, 64, 64, silt, (x, y) => (smooth(x, y, 64, 64, 4, 141) < 0.4 ? 2 : 3));
    for (let i = 0; i < 70; i++) {
      const cx = rng.int(0, 63);
      const cy = rng.int(0, 63);
      const rx = rng.range(1.5, 4);
      const ry = rx * rng.range(0.6, 0.9);
      for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
        for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
          const d = (x / rx) ** 2 + (y / ry) ** 2;
          if (d > 1) continue;
          const l = -x / rx - y / ry;
          c.set(wrap(cx + x, 64), wrap(cy + y, 64), s, d > 0.7 ? (l > 0 ? 3.6 : 1.4) : l > 0.6 ? 4.4 : l < -0.6 ? 2.2 : 3);
        }
      }
    }
  }, { wrap: true });
}

// ─── Decals ──────────────────────────────────────────────────────────────────

/**
 * A rain puddle (animated module, 64 × 48 a frame, cut out): a ragged muddy
 * rim (lit), and water that MIRRORS THE STORM SKY — unlit, so a night pool reads
 * as water rather than a hole in the ground (lit water went near-black under
 * the storm's light): the body at the sky ramp's tone 1 (≈ the fog colour, a
 * shade under the mud), a few broken 2-texel reflection dashes and at most
 * three rain rings (2-texel arcs on their near half, opening over the frames) a
 * single step brighter (tone 2: dim storm blue, never near a telegraph ring's
 * brightness). No 1-texel detail, two tones only: at a distance the puddle stays
 * a calm pool (its material takes its levels a step early, and its glow follows
 * the lightning flash — see `D3PixelWorld.puddle` / `update`).
 */
export function d3PuddleDecal(atlas: PwAtlas, o: { rim: number; sky: number }, variant = 0): PwTile {
  const F = D3_ANIM_FRAMES;
  const W = 64;
  const FH = 48;
  return atlas.tile(`d3puddle5|${h6(o.rim)}|${h6(o.sky)}|${variant}|${F}`, W, FH * F, (c, k) => {
    const rim = k.ramp(o.rim, { light: 0.42 });
    const sky = k.ramp(o.sky, { light: 0.4, sat: 0.8 });
    // Shape (shared by every frame).
    const shape = new Float32Array(W * FH);
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - W / 2) / (W / 2);
        const v = (y + 0.5 - FH / 2) / (FH / 2);
        const a = Math.atan2(v, u);
        const r = 0.86 + Math.sin(a * 2 + variant * 2.1) * 0.07 + Math.sin(a * 5 + variant) * 0.05 + (smooth(x, y, W, FH, 8, 150 + variant) - 0.5) * 0.12;
        shape[y * W + x] = Math.hypot(u, v) / r;
      }
    }
    d3Frames(c, F, (x, vt, f, y) => {
      const ly = FH - 1 - vt;
      const d = shape[ly * W + x];
      if (d > 1) return;
      if (d > 0.84) {
        if (d > 0.95 && bayer(x, ly) < 0.5) return;
        c.set(x, y, rim, d > 0.92 ? 1.6 : 1.2);
        return;
      }
      // Reflection dashes: 2 rows in every 12, 6–12 texels long, drifting a texel a frame (the wind).
      const band = Math.floor(ly / 2);
      if (band % 6 === 1 && d < 0.78 && hash2((x + f) >> 3, band, 152 + variant) > 0.5) {
        c.set(x, y, sky, 2, PWF.GLOW);
        return;
      }
      // Calm water: the storm sky mirrored, one flat tone (no dither speckle).
      c.set(x, y, sky, 1, PWF.GLOW);
    });
    // Rain rings: three, each a near-half arc (2-texel dashes) opening over the frames.
    for (let i = 0; i < 3; i++) {
      const rx = 14 + hash2(i, 1, 151 + variant) * (W - 28);
      const ry = 12 + hash2(i, 2, 151 + variant) * (FH - 24);
      const ph = (i * 3 + variant) % F;
      for (let f = 0; f < F; f++) {
        const age = (f + ph) % F;
        const rr = 2 + age * 2;
        const y0 = c.h - (f + 1) * FH;
        const n = Math.max(8, Math.round(rr * 6));
        for (let q = 0; q < n; q++) {
          const a = (q / n) * Math.PI * 2;
          if (Math.sin(a) < 0.3 || (q >> 1) % 2 === 1) continue; // near half, 2 on 2 off
          const x = Math.round(rx + Math.cos(a) * rr * 1.3 - 0.5);
          const ly = Math.round(ry + Math.sin(a) * rr - 0.5);
          if (x < 0 || x >= W || ly < 0 || ly >= FH || shape[ly * W + x] > 0.8) continue;
          // A fading ring (its last frame) sinks back to the water's tone.
          c.set(x, y0 + ly, sky, age === F - 1 ? 1 : 2, PWF.GLOW);
        }
      }
    }
  });
}

/**
 * The Tyrant's footprint (module 64 × 80 = 2 × 2.5 m, toes toward −v... the top of the
 * module): three splayed toes with claw gouges and a heel pad pressed into the
 * mud, rainwater in the bottom, a lit squeezed-up rim.
 */
export function d3FootprintDecal(atlas: PwAtlas, o: { mud: number; water: number }, asphalt = false): PwTile {
  const W = 64;
  const H = 80;
  return atlas.tile(`d3print|${h6(o.mud)}|${h6(o.water)}|${asphalt ? 1 : 0}|2`, W, H, (c, k) => {
    const m = k.ramp(o.mud, { light: 0.42 });
    const w = k.ramp(o.water, { light: 0.4, sat: 0.85 });
    // Distance field of the print: heel ellipse + three toe capsules.
    const toes: [number, number, number, number][] = [
      [32, 50, 32, 6],
      [31, 52, 10, 14],
      [33, 52, 54, 14],
    ];
    const seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(px - ax - dx * t, py - ay - dy * t);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let d = Math.hypot((px - 32) / 15, (py - 58) / 13) * 12 - 12;
        for (const [ax, ay, bx, by] of toes) {
          const tw = 4.5 - (Math.hypot(px - bx, py - by) < 8 ? 1.5 : 0);
          d = Math.min(d, seg(px, py, ax, ay, bx, by) - tw);
        }
        d += (hash2(x, y, 161) - 0.5) * 1.2;
        if (asphalt) {
          // In asphalt: the surface cracked and stoved in round the print, rain lying in it
          // (the sky in the water, brighter toward the toes: it reads as a print-shaped pool, not a blot).
          if (d < -1.5) c.set(x, y, w, py < 34 ? (bayer(x, y) < 0.5 ? 3.4 : 3) : bayer(x, y) < 0.3 ? 3 : 2.5);
          else if (d < 0) c.set(x, y, m, 1);
          else if (d < 2.5 && hash2(x >> 1, y >> 1, 162) > 0.4) c.set(x, y, m, 3.8);
          continue;
        }
        if (d < -1.5) c.set(x, y, py > 60 || d < -4 ? w : m, py > 60 || d < -4 ? (bayer(x, y) < 0.3 ? 3 : 2.4) : 1.6);
        else if (d < 0) c.set(x, y, m, 1.4);
        else if (d < 2.6) c.set(x, y, m, d < 1.3 ? 4 : 3.2);
      }
    }
    // Claw gouges past the toe tips.
    for (const [, , bx, by] of toes) {
      const dx = bx - 32;
      const dy = by - 52;
      const l = Math.hypot(dx, dy);
      for (let s = 0; s < 7; s++) c.set(Math.round(bx + (dx / l) * s), Math.round(by + (dy / l) * s), m, s < 5 ? 0.8 : 1.8);
    }
    if (asphalt) {
      // Radiating cracks.
      for (let i = 0; i < 9; i++) {
        let a = (i / 9) * Math.PI * 2;
        let x = 32 + Math.cos(a) * 14;
        let y = 52 + Math.sin(a) * 16;
        for (let j = 0; j < 12; j++) {
          c.set(Math.round(x), Math.round(y), m, 1);
          a += (hash2(i, j, 163) - 0.5) * 0.8;
          x += Math.cos(a);
          y += Math.sin(a);
        }
      }
    }
  });
}

/** A tyre skid (module 32 × 192 = 1 × 6 m): two black rubber streaks, fading in, wobbling, ending in scuffs. */
export function d3SkidDecal(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d3skid|${h6(o.hex)}`, 32, 192, (c, k) => {
    const r = k.ramp(o.hex, { light: 0.4 });
    for (let y = 0; y < 192; y++) {
      const k0 = y / 192;
      const wob = Math.sin(k0 * 7) * 1.5 + k0 * 3;
      for (const cx of [7, 24]) {
        for (let x = -3; x <= 3; x++) {
          if (bayer(cx + x, y) < 1 - k0 * 1.6) continue;
          if (Math.abs(x) === 3 && hash2(x, y, 171) > 0.5) continue;
          c.set(Math.round(cx + x + wob), y, r, Math.abs(x) < 2 ? 1 : 1.8);
        }
      }
    }
  });
}

/**
 * The muddy stretch of road (wrap 256 × 256 = 8 m, v along the road, ragged
 * edges): two deep wheel ruts brimming with brown rainwater (rippled, a lit
 * near bank, a shadowed far one), the churned hump between them with clods and
 * tread bars, a plank thrown down for grip, grass clumps along the edges.
 */
export function d3MudRoadTile(atlas: PwAtlas, o: { hex: number; water: number; plank: number }): PwTile {
  return atlas.tile(`d3mudroad|${h6(o.hex)}|${h6(o.water)}|3`, 256, 128, (c, k) => {
    const rng = k.rng;
    const W = c.w;
    const H = c.h;
    const m = k.ramp(o.hex, { light: 0.42, sat: 0.95 });
    const w = k.ramp(o.water, { light: 0.42, sat: 0.85 });
    const pl = k.ramp(o.plank, { light: 0.4 });
    const grass = k.ramp(0x34492d, { light: 0.45 });
    const ruts = [72, 184];
    for (let y = 0; y < H; y++) {
      const eL = 4 + Math.round(smooth(0, y, 8, H, 8, 181) * 14);
      const eR = W - 5 - Math.round(smooth(4, y, 8, H, 8, 182) * 14);
      const wob = Math.round(Math.sin((y / H) * Math.PI * 2) * 4);
      for (let x = 0; x < W; x++) {
        if (x < eL || x > eR) continue;
        let r = m;
        let t = (x * 7 + y * 3) % 13 === 0 ? 3.4 : (x + y * 5) % 17 === 0 ? 2.2 : 2.8;
        for (const rx of ruts) {
          const d = x - rx - wob;
          const ad = d < 0 ? -d : d;
          if (ad < 20) {
            if (ad < 13) {
              r = w;
              // Ripples: short lit dashes across the flow; the far bank's shadow on the water.
              t = d < -10 ? 1.4 : (y + ((x * 3) >> 2)) % 19 === 0 ? 3.4 : (y >> 1) % 9 === 0 && ad < 8 ? 2.8 : 2.2;
            } else t = d > 0 ? (ad < 15 ? 4 : 3.2) : ad < 15 ? 1.6 : 2.4;
          }
        }
        if (x < eL + 4 || x > eR - 4) t = Math.min(t, 2.2);
        c.set(x, y, r, t);
      }
    }
    // Clods thrown up on the hump and the edges.
    for (let i = 0; i < 80; i++) {
      const x = rng.int(6, W - 7);
      const y = rng.int(0, H - 1);
      if (c.at(x, y) !== m) continue;
      c.set(x, y, m, 4.3);
      c.set(x + 1, y, m, 3.4);
      c.set(x + 1, wrap(y + 1, H), m, 1.4);
    }
    // Tread bars across the mud between the ruts.
    for (let y = 0; y < H; y += 6) for (let x = 102; x < 154; x++) if (hash2(x >> 2, y, 184) > 0.45 && c.at(x, y) === m) c.set(x, y, m, 1.6);
    // A plank thrown down for grip, half sunk.
    for (let j = 0; j < 14; j++) {
      for (let i = 0; i < 60; i++) {
        const x = 50 + i;
        const y = 56 + j + Math.round(i * 0.12);
        if (j === 0) c.set(x, y, pl, 4);
        else if (j === 13) c.set(x, y, pl, 1.4);
        else c.set(x, y, pl, (i + j * 7) % 19 === 0 ? 2 : 3);
      }
    }
    for (let i = 0; i < 6; i++) c.cluster(52 + i * 9, 62 + i, i, m, 2.6);
    // Grass clumps along the edges.
    for (let i = 0; i < 22; i++) grassClump(c, i % 2 ? rng.int(4, 22) : rng.int(W - 23, W - 5), rng.int(0, H - 1), grass, rng.int(1, 2), i + 400);
  }, { wrap: true });
}

/**
 * Rain-beaten water (animated wrap 64 × 64 a frame, D3_ANIM_FRAMES frames): dark
 * water mirroring the storm in broad bands, rain rings opening and fading, short
 * lit ripple dashes drifting with the current (`flow` texels a frame along v).
 */
export function d3WaterTile(atlas: PwAtlas, o: { hex: number; deep: number; flow?: number }): PwTile {
  const F = D3_ANIM_FRAMES;
  const S = 64;
  return atlas.tile(`d3water|${h6(o.hex)}|${h6(o.deep)}|${o.flow ?? 0}|${F}`, S, S * F, (c, k) => {
    const w = k.ramp(o.hex, { light: 0.5, sat: 0.95 });
    const dp = k.ramp(o.deep, { light: 0.45, sat: 0.95 });
    const flow = o.flow ?? 0;
    // Static field: broad darker troughs (2 × 2 sampled), crest dashes.
    const band = new Uint8Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) band[y * S + x] = smooth(x, y, S, S, 3, 7) < 0.36 ? 1 : 0;
    const crest = new Uint8Array(S * S);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(hash2(i, 1, 3) * S);
      const y = Math.floor(hash2(i, 2, 3) * S);
      const len = 2 + Math.floor(hash2(i, 3, 3) * 5);
      for (let j = 0; j < len; j++) {
        crest[y * S + ((x + j) & 63)] = 1;
        crest[((y + 1) & 63) * S + ((x + j) & 63)] = 2;
      }
    }
    d3Frames(c, F, (x, vt, f, y) => {
      const sy = (S - 1 - vt + f * flow) & 63;
      const cr = crest[sy * S + x];
      c.set(x, y, band[sy * S + x] ? dp : w, cr === 1 ? 3.8 : cr === 2 ? 2.2 : band[sy * S + x] ? 2.6 : 3);
    });
    // Rain rings, drawn as wrapped outlines per frame.
    for (let i = 0; i < 9; i++) {
      const rx = hash2(i, 4, 3) * S;
      const ry = hash2(i, 5, 3) * S;
      const ph = Math.floor(hash2(i, 6, 3) * F);
      for (let f = 0; f < F; f++) {
        const age = (f + ph) % F;
        const rr = 1 + age * 1.8;
        const y0 = c.h - (f + 1) * S;
        const n = Math.max(8, Math.round(rr * 7));
        for (let q = 0; q < n; q++) {
          const a = (q / n) * Math.PI * 2;
          const x = Math.round(rx + Math.cos(a) * rr * 1.3 - 0.5) & 63;
          const ly = Math.round(ry + Math.sin(a) * rr - 0.5) & 63;
          c.set(x, y0 + ly, w, age === F - 1 ? 3.2 : 4);
        }
      }
    }
  }, { wrap: true });
}
