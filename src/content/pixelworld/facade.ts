import { PWF, type PwCanvas, PwRng } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD } from './font';
import { darken, hash2, smooth } from './surfaces';

/**
 * PixelWorld facade modules: painted windows, doors, shopfronts, shutters,
 * cornices, awnings and wall decals (posters, graffiti, grime) — the features a
 * 90s background artist paints INTO a wall instead of modelling them.
 *
 * Modules are clamp tiles laid flush on a wall (+1.5 cm), cut out (alpha 0)
 * wherever the wall behind should show. Painted depth follows the sprite light
 * (upper left): a RECESS (window opening, doorway) has its top / left reveal in
 * shadow and its sill / right reveal lit; a PROJECTION (sill, lintel, cornice,
 * frame) has a lit top / left edge, a dark lower / right edge and casts one step
 * of hard shadow below-right. Lit interiors are GLOW texels (they keep shining at
 * night, unlit by the scene) painted as rooms — wall, lamp, curtains, furniture,
 * a figure — never a flat yellow rectangle.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');

// ─── Windows ────────────────────────────────────────────────────────────────

export type WindowKind = 'dark' | 'warm' | 'dim' | 'tv' | 'blinds' | 'ghoul' | 'broken' | 'boarded';

export interface WindowStyle {
  /** Wall colour (not painted: the module is cut out round its stonework; kept for callers). */
  wall?: number;
  /** Sash / frame paint. */
  frame: number;
  /** Lintel + sill stone. */
  stone: number;
}

/** Window module size (texels) and its layout in metres (origin = module bottom-left). */
export const WINDOW_TX = { w: 48, h: 68 } as const;
export const WINDOW_M = {
  w: WINDOW_TX.w / 32,
  h: WINDOW_TX.h / 32,
  /** Centre of the glazed opening above the module bottom (m). */
  openY: (68 - 33) / 32,
} as const;

const WARM = 0xffc477;
const DIM = 0xd8914a;
const TV = 0x7fa6ff;

/** A window module (48 × 68): lintel, recessed opening, double-hung sash, sill + its shadow. */
export function windowModule(atlas: PwAtlas, kind: WindowKind, s: WindowStyle, variant = 0): PwTile {
  const key = `win|${kind}|${h6(s.frame)}|${h6(s.stone)}|${variant}`;
  return atlas.tile(key, WINDOW_TX.w, WINDOW_TX.h, (c, k) => paintWindow(c, k, kind, s, variant));
}

export function paintWindow(c: PwCanvas, k: PwKit, kind: WindowKind, s: WindowStyle, variant: number) {
  const rng = k.rng;
  const stone = k.ramp(s.stone, { light: 0.42, sat: 0.75 });
  const frame = k.ramp(s.frame, { light: 0.4, sat: 0.8 });
  // Reveal and cast shadows: a cool near-black (reads on any wall at night, like a sprite's cast shadow).
  const wallSh = k.ramp(0x2a2630, { light: 0.4 });
  const W = c.w;
  // Opening (inside the reveal): x 3…44, y 6…58.
  const ox0 = 3;
  const ox1 = W - 4;
  const oy0 = 6;
  const oy1 = 58;
  // Lintel: a stone header with a keystone; lit top, shadowed underside.
  c.rect(1, 0, W - 2, 5, stone, 3);
  c.hline(1, 0, W - 2, stone, 4);
  c.hline(1, 4, W - 2, stone, 1);
  c.vline(W - 2, 0, 5, stone, 2);
  const kx = (W >> 1) - 3;
  c.rect(kx, 0, 6, 7, stone, 3);
  c.hline(kx, 0, 6, stone, 4);
  c.vline(kx, 1, 6, stone, 4);
  c.vline(kx + 5, 1, 6, stone, 2);
  c.hline(kx, 6, 6, stone, 1);
  // Reveal: the opening's top and left inner faces in shadow, right face lit.
  c.rect(ox0, oy0 - 1, ox1 - ox0 + 1, oy1 - oy0 + 2, wallSh, 1);
  c.rect(ox1 - 1, oy0, 2, oy1 - oy0 + 1, wallSh, 3);
  // Sash frame + glazing.
  const fx0 = ox0 + 2;
  const fx1 = ox1 - 2;
  const fy0 = oy0 + 2;
  const fy1 = oy1;
  c.rect(fx0, fy0, fx1 - fx0 + 1, fy1 - fy0 + 1, frame, 3);
  c.hline(fx0, fy0, fx1 - fx0 + 1, frame, 2);
  c.vline(fx1, fy0, fy1 - fy0 + 1, frame, 2);
  c.vline(fx0, fy0, fy1 - fy0 + 1, frame, 4);
  const mid = (fy0 + fy1) >> 1;
  // Panes: 2-over-2 (upper sash, lower sash, a muntin down each).
  const panes: [number, number, number, number][] = [];
  const px0 = fx0 + 2;
  const px1 = fx1 - 2;
  const pmx = (px0 + px1) >> 1;
  for (const [y0, y1] of [
    [fy0 + 2, mid - 2],
    [mid + 2, fy1 - 2],
  ]) {
    panes.push([px0, y0, pmx - 1, y1], [pmx + 1, y0, px1, y1]);
  }
  // Meeting rail: thicker, lit on top.
  c.rect(fx0, mid - 1, fx1 - fx0 + 1, 3, frame, 3);
  c.hline(fx0, mid - 1, fx1 - fx0 + 1, frame, 4);
  c.hline(fx0, mid + 1, fx1 - fx0 + 1, frame, 2);
  const glassH = fy1 - 2 - (fy0 + 2);
  paintGlass(c, k, rng, kind, { x0: px0, y0: fy0 + 2, x1: px1, y1: fy1 - 2, mx: pmx, my: mid, h: glassH }, variant);
  void panes;
  if (kind === 'boarded') {
    // Planks nailed across the opening (over the frame): horizontal boards with gaps, one diagonal brace.
    const wood = k.ramp(0x6e5440, { light: 0.4, sat: 0.9 });
    const wood2 = k.ramp(0x5c4434, { light: 0.4, sat: 0.9 });
    let y = oy0 + 1;
    let b = 0;
    while (y < oy1 - 2) {
      const bh = 6 + (b % 2);
      const r = b % 3 === 1 ? wood2 : wood;
      const x0 = ox0 - 1 + (b % 2 ? 1 : 0);
      const x1 = ox1 + 1 - (b % 3 ? 0 : 1);
      c.rect(x0, y, x1 - x0, bh, r, 3);
      c.hline(x0, y, x1 - x0, r, 4);
      c.hline(x0, y + bh - 1, x1 - x0, r, 2);
      for (let g = 0; g < 3; g++) c.hline(x0 + rng.int(2, 20), y + rng.int(2, bh - 3), rng.int(3, 9), r, 2);
      c.set(x0 + 2, y + 2, r, 0);
      c.set(x1 - 3, y + 2, r, 0);
      y += bh + 2;
      b++;
    }
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const x = Math.round(ox0 + 2 + t * (ox1 - ox0 - 6));
      const yy = Math.round(oy1 - 4 - t * (oy1 - oy0 - 8));
      c.rect(x, yy, 4, 4, wood2, 3);
      c.set(x, yy, wood2, 4);
      c.set(x + 3, yy + 3, wood2, 1);
    }
  }
  // Sill: a projecting stone sill (lit top, face, dark underside) wider than the opening.
  const sy = oy1 + 1;
  c.rect(0, sy, W, 4, stone, 3);
  c.hline(0, sy, W, stone, 4);
  c.hline(0, sy + 3, W, stone, 1);
  c.vline(W - 1, sy, 4, stone, 2);
  // Hard cast shadow under the sill, falling down-right (wall colour, darkest lit step).
  c.rect(2, sy + 4, W - 2, 2, wallSh, 1);
  c.rect(5, sy + 6, W - 5, 1, wallSh, 1);
  // Grime streaks running from the sill ends (wall shadow tone), broken up.
  for (const gx of [3, W - 6]) {
    for (let j = 0; j < 3; j++) if (rng.chance(0.6)) c.set(gx + rng.int(0, 2), sy + 7 + j, wallSh, 1);
  }
}

