import type { PwAtlas, PwKit, PwTile } from './atlas';
import { PWF, type PwCanvas } from './canvas';
import { PwField, pwAoBand, pwBloom, pwCast, pwCeramic, pwChips, pwLampPool, pwMoulding, pwPaintedLine, pwPeel, pwRepair, pwScrapes, pwShadowUnder, pwSmudge, pwWaterStain, pwWeep } from './brush2i';
import { crack, darken, hash2, shiftHue } from './surfaces';

/**
 * ST. MERCY HOSPITAL (z2), PIXEL WORLD 2 — the CLINICAL SHELL of the ground floor: the walls of
 * the ER, corridor A, ward 3 and the nurse station as painted PANELS (brush2i.ts), their floors
 * and ceilings.
 *
 * A panel is one picture of 6 m of hospital wall, floor to ceiling, at the density the rail sees
 * it from (96 texels a metre in the corridor, 64 in the rooms): painted plaster above a crash
 * rail above a wainscot of glazed tiles above a skirting — with what such a wall carries after
 * forty years and one bad week: wayfinding stripes, cable trunking under the ceiling, a conduit
 * drop, a vent, the ghost of a picture, paint come away to the coat underneath, leaks run down
 * from the ceiling, cracks, a band of trolley scrapes at bumper height, tiles chipped and gone.
 *
 * Only things that may be CUT anywhere by a door or a window are in a panel, and nothing that
 * reads wrong mirrored (no lettering, no arrows): fixtures with a place of their own are overlay
 * modules laid by the stage. Painted as if evenly lit, mid-wall no brighter than tone 4 (the
 * game reads first); the rows of the rail and the skirting are where the shell's rail and
 * skirting boxes stand, so those boxes show the same paint a little proud of the wall.
 */

export type ClinicStyle = 'clinic' | 'ward';

interface StyleDef {
  plaster: number;
  tile: number;
  rail: number;
  /** Height of the wainscot (the shell's `lowH`): the rail runs from 5 cm under it to 7 cm over it. */
  lowH: number;
}

const STYLES: Record<ClinicStyle, StyleDef> = {
  clinic: { plaster: 0x8a9e92, tile: 0x2a6258, rail: 0xb5a583, lowH: 1.3 },
  ward: { plaster: 0x94a690, tile: 0x2e6a5e, rail: 0xb9a07a, lowH: 1.1 },
};

/** Length of a wall panel, metres. */
export const Z2_PANEL_LEN = 6;
/** Panel variants: 0 and 1 carry the wall's story, 2 is the quiet one (spans that hold a door, walls behind enemies). */
export const Z2_PANEL_VARIANTS = 3;

/**
 * A wall panel: `H` metres high, painted at `density` texels a metre. The canvas is the next
 * multiple of 32 rows (every far level then holds whole texels: the stage re-makes them calm,
 * as it does for its tileable surfaces — a field of 10 cm tiles would otherwise reduce to
 * speckle 10 m down a corridor); the spare rows are above the wall's top and never shown.
 */
export function z2ClinicPanel(atlas: PwAtlas, style: ClinicStyle, variant: number, H: number, density: number): PwTile {
  return atlas.tile(`z2clinic|panel|${style}|${variant}|${H}|${density}`, Z2_PANEL_LEN * density, Math.ceil((H * density) / 32) * 32, (c, k) => paintPanel(c, k, STYLES[style], variant, H, density), { density });
}

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

