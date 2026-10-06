import type { PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { boldFont, drawText, FONT_3x5, FONT_5x7, FONT_BOLD, rasterText, textWidth, type PixelFont } from './font';
import { hash2 } from './surfaces';
import { dith, fill, G, h6, rivet, rustRun, sootBloom, wscatter, wset, wshift } from './z3kit';
import { z3Ink, z3SnapGlyph } from './z3levels';

/**
 * HIGHWAY TO HELL (z3) structures for ART: PIXEL WORLD: highway signs in the
 * pixel font (reflective white on green, bolts, dirt runs, bullet holes),
 * cut-out lattice trusses (gantries, bridge stiffening, tower bracing — a box
 * skinned with it reads as an open truss), the overpass (fascia panels with
 * drip stains and soot, the dark soffit, piers with tags and posters, the
 * riprap embankments), the sound wall and its spray-painted warnings, the
 * tunnel (tiled walls yellowed and sooted, the ceiling, the board-formed
 * portal and its cast letters), the bridge's riveted red steel and cables,
 * sandbag walls.
 */

// ─── Signs ───────────────────────────────────────────────────────────────────

const ARROW = ['..#..', '.###.', '#####', '..#..', '..#..', '..#..', '..#..', '.....', '.....'];

/** The sign font: the bold caps plus `^`, the up arrow the classic signs use. */
const SIGN_FONT: PixelFont = (() => {
  const g = new Map(FONT_BOLD.glyphs);
  g.set('^', boldFont({ w: 5, h: 9, base: 7, glyphs: new Map([['^', ARROW]]), gap: 1, space: 3 }).glyphs.get('^')!);
  return { ...FONT_BOLD, glyphs: g };
})();

/** The regular-weight sign font (a long legend at four texels a font pixel beats bold at three). */
const SIGN_FONT_R: PixelFont = (() => {
  const g = new Map(FONT_5x7.glyphs);
  g.set('^', ARROW);
  return { ...FONT_5x7, glyphs: g };
})();

/** A highway sign face (`wM` × `hM` m): reflective letters in rows, white border, bolts, dirt, bullet holes. */
export function z3HighwaySign(atlas: PwAtlas, lines: string[], wM: number, hM: number, hex: number): PwTile {
  const W = Math.round(wM * 32);
  const H = Math.round(hM * 32);
  const key = `z3sign|${lines.join('/')}|${W}|${H}|${h6(hex)}`;
  return atlas.tile(key, W, H, (c, k) => {
    const rng = k.rng;
    const g = k.ramp(hex, { light: 0.45, sat: 1 });
    const white = k.ramp(0xf0f0e8, { light: 0.4, sat: 0.4 });
    const rim = k.ramp(0xecece2, { light: 0.4, sat: 0.4 });
    const dirt = k.ramp(0x4a4a3a, { light: 0.4 });
    const steel = k.ramp(0x8a8c92, { light: 0.5 });
    fill(c, g, 3);
    // Rounded white border inset 3 texels (its own ramp: only the letters are ink).
    for (let x = 4; x < W - 4; x++) {
      c.set(x, 3, rim, 3.6);
      c.set(x, H - 4, rim, 3.2);
    }
    for (let y = 4; y < H - 4; y++) {
      c.set(3, y, rim, 3.6);
      c.set(W - 4, y, rim, 3.2);
    }
    for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) c.set(x, y, 0, 0);
    // Letters: the biggest whole scale of the bold font that fits rows and width — unless that is
    // an odd three, when the regular weight at four fits: a font pixel then fills a whole level-2
    // texel (the legend stays a clean 1× font from far away instead of a misaligned blur).
    const fit = (f: PixelFont) => {
      const longest = Math.max(...lines.map((l) => textWidth(l, f)));
      const rowH = f.base + 3;
      let sc = 1;
      while ((sc + 1) * longest <= W - 18 && (sc + 1) * rowH * lines.length <= H - 12) sc++;
      return sc;
    };
    const sB = fit(SIGN_FONT);
    const font = sB === 3 && fit(SIGN_FONT_R) >= 4 ? SIGN_FONT_R : SIGN_FONT;
    const scale = font === SIGN_FONT ? sB : 4;
    const rowH = font.base + 3;
    const total = lines.length * rowH * scale - 3 * scale;
    let y = Math.round((H - total) / 2) - 2 * scale;
    for (const line of lines) {
      const tw = textWidth(line, font, { scale });
      // (Glyphs on the level grid: far away, a level texel is one font pixel.)
      const [gx, gy] = z3SnapGlyph(Math.round((W - tw) / 2), y, scale, H);
      drawText(c, line, gx, gy, font, white, 3.6, { scale, shadeFn: (_u, v) => (v < 0.3 ? 0.6 : 0) });
      y += rowH * scale;
    }
    // Bolts along the top / bottom, dirt running down from the top edge, a scrape.
    for (let x = 12; x < W - 8; x += 40) {
      rivet(c, x, 6, steel, 3);
      rivet(c, x, H - 7, steel, 3);
    }
    for (let i = 0; i < Math.round(W / 6); i++) {
      const x = rng.int(1, W - 2);
      const len = rng.int(3, Math.round(H * 0.5));
      for (let j = 0; j < len; j++) if (dith(x, j, 1 - j / len)) {
        // (Over the letters the dirt only dulls them a step: they stay letters.)
        if (c.at(x, 1 + j) === white) c.shift(x, 1 + j, -0.6);
        else c.tint(x, 1 + j, dirt, -0.5);
      }
    }
    // Bullet holes: punched dark centres with lit bent-metal rims.
    for (let i = 0; i < Math.max(2, Math.round(W / 50)); i++) {
      const x = rng.int(8, W - 8);
      const yy = rng.int(8, H - 8);
      c.set(x, yy, g, 0);
      c.set(x + 1, yy, g, 0.5);
      c.set(x - 1, yy - 1, steel, 4.6);
      c.set(x + 1, yy + 1, steel, 2);
    }
    // The letters hold their bars down the levels.
    z3Ink(key, c, [white]);
  });
}

