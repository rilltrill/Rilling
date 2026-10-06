import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_BOLD, rasterText, textWidth } from './font';
import { hash2 } from './surfaces';
import { dith, fill, rivet, rustRun, wscatter, wset } from './z3kit';

/**
 * The player's pickup (HIGHWAY TO HELL's view model) for ART: PIXEL WORLD,
 * painted at 48 texels a metre (it is seen from 1–5 m): the battered red
 * paint (scratches to primer, rust round the edges, bullet holes), the hood
 * with NOT TODAY sprayed across it in drippy white over a primer patch and a
 * blood smear, the cab roof, the cracked windscreen reflecting the dusk, the
 * ribbed bed floor, hazard tape, the welded plow's rusty steel.
 */

export const TRUCK_TPM = 48;

/** Battered red paint (wrap 64 × 64 at 48 tpm): scratches, chips to primer, rust spots. */
export function z3TruckPaint(atlas: PwAtlas, hex = 0x962a20): PwTile {
  return atlas.tile(`z3trpaint|${hex}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(hex, { light: 0.5, sat: 1 });
    const primer = k.ramp(0x74726a, { light: 0.4 });
    const rust = k.ramp(0x7a4024, { light: 0.45 });
    fill(c, p, 3);
    // Big soft sheen bands (clear-coat catching the sky), then the damage.
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (((x + y * 2) & 63) < 6) c.tone[y * 64 + x] = 3.6;
    for (let i = 0; i < 10; i++) {
      let x = rng.int(0, 63);
      let y = rng.int(0, 63);
      const len = rng.int(6, 18);
      const dx = rng.chance(0.5) ? 1 : -1;
      for (let j = 0; j < len; j++) {
        wset(c, x, y, primer, 3.4);
        x += dx;
        if (rng.chance(0.3)) y++;
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      for (let j = 0; j < 4; j++) c.cluster(x + rng.int(-2, 2), y + rng.int(-2, 2), rng.int(0, 5), rust, rng.chance(0.5) ? 2.4 : 3);
    }
    wscatter(c, rng, 0, 0, 64, 64, 30, 0, -0.8, { shapes: 2 });
  }, { wrap: true, density: TRUCK_TPM });
}

/** The hood (module 88 × 72 = 1.84 × 1.5 m): primer patch, NOT TODAY in drippy spray, blood, dents, bullet holes. */
export function z3TruckHood(atlas: PwAtlas): PwTile {
  return atlas.tile('z3trhood', 88, 72, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(0x962a20, { light: 0.5, sat: 1 });
    const primer = k.ramp(0x74726a, { light: 0.45 });
    const blood = k.ramp(0x5a0c08, { light: 0.4, sat: 1.1 });
    const white = k.ramp(0xece4d4, { light: 0.4 });
    const black = k.ramp(0x18161a, { light: 0.4 });
    fill(c, p, 3);
    // Hood seams: the centre crease lit, the panel edges.
    c.vline(44, 0, 72, p, 3.8);
    c.vline(45, 0, 72, p, 2.4);
    c.frame(0, 0, 88, 72, p, 2);
    // Primer patch (a replaced panel, sanded edge).
    for (let y = 18; y < 52; y++) for (let x = 46; x < 82; x++) if (hash2(x >> 1, y >> 1, 3) > 0.12 || (x > 50 && y > 22 && x < 78 && y < 48)) c.set(x, y, primer, (x + y) % 9 === 0 ? 2.6 : 3);
    // Spray lettering across, reading from the bed (bottom of the module = toward the windscreen).
    const s = 2;
    const tw = textWidth('NOT TODAY', FONT_BOLD, { scale: s });
    const tx = Math.round((88 - tw) / 2);
    const ty = 30;
    const mask: [number, number][] = [];
    const m = rasterText('NOT TODAY', FONT_BOLD, { scale: s });
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) mask.push([tx + x, ty + y]);
    for (const [x, y] of mask) {
      c.set(x, y, white, (x + y) % 5 === 0 ? 3.4 : 4);
      c.shift(x + 1, y + 1, -1.2);
    }
    for (let i = 0; i < 12; i++) {
      const [x, y] = mask[rng.int(0, mask.length - 1)];
      for (let d = 1; d < rng.int(3, 7); d++) if (!mask.some(([mx, my]) => mx === x && my === y + d)) c.set(x, y + d, white, 3);
    }
    // Blood smears and a handprint.
    for (let i = 0; i < 3; i++) {
      const cx = rng.int(6, 40);
      const cy = rng.int(46, 66);
      for (let y = -4; y <= 4; y++) for (let x = -7; x <= 7; x++) if ((x * x) / 49 + (y * y) / 16 + hash2(cx + x, cy + y, 5) * 0.4 < 1) c.set(cx + x, cy + y, blood, 2.4);
    }
    for (const [x, y] of [[20, 8], [62, 60], [30, 64]]) {
      c.set(x, y, black, 0.6);
      c.set(x - 1, y - 1, p, 4.4);
      c.set(x + 1, y + 1, p, 1.6);
    }
    // Dents (shaded hollows).
    for (let i = 0; i < 3; i++) {
      const cx = rng.int(8, 80);
      const cy = rng.int(6, 66);
      for (let y = -4; y <= 4; y++) for (let x = -5; x <= 5; x++) if (x * x / 25 + y * y / 16 < 1) c.shift(cx + x, cy + y, x + y < 0 ? -0.8 : 0.5);
    }
    for (let x = 0; x < 88; x++) if (dith(x, 0, 0.5)) c.tint(x, 71, k.ramp(0x7a4024, { light: 0.45 }), 0);
  }, { density: TRUCK_TPM });
}

/** The cab roof (module 86 × 70 = 1.8 × 1.45 m): a primer square, rust along the drip rails, a dent. */
export function z3TruckRoof(atlas: PwAtlas): PwTile {
  return atlas.tile('z3trroof', 86, 70, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(0x962a20, { light: 0.5, sat: 1 });
    const primer = k.ramp(0x74726a, { light: 0.45 });
    const rust = k.ramp(0x7a4024, { light: 0.45 });
    fill(c, p, 3);
    c.frame(1, 1, 84, 68, p, 3.8);
    c.frame(0, 0, 86, 70, p, 2);
    for (let y = 30; y < 56; y++) for (let x = 8; x < 40; x++) c.set(x, y, primer, 3);
    for (const x of [2, 83]) for (let y = 2; y < 68; y += rng.int(2, 6)) c.cluster(x, y, rng.int(0, 5), rust, 2.6);
    for (let y = -6; y <= 6; y++) for (let x = -8; x <= 8; x++) if (x * x / 64 + y * y / 36 < 1) c.shift(58 + x, 22 + y, x + y < 0 ? -0.8 : 0.5);
    wscatter(c, rng, 0, 0, 86, 70, 40, 0, -0.8, { shapes: 2 });
  }, { density: TRUCK_TPM });
}

/** Windscreen (module 80 × 46): the dusk reflected, wiper, a star crack. */
export function z3TruckGlass(atlas: PwAtlas): PwTile {
  return atlas.tile('z3trglass', 80, 46, (c, k) => {
    const sky = k.ramp(0xc07a78, { light: 0.55, sat: 0.9 });
    const dark = k.ramp(0x1a2230, { light: 0.45 });
    const white = k.ramp(0xe8e8f0, { light: 0.4 });
    for (let y = 0; y < 46; y++) for (let x = 0; x < 80; x++) {
      const r = y / 46;
      c.set(x, y, dith(x, y, 1 - r * 1.3) ? sky : dark, (x - y + 200) % 30 < 3 ? 4.6 : r < 0.3 ? 3.6 : 2.6);
    }
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2 + 0.2;
      for (let r = 1; r < 14; r++) c.set(Math.round(56 + Math.cos(t) * r), Math.round(20 + Math.sin(t) * r * 0.7), white, 4);
    }
    for (let i = 0; i < 30; i++) c.set(10 + i, 40 - (i >> 2), dark, 0.6);
  }, { density: TRUCK_TPM });
}

/** Ribbed steel bed floor (wrap 32 × 64): raised ribs, scuffs to bare metal, brass casings, grit. */
export function z3TruckBed(atlas: PwAtlas): PwTile {
  return atlas.tile('z3trbed', 32, 64, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(0x56585c, { light: 0.5, sat: 0.5 });
    const brass = k.ramp(0xd8aa44, { light: 0.5 });
    fill(c, s, 2.6);
    for (let x = 0; x < 32; x += 8) {
      c.vline(x + 2, 0, 64, s, 4);
      c.vline(x + 3, 0, 64, s, 3.4);
      c.vline(x + 4, 0, 64, s, 1.8);
    }
    for (let i = 0; i < 5; i++) {
      const x = rng.int(0, 31);
      const y = rng.int(0, 63);
      wset(c, x, y, brass, 4);
      wset(c, x + 1, y, brass, 2.4);
    }
    wscatter(c, rng, 0, 0, 32, 64, 30, 0, -0.8, { shapes: 3 });
  }, { wrap: true, density: TRUCK_TPM });
}

/** Hazard tape (wrap 32 × 16 at 48 tpm): yellow / black diagonals, scuffed. */
export function z3TruckHazard(atlas: PwAtlas): PwTile {
  return atlas.tile('z3trhazard', 32, 16, (c, k) => {
    const y = k.ramp(0xe8b420, { light: 0.45 });
    const b = k.ramp(0x1a1a1e, { light: 0.4 });
    for (let yy = 0; yy < 16; yy++) for (let x = 0; x < 32; x++) c.set(x, yy, ((x + yy) >> 3) & 1 ? b : y, yy < 2 ? 4 : 3);
    wscatter(c, k.rng, 0, 0, 32, 16, 12, 0, -1, { shapes: 3 });
  }, { wrap: true, density: TRUCK_TPM });
}

/** Welded steel (wrap 32 × 32): mill scale, weld beads, rust runs (plow, roll bar). */
export function z3TruckSteel(atlas: PwAtlas, hex = 0x6a6e74): PwTile {
  return atlas.tile(`z3trsteel|${hex}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const s = k.ramp(hex, { light: 0.5, sat: 0.5 });
    const rust = k.ramp(0x7a4024, { light: 0.45 });
    fill(c, s, 3);
    for (let x = 0; x < 32; x += 2) c.set(x, 16, s, x & 2 ? 4.2 : 2);
    for (let i = 0; i < 6; i++) rustRun(c, rng, rng.int(0, 31), rng.int(0, 20), rng.int(4, 12), rust);
    for (let y = 4; y < 32; y += 12) rivet(c, 4, y, s, 3);
    wscatter(c, rng, 0, 0, 32, 32, 20, 0, -0.8, { shapes: 3 });
  }, { wrap: true, density: TRUCK_TPM });
}

/** Tailgate (module 91 × 22 = 1.9 × 0.45 m): the pressed panel, a dented corner, a sticker. */
export function z3TruckTailgate(atlas: PwAtlas): PwTile {
  return atlas.tile('z3trtail', 91, 22, (c, k) => {
    const p = k.ramp(0x962a20, { light: 0.5, sat: 1 });
    const white = k.ramp(0xece4d4, { light: 0.4 });
    fill(c, p, 3);
    c.frame(4, 3, 83, 16, p, 3.8);
    c.frame(5, 4, 81, 14, p, 2.4);
    c.rect(66, 7, 14, 7, white, 3.4);
    drawText(c, 'GO', 68, 6, FONT_BOLD, p, 2);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) if (x + y < 10) c.shift(x, 22 - 8 + y, -0.8);
  }, { density: TRUCK_TPM });
}
