import { FloraCanvas, FloraPalette, FloraRng, FF, type FloraRampOptions } from './floraPaint';

/**
 * FLORA species: hand-pixelled plant sprites painted procedurally (several
 * deterministic variants each) for the ART: SPRITES scenery billboards — the
 * classic arcade / Doom way of drawing jungle and street trees, instead of the
 * faceted 3D blobs and cones of ART: 3D.
 *
 * Every painter draws in LEVEL-0 TEXELS, y up, the plant's foot at the bottom
 * centre of a `w × h` canvas (multiples of 8 so each of the four painted mip
 * levels lands on whole texels). `heightM` is the world height the sprite
 * stands for: the billboard is scaled to the 3D plant it replaces, so texels
 * come out ≈ 2.5–3 cm for undergrowth, ≈ 5 cm for palms and ≈ 8 cm for the
 * rainforest giants — about one retro pixel at the distance each layer is
 * planted at, like the PixelCast characters.
 *
 * Colours: a biome (`FloraBiome`) gives the base colours, taken from the
 * stage's 3D palette so both ART modes read alike; each becomes a 6-step
 * hue-shifted ramp (`FloraPalette`).
 */

export interface FloraBiome {
  leaf: number;
  leafLight: number;
  leafDark: number;
  frond: number;
  frondDark: number;
  fern: number;
  fernLight: number;
  bark: number;
  barkDark: number;
  palmTrunk: number;
  palmRing: number;
  moss: number;
  vine: number;
  grass: number;
  grassLight: number;
  cycad: number;
  cycadTrunk: number;
  ear: number;
  coconut: number;
  flowers: number[];
  /** Ramp chroma multiplier (night biomes are calmer). */
  sat?: number;
  /** How far plant highlights climb toward white (default 0.5; night biomes lower). */
  light?: number;
  /** Ceiling of any plant ramp step (OKLab lightness): night plants never go pale / mint. */
  cap?: number;
  /** Extra named colours (street props): each becomes a ramp in `FloraMats.extra` (a colour, or a colour with its own ramp options). */
  extra?: Record<string, number | ({ hex: number } & FloraRampOptions)>;
}

/** Material ids of a biome inside one palette. */
export interface FloraMats {
  leaf: number;
  leafLight: number;
  leafDark: number;
  frond: number;
  frondDark: number;
  frondDry: number;
  fern: number;
  fernLight: number;
  bark: number;
  barkDark: number;
  palmTrunk: number;
  palmRing: number;
  moss: number;
  vine: number;
  grass: number;
  grassLight: number;
  cycad: number;
  cycadTrunk: number;
  ear: number;
  coconut: number;
  flowers: number[];
  /** Ramps of the biome's `extra` colours, by name. */
  extra: Record<string, number>;
}

export function floraMats(pal: FloraPalette, b: FloraBiome): FloraMats {
  const sat = b.sat ?? 1.05;
  const light = b.light ?? 0.5;
  const leaf = (hex: number) => pal.add(hex, { sat, dark: 0.34, light, cap: b.cap });
  const wood = (hex: number) => pal.add(hex, { sat: sat * 0.95, dark: 0.38, light: light * 0.9, cap: b.cap });
  return {
    leaf: leaf(b.leaf),
    leafLight: leaf(b.leafLight),
    leafDark: leaf(b.leafDark),
    frond: leaf(b.frond),
    frondDark: leaf(b.frondDark),
    frondDry: wood(0x8a7a3a),
    fern: leaf(b.fern),
    fernLight: leaf(b.fernLight),
    bark: wood(b.bark),
    barkDark: wood(b.barkDark),
    palmTrunk: wood(b.palmTrunk),
    palmRing: wood(b.palmRing),
    moss: leaf(b.moss),
    vine: leaf(b.vine),
    grass: leaf(b.grass),
    grassLight: leaf(b.grassLight),
    cycad: leaf(b.cycad),
    cycadTrunk: wood(b.cycadTrunk),
    ear: leaf(b.ear),
    coconut: wood(b.coconut),
    flowers: b.flowers.map((f) => pal.add(f, { sat: 1.1, dark: 0.45, light: 0.6 })),
    extra: Object.fromEntries(
      Object.entries(b.extra ?? {}).map(([k, e]) => [k, typeof e === 'number' ? pal.add(e, { sat: 1.05, dark: 0.36, light: 0.4 }) : pal.add(e.hex, { sat: 1.05, dark: 0.36, light: 0.4, ...e })]),
    ),
  };
}

export interface FloraSpecies {
  key: string;
  /** Canvas size in level-0 texels (multiples of 8). */
  w: number;
  h: number;
  /** World height (m) the sprite is drawn for. */
  heightM: number;
  variants: number;
  /**
   * Strand plants (grass, ferns, fronds): the atlas painter repaints each mip
   * level with a lower `FloraCanvas.density` until its coverage matches the
   * next finer level's, so the plant keeps its weight when it switches level.
   */
  balance?: boolean;
  paint(c: FloraCanvas, m: FloraMats, rng: FloraRng, variant: number): void;
}

// ─── Shared parts ────────────────────────────────────────────────────────────

/**
 * Palm / fern / cycad frond seen from the side: an arching rachis (`ang` =
 * launch angle, radians from +x; `droop` = how far the tip falls, texels) with
 * a comb of one-texel leaflets every `spacing` texels on both sides — the near
 * row lit and hanging forward, the far row darker and hanging back, longest
 * mid-frond, gaps between them so the frond reads as a frond, not a fan.
 * `facing` < 1 = a frond toward / away from the viewer: shorter, leaflets fanned
 * out to both sides. `stiff` = leaflets stand out straight (ferns, cycads).
 */
function frond(
  c: FloraCanvas,
  x: number,
  y: number,
  ang: number,
  len: number,
  droop: number,
  leafLen: number,
  mat: number,
  matFar: number,
  rng: FloraRng,
  o: { z?: number; bias?: number; facing?: number; spacing?: number; stiff?: number; rachis?: number } = {},
) {
  const facing = o.facing ?? 1;
  const L = len * facing;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const dir = ca >= 0 ? 1 : -1;
  const at = (t: number): [number, number] => [x + ca * L * t, y + sa * L * t - droop * facing * t * t];
  const z = o.z ?? 0;
  const bias = o.bias ?? 0;
  const spacing = o.spacing ?? 2.4;
  const stiff = o.stiff ?? 0;
  const steps = Math.max(4, Math.floor(L / spacing));
  // Far row first, then the near row, then the rachis over both.
  for (let row = 0; row < 2; row++) {
    const far = row === 0;
    for (let i = 1; i <= steps; i++) {
      const t = (i - (far ? 0.5 : 0)) / steps;
      if (t < 0.07 || t > 1) continue;
      const [px, py] = at(t);
      const [qx, qy] = at(Math.min(1, t + 0.03));
      const ta = Math.atan2(qy - py, qx - px);
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.03)), 0.6);
      const ll = leafLen * env * (far ? 0.82 : 1) * rng.range(0.88, 1.12);
      // One-texel leaflets stay one texel at the coarser mip levels: a balanced level draws
      // fewer of them (evenly spread) so the frond keeps its weight (the RNG is drawn either
      // way: same layout per level).
      if (ll < 1.2 || (i * 0.618034 + row * 0.5) % 1 >= c.density) continue;
      // Angle from the rachis: drooping pinnae (palms) or stiff combs (ferns).
      let off = far ? 1.75 - stiff * 0.35 : 0.95 - stiff * 0.15;
      if (facing < 1) off = far ? Math.PI - 0.7 : 0.7;
      const la = ta - dir * off * (far && facing < 1 ? -1 : 1);
      const hang = (1 - stiff) * 0.35;
      const mx = px + Math.cos(la) * ll * 0.55;
      const my = py + Math.sin(la) * ll * 0.55;
      const ex = px + Math.cos(la) * ll;
      const ey = py + Math.sin(la) * ll - ll * hang;
      const tone = 0.5 + bias + (far ? -0.13 : 0.08) - t * 0.1 + (i % 2 ? 0.04 : -0.03);
      const m = far ? matFar : mat;
      c.line(px, py, mx, my - ll * hang * 0.3, m, tone, z + (far ? -1 : 0.5));
      c.line(mx, my - ll * hang * 0.3, ex, ey, m, tone - 0.06, z + (far ? -1 : 0.5));
    }
  }
  const n = Math.max(4, Math.ceil(L / 4));
  const pts: number[] = [];
  const ws: number[] = [];
  for (let i = 0; i <= n; i++) {
    const [px, py] = at(i / n);
    pts.push(px, py);
    ws.push((o.rachis ?? 1) * (1 - 0.5 * (i / n)));
  }
  c.stroke(pts, ws, mat, { z: z + 1, bias: bias + 0.1, flag: FF.SOFT, flat: 0.7 });
}

/**
 * Fern frond: an arching, tapering band along a drooping rachis whose edges
 * break into swept-forward leaflets — a serrated outline, dark notches between
 * the leaflets, a pale midrib, the upper half lit and the underside in shade.
 * (A one-texel comb merges into a solid blade at this size; the band reads as
 * a fern at every distance.)
 */
