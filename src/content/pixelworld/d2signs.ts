import { PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_5x7, FONT_BOLD, neonText, textWidth, type PixelFont } from './font';
import { hash2 } from './surfaces';
import { bayer } from './canvas';
import { bulletHole, clawMarks, h6, plate, rivet, scuffs } from './d2kit';

/**
 * RESEARCH LABS signage and doors, painted at the classic boards' own sizes:
 *  - PARK signs (green boards): timber planks, a routed border, cream letters
 *    with a dark drop shadow, weathered;
 *  - ENAMEL plates (lab / service boards): bevelled steel with screws, chipped
 *    enamel, letters in the board's ink;
 *  - HAZARD plates (yellow boards): yellow / black stripes round the edge;
 *  - LIT signs (glowing ink): a dark box with backlit letters + halo.
 * Painted lettering for walls (stencils, glowing labels) and doors (timber,
 * steel, lab blast doors) live here too.
 */

export interface SignSpec {
  text: string;
  /** Classic glyph pixel (m). */
  px: number;
  board: number;
  ink: number;
  glow: boolean;
  /** Classic board size (m). */
  w: number;
  h: number;
}

function lum(hex: number): number {
  return (((hex >> 16) & 255) * 0.3 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11) / 255;
}

function isGreen(hex: number): boolean {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return g > r + 8 && g >= b - 4 && lum(hex) < 0.35;
}

function isYellow(hex: number): boolean {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return r > 70 && g > 60 && b < r * 0.5;
}

/** Whole-texel glyph scale that fits `text` in `maxW` texels near the classic letter size. */
function fitScale(text: string, f: PixelFont, px: number, maxW: number): number {
  let s = Math.max(1, Math.round(px * 32));
  while (s > 1 && textWidth(text, f, { scale: s }) > maxW) s--;
  return s;
}

/** A painted sign module, the classic board's size (fit on the board's front face). */
export function d2SignTile(atlas: PwAtlas, s: SignSpec): PwTile {
  const W = Math.max(8, Math.round(s.w * 32));
  const H = Math.max(6, Math.round(s.h * 32));
  const style = s.glow ? 'lit' : isYellow(s.board) ? 'hazard' : isGreen(s.board) ? 'park' : 'enamel';
  return atlas.tile(`d2sign|${s.text}|${h6(s.board)}|${h6(s.ink)}|${style}|${W}x${H}`, W, H, (c, k) => {
    const rng = k.rng;
    const f = style === 'lit' || style === 'park' ? FONT_BOLD : FONT_5x7;
    const scale = fitScale(s.text, f, s.px, W - 6);
    const tw = textWidth(s.text, f, { scale });
    const th = f.base * scale;
    const tx = Math.round((W - tw) / 2);
    const ty = Math.round((H - th) / 2);
    if (style === 'park') {
      // Timber planks (horizontal), a routed border, cream letters with a carved shadow.
      const b = k.ramp(s.board, { light: 0.45, sat: 1.0 });
      const ink = k.ramp(s.ink, { light: 0.45 });
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const ly = y % 7;
          let t = ly === 0 ? 1.75 : ly === 1 ? 3.75 : 3;
          if (Math.sin((x + y * 13) * 0.21 + (y >> 3)) > 0.95) t -= 0.75;
          c.set(x, y, b, t);
        }
      }
      c.frame(0, 0, W, H, b, 1.5);
      c.frame(1, 1, W - 2, H - 2, b, 4);
      c.frame(2, 2, W - 4, H - 4, b, 2);
      drawText(c, s.text, tx, ty, f, ink, 3.5, { scale, shadow: { ramp: b, tone: 1 }, shadeFn: (_u, v) => (v < 0.2 ? 1 : 0) });
      c.scatter(rng, 2, 2, W - 4, H - 4, Math.round((W * H) / 70), 0, -0.75, { shapes: 3 });
      if (W > 20) for (const [x, y] of [[3, 3], [W - 5, 3]]) rivet(c, x, y, b, 3);
    } else if (style === 'lit') {
      // A dark lightbox: metal frame, letters lit from behind, a halo ring.
      const b = k.ramp(lum(s.board) > 0.4 ? 0x1a1c22 : s.board, { light: 0.45, sat: 0.9 });
      const ink = k.ramp(s.ink, { light: 0.6, sat: 1.1 });
      c.rect(0, 0, W, H, b, 2);
      c.frame(0, 0, W, H, b, 3.5);
      c.hline(0, 0, W, b, 4.5);
      c.hline(0, H - 1, W, b, 1);
      neonText(c, s.text, tx, ty, f, ink, { scale, core: 5, halo: 2, tube: 0 });
      // The odd dead letter segment (tubes failing).
      for (let i = 0; i < 2; i++) {
        const x = tx + rng.int(0, Math.max(0, tw - 1));
        for (let y = ty; y < ty + th; y++) if (c.at(x, y) === ink && hash2(x, y, 3) > 0.5) c.set(x, y, ink, 2);
      }
    } else {
      const b = k.ramp(s.board, { light: 0.5, sat: 1.0 });
      const ink = k.ramp(s.ink, { light: 0.45 });
      plate(c, 0, 0, W, H, b, { tone: 3, shadow: false });
      if (style === 'hazard') {
        const blk = k.ramp(0x1a1a1e, { light: 0.4 });
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const edge = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
          if (edge && Math.floor((x + y) / 3) % 2) c.set(x, y, blk, 2);
        }
      }
      drawText(c, s.text, tx, ty, f, ink, 3, { scale, shadow: lum(s.ink) > lum(s.board) ? { ramp: b, tone: 1 } : undefined });
      if (W > 14 && H > 8) for (const [x, y] of [[1, 1], [W - 3, 1], [1, H - 3], [W - 3, H - 3]]) rivet(c, x, y, b, 3);
      // Chipped enamel, a rust run under a screw.
      c.scatter(rng, 1, 1, W - 2, H - 2, Math.round((W * H) / 60), 0, -1, { shapes: 3 });
      if (H > 8) for (let j = 0; j < 4; j++) if (bayer(W - 2, H - 1 + j) < 0.6) c.shift(W - 2, Math.min(H - 1, 2 + j), -0.75);
    }
  });
}

