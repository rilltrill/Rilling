import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';

/**
 * ST. MERCY HOSPITAL prop sprites (Z2Billboards): small props as hand-pixelled
 * sprites in a three-quarter view, lit from the upper left like the cast —
 * a lit left rim, a shaded right side, one step of contact shadow at the
 * foot, a dark outline on the shadow side only (`outline`). The foot sits on
 * the bottom row. 32 texels a metre, like the world.
 */

const G = PWF.GLOW;

/** A vertical lit cylinder band (x0…x1, y0…y1): lit left third, base middle, shaded right edge. */
function cyl(c: PwCanvas, x0: number, y0: number, x1: number, y1: number, ramp: number, base = 3) {
  const w = x1 - x0;
  for (let x = x0; x < x1; x++) {
    const u = (x - x0 + 0.5) / w;
    const t = u < 0.18 ? base + 1 : u < 0.32 ? base + 2 : u > 0.82 ? base - 1 : base;
    c.rect(x, y0, 1, y1 - y0, ramp, Math.max(0, Math.min(5, t)));
  }
}

/** A wheel seen at an angle: tyre ring, hub, spokes. */
function wheel(c: PwCanvas, cx: number, cy: number, rx: number, ry: number, tyre: number, rim: number, spokes = 6) {
  c.ellipse(cx, cy, rx, ry, tyre, 1);
  c.ellipse(cx, cy, rx - 1.2, ry - 1.2, rim, 2);
  c.ellipse(cx, cy, rx - 2.2, ry - 2.2, tyre, 0);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    c.line(cx, cy, cx + Math.cos(a) * (rx - 2), cy + Math.sin(a) * (ry - 2), rim, i % 2 ? 3 : 4);
  }
  c.ellipse(cx, cy, 1.2, 1.2, rim, 4);
  // Lit upper-left arc of the tyre.
  for (let a = 3.6; a < 5.2; a += 0.15) c.set(Math.round(cx + Math.cos(a) * rx * 0.95), Math.round(cy + Math.sin(a) * ry * 0.95), tyre, 3);
}

function sprite(atlas: PwAtlas, key: string, w: number, h: number, paint: (c: PwCanvas, k: PwKit) => void): PwTile {
  return atlas.tile(`z2spr|${key}`, w, h, (c, k) => {
    paint(c, k);
    c.outline(0);
  });
}

/** Wheelchair, three-quarter view (0.75 × 0.95 m). */
export function wheelchairSprite(atlas: PwAtlas, tipped = false): PwTile {
  if (tipped) {
    return sprite(atlas, 'wheelchairTipped', 34, 22, (c, k) => {
      const steel = k.ramp(0xa8b0b4, { light: 0.55, sat: 0.4 });
      const tyre = k.ramp(0x1c1e1e, { light: 0.45 });
      const seat = k.ramp(0x24323a, { light: 0.45 });
      // On its side: the big wheel up like a disc, the seat sideways, a caster in the air.
      c.ellipse(16, 18, 15, 3, k.ramp(0x101010, { light: 0.2 }), 1);
      c.rect(6, 9, 14, 6, seat, 3);
      c.hline(6, 9, 14, seat, 4);
      c.rect(20, 4, 4, 12, seat, 2);
      c.line(4, 14, 26, 14, steel, 4);
      c.line(24, 3, 30, 3, steel, 4);
      wheel(c, 11, 12, 9, 6, tyre, steel, 6);
      wheel(c, 28, 8, 3, 3, tyre, steel, 3);
    });
  }
  return sprite(atlas, 'wheelchair', 26, 32, (c, k) => {
    const steel = k.ramp(0xa8b0b4, { light: 0.55, sat: 0.4 });
    const tyre = k.ramp(0x1c1e1e, { light: 0.45 });
    const seat = k.ramp(0x24323a, { light: 0.45 });
    // Contact shadow.
    c.ellipse(13, 31, 12, 1.5, k.ramp(0x101010, { light: 0.2 }), 1);
    // Back wheel (far), frame, seat, back rest, handles, near wheel, caster, footplate.
    wheel(c, 16, 19, 8, 10, tyre, steel, 6);
    c.rect(5, 15, 15, 4, seat, 3);
    c.hline(5, 15, 15, seat, 4);
    c.rect(15, 3, 5, 13, seat, 3);
    c.vline(15, 3, 13, seat, 4);
    c.line(19, 3, 21, 0, steel, 4);
    c.line(5, 19, 3, 28, steel, 3);
    c.hline(1, 28, 5, steel, 4);
    c.line(5, 13, 15, 13, steel, 4);
    wheel(c, 11, 21, 9, 10, tyre, steel, 8);
    c.ellipse(3, 30, 1.5, 1.5, tyre, 1);
  });
}

