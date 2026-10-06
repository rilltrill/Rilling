import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_5x7 } from './font';
import { darken, hash2 } from './surfaces';

/**
 * ST. MERCY HOSPITAL decals (cut-out modules laid a few millimetres off a
 * surface): the storytelling layer over the wrap tiles — water stains and
 * cracks, ghosts of pictures taken down, blood (hand prints, wipes, spatter,
 * pools, drag trails, words), scattered charts, ceiling holes. Stains are
 * painted per wall colour (tinted toward it) so they sit IN the paint instead
 * of floating on it. Density: 32 texels a metre like everything else.
 */


const BLOOD = 0x6a0c0c;
/** The grey the NEUTRAL stain decals are painted round (tinted per wall / floor / ceiling colour). */
export const STAIN_BASE = 0xd0ccc4;
const BLOOD_DARK = 0x3a0606;

/** Wet-blood ramps (fresh red / old brown) for a painter. */
function bloodRamps(k: { ramp(hex: number, o?: object): number }) {
  return { fresh: k.ramp(BLOOD, { light: 0.45, sat: 1.15 }), old: k.ramp(BLOOD_DARK, { light: 0.4, sat: 1.1 }) };
}

/** An irregular blob mask (radius wobble) — true inside. */
function blobIn(x: number, y: number, cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.28): boolean {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const d2 = dx * dx + dy * dy;
  // Cheap rejects outside the wobble's range.
  const lo = 1 - wob;
  const hi = 1 + wob;
  if (d2 < lo * lo) return true;
  if (d2 > hi * hi) return false;
  const a = Math.atan2(dy, dx);
  const r = 1 + wob * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 + seed * 2.1) * 0.3 + Math.sin(a * 9 + seed * 0.7) * 0.2);
  return d2 < r * r;
}

// ─── Wall decals ─────────────────────────────────────────────────────────────

/**
 * Water stain on a painted wall (NEUTRAL: tinted per wall): a tide-marked
 * bloom (a darker ring, a tea-coloured inside broken into clusters), runs
 * dribbling down from its lower edge. 40 × 48.
 */
