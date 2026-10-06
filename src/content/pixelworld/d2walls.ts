import { PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { hash2 } from './surfaces';
import { rivet, shiftW } from './d2kit';

/**
 * RESEARCH LABS · the big wall fields, given a design instead of a scatter:
 * the lobby's rusticated sandstone ashlar with pilasters on the column lines
 * and water stains run down from the skylight; the Holding Hall's
 * board-formed concrete with form-tie holes on a grid and rust weeping from
 * them, drip stains under the catwalks, a cable tray and conduit run, a
 * faded hazard band. Features are 2+ texels (no hairlines, no speckle).
 */

/**
 * Rusticated sandstone ashlar (world; v from the floor, NEUTRAL round the
 * lobby's render colour): 1 × 0.5 m blocks in bond, deep 2-texel V-joints
 * (dark top / left, lit lower lip), each block its own tone and a few chisel
 * strokes, the odd spalled corner. 64 × 32.
 */
export function lobbyAshlarTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2ashlarwall',
    64,
    32,
    (c, k) => {
      const s = k.ramp(0xd8d0c4, { light: 0.45, sat: 0.6 });
      for (let y = 0; y < 32; y++) {
        const course = y >> 4;
        const off = course ? 16 : 0;
        for (let x = 0; x < 64; x++) {
          const lx = (x + off) & 31;
          const ly = y & 15;
          const bid = ((x + off) >> 5) + course * 5;
          let tt = 3 + (hash2(bid, 1, 7) - 0.5) * 0.6;
          if (lx < 2 || ly < 2) tt = 1.5;
          else if (ly === 15 || lx === 31) tt += 0.75;
          else if (ly === 2 || lx === 2) tt -= 0.5;
          c.set(x, y, s, tt);
        }
      }
      // Chisel strokes (2-texel dashes) and a spalled corner.
      for (let i = 0; i < 12; i++) {
        const x = k.rng.int(4, 58);
        const y = k.rng.int(4, 28);
        if ((y & 15) < 3) continue;
        c.shade(x, y, 2, 1, -0.5);
      }
      c.shade(29, 12, 3, 2, -0.75);
      c.shade(29, 14, 3, 1, 0.75);
    },
    { wrap: true },
  );
  t.neutral = 0xd8d0c4;
  return t;
}

/**
 * A fluted pilaster on the lobby's upper walls (world, v from the floor, 1 m
 * wide): a lit left arris, four 2-texel flutes, a shaded right return, a
 * moulded base course every 4 m (it is laid from the balcony to the frieze).
 * 32 × 32.
 */
export function pilasterTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2pilaster',
    32,
    32,
    (c, k) => {
      const s = k.ramp(0xd8d0c4, { light: 0.45, sat: 0.6 });
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          let tt = 3.25;
          if (x < 2) tt = 4.25;
          else if (x > 28) tt = 1.75;
          else if (x >= 6 && x <= 25 && (x - 6) % 5 < 2) tt = (x - 6) % 5 === 0 ? 2 : 2.5;
          c.set(x, y, s, tt);
        }
      }
    },
    { wrap: true },
  );
  t.neutral = 0xd8d0c4;
  return t;
}

/**
 * Water run down a wall from a leaking skylight / gutter (cut out, 1 × 3 m): a
 * damp patch at the top, two or three 2-texel streaks with tide marks, a
 * mineral bloom at their ends. Darkens what it lies on. 32 × 96.
 */
export function waterStreakTile(atlas: PwAtlas, v = 0): PwTile {
  return atlas.tile(`d2waterstreak|${v % 2}`, 32, 96, (c, k) => {
    const damp = k.ramp(0x3a3428, { light: 0.4, sat: 0.6 });
    const bloom = k.ramp(0xd8d4c4, { light: 0.4, sat: 0.4 });
    // Damp patch at the top (2×2 clumps thinning downward).
    for (let y = 0; y < 18; y += 2) {
      for (let x = 2; x < 30; x += 2) {
        const d = Math.abs(x - 16) / 14 + y / 22;
        if (hash2((x >> 1) + v * 17, y >> 1, 5) < 0.85 - d) c.rect(x, y, 2, 2, damp, 2.25);
      }
    }
    // Streaks.
    const xs = v % 2 ? [8, 15, 23] : [10, 19];
    xs.forEach((x0, i) => {
      const len = 50 + ((i * 23 + v * 11) % 40);
      let x = x0;
      for (let y = 10; y < 10 + len && y < 94; y++) {
        if (hash2(y >> 3, i, 7) > 0.8) x += hash2(y, i, 9) > 0.5 ? 1 : -1;
        c.rect(x, y, 2, 1, damp, (y - 10) % 18 === 17 ? 1.25 : 2);
      }
      // Mineral bloom where it dried.
      const end = Math.min(93, 10 + len);
      c.rect(x - 1, end - 1, 4, 2, bloom, 3);
    });
  });
}