/** The back of a sign (wrap 64 × 32): galvanised sheet with Z-bar stiffeners and bolts. */
export function z3SignBack(atlas: PwAtlas): PwTile {
  return atlas.tile('z3signback', 64, 32, (c, k) => {
    const s = k.ramp(0x8a8e94, { light: 0.5, sat: 0.4 });
    fill(c, s, 3);
    for (const y of [6, 22]) {
      c.hline(0, y, 64, s, 4.4);
      c.hline(0, y + 1, 64, s, 3.6);
      c.hline(0, y + 3, 64, s, 1.8);
      for (let x = 4; x < 64; x += 16) rivet(c, x, y + 2, s, 3);
    }
    wscatter(c, k.rng, 0, 0, 64, 32, 20, 0, -0.8, { shapes: 3 });
  }, { wrap: true });
}

// ─── Trusses ─────────────────────────────────────────────────────────────────

/**
 * Cut-out lattice (wrap 64 × 32 = 2 × 1 m): top / bottom chords, a Warren web of diagonals and
 * verticals with gusset plates and rivets — a box skinned with it reads as an open truss.
 */
export function z3TrussTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z3truss|${h6(hex)}`, 64, 32, (c, k) => {
    const s = k.ramp(hex, { light: 0.5, sat: 0.9 });
    const rust = k.ramp(0x6a2a14, { light: 0.4 });
    // Chords.
    for (const y0 of [0, 28]) {
      c.rect(0, y0, 64, 4, s, 3);
      c.hline(0, y0, 64, s, 4.4);
      c.hline(0, y0 + 3, 64, s, 1.8);
    }
    // Web: diagonals both ways (3 texels thick), a vertical at each panel point.
    const diag = (x0: number, dir: number) => {
      for (let y = 4; y < 28; y++) {
        const x = x0 + Math.round(((y - 4) / 24) * 32 * dir);
        for (let j = 0; j < 3; j++) c.set(((x + j) % 64 + 64) % 64, y, s, j === 0 ? 4 : j === 2 ? 1.8 : 3);
      }
    };
    diag(0, 1);
    diag(32, 1);
    diag(32, -1);
    diag(64, -1);
    for (const x of [0, 32]) {
      c.rect(x, 4, 2, 24, s, 3);
      c.vline(x, 4, 24, s, 4);
      // Gusset plates + rivets where members meet.
      for (const y of [4, 24]) {
        c.rect(((x - 3) + 64) % 64, y, 8, 4, s, 3.4);
        rivet(c, (x + 1) % 64, y + 1, s, 3);
        rivet(c, ((x - 2) + 64) % 64, y + 2, s, 3);
      }
    }
    // Rust bleeding at the joints.
    for (const x of [2, 34]) for (let y = 4; y < 10; y++) if (hash2(x, y, 3) > 0.4) c.tint(x, y, rust, -0.3);
  }, { wrap: true });
}

// ─── Concrete ────────────────────────────────────────────────────────────────

/** Overpass fascia (wrap 128 × 32 = 4 × 1 m): precast panel joints, drip stains, soot, chipped arris. */
export function z3FasciaTile(atlas: PwAtlas, hex = 0x9a948c): PwTile {
  return atlas.tile(`z3fascia|${h6(hex)}`, 128, 32, (c, k) => {
    const rng = k.rng;
    const C = k.ramp(hex, { light: 0.45, sat: 0.8 });
    const drip = k.ramp(0x5a564e, { light: 0.4 });
    fill(c, C, 3);
    c.hline(0, 0, 128, C, 4.4);
    c.hline(0, 1, 128, C, 3.8);
    c.hline(0, 4, 128, C, 2.2);
    c.hline(0, 31, 128, C, 1.6);
    c.vline(0, 0, 32, C, 1.4);
    c.vline(1, 0, 32, C, 3.8);
    // Drip stains from the deck edge (dark runs breaking up), efflorescence specks.
    for (let i = 0; i < 18; i++) {
      const x = rng.int(2, 125);
      const len = rng.int(8, 28);
      for (let j = 0; j < len; j++) if (dith(x, j, 1 - j / len)) {
        c.tint(x, 5 + j, drip, -0.2);
        if (j < len * 0.5) c.tint(x + 1, 5 + j, drip, 0);
      }
    }
    wscatter(c, rng, 0, 0, 128, 32, 50, 0, -0.8, { shapes: 3 });
    wscatter(c, rng, 0, 0, 128, 32, 20, 0, 0.8, { shapes: 2 });
  }, { wrap: true });
}

/** Dark soffit / girder underside (wrap 64 × 64): formwork lines, damp patches, pigeon streaks. */
export function z3SoffitTile(atlas: PwAtlas, hex = 0x6e6a66): PwTile {
  return atlas.tile(`z3soffit|${h6(hex)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const C = k.ramp(hex, { light: 0.4, sat: 0.8 });
    const white = k.ramp(0xc8c4b8, { light: 0.4 });
    fill(c, C, 2.6);
    for (let x = 0; x < 64; x += 16) c.vline(x, 0, 64, C, 1.8);
    for (let i = 0; i < 4; i++) {
      const cx = rng.int(0, 63);
      const cy = rng.int(0, 63);
      for (let y = -8; y <= 8; y++) for (let x = -10; x <= 10; x++) if ((x * x) / 100 + (y * y) / 64 < 1 && dith(cx + x, cy + y, 0.7)) wshift(c, cx + x, cy + y, -0.8);
    }
    for (let i = 0; i < 20; i++) wset(c, rng.int(0, 63), rng.int(0, 63), white, 3);
  }, { wrap: true });
}

