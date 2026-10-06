import { bayer, PWF, type PwCanvas, type PwRng } from './canvas';
import type { PwKit } from './atlas';
import { drawText, type PixelFont } from './font';
import { hash2 } from './surfaces';

/**
 * RESEARCH LABS painting kit — the d2 painters' shared strokes, drawn the way a
 * 90s background artist adds story to a wall: bullet pocks, claw gouges,
 * blood, water stains, rivets, stencils, scuffs. Every stroke shifts or sets
 * ramp tones (no free colour), lit from the upper left like the cast.
 */

export const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** Wrapped coordinate. */
export const wrapI = (v: number, n: number) => ((v % n) + n) % n;

/** Shift with wrap (seamless tiles). */
export function shiftW(c: PwCanvas, x: number, y: number, dt: number) {
  c.shift(wrapI(x, c.w), wrapI(y, c.h), dt);
}

/** Set with wrap. */
export function setW(c: PwCanvas, x: number, y: number, ramp: number, tone: number, flag = 0) {
  c.set(wrapI(x, c.w), wrapI(y, c.h), ramp, tone, flag);
}

/**
 * A bullet pock in a hard wall: a 2×2 dark hole, a ring of chipped (lighter)
 * plaster, the lower-right lip lit, two or three hairline cracks.
 */
export function bulletHole(c: PwCanvas, rng: PwRng, x: number, y: number, o: { cracks?: boolean } = {}) {
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [0, 2], [1, 2]]) shiftW(c, x + dx, y + dy, 0.75);
  shiftW(c, x, y, -2.5);
  shiftW(c, x + 1, y, -2);
  shiftW(c, x, y + 1, -2);
  shiftW(c, x + 1, y + 1, -1);
  shiftW(c, x + 2, y + 2, 1);
  if (o.cracks !== false) {
    for (let i = 0; i < 2 + (rng.chance(0.5) ? 1 : 0); i++) {
      let px = x + 0.5;
      let py = y + 0.5;
      let a = rng.next() * Math.PI * 2;
      const len = rng.int(2, 5);
      for (let j = 0; j < len; j++) {
        px += Math.cos(a) * 1.2;
        py += Math.sin(a) * 1.2;
        a += rng.spread(0.5);
        shiftW(c, Math.round(px) + (j === 0 ? Math.sign(Math.cos(a)) : 0), Math.round(py), -1);
      }
    }
  }
}

/**
 * Claw gouges (the labs' signature wear): `n` parallel strokes `len` texels long
 * at `angle`, each a dark groove with a lit lower lip, tapering at both ends
 * (dithered), chips torn out where the claw bit in.
 */
export function clawMarks(c: PwCanvas, x: number, y: number, len: number, angle: number, o: { n?: number; gap?: number; depth?: number; wrap?: boolean } = {}) {
  const n = o.n ?? 4;
  const gap = o.gap ?? 3;
  const depth = o.depth ?? 2;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  // Perpendicular for the stroke spacing.
  const px = -sa;
  const py = ca;
  const put = (xx: number, yy: number, dt: number) => (o.wrap === false ? c.shift(xx, yy, dt) : shiftW(c, xx, yy, dt));
  for (let s = 0; s < n; s++) {
    const off = (s - (n - 1) / 2) * gap;
    // Middle strokes longer (a hand of claws).
    const L = Math.round(len * (1 - Math.abs(s - (n - 1) / 2) * 0.12));
    const sx0 = x + px * off;
    const sy0 = y + py * off;
    for (let j = 0; j < L; j++) {
      const t = j / Math.max(1, L - 1);
      const xx = Math.round(sx0 + ca * j);
      const yy = Math.round(sy0 + sa * j);
      // Tapered: dithered at the tail, full in the middle.
      const k = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
      if (bayer(xx, yy) > k + 0.15) continue;
      put(xx, yy, -depth * (0.6 + 0.4 * k));
      // Lit lip on the lower / right side of the groove.
      put(xx + (py > 0 ? 0 : 1), yy + (py > 0 ? 1 : 0), 0.9 * k);
      if (k > 0.8 && j % 3 === 0) put(xx - (py > 0 ? 0 : 1), yy - (py > 0 ? 1 : 0), -0.75);
    }
    // Chip where the claw bit in.
    put(Math.round(sx0) - 1, Math.round(sy0), -1);
    put(Math.round(sx0), Math.round(sy0) - 1, -0.75);
  }
}

