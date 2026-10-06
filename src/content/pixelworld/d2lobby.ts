import { bayer, PWF } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_5x7, FONT_BOLD, textWidth } from './font';
import { crack, hash2, smooth } from './surfaces';
import { BRACHIO, frond, moon, palmShape, PTERO, RAPTOR, REX, silhouette, TRIKE, ammonite } from './d2art';
import { bloodSmear, bloodSplat, bulletHole, clawMarks, handprint, h6, litText, plate, recordFit, rivet, scuffs, shiftW, wrapI } from './d2kit';

/**
 * RESEARCH LABS · the visitor-centre LOBBY painted as a 90s arcade backdrop:
 * a fossil-limestone floor with green-marble cabochons and brass, the park's
 * mosaic emblem, raised-panel timber wainscot, a coffered timber ceiling,
 * fluted sandstone columns, a carved balcony fascia, hanging park banners, the
 * moonlit-island mural, the WELCOME banner, framed dinosaur posters, an
 * INFORMATION desk with its enamel sign — and the night it all went wrong:
 * claw gouges, blood drags, bullet pocks, scattered brochures.
 */

// ─── Floor ───────────────────────────────────────────────────────────────────

/**
 * Fossil limestone slabs (1 m, 32 texels), a green-marble cabochon diamond in a
 * brass ring at every other joint, skylight sheen on a few slabs, shell
 * fragments and the odd ammonite, scuffs, a cracked slab. 256 × 128 (8 × 4 m).
 */
export function lobbyFloorTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2lobbyfloor',
    256,
    128,
    (c, k) => {
      const rng = k.rng;
      const A = k.ramp(0x9c8f7a, { light: 0.4, sat: 0.8 });
      const B = k.ramp(0x8a7e6c, { light: 0.4, sat: 0.8 });
      const grout = k.ramp(0x4e463e, { light: 0.4 });
      const marble = k.ramp(0x3e5a4a, { light: 0.4, sat: 0.9 });
      const brass = k.ramp(0x9a7a44, { light: 0.4 });
      const S = 32;
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const sx = Math.floor(x / S);
          const sy = Math.floor(y / S);
          const lx = x % S;
          const ly = y % S;
          const r = (sx + sy) % 2 ? B : A;
          const v = hash2(sx, sy, 3);
          let t = v < 0.3 ? 2.75 : v > 0.75 ? 3.25 : 3;
          if (lx === 0 || ly === 0) {
            c.set(x, y, grout, 2);
            continue;
          }
          if (lx === 1 || ly === 1) t += 0.75;
          else if (lx === S - 1 || ly === S - 1) t -= 0.5;
          c.set(x, y, r, t);
        }
      }
      // Stylolite veins: thin wandering darker seams across some slabs (natural stone, not noise).
      for (let i = 0; i < 9; i++) {
        const sx = rng.int(0, c.w / S - 1);
        const sy = rng.int(0, c.h / S - 1);
        let x = sx * S + 2;
        let y = sy * S + rng.int(5, S - 5);
        for (let j = 0; j < S - 4; j++) {
          c.shift(x, y, -0.75);
          if (rng.chance(0.3)) c.shift(x, y - 1, -0.5);
          x++;
          if (rng.chance(0.35)) y += rng.chance(0.5) ? 1 : -1;
          y = Math.max(sy * S + 3, Math.min(sy * S + S - 3, y));
        }
      }
      // Shell fragments: tiny lighter arcs scattered in the stone.
      for (let i = 0; i < 160; i++) {
        const x = rng.int(0, c.w - 1);
        const y = rng.int(0, c.h - 1);
        if (x % S < 2 || y % S < 2) continue;
        c.shift(x, y, 1);
        c.shift(x + 1, y, rng.chance(0.5) ? 1 : 0.5);
        if (rng.chance(0.4)) c.shift(x + 2, y + 1, 0.5);
      }
      // Two ammonites (the stone was quarried from a fossil bed).
      ammonite(c, 2 * S + 16, S + 15, 9, 1);
      ammonite(c, 6 * S + 12, 3 * S + 18, 6, 1);
      // Cabochons: a green-marble diamond in a brass ring at every other joint.
      for (let jy = 0; jy < c.h; jy += S) {
        for (let jx = 0; jx < c.w; jx += S) {
          if (((jx / S) + (jy / S)) % 2) continue;
          for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -6; dx <= 6; dx++) {
              const d = Math.abs(dx) + Math.abs(dy);
              if (d > 6) continue;
              const px = wrapI(jx + dx, c.w);
              const py = wrapI(jy + dy, c.h);
              if (d >= 5) c.set(px, py, brass, dx + dy < 0 ? 3.75 : dx + dy > 0 ? 2.5 : 3);
              else {
                const vein = Math.abs(dx - dy * 0.6 + Math.sin(dy * 1.3) * 1.2) < 0.6;
                c.set(px, py, marble, vein ? 4 : d === 4 && dx + dy < 0 ? 3.5 : d === 4 ? 2 : 3);
              }
            }
          }
        }
      }
      // Skylight sheen: soft diagonal bands of polish on a few slabs (dithered).
      for (const [sx, sy] of [[1, 0], [4, 2], [6, 1]]) {
        for (let y = 2; y < S - 1; y++) {
          for (let x = 2; x < S - 1; x++) {
            const d = (x + y) % 26;
            if ((d === 9 || d === 10 || d === 14) && bayer(x, y) < 0.7) c.shift(sx * S + x, sy * S + y, d === 14 ? 0.5 : 1);
          }
        }
      }
      // Scuffs (rubber soles) and a cracked slab with a chipped corner.
      scuffs(c, rng, 0, 0, c.w, c.h, 70, -0.75);
      crack(c, rng, 5 * S + 4, 2 * S + 6, 26, 0.6, { dt: -1.75, lip: 0.75 });
      c.cluster(3 * S + 30, 3 * S + 30, 4, grout, 1.5);
    },
    { wrap: true },
  );
}

/**
 * The park emblem as a floor mosaic (7 m round, cut out), drawn for the
 * grazing view it is always seen at: a brass rim, a ring of chunky alternating
 * gold and park-green segments (no lettering to turn to speckle), a deep green
 * field and a bold gold three-toed print with a 2-texel dark outline and a lit
 * upper-left edge — PRE-STRETCHED 1.6× along the view axis (the canvas
 * vertical), so it foreshortens back to a claw print instead of a blob. Wear in
 * whole 4-texel tesserae and one crack. 128 × 128 (laid over 7 m).
 */