function paintPanel(c: PwCanvas, k: PwKit, st: StyleDef, variant: number, H: number, S: number) {
  const rng = k.rng;
  const W = c.w;
  const HH = c.h;
  /** Metres → texels. */
  const m = (v: number) => Math.round(v * S);
  /** Canvas row of the top of something that reaches `v` metres above the floor. */
  const top = (v: number) => HH - m(v);
  /** The wall's top row (the ceiling line). */
  const Y0 = top(H);
  const seed = 40 + variant * 17 + (st.lowH > 1.2 ? 0 : 5);

  const soft = { dark: 0.5, light: 0.4, sat: 1 };
  const P = k.ramp(st.plaster, soft);
  const P2 = k.ramp(shiftHue(darken(st.plaster, 0.86), -0.02, 1.1), soft);
  const rust = k.ramp(mix(st.plaster, 0x7a5236, 0.5), { dark: 0.55, light: 0.3 });
  const mould = k.ramp(mix(st.plaster, 0x3a4a40, 0.55), { dark: 0.6, light: 0.3 });
  const filler = k.ramp(mix(st.plaster, 0xb4b0a4, 0.55), { dark: 0.55, light: 0.3 });
  const under = k.ramp(0xa39a7c, { dark: 0.55, light: 0.3 });
  const bare = k.ramp(0x87837f, { dark: 0.55, light: 0.3 });
  const stain = k.ramp(mix(darken(st.plaster, 0.86), 0x6e6a4a, 0.3), { dark: 0.55, light: 0.3 });
  const T = k.ramp(st.tile, { dark: 0.5, light: 0.5 });
  const T2 = k.ramp(darken(st.tile, 0.84), { dark: 0.5, light: 0.5 });
  const T3 = k.ramp(shiftHue(mix(st.tile, 0x5a8a7a, 0.3), 0.02, 0.9), { dark: 0.5, light: 0.45 });
  const grout = k.ramp(darken(st.tile, 0.66), { dark: 0.6, light: 0.3, sat: 0.7 });
  const bed = k.ramp(0x8a8472, { dark: 0.5, light: 0.3 });
  const rail = k.ramp(st.rail, { dark: 0.45, light: 0.4 });
  const skirt = k.ramp(0x343c3a, { dark: 0.55, light: 0.45 });
  const metal = k.ramp(0x8a9290, { dark: 0.45, light: 0.45 });
  const trunk = k.ramp(0xa8b2aa, { dark: 0.5, light: 0.4 });
  const blue = k.ramp(0x41688c, { dark: 0.5, light: 0.4, sat: 0.9 });
  const maroon = k.ramp(0x74383c, { dark: 0.5, light: 0.4, sat: 0.9 });

  const skH = m(0.14);
  const railTop = top(st.lowH + 0.07);
  const railH = top(st.lowH - 0.05) - railTop;
  const skTop = HH - skH;

  // ── (a) Base: plaster above, the tiled wainscot below ──
  c.rect(0, 0, W, railTop, P, 3);
  c.rect(0, 0, W, Y0, P, 1);
  // (10 cm tiles: 13 texels at 128, 10 at 96; 12.5 cm at 64, where 6 texels would not carry an edge and a glint.)
  const tp = S >= 96 ? Math.round(S * 0.104) : 8;
  const fieldTop = railTop + railH;
  pwCeramic(c, { x: 0, y: fieldTop, w: W, h: skTop - fieldTop, tw: tp, th: tp, glaze: T, batches: [T2, T3], grout, bed, seed, wear: variant === 2 ? 0.018 : 0.036, cap: Math.ceil((skTop - fieldTop) / tp) - 1 });

  // ── (b) Large value structure: an older coat showing in two or three broad shapes ──
  const coat = new PwField(W, HH * 2, W / 4, seed);
  const edge = new PwField(W, HH, W / 11, seed + 1);
  for (let y = Y0; y < railTop; y++) {
    for (let x = 0; x < W; x++) if (coat.at(x, (y - Y0) * 1.6) * 0.8 + edge.at(x, y - Y0) * 0.2 < 0.34) c.tint(x, y, P2);
  }

  // ── (c) Wear of the plaster, by variant (metres along the panel, metres above the floor) ──
  const at = (x: number) => Math.round(x * S);
  const ghost = (x: number, y: number, w: number, h: number) => {
    // Where a picture hung: the paint behind it kept its colour; a dust line along its top, two plugs.
    const gx = at(x);
    const gy = top(y);
    const gw = m(w);
    const gh = m(h);
    for (let yy = gy; yy < gy + gh; yy++) for (let xx = gx; xx < gx + gw; xx++) if (c.at(xx, yy) === P2) c.tint(xx, yy, P);
    c.shade(gx, gy - 1, gw, 1, -1);
    c.shade(gx, gy + gh, gw, 1, -1);
    for (let yy = gy; yy < gy + gh; yy++) if (hash2(0, yy >> 1, seed) > 0.4) c.shift(gx - 1, yy, -1);
    for (const px of [gx + m(0.08), gx + gw - m(0.08)]) {
      c.set(px, gy + m(0.07), P, 0);
      c.set(px + 1, gy + m(0.07) + 1, P, 4);
    }
  };
  const crackDown = (x: number, len: number) => crack(c, rng, at(x), Y0 + 2, m(len), Math.PI / 2 + rng.spread(0.2), { dt: -2, lip: 1, wrapX: false, branch: 0.03 });
  const leak = (x: number, w: number, len: number) => pwWaterStain(c, rng, at(x), Y0 + 2, m(w), m(len), stain);
  const peel = (x: number, y: number, rx: number, ry: number, deep = false) => pwPeel(c, rng, at(x), top(y), m(rx), m(ry), P, under, deep ? bare : 0);

  // The boards under the paint: a joint every 1.2 m ghosting through as a broken hairline, screw pops along it.
  for (let x = m(0.55 + variant * 0.3); x < W; x += m(1.2)) {
    for (let y = Y0 + 2; y < railTop - m(0.3); y++) {
      if (hash2(x, y >> 3, seed + 21) < 0.72) c.shift(x, y, -1, 0);
      if (hash2(x, y >> 3, seed + 22) < 0.3) c.shift(x - 1, y, 1, 0);
    }
    for (let y = Y0 + m(0.25); y < railTop - m(0.4); y += m(0.42)) {
      if (hash2(x, y, seed + 23) < 0.45) continue;
      c.shift(x + 2, y, -1, 0);
      c.shift(x + 3, y, -1, 0);
      c.shift(x + 2, y + 1, 1, 0);
    }
  }
  // Damp under the ceiling: mould in shaped blooms, thick at the top.
  pwBloom(c, 0, Y0 + 2, W, m(0.3), 1, mould, seed + 24, variant === 2 ? 0.4 : 0.6);
  // Hand and shoulder grime over the stripes: low lozenges a step darker.
  for (let i = 0; i < 5; i++) {
    const gx = rng.int(0, W - m(0.5));
    const gy = top(st.lowH + 0.3 + rng.next() * 0.25);
    pwSmudge(c, rng, gx + m(0.2), gy, m(0.12 + rng.next() * 0.16), m(0.03 + rng.next() * 0.03));
  }
  // (Plaster first: what is fixed to the wall is painted over its stains, never stained by them.)
  if (variant === 0) {
    leak(0.9, 0.85, 1.05);
    crackDown(1.2, 0.5);
    ghost(2.05, 2.45, 0.7, 0.55);
    peel(4.45, 2.0, 0.2, 0.14, true);
    peel(4.85, 1.72, 0.09, 0.07);
    crackDown(5.5, 0.9);
    pwRepair(c, at(0.2), top(2.3), m(0.42), m(0.3), filler, seed + 31);
  } else if (variant === 1) {
    pwRepair(c, at(4.6), top(2.05), m(0.5), m(0.26), filler, seed + 32);
    crackDown(0.75, 1.5);
    leak(0.5, 0.5, 0.7);
    peel(1.7, 1.78, 0.26, 0.17, true);
    peel(2.15, 2.02, 0.1, 0.08);
    leak(5.2, 0.6, 0.55);
    peel(5.45, 2.3, 0.12, 0.1);
  } else {
    leak(4.4, 0.4, 0.4);
    peel(0.6, 2.25, 0.09, 0.07);
    peel(3.2, 1.7, 0.11, 0.06);
    crackDown(2.4, 0.35);
    pwRepair(c, at(1.6), top(2.5), m(0.3), m(0.22), filler, seed + 33);
  }
  // Paint flaked off in groups: along the rail where trolleys knock it, round the damp at the top, a few loose.
  const quiet = variant === 2 ? 0.5 : 1;
  for (let i = 0; i < Math.round(5 * quiet); i++) pwChips(c, rng, rng.int(0, W), top(st.lowH + 0.42 + rng.next() * 0.2), m(0.35), m(0.1), 9, P, under);
  for (let i = 0; i < Math.round(4 * quiet); i++) pwChips(c, rng, rng.int(0, W), top(H - 0.5 - rng.next() * 0.25), m(0.3), m(0.12), 8, P, under);
  for (let i = 0; i < Math.round(5 * quiet); i++) pwChips(c, rng, rng.int(0, W), top(1.9 + rng.next() * 0.6), m(0.22), m(0.16), 6, P, under);
  // Where the roller missed: short pale strokes of the last coat, in runs at two heights.
  for (let i = 0; i < Math.round(26 * quiet); i++) {
    const x = rng.int(0, W - m(0.3));
    const y = top((i & 1 ? 2.15 : 2.62) + rng.spread(0.12));
    const len = rng.int(m(0.06), m(0.24));
    for (let q = 0; q < len; q++) if (c.at(x + q, y) === P && c.toneAt(x + q, y) === 3) c.shift(x + q, y, 1);
    if (rng.chance(0.5)) for (let q = 2; q < len - 2; q++) if (c.at(x + q, y + 1) === P && c.toneAt(x + q, y + 1) === 3) c.shift(x + q, y + 1, 1);
  }
  // Pin holes and plugs left by notices (pairs: a dark hole, a lit rim under it).
  for (let i = 0; i < 10; i++) {
    const x = rng.int(4, W - 5);
    const y = top(1.55 + rng.next() * 0.9);
    c.shift(x, y, -2, 0);
    c.shift(x, y + 1, 1, 0);
  }


  // ── (d) Construction ──
  // Wayfinding stripes just over the rail (blue to the wards, red to the ER), worn through in places.
  const sw = Math.max(3, m(0.04));
  [blue, maroon].forEach((r, i) => pwPaintedLine(c, 0, railTop - m(0.1) - (2 - i) * (sw + 2) + 2, W, sw, r, seed + 9 + i));
  // Cable trunking under the ceiling: a pale box section, jointed, clipped, casting on the wall under it.
  const trY = top(H - 0.27);
  const trH = Math.max(4, m(0.05));
  pwShadowUnder(c, 0, trY + trH, W, 3, seed + 2);
  pwMoulding(c, 0, trY, W, trH, trunk, { joint: m(2), phase: m(0.7 + variant * 0.5) });
  for (let x = m(0.4); x < W; x += m(0.75)) {
    c.shade(x, trY, 2, trH, -1, trunk);
    // (Every other clip's screw has rusted: a weep down the plaster under it.)
    if (hash2(x, variant, seed + 26) > 0.5) pwWeep(c, x, trY + trH + 1, m(0.12 + hash2(x, 1, seed + 27) * 0.3), rust, seed + 28);
  }
  // The crash rail: timber, jointed every 2.4 m with a steel band, gouged; its shadow on the tiles.
  pwMoulding(c, 0, railTop, W, railH, rail, { joint: m(2.4), phase: m(1.1 + variant * 0.8) });
  for (let x = m(1.1 + variant * 0.8) % m(2.4); x < W; x += m(2.4)) {
    c.rect(x - 2, railTop, 5, railH, metal, 3);
    c.vline(x - 2, railTop, railH, metal, 5);
    c.vline(x + 2, railTop + 1, railH - 1, metal, 1);
    c.hline(x - 2, railTop + railH - 1, 5, metal, 1);
  }
  pwScrapes(c, rng, 0, railTop + 2, W, railH - 5, Math.round(W / 40), { len: m(0.14), only: rail });
  pwShadowUnder(c, 0, fieldTop, W, Math.max(3, m(0.045)), seed + 3);
  // Brackets under the rail, every 1.2 m.
  for (let x = m(0.5); x < W; x += m(1.2)) {
    c.rect(x, fieldTop, m(0.035), m(0.03), metal, 2);
    c.hline(x, fieldTop + m(0.03), m(0.035), metal, 1);
  }
  // The skirting: a dark coved board, its top edge lit and scuffed, grime climbing from it.
  for (let x = 0; x < W; x++) if (hash2(x >> 2, 1, seed + 4) > 0.55) c.shift(x, skTop - 1, -1);
  c.shade(0, skTop - 2 - (S >= 96 ? 1 : 0), W, 1, -1, grout);
  pwMoulding(c, 0, skTop, W, skH, skirt, { joint: m(3), phase: m(1.9), top: 5 });
  for (let x = 0; x < W; x++) if (hash2(x >> 3, 2, seed + 5) > 0.7) c.set(x, skTop, skirt, 4);
  pwScrapes(c, rng, 0, skTop + 2, W, skH - 5, Math.round(W / 30), { len: m(0.1), only: skirt });
  for (let i = 0; i < Math.round(W / 48); i++) {
    // Rubber marks: pale dashes where wheels rubbed.
    const x = rng.int(0, W - 12);
    const y = skTop + rng.int(3, skH - 4);
    for (let q = 0; q < rng.int(4, 11); q++) c.shift(x + q, y, 1, skirt);
  }

  // ── (e) Wear of the wainscot ──
  // Trolley scrapes: one band at bumper height, the grout rubbed pale in it, long dashes.
  const bandY = top(0.93);
  pwScrapes(c, rng, 0, bandY, W, m(0.1), Math.round((W / 22) * (variant === 2 ? 0.6 : 1)), { len: m(0.22) });
  // Splash and mop dirt on the two lowest courses: clusters, thick at the skirting.
  for (let i = 0; i < Math.round(W / 6); i++) {
    const v = Math.floor(Math.pow(rng.next(), 2) * tp * 2.2);
    c.cluster(rng.int(0, W - 3), skTop - 2 - v, rng.int(0, 9), 0, -1);
  }

  // ── (f) What is fixed to the wall ──
  const lamp = (x: number, y: number) => {
    // A bulkhead lamp still burning: its pool on the plaster first (whole tone steps, down and outward),
    // then the fitting — a pressed back plate, a ribbed lens that glows, a guard across it.
    const lw = m(0.3);
    const lh = m(0.13);
    const lx = at(x) - (lw >> 1);
    const ly = top(y);
    // (One step over most of it — the wall stays under tone 5 — and a hot scallop right under the lens.)
    pwLampPool(c, at(x), ly + lh + m(0.2), m(0.62), m(0.46), seed + 41, 4);
    pwLampPool(c, at(x), ly + lh + m(0.03), m(0.2), m(0.1), seed + 42, 5);
    pwCast(c, lx, ly, lw, lh, 2);
    c.rect(lx, ly, lw, lh, metal, 3);
    c.bevel(lx, ly, lw, lh, true, 1, 2);
    const lens = k.ramp(0xe8dcb0, { dark: 0.6, light: 0.5 });
    c.rect(lx + 3, ly + 3, lw - 6, lh - 5, lens, 4, PWF.GLOW);
    c.hline(lx + 3, ly + 3, lw - 6, lens, 5, PWF.GLOW);
    c.hline(lx + 3, ly + lh - 3, lw - 6, lens, 2, PWF.GLOW);
    for (let i = lx + 7; i < lx + lw - 4; i += 6) c.vline(i, ly + 2, lh - 3, metal, 2);
  };
  const conduit = (x: number, yTo: number) => {
    // A conduit drop from the trunking to a box: lit down its left, dark down its right, saddle clips, a shadow beside it.
    const cx = at(x);
    const y0 = trY + trH;
    const y1 = top(yTo);
    c.shade(cx + 3, y0, 2, y1 - y0, -1);
    c.vline(cx, y0, y1 - y0, metal, 4);
    c.vline(cx + 1, y0, y1 - y0, metal, 3);
    c.vline(cx + 2, y0, y1 - y0, metal, 1);
    for (let y = y0 + m(0.2); y < y1 - 4; y += m(0.45)) {
      c.rect(cx - 2, y, 7, 3, metal, 3);
      c.hline(cx - 2, y, 7, metal, 5);
      c.hline(cx - 2, y + 2, 7, metal, 1);
    }
    // The box: a pressed-steel lid with four screws.
    const bw = m(0.12);
    pwCast(c, cx - (bw >> 1) + 1, y1, bw, bw, 2);
    c.rect(cx - (bw >> 1) + 1, y1, bw, bw, metal, 3);
    c.bevel(cx - (bw >> 1) + 1, y1, bw, bw, true, 1, 2);
    for (const [dx, dy] of [[2, 2], [bw - 3, 2], [2, bw - 3], [bw - 3, bw - 3]]) c.set(cx - (bw >> 1) + 1 + dx, y1 + dy, metal, 0);
  };
  const vent = (x: number, y: number) => {
    // A vent grille high on the wall: a frame, louvres lit on their upper edge, dust run down from it.
    const vw = m(0.42);
    const vh = m(0.24);
    const vx = at(x);
    const vy = top(y);
    pwWaterStain(c, rng, vx + 2, vy + vh, vw - 4, m(0.34), stain);
    pwCast(c, vx, vy, vw, vh, 2);
    c.rect(vx, vy, vw, vh, metal, 3);
    c.bevel(vx, vy, vw, vh, true, 1, 2);
    for (let j = 3; j < vh - 3; j++) c.hline(vx + 3, vy + j, vw - 6, metal, j % 4 === 0 ? 4 : j % 4 === 1 ? 2 : 0);
  };
  const plate = (x: number, y: number) => {
    // A blanked outlet: a pale plastic plate, two screws.
    const pw = m(0.09);
    const px = at(x);
    const py = top(y);
    pwCast(c, px, py, pw, pw, 1);
    c.rect(px, py, pw, pw, trunk, 3);
    c.bevel(px, py, pw, pw, true, 1, 1);
    c.set(px + 2, py + (pw >> 1), trunk, 1);
    c.set(px + pw - 3, py + (pw >> 1), trunk, 1);
  };
  if (variant === 0) {
    conduit(3.35, 2.05);
    plate(5.3, 1.75);
    lamp(1.62, 2.42);
  } else if (variant === 1) {
    vent(3.9, 2.6);
    plate(2.9, 1.75);
  }

  // ── (g) Contact: the ceiling's occlusion along the top of the wall ──
  pwAoBand(c, 0, Y0, W, Math.max(4, m(0.05)), 1, seed + 6);
}