function fernFrond(
  c: FloraCanvas,
  x: number,
  y: number,
  ang: number,
  len: number,
  droop: number,
  wid: number,
  mat: number,
  o: { z?: number; bias?: number; spacing?: number; sx?: number; sy?: number } = {},
) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  // (sx / sy stretch the frond's path: a low, spreading fern is the same fountain, flattened.)
  const sx = o.sx ?? 1;
  const sy = o.sy ?? 1;
  const at = (t: number): [number, number] => [x + ca * len * t * sx, y + (sa * len * t - droop * t * t) * sy];
  const z = o.z ?? 0;
  const bias = o.bias ?? 0;
  const sp = o.spacing ?? 3.2;
  const steps = Math.max(8, Math.ceil(len / 0.6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (t < 0.05) continue;
    const [px, py] = at(t);
    const [qx, qy] = at(Math.min(1, t + 0.01));
    let tx = qx - px;
    let ty = qy - py;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl;
    ty /= tl;
    // Leaflet phase along the frond: 0 at a notch, 1 at a leaflet's tip.
    const ph = ((t * len) / sp) % 1;
    const tip = Math.sin(ph * Math.PI);
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)), 0.7);
    // (A balanced coarser level narrows the band so the fern keeps its weight.)
    const w = wid * env * (0.5 + 0.5 * tip) * Math.pow(c.density, 0.8);
    for (let side = -1; side <= 1; side += 2) {
      // Perpendicular, swept toward the frond tip.
      let nx = -ty * side + tx * 0.55;
      let ny = tx * side + ty * 0.55;
      const nl = Math.sqrt(nx * nx + ny * ny);
      nx /= nl;
      ny /= nl;
      const up = ny > 0;
      const tone = 0.5 + bias + (up ? 0.12 : -0.08) - t * 0.08 + (ph < 0.18 || ph > 0.88 ? -0.2 : 0);
      c.line(px, py, px + nx * w, py + ny * w, mat, tone, z, FF.SOFT);
    }
    // Midrib.
    c.line(px, py, px + tx * 0.6, py + ty * 0.6, mat, 0.5 + bias + 0.2, z + 0.5, FF.SOFT);
  }
}

/** Hanging vine: a wavy 1-texel strand with leaf pairs every few texels. */
function vine(c: FloraCanvas, x: number, y: number, len: number, mat: number, rng: FloraRng, z: number, bias = 0) {
  const pts: number[] = [];
  const ws: number[] = [];
  const ph = rng.next() * 6;
  const amp = rng.range(1.2, 3);
  const n = Math.max(3, Math.ceil(len / 4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(x + Math.sin(t * 5 + ph) * amp * t, y - len * t);
    ws.push(0.6);
  }
  c.stroke(pts, ws, mat, { z, bias, flag: FF.THIN | FF.SOFT, flat: 1 });
  for (let i = 2; i < n; i += 1) {
    // (A balanced coarser level keeps an evenly spread share of the leaves: the RNG is drawn either way.)
    if (rng.chance(0.35) || (i * 0.618034 + 0.2) % 1 >= c.density) continue;
    const t = i / n;
    const px = x + Math.sin(t * 5 + ph) * amp * t;
    const py = y - len * t;
    const sd = i % 2 ? 1 : -1;
    c.leaf(px, py, sd > 0 ? -0.5 : Math.PI + 0.5, rng.range(2.5, 4), 1.1, mat, { z: z + 0.2, bias: bias + 0.05, flag: FF.SOFT });
  }
}

/**
 * Buttress roots: the trunk foot flares out in concave plates; each plate is a
 * lit ridge on its upper-left edge with its shaded face below it, and dark
 * gaps open between plates at the ground.
 */
function roots(c: FloraCanvas, cx: number, half: number, rootH: number, spread: number, mat: number, dark: number, rng: FloraRng, z: number) {
  // The flare: a concave skirt from the trunk sides down to the ground.
  const pts: number[] = [];
  const m = 8;
  for (let j = 0; j <= m; j++) {
    const t = j / m;
    pts.push(cx - half - spread * Math.pow(1 - t, 2.2), rootH * t);
  }
  for (let j = m; j >= 0; j--) {
    const t = j / m;
    pts.push(cx + half + spread * Math.pow(1 - t, 2.2), rootH * t);
  }
  c.poly(pts, mat, (px, py) => {
    const u = (px - cx) / (half + spread * Math.pow(1 - py / rootH, 2.2));
    return 0.5 - u * 0.28 - (1 - py / rootH) * 0.05;
  }, { z });
  const n = rng.int(4, 5);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const u = t * 2 - 1; // −1 left … 1 right
    const foot = cx + u * (half + spread * rng.range(0.7, 0.95));
    const topX = cx + u * half * 0.55;
    const topY = rootH * rng.range(0.8, 1.15) * (1 - Math.abs(u) * 0.25);
    // Ridge (lit on the left half, shaded on the right).
    const lit = u < 0.1;
    c.curve(topX, topY, topX + (foot - topX) * 0.25, rootH * 0.18, foot, 0.5, 2.2, 1.4, mat, { z: z + 2, bias: lit ? 0.12 : -0.08, amp: 1.2 });
    // Gap between this plate and the next at the ground.
    if (i < n - 1) {
      const nx = cx + ((i + 1) / n * 2 - 1) * (half + spread * 0.8);
      const gx = (foot + nx) / 2;
      c.poly([gx - 2.5, 0, gx + 2.5, 0, gx + 0.5, rootH * 0.35, gx - 0.5, rootH * 0.35], dark, 0.12, { z: z + 1 });
    }
  }
}

/**
 * Cycad / pineapple trunk: a bulbous base tapering to a narrower neck under the
 * crown, its silhouette notched by the scale tips. Cylinder-shaded in flat
 * bands (lit column left, shadow band right — the outline only on the shadow
 * side), covered in offset rows of diamond leaf-base scales that crowd toward
 * the edges as the trunk turns away: each scale a lit upper edge, the base
 * colour, a dark notch under its point and dark seams between them.
 */
function scalyTrunk(c: FloraCanvas, cx: number, th: number, half0: number, mat: number, phase: number) {
  const halfAt = (y: number) => {
    const t = Math.max(0, Math.min(1, y / th));
    return half0 * (1 + 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.5)) - 0.4 * t * t);
  };
  const rowH = 4.6;
  const cols = 6;
  // Serrated silhouette: each scale row's tip sticks out a texel at both edges.
  const tipAt = (y: number) => {
    const f = (((y / rowH + phase) % 1) + 1) % 1;
    return 1 - Math.abs(f - 0.6) * 2.2;
  };
  const pts: number[] = [];
  const n = Math.ceil(th / 0.5);
  for (let i = 0; i <= n; i++) {
    const y = (i / n) * th;
    pts.push(cx - halfAt(y) - Math.max(0, tipAt(y)) * 1.1, y);
  }
  for (let i = n; i >= 0; i--) {
    const y = (i / n) * th;
    pts.push(cx + halfAt(y) + Math.max(0, tipAt(y + rowH * 0.5)) * 1.1, y);
  }
  const fine = c.s >= 1;
  c.poly(pts, mat, (px, py) => {
    const u = Math.max(-1, Math.min(1, (px - cx) / halfAt(py)));
    let t = u < -0.62 ? 0.75 : u < 0.3 ? 0.5 : u < 0.72 ? 0.25 : 0;
    const row = py / rowH + phase;
    const ri = Math.floor(row);
    const fy = row - ri;
    const col = (Math.asin(u) / Math.PI) * cols + (ri % 2 ? 0.5 : 0);
    const fx = col - Math.floor(col) - 0.5;
    const d = Math.abs(fx) * 1.15 + Math.abs(fy - 0.55) * 0.95;
    if (!fine) {
      // Small levels: only the dark notches, in offset rows (a diamond lattice, never bands).
      if (fy < 0.4 && Math.abs(fx) < 0.24) t -= 0.25;
      return t;
    }
    if (d > 0.5) t -= 0.25; // seam between scales
    else if (fy < 0.3 && Math.abs(fx) < 0.16) t -= 0.5; // dark notch under the scale's point
    else if (fy > 0.68 && u < 0.45) t += 0.25; // lit upper edge
    return t;
  }, { z: 0 });
  // Ground contact: a dark sliver under the bulb.
  c.poly([cx - halfAt(0) - 1, 0, cx + halfAt(0) + 1, 0, cx + halfAt(0), 1.2, cx - halfAt(0), 1.2], mat, 0.02, { z: 0.5, flag: FF.SOFT });
}

/**
 * Trunk foot: the base flares out into the ground (root flare / boot), banded
 * like the trunk, and sits on a dark contact sliver so the plant stands on the
 * ground instead of floating on it.
 */
function footFlare(c: FloraCanvas, cx: number, half: number, h: number, spread: number, mat: number) {
  const pts: number[] = [];
  const n = 6;
  for (let j = 0; j <= n; j++) {
    const t = j / n;
    pts.push(cx - half - spread * Math.pow(1 - t, 2), h * t);
  }
  for (let j = n; j >= 0; j--) {
    const t = j / n;
    pts.push(cx + half + spread * Math.pow(1 - t, 2), h * t);
  }
  c.poly(pts, mat, (px, py) => {
    const u = (px - cx) / (half + spread * Math.pow(1 - py / h, 2));
    return u < -0.55 ? 0.75 : u < 0.36 ? 0.5 : u < 0.76 ? 0.25 : 0.06;
  }, { z: 0.5 });
  contact(c, cx, half + spread + 1.5, mat);
}

/** Dark contact sliver on the foot row (ground contact shading under a plant / trunk). */
function contact(c: FloraCanvas, cx: number, half: number, mat: number) {
  c.poly([cx - half, 0, cx + half, 0, cx + half * 0.75, 1.3, cx - half * 0.75, 1.3], mat, 0, { z: -20, flag: FF.SOFT });
}

// ─── Trees ───────────────────────────────────────────────────────────────────

type Mass = { x: number; y: number; rx: number; ry: number; z: number; mat: number; bias: number; puff?: number };

/** Leaf masses of a crown: the dark back layer first (no glints), then the front masses. */
function crownMasses(c: FloraCanvas, list: Mass[], rng: FloraRng, puff: number, glint = 1) {
  for (const ms of list) c.mass(ms.x, ms.y, ms.rx, ms.ry, ms.mat, rng, { bias: ms.bias, z: ms.z, puff: ms.puff ?? puff, glint: ms.z < -10 ? 0 : glint });
}

/** A branch from (x0, y0) into a crown mass (bark, tapering, sagging a little). */
function branchTo(c: FloraCanvas, x0: number, y0: number, ms: Mass, w0: number, mat: number, rng: FloraRng, z = -8) {
  const ex = ms.x + rng.spread(ms.rx * 0.25);
  const ey = ms.y - ms.ry * 0.35;
  c.curve(x0, y0, x0 + (ex - x0) * 0.35, y0 + (ey - y0) * 0.85, ex, ey, w0, Math.max(0.8, w0 * 0.38), mat, { z, bias: -0.06 });
}

