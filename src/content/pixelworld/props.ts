import { FF } from '../pixel/floraPaint';
import { cylTone, lathe } from '../pixel/floraProps';
import type { FloraSpecies } from '../pixel/floraSpecies';
import type { PwAtlas, PwTile } from './atlas';
import { darken, hash2 } from './surfaces';

/**
 * PixelWorld props.
 *
 * 1. SMALL ROUND PROPS → pixel billboards with the FLORA machinery
 *    (`FloraField`: one instanced draw, yaw-only camera-facing, lit like the
 *    scenery, night rim). A prop painter is a `FloraSpecies` (see the hydrant /
 *    trash can / cone in `pixel/floraProps.ts`); add one here, list it in the
 *    stage's flora atlas and give its colours as biome `extra` ramps. Billboard
 *    only what reads the same from every side of the rail: drums, cans, bags,
 *    cones, hydrants, bollards, lamp heads seen from below. Boxy props (crates,
 *    benches, news boxes, cars) keep their geometry with painted tiles.
 * 2. THIN FLAT PROPS → cut-out wrap tiles on planes (`PwBatch.rect` with a
 *    two-sided PixelWorld material: `pwMaterial(atlas, { side: DoubleSide })`):
 *    chain-link and picket fences, railings, guard rails, barbed wire — the
 *    see-through structure is painted, the plane is one quad.
 */

/** Oil drum (decorative, NOT the shootable explosive barrel): ribbed steel, rust, a hazard label. Biome extra: `drum`. */
export const OIL_DRUM: FloraSpecies = {
  key: 'oilDrum',
  w: 32,
  h: 48,
  heightM: 0.9,
  variants: 2,
  paint(c, m, _rng, v) {
    const drum = m.extra.drum ?? m.bark;
    const label = m.extra.label ?? m.flowers[0] ?? m.leafLight;
    const cx = this.w / 2;
    const H = 44;
    lathe(c, cx, 0, H, () => 12, drum, (u, y) => {
      let t = cylTone(u, 0.5, 0.25);
      // Rolling hoops (lit lip over a dark groove) at a third and two thirds.
      for (const hy of [H / 3, (2 * H) / 3]) {
        if (Math.abs(y - hy) < 0.8) t -= 0.25;
        else if (Math.abs(y - hy - 1.2) < 0.6 && u < 0.3) t += 0.25;
      }
      if (y > H - 2) t += 0.25;
      return t;
    });
    // Top rim (seen from just above) and a hazard diamond label.
    c.ellipse(cx, H, 12, 2.4, drum, { z: 2, bias: -0.1, amp: 0.4 });
    if (v === 0) c.poly([cx - 4, 22, cx, 26, cx + 4, 22, cx, 18], label, () => 0.75, { z: 3 });
    // Rust run.
    c.line(cx + 5, H - 3, cx + 5, H - 12, drum, 0.12, 4, FF.SOFT);
  },
};

/** A heap of black bin bags with knotted tops and lit creases. Biome extra: `bag`. */
export const TRASH_BAGS: FloraSpecies = {
  key: 'trashBags',
  w: 56,
  h: 32,
  heightM: 0.8,
  variants: 2,
  paint(c, m, rng, v) {
    const bag = m.extra.bag ?? m.barkDark;
    const blobs: [number, number, number, number][] = v
      ? [[16, 9, 12, 9], [34, 8, 13, 8], [25, 18, 11, 8]]
      : [[14, 8, 11, 8], [30, 9, 12, 9], [44, 7, 9, 7], [24, 17, 10, 8]];
    for (const [x, y, rx, ry] of blobs) {
      c.ellipse(x, y, rx, ry, bag, { z: y, amp: 1.2 });
      // Knot on top + a lit crease.
      c.ellipse(x + 1, y + ry, 2, 2.2, bag, { z: y + 2, bias: 0.1 });
      c.line(x - rx * 0.4, y + ry * 0.3, x + rx * 0.2, y - ry * 0.2, bag, 0.85, y + 1, FF.SOFT);
    }
    void rng;
  },
};

export const PROP_SPECIES = [OIL_DRUM, TRASH_BAGS];

const h6 = (n: number) => n.toString(16).padStart(6, '0');

