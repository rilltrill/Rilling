import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD, FONT_TALL, textWidth } from './font';
import { neutral, NEUTRAL_HEX } from './retexture';
import { hash2 } from './surfaces';
import { dith, fill, G, h6, rivet, rustRun, sootBloom, wscatter, wset } from './z3kit';
import { z3Ink, z3SnapGlyph } from './z3levels';

/**
 * HIGHWAY TO HELL (z3) roadside buildings for ART: PIXEL WORLD: the suburb's
 * clapboard houses (siding, shingles, curtained windows lit, dark or on
 * fire, panel doors with a porch light, soot over the burning ones), the
 * GAS station (striped canopy fascia, pumps, its 24-HOUR pole sign), the
 * warehouses (ribbed cladding, roller shutters, painted company names), the
 * motel's numbered doors, and the three billboards painted as posters —
 * REPENT, BURGER BARN and the burnt-out motel ad with holes burnt through.
 */

/** Clapboard siding (neutral wrap 64 × 64): lapped boards (lit lower edge, shadowed lap), nails, peeling paint, a dirty foot. */
export function z3SidingTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile('z3siding', 64, 64, (c, k) => {
      const rng = k.rng;
      const p = k.ramp(NEUTRAL_HEX, { light: 0.55, dark: 0.4, sat: 0 });
      const wood = k.ramp(0x8a8278, { light: 0.4, sat: 0 });
      fill(c, p, 3);
      for (let y = 0; y < 64; y += 8) {
        c.hline(0, y, 64, p, 1.8);
        c.hline(0, y + 1, 64, p, 2.6);
        c.hline(0, y + 7, 64, p, 3.6);
        for (let x = (y >> 3) * 13 % 32; x < 64; x += 32) c.set(x, y + 4, p, 2);
      }
      // Peeling paint: flakes of bare grey wood.
      for (let i = 0; i < 16; i++) {
        const x = rng.int(0, 60);
        const y = rng.int(0, 63);
        for (let j = 0; j < rng.int(2, 6); j++) if ((y + 0) % 8 !== 0) wset(c, x + j, y, wood, 3);
      }
    }, { wrap: true }),
  );
}

/** Stucco (neutral wrap 64 × 64): trowel swirls as clusters, hairline cracks, damp at the foot. */
export function z3StuccoTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile('z3stucco', 64, 64, (c, k) => {
      const rng = k.rng;
      const p = k.ramp(NEUTRAL_HEX, { light: 0.5, dark: 0.4, sat: 0 });
      fill(c, p, 3);
      wscatter(c, rng, 0, 0, 64, 64, 90, 0, 0.6, { shapes: 6 });
      wscatter(c, rng, 0, 0, 64, 64, 90, 0, -0.6, { shapes: 6 });
      for (let i = 0; i < 3; i++) {
        let x = rng.int(0, 63);
        let y = rng.int(0, 63);
        for (let j = 0; j < rng.int(8, 18); j++) {
          wset(c, x, y, p, 1.8);
          x += rng.int(-1, 1);
          y++;
        }
      }
    }, { wrap: true }),
  );
}

/** Common brick (neutral wrap 64 × 32, warm brick painted round a pale grey, tinted per wall): stretcher bond, lit tops, mortar. */
export function z3BrickTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile('z3brick', 64, 32, (c, k) => {
      const b = k.ramp(0xd8a890, { light: 0.45, dark: 0.4, sat: 0.9 });
      const m = k.ramp(0x9a948c, { light: 0.4, sat: 0.5 });
      fill(c, m, 2.6);
      for (let y = 0; y < 32; y += 4) {
        const off = ((y >> 2) & 1) * 8;
        for (let x = -16; x < 64; x += 16) {
          const t = hash2(x + off, y, 3) > 0.8 ? -0.4 : hash2(x + off, y, 4) > 0.85 ? 0.4 : 0;
          for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 15; xx++) wset(c, x + off + xx, y + yy, b, (yy === 0 ? 3.6 : yy === 2 ? 2.6 : 3) + t);
        }
      }
    }, { wrap: true }),
    0xd8a890,
  );
}

