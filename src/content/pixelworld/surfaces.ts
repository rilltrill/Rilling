import { bayer, PwCanvas, PwRng } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';

/**
 * Tileable PixelWorld surfaces (wrap tiles, PW_TPM = 32 texels a metre).
 *
 * Every surface is painted the way 90s background artists painted walls and
 * floors (Doom / Duke Nukem 3D / Blood textures, Metal Slug streets): a few
 * flat ramp steps, designed units (bricks, slabs, boards, ribs, tiles) each
 * with its own tone and a lit / shadowed edge, hand-pixelled clusters for
 * chips, pebbles and grit, cracks drawn as 1-texel lines with a lit lip, and
 * weathering where weather puts it (streaks running DOWN, dirt at the FOOT,
 * moss on TOPS). No per-texel noise.
 *
 * Sizes are multiples of 16 and the period of every pattern divides the tile,
 * so tiles wrap seamlessly. Each helper registers (or fetches) its tile in an
 * atlas and returns the handle; the key encodes every parameter.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** Integer hash → [0, 1). */
export function hash2(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Wrapped coordinate. */
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Random walk crack (1 texel, wrapping) shading what is there; the lip below-right catches light. */
export function crack(c: PwCanvas, rng: PwRng, x: number, y: number, len: number, dir: number, o: { dt?: number; lip?: number; wrapX?: boolean; branch?: number } = {}) {
  let a = dir;
  let px = x;
  let py = y;
  const dt = o.dt ?? -1.5;
  for (let i = 0; i < len; i++) {
    const ix = o.wrapX === false ? Math.round(px) : wrap(Math.round(px), c.w);
    const iy = wrap(Math.round(py), c.h);
    c.shift(ix, iy, dt);
    if (o.lip !== 0) c.shift(wrap(ix + 1, c.w), wrap(iy + 1, c.h), o.lip ?? 0.6);
    a += rng.spread(0.6);
    px += Math.cos(a);
    py += Math.sin(a);
    if (o.branch && rng.chance(o.branch)) crack(c, rng, px, py, Math.floor(len * 0.4), a + rng.spread(1.2) + (rng.chance(0.5) ? 0.8 : -0.8), { ...o, branch: 0 });
  }
}

// ─── Walls ───────────────────────────────────────────────────────────────────

export interface BrickOpts {
  /** Brick colour (base step). */
  hex: number;
  /** Mortar colour. */
  mortar?: number;
  /** Painted brick (flatter, chipped paint showing red brick). */
  painted?: number;
  /** 0…1 grime streaks / soot. */
  grime?: number;
}

/** Running-bond brick: 11×4-texel bricks (34 × 12.5 cm), 176 × 128 tile (16 bricks × 32 courses). */
export function brickTile(atlas: PwAtlas, o: BrickOpts): PwTile {
  const key = `brick|${h6(o.hex)}|${h6(o.mortar ?? 0)}|${o.painted !== undefined ? h6(o.painted) : ''}|${o.grime ?? 0.5}`;
  return atlas.tile(key, 176, 128, (c, k) => paintBrick(c, k, o), { wrap: true });
}

export function paintBrick(c: PwCanvas, k: PwKit, o: BrickOpts) {
  const rng = k.rng;
  const base = k.ramp(o.hex, { light: 0.4 });
  const dark = k.ramp(darken(o.hex, 0.84), { light: 0.38 });
  const light = k.ramp(shiftHue(o.hex, 0.015, 1.04), { light: 0.42, dark: 0.4 });
  const mortar = k.ramp(o.mortar ?? mortarFor(o.hex), { light: 0.32, sat: 0.7 });
  const BW = 11;
  const BH = 4;
  const rows = c.h / BH;
  const cols = c.w / BW;
  // Mortar: vertical joints step 2, the bed joint above each course in shadow (step 1).
  c.rect(0, 0, c.w, c.h, mortar, 2);
  for (let y = 0; y < c.h; y += BH) c.hline(0, y, c.w, mortar, 1);
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? Math.floor(BW / 2) : 0;
    for (let b = 0; b < cols; b++) {
      const x0 = b * BW + off + 1;
      const y0 = r * BH + 1;
      const v = hash2(b, r, 7);
      const ramp = v < 0.17 ? dark : v > 0.93 ? light : base;
      // A lit top edge on some bricks (part of their length), a shaded lower-right corner on others.
      const litLen = hash2(b, r, 3) > 0.55 ? 3 + Math.floor(hash2(b, r, 5) * 6) : 0;
      const shadeCorner = hash2(b, r, 9) > 0.5;
      for (let y = 0; y < BH - 1; y++) {
        for (let x = 0; x < BW - 1; x++) {
          const px = wrap(x0 + x, c.w);
          let t = 3;
          if (y === 0 && x < litLen) t = 4;
          if (shadeCorner && y === BH - 2 && x >= BW - 4) t = 2;
          c.set(px, y0 + y, ramp, t);
        }
      }
      // Chipped corner: the joint shows through.
      if (hash2(b, r, 13) > 0.88) c.set(wrap(x0 + (hash2(b, r, 17) > 0.5 ? BW - 2 : 0), c.w), y0 + BH - 2, mortar, 1);
      // A spalled face now and then (a darker 2–3 texel pit with a lit lower lip).
      if (hash2(b, r, 19) > 0.94) {
        const px = wrap(x0 + 2 + Math.floor(hash2(b, r, 23) * 5), c.w);
        c.set(px, y0 + 1, ramp, 1);
        c.set(wrap(px + 1, c.w), y0 + 1, ramp, 2);
        c.set(wrap(px + 1, c.w), y0 + 2, ramp, 4);
      }
    }
  }
  if (o.painted !== undefined) {
    // Painted brick: flatten to the paint ramp, chipped where it peels (brick shows through).
    const paint = k.ramp(o.painted, { light: 0.38, sat: 0.9 });
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const i = y * c.w + x;
        if (blobs(x, y, c.w, c.h, 9, 0.2, 31)) continue;
        const m = c.ramp[i] === mortar;
        c.ramp[i] = paint;
        c.tone[i] = m ? (c.tone[i] < 1.5 ? 1 : 2) : c.tone[i];
      }
    }
  }
  weather(c, rng, 0, o.grime ?? 0.5);
}

export interface PlasterOpts {
  hex: number;
  /** Brick under spalled patches (0 = none). */
  under?: number;
  grime?: number;
}

/** Stucco / plaster: broad tone areas, hairline cracks, spalled patches showing brick, water stains. 128 × 128. */
export function plasterTile(atlas: PwAtlas, o: PlasterOpts): PwTile {
  const key = `plaster|${h6(o.hex)}|${o.under !== undefined ? h6(o.under) : ''}|${o.grime ?? 0.5}`;
  return atlas.tile(key, 128, 128, (c, k) => paintPlaster(c, k, o), { wrap: true });
}