/** Spray tags as scribbles (no words): a few loops and drips in 2 colours. */
function scribble(c: PwCanvas, k: PwKit, x0: number, y0: number, w: number, h: number) {
  const rng = k.rng;
  const cols = [0xd83a2a, 0x3a8ad8, 0xe8d040, 0xe8e8e8, 0x48c058, 0xc848c8];
  const col = k.ramp(cols[rng.int(0, cols.length - 1)], { light: 0.4 });
  const out = k.ramp(0x1a1a1e, { light: 0.4 });
  let x = x0;
  let y = y0 + h / 2;
  let a = 0;
  for (let j = 0; j < w * 1.6; j++) {
    c.set(Math.round(x), Math.round(y) + 1, out, 1);
    c.set(Math.round(x), Math.round(y), col, 3.4);
    a += rng.spread(0.9);
    x += Math.max(0.2, Math.cos(a)) * 0.7;
    y += Math.sin(a) * 1.4;
    if (y < y0) y = y0;
    if (y > y0 + h) y = y0 + h;
    if (rng.chance(0.05)) for (let d = 1; d < rng.int(3, 7); d++) c.set(Math.round(x), Math.round(y) + d, col, 2.6);
  }
}

/** Pier / parapet concrete (wrap 64 × 128): board-form lines, tie holes, tags and a torn poster near the foot. */
export function z3PierTile(atlas: PwAtlas, hex = 0x7a766e): PwTile {
  return atlas.tile(`z3pier|${h6(hex)}`, 64, 128, (c, k) => {
    const rng = k.rng;
    const C = k.ramp(hex, { light: 0.45, sat: 0.8 });
    const paper = k.ramp(0xd8d0b8, { light: 0.35 });
    fill(c, C, 3);
    for (let y = 0; y < 128; y += 6) c.hline(0, y, 64, C, hash2(0, y, 3) > 0.5 ? 2.6 : 3.4);
    for (let y = 12; y < 128; y += 24) for (const x of [12, 44]) {
      c.set(x, y, C, 1);
      c.set(x + 1, y + 1, C, 4);
    }
    for (let i = 0; i < 3; i++) scribble(c, k, rng.int(2, 30), rng.int(88, 112), rng.int(16, 30), 10);
    // A torn poster.
    const px = rng.int(4, 40);
    for (let y = 70; y < 86; y++) for (let x = px; x < px + 14; x++) if (!(y > 82 && hash2(x, y, 4) > 0.5)) c.set(x, y, paper, (y - 70) % 4 === 1 && x > px + 1 && x < px + 12 ? 2 : 3.4);
    for (let x = 0; x < 64; x++) {
      const reach = 8 + Math.round(hash2(x >> 2, 0, 5) * 8);
      for (let y = 128 - reach; y < 128; y++) if (dith(x, y, (y - (128 - reach)) / reach)) c.shift(x, y, -0.8);
    }
    wscatter(c, rng, 0, 0, 64, 128, 60, 0, -0.8, { shapes: 3 });
  }, { wrap: true });
}

/** Riprap embankment (wrap 64 × 64): pitched stones with mortar shadows, dry grass in the gaps. */
export function z3RiprapTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3riprap', 64, 64, (c, k) => {
    const rng = k.rng;
    const st = k.ramp(0x7a6e66, { light: 0.45 });
    const gap = k.ramp(0x3a3028, { light: 0.4 });
    const gr = k.ramp(0x7a6a40, { light: 0.45 });
    fill(c, gap, 2);
    for (let y = 0; y < 64; y += 8) {
      const off = (y >> 3) & 1 ? 5 : 0;
      for (let x = -10; x < 64; x += 10) {
        const w = 8 + rng.int(-1, 1);
        for (let yy = 1; yy < 7; yy++) for (let xx = 1; xx < w; xx++) {
          if ((yy === 1 || yy === 6) && (xx === 1 || xx === w - 1)) continue;
          wset(c, x + off + xx, y + yy, st, yy === 1 || xx === 1 ? 4 : yy === 6 || xx === w - 1 ? 2.2 : 3);
        }
      }
    }
    for (let i = 0; i < 30; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      if (c.at(x, y) !== gap) continue;
      for (let t = 0; t < 3; t++) wset(c, x + rng.int(-1, 1), y - t, gr, t === 2 ? 4 : 3);
    }
  }, { wrap: true });
}

// ─── Sound wall ──────────────────────────────────────────────────────────────

