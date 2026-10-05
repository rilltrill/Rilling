import { hexToOklch, makeRamp, oklchToHex, STEPS, type RampOptions } from '../../gameplay/pixel/materials';

/**
 * FLORA painter (ART: SPRITES scenery). A tiny software rasteriser that paints
 * hand-pixelled plant sprites procedurally at load — leaf clusters, palm and
 * fern fronds, trunks with bark and roots, grass blades, vines — into a small
 * G-buffer (material, tone, depth, flags), then resolves it into palette-ramped
 * RGBA with the PixelCast style rules:
 *  - every surface is a 6-step hand-built ramp (`makeRamp`: base on step 3,
 *    violet-shifted shadows, warm pale highlights, step 0 = outline shade);
 *  - the sprite-artist light from the upper left and front, flattened profile,
 *    ordered (Bayer 4×4) dither only in the narrow band between two steps;
 *  - a dark exterior outline on the shadow side (bottom / right), none on the
 *    lit top-left edge, never on 1-texel runs (blades, vines, leaflets); the
 *    back-lit right edge carries the night-rim flag (a cool rim at night, as on
 *    the PixelCast sprites — never on the lit side, which would double the
 *    highlight);
 *  - an inner contour where a cluster overlaps one well behind it and one step
 *    of cast shadow below-right of it, so canopies read as layered leaf masses,
 *    not blobs.
 *
 * Coordinates are LEVEL-0 TEXELS with y UP from the sprite's bottom edge (the
 * plant's foot sits on y = 0). A canvas painted at scale 1/2, 1/4… draws the
 * same plant at half / quarter resolution (true pixel art for each mip level,
 * not a filtered copy): every primitive scales its coordinates, and widths
 * never drop below one texel. Pure maths (no DOM / GL): safe in node tests.
 */

// Sprite-artist light (screen space: +x right, +y up, +z toward the viewer).
const LX = -0.55;
const LY = 0.62;
const LZ = 0.56;

/** Per-texel flags. */
export const FF = {
  /** Thin strand (blade, vine, leaflet): never outlined. */
  THIN: 1,
  /** No contour / cast shadow on this texel. */
  SOFT: 2,
  /** Unlit accent (flower centre, fruit glint): drawn as painted. */
  FLAT: 4,
} as const;

/** Small deterministic RNG (mulberry32) — plants never touch `world.rng`. */
export class FloraRng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed * 2654435761) >>> 0 || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  spread(a: number): number {
    return (this.next() * 2 - 1) * a;
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Ramp options for a flora palette entry: `cap` = the brightest step's OKLab lightness (night biomes). */
export interface FloraRampOptions extends RampOptions {
  cap?: number;
}

/** Ramps used by one atlas (index = material id − 1). */
export class FloraPalette {
  readonly ramps: number[][] = [];
  private keys = new Map<string, number>();
  /** Material id (≥ 1) for a base colour and ramp options. */
  add(hex: number, o: FloraRampOptions = {}): number {
    const key = `${hex}|${o.dark ?? ''}|${o.light ?? ''}|${o.shift ?? ''}|${o.sat ?? ''}|${o.shadowHue ?? ''}|${o.cap ?? ''}`;
    let id = this.keys.get(key);
    if (id === undefined) {
      let ramp = makeRamp(hex, o);
      if (o.cap !== undefined) {
        // Squeeze the steps above the cap under it (keeping their order and hue): a night
        // plant's top light stays at the 3D foliage's lit value instead of going mint / pale.
        const cap = o.cap;
        const top = hexToOklch(ramp[ramp.length - 1])[0];
        if (top > cap) {
          const base = Math.min(hexToOklch(ramp[3])[0], cap - 0.04);
          ramp = ramp.map((c, i) => {
            const [L, C, h] = hexToOklch(c);
            if (L <= base) return c;
            const t = (L - base) / Math.max(1e-3, top - base);
            return oklchToHex(base + t * (cap - base), C, h);
          });
        }
      }
      this.ramps.push(ramp);
      id = this.ramps.length;
      if (id > 255) throw new Error('flora palette full');
      this.keys.set(key, id);
    }
    return id;
  }
}

/** Angle bins of a puff's rim radius table (shared scratch: painting is single-threaded). */
const TIP_BINS = 48;
const TIP_TAB = new Float32Array(TIP_BINS);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export interface ShadeOpts {
  /** Added to the tone (−1…1; ≈ 0.25 per ramp step). */
  bias?: number;
  /** Lighting contrast (default 1). */
  amp?: number;
  /** Depth (texels toward the viewer) of the shape's front. */
  z?: number;
  flag?: number;
}

/**
 * One sprite at one resolution. `s` = scale from level-0 texels to this canvas
 * (1, 1/2, 1/4, 1/8).
 */
export class FloraCanvas {
  readonly mat: Uint8Array;
  readonly tone: Float32Array;
  readonly z: Float32Array;
  readonly flag: Uint8Array;
  /**
   * Strand density for this level (1 = everything): balanced species (grass,
   * ferns, fronds) draw fewer / narrower strands below 1 — set by the atlas
   * painter so every mip level keeps the coverage of the one above it.
   */
  density = 1;
  constructor(
    readonly w: number,
    readonly h: number,
    readonly s = 1,
  ) {
    const n = w * h;
    this.mat = new Uint8Array(n);
    this.tone = new Float32Array(n);
    this.z = new Float32Array(n).fill(-1e9);
    this.flag = new Uint8Array(n);
  }

