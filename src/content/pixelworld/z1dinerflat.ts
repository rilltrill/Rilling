import type { PwKit, PwPainter } from './atlas';
import { PWF, type PwCanvas } from './canvas';
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

/** The front card: local x −9.25 … +9.25 (the classic front is W = 18 wide at x 0), y 0 … 5.7. */
export const DINER_FRONT_W = 592;
export const DINER_FRONT_H = 184;
const X0 = 9.25;
const colOf = (x: number) => Math.round((x + X0) * TPM);
const rowOf = (y: number) => DINER_FRONT_H - Math.round(y * TPM);

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
  // higher or lower; a few have gone, the dark frame behind showing.
  const off = new Int8Array(W);
  const gone = new Uint8Array(W);
  const seam: number[] = [];
  {
    let x = 12 + Math.floor(hash2(1, 3, seed) * 30);
    let dy = 0;
    for (let i = 0; x < W; i++) {
      const len = 80 + Math.floor(hash2(i, 5, seed) * 30);
      seam.push(x);
      const h = hash2(i, 7, seed);
      dy = h < 0.4 ? 1 : h < 0.65 ? -1 : h < 0.82 ? 2 : -2;
      off.fill(dy, x, Math.min(W, x + len));
      if (hash2(i, 9, seed) > 0.8) gone.fill(1, x + 4, Math.min(W, x + 4 + 26 + Math.floor(hash2(i, 11, seed) * 24)));
      x += len;
    }
  }
  const sag = (x: number) => off[x] + Math.round((vnoise(x, 120, seed) - 0.5) * 2);
  const dent = (x: number, s: number) => (vnoise(x, 18 + s * 7, seed + s) > 0.78 ? -1.1 : 0);
  /** A fluted chrome strip between world heights: vertical flutes, a lit top, a dark bottom. */
  const fluted = (y0: number, y1: number, s: number) => {
    const r0 = rowOf(y1);
    const r1 = rowOf(y0);
    for (let x = 0; x < W; x++) {
      const d = sag(x);
      for (let y = r0 + d; y < r1 + d; y++) {
        if (gone[x]) continue;
        const f = (x + s) % 6;
        let t = f < 1 ? 3.9 : f < 3 ? 2.9 : f < 5 ? 2 : 1.3;
        t += dent(x, s);
        if (y - r0 < 2) t = 4;
        if (r1 - y < 2) t = 1;
        c.set(x, y, chrome, t);
      }
    }
  };
  /** A flat coloured strip with a lit top edge and a shadow under it. */
  const strip = (y0: number, y1: number, ramp: number, tone: number) => {
    const r0 = rowOf(y1);
    const r1 = rowOf(y0);
    for (let x = 0; x < W; x++) {
      if (gone[x]) continue;
      const d = sag(x);
      for (let y = r0 + d; y < r1 + d; y++) c.set(x, y, ramp, y === r0 + d ? tone + 1 : y === r1 + d - 1 ? tone - 1.3 : tone);
    }
  };
  const checker = (y0: number, y1: number) => {
    const r0 = rowOf(y1);
    const r1 = rowOf(y0);
    for (let x = 0; x < W; x++) {
      if (gone[x]) continue;
      const d = sag(x);
      for (let y = r0 + d; y < r1 + d; y++) {
        const on = ((x >> 3) + ((y - r0) >> 3)) & 1;
        if (on) c.set(x, y, white, 3.2);
        else c.set(x, y, ink, 1.1);
      }
    }
  };
  // Roofline first: a streamlined canopy that steps up over the middle, its edge dented, a corner torn.
  const top = new Int16Array(W).fill(H);
  for (let x = 0; x < W; x++) {
    const m = x / TPM;
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
  fluted(3.3, 4.4, 2);
  strip(3.82, 4.02, enamel, 2.6);
  checker(4.0, 4.26);
  fluted(0.04, 1.0, 5);
  strip(0.68, 0.86, enamel, 2.6);
  checker(0.25, 0.5);
  yield;
  // The seams, with rivets: a dark joint and a lit edge, bent where the sheet has sprung.
  for (const sx of seam) {
    for (const [y0, y1] of [[rowOf(4.42), rowOf(3.3)], [rowOf(1.0), rowOf(0.04)]] as const) {
      for (let y = y0; y < y1; y++) {
        c.set(sx, y + sag(sx), ink, 0.9);
        c.set(sx + 1, y + sag(sx + 1), chrome, 3.9);
      }
      for (let y = y0 + 4; y < y1 - 2; y += 9) c.set(sx + 3, y + sag(sx + 3), chrome, 4.6);
    }
  }
  // Where a panel has gone: the frame's dark, bare steel ribs, rust down from the wound.
  for (let x = 0; x < W; x++) {
    if (!gone[x]) continue;
    for (const [a, b] of [[rowOf(4.42), rowOf(3.3)], [rowOf(1.0), rowOf(0.04)]] as const) {
      for (let y = a; y < b; y++) c.set(x, y, ink, x % 14 < 2 ? 1.6 : 0.5);
    }
    if (hash2(x >> 3, 5, seed + 31) > 0.55) for (let j = 0; j < 22; j++) c.tint(x, rowOf(3.3) + j, rust, -0.8);
  }
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
      c.set(px - 2 + xo, y, chrome, 3.9);
      c.set(px - 1 + xo, y, chrome, 2.8);
      c.set(px + xo, y, chrome, 2.2);
      c.set(px + 1 + xo, y, chrome, 1.2);
    }
  }
  // The end bays: a porthole panel round the door, a menu frame at the near end.
  for (const [a, b] of [[4.95, DOOR[0]], [DOOR[1], 9.25]] as const) {
    const x0 = colOf(a);
    const x1 = colOf(b);
    for (let y = yWin0; y < yWin1; y++) {
      for (let x = x0; x < x1; x++) {
        const f = (x + 2) % 6;
        c.set(x, y, chrome, (f < 1 ? 3.7 : f < 3 ? 2.7 : f < 5 ? 2 : 1.3) + dent(x, 3));
      }
    }
  }
  {
    // Menu board in a chrome frame, lit.
    const mx = colOf(7.7);
    const my = rowOf(2.75);
    c.rect(mx, my, 40, 46, chrome, 3);
    c.rect(mx + 3, my + 3, 34, 40, ink, 1, PWF.GLOW);
    for (let i = 0; i < 6; i++) c.hline(mx + 7, my + 8 + i * 6, 24 - (i * 3) % 12, white, 3.4, PWF.GLOW);
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
  // Bullet pocks, a rusty stain or two across the chrome, the outline in ink.
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(hash2(i, 13, seed) * W);
    const y = rowOf(4.3) + Math.floor(hash2(i, 17, seed) * (rowOf(0.2) - rowOf(4.3)));
    if (c.at(x, y)) {
      c.shift(x, y, -2);
      c.shift(x + 1, y, -1);
      c.shift(x, y + 1, 1);
    }
  }
  yield;
  c.outline(0.5, true);
};

// ─── The "Diner" sign ─────────────────────────────────────────────────────

/** Sign card: the classic board's size, plus the struts under it. */
export const DINER_SIGN_STRUTS = 32;

interface SignLayout {
  w: number;
  h: number;
  x0: number;
  y0: number;
  scale: number;
}

/** The layout of the classic `neonSign` for this text (and of the buzzing r's overlay). */
export function dinerSignLayout(size: number, bw: number, bh: number): SignLayout {
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
      if (vnoise(u, 26, seed + 3) > 0.62 && vnoise(v, 14, seed + 5) > 0.5) c.set(x, y, rust, 1.8);
      if (d < 3) c.set(x, y, edge, d < 1 ? 1 : 3.2);
      if (((u + 31) % 70 === 5 || (u + 31) % 70 === 16) && (v + 2) % 22 < 2) c.set(x, y, edge, 4.2);
    }
  }
}

export function paintDinerSign(l: SignLayout, cyanHex: number, pinkHex: number): PwPainter {
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
