import { bayer, PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, textWidth } from './font';
import { NEUTRAL_HEX } from './retexture';
import { crack, hash2 } from './surfaces';
import { bloodSplat, bulletHole, h6, plate, rivet, scuffs, shiftW, stencil, waterStain, wrapI } from './d2kit';

/**
 * RESEARCH LABS · the clinical wing: glazed subway tile, vinyl composite floor
 * tiles, floor grating with depth, the canteen's chequer and painted
 * blockwork, stainless cabinets / ranges / ovens / hoods, the server room's
 * raised floor, wall panels and racks, the B-2 bulkhead, hatchery displays.
 */

const N = NEUTRAL_HEX;

function neutral(t: PwTile, base = N): PwTile {
  t.neutral = base;
  return t;
}

/**
 * Glazed subway tile (world, v from the floor; NEUTRAL): 16 × 8 texel tiles in
 * running bond, recessed grout, glaze glints on top edges, a coved vinyl skirting,
 * grime runs from the ceiling, cracked and missing tiles, a rust stain. 128 × 160.
 */
export function subwayTileWall(atlas: PwAtlas, o: { tw?: number; th?: number; stack?: boolean } = {}): PwTile {
  const TW = o.tw ?? 16;
  const TH = o.th ?? 8;
  return neutral(
    atlas.tile(
      `d2subway|${TW}x${TH}|${o.stack ? 's' : 'r'}`,
      128,
      160,
      (c, k) => {
        const rng = k.rng;
        const t = k.ramp(N, { light: 0.55, sat: 0.6 });
        const grout = k.ramp(0xa8a8a8, { light: 0.4, sat: 0.5 });
        const cove = k.ramp(0x5a5e62, { light: 0.4 });
        const rust = k.ramp(0xa06a40, { light: 0.4 });
        const H = 160;
        for (let y = 0; y < H; y++) {
          const row = Math.floor(y / TH);
          const off = !o.stack && row % 2 ? TW >> 1 : 0;
          for (let x = 0; x < 128; x++) {
            const lx = (x + off) % TW;
            const ly = y % TH;
            if (lx === 0 || ly === 0) c.set(x, y, grout, ly === 0 ? 2.5 : 2.75);
            else {
              const tid = Math.floor((x + off) / TW) * 97 + row;
              let tone = hash2(tid, 1, 3) > 0.85 ? 2.75 : 3;
              if (ly === 1 && lx < TW / 2 && hash2(tid, 2, 3) > 0.6) tone = 4;
              if (lx === TW - 1 || ly === TH - 1) tone -= 0.5;
              c.set(x, y, t, tone);
            }
          }
        }
        // Coved skirting (bottom 4 rows).
        for (let y = H - 4; y < H; y++) c.hline(0, y, 128, cove, y === H - 4 ? 4 : y === H - 1 ? 1.5 : 2.5);
        // Grime runs from the top, dirt at the foot.
        for (let i = 0; i < 14; i++) {
          const x = rng.int(0, 127);
          const len = rng.int(20, 70);
          const w = rng.int(1, 3);
          for (let j = 0; j < len; j++) for (let q = 0; q < w; q++) if (bayer(x + q, j) < 0.6 - (j / len) * 0.5) shiftW(c, x + q, j, -0.6);
        }
        for (let y = H - 14; y < H - 4; y++) for (let x = 0; x < 128; x++) if (bayer(x, y) < (y - (H - 14)) / 14) c.shift(x, y, -0.5);
        // Cracked tiles, missing tiles (adhesive grey, a lit lower lip), a rust run under a fixing.
        for (let i = 0; i < 4; i++) crack(c, rng, rng.int(0, 127), rng.int(30, H - 20), rng.int(6, 14), rng.next() * 6, { dt: -1.5, lip: 0.75 });
        for (let i = 0; i < 3; i++) {
          const x = rng.int(0, Math.floor(128 / TW) - 1) * TW + 1;
          const y = rng.int(5, Math.floor(120 / TH)) * TH + 1;
          c.rect(x, y, TW - 1, TH - 1, grout, 1.5);
          c.hline(x, y + TH - 2, TW - 1, grout, 3);
        }
        const rx = rng.int(10, 118);
        c.set(rx, 50, rust, 1);
        for (let j = 1; j < 20; j++) if (bayer(rx, 50 + j) < 1 - j / 20) c.tint(rx, 50 + j, rust, 0);
      },
      { wrap: true },
    ),
  );
}

