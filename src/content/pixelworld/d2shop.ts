import { bayer, PWF, type PwCanvas, type PwRng } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, textWidth } from './font';
import { NEUTRAL_HEX } from './retexture';
import { hash2 } from './surfaces';
import { frond, RAPTOR, REX, silhouette, TRIKE } from './d2art';
import { bloodSplat, h6, plate, rivet, scuffs, shiftW, waterStain } from './d2kit';

/**
 * RESEARCH LABS · the GIFT SHOP: a loud souvenir-shop carpet with dino tracks,
 * striped jungle wallpaper, acoustic ceiling tiles, merchandise walls (plush
 * dinos, boxed toys, mugs, shirts, snow globes on lit-edged shelves), the till
 * counter, the plush T. rex mascot and postcards — knocked about, looted gaps.
 */

const TOYS = [0x3aa04a, 0xe07a20, 0x8a4ac0, 0x2a8ad0, 0xd0402a, 0xe0c030];

/** Souvenir-shop carpet: deep blue pile, a repeat of yellow tracks and green fronds, a trodden path, a soda stain. 128 × 128. */
export function shopCarpetTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2carpet',
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const blue = k.ramp(0x32508a, { light: 0.4, sat: 1.0 });
      const yel = k.ramp(0xe0b030, { light: 0.4 });
      const grn = k.ramp(0x2a8a4a, { light: 0.4 });
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) c.set(x, y, blue, (x * 3 + y * 5) % 7 === 0 ? 2 : (x + y * 3) % 11 === 0 ? 4 : 3);
      // Motifs on a half-drop grid: a three-toed track, a fern spray.
      for (let gy = 0; gy < 4; gy++) {
        for (let gx = 0; gx < 4; gx++) {
          const cx = gx * 32 + (gy % 2 ? 16 : 0) + 8;
          const cy = gy * 32 + 10;
          if ((gx + gy) % 2 === 0) {
            c.ellipse(cx, cy + 5, 2.5, 2, yel, 3);
            for (const a of [-0.55, 0, 0.55]) for (let s = 0; s < 6; s++) c.set(Math.round(cx + Math.sin(a) * s), Math.round(cy + 3 - Math.cos(a) * s), yel, s === 5 ? 2 : 3);
          } else {
            frond(c, cx - 2, cy + 8, -1.2, 9, grn, 3);
            frond(c, cx + 2, cy + 8, -2.0, 7, grn, 3);
          }
        }
      }
      // Trodden: a darker, flattened band; a soda stain; fluff.
      for (let y = 0; y < 128; y++) for (let x = 40; x < 88; x++) if (bayer(x, y) < 0.35 + 0.15 * Math.sin(y * 0.1)) c.shift(x, y, -0.6);
      waterStain(c, 96, 40, 9, 6, { dt: -1 });
      scuffs(c, rng, 0, 0, 128, 128, 20, 0.75);
    },
    { wrap: true },
  );
}

/**
 * Striped souvenir-shop wallpaper over a timber skirting (world-projected from
 * the floor, 4.4 m): cream / tan stripes, a fern damask in the tan stripes, a
 * printed border at 3 m, peeling seams, a water stain. 128 × 144.
 */
