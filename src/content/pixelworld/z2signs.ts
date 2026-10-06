import { bayer, PW_TPM, PWF, type PwCanvas } from './canvas';
import type { PwAtlas } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD, neonText, rasterText, textWidth, type PixelFont } from './font';
import type { SignTile } from './signs';
import { hash2 } from './surfaces';
import { mixHex } from './z2surfaces';

/**
 * ST. MERCY HOSPITAL signage for PIXEL WORLD — every classic block-letter sign
 * becomes a painted one in the pixel fonts, at the classic sign's size (its
 * font pixel `px` metres → a whole texel scale):
 *  - `z2LitSign`: lit letters on a dark sign box (channel letters with a dark
 *    return and a soft halo; neon tubes for EMERGENCY), dead letters drawn
 *    unlit, a riveted frame;
 *  - `z2PlateSign`: printed / engraved plates (room numbers, wayfinding with
 *    arrows, DANGER), screws and wear;
 *  - `z2ExitSign`: the green EXIT lightbox;
 *  - `z2Stencil`: spray-stencilled letters (cut out) for floors and walls;
 *  - `z2Poster`: notices, posters, a cork board, a framed print.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

function sized(tile: SignTile['tile']): SignTile {
  return { tile, wM: tile.w / PW_TPM, hM: tile.h / PW_TPM };
}

/** Split trailing / leading arrow tokens off a label ("WARD 3 >" → text + arrow). */
function arrows(text: string): { text: string; left: boolean; right: boolean; down: boolean } {
  let t = text.trim();
  let left = false;
  let right = false;
  let down = false;
  if (t.endsWith(' >')) (right = true), (t = t.slice(0, -2));
  if (t.endsWith(' v')) (down = true), (t = t.slice(0, -2));
  if (t.startsWith('< ')) (left = true), (t = t.slice(2));
  return { text: t, left, right, down };
}

/** A filled arrow glyph (`size` texels tall) pointing right / left / down at (x, y) top-left. */
function arrow(c: PwCanvas, x: number, y: number, size: number, dir: 'r' | 'l' | 'd', ramp: number, tone: number, flag = 0) {
  const h = size;
  const half = Math.floor(h / 2);
  if (dir === 'd') {
    for (let r = 0; r < h; r++) {
      const w = r < half ? Math.max(1, Math.round(h * 0.18)) : (h - r) * 2 - 1;
      const cx = x + half;
      if (r < half) c.rect(cx - (w >> 1), y + r, w, 1, ramp, tone, flag);
      else c.rect(cx - (w >> 1), y + r, w, 1, ramp, tone, flag);
    }
    return;
  }
  const shaft = Math.max(1, Math.round(h * 0.3));
  for (let col = 0; col < h; col++) {
    const xx = dir === 'r' ? x + col : x + h - 1 - col;
    if (col < half) c.rect(xx, y + half - (shaft >> 1), 1, shaft, ramp, tone, flag);
    else {
      const span = (h - col) * 2 - 1;
      c.rect(xx, y + half - (span >> 1), 1, span, ramp, tone, flag);
    }
  }
}

function screws(c: PwCanvas, W: number, H: number, ramp: number) {
  for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) {
    c.set(x, y, ramp, 1);
    c.set(x + 1, y + 1, ramp, 4);
  }
}

export interface LitSignOpts {
  /** Classic font pixel (m): sets the texel scale. */
  px: number;
  /** Sign box colour (null = letters alone on the wall). */
  plate?: number | null;
  /** Dead letters (indices into the text, spaces count). */
  broken?: number[];
  /** Neon tubes instead of channel letters. */
  neon?: boolean;
}