export function paintPlaster(c: PwCanvas, k: PwKit, o: PlasterOpts) {
  const rng = k.rng;
  const base = k.ramp(o.hex, { light: 0.34, sat: 0.95 });
  c.rect(0, 0, c.w, c.h, base, 3);
  // Old render: patched areas a step lighter (newer plaster), worn areas a step darker.
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const n = smooth(x, y, c.w, c.h, 4, 5) * 0.7 + smooth(x, y, c.w, c.h, 16, 6) * 0.3;
      if (n > 0.8) c.set(x, y, base, 4);
      else if (n < 0.2) c.set(x, y, base, 2);
    }
  }
  // Pocks: sparse dark / lit clusters (the trowelled grain).
  c.scatter(rng, 0, 0, c.w, c.h, 70, 0, -1, { shapes: 3 });
  c.scatter(rng, 0, 0, c.w, c.h, 40, 0, 1, { shapes: 2 });
  // Spalled patches showing brick.
  if (o.under !== undefined) {
    const brick = k.ramp(o.under, { light: 0.4 });
    const mortar = k.ramp(mortarFor(o.under), { light: 0.32, sat: 0.7 });
    for (let p = 0; p < 2; p++) {
      const cx = rng.int(10, c.w - 30);
      const cy = rng.int(20, c.h - 20);
      const rx = rng.int(7, 13);
      const ry = rng.int(5, 8);
      for (let y = cy - ry - 1; y <= cy + ry + 1; y++) {
        for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
          const u = (x - cx) / rx;
          const v = (y - cy) / ry;
          const d = u * u + v * v + (hash2(x, y, 5) - 0.5) * 0.5;
          if (d > 1.15) continue;
          if (d > 0.85) {
            // Broken plaster edge: the upper-left lip in shadow, the lower-right lip lit.
            c.set(x, y, base, u + v > 0 ? 4 : 1);
            continue;
          }
          const row = Math.floor((y + 64) / 4);
          const bx = Math.floor((x + (row % 2 ? 5 : 0) + 64) / 11);
          const mx = (x + (row % 2 ? 5 : 0) + 64) % 11 === 0;
          const my = (y + 64) % 4 === 0;
          if (mx || my) c.set(x, y, mortar, my ? 1 : 2);
          else c.set(x, y, brick, hash2(bx, row, 3) > 0.7 ? 2 : (y + 64) % 4 === 1 ? 4 : 3);
        }
      }
    }
  }
  // Hairline cracks.
  for (let i = 0; i < 3; i++) crack(c, rng, rng.int(0, c.w - 1), rng.int(0, c.h - 1), rng.int(12, 26), Math.PI / 2 + rng.spread(0.7), { dt: -2, lip: 1, branch: 0.06 });
  weather(c, rng, 0, o.grime ?? 0.5);
}

export interface PanelOpts {
  hex: number;
  /** Panel size (texels, divides 192 × 96). */
  pw?: number;
  ph?: number;
  /** Rust under the form ties / bolts. */
  rust?: number;
}

/** Precast concrete panels / block: recessed joints, form-tie holes with rust runs, spalls. 192 × 96. */
export function panelTile(atlas: PwAtlas, o: PanelOpts): PwTile {
  const key = `panel|${h6(o.hex)}|${o.pw ?? 48}|${o.ph ?? 24}|${o.rust ?? 0.5}`;
  return atlas.tile(key, 192, 96, (c, k) => paintPanels(c, k, o), { wrap: true });
}

export function paintPanels(c: PwCanvas, k: PwKit, o: PanelOpts) {
  const rng = k.rng;
  const base = k.ramp(o.hex, { light: 0.36, sat: 0.85 });
  const rust = k.ramp(0x8a4a24, { light: 0.4 });
  const PW = o.pw ?? 48;
  const PH = o.ph ?? 24;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const px = Math.floor(x / PW);
      const py = Math.floor(y / PH);
      const lx = x % PW;
      const ly = y % PH;
      const v = hash2(px, py, 21);
      let t = v < 0.33 ? 2.75 : v > 0.7 ? 3.25 : 3;
      // Mottling inside a panel: soft blotches (two tones, dither at the edge).
      if (smooth(x, y, c.w, c.h, 8, 9 + px) > 0.68) t -= 0.5;
      // Joints: the top / left lip of a joint in shadow, the bottom / right lit.
      if (ly === 0) t = 1;
      else if (ly === 1) t += 0.75;
      if (lx === 0) t = Math.min(t, 1.5);
      else if (lx === 1) t += 0.5;
      c.set(x, y, base, t);
    }
  }
  // Form-tie holes (2×2 dark with a lit lower lip) on a grid, rust runs below some.
  for (let py = 0; py < c.h / PH; py++) {
    for (let px = 0; px < c.w / PW; px++) {
      for (const [fx, fy] of [
        [0.25, 0.3],
        [0.75, 0.3],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const x = Math.floor(px * PW + fx * PW);
        const y = Math.floor(py * PH + fy * PH);
        c.shift(x, y, -1.5);
        c.shift(x + 1, y, -1.25);
        c.shift(x, y + 1, 0.5);
        if (hash2(x, y, 4) < (o.rust ?? 0.5) * 0.4) {
          const len = rng.int(4, 12);
          for (let j = 2; j < len; j++) if (bayer(x, y + j) < 1 - j / len) c.tint(x, wrap(y + j, c.h), rust, -0.5);
        }
      }
    }
  }
  // Spalls: chipped corners with a lit lower edge.
  for (let i = 0; i < 5; i++) {
    const x = rng.int(0, c.w - 1);
    const y = rng.int(0, c.h - 1);
    c.cluster(x, y, rng.int(0, 9), 0, -1);
    c.cluster(x + 1, y + 1, rng.int(0, 3), 0, 0.5);
  }
  weather(c, rng, 0, 0.45);
}

/** Horizontal lap siding (clapboard): 6-texel boards with lapped shadows, grain, peeling paint. 128 × 96. */
export function sidingTile(atlas: PwAtlas, o: { hex: number; wood?: number }): PwTile {
  const key = `siding|${h6(o.hex)}|${h6(o.wood ?? 0x7a6a58)}`;
  return atlas.tile(
    key,
    128,
    96,
    (c, k) => {
      const rng = k.rng;
      const paint = k.ramp(o.hex, { light: 0.38 });
      const wood = k.ramp(o.wood ?? 0x7a6a58, { light: 0.35, sat: 0.8 });
      const BH = 6;
      for (let y = 0; y < c.h; y++) {
        const ly = y % BH;
        const board = Math.floor(y / BH);
        for (let x = 0; x < c.w; x++) {
          // Lap: the row under the board above in shadow, the board's lower edge lit (it overlaps the next).
          let t = ly === 0 ? 1.25 : ly === 1 ? 2.25 : ly === BH - 1 ? 3.75 : 3;
          // Grain: sparse darker dashes along the board.
          if (ly > 1 && ly < BH - 1 && hash2(Math.floor(x / 5), y, board) > 0.9) t -= 0.5;
          // Butt joints.
          const jx = Math.floor(hash2(board, 0, 9) * c.w);
          if (x === jx) t = 1.5;
          const peel = blobs(x, y, c.w, c.h, 6, 0.12, 77 + board);
          c.set(x, y, peel && ly > 0 ? wood : paint, peel && ly > 0 ? t - 0.25 : t);
        }
      }
      weather(c, rng, 0, 0.35);
    },
    { wrap: true },
  );
}