// ─── Wall fixtures (overlay modules: each has a place of its own on a wall) ──

export type ClinicFixture = 'board' | 'boardB' | 'gel' | 'switch' | 'callpoint' | 'clipboard' | 'phone';

/** Size of a fixture's module, metres (its drawn body plus a margin for its cast shadow and what hangs from it). */
const FIX_SIZE: Record<ClinicFixture, [number, number]> = {
  board: [1.3, 0.94],
  boardB: [0.94, 0.72],
  gel: [0.22, 0.52],
  switch: [0.2, 0.16],
  callpoint: [0.18, 0.5],
  clipboard: [0.34, 0.5],
  phone: [0.3, 0.8],
};

/**
 * A wall fixture as a cut-out module at `density`. Each is drawn as a form (lit top and left,
 * shadowed bottom and right) with the shadow it throws on the wall under and to the right of it:
 * the shadow is painted in the wall's own plaster, two tones down, so it sits IN the wall.
 */
export function z2ClinicFixture(atlas: PwAtlas, kind: ClinicFixture, style: ClinicStyle = 'clinic', density = 96): PwTile {
  const [w, h] = FIX_SIZE[kind];
  return atlas.tile(`z2clinic|fix|${kind}|${style}|${density}`, Math.round(w * density), Math.round(h * density), (c, k) => paintFixture(c, k, kind, STYLES[style], density), { density });
}