export function emblemMosaic(atlas: PwAtlas): PwTile {
  return atlas.tile('d2emblem|r3', 128, 128, (c, k) => {
    const rng = k.rng;
    const gold = k.ramp(0xe0b050, { light: 0.55, sat: 1.0 });
    const green = k.ramp(0x24563a, { light: 0.45, sat: 1.0 });
    const leaf = k.ramp(0x3a8a4a, { light: 0.45, sat: 1.0 });
    const ink = k.ramp(0x2a1a10, { light: 0.4 });
    const brass = k.ramp(0xb08a40, { light: 0.55 });
    const cx = 64;
    const cy = 64;
    const R1 = 63.5;
    const R0 = 53;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d > R1) continue;
        if (d > R1 - 2.5) {
          c.set(x, y, brass, dx + dy < 0 ? 4 : 2);
          continue;
        }
        if (d > R0 + 2) {
          // 16 chunky segments, a dark joint between them.
          const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
          const seg = Math.floor(a * 16);
          const f = a * 16 - seg;
          if (f < 0.07) c.set(x, y, ink, 1.5);
          else c.set(x, y, seg % 2 ? leaf : gold, d > R1 - 4.5 ? 3.75 : d < R0 + 4 ? 2.5 : 3);
          continue;
        }
        if (d > R0) {
          c.set(x, y, brass, dx + dy < 0 ? 4 : 2);
          continue;
        }
        c.set(x, y, green, 3);
      }
    }
    // The print (in an unstretched frame, mapped 1.6× along canvas y): heel pad, three toes, claws.
    const S = 1.6;
    const P = (px: number, py: number): [number, number] => [cx + px, cy + py * S];
    const heelR = 9;
    c.ellipse(cx, cy + 16 * S, heelR, heelR * 0.9 * S, gold, 3);
    for (const ang of [-0.82, 0, 0.82]) {
      const aa = -Math.PI / 2 + ang;
      const len = ang === 0 ? 32 : 27;
      const [bx, by] = P(Math.cos(aa) * 5, 12 + Math.sin(aa) * 5);
      const [tx, ty] = P(Math.cos(aa) * len, 12 + Math.sin(aa) * len);
      const nx = -Math.sin(aa);
      const ny = Math.cos(aa) * S;
      c.poly([bx + nx * 4.5, by + ny * 4.5, tx + nx * 2.5, ty + ny * 2.5, tx - nx * 2.5, ty - ny * 2.5, bx - nx * 4.5, by - ny * 4.5], gold, 3);
      // A knuckle pad half way, the hooked claw tip.
      const [mx, my] = P(Math.cos(aa) * len * 0.55, 12 + Math.sin(aa) * len * 0.55);
      c.ellipse(mx, my, 4.5, 4.5 * S * 0.8, gold, 3);
      const [kx, ky] = P(Math.cos(aa) * (len + 9), 12 + Math.sin(aa) * (len + 9));
      c.poly([tx + nx * 3, ty + ny * 3, kx, ky, tx - nx * 3, ty - ny * 3], gold, 2.25);
    }
    // Outline (2 texels, dark) round the print, a lit upper-left inner edge (2 texels).
    const isGold = (x: number, y: number) => c.at(x, y) === gold;
    const edits: [number, number, number, number][] = [];
    for (let y = 2; y < 126; y++) {
      for (let x = 2; x < 126; x++) {
        if (isGold(x, y)) {
          if (!isGold(x - 1, y) || !isGold(x, y - 1) || !isGold(x - 2, y) || !isGold(x, y - 2)) edits.push([x, y, gold, 4.25]);
          else if (!isGold(x + 1, y) || !isGold(x, y + 1)) edits.push([x, y, gold, 2]);
          continue;
        }
        let near = false;
        for (let q = -2; q <= 2 && !near; q++) for (let r = -2; r <= 2 && !near; r++) if (Math.abs(q) + Math.abs(r) <= 2 && isGold(x + q, y + r)) near = true;
        if (near) edits.push([x, y, ink, 1.5]);
      }
    }
    for (const [x, y, r, t] of edits) c.set(x, y, r, t);
    // Wear: whole tesserae missing (4×4, darker), a crack across the field.
    for (let i = 0; i < 22; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = rng.range(8, R1 - 4);
      const x = Math.floor((cx + Math.cos(a) * r) / 4) * 4;
      const y = Math.floor((cy + Math.sin(a) * r) / 4) * 4;
      c.shade(x, y, 4, 4, -1.25);
      c.shade(x, y + 3, 4, 1, 0.5);
    }
    let x = 18;
    let y = 86;
    let ang = -0.5;
    for (let i = 0; i < 90; i++) {
      if (Math.hypot(x - cx, y - cy) < R1 - 2) {
        c.shift(Math.round(x), Math.round(y), -1.75);
        c.shift(Math.round(x) + 1, Math.round(y), -1.75);
        c.shift(Math.round(x) + 1, Math.round(y) + 1, 0.75);
      }
      ang += rng.spread(0.3);
      x += Math.cos(ang);
      y += Math.sin(ang);
    }
  });
}

// ─── Walls ───────────────────────────────────────────────────────────────────

/**
 * Raised-panel timber wainscot (world-projected from the floor: 1.3 m): a tall
 * skirting with a lit top, a bottom rail, bevelled raised panels between
 * stiles, a top rail under the dado — scuffed at kick height. 64 × 48 (2 × 1.5 m).
 */
export function wainscotTile(atlas: PwAtlas, hex = 0x6a4428): PwTile {
  return atlas.tile(
    `d2wainscot|${h6(hex)}`,
    64,
    48,
    (c, k) => {
      const rng = k.rng;
      const w = k.ramp(hex, { light: 0.45, sat: 0.95 });
      const H = 48;
      // Rows (canvas y-down; the floor is row 47). The slab ends at 1.3 m ≈ row 6.
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < 64; x++) {
          let t = 3;
          if (y >= 41) t = y === 41 ? 4.25 : y === 42 ? 3.5 : y === 47 ? 1 : 2.5; // skirting
          else if (y >= 37) t = y === 37 ? 3.75 : y === 40 ? 1.5 : 3; // bottom rail
          else if (y <= 9) t = y === 7 ? 4 : y === 9 ? 1.5 : 3; // top rail
          else {
            const lx = x % 32;
            if (lx < 4) t = lx === 0 ? 3.75 : lx === 3 ? 2 : 3; // stile
            else {
              // Raised panel: bevel ring (lit top / left, dark bottom / right), field with grain.
              const px = lx - 4;
              const py = y - 10;
              const pw = 28;
              const ph = 27;
              const e = Math.min(px, py, pw - 1 - px, ph - 1 - py);
              if (e < 0) t = 3;
              else if (e === 0) t = px === 0 || py === 0 ? 1.5 : 4;
              else if (e <= 2) t = px <= 2 || py <= 2 ? 4 : 2;
              else t = Math.abs(Math.sin((x + 7) * 0.9 + Math.sin(y * 0.2) * 1.5)) > 0.96 ? 2.25 : 3;
            }
          }
          c.set(x, y, w, t);
        }
      }
      // Kicks and scuffs on the skirting / bottom rail; a split in one panel.
      scuffs(c, rng, 0, 38, 64, 9, 18, -1);
      c.lineShade(44, 14, 45, 30, -1);
    },
    { wrap: true },
  );
}

/**
 * Coffered timber ceiling seen from below: 2 m beams in a grid, each coffer
 * stepped in twice (the inner reveals in shadow), boarded panels, a water
 * stain. 128 × 128 (4 m).
 */
export function cofferTile(atlas: PwAtlas, hex = 0x4a3a2c): PwTile {
  return atlas.tile(
    `d2coffer|${h6(hex)}`,
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const w = k.ramp(hex, { light: 0.45, sat: 0.9 });
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const lx = x % 64;
          const ly = y % 64;
          const e = Math.min(lx, ly, 63 - lx, 63 - ly);
          let t: number;
          if (e < 5) t = e === 0 ? 2 : lx < 5 || ly < 5 ? 3.5 : 3; // beam soffit
          else if (e < 8) t = lx < 8 || ly < 8 ? 1.5 : 2.5; // first step (reveal)
          else if (e < 10) t = lx < 10 || ly < 10 ? 3 : 2; // moulding
          else t = (lx - 10) % 6 === 0 ? 1.75 : 2.5; // boarded panel
          c.set(x, y, w, t);
        }
      }
      // Bolt plates at the beam crossings, a water stain, a few dark knots.
      for (const [x, y] of [[0, 0], [64, 0], [0, 64], [64, 64]]) for (const [dx, dy] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) rivet(c, wrapI(x + dx, 128), wrapI(y + dy, 128), w, 3);
      c.ellipseShade(90, 34, 13, 9, (d) => (d > 0.82 ? -1 : bayer(90, 34) < 0.5 ? -0.5 : 0));
      c.scatter(rng, 0, 0, 128, 128, 20, 0, -1, { shapes: 2 });
    },
    { wrap: true },
  );
}