/** Corrugated sheet metal: 4-texel ribs (lit crest, shadowed trough), sheet laps with bolts, rust runs. 128 × 128. */
export function corrugatedTile(atlas: PwAtlas, o: { hex: number; rust?: number; vertical?: boolean }): PwTile {
  const key = `corr|${h6(o.hex)}|${o.rust ?? 0.5}|${o.vertical === false ? 'h' : 'v'}`;
  return atlas.tile(
    key,
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const metal = k.ramp(o.hex, { light: 0.5, sat: 0.85 });
      const rust = k.ramp(0x8a4a24, { light: 0.4 });
      const RIB = [3.75, 3, 2, 2.5];
      const vertical = o.vertical !== false;
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const a = vertical ? x : y;
          const b = vertical ? y : x;
          let t = RIB[a % 4];
          // Sheet laps every metre: a shadow line with bolt heads.
          if (b % 32 === 0) t = 1.5;
          else if (b % 32 === 1) t += 0.5;
          if (b % 32 === 2 && a % 8 === 0) t = 4.5;
          c.set(x, y, metal, t);
        }
      }
      // Rust: runs down from the laps and blooms on the troughs.
      const n = Math.round(30 * (o.rust ?? 0.5));
      for (let i = 0; i < n; i++) {
        const x = rng.int(0, c.w - 1);
        const y = vertical ? Math.floor(rng.int(0, 3)) * 32 + 2 : rng.int(0, c.h - 1);
        const len = rng.int(5, 24);
        for (let j = 0; j < len; j++) {
          if (bayer(x, y + j) > 1.1 - j / len) continue;
          c.tint(x, wrap(y + j, c.h), rust, j < 3 ? 0 : -0.25);
          if (j < len / 2 && rng.chance(0.4)) c.tint(wrap(x + 1, c.w), wrap(y + j, c.h), rust, -0.5);
        }
      }
      // Dents: a lit / dark pair of clusters.
      for (let i = 0; i < 4; i++) {
        const x = rng.int(0, c.w - 1);
        const y = rng.int(0, c.h - 1);
        c.cluster(x, y, rng.int(4, 9), 0, -0.75);
        c.cluster(x - 1, y - 1, rng.int(0, 3), 0, 0.75);
      }
    },
    { wrap: true },
  );
}

/** Stone trim (pilasters, bands, sills, lintels): big ashlar blocks with lit top-left arrises. 64 × 64. */
export function stoneTile(atlas: PwAtlas, o: { hex: number; bw?: number; bh?: number }): PwTile {
  const key = `stone|${h6(o.hex)}|${o.bw ?? 32}|${o.bh ?? 16}`;
  return atlas.tile(
    key,
    64,
    64,
    (c, k) => {
      const rng = k.rng;
      const s = k.ramp(o.hex, { light: 0.4, sat: 0.8 });
      const BW = o.bw ?? 32;
      const BH = o.bh ?? 16;
      for (let y = 0; y < c.h; y++) {
        const row = Math.floor(y / BH);
        const off = row % 2 ? BW / 2 : 0;
        for (let x = 0; x < c.w; x++) {
          const lx = (x + off) % BW;
          const ly = y % BH;
          const bx = Math.floor((x + off) / BW);
          let t = hash2(bx, row, 2) > 0.6 ? 3.25 : 3;
          if (ly === 0 || lx === 0) t = 1.5;
          else if (ly === 1 || lx === 1) t = 4;
          else if (ly === BH - 1 || lx === BW - 1) t = 2.25;
          c.set(x, y, s, t);
        }
      }
      c.scatter(rng, 0, 0, c.w, c.h, 18, 0, -0.75, { shapes: 4 });
      weather(c, rng, 0, 0.3);
    },
    { wrap: true },
  );
}

/** Tar / gravel flat roof: 128 × 128. */
export function roofTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(
    `roof|${h6(o.hex)}`,
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const r = k.ramp(o.hex, { light: 0.35, sat: 0.8 });
      c.rect(0, 0, c.w, c.h, r, (x, y) => (smooth(x, y, c.w, c.h, 4, 3) > 0.6 ? 2.5 : 3));
      c.scatter(rng, 0, 0, c.w, c.h, 120, 0, 0.75, { shapes: 3 });
      c.scatter(rng, 0, 0, c.w, c.h, 80, 0, -0.75, { shapes: 3 });
      // Seams of the roll roofing.
      for (let y = 0; y < c.h; y += 32) c.shade(0, y, c.w, 1, -1);
    },
    { wrap: true },
  );
}

// ─── Ground ──────────────────────────────────────────────────────────────────

export interface AsphaltOpts {
  hex: number;
  /** Wet: darker, with sky-lit puddle glints. */
  wet?: boolean;
  /** 0…1 wear (cracks, patches, oil). */
  wear?: number;
}

/** Asphalt: aggregate flecks, tar-sealed crack networks, patches, oil stains. 256 × 256 (8 m). */
export function asphaltTile(atlas: PwAtlas, o: AsphaltOpts): PwTile {
  const key = `asphalt|${h6(o.hex)}|${o.wet ? 1 : 0}|${o.wear ?? 0.5}`;
  return atlas.tile(key, 256, 256, (c, k) => paintAsphalt(c, k, o), { wrap: true });
}

export function paintAsphalt(c: PwCanvas, k: PwKit, o: AsphaltOpts) {
  const rng = k.rng;
  const wear = o.wear ?? 0.5;
  const a = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
  const patch = k.ramp(darken(o.hex, 0.84), { light: 0.36, sat: 0.9 });
  const tar = k.ramp(darken(o.hex, 0.6), { light: 0.3 });
  const oil = k.ramp(0x1e1c26, { light: 0.5, sat: 1.3 });
  c.rect(0, 0, c.w, c.h, a, 3);
  // Polished wheel paths and older, rougher areas: whole steps in irregular areas.
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const n = smooth(x, y, c.w, c.h, 4, 2) * 0.75 + smooth(x, y, c.w, c.h, 16, 3) * 0.25;
      if (n < 0.28) c.set(x, y, a, 2);
    }
  }
  // Aggregate: light chips and dark pits as 1–3 texel clusters, a few bright quartz glints.
  c.scatter(rng, 0, 0, c.w, c.h, 900, 0, 1, { shapes: 3 });
  c.scatter(rng, 0, 0, c.w, c.h, 700, 0, -1, { shapes: 3 });
  for (let i = 0; i < 70; i++) c.shift(rng.int(0, c.w - 1), rng.int(0, c.h - 1), 2);
  // Patches: newer, darker asphalt with ragged edges and a tar seam.
  const np = Math.round(3 * wear) + 1;
  for (let i = 0; i < np; i++) {
    const pw = rng.int(28, 70);
    const ph = rng.int(20, 48);
    const x0 = rng.int(0, c.w - 1);
    const y0 = rng.int(0, c.h - 1);
    const inside = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= pw || y >= ph) return false;
      const j = hash2(x >> 2, y >> 2, i + 50) * 3;
      return x >= j && y >= j && x < pw - j && y < ph - j;
    };
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        if (!inside(x, y)) continue;
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        const px = wrap(x0 + x, c.w);
        const py = wrap(y0 + y, c.h);
        c.set(px, py, edge ? tar : patch, edge ? 1 : hash2(px, py, 8) > 0.9 ? 4 : hash2(px, py, 9) > 0.9 ? 2 : 3);
      }
    }
  }
  // Alligator cracking in a couple of worn areas (small cells), long cracks elsewhere — tar-sealed.
  for (let i = 0; i < Math.round(2 * wear) + 1; i++) {
    const cx = rng.int(0, c.w - 1);
    const cy = rng.int(0, c.h - 1);
    const R = rng.int(14, 26);
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        if (x * x + y * y > R * R) continue;
        const px = wrap(cx + x, c.w);
        const py = wrap(cy + y, c.h);
        const v = cells(px, py, c.w, c.h, 32, 32, 70 + i);
        if (v.edge < 0.5 && hash2(px >> 2, py >> 2, 5) > 0.25 && (x * x + y * y < R * R * 0.5 || bayer(px, py) > 0.5)) c.set(px, py, tar, 2);
      }
    }
  }
  const nc = Math.round(8 * wear) + 2;
  for (let i = 0; i < nc; i++) {
    let x = rng.int(0, c.w - 1);
    let y = rng.int(0, c.h - 1);
    let ang = rng.next() * Math.PI * 2;
    const len = rng.int(20, 70);
    for (let j = 0; j < len; j++) {
      const ix = wrap(Math.round(x), c.w);
      const iy = wrap(Math.round(y), c.h);
      c.set(ix, iy, tar, j % 11 === 5 ? 3 : 1);
      ang += rng.spread(0.5);
      x += Math.cos(ang);
      y += Math.sin(ang);
      if (rng.chance(0.05)) ang += rng.chance(0.5) ? 1.3 : -1.3;
    }
  }
  // Oil stains: a dark core, a ragged ring.
  const no = Math.round(4 * wear);
  for (let i = 0; i < no; i++) {
    const cx = rng.int(10, c.w - 10);
    const cy = rng.int(10, c.h - 10);
    const rx = rng.int(5, 12);
    const ry = rng.int(3, 7);
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = (x / rx) ** 2 + (y / ry) ** 2 + (hash2(cx + x, cy + y, 3) - 0.5) * 0.45;
        if (d > 1) continue;
        c.set(cx + x, cy + y, oil, d > 0.6 ? 2 : 1);
      }
    }
  }
  if (o.wet) {
    // Wet: short cool sky glints on the polished wheel paths.
    const glint = k.ramp(0x7c8cb0, { light: 0.35 });
    for (let i = 0; i < 50; i++) {
      const x = rng.int(0, c.w - 4);
      const y = rng.int(0, c.h - 1);
      if (smooth(x, y, c.w, c.h, 4, 2) < 0.5) continue;
      const n = rng.int(2, 4);
      for (let j = 0; j < n; j++) c.set(x + j, y, glint, j === 0 ? 3 : 2);
    }
  }
}