/** A blood splat: a dark core blob, a lighter wet rim, flung droplets in a direction. */
export function bloodSplat(c: PwCanvas, rng: PwRng, k: PwKit, x: number, y: number, r: number, o: { dir?: number; hex?: number; drips?: number; wrap?: boolean } = {}) {
  const b = k.ramp(o.hex ?? 0x6a0a0a, { light: 0.35, sat: 1.1 });
  const put = (xx: number, yy: number, t: number) => (o.wrap === false ? c.set(xx, yy, b, t) : setW(c, xx, yy, b, t));
  const R = Math.ceil(r + 1);
  for (let yy = -R; yy <= R; yy++) {
    for (let xx = -R; xx <= R; xx++) {
      const d = Math.hypot(xx, yy) / r + (hash2(x + xx, y + yy, 77) - 0.5) * 0.55;
      if (d > 1) continue;
      put(x + xx, y + yy, d < 0.45 ? 1 : d < 0.8 ? 2 : 2.6);
    }
  }
  const dir = o.dir ?? rng.next() * Math.PI * 2;
  for (let i = 0; i < Math.round(r * 2.2); i++) {
    const a = dir + rng.spread(0.9);
    const dist = r + rng.range(1, r * 2.2);
    const dx = Math.round(x + Math.cos(a) * dist);
    const dy = Math.round(y + Math.sin(a) * dist);
    put(dx, dy, rng.chance(0.5) ? 1 : 2);
    if (rng.chance(0.4)) put(dx + 1, dy, 2);
  }
  // Drips run DOWN (canvas y+) from the lower edge (walls).
  for (let i = 0; i < (o.drips ?? 0); i++) {
    const dx = x + rng.int(-Math.floor(r), Math.floor(r));
    const len = rng.int(3, Math.round(r * 3) + 4);
    for (let j = 0; j < len; j++) put(dx, y + Math.round(r * 0.5) + j, j > len - 2 ? 1 : 2);
    put(dx, y + Math.round(r * 0.5) + len, 1);
  }
}

/** A dragged blood smear (cut-out free: painted onto a surface) from (x0, y0) to (x1, y1), `w` wide, thinning out. */
export function bloodSmear(c: PwCanvas, k: PwKit, x0: number, y0: number, x1: number, y1: number, w: number, o: { hex?: number; wrap?: boolean } = {}) {
  const b = k.ramp(o.hex ?? 0x5a0808, { light: 0.35, sat: 1.05 });
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  const ux = (x1 - x0) / Math.max(1, n);
  const uy = (y1 - y0) / Math.max(1, n);
  for (let i = 0; i <= n; i++) {
    const t = i / Math.max(1, n);
    const ww = w * (1 - t * 0.7) * (0.8 + 0.2 * Math.sin(i * 0.7));
    for (let j = -Math.ceil(ww); j <= Math.ceil(ww); j++) {
      const xx = Math.round(x0 + ux * i - uy * j);
      const yy = Math.round(y0 + uy * i + ux * j);
      // Streaky: drag lines along the stroke, breaking up toward the end.
      const streak = hash2(j + 40, 3, 11) > 0.35;
      if (!streak && t > 0.3) continue;
      if (t > 0.6 && bayer(xx, yy) < (t - 0.6) * 2.2) continue;
      const tone = Math.abs(j) >= ww - 0.5 ? 2.4 : hash2(xx, yy, 5) > 0.85 ? 2.6 : 1.4;
      if (o.wrap === false) c.set(xx, yy, b, tone);
      else setW(c, xx, yy, b, tone);
    }
  }
}

/** A bloody hand print (palm + four fingers + thumb), 7 × 9 texels. */
export function handprint(c: PwCanvas, k: PwKit, x: number, y: number, o: { hex?: number } = {}) {
  const b = k.ramp(o.hex ?? 0x6a0a0a, { light: 0.35, sat: 1.1 });
  c.ellipse(x + 3, y + 6, 2.6, 2.2, b, 2);
  for (let f = 0; f < 4; f++) {
    const fx = x + 1 + f * 1.4;
    const len = f === 1 || f === 2 ? 4 : 3;
    for (let j = 0; j < len; j++) c.set(Math.round(fx), y + 4 - j, b, j === len - 1 ? 2.5 : 1.5);
  }
  c.set(x - 1, y + 5, b, 2);
  c.set(x - 2, y + 4, b, 2);
  // Smeared downward.
  for (let j = 0; j < 4; j++) c.set(x + 2 + (j % 2), y + 9 + j, b, 2);
}

