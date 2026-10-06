import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { drawText, FONT_3x5, FONT_BOLD } from './font';
import { NEUTRAL_HEX, neutral } from './retexture';
import { hash2, smooth } from './surfaces';

/**
 * MAIN STREET cars in ART: PIXEL WORLD: the sedans keep their geometry (they
 * are big, they are cover, the rail passes them at every angle) and every face
 * gets a painted module, the way a Metal Slug / Final Fight artist paints a
 * parked car: a hard specular band under the shoulder crease, the body going
 * dark toward the rocker panel, door seams and handles, black wheel wells,
 * chrome trim, glass that mirrors the night sky with a diagonal glint and the
 * headrests behind it, a grille and lamps on the nose, tail lights and a plate
 * on the back, tyres with tread and hubcaps.
 *
 * Body tiles are NEUTRAL (painted round light grey, tinted per car by vertex
 * colour: one set of tiles for every paint job); glass, chrome, tyres, the
 * police door panel and the burnt-out shells are painted in their own colours.
 * Sizes are the classic car's faces at 32 texels a metre (side 4.5 × 0.62 m →
 * 144 × 20). Every tile's u runs from the car's FRONT (the batch flips the left
 * side), v up.
 */

const N = NEUTRAL_HEX;

export interface Z1CarTiles {
  side: PwTile[];
  front: PwTile;
  back: PwTile;
  top: PwTile;
  hood: PwTile;
  hoodWreck: PwTile;
  roof: PwTile;
  paint: PwTile;
  glassSide: PwTile;
  glassFront: PwTile;
  glassCracked: PwTile;
  police: PwTile;
  tire: PwTile;
  wheel: PwTile;
  chrome: PwTile;
  doorIn: PwTile;
  lamp: PwTile;
  tail: PwTile;
  /** Contact shadow under a car (cut-out, 2.4 × 5 m at 16 texels a metre: a soft stepped edge). */
  shadow: PwTile;
  /** Wing mirror (NEUTRAL housing, its glass), an aerial, a mud flap (cut-outs). */
  mirror: PwTile;
  aerial: PwTile;
  flap: PwTile;
  /** Burnt-out shell (own colours, not tinted). */
  burnt: { side: PwTile; top: PwTile; hood: PwTile; roof: PwTile; glass: PwTile; wheel: PwTile; metal: PwTile };
}

