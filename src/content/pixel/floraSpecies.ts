import { FloraCanvas, FloraPalette, FloraRng, FF } from './floraPaint';

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
}

export function floraMats(pal: FloraPalette, b: FloraBiome): FloraMats {
  const sat = b.sat ?? 1.05;
  const leaf = (hex: number) => pal.add(hex, { sat, dark: 0.34, light: 0.5 });
  const wood = (hex: number) => pal.add(hex, { sat: sat * 0.95, dark: 0.38, light: 0.45 });
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
      // One-texel leaflets stay one texel at the small mip levels: draw proportionally fewer
      // there so the frond keeps its weight (the RNG is drawn either way: same layout per level).
      if (ll < 1.2 || (c.s < 1 && i % Math.round(1 / c.s) !== 0)) continue;
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
  o: { z?: number; bias?: number; spacing?: number } = {},
) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const at = (t: number): [number, number] => [x + ca * len * t, y + sa * len * t - droop * t * t];
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
    const w = wid * env * (0.5 + 0.5 * tip);
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
    if (rng.chance(0.35)) continue;
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

// ─── Trees ───────────────────────────────────────────────────────────────────

/** Rainforest giant: buttress roots, tall barked trunk, branches, a tiered crown, hanging vines. */
export const JUNGLE_TREE: FloraSpecies = {
  key: 'jungleTree',
  w: 200,
  h: 216,
  heightM: 17,
  variants: 3,
  paint(c, m, rng, v) {
    const W = this.w;
    const H = this.h;
    const cx = W / 2 + rng.spread(4);
    const top = H * rng.range(0.55, 0.6);
    const lean = rng.spread(6);
    const half = rng.range(6.5, 8);
    const bx = cx + lean;
    // Crown: a wide lower tier of side masses, an upper tier on top, back masses behind.
    type Mass = { x: number; y: number; rx: number; ry: number; z: number; mat: number; bias: number };
    const back: Mass[] = [
      { x: bx - 52, y: top + 30, rx: 32, ry: 18, z: -40, mat: m.leafDark, bias: -0.12 },
      { x: bx + 50, y: top + 36, rx: 32, ry: 18, z: -40, mat: m.leafDark, bias: -0.12 },
      { x: bx + rng.spread(8), y: H - 30, rx: 38, ry: 20, z: -40, mat: m.leafDark, bias: -0.1 },
    ];
    const front: Mass[] = [
      { x: bx - 62 + rng.spread(3), y: top + 8, rx: 28, ry: 14, z: 0, mat: m.leaf, bias: -0.02 },
      { x: bx + 62 + rng.spread(3), y: top + 12, rx: 26, ry: 14, z: 0, mat: m.leaf, bias: -0.02 },
      { x: bx - 18 + rng.spread(6), y: top + 26, rx: 34, ry: 17, z: 8, mat: v === 2 ? m.leafLight : m.leaf, bias: 0 },
      { x: bx + 24 + rng.spread(6), y: top + 30, rx: 32, ry: 16, z: 8, mat: m.leaf, bias: 0 },
      { x: bx + rng.spread(10), y: H - 22, rx: 36, ry: 17, z: 16, mat: m.leafLight, bias: 0.02 },
    ];
    if (v === 1) front.push({ x: bx - 34, y: H - 34, rx: 22, ry: 13, z: 14, mat: m.leaf, bias: 0 });
    for (const ms of back) c.mass(ms.x, ms.y, ms.rx, ms.ry, ms.mat, rng, { bias: ms.bias, z: ms.z, puff: 4.6, glint: 0 });
    for (let i = 0; i < 2; i++) vine(c, bx + rng.spread(50), top + rng.range(0, 12), rng.range(40, 80), m.vine, rng, -30, -0.12);
    // Branches into the crown masses.
    for (const ms of front) {
      const fy = top - rng.range(2, 14);
      c.curve(bx, fy, bx + (ms.x - bx) * 0.35, fy + (ms.y - fy) * 0.8, ms.x + rng.spread(6), ms.y - ms.ry * 0.4, 3.2, 1.2, m.bark, { z: -8, bias: -0.06 });
    }
    // Trunk with a slight S.
    const tp = [cx, 0, cx + lean * 0.25 + rng.spread(2), top * 0.4, cx + lean * 0.7, top * 0.78, bx, top + 8];
    c.stroke(tp, [half + 1, half * 0.88, half * 0.72, half * 0.55], m.bark, { bark: 2.4, seed: v * 3.1, z: 0, amp: 1.15 });
    // Climbing vines up the trunk (leaf pairs on thin strands).
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const x0 = cx + side * half * rng.range(0.2, 0.6);
      const pts: number[] = [];
      const ws: number[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(x0 + lean * t * 0.8 + Math.sin(t * 7 + i * 2) * half * 0.5, top * (0.1 + t * 0.75));
        ws.push(0.7);
      }
      c.stroke(pts, ws, m.vine, { z: 6, bias: 0.02, flag: FF.SOFT | FF.THIN, flat: 1 });
      for (let k = 1; k < 8; k++) {
        const px = pts[k * 2];
        const py = pts[k * 2 + 1];
        c.leaf(px, py, k % 2 ? 0.5 : Math.PI - 0.5, rng.range(3, 4.5), 1.4, m.vine, { z: 7, bias: 0.06, flag: FF.SOFT });
      }
    }
    roots(c, cx, half, rng.range(20, 28), rng.range(16, 22), m.bark, m.barkDark, rng, 2);
    for (const ms of front) c.mass(ms.x, ms.y, ms.rx, ms.ry, ms.mat, rng, { bias: ms.bias, z: ms.z, puff: 4.8 });
    // Vines hanging in front.
    const nv = rng.int(3, 4);
    for (let i = 0; i < nv; i++) {
      const ms = front[i % front.length];
      vine(c, ms.x + rng.spread(ms.rx * 0.6), ms.y - ms.ry * 0.5, rng.range(26, 70), m.vine, rng, 30, 0.02);
    }
  },
};

