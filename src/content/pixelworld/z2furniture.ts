import type { PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { darken, hash2 } from './surfaces';

/**
 * ST. MERCY HOSPITAL furniture parts for PIXEL WORLD: the painted pieces that
 * replace the blockiest bits of the bigger props (which keep their steel
 * frames) — waiting-room chair seats and cut-out back rests, sheets draped
 * over gurneys and autopsy tables (with the bodies under them modelled as
 * low draped mounds by z2/pixel.ts), hanging hems, a dead arm, surgical
 * drapes, the reception counters' fronts. 32 texels a metre; light from the
 * upper left like the rest of the stage.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const BLOOD = 0x6a0c0c;
const BLOOD_DARK = 0x3a0606;
const wrap = (v: number, n: number) => ((v % n) + n) % n;

function blood(k: PwKit) {
  return { fresh: k.ramp(BLOOD, { light: 0.45, sat: 1.15 }), old: k.ramp(BLOOD_DARK, { light: 0.4, sat: 1.1 }) };
}

/** Wobbly blob mask (true inside). */
function blob(x: number, y: number, cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.3): boolean {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const d2 = dx * dx + dy * dy;
  if (d2 < (1 - wob) * (1 - wob)) return true;
  if (d2 > (1 + wob) * (1 + wob)) return false;
  const a = Math.atan2(dy, dx);
  const r = 1 + wob * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 + seed * 2.1) * 0.3 + Math.sin(a * 9 + seed * 0.7) * 0.2);
  return d2 < r * r;
}

/** A soak: blood wicked into cloth (dark core, red body, a pale pink fringe of clusters). */
function soak(c: PwCanvas, k: PwKit, cx: number, cy: number, rx: number, ry: number, seed: number, fringe: number) {
  const { fresh, old } = blood(k);
  for (let y = Math.floor(cy - ry * 1.4); y <= cy + ry * 1.4; y++) {
    for (let x = Math.floor(cx - rx * 1.4); x <= cx + rx * 1.4; x++) {
      if (!c.inside(x, y)) continue;
      if (blob(x, y, cx, cy, rx, ry, seed, 0.35)) {
        const core = blob(x, y, cx - 1, cy - 1, rx * 0.5, ry * 0.5, seed + 1, 0.3);
        c.set(x, y, core ? old : fresh, core ? 2 : 3);
      } else if (fringe && blob(x, y, cx, cy, rx + 2, ry + 2, seed, 0.4) && hash2(x >> 1, y >> 1, seed | 0) < 0.55) {
        c.tint(x, y, fringe, -0.5);
      }
    }
  }
}

// ─── Waiting-room chairs ─────────────────────────────────────────────────────

/**
 * Upholstered back rest, front (16 × 15 → 0.5 × 0.48 m): rounded shoulders cut
 * out, piping round the edge, a stitched lumbar band, the cushion lit on its
 * upper left; variants: worn shiny patch, a split with the yellow foam
 * showing, a smeared hand.
 */
export function chairBack(atlas: PwAtlas, hex: number, variant = 0): PwTile {
  return atlas.tile(`z2chairBack|${h6(hex)}|${variant}`, 16, 15, (c, k) => {
    const u = k.ramp(hex, { light: 0.42, sat: 0.9 });
    const foam = k.ramp(0xc8a850, { light: 0.4, sat: 0.8 });
    const { fresh } = blood(k);
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 16; x++) {
        // Rounded top corners (2 px), softened bottom corners.
        if ((y === 0 && (x < 2 || x > 13)) || (y === 1 && (x < 1 || x > 14)) || (y === 14 && (x === 0 || x === 15))) continue;
        const edge = x === 0 || x === 15 || y === 0 || y === 14 || (y === 1 && (x === 1 || x === 14));
        let t = edge ? 2 : 3;
        // Cushion swell: upper-left lit, the lower right in shadow.
        if (!edge && x < 6 && y < 6 && x + y < 8) t = 4;
        if (!edge && (x > 12 || y > 11)) t = 2;
        c.set(x, y, u, t);
      }
    }
    // Piping highlight along the top, a stitched lumbar seam.
    for (let x = 2; x < 14; x++) c.set(x, 1, u, 4);
    for (let x = 2; x < 14; x++) if (x % 2 === 0) c.set(x, 9, u, 2);
    if (variant === 1) {
      // Split vinyl, foam pushing out.
      c.line(5, 4, 10, 7, foam, 4);
      c.line(5, 5, 10, 8, foam, 3);
      c.line(4, 4, 9, 7, u, 1);
    } else if (variant === 2) {
      // A smeared hand print drawn down the cushion.
      for (let j = 0; j < 7; j++) for (let i = 0; i < 4; i++) if ((i + j) % 3 !== 2) c.set(9 + i, 3 + j, fresh, j < 3 ? 3 : 2);
    } else {
      // Shiny worn patch where heads rested.
      c.set(7, 3, u, 5);
      c.set(8, 3, u, 4);
      c.set(6, 4, u, 4);
    }
  });
}

