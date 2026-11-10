import type { PwAtlas, PwKit, PwTile } from './atlas';
import type { PwCanvas } from './canvas';
import { pwBlob, pwFloorGlare, pwRaggedEdge, pwVinylTiles } from './brush2i';
import { darken, hash2 } from './surfaces';

/**
 * ST. MERCY HOSPITAL (z2), PIXEL WORLD 2 — the FLOORS of the clinical ground floor: corridor A's
 * vinyl at 96 texels a metre, the rooms' at 64 (tiles in the ER and the nurse station, welded
 * sheet in the ward), and the lights lying in their polish.
 *
 * A floor here is a picture of a floor, not a fill with marks on it: every half-metre tile is
 * drawn (pwVinylTiles: grain, joint, lit edge, dirt, a broken corner), the wear is laid as value
 * structure a metre wide (a lane polished by forty years of trolleys, in whole tone steps with
 * edges broken into dashes), and what happened last week lies on top as decals laid by the stage.
 * The field is painted at tone 2 of its ramp: the lane, the polish and the lights have two steps
 * above it to climb, and the floor stays under the figures that stand on it.
 */

/** The vinyl's colour (its ramp's base step; the field is painted one step under it). */
export const Z2_FLOOR = 0x66746c;
const SOFT = { dark: 0.5, light: 0.4, sat: 1 };

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The colour a room's vinyl is painted round, for a floor material of colour `hex` (a step over it: the field is painted at tone 2). */
export const z2RoomVinyl = (hex: number) => mix(hex, 0xffffff, 0.035);

/** The ramps of a vinyl floor of colour `hex`: the field, its two other batches, the adhesive under it, rubber. */
function vinyl(k: PwKit, hex: number) {
  return {
    F: k.ramp(hex, SOFT),
    F2: k.ramp(darken(hex, 0.93), SOFT),
    F3: k.ramp(mix(hex, 0x8a8672, 0.22), SOFT),
    bed: k.ramp(0x4a4238, { dark: 0.55, light: 0.3 }),
    rubber: k.ramp(0x30343a, { dark: 0.6, light: 0.3 }),
  };
}

/** Heel and trolley scuffs: short curved dark marks in loose groups (each its own little form, never a speck). */
function scuffs(c: PwCanvas, rng: PwKit['rng'], groups: number, per: number, ramp: number) {
  const W = c.w;
  const H = c.h;
  for (let g = 0; g < groups; g++) {
    const gx = rng.int(0, W - 1);
    const gy = rng.int(0, H - 1);
    for (let i = 0; i < per; i++) {
      const x = gx + Math.round(rng.spread(26));
      const y = gy + Math.round(rng.spread(18));
      const len = rng.int(5, 12);
      const bend = rng.chance(0.5) ? 1 : -1;
      const steep = rng.chance(0.3);
      for (let q = 0; q < len; q++) {
        const o = Math.round((bend * (q - len / 2) * (q - len / 2)) / (len * 1.5));
        const px = (((steep ? x + o : x + q) % W) + W) % W;
        const py = (((steep ? y + q : y + o) % H) + H) % H;
        // (Rubber where the mark is fresh, a rubbed step where it is old.)
        if (q > 1 && q < len - 2 && i % 3 === 0) c.set(px, py, ramp, 2);
        else c.shift(px, py, -1);
      }
    }
  }
}

/** A quarter-turn of wheel marks (a bed or a trolley swung round): two concentric dark arcs a wheelbase apart, broken where the wheel skipped. */
function wheelArc(c: PwCanvas, cx: number, cy: number, r: number, a0: number, turn: number, gap: number, seed: number, ramp = 0) {
  const W = c.w;
  const H = c.h;
  for (const rr of [r, r + gap]) {
    for (let t = 0; t < turn; t += 0.7 / rr) {
      if (hash2(Math.floor(t * 7), Math.round(rr), seed) > 0.82) continue;
      const x = (((Math.round(cx + Math.cos(a0 + t) * rr) % W) + W) % W);
      const y = (((Math.round(cy + Math.sin(a0 + t) * rr) % H) + H) % H);
      if (ramp && hash2(Math.floor(t * 23), Math.round(rr), seed + 1) > 0.5) c.set(x, y, ramp, 2);
      else c.shift(x, y, -1);
    }
  }
}