export function waterStainDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2stain|${variant}`, 40, 48, (c, k) => {
    const rng = k.rng;
    const ring = k.ramp(0x9a8a70, { light: 0.35, sat: 0.9 });
    const fill = k.ramp(0xc4b8a0, { light: 0.35, sat: 0.85 });
    const cx = 20;
    const cy = 15 + variant * 2;
    const rx = 15 - variant * 3;
    const ry = 11;
    const seed = variant * 3.1 + 1;
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 40; x++) {
        if (!blobIn(x, y, cx, cy, rx, ry, seed)) continue;
        const edge = !blobIn(x, y, cx, cy, rx - 1.6, ry - 1.4, seed);
        const inner = !blobIn(x, y, cx + 2, cy + 1, rx * 0.62, ry * 0.6, seed + 2) && blobIn(x, y, cx + 2, cy + 1, rx * 0.62 + 1, ry * 0.6 + 1, seed + 2);
        if (edge || inner) c.set(x, y, ring, hash2(x, y, 3) > 0.85 ? 2 : 3);
      }
    }
    // Inside: tea-coloured clusters, denser toward the bottom (where the water pooled).
    for (let i = 0; i < 70; i++) {
      const x = rng.int(cx - rx + 2, cx + rx - 3);
      const y = rng.int(cy - ry + 2, cy + ry - 2);
      if (blobIn(x, y, cx, cy, rx - 2, ry - 2, seed) && rng.next() < (y - (cy - ry)) / (ry * 2)) c.cluster(x, y, rng.int(0, 9), fill, 3);
    }
    for (let i = 0; i < 2 + variant; i++) {
      let x = cx - rx * 0.6 + rng.next() * rx * 1.2;
      const len = rng.int(8, 18);
      for (let j = 0; j < len; j++) {
        const y = Math.round(cy + ry * 0.7 + j);
        if (y >= c.h) break;
        if (j > len * 0.6 && bayer(Math.round(x), y) < (j - len * 0.6) / (len * 0.4)) continue;
        c.set(Math.round(x), y, ring, 3);
        if (rng.chance(0.08)) x += rng.chance(0.5) ? 1 : -1;
      }
    }
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Ghost of a picture / notice board that hung here (NEUTRAL): an unfaded rectangle, a nail hole, a tape curl. */
export function pictureGhostDecal(atlas: PwAtlas, variant = 0): PwTile {
  const W = variant ? 28 : 40;
  const H = variant ? 36 : 30;
  const t = atlas.tile(`z2ghost|${variant}`, W, H, (c, k) => {
    const fresh = k.ramp(0xe6e2d8, { light: 0.3, sat: 0.8 });
    const dirt = k.ramp(0xa8a49a, { light: 0.35 });
    c.rect(0, 0, W, H, fresh, 3);
    c.hline(0, 0, W, dirt, 3);
    c.vline(W - 1, 0, H, dirt, 3);
    c.set(W >> 1, 2, dirt, 0);
    c.set((W >> 1) + 1, 3, fresh, 5);
    c.rect(1, H - 4, 3, 3, fresh, 4);
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Plaster crack from a corner (NEUTRAL): a split with a lit lip, a spall at the root. 32 × 48. */
export function wallCrackDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2crack|${variant}`, 32, 48, (c, k) => {
    const rng = k.rng;
    const w = k.ramp(STAIN_BASE, { light: 0.4, sat: 0.95 });
    const dark = k.ramp(darken(STAIN_BASE, 0.45), { light: 0.3 });
    const run = (x: number, y: number, a: number, len: number, depth: number) => {
      for (let i = 0; i < len; i++) {
        const ix = Math.round(x);
        const iy = Math.round(y);
        if (ix < 1 || iy < 1 || ix > 30 || iy > 46) return;
        c.set(ix, iy, dark, 1);
        c.set(ix + 1, iy, w, 4);
        a += rng.spread(0.45);
        x += Math.cos(a);
        y += Math.sin(a);
        if (depth < 2 && rng.chance(0.07)) run(x, y, a + (rng.chance(0.5) ? 0.9 : -0.9), Math.floor(len * 0.45), depth + 1);
      }
    };
    run(variant ? 4 : 16, 2, Math.PI / 2 + rng.spread(0.3), 42, 0);
    c.ellipse(variant ? 5 : 16, 4, 3, 2, w, 2);
    c.hline(variant ? 3 : 14, 2, 5, dark, 2);
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Bloody hand prints sliding down a wall (2–3 hands, smeared, dripping). 40 × 48. */
export function handprintDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2hands|${variant}`, 40, 48, (c, k) => {
    const rng = k.rng;
    const { fresh, old } = bloodRamps(k);
    const hand = (hx: number, hy: number, slide: number, r: number) => {
      // Palm, four fingers up, a thumb out to the side; the slide drags the palm down.
      for (let s = 0; s <= slide; s++) c.ellipse(hx, hy + s, 3.2, 3.6, r, s === 0 ? 3 : 2);
      for (let f = 0; f < 4; f++) {
        const fx = hx - 3 + f * 2;
        const fl = f === 1 || f === 2 ? 5 : 4;
        for (let j = 0; j < fl; j++) c.set(fx + (j > 3 ? (f < 2 ? -1 : 1) : 0), hy - 4 - j, r, j === fl - 1 ? 4 : 3);
      }
      c.line(hx + 3, hy, hx + 6, hy - 3, r, 3);
      // Highlights where it's still wet.
      c.set(hx - 1, hy - 1, r, 5);
    };
    hand(12, 14, rng.int(2, 6), fresh);
    hand(26, 20 + variant * 3, rng.int(5, 10), variant ? old : fresh);
    if (variant === 0) hand(20, 34, 3, old);
    // Drips.
    for (let i = 0; i < 5; i++) {
      const x = rng.int(6, 33);
      const y0 = rng.int(20, 34);
      const len = rng.int(4, 14);
      for (let j = 0; j < len; j++) if (y0 + j < 48) c.set(x, y0 + j, j < len - 1 ? old : fresh, j === len - 1 ? 2 : 3);
    }
  });
}

/** A wiped smear of blood along a wall (somebody dragged themselves), drips below. 72 × 32. */
export function bloodWipeDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2wipe|${variant}`, 72, 32, (c, k) => {
    const rng = k.rng;
    const { fresh, old } = bloodRamps(k);
    let y = 10 + variant * 3;
    for (let x = 2; x < 70; x++) {
      y += rng.chance(0.15) ? (rng.chance(0.5) ? 1 : -1) : 0;
      y = Math.max(6, Math.min(16, y));
      const w = Math.max(1, Math.round(5 * (1 - x / 85) + Math.sin(x * 0.4) * 1.2));
      for (let j = -w; j <= w; j++) {
        // Streaky: the fingers / cloth leave stripes along the wipe.
        if ((j + 50) % 3 === 0 && x > 8 && hash2(x >> 2, j, 9) > 0.35) continue;
        c.set(x, y + j, x < 20 ? fresh : old, Math.abs(j) === w ? 2 : j === -w + 1 ? 4 : 3);
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = rng.int(4, 60);
      for (let j = 0; j < rng.int(4, 14); j++) if (18 + j < 32) c.set(x, 14 + j, old, 3);
    }
  });
}

