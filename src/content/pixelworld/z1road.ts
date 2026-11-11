import { PW_TPM_MID, type PwCanvas, type PwRng } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { blob, Brush2, dashAt, shore, wobbler } from './brush2';
import { hash2 } from './surfaces';

/**
 * MAIN STREET (z1) carriageways for PIXEL WORLD 2: the road as a painted CROSS-SECTION, kerb to
 * kerb, at 64 texels a metre — what fills the lower half of every street frame.
 *
 * The first pass laid one 8 m asphalt tile by world projection: a dark plane with specks. A
 * street is not a material, it is a thing with a shape: a crown worn pale between the lanes,
 * two tyre-polished wheel tracks a lane that hold the rain, a concrete gutter pan against each
 * kerb, a double yellow line scuffed off where traffic crossed it, patches and trenches cut
 * across lanes, covers, cracks. `z1RoadTile(variant)` paints that picture 12 m wide and 8 m
 * long; u runs kerb to kerb (west → east on a street heading north), v wraps along the street,
 * and three variants laid in a shuffled order (`z1RoadOrder`) keep any one trench or cover from
 * coming round every 8 m.
 *
 * Painted far side up (canvas row 0 = the far end as the rail walks it): light from the upper
 * left, so every groove carries its lit lip below it and every cover its shadow at lower right,
 * as on the walls. The driving lanes (the enemies' floor) stay within three tones; the stronger
 * contrast — gutter water, leaves, iron, concrete — is kept to the kerbs.
 */

/** Road module size: 12 m kerb to kerb × 8 m along, at 64 texels a metre. */
export const Z1_ROAD_W = 768;
export const Z1_ROAD_H = 512;
export type Z1RoadVariant = 0 | 1 | 2;

/** The ground palette of the stage: every ground painter takes its ramps from here (one street, one set of colours). */
export function z1GroundRamps(k: PwKit) {
  // (`dark` is set per ramp so that every tone 0 lands near the night's floor, a deep blue-violet about
  // #14122a, and no lower: the light steps down from there, it must not start in black.)
  return {
    /** Wet asphalt: the body of the road (an indigo-violet grey). */
    asph: k.ramp(0x363a48, { light: 0.36, sat: 1.0, dark: 0.6 }),
    /** The crown and the lane edges: older, drier, a shade paler and greyer. */
    dry: k.ramp(0x41434f, { light: 0.34, sat: 0.85, dark: 0.56 }),
    /** Tar: sealed cracks, fresh patches, oil. */
    tar: k.ramp(0x25262f, { light: 0.5, sat: 1.0, dark: 0.8 }),
    /** The night sky lying in the wet. */
    sky: k.ramp(0x5a6890, { light: 0.32, sat: 0.95, dark: 0.44 }),
    /** Concrete: gutter pans, kerbs, flags. */
    conc: k.ramp(0x62646c, { light: 0.38, sat: 0.7, dark: 0.46 }),
    concDark: k.ramp(0x53555d, { light: 0.36, sat: 0.75, dark: 0.5 }),
    /** Walks: old bluestone flags, a greyer stone, the paler granite of the kerb, a newer cast slab. */
    blue: k.ramp(0x505768, { light: 0.36, sat: 0.9, dark: 0.5 }),
    flag: k.ramp(0x5b5c66, { light: 0.36, sat: 0.75, dark: 0.48 }),
    cast: k.ramp(0x67655f, { light: 0.34, sat: 0.6, dark: 0.46 }),
    kerb: k.ramp(0x74767e, { light: 0.34, sat: 0.7, dark: 0.42 }),
    /** Road paint, worn: never a pure yellow or white on the enemies' floor. */
    yellow: k.ramp(0xa8892e, { light: 0.3, sat: 0.9, dark: 0.45 }),
    white: k.ramp(0xa9a8a2, { light: 0.3, sat: 0.6, dark: 0.45 }),
    iron: k.ramp(0x3c3e48, { light: 0.5, sat: 0.9, dark: 0.6 }),
    rust: k.ramp(0x7a4024, { light: 0.4, dark: 0.46 }),
    leaf: k.ramp(0x6a5228, { light: 0.4, dark: 0.46 }),
    leafRed: k.ramp(0x7a3a22, { light: 0.4, dark: 0.46 }),
    moss: k.ramp(0x3e5a32, { light: 0.35, dark: 0.55 }),
    paper: k.ramp(0xa8a290, { light: 0.4, sat: 0.6 }),
    water: k.ramp(0x1e2638, { light: 0.4, sat: 1, dark: 0.82 }),
    oilP: k.ramp(0x5a3a7a, { light: 0.4, dark: 0.5 }),
    oilT: k.ramp(0x2a6a6a, { light: 0.4, dark: 0.5 }),
  };
}
export type Z1GroundRamps = ReturnType<typeof z1GroundRamps>;

/** The wet-asphalt road module (see the header). */
export function z1RoadTile(atlas: PwAtlas, variant: Z1RoadVariant): PwTile {
  return atlas.tile(`z1road|${variant}`, Z1_ROAD_W, Z1_ROAD_H, (c, k) => paintZ1Road(c, k, variant), { wrap: true, density: PW_TPM_MID });
}

/** Which variant lies on segment `i` of a street (`salt` per street): shuffled, never the same twice running. */
export function z1RoadOrder(i: number, salt = 0): Z1RoadVariant {
  const a = Math.floor(hash2(i, salt, 733) * 3);
  const prev = i > 0 ? Math.floor(hash2(i - 1, salt, 733) * 3) : -1;
  return ((a === prev ? a + 1 : a) % 3) as Z1RoadVariant;
}

// Cross-section, in texels from the centreline (64 = 1 m).
const TRACK_IN = 64; // inner wheel track centre (1.0 m)
const TRACK_OUT = 166; // outer wheel track centre (2.6 m)
const TRACK_HALF = 20;
const PARK = 230; // the parking line (3.6 m)
const PAN = 346; // the gutter pan starts (5.4 m); the kerb is at 384

/**
 * The asphalt of a street, painted in the order an artist blocks it in. Works on columns x0…x1 of
 * the canvas (the pans and walks beside it are someone else's):
 *
 *  1. body: one tone, with `dry` bands (the crown, lane edges: older paler stone) whose edges
 *     break into dashes along the road;
 *  2. the WET: rain lies where tyres have polished the road — not as ruled stripes but as chains
 *     of long lobed sheets down every wheel path (`tracksV` along y, `tracksH` along x), with
 *     gaps, and a few broad sheets across the lanes. A sheet is a step darker than the dry road
 *     (wet asphalt drinks the light) and its ends fray into strokes;
 *  3. what the wet mirrors: LADDERS of the night sky — strokes of blue stacked down each sheet,
 *     every stroke its own width, some fat with a bright core. The stacked stroke is how a 2D
 *     street says "wet": the sky standing in the road. Fainter ladders in the road's own lighter
 *     tone lie on the dry parts (it is all damp);
 *  4. the dry road's own skin: scabs of ravelled stone (a pale lobed chip with its shadow), pits.
 * Returns the wet mask (1 = under water) for the painters that add to it.
 */
function paintAsphalt(
  b: Brush2,
  rng: PwRng,
  P: Z1GroundRamps,
  seed: number,
  o: { x0: number; x1: number; dry: readonly [number, number][]; tracksV?: readonly number[]; tracksH?: readonly number[]; sheets?: number; half?: number },
): Uint8Array {
  const W = b.w;
  const H = b.h;
  const R = b.R;
  const T = b.T;
  const half = o.half ?? TRACK_HALF;
  // 1. Body.
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = o.x0; x < o.x1; x++) {
      R[row + x] = P.asph;
      T[row + x] = 3;
    }
  }
  o.dry.forEach(([a0, b0], k) => {
    const wl = wobbler(seed + 91 + k * 2, b.wrapY ? H : 0);
    const wr = wobbler(seed + 92 + k * 2, b.wrapY ? H : 0);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      const a = Math.max(o.x0, Math.round(a0 + wl(y) * 5));
      const e = Math.min(o.x1, Math.round(b0 + wr(y) * 5));
      for (let x = a; x < e; x++) R[row + x] = P.dry;
      // Edges fray into strokes along the road.
      if (a - 2 >= o.x0 && dashAt(y, seed + 3 + k, 3, 9, 2, 6)) R[row + a - 2] = P.dry;
      if (e + 1 < o.x1 && dashAt(y, seed + 4 + k, 3, 9, 2, 6)) R[row + e + 1] = P.dry;
    }
  });
  // 2. The wet mask: chains of sheets down the wheel paths, a few broad ones across.
  const wet = new Uint8Array(W * H);
  const sheets: { x: number; y: number; w: number; h: number }[] = [];
  const stamp = (bl: { m: Uint8Array; w: number; h: number }, ox: number, oy: number) => {
    for (let y = 0; y < bl.h; y++) {
      for (let x = 0; x < bl.w; x++) {
        if (!bl.m[y * bl.w + x]) continue;
        const i = b.at(ox + x, oy + y);
        if (i >= 0 && ox + x >= o.x0 && ox + x < o.x1) wet[i] = 1;
      }
    }
    sheets.push({ x: ox, y: oy, w: bl.w, h: bl.h });
  };
  for (const t of o.tracksV ?? []) {
    // (Sheets stop short of the tile's ends: another variant may follow this one.)
    let y = rng.int(8, 90);
    while (y < H - 78) {
      const len = Math.min(H - 8 - y, rng.int(70, 230));
      const wd = Math.round(half * 2 * rng.range(0.75, 1.25));
      stamp(blob(rng, wd, len, Math.max(3, Math.round(len / 45)), 0.75), Math.round(t - wd / 2 + rng.spread(6)), y);
      y += len + rng.int(18, 110);
    }
  }
  for (const t of o.tracksH ?? []) {
    let x = o.x0 + rng.int(8, 90);
    while (x < o.x1 - 78) {
      const len = Math.min(o.x1 - 8 - x, rng.int(70, 230));
      const wd = Math.round(half * 2 * rng.range(0.75, 1.25));
      stamp(blob(rng, len, wd, Math.max(3, Math.round(len / 45)), 0.75), x, Math.round(t - wd / 2 + rng.spread(6)));
      x += len + rng.int(18, 110);
    }
  }
  for (let i = 0; i < (o.sheets ?? 3); i++) {
    const w = rng.int(80, 170);
    const h = rng.int(36, 76);
    stamp(blob(rng, w, h, 5, 0.6), o.x0 + rng.int(10, Math.max(11, o.x1 - o.x0 - w - 10)), rng.int(8, H - h - 8));
  }
  for (let y = 0; y < H; y++) {
    for (let x = o.x0; x < o.x1; x++) {
      const i = y * W + x;
      if (!wet[i]) continue;
      // A sheet is two steps deep: a damp rim three texels wide round the standing water.
      const l = b.at(x - 3, y);
      const r = b.at(x + 3, y);
      const u3 = b.at(x, y - 3);
      const d3 = b.at(x, y + 3);
      const core = l >= 0 && r >= 0 && u3 >= 0 && d3 >= 0 && wet[l] && wet[r] && wet[u3] && wet[d3];
      R[i] = P.asph;
      T[i] = core ? 1 : 2;
      // The far and near edges of a sheet fray: a broken stroke one row beyond the edge.
      const up = b.at(x, y - 1);
      const dn = b.at(x, y + 1);
      if (up >= 0 && !wet[up] && dashAt(x, y + seed, 3, 8, 2, 5)) {
        const j = b.at(x, y - 2);
        if (j >= 0 && (R[j] === P.asph || R[j] === P.dry)) T[j] = 2;
      }
      if (dn >= 0 && !wet[dn] && dashAt(x, y + seed + 1, 3, 8, 2, 5)) {
        const j = b.at(x, y + 2);
        if (j >= 0 && (R[j] === P.asph || R[j] === P.dry)) T[j] = 2;
      }
    }
  }
  // 3. Ladders of sky in the sheets (two or three a sheet, each a column of strokes), fainter ones on the dry road.
  const inWet = (r: number) => r === P.asph || r === P.sky;
  for (const s of sheets) {
    const tall = s.h >= s.w;
    const n = tall ? (s.w > 40 ? 2 : 1) + (s.h > 150 ? 1 : 0) : Math.max(2, Math.round(s.w / 42));
    for (let k = 0; k < n; k++) {
      const lx = s.x + Math.round(s.w * (tall ? 0.25 + rng.next() * 0.5 : (k + 0.2 + rng.next() * 0.6) / n));
      const ly = s.y + Math.round(s.h * rng.range(0.02, 0.3));
      const ll = Math.round(s.h * rng.range(0.45, 0.75));
      ladder(b, rng, lx, ly, ll, rng.int(10, 24), P.sky, 2, wet, inWet);
    }
  }
  // The damp road between the sheets: paler lobes where it drains first (large, low in contrast: they carry
  // the far levels), then ladders of its own lighter tone all over it — it is raining, nothing is dry.
  const nLobe = Math.round(((o.x1 - o.x0) * H) / 26000);
  for (let k = 0; k < nLobe; k++) {
    const lw = rng.int(22, 56);
    const lh = rng.int(60, 170);
    const bl = blob(rng, lw, lh, 5, 0.6);
    const ox = rng.int(o.x0 + 4, o.x1 - lw - 4);
    const oy = rng.int(0, H - 1);
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        if (!bl.m[y * lw + x]) continue;
        const i = b.at(ox + x, oy + y);
        if (i >= 0 && !wet[i] && R[i] === P.asph) R[i] = P.dry;
      }
    }
  }
  const nDry = Math.round(((o.x1 - o.x0) * H) / 1900);
  for (let k = 0; k < nDry; k++) {
    const lx = rng.int(o.x0 + 8, o.x1 - 8);
    ladder(b, rng, lx, rng.int(0, H - 1), rng.int(30, 110), rng.int(7, 20), 0, 1, null, (r) => r === P.asph || r === P.dry);
  }
  // 4. The road's skin: scabs of ravelled stone in drifts (a pale lobed chip, its shadow at lower right), pits
  // with a dark reveal and a lit lip; none under water.
  const dryOnly = (x: number, y: number) => {
    const i = b.at(x, y);
    return i >= 0 && !wet[i] && (R[i] === P.asph || R[i] === P.dry);
  };
  const nScab = Math.round(((o.x1 - o.x0) * H) / 1000);
  for (let d = 0; d < Math.ceil(nScab / 4); d++) {
    const cx = rng.int(o.x0 + 6, o.x1 - 6);
    const cy = rng.int(0, H - 1);
    for (let q = 0; q < 4; q++) {
      const x = Math.round(cx + (rng.next() + rng.next() - 1) * 16);
      const y = Math.round(cy + (rng.next() + rng.next() - 1) * 44);
      if (!dryOnly(x, y) || !dryOnly(x + 6, y + 3) || !dryOnly(x - 6, y - 3) || x < o.x0 + 8 || x > o.x1 - 9) continue;
      const big = rng.chance(0.3);
      // (Shadows on this dark stone are two steps: one is lost in the night.)
      b.bump(rng, x, y, big ? rng.int(8, 13) : rng.int(4, 7), { fill: 1, lit: 0, dark: 1, cast: 2, castLen: big ? 2 : 1 });
    }
  }
  for (let i = 0; i < nScab; i++) {
    const x = rng.int(o.x0 + 4, o.x1 - 5);
    const y = rng.int(0, H - 1);
    if (!dryOnly(x, y) || !dryOnly(x + 3, y + 2) || !dryOnly(x - 3, y - 2)) continue;
    b.chip(rng, x, y, rng.chance(0.25) ? rng.int(5, 8) : 3, { depth: 3 });
  }
  return wet;
}

