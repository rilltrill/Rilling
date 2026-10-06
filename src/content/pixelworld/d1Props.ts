import { bayer, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD } from './font';
import { crack, darken, hash2, smooth, tuft } from './surfaces';
import { D1_EMBLEM, d1Emblem } from './d1Tiles';

/**
 * JUNGLE RUN (d1) painted props for ART: PIXEL WORLD: the electric fence (a
 * galvanised post, the wire spans as cut-out modules, the DANGER sign), the
 * park's tour car (body / cabin / front / back / underside modules), ranger
 * crates, arrow signposts, the ROAD CLOSED barricade, the ticket kiosk, a
 * thatch roof, a moss band, and the jungle road itself.
 */

const h6 = (n: number) => n.toString(16).padStart(6, '0');
const wrap = (v: number, n: number) => ((v % n) + n) % n;

// ─── Electric fence ─────────────────────────────────────────────────────────

/** Galvanised steel (fence posts): zinc spangle, vertical drawing lines, rust runs from the bolt holes. 32 × 64 wrap. */
export function d1GalvTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d1galv|${h6(o.hex)}`, 32, 64, (c, k) => {
    const rng = k.rng;
    const g = k.ramp(o.hex, { light: 0.5, sat: 0.6 });
    const rust = k.ramp(0x8a4a22, { light: 0.42 });
    c.rect(0, 0, 32, 64, g, (x, y) => (smooth(x, y, 32, 64, 4, 9) < 0.3 ? 2 : smooth(x, y, 32, 64, 4, 9) > 0.75 ? 4 : 3));
    // Drawing lines (vertical, 1 texel, faint).
    for (let x = 3; x < 32; x += 7) for (let y = 0; y < 64; y++) if (hash2(x, y >> 3, 3) > 0.3) c.shift(x, y, -0.6);
    // Bolt holes with a rust run under each.
    for (const y of [10, 42]) {
      for (const x of [8, 24]) {
        c.set(x, y, g, 0.5);
        c.set(x + 1, y, g, 1);
        c.set(x, y - 1, g, 4.5);
        const len = rng.int(6, 16);
        for (let j = 1; j < len; j++) if (bayer(x, y + j) > j / len - 0.15) c.tint(x, Math.min(63, y + j), rust, -0.4);
      }
    }
    c.scatter(rng, 0, 0, 32, 64, 14, 0, 1, { shapes: 2 });
    c.scatter(rng, 0, 0, 32, 64, 10, 0, -1, { shapes: 3 });
  }, { wrap: true });
}

/**
 * One span of electric fence wire (module, cut out between the wires): five
 * live wires sagging post to post (one texel each: painted at 16 texels a
 * metre, a texel ≈ the 5 cm wire), a glint every so often; variant 1 has vines
 * twining along the low wires, variant 2 a cut wire curling down (the old
 * breach). 80 × 72 (5 × 4.5 m): the bottom row is 0.6 m above the ground.
 */
export function d1WireSpanModule(atlas: PwAtlas, o: { wire: number; vine: number }, variant = 0): PwTile {
  const D = 16;
  const W = 80;
  const H = 72;
  return atlas.tile(`d1wires|${h6(o.wire)}|${variant}`, W, H, (c, k) => {
    const w = k.ramp(o.wire, { light: 0.55, sat: 0.6 });
    const vine = k.ramp(o.vine, { light: 0.45, sat: 1.05 });
    const ys = [0.9, 1.7, 2.5, 3.3, 4.1];
    const rowOf = (yM: number, x: number) => Math.round(H - 1 - (yM - 0.06 - 0.6) * D + Math.sin((x / (W - 1)) * Math.PI) * 1.7);
    for (let wi = 0; wi < ys.length; wi++) {
      const broken = variant === 2 && wi === 2;
      for (let x = 0; x < W; x++) {
        if (broken && x > 34 && x < 48) continue;
        c.set(x, rowOf(ys[wi], x), w, (x + wi * 13) % 23 === 0 ? 5 : x % 2 ? 4 : 3.4);
      }
      if (broken) {
        for (const [x0, dir] of [[34, 1], [48, -1]] as [number, number][]) {
          let x = x0;
          let y = rowOf(ys[wi], x0);
          for (let j = 0; j < 8; j++) {
            c.set(x, y, w, 4);
            y += 1;
            if (j % 3 === 0) x += dir;
          }
        }
      }
    }
    if (variant === 1) {
      for (let wi = 0; wi < 2; wi++) {
        for (let x = 2; x < W - 16; x++) {
          const y = rowOf(ys[wi], x) + Math.round(Math.sin(x * 0.7) * 1);
          c.set(x, y, vine, 3);
          if (hash2(x, wi, 5) > 0.78) {
            c.set(x, y + 1, vine, 4);
            c.set(x + 1, y + 1, vine, 2.4);
          }
        }
      }
    }
  });
}

/**
 * HIGH VOLTAGE sign (module 36 × 29 = 1.1 × 0.9 m): yellow enamel plate, a red
 * DANGER band, a black lightning bolt, small print, bolts, chipped enamel
 * showing rusty steel, a bullet hole or two.
 */
export function d1DangerSignModule(atlas: PwAtlas): PwTile {
  const W = 36;
  const H = 29;
  return atlas.tile(`d1danger`, W, H, (c, k) => {
    const rng = k.rng;
    const yl = k.ramp(0xf6c81c, { light: 0.45, sat: 1.05 });
    const red = k.ramp(0xd0201a, { light: 0.42 });
    const ink = k.ramp(0x161412, { light: 0.4 });
    const rust = k.ramp(0x7a3a1c, { light: 0.42 });
    c.rect(0, 0, W, H, yl, 3);
    c.rect(0, 0, W, 7, red, 3);
    c.hline(0, 0, W, red, 4);
    drawText(c, 'DANGER', 3, 1, FONT_3x5, yl, 4.4);
    // Bolt.
    c.poly([20, 8, 13, 17, 18, 17, 14, 26, 23, 15, 18, 15, 22, 8], ink, 1.4);
    // Small print.
    for (let i = 0; i < 3; i++) c.hline(3, 10 + i * 4, 8, ink, 1.6);
    drawText(c, 'KV', 25, 20, FONT_3x5, ink, 1.4);
    // Hazard foot.
    for (let x = 0; x < W; x++) for (let y = H - 4; y < H; y++) c.set(x, y, ((x + y) >> 2) % 2 ? ink : yl, 3);
    c.frame(0, 0, W, H, yl, 1.6);
    c.hline(0, 0, W, red, 4.4);
    // Bolts, chips, a bullet hole with a lit dent rim.
    for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 6], [W - 3, H - 6]]) {
      c.set(x, y, ink, 3.6);
      c.set(x + 1, y + 1, ink, 0.5);
    }
    for (let i = 0; i < 8; i++) c.cluster(rng.int(1, W - 3), rng.int(1, H - 3), i, rust, 2.4);
    const bx = rng.int(8, W - 8);
    const by = rng.int(9, H - 8);
    c.set(bx, by, ink, 0);
    c.set(bx - 1, by - 1, yl, 5);
    c.set(bx + 1, by + 1, yl, 1.5);
  });
}

// ─── Tour car ────────────────────────────────────────────────────────────────

export interface CarPaint {
  white: number;
  red: number;
  glass: number;
  tyre: number;
  steel: number;
  mud: number;
}

/**
 * Tour car body side (module 148 × 32 = 4.6 × 1 m; the front is on the LEFT):
 * white panels with a red waist stripe, two door seams and handles, the park
 * emblem and PRIMAL ISLAND TOURS on the stripe, fuel cap, dark wheel arches,
 * mud caked on the sill, raptor claw gouges through the paint, a dent.
 */
export function d1CarSideModule(atlas: PwAtlas, p: CarPaint, scratched: boolean): PwTile {
  const W = 148;
  const H = 32;
  return atlas.tile(`d1carside|${h6(p.white)}|${h6(p.red)}|${scratched ? 1 : 0}`, W, H, (c, k) => {
    const rng = k.rng;
    const wh = k.ramp(p.white, { light: 0.3, sat: 0.6 });
    const rd = k.ramp(p.red, { light: 0.42, sat: 1.05 });
    const st = k.ramp(p.steel, { light: 0.5, sat: 0.6 });
    const mud = k.ramp(p.mud, { light: 0.4 });
    const dark = k.ramp(0x22201e, { light: 0.4 });
    // Panel: lit upper body, a shaded lower curve (tumblehome), the red stripe at the waist.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let t = y < 2 ? 4.4 : y < 10 ? 3.6 : y < 24 ? 3 : 2.3;
        c.set(x, y, wh, t);
      }
    }
    c.rect(0, 11, W, 9, rd, 3);
    c.hline(0, 11, W, rd, 4.2);
    c.hline(0, 19, W, rd, 1.8);
    // Wheel arches (front wheel on the left), dark with a lit rim above.
    for (const ax of [W * 0.185, W * 0.815]) {
      for (let y = 14; y < H; y++) {
        for (let x = Math.floor(ax - 16); x <= ax + 16; x++) {
          const d = Math.hypot((x + 0.5 - ax) / 15.5, (y + 0.5 - H) / 17);
          if (d < 1) c.set(x, y, dark, d > 0.9 ? 2 : 0.8);
          else if (d < 1.12 && y < H - 2) c.set(x, y, wh, 4.2);
        }
      }
    }
    // Door seams + handles (doors between the arches).
    for (const sx of [44, 76, 104]) {
      c.vline(sx, 1, 26, wh, 1.2);
      c.vline(sx + 1, 1, 26, wh, 4);
    }
    for (const hx of [66, 96]) {
      c.rect(hx, 7, 6, 2, st, 4);
      c.hline(hx, 9, 6, st, 1);
    }
    // Emblem on the front door, TOURS lettering on the stripe of the rear door.
    d1Emblem(c, k, 58, 15.5, 6.5);
    drawText(c, 'PRIMAL ISLAND', 72, 13, FONT_3x5, wh, 4.4);
    drawText(c, 'TOURS', 108, 13, FONT_3x5, k.ramp(D1_EMBLEM.gold, { light: 0.5 }), 4);
    // Fuel cap (rear quarter).
    c.ellipse(124, 6, 2.2, 2, st, 3);
    c.set(123, 5, st, 5);
    // Mud: caked sill, splatter thrown up behind the wheels.
    for (let x = 0; x < W; x++) {
      const top = H - 5 - Math.round(smooth(x, 0, W, 8, 12, 5) * 4);
      for (let y = top; y < H; y++) if (c.at(x, y) !== dark) c.set(x, y, mud, y === top ? 3.6 : hash2(x, y, 3) > 0.7 ? 2 : 2.8);
    }
    for (let i = 0; i < 60; i++) {
      const x = rng.int(0, W - 1);
      const y = rng.int(14, H - 4);
      if (c.at(x, y) === wh || c.at(x, y) === rd) c.cluster(x, y, i, mud, rng.chance(0.5) ? 3 : 2.4);
    }
    // Dirt streaks running down from the windows.
    for (let i = 0; i < 10; i++) c.streak(rng, rng.int(2, W - 3), 0, rng.int(5, 14), -0.6, wh);
    if (scratched) {
      // Claw gouges: four parallel slashes through the paint to bare metal.
      const gx = 82;
      for (let j = 0; j < 4; j++) {
        for (let s = 0; s < 22; s++) {
          const x = gx + j * 4 + Math.round(s * 0.9);
          const y = 3 + s;
          if (y >= H - 4) break;
          c.set(x, y, st, 1.4);
          c.set(x + 1, y, st, 4.6);
        }
      }
      // A dent: a darker crescent with a lit lip.
      c.ellipseShade(30, 8, 7, 4, (d) => (d < 0.7 ? -0.9 : 0.6), wh);
    }
  });
}

/** Cabin side with windows (module 96 × 28 = 3 × 0.85 m, front on the LEFT): pillars, dark glass with sky streaks, a starred crack. */
export function d1CarCabinModule(atlas: PwAtlas, p: CarPaint, cracked: boolean): PwTile {
  const W = 96;
  const H = 28;
  return atlas.tile(`d1carcabin|${h6(p.white)}|${h6(p.glass)}|${cracked ? 1 : 0}`, W, H, (c, k) => {
    const wh = k.ramp(p.white, { light: 0.3, sat: 0.6 });
    const gl = k.ramp(p.glass, { light: 0.6, sat: 0.9 });
    const rub = k.ramp(0x1a1a1c, { light: 0.4 });
    c.rect(0, 0, W, H, wh, 3.4);
    c.hline(0, 0, W, wh, 4.4);
    c.hline(0, H - 1, W, wh, 2);
    // Windows: three panes between pillars, rubber seals, glass with diagonal sky reflections.
    const panes: [number, number][] = [[5, 30], [36, 62], [67, 91]];
    for (const [x0, x1] of panes) {
      c.frame(x0 - 1, 3, x1 - x0 + 2, 21, rub, 1);
      for (let y = 4; y < 23; y++) {
        for (let x = x0; x < x1; x++) {
          const refl = (x - y * 0.8 + 400) % 23;
          let t = y < 9 ? 2.6 : 2;
          if (refl < 3) t = 4;
          else if (refl < 4) t = 3;
          if (y === 4) t = 1.4;
          c.set(x, y, gl, t);
        }
      }
    }
    if (cracked) {
      // Star crack on the middle pane: pale lines from an impact point.
      const cx = 48;
      const cy = 12;
      for (let a = 0; a < 7; a++) {
        const ang = a * 0.9 + 0.3;
        for (let s = 0; s < 9; s++) {
          const x = Math.round(cx + Math.cos(ang) * s);
          const y = Math.round(cy + Math.sin(ang) * s * 0.8);
          if (c.at(x, y) === gl) c.set(x, y, gl, 5);
        }
      }
      c.set(cx, cy, gl, 0);
    }
    c.scatter(k.rng, 0, 0, W, H, 12, 0, -0.8, { shapes: 3, only: wh });
  });
}

/** Car front (module 64 × 32 = 2 × 1 m): grille slats, round headlights (one smashed), number plate, bumper. */
export function d1CarFrontModule(atlas: PwAtlas, p: CarPaint): PwTile {
  const W = 64;
  const H = 32;
  return atlas.tile(`d1carfront|${h6(p.white)}|${h6(p.steel)}`, W, H, (c, k) => {
    const wh = k.ramp(p.white, { light: 0.3, sat: 0.6 });
    const st = k.ramp(p.steel, { light: 0.55, sat: 0.6 });
    const dark = k.ramp(0x1c1c1e, { light: 0.4 });
    const lens = k.ramp(0xe8e0c0, { light: 0.4 });
    const rd = k.ramp(p.red, { light: 0.42 });
    const mud = k.ramp(p.mud, { light: 0.4 });
    c.rect(0, 0, W, H, wh, 3.2);
    c.hline(0, 0, W, wh, 4.4);
    c.rect(0, 9, W, 8, rd, 3);
    // Grille: dark slots between chrome bars.
    c.rect(18, 6, 28, 13, dark, 1);
    for (let x = 19; x < 46; x += 3) c.vline(x, 6, 13, st, x < 32 ? 4 : 3);
    c.frame(17, 5, 30, 15, st, 3.6);
    // Headlights: left one lit lens, right one smashed (dark socket, glass teeth).
    c.ellipse(9, 12, 5, 5, st, 3.4);
    c.ellipse(9, 12, 3.6, 3.6, lens, 3.6);
    c.set(7, 10, lens, 5);
    c.set(8, 10, lens, 5);
    c.ellipse(54, 12, 5, 5, st, 3);
    c.ellipse(54, 12, 3.6, 3.6, dark, 0.8);
    for (const [x, y] of [[52, 9], [56, 10], [53, 15]]) c.set(x, y, lens, 4.6);
    // Plate + bumper.
    c.rect(24, 21, 16, 6, k.ramp(0xe8e2c8, { light: 0.3 }), 3.6);
    drawText(c, 'PI 07', 25, 22, FONT_3x5, dark, 1);
    c.rect(0, 27, W, 5, st, 3);
    c.hline(0, 27, W, st, 4.6);
    c.hline(0, 31, W, st, 1.4);
    c.scatter(k.rng, 0, 22, W, 10, 30, mud, 2.6, { shapes: 6 });
  });
}

/** Car back (module 64 × 32): tail lights, tailgate seam and handle, spare-wheel bracket, a sticker, mud. */
export function d1CarBackModule(atlas: PwAtlas, p: CarPaint): PwTile {
  const W = 64;
  const H = 32;
  return atlas.tile(`d1carback|${h6(p.white)}|${h6(p.steel)}`, W, H, (c, k) => {
    const wh = k.ramp(p.white, { light: 0.3, sat: 0.6 });
    const st = k.ramp(p.steel, { light: 0.55, sat: 0.6 });
    const rd = k.ramp(p.red, { light: 0.42 });
    const tail = k.ramp(0xd8201a, { light: 0.5, sat: 1.1 });
    const mud = k.ramp(p.mud, { light: 0.4 });
    c.rect(0, 0, W, H, wh, 3.2);
    c.hline(0, 0, W, wh, 4.4);
    c.rect(0, 9, W, 8, rd, 3);
    for (const x of [2, 56]) {
      c.rect(x, 5, 6, 9, tail, 3);
      c.vline(x, 5, 9, tail, 4.6);
    }
    c.frame(10, 2, 44, 24, wh, 1.6);
    c.rect(28, 18, 8, 2, st, 4);
    c.rect(26, 4, 12, 12, st, 2.6);
    c.frame(26, 4, 12, 12, st, 4);
    drawText(c, 'I', 30, 22, FONT_3x5, rd, 3);
    c.rect(0, 27, W, 5, st, 3);
    c.hline(0, 27, W, st, 4.6);
    c.scatter(k.rng, 0, 16, W, 16, 40, mud, 2.6, { shapes: 6 });
  });
}

/** Painted car body sheet (roof, bonnet): white enamel, panel seams, a roof gutter, grime and leaves. 64 × 64 wrap. */
export function d1CarPaintTile(atlas: PwAtlas, p: CarPaint): PwTile {
  return atlas.tile(`d1carpaint|${h6(p.white)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const wh = k.ramp(p.white, { light: 0.3, sat: 0.6 });
    const leaf = k.ramp(0x6a7a2a, { light: 0.4 });
    c.rect(0, 0, 64, 64, wh, (x, y) => (smooth(x, y, 64, 64, 4, 7) < 0.3 ? 2.6 : 3.3));
    for (let y = 0; y < 64; y += 32) {
      c.hline(0, y, 64, wh, 1.6);
      c.hline(0, y + 1, 64, wh, 4.2);
    }
    for (let i = 0; i < 8; i++) c.cluster(rng.int(0, 62), rng.int(0, 62), i, leaf, rng.chance(0.5) ? 3 : 2);
    c.scatter(rng, 0, 0, 64, 64, 30, 0, -0.8, { shapes: 4 });
  }, { wrap: true });
}

