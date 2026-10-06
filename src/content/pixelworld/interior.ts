import { PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD, textWidth } from './font';
import { crack, darken, hash2, smooth } from './surfaces';

/**
 * PixelWorld interiors (hospital, labs, lobbies, tunnels): two-tone painted
 * walls with a wainscot and a scuffed skirting, lab wall panels, ceiling tiles
 * with fluorescent troffers (GLOW), terrazzo and carpet floors, blood trails,
 * pipes, vents, doors with wired-glass windows, notices. Same rules as the
 * facades: designed units, a lit upper-left edge, cast shadow below-right,
 * dither only at deliberate seams.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

/**
 * Institutional two-tone wall (wrap along u, 128 × 96 = 4 × 3 m, v from the
 * floor): upper paint, a dado rail at ~1.1 m, darker wainscot below, a scuffed
 * rubber skirting; chips, scuff marks, a damp stain.
 */
export function paintedWallTile(atlas: PwAtlas, o: { upper: number; lower: number; rail?: number; skirting?: number; grime?: number }): PwTile {
  return atlas.tile(
    `pwall|${h6(o.upper)}|${h6(o.lower)}|${h6(o.rail ?? 0x8a8c88)}|${h6(o.skirting ?? 0x2a2a2e)}|${o.grime ?? 0.5}`,
    128,
    96,
    (c, k) => {
      const rng = k.rng;
      const up = k.ramp(o.upper, { light: 0.4, sat: 0.9 });
      const lo = k.ramp(o.lower, { light: 0.4, sat: 0.9 });
      const rail = k.ramp(o.rail ?? 0x8a8c88, { light: 0.45 });
      const sk = k.ramp(o.skirting ?? 0x2a2a2e, { light: 0.45 });
      const H = c.h;
      // Rows are canvas y-down: the floor is the bottom row (texture v = 0).
      const railY = H - 36;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < c.w; x++) {
          if (y < railY) c.set(x, y, up, smooth(x, y, c.w, H, 4, 3) < 0.2 ? 2 : 3);
          else if (y < railY + 3) c.set(x, y, rail, y === railY ? 4 : y === railY + 2 ? 1 : 3);
          else if (y < H - 5) c.set(x, y, lo, y === railY + 3 ? 1 : 3);
          else c.set(x, y, sk, y === H - 5 ? 4 : 2);
        }
      }
      // Scuffs on the wainscot (trolleys, shoes): short dark dashes; chips showing a lighter undercoat.
      const g = o.grime ?? 0.5;
      for (let i = 0; i < Math.round(40 * g); i++) {
        const x = rng.int(0, c.w - 6);
        const y = rng.int(railY + 6, H - 7);
        c.lineShade(x, y, x + rng.int(2, 6), y + rng.int(-1, 1), -1);
      }
      c.scatter(rng, 0, 0, c.w, railY, Math.round(20 * g), 0, 1, { shapes: 3 });
      c.scatter(rng, 0, railY + 4, c.w, 30, Math.round(20 * g), 0, -1, { shapes: 4 });
      crack(c, rng, rng.int(0, c.w), rng.int(0, railY - 10), rng.int(8, 20), Math.PI / 2, { dt: -2, lip: 1 });
    },
    { wrap: true },
  );
}

