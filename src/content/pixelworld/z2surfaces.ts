import { bayer, PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { crack, darken, hash2, shiftHue, smooth } from './surfaces';

/**
 * ST. MERCY HOSPITAL (z2) wall / floor / ceiling surfaces for PIXEL WORLD.
 *
 * Wrap tiles only (the base material of a surface). Everything that tells a
 * story — water stains, picture ghosts, cracked tiles, scuffs, blood, notices —
 * is a DECAL placed by hand-written rules (z2decals.ts), never baked into the
 * repeat, so a corridor never shows the same missing tile every four metres.
 *
 * Wall tiles are laid with v measured from the room's floor (the stage passes a
 * floor offset), so the foot rows of a tile always meet the floor. Heights are
 * divisors of 144 (4.5 m: the basement storey) so courses line up on both
 * floors. Painted in ramp space (base on step 3, light from the upper left).
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/**
 * Organic mottle without a dither pattern: where the tileable noise falls under
 * `lo`, 2×2 cells get a hand-shaped cluster shifted by `dt` — sparse at the
 * edge of an area, thick in its middle (reads as old paint / damp / wear, never
 * as a checkerboard).
 */
export function mottle(c: PwCanvas, cells: number, seed: number, lo: number, dt: number, only = 0, density = 1) {
  for (let y = 0; y < c.h; y += 2) {
    for (let x = 0; x < c.w; x += 2) {
      const n = smooth(x, y, c.w, c.h, cells, seed);
      if (n >= lo) continue;
      const p = Math.min(1, ((lo - n) / lo) * 2.2) * density;
      const h = hash2(x >> 1, y >> 1, seed);
      if (h > p) continue;
      const cl = CL[Math.floor(hash2(x, y, seed + 1) * CL.length)];
      for (let i = 0; i < cl.length; i += 2) c.shift((x + cl[i]) % c.w, (y + cl[i + 1]) % c.h, dt, only);
    }
  }
}
const CL = [
  [0, 0, 1, 0, 0, 1, 1, 1],
  [0, 0, 1, 0, 1, 1],
  [0, 0, 0, 1, 1, 1],
  [1, 0, 0, 1, 1, 1],
  [0, 0, 1, 0],
];

/** Canvas row of a texel `v` rows above the tile's bottom edge. */
const rowUp = (c: PwCanvas, v: number) => c.h - 1 - v;

// ─── Walls ───────────────────────────────────────────────────────────────────

export interface GlazedOpts {
  hex: number;
  grout?: number;
  /** Tile size in texels (default 8 × 8 = 25 cm square). */
  tw?: number;
  th?: number;
  /** 0…1 grime at the foot and in the grout. */
  grime?: number;
  /** Stagger rows (subway bond). */
  bond?: boolean;
  /** Tile height (multiple of 16; default 48). */
  h?: number;
  /** Calm glaze (big tiled rooms: the OR): grout close to the tile, few odd tiles, few lit lips. */
  calm?: boolean;
  /** Dirt at the foot of the tile (default true; off for walls that only start above a wainscot — it would band every repeat). */
  foot?: boolean;
}

/**
 * Glazed ceramic wall tiles (wainscot, morgue, theatre): each tile a flat glaze
 * with a lit upper-left lip and a darker lower-right edge, a glint on some,
 * slightly different batches of tile, sunk grout lines; grimy grout and splash
 * dirt toward the floor. 128 wide.
 */
export function z2GlazedTile(atlas: PwAtlas, o: GlazedOpts): PwTile {
  const H = o.h ?? 48;
  const key = `z2glazed|${h6(o.hex)}|${h6(o.grout ?? 0)}|${o.tw ?? 8}x${o.th ?? 8}|${o.grime ?? 0.5}|${o.bond ? 1 : 0}|${H}|${o.calm ? 1 : 0}|${o.foot === false ? 0 : 1}`;
  return atlas.tile(key, 128, H, (c, k) => paintGlazed(c, k, o), { wrap: true });
}

function paintGlazed(c: PwCanvas, k: PwKit, o: GlazedOpts) {
  const TW = o.tw ?? 8;
  const TH = o.th ?? 8;
  const g = o.grime ?? 0.5;
  const t0 = k.ramp(o.hex, { light: 0.5, sat: 0.95 });
  const t1 = k.ramp(darken(o.hex, 0.92), { light: 0.48, sat: 0.95 });
  const t2 = k.ramp(shiftHue(o.hex, 0.015, 1.06), { light: 0.52, sat: 0.95 });
  // Grout: pale cement on coloured tiles, a grey a little darker than white tiles.
  const light = (((o.hex >> 16) & 255) + ((o.hex >> 8) & 255) + (o.hex & 255)) / 3 > 140;
  const calm = !!o.calm;
  const grout = k.ramp(o.grout ?? (light ? darken(o.hex, 0.72) : mixHex(o.hex, 0xb8b8ac, calm ? 0.3 : (o.tw ?? 8) > 8 ? 0.4 : 0.7)), { light: 0.3, sat: 0.5 });
  const W = c.w;
  const H = c.h;
  const cols = Math.ceil(W / TW);
  for (let y = 0; y < H; y++) {
    const v = H - 1 - y;
    const row = Math.floor(v / TH);
    const ly = v % TH; // 0 = bottom row of a tile
    const off = o.bond && row % 2 ? TW >> 1 : 0;
    for (let x = 0; x < W; x++) {
      const xx = x + off;
      const col = Math.floor(xx / TW) % cols;
      const lx = xx % TW;
      if (lx === 0 || ly === TH - 1) {
        c.set(x, y, grout, light || calm ? 3 : ly === TH - 1 ? 3 : 2);
        continue;
      }
      const hsh = hash2(col, row, 11);
      const r = hsh < (calm ? 0.06 : 0.14) ? t1 : hsh > (calm ? 0.96 : 0.9) ? t2 : t0;
      let t = 3;
      // Glaze: a lit top lip on about half the tiles (set a hair proud), glints on a few.
      if (ly === TH - 2 && lx < TW - 2 && hash2(col, row, 23) > (calm ? 0.8 : 0.45)) t = 4;
      else if (ly === 0 && !calm && hash2(col, row, 29) > 0.6) t = 2;
      if (hash2(col, row, 17) > 0.78 && ly === TH - 3 && lx === 2) t = 5;
      c.set(x, y, r, t);
    }
  }
  // Foot: the bottom course a step dirtier, grout darker in the lowest rows, splash clusters thinning upward.
  if (o.foot === false) return;
  for (let x = 0; x < W; x++) {
    for (let v = 0; v < TH; v++) {
      const y = rowUp(c, v);
      if (c.at(x, y) === grout) c.shift(x, y, -1);
      else if (v < 3 && hash2(x >> 1, v, 3) < 0.5 * g) c.shift(x, y, -1);
    }
  }
  const rng = k.rng;
  for (let i = 0; i < Math.round(40 * g); i++) {
    const v = Math.floor(Math.pow(rng.next(), 2.2) * TH * 2.5);
    c.cluster(rng.int(0, W - 3), rowUp(c, v), rng.int(0, 9), 0, -1);
  }
  // Dirty grout here and there higher up (short darker runs).
  for (let i = 0; i < Math.round(10 * g); i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    for (let j = 0; j < rng.int(3, 9); j++) if (c.at(x + j, y) === grout) c.shift(x + j, y, -1);
  }
}

export interface PaintOpts {
  hex: number;
  /** Undercoat colour (shows where the paint chips). */
  under?: number;
  grime?: number;
}

/**
 * Painted plaster / drywall (upper walls): two flat tones in broad, hard-edged
 * patches (old paint, newer touch-up), the roller's faint vertical laps, sparse
 * pits, a scuff or two. 128 × 96.
 */
export function z2PaintTile(atlas: PwAtlas, o: PaintOpts): PwTile {
  const key = `z2paint2|${h6(o.hex)}|${h6(o.under ?? 0)}|${o.grime ?? 0.5}`;
  return atlas.tile(key, 128, 96, (c, k) => paintPaint(c, k, o), { wrap: true });
}

function paintPaint(c: PwCanvas, k: PwKit, o: PaintOpts) {
  const rng = k.rng;
  const p = k.ramp(o.hex, { light: 0.4, sat: 0.95 });
  const touch = k.ramp(shiftHue(o.hex, -0.012, 1.05), { light: 0.42, sat: 0.95 });
  const under = k.ramp(o.under ?? shiftHue(mixHex(o.hex, 0xd8d0b8, 0.5), 0.03, 0.8), { light: 0.35 });
  const W = c.w;
  const H = c.h;
  // Old paint: large soft tonal clusters in a near twin of the paint (low contrast: the stains,
  // which would repeat with the tile, are placed decals), a touched-up rectangle or two (hard edge).
  c.rect(0, 0, W, H, p, 3);
  const p2 = k.ramp(darken(o.hex, 0.95), { light: 0.4, sat: 0.95 });
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const n = smooth(x, y, W, H, 8, 31) * 0.75 + smooth(x, y, W, H, 16, 32) * 0.25;
      if (n > 0.38) continue;
      const cl = (hash2(x, y, 33) * 4) | 0;
      c.tint(x, y, p2);
      if (cl & 1) c.tint(x + 1, y, p2);
      if (cl & 2) c.tint(x, y + 1, p2);
      if (n < 0.33) c.tint(x + 1, y + 1, p2);
    }
  }
  for (let i = 0; i < 2; i++) {
    const x0 = rng.int(0, W - 40);
    const y0 = rng.int(0, H - 30);
    const w = rng.int(18, 36);
    const h = rng.int(12, 26);
    c.rect(x0, y0, w, h, touch, 3);
    c.hline(x0, y0, w, touch, 4);
  }
  // Pits and nibs (sparse), a few lit flecks.
  c.scatter(rng, 0, 0, W, H, 18, 0, -1, { shapes: 3 });
  c.scatter(rng, 0, 0, W, H, 8, 0, 1, { shapes: 2 });
  // Chips: undercoat showing, a shadowed upper-left edge.
  for (let i = 0; i < 3; i++) {
    const x = rng.int(1, W - 6);
    const y = rng.int(1, H - 6);
    c.cluster(x, y, rng.int(4, 9), under, 3);
    c.shift(x - 1, y, -1);
    c.shift(x, y - 1, -1);
  }
  // Scuffs low on the wall (trolleys, shoes): short horizontal dark dashes.
  const g = o.grime ?? 0.5;
  for (let i = 0; i < Math.round(8 * g); i++) {
    const x = rng.int(0, W - 8);
    const y = rowUp(c, rng.int(2, 18));
    c.lineShade(x, y, x + rng.int(3, 8), y, -1);
  }
}