/**
 * Car underside (module 64 × 148 = 2 × 4.6 m; front at the TOP): chassis rails,
 * two axles with diff housings, the exhaust run to a muffler, the fuel tank,
 * a sump, oil streaks, everything caked in dried mud and rust.
 */
export function d1CarUnderModule(atlas: PwAtlas, p: CarPaint): PwTile {
  const W = 64;
  const H = 148;
  return atlas.tile(`d1carunder|${h6(p.steel)}|${h6(p.mud)}`, W, H, (c, k) => {
    const rng = k.rng;
    const st = k.ramp(darken(p.steel, 0.55), { light: 0.45, sat: 0.6 });
    const mud = k.ramp(p.mud, { light: 0.4 });
    const rust = k.ramp(0x7a3a1c, { light: 0.42 });
    const dark = k.ramp(0x1a1816, { light: 0.4 });
    c.rect(0, 0, W, H, dark, 1.4);
    // Rails.
    for (const x of [12, 46]) {
      c.rect(x, 0, 6, H, st, 3);
      c.vline(x, 0, H, st, 4);
      c.vline(x + 5, 0, H, st, 1.6);
    }
    // Axles + diffs.
    for (const y of [24, 124]) {
      c.rect(0, y, W, 5, st, 3);
      c.hline(0, y, W, st, 4);
      c.ellipse(32, y + 2, 7, 6, st, 3.2);
      c.set(30, y, st, 5);
    }
    // Fuel tank (rear), sump (front), exhaust pipe running back on the right.
    c.rect(20, 92, 24, 22, st, 2.6);
    c.frame(20, 92, 24, 22, st, 1.6);
    c.hline(20, 92, 24, st, 4);
    c.rect(22, 34, 20, 14, st, 2.4);
    for (let y = 10; y < H - 8; y++) c.set(40 + Math.round(Math.sin(y * 0.05) * 2), y, st, y % 9 === 0 ? 4 : 3);
    c.rect(36, 70, 9, 18, st, 3);
    // Mud + rust everywhere, an oil streak.
    for (let i = 0; i < 160; i++) c.cluster(rng.int(0, W - 2), rng.int(0, H - 2), i, rng.chance(0.75) ? mud : rust, rng.chance(0.5) ? 3 : 2);
    c.streak(rng, 30, 48, 30, -1.2, 0, 2);
  });
}