/** Sound-wall panel face (module 128 × 148 = 4 × 4.6 m): fluted precast, the post's shadow, stains, a cap. */
export function z3SoundWallTile(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z3soundwall|${v}`, 128, 148, (c, k) => {
    const rng = k.rng;
    const C = k.ramp(0x948c80, { light: 0.45, sat: 0.8 });
    const drip = k.ramp(0x5a564e, { light: 0.4 });
    fill(c, C, 3);
    // Flutes: vertical ribs 8 texels apart (lit left edge, shaded right).
    for (let x = 0; x < 128; x += 8) {
      c.vline(x, 8, 140, C, 3.8);
      c.vline(x + 5, 8, 140, C, 2.4);
      c.vline(x + 6, 8, 140, C, 2.2);
    }
    // Cap band and a plain foot band.
    c.rect(0, 0, 128, 8, C, 3.2);
    c.hline(0, 0, 128, C, 4.4);
    c.hline(0, 7, 128, C, 1.8);
    c.rect(0, 132, 128, 16, C, 2.8);
    c.hline(0, 132, 128, C, 1.8);
    // Panel joints at both ends.
    c.vline(0, 0, 148, C, 1.2);
    c.vline(127, 0, 148, C, 1.2);
    // Stains running down from the cap, dirt splashed up the foot.
    for (let i = 0; i < 14; i++) {
      const x = rng.int(1, 126);
      const len = rng.int(10, 60);
      for (let j = 0; j < len; j++) if (dith(x, j, 1 - j / len)) c.tint(x, 8 + j, drip, -0.3);
    }
    for (let x = 0; x < 128; x++) {
      const reach = 10 + Math.round(hash2(x >> 3, v, 5) * 10);
      for (let y = 148 - reach; y < 148; y++) if (dith(x, y, (y - (148 - reach)) / reach)) c.shift(x, y, -0.9);
    }
    if (v === 1) for (let i = 0; i < 2; i++) scribble(c, k, rng.int(10, 80), rng.int(100, 120), rng.int(20, 40), 10);
    wscatter(c, rng, 0, 0, 128, 148, 80, 0, -0.8, { shapes: 3 });
  });
}

/** A spray-painted warning (cut out): bold letters with a dark outline, drips — `text` in `hex`. */
export function z3GraffitiWords(atlas: PwAtlas, text: string, hex: number): { tile: PwTile; wM: number; hM: number } {
  const scale = 2;
  const tw = textWidth(text, FONT_BOLD, { scale, spacing: 1 });
  const W = tw + 12;
  const H = FONT_BOLD.h * scale + 12;
  const gkey = `z3graffiti|${text}|${h6(hex)}`;
  const tile = atlas.tile(gkey, W, H, (c, k) => {
    const rng = k.rng;
    const col = k.ramp(hex, { light: 0.4, sat: 1.1 });
    const out = k.ramp(0x1a1a1e, { light: 0.4 });
    const tmp = new Uint8Array(W * H);
    // Letters (slightly bouncing baseline) → mask; outline round it; drips below.
    let x = 6;
    let i = 0;
    for (const ch of text) {
      const dy = Math.round(Math.sin(i * 1.7) * 1.5);
      const m = rasterText(ch, FONT_BOLD, { scale });
      for (let yy = 0; yy < m.h; yy++) for (let xx = 0; xx < m.w; xx++) {
        const X = x + xx;
        const Y = 3 + dy + yy;
        if (m.data[yy * m.w + xx] && X >= 0 && Y >= 0 && X < W && Y < H) tmp[Y * W + X] = 1;
      }
      x += textWidth(ch, FONT_BOLD, { scale }) + (ch === ' ' ? 0 : scale * 2);
      i++;
    }
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      if (tmp[yy * W + xx]) continue;
      if (tmp[yy * W + xx - 1] || tmp[yy * W + xx + 1] || (yy > 0 && tmp[(yy - 1) * W + xx]) || (yy < H - 1 && tmp[(yy + 1) * W + xx])) c.set(xx, yy, out, 1);
    }
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (tmp[yy * W + xx]) c.set(xx, yy, col, yy % 5 === 0 ? 4 : 3);
    for (let d = 0; d < Math.round(W / 10); d++) {
      const dx = rng.int(6, W - 6);
      let base = -1;
      for (let yy = H - 1; yy >= 0; yy--) if (tmp[yy * W + dx]) {
        base = yy;
        break;
      }
      if (base < 0) continue;
      for (let j = 1; j < rng.int(3, 8); j++) c.set(dx, base + j, col, 2.6);
    }
    z3Ink(gkey, c, [col]);
  });
  // Sized like the classic tag (0.12 m a font pixel): 0.06 m a texel at scale 2.
  return { tile, wM: (W * 0.12) / scale, hM: (H * 0.12) / scale };
}

// ─── Tunnel ──────────────────────────────────────────────────────────────────

/**
 * Tunnel wall (module 192 × 240 = 6 × 7.5 m): enamelled steel panels (1 × 0.5 m) gone yellow under
 * the sodium light, soot thickening toward the ceiling, exhaust streaks, the grimy kick band with its
 * hazard stripe, a cable tray; `v` 1 adds the SOS niche marker.
 */
export function z3TunnelWall(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z3tunwall|${v}`, 192, 240, (c, k) => {
    const rng = k.rng;
    const W = c.w;
    const H = c.h;
    const pan = k.ramp(0xb0aa94, { light: 0.4, sat: 0.7 });
    const grime = k.ramp(0x3e3a38, { light: 0.4 });
    const steel = k.ramp(0x5a5e66, { light: 0.5 });
    const green = k.ramp(0x2ad070, { light: 0.4 });
    const yel = k.ramp(0xe0a020, { light: 0.45 });
    const blk = k.ramp(0x1a1a1e, { light: 0.4 });
    fill(c, pan, 3);
    const T = c.tone;
    // Panels 32 × 16 (staggered by half a panel per row): a lit top edge, a dark seam under / right.
    for (let y = 0; y < H; y++) {
      const row = y >> 4;
      const off = 0;
      const yy = y & 15;
      for (let x = 0; x < W; x++) {
        const xx = (x + off) & 31;
        const i = y * W + x;
        if (yy === 15 || xx === 31) T[i] = 2;
        else if (yy === 0) T[i] = 3.6;
        else if (hash2((x + off) >> 5, row, 3 + v) > 0.94) T[i] = 2.8;
      }
    }
    // Soot thickening toward the ceiling (dithered) and exhaust streaks running down.
    for (let y = 0; y < 96; y++) {
      const t = 1 - y / 96;
      for (let x = 0; x < W; x++) if (dith(x, y, t * 0.85)) c.shift(x, y, -1);
    }
    for (let i = 0; i < 14; i++) {
      const x = rng.int(0, W - 1);
      const len = rng.int(20, 110);
      for (let j = 0; j < len; j++) if (dith(x, j, 1 - j / len)) {
        c.tint(x, j, grime, 0.6);
        if (j < len * 0.6) c.tint(x + 1, j, grime, 0.8);
      }
    }
    // A dented panel.
    {
      const x0 = rng.int(1, 4) * 32 + 4;
      const y0 = rng.int(6, 11) * 16 + 3;
      for (let y = 0; y < 9; y++) for (let x = 0; x < 20; x++) if ((x - 10) ** 2 / 100 + (y - 4) ** 2 / 20 < 1) c.shift(x0 + x, y0 + y, x < 10 ? -0.8 : 0.6);
    }
    // The kick band: 1.2 m of grimy concrete with the hazard stripe on its top.
    c.rect(0, H - 38, W, 38, grime, 2.6);
    wscatter(c, rng, 0, H - 38, W, 38, 120, 0, -0.8, { shapes: 3 });
    for (let y = H - 46; y < H - 40; y++) for (let x = 0; x < W; x++) c.set(x, y, ((x + y) >> 3) & 1 ? yel : blk, y === H - 46 ? 4 : 3);
    // Cable tray along the top, with its brackets.
    c.rect(0, 18, W, 5, steel, 2.6);
    c.hline(0, 18, W, steel, 4);
    for (let x = 10; x < W; x += 32) c.rect(x, 23, 2, 4, steel, 2);
    void green;
  });
}

