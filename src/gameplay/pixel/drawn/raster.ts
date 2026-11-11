/**
 * DRAWN FIGURES (docs/PIXELWORLD3.md, "People"): the CPU rasteriser.
 *
 * A person is drawn the way a sprite artist inks one: closed outlines from a few control points,
 * filled flat, one shadow shape, an ink line round the silhouette of the WHOLE figure and thinner
 * lines inside. Nothing here knows about 3D or WebGL: it writes an indexed buffer, so a figure can
 * be rendered to a PNG in milliseconds in node and judged by eye.
 *
 * Texel values: 0 = empty, otherwise 1 + ramp × RAMP_TONES + tone (tone 0 = ink, 1 line / deep
 * shadow, 2 shadow, 3 base, 4 light, 5 shine; the same six steps `materials.ts` builds).
 */

export const RAMP_TONES = 6;
/** Tone of the ink line round the silhouette. */
export const INK = 0;
/** Biggest figure canvas (texels): above about 340 texels tall a figure is at the lens. */
export const MAX_CANVAS = 480;

/** Group that takes no interior line against its neighbours. */
export const NO_LINE = 0;

const MAX_CROSS = 40;
const MAX_PTS = 1024;
const MAX_POLY = 4096;

export class IndexedCanvas {
  readonly w: number;
  readonly h: number;
  /** The colour: 0 empty, 1 + ramp × RAMP_TONES + tone. */
  readonly idx: Uint8Array;
  /** Tone the texel's shape was filled with (shade and light shapes are relative to it, so they never stack). */
  readonly base: Uint8Array;
  /** Gameplay part drawn here (0 none, then PART codes: what aiming tests read). */
  readonly part: Uint8Array;
  /** Drawing group (a sleeve, a vest, a boot...): interior lines run where groups meet. */
  readonly group: Uint8Array;
  /** Paint order of the group that covers the texel (which side of a boundary is nearer). */
  readonly order: Uint16Array;
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.idx = new Uint8Array(n);
    this.base = new Uint8Array(n);
    this.part = new Uint8Array(n);
    this.group = new Uint8Array(n);
    this.order = new Uint16Array(n);
    this.clear();
  }

  clear() {
    this.idx.fill(0);
    this.base.fill(0);
    this.part.fill(0);
    this.group.fill(0);
    this.order.fill(0);
    this.x0 = this.w;
    this.y0 = this.h;
    this.x1 = -1;
    this.y1 = -1;
  }

  /** Grow the dirty rectangle to include (x0..x1, y0..y1), texels. */
  touch(x0: number, y0: number, x1: number, y1: number) {
    if (x0 < this.x0) this.x0 = x0;
    if (y0 < this.y0) this.y0 = y0;
    if (x1 > this.x1) this.x1 = x1;
    if (y1 > this.y1) this.y1 = y1;
  }
}

/** The pen: collects control points (in texels, y down), flattens the curve and fills, shades or strokes it. */
export class Pen {
  readonly c: IndexedCanvas;
  /** Control points of the outline being built: x, y, corner flag. */
  private cx = new Float32Array(MAX_PTS);
  private cy = new Float32Array(MAX_PTS);
  private cf = new Uint8Array(MAX_PTS);
  private n = 0;
  /** The flattened polyline. */
  private px = new Float32Array(MAX_POLY);
  private py = new Float32Array(MAX_POLY);
  private pn = 0;
  /** Span crossings per row. */
  private crossX: Float32Array;
  private crossD: Int8Array;
  private crossN: Uint8Array;
  private yLo = 0;
  private yHi = -1;
  /** Interior-line tone offset by group (0 = no line against neighbours); set when a group is first filled. */
  readonly lineDelta = new Int8Array(256);
  private serial = 0;
  /** Circles (texels) inside which no interior line is drawn: a sleeve flows into the shoulder, not a paper doll's seam. */
  private supX = new Float32Array(16);
  private supY = new Float32Array(16);
  private supR = new Float32Array(16);
  private supN = 0;
  /** Paint serial of the group most recently filled, by group id. */
  private gOrder = new Uint16Array(256);