interface GlassRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mx: number;
  my: number;
  h: number;
}

/** What is behind the glass, per kind. Unlit glass is dark with a sky reflection; lit glass is a GLOW room. */
function paintGlass(c: PwCanvas, k: PwKit, rng: PwRng, kind: WindowKind, g: GlassRect, variant: number) {
  const inPane = (x: number, y: number) => x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1 && x !== g.mx && Math.abs(y - g.my) > 1;
  const fill = (ramp: number, tone: (x: number, y: number) => number, flag = 0) => {
    for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) if (inPane(x, y)) c.set(x, y, ramp, tone(x, y), flag);
  };
  const lit = kind === 'warm' || kind === 'dim' || kind === 'tv' || kind === 'blinds' || kind === 'ghoul';
  if (!lit) {
    const glass = k.ramp(0x1c2434, { light: 0.4, sat: 0.9 });
    const sky = k.ramp(0x46557a, { light: 0.35 });
    fill(glass, () => 2);
    // Sky reflection: two parallel diagonal bands across the upper sash.
    const off = variant * 7;
    for (let y = g.y0; y <= g.y1; y++) {
      for (let x = g.x0; x <= g.x1; x++) {
        if (!inPane(x, y)) continue;
        const d = x + (y - g.y0) * 0.9 - off;
        if (d % 26 >= 4 && d % 26 < 7) c.set(x, y, sky, 2);
        else if (d % 26 === 9) c.set(x, y, sky, 1);
      }
    }
    // A curtain edge hanging inside (darker fabric down one side).
    if (variant % 2 === 0) for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x0 + 4; x++) if (inPane(x, y)) c.set(x, y, glass, 1);
    if (kind === 'broken') {
      // A hole knocked through the lower sash: black interior, jagged edge, cracks radiating.
      const hx = g.x0 + 6 + (variant % 3) * 4;
      const hy = g.my + 8;
      for (let y = hy - 8; y <= hy + 8; y++) {
        for (let x = hx - 9; x <= hx + 9; x++) {
          const d = Math.hypot((x - hx) / 9, (y - hy) / 8) + (hash2(x, y, 3) - 0.5) * 0.5;
          if (d < 0.8 && inPane(x, y)) c.set(x, y, glass, 0);
          else if (d < 0.95 && inPane(x, y)) c.set(x, y, sky, 3);
        }
      }
      for (let r = 0; r < 6; r++) {
        const a = (r / 6) * Math.PI * 2 + rng.spread(0.3);
        const len = rng.int(8, 16);
        for (let j = 8; j < len + 8; j++) {
          const x = Math.round(hx + Math.cos(a) * j);
          const y = Math.round(hy + Math.sin(a) * j);
          if (inPane(x, y)) c.set(x, y, sky, 3);
        }
      }
    }
    return;
  }
  // Lit rooms (GLOW).
  const room = k.ramp(kind === 'tv' ? 0x3a4a78 : kind === 'dim' ? DIM : WARM, { light: 0.5, sat: 1.05 });
  const lamp = k.ramp(kind === 'tv' ? TV : 0xffe2a8, { light: 0.6 });
  const curtain = k.ramp(([0x8a3a3a, 0x3a5a8a, 0x6a6a3a, 0x7a5a8a] as const)[variant % 4], { light: 0.45 });
  const dark = k.ramp(0x241a1c, { light: 0.4 });
  const base = kind === 'dim' ? 2 : kind === 'tv' ? 1 : 3;
  // Back wall: lighter near the lamp (a dithered falloff — one of the few deliberate dithers).
  const lx = g.x0 + 6 + (variant % 3) * 8;
  const ly = g.y0 + 4;
  fill(room, (x, y) => {
    const d = Math.hypot(x - lx, (y - ly) * 1.3);
    return base + (d < 7 ? 1.5 : d < 14 ? 0.75 : 0);
  }, PWF.GLOW | PWF.DITHER);
  if (kind === 'tv') {
    // TV glow from below one side: a cool flicker-coloured patch on the far wall.
    for (let y = g.my + 2; y <= g.y1; y++) for (let x = g.x1 - 12; x <= g.x1; x++) if (inPane(x, y)) c.set(x, y, lamp, y > g.y1 - 6 ? 4 : 3, PWF.GLOW | PWF.DITHER);
  } else {
    // Ceiling lamp: a shade with a hot bulb.
    c.rect(lx - 2, ly - 3, 5, 2, lamp, 5, PWF.GLOW);
    c.set(lx, ly - 1, lamp, 5, PWF.GLOW);
  }
  if (kind === 'blinds') {
    // Venetian blinds two-thirds down: slats lit, gaps dark, the cord.
    const by = g.y0 + Math.round(g.h * 0.62);
    for (let y = g.y0; y <= by; y++) for (let x = g.x0; x <= g.x1; x++) if (inPane(x, y)) c.set(x, y, room, (y - g.y0) % 3 === 2 ? 1 : base + 1, PWF.GLOW);
    c.hline(g.x0, by + 1, g.x1 - g.x0 + 1, room, 0, PWF.GLOW);
  } else {
    // Curtains drawn to the sides, folds lit from inside.
    for (const side of [0, 1]) {
      const cw = 5 + (variant % 2);
      for (let y = g.y0; y <= g.y1; y++) {
        for (let j = 0; j < cw; j++) {
          const x = side ? g.x1 - j : g.x0 + j;
          if (!inPane(x, y)) continue;
          c.set(x, y, curtain, j % 3 === 1 ? 4 : j === cw - 1 ? 2 : 3, PWF.GLOW);
        }
      }
    }
  }
  // Furniture silhouettes at the bottom (a sofa back / a chair), a picture frame on the wall.
  const fy = g.y1 - 5;
  for (let y = fy; y <= g.y1; y++) for (let x = g.x0 + 8; x <= g.x1 - 9; x++) if (inPane(x, y) && (y > fy + 1 || (x + variant) % 9 < 6)) c.set(x, y, dark, y === fy ? 2 : 1, PWF.GLOW);
  if (variant % 2 === 1 && kind !== 'blinds') {
    const pfx = g.mx + 4;
    const pfy = g.y0 + 8;
    c.rect(pfx, pfy, 7, 6, dark, 2, PWF.GLOW);
    c.rect(pfx + 1, pfy + 1, 5, 4, curtain, 4, PWF.GLOW);
  }
  if (kind === 'ghoul') {
    // Someone standing at the window: head + hunched shoulders, backlit (dark), a lit rim on one side.
    const sx = g.x0 + 11 + (variant % 3) * 6;
    const head = g.y0 + 9;
    for (let y = head - 4; y <= g.y1; y++) {
      const hw = y < head + 4 ? 3 - Math.max(0, Math.abs(y - head) - 2) * 0.6 : y < head + 6 ? 2 : Math.min(8, 3 + (y - head - 6));
      for (let x = Math.round(sx - hw); x <= Math.round(sx + hw + (y > head + 6 ? 1 : 0)); x++) {
        if (!inPane(x, y)) continue;
        const rim = x === Math.round(sx - hw);
        c.set(x, y, rim ? room : dark, rim ? base + 1 : 0, PWF.GLOW);
      }
    }
  }
}

