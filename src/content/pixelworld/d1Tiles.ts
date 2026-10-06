import { bayer, PWF, PwRng, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD } from './font';
import { darken, hash2, shiftHue, smooth } from './surfaces';

/**
 * JUNGLE RUN (d1) painters for ART: PIXEL WORLD — the park's own hand-made
 * surfaces and modules, painted the way 90s arcade background artists painted
 * a jungle park (Metal Slug log forts, Beast Busters gates, Doom bark walls):
 *  - timber: round bark logs with wandering fissures and lichen, axe-hewn
 *    points, sawn / broken ends with growth rings, iron bands with rivets;
 *  - the park gate as painted modules: a sharpened-log palisade (cut out above
 *    the points), the braced plank doors, the carved PRIMAL ISLAND sign with
 *    the park emblem, cloth flags with a ragged fly;
 *  - every tile in ramp space (`k.ramp`), light from the upper left, texture
 *    as hand-placed clusters — never per-texel noise.
 * Sizes are multiples of 16 for wrap tiles; modules are sized to the metres
 * they show (32 texels a metre).
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** The park emblem colours (gate sign, flags, the tour car, the jeep). */
export const D1_EMBLEM = { red: 0xe0401a, gold: 0xf4c43a, ink: 0x1a1210 } as const;

// ─── Timber ──────────────────────────────────────────────────────────────────

/**
 * Bark of a round log, grain running along v (the log's length): ridges 4–8
 * texels wide split by wandering dark fissures (lit left lip, shaded right
 * side), cross-checks, a knot or two and grey-green lichen. 64 × 64 wrap.
 * `moss` adds clumps creeping up from one edge (the log's foot / top side).
 */
export function d1BarkTile(atlas: PwAtlas, o: { hex: number; lichen?: number; moss?: number }): PwTile {
  return atlas.tile(`d1bark|${h6(o.hex)}|${o.lichen !== undefined ? h6(o.lichen) : ''}|${o.moss !== undefined ? h6(o.moss) : ''}`, 64, 64, (c, k) => paintBark(c, k, o), { wrap: true });
}

export function paintBark(c: PwCanvas, k: PwKit, o: { hex: number; lichen?: number; moss?: number }) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const b = k.ramp(o.hex, { light: 0.42, sat: 0.95 });
  const b2 = k.ramp(shiftHue(darken(o.hex, 0.86), -0.01, 0.95), { light: 0.4, sat: 0.95 });
  // Fissures: columns that wander (sine periods dividing the tile: seamless along v).
  const n = 9;
  const fx: number[] = [];
  const amp: number[] = [];
  const ph: number[] = [];
  const per: number[] = [];
  for (let i = 0; i < n; i++) {
    fx.push((i + rng.range(-0.25, 0.25)) * (W / n));
    amp.push(rng.range(0.6, 2.2));
    ph.push(rng.next() * Math.PI * 2);
    per.push(rng.pick([1, 2, 3]));
  }
  const ridgeRamp: number[] = [];
  for (let i = 0; i < n; i++) ridgeRamp.push(hash2(i, 3, 7) > 0.7 ? b2 : b);
  const pos = new Float32Array(n);
  const ord = new Int8Array(n);
  for (let y = 0; y < H; y++) {
    for (let i = 0; i < n; i++) {
      pos[i] = wrap(fx[i] + Math.sin((y / H) * Math.PI * 2 * per[i] + ph[i]) * amp[i], W);
      ord[i] = i;
    }
    // Fissures in order across the row (insertion sort: n is tiny).
    for (let i = 1; i < n; i++) {
      const v = ord[i];
      let j = i - 1;
      while (j >= 0 && pos[ord[j]] > pos[v]) {
        ord[j + 1] = ord[j];
        j--;
      }
      ord[j + 1] = v;
    }
    let k = n - 1; // the ridge left of x = 0 starts at the last fissure (wrapping)
    let next = 0;
    for (let x = 0; x < W; x++) {
      while (next < n && pos[ord[next]] <= x) k = next++;
      const i = ord[k];
      const nx = ord[(k + 1) % n];
      const left = wrap(x - pos[i], W);
      const width = wrap(pos[nx] - pos[i], W) || W;
      let t = 3;
      if (left < 1) t = 0.6; // the fissure
      else if (left < 2) t = 4; // lit lip
      else if (left > width - 2) t = 2; // shaded far side
      if (t === 3 && hash2(x >> 1, y >> 2, 11) > 0.9) t = 2;
      c.set(x, y, ridgeRamp[i], t);
    }
  }
  // Cross-checks: short dark breaks across a ridge with a lit texel under them.
  for (let i = 0; i < 16; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    const len = rng.int(2, 4);
    for (let j = 0; j < len; j++) {
      c.shift(wrap(x + j, W), y, -1.5);
      c.shift(wrap(x + j, W), wrap(y + 1, H), 0.8);
    }
  }
  // Knots: a dark eye with a lit rim above-left.
  for (let i = 0; i < 2; i++) {
    const x = rng.int(4, W - 5);
    const y = rng.int(6, H - 7);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const d = (dx * dx) / 4 + (dy * dy) / 9;
        if (d > 1) continue;
        c.set(wrap(x + dx, W), wrap(y + dy, H), b2, d < 0.3 ? 0.5 : d < 0.65 ? 1.5 : dx + dy < 0 ? 4 : 2);
      }
    }
  }
  if (o.lichen !== undefined) {
    const li = k.ramp(o.lichen, { light: 0.45, sat: 0.7 });
    for (let i = 0; i < 14; i++) {
      const x = rng.int(0, W - 1);
      const y = rng.int(0, H - 1);
      const s = rng.int(0, 9);
      c.cluster(x, y, s, li, hash2(x, y, 3) > 0.5 ? 4 : 3);
      if (rng.chance(0.5)) c.cluster(wrap(x + 2, W), wrap(y + 1, H), s + 1, li, 2);
    }
  }
  if (o.moss !== undefined) {
    // Moss creeping up the lower third of the tile, clumped, lit on top.
    const m = k.ramp(o.moss, { light: 0.45, sat: 1.05 });
    for (let x = 0; x < W; x++) {
      const top = Math.round(H - 10 - smooth(x, 0, W, 8, 6, 17) * 18);
      for (let y = top; y < H; y++) {
        if (y === top && hash2(x, y, 5) > 0.6) continue;
        c.set(x, y, m, y === top ? 4 : y < top + 2 ? 3.4 : hash2(x, y, 9) > 0.8 ? 2 : 3);
      }
    }
  }
}