/** Vinyl composite floor tiles (world; NEUTRAL): 0.5 m tiles, mottled streaks turned a quarter tile to tile, seams, heel marks, a floor drain. 128 × 128. */
export function vinylFloorTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2vinyl',
      128,
      128,
      (c, k) => {
        const rng = k.rng;
        const v = k.ramp(N, { light: 0.45, sat: 0.6 });
        const drain = k.ramp(0x3a3e44, { light: 0.5 });
        for (let y = 0; y < 128; y++) {
          for (let x = 0; x < 128; x++) {
            const tx = Math.floor(x / 16);
            const ty = Math.floor(y / 16);
            const lx = x % 16;
            const ly = y % 16;
            if (lx === 0 || ly === 0) {
              c.set(x, y, v, 2.25);
              continue;
            }
            const horiz = (tx + ty) % 2 === 0;
            const a = horiz ? x : y;
            const b = horiz ? y : x;
            // Directional mottle: short streaks along the tile's grain.
            const m = hash2(Math.floor(a / 4), b >> 1, tx * 7 + ty);
            let t = hash2(tx, ty, 3) > 0.7 ? 2.75 : 3;
            if (m > 0.86) t += 0.75;
            else if (m < 0.1) t -= 0.75;
            c.set(x, y, v, t);
          }
        }
        // Heel marks (black dashes), a scraped arc where a trolley turned.
        scuffs(c, rng, 0, 0, 128, 128, 60, -1.25);
        for (let a = 0; a < 1.6; a += 0.04) c.shift(Math.round(80 + Math.cos(a) * 22), Math.round(30 + Math.sin(a) * 22), -0.75);
        // A floor drain.
        c.ellipse(40, 88, 5, 5, drain, 3);
        for (let i = -3; i <= 3; i += 2) c.hline(36, 88 + i, 9, drain, 1);
        c.ellipse(40, 88, 5, 5, drain, (u, vv) => (u * u + vv * vv > 0.75 ? (u + vv < 0 ? 4 : 2) : 3));
      },
      { wrap: true },
    ),
  );
}

/**
 * Steel floor grating with depth (world): chunky bearing bars (3 texels: lit
 * top, face, shadow) every 8 texels over a dark void with a pipe glimpsed
 * below, a cross bar every metre. Coarse on purpose: a fine real-world pitch would
 * crawl at this density. 32 × 32.
 */
export function gratingTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(
    `d2grating|${h6(hex)}`,
    32,
    32,
    (c, k) => {
      const m = k.ramp(hex, { light: 0.55, sat: 0.6 });
      const voidR = k.ramp(0x14161c, { light: 0.4 });
      // The void below: a pipe glimpsed as a soft band (low contrast: it slides past as you walk).
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, voidR, y >= 10 && y <= 19 ? (y === 11 || y === 12 ? 2.25 : 1.75) : 1.25);
      for (let x = 0; x < 32; x += 8) {
        c.vline(x, 0, 32, m, 4);
        c.vline(x + 1, 0, 32, m, 3);
        c.vline(x + 2, 0, 32, m, 1.75);
      }
      // One cross bar a metre (lit top, shadow).
      c.hline(0, 0, 32, m, 3.5);
      c.hline(0, 1, 32, m, 2.5);
      c.scatter(k.rng, 0, 0, 32, 32, 3, 0, -0.75, { shapes: 9 });
    },
    { wrap: true },
  );
}

