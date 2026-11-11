import type { PwKit, PwPainter } from './atlas';
import { bayer, PWF, PwCanvas } from './canvas';
import { hash2 } from './surfaces';
import { FONT_5x7, FONT_BOLD, drawText, neonText, textWidth } from './font';
import { fontScaleFor } from './signs';
import { vnoise } from './elevation';

/**
 * The diner and the Rialto's marquee as drawn cut-outs (docs/PIXELWORLD3.md):
 * they were the last modelled boxes on Main Street, and the brightest things on it.
 * A diner front card with holes where the glass is (the lit room stays behind it, so
 * every shootable pane and burst opening is where the gameplay has it), a sign that is
 * a shaped sheet on struts with bent tubes, and a marquee in three cards (face, painted
 * soffit, shaped end). Nothing here is a box any more; every line is a hand's.
 */

const TPM = 32;

// ─── The diner's front ────────────────────────────────────────────────────

/**
 * The front card: local x −9.25 … +9.25 (the classic front is W = 18 wide at x 0), y 0 … 5.75.
 * Painted at 48 texels a metre, not the flats' 32: the player stands about 10 m from it at the diner hold.
 */
export const DINER_FRONT_TPM = 48;
export const DINER_FRONT_W = 888;
export const DINER_FRONT_H = 276;
const X0 = 9.25;
const colOf = (x: number) => Math.round((x + X0) * DINER_FRONT_TPM);
const rowOf = (y: number) => DINER_FRONT_H - Math.round(y * DINER_FRONT_TPM);

/** Which window opening a column is in (null = a post): the classic mullions at −8.25 + i × 3.3 stay where they were. */
const OPENINGS: [number, number][] = [
  [-8.18, -5.02],
  [-4.88, -1.72],
  [-1.58, 1.58],
  [1.72, 4.88],
];
/** The glass door (classic door panel): stays a hole, its painted door stands behind it. */
const DOOR: [number, number] = [5.9, 7.3];

