import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD } from './font';
import { neutral, NEUTRAL_HEX } from './retexture';
import { hash2 } from './surfaces';
import { fill, G, rustRun, sootBloom, wscatter } from './z3kit';

/**
 * HIGHWAY TO HELL (z3) bay and odds for ART: PIXEL WORLD: the dusk water under
 * the bridge (an animated strip: long swell lines, the sunset glittering in
 * them), the burning freighter (rusty hull with portholes and a waterline,
 * the white bridge house with its window band, corrugated containers tinted
 * per box), the tunnel's green EXIT signs and red SOS phone cabinets.
 */

export const BAY_FRAMES = 4;

/** Bay water (wrap 128 × 64 per frame, BAY_FRAMES frames stacked): swell lines drifting, dusk glints. */
export function z3BayWater(atlas: PwAtlas): PwTile {
  const FH = 64;
  return atlas.tile(`z3water|${BAY_FRAMES}`, 128, FH * BAY_FRAMES, (c, k) => {
    const w = k.ramp(0x34305a, { light: 0.45, sat: 1 });
    const glint = k.ramp(0xe8906a, { light: 0.6, sat: 1.1 });
    for (let f = 0; f < BAY_FRAMES; f++) {
      const y0 = c.h - (f + 1) * FH;
      for (let y = 0; y < FH; y++) {
        for (let x = 0; x < 128; x++) {
          const sx = (x - f * 3 + 512) % 128;
          const swell = Math.sin((y / FH) * Math.PI * 6 + Math.sin((sx / 128) * Math.PI * 4) * 1.2);
          let t = swell > 0.6 ? 3.4 : swell < -0.7 ? 2.2 : 2.8;
          const r = Math.sin((sx / 128) * Math.PI * 22 + y * 1.3 + f * 1.1);
          let ramp = w;
          if (swell > 0.75 && r > 0.85) {
            ramp = glint;
            t = r > 0.97 ? 4.4 : 3;
          }
          c.set(x, y0 + y, ramp, t);
        }
      }
    }
  }, { wrap: true });
}

/** Freighter hull (wrap 64 × 64): rusty red-brown plates, a porthole row, the boot-top line, rust runs. */
export function z3HullTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z3hull', 64, 64, (c, k) => {
    const rng = k.rng;
    const h = k.ramp(0x4a2c2a, { light: 0.45 });
    const rust = k.ramp(0x7a3c1c, { light: 0.45 });
    const black = k.ramp(0x1a1418, { light: 0.4 });
    const glass = k.ramp(0xffb060, { light: 0.5 });
    fill(c, h, 3);
    for (let y = 0; y < 64; y += 16) c.hline(0, y, 64, h, 2);
    for (let x = 0; x < 64; x += 32) c.vline(x, 0, 64, h, 2);
    for (let x = 6; x < 64; x += 12) {
      c.rect(x, 8, 4, 4, black, 1);
      c.set(x + 1, 9, glass, hash2(x, 0, 3) > 0.6 ? 4 : 1.4, hash2(x, 0, 3) > 0.6 ? G : 0);
    }
    c.rect(0, 52, 64, 12, black, 2);
    c.hline(0, 52, 64, k.ramp(0xc02020, { light: 0.4 }), 3);
    for (let i = 0; i < 12; i++) rustRun(c, rng, rng.int(0, 63), rng.int(10, 40), rng.int(8, 20), rust);
  }, { wrap: true });
}