// ─── Doors ──────────────────────────────────────────────────────────────────

export type DoorKind = 'wood' | 'shop' | 'metal';

export const DOOR_TX = { w: 40, h: 92 } as const;
export const DOOR_M = { w: DOOR_TX.w / 32, h: DOOR_TX.h / 32 } as const;

/**
 * A doorway module (40 × 92): stone surround, a recessed door — panelled wood
 * with a small lit or dark light, a glazed shop door with a push bar and an
 * OPEN / CLOSED card, or a riveted steel service door — and the step.
 */
export function doorModule(atlas: PwAtlas, kind: DoorKind, o: { hex: number; stone: number; lit?: number; wall?: number }): PwTile {
  const key = `door|${kind}|${h6(o.hex)}|${h6(o.stone)}|${h6(o.lit ?? 0)}`;
  return atlas.tile(key, DOOR_TX.w, DOOR_TX.h, (c, k) => paintDoor(c, k, kind, o));
}

export function paintDoor(c: PwCanvas, k: PwKit, kind: DoorKind, o: { hex: number; stone: number; lit?: number; wall?: number }) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const stone = k.ramp(o.stone, { light: 0.42, sat: 0.75 });
  const door = k.ramp(o.hex, { light: 0.42, sat: 0.95 });
  const wallSh = k.ramp(0x2a2630, { light: 0.4 });
  const metal = k.ramp(0x8a8c90, { light: 0.55, sat: 0.6 });
  // Surround: jambs + head, lit on the left, shadowed on the right / under the head.
  c.rect(0, 0, W, H - 3, stone, 3);
  c.hline(0, 0, W, stone, 4);
  c.vline(0, 0, H - 3, stone, 4);
  c.vline(W - 1, 0, H - 3, stone, 2);
  // Recess: the door sits 2 texels in; the head and left reveal throw shadow onto it.
  const dx0 = 4;
  const dx1 = W - 5;
  const dy0 = 6;
  const dy1 = H - 4;
  c.rect(dx0 - 1, dy0 - 1, dx1 - dx0 + 3, dy1 - dy0 + 2, wallSh, 1);
  if (kind === 'wood' || kind === 'metal') {
    c.rect(dx0 + 1, dy0 + 1, dx1 - dx0, dy1 - dy0, door, 3);
    c.vline(dx0 + 1, dy0 + 1, dy1 - dy0, door, 4);
    c.vline(dx1, dy0 + 1, dy1 - dy0, door, 2);
    // Shadow of the head on the top of the door.
    c.hline(dx0 + 1, dy0 + 1, dx1 - dx0, door, 1);
  }
  if (kind === 'wood') {
    // Four raised panels (bevelled), a small light above them, knob, kick plate.
    const pw = (dx1 - dx0 - 6) >> 1;
    const lightH = 16;
    const lit = o.lit ? k.ramp(o.lit, { light: 0.5 }) : k.ramp(0x1c2434, { light: 0.4 });
    c.rect(dx0 + 4, dy0 + 4, dx1 - dx0 - 6, lightH, lit, o.lit ? 3 : 2, o.lit ? PWF.GLOW : 0);
    c.frame(dx0 + 3, dy0 + 3, dx1 - dx0 - 4, lightH + 2, door, 1);
    if (!o.lit) c.line(dx0 + 6, dy0 + 6, dx0 + 12, dy0 + 12, k.ramp(0x46557a, { light: 0.35 }), 2);
    for (let r = 0; r < 2; r++) {
      for (let col = 0; col < 2; col++) {
        const x = dx0 + 4 + col * (pw + 2);
        const y = dy0 + lightH + 8 + r * 28;
        c.rect(x, y, pw, 24, door, 3);
        c.bevel(x, y, pw, 24, true, 1, 1);
        c.rect(x + 2, y + 2, pw - 4, 20, door, 3);
      }
    }
    c.rect(dx1 - 5, dy0 + 50, 2, 2, metal, 4);
    c.set(dx1 - 4, dy0 + 51, metal, 2);
    c.rect(dx0 + 2, dy1 - 6, dx1 - dx0 - 2, 5, metal, 3);
    c.hline(dx0 + 2, dy1 - 6, dx1 - dx0 - 2, metal, 4);
    c.scatter(rng, dx0 + 2, dy1 - 6, dx1 - dx0 - 2, 5, 6, 0, -1, { shapes: 2 });
  } else if (kind === 'shop') {
    // Aluminium-framed glass door: lit interior (GLOW) or dark glass, push bar, a hanging card.
    const al = k.ramp(0xa8acb0, { light: 0.5, sat: 0.5 });
    c.rect(dx0 + 1, dy0 + 1, dx1 - dx0, dy1 - dy0, al, 3);
    c.vline(dx0 + 1, dy0 + 1, dy1 - dy0, al, 4);
    c.vline(dx1, dy0 + 1, dy1 - dy0, al, 2);
    const gx0 = dx0 + 4;
    const gx1 = dx1 - 3;
    const gy0 = dy0 + 4;
    const gy1 = dy1 - 9;
    if (o.lit) {
      const room = k.ramp(o.lit, { light: 0.5 });
      for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) c.set(x, y, room, y < gy0 + 10 ? 4 : y > gy1 - 14 ? 2 : 3, PWF.GLOW | PWF.DITHER);
    } else {
      const glass = k.ramp(0x1c2434, { light: 0.4 });
      const sky = k.ramp(0x46557a, { light: 0.35 });
      c.rect(gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 1, glass, 2);
      for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) if ((x + y) % 22 < 3) c.set(x, y, sky, 2);
    }
    // Push bar.
    c.rect(gx0 - 1, gy0 + 34, gx1 - gx0 + 3, 2, al, 4);
    // OPEN / CLOSED card on a string.
    const card = k.ramp(o.lit ? 0xd83030 : 0xe8e0d0, { light: 0.4 });
    const cx = ((gx0 + gx1) >> 1) - 9;
    c.line(cx + 2, gy0 + 2, cx + 9, gy0 - 0 + 6, al, 1);
    c.line(cx + 16, gy0 + 2, cx + 9, gy0 + 6, al, 1);
    c.rect(cx, gy0 + 7, 19, 8, card, 3, o.lit ? PWF.GLOW : 0);
    drawText(c, o.lit ? 'OPEN' : 'SHUT', cx + 2, gy0 + 9, FONT_3x5, card, o.lit ? 5 : 1, { flag: o.lit ? PWF.GLOW : 0 });
  } else {
    // Steel service door: rivets, a vent grille, rust running from the bottom.
    const rust = k.ramp(0x8a4a24, { light: 0.4 });
    for (let y = dy0 + 4; y < dy1; y += 8) {
      c.set(dx0 + 3, y, door, 4);
      c.set(dx1 - 2, y, door, 4);
    }
    for (let y = dy1 - 22; y < dy1 - 12; y += 2) c.hline(dx0 + 6, y, dx1 - dx0 - 10, door, 1);
    c.rect(dx1 - 7, dy0 + 40, 3, 6, metal, 3);
    for (let i = 0; i < 18; i++) {
      const x = rng.int(dx0 + 2, dx1 - 1);
      const len = rng.int(3, 14);
      for (let j = 0; j < len; j++) if (hash2(x, j, 2) > j / len) c.tint(x, dy1 - 1 - j, rust, 0);
    }
    const sign = k.ramp(0xe8d040, { light: 0.4 });
    c.rect(dx0 + 6, dy0 + 10, dx1 - dx0 - 10, 9, sign, 3);
    drawText(c, 'NO', dx0 + 9, dy0 + 12, FONT_3x5, sign, 0);
    drawText(c, 'ENTRY', dx0 + 6 + 10, dy0 + 12, FONT_3x5, sign, 0, { scale: 1 });
  }
  // Step: worn stone tread, lit nose, dark riser foot.
  c.rect(0, H - 4, W, 4, stone, 3);
  c.hline(0, H - 4, W, stone, 4);
  c.hline(0, H - 1, W, stone, 1);
  c.hline(dx0 + 4, H - 4, dx1 - dx0 - 6, stone, 2);
}