/** Lit letters on a dark sign box (see file doc). */
export function z2LitSign(atlas: PwAtlas, text: string, color: number, o: LitSignOpts): SignTile {
  const s = Math.max(1, Math.round(o.px * PW_TPM));
  const small = s === 1 && o.px < 0.026;
  const f: PixelFont = small ? FONT_3x5 : FONT_5x7;
  const to = { scale: s, spacing: s >= 3 ? 1 : 0 };
  const tw = textWidth(text, f, to);
  const th = f.base * s;
  const padX = Math.max(3, s * 2 + 1);
  const padY = Math.max(3, s * 2);
  const W = Math.ceil((tw + padX * 2) / 2) * 2;
  const H = Math.ceil((th + padY * 2) / 2) * 2;
  const broken = o.broken ?? [];
  const key = `z2lit|${text}|${h6(color)}|${s}|${o.plate === null ? 'n' : h6(o.plate ?? 0x14181a)}|${broken.join('.')}|${o.neon ? 1 : 0}`;
  return sized(
    atlas.tile(key, W, H, (c, k) => {
      const lit = k.ramp(color, { light: 0.6, sat: 1.1 });
      const dead = k.ramp(mixHex(color, 0x2a2a2e, 0.75), { light: 0.4 });
      if (o.plate !== null) {
        const p = k.ramp(o.plate ?? 0x14181a, { light: 0.5, sat: 0.8 });
        c.rect(0, 0, W, H, p, 2);
        c.hline(0, 0, W, p, 4);
        c.vline(0, 0, H, p, 3);
        c.hline(0, H - 1, W, p, 0);
        c.vline(W - 1, 0, H, p, 1);
        // The plate catches the letters' light just around them (a soft wash, dithered).
        screws(c, W, H, p);
        // Grime streak under the box.
        for (let x = 2; x < W - 2; x++) if (hash2(x, 0, 3) > 0.7) c.set(x, H - 2, p, 1);
      }
      // Letters one by one (dead letters unlit).
      let x = Math.round((W - tw) / 2);
      const y = Math.round((H - th) / 2) - (small ? 0 : 0);
      const chars = [...text];
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const isDead = broken.includes(i);
        const cw = textWidth(ch, f, to);
        if (ch !== ' ') {
          if (o.neon) {
            if (isDead) drawText(c, ch, x, y, f, dead, 1, { ...to, tube: s >= 2 ? (s >= 4 ? 2 : 1) : 0 });
            else neonText(c, ch, x, y, f, lit, { ...to, core: 5, halo: 2 });
          } else {
            // Channel letter: a dark return down-right, the lit face (hot top row), a halo of glow.
            const m = rasterText(ch, f, to);
            const ret = s >= 3 ? 2 : 1;
            for (let my = 0; my < m.h; my++) for (let mx = 0; mx < m.w; mx++) if (m.data[my * m.w + mx]) for (let d = 1; d <= ret; d++) c.set(x + mx + d, y + my + d, dead, 0);
            if (!isDead) {
              const mw = m.w;
              const mh = m.h;
              const md = m.data;
              const on = (a: number, b: number) => a >= 0 && b >= 0 && a < mw && b < mh && md[b * mw + a] === 1;
              for (let my = -1; my <= mh; my++) {
                for (let mx = -1; mx <= mw; mx++) {
                  if (on(mx, my)) continue;
                  if ((on(mx + 1, my) || on(mx - 1, my) || on(mx, my + 1) || on(mx, my - 1)) && c.at(x + mx, y + my) !== dead) c.set(x + mx, y + my, lit, 1, PWF.GLOW);
                }
              }
            }
            for (let my = 0; my < m.h; my++) {
              for (let mx = 0; mx < m.w; mx++) {
                if (!m.data[my * m.w + mx]) continue;
                const top = my === 0 || !m.data[(my - 1) * m.w + mx];
                if (isDead) c.set(x + mx, y + my, dead, top ? 3 : 2);
                else c.set(x + mx, y + my, lit, top ? 5 : my >= m.h - s ? 3 : 4, PWF.GLOW);
              }
            }
          }
        }
        x += cw + (f.gap + (to.spacing ?? 0)) * s;
      }
    }),
  );
}