export const paintDinerFront: PwPainter = function* (c: PwCanvas, k: PwKit) {
  const W = DINER_FRONT_W;
  const H = DINER_FRONT_H;
  const chrome = k.ramp(0x9aa4ae, { light: 0.4, sat: 0.8, dark: 0.42 });
  const enamel = k.ramp(0xa82230, { light: 0.34, sat: 1.0, dark: 0.45 });
  const white = k.ramp(0xd6d0c0, { light: 0.34, dark: 0.45 });
  const ink = k.ramp(0x1a1a22, { light: 0.3, dark: 0.5 });
  const roof = k.ramp(0x4a4e58, { light: 0.32, sat: 0.7, dark: 0.45 });
  const rust = k.ramp(0x8a4a24, { light: 0.4 });
  const neon = k.ramp(0xff4c9a, { light: 0.55, sat: 1.1 });
  const neonDead = k.ramp(0x5a2a44, { light: 0.32 });
  const seed = 311;
  // Panels: every 2.5 to 3.4 m the sheet stops at a riveted seam and the next one sits a texel or two
  // higher or lower. Where the rails would run on for more than half the frame at the hold, a section has
  // gone (placed by hand, 30 to 60 texels each, the rail's own ends torn): bare ribs show, not a black hole.
  const off = new Int8Array(W);
  const seam: number[] = [];
  {
    let x = 12 + Math.floor(hash2(1, 3, seed) * 30);
    let dy = 0;
    for (let i = 0; x < W; i++) {
      const len = 120 + Math.floor(hash2(i, 5, seed) * 46);
      seam.push(x);
      const h = hash2(i, 7, seed);
      dy = h < 0.4 ? 1 : h < 0.65 ? -1 : h < 0.82 ? 2 : -2;
      off.fill(dy, x, Math.min(W, x + len));
      x += len;
    }
  }
  const mark = (spans: [number, number][]) => {
    const g = new Uint8Array(W);
    for (const [a, b] of spans) g.fill(1, Math.round(a * DINER_FRONT_TPM), Math.round(b * DINER_FRONT_TPM));
    return g;
  };
  const goneHead = mark([[1.75, 2.72], [4.86, 5.86], [10.75, 11.45], [15.2, 16.05]]);
  const goneKick = mark([[3.55, 4.65], [8.6, 9.3], [13.7, 14.8]]);
  const sag = (x: number) => off[x] + Math.round((vnoise(x, 120, seed) - 0.5) * 2);
  const dent = (x: number, s: number) => (vnoise(x, 18 + s * 7, seed + s) > 0.78 ? -1.1 : 0);
  /** A fluted chrome strip between world heights: vertical flutes, a lit top, a dark bottom. */
  const fluted = (y0: number, y1: number, s: number, gone: Uint8Array) => {
    const r0 = rowOf(y1);
    const r1 = rowOf(y0);
    for (let x = 0; x < W; x++) {
      if (gone[x]) continue;
      const d = sag(x);
      for (let y = r0 + d; y < r1 + d; y++) {
        const f = (x + s) % 9;
        let t = f < 2 ? 3.9 : f < 4 ? 2.9 : f < 7 ? 2 : 1.3;
        t += dent(x, s);
        if (y - r0 < 2) t = 4;
        if (r1 - y < 2) t = 1;
        c.set(x, y, chrome, t);
      }
    }
  };
  /** A flat coloured strip with a lit top edge and a shadow under it. */
  const strip = (y0: number, y1: number, ramp: number, tone: number, gone: Uint8Array) => {
    const r0 = rowOf(y1);
    const r1 = rowOf(y0);
    for (let x = 0; x < W; x++) {
      if (gone[x]) continue;
      const d = sag(x);
      for (let y = r0 + d; y < r1 + d; y++) c.set(x, y, ramp, y === r0 + d ? tone + 1 : y === r1 + d - 1 ? tone - 1.3 : tone);
    }
  };
  /** Chequer tile whose columns are set by hand (9 to 15 texels), so the top edge never reads as crenellation; a tile here and there has fallen. */
  const checker = (y0: number, y1: number, salt: number, gone: Uint8Array) => {
    const r0 = rowOf(y1);
    const r1 = rowOf(y0);
    const col = new Int16Array(W);
    {
      let x = 0;
      for (let i = 0; x < W; i++) {
        const w = 9 + Math.floor(hash2(i, salt, seed + 71) * 7);
        col.fill(i, x, Math.min(W, x + w));
        x += w;
      }
    }
    for (let x = 0; x < W; x++) {
      if (gone[x]) continue;
      const d = sag(x);
      for (let y = r0 + d; y < r1 + d; y++) {
        const rowN = Math.floor((y - r0 - d) / 12);
        const missing = hash2(col[x], rowN, seed + salt + 73) > 0.9;
        const on = (col[x] + rowN) & 1;
        if (missing) c.set(x, y, ink, 1.6 + ((x ^ y) & 1) * 0.4);
        else if (on) c.set(x, y, white, 3.2 - (hash2(col[x], rowN, seed + salt + 77) > 0.7 ? 0.6 : 0));
        else c.set(x, y, ink, 1.1);
      }
    }
  };
  // Roofline first: a streamlined canopy that steps up over the middle, its edge dented, a corner torn.
  const top = new Int16Array(W).fill(H);
  for (let x = 0; x < W; x++) {
    const m = x / DINER_FRONT_TPM;
    const t = (a: number, b: number, v: number, w = 0) => (m >= a && m < b ? v + w : -1);
    let hm = Math.max(t(0, 2.1, 4.55), t(2.1, 2.5, 4.55, (m - 2.1) * 0.7), t(2.5, 7.2, 4.85), t(7.2, 7.5, 4.85, (m - 7.2) * 1.4), t(7.5, 11.4, 5.3), t(11.4, 11.7, 5.3, -(m - 11.4) * 1.3), t(11.7, 16.1, 4.85), t(16.1, 16.4, 4.85, -(m - 16.1) * 0.8), t(16.4, 18.5, 4.55));
    if (m > 16.8 && m < 17.7) hm -= (Math.sin(((m - 16.8) / 0.9) * Math.PI) * 0.34 + (vnoise(x, 5, seed + 21) - 0.5) * 0.16);
    top[x] = rowOf(hm) + Math.round((vnoise(x, 60, seed + 23) - 0.5) * 2);
    for (let y = top[x]; y < rowOf(4.35); y++) c.set(x, y, roof, y === top[x] ? 3.6 : y === top[x] + 1 ? 2.6 : 2);
  }
  // A chrome lip under the canopy, stepping with it.
  for (let x = 0; x < W; x++) {
    const y = top[x];
    c.set(x, y + 3, chrome, 3.8);
    c.set(x, y + 4, chrome, 2.2);
    c.set(x, y + 5, ink, 0.9);
  }
  yield;
  // The header and kick: bands of chrome, enamel and chequer, as the classic layout has them.
  fluted(3.3, 4.4, 2, goneHead);
  strip(3.82, 4.02, enamel, 2.6, goneHead);
  checker(4.0, 4.26, 3, goneHead);
  // (Over the chequer, a plain rail instead of more flutes: at the hold those flutes stood on the tile like teeth.)
  for (let x = 0; x < W; x++) {
    if (goneHead[x]) continue;
    const y0 = rowOf(4.4) + sag(x);
    const y1 = rowOf(4.27) + sag(x);
    for (let y = y0; y < y1; y++) c.set(x, y, chrome, y === y0 ? 3.9 : y === y1 - 1 ? 1.2 : 2.5 + dent(x, 11) * 0.5);
  }
  fluted(0.04, 1.0, 5, goneKick);
  strip(0.68, 0.86, enamel, 2.6, goneKick);
  checker(0.25, 0.5, 7, goneKick);
  yield;
  // The seams, with rivets: a dark joint and a lit edge, bent where the sheet has sprung.
  const headBand: readonly [number, number] = [rowOf(4.42), rowOf(3.3)];
  const kickBand: readonly [number, number] = [rowOf(1.0), rowOf(0.04)];
  for (const sx of seam) {
    for (const [y0, y1, gone] of [[...headBand, goneHead], [...kickBand, goneKick]] as const) {
      if (gone[sx]) continue;
      for (let y = y0; y < y1; y++) {
        c.set(sx, y + sag(sx), ink, 0.9);
        c.set(sx + 1, y + sag(sx + 1), chrome, 3.9);
      }
      for (let y = y0 + 5; y < y1 - 2; y += 14) c.set(sx + 4, y + sag(sx + 4), chrome, 4.6);
    }
  }
  // Where a panel has gone: the frame's bare steel ribs every 6 texels (a rail across them), rust running down from the wound,
  // the torn sheet's edge lit. Never a solid black area: at the hold a black gap read as a hole in the card, or a bin.
  const wound = (gone: Uint8Array, a: number, b: number, rustBelow: boolean) => {
    // (Rib pitch by a hand, 5 to 11 texels: at the hold an even comb of bright ribs read as a fence.)
    const rib = new Uint8Array(W);
    for (let x = 0, i = 0; x < W; i++) {
      rib[x] = 1;
      rib[x + 1] = 2;
      x += 5 + Math.floor(hash2(i, 41, seed) * 7);
    }
    for (let x = 0; x < W; x++) {
      if (!gone[x]) continue;
      const edgeL = !gone[x - 1];
      const edgeR = !gone[x + 1];
      for (let y = a; y < b; y++) {
        const rail = (y - a) % 26 < 3;
        c.set(x, y, rib[x] || rail ? chrome : ink, rib[x] === 1 ? 2.1 : rib[x] === 2 ? 1.3 : rail ? 1.7 : 0.9 + (((x + y) & 3) === 0 ? 0.5 : 0));
        if (hash2(x >> 1, y >> 4, seed + 81) > 0.72) c.tint(x, y, rust);
      }
      // The sheet's torn end: stepped, lit, its top and bottom bitten unevenly.
      if (edgeL || edgeR) {
        const lip = 2 + Math.floor(hash2(x, 4, seed + 83) * 3);
        for (let y = a + lip; y < b - lip; y++) if (hash2(x, y >> 3, seed + 85) > 0.25) c.set(x, y, chrome, 4.2);
      }
      if (rustBelow && x % 3 !== 1) {
        const len = 6 + Math.floor(hash2(x, 19, seed + 87) * 22);
        for (let j = 0; j < len; j++) c.tint(x, b + j, rust, -0.6);
      }
    }
  };
  wound(goneHead, headBand[0], headBand[1], true);
  wound(goneKick, kickBand[0], kickBand[1], false);
  // Long neon tube under the header, broken and dead in stretches.
  {
    const yn = rowOf(3.31);
    for (let x = 0; x < W; x++) {
      const dead = vnoise(x, 26, seed + 41) > 0.68;
      const yy = yn + sag(x);
      if (dead) {
        c.set(x, yy, neonDead, 2.4);
        if (hash2(x, 7, seed) > 0.93) c.set(x, yy + 1, neonDead, 1);
      } else {
        c.set(x, yy - 1, neon, 2.4, PWF.GLOW);
        c.set(x, yy, neon, 5, PWF.GLOW);
        c.set(x, yy + 1, neon, 2.4, PWF.GLOW);
      }
    }
  }
  yield;
  // Posts between the openings: the classic mullions, narrow steel, each leaning a texel its own way.
  const yWin0 = rowOf(3.3);
  const yWin1 = rowOf(1.0);
  for (const xm of [-8.25, -4.95, -1.65, 1.65, 4.95]) {
    const px = colOf(xm);
    const lean = Math.round((hash2(px, 3, seed) - 0.5) * 3);
    for (let y = yWin0; y < yWin1; y++) {
      const xo = Math.round(((y - yWin0) / (yWin1 - yWin0)) * lean);
      c.set(px - 3 + xo, y, chrome, 3.9);
      c.set(px - 2 + xo, y, chrome, 3.2);
      c.set(px - 1 + xo, y, chrome, 2.8);
      c.set(px + xo, y, chrome, 2.2);
      c.set(px + 1 + xo, y, chrome, 1.8);
      c.set(px + 2 + xo, y, chrome, 1.2);
    }
  }
  // The end bays: a porthole panel round the door, a menu frame at the near end.
  for (const [a, b] of [[4.95, DOOR[0]], [DOOR[1], 9.25]] as const) {
    const x0 = colOf(a);
    const x1 = colOf(b);
    for (let y = yWin0; y < yWin1; y++) {
      for (let x = x0; x < x1; x++) {
        const f = (x + 2) % 9;
        c.set(x, y, chrome, (f < 2 ? 3.7 : f < 4 ? 2.7 : f < 7 ? 2 : 1.3) + dent(x, 3));
      }
    }
  }
  {
    // Menu board in a chrome frame, lit: mid-dark enamel, a heading in the neon's colour, four rows of big blocks
    // (one-texel lettering is gone by the time this reaches the 288-line frame, and left a black hole in the chrome).
    const mx = colOf(7.7);
    const my = rowOf(2.75);
    const board = k.ramp(0x5a2a44, { light: 0.34, sat: 0.9, dark: 0.45 });
    c.rect(mx, my, 60, 70, chrome, 3);
    c.rect(mx + 4, my + 4, 52, 62, board, 2.3, PWF.GLOW);
    drawText(c, 'MENU', mx + 7, my + 8, FONT_5x7, neon, 4.6, { flag: PWF.GLOW, spacing: 1 });
    for (let i = 0; i < 4; i++) {
      for (let col2 = 0; col2 < 2; col2++) {
        const x = mx + 8 + col2 * 24;
        const w = 16 + ((i * 3 + col2 * 5) % 5);
        c.rect(x, my + 22 + i * 10, w, 4, white, 3.2 - (i === 2 ? 0.8 : 0), PWF.GLOW);
      }
    }
  }
  yield;
  // Roof clutter that breaks the canopy's line: an AC box on rails and a hooded vent.
  {
    const box0 = colOf(-5.0);
    const boxW = 66;
    const boxH = 36;
    const yB = Math.max(top[box0 + 6], top[box0 + boxW - 6]) + 3;
    const metal = k.ramp(0x7a8088, { light: 0.34, sat: 0.7, dark: 0.45 });
    // Rails, a cable, the body: louvres on the left, the fan's round grille on the right.
    c.rect(box0 + 4, yB - 3, 10, 5, ink, 1.4);
    c.rect(box0 + boxW - 14, yB - 3, 10, 5, ink, 1.4);
    for (let x = box0; x < box0 + boxW; x++) {
      const bow = Math.round(Math.sin(((x - box0) / boxW) * Math.PI) * 1.4);
      for (let y = yB - boxH - bow; y < yB - 2; y++) {
        const yy = y - (yB - boxH - bow);
        let t = yy < 2 ? 3.7 : y > yB - 5 ? 1.2 : 2.2;
        if (x === box0) t = 3.2;
        if (x > box0 + boxW - 4) t = 1.3;
        if (x < box0 + 36 && yy > 5 && y < yB - 7 && yy % 4 < 1) t = 1;
        if (hash2(x >> 2, y >> 3, seed + 51) > 0.8) t -= 0.5;
        c.set(x, y, metal, t);
      }
    }
    c.ellipse(box0 + 50, yB - boxH + 19, 11, 11, ink, 1.1);
    c.ellipse(box0 + 50, yB - boxH + 19, 6, 6, metal, 2);
    c.line(box0 + 41, yB - boxH + 10, box0 + 59, yB - boxH + 28, metal, 3);
    c.line(box0 + 59, yB - boxH + 10, box0 + 41, yB - boxH + 28, metal, 3);
    for (let j = 0; j < 24; j++) c.tint(box0 + 12 + (j & 1), yB + j, rust, -0.4);
    // The hooded vent on the far canopy: a short stack, a raked cap.
    const vx = colOf(4.1);
    const vy = top[vx] + 2;
    for (let x = vx - 9; x < vx + 9; x++) for (let y = vy - 36; y < vy; y++) c.set(x, y, metal, x < vx - 6 ? 3.4 : x > vx + 5 ? 1.2 : 2.2);
    c.poly([vx - 17, vy - 34, vx + 17, vy - 38, vx + 10, vy - 49, vx - 12, vy - 46], metal, (x) => (x < vx ? 3.3 : 1.6));
    c.hline(vx - 9, vy - 20, 18, rust, 1.4);
  }
  yield;
  // Cut the holes: the panes, the door, a texel of ragged weatherstrip round each.
  for (const [a, b] of [...OPENINGS, DOOR]) {
    const x0 = colOf(a);
    const x1 = colOf(b);
    const y0 = a === DOOR[0] ? rowOf(2.5) : yWin0 + 1;
    const y1 = a === DOOR[0] ? H : yWin1 - 1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) c.set(x, y, 0, 0);
    // Reveal: a dark rim so a hole reads as a window, not a hole in a poster.
    for (let x = x0 - 1; x < x1 + 1; x++) {
      if (y0 > 0) c.set(x, y0 - 1, ink, 0.8);
      if (y1 < H) c.set(x, y1, ink, 0.8);
    }
    for (let y = y0; y < y1; y++) {
      c.set(x0 - 1, y, ink, 0.8);
      c.set(x1, y, ink, 0.8);
    }
  }
  // A strip of the header peeled off its frame and hanging in front of the glass (over the hole: nothing shoots it).
  {
    const sx = colOf(-3.95);
    const y0 = rowOf(3.32);
    const len = 58;
    for (let j = 0; j < len; j++) {
      const sw = 12 - Math.floor(j / 12);
      const curl = Math.round(Math.sin(j * 0.13) * 2 + j * 0.06);
      for (let i = 0; i < sw; i++) {
        if (j > len - 6 && i < 3 && hash2(i, j, seed + 53) > 0.4) continue;
        const f = (i + 1) % 9;
        c.set(sx + i + curl, y0 + j, chrome, i === 0 ? 3.9 : i === sw - 1 ? 1.1 : f < 3 ? 3 : 2);
      }
      c.shift(sx + sw + curl, y0 + j, -1);
    }
  }
  yield;
  // Things standing against the foot of the wall, cutting the kick's long lines: a dented bin, a stack of milk crates.
  {
    const bx = colOf(-7.25);
    const bw = 38;
    const by = H - 1;
    const bh = 50;
    const bin = k.ramp(0x54585e, { light: 0.34, sat: 0.7, dark: 0.45 });
    c.ellipse(bx + bw / 2, by, bw * 0.75, 6, ink, 0.8);
    for (let x = bx; x < bx + bw; x++) {
      const u = (x - bx) / bw;
      const round = Math.round(Math.sin(u * Math.PI) * 2);
      const t0 = u < 0.14 ? 3.5 : u > 0.82 ? 1.2 : u > 0.6 ? 1.9 : 2.5;
      for (let y = by - bh - round; y <= by - round; y++) {
        const hoop = (y - (by - bh - round)) % 17 < 2;
        c.set(x, y, bin, hoop ? t0 + 0.8 : t0);
      }
      c.set(x, by - bh - round - 1, bin, 3.8);
    }
    c.poly([bx - 3, by - bh - 4, bx + bw + 3, by - bh - 6, bx + bw - 4, by - bh - 12, bx + 3, by - bh - 11], bin, (x) => (x < bx + bw * 0.55 ? 3.2 : 1.8));
    for (let i = 0; i < 16; i++) c.shift(bx + 10 + Math.round(hash2(i, 2, seed + 57) * 16), by - 24 - Math.round(hash2(i, 3, seed + 57) * 22), -1.6);
    // Crates: three, unevenly stacked, slats and a broken corner.
    const crate = k.ramp(0x7a5a3a, { light: 0.34, dark: 0.45 });
    const cr = colOf(2.95);
    const cw = 44;
    const ch = 26;
    const putCrate = (x: number, y: number) => {
      c.rect(x, y, cw, ch, crate, 2);
      for (let j = 0; j < 3; j++) {
        c.rect(x, y + j * 9, cw, 6, crate, 2.9);
        c.hline(x, y + j * 9, cw, crate, 3.7);
        c.hline(x, y + j * 9 + 5, cw, crate, 1.4);
      }
      c.rect(x, y, 4, ch, crate, 3.3);
      c.rect(x + cw - 4, y, 4, ch, crate, 1.5);
    };
    c.ellipse(cr + 48, H - 1, 62, 5, ink, 0.8);
    putCrate(cr, H - ch);
    putCrate(cr + 47, H - ch);
    putCrate(cr + 22, H - 2 * ch);
    c.poly([cr + 22 + cw - 12, H - 2 * ch, cr + 22 + cw, H - 2 * ch, cr + 22 + cw, H - 2 * ch + 11], 0, 0);
  }
  // Bullet pocks, a rusty stain or two across the chrome, the outline in ink.
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash2(i, 13, seed) * W);
    const y = rowOf(4.3) + Math.floor(hash2(i, 17, seed) * (rowOf(0.2) - rowOf(4.3)));
    if (c.at(x, y)) {
      c.shift(x, y, -2);
      c.shift(x + 1, y, -1);
      c.shift(x, y + 1, 1);
    }
  }
  yield;
  // The neon's wash: laid in by hand, not by a light that cuts off on some column. It starts under the sign's middle, comes
  // down over the chrome and enamel-white in three ramps (12 texels each, stepped, a dithered seam), ends on a panel joint.
  {
    const nearest = (want: number) => seam.reduce((best, x) => (Math.abs(x - want) < Math.abs(best - want) ? x : best), seam[0]);
    const jNear = nearest(colOf(-5.7));
    const jFar = nearest(colOf(5.1));
    // Light, so it takes no moon tint: the first step starts from the colour the moon gives this chrome on screen.
    const chromeLit = 0x8d8dd0;
    const whiteLit = 0xbdbdea;
    const hotChrome = 0xee90da;
    const hotWhite = 0xf8b6ec;
    const mixTo = (from: number, to: number, t: number) => {
      const ch = (s: number) => Math.round(((from >> s) & 255) * (1 - t) + ((to >> s) & 255) * t) << s;
      return ch(16) | ch(8) | ch(0);
    };
    const washChrome = [0.28, 0.62, 1].map((t) => k.ramp(mixTo(chromeLit, hotChrome, t), { light: 0.4, sat: 0.95, dark: 0.42 }));
    const washWhite = [0.28, 0.62, 1].map((t) => k.ramp(mixTo(whiteLit, hotWhite, t), { light: 0.34, dark: 0.45 }));
    for (let y = 0; y < H; y++) {
      const nudge = Math.floor(hash2(y >> 2, 7, seed + 61) * 4);
      for (let x = jNear; x <= jFar; x++) {
        const r = c.at(x, y);
        if (r !== chrome && r !== white) continue;
        const d = Math.min(x - jNear, jFar - x);
        const e = d + nudge + (bayer(x, y) > 0.5 ? 2 : 0);
        const lvl = e < 12 ? 0 : e < 24 ? 1 : 2;
        const i = y * W + x;
        c.ramp[i] = r === chrome ? washChrome[lvl] : washWhite[lvl];
        c.flag[i] |= PWF.GLOW;
      }
    }
  }
  yield;
  c.outline(0.5, true);
};

