import type { PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD, textWidth } from './font';
import { hash2 } from './surfaces';
import { dith, fill, G, h6, rivet, rustRun, sootBloom, wscatter } from './z3kit';
import { z3Ink, z3SnapGlyph } from './z3levels';

/**
 * HIGHWAY TO HELL (z3) big vehicles for ART: PIXEL WORLD — the jackknifed
 * semi and its FRESH FOODS reefer, the overturned fuel tanker, the burnt
 * school bus on the overpass, the army truck at the bridge barricade and the
 * tank at the SAFE ZONE: their own boxes and cylinders kept, every face a
 * painted module (doors, windows, grilles, ribs, rivets, livery, stencils,
 * rust, soot, road grime).
 */

const sky = (k: PwKit) => k.ramp(0xb87278, { light: 0.55, sat: 0.9 });
const cabin = (k: PwKit) => k.ramp(0x2a2232, { light: 0.4 });

/** A window: sky reflection dithering into the dark cabin, black rubber frame. */
function windowPane(c: PwCanvas, k: PwKit, x: number, y: number, w: number, h: number, burnt = false) {
  const trim = k.ramp(0x16161a, { light: 0.4 });
  const s = sky(k);
  const cb = cabin(k);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const edge = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1;
      if (edge) c.set(x + xx, y + yy, trim, 1.6);
      else if (burnt) c.set(x + xx, y + yy, trim, hash2(xx, yy, 3) > 0.85 ? 2 : 0.4);
      else c.set(x + xx, y + yy, dith(x + xx, y + yy, 1 - (yy / h) * 1.5) ? s : cb, (xx + yy * 2) % 23 < 2 ? 5 : yy < h * 0.25 ? 4 : 3);
    }
  }
}

/** Semi tractor cab side (2.6 × 2.6 m → 84 × 84): door + window, steps, grab handle, mirror arm, stencils. */
export function z3SemiCabSide(atlas: PwAtlas, hex: number, burnt: boolean): PwTile {
  return atlas.tile(`z3semicab|${h6(hex)}|${burnt ? 1 : 0}`, 84, 84, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(burnt ? 0x2a2226 : hex, { light: 0.5, sat: 0.95 });
    const black = k.ramp(0x18181c, { light: 0.4 });
    const chrome = k.ramp(burnt ? 0x5a3a2a : 0xb8bac2, { light: 0.6, sat: 0.4 });
    const white = k.ramp(0xe8e4dc, { light: 0.4 });
    const rust = k.ramp(0x7a3c1c, { light: 0.45 });
    fill(c, p, 3);
    // Panel shading: lit roof edge, a belt crease, the lower skirt darker.
    c.hline(0, 0, 84, p, 4.4);
    c.hline(0, 1, 84, p, 3.8);
    c.hline(0, 40, 84, p, 4.2);
    c.hline(0, 41, 84, p, 2.2);
    c.rect(0, 70, 84, 14, p, 2.4);
    // Door (front half): seams, window, handle, steps below.
    const dx0 = 8;
    const dx1 = 44;
    c.vline(dx0, 4, 66, black, 1.4);
    c.vline(dx1, 4, 66, black, 1.4);
    c.hline(dx0, 4, dx1 - dx0, black, 1.4);
    windowPane(c, k, dx0 + 3, 7, dx1 - dx0 - 6, 26, burnt);
    c.hline(dx1 - 9, 44, 6, chrome, 4.4);
    c.hline(dx1 - 9, 45, 6, black, 1.6);
    for (const sy of [72, 78]) {
      c.rect(dx0 + 4, sy, 26, 3, chrome, 3.4);
      c.hline(dx0 + 4, sy, 26, chrome, 4.6);
    }
    // Grab handle by the door, sleeper vent at the back.
    c.vline(dx0 - 4, 30, 30, chrome, 4.4);
    c.vline(dx0 - 3, 30, 30, chrome, 2.4);
    for (let y = 14; y < 30; y += 3) c.hline(56, y, 20, black, 1.6);
    // DOT number stencil.
    drawText(c, 'USDOT 7134', 50, 52, FONT_3x5, burnt ? black : white, 3);
    if (burnt) {
      sootBloom(c, 42, 84, 50, 70, 2.4);
      wscatter(c, rng, 0, 0, 84, 84, 50, rust, 2.4, { shapes: 5 });
    } else {
      for (let i = 0; i < 5; i++) rustRun(c, rng, rng.int(2, 80), rng.int(42, 66), rng.int(6, 14), rust);
      wscatter(c, rng, 0, 64, 84, 20, 30, k.ramp(0x6e6050, { light: 0.4 }), 2.6, { shapes: 3 });
    }
  });
}