/** A printed / engraved plate: `ink` letters (with arrows) on a `plate` colour, bevel, screws, wear. */
export function z2PlateSign(atlas: PwAtlas, label: string, ink: number, plate: number, px: number): SignTile {
  const { text, left, right, down } = arrows(label);
  const s = Math.max(1, Math.round(px * PW_TPM));
  const f: PixelFont = px < 0.026 ? FONT_3x5 : s >= 2 ? FONT_BOLD : FONT_5x7;
  const sc = px < 0.026 ? 1 : s;
  const to = { scale: sc };
  const tw = textWidth(text, f, to);
  const th = f.base * sc;
  const ah = th;
  const gap = Math.max(2, sc * 2);
  const aw = (left ? ah + gap : 0) + (right || down ? ah + gap : 0);
  const pad = Math.max(3, sc * 2);
  const W = Math.ceil((tw + aw + pad * 2) / 2) * 2;
  const H = Math.ceil((th + pad * 2) / 2) * 2;
  return sized(
    atlas.tile(`z2plate|${label}|${h6(ink)}|${h6(plate)}|${s}`, W, H, (c, k) => {
      const p = k.ramp(plate, { light: 0.45, sat: 0.95 });
      const i = k.ramp(ink, { light: 0.4, sat: 1 });
      c.rect(0, 0, W, H, p, 3);
      c.hline(0, 0, W, p, 4);
      c.vline(0, 0, H, p, 4);
      c.hline(0, H - 1, W, p, 1);
      c.vline(W - 1, 0, H, p, 1);
      if (W > 24) screws(c, W, H, p);
      let x = pad;
      const y = Math.round((H - th) / 2);
      if (left) {
        arrow(c, x, y, ah, 'l', i, 3);
        x += ah + gap;
      }
      drawText(c, text, x, y, f, i, 3, to);
      x += tw + gap;
      if (right) arrow(c, x, y, ah, 'r', i, 3);
      if (down) arrow(c, x, y, ah, 'd', i, 3);
      // Wear: a few scratches through the print, dirt at the bottom edge.
      for (let n = 0; n < Math.max(2, W >> 4); n++) {
        const sx = k.rng.int(1, W - 4);
        const sy = k.rng.int(1, H - 2);
        c.lineShade(sx, sy, sx + k.rng.int(1, 3), sy, -1);
      }
      for (let xx = 1; xx < W - 1; xx++) if (hash2(xx, 1, 5) > 0.6) c.shift(xx, H - 2, -1);
    }),
  );
}

/** The green EXIT lightbox: dark housing, glowing letters, a running arrow. 24 × 10. */
export function z2ExitSign(atlas: PwAtlas, label = 'EXIT'): SignTile {
  const tw = textWidth(label, FONT_3x5);
  const W = Math.ceil((tw + 12) / 2) * 2;
  return sized(
    atlas.tile(`z2exit|${label}`, W, 10, (c, k) => {
      const hous = k.ramp(0x1d2420, { light: 0.5 });
      const g = k.ramp(0x3cff6a, { light: 0.55, sat: 1.05 });
      c.rect(0, 0, W, 10, hous, 2);
      c.hline(0, 0, W, hous, 4);
      c.hline(0, 9, W, hous, 0);
      c.rect(1, 1, W - 2, 8, g, 0, PWF.GLOW);
      drawText(c, label, 2, 3, FONT_3x5, g, 5, { flag: PWF.GLOW });
      arrow(c, W - 8, 3, 5, 'r', g, 4, PWF.GLOW);
    }),
  );
}