// ─── Shopfronts ─────────────────────────────────────────────────────────────

export type ShopGoods = 'hardware' | 'pawn' | 'laundry' | 'liquor' | 'pharmacy' | 'barber' | 'cafe' | 'bar' | 'guns' | 'generic';

export interface ShopfrontSpec {
  /** Module width class (m): 6, 8, 10 or 12. */
  widthM: number;
  goods: ShopGoods;
  /** Interior light colour (0 = closed / dark). */
  lit: number;
  /** Stall riser (bulkhead) colour. */
  riser: number;
  /** Frame (mullions, transom) colour. */
  frame: number;
  /** Half-closed roll-down shutter over the glass. */
  shutter?: boolean;
  /** Boarded up. */
  boarded?: boolean;
  /** Lettering on the glass (gold leaf / white). */
  lettering?: string;
  variant?: number;
}

/** Height of a shopfront bay (m): bulkhead 0.65 + glass ≈ 2.4 + fascia band. */
export const SHOPFRONT_H_M = 112 / 32;
/** Width of one shopfront bay (m): lay `bays = round(width / SHOP_BAY_M)` of them across a shop window. */
export const SHOP_BAY_M = 4;

/** Interior light classes (shops share painted bays by the colour family of their light). */
export function shopLightClass(hex: number): number {
  if (!hex) return 0;
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  if (b > r) return 0xd8f4ff; // cool / white fluorescent
  if (r > 200 && g < 140) return 0xff7a9a; // pink / red neon spill
  return 0xffd08a; // warm
}