/** Background treeline filler: a forked trunk under a broad, ragged crown (far layer: coarse texels). */
export const CANOPY_TREE: FloraSpecies = {
  key: 'canopyTree',
  w: 136,
  h: 136,
  heightM: 15,
  variants: 3,
  paint(c, m, rng, v) {
    const W = this.w;
    const H = this.h;
    const cx = W / 2 + rng.spread(3);
    const fork = H * rng.range(0.34, 0.42);
    const lean = rng.spread(5);
    const bx = cx + lean;
    // Back crown masses (dark), the forked trunk, then the front crown in tiers.
    c.mass(bx - 34, fork + 44, 24, 14, m.leafDark, rng, { bias: -0.14, z: -30, puff: 4, glint: 0 });
    c.mass(bx + 32, fork + 50, 24, 14, m.leafDark, rng, { bias: -0.14, z: -30, puff: 4, glint: 0 });
    c.mass(bx + rng.spread(10), H - 16, 28, 12, m.leafDark, rng, { bias: -0.12, z: -30, puff: 4, glint: 0 });
    c.stroke([cx, 0, cx + lean * 0.4, fork * 0.6, bx, fork], [4.4, 3.8, 3.4], m.bark, { bark: 1.8, seed: v, z: 0 });
    c.curve(bx, fork, bx - 6, fork + 16, bx - 20 + rng.spread(4), fork + 34, 2.6, 1.4, m.bark, { z: -2 });
    c.curve(bx, fork, bx + 7, fork + 18, bx + 18 + rng.spread(4), fork + 40, 2.6, 1.4, m.bark, { z: -2 });
    c.curve(bx - 3, fork + 8, bx - 18, fork + 14, bx - 38, fork + 22, 1.6, 0.8, m.bark, { z: -4 });
    c.curve(bx + 3, fork + 12, bx + 18, fork + 20, bx + 40, fork + 28, 1.6, 0.8, m.bark, { z: -4 });
    c.mass(bx - 42 + rng.spread(4), fork + 24, 20, 11, m.leaf, rng, { z: 4, puff: 4, glint: 1, bias: -0.04 });
    c.mass(bx + 42 + rng.spread(4), fork + 30, 20, 11, v === 2 ? m.leafDark : m.leaf, rng, { z: 4, puff: 4, glint: 1, bias: -0.04 });
    c.mass(bx - 16 + rng.spread(4), fork + 44, 26, 14, m.leaf, rng, { z: 8, puff: 4.2, glint: 1 });
    c.mass(bx + 18 + rng.spread(4), fork + 52, 24, 13, m.leaf, rng, { z: 8, puff: 4.2, glint: 1 });
    c.mass(bx + rng.spread(8), H - 14, 22, 11, m.leafLight, rng, { z: 12, puff: 4, glint: 1 });
  },
};

