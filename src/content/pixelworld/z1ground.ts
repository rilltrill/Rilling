import { PW_TPM, PW_TPM_MID, PwCanvas, type PwRng } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { blob, Brush2, dashAt, discBlob, shore } from './brush2';
import { drawText, FONT_BOLD } from './font';
import { cells, darken, hash2, smooth } from './surfaces';
import { drainGrate, flagCourses, leaf, manhole, pothole, wearFlags, z1GroundRamps, type Z1GroundRamps } from './z1road';

/**
 * MAIN STREET (z1) ground painters for ART: PIXEL WORLD — the wet night street
 * the way a Final Fight / Streets of Rage background artist paints it:
 *  - `z1AsphaltTile`: dark wet asphalt with only a sprinkle of aggregate, long
 *    tar-sealed cracks that catch the light, a saw-cut utility patch, alligator
 *    cracking, wet dips (no per-texel speckle: the street reads as one dark
 *    surface with designed features, not as a noise field);
 *  - `z1PavingTile`: the town square's flagstones — random-length stones in
 *    courses, each with its own tone and a lit upper-left arris, moss and grit
 *    in the joints, a cracked / sunken flag holding water;
 *  - `z1GroundDecals`: ONE sheet of cut-out decals laid flat over the road and
 *    sidewalks (manhole, storm drain, puddles that mirror the neon, oil with its
 *    rainbow rim, potholes, tar patches, skid marks, blood, litter, a cellar
 *    hatch, road lettering) — every decal sits on its own 16-texel cell, so no
 *    level of the mip chain mixes two of them.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrapI = (v: number, n: number) => ((v % n) + n) % n;

// ─── Asphalt ────────────────────────────────────────────────────────────────

export interface Z1AsphaltOpts {
  hex: number;
  /** 0…1 wear: cracks, patches. */
  wear?: number;
  seed?: number;
}

/** Wet night asphalt, 256 × 256 (8 m). */
export function z1AsphaltTile(atlas: PwAtlas, o: Z1AsphaltOpts): PwTile {
  // (The first pass's road tile, kept for the ground between and behind the buildings: far away, never doubled.)
  return atlas.tile(`z1asphalt|${h6(o.hex)}|${o.wear ?? 0.6}|${o.seed ?? 0}`, 256, 256, (c, k) => paintZ1Asphalt(c, k, o), { wrap: true, upscale: false });
}

export function paintZ1Asphalt(c: PwCanvas, k: PwKit, o: Z1AsphaltOpts) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const wear = o.wear ?? 0.6;
  const a = k.ramp(o.hex, { light: 0.36, sat: 0.9 });
  // Older / newer asphalt: a ramp a shade darker at the same step (low-contrast areas, no blobs).
  const b = k.ramp(darken(o.hex, 0.88), { light: 0.36, sat: 0.95 });
  const tar = k.ramp(darken(o.hex, 0.62), { light: 0.5, sat: 1.0 });
  const sky = k.ramp(0x56648a, { light: 0.3, sat: 0.9 });
  const R = c.ramp;
  const T = c.tone;
  const s0 = (o.seed ?? 0) * 7;
  T.fill(3);
  // Older / newer areas (sampled per 2 × 2 block: their edges are ragged pixel steps).
  for (let by = 0; by < H; by += 2) {
    for (let bx = 0; bx < W; bx += 2) {
      const r = smooth(bx + 1, by + 1, W, H, 4, 2 + s0) < 0.42 ? b : a;
      const i = by * W + bx;
      R[i] = R[i + 1] = R[i + W] = R[i + W + 1] = r;
    }
  }
  // Aggregate: a sprinkle (≈ 2 % of texels), two-texel chips, low contrast.
  for (let i = 0; i < 340; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    c.shift(x, y, 1);
    if (rng.chance(0.5)) c.shift(wrapI(x + 1, W), y, 1);
  }
  for (let i = 0; i < 300; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    c.shift(x, y, -1);
    if (rng.chance(0.4)) c.shift(x, wrapI(y + 1, H), -1);
  }
  // Saw-cut utility patch: straight seams sealed with tar, the infill newer (darker, smoother).
  {
    const px = rng.int(0, W - 1);
    const py = rng.int(0, H - 1);
    const pw = rng.int(30, 44);
    const ph = rng.int(90, 130);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const ix = wrapI(px + x, W);
        const iy = wrapI(py + y, H);
        const i = iy * W + ix;
        const edge = x === 0 || y === 0 || x === pw - 1 || y === ph - 1;
        R[i] = edge ? tar : b;
        T[i] = edge ? 1 : 3;
        if ((x === pw - 2 || y === ph - 2) && !edge) T[i] = 4;
      }
    }
    for (let i = 0; i < 30; i++) c.shift(wrapI(px + rng.int(2, pw - 3), W), wrapI(py + rng.int(2, ph - 3), H), 1);
  }
  // Tar snakes: long sealed cracks, a glint on their upper-left edge now and then (wet tar shines).
  const nSnakes = Math.round(4 + wear * 5);
  for (let s = 0; s < nSnakes; s++) {
    let x = rng.int(0, W - 1);
    let y = rng.int(0, H - 1);
    let ang = rng.next() * Math.PI * 2;
    const len = rng.int(40, 120);
    const fat = rng.chance(0.4);
    for (let j = 0; j < len; j++) {
      const ix = wrapI(Math.round(x), W);
      const iy = wrapI(Math.round(y), H);
      c.set(ix, iy, tar, 1);
      if (fat) c.set(wrapI(ix + 1, W), iy, tar, 1);
      if (j % 9 === 4) c.set(wrapI(ix - 1, W), wrapI(iy - 1, H), sky, 2);
      ang += rng.spread(0.35);
      x += Math.cos(ang);
      y += Math.sin(ang);
      if (rng.chance(0.03)) ang += rng.chance(0.5) ? 1.1 : -1.1;
    }
  }
  // Alligator cracking: one worn area of small polygonal cells.
  {
    const cx = rng.int(0, W - 1);
    const cy = rng.int(0, H - 1);
    const RR = rng.int(18, 26);
    for (let y = -RR; y <= RR; y++) {
      for (let x = -RR; x <= RR; x++) {
        const d = (x * x + y * y) / (RR * RR);
        if (d > 1) continue;
        const ix = wrapI(cx + x, W);
        const iy = wrapI(cy + y, H);
        const v = cells(ix, iy, W, H, 40, 40, 71);
        if (v.edge < 0.6 && hash2(ix >> 1, iy >> 1, 13) > d * 0.7) {
          c.set(ix, iy, tar, 1);
          c.shift(wrapI(ix + 1, W), wrapI(iy + 1, H), 1);
        }
      }
    }
  }
  // Wet sheen: the cool sky caught in a few broad smears of short streaks (never dots).
  for (let p = 0; p < 4; p++) {
    const cx = rng.int(0, W - 1);
    const cy = rng.int(0, H - 1);
    for (let j = 0; j < 9; j++) {
      const x = cx + rng.int(-18, 18);
      const y = cy + rng.int(-7, 7);
      const n = rng.int(3, 7);
      for (let q = 0; q < n; q++) {
        const ix = wrapI(x + q, W);
        const iy = wrapI(y, H);
        if (R[iy * W + ix] !== tar) c.set(ix, iy, sky, q === 0 || q === n - 1 ? 1 : 2);
      }
    }
  }
}

// ─── Square paving ──────────────────────────────────────────────────────────

/** Brick band width and paver module of the square's field (texels at 64 a metre). */
const BAND = 24;
const PAVER = 12;