/** A trunk climbing vine: a thin strand winding up with leaf pairs. */
function trunkVine(c: FloraCanvas, x0: number, y0: number, y1: number, lean: number, wob: number, mat: number, rng: FloraRng, ph: number) {
  const pts: number[] = [];
  const ws: number[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    pts.push(x0 + lean * t + Math.sin(t * 7 + ph) * wob, y0 + (y1 - y0) * t);
    ws.push(0.7);
  }
  c.stroke(pts, ws, mat, { z: 6, bias: 0.02, flag: FF.SOFT | FF.THIN, flat: 1 });
  for (let k = 1; k < 8; k++) c.leaf(pts[k * 2], pts[k * 2 + 1], k % 2 ? 0.5 : Math.PI - 0.5, rng.range(3, 4.5), 1.4, mat, { z: 7, bias: 0.06, flag: FF.SOFT });
}

/** Epiphyte clump (bromeliad / fern on a branch): a small fan of stiff leaves. */
function epiphyte(c: FloraCanvas, x: number, y: number, mat: number, rng: FloraRng, z: number) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / (n - 1)) + rng.spread(0.12);
    c.leaf(x, y, a, rng.range(5, 8), 1.5, mat, { z, bias: 0.04, flag: FF.SOFT });
  }
}

/**
 * Rainforest giant. Every variant is its own silhouette (6 archetypes, ×2
 * mirrored in the field) so the long treelines never repeat a shape:
 * 0 tiered umbrella, 1 lopsided leaner with a long counter-branch, 2 twin
 * trunks with two crowns, 3 strangler fig (a lattice of braided roots), 4 a
 * broken dead top over a sparse crown with sky holes and epiphytes, 5 an
 * emergent with a wide flat crown (enclosure). Buttress roots, barked trunk,
 * climbing and hanging vines throughout.
 */
export const JUNGLE_TREE: FloraSpecies = {
  key: 'jungleTree',
  w: 256,
  h: 216,
  heightM: 17,
  variants: 6,
  paint(c, m, rng, v) {
    const W = this.w;
    const H = this.h;
    const cx = W / 2 + rng.spread(3);
    const half = rng.range(6.5, 8);
    const side = rng.chance(0.5) ? 1 : -1;
    const back: Mass[] = [];
    const front: Mass[] = [];
    const dk = m.leafDark;
    let bx = cx;
    let top = H * 0.57;
    let hang = 3;
    // Trunk(s), branches, crown masses per archetype.
    const trunk = (x0: number, x1: number, y1: number, w0: number, seed: number, l = 0) =>
      c.stroke([x0, 0, x0 + (x1 - x0) * 0.25 + l, y1 * 0.4, x0 + (x1 - x0) * 0.7, y1 * 0.78, x1, y1], [w0 + 1, w0 * 0.88, w0 * 0.72, w0 * 0.55], m.bark, { bark: 2.4, seed, z: 0, amp: 1.15 });
    const paintCrown = (crown: Mass[], from: { x: number; y: number }[]) => {
      crownMasses(c, back, rng, 4.6);
      for (let i = 0; i < 2; i++) vine(c, bx + rng.spread(60), top + rng.range(0, 12), rng.range(40, 76), m.vine, rng, -30, -0.12);
      crown.forEach((ms, i) => {
        const f = from[i % from.length];
        branchTo(c, f.x, f.y, ms, 3.2, m.bark, rng);
      });
    };
    if (v === 0) {
      // Tiered umbrella.
      const lean = rng.spread(6);
      bx = cx + lean;
      back.push({ x: bx - 52, y: top + 30, rx: 32, ry: 18, z: -40, mat: dk, bias: -0.12 }, { x: bx + 50, y: top + 36, rx: 32, ry: 18, z: -40, mat: dk, bias: -0.12 }, { x: bx, y: H - 30, rx: 38, ry: 20, z: -40, mat: dk, bias: -0.1 });
      front.push(
        { x: bx - 62, y: top + 8, rx: 28, ry: 14, z: 0, mat: m.leaf, bias: -0.02 },
        { x: bx + 62, y: top + 12, rx: 26, ry: 14, z: 0, mat: m.leaf, bias: -0.02 },
        { x: bx - 18, y: top + 26, rx: 34, ry: 17, z: 8, mat: m.leaf, bias: 0 },
        { x: bx + 24, y: top + 30, rx: 32, ry: 16, z: 8, mat: m.leaf, bias: 0 },
        { x: bx, y: H - 22, rx: 36, ry: 17, z: 16, mat: m.leafLight, bias: 0.02 },
      );
      paintCrown(front, [{ x: bx, y: top - 8 }]);
      trunk(cx, bx, top + 8, half, v * 3.1, rng.spread(2));
    } else if (v === 1) {
      // Lopsided leaner: the crown piles up on the lean side, a long bare branch reaches back to a small mass.
      const lean = side * rng.range(16, 22);
      bx = cx + lean;
      top = H * 0.54;
      back.push({ x: bx + side * 34, y: top + 34, rx: 38, ry: 20, z: -40, mat: dk, bias: -0.12 }, { x: bx - side * 6, y: H - 34, rx: 30, ry: 16, z: -40, mat: dk, bias: -0.1 });
      front.push(
        { x: bx + side * 62, y: top + 10, rx: 30, ry: 14, z: 2, mat: m.leaf, bias: -0.02 },
        { x: bx + side * 26, y: top + 26, rx: 38, ry: 17, z: 8, mat: m.leaf, bias: 0 },
        { x: bx + side * 8, y: H - 30, rx: 30, ry: 15, z: 14, mat: m.leafLight, bias: 0.02 },
        { x: bx - side * 58, y: top + 2, rx: 17, ry: 9, z: 4, mat: m.leaf, bias: -0.04, puff: 4 },
      );
      paintCrown(front, [{ x: bx, y: top - 4 }, { x: bx, y: top + 2 }, { x: bx, y: top + 6 }, { x: bx - side * 2, y: top - 14 }]);
      trunk(cx, bx, top + 6, half, v * 3.1, side * 3);
    } else if (v === 2) {
      // Twin trunks from one root plate, each with its own crown (a gap of sky between them).
      const fy = H * rng.range(0.16, 0.22);
      const lx = cx - rng.range(26, 32);
      const rx = cx + rng.range(26, 34);
      const ly = top - 4;
      const ry = top + 14;
      bx = cx;
      back.push({ x: lx - 14, y: ly + 30, rx: 30, ry: 16, z: -40, mat: dk, bias: -0.12 }, { x: rx + 12, y: ry + 30, rx: 30, ry: 17, z: -40, mat: dk, bias: -0.12 });
      front.push(
        { x: lx - 30, y: ly + 10, rx: 26, ry: 13, z: 2, mat: m.leaf, bias: -0.02 },
        { x: lx + 4, y: ly + 24, rx: 28, ry: 14, z: 8, mat: m.leafLight, bias: 0.01 },
        { x: rx + 30, y: ry + 6, rx: 24, ry: 12, z: 2, mat: m.leaf, bias: -0.02 },
        { x: rx - 2, y: ry + 22, rx: 30, ry: 15, z: 10, mat: m.leaf, bias: 0 },
      );
      paintCrown(front, [{ x: lx, y: ly - 4 }, { x: lx, y: ly }, { x: rx, y: ry - 4 }, { x: rx, y: ry }]);
      c.stroke([cx, 0, cx, fy], [half + 2.5, half + 1.5], m.bark, { bark: 2.4, seed: 1.7, z: 0, amp: 1.15 });
      c.stroke([cx - 2, fy - 2, lx + 6, top * 0.55, lx, ly + 4], [half * 0.8, half * 0.62, half * 0.45], m.bark, { bark: 2.2, seed: 2.9, z: 1, amp: 1.15 });
      c.stroke([cx + 2, fy - 2, rx - 4, top * 0.6, rx, ry + 4], [half * 0.85, half * 0.66, half * 0.48], m.bark, { bark: 2.2, seed: 4.1, z: 2, amp: 1.15 });
    } else if (v === 3) {
      // Strangler fig: braided aerial roots wrap a dark hollow core; a dense dark dome above.
      top = H * 0.55;
      bx = cx + rng.spread(4);
      back.push({ x: bx - 40, y: top + 34, rx: 34, ry: 18, z: -40, mat: dk, bias: -0.12 }, { x: bx + 42, y: top + 30, rx: 32, ry: 18, z: -40, mat: dk, bias: -0.12 });
      front.push(
        { x: bx - 48, y: top + 14, rx: 30, ry: 15, z: 2, mat: m.leafDark, bias: 0.04 },
        { x: bx + 50, y: top + 12, rx: 28, ry: 14, z: 2, mat: m.leaf, bias: -0.04 },
        { x: bx, y: top + 34, rx: 46, ry: 20, z: 10, mat: m.leaf, bias: 0 },
        { x: bx + rng.spread(8), y: H - 22, rx: 30, ry: 14, z: 16, mat: m.leafLight, bias: 0 },
      );
      paintCrown(front, [{ x: bx, y: top }]);
      // Core (dark, showing between the strands), then the strands winding up and fusing.
      c.stroke([cx, 0, bx, top + 6], [half + 3, half * 0.8], m.barkDark, { z: -2, bias: -0.3, amp: 0.5 });
      const ns = 6;
      for (let i = 0; i < ns; i++) {
        const u = (i + 0.5) / ns - 0.5;
        const pts: number[] = [];
        const ws: number[] = [];
        const ph = i * 1.9 + rng.next() * 2;
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          const spread = (half + 5) * (1 - t * 0.55);
          pts.push(cx + (bx - cx) * t + u * spread * 2 + Math.sin(t * 9 + ph) * spread * 0.35, (top + 6) * t);
          ws.push(t < 0.08 ? 2.8 : 1.9 - t * 0.5);
        }
        c.stroke(pts, ws, m.bark, { z: 2 + (i % 2) * 2, bias: 0.04, amp: 1.2 });
      }
    } else if (v === 4) {
      // Broken top: the dead snag of the old leader stands bare above a sparse crown with sky between the masses.
      top = H * 0.5;
      bx = cx + rng.spread(5);
      back.push({ x: bx + 46, y: top + 22, rx: 26, ry: 14, z: -40, mat: dk, bias: -0.12 }, { x: bx - 40, y: top + 30, rx: 22, ry: 13, z: -40, mat: dk, bias: -0.12 });
      front.push(
        { x: bx - 56, y: top + 8, rx: 24, ry: 12, z: 2, mat: m.leaf, bias: -0.02 },
        { x: bx + 50, y: top + 14, rx: 26, ry: 13, z: 4, mat: m.leaf, bias: -0.02 },
        { x: bx - 12, y: top + 30, rx: 22, ry: 12, z: 8, mat: m.leafLight, bias: 0.01 },
      );
      paintCrown(front, [{ x: bx, y: top - 6 }, { x: bx, y: top }, { x: bx, y: top + 8 }]);
      const snagTop = H - rng.range(14, 22);
      c.stroke([cx, 0, cx + rng.spread(2), top * 0.5, bx, top, bx + side * 3, snagTop], [half + 1, half * 0.85, half * 0.66, half * 0.4], m.bark, { bark: 2.4, seed: 7.3, z: 0, amp: 1.15 });
      // Jagged break and two bare dead limbs.
      c.poly([bx + side * 3 - half * 0.5, snagTop - 1, bx + side * 3 + half * 0.5, snagTop - 1, bx + side * 3 + 1.5, snagTop + 5, bx + side * 3 - 0.5, snagTop + 2], m.barkDark, 0.38, { z: 1 });
      c.curve(bx + side * 2, snagTop - 22, bx + side * 14, snagTop - 18, bx + side * 22, snagTop - 4, 1.8, 0.7, m.barkDark, { z: 2, bias: 0.06 });
      c.curve(bx + side * 1, snagTop - 34, bx - side * 12, snagTop - 30, bx - side * 18, snagTop - 18, 1.6, 0.6, m.barkDark, { z: 2, bias: 0.06 });
      epiphyte(c, bx - 40, top + 2, m.leafLight, rng, 20);
      epiphyte(c, bx + side * 5, top + 34, m.vine, rng, 20);
      hang = 2;
    } else {
      // Emergent: a tall clean bole under a wide, flat, layered crown (closes the sky over the road).
      top = H * 0.6;
      bx = cx + rng.spread(4);
      back.push({ x: bx - 66, y: top + 24, rx: 40, ry: 14, z: -40, mat: dk, bias: -0.12 }, { x: bx + 66, y: top + 26, rx: 40, ry: 14, z: -40, mat: dk, bias: -0.12 }, { x: bx, y: top + 44, rx: 52, ry: 14, z: -40, mat: dk, bias: -0.1 });
      front.push(
        { x: bx - 92, y: top + 10, rx: 30, ry: 11, z: 0, mat: m.leaf, bias: -0.03 },
        { x: bx + 92, y: top + 12, rx: 30, ry: 11, z: 0, mat: m.leaf, bias: -0.03 },
        { x: bx - 40, y: top + 20, rx: 40, ry: 13, z: 6, mat: m.leaf, bias: 0 },
        { x: bx + 42, y: top + 22, rx: 40, ry: 13, z: 6, mat: m.leaf, bias: 0 },
        { x: bx, y: top + 40, rx: 48, ry: 13, z: 12, mat: m.leafLight, bias: 0.02 },
      );
      paintCrown(front, [{ x: bx, y: top - 10 }, { x: bx, y: top - 4 }]);
      trunk(cx, bx, top + 8, half - 0.5, 5.5, rng.spread(2));
    }
    // Climbing vines up the trunk.
    if (v !== 3) for (let i = 0; i < 2; i++) trunkVine(c, cx + (i ? 1 : -1) * half * rng.range(0.2, 0.6), top * 0.1, top * 0.85, (bx - cx) * 0.8, half * 0.5, m.vine, rng, i * 2);
    const rs = rng.range(16, 22);
    roots(c, cx, half + (v === 3 ? 3 : 0), rng.range(20, 28), rs, m.bark, m.barkDark, rng, 2);
    contact(c, cx, half + rs + 4, m.barkDark);
    crownMasses(c, front, rng, 4.8);
    // Vines hanging in front.
    for (let i = 0; i < hang; i++) {
      const ms = front[i % front.length];
      vine(c, ms.x + rng.spread(ms.rx * 0.6), ms.y - ms.ry * 0.5, rng.range(26, 70), m.vine, rng, 30, 0.02);
    }
  },
};

