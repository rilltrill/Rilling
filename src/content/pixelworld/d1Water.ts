import { bayer, PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';

/**
 * JUNGLE RUN (d1) water for ART: PIXEL WORLD, painted as animated strips
 * (`pwMaterial(atlas, { anim: { frames: D1_WATER_FRAMES, fps } })`: every
 * tile drawn with that material is D1_WATER_FRAMES frames stacked vertically,
 * frame 0 at the bottom). Like SNES / arcade water: a calm teal body, broad
 * darker troughs, short lit ripple dashes (a dark dash under each crest), sun
 * glints — two layers drifting at different speeds so it shimmers instead of
 * sliding. Plus the bank (static), the white-water edge, the waterfall sheet
 * and the churning splash at its foot.
 */

/** Frames of every d1 animated water tile (one material plays them all). */
export const D1_WATER_FRAMES = 8;

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Paint `frames` frames of a pattern `p(c, x, vt, f, y)` (vt = texture row within the frame, 0 = its bottom). */
function frames(c: PwCanvas, F: number, paint: (x: number, vt: number, f: number, y: number) => void) {
  const FH = c.h / F;
  for (let f = 0; f < F; f++) {
    const y0 = c.h - (f + 1) * FH;
    for (let yl = 0; yl < FH; yl++) {
      const vt = FH - 1 - yl;
      for (let x = 0; x < c.w; x++) paint(x, vt, f, y0 + yl);
    }
  }
}

/**
 * River surface (wrap 64 × 64 a frame: 2 × 2 m; v = downstream). Ripple
 * dashes ride the current 8 texels a frame, the trough pattern 4 a frame.
 */
export function d1WaterTile(atlas: PwAtlas, o: { hex: number; deep: number }): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1water|${h6(o.hex)}|${h6(o.deep)}|${F}`, 64, 64 * F, (c, k) => {
    const w = k.ramp(o.hex, { light: 0.55, sat: 1.05 });
    const d = k.ramp(o.deep, { light: 0.45, sat: 1.05 });
    const FH = 64;
    // Precomputed ripple field (one frame's worth, rows wrap): crest dashes along u.
    const TW = 64;
    const crest = new Uint8Array(TW * FH);
    for (let i = 0; i < 55; i++) {
      const x = Math.floor(hash2(i, 1, 3) * TW);
      const y = Math.floor(hash2(i, 2, 3) * FH);
      const len = 2 + Math.floor(hash2(i, 3, 3) * 6);
      for (let j = 0; j < len; j++) {
        crest[y * TW + ((x + j) & (TW - 1))] = j === 0 || j === len - 1 ? 1 : 2;
        crest[((y + 1) % FH) * TW + ((x + j) & (TW - 1))] = 3; // the dark trough under the crest
      }
    }
    const glint = new Uint8Array(TW * FH);
    for (let i = 0; i < 7; i++) glint[Math.floor(hash2(i, 5, 3) * FH) * TW + Math.floor(hash2(i, 6, 3) * TW)] = 1;
    frames(c, F, (x, vt, f, y) => {
      // Troughs: broad darker bands across the flow (period 32 rows, 4 a frame), dithered edges.
      const v2 = wrap(vt - f * 4, 32);
      const n = smooth(x, v2, TW, 32, 2, 7);
      let t = 3;
      let r = w;
      if (n < 0.34) {
        r = d;
        t = n < 0.24 ? 3 : bayer(x, v2) < (0.34 - n) * 10 ? 3 : 3.4;
        if (t === 3.4) r = w;
      }
      // Ripples: 8 texels a frame — a lit crest dash over a dark trough dash.
      const v1 = wrap(vt - f * 8, FH);
      const cr = crest[(FH - 1 - v1) * TW + x];
      if (cr === 1) t = 3.8;
      else if (cr === 2) t = 4.4;
      else if (cr === 3) t = 2;
      if (glint[(FH - 1 - v1) * TW + x] && (f + x) % 3 !== 0) {
        r = w;
        t = 5;
      }
      c.set(x, y, r, t);
    });
  }, { wrap: true });
}

/** Rivers drawn with `d1RiverTile` span this many texels across (density 16: 13 m). */
export const D1_RIVER_TW = 208;

/**
 * The whole river at once (wrap 208 × 32 a frame at 16 texels a metre: one
 * tile spans the 12.4 m channel, so it can be painted ACROSS the river; v =
 * downstream, `span` = texels of it the ribbon uses). Murky jungle water:
 * olive shallows over still pebbles at both banks, a broken dark band where
 * the bank's trees reflect (cut by ripple lines), a teal body with pale sky
 * patches, a darker channel down the middle; long thin current streaks in two
 * tones riding the flow (8 texels a frame), the reflections and ripples at
 * half that (a shimmer, not a slide), and sun glints as small unlit clusters
 * that blink frame to frame (the atlas keeps glow at distance, so the far
 * river still sparkles). Zone edges wander with the flow — never a ruled line.
 */
export function d1RiverTile(atlas: PwAtlas, o: { body: number; deep: number; shallow: number; refl: number; sky: number; span: number }): PwTile {
  const F = D1_WATER_FRAMES;
  const W = D1_RIVER_TW;
  const FH = 32;
  return atlas.tile(`d1river|${h6(o.body)}|${h6(o.deep)}|${h6(o.shallow)}|${h6(o.refl)}|${o.span}|${F}`, W, FH * F, (c, k) => {
    const body = k.ramp(o.body, { light: 0.5, sat: 1 });
    const deep = k.ramp(o.deep, { light: 0.45, sat: 1 });
    const shal = k.ramp(o.shallow, { light: 0.45, sat: 1 });
    const refl = k.ramp(o.refl, { light: 0.45, sat: 1 });
    const sky = k.ramp(o.sky, { light: 0.4, sat: 0.9 });
    const glint = k.ramp(0xf0fae8, { light: 0.4, sat: 0.6 });
    const S = o.span;
    // Per flowing row (one period of 64): where the zones end on each side (texels from the bank).
    const shL = new Float32Array(FH);
    const shR = new Float32Array(FH);
    const rfL = new Float32Array(FH);
    const rfR = new Float32Array(FH);
    const chL = new Float32Array(FH);
    const chR = new Float32Array(FH);
    for (let v = 0; v < FH; v++) {
      const a = (v / FH) * Math.PI * 2;
      shL[v] = 13 + Math.sin(a * 2 + 1) * 3 + Math.sin(a * 5) * 1.2;
      shR[v] = 13 + Math.sin(a * 3 + 4) * 3 + Math.sin(a * 7 + 2) * 1.2;
      rfL[v] = shL[v] + 12 + Math.sin(a * 4 + 2) * 6 + (hash2(v >> 2, 1, 5) - 0.5) * 6;
      rfR[v] = shR[v] + 12 + Math.sin(a * 3 + 5) * 6 + (hash2(v >> 2, 2, 5) - 0.5) * 6;
      chL[v] = S * 0.4 + Math.sin(a * 2 + 3) * 5;
      chR[v] = S * 0.6 + Math.sin(a * 2 + 0.6) * 5;
    }
    // Current streaks (one period): 1 = a lit streak, 2 = a dark one; ripple dashes 3 (crest) / 4 (trough).
    const st = new Uint8Array(W * FH);
    for (let i = 0; i < 50; i++) {
      const x = Math.floor(16 + hash2(i, 1, 13) * (S - 32));
      const y = Math.floor(hash2(i, 2, 13) * FH);
      const len = 5 + Math.floor(hash2(i, 3, 13) * 14);
      const kind = hash2(i, 4, 13) > 0.45 ? 1 : 2;
      for (let j = 0; j < len; j++) st[((y + j) % FH) * W + x + (j > len * 0.6 && i % 3 === 0 ? 1 : 0)] = kind;
    }
    const rp = new Uint8Array(W * FH);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(8 + hash2(i, 5, 13) * (S - 16));
      const y = Math.floor(hash2(i, 6, 13) * FH);
      const len = 2 + Math.floor(hash2(i, 7, 13) * 5);
      for (let j = 0; j < len; j++) {
        rp[y * W + x + j] = 3;
        rp[((y + 1) % FH) * W + x + j] = 4;
      }
    }
    // Still pebbles in the shallows (they do not flow).
    const peb = new Uint8Array(W * FH);
    for (let i = 0; i < 40; i++) {
      const side = i & 1;
      const d = 1 + Math.floor(hash2(i, 8, 13) * 12);
      const x = side ? S - 1 - d : d;
      const y = Math.floor(hash2(i, 9, 13) * FH);
      peb[y * W + x] = 1;
      peb[y * W + Math.min(W - 1, x + 1)] = 2;
    }
    // Pale sky caught on the swell: short horizontal wisps (the slow layer).
    const skyM = new Uint8Array(W * FH);
    for (let i = 0; i < 34; i++) {
      const x = Math.floor(20 + hash2(i, 12, 13) * (S - 40));
      const y = Math.floor(hash2(i, 13, 13) * FH);
      const len = 4 + Math.floor(hash2(i, 14, 13) * 12);
      for (let j = 0; j < len; j++) skyM[y * W + x + j] = j === 0 || j === len - 1 ? 2 : 1;
      if (len > 9) for (let j = 2; j < len - 3; j++) skyM[((y + 1) % FH) * W + x + j] = 2;
    }
    const glints: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) glints.push([Math.floor(30 + hash2(i, 10, 13) * (S - 60)), Math.floor(hash2(i, 11, 13) * FH), i]);
    const R = c.ramp;
    const T = c.tone;
    const Fl = c.flag;
    for (let f = 0; f < F; f++) {
      const y0 = c.h - (f + 1) * FH;
      for (let yl = 0; yl < FH; yl++) {
        const vt = FH - 1 - yl;
        const vz = (vt - f * 4 + FH * 8) % FH;
        const vs = (vt - f * 8 + FH * 8) % FH;
        const row = (y0 + yl) * W;
        const sR = (FH - 1 - vs) * W;
        const zR = (FH - 1 - vz) * W;
        // Ripple lines cut the reflections every few rows (moving with the slow layer).
        const cut = vz % 7 === 0;
        for (let x = 0; x < W; x++) {
          const i = row + x;
          Fl[i] = 0;
          const dl = x;
          const dr = S - 1 - x;
          let r = body;
          let t = 3;
          if (dl < shL[vz] || dr < shR[vz]) {
            r = shal;
            t = (dl < 4 || dr < 4) ? 3.6 : 3;
            const pb = peb[(FH - 1 - vt) * W + x];
            if (pb === 1) t = 4;
            else if (pb === 2) t = 2;
          } else if (dl < rfL[vz] || dr < rfR[vz]) {
            // Reflected treeline: broken into blocks by the ripple lines and a few gaps.
            const gap = cut || hash2(x >> 2, vz >> 3, 23) > 0.8;
            r = gap ? body : refl;
            t = gap ? 3.4 : hash2(x >> 3, vz >> 2, 24) > 0.65 ? 3.6 : 3;
          } else if (x > chL[vz] && x < chR[vz]) {
            r = deep;
            t = 3;
          } else {
            const sk = skyM[zR + x];
            if (sk) {
              r = sky;
              t = sk === 1 ? 3 : 2.4;
            }
          }
          // Streaks ride the fast layer; ripples the slow one (body / channel only).
          if (r === body || r === deep || r === sky) {
            const sv = st[sR + x];
            if (sv === 1) {
              r = r === deep ? body : r;
              t = 4;
            } else if (sv === 2) {
              r = deep;
              t = 2;
            } else {
              const rv = rp[zR + x];
              if (rv === 3) t = 4.2;
              else if (rv === 4) t = Math.min(t, 2.2);
            }
          }
          R[i] = r;
          T[i] = t;
        }
      }
      // Glints: small unlit clusters (a cross) riding the fast layer, each lit in about half the frames.
      for (const [gx, gy, gi] of glints) {
        if ((f + gi) % 3 === 0) continue;
        const vy = (gy + f * 8) % FH;
        const yy = y0 + (FH - 1 - vy);
        const big = (f + gi) % 3 === 1;
        for (const [dx, dy] of big ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0], [1, 0]]) {
          const ry = yy + dy;
          if (ry < y0 || ry >= y0 + FH) continue;
          const i = ry * W + gx + dx;
          R[i] = glint;
          T[i] = dx === 0 && dy === 0 ? 5 : 4;
          Fl[i] = PWF.GLOW;
        }
      }
    }
  }, { wrap: true, density: 16 });
}

/**
 * White water round a rock standing in the river (module 32 × 48 a frame, cut
 * out, laid flat with v downstream; the rock at (16, 16)): a bow wave curling
 * round its upstream face, two trailing wake lines that break into dashes and
 * flecks drifting downstream.
 */
export function d1EddyDecal(atlas: PwAtlas, o: { hex: number }): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1eddy|${h6(o.hex)}|${F}|48`, 32, 48 * F, (c, k) => {
    const fm = k.ramp(o.hex, { light: 0.35, sat: 0.6 });
    const cx = 16;
    const cy = 16;
    frames(c, F, (x, vt, f, y) => {
      const dx = x + 0.5 - cx;
      const dy = vt + 0.5 - cy;
      const d = Math.hypot(dx, dy * 1.2);
      // Bow wave: an arc upstream (vt < cy) at radius 8–11, lumpy, pulsing.
      if (dy < 2 && d > 7 + Math.sin(f * 0.8 + dx) * 0.6 && d < 10.5 + (hash2(x, f, 3) > 0.6 ? 1 : 0)) {
        c.set(x, y, fm, d < 8.6 ? 4.6 : 3.6);
        return;
      }
      // Wake: two lines diverging downstream, broken into dashes that ride the flow.
      if (dy >= 2) {
        const spread = 8 + dy * 0.22;
        const off = Math.abs(Math.abs(dx) - spread);
        const v = (vt - f * 6 + 480) % 48;
        if (off < 1.3 && (v % 8) < 4 + (dy < 12 ? 2 : 0) && dy < 30) {
          c.set(x, y, fm, off < 0.6 ? 4.4 : 3.4);
          return;
        }
        // Flecks between the lines.
        if (Math.abs(dx) < spread && dy < 26 && hash2(x, v >> 1, 7) > 0.94) c.set(x, y, fm, 4);
      }
    });
  });
}