/**
 * Painted wall lettering (cut out, laid just off the wall): stencilled letters
 * with overspray (plain) or glowing letters with a halo (lit labels). Sized to
 * the classic block letters (`px` m per glyph pixel).
 */
export function d2WallTextTile(atlas: PwAtlas, text: string, px: number, color: number, glow: boolean): { tile: PwTile; wM: number; hM: number } {
  // Big lettering is painted at up to 3 texels a glyph pixel and laid at the classic size (chunkier texels, a fraction of the paint).
  const want = Math.max(1, Math.round(px * 32));
  const scale = Math.min(3, want);
  const stretch = want / scale;
  const f = FONT_5x7;
  const tw = textWidth(text, f, { scale });
  const th = f.base * scale;
  const W = tw + 4;
  const H = th + 4;
  const tile = atlas.tile(`d2walltext|${text}|${scale}|${h6(color)}|${glow ? 1 : 0}`, W, H, (c, k) => {
    const ink = k.ramp(color, { light: glow ? 0.6 : 0.45, sat: glow ? 1.1 : 0.9 });
    if (glow) neonText(c, text, 2, 2, f, ink, { scale, core: 5, halo: 2, tube: scale >= 4 ? 2 : 0 });
    else {
      drawText(c, text, 2, 2, f, ink, 3, { scale, shadeFn: (u, v) => (hash2(Math.round(u * 9), Math.round(v * 9), 4) > 0.85 ? -1 : 0) });
      // Worn paint: gaps where it flaked.
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (c.at(x, y) && hash2(x, y, 17) > 0.9) c.set(x, y, 0, 0);
      // A run under a few strokes.
      for (let i = 0; i < Math.max(1, (scale * text.length) >> 3); i++) {
        const x = 2 + k.rng.int(0, Math.max(0, tw - 1));
        let y = 2 + th - 1;
        while (y > 2 && !c.at(x, y)) y--;
        if (c.at(x, y)) for (let j = 1; j < 2 + scale; j++) if (y + j < H) c.set(x, y + j, ink, 2.5);
      }
    }
  });
  return { tile, wM: (W / 32) * stretch, hM: (H / 32) * stretch };
}

/**
 * A door leaf (fit on both faces of the classic panel box):
 *  - wood: four raised panels, a push plate, scuffed kick rail, claw gouges;
 *  - steel: riveted plate with three ribs, a small wired window, hazard kick plate;
 *  - lab: white laminate with a vision panel, a yellow / black kick plate,
 *    a biohazard sticker.
 * ~32 texels a metre over the panel.
 */