/** IV drip stand with a bag (0.4 × 2.0 m). `liquid` tints the bag. */
export function ivSprite(atlas: PwAtlas, red = false): PwTile {
  return sprite(atlas, `iv|${red ? 1 : 0}`, 14, 64, (c, k) => {
    const steel = k.ramp(0xb8c0c4, { light: 0.55, sat: 0.4 });
    const bag = k.ramp(0xd8e8d0, { light: 0.4, sat: 0.5 });
    const liquid = k.ramp(red ? 0x9a1a1a : 0xc8d8a0, { light: 0.45 });
    const tyre = k.ramp(0x1c1e1e, { light: 0.4 });
    // Pole, hook bar, five-leg base with casters.
    c.vline(7, 4, 58, steel, 4);
    c.vline(8, 4, 58, steel, 2);
    c.hline(2, 4, 11, steel, 4);
    c.set(2, 5, steel, 3);
    c.set(12, 5, steel, 3);
    c.line(1, 62, 7, 59, steel, 3);
    c.line(13, 62, 8, 59, steel, 3);
    c.line(4, 63, 7, 60, steel, 2);
    c.line(11, 63, 8, 60, steel, 2);
    for (const x of [1, 4, 11, 13]) c.set(x, 63, tyre, 1);
    // Bag: a soft rounded pouch with a meniscus and a highlight; the drip line.
    c.rect(9, 7, 4, 9, bag, 3);
    c.rect(9, 11, 4, 5, liquid, 3);
    c.vline(9, 7, 9, bag, 4);
    c.set(10, 8, bag, 5);
    c.vline(11, 16, 20, k.ramp(0xd0d8d0, { light: 0.3 }), 3);
  });
}

/** Pedal bin (0.4 × 0.62 m), upright or knocked over with rubbish spilled. */
export function binSprite(atlas: PwAtlas, tipped = false): PwTile {
  if (tipped) {
    return sprite(atlas, 'binTipped', 30, 14, (c, k) => {
      const g = k.ramp(0x3a5a4a, { light: 0.5 });
      const paper = k.ramp(0xd8d4c4, { light: 0.3 });
      const bag = k.ramp(0x22262a, { light: 0.45 });
      c.rect(2, 3, 16, 10, g, 3);
      c.hline(2, 3, 16, g, 4);
      c.hline(2, 12, 16, g, 1);
      c.ellipse(18, 8, 2.5, 5, k.ramp(0x0c0e0e, { light: 0.2 }), 0);
      c.ellipse(23, 11, 4, 2.4, bag, 3);
      c.rect(20, 11, 3, 2, paper, 4);
      c.rect(26, 12, 3, 2, paper, 3);
      c.set(28, 10, k.ramp(0x9a1a1a, { light: 0.4 }), 3);
    });
  }
  return sprite(atlas, 'bin', 15, 21, (c, k) => {
    const g = k.ramp(0x3a5a4a, { light: 0.5 });
    const lid = k.ramp(0x2a3a30, { light: 0.5 });
    cyl(c, 1, 3, 14, 20, g);
    c.rect(0, 1, 15, 3, lid, 3);
    c.hline(0, 1, 15, lid, 4);
    // Ribs + a dent + the bag lip.
    c.hline(1, 9, 13, g, 2);
    c.hline(1, 15, 13, g, 2);
    c.set(9, 12, g, 1);
    c.set(10, 12, g, 2);
    c.hline(2, 4, 4, k.ramp(0x1a1a1e, { light: 0.4 }), 2);
  });
}

