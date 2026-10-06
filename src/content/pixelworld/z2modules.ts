import { PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, textWidth } from './font';
import { hash2 } from './surfaces';
import { mixHex } from './z2surfaces';

/**
 * ST. MERCY HOSPITAL fixtures for PIXEL WORLD (clamp modules laid on the
 * classic fixture's face at its size): fluorescent troffers (GLOW tubes behind
 * a prismatic lens), wall monitors with a live trace, the reception TV's
 * emergency broadcast, a clock, whiteboards, caged emergency lamps, x-ray
 * light boxes, vending-machine fronts, cold-storage drawer doors, wall
 * fixtures (switches, call buttons, dispensers), the bed-head gas panel.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const G = PWF.GLOW;

/**
 * Recessed fluorescent troffer, seen from below (22 × 40 ≈ 0.69 × 1.25 m):
 * lit metal frame, two tubes glowing through a prismatic lens (a fine GLOW
 * grid), dead flies in a corner, a darker end on an old tube. `state`: on /
 * off (dead: grey lens, dark tubes) / warm.
 */
export function troffer(atlas: PwAtlas, state: 'on' | 'off' | 'warm' | 'dim'): PwTile {
  return atlas.tile(`z2troffer|${state}`, 22, 40, (c, k) => {
    const frame = k.ramp(0xc8ccc4, { light: 0.45, sat: 0.5 });
    const col = state === 'warm' ? 0xfff1d0 : 0xe6fff2;
    const lens = k.ramp(state === 'off' ? 0x6a706c : col, { light: 0.55, sat: 0.7 });
    const W = 22;
    const H = 40;
    c.rect(0, 0, W, H, frame, 3);
    c.frame(0, 0, W, H, frame, 4);
    c.frame(1, 1, W - 2, H - 2, frame, 2);
    const on = state !== 'off';
    const fl = on ? G : 0;
    const base = state === 'dim' ? 2 : on ? 3 : 2;
    c.rect(2, 2, W - 4, H - 4, lens, base, fl);
    // Prismatic lens: a fine grid a step up / down.
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if ((x + y) % 3 === 0) c.set(x, y, lens, on ? base + 1 : Math.max(0, base - 1), fl);
    // Tubes behind the lens: two bright bands along the length.
    for (const tx of [6, 15]) {
      for (let y = 4; y < H - 4; y++) {
        const old = state !== 'off' && tx === 15 && y > H - 12;
        const t = !on ? 1 : old ? 3 : state === 'dim' ? 3 : 5;
        c.set(tx, y, lens, t, fl);
        c.set(tx + 1, y, lens, Math.max(0, t - 1), fl);
      }
    }
    // Dead flies / dust in the lens corner.
    for (const [x, y] of [[3, H - 4], [4, H - 5], [5, H - 4], [W - 5, 4]]) c.set(x, y, k.ramp(0x2a2a20, { light: 0.3 }), 1);
  });
}

/** Wall-mounted vitals monitor face (0.42 × 0.32 m → 14 × 10): bezel, ECG trace, numbers, an alarm light. */
export function monitorFace(atlas: PwAtlas, on: boolean, trace = 0x3aff8a): PwTile {
  return atlas.tile(`z2monitor|${on ? 1 : 0}|${h6(trace)}`, 14, 10, (c, k) => {
    const bez = k.ramp(0x2a2e30, { light: 0.5 });
    const scr = k.ramp(on ? 0x0a2418 : 0x101414, { light: 0.5 });
    const t = k.ramp(trace, { light: 0.55 });
    const red = k.ramp(0xff5040, { light: 0.5 });
    c.rect(0, 0, 14, 10, bez, 3);
    c.hline(0, 0, 14, bez, 4);
    c.hline(0, 9, 14, bez, 1);
    c.rect(1, 1, 12, 7, scr, on ? 2 : 1, on ? G : 0);
    if (on) {
      const ecg = [4, 4, 4, 3, 5, 1, 6, 4, 4, 4, 4];
      for (let x = 1; x < 12; x++) c.set(x, 1 + ecg[x - 1], t, 5, G);
      c.set(12, 2, red, 5, G);
      c.hline(9, 6, 3, t, 3, G);
    } else c.set(3, 3, scr, 3);
  });
}

/** The reception TV's emergency broadcast: blue screen, red ticker, STAY INDOORS. 48 × 28 (1.5 × 0.9 m). */
export function tvBroadcast(atlas: PwAtlas): PwTile {
  return atlas.tile('z2tv', 48, 28, (c, k) => {
    const bez = k.ramp(0x151515, { light: 0.5 });
    const blue = k.ramp(0x1a3a8a, { light: 0.55, sat: 1 });
    const red = k.ramp(0xff2020, { light: 0.5 });
    const white = k.ramp(0xf0f4ff, { light: 0.3 });
    c.rect(0, 0, 48, 28, bez, 2);
    c.hline(0, 0, 48, bez, 4);
    c.rect(2, 2, 44, 24, blue, 2, G);
    // Scanline bands.
    for (let y = 2; y < 26; y += 3) c.hline(2, y, 44, blue, 3, G);
    // Emergency seal + text.
    c.ellipse(9, 9, 5, 5, white, 3, G);
    c.ellipse(9, 9, 3, 3, blue, 2, G);
    drawText(c, 'STAY', 17, 4, FONT_3x5, white, 5, { flag: G });
    drawText(c, 'INDOORS', 17, 10, FONT_3x5, white, 5, { flag: G });
    c.rect(2, 19, 44, 5, red, 3, G);
    drawText(c, 'ALERT', 4, 19, FONT_3x5, white, 5, { flag: G });
    for (let x = 26; x < 44; x += 4) c.hline(x, 21, 2, white, 4, G);
  });
}

