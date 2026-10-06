import { PWF, PW_TPM, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD, FONT_TALL, neonText, textHeight, textWidth, type PixelFont } from './font';

/**
 * PixelWorld signage — every sign painted with the pixel fonts (no extruded
 * block letters):
 *  - `neonSign`: a dark riveted board with neon-tube letters (glow core, a ring
 *    of glow pixels, a darker lower tube edge) and a neon border tube;
 *  - `bladeSign`: the same, letters stacked (projecting "HOTEL" signs);
 *  - `lightbox`: a backlit plastic box (glowing face, painted letters);
 *  - `marquee`: a cinema marquee board (white backlit, black tall letters,
 *    chase-bulb border);
 *  - `paintedSign`: letters painted on wood / metal (lit, weathered);
 *  - `roadSign`: STOP / speed / arrow / warning plates.
 * Each returns the tile and its size in metres at PW_TPM (lay it with
 * `PwBatch.rect(o, ux, vy, wM, hM, tile)`).
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

export interface SignTile {
  tile: PwTile;
  wM: number;
  hM: number;
}

export type SignFont = 'bold' | 'tall' | 'regular' | 'script' | 'tiny';

function fontOf(f: SignFont): PixelFont {
  return f === 'bold' ? FONT_BOLD : f === 'tall' ? FONT_TALL : f === 'tiny' ? FONT_3x5 : FONT_5x7;
}

/** Neon is bent tube: its skeleton comes from the regular glyphs (a bold glyph would draw doubled tubes). */
function neonFontOf(f: SignFont): PixelFont {
  return f === 'tiny' ? FONT_3x5 : f === 'tall' ? FONT_TALL : FONT_5x7;
}

function sized(tile: PwTile): SignTile {
  return { tile, wM: tile.w / PW_TPM, hM: tile.h / PW_TPM };
}

/** Whole-texel scale that makes a font's caps about `capM` metres tall. */
export function fontScaleFor(f: SignFont, capM: number): number {
  const font = fontOf(f);
  return Math.max(1, Math.round((capM * PW_TPM) / font.base));
}

export interface NeonOpts {
  font?: SignFont;
  /** Cap height (m) — picks a whole-texel scale. */
  cap?: number;
  scale?: number;
  /** Board colour (dark metal); 0 = no board (letters on their own, cut out). */
  back?: number;
  /** Neon border tube (default on). */
  border?: boolean;
  /** Border tube colour (default the letters'). */
  borderColor?: number;
  /** Padding around the text (texels). */
  pad?: number;
  /** Minimum board size (texels): match the classic board the sign replaces (text centred). */
  minW?: number;
  minH?: number;
}

/** Neon-tube letters on a dark riveted board. */
export function neonSign(atlas: PwAtlas, text: string, color: number, o: NeonOpts = {}): SignTile {
  const font = o.font ?? 'bold';
  const scale = o.scale ?? fontScaleFor(font, o.cap ?? 0.45);
  const f = neonFontOf(font);
  const to = { scale, script: font === 'script', spacing: 1 };
  const pad = o.pad ?? 4 + scale * 2;
  const tw = textWidth(text, f, to);
  const th = (font === 'script' ? f.h : f.base) * scale;
  const W = Math.ceil(Math.max(tw + pad * 2, o.minW ?? 0) / 2) * 2;
  const H = Math.ceil(Math.max(th + pad * 2, o.minH ?? 0) / 2) * 2;
  const key = `neon|${text}|${h6(color)}|${font}|${scale}|${h6(o.back ?? 0x1c1c22)}|${o.border === false ? 0 : 1}|${h6(o.borderColor ?? color)}|${pad}|${W}|${H}`;
  return sized(
    atlas.tile(key, W, H, (c, k) => {
      const neon = k.ramp(color, { light: 0.55, sat: 1.1 });
      const border = k.ramp(o.borderColor ?? color, { light: 0.55, sat: 1.1 });
      if (o.back !== 0) board(c, k, o.back ?? 0x1c1c22);
      if (o.border !== false && o.back !== 0) tubeRect(c, 3, 3, W - 6, H - 6, border);
      neonText(c, text, Math.round((W - tw) / 2), Math.round((H - th) / 2), f, neon, { ...to, core: 5, halo: 2 });
    }),
  );
}