function paintFixture(c: PwCanvas, k: PwKit, kind: ClinicFixture, st: StyleDef, S: number) {
  const rng = k.rng;
  const W = c.w;
  const H = c.h;
  const m = (v: number) => Math.max(1, Math.round(v * S));
  const P = k.ramp(st.plaster, { dark: 0.5, light: 0.4, sat: 1 });
  const wood = k.ramp(st.rail, { dark: 0.45, light: 0.4 });
  const cork = k.ramp(0x8c7250, { dark: 0.5, light: 0.3, sat: 0.9 });
  const paper = k.ramp(0xb9bcae, { dark: 0.5, light: 0.3, sat: 0.8 });
  const ink = k.ramp(0x3a4448, { dark: 0.6, light: 0.3 });
  const plastic = k.ramp(0xa8b2aa, { dark: 0.5, light: 0.4 });
  const metal = k.ramp(0x8a9290, { dark: 0.45, light: 0.45 });
  const blue = k.ramp(0x41688c, { dark: 0.5, light: 0.4, sat: 0.9 });
  const red = k.ramp(0x8a3430, { dark: 0.5, light: 0.35, sat: 0.95 });
  const yellow = k.ramp(0xa89a58, { dark: 0.5, light: 0.3, sat: 0.9 });
  const pink = k.ramp(0xa87a80, { dark: 0.5, light: 0.3, sat: 0.9 });
  const dark = k.ramp(0x2c3432, { dark: 0.6, light: 0.4 });
  /** A box-like body with its cast shadow on the wall (plaster two tones down) below and to its right. */
  const body = (x: number, y: number, w: number, h: number, ramp: number, d = 2, tone = 3) => {
    c.rect(x + d, y + h, w, d, P, 2);
    c.rect(x + w, y + d, d, h, P, 2);
    c.rect(x, y, w, h, ramp, tone);
    c.bevel(x, y, w, h, true, 1, 1);
  };
  /** A sheet of paper pinned up: a pale rectangle, its own thin shadow, typed lines, a pin. */
  const sheet = (x: number, y: number, w: number, h: number, ramp: number, pin: number, o: { photo?: boolean; grid?: boolean; curl?: boolean; blank?: boolean } = {}) => {
    c.rect(x + 1, y + h, w, 1, cork, 1);
    c.rect(x + w, y + 1, 1, h, cork, 1);
    c.rect(x, y, w, h, ramp, 3);
    c.hline(x, y, w, ramp, 4);
    if (o.photo) {
      // A face: a dark block, a paler oval in it.
      const pw = Math.max(4, (w >> 1) - 1);
      c.rect(x + 2, y + 3, pw, pw + 1, ink, 2);
      c.ellipse(x + 2 + pw / 2, y + 3 + pw / 2 + 0.5, pw / 3.2, pw / 2.6, paper, 2);
      for (let j = 0; j < 3; j++) c.hline(x + 4 + pw, y + 4 + j * 2, w - pw - 6, ink, 3);
      for (let j = pw + 6; j < h - 2; j += 2) c.hline(x + 2, y + j, w - 4 - ((j * 7) % 5), ink, 3);
    } else if (o.grid) {
      // A rota: a header bar, a grid, a few cells filled.
      c.rect(x + 1, y + 2, w - 2, 2, ink, 2);
      for (let j = 6; j < h - 1; j += 3) c.hline(x + 1, y + j, w - 2, ink, 4);
      for (let i = 4; i < w - 1; i += 5) c.vline(x + i, y + 5, h - 6, ink, 4);
      for (let j = 7; j < h - 2; j += 3) for (let i = 5; i < w - 4; i += 5) if (hash2(i, j, x) > 0.6) c.rect(x + i, y + j, 3, 2, hash2(i, j, x + 1) > 0.5 ? blue : red, 3);
    } else if (!o.blank) {
      for (let j = 3; j < h - 2; j += 2) c.hline(x + 2, y + j, w - 4 - ((j * 5) % 6), ink, j === 3 ? 2 : 3);
    }
    if (o.curl) {
      // A corner curled forward: the turned-back triangle lighter, its shadow on the sheet.
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4 - j; i++) c.set(x + w - 1 - i, y + h - 1 - j, i + j === 3 ? ramp : cork, i + j === 3 ? 5 : 1);
    }
    c.set(x + (w >> 1), y + 1, pin, 4);
    c.set(x + (w >> 1), y + 2, pin, 2);
  };

  if (kind === 'board' || kind === 'boardB') {
    // A cork notice board in a timber frame, layered with what the ward pinned up — and what came after.
    const bw = W - 3;
    const bh = H - 3;
    const f = m(0.035);
    body(0, 0, bw, bh, wood, 3);
    c.rect(f, f, bw - f * 2, bh - f * 2, cork, 3);
    // The cork sunk in its frame: a shadow under the top and left rails, pin holes as clusters.
    c.shade(f, f, bw - f * 2, 2, -1, cork);
    c.shade(f, f + 2, 2, bh - f * 2 - 2, -1, cork);
    c.scatter(rng, f + 2, f + 2, bw - f * 2 - 6, bh - f * 2 - 6, Math.round((bw * bh) / 260), cork, 2, { shapes: 3 });
    const X0 = f + 2;
    const Y0 = f + 2;
    const iw = bw - f * 2 - 4;
    const ih = bh - f * 2 - 4;
    const u = (v: number) => X0 + Math.round(v * iw);
    const vv = (v: number) => Y0 + Math.round(v * ih);
    if (kind === 'board') {
      sheet(u(0.02), vv(0.05), Math.round(iw * 0.27), Math.round(ih * 0.6), paper, red, { grid: true });
      sheet(u(0.33), vv(0.02), Math.round(iw * 0.16), Math.round(ih * 0.42), paper, blue, { photo: true });
      sheet(u(0.45), vv(0.12), Math.round(iw * 0.16), Math.round(ih * 0.42), paper, red, { photo: true, curl: true });
      sheet(u(0.58), vv(0.04), Math.round(iw * 0.16), Math.round(ih * 0.42), paper, yellow, { photo: true });
      sheet(u(0.78), vv(0.08), Math.round(iw * 0.2), Math.round(ih * 0.34), yellow, red);
      sheet(u(0.34), vv(0.6), Math.round(iw * 0.22), Math.round(ih * 0.34), paper, blue);
      // A child's drawing: a sun, a house, green ground.
      const dx = u(0.6);
      const dy = vv(0.54);
      const dw = Math.round(iw * 0.3);
      const dh = Math.round(ih * 0.42);
      sheet(dx, dy, dw, dh, paper, pink, { blank: true });
      c.rect(dx + 1, dy + dh - 4, dw - 2, 3, k.ramp(0x5a8a58, { dark: 0.5, light: 0.3 }), 3);
      c.ellipse(dx + dw - 6, dy + 6, 3, 3, yellow, 4);
      c.rect(dx + 5, dy + dh - 11, 9, 7, red, 3);
      c.poly([dx + 3, dy + dh - 11, dx + 9.5, dy + dh - 17, dx + 16, dy + dh - 11], blue, 3);
      sheet(u(0.05), vv(0.7), Math.round(iw * 0.12), Math.round(ih * 0.2), pink, blue);
      sheet(u(0.19), vv(0.72), Math.round(iw * 0.11), Math.round(ih * 0.18), yellow, red);
    } else {
      sheet(u(0.04), vv(0.06), Math.round(iw * 0.4), Math.round(ih * 0.5), paper, blue, { grid: true });
      sheet(u(0.5), vv(0.04), Math.round(iw * 0.2), Math.round(ih * 0.46), paper, red, { photo: true });
      sheet(u(0.66), vv(0.14), Math.round(iw * 0.2), Math.round(ih * 0.46), paper, yellow, { photo: true, curl: true });
      sheet(u(0.1), vv(0.62), Math.round(iw * 0.3), Math.round(ih * 0.3), yellow, red);
      sheet(u(0.5), vv(0.64), Math.round(iw * 0.36), Math.round(ih * 0.3), paper, blue);
    }
    // A dried hand dragged down across the lower rail of the frame (the story reached this wall).
    const blood = k.ramp(0x561418, { light: 0.22, sat: 0.95, dark: 0.5 });
    for (let i = 0; i < 4; i++) {
      const fx = u(kind === 'board' ? 0.86 : 0.3) + i * 2;
      const len = Math.round(ih * (0.2 + hash2(i, 3, 5) * 0.2));
      for (let j = 0; j < len; j++) if (hash2(i, j >> 1, 6) > 0.2) c.set(fx, vv(0.55) + j, blood, j > len - 3 ? 2 : 3);
    }
  } else if (kind === 'gel') {
    // Hand-gel dispenser: a pale body, a blue sight window, a lever, a drip tray; a run of gel down the wall under it.
    const bw = m(0.13);
    const bh = m(0.26);
    for (let j = 0; j < m(0.2); j++) if (hash2(1, j >> 1, 9) > 0.25) c.set((bw >> 1) + (j > 8 ? 1 : 0), bh + 2 + j, P, 2);
    body(0, 0, bw, bh, plastic, 2);
    c.rect(2, 3, bw - 4, m(0.09), blue, 3);
    c.hline(2, 3, bw - 4, blue, 1);
    c.vline(3, 4, m(0.09) - 2, blue, 5);
    c.rect(2, bh - m(0.07), bw - 4, m(0.035), plastic, 2);
    c.hline(2, bh - m(0.07), bw - 4, plastic, 5);
    c.rect(1, bh, bw - 2, 2, dark, 3);
    c.hline(1, bh, bw - 2, dark, 5);
    c.rect(4, m(0.13), bw - 8, 3, red, 3);
  } else if (kind === 'switch') {
    // A double switch: a plate, two rockers (one down), finger grime round it.
    const pw2 = m(0.15);
    const ph = m(0.09);
    for (let i = 0; i < 14; i++) c.cluster(rng.int(0, pw2 + 2), rng.int(0, ph + 3), rng.int(0, 5), P, 2);
    body(1, 1, pw2, ph, plastic, 1);
    for (const [i, on] of [[0, 1], [1, 0]]) {
      const rx = 3 + i * (pw2 >> 1);
      c.rect(rx, 3, (pw2 >> 1) - 4, ph - 4, plastic, on ? 4 : 2);
      c.hline(rx, on ? 3 : ph - 2, (pw2 >> 1) - 4, plastic, on ? 5 : 1);
    }
  } else if (kind === 'callpoint') {
    // Fire-alarm call point on a conduit drop: a red box, a pale glass with a black dot, a broken corner.
    const bw = m(0.1);
    const x0 = 2;
    const y0 = H - bw - 3;
    c.rect(x0 + (bw >> 1) + 1, 0, 1, y0, P, 1);
    c.vline(x0 + (bw >> 1) - 1, 0, y0, metal, 4);
    c.vline(x0 + (bw >> 1), 0, y0, metal, 2);
    body(x0, y0, bw, bw, red, 2);
    c.rect(x0 + 2, y0 + 2, bw - 4, bw - 4, plastic, 3);
    c.hline(x0 + 2, y0 + 2, bw - 4, plastic, 1);
    c.rect(x0 + (bw >> 1) - 1, y0 + (bw >> 1) - 1, 2, 2, dark, 1);
    c.line(x0 + bw - 5, y0 + 2, x0 + bw - 3, y0 + 5, dark, 2);
  } else if (kind === 'clipboard') {
    // A chart holder by a door: a wire pocket, a clipboard in it with a chart, a pen on a string.
    const bw = m(0.24);
    const bh = m(0.34);
    body(1, 2, bw, bh, k.ramp(0x7a6a50, { dark: 0.5, light: 0.3 }), 2);
    c.rect(3, 6, bw - 4, bh - 6, paper, 3);
    for (let j = 9; j < bh - 2; j += 2) c.hline(5, j, bw - 8 - ((j * 3) % 5), ink, j === 9 ? 2 : 3);
    c.rect((bw >> 1) - 3, 1, 7, 4, metal, 3);
    c.hline((bw >> 1) - 3, 1, 7, metal, 5);
    c.rect(4, bh - 9, 9, 5, red, 3);
    for (let j = 0; j < m(0.12); j++) c.set(bw + 1 + (j > 4 ? 1 : 0), bh - 4 + j, dark, 3);
    c.rect(bw + 1, bh - 4 + m(0.12), 2, m(0.035), blue, 3);
    // The pocket: three wires across the board's foot.
    for (let j = 0; j < 3; j++) {
      c.hline(0, bh - 12 + j * 5, bw + 2, metal, 4);
      c.hline(0, bh - 11 + j * 5, bw + 2, P, 1);
    }
  } else {
    // A wall phone off the hook: the cradle on the wall, the handset hanging by its coiled cord.
    const bw = m(0.12);
    const bh = m(0.2);
    body(m(0.04), 0, bw, bh, plastic, 2);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) c.rect(m(0.04) + 2 + i * 3, 5 + j * 3, 2, 2, dark, 3);
    c.rect(m(0.04) + 2, 2, bw - 4, 2, dark, 2);
    // The cord: a coil drawn as alternating offsets, ending in the handset.
    let cx = m(0.04) + (bw >> 1);
    const y1 = H - m(0.2);
    for (let y = bh; y < y1; y++) {
      const o = y % 4 < 2 ? 0 : 1;
      c.set(cx + o, y, dark, y % 4 === 0 ? 5 : 3);
      if (y % 9 === 0 && cx < W - 6) cx += 1;
    }
    const hx = cx - 2;
    c.rect(hx + 2, y1 + 2, 5, m(0.18), P, 1);
    c.rect(hx, y1, 5, m(0.18), dark, 3);
    c.vline(hx, y1, m(0.18), dark, 5);
    c.rect(hx - 1, y1, 7, 4, dark, 3);
    c.rect(hx - 1, y1 + m(0.18) - 4, 7, 4, dark, 2);
  }
}