/** Spray-stencilled letters (cut out): bridged strokes, overspray specks, worn. `px` = classic font pixel. */
export function z2Stencil(atlas: PwAtlas, text: string, ink: number, px: number, worn = 0.3): SignTile {
  const s = Math.max(1, Math.round(px * PW_TPM));
  const to = { scale: s, spacing: 1 };
  const tw = textWidth(text, FONT_5x7, to);
  const th = 7 * s;
  const W = Math.ceil((tw + 6) / 2) * 2;
  const H = Math.ceil((th + 6) / 2) * 2;
  return sized(
    atlas.tile(`z2stencil|${text}|${h6(ink)}|${s}|${worn}`, W, H, (c, k) => {
      const i = k.ramp(ink, { light: 0.4, sat: 0.9 });
      const m = rasterText(text, FONT_5x7, to);
      for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
          if (!m.data[y * m.w + x]) continue;
          // Stencil bridges: a gap across the middle row of every glyph.
          if (s >= 2 && Math.abs(m.v[y * m.w + x] - 0.5) < 0.1 && (x % (s * 6)) % 3 === 1) continue;
          if (hash2(x >> 1, y >> 1, 7) < worn * 0.5) continue;
          c.set(3 + x, 3 + y, i, hash2(x, y, 3) > 0.85 ? 2 : 3);
        }
      }
      // Overspray specks round the letters.
      for (let n = 0; n < tw >> 1; n++) {
        const x = k.rng.int(1, W - 2);
        const y = k.rng.int(1, H - 2);
        if (!c.at(x, y) && (c.at(x + 1, y) || c.at(x - 1, y) || c.at(x, y + 2))) c.set(x, y, i, 2);
      }
    }),
  );
}

export type PosterKind = 'handwash' | 'quarantine' | 'nosmoking' | 'evac' | 'flu' | 'visiting' | 'cork' | 'painting' | 'chart' | 'missing' | 'biohazard';

const POSTER_SIZE: Record<PosterKind, [number, number]> = {
  handwash: [22, 30],
  quarantine: [26, 34],
  nosmoking: [16, 16],
  evac: [28, 20],
  flu: [22, 30],
  visiting: [30, 14],
  cork: [44, 30],
  painting: [36, 26],
  chart: [18, 28],
  missing: [18, 24],
  biohazard: [20, 20],
};