/**
 * The town square's paving FIELD, 512 × 512 at 64 texels a metre (8 m, wraps both ways): four
 * 4 m panels in a frame of brick soldier courses. Two panels are granite setts in herringbone
 * (no joint runs to the horizon), two are old flags in courses of uneven depth; every stone a
 * flat tone with a lit far / left arris and its joint in shadow, tones changing in runs. The
 * brick bands are worn: bricks replaced in a darker clay, a few gone and made good with tar,
 * moss in the joints. Rain lies in the dished flags as strokes of sky.
 */
export function z1SquareFieldTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z1square|field', 512, 512, paintSquareField, { wrap: true, density: PW_TPM_MID });
}

/** Herringbone over a rectangle: pavers one module by two, alternately across and along. */
function herringbone(b: Brush2, P: Z1GroundRamps, x0: number, y0: number, w: number, h: number, seed: number) {
  const R = b.R;
  const T = b.T;
  const W = b.w;
  const A = PAVER;
  for (let y = 0; y < h; y++) {
    const j = Math.floor(y / A);
    const ly = y - j * A;
    for (let x = 0; x < w; x++) {
      const i = Math.floor(x / A);
      const lx = x - i * A;
      // d: 0 / 1 = left / right half of a paver lying across, 3 / 2 = far / near half of one lying along.
      const d = (((i - j) % 4) + 4) % 4;
      const horiz = d < 2;
      const bi = horiz ? (d === 0 ? i : i - 1) : i;
      const bj = horiz ? j : d === 3 ? j : j - 1;
      const joint = horiz ? ly >= A - 2 || (d === 1 && lx >= A - 2) : lx >= A - 2 || (d === 2 && ly >= A - 2);
      const lit = horiz ? ly === 0 || (d === 0 && lx === 0) : lx === 0 || (d === 3 && ly === 0);
      const hr = hash2(bi >> 1, bj >> 1, seed);
      const hv = hash2(bi, bj, seed + 1);
      const k = (y0 + y) * W + x0 + x;
      if (joint) {
        R[k] = P.concDark;
        T[k] = 1;
      } else {
        R[k] = hr > 0.6 ? P.blue : P.flag;
        const tone = hv > 0.9 ? 4 : hv < 0.1 ? 2 : 3;
        T[k] = lit ? tone + 1 : tone;
      }
    }
  }
}

/** A brick soldier course over a rectangle (`along` 'x' = the band runs across the canvas), worn. */
function brickBand(b: Brush2, rng: PwRng, P: Z1GroundRamps, brick: number, brickDark: number, x0: number, y0: number, w: number, h: number, alongX: boolean, seed: number) {
  const R = b.R;
  const T = b.T;
  const W = b.w;
  const BW = 7; // a brick on edge: 7 texels with its joint (11 cm)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const al = alongX ? x : y;
      const ac = alongX ? y : x;
      const n = alongX ? h : w;
      const bi = Math.floor(al / BW);
      const lb = al - bi * BW;
      const k = (y0 + y) * W + x0 + x;
      const hr = hash2(bi, seed, 61);
      // Border joints either side of the course, a joint between bricks; some bricks relaid darker, some gone.
      if (ac === 0 || ac >= n - 2 || lb >= BW - 2) {
        R[k] = P.concDark;
        T[k] = ac === 0 ? 0 : 1;
      } else if (hr < 0.06) {
        R[k] = P.tar;
        T[k] = ac === 1 || lb === 0 ? 1 : 2;
      } else {
        R[k] = hr > 0.8 ? brickDark : brick;
        const tone = hash2(bi >> 2, seed, 62) > 0.7 ? 2 : 3;
        T[k] = ac === 1 || lb === 0 ? tone + 1 : tone;
      }
    }
  }
  // Moss creeping along the joints, in runs.
  for (let i = 0; i < Math.round((alongX ? w : h) / 40); i++) {
    const al = rng.int(0, (alongX ? w : h) - 12);
    const n = rng.int(4, 12);
    for (let q = 0; q < n; q++) {
      if (alongX) b.set(x0 + al + q, y0 + (rng.chance(0.5) ? 0 : h - 1), P.moss, q % 3 === 1 ? 4 : 3);
      else b.set(x0 + (rng.chance(0.5) ? 0 : w - 1), y0 + al + q, P.moss, q % 3 === 1 ? 4 : 3);
    }
  }
}

function paintSquareField(c: PwCanvas, k: PwKit) {
  const P = z1GroundRamps(k);
  const rng = k.rng;
  const b = new Brush2(c, { wrapX: true, wrapY: true });
  const brick = k.ramp(0x6e4636, { light: 0.34, sat: 0.9, dark: 0.45 });
  const brickDark = k.ramp(0x54382e, { light: 0.34, sat: 0.9, dark: 0.5 });
  const seed = 1200;
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const x0 = px * 256 + BAND;
      const y0 = py * 256 + BAND;
      const n = 256 - BAND;
      if ((px + py) % 2 === 0) {
        herringbone(b, P, x0, y0, n, n, seed + px * 2 + py);
        // A re-laid patch (a trench once crossed this panel): the same setts, stack-bonded and a step paler.
        if (px === 0) {
          for (let y = 60; y < 108; y++) {
            for (let x = 20; x < n - 10; x++) {
              const kk = (y0 + y) * c.w + x0 + x;
              const lx = x % 24;
              const ly = (y - 60) % 12;
              const joint = lx >= 22 || ly >= 10;
              c.ramp[kk] = joint ? P.concDark : P.cast;
              c.tone[kk] = joint ? 1 : lx === 0 || ly === 0 ? 4 : 3;
            }
          }
        }
        b.sheen(rng, x0, y0, n, n, 26, P.sky, 2, { min: 5, max: 10, fat: 0, drifts: 7, only: (r) => r === P.flag || r === P.blue });
      } else {
        const flags = flagCourses(b, rng, P, x0, y0, n, n, seed + px * 3 + py * 5);
        wearFlags(b, rng, P, flags, { cracks: 2, wet: 0.5 });
      }
    }
  }
  // The frame of brick: bands along x at the top of each panel row, along y at the left of each column.
  for (let i = 0; i < 2; i++) {
    brickBand(b, rng, P, brick, brickDark, 0, i * 256, 512, BAND, true, seed + 20 + i);
    brickBand(b, rng, P, brick, brickDark, i * 256, 0, BAND, 512, false, seed + 30 + i);
  }
  // Where bands cross: a square stone.
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      b.formRect(i * 256 + 1, j * 256 + 1, BAND - 3, BAND - 3, { raised: true, ramp: P.cast, tone: 3, cast: 0 });
    }
  }
  // A brass survey stud in one crossing stone; a slotted drain let into a band.
  b.formMask({ m: new Uint8Array([0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0]), w: 4, h: 4 }, 265, 9, { raised: true, ramp: k.ramp(0xb08a3a, { light: 0.45 }), tone: 3, cast: 1 });
  for (let x = 96; x < 150; x++) {
    for (let y = 5; y < 19; y++) {
      const edge = x === 96 || y === 5 ? 4 : x === 149 || y === 18 ? 1 : (x - 96) % 4 < 2 && y > 7 && y < 16 ? 0 : 3;
      c.set(x, y, P.iron, edge);
    }
  }
}

/** The square's central PATH module: 6 m wide (the rail walks its middle) × 8 m, wraps along. */
export const Z1_PATH_W = 384;

/**
 * The path from Second Street to PRIME MEATS: broad old flags in courses across it — the calmest
 * paving in the square, for this is where the horde walks and the Butcher fights — between two
 * cast-iron slot drains and a brick soldier course at each edge. The flags keep to two tones and
 * their joints; the wear (a crack, rain in a dished stone, a tarred corner) is sparse and low.
 */