/** Cab back / roof (2.5 × 2.6 m → 80 × 84): the rear window, panel seams, grab rails, a roof vent, grime. */
export function z3SemiCabBack(atlas: PwAtlas, hex: number, burnt: boolean): PwTile {
  return atlas.tile(`z3semiback|${h6(hex)}|${burnt ? 1 : 0}`, 80, 84, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(burnt ? 0x2a2226 : hex, { light: 0.5, sat: 0.95 });
    const black = k.ramp(0x18181c, { light: 0.4 });
    const chrome = k.ramp(burnt ? 0x5a3a2a : 0xb8bac2, { light: 0.6, sat: 0.4 });
    const rust = k.ramp(0x7a3c1c, { light: 0.45 });
    fill(c, p, 3);
    c.frame(0, 0, 80, 84, p, 2);
    c.hline(1, 1, 78, p, 4.2);
    for (const x of [26, 54]) c.vline(x, 2, 80, p, 2.2);
    windowPane(c, k, 28, 12, 24, 14, burnt);
    for (const x of [10, 66]) {
      c.vline(x, 30, 40, chrome, 4.4);
      c.vline(x + 1, 30, 40, chrome, 2.2);
    }
    for (let y = 50; y < 60; y += 3) c.hline(32, y, 16, black, 1.6);
    for (let i = 0; i < 8; i++) rustRun(c, rng, rng.int(2, 78), rng.int(30, 70), rng.int(6, 14), rust);
    if (burnt) sootBloom(c, 40, 84, 44, 80, 2.4);
  });
}

/** Roof air deflector (module 64 × 72 over the 2.1 m fairing): paint with a lit lip, a livery stripe, a riveted rim, bug splats and grime. */
export function z3Deflector(atlas: PwAtlas, hex: number, burnt: boolean): PwTile {
  return atlas.tile(`z3deflector|${h6(hex)}|${burnt ? 1 : 0}`, 64, 72, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(burnt ? 0x6e5c56 : hex, { light: 0.5, sat: 0.95 });
    const stripe = k.ramp(burnt ? 0x3a3034 : 0xe8e0c8, { light: 0.45 });
    const stripe2 = k.ramp(burnt ? 0x3a3034 : 0xe0a020, { light: 0.45 });
    const grime = k.ramp(0x2e2628, { light: 0.4 });
    fill(c, p, 3);
    // The lip at the front (top of the module: the high end), the shoulder shading down the sides.
    c.rect(0, 0, 64, 3, p, 4.4);
    c.hline(0, 3, 64, p, 1.8);
    for (let y = 4; y < 72; y++) {
      c.set(0, y, p, 2);
      c.set(1, y, p, 2.4);
      c.set(62, y, p, 3.6);
      c.set(63, y, p, 2.2);
    }
    // Livery: two bands sweeping across.
    for (let x = 2; x < 62; x++) {
      const y0 = 26 + Math.round((x - 32) * 0.12);
      for (let t = 0; t < 4; t++) c.set(x, y0 + t, stripe, t === 0 ? 4 : 3.2);
      for (let t = 0; t < 2; t++) c.set(x, y0 + 6 + t, stripe2, 3.4);
    }
    for (let y = 6; y < 70; y += 8) ((rivet(c, 3, y, p, 3), rivet(c, 60, y, p, 3)));
    // Bug splats and road grime toward the lip, a rust run.
    for (let i = 0; i < 14; i++) c.set(rng.int(4, 59), rng.int(4, 18), grime, 1.6);
    for (let x = 2; x < 62; x++) for (let y = 60; y < 72; y++) if (dith(x, y, (y - 60) / 14)) c.set(x, y, grime, 2);
    if (burnt) sootBloom(c, 32, 72, 30, 70, 2);
  });
}