/**
 * Painted cinder block (basement service walls): 16 × 8 blocks in running
 * bond, sunk joints (shadowed upper lip, lit lower lip), heavy gloss paint
 * that fills the pores unevenly, chipped arrises, mildew at the foot. 128 × 48.
 */
export function z2BlockTile(atlas: PwAtlas, o: { hex: number; grime?: number }): PwTile {
  return atlas.tile(`z2block|${h6(o.hex)}|${o.grime ?? 0.6}`, 128, 48, (c, k) => {
    const rng = k.rng;
    const b = k.ramp(o.hex, { light: 0.4, sat: 0.9 });
    const b2 = k.ramp(darken(o.hex, 0.92), { light: 0.38, sat: 0.9 });
    const mold = k.ramp(mixHex(o.hex, 0x2a3424, 0.6), { light: 0.3, sat: 0.8 });
    const BW = 16;
    const BH = 8;
    for (let y = 0; y < c.h; y++) {
      const v = c.h - 1 - y;
      const row = Math.floor(v / BH);
      const ly = v % BH;
      const off = row % 2 ? BW / 2 : 0;
      for (let x = 0; x < c.w; x++) {
        const xx = (x + off) % c.w;
        const bx = Math.floor(xx / BW);
        const lx = xx % BW;
        const r = hash2(bx, row, 4) < 0.22 ? b2 : b;
        const litLen = 4 + Math.floor(hash2(bx, row, 6) * 9);
        let t = 3;
        if (ly === BH - 1) t = 2; // joint above the block, in shadow
        else if (lx === 0) t = 2;
        else if (ly === BH - 2 && lx < litLen) t = 4; // part of the block's top arris catches the light
        else if (ly === 0 && lx > BW - 5) t = 2;
        // Pores the paint didn't fill: sparse dark pits.
        if (t === 3 && hash2(x, y, 9) > 0.965) t = 2;
        c.set(x, y, r, t);
      }
    }
    // Chipped arrises (lit lip below a dark pit).
    for (let i = 0; i < 10; i++) {
      const x = rng.int(0, c.w - 2);
      const y = rng.int(0, c.h - 2);
      c.shift(x, y, -2);
      c.shift(x + 1, y, -1);
      c.shift(x, y + 1, 1);
    }
    // Mildew at the foot: green-grey clusters thinning upward.
    const g = o.grime ?? 0.6;
    for (let i = 0; i < Math.round(60 * g); i++) {
      const v = Math.floor(Math.pow(rng.next(), 2) * 14);
      c.cluster(rng.int(0, c.w - 3), rowUp(c, v), rng.int(0, 9), mold, rng.chance(0.5) ? 2 : 3);
    }
  }, { wrap: true });
}

