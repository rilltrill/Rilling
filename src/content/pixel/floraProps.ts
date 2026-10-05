import { FF } from './floraPaint';
import type { FloraSpecies } from './floraSpecies';

/**
 * FLORA street props (ART: SPRITES): small round street furniture drawn as
 * pixel billboards like the plants — fire hydrants, trash cans and traffic
 * cones are rotationally symmetric, so a yaw-only billboard reads right from
 * every side (boxy props such as news boxes, benches and crates stay 3D).
 * Static scenery only: shootable props (explosive barrels, drums) are never
 * replaced. Colours come from the biome's `extra` ramps (the 3D props' own).
 */

/** Cylinder shading across a vertical body (stroke from foot to top). */
const BODY = { flat: 0, amp: 1.25 } as const;

/** Fire hydrant: flanged foot, stout barrel, stubby side nozzles with caps, a flat bonnet with a nut; gloss paint. */
export const HYDRANT: FloraSpecies = {
  key: 'hydrant',
  w: 40,
  h: 48,
  heightM: 0.78,
  variants: 2,
  paint(c, m, _rng, v) {
    const red = m.extra.hydrant;
    const cx = this.w / 2;
    // Foot flange, stout barrel, collar under the bonnet.
    c.stroke([cx, 0, cx, 4], [9.5, 9], red, { ...BODY, bias: -0.14, z: 0 });
    c.stroke([cx, 3, cx, 30], [7.4, 7], red, { ...BODY, z: 1 });
    c.stroke([cx, 29, cx, 32.5], [9, 9], red, { ...BODY, bias: -0.08, z: 2 });
    // Stubby side nozzles (hexagonal caps), the pumper cap in front on one variant.
    for (const side of [-1, 1]) {
      c.stroke([cx + side * 6, 20, cx + side * 9.5, 20], [2.8, 2.8], red, { amp: 1.1, bias: side < 0 ? 0.04 : -0.12, z: 3 });
      c.stroke([cx + side * 9.5, 20, cx + side * 11, 20], [3.4, 3.4], red, { amp: 1.1, bias: side < 0 ? -0.02 : -0.16, z: 3.5 });
    }
    if (v === 1) c.ellipse(cx, 16, 3.6, 3.6, red, { z: 6, bias: -0.02 });
    // Flat bonnet + operating nut.
    c.ellipse(cx, 33.5, 7.6, 3.6, red, { z: 2, amp: 1.2, bias: 0.02 });
    c.stroke([cx, 35, cx, 38.5], [2, 1.7], red, { amp: 1, bias: -0.08, z: 4 });
    // Gloss: a lit streak down the barrel's light side, chain to the cap.
    c.line(cx - 3.5, 6, cx - 3.5, 27, red, 0.95, 4, FF.SOFT);
    if (v === 1) c.line(cx - 2, 26, cx + 2, 18, m.extra.canLid, 0.5, 7, FF.SOFT);
  },
};

/** Street trash can: tapered corrugated body (ribs), a rim band and a domed lid. */
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
    const H = 52;
    // Body: tapered, shaded as a cylinder, ribs as vertical light/dark pairs.
    c.poly([cx - 14.5, 0, cx + 14.5, 0, cx + 17, H, cx - 17, H], can, (x, y) => {
      const half = 14.5 + (2.5 * y) / H;
      const u = (x - cx) / half;
      const nz = Math.sqrt(Math.max(0, 1 - u * u));
      let t = 0.5 + 0.5 * (u * -0.55 + nz * 0.56) * 1.3;
      const rib = Math.abs(((u + 1) * 6) % 1);
      if (rib < 0.2) t -= 0.18;
      else if (rib < 0.4) t += 0.08;
      if (y < 3) t -= 0.12;
      return t;
    }, { z: 0 });
    // Rim band and lid.
    c.stroke([cx - 17.5, H, cx + 17.5, H], [2.2, 2.2], lid, { amp: 0.6, bias: 0.04, z: 2, flat: 0.5 });
    c.ellipse(cx, H + 2.5, 17, 4.5, lid, { z: 1, amp: 1.2 });
    c.stroke([cx, H + 5, cx, H + 7.5], [3, 2.4], lid, { z: 3, amp: 1 });
    // A dent and a rust streak on the variant.
    if (v === 1) {
      c.ellipse(cx + 6, 22, 4, 6, can, { z: 1.5, bias: -0.18 });
      c.line(cx - 8, 46, cx - 9, 30, can, 0.22, 2, FF.SOFT);
    }
  },
};

/** Traffic cone: orange cone with two reflective white bands on a square black foot. */
export const CONE: FloraSpecies = {
  key: 'cone',
  w: 32,
  h: 40,
  heightM: 0.64,
  variants: 1,
  paint(c, m) {
    const or = m.extra.cone;
    const band = m.extra.band;
    const cx = this.w / 2;
    c.poly([cx - 13, 0, cx + 13, 0, cx + 12, 3, cx - 12, 3], m.extra.coneBase, (x) => 0.45 - ((x - cx) / 13) * 0.15, { z: 0 });
    const H = 38;
    c.poly([cx - 9, 2.5, cx + 9, 2.5, cx + 1.4, H, cx - 1.4, H], or, (x, y) => {
      const half = 9 - (7.6 * (y - 2.5)) / (H - 2.5);
      const u = (x - cx) / half;
      const nz = Math.sqrt(Math.max(0, 1 - u * u));
      return 0.5 + 0.5 * (u * -0.55 + nz * 0.56 + 0.15) * 1.25;
    }, { z: 1 });
    // Reflective bands (follow the cone's taper).
    for (const [y0, y1] of [[14, 19], [24, 28]]) {
      const h0 = 9 - (7.6 * (y0 - 2.5)) / (H - 2.5);
      const h1 = 9 - (7.6 * (y1 - 2.5)) / (H - 2.5);
      c.poly([cx - h0, y0, cx + h0, y0, cx + h1, y1, cx - h1, y1], band, (x, y) => {
        const half = 9 - (7.6 * (y - 2.5)) / (H - 2.5);
        const u = (x - cx) / half;
        return 0.62 - u * 0.3;
      }, { z: 2 });
    }
  },
};

export const STREET_PROPS = [HYDRANT, TRASH_CAN, CONE];