/**
 * Background treeline filler (far layer, coarse texels): broad, flat, ragged
 * crowns that close the sky like the 3D canopy, each variant its own shape —
 * 0 forked flat top, 1 lopsided, 2 two layers with sky between, 3 a dead limb
 * through the crown, 4 a wide dense dome.
 */
export const CANOPY_TREE: FloraSpecies = {
  key: 'canopyTree',
  w: 184,
  h: 136,
  heightM: 15,
  variants: 5,
  paint(c, m, rng, v) {
    const W = this.w;
    const H = this.h;
    const cx = W / 2 + rng.spread(3);
    const fork = H * rng.range(0.36, 0.42);
    const lean = rng.spread(5);
    const bx = cx + lean;
    const side = rng.chance(0.5) ? 1 : -1;
    const dk = m.leafDark;
    const back: Mass[] = [];
    const front: Mass[] = [];
    if (v === 0) {
      back.push({ x: bx - 44, y: fork + 40, rx: 30, ry: 13, z: -30, mat: dk, bias: -0.14 }, { x: bx + 42, y: fork + 44, rx: 30, ry: 13, z: -30, mat: dk, bias: -0.14 });
      front.push(
        { x: bx - 58, y: fork + 22, rx: 26, ry: 10, z: 4, mat: m.leaf, bias: -0.04 },
        { x: bx + 58, y: fork + 26, rx: 26, ry: 10, z: 4, mat: m.leaf, bias: -0.04 },
        { x: bx - 18, y: fork + 38, rx: 34, ry: 13, z: 8, mat: m.leaf, bias: 0 },
        { x: bx + 22, y: fork + 46, rx: 30, ry: 12, z: 8, mat: m.leafLight, bias: 0 },
      );
    } else if (v === 1) {
      back.push({ x: bx + side * 34, y: fork + 44, rx: 36, ry: 14, z: -30, mat: dk, bias: -0.14 });
      front.push(
        { x: bx + side * 64, y: fork + 20, rx: 26, ry: 10, z: 4, mat: m.leaf, bias: -0.04 },
        { x: bx + side * 26, y: fork + 34, rx: 38, ry: 13, z: 8, mat: m.leaf, bias: 0 },
        { x: bx - side * 30, y: fork + 30, rx: 18, ry: 9, z: 6, mat: m.leaf, bias: -0.04 },
        { x: bx + side * 10, y: fork + 52, rx: 26, ry: 11, z: 10, mat: m.leafLight, bias: 0 },
      );
    } else if (v === 2) {
      back.push({ x: bx, y: fork + 56, rx: 44, ry: 12, z: -30, mat: dk, bias: -0.14 });
      front.push(
        { x: bx - 50, y: fork + 16, rx: 30, ry: 9, z: 4, mat: m.leaf, bias: -0.05 },
        { x: bx + 52, y: fork + 18, rx: 28, ry: 9, z: 4, mat: m.leaf, bias: -0.05 },
        { x: bx - 26, y: fork + 50, rx: 30, ry: 11, z: 8, mat: m.leaf, bias: 0 },
        { x: bx + 30, y: fork + 54, rx: 28, ry: 11, z: 8, mat: m.leafLight, bias: 0 },
      );
    } else if (v === 3) {
      back.push({ x: bx - 40, y: fork + 40, rx: 30, ry: 13, z: -30, mat: dk, bias: -0.14 }, { x: bx + 40, y: fork + 38, rx: 28, ry: 13, z: -30, mat: dk, bias: -0.14 });
      front.push(
        { x: bx - 52, y: fork + 22, rx: 24, ry: 10, z: 4, mat: m.leaf, bias: -0.04 },
        { x: bx + 48, y: fork + 24, rx: 24, ry: 10, z: 4, mat: m.leaf, bias: -0.04 },
        { x: bx - 6, y: fork + 40, rx: 36, ry: 13, z: 8, mat: m.leaf, bias: 0 },
      );
    } else {
      back.push({ x: bx, y: fork + 46, rx: 60, ry: 18, z: -30, mat: dk, bias: -0.14 });
      front.push(
        { x: bx - 54, y: fork + 26, rx: 32, ry: 13, z: 4, mat: m.leaf, bias: -0.04 },
        { x: bx + 54, y: fork + 28, rx: 32, ry: 13, z: 4, mat: m.leaf, bias: -0.04 },
        { x: bx, y: fork + 44, rx: 50, ry: 17, z: 8, mat: m.leaf, bias: 0 },
        { x: bx + rng.spread(6), y: fork + 60, rx: 30, ry: 10, z: 12, mat: m.leafLight, bias: 0.01 },
      );
    }
    crownMasses(c, back, rng, 4);
    // Forked trunk and the limbs into the crown.
    c.stroke([cx, 0, cx + lean * 0.4, fork * 0.6, bx, fork], [4.4, 3.8, 3.4], m.bark, { bark: 1.8, seed: v, z: 0 });
    for (const ms of front) branchTo(c, bx, fork + rng.range(-2, 6), ms, 2.6, m.bark, rng, -2);
    if (v === 3) {
      // A dead limb thrust up through the crown.
      c.curve(bx, fork + 8, bx + side * 10, fork + 40, bx + side * 18, H - 6, 2.2, 0.8, m.barkDark, { z: 20, bias: 0.06 });
      c.curve(bx + side * 14, fork + 52, bx + side * 24, fork + 56, bx + side * 30, fork + 64, 1.2, 0.6, m.barkDark, { z: 20, bias: 0.06 });
    }
    footFlare(c, cx, 4.4, 6, 3.5, m.bark);
    crownMasses(c, front, rng, 4);
  },
};