/** Wall clock face (13 × 13): dark rim, hour marks, hands stopped at the outbreak. Cut out round. */
export function clockFace(atlas: PwAtlas): PwTile {
  return atlas.tile('z2clock', 13, 13, (c, k) => {
    const rim = k.ramp(0x1a1a1a, { light: 0.5 });
    const face = k.ramp(0xe8e8e0, { light: 0.3, sat: 0.5 });
    const hand = k.ramp(0x111111, { light: 0.3 });
    c.ellipse(6.5, 6.5, 6.5, 6.5, rim, 2);
    c.ellipse(6.5, 6.5, 5.4, 5.4, face, 3);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.set(Math.round(6.5 + Math.cos(a) * 4.4 - 0.5), Math.round(6.5 + Math.sin(a) * 4.4 - 0.5), hand, i % 3 ? 2 : 1);
    }
    c.line(6, 6, 6, 2, hand, 1);
    c.line(6, 6, 9, 8, hand, 1);
    c.set(4, 3, face, 5);
  });
}

/** Whiteboard (1.6 × 1.0 m → 50 × 32): aluminium frame, bed list in marker, a bloody hand-swipe, marker tray. */
export function whiteboardFace(atlas: PwAtlas): PwTile {
  return atlas.tile('z2whiteboard', 50, 32, (c, k) => {
    const rng = k.rng;
    const fr = k.ramp(0x8a8f90, { light: 0.55, sat: 0.4 });
    const bd = k.ramp(0xd8dcd8, { light: 0.3, sat: 0.4 });
    const inks = [k.ramp(0x203a8a, { light: 0.4 }), k.ramp(0xa02020, { light: 0.4 }), k.ramp(0x205a30, { light: 0.4 })];
    const blood = k.ramp(0x7e0d0d, { light: 0.45, sat: 1.1 });
    c.rect(0, 0, 50, 32, fr, 3);
    c.hline(0, 0, 50, fr, 5);
    c.rect(2, 2, 46, 26, bd, 3);
    // Ghost of old writing (wiped): faint lines.
    for (let y = 5; y < 26; y += 4) for (let x = 4; x < 44; x++) if (hash2(x >> 2, y, 3) > 0.7) c.set(x, y, bd, 2);
    // Bed list: a grid + scrawled entries.
    for (let y = 4; y < 26; y += 5) c.hline(3, y, 44, inks[0], 3);
    c.vline(12, 4, 21, inks[0], 3);
    for (let r = 0; r < 4; r++) {
      drawText(c, String(r + 1), 5, 5 + r * 5, FONT_3x5, inks[0], 2);
      let x = 14;
      while (x < 14 + rng.int(12, 30)) {
        const w = rng.int(2, 5);
        c.hline(x, 7 + r * 5, w, inks[r === 2 ? 1 : 2], 2);
        c.set(x + 1, 6 + r * 5, inks[r === 2 ? 1 : 2], 2);
        x += w + 1;
      }
    }
    // Bloody hand swipe across.
    for (let i = 0; i < 18; i++) {
      const x = 26 + i;
      const y = 18 - Math.round(i * 0.45);
      for (let j = 0; j < 4; j++) if ((i + j) % 4 !== 3) c.set(x, y + j, blood, j === 0 ? 4 : 3);
    }
    // Tray with markers.
    c.rect(4, 28, 42, 3, fr, 2);
    c.rect(10, 27, 5, 1, inks[0], 3);
    c.rect(18, 27, 5, 1, inks[1], 3);
  });
}

/** Caged red emergency lamp seen from the front (8 × 8): bracket, red glowing dome behind bars. */
export function emergencyLampFace(atlas: PwAtlas): PwTile {
  return atlas.tile('z2elamp', 8, 8, (c, k) => {
    const m = k.ramp(0x2a2a2a, { light: 0.5 });
    const r = k.ramp(0xff2a1a, { light: 0.5, sat: 1.1 });
    c.rect(0, 0, 8, 3, m, 3);
    c.hline(0, 0, 8, m, 4);
    c.ellipse(4, 5, 3.5, 3, r, 4, G);
    c.set(3, 4, r, 5, G);
    for (const x of [2, 4, 6]) c.vline(x, 3, 5, m, 2);
  });
}

