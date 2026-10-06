import { bayer, PWF, type PwCanvas } from './canvas';

/**
 * RESEARCH LABS illustration shapes: the park's dinosaurs as hand-shaped
 * silhouettes (side views, the way park posters, murals and signage show
 * them), palms and fern fronds, a moon. Polygons are in a 100 × 60 box (y down,
 * feet on y = 60), drawn scaled, mirrored and shaded: a lit top edge, a darker
 * belly edge — the sprite artist's light from the upper left.
 */

/**
 * Hand-pixelled silhouettes (facing right, '#' = body). Sampled nearest to any
 * size; readable from ~16 texels wide.
 */
export type Bitmap = readonly string[];

export const REX: Bitmap = [
  '..................................######......',
  '................................###########...',
  '...............................#############..',
  '...............................##.##########..',
  '..............................###############.',
  '..............................################',
  '.............................#######..........',
  '.............................#######.#.#.#.#..',
  '............................##########.......',
  '..................##########.########........',
  '.............#################..######.......',
  '.........######################.#............',
  '.....##########################.##...........',
  '..#############################..............',
  '#######...####################...............',
  '..............################...............',
  '...............####..########................',
  '...............####....#####.................',
  '...............###.....####..................',
  '..............###......####..................',
  '.............###.......####..................',
  '............###.......#####..................',
  '...........####......######..................',
  '..........######....#######..................',
];

export const RAPTOR: Bitmap = [
  '..................................######..',
  '................................#########.',
  '...............................##.#######.',
  '...............................##########.',
  '..............................######.#.#..',
  '.............................#######......',
  '............................######........',
  '...................##############.........',
  '............######################........',
  '#########################.#######.........',
  '....#####################.##..##..........',
  '..............###########......#..........',
  '...............####.######................',
  '...............###....####................',
  '..............###.......###...............',
  '.............###.........###..............',
  '............###...........##..............',
  '...........##............###..............',
  '..........###...........###...............',
  '.........####..........####...............',
];

export const TRIKE: Bitmap = [
  '...........................####............',
  '..........................#######..........',
  '..........................########.........',
  '..........................#########......##',
  '..........######..........#########...###..',
  '.......############.......###########.##...',
  '.....################....#############.....',
  '...#####################.###############...',
  '..##########################.###########...',
  '.###########################..##########...',
  '############################...#######.#...',
  '.###########################....######.....',
  '..##########################.....####......',
  '...####.#######.######.#####...............',
  '...####..#####...####...####...............',
  '...####..####....####...####...............',
  '..#####.#####...#####..#####...............',
];

export const BRACHIO: Bitmap = [
  '........................####..',
  '.......................######.',
  '.......................####...',
  '......................####....',
  '......................###.....',
  '.....................####.....',
  '.....................###......',
  '....................####......',
  '....................###.......',
  '...................####.......',
  '..........###########.........',
  '......################........',
  '...###################........',
  '.#####################........',
  '##..##################........',
  '....####.######..#####........',
  '....###...####...####.........',
  '....###...####...####.........',
  '....###...####...####.........',
  '...####..#####..#####.........',
];

export const PTERO: Bitmap = [
  '##.............................##',
  '.###.........................###.',
  '..####......................####..',
  '....#####....##.##......#####.....',
  '......#####.#######..#####........',
  '........###############...........',
  '..........#########...............',
  '............#####.................',
  '..............##..................',
];

export interface ShapeOpts {
  /** Mirror horizontally (face left). */
  flip?: boolean;
  /** Body tone (ramp step). */
  tone?: number;
  /** Lit top edge (+1) and a darker lower edge (−1). */
  shade?: boolean;
  flag?: number;
}

/** Draw a bitmap silhouette sampled (nearest) into `w` × `h` texels at (x, y). */
export function silhouette(c: PwCanvas, bmp: Bitmap, x: number, y: number, w: number, h: number, ramp: number, o: ShapeOpts = {}) {
  const t = o.tone ?? 3;
  const bw = bmp.reduce((m, r) => Math.max(m, r.length), 0);
  const bh = bmp.length;
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const on = (u: number, v: number) => {
    if (u < 0 || v < 0 || u >= W || v >= H) return false;
    const bx = Math.floor(((o.flip ? W - 1 - u : u) + 0.5) * (bw / W));
    const by = Math.floor((v + 0.5) * (bh / H));
    return bmp[by]?.[bx] === '#';
  };
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      if (!on(u, v)) continue;
      let tt = t;
      if (o.shade !== false) {
        if (!on(u, v - 1)) tt = t + 1;
        else if (!on(u, v + 1)) tt = t - 1;
      }
      c.set(Math.round(x) + u, Math.round(y) + v, ramp, Math.max(0, Math.min(5, tt)), o.flag ?? 0);
    }
  }
}