/**
 * A shopfront BAY (wrap tile along u, 128 × 112 = 4 × 3.5 m): bulkhead panels,
 * a mullion on its left edge, the display window with the shop's goods behind
 * the glass (lit = GLOW, by light class), the fascia band — repeat it across a
 * shop window of any width (`PwBatch.rect` with u spanning bays × 128).
 */
export function shopfrontModule(atlas: PwAtlas, s: ShopfrontSpec): PwTile {
  const W = 128;
  const H = 112;
  const lit = shopLightClass(s.lit);
  const key = `shopbay|${s.goods}|${h6(lit)}|${h6(s.riser)}|${h6(s.frame)}|${s.shutter ? 1 : 0}|${s.boarded ? 1 : 0}|${s.variant ?? 0}`;
  return atlas.tile(key, W, H, (c, k) => paintShopfront(c, k, { ...s, lit }), { wrap: true });
}

export function paintShopfront(c: PwCanvas, k: PwKit, s: ShopfrontSpec) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const frame = k.ramp(s.frame, { light: 0.45, sat: 0.7 });
  const riser = k.ramp(s.riser, { light: 0.42, sat: 0.9 });
  const riserH = 21;
  const transomH = 14;
  const gy0 = transomH + 1;
  const gy1 = H - riserH - 2;
  // Fascia band + transom bar.
  c.rect(0, 0, W, transomH + 1, frame, 2);
  c.hline(0, 0, W, frame, 4);
  c.hline(0, transomH - 4, W, frame, 4);
  c.rect(0, transomH - 3, W, 3, frame, 3);
  c.hline(0, transomH, W, frame, 1);
  // Bulkhead: tiled panels with a lit cap.
  c.rect(0, H - riserH - 2, W, riserH + 2, riser, 3);
  c.hline(0, H - riserH - 2, W, frame, 4);
  c.hline(0, H - riserH - 1, W, frame, 2);
  for (let x = 4; x < W - 4; x += 24) {
    c.rect(x, H - riserH + 3, 20, riserH - 7, riser, 3);
    c.bevel(x, H - riserH + 3, 20, riserH - 7, false, 1, 1);
  }
  c.hline(0, H - 1, W, riser, 1);
  // Glass (a bay: its own mullion on the left edge, the next bay's closes it).
  const mullions = 1;
  const gx0 = 2;
  const gx1 = W - 1;
  if (s.lit) paintGoods(c, k, rng, s, gx0, gy0, gx1, gy1);
  else {
    const glass = k.ramp(0x1c2434, { light: 0.4 });
    const sky = k.ramp(0x46557a, { light: 0.35 });
    paintGoods(c, k, rng, s, gx0, gy0, gx1, gy1, true);
    // Reflections over the dark goods.
    for (let y = gy0; y <= gy1; y++) {
      for (let x = gx0; x <= gx1; x++) {
        const d = (x + (y - gy0) * 1.1) % 60;
        if (d < 3) c.set(x, y, sky, 2);
        else if (c.at(x, y) === 0) c.set(x, y, glass, 2);
      }
    }
  }
  // Mullion (left edge of the bay).
  for (let m = 0; m < mullions; m++) {
    c.rect(0, gy0, 3, gy1 - gy0 + 1, frame, 3);
    c.vline(0, gy0, gy1 - gy0 + 1, frame, 4);
    c.vline(2, gy0, gy1 - gy0 + 1, frame, 2);
  }
  // Lettering on the glass (gold leaf with a dark keyline).
  if (s.lettering && !s.boarded) {
    const gold = k.ramp(0xd8b048, { light: 0.5 });
    const tw = s.lettering.length * 6;
    drawText(c, s.lettering, Math.max(4, (W >> 1) - (tw >> 1)), gy0 + 6, FONT_5x7, gold, 4, { flag: s.lit ? PWF.GLOW : 0, shadow: { ramp: gold, tone: 0 }, shadeFn: (_u, v) => (v < 0.3 ? 1 : 0) });
  }
  if (s.shutter) {
    // Roll-down shutter half over the glass: horizontal slats, a bottom bar with handles, graffiti.
    const sh = k.ramp(0x7a7e86, { light: 0.5, sat: 0.6 });
    const sy1 = gy0 + Math.round((gy1 - gy0) * 0.55);
    for (let y = gy0; y <= sy1; y++) for (let x = 0; x < W; x++) c.set(x, y, sh, (y - gy0) % 4 === 0 ? 2 : (y - gy0) % 4 === 1 ? 4 : 3);
    c.rect(0, sy1 + 1, W, 3, sh, 2);
    c.hline(0, sy1 + 1, W, sh, 4);
    for (const hx of [W * 0.25, W * 0.75]) c.rect(Math.round(hx) - 2, sy1 + 2, 5, 1, sh, 0);
    graffiti(c, k, rng, 6, gy0 + 3, W - 12, sy1 - gy0 - 6, s.variant ?? 0);
  }
  if (s.boarded) {
    const wood = k.ramp(0x6e5440, { light: 0.4, sat: 0.9 });
    const wood2 = k.ramp(0x7a6248, { light: 0.4, sat: 0.9 });
    for (let x = 0, b = 0; x < W; b++) {
      const bw = 14 + Math.floor(hash2(b, 1, 3) * 8);
      const r = b % 2 ? wood2 : wood;
      const top = gy0 - 2 + Math.floor(hash2(b, 2, 3) * 3);
      c.rect(x, top, bw - 1, gy1 - top + 2, r, 3);
      c.vline(x, top, gy1 - top + 2, r, 4);
      c.vline(x + bw - 2, top, gy1 - top + 2, r, 2);
      for (let g = 0; g < 4; g++) c.vline(x + rng.int(2, bw - 4), top + rng.int(2, 30), rng.int(4, 14), r, 2);
      c.set(x + 3, top + 3, r, 0);
      c.set(x + 3, gy1 - 3, r, 0);
      x += bw;
    }
    // Cross braces, a torn poster, graffiti.
    poster(c, k, rng, Math.round(W * 0.18), gy0 + 8, s.variant ?? 0);
    graffiti(c, k, rng, Math.round(W * 0.45), gy0 + 18, Math.round(W * 0.45), 30, (s.variant ?? 0) + 1);
  }
}