/** Coconut palm: curved ringed trunk, a crown of drooping fronds, dead fronds hanging, coconuts. Variant 3 leans hard. */
export const PALM: FloraSpecies = {
  key: 'palm',
  w: 144,
  h: 184,
  heightM: 9.5,
  variants: 4,
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
    c.stroke(pts, ws, m.palmTrunk, { rings: 4, ringMat: m.palmRing, z: 0, amp: 1.1 });
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

/** Giant arching fern: a fountain of serrated fronds, back ones darker, a dark heart, fiddleheads. */
export const FERN: FloraSpecies = {
  key: 'fern',
  w: 112,
  h: 64,
  heightM: 1.7,
  variants: 4,
  paint(c, m, rng, v) {
    const W = this.w;
    const cx = W / 2;
    const n = rng.int(7, 8);
    const fronds: { side: number; elev: number; len: number; back: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const side = t < 0.5 ? -1 : 1;
      const elev = 0.55 + (1 - Math.abs(t - 0.5) * 2) * 0.95 + rng.spread(0.08);
      fronds.push({ side, elev, len: rng.range(44, 56) * (0.8 + 0.2 * Math.sin(Math.PI * t)), back: i % 3 === 1 });
    }
    // Back fronds first; among the front ones the upright ones first, the low spreading ones over them.
    fronds.sort((a, b) => (a.back === b.back ? b.elev - a.elev : a.back ? -1 : 1));
    c.ellipse(cx, 3, 8, 4, m.leafDark, { z: -10, bias: -0.25 });
    for (const f of fronds) {
      const ang = f.side > 0 ? f.elev : Math.PI - f.elev;
      const mat = f.back ? m.leafDark : v % 2 ? m.fern : m.fernLight;
      fernFrond(c, cx + f.side * 1.5, 2, ang, f.len, f.len * (0.34 + (1.5 - f.elev) * 0.42), rng.range(4.4, 5.6), mat, {
        z: f.back ? -6 : 4 + f.elev * 4,
        bias: f.back ? -0.1 : 0.02,
      });
    }
    // Fiddleheads.
    if (v !== 2) for (let i = 0; i < 2; i++) c.ellipse(cx + rng.spread(4), rng.range(9, 13), 1.5, 1.5, m.fernLight, { z: 20, bias: 0.12 });
  },
};

/** Leafy mound with the odd flower. */
export const BUSH: FloraSpecies = {
  key: 'bush',
  w: 80,
  h: 56,
  heightM: 1.35,
  variants: 4,
  paint(c, m, rng, v) {
    const W = this.w;
    const cx = W / 2;
    c.mass(cx - 14, 20, 20, 15, m.leafDark, rng, { z: -10, bias: -0.1, puff: 5, glint: 1 });
    c.mass(cx + 15, 22, 19, 15, m.leafDark, rng, { z: -10, bias: -0.08, puff: 5, glint: 1 });
    c.mass(cx + rng.spread(4), 24, 27, 20, v % 2 ? m.leaf : m.leafLight, rng, { z: 4, puff: 5.2 });
    c.mass(cx - 20 + rng.spread(3), 14, 15, 11, m.leaf, rng, { z: 8, puff: 4.6 });
    c.mass(cx + 21 + rng.spread(3), 13, 14, 10, m.leaf, rng, { z: 8, puff: 4.6 });
    if (v >= 2 && m.flowers.length) {
      const fm = m.flowers[v % m.flowers.length];
      for (let i = 0; i < 6; i++) {
        const fx = cx + rng.spread(26);
        const fy = rng.range(18, 40);
        c.ellipse(fx, fy, 1.6, 1.4, fm, { z: 40, bias: 0.12, flag: FF.SOFT });
      }
    }
  },
};

/** Tall grass tuft: a fan of curved blades, bright tips. */
export const GRASS: FloraSpecies = {
  key: 'grass',
  w: 48,
  h: 48,
  heightM: 1.1,
  variants: 3,
  paint(c, m, rng) {
    const cx = this.w / 2;
    const n = rng.int(12, 16);
    const blades: { a: number; len: number; back: boolean }[] = [];
    for (let i = 0; i < n; i++) blades.push({ a: rng.spread(0.75), len: rng.range(26, 44), back: i % 3 === 0 });
    blades.sort((a, b) => (a.back === b.back ? 0 : a.back ? -1 : 1));
    blades.forEach((b, i) => {
      const bx = cx + b.a * 6 + rng.spread(2);
      const tx = bx + Math.sin(b.a) * b.len * 0.9;
      const ty = Math.cos(b.a) * b.len;
      const bend = b.a * 8 + rng.spread(4);
      const light = rng.chance(0.4);
      // One-texel blades at the smallest levels: half of them keep the tuft's weight.
      if (c.s <= 0.25 && i % 2) return;
      c.curve(bx, 0, (bx + tx) / 2 - bend * 0.2, ty * 0.6, tx + bend, ty - Math.abs(bend) * 0.4, 1.5, 0.5, b.back ? m.grass : light ? m.grassLight : m.grass, {
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
  paint(c, m, rng) {
    const W = this.w;
    const cx = W / 2;
    const th = rng.range(18, 34);
    const half = rng.range(7, 9);
    // Diamond-scaled trunk (pineapple).
    c.poly([cx - half, 0, cx + half, 0, cx + half * 0.8, th, cx - half * 0.8, th], m.cycadTrunk, (px, py) => {
      const u = (px - cx) / half;
      const d = ((px - cx + py * 0.9) / 4.2) % 1;
      const e = ((px - cx - py * 0.9) / 4.2) % 1;
      const seam = Math.abs(d) < 0.18 || Math.abs(e) < 0.18 ? -0.26 : 0;
      return 0.5 - u * 0.22 + seam;
    }, { z: 0 });
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
    c.ellipse(cx, th + 1, 5, 3, m.cycadTrunk, { z: 2, bias: -0.1 });
  },
};

/** Elephant-ear plant: big arrow-shaped, veined leaves drooping from curved stalks. */
export const EAR: FloraSpecies = {
  key: 'ear',
  w: 88,
  h: 72,
  heightM: 1.9,
  variants: 3,
  paint(c, m, rng) {
    const cx = this.w / 2;
    const n = rng.int(5, 7);
    const leaves: { side: number; h: number; out: number; back: boolean; droop: number }[] = [];
    for (let i = 0; i < n; i++) leaves.push({ side: i % 2 ? 1 : -1, h: rng.range(26, 46), out: rng.range(4, 20), back: i < 2, droop: rng.range(0.5, 1.15) });
    leaves.sort((a, b) => (a.back === b.back ? b.h - a.h : a.back ? -1 : 1));
    c.ellipse(cx, 2, 7, 3, m.leafDark, { z: -10, bias: -0.22 });
    for (const l of leaves) {
      const tx = cx + l.side * l.out;
      const ty = l.h;
      c.curve(cx + l.side * 1.5, 0, cx + l.side * l.out * 0.15, ty * 0.65, tx, ty, 1.3, 0.8, m.ear, { z: l.back ? -6 : 2, bias: -0.08, flag: FF.SOFT });
      // The blade hangs outward and down from the stalk tip, its base lobes around the stalk.
      const ang = l.side > 0 ? -l.droop : Math.PI + l.droop;
      c.leaf(tx - Math.cos(ang) * 2, ty - Math.sin(ang) * 2, ang, rng.range(22, 30), rng.range(8.5, 11), l.back ? m.leafDark : m.ear, {
        z: l.back ? -4 : 6,
        bias: l.back ? -0.12 : 0.04,
        rib: true,
        shape: 1,
        amp: 1.4,
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

export const ALL_SPECIES = [JUNGLE_TREE, CANOPY_TREE, PALM, FERN, BUSH, GRASS, CYCAD, EAR, STREET_TREE];