/**
 * Corridor A's floor: 384 × 384 at 96 texels a metre (4 m, wrapped), mapped by world position.
 * The corridor's centre line falls on the tile's top / bottom edge and its two walls 14 rows
 * either side of the middle row, so the rows are designed ACROSS the corridor:
 *
 *  - the lane (rows nearest the edge): forty years of trolleys polished the vinyl in two whole
 *    steps — a band 1.3 m wide, a core 60 cm wide — whose edges break into dashes; in the core the
 *    polish is worn back to matt in long shaped patches, and two pairs of gurney tracks wander
 *    down it 55 cm apart;
 *  - the field either side: half-metre tiles, wheel arcs where beds were swung into rooms, scuffs;
 *  - the border both walls' feet show (the 29 rows round the middle, read from either side: it
 *    is its own mirror image): a dark line, a strip of floor with the mop's dirt in it, a pale
 *    inlay line and a dark 11 cm stripe.
 *
 * Nothing big repeats ALONG the corridor; its history (the trail, spills, papers, the lamps in
 * the polish) is laid by the stage.
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
      const { F, F2, F3, bed, rubber } = vinyl(k, Z2_FLOOR);
      const stripe = k.ramp(0x46544e, SOFT);
      const inlay = k.ramp(0x93a096, SOFT);
      pwVinylTiles(c, { tp: 48, face: F, batches: [F2, F3], bed, tone: 2, seed: 61 });

      // ── The lane: two polished steps, their edges in dashes (each side of the centre line has its own) ──
      const CORE = 27;
      const BAND = 60;
      const e = [0, 1, 2, 3].map((i) => pwRaggedEdge(W, 300 + i, 2));
      for (let y = 0; y < H; y++) {
        const top = y < H / 2;
        const d = top ? y : H - 1 - y;
        if (d > BAND + 2) continue;
        for (let x = 0; x < W; x++) {
          const up = d < CORE + e[top ? 0 : 1][x] ? 2 : d < BAND + e[top ? 2 : 3][x] ? 1 : 0;
          if (up) c.shift(x, y, up);
        }
      }
      // …worn back to matt down the middle: long lobed patches a step down (the polish is gone where the wheels run).
      for (let i = 0; i < 9; i++) {
        const cx = rng.int(0, W - 1);
        const cy = rng.int(-CORE + 6, CORE - 6);
        const rx = rng.int(22, 60);
        const ry = rng.int(3, 7);
        const p1 = rng.next() * 6.28;
        const p2 = rng.next() * 6.28;
        for (let y = -ry * 2; y <= ry * 2; y++) {
          for (let x = -rx * 2; x <= rx * 2; x++) {
            if (!pwBlob(x, y, rx, ry, p1, p2, 0.3)) continue;
            // (Its ends fray into dashes along the corridor.)
            if (Math.abs(x) > rx * 0.7 && hash2((cx + x) >> 2, cy + y, 311) > 0.5) continue;
            c.shift((((cx + x) % W) + W) % W, (((cy + y) % H) + H) % H, -1);
          }
        }
      }
      // Gurney tracks: two pairs of dark lines 55 cm apart wandering down the lane together, lifting off here and there.
      for (const [off, ph, seed] of [[-5, 0.4, 320], [9, 2.3, 321]]) {
        for (let x = 0; x < W; x++) {
          const a = (x / W) * Math.PI * 2;
          const wob = Math.round(Math.sin(a * 2 + ph) * 4 + Math.sin(a * 5 + ph * 2) * 1.6);
          if (hash2(x >> 5, 0, seed) > 0.84) continue;
          for (const s of [-26, 26]) {
            const y = (((off + s + wob) % H) + H) % H;
            c.shift(x, y, -1);
            if (hash2(x >> 3, s, seed + 1) > 0.35) c.shift(x, (y + 1) % H, -1);
          }
        }
      }

      // ── The field: beds swung into rooms, trolleys parked against the wall ──
      wheelArc(c, 70, 150, 34, 3.4, 1.5, 9, 330, rubber);
      wheelArc(c, 250, H - 140, 28, 0.3, 1.4, 8, 331, rubber);
      wheelArc(c, 330, 120, 40, 2.2, 1.1, 9, 332);
      scuffs(c, rng, 7, 5, rubber);
      // A bed frame dragged along the wall: two long scratches with a lit edge under them.
      for (const [y, x, len] of [[118, 30, 150], [H - 100, 210, 120]]) {
        for (let q = 0; q < len; q++) {
          if (hash2(q >> 3, y, 333) > 0.78) continue;
          c.shift((x + q) % W, y, -1);
          c.shift((x + q) % W, y + 1, 1);
        }
      }

      // ── The border at the walls' feet: rows 178…206, a mirror image about the middle row ──
      const B0 = 178;
      for (let i = 0; i <= 14; i++) {
        for (const y of i === 14 ? [B0 + 14] : [B0 + i, B0 + 28 - i]) {
          for (let x = 0; x < W; x++) {
            if (i < 2) c.set(x, y, stripe, i === 0 ? 1 : 2);
            else if (i < 7) {
              // The strip of floor between the lines: the mop leaves its dirt against the outer one.
              const run = hash2((x + i * 5) >> 2, y, 340);
              if (i === 2 ? run > 0.25 : i === 3 ? run > 0.55 : i === 4 && run > 0.85) c.shift(x, y, -1);
            } else if (i < 9) c.set(x, y, inlay, i === 7 ? 3 : hash2(x >> 3, y, 341) > 0.3 ? 4 : 3);
            else {
              // The stripe: lengths of a metre, a lit upper edge, scuffed pale where wheels rub it.
              const jx = x % 96;
              let t = i === 9 ? 2 : 3;
              if (jx === 0) t = 1;
              else if (jx === 1 && i > 9) t = 4;
              c.set(x, y, stripe, t);
            }
          }
        }
      }
      for (let i = 0; i < 20; i++) {
        const x = rng.int(0, W - 1);
        const y = B0 + rng.int(9, 19);
        const len = rng.int(6, 22);
        for (let q = 0; q < len; q++) c.shift((x + q) % W, y, rng.chance(0.75) ? 1 : 0, stripe);
      }
    },
    { wrap: true, density: 96 },
  );
}

/**
 * The rooms' floors, 256 × 256 at 64 texels a metre (4 m, wrapped). `sheet` false (ER, nurse
 * station): half-metre vinyl tiles as in the corridor, wheel arcs, scuffs — nothing big, a room
 * shows the tile five times each way. `sheet` true (ward 3): marbled sheet vinyl welded every 2 m,
 * the aisle down its middle polished a step up with a broken edge (the rail's line through the
 * ward falls on the tile's top / bottom edge), and the scars of bed wheels arcing out of the bays
 * into it.
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
      // (One step lighter than the material's colour: the field is painted at tone 2.)
      const { F, F2, F3, bed, rubber } = vinyl(k, z2RoomVinyl(hex));
      if (!sheet) {
        pwVinylTiles(c, { tp: 32, face: F, batches: [F2, F3], bed, tone: 2, seed: 72 });
        wheelArc(c, 60, 70, 44, 0.4, 1.5, 6, 350, rubber);
        wheelArc(c, 190, 170, 30, 3.3, 1.3, 6, 351);
        wheelArc(c, 130, 230, 52, 4.6, 1.0, 6, 352);
        scuffs(c, rng, 7, 4, rubber);
        // A polished patch here and there where chairs stood and feet shuffled: a lobed shape a step up, its edge in dashes.
        for (let i = 0; i < 4; i++) {
          const cx = rng.int(0, W - 1);
          const cy = rng.int(0, H - 1);
          const rx = rng.int(14, 30);
          const ry = rng.int(8, 16);
          const p1 = rng.next() * 6.28;
          const p2 = rng.next() * 6.28;
          for (let y = -ry * 2; y <= ry * 2; y++) {
            for (let x = -rx * 2; x <= rx * 2; x++) {
              if (!pwBlob(x, y, rx, ry, p1, p2, 0.3)) continue;
              const u = x / rx;
              const v = y / ry;
              if (u * u + v * v > 0.6 && hash2((cx + x) >> 2, cy + y, 353) > 0.5) continue;
              c.shift((((cx + x) % W) + W) % W, (((cy + y) % H) + H) % H, 1);
            }
          }
        }
        return;
      }
      c.rect(0, 0, W, H, F, 2);
      // The sheet's marbling: long streaks drawn along the roll (the aisle), in drifts — a step either side.
      for (let i = 0; i < 150; i++) {
        const drift = i % 10;
        const bx = Math.floor(hash2(drift, 1, 360) * W);
        const by = Math.floor(hash2(drift, 2, 360) * H);
        const x = bx + Math.round(rng.spread(60));
        const y = by + Math.round(rng.spread(34));
        const len = rng.int(8, 30);
        const dt = rng.chance(0.55) ? -1 : 1;
        const lean = rng.chance(0.5) ? 1 : -1;
        const two = rng.chance(0.4);
        for (let q = 0; q < len; q++) {
          const yy = y + (q > len * 0.55 ? lean : 0);
          c.set((((x + q) % W) + W) % W, ((yy % H) + H) % H, F, 2 + dt);
          if (two && q > 2 && q < len - 3) c.set((((x + q) % W) + W) % W, (((yy + 1) % H) + H) % H, F, 2 + dt);
        }
      }
      // Welded seams 2 m apart (a metre either side of the aisle's middle): a dark line, the raised bead lit beside it.
      for (const y of [64, 192]) {
        for (let x = 0; x < W; x++) {
          c.set(x, y, F, 1);
          if (hash2(x >> 3, y, 361) > 0.18) c.set(x, y + 1, F, 3);
        }
      }
      // The aisle: polished a step up 70 cm either side of the rail's line, the edge broken into dashes.
      const e = [pwRaggedEdge(W, 362, 2), pwRaggedEdge(W, 363, 2)];
      for (let y = 0; y < H; y++) {
        const top = y < H / 2;
        const d = top ? y : H - 1 - y;
        if (d > 48) continue;
        for (let x = 0; x < W; x++) if (d < 44 + e[top ? 0 : 1][x]) c.shift(x, y, 1);
      }
      // Bed wheels: pairs of arcs swinging out of the bays into the aisle, one bay either side per repeat.
      wheelArc(c, 40, 128, 70, -1.45, 1.25, 8, 364, rubber);
      wheelArc(c, 150, 128, 64, 1.75, 1.2, 8, 365, rubber);
      wheelArc(c, 215, 128, 80, -1.5, 0.9, 8, 366);
      scuffs(c, rng, 6, 4, rubber);
    },
    { wrap: true, density: 64 },
  );
}

/**
 * A ceiling light lying in the floor's polish (a cut-out decal the stage lays under each lit
 * fitting, on the floor's own texel grid): at 96 texels a metre in the corridor a streak 1.7 m
 * long toward the eye and half a metre across, at 64 in the rooms a shorter pool. Painted in the
 * floor's own ramp, so it is the floor a step or two up — never a glow.
 */
export function z2FloorGlare(atlas: PwAtlas, hex: number, density: number, variant = 0): PwTile {
  const corridor = density >= 96;
  return atlas.tile(
    `z2clinic|glare|${hex.toString(16)}|${density}|${variant}`,
    corridor ? 168 : 112,
    corridor ? 46 : 44,
    (c, k) => {
      const F = k.ramp(hex, SOFT);
      pwFloorGlare(c, F, corridor ? 5 : 4, 370 + variant * 7 + density, corridor ? 0.32 : 0.36);
    },
    { density },
  );
}

/** The floors and their decals at the sizes the stage uses (look-dev dumps, benches). */
export function z2ClinicFloorTiles(atlas: PwAtlas): PwTile[] {
  return [
    z2CorridorFloor(atlas),
    z2RoomFloor(atlas, 0x5d6a63, false),
    z2RoomFloor(atlas, 0x5a685e, true),
    z2FloorGlare(atlas, Z2_FLOOR, 96, 0),
    z2FloorGlare(atlas, Z2_FLOOR, 96, 1),
    z2FloorGlare(atlas, z2RoomVinyl(0x5d6a63), 64, 0),
  ];
}