/** Fluted sandstone column drums (cylinder-wrapped: 12 flutes round): concave flutes lit on the right, drum joints, chips, grime. 32 × 128. */
export function columnTile(atlas: PwAtlas, hex = 0xb0a48e): PwTile {
  return atlas.tile(
    `d2column|${h6(hex)}`,
    32,
    128,
    (c, k) => {
      const rng = k.rng;
      const s = k.ramp(hex, { light: 0.45, sat: 0.8 });
      const FL = [4, 2, 2, 2.5, 3, 3.5, 3.75, 3];
      for (let y = 0; y < 128; y++) {
        const drum = Math.floor(y / 64);
        const ly = y % 64;
        for (let x = 0; x < 32; x++) {
          let t = FL[x % 8] + (hash2(drum, Math.floor(x / 8), 3) - 0.5) * 0.4;
          if (ly === 0) t = 1;
          else if (ly === 1) t = 4;
          else if (ly === 63) t = Math.min(t, 2);
          c.set(x, y, s, t);
        }
      }
      // Chipped arrises, grime runs down the flutes, a bullet pock cluster.
      for (let i = 0; i < 16; i++) c.cluster(rng.int(0, 3) * 8, rng.int(0, 127), rng.int(0, 5), 0, -1.25);
      for (let i = 0; i < 6; i++) {
        const x = rng.int(0, 3) * 8 + 2;
        const y = rng.int(0, 127);
        const len = rng.int(10, 40);
        for (let j = 0; j < len; j++) if (bayer(x, y + j) < 0.7 - j / len / 2) shiftW(c, x, y + j, -0.5);
      }
      bulletHole(c, rng, 13, 80);
      bulletHole(c, rng, 18, 86, { cracks: false });
    },
    { wrap: true },
  );
}

/**
 * The balcony's carved timber fascia (0.8 m; world-projected, v0 at its foot):
 * a dentil course, a recessed band with a carved fern scroll, a moulded top.
 * 64 × 32 (2 m; rows 6…31 used).
 */
export function fasciaTile(atlas: PwAtlas, hex = 0x6a4428): PwTile {
  return atlas.tile(
    `d2fascia|${h6(hex)}`,
    64,
    32,
    (c, k) => {
      const w = k.ramp(hex, { light: 0.45, sat: 0.95 });
      c.rect(0, 0, 64, 32, w, 3);
      // Bottom (rows 26…31): dentils — blocks 3 wide, gaps 2, lit tops.
      for (let x = 0; x < 64; x++) {
        const lx = x % 5;
        for (let y = 26; y < 32; y++) c.set(x, y, w, lx >= 3 ? 1.25 : y === 26 ? 4 : lx === 0 ? 3.5 : lx === 2 ? 2.25 : 3);
      }
      c.hline(0, 25, 64, w, 1.5);
      // Band (rows 13…24): recessed, a carved scroll (vine with leaves).
      for (let y = 13; y < 25; y++) for (let x = 0; x < 64; x++) c.set(x, y, w, y === 13 ? 1.5 : y === 24 ? 3.75 : 2.5);
      for (let x = 0; x < 64; x++) {
        const y = Math.round(19 + Math.sin((x / 64) * Math.PI * 4) * 3);
        c.set(x, y, w, 4);
        c.set(x, y + 1, w, 1.5);
        if (x % 8 === 3) {
          const up = Math.sin((x / 64) * Math.PI * 4) < 0;
          for (let j = 1; j <= 3; j++) {
            c.set(x + j, y + (up ? -j : j) * 0.6, w, 4);
            c.set(x + j, y + (up ? -j : j) * 0.6 + 1, w, 1.75);
          }
        }
      }
      // Top moulding (rows 6…12): an ovolo (lit top rows, shadow under).
      for (let x = 0; x < 64; x++) {
        c.set(x, 6, w, 4.5);
        c.set(x, 7, w, 4);
        c.set(x, 8, w, 3.5);
        c.set(x, 11, w, 2);
        c.set(x, 12, w, 1.25);
      }
      // Bolt heads every metre.
      for (let x = 14; x < 64; x += 32) rivet(c, x, 9, w, 3);
    },
    { wrap: true },
  );
}

/** Stencilled frieze band (world, 0.75 m: the tile's lower 24 rows): ferns and three-toed tracks between painted lines on a cream band. 64 × 32. */
export function friezeTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2frieze',
    64,
    32,
    (c, k) => {
      const cream = k.ramp(0xc8b48c, { light: 0.4, sat: 0.8 });
      const terr = k.ramp(0x9a4a28, { light: 0.4 });
      const green = k.ramp(0x2a5a38, { light: 0.4 });
      const o = 8;
      c.rect(0, 0, 64, 32, cream, 3);
      c.hline(0, o, 64, terr, 3);
      c.hline(0, o + 1, 64, terr, 2);
      c.hline(0, o + 22, 64, terr, 3);
      c.hline(0, o + 23, 64, terr, 2);
      c.hline(0, o + 3, 64, green, 3);
      c.hline(0, o + 20, 64, green, 3);
      // Motif: a fern pair, then a track (three toes).
      frond(c, 6, o + 17, -1.1, 12, green, 3);
      frond(c, 12, o + 17, -2.0, 10, green, 3);
      const tx = 42;
      c.ellipse(tx, o + 15, 3, 2.5, terr, 3);
      for (const a of [-0.5, 0, 0.5]) for (let s = 0; s < 8; s++) c.set(Math.round(tx + Math.sin(a) * s), Math.round(o + 13 - Math.cos(a) * s), terr, 3);
      // Faded / flaked paint.
      c.scatter(k.rng, 0, o, 64, 24, 14, 0, 0.75, { shapes: 3 });
    },
    { wrap: true },
  );
}

// ─── Features ────────────────────────────────────────────────────────────────

/**
 * The far-wall mural (22 × 6.9 m at 16 texels a metre): moonlit night over the
 * island — dithered sky, a big moon, a smoking volcano with glowing lava, three
 * layered jungle ridges, a brachiosaur herd crossing, pterosaurs, palms in the
 * foreground, a painted timber frame. 352 × 110.
 */