/**
 * A ladder: the standing reflection of a pale sky (or a faint lamp) in wet ground — strokes stacked
 * down the canvas, each its own width, the column leaning a texel now and then, rungs missing,
 * every third or fourth one fat with a brighter core. `ramp` 0 lifts the surface's own tone by
 * `tone` instead of painting the sky (the damp shine of the dry road). `mask` keeps it on the wet.
 */
function ladder(b: Brush2, rng: PwRng, x: number, y: number, len: number, width: number, ramp: number, tone: number, mask: Uint8Array | null, only: (r: number) => boolean) {
  let cx = x;
  let k = 0;
  while (k < len) {
    // The column is widest in its middle third.
    const t = k / len;
    const env = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    const wd = Math.max(3, Math.round(width * env * (0.5 + rng.next() * 0.5)));
    const fat = ramp !== 0 && wd > 9 && rng.chance(0.3);
    const thick = fat ? 4 : 2;
    cx += rng.int(-1, 1);
    if (!rng.chance(0.18)) {
      for (let j = 0; j < thick; j++) {
        const inset = fat && (j === 0 || j === 3) ? 2 + Math.round(wd * 0.15) : 0;
        for (let q = inset; q < wd - inset; q++) {
          const i = b.at(cx - (wd >> 1) + q, y + k + j);
          if (i < 0 || !only(b.R[i]) || (mask && !mask[i])) continue;
          const tip = q === inset || q === wd - inset - 1;
          if (ramp) {
            b.R[i] = ramp;
            b.T[i] = fat && (j === 1 || j === 2) && q > inset + 2 && q < wd - inset - 3 ? tone + 1 : tip ? tone - 1 : tone;
          } else if (!tip) b.T[i] = Math.min(5, b.T[i] + tone);
        }
      }
    }
    // (Even pitches: two-texel rungs sit inside one texel of the next level.)
    k += thick + 2 * rng.int(1, 3);
  }
}

export function paintZ1Road(c: PwCanvas, k: PwKit, variant: Z1RoadVariant) {
  const W = c.w;
  const H = c.h;
  const R = c.ramp;
  const T = c.tone;
  const P = z1GroundRamps(k);
  const rng = k.rng;
  const b = new Brush2(c, { wrapY: true });
  const CX = W / 2;
  const seed = 40 + variant * 17;
  const tracks = [CX - TRACK_OUT, CX - TRACK_IN, CX + TRACK_IN, CX + TRACK_OUT];

  // (a, b) Body, the wet, the sky in it, the dry skin.
  const wet = paintAsphalt(b, rng, P, seed, {
    x0: CX - PAN,
    x1: CX + PAN,
    dry: [
      [CX - 34, CX + 34],
      [CX - PAN, CX - PARK - 40 + variant * 12],
      [CX + PARK + 26 - variant * 10, CX + PAN],
    ],
    tracksV: tracks,
    sheets: 3,
  });

  // (b) The gutter pans: a cast concrete strip against each kerb, wet and darker than a dry walk, with
  // a sealed seam to the asphalt and a joint every 4 m.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : CX + PAN;
    const x1 = side < 0 ? CX - PAN : W;
    for (let y = 0; y < H; y++) {
      for (let x = x0; x < x1; x++) {
        R[y * W + x] = P.conc;
        T[y * W + x] = 3;
      }
    }
    // The asphalt's ragged edge laps onto the pan here and there; the seam itself is a tar-sealed groove,
    // two texels (it must hold at the first far level).
    const seam = side < 0 ? x1 : x0 - 1;
    const wf = wobbler(seed + 50 + side, H, 3);
    for (let y = 0; y < H; y++) {
      const lap = Math.max(0, Math.round(wf(y) * 2.5));
      for (let q = 0; q < lap; q++) b.set(side < 0 ? seam - 1 - q : seam + 1 + q, y, P.asph, 3);
      b.set(seam, y, P.tar, 1);
      b.set(seam + side, y, P.tar, dashAt(y, seed + 7, 4, 14, 2, 6) ? 1 : 2);
    }
    // Pan joints every 4 m, each a groove with its lit lip.
    for (let j = 0; j < 2; j++) {
      const y = 70 + j * 256 + variant * 40;
      b.groove([x0, y, x1 - 1, y], { dt: -2, lip: 1, width: 2, only: P.conc });
    }
    // Scour: long tongues where the flow has washed the concrete darker, down the fall of the pan.
    for (let i = 0; i < 7; i++) {
      const sw = rng.int(6, 13);
      const sh = rng.int(40, 130);
      const s = blob(rng, sw, sh, 4, 0.6);
      const ox = side < 0 ? x0 + rng.int(4, x1 - x0 - sw - 4) : x0 + rng.int(4, x1 - x0 - sw - 4);
      const oy = rng.int(0, H - 1);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (s.m[y * sw + x]) b.shift(ox + x, oy + y, -1, P.conc);
    }
    b.band(x0, 0, x1 - x0, H, side < 0 ? 'left' : 'right', { dt: -1, steps: 1, reach: 0.34, wob: 2.5, seed: seed + side, only: P.conc });
  }

  // (c) Construction. The centre joint between the two paving passes, sealed with tar in stretches.
  for (let y = 0; y < H; y++) {
    const sealed = dashAt(y, seed + 31, 30, 90, 20, 60);
    b.set(CX - 1, y, P.tar, sealed ? 1 : 2);
    b.set(CX, y, sealed ? P.tar : P.dry, sealed ? 1 : 2);
    if (sealed) b.shift(CX + 1, y, 1);
  }
  // A saw-cut trench across one lane (utility work), filled with newer, darker asphalt, banded with tar.
  {
    const right = variant !== 1;
    const tx0 = right ? CX + 14 : CX - 224;
    const tx1 = right ? CX + 224 : CX - 14;
    const ty = [118, 300, 404][variant];
    const th = [44, 38, 52][variant];
    for (let y = 0; y < th; y++) {
      for (let x = tx0; x < tx1; x++) {
        const i = b.at(x, ty + y);
        const edge = y < 2 || y >= th - 2 || x < tx0 + 2 || x >= tx1 - 2;
        R[i] = P.tar;
        // Inside: a smoother, darker fill; its far and left edges in shadow (it has sunk a little), the near edge lit.
        T[i] = edge ? 1 : y < 4 || x < tx0 + 4 ? 2 : 3;
        c.flag[i] = 0;
        wet[i] = 0;
      }
    }
    // Tar banding painted over the cut, wandering off it; lit lip along the near side.
    const wf = wobbler(seed + 70, 0, 4);
    for (let x = tx0 - 6; x < tx1 + 6; x++) {
      const o1 = Math.round(wf(x) * 1.6);
      b.set(x, ty - 1 + o1, P.tar, 1);
      b.set(x, ty + th + o1, P.tar, 1);
      if (dashAt(x, seed + 71, 5, 16, 2, 5)) b.shift(x, ty + th + 1 + o1, 1);
    }
    // The fill has its own wear: a seam down the middle, the wheel paths worn pale across it, water in its sunk corners.
    b.groove([tx0 + 4, ty + (th >> 1), tx1 - 4, ty + (th >> 1) + 2], { dt: -1, lip: 1, breakup: 0.5, seed });
    for (const t of tracks) {
      if (t > tx0 && t < tx1) ladder(b, rng, t + rng.int(-4, 4), ty + 4, th - 8, 18, P.sky, 2, null, (r) => r === P.tar);
    }
    for (let i = 0; i < 5; i++) b.bump(rng, rng.int(tx0 + 8, tx1 - 8), ty + rng.int(6, th - 6), rng.int(4, 8), { lit: 1, dark: 0, cast: 1, only: P.tar });
  }
  // A big rectangular overlay in the other lane (an older repair: paler, its edges gone soft, cracked along one side).
  {
    const right = variant === 1;
    const px0 = right ? CX + 96 : CX - 210;
    const pw = [118, 96, 140][variant];
    const py = [8, 150, 190][variant];
    const ph = [96, 130, 84][variant];
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = b.at(px0 + x, py + y);
        if (R[i] !== P.asph && R[i] !== P.dry && R[i] !== P.sky) continue;
        // (Its corners are rounded off: a paver's shovel, not a saw.)
        const cxk = Math.min(x, pw - 1 - x);
        const cyk = Math.min(y, ph - 1 - y);
        if (cxk + cyk < 4) continue;
        if (wet[i]) continue;
        R[i] = P.dry;
        T[i] = cxk === 0 || cyk === 0 ? (x === 0 || y === 0 ? 4 : 2) : 3;
      }
    }
    b.crack(rng, px0 + 2, py + ph - 3, pw - 10, 0.05, { dt: -2, lip: 1, branch: 0.04, fat: 0.4, wander: 0.4 });
  }
  if (variant === 0) manhole(b, rng, P, CX - 116, 330, 21, 'SEWER');
  if (variant === 2) manhole(b, rng, P, CX + 112, 170, 17, 'WATER');

  // (e, early) The paint, under the wear that comes after it.
  roadPaint(b, P, seed, CX, variant);

  // (d) Wear. Thermal cracks ACROSS the lanes, every few metres: each wanders kerb-ward from the crown, two
  // texels wide where it is old, sealed with tar for part of its way — the lines a street is ruled with.
  for (let i = 0; i < 4; i++) {
    const y = 40 + i * 122 + rng.int(-26, 26);
    const side = (i + variant) % 2 ? 1 : -1;
    const x0 = CX + side * rng.int(8, 40);
    const len = rng.int(150, 320);
    const sealed = i % 2 === 0;
    const [ex, ey] = b.crack(rng, x0, y, len, side > 0 ? rng.spread(0.12) : Math.PI + rng.spread(0.12), sealed ? { ramp: P.tar, tone: 1, lip: 1, fat: 0.7, wander: 0.35 } : { dt: -2, lip: 1, branch: 0.02, fat: 0.4, wander: 0.5 });
    // (Where it ends a short fork runs off down the lane.)
    b.crack(rng, ex, ey, rng.int(20, 50), Math.PI / 2 + rng.spread(0.5), { dt: -2, lip: 1, fat: 0 });
  }
  // Tar snakes: sealed cracks wandering down the lanes, shining on their upper-left edge.
  const nSnakes = 5 + variant;
  for (let s = 0; s < nSnakes; s++) {
    let x = CX + (rng.chance(0.5) ? 1 : -1) * rng.range(20, PAN - 30);
    let y = rng.int(0, H - 1);
    let a = Math.PI / 2 + rng.spread(0.5);
    const len = rng.int(70, 210);
    const fat = rng.chance(0.5) ? 3 : 2;
    for (let j = 0; j < len; j++) {
      const ix = Math.round(x);
      const iy = Math.round(y);
      for (let q = 0; q < fat; q++) b.set(ix + q, iy, P.tar, q === fat - 1 ? 2 : 1);
      // Wet tar catches the light in short runs.
      if (dashAt(j, s + seed, 3, 7, 5, 14)) b.tint(ix - 1, iy, P.sky, 0);
      a += rng.spread(0.12);
      a += (Math.PI / 2 - a) * 0.03;
      x += Math.cos(a);
      y += Math.sin(a);
      if (rng.chance(0.012)) a += rng.chance(0.5) ? 0.9 : -0.9;
    }
  }
  // Long cracks with a lit lip, forking; more of them toward the lane edges.
  for (let i = 0; i < 9; i++) {
    const side = rng.chance(0.5) ? 1 : -1;
    const x = CX + side * rng.range(30, PAN - 20);
    b.crack(rng, x, rng.int(0, H - 1), rng.int(40, 130), rng.chance(0.6) ? Math.PI / 2 + rng.spread(0.5) : rng.spread(0.6), { dt: -2, lip: 1, branch: 0.03, fat: 0.3, wander: 0.7 });
  }
  // Alligator cracking: one failed patch in a wheel track — polygonal plates, each with a dark far edge and a lit near one.
  alligator(b, rng, tracks[variant === 1 ? 0 : 3] - 34, [20, 250, 60][variant], 78, 150, seed);
  // A pothole in the other lane, holding water.
  pothole(b, rng, P, tracks[variant === 1 ? 2 : 1] + rng.int(-10, 10), [400, 96, 250][variant], 34, 22);
  if (variant === 1) pothole(b, rng, P, CX + PARK + 30, 420, 24, 16);

  // (e) Dressing. Oil under where engines stand in the parking lanes; drifted leaves and litter in the pans.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) oilStain(b, rng, P, CX + side * (PARK + 56 + rng.int(-14, 14)), rng.int(0, H - 1), rng.int(26, 44));
    gutterDrift(b, rng, P, side < 0 ? 2 : CX + PAN + 2, side < 0 ? CX - PAN - 2 : W - 2, side, variant);
  }
  if (variant === 2) drainGrate(b, P, W - 37, 380, 34, 26);
  if (variant === 1) drainGrate(b, P, 3, 150, 34, 26);

  // (f) Contact: the kerb's shadow lies on the pan (a hard line at its foot, one softer step, dashed).
  b.contact(0, 0, H, 'right', { dt: -2, depth: 5, line: 2, seed });
  b.contact(W - 1, 0, H, 'left', { dt: -2, depth: 3, line: 1, seed: seed + 1 });
}