/** Water / damp stain: a dithered darker patch with a darker ragged tide line. */
export function waterStain(c: PwCanvas, x: number, y: number, rx: number, ry: number, o: { dt?: number; wrap?: boolean } = {}) {
  const dt = o.dt ?? -0.75;
  for (let yy = -ry - 1; yy <= ry + 1; yy++) {
    for (let xx = -rx - 1; xx <= rx + 1; xx++) {
      const d = Math.hypot(xx / rx, yy / ry) + (hash2(x + xx, y + yy, 31) - 0.5) * 0.18;
      if (d > 1.05) continue;
      const put = (t: number) => (o.wrap === false ? c.shift(x + xx, y + yy, t) : shiftW(c, x + xx, y + yy, t));
      if (d > 0.9) put(dt * 1.4);
      else if (bayer(x + xx, y + yy) < 0.5) put(dt);
    }
  }
}

/** A rivet / bolt head: lit top-left texel, dark bottom-right shadow. */
export function rivet(c: PwCanvas, x: number, y: number, ramp: number, base = 3) {
  c.set(x, y, ramp, Math.min(5, base + 1.5));
  c.set(x + 1, y, ramp, base);
  c.set(x, y + 1, ramp, base - 0.5);
  c.set(x + 1, y + 1, ramp, Math.max(0, base - 2));
}

/** Grime toward the floor: the bottom `h` rows of the tile darken in dithered steps (`amount` steps at the floor). */
export function grimeFoot(c: PwCanvas, h: number, amount = 1) {
  const y0 = c.h - h;
  for (let y = y0; y < c.h; y++) {
    const t = (y - y0) / Math.max(1, h);
    for (let x = 0; x < c.w; x++) {
      const v = t * amount;
      const whole = Math.floor(v);
      const frac = v - whole;
      c.shift(x, y, -(whole + (bayer(x, y) < frac ? 1 : 0)));
    }
  }
}

/** Short dark scuff dashes (shoes, trolleys) in a band. */
export function scuffs(c: PwCanvas, rng: PwRng, x: number, y: number, w: number, h: number, n: number, dt = -1) {
  for (let i = 0; i < n; i++) {
    const sx = rng.int(x, x + w - 1);
    const sy = rng.int(y, y + h - 1);
    const len = rng.int(2, 6);
    const dy = rng.chance(0.3) ? rng.int(-1, 1) : 0;
    c.lineShade(sx, sy, sx + len, sy + dy, dt);
  }
}

/**
 * Stencilled letters (spray paint through a stencil): the glyphs with stencil
 * bridges (a gap every few rows), soft overspray texels round them, a run or
 * two dripping from the lowest strokes.
 */
export function stencil(c: PwCanvas, text: string, x: number, y: number, f: PixelFont, ramp: number, o: { scale?: number; tone?: number; overspray?: boolean; runs?: number; rng?: PwRng } = {}) {
  const s = o.scale ?? 1;
  const tmp = new Map<number, number>();
  const W = c.w;
  // Draw into the canvas, then cut bridges: rows where (y - top) % (4s) === 2s lose every other texel.
  const before = new Uint16Array(c.ramp);
  const beforeT = new Float32Array(c.tone);
  const beforeF = new Uint8Array(c.flag);
  const width = drawText(c, text, x, y, f, ramp, o.tone ?? 3, { scale: s });
  const hgt = f.h * s;
  for (let yy = y; yy < y + hgt; yy++) {
    for (let xx = x; xx < x + width; xx++) {
      if (!c.inside(xx, yy)) continue;
      const i = yy * W + xx;
      if (c.ramp[i] !== ramp || before[i] === ramp) continue;
      tmp.set(i, 1);
      // Stencil bridges: a horizontal gap in tall strokes.
      if ((yy - y) % (s * 4) === s * 2 && s >= 2 && (xx - x) % (s * 6) < s) {
        c.ramp[i] = before[i];
        c.tone[i] = beforeT[i];
        c.flag[i] = beforeF[i];
      }
    }
  }
  if (o.overspray !== false) {
    for (const i of tmp.keys()) {
      const xx = i % W;
      const yy = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const j = (yy + dy) * W + xx + dx;
        if (!c.inside(xx + dx, yy + dy) || tmp.has(j) || c.ramp[j] === ramp) continue;
        if (bayer(xx + dx, yy + dy) < 0.22) c.shift(xx + dx, yy + dy, -0.6);
      }
    }
  }
  const rng = o.rng;
  if (rng && o.runs) {
    for (let r = 0; r < o.runs; r++) {
      const rx = x + rng.int(0, Math.max(0, width - 1));
      let ry = y + hgt - 1;
      while (ry > y && c.at(rx, ry) !== ramp) ry--;
      if (c.at(rx, ry) !== ramp) continue;
      const len = rng.int(2, 6);
      for (let j = 1; j <= len; j++) c.set(rx, ry + j, ramp, (o.tone ?? 3) - (j === len ? 1 : 0.5));
    }
  }
  return width;
}