/** Back rest from behind: a moulded grey shell, two screws, scuffs (16 × 15, same cut-out). */
export function chairShell(atlas: PwAtlas): PwTile {
  return atlas.tile('z2chairShell', 16, 15, (c, k) => {
    const s = k.ramp(0x4a5054, { light: 0.4, sat: 0.5 });
    const steel = k.ramp(0xa8b0b4, { light: 0.5, sat: 0.4 });
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 16; x++) {
        if ((y === 0 && (x < 2 || x > 13)) || (y === 1 && (x < 1 || x > 14)) || (y === 14 && (x === 0 || x === 15))) continue;
        const edge = x === 0 || x === 15 || y === 0 || y === 14;
        c.set(x, y, s, edge ? 2 : x < 4 ? 4 : 3);
      }
    }
    for (const [x, y] of [[3, 3], [12, 3], [3, 11], [12, 11]]) c.set(x, y, steel, 4);
    c.lineShade(5, 7, 9, 8, -1);
    c.lineShade(10, 12, 13, 12, -1);
  });
}

/**
 * Seat cushion from above (16 × 15 → 0.5 × 0.46 m, the front edge at the
 * bottom): rolled front lip lit, a sat-in hollow, piping; variants: torn
 * corner, a dried stain.
 */
export function chairSeat(atlas: PwAtlas, hex: number, variant = 0): PwTile {
  return atlas.tile(`z2chairSeat|${h6(hex)}|${variant}`, 16, 15, (c, k) => {
    const u = k.ramp(hex, { light: 0.42, sat: 0.9 });
    const foam = k.ramp(0xc8a850, { light: 0.4, sat: 0.8 });
    const { old } = blood(k);
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 16; x++) {
        if ((y === 14 || y === 0) && (x === 0 || x === 15)) continue;
        const edge = x === 0 || x === 15 || y === 0;
        let t = edge ? 2 : 3;
        if (y >= 12) t = y === 12 ? 4 : 3; // rolled front lip
        // The sat-in hollow: a darker oval with a ragged rim.
        if (!edge && y > 4 && y < 10 && x > 4 && x < 11 && (y > 5 && y < 9 ? true : hash2(x, y, 4) < 0.6)) t = 2;
        c.set(x, y, u, t);
      }
    }
    if (variant === 1) {
      for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) c.set(12 + j, 1 + i - j, foam, 3 + (j & 1));
    } else if (variant === 2) {
      for (let y = 4; y < 11; y++) for (let x = 4; x < 12; x++) if (blob(x, y, 8, 7, 3.5, 2.6, 1.3)) c.set(x, y, old, 2);
    }
  });
}