/** Notices, posters and boards for the walls (taped / framed, a little worn). */
export function z2Poster(atlas: PwAtlas, kind: PosterKind): SignTile {
  const [W, H] = POSTER_SIZE[kind];
  return sized(
    atlas.tile(`z2poster|${kind}`, W, H, (c, k) => {
      const paper = k.ramp(0xe4e0d0, { light: 0.3, sat: 0.6 });
      const ink = k.ramp(0x22283a, { light: 0.4 });
      const red = k.ramp(0xc02420, { light: 0.45 });
      const blue = k.ramp(0x2a5aa8, { light: 0.45 });
      const yellow = k.ramp(0xe8c020, { light: 0.4 });
      const sheet = (ground = paper) => {
        c.rect(0, 0, W, H, ground, 3);
        c.hline(0, 0, W, ground, 4);
        c.vline(W - 1, 0, H, ground, 2);
        c.hline(0, H - 1, W, ground, 2);
      };
      const tape = (x: number, y: number) => c.rect(x, y, 4, 2, k.ramp(0xd8d0a0, { light: 0.3 }), 4);
      const lines = (x: number, y: number, w: number, n: number, step = 2) => {
        for (let i = 0; i < n; i++) c.hline(x, y + i * step, Math.max(2, w - ((i * 7) % 5)), ink, 2);
      };
      switch (kind) {
        case 'handwash': {
          sheet();
          c.rect(0, 0, W, 7, blue, 3);
          drawText(c, 'WASH', 3, 1, FONT_3x5, paper, 5);
          // Two hands under a tap (pictogram).
          const skin = k.ramp(0xd8a080, { light: 0.4 });
          c.rect(8, 9, 6, 2, ink, 2);
          c.vline(12, 11, 3, ink, 2);
          for (const dx of [6, 12]) {
            c.ellipse(dx, 19, 3, 4, skin, 3);
            for (let f = 0; f < 3; f++) c.vline(dx - 2 + f * 2, 13, 3, skin, 4);
          }
          c.set(12, 14, blue, 4);
          c.set(11, 16, blue, 4);
          lines(3, 25, 16, 2);
          tape(1, 0);
          tape(W - 5, 0);
          break;
        }
        case 'quarantine': {
          sheet(k.ramp(0xe8d020, { light: 0.35 }));
          c.rect(1, 2, W - 2, 7, ink, 2);
          drawText(c, 'NO', Math.round((W - textWidth('NO', FONT_3x5)) / 2), 3, FONT_3x5, k.ramp(0xe8d020, { light: 0.35 }), 4);
          drawText(c, 'ENTRY', Math.round((W - textWidth('ENTRY', FONT_3x5)) / 2), 11, FONT_3x5, red, 3);
          // Biohazard trefoil.
          const cx = W >> 1;
          for (let a = 0; a < 3; a++) {
            const an = (a / 3) * Math.PI * 2 - Math.PI / 2;
            c.ellipse(cx + Math.cos(an) * 3.5, 23 + Math.sin(an) * 3.5, 2.6, 2.6, ink, 2);
          }
          c.ellipse(cx, 23, 1.2, 1.2, k.ramp(0xe8d020, { light: 0.35 }), 3);
          lines(3, 30, W - 6, 2);
          tape(1, 0);
          tape(W - 5, 0);
          break;
        }
        case 'nosmoking': {
          c.ellipse(8, 8, 7.5, 7.5, red, 3);
          c.ellipse(8, 8, 5.5, 5.5, paper, 3);
          c.rect(3, 7, 9, 3, ink, 2);
          c.rect(11, 7, 2, 3, k.ramp(0xe08030, { light: 0.4 }), 4);
          c.line(3, 3, 13, 13, red, 3);
          c.line(4, 3, 13, 12, red, 3);
          break;
        }
        case 'evac': {
          sheet();
          c.hline(1, 1, W - 2, red, 3);
          drawText(c, 'EXIT', 2, 3, FONT_3x5, red, 3);
          // Floor plan: rooms as outlines, a "YOU ARE HERE" dot, route arrows.
          c.frame(2, 9, W - 4, H - 11, ink, 2);
          c.vline(12, 9, H - 11, ink, 2);
          c.hline(2, 14, 10, ink, 2);
          c.set(7, 16, red, 4);
          c.line(14, 12, 24, 12, k.ramp(0x30a050, { light: 0.4 }), 3);
          c.frame(0, 0, W, H, k.ramp(0x8a6a40, { light: 0.4 }), 2);
          break;
        }
        case 'flu': {
          sheet(k.ramp(0xc8e0e8, { light: 0.3 }));
          drawText(c, 'FLU', 4, 2, FONT_5x7, blue, 3);
          // A syringe pictogram.
          c.rect(5, 14, 11, 3, paper, 4);
          c.rect(3, 15, 2, 1, ink, 2);
          c.rect(16, 15, 3, 1, ink, 3);
          c.vline(8, 14, 3, ink, 2);
          lines(3, 22, 16, 3);
          tape(W >> 1, 0);
          break;
        }
        case 'visiting': {
          const brass = k.ramp(0xb08a40, { light: 0.5 });
          c.rect(0, 0, W, H, brass, 3);
          c.hline(0, 0, W, brass, 5);
          c.hline(0, H - 1, W, brass, 1);
          drawText(c, 'VISITING', 3, 2, FONT_3x5, ink, 1);
          drawText(c, '2-8PM', 3, 8, FONT_3x5, ink, 1);
          break;
        }
        case 'cork': {
          const cork = k.ramp(0xa87a4a, { light: 0.4 });
          const frame = k.ramp(0x6a4a2a, { light: 0.45 });
          c.rect(0, 0, W, H, cork, 3);
          c.scatter(k.rng, 2, 2, W - 4, H - 4, 50, 0, -1, { shapes: 2 });
          c.frame(0, 0, W, H, frame, 3);
          c.hline(0, 0, W, frame, 4);
          // Pinned notes: paper, a photo, a yellow sticky; pins.
          const notes: [number, number, number, number, number][] = [
            [3, 3, 10, 12, paper],
            [15, 4, 9, 7, yellow],
            [26, 3, 14, 11, paper],
            [6, 17, 12, 9, k.ramp(0xc8d8e8, { light: 0.3 })],
            [21, 16, 9, 11, paper],
            [32, 17, 8, 8, k.ramp(0xe8a0a0, { light: 0.35 })],
          ];
          for (const [x, y, w, h, r] of notes) {
            c.rect(x, y, w, h, r, 3);
            c.hline(x, y + h, w, cork, 1);
            for (let i = 2; i < h - 1; i += 2) c.hline(x + 1, y + i, w - 3 - (i % 3), ink, 2);
            c.set(x + (w >> 1), y, red, 4);
          }
          break;
        }
        case 'painting': {
          const frame = k.ramp(0x8a6a30, { light: 0.55 });
          c.rect(0, 0, W, H, frame, 3);
          c.hline(0, 0, W, frame, 5);
          c.vline(0, 0, H, frame, 4);
          c.hline(0, H - 1, W, frame, 1);
          c.vline(W - 1, 0, H, frame, 1);
          // A calm lake landscape: sky, hills, water, a sail.
          const sky = k.ramp(0x8ab0d0, { light: 0.4 });
          const hill = k.ramp(0x5a7a4a, { light: 0.45 });
          const water = k.ramp(0x3a6a8a, { light: 0.45 });
          c.rect(3, 3, W - 6, H - 6, sky, 3);
          for (let x = 3; x < W - 3; x++) {
            const hy = Math.round(12 + Math.sin(x * 0.3) * 2 + Math.sin(x * 0.11) * 2);
            c.rect(x, hy, 1, 17 - hy, hill, x < W / 2 ? 3 : 2);
          }
          c.rect(3, 17, W - 6, H - 20, water, 3);
          c.hline(6, 19, 8, water, 4);
          c.poly([22, 15, 25, 9, 25, 15], paper, 4);
          c.ellipse(8, 7, 2, 2, k.ramp(0xf0e0a0, { light: 0.3 }), 4);
          break;
        }
        case 'chart': {
          sheet();
          // Eye chart: letters getting smaller.
          drawText(c, 'E', 6, 2, FONT_5x7, ink, 2);
          drawText(c, 'FP', 4, 11, FONT_3x5, ink, 2);
          drawText(c, 'TOZ', 2, 18, FONT_3x5, ink, 2);
          c.hline(3, 25, 12, ink, 2);
          break;
        }
        case 'missing': {
          sheet();
          drawText(c, 'HELP', 1, 1, FONT_3x5, red, 3);
          // A photocopied face.
          const grey = k.ramp(0x8a8a88, { light: 0.4 });
          c.rect(3, 8, 12, 10, grey, 3);
          c.ellipse(9, 13, 3, 4, grey, 4);
          c.set(8, 12, ink, 1);
          c.set(10, 12, ink, 1);
          lines(2, 20, 14, 2);
          tape(7, 0);
          break;
        }
        case 'biohazard': {
          c.poly([10, 0, 20, 18, 0, 18], k.ramp(0xe8c020, { light: 0.4 }), 3);
          c.poly([10, 3, 17, 16, 3, 16], ink, 1);
          c.poly([10, 5, 15, 15, 5, 15], k.ramp(0xe8c020, { light: 0.4 }), 3);
          for (let a = 0; a < 3; a++) {
            const an = (a / 3) * Math.PI * 2 - Math.PI / 2;
            c.ellipse(10 + Math.cos(an) * 2.2, 12 + Math.sin(an) * 2.2, 1.4, 1.4, ink, 2);
          }
          break;
        }
      }
      // Age: a corner curling / a dirty thumb mark.
      if (kind !== 'painting' && kind !== 'visiting' && kind !== 'nosmoking' && kind !== 'biohazard') {
        c.set(W - 2, H - 2, paper, 1);
        c.set(W - 1, H - 2, 0, 0);
        c.ramp[(H - 1) * W + W - 1] = 0;
      }
    }),
  );
}