/** The tunnel's SOS marker plate (module 26 × 13): white plate, SOS, a green arrow. */
export function z3SosMarker(atlas: PwAtlas): PwTile {
  return atlas.tile('z3sosmark', 26, 13, (c, k) => {
    const w = k.ramp(0xe8e8e8, { light: 0.4 });
    const green = k.ramp(0x2ad070, { light: 0.4 });
    c.rect(0, 0, 26, 13, w, 4);
    c.frame(0, 0, 26, 13, w, 2.6);
    drawText(c, 'SOS', 3, 3, FONT_3x5, k.ramp(0x1a1a1a, { light: 0.4 }), 1);
    for (let j = 0; j < 8; j++) c.hline(16 + j, 3 + (j < 4 ? j : 7 - j), 1, green, 4, G);
  });
}

/** Desert sandstone (wrap 128 × 128, world-projected): strata bands, joints, lit ledges with scrub, varnish streaks. */
export function z3StrataTile(atlas: PwAtlas): PwTile {
  // 128 × 128 at 12 texels a metre (≈ 10.7 m a repeat): cliff-sized beds that still read from the
  // bridge — three rock hues, thick beds with lit ledges and shadowed undercuts, joints, desert
  // varnish, scrub on the ledges, a dark gully.
  return atlas.tile('z3strata', 128, 128, (c, k) => {
    const rng = k.rng;
    const hues = [k.ramp(0x8a6450, { light: 0.45, sat: 0.9 }), k.ramp(0x6a4e50, { light: 0.45, sat: 0.9 }), k.ramp(0x9a7a5a, { light: 0.45, sat: 0.85 })];
    const varnish = k.ramp(0x3a2a2e, { light: 0.4 });
    const scrub = k.ramp(0x5a5a30, { light: 0.45 });
    // Beds of 7–22 rows, each with a two-row lit ledge on top and a dark undercut under its lip.
    let y = 0;
    let n = 0;
    const bands: number[] = [];
    while (y < 128) {
      const h = Math.min(128 - y, 7 + Math.floor(hash2(n, 0, 3) * 16));
      bands.push(y);
      const r = hues[Math.floor(hash2(n, 1, 3) * 3)];
      for (let yy = 0; yy < h; yy++) {
        for (let x = 0; x < 128; x++) {
          // The lip wanders a texel up and down; rough grain in the face.
          const lip = hash2(x >> 3, n, 7) > 0.7 ? 1 : 0;
          const t = yy < lip ? 1.6 : yy === lip ? 4.2 : yy === lip + 1 ? 3.6 : yy >= h - 2 ? (yy === h - 1 ? 1.4 : 2.0) : 3 - (yy / h) * 0.7 + (hash2(x >> 1, (y + yy) >> 1, 8) - 0.5) * 0.5;
          c.set(x, y + yy, r, t);
        }
      }
      y += h;
      n++;
    }
    for (let i = 0; i < bands.length; i++) {
      const y0 = bands[i];
      const y1 = i + 1 < bands.length ? bands[i + 1] : 128;
      // Vertical joints (offset per bed), two texels: shadow + lit edge.
      for (let j = 0; j < 4; j++) {
        const x = Math.floor(hash2(i, j, 5) * 128);
        for (let yy = y0 + 2; yy < y1 - 1; yy++) {
          c.shift(x, yy, -1.4);
          c.shift((x + 1) & 127, yy, 0.6);
        }
      }
    }
    // A dark gully cut down through the beds (wandering, 3–5 texels wide).
    {
      let gx = rng.int(0, 127);
      for (let yy = 0; yy < 128; yy++) {
        gx += hash2(yy >> 2, 0, 11) > 0.6 ? 1 : hash2(yy >> 2, 0, 12) > 0.7 ? -1 : 0;
        const w = 3 + Math.round(hash2(yy >> 3, 0, 13) * 2);
        for (let d = 0; d < w; d++) c.shift((gx + d) & 127, yy, d === 0 ? 0.6 : -1.3);
      }
    }
    for (let i = 0; i < 30; i++) {
      const x = rng.int(0, 127);
      const y0 = bands[rng.int(0, bands.length - 1)] + 2;
      const len = rng.int(8, 30);
      for (let j = 0; j < len; j++) if (dith(x, y0 + j, 1 - j / len)) {
        wset(c, x, y0 + j, varnish, 2);
        if (j < len / 2) wset(c, x + 1, y0 + j, varnish, 2.4);
      }
    }
    // Scrub clumps on the ledges (dark olive, a lit top).
    for (let i = 0; i < 26; i++) {
      const x = rng.int(0, 127);
      const yb = bands[rng.int(0, bands.length - 1)];
      const w = rng.int(3, 6);
      for (let t = 0; t < w; t++) {
        wset(c, x + t, yb - 1, scrub, 2);
        if (t > 0 && t < w - 1) wset(c, x + t, yb - 2, scrub, t === 1 ? 4 : 3);
      }
      wset(c, x + (w >> 1), yb - 3, scrub, 4);
    }
    wscatter(c, rng, 0, 0, 128, 128, 90, 0, -0.8, { shapes: 3 });
  }, { wrap: true, density: 12 });
}