/**
 * A door frame's architrave, seen from the front: a strip 10 cm wide and 3 m long at 96 texels a
 * metre, laid along a jamb (or turned along a head). A painted steel section drawn as a form — a
 * lit outer edge, a face, a stopped rebate in shadow, the inner edge dark — with the paint
 * knocked off where trolleys catch it (bare metal, a dark chip line over each, lit under it).
 */
export function z2ClinicArchitrave(atlas: PwAtlas): PwTile {
  return atlas.tile('z2clinic|architrave', 10, 288, (c, k) => {
    const rng = k.rng;
    const paint = k.ramp(0x9aa39c, { dark: 0.5, light: 0.4 });
    const metal = k.ramp(0x6f7876, { dark: 0.5, light: 0.45 });
    const tones = [5, 4, 3, 3, 3, 2, 1, 3, 2, 1];
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) c.set(x, y, paint, tones[x]);
    // Chips: thick at trolley and foot height (the canvas's bottom is the floor end), a few higher.
    for (let i = 0; i < 26; i++) {
      const v = i < 12 ? rng.int(70, 100) : i < 20 ? rng.int(2, 30) : rng.int(100, 280);
      const y = c.h - 1 - v;
      const x = rng.int(0, 6);
      const w = rng.int(2, 4);
      const h = rng.int(2, 6);
      for (let j = 0; j < h; j++) for (let q = 0; q < w; q++) if (!(j === 0 && q === 0) && !(j === h - 1 && q === w - 1)) c.set(x + q, y + j, metal, j === 0 ? 1 : j === h - 1 ? 5 : 3);
    }
    // Grime where hands push the frame, and at its foot.
    for (let y = c.h - 135; y < c.h - 95; y++) if (hash2(0, y >> 1, 91) > 0.4) c.shift(2 + (y & 1), y, -1);
    c.shade(0, c.h - 6, c.w, 6, -1);
    c.shade(0, c.h - 2, c.w, 2, -1);
  }, { density: 96 });
}

/**
 * The lining of a door or an opening (the reveal between its two architraves): a strip 0.42 m
 * deep and 3 m long at 96 texels a metre. Painted steel like the architrave: a lit return at
 * either edge, the door stop as a raised bead down the middle, and the marks of everything
 * that was wheeled through — a band of dents and scrapes at bed height (bare metal, a lit edge
 * under each), kick grime at the foot.
 */