/** Lab / hospital wall panels: big panels with a bevelled frame, screws, a service hatch now and then. 128 × 96. */
export function labPanelTile(atlas: PwAtlas, o: { hex: number; trim?: number }): PwTile {
  return atlas.tile(
    `labpanel|${h6(o.hex)}|${h6(o.trim ?? 0x8a8c90)}`,
    128,
    96,
    (c, k) => {
      const p = k.ramp(o.hex, { light: 0.45, sat: 0.8 });
      const t = k.ramp(o.trim ?? 0x8a8c90, { light: 0.5, sat: 0.6 });
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const lx = x % 64;
          const ly = y % 48;
          let tone = 3;
          if (lx < 2 || ly < 2) c.set(x, y, t, lx === 0 || ly === 0 ? 1 : 4);
          else {
            if (lx === 2 || ly === 2) tone = 4;
            else if (lx === 63 || ly === 47) tone = 2;
            c.set(x, y, p, tone);
          }
        }
      }
      for (let y = 0; y < c.h; y += 48) for (let x = 0; x < c.w; x += 64) for (const [dx, dy] of [[5, 5], [58, 5], [5, 42], [58, 42]]) c.set(x + dx, y + dy, t, 1);
      // A service hatch with a vent grille.
      c.rect(80, 58, 30, 18, t, 3);
      c.bevel(80, 58, 30, 18, true, 1, 1);
      for (let y = 61; y < 74; y += 2) c.hline(83, y, 24, t, 1);
      c.scatter(k.rng, 0, 0, c.w, c.h, 30, 0, -1, { shapes: 3 });
    },
    { wrap: true },
  );
}

/** Suspended ceiling: 2 × 2 ft tiles (19 texels), grid, stains, a fluorescent troffer (GLOW) every 3rd tile. 64 × 64. */
export function ceilingTile(atlas: PwAtlas, o: { hex: number; lights?: boolean; broken?: boolean }): PwTile {
  return atlas.tile(
    `ceiling|${h6(o.hex)}|${o.lights ? 1 : 0}|${o.broken ? 1 : 0}`,
    64,
    64,
    (c, k) => {
      const t = k.ramp(o.hex, { light: 0.4, sat: 0.6 });
      const grid = k.ramp(darken(o.hex, 0.7), { light: 0.5 });
      const lamp = k.ramp(0xeef4ff, { light: 0.5 });
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const lx = x % 32;
          const ly = y % 32;
          if (lx === 0 || ly === 0) c.set(x, y, grid, 3);
          else c.set(x, y, t, (lx * 7 + ly * 13) % 11 === 0 ? 2 : 3);
        }
      }
      if (o.lights) {
        c.rect(2, 2, 28, 12, grid, 4);
        for (let y = 4; y < 12; y++) for (let x = 4; x < 28; x++) c.set(x, y, lamp, o.broken && x > 15 ? 2 : y === 4 || y === 11 ? 4 : 5, PWF.GLOW);
        for (let x = 6; x < 28; x += 4) c.vline(x, 4, 8, lamp, 4, PWF.GLOW);
      }
      // Water stains: a ring.
      c.ellipseShade(46, 46, 9, 7, (d) => (d > 0.75 ? -1 : 0));
    },
    { wrap: true },
  );
}

/** Terrazzo floor: base with coloured chips, a brass divider strip every 2 m, scuffs. 128 × 128. */
export function terrazzoTile(atlas: PwAtlas, o: { hex: number; chips?: number[]; strip?: number }): PwTile {
  return atlas.tile(
    `terrazzo|${h6(o.hex)}|${(o.chips ?? []).map(h6).join('.')}`,
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const b = k.ramp(o.hex, { light: 0.4, sat: 0.8 });
      const strip = k.ramp(o.strip ?? 0xb08a40, { light: 0.5 });
      c.rect(0, 0, c.w, c.h, b, 3);
      const chips = (o.chips ?? [0x2a2a30, 0xe8e0d0, 0x8a5a40]).map((h) => k.ramp(h, { light: 0.4 }));
      for (let i = 0; i < 900; i++) c.cluster(rng.int(0, c.w - 2), rng.int(0, c.h - 2), rng.int(0, 3), chips[i % chips.length], rng.chance(0.5) ? 3 : 2);
      for (let x = 0; x < c.w; x += 64) c.vline(x, 0, c.h, strip, 4);
      for (let y = 0; y < c.h; y += 64) c.hline(0, y, c.w, strip, 4);
      for (let i = 0; i < 20; i++) {
        const x = rng.int(0, c.w - 5);
        const y = rng.int(0, c.h - 1);
        c.lineShade(x, y, x + rng.int(2, 5), y, -1);
      }
    },
    { wrap: true },
  );
}