  /** Opaque fraction of the canvas. */
  coverage(): number {
    let n = 0;
    for (let i = 0; i < this.mat.length; i++) if (this.mat[i]) n++;
    return n / this.mat.length;
  }

  /** Smallest drawn radius / half-width (canvas texels). */
  private minR(r: number): number {
    return Math.max(0.5, r * this.s);
  }

  set(ix: number, iy: number, mat: number, tone: number, z: number, flag = 0) {
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const i = iy * this.w + ix;
    this.mat[i] = mat;
    this.tone[i] = tone;
    this.z[i] = z;
    this.flag[i] = flag;
  }

  /** Tone of a normal under the sprite light. */
  static lit(nx: number, ny: number, nz: number, o: ShadeOpts): number {
    const l = nx * LX + ny * LY + nz * LZ;
    return 0.5 + 0.5 * l * (o.amp ?? 1) + (o.bias ?? 0);
  }

  /** Filled ellipse with sphere shading. */
  ellipse(cx: number, cy: number, rx: number, ry: number, mat: number, o: ShadeOpts = {}) {
    const s = this.s;
    const X = cx * s;
    const Y = cy * s;
    const RX = this.minR(rx);
    const RY = this.minR(ry);
    const z0 = (o.z ?? 0) * s;
    for (let iy = Math.floor(Y - RY); iy <= Math.ceil(Y + RY); iy++) {
      for (let ix = Math.floor(X - RX); ix <= Math.ceil(X + RX); ix++) {
        const u = (ix + 0.5 - X) / RX;
        const v = (iy + 0.5 - Y) / RY;
        const d = u * u + v * v;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        this.set(ix, iy, mat, FloraCanvas.lit(u, v, nz, o), z0 + nz * Math.min(RX, RY) * 0.5, o.flag ?? 0);
      }
    }
  }