/** X-ray light box with films (1.3 × 0.9 m → 42 × 28): glowing panel, a chest film and a skull film. */
export function xrayFace(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2xray|${variant}`, 42, 28, (c, k) => {
    const box = k.ramp(0xb8bcb4, { light: 0.45, sat: 0.4 });
    const glow = k.ramp(0xd8f0ff, { light: 0.55, sat: 0.6 });
    const film = k.ramp(0x1a2a34, { light: 0.6, sat: 0.6 });
    c.rect(0, 0, 42, 28, box, 3);
    c.hline(0, 0, 42, box, 4);
    c.rect(2, 2, 38, 24, glow, 4, G);
    const filmAt = (x0: number, w: number) => {
      c.rect(x0, 3, w, 22, film, 1, G);
      c.hline(x0, 3, w, film, 2, G);
    };
    filmAt(4, 16);
    filmAt(22, 16);
    // Ribcage (variant 0) / skull (variant 1) on the films, in glowing bone tones.
    const bone = film;
    const cx = 12;
    c.vline(cx, 5, 18, bone, 4, G);
    for (let r = 0; r < 6; r++) {
      const y = 7 + r * 3;
      for (let x = 1; x < 6; x++) {
        const dy = Math.round(x * 0.35);
        c.set(cx - x, y + dy, bone, 4, G);
        c.set(cx + x, y + dy, bone, 4, G);
      }
    }
    if (variant === 0) {
      c.ellipse(30, 12, 5, 6, bone, 4, G);
      c.ellipse(28, 11, 1.4, 1.6, film, 1, G);
      c.ellipse(32, 11, 1.4, 1.6, film, 1, G);
      c.hline(27, 17, 6, bone, 3, G);
      for (let x = 27; x < 33; x += 2) c.set(x, 18, bone, 4, G);
    } else {
      for (let r = 0; r < 5; r++) c.hline(25, 6 + r * 4, 10, bone, 3, G);
      c.vline(30, 6, 17, bone, 4, G);
    }
  });
}

/**
 * Vending machine front (1.0 × 1.95 m → 32 × 62): coloured body, a lit window
 * of products on spiral rows, the brand panel, coin slot, keypad, delivery
 * flap; `lit` = the window glows.
 */
export function vendingFront(atlas: PwAtlas, body: number, lit: boolean, variant = 0): PwTile {
  return atlas.tile(`z2vend|${h6(body)}|${lit ? 1 : 0}|${variant}`, 32, 62, (c, k) => {
    const rng = k.rng;
    const b = k.ramp(body, { light: 0.5, sat: 1 });
    const glass = k.ramp(lit ? 0x8fb8c8 : 0x1c2428, { light: 0.5, sat: 0.8 });
    const dark = k.ramp(0x161818, { light: 0.4 });
    const steel = k.ramp(0xa8b0b4, { light: 0.5 });
    const cols = [0xd02a2a, 0x2a7ad0, 0xe0c020, 0x30a050, 0xe07020, 0xb040c0].map((h) => k.ramp(h, { light: 0.5, sat: 1.1 }));
    c.rect(0, 0, 32, 62, b, 3);
    c.vline(0, 0, 62, b, 4);
    c.vline(31, 0, 62, b, 1);
    // Brand header (glowing).
    c.rect(2, 2, 20, 6, k.ramp(0xffffff, { light: 0.3 }), lit ? 4 : 2, lit ? G : 0);
    drawText(c, variant ? 'SNAX' : 'COLA', 4, 3, FONT_3x5, b, 2, lit ? { flag: G } : {});
    // Product window.
    c.rect(2, 10, 20, 38, glass, lit ? 2 : 1, lit ? G : 0);
    for (let r = 0; r < 6; r++) {
      const y = 12 + r * 6;
      c.hline(2, y + 4, 20, steel, lit ? 3 : 2, lit ? G : 0);
      for (let i = 0; i < 5; i++) {
        if (hash2(r, i, variant + 3) < 0.25) continue;
        const col = cols[Math.floor(hash2(r, i, variant + 7) * cols.length)];
        c.rect(3 + i * 4, y, 3, 4, col, lit ? 4 : 2, lit ? G : 0);
        c.set(3 + i * 4, y, col, lit ? 5 : 3, lit ? G : 0);
      }
    }
    // A crack across the glass (somebody tried).
    let x = 6;
    let y = 14;
    for (let i = 0; i < 18; i++) {
      c.set(x, y, k.ramp(0xe8f0f4, { light: 0.2 }), 4, G);
      x += rng.chance(0.6) ? 1 : 0;
      y += 1;
    }
    // Side panel: keypad, coin slot, note slot.
    c.rect(24, 12, 6, 14, dark, 2);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 2; i++) c.set(25 + i * 2, 14 + r * 3, steel, 4);
    c.rect(25, 29, 4, 1, steel, 1);
    c.rect(25, 33, 4, 2, dark, 1);
    // Delivery flap + kick panel.
    c.rect(3, 51, 18, 6, dark, 1);
    c.hline(3, 51, 18, steel, 3);
    c.rect(0, 59, 32, 3, b, 1);
  });
}

/** A cold-storage drawer door (0.68 × 0.62 m → 22 × 20): stainless face, latch handle, a name card in a holder. */
export function drawerFace(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2drawer|${variant}`, 22, 20, (c, k) => {
    const s = k.ramp(0x9aa4a8, { light: 0.55, sat: 0.6 });
    const latch = k.ramp(0x3a3e40, { light: 0.5 });
    const card = k.ramp(0xe8e4d0, { light: 0.3 });
    const ink = k.ramp(0x2a2a3a, { light: 0.4 });
    c.rect(0, 0, 22, 20, s, 3);
    c.hline(0, 0, 22, s, 5);
    c.vline(0, 0, 20, s, 4);
    c.hline(0, 19, 22, s, 1);
    c.vline(21, 0, 20, s, 1);
    // Brushed grain.
    for (let y = 3; y < 18; y += 3) for (let x = 2; x < 20; x++) if (hash2(x >> 2, y, variant) > 0.5) c.set(x, y, s, 2);
    // Card holder + card.
    c.rect(2, 2, 9, 5, latch, 2);
    c.rect(3, 3, 7, 3, card, 3);
    for (let x = 4; x < 9; x += 2) c.set(x, 4, ink, 2);
    // Latch: a vertical handle with a lit edge.
    c.rect(17, 6, 3, 9, latch, 3);
    c.vline(17, 6, 9, latch, 4);
    c.set(18, 15, latch, 1);
    // A dent / a smear on some.
    if (variant === 1) {
      c.ellipseShade(9, 12, 3, 2, (d) => (d < 0.6 ? -1 : 0));
    }
    if (variant === 2) for (let y = 9; y < 17; y++) c.set(6 + (y % 2), y, k.ramp(0x6a0c0c, { light: 0.45 }), 3);
  });
}

/** The cold-storage wall's frame (between drawers): dark steel, a rivet line (wrap 16 × 16). */
export function storageFrameTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z2sframe', 16, 16, (c, k) => {
    const s = k.ramp(0x5a6466, { light: 0.5, sat: 0.6 });
    c.rect(0, 0, 16, 16, s, 2);
    for (let x = 2; x < 16; x += 6) c.set(x, 8, s, 4);
    c.hline(0, 0, 16, s, 3);
  }, { wrap: true });
}

export type FixtureKind = 'switch' | 'outlet' | 'alarm' | 'sanitizer' | 'phone' | 'sharps' | 'gloves' | 'callbutton' | 'thermostat' | 'hoseReel';