/** Canteen chequer (world): cream / grey-teal vinyl squares, grimy grout, chipped edges, grease blots with a glint, a cracked square. 128 × 128. */
export function kitchenChequerTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2chequer',
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      // Cream and a grey-teal two value steps apart (a near-black chequer crawls in motion).
      const A = k.ramp(0xb8b4a2, { light: 0.35, sat: 0.7 });
      const B = k.ramp(0x6e7a78, { light: 0.4, sat: 0.6 });
      const grease = k.ramp(0x3a2a1a, { light: 0.6, sat: 0.8 });
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const tx = x >> 4;
          const ty = y >> 4;
          const lx = x & 15;
          const ly = y & 15;
          const r = (tx + ty) % 2 ? B : A;
          let t = hash2(tx, ty, 9) > 0.75 ? 2.75 : 3;
          // Grimy grout: 2 texels, a step down (never a hairline).
          if (lx < 2 || ly < 2) t -= 0.75;
          c.set(x, y, r, t);
        }
      }
      // Chipped corners (the other colour shows), grease blots, scuffs.
      for (let i = 0; i < 14; i++) {
        const tx = rng.int(0, 7);
        const ty = rng.int(0, 7);
        const cx = tx * 16 + (rng.chance(0.5) ? 2 : 13);
        const cy = ty * 16 + (rng.chance(0.5) ? 2 : 13);
        c.cluster(cx, cy, rng.int(0, 9), (tx + ty) % 2 ? A : B, 2);
      }
      for (let i = 0; i < 5; i++) {
        const x = rng.int(8, 120);
        const y = rng.int(8, 120);
        c.ellipse(x, y, rng.int(3, 6), rng.int(2, 4), grease, (u, v) => (u + v < -0.8 ? 4 : 1.5));
      }
      scuffs(c, rng, 0, 0, 128, 128, 40, -1);
      crack(c, rng, 3 * 16 + 4, 5 * 16 + 3, 14, 0.7, { dt: -1.75, lip: 0.75, wrapX: false });
    },
    { wrap: true },
  );
}

/** Painted concrete blockwork (world; NEUTRAL): 16 × 8 blocks in bond, recessed joints, paint runs, a grease haze band. 64 × 64. */
export function blockworkTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2block',
      64,
      64,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.45, sat: 0.6 });
        for (let y = 0; y < 64; y++) {
          const row = y >> 3;
          const off = row % 2 ? 8 : 0;
          for (let x = 0; x < 64; x++) {
            const lx = (x + off) & 15;
            const ly = y & 7;
            let t = 3 + (hash2((x + off) >> 4, row, 3) - 0.5) * 0.4;
            if (ly === 0 || lx === 0) t = 1.75;
            else if (ly === 1 || lx === 1) t += 0.75;
            else if (ly === 7) t -= 0.5;
            // Pitted block face (paint fills most of it).
            if (hash2(x, y, 41) > 0.93) t -= 0.75;
            c.set(x, y, m, t);
          }
        }
        // Paint runs.
        for (let i = 0; i < 6; i++) {
          const x = rng.int(0, 63);
          const y = rng.int(0, 40);
          const len = rng.int(4, 12);
          for (let j = 0; j < len; j++) c.shift(x, wrapI(y + j, 64), j === len - 1 ? 0.75 : 0.5);
        }
      },
      { wrap: true },
    ),
  );
}

/** Stainless cabinet run (world, v0 at the body's foot): two doors a tile (handles, lit edges), a kick plate, dents and splashes. 64 × 32. */
export function cabinetRunTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2cabinet',
      64,
      32,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.6, sat: 0.4 });
        c.rect(0, 0, 64, 32, m, 3);
        for (let y = 0; y < 32; y++) {
          let x = rng.int(0, 63);
          for (let r = 0; r < 3; r++) {
            const len = rng.int(4, 12);
            for (let j = 0; j < len; j++) c.set(wrapI(x + j, 64), y, m, rng.chance(0.5) ? 3.5 : 2.6);
            x += len + rng.int(3, 9);
          }
        }
        for (let d = 0; d < 2; d++) {
          const x = d * 32 + 1;
          c.frame(x, 3, 30, 22, m, 1.5);
          c.hline(x, 3, 30, m, 1.25);
          c.vline(x + 1, 4, 20, m, 4);
          // Handle bar.
          c.rect(x + 22, 12, 2, 8, m, 4.5);
          c.vline(x + 23, 12, 8, m, 2);
        }
        c.rect(0, 26, 64, 6, m, 1.5);
        c.hline(0, 26, 64, m, 3);
        c.ellipseShade(44, 16, 4, 3, (dd) => (dd > 0.6 ? 0.75 : -0.75));
        scuffs(c, rng, 0, 22, 64, 4, 8, -1);
      },
      { wrap: true },
    ),
  );
}