/** The double yellow and the parking lines, worn: ragged edges, chips, whole stretches scuffed down to a ghost. */
function roadPaint(b: Brush2, P: Z1GroundRamps, seed: number, CX: number, variant: number) {
  const H = b.h;
  const line = (x0: number, wdt: number, ramp: number, wearSeed: number, wear: number, on: (y: number) => boolean) => {
    const wf = wobbler(wearSeed, H, 2);
    const wg = wobbler(wearSeed + 1, H, 5);
    for (let y = 0; y < H; y++) {
      if (!on(y)) continue;
      // Wear along the line: a slow rise and fall (whole stretches gone), with quicker chips on top.
      const w = wf(y) * 0.6 + wg(y) * 0.4;
      const gone = w > 1 - wear * 1.6;
      const thin = w > 1 - wear * 2.4;
      for (let q = 0; q < wdt; q++) {
        const i = b.at(x0 + q, y);
        if (i < 0) continue;
        const edge = q === 0 || q === wdt - 1;
        if (gone) {
          // A ghost: the paint's stain left in the asphalt, as broken strokes.
          if (!edge && dashAt(y + q * 5, wearSeed + q, 2, 5, 3, 7)) b.shift(x0 + q, y, 1);
          continue;
        }
        // Ragged edges, and chips eaten into thin paint.
        if (edge && dashAt(y, wearSeed + 3 + q, 2, 5, 3, 9)) continue;
        if (thin && hash2((x0 + q) >> 1, y >> 1, wearSeed) < 0.45) continue;
        b.R[i] = ramp;
        // The paint has a thickness: its left edge catches the light, its right edge is a step down.
        b.T[i] = q === 0 ? 4 : q === wdt - 1 ? 2 : 3;
      }
    }
  };
  // Double yellow: two 12 cm lines, 12 cm apart.
  line(CX - 12, 8, P.yellow, seed + 80, 0.3 + variant * 0.04, () => true);
  line(CX + 4, 8, P.yellow, seed + 82, 0.26 + variant * 0.05, () => true);
  // Parking lines: long dashes, far more worn (tyres cross them all day).
  for (const side of [-1, 1]) line(CX + side * PARK - 4, 8, P.white, seed + 84 + side, 0.42, (y) => (y + variant * 90 + (side > 0 ? 60 : 0)) % 256 < 150);
  // A bay tick toward the kerb, one a module.
  for (const side of [-1, 1]) {
    const y0 = [56, 230, 344][variant] + (side > 0 ? 100 : 0);
    const x0 = side < 0 ? CX - PAN + 6 : CX + PARK + 4;
    const x1 = side < 0 ? CX - PARK - 4 : CX + PAN - 6;
    for (let y = 0; y < 8; y++) {
      for (let x = x0; x < x1; x++) {
        if (hash2(x >> 2, (y0 + y) >> 1, seed + 5) < 0.4 || ((y === 0 || y === 7) && dashAt(x, seed + y, 2, 5, 2, 6))) continue;
        b.set(x, y0 + y, P.white, y === 0 ? 4 : y === 7 ? 2 : 3);
      }
    }
  }
}

/** An iron cover in its concrete collar: a cast pattern of studs, a lettered ring, lit upper-left rim, shadow at lower right. */
export function manhole(b: Brush2, rng: PwRng, P: Z1GroundRamps, cx: number, cy: number, r: number, word: string) {
  // The square patch of newer asphalt it was set in, with a tar seam.
  const pr = r + 12;
  for (let y = -pr; y <= pr; y++) {
    for (let x = -pr; x <= pr; x++) {
      const edge = Math.abs(x) >= pr - 1 || Math.abs(y) >= pr - 1;
      b.set(cx + x, cy + y, P.tar, edge ? 1 : 3);
    }
  }
  b.hrun(cx - pr, cy + pr + 1, pr * 2 + 1, 0, 1);
  // Collar.
  const cr = r + 5;
  for (let y = -cr; y <= cr; y++) {
    for (let x = -cr; x <= cr; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > cr) continue;
      b.set(cx + x, cy + y, P.conc, d > cr - 1.2 ? (x + y < 0 ? 4 : 1) : 3);
    }
  }
  // The lid.
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > r) continue;
      let t = 2;
      // Rim: a groove round the lid (dark upper-left inside, lit lower-right), then the raised ring.
      if (d > r - 1.5) t = x + y < 0 ? 0 : 3;
      else if (d > r - 4) t = x + y < 0 ? 4 : 2;
      else if (d > r - 5) t = 1;
      else {
        // Studs: 4-texel cells, each a lit upper-left pair and a dark lower-right one.
        const sx = (x + 64) & 3;
        const sy = (y + 64) & 3;
        t = sx < 2 && sy < 2 ? (sx === 0 && sy === 0 ? 4 : 3) : sx === 2 && sy === 2 ? 1 : 2;
        // A plain ring where the word is cast.
        if (Math.abs(d - r * 0.52) < 1.2) t = x + y < 0 ? 3 : 1;
      }
      b.set(cx + x, cy + y, P.iron, t);
    }
  }
  void word;
  // Two pick holes, rust bleeding from them down the fall of the road.
  for (const sx of [-1, 1]) {
    const hx = cx + sx * Math.round(r * 0.52);
    b.set(hx, cy, P.iron, 0);
    b.set(hx + 1, cy, P.iron, 0);
    b.set(hx, cy + 1, P.rust, 2);
    b.set(hx + 1, cy + 1, P.rust, 3);
  }
  b.drip(rng, cx + Math.round(r * 0.3), cy + r + 1, 14, { ramp: P.rust, dt: 0, width: 2, only: P.conc });
  // Cast shadow of the collar's lip on the patch.
  for (let a = 0; a < 40; a++) {
    const t = -0.4 + (a / 40) * 2.4;
    b.shift(Math.round(cx + Math.cos(t) * (cr + 1)), Math.round(cy + Math.sin(t) * (cr + 1)), -1, P.tar);
  }
}

/** A storm drain set in the gutter pan: a cast frame, slots with the dark drop under them, leaves caught on the bars. */
export function drainGrate(b: Brush2, P: Z1GroundRamps, x: number, y: number, w: number, h: number) {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const edge = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1;
      const frame = xx < 3 || yy < 3 || xx >= w - 3 || yy >= h - 3;
      let t = 3;
      if (edge) t = xx === 0 || yy === 0 ? 4 : 1;
      else if (!frame) {
        // Slots across the flow: 2 texels of drop, 2 of bar (lit on top).
        const s = (yy - 3) % 4;
        t = s < 2 ? 0 : s === 2 ? 4 : 2;
        if ((xx - 3) % 9 === 8) t = 3;
      }
      b.set(x + xx, y + yy, P.iron, t);
    }
  }
  // Cast shadow, and the wet dark fan where water runs in from up the street.
  b.hrun(x + 1, y + h, w, 0, -1);
  b.vrun(x + w, y + 1, h, 0, -1);
  for (let i = 0; i < 5; i++) b.vrun(x + 4 + i * 6, y - 9 + (i % 2) * 3, 8 - (i % 2) * 3, 0, -1);
}