const FIXTURE_SIZE: Record<FixtureKind, [number, number]> = {
  switch: [4, 6],
  outlet: [4, 6],
  alarm: [6, 8],
  sanitizer: [6, 10],
  phone: [8, 12],
  sharps: [8, 9],
  gloves: [12, 7],
  callbutton: [4, 4],
  thermostat: [6, 5],
  hoseReel: [20, 22],
};

/** Small wall fixtures (cut out round their plates). */
export function fixture(atlas: PwAtlas, kind: FixtureKind): PwTile {
  const [W, H] = FIXTURE_SIZE[kind];
  return atlas.tile(`z2fix|${kind}`, W, H, (c, k) => {
    const white = k.ramp(0xd8d8cc, { light: 0.35, sat: 0.5 });
    const ink = k.ramp(0x22242a, { light: 0.4 });
    const red = k.ramp(0xc82020, { light: 0.45, sat: 1.05 });
    const plate = (r: number) => {
      c.rect(0, 0, W, H, r, 3);
      c.hline(0, 0, W, r, 4);
      c.vline(W - 1, 0, H, r, 2);
      c.hline(0, H - 1, W, r, 1);
    };
    switch (kind) {
      case 'switch':
        plate(white);
        c.rect(1, 2, 2, 2, white, 5);
        c.hline(1, 4, 2, white, 1);
        break;
      case 'outlet':
        plate(white);
        c.set(1, 2, ink, 1);
        c.set(2, 2, ink, 1);
        c.set(1, 4, ink, 1);
        c.set(2, 4, ink, 1);
        break;
      case 'alarm':
        plate(red);
        c.rect(1, 2, 4, 2, white, 4);
        c.rect(2, 5, 2, 2, white, 3);
        break;
      case 'sanitizer':
        plate(white);
        c.rect(1, 1, 4, 5, k.ramp(0x7ab8d8, { light: 0.45 }), 3);
        c.set(1, 1, k.ramp(0x7ab8d8, { light: 0.45 }), 5);
        c.rect(2, 7, 2, 2, ink, 2);
        break;
      case 'phone': {
        const beige = k.ramp(0xc8b890, { light: 0.4 });
        plate(beige);
        c.rect(1, 1, 6, 4, beige, 4);
        c.hline(1, 4, 6, beige, 2);
        for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) c.set(1 + i * 2, 6 + r * 2, ink, 2);
        // The cord hanging, receiver gone.
        c.vline(7, 5, 7, ink, 2);
        break;
      }
      case 'sharps': {
        const yel = k.ramp(0xe8c020, { light: 0.4 });
        c.rect(0, 2, W, H - 2, yel, 3);
        c.rect(0, 0, W, 3, red, 3);
        c.hline(2, 1, 4, ink, 1);
        c.poly([4, 4, 6, 7, 2, 7], ink, 2);
        break;
      }
      case 'gloves': {
        plate(white);
        c.rect(1, 1, 10, 5, k.ramp(0x4a7ac8, { light: 0.45 }), 3);
        c.rect(4, 2, 4, 2, ink, 1);
        c.set(5, 1, k.ramp(0xd8e0f0, { light: 0.3 }), 4);
        break;
      }
      case 'callbutton':
        plate(white);
        c.rect(1, 1, 2, 2, red, 4, G);
        break;
      case 'thermostat':
        plate(white);
        c.rect(1, 1, 3, 2, k.ramp(0x3a7a4a, { light: 0.5 }), 4, G);
        c.set(4, 3, ink, 2);
        break;
      case 'hoseReel': {
        // Fire hose cabinet: red box, glass door, coiled hose, a FIRE label.
        c.rect(0, 0, W, H, red, 3);
        c.hline(0, 0, W, red, 4);
        c.vline(W - 1, 0, H, red, 1);
        c.hline(0, H - 1, W, red, 1);
        const glass = k.ramp(0x1a2028, { light: 0.5 });
        c.rect(2, 6, W - 4, H - 8, glass, 2);
        c.ellipse(W / 2, 13, 6, 6, red, 3);
        c.ellipse(W / 2, 13, 3.5, 3.5, red, 1);
        c.ellipse(W / 2, 13, 1.5, 1.5, glass, 1);
        c.line(3, 7, 6, 10, k.ramp(0xe8f0f4, { light: 0.2 }), 4);
        drawText(c, 'FIRE', Math.round((W - textWidth('FIRE', FONT_3x5)) / 2), 1, FONT_3x5, k.ramp(0xf0f0e8, { light: 0.2 }), 4);
        break;
      }
    }
  });
}

/**
 * Bed-head unit (medical gas / power strip over a ward bed, 1.6 × 0.5 m → 52 × 16):
 * beige trunking, green O2 and yellow air outlets, a white vacuum port,
 * sockets, a nurse-call pendant, a reading lamp.
 */
export function bedHeadUnit(atlas: PwAtlas): PwTile {
  return atlas.tile('z2bedhead', 52, 16, (c, k) => {
    const t = k.ramp(0xc8c0a8, { light: 0.35, sat: 0.6 });
    const ink = k.ramp(0x222222, { light: 0.4 });
    const o2 = k.ramp(0x2a8a3a, { light: 0.45 });
    const air = k.ramp(0xe0c020, { light: 0.45 });
    const vac = k.ramp(0xe8e8e8, { light: 0.3 });
    const lamp = k.ramp(0xfff1d0, { light: 0.4 });
    c.rect(0, 0, 52, 16, t, 3);
    c.hline(0, 0, 52, t, 4);
    c.hline(0, 15, 52, t, 1);
    c.hline(0, 7, 52, t, 2);
    const port = (x: number, r: number) => {
      c.ellipse(x, 11, 2.2, 2.2, r, 3);
      c.set(x, 11, ink, 1);
      c.set(x - 1, 10, r, 5);
    };
    port(8, o2);
    port(14, air);
    port(20, vac);
    for (const x of [28, 34]) {
      c.rect(x, 9, 4, 5, vac, 3);
      c.set(x + 1, 11, ink, 1);
      c.set(x + 2, 11, ink, 1);
    }
    // Reading lamp (lit, GLOW) at the top right, call button.
    c.rect(40, 2, 10, 3, lamp, 4, G);
    c.hline(40, 2, 10, lamp, 5, G);
    c.rect(42, 10, 3, 3, k.ramp(0xc82020, { light: 0.4 }), 3);
  });
}