/** Red crash cart with drawers and a defibrillator on top (0.75 × 1.3 m). */
export function crashCartSprite(atlas: PwAtlas): PwTile {
  return sprite(atlas, 'crashCart', 26, 42, (c, k) => {
    const red = k.ramp(0xb02828, { light: 0.5, sat: 1.05 });
    const steel = k.ramp(0xa8b0b4, { light: 0.5 });
    const yel = k.ramp(0xe0d040, { light: 0.45 });
    const blk = k.ramp(0x1c1e1e, { light: 0.4 });
    const scr = k.ramp(0x40ff80, { light: 0.5 });
    // Defib on top: yellow case, glowing trace, paddles.
    c.rect(4, 2, 14, 8, yel, 3);
    c.hline(4, 2, 14, yel, 4);
    c.rect(6, 4, 6, 3, blk, 1);
    c.hline(6, 5, 6, scr, 5, G);
    c.rect(14, 4, 3, 4, blk, 2);
    // Cabinet: lit left side panel, drawers with steel pulls, a lock bar.
    c.rect(1, 10, 22, 27, red, 3);
    c.rect(20, 10, 4, 27, red, 2);
    c.hline(1, 10, 23, red, 4);
    for (let d = 0; d < 5; d++) {
      const y = 12 + d * 5;
      c.hline(2, y + 4, 18, red, 1);
      c.hline(8, y + 2, 6, steel, 4);
    }
    c.vline(18, 12, 24, steel, 3);
    // Casters.
    for (const x of [3, 19]) c.ellipse(x, 39, 2, 2, blk, 2);
    c.ellipse(12, 41, 11, 1, k.ramp(0x101010, { light: 0.2 }), 1);
  });
}

/** Laundry hamper cart heaped with sheets, a bloody one on top (0.9 × 1.1 m). */
export function laundrySprite(atlas: PwAtlas): PwTile {
  return sprite(atlas, 'laundry', 30, 36, (c, k) => {
    const canvas = k.ramp(0x3a5a8a, { light: 0.45 });
    const sheet = k.ramp(0xc8d2cc, { light: 0.35, sat: 0.5 });
    const blood = k.ramp(0x7e0d0d, { light: 0.45, sat: 1.1 });
    const steel = k.ramp(0xa8b0b4, { light: 0.5 });
    const blk = k.ramp(0x1c1e1e, { light: 0.4 });
    // Sheets heaped over the rim.
    c.ellipse(15, 10, 13, 7, sheet, 3);
    c.ellipse(10, 7, 6, 4, sheet, 4);
    c.ellipse(20, 9, 5, 3, blood, 3);
    c.line(4, 12, 12, 8, sheet, 2);
    // Canvas bag on a frame, sagging sides.
    c.rect(2, 13, 26, 18, canvas, 3);
    c.vline(2, 13, 18, canvas, 4);
    c.rect(24, 13, 4, 18, canvas, 2);
    for (let x = 6; x < 24; x += 6) c.vline(x, 15, 14, canvas, 2);
    c.hline(1, 13, 28, steel, 4);
    c.hline(1, 31, 28, steel, 3);
    for (const x of [3, 26]) c.ellipse(x, 33, 2, 2, blk, 2);
    c.ellipse(15, 35, 14, 1, k.ramp(0x101010, { light: 0.2 }), 1);
  });
}

/** Two-shelf instrument trolley with a green drape and instruments (0.8 × 0.95 m). */
export function trolleySprite(atlas: PwAtlas): PwTile {
  return sprite(atlas, 'trolley', 28, 32, (c, k) => {
    const steel = k.ramp(0xb8c0c4, { light: 0.55, sat: 0.4 });
    const drape = k.ramp(0x3a7a6a, { light: 0.45 });
    const blood = k.ramp(0x7e0d0d, { light: 0.45 });
    const blk = k.ramp(0x1c1e1e, { light: 0.4 });
    // Top tray with drape, instruments glinting; lower shelf; legs; casters.
    c.rect(1, 4, 26, 3, steel, 3);
    c.hline(1, 4, 26, steel, 5);
    c.rect(3, 2, 20, 2, drape, 3);
    for (let i = 0; i < 6; i++) c.line(5 + i * 3, 1, 6 + i * 3, 3, steel, 5);
    c.rect(18, 1, 3, 2, blood, 3);
    c.rect(1, 20, 26, 2, steel, 3);
    c.hline(1, 20, 26, steel, 4);
    c.rect(4, 17, 8, 3, k.ramp(0xd8dcd8, { light: 0.3 }), 3);
    for (const x of [2, 25]) c.vline(x, 7, 22, steel, x === 2 ? 4 : 2);
    for (const x of [2, 25]) c.ellipse(x, 30, 1.6, 1.6, blk, 2);
  });
}