/** Alligator cracking over a w × h area at (x, y): plates 9…14 texels across, drawn plate by plate. */
function alligator(b: Brush2, rng: PwRng, x: number, y: number, w: number, h: number, seed: number) {
  // Jittered plate centres; a texel belongs to the nearest one. Where its lower / right neighbour belongs to
  // another plate it is the crack (dark); where its upper / left one does, the plate's lit edge.
  const cw = 11;
  const cols = Math.ceil(w / cw) + 2;
  const rows = Math.ceil(h / cw) + 2;
  const px = new Float32Array(cols * rows);
  const py = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      px[j * cols + i] = (i - 0.5 + (hash2(i, j, seed) - 0.5) * 0.9) * cw;
      py[j * cols + i] = (j - 0.5 + (hash2(i, j, seed + 1) - 0.5) * 0.9) * cw;
    }
  }
  const id = new Int16Array(w * h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      // The area's own ragged outline: plates only inside a lobed shape.
      const u = (xx - w / 2) / (w / 2);
      const v = (yy - h / 2) / (h / 2);
      if (u * u + v * v > 0.8 + 0.25 * Math.sin(xx * 0.21 + seed) * Math.cos(yy * 0.13)) {
        id[yy * w + xx] = -1;
        continue;
      }
      const gi = Math.floor(xx / cw) + 1;
      const gj = Math.floor(yy / cw) + 1;
      let best = 0;
      let bd = 1e9;
      for (let j = gj - 1; j <= gj + 1; j++) {
        for (let i = gi - 1; i <= gi + 1; i++) {
          if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
          const d = (xx - px[j * cols + i]) ** 2 + (yy - py[j * cols + i]) ** 2;
          if (d < bd) {
            bd = d;
            best = j * cols + i;
          }
        }
      }
      id[yy * w + xx] = best;
    }
  }
  for (let yy = 0; yy < h - 1; yy++) {
    for (let xx = 0; xx < w - 1; xx++) {
      const a = id[yy * w + xx];
      if (a < 0) continue;
      const rgt = id[yy * w + xx + 1];
      const dn = id[(yy + 1) * w + xx];
      if ((rgt >= 0 && rgt !== a) || (dn >= 0 && dn !== a)) b.shift(x + xx, y + yy, -2);
      else if ((xx > 0 && id[yy * w + xx - 1] !== a && id[yy * w + xx - 1] >= 0) || (yy > 0 && id[(yy - 1) * w + xx] !== a && id[(yy - 1) * w + xx] >= 0)) b.shift(x + xx, y + yy, 1);
      // A few plates have sunk (a step darker) or lost their surface.
      else if (hash2(a, seed, 9) > 0.8) b.shift(x + xx, y + yy, -1);
    }
  }
  void rng;
}

/** A pothole: a lobed hole with a shadowed far wall, broken lumps on its floor, rain standing in its near half, a lit lip. */
export function pothole(b: Brush2, rng: PwRng, P: Z1GroundRamps, cx: number, cy: number, w: number, h: number) {
  const s = blob(rng, w, h, 4, 0.6);
  const ox = Math.round(cx - w / 2);
  const oy = Math.round(cy - h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!s.m[y * w + x]) continue;
      // Depth from the far edge: wall (dark), then the floor, then water in the near half.
      let d = 0;
      while (d < 6 && y - d - 1 >= 0 && s.m[(y - d - 1) * w + x]) d++;
      const water = y > h * 0.45;
      if (d < 2) b.set(ox + x, oy + y, P.tar, d === 0 ? 0 : 1);
      else if (water) b.set(ox + x, oy + y, P.water, 2);
      else b.set(ox + x, oy + y, P.tar, 2);
    }
  }
  // The sky in the water (a few strokes), lumps on the dry floor.
  b.sheen(rng, ox + 3, oy + Math.round(h * 0.5), w - 6, Math.round(h * 0.4), 5, P.sky, 3, { min: 4, max: 9, only: (r) => r === P.water, drifts: 1 });
  for (let i = 0; i < 4; i++) b.bump(rng, ox + rng.int(4, w - 5), oy + rng.int(3, Math.max(4, Math.round(h * 0.4))), 3, { ramp: P.asph, tone: 3, only: P.tar });
  // Lit lip on the near / right edge, outside the hole; crumbs thrown out round it.
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = y < h && s.m[y * w + x] === 1;
      if (!inside && y > 0 && s.m[(y - 1) * w + x]) {
        b.shift(ox + x, oy + y, 1);
        b.shift(ox + x, oy + y + 1, 1);
      }
    }
  }
  for (let i = 0; i < 7; i++) b.bump(rng, cx + rng.spread(w * 0.75), cy + h * 0.5 + rng.range(2, 9), rng.int(2, 3), {});
}

/** Oil under a parked engine: a dark lobed stain, darker heart, a broken rainbow rim on its near side. */
export function oilStain(b: Brush2, rng: PwRng, P: Z1GroundRamps, cx: number, cy: number, size: number) {
  const w = size;
  const h = Math.round(size * rng.range(0.9, 1.5));
  const s = shore(rng, w, h, 1);
  const ox = Math.round(cx - w / 2);
  const oy = Math.round(cy - h / 2);
  const road = (r: number) => r === P.asph || r === P.dry || r === P.sky;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!s.m[y * w + x]) continue;
      const i = b.at(ox + x, oy + y);
      if (i < 0 || !road(b.R[i])) continue;
      const edgeDn = y + 1 >= h || !s.m[(y + 1) * w + x];
      const edgeRt = x + 1 >= w || !s.m[y * w + x + 1];
      const u = (x - w / 2) / (w / 2);
      const v = (y - h / 2) / (h / 2);
      b.R[i] = P.tar;
      b.T[i] = u * u + v * v < 0.2 ? 2 : 3;
      // The sheen: violet and teal, only along the near / right rim, in dashes.
      if ((edgeDn || edgeRt) && dashAt(x + y, cx, 2, 5, 1, 3)) {
        b.R[i] = (x + y) % 7 < 3 ? P.oilP : P.oilT;
        b.T[i] = 2;
      }
    }
  }
  // Drips trailing away from it.
  for (let i = 0; i < 4; i++) b.bump(rng, cx + rng.spread(w * 0.8), cy + rng.spread(h * 0.9), 3, { ramp: P.tar, tone: 3, lit: 0, cast: 0, only: P.asph });
}

/** What the rain has carried into a gutter pan: runs of water toward the drain, leaves, a pack, a can, a page stuck flat. */
function gutterDrift(b: Brush2, rng: PwRng, P: Z1GroundRamps, x0: number, x1: number, side: number, variant: number) {
  const H = b.h;
  const w = x1 - x0;
  // Running water: long bright strokes ALONG the kerb (the one place the sheen runs with the road), nearest the kerb.
  for (let i = 0; i < 26; i++) {
    const x = side < 0 ? x0 + rng.int(3, Math.round(w * 0.6)) : x1 - 1 - rng.int(3, Math.round(w * 0.6));
    const y = rng.int(0, H - 1);
    const len = rng.int(8, 30);
    for (let q = 0; q < len; q++) {
      b.tint(x, y + q, P.sky, q < 2 || q > len - 3 ? 0 : 1, P.conc);
      if (len > 18) b.tint(x + 1, y + q, P.sky, 0, P.conc);
    }
  }
  // Leaves: each a little pointed shape with a lit midrib, drifted into two or three heaps.
  const heaps = 2 + (variant % 2);
  for (let hh = 0; hh < heaps; hh++) {
    const hy = rng.int(0, H - 1);
    const n = rng.int(7, 13);
    for (let i = 0; i < n; i++) {
      const lx = side < 0 ? x0 + 1 + Math.abs(rng.spread(w * 0.7)) : x1 - 5 - Math.abs(rng.spread(w * 0.7));
      leaf(b, rng, rng.chance(0.3) ? P.leafRed : P.leaf, lx, hy + rng.spread(26));
    }
  }
  // Litter, each piece drawn: a cigarette pack, a crushed can, a page plastered flat.
  const ly = [150, 330, 40][variant] + (side > 0 ? 170 : 0);
  const lx = side < 0 ? x0 + 9 : x1 - 20;
  b.formRect(lx, ly, 7, 5, { raised: true, ramp: P.paper, tone: 4, cast: 1 });
  b.hrun(lx + 1, ly + 1, 5, P.rust, 3);
  const cx = side < 0 ? x0 + 20 : x1 - 14;
  const cy = ly + 120;
  b.formRect(cx, cy, 6, 9, { raised: true, ramp: P.iron, tone: 4, cast: 1 });
  b.vrun(cx + 2, cy + 1, 7, P.rust, 4);
  b.set(cx + 1, cy + 2, P.paper, 5);
  // The page: a skewed quad, creased, the print as grey bars, its lower edge lifting (a shadow line).
  const px = side < 0 ? x0 + 6 : x1 - 26;
  const py = ly + 250;
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 19; x++) {
      const sx = x + (y >> 2);
      if (hash2(x >> 1, y >> 1, variant + 3) < 0.07 && (x < 3 || y > 11)) continue;
      const print = y > 2 && y < 12 && y % 3 === 1 && x > 2 && x < 16 - (y % 5);
      b.set(px + sx, py + y, P.paper, print ? 2 : x === 9 ? 3 : y === 0 || x === 0 ? 5 : 4);
    }
  }
  b.hrun(px + 4, py + 15, 18, 0, -1);
}

/** One fallen leaf (5–7 texels): a pointed oval turned any way, a lit midrib, a dark underside edge. */
export function leaf(b: Brush2, rng: PwRng, ramp: number, x: number, y: number) {
  const s = LEAVES[Math.floor(rng.next() * LEAVES.length)];
  const flip = rng.chance(0.5);
  const tone = rng.chance(0.4) ? 4 : 3;
  for (let j = 0; j < s.length; j++) {
    const row = s[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[flip ? row.length - 1 - i : i];
      if (ch === '.') continue;
      b.set(Math.round(x) + i, Math.round(y) + j, ramp, ch === 'r' ? tone + 1 : ch === 'd' ? tone - 2 : tone);
    }
  }
}
const LEAVES: readonly (readonly string[])[] = [
  ['.xx...', 'xrxx..', '.xrxx.', '..xrxd', '...ddd'],
  ['..xx.', '.xrx.', 'xxrxd', '.xrdd', '..d..'],
  ['x.....', 'xxxx..', '.rrrxx', '.xxxdd', '...dd.'],
  ['.xxx', 'xrxd', 'xrxd', '.xd.'],
];

// ─── Walks and kerbs ─────────────────────────────────────────────────────────

/** Walk module: 3.5 m (kerb to wall) × 8 m along, at 64 texels a metre. */
export const Z1_WALK_W = 224;
export const Z1_WALK_H = 512;
/** Kerbstone width on the walk module (texels) and kerbstone length (joints line up with the face tile). */
const KERB_W = 12;
const KERB_LEN = 64;

/**
 * A walk, kerb to wall: granite kerbstones (the lit arris of the kerb FORM), then old flags laid
 * in courses across the walk — every course its own depth, two or three stones wide, each stone a
 * flat tone with a lit upper-left arris and an open joint in shadow at lower right — with what a
 * street does to them: a cast-concrete replacement, a cracked flag, a broken corner made good with
 * tar, a coal-hole cover, a cellar hatch, gum, a sprayed utility mark, rain lying in the dished
 * stones and running to the kerb, the damp mossy foot of the wall. `side` 0 = kerb on the left
 * (the east walk of a street heading north), 1 = kerb on the right; both are painted with the light
 * from the upper left (never one mirrored from the other).
 */
export function z1WalkTile(atlas: PwAtlas, side: 0 | 1): PwTile {
  return atlas.tile(`z1walk|${side}`, Z1_WALK_W, Z1_WALK_H, (c, k) => paintZ1Walk(c, k, side), { wrap: true, density: PW_TPM_MID });
}

/** Old flags in courses across a rectangle (depths from `courses`), each course cut into two to four stones. */
export function flagCourses(b: Brush2, rng: PwRng, P: Z1GroundRamps, x0: number, y0: number, w: number, h: number, seed: number, minW = 60): { x: number; y: number; w: number; h: number; ramp: number }[] {
  const R = b.R;
  const T = b.T;
  const W = b.w;
  const out: { x: number; y: number; w: number; h: number; ramp: number }[] = [];
  const stones = [P.flag, P.blue, P.flag, P.cast];
  let y = 0;
  let ci = 0;
  while (y < h) {
    let ch = [36, 46, 32, 52, 40][(ci + seed) % 5];
    if (h - y - ch < 26) ch = h - y;
    let x = 0;
    let si = 0;
    while (x < w) {
      let sw = minW + Math.floor(hash2(ci, si, seed) * minW * 0.9);
      if (w - x - sw < minW * 0.6) sw = w - x;
      const hr = hash2(ci, si, seed + 7);
      const ramp = stones[Math.floor(hr * stones.length)];
      // (A lighter stone only now and then: paving is the floor the horde is read against.)
      const tone = hash2(ci, si, seed + 9) > 0.93 ? 4 : 3;
      for (let yy = 0; yy < ch; yy++) {
        for (let xx = 0; xx < sw; xx++) {
          const k = (y0 + y + yy) * W + x0 + x + xx;
          if (xx >= sw - 2 || yy >= ch - 2) {
            R[k] = P.concDark;
            T[k] = xx === sw - 1 || yy === ch - 1 ? 1 : 0;
          } else {
            R[k] = ramp;
            T[k] = xx === 0 || yy === 0 ? tone + 1 : tone;
          }
        }
      }
      out.push({ x: x0 + x, y: y0 + y, w: sw - 2, h: ch - 2, ramp });
      x += sw;
      si++;
    }
    y += ch;
    ci++;
  }
  void rng;
  return out;
}