/** Vertical blade sign: letters stacked on a tall board, neon border. */
export function bladeSign(atlas: PwAtlas, text: string, color: number, o: NeonOpts = {}): SignTile {
  const font = o.font ?? 'bold';
  const scale = o.scale ?? fontScaleFor(font, o.cap ?? 0.5);
  const f = neonFontOf(font);
  const to = { scale, vertical: true };
  const pad = o.pad ?? 4 + scale * 2;
  const tw = f.w * scale;
  const th = textHeight(text, f, to);
  const W = Math.ceil((tw + pad * 2) / 2) * 2;
  const H = Math.ceil((th + pad * 2) / 2) * 2;
  const key = `blade|${text}|${h6(color)}|${font}|${scale}|${h6(o.back ?? 0x1a1a20)}|${pad}`;
  return sized(
    atlas.tile(key, W, H, (c, k) => {
      const neon = k.ramp(color, { light: 0.55, sat: 1.1 });
      board(c, k, o.back ?? 0x1a1a20);
      tubeRect(c, 3, 3, W - 6, H - 6, neon);
      neonText(c, text, Math.round((W - tw) / 2), Math.round((H - th) / 2), f, neon, { ...to, core: 5, halo: 2 });
    }),
  );
}

/**
 * The outer edge of a projecting blade sign (seen edge-on down the street): the
 * neon outline tube running up it on dark metal. 8 × 16, stretched over the edge.
 */
export function neonEdge(atlas: PwAtlas, color: number, back = 0x1a1a20): PwTile {
  return atlas.tile(`neonedge|${h6(color)}|${h6(back)}`, 8, 16, (c, k) => {
    const b = k.ramp(back, { light: 0.5, sat: 0.8 });
    const neon = k.ramp(color, { light: 0.55, sat: 1.1 });
    c.rect(0, 0, 8, 16, b, 2);
    c.vline(0, 0, 16, b, 3);
    c.vline(7, 0, 16, b, 1);
    for (const [x, t] of [[2, 2], [3, 5], [4, 4], [5, 2]] as const) for (let y = 0; y < 16; y++) c.set(x, y, neon, t, PWF.GLOW);
  });
}

/** Backlit plastic lightbox: a glowing face with painted letters, a metal frame. */
export function lightbox(atlas: PwAtlas, text: string, face: number, ink: number, o: { font?: SignFont; cap?: number } = {}): SignTile {
  const font = o.font ?? 'bold';
  const scale = fontScaleFor(font, o.cap ?? 0.35);
  const f = fontOf(font);
  const tw = textWidth(text, f, { scale });
  const th = f.base * scale;
  const W = Math.ceil((tw + 12) / 2) * 2;
  const H = Math.ceil((th + 10) / 2) * 2;
  return sized(
    atlas.tile(`lightbox|${text}|${h6(face)}|${h6(ink)}|${font}|${scale}`, W, H, (c, k) => {
      const fr = k.ramp(0x4a4c52, { light: 0.5, sat: 0.6 });
      const fc = k.ramp(face, { light: 0.5 });
      const ic = k.ramp(ink, { light: 0.4 });
      c.rect(0, 0, W, H, fr, 3);
      c.hline(0, 0, W, fr, 4);
      c.hline(0, H - 1, W, fr, 1);
      c.vline(W - 1, 0, H, fr, 2);
      // Face: brighter in the middle (tubes behind), dimmer at the edges.
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) c.set(x, y, fc, y < 4 || y > H - 5 ? 3 : 4, PWF.GLOW);
      drawText(c, text, Math.round((W - tw) / 2), Math.round((H - th) / 2), f, ic, 1, { scale, flag: PWF.GLOW });
      // Dead tube: a darker band.
      if (text.length % 3 === 0) for (let x = 2; x < W - 2; x++) c.set(x, H >> 1, fc, 3, PWF.GLOW);
    }),
  );
}