export function z2ClinicLining(atlas: PwAtlas): PwTile {
  return atlas.tile('z2clinic|lining', 40, 288, (c, k) => {
    const rng = k.rng;
    const paint = k.ramp(0x9aa39c, { dark: 0.5, light: 0.4 });
    const metal = k.ramp(0x6f7876, { dark: 0.5, light: 0.45 });
    c.rect(0, 0, c.w, c.h, paint, 3);
    c.vline(0, 0, c.h, paint, 5);
    c.vline(1, 0, c.h, paint, 4);
    c.vline(c.w - 2, 0, c.h, paint, 2);
    c.vline(c.w - 1, 0, c.h, paint, 1);
    // The stop: a bead three texels wide, its shadow to the right.
    c.vline(18, 0, c.h, paint, 5);
    c.vline(19, 0, c.h, paint, 3);
    c.vline(20, 0, c.h, paint, 2);
    c.vline(21, 0, c.h, paint, 2);
    // (Heights are up from the canvas's bottom: the floor end of a jamb.)
    const up = (v: number) => c.h - 1 - v;
    for (let i = 0; i < 22; i++) {
      const y = up(i < 14 ? rng.int(62, 104) : rng.int(8, 40));
      const x = rng.int(2, c.w - 12);
      const len = rng.int(4, 12);
      for (let q = 0; q < len; q++) {
        c.set(x + q, y, metal, q === 0 ? 1 : 3);
        if (rng.chance(0.6)) c.set(x + q, y + 1, metal, 5);
      }
      if (rng.chance(0.4)) for (let q = 1; q < len - 1; q++) c.set(x + q, y - 1, paint, 1);
    }
    for (let i = 0; i < 9; i++) c.cluster(rng.int(2, c.w - 5), up(rng.int(120, 280)), rng.int(0, 5), 0, -1);
    c.shade(0, up(7), c.w, 8, -1);
    c.shade(0, up(2), c.w, 3, -1);
    for (let x = 2; x < c.w - 2; x++) if (hash2(x >> 1, 3, 95) > 0.5) c.shift(x, up(8 + (x & 1)), -1);
  }, { density: 96 });
}

// ─── Floors ──────────────────────────────────────────────────────────────────

const FLOOR = 0x5d6a63;

/** Heel marks: short curved dark dashes with a tail, each its own little form. */
function heelMarks(c: PwCanvas, rng: PwKit['rng'], n: number, x0: number, y0: number, w: number, h: number) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rng.int(0, w - 1);
    const y = y0 + rng.int(0, h - 1);
    const len = rng.int(5, 12);
    const bend = rng.chance(0.5) ? 1 : -1;
    for (let q = 0; q < len; q++) {
      const yy = y + Math.round((bend * (q - len / 2) * (q - len / 2)) / (len * 1.5));
      c.shift((x + q) % c.w, (yy + c.h) % c.h, q < 2 || q > len - 3 ? -1 : -2);
    }
  }
}

/**
 * Corridor A's floor: 384 × 384 at 96 texels a metre (4 m, wrapped). It is mapped by world
 * position, and the corridor's centre line falls on the tile's top / bottom edge, its two walls
 * 28 rows apart round the middle row: so the rows are designed ACROSS the corridor — the
 * polished, tracked traffic lane on the edge rows, the field of half-metre vinyl tiles either
 * side, and round the middle a border of small two-tone tiles that both walls' feet show.
 * Along the corridor nothing big repeats: the history (trails, spills, papers, the lamps'
 * reflections) is laid by the stage.
 */
export function z2CorridorFloor(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'z2clinic|floor|corridor',
    384,
    384,
    (c, k) => {
      const rng = k.rng;
      const W = c.w;
      const H = c.h;
      const soft = { dark: 0.5, light: 0.4, sat: 1 };
      const F = k.ramp(FLOOR, soft);
      const F2 = k.ramp(darken(FLOOR, 0.95), soft);
      const J = k.ramp(darken(FLOOR, 0.8), soft);
      const B1 = k.ramp(0x46524c, soft);
      const B2 = k.ramp(0x55625b, soft);
      const grime = k.ramp(mix(FLOOR, 0x2e3430, 0.6), { dark: 0.6, light: 0.3 });
      c.rect(0, 0, W, H, F, 3);
      /** Rows from the centre line of the corridor (the tile's top / bottom edge). */
      const fromLane = (y: number) => Math.min(y, H - 1 - y);
      // Half-metre tiles: thin joints a step down, a tile of another batch now and then, a corner lifted here and there.
      const TP = 48;
      for (let ty = 0; ty < H / TP; ty++) {
        for (let tx = 0; tx < W / TP; tx++) {
          const h = hash2(tx, ty, 61);
          if (h > 0.88) for (let y = 1; y < TP; y++) for (let x = 1; x < TP; x++) c.tint(tx * TP + x, ty * TP + y, F2);
          if (h < 0.1) {
            // A lifted corner: a dark triangle of shadow, a lit edge.
            const k2 = 3 + Math.floor(h * 40);
            for (let j = 0; j < k2; j++) for (let i2 = 0; i2 < k2 - j; i2++) c.set(tx * TP + 1 + i2, ty * TP + 1 + j, F, i2 + j === k2 - 1 ? 5 : 1);
          }
        }
      }
      // (Joints in a near twin of the vinyl: they draw the floor's perspective, they are not a grid on it.)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x % TP === 0 || y % TP === 0) c.set(x, y, J, 3);
      // The border the walls' feet show: two rows of small tiles in two close tones, a dark line either side.
      const b0 = 177;
      const bh = 29;
      for (let y = b0; y < b0 + bh; y++) {
        const row = y - b0 < 14 ? 0 : 1;
        for (let x = 0; x < W; x++) {
          const col = Math.floor(x / 16);
          const ly = (y - b0) % 14;
          const lx = x % 16;
          const edge = y === b0 || y === b0 + bh - 1;
          const r = (col + row) & 1 ? B1 : B2;
          c.set(x, y, edge ? B1 : r, edge ? 1 : lx === 0 || ly === 0 ? 2 : ly === 1 && lx > 1 ? 4 : 3);
        }
      }
      // Dirt mopped against the border from both sides, and gathered in it: shaped blooms, thick at its edges.
      pwBloom(c, 0, b0 - 1, W, 12, -1, grime, 67, 0.55);
      pwBloom(c, 0, b0 + bh, W, 12, 1, grime, 68, 0.55);
      pwBloom(c, 0, b0 + 1, W, 8, 1, grime, 69, 0.4);
      pwBloom(c, 0, b0 + bh - 2, W, 8, -1, grime, 70, 0.4);
      // The traffic lane: the vinyl a step lighter down the middle (35 cm either side of the centre line),
      // its edges frayed into long streaks along the corridor that thin out 85 cm from the centre.
      for (let y = 0; y < H; y++) if (fromLane(y) < 30) for (let x = 0; x < W; x++) if (c.toneAt(x, y) === 3) c.shift(x, y, 1);
      for (let i = 0; i < 150; i++) {
        const d = 30 + Math.floor(Math.pow(rng.next(), 1.7) * 56);
        const y = rng.chance(0.5) ? d : H - 1 - d;
        const x = rng.int(0, W - 1);
        const len = rng.int(14, 26 + Math.floor((86 - d) * 1.4));
        for (let q = 0; q < len; q++) if (c.toneAt((x + q) % W, y) === 3) c.shift((x + q) % W, y, 1);
      }
      // …and worn back to matt in the lane's middle: dark streaks where the polish is gone.
      for (let i = 0; i < 40; i++) {
        const d = rng.int(0, 26);
        const y = rng.chance(0.5) ? d : H - 1 - d;
        const x = rng.int(0, W - 1);
        const len = rng.int(10, 44);
        for (let q = 0; q < len; q++) if (c.toneAt((x + q) % W, y) === 4) c.shift((x + q) % W, y, -1);
      }
      // The ceiling lights in the polish: runs of broken dashes along the corridor, a few side by side.
      for (const [gx, gy] of [[40, 6], [170, -9], [300, 3]]) {
        for (let line = -2; line <= 2; line++) {
          const y = (gy + line * 3 + H) % H;
          let x = gx + Math.floor(hash2(line, gx, 77) * 30);
          const end = gx + 96 - Math.abs(line) * 14;
          while (x < end) {
            const len = 6 + Math.floor(hash2(x, line, 78) * 22);
            for (let q = 0; q < len && x + q < end; q++) c.set((x + q) % W, y, F, 5);
            x += len + 4 + Math.floor(hash2(x, line, 79) * 8);
          }
        }
      }
      // Wheel tracks: dark lines either side of the centre, in long runs.
      for (const off of [30, 36, 61]) {
        for (const y of [off, H - 1 - off]) {
          for (let x = 0; x < W; x++) if (hash2(x >> 6, y, 64) > 0.25 && hash2(x >> 2, y, 65) > 0.06) c.shift(x, y, -1);
        }
      }
      heelMarks(c, rng, 26, 0, 0, W, H);
      // Scratches dragged along the corridor (a bed frame, a bin): long thin lines, a lit edge under each.
      for (let i = 0; i < 9; i++) {
        const y = rng.int(0, H - 1);
        const x = rng.int(0, W - 1);
        const len = rng.int(40, 130);
        if (y >= b0 - 2 && y <= b0 + bh + 2) continue;
        for (let q = 0; q < len; q++) {
          if (hash2(q >> 3, i, 66) > 0.75) continue;
          c.shift((x + q) % W, y, -1);
          c.shift((x + q) % W, (y + 1) % H, 1);
        }
      }
    },
    { wrap: true, density: 96 },
  );
}