export function z1SquarePathTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z1square|path', Z1_PATH_W, 512, (c, k) => {
    const P = z1GroundRamps(k);
    const rng = k.rng;
    const b = new Brush2(c, { wrapY: true });
    const brick = k.ramp(0x6e4636, { light: 0.34, sat: 0.9, dark: 0.45 });
    const brickDark = k.ramp(0x54382e, { light: 0.34, sat: 0.9, dark: 0.5 });
    const W = c.w;
    const H = c.h;
    const D = 12; // drain width
    const flags = flagCourses(b, rng, P, BAND + D, 0, W - 2 * (BAND + D), H, 1300, 54);
    // (Courses are cut to wrap: the last one runs to the tile's end.)
    wearFlags(b, rng, P, flags, { cracks: 2 });
    for (const side of [0, 1]) {
      brickBand(b, rng, P, brick, brickDark, side ? W - BAND : 0, 0, BAND, H, false, 1310 + side);
      // Slot drain: a cast channel cover, a slot every 6 texels, bolted every 2 m.
      const x0 = side ? W - BAND - D : BAND;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < D; x++) {
          const ly = y % 128;
          let t = x === 0 ? 4 : x === D - 1 ? 1 : 3;
          if (x > 2 && x < D - 3) t = y % 6 < 3 ? 0 : y % 6 === 3 ? 4 : 2;
          if (ly < 2) t = ly === 0 ? 1 : 4;
          c.set(x0 + x, y, P.iron, t);
        }
      }
      // Leaves and a butt or two caught on the grating.
      for (let i = 0; i < 7; i++) leaf(b, rng, rng.chance(0.4) ? P.leafRed : P.leaf, x0 + rng.int(1, 5), rng.int(0, H - 1));
    }
  }, { wrap: true, density: PW_TPM_MID });
}

/**
 * PRIME MEATS' apron, one painting 16 m × 8 m (32 texels a metre: it is seen from 12 m and more):
 * the shop's own concrete forecourt, hosed down every night — a wet fan spreading from the door,
 * a channel carrying the rinse (rust-red, never bright) to a round drain, the twin tracks of the
 * delivery trolley curving in from the west, old stains that no hose shifts. Dark and cool, so
 * the Butcher is the lightest thing on it.
 */
export function z1ApronTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z1square|apron', 512, 256, (c, k) => {
    const P = z1GroundRamps(k);
    const rng = k.rng;
    const b = new Brush2(c);
    const blood = k.ramp(0x4e1c1c, { light: 0.34, sat: 1.0, dark: 0.5 });
    const W = c.w;
    const H = c.h;
    // (Row 0 = the shop front; the doorway is at the middle of the top edge.)
    const flags = flagCourses(b, rng, P, 0, 0, W, H, 1400, 40);
    for (const s of flags) if (s.ramp === P.cast) for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (b.R[(s.y + y) * W + s.x + x] === P.cast) b.R[(s.y + y) * W + s.x + x] = P.flag;
    wearFlags(b, rng, P, flags.map((s) => ({ ...s, ramp: s.ramp === P.cast ? P.flag : s.ramp })), { cracks: 3 });
    // The hosed fan: a wet lobe from the door, a step down, frayed, strokes of sky in it.
    const fw = 250;
    const fh = 150;
    const fan = blob(rng, fw, fh, 6, 0.5);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        if (!fan.m[y * fw + x]) continue;
        // Narrow at the door, wide toward the square.
        if (Math.abs(x - fw / 2) > 30 + y * 0.9) continue;
        const i = b.at(W / 2 - fw / 2 + x, y);
        if (i >= 0 && b.T[i] >= 2 && b.R[i] !== P.concDark) b.T[i] -= 1;
      }
    }
    b.sheen(rng, W / 2 - 90, 6, 180, 120, 26, P.sky, 2, { min: 4, max: 10, fat: 0.1, drifts: 6, only: (r) => r === P.flag || r === P.blue });
    // The channel: a narrow cast drain from the door down to a round gully, the rinse standing in it.
    for (let y = 4; y < 170; y++) {
      const x = W / 2 + 18 + Math.round(Math.sin(y * 0.02) * 3);
      c.set(x - 2, y, P.iron, 4);
      c.set(x - 1, y, blood, y % 9 < 6 ? 2 : 3);
      c.set(x, y, blood, 2);
      c.set(x + 1, y, P.iron, 1);
    }
    b.formMask(discBlob(16, 16), W / 2 + 10, 168, { raised: false, ramp: P.iron, tone: 2, dark: 1, lit: 1 });
    for (let q = 0; q < 4; q++) b.hrun(W / 2 + 13, 172 + q * 3, 10, P.iron, 0);
    // Stains the hose leaves behind: three lobes by the door, a fan of old drips toward the drain.
    for (const [sx, sy, sw, sh] of [
      [W / 2 - 60, 18, 44, 22],
      [W / 2 + 34, 40, 30, 18],
      [W / 2 - 20, 70, 36, 16],
      [W / 2 + 60, 120, 26, 14],
    ]) {
      const s = blob(rng, sw, sh, 3, 0.7);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (!s.m[y * sw + x]) continue;
          const i = b.at(sx + x, sy + y);
          if (i < 0 || b.R[i] === P.concDark || b.R[i] === P.iron) continue;
          b.R[i] = blood;
          b.T[i] = Math.max(2, Math.min(3, b.T[i]));
        }
      }
    }
    // Trolley tracks: two thin dark lines 60 cm apart, curving in from the west edge to the door.
    for (const off of [0, 19]) {
      for (let s = 0; s < 420; s++) {
        const t = s / 420;
        const x = Math.round(8 + t * (W / 2 - 40) + off * (1 - t));
        const y = Math.round(200 - Math.sin(t * 1.45) * 186 + off * t);
        if (dashAt(s, off + 3, 20, 60, 3, 9)) b.shift(x, y, -1);
      }
    }
    b.contact(0, 0, W, 'below', { dt: -2, depth: 4, line: 2, seed: 1401 });
  }, { density: PW_TPM });
}

/**
 * The gas station's forecourt slab (wrap, 8 m at 32 texels a metre: seen from 9 m and more): cast
 * concrete bays, a saw-cut joint every 4 m, each bay its own grey, tyre-dark lanes, old oil. Pale
 * and plain on purpose: the zombies on it are small and dark.
 */
export function z1ForecourtTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z1forecourt', 256, 256, (c, k) => {
    const P = z1GroundRamps(k);
    const rng = k.rng;
    const b = new Brush2(c, { wrapX: true, wrapY: true });
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const bx = x >> 7;
        const by = y >> 7;
        const lx = x & 127;
        const ly = y & 127;
        const joint = lx >= 126 || ly >= 126;
        c.set(x, y, joint ? P.concDark : (bx + by) % 2 ? P.conc : P.kerb, joint ? 1 : lx === 0 || ly === 0 ? 4 : 3);
      }
    }
    // Tyre lanes (a step down, long lobes), oil, hairline cracks from the joints.
    for (let i = 0; i < 5; i++) {
      const w = rng.int(14, 22);
      const h = rng.int(70, 150);
      const s = blob(rng, w, h, 4, 0.6);
      const ox = rng.int(0, c.w - 1);
      const oy = rng.int(0, c.h - 1);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (s.m[y * w + x]) b.shift(ox + x, oy + y, -1, b.rampAt(ox + x, oy + y) === P.concDark ? -1 : 0);
    }
    for (let i = 0; i < 5; i++) b.bump(rng, rng.int(0, c.w - 1), rng.int(0, c.h - 1), rng.int(5, 10), { ramp: P.tar, tone: 3, lit: 0, dark: 1, cast: 0 });
    for (let i = 0; i < 4; i++) b.crack(rng, rng.int(0, 1) * 128 + 2, rng.int(0, c.h - 1), rng.int(20, 50), rng.spread(0.6), { dt: -1, lip: 1 });
    b.sheen(rng, 0, 0, c.w, c.h, 30, P.sky, 2, { min: 4, max: 8, fat: 0, drifts: 8, only: (r) => r === P.conc || r === P.kerb });
  }, { wrap: true, density: PW_TPM });
}