/** Goods behind the glass, as the shop sells them (GLOW when lit; `dark` = closed, dimmer non-glowing shapes). */
function paintGoods(c: PwCanvas, k: PwKit, rng: PwRng, s: ShopfrontSpec, x0: number, y0: number, x1: number, y1: number, dark = false) {
  const F = dark ? 0 : PWF.GLOW;
  const back = k.ramp(dark ? 0x1e2230 : s.lit, { light: 0.5, sat: 1 });
  const shelf = k.ramp(dark ? 0x2a2a30 : darken(s.lit, 0.55), { light: 0.45 });
  const tb = dark ? 1 : 3;
  // Back wall with a light falloff from the ceiling tubes.
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) c.set(x, y, back, tb + (y < y0 + 6 ? 1 : 0) - (y > y1 - 10 ? 1 : 0), F | PWF.DITHER);
  // Ceiling tubes.
  if (!dark) for (let x = x0 + 8; x < x1 - 20; x += 40) c.rect(x, y0 + 1, 18, 1, back, 5, F);
  const goodsCols = [0xd84a3a, 0x3a7ad8, 0xe8c840, 0x4aa84a, 0xe8e0d0, 0xa84ad8];
  const gr = goodsCols.map((h) => k.ramp(dark ? darken(h, 0.45) : h, { light: 0.4 }));
  const g = s.goods;
  const W = x1 - x0;
  if (g === 'laundry') {
    // A row of front-loading washers: white boxes with round dark portholes.
    for (let x = x0 + 4; x < x1 - 18; x += 22) {
      const by = y1 - 22;
      c.rect(x, by, 18, 22, gr[4], dark ? 1 : 3, F);
      c.hline(x, by, 18, gr[4], dark ? 2 : 4, F);
      c.ellipse(x + 9, by + 12, 6, 6, shelf, 1, F);
      c.ellipse(x + 8, by + 11, 3, 3, gr[1], dark ? 1 : 3, F);
      c.rect(x + 2, by + 2, 6, 2, shelf, 2, F);
    }
    return;
  }
  if (g === 'barber') {
    // Mirror wall, chairs, a striped pole by the door.
    c.rect(x0 + 6, y0 + 8, W - 12, 26, gr[4], dark ? 1 : 4, F);
    for (let x = x0 + 12; x < x1 - 20; x += 34) {
      c.rect(x, y1 - 26, 14, 10, gr[0], dark ? 1 : 3, F);
      c.rect(x + 2, y1 - 36, 10, 12, gr[0], dark ? 1 : 2, F);
      c.rect(x + 5, y1 - 16, 4, 16, shelf, 1, F);
    }
    for (let y = y0 + 4; y < y1 - 4; y++) c.rect(x1 - 8, y, 4, 1, (y >> 1) % 3 === 0 ? gr[0] : (y >> 1) % 3 === 1 ? gr[4] : gr[1], 4, F);
    return;
  }
  if (g === 'cafe' || g === 'bar') {
    // Counter with stools, bottles / cups on a back shelf, hanging lamps.
    const cy = y1 - 18;
    c.rect(x0, cy, W, 18, shelf, 2, F);
    c.hline(x0, cy, W, shelf, 4, F);
    for (let x = x0 + 6; x < x1 - 6; x += 16) {
      c.rect(x, cy - 4, 6, 2, gr[0], dark ? 1 : 3, F);
      c.vline(x + 2, cy - 2, 2, shelf, 1, F);
    }
    for (let x = x0 + 4; x < x1 - 4; x += 3) {
      const r = gr[Math.floor(hash2(x, 3, 1) * gr.length)];
      const bh = g === 'bar' ? 6 + Math.floor(hash2(x, 4, 1) * 4) : 3;
      c.rect(x, y0 + 22 - bh, 2, bh, r, dark ? 1 : 4, F);
    }
    c.hline(x0 + 2, y0 + 22, W - 4, shelf, 1, F);
    for (let x = x0 + 20; x < x1 - 10; x += 40) {
      c.vline(x, y0, 6, shelf, 1, F);
      c.rect(x - 3, y0 + 6, 7, 3, gr[2], dark ? 1 : 5, F);
    }
    if (g === 'bar' && !dark) {
      // Neon beer signs in the window.
      const neon = k.ramp(0xff3c9a, { light: 0.6 });
      drawText(c, 'BEER', x0 + 10, y0 + 30, FONT_3x5, neon, 5, { flag: PWF.GLOW, scale: 2 });
    }
    return;
  }
  // Shelving stores (hardware, liquor, pharmacy, pawn, guns, generic): shelves of products.
  const rows = 4;
  const rh = Math.floor((y1 - y0 - 8) / rows);
  for (let r = 0; r < rows; r++) {
    const sy = y0 + 6 + (r + 1) * rh;
    c.hline(x0 + 1, sy, W - 2, shelf, dark ? 1 : 2, F);
    c.hline(x0 + 1, sy + 1, W - 2, shelf, 0, F);
    let x = x0 + 3;
    while (x < x1 - 4) {
      const v = hash2(x, r, 11);
      const r0 = gr[Math.floor(v * gr.length)];
      let pw = 3;
      let ph = 5;
      if (g === 'liquor') {
        pw = 2;
        ph = 6 + Math.floor(v * 4);
      } else if (g === 'pharmacy') {
        pw = 4;
        ph = 4 + (v > 0.5 ? 2 : 0);
      } else if (g === 'hardware') {
        pw = 5 + Math.floor(v * 4);
        ph = 3 + Math.floor(v * 5);
      } else if (g === 'guns') {
        pw = 12;
        ph = 2;
      } else if (g === 'pawn') {
        pw = 6 + Math.floor(v * 6);
        ph = 4 + Math.floor(v * 6);
      }
      const top = sy - ph;
      c.rect(x, top, pw, ph, r0, dark ? 1 : 3, F);
      if (!dark) {
        c.hline(x, top, pw, r0, 4, F);
        c.vline(x + pw - 1, top + 1, ph - 1, r0, 2, F);
        // Labels / bottle necks.
        if (g === 'liquor') c.set(x, top - 1, r0, 2, F);
        else if (pw > 3 && ph > 3) c.hline(x + 1, top + (ph >> 1), pw - 2, gr[4], 4, F);
      }
      x += pw + 1 + (hash2(x, r, 12) > 0.85 ? 3 : 0);
    }
  }
  if (g === 'pharmacy' && !dark) {
    const green = k.ramp(0x4dff74, { light: 0.6 });
    const cx = x1 - 22;
    const cy = y0 + 14;
    c.rect(cx - 2, cy - 7, 5, 15, green, 5, PWF.GLOW);
    c.rect(cx - 7, cy - 2, 15, 5, green, 5, PWF.GLOW);
  }
}

