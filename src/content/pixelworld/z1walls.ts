import { PwCanvas, PwRng } from './canvas';
import type { PwAtlas, PwKit, PwPainter, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';
import { NEUTRAL_HEX } from './retexture';

/**
 * MAIN STREET wall surfaces for ART: PIXEL WORLD with the wear COMPOSED, not
 * sprinkled: the wrap tiles are calm (a render with a few broad, low-contrast
 * re-render patches and a hairline crack; concrete panels with their joints and
 * form ties), and the story is told by decals the facade lays where a building
 * really weathers — rain streaks run down from under the window sills, a few
 * big patches where the render has come away and the brick shows (crisp
 * broken edges, the lip lit on one side), near the corners and the foot.
 * NEUTRAL tiles: the building's colour comes from the vertex tint.
 */

/** Calm render (NEUTRAL), 128 × 128 wrap. */
export function z1PlasterTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile('z1plaster', 128, 128, paintZ1Plaster, { wrap: true });
  t.neutral = NEUTRAL_HEX;
  return t;
}

export function paintZ1Plaster(c: PwCanvas, k: PwKit) {
  const rng = k.rng;
  const a = k.ramp(NEUTRAL_HEX, { light: 0.34, sat: 0.95 });
  // A second render, a shade off (re-rendered patches: broad, straight-edged, low contrast).
  const b = k.ramp(0xcfcfcf, { light: 0.34, sat: 0.95 });
  c.rect(0, 0, c.w, c.h, a, 3);
  for (let p = 0; p < 2; p++) {
    const x0 = rng.int(0, c.w - 1);
    const y0 = rng.int(0, c.h - 1);
    const w = rng.int(30, 60);
    const h = rng.int(20, 44);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // A trowelled edge: straight runs with a step or two.
        if (x < Math.floor(hash2(y >> 3, p, 3) * 3)) continue;
        c.set((x0 + x) % c.w, (y0 + y) % c.h, b, 3);
      }
    }
  }
  // Broad, very soft mottling (one step, big shapes, never speckle).
  for (let y = 0; y < c.h; y += 2) {
    for (let x = 0; x < c.w; x += 2) {
      if (smooth(x, y, c.w, c.h, 3, 41) > 0.78) for (let j = 0; j < 4; j++) c.shift(x + (j & 1), y + (j >> 1), 0.6);
    }
  }
  // Trowel grain: a few short lit drags, a handful of pocks.
  for (let i = 0; i < 14; i++) {
    const x = rng.int(0, c.w - 8);
    const y = rng.int(0, c.h - 1);
    for (let j = 0; j < rng.int(3, 7); j++) c.shift(x + j, y, 0.6);
  }
  c.scatter(rng, 0, 0, c.w, c.h, 12, 0, -1, { shapes: 3 });
  // One hairline crack.
  let x = rng.int(10, c.w - 10);
  let y = rng.int(10, 40);
  for (let i = 0; i < 40; i++) {
    c.shift(x, y, -1.2);
    y++;
    if (rng.chance(0.4)) x += rng.chance(0.5) ? 1 : -1;
    if (y >= c.h) break;
  }
}

/** Concrete panels (NEUTRAL), 192 × 96 wrap: joints, form ties, a couple of rust runs — no blotches. */
export function z1PanelTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile('z1panel', 192, 96, paintZ1Panel, { wrap: true });
  t.neutral = NEUTRAL_HEX;
  return t;
}

export function paintZ1Panel(c: PwCanvas, k: PwKit) {
  const rng = k.rng;
  const base = k.ramp(NEUTRAL_HEX, { light: 0.36, sat: 0.85 });
  const alt = k.ramp(0xcdcdcd, { light: 0.36, sat: 0.85 });
  const rust = k.ramp(0x8a4a24, { light: 0.4 });
  const PW = 48;
  const PH = 24;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const px = Math.floor(x / PW);
      const py = Math.floor(y / PH);
      const lx = x % PW;
      const ly = y % PH;
      const r = hash2(px, py, 21) > 0.6 ? alt : base;
      let t = 3;
      if (ly === 0) t = 1.6;
      else if (ly === 1) t = 4;
      if (lx === 0) t = Math.min(t, 2);
      c.set(x, y, r, t);
    }
  }
  for (let py = 0; py < c.h / PH; py++) {
    for (let px = 0; px < c.w / PW; px++) {
      for (const [fx, fy] of [
        [0.25, 0.5],
        [0.75, 0.5],
      ]) {
        const x = Math.floor(px * PW + fx * PW);
        const y = Math.floor(py * PH + fy * PH);
        c.shift(x, y, -1.5);
        c.shift(x, y + 1, 0.6);
        if (hash2(x, y, 4) < 0.18) for (let j = 2; j < rng.int(5, 12); j++) c.tint(x, (y + j) % c.h, rust, -0.5);
      }
    }
  }
}

/** Wear decals: where they sit on the sheet (texels, y down). */
export const Z1_WEAR = {
  /** Render come away, brick showing (untinted brick, the lips in neutral render shades). */
  holeA: { x: 0, y: 0, w: 48, h: 32 },
  holeB: { x: 48, y: 0, w: 32, h: 32 },
  holeC: { x: 80, y: 0, w: 48, h: 32 },
} as const;

/** The brick-hole sheet (128 × 32, cut-out; NOT tinted: the brick keeps its own colour). */
export function z1BrickHoles(atlas: PwAtlas): PwTile {
  return atlas.tile('z1wear|holes', 128, 32, paintHoles);
}