export function wallpaperTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2wallpaper',
    128,
    144,
    (c, k) => {
      const rng = k.rng;
      const cream = k.ramp(0xd0b48a, { light: 0.4, sat: 0.9 });
      const tan = k.ramp(0xb08a5e, { light: 0.4, sat: 0.9 });
      const leaf = k.ramp(0x6a7a4a, { light: 0.35, sat: 0.8 });
      const plaster = k.ramp(0xb0a898, { light: 0.4 });
      const wood = k.ramp(0x4a3020, { light: 0.45 });
      const border = k.ramp(0x2a5a3a, { light: 0.45 });
      const H = 144;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < 128; x++) {
          const stripe = Math.floor(x / 16) % 2;
          c.set(x, y, stripe ? tan : cream, x % 16 === 0 ? 2.5 : 3);
        }
      }
      // Damask: small fern sprigs in the tan stripes.
      for (let sx = 16; sx < 128; sx += 32) for (let sy = 6; sy < H - 10; sy += 22) frond(c, sx + 8 + (sy % 44 ? 3 : -3), sy + 14, -1.57 + (sy % 44 ? 0.4 : -0.4), 10, leaf, 3);
      // A printed border band (≈ 3 m up): green with a tan track motif.
      const by = H - 98;
      c.rect(0, by, 128, 6, border, 3);
      c.hline(0, by, 128, border, 4);
      c.hline(0, by + 5, 128, border, 1.5);
      for (let x = 4; x < 128; x += 16) {
        c.set(x, by + 3, tan, 3.5);
        c.set(x + 1, by + 2, tan, 3.5);
        c.set(x - 1, by + 2, tan, 3.5);
      }
      // Seams peeling: a curled strip edge (shadow under, lit lip) showing plaster.
      for (const sx of [32, 96]) {
        const y0 = rng.int(10, 40);
        const len = rng.int(14, 30);
        for (let y = y0; y < y0 + len; y++) {
          const w = Math.round(2 + Math.sin((y - y0) / len * Math.PI) * 3);
          for (let j = 0; j < w; j++) c.set(sx + j, y, plaster, 3);
          c.set(sx + w, y, cream, 4.5);
          c.set(sx + w + 1, y, cream, 1.5);
        }
      }
      waterStain(c, 70, 22, 12, 16, { dt: -0.75 });
      // Skirting (bottom 6 rows), scuffs above it.
      for (let y = H - 6; y < H; y++) c.hline(0, y, 128, wood, y === H - 6 ? 4 : y === H - 1 ? 1 : 2.75);
      scuffs(c, rng, 0, H - 14, 128, 8, 14, -0.75);
    },
    { wrap: true },
  );
}

/** Fissured acoustic ceiling tiles (0.5 m) in a T-bar grid, worm-hole fissures, a water-stained tile, a sagging one (NEUTRAL). 64 × 64. */
export function acousticTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2acoustic',
    64,
    64,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(NEUTRAL_HEX, { light: 0.35, sat: 0.6 });
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const lx = x % 16;
          const ly = y % 16;
          if (lx === 0 || ly === 0) c.set(x, y, m, 4);
          else if (lx === 15 || ly === 15) c.set(x, y, m, 2);
          else c.set(x, y, m, 3);
        }
      }
      // Fissures: short wormy dark marks.
      for (let i = 0; i < 120; i++) {
        const x = rng.int(0, 63);
        const y = rng.int(0, 63);
        if (x % 16 < 2 || y % 16 < 2) continue;
        c.shift(x, y, -1);
        if (rng.chance(0.5)) c.shift(x + (rng.chance(0.5) ? 1 : 0), y + 1, -1);
      }
      // Stained tile (tide ring), a sagging tile (darker, a shadowed edge).
      c.ellipseShade(40, 24, 6, 5, (d) => (d > 0.75 ? -1.25 : -0.5));
      c.shade(1, 33, 14, 14, -0.75);
      c.hline(1, 46, 14, m, 1);
    },
    { wrap: true },
  );
  t.neutral = NEUTRAL_HEX;
  return t;
}

/** A ceiling vent grille seen from below (fit to the vent frame's underside): louvres, dark gaps, dust; `bent` = burst open. 32 × 32. */
export function ventGrilleTile(atlas: PwAtlas, bent = false): PwTile {
  return atlas.tile(`d2ventgrille|${bent ? 1 : 0}`, 32, 32, (c, k) => {
    const m = k.ramp(0x8a8e94, { light: 0.5, sat: 0.6 });
    const dark = k.ramp(0x0c0d10, { light: 0.35 });
    c.rect(0, 0, 32, 32, m, 3);
    c.frame(0, 0, 32, 32, m, 4);
    c.frame(1, 1, 30, 30, m, 2);
    c.rect(3, 3, 26, 26, dark, 1);
    for (let i = 0; i < 6; i++) {
      const y = 4 + i * 4;
      if (bent && i > 2) {
        // Slats torn down and twisted: diagonal bars, the dark duct showing.
        c.line(4, y, 27, y + (i % 2 ? 6 : -3), m, 3);
        c.line(4, y + 1, 27, y + 1 + (i % 2 ? 6 : -3), m, 1.5);
        continue;
      }
      c.hline(3, y, 26, m, 4);
      c.hline(3, y + 1, 26, m, 2.5);
    }
    for (const [x, y] of [[1, 1], [29, 1], [1, 29], [29, 29]]) rivet(c, x, y, m, 3);
    c.scatter(k.rng, 2, 2, 28, 28, 10, 0, -0.75, { shapes: 3 });
  });
}