/** Seat / back edge strip (16 × 2): piping lit on top. Stretched along a cushion's sides. */
export function chairEdge(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2chairEdge|${h6(hex)}`, 16, 2, (c, k) => {
    const u = k.ramp(hex, { light: 0.42, sat: 0.9 });
    for (let x = 0; x < 16; x++) {
      c.set(x, 0, u, 4);
      c.set(x, 1, u, 2);
    }
  });
}

// ─── Sheets, bodies, drapes ──────────────────────────────────────────────────

/**
 * Draped sheet (wrap, 64 × 64): long soft folds running the length of the
 * bed (lit crest, shadowed trough), crumple clusters; `bloody`: a couple of
 * soaks wicking through, so a mound under it reads as what it is.
 */
export function sheetTile(atlas: PwAtlas, hex: number, bloody = false): PwTile {
  return atlas.tile(`z2sheet|${h6(hex)}|${bloody ? 1 : 0}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const r = k.ramp(hex, { light: 0.42, sat: 0.85 });
    c.rect(0, 0, 64, 64, r, 3);
    // Folds along v (the sheet's length): a lit crest beside a shadowed trough, wandering a little.
    for (let i = 0; i < 7; i++) {
      let x = rng.int(0, 63);
      const y0 = rng.int(0, 63);
      const len = rng.int(14, 34);
      for (let j = 0; j < len; j++) {
        if (j % 7 === 3) x += rng.chance(0.5) ? 1 : -1;
        const y = wrap(y0 + j, 64);
        c.shift(wrap(x, 64), y, 1);
        c.shift(wrap(x + 1, 64), y, -1);
      }
    }
    // Crumples: short crossing creases.
    for (let i = 0; i < 6; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      for (let j = 0; j < 5; j++) {
        c.shift(wrap(x + j, 64), wrap(y + (j >> 1), 64), 1);
        c.shift(wrap(x + j, 64), wrap(y + (j >> 1) + 1, 64), -1);
      }
    }
    if (bloody) {
      const pink = k.ramp(0xb06a6a, { light: 0.4, sat: 0.8 });
      soak(c, k, 20, 22, 7, 9, 1.7, pink);
      soak(c, k, 48, 50, 4, 5, 3.1, pink);
    }
  }, { wrap: true });
}

/**
 * Sheet hem hanging over a bed's side (wrap along u, 64 × 16 → 2 × 0.5 m, the
 * hem at the bottom of the used height): vertical folds, the hem's edge cut
 * out in soft scallops so the side stops being a box.
 */