/**
 * Wallpaper (lobby / atrium upper walls, offices): a faded damask repeat in two
 * close tones, vertical seams every half metre (some lifting: a lit edge and a
 * shadow), tide-mark stains are decals. 128 × 96.
 */
export function z2WallpaperTile(atlas: PwAtlas, o: { hex: number; ink?: number }): PwTile {
  return atlas.tile(`z2paper|${h6(o.hex)}|${h6(o.ink ?? 0)}`, 128, 96, (c, k) => {
    const p = k.ramp(o.hex, { light: 0.4, sat: 0.95 });
    const ink = k.ramp(o.ink ?? shiftHue(darken(o.hex, 0.84), -0.02, 1.1), { light: 0.4, sat: 1 });
    const W = c.w;
    const H = c.h;
    // Regency stripe: a wide ground band, a darker band, a pale pinstripe either side (16-texel repeat).
    const S = [3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 2, 2, 2, 2, 4, 3];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, S[x & 15] === 2 ? ink : p, S[x & 15] === 2 ? 3 : S[x & 15]);
    // A small sprig in the wide band every 24 rows (half-drop).
    for (let my = 0; my < H; my += 24) {
      for (let mx = 0; mx < W; mx += 16) {
        const cx = mx + 4;
        const cy = (my + ((mx >> 4) % 2 ? 12 : 0) + 4) % H;
        for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [0, 0], [0, 1], [-2, 0], [2, 0]]) c.set(wrap(cx + dx, W), wrap(cy + dy, H), ink, dy === -2 ? 4 : 3);
      }
    }
    // Faded areas (sun / age): a step lighter in soft blooms.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (smooth(x, y, W, H, 4, 61) > 0.72 && bayer(x, y) > 0.35) c.shift(x, y, 1);
    // Seams every 32 texels: a fine dark line; a lifted edge on some (lit lip + shadow).
    const rng = k.rng;
    for (let x = 0; x < W; x += 32) {
      if (hash2(x, 1, 7) > 0.45) {
        const y0 = rng.int(0, H - 30);
        const len = rng.int(10, 26);
        for (let y = y0; y < y0 + len; y++) {
          c.shift(x, y, -2);
          c.shift(x + 1, y, 1);
        }
      }
    }
  }, { wrap: true });
}

/**
 * Polished stone wainscot (atrium): book-matched granite / marble panels 1 m ×
 * 0.75 m with fine veining, a lit polished bevel, dark joints. 128 × 48.
 */
export function z2StonePanelTile(atlas: PwAtlas, o: { hex: number; vein?: number }): PwTile {
  return atlas.tile(`z2stone|${h6(o.hex)}|${h6(o.vein ?? 0)}`, 128, 48, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.45, sat: 0.9 });
    const s2 = k.ramp(shiftHue(o.hex, 0.02, 1.1), { light: 0.45, sat: 0.9 });
    const vein = k.ramp(o.vein ?? mixHex(o.hex, 0xd8d0c0, 0.55), { light: 0.4, sat: 0.7 });
    const PW = 32;
    const PH = 24;
    for (let y = 0; y < c.h; y++) {
      const v = c.h - 1 - y;
      const py = Math.floor(v / PH);
      const ly = v % PH;
      for (let x = 0; x < c.w; x++) {
        const px = Math.floor(x / PW);
        const lx = x % PW;
        const r = (px + py) % 2 ? s2 : s;
        let t = 3;
        if (lx === 0 || ly === PH - 1) t = 0;
        else if (ly === PH - 2 || lx === 1) t = 4;
        else if (ly === 0 || lx === PW - 1) t = 2;
        c.set(x, y, r, t);
      }
    }
    // Veins: wandering 1-texel lines, mostly diagonal, a lighter mineral (stay inside a panel).
    for (let i = 0; i < 14; i++) {
      const px = rng.int(0, c.w / PW - 1);
      const py = rng.int(0, c.h / PH - 1);
      let x = px * PW + rng.int(3, PW - 4);
      let y = c.h - 1 - (py * PH + rng.int(2, PH - 4));
      let a = rng.range(-2.4, -0.6);
      const len = rng.int(10, 26);
      for (let j = 0; j < len; j++) {
        const lx = Math.round(x) - px * PW;
        const ly = c.h - 1 - Math.round(y) - py * PH;
        if (lx < 2 || lx > PW - 2 || ly < 1 || ly > PH - 3) break;
        c.set(Math.round(x), Math.round(y), vein, j % 5 === 2 ? 4 : 3);
        a += rng.spread(0.5);
        x += Math.cos(a);
        y += Math.sin(a) * 0.7;
      }
    }
    // Polished glints along the top bevels.
    for (let i = 0; i < 8; i++) c.set(rng.int(0, c.w - 1), rowUp(c, rng.pick([PH - 2, PH * 2 - 2])), s, 5);
  }, { wrap: true });
}