/** Coconut palm: curved ringed trunk, a crown of drooping fronds, dead fronds hanging, coconuts. Variant 3 leans hard. */
export const PALM: FloraSpecies = {
  key: 'palm',
  w: 144,
  h: 184,
  heightM: 9.5,
  variants: 4,
  balance: true,
  paint(c, m, rng, v) {
    const W = this.w;
    const H = this.h;
    const cx = W / 2;
    const lean = v === 3 ? rng.range(24, 30) : rng.range(5, 14) * (v % 2 ? -1 : 1);
    const crownY = H - rng.range(46, 54);
    const n = 9;
    const pts: number[] = [];
    const ws: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Curved: lean grows with height (a palm bends out, then up).
      pts.push(cx - lean * 0.1 + lean * Math.pow(t, 1.7), crownY * t);
      ws.push(t < 0.06 ? 4.8 : 4 - t * 1.2);
    }
    const tx = pts[n * 2];
    const ty = pts[n * 2 + 1];
    // Fronds: two young ones up, a ring of long arching ones, old ones hanging low.
    const elevs = [1.3, 1.15, 1.0, 0.85, 0.7, 0.55, 0.4, 0.2, -0.05, -0.35];
    const fr: { ang: number; len: number; droop: number; back: boolean; facing: number }[] = [];
    elevs.forEach((e, i) => {
      const side = i % 2 ? 1 : -1;
      const el = e + rng.spread(0.1);
      const young = i < 2;
      fr.push({
        ang: side > 0 ? el : Math.PI - el,
        len: young ? rng.range(32, 40) : rng.range(50, 62),
        droop: young ? rng.range(10, 16) : rng.range(42, 58) * (0.75 + Math.max(0, el) * 0.3),
        back: i % 3 === 2,
        facing: i === 4 || i === 7 ? 0.55 : 1,
      });
    });
    // Back fronds (darker), trunk, dead fronds, crown boot, coconuts, front fronds.
    for (const f of fr) if (f.back) frond(c, tx, ty + 2, f.ang, f.len, f.droop, 15, m.frondDark, m.frondDark, rng, { z: -20, bias: -0.14, facing: f.facing });
    // Trunk: flat cylinder bands, leaf-scar rings one step darker (irregular, slanted), a fibrous boot at the foot.
    c.stroke(pts, ws, m.palmTrunk, { rings: 4.5, ringStep: 0.25, slant: 0.45, seed: v * 1.7, bands: true, z: 0 });
    footFlare(c, pts[0], ws[0], 6, 2.4, m.palmTrunk);
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const sx = tx + side * 2;
      c.curve(sx, ty - 1, sx + side * 7, ty - 8, sx + side * rng.range(5, 9), ty - rng.range(24, 32), 1.6, 0.8, m.frondDry, { z: 3, bias: -0.06, flag: FF.SOFT });
      for (let k = 0; k < 6; k++) {
        const yy = ty - 6 - k * 3.5;
        const xx = sx + side * (5 + k * 0.4);
        c.line(xx, yy, xx + side * rng.range(2, 4), yy - rng.range(3, 6), m.frondDry, 0.42, 3);
      }
    }
    c.ellipse(tx, ty - 1, 5.2, 3.6, m.palmRing, { z: 4, bias: -0.08 });
    for (let i = 0; i < 3; i++) c.ellipse(tx + (i - 1) * 3.4, ty - 4.5 - (i % 2), 2.4, 2.4, m.coconut, { z: 7, bias: -0.04 });
    for (const f of fr) if (!f.back) frond(c, tx, ty + 2, f.ang, f.len, f.droop, 16, m.frond, m.frondDark, rng, { z: 10, facing: f.facing });
  },
};

// ─── Undergrowth ─────────────────────────────────────────────────────────────

/** Fern painter: `wide` = a low, spreading fern (≈ 3:1) whose fronds arch out flat and touch the ground. */
function paintFern(c: FloraCanvas, m: FloraMats, rng: FloraRng, v: number, W: number, wide: boolean) {
  const cx = W / 2;
  const n = rng.int(7, 8) + (wide ? 1 : 0);
  const fronds: { side: number; elev: number; len: number; back: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const side = t < 0.5 ? -1 : 1;
    const elev = 0.55 + (1 - Math.abs(t - 0.5) * 2) * 0.95 + rng.spread(0.08);
    const len = rng.range(44, 56) * (0.8 + 0.2 * Math.sin(Math.PI * t));
    fronds.push({ side, elev, len, back: i % 3 === 1 });
  }
  // Back fronds first; among the front ones the upright ones first, the low spreading ones over them.
  fronds.sort((a, b) => (a.back === b.back ? b.elev - a.elev : a.back ? -1 : 1));
  // Dark heart + ground contact under the crown.
  c.ellipse(cx, 3, wide ? 12 : 8, 4, m.leafDark, { z: -10, bias: -0.25 });
  contact(c, cx, wide ? 16 : 11, m.leafDark);
  for (const f of fronds) {
    const ang = f.side > 0 ? f.elev : Math.PI - f.elev;
    const mat = f.back ? m.leafDark : v % 2 ? m.fern : m.fernLight;
    fernFrond(c, cx + f.side * 1.5, 2, ang, f.len, f.len * (0.34 + (1.5 - f.elev) * 0.42), rng.range(4.4, 5.6), mat, {
      z: f.back ? -6 : 4 + f.elev * 4,
      bias: f.back ? -0.1 : 0.02,
      sx: wide ? 1.65 : 1,
      sy: wide ? 0.82 : 1,
    });
  }
  // Fiddleheads.
  if (v !== 2) for (let i = 0; i < 2; i++) c.ellipse(cx + rng.spread(4), rng.range(9, 13), 1.5, 1.5, m.fernLight, { z: 20, bias: 0.12 });
}

/** Giant arching fern: a fountain of serrated fronds, back ones darker, a dark heart, fiddleheads. */
export const FERN: FloraSpecies = {
  key: 'fern',
  w: 112,
  h: 64,
  heightM: 1.7,
  variants: 4,
  balance: true,
  paint(c, m, rng, v) {
    paintFern(c, m, rng, v, this.w, false);
  },
};

/** Low spreading fern (≈ 3:1): picked for wide, low 3D ferns so the sprite is never taller than the plant. */
export const FERN_WIDE: FloraSpecies = {
  key: 'fernWide',
  w: 176,
  h: 56,
  heightM: 1.2,
  variants: 3,
  balance: true,
  paint(c, m, rng, v) {
    paintFern(c, m, rng, v, this.w, true);
  },
};

/**
 * Bush painter: leaf-cluster masses (back ones darker), the low clusters hang
 * only a little, and the underside closes in a rounded dark mass on a contact
 * sliver (grounded, no hanging single-texel teeth). `wide` = a low ≈ 2.2:1 mound.
 */
function paintBush(c: FloraCanvas, m: FloraMats, rng: FloraRng, v: number, W: number, wide: boolean) {
  const cx = W / 2;
  const k = wide ? 1.55 : 1;
  const ky = wide ? 0.82 : 1;
  // Underside: a rounded dark mass behind the clusters, on the ground.
  c.ellipse(cx, 6 * ky, 30 * k, 8 * ky, m.leafDark, { z: -30, bias: -0.36, amp: 0.4, flag: FF.SOFT });
  contact(c, cx, 30 * k, m.leafDark);
  c.mass(cx - 14 * k, 20 * ky, 20 * k, 15 * ky, m.leafDark, rng, { z: -10, bias: -0.1, puff: 5, glint: 1 });
  c.mass(cx + 15 * k, 22 * ky, 19 * k, 15 * ky, m.leafDark, rng, { z: -10, bias: -0.08, puff: 5, glint: 1 });
  c.mass(cx + rng.spread(4), 24 * ky, 27 * k, 20 * ky, v % 2 ? m.leaf : m.leafLight, rng, { z: 4, puff: 5.2 });
  c.mass(cx - 20 * k + rng.spread(3), 14 * ky, 15 * k, 11 * ky, m.leaf, rng, { z: 8, puff: 4.6, droop: 0.12 });
  c.mass(cx + 21 * k + rng.spread(3), 13 * ky, 14 * k, 10 * ky, m.leaf, rng, { z: 8, puff: 4.6, droop: 0.12 });
  if (wide) c.mass(cx + rng.spread(6), 11 * ky, 18, 8, m.leaf, rng, { z: 9, puff: 4.4, droop: 0.12 });
  if (v >= 2 && m.flowers.length) {
    const fm = m.flowers[v % m.flowers.length];
    for (let i = 0; i < 6; i++) {
      const fx = cx + rng.spread(26 * k);
      const fy = rng.range(18, 40) * ky;
      c.ellipse(fx, fy, 1.6, 1.4, fm, { z: 40, bias: 0.12, flag: FF.SOFT });
    }
  }
}

/** Leafy mound with the odd flower. */
export const BUSH: FloraSpecies = {
  key: 'bush',
  w: 80,
  h: 56,
  heightM: 1.35,
  variants: 4,
  paint(c, m, rng, v) {
    paintBush(c, m, rng, v, this.w, false);
  },
};

/** Low wide mound (≈ 2.2:1): picked for wide, low 3D bushes. */
export const BUSH_WIDE: FloraSpecies = {
  key: 'bushWide',
  w: 120,
  h: 56,
  heightM: 1.1,
  variants: 3,
  paint(c, m, rng, v) {
    paintBush(c, m, rng, v, this.w, true);
  },
};

/**
 * Tall grass tuft: a fan of curved blades with bright tips over a dark clump.
 * Blade widths are set in CANVAS texels per level — 3 → 1 at full size, 2 → 1
 * below it, never a 1-texel base — so a level shown a little minified (the
 * billboard picks the coarser level from 1.1 texels per pixel) keeps every
 * blade joined to the tuft instead of crawling; the coarser levels draw fewer
 * blades so the tuft keeps its weight (coverage) across the switch.
 */