// ─── The "Diner" sign ─────────────────────────────────────────────────────

/** Sign card: the classic board's size, plus the struts under it. */
export const DINER_SIGN_STRUTS = 32;

export interface DinerSignLayout {
  w: number;
  h: number;
  x0: number;
  y0: number;
  scale: number;
}

/** The layout of the classic `neonSign` for this text (and of the buzzing r's overlay). */
export function dinerSignLayout(size: number, bw: number, bh: number): DinerSignLayout {
  const f = FONT_5x7;
  const scale = fontScaleFor('script', size * 0.9);
  const to = { scale, script: true, spacing: 1 };
  const pad = 4 + scale * 2;
  const tw = textWidth('Diner', f, to);
  const th = f.h * scale;
  const w = Math.ceil(Math.max(tw + pad * 2, Math.round(bw * TPM)) / 2) * 2;
  const h = Math.ceil(Math.max(th + pad * 2, Math.round(bh * TPM)) / 2) * 2;
  return { w, h, x0: Math.round((w - tw) / 2), y0: Math.round((h - th) / 2), scale };
}

/** The sign's shape: a pointed banner, its top line stepping up over the middle, a scalloped foot. */
function signInside(u: number, v: number, w: number, h: number): number {
  // u, v: canvas of the board; returns > 0 inside, ≈ distance from the edge.
  const cy = h / 2;
  const left = 2 + Math.abs(v - cy) * 0.3;
  const right = w - 2 - Math.abs(v - cy) * 0.3;
  const step = v < 6 ? (u > w * 0.3 && u < w * 0.7 ? 0 : 8 - v) : 0;
  const scallop = v > h - 7 ? ((((u % 42) / 42) * Math.PI) > 0 ? Math.sin(((u % 42) / 42) * Math.PI) * 6 : 0) - (h - v) : 0;
  return Math.min(u - left, right - u, v - 1 - step, h - 2 - v - scallop);
}