/** One plush dino (sitting, facing right) in the box (x, y bottom-left), `w` wide. */
function plush(c: PwCanvas, k: PwKit, rng: PwRng, x: number, base: number, w: number, hex: number, kind: number) {
  const r = k.ramp(hex, { light: 0.5, sat: 1.05 });
  const cream = k.ramp(0xf0e0b0, { light: 0.4 });
  const ink = k.ramp(0x101014, { light: 0.4 });
  const bw = Math.max(4, Math.round(w * 0.6));
  const bh = Math.max(3, Math.round(w * 0.5));
  const cx = x + bw * 0.5 + 1;
  const cy = base - bh * 0.5;
  // Tail, body, belly, head, eye — lit from the upper left, darker underside.
  c.line(Math.round(cx - bw * 0.5), Math.round(base - 1), Math.round(cx - bw * 0.9), Math.round(base - 2), r, 2);
  c.ellipse(cx, cy, bw * 0.5, bh * 0.5, r, (u, v) => (u + v < -0.6 ? 4 : v > 0.5 ? 2 : 3));
  c.ellipse(cx + 1, cy + 1, bw * 0.25, bh * 0.3, cream, 3);
  const hx = cx + bw * 0.45;
  const hy = cy - bh * 0.55;
  const hr = Math.max(1.5, w * 0.2);
  c.ellipse(hx, hy, hr * 1.15, hr, r, (u, v) => (u + v < -0.5 ? 4 : 3));
  if (kind === 1) {
    // Trike: a frill and a horn.
    c.ellipse(hx - hr * 0.8, hy - hr * 0.5, hr * 0.8, hr * 1.1, r, 2.5);
    c.set(Math.round(hx + hr), Math.round(hy - hr), cream, 4);
  } else if (kind === 2) {
    // Spiky back.
    for (let i = 0; i < 3; i++) c.set(Math.round(cx - bw * 0.2 + i * 2), Math.round(cy - bh * 0.55), r, 4);
  }
  c.set(Math.round(hx + hr * 0.3), Math.round(hy - 1), cream, 5);
  c.set(Math.round(hx + hr * 0.3) + 1, Math.round(hy - 1), ink, 1);
  c.set(Math.round(hx + hr * 1.0), Math.round(hy + hr * 0.4), ink, 1);
  void rng;
}

/** Merchandise in one shelf compartment between x0…x1, standing on row `base`, `h` rows tall. */
function stockShelf(c: PwCanvas, k: PwKit, rng: PwRng, x0: number, x1: number, base: number, h: number, seed: number) {
  let x = x0 + 1;
  let i = 0;
  while (x < x1 - 4) {
    const v = hash2(seed, i, 7);
    const hex = TOYS[Math.floor(hash2(seed, i, 9) * TOYS.length)];
    if (v < 0.12) {
      // Looted gap.
      x += rng.int(5, 9);
    } else if (v < 0.45) {
      const w = Math.min(x1 - x - 1, rng.int(7, Math.min(11, h)));
      plush(c, k, rng, x, base, w, hex, Math.floor(hash2(seed, i, 11) * 3));
      x += w + 1;
    } else if (v < 0.65) {
      // Boxed toy: card box, a window showing the toy, a logo band; some tipped over.
      const bw = rng.int(6, 8);
      const bh = Math.min(h - 2, rng.int(8, 11));
      const box = k.ramp(hex, { light: 0.45 });
      const win = k.ramp(0x9ab0c0, { light: 0.4 });
      const top = base - bh;
      c.rect(x, top, bw, bh, box, 3);
      c.vline(x, top, bh, box, 4);
      c.vline(x + bw - 1, top, bh, box, 1.5);
      c.rect(x + 1, top + 3, bw - 2, bh - 5, win, 2);
      c.set(x + 2, top + 4, win, 4);
      c.rect(x + 1, top + 1, bw - 2, 1, k.ramp(0xf0e0b0, { light: 0.4 }), 3);
      x += bw + 1;
    } else if (v < 0.78) {
      // Mugs.
      const mug = k.ramp(v < 0.72 ? 0xe8e4dc : hex, { light: 0.45 });
      for (let m = 0; m < 2 && x < x1 - 6; m++) {
        c.rect(x, base - 5, 4, 5, mug, 3);
        c.vline(x, base - 5, 5, mug, 4);
        c.vline(x + 3, base - 5, 5, mug, 2);
        c.set(x + 4, base - 4, mug, 2.5);
        c.set(x + 4, base - 2, mug, 2.5);
        c.set(x + 5, base - 3, mug, 2);
        x += 6;
      }
    } else if (v < 0.9) {
      // Folded T-shirts.
      const sw = Math.min(x1 - x - 1, 10);
      for (let s = 0; s < 3; s++) {
        const sh = k.ramp(TOYS[(i + s) % TOYS.length], { light: 0.45 });
        const y = base - 2 - s * 2;
        c.rect(x, y, sw, 2, sh, 3);
        c.hline(x, y, sw, sh, 4);
        c.set(x + (sw >> 1), y + 1, k.ramp(0xf0e0b0, { light: 0.4 }), 3);
      }
      x += sw + 1;
    } else {
      // Snow globes.
      const g = k.ramp(0xa8c8d8, { light: 0.5 });
      const b = k.ramp(0x4a3020, { light: 0.45 });
      c.rect(x, base - 2, 5, 2, b, 3);
      c.ellipse(x + 2.5, base - 4.5, 2.5, 2.5, g, (u, vv) => (u + vv < -0.6 ? 5 : 3));
      c.set(x + 2, base - 4, k.ramp(hex, { light: 0.4 }), 2);
      x += 6;
    }
    i++;
  }
}