/** Sidewalk: 40-texel (1.25 m) slabs with joints, cracks, gum, stains. 160 × 160. */
export function sidewalkTile(atlas: PwAtlas, o: { hex: number; wear?: number }): PwTile {
  return atlas.tile(
    `sidewalk|${h6(o.hex)}|${o.wear ?? 0.5}`,
    160,
    160,
    (c, k) => {
      const rng = k.rng;
      const s = k.ramp(o.hex, { light: 0.38, sat: 0.8 });
      const gum = k.ramp(0x2a2830, { light: 0.4 });
      const S = 40;
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const sx = Math.floor(x / S);
          const sy = Math.floor(y / S);
          const lx = x % S;
          const ly = y % S;
          const v = hash2(sx, sy, 41);
          let t = v < 0.3 ? 2.75 : v > 0.75 ? 3.25 : 3;
          if (smooth(x, y, c.w, c.h, 5, 6 + sx) > 0.7) t -= 0.5;
          // Joint (top view, light from the upper left): the groove's upper / left side dark, a lit lip below / right.
          if (ly === 0 || lx === 0) t = 1.5;
          else if (ly === 1 || lx === 1) t += 0.75;
          c.set(x, y, s, t);
        }
      }
      c.scatter(rng, 0, 0, c.w, c.h, 160, 0, -0.5, { shapes: 3 });
      c.scatter(rng, 0, 0, c.w, c.h, 90, 0, 0.5, { shapes: 3 });
      // Cracked slabs.
      for (let i = 0; i < 3; i++) {
        const sx = rng.int(0, 3) * S;
        const sy = rng.int(0, 3) * S;
        crack(c, rng, sx + rng.int(2, S - 2), sy + 2, rng.int(14, 34), Math.PI / 2 + rng.spread(0.6), { dt: -1.5, lip: 0.5 });
      }
      // Gum spots and stains.
      for (let i = 0; i < 14; i++) c.cluster(rng.int(0, c.w - 2), rng.int(0, c.h - 2), rng.int(0, 3), gum, rng.chance(0.5) ? 2 : 2.5);
      for (let i = 0; i < 3; i++) c.ellipseShade(rng.int(8, c.w - 8), rng.int(8, c.h - 8), rng.int(4, 9), rng.int(3, 6), (d) => (d < 0.7 ? -0.5 : 0));
    },
    { wrap: true },
  );
}

/**
 * Curb stone, 64 × 16 (2 m × 0.5 m): laid with WORLD projection on a curb's
 * face (v = height above the road), so the face is the tile's bottom rows: a dark
 * gutter line at the road, the stone face, a lit arris at the top (row 5 ≈ 17 cm)
 * — the rows above are the curb's worn top (seen on its top face).
 */
export function curbTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(
    `curb|${h6(o.hex)}`,
    64,
    16,
    (c, k) => {
      const rng = k.rng;
      const s = k.ramp(o.hex, { light: 0.42, sat: 0.7 });
      // Canvas rows 0…9: the top; 10: the arris; 11…14: the face; 15: the gutter.
      c.rect(0, 0, c.w, c.h, s, (_x, y) => (y < 10 ? 3 : y === 10 ? 4 : y === 15 ? 1 : 3));
      for (let x = 0; x < c.w; x += 32) c.vline(x, 0, c.h, s, 1);
      c.scatter(rng, 0, 0, c.w, 10, 12, 0, -1, { shapes: 3 });
      c.scatter(rng, 0, 11, c.w, 4, 8, 0, -1, { shapes: 2 });
      for (let i = 0; i < 4; i++) c.cluster(rng.int(0, c.w - 2), 10, rng.int(0, 3), 0, -2);
    },
    { wrap: true },
  );
}

/** Floor tiles in a chequer: grout, scuffs, a cracked tile, dirt in the joints. 128 × 128 (16-texel tiles). */
export function chequerTile(atlas: PwAtlas, o: { a: number; b: number; size?: number; wear?: number }): PwTile {
  return atlas.tile(
    `chequer|${h6(o.a)}|${h6(o.b)}|${o.size ?? 16}|${o.wear ?? 0.5}`,
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const A = k.ramp(o.a, { light: 0.42, sat: 0.9 });
      const B = k.ramp(o.b, { light: 0.42, sat: 0.9 });
      const S = o.size ?? 16;
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const tx = Math.floor(x / S);
          const ty = Math.floor(y / S);
          const lx = x % S;
          const ly = y % S;
          const r = (tx + ty) % 2 ? B : A;
          let t = hash2(tx, ty, 5) > 0.8 ? 2.75 : 3;
          // Lit upper-left bevel of each tile, grout in shadow.
          if (lx === 0 || ly === 0) t = 1.5;
          else if (lx === 1 || ly === 1) t += 0.5;
          else if (lx === S - 1 || ly === S - 1) t -= 0.5;
          c.set(x, y, r, t);
        }
      }
      // Scuffs (heel marks) and grime toward the joints.
      for (let i = 0; i < Math.round(40 * (o.wear ?? 0.5)); i++) {
        const x = rng.int(0, c.w - 4);
        const y = rng.int(0, c.h - 1);
        c.lineShade(x, y, x + rng.int(1, 4), y + rng.int(-1, 1), -0.75);
      }
      crack(c, rng, rng.int(0, c.w), rng.int(0, c.h), 10, rng.next() * 6, { dt: -1.25, lip: 0.5 });
    },
    { wrap: true },
  );
}