/** Cab marker lamp (module 8 × 6): an amber lens (glow) in a black bezel. */
export function z3MarkerLamp(atlas: PwAtlas): PwTile {
  return atlas.tile('z3marker', 8, 6, (c, k) => {
    const black = k.ramp(0x18181c, { light: 0.4 });
    const amber = k.ramp(0xffa030, { light: 0.55 });
    fill(c, black, 1.6);
    c.rect(1, 1, 6, 4, amber, 4, G);
    c.hline(2, 1, 4, amber, 5, G);
  });
}

/** Hood side (1.6 × 1.2 m → 52 × 40): louvres, a fender over the front wheel. */
export function z3SemiHoodSide(atlas: PwAtlas, hex: number, burnt: boolean): PwTile {
  return atlas.tile(`z3semihood|${h6(hex)}|${burnt ? 1 : 0}`, 52, 40, (c, k) => {
    const p = k.ramp(burnt ? 0x2a2226 : hex, { light: 0.5, sat: 0.95 });
    const black = k.ramp(0x18181c, { light: 0.4 });
    fill(c, p, 3);
    c.hline(0, 0, 52, p, 4.4);
    for (let y = 8; y < 24; y += 3) c.hline(8, y, 26, black, 1.6);
    c.rect(0, 30, 52, 10, p, 2.4);
    for (let x = 4; x < 48; x++) {
      const t = (x - 26) / 22;
      const y = Math.round(40 - Math.sqrt(Math.max(0, 1 - t * t)) * 12);
      for (let yy = y; yy < 40; yy++) c.set(x, yy, black, 0.6);
    }
  });
}

/** Big chrome grille (1.6 × 1.0 → 52 × 32): vertical bars, an emblem, headlamps either side. */
export function z3SemiGrille(atlas: PwAtlas, burnt: boolean): PwTile {
  return atlas.tile(`z3semigrille|${burnt ? 1 : 0}`, 52, 32, (c, k) => {
    const chrome = k.ramp(burnt ? 0x5a3a2a : 0xb8bac2, { light: 0.6, sat: 0.4 });
    const black = k.ramp(0x18181c, { light: 0.4 });
    fill(c, chrome, 3);
    c.frame(0, 0, 52, 32, chrome, 4.6);
    for (let x = 3; x < 49; x++) for (let y = 3; y < 29; y++) c.set(x, y, (x & 1) ? black : chrome, (x & 1) ? 0.8 : y < 6 ? 4.4 : 3);
    c.rect(22, 12, 8, 6, chrome, 4.4);
    c.rect(24, 14, 4, 2, k.ramp(0xc8202a, { light: 0.4 }), 3);
  });
}