  /**
   * Leafy cluster ("puff"): a small disc whose rim breaks into pointed leaf
   * tips (longer and hanging on the underside), lit mostly by its OWN bulge —
   * every cluster gets a lit crescent upper-left and a dark underside, the way
   * sprite artists build foliage — blended with the mass it belongs to (`mass`
   * ellipse) so the canopy as a whole still turns from light to shade.
   */
  puff(
    cx: number,
    cy: number,
    r: number,
    mat: number,
    rng: FloraRng,
    mass: { x: number; y: number; rx: number; ry: number },
    o: ShadeOpts & { tips?: number; droop?: number; massW?: number } = {},
  ) {
    const s = this.s;
    const X = cx * s;
    const Y = cy * s;
    const R = Math.max(1, r * s);
    const nt = o.tips ?? 7;
    // Rim radius per angle bin: pointed leaf tips (longer on the underside).
    const tab = TIP_TAB;
    if (R >= 2) {
      tab.fill(0.82);
      const a0 = rng.next() * Math.PI * 2;
      for (let i = 0; i < nt; i++) {
        const ta = a0 + (i / nt) * Math.PI * 2 + rng.spread(0.3);
        const len = rng.range(0.25, 0.55);
        for (let b = 0; b < TIP_BINS; b++) {
          const th = -Math.PI + ((b + 0.5) / TIP_BINS) * Math.PI * 2;
          let dt = Math.abs(th - ta) % (Math.PI * 2);
          if (dt > Math.PI) dt = Math.PI * 2 - dt;
          const w = 1 - dt / 0.38;
          if (w <= 0) continue;
          const v = 0.82 + w * w * len * (th < 0 ? 1.3 : 0.8);
          if (v > tab[b]) tab[b] = v;
        }
      }
    } else {
      // Keep the RNG stream identical whatever the resolution (levels must match).
      rng.next();
      for (let i = 0; i < nt; i++) {
        rng.next();
        rng.next();
      }
      tab.fill(0.82);
    }
    const droop = o.droop ?? 0.35;
    const mw = o.massW ?? 0.35;
    const z0 = (o.z ?? 0) * s;
    const ext = R * 1.6 + 1;
    const inner2 = R * 0.82 * (R * 0.82);
    const mx = mass.x * s;
    const my = mass.y * s;
    const mrx = Math.max(1, mass.rx * s);
    const mry = Math.max(1, mass.ry * s);
    const flag = o.flag ?? 0;
    const amp = o.amp ?? 1;
    const bias = o.bias ?? 0;
    const W = this.w;
    const H = this.h;
    // Nothing reaches past the longest tip (or `ext`): rows and spans are clipped to that disc and the canvas.
    let tmax = 0;
    for (let b = 0; b < TIP_BINS; b++) if (tab[b] > tmax) tmax = tab[b];
    const lim = Math.min(ext, R * Math.max(0.82, tmax)) + 1e-3;
    const lim2 = lim * lim;
    const ext2 = ext * ext;
    const iy0 = Math.max(0, Math.floor(Y - lim * (1 + droop)));
    const iy1 = Math.min(H - 1, Math.ceil(Y + lim));
    for (let iy = iy0; iy <= iy1; iy++) {
      let v = iy + 0.5 - Y;
      // Leaves hang: the lower rim reaches further down.
      if (v < 0) v /= 1 + droop;
      const span2 = lim2 - v * v;
      if (span2 < 0) continue;
      const span = Math.sqrt(span2);
      const ix0 = Math.max(0, Math.floor(X - span - 0.5));
      const ix1 = Math.min(W - 1, Math.ceil(X + span - 0.5));
      for (let ix = ix0; ix <= ix1; ix++) {
        const u = ix + 0.5 - X;
        const d2 = u * u + v * v;
        if (d2 > ext2) continue;
        let tipT = false;
        if (d2 > inner2) {
          const th = Math.atan2(v, u);
          const rr = R * tab[Math.min(TIP_BINS - 1, Math.floor(((th + Math.PI) / (Math.PI * 2)) * TIP_BINS))];
          if (d2 > rr * rr) continue;
          tipT = true;
        }
        const pu = u / R;
        const pv = v / R;
        const pz = Math.sqrt(Math.max(0, 1 - Math.min(1, pu * pu + pv * pv)));
        const mu = (ix + 0.5 - mx) / mrx;
        const mv = (iy + 0.5 - my) / mry;
        const mz = Math.sqrt(Math.max(0, 1 - Math.min(1, mu * mu + mv * mv)));
        let nx = mu * mw + pu * (1 - mw);
        let ny = mv * mw + pv * (1 - mw);
        let nz = mz * mw + pz * (1 - mw);
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        let t = 0.5 + 0.5 * (nx * LX + ny * LY + nz * LZ) * amp + bias;
        // Leaf tips beyond the disc are single leaves: a touch darker than the cluster face.
        if (tipT) t -= 0.06;
        const i = iy * W + ix;
        this.mat[i] = mat;
        this.tone[i] = t;
        this.z[i] = z0 + pz * R * 0.35;
        this.flag[i] = flag;
      }
    }
  }