/** Painted road line (worn): solid paint with chips where the asphalt shows (cut out). 16 × 64 (across × along). */
export function roadPaintTile(atlas: PwAtlas, o: { hex: number; wear?: number }): PwTile {
  return atlas.tile(
    `paint|${h6(o.hex)}|${o.wear ?? 0.4}`,
    16,
    64,
    (c, k) => {
      const p = k.ramp(o.hex, { light: 0.3, sat: 0.9 });
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          // Worn: tyre-polished holes (clustered), ragged edges.
          const n = smooth(x, y, c.w, c.h, 2, 4) * 0.7 + hash2(x >> 1, y >> 1, 9) * 0.3;
          if (n < (o.wear ?? 0.4) * 0.55) continue;
          c.set(x, y, p, n > 0.75 ? 3.25 : 3);
        }
      }
    },
    { wrap: true },
  );
}

// ─── Nature ──────────────────────────────────────────────────────────────────

export interface DirtOpts {
  hex: number;
  /** Tyre ruts (two darker compacted tracks) — a road tile laid with `PwBatch.ribbon`. */
  ruts?: boolean;
  /** Grass encroaching from both edges (cut-out ragged edge over the verge). */
  grass?: number;
  /** Tile width (texels, multiple of 16) = the road width × 32. */
  width?: number;
  wet?: number;
}

/**
 * Dirt / gravel road (laid along a ribbon: u across, v along): packed earth,
 * two compacted tyre ruts with tread ridges and dried-mud cracks, a crowned
 * centre with grass tufts, pebbles, ragged grassy edges (cut out over the
 * verge). `width` × 256.
 */
export function dirtRoadTile(atlas: PwAtlas, o: DirtOpts): PwTile {
  const W = o.width ?? 224;
  return atlas.tile(`dirtroad|${h6(o.hex)}|${o.ruts ? 1 : 0}|${o.grass !== undefined ? h6(o.grass) : ''}|${W}|${o.wet ?? 0}`, W, 256, (c, k) => paintDirtRoad(c, k, o), { wrap: true });
}

export function paintDirtRoad(c: PwCanvas, k: PwKit, o: DirtOpts) {
  const rng = k.rng;
  const W = c.w;
  const dirt = k.ramp(o.hex, { light: 0.42, sat: 0.95 });
  const rut = k.ramp(darken(o.hex, 0.78), { light: 0.4 });
  const stone = k.ramp(0x8a8478, { light: 0.45, sat: 0.6 });
  const grass = o.grass !== undefined ? k.ramp(o.grass, { light: 0.45, sat: 1.05 }) : 0;
  const ruts = o.ruts ? [W * 0.34, W * 0.66] : [];
  const rw = Math.max(6, Math.round(W * 0.09));
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let t = 3;
      let r = dirt;
      // Shoulders a step darker (damp, churned), the crown between the tracks drier and paler in places.
      if (u < 0.13 || u > 0.87) t = 2;
      else if (u > 0.44 && u < 0.56 && smooth(x, y, W, c.h, 16, 3) > 0.66) t = 4;
      // Damp spots: small darker patches.
      if (smooth(x, y, W, c.h, 28, 5) < 0.14) t = Math.min(t, 2);
      for (const rx of ruts) {
        const d = Math.abs(x - rx + Math.sin(y * 0.05) * 2);
        if (d < rw / 2) {
          r = rut;
          // Compacted track: smooth, its edges worn down a step; a faint tread now and then.
          t = d > rw / 2 - 1.5 ? 2 : hash2(x >> 1, y >> 2, 6) > 0.92 ? 4 : 3;
        } else if (d < rw / 2 + 1.5) t = 4; // the berm the tyres pushed up catches the light
      }
      c.set(x, y, r, t);
    }
  }
  // Dried-mud cracks inside the ruts.
  for (const rx of ruts) for (let i = 0; i < 6; i++) crack(c, rng, rx + rng.spread(rw / 3), rng.int(0, c.h - 1), rng.int(5, 12), rng.next() * 6, { dt: -1, lip: 1, wrapX: false });
  // Pebbles: a lit top-left, a dark lower-right (2–4 texels each).
  for (let i = 0; i < 150; i++) {
    const x = rng.int(2, W - 3);
    const y = rng.int(0, c.h - 1);
    const big = rng.chance(0.25);
    c.set(x, y, stone, 4);
    c.set(x + 1, y, stone, 3);
    c.set(x + 1, wrap(y + 1, c.h), stone, 2);
    if (big) {
      c.set(x, wrap(y + 1, c.h), stone, 3);
      c.set(x + 2, wrap(y + 1, c.h), stone, 1);
    }
  }
  c.scatter(rng, 0, 0, W, c.h, 260, 0, -1, { shapes: 4 });
  c.scatter(rng, 0, 0, W, c.h, 140, 0, 1, { shapes: 3 });
  if (grass) {
    // Ragged grass margins: tufts reaching into the road, earth showing between them, cut out beyond.
    for (let y = 0; y < c.h; y++) {
      for (const side of [0, 1]) {
        const n = smooth(side * 4, y, 8, c.h, 1, 8 + side) - 0.5;
        const edge = Math.round(W * 0.05 + n * W * 0.07 + Math.sin(y * 0.4 + side * 2) * 1.5);
        for (let k2 = 0; k2 < W * 0.2; k2++) {
          const x = side ? W - 1 - k2 : k2;
          if (k2 < edge - 4) c.set(x, y, 0, 0);
          else if (k2 < edge) {
            // Outermost fringe: blades with gaps (cut out between them).
            if (hash2(x, y >> 1, 21 + side) > 0.55) c.set(x, y, grass, (x + y) % 3 === 0 ? 4 : 3);
            else c.set(x, y, 0, 0);
          } else if (k2 < edge + 3 && hash2(x, y, 23) > 0.5) c.set(x, y, grass, k2 === edge + 2 ? 2 : 3);
        }
      }
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.round(W / 2 + rng.spread(W * 0.07));
      const y = rng.int(0, c.h - 1);
      tuft(c, x, y, grass, rng);
    }
  }
}

/** Grass / meadow: tufts with lit tips and dark roots (clusters), clover, a few flowers, bare spots. 256 × 256. */
export function grassTile(atlas: PwAtlas, o: { hex: number; flowers?: number[]; dirt?: number; dry?: number }): PwTile {
  return atlas.tile(
    `grass|${h6(o.hex)}|${(o.flowers ?? []).map(h6).join('.')}|${o.dirt !== undefined ? h6(o.dirt) : ''}|${o.dry ?? 0}`,
    256,
    256,
    (c, k) => {
      const rng = k.rng;
      const g = k.ramp(o.hex, { light: 0.42, sat: 1.05 });
      const gd = k.ramp(shiftHue(o.hex, -0.04, 0.85), { light: 0.38 });
      const dirt = o.dirt !== undefined ? k.ramp(o.dirt, { light: 0.4 }) : 0;
      // Base sward, small darker clumps (never big flat areas: those read as camouflage).
      c.rect(0, 0, c.w, c.h, g, (x, y) => (smooth(x, y, c.w, c.h, 32, 4) < 0.22 ? 2 : 3));
      // A second, cooler green in broad drifts (hue, not value: the field stays one plane).
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (smooth(x, y, c.w, c.h, 3, 7) > 0.66) c.tint(x, y, gd);
      if (dirt) {
        for (let y = 0; y < c.h; y++) {
          for (let x = 0; x < c.w; x++) {
            const n = smooth(x, y, c.w, c.h, 4, 11);
            if (n < 0.2) c.set(x, y, dirt, n < 0.14 ? 3 : 2.5);
            else if (n < 0.23 && bayer(x, y) > 0.5) c.set(x, y, dirt, 2.5);
          }
        }
      }
      for (let i = 0; i < 1400; i++) tuft(c, rng.int(0, c.w - 1), rng.int(0, c.h - 1), rng.chance(0.3) ? gd : g, rng);
      const fl = o.flowers ?? [];
      for (const hex of fl) {
        const f = k.ramp(hex, { light: 0.4, sat: 1.1 });
        for (let i = 0; i < 18; i++) {
          const x = rng.int(0, c.w - 2);
          const y = rng.int(0, c.h - 2);
          c.set(x, y, f, 4);
          c.set(x + 1, y, f, 3);
          c.set(x, y + 1, f, 2.5);
        }
      }
    },
    { wrap: true },
  );
}