/** Reefer trailer side (12.8 × 2.9 m → 416 × 96): corrugated panels, livery, rust, grime, DOT tape, marker lamps. */
export function z3TrailerSide(atlas: PwAtlas, hex: number, text: string): PwTile {
  return atlas.tile(`z3trailer|${h6(hex)}|${text}`, 416, 96, (c, k) => {
    const rng = k.rng;
    const W = c.w;
    const H = c.h;
    const p = k.ramp(hex, { light: 0.5, sat: 0.8 });
    const red = k.ramp(0xc02020, { light: 0.45, sat: 1.1 });
    const green = k.ramp(0x3a8a3a, { light: 0.45 });
    const white = k.ramp(0xeeeae2, { light: 0.4 });
    const black = k.ramp(0x18181c, { light: 0.4 });
    const amber = k.ramp(0xe08a20, { light: 0.5 });
    const rust = k.ramp(0x7a3c1c, { light: 0.45 });
    const grime = k.ramp(0x5e5248, { light: 0.4 });
    fill(c, p, 3);
    // Vertical ribs (posts) every 0.8 m with rivet lines, top / bottom rails.
    for (let x = 0; x < W; x += 26) {
      c.vline(x, 0, H, p, 4.2);
      c.vline(x + 1, 0, H, p, 3.6);
      c.vline(x + 3, 0, H, p, 2.2);
      for (let y = 6; y < H - 6; y += 8) rivet(c, x + 1, y, p, 3);
    }
    c.rect(0, 0, W, 5, p, 3.6);
    c.hline(0, 0, W, p, 4.6);
    c.hline(0, 5, W, p, 2);
    c.rect(0, H - 8, W, 8, p, 2.4);
    c.hline(0, H - 8, W, p, 4);
    // Livery: a red swoosh band and the name in big bold letters with a drop shadow, a tomato logo.
    for (let x = 0; x < W; x++) {
      const y = Math.round(58 + Math.sin(x * 0.012) * 6);
      for (let j = 0; j < 7; j++) c.set(x, y + j, j < 2 ? green : red, j === 2 ? 4 : 3);
    }
    const scale = 3;
    const tw = textWidth(text, FONT_BOLD, { scale });
    drawText(c, text, Math.round((W - tw) / 2) + 20, 14, FONT_BOLD, red, 3, { scale, shadow: { ramp: black, tone: 2 }, shadowD: 2, shadeFn: (_u, v) => (v < 0.25 ? 1 : 0) });
    // Tomato logo.
    const lx = Math.round((W - tw) / 2) - 18;
    for (let y = -11; y <= 11; y++) for (let x = -12; x <= 12; x++) {
      const d = (x * x) / 144 + (y * y) / 121;
      if (d > 1) continue;
      c.set(lx + x, 32 + y, red, x + y < -8 ? 5 : d > 0.7 ? 2.4 : 3.4);
    }
    for (let x = -4; x <= 4; x++) c.set(lx + x, 21 - (Math.abs(x) > 2 ? 0 : 1), green, 4);
    drawText(c, 'FARM FRESH SINCE 1961', Math.round((W - tw) / 2) + 24, 46, FONT_3x5, black, 2);
    // DOT conspicuity tape along the bottom rail (red / white), side marker lamps.
    for (let x = 0; x < W; x++) c.set(x, H - 6, Math.floor(x / 10) % 2 ? red : white, 3.6);
    for (const x of [10, 208, 404]) c.rect(x, 8, 3, 2, amber, 5, G);
    // Rust streaks from the rivets, road grime thrown up the lower third, a dent.
    for (let i = 0; i < 26; i++) rustRun(c, rng, rng.int(0, W - 1), rng.int(8, 60), rng.int(8, 22), rust);
    for (let x = 0; x < W; x++) {
      const reach = 18 + Math.round(hash2(x >> 4, 0, 5) * 12);
      for (let y = H - reach; y < H - 8; y++) if (dith(x, y, ((y - (H - reach)) / reach) * 1.2)) c.tint(x, y, grime, -0.3);
    }
    wscatter(c, rng, 0, 0, W, H, 120, 0, -0.8, { shapes: 3 });
  });
}