export function muralTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2mural', 352, 110, (c, k) => {
    const rng = k.rng;
    const W = 352;
    const H = 110;
    const sky = k.ramp(0x2e4860, { light: 0.5, sat: 1.0 });
    const skyHi = k.ramp(0x4a6a80, { light: 0.5, sat: 0.9 });
    const moonR = k.ramp(0xf0e0b0, { light: 0.6 });
    const vol = k.ramp(0x3c3640, { light: 0.45 });
    const lava = k.ramp(0xff6a20, { light: 0.6, sat: 1.1 });
    const smoke = k.ramp(0x5a5460, { light: 0.4 });
    const far = k.ramp(0x2a4a48, { light: 0.4 });
    const mid = k.ramp(0x1c3a2c, { light: 0.4 });
    const near = k.ramp(0x10241a, { light: 0.4 });
    const frame = k.ramp(0x4a3220, { light: 0.45 });
    // Sky: dithered bands, lighter toward the horizon.
    for (let y = 0; y < H; y++) {
      const t = y / H;
      for (let x = 0; x < W; x++) {
        if (t > 0.45) c.set(x, y, skyHi, 1.5 + (t - 0.45) * 3, PWF.DITHER);
        else c.set(x, y, sky, 1.6 + t * 3.2, PWF.DITHER);
      }
    }
    // Stars.
    for (let i = 0; i < 70; i++) {
      const x = rng.int(4, W - 5);
      const y = rng.int(4, 50);
      c.set(x, y, moonR, rng.chance(0.3) ? 5 : 4);
    }
    // Moon (painted, lit by the room — not a lamp) with a halo.
    for (let y = -22; y <= 22; y++) for (let x = -22; x <= 22; x++) {
      const d = Math.hypot(x, y);
      if (d > 14 && d < 22 && bayer(70 + x, 30 + y) < (22 - d) / 14) c.set(70 + x, 30 + y, skyHi, 3.5);
    }
    c.ellipse(70, 30, 13, 13, moonR, (u, v) => (u + v < -0.7 ? 5 : u + v > 0.8 ? 3 : 4));
    for (const [dx, dy, r] of [[-4, -3, 3], [4, 2, 2.4], [-1, 6, 2], [5, -6, 1.5]]) c.ellipse(70 + dx, 30 + dy, r, r, moonR, 3);
    // Volcano: the moonlit (left) flank a step lighter, a glowing crater lip, lava runs, a smoke column.
    const vx = 228;
    c.poly([vx - 70, 92, vx - 13, 31, vx + 13, 31, vx + 74, 92], vol, 3);
    for (let y = 31; y < 92; y++) {
      for (let x = vx - 70; x < vx + 74; x++) {
        if (c.at(x, y) !== vol) continue;
        const rel = x - vx - (y - 31) * 0.15;
        if (rel > 2) c.shift(x, y, -1);
        else if (rel < -16 - (y - 31) * 0.6) c.shift(x, y, 0.5);
        // Gullies: darker streaks down the slope.
        if (Math.abs(((x - vx) / Math.max(1, y - 25)) * 9 % 3) < 0.25 && y > 40) c.shift(x, y, -0.5);
      }
    }
    for (let x = vx - 13; x <= vx + 13; x++) {
      c.set(x, 30, lava, hash2(x, 3, 1) > 0.5 ? 4 : 3, PWF.GLOW);
      if (hash2(x, 4, 1) > 0.4) c.set(x, 31, lava, 2, PWF.GLOW);
    }
    for (const [x0, sw, len] of [[-6, -0.3, 44], [3, 0.22, 52], [9, 0.5, 30]] as const) {
      let x = vx + x0;
      for (let y = 31; y < 31 + len; y++) {
        x += sw + Math.sin(y * 0.35 + x0) * 0.5;
        const t = y < 31 + len * 0.3 ? 4 : y < 31 + len * 0.7 ? 3 : 2;
        c.set(Math.round(x), y, lava, t, PWF.GLOW);
        if (y < 31 + len * 0.5) c.set(Math.round(x) + 1, y, lava, t - 1, PWF.GLOW);
      }
    }
    for (let i = 0; i < 11; i++) {
      const r = 4 + i * 1.6;
      const px = vx - 2 - i * i * 0.55;
      const py = 27 - i * 2.4;
      c.ellipse(px, py, r, r * 0.7, smoke, (u, v) => (u + v < -0.7 ? 3.5 : v > 0.55 ? 1.75 : 2.5));
      if (i < 3) for (let q = -Math.round(r); q <= r; q++) if (hash2(q, i, 7) > 0.4) c.set(Math.round(px + q), Math.round(py + r * 0.6), lava, 2, PWF.GLOW);
    }
    // Pterosaurs.
    silhouette(c, PTERO, 140, 18, 20, 8, near, { tone: 2, shade: false });
    silhouette(c, PTERO, 168, 26, 14, 6, near, { tone: 2, shade: false, flip: true });
    silhouette(c, PTERO, 300, 14, 16, 6, near, { tone: 2, shade: false });
    // Ridges: far (lit tops), mid with jungle crowns, the brachiosaur herd on the mid ridge.
    const ridge = (ramp: number, base: number, amp: number, freq: number, seed: number, crowns: boolean) => {
      for (let x = 0; x < W; x++) {
        const top = base - amp * (0.5 + 0.5 * Math.sin(x * freq + seed) * 0.7 + 0.3 * Math.sin(x * freq * 2.7 + seed * 3));
        let yTop = Math.round(top);
        if (crowns) yTop -= Math.round(Math.abs(Math.sin(x * 0.7 + seed)) * 2.5 + (hash2(x >> 2, seed, 3) > 0.7 ? 2 : 0));
        for (let y = yTop; y < H; y++) c.set(x, y, ramp, y === yTop ? 4 : y === yTop + 1 ? 3.5 : 3);
      }
    };
    ridge(far, 74, 16, 0.025, 1, false);
    silhouette(c, BRACHIO, 34, 42, 36, 26, mid, { tone: 2 });
    silhouette(c, BRACHIO, 74, 50, 26, 19, mid, { tone: 2 });
    silhouette(c, BRACHIO, 104, 55, 18, 13, mid, { tone: 2 });
    ridge(mid, 88, 10, 0.04, 4, true);
    ridge(near, 101, 6, 0.06, 7, true);
    // Foreground palms and ferns.
    palmShape(c, 18, 108, 40, near, 2, 0.18);
    palmShape(c, 300, 108, 46, near, 2, -0.2);
    palmShape(c, 324, 108, 30, near, 2, 0.15);
    for (let i = 0; i < 8; i++) frond(c, 120 + i * 22, 108, -1.6 - (i % 2) * 0.6, 12, near, 2.5);
    // A raptor on the near ridge.
    silhouette(c, RAPTOR, 168, 84, 26, 16, near, { tone: 1.5, shade: false });
    // Painted timber frame, a flaked patch and a water stain from the roof.
    for (let x = 0; x < W; x++) {
      for (const [y, t] of [[0, 4], [1, 3], [2, 2], [H - 3, 4], [H - 2, 3], [H - 1, 1.5]] as const) c.set(x, y, frame, t);
    }
    for (let y = 0; y < H; y++) for (const [x, t] of [[0, 4], [1, 3], [2, 2], [W - 3, 4], [W - 2, 3], [W - 1, 1.5]] as const) c.set(x, y, frame, t);
    for (let y = 8; y < 70; y++) if (bayer(140, y) < 0.6 - y / 140) c.shift(150 + Math.round(Math.sin(y * 0.2)), y, -0.75);
    c.scatter(rng, 3, 3, W - 6, H - 6, 40, 0, 0.75, { shapes: 3 });
  });
}

/**
 * The WELCOME banner (12.6 × 4.5 m at 24 texels a metre, cut out): the two
 * hanging ropes, a green cloth with gold hems and sagging folds, WELCOME in
 * big backlit letters at the classic letters' size with a warm glow round
 * them, TO PRIMAL ISLAND lit below, a torn corner flapping. 302 × 108.
 */