export const GRASS: FloraSpecies = {
  key: 'grass',
  w: 48,
  h: 48,
  heightM: 1.1,
  variants: 3,
  balance: true,
  paint(c, m, rng) {
    const cx = this.w / 2;
    const n = rng.int(12, 16);
    const blades: { a: number; len: number; back: boolean }[] = [];
    for (let i = 0; i < n; i++) blades.push({ a: rng.spread(0.75), len: rng.range(26, 44), back: i % 3 === 0 });
    blades.sort((a, b) => (a.back === b.back ? 0 : a.back ? -1 : 1));
    const lv = c.s >= 1 ? 0 : 1;
    // Ground contact: the dark clump the blades spring from.
    c.ellipse(cx, 1.2, 7.5, 2.4, m.grass, { z: -8, bias: -0.42, amp: 0.3, flag: FF.SOFT });
    blades.forEach((b, i) => {
      const bx = cx + b.a * 6 + rng.spread(2);
      const tx = bx + Math.sin(b.a) * b.len * 0.9;
      const ty = Math.cos(b.a) * b.len;
      const bend = b.a * 8 + rng.spread(4);
      const light = rng.chance(0.4);
      // (RNG drawn either way: every level shares one layout.)
      // A balanced coarser level keeps an evenly spread share of the blades.
      if ((i * 0.618034 + 0.31) % 1 >= c.density) return;
      const w0 = lv === 0 ? 1.5 : 1 / c.s;
      const w1 = 0.5 / Math.min(1, c.s);
      c.curve(bx, 0, (bx + tx) / 2 - bend * 0.2, ty * 0.6, tx + bend, ty - Math.abs(bend) * 0.4, w0, w1, b.back ? m.grass : light ? m.grassLight : m.grass, {
        z: b.back ? -4 : 4,
        bias: b.back ? -0.14 : 0.04,
        flag: FF.SOFT,
      });
    });
  },
};

/** Cycad: stubby scaly trunk, stiff crown of comb fronds. */
export const CYCAD: FloraSpecies = {
  key: 'cycad',
  w: 96,
  h: 88,
  heightM: 2.6,
  variants: 3,
  balance: true,
  paint(c, m, rng) {
    const W = this.w;
    const cx = W / 2;
    const th = rng.range(18, 34);
    const half = rng.range(7, 9);
    scalyTrunk(c, cx, th, half, m.cycadTrunk, rng.next());
    const n = rng.int(11, 13);
    const fr: { ang: number; len: number; back: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      fr.push({ ang: Math.PI * (0.05 + 0.9 * t) + rng.spread(0.06), len: rng.range(34, 44) * (0.75 + 0.25 * Math.sin(Math.PI * t)), back: i % 2 === 0 });
    }
    fr.sort((a, b) => (a.back === b.back ? 0 : a.back ? -1 : 1));
    for (const f of fr) {
      frond(c, cx, th - 1, f.ang, f.len, f.len * 0.16, 6.5, f.back ? m.leafDark : m.cycad, m.leafDark, rng, {
        z: f.back ? -8 : 6,
        bias: f.back ? -0.12 : 0,
        spacing: 1.8,
        stiff: 1,
      });
    }
    // Crown boot: the stubs of old leaf bases under the fronds.
    c.ellipse(cx, th + 0.5, half * 0.75, 3, m.cycadTrunk, { z: 2, bias: -0.12, amp: 0.7 });
  },
};

/**
 * Elephant-ear blade: a heart-shaped leaf on a drooping axis from its base
 * (the sinus, where the stalk meets it) toward the tip, the two basal lobes
 * reaching back past the stalk. `fs` foreshortens it across (1 = face-on,
 * ~0.3 = edge-on), the edge is wavy and torn by a few storm splits, a 1-texel
 * pale midrib and 3–4 herringbone veins per half (drawn in canvas texels:
 * they survive the coarser levels), the half facing the light a step brighter,
 * the shaded half's rim curling a step darker; `under` = the far half curls
 * over and shows the darker underside (`underMat`).
 */
function earBlade(
  c: FloraCanvas,
  x: number,
  y: number,
  ang: number,
  len: number,
  wid: number,
  mat: number,
  rng: FloraRng,
  o: { fs?: number; droop?: number; z?: number; bias?: number; under?: number; tears?: number },
) {
  const s = c.s;
  const fs = o.fs ?? 1;
  const droop = o.droop ?? 0.3;
  const z = (o.z ?? 0) * s;
  const bias = o.bias ?? 0;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const L = len * s;
  const Wd = wid * s * fs;
  const X = x * s;
  const Y = y * s;
  const t0 = -0.16;
  const n = Math.max(12, Math.ceil(L * 1.4));
  // Axis samples (canvas texels).
  const ax = new Float32Array(n + 1);
  const ay = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((1 - t0) * i) / n;
    ax[i] = X + dx * L * t;
    ay[i] = Y + dy * L * t - droop * L * Math.max(0, t) * Math.max(0, t);
  }
  const tears: { t: number; side: number }[] = [];
  const nt = o.tears ?? 0;
  for (let i = 0; i < 3; i++) {
    const tt = rng.range(0.3, 0.85);
    const sd = rng.chance(0.5) ? 1 : -1;
    if (i < nt) tears.push({ t: tt, side: sd });
  }
  const wave = rng.next() * 6;
  const halfAt = (t: number) => {
    let h: number;
    if (t < 0) h = 0.86 * Math.sqrt(Math.max(0, 1 - (t / t0) ** 2));
    else if (t < 0.28) h = 0.86 + 0.14 * Math.sin((t / 0.28) * Math.PI * 0.5);
    else h = Math.pow(Math.cos(((t - 0.28) / 0.72) * Math.PI * 0.5), 0.8);
    return Wd * h * (1 + 0.07 * Math.sin(t * len * 0.33 + wave));
  };
  // Which side of the axis faces the screen-space light (upper left).
  const lx = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= n; i++) {
    minX = Math.min(minX, ax[i]);
    maxX = Math.max(maxX, ax[i]);
    minY = Math.min(minY, ay[i]);
    maxY = Math.max(maxY, ay[i]);
  }
  const pad = Wd + 1;
  void lx;
  const under = o.under ?? 0;
  const vs = 0.2;
  for (let iy = Math.floor(minY - pad); iy <= Math.ceil(maxY + pad); iy++) {
    for (let ix = Math.floor(minX - pad); ix <= Math.ceil(maxX + pad); ix++) {
      const px = ix + 0.5;
      const py = iy + 0.5;
      // Nearest axis sample.
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i <= n; i++) {
        const d = (px - ax[i]) ** 2 + (py - ay[i]) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      const i0 = Math.max(0, bi - 1);
      const i1 = Math.min(n, bi + 1);
      let tx = ax[i1] - ax[i0];
      let ty = ay[i1] - ay[i0];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // Continuous position along the blade (the nearest sample + the offset along the tangent).
      const t = t0 + ((1 - t0) * bi) / n + ((px - ax[bi]) * tx + (py - ay[bi]) * ty) / Math.max(1, L);
      const v = (px - ax[bi]) * -ty + (py - ay[bi]) * tx; // signed, + = left of the axis
      const av = Math.abs(v);
      const half = halfAt(t);
      if (av > half + 0.2 || t >= 1) continue;
      if (bi === 0 || bi === n) {
        // Beyond the ends: only inside the rounded lobes / tip.
        const along = (px - ax[bi]) * tx + (py - ay[bi]) * ty;
        if ((bi === 0 && along < -0.3) || (bi === n && along > 0.3)) continue;
      }
      // Basal sinus: the lobes part at the centre line behind the stalk.
      if (t < 0 && av < Wd * 0.3 * (-t / -t0)) continue;
      const sd = v >= 0 ? 1 : -1;
      // Storm tears: thin cuts from the edge toward the midrib, slanting to the tip.
      let torn = false;
      for (const tr of tears) if (tr.side === sd && av > half * 0.3 && Math.abs((t - tr.t) * L - av * 0.55) < 0.55) torn = true;
      if (torn) continue;
      const lit = -ty * sd * -0.55 + tx * sd * 0.62 > 0; // this half's normal faces the light
      let tone = 0.5 + bias + (lit ? 0.25 : 0);
      let m = mat;
      if (under && !lit) {
        m = under;
        tone = Math.max(0, 0.25 + bias);
      }
      if (av < 0.6 && t > 0.02 && t < 0.92 && fs > 0.4) tone += 0.25; // midrib
      else if (t > 0.08 && t < 0.86) {
        // Herringbone veins: from the midrib out toward the edge, slanting to the tip (1 canvas texel).
        const ph = (((t * L - av * 0.9) / (vs * L)) % 1 + 1) % 1;
        if (ph * vs * L < 0.95 && av > 0.6) tone += 0.25;
        else if (!lit && av > half - 1.1) tone -= 0.25; // the shaded half's rim curls away
      }
      tone -= Math.max(0, t - 0.75) * 0.3;
      c.set(ix, iy, m, tone, z, 0);
    }
  }
}

/** Elephant-ear plant: big heart-shaped, veined, storm-torn leaves on thin stalks, held at every angle. */
export const EAR: FloraSpecies = {
  key: 'ear',
  w: 104,
  h: 72,
  heightM: 1.9,
  variants: 3,
  paint(c, m, rng, v) {
    const cx = this.w / 2;
    const n = rng.int(5, 7);
    const leaves: { side: number; h: number; out: number; back: boolean; ang: number; fs: number; lk: number; under: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      // Held out and up, out level, or hanging; one edge-on, some foreshortened, one or two curled.
      const kind = (i + v) % 4;
      const up = kind === 0 ? rng.range(0.15, 0.55) : kind === 1 ? rng.range(-0.25, 0.1) : rng.range(-1.2, -0.55);
      leaves.push({
        side,
        h: rng.range(24, 48),
        out: rng.range(3, 16),
        back: i < 2,
        ang: side > 0 ? up : Math.PI - up,
        fs: i === 2 ? rng.range(0.3, 0.42) : rng.range(0.62, 1),
        lk: rng.range(0.72, 1),
        under: (i + v) % 3 === 1,
      });
    }
    leaves.sort((a, b) => (a.back === b.back ? b.h - a.h : a.back ? -1 : 1));
    c.ellipse(cx, 2, 8, 3, m.leafDark, { z: -10, bias: -0.22 });
    contact(c, cx, 11, m.leafDark);
    for (const l of leaves) {
      const tx = cx + l.side * l.out;
      const ty = l.h;
      // Thin stalk tapering into the blade (banded: lit left, shade right).
      c.curve(cx + l.side * 1.5, 0, cx + l.side * l.out * 0.2, ty * 0.6, tx, ty, 1.1, 0.55, m.ear, { z: l.back ? -6 : 2, bias: -0.2, flag: FF.SOFT, bands: true });
      earBlade(c, tx, ty, l.ang, rng.range(22, 30) * l.lk, rng.range(9, 11.5), l.back ? m.leafDark : m.ear, rng, {
        fs: l.fs,
        droop: rng.range(0.15, 0.45),
        z: l.back ? -4 : 6 + l.h * 0.1,
        bias: l.back ? -0.25 : 0,
        under: l.under ? m.leafDark : 0,
        tears: l.back ? 1 : 2,
      });
    }
  },
};