/** A range / oven / sink-cabinet front for the wall counters (fit, 1.4 × 0.9 m). 45 × 29. */
export function applianceTile(atlas: PwAtlas, kind: 'range' | 'oven' | 'sink'): PwTile {
  return atlas.tile(`d2appliance|${kind}`, 45, 29, (c, k) => {
    const rng = k.rng;
    const steel = k.ramp(0xb8bec4, { light: 0.6, sat: 0.4 });
    const enamel = k.ramp(0x1e1e22, { light: 0.55, sat: 0.4 });
    const glass = k.ramp(0x2a2018, { light: 0.5 });
    const knob = k.ramp(0xe8e4dc, { light: 0.4 });
    const red = k.ramp(0xd04020, { light: 0.45 });
    if (kind === 'sink') {
      c.rect(0, 0, 45, 29, steel, 3);
      for (const x of [1, 23]) {
        c.frame(x, 2, 21, 24, steel, 1.5);
        c.vline(x + 1, 3, 22, steel, 4);
        c.rect(x + (x === 1 ? 17 : 2), 10, 2, 7, steel, 4.5);
      }
      c.rect(0, 26, 45, 3, steel, 1.5);
      waterStain(c, 30, 20, 6, 4, { dt: -0.75, wrap: false });
      return;
    }
    c.rect(0, 0, 45, 29, enamel, 3);
    c.frame(0, 0, 45, 29, enamel, 2);
    c.hline(0, 0, 45, enamel, 4);
    if (kind === 'range') {
      // Control strip with knobs.
      c.rect(1, 1, 43, 5, steel, 3);
      c.hline(1, 1, 43, steel, 4);
      for (let i = 0; i < 6; i++) {
        const x = 4 + i * 7;
        c.ellipse(x, 3.5, 1.6, 1.6, knob, (u, v) => (u + v < -0.4 ? 4 : 2.5));
        c.set(x, 2, red, 3);
      }
      // Oven door: handle, window with a dim interior, brand plate.
      c.rect(3, 8, 39, 2, steel, 4);
      c.hline(3, 10, 39, steel, 1.5);
      c.rect(8, 12, 29, 11, glass, 1.5);
      c.frame(8, 12, 29, 11, enamel, 1);
      c.hline(9, 13, 27, glass, 3.5);
      c.rect(19, 25, 7, 2, steel, 3.5);
    } else {
      // Twin-door oven: two windows, two handles, a vent row.
      for (const x of [2, 23]) {
        c.rect(x, 3, 20, 2, steel, 4);
        c.rect(x + 2, 8, 16, 13, glass, 1.5);
        c.hline(x + 3, 9, 14, glass, 3.5);
      }
      for (let x = 4; x < 42; x += 3) c.set(x, 25, enamel, 0.5);
    }
    bloodSplat(c, rng, k, 36, 18, 1.5, { drips: 2, wrap: false });
  });
}

/** Extractor hood front (world, v0 at the hood's foot, 0.7 m): stainless, louvred grease filters, a rivet line, grease drips. 64 × 32 (rows 10…31). */
export function hoodTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2hood',
    64,
    32,
    (c, k) => {
      const rng = k.rng;
      const m = k.ramp(0xb8bec4, { light: 0.6, sat: 0.4 });
      const grease = k.ramp(0x4a3a20, { light: 0.5 });
      c.rect(0, 0, 64, 32, m, 3);
      c.hline(0, 10, 64, m, 4.5);
      c.hline(0, 11, 64, m, 3.5);
      for (let x = 2; x < 64; x += 6) c.set(x, 12, m, 1.5);
      // Filters: framed panels with diagonal louvres.
      for (let p = 0; p < 2; p++) {
        const x0 = p * 32 + 2;
        c.frame(x0, 15, 28, 13, m, 1.5);
        for (let y = 16; y < 27; y++) for (let x = x0 + 1; x < x0 + 27; x++) c.set(x, y, m, (x + y) % 3 === 0 ? 1.5 : (x + y) % 3 === 1 ? 3.75 : 2.75);
      }
      c.hline(0, 30, 64, m, 2);
      c.hline(0, 31, 64, m, 1);
      // Grease drips from the lower lip.
      for (let i = 0; i < 6; i++) {
        const x = rng.int(0, 63);
        const len = rng.int(2, 6);
        for (let j = 0; j < len; j++) c.set(x, 25 + j, grease, j === len - 1 ? 1 : 2);
      }
    },
    { wrap: true },
  );
}