/** Cinema marquee board: white backlit face, black tall letters on rails, a chase-bulb border. */
export function marquee(atlas: PwAtlas, lines: string[], o: { widthM: number; heightM: number }): SignTile {
  const W = Math.round((o.widthM * PW_TPM) / 2) * 2;
  const H = Math.round((o.heightM * PW_TPM) / 2) * 2;
  return sized(
    atlas.tile(`marquee|${lines.join('/')}|${W}x${H}`, W, H, (c, k) => {
      const face = k.ramp(0xfff2d8, { light: 0.4 });
      const ink = k.ramp(0x1a1214, { light: 0.4 });
      const frame = k.ramp(0x5a2a30, { light: 0.45 });
      const bulb = k.ramp(0xffe0a0, { light: 0.6 });
      c.rect(0, 0, W, H, frame, 3);
      c.hline(0, 0, W, frame, 4);
      c.hline(0, H - 1, W, frame, 1);
      for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) c.set(x, y, face, (y - 5) % 9 === 8 ? 3 : 4, PWF.GLOW);
      const n = lines.length;
      lines.forEach((ln, i) => {
        const f = i === 0 ? FONT_TALL : FONT_BOLD;
        const tw = textWidth(ln, f, { spacing: 1 });
        const th = f.base;
        const y = Math.round(5 + ((H - 10) * (i + 0.5)) / n - th / 2);
        drawText(c, ln, Math.round((W - tw) / 2), y, f, ink, 0, { flag: PWF.GLOW, spacing: 1 });
      });
      // Chase bulbs round the frame (alternate brighter: the stage animates nothing here, it is the look).
      for (let x = 2; x < W - 2; x += 4) {
        c.set(x, 2, bulb, (x >> 2) % 2 ? 5 : 3, PWF.GLOW);
        c.set(x, H - 3, bulb, (x >> 2) % 2 ? 3 : 5, PWF.GLOW);
      }
      for (let y = 6; y < H - 4; y += 4) {
        c.set(2, y, bulb, 4, PWF.GLOW);
        c.set(W - 3, y, bulb, 4, PWF.GLOW);
      }
    }),
  );
}

/** Letters painted on boards / a metal plate (lit by the scene): a park sign, a shop fascia, a notice. */
export function paintedSign(atlas: PwAtlas, text: string, o: { ground: number; ink: number; font?: SignFont; cap?: number; planks?: boolean; frame?: number }): SignTile {
  const font = o.font ?? 'bold';
  const scale = fontScaleFor(font, o.cap ?? 0.3);
  const f = fontOf(font);
  const tw = textWidth(text, f, { scale });
  const th = f.base * scale;
  const W = Math.ceil((tw + 14) / 2) * 2;
  const H = Math.ceil((th + 12) / 2) * 2;
  return sized(
    atlas.tile(`painted|${text}|${h6(o.ground)}|${h6(o.ink)}|${font}|${scale}|${o.planks ? 1 : 0}|${h6(o.frame ?? o.ground)}`, W, H, (c, k) => {
      const gr = k.ramp(o.ground, { light: 0.42 });
      const ink = k.ramp(o.ink, { light: 0.42 });
      const fr = k.ramp(o.frame ?? o.ground, { light: 0.42 });
      c.rect(0, 0, W, H, gr, 3);
      if (o.planks) {
        for (let y = 0; y < H; y += 8) {
          c.hline(0, y, W, gr, 1);
          c.hline(0, y + 1, W, gr, 4);
          for (let g = 0; g < 3; g++) c.hline(k.rng.int(0, W - 8), y + k.rng.int(3, 6), k.rng.int(4, 10), gr, 2);
        }
      }
      c.frame(0, 0, W, H, fr, 2);
      c.hline(0, 0, W, fr, 4);
      c.vline(0, 0, H, fr, 4);
      drawText(c, text, Math.round((W - tw) / 2), Math.round((H - th) / 2), f, ink, 3, { scale, shadow: { ramp: gr, tone: 1 }, shadeFn: (_u, v) => (v < 0.3 ? 1 : 0) });
      // Weathering: flaked paint specks.
      c.scatter(k.rng, 1, 1, W - 2, H - 2, Math.round((W * H) / 90), 0, -1, { shapes: 3 });
    }),
  );
}

export type RoadSignKind = 'stop' | 'speed' | 'arrowL' | 'arrowR' | 'warning' | 'detour';