/**
 * A big lit sign (EMERGENCY over the bay, ST MERCY HOSPITAL, OUTPATIENTS,
 * ER, the atrium's ST MERCY) on a 4-texel grid: every font pixel is a 4 × 4
 * cell, so the hand-made levels keep whole letters (2 × 2, then 1 texel a
 * pixel) — no glyph crawl at a distance. Laid at the classic letter size
 * (`px` metres a font pixel: `wM` / `hM`).
 *  - neon (`neon`): a 2-texel tube following the glyph skeleton with a
 *    1-texel hot core on its upper / left side, a halo ring and a dithered
 *    spill round it (cut out beyond); dead letters are dark glass tubes;
 *  - channel letters: lit faces (hot top row), a dark return down-right, a
 *    glow spill washing the sign box round the lit letters.
 * Fixed 6-pixel advance like the classic block letters (dead indices match).
 */
export function z2BigSign(atlas: PwAtlas, text: string, color: number, o: { px: number; plate: number | null; broken?: number[]; neon?: boolean }): SignTile {
  const S = 4;
  const chars = [...text];
  const cols = chars.length * 6 - 1;
  const pad = 1;
  const W = (cols + pad * 2) * S;
  const H = (7 + pad * 2) * S;
  const broken = o.broken ?? [];
  const key = `z2big|${text}|${h6(color)}|${o.plate === null ? 'n' : h6(o.plate)}|${broken.join('.')}|${o.neon ? 1 : 0}`;
  const tile = atlas.tile(key, W, H, (c, k) => {
    const lit = k.ramp(color, { light: 0.6, sat: 1.1 });
    const dead = k.ramp(mixHex(color, 0x2a2a2e, 0.75), { light: 0.4 });
    // Font-pixel mask (+ which letter each pixel belongs to).
    const MW = cols + pad * 2;
    const MH = 7 + pad * 2;
    const mask = new Int16Array(MW * MH).fill(-1);
    chars.forEach((ch, i) => {
      const g = FONT_5x7.glyphs.get(ch) ?? FONT_5x7.glyphs.get(ch.toUpperCase());
      if (!g || ch === ' ') return;
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r]?.[q] === '#') mask[(pad + r) * MW + pad + i * 6 + q] = i;
    });
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MW || y >= MH ? -1 : mask[y * MW + x]);
    const isLit = (i: number) => i >= 0 && !broken.includes(i);
    if (o.plate !== null) {
      const p = k.ramp(o.plate, { light: 0.5, sat: 0.8 });
      c.rect(0, 0, W, H, p, 2);
      c.hline(0, 0, W, p, 4);
      c.vline(0, 0, H, p, 3);
      c.hline(0, H - 1, W, p, 0);
      c.vline(W - 1, 0, H, p, 1);
      screws(c, W, H, p);
      // The lit letters wash the box round them (a cell's worth of glow spill).
      for (let y = 1; y < MH - 1; y++) {
        for (let x = 1; x < MW - 1; x++) {
          if (at(x, y) >= 0) continue;
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = isLit(at(x + dx, y + dy));
          if (near) c.rect(x * S, y * S, S, S, p, 3, PWF.GLOW);
        }
      }
    }
    if (o.neon) {
      // Tube texels per cell: the middle 2 × 2, reaching out to on-neighbours (4- and 8-connected).
      const tube = new Uint8Array(W * H);
      const own = new Int16Array(W * H).fill(-1);
      const put = (x: number, y: number, i: number) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        tube[y * W + x] = 1;
        own[y * W + x] = i;
      };
      for (let y = 0; y < MH; y++) {
        for (let x = 0; x < MW; x++) {
          const i = at(x, y);
          if (i < 0) continue;
          const bx = x * S;
          const by = y * S;
          for (let ty = 1; ty <= 2; ty++) for (let tx = 1; tx <= 2; tx++) put(bx + tx, by + ty, i);
          if (at(x + 1, y) === i) for (let ty = 1; ty <= 2; ty++) for (let tx = 3; tx <= 5; tx++) put(bx + tx, by + ty, i);
          if (at(x, y + 1) === i) for (let ty = 3; ty <= 5; ty++) for (let tx = 1; tx <= 2; tx++) put(bx + tx, by + ty, i);
          for (const dx of [-1, 1]) {
            if (at(x + dx, y + 1) !== i || at(x + dx, y) === i || at(x, y + 1) === i) continue;
            for (let s = 0; s < 4; s++) {
              put(bx + 1 + (dx > 0 ? 2 + s : -s), by + 2 + s, i);
              put(bx + 2 + (dx > 0 ? 2 + s : -s), by + 2 + s, i);
            }
          }
        }
      }
      // Halo and spill round the lit tubes (glow, cut out beyond).
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (tube[y * W + x]) continue;
          let d = 9;
          let li = false;
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= W || yy >= H || !tube[yy * W + xx] || !isLit(own[yy * W + xx])) continue;
              const dd = Math.max(Math.abs(dx), Math.abs(dy));
              if (dd < d) {
                d = dd;
                li = true;
              }
            }
          }
          if (!li) continue;
          if (d === 1) c.set(x, y, lit, 2, PWF.GLOW);
          else if (d === 2 && bayer(x, y) < 0.5) c.set(x, y, lit, 1, PWF.GLOW);
          else if (d === 3 && bayer(x, y) < 0.2) c.set(x, y, lit, 1, PWF.GLOW);
        }
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const j = y * W + x;
          if (!tube[j]) continue;
          if (!isLit(own[j])) {
            c.set(x, y, dead, (y % 4) === 1 ? 3 : 1);
            continue;
          }
          // Hot core on the upper / left side of the tube, the body a step under.
          const core = (!tube[j - W] || !tube[j - 1]) && (tube[j + W] || tube[j + 1]);
          c.set(x, y, lit, core ? 5 : 4, PWF.GLOW);
        }
      }
    } else {
      for (let y = 0; y < MH; y++) {
        for (let x = 0; x < MW; x++) {
          const i = at(x, y);
          if (i < 0) continue;
          const bx = x * S;
          const by = y * S;
          // Return: the dark side below-right of the face.
          if (at(x + 1, y) !== i) c.rect(bx + S, by + 1, 1, S, dead, 0);
          if (at(x, y + 1) !== i) c.rect(bx + 1, by + S, S, 1, dead, 0);
        }
      }
      for (let y = 0; y < MH; y++) {
        for (let x = 0; x < MW; x++) {
          const i = at(x, y);
          if (i < 0) continue;
          const top = at(x, y - 1) !== i;
          const bot = at(x, y + 1) !== i;
          if (!isLit(i)) {
            c.rect(x * S, y * S, S, S, dead, top ? 3 : 2);
            continue;
          }
          c.rect(x * S, y * S, S, S, lit, 4, PWF.GLOW);
          if (top) c.hline(x * S, y * S, S, lit, 5, PWF.GLOW);
          if (bot) c.hline(x * S, y * S + S - 1, S, lit, 3, PWF.GLOW);
        }
      }
    }
  });
  const m = o.px / S;
  return { tile, wM: W * m, hM: H * m };
}