/**
 * The Holding Hall's board-formed concrete (world, 4 m): 0.5 m board courses
 * (a 2-texel step at each joint), pour lifts, form-tie holes on a 0.5 × 1 m
 * grid (dark 2×2 sockets with a lit lower lip) — a few weeping rust 2-texel
 * runs — and the odd honeycombed patch. NEUTRAL. 128 × 128.
 */
export function hallWallTile(atlas: PwAtlas): PwTile {
  const t = atlas.tile(
    'd2hallwall',
    128,
    128,
    (c, k) => {
      const m = k.ramp(0xd0d0d0, { light: 0.45, sat: 0.5 });
      const rust = k.ramp(0x8a4a24, { light: 0.45 });
      for (let y = 0; y < 128; y++) {
        const board = y >> 4;
        for (let x = 0; x < 128; x++) {
          let tt = 3 + (hash2(board, x >> 6, 3) - 0.5) * 0.5;
          const ly = y & 15;
          if (ly < 2) tt -= 0.5;
          if (y === 63 || y === 64) tt = 1.75;
          c.set(x, y, m, tt);
        }
      }
      // Tie holes on the grid; some weep rust.
      for (let gy = 8; gy < 128; gy += 32) {
        for (let gx = 8; gx < 128; gx += 16) {
          c.rect(gx, gy, 2, 2, m, 1);
          c.rect(gx, gy + 2, 2, 1, m, 3.75);
          if (hash2(gx, gy, 5) > 0.72) {
            const len = 6 + Math.floor(hash2(gx, gy, 6) * 18);
            for (let j = 3; j < len; j++) c.rect(gx, gy + j, 2, 1, rust, j > len - 3 ? 2 : 2.75);
          }
        }
      }
      // A honeycombed patch (aggregate showing) and a grout repair.
      for (let i = 0; i < 10; i++) c.rect(90 + (i % 4) * 3, 98 + Math.floor(i / 4) * 3, 2, 2, m, 1.5);
      c.rect(30, 40, 14, 8, m, 3.5);
      c.rect(30, 48, 14, 1, m, 2);
      void shiftW;
    },
    { wrap: true },
  );
  t.neutral = 0xd0d0d0;
  return t;
}

/**
 * Rust and drip stains under a catwalk (cut out, 2 × 2 m): a band of rust
 * blooms at the top where the grating drips, runs of 2-texel streaks fading
 * down the wall. 64 × 64.
 */
export function dripStainTile(atlas: PwAtlas, v = 0): PwTile {
  return atlas.tile(`d2dripstain|${v % 2}`, 64, 64, (c, k) => {
    const rust = k.ramp(0x6a3a1e, { light: 0.4 });
    const grime = k.ramp(0x2a2a2e, { light: 0.4 });
    for (let x = 0; x < 64; x += 2) {
      const h = 3 + Math.floor(hash2((x >> 1) + v * 7, 1, 3) * 5);
      for (let y = 0; y < h; y += 1) c.rect(x, y, 2, 1, y < 2 ? grime : rust, 2);
      if (hash2(x >> 1, v, 9) > 0.55) {
        const len = 12 + Math.floor(hash2(x, v, 11) * 46);
        for (let y = h; y < Math.min(64, h + len); y++) if (hash2(x, y >> 2, 13) > (y - h) / len - 0.2) c.rect(x, y, 2, 1, rust, (y - h) > len * 0.7 ? 1.75 : 2.25);
      }
    }
  });
}

/**
 * A cable tray along the hall walls with a conduit run under it (cut out,
 * world: 2 × 0.5 m repeat): a ladder tray side rail (lit top lip, rungs),
 * bundled cables (red, black, yellow) bulging over it and sagging between the
 * brackets, a grey conduit with clamps and a junction box. 64 × 16.
 */
export function cableTrayTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2cabletray',
    64,
    16,
    (c, k) => {
      const steel = k.ramp(0x7a8088, { light: 0.5, sat: 0.4 });
      const conduit = k.ramp(0x8a8e94, { light: 0.45, sat: 0.4 });
      const cols = [k.ramp(0xa82a20, { light: 0.45 }), k.ramp(0x1e1e22, { light: 0.4 }), k.ramp(0xd0a020, { light: 0.45 })];
      // Cables bulging over the tray (sag between brackets every 64).
      for (let x = 0; x < 64; x++) {
        const sag = Math.round(Math.sin((x / 64) * Math.PI) * 2);
        for (let i = 0; i < 3; i++) {
          const y = 1 + i + sag;
          c.set(x, y, cols[i], i === 0 ? 3.5 : 3);
        }
      }
      // Tray side rail with a lit lip, rung ends.
      for (let x = 0; x < 64; x++) {
        c.set(x, 5, steel, 4);
        c.set(x, 6, steel, 3);
        c.set(x, 7, steel, 1.75);
      }
      for (let x = 2; x < 64; x += 8) c.set(x, 6, steel, 1.5);
      // Bracket down to the conduit, the conduit with a clamp, a junction box.
      for (let y = 5; y < 15; y++) c.rect(0, y, 2, 1, steel, y === 5 ? 4 : 2.5);
      for (let x = 0; x < 64; x++) {
        c.set(x, 11, conduit, 4);
        c.set(x, 12, conduit, 3);
        c.set(x, 13, conduit, 1.75);
      }
      c.rect(30, 10, 2, 5, steel, 3.5);
      c.rect(44, 9, 8, 7, conduit, 3);
      c.frame(44, 9, 8, 7, conduit, 2);
      rivet(c, 47, 11, conduit, 3);
      c.set(48, 13, k.ramp(0x60ff80, { light: 0.6 }), 4.5, PWF.GLOW);
    },
    { wrap: true },
  );
}