/** The backing sheet at board-canvas origin (ox, oy): painted with `c` offset (the buzzing r uses a part of it). */
export function paintDinerBacking(c: PwCanvas, k: PwKit, w: number, h: number, ox: number, oy: number, cw: number, ch: number) {
  const sheet = k.ramp(0x4a4e5a, { light: 0.36, sat: 0.7, dark: 0.45 });
  const edge = k.ramp(0x8a8f96, { light: 0.34, sat: 0.7, dark: 0.45 });
  const rust = k.ramp(0x8a4a24, { light: 0.4 });
  const seed = 331;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const u = x - ox;
      const v = y - oy;
      const d = signInside(u, v, w, h);
      if (d < 0) continue;
      // Riveted sheets: seams, rust patches, a torn square near the right end.
      let t = 2.1 + (vnoise(u, 90, seed) - 0.5) * 0.7;
      if ((u + 3) % 70 < 2 || (v + 2) % 22 < 1) t -= 0.8;
      if ((u + 3) % 70 === 2) t += 0.6;
      c.set(x, y, sheet, t);
      // Rust creeps in from the edge and the rivet lines in ragged runs (two-dimensional noise: never a band crossed by a band).
      const creep = (d < 16 ? (16 - d) / 16 : 0) * 0.5 + (hash2(u >> 3, v >> 2, seed + 7) - 0.5) * 0.5;
      if (creep > 0.42 && hash2(u, v, seed + 9) > 0.35) c.set(x, y, rust, 1.8 + (hash2(u, v, seed + 11) > 0.6 ? 0.5 : 0));
      if (d < 3) c.set(x, y, edge, d < 1 ? 1 : 3.2);
      if (((u + 31) % 70 === 5 || (u + 31) % 70 === 16) && (v + 2) % 22 < 2) c.set(x, y, edge, 4.2);
    }
  }
}