/** White water along a bank (wrap 16 × 32 a frame, cut out): lapping foam clusters riding the current. */
export function d1FoamEdgeTile(atlas: PwAtlas, o: { hex: number; mirror?: boolean }): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1foam|${h6(o.hex)}|${F}|${o.mirror ? 1 : 0}`, 16, 32 * F, (c, k) => {
    const fm = k.ramp(o.hex, { light: 0.35, sat: 0.6 });
    frames(c, F, (xx, vt, f, y) => {
      const x = o.mirror ? 15 - xx : xx;
      const v = wrap(vt - f * 4, 32);
      // Thicker toward the bank (x = 0), breaking into clusters toward the water.
      const lap = 5 + Math.sin(((v + f * 2) / 32) * Math.PI * 4) * 2 + hash2(x, v >> 1, 3) * 3;
      if (x > lap) return;
      if (x > lap - 2 && bayer(x, v) < 0.5) return;
      c.set(xx, y, fm, x < 2 ? 2.8 : hash2(x >> 1, v >> 1, 5) > 0.6 ? 4.4 : 3.6);
    });
  }, { wrap: true });
}

/**
 * Waterfall sheet (wrap 128 × 32 a frame at 16 tpm: the whole 8 m width, so
 * its sides can be ragged): vertical strands of varied width and brightness —
 * each strand falling at one of two speeds (8 or 4 texels a frame), lit down
 * its middle with long pale dashes riding it — dark gaps of wet rock showing
 * between some of them (never single specks), and both edges frayed into
 * strands that thin out and break (cut out).
 */
export function d1FallTile(atlas: PwAtlas, o: { hex: number; deep: number; rock: number }): PwTile {
  const F = D1_WATER_FRAMES;
  const W = 128;
  return atlas.tile(`d1fall2|${h6(o.hex)}|${h6(o.deep)}|${h6(o.rock)}|${F}|${W}`, W, 32 * F, (c, k) => {
    const w = k.ramp(o.hex, { light: 0.45, sat: 0.95 });
    const deep = k.ramp(o.deep, { light: 0.4, sat: 0.9 });
    const rock = k.ramp(o.rock, { light: 0.35, sat: 0.9 });
    // Strands across the sheet: [x0, width, tone, speed, gapAfter].
    const strand = new Int16Array(W).fill(-1);
    const sx0: number[] = [];
    const sw: number[] = [];
    const tone: number[] = [];
    const fast: boolean[] = [];
    for (let x = 0, i = 0; x < W; i++) {
      const wd = 2 + Math.floor(hash2(i, 1, 31) * 6);
      const gap = hash2(i, 2, 31) > 0.72 ? 1 + Math.floor(hash2(i, 3, 31) * 3) : 0;
      sx0.push(x);
      sw.push(wd);
      tone.push(hash2(i, 4, 31) > 0.66 ? 4 : hash2(i, 4, 31) > 0.3 ? 3.4 : 2.8);
      fast.push(hash2(i, 5, 31) > 0.45);
      for (let j = 0; j < wd && x + j < W; j++) strand[x + j] = i;
      x += wd + gap;
    }
    // Per column: the phase / length of its falling dashes (bright, dark) — long vertical streaks, never blocks.
    const ph = (x: number, k: number) => Math.floor(hash2(x, k, 37) * 32);
    const ln = (x: number, k: number, a: number, b: number) => a + Math.floor(hash2(x, k, 38) * (b - a));
    frames(c, F, (x, vt, f, y) => {
      const si = strand[x];
      const sp = si >= 0 && fast[si] ? 8 : 4;
      const v = (vt + f * sp) % 32;
      const edge = Math.min(x, W - 1 - x);
      // Frayed edges: the outer columns carry only falling segments, shorter toward the edge.
      if (edge < 10 && (v + ph(x, 1)) % 32 >= 6 + edge * 2.4) return;
      if (si < 0) {
        // Wet rock between strands, bridged by water now and then.
        if ((v + ph(x, 2)) % 32 < ln(x, 2, 4, 12)) c.set(x, y, w, 3);
        else c.set(x, y, rock, x > 0 && strand[x - 1] >= 0 ? 2.6 : 1.8);
        return;
      }
      const u = (x - sx0[si] + 0.5) / sw[si];
      let r = w;
      let t = tone[si] + (u < 0.3 ? 0.4 : u > 0.75 ? -0.6 : 0);
      if ((v + ph(x, 3)) % 32 < ln(x, 3, 3, 12) && u > 0.15 && u < 0.85) t = 4.8;
      else if (hash2(x, 7, 39) > 0.62 && (v + ph(x, 4)) % 32 < ln(x, 4, 5, 14)) {
        r = deep;
        t = 2.6;
      }
      c.set(x, y, r, t);
    });
  }, { wrap: true, density: 16 });
}

/**
 * The waterfall's lip (module 128 × 16 a frame, cut out): the dark glassy
 * overflow band where the river tips over the rim, a bright crest along its
 * curl, strands peeling off below, falling (lays over the top of the sheet).
 */
export function d1FallLipModule(atlas: PwAtlas, o: { hex: number; deep: number }): PwTile {
  const F = D1_WATER_FRAMES;
  const W = 128;
  return atlas.tile(`d1falllip|${h6(o.hex)}|${h6(o.deep)}|${F}|16`, W, 16 * F, (c, k) => {
    const w = k.ramp(o.hex, { light: 0.45, sat: 0.95 });
    const deep = k.ramp(o.deep, { light: 0.4, sat: 0.9 });
    frames(c, F, (x, vt, f, y) => {
      const edge = Math.min(x, W - 1 - x);
      if (edge < 4) return;
      const top = 15 - (edge < 10 ? (10 - edge) * 0.3 : 0) - Math.sin(x * 0.2 + f * 0.5) * 0.6;
      if (vt > top) return;
      const d = top - vt;
      if (d < 1.5) c.set(x, y, w, 5);
      else if (d < 2.5) c.set(x, y, w, 4);
      else if (d < 7) c.set(x, y, deep, (x + f) % 9 === 0 ? 3.4 : d < 4 ? 2.6 : 3);
      else {
        // Strands peeling off the curl, falling.
        const v = (vt + f * 6) % 16;
        if (hash2(x >> 1, v >> 2, 41) > 0.45) c.set(x, y, w, (x & 3) === 1 ? 4.6 : 3.6);
      }
    });
  });
}

/** Splash / spray where the fall hits the pool (module 64 × 32 a frame, cut out): churning foam heaps, flying droplets. */
export function d1SplashModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1splash|${h6(o.hex)}|${F}`, 64, 32 * F, (c, k) => {
    const fm = k.ramp(o.hex, { light: 0.35, sat: 0.6 });
    frames(c, F, (x, vt, f, y) => {
      // Heap: a lumpy mound whose crest boils frame to frame.
      const u = (x + 0.5) / 64;
      const crest = 12 + Math.sin(u * Math.PI) * 13 + Math.sin(u * 23 + f * 1.7) * 2 + Math.sin(u * 51 - f * 2.3) * 1.5;
      if (vt > crest) {
        // Droplets above the heap.
        if (hash2(x, (vt + f * 5) >> 1, 11) > 0.97 && vt < crest + 6) c.set(x, y, fm, 4.6);
        return;
      }
      const lump = smooth(x + f * 3, vt + f * 4, 64, 32, 4, 13);
      const edge = crest - vt < 2;
      c.set(x, y, fm, edge ? 4.8 : lump > 0.6 ? 4.2 : lump < 0.3 ? 2.6 : 3.4);
    });
  });
}