// ─── Cornice, awning, wall decals ───────────────────────────────────────────

/** Moulded cornice (wrap along u): cap, dentil course, bed moulding, shadow. 64 × 16 (0.5 m). */
export function corniceTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(
    `cornice|${h6(o.hex)}`,
    64,
    16,
    (c, k) => {
      const s = k.ramp(o.hex, { light: 0.45, sat: 0.75 });
      c.rect(0, 0, c.w, c.h, s, 3);
      c.hline(0, 0, c.w, s, 4);
      c.hline(0, 1, c.w, s, 4);
      c.hline(0, 3, c.w, s, 1);
      // Dentils: small blocks with a lit left face and a dark gap.
      for (let x = 0; x < c.w; x += 4) {
        c.rect(x, 5, 3, 5, s, 3);
        c.vline(x, 5, 5, s, 4);
        c.vline(x + 3, 5, 5, s, 0);
        c.set(x + 2, 9, s, 2);
      }
      c.hline(0, 10, c.w, s, 1);
      c.hline(0, 11, c.w, s, 4);
      c.hline(0, 13, c.w, s, 2);
      c.hline(0, 14, c.w, s, 1);
      c.hline(0, 15, c.w, s, 0);
    },
    { wrap: true },
  );
}

/** Striped awning canvas (wrap): stripes along the slope, a worn sheen. 64 × 64. */
export function awningTile(atlas: PwAtlas, o: { hex: number; stripe?: number }): PwTile {
  return atlas.tile(
    `awning|${h6(o.hex)}|${h6(o.stripe ?? 0xd8d0c0)}`,
    64,
    64,
    (c, k) => {
      const a = k.ramp(o.hex, { light: 0.45 });
      const b = k.ramp(o.stripe ?? 0xd8d0c0, { light: 0.35, sat: 0.8 });
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const st = Math.floor(x / 8) % 2;
          // Canvas sags between the ribs: lit crest every 16 texels down the slope.
          const t = y % 16 < 2 ? 4 : y % 16 > 13 ? 2 : 3;
          c.set(x, y, st ? b : a, st ? t - 1 : t);
        }
      }
      c.scatter(k.rng, 0, 0, c.w, c.h, 30, 0, -1, { shapes: 3 });
    },
    { wrap: true },
  );
}

/** Scalloped awning valance (wrap along u, cut out below the scallops). 32 × 12. */
export function valanceTile(atlas: PwAtlas, o: { hex: number; stripe?: number }): PwTile {
  return atlas.tile(
    `valance|${h6(o.hex)}|${h6(o.stripe ?? 0xd8d0c0)}`,
    32,
    16,
    (c, k) => {
      const a = k.ramp(o.hex, { light: 0.45 });
      const b = k.ramp(o.stripe ?? 0xd8d0c0, { light: 0.35, sat: 0.8 });
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const lx = x % 16;
          const depth = 8 + Math.round(Math.sqrt(Math.max(0, 1 - ((lx - 7.5) / 8) ** 2)) * 6);
          if (y >= depth) continue;
          const st = Math.floor(x / 8) % 2;
          const t = y === 0 ? 4 : y >= depth - 1 ? 1 : y === 1 ? 3 : 3;
          c.set(x, y, st ? b : a, st && t > 1 ? t - 1 : t);
        }
      }
    },
    { wrap: true },
  );
}

/**
 * Wall variants for a facade's FOOT (rising damp, splash-back dirt, a skirting
 * of grime ~1.25 m) and HEAD (drip stains under the cornice ~1 m): same pattern
 * as the base tile (same seed), weathered at its bottom / top rows.
 */
export function wallFoot(atlas: PwAtlas, base: PwTile): PwTile {
  return atlas.variant(base, 'foot', (c, k) => {
    const rows = 40;
    for (let y = c.h - rows; y < c.h; y++) {
      const t = (y - (c.h - rows)) / rows;
      for (let x = 0; x < c.w; x++) {
        const edge = 0.35 + smooth(x, 0, c.w, 8, 6, 3) * 0.4;
        if (t > edge) c.shift(x, y, -1);
        if (t > 0.85) c.shift(x, y, -1);
      }
    }
    c.scatter(k.rng, 0, c.h - 14, c.w, 14, 30, 0, -1, { shapes: 4 });
  });
}

export function wallHead(atlas: PwAtlas, base: PwTile): PwTile {
  return atlas.variant(base, 'head', (c, k) => {
    for (let x = 0; x < c.w; x++) {
      const len = Math.round(4 + smooth(x, 0, c.w, 8, 10, 7) * 26 * (hash2(x >> 2, 1, 5) > 0.4 ? 1 : 0.3));
      for (let y = 0; y < len; y++) if (y < len * 0.6 || hash2(x, y, 9) > (y / len) * 0.9) c.shift(x, y, -1);
    }
    void k;
  });
}

/** A torn street poster / bill (cut-out ragged edge), `variant` picks the design. ~22 × 30. */
export function posterDecal(atlas: PwAtlas, variant: number): PwTile {
  return atlas.tile(`poster|${variant}`, 24, 32, (c, k) => poster(c, k, k.rng, 1, 1, variant));
}

function poster(c: PwCanvas, k: PwKit, rng: PwRng, x: number, y: number, v: number) {
  const papers = [0xe8e0c8, 0xd8c848, 0xd85a4a, 0x6a9ad8];
  const paper = k.ramp(papers[v % papers.length], { light: 0.35, sat: 0.9 });
  const ink = k.ramp(([0x1a1a20, 0x8a1a1a, 0x1a2a6a] as const)[v % 3], { light: 0.4 });
  const W = 22;
  const H = 30;
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      // Torn corners / edges.
      const torn = (yy > H - 6 && xx > W - 8 && hash2(xx, yy, v) > (H - yy) / 6) || (yy < 3 && xx < 5 && hash2(xx, yy, v + 1) > 0.5);
      if (torn) continue;
      c.set(x + xx, y + yy, paper, yy < 2 ? 4 : 3);
    }
  }
  // Headline, a picture block, text lines.
  drawText(c, (['LOST', 'SALE', 'VOTE', 'HELP', 'BAND'] as const)[v % 5], x + 2, y + 3, FONT_3x5, ink, 1);
  c.rect(x + 3, y + 10, W - 6, 9, ink, 2);
  c.rect(x + 5, y + 12, 5, 5, paper, 2);
  for (let l = 0; l < 3; l++) c.hline(x + 3, y + 22 + l * 2, W - 6 - rng.int(0, 6), ink, 2);
  // Peeling: the paper's fold lit, its shadow below.
  c.set(x + W - 8, y + H - 6, paper, 5);
}