// ─── Decal sheet ────────────────────────────────────────────────────────────

/** Sub-rect of the decal sheet (texels, canvas rows top-down → converted to tile v by `sub`). */
export interface DecalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Decals on the sheet (64 texels a metre): name → canvas rect (y down). Every rect starts on a
 * 32-texel cell and keeps a texel of margin, so no level of the mip chain mixes two of them.
 */
export const Z1_DECALS = {
  puddleA: { x: 0, y: 0, w: 256, h: 128 },
  puddleC: { x: 256, y: 0, w: 192, h: 128 },
  blood: { x: 448, y: 0, w: 160, h: 128 },
  patch: { x: 608, y: 0, w: 128, h: 96 },
  paperA: { x: 736, y: 0, w: 32, h: 32 },
  paperB: { x: 736, y: 32, w: 32, h: 32 },
  paperC: { x: 736, y: 64, w: 32, h: 32 },
  gum: { x: 736, y: 96, w: 32, h: 32 },
  shells: { x: 608, y: 96, w: 128, h: 32 },
  puddleB: { x: 0, y: 128, w: 160, h: 96 },
  bloodTrail: { x: 160, y: 128, w: 128, h: 96 },
  cellar: { x: 288, y: 128, w: 96, h: 96 },
  oil: { x: 384, y: 128, w: 96, h: 64 },
  pothole: { x: 480, y: 128, w: 96, h: 64 },
  arrow: { x: 576, y: 128, w: 64, h: 96 },
  manhole: { x: 640, y: 128, w: 64, h: 64 },
  can: { x: 704, y: 128, w: 32, h: 32 },
  utility: { x: 736, y: 128, w: 32, h: 32 },
  bottle: { x: 704, y: 160, w: 32, h: 32 },
  hat: { x: 736, y: 160, w: 32, h: 32 },
  leaves: { x: 384, y: 192, w: 96, h: 32 },
  drain: { x: 480, y: 192, w: 96, h: 32 },
  glass: { x: 640, y: 192, w: 128, h: 32 },
  skid: { x: 0, y: 224, w: 256, h: 64 },
  slow: { x: 256, y: 224, w: 160, h: 64 },
  pages: { x: 416, y: 224, w: 128, h: 64 },
  fuel: { x: 544, y: 224, w: 224, h: 64 },
  scorch: { x: 0, y: 288, w: 256, h: 192 },
  puddleD: { x: 256, y: 288, w: 96, h: 192 },
  gouge: { x: 352, y: 288, w: 64, h: 192 },
  drag: { x: 416, y: 288, w: 96, h: 192 },
  keepClear: { x: 512, y: 288, w: 256, h: 96 },
  glintA: { x: 512, y: 384, w: 128, h: 128 },
  glintB: { x: 640, y: 384, w: 128, h: 128 },
} as const;

export type Z1DecalName = keyof typeof Z1_DECALS;

/** The ground decal sheet (768 × 512 module at 64 texels a metre). */
export function z1GroundDecals(atlas: PwAtlas): PwTile {
  return atlas.tile('z1decals2', 768, 512, (c, k) => paintDecals(c, k), { density: PW_TPM_MID });
}

/** `PwBatch.rect` sub-rect (tile texel space, v up) of a decal. */
export function decalSub(t: PwTile, name: Z1DecalName): { x: number; y: number; w: number; h: number } {
  const r = Z1_DECALS[name];
  return { x: r.x, y: t.h - r.y - r.h, w: r.w, h: r.h };
}

/**
 * A puddle on the road: a long lobed sheet lying along the street, a wet margin a step under the
 * road, the body a deep blue, its far third paler where it mirrors the sky, a broken bright line
 * along the far shore, a dark meniscus on the near one, the neighbourhood's lights standing in
 * it as columns of dashes, rain rings. `lights` = ramps of the lights it mirrors.
 */
function puddle(b: Brush2, rng: PwRng, P: Z1GroundRamps, r: DecalRect, lights: readonly number[], rough = 0.9) {
  const w = r.w - 6;
  const h = r.h - 6;
  const s = shore(rng, w, h, rough);
  const ox = r.x + 3;
  const oy = r.y + 3;
  const inS = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && s.m[y * w + x] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inS(x, y)) continue;
      // Distance in from the shore (cheap: how many of 3 steps stay inside, in the four directions).
      let d = 3;
      for (let q = 1; q <= 3 && d === 3; q++) if (!inS(x - q, y) || !inS(x + q, y) || !inS(x, y - q) || !inS(x, y + q)) d = q - 1;
      const far = y < h * 0.36;
      // (A puddle at night is a mirror, not a hole: its body sits at the wet road's own value, bluer; the far
      // third, where it looks up at the sky, a step lighter.)
      if (d === 0) b.set(ox + x, oy + y, P.asph, inS(x, y + 1) ? 2 : 1);
      else if (d === 1 && !inS(x, y - 2) && dashAt(x, r.x, 3, 9, 1, 3)) b.set(ox + x, oy + y, P.sky, 3);
      else if (d < 3) b.set(ox + x, oy + y, far ? P.sky : P.asph, far ? 1 : 1);
      else b.set(ox + x, oy + y, P.sky, far ? 2 : 1);
    }
  }
  // The far third breaks into the body in strokes, not a line.
  for (let x = 4; x < w - 4; x += 3) {
    const y = Math.round(h * 0.36) + ((x * 7) % 5);
    if (dashAt(x, r.y + 3, 3, 8, 2, 5)) for (let q = 0; q < 2; q++) if (inS(x, y + q) && inS(x + 2, y + q) && b.rampAt(ox + x, oy + y + q) === P.sky) b.set(ox + x, oy + y + q, P.sky, 2);
  }
  // What stands over the puddle is in it: two or three dark bands (house fronts) hanging down from the far
  // shore, their sides frayed row by row — between them the sky, on them the lights.
  const nb = w > 150 ? 3 : 2;
  for (let q = 0; q < nb; q++) {
    const bx = Math.round(w * ((q + 0.15 + rng.next() * 0.3) / nb));
    const bw = Math.round(w * rng.range(0.1, 0.2));
    const bh = Math.round(h * rng.range(0.45, 0.8));
    for (let y = 2; y < bh; y++) {
      const fray = (hash2(y >> 1, q, r.x + 9) > 0.5 ? 1 : 0) + (y > bh - 8 ? Math.round((8 - (bh - y)) * 0.6) : 0);
      for (let x = bx + fray; x < bx + bw - fray; x++) {
        // (Broken into rungs toward its end, like everything a puddle mirrors.)
        if (y > bh * 0.6 && (y >> 1) % 3 === 0) continue;
        const i = b.at(ox + x, oy + y);
        if (i >= 0 && b.R[i] === P.sky && inS(x, y)) {
          b.R[i] = P.asph;
          b.T[i] = 2;
        }
      }
    }
  }
  const mirror = (rm: number) => rm === P.sky || rm === P.asph;
  // Lights: a column each, from just under the far shore toward the viewer.
  lights.forEach((rmp, i) => {
    const lx = Math.round(w * (lights.length === 1 ? 0.5 : 0.28 + (0.44 * i) / (lights.length - 1)) + rng.spread(w * 0.06));
    let y0 = 0;
    while (y0 < h && !inS(lx, y0)) y0++;
    // (Lit paint, not glow: a mirrored light is no lamp — it dims with the street and melts into the far levels.)
    b.wetStreak(rng, ox + lx, oy + y0 + 4, Math.round(h * 0.72), Math.max(8, Math.round(w * 0.11)), rmp, 4, { only: mirror, rows: 2, gap: 0.12 });
  });
  // Rain rings: small ellipses of three or four strokes, a few caught at different moments.
  for (let i = 0; i < Math.round((w * h) / 2600); i++) {
    const cx = rng.int(8, w - 9);
    const cy = rng.int(6, h - 7);
    if (!inS(cx - 5, cy) || !inS(cx + 5, cy) || !inS(cx, cy - 3) || !inS(cx, cy + 3)) continue;
    const big = rng.chance(0.4);
    const rx = big ? 5 : 3;
    b.hrun(ox + cx - rx + 1, oy + cy - (big ? 2 : 1), rx * 2 - 2, P.sky, 4);
    b.hrun(ox + cx - rx + 1, oy + cy + (big ? 2 : 1), rx * 2 - 2, P.sky, 3);
    b.set(ox + cx - rx, oy + cy, P.sky, 4);
    b.set(ox + cx + rx - 1, oy + cy, P.sky, 3);
  }
}

