import { FF, type FloraCanvas } from './floraPaint';
import type { FloraSpecies } from './floraSpecies';

/**
 * FLORA street props (ART: SPRITES): small round street furniture drawn as
 * pixel billboards like the plants — fire hydrants, trash cans and traffic
 * cones are rotationally symmetric, so a yaw-only billboard reads right from
 * every side (boxy props such as news boxes, benches and crates stay 3D).
 * Static scenery only: shootable props (explosive barrels, drums) are never
 * replaced. Colours come from the biome's `extra` ramps (the 3D props' own,
 * kept saturated: highlights climb toward warm, never toward white).
 *
 * Shading is the sprite artist's cylinder: a lit 1–2 texel column down the
 * left, the base colour across the middle, a 2-texel shadow band on the right
 * and the outline on the shadow side only (the resolve pass) — flat painted
 * bands, not a smooth gradient, so a prop reads as one solid object, never as
 * stacked tiers.
 */

/**
 * Tone across a cylinder (`u` = −1 left edge … 1 right edge): lit column, base,
 * shadow band, core shadow. Tones sit on ramp-step centres (0.25 per step, base
 * 0.5 = step 3) so the bands are flat steps, never a dither seam.
 */
export function cylTone(u: number, base = 0.5, gloss = 0): number {
  if (u < -0.66) return base + 0.25;
  if (gloss && u > -0.56 && u < -0.38) return base + gloss;
  if (u < 0.3) return base;
  if (u < 0.68) return base - 0.25;
  return base - 0.5;
}

/** Filled body of revolution seen from the side: half-width `half(y)` from y0 to y1, cylinder-shaded. */
export function lathe(c: FloraCanvas, cx: number, y0: number, y1: number, half: (y: number) => number, mat: number, tone: (u: number, y: number) => number, z = 0) {
  const pts: number[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    pts.push(cx - half(y), y);
  }
  for (let i = n; i >= 0; i--) {
    const y = y0 + ((y1 - y0) * i) / n;
    pts.push(cx + half(y), y);
  }
  c.poly(pts, mat, (px, py) => tone((px - cx) / Math.max(0.5, half(py)), py), { z });
}

/** Upper half-disc outline (x, y pairs) for domes and lids. */
function dome(cx: number, y: number, rx: number, ry: number): number[] {
  const p: number[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    p.push(cx + Math.cos(a) * rx, y + Math.sin(a) * ry);
  }
  return p;
}

/** Fire hydrant: flanged foot, stout barrel, side nozzles with hex caps, a collar and a domed bonnet with its nut; gloss red paint. */
export const HYDRANT: FloraSpecies = {
  key: 'hydrant',
  w: 40,
  h: 48,
  heightM: 0.78,
  variants: 2,
  paint(c, m, _rng, v) {
    const red = m.extra.hydrant;
    const cx = this.w / 2;
    // Ground flange (a flat disc seen from just above).
    c.ellipse(cx, 2, 11.5, 2.6, red, { z: 0, bias: -0.18, amp: 0.6 });
    lathe(c, cx, 1, 4, () => 10.5, red, (u) => cylTone(u, 0.4));
    // Barrel: a slight taper, gloss streak down the lit side.
    lathe(c, cx, 3.5, 32, (y) => 9 - (y - 3.5) * 0.03, red, (u) => cylTone(u, 0.5, 0.45), 1);
    // Collar under the bonnet.
    lathe(c, cx, 31, 34, () => 10, red, (u, y) => cylTone(u, y > 33 ? 0.62 : 0.38), 2);
    // Domed bonnet (lit cap upper left, shade lower right) + operating nut.
    c.poly(dome(cx, 33.5, 9, 8.5), red, (px, py) => {
      const l = (-(px - cx) / 9) * 0.6 + ((py - 33.5) / 8.5) * 0.7;
      return l > 0.45 ? 0.75 : l > -0.05 ? 0.5 : l > -0.45 ? 0.25 : 0.12;
    }, { z: 2 });
    lathe(c, cx, 41, 45, (y) => 2.6 - (y - 41) * 0.2, red, (u) => cylTone(u, 0.5), 3);
    // Side nozzles: stubby pipes with hex caps (top lit, underside dark).
    for (const side of [-1, 1]) {
      const xa = Math.min(cx + side * 8, cx + side * 11.5);
      const xb = Math.max(cx + side * 8, cx + side * 11.5);
      c.poly([xa, 22, xb, 22, xb, 27.5, xa, 27.5], red, (_px, py) => (py > 26.2 ? 0.75 : py > 23.5 ? 0.5 : 0.25), { z: 3 });
      const cc = cx + side * 12.5;
      c.poly([cc - 1.6, 21, cc + 1.6, 21, cc + 1.6, 28.5, cc - 1.6, 28.5], red, (_px, py) => (py > 27 ? 0.75 : py > 22.5 ? (side < 0 ? 0.5 : 0.25) : 0.12), { z: 3.5 });
    }
    // Front pumper nozzle (the big one) on one variant: a round cap with a dark ring, and its chain.
    if (v === 1) {
      c.ellipse(cx + 0.5, 18, 4.6, 4.6, red, { z: 6, bias: -0.22, amp: 0.4 });
      c.ellipse(cx + 0.5, 18, 3.4, 3.4, red, { z: 7, bias: 0.04, amp: 1.2 });
      c.line(cx - 2, 26, cx + 1.5, 21.5, m.extra.canLid, 0.45, 9, FF.SOFT);
    }
    // Paint wear: a couple of dark chips low on the barrel.
    c.line(cx + 3, 7, cx + 4, 7, red, 0.25, 4, FF.SOFT);
    c.line(cx - 5, 12, cx - 5, 12, red, 0.25, 4, FF.SOFT);
  },
};