/** Painted steel pipe (wrap along u: laid round a cylinder): lit top, dark underside, a bracket and a label band. 32 × 16. */
export function pipeTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2pipe|${h6(hex)}`, 32, 16, (c, k) => {
    const p = k.ramp(hex, { light: 0.5, sat: 0.9 });
    const band = k.ramp(mixHex(hex, 0xf0f0e8, 0.7), { light: 0.3 });
    const rust = k.ramp(0x6a3a1c, { light: 0.4 });
    // v wraps round the pipe: a lit stripe, base, shadow.
    const prof = [3, 4, 5, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 2, 2, 3];
    for (let y = 0; y < 16; y++) c.rect(0, y, 32, 1, p, prof[y]);
    // Collar / bracket every metre, a label band.
    c.rect(0, 0, 2, 16, p, 1);
    c.rect(14, 0, 5, 16, band, 3);
    for (let y = 0; y < 16; y++) c.set(16, y, p, 1);
    // Rust bleeding from the collar.
    for (let i = 0; i < 6; i++) c.set(2 + (i % 3), 9 + (i >> 1), rust, 3);
  }, { wrap: true });
}


export type HospWindowKind = 'dark' | 'lit' | 'blinds' | 'broken' | 'curtain' | 'figure' | 'boarded';

/**
 * Exterior ward window (1.75 × 2.1 m → 56 × 68; cut out round the frame so the
 * brick shows): a concrete head and sill with a drip stain, an aluminium frame
 * with a transom, the reveal in shadow (top / left), and what is behind the
 * glass — a dark room catching the sky, a lit room (warm / cool) with blinds
 * or a curtain, a silhouette at the glass, a shattered pane, boards.
 */
export function hospitalWindow(atlas: PwAtlas, kind: HospWindowKind, lit: number, variant = 0): PwTile {
  return atlas.tile(`z2hwin|${kind}|${h6(lit)}|${variant}`, 56, 68, (c, k) => {
    const rng = k.rng;
    const conc = k.ramp(0x8a867c, { light: 0.4, sat: 0.6 });
    const alu = k.ramp(0x9aa0a4, { light: 0.5, sat: 0.4 });
    const night = k.ramp(0x1a2434, { light: 0.45, sat: 0.9 });
    const room = k.ramp(lit, { light: 0.55, sat: 0.9 });
    const dark = k.ramp(0x0c1018, { light: 0.4 });
    const W = 56;
    const gx = 4;
    const gy = 6;
    const gw = W - 8;
    const gh = 54;
    // Head (lintel) and sill: concrete with a lit top, the sill sticking out (shadow under it), drip stain below.
    c.rect(1, 0, W - 2, 5, conc, 3);
    c.hline(1, 0, W - 2, conc, 4);
    c.hline(1, 4, W - 2, conc, 1);
    c.rect(0, gy + gh, W, 4, conc, 3);
    c.hline(0, gy + gh, W, conc, 5);
    c.hline(0, gy + gh + 3, W, conc, 1);
    for (let x = 6; x < W - 6; x += 7) for (let j = 0; j < 3 + ((x * 7) % 4); j++) if (gy + gh + 4 + j < c.h) c.set(x, gy + gh + 4 + j, conc, 1);
    // Reveal: the jamb's side in shadow on the left, lit on the right (recess convention).
    c.rect(gx - 3, gy - 1, 3, gh + 1, conc, 1);
    c.rect(gx + gw, gy - 1, 3, gh + 1, conc, 4);
    // Glass content.
    const inside = (x: number, y: number) => x >= gx && x < gx + gw && y >= gy && y < gy + gh;
    for (let y = gy; y < gy + gh; y++) {
      for (let x = gx; x < gx + gw; x++) {
        if (kind === 'lit' || kind === 'blinds' || kind === 'curtain' || kind === 'figure') {
          // Lit room: ceiling glow at the top fading down in two dithered steps.
          const t = y < gy + 16 ? 4 : y < gy + 34 ? 3.5 : 3;
          c.set(x, y, room, t, G | (t % 1 ? PWF.DITHER : 0));
        } else {
          // Dark glass: the night sky reflected (lighter top band), a streak of a lamp.
          const t = y < gy + 10 ? 3 : y < gy + 24 ? 2.5 : 2;
          c.set(x, y, night, t, t % 1 ? PWF.DITHER : 0);
        }
      }
    }
    if (kind === 'blinds' || (kind === 'lit' && variant % 2)) {
      // Venetian blinds down to a third / half, a couple of slats twisted.
      const down = gy + (kind === 'blinds' ? 30 + variant * 6 : 16);
      for (let y = gy; y < down; y += 3) {
        c.hline(gx, y, gw, alu, 3);
        c.hline(gx, y + 1, gw, alu, 2);
        if (rng.chance(0.15)) c.hline(gx + rng.int(0, gw - 10), y + 2, 8, alu, 4);
      }
      c.vline(gx + 10, gy, down - gy, k.ramp(0xe8e4d0, { light: 0.3 }), 3);
    }
    if (kind === 'curtain') {
      const cur = k.ramp(variant ? 0x8aa0b8 : 0xc49a7a, { light: 0.45 });
      for (let x = gx; x < gx + 14; x++) for (let y = gy; y < gy + gh; y++) c.set(x, y, cur, [4, 3, 3, 2, 2, 3][x % 6]);
      for (let x = gx + gw - 10; x < gx + gw; x++) for (let y = gy; y < gy + gh; y++) c.set(x, y, cur, [3, 3, 2, 2, 3, 4][x % 6]);
    }
    if (kind === 'figure') {
      // A patient pressed against the glass (silhouette with hands up).
      const sil = k.ramp(0x10141a, { light: 0.3 });
      const cx = gx + 18 + variant * 6;
      c.ellipse(cx, gy + 18, 4, 5, sil, 1);
      c.rect(cx - 6, gy + 23, 12, 31, sil, 1);
      c.rect(cx - 10, gy + 10, 3, 14, sil, 1);
      c.rect(cx + 8, gy + 12, 3, 12, sil, 1);
      for (const hx of [cx - 11, cx + 7]) c.rect(hx, gy + 7, 5, 4, sil, 1);
    }
    if (kind === 'broken') {
      // Star crack: shards fallen out show the dark room; the edges catch light.
      const cx = gx + 14 + variant * 8;
      const cy = gy + 22;
      for (let y = gy; y < gy + gh; y++) for (let x = gx; x < gx + gw; x++) {
        const d = Math.hypot(x - cx, (y - cy) * 0.8);
        const a = Math.atan2(y - cy, x - cx);
        const ragged = 9 + Math.sin(a * 5 + variant) * 3 + Math.sin(a * 11) * 1.5;
        if (d < ragged) c.set(x, y, dark, 1);
        else if (d < ragged + 1) c.set(x, y, alu, 5);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.28 + 0.3;
        c.line(cx + Math.cos(a) * 11, cy + Math.sin(a) * 9, cx + Math.cos(a) * 30, cy + Math.sin(a) * 26, alu, 4);
      }
    }
    if (kind === 'boarded') {
      const wood = k.ramp(0x7a5a3a, { light: 0.45 });
      for (let y = gy; y < gy + gh; y++) for (let x = gx; x < gx + gw; x++) c.set(x, y, dark, 1);
      for (const [y0, tilt] of [[gy + 6, 3], [gy + 22, -2], [gy + 38, 4]]) {
        for (let x = gx - 2; x < gx + gw + 2; x++) {
          const yy = Math.round(y0 + ((x - gx) / gw) * tilt);
          c.rect(x, yy, 1, 8, wood, 3);
          c.set(x, yy, wood, 4);
          c.set(x, yy + 7, wood, 1);
        }
      }
    }
    // Frame: outer aluminium frame, a transom bar at a third, a central mullion; lit top-left edges.
    c.frame(gx, gy, gw, gh, alu, 3);
    c.hline(gx, gy, gw, alu, 4);
    c.vline(gx, gy, gh, alu, 4);
    c.hline(gx, gy + 18, gw, alu, 3);
    c.hline(gx, gy + 19, gw, alu, 1);
    c.vline(gx + (gw >> 1), gy + 19, gh - 19, alu, 3);
    c.vline(gx + (gw >> 1) + 1, gy + 19, gh - 19, alu, 1);
    // Glass glint (diagonal) on dark panes.
    if (kind === 'dark') for (let i = 0; i < 6; i++) c.set(gx + 4 + i, gy + 28 - i, night, 4);
    void inside;
  });
}

/** Lit red cross (2.6 m → 80 × 80, cut out): acrylic face glowing, a darker tube line inside, the frame's lit edge. */
export function redCross(atlas: PwAtlas): PwTile {
  return atlas.tile('z2cross', 80, 80, (c, k) => {
    const r = k.ramp(0xff2a2a, { light: 0.5, sat: 1.1 });
    const f = k.ramp(0x5a1010, { light: 0.4 });
    const inCross = (x: number, y: number) => (x >= 26 && x < 54 && y >= 0 && y < 80) || (y >= 26 && y < 54 && x >= 0 && x < 80);
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
      if (!inCross(x, y)) continue;
      const edge = !inCross(x - 2, y) || !inCross(x + 2, y) || !inCross(x, y - 2) || !inCross(x, y + 2);
      if (edge) c.set(x, y, f, !inCross(x, y - 2) || !inCross(x - 2, y) ? 3 : 1);
      else c.set(x, y, r, 4, G);
    }
    // Tubes behind the acrylic: hot bands along each arm.
    for (let y = 4; y < 76; y++) for (const x of [33, 46]) c.set(x, y, r, 5, G);
    for (let x = 4; x < 76; x++) for (const y of [33, 46]) c.set(x, y, r, 5, G);
    // A dead stretch of tube.
    for (let y = 58; y < 74; y++) c.set(46, y, r, 3, G);
  });
}

/**
 * Ward window seen from inside at night (1.8 × 1.2 m → 58 × 38, GLOW): rain
 * running down the glass over a moonlit sky and cloud, the city glow low
 * down, venetian blinds half drawn, a cord.
 */
export function nightWindow(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`z2nightwin|${variant}`, 58, 38, (c, k) => {
    const rng = k.rng;
    const sky = k.ramp(0x3a5080, { light: 0.5, sat: 0.9 });
    const cloud = k.ramp(0x6a7aa0, { light: 0.45 });
    const city = k.ramp(0xc89050, { light: 0.4 });
    const slat = k.ramp(0x8a908c, { light: 0.5, sat: 0.4 });
    const frame = k.ramp(0x6a706c, { light: 0.5 });
    for (let y = 0; y < 38; y++) for (let x = 0; x < 58; x++) c.set(x, y, sky, y < 12 ? 3 : y < 26 ? 2.5 : 2, G | (y >= 12 && y < 26 ? PWF.DITHER : 0));
    // Cloud bank lit from above.
    for (let x = 0; x < 58; x++) {
      const top = 14 + Math.round(Math.sin(x * 0.21 + variant) * 2 + Math.sin(x * 0.07) * 2);
      for (let y = top; y < top + 5; y++) c.set(x, y, cloud, y === top ? 4 : 3, G);
    }
    // City glow + far lights at the bottom.
    for (let y = 30; y < 38; y++) for (let x = 0; x < 58; x++) if (y > 33 || ((x * 7 + y) % 5 === 0 && y > 31)) c.set(x, y, city, y > 35 ? 2 : 4, G);
    // Rain on the glass: short lit streaks with a bead.
    for (let i = 0; i < 26; i++) {
      const x = rng.int(1, 56);
      const y0 = rng.int(0, 30);
      const len = rng.int(2, 6);
      for (let j = 0; j < len; j++) c.set(x, y0 + j, cloud, 4, G);
      c.set(x, y0 + len, sky, 5, G);
    }
    // Blinds: down to ~45 %, slats with shadow lines, one hanging askew.
    for (let y = 0; y < 17; y += 3) {
      const skew = y === 12 ? 2 : 0;
      for (let x = 0; x < 58; x++) {
        const yy = y + Math.round((x / 58) * skew);
        c.set(x, yy, slat, 4);
        c.set(x, yy + 1, slat, 2);
      }
    }
    c.vline(9, 0, 30, slat, 3);
    // Frame (lit) and a central mullion.
    c.frame(0, 0, 58, 38, frame, 3);
    c.vline(29, 17, 21, frame, 3);
  });
}

/** Fire extinguisher on its wall bracket with the red FIRE sign above (0.37 × 1.1 m → 12 × 36, cut out). */
export function extinguisherMod(atlas: PwAtlas): PwTile {
  return atlas.tile('z2ext', 12, 36, (c, k) => {
    const red = k.ramp(0xc81e1e, { light: 0.5, sat: 1.1 });
    const blk = k.ramp(0x222222, { light: 0.4 });
    const white = k.ramp(0xf0ece0, { light: 0.25 });
    // Sign (glowing red panel with FIRE).
    c.rect(0, 0, 12, 7, red, 3, G);
    drawText(c, 'EXT', 0, 1, FONT_3x5, white, 5, { flag: G });
    // Bottle: lathe-like shading (lit left), hose, black head, a label.
    for (let y = 14; y < 34; y++) {
      for (let x = 3; x < 9; x++) c.set(x, y, red, x === 3 ? 4 : x === 4 ? 5 : x >= 7 ? 2 : 3);
    }
    c.hline(4, 14, 4, red, 4);
    c.rect(4, 11, 4, 3, blk, 2);
    c.hline(4, 11, 4, blk, 4);
    c.line(8, 12, 10, 18, blk, 2);
    c.line(10, 18, 9, 24, blk, 2);
    c.rect(4, 20, 4, 5, white, 3);
    c.hline(4, 22, 4, red, 2);
    // Bracket strap.
    c.hline(2, 28, 8, blk, 3);
  });
}

/** Hospital bed head / foot board (1.0 m wide → 32 × 25 head, 32 × 14 foot): moulded beige panel, a recess, the foot one with a chart clipboard. */
export function bedBoard(atlas: PwAtlas, foot: boolean): PwTile {
  return atlas.tile(`z2bedboard|${foot ? 'f' : 'h'}`, 32, foot ? 14 : 25, (c, k) => {
    const p = k.ramp(0xb8beb8, { light: 0.45, sat: 0.6 });
    const H = c.h;
    c.rect(0, 0, 32, H, p, 3);
    c.hline(0, 0, 32, p, 5);
    c.hline(0, 1, 32, p, 4);
    c.hline(0, H - 1, 32, p, 1);
    c.frame(3, 3, 26, H - 6, p, 2);
    c.hline(4, H - 4, 24, p, 4);
    if (foot) {
      // Chart clipboard hung over the board.
      const board = k.ramp(0x8a6a40, { light: 0.45 });
      const paper = k.ramp(0xe0ded0, { light: 0.3 });
      c.rect(11, 1, 10, 12, board, 3);
      c.rect(12, 3, 8, 9, paper, 3);
      for (let y = 5; y < 11; y += 2) c.hline(13, y, 5 + (y % 3), k.ramp(0x2a3040, { light: 0.4 }), 2);
      c.rect(14, 0, 4, 2, k.ramp(0xa8b0b4, { light: 0.5 }), 4);
    } else {
      // Two call / light buttons and a scuffed corner.
      c.set(26, 5, k.ramp(0xc82020, { light: 0.4 }), 4, G);
      c.set(24, 5, k.ramp(0x3aff8a, { light: 0.4 }), 3, G);
      c.cluster(4, H - 5, 5, 0, -1);
    }
  });
}

/** Parapet coping (wrap along u, 64 × 16; laid 8 rows tall from v = 0: the top row lit, a shadow lip under it, joints, drips). */
export function copingTile(atlas: PwAtlas): PwTile {
  return atlas.tile('z2coping', 64, 16, (c, k) => {
    const s = k.ramp(0x7a766c, { light: 0.45, sat: 0.6 });
    for (let r = 0; r < 16; r++) {
      const y = r % 8;
      c.rect(0, r, 64, 1, s, y === 0 ? 5 : y === 1 ? 4 : y === 7 ? 1 : 3);
    }
    for (let x = 0; x < 64; x += 16) {
      c.vline(x, 0, 7, s, 2);
      c.vline(x, 8, 7, s, 2);
    }
    for (let i = 0; i < 6; i++) c.set(k.rng.int(0, 63), 14, s, 1);
  }, { wrap: true });
}

export type RoofKind = 'ac' | 'stack' | 'tank' | 'mast' | 'stairhouse' | 'dish';
const ROOF_SIZE: Record<RoofKind, [number, number]> = { ac: [48, 28], stack: [12, 40], tank: [40, 56], mast: [16, 96], stairhouse: [64, 48], dish: [28, 28] };

/** Rooftop clutter seen over the parapet (cut out): breaking the roofline against the storm. */
export function roofUnit(atlas: PwAtlas, kind: RoofKind): PwTile {
  const [W, H] = ROOF_SIZE[kind];
  return atlas.tile(`z2roof|${kind}`, W, H, (c, k) => {
    const m = k.ramp(0x6a6e70, { light: 0.45, sat: 0.4 });
    const d = k.ramp(0x3a3e42, { light: 0.4 });
    const red = k.ramp(0xff3020, { light: 0.4 });
    switch (kind) {
      case 'ac':
        c.rect(0, 4, W, H - 4, m, 3);
        c.hline(0, 4, W, m, 5);
        c.vline(W - 1, 4, H - 4, m, 1);
        for (let x = 3; x < 22; x += 2) c.vline(x, 8, H - 12, d, 2);
        c.ellipse(34, 15, 9, 9, d, 1);
        for (let a = 0; a < 6; a++) c.line(34, 15, 34 + Math.cos(a) * 8, 15 + Math.sin(a) * 8, m, 3);
        c.rect(2, 0, 10, 4, m, 2);
        break;
      case 'stack':
        c.rect(3, 6, 6, H - 6, m, 3);
        c.vline(3, 6, H - 6, m, 4);
        c.vline(8, 6, H - 6, m, 1);
        c.rect(0, 2, 12, 4, d, 3);
        c.hline(0, 2, 12, d, 4);
        for (let y = 10; y < H; y += 9) c.hline(3, y, 6, d, 2);
        break;
      case 'tank': {
        c.rect(4, 6, 32, 30, d, 3);
        c.vline(4, 6, 30, d, 4);
        for (let y = 10; y < 36; y += 6) c.hline(4, y, 32, d, 2);
        c.poly([2, 6, 20, 0, 38, 6], d, 3);
        for (const x of [7, 32]) c.vline(x, 36, H - 36, m, 3);
        c.line(7, 40, 32, 52, m, 2);
        c.line(32, 40, 7, 52, m, 2);
        break;
      }
      case 'mast':
        c.vline(7, 4, H - 4, m, 4);
        c.vline(8, 4, H - 4, m, 2);
        for (let y = 12; y < H; y += 10) c.line(4, y, 11, y + 6, m, 2);
        c.rect(5, 0, 6, 4, red, 4, G);
        c.set(7, 1, red, 5, G);
        break;
      case 'stairhouse':
        c.rect(0, 6, W, H - 6, m, 3);
        c.rect(0, 2, W, 4, d, 3);
        c.hline(0, 2, W, d, 4);
        c.rect(40, 18, 14, 30, d, 2);
        c.rect(42, 14, 8, 2, k.ramp(0xffd890, { light: 0.4 }), 4, G);
        c.rect(6, 14, 10, 8, d, 1);
        break;
      case 'dish':
        c.ellipse(14, 12, 12, 10, m, 3);
        c.ellipse(16, 13, 8, 7, m, 2);
        c.line(14, 12, 6, 4, d, 3);
        c.vline(14, 20, 8, d, 3);
        break;
    }
  });
}

/**
 * A ward / store-room door leaf (1.3 × 2.2 m → 42 × 70), painted once and
 * projected through every face of the classic door's boxes (slab, kick plate,
 * window, handle line up with it): stiles, a wired-glass vision panel, the
 * push plate and handle, a steel kick plate, a room plate, scuffs and a bloody
 * hand. Per colour.
 */
export function doorLeaf(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2leaf|${h6(hex)}`, 42, 70, (c, k) => {
    const rng = k.rng;
    const d = k.ramp(hex, { light: 0.45, sat: 0.9 });
    const steel = k.ramp(0x8d9696, { light: 0.55, sat: 0.4 });
    const glass = k.ramp(0x0d1414, { light: 0.45 });
    const plate = k.ramp(0xe8e4d0, { light: 0.25 });
    const blood = k.ramp(0x6a0c0c, { light: 0.45, sat: 1.1 });
    const W = 42;
    const H = 70;
    c.rect(0, 0, W, H, d, 3);
    // Leaf edges + a faint stile line, the top lit.
    c.hline(0, 0, W, d, 5);
    c.vline(0, 0, H, d, 4);
    c.vline(W - 1, 0, H, d, 1);
    c.vline(3, 2, H - 4, d, 2);
    c.vline(W - 4, 2, H - 4, d, 2);
    // Vision panel (classic: 0.28 × 0.5 m at 70 % height → centred), wired glass with a reflection.
    const vx = 21 - 5;
    const vy = H - Math.round(0.7 * H) - 8;
    c.rect(vx - 1, vy - 1, 11, 18, steel, 2);
    c.rect(vx, vy, 9, 16, glass, 2);
    for (let y = vy; y < vy + 16; y += 3) c.hline(vx, y, 9, glass, 1);
    for (let x = vx; x < vx + 9; x += 3) c.vline(x, vy, 16, glass, 1);
    c.line(vx + 1, vy + 10, vx + 6, vy + 2, glass, 4);
    // Room plate under the panel, handle (right), push plate.
    c.rect(17, H - Math.round(0.55 * H) - 2, 8, 3, plate, 3);
    c.rect(36, H - Math.round(0.48 * H) - 4, 2, 7, steel, 4);
    c.vline(37, H - Math.round(0.48 * H) - 4, 7, steel, 2);
    // Kick plate (0.3 m), scuffed.
    c.rect(1, H - 10, W - 2, 9, steel, 3);
    c.hline(1, H - 10, W - 2, steel, 4);
    for (let i = 0; i < 6; i++) {
      const x = rng.int(2, W - 6);
      c.lineShade(x, H - rng.int(3, 8), x + rng.int(2, 5), H - rng.int(3, 8), -1);
    }
    // Scuffs on the paint, a smeared hand by the edge.
    c.scatter(rng, 2, 10, W - 4, H - 22, 10, 0, -1, { shapes: 4 });
    for (let j = 0; j < 9; j++) for (let i = 0; i < 4; i++) if ((i + j) % 4 !== 3) c.set(32 + i, 26 + j, blood, j < 2 ? 4 : 3);
  });
}