export function welcomeBannerTile(atlas: PwAtlas): PwTile {
  const W = 302;
  const Hh = 108;
  const top = 38;
  const bot = Hh;
  const scale = 5;
  const f = FONT_BOLD;
  const tw = textWidth('WELCOME', f, { scale, spacing: 1 });
  const tw2 = textWidth('TO PRIMAL ISLAND', f, { scale: 2, spacing: 1 });
  recordFit('d2welcome', 'WELCOME', W, Hh, tw, f.base * scale, 8);
  recordFit('d2welcome|sub', 'TO PRIMAL ISLAND', W, Hh, tw2, f.base * 2, 8);
  return atlas.tile('d2welcome', W, Hh, (c, k) => {
    const rng = k.rng;
    const cloth = k.ramp(0x1e5a34, { light: 0.45, sat: 1.0 });
    const gold = k.ramp(0xe0a020, { light: 0.55 });
    const rope = k.ramp(0x2a2622, { light: 0.4 });
    const letters = k.ramp(0xffc23a, { light: 0.6, sat: 1.1 });
    const sub = k.ramp(0xf0e8c8, { light: 0.5 });
    // Ropes up to the roof (x ±5.8 m at the cloth, converging a little), 2 texels thick.
    for (const s of [-1, 1]) {
      for (let y = 0; y < top; y++) {
        const x = Math.round(W / 2 + s * (139 - (top - y) * 0.18));
        c.set(x, y, rope, y % 3 === 0 ? 2 : 3.5);
        c.set(x + 1, y, rope, 1.5);
      }
    }
    // Cloth with folds (vertical light / shadow bands from the sag between the ropes), gold hems.
    for (let y = top; y < bot; y++) {
      for (let x = 0; x < W; x++) {
        const fp = (x + Math.round(Math.sin(y * 0.1) * 2)) % 50;
        const t = 3 + (fp < 3 ? -0.75 : fp < 5 ? 0.75 : 0);
        if (y < top + 4 || y > bot - 7) {
          c.set(x, y, gold, y === top || y === bot - 6 ? 4 : y === top + 3 || y === bot - 1 ? 2 : 3);
          continue;
        }
        c.set(x, y, cloth, t);
      }
    }
    // Stitching under the top hem / over the bottom hem.
    for (let x = 2; x < W; x += 4) {
      c.set(x, top + 5, gold, 2.5);
      c.set(x, bot - 8, gold, 2.5);
    }
    // Torn bottom-right corner (cut away) with a flap hanging lower.
    for (let y = bot - 18; y < bot; y++) for (let x = 272 + (bot - y); x < W; x++) c.set(x, y, 0, 0);
    c.poly([266, bot - 19, 292, bot - 19, 284, bot - 1], cloth, 2);
    c.line(266, bot - 19, 284, bot - 1, cloth, 1);
    // Ragged lower hem: a few notches.
    for (let x = 9; x < 262; x += 19 + (x % 7)) for (let j = 0; j < 3; j++) c.set(x + j, bot - 1, 0, 0);
    // Grime and a stain (before the letters).
    c.scatter(rng, 3, top + 6, W - 6, bot - top - 14, 40, 0, -1, { shapes: 4 });
    // WELCOME: backlit bold letters with a two-ring warm glow; the subline lit below.
    litText(c, 'WELCOME', Math.round((W - tw) / 2), top + 9, f, letters, { scale, spacing: 1, core: 5, halo: 2.5, rings: 2 });
    litText(c, 'TO PRIMAL ISLAND', Math.round((W - tw2) / 2), top + 9 + f.base * scale + 7, f, sub, { scale: 2, spacing: 1, core: 4.5, halo: 1.5, haloRamp: letters });
  });
}

/**
 * A hanging pillar banner (1 × 3.5 m, cut out): a brass rod with finials, the
 * cloth with stitched hems and folds, a cream roundel with a dinosaur head,
 * PRIMAL stacked below, a swallowtail end with a fringe. 32 × 112.
 */
export function pillarBannerTile(atlas: PwAtlas, variant: number): PwTile {
  const hex = variant % 2 ? 0x2a7040 : 0xd06a1c;
  return atlas.tile(`d2pbanner|${variant}`, 32, 112, (c, k) => {
    const cloth = k.ramp(hex, { light: 0.45, sat: 1.0 });
    const cream = k.ramp(0xe8d8a0, { light: 0.45 });
    const ink = k.ramp(0x2a1a10, { light: 0.4 });
    const brass = k.ramp(0xc8a24c, { light: 0.55 });
    // Rod.
    c.rect(0, 1, 32, 3, brass, 3);
    c.hline(0, 1, 32, brass, 4.5);
    c.hline(0, 3, 32, brass, 1.5);
    c.rect(0, 0, 2, 5, brass, 4);
    c.rect(30, 0, 2, 5, brass, 2);
    // Cloth.
    for (let y = 4; y < 108; y++) {
      for (let x = 3; x < 29; x++) {
        const fold = Math.sin(x * 0.55 + 1.2);
        let t = 3 + (fold > 0.8 ? 0.75 : fold < -0.85 ? -0.75 : 0);
        if (x === 4 || x === 27) t = 2; // stitched hems
        c.set(x, y, cloth, t);
      }
    }
    // Swallowtail end + fringe.
    for (let y = 96; y < 108; y++) for (let x = 3; x < 29; x++) if (Math.abs(x - 15.5) < (y - 96) * 1.1) c.set(x, y, 0, 0);
    for (let x = 3; x < 29; x++) {
      const yb = 107 - Math.max(0, Math.round(12 - Math.abs(x - 15.5) / 1.1));
      if (c.at(x, yb) === cloth && x % 2 === 0) for (let j = 1; j <= 3; j++) c.set(x, yb + j, cream, j === 3 ? 2 : 3);
    }
    // Roundel with a head.
    c.ellipse(16, 22, 11, 11, cream, (u, v) => (u + v < -0.9 ? 4 : 3));
    c.ellipse(16, 22, 11, 11, cream, 3);
    for (let a = 0; a < Math.PI * 2; a += 0.05) c.set(Math.round(16 + Math.cos(a) * 11), Math.round(22 + Math.sin(a) * 11), ink, 2);
    if (variant % 2) silhouette(c, TRIKE, 6, 16, 21, 9, ink, { tone: 2, shade: false });
    else silhouette(c, RAPTOR, 6, 15, 20, 10, ink, { tone: 2, shade: false });
    // PRIMAL stacked.
    let y = 38;
    for (const ch of 'PRIMAL') {
      const w = textWidth(ch, FONT_5x7);
      drawText(c, ch, 16 - Math.ceil(w / 2), y, FONT_5x7, cream, 4, { shadow: { ramp: cloth, tone: 1 } });
      y += 9;
    }
    c.scatter(k.rng, 4, 4, 24, 90, 8, 0, -1, { shapes: 3 });
  });
}

/**
 * An upstairs gallery doorway (1.8 × 2.4 m): timber architrave, a deep dark
 * opening with its reveals, a lit display case far inside, an EXIT sign glowing
 * over the door. 58 × 77.
 */