/** Raised access floor (world): 0.5 m panels, perforated ones (a dot grid) between solid ones, bevelled edges, a cable cutout with brushes, scuffs. 128 × 128 (NEUTRAL). */
export function raisedFloorTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2raised',
      128,
      128,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.5, sat: 0.5 });
        for (let y = 0; y < 128; y++) {
          for (let x = 0; x < 128; x++) {
            const px = x >> 4;
            const py = y >> 4;
            const lx = x & 15;
            const ly = y & 15;
            const perf = (px * 3 + py * 5) % 4 === 0;
            let t = 3;
            if (lx === 0 || ly === 0) t = 1.25;
            else if (lx === 1 || ly === 1) t = 4;
            else if (lx === 15 || ly === 15) t = 2.25;
            else if (perf && lx > 2 && ly > 2 && lx < 14 && ly < 14 && lx % 2 === 0 && ly % 2 === 0) t = 1;
            c.set(x, y, m, t);
          }
        }
        // A cable cutout with brush strips.
        c.rect(36, 70, 12, 5, m, 0.5);
        for (let x = 36; x < 48; x++) c.set(x, (x % 2) + 71, m, 2);
        // A lifted-panel suction mark and scuffs.
        c.ellipseShade(88, 24, 3, 3, (d) => (d > 0.7 ? -1 : 0));
        scuffs(c, rng, 0, 0, 128, 128, 30, -0.75);
      },
      { wrap: true },
    ),
  );
}

/** Machine-room wall panels (world, v from the floor; NEUTRAL): 1 m panels, bolts, a conduit with a junction box, a warning sticker. 128 × 128. */
export function serverWallTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile(
      'd2serverwall',
      128,
      128,
      (c, k) => {
        const rng = k.rng;
        const m = k.ramp(N, { light: 0.5, sat: 0.5 });
        const yel = k.ramp(0xe0b020, { light: 0.45 });
        const ink = k.ramp(0x1a1a1e, { light: 0.4 });
        for (let y = 0; y < 128; y++) {
          for (let x = 0; x < 128; x++) {
            const lx = x & 31;
            let t = 3 + (hash2(x >> 5, 0, 3) - 0.5) * 0.4;
            if (lx === 0) t = 1.25;
            else if (lx === 1) t = 4;
            else if (lx === 31) t = 2.25;
            if (y === 32) t = 1.25;
            else if (y === 33) t = 3.75;
            c.set(x, y, m, t);
          }
        }
        for (let x = 4; x < 128; x += 32) for (const y of [36, 124]) rivet(c, x, y, m, 3);
        // Conduit (vertical) with a junction box.
        for (let y = 0; y < 128; y++) {
          c.set(70, y, m, 4);
          c.set(71, y, m, 3);
          c.set(72, y, m, 1.5);
          if (y % 24 === 0) c.hline(69, y, 5, m, 2);
        }
        plate(c, 64, 60, 16, 14, m, { tone: 3 });
        c.rect(70, 74, 3, 2, m, 1);
        // Warning sticker.
        c.poly([100, 58, 106, 48, 112, 58], yel, 3);
        c.vline(106, 51, 4, ink, 1);
        c.set(106, 56, ink, 1);
        scuffs(c, rng, 0, 110, 128, 16, 12, -0.75);
      },
      { wrap: true },
    ),
  );
}

/**
 * A server rack front (fit on the rack row's face, 5.1 × 2.3 m): five columns
 * of six units on square-holed rails — vented bezels, drive bays, pull
 * handles, labels, dark LED windows where the live LEDs sit, a pulled unit,
 * patch cables draped across. 163 × 74.
 */