/** Tunnel ceiling (wrap 64 × 64): sooty concrete, joint lines, drips. */
export function z3TunnelCeil(atlas: PwAtlas): PwTile {
  return atlas.tile('z3tunceil', 64, 64, (c, k) => {
    const rng = k.rng;
    const C = k.ramp(0x4a4652, { light: 0.4, sat: 0.8 });
    fill(c, C, 2.6);
    for (let y = 0; y < 64; y += 32) c.hline(0, y, 64, C, 1.6);
    wscatter(c, rng, 0, 0, 64, 64, 80, 0, -0.8, { shapes: 3 });
    wscatter(c, rng, 0, 0, 64, 64, 30, 0, 0.6, { shapes: 2 });
  }, { wrap: true });
}

/** Board-formed portal concrete (wrap 128 × 128): plank-pour lines, joints, rust and soot runs. */
export function z3PortalTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3portal', 128, 128, (c, k) => {
    const rng = k.rng;
    const C = k.ramp(0x968e84, { light: 0.45, sat: 0.8 });
    const rust = k.ramp(0x7a4a2a, { light: 0.4 });
    fill(c, C, 3);
    for (let y = 0; y < 128; y += 5) {
      c.hline(0, y, 128, C, 2.6);
      for (let x = 0; x < 128; x++) if (hash2(x >> 4, y, 3) > 0.7) c.set(x, y + 1, C, 3.4);
    }
    for (const x of [0, 64]) {
      c.vline(x, 0, 128, C, 1.6);
      c.vline(x + 1, 0, 128, C, 3.8);
    }
    for (let i = 0; i < 6; i++) rustRun(c, rng, rng.int(0, 127), rng.int(0, 60), rng.int(10, 40), rust);
    wscatter(c, rng, 0, 0, 128, 128, 100, 0, -0.8, { shapes: 3 });
  }, { wrap: true });
}

/** Cast lettering on the portal (cut out): raised letters, lit tops, rust bleeding under them. */
export function z3CastLetters(atlas: PwAtlas, text: string): { tile: PwTile; wM: number; hM: number } {
  const scale = 2;
  const f: PixelFont = FONT_BOLD;
  const tw = textWidth(text, f, { scale, spacing: 1 });
  const W = tw + 4;
  const H = f.h * scale + 6;
  const ckey = `z3cast|${text}`;
  const tile = atlas.tile(ckey, W, H, (c, k) => {
    const m = k.ramp(0xc8c0b0, { light: 0.45 });
    drawText(c, text, 2, 0, f, m, 3, { scale, spacing: 1, shadow: { ramp: k.ramp(0x2a2622, { light: 0.4 }), tone: 1 }, shadowD: 2, shadeFn: (_u, v) => (v < 0.2 ? 1.2 : v > 0.8 ? -0.6 : 0) });
    z3Ink(ckey, c, [m]);
  });
  // The classic letters' size (0.16 m a font pixel).
  return { tile, wM: (W * 0.16) / scale, hM: (H * 0.16) / scale };
}

/** Jet fan (wrap 64 × 32 round it): steel drum, stiffener rings, a maker's plate. */
export function z3FanTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3fan', 64, 32, (c, k) => {
    const s = k.ramp(0x6a6e76, { light: 0.5, sat: 0.4 });
    fill(c, s, 3);
    for (const y of [2, 16, 29]) {
      c.hline(0, y, 64, s, 4.4);
      c.hline(0, y + 1, 64, s, 1.8);
    }
    for (let x = 0; x < 64; x++) {
      const a = x / 64;
      if (a > 0.35 && a < 0.65) for (let y = 0; y < 32; y++) c.shift(x, y, -0.8);
    }
    sootBloom(c, 32, 32, 30, 24, 1.2);
  }, { wrap: true });
}

/** Fan grille end (disc module 24 × 24): blades behind a guard. */
export function z3FanEnd(atlas: PwAtlas): PwTile {
  return atlas.tile('z3fanend', 24, 24, (c, k) => {
    const s = k.ramp(0x3a3e46, { light: 0.5 });
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - 11.5, y - 11.5);
      if (d > 12) continue;
      const a = Math.atan2(y - 11.5, x - 11.5);
      const blade = Math.sin(a * 5 + d * 0.3) > 0.3;
      c.set(x, y, s, d > 10.5 ? 4 : d < 2 ? 3.6 : blade ? 2.6 : 0.8);
    }
  });
}

// ─── Bridge ──────────────────────────────────────────────────────────────────

/**
 * Bridge tower steel (wrap 64 × 128 = 2 × 4 m): International-orange cells — tall recessed panels
 * between vertical stiffeners (lit left lip, shadowed recess), rivet lines down the stiffeners, a
 * horizontal batten every 4 m, rust weeping from the rivets, chipped paint.
 */