/** Low-pile institutional carpet: a small repeat pattern (diamonds), worn path, stains. 64 × 64. */
export function carpetTile(atlas: PwAtlas, o: { hex: number; pattern?: number }): PwTile {
  return atlas.tile(
    `carpet|${h6(o.hex)}|${h6(o.pattern ?? 0)}`,
    64,
    64,
    (c, k) => {
      const a = k.ramp(o.hex, { light: 0.4 });
      const p = k.ramp(o.pattern ?? darken(o.hex, 0.7), { light: 0.4 });
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const dx = Math.abs((x % 16) - 8);
          const dy = Math.abs((y % 16) - 8);
          const dia = dx + dy === 6;
          c.set(x, y, dia ? p : a, dia ? 3 : (x + y) % 4 === 0 ? 2 : 3);
        }
      }
      c.ellipseShade(40, 24, 7, 5, (d) => (d < 0.8 ? -1 : 0));
    },
    { wrap: true },
  );
}

/** A blood trail / smear decal (cut out): drag marks, drips, a hand print. 96 × 32 (3 × 1 m). */
export function bloodTrailDecal(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`bloodtrail|${variant}`, 96, 32, (c, k) => {
    const rng = k.rng;
    const b = k.ramp(0x6a0a0a, { light: 0.4, sat: 1.1 });
    let y = 16;
    for (let x = 2; x < 94; x++) {
      y += rng.int(-1, 1);
      y = Math.max(8, Math.min(24, y));
      const w = Math.max(1, Math.round(5 * (1 - x / 110) + Math.sin(x * 0.3) * 1.5));
      for (let j = -w; j <= w; j++) if (hash2(x, j + variant, 3) > 0.15) c.set(x, y + j, b, Math.abs(j) === w ? 2 : hash2(x, j, 4) > 0.9 ? 4 : 3);
    }
    // Splats and drips.
    for (let i = 0; i < 6; i++) c.ellipse(rng.int(4, 90), rng.int(4, 28), rng.range(1.2, 2.5), rng.range(1, 2), b, 2);
    // Hand print.
    const hx = 30 + variant * 13;
    c.ellipse(hx, 6, 2.5, 2, b, 2);
    for (let f = 0; f < 4; f++) c.vline(hx - 2 + f * 1.5, 1, 3, b, 2);
  });
}

/** Exposed pipe run (wrap along u, 32 × 16): two pipes, brackets, a valve wheel now and then, a drip stain. */
export function pipesTile(atlas: PwAtlas, o: { hex: number; hex2?: number }): PwTile {
  return atlas.tile(
    `pipes|${h6(o.hex)}|${h6(o.hex2 ?? o.hex)}`,
    64,
    16,
    (c, k) => {
      const p1 = k.ramp(o.hex, { light: 0.5, sat: 0.8 });
      const p2 = k.ramp(o.hex2 ?? darken(o.hex, 0.8), { light: 0.5, sat: 0.8 });
      const band = (y0: number, r: number) => {
        c.hline(0, y0, c.w, r, 4);
        c.hline(0, y0 + 1, c.w, r, 3);
        c.hline(0, y0 + 2, c.w, r, 3);
        c.hline(0, y0 + 3, c.w, r, 2);
        c.hline(0, y0 + 4, c.w, r, 1);
      };
      band(2, p1);
      band(9, p2);
      for (let x = 8; x < c.w; x += 32) {
        c.rect(x, 1, 3, 14, p2, 2);
        c.vline(x, 1, 14, p2, 4);
      }
      c.ellipse(48, 5, 3, 3, p2, 4);
      c.set(48, 5, p2, 1);
    },
    { wrap: true },
  );
}