/**
 * A merchandise wall (world-projected along the shelf run, v from the floor):
 * plinth, four lit-edged shelves with price tags, dark backs, uprights every
 * metre, crammed with plush dinos, boxed toys, mugs, shirts and globes — looted
 * gaps, a toppled plush; a painted header board. 256 × 80 (8 × 2.5 m).
 */
export function merchShelfTile(atlas: PwAtlas, variant: number): PwTile {
  return atlas.tile(
    `d2merch|${variant}`,
    256,
    80,
    (c, k) => {
      const rng = k.rng;
      const wood = k.ramp(0x8a6038, { light: 0.45, sat: 0.95 });
      const back = k.ramp(0x3a2a1c, { light: 0.4 });
      const tag = k.ramp(0xf0f0e8, { light: 0.3 });
      const head = k.ramp(0x2a5a3a, { light: 0.45 });
      const cream = k.ramp(0xf0e0b0, { light: 0.4 });
      // Back panel (pegboard-dark with a dot grid).
      for (let y = 0; y < 80; y++) for (let x = 0; x < 256; x++) c.set(x, y, back, x % 4 === 2 && y % 4 === 2 ? 1 : 2);
      // Shelves (canvas rows; the floor is row 79): boards at 0.35 / 0.9 / 1.45 / 2.0 m, top at 2.4 m.
      const boards = [68, 50, 33, 15];
      const tops = [50, 33, 15, 3];
      for (let s = 0; s < 4; s++) {
        stockShelf(c, k, rng, 0, 256, boards[s], boards[s] - tops[s] - 2, variant * 17 + s * 5);
        for (let x = 0; x < 256; x++) {
          c.set(x, boards[s], wood, 4);
          c.set(x, boards[s] + 1, wood, 2.75);
          c.set(x, boards[s] + 2, wood, 1.5);
        }
        for (let x = 6 + s * 3; x < 256; x += 11) c.set(x, boards[s] + 1, tag, 3);
      }
      // Uprights every metre.
      for (let x = 0; x < 256; x += 32) {
        c.rect(x, 0, 3, 80, wood, 3);
        c.vline(x, 0, 80, wood, 4);
        c.vline(x + 2, 0, 80, wood, 1.75);
      }
      // Plinth and header board with painted lettering.
      c.rect(0, 71, 256, 9, wood, 2.5);
      c.hline(0, 71, 256, wood, 4);
      c.hline(0, 79, 256, wood, 1);
      c.rect(0, 0, 256, 4, head, 3);
      c.hline(0, 0, 256, head, 4);
      c.hline(0, 3, 256, head, 1.5);
      const words = variant % 2 ? ['PLUSH FRIENDS', 'TOYS', 'GIFTS'] : ['SOUVENIRS', 'BOOKS', 'APPAREL'];
      let wx = 10;
      for (const w of words) {
        drawText(c, w, wx, 0, FONT_3x5, cream, 3.5);
        wx += textWidth(w, FONT_3x5) + 40;
      }
      // A toppled plush on its side, a box fallen off the edge.
      plush(c, k, rng, 120 + variant * 40, 66, 9, TOYS[variant % 6], 0);
      c.scatter(rng, 0, 4, 256, 66, 30, 0, -0.5, { shapes: 3 });
    },
    { wrap: true },
  );
}