export function z1CarTiles(a: PwAtlas): Z1CarTiles {
  const nt = (t: PwTile) => neutral(t);
  return {
    side: [0, 1].map((v) => nt(a.tile(`z1car|side|${v}`, 144, 20, (c, k) => paintSide(c, k, v, false)))),
    front: nt(a.tile('z1car|front', 58, 20, (c, k) => paintFront(c, k, false))),
    back: nt(a.tile('z1car|back', 58, 20, (c, k) => paintBack(c, k, false))),
    top: nt(a.tile('z1car|top', 58, 144, (c, k) => paintTop(c, k, false))),
    hood: nt(a.tile('z1car|hood|0', 58, 40, (c, k) => paintHood(c, k, false, false))),
    hoodWreck: nt(a.tile('z1car|hood|1', 58, 40, (c, k) => paintHood(c, k, true, false))),
    roof: nt(a.tile('z1car|roof', 54, 60, (c, k) => paintRoof(c, k, false))),
    paint: nt(a.tile('z1car|paint', 32, 32, (c, k) => paintFlat(c, k), { wrap: true })),
    glassSide: a.tile('z1car|glass|side', 69, 16, (c, k) => paintGlassSide(c, k, false)),
    glassFront: a.tile('z1car|glass|front', 52, 16, (c, k) => paintGlassFront(c, k, false)),
    glassCracked: a.tile('z1car|glass|cracked', 52, 16, (c, k) => paintGlassFront(c, k, true)),
    police: a.tile('z1car|police', 64, 16, (c, k) => paintPolicePanel(c, k)),
    tire: a.tile('z1car|tire', 32, 16, (c, k) => paintTire(c, k), { wrap: true }),
    wheel: a.tile('z1car|wheel|0', 24, 24, (c, k) => paintWheel(c, k, false)),
    chrome: a.tile('z1car|chrome', 32, 16, (c, k) => paintChrome(c, k, false), { wrap: true }),
    doorIn: a.tile('z1car|doorin', 34, 20, (c, k) => paintDoorIn(c, k)),
    lamp: a.tile('z1car|lamp', 12, 5, (c, k) => paintLamp(c, k, 0xd8d4c0)),
    tail: a.tile('z1car|tail', 13, 5, (c, k) => paintLamp(c, k, 0x8a1a12)),
    shadow: a.tile('z1car|shadow', 40, 80, paintShadow),
    mirror: nt(a.tile('z1car|mirror', 8, 6, paintMirror)),
    aerial: a.tile('z1car|aerial', 4, 28, paintAerial),
    flap: a.tile('z1car|flap', 8, 9, paintFlap),
    burnt: {
      side: a.tile('z1car|side|burnt', 144, 20, (c, k) => paintSide(c, k, 0, true)),
      top: a.tile('z1car|top|burnt', 58, 144, (c, k) => paintTop(c, k, true)),
      hood: a.tile('z1car|hood|burnt', 58, 40, (c, k) => paintHood(c, k, true, true)),
      roof: a.tile('z1car|roof|burnt', 54, 60, (c, k) => paintRoof(c, k, true)),
      glass: a.tile('z1car|glass|burnt', 69, 16, (c, k) => paintGlassSide(c, k, true)),
      wheel: a.tile('z1car|wheel|1', 24, 24, (c, k) => paintWheel(c, k, true)),
      metal: a.tile('z1car|chrome|burnt', 32, 16, (c, k) => paintChrome(c, k, true), { wrap: true }),
    },
  };
}

/** Body ramp (neutral grey: tinted per car) or the burnt shell's scorched ramps. */
function body(k: PwKit, burnt: boolean) {
  if (!burnt) return { p: k.ramp(N, { light: 0.6, dark: 0.3, sat: 1 }), soot: 0, rust: k.ramp(0x7a4a2c, { light: 0.4 }) };
  return { p: k.ramp(0x3a302a, { light: 0.35, sat: 0.9 }), soot: k.ramp(0x1a1614, { light: 0.4 }), rust: k.ramp(0x8a4a24, { light: 0.4, sat: 1.1 }) };
}

/** Scorch: blistered paint, rust blooms, soot, all over a burnt shell. */
function scorch(c: PwCanvas, k: PwKit, ramps: ReturnType<typeof body>) {
  const rng = k.rng;
  // Blotches, not speckle: rust blooms where the paint burnt off, soot where the flames licked.
  const S = 48;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const n = smooth(x, y, S, S, 3, 91);
      const m = smooth(x, y, S, S, 5, 92);
      if (n > 0.62) c.tint(x, y, ramps.rust, n > 0.74 ? 0 : -1);
      else if (m < 0.3) c.tint(x, y, ramps.soot, m < 0.18 ? -2 : -1);
    }
  }
  // Blistered edges of the blooms: a few chips.
  for (let i = 0; i < Math.round((c.w * c.h) / 160); i++) c.cluster(rng.int(0, c.w - 2), rng.int(0, c.h - 2), rng.int(0, 4), ramps.rust, 3);
}

// Wheel centres along the side (texels from the front): z = ±1.4 m on a 4.5 m body.
const WHEEL_U = [Math.round((2.25 - 1.4) * 32), Math.round((2.25 + 1.4) * 32)];