/** Spatter: a burst of droplets thrown at a wall (radial, elongated away from the centre). 48 × 48. */
export function spatterDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2spatter|${variant}`, 48, 48, (c, k) => {
    const rng = k.rng;
    const { fresh, old } = bloodRamps(k);
    c.ellipse(24, 22, 6, 5, fresh, 3);
    c.set(22, 20, fresh, 5);
    for (let i = 0; i < 40; i++) {
      const a = rng.next() * 6.28;
      const d = 6 + Math.pow(rng.next(), 1.5) * 18;
      const x = 24 + Math.cos(a) * d;
      const y = 22 + Math.sin(a) * d * 0.9;
      const len = rng.int(1, 3);
      for (let j = 0; j < len; j++) c.set(Math.round(x + Math.cos(a) * j), Math.round(y + Math.sin(a) * j), j ? old : fresh, 3);
    }
    // Runs from the main blot.
    for (let i = 0; i < 3; i++) {
      const x = rng.int(20, 28);
      for (let j = 0; j < rng.int(8, 20); j++) if (26 + j < 48) c.set(x, 26 + j, old, j % 5 === 4 ? 2 : 3);
    }
    void variant;
  });
}

/** A message daubed in blood with a finger (wobbly 5×7 letters at ×2, runs under them). */
export function bloodWordsDecal(atlas: PwAtlas, text: string): PwTile {
  const W = Math.min(256, text.length * 13 + 12);
  return atlas.tile(`z2words|${text}`, Math.ceil(W / 2) * 2, 36, (c, k) => {
    const rng = k.rng;
    const { fresh, old } = bloodRamps(k);
    // Draw the letters, then jitter each column a little (a shaky hand).
    const tmp = c;
    drawText(tmp, text, 6, 6, FONT_5x7, fresh, 3, { scale: 2, spacing: 1 });
    for (let x = 0; x < c.w; x++) {
      const dy = Math.round(Math.sin(x * 0.21 + 1.3) * 1.2);
      if (!dy) continue;
      const col: [number, number][] = [];
      for (let y = 0; y < c.h; y++) {
        const i = y * c.w + x;
        col.push([c.ramp[i], c.tone[i]]);
      }
      for (let y = 0; y < c.h; y++) {
        const sy = y - dy;
        const [r, t] = sy >= 0 && sy < c.h ? col[sy] : [0, 0];
        if (r) c.set(x, y, r, t);
        else c.ramp[y * c.w + x] = 0;
      }
    }
    // Runs from the bottoms of strokes; thin strokes darker (the finger running dry).
    for (let x = 0; x < c.w; x++) {
      for (let y = c.h - 2; y > 0; y--) {
        if (c.at(x, y) && !c.at(x, y + 1) && rng.chance(0.18)) {
          const len = rng.int(2, 9);
          for (let j = 1; j <= len; j++) if (y + j < c.h) c.set(x, y + j, old, j === len ? 2 : 3);
          break;
        }
      }
    }
    for (let i = 0; i < 30; i++) {
      const x = rng.int(0, c.w - 1);
      const y = rng.int(0, c.h - 1);
      if (c.at(x, y) === fresh) c.set(x, y, fresh, rng.chance(0.3) ? 4 : 2);
    }
  });
}

// ─── Floor decals ────────────────────────────────────────────────────────────

/** A pool of blood (top view): ragged edge a step dark, glossy sheen spots, satellite drops. 64 × 56. */
export function bloodPoolDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2pool|${variant}`, 64, 56, (c, k) => {
    const rng = k.rng;
    const { fresh, old } = bloodRamps(k);
    const seed = variant * 2.3 + 0.7;
    for (let y = 0; y < 56; y++) {
      for (let x = 0; x < 64; x++) {
        if (!blobIn(x, y, 32, 28, 22 - variant * 2, 18, seed, 0.35)) continue;
        const edge = !blobIn(x, y, 32, 28, 20 - variant * 2, 16, seed, 0.35);
        const core = blobIn(x, y, 30, 26, 12, 9, seed + 1, 0.3);
        c.set(x, y, core ? old : fresh, edge ? 2 : core ? 2 : 3);
      }
    }
    // Sheen: the lights catch the wet surface in a couple of short arcs.
    for (let i = 0; i < 3; i++) {
      const x = rng.int(18, 40);
      const y = rng.int(16, 34);
      for (let j = 0; j < rng.int(2, 5); j++) if (c.at(x + j, y)) c.set(x + j, y, fresh, j === 0 ? 5 : 4);
    }
    for (let i = 0; i < 12; i++) {
      const a = rng.next() * 6.28;
      const d = 22 + rng.next() * 8;
      c.ellipse(32 + Math.cos(a) * d, 28 + Math.sin(a) * d * 0.8, rng.range(0.8, 1.8), rng.range(0.8, 1.5), fresh, 3);
    }
  });
}