/** Terracotta planter pot with dark soil (the blades are FLORA billboards). 0.5 × 0.45 m. */
export function potSprite(atlas: PwAtlas): PwTile {
  return sprite(atlas, 'pot', 17, 15, (c, k) => {
    const pot = k.ramp(0x6a4a3a, { light: 0.5 });
    const soil = k.ramp(0x2a1e16, { light: 0.4 });
    for (let y = 2; y < 15; y++) {
      const inset = Math.floor((y - 2) * 0.18);
      cyl(c, 1 + inset, y, 16 - inset, y + 1, pot);
    }
    c.rect(0, 1, 17, 2, pot, 4);
    c.hline(1, 3, 15, soil, 2);
    c.hline(2, 8, 13, pot, 2);
  });
}

/** Traffic cone with reflective bands on a square base (0.45 × 0.72 m). */
export function coneSprite(atlas: PwAtlas): PwTile {
  return sprite(atlas, 'cone', 15, 24, (c, k) => {
    const o = k.ramp(0xe0601a, { light: 0.5, sat: 1.1 });
    const w = k.ramp(0xe8ecf0, { light: 0.3 });
    const blk = k.ramp(0x1a1a1a, { light: 0.4 });
    for (let y = 1; y < 21; y++) {
      const half = 1 + (y / 21) * 5.5;
      const band = (y > 6 && y < 9) || (y > 13 && y < 16);
      cyl(c, Math.round(7.5 - half), y, Math.round(7.5 + half), y + 1, band ? w : o);
    }
    c.rect(0, 21, 15, 3, blk, 2);
    c.hline(0, 21, 15, blk, 3);
  });
}

/** A body lying on the floor, side view (1.8 m): gown / scrubs colour, a pale limp arm, blood under it. */
export function corpseSprite(atlas: PwAtlas, shirt: number, variant = 0): PwTile {
  const hex = shirt.toString(16).padStart(6, '0');
  return sprite(atlas, `corpse|${hex}|${variant}`, 58, 14, (c, k) => {
    const cloth = k.ramp(shirt, { light: 0.45 });
    const skin = k.ramp(variant ? 0x9aa08a : 0x8a9a80, { light: 0.45 });
    const pants = k.ramp(0x3a3f4a, { light: 0.45 });
    const blood = k.ramp(0x4a0606, { light: 0.4, sat: 1.1 });
    const hair = k.ramp(0x2a2018, { light: 0.4 });
    // Blood pooled under the torso (flat, at the floor line).
    c.ellipse(26, 13, 18, 1.6, blood, 3);
    c.set(20, 12, blood, 5);
    // Legs (bent at the knee), torso, head turned, an arm flopped forward.
    c.rect(36, 8, 18, 4, pants, 3);
    c.hline(36, 8, 18, pants, 4);
    c.rect(52, 7, 5, 5, k.ramp(0x1a1a1a, { light: 0.4 }), 2);
    c.ellipse(26, 9, 11, 4, cloth, 3);
    c.hline(17, 6, 16, cloth, 4);
    c.ellipse(11, 9, 4, 3.5, skin, 3);
    c.ellipse(10, 7, 3.5, 2, hair, 2);
    c.set(9, 10, k.ramp(0x2a1010, { light: 0.3 }), 1);
    c.line(18, 11, 8, 13, skin, 3);
    c.line(18, 10, 9, 12, skin, 4);
    c.rect(6, 12, 3, 2, skin, 3);
    if (variant) {
      // A bite wound on the neck.
      c.rect(14, 7, 3, 3, k.ramp(0x7e0d0d, { light: 0.45 }), 3);
    }
  });
}