/** Tyre tread (wrap 32 × 32, around the tyre): chunky staggered lugs, dark grooves, mud packed in. */
export function d1TreadTile(atlas: PwAtlas, o: { hex: number; mud: number }): PwTile {
  return atlas.tile(`d1tread|${h6(o.hex)}|${h6(o.mud)}`, 32, 32, (c, k) => {
    const r = k.ramp(o.hex, { light: 0.5, sat: 0.6 });
    const mud = k.ramp(o.mud, { light: 0.4 });
    c.rect(0, 0, 32, 32, r, 0.8);
    for (let ly = 0; ly < 32; ly += 8) {
      for (const [lx, off] of [[2, 0], [17, 4]] as [number, number][]) {
        const y0 = ly + off;
        for (let y = 0; y < 5; y++) for (let x = 0; x < 13; x++) c.set(lx + x, wrap(y0 + y, 32), r, y === 0 ? 3.6 : x === 12 ? 1.6 : 2.6);
      }
    }
    c.scatter(k.rng, 0, 0, 32, 32, 14, mud, 2.6, { shapes: 6 });
  }, { wrap: true });
}

/** Wheel face (module 32 × 32 disc): tyre sidewall, a steel rim with lug nuts, mud. */
export function d1WheelModule(atlas: PwAtlas, o: { tyre: number; rim: number; mud: number }): PwTile {
  return atlas.tile(`d1wheel|${h6(o.tyre)}|${h6(o.rim)}`, 32, 32, (c, k) => {
    const ty = k.ramp(o.tyre, { light: 0.5, sat: 0.6 });
    const rim = k.ramp(o.rim, { light: 0.55, sat: 0.6 });
    const mud = k.ramp(o.mud, { light: 0.4 });
    c.rect(0, 0, 32, 32, ty, 1);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = x + 0.5 - 16;
        const dy = y + 0.5 - 16;
        const d = Math.hypot(dx, dy);
        const lit = (-dx - dy) / Math.max(1, d);
        if (d < 7) c.set(x, y, rim, d < 2 ? 2 : lit > 0.3 ? 4.4 : lit < -0.3 ? 2.2 : 3.4);
        else if (d < 8) c.set(x, y, rim, 1.6);
        else if (d < 15.5) c.set(x, y, ty, d > 14.5 ? (lit > 0 ? 3 : 1.4) : lit > 0.5 ? 2.6 : 2);
      }
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      c.set(Math.round(16 + Math.cos(a) * 4.5), Math.round(16 + Math.sin(a) * 4.5), rim, 5);
    }
    c.scatter(k.rng, 2, 2, 28, 28, 16, mud, 2.6, { shapes: 6 });
  });
}