function paintDecals(c: PwCanvas, k: PwKit) {
  const rng = k.rng;
  const P = z1GroundRamps(k);
  const b = new Brush2(c);
  const neonP = k.ramp(0xff3c9a, { light: 0.5 });
  const neonC = k.ramp(0x39e8ff, { light: 0.5 });
  const sodium = k.ramp(0xffa54a, { light: 0.5 });
  const warm = k.ramp(0xffd58a, { light: 0.5 });
  const blood = k.ramp(0x5a0c0c, { light: 0.4, sat: 1.1, dark: 0.5 });
  const ink = k.ramp(0x2a2a30, { light: 0.4 });
  const steel = k.ramp(0x5a5e66, { light: 0.5, sat: 0.6 });
  const brass = k.ramp(0xb08a3a, { light: 0.45 });
  const flyer = k.ramp(0x9a8a4a, { light: 0.4, sat: 0.8 });
  const glassG = k.ramp(0x3a7a5a, { light: 0.5 });
  const D = Z1_DECALS;

  puddle(b, rng, P, D.puddleA, [neonP, sodium, warm]);
  puddle(b, rng, P, D.puddleB, [neonC]);
  puddle(b, rng, P, D.puddleC, [sodium, neonC]);
  puddle(b, rng, P, D.puddleD, [sodium], 1);

  // Manhole (the road modules' own cover, on a sheet cell).
  {
    const r = D.manhole;
    c.rect(r.x + 1, r.y + 1, 62, 62, P.asph, 3);
    manhole(b, rng, P, r.x + 32, r.y + 31, 17, 'SEWER');
    // (Its square patch is the decal's ground: cut the sheet cell's corners back to it.)
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (c.at(r.x + x, r.y + y) === P.asph) c.ramp[(r.y + y) * c.w + r.x + x] = 0;
  }
  // Storm drain on the kerb line, with the wet fan running into it.
  {
    const r = D.drain;
    drainGrate(b, P, r.x + 8, r.y + 3, 80, 24);
    for (let i = 0; i < 9; i++) leaf(b, rng, rng.chance(0.4) ? P.leafRed : P.leaf, r.x + rng.int(10, 78), r.y + rng.int(4, 18));
  }
  // Cellar hatch for the walks (two leaves of diamond plate in a frame).
  {
    const r = D.cellar;
    for (let y = 2; y < 94; y++) {
      for (let x = 2; x < 94; x++) {
        const edge = x < 5 || y < 5 || x >= 91 || y >= 91;
        let t: number;
        if (edge) t = x < 5 || y < 5 ? (x === 2 || y === 2 ? 4 : 3) : x === 93 || y === 93 ? 0 : 1;
        else {
          const lx = (x - 5) % 6;
          const ly = (y - 5) % 6;
          const diag = (Math.floor((x - 5) / 6) + Math.floor((y - 5) / 6)) % 2 === 0 ? lx - ly : lx + ly - 5;
          t = diag === 0 && lx > 0 && lx < 5 ? 4 : diag === 1 && lx > 0 && lx < 5 ? 1 : 2;
          if (x === 47) t = 0;
          else if (x === 48) t = 4;
        }
        c.set(r.x + x, r.y + y, P.iron, t);
      }
    }
    for (const hy of [14, 74]) for (const hx of [7, 80]) b.formRect(r.x + hx, r.y + hy, 9, 6, { raised: true, ramp: P.iron, tone: 3, cast: 1 });
    b.formRect(r.x + 43, r.y + 44, 10, 7, { raised: true, ramp: brass, tone: 3, cast: 1 });
    for (let i = 0; i < 16; i++) {
      const rx = r.x + rng.int(6, 88);
      for (let q = 0; q < rng.int(3, 12); q++) b.tint(rx, r.y + 90 - q, P.rust, 0, P.iron);
    }
  }
  // Small things on a walk: a utility lid, gum, a crushed can, a bottle, a policeman's cap.
  {
    const u = D.utility;
    b.formRect(u.x + 4, u.y + 4, 24, 24, { raised: false, ramp: P.iron, tone: 3, dark: 1, lit: 1 });
    for (let y = 7; y < 25; y++) for (let x = 7; x < 25; x++) if ((x + y) % 4 === 0) c.set(u.x + x, u.y + y, P.iron, 4);
    drawText(c, 'W', u.x + 13, u.y + 12, FONT_BOLD, P.iron, 1);
    const g = D.gum;
    for (let i = 0; i < 7; i++) b.bump(rng, g.x + rng.int(6, 26), g.y + rng.int(6, 26), rng.int(3, 5), { ramp: P.tar, tone: rng.chance(0.5) ? 2 : 3, cast: 0 });
    const cn = D.can;
    const red = k.ramp(0xb02a2a, { light: 0.5 });
    b.formRect(cn.x + 7, cn.y + 10, 17, 10, { raised: true, ramp: red, tone: 3, cast: 1, castLen: 2 });
    c.vline(cn.x + 7, cn.y + 10, 10, steel, 4);
    c.vline(cn.x + 8, cn.y + 11, 8, steel, 3);
    c.hline(cn.x + 12, cn.y + 14, 8, P.paper, 4);
    c.vline(cn.x + 16, cn.y + 11, 8, red, 1);
    const bt = D.bottle;
    b.formRect(bt.x + 5, bt.y + 12, 16, 7, { raised: true, ramp: glassG, tone: 3, cast: 1 });
    b.formRect(bt.x + 21, bt.y + 14, 7, 3, { raised: true, ramp: glassG, tone: 3, cast: 1 });
    c.hline(bt.x + 7, bt.y + 13, 9, glassG, 5);
    c.rect(bt.x + 10, bt.y + 14, 6, 4, P.paper, 4);
    const ht = D.hat;
    const navy = k.ramp(0x2a3350, { light: 0.4 });
    b.formMask(discBlob(22, 16), ht.x + 5, ht.y + 6, { raised: true, ramp: navy, tone: 3, cast: 1, castLen: 2 });
    b.formMask(discBlob(12, 8), ht.x + 10, ht.y + 9, { raised: true, ramp: navy, tone: 2, cast: 0 });
    c.rect(ht.x + 8, ht.y + 20, 16, 5, navy, 1);
    c.hline(ht.x + 9, ht.y + 20, 14, steel, 3);
    c.set(ht.x + 15, ht.y + 17, brass, 4);
    c.set(ht.x + 16, ht.y + 17, brass, 5);
  }
  // Spent shells in a scatter, each a brass tube with its shadow.
  {
    const r = D.shells;
    for (let i = 0; i < 16; i++) {
      const x = r.x + rng.int(4, r.w - 10);
      const y = r.y + rng.int(4, r.h - 8);
      const horiz = rng.chance(0.6);
      b.formRect(x, y, horiz ? 5 : 2, horiz ? 2 : 5, { raised: true, ramp: brass, tone: 3, cast: 1 });
      c.set(x, y, brass, 5);
    }
  }
  // Oil with a rainbow rim; a pothole; a tar patch.
  oilStainDecal(b, rng, P, D.oil);
  {
    const r = D.pothole;
    c.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, P.asph, 3);
    pothole(b, rng, P, r.x + 46, r.y + 28, 62, 36);
    // (Only the hole, its lip and its crumbs stay.)
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (c.at(r.x + x, r.y + y) === P.asph && c.toneAt(r.x + x, r.y + y) === 3) c.ramp[(r.y + y) * c.w + r.x + x] = 0;
  }
  {
    const r = D.patch;
    const s = blob(rng, r.w - 8, r.h - 8, 3, 0.9);
    b.formMask(s, r.x + 4, r.y + 4, { raised: true, lit: 0, dark: 0, cast: 0 });
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        if (!s.m[y * s.w + x]) continue;
        const edge = !s.m[y * s.w + x - 1] || !s.m[y * s.w + x + 1] || y === 0 || y === s.h - 1 || !s.m[(y - 1) * s.w + x] || !s.m[(y + 1) * s.w + x];
        c.set(r.x + 4 + x, r.y + 4 + y, P.tar, edge ? 1 : y < 3 || x < 3 ? 2 : 3);
      }
    }
    for (let i = 0; i < 6; i++) b.bump(rng, r.x + rng.int(16, r.w - 16), r.y + rng.int(14, r.h - 14), rng.int(4, 8), { lit: 1, dark: 0, cast: 1, only: P.tar });
    b.sheen(rng, r.x + 12, r.y + 12, r.w - 24, r.h - 24, 10, P.sky, 2, { min: 5, max: 14, fat: 0.2, core: 3, drifts: 2, only: (rm) => rm === P.tar });
  }
  // Skid marks: two rubber streaks swerving, biting harder as they go.
  {
    const r = D.skid;
    for (const off of [14, 44]) {
      for (let x = 2; x < r.w - 2; x++) {
        const t = x / r.w;
        const y = Math.round(r.y + off + Math.sin(t * 2.2) * 6);
        const wd = t < 0.2 ? 3 : 6;
        for (let j = 0; j < wd; j++) {
          // (Thin and broken where the tyres first lock, solid and dark toward the end.)
          if (t < 0.4 && !dashAt(x + j * 3, off + j, 4, 12, 1, Math.round(8 - t * 16))) continue;
          if ((j === 0 || j === wd - 1) && dashAt(x, off + j, 2, 5, 2, 5)) continue;
          c.set(r.x + x, y + j, P.tar, j === 0 || j === wd - 1 ? 2 : 1);
        }
      }
    }
  }
  // Blood: a pool with a dark rim and a wet light, cast-off drops; a drag trail with a hand print.
  {
    const r = D.blood;
    const s = shore(rng, 104, 70, 1);
    const ox = r.x + 22;
    const oy = r.y + 26;
    b.formMask(s, ox, oy, { raised: true, ramp: blood, tone: 2, lit: 0, dark: 1, cast: 0 });
    // The wet light on it: two strokes high on the pool, a longer dim one below.
    b.stroke(ox + 26, oy + 12, 22, 3, blood, 4, { core: 5, only: (rm) => rm === blood });
    b.stroke(ox + 54, oy + 20, 12, 2, blood, 4, { only: (rm) => rm === blood });
    b.stroke(ox + 34, oy + 40, 30, 2, blood, 3, { only: (rm) => rm === blood });
    // Cast-off: drops flung one way, each a teardrop with its tail toward the pool.
    for (let i = 0; i < 22; i++) {
      const a = -0.6 + rng.spread(1.9);
      const d = rng.range(40, 76);
      const x = Math.round(ox + 52 + Math.cos(a) * d);
      const y = Math.round(oy + 35 + Math.sin(a) * d * 0.72);
      if (x < r.x + 3 || y < r.y + 3 || x > r.x + r.w - 8 || y > r.y + r.h - 6) continue;
      b.bump(rng, x, y, rng.int(2, 5), { ramp: blood, tone: 2, lit: 0, dark: 1, cast: 0 });
    }
    const t = D.bloodTrail;
    let yy = t.y + 56;
    for (let x = t.x + 4; x < t.x + t.w - 4; x++) {
      if (x % 3 === 0) yy = Math.max(t.y + 40, Math.min(t.y + 72, yy + rng.int(-1, 1)));
      const tt = (x - t.x) / t.w;
      const ww = Math.max(2, Math.round(11 * (1 - tt * 0.8)));
      for (let j = -ww; j <= ww; j++) {
        // Streaky: long gaps open up as the drag runs dry.
        if (dashAt(x, j + 40, 6, 22, 1, Math.round(2 + tt * 9)) === false) continue;
        c.set(x, yy + j, blood, Math.abs(j) === ww ? 1 : j === -ww + 1 ? 3 : 2);
      }
    }
    // The hand print where someone was dragged: a palm and four fingers.
    const hx = t.x + 30;
    const hy = t.y + 12;
    b.formMask(blob(rng, 12, 10, 2, 0.9), hx, hy + 8, { raised: true, ramp: blood, tone: 2, lit: 0, dark: 1, cast: 0 });
    for (let f = 0; f < 4; f++) c.rect(hx + f * 3, hy + (f === 0 || f === 3 ? 2 : 0), 2, 8 - (f === 0 || f === 3 ? 2 : 0), blood, 2);
    c.rect(hx - 4, hy + 10, 4, 2, blood, 2);
  }
  // A long bloody drag (for the trails that run to a doorway): two heel lines down the canvas, a broad smear
  // between them that comes and goes, a hand print where a grip was lost.
  {
    const r = D.drag;
    const sway = (y: number) => Math.round(Math.sin((y / r.h) * 5) * 6);
    for (let y = 4; y < r.h - 4; y++) {
      const sw = sway(y);
      for (const off of [30, 60]) {
        if (!dashAt(y, off, 14, 46, 2, 7)) continue;
        c.set(r.x + off + sw, r.y + y, blood, 2);
        c.set(r.x + off + sw + 1, r.y + y, blood, 2);
        c.set(r.x + off + sw + 2, r.y + y, blood, 1);
      }
    }
    for (const [y0, len] of [
      [10, 52],
      [84, 40],
      [140, 36],
    ]) {
      const sm = blob(rng, 22, len, 4, 0.5, 1);
      for (let y = 0; y < len; y++) {
        for (let x = 0; x < 22; x++) {
          if (!sm.m[y * 22 + x]) continue;
          // Streaked along the drag: columns of the smear drop out in runs.
          if (hash2(x, (y0 + y) >> 4, 7) < 0.3) continue;
          c.set(r.x + 35 + sway(y0 + y) + x, r.y + y0 + y, blood, x === 21 || !sm.m[y * 22 + x + 1] ? 1 : 2);
        }
      }
    }
    const hx = r.x + 70;
    const hy = r.y + 62;
    b.formMask(blob(rng, 12, 10, 2, 0.9), hx, hy + 8, { raised: true, ramp: blood, tone: 2, lit: 0, dark: 1, cast: 0 });
    for (let f = 0; f < 4; f++) c.rect(hx + f * 3, hy + (f === 0 || f === 3 ? 2 : 0), 2, 8 - (f === 0 || f === 3 ? 2 : 0), blood, 2);
  }
  // Litter: a newspaper plastered flat (masthead, columns, a photo), a torn flyer, a paper cup on its side.
  {
    const a = D.paperA;
    b.formRect(a.x + 3, a.y + 5, 26, 22, { raised: true, ramp: P.paper, tone: 4, cast: 1 });
    c.rect(a.x + 5, a.y + 7, 22, 3, ink, 2);
    c.rect(a.x + 5, a.y + 12, 9, 7, ink, 3);
    for (let l = 0; l < 4; l++) c.hline(a.x + 16, a.y + 12 + l * 2, 10 - (l & 1) * 2, ink, 3);
    for (let l = 0; l < 3; l++) c.hline(a.x + 5, a.y + 21 + l * 2, 21 - l * 3, ink, 3);
    c.vline(a.x + 16, a.y + 5, 22, P.paper, 3);
    const f = D.paperB;
    c.poly([f.x + 4, f.y + 8, f.x + 26, f.y + 4, f.x + 28, f.y + 25, f.x + 16, f.y + 27, f.x + 12, f.y + 23, f.x + 6, f.y + 26], flyer, 3);
    c.line(f.x + 4, f.y + 8, f.x + 26, f.y + 4, flyer, 4);
    c.rect(f.x + 9, f.y + 10, 14, 3, ink, 2);
    c.hline(f.x + 10, f.y + 16, 12, ink, 3);
    c.hline(f.x + 10, f.y + 19, 9, ink, 3);
    c.line(f.x + 6, f.y + 27, f.x + 28, f.y + 26, P.tar, 1);
    const cc = D.paperC;
    b.formRect(cc.x + 6, cc.y + 11, 18, 10, { raised: true, ramp: P.paper, tone: 4, cast: 1, castLen: 2 });
    c.vline(cc.x + 6, cc.y + 10, 12, P.paper, 5);
    c.vline(cc.x + 7, cc.y + 11, 10, ink, 3);
    c.rect(cc.x + 13, cc.y + 12, 6, 8, k.ramp(0xb02a2a, { light: 0.4 }), 3);
    // (Spilled coffee running off downhill.)
    b.drip(rng, cc.x + 4, cc.y + 21, 8, { ramp: P.leaf, dt: -1, width: 3 });
  }
  // Homework sheets stuck to the wet road (the bus): lined pages at all angles, one with a red mark.
  {
    const r = D.pages;
    for (let i = 0; i < 6; i++) {
      const x = r.x + 6 + i * 20 + rng.int(-3, 3);
      const y = r.y + rng.int(6, 30);
      const sk = rng.int(-2, 2);
      for (let yy = 0; yy < 22; yy++) {
        for (let xx = 0; xx < 16; xx++) {
          const px = x + xx + Math.round((yy * sk) / 8);
          c.set(px, y + yy, P.paper, yy === 0 || xx === 0 ? 5 : yy % 4 === 2 && xx > 2 && xx < 14 - (yy % 3) ? 2 : 4);
        }
      }
      if (i === 2) c.rect(x + 9, y + 3, 4, 3, blood, 3);
      c.hline(x + 1 + Math.round((22 * sk) / 8), y + 22, 16, P.tar, 1);
    }
  }
  // Leaves in a drift.
  {
    const r = D.leaves;
    for (let i = 0; i < 26; i++) leaf(b, rng, rng.chance(0.35) ? P.leafRed : P.leaf, r.x + rng.int(3, r.w - 10) , r.y + rng.int(3, r.h - 9));
  }
  // Broken glass: shards as small triangles, each with one bright edge.
  {
    const r = D.glass;
    for (let i = 0; i < 34; i++) {
      const x = r.x + Math.round(r.w / 2 + (rng.next() + rng.next() - 1) * (r.w / 2 - 8));
      const y = r.y + Math.round(r.h / 2 + (rng.next() + rng.next() - 1) * (r.h / 2 - 5));
      const n = rng.int(2, 4);
      for (let q = 0; q < n; q++) c.hline(x + q, y + q, n - q, P.sky, q === 0 ? 5 : 3);
    }
  }
  // Road legends in worn paint: SLOW (top = far), a straight-on arrow, KEEP CLEAR in a box.
  {
    // Wear: lobes rubbed through along the way the traffic runs (down the canvas), the paint's lit left edge,
    // its ends chipped — never a sprinkle of holes.
    const wear = (r: DecalRect, n: number, seed: number) => {
      for (let i = 0; i < n; i++) {
        const hw = rng.int(7, 16);
        const hh = rng.int(16, Math.max(17, Math.min(46, r.h - 8)));
        const hole = blob(rng, hw, hh, 3, 0.5);
        const hx = r.x + rng.int(2, r.w - hw - 2);
        const hy = r.y + rng.int(2, Math.max(3, r.h - hh - 2));
        for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) if (hole.m[y * hw + x] && c.at(hx + x, hy + y) === P.white) c.ramp[(hy + y) * c.w + hx + x] = 0;
      }
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          if (c.at(r.x + x, r.y + y) !== P.white) continue;
          const edgeL = c.at(r.x + x - 1, r.y + y) !== P.white;
          const edgeR = c.at(r.x + x + 1, r.y + y) !== P.white;
          if ((edgeL || edgeR) && dashAt(y, seed + x, 2, 4, 3, 8)) c.ramp[(r.y + y) * c.w + r.x + x] = 0;
          else c.tone[(r.y + y) * c.w + r.x + x] = edgeL ? 4 : edgeR ? 2 : 3;
        }
      }
    };
    const s = D.slow;
    // (Legends are drawn tall — the decal is laid twice as long as wide — so they read from a walker's eye.)
    const tmp = new PwCanvas(120, 28);
    drawText(tmp, 'SLOW', 2, 0, FONT_BOLD, P.white, 3, { scale: 4 });
    for (let y = 0; y < 56; y++) for (let x = 0; x < 120; x++) if (tmp.at(x, y >> 1)) c.set(s.x + 20 + x, s.y + 4 + y, P.white, 3);
    wear(s, 9, 41);
    const a = D.arrow;
    c.rect(a.x + 25, a.y + 40, 14, 52, P.white, 3);
    c.poly([a.x + 6, a.y + 44, a.x + 32, a.y + 4, a.x + 58, a.y + 44], P.white, 3);
    wear(a, 6, 43);
    const kc = D.keepClear;
    c.frame(kc.x + 4, kc.y + 4, kc.w - 8, kc.h - 8, P.yellow, 3);
    c.frame(kc.x + 5, kc.y + 5, kc.w - 10, kc.h - 10, P.yellow, 3);
    c.frame(kc.x + 6, kc.y + 6, kc.w - 12, kc.h - 12, P.yellow, 3);
    drawText(c, 'KEEP', kc.x + 70, kc.y + 14, FONT_BOLD, P.white, 3, { scale: 4 });
    drawText(c, 'CLEAR', kc.x + 58, kc.y + 50, FONT_BOLD, P.white, 3, { scale: 4 });
    wear(kc, 11, 45);
    for (let y = 0; y < kc.h; y++) for (let x = 0; x < kc.w; x++) if (c.at(kc.x + x, kc.y + y) === P.yellow && hash2(x >> 2, y >> 2, 47) < 0.4) c.ramp[(kc.y + y) * c.w + kc.x + x] = 0;
  }
  // Fuel on wet ground: a long thin sheet with the rainbow lying along both shores.
  {
    const r = D.fuel;
    const s = blob(rng, r.w - 10, r.h - 16, 7, 0.4);
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        if (!s.m[y * s.w + x]) continue;
        const up = y === 0 || !s.m[(y - 1) * s.w + x];
        const dn = y === s.h - 1 || !s.m[(y + 1) * s.w + x];
        const up2 = y < 2 || !s.m[(y - 2) * s.w + x];
        const dn2 = y >= s.h - 2 || !s.m[(y + 2) * s.w + x];
        let rm = P.tar;
        let t = 2;
        if (up || dn) (rm = P.oilP), (t = 2);
        else if (up2 || dn2) (rm = dashAt(x, y, 4, 10, 1, 3) ? P.oilT : P.oilP), (t = 3);
        c.set(r.x + 5 + x, r.y + 8 + y, rm, t);
      }
    }
    b.sheen(rng, r.x + 14, r.y + 14, r.w - 28, r.h - 28, 12, P.oilT, 4, { min: 6, max: 16, drifts: 3, fat: 0, only: (rm) => rm === P.tar });
  }
  // The scorch under a burnt car: a stepped dark ring, ash paler in the middle, glass and flakes round it.
  {
    const r = D.scorch;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const ash = k.ramp(0x4a4a50, { light: 0.4, sat: 0.4 });
    // Three ring edges, each wobbling round the compass (tabulated per degree: this is a big decal).
    const wf = [0, 1, 2].map((q) => {
      const p = hash2(q, 9, 9) * 6.28;
      const t = new Float32Array(361);
      for (let d = 0; d <= 360; d++) t[d] = Math.sin((d * Math.PI * 3) / 180 + p) * 0.05 + Math.sin((d * Math.PI * 7) / 180 + p * 2) * 0.03;
      return t;
    });
    for (let y = 3; y < r.h - 3; y++) {
      for (let x = 3; x < r.w - 3; x++) {
        const u = (r.x + x + 0.5 - cx) / (r.w / 2 - 6);
        const v = (r.y + y + 0.5 - cy) / (r.h / 2 - 6);
        const d = Math.sqrt(u * u + v * v);
        if (d > 1.2) continue;
        const a = Math.round((Math.atan2(v, u) * 180) / Math.PI + 180);
        if (d > 1 + wf[0][a]) {
          // Soot thrown past the edge, as dashes.
          if (d < 1.1 + wf[0][a] && dashAt(x, y, 2, 5, 2, 4) && y % 2 === 0) c.set(r.x + x, r.y + y, P.tar, 2);
          continue;
        }
        if (d > 0.72 + wf[1][a]) c.set(r.x + x, r.y + y, P.tar, 2);
        else if (d > 0.4 + wf[2][a]) c.set(r.x + x, r.y + y, P.tar, 1);
        else c.set(r.x + x, r.y + y, ash, dashAt(x, y, 3, 8, 1, 3) && y % 2 === 0 ? 3 : 2);
      }
    }
    for (let i = 0; i < 30; i++) {
      const a = rng.next() * 6.28;
      const d = rng.range(0.5, 0.95);
      const x = Math.round(cx + Math.cos(a) * d * (r.w / 2 - 10));
      const y = Math.round(cy + Math.sin(a) * d * (r.h / 2 - 10));
      if (rng.chance(0.5)) c.hline(x, y, rng.int(2, 3), P.sky, 4);
      else b.bump(rng, x, y, rng.int(3, 5), { ramp: P.rust, tone: 3, cast: 1, lit: 1, dark: 1 });
    }
  }
  // Gouges (the bus): parallel scrapes down to pale stone, a curl of spoil beside each.
  {
    const r = D.gouge;
    for (const [off, len] of [
      [14, 170],
      [30, 120],
      [46, 150],
    ]) {
      const y0 = r.y + 6 + rng.int(0, 20);
      for (let y = 0; y < len; y++) {
        const x = r.x + off + Math.round(Math.sin(y * 0.03 + off) * 2);
        const wd = y < 12 || y > len - 20 ? 1 : 3;
        for (let j = 0; j < wd; j++) c.set(x + j, y0 + y, j === 0 ? P.tar : P.dry, j === 0 ? 1 : 4);
        if (wd === 3 && dashAt(y, off, 3, 9, 3, 9)) c.set(x + 3, y0 + y, P.tar, 2);
      }
    }
  }
  // Glints: what a lamp, a sign or a fire lays on the wet ground under it — a ring of light drawn only as
  // broken strokes (dense and bright at the heart, sparse at the rim), in a NEUTRAL ramp: the batch tints
  // each to its light. Two, so neighbours differ.
  glint(b, rng, k, D.glintA, 1);
  glint(b, rng, k, D.glintB, 2);
}