/** Bridge house (wrap 64 × 64): white plating, a band of dark windows (a few lit), rails, soot. */
export function z3BridgeHouse(atlas: PwAtlas): PwTile {
  return atlas.tile('z3bridgehouse', 64, 64, (c, k) => {
    const wht = k.ramp(0xd8d4cc, { light: 0.4 });
    const win = k.ramp(0x1a1e2a, { light: 0.4 });
    const lit = k.ramp(0xffc070, { light: 0.5 });
    fill(c, wht, 3);
    for (const y0 of [8, 40]) {
      c.rect(0, y0, 64, 8, win, 1.6);
      for (let x = 0; x < 64; x += 8) {
        c.vline(x, y0, 8, wht, 2.4);
        if (hash2(x, y0, 3) > 0.7) c.rect(x + 2, y0 + 2, 4, 5, lit, 4, G);
      }
    }
    for (const y of [20, 52]) c.hline(0, y, 64, wht, 1.8);
    sootBloom(c, 32, 64, 34, 50, 1.6);
  }, { wrap: true });
}

/** Shipping container side (neutral wrap 64 × 64 = 2 × 2 m, tinted per box): corrugations, a stencilled code, rust. */
export function z3ContainerTile(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile('z3container', 64, 64, (c, k) => {
      const rng = k.rng;
      const p = k.ramp(NEUTRAL_HEX, { light: 0.5, dark: 0.4, sat: 0 });
      const white = k.ramp(0xf0f0f0, { light: 0.3, sat: 0 });
      const rust = k.ramp(0x8a8278, { light: 0.4, sat: 0 });
      fill(c, p, 3);
      for (let x = 0; x < 64; x += 6) {
        c.vline(x, 0, 64, p, 4);
        c.vline(x + 3, 0, 64, p, 2.2);
      }
      c.rect(0, 0, 64, 3, p, 2.4);
      c.rect(0, 61, 64, 3, p, 2);
      drawText(c, 'OCNU 4471', 4, 8, FONT_3x5, white, 3);
      for (let i = 0; i < 8; i++) rustRun(c, rng, rng.int(0, 63), rng.int(4, 40), rng.int(6, 18), rust);
    }, { wrap: true }),
  );
}

/** Tunnel EXIT sign (module 40 × 18, glowing green): a running figure, an arrow, EXIT. */
export function z3ExitSign(atlas: PwAtlas): PwTile {
  return atlas.tile('z3exit', 40, 18, (c, k) => {
    const g = k.ramp(0x30ff70, { light: 0.5 });
    const w = k.ramp(0xf0fff0, { light: 0.4 });
    fill(c, g, 3.6, G);
    c.frame(0, 0, 40, 18, g, 2, G);
    // Running figure.
    const fig = [[5, 3], [4, 4], [5, 4], [4, 5], [3, 6], [4, 6], [5, 6], [6, 6], [4, 7], [4, 8], [3, 9], [5, 9], [2, 10], [6, 10], [2, 11], [7, 11]];
    for (const [x, y] of fig) c.set(x + 2, y + 2, w, 4, G);
    drawText(c, 'EXIT', 14, 2, FONT_BOLD, w, 4, { flag: G });
    for (let j = 0; j < 5; j++) c.hline(33 + j, 12 + (j < 3 ? j : 4 - j), 1, w, 4, G);
  });
}

/** SOS phone cabinet front (module 24 × 40): red, the handset hatch, SOS lettering, a blue lamp. */
export function z3SosPhone(atlas: PwAtlas): PwTile {
  return atlas.tile('z3sos', 24, 40, (c, k) => {
    const r = k.ramp(0xc03020, { light: 0.45 });
    const w = k.ramp(0xf0ece4, { light: 0.4 });
    const b = k.ramp(0x2a60ff, { light: 0.5 });
    fill(c, r, 3);
    c.frame(0, 0, 24, 40, r, 1.8);
    c.hline(0, 0, 24, r, 4.2);
    drawText(c, 'SOS', 4, 3, FONT_3x5, w, 4);
    c.rect(4, 14, 16, 18, r, 2.2);
    c.frame(4, 14, 16, 18, r, 1.4);
    c.rect(10, 22, 4, 3, w, 3);
    c.rect(9, 34, 6, 3, b, 4, G);
    wscatter(c, k.rng, 0, 0, 24, 40, 10, 0, -1, { shapes: 3 });
  });
}