/**
 * Drag trail (wrap along v: laid as a ribbon along the drag path): a smeared
 * band with streaks along it, dragged fingers at the edges, a gap now and then.
 * 24 × 96 (0.75 × 3 m).
 */
export function dragTrailTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z2drag', 32, 96, (c, k) => {
    const rng = k.rng;
    const { fresh, old } = bloodRamps(k);
    for (let y = 0; y < c.h; y++) {
      const ph = (y / c.h) * Math.PI * 2;
      const cx = 16 + Math.round(Math.sin(ph * 2) * 2.2 + Math.sin(ph * 3 + 1) * 1.2);
      const w = 3 + Math.round(Math.abs(Math.sin(ph * 3 + 0.4)) * 3 + Math.sin(ph * 7) * 0.8);
      // The body lifted off the floor for a stretch: only the hands' streaks remain.
      const gap = Math.sin(ph + 1.3) > 0.9;
      for (let x = cx - w - 2; x <= cx + w + 2; x++) {
        const d = Math.abs(x - cx);
        if (d > w) {
          // Ragged fringe: drops and finger streaks outside the band.
          if (hash2(x, y >> 1, 7) > 0.86) c.set(x, y, old, 2);
          continue;
        }
        if (gap && d < w - 1) continue;
        // Streaks along the drag (cloth / fingers), the wet middle fresher, edges dried dark.
        const streak = hash2(x, y >> 3, 3) > 0.7;
        const edge = d >= w - 1;
        if (edge && bayer(x, y) < 0.35) continue;
        c.set(x, y, edge || streak ? old : fresh, edge ? 2 : streak ? 2 : 3);
      }
      if (!gap && hash2(cx, y, 9) > 0.93) c.set(cx - 1, y, fresh, 5);
    }
    void rng;
  }, { wrap: true });
}

