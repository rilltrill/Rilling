import { PWF, PW_TPM, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit } from './atlas';
import { FONT_5x7, FONT_BOLD, rasterText, textWidth, type PixelFont } from './font';
import { hash2 } from './surfaces';
import type { SignTile } from './signs';

/**
 * MAIN STREET's cinema signs in ART: PIXEL WORLD, painted to read at street
 * distance (the shared marquee's one-texel strokes vanish into the lit face a
 * few metres off):
 *  - `z1Marquee`: the RIALTO's changeable-letter marquee — dark slotted letters
 *    (2-texel strokes, on even texels so the first coarse level keeps them
 *    whole) hung on ribbed rails across a warm white lit face, a dark rail
 *    between the lines, chase bulbs top and bottom, one letter hanging askew;
 *  - `z1MarqueeEnd`: its end panels with the cinema's name the same way.
 */

const G = PWF.GLOW;

function sized(tile: ReturnType<PwAtlas['tile']>): SignTile {
  return { tile, wM: tile.w / PW_TPM, hM: tile.h / PW_TPM };
}

/** Letter slots: each glyph of `text` drawn at 2× (2-texel strokes) from (x, y), even-aligned, with a per-letter hang. */
function slotted(c: PwCanvas, f: PixelFont, text: string, x: number, y: number, ink: number, hang: (i: number) => number) {
  let cx = x;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = textWidth(ch, f, { scale: 2 });
    if (ch !== ' ') {
      const m = rasterText(ch, f, { scale: 2 });
      const dy = hang(i);
      for (let my = 0; my < m.h; my++) {
        for (let mx = 0; mx < m.w; mx++) {
          if (!m.data[my * m.w + mx]) continue;
          c.set(cx + mx, y + my + dy, ink, 0.6, G);
        }
      }
    }
    cx += w + 2;
  }
}

function slottedWidth(f: PixelFont, text: string): number {
  let w = 0;
  for (const ch of text) w += textWidth(ch, f, { scale: 2 }) + 2;
  return w - 2;
}

/** The marquee face: `lines` (one or two) of slotted letters, W × H texels. */
export function z1Marquee(atlas: PwAtlas, lines: string[], o: { widthM: number; heightM: number }): SignTile {
  const W = Math.round((o.widthM * PW_TPM) / 2) * 2;
  const H = Math.round((o.heightM * PW_TPM) / 2) * 2;
  return sized(atlas.tile(`z1marquee|${lines.join('/')}|${W}x${H}`, W, H, (c, k) => paintMarquee(c, k, lines, W, H)));
}

function paintMarquee(c: PwCanvas, k: PwKit, lines: string[], W: number, H: number) {
  const face = k.ramp(0xf4e2c0, { light: 0.35 });
  const ink = k.ramp(0x2a0e12, { light: 0.4 });
  const rail = k.ramp(0x6a4a40, { light: 0.4 });
  const frame = k.ramp(0x4a2228, { light: 0.45 });
  const bulb = k.ramp(0xffe0a0, { light: 0.6 });
  // Frame and the lit face (a warm white, a little brighter toward the middle rows).
  c.rect(0, 0, W, H, frame, 2);
  c.hline(0, 0, W, frame, 4);
  c.hline(0, H - 1, W, frame, 1);
  const n = lines.length;
  const LH = 14;
  const gap = 4;
  const top = Math.round((H - (n * LH + (n - 1) * gap)) / 2 / 2) * 2;
  c.rect(3, 3, W - 6, H - 6, face, 3.4, G);
  for (let y = 3; y < H - 3; y++) if (y - top < 0 || y - top >= n * LH + (n - 1) * gap) c.hline(3, y, W - 6, face, 3, G);
  // Rails: a dark ridge over and under every line (the letters hang on them), the gap between lines darker.
  for (let i = 0; i < n; i++) {
    const y0 = top + i * (LH + gap);
    c.hline(3, y0 - 1, W - 6, rail, 2, G);
    c.hline(3, y0 + LH, W - 6, rail, 2, G);
    if (i < n - 1) c.rect(3, y0 + LH + 1, W - 6, gap - 2, rail, 1, G);
  }
  // The letters (even-aligned x and y), the odd one hanging a texel low, one swinging two.
  lines.forEach((ln, i) => {
    // Bold letters where they fit (4-texel uprights read from across the street), else the plain face.
    const f = slottedWidth(FONT_BOLD, ln) <= W - 12 ? FONT_BOLD : FONT_5x7;
    const tw = slottedWidth(f, ln);
    const x = Math.round((W - tw) / 2 / 2) * 2;
    const y = top + i * (LH + gap);
    const askew = Math.floor(hash2(i, ln.length, 7) * ln.length);
    slotted(c, f, ln, x, y, ink, (j) => (j === askew && ln[j] !== ' ' ? 2 : 0));
  });
  // Chase bulbs top and bottom (alternate brighter), a dead one here and there.
  for (let x = 4; x < W - 4; x += 6) {
    const dead = hash2(x, H, 3) > 0.9;
    c.set(x, 1, bulb, dead ? 1 : (x / 6) % 2 ? 5 : 3, G);
    c.set(x + 1, 1, bulb, dead ? 1 : 3, G);
    c.set(x, H - 2, bulb, dead ? 1 : (x / 6) % 2 ? 3 : 5, G);
    c.set(x + 1, H - 2, bulb, dead ? 1 : 3, G);
  }
}

/** An end panel: the name in slotted letters on the same lit face. */
export function z1MarqueeEnd(atlas: PwAtlas, text: string, o: { widthM: number; heightM: number }): SignTile {
  return z1Marquee(atlas, [text], o);
}