// ─── Park furniture ──────────────────────────────────────────────────────────

/** Ranger supply crate (module 32 × 24): boards with a stencilled emblem-less PRIMAL, rope handles, corner irons. */
export function d1CrateModule(atlas: PwAtlas, o: { wood: number; stencil?: string }): PwTile {
  const text = o.stencil ?? 'RANGER';
  return atlas.tile(`d1crate|${h6(o.wood)}|${text}`, 32, 24, (c, k) => {
    const wd = k.ramp(o.wood, { light: 0.42 });
    const ink = k.ramp(0x1c1a14, { light: 0.4 });
    const ir = k.ramp(0x3a3633, { light: 0.5 });
    for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) c.set(x, y, wd, y % 8 === 0 ? 1.6 : y % 8 === 1 ? 4 : Math.abs(Math.sin(x * 0.2 + y)) < 0.06 ? 2 : 3);
    c.frame(0, 0, 32, 24, wd, 2);
    drawText(c, text, Math.round(16 - (text.length * 4 - 1) / 2), 9, FONT_3x5, ink, 1.6);
    for (const [x, y] of [[0, 0], [29, 0], [0, 21], [29, 21]]) c.rect(x, y, 3, 3, ir, 3);
    c.scatter(k.rng, 0, 0, 32, 24, 14, 0, -1, { shapes: 4 });
  });
}