export function z3BridgeSteel(atlas: PwAtlas, hex = 0xb8442a): PwTile {
  return atlas.tile(`z3bsteel|${h6(hex)}`, 64, 128, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(hex, { light: 0.45, sat: 1 });
    const rust = k.ramp(0x5a2412, { light: 0.4 });
    fill(c, s, 3);
    const T = c.tone;
    // Cells 32 wide: stiffener (6 texels, raised, a lit bevel), recess (26 texels) in its shadow on
    // the left, warming toward its right; a batten plate across the cells every 2 m, riveted.
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 64; x++) {
        const u = x & 31;
        const i = y * 64 + x;
        if (u === 0) T[i] = 4.4;
        else if (u < 5) T[i] = 3.6;
        else if (u === 5) T[i] = 1.4;
        else if (u < 8) T[i] = 2.0;
        else T[i] = u > 29 ? 3.4 : u > 24 ? 3.0 : u < 12 ? 2.4 : 2.7;
      }
    }
    for (let y = 3; y < 128; y += 5) for (const x of [2, 34]) rivet(c, x, y, s, 3);
    for (const by of [28, 92]) {
      c.rect(0, by, 64, 6, s, 3.5);
      c.hline(0, by, 64, s, 4.4);
      c.hline(0, by + 6, 64, s, 1.6);
      c.hline(0, by + 7, 64, s, 2.2);
      for (let x = 3; x < 64; x += 5) rivet(c, x, by + 2, s, 3.5);
    }
    for (let i = 0; i < 6; i++) rustRun(c, rng, rng.int(0, 63), rng.int(0, 120), rng.int(6, 16), rust);
    wscatter(c, rng, 0, 0, 64, 128, 50, 0, -0.8, { shapes: 3 });
    wscatter(c, rng, 0, 0, 64, 128, 16, 0, 0.8, { shapes: 2 });
  }, { wrap: true });
}

/** Main cable (wrap 32 × 32 round it): wrapped wire spiral, band clamps. */
export function z3CableTile(atlas: PwAtlas, hex = 0xb8442a): PwTile {
  return atlas.tile(`z3cable|${h6(hex)}`, 32, 32, (c, k) => {
    const s = k.ramp(hex, { light: 0.45, sat: 1 });
    fill(c, s, 3);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if ((x + y * 2) % 8 === 0) c.set(x, y, s, 2.2);
    c.rect(0, 0, 32, 3, s, 3.8);
    c.hline(0, 3, 32, s, 1.8);
    for (let x = 0; x < 32; x++) {
      const a = x / 32;
      if (a > 0.3 && a < 0.7) for (let y = 0; y < 32; y++) c.shift(x, y, -0.8);
    }
  }, { wrap: true });
}

// ─── Barricade ───────────────────────────────────────────────────────────────

/** Sandbag wall face (wrap 64 × 32 = 2 m × 1 m, 4 courses; cut out above the top course's lumps). */
export function z3SandbagTile(atlas: PwAtlas, rows: number): PwTile {
  return atlas.tile(`z3sandbag2|${rows}`, 64, 32, (c, k) => {
    const rng = k.rng;
    const a = k.ramp(0x9a8858, { light: 0.45, sat: 0.9 });
    const b = k.ramp(0x847450, { light: 0.45, sat: 0.9 });
    const tie = k.ramp(0x4a3a24, { light: 0.4 });
    const gap = k.ramp(0x2a2218, { light: 0.4 });
    // Dark joints behind everything (the gaps between bags read as gaps).
    for (let y = 32 - rows * 8; y < 32; y++) for (let x = 0; x < 64; x++) c.set(x, y, gap, 1.4);
    // Courses of ~8 rows from the bottom, unevenly staggered; each bag a pillow: a rounded body
    // swelling in the middle, a pinched tied end, a lit top, a dark sag crease, a shadowed belly.
    for (let r = 0; r < 4; r++) {
      const y0 = 32 - (r + 1) * 8 + (hash2(r, 1, 7) > 0.6 ? 1 : 0);
      let bx = -24 + Math.floor(hash2(r, 2, 7) * 12);
      let n = 0;
      while (bx < 64) {
        const L = 17 + Math.floor(hash2(r, n, 9) * 6);
        const ramp = (n + r) & 1 ? a : b;
        const dy = hash2(r, n, 11) > 0.7 ? -1 : 0;
        for (let xx = 0; xx < L; xx++) {
          const u = (xx + 0.5) / L - 0.5;
          // The tied end (right) pinches in; the body swells.
          const half = 4.2 * Math.sqrt(Math.max(0, 1 - (u / 0.5) ** 4)) * (u > 0.32 ? 1 - (u - 0.32) * 2.2 : 1);
          for (let yy = 0; yy < 9; yy++) {
            const v = yy + 0.5 - 4.5;
            if (Math.abs(v) > half) continue;
            if (r === rows - 1 && v < -half + 1 && hash2(bx + xx, r, 3) > 0.7) continue;
            const vn = v / Math.max(1, half);
            let t = vn < -0.65 ? 4.2 : vn < -0.25 ? 3.5 : vn > 0.6 ? 1.9 : 2.9;
            // The sag crease running along the bag, a little below the crown.
            if (Math.abs(vn + 0.05 - u * 0.2) < 0.12 && Math.abs(u) < 0.32) t = 2.3;
            wset(c, bx + xx, y0 + 4 + Math.round(v) + dy, ramp, t);
          }
        }
        // The tie: a dark knot at the pinched end, an ear of sacking past it.
        wset(c, bx + L - 2, y0 + 4 + dy, tie, 2);
        wset(c, bx + L - 2, y0 + 5 + dy, tie, 1.6);
        wset(c, bx + L - 1, y0 + 3 + dy, ramp, 3.4);
        bx += L - 1;
        n++;
      }
    }
    // Courses above `rows` are cut out (the wall is `rows` courses tall).
    for (let y = 0; y < 32 - rows * 8; y++) for (let x = 0; x < 64; x++) c.set(x, y, 0, 0);
    wscatter(c, rng, 0, 32 - rows * 8, 64, rows * 8, 30, 0, -0.7, { shapes: 2 });
  }, { wrap: true });
}