/**
 * A torch flame (module 16 × 24 a frame, cut out): a licking tongue of fire —
 * the body painted as LIT orange / red texels and only a small white-yellow
 * core unlit (GLOW): the atlas lets glow win over cut-out at the far levels,
 * so a flame painted all in glow collapsed to a pale rectangle at a distance;
 * now the core shrinks to a hot dot and the tongue keeps its shape. Its tips
 * flicker frame to frame, a spark or two. Shares the water's frame clock.
 */
export function d1FlameModule(atlas: PwAtlas): PwTile {
  const F = D1_WATER_FRAMES;
  return atlas.tile(`d1flame2|${F}`, 16, 24 * F, (c, k) => {
    const fire = k.ramp(0xff7a1a, { light: 0.6, sat: 1.1 });
    const core = k.ramp(0xffd860, { light: 0.6, sat: 1.0 });
    const red = k.ramp(0xd8301a, { light: 0.5, sat: 1.1 });
    frames(c, F, (x, vt, f, y) => {
      const u = (x + 0.5 - 8) / 8;
      const h = vt / 24;
      const sway = Math.sin(h * 5 + f * 1.3) * 0.22 * h;
      // A narrow teardrop (≈ 9 texels at its widest): the coarse levels dilate it, it must stay a flame.
      const half = Math.pow(Math.max(0, 1 - h), 0.8) * (0.5 + Math.sin(f * 2.1 + h * 3) * 0.06);
      const top = 0.82 + Math.sin(f * 1.7) * 0.1;
      const lick = h < 0.55 && Math.abs(u - 0.3 - sway) < (0.55 - h) * 0.3 && (f & 1) === 0;
      if ((h > top || Math.abs(u - sway) > half) && !lick) return;
      const d = Math.abs(u - sway) / Math.max(0.05, half);
      if (d < 0.35 && h < 0.4) c.set(x, y, core, 5, PWF.GLOW);
      else if (h > top - 0.22 || d > 0.78 || lick) c.set(x, y, red, 2.6);
      else c.set(x, y, fire, d < 0.55 ? 3.4 : 3);
    });
  });
}