/**
 * A wooden arrow sign board (module 48 × 12 = 1.5 × 0.375 m, cut out round the
 * arrow tip; `dir` 1 points right, −1 left): routed pale letters, grain.
 */
export function d1ArrowSignModule(atlas: PwAtlas, text: string, o: { board: number; ink: number }, dir = 1): PwTile {
  const W = 48;
  const H = 12;
  return atlas.tile(`d1arrow|${text}|${h6(o.board)}|${dir}`, W, H, (c, k) => {
    const bd = k.ramp(o.board, { light: 0.42 });
    const ink = k.ramp(o.ink, { light: 0.35 });
    for (let y = 0; y < H; y++) {
      const tip = W - 1 - Math.abs(y + 0.5 - H / 2);
      for (let u = 0; u <= tip; u++) {
        const x = dir > 0 ? u : W - 1 - u;
        c.set(x, y, bd, y === 0 ? 4 : y === H - 1 ? 1.6 : Math.abs(Math.sin(x * 0.13 + y * 1.7)) < 0.06 ? 2 : 3);
      }
    }
    const tw = text.length * 4 - 1;
    drawText(c, text, dir > 0 ? Math.max(2, Math.round((W - 8 - tw) / 2)) : W - Math.max(2, Math.round((W - 8 - tw) / 2)) - tw, 4, FONT_3x5, ink, 3.6, { shadow: { ramp: bd, tone: 1.2 } });
    c.outline(1, true);
    c.scatter(k.rng, 0, 0, W, H, 8, 0, -1, { shapes: 3 });
  });
}

/**
 * ROAD CLOSED barricade (module 176 × 32 = 5.5 × 1 m, cut out between the two
 * rails): two rails of red / white chevron boards, the stencilled words on a
 * white plate, bolts, splintered and mud-splashed boards.
 */