export function rackFrontTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2rack', 163, 74, (c, k) => {
    const rng = k.rng;
    const frame = k.ramp(0x24282e, { light: 0.5, sat: 0.5 });
    const bezel = k.ramp(0x48505a, { light: 0.55, sat: 0.6 });
    const label = k.ramp(0xe8e8e0, { light: 0.3 });
    const voidR = k.ramp(0x0a0c10, { light: 0.4 });
    const cables = [0x2a6ad0, 0xe0c030, 0xd03030, 0x30b050].map((h) => k.ramp(h, { light: 0.45 }));
    c.rect(0, 0, 163, 74, frame, 2);
    const colW = 163 / 5;
    for (let i = 0; i < 5; i++) {
      const x0 = Math.round(i * colW);
      // Rails with square holes.
      for (const rx of [x0, x0 + Math.round(colW) - 3]) {
        c.rect(rx, 0, 3, 74, frame, 3);
        c.vline(rx, 0, 74, frame, 4);
        for (let y = 2; y < 74; y += 3) c.set(rx + 1, y, voidR, 1);
      }
      for (let u = 0; u < 6; u++) {
        // Unit centre (texels above the floor) = (0.3 + u·0.33) m.
        const cyUp = (0.3 + u * 0.33) * 32;
        const top = Math.round(74 - cyUp - 4);
        const ux = x0 + 4;
        const uw = Math.round(colW) - 8;
        if (hash2(i, u, 5) > 0.92) {
          // A pulled unit: a dark slot with cable tails.
          c.rect(ux, top, uw, 8, voidR, 1);
          c.line(ux + 4, top + 2, ux + 8, top + 7, cables[(i + u) % 4], 3);
          continue;
        }
        c.rect(ux, top, uw, 8, bezel, 3);
        c.hline(ux, top, uw, bezel, 4);
        c.hline(ux, top + 7, uw, bezel, 1.5);
        // Vent slots, drive bays, the LED window (left), a label, pull handles.
        for (let x = ux + 14; x < ux + uw - 4; x += 2) c.vline(x, top + 2, 4, bezel, 1.5);
        c.rect(ux + 5, top + 1, 7, 3, voidR, 1);
        c.rect(ux + 1, top + 2, 2, 4, bezel, 4.5);
        c.rect(ux + uw - 3, top + 2, 2, 4, bezel, 4.5);
        if (hash2(i, u, 9) > 0.5) c.hline(ux + 5, top + 5, 6, label, 3);
      }
    }
    // Patch cables draped across columns.
    for (let p = 0; p < 4; p++) {
      const r = cables[p % 4];
      const x0 = rng.int(10, 70);
      const x1 = x0 + rng.int(30, 80);
      const y0 = rng.int(8, 50);
      for (let x = x0; x < Math.min(162, x1); x++) {
        const t = (x - x0) / (x1 - x0);
        c.set(x, Math.round(y0 + Math.sin(t * Math.PI) * 6), r, 3);
      }
    }
    c.scatter(rng, 0, 0, 163, 74, 20, 0, -0.5, { shapes: 3 });
  });
}

/** A rack row's end panel (fit, 0.95 × 2.3 m): steel with a vent grille, cable slots, a label plate, a warning sticker. 30 × 74. */
export function rackEndTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2rackend', 30, 74, (c, k) => {
    const m = k.ramp(0x4a505a, { light: 0.55, sat: 0.6 });
    const yel = k.ramp(0xe0b020, { light: 0.45 });
    const ink = k.ramp(0x1a1a1e, { light: 0.4 });
    c.rect(0, 0, 30, 74, m, 3);
    c.frame(0, 0, 30, 74, m, 1.5);
    c.vline(1, 1, 72, m, 4);
    for (let y = 4; y < 12; y += 2) c.hline(5, y, 20, m, 1.5);
    c.rect(4, 15, 22, 6, m, 2);
    for (let y = 40; y < 64; y += 5) c.rect(10, y, 10, 2, m, 1);
    c.poly([20, 70, 24, 63, 28, 70], yel, 3);
    c.set(24, 66, ink, 1);
    for (const [x, y] of [[2, 2], [26, 2], [2, 70], [26, 70]]) rivet(c, x, y, m, 3);
  });
}