/** Scattered charts / forms (cut out): 3–4 sheets with typed lines and a header, one with a footprint. 56 × 48. */
export function papersDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2papers|${variant}`, 40, 32, (c, k) => {
    const rng = k.rng;
    const paper = [k.ramp(0xd8d6c8, { light: 0.3, sat: 0.5 }), k.ramp(0xd0c49a, { light: 0.3, sat: 0.6 }), k.ramp(0xb0c0d0, { light: 0.3, sat: 0.6 })];
    const { old } = bloodRamps(k);
    const n = 2 + (variant % 2);
    for (let i = 0; i < n; i++) {
      const cx = rng.int(9, 31);
      const cy = rng.int(8, 24);
      const a = rng.spread(0.9);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const hw = 3.5;
      const hh = 4.5;
      const pr = paper[rng.int(0, 2)];
      const pts: number[] = [];
      for (const [u, v] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) pts.push(cx + u * ca - v * sa, cy + u * sa + v * ca);
      c.poly(pts, pr, 3);
      // Typed lines: a step down on the sheet, every other row.
      for (let v = -hh + 2; v < hh - 1; v += 2) for (let u = -hw + 1.5; u < hw - 1; u++) c.shift(Math.round(cx + u * ca - v * sa), Math.round(cy + u * sa + v * ca), -1, pr);
    }
    if (variant === 1) {
      c.ellipse(20, 13, 2, 3, old, 3);
      c.ellipse(21, 18, 1.6, 1.6, old, 3);
    }
  });
}

/** A floor drain: round grate in a dished square of stained tile. 20 × 20. */
export function drainDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z2drain', 20, 20, (c, k) => {
    const m = k.ramp(0x6a6e6a, { light: 0.5, sat: 0.6 });
    const rust = k.ramp(0x6a3a1c, { light: 0.4 });
    c.ellipse(10, 10, 9, 9, rust, 2);
    c.ellipse(10, 10, 7, 7, m, 3);
    for (let y = 5; y < 16; y += 2) c.hline(5, y, 11, m, 0);
    c.set(6, 6, m, 5);
    c.ellipseShade(10, 10, 9.5, 9.5, (d) => (d > 0.85 ? -1 : 0));
  });
}

/** Spilled pills, a syringe and a dropped glove (top view). 32 × 24. */
export function pillsDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z2pills', 32, 24, (c, k) => {
    const rng = k.rng;
    const pill = [k.ramp(0xe8e4d8, { light: 0.3 }), k.ramp(0xd85a3a, { light: 0.4 }), k.ramp(0x4a8ad8, { light: 0.4 })];
    const glove = k.ramp(0x8ab0d8, { light: 0.4 });
    const steel = k.ramp(0xb8c0c4, { light: 0.5 });
    for (let i = 0; i < 14; i++) {
      const x = rng.int(2, 20);
      const y = rng.int(2, 20);
      const p = pill[i % 3];
      c.set(x, y, p, 4);
      c.set(x + 1, y, p, 2);
    }
    // Syringe: barrel, plunger, needle.
    c.line(18, 6, 28, 10, steel, 4);
    c.line(18, 7, 28, 11, steel, 2);
    c.line(28, 10, 31, 11, steel, 5);
    // Glove: palm + fingers.
    c.ellipse(9, 16, 4, 3, glove, 3);
    for (let f = 0; f < 4; f++) c.line(6 + f * 2, 13, 5 + f * 2, 10, glove, 3);
  });
}

export function floorStainDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2fstain|${variant}`, 48, 32, (c, k) => {
    const s = k.ramp(variant ? 0x8a8070 : 0x908c84, { light: 0.35 });
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 48; x++) {
        if (!blobIn(x, y, 24, 16, 20, 12, variant + 4.2, 0.32)) continue;
        const edge = !blobIn(x, y, 24, 16, 18.5, 10.5, variant + 4.2, 0.32);
        if (!edge && hash2(x >> 1, y >> 1, 5) > 0.45) continue;
        c.set(x, y, s, edge ? 2 : 3);
      }
    }
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Floor crack in tile / screed with a lifted chip (NEUTRAL). 40 × 24. */
export function floorCrackDecal(atlas: PwAtlas): PwTile {
  const t = atlas.tile('z2fcrack', 40, 24, (c, k) => {
    const rng = k.rng;
    const d = k.ramp(darken(STAIN_BASE, 0.45), { light: 0.3 });
    const l = k.ramp(STAIN_BASE, { light: 0.45 });
    let x = 2;
    let y = 12;
    let a = rng.spread(0.3);
    for (let i = 0; i < 38; i++) {
      c.set(Math.round(x), Math.round(y), d, 1);
      c.set(Math.round(x), Math.round(y) + 1, l, 4);
      a += rng.spread(0.5);
      a = Math.max(-0.8, Math.min(0.8, a));
      x += Math.cos(a);
      y += Math.sin(a);
      if (y < 2 || y > 21) a = -a;
    }
  });
  t.neutral = STAIN_BASE;
  return t;
}