/** A zipped black body bag (1.9 m), lumpy, a toe tag. */
export function bodyBagSprite(atlas: PwAtlas): PwTile {
  return sprite(atlas, 'bodyBag', 62, 12, (c, k) => {
    const bag = k.ramp(0x22322c, { light: 0.5, sat: 0.8 });
    const zip = k.ramp(0x9a9a8a, { light: 0.45 });
    const tag = k.ramp(0xe8e4d0, { light: 0.3 });
    // Lumps: head, shoulders, hips, feet.
    c.ellipse(8, 7, 6, 4.5, bag, 3);
    c.ellipse(22, 6, 10, 5.5, bag, 3);
    c.ellipse(40, 7, 11, 4.5, bag, 3);
    c.ellipse(55, 6, 5, 5, bag, 3);
    c.rect(8, 7, 48, 4, bag, 3);
    // Lit top edge, the zipper line along the top, the tag.
    for (let x = 3; x < 59; x++) {
      let top = 0;
      while (top < 11 && !c.at(x, top)) top++;
      c.set(x, top, bag, 4);
      c.set(x, top + 2, zip, x % 2 ? 3 : 4);
    }
    c.rect(58, 9, 3, 2, tag, 4);
    c.ellipse(31, 11, 28, 1, k.ramp(0x101010, { light: 0.2 }), 1);
  });
}

/** Bedside cabinet with a drawer, a water jug and a cup on top (0.45 × 0.85 m). */
export function bedsideSprite(atlas: PwAtlas): PwTile {
  return sprite(atlas, 'bedside', 16, 28, (c, k) => {
    const p = k.ramp(0xa8b0aa, { light: 0.5, sat: 0.6 });
    const steel = k.ramp(0xb8c0c4, { light: 0.55 });
    const jug = k.ramp(0xc8d8e0, { light: 0.35 });
    c.rect(1, 4, 14, 24, p, 3);
    c.vline(1, 4, 24, p, 4);
    c.vline(14, 4, 24, p, 2);
    c.hline(1, 4, 14, p, 4);
    c.hline(2, 10, 12, p, 1);
    c.hline(6, 7, 4, steel, 4);
    c.hline(2, 18, 12, p, 2);
    c.rect(3, 0, 4, 4, jug, 3);
    c.vline(3, 0, 4, jug, 4);
    c.rect(10, 2, 3, 2, k.ramp(0xe8e4d8, { light: 0.3 }), 4);
  });
}

/** Four-drawer filing cabinet, the top drawer pulled out with files sticking up (0.5 × 1.3 m). */
export function filingSprite(atlas: PwAtlas): PwTile {
  return sprite(atlas, 'filing', 18, 44, (c, k) => {
    const p = k.ramp(0x7a807c, { light: 0.5, sat: 0.6 });
    const steel = k.ramp(0xb8c0c4, { light: 0.55 });
    const paper = k.ramp(0xd8d0a8, { light: 0.3 });
    c.rect(1, 3, 16, 41, p, 3);
    c.vline(1, 3, 41, p, 4);
    c.vline(16, 3, 41, p, 2);
    for (let d = 0; d < 4; d++) {
      const y = 4 + d * 10;
      c.hline(2, y + 9, 14, p, 1);
      c.rect(6, y + 3, 6, 2, steel, 4);
      c.rect(7, y + 1, 4, 1, paper, 3);
    }
    // Top drawer open: a lip and folders.
    c.rect(0, 1, 18, 4, p, 4);
    for (let x = 2; x < 16; x += 3) c.rect(x, 0, 2, 2, paper, 3 + (x % 2));
  });
}

/** Steel drum (hazard store): ochre paint, rolling hoops, a hazard diamond, rust runs (0.6 × 0.9 m). */
export function drumSprite(atlas: PwAtlas): PwTile {
  return sprite(atlas, 'drum', 20, 30, (c, k) => {
    const d = k.ramp(0x8a6a1a, { light: 0.5, sat: 1 });
    const rust = k.ramp(0x6a3a1c, { light: 0.4 });
    const blk = k.ramp(0x1a1a1a, { light: 0.4 });
    cyl(c, 1, 2, 19, 30, d);
    c.rect(1, 0, 18, 3, d, 4);
    c.hline(2, 1, 16, d, 2);
    for (const y of [11, 21]) {
      c.hline(1, y, 18, d, 1);
      c.hline(1, y + 1, 18, d, 4);
    }
    c.poly([10, 13, 14, 16, 10, 19, 6, 16], k.ramp(0xe8c020, { light: 0.4 }), 3);
    c.poly([10, 14, 13, 16, 10, 18, 7, 16], blk, 2);
    for (let i = 0; i < 3; i++) for (let j = 3; j < 8 + i * 3; j++) c.set(4 + i * 5, j, rust, 3);
  });
}