/** Road sign plates (cut out round their shape), 24 × 24 (0.75 m) or 32 × 16 for arrows / detour. */
export function roadSign(atlas: PwAtlas, kind: RoadSignKind, text = ''): SignTile {
  const wide = kind === 'arrowL' || kind === 'arrowR' || kind === 'detour';
  const W = wide ? 32 : 24;
  const H = wide ? 16 : 24;
  return sized(
    atlas.tile(`road|${kind}|${text}`, W, H, (c, k) => {
      const white = k.ramp(0xe8e8e0, { light: 0.3, sat: 0.5 });
      if (kind === 'stop') {
        const red = k.ramp(0xc02020, { light: 0.4 });
        const pts: number[] = [];
        for (let i = 0; i < 8; i++) {
          const a = ((i + 0.5) / 8) * Math.PI * 2;
          pts.push(12 + Math.cos(a) * 11.6, 12 + Math.sin(a) * 11.6);
        }
        c.poly(pts, white, 3);
        const inner: number[] = [];
        for (let i = 0; i < 8; i++) {
          const a = ((i + 0.5) / 8) * Math.PI * 2;
          inner.push(12 + Math.cos(a) * 10.4, 12 + Math.sin(a) * 10.4);
        }
        c.poly(inner, red, 3);
        drawText(c, 'STOP', 4, 10, FONT_3x5, white, 4);
      } else if (kind === 'speed') {
        c.rect(1, 0, 22, 24, white, 3);
        c.frame(2, 1, 20, 22, k.ramp(0x1a1a20, { light: 0.4 }), 1);
        drawText(c, 'SPEED', 3, 3, FONT_3x5, k.ramp(0x1a1a20, { light: 0.4 }), 1);
        drawText(c, text || '25', 6, 11, FONT_5x7, k.ramp(0x1a1a20, { light: 0.4 }), 1);
      } else if (kind === 'warning') {
        const y = k.ramp(0xe8c020, { light: 0.4 });
        const ink = k.ramp(0x1a1a20, { light: 0.4 });
        c.poly([12, 0.5, 23.5, 12, 12, 23.5, 0.5, 12], ink, 1);
        c.poly([12, 2, 22, 12, 12, 22, 2, 12], y, 3);
        drawText(c, text || '!', 10, 9, FONT_5x7, ink, 1);
      } else {
        const bg = k.ramp(kind === 'detour' ? 0xe08020 : 0x1a1a20, { light: 0.4 });
        c.rect(0, 0, W, H, bg, 3);
        c.frame(1, 1, W - 2, H - 2, white, 3);
        if (kind === 'detour') drawText(c, 'DETOUR', 3, 5, FONT_3x5, k.ramp(0x1a1a20, { light: 0.4 }), 1);
        else {
          const dir = kind === 'arrowL' ? -1 : 1;
          const cx = 16;
          for (let x = -9; x <= 9; x++) {
            const ax = cx + x * dir;
            const head = x > 3;
            const hh = head ? 9 - x + 3 : 2;
            c.vline(ax, 8 - Math.min(5, hh), Math.min(5, hh) * 2, white, 4);
          }
        }
      }
      // Bolt heads.
      c.set(W >> 1, 2, white, 1);
    }),
  );
}

/**
 * A backlit movie poster (GLOW, 36 × 52 ≈ 1.1 × 1.6 m): a painted night scene —
 * moon, a figure in silhouette, a screaming face or a hand — with the title in
 * bold caps and the credits block in tiny type. `variant` picks the film.
 */