/** Spray-paint tag across a surface (cut-out decal or painted in place). */
export function graffitiDecal(atlas: PwAtlas, variant: number, w = 64, h = 24): PwTile {
  return atlas.tile(`graffiti|${variant}|${w}x${h}`, w, h, (c, k) => graffiti(c, k, k.rng, 1, 1, w - 2, h - 2, variant));
}

function graffiti(c: PwCanvas, k: PwKit, rng: PwRng, x: number, y: number, w: number, h: number, v: number) {
  const cols = [0xd83a8a, 0x3ad8a8, 0xe8d040, 0x4a8ae8, 0xe8e8e8];
  const fill = k.ramp(cols[v % cols.length], { light: 0.4 });
  const out = k.ramp(cols[(v + 2) % cols.length] === 0xe8e8e8 ? 0x1a1a20 : 0x1a1a20, { light: 0.4 });
  const words = ['RIP', 'DOOM', 'Z', 'RUN', 'END', 'NO', 'HELL'];
  const word = words[v % words.length];
  const scale = Math.max(1, Math.min(3, Math.floor(h / 9)));
  // Bubble letters: the bold font, outlined, with a drip or two.
  const tw = word.length * 7 * scale;
  const ox = x + Math.max(0, (w - tw) >> 1);
  const oy = y + Math.max(0, (h - 8 * scale) >> 1);
  drawText(c, word, ox - 1, oy - 1, FONT_BOLD, out, 1, { scale });
  drawText(c, word, ox + 1, oy + 1, FONT_BOLD, out, 1, { scale });
  drawText(c, word, ox, oy, FONT_BOLD, fill, 3, { scale, shadeFn: (_u, vv) => (vv < 0.35 ? 1 : 0) });
  for (let d = 0; d < 3; d++) {
    const dx = ox + rng.int(0, Math.max(1, tw - 2));
    const dy = oy + 7 * scale;
    const len = rng.int(2, 6);
    for (let j = 0; j < len; j++) if (c.at(dx, dy - 1)) c.set(dx, dy + j, fill, 2);
  }
}

/** Drainpipe (wrap along v): a round downpipe with a lit left side and brackets every metre. 6 × 32. */
export function drainpipeTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(
    `drainpipe|${h6(o.hex)}`,
    16,
    32,
    (c, k) => {
      const p = k.ramp(o.hex, { light: 0.5, sat: 0.7 });
      const rust = k.ramp(0x8a4a24, { light: 0.4 });
      for (let y = 0; y < c.h; y++) {
        c.set(5, y, p, 4);
        c.set(6, y, p, 3);
        c.set(7, y, p, 3);
        c.set(8, y, p, 2);
        c.set(9, y, p, 1);
      }
      c.rect(4, 0, 7, 2, p, 3);
      c.hline(4, 0, 7, p, 4);
      c.set(10, 1, p, 1);
      c.set(7, 14, rust, 2);
      c.set(7, 15, rust, 1);
    },
    { wrap: true },
  );
}

/** Window AC unit (module, 28 × 20): grille, vents, a rust drip. */
export function acUnitModule(atlas: PwAtlas): PwTile {
  return atlas.tile('acunit', 28, 22, (c, k) => {
    const m = k.ramp(0xb8b8b0, { light: 0.45, sat: 0.6 });
    const rust = k.ramp(0x8a4a24, { light: 0.4 });
    c.rect(0, 0, 28, 18, m, 3);
    c.hline(0, 0, 28, m, 4);
    c.vline(0, 0, 18, m, 4);
    c.vline(27, 0, 18, m, 1);
    c.hline(0, 17, 28, m, 1);
    for (let y = 3; y < 15; y += 2) c.hline(3, y, 13, m, 1);
    for (let x = 19; x < 25; x += 2) c.vline(x, 3, 12, m, 2);
    c.rect(1, 18, 26, 2, m, 0);
    for (let j = 0; j < 6; j++) if (j < 2 || k.rng.chance(0.6)) c.set(22, 18 + j, rust, 2 - (j > 2 ? 1 : 0));
  });
}

/** A fire-escape stage seen from the front (cut-out): railing, slatted floor, the ladder down. 96 × 64. */
export function fireEscapeModule(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`fireescape|${h6(o.hex)}`, 96, 64, (c, k) => {
    const m = k.ramp(o.hex, { light: 0.4, sat: 0.8 });
    const rail = 3;
    // Top rail + posts + middle rail.
    c.rect(0, rail, 96, 2, m, 3);
    c.hline(0, rail, 96, m, 4);
    c.hline(0, rail + 14, 96, m, 2);
    for (let x = 0; x < 96; x += 12) c.rect(x, rail, 2, 30, m, 3);
    for (let x = 0; x < 96; x += 4) c.vline(x + 1, rail + 2, 28, m, 2);
    // Slatted floor (seen edge-on) with its shadow below.
    c.rect(0, rail + 30, 96, 3, m, 3);
    c.hline(0, rail + 30, 96, m, 4);
    c.hline(0, rail + 32, 96, m, 1);
    // Brackets under the floor.
    for (const bx of [4, 88]) c.line(bx, rail + 33, bx + 4, rail + 45, m, 2);
    // Ladder down (right).
    c.vline(70, rail + 33, 28, m, 3);
    c.vline(78, rail + 33, 28, m, 2);
    for (let y = rail + 36; y < 62; y += 5) c.hline(71, y, 7, m, 3);
    void k;
  });
}

/** Facade-wide grime shapes for a wall with the 'shift' trick inside a module (kept for stage painters). */
export function soot(c: PwCanvas, x: number, y: number, w: number, h: number) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (hash2(x + xx, y + yy, 77) > yy / h) c.shift(x + xx, y + yy, -1);
}