/** A grass tuft seen from above-front: 3–5 blades, lit tips, dark root. */
export function tuft(c: PwCanvas, x: number, y: number, ramp: number, rng: PwRng) {
  const n = rng.int(2, 4);
  for (let b = 0; b < n; b++) {
    const dx = b - (n >> 1);
    const len = rng.int(2, 4);
    for (let j = 0; j < len; j++) {
      const px = wrap(x + dx + (j === len - 1 ? Math.sign(dx) : 0), c.w);
      const py = wrap(y - j, c.h);
      c.set(px, py, ramp, j === len - 1 ? 4.25 : j === 0 ? 2 : 3.25);
    }
  }
  c.set(wrap(x, c.w), wrap(y + 1, c.h), ramp, 1.5);
}

export interface RockOpts {
  hex: number;
  moss?: number;
  /** Strata tilt (texels per texel). */
  tilt?: number;
  /** Strata band height (texels). */
  band?: number;
}

/**
 * Rock / cliff face: tilted strata, blocky fractured faces (lit top-left arris,
 * dark lower-right, cracks with a lit lip), moss on ledges, dark seeps. 256 × 256.
 */
export function rockTile(atlas: PwAtlas, o: RockOpts & { size?: number }): PwTile {
  const S = o.size ?? 128;
  return atlas.tile(`rock|${h6(o.hex)}|${o.moss !== undefined ? h6(o.moss) : ''}|${o.tilt ?? 0.12}|${o.band ?? 22}|${S}`, S, S, (c, k) => paintRock(c, k, o), { wrap: true });
}

export function paintRock(c: PwCanvas, k: PwKit, o: RockOpts) {
  const rng = k.rng;
  const r = k.ramp(o.hex, { light: 0.45, sat: 0.85 });
  const r2 = k.ramp(shiftHue(darken(o.hex, 0.92), 0.015, 0.95), { light: 0.42, sat: 0.85 });
  const r3 = k.ramp(shiftHue(o.hex, -0.015, 1.08), { light: 0.45, sat: 0.9 });
  const moss = o.moss !== undefined ? k.ramp(o.moss, { light: 0.42, sat: 1.05 }) : 0;
  // Fractured facets: tileable Voronoi cells, wider than tall (bedding), each a flat face
  // lit by its own tilt (upper-left light), with a lit arris on its upper-left border, a
  // shaded lower-right border and a dark crevice between faces.
  const cols = Math.max(2, Math.round(c.w / (o.band ?? 22) / 2.2));
  const rows = Math.max(2, Math.round(c.h / (o.band ?? 22)));
  const tiltW = Math.round(c.w * (o.tilt ?? 0.12)) / c.w;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const cv = cells(x, wrap(Math.round(y + x * tiltW), c.h), c.w, c.h, cols, rows, 3, 0.8, 2.2);
      const v = { id: cv.id, edge: cv.edge, dx: cv.dx, dy: cv.dy };
      const hv = hash2(v.id, 0, 9);
      const ramp = hv < 0.2 ? r2 : hv > 0.85 ? r3 : r;
      // Face tilt → tone.
      const nx = hash2(v.id, 1, 9) * 2 - 1;
      const ny = hash2(v.id, 2, 9) * 2 - 1;
      const l = -nx * 0.55 - ny * 0.62;
      let t = 3 + (l > 0.45 ? 1 : l < -0.45 ? -1 : 0);
      // Inside a face: a straight fracture through it splits it into a lit and a shaded plane.
      const fa = hash2(v.id, 3, 9) * Math.PI;
      if (hash2(v.id, 4, 9) > 0.45 && v.dx * Math.cos(fa) + v.dy * Math.sin(fa) > 2) t -= 1;
      if (v.edge < 1) t = 0;
      else if (v.edge < 2.2) t = v.dx + v.dy < 0 ? t + 1 : t - 1;
      c.set(x, y, ramp, Math.max(0, Math.min(5, t)));
    }
  }
  for (let i = 0; i < 10; i++) crack(c, rng, rng.int(0, c.w - 1), rng.int(0, c.h - 1), rng.int(6, 18), Math.PI / 2 + rng.spread(0.9), { dt: -2, lip: 1, branch: 0.08 });
  c.scatter(rng, 0, 0, c.w, c.h, 160, 0, -1, { shapes: 4 });
  c.scatter(rng, 0, 0, c.w, c.h, 90, 0, 1, { shapes: 2 });
  if (moss) {
    // Moss on ledges: the tops of faces (just under a crevice above), clumped, with a lit top row.
    for (let y = 1; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const above = c.toneAt(x, y - 1) === 0 && c.at(x, y - 1) !== moss;
        const n = smooth(x, y, c.w, c.h, 8, 13);
        if (above && n > 0.55) {
          const len = 1 + Math.floor(hash2(x, y, 3) * 4 * n);
          for (let j = 0; j < len; j++) c.set(x, wrap(y + j, c.h), moss, j === 0 ? 4 : j === len - 1 ? 2 : 3);
        }
      }
    }
  }
  // Dark seeps running down.
  for (let i = 0; i < 6; i++) c.streak(rng, rng.int(0, c.w - 1), rng.int(0, c.h - 1), rng.int(10, 40), -1, 0, rng.int(1, 2));
}

/** Scratch result of `cells` (reused: painting is single-threaded). */
const CELL = { id: 0, edge: 0, dx: 0, dy: 0 };

/**
 * Tileable Voronoi: the cell of (x, y) on a `cols` × `rows` jittered grid —
 * its id, the distance to the nearest border (texels, approx.) and the offset
 * from the cell's seed (dx, dy, texels). `aniso` > 1 stretches cells
 * horizontally (bedded strata).
 */
export function cells(x: number, y: number, w: number, h: number, cols: number, rows: number, k: number, jitter = 0.8, aniso = 1): typeof CELL {
  const cw = w / cols;
  const ch = h / rows;
  const gx = Math.floor(x / cw);
  const gy = Math.floor(y / ch);
  const seeds = seedGrid(cols, rows, k, jitter);
  let d1 = Infinity;
  let d2 = Infinity;
  let id = 0;
  let bx = 0;
  let by = 0;
  const px0 = x + 0.5;
  const py0 = y + 0.5;
  for (let j = -1; j <= 1; j++) {
    const cy = gy + j;
    const wy = cy < 0 ? cy + rows : cy >= rows ? cy - rows : cy;
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i;
      const wx = cx < 0 ? cx + cols : cx >= cols ? cx - cols : cx;
      const si = (wy * cols + wx) * 2;
      const px = (cx + seeds[si]) * cw;
      const py = (cy + seeds[si + 1]) * ch;
      const ddx = px0 - px;
      const ddy = (py0 - py) * aniso;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = wy * cols + wx;
        bx = px0 - px;
        by = py0 - py;
      } else if (d < d2) d2 = d;
    }
  }
  CELL.id = id;
  CELL.edge = (d2 - d1) / 2;
  CELL.dx = bx;
  CELL.dy = by;
  return CELL;
}