/** A palm silhouette: curved trunk with rings, a crown of drooping fronds. Base at (x, y), height h (texels). */
export function palmShape(c: PwCanvas, x: number, y: number, h: number, ramp: number, tone: number, lean = 0.25, flag = 0) {
  const top = { x: x + lean * h, y: y - h };
  for (let i = 0; i <= h; i++) {
    const t = i / h;
    const px = x + lean * h * t * t;
    const py = y - i;
    const w = Math.max(1, Math.round((1 - t) * 2 + 1));
    for (let j = 0; j < w; j++) c.set(Math.round(px) + j, Math.round(py), ramp, i % 4 === 0 ? tone - 1 : tone, flag);
  }
  const fronds = 7;
  for (let f = 0; f < fronds; f++) {
    const a = -Math.PI + (f / (fronds - 1)) * Math.PI + (f % 2 ? 0.15 : -0.1);
    const len = h * (0.42 + 0.12 * Math.sin(f * 2.1));
    for (let s = 0; s <= len; s++) {
      const u = s / len;
      const fx = top.x + Math.cos(a) * s;
      const fy = top.y + Math.sin(a) * s * 0.55 + u * u * len * 0.55;
      c.set(Math.round(fx), Math.round(fy), ramp, tone, flag);
      // Leaflets hanging off the rib.
      if (s % 2 === 0 && u > 0.15) {
        const ll = Math.round(2 + (1 - u) * 3);
        for (let k = 1; k <= ll; k++) c.set(Math.round(fx), Math.round(fy) + k, ramp, tone, flag);
      }
    }
  }
}

/** A fern frond (rib with alternating leaflets) from (x, y) along angle a, length len. */
export function frond(c: PwCanvas, x: number, y: number, a: number, len: number, ramp: number, tone: number, flag = 0) {
  for (let s = 0; s <= len; s++) {
    const u = s / len;
    const ang = a + u * 0.6;
    const fx = x + Math.cos(ang) * s;
    const fy = y + Math.sin(ang) * s;
    c.set(Math.round(fx), Math.round(fy), ramp, tone, flag);
    if (s % 2 === 0 && u < 0.92) {
      const ll = Math.max(1, Math.round((1 - u) * 4));
      const side = (s / 2) % 2 ? 1 : -1;
      const px = -Math.sin(ang) * side;
      const py = Math.cos(ang) * side;
      for (let k = 1; k <= ll; k++) c.set(Math.round(fx + px * k + Math.cos(ang) * k * 0.5), Math.round(fy + py * k + Math.sin(ang) * k * 0.5), ramp, tone + (side > 0 ? 0.5 : -0.25), flag);
    }
  }
}

/** A moon disc with craters and a lit rim (GLOW). */
export function moon(c: PwCanvas, cx: number, cy: number, r: number, ramp: number, halo?: number) {
  if (halo) {
    for (let y = -r - 4; y <= r + 4; y++) {
      for (let x = -r - 4; x <= r + 4; x++) {
        const d = Math.hypot(x, y);
        if (d <= r || d > r + 4) continue;
        if (bayer(cx + x, cy + y) < (r + 4 - d) / 6) c.set(cx + x, cy + y, halo, 2, PWF.GLOW);
      }
    }
  }
  c.ellipse(cx, cy, r, r, ramp, (u, v) => (u + v < -0.6 ? 5 : u + v > 0.9 ? 3 : 4), PWF.GLOW);
  for (const [dx, dy, rr] of [
    [-0.3, -0.2, 0.22],
    [0.25, 0.1, 0.16],
    [-0.1, 0.4, 0.12],
    [0.35, -0.35, 0.1],
  ]) c.ellipse(cx + dx * r, cy + dy * r, Math.max(1, rr * r), Math.max(1, rr * r), ramp, 3, PWF.GLOW);
}

/** An ammonite (fossil spiral) in limestone: a lighter spiral line with a darker inner groove. */
export function ammonite(c: PwCanvas, cx: number, cy: number, r: number, dt = 1) {
  let prev = -1;
  for (let a = 0; a < Math.PI * 6; a += 0.12) {
    const rr = (r * a) / (Math.PI * 6);
    const x = Math.round(cx + Math.cos(a) * rr);
    const y = Math.round(cy + Math.sin(a) * rr * 0.9);
    const k = y * 10000 + x;
    if (k === prev) continue;
    prev = k;
    c.shift(x, y, dt);
    c.shift(x + 1, y + 1, -dt * 0.75);
  }
  // Ribs on the outer whorl.
  for (let a = Math.PI * 4; a < Math.PI * 6; a += 0.5) {
    const x = Math.round(cx + Math.cos(a) * r * 0.85);
    const y = Math.round(cy + Math.sin(a) * r * 0.8);
    c.shift(x, y, -dt * 0.75);
  }
}