export function d2DoorTile(atlas: PwAtlas, style: 'wood' | 'steel' | 'lab', wM: number, hM: number): PwTile {
  const W = Math.max(16, Math.round(wM * 32));
  const H = Math.max(24, Math.round(hM * 32));
  return atlas.tile(`d2door|${style}|${W}x${H}`, W, H, (c, k) => {
    const rng = k.rng;
    if (style === 'wood') {
      const w = k.ramp(0x6e4c2e, { light: 0.45, sat: 0.95 });
      const brass = k.ramp(0xc8a24c, { light: 0.55 });
      c.rect(0, 0, W, H, w, 3);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.abs(Math.sin(x * 0.9 + Math.sin(y * 0.07) * 2)) > 0.97) c.shift(x, y, -0.75);
      c.frame(0, 0, W, H, w, 1.5);
      const pw = Math.floor((W - 9) / 2);
      const ph = Math.floor((H - 12) / 2);
      for (const [x, y] of [[3, 3], [6 + pw, 3], [3, 8 + ph], [6 + pw, 8 + ph]]) {
        c.rect(x, y, pw, ph, w, 3);
        c.bevel(x, y, pw, ph, true, 1, 1.25, 2);
      }
      c.rect(W - 9, Math.round(H * 0.45), 4, 7, brass, 3);
      c.set(W - 9, Math.round(H * 0.45), brass, 5);
      clawMarks(c, Math.round(W * 0.35), Math.round(H * 0.3), Math.round(H * 0.35), 1.2, { n: 4, gap: 3, depth: 2, wrap: false });
      scuffs(c, rng, 1, H - 10, W - 2, 8, 10, -1);
    } else if (style === 'steel') {
      const m = k.ramp(0x8a9098, { light: 0.5, sat: 0.6 });
      const win = k.ramp(0x9ad0ff, { light: 0.5 });
      const haz = k.ramp(0xe0b020, { light: 0.45 });
      const blk = k.ramp(0x1a1a1e, { light: 0.4 });
      c.rect(0, 0, W, H, m, 3);
      c.frame(0, 0, W, H, m, 1.5);
      for (let i = 0; i < 3; i++) {
        const y = Math.round(16 + (i * (H - 32)) / 2);
        c.rect(2, y, W - 4, 3, m, 3.5);
        c.hline(2, y, W - 4, m, 4.5);
        c.hline(2, y + 3, W - 4, m, 1.5);
      }
      for (let x = 3; x < W - 2; x += 5) for (const y of [2, H - 3]) c.set(x, y, m, 4.5);
      const wx = Math.round(W / 2 - 6);
      c.rect(wx, 10, 12, 12, m, 1);
      c.rect(wx + 1, 11, 10, 10, win, 2, PWF.GLOW);
      for (let q = 0; q < 10; q += 3) {
        c.hline(wx + 1, 11 + q, 10, win, 1, PWF.GLOW);
        c.vline(wx + 1 + q, 11, 10, win, 1, PWF.GLOW);
      }
      for (let y = H - 8; y < H - 1; y++) for (let x = 1; x < W - 1; x++) c.set(x, y, Math.floor((x + y) / 4) % 2 ? blk : haz, 3);
      for (let i = 0; i < 6; i++) c.lineShade(rng.int(2, W - 8), rng.int(4, H - 12), rng.int(2, W - 2), rng.int(4, H - 12), 1);
      c.ellipseShade(W * 0.6, H * 0.55, 5, 4, (d) => (d > 0.6 ? 0.75 : -0.75));
    } else {
      const lam = k.ramp(0xd0d6da, { light: 0.45, sat: 0.6 });
      const glass = k.ramp(0x1a2a34, { light: 0.45 });
      const haz = k.ramp(0xffc020, { light: 0.45 });
      const blk = k.ramp(0x1a1a1e, { light: 0.4 });
      const red = k.ramp(0xc02020, { light: 0.45 });
      c.rect(0, 0, W, H, lam, 3);
      c.frame(0, 0, W, H, lam, 1.5);
      c.vline(1, 1, H - 2, lam, 4);
      // Vision panel (wired glass, dark lab beyond).
      const vx = Math.round(W * 0.25);
      const vw = Math.round(W * 0.5);
      c.rect(vx - 1, Math.round(H * 0.55) - 1, vw + 2, Math.round(H * 0.25) + 2, lam, 1.5);
      c.rect(vx, Math.round(H * 0.55), vw, Math.round(H * 0.25), glass, 2);
      for (let q = 0; q < vw; q += 4) c.vline(vx + q, Math.round(H * 0.55), Math.round(H * 0.25), glass, 3);
      // Kick plate.
      for (let y = H - 9; y < H - 1; y++) for (let x = 1; x < W - 1; x++) c.set(x, y, Math.floor((x + y) / 4) % 2 ? blk : haz, 3);
      // Biohazard sticker.
      const sx = Math.round(W / 2);
      const sy = Math.round(H * 0.4);
      c.ellipse(sx, sy, 4, 4, haz, 3);
      c.ellipse(sx, sy, 1.5, 1.5, blk, 2);
      for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) c.ellipse(sx + Math.cos(a) * 2.5, sy + Math.sin(a) * 2.5, 1.2, 1.2, blk, 2);
      c.rect(Math.round(W * 0.2), Math.round(H * 0.18), Math.round(W * 0.6), 4, red, 3);
      bulletHole(c, rng, Math.round(W * 0.7), Math.round(H * 0.35));
      scuffs(c, rng, 1, H - 12, W - 2, 4, 6, -1);
    }
  });
}