/** Asphalt shingles (wrap 64 × 64): staggered tab rows, a few missing / lifted, grit, moss at the eaves. */
export function z3ShingleTile(atlas: PwAtlas, hex: number, burnt = false): PwTile {
  return atlas.tile(`z3shingle|${h6(hex)}|${burnt ? 1 : 0}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(hex, { light: 0.45, sat: 0.9 });
    const moss = k.ramp(0x4a5a2a, { light: 0.4 });
    const ch = k.ramp(0x1a1416, { light: 0.4 });
    fill(c, s, 3);
    for (let y = 0; y < 64; y += 6) {
      c.hline(0, y, 64, s, 1.6);
      c.hline(0, y + 1, 64, s, 3.6);
      const off = ((y / 6) & 1) * 6;
      for (let x = off; x < 64; x += 12) c.vline(x, y + 1, 5, s, 2);
    }
    for (let i = 0; i < 6; i++) {
      const x = rng.int(0, 5) * 12 + rng.int(0, 1) * 6;
      const y = rng.int(0, 9) * 6;
      c.rect(x + 1, y + 1, 10, 5, s, 1.2);
    }
    wscatter(c, rng, 0, 0, 64, 64, 60, 0, 0.8, { shapes: 2 });
    wscatter(c, rng, 0, 48, 64, 16, 14, moss, 2.6, { shapes: 3 });
    if (burnt) {
      for (let i = 0; i < 4; i++) {
        const cx = rng.int(0, 63);
        const cy = rng.int(0, 63);
        for (let y = -6; y <= 6; y++) for (let x = -8; x <= 8; x++) if (x * x / 64 + y * y / 36 + hash2(cx + x, cy + y, 3) * 0.5 < 1) wset(c, cx + x, cy + y, ch, 1);
      }
    }
  }, { wrap: true });
}

/** A house window on fire (module 48 × 48): the frame, flames filling it and licking out the top, soot above. */
export function z3FireWindow(atlas: PwAtlas, variant: number): PwTile {
  return atlas.tile(`z3firewin|${variant}`, 48, 64, (c, k) => {
    const frame = k.ramp(0x3a2a22, { light: 0.4 });
    const core = k.ramp(0xfff0b0, { light: 0.5 });
    const yel = k.ramp(0xffc838, { light: 0.45 });
    const org = k.ramp(0xff6a14, { light: 0.5 });
    const red = k.ramp(0xb0200a, { light: 0.45 });
    const soot = k.ramp(0x1a1416, { light: 0.4 });
    // Soot bloom over the opening (cut out beyond it).
    for (let y = 0; y < 26; y++) for (let x = 0; x < 48; x++) {
      const u = (x - 24) / (12 + y * 0.6);
      if (Math.abs(u) > 1 || !dith(x, y, (y / 26) * 1.4 - Math.abs(u) * 0.3)) continue;
      c.set(x, y, soot, y > 18 ? 1.4 : 2);
    }
    // Frame + opening.
    c.rect(8, 24, 32, 36, frame, 2.4);
    for (let y = 27; y < 57; y++) for (let x = 11; x < 37; x++) {
      const h = (57 - y) / 30;
      const n = hash2(x >> 1, y >> 2, 5 + variant);
      const t = (1 - h) * 1.2 + n * 0.4 - 0.15;
      c.set(x, y, t > 0.95 ? core : t > 0.7 ? yel : t > 0.4 ? org : red, t > 0.95 ? 4 : 3, G);
    }
    c.vline(23, 27, 30, frame, 1.6);
    c.hline(11, 41, 26, frame, 1.6);
    // Tongues licking out over the lintel.
    for (let i = 0; i < 5; i++) {
      const x = 13 + i * 5 + (variant & 1) * 2;
      const len = 6 + Math.floor(hash2(i, variant, 9) * 10);
      for (let j = 0; j < len; j++) {
        const w = Math.max(0, 2 - Math.floor(j / 4));
        for (let dx = -w; dx <= w; dx++) c.set(x + dx + Math.round(Math.sin(j * 0.5 + i) * 1.2), 25 - j, j < 3 ? yel : org, j < 3 ? 4 : 3, G);
      }
    }
  });
}

/** A house door (module 36 × 72): panel door, frame, step, a porch lamp (lit). */
export function z3HouseDoor(atlas: PwAtlas, hex: number, lit: boolean): PwTile {
  return atlas.tile(`z3hdoor|${h6(hex)}|${lit ? 1 : 0}`, 36, 72, (c, k) => {
    const d = k.ramp(hex, { light: 0.45 });
    const frame = k.ramp(0xd8d0c0, { light: 0.4 });
    const brass = k.ramp(0xd8a840, { light: 0.5 });
    const lamp = k.ramp(lit ? 0xffd090 : 0x6a6a60, { light: 0.6 });
    c.rect(2, 4, 32, 68, frame, 3);
    c.rect(6, 8, 24, 62, d, 3);
    for (const [x, y] of [[9, 12], [19, 12], [9, 38], [19, 38]]) {
      c.rect(x, y, 8, 22, d, 2.4);
      c.hline(x, y, 8, d, 1.6);
      c.vline(x, y, 22, d, 1.6);
      c.hline(x, y + 21, 8, d, 3.6);
    }
    c.set(27, 42, brass, 4);
    c.set(27, 43, brass, 2);
    c.rect(0, 70, 36, 2, frame, 2);
    // Porch lamp to the right of the frame.
    c.rect(32, 20, 4, 6, lamp, lit ? 4 : 2.4, lit ? G : 0);
    c.set(33, 19, frame, 2);
  });
}

/** Chimney brick (wrap 32 × 32, warm brick in bond with dark mortar, soot at the top). */
export function z3ChimneyTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3chimney', 32, 32, (c, k) => {
    const b = k.ramp(0x7a3a2c, { light: 0.45 });
    const m = k.ramp(0x4a3a34, { light: 0.4 });
    fill(c, m, 2.4);
    for (let y = 0; y < 32; y += 4) {
      const off = ((y >> 2) & 1) * 4;
      for (let x = -8; x < 32; x += 8) {
        for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 7; xx++) wset(c, x + off + xx, y + yy, b, yy === 0 ? 3.6 : yy === 2 ? 2.6 : 3);
      }
    }
  }, { wrap: true });
}

// ─── Gas station ─────────────────────────────────────────────────────────────

/** Canopy fascia (wrap 128 × 24 = 4 m × 0.75 m): red with a white stripe and the GAS-N-GO script every 4 m. */
export function z3CanopyFascia(atlas: PwAtlas): PwTile {
  return atlas.tile('z3canopy', 128, 32, (c, k) => {
    const red = k.ramp(0xc42a20, { light: 0.45, sat: 1 });
    const white = k.ramp(0xf0ece4, { light: 0.4 });
    const yel = k.ramp(0xf0c030, { light: 0.45 });
    fill(c, red, 3);
    c.hline(0, 8, 128, red, 4.2);
    c.rect(0, 22, 128, 3, white, 3.6);
    c.rect(0, 26, 128, 6, white, 3.2);
    drawText(c, 'GAS-N-GO', 30, 11, FONT_BOLD, yel, 3.6, { shadow: { ramp: red, tone: 1 } });
    for (let x = 0; x < 128; x += 4) c.set(x, 30, white, 2);
  }, { wrap: true });
}

/** A fuel pump (module 32 × 56 = 0.9 × 1.7 m front): the price display lit, logo, hose and nozzle, scuffs. */
export function z3PumpFront(atlas: PwAtlas): PwTile {
  return atlas.tile('z3pump', 32, 56, (c, k) => {
    const body = k.ramp(0xd8d4cc, { light: 0.45 });
    const red = k.ramp(0xc42a20, { light: 0.45 });
    const lcd = k.ramp(0x9ad0ff, { light: 0.5 });
    const black = k.ramp(0x1c1c20, { light: 0.4 });
    fill(c, body, 3);
    c.frame(0, 0, 32, 56, body, 2);
    c.rect(2, 2, 28, 10, red, 3);
    drawText(c, 'GAS', 9, 4, FONT_3x5, body, 4);
    c.rect(5, 15, 22, 12, black, 1);
    for (let r = 0; r < 3; r++) for (let x = 7; x < 25; x += 2) c.set(x, 17 + r * 3, lcd, 4, G);
    c.rect(4, 32, 6, 12, black, 1.6);
    c.rect(22, 30, 6, 8, black, 2.2);
    for (let y = 38; y < 54; y++) c.set(25 + (y > 46 ? (y - 46) >> 1 : 0), y, black, 1.4);
    c.rect(0, 50, 32, 6, body, 2.2);
    wscatter(c, k.rng, 0, 30, 32, 26, 20, 0, -1, { shapes: 3 });
  });
}

/** The pole sign's lightbox (module 160 × 84 = 5 × 2.6 m): GAS in red on the glowing face, 24 HRS, a price strip. */
export function z3GasSign(atlas: PwAtlas): PwTile {
  return atlas.tile('z3gassign', 160, 84, (c, k) => {
    const frame = k.ramp(0xc42a20, { light: 0.45 });
    const face = k.ramp(0xfff0d0, { light: 0.4, sat: 0.6 });
    const red = k.ramp(0xc42a20, { light: 0.45, sat: 1.1 });
    const black = k.ramp(0x1c1c20, { light: 0.4 });
    const led = k.ramp(0xff5030, { light: 0.5 });
    fill(c, frame, 3);
    c.hline(0, 0, 160, frame, 4.4);
    c.rect(6, 6, 148, 48, face, 4, G);
    // A few dead tubes behind the face (darker bands).
    c.rect(40, 6, 6, 48, face, 3, G);
    const tw = textWidth('GAS', FONT_BOLD, { scale: 5 });
    drawText(c, 'GAS', Math.round((160 - tw) / 2), 6, FONT_BOLD, red, 3, { scale: 5, flag: 0 });
    c.rect(6, 58, 148, 20, black, 1);
    drawText(c, '24 HRS', 12, 62, FONT_BOLD, led, 4, { scale: 2, flag: G });
    drawText(c, '4.99', 108, 62, FONT_BOLD, led, 4, { scale: 2, flag: G });
    // Bullet holes in the face.
    for (const [x, y] of [[30, 20], [118, 34], [96, 14]]) {
      c.set(x, y, black, 1);
      c.set(x + 1, y + 1, face, 2);
    }
  });
}

// ─── Warehouses / motel ─────────────────────────────────────────────────────

/** Ribbed industrial cladding (neutral wrap 64 × 64): trapezoid ribs, fixings, rust streaks, a dirty foot. */
export function z3CladdingTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile('z3cladding', 64, 64, (c, k) => {
      const rng = k.rng;
      const p = k.ramp(NEUTRAL_HEX, { light: 0.55, dark: 0.4, sat: 0 });
      const rust = k.ramp(0x8a5a3a, { light: 0.4, sat: 0.5 });
      fill(c, p, 3);
      for (let x = 0; x < 64; x += 8) {
        c.vline(x, 0, 64, p, 4);
        c.vline(x + 1, 0, 64, p, 3.4);
        c.vline(x + 3, 0, 64, p, 2.2);
      }
      for (let y = 4; y < 64; y += 32) for (let x = 2; x < 64; x += 8) rivet(c, x, y, p, 3);
      for (let i = 0; i < 8; i++) rustRun(c, rng, rng.int(0, 63), rng.int(0, 40), rng.int(8, 22), rust);
    }, { wrap: true }),
  );
}

/** A roller shutter (module 128 × 144 = 4 × 4.5 m): slats, the hood box, guides, dents, a number, a tag. */
export function z3RollerDoor(atlas: PwAtlas, n: number): PwTile {
  return atlas.tile(`z3roller|${n}`, 128, 144, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(0x5e6068, { light: 0.45, sat: 0.6 });
    const yel = k.ramp(0xe0b020, { light: 0.45 });
    const white = k.ramp(0xe8e4dc, { light: 0.4 });
    fill(c, s, 3);
    for (let y = 14; y < 144; y += 4) {
      c.hline(4, y, 120, s, 3.6);
      c.hline(4, y + 3, 120, s, 2.2);
    }
    c.rect(0, 0, 128, 14, s, 2.6);
    c.hline(0, 0, 128, s, 4);
    c.hline(0, 13, 128, s, 1.6);
    for (const x of [0, 124]) c.rect(x, 14, 4, 130, s, 2);
    // Dents (a bowed band of slats), a stencilled bay number, a tag.
    const dx = rng.int(20, 90);
    for (let y = 90; y < 120; y++) for (let x = dx; x < dx + 24; x++) if (((x - dx - 12) ** 2) / 144 + ((y - 105) ** 2) / 225 < 1) c.shift(x, y, x < dx + 12 ? -0.8 : 0.6);
    c.rect(52, 2, 24, 10, yel, 3.4);
    drawText(c, String(n), 60, 3, FONT_5x7, k.ramp(0x1a1a1e, { light: 0.4 }), 1);
    if (n % 2) {
      let x = rng.int(10, 60);
      let y = 110;
      for (let j = 0; j < 50; j++) {
        c.set(x, y, white, 3.6);
        c.set(x, y + 1, white, 3);
        x++;
        y += rng.int(-1, 1);
      }
    }
  });
}

/** A painted company name on dark board (GLOW letters: the lit strip), `text` sized to `wM` m. */
export function z3LitStrip(atlas: PwAtlas, text: string, wM: number): PwTile {
  const W = Math.round(wM * 32);
  return atlas.tile(`z3litstrip|${text}|${W}`, W, 20, (c, k) => {
    const back = k.ramp(0x1c1c22, { light: 0.4 });
    const lit = k.ramp(0xffd090, { light: 0.5 });
    fill(c, back, 2);
    const tw = textWidth(text, FONT_BOLD, { scale: 2 });
    drawText(c, text, Math.round((W - tw) / 2), 0, FONT_BOLD, lit, 4, { scale: 2, flag: G });
  });
}

/** A motel room door (module 36 × 68): numbered, a peephole, a kick-plate, scuffs. */
export function z3MotelDoor(atlas: PwAtlas, n: number): PwTile {
  return atlas.tile(`z3moteldoor|${n}`, 36, 68, (c, k) => {
    const d = k.ramp(0x6a3e2a, { light: 0.45 });
    const frame = k.ramp(0xd8c8a8, { light: 0.4 });
    const brass = k.ramp(0xd8a840, { light: 0.5 });
    c.rect(0, 0, 36, 68, frame, 3);
    c.rect(3, 3, 30, 65, d, 3);
    c.vline(3, 3, 65, d, 4);
    drawText(c, String(n), 13, 10, FONT_3x5, brass, 4);
    c.set(17, 22, brass, 2);
    c.rect(28, 36, 2, 4, brass, 4);
    c.rect(3, 58, 30, 8, d, 2.2);
    wscatter(c, k.rng, 3, 40, 30, 26, 12, 0, -1, { shapes: 3 });
  });
}

/** A motel window (module 36 × 36): frame, AC unit under it, curtains half drawn (lit / dark). */
export function z3MotelWindow(atlas: PwAtlas, lit: boolean): PwTile {
  return atlas.tile(`z3motelwin|${lit ? 1 : 0}`, 36, 36, (c, k) => {
    const frame = k.ramp(0xd8c8a8, { light: 0.4 });
    const glass = k.ramp(lit ? 0xffc070 : 0x2a2232, { light: 0.5 });
    const curt = k.ramp(lit ? 0xd88a5a : 0x5a3a3a, { light: 0.45 });
    const ac = k.ramp(0x9a968e, { light: 0.4 });
    c.rect(0, 0, 36, 28, frame, 3);
    c.rect(3, 3, 30, 22, glass, lit ? 4 : 2, lit ? G : 0);
    for (let y = 3; y < 25; y++) {
      for (let x = 3; x < 10 + ((y >> 2) & 1); x++) c.set(x, y, curt, x === 9 ? 2 : 3, lit ? G : 0);
      for (let x = 26 - ((y >> 2) & 1); x < 33; x++) c.set(x, y, curt, x === 26 ? 2 : 3, lit ? G : 0);
    }
    c.rect(8, 28, 20, 8, ac, 3);
    for (let x = 10; x < 26; x += 2) c.vline(x, 30, 5, ac, 1.6);
  });
}

// ─── Billboards ──────────────────────────────────────────────────────────────

/** Billboard poster faces (module 288 × 120 = 12 × 5 m at 24 texels a metre): 'repent' | 'burger' | 'motel' (burnt, holes cut out). */
export function z3BillboardFace(atlas: PwAtlas, art: string): PwTile {
  return atlas.tile(`z3bb|${art}`, 288, 120, (c, k) => {
    const rng = k.rng;
    const W = 288;
    const H = 120;
    const paper = k.ramp(0xf0ece0, { light: 0.4 });
    const red = k.ramp(0xd42a1c, { light: 0.45, sat: 1.1 });
    const black = k.ramp(0x16161a, { light: 0.4 });
    const yel = k.ramp(0xf8c830, { light: 0.45 });
    const grime = k.ramp(0x6a6052, { light: 0.4 });
    const wood = k.ramp(0x5a4434, { light: 0.4 });
    if (art === 'repent') {
      fill(c, paper, 3);
      const s = 4;
      const tw = textWidth('REPENT', FONT_BOLD, { scale: s, spacing: 1 });
      const [rx, ry] = z3SnapGlyph(Math.round((W - tw) / 2), 8, s, H);
      drawText(c, 'REPENT', rx, ry, FONT_BOLD, red, 3, { scale: s, spacing: 1, shadow: { ramp: k.ramp(0x141418, { light: 0.4 }), tone: 2 }, shadowD: 2 });
      // The warning in strokes four texels wide, on the level grid (they still read when the board is small on screen).
      const t2 = textWidth('THE END IS NEAR', FONT_5x7, { scale: 3, spacing: 0 });
      const [sx, sy] = z3SnapGlyph(Math.round((W - t2) / 2), 72, 3, H);
      drawText(c, 'THE END IS NEAR', sx, sy, FONT_5x7, black, 2, { scale: 3, spacing: 0 });
      // (The small print in its own ink: it is not meant to read from the road.)
      drawText(c, 'JOHN 3:16', W - 44, 108, FONT_3x5, k.ramp(0x1c1a1e, { light: 0.4 }), 2);
      z3Ink(`z3bb|${art}`, c, [red, black]);
    } else if (art === 'burger') {
      fill(c, red, 3);
      // A big painted burger: bun dome, sesame, lettuce frills, cheese drip, patty, bottom bun.
      const cx = 70;
      const bun = k.ramp(0xe8a440, { light: 0.5 });
      const patty = k.ramp(0x6a2e14, { light: 0.45 });
      const let_ = k.ramp(0x50b030, { light: 0.45 });
      const cheese = k.ramp(0xf8d030, { light: 0.5 });
      for (let y = 0; y < 38; y++) for (let x = -50; x <= 50; x++) {
        const u = x / 50;
        const top = 38 - Math.sqrt(Math.max(0, 1 - u * u)) * 35;
        if (y < top) continue;
        c.set(cx + x, 16 + y, bun, y - top < 2 ? 4.6 : x > 22 ? 2.4 : 3.4);
      }
      for (let i = 0; i < 14; i++) c.set(cx + rng.int(-38, 38), 22 + rng.int(3, 22), k.ramp(0xfff0c0, { light: 0.4 }), 4);
      for (let x = -53; x <= 53; x++) for (let y = 0; y < 6; y++) if (y < 4 + Math.round(Math.sin(x * 0.5) * 2)) c.set(cx + x, 54 + y, let_, y < 2 ? 4 : 3);
      for (let x = -50; x <= 50; x++) for (let y = 0; y < 5 + (x % 13 === 3 ? 6 : 0); y++) c.set(cx + x, 59 + y, cheese, y === 0 ? 4.4 : 3);
      for (let x = -51; x <= 51; x++) for (let y = 0; y < 12; y++) c.set(cx + x, 64 + y, patty, y < 2 ? 3.6 : (x + y * 3) % 11 === 0 ? 2 : 3);
      for (let x = -48; x <= 48; x++) for (let y = 0; y < 12; y++) if (Math.abs(x) < 48 - y * 0.6) c.set(cx + x, 76 + y, bun, y < 2 ? 4 : y > 9 ? 2.4 : 3.2);
      const s = 4;
      drawText(c, 'BURGER', 136, 8, FONT_BOLD, yel, 3.4, { scale: s, shadow: { ramp: black, tone: 1 }, shadowD: 2 });
      drawText(c, 'BARN', 150, 48, FONT_BOLD, yel, 3.4, { scale: s + 1, shadow: { ramp: black, tone: 1 }, shadowD: 2 });
      drawText(c, 'EXIT 9 >', 178, 102, FONT_BOLD, paper, 3.6);
      z3Ink(`z3bb|${art}`, c, [yel, paper]);
    } else {
      // The burnt motel ad: charred planks, ghost of the old poster, holes burnt through (cut out).
      fill(c, wood, 2.4);
      for (let y = 0; y < H; y += 8) c.hline(0, y, W, wood, 1.4);
      drawText(c, 'MOTEL', 86, 18, FONT_TALL, k.ramp(0x7a6a5a, { light: 0.4 }), 2.6, { scale: 4 });
      drawText(c, 'VACANCY', 120, 92, FONT_BOLD, k.ramp(0x6a5a50, { light: 0.4 }), 2.6, { scale: 2 });
      sootBloom(c, 190, H, 120, 112, 2.6);
      for (let i = 0; i < 5; i++) {
        const cx = rng.int(30, W - 30);
        const cy = rng.int(16, H - 16);
        const r = rng.int(8, 20);
        for (let y = -r - 3; y <= r + 3; y++) for (let x = -r - 3; x <= r + 3; x++) {
          const d = Math.hypot(x, y * 1.3) + hash2(cx + x, cy + y, 4) * 5;
          if (d < r) c.set(cx + x, cy + y, 0, 0);
          else if (d < r + 3) c.set(cx + x, cy + y, black, d < r + 1.5 ? 0.6 : 1.4);
        }
      }
      return;
    }
    // Weathering: rain runs from the top, a torn strip showing the old ad's paper beneath, grime along the bottom.
    const inkR = art === 'repent' ? [red, black] : [yel, paper];
    for (let i = 0; i < 30; i++) {
      const x = rng.int(0, W - 1);
      const len = rng.int(8, 52);
      for (let j = 0; j < len; j++) if (dith(x, j, 1 - j / len)) {
        // Rain runs dull the lettering, they do not eat it.
        if (inkR.includes(c.at(x, j))) c.shift(x, j, -0.4);
        else c.tint(x, j, grime, 0.3);
      }
    }
    const tx = rng.int(30, W - 90);
    for (let y = 92; y < H; y++) for (let x = tx; x < tx + 44 + Math.round(Math.sin(y * 0.3) * 5); x++) c.set(x, y, k.ramp(0x7a9ab8, { light: 0.4 }), 3);
    for (let x = 0; x < W; x++) for (let y = H - 8; y < H; y++) if (dith(x, y, (y - (H - 8)) / 8)) c.tint(x, y, grime, -0.3);
  });
}

/** Billboard back (wrap 64 × 64): rough planks with a timber frame and diagonal braces. */
export function z3BillboardBack(atlas: PwAtlas): PwTile {
  return atlas.tile('z3bbback', 64, 64, (c, k) => {
    const w = k.ramp(0x5a4434, { light: 0.45 });
    fill(c, w, 3);
    for (let x = 0; x < 64; x += 8) {
      c.vline(x, 0, 64, w, 1.6);
      c.vline(x + 1, 0, 64, w, 3.6);
    }
    for (let i = 0; i < 64; i++) {
      c.set(i, i, w, 4);
      c.set(i, i + 1, w, 1.8);
    }
    c.rect(0, 30, 64, 4, w, 3.4);
    c.hline(0, 34, 64, w, 1.6);
    wscatter(c, k.rng, 0, 0, 64, 64, 30, 0, -0.8, { shapes: 3 });
  }, { wrap: true });
}


// ─── R2: what holds a building's shape in the dusk haze ─────────────────────

/** A company name stencilled big on warehouse cladding (cut out): faded cream caps with a drop shadow, chipped. */
export function z3CompanyName(atlas: PwAtlas, name: string): { tile: PwTile; wM: number; hM: number } {
  const scale = 3;
  const tw = textWidth(name, FONT_BOLD, { scale, spacing: 1 });
  const W = Math.ceil((tw + 8) / 2) * 2;
  const H = FONT_BOLD.h * scale + 8;
  const key = `z3coname|${name}`;
  const tile = atlas.tile(key, W, H, (c, k) => {
    const paint = k.ramp(0xe0d4b8, { light: 0.4 });
    const shadow = k.ramp(0x2a2428, { light: 0.4 });
    const [gx, gy] = z3SnapGlyph(4, 3, scale, H);
    drawText(c, name, gx, gy, FONT_BOLD, paint, 3.4, { scale, spacing: 1, shadow: { ramp: shadow, tone: 1.6 }, shadowD: 2 });
    // Chipped: flakes of the letters gone back to the wall (cut out), a lit top edge.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (c.ramp[i] !== paint) continue;
      if (hash2(x >> 1, y >> 1, 7) > 0.86) c.set(x, y, 0, 0);
      else if (y > 0 && c.ramp[i - W] !== paint) c.set(x, y, paint, 4.2);
    }
    z3Ink(key, c, [paint]);
  });
  return { tile, wM: W / 32, hM: H / 32 };
}

/** Rust and grime weeping down from a roof edge (cut-out wrap 64 × 96 = 2 × 3 m): sparse dark runs, a few orange. */
export function z3GrimeRuns(atlas: PwAtlas): PwTile {
  return atlas.tile('z3grime', 64, 96, (c, k) => {
    const rng = k.rng;
    const grime = k.ramp(0x2e2628, { light: 0.4 });
    const rust = k.ramp(0x8a4a24, { light: 0.45 });
    // A dirty band right under the edge, then the runs.
    for (let x = 0; x < 64; x++) for (let y = 0; y < 6; y++) if (dith(x, y, 1 - y / 6)) c.set(x, y, grime, 1.8);
    for (let i = 0; i < 9; i++) {
      const x = rng.int(0, 63);
      const len = rng.int(20, 90);
      const r = rng.chance(0.3) ? rust : grime;
      for (let j = 0; j < len; j++) if (dith(x, j, 1 - j / len)) {
        wset(c, x, j, r, r === rust ? 2.6 : 1.8);
        if (j < len * 0.4) wset(c, x + 1, j, r, r === rust ? 3 : 2.2);
      }
    }
  }, { wrap: true });
}

/** Soot plume up a wall over a burnt window (cut-out module 48 × 64): a black tongue fading up and out. */
export function z3SootPlume(atlas: PwAtlas): PwTile {
  return atlas.tile('z3sootplume', 48, 64, (c, k) => {
    const soot = k.ramp(0x1c1618, { light: 0.4 });
    for (let y = 0; y < 64; y++) {
      const up = 1 - y / 64;
      const half = 9 + up * 13 + Math.sin(y * 0.3) * 2;
      for (let x = 0; x < 48; x++) {
        const u = Math.abs(x - 24) / half;
        if (u > 1) continue;
        const dens = (1 - up * 0.85) * (1 - u * u) * 1.5;
        if (!dith(x, y, dens)) continue;
        c.set(x, y, soot, dens > 0.9 ? 1 : 1.8);
      }
    }
  });
}

/** A rooftop TV antenna (cut-out module 32 × 48 = 1 × 1.5 m): mast, three crossbars with elements, a guy wire. */
export function z3Antenna(atlas: PwAtlas): PwTile {
  return atlas.tile('z3antenna', 32, 48, (c, k) => {
    const m = k.ramp(0x7a7c84, { light: 0.5 });
    c.vline(16, 4, 44, m, 2.6);
    c.vline(17, 4, 44, m, 1.6);
    for (const [y, w] of [[6, 12], [13, 10], [20, 7]] as const) {
      c.hline(16 - w, y, w * 2 + 1, m, 3);
      for (let x = 16 - w; x <= 16 + w; x += 3) ((c.set(x, y - 1, m, 2.4), c.set(x, y + 1, m, 2.4)));
    }
    c.line(16, 26, 2, 47, m, 1.8);
  });
}

/** An open loading bay (module 128 × 144 = 4 × 4.5 m): the shutter rolled up into its hood, a dark interior, crates, a work lamp. */
export function z3OpenBay(atlas: PwAtlas): PwTile {
  return atlas.tile('z3openbay', 128, 144, (c, k) => {
    const s = k.ramp(0x5e6068, { light: 0.45, sat: 0.6 });
    const dark = k.ramp(0x141218, { light: 0.4 });
    const crate = k.ramp(0x5a4430, { light: 0.4 });
    const lamp = k.ramp(0xffc070, { light: 0.55 });
    fill(c, dark, 1.2);
    c.rect(0, 0, 128, 20, s, 2.6);
    c.hline(0, 0, 128, s, 4);
    for (let y = 14; y < 20; y += 3) c.hline(4, y, 120, s, 3.4);
    for (const x of [0, 124]) c.rect(x, 20, 4, 124, s, 2);
    // A work lamp's pool on the floor and a stack of crates in it.
    c.rect(60, 24, 8, 3, lamp, 4.6, G);
    for (let y = 100; y < 144; y++) for (let x = 30; x < 98; x++) if (dith(x, y, 0.45 - Math.abs(x - 64) / 90)) c.set(x, y, dark, 2.2);
    for (const [x, y, w, h] of [[36, 112, 26, 32], [64, 120, 22, 24], [44, 92, 18, 20]] as const) {
      c.rect(x, y, w, h, crate, 2.4);
      c.hline(x, y, w, crate, 3.4);
      c.line(x, y, x + w - 1, y + h - 1, crate, 1.6);
    }
  });
}