/** Cached jittered seed offsets (cell-relative, 0…1) for `cells`. */
const seedGrids = new Map<string, Float32Array>();
function seedGrid(cols: number, rows: number, k: number, jitter: number): Float32Array {
  const key = `${cols}|${rows}|${k}|${jitter}`;
  let g = seedGrids.get(key);
  if (!g) {
    g = new Float32Array(cols * rows * 2);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        g[(y * cols + x) * 2] = 0.5 + (hash2(x, y, k) - 0.5) * jitter;
        g[(y * cols + x) * 2 + 1] = 0.5 + (hash2(x, y, k + 1) - 0.5) * jitter;
      }
    }
    seedGrids.set(key, g);
  }
  return g;
}

// ─── Weathering + helpers ────────────────────────────────────────────────────

/** Grime streaks running down from the top of the tile and a dirty band at its foot. */
function weather(c: PwCanvas, rng: PwRng, only: number, amount: number) {
  const n = Math.round(10 * amount);
  for (let i = 0; i < n; i++) {
    // Grime runs down from a ledge: wide at the top, breaking up into dither below.
    const x = rng.int(0, c.w - 1);
    const y = rng.int(0, c.h - 1);
    const wdt = rng.int(2, 4);
    const len = rng.int(10, 34);
    for (let j = 0; j < len; j++) {
      const t = j / len;
      for (let q = 0; q < wdt; q++) {
        const edge = q === 0 || q === wdt - 1;
        if ((edge && bayer(x + q, y + j) < 0.5 + t * 0.5) || bayer(x + q, y + j) < t * 0.9) continue;
        c.shift(wrap(x + q, c.w), wrap(y + j, c.h), -1, only);
      }
    }
  }
  void only;
}

/** Tileable smooth value noise in [0, 1): `cells` lattice cells across the tile. */
export function smooth(x: number, y: number, w: number, h: number, cells: number, k: number): number {
  const g = lattice(cells, k);
  const fx = (x / w) * cells;
  const fy = (y / h) * cells;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const ix0 = ((x0 % cells) + cells) % cells;
  const iy0 = ((y0 % cells) + cells) % cells;
  const ix1 = ix0 + 1 === cells ? 0 : ix0 + 1;
  const iy1 = iy0 + 1 === cells ? 0 : iy0 + 1;
  const a = g[iy0 * cells + ix0];
  const b = g[iy0 * cells + ix1];
  const cc = g[iy1 * cells + ix0];
  const d = g[iy1 * cells + ix1];
  return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
}

/** Cached lattice of hash values for `smooth` (cells² floats per (cells, k)). */
const lattices = new Map<number, Float32Array>();
function lattice(cells: number, k: number): Float32Array {
  const key = cells * 1e6 + k;
  let g = lattices.get(key);
  if (!g) {
    g = new Float32Array(cells * cells);
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) g[y * cells + x] = hash2(x, y, k);
    lattices.set(key, g);
  }
  return g;
}

/** Tileable blobs: true inside sparse blobs (`cells` lattice, `frac` of the area). */
function blobs(x: number, y: number, w: number, h: number, cells: number, frac: number, k: number): boolean {
  return smooth(x, y, w, h, cells, k) * 0.75 + smooth(x, y, w, h, cells * 3, k + 1) * 0.25 < frac;
}

/** Hex colour scaled toward black. */
export function darken(hex: number, f: number): number {
  const r = Math.round(((hex >> 16) & 255) * f);
  const g = Math.round(((hex >> 8) & 255) * f);
  const b = Math.round((hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}

/** Hex colour with a small hue rotation (turns, ±) and saturation scale (crude RGB-space shift). */
export function shiftHue(hex: number, turns: number, sat = 1): number {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  h = (h + turns + 1) % 1;
  s = Math.min(1, s * sat);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const R = Math.round(f(h + 1 / 3) * 255);
  const G = Math.round(f(h) * 255);
  const B = Math.round(f(h - 1 / 3) * 255);
  return (R << 16) | (G << 8) | B;
}

/** A mortar colour that suits a brick (pale, warm-grey, desaturated). */
export function mortarFor(hex: number): number {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const m = (r + g + b) / 3;
  const mix = (v: number) => Math.round(v * 0.35 + (m * 0.65 + 40) * 0.65);
  return (Math.min(255, mix(r)) << 16) | (Math.min(255, mix(g)) << 8) | Math.min(255, mix(b));
}

// ─── Generic re-texturing set (Kit texture names → PixelWorld painters) ─────

/** Painted sheet metal: panels with seams and rivets, scratches through the paint, rust at the seams. 128 × 128. */
export function metalTile(atlas: PwAtlas, o: { hex: number; rust?: number }): PwTile {
  return atlas.tile(
    `metal|${h6(o.hex)}|${o.rust ?? 0.4}`,
    64,
    64,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(o.hex, { light: 0.5, sat: 0.85 });
      const rust = k.ramp(0x8a4a24, { light: 0.4 });
      c.rect(0, 0, c.w, c.h, m, 3);
      // Panels 32 × 32 with seams (dark line, lit lip) and rivets.
      for (let y = 0; y < c.h; y += 32) {
        c.hline(0, y, c.w, m, 1);
        c.hline(0, y + 1, c.w, m, 4);
        for (let x = 4; x < c.w; x += 8) c.set(x, y + 3, m, 4);
      }
      for (let x = 0; x < c.w; x += 32) {
        c.vline(x, 0, c.h, m, 1);
        c.vline(x + 1, 0, c.h, m, 4);
      }
      // Scratches (lit) and dents.
      for (let i = 0; i < 8; i++) {
        const x = rng.int(0, c.w - 1);
        const y = rng.int(0, c.h - 1);
        c.lineShade(x, y, x + rng.int(2, 7), y + rng.int(-2, 2), 1);
      }
      c.scatter(rng, 0, 0, c.w, c.h, 12, 0, -1, { shapes: 4 });
      const n = Math.round(5 * (o.rust ?? 0.4));
      for (let i = 0; i < n; i++) {
        const x = rng.int(0, c.w - 1);
        const y = Math.floor(rng.int(0, 1)) * 32 + 2;
        const len = rng.int(3, 12);
        for (let j = 0; j < len; j++) if (hash2(x, y + j, 3) > j / len) c.tint(x, wrap(y + j, c.h), rust, 0);
      }
    },
    { wrap: true },
  );
}

/** Wood planks (vertical boards): grain lines, knots, gaps, nail heads. 128 × 128. */
export function planksTile(atlas: PwAtlas, o: { hex: number; horizontal?: boolean }): PwTile {
  return atlas.tile(
    `planks|${h6(o.hex)}|${o.horizontal ? 'h' : 'v'}`,
    64,
    64,
    (c, k) => {
      const rng = k.rng;
      const w = k.ramp(o.hex, { light: 0.42, sat: 0.95 });
      const w2 = k.ramp(darken(o.hex, 0.88), { light: 0.4, sat: 0.95 });
      const PW = 8;
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const a = o.horizontal ? y : x;
          const b = o.horizontal ? x : y;
          const board = Math.floor(a / PW);
          const la = a % PW;
          const r = hash2(board, 0, 5) > 0.6 ? w2 : w;
          let t = la === 0 ? 1 : la === 1 ? 4 : la === PW - 1 ? 2 : 3;
          // Grain: long wavy darker lines along the board.
          if (la > 1 && la < PW - 1 && Math.abs(Math.sin((b + board * 37) * 0.07 + la * 1.3)) < 0.08) t = 2;
          // Butt joint.
          if (b % 64 === Math.floor(hash2(board, 1, 5) * 64)) t = 1;
          c.set(x, y, r, t);
        }
      }
      // Knots and nail heads.
      for (let i = 0; i < 4; i++) {
        const x = rng.int(0, c.w - 3);
        const y = rng.int(0, c.h - 3);
        c.ellipse(x + 1, y + 1, 1.5, 1, w, 1);
        c.set(x + 2, y + 2, w, 4);
      }
    },
    { wrap: true },
  );
}