  constructor(c: IndexedCanvas) {
    this.c = c;
    this.crossX = new Float32Array(c.h * MAX_CROSS);
    this.crossD = new Int8Array(c.h * MAX_CROSS);
    this.crossN = new Uint8Array(c.h);
  }

  /** Forget every group's line setting and paint serial (start of a figure). */
  reset() {
    this.lineDelta.fill(0);
    this.gOrder.fill(0);
    this.serial = 0;
    this.supN = 0;
  }

  /** No interior line within radius `r` of (x, y) (texels). */
  suppress(x: number, y: number, r: number) {
    if (this.supN < 16) {
      this.supX[this.supN] = x;
      this.supY[this.supN] = y;
      this.supR[this.supN] = r * r;
      this.supN++;
    }
  }

  begin() {
    this.n = 0;
    return this;
  }

  /** Add a control point (texels). `corner` makes a hard corner instead of a smooth curve. */
  add(x: number, y: number, corner = false) {
    if (this.n < MAX_PTS) {
      this.cx[this.n] = x;
      this.cy[this.n] = y;
      this.cf[this.n] = corner ? 1 : 0;
      this.n++;
    }
    return this;
  }

  /** How many control points the current outline holds. */
  get points() {
    return this.n;
  }

  private flatten(closed: boolean) {
    const n = this.n;
    const cx = this.cx;
    const cy = this.cy;
    const cf = this.cf;
    let pn = 0;
    if (n < 2) {
      this.pn = 0;
      return;
    }
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const i0 = closed ? (i + n - 1) % n : Math.max(0, i - 1);
      const i1 = i;
      const i2 = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      const i3 = closed ? (i + 2) % n : Math.min(n - 1, i + 2);
      const x1 = cx[i1];
      const y1 = cy[i1];
      const x2 = cx[i2];
      const y2 = cy[i2];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const seg = Math.sqrt(dx * dx + dy * dy);
      // Tangents as directions scaled by this segment's own length: unevenly spaced control points
      // (a long thigh after a tight knee) do not overshoot the way a uniform Catmull-Rom does.
      let t1x: number;
      let t1y: number;
      if (cf[i1] === 1 || (!closed && i1 === 0)) {
        t1x = dx;
        t1y = dy;
      } else {
        const ax = x2 - cx[i0];
        const ay = y2 - cy[i0];
        const l = Math.max(1e-4, Math.sqrt(ax * ax + ay * ay));
        t1x = (ax / l) * seg;
        t1y = (ay / l) * seg;
      }
      let t2x: number;
      let t2y: number;
      if (cf[i2] === 1 || (!closed && i2 === n - 1)) {
        t2x = dx;
        t2y = dy;
      } else {
        const ax = cx[i3] - x1;
        const ay = cy[i3] - y1;
        const l = Math.max(1e-4, Math.sqrt(ax * ax + ay * ay));
        t2x = (ax / l) * seg;
        t2y = (ay / l) * seg;
      }
      const steps = Math.min(24, Math.max(1, Math.ceil(seg / 1.5)));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        if (pn < MAX_POLY) {
          this.px[pn] = h00 * x1 + h10 * t1x + h01 * x2 + h11 * t2x;
          this.py[pn] = h00 * y1 + h10 * t1y + h01 * y2 + h11 * t2y;
          pn++;
        }
      }
    }
    if (!closed && pn < MAX_POLY) {
      this.px[pn] = cx[n - 1];
      this.py[pn] = cy[n - 1];
      pn++;
    }
    this.pn = pn;
  }

  /** Crossings of the flattened closed polyline with texel-centre rows. */
  private scan(): boolean {
    const c = this.c;
    const pn = this.pn;
    if (pn < 3) return false;
    let lo = c.h;
    let hi = -1;
    const px = this.px;
    const py = this.py;
    for (let i = 0; i < pn; i++) {
      const y = py[i];
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    lo = Math.max(0, Math.floor(lo));
    hi = Math.min(c.h - 1, Math.ceil(hi));
    if (hi < lo) return false;
    this.crossN.fill(0, lo, hi + 1);
    for (let i = 0; i < pn; i++) {
      const j = (i + 1) % pn;
      let x0 = px[i];
      let y0 = py[i];
      let x1 = px[j];
      let y1 = py[j];
      let dir = 1;
      if (y0 > y1) {
        const tx = x0;
        const ty = y0;
        x0 = x1;
        y0 = y1;
        x1 = tx;
        y1 = ty;
        dir = -1;
      }
      const r0 = Math.max(lo, Math.ceil(y0 - 0.5));
      const r1 = Math.min(hi, Math.ceil(y1 - 0.5) - 1);
      if (r1 < r0) continue;
      const m = (x1 - x0) / (y1 - y0);
      for (let r = r0; r <= r1; r++) {
        const n = this.crossN[r];
        if (n >= MAX_CROSS) continue;
        const x = x0 + (r + 0.5 - y0) * m;
        // Insertion: rows hold a handful of crossings.
        let k = n;
        const base = r * MAX_CROSS;
        while (k > 0 && this.crossX[base + k - 1] > x) {
          this.crossX[base + k] = this.crossX[base + k - 1];
          this.crossD[base + k] = this.crossD[base + k - 1];
          k--;
        }
        this.crossX[base + k] = x;
        this.crossD[base + k] = dir;
        this.crossN[r] = n + 1;
      }
    }
    this.yLo = lo;
    this.yHi = hi;
    return true;
  }

  /**
   * Fills the outline as a new flat shape: ramp, base tone, gameplay part, drawing group.
   * `lineDelta` (tone steps, negative, 0 = none) is the interior line this group takes where it
   * lies over another group. Later fills of the same group merge with it (no line between them).
   */
  fill(ramp: number, tone: number, part: number, group: number, lineDelta = -2) {
    this.flatten(true);
    if (!this.scan()) return;
    const c = this.c;
    if (this.gOrder[group] === 0) {
      this.gOrder[group] = ++this.serial;
      this.lineDelta[group] = lineDelta;
    }
    const v = 1 + ramp * RAMP_TONES + tone;
    const order = this.gOrder[group];
    let x0 = c.w;
    let x1 = -1;
    for (let y = this.yLo; y <= this.yHi; y++) {
      const n = this.crossN[y];
      if (n === 0) continue;
      const base = y * MAX_CROSS;
      let wind = 0;
      for (let i = 0; i < n - 1; i++) {
        wind += this.crossD[base + i];
        if (wind === 0) continue;
        const a = Math.max(0, Math.ceil(this.crossX[base + i] - 0.5));
        const b = Math.min(c.w - 1, Math.ceil(this.crossX[base + i + 1] - 0.5) - 1);
        for (let x = a; x <= b; x++) {
          const k = y * c.w + x;
          c.idx[k] = v;
          c.base[k] = tone;
          c.part[k] = part;
          c.group[k] = group;
          c.order[k] = order;
        }
        if (b >= a) {
          if (a < x0) x0 = a;
          if (b > x1) x1 = b;
        }
      }
    }
    if (x1 >= x0) c.touch(x0, this.yLo, x1, this.yHi);
  }

  /**
   * Fills the outline only over texels of `group` (a shadow or light shape, or a printed detail):
   * the texel's own ramp, at `base tone + delta` (one shape over another never stacks), or, with
   * `ramp` given, that ramp at `tone` (a stripe, a stain).
   */
  shade(group: number, delta: number, ramp = -1, tone = 3) {
    this.flatten(true);
    if (!this.scan()) return;
    const c = this.c;
    for (let y = this.yLo; y <= this.yHi; y++) {
      const n = this.crossN[y];
      if (n === 0) continue;
      const base = y * MAX_CROSS;
      let wind = 0;
      for (let i = 0; i < n - 1; i++) {
        wind += this.crossD[base + i];
        if (wind === 0) continue;
        const a = Math.max(0, Math.ceil(this.crossX[base + i] - 0.5));
        const b = Math.min(c.w - 1, Math.ceil(this.crossX[base + i + 1] - 0.5) - 1);
        for (let x = a; x <= b; x++) {
          const k = y * c.w + x;
          if (group !== 0 && c.group[k] !== group) continue;
          if (c.idx[k] === 0) continue;
          if (ramp >= 0) {
            c.idx[k] = 1 + ramp * RAMP_TONES + tone;
            c.base[k] = tone;
          } else {
            const r = Math.floor((c.idx[k] - 1) / RAMP_TONES);
            const t = Math.max(1, Math.min(RAMP_TONES - 1, c.base[k] + delta));
            c.idx[k] = 1 + r * RAMP_TONES + t;
          }
        }
      }
    }
  }

  /**
   * Strokes the open curve 1 texel wide: only over texels of `group` (0 = any filled texel), in
   * the texel's own ramp at its `base + delta` (a fold) or, with `ramp`, that ramp at `tone`.
   */
  stroke(group: number, delta: number, ramp = -1, tone = 3, closed = false) {
    this.flatten(closed);
    const pn = this.pn;
    if (pn < 2) return;
    const c = this.c;
    const end = closed ? pn : pn - 1;
    for (let i = 0; i < end; i++) {
      const j = (i + 1) % pn;
      let x0 = this.px[i];
      let y0 = this.py[i];
      const x1 = this.px[j];
      const y1 = this.py[j];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      const steps = Math.max(1, Math.ceil(m));
      const sx = dx / steps;
      const sy = dy / steps;
      for (let s = 0; s <= steps; s++) {
        this.plot(Math.floor(x0), Math.floor(y0), group, delta, ramp, tone);
        x0 += sx;
        y0 += sy;
      }
    }
  }

  /** One texel (eyes, teeth, rivets), over `group` only (0 = any filled texel). */
  plot(x: number, y: number, group: number, delta: number, ramp: number, tone: number) {
    const c = this.c;
    if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
    const k = y * c.w + x;
    if (c.idx[k] === 0) return;
    if (group !== 0 && c.group[k] !== group) return;
    if (ramp >= 0) {
      c.idx[k] = 1 + ramp * RAMP_TONES + tone;
      c.base[k] = tone;
    } else {
      const r = Math.floor((c.idx[k] - 1) / RAMP_TONES);
      c.idx[k] = 1 + r * RAMP_TONES + Math.max(1, Math.min(RAMP_TONES - 1, c.base[k] + delta));
    }
  }

  /**
   * Ends the figure. The ink line round the silhouette of the UNION (never per part: no paper
   * doll), then the thinner interior lines, on the nearer side of every boundary between groups.
   */
  ink() {
    const c = this.c;
    const w = c.w;
    const h = c.h;
    const idx = c.idx;
    const x0 = Math.max(1, c.x0);
    const x1 = Math.min(w - 2, c.x1);
    const y0 = Math.max(1, c.y0);
    const y1 = Math.min(h - 2, c.y1);
    const group = c.group;
    const order = c.order;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = y * w + x;
        if (idx[k] === 0) continue;
        // Outer silhouette: an empty 4-neighbour.
        if (idx[k - 1] === 0 || idx[k + 1] === 0 || idx[k - w] === 0 || idx[k + w] === 0) {
          const r = Math.floor((idx[k] - 1) / RAMP_TONES);
          idx[k] = 1 + r * RAMP_TONES + INK;
          continue;
        }
        const g = group[k];
        const d = this.lineDelta[g];
        if (d === 0) continue;
        const o = order[k];
        // Interior line: on this texel when it borders a group painted earlier (it lies over it).
        let line = false;
        for (let q = 0; q < 4; q++) {
          const m = q === 0 ? k - 1 : q === 1 ? k + 1 : q === 2 ? k - w : k + w;
          const g2 = group[m];
          if (g2 !== g && g2 !== 0 && order[m] < o) {
            line = true;
            break;
          }
        }
        if (line) {
          for (let q = 0; q < this.supN; q++) {
            const dx = x + 0.5 - this.supX[q];
            const dy = y + 0.5 - this.supY[q];
            if (dx * dx + dy * dy < this.supR[q]) {
              line = false;
              break;
            }
          }
        }
        if (line) {
          const r = Math.floor((idx[k] - 1) / RAMP_TONES);
          const t = Math.max(1, Math.min(RAMP_TONES - 1, c.base[k] + d));
          idx[k] = 1 + r * RAMP_TONES + t;
        }
      }
    }
  }
}