/**
 * Rubber cove skirting / painted plinth: a vertically uniform strip (v from the
 * floor) with a lit lip on top, scuffs and dents along it. 64 × 16.
 */
export function z2SkirtingTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`z2skirt|${h6(o.hex)}`, 64, 16, (c, k) => {
    const s = k.ramp(o.hex, { light: 0.5, sat: 0.8 });
    for (let y = 0; y < c.h; y++) {
      const v = c.h - 1 - y;
      const t = v === 4 ? 5 : v === 3 ? 4 : v === 0 ? 1 : v > 4 ? 3 : 2;
      c.rect(0, y, c.w, 1, s, t);
    }
    for (let i = 0; i < 6; i++) {
      const x = k.rng.int(0, c.w - 4);
      c.lineShade(x, rowUp(c, k.rng.int(1, 3)), x + k.rng.int(1, 4), rowUp(c, k.rng.int(1, 3)), 1);
    }
  }, { wrap: true });
}

/**
 * Bumper / dado rail: vertically uniform (any height reads), screw caps every
 * metre, dents and scuffs. 64 × 16.
 */
export function z2RailTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`z2rail|${h6(o.hex)}`, 64, 16, (c, k) => {
    const r = k.ramp(o.hex, { light: 0.5, sat: 0.85 });
    for (let y = 0; y < c.h; y++) c.rect(0, y, c.w, 1, r, y % 8 === 0 ? 4 : y % 8 === 7 ? 2 : 3);
    for (let x = 16; x < c.w; x += 32) {
      for (let y = 0; y < c.h; y += 8) {
        c.set(x, y + 3, r, 1);
        c.set(x + 1, y + 4, r, 4);
      }
    }
    for (let i = 0; i < 7; i++) {
      const x = k.rng.int(0, c.w - 5);
      const y = k.rng.int(0, c.h - 1);
      c.lineShade(x, y, x + k.rng.int(2, 5), y, -1);
    }
  }, { wrap: true });
}

// ─── Floors ──────────────────────────────────────────────────────────────────

/**
 * Vinyl composition tile in a two-colour checker (ER, corridors, nurse
 * station): 16-texel (50 cm) tiles, the factory speckle as sparse 1–2 texel
 * flecks, a polished sheen streak along some tiles, dark heel marks, a lifted
 * corner. 128 × 128.
 */
export function z2VinylTile(atlas: PwAtlas, o: { a: number; b: number; fleck?: number }): PwTile {
  return atlas.tile(`z2vinyl|${h6(o.a)}|${h6(o.b)}|${h6(o.fleck ?? 0)}`, 128, 128, (c, k) => {
    const rng = k.rng;
    const A = k.ramp(o.a, { light: 0.42, sat: 0.95 });
    const Bm = k.ramp(o.b, { light: 0.42, sat: 0.95 });
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const lx = x & 15;
        const ly = y & 15;
        const r = ((x >> 4) + (y >> 4)) % 2 ? Bm : A;
        // One-sided seam (the tile's left / top edge a step down), worn polish a step up on some tiles' centres.
        c.set(x, y, r, lx === 0 || ly === 0 ? 2 : 3);
      }
    }
    // VCT chips: a few small pebble clusters per tile (lighter on the dark tiles, darker on the light ones).
    for (let ty = 0; ty < 8; ty++) {
      for (let tx = 0; tx < 8; tx++) {
        const dark = (tx + ty) % 2 === 1;
        for (let n = 0; n < 3; n++) c.cluster(tx * 16 + 3 + rng.int(0, 9), ty * 16 + 3 + rng.int(0, 9), rng.int(0, 6), 0, dark ? 1 : -1);
      }
    }
    // Heel / wheel marks: a few short dark curved dashes.
    for (let i = 0; i < 4; i++) {
      const x = rng.int(0, c.w - 8);
      const y = rng.int(0, c.h - 4);
      const len = rng.int(3, 6);
      for (let j = 0; j < len; j++) c.shift(x + j, y + Math.round(Math.sin(j * 0.6) * 1.2), -1.5);
    }
  }, { wrap: true });
}

/**
 * Welded sheet vinyl (ward): a speckled sheet in one colour with heat-welded
 * seams every 2 m (a thin contrasting bead), mopping swirls, a trolley track.
 * 128 × 128.
 */