/**
 * The rooms' floors (ER, nurse station: `sheet` false; the ward's sheet vinyl: true): 256 × 256
 * at 64 texels a metre (4 m, wrapped). Half-metre vinyl tiles with thin joints and the odd tile
 * of another batch — or sheet with welded seams — and wear drawn as forms: polished patches with
 * a crisp edge, wheel arcs, heel marks, a cracked tile. No chequer.
 */
export function z2RoomFloor(atlas: PwAtlas, hex: number, sheet: boolean): PwTile {
  return atlas.tile(
    `z2clinic|floor|room|${hex.toString(16)}|${sheet ? 1 : 0}`,
    256,
    256,
    (c, k) => {
      const rng = k.rng;
      const W = c.w;
      const H = c.h;
      const soft = { dark: 0.5, light: 0.4, sat: 1 };
      const F = k.ramp(hex, soft);
      const F2 = k.ramp(darken(hex, 0.95), soft);
      const J = k.ramp(darken(hex, 0.8), soft);
      c.rect(0, 0, W, H, F, 3);
      const TP = 32;
      if (sheet) {
        // Sheet vinyl: a welded seam every 2 m (a dark line, a raised lit bead beside it).
        for (const x of [0, 128]) {
          for (let y = 0; y < H; y++) {
            c.shift(x, y, -1);
            if (hash2(x, y >> 2, 71) > 0.2) c.shift(x + 1, y, 1);
          }
        }
      } else {
        for (let ty = 0; ty < H / TP; ty++) {
          for (let tx = 0; tx < W / TP; tx++) {
            const h = hash2(tx, ty, 72);
            if (h > 0.86) for (let y = 1; y < TP; y++) for (let x = 1; x < TP; x++) c.tint(tx * TP + x, ty * TP + y, F2);
            if (h < 0.07) {
              // A cracked tile: a line corner to edge, lit on its lower side.
              let x = tx * TP + 4 + Math.floor(h * 200);
              for (let y = ty * TP + 1; y < ty * TP + TP; y++) {
                c.shift(x, y, -2);
                c.shift(x + 1, y, 1);
                if (hash2(x, y, 73) > 0.5) x += h < 0.035 ? 1 : -1;
              }
            }
          }
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x % TP === 0 || y % TP === 0) c.set(x, y, J, 3);
      }
      // Polish where feet and wheels went: many small streaks a step lighter, in both directions
      // (nothing big: a shape a metre across would be seen again every four).
      for (let i = 0; i < 64; i++) {
        const x = rng.int(0, W - 1);
        const y = rng.int(0, H - 1);
        const along = rng.chance(sheet ? 0.88 : 0.7);
        const len = rng.int(7, 30);
        const th = rng.int(1, 2);
        for (let q = 0; q < len; q++) {
          for (let t = 0; t < th; t++) {
            // (Lozenge: thinner at its ends.)
            if (th > 1 && (q < 2 || q > len - 3) && t !== 1) continue;
            const px = (x + (along ? q : t)) % W;
            const py = (y + (along ? t : q)) % H;
            if (c.toneAt(px, py) === 3) c.shift(px, py, 1);
          }
        }
      }
      // Wheel arcs (beds and trolleys swung round): thin dark curves, a quarter turn each.
      for (let i = 0; i < 5; i++) {
        const cx = rng.int(0, W - 1);
        const cy = rng.int(0, H - 1);
        const r = rng.int(26, 70);
        const a0 = rng.next() * 6.28;
        for (let t = 0; t < 1.5; t += 0.9 / r) {
          if (hash2(Math.floor(t * 9), i, 76) > 0.8) continue;
          const x = Math.round(cx + Math.cos(a0 + t) * r);
          const y = Math.round(cy + Math.sin(a0 + t) * r * 0.9);
          c.shift(((x % W) + W) % W, ((y % H) + H) % H, -1);
        }
      }
      heelMarks(c, rng, 14, 0, 0, W, H);
      // Grit in shaped clusters (never specks): a few dozen over 16 m².
      c.scatter(rng, 0, 0, W - 3, H - 3, 46, 0, -1, { shapes: 9 });
    },
    { wrap: true, density: 64 },
  );
}

// ─── Ceiling ─────────────────────────────────────────────────────────────────

/**
 * The suspended ceiling, drawn as a grid: 256 × 256 at 64 texels a metre (4 m, wrapped), half-metre
 * lay-in tiles between T-bars that have a lit and a shadowed edge. The tiles are not alike: the
 * fissured face of acoustic board as short shaped strokes, a tile yellowed with age, one sagging
 * out of its bars (a shadow along two edges), one ringed by an old leak. Missing tiles, troffers
 * and what hangs out of the void are laid by the stage.
 */
export function z2ClinicCeiling(atlas: PwAtlas, hex: number): PwTile {
  return atlas.tile(
    `z2clinic|ceiling|${hex.toString(16)}`,
    256,
    256,
    (c, k) => {
      const rng = k.rng;
      const W = c.w;
      const H = c.h;
      const soft = { dark: 0.5, light: 0.4, sat: 1 };
      const T = k.ramp(hex, soft);
      const T2 = k.ramp(mix(hex, 0x8a8468, 0.18), soft);
      const bar = k.ramp(mix(hex, 0xb0b8b0, 0.5), { dark: 0.45, light: 0.4 });
      const stain = k.ramp(mix(hex, 0x6a5a38, 0.5), { dark: 0.55, light: 0.3 });
      c.rect(0, 0, W, H, T, 3);
      const TP = 32;
      for (let ty = 0; ty < H / TP; ty++) {
        for (let tx = 0; tx < W / TP; tx++) {
          const x0 = tx * TP;
          const y0 = ty * TP;
          const h = hash2(tx, ty, 81);
          if (h > 0.84) for (let y = 2; y < TP; y++) for (let x = 2; x < TP; x++) c.tint(x0 + x, y0 + y, T2);
          // The board's fissures: a dozen short strokes a tile, in two directions.
          for (let i = 0; i < 4; i++) {
            const fx = x0 + 3 + Math.floor(hash2(tx * 16 + i, ty, 82) * (TP - 10));
            const fy = y0 + 3 + Math.floor(hash2(tx, ty * 16 + i, 83) * (TP - 8));
            const diag = hash2(tx + i, ty + i, 84) > 0.5;
            for (let q = 0; q < 3 + (i % 3); q++) c.shift(fx + q, fy + (diag ? q >> 1 : 0), -1);
          }
          if (h < 0.12) {
            // Sagging out of its bars: its own shadow along the top and left inside edges.
            c.shade(x0 + 2, y0 + 2, TP - 2, 2, -1);
            c.shade(x0 + 2, y0 + 4, 2, TP - 4, -1);
            c.shade(x0 + 2, y0 + TP - 1, TP - 2, 1, 1);
          } else if (h > 0.955) {
            // An old leak: a lobed ring with a darker rim and a washed middle, spreading from a corner of the tile.
            const cx = x0 + 6 + Math.floor(hash2(tx, ty, 85) * 20);
            const cy = y0 + 6 + Math.floor(hash2(tx, ty, 86) * 20);
            const r = 7 + Math.floor(hash2(tx, ty, 87) * 7);
            const ph = hash2(tx, ty, 89) * 6.28;
            for (let y = -r - 4; y <= r + 4; y++) {
              for (let x = -r - 5; x <= r + 5; x++) {
                const a = Math.atan2(y, x);
                const d = Math.sqrt((x * x) / ((r + 3) * (r + 3)) + (y * y) / (r * r)) / (1 + 0.2 * Math.sin(a * 3 + ph) + 0.1 * Math.sin(a * 5 - ph));
                if (d < 1 && cx + x > x0 + 1 && cy + y > y0 + 1 && cx + x < x0 + TP && cy + y < y0 + TP) c.tint(cx + x, cy + y, stain, d > 0.8 ? -1 : d < 0.45 ? 1 : 0);
              }
            }
          }
        }
      }
      // T-bars: two texels, the first lit, the second in shadow; a clip where they cross.
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const lx = x % TP;
          const ly = y % TP;
          if (lx < 2 && ly < 2) c.set(x, y, bar, 2);
          else if (lx < 2) c.set(x, y, bar, lx === 0 ? 4 : 2);
          else if (ly < 2) c.set(x, y, bar, ly === 0 ? 4 : 2);
        }
      }
      // Dust and a few dead flies gathered along bars (clusters).
      c.scatter(rng, 0, 0, W - 3, H - 3, 8, 0, -1, { shapes: 6 });
    },
    { wrap: true, density: 64 },
  );
}