/**
 * What weather and feet do to a flag, drawn inside its own joints: the rain on it as a short ladder
 * of strokes (the sky's blue on a wet stone, the stone's own lighter tone on a damp one), dirt
 * packed in a corner or two (stepped), bites out of its lit arris, now and then a crack from edge
 * to edge or a spalled patch. No blotches: a flag is flat, what varies is drawn.
 */
export function wearFlags(b: Brush2, rng: PwRng, P: Z1GroundRamps, flags: { x: number; y: number; w: number; h: number; ramp: number }[], o: { cracks?: number; wet?: number } = {}) {
  let cracks = o.cracks ?? 2;
  const wetP = o.wet ?? 0.4;
  for (const s of flags) {
    // Rain: one or two ladders, clipped to the stone.
    const nl = s.w > 70 ? 2 : 1;
    for (let q = 0; q < nl; q++) {
      if (!rng.chance(0.75)) continue;
      const wet = rng.chance(wetP);
      const lx = s.x + Math.round(s.w * ((q + 0.25 + rng.next() * 0.5) / nl));
      const top = s.y + rng.int(3, Math.max(4, Math.round(s.h * 0.3)));
      const len = Math.round((s.y + s.h - 3 - top) * rng.range(0.6, 1));
      const width = Math.min(Math.round(s.w / nl) - 8, rng.int(10, 26));
      let k = 0;
      let cx = lx;
      while (k < len - 1) {
        const wd = Math.max(4, Math.round(width * (0.5 + rng.next() * 0.5)));
        cx += rng.int(-1, 1);
        if (!rng.chance(0.2)) {
          for (let j = 0; j < 2; j++) {
            for (let p = 0; p < wd; p++) {
              const px = cx - (wd >> 1) + p;
              if (px <= s.x + 1 || px >= s.x + s.w - 2) continue;
              const i = b.at(px, top + k + j);
              if (i < 0 || b.R[i] !== s.ramp) continue;
              const tip = p === 0 || p === wd - 1;
              if (wet) {
                b.R[i] = P.sky;
                b.T[i] = tip ? 1 : 2;
              } else if (!tip) b.T[i] = Math.min(5, b.T[i] + 1);
            }
          }
        }
        k += 2 + 2 * rng.int(1, 3);
      }
    }
    for (const [cxk, cyk] of [
      [0, 1],
      [1, 1],
      [1, 0],
    ]) {
      if (rng.chance(0.55)) continue;
      const r = rng.int(5, 10);
      for (let y = 0; y < r; y++) for (let x = 0; x < r - y; x++) b.shift(cxk ? s.x + s.w - 1 - x : s.x + 1 + x, cyk ? s.y + s.h - 1 - y : s.y + 1 + y, -1, s.ramp);
    }
    // The stone's own bedding: one or two fine veins along it, a texel thick, a step darker or lighter.
    for (let i = 0; i < (s.w > 60 ? 2 : 1); i++) {
      if (rng.chance(0.35)) continue;
      const len = rng.int(10, Math.max(11, Math.min(34, s.w - 10)));
      const vx = s.x + rng.int(3, Math.max(4, s.w - len - 3));
      let vy = s.y + rng.int(4, Math.max(5, s.h - 5));
      const dt = rng.chance(0.6) ? -1 : 1;
      for (let p = 0; p < len; p++) {
        if (p % 7 === 6 && rng.chance(0.5)) vy += rng.chance(0.5) ? 1 : -1;
        if (vy > s.y + 1 && vy < s.y + s.h - 2) b.shift(vx + p, vy, dt, s.ramp);
      }
    }
    // Damp lying against the near joint: a broken darker line just inside the stone's near edge.
    for (let p = 2; p < s.w - 2; p++) if (dashAt(p, s.x + s.y, 4, 14, 2, 8)) b.shift(s.x + p, s.y + s.h - 1, -1, s.ramp);
    // Bites out of the lit arris (the far edge), each a short dark notch.
    for (let i = 0; i < Math.round(s.w / 40); i++) {
      const x = s.x + rng.int(3, Math.max(4, s.w - 8));
      const n = rng.int(2, 5);
      for (let p = 0; p < n; p++) b.shift(x + p, s.y, -2, s.ramp);
      if (n > 3) b.shift(x + 1, s.y + 1, -1, s.ramp);
    }
    if (cracks > 0 && s.w > 44 && rng.chance(0.18)) {
      cracks--;
      b.crack(rng, s.x + 2, s.y + rng.int(6, Math.max(7, s.h - 8)), s.w - 6, rng.spread(0.3), { dt: -2, lip: 1, branch: 0.03, fat: 0.4, only: s.ramp, wander: 0.6 });
    }
    if (rng.chance(0.3)) b.chip(rng, s.x + rng.int(6, Math.max(7, s.w - 7)), s.y + rng.int(5, Math.max(6, s.h - 6)), rng.int(4, 8), { depth: 2, only: s.ramp });
  }
}

export function paintZ1Walk(c: PwCanvas, k: PwKit, side: 0 | 1) {
  const W = c.w;
  const H = c.h;
  const R = c.ramp;
  const T = c.tone;
  const P = z1GroundRamps(k);
  const rng = k.rng;
  const b = new Brush2(c, { wrapY: true });
  const seed = 300 + side * 23;
  // Kerb-relative x: 0 at the kerb's road edge, growing toward the wall.
  const X = (kx: number) => (side ? W - 1 - kx : kx);
  const F0 = KERB_W + 2;
  const FW = W - F0 - 2;
  const fx0 = side ? 2 : F0;
  // Flags in courses across the walk, then what the street does to them.
  const flags = flagCourses(b, rng, P, fx0, 0, FW, H, seed, 46);
  wearFlags(b, rng, P, flags, { cracks: 3, wet: 0.45 });
  const stone = (r: number) => r === P.blue || r === P.flag || r === P.cast;
  // The kerb: granite stones 1 m long, paler than the flags; the arris toward the road is the lightest line
  // of the street's edge, the joint to the flags a dark groove.
  for (let y = 0; y < H; y++) {
    const ly = y % KERB_LEN;
    for (let kx = 0; kx < F0; kx++) {
      const i = y * W + X(kx);
      if (kx >= KERB_W) {
        R[i] = P.concDark;
        T[i] = kx === KERB_W ? 0 : 1;
        continue;
      }
      R[i] = P.kerb;
      // Joint between stones (two texels); the stone's top lit along its far edge.
      T[i] = ly >= KERB_LEN - 2 ? 1 : ly === 0 ? 4 : kx < 2 ? 4 : kx >= KERB_W - 2 ? 2 : 3;
    }
  }
  // The wall-side joint.
  for (let y = 0; y < H; y++) {
    for (let q = 0; q < 2; q++) {
      const i = y * W + X(W - 1 - q);
      R[i] = P.concDark;
      T[i] = 1;
    }
  }
  // Kerb wear: bites out of the arris, a stretch of old yellow paint, the stone's own grain.
  for (let i = 0; i < 9; i++) {
    const y = rng.int(0, H - 1);
    const n = rng.int(3, 7);
    for (let q = 0; q < n; q++) {
      b.set(X(0), y + q, P.kerb, 1);
      if (q > 0 && q < n - 1) b.set(X(1), y + q, P.kerb, 2);
    }
  }
  {
    const py = side ? 290 : 96;
    for (let y = 0; y < 132; y++) {
      for (let kx = 0; kx < KERB_W - 1; kx++) {
        const i = b.at(X(kx), py + y);
        // (Flaked off in lobes, its ends frayed.)
        if (T[i] <= 1 || hash2(kx >> 2, (py + y) >> 3, seed + 5) < 0.3 || ((y < 3 || y > 128) && dashAt(kx, y, 1, 3, 1, 2))) continue;
        R[i] = P.yellow;
        T[i] = Math.max(2, T[i] - 1);
      }
    }
  }
  b.aggregate(rng, Math.min(X(2), X(KERB_W - 3)), 0, KERB_W - 4, H, 60, { drifts: 12, up: -1, down: 1, only: P.kerb });

  // A corner broken off one flag and made good with tar.
  {
    const s = flags[side ? 9 : 3];
    const r = 17;
    for (let y = 0; y < r; y++) {
      for (let x = 0; x < r - y + (y & 1); x++) {
        const edge = x >= r - y - 2;
        b.set(s.x + x, s.y + y, P.tar, edge ? 0 : y < 2 || x < 2 ? 1 : 2);
      }
    }
  }
  // Dressing. A coal-hole cover let into a flag; a cellar hatch by the wall; gum; a sprayed utility mark.
  {
    const s = flags.find((f, i) => i > (side ? 4 : 12) && f.w > 40 && f.h > 34) ?? flags[0];
    coalHole(b, P, s.x + Math.round(s.w * 0.5), s.y + Math.round(s.h * 0.5), 13);
  }
  cellarHatch(b, rng, P, side ? 3 : W - 3 - 62, side ? 150 : 372, 62, 76);
  for (let i = 0; i < 18; i++) {
    const gx = fx0 + rng.int(6, FW - 10);
    const gy = rng.int(0, H - 1);
    if (!stone(b.rampAt(gx, gy)) || !stone(b.rampAt(gx + 3, gy + 2))) continue;
    b.bump(rng, gx, gy, rng.chance(0.3) ? 4 : 3, { ramp: P.tar, tone: rng.chance(0.5) ? 2 : 3, lit: 1, dark: 1, cast: 0 });
  }
  {
    // Utility mark: a sprayed arrow and a letter, half worn off.
    const ux = fx0 + (side ? 60 : 96);
    const uy = side ? 40 : 250;
    const mark = ['..x.....xxx.', '.xx....x...x', 'xxxxxx.x...x', '.xx....x.xxx', '..x....x...x', '........xxx.'];
    for (let j = 0; j < mark.length; j++) {
      for (let i = 0; i < 12; i++) {
        if (mark[j][i] !== 'x') continue;
        for (let q = 0; q < 4; q++) {
          const px = ux + i * 2 + (q & 1);
          const py = uy + j * 2 + (q >> 1);
          if (hash2(px >> 2, py >> 1, seed) < 0.25) continue;
          if (stone(b.rampAt(px, py))) b.tint(px, py, P.rust, 1);
        }
      }
    }
  }
  // Water running to the kerb: long strokes ALONG the fall in the joint behind the kerbstones, moss in it.
  for (let i = 0; i < 14; i++) {
    const y = rng.int(0, H - 1);
    const n = rng.int(2, 6);
    for (let q = 0; q < n; q++) b.set(X(KERB_W + (q & 1)), y + q, P.moss, q === 1 ? 4 : 2);
  }
  // The foot of the wall: damp (a step down, hand-wobbled, dashed), moss in the joint, leaves blown against it.
  b.band(side ? 0 : W - 20, 0, 20, H, side ? 'left' : 'right', { dt: -1, steps: 1, wob: 3, seed, reach: 0.7 });
  for (let i = 0; i < 26; i++) {
    const y = rng.int(0, H - 1);
    const n = rng.int(3, 9);
    for (let q = 0; q < n; q++) {
      b.set(X(W - 1), y + q, P.moss, q % 3 === 1 ? 4 : 3);
      if (rng.chance(0.5)) b.set(X(W - 2), y + q, P.moss, 2);
    }
  }
  for (let i = 0; i < 9; i++) leaf(b, rng, rng.chance(0.4) ? P.leafRed : P.leaf, (side ? 2 : W - 9) + rng.int(-1, 5) * (side ? 1 : -1), rng.int(0, H - 1));
  b.contact(side ? 0 : W - 1, 0, H, side ? 'right' : 'left', { dt: -2, depth: 4, line: 2, seed: seed + 3 });
}