export function galleryDoorTile(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`d2gallery|${variant}`, 58, 77, (c, k) => {
    const wood = k.ramp(0x5a3a22, { light: 0.45 });
    const dark = k.ramp(0x14121a, { light: 0.4 });
    const caseR = k.ramp(0x6a8aa0, { light: 0.4 });
    const exit = k.ramp(0x30e060, { light: 0.6 });
    c.rect(0, 0, 58, 77, wood, 3);
    c.hline(0, 0, 58, wood, 4);
    c.vline(0, 0, 77, wood, 4);
    c.vline(57, 0, 77, wood, 1.5);
    // Opening (deep shadow), left / top reveals darker, right reveal catching a little light.
    c.rect(5, 6, 48, 71, dark, 2);
    c.rect(5, 6, 48, 3, dark, 0.5);
    c.rect(5, 6, 3, 71, dark, 1);
    c.rect(50, 9, 3, 68, dark, 3);
    // Far inside: a dim display case with a skull in it, floor line.
    if (variant % 2 === 0) {
      c.rect(20, 40, 18, 20, caseR, 1, PWF.GLOW);
      c.frame(20, 40, 18, 20, caseR, 2, PWF.GLOW);
      c.ellipse(29, 50, 5, 3, caseR, 3, PWF.GLOW);
      c.set(27, 50, caseR, 1, PWF.GLOW);
    } else {
      silhouette(c, REX, 10, 46, 38, 20, dark, { tone: 1, shade: false });
    }
    c.hline(8, 66, 42, dark, 1);
    // EXIT sign over the door.
    c.rect(19, 1, 20, 5, exit, 2, PWF.GLOW);
    drawText(c, 'EXIT', 21, 1, FONT_3x5, exit, 5, { flag: PWF.GLOW });
  });
}

/**
 * The INFORMATION desk front (8 m or 3.2 m × 1.1 m): veneered raised panels, an
 * orange enamel sign band with cream letters, a dark kick plate — gouged by
 * claws, a bloody hand smear dragged down it, bullet pocks. 256 / 96 × 32.
 */
export function deskFrontTile(atlas: PwAtlas, long: boolean): PwTile {
  const W = long ? 256 : 96;
  return atlas.tile(`d2desk|${long ? 1 : 0}`, W, 32, (c, k) => {
    const rng = k.rng;
    const wood = k.ramp(0x6a4428, { light: 0.45, sat: 0.95 });
    const band = k.ramp(0xc87a1a, { light: 0.5, sat: 1.0 });
    const cream = k.ramp(0xf0e0b0, { light: 0.45 });
    const kick = k.ramp(0x2a2420, { light: 0.4 });
    c.rect(0, 0, W, 32, wood, 3);
    // Top lip (under the terrazzo), kick plate.
    c.hline(0, 0, W, wood, 1.5);
    c.hline(0, 1, W, wood, 4);
    c.rect(0, 28, W, 4, kick, 3);
    c.hline(0, 28, W, kick, 4);
    // Raised panels.
    for (let x = 4; x + 28 < W; x += 32) {
      c.rect(x, 4, 28, 22, wood, 3);
      c.bevel(x, 4, 28, 22, true, 1, 1.25, 2);
      for (let y = 7; y < 24; y += 4) c.lineShade(x + 3, y, x + 24, y + 1, -0.5);
    }
    if (long) {
      // The enamel band across the middle panels.
      const bx = 52;
      const bw = W - 104;
      plate(c, bx, 8, bw, 14, band, { tone: 3 });
      const tw = textWidth('INFORMATION', FONT_BOLD, { scale: 1, spacing: 2 });
      drawText(c, 'INFORMATION', bx + Math.round((bw - tw) / 2), 11, FONT_BOLD, cream, 4, { spacing: 2, shadow: { ramp: band, tone: 1 } });
      for (const x of [bx + 2, bx + bw - 4]) rivet(c, x, 14, band, 3);
      // A dragged bloody hand smear down the band, claw gouges on the left panels.
      handprint(c, k, 176, 8);
      bloodSmear(c, k, 179, 16, 184, 29, 2.2, { wrap: false });
      clawMarks(c, 20, 8, 22, 1.1, { n: 4, gap: 3, depth: 2, wrap: false });
      bulletHole(c, rng, 226, 18);
      bulletHole(c, rng, 236, 12, { cracks: false });
    } else {
      clawMarks(c, 60, 10, 18, 0.9, { n: 3, gap: 3, depth: 2, wrap: false });
    }
    scuffs(c, rng, 0, 24, W, 7, Math.round(W / 6), -1);
  });
}

/** A framed park poster (1.6 × 2.1 m: frame + print): a dinosaur illustration on a coloured field, title band, park logo. 52 × 68. */
export function posterTile(atlas: PwAtlas, field: number, variant: number): PwTile {
  return atlas.tile(`d2poster|${h6(field)}|${variant}`, 52, 68, (c, k) => {
    const rng = k.rng;
    const frame = k.ramp(0x3e2a1a, { light: 0.45 });
    const f = k.ramp(field, { light: 0.5, sat: 1.0 });
    const ink = k.ramp(0x18120c, { light: 0.4 });
    const cream = k.ramp(0xf0e4c0, { light: 0.4 });
    c.rect(0, 0, 52, 68, frame, 3);
    c.bevel(0, 0, 52, 68, true, 1, 1.5, 2);
    // Print: field with a sun disc, the animal, title band.
    for (let y = 4; y < 64; y++) for (let x = 4; x < 48; x++) c.set(x, y, f, y > 46 ? 2.5 : 3 + (y < 20 ? 0.5 : 0), PWF.DITHER);
    c.ellipse(32, 22, 11, 11, f, 4.5);
    const shapes = [REX, RAPTOR, TRIKE];
    const shp = shapes[variant % 3];
    silhouette(c, shp, 4, 22, 44, 24, ink, { tone: 2, shade: false });
    // Ground line + fern tufts.
    c.rect(4, 46, 44, 2, ink, 2);
    frond(c, 7, 46, -1.3, 7, ink, 2);
    frond(c, 44, 46, -1.9, 6, ink, 2);
    // Title band.
    const title = ['T-REX', 'RAPTOR', 'TRIKE'][variant % 3];
    c.rect(4, 50, 44, 10, ink, 2);
    const tw = textWidth(title, FONT_5x7);
    drawText(c, title, 26 - Math.ceil(tw / 2), 51, FONT_5x7, cream, 3);
    drawText(c, 'PRIMAL ISLE', 6, 61, FONT_3x5, ink, 2);
    // Sun-faded, a torn corner, a smear.
    c.scatter(rng, 4, 4, 44, 60, 12, 0, 0.75, { shapes: 4 });
    c.poly([40, 4, 48, 4, 48, 12], frame, 1.5);
  });
}

/** A dropped brochure / sheet (fit to a floor decal): folded paper, print lines, a park logo block. 10 × 14. */
export function paperTile(atlas: PwAtlas, variant: number): PwTile {
  return atlas.tile(`d2paper|${variant}`, 10, 14, (c, k) => {
    const p = k.ramp(variant % 3 === 2 ? 0xd8c890 : 0xe8e4dc, { light: 0.3, sat: 0.6 });
    const ink = k.ramp(variant % 3 === 1 ? 0x2a5a3a : 0x3a3a44, { light: 0.4 });
    c.rect(0, 0, 10, 14, p, 3);
    c.vline(5, 0, 14, p, variant % 2 ? 4 : 2); // fold
    c.rect(1, 1, 3, 3, ink, 2);
    for (let y = 6; y < 13; y += 2) c.hline(1, y, variant % 2 ? 8 : 3, ink, 3);
    c.set(9, 13, p, 1);
  });
}

/** A blood drag across the floor (0.9 × 2.2 m, cut out): smeared streaks, drips and a hand print. 28 × 70. */
export function bloodDragTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2blooddrag', 28, 70, (c, k) => {
    const rng = k.rng;
    bloodSmear(c, k, 14, 4, 13, 64, 5, { wrap: false });
    bloodSplat(c, rng, k, 14, 6, 5, { dir: -Math.PI / 2, wrap: false });
    handprint(c, k, 4, 40);
  });
}