  /**
   * A canopy / bush mass: small leaf clusters scattered over an ellipse,
   * painted back to front (rim clusters first, the bulge last; lower ones
   * before upper ones) so each cluster's dark underside overlaps the one below
   * with a step of cast shadow — layered leaves, not a blob. Clusters of one
   * mass stay within a few texels of depth (no hard contour inside a mass);
   * masses at different `z` get an inner contour between them.
   */
  mass(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    mat: number,
    rng: FloraRng,
    o: ShadeOpts & { puff?: number; tips?: number; droop?: number; glint?: number; dark?: number; massW?: number } = {},
  ) {
    const pr = o.puff ?? Math.max(2.5, Math.min(6, Math.min(rx, ry) * 0.22));
    const sp = pr * 1.25;
    const pts: { x: number; y: number; r: number; z: number }[] = [];
    const rows = Math.ceil((ry * 2) / (sp * 0.8));
    for (let j = 0; j <= rows; j++) {
      const y = cy - ry + j * sp * 0.8 + rng.spread(sp * 0.2);
      const off = j % 2 ? sp * 0.5 : 0;
      for (let x = cx - rx + off; x <= cx + rx; x += sp) {
        const px = x + rng.spread(sp * 0.3);
        const py = y + rng.spread(sp * 0.2);
        const u = (px - cx) / Math.max(1, rx - pr * 0.6);
        const v = (py - cy) / Math.max(1, ry - pr * 0.6);
        const d = u * u + v * v;
        if (d > 1) continue;
        pts.push({ x: px, y: py, r: pr * rng.range(0.8, 1.2), z: Math.sqrt(1 - d) + rng.spread(0.1) + v * 0.25 });
      }
    }
    if (!pts.length) pts.push({ x: cx, y: cy, r: pr, z: 1 });
    pts.sort((a, b) => a.z - b.z);
    const m = { x: cx, y: cy, rx, ry };
    const zBase = o.z ?? 0;
    const g = o.glint ?? 1;
    for (const p of pts) {
      const pz = zBase + p.z * 2.5;
      this.puff(p.x, p.y, p.r, mat, rng, m, { ...o, z: pz });
      // Leaf marks: the RNG is drawn the same way at every resolution (mip levels share one layout).
      const detail = this.s >= 0.5 && p.r * this.s >= 2.5;
      const lit = (-(p.x - cx) / rx) * 0.55 + ((p.y - cy) / ry) * 0.62;
      // Leaf glint: a short lit leaf in the cluster's upper left.
      for (let k = 0; k < g; k++) {
        const gx = p.x - p.r * rng.range(0.1, 0.45);
        const gy = p.y + p.r * rng.range(0.15, 0.5);
        const gd = rng.chance(0.5) ? 1 : -1;
        if (detail && lit >= -0.35) this.mark(gx, gy, gd, mat, 0.18, pz + 1);
      }
      // Dark gap between leaves low on the shadow side.
      const dk = rng.chance(0.7);
      const dx = p.x + p.r * rng.range(0.05, 0.4);
      const dy = p.y - p.r * rng.range(0.25, 0.55);
      const dd = rng.chance(0.5) ? 1 : -1;
      if (detail && (o.dark ?? 1) > 0 && lit < 0.3 && dk) this.mark(dx, dy, dd, mat, -0.2, pz + 1);
    }
  }

  /** A 2–3-texel leaf mark (canvas-resolution detail): shifts the existing tone of `mat` texels by `dt`. */
  private mark(x: number, y: number, dir: number, mat: number, dt: number, z: number) {
    const s = this.s;
    const ix = Math.floor(x * s);
    const iy = Math.floor(y * s);
    const n = s >= 1 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const jx = ix + k;
      const jy = iy + (dir > 0 ? -(k >> 1) : k >> 1);
      if (jx < 0 || jy < 0 || jx >= this.w || jy >= this.h) continue;
      const i = jy * this.w + jx;
      if (this.mat[i] !== mat) continue;
      this.tone[i] += dt;
      this.z[i] = Math.max(this.z[i], z * s);
    }
  }