/** Axe-hewn wood (sharpened log points, chopped faces): pale facets in bands, grain lines, a split. 32 × 32 wrap. */
export function d1HewnTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d1hewn|${h6(o.hex)}`, 32, 32, (c, k) => {
    const w = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        // Facets: diagonal bands, each a flat tone (the axe strokes).
        const f = Math.floor((x + y * 0.6) / 8);
        let t = [3, 4, 3, 2][f & 3];
        if ((x + Math.round(y * 0.6)) % 8 === 0) t = 2; // facet edge
        if (hash2(x >> 2, y, 3) > 0.92) t -= 1; // grain
        c.set(x, y, w, t);
      }
    }
    c.scatter(k.rng, 0, 0, 32, 32, 6, 0, -1, { shapes: 3 });
  }, { wrap: true });
}

/** Sawn / broken log end (module, a disc): growth rings, checks radiating from the pith, a bark rim, splinters. */
export function d1LogEndModule(atlas: PwAtlas, o: { wood: number; bark: number; broken?: boolean }): PwTile {
  const S = 64;
  return atlas.tile(`d1logend|${h6(o.wood)}|${h6(o.bark)}|${o.broken ? 1 : 0}`, S, S, (c, k) => {
    const rng = k.rng;
    const w = k.ramp(o.wood, { light: 0.42 });
    const bk = k.ramp(o.bark, { light: 0.4 });
    const cx = S / 2 - 0.5;
    const cy = S / 2 - 0.5;
    const R = S / 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.hypot(dx, dy) + Math.sin(Math.atan2(dy, dx) * 3) * 0.8;
        if (r > R) {
          c.set(x, y, bk, 1);
          continue;
        }
        if (r > R - 3) {
          c.set(x, y, bk, dx + dy < 0 ? 3 : 2);
          continue;
        }
        // Rings: alternating early / late wood, the face lit from the upper left.
        const ring = Math.floor(r / 2.6);
        let t = ring % 2 ? 3 : 4;
        if (r > R - 6) t = 2.6; // sapwood darker under the bark
        if (dx + dy > 18) t -= 0.6;
        if (r < 2) t = 1.5;
        c.set(x, y, w, t);
      }
    }
    // Radial checks (dry cracks) from the pith; a broken end gets a jagged splintered band.
    for (let i = 0; i < (o.broken ? 7 : 4); i++) {
      const a = rng.next() * Math.PI * 2;
      const len = rng.range(R * 0.4, R * 0.85);
      for (let s = 2; s < len; s++) {
        const x = Math.round(cx + Math.cos(a) * s);
        const y = Math.round(cy + Math.sin(a) * s);
        c.set(x, y, w, 0.5);
        if (s > len * 0.5) c.set(x + 1, y + 1, w, 4.6);
      }
    }
    if (o.broken) {
      for (let i = 0; i < 40; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(4, R - 4);
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r);
        // Splinter: a short stroke along a ring, lit on top, dark under.
        const tx = -Math.sin(a);
        const ty = Math.cos(a);
        for (let j = 0; j < 4; j++) c.set(Math.round(x + tx * j), Math.round(y + ty * j), w, 5);
        for (let j = 0; j < 4; j++) c.set(Math.round(x + tx * j + 1), Math.round(y + ty * j + 1), w, 1);
      }
    }
  });
}

/** Black iron band / plate: hammered faces, two rows of rivets, rust runs. 32 × 32 wrap. */
export function d1IronTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d1iron|${h6(o.hex)}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const r = k.ramp(o.hex, { light: 0.5, sat: 0.7 });
    const rust = k.ramp(0x7a3a1c, { light: 0.42 });
    c.rect(0, 0, 32, 32, r, (x, y) => (smooth(x, y, 32, 32, 4, 3) < 0.35 ? 2 : 3));
    for (const y of [3, 27]) {
      for (let x = 2; x < 32; x += 8) {
        c.set(x, y, r, 5);
        c.set(x + 1, y, r, 3);
        c.set(x, y + 1, r, 2);
        c.set(x + 1, y + 1, r, 1);
      }
    }
    c.hline(0, 0, 32, r, 4);
    c.hline(0, 31, 32, r, 1);
    for (let i = 0; i < 4; i++) {
      const x = rng.int(0, 31);
      const y = rng.int(4, 20);
      const len = rng.int(4, 12);
      for (let j = 0; j < len; j++) if (bayer(x, y + j) > j / len - 0.2) c.tint(x, Math.min(31, y + j), rust, 0);
    }
    c.scatter(rng, 0, 0, 32, 32, 10, 0, 1, { shapes: 2 });
  }, { wrap: true });
}

// ─── The park gate ──────────────────────────────────────────────────────────

/**
 * Palisade of sharpened logs (wrap across, cut out above the points): three
 * logs every 2 m, each shaded as a cylinder (lit left column, shaded right)
 * with bark fissures, an axe-hewn pale point, two lashing ropes, a plank
 * rail nailed across, moss and a damp, grassy foot. 64 × 224 (2 × 7 m).
 */
export function d1PalisadeTile(atlas: PwAtlas, o: { log: number; logDark: number; hewn: number; rail: number; rope: number; moss: number; grass: number }): PwTile {
  return atlas.tile(`d1palisade|${h6(o.log)}|${h6(o.logDark)}|${h6(o.rail)}`, 64, 224, (c, k) => {
    const rng = k.rng;
    const H = c.h;
    const logs = [k.ramp(o.log, { light: 0.42, sat: 0.95 }), k.ramp(o.logDark, { light: 0.45, sat: 0.95 })];
    const hewn = k.ramp(o.hewn, { light: 0.4 });
    const rail = k.ramp(o.rail, { light: 0.42 });
    const rope = k.ramp(o.rope, { light: 0.42, sat: 0.8 });
    const moss = k.ramp(o.moss, { light: 0.45, sat: 1.05 });
    const grass = k.ramp(o.grass, { light: 0.45, sat: 1.05 });
    const widths = [21, 22, 21];
    let x0 = 0;
    const railRows: [number, number][] = [[H - 128, 10], [H - 52, 10]];
    for (let i = 0; i < 3; i++) {
      const w = widths[i];
      const lr = logs[(i + (hash2(i, 1, 3) > 0.5 ? 1 : 0)) % 2];
      // Log height (from the foot) and its point.
      const hM = 5.3 + hash2(i, 2, 5) * 0.8;
      const top = H - Math.round(hM * 32);
      const tipH = 20 + Math.floor(hash2(i, 3, 5) * 6);
      const tipOff = Math.round((hash2(i, 4, 5) - 0.5) * 4);
      for (let y = Math.max(0, top - tipH); y < H; y++) {
        for (let dx = 0; dx < w; dx++) {
          const x = x0 + dx;
          const u = (dx + 0.5) / w; // 0…1 across the log
          if (y < top) {
            // Point: a triangle, left facet lit, right facet shaded.
            const k2 = (top - y) / tipH; // 0 at the base of the point, 1 at the tip
            const half = (w / 2) * (1 - k2);
            const cx = w / 2 + tipOff * k2;
            if (Math.abs(dx + 0.5 - cx) > half) continue;
            const left = dx + 0.5 < cx;
            c.set(x, y, hewn, left ? (k2 > 0.7 ? 4.6 : 4) : 2.4);
            continue;
          }
          // Cylinder bands: lit column left of centre, shaded right, outline at the far edge.
          let t = u < 0.12 ? 3 : u < 0.4 ? 4 : u < 0.72 ? 3 : u < 0.92 ? 2 : 1;
          // Bark fissures: wandering vertical lines.
          const f = Math.sin(dx * 1.7 + i * 3 + Math.sin(y * 0.05 + i) * 1.4);
          if (f > 0.93 && u > 0.08 && u < 0.92) t -= 1.3;
          if (hash2(x >> 1, y >> 2, 9) > 0.93) t -= 0.8;
          c.set(x, y, lr, t);
        }
      }
      // The bark ends in a ragged ring under the hewn point.
      for (let dx = 1; dx < w - 1; dx++) if (hash2(x0 + dx, 1, 7) > 0.4) c.set(x0 + dx, top, lr, 1);
      // Lashing ropes (twisted: diagonal light / dark), sagging between logs.
      for (const ry of [top + 14, H - 92]) {
        for (let dx = 0; dx < w; dx++) {
          const sag = Math.round(Math.sin((dx / w) * Math.PI) * 1.2);
          for (let j = 0; j < 3; j++) c.set(x0 + dx, ry + j + sag, rope, (dx + j) % 3 === 0 ? 2 : j === 0 ? 4 : 3);
        }
      }
      // Moss on the log's upper body (one or two clumps).
      if (hash2(i, 9, 3) > 0.35) {
        const my = top + 30 + Math.floor(hash2(i, 10, 3) * 60);
        for (let j = 0; j < 22; j++) {
          const mx = x0 + 2 + Math.floor(hash2(i, j, 21) * (w * 0.5));
          const yy = my + Math.floor(hash2(i, j, 22) * 14);
          c.cluster(mx, yy, j, moss, j % 3 === 0 ? 4 : 3);
        }
      }
      x0 += w;
    }
    // The plank rails nailed across (shadow under them on the logs).
    for (const [ry, rh] of railRows) {
      c.shade(0, ry + rh, 64, 2, -1.2);
      for (let y = ry; y < ry + rh; y++) {
        for (let x = 0; x < 64; x++) {
          let t = y === ry ? 4 : y === ry + rh - 1 ? 1.5 : 3;
          if (Math.abs(Math.sin(x * 0.11 + y * 0.9)) < 0.05) t = 2;
          c.set(x, y, rail, t);
        }
      }
      for (const nx of [10, 32, 53]) {
        c.set(nx, ry + 3, rail, 0.5);
        c.set(nx, ry + rh - 4, rail, 0.5);
      }
    }
    // Damp foot: darker band, splash-back of earth, grass tufts in front.
    c.shade(0, H - 20, 64, 20, (x, y) => (y > H - 12 ? -1.2 : bayer(x, y) < 0.5 ? -1 : 0));
    for (let i = 0; i < 26; i++) {
      const x = rng.int(0, 63);
      const len = rng.int(4, 11);
      for (let j = 0; j < len; j++) {
        const lean = Math.round((j / len) * (rng.chance(0.5) ? 2 : -2));
        c.set(wrap(x + lean, 64), H - 1 - j, grass, j === len - 1 ? 4.5 : j < 2 ? 2 : 3.2);
      }
    }
    // Gaps between logs: the dark of the wall's back.
    for (const gx of [0, 21, 43]) for (let y = 0; y < H; y++) if (c.at(gx, y)) c.shift(gx, y, -1);
  }, { wrap: true });
}

/**
 * One leaf of the park gate (module, cut out round the boards' points): eight
 * vertical boards with sharpened tops, three cross braces and a diagonal brace
 * (lit top edges, a cast shadow under each), iron strap hinges with bolt heads
 * on the hinge side (left), weathering at the foot. 136 × 256 (4.25 × 8 m).
 */
export function d1GateDoorModule(atlas: PwAtlas, o: { wood: number; woodDark: number; iron: number }): PwTile {
  const W = 136;
  const H = 256;
  return atlas.tile(`d1gatedoor|${h6(o.wood)}|${h6(o.woodDark)}|${h6(o.iron)}`, W, H, (c, k) => {
    const rng = k.rng;
    const wd = k.ramp(o.wood, { light: 0.42, sat: 0.95 });
    const wdD = k.ramp(o.woodDark, { light: 0.42, sat: 0.95 });
    const ir = k.ramp(o.iron, { light: 0.5, sat: 0.7 });
    const BW = 17;
    // Boards (y from the top; the foot at H - 5 = 0.15 m up).
    const foot = H - 5;
    for (let i = 0; i < 8; i++) {
      const x0 = i * BW;
      const hM = 7.2 + (i % 2) * 0.25;
      const top = foot - Math.round(hM * 32);
      const tip = 14;
      const r = i % 3 === 1 ? wdD : wd;
      for (let y = Math.max(0, top - tip); y < foot; y++) {
        for (let dx = 0; dx < BW - 1; dx++) {
          if (y < top) {
            const k2 = (top - y) / tip;
            const half = ((BW - 1) / 2) * (1 - k2);
            if (Math.abs(dx + 0.5 - (BW - 1) / 2) > half) continue;
            c.set(x0 + dx, y, r, dx < (BW - 1) / 2 ? 4 : 2);
            continue;
          }
          let t = dx === 0 ? 4 : dx === BW - 2 ? 2 : 3;
          // Grain: long wavy lines, a knot now and then.
          if (dx > 0 && dx < BW - 2 && Math.abs(Math.sin((y + i * 41) * 0.045 + dx * 0.9)) < 0.07) t = 2;
          if (hash2(x0 + dx, y >> 3, 13) > 0.97) t = 1.5;
          c.set(x0 + dx, y, r, t);
        }
        // The dark gap between boards.
        if (y >= top) c.set(x0 + BW - 1, y, wdD, 0.5);
      }
    }
    // Braces: three horizontal (0.4 m) and a diagonal, nailed on the face.
    const brace = (y0: number) => {
      c.shade(0, y0 + 13, W, 3, -1.4);
      for (let y = y0; y < y0 + 13; y++) for (let x = 0; x < W - 2; x++) c.set(x, y, wdD, y === y0 ? 4 : y === y0 + 12 ? 1.5 : Math.abs(Math.sin(x * 0.06 + y)) < 0.06 ? 2 : 3);
      for (let x = 6; x < W; x += BW) {
        c.set(x, y0 + 3, ir, 4);
        c.set(x, y0 + 9, ir, 4);
      }
    };
    const yb = [1.3, 3.9, 6.4].map((m) => foot - Math.round(m * 32) - 6);
    // Diagonal brace from the low brace (free side) up to the high brace (hinge side).
    const d0x = W - 12;
    const d0y = yb[0];
    const d1x = 8;
    const d1y = yb[2] + 12;
    for (let s = 0; s <= 1; s += 1 / 260) {
      const x = Math.round(d0x + (d1x - d0x) * s);
      const y = Math.round(d0y + (d1y - d0y) * s);
      for (let j = -5; j <= 5; j++) {
        const yy = y + j;
        c.set(x, yy, wdD, j === -5 ? 4 : j === 5 ? 1.5 : 3);
      }
      c.shift(x + 1, y + 6, -1.2);
    }
    for (const y of yb) brace(y);
    // Strap hinges on the hinge side (left): long iron straps with bolt heads, a pintle knuckle.
    for (const y of [yb[0] + 2, yb[2] + 2]) {
      for (let x = 0; x < 64; x++) {
        const taper = x > 48 ? Math.round((x - 48) / 6) : 0;
        for (let j = taper; j < 9 - taper; j++) c.set(x, y + j, ir, j === taper ? 4 : j === 8 - taper ? 1 : 2.6);
      }
      for (let x = 6; x < 60; x += 10) {
        c.set(x, y + 4, ir, 5);
        c.set(x + 1, y + 5, ir, 0.5);
      }
      c.rect(0, y - 2, 4, 13, ir, 3);
      c.vline(0, y - 2, 13, ir, 4);
    }
    // Weathering: damp, splashed foot; scuffs; a few claw gouges (the animals have tested it).
    c.shade(0, foot - 22, W, 22, (x, y) => (y > foot - 8 ? -1 : bayer(x, y) < 0.5 ? -0.8 : 0));
    for (let i = 0; i < 3; i++) {
      const gx = rng.int(30, W - 40);
      const gy = rng.int(60, 140);
      for (let j = 0; j < 3; j++) {
        for (let s = 0; s < 18; s++) {
          c.shift(gx + j * 4 + Math.round(s * 0.3), gy + s, -1.6);
          c.shift(gx + j * 4 + Math.round(s * 0.3) + 1, gy + s, 1);
        }
      }
    }
    c.scatter(rng, 0, 0, W, H, 60, 0, -1, { shapes: 4 });
  });
}

/**
 * The carved park sign over the gate (module 198 × 61 = 6.2 × 1.9 m): dark
 * plank board in a frame, PRIMAL ◉ ISLAND in gilded raised caps, the park
 * emblem (red disc, gold ring, black horned skull) in the middle, iron corner
 * brackets, sun-bleached top edge and weathering.
 */
export function d1GateSignModule(atlas: PwAtlas, o: { board: number; frame: number; gold: number; iron: number }): PwTile {
  const W = 198;
  const H = 61;
  return atlas.tile(`d1gatesign|${h6(o.board)}|${h6(o.gold)}`, W, H, (c, k) => {
    const rng = k.rng;
    const bd = k.ramp(o.board, { light: 0.42 });
    const fr = k.ramp(o.frame, { light: 0.42 });
    const gold = k.ramp(o.gold, { light: 0.5, sat: 1.05 });
    const ir = k.ramp(o.iron, { light: 0.5, sat: 0.7 });
    // Boards: three horizontal planks with grain.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const py = y % 20;
        let t = py === 0 ? 1 : py === 1 ? 4 : py === 19 ? 2 : 3;
        if (Math.abs(Math.sin(x * 0.05 + y * 1.3 + Math.floor(y / 20) * 2)) < 0.05) t = 2;
        c.set(x, y, bd, t);
      }
    }
    // Frame (raised): lit top / left, shaded bottom / right.
    for (let j = 0; j < 4; j++) {
      c.hline(j, j, W - 2 * j, fr, j === 0 ? 4.4 : 3.6);
      c.vline(j, j, H - 2 * j, fr, j === 0 ? 4 : 3.4);
      c.hline(j, H - 1 - j, W - 2 * j, fr, j === 0 ? 1 : 2.2);
      c.vline(W - 1 - j, j, H - 2 * j, fr, j === 0 ? 1 : 2.2);
    }
    // Emblem in the middle.
    const er = 23;
    d1Emblem(c, k, W / 2, H / 2, er);
    // Lettering: raised gilded caps with a cast shadow, lit tops — the biggest face that fits each side.
    const room = W / 2 - er - 12;
    const word = (text: string, cx: number) => {
      const opts: [typeof FONT_BOLD, number][] = [[FONT_BOLD, 2], [FONT_5x7, 2], [FONT_BOLD, 1]];
      let pick = opts[opts.length - 1];
      for (const o2 of opts) if (measure(text, o2[0], o2[1]) <= room) { pick = o2; break; }
      const [f, scale] = pick;
      const w = measure(text, f, scale);
      const x = Math.round(cx - w / 2);
      const y = Math.round(H / 2 - (f.base * scale) / 2);
      drawText(c, text, x, y, f, gold, 3, { scale, shadow: { ramp: bd, tone: 0.5 }, shadowD: scale, shadeFn: (_u, v) => (v < 0.2 ? 1.4 : v > 0.8 ? -0.8 : 0) });
    };
    word('PRIMAL', (6 + W / 2 - er - 4) / 2);
    word('ISLAND', W - (6 + W / 2 - er - 4) / 2);
    // Iron corner brackets with bolts.
    for (const [x, y, fx, fy] of [[4, 4, 1, 1], [W - 5, 4, -1, 1], [4, H - 5, 1, -1], [W - 5, H - 5, -1, -1]] as [number, number, number, number][]) {
      for (let j = 0; j < 12; j++) {
        c.set(x + j * fx, y, ir, 4);
        c.set(x + j * fx, y + fy, ir, 2);
        c.set(x, y + j * fy, ir, 3);
        c.set(x + fx, y + j * fy, ir, 2);
      }
      c.set(x + 4 * fx, y + fy, ir, 5);
      c.set(x + fx, y + 4 * fy, ir, 5);
    }
    // Weathering: bleached top board, dark drip stains from the brackets, flaked gilt.
    c.shade(4, 4, W - 8, 6, (x, y) => (bayer(x, y) < 0.4 ? 0.6 : 0), bd);
    for (let i = 0; i < 7; i++) c.streak(rng, rng.int(6, W - 6), rng.int(6, 20), rng.int(10, 30), -0.8, bd);
    c.scatter(rng, 4, 4, W - 8, H - 8, 50, 0, -1, { shapes: 3, only: gold });
    c.scatter(rng, 4, 4, W - 8, H - 8, 70, 0, -1, { shapes: 4, only: bd });
  });
}

function measure(text: string, f: typeof FONT_BOLD, scale: number): number {
  let w = 0;
  for (const ch of text) {
    const g = f.glyphs.get(ch);
    let gw = 1;
    if (g) for (const r of g) gw = Math.max(gw, r.lastIndexOf('#') + 1);
    w += (ch === ' ' || !g ? f.space : gw) + f.gap;
  }
  return (w - f.gap) * scale;
}

/**
 * The park emblem at (cx, cy), radius r: a gold ring, a red disc and a black
 * horned skull in profile (snout right) with an eye socket and teeth.
 */
export function d1Emblem(c: PwCanvas, k: PwKit, cx: number, cy: number, r: number) {
  const red = k.ramp(D1_EMBLEM.red, { light: 0.45, sat: 1.05 });
  const gold = k.ramp(D1_EMBLEM.gold, { light: 0.5, sat: 1.05 });
  const ink = k.ramp(D1_EMBLEM.ink, { light: 0.4 });
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const lit = (-dx - dy) / r; // upper left
      if (d > r - Math.max(2, r * 0.16)) c.set(x, y, gold, d > r - 1 ? 1.6 : lit > 0.3 ? 4.6 : lit < -0.4 ? 2 : 3.4);
      else c.set(x, y, red, lit > 0.55 ? 4 : lit < -0.5 ? 2.2 : 3);
    }
  }
  // Skull in profile (snout to the right), normalised to r.
  const s = r / 27;
  const P = (pts: number[]) => pts.map((v, i) => (i % 2 ? cy + v * s : cx + v * s));
  c.poly(P([-17, -6, -10, -13, 2, -14, 12, -9, 19, -6, 21, -1, 19, 3, 8, 4, 6, 9, -2, 10, -8, 7, -14, 3]), ink, 1.2);
  // Horn sweeping up and forward from the brow.
  c.poly(P([-4, -12, 2, -21, 6, -24, 4, -16, 2, -13]), ink, 1.2);
  // Lower jaw.
  c.poly(P([4, 5, 18, 4, 16, 8, 6, 11, 0, 10]), ink, 1.2);
  // Eye socket (red shows through) + nostril, teeth (gold).
  c.ellipse(cx - 4 * s, cy - 6 * s, 3.2 * s, 3 * s, red, 2);
  c.ellipse(cx + 15 * s, cy - 3 * s, 1.2 * s, 1.2 * s, red, 2);
  for (let i = 0; i < 4; i++) {
    const tx = Math.round(cx + (7 + i * 3) * s);
    c.set(tx, Math.round(cy + 4 * s), gold, 4);
    c.set(tx, Math.round(cy + 5 * s), gold, 3);
  }
  // Lit edge on the skull's upper left.
  for (let y = Math.floor(cy - 24 * s); y < cy + 12 * s; y++) {
    for (let x = Math.floor(cx - 18 * s); x < cx + 22 * s; x++) {
      if (c.at(x, y) !== ink) continue;
      if (c.at(x, y - 1) !== ink || c.at(x - 1, y) !== ink) c.set(x, y, ink, 3);
    }
  }
}

/**
 * A park flag (module, cut out): cloth with a ragged, wind-torn fly end, two
 * folds (lit / shaded bands), the emblem near the hoist, a hem along the hoist.
 * 48 × 32 (1.5 × 1 m). The hoist is the left edge.
 */
export function d1FlagModule(atlas: PwAtlas, o: { hex: number; emblem?: boolean }): PwTile {
  return atlas.tile(`d1flag|${h6(o.hex)}|${o.emblem ? 1 : 0}`, 48, 32, (c, k) => {
    const cl = k.ramp(o.hex, { light: 0.45, sat: 1.05 });
    for (let y = 0; y < 32; y++) {
      // Fly end torn into tongues.
      const end = 46 - Math.round(Math.abs(Math.sin(y * 0.55)) * 5 + hash2(1, y >> 1, 5) * 4);
      for (let x = 0; x < end; x++) {
        // Folds: two diagonal waves across the cloth.
        const w = Math.sin((x - y * 0.35) * 0.2);
        let t = w > 0.55 ? 4 : w < -0.55 ? 2 : 3;
        if (x < 3) t = x === 0 ? 4 : 2.5;
        c.set(x, y, cl, t);
      }
    }
    if (o.emblem) {
      d1Emblem(c, k, 17, 16, 10);
      // The fold crosses the emblem too.
      for (let y = 0; y < 32; y++) for (let x = 6; x < 29; x++) if (Math.sin((x - y * 0.35) * 0.2) < -0.6) c.shift(x, y, -0.6);
    }
    c.outline(1);
  });
}

// ─── Ground decals and the road ──────────────────────────────────────────────

/**
 * A ground decal (module, cut out round a ragged organic edge): `kind` =
 * moss (a cushion of moss with lit tufts), litter (fallen leaves and twigs on
 * dark earth), earth (bare trodden ground with pebbles, roots and a few
 * tufts), clover. 96 × 64 (3 × 2 m); laid flat, stretched to the patch.
 */
export function d1PatchDecal(atlas: PwAtlas, kind: 'moss' | 'litter' | 'earth', o: { hex: number; dark: number; accent: number }, variant = 0): PwTile {
  const W = 96;
  const H = 64;
  return atlas.tile(`d1patch|${kind}|${h6(o.hex)}|${variant}`, W, H, (c, k) => {
    const rng = k.rng;
    const base = k.ramp(o.hex, { light: 0.42, sat: 1.0 });
    const dark = k.ramp(o.dark, { light: 0.4 });
    const acc = k.ramp(o.accent, { light: 0.45, sat: 1.05 });
    const seed = variant * 31 + (kind === 'moss' ? 1 : kind === 'litter' ? 2 : 3);
    // Ragged blob: an ellipse whose rim wanders (lobes), with a dithered fringe.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - W / 2) / (W / 2);
        const v = (y + 0.5 - H / 2) / (H / 2);
        const a = Math.atan2(v, u);
        const rim = 0.78 + Math.sin(a * 3 + seed) * 0.09 + Math.sin(a * 7 + seed * 2) * 0.06 + (smooth(x, y, W, H, 8, seed) - 0.5) * 0.2;
        const d = Math.hypot(u, v);
        if (d > rim) continue;
        if (d > rim - 0.08 && bayer(x, y) < (d - rim + 0.08) / 0.08) continue;
        let t = 3;
        const n = smooth(x, y, W, H, 6, seed + 5);
        if (n < 0.3) t = 2;
        else if (n > 0.72) t = 4;
        c.set(x, y, base, t);
      }
    }
    if (kind === 'moss') {
      // Cushions: lit domes with dark seams between them.
      for (let i = 0; i < 70; i++) {
        const x = rng.int(4, W - 5);
        const y = rng.int(3, H - 4);
        if (!c.at(x, y)) continue;
        const r = rng.int(2, 4);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && c.at(x + dx, y + dy)) c.set(x + dx, y + dy, base, dx + dy < -1 ? 4 : dx + dy > 1 ? 2.4 : 3.3);
      }
      for (let i = 0; i < 40; i++) {
        const x = rng.int(0, W - 1);
        const y = rng.int(0, H - 1);
        if (c.at(x, y)) c.cluster(x, y, i, acc, 4.3);
      }
    } else if (kind === 'litter') {
      // Leaves: little lens shapes in warm browns / greens, lit top edge; twigs as dark lines.
      for (let i = 0; i < 120; i++) {
        const x = rng.int(2, W - 3);
        const y = rng.int(2, H - 3);
        if (!c.at(x, y)) continue;
        const r = rng.chance(0.5) ? acc : base;
        const horiz = rng.chance(0.5);
        const len = rng.int(2, 4);
        for (let j = 0; j < len; j++) {
          c.set(horiz ? x + j : x, horiz ? y : y + j, r, j === 0 ? 4.4 : 3.3);
          c.set(horiz ? x + j : x + 1, horiz ? y + 1 : y + j, r, 2);
        }
      }
      for (let i = 0; i < 6; i++) {
        let x = rng.int(10, W - 10);
        let y = rng.int(8, H - 8);
        const dx = rng.spread(1);
        const dy = rng.spread(0.5);
        for (let j = 0; j < rng.int(6, 14); j++) {
          if (c.at(Math.round(x), Math.round(y))) c.set(Math.round(x), Math.round(y), dark, 1);
          x += dx + rng.spread(0.3);
          y += dy + rng.spread(0.3);
        }
      }
    } else {
      // Bare earth: pebbles (lit top-left), cracks, a root, grass tufts at the rim.
      for (let i = 0; i < 40; i++) {
        const x = rng.int(3, W - 4);
        const y = rng.int(3, H - 4);
        if (!c.at(x, y)) continue;
        c.set(x, y, dark, 4.4);
        c.set(x + 1, y, dark, 3.4);
        c.set(x + 1, y + 1, dark, 1.6);
      }
      for (let i = 0; i < 26; i++) {
        const a = rng.next() * Math.PI * 2;
        const x = Math.round(W / 2 + Math.cos(a) * W * 0.36);
        const y = Math.round(H / 2 + Math.sin(a) * H * 0.34);
        const len = rng.int(2, 4);
        for (let j = 0; j < len; j++) if (c.at(x, y - j) || j > 0) c.set(x + (j === len - 1 ? 1 : 0), y - j, acc, j === len - 1 ? 4.3 : 3);
      }
    }
  });
}

/**
 * A rain puddle in a rut (module, cut out): a muddy rim (dark wet earth, a lit
 * lip), the water mirroring the sky (pale, with a darker reflected treeline
 * band) and a couple of ripple rings. 64 × 40.
 */
export function d1PuddleDecal(atlas: PwAtlas, o: { mud: number; sky: number; tree: number }, variant = 0): PwTile {
  const W = 64;
  const H = 40;
  return atlas.tile(`d1puddle|${h6(o.mud)}|${variant}`, W, H, (c, k) => {
    const rng = k.rng;
    const mud = k.ramp(o.mud, { light: 0.4 });
    const sky = k.ramp(o.sky, { light: 0.4, sat: 0.9 });
    const tree = k.ramp(o.tree, { light: 0.4 });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - W / 2) / (W / 2);
        const v = (y + 0.5 - H / 2) / (H / 2);
        const a = Math.atan2(v, u);
        const rim = 0.86 + Math.sin(a * 2 + variant * 2) * 0.08 + Math.sin(a * 5 + variant) * 0.05;
        const d = Math.hypot(u, v);
        if (d > rim) continue;
        if (d > rim - 0.16) {
          if (d > rim - 0.06 && bayer(x, y) < 0.5) continue;
          c.set(x, y, mud, v < 0 ? 1.6 : 3.6); // far rim in shadow, near lip lit
          continue;
        }
        // Reflection: far half = the trees (dark band), near half = sky (pale, brighter toward us).
        const t = v < -0.35 ? 2 : v < -0.2 ? (bayer(x, y) < 0.5 ? 2 : 3) : v < 0.4 ? 3 : 4;
        c.set(x, y, v < -0.2 ? tree : sky, t);
      }
    }
    // Ripples: two thin pale ellipse arcs.
    for (let i = 0; i < 2; i++) {
      const cx = W / 2 + rng.spread(10);
      const cy = H / 2 + rng.spread(4);
      const rx = rng.range(5, 9);
      for (let a = 0; a < Math.PI * 2; a += 0.12) {
        const x = Math.round(cx + Math.cos(a) * rx);
        const y = Math.round(cy + Math.sin(a) * rx * 0.45);
        if (c.at(x, y) === sky || c.at(x, y) === tree) c.set(x, y, sky, Math.sin(a) < 0 ? 5 : 4);
      }
    }
  });
}

/** Tiny caps text helper for small plates. */
export function tinyText(c: PwCanvas, text: string, x: number, y: number, ramp: number, tone: number) {
  return drawText(c, text, x, y, FONT_3x5, ramp, tone);
}

export { FONT_5x7, PWF, PwRng };