/**
 * River bank (wrap 80 × 128: 2.5 m across × 4 m along; u = 0 the land side, cut
 * out in a ragged grass fringe, u = 80 the waterline): grass, dry earth with
 * exposed roots, a band of pebbles and coarse sand, dark wet mud with a lit
 * wet sheen at the water. `mirror` paints it the other way round (the land on
 * the right) for the opposite bank.
 */
export function d1BankTile(atlas: PwAtlas, o: { earth: number; sand: number; mud: number; grass: number; stone: number; mirror?: boolean }): PwTile {
  return atlas.tile(`d1bank|${h6(o.earth)}|${h6(o.sand)}|${o.mirror ? 1 : 0}`, 80, 128, (c, k) => paintBank(c, k, o), { wrap: true });
}

function paintBank(c: PwCanvas, k: PwKit, o: { earth: number; sand: number; mud: number; grass: number; stone: number; mirror?: boolean }) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const earth = k.ramp(o.earth, { light: 0.4 });
  const sand = k.ramp(o.sand, { light: 0.4, sat: 0.9 });
  const mud = k.ramp(o.mud, { light: 0.42 });
  const grass = k.ramp(o.grass, { light: 0.45, sat: 1.05 });
  const stone = k.ramp(o.stone, { light: 0.45, sat: 0.6 });
  const X = (u: number) => (o.mirror ? W - 1 - u : u);
  for (let y = 0; y < H; y++) {
    const gEdge = 14 + (smooth(0, y, 8, H, 8, 21) - 0.5) * 12;
    const sEdge = 40 + (smooth(2, y, 8, H, 8, 22) - 0.5) * 12;
    const mEdge = 62 + (smooth(4, y, 8, H, 8, 23) - 0.5) * 8;
    for (let u = 0; u < W; u++) {
      const x = X(u);
      if (u < gEdge) {
        if (u < gEdge - 8 && hash2(x, y >> 1, 3) > 0.45) continue;
        c.set(x, y, grass, (x + y * 3) % 5 === 0 ? 4.3 : hash2(x, y, 9) > 0.7 ? 2.2 : 3.2);
      } else if (u < sEdge) c.set(x, y, earth, u < gEdge + 3 ? 2 : smooth(u, y, W, H, 8, 5) > 0.6 ? 3.6 : 3);
      else if (u < mEdge) c.set(x, y, sand, bayer(u, y) < 0.15 ? 2.4 : smooth(u, y, W, H, 8, 6) > 0.55 ? 3.8 : 3);
      else c.set(x, y, mud, u > W - 4 ? 4.2 : u > W - 6 ? 1.4 : u < mEdge + 2 ? 2 : 2.6);
    }
  }
  // Exposed roots in the earth band.
  for (let i = 0; i < 5; i++) {
    let u = rng.int(16, 34);
    let y = rng.int(0, H - 1);
    for (let j = 0; j < rng.int(8, 18); j++) {
      c.set(X(u), wrap(y, H), earth, 0.8);
      c.set(X(u), wrap(y + 1, H), earth, 4);
      u += rng.chance(0.6) ? 1 : 0;
      y += rng.chance(0.5) ? 1 : -1;
    }
  }
  // Pebbles (sand band) and a few cobbles in the mud.
  for (let i = 0; i < 70; i++) {
    const u = rng.int(36, 70);
    const y = rng.int(0, H - 1);
    const big = rng.chance(0.25);
    c.set(X(u), y, stone, 4.4);
    c.set(X(u + 1), y, stone, 3.2);
    c.set(X(u + 1), wrap(y + 1, H), stone, 1.8);
    if (big) {
      c.set(X(u), wrap(y + 1, H), stone, 3.2);
      c.set(X(u + 2), wrap(y + 1, H), stone, 1.8);
      c.set(X(u + 2), y, stone, 3.2);
    }
  }
  // Reeds at the waterline: a few dark stalks (the billboards do the big ones).
  for (let i = 0; i < 10; i++) {
    const u = rng.int(56, 64);
    const y = rng.int(0, H - 1);
    for (let j = 0; j < 3; j++) c.set(X(u), wrap(y - j, H), grass, j === 2 ? 4 : 2.6);
  }
}