  /**
   * Tapered stroke along a polyline (`pts` = x0,y0,x1,y1,…; `w` = half-widths
   * per point) with cylinder shading across it. `bark` adds vertical fissures,
   * `rings` dark bands every n texels along it (palm trunks: `ringStep` = how
   * much darker, `slant` tilts them, spacing wanders a little). `bands` = the
   * sprite artist's flat cylinder (lit column left, base, shadow band right)
   * instead of the smooth light.
   */
  stroke(
    pts: number[],
    w: number[],
    mat: number,
    o: ShadeOpts & { bark?: number; rings?: number; ringMat?: number; ringStep?: number; slant?: number; bands?: boolean; flat?: number; seed?: number } = {},
  ) {
    const s = this.s;
    const n = pts.length / 2;
    const z0 = (o.z ?? 0) * s;
    let along0 = 0;
    for (let k = 0; k < n - 1; k++) {
      const ax = pts[k * 2] * s;
      const ay = pts[k * 2 + 1] * s;
      const bx = pts[k * 2 + 2] * s;
      const by = pts[k * 2 + 3] * s;
      const wa = this.minR(w[k]);
      const wb = this.minR(w[k + 1]);
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1e-6;
      const tx = dx / len;
      const ty = dy / len;
      const wm = Math.max(wa, wb);
      const x0 = Math.floor(Math.min(ax, bx) - wm - 1);
      const x1 = Math.ceil(Math.max(ax, bx) + wm + 1);
      const y0 = Math.floor(Math.min(ay, by) - wm - 1);
      const y1 = Math.ceil(Math.max(ay, by) + wm + 1);
      for (let iy = y0; iy <= y1; iy++) {
        for (let ix = x0; ix <= x1; ix++) {
          const px = ix + 0.5 - ax;
          const py = iy + 0.5 - ay;
          let t = (px * tx + py * ty) / len;
          // Segments overlap at the joints: each owns [0, 1) except the last.
          if (t < 0 && k > 0) continue;
          t = Math.max(0, Math.min(1, t));
          const cx = px - tx * t * len;
          const cy = py - ty * t * len;
          const hw = wa + (wb - wa) * t;
          const across = cx * -ty + cy * tx; // signed, + = left of the direction
          if (cx * cx + cy * cy > hw * hw) continue;
          const sa = Math.max(-1, Math.min(1, across / hw));
          // Cylinder normal: across the stroke in the screen plane, bulging toward the viewer.
          const flat = o.flat ?? 0;
          const nx = -ty * sa * (1 - flat);
          const ny = tx * sa * (1 - flat);
          const nz = Math.sqrt(Math.max(0, 1 - sa * sa * (1 - flat)));
          let tone = FloraCanvas.lit(nx, ny, nz, o);
          if (o.bands) {
            // Flat cylinder bands on ramp-step centres (u = −1 left … 1 right of an upward stroke).
            const u = -sa;
            tone = (o.bias ?? 0) + (u < -0.6 ? 0.75 : u < 0.36 ? 0.5 : u < 0.76 ? 0.25 : 0.06);
          }
          const al = (along0 + t * len) / s; // level-0 texels along the stroke
          if (o.bark) {
            // Vertical fissures that wander a little along the trunk.
            const seed = o.seed ?? 0;
            const f = sa * o.bark + Math.sin(al * 0.21 + seed) * 0.35 + Math.sin(al * 0.07 + seed * 2.3) * 0.5;
            const fr = f - Math.floor(f);
            if (fr < 0.16 && hw >= 2) tone -= 0.3;
            else if (fr < 0.3 && hw >= 2 && sa < 0.3) tone += 0.07;
          }
          let m = mat;
          if (o.rings) {
            // Irregular spacing and a slight slant (a leaf scar wraps round the trunk, not a stacked disc).
            const ph = (al + sa * hw * (o.slant ?? 0)) / o.rings + (o.slant ? 0.3 * Math.sin(al * 0.29 + (o.seed ?? 0)) : 0);
            const rr = ph - Math.floor(ph);
            if (rr < 1 / o.rings + 0.08) {
              tone -= o.ringStep ?? 0.28;
              if (o.ringMat) m = o.ringMat;
            } else if (!o.ringStep && rr < 2.2 / o.rings + 0.08) tone += 0.06;
          }
          this.set(ix, iy, m, tone, z0 + Math.sqrt(Math.max(0, 1 - sa * sa)) * hw * 0.5, (o.flag ?? 0) | (hw < 1 ? FF.THIN : 0));
        }
      }
      along0 += len;
    }
  }

  /** Quadratic-curve tapered stroke (blades, stalks, vines): a → (control c) → b. */
  curve(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, w0: number, w1: number, mat: number, o: ShadeOpts & { steps?: number; bands?: boolean; flat?: number } = {}) {
    const n = o.steps ?? Math.max(3, Math.ceil(Math.hypot(bx - ax, by - ay) * this.s / 3));
    const pts: number[] = [];
    const ws: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      pts.push(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
      ws.push(w0 + (w1 - w0) * t);
    }
    this.stroke(pts, ws, mat, o);
  }