function paintSide(c: PwCanvas, k: PwKit, v: number, burnt: boolean) {
  const rng = k.rng;
  const r = body(k, burnt);
  const { p } = r;
  const W = c.w;
  const H = c.h;
  const tar = k.ramp(0x101014, { light: 0.4 });
  const chrome = k.ramp(0xa8acb4, { light: 0.6, sat: 0.4 });
  // Rows (top-down): 0 shoulder crease (lit), 1–3 specular band, 4–11 body, 12 trim, 13–19 lower body darkening.
  for (let y = 0; y < H; y++) {
    const t = y === 0 ? 4 : y <= 2 ? 5 : y === 3 ? 4 : y < 12 ? 3 : y === 12 ? 3 : y < 16 ? 2 : 1;
    c.rect(0, y, W, 1, p, t);
  }
  if (!burnt) c.hline(0, 12, W, chrome, 4);
  // Door seams (front door 41…80, rear door 80…112), handles, a fuel flap.
  for (const sx of [41, 80, 112]) {
    c.vline(sx, 1, H - 3, p, 1);
    c.vline(sx + 1, 3, H - 6, p, 4);
  }
  for (const hx of [70, 102]) {
    c.rect(hx, 6, 5, 2, burnt ? tar : chrome, burnt ? 1 : 5);
    c.hline(hx, 8, 5, p, 1);
  }
  c.frame(124, 5, 6, 5, p, 2);
  // Wheel wells: black arches with a lit lip.
  for (const wu of WHEEL_U) {
    for (let y = 6; y < H; y++) {
      for (let x = wu - 14; x <= wu + 14; x++) {
        const d = Math.hypot(x - wu, (y - H) * 1.05);
        if (d < 12.5) c.set(x, y, tar, 0);
        else if (d < 13.6) c.set(x, y, p, y < 12 ? 4 : 2);
      }
    }
  }
  // Mud splashed up behind the wheels.
  const mud = k.ramp(0x4a3a2c, { light: 0.4 });
  for (const wu of WHEEL_U) for (let i = 0; i < 10; i++) c.cluster(wu + 13 + rng.int(0, 10), rng.int(13, H - 2), rng.int(0, 3), mud, 2);
  if (burnt) {
    scorch(c, k, r);
    return;
  }
  if (v === 1) {
    // A dent (dark crease with a lit lower lip) and rust blooming round the arch and the sill.
    for (let x = 52; x < 66; x++) {
      const y = 6 + Math.round(Math.sin((x - 52) * 0.25) * 1.5);
      c.set(x, y, p, 1);
      c.set(x, y + 1, p, 5);
    }
    for (let i = 0; i < 18; i++) c.cluster(WHEEL_U[1] - 18 + rng.int(0, 34), rng.int(13, H - 2), rng.int(0, 6), r.rust, rng.chance(0.5) ? 2 : 3);
    for (let i = 0; i < 6; i++) c.cluster(rng.int(4, W - 6), H - 3, rng.int(0, 4), r.rust, 2);
  }
  // A few scratches catching the light.
  for (let i = 0; i < 3; i++) {
    const x = rng.int(10, W - 20);
    const y = rng.int(5, 10);
    c.lineShade(x, y, x + rng.int(4, 9), y + rng.int(-1, 1), 1.5);
  }
}

function paintFront(c: PwCanvas, k: PwKit, burnt: boolean) {
  const { p } = body(k, burnt);
  const W = c.w;
  const H = c.h;
  const tar = k.ramp(0x101014, { light: 0.4 });
  const chrome = k.ramp(0xa8acb4, { light: 0.6, sat: 0.4 });
  for (let y = 0; y < H; y++) c.rect(0, y, W, 1, p, y === 0 ? 4 : y < 3 ? 5 : y < 12 ? 3 : 2);
  // Grille: chrome surround, dark slots, a badge.
  const gx = 14;
  const gw = W - 28;
  c.rect(gx, 4, gw, 9, chrome, 4);
  for (let y = 5; y < 12; y += 2) c.hline(gx + 1, y, gw - 2, tar, 0);
  for (let x = gx + 4; x < gx + gw - 2; x += 5) c.vline(x, 5, 7, chrome, 3);
  c.rect((W >> 1) - 2, 7, 4, 3, chrome, 5);
  // Headlamp housings (the lamps themselves are painted / glowing boxes over them).
  for (const hx of [3, W - 14]) {
    c.rect(hx, 4, 11, 7, chrome, 3);
    c.rect(hx + 1, 5, 9, 5, tar, 1);
  }
  // Valance under the bumper line.
  c.rect(0, H - 4, W, 4, p, 1);
  c.rect(W / 2 - 8, H - 3, 16, 2, tar, 0);
}