/** Town street tree (z1): slim trunk, two forks, a rounded leafy crown. */
export const STREET_TREE: FloraSpecies = {
  key: 'streetTree',
  w: 96,
  h: 128,
  heightM: 5.6,
  variants: 3,
  paint(c, m, rng, v) {
    const W = this.w;
    const H = this.h;
    const cx = W / 2 + rng.spread(2);
    const fork = H * rng.range(0.42, 0.5);
    const lean = rng.spread(4);
    c.mass(cx + lean - 14, fork + 30, 22, 18, m.leafDark, rng, { z: -20, bias: -0.12, puff: 5.5, glint: 1 });
    c.mass(cx + lean + 16, fork + 34, 21, 18, m.leafDark, rng, { z: -20, bias: -0.12, puff: 5.5, glint: 1 });
    c.stroke([cx, 0, cx + lean * 0.4, fork * 0.6, cx + lean, fork], [3.2, 2.7, 2.3], m.bark, { bark: 1.4, seed: v, z: 0 });
    c.curve(cx + lean, fork, cx + lean - 6, fork + 10, cx + lean - 14, fork + 22, 1.8, 1, m.bark, { z: -2 });
    c.curve(cx + lean, fork, cx + lean + 6, fork + 12, cx + lean + 12, fork + 26, 1.8, 1, m.bark, { z: -2 });
    c.mass(cx + lean + rng.spread(3), fork + 36, 32, 24, m.leaf, rng, { z: 4, puff: 6 });
    c.mass(cx + lean + rng.spread(4), H - 18, 22, 15, v === 1 ? m.leafLight : m.leaf, rng, { z: 10, puff: 5.5 });
  },
};

// ─── Cliffs ──────────────────────────────────────────────────────────────────

/**
 * Jungle growing over a cliff top (d1's rock pillars): a flat, ragged tangle of
 * leaf-cluster masses (the back ones darker), closing in a rounded dark
 * underside on the rock; one variant with a small tree poking up, one with a
 * fan of palm fronds — so a row of cliffs never repeats a silhouette.
 */
export const CLIFF_TOP: FloraSpecies = {
  key: 'cliffTop',
  w: 208,
  h: 80,
  heightM: 3.6,
  variants: 3,
  paint(c, m, rng, v) {
    const cx = this.w / 2;
    c.ellipse(cx, 7, 92, 9, m.leafDark, { z: -40, bias: -0.36, amp: 0.4, flag: FF.SOFT });
    const back: Mass[] = [
      { x: cx - 52 + rng.spread(6), y: 26, rx: 42, ry: 15, z: -30, mat: m.leafDark, bias: -0.12 },
      { x: cx + 50 + rng.spread(6), y: 28, rx: 42, ry: 15, z: -30, mat: m.leafDark, bias: -0.12 },
    ];
    if (v === 1) {
      // A small tree poking up out of the tangle.
      const tx = cx + rng.spread(30);
      c.stroke([tx, 20, tx + rng.spread(4), 52], [2.6, 1.8], m.bark, { z: -10, bark: 1.2, seed: 2 });
      back.push({ x: tx, y: 62, rx: 26, ry: 13, z: -12, mat: m.leaf, bias: 0 });
    }
    crownMasses(c, back, rng, 5);
    const front: Mass[] = [
      { x: cx - 74, y: 16, rx: 26, ry: 12, z: 2, mat: m.leaf, bias: -0.03 },
      { x: cx - 28, y: 22, rx: 32, ry: 15, z: 6, mat: v === 0 ? m.leafLight : m.leaf, bias: 0 },
      { x: cx + 22, y: 20, rx: 30, ry: 14, z: 6, mat: m.leaf, bias: 0 },
      { x: cx + 72, y: 15, rx: 26, ry: 11, z: 2, mat: m.leaf, bias: -0.03 },
      { x: cx + rng.spread(20), y: 34, rx: 26, ry: 11, z: 10, mat: m.leafLight, bias: 0.01 },
    ];
    crownMasses(c, front, rng, 5);
    if (v === 2) {
      // A fan of palm fronds bursting out of the tangle.
      const px = cx + rng.spread(36);
      for (let i = 0; i < 6; i++) frond(c, px, 30, Math.PI * (0.12 + 0.76 * (i / 5)) + rng.spread(0.08), rng.range(30, 40), rng.range(10, 18), 9, m.frond, m.frondDark, rng, { z: 14, bias: -0.04 });
    }
  },
};

/**
 * Hanging vines on a cliff face: a leafy clump at the lip and a curtain of
 * wavy strands with leaf pairs of different lengths (the longest reaches the
 * sprite's bottom row: the billboard's foot is where the 3D vine ends).
 */
export const VINES: FloraSpecies = {
  key: 'vines',
  w: 48,
  h: 112,
  heightM: 5,
  variants: 3,
  balance: true,
  paint(c, m, rng, v) {
    const cx = this.w / 2;
    const H = this.h;
    const n = 3 + (v % 2);
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * rng.range(6, 9);
      const len = i === 1 ? H - 4 : rng.range(H * 0.45, H - 10);
      vine(c, x, H - 6, len, i % 2 ? m.vine : m.leafDark, rng, i % 2 ? 4 : -4, i % 2 ? 0.02 : -0.1);
    }
    c.mass(cx, H - 8, 18, 7, m.vine, rng, { z: 10, puff: 3.6, bias: -0.02, droop: 0.6 });
  },
};

export const ALL_SPECIES = [JUNGLE_TREE, CANOPY_TREE, PALM, FERN, FERN_WIDE, BUSH, BUSH_WIDE, GRASS, CYCAD, EAR, STREET_TREE, CLIFF_TOP, VINES];

// ─── Dead wood and bedding plants (z2 / z3 verges, the d2 greenhouse beds) ──

/** Point `t` (0…1) on the quadratic a → (control c) → b, into `out`. */
function quad(ax: number, ay: number, qx: number, qy: number, bx: number, by: number, t: number, out: number[]) {
  const u = 1 - t;
  out[0] = u * u * ax + 2 * u * t * qx + t * t * bx;
  out[1] = u * u * ay + 2 * u * t * qy + t * t * by;
}

/**
 * A bare bough from (ax, ay): a tapering curve bowed upward, with forked
 * twigs (1-texel strands, never outlined) off its outer half. Twigs are drawn
 * by `density` so a balanced coarser level keeps the crown's weight (the RNG
 * is drawn either way: every level shares one layout).
 */
function bough(
  c: FloraCanvas,
  ax: number,
  ay: number,
  side: number,
  el: number,
  len: number,
  w0: number,
  mat: number,
  rng: FloraRng,
  o: { z: number; bias: number; twigs: number; id: number; thin?: number },
) {
  const bx = ax + side * Math.cos(el) * len;
  const by = ay + Math.sin(el) * len;
  const qx = ax + (bx - ax) * 0.42;
  const qy = ay + (by - ay) * 0.78 + len * 0.08;
  // (`thin`: a balanced coarse level below this density leaves the whole bough out — its 1-texel
  // strokes would weigh far more than at full size; the RNG is still drawn: one layout per level.)
  const hide = o.thin !== undefined && c.density < o.thin;
  if (!hide) c.curve(ax, ay, qx, qy, bx, by, w0, Math.max(0.6, w0 * 0.3), mat, { z: o.z, bias: o.bias });
  const p: number[] = [0, 0];
  for (let k = 0; k < o.twigs; k++) {
    const t = rng.range(0.42, 0.98);
    quad(ax, ay, qx, qy, bx, by, t, p);
    const up = rng.chance(0.65);
    const ta = up ? rng.range(0.7, 1.35) : rng.range(-0.25, 0.3);
    const tl = rng.range(5, 12) * (1.1 - t * 0.4);
    const ex = p[0] + side * Math.cos(ta) * tl;
    const ey = p[1] + Math.sin(ta) * tl;
    const fork = rng.chance(0.6);
    const fa = ta + rng.range(0.35, 0.7) * (rng.chance(0.5) ? 1 : -1);
    const fl = tl * rng.range(0.4, 0.7);
    if (hide || (o.id * 0.618034 + k * 0.381966 + 0.13) % 1 >= c.density) continue;
    const tone = 0.5 + o.bias + (up ? 0.08 : -0.06);
    c.line(p[0], p[1], ex, ey, mat, tone, o.z + 0.5);
    if (fork) {
      const mx = p[0] + (ex - p[0]) * 0.55;
      const my = p[1] + (ey - p[1]) * 0.55;
      c.line(mx, my, mx + side * Math.cos(fa) * fl, my + Math.sin(fa) * fl, mat, tone - 0.04, o.z + 0.5);
    }
  }
}

/**
 * Dead tree (the z2 car park, z3's dusk verges): a fissured trunk on a root
 * flare, leaning a little, 4–5 bare boughs (the back ones a step darker) that
 * break into forked twigs, a knot hole, and a snapped or tapering top — the
 * 3D model's cylinder trunk and four stick branches, as a sprite artist draws
 * winter wood.
 */