/** The B-2 bulkhead (fit, 3 × 2.8 m): horizontal steel slats, hazard chevrons at the foot, a stencilled B-2, rivets, dents, soot. 96 × 90. */
export function bulkheadTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2bulkhead', 96, 90, (c, k) => {
    const rng = k.rng;
    const m = k.ramp(0x5e646c, { light: 0.55, sat: 0.6 });
    const yel = k.ramp(0xe0b020, { light: 0.45 });
    const blk = k.ramp(0x1a1a1e, { light: 0.4 });
    const ink = k.ramp(0xe8e0c0, { light: 0.4 });
    for (let y = 0; y < 90; y++) {
      const ly = y % 21;
      for (let x = 0; x < 96; x++) c.set(x, y, m, ly === 0 ? 1.25 : ly === 1 ? 4 : ly === 20 ? 2 : ly < 5 ? 3.25 : 3);
    }
    for (let y = 0; y < 90; y += 21) for (let x = 3; x < 96; x += 8) rivet(c, x, y + 3, m, 3);
    for (let y = 78; y < 90; y++) for (let x = 0; x < 96; x++) c.set(x, y, Math.floor((x + y) / 6) % 2 ? blk : yel, y === 78 ? 4 : 3);
    stencil(c, 'B-2', 24, 30, FONT_5x7, ink, { scale: 6, tone: 3.5, rng, runs: 3 });
    c.ellipseShade(70, 20, 7, 5, (d) => (d > 0.6 ? 0.75 : -1));
    c.ellipseShade(20, 60, 5, 4, (d) => (d > 0.6 ? 0.75 : -1));
    for (let y = 0; y < 30; y++) for (let x = 0; x < 96; x++) if (bayer(x, y) < (30 - y) / 60) c.shift(x, y, -0.75);
    bulletHole(c, rng, 60, 50);
    bulletHole(c, rng, 66, 56, { cracks: false });
  });
}

/** A biohazard plate (fit on the tank skirts' hazard boxes): stripes, the symbol, BIOHAZARD. 30 × 10. */
export function biohazardTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2biohazard', 30, 10, (c, k) => {
    const yel = k.ramp(0xf0d020, { light: 0.45 });
    const blk = k.ramp(0x1a1a1e, { light: 0.4 });
    c.rect(0, 0, 30, 10, yel, 3);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 30; x++) if ((x < 2 || x > 27 || y < 1 || y > 8) && Math.floor((x + y) / 2) % 2) c.set(x, y, blk, 2);
    c.ellipse(6, 5, 2.5, 2.5, blk, 2);
    c.set(6, 5, yel, 3);
    drawText(c, 'BIOHAZ', 10, 3, FONT_3x5, blk, 2);
  });
}

/**
 * The genome display (GLOW, fit on the wall above the consoles): a dark screen
 * with a coloured bar graph, grid lines, a scrolling ACGT read-out and a helix.
 * 128 × 48 (4 × 1.5 m).
 */
export function sequencerTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2sequencer', 128, 48, (c, k) => {
    const rng = k.rng;
    const bg = k.ramp(0x0a1418, { light: 0.4 });
    const grid = k.ramp(0x1a4a40, { light: 0.4 });
    const cols = [0xff5050, 0x50ff80, 0x5090ff, 0xffd040].map((h) => k.ramp(h, { light: 0.6, sat: 1.1 }));
    const txt = k.ramp(0x60ffb0, { light: 0.6 });
    const frame = k.ramp(0x3a3e44, { light: 0.5 });
    c.rect(0, 0, 128, 48, frame, 3);
    c.rect(2, 2, 124, 44, bg, 2, PWF.GLOW);
    for (let x = 4; x < 124; x += 8) c.vline(x, 3, 42, grid, 2, PWF.GLOW);
    for (let y = 6; y < 46; y += 8) c.hline(3, y, 122, grid, 2, PWF.GLOW);
    for (let i = 0; i < 28; i++) {
      const x = 6 + i * 3;
      const h = 4 + Math.round(Math.abs(Math.sin(i * 1.7) + Math.cos(i * 0.6)) * 9);
      c.rect(x, 30 - h, 2, h, cols[i % 4], 4, PWF.GLOW);
      c.set(x, 30 - h, cols[i % 4], 5, PWF.GLOW);
    }
    let line = '';
    for (let i = 0; i < 26; i++) line += 'ACGT'[rng.int(0, 3)];
    drawText(c, line.slice(0, 22), 6, 34, FONT_3x5, txt, 4, { flag: PWF.GLOW });
    drawText(c, line.slice(4, 26), 6, 40, FONT_3x5, txt, 3, { flag: PWF.GLOW });
    // Helix on the right.
    for (let y = 4; y < 44; y++) {
      const a = y * 0.35;
      const x1 = Math.round(108 + Math.sin(a) * 7);
      const x2 = Math.round(108 - Math.sin(a) * 7);
      c.set(x1, y, cols[0], Math.cos(a) > 0 ? 5 : 3, PWF.GLOW);
      c.set(x2, y, cols[1], Math.cos(a) > 0 ? 3 : 5, PWF.GLOW);
      if (y % 3 === 0) c.line(Math.min(x1, x2) + 1, y, Math.max(x1, x2) - 1, y, grid, 3, PWF.GLOW);
    }
  });
}