/** Chain-link fence (wrap, cut out between the wires): diamond mesh, top rail, a post every 2 m. 64 × 64 (2 × 2 m). */
export function chainFenceTile(atlas: PwAtlas, o: { hex: number; rust?: number }): PwTile {
  return atlas.tile(
    `chainfence|${h6(o.hex)}|${o.rust ?? 0.3}`,
    64,
    64,
    (c, k) => {
      const w = k.ramp(o.hex, { light: 0.5, sat: 0.6 });
      const rust = k.ramp(0x8a4a24, { light: 0.4 });
      for (let y = 4; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const a = (x + y) % 6 === 0;
          const b = (x - y + 600) % 6 === 0;
          if (!a && !b) continue;
          const r = hash2(x >> 2, y >> 2, 3) < (o.rust ?? 0.3) * 0.3 ? rust : w;
          c.set(x, y, r, a && b ? 4 : a ? 3 : 2);
        }
      }
      // Top rail and a post.
      c.rect(0, 1, c.w, 3, w, 3);
      c.hline(0, 1, c.w, w, 4);
      c.hline(0, 3, c.w, w, 1);
      c.rect(0, 0, 3, c.h, w, 3);
      c.vline(0, 0, c.h, w, 4);
      c.vline(2, 0, c.h, w, 1);
    },
    { wrap: true },
  );
}

/** Iron railing (wrap, cut out): top and bottom rails, round bars with lit left sides, finials. 32 × 32 (1 × 1 m). */
export function railingTile(atlas: PwAtlas, o: { hex: number }): PwTile {
  return atlas.tile(
    `railing|${h6(o.hex)}`,
    32,
    32,
    (c, k) => {
      const r = k.ramp(o.hex, { light: 0.5, sat: 0.7 });
      for (let x = 2; x < c.w; x += 6) {
        c.vline(x, 2, 29, r, 4);
        c.vline(x + 1, 2, 29, r, 2);
        c.set(x, 1, r, 4);
        c.set(x + 1, 1, r, 3);
        c.set(x, 0, r, 3);
      }
      c.rect(0, 5, c.w, 2, r, 3);
      c.hline(0, 5, c.w, r, 4);
      c.rect(0, 27, c.w, 2, r, 3);
      c.hline(0, 28, c.w, r, 1);
    },
    { wrap: true },
  );
}

/** Weathered picket fence (wrap, cut out between pickets): pointed boards, two rails behind, peeling paint. 32 × 32. */
export function picketFenceTile(atlas: PwAtlas, o: { hex: number; wood?: number }): PwTile {
  return atlas.tile(
    `picket|${h6(o.hex)}|${h6(o.wood ?? 0x7a6a58)}`,
    32,
    32,
    (c, k) => {
      const p = k.ramp(o.hex, { light: 0.4 });
      const wd = k.ramp(o.wood ?? 0x7a6a58, { light: 0.4 });
      c.rect(0, 10, c.w, 2, wd, 2);
      c.rect(0, 24, c.w, 2, wd, 2);
      for (let x = 1; x < c.w; x += 8) {
        for (let y = 2; y < 32; y++) {
          const tip = y < 5 ? Math.abs(x + 2 - (x + 2)) + (5 - y) : 0;
          for (let j = 0; j < 5; j++) {
            if (y < 5 && (j < 5 - y - 1 || j > y + 1)) continue;
            const peel = hash2(x + j, y, 5) > 0.88;
            c.set(x + j, y, peel ? wd : p, j === 0 ? 4 : j === 4 ? 2 : 3);
          }
          void tip;
        }
      }
    },
    { wrap: true },
  );
}

/** Highway guard rail (wrap): the W-beam (lit crest, dark troughs), bolts, posts every 2 m, rust and dents. 64 × 24. */
export function guardRailTile(atlas: PwAtlas, o: { hex?: number } = {}): PwTile {
  return atlas.tile(
    `guardrail|${h6(o.hex ?? 0x9aa0a4)}`,
    64,
    24,
    (c, k) => {
      const g = k.ramp(o.hex ?? 0x9aa0a4, { light: 0.5, sat: 0.5 });
      const post = k.ramp(darken(o.hex ?? 0x9aa0a4, 0.6), { light: 0.45 });
      c.rect(0, 12, 4, 12, post, 2);
      c.vline(0, 12, 12, post, 3);
      const prof = [4, 4, 3, 2, 1, 2, 3, 4, 4, 3, 2, 1];
      for (let y = 0; y < 12; y++) c.hline(0, y + 1, c.w, g, prof[y]);
      for (let x = 30; x < 36; x += 4) c.set(x, 6, g, 0);
      c.scatter(k.rng, 0, 1, c.w, 12, 10, 0, -1, { shapes: 4 });
    },
    { wrap: true },
  );
}