export function z2SheetVinylTile(atlas: PwAtlas, o: { hex: number; bead?: number }): PwTile {
  return atlas.tile(`z2sheet|${h6(o.hex)}|${h6(o.bead ?? 0)}`, 128, 128, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.42, sat: 0.95 });
    const bead = k.ramp(o.bead ?? shiftHue(darken(o.hex, 0.75), 0.04, 1.2), { light: 0.4 });
    c.rect(0, 0, c.w, c.h, s, 3);
    // Worn traffic areas a step darker, the polish a step up elsewhere (clusters).
    mottle(c, 4, 71, 0.26, -1);
    mottle(c, 4, 72, 0.18, 1);
    // Speckle: sparse 1–2 texel chips a step off the sheet.
    for (let i = 0; i < 110; i++) c.cluster(rng.int(0, c.w - 2), rng.int(0, c.h - 2), rng.int(0, 1), 0, rng.chance(0.5) ? 1 : -1);
    // Welded seams every 64 texels.
    for (let x = 0; x < c.w; x += 64) c.vline(x, 0, c.h, bead, 3);
  }, { wrap: true });
}

/**
 * Square quarry tiles (morgue): 16-texel (50 cm) tiles, the grout a single
 * row / column one step under the tile (never the outline step: from across
 * the room a dark grout grid breaks into dashes and colour fringes), a lit
 * lip on some tiles, a tile or two of a slightly different firing, traffic
 * wear in broad clusters. Rust / stain rings are decals. 64 × 64.
 */
export function z2FloorTileTile(atlas: PwAtlas, o: { hex: number; grout?: number }): PwTile {
  return atlas.tile(`z2ftile2|${h6(o.hex)}|${h6(o.grout ?? 0)}`, 64, 64, (c, k) => {
    const t = k.ramp(o.hex, { light: 0.32, dark: 0.55, sat: 0.9 });
    const t2 = k.ramp(shiftHue(o.hex, 0.02, 1.05), { light: 0.32, dark: 0.55, sat: 0.9 });
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const lx = x & 15;
        const ly = y & 15;
        const tx = x >> 4;
        const ty = y >> 4;
        const r = hash2(tx, ty, 6) > 0.8 ? t2 : t;
        let tone = 3;
        if (lx === 0 || ly === 0) tone = 2;
        else if (ly === 1 && lx > 2 && lx < 12 && hash2(tx, ty, 4) > 0.6) tone = 4;
        c.set(x, y, r, tone);
      }
    }
    mottle(c, 4, 57, 0.28, -1, 0, 0.6);
  }, { wrap: true });
}

/**
 * Troweled concrete (basement floors, stair landings, slabs; NEUTRAL: tinted
 * per material): two tones in broad trowel patches, saw-cut joints every 2 m,
 * aggregate pops, a hairline crack, damp darker blooms. 128 × 128.
 */
export function z2ConcreteTile(atlas: PwAtlas, o: { hex: number; joints?: boolean }): PwTile {
  return atlas.tile(`z2conc|${h6(o.hex)}|${o.joints === false ? 0 : 1}`, 128, 128, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.38, sat: 0.85 });
    // Trowel / curing mottle: damp blooms a step darker, laitance a step lighter (clusters, no dither).
    c.rect(0, 0, c.w, c.h, s, 3);
    mottle(c, 4, 41, 0.32, -1);
    mottle(c, 4, 43, 0.22, 1);
    // Aggregate pops: a dark pit with a lit lower lip, sparse.
    for (let i = 0; i < 70; i++) {
      const x = rng.int(0, c.w - 2);
      const y = rng.int(0, c.h - 2);
      c.shift(x, y, -1);
      if (rng.chance(0.4)) c.shift(x + 1, y + 1, 1);
    }
    c.scatter(rng, 0, 0, c.w, c.h, 24, 0, -1, { shapes: 4 });
    if (o.joints !== false) {
      for (let x = 0; x < c.w; x += 64) for (let y = 0; y < c.h; y++) {
        c.set(x, y, s, 1);
        c.shift(x + 1, y, 1);
      }
      for (let y = 0; y < c.h; y += 64) for (let x = 0; x < c.w; x++) {
        c.set(x, y, s, 1);
        c.shift(x, y + 1, 1);
      }
    }
    crack(c, rng, rng.int(0, c.w - 1), rng.int(0, c.h - 1), rng.int(18, 34), rng.next() * 6, { dt: -2, lip: 1, branch: 0.08 });
  }, { wrap: true });
}

/**
 * Lobby marble (atrium floor): 1 m slabs in a two-stone checker, the joint a
 * single texel one step under the stone (never a dark grid: it crawls), the
 * figure in soft two-step clouds with dithered seams, veins as soft 2-texel
 * dithered drifts (not pale 1-texel scratches), a dull polish. Stains, cracks
 * and blood are placed decals. 128 × 128.
 */
export function z2MarbleTile(atlas: PwAtlas, o: { a: number; b: number; vein?: number }): PwTile {
  return atlas.tile(`z2marble2|${h6(o.a)}|${h6(o.b)}|${h6(o.vein ?? 0)}`, 128, 128, (c, k) => {
    const rng = k.rng;
    const A = k.ramp(o.a, { light: 0.32, dark: 0.55, sat: 0.9 });
    const Bm = k.ramp(o.b, { light: 0.32, dark: 0.55, sat: 0.9 });
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const lx = x & 31;
        const ly = y & 31;
        const dark = ((x >> 5) + (y >> 5)) % 2 === 1;
        // Clouds in the stone: a soft two-step figure, its seam dithered.
        const n = smooth(x, y, c.w, c.h, 8, dark ? 53 : 51) * 0.7 + smooth(x, y, c.w, c.h, 24, 52) * 0.3;
        let t = n > 0.6 ? 3.5 : n < 0.36 ? 2.5 : 3;
        let f = t % 1 ? PWF.DITHER : 0;
        if (lx === 0 || ly === 0) {
          t = 2;
          f = 0;
        }
        c.set(x, y, dark ? Bm : A, t, f);
      }
    }
    // Veins: soft drifts across each slab on a diagonal (2 texels, dithered half a step up).
    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        const dark = (tx + ty) % 2 === 1;
        const r = dark ? Bm : A;
        let x = tx * 32 + rng.int(2, 10);
        let y = ty * 32 + rng.int(2, 28);
        let a = rng.chance(0.5) ? 0.7 : -0.7;
        for (let j = 0; j < 40; j++) {
          const lx = Math.round(x) - tx * 32;
          const ly = Math.round(y) - ty * 32;
          if (lx < 2 || lx > 29 || ly < 2 || ly > 29) break;
          c.set(Math.round(x), Math.round(y), r, 4, j % 4 === 0 ? 0 : PWF.DITHER);
          c.set(Math.round(x) + 1, Math.round(y), r, 3.5, PWF.DITHER);
          a += rng.spread(0.25);
          x += Math.cos(a);
          y += Math.sin(a);
        }
      }
    }
  }, { wrap: true });
}