  /**
   * Pointed leaf from (x, y) along angle `ang` (radians, 0 = right, π/2 = up):
   * `len` long, `wid` half-width. `shape` 0 = lens (small leaves), 1 = arrow /
   * heart (elephant ears: broad near the stalk, pointed tip). The half on the
   * lit side of the midrib is a step brighter (a folded leaf); `rib` adds a pale
   * midrib and side veins slanting toward the tip.
   */
  leaf(x: number, y: number, ang: number, len: number, wid: number, mat: number, o: ShadeOpts & { rib?: boolean; shape?: number } = {}) {
    const s = this.s;
    const X = x * s;
    const Y = y * s;
    const L = Math.max(1, len * s);
    const W = Math.max(0.5, wid * s);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const z0 = (o.z ?? 0) * s;
    const shape = o.shape ?? 0;
    // Which side of the midrib faces the light (screen-space light from the upper left).
    const litSide = -sa * LX + ca * LY > 0 ? 1 : -1;
    const bias = o.bias ?? 0;
    const amp = o.amp ?? 1;
    const veins = o.rib && W >= 2;
    const vs = Math.max(2.5, L / 5);
    const r = L + W + 1;
    for (let iy = Math.floor(Y - r); iy <= Math.ceil(Y + r); iy++) {
      for (let ix = Math.floor(X - r); ix <= Math.ceil(X + r); ix++) {
        const px = ix + 0.5 - X;
        const py = iy + 0.5 - Y;
        const u = px * ca + py * sa;
        const v = -px * sa + py * ca;
        if (u < 0 || u > L) continue;
        const t = u / L;
        // Heart: round lobes at the stalk end, widest a third of the way, a drawn-out tip.
        const half =
          shape === 1
            ? W * (t < 0.3 ? 0.78 + 0.22 * Math.sin((t / 0.3) * Math.PI * 0.5) : Math.pow(Math.cos(((t - 0.3) / 0.7) * Math.PI * 0.5), 0.8)) * (t < 0.04 ? 0.6 + t * 10 : 1)
            : W * Math.pow(Math.sin(Math.PI * t), 0.75);
        if (Math.abs(v) > half + 0.15) continue;
        const side = v * litSide >= 0 ? 1 : -1;
        let tone = 0.5 + bias + side * 0.12 * amp;
        if (veins) {
          const av = Math.abs(v);
          if (av < 0.55 && t > 0.04 && t < 0.9) tone += 0.2;
          // Side veins: lines running from the midrib out toward the tip.
          else if (av < half - 0.8 && (((u - av * 0.9) % vs) + vs) % vs < 1.25) tone += side > 0 ? 0.2 : -0.22;
          // Rim of the blade curls: the edge a step darker on the shaded half.
          else if (av > half - 1.1 && side < 0) tone -= 0.12;
        }
        // Tip a little darker (curls away).
        tone -= t * 0.08;
        this.set(ix, iy, mat, tone, z0, (o.flag ?? 0) | (W < 1.2 ? FF.THIN : 0));
      }
    }
  }

  /**
   * One-texel line at this canvas's resolution (leaflets, blades, veins) —
   * level-0 end points, stays one texel wide at every mip level.
   */
  line(x0: number, y0: number, x1: number, y1: number, mat: number, tone: number, z = 0, flag: number = FF.THIN | FF.SOFT) {
    const s = this.s;
    const ax = x0 * s;
    const ay = y0 * s;
    const bx = x1 * s;
    const by = y1 * s;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.set(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), mat, tone, z * s, flag);
    }
  }

  /** Filled polygon (level-0 points) with a flat tone, optionally shaded by a function of (x, y) in level-0 texels. */
  poly(pts: number[], mat: number, tone: number | ((x: number, y: number) => number), o: ShadeOpts = {}) {
    const s = this.s;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i] * s);
      x1 = Math.max(x1, pts[i] * s);
      y0 = Math.min(y0, pts[i + 1] * s);
      y1 = Math.max(y1, pts[i + 1] * s);
    }
    const n = pts.length / 2;
    const z0 = (o.z ?? 0) * s;
    for (let iy = Math.floor(y0); iy <= Math.ceil(y1); iy++) {
      for (let ix = Math.floor(x0); ix <= Math.ceil(x1); ix++) {
        const px = (ix + 0.5) / s;
        const py = (iy + 0.5) / s;
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = pts[i * 2];
          const yi = pts[i * 2 + 1];
          const xj = pts[j * 2];
          const yj = pts[j * 2 + 1];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (!inside) continue;
        const t = typeof tone === 'number' ? tone : tone(px, py);
        this.set(ix, iy, mat, t + (o.bias ?? 0), z0, o.flag ?? 0);
      }
    }
  }
}