export function hemTile(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2hem|${h6(hex)}`, 64, 16, (c, k) => {
    const r = k.ramp(hex, { light: 0.42, sat: 0.85 });
    for (let x = 0; x < 64; x++) {
      // Hem line: 6…9 texels down from the top with a slow wave and fold dips.
      const fold = (x % 9) / 9;
      const depth = 7 + Math.round(1.6 * Math.sin((x / 64) * Math.PI * 4) + (fold < 0.3 ? 1 : 0));
      for (let y = 0; y < depth && y < 16; y++) {
        const t = fold < 0.3 ? 4 : fold > 0.75 ? 2 : 3;
        c.set(x, y, r, y === depth - 1 ? Math.max(1, t - 1) : y === 0 ? 4 : t);
      }
    }
  }, { wrap: true });
}

/** Grey arm hanging from under a sheet (sprite, 6 × 14): sleeve-less, bruised, the fingers curled. */
export function deadArmSprite(atlas: PwAtlas): PwTile {
  return atlas.tile('z2deadArm', 6, 14, (c, k) => {
    const s = k.ramp(0x8a9488, { light: 0.4, sat: 0.7 });
    const bruise = k.ramp(0x4a4a6a, { light: 0.4 });
    const { fresh } = blood(k);
    for (let y = 0; y < 10; y++) {
      c.set(2, y, s, 4);
      c.set(3, y, s, 3);
      if (y > 3) c.set(1, y, s, 3);
    }
    c.set(3, 4, bruise, 2);
    c.set(2, 5, bruise, 2);
    c.set(3, 7, fresh, 3);
    // Hand: palm, curled fingers.
    c.rect(1, 10, 4, 2, s, 3);
    c.hline(1, 10, 2, s, 4);
    for (const x of [1, 2, 3, 4]) c.set(x, 12, s, x === 1 ? 3 : 2);
    c.set(2, 13, s, 2);
    c.set(4, 13, s, 2);
    c.outline(0);
  });
}

/** Toe tag (6 × 4, a module laid on the sheet at the feet). */
export function toeTag(atlas: PwAtlas): PwTile {
  return atlas.tile('z2toeTag', 6, 4, (c, k) => {
    const p = k.ramp(0xe0d8c0, { light: 0.3 });
    const ink = k.ramp(0x2a2a2a, { light: 0.3 });
    c.rect(0, 0, 6, 4, p, 3);
    c.hline(1, 1, 3, ink, 2);
    c.hline(1, 2, 4, ink, 2);
    c.set(5, 0, p, 1);
  });
}

/**
 * Open body: the Y-cut exposed through a gap in the sheet (16 × 16 module,
 * cut-out ragged edge): wet red cavity, ribs' pale arcs, a pool spilling.
 */
export function openCavity(atlas: PwAtlas): PwTile {
  return atlas.tile('z2cavity', 16, 16, (c, k) => {
    const { fresh, old } = blood(k);
    const bone = k.ramp(0xd8ccb0, { light: 0.35 });
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (!blob(x, y, 8, 8, 6.5, 7, 2.2, 0.25)) continue;
        const core = blob(x, y, 8, 8, 3.5, 4.5, 3.3, 0.3);
        c.set(x, y, core ? old : fresh, core ? 1 : 3);
      }
    }
    for (let i = 0; i < 3; i++) {
      const y = 4 + i * 3;
      c.hline(4, y, 3, bone, 4 - (i & 1));
      c.hline(10, y, 3, bone, 3);
    }
    c.set(6, 6, fresh, 5);
    c.set(7, 6, fresh, 4);
  });
}

/**
 * Autopsy table top (stainless, 28 × 64 → 0.88 × 2 m): drain holes in rows,
 * the gutter round the edge, the drain at the foot, scratches, old blood
 * dried into the channels.
 */
export function autopsyTop(atlas: PwAtlas): PwTile {
  return atlas.tile('z2autopsyTop', 28, 64, (c, k) => {
    const rng = k.rng;
    const st = k.ramp(0x9aa4a8, { light: 0.55, sat: 0.4 });
    const { old } = blood(k);
    c.rect(0, 0, 28, 64, st, 3);
    // Gutter: a darker channel inside the rim, lit on its far lip.
    c.frame(1, 1, 26, 62, st, 2);
    c.frame(2, 2, 24, 60, st, 4);
    // Perforated work surface: holes in a grid.
    for (let y = 6; y < 52; y += 3) for (let x = 5; x < 24; x += 3) c.set(x, y, st, 1);
    // Drain at the foot.
    c.ellipse(14, 58, 2, 1.5, st, 1);
    c.set(13, 57, st, 4);
    // Scratches, smears of old blood in the gutter and round the drain.
    for (let i = 0; i < 10; i++) {
      const x = rng.int(4, 22);
      const y = rng.int(4, 56);
      c.lineShade(x, y, x + rng.int(-3, 3), y + rng.int(2, 6), rng.chance(0.5) ? 1 : -1);
    }
    for (let y = 2; y < 62; y++) if (hash2(1, y >> 2, 9) < 0.35) c.set(1, y, old, 2);
    for (let y = 2; y < 62; y++) if (hash2(26, y >> 2, 11) < 0.25) c.set(26, y, old, 2);
    for (let y = 54; y < 62; y++) for (let x = 9; x < 19; x++) if (blob(x, y, 14, 58, 4.5, 3, 0.9) && !(c.toneAt(x, y) < 1.5)) c.set(x, y, old, 2);
  });
}

/**
 * Surgical drape over the OR table (24 × 64 → 0.72 × 2 m): green cloth with
 * folds, the fenestration (the square opening) half soaked, blood run to the
 * foot, a dropped swab.
 */
export function drapeTop(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2drape|${h6(hex)}`, 24, 64, (c, k) => {
    const rng = k.rng;
    const r = k.ramp(hex, { light: 0.42, sat: 0.85 });
    const pink = k.ramp(darken(0xb06a6a, 0.9), { light: 0.4, sat: 0.8 });
    const gauze = k.ramp(0xe8e4dc, { light: 0.3 });
    c.rect(0, 0, 24, 64, r, 3);
    for (let i = 0; i < 6; i++) {
      const x = rng.int(1, 22);
      for (let y = rng.int(0, 20); y < 64; y += 1 + (y & 1)) {
        c.shift(x, y, 1);
        c.shift(x + 1, y, -1);
      }
    }
    // Fenestration (opening) frame: the adhesive edge lit, inside soaked.
    c.frame(7, 24, 10, 12, r, 4);
    soak(c, k, 12, 30, 6, 7, 2.6, pink);
    soak(c, k, 9, 48, 3.5, 6, 4.4, pink);
    // Run to the foot.
    for (let y = 36; y < 60; y++) if (hash2(0, y, 3) < 0.8) c.set(12 + Math.round(Math.sin(y * 0.4)), y, blood(k).fresh, 2);
    // Dropped gauze swab.
    c.rect(17, 12, 4, 3, gauze, 4);
    c.set(18, 13, blood(k).fresh, 3);
  });
}