function paintBack(c: PwCanvas, k: PwKit, burnt: boolean) {
  const { p } = body(k, burnt);
  const W = c.w;
  const H = c.h;
  const tar = k.ramp(0x101014, { light: 0.4 });
  const chrome = k.ramp(0xa8acb4, { light: 0.6, sat: 0.4 });
  const plate = k.ramp(0xd8d0a0, { light: 0.4 });
  for (let y = 0; y < H; y++) c.rect(0, y, W, 1, p, y === 0 ? 4 : y < 3 ? 5 : y < 12 ? 3 : 2);
  // Trunk lid seam, keyhole, tail lamp housings, the plate.
  c.hline(4, 3, W - 8, p, 1);
  c.set(W >> 1, 6, chrome, 5);
  for (const hx of [2, W - 15]) {
    c.rect(hx, 4, 13, 7, chrome, 3);
    c.rect(hx + 1, 5, 11, 5, tar, 1);
  }
  const px = (W >> 1) - 10;
  c.rect(px, 9, 20, 8, plate, 3);
  c.frame(px, 9, 20, 8, chrome, 2);
  drawText(c, 'Z1931', px + 1, 11, FONT_3x5, k.ramp(0x1a2a5a, { light: 0.4 }), 2, { spacing: -0.0 });
  c.rect(0, H - 3, W, 3, p, 1);
  c.hline(6, H - 2, 6, tar, 0);
}

function paintTop(c: PwCanvas, k: PwKit, burnt: boolean) {
  const r = body(k, burnt);
  const { p } = r;
  const W = c.w;
  const H = c.h;
  // Seen from above (canvas top = the car's rear): a specular streak down the left of the deck, the trunk lid seam.
  for (let x = 0; x < W; x++) c.rect(x, 0, 1, H, p, x < 2 ? 4 : x < 10 && x > 4 ? 4 : x > W - 4 ? 2 : 3);
  c.hline(4, 34, W - 8, p, 1);
  c.vline(4, 2, 32, p, 1);
  c.vline(W - 5, 2, 32, p, 1);
  c.hline(4, 3, W - 8, p, 2);
  if (burnt) scorch(c, k, r);
  else {
    // Rain beads: a few 1-texel lit drops.
    for (let i = 0; i < 24; i++) c.set(k.rng.int(2, W - 3), k.rng.int(2, H - 3), p, 5);
  }
}

function paintHood(c: PwCanvas, k: PwKit, wrecked: boolean, burnt: boolean) {
  const r = body(k, burnt);
  const { p } = r;
  const W = c.w;
  const H = c.h;
  const tar = k.ramp(0x101014, { light: 0.4 });
  // Hood: a centre crease (lit ridge / dark valley), a broad reflection band, the cowl + wipers at the back (bottom rows).
  for (let x = 0; x < W; x++) {
    const d = x - W / 2;
    const t = Math.abs(d) < 1 ? (d < 0 ? 5 : 2) : x < 6 ? 4 : x > W - 6 ? 2 : 3;
    c.rect(x, 0, 1, H, p, t);
  }
  // (Canvas top = the cowl at the windscreen: the wipers lie there.)
  for (let y = 14; y < 22; y++) for (let x = 6 + (y - 14); x < 20 + (y - 14); x++) c.set(x, y, p, 4);
  c.hline(0, 4, W, p, 1);
  c.rect(0, 0, W, 4, tar, 1);
  c.line(8, 1, 26, 3, p, 4);
  c.line(32, 1, 50, 3, p, 4);
  if (wrecked) {
    // Crumpled: zig-zag folds across, the paint cracked off along them.
    for (let f = 0; f < 3; f++) {
      const y0 = 10 + f * 9;
      for (let x = 0; x < W; x++) {
        const y = y0 + ((x >> 2) % 2 ? 2 : 0);
        c.set(x, y, p, 1);
        c.set(x, y + 1, p, 5);
      }
    }
    for (let i = 0; i < 14; i++) c.cluster(k.rng.int(2, W - 4), k.rng.int(2, H - 8), k.rng.int(0, 5), r.rust, 2);
  }
  if (burnt) scorch(c, k, r);
}