/** Trailer back (2.6 × 2.9 → 84 × 96): swing doors, lock rods, handles, the ICC bumper bar, lights, plate. */
export function z3TrailerBack(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z3trailerback|${h6(hex)}`, 84, 96, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(hex, { light: 0.5, sat: 0.8 });
    const steel = k.ramp(0x8a8c92, { light: 0.55, sat: 0.4 });
    const black = k.ramp(0x18181c, { light: 0.4 });
    const red = k.ramp(0xd02018, { light: 0.55 });
    const rust = k.ramp(0x7a3c1c, { light: 0.45 });
    fill(c, p, 3);
    c.frame(0, 0, 84, 96, steel, 3.4);
    c.vline(42, 2, 84, black, 1);
    for (const x of [12, 28, 56, 72]) {
      c.vline(x, 4, 80, steel, 4.2);
      c.vline(x + 1, 4, 80, steel, 2.2);
      for (const y of [20, 64]) c.rect(x - 1, y, 4, 3, steel, 3.6);
    }
    c.rect(36, 50, 4, 8, steel, 4);
    c.rect(44, 50, 4, 8, steel, 4);
    for (const x of [4, 72]) c.rect(x, 86, 8, 4, red, 4);
    c.rect(4, 90, 76, 4, steel, 3);
    c.hline(4, 90, 76, steel, 4.4);
    c.rect(36, 82, 12, 6, k.ramp(0xe8e4d0, { light: 0.4 }), 3);
    for (let i = 0; i < 10; i++) rustRun(c, rng, rng.int(2, 82), rng.int(4, 60), rng.int(6, 18), rust);
  });
}

/** Tanker shell (wrap 128 × 64 round the barrel): polished steel bands (sky above, road below), weld seams, rivets, grime. */
export function z3TankShell(atlas: PwAtlas): PwTile {
  return atlas.tile('z3tankshell', 256, 64, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(0xd4d8dc, { light: 0.6, dark: 0.4, sat: 0.6 });
    const warm = k.ramp(0xe0a088, { light: 0.6, sat: 0.7 });
    const grime = k.ramp(0x5e5248, { light: 0.4 });
    fill(c, s, 3);
    // Around u: the barrel's reflection bands (u 0 = the top): the dusk sky warm on top, dark road below.
    for (let x = 0; x < 256; x++) {
      const a = x / 256;
      const t = a < 0.08 || a > 0.92 ? 4.6 : a < 0.16 || a > 0.84 ? 4 : a < 0.3 || a > 0.7 ? 3.2 : a < 0.4 || a > 0.6 ? 2.4 : 1.8;
      for (let y = 0; y < 64; y++) {
        const i = y * 256 + x;
        c.tone[i] = t;
        if ((a < 0.06 || a > 0.94) && (y + x) % 9 < 3) c.ramp[i] = warm;
      }
    }
    // Weld seams round the barrel (along u) every 2 m; a rivet line along the side.
    for (const y of [0, 63]) for (let x = 0; x < 256; x++) c.set(x, y, s, c.toneAt(x, y) - 1);
    for (let y = 4; y < 64; y += 8) {
      rivet(c, 64, y, s, 3);
      rivet(c, 192, y, s, 3);
    }
    // Road grime and fuel stains on the underside, a dent.
    for (let x = 96; x < 160; x++) for (let y = 0; y < 64; y++) if (hash2(x >> 1, y >> 2, 5) > 0.55) c.tint(x, y, grime, -0.4);
    for (let y = 20; y < 34; y++) for (let x = 30; x < 44; x++) if ((x - 37) ** 2 + (y - 27) ** 2 < 40) c.shift(x, y, x < 37 ? -1 : 0.6);
    wscatter(c, rng, 0, 0, 256, 64, 60, 0, -0.8, { shapes: 2 });
  }, { wrap: true });
}

/** FLAMMABLE band plate (6 × 0.42 m → 192 × 16): red with white bold letters, scuffed. */
export function z3FlammableBand(atlas: PwAtlas): PwTile {
  return atlas.tile('z3flammable', 192, 16, (c, k) => {
    const red = k.ramp(0xd02018, { light: 0.5, sat: 1.1 });
    const white = k.ramp(0xf4f0e8, { light: 0.4 });
    fill(c, red, 3);
    c.hline(0, 0, 192, red, 4.2);
    c.hline(0, 15, 192, red, 1.8);
    // Letters filling the band (legible from the road at a distance).
    const tw = textWidth('FLAMMABLE', FONT_BOLD, { scale: 2, spacing: 2 });
    const [gx, gy] = z3SnapGlyph(Math.round((192 - tw) / 2), 2, 2, 16);
    drawText(c, 'FLAMMABLE', gx, gy, FONT_BOLD, white, 4, { scale: 2, spacing: 2 });
    wscatter(c, k.rng, 0, 0, 192, 16, 30, 0, -1, { shapes: 2 });
    z3Ink('z3flammable', c, [white]);
  });
}

/** Hazmat placard diamond (cut out, 24 × 24): red with a flame and "3". */
export function z3Placard(atlas: PwAtlas): PwTile {
  // Laid on the classic placard box, which is already turned 45° (the diamond): the tile fills the
  // whole square — white rim, red field, a white flame mark at the centre, a scuff.
  return atlas.tile('z3placard', 24, 24, (c, k) => {
    const red = k.ramp(0xe02a1a, { light: 0.5 });
    const white = k.ramp(0xf4f0e8, { light: 0.4 });
    fill(c, white, 4);
    c.rect(2, 2, 20, 20, red, 3);
    c.hline(2, 2, 20, red, 3.6);
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const d = Math.abs(x - 11.5) + Math.abs(y - 11.5);
        if (Math.hypot(x - 11.5, y - 11.5) < 4.2 + hash2(x, y, 3) * 0.8) c.set(x, y, white, d < 3 ? 4.4 : 4);
      }
    }
    for (let i = 0; i < 6; i++) c.set(4 + i, 18 - (i >> 1), red, 2.2);
  });
}

/** Army olive panel (wrap 64 × 64): drab paint, rivet rows, chips to primer, dust. */
export function z3OliveTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3olive', 64, 64, (c, k) => {
    const rng = k.rng;
    const o = k.ramp(0x56663a, { light: 0.45, sat: 0.9 });
    const dust = k.ramp(0x8a7a5a, { light: 0.4 });
    fill(c, o, 3);
    for (let y = 0; y < 64; y += 32) c.hline(0, y, 64, o, 1.8);
    for (let x = 4; x < 64; x += 8) {
      rivet(c, x, 3, o, 3);
      rivet(c, x, 35, o, 3);
    }
    wscatter(c, rng, 0, 0, 64, 64, 50, 0, -0.8, { shapes: 3 });
    wscatter(c, rng, 0, 40, 64, 24, 40, dust, 2.6, { shapes: 3 });
  }, { wrap: true });
}

/** Army truck cab side (2.6 × 2.2 → 84 × 72): door, window, the white star, U.S. ARMY stencil, jerrycan rack. */
export function z3ArmyCabSide(atlas: PwAtlas): PwTile {
  return atlas.tile('z3armycab', 84, 72, (c, k) => {
    const o = k.ramp(0x56663a, { light: 0.45, sat: 0.9 });
    const black = k.ramp(0x18181c, { light: 0.4 });
    const white = k.ramp(0xe8e4d4, { light: 0.4 });
    fill(c, o, 3);
    c.hline(0, 0, 84, o, 4.2);
    c.rect(0, 58, 84, 14, o, 2.4);
    c.frame(10, 4, 40, 54, black, 1.6);
    windowPane(c, k, 14, 8, 32, 18);
    // Star in a circle.
    const cx = 30;
    const cy = 42;
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      c.set(Math.round(cx + Math.cos(t) * 9), Math.round(cy + Math.sin(t) * 9), white, 3.6);
    }
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 3 : 7.5;
      pts.push(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
    }
    c.poly(pts, white, 3.8);
    drawText(c, 'U.S. ARMY', 52, 12, FONT_3x5, white, 3.4);
    drawText(c, '7TH INF', 54, 20, FONT_3x5, white, 3);
    // Jerrycans on the back rack.
    for (const x of [56, 68]) {
      c.rect(x, 34, 10, 20, o, 2.4);
      c.frame(x, 34, 10, 20, black, 1.6);
      c.hline(x + 2, 44, 6, o, 3.6);
    }
    wscatter(c, k.rng, 0, 40, 84, 32, 40, k.ramp(0x8a7a5a, { light: 0.4 }), 2.6, { shapes: 3 });
  });
}

/** Canvas cover side (wrap 64 × 84 = 2 m × 2.6 m): bows under the canvas, sag between, rope ties, dust, patches. */
export function z3CanvasCover(atlas: PwAtlas): PwTile {
  return atlas.tile('z3canvas2', 64, 96, (c, k) => {
    const rng = k.rng;
    const cv = k.ramp(0x66704a, { light: 0.45, sat: 0.85 });
    const rope = k.ramp(0xa89a70, { light: 0.4 });
    const patch = k.ramp(0x5a6440, { light: 0.4 });
    const mud = k.ramp(0x4a3a28, { light: 0.4 });
    fill(c, cv, 3);
    const sagX = new Float32Array(64);
    for (let x = 0; x < 64; x++) sagX[x] = Math.sin(((x % 32) / 32) * Math.PI);
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 64; x++) {
        // Hoops every 1 m (32 texels): taut and lit over them; between, the cloth sags into a
        // belly with diagonal pull folds toward the hoops (not straight stripes).
        const u = (x % 32) / 32;
        const sag = sagX[x];
        const fold = Math.sin((u * 2 + y / 40) * Math.PI * 2 + (x >> 5) * 1.7) * 0.35 * sag;
        const i = y * 64 + x;
        c.tone[i] = u < 0.06 || u > 0.94 ? 4.2 : 3.2 - sag * 0.8 + fold + (y < 6 ? 0.8 : 0);
      }
    }
    // Rope ties lacing the hem, a stitched patch, mud thrown up from the wheels.
    for (let x = 0; x < 64; x++) c.set(x, 86, cv, 1.8);
    for (let x = 4; x < 64; x += 16) for (let y = 80; y < 92; y++) c.set(x + ((y >> 1) & 1), y, rope, 3.4);
    c.rect(40, 30, 12, 10, patch, 3);
    c.frame(40, 30, 12, 10, patch, 2);
    for (let y = 70; y < 96; y++) for (let x = 0; x < 64; x++) if (dith(x, y, ((y - 70) / 26) * (0.5 + hash2(x >> 2, 0, 5) * 0.6))) c.set(x, y, mud, y > 88 ? 1.8 : 2.4);
    wscatter(c, rng, 0, 50, 64, 30, 30, mud, 2.2, { shapes: 3 });
  }, { wrap: true });
}

/** The army truck's stencilled unit marking (cut out, with ink): bumper code + a star in a ring. */
export function z3UnitStencil(atlas: PwAtlas): PwTile {
  const key = 'z3unit';
  return atlas.tile(key, 96, 32, (c, k) => {
    const w = k.ramp(0xe8e4d4, { light: 0.4 });
    drawText(c, '3-41 INF', 2, 2, FONT_BOLD, w, 3.2, { scale: 2, spacing: 1 });
    for (let y = 0; y < 32; y++) for (let x = 0; x < 96; x++) if (c.ramp[y * 96 + x] === w && hash2(x >> 1, y >> 1, 3) > 0.88) c.set(x, y, 0, 0);
    z3Ink(key, c, [w]);
  });
}

/** Tank track (wrap 32 × 16): road wheels behind the skirt, track links. */
export function z3TrackTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3track', 32, 16, (c, k) => {
    const t = k.ramp(0x2a2e22, { light: 0.45 });
    fill(c, t, 2);
    for (let x = 0; x < 32; x += 4) {
      c.vline(x, 0, 16, t, 3.4);
      c.vline(x + 1, 0, 16, t, 1);
    }
    c.hline(0, 0, 32, t, 3);
  }, { wrap: true });
}

/** Burnt school bus window row (wrap 64 × 32): frames, empty holes, melted seat frames, soot. */
export function z3BusWindows(atlas: PwAtlas): PwTile {
  return atlas.tile('z3buswin', 64, 32, (c, k) => {
    const frame = k.ramp(0x3a2a22, { light: 0.4 });
    const hole = k.ramp(0x120e10, { light: 0.3 });
    const seat = k.ramp(0x4a2a1a, { light: 0.4 });
    fill(c, frame, 2.4);
    for (let x0 = 2; x0 < 64; x0 += 16) {
      c.rect(x0, 3, 13, 22, hole, 0.6);
      for (let x = x0 + 2; x < x0 + 12; x++) c.set(x, 20 + (x & 1), seat, 2);
      c.hline(x0, 14, 13, frame, 2);
    }
    sootBloom(c, 32, 32, 34, 30, 1.6);
  }, { wrap: true });
}

/** Chrome / bright steel (wrap 32 × 32): polished, a sky streak. */
export function z3ChromeTile(atlas: PwAtlas, dark = false): PwTile {
  return atlas.tile(`z3chrome|${dark ? 1 : 0}`, 32, 32, (c, k) => {
    const r = k.ramp(dark ? 0x5a5e66 : 0xb8bac2, { light: 0.6, sat: 0.4 });
    fill(c, r, 3);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = (x + y) % 32;
      if (d < 4) c.tone[y * 32 + x] = 4.4;
      else if (d > 20) c.tone[y * 32 + x] = 2.4;
    }
  }, { wrap: true });
}