export const DEAD_TREE: FloraSpecies = {
  key: 'deadTree',
  w: 104,
  h: 128,
  heightM: 6,
  variants: 4,
  balance: true,
  paint(c, m, rng, v) {
    const W = this.w;
    const H = this.h;
    const cx = W / 2 + rng.spread(2);
    const lean = rng.spread(7);
    const top = H * rng.range(0.6, 0.72);
    const snapped = v === 2;
    const n = 7;
    const pts: number[] = [];
    const ws: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(cx + lean * t * t, top * t);
      ws.push(t < 0.05 ? 4.4 : 3.8 - 2 * t);
    }
    const at = (t: number): [number, number, number] => {
      const x = cx + lean * t * t;
      return [x, top * t, 3.8 - 2 * t];
    };
    const nb = 4 + (v % 2);
    const first = v % 2 ? 1 : -1;
    const limbs: { t: number; side: number; el: number; len: number; back: boolean }[] = [];
    for (let k = 0; k < nb; k++) {
      const t = 0.42 + (k / Math.max(1, nb - 1)) * 0.55 + rng.spread(0.04);
      limbs.push({
        t: Math.min(0.98, t),
        side: k % 2 ? -first : first,
        el: rng.range(0.45, 1.05) + t * 0.2,
        len: rng.range(26, 40) * (1.15 - t * 0.45),
        back: k === 1 || k === 4,
      });
    }
    // Back boughs (a step darker, behind the trunk), the trunk on its flare, then the near boughs.
    limbs.forEach((l, k) => {
      if (!l.back) return;
      const [x, y, w] = at(l.t);
      bough(c, x, y, l.side, l.el, l.len, Math.max(1.2, w * 0.55), m.barkDark, rng, { z: -6, bias: -0.1, twigs: 4, id: k, thin: 0.45 });
    });
    c.stroke(pts, ws, m.bark, { bark: 1.3, seed: v * 2.1, z: 0 });
    footFlare(c, cx, 3.8, 7, 3.4, m.bark);
    // Knot hole and a broken stub low on the trunk.
    const [kx, ky] = at(rng.range(0.25, 0.4));
    c.ellipse(kx + rng.spread(1), ky, 1.2, 1.8, m.barkDark, { z: 3, bias: -0.42, amp: 0.3 });
    const [sx, sy] = at(rng.range(0.18, 0.3));
    const sd = rng.chance(0.5) ? 1 : -1;
    c.curve(sx, sy, sx + sd * 3, sy + 2, sx + sd * 6, sy + 3, 1.5, 1.1, m.bark, { z: 2, bias: -0.02 });
    if (snapped) {
      // A jagged break: splinters standing up from the stump of the leader.
      const [tx, ty, tw] = at(1);
      c.poly([tx - tw, ty - 1, tx + tw, ty - 1, tx + tw * 0.7, ty + 5, tx + 0.2, ty + 2, tx - tw * 0.4, ty + 7], m.bark, 0.42, { z: 2 });
    } else {
      // The leader tapers on up into the crown.
      const [tx, ty] = at(1);
      c.curve(tx, ty - 1, tx + lean * 0.3, ty + (H - 6 - ty) * 0.5, tx + lean * 0.5 + rng.spread(4), H - rng.range(4, 10), 1.8, 0.6, m.bark, { z: 1 });
    }
    limbs.forEach((l, k) => {
      if (l.back) return;
      const [x, y, w] = at(l.t);
      bough(c, x, y, l.side, l.el, l.len, Math.max(1.3, w * 0.6), m.bark, rng, { z: 4, bias: 0, twigs: 5, id: k + 7 });
    });
  },
};

/**
 * Bedding flower (the d2 greenhouse paths): a tuft of lance leaves and one or
 * two stalks, each topped by a bloom in the biome's flower colour `variant`
 * (lit petals, an unlit pale eye).
 */
export const FLOWER: FloraSpecies = {
  key: 'flower',
  w: 24,
  h: 24,
  heightM: 0.5,
  variants: 4,
  paint(c, m, rng, v) {
    const cx = this.w / 2;
    const fm = m.flowers.length ? m.flowers[v % m.flowers.length] : m.leafLight;
    contact(c, cx, 5, m.leafDark);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      const el = rng.range(0.55, 1.15);
      c.leaf(cx + side * 0.5, 1, side > 0 ? el : Math.PI - el, rng.range(6, 9), 1.4, i < 2 ? m.leafDark : m.leaf, { z: i < 2 ? -2 : 2, bias: i < 2 ? -0.1 : 0, flag: FF.SOFT });
    }
    const ns = v % 2 ? 2 : 1;
    for (let j = 0; j < ns; j++) {
      const sx = cx + (ns === 2 ? (j ? 3 : -3) : 0) + rng.spread(1.5);
      const top = rng.range(15, 20) - j * 2;
      c.curve(cx, 1, (cx + sx) / 2 + rng.spread(1), top * 0.5, sx, top, 0.7, 0.55, m.leaf, { z: 1, bias: -0.05, flag: FF.SOFT });
      c.ellipse(sx, top, 3.4, 2.7, fm, { z: 6 + j, bias: 0.1 });
      c.ellipse(sx - 0.5, top + 0.4, 1, 1, fm, { z: 7 + j, bias: 0.42, flag: FF.FLAT });
    }
  },
};

/**
 * Root plate of a fallen giant (d1's fallen tree, the root-ball half): a
 * clotted earth disc torn out of the ground, moss on its crown, roots
 * snapping out all round it (the back ones darker), rootlets and hanging
 * root hairs, a dark contact strip where it still sits on the road.
 */
export const ROOT_PLATE: FloraSpecies = {
  key: 'rootPlate',
  w: 104,
  h: 112,
  heightM: 4.8,
  variants: 2,
  balance: true,
  paint(c, m, rng, v) {
    const W = this.w;
    const cx = W / 2 + rng.spread(2);
    const rx = 27;
    const ry = 33;
    // (Resting on the road: the plate's rim touches the ground.)
    const cy = ry + 3;
    const root = (back: boolean, k: number, n: number) => {
      // Round the rim, never straight down (the lower roots run out along the ground).
      let a = ((k + (back ? 0.5 : 0)) / n) * Math.PI * 2 + rng.spread(0.3);
      const sa = Math.sin(a);
      if (sa < -0.55) a += (Math.cos(a) >= 0 ? 1 : -1) * 0.7;
      const len = rng.range(8, 19) * (back ? 0.85 : 1);
      const sx = cx + Math.cos(a) * rx * 0.75;
      const sy = cy + Math.sin(a) * ry * 0.75;
      const mx = cx + Math.cos(a + rng.spread(0.35)) * (rx + len * 0.5);
      const my = cy + Math.sin(a) * (ry + len * 0.45) + rng.spread(3);
      const ex = cx + Math.cos(a + rng.spread(0.5)) * (rx + len);
      const ey = Math.max(1.5, cy + Math.sin(a) * (ry + len) - len * 0.3);
      const w0 = rng.range(2, 3.2) * (back ? 0.8 : 1);
      const drawn = !(back && c.density < 0.45);
      const mat = back ? m.barkDark : m.bark;
      if (drawn) {
        // A kinked root: thick where it tears out of the earth, tapering to a broken tip.
        c.curve(sx, sy, (sx + mx) / 2, (sy + my) / 2 + 1, mx, my, w0, w0 * 0.6, mat, { z: back ? -8 : 6, bias: back ? -0.12 : 0.02 });
        c.curve(mx, my, (mx + ex) / 2 + rng.spread(2), (my + ey) / 2, ex, ey, w0 * 0.6, 0.6, mat, { z: back ? -8 : 6, bias: back ? -0.14 : 0 });
      } else {
        rng.spread(2);
      }
      // Rootlets off the outer half.
      for (let j = 0; j < 2; j++) {
        const t = rng.range(0.3, 0.9);
        const px = mx + (ex - mx) * t;
        const py = my + (ey - my) * t;
        const la = a + rng.spread(1);
        const ll = rng.range(3, 6);
        if (!drawn || (k * 0.618034 + j * 0.5 + (back ? 0.25 : 0)) % 1 >= c.density) continue;
        c.line(px, py, px + Math.cos(la) * ll, py + Math.sin(la) * ll, mat, back ? 0.36 : 0.46, back ? -7 : 6.5);
      }
    };
    const nb = 6;
    for (let k = 0; k < nb; k++) root(true, k, nb);
    // The torn earth: clods over a dark core, a darker band low on the shadow side, moss on the crown.
    c.ellipse(cx, cy, rx, ry, m.coconut, { z: -2, bias: -0.3, amp: 0.5 });
    c.mass(cx, cy, rx - 2, ry - 2, m.coconut, rng, { z: 0, puff: 4.2, glint: 1, droop: 0.15 });
    c.mass(cx + rx * 0.3, cy - ry * 0.45, rx * 0.5, ry * 0.35, m.barkDark, rng, { z: 1, puff: 3.6, glint: 0, bias: -0.12 });
    c.mass(cx - 4, cy + ry * 0.66, rx * 0.62, 7, m.moss, rng, { z: 4, puff: 3.6, droop: 0.4 });
    const nf = 7 + v;
    for (let k = 0; k < nf; k++) root(false, k, nf);
    // Root hairs hanging from the lower rim.
    for (let k = 0; k < 9; k++) {
      const hx = cx + rng.spread(rx * 0.8);
      const hl = rng.range(3, 7);
      const hy = cy - ry * rng.range(0.55, 0.8);
      const hd = rng.spread(2);
      if ((k * 0.618034 + 0.4) % 1 >= c.density) continue;
      c.line(hx, hy, hx + hd, Math.max(0.5, hy - hl), m.barkDark, 0.4, 5);
    }
    contact(c, cx, rx * 0.7, m.barkDark);
  },
};

/** The bedding / dead-wood set (not in ALL_SPECIES: the d1 / d3 atlases don't paint it). */
export const EXTRA_SPECIES = [DEAD_TREE, FLOWER, ROOT_PLATE];