/** Brass museum plaque with engraved lettering (1.6 × 0.5 m). 52 × 16. */
export function plaqueTile(atlas: PwAtlas, l1: string, l2: string): PwTile {
  return atlas.tile(`d2plaque|${l1}|${l2}`, 52, 16, (c, k) => {
    const b = k.ramp(0xc8a24c, { light: 0.55 });
    plate(c, 0, 0, 52, 16, b, { tone: 3, shadow: false });
    const w1 = textWidth(l1, FONT_3x5);
    drawText(c, l1, 26 - Math.ceil(w1 / 2), 3, FONT_3x5, b, 1);
    const w2 = textWidth(l2, FONT_3x5);
    drawText(c, l2, 26 - Math.ceil(w2 / 2), 9, FONT_3x5, b, 1.5);
    for (const [x, y] of [[2, 2], [48, 2], [2, 12], [48, 12]]) rivet(c, x, y, b, 3);
  });
}

/** Polished granite (plinths): speckled black / grey / pink grains, a polish sheen, a chipped arris. 64 × 64. */
export function graniteTile(atlas: PwAtlas, hex = 0x4a4a56): PwTile {
  return atlas.tile(
    `d2granite|${h6(hex)}`,
    64,
    64,
    (c, k) => {
      const rng = k.rng;
      const g = k.ramp(hex, { light: 0.55, sat: 0.7 });
      const pink = k.ramp(0x8a6a6a, { light: 0.4 });
      c.rect(0, 0, 64, 64, g, 3);
      c.scatter(rng, 0, 0, 64, 64, 260, 0, -1, { shapes: 3 });
      c.scatter(rng, 0, 0, 64, 64, 140, 0, 1, { shapes: 2 });
      for (let i = 0; i < 50; i++) c.cluster(rng.int(0, 62), rng.int(0, 62), rng.int(0, 3), pink, 2.5);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if ((x + y) % 40 < 3 && bayer(x, y) < 0.5) c.shift(x, y, 1);
    },
    { wrap: true },
  );
}

/**
 * Night sky for the skylights / glass roof (a plane far overhead, unlit):
 * navy with dithered cloud banks lit on their upper-left (moon) edges, stars
 * of three sizes. 128 × 128 at 4 texels a metre (32 m repeat; the moon is a
 * separate module so it shows once).
 */
export function nightSkyPlaneTile(atlas: PwAtlas): PwTile {
  return atlas.tile(
    'd2skyplane',
    128,
    128,
    (c, k) => {
      const rng = k.rng;
      const sky = k.ramp(0x14264a, { light: 0.55, sat: 1.0 });
      const cloud = k.ramp(0x30405a, { light: 0.5, sat: 0.8 });
      const star = k.ramp(0xd0dcff, { light: 0.6 });
      const n = new Float32Array(128 * 128);
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) n[y * 128 + x] = smooth(x, y, 128, 128, 4, 61) * 0.65 + smooth(x, y, 128, 128, 8, 62) * 0.35;
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const v = n[y * 128 + x];
          if (v > 0.6) {
            const e = n[wrapI(y - 2, 128) * 128 + wrapI(x - 2, 128)];
            c.set(x, y, cloud, e < 0.6 ? 3.5 : v > 0.7 ? 1.75 : 2.5, PWF.GLOW | PWF.DITHER);
          } else c.set(x, y, sky, 2 + v * 0.8, PWF.GLOW | PWF.DITHER);
        }
      }
      for (let i = 0; i < 70; i++) {
        const x = rng.int(0, 127);
        const y = rng.int(0, 127);
        if (c.at(x, y) !== sky) continue;
        const big = rng.chance(0.1);
        c.set(x, y, star, big ? 5 : rng.chance(0.4) ? 4 : 3, PWF.GLOW);
        if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(wrapI(x + dx, 128), wrapI(y + dy, 128), star, 2, PWF.GLOW);
      }
    },
    { wrap: true, density: 4 },
  );
}

/** The moon for a sky plane (unlit, cut out round its halo). 40 × 40. */
export function moonTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2moon', 40, 40, (c, k) => {
    const sky = k.ramp(0x14264a, { light: 0.55, sat: 1.0 });
    moon(c, 20, 20, 13, k.ramp(0xeef2ff, { light: 0.6 }), sky);
  });
}

/** Timber handrail on steel balusters (cut out, 1 × 1 m, wrap along u): rail, balusters with lit left edges, a bottom rail. 32 × 32. */
export function balustradeTile(atlas: PwAtlas, o: { rail?: number; bar?: number } = {}): PwTile {
  return atlas.tile(
    `d2balustrade|${h6(o.rail ?? 0x5a3a22)}|${h6(o.bar ?? 0x7a7e86)}`,
    32,
    32,
    (c, k) => {
      const rail = k.ramp(o.rail ?? 0x5a3a22, { light: 0.45 });
      const bar = k.ramp(o.bar ?? 0x7a7e86, { light: 0.55, sat: 0.6 });
      // Handrail: rounded (lit top rows, dark under).
      c.rect(0, 0, 32, 4, rail, 3);
      c.hline(0, 0, 32, rail, 4.5);
      c.hline(0, 1, 32, rail, 3.75);
      c.hline(0, 3, 32, rail, 1.5);
      // Mid rail and bottom rail.
      c.rect(0, 15, 32, 2, bar, 3);
      c.hline(0, 15, 32, bar, 4);
      c.rect(0, 29, 32, 2, bar, 2.5);
      // Balusters (slim, a lit edge and a shadowed edge).
      for (let x = 3; x < 28; x += 6) {
        c.vline(x, 4, 25, bar, 3);
        c.vline(x + 1, 4, 25, bar, 1.5);
      }
      // A post every metre.
      c.rect(29, 2, 3, 29, bar, 3);
      c.vline(29, 2, 29, bar, 4);
      c.vline(31, 2, 29, bar, 1.5);
    },
    { wrap: true },
  );
}

/** Hanging ivy / vine curtain from a ledge (cut out): leafy strands of different lengths, lit leaf tops. 64 × 48. */
export function vineCurtainTile(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`d2vines|${variant}`, 64, 48, (c, k) => {
    const rng = k.rng;
    const leaf = k.ramp(0x2f6a2c, { light: 0.5, sat: 1.0 });
    const leaf2 = k.ramp(0x3e7a30, { light: 0.5, sat: 1.0 });
    for (let s = 0; s < 14; s++) {
      let x = 2 + s * 4.5 + rng.range(-1, 1);
      const len = rng.int(10, 46);
      for (let y = 0; y < len; y++) {
        x += rng.spread(0.35);
        c.set(Math.round(x), y, leaf, 2);
        if (y % 3 === (s % 3)) {
          const side = (y + s) % 2 ? 1 : -1;
          const r = y % 2 ? leaf : leaf2;
          c.set(Math.round(x) + side, y, r, 3.5);
          c.set(Math.round(x) + side * 2, y, r, 3);
          c.set(Math.round(x) + side, y + 1, r, 2.5);
          c.set(Math.round(x) + side * 2, y - 1, r, 4);
        }
      }
    }
    // A leafy mass along the top (the plant on the ledge).
    for (let x = 0; x < 64; x++) {
      const h = 2 + Math.round(Math.abs(Math.sin(x * 0.4)) * 2 + hash2(x, 2, 5) * 2);
      for (let y = 0; y < h; y++) c.set(x, y, (x + y) % 3 ? leaf : leaf2, y === 0 ? 4 : 3);
    }
  });
}