export function moviePoster(atlas: PwAtlas, variant: number): SignTile {
  const films = [
    { title: 'NIGHT', sub: 'OF THE', bg: 0x2a1030, fg: 0xd83a3a, moon: 0xe8e0a0 },
    { title: 'DEAD', sub: 'RISING', bg: 0x10202e, fg: 0x8ad83a, moon: 0xc8d8ff },
    { title: 'FANGS', sub: 'BEWARE', bg: 0x301010, fg: 0xe8c040, moon: 0xffb080 },
    { title: 'HEX', sub: 'THE', bg: 0x182a18, fg: 0xe85ac8, moon: 0xe8e8e8 },
  ];
  const f = films[((variant % films.length) + films.length) % films.length];
  return sized(
    atlas.tile(`movie|${f.title}`, 36, 52, (c, k) => {
      const bg = k.ramp(f.bg, { light: 0.45, sat: 1.1 });
      const fg = k.ramp(f.fg, { light: 0.5 });
      const moon = k.ramp(f.moon, { light: 0.5 });
      const frame = k.ramp(0x3a3a40, { light: 0.5 });
      c.rect(0, 0, 36, 52, frame, 3);
      c.hline(0, 0, 36, frame, 4);
      c.vline(35, 0, 52, frame, 1);
      // Night sky gradient (dithered), the moon, a hill line, a figure.
      for (let y = 2; y < 50; y++) for (let x = 2; x < 34; x++) c.set(x, y, bg, 1 + (y / 50) * 2.2, PWF.GLOW | PWF.DITHER);
      c.ellipse(24, 14, 6, 6, moon, 4, PWF.GLOW);
      c.ellipse(26, 12, 2, 2, moon, 3, PWF.GLOW);
      for (let x = 2; x < 34; x++) {
        const hy = 38 + Math.round(Math.sin(x * 0.3) * 2);
        for (let y = hy; y < 44; y++) c.set(x, y, bg, 0, PWF.GLOW);
      }
      // Figure: head, shoulders, raised arms (a shambler against the moon).
      const fx = 15;
      c.ellipse(fx, 22, 2.5, 3, bg, 0, PWF.GLOW);
      c.rect(fx - 4, 25, 9, 14, bg, 0, PWF.GLOW);
      c.line(fx - 4, 26, fx - 9, 19, bg, 0, PWF.GLOW);
      c.line(fx + 4, 26, fx + 8, 20, bg, 0, PWF.GLOW);
      c.set(fx - 1, 21, fg, 5, PWF.GLOW);
      c.set(fx + 1, 21, fg, 5, PWF.GLOW);
      // Title + credits.
      drawText(c, f.sub, 18 - textWidth(f.sub, FONT_3x5) / 2, 3, FONT_3x5, fg, 4, { flag: PWF.GLOW });
      drawText(c, f.title, Math.round(18 - textWidth(f.title, FONT_BOLD) / 2), 44, FONT_BOLD, fg, 4, { flag: PWF.GLOW, shadeFn: (_u, v) => (v < 0.3 ? 1 : 0) });
    }),
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** A dark riveted sign board: lit top edge, shaded bottom / right, rivets, grime. */
function board(c: PwCanvas, k: PwKit, hex: number) {
  const b = k.ramp(hex, { light: 0.5, sat: 0.8 });
  const W = c.w;
  const H = c.h;
  c.rect(0, 0, W, H, b, 2);
  c.hline(0, 0, W, b, 4);
  c.vline(0, 0, H, b, 3);
  c.hline(0, H - 1, W, b, 0);
  c.vline(W - 1, 0, H, b, 1);
  for (const [x, y] of [
    [1, 1],
    [W - 3, 1],
    [1, H - 3],
    [W - 3, H - 3],
  ]) {
    c.set(x + 1, y + 1, b, 4);
    c.set(x + 1, y + 2, b, 1);
  }
  c.scatter(k.rng, 2, 2, W - 4, H - 4, Math.round((W * H) / 120), 0, 1, { shapes: 2 });
}

/** A neon tube rectangle (glow core with its halo ring inside the board). */
function tubeRect(c: PwCanvas, x: number, y: number, w: number, h: number, ramp: number) {
  const put = (px: number, py: number, t: number) => c.set(px, py, ramp, t, PWF.GLOW);
  for (let i = 0; i < w; i++) {
    put(x + i, y, 5);
    put(x + i, y + h - 1, 4);
    if (i > 0 && i < w - 1) {
      put(x + i, y + 1, 2);
      put(x + i, y + h - 2, 2);
    }
  }
  for (let j = 1; j < h - 1; j++) {
    put(x, y + j, 5);
    put(x + w - 1, y + j, 4);
    if (j > 1 && j < h - 2) {
      put(x + 1, y + j, 2);
      put(x + w - 2, y + j, 2);
    }
  }
}