export function paintDinerSign(l: DinerSignLayout, cyanHex: number, pinkHex: number): PwPainter {
  return (c, k) => {
    const W = l.w;
    const H = l.h;
    paintDinerBacking(c, k, W, H, 0, 0, W, H);
    const neon = k.ramp(pinkHex, { light: 0.55, sat: 1.1 });
    const cyan = k.ramp(cyanHex, { light: 0.55, sat: 1.1 });
    // Cyan tube bent round the shape, inset, a stretch of it dead.
    const seed = 337;
    for (let u = 0; u < W; u++) {
      for (let v = 0; v < H; v++) {
        const d = signInside(u, v, W, H);
        if (d < 4 || d >= 6) continue;
        const dead = vnoise(u, 52, seed) > 0.72;
        if (dead) c.set(u, v, cyan, 1, 0);
        else c.set(u, v, cyan, d < 5 ? 5 : 2.6, PWF.GLOW);
      }
    }
    // The classic script, in its classic place (the buzzing r stays aligned over it).
    const to = { scale: l.scale, script: true, spacing: 1 };
    neonText(c, 'Diner', l.x0, l.y0, FONT_5x7, neon, { ...to, core: 5, halo: 2 });
    // The tube's light on the sheet: three stepped rings hugging the letters, 2 to 4 texels out, each ring's
    // edge broken with an ordered dither, so it follows the shape and has no straight side.
    {
      const washA = k.ramp(0x8a3a6a, { light: 0.32, sat: 0.9, dark: 0.4 });
      const washB = k.ramp(0xb0467c, { light: 0.34, sat: 1.0, dark: 0.4 });
      // A mask of the letters and of the halo the text set, then four dilations (each texel: which pass reached it).
      const dist = new Uint8Array(W * H);
      const idx = (x: number, y: number) => y * W + x;
      let front: number[] = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (c.flag[idx(x, y)] & PWF.GLOW && c.at(x, y) === neon) {
            dist[idx(x, y)] = 1;
            front.push(x, y);
          }
        }
      }
      for (let d = 2; d <= 5; d++) {
        const next: number[] = [];
        for (let i = 0; i < front.length; i += 2) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = front[i] + dx;
            const ny = front[i + 1] + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist[idx(nx, ny)]) continue;
            dist[idx(nx, ny)] = d;
            next.push(nx, ny);
          }
        }
        front = next;
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const d = dist[idx(x, y)];
          if (d < 2 || c.flag[idx(x, y)] & PWF.GLOW || !c.at(x, y)) continue;
          // d = 2, 3: the near ring, 4: the far one, 5: its dithered fringe.
          if (d === 5 && bayer(x, y) < 0.5) continue;
          c.tint(x, y, d <= 3 ? washB : washA, d <= 3 ? 0.5 : 0);
        }
      }
    }
    // Struts: two lattice legs and a brace down to the roof deck, rim-lit, wide enough to read at the diner hold.
    const iron = k.ramp(0x8a8f96, { light: 0.4, sat: 0.7, dark: 0.45 });
    const top = H;
    const foot = H + DINER_SIGN_STRUTS;
    for (const lx of [Math.round(W * 0.2), Math.round(W * 0.8)]) {
      for (let y = top - 3; y < foot; y++) {
        for (let i = 0; i < 5; i++) c.set(lx + i, y, iron, i === 0 ? 3.8 : i === 4 ? 1 : 2.4);
      }
      for (let i = 0; i < 4; i++) c.line(lx - 12 + i, foot - 1, lx + 2 + i, top + 2, iron, i === 0 ? 2.6 : 1.4);
      for (let i = 0; i < 4; i++) c.line(lx + 18 - i, foot - 1, lx + 4 - i, top + 2, iron, i === 0 ? 2.6 : 1.4);
    }
    c.outline(0.5, false);
  };
}