/** The till counter front (4.4 × 1 m, fit): timber panels, a GIFTS & SOUVENIRS decal, stickers, scuffs, a bloody hand. 141 × 32. */
export function counterFrontTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2counter', 141, 32, (c, k) => {
    const rng = k.rng;
    const wood = k.ramp(0x8a6038, { light: 0.45, sat: 0.95 });
    const green = k.ramp(0x2a5a3a, { light: 0.45 });
    const cream = k.ramp(0xf0e0b0, { light: 0.4 });
    c.rect(0, 0, 141, 32, wood, 3);
    for (let x = 0; x < 141; x += 7) {
      c.vline(x, 2, 26, wood, 1.75);
      c.vline(x + 1, 2, 26, wood, 3.75);
    }
    c.hline(0, 0, 141, wood, 1.5);
    c.hline(0, 1, 141, wood, 4);
    c.rect(0, 28, 141, 4, k.ramp(0x2a2420, { light: 0.4 }), 2.5);
    plate(c, 30, 9, 81, 12, green, { tone: 3 });
    const t = 'GIFTS & SOUVENIRS';
    const tw = textWidth(t, FONT_3x5);
    drawText(c, t, 30 + Math.round((81 - tw) / 2), 13, FONT_3x5, cream, 4);
    silhouette(c, RAPTOR, 8, 10, 16, 8, green, { tone: 3 });
    silhouette(c, TRIKE, 117, 11, 16, 7, green, { tone: 3, flip: true });
    bloodSplat(c, rng, k, 120, 5, 2, { drips: 3, wrap: false });
    scuffs(c, rng, 0, 22, 141, 6, 20, -1);
  });
}

/** A plush toy card (cut out, two-sided): one sitting plush dino. 16 × 16 (0.5 m). */
export function plushCardTile(atlas: PwAtlas, hex: number, kind: number): PwTile {
  return atlas.tile(`d2plushcard|${h6(hex)}|${kind}`, 16, 16, (c, k) => {
    plush(c, k, k.rng, 2, 15, 12, hex, kind);
    c.outline(1);
  });
}

/**
 * The shop mascot: a big goofy plush T. rex (cut out, two-sided card): fat green
 * body, cream belly, huge eyes, a grin with felt teeth, stubby arms, a price tag.
 * 64 × 84 (2 × 2.6 m).
 */
export function mascotTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2mascot', 64, 84, (c, k) => {
    const g = k.ramp(0x4aa03a, { light: 0.5, sat: 1.05 });
    const belly = k.ramp(0xe8d890, { light: 0.45 });
    const eye = k.ramp(0xf8f8f8, { light: 0.3 });
    const ink = k.ramp(0x101014, { light: 0.4 });
    const red = k.ramp(0xc0302a, { light: 0.45 });
    const sh = (u: number, v: number) => (u + v < -0.7 ? 4 : v > 0.55 || u > 0.7 ? 2 : 3);
    // Tail (behind), legs, body, belly, arms, head.
    c.ellipse(14, 66, 12, 7, g, sh);
    c.ellipse(22, 74, 8, 9, g, sh);
    c.ellipse(42, 74, 8, 9, g, sh);
    c.ellipse(32, 54, 20, 22, g, sh);
    c.ellipse(34, 58, 12, 15, belly, (u, v) => (u + v < -0.6 ? 4 : v > 0.6 ? 2 : 3));
    for (let i = 0; i < 5; i++) c.hline(26, 48 + i * 5, 16, belly, 2.5);
    c.ellipse(16, 46, 4, 3, g, 3);
    c.ellipse(49, 46, 4, 3, g, 3);
    c.ellipse(34, 22, 20, 15, g, sh);
    c.ellipse(36, 28, 17, 6, belly, 3);
    // Grin with felt teeth.
    c.hline(22, 29, 28, ink, 1);
    for (let x = 23; x < 49; x += 3) c.set(x, 30, eye, 4);
    // Eyes: big, glossy.
    for (const ex of [26, 42]) {
      c.ellipse(ex, 16, 5, 5, eye, 4);
      c.ellipse(ex + 1, 17, 2.5, 3, ink, 1);
      c.set(ex - 1, 14, eye, 5);
    }
    // Nostrils, a stitched seam, the price tag on a string.
    c.set(46, 21, ink, 1);
    c.set(49, 21, ink, 1);
    for (let y = 36; y < 72; y += 3) c.set(20, y, g, 1.5);
    c.line(52, 40, 58, 46, ink, 2);
    plate(c, 54, 46, 8, 6, k.ramp(0xf0f0e8, { light: 0.3 }), { tone: 3 });
    drawText(c, '$', 56, 46, FONT_3x5, red, 3);
    c.outline(0);
  });
}