// ─── Reception counter ───────────────────────────────────────────────────────

/**
 * Reception / nurses' counter front (wrap along u, 128 × 48 → 4 × 1.5 m, the
 * used height 1.1 m from v = 0): laminate panels with reveals every metre,
 * a vinyl kick cove, the aluminium edge trim under the top, cart scuffs low
 * down, kicked dents, a TAKE A NUMBER sticker, chipped corners.
 */
export function counterFront(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(`z2counter|${h6(hex)}`, 128, 48, (c, k) => {
    const rng = k.rng;
    const p = k.ramp(hex, { light: 0.45, sat: 0.85 });
    const kick = k.ramp(0x2a2e2e, { light: 0.4 });
    const al = k.ramp(0xb8bcb8, { light: 0.5, sat: 0.3 });
    const stick = k.ramp(0xd8c040, { light: 0.35, sat: 0.9 });
    const ink = k.ramp(0x202020, { light: 0.3 });
    const base = k.ramp(0xb9b3a2, { light: 0.4, sat: 0.6 });
    const H = 48;
    const row = (v: number) => H - 1 - v; // v = texels from the floor
    c.rect(0, 0, 128, H, p, 3);
    for (let x = 0; x < 128; x++) {
      for (let v = 0; v < 3; v++) c.set(x, row(v), kick, v === 2 ? 3 : 2);
      // Edge trim under the top (35 texels = 1.1 m) and the top's nosing above it.
      c.set(x, row(33), al, 4);
      c.set(x, row(34), al, 3);
      for (let v = 35; v < H; v++) c.set(x, row(v), base, v === 35 ? 4 : 3);
    }
    // Panel reveals every 32 texels (1 m), lit right lip, a lit upper-left panel bevel.
    for (let x = 0; x < 128; x += 32) {
      for (let v = 3; v < 33; v++) {
        c.set(x, row(v), p, 1);
        c.set(x + 1, row(v), p, 4);
      }
      for (let i = 2; i < 31; i++) c.set(x + i, row(32), p, 4);
    }
    // Laminate grain: long faint horizontal streaks.
    for (let i = 0; i < 18; i++) {
      const x = rng.int(0, 127);
      const v = rng.int(5, 31);
      const len = rng.int(6, 20);
      for (let j = 0; j < len; j++) if (c.toneAt(wrap(x + j, 128), row(v)) === 3) c.shift(wrap(x + j, 128), row(v), j % 5 === 0 ? 0 : -0.6);
    }
    // Cart scuffs low down (pale and dark streaks), kick marks.
    for (let i = 0; i < 14; i++) {
      const x = rng.int(0, 120);
      const v = rng.int(3, 10);
      c.lineShade(x, row(v), x + rng.int(4, 10), row(v + rng.int(-1, 1)), rng.chance(0.6) ? -1 : 1);
    }
    for (let i = 0; i < 4; i++) c.cluster(rng.int(4, 120), row(rng.int(4, 9)), rng.int(0, 9), 0, -1);
    // Chipped laminate at the reveals, showing the dark board.
    for (let x = 0; x < 128; x += 32) for (let v = 4; v < 30; v += 7) if (hash2(x, v, 21) < 0.35) c.set(wrap(x + 2, 128), row(v), kick, 2);
    // Sticker: a yellow TAKE A NUMBER label (unreadable at this size: lines of ink).
    c.rect(44, row(26), 9, 5, stick, 3);
    c.hline(45, row(25), 7, ink, 2);
    c.hline(45, row(23), 5, ink, 2);
    c.set(52, row(26), stick, 1);
    // A bullet hole and a dent with radial cracks in the laminate.
    c.set(90, row(18), ink, 0);
    c.set(91, row(18), p, 1);
    c.set(89, row(19), p, 4);
    for (const [dx, dy] of [[2, 1], [-2, 1], [1, -2], [-1, -2]]) c.lineShade(90, row(18), 90 + dx, row(18) - dy, -1);
    c.ellipseShade(16, row(12), 3, 2, (d) => (d < 0.5 ? -1 : 0));
  }, { wrap: true });
}