export function d1BarricadeModule(atlas: PwAtlas): PwTile {
  const W = 176;
  const H = 32;
  return atlas.tile(`d1barricade`, W, H, (c, k) => {
    const rng = k.rng;
    const red = k.ramp(0xd0281c, { light: 0.42 });
    const wh = k.ramp(0xeeeeea, { light: 0.3, sat: 0.6 });
    const ink = k.ramp(0x1a1a1a, { light: 0.4 });
    const mud = k.ramp(0x6a5434, { light: 0.4 });
    const rail = (y0: number, flip: number) => {
      for (let y = y0; y < y0 + 11; y++) {
        for (let x = 0; x < W; x++) {
          const s = (Math.floor((x + (y - y0) * flip) / 10) & 1) === 0;
          c.set(x, y, s ? red : wh, y === y0 ? 4.2 : y === y0 + 10 ? 1.8 : 3);
        }
      }
    };
    rail(2, 1);
    rail(19, -1);
    // The plate.
    c.rect(52, 1, 72, 13, wh, 3.6);
    c.frame(52, 1, 72, 13, ink, 1.2);
    drawText(c, 'ROAD CLOSED', 56, 4, FONT_5x7, ink, 1.2);
    for (const x of [6, W - 7]) {
      c.set(x, 6, ink, 3.6);
      c.set(x, 24, ink, 3.6);
    }
    // Splinters + mud.
    for (let i = 0; i < 6; i++) {
      const x = rng.int(4, W - 8);
      c.set(x, rng.chance(0.5) ? 2 : 29, 0, 0);
      c.set(x + 1, rng.chance(0.5) ? 2 : 29, 0, 0);
    }
    c.scatter(rng, 0, 18, W, 14, 60, mud, 2.6, { shapes: 6 });
  });
}