/** Base colour of the neutral glint decals (tinted per light by the batch). */
export const Z1_GLINT_NEUTRAL = 0xe0e0e0;

function glint(b: Brush2, rng: PwRng, k: PwKit, r: DecalRect, seed: number) {
  const g = k.ramp(Z1_GLINT_NEUTRAL, { light: 0.3, sat: 0, shift: 0 });
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const R0 = r.w / 2 - 4;
  // Rungs four texels apart (two lit, two road), each as wide as the pool is there: long unbroken strokes at
  // the heart, shorter and further between toward the rim, whole rungs missing near the far and near ends —
  // a path of light on water, not a scatter.
  for (let y = r.y + 6; y < r.y + r.h - 6; y += 4) {
    const v = (y + 1 - cy) / R0;
    const av = Math.abs(v);
    if (av > 0.94) continue;
    if (av > 0.6 && hash2(y, seed, 81) < (av - 0.6) * 1.6) continue;
    const half = Math.sqrt(1 - v * v) * R0 * (0.82 + hash2(y, seed, 82) * 0.18);
    let x = Math.round(cx - half + rng.int(0, 5));
    const end = cx + half;
    while (x < end - 3) {
      const u = Math.abs(x - cx) / R0;
      const d = Math.sqrt(u * u + v * v);
      const len = Math.min(Math.round(end - x), d < 0.35 ? rng.int(14, 34) : d < 0.7 ? rng.int(7, 16) : rng.int(3, 8));
      const gap = d < 0.35 ? rng.int(1, 3) : d < 0.7 ? rng.int(3, 7) : rng.int(6, 14);
      const tone = d < 0.3 ? 4 : d < 0.6 ? 3 : 2;
      for (let q = 0; q < len; q++) {
        const tip = q === 0 || q === len - 1;
        // (Lit paint, tinted per light by the batch: it dims and brightens with the street like the puddles' columns.)
        b.set(x + q, y, g, tip ? tone - 1 : tone);
        if (!tip && d < 0.75) b.set(x + q, y + 1, g, tone - 1);
      }
      x += len + gap;
    }
  }
}