function paintRoof(c: PwCanvas, k: PwKit, burnt: boolean) {
  const r = body(k, burnt);
  const { p } = r;
  const W = c.w;
  const H = c.h;
  for (let x = 0; x < W; x++) c.rect(x, 0, 1, H, p, x < 2 || x > W - 3 ? 2 : x < 8 ? 4 : x > 40 && x < 44 ? 4 : 3);
  // Drip rails, the sky in a long sheen.
  c.vline(1, 0, H, p, 5);
  c.vline(W - 2, 0, H, p, 1);
  for (let y = 6; y < H - 6; y++) if (y % 3 !== 0) c.set(10 + (y >> 3), y, p, 5);
  if (burnt) scorch(c, k, r);
}

function paintFlat(c: PwCanvas, k: PwKit) {
  const p = k.ramp(N, { light: 0.6, dark: 0.3, sat: 1 });
  c.rect(0, 0, c.w, c.h, p, 3);
  for (let i = 0; i < 6; i++) c.set(k.rng.int(0, c.w - 1), k.rng.int(0, c.h - 1), p, 4);
}

function paintGlassSide(c: PwCanvas, k: PwKit, burnt: boolean) {
  const W = c.w;
  const H = c.h;
  const frame = k.ramp(0x1a1a20, { light: 0.4 });
  const glass = k.ramp(0x1e2638, { light: 0.4, sat: 1 });
  const sky = k.ramp(0x5a6a94, { light: 0.35 });
  const seat = k.ramp(0x2a2a30, { light: 0.4 });
  const soot = k.ramp(0x141210, { light: 0.4 });
  const rust = k.ramp(0x6a3a22, { light: 0.4 });
  c.rect(0, 0, W, H, frame, 1);
  // Two windows (front 2…33, rear 37…66) under a rubber seal; the B-pillar between them.
  for (const [x0, x1] of [
    [2, 33],
    [37, 66],
  ]) {
    for (let y = 2; y < H - 1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (burnt) {
          c.set(x, y, soot, hash2(x, y, 3) > 0.85 ? 2 : 1);
          continue;
        }
        // Dark glass, a diagonal glint (two bands), the sky reflected in the top rows.
        const d = (x - y * 1.3 + 40) % 34;
        let t = 2;
        let r = glass;
        if (y < 4) (r = sky), (t = 2);
        if (d < 3) (r = sky), (t = 3);
        else if (d === 5) (r = sky), (t = 2);
        c.set(x, y, r, t);
      }
    }
    if (!burnt) {
      // Headrest silhouettes behind the glass.
      const hx = x0 + 8;
      c.rect(hx, 6, 6, 4, seat, 1);
      c.rect(hx + 2, 10, 2, 2, seat, 1);
    }
    c.hline(x0, 1, x1 - x0 + 1, frame, 3);
  }
  if (burnt) for (let i = 0; i < 8; i++) c.cluster(k.rng.int(0, W - 2), k.rng.int(0, H - 2), k.rng.int(0, 5), rust, 2);
}