// ─── The Rialto's marquee ─────────────────────────────────────────────────

/** Face card: 14.4 m wide (the box front is 14), 2.75 m tall, centred 0.14 m above the old board line. */
export const MARQUEE_W = 464;
export const MARQUEE_H = 88;

export const paintMarqueeFace: PwPainter = (c, k) => {
  const W = MARQUEE_W;
  const H = MARQUEE_H;
  const red = k.ramp(0x7a1c24, { light: 0.34, sat: 1.0, dark: 0.45 });
  const brass = k.ramp(0xc09a4a, { light: 0.4, sat: 1.0, dark: 0.45 });
  const dark = k.ramp(0x2a1216, { light: 0.32, dark: 0.5 });
  const seed = 351;
  // The outline: a stepped deco crest over the board, a scalloped valance under it, both ends cut in.
  const crest = (x: number) => {
    const m = Math.abs(x - W / 2) / (W / 2);
    const step = m < 0.2 ? 0 : m < 0.42 ? 5 : m < 0.66 ? 10 : m < 0.86 ? 14 : 18;
    return step + Math.round((vnoise(x, 40, seed) - 0.5) * 2);
  };
  const valance = (x: number) => {
    const u = (x % 28) / 28;
    return H - 1 - Math.round(Math.sin(u * Math.PI) * 6) + Math.round((vnoise(x, 33, seed + 3) - 0.5) * 2);
  };
  const yBoardTop = 22;
  const yBoardBot = 63;
  for (let x = 2; x < W - 2; x++) {
    const y0 = crest(x);
    const y1 = valance(x);
    for (let y = y0; y < y1; y++) {
      let t = 2.4;
      if (y < yBoardTop - 8 || y > yBoardBot + 8) t = 3;
      if (y === y0) t = 4;
      if (y === y1 - 1) t = 1;
      c.set(x, y, red, t + (hash2(x >> 4, y >> 2, seed + 5) > 0.84 ? -0.8 : 0));
    }
    // Brass fins of the crest and the valance's bright edge.
    c.set(x, y0 + 1, brass, 3.6);
    c.set(x, y1 - 2, brass, 3);
  }
  // Brass frame round the board.
  for (let x = 12; x < W - 12; x++) {
    c.set(x, yBoardTop - 4, brass, 4);
    c.set(x, yBoardTop - 3, brass, 2.6);
    c.set(x, yBoardBot + 3, brass, 3.4);
    c.set(x, yBoardBot + 4, brass, 2);
  }
  // Sockets of the two bulb rows (the chase sets light over them).
  for (const y of [8, H - 12]) {
    for (let x = W / 2 - 6.9 * TPM; x <= W / 2 + 6.9 * TPM; x += 0.46 * TPM) {
      c.ellipse(Math.round(x), y, 2.4, 2.4, dark, 1.2);
      c.set(Math.round(x), y, brass, 3.4);
    }
  }
  // The middle's fan motif, tatty.
  drawText(c, 'RIALTO', W / 2 - textWidth('RIALTO', FONT_BOLD) / 2, 3, FONT_BOLD, brass, 4);
  // Paint gone, a hanging strip of valance missing.
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(hash2(i, 13, seed) * W);
    const w = 8 + Math.floor(hash2(i, 15, seed) * 18);
    const y = Math.floor(hash2(i, 17, seed) * H);
    c.rect(x, y, w, 2, dark, 1.2);
  }
  for (let x = W - 90; x < W - 72; x++) for (let y = valance(x) - 12; y < H; y++) c.set(x, y, 0, 0);
  c.outline(0.5, true);
};