/** A cast-iron coal-hole cover: a disc of raised concentric rings and a star of ribs, its rim lit upper left. */
function coalHole(b: Brush2, P: Z1GroundRamps, cx: number, cy: number, r: number) {
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > r + 1) continue;
      let t: number;
      if (d > r) t = x + y < 0 ? 0 : 4; // the groove round it: shadow on the upper left, the stone's lit edge lower right
      else if (d > r - 2) t = x + y < 0 ? 4 : 2;
      else {
        const a = Math.atan2(y, x);
        const rib = Math.abs(Math.sin(a * 4)) < 0.28;
        const ring = Math.abs(d - r * 0.5) < 1;
        t = rib || ring ? 3 : 1;
        if (d < 2.2) t = 4;
      }
      if (d > r) b.shift(cx + x, cy + y, t === 0 ? -2 : 1);
      else b.set(cx + x, cy + y, P.iron, t);
    }
  }
}

/** A steel cellar hatch flush in the walk: two diamond-plate leaves in an angle frame, hinges, a hasp, rust at the low edge. */
function cellarHatch(b: Brush2, rng: PwRng, P: Z1GroundRamps, x: number, y: number, w: number, h: number) {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const edge = xx < 2 || yy < 2 || xx >= w - 2 || yy >= h - 2;
      let t: number;
      if (edge) t = xx < 2 || yy < 2 ? (xx === 0 || yy === 0 ? 4 : 3) : xx === w - 1 || yy === h - 1 ? 0 : 1;
      else {
        // Diamond plate: short raised dashes in two directions on a 6-texel lattice, each lit on top.
        const cxk = Math.floor((xx - 2) / 6);
        const cyk = Math.floor((yy - 2) / 6);
        const lx = (xx - 2) % 6;
        const ly = (yy - 2) % 6;
        const diag = (cxk + cyk) % 2 === 0 ? lx - ly : lx + ly - 5;
        t = Math.abs(diag) === 0 && lx > 0 && lx < 5 ? 4 : diag === 1 && lx > 0 && lx < 5 ? 1 : 2;
        // The gap between the two leaves.
        const mid = w >> 1;
        if (xx === mid - 1) t = 0;
        else if (xx === mid) t = 4;
      }
      b.set(x + xx, y + yy, P.iron, t);
    }
  }
  // Hinges on both long sides, a hasp across the gap.
  for (const hy of [10, h - 16]) {
    for (const hx of [3, w - 11]) b.formRect(x + hx, y + hy, 8, 5, { raised: true, ramp: P.iron, tone: 3, cast: 1 });
  }
  b.formRect(x + (w >> 1) - 4, y + (h >> 1) - 3, 8, 6, { raised: true, ramp: P.rust, tone: 4, cast: 1 });
  // Rust creeping in from the lower edge, a wet trail leaving it.
  for (let i = 0; i < 12; i++) {
    const rx = x + rng.int(3, w - 5);
    const n = rng.int(2, 9);
    for (let q = 0; q < n; q++) b.tint(rx, y + h - 3 - q, P.rust, 0, P.iron);
  }
  b.hrun(x + 1, y + h, w, 0, -1);
  b.vrun(x + w, y + 1, h, 0, -1);
}

/**
 * The kerb's face (wrap strip, 8 m × 0.5 m of which the bottom 14 cm show): granite in the kerb's own
 * shadow — a step under its top — with the gutter line at its foot, a joint every metre in line with the
 * kerbstones of the walk module, damp runs under the joints, moss where water stands, old yellow paint.
 */
export function z1KerbFaceTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z1kerbface', 512, 32, (c, k) => {
    const P = z1GroundRamps(k);
    const rng = k.rng;
    const b = new Brush2(c, { wrapX: true });
    const H = c.h;
    // Rows from the foot: 0–1 the gutter line, 2–7 the face, 8 the arris just under the top.
    c.rect(0, 0, c.w, H, P.kerb, (_x, y) => {
      const v = H - 1 - y;
      return v < 1 ? 0 : v < 2 ? 1 : v >= 8 ? 3 : 2;
    });
    for (let x = 0; x < c.w; x += KERB_LEN) {
      // (Joints two texels wide; the walk's kerbstones end on the same lines.)
      c.rect(x + KERB_LEN - 2, 0, 2, H, P.kerb, 0);
      b.drip(rng, x + KERB_LEN - 3, H - 8, 6, { dt: -1, width: 2 });
    }
    // Yellow paint over two metres, flaking.
    for (let x = 96; x < 228; x++) {
      for (let y = H - 9; y < H - 1; y++) {
        if (c.toneAt(x, y) < 1 || hash2(x >> 1, y >> 1, 12) < 0.4) continue;
        c.set(x, y, P.yellow, y === H - 9 ? 3 : 2);
      }
    }
    // Moss at the foot, chips out of the arris.
    for (let i = 0; i < 22; i++) {
      const x = rng.int(0, c.w - 6);
      const n = rng.int(2, 6);
      for (let q = 0; q < n; q++) b.set(x + q, H - 2 - (q % 2 && rng.chance(0.5) ? 1 : 0), P.moss, rng.chance(0.5) ? 3 : 2);
    }
    for (let i = 0; i < 10; i++) {
      const x = rng.int(0, c.w - 4);
      const n = rng.int(2, 4);
      for (let q = 0; q < n; q++) b.set(x + q, H - 9, P.kerb, 1);
    }
  }, { wrap: true, density: PW_TPM_MID });
}

// ─── The junction, crosswalks, the cross street's margins ────────────────────

/** Junction core: Main Street's 12 m × the cross street's 14 m, at 64 texels a metre (north up). */
export const Z1_JUNCTION_W = 768;
export const Z1_JUNCTION_H = 896;

/**
 * The intersection of Main Street and the cross street, one unique painting: both streets'
 * wheel paths running on through it as a plaid of wet sheets, the dark arcs tyres leave turning
 * the corners, the old streetcar rails still showing in the cross street where the tar has worn
 * off them (two steel lines in a strip of setts), a telephone vault lid, a cover, saw-cut joints
 * where each street's paving ends, a concrete apron and a drain in every corner. This is the floor
 * the crawlers rise from: everything between the corners stays within the body's three tones.
 */
export function z1JunctionTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z1junction', Z1_JUNCTION_W, Z1_JUNCTION_H, paintZ1Junction, { density: PW_TPM_MID });
}

function paintZ1Junction(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const P = z1GroundRamps(k);
  const rng = k.rng;
  const b = new Brush2(c);
  const CX = W / 2;
  const CY = H / 2;
  const seed = 500;
  const wet = paintAsphalt(b, rng, P, seed, {
    x0: 0,
    x1: W,
    dry: [],
    tracksV: [CX - TRACK_OUT, CX - TRACK_IN, CX + TRACK_IN, CX + TRACK_OUT],
    tracksH: [CY - TRACK_OUT, CY - TRACK_IN, CY + TRACK_IN, CY + TRACK_OUT],
    sheets: 4,
  });
  // The streetcar line down the cross street: two rails 1.435 m apart in a strip of granite setts, tarred
  // over long ago; the tar has worn through in stretches and the steel shows.
  for (const ry of [CY - 46, CY + 46]) {
    // Where the strip shows: a few long lobes along the rail (ragged windows worn in the tar), not a ruled band.
    const open = new Uint8Array(W * 22);
    let x = rng.int(10, 60);
    while (x < W - 60) {
      const len = rng.int(70, 170);
      const win = blob(rng, len, 20, Math.max(3, Math.round(len / 34)), 0.45, 1);
      for (let yy = 0; yy < 20; yy++) for (let xx = 0; xx < len; xx++) if (win.m[yy * len + xx] && x + xx < W) open[(yy + 1) * W + x + xx] = 1;
      x += len + rng.int(30, 110);
    }
    for (let xx = 0; xx < W; xx++) {
      for (let q = -10; q <= 10; q++) {
        const i = b.at(xx, ry + q);
        if (i < 0 || !open[(q + 11) * W + xx]) continue;
        const aq = Math.abs(q);
        // The rail itself is drawn below; either side of it two courses of setts, dark and wet as the road.
        if (aq <= 1) continue;
        const course = aq < 6 ? 0 : 1;
        const joint = (xx + course * 5) % 11 >= 9 || aq === 5 || aq === 9 || aq === 10;
        b.R[i] = joint ? P.tar : P.blue;
        b.T[i] = joint ? 1 : (xx + course * 5) % 11 === 0 || aq === 2 || aq === 6 ? 3 : 2;
        wet[i] = 0;
      }
      // The broken edge of the tar round each window has a thickness: dark on its far side, lit on its near one.
      for (let q = -10; q <= 10; q++) {
        const o0 = open[(q + 11) * W + xx];
        const o1 = open[(q + 12) * W + xx];
        if (o0 && !o1) b.shift(xx, ry + q + 1, 1);
        else if (!o0 && o1) b.shift(xx, ry + q, -1);
      }
      const shown = open[11 * W + xx] === 1;
      b.set(xx, ry - 1, P.iron, shown ? 4 : 3);
      b.set(xx, ry, P.iron, shown ? 3 : 2);
      b.set(xx, ry + 1, P.tar, 0);
      if (!shown && dashAt(xx, seed + ry, 3, 8, 3, 9)) b.shift(xx, ry + 2, 1);
    }
  }
  // Turning marks: the dark double arcs of tyres cutting each corner (rubber on wet tar: one step down, broken).
  for (const [ox, oy] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ]) {
    for (const r of [150, 196, 318, 366]) {
      const n = Math.round(r * 1.7);
      for (let s = 0; s < n; s++) {
        const a = (s / n) * (Math.PI / 2);
        const x = ox + (ox ? -1 : 1) * Math.cos(a) * r;
        const y = oy + (oy ? -1 : 1) * Math.sin(a) * r * 1.12;
        if (!dashAt(s, r + ox + oy, 14, 46, 6, 30)) continue;
        for (let q = 0; q < 4; q++) {
          const i = b.at(x + q, y);
          if (i >= 0 && (b.R[i] === P.asph || b.R[i] === P.dry)) b.T[i] = Math.max(2, b.T[i] - 1);
        }
      }
    }
  }
  // Saw-cut joints where the streets' paving ends (the modules beside this one stop on these lines).
  for (const y of [1, H - 3]) b.groove([0, y, W - 1, y], { ramp: P.tar, tone: 1, lip: 1, width: 2 });
  for (const x of [1, W - 3]) b.groove([x, 0, x, H - 1], { ramp: P.tar, tone: 1, lip: 1, width: 2 });
  // Corners: a concrete apron under each kerb return, a drain in two of them, leaves and litter washed in.
  for (const [sx, sy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const aw = 40;
    const ah = 74;
    const x0 = sx ? W - aw : 0;
    const y0 = sy ? H - ah : 0;
    for (let y = 0; y < ah; y++) {
      for (let x = 0; x < aw; x++) {
        // Rounded toward the junction.
        const u = sx ? x : aw - 1 - x;
        const v = sy ? y : ah - 1 - y;
        if (u < 12 && v < 12 && (12 - u) ** 2 + (12 - v) ** 2 > 150) continue;
        const i = (y0 + y) * W + x0 + x;
        const edge = u === 0 || v === 0;
        b.R[i] = edge ? P.tar : P.conc;
        b.T[i] = edge ? 1 : 3;
        wet[i] = 0;
      }
    }
    b.band(x0, y0, aw, ah, sx ? 'right' : 'left', { dt: -1, steps: 1, reach: 0.4, wob: 2, seed: seed + sx * 2 + sy, only: P.conc });
    if (sx === sy) drainGrate(b, P, sx ? W - 37 : 4, sy ? H - 44 : 14, 32, 26);
    for (let i = 0; i < 8; i++) leaf(b, rng, rng.chance(0.4) ? P.leafRed : P.leaf, x0 + rng.int(3, aw - 9), y0 + rng.int(4, ah - 8));
  }
  // A telephone vault lid (a cast rectangle in two leaves) and a cover, off the wheel paths.
  {
    const vx = CX + 196;
    const vy = CY + 150;
    b.formRect(vx - 2, vy - 2, 60, 44, { raised: false, ramp: P.conc, tone: 3, dark: 1, lit: 1 });
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 56; x++) {
        const lx = x % 28;
        const edge = lx === 0 || y === 0 ? 4 : lx === 27 || y === 39 ? 1 : (lx + y) % 5 === 0 ? 3 : 2;
        b.set(vx + x, vy + y, P.iron, edge);
      }
    }
    b.hrun(vx - 2, vy + 42, 62, 0, -1);
  }
  manhole(b, rng, P, CX - 150, CY - 170, 20, 'SEWER');
  // Wear: cracks radiating from the lids, long ones across the lanes, an alligator patch, a pothole.
  for (let i = 0; i < 12; i++) b.crack(rng, rng.int(40, W - 40), rng.int(90, H - 90), rng.int(50, 140), rng.next() * 6.28, { dt: -2, lip: 1, branch: 0.03, fat: 0.3, wander: 0.7 });
  alligator(b, rng, CX + 30, CY + 250, 90, 110, seed + 9);
  pothole(b, rng, P, CX - 60, CY + 96, 38, 22);
  for (let i = 0; i < 3; i++) oilStain(b, rng, P, rng.int(120, W - 120), rng.int(120, H - 120), rng.int(22, 36));
}