/** A postcard (fit on a spinner-rack card): a picture (volcano / raptor / beach / logo) with a white border. 8 × 12. */
export function postcardTile(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`d2postcard|${v % 4}`, 8, 12, (c, k) => {
    const w = k.ramp(0xf0ece0, { light: 0.3 });
    const sky = k.ramp([0x2a6ab0, 0xe07a30, 0x40a0c0, 0x2a5a3a][v % 4], { light: 0.5 });
    const ink = k.ramp(0x1a1a1e, { light: 0.4 });
    c.rect(0, 0, 8, 12, w, 3);
    c.rect(1, 1, 6, 8, sky, 3);
    c.rect(1, 6, 6, 3, sky, 1.5);
    if (v % 4 === 0) c.poly([2, 6, 4, 2, 6, 6], ink, 2);
    else if (v % 4 === 1) silhouette(c, RAPTOR, 1, 4, 6, 3, ink, { shade: false, tone: 2 });
    else c.set(4, 3, w, 5);
    c.hline(1, 10, 6, ink, 3);
  });
}

/** A wooden shipping crate (fit on each face): board frame, diagonal brace, stencilled PRIMAL ISLAND / FRAGILE, nail heads. 32 × 32. */
export function crateTile(atlas: PwAtlas, hex = 0x7a5a36): PwTile {
  return atlas.tile(`d2crate|${h6(hex)}`, 32, 32, (c, k) => {
    const w = k.ramp(hex, { light: 0.45, sat: 0.95 });
    const ink = k.ramp(0x2a1c10, { light: 0.4 });
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, w, y % 8 === 0 ? 1.75 : y % 8 === 1 ? 3.5 : 3);
    // Frame boards and the brace.
    for (const [x, y, ww, hh] of [[0, 0, 32, 4], [0, 28, 32, 4], [0, 0, 4, 32], [28, 0, 4, 32]] as const) {
      c.rect(x, y, ww, hh, w, 3.25);
      c.bevel(x, y, ww, hh, true, 1, 1);
    }
    for (let i = 3; i < 29; i++) {
      c.set(i, 31 - i, w, 3.5);
      c.set(i + 1, 31 - i, w, 3.25);
      c.set(i + 2, 31 - i, w, 2);
    }
    drawText(c, 'FRAGILE', 5, 6, FONT_3x5, ink, 2);
    c.ellipse(16, 20, 3, 3, ink, 2);
    c.ellipse(16, 20, 1.5, 1.5, w, 3);
    for (const [x, y] of [[1, 1], [30, 1], [1, 30], [30, 30], [15, 1], [15, 30]]) c.set(x, y, ink, 1);
    for (let i = 0; i < 6; i++) if (bayer(i, 3) < 0.5) shiftW(c, k.rng.int(4, 27), k.rng.int(4, 27), -0.75);
    void FONT_5x7;
    void REX;
    void PWF;
  });
}

/** A folded T-shirt seen from above (fit on a stack's top; NEUTRAL): body, sleeves folded in, a collar notch, a chest print. 16 × 14. */
export function shirtTopTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile('d2shirttop', 16, 14, (c, k) => {
    const m = k.ramp(NEUTRAL_HEX, { light: 0.45, sat: 0.8 });
    const ink = k.ramp(0x2a2a30, { light: 0.4 });
    c.rect(0, 0, 16, 14, m, 3);
    c.vline(3, 0, 14, m, 2);
    c.vline(12, 0, 14, m, 2);
    c.hline(0, 0, 16, m, 4);
    c.ellipse(8, 0.5, 3, 2, m, 1.5);
    silhouette(c, RAPTOR, 4, 5, 8, 5, ink, { shade: false, tone: 2 });
    c.hline(0, 13, 16, m, 1.5);
  });
  t.neutral = NEUTRAL_HEX;
  return t;
}

/** The folded edges of a T-shirt stack (fit on a stack's sides; NEUTRAL): fold layers with lit lips. 16 × 4. */
export function shirtEdgeTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile('d2shirtedge', 16, 4, (c, k) => {
    const m = k.ramp(NEUTRAL_HEX, { light: 0.45, sat: 0.8 });
    c.rect(0, 0, 16, 4, m, 3);
    c.hline(0, 0, 16, m, 4);
    c.hline(0, 3, 16, m, 1.5);
    c.set(4, 1, m, 2);
    c.set(11, 2, m, 2);
  });
  t.neutral = NEUTRAL_HEX;
  return t;
}