/** A faded hazard band painted round the hall (world, 0.5 m): worn diagonal stripes, paint flaked away in clumps showing the concrete. 32 × 16. */
export function fadedHazardTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2fadedhazard',
    32,
    16,
    (c, k) => {
      const yel = k.ramp(0xb89a30, { light: 0.4, sat: 0.8 });
      const blk = k.ramp(0x2a2a2e, { light: 0.4 });
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 32; x++) {
          if (y < 2 || y > 13) {
            c.set(x, y, yel, y === 0 || y === 15 ? 2.25 : 2.75);
            continue;
          }
          c.set(x, y, Math.floor((x + y) / 8) % 2 ? blk : yel, 2.75);
        }
      }
      // Flaked clumps: cut out (the concrete shows through).
      for (let i = 0; i < 9; i++) {
        const x = k.rng.int(0, 30) & ~1;
        const y = k.rng.int(0, 14) & ~1;
        c.rect(x, y, 2 + (i % 2) * 2, 2, 0, 0);
      }
    },
    { wrap: true },
  );
}

/**
 * A dead-end doorway's depth, painted (fit on the dark box behind a side door):
 * a corridor receding to a vanishing point — walls stepping darker as they go,
 * a ceiling pipe, one caged lamp halfway with its pool on the floor, a far door
 * with a faint green EXIT glow. Everything dim: it is a gap, not a room. 64 × 80.
 */
export function dimCorridorTile(atlas: PwAtlas, v = 0): PwTile {
  return atlas.tile(`d2dimcorr|${v % 2}`, 64, 80, (c, k) => {
    const wall = k.ramp(v % 2 ? 0x3a3e44 : 0x44403a, { light: 0.4, sat: 0.5 });
    const floor = k.ramp(0x2e2c2a, { light: 0.4, sat: 0.5 });
    const lamp = k.ramp(0xffe0a8, { light: 0.6 });
    const exit = k.ramp(0x40ff80, { light: 0.6 });
    const vx = 32;
    const vy = 36;
    // Far door rectangle (the vanishing face).
    const fw = 10;
    const fh = 16;
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 64; x++) {
        const dx = x + 0.5 - vx;
        const dy = y + 0.5 - vy;
        // Which plane: floor (below), ceiling (above), walls (sides), by the steeper ratio.
        const inFar = Math.abs(dx) < fw / 2 && dy > -fh / 2 && dy < fh / 2;
        if (inFar) {
          c.set(x, y, wall, 0.75);
          continue;
        }
        const rx = Math.abs(dx) / 32;
        const ry = dy > 0 ? dy / 44 : -dy / 36;
        // Depth 0 (near, at the frame) … 1 (far): rings stepping darker.
        const depth = 1 - Math.max(rx, ry);
        const t = 2.25 - depth * 1.5;
        if (ry >= rx) c.set(x, y, dy > 0 ? floor : wall, Math.max(0.5, dy > 0 ? t - 0.25 : t - 0.5));
        else c.set(x, y, wall, Math.max(0.5, t));
        // Joint lines where the planes meet the ring steps.
        if (Math.abs(rx - ry) < 0.02) c.set(x, y, wall, 0.5);
      }
    }
    // A pipe along the ceiling's left, converging.
    for (let x = 0; x < vx - 6; x++) {
      const y = Math.round(4 + (x / (vx - 6)) * (vy - 8 - 4) * 0.9);
      c.set(x, y, wall, 2.75);
      c.set(x, y + 1, wall, 1.25);
    }
    // The caged lamp halfway, its pool on the floor.
    c.rect(vx - 2, 20, 4, 2, lamp, 4.5, PWF.GLOW);
    c.set(vx - 3, 21, lamp, 2.5, PWF.GLOW);
    c.set(vx + 2, 21, lamp, 2.5, PWF.GLOW);
    c.ellipseShade(vx, 58, 14, 5, (d) => (d < 0.55 ? 1 : d < 0.85 ? 0.5 : 0));
    // EXIT glow over the far door.
    c.rect(vx - 3, vy - fh / 2 - 3, 6, 2, exit, 3.5, PWF.GLOW);
  });
}