/** A monitor's picture (GLOW, cut out round the screen glass): helix + read-out lines. 22 × 13. */
export function helixScreenTile(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`d2helixscreen|${v % 3}`, 22, 13, (c, k) => {
    const pink = k.ramp(0xff60a0, { light: 0.6, sat: 1.1 });
    const grn = k.ramp(0x60ffb0, { light: 0.6, sat: 1.1 });
    const bg = k.ramp(0x0a1820, { light: 0.4 });
    c.rect(0, 0, 22, 13, bg, 2, PWF.GLOW);
    for (let x = 1; x < 21; x++) {
      const a = x * 0.6 + v;
      c.set(x, Math.round(6 + Math.sin(a) * 4), pink, 4, PWF.GLOW);
      c.set(x, Math.round(6 - Math.sin(a) * 4), grn, 4, PWF.GLOW);
    }
    for (let y = 2; y < 12; y += 3) c.hline(15, y, 5, grn, 2, PWF.GLOW);
  });
}

/** Incubator nest sand / straw (world): pale sand with straw wisps and egg dents. 32 × 32. */
export function nestTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2nest',
    32,
    32,
    (c, k) => {
      const rng = k.rng;
      const s = k.ramp(0xd8c8a0, { light: 0.4 });
      const straw = k.ramp(0xc8a040, { light: 0.45 });
      c.rect(0, 0, 32, 32, s, 3);
      for (let i = 0; i < 18; i++) {
        const x = rng.int(0, 31);
        const y = rng.int(0, 31);
        const len = rng.int(3, 7);
        const dy = rng.int(-2, 2);
        c.line(x, y, x + len, y + dy, straw, rng.chance(0.5) ? 4 : 3);
      }
      c.scatter(rng, 0, 0, 32, 32, 20, 0, -0.75, { shapes: 3 });
    },
    { wrap: true },
  );
}

/** A canteen wall notice cluster (cut out): WASH HANDS, a menu board, NO SMOKING. 48 × 24. */
export function kitchenNoticesTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2kitchennotes', 48, 24, (c, k) => {
    const p = k.ramp(0xe8e4d8, { light: 0.3, sat: 0.6 });
    const red = k.ramp(0xc02020, { light: 0.45 });
    const ink = k.ramp(0x1a1a20, { light: 0.4 });
    const board = k.ramp(0x1e2a22, { light: 0.4 });
    plate(c, 0, 2, 18, 12, p, { tone: 3 });
    c.rect(1, 3, 16, 3, red, 3);
    drawText(c, 'WASH', 2, 7, FONT_3x5, ink, 2);
    plate(c, 20, 0, 18, 22, board, { tone: 3 });
    for (let y = 3; y < 20; y += 3) c.hline(22, y, k.rng.int(8, 14), p, 3);
    plate(c, 40, 6, 8, 8, p, { tone: 3 });
    c.ellipse(44, 10, 3, 3, red, 3);
    c.line(42, 12, 46, 8, red, 2);
    void textWidth;
  });
}

/** Shared ref (keeps helpers used in typed builds). */
export function _labRefs(c: PwCanvas, k: PwKit) {
  void c;
  void k;
}