// ─── Ceiling decals ──────────────────────────────────────────────────────────

/**
 * A missing ceiling tile (1 m, sits in the grid): the black void of the
 * plenum, a duct's lit underside crossing it, a cable loop, insulation tufts,
 * the broken edge of the tile left in the grid. 32 × 32.
 */
export function ceilingHoleDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2hole|${variant}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const voidR = k.ramp(0x101214, { light: 0.3 });
    const duct = k.ramp(0x7a7e80, { light: 0.5, sat: 0.5 });
    const ins = k.ramp(0xc8a860, { light: 0.4 });
    const cable = k.ramp(0x2a2a30, { light: 0.4 });
    c.rect(1, 1, 30, 30, voidR, 1);
    if (variant === 0) {
      c.rect(1, 10, 30, 9, duct, 2);
      c.hline(1, 10, 30, duct, 4);
      c.hline(1, 18, 30, duct, 1);
      for (let x = 5; x < 31; x += 8) c.vline(x, 10, 9, duct, 1);
    } else {
      // A pipe with a bracket.
      c.rect(1, 20, 30, 3, duct, 3);
      c.hline(1, 20, 30, duct, 4);
      c.rect(14, 15, 2, 5, cable, 2);
    }
    for (let i = 0; i < 2; i++) {
      const x0 = rng.int(3, 26);
      for (let j = 0; j < 14; j++) c.set(x0 + Math.round(Math.sin(j * 0.5) * 3), 2 + j * 2, cable, 3);
    }
    for (let i = 0; i < 5; i++) c.cluster(rng.int(2, 28), rng.int(2, 28), rng.int(4, 9), ins, rng.chance(0.5) ? 2 : 3);
    // Broken tile edge left in the grid (top-left) and the grid's lip.
    c.poly([1, 1, 14, 1, 9, 5, 4, 4, 1, 8], k.ramp(0xb8bcb0, { light: 0.4, sat: 0.6 }), 2);
  });
}