/**
 * Terrazzo (operating theatre): a pale ground with sparse marble chips a step
 * or two off it (a few coloured), zinc divider strips every 2 m, a sheen. 128 × 128.
 */
export function z2TerrazzoTile(atlas: PwAtlas, o: { hex: number; chips?: number[] }): PwTile {
  return atlas.tile(`z2terrazzo2|${h6(o.hex)}|${(o.chips ?? []).map(h6).join('.')}`, 128, 128, (c, k) => {
    const rng = k.rng;
    const b = k.ramp(o.hex, { light: 0.42, sat: 0.8 });
    const chips = (o.chips ?? []).map((h) => k.ramp(h, { light: 0.4, sat: 0.8 }));
    c.rect(0, 0, c.w, c.h, b, 3);
    for (let i = 0; i < 260; i++) {
      const x = rng.int(0, c.w - 2);
      const y = rng.int(0, c.h - 2);
      const r = rng.next();
      if (r < 0.08 && chips.length) c.cluster(x, y, rng.int(0, 3), chips[i % chips.length], 3);
      else c.cluster(x, y, rng.int(0, 3), 0, r < 0.55 ? 1 : -1);
    }
    // Zinc divider strips: a step under the ground (bright strips read as graph paper).
    for (let x = 0; x < c.w; x += 64) c.vline(x, 0, c.h, b, 2);
    for (let y = 0; y < c.h; y += 64) c.hline(0, y, c.w, b, 2);
  }, { wrap: true });
}

// ─── Ceilings ────────────────────────────────────────────────────────────────

/**
 * Suspended acoustic ceiling (NEUTRAL): 1 m lay-in tiles in a lit T-bar grid,
 * fissured faces (sparse dark pits in short worm runs), tiles sitting a hair
 * crooked (a dark gap on one side). Holes, stains and sag are decals. 128 × 128.
 */
export function z2CeilingTile(atlas: PwAtlas, o: { hex: number; grid?: number }): PwTile {
  return atlas.tile(`z2ceil|${h6(o.hex)}|${h6(o.grid ?? 0)}`, 128, 128, (c, k) => {
    const rng = k.rng;
    const t = k.ramp(o.hex, { light: 0.4, sat: 0.7 });
    const t2 = k.ramp(darken(o.hex, 0.93), { light: 0.4, sat: 0.7 });
    const grid = k.ramp(o.grid ?? mixHex(o.hex, 0xd8dcd0, 0.4), { light: 0.45, sat: 0.6 });
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const lx = x & 31;
        const ly = y & 31;
        const tx = x >> 5;
        const ty = y >> 5;
        if (lx === 0 || ly === 0) {
          c.set(x, y, grid, 4);
          continue;
        }
        const r = hash2(tx, ty, 13) > 0.7 ? t2 : t;
        let tone = 3;
        // A crooked tile: dark gap along one edge.
        if (hash2(tx, ty, 21) > 0.8 && (lx === 1 || ly === 1)) tone = 1;
        else if (lx === 1 || ly === 1) tone = 2;
        else if (lx === 31 || ly === 31) tone = 4;
        c.set(x, y, r, tone);
      }
    }
    // Fissures: short worm runs of darker texels.
    for (let i = 0; i < 160; i++) {
      let x = rng.int(0, c.w - 1);
      let y = rng.int(0, c.h - 1);
      for (let j = 0; j < rng.int(1, 4); j++) {
        if ((x & 31) > 1 && (y & 31) > 1) c.shift(x, y, -1);
        x += rng.int(-1, 1);
        y += rng.int(0, 1);
      }
    }
  }, { wrap: true });
}

// ─── Fabric, metal, wood, flesh (props; mostly NEUTRAL) ─────────────────────