/** Floodlight head (module 64 × 32): a box housing with two glowing lamp faces, louvres. */
export function z3FloodHead(atlas: PwAtlas): PwTile {
  return atlas.tile('z3flood', 64, 32, (c, k) => {
    const h = k.ramp(0x2a2a2e, { light: 0.45 });
    const lamp = k.ramp(0xf0f4ff, { light: 0.6, sat: 0.4 });
    fill(c, h, 2.6);
    c.frame(0, 0, 64, 32, h, 3.6);
    for (const x0 of [6, 36]) {
      for (let y = 6; y < 26; y++) for (let x = x0; x < x0 + 22; x++) c.set(x, y, lamp, y < 10 ? 5 : 4, G);
      for (let y = 8; y < 26; y += 4) c.hline(x0, y, 22, lamp, 3, G);
    }
  });
}


/**
 * The barricade gate's warning plate (module 64 × 32 on the 1 × 0.5 m plate): KEEP / OUT in big
 * bold caps on hazard yellow (the letters hold their bars down the levels), a black rule between,
 * a riveted rim, rust weeping from the bolts, a dent.
 */
export function z3KeepOut(atlas: PwAtlas): PwTile {
  const key = 'z3keepout';
  return atlas.tile(key, 64, 32, (c, k) => {
    const rng = k.rng;
    const yel = k.ramp(0xe0b820, { light: 0.45, sat: 1 });
    const ink = k.ramp(0x1a1a1a, { light: 0.4 });
    const rust = k.ramp(0x7a4a2a, { light: 0.4 });
    fill(c, yel, 3);
    c.hline(0, 0, 64, yel, 4.2);
    c.vline(0, 0, 32, yel, 4);
    c.hline(0, 31, 64, yel, 1.8);
    c.vline(63, 0, 32, yel, 2);
    for (const [x, y] of [[0, 0], [63, 0], [0, 31], [63, 31]]) c.set(x, y, 0, 0);
    for (const word of ['KEEP', 'OUT']) {
      const tw = textWidth(word, FONT_BOLD, { scale: 2, spacing: 1 });
      const [gx, gy] = z3SnapGlyph(Math.round((64 - tw) / 2), word === 'KEEP' ? 0 : 16, 2, 32);
      drawText(c, word, gx, gy, FONT_BOLD, ink, 2, { scale: 2, spacing: 1 });
    }
    c.hline(5, 15, 54, ink, 2);
    for (const [x, y] of [[3, 3], [60, 3], [3, 28], [60, 28]]) {
      rivet(c, x, y, yel, 3);
      rustRun(c, rng, x, y + 2, rng.int(3, 8), rust);
    }
    for (let i = 0; i < 18; i++) {
      const x = rng.int(1, 62);
      const y = rng.int(1, 30);
      if (c.at(x, y) === yel) c.set(x, y, yel, rng.chance(0.5) ? 2.2 : 3.8);
    }
    z3Ink(key, c, [ink]);
  });
}

// ─── R2: the boss arena's steel up close ─────────────────────────────────────

/** A caged access ladder (cut-out wrap 32 × 32 = 1 m): two rails, rungs, a hoop of the safety cage. */
export function z3LadderTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3ladder', 32, 32, (c, k) => {
    const s = k.ramp(0x6a6e74, { light: 0.5 });
    for (let y = 0; y < 32; y++) {
      c.set(10, y, s, 3.8);
      c.set(11, y, s, 2.4);
      c.set(20, y, s, 3.4);
      c.set(21, y, s, 2.2);
      c.set(4, y, s, 2.8);
      c.set(27, y, s, 2.4);
    }
    for (const y of [4, 15, 26]) {
      c.hline(10, y, 12, s, 3.6);
      c.hline(10, y + 1, 12, s, 1.8);
    }
    for (let x = 4; x < 28; x++) c.set(x, 0, s, x < 16 ? 3.6 : 2.6);
  }, { wrap: true });
}

/** A main-cable band clamp (wrap 32 × 16 round the collar): dark steel, bolt heads, a lit rim. */
export function z3ClampTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3clamp', 32, 16, (c, k) => {
    const s = k.ramp(0x4a2a24, { light: 0.45 });
    fill(c, s, 2.6);
    c.hline(0, 0, 32, s, 4);
    c.hline(0, 15, 32, s, 1.4);
    for (let x = 2; x < 32; x += 8) ((rivet(c, x, 5, s, 3.4), rivet(c, x, 10, s, 3.4)));
  }, { wrap: true });
}

/** A stencil painted on the tower leg (cut out): big white characters, chipped, with an ink mask. */
export function z3TowerStencil(atlas: PwAtlas, text: string): { tile: PwTile; wM: number; hM: number } {
  const scale = 6;
  const tw = textWidth(text, FONT_BOLD, { scale, spacing: 1 });
  const W = Math.ceil((tw + 4) / 2) * 2;
  const H = FONT_BOLD.h * scale + 4;
  const key = `z3stencil|${text}`;
  const tile = atlas.tile(key, W, H, (c, k) => {
    const w = k.ramp(0xe8e4dc, { light: 0.4 });
    drawText(c, text, 2, 2, FONT_BOLD, w, 3.6, { scale, spacing: 1 });
    // Stencil bridges (gaps across the strokes) and chips.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (c.ramp[y * W + x] !== w) continue;
      if ((y === Math.round(H * 0.5) && (x & 15) < 3) || hash2(x >> 1, y >> 1, 3) > 0.9) c.set(x, y, 0, 0);
    }
    z3Ink(key, c, [w]);
  });
  return { tile, wM: W / 32, hM: H / 32 };
}