/** Wall vent / air grille module (24 × 16): louvres with shadow lines, screws, dust streak. */
export function ventModule(atlas: PwAtlas, o: { hex?: number } = {}): PwTile {
  return atlas.tile(`vent|${h6(o.hex ?? 0x9a9c98)}`, 24, 16, (c, k) => {
    const m = k.ramp(o.hex ?? 0x9a9c98, { light: 0.5, sat: 0.6 });
    c.rect(0, 0, 24, 16, m, 3);
    c.bevel(0, 0, 24, 16, true, 1, 1);
    for (let y = 3; y < 13; y += 2) {
      c.hline(3, y, 18, m, 1);
      c.hline(3, y + 1, 18, m, 4);
    }
    for (const [x, y] of [[1, 1], [22, 1], [1, 14], [22, 14]]) c.set(x, y, m, 1);
  });
}

/** Swing door with a wired-glass window and a kick plate (module 40 × 72 ≈ 1.25 × 2.25 m); `lit` = light behind. */
export function interiorDoorModule(atlas: PwAtlas, o: { hex: number; frame: number; lit?: number; sign?: string }): PwTile {
  return atlas.tile(`idoor|${h6(o.hex)}|${h6(o.frame)}|${h6(o.lit ?? 0)}|${o.sign ?? ''}`, 40, 72, (c, k) => {
    const d = k.ramp(o.hex, { light: 0.45, sat: 0.8 });
    const f = k.ramp(o.frame, { light: 0.45, sat: 0.6 });
    const glass = o.lit ? k.ramp(o.lit, { light: 0.5 }) : k.ramp(0x1c2434, { light: 0.4 });
    c.rect(0, 0, 40, 72, f, 3);
    c.hline(0, 0, 40, f, 4);
    c.vline(0, 0, 72, f, 4);
    c.vline(39, 0, 72, f, 1);
    c.rect(3, 3, 34, 69, d, 3);
    c.vline(3, 3, 69, d, 4);
    c.vline(36, 3, 69, d, 2);
    c.hline(3, 3, 34, d, 1);
    // Wired-glass window.
    c.rect(10, 10, 20, 22, glass, o.lit ? 4 : 2, o.lit ? PWF.GLOW : 0);
    for (let y = 10; y < 32; y += 4) c.hline(10, y, 20, glass, o.lit ? 3 : 1, o.lit ? PWF.GLOW : 0);
    for (let x = 10; x < 30; x += 4) c.vline(x, 10, 22, glass, o.lit ? 3 : 1, o.lit ? PWF.GLOW : 0);
    c.frame(9, 9, 22, 24, d, 1);
    // Push plate + kick plate.
    c.rect(30, 38, 4, 8, f, 4);
    c.rect(4, 60, 32, 10, f, 3);
    c.hline(4, 60, 32, f, 4);
    if (o.sign) {
      const sg = k.ramp(0xe8e0d0, { light: 0.4 });
      const tw = textWidth(o.sign, FONT_3x5);
      c.rect(20 - (tw >> 1) - 2, 34, tw + 4, 8, sg, 3);
      drawText(c, o.sign, 20 - (tw >> 1), 36, FONT_3x5, k.ramp(0xa82020, { light: 0.4 }), 3);
    }
  });
}

/** A notice / safety sign module (cut out round its plate): text in bold caps over a coloured band. */
export function noticeModule(atlas: PwAtlas, text: string, o: { band?: number; ground?: number } = {}): PwTile {
  const tw = textWidth(text, FONT_BOLD);
  const W = Math.max(24, tw + 8);
  return atlas.tile(`notice|${text}|${h6(o.band ?? 0xc02020)}|${h6(o.ground ?? 0xe8e4d8)}`, W, 20, (c, k) => {
    const g = k.ramp(o.ground ?? 0xe8e4d8, { light: 0.35, sat: 0.6 });
    const b = k.ramp(o.band ?? 0xc02020, { light: 0.45 });
    c.rect(0, 0, W, 20, g, 3);
    c.rect(1, 1, W - 2, 6, b, 3);
    c.frame(0, 0, W, 20, g, 1);
    drawText(c, text, (W - tw) >> 1, 9, FONT_BOLD, k.ramp(0x1a1a20, { light: 0.4 }), 1);
    c.scatter(k.rng, 1, 1, W - 2, 18, 4, 0, -1, { shapes: 2 });
  });
}