/** Dithered vertical gradient: shift tones by `dt` at the top fading to 0 at `h` rows down (light falloff under a lamp, soot). */
export function fadeBand(c: PwCanvas, x: number, y: number, w: number, h: number, dtTop: number, dtBottom = 0) {
  for (let yy = 0; yy < h; yy++) {
    const v = dtTop + (dtBottom - dtTop) * (yy / Math.max(1, h - 1));
    const whole = Math.trunc(v);
    const frac = Math.abs(v - whole);
    for (let xx = 0; xx < w; xx++) c.shift(x + xx, y + yy, whole + (bayer(x + xx, y + yy) < frac ? Math.sign(v) : 0));
  }
}

/** Glow pixel helper: an unlit texel at a ramp step. */
export function glowAt(c: PwCanvas, x: number, y: number, ramp: number, tone: number) {
  c.set(x, y, ramp, tone, PWF.GLOW);
}

/** A raised rectangular plate (sign blank, panel): filled, lit top / left, dark bottom / right, one step of cast shadow below-right. */
export function plate(c: PwCanvas, x: number, y: number, w: number, h: number, ramp: number, o: { tone?: number; shadow?: boolean; outline?: boolean } = {}) {
  const t = o.tone ?? 3;
  if (o.shadow !== false) {
    c.shade(x + 1, y + h, w, 1, -1);
    c.shade(x + w, y + 1, 1, h, -1);
  }
  c.rect(x, y, w, h, ramp, t);
  c.hline(x, y, w, ramp, Math.min(5, t + 1));
  c.vline(x, y, h, ramp, Math.min(5, t + 1));
  c.hline(x, y + h - 1, w, ramp, Math.max(0, t - 1));
  c.vline(x + w - 1, y, h, ramp, Math.max(0, t - 1));
  if (o.outline) {
    c.set(x, y, ramp, Math.max(0, t - 1));
    c.set(x + w - 1, y + h - 1, ramp, 0);
  }
}

/** Little paper notice: off-white sheet, text lines, tape / pin at the top, a curled corner. */
export function notice(c: PwCanvas, rng: PwRng, k: PwKit, x: number, y: number, w: number, h: number, o: { paper?: number; ink?: number; tape?: boolean } = {}) {
  const p = k.ramp(o.paper ?? 0xe0dccc, { light: 0.3, sat: 0.6 });
  const ink = k.ramp(o.ink ?? 0x2a2a34, { light: 0.4 });
  c.shade(x + 1, y + h, w, 1, -1);
  c.shade(x + w, y + 1, 1, h, -1);
  c.rect(x, y, w, h, p, 3);
  c.hline(x, y, w, p, 4);
  for (let ly = y + 2; ly < y + h - 1; ly += 2) {
    const lw = rng.int(Math.max(1, w - 6), w - 2);
    c.hline(x + 1, ly, lw, ink, ly === y + 2 ? 1 : 2);
  }
  // Curled lower-right corner.
  c.set(x + w - 1, y + h - 1, p, 1);
  c.set(x + w - 2, y + h - 1, p, 4);
  if (o.tape !== false) {
    const t = k.ramp(0xc8b878, { light: 0.3 });
    c.hline(x + (w >> 1) - 1, y - 1, 3, t, 3);
  }
}