export interface ResolveOpts {
  /** Dither band width between two steps (0 = hard steps, 1 = full ordered dither). */
  dither?: number;
  /** Depth step (level-0 texels) above which an overlap gets an inner contour (between masses). */
  contour?: number;
  /** Depth step above which a nearer texel up / left casts one step of shadow (between leaf clusters). */
  shadow?: number;
  /** Outline step on the shadow side (0 = the ramp's darkest). */
  outline?: number;
}

/** Alpha of a back-lit (right) edge texel (the billboard shader adds the night rim there). */
export const RIM_ALPHA = 236;

/**
 * Resolve a painted canvas to RGBA8 (row 0 = the sprite's BOTTOM row, ready
 * for a texture whose v = 0 is the bottom). Alpha: 0 empty, RIM_ALPHA on the
 * back-lit (right) exterior edge, 255 elsewhere.
 */
export function resolveCanvas(c: FloraCanvas, pal: FloraPalette, o: ResolveOpts = {}): Uint8Array {
  const { w, h } = c;
  const out = new Uint8Array(w * h * 4);
  const dw = o.dither ?? 0.25;
  const ct = (o.contour ?? 6) * c.s;
  const cs = (o.shadow ?? 1.2) * c.s;
  const mat = c.mat;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mat[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mat[i];
      if (!m) continue;
      const ramp = pal.ramps[m - 1];
      const fl = c.flag[i];
      // Tone → step 1…5 with a narrow ordered-dither band between steps.
      const t = Math.max(0, Math.min(1, c.tone[i]));
      const sf = 1 + t * 4;
      const base = Math.floor(sf);
      const fr = sf - base;
      const b = BAYER[(y & 3) * 4 + (x & 3)];
      let step = fr > 0.5 + (b - 0.5) * dw ? base + 1 : base;
      step = Math.max(1, Math.min(STEPS - 1, step));
      // Exterior edges.
      const eR = !at(x + 1, y);
      const eL = !at(x - 1, y);
      const eU = !at(x, y + 1);
      const eD = !at(x, y - 1);
      const thin = (fl & FF.THIN) !== 0 || (eL && eR) || (eU && eD);
      let alpha = 255;
      // The smallest mip levels are mostly 1-texel runs (never outlined): half of them a step
      // darker keeps the plant's weight when it switches level.
      if (thin && c.s <= 0.25 && (x + y) & 1) step = Math.max(1, step - 1);
      if ((eR || eD) && !thin) {
        step = o.outline ?? 0;
        // Back-lit edge (right, away from the sprite light): the night rim goes here.
        if (eR) alpha = RIM_ALPHA;
      } else if ((eU || eL) && !thin) {
        // Lit top-left edge: no outline (selective outline).
      } else if (!(fl & FF.SOFT) && !(fl & FF.FLAT)) {
        // Inner contour where a nearer cluster borders this texel; cast shadow below-right of one.
        const zc = c.z[i];
        let contour = false;
        let shadow = false;
        for (let k = 0; k < 4; k++) {
          const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (!at(nx, ny)) continue;
          const zn = c.z[ny * w + nx];
          if (zn > zc + ct) contour = true;
        }
        if (!contour) {
          for (let k = 1; k <= 2 && !shadow; k++) {
            for (const [dx, dy] of SHADOW_OFF) {
              const nx = x + dx * k;
              const ny = y + dy * k;
              if (!at(nx, ny)) continue;
              if (c.z[ny * w + nx] > zc + cs) shadow = true;
            }
          }
        }
        if (contour) step = Math.max(0, step - 2);
        else if (shadow) step = Math.max(1, step - 1);
      }
      const col = ramp[step];
      const q = i * 4;
      out[q] = (col >> 16) & 255;
      out[q + 1] = (col >> 8) & 255;
      out[q + 2] = col & 255;
      out[q + 3] = alpha;
    }
  }
  return out;
}

/** Cast-shadow probes: toward the light (up, up-left, left). */
const SHADOW_OFF: [number, number][] = [
  [0, 1],
  [-1, 1],
  [-1, 0],
];