/** The oil decal: a dark lobed stain, darker heart, a broken rainbow along its near rim. */
function oilStainDecal(b: Brush2, rng: PwRng, P: Z1GroundRamps, r: DecalRect) {
  const w = r.w - 8;
  const h = r.h - 8;
  const s = shore(rng, w, h, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!s.m[y * w + x]) continue;
      const dn = y === h - 1 || !s.m[(y + 1) * w + x] || x === w - 1 || !s.m[y * w + x + 1];
      const dn2 = y >= h - 2 || !s.m[(y + 2) * w + x] || x >= w - 2 || !s.m[y * w + x + 2];
      const u = (x - w / 2) / (w / 2);
      const v = (y - h / 2) / (h / 2);
      let rm = P.tar;
      let t = u * u + v * v < 0.25 ? 2 : 3;
      if (dn && dashAt(x + y, 3, 3, 7, 1, 2)) (rm = P.oilP), (t = 2);
      else if (dn2 && dashAt(x + y, 5, 3, 7, 1, 3)) (rm = P.oilT), (t = 3);
      b.set(r.x + 4 + x, r.y + 4 + y, rm, t);
    }
  }
  b.sheen(rng, r.x + 12, r.y + 10, w - 20, h - 16, 6, P.sky, 1, { min: 5, max: 12, drifts: 1, fat: 0, only: (rm) => rm === P.tar });
}