/** Crosswalk overlay: 12 m across × 4 m (cut-out bars 0.55 m wide, a stop line on the approach side at the bottom). */
export const Z1_CROSSWALK_W = 768;
export const Z1_CROSSWALK_H = 256;

/**
 * A zebra crossing as paint ON the road (a cut-out laid a few millimetres over it): eleven bars
 * and a stop line, worn the way crossings wear — scrubbed to streaks along the traffic in the four
 * wheel paths, nearly whole between them, ragged at the ends, chipped in small clusters, the road's
 * cracks running on through. Tone 3 with tone-4 remnants (this is the enemies' floor: nothing white).
 */
export function z1CrosswalkTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z1crosswalk', Z1_CROSSWALK_W, Z1_CROSSWALK_H, (c, k) => {
    const P = z1GroundRamps(k);
    const rng = k.rng;
    const b = new Brush2(c);
    const W = c.w;
    const H = c.h;
    const BAR0 = 6;
    const BAR1 = 198;
    const paint = k.ramp(0x82848c, { light: 0.24, sat: 0.6, dark: 0.45 });
    const tracks = [-TRACK_OUT, -TRACK_IN, TRACK_IN, TRACK_OUT].map((t) => W / 2 + t);
    /** 1 inside a wheel path, falling to 0 over the 8 texels beside it. */
    const wheel = (x: number) => tracks.reduce((m, t) => Math.max(m, Math.min(1, (TRACK_HALF + 8 - Math.abs(x - t)) / 8)), 0);
    const clear = (x: number, y: number) => {
      if (c.at(x, y) === paint) c.ramp[y * W + x] = 0;
    };
    const lay = (x0: number, y0: number, bw: number, bh: number) => {
      c.rect(x0, y0, bw, bh, paint, 3);
      // Tyres scrub the paint into streaks along the traffic, asphalt between them; a streak left standing is broken along its length.
      let gap = false;
      for (let x = x0; x < x0 + bw; ) {
        const sw = rng.int(2, 4);
        const w = wheel(x + sw / 2);
        gap = w > 0.15 && !gap && rng.next() < 0.45 + 0.35 * w;
        const adv = gap ? rng.int(1, 3) : sw;
        if (gap) {
          for (let y = y0; y < y0 + bh; y++) for (let q = 0; q < adv; q++) clear(x + q, y);
        } else if (w > 0.15) {
          for (let y = y0 + rng.int(0, 10); y < y0 + bh; ) {
            const on = rng.int(12, 44);
            const off = Math.round(rng.int(8, 22) * w);
            for (let yy = y + on; yy < Math.min(y + on + off, y0 + bh); yy++) for (let q = 0; q < sw; q++) clear(x + q, yy);
            y += on + off;
          }
        }
        x += adv;
      }
      // The ends ragged over 3–4 texels in bites 2–5 wide, the long edges nibbled less.
      for (let x = x0; x < x0 + bw; ) {
        const g = rng.int(2, 5);
        const a = rng.int(0, 4);
        const d = rng.int(0, 4);
        for (let q = 0; q < g; q++) {
          for (let j = 0; j < a; j++) clear(x + q, y0 + j);
          for (let j = 0; j < d; j++) clear(x + q, y0 + bh - 1 - j);
        }
        x += g;
      }
      for (let y = y0; y < y0 + bh; ) {
        const g = rng.int(3, 9);
        const a = rng.int(0, 2);
        const d = rng.int(0, 2);
        for (let q = 0; q < g; q++) {
          for (let j = 0; j < a; j++) clear(x0 + j, y + q);
          for (let j = 0; j < d; j++) clear(x0 + bw - 1 - j, y + q);
        }
        y += g;
      }
      // Chips in small clusters, 2–5 texels each; none may open a hole wider than 6.
      const clusters = Math.round((bw * bh) / 420);
      for (let n = 0; n < clusters; n++) {
        const cx = x0 + rng.int(0, bw - 1);
        const cy = y0 + rng.int(0, bh - 1);
        if (wheel(cx) > 0.6) continue;
        for (let q = rng.int(3, 6); q > 0; q--) {
          const cw = rng.int(2, 5);
          const ch = rng.int(2, 5);
          const ax = cx + rng.int(-6, 6);
          const ay = cy + rng.int(-8, 8);
          let room = true;
          for (let y = ay; y < ay + ch && room; y++) {
            let run = cw;
            for (let x = ax - 1; x >= x0 && c.at(x, y) !== paint; x--) run++;
            for (let x = ax + cw; x < x0 + bw && c.at(x, y) !== paint; x++) run++;
            if (run > 6) room = false;
          }
          if (!room) continue;
          for (let y = ay; y < ay + ch; y++) {
            for (let x = ax; x < ax + cw; x++) {
              if (cw > 2 && ch > 2 && (x === ax || x === ax + cw - 1) && (y === ay || y === ay + ch - 1)) continue;
              clear(x, y);
            }
          }
        }
      }
      // Where the paint has held: thin runs along the traffic, a step brighter.
      for (let n = Math.max(1, Math.round((bw * bh) / 2400)); n > 0; n--) {
        const mw = rng.int(3, 7);
        const mh = rng.int(14, Math.min(60, bh - 2));
        const m = blob(rng, mw, mh, 3, 0.6);
        const ax = x0 + rng.int(0, bw - mw);
        const ay = y0 + rng.int(0, bh - mh);
        for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (m.m[y * mw + x] && c.at(ax + x, ay + y) === paint) c.tone[(ay + y) * W + ax + x] = 4;
      }
    };
    for (let bar = 0; bar < 11; bar++) lay(Math.round((0.6 + bar * 1.1 - 0.275) * 64), BAR0, 35, BAR1 - BAR0);
    // The stop line, 40 cm.
    lay(20, 226, W - 40, 26);
    // The wet lies down the wheel paths as it does on the road: where a sheet crosses the paint, the paint sinks a tone.
    const sheets: { sx: number; sy: number; sw: number; sh: number; m: Uint8Array }[] = [];
    for (const t of tracks) {
      for (let n = 0; n < 2; n++) {
        if (!rng.chance(0.7)) continue;
        const sw = rng.int(36, 64);
        const sh = rng.int(70, 130);
        const sx = Math.round(t - sw / 2 + rng.spread(10));
        const sy = BAR0 + rng.int(-6, BAR1 - BAR0 - sh + 6);
        const m = shore(rng, sw, sh, 0.8).m;
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (m[y * sw + x] && c.at(sx + x, sy + y) === paint) c.tone[(sy + y) * W + sx + x] = Math.max(1, c.tone[(sy + y) * W + sx + x] - 1);
        sheets.push({ sx, sy, sw, sh, m });
      }
    }
    // Every bar has a 1-texel edge of road dirt (a streak one texel wide keeps its tone, or it would vanish).
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (c.ramp[i] !== paint) continue;
        const l = c.ramp[i - 1] !== paint;
        const r = c.ramp[i + 1] !== paint;
        if ((l || r || c.ramp[i - W] !== paint || c.ramp[i + W] !== paint) && !(l && r)) c.tone[i] = Math.min(c.tone[i], 2);
      }
    }
    // Rungs of sky across the wet paint, two texels high.
    for (const s of sheets) {
      for (let ry = 4; ry < s.sh - 4; ry += rng.int(7, 12)) {
        const len = rng.int(6, 20);
        const ax = rng.int(2, Math.max(3, s.sw - len - 2));
        for (let q = 0; q < len; q++) {
          for (const rr of [ry, ry + 1]) {
            if (s.m[rr * s.sw + ax + q] && c.at(s.sx + ax + q, s.sy + rr) === paint) c.set(s.sx + ax + q, s.sy + rr, P.sky, q === 0 || q === len - 1 ? 3 : 4);
          }
        }
      }
    }
    // The road's cracks carried on through the paint, one texel, dark.
    for (let i = 0; i < 7; i++) b.crack(rng, rng.int(10, W - 320), rng.int(BAR0 + 12, BAR1 - 12), rng.int(200, 520), rng.spread(0.22), { ramp: P.tar, tone: 1, lip: 0, fat: 0, wander: 0.5, branch: 0.02 });
    for (let bar = 1; bar < 11; bar += 3) b.crack(rng, Math.round((0.6 + bar * 1.1 - 0.275) * 64) + rng.int(6, 28), BAR0 + rng.int(0, 60), rng.int(40, 120), Math.PI / 2 + rng.spread(0.3), { ramp: P.tar, tone: 1, lip: 0, fat: 0, wander: 0.5 });
  }, { density: PW_TPM_MID });
}

/**
 * The cross street's margin (wrap strip, 1 m × 8 m): the strip of old concrete between the
 * carriageway's kerb line and the buildings that front straight onto it — slabs with a joint every
 * 2 m, the damp foot of the wall along one edge, a drain channel along the other.
 */
export function z1MarginTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z1margin', 64, 512, (c, k) => {
    const P = z1GroundRamps(k);
    const rng = k.rng;
    const b = new Brush2(c, { wrapY: true });
    c.rect(0, 0, c.w, c.h, P.concDark, 3);
    // (u 0 = the wall, u 63 = the road.)
    for (let y = 0; y < c.h; y += 128) {
      b.groove([0, y + 60, c.w - 9, y + 60], { dt: -2, lip: 1, width: 2 });
      c.rect(8, y + 66, c.w - 20, 56, P.concDark, hash2(y, 3, 5) > 0.5 ? 3 : 4);
    }
    // Drain channel by the road: a dark slot between two lit lips, a grating every 4 m.
    c.rect(c.w - 8, 0, 8, c.h, P.conc, 3);
    c.rect(c.w - 6, 0, 3, c.h, P.tar, 0);
    c.rect(c.w - 3, 0, 1, c.h, P.conc, 4);
    for (let y = 30; y < c.h; y += 256) for (let q = 0; q < 40; q += 4) c.rect(c.w - 7, y + q, 5, 2, P.iron, 3);
    b.band(0, 0, 18, c.h, 'left', { dt: -1, steps: 1, wob: 2.5, seed: 77 });
    for (let i = 0; i < 12; i++) {
      const y = rng.int(0, c.h - 1);
      for (let q = 0; q < rng.int(3, 8); q++) b.set(0, y + q, P.moss, q % 3 === 1 ? 4 : 3);
    }
    b.sheen(rng, 10, 0, c.w - 22, c.h, 40, P.sky, 2, { min: 5, max: 12, drifts: 8, only: (r) => r === P.concDark });
    b.wearDrift(rng, 8, 0, c.w - 20, c.h, 14, { drifts: 4, only: P.concDark });
    b.contact(0, 0, c.h, 'right', { dt: -2, depth: 3, line: 1, seed: 78 });
  }, { wrap: true, density: PW_TPM_MID });
}

// ─── The alley ───────────────────────────────────────────────────────────────

/** Alley floor module: 7 m wall to wall × 12 m along, at 64 texels a metre. */
export const Z1_ALLEY_W = 448;
export const Z1_ALLEY_H = 768;

/**
 * The alley floor: granite setts in courses across it, a dished stone channel down the middle
 * with the rain running in it, and over the setts the remains of a tarmac skin — worn back to long
 * ragged islands along both walls, so the setts show wherever wheels and water went. Along each
 * wall a concrete margin gone green at the foot. Leaves, a soaked carton, paw prints across the
 * tar. The centre (where things drop from the fire escapes and rise from the ground) keeps to the
 * setts' middle tones.
 */
export function z1AlleyTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z1alleyfloor', Z1_ALLEY_W, Z1_ALLEY_H, paintZ1Alley, { wrap: true, density: PW_TPM_MID });
}