/** A paper notice / poster cluster on a wall (cut out): pinned sheets, a missing-dog style flyer, tape. 32 × 24. */
export function noticeBoardTile(atlas: PwAtlas): PwTile {
  return atlas.tile('d2notices', 32, 24, (c, k) => {
    const rng = k.rng;
    const p1 = k.ramp(0xe8e0c8, { light: 0.3, sat: 0.6 });
    const p2 = k.ramp(0xe0c860, { light: 0.35 });
    const ink = k.ramp(0x2a2a34, { light: 0.4 });
    plate(c, 1, 2, 12, 16, p1, { tone: 3 });
    for (let y = 5; y < 16; y += 2) c.hline(3, y, rng.int(5, 8), ink, 2);
    plate(c, 15, 4, 14, 12, p2, { tone: 3 });
    drawText(c, 'TOUR', 16, 6, FONT_3x5, ink, 2);
    for (let y = 12; y < 15; y += 2) c.hline(17, y, 9, ink, 2.5);
    plate(c, 8, 14, 10, 9, p1, { tone: 2.75 });
    c.rect(10, 16, 6, 4, ink, 3);
  });
}


/**
 * An arched clerestory window (fit, 2 × 4 m): a sandstone architrave with a
 * keystone, the recessed reveal (shadowed top / left, lit sill / right), a
 * timber sash with arched tracery and glazing bars, the night beyond glowing
 * faintly (stars, moonlit cloud, jungle canopy silhouettes, a pterosaur), a
 * projecting sill, grime run off below it. 64 × 128.
 */
export function clerestoryTile(atlas: PwAtlas, variant = 0): PwTile {
  return atlas.tile(`d2clerestory|${variant}`, 64, 128, (c, k) => {
    const rng = k.rng;
    const stone = k.ramp(0xb0a48e, { light: 0.45, sat: 0.8 });
    const reveal = k.ramp(0x2a2630, { light: 0.4 });
    const wood = k.ramp(0x3e2a1a, { light: 0.45 });
    const sky = k.ramp(0x1a2e52, { light: 0.5, sat: 1.0 });
    const cloud = k.ramp(0x4a5a7a, { light: 0.45 });
    const jungle = k.ramp(0x0e1c16, { light: 0.4 });
    const rim = k.ramp(0x4a6a6a, { light: 0.4 });
    const star = k.ramp(0xd0dcff, { light: 0.6 });
    const W = 64;
    const H = 128;
    const cx = 32;
    const archY = 30; // centre of the arch (rows from the top)
    const inArch = (x: number, y: number, r: number, bottom: number) => (y >= archY ? y < bottom && Math.abs(x + 0.5 - cx) < r : Math.hypot(x + 0.5 - cx, y + 0.5 - archY) < r);
    // Architrave (stone frame) round the opening.
    for (let y = 0; y < H - 10; y++) for (let x = 0; x < W; x++) if (inArch(x, y, 31, H - 10)) c.set(x, y, stone, x + y < 50 ? 3.5 : 3);
    // Voussoir joints on the arch and a keystone.
    for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += Math.PI / 7) for (let r = 24; r < 31; r++) c.set(Math.round(cx + Math.cos(a) * r), Math.round(archY + Math.sin(a) * r), stone, 1.5);
    c.rect(cx - 4, 0, 8, 9, stone, 3.5);
    c.hline(cx - 4, 0, 8, stone, 4.5);
    c.vline(cx + 3, 0, 9, stone, 2);
    // Reveal (deep): the opening's top / left in shadow, the right side lit a little.
    for (let y = 0; y < H - 10; y++) for (let x = 0; x < W; x++) if (inArch(x, y, 24, H - 12)) c.set(x, y, reveal, x < cx - 18 || y < archY - 18 ? 0.5 : x > cx + 19 ? 3 : 1.5);
    // Glass: the night outside (unlit glow, dim).
    for (let y = 0; y < H - 10; y++) {
      for (let x = 0; x < W; x++) {
        if (!inArch(x, y, 20, H - 14)) continue;
        c.set(x, y, sky, 1 + (y / H) * 1.6, PWF.GLOW | PWF.DITHER);
      }
    }
    for (let i = 0; i < 26; i++) {
      const x = rng.int(13, 51);
      const y = rng.int(12, 70);
      if (c.at(x, y) === sky) c.set(x, y, star, rng.chance(0.25) ? 4 : 3, PWF.GLOW);
    }
    // A moonlit cloud bank.
    for (let x = 12; x < 52; x++) {
      const yb = 48 + Math.round(Math.sin(x * 0.3 + variant) * 2 + Math.sin(x * 0.11) * 3);
      for (let y = yb; y < yb + 4; y++) if (c.at(x, y) === sky) c.set(x, y, cloud, y === yb ? 3.5 : 2, PWF.GLOW);
    }
    // Canopy silhouettes with moonlit rims, a palm, a pterosaur.
    for (let x = 12; x < 52; x++) {
      const top = 82 + Math.round(Math.abs(Math.sin(x * 0.21 + variant * 2)) * -12 + Math.sin(x * 0.7) * 2);
      for (let y = top; y < H - 14; y++) if (c.at(x, y) === sky) c.set(x, y, jungle, 1.5, PWF.GLOW);
      if (c.at(x, top) === jungle) c.set(x, top, rim, 2.5, PWF.GLOW);
    }
    palmShape(c, 20 + variant * 18, 90, 26, jungle, 1.5, 0.15, PWF.GLOW);
    silhouette(c, PTERO, 30 - variant * 8, 26 + variant * 6, 14, 5, jungle, { tone: 1.5, shade: false, flag: PWF.GLOW });
    // Sash: timber frame, two mullions, glazing bars, arched tracery.
    for (let y = 0; y < H - 10; y++) {
      for (let x = 0; x < W; x++) {
        if (!inArch(x, y, 21, H - 13) || inArch(x, y, 19, H - 15)) continue;
        c.set(x, y, wood, x + y < 60 ? 4 : 2);
      }
    }
    for (const mx of [cx - 7, cx + 6]) for (let y = 12; y < H - 14; y++) if (c.at(mx, y) === sky || c.at(mx, y) === jungle || c.at(mx, y) === cloud || c.at(mx, y) === star || c.at(mx, y) === rim) {
      c.set(mx, y, wood, 3);
      c.set(mx + 1, y, wood, 1.5);
    }
    for (let gy = 40; gy < H - 14; gy += 18) for (let x = 13; x < 52; x++) if (c.flag[gy * W + x] & PWF.GLOW) {
      c.set(x, gy, wood, 3);
      c.set(x, gy + 1, wood, 1.5);
    }
    for (let a = Math.PI * 1.05; a < Math.PI * 1.95; a += 0.02) {
      const x = Math.round(cx + Math.cos(a) * 12);
      const y = Math.round(archY + Math.sin(a) * 12);
      c.set(x, y, wood, 3);
    }
    // A cracked pane (a lit fracture).
    if (variant === 1) for (let i = 0; i < 9; i++) c.set(40 + i, 60 + Math.round(i * 0.7), star, 2, PWF.GLOW);
    // Sill: projecting stone (lit top, dark underside), grime run off below.
    c.rect(2, H - 12, W - 4, 4, stone, 3);
    c.hline(2, H - 12, W - 4, stone, 4.5);
    c.hline(2, H - 9, W - 4, stone, 1.5);
    for (let x = 6; x < W - 6; x++) {
      const len = 2 + Math.round(hash2(x, variant, 3) * 6);
      for (let j = 0; j < len; j++) if (bayer(x, H - 8 + j) < 0.5 - j / 16) c.set(x, H - 8 + j, reveal, 1.5);
    }
  });
}