// ─── OR anaesthesia machine ──────────────────────────────────────────────────

/**
 * Anaesthesia machine front (22 × 38 → 0.7 × 1.2 m, laid on the cabinet's
 * front): flowmeter bank (glass tubes, coloured floats), two pressure dials, a
 * yellow vaporiser, the bellows window, the work shelf, three drawers, a
 * bloody hand smear and scuffs.
 */
export function anesthesiaFront(atlas: PwAtlas): PwTile {
  return atlas.tile('z2anesthesia', 22, 38, (c, k) => {
    const rng = k.rng;
    const e = k.ramp(0xc8ccc4, { light: 0.45, sat: 0.5 });
    const dark = k.ramp(0x2a2e30, { light: 0.4 });
    const glass = k.ramp(0x6a8a90, { light: 0.4, sat: 0.6 });
    const steel = k.ramp(0xa8b0b4, { light: 0.5, sat: 0.4 });
    const fl = [k.ramp(0x30a050, { light: 0.4 }), k.ramp(0xe8e8e0, { light: 0.3 }), k.ramp(0x2a6ad0, { light: 0.4 })];
    const yel = k.ramp(0xd8b030, { light: 0.4, sat: 0.9 });
    const { fresh } = blood(k);
    c.rect(0, 0, 22, 38, e, 3);
    c.vline(0, 0, 38, e, 4);
    c.vline(21, 0, 38, e, 2);
    c.hline(0, 0, 22, e, 4);
    // Flowmeter bank (top left): three tubes in a dark frame, floats at different heights.
    c.rect(2, 2, 9, 11, dark, 2);
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 3;
      c.vline(x, 3, 9, glass, 3);
      c.vline(x + 1, 3, 9, glass, 2);
      const fy = 4 + rng.int(0, 6);
      c.set(x, fy, fl[i], 4);
      c.set(x + 1, fy, fl[i], 3);
    }
    // Dials (top right).
    for (const [cx, cy] of [[15, 4], [19, 4]]) {
      c.ellipse(cx, cy, 1.8, 1.8, steel, 4);
      c.ellipse(cx, cy, 1.1, 1.1, e, 4);
      c.set(cx, cy, dark, 1);
      c.set(cx + 1, cy - 1, dark, 1);
    }
    // Vaporiser.
    c.rect(14, 8, 5, 5, yel, 3);
    c.hline(14, 8, 5, yel, 4);
    c.vline(18, 8, 5, yel, 2);
    // Bellows window (below), the work shelf.
    c.rect(3, 15, 8, 6, glass, 2);
    c.hline(3, 15, 8, glass, 4);
    for (let y = 16; y < 21; y += 2) c.hline(4, y, 6, glass, 3);
    c.rect(0, 22, 22, 2, steel, 3);
    c.hline(0, 22, 22, steel, 4);
    // Drawers with handles.
    for (let i = 0; i < 3; i++) {
      const y = 25 + i * 4;
      c.hline(1, y + 3, 20, e, 1);
      c.hline(8, y + 1, 6, steel, 4);
    }
    // Wear: scuffs, a hand dragged down the side.
    c.scatter(rng, 1, 1, 20, 36, 8, 0, -1, { shapes: 4 });
    for (let j = 0; j < 8; j++) for (let i = 0; i < 3; i++) if ((i + j) % 3 !== 1) c.set(17 + i, 14 + j, fresh, j < 3 ? 3 : 2);
  });
}