/** A plain painted / rendered surface (untextured Kit colours): flat base, sparse chips and stains, a crack or two. 64 × 64. */
export function flatTile(atlas: PwAtlas, o: { hex: number; wear?: number }): PwTile {
  return atlas.tile(
    `flat|${h6(o.hex)}|${o.wear ?? 0.5}`,
    64,
    64,
    (c, k) => {
      const rng = k.rng;
      const r = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
      c.rect(0, 0, c.w, c.h, r, 3);
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (smooth(x, y, c.w, c.h, 3, 4) < 0.22) c.set(x, y, r, 2);
      c.scatter(rng, 0, 0, c.w, c.h, Math.round(30 * (o.wear ?? 0.5)), 0, -1, { shapes: 4 });
      c.scatter(rng, 0, 0, c.w, c.h, Math.round(16 * (o.wear ?? 0.5)), 0, 1, { shapes: 2 });
    },
    { wrap: true },
  );
}

/** Woven fabric / canvas: a faint weave, folds, stains. 64 × 64. */
export function fabricTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(
    `fabric|${h6(o.hex)}`,
    64,
    64,
    (c, k) => {
      const r = k.ramp(o.hex, { light: 0.42 });
      c.rect(0, 0, c.w, c.h, r, (x, y) => ((x >> 1) + (y >> 1)) % 4 === 0 ? 2 : 3);
      for (let x = 0; x < c.w; x += 16) {
        c.vline(x, 0, c.h, r, 4);
        c.vline(x + 1, 0, c.h, r, 2);
      }
      c.scatter(k.rng, 0, 0, c.w, c.h, 10, 0, -1, { shapes: 6 });
    },
    { wrap: true },
  );
}

/** Steel grating / drain grate: bars with dark gaps, lit bar tops. 32 × 32. */
export function grateTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(
    `grate|${h6(o.hex)}`,
    32,
    32,
    (c, k) => {
      const r = k.ramp(o.hex, { light: 0.5, sat: 0.7 });
      c.rect(0, 0, c.w, c.h, r, 0);
      for (let x = 0; x < c.w; x += 4) {
        c.vline(x, 0, c.h, r, 3);
        c.vline(x + 1, 0, c.h, r, 2);
      }
      for (let y = 0; y < c.h; y += 16) {
        c.hline(0, y, c.w, r, 4);
        c.hline(0, y + 1, c.w, r, 2);
      }
    },
    { wrap: true },
  );
}

/** Hazard stripes (diagonal yellow / black), worn at the edges. 64 × 64. */
export function hazardTile(atlas: PwAtlas, o: { a?: number; b?: number } = {}): PwTile {
  return atlas.tile(
    `hazard|${h6(o.a ?? 0xe8c020)}|${h6(o.b ?? 0x1a1a1e)}`,
    64,
    64,
    (c, k) => {
      const ya = k.ramp(o.a ?? 0xe8c020, { light: 0.4 });
      const bk = k.ramp(o.b ?? 0x1a1a1e, { light: 0.45 });
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const s = Math.floor((x + y) / 16) % 2;
          const edge = (x + y) % 16 === 0;
          c.set(x, y, s ? bk : ya, edge ? 2 : 3);
        }
      }
      c.scatter(k.rng, 0, 0, c.w, c.h, 40, 0, -1, { shapes: 4 });
    },
    { wrap: true },
  );
}

/** Wall / floor tiles in one colour: square tiles, grout, a lit bevel, a cracked one. 64 × 64 (16-texel tiles). */
export function tilesTile(atlas: PwAtlas, o: { hex: number; grout?: number; size?: number }): PwTile {
  return atlas.tile(
    `tiles|${h6(o.hex)}|${h6(o.grout ?? 0)}|${o.size ?? 16}`,
    64,
    64,
    (c, k) => {
      const r = k.ramp(o.hex, { light: 0.45, sat: 0.9 });
      const g = o.grout !== undefined ? k.ramp(o.grout, { light: 0.4 }) : r;
      const S = o.size ?? 16;
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const lx = x % S;
          const ly = y % S;
          if (lx === 0 || ly === 0) c.set(x, y, g, o.grout !== undefined ? 2 : 1);
          else c.set(x, y, r, lx === 1 || ly === 1 ? 4 : lx === S - 1 || ly === S - 1 ? 2 : hash2(Math.floor(x / S), Math.floor(y / S), 3) > 0.8 ? 2 : 3);
        }
      }
      crack(c, k.rng, k.rng.int(0, c.w), k.rng.int(0, c.h), 8, k.rng.next() * 6, { dt: -2, lip: 1 });
    },
    { wrap: true },
  );
}

/**
 * Water (animated: `frames` frames stacked vertically — draw it with
 * `pwMaterial(atlas, { anim: { frames, fps } })`): a calm base, darker troughs,
 * lit ripple dashes drifting one texel per frame along the flow (u), foam
 * flecks. 128 × (64 × frames).
 */
export function waterTile(atlas: PwAtlas, o: { hex: number; frames?: number; foam?: number }): PwTile {
  const F = o.frames ?? 4;
  return atlas.tile(
    `water|${h6(o.hex)}|${F}|${o.foam ?? 0.3}`,
    128,
    64 * F,
    (c, k) => {
      const w = k.ramp(o.hex, { light: 0.5, sat: 1.05 });
      const foam = k.ramp(0xe8f4f4, { light: 0.3, sat: 0.6 });
      const FH = 64;
      for (let f = 0; f < F; f++) {
        // Frame rows (canvas y-down): frame f occupies texture rows f·FH… → canvas rows from the bottom.
        const y0 = c.h - (f + 1) * FH;
        for (let y = 0; y < FH; y++) {
          for (let x = 0; x < c.w; x++) {
            const sx = (x - f * 2 + c.w * 4) % c.w;
            const n = smooth(sx, y, c.w, FH, 8, 3);
            let t = n < 0.35 ? 2 : 3;
            // Ripple dashes: short lit strokes, wave-shaped, drifting with the frame.
            const r = Math.sin((sx / c.w) * Math.PI * 16 + y * 0.9 + Math.sin(y * 0.37) * 2);
            if (r > 0.93 && (y % 4) < 2) t = 4;
            if (r > 0.985 && (y % 4) === 0) t = 5;
            if (r < -0.96 && (y % 6) === 3) t = 1;
            c.set(x, y0 + y, w, t);
          }
        }
        const fr = new PwRng(hash2(f, 7, 9) * 1e9);
        for (let i = 0; i < Math.round(30 * (o.foam ?? 0.3)); i++) c.set(fr.int(0, c.w - 1), y0 + fr.int(0, FH - 1), foam, 3);
      }
    },
    { wrap: true },
  );
}