/** Bed linen / upholstery (NEUTRAL): a soft weave, creases as lit / dark pairs, a seam. 64 × 64. */
export function z2LinenTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`z2linen|${h6(o.hex)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const r = k.ramp(o.hex, { light: 0.42, sat: 0.9 });
    c.rect(0, 0, c.w, c.h, r, 3);
    // Creases: diagonal lit ridge with a shadow below.
    for (let i = 0; i < 9; i++) {
      const x = rng.int(0, c.w - 1);
      const y = rng.int(0, c.h - 1);
      const len = rng.int(6, 16);
      const dy = rng.chance(0.5) ? 1 : -1;
      for (let j = 0; j < len; j++) {
        const xx = wrap(x + j, c.w);
        const yy = wrap(y + Math.round((j * dy) / 3), c.h);
        c.shift(xx, yy, 1);
        c.shift(xx, wrap(yy + 1, c.h), -1);
      }
    }
    c.scatter(rng, 0, 0, c.w, c.h, 12, 0, -1, { shapes: 3 });
  }, { wrap: true });
}

/**
 * Printed privacy curtain (NEUTRAL): vertical pleats (lit crest, shadowed
 * fold every 6 texels), a small geometric print, the mesh band at the top is
 * a separate strip. 64 × 64.
 */
export function z2CurtainTile(atlas: PwAtlas, o: { hex: number; print?: number }): PwTile {
  return atlas.tile(`z2curtain|${h6(o.hex)}|${h6(o.print ?? 0)}`, 64, 64, (c, k) => {
    const r = k.ramp(o.hex, { light: 0.45, sat: 0.9 });
    const pr = k.ramp(o.print ?? shiftHue(darken(o.hex, 0.72), 0.06, 1.2), { light: 0.4 });
    const PL = [4, 3, 3, 3, 2, 1, 2, 3];
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) c.set(x, y, r, PL[x % 8]);
    // Print: small diamonds in a half-drop repeat, shaded by the fold under them.
    for (let y = 2; y < c.h; y += 8) {
      for (let x = 2; x < c.w; x += 8) {
        const xx = x + ((y >> 3) % 2 ? 4 : 0);
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
          const px = wrap(xx + dx, c.w);
          c.set(px, wrap(y + dy, c.h), pr, Math.max(1, PL[px % 8] - 1));
        }
      }
    }
    // Hem stains low down are decals; a couple of grimy fingermarks.
    c.scatter(k.rng, 0, 0, c.w, c.h, 6, 0, -1, { shapes: 5 });
  }, { wrap: true });
}

/**
 * Brushed stainless steel (NEUTRAL): horizontal grain lines, a soft sheen band,
 * scratches, fingerprint smudges. 64 × 64.
 */
export function z2SteelTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`z2steel|${h6(o.hex)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.55, sat: 0.7 });
    for (let y = 0; y < c.h; y++) {
      const band = Math.abs(((y + 8) % 32) - 16) < 3 ? 4 : 3;
      for (let x = 0; x < c.w; x++) c.set(x, y, s, band);
      // Grain: broken darker lines.
      if (y % 3 === 0) for (let x = 0; x < c.w; x++) if (hash2(x >> 2, y, 3) > 0.45) c.shift(x, y, -1);
    }
    for (let i = 0; i < 8; i++) {
      const x = rng.int(0, c.w - 8);
      const y = rng.int(0, c.h - 4);
      c.lineShade(x, y, x + rng.int(4, 9), y + rng.int(-3, 3), 1);
    }
    c.scatter(rng, 0, 0, c.w, c.h, 8, 0, -1, { shapes: 6 });
  }, { wrap: true });
}

/**
 * Painted sheet metal (NEUTRAL: cabinets, carts, door frames, pipes): a flat
 * enamel with a sheen at the panel's top, chips through to dark primer with a
 * lit lower lip, rust bloom from a couple of chips. 64 × 64.
 */
export function z2EnamelTile(atlas: PwAtlas, o: { hex: number; rust?: number }): PwTile {
  return atlas.tile(`z2enamel|${h6(o.hex)}|${o.rust ?? 0.3}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const e = k.ramp(o.hex, { light: 0.5, sat: 0.9 });
    const primer = k.ramp(0x3a3a3c, { light: 0.4 });
    const rust = k.ramp(0x7a4024, { light: 0.4 });
    c.rect(0, 0, c.w, c.h, e, 3);
    for (let x = 0; x < c.w; x++) if (hash2(x >> 3, 1, 4) > 0.5) c.set(x, 3 + (x >> 4) % 2, e, 4);
    for (let i = 0; i < 9; i++) {
      const x = rng.int(0, c.w - 4);
      const y = rng.int(0, c.h - 4);
      c.cluster(x, y, rng.int(0, 9), primer, 2);
      c.shift(x + 1, y + 2, 1);
      if (rng.chance(o.rust ?? 0.3)) for (let j = 1; j < rng.int(3, 9); j++) if (bayer(x, y + j) > j / 10) c.set(x + (j % 2), wrap(y + j, c.h), rust, 3 - (j > 4 ? 1 : 0));
    }
    c.scatter(rng, 0, 0, c.w, c.h, 10, 0, -1, { shapes: 4 });
  }, { wrap: true });
}

/**
 * Wood veneer (NEUTRAL: doors, counters, benches, desks): long grain in close
 * tones with a cathedral figure now and then, a lacquer sheen, worn edges are
 * decals. 64 × 64.
 */
export function z2VeneerTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`z2veneer|${h6(o.hex)}`, 64, 64, (c, k) => {
    const w = k.ramp(o.hex, { light: 0.45, sat: 0.95 });
    c.rect(0, 0, c.w, c.h, w, 3);
    // Long straight grain: broken darker lines, a lighter figure line now and then.
    for (let y = 1; y < c.h; y += 3) {
      const off = Math.floor(hash2(y, 1, 9) * 64);
      for (let x = 0; x < c.w; x++) {
        const run = hash2((x + off) >> 3, y, 4);
        if (run > 0.55) c.set(x, y, w, 2);
        else if (run < 0.08) c.set(x, y, w, 4);
      }
    }
  }, { wrap: true });
}

/**
 * Raw flesh (the atrium's growth, the fountain pool, the cocoon): wet lobes
 * outlined in dark creases, each lit from the upper left, glistening specks,
 * veins and nodules. Per colour. 64 × 64.
 */
export function z2FleshTile(atlas: PwAtlas, o: { hex: number; vein?: number }): PwTile {
  return atlas.tile(`z2flesh|${h6(o.hex)}|${h6(o.vein ?? 0)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const f = k.ramp(o.hex, { light: 0.5, sat: 1.1 });
    const vein = k.ramp(o.vein ?? 0x5a1a3a, { light: 0.45, sat: 1.1 });
    // Lobes: a jittered 4 × 5 grid of centres (wrapping), each texel shaded by its nearest two.
    const GX = 4;
    const GY = 5;
    const CW = c.w / GX;
    const CH = c.h / GY;
    const cxs = new Float32Array(GX * GY);
    const cys = new Float32Array(GX * GY);
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      cxs[j * GX + i] = (i + 0.2 + hash2(i, j, 3) * 0.6) * CW;
      cys[j * GX + i] = (j + 0.2 + hash2(i, j, 5) * 0.6) * CH;
    }
    for (let y = 0; y < c.h; y++) {
      const gy = Math.floor(y / CH);
      for (let x = 0; x < c.w; x++) {
        const gx = Math.floor(x / CW);
        let best = 1e9;
        let second = 1e9;
        let bdx = 0;
        let bdy = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const jj = gy + oy;
          const wj = (jj + GY) % GY;
          const sy = (jj - wj) * CH;
          for (let ox = -1; ox <= 1; ox++) {
            const ii = gx + ox;
            const wi = (ii + GX) % GX;
            const px = cxs[wj * GX + wi] + (ii - wi) * CW;
            const py = cys[wj * GX + wi] + sy;
            const dx = x - px;
            const dy = y - py;
            const d = dx * dx + dy * dy;
            if (d < best) {
              second = best;
              best = d;
              bdx = dx;
              bdy = dy;
            } else if (d < second) second = d;
          }
        }
        const edge = Math.sqrt(second) - Math.sqrt(best);
        let t = 3;
        if (edge < 1.2) t = 1;
        else if (edge < 2.4) t = 2;
        else if (bdx + bdy < -3) t = 4;
        c.set(x, y, f, t);
      }
    }
    // Veins along the surface + nodules.
    for (let i = 0; i < 6; i++) {
      let x = rng.int(0, c.w - 1);
      let y = rng.int(0, c.h - 1);
      let a = rng.next() * 6.28;
      for (let j = 0; j < rng.int(10, 24); j++) {
        c.set(wrap(Math.round(x), c.w), wrap(Math.round(y), c.h), vein, j % 3 ? 3 : 2);
        a += rng.spread(0.7);
        x += Math.cos(a);
        y += Math.sin(a);
      }
    }
    // Glistening specks (wet).
    for (let i = 0; i < 26; i++) c.set(rng.int(0, c.w - 1), rng.int(0, c.h - 1), f, 5);
  }, { wrap: true });
}