/** Corrugated tin roofing (wrap 32 × 32): ribs every 4 texels (lit crest, dark trough), a lap seam, rust and moss. */
export function d1TinTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d1tin|${h6(o.hex)}`, 32, 32, (c, k) => {
    const rng = k.rng;
    const m = k.ramp(o.hex, { light: 0.5, sat: 0.85 });
    const rust = k.ramp(0x8a4a24, { light: 0.4 });
    const RIB = [4, 3, 2, 2.6];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, m, y === 0 ? 1.6 : RIB[x & 3]);
    for (let x = 1; x < 32; x += 8) c.set(x, 2, m, 5);
    for (let i = 0; i < 5; i++) {
      const x = rng.int(0, 31);
      const len = rng.int(4, 14);
      for (let j = 0; j < len; j++) if (bayer(x, j) > j / len - 0.2) c.tint(x, wrap(rng.int(0, 2) + j, 32), rust, 0);
    }
  }, { wrap: true });
}

/** Palm-thatch roof (wrap 64 × 32, v down the slope): overlapping frond layers, lit leading edges, dark under each layer, ragged ends. */
export function d1ThatchTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(`d1thatch|${h6(o.hex)}`, 64, 32, (c, k) => {
    const r = k.ramp(o.hex, { light: 0.45, sat: 0.95 });
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 64; x++) {
        const layer = (y + Math.round(Math.sin(x * 0.4) * 1.5 + hash2(x, 0, 5) * 2)) % 8;
        let t = layer === 0 ? 4.2 : layer < 3 ? 3.4 : layer < 6 ? 2.8 : 1.6;
        if (x % 3 === 0 && layer > 1) t -= 0.6;
        c.set(x, y, r, t);
      }
    }
  }, { wrap: true });
}

/** Moss sheet (wrap 64 × 64): cushions with lit crowns, darker seams, sprigs; laid round a log as a band. */
export function d1MossTile(atlas: PwAtlas, o: { hex: number; light: number }): PwTile {
  return atlas.tile(`d1moss|${h6(o.hex)}|${h6(o.light)}`, 64, 64, (c, k) => {
    const rng = k.rng;
    const m = k.ramp(o.hex, { light: 0.45, sat: 1.05 });
    const ml = k.ramp(o.light, { light: 0.45, sat: 1.05 });
    c.rect(0, 0, 64, 64, m, 2.4);
    for (let i = 0; i < 90; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      const r = rng.int(2, 5);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) c.set(wrap(x + dx, 64), wrap(y + dy, 64), m, dx + dy < -r * 0.6 ? 4 : dx + dy > r * 0.6 ? 2.2 : 3.2);
    }
    for (let i = 0; i < 50; i++) c.cluster(rng.int(0, 62), rng.int(0, 62), i, ml, 4.2);
  }, { wrap: true });
}

/**
 * Kiosk ticket window (module 64 × 48 = 2 × 1.5 m): a plank surround, the
 * shutter half up (corrugated, rusty), the dark booth inside with a stool and a
 * dangling phone, a TICKETS board above, a counter ledge with a rate card.
 */
export function d1KioskWindowModule(atlas: PwAtlas, o: { wood: number; shutter: number }): PwTile {
  const W = 64;
  const H = 48;
  return atlas.tile(`d1kioskwin|${h6(o.wood)}|${h6(o.shutter)}`, W, H, (c, k) => {
    const wd = k.ramp(o.wood, { light: 0.42 });
    const sh = k.ramp(o.shutter, { light: 0.5, sat: 0.8 });
    const dark = k.ramp(0x1c1814, { light: 0.4 });
    const sign = k.ramp(0x2f5a2a, { light: 0.42 });
    const cream = k.ramp(0xe8d8a0, { light: 0.35 });
    const rust = k.ramp(0x7a3a1c, { light: 0.42 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, wd, y % 8 === 0 ? 1.6 : y % 8 === 1 ? 4 : 3);
    // Board.
    c.rect(8, 1, 48, 10, sign, 3);
    c.frame(8, 1, 48, 10, cream, 3.4);
    drawText(c, 'TICKETS', 15, 3, FONT_5x7, cream, 4);
    // Opening: dark booth, shutter rolled half down.
    c.rect(8, 14, 48, 24, dark, 1);
    c.rect(10, 26, 6, 10, dark, 2.2);
    c.vline(46, 24, 8, dark, 2.6);
    c.rect(44, 31, 4, 3, dark, 2.4);
    for (let y = 14; y < 24; y++) for (let x = 8; x < 56; x++) c.set(x, y, sh, y % 2 ? 2.6 : 3.6);
    c.hline(8, 24, 48, sh, 1.4);
    for (let i = 0; i < 6; i++) c.cluster(k.rng.int(9, 53), k.rng.int(14, 22), i, rust, 2.4);
    c.frame(7, 13, 50, 26, wd, 1.4);
    // Counter ledge + rate card.
    c.rect(4, 38, 56, 4, wd, 3.6);
    c.hline(4, 38, 56, wd, 4.6);
    c.hline(4, 41, 56, wd, 1.4);
    c.rect(48, 28, 7, 9, cream, 3.6);
    for (let i = 0; i < 3; i++) c.hline(49, 30 + i * 2, 5, dark, 1.6);
  });
}

/** Park map board (module 48 × 32 = 1.5 × 1 m): framed painted island map (sea, island, volcano, road, YOU ARE HERE). */
export function d1MapBoardModule(atlas: PwAtlas): PwTile {
  const W = 48;
  const H = 32;
  return atlas.tile(`d1mapboard`, W, H, (c, k) => {
    const rng = k.rng;
    const wd = k.ramp(0x5a3a22, { light: 0.42 });
    const sea = k.ramp(0x3a8ab0, { light: 0.4 });
    const land = k.ramp(0x5a9a3a, { light: 0.42 });
    const road = k.ramp(0xc8a870, { light: 0.4 });
    const red = k.ramp(D1_EMBLEM.red, { light: 0.45 });
    const cream = k.ramp(0xe8d8a0, { light: 0.35 });
    c.rect(0, 0, W, H, wd, 3);
    c.rect(3, 6, W - 6, H - 9, sea, 3);
    for (let y = 6; y < H - 3; y++) for (let x = 3; x < W - 3; x++) if (Math.hypot((x - 24) / 17, (y - 18) / 9) + (smooth(x, y, 48, 32, 4, 3) - 0.5) * 0.5 < 1) c.set(x, y, land, (x + y) % 7 === 0 ? 4 : 3);
    c.ellipse(30, 14, 3, 3, k.ramp(0x7a7a72, { light: 0.4 }), 3);
    let x = 10;
    let y = 22;
    for (let i = 0; i < 26; i++) {
      c.set(x, y, road, 4);
      x += 1;
      y += rng.chance(0.4) ? (rng.chance(0.5) ? -1 : 1) : 0;
      y = Math.max(13, Math.min(24, y));
    }
    c.set(11, 22, red, 4);
    c.set(12, 21, red, 4);
    drawText(c, 'PARK MAP', 8, 1, FONT_3x5, cream, 4);
    c.frame(0, 0, W, H, wd, 1.6);
    c.hline(0, 0, W, wd, 4.4);
    c.scatter(rng, 1, 1, W - 2, H - 2, 10, 0, -0.8, { shapes: 3 });
  });
}

// ─── The jungle road ─────────────────────────────────────────────────────────

/**
 * The jungle road (wrap 256 × 256: 8 m across × 8 m along, laid as a ribbon
 * with v along the road): ragged grass fringes cut out over the meadow,
 * grassy shoulders, packed ochre earth in broad dry / damp drifts, two
 * compacted tyre ruts with tread prints and dried puddle crusts, a crown of
 * tufts, pebbles of every size half buried, fallen leaves and twigs, and a
 * three-toed raptor track crossing it.
 */
export function d1RoadTile(atlas: PwAtlas, o: { hex: number; rut: number; grass: number; stone: number; leaf: number }): PwTile {
  return atlas.tile(`d1road|${h6(o.hex)}|${h6(o.rut)}|${h6(o.grass)}`, 256, 256, (c, k) => paintRoad(c, k, o), { wrap: true });
}

function paintRoad(c: PwCanvas, k: PwKit, o: { hex: number; rut: number; grass: number; stone: number; leaf: number }) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const dirt = k.ramp(o.hex, { light: 0.4, sat: 0.95 });
  const rut = k.ramp(o.rut, { light: 0.4, sat: 0.95 });
  const grass = k.ramp(o.grass, { light: 0.45, sat: 1.05 });
  const stone = k.ramp(o.stone, { light: 0.45, sat: 0.6 });
  const leaf = k.ramp(o.leaf, { light: 0.42 });
  const ruts = [W * 0.37, W * 0.63];
  const rw = 18;
  // Per-row edge of the grass (both sides), wandering.
  const edgeL = new Int16Array(H);
  const edgeR = new Int16Array(H);
  for (let y = 0; y < H; y++) {
    edgeL[y] = Math.round(18 + (smooth(0, y, 8, H, 6, 41) - 0.5) * 16 + Math.sin((y / H) * Math.PI * 8) * 2);
    edgeR[y] = Math.round(W - 18 + (smooth(4, y, 8, H, 6, 42) - 0.5) * 16 + Math.sin((y / H) * Math.PI * 6 + 1) * 2);
  }
  for (let y = 0; y < H; y++) {
    const rwob = Math.sin((y / H) * Math.PI * 4) * 2.5;
    for (let x = 0; x < W; x++) {
      const eL = edgeL[y];
      const eR = edgeR[y];
      if (x < eL - 10 || x > eR + 10) {
        c.set(x, y, 0, 0);
        continue;
      }
      if (x < eL || x > eR) {
        // Grass margin: blades with gaps toward the outside.
        const out = x < eL ? eL - x : x - eR;
        if (out > 6 && hash2(x, y >> 1, 7) > 0.5) continue;
        c.set(x, y, grass, (x + y * 3) % 5 === 0 ? 4.3 : hash2(x, y, 9) > 0.7 ? 2.2 : 3.2);
        continue;
      }
      // Packed earth in broad drifts: drier (paler) and damper (darker), dithered seams.
      const n = smooth(x, y, W, H, 4, 13) * 0.7 + smooth(x, y, W, H, 16, 14) * 0.3;
      let t = 3;
      if (n > 0.66) t = bayer(x, y) < (n - 0.66) * 8 ? 4 : 3;
      else if (n < 0.34) t = bayer(x, y) < (0.34 - n) * 8 ? 2 : 3;
      // Shoulders: a step darker next to the grass (damp, churned).
      if (x < eL + 6 || x > eR - 6) t = Math.min(t, (x + y) % 3 === 0 ? 2 : 2.4);
      let r = dirt;
      for (const rx of ruts) {
        const d = Math.abs(x - rx - rwob);
        if (d < rw / 2) {
          r = rut;
          t = d > rw / 2 - 1.5 ? 2.6 : 3.2;
          // Tread prints: faint chevron bars across the track, broken up (worn, half washed out).
          const tv = (y + Math.round(Math.abs(x - rx - rwob) * 0.6)) % 9;
          if (d < rw / 2 - 3 && tv === 0 && hash2(x >> 2, y >> 3, 31) > 0.45) t = 2.6;
        } else if (d < rw / 2 + 1.5) t = 3.8; // the berm the tyres pushed up catches the light
      }
      c.set(x, y, r, t);
    }
  }
  // Damp hollows in the ruts: darker, a lit wet rim on the far (top) edge.
  for (let i = 0; i < 6; i++) {
    const rx = ruts[i % 2] + rng.spread(3);
    const cy = rng.int(0, H - 1);
    const len = rng.int(10, 22);
    for (let y = 0; y < len; y++) {
      const half = Math.round(Math.sin((y / len) * Math.PI) * 6);
      for (let x = -half; x <= half; x++) {
        const px = Math.round(rx + x);
        const py = wrap(cy + y, H);
        c.set(px, py, rut, y === 0 || Math.abs(x) === half ? 3.6 : 2.2);
      }
    }
  }
  // Mud cracks on the shoulders.
  for (let i = 0; i < 8; i++) crack(c, rng, rng.chance(0.5) ? rng.int(22, 40) : rng.int(W - 40, W - 22), rng.int(0, H - 1), rng.int(6, 14), rng.next() * 6, { dt: -1, lip: 1, wrapX: false });
  // Crown: tufts of grass and weeds between the ruts.
  for (let i = 0; i < 70; i++) tuft(c, Math.round(W / 2 + rng.spread(13)), rng.int(0, H - 1), grass, rng);
  // Stones: half-buried pebbles to cobbles, lit top-left, a dark lower-right and a shadow on the earth.
  for (let i = 0; i < 170; i++) {
    const x = rng.int(eLmin(edgeL) + 2, eRmax(edgeR) - 3);
    const y = rng.int(0, H - 1);
    const sz = rng.chance(0.08) ? 3 : rng.chance(0.3) ? 2 : 1;
    if (!c.at(x, y)) continue;
    for (let dy = 0; dy < sz; dy++) {
      for (let dx = 0; dx < sz + 1; dx++) {
        const t = dy === 0 && dx < sz ? 4.4 : dx === sz ? 1.8 : 3.2;
        c.set(x + dx, wrap(y + dy, H), stone, t);
      }
    }
    c.shift(x + sz + 1, wrap(y + sz, H), -1);
    c.shift(x + 1, wrap(y + sz, H), -1);
  }
  // Fallen leaves and twigs (few; more toward the edges).
  for (let i = 0; i < 45; i++) {
    const side = rng.chance(0.5);
    const x = side ? rng.int(18, 60) : rng.int(W - 60, W - 18);
    const y = rng.int(0, H - 1);
    if (!c.at(x, y)) continue;
    c.set(x, y, leaf, 4);
    c.set(x + 1, y, leaf, 3);
    c.set(x + 1, wrap(y + 1, H), leaf, 2);
  }
  for (let i = 0; i < 6; i++) {
    let x = rng.int(30, W - 30);
    let y = rng.int(0, H - 1);
    const dx = rng.spread(1);
    for (let j = 0; j < rng.int(5, 10); j++) {
      c.set(Math.round(x), wrap(Math.round(y), H), rut, 1);
      x += dx;
      y += 0.6;
    }
  }
  // A raptor's track crossing the road: three-toed prints, alternating, pressed dark with a lit back rim.
  let px = 30;
  let py = 40;
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 4 : -4;
    const fx = Math.round(px);
    const fy = Math.round(py + side);
    for (const [tx, ty] of [[0, -4], [-3, -3], [3, -3]]) {
      for (let s = 0; s < 4; s++) c.shift(fx + Math.round((tx * s) / 4), wrap(fy + Math.round((ty * s) / 4), H), -1.4);
      c.shift(fx + tx + 1, wrap(fy + ty + 1, H), 0.8);
    }
    c.shift(fx, wrap(fy + 1, H), -1.4);
    px += 24;
    py += 2;
  }
}

const eLmin = (a: Int16Array) => a.reduce((m, v) => Math.max(m, v), 0);
const eRmax = (a: Int16Array) => a.reduce((m, v) => Math.min(m, v), 1e9);

export { FONT_BOLD };