/**
 * The lettered board of the marquee (a card over the face, 12.6 m of it as the classic board, plus rows under it for the panel that
 * has dropped). A long blank cream band with a word at one end was the strongest modelled read left on the street, so it is five framed
 * panels now: their own light, their own words, dark mullions every 2.5 m, letter rails along them. One panel is dead, one cracked with the
 * tube showing, one hanging off its top fixings. Edges stepped by hand, so the raster's even staircase is broken.
 */
export const MARQUEE_BOARD_W = 404;
export const MARQUEE_BOARD_H = 48;
const BOARD_ROWS = 36;

export const paintMarqueeBoard: PwPainter = (c, k) => {
  const face = k.ramp(0xf4e2c0, { light: 0.35 });
  const dim = k.ramp(0xc7a884, { light: 0.34, sat: 0.7 });
  const deadFace = k.ramp(0x6e6a64, { light: 0.32, sat: 0.5, dark: 0.45 });
  const inkR = k.ramp(0x2a0e12, { light: 0.4 });
  const rail = k.ramp(0x6a4a40, { light: 0.4 });
  const frame = k.ramp(0x4a2228, { light: 0.45 });
  const tube = k.ramp(0xfff8e8, { light: 0.3 });
  const seed = 367;
  // Panels (x0 … x1): column 0 is the far end of the street, the last is the near one.
  const panels: { x0: number; x1: number; kind: 'lit' | 'dead' | 'cracked' | 'hang'; a?: string; b?: string; dy: number; dim?: boolean }[] = [
    { x0: 0, x1: 78, kind: 'lit', a: 'NO', b: 'REFUNDS', dy: 0 },
    { x0: 82, x1: 164, kind: 'lit', a: 'LAST SHOW', b: 'TONIGHT', dy: 1, dim: true },
    { x0: 168, x1: 240, kind: 'dead', dy: 0 },
    { x0: 244, x1: 326, kind: 'cracked', a: 'THE END', b: 'OF DAYS', dy: 0 },
    { x0: 330, x1: 404, kind: 'hang', a: 'NOW', b: 'SHOWING', dy: 8 },
  ];
  for (const p of panels) {
    const tW = p.x1 - p.x0;
    const ramp = p.kind === 'dead' ? deadFace : p.dim ? dim : face;
    const tilt = p.kind === 'hang' ? 3 : 0;
    // The edges, a texel in or out every 8 to 12 columns.
    let offT = 0;
    let offB = 0;
    let nextT = 8 + Math.floor(hash2(p.x0, 1, seed) * 5);
    let nextB = 8 + Math.floor(hash2(p.x0, 2, seed) * 5);
    for (let i = 0; i < tW; i++) {
      if (i === nextT) { offT = offT ? 0 : 1; nextT += 8 + Math.floor(hash2(i, 3, seed) * 5); }
      if (i === nextB) { offB = offB ? 0 : 1; nextB += 8 + Math.floor(hash2(i, 5, seed) * 5); }
      const x = p.x0 + i;
      const drop = p.dy + Math.round((i / tW) * tilt);
      const yTop = offT + drop;
      const yBot = BOARD_ROWS - 1 - offB + drop;
      const lit = p.kind !== 'dead';
      for (let y = yTop; y <= yBot; y++) {
        const e = y - yTop;
        const f = yBot - y;
        if (e < 2 || f < 2) c.set(x, y, frame, e === 0 ? 4 : f === 0 ? 1 : 2);
        else {
          const wear = hash2(x >> 4, y >> 2, seed + p.x0) > 0.86 ? -0.6 : 0;
          c.set(x, y, ramp, (lit ? 3.4 : 2.4) + wear, lit ? PWF.GLOW : 0);
        }
      }
      // Side frame.
      if (i < 2 || i >= tW - 2) for (let y = yTop; y <= yBot; y++) c.set(x, y, frame, i === 0 ? 3.6 : i === tW - 1 ? 1 : 2);
    }
    // Letter rails and the slotted letters, one or two hanging askew; a small lean on a hung panel.
    const putLine = (txt: string | undefined, row: number) => {
      if (!txt) return;
      const dy = p.dy + row;
      for (let i = 0; i < tW - 8; i++) {
        const x = p.x0 + 4 + i;
        c.set(x, dy - 1 + Math.round((i / tW) * tilt), rail, 2, PWF.GLOW);
        c.set(x, dy + 12 + Math.round((i / tW) * tilt), rail, 2, PWF.GLOW);
      }
      const f = FONT_BOLD;
      const tw = textWidth(txt, f, { spacing: 1 });
      const x0 = p.x0 + Math.max(4, Math.round((tW - tw) / 2));
      let x = x0;
      for (let i = 0; i < txt.length; i++) {
        const ch = txt[i];
        const w = textWidth(ch, f, { spacing: 1 });
        const hang = hash2(i, txt.length + row, seed + p.x0) > 0.86 ? 2 : 0;
        const lean = Math.round(((x - p.x0) / tW) * tilt);
        drawText(c, ch, x, dy + hang + lean, f, inkR, 1, { spacing: 1 });
        x += w;
      }
    };
    if (p.kind !== 'dead') {
      putLine(p.a, 4);
      putLine(p.b, 20);
    } else {
      // The dead panel: a letter or two still clinging to a rail, the rails themselves bare, grime in runs.
      for (let i = 4; i < tW - 4; i++) if (hash2(i >> 3, 5, seed + 9) > 0.3) c.set(p.x0 + i, 15, rail, 1.4);
      drawText(c, 'R', p.x0 + 14, 4, FONT_BOLD, inkR, 1);
      for (let i = 0; i < 26; i++) {
        const sx = p.x0 + 6 + Math.floor(hash2(i, 4, seed + 13) * (tW - 12));
        const len = 6 + Math.floor(hash2(i, 5, seed + 13) * 20);
        for (let j = 0; j < len; j++) c.shift(sx, 3 + j, -0.8);
      }
    }
    if (p.kind === 'cracked') {
      // A crack across the face: the panel gone along it, the tube behind showing.
      const cx0 = p.x0 + 22;
      const cx1 = p.x0 + 56;
      for (let x = cx0; x < cx1; x++) {
        const u = (x - cx0) / (cx1 - cx0);
        const yMid = 16 + Math.round(u * 8 + Math.sin(u * 9) * 2);
        const half = 1 + Math.round(Math.sin(u * Math.PI) * 3.2);
        for (let y = yMid - half; y <= yMid + half; y++) c.set(x, y, inkR, 0.7);
        c.set(x, yMid - half - 1, frame, 2);
        c.set(x, yMid + half + 1, face, 2.2, PWF.GLOW);
      }
      for (let x = cx0 + 4; x < cx1 - 3; x++) {
        const u = (x - cx0) / (cx1 - cx0);
        c.set(x, 18 + Math.round(u * 8), tube, 4.6, PWF.GLOW);
      }
    }
  }
  // Mullions: dark uprights with a bolt, standing a little higher than the panels either side.
  for (const m of [79, 165, 241, 327]) {
    for (let y = 0; y < BOARD_ROWS + 2; y++) {
      for (let i = 0; i < 3; i++) c.set(m + i, y, frame, i === 0 ? 2.7 : i === 2 ? 0.8 : 1.5);
    }
    c.set(m + 1, 5, frame, 4.2);
    c.set(m + 1, BOARD_ROWS - 4, frame, 4.2);
  }
  c.outline(0.5, false);
};