function paintGlassFront(c: PwCanvas, k: PwKit, cracked: boolean) {
  const W = c.w;
  const H = c.h;
  const frame = k.ramp(0x1a1a20, { light: 0.4 });
  const glass = k.ramp(0x1e2638, { light: 0.4, sat: 1 });
  const sky = k.ramp(0x5a6a94, { light: 0.35 });
  const seat = k.ramp(0x2a2a30, { light: 0.4 });
  c.rect(0, 0, W, H, frame, 1);
  for (let y = 2; y < H - 1; y++) {
    for (let x = 2; x < W - 2; x++) {
      const d = (x - y * 1.2 + 60) % 40;
      c.set(x, y, d < 4 || y < 4 ? sky : glass, d < 4 ? 3 : 2);
    }
  }
  // Seats + the rear-view mirror.
  for (const sx of [12, W - 20]) c.rect(sx, 8, 8, 6, seat, 1);
  c.rect((W >> 1) - 3, 3, 6, 2, frame, 2);
  if (cracked) {
    // A spider-web of cracks round an impact point.
    const cx = 18;
    const cy = 8;
    for (let r = 0; r < 7; r++) {
      const a = (r / 7) * Math.PI * 2 + 0.3;
      for (let j = 1; j < 14; j++) c.set(Math.round(cx + Math.cos(a) * j), Math.round(cy + Math.sin(a) * j * 0.6), sky, 4);
    }
    for (const rr of [4, 8]) for (let a = 0; a < 6.28; a += 0.3) c.set(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.6), sky, 4);
  }
}

function paintPolicePanel(c: PwCanvas, k: PwKit) {
  const W = c.w;
  const H = c.h;
  const white = k.ramp(0xdedad0, { light: 0.4, sat: 0.6 });
  const ink = k.ramp(0x14161c, { light: 0.4 });
  const gold = k.ramp(0xd8b048, { light: 0.5 });
  for (let y = 0; y < H; y++) c.rect(0, y, W, 1, white, y < 2 ? 4 : y > H - 3 ? 2 : 3);
  // Star badge + POLICE lettering + the unit number.
  const sx = 8;
  const sy = 8;
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 2.4 : 5.6;
    pts.push(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  c.poly(pts, gold, 3);
  c.set(sx - 1, sy - 2, gold, 5);
  drawText(c, 'POLICE', 17, 4, FONT_BOLD, ink, 1);
  drawText(c, '12', W - 9, 11, FONT_3x5, ink, 1);
  c.vline(W - 12, 1, H - 2, white, 1);
}

function paintTire(c: PwCanvas, k: PwKit) {
  const r = k.ramp(0x1c1c20, { light: 0.4 });
  c.rect(0, 0, c.w, c.h, r, 2);
  // Tread blocks across the width (v across the tyre, u round it).
  for (let x = 0; x < c.w; x += 4) {
    for (let y = 2; y < c.h - 2; y++) c.set(x, y, r, 0);
    c.rect(x + 1, 3, 2, 3, r, 3);
    c.rect(x + 1, c.h - 6, 2, 3, r, 3);
  }
  c.hline(0, 0, c.w, r, 3);
}

function paintWheel(c: PwCanvas, k: PwKit, burnt: boolean) {
  const rub = k.ramp(0x1c1c20, { light: 0.4 });
  const rim = burnt ? k.ramp(0x6a3a22, { light: 0.4 }) : k.ramp(0xb0b4bc, { light: 0.6, sat: 0.4 });
  const W = c.w;
  const cx = W / 2 - 0.5;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cx);
      const lit = x - cx + (y - cx) < 0;
      if (d > 11.6) continue;
      if (d > 8.2) c.set(x, y, rub, d > 10.8 ? 1 : lit ? 3 : 2);
      else if (burnt) c.set(x, y, rim, d > 7 ? 2 : (Math.round(Math.atan2(y - cx, x - cx) * 2.5) & 1) ? 1 : 3);
      else if (d > 7) c.set(x, y, rim, lit ? 5 : 2);
      else if (d > 3) c.set(x, y, rim, (Math.round(Math.atan2(y - cx, x - cx) * 2.55) & 1) ? 2 : lit ? 4 : 3);
      else c.set(x, y, rim, d < 1.5 ? 5 : 3);
    }
  }
}