/** Margin of the troffer module round the fitting, texels (its halo on the ceiling). */
export const Z2_TROFFER_HALO = 16;

/**
 * A recessed light fitting (0.69 × 1.25 m, 44 × 80 texels at 64) with what it does to the ceiling
 * round it. Lit: a pressed frame, a prismatic lens that glows, two tubes as brighter bands (one
 * dark at an end), flies in a corner — and a HALO on the ceiling as paint: a ring of the
 * ceiling's own colour two steps up, a second one step up, both broken into dashes so the grid
 * under them shows through (light as tone steps, never a gradient). Dead: a grey lens with the
 * tubes' shadows in it and a water mark; no halo.
 */
export function z2ClinicTroffer(atlas: PwAtlas, state: 'on' | 'warm' | 'off', ceiling: number): PwTile {
  const M = Z2_TROFFER_HALO;
  return atlas.tile(`z2clinic|troffer|${state}|${ceiling.toString(16)}`, 44 + M * 2, 80 + M * 2, (c, k) => {
    const frame = k.ramp(0xb4bab2, { dark: 0.45, light: 0.4 });
    const lens = k.ramp(state === 'off' ? 0x68706c : state === 'warm' ? 0xf4e4c0 : 0xdcf2e8, { dark: 0.6, light: 0.5, sat: 0.8 });
    const T = k.ramp(ceiling, { dark: 0.5, light: 0.4, sat: 1 });
    const on = state !== 'off';
    const G = on ? PWF.GLOW : 0;
    const W = 44;
    const H = 80;
    if (on) {
      // The halo: dashes of lit ceiling, dense by the fitting and thinning outward.
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const dx = Math.max(0, M - x, x - (M + W - 1));
          const dy = Math.max(0, M - y, y - (M + H - 1));
          const d = Math.sqrt(dx * dx + dy * dy) / M;
          if (d <= 0 || d > 1) continue;
          const h = hash2(x >> 2, y, 93);
          if (d < 0.3 ? h > 0.25 : d < 0.62 ? h > 0.5 : h > 0.78) c.set(x, y, T, d < 0.3 ? 5 : 4);
        }
      }
    }
    // The fitting: frame (lit top / left, shadowed bottom / right), the lens sunk in it.
    c.rect(M, M, W, H, frame, 3);
    c.bevel(M, M, W, H, true, 1, 2);
    c.frame(M + 2, M + 2, W - 4, H - 4, frame, 1);
    c.rect(M + 3, M + 3, W - 6, H - 6, lens, on ? 3 : 2, G);
    // Prisms: a quiet diamond lattice a step up.
    for (let y = M + 3; y < M + H - 3; y++) for (let x = M + 3; x < M + W - 3; x++) if ((x + y) % 6 === 0 || (x - y + 600) % 6 === 0) c.set(x, y, lens, on ? 4 : 1, G);
    // Tubes behind the lens: two bands along its length, bright in the middle; one going black at an end.
    for (const tx of [M + 12, M + W - 16]) {
      for (let y = M + 7; y < M + H - 7; y++) {
        const old = tx > M + 20 && y > M + H - 22;
        for (let q = 0; q < 4; q++) c.set(tx + q, y, lens, !on ? (q === 0 || q === 3 ? 1 : 2) : old ? 2 : q === 1 || q === 2 ? 5 : 4, G);
      }
    }
    // Flies in a corner of the lens; on a dead one, the tide mark of a leak.
    const fly = k.ramp(0x2c2e24, { dark: 0.6, light: 0.3 });
    for (const [x, y] of [[5, H - 7], [6, H - 8], [8, H - 6], [W - 8, 6], [W - 7, 7]]) c.set(M + x, M + y, fly, 2);
    if (!on) for (let x = M + 6; x < M + W - 8; x++) c.set(x, M + 20 + Math.round(Math.sin(x * 0.5) * 2), lens, 1);
  }, { density: 64 });
}

/** Frames of the animated strips of this file (the stage's one animated material plays 4 at 7 fps). */
export const Z2_CLINIC_FRAMES = 4;
/** Where the failing end of a troffer's second tube lies in its module (texels from its left / bottom), and its size. */
export const Z2_TUBE_END = { x: Z2_TROFFER_HALO + 28, y: Z2_TROFFER_HALO + 7, w: 4, h: 15 };

/**
 * A fluorescent tube's failing end, as a loop: 4 frames of 4 × 15 texels (dark, struck, dark,
 * half) laid over the dark end of a lit troffer's second tube. Small on purpose: a flicker the
 * eye catches, never a light that changes the room (the bible's §4.7).
 */
export function z2ClinicTubeFlicker(atlas: PwAtlas, warm: boolean): PwTile {
  const { w, h } = Z2_TUBE_END;
  return atlas.tile(`z2clinic|tube|${warm ? 1 : 0}`, w, h * Z2_CLINIC_FRAMES, (c, k) => {
    const lens = k.ramp(warm ? 0xf4e4c0 : 0xdcf2e8, { dark: 0.6, light: 0.5, sat: 0.8 });
    // (Frame 0 is the strip's BOTTOM block: the material steps up through it.)
    [2, 5, 2, 3].forEach((t, f) => {
      const y0 = c.h - (f + 1) * h;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c.set(x, y0 + y, lens, t === 5 && (x === 0 || x === w - 1) ? 4 : t, PWF.GLOW);
    });
  }, { density: 64, frames: Z2_CLINIC_FRAMES });
}

/** Every tile of this file at the sizes the stage uses (look-dev dumps, benches). */
export function z2ClinicTiles(atlas: PwAtlas): PwTile[] {
  const out: PwTile[] = [];
  for (const [style, H, density] of [['clinic', 3.2, 128], ['clinic', 4.2, 64], ['clinic', 3.6, 64], ['ward', 3.6, 64]] as const) {
    for (let v = 0; v < Z2_PANEL_VARIANTS; v++) out.push(z2ClinicPanel(atlas, style, v, H, density));
  }
  out.push(z2CorridorFloor(atlas), z2RoomFloor(atlas, FLOOR, false), z2RoomFloor(atlas, 0x5a685e, true), z2ClinicCeiling(atlas, 0x7a827c));
  for (const kind of ['board', 'boardB', 'gel', 'switch', 'callpoint', 'clipboard', 'phone'] as const) out.push(z2ClinicFixture(atlas, kind));
  out.push(z2ClinicArchitrave(atlas), z2ClinicLining(atlas));
  for (const st of ['on', 'warm', 'off'] as const) out.push(z2ClinicTroffer(atlas, st, 0x7a827c));
  return out;
}