/** A plain painted surface with sparse wear (NEUTRAL fallback for untextured colours). 64 × 64. */
export function z2PlainTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`z2plain|${h6(o.hex)}`, 64, 64, (c, k) => {
    const r = k.ramp(o.hex, { light: 0.45, sat: 0.9 });
    c.rect(0, 0, c.w, c.h, r, 3);
    for (let x = 0; x < c.w; x++) c.set(x, (x >> 3) % 2 ? 2 : 3, r, 4);
    c.scatter(k.rng, 0, 0, c.w, c.h, 14, 0, -1, { shapes: 4 });
    c.scatter(k.rng, 0, 0, c.w, c.h, 8, 0, 1, { shapes: 2 });
  }, { wrap: true });
}

/** Linear blend of two hex colours (t = 0 → a). */
export function mixHex(a: number, b: number, t: number): number {
  const m = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** A glow flag shorthand for painters in the z2 files. */
export const G = PWF.GLOW;

/**
 * Wet blood (any leftover blood-coloured box: sheets, trays, tables): dark
 * clotted base, fresher red runs, glossy highlights where the light catches
 * the wet surface. Per colour. 32 × 32.
 */
export function z2BloodTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`z2blood|${h6(o.hex)}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const b = k.ramp(o.hex, { light: 0.45, sat: 1.15 });
    c.rect(0, 0, c.w, c.h, b, 3);
    mottle(c, 4, 91, 0.35, -1);
    for (let i = 0; i < 6; i++) {
      const x = rng.int(0, c.w - 4);
      const y = rng.int(0, c.h - 2);
      c.set(x, y, b, 5);
      c.set(x + 1, y, b, 4);
    }
    for (let i = 0; i < 5; i++) c.cluster(rng.int(0, c.w - 3), rng.int(0, c.h - 3), rng.int(4, 9), b, 1);
  }, { wrap: true });
}

/**
 * Stair tread (wrap along u, 64 × 16; v = 0 at the tread's back, 9–10 at its
 * front edge): worn concrete with a darker trodden middle, then the
 * anti-slip nosing — a grooved strip with chipped yellow paint.
 */
export function z2TreadTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`z2tread2|${h6(o.hex)}`, 64, 16, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(o.hex, { light: 0.32, dark: 0.55, sat: 0.8 });
    const alu = k.ramp(mixHex(o.hex, 0x8a8e8c, 0.4), { light: 0.3, dark: 0.6, sat: 0.4 });
    for (let v = 0; v < 16; v++) {
      const y = c.h - 1 - v;
      for (let x = 0; x < c.w; x++) {
        if (v < 8) {
          // Trodden middle a step darker (feet keep to the centre of each 1 m).
          const mid = Math.abs(((x + 16) % 32) - 16) < 9;
          c.set(x, y, s, mid && hash2(x >> 1, v, 3) > 0.35 ? 2 : 3);
        } else if (v < 10) {
          // Nosing: a 2-texel worn aluminium strip close in value to the concrete (seen from the head
          // of the flight every tread is a few pixels tall: no hard bands to shimmer).
          c.set(x, y, alu, v === 8 ? 2 : 3);
        } else c.set(x, y, s, 3);
      }
    }
    c.scatter(rng, 0, 9, c.w, 7, 14, 0, -1, { shapes: 3 });
  }, { wrap: true });
}