/** Granite setts over a rectangle, course by course (direct fills: this is most of several big modules). */
function setts(b: Brush2, P: Z1GroundRamps, x0: number, y0: number, w: number, h: number, seed: number, o: { sw?: number; sh?: number } = {}) {
  const SW = o.sw ?? 13;
  const SH = o.sh ?? 8;
  const R = b.R;
  const T = b.T;
  const W = b.w;
  const ramps = [P.flag, P.flag, P.blue, P.flag, P.blue];
  for (let y = y0; y < y0 + h; y++) {
    const cr = Math.floor((y - y0) / SH);
    const ly = (y - y0) % SH;
    // Each course starts at its own offset; setts run 11…15 texels (cut by hand).
    const off = Math.floor(hash2(cr, seed, 1) * SW);
    const row = y * W;
    let col = -1;
    let sx = x0 - off;
    let sw = SW;
    let ramp = P.flag;
    let tone = 3;
    for (let x = x0; x < x0 + w; x++) {
      while (x >= sx + sw || col < 0) {
        if (col >= 0) sx += sw;
        col++;
        sw = SW - 2 + Math.floor(hash2(col, cr, seed + 2) * 5);
        // Tone and stone change in runs of a few setts.
        const run = Math.floor((col + Math.floor(hash2(cr, 7, seed) * 5)) / 4);
        const hr = hash2(run, cr, seed + 3);
        ramp = ramps[Math.floor(hr * ramps.length)];
        tone = hr > 0.86 ? 4 : hr < 0.12 ? 2 : 3;
      }
      const lx = x - sx;
      const i = row + x;
      if (ly >= SH - 2 || lx >= sw - 2) {
        // (Joints a step under the stone, the open gap darker only along the near edge: calm at a distance.)
        R[i] = P.concDark;
        T[i] = ly === SH - 1 ? 1 : 2;
      } else {
        R[i] = ramp;
        // A sett is domed: lit along its far edge, its near right corner a step down.
        T[i] = ly === 0 && lx < sw - 3 ? tone + 1 : ly === SH - 3 && lx >= sw - 6 ? tone - 1 : tone;
      }
    }
  }
}

function paintZ1Alley(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const R = c.ramp;
  const T = c.tone;
  const P = z1GroundRamps(k);
  const rng = k.rng;
  const b = new Brush2(c, { wrapY: true });
  const CX = W / 2;
  const seed = 900;
  const M0 = 26; // concrete margins along both walls
  // (a) Setts wall to wall.
  setts(b, P, 0, 0, W, H, seed);
  // (b) The channel: three courses of long kerb-like stones laid ALONG the alley, dished (the middle one a step
  // down and wet), with a lit lip on its near side.
  for (let y = 0; y < H; y++) {
    const ly = y % 96;
    for (let q = -15; q < 15; q++) {
      const i = y * W + CX + q;
      const mid = q >= -5 && q < 5;
      const joint = ly >= 94 || q === -15 || q === -6 || q === 5 || q === 14;
      R[i] = joint ? P.concDark : mid ? P.blue : P.flag;
      T[i] = joint ? 1 : mid ? 2 : q === -14 || q === 6 || ly === 0 ? 4 : 3;
    }
  }
  // (c) The tarmac skin: islands along both walls and two across the alley, edges ragged, a step lower in
  // tone than the setts; its broken edge has a thickness (dark rim on its far / left side, lit on the near).
  const tar = new Uint8Array(W * H);
  const island = (x: number, y: number, w: number, h: number, lobes: number) => {
    // (One smoothing pass: the edge is broken into bites below anyway.)
    const bl = blob(rng, w, h, lobes, 0.55, 1);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (!bl.m[yy * w + xx]) continue;
        const i = b.at(x + xx, y + yy);
        if (i >= 0 && Math.abs(x + xx - CX) > 17) tar[i] = 1;
      }
    }
  };
  for (const side of [0, 1]) {
    let y = rng.int(0, 60);
    while (y < H - 40) {
      const h = rng.int(90, 260);
      const w = rng.int(70, 150);
      island(side ? W - M0 - w + rng.int(0, 20) : M0 - rng.int(0, 20), y, w, h, 6);
      y += h + rng.int(10, 90);
    }
  }
  island(60, 300, 330, 70, 7);
  island(90, 620, 280, 56, 6);
  // The skin breaks off in pieces: square bites two to four texels deep all along its edge.
  {
    const src = tar.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!src[i]) continue;
        const edge = !src[i - 1] || !src[i + 1] || !src[b.at(x, y - 1)] || !src[b.at(x, y + 1)];
        if (!edge || hash2(x >> 2, y >> 2, seed + 3) > 0.42) continue;
        const n = 2 + Math.floor(hash2(x >> 2, y >> 2, seed + 4) * 3);
        for (let yy = (y >> 2) << 2; yy < ((y >> 2) << 2) + n; yy++) for (let xx = (x >> 2) << 2; xx < ((x >> 2) << 2) + n; xx++) tar[b.at(xx, yy)] = 0;
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!tar[i]) continue;
      const up = !tar[b.at(x, y - 1)] || (x > 0 && !tar[i - 1]);
      const dn = !tar[b.at(x, y + 1)] || (x < W - 1 && !tar[i + 1]);
      R[i] = P.asph;
      T[i] = up ? 4 : dn ? 1 : 3;
    }
  }
  // Cast shadow of the skin's near edge on the setts.
  for (let y = 0; y < H; y++) {
    for (let x = 1; x < W; x++) {
      const i = y * W + x;
      if (tar[i]) continue;
      const j = b.at(x - 1, y - 1);
      if (j >= 0 && tar[j]) T[i] = Math.max(0, T[i] - 1);
    }
  }
  // Margins: a cast strip along each wall, jointed, its foot damp and green.
  for (const side of [0, 1]) {
    const x0 = side ? W - M0 : 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < M0; x++) {
        const i = y * W + x0 + x;
        const inner = side ? x === 0 : x === M0 - 1;
        R[i] = inner ? P.tar : P.conc;
        T[i] = inner ? 1 : y % 128 >= 126 ? 1 : y % 128 === 0 ? 4 : 3;
        tar[i] = 0;
      }
    }
    b.band(x0, 0, M0, H, side ? 'right' : 'left', { dt: -1, steps: 2, wob: 2.5, seed: seed + side, only: P.conc, reach: 0.8 });
    for (let i = 0; i < 40; i++) {
      const y = rng.int(0, H - 1);
      const n = rng.int(3, 10);
      for (let q = 0; q < n; q++) {
        b.set(side ? W - 1 : 0, y + q, P.moss, q % 3 === 1 ? 4 : 3);
        if (rng.chance(0.6)) b.set(side ? W - 2 : 1, y + q, P.moss, 2);
        if (rng.chance(0.25)) b.set(side ? W - 3 : 2, y + q, P.moss, 3);
      }
    }
    b.contact(side ? W - 1 : 0, 0, H, side ? 'left' : 'right', { dt: -2, depth: 5, line: 2, seed: seed + 5 + side });
  }
  // (d) The wet: sheets on the tar, the sky in them; water in the channel as strokes ALONG it; rain between setts.
  const wet = new Uint8Array(W * H);
  for (let s = 0; s < 9; s++) {
    const w = rng.int(50, 120);
    const h = rng.int(40, 130);
    const bl = blob(rng, w, h, 5, 0.6);
    const ox = rng.int(M0, W - M0 - w);
    const oy = rng.int(0, H - 1);
    let any = false;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const i = b.at(ox + xx, oy + yy);
        if (bl.m[yy * w + xx] && i >= 0 && tar[i] && T[i] === 3) {
          wet[i] = 1;
          T[i] = 1;
          any = true;
        }
      }
    }
    if (any) for (let q = 0; q < 2; q++) ladder(b, rng, ox + Math.round(w * (0.3 + q * 0.4)), oy + 6, h - 12, rng.int(10, 22), P.sky, 2, wet, (r) => r === P.asph || r === P.sky);
  }
  for (let i = 0; i < 46; i++) {
    const y = rng.int(0, H - 1);
    const len = rng.int(8, 34);
    const x = CX + rng.int(-4, 3);
    for (let q = 0; q < len; q++) b.tint(x, y + q, P.sky, q < 2 || q > len - 3 ? 0 : 1, P.blue);
  }
  b.sheen(rng, M0 + 4, 0, W - 2 * M0 - 8, H, 220, P.sky, 2, { min: 4, max: 9, fat: 0, drifts: 40, only: (r) => r === P.flag || r === P.blue });
  // The tar's own skin: damp ladders in its lighter tone, scabs, pits (the road's language, at the road's density).
  const onTar = (r: number) => r === P.asph;
  for (let k2 = 0; k2 < 90; k2++) {
    const lx = rng.int(M0 + 8, W - M0 - 8);
    const ly = rng.int(0, H - 1);
    const i = b.at(lx, ly);
    if (i < 0 || !tar[i] || wet[i]) continue;
    ladder(b, rng, lx, ly, rng.int(24, 80), rng.int(7, 18), 0, 1, tar, onTar);
  }
  for (let k2 = 0; k2 < 120; k2++) {
    const x = rng.int(M0 + 6, W - M0 - 7);
    const y = rng.int(0, H - 1);
    const i = b.at(x, y);
    const j = b.at(x + 5, y + 3);
    const j2 = b.at(x - 5, y - 3);
    if (i < 0 || j < 0 || j2 < 0 || !tar[i] || !tar[j] || !tar[j2] || wet[i] || b.T[i] !== 3) continue;
    if (k2 % 2) b.bump(rng, x, y, rng.int(4, 9), { fill: 1, lit: 0, dark: 1, cast: 2, only: P.asph });
    else b.chip(rng, x, y, rng.int(3, 7), { depth: 3, only: P.asph });
  }
  // (e) Wear and dressing: cracks in the tar, a patch of setts relaid in sand (paler, out of bond), a drain in
  // the channel, leaves against the walls, a soaked carton, paw prints over a tar island.
  for (let i = 0; i < 8; i++) b.crack(rng, rng.int(M0 + 10, W - M0 - 10), rng.int(0, H - 1), rng.int(30, 90), rng.next() * 6.28, { dt: -2, lip: 1, branch: 0.03, only: P.asph });
  drainGrate(b, P, CX - 16, 430, 32, 28);
  manhole(b, rng, P, CX + 110, 130, 17, 'GAS');
  for (const side of [0, 1]) {
    for (let i = 0; i < 16; i++) leaf(b, rng, rng.chance(0.4) ? P.leafRed : P.leaf, side ? W - 12 - rng.int(0, 22) : 3 + rng.int(0, 22), rng.int(0, H - 1));
  }
  {
    // The carton: a flattened box, its flaps splayed, a tape line, the wet corner dark.
    const x = 300;
    const y = 520;
    b.formRect(x, y, 38, 26, { raised: true, ramp: P.leaf, tone: 4, cast: 1, castLen: 2 });
    b.formRect(x - 9, y + 4, 9, 18, { raised: true, ramp: P.leaf, tone: 3, cast: 1 });
    b.formRect(x + 38, y + 2, 10, 20, { raised: true, ramp: P.leaf, tone: 3, cast: 1 });
    b.hrun(x + 2, y + 12, 34, P.paper, 4);
    for (let yy = 14; yy < 26; yy++) for (let xx = 22 - (26 - yy); xx < 38; xx++) b.shift(x + xx, y + yy, -1, P.leaf);
  }
  for (let s = 0; s < 9; s++) pawPrint(b, P, 96 + s * 17 + (s & 1) * 6, 356 - s * 9 + (s & 1) * 7);
  void wet;
}

/** A dog's wet paw print (7 × 7): pad and four toes, in the mud's dark tone. */
function pawPrint(b: Brush2, P: Z1GroundRamps, x: number, y: number) {
  const s = ['.x.x.x.', '.x.x.x.', '.......', '..xxx..', '.xxxxx.', '.xxxxx.', '..xxx..'];
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (s[j][i] === 'x') b.shift(x + i, y + j, -1, P.asph);
}

/** Everything this file paints, for look-dev dumps and benches. */
export function z1GroundLookdev(atlas: PwAtlas): PwTile[] {
  return [
    z1RoadTile(atlas, 0), z1RoadTile(atlas, 1), z1RoadTile(atlas, 2), z1WalkTile(atlas, 0), z1WalkTile(atlas, 1), z1KerbFaceTile(atlas),
    z1JunctionTile(atlas), z1CrosswalkTile(atlas), z1MarginTile(atlas), z1AlleyTile(atlas),
  ];
}