function paintChrome(c: PwCanvas, k: PwKit, burnt: boolean) {
  const r = burnt ? k.ramp(0x4a3a30, { light: 0.4 }) : k.ramp(0xa0a4ac, { light: 0.7, sat: 0.4 });
  for (let y = 0; y < c.h; y++) c.rect(0, y, c.w, 1, r, burnt ? 2 : y < 3 ? 5 : y < 6 ? 4 : y < 11 ? 2 : 3);
  if (burnt) {
    const rust = k.ramp(0x8a4a24, { light: 0.4 });
    for (let i = 0; i < 20; i++) c.cluster(k.rng.int(0, c.w - 2), k.rng.int(0, c.h - 2), k.rng.int(0, 5), rust, 2);
  }
}

function paintDoorIn(c: PwCanvas, k: PwKit) {
  const vinyl = k.ramp(0x4a3a34, { light: 0.4 });
  const chrome = k.ramp(0xa8acb4, { light: 0.6, sat: 0.4 });
  c.rect(0, 0, c.w, c.h, vinyl, 2);
  c.hline(0, 0, c.w, vinyl, 4);
  c.rect(2, 7, c.w - 4, 3, vinyl, 3);
  c.hline(2, 7, c.w - 4, vinyl, 4);
  c.rect(8, 11, 6, 1, chrome, 5);
  for (let x = 4; x < c.w - 4; x += 3) c.vline(x, 12, 6, vinyl, 1);
}

function paintLamp(c: PwCanvas, k: PwKit, hex: number) {
  const r = k.ramp(hex, { light: 0.6 });
  const chrome = k.ramp(0xa8acb4, { light: 0.6, sat: 0.4 });
  c.rect(0, 0, c.w, c.h, chrome, 3);
  c.rect(1, 1, c.w - 2, c.h - 2, r, 3);
  c.set(2, 1, r, 5);
  c.set(3, 1, r, 4);
  void PWF;
}

/** The dark pool under a car: deepest under the middle, a stepped edge breaking into a checker of cut-outs. */
function paintShadow(c: PwCanvas, k: PwKit) {
  const tar = k.ramp(0x0c0d12, { light: 0.4 });
  const W = c.w;
  const H = c.h;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Rounded-rectangle distance (0 inside the footprint core … 1 at the tile edge).
      const u = Math.max(0, Math.abs(x + 0.5 - W / 2) - (W / 2 - 9)) / 9;
      const v = Math.max(0, Math.abs(y + 0.5 - H / 2) - (H / 2 - 9)) / 9;
      const d = Math.hypot(u, v);
      if (d >= 1) continue;
      if (d > 0.55 && (x + y) % 2 === 0) continue;
      if (d > 0.8 && (x % 2 === 1 || y % 2 === 1)) continue;
      c.set(x, y, tar, d < 0.3 ? 0 : 1);
    }
  }
}

function paintMirror(c: PwCanvas, k: PwKit) {
  const p = k.ramp(N, { light: 0.6, dark: 0.3, sat: 1 });
  const glass = k.ramp(0x5a6a94, { light: 0.35 });
  c.rect(0, 0, 8, 6, p, 3);
  c.hline(0, 0, 8, p, 4);
  c.hline(0, 5, 8, p, 1);
  c.rect(1, 1, 6, 4, glass, 2);
  c.set(2, 1, glass, 4);
}

function paintAerial(c: PwCanvas, k: PwKit) {
  const steel = k.ramp(0x9a9ca4, { light: 0.55, sat: 0.4 });
  c.vline(1, 2, 26, steel, 3);
  c.vline(2, 2, 26, steel, 1);
  c.rect(1, 0, 2, 2, steel, 4);
}

function paintFlap(c: PwCanvas, k: PwKit) {
  const rub = k.ramp(0x1a1a1e, { light: 0.4 });
  c.rect(0, 0, 8, 9, rub, 1);
  c.hline(0, 0, 8, rub, 3);
  c.rect(2, 3, 4, 3, rub, 2);
}