/** Street trash can: tapered corrugated body (vertical ribs), a rim band and a shallow domed lid with a handle. */
export const TRASH_CAN: FloraSpecies = {
  key: 'trashCan',
  w: 48,
  h: 64,
  heightM: 1.02,
  variants: 2,
  paint(c, m, _rng, v) {
    const can = m.extra.can;
    const lid = m.extra.canLid;
    const cx = this.w / 2;
    const H = 57;
    const half = (y: number) => 16 + (2.6 * y) / H;
    // Ribs: corrugations as narrow lit / dark pairs that crowd toward the edges (they wrap round).
    lathe(c, cx, 0, H, half, can, (u, y) => {
      let t = cylTone(u, 0.5);
      const ang = Math.asin(Math.max(-1, Math.min(1, u)));
      const rib = ((((ang / Math.PI) * 9 + 0.5) % 1) + 1) % 1;
      if (rib < 0.18) t -= 0.25;
      else if (rib < 0.32 && u < 0.3) t += 0.25;
      // Bottom hoop and a darker foot.
      if (y < 2.5) t -= 0.25;
      else if (y > 4 && y < 6.5 && u < 0.3) t += 0.25;
      return t;
    });
    // Rim band (lid colour), the lid dome and its handle.
    lathe(c, cx, H - 1, H + 2.2, () => half(H) + 1.2, lid, (u) => cylTone(u, 0.5), 2);
    c.poly(dome(cx, H + 2, half(H) + 0.5, 3.6), lid, (px) => {
      const u = (px - cx) / (half(H) + 0.5);
      return u < -0.45 ? 1 : u < 0.4 ? 0.75 : 0.5;
    }, { z: 1 });
    lathe(c, cx, H + 4.5, H + 6.5, () => 3.5, lid, (u) => cylTone(u, 0.5), 3);
    // Dent and a grime streak on the variant.
    if (v === 1) {
      c.ellipse(cx + 7, 24, 3.6, 5.5, can, { z: 1.5, bias: -0.2, amp: 0.8 });
      c.line(cx - 9, 50, cx - 10, 33, can, 0.25, 2, FF.SOFT);
    }
  },
};

/** Traffic cone: saturated orange cone with one reflective band, standing on a wide dark base plate. */
export const CONE: FloraSpecies = {
  key: 'cone',
  w: 32,
  h: 40,
  heightM: 0.64,
  variants: 1,
  paint(c, m) {
    const or = m.extra.cone;
    const cx = this.w / 2;
    // Base plate: a low trapezoid ~1.5× the cone's foot, top face lit, front edge in shade.
    c.poly([cx - 13.5, 0, cx + 13.5, 0, cx + 12, 3.2, cx - 12, 3.2], m.extra.coneBase, (px, py) => (py > 2.2 ? 0.75 : (px - cx) / 13.5 > 0.55 ? 0.25 : 0.5), { z: 0 });
    const y0 = 2.6;
    const H = 38;
    const half = (y: number) => 8.6 - (7.2 * (y - y0)) / (H - y0);
    lathe(c, cx, y0, H, half, or, (u) => cylTone(u, 0.5), 1);
    // Rounded tip.
    c.ellipse(cx, H - 0.2, 1.6, 1.2, or, { z: 2, bias: 0.06, amp: 0.6 });
    // One reflective band at ~60 % height (follows the taper, shaded like the cone, never white).
    lathe(c, cx, 21.5, 25, half, m.extra.band, (u) => cylTone(u, 0.5), 2);
  },
};

export const STREET_PROPS = [HYDRANT, TRASH_CAN, CONE];