/** A water-stained ceiling tile (NEUTRAL, sits in the grid): concentric tea rings, a sag line, mould dots. 32 × 32. */
export function ceilingStainDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2cstain|${variant}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const base = k.ramp(darken(STAIN_BASE, 0.94), { light: 0.4, sat: 0.7 });
    const ring = k.ramp(0x9a8462, { light: 0.35 });
    const mould = k.ramp(0x5a6050, { light: 0.3 });
    c.rect(1, 1, 30, 30, base, 3);
    for (let y = 1; y < 31; y++) {
      for (let x = 1; x < 31; x++) {
        const out = blobIn(x, y, 16, 15, 12, 11, variant + 1.3, 0.3);
        const ring1 = out && !blobIn(x, y, 16, 15, 10.5, 9.5, variant + 1.3, 0.3);
        const ring2 = blobIn(x, y, 17, 16, 6, 5, variant + 2.6, 0.3) && !blobIn(x, y, 17, 16, 4.8, 3.8, variant + 2.6, 0.3);
        if (ring1 || ring2) c.set(x, y, ring, 3);
        else if (out && hash2(x >> 1, y >> 1, 3) > 0.7) c.set(x, y, ring, 4);
      }
    }
    for (let i = 0; i < 8; i++) c.set(rng.int(4, 27), rng.int(4, 27), mould, 2);
    c.hline(4, 22, 24, base, 1);
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Rain puddle on asphalt (cut out): dark mirror water, sky glints, ripple rings (GLOW). 64 × 40. */
export function puddleDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2puddle|${variant}`, 64, 40, (c, k) => {
    const rng = k.rng;
    const w = k.ramp(0x1c2838, { light: 0.4, sat: 1 });
    const sky = k.ramp(0x5a6a90, { light: 0.4 });
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 64; x++) {
        if (!blobIn(x, y, 32, 20, 28, 16, variant * 1.7 + 0.4, 0.3)) continue;
        const edge = !blobIn(x, y, 32, 20, 26.5, 14.5, variant * 1.7 + 0.4, 0.3);
        c.set(x, y, w, edge ? 3 : y < 14 ? 2 : 1);
      }
    }
    // Reflected sky glow (the lamps / the city) as broken horizontal glints, and ripple rings (outdoors).
    const indoor = variant >= 2;
    for (let i = 0; i < (indoor ? 4 : 10); i++) {
      const x = rng.int(10, 50);
      const y = rng.int(8, 32);
      const len = rng.int(2, 6);
      for (let j = 0; j < len; j++) if (c.at(x + j, y)) c.set(x + j, y, indoor ? w : sky, indoor ? 4 : j % 3 === 0 ? 4 : 3, indoor ? 0 : PWF.GLOW);
    }
    for (let i = 0; i < (indoor ? 0 : 4); i++) {
      const cx = rng.int(14, 50);
      const cy = rng.int(10, 30);
      const r = rng.range(2, 4);
      for (let a = 0; a < 6.28; a += 0.35) {
        const x = Math.round(cx + Math.cos(a) * r * 1.6);
        const y = Math.round(cy + Math.sin(a) * r * 0.7);
        if (c.at(x, y)) c.set(x, y, sky, 2, PWF.GLOW);
      }
    }
  });
}


/**
 * Broken wall tiles (NEUTRAL: tinted to the wall's glaze; laid snapped to the
 * tile grid): two or three tiles knocked off showing the mortar bed with its
 * comb ridges, a cracked tile, chipped edges. 3 × 2 tiles of `tw` × `th`.
 */
export function brokenTilesDecal(atlas: PwAtlas, tw: number, th: number, variant = 0): PwTile {
  const W = tw * 3;
  const H = th * 2;
  const t = atlas.tile(`z2broken|${tw}x${th}|${variant}`, W, H, (c, k) => {
    const rng = k.rng;
    const tile = k.ramp(STAIN_BASE, { light: 0.5, sat: 0.95 });
    const bed = k.ramp(0x8a8478, { light: 0.35, sat: 0.6 });
    const cells: [number, number, 'gone' | 'crack'][] = variant
      ? [[0, 1, 'gone'], [1, 1, 'gone'], [1, 0, 'crack'], [2, 1, 'crack']]
      : [[1, 0, 'gone'], [2, 0, 'gone'], [2, 1, 'gone'], [0, 0, 'crack']];
    for (const [cx, cy, kind] of cells) {
      const x0 = cx * tw;
      const y0 = cy * th;
      if (kind === 'gone') {
        for (let y = y0; y < y0 + th; y++) for (let x = x0; x < x0 + tw; x++) c.set(x, y, bed, (y - y0) % 3 === 0 ? 2 : 3);
        // Shadow under the upper edge of the hole (the tile above stands proud), chipped rim.
        c.hline(x0, y0, tw, bed, 1);
        c.vline(x0, y0, th, bed, 1);
        for (let i = 0; i < 3; i++) c.set(x0 + rng.int(1, tw - 2), y0 + th - 1, tile, 4);
      } else {
        for (let y = y0 + 1; y < y0 + th; y++) for (let x = x0 + 1; x < x0 + tw; x++) c.set(x, y, tile, 3);
        let x = x0 + 1;
        let y = y0 + 1 + rng.int(0, th - 3);
        for (let i = 0; i < tw + th; i++) {
          if (x >= x0 + tw || y >= y0 + th || y <= y0) break;
          c.set(x, y, tile, 1);
          if (rng.chance(0.6)) x++;
          else y += rng.chance(0.5) ? 1 : -1;
        }
      }
    }
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** A dropped meal tray (top view): the tray, an upturned plate, spilled peas and a cup. 16 × 12. */
export function trayDecal(atlas: PwAtlas): PwTile {
  return atlas.tile('z2tray', 16, 12, (c, k) => {
    const tray = k.ramp(0xc8b8a0, { light: 0.35 });
    const plate = k.ramp(0xe8e8e0, { light: 0.25 });
    const pea = k.ramp(0x6a8a2a, { light: 0.4 });
    c.rect(0, 1, 13, 10, tray, 3);
    c.hline(0, 1, 13, tray, 4);
    c.ellipse(5, 6, 3.5, 3, plate, 3);
    c.set(4, 5, plate, 5);
    for (const [x, y] of [[10, 3], [11, 7], [13, 9], [14, 4], [9, 9]]) c.set(x, y, pea, 3);
    c.ellipse(11, 4, 1.6, 1.6, k.ramp(0x9a6a3a, { light: 0.4 }), 3);
  });
}

/**
 * Grime at the ceiling line (NEUTRAL, tinted to the wall; cut out): a ragged
 * dark band under the ceiling with dribbles running down from it, the ends
 * dithered off. Placed by rule along walls (never in the wall's repeat). 64 × 14.
 */
export function ceilingGrimeDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2cgrime|${variant}`, 64, 14, (c, k) => {
    const g = k.ramp(darken(STAIN_BASE, 0.78), { light: 0.35, sat: 0.7 });
    for (let x = 0; x < 64; x++) {
      const edge = Math.min(x, 63 - x) / 10;
      const band = Math.round(1 + hash2(x >> 2, variant, 3) * 2);
      for (let y = 0; y < band; y++) if (bayer(x, y) < Math.min(1, edge)) c.set(x, y, g, y === 0 ? 2 : 3);
      if (hash2(x, variant, 5) > 0.82 && edge > 0.5) {
        const len = 3 + Math.floor(hash2(x, variant, 6) * 10);
        for (let y = band; y < band + len; y++) if (!(y > band + len * 0.6 && bayer(x, y) < 0.5)) c.set(x, y, g, 3);
      }
    }
  });
  t.neutral = STAIN_BASE;
  return t;
}

/** Mop splash above the skirting (NEUTRAL, cut out): grey arcs and dots a hand high. 64 × 10. */
export function mopSplashDecal(atlas: PwAtlas, variant = 0): PwTile {
  const t = atlas.tile(`z2mop|${variant}`, 64, 10, (c, k) => {
    const rng = k.rng;
    const g = k.ramp(darken(STAIN_BASE, 0.8), { light: 0.35, sat: 0.6 });
    for (let i = 0; i < 9; i++) {
      const x0 = rng.int(4, 54);
      const w = rng.int(4, 10);
      for (let j = 0; j < w; j++) {
        const y = 9 - Math.round(Math.sin((j / w) * Math.PI) * rng.range(2, 5));
        c.set(x0 + j, y, g, 3);
      }
    }
    for (let i = 0; i < 24; i++) c.set(rng.int(2, 61), rng.int(1, 9), g, 3);
    for (let x = 0; x < 64; x++) if (hash2(x >> 1, variant, 8) > 0.5) c.set(x, 9, g, 2);
  });
  t.neutral = STAIN_BASE;
  return t;
}