function paintHoles(c: PwCanvas, k: PwKit) {
  const brick = k.ramp(0x7a3a2c, { light: 0.4 });
  const mortar = k.ramp(0x8a8478, { light: 0.32, sat: 0.6 });
  const lip = k.ramp(0xa8a49c, { light: 0.35, sat: 0.5 });
  for (const [i, r] of Object.values(Z1_WEAR).entries()) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const rx = r.w / 2 - 2;
    const ry = r.h / 2 - 2;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        // A ragged outline in 2-texel steps (broken render, not an ellipse).
        const d = u * u + v * v + (hash2((x - r.x) >> 1, (y - r.y) >> 1, 11 + i) - 0.5) * 0.55;
        if (d > 1.12) continue;
        if (d > 0.86) {
          // Broken render lip: the upper-left edge in shadow, the lower-right edge catching the light.
          c.set(x, y, lip, u + v > 0 ? 4 : 1);
          continue;
        }
        const row = Math.floor((y - r.y) / 4);
        const off = row % 2 ? 5 : 0;
        const mx = (x - r.x + off) % 11 === 0;
        const my = (y - r.y) % 4 === 0;
        if (mx || my) c.set(x, y, mortar, my ? 1 : 2);
        else c.set(x, y, brick, hash2(Math.floor((x - r.x + off) / 11), row, 3 + i) > 0.7 ? 2 : (y - r.y) % 4 === 1 ? 4 : 3);
      }
    }
  }
}

/** Rain streaks running down from a sill (NEUTRAL, tinted with the wall), 32 × 48 cut-out: two variants side by side (64 × 48). */
export function z1Streaks(atlas: PwAtlas): PwTile {
  const t = atlas.tile('z1wear|streaks', 64, 48, paintStreaks);
  t.neutral = NEUTRAL_HEX;
  return t;
}

function paintStreaks(c: PwCanvas, k: PwKit) {
  const r = k.ramp(NEUTRAL_HEX, { light: 0.34, sat: 0.95 });
  for (let v = 0; v < 2; v++) {
    const x0 = v * 32;
    for (let i = 0; i < 7; i++) {
      const x = x0 + 3 + Math.floor(hash2(i, v, 5) * 26);
      const len = 10 + Math.floor(hash2(i, v, 6) * 34);
      const w = hash2(i, v, 7) > 0.6 ? 2 : 1;
      for (let y = 0; y < len; y++) {
        // Darker at the sill, breaking into a dither toward the end.
        const t = y / len;
        if (t > 0.55 && ((x + y) & 1) === 0 && hash2(x, y, 9) < (t - 0.55) / 0.45) continue;
        for (let j = 0; j < w; j++) c.set(x + j, y, r, t < 0.3 ? 1.4 : 2);
      }
    }
  }
}

// ─── Foot / head bands ──────────────────────────────────────────────────────

/** FNV-1a (the atlas seeds a tile's painter RNG with its key the same way). */
function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const BAND = 48;

/**
 * A wall's weathered FOOT (rising damp, splash-back ~1.25 m) and HEAD (drip
 * stains under the cornice ~1 m) as SHORT wrap bands (the base tile's width ×
 * 48 rows) cut from the base pattern (same painter, same seed: the bricks run
 * on without a seam) — the bands only ever show their bottom / top rows, so a
 * full-height copy of the wall for each would paint and pack ~2.7× the texels.
 * Lay the foot from v 0; lay the head with `v0: headV0` (its rows are the
 * base's top rows, exactly where a full-height head variant put them).
 */
export function z1WallBands(atlas: PwAtlas, base: PwTile, paint: PwPainter): { foot: PwTile; head: PwTile; headV0: number } {
  // The base pattern is painted once for both bands (per atlas palette: ramp indices belong to it).
  let memo: { pal: unknown; full: PwCanvas } | null = null;
  const cut = (c: PwCanvas, k: PwKit, top: boolean) => {
    if (!memo || memo.pal !== k.pal) {
      const f = new PwCanvas(base.w, base.h);
      paint(f, { ...k, rng: new PwRng(fnv(base.key)) });
      memo = { pal: k.pal, full: f };
    }
    const full = memo.full;
    const y0 = top ? 0 : base.h - BAND;
    const n = base.w * BAND;
    c.ramp.set(full.ramp.subarray(y0 * base.w, y0 * base.w + n));
    c.tone.set(full.tone.subarray(y0 * base.w, y0 * base.w + n));
    c.flag.set(full.flag.subarray(y0 * base.w, y0 * base.w + n));
  };
  const foot = atlas.tile(
    `${base.key}|foot${BAND}`,
    base.w,
    BAND,
    (c, k) => {
      cut(c, k, false);
      const rows = 40;
      for (let y = c.h - rows; y < c.h; y++) {
        const t = (y - (c.h - rows)) / rows;
        for (let x = 0; x < c.w; x++) {
          const edge = 0.35 + smooth(x, 0, c.w, 8, 6, 3) * 0.4;
          if (t > edge) c.shift(x, y, -1);
          if (t > 0.85) c.shift(x, y, -1);
        }
      }
      c.scatter(new PwRng(fnv(`${base.key}|foot`)), 0, c.h - 14, c.w, 14, 30, 0, -1, { shapes: 4 });
    },
    { wrap: true, density: base.density },
  );
  const head = atlas.tile(
    `${base.key}|head${BAND}`,
    base.w,
    BAND,
    (c, k) => {
      cut(c, k, true);
      for (let x = 0; x < c.w; x++) {
        const len = Math.round(4 + smooth(x, 0, c.w, 8, 10, 7) * 26 * (hash2(x >> 2, 1, 5) > 0.4 ? 1 : 0.3));
        for (let y = 0; y < len; y++) if (y < len * 0.6 || hash2(x, y, 9) > (y / len) * 0.9) c.shift(x, y, -1);
      }
    },
    { wrap: true, density: base.density },
  );
  foot.neutral = head.neutral = base.neutral;
  return { foot, head, headV0: BAND - 32 };
}