/** The underside: a tin ceiling in three tones, warm toward the wall, rows of little recessed bulbs, panels sprung. */
export const MARQUEE_SOFFIT_W = 448;
export const MARQUEE_SOFFIT_H = 102;

export const paintMarqueeSoffit: PwPainter = (c, k) => {
  const W = MARQUEE_SOFFIT_W;
  const H = MARQUEE_SOFFIT_H;
  const tin = k.ramp(0x7a5a4a, { light: 0.34, sat: 0.85, dark: 0.45 });
  const lamp = k.ramp(0xfff0c8, { light: 0.3 });
  const seed = 359;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = y / H;
      // Three whole tones in hand-shaped bands: lit near the front edge by the street, warm by the lamps, dark by the wall.
      const bandEdge = 0.33 + (vnoise(x, 46, seed) - 0.5) * 0.16;
      const bandEdge2 = 0.66 + (vnoise(x, 58, seed + 3) - 0.5) * 0.16;
      let t = v < bandEdge ? 1.6 : v < bandEdge2 ? 2.3 : 3;
      if ((x + 8) % 56 < 2 || (y + 4) % 34 < 2) t -= 0.9;
      c.set(x, y, tin, t);
    }
  }
  for (let row = 0; row < 3; row++) {
    const y = 16 + row * 34;
    for (let x = 14; x < W - 14; x += 28) {
      const dead = hash2(x, row, seed + 5) > 0.74;
      c.ellipse(x, y, 4, 3, dead ? tin : lamp, dead ? 1 : 2.6, dead ? 0 : PWF.GLOW);
      if (!dead) c.ellipse(x, y, 2, 1.5, lamp, 5, PWF.GLOW);
    }
  }
  // A sprung sheet and its shadow.
  c.poly([72, 40, 132, 36, 128, 62, 76, 66], tin, 1);
  c.line(72, 40, 132, 36, tin, 3.6);
  c.outline(0.5, false);
};

/** The end: 3.2 m deep, the box's RIALTO panel as a shaped, flared wing: wall at the left of the tile, a rounded prow at the right. */
export const MARQUEE_END_W = 104;
export const MARQUEE_END_H = 88;

export const paintMarqueeEnd: PwPainter = (c, k) => {
  const W = MARQUEE_END_W;
  const H = MARQUEE_END_H;
  const red = k.ramp(0x7a1c24, { light: 0.34, sat: 1.0, dark: 0.45 });
  const brass = k.ramp(0xc09a4a, { light: 0.4, sat: 1.0, dark: 0.45 });
  const neon = k.ramp(0xff5a3a, { light: 0.55, sat: 1.1 });
  for (let x = 0; x < W; x++) {
    const u = x / W;
    // Wide at the wall, tapering and rounded at the prow.
    const yTop = Math.round(u * u * 26) + 6;
    const yBot = H - 5 - Math.round(u * u * 18) - Math.round(Math.sin(u * 18) * 2);
    for (let y = yTop; y < yBot; y++) c.set(x, y, red, y === yTop ? 3.8 : y === yBot - 1 ? 1 : 2.5);
    c.set(x, yTop + 1, brass, 3.4);
    c.set(x, yBot - 2, brass, 2.8);
  }
  neonText(c, 'RIALTO', 10, 38, FONT_BOLD, neon, { scale: 1, core: 5, halo: 2 });
  c.outline(0.5, true);
};
