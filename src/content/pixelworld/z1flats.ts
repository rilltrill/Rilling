import type { PwPainter } from './atlas';
import { bayer, PWF } from './canvas';
import { Elev, FLAT_PAD, FLAT_TPM, mix, vnoise, type ElevWallColours, type RoomKind, type WinKind } from './elevation';
import { drawText, FONT_BOLD, FONT_5x7, textWidth } from './font';

/**
 * MAIN STREET as drawn flats (docs/PIXELWORLD3.md): each building is ONE PICTURE
 * painted here with the illustration kit (elevation.ts), plus the cut-out cards
 * that stand in front of it (awnings, fire escapes, odd signs). `z1/pwFlats.ts`
 * lays them on the set. Everything is placed by hand for that building: only the
 * small `Elev` vocabulary (a window, a cornice) is shared.
 */

/** A cut-out card in front of a flat (metres in the flat's own frame: x from the wall's centre, y up, z toward the viewer). */
export interface FlatCardDef {
  id: string;
  tw: number;
  th: number;
  paint: PwPainter;
  x: number;
  y: number;
  z: number;
}

export interface FlatDef {
  id: string;
  /** Wall width (metres), card height (metres: street to the top of the tallest thing). */
  w: number;
  hCard: number;
  tw: number;
  th: number;
  paint: PwPainter;
  cards?: FlatCardDef[];
}

/** Roof clutter: separate cut-out cards standing behind the wall (a little parallax, and no paint wasted on empty sky). */
type RoofKind = 'tank' | 'chim' | 'chim3' | 'vent' | 'aerial';
type RoofItem = readonly [RoofKind, number, number?];
const ROOF: Record<string, readonly RoofItem[]> = {
  laundry: [['chim', 2.6, 1.0], ['chim3', 9.7, 1.3], ['tank', 15.0], ['aerial', 6.4, 3], ['vent', 12.4]],
  pawn: [['chim', 3.4, 1.0], ['vent', 7.4], ['aerial', 13.6, 3], ['chim3', 15.4, 1.3]],
  rialto: [['chim', 2.2, 1.1], ['aerial', 5.2, 2], ['vent', 15.8], ['chim', 17.8, 1.0]],
  boarded: [['tank', 12.2], ['chim', 2.8, 1.0], ['vent', 7.4]],
  liquor: [['chim3', 3.2, 1.3], ['vent', 9.6], ['tank', 12.8], ['aerial', 6.2, 3]],
  billblock: [['aerial', 1.6, 2], ['chim', 12.4, 1.0]],
  hotel: [['chim3', 3, 1.3], ['chim', 7.2, 1.0], ['aerial', 11.2, 3], ['vent', 15.4], ['chim3', 19.2, 1.3]],
  cafe: [['chim', 3.4, 1.0], ['tank', 13.6], ['aerial', 7.5, 3]],
  w4: [['tank', 3.2], ['chim', 11.4, 1.0], ['vent', 7.6]],
  w6: [['chim', 2.5, 1.0], ['vent', 8.2], ['aerial', 11.8, 2]],
  bar: [['chim', 2.4, 1.0], ['tank', 10.6], ['vent', 6.6]],
  meats: [['chim', 2.2, 1.0], ['chim3', 13.8, 1.3], ['vent', 11.2]],
  bank: [['vent', 4.2], ['chim', 16.8, 1.0], ['aerial', 2.4, 2]],
  shutterblock: [['chim', 3.0, 1.0], ['tank', 15.2], ['aerial', 9.6, 2]],
};

const WALL_ROOF: ElevWallColours = { wall: 0x6a6a70, brick: 0x76402f, stone: 0x908a7c };

/** The card of one roof item (its Elev sized to the item), standing on the wall's top line behind it. */
function roofCard(buildingId: string, i: number, it: RoofItem, wM: number, hTop: number): FlatCardDef {
  const [kind, xM, a] = it;
  const cw = kind === 'tank' ? 3.1 : kind === 'aerial' ? 1.4 : (a ?? (kind === 'chim3' ? 1.4 : 1.1)) + 0.6;
  const ch = kind === 'tank' ? 3.9 : kind === 'chim3' ? 3.6 : kind === 'chim' ? 2.7 : kind === 'aerial' ? 3.2 : 1.2;
  const seed = (i + 1) * 37 + buildingId.length * 91;
  return {
    id: `r${i}`,
    tw: Math.round(cw * FLAT_TPM),
    th: Math.round(ch * FLAT_TPM),
    x: xM - wM / 2,
    y: hTop - 0.25,
    z: -1.1 - (i % 3) * 0.3,
    paint: (c, k) => {
      const e = new Elev(c, k, seed, WALL_ROOF, 0);
      const mid = cw / 2;
      if (kind === 'tank') e.tank(mid, ch - 3.1, { w: 2.5, h: 2.1 });
      else if (kind === 'chim') e.chimney(mid, a ?? 1, ch - 0.15, 0, { pots: 2 });
      else if (kind === 'chim3') e.chimney(mid, a ?? 1.3, ch - 0.15, 0, { pots: 3 });
      else if (kind === 'vent') e.vent(mid, 0.05);
      else e.aerial(mid, 0.05, ch - 0.1, a ?? 2);
      e.ink();
    },
  };
}

/** A building's flat: `hCard` = street to the top of its tallest wall (the roof clutter is cards behind it). */
function flat(id: string, w: number, h: number, gable: number, paint: PwPainter, cards?: FlatCardDef[]): FlatDef {
  const hCard = h + gable + 0.25;
  const roof = (ROOF[id] ?? []).map((it, i) => roofCard(id, i, it, w, h));
  return { id, w, hCard, tw: Math.round(w * FLAT_TPM) + FLAT_PAD * 2, th: Math.round(hCard * FLAT_TPM), paint, cards: [...roof, ...(cards ?? [])] };
}

const GROUND_H = 4.6;
const FLOOR_H = 3.2;
const buildingH = (floors: number) => GROUND_H + FLOOR_H * (floors - 1) + 0.7;
/** Sill row of upper storey `f` (0 = first floor). */
const sillOf = (e: Elev, f: number) => e.Y(GROUND_H + 0.62 + FLOOR_H * f);

type Row = readonly (WinKind | null)[];

/** A row of windows at the columns given (metres), one kind each (null = none, a blank pier). */
function row(e: Elev, f: number, cols: number[], kinds: Row, o: { w?: number; h?: number; head?: 'lintel' | 'arch' | 'hood' | 'none' } = {}) {
  const w = o.w ?? 34;
  const h = o.h ?? 54;
  const s = sillOf(e, f);
  cols.forEach((cm, i) => {
    const k = kinds[i % kinds.length];
    if (!k) return;
    const x = e.X(cm) + e.lean(s, 4) - Math.round(w / 2);
    e.window(x, s - h, w, h, k, { head: o.head });
  });
}

/** The picture's own light: moon on the upper left, street lamps low, shade to the right and the foot. */
function light(e: Elev, o: { moon?: number; foot?: number; right?: number } = {}) {
  const { H, W } = e;
  const foot = o.foot ?? 1;
  const moon = o.moon ?? 1;
  const right = o.right ?? 0.8;
  e.value((_x, y) => (y > e.Y(2.2) ? Math.min(1, (y - e.Y(2.2)) / (e.Y(0.3) - e.Y(2.2))) * foot : 0), -1);
  e.value((x, y) => Math.max(0, 1 - y / (H * 0.5)) * Math.max(0, 1.1 - x / (W * 0.65)) * moon, 1);
  e.value((x) => Math.max(0, (x - W * 0.62) / (W * 0.38)) * right, -1);
  e.footGrime();
  e.ink();
}

/** A street lamp's pool on the wall: whole tones, warm inner ring, the centre a little under the lamp head. */
function lampPool(e: Elev, xM: number, yM = 6.2, rx = 74, ry = 96) {
  const hot = e.k.ramp(mix(0xcf8a40, 0x8a6a4a, 0.4), { light: 0.3, sat: 1.0, dark: 0.45 });
  e.pool(e.X(xM), e.Y(yM), rx, ry, 1, hot);
}

/** Neon throwing colour on the wall under a sign: a strip of the wall in the colour, ragged top, no ring. */
function neonWash(e: Elev, x0M: number, x1M: number, y0M: number, y1M: number, hex: number) {
  const r = e.k.ramp(hex, { light: 0.26, sat: 0.8, dark: 0.45 });
  const yT = e.Y(y1M);
  const yB = e.Y(y0M);
  for (let x = e.X(x0M); x < e.X(x1M); x++) {
    for (let y = yT - 8; y < yB; y++) {
      const edge = yT + (vnoise(x, 9, e.seed + 303) - 0.5) * 16;
      if (y < edge) continue;
      if (y < edge + 6 && bayer(x, y) > (y - edge) / 6) continue;
      if (e.inWall(x, y) && e.c.at(x, y) === e.r.wall) e.c.ramp[y * e.c.w + x] = r;
    }
  }
}

// ─── Main Street, east side ─────────────────────────────────────────────────

const PAWN_COL: ElevWallColours = { wall: 0x7a6a48, alt: 0x6a5a3e, brick: 0x703a2a, stone: 0xa49a7e, frame: 0x3a3226, curtain: 0x8a4a2a };

const paintPawn: PwPainter = (c, k) => {
  const w = 18;
  const h = buildingH(2);
  const e = new Elev(c, k, 41, PAWN_COL);
  e.parapet(0, w, h - 0.1);
  e.parapet(4.5, 13.5, h + 0.75);
  e.curvedGable(9, 4.5, h + 1.6);
  e.bite(1.2, 1.1, 0.4);
  e.bite(12.7, 0.9, 0.5);
  e.fill();
  e.courses({ density: 0.3, patch: 90 });
  e.patch(e.X(1.5), e.Y(9), 110, 60, e.r.alt);
  e.bareBrick(e.X(5.6), e.Y(7.7), 24, 18, 2);
  e.bareBrick(e.X(14.5), e.Y(5.6), 15, 22, 5);
  e.bareBrick(e.X(2.5), e.Y(9.2), 12, 9, 7);
  e.cornice(e.Y(h - 0.75), { gaps: [[e.X(12.4), e.X(13.8)]] });
  e.coping(e.r.stone, 3, [[e.X(12.4), e.X(13.8)]]);
  // Painted lettering on the gable panel, what's left of it.
  const gcx = e.X(9);
  drawText(c, 'LOANS', gcx - textWidth('LOANS', FONT_BOLD) / 2, e.Y(h + 0.9), FONT_BOLD, e.r.stone, 2);
  e.ghostGround(gcx - 44, e.Y(h + 1.05), 88, 22, e.r.alt);
  row(e, 0, [2.4, 5.8, 9.0, 12.3, 15.6], ['moon', 'curtain', 'broken', 'blind', 'dark'], { head: 'hood' });
  e.drainpipe(0.5, h - 1);
  e.band(e.Y(GROUND_H - 0.15), 5, e.r.stone);
  const sy = e.Y(3.65);
  e.shopfront(e.X(0.8), e.X(14.5), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'pawn'), door: e.X(15.2), doorKind: 'lit', frameRamp: e.r.iron, riser: e.k.ramp(0x4a3a2a, { light: 0.36 }) });
  e.pilaster(e.x0, e.Y(GROUND_H), e.H, 10);
  e.pilaster(e.X(17.3), e.Y(GROUND_H), e.H, 10);
  e.fixture(e.X(0.2), e.Y(2.2), 'meter');
  e.bills(e.X(14.4), e.Y(2.4), 26, 46);
  e.crack(e.X(2.8), e.Y(8.9), 26);
  e.pocks(e.X(4), e.Y(5.5), 280, 60, 16);
  lampPool(e, 9, 5.8, 60, 68);
  light(e);
};

const LAUNDRY_COL: ElevWallColours = { wall: 0x565e72, alt: 0x4a5062, brick: 0x6a3a2e, stone: 0x908a7c, frame: 0x34403f, curtain: 0x8c3f34 };

const paintLaundry: PwPainter = (c, k) => {
  const w = 18;
  const h = buildingH(4);
  const e = new Elev(c, k, 31, LAUNDRY_COL);
  e.parapet(0, w, h - 0.05);
  e.parapet(0, 5.5, h - 0.45);
  e.curvedGable(9.2, 3.4, h + 1.1);
  e.bite(14.6, 1.9, 0.7);
  e.bite(3.0, 0.7, 0.35);
  e.fill();
  e.courses({ density: 0.42, patch: 66 });
  e.patch(e.X(1.4), e.Y(11.6), 90, 40, e.r.alt);
  e.patch(e.X(11.0), e.Y(9), 100, 56, e.r.alt);
  e.bareBrick(e.X(4.6), e.Y(7.2), 26, 15, 1);
  e.bareBrick(e.X(15.9), e.Y(12.3), 20, 22, 2);
  const cy = e.Y(h - 0.85);
  const gaps: [number, number][] = [[e.X(14.9), e.X(16.6)]];
  e.cornice(cy, { gaps });
  e.coping(e.r.stone, 3, gaps);
  for (let f = 1; f < 3; f++) e.band(e.Y(GROUND_H + FLOOR_H * f - 0.1), 4, e.r.stone, { gaps: f === 1 ? [[e.X(13.2), e.X(13.9)]] : undefined });
  // Bays: a piered, narrower centre (three windows), two wider side bays.
  const cols = [1.9, 4.2, 7.4, 9.0, 10.6, 13.3, 15.6];
  const T: Row[] = [
    ['dark', 'curtain', 'broken', 'lit', 'dark', 'boarded', 'moon'],
    ['figure', 'boarded', 'lit', null, 'dark', 'dark', 'blind'],
    ['dark', 'blind', 'dark', 'tv', 'dark', 'curtain', 'dark'],
  ];
  for (let f = 0; f < 3; f++) row(e, f, cols, T[f], { w: f === 2 ? 30 : 32, h: 54, head: f === 2 ? 'hood' : 'lintel' });
  // The piers either side of the centre, in the drawn stone.
  e.pilaster(e.X(6.2), cy + 14, e.Y(GROUND_H), 8);
  e.pilaster(e.X(11.9), cy + 14, e.Y(GROUND_H), 8);
  e.drainpipe(0.45, h - 0.2);
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone);
  const sy = e.Y(3.65);
  e.shopfront(e.X(0.8), e.X(13.9), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'laundry', { hex: 0x8aa8a0 }), door: e.X(14.8), doorKind: 'lit', riser: e.k.ramp(0x3a5060, { light: 0.36 }) });
  e.pilaster(e.X(0.35), e.Y(GROUND_H - 0.1), e.H, 9);
  e.fixture(e.X(16.5), e.Y(1.8), 'box');
  e.bills(e.X(16.4), e.Y(3.4), 46, 40);
  e.scorch(e.X(7.4), sillOf(e, 1) - 54, 30, 66);
  e.crack(e.X(6.6), e.Y(13.4), 42);
  e.crack(e.X(12.8), e.Y(8.2), 30);
  e.pocks(e.X(3), e.Y(9), 300, 180, 26);
  for (let x = e.x0 + 22; x < e.x1; x += 39 + (x % 23)) e.streak(x, cy + 15, 30 + (x % 40), -1);
  light(e, { moon: 1.2 });
};

const RIALTO_COL: ElevWallColours = { wall: 0x6a2f2e, alt: 0x582a2a, brick: 0x7a3a2a, stone: 0xa48a70, frame: 0x2e2228, curtain: 0x6a2030 };

const paintRialto: PwPainter = (c, k) => {
  const w = 20;
  const h = buildingH(3);
  const e = new Elev(c, k, 53, RIALTO_COL);
  e.parapet(0, w, h);
  e.steppedGable(10, 5.5, h + 1.5, 4);
  e.bite(17.6, 1.2, 0.55);
  e.fill();
  e.courses({ density: 0.6, patch: 50 });
  e.patch(e.X(0.6), e.Y(11), 80, 40, e.r.alt);
  e.bareBrick(e.X(18.2), e.Y(11), 14, 22, 2);
  e.cornice(e.Y(h - 0.85));
  e.coping();
  // Terracotta plaque in the gable; two big blind arches over the marquee, each with a tall window.
  drawText(c, 'RIALTO', e.X(10) - textWidth('RIALTO', FONT_BOLD) / 2, e.Y(h + 0.85), FONT_BOLD, e.r.stone, 4);
  for (const cm of [4.0, 16.0]) {
    e.pool(e.X(cm), e.Y(9.4), 58, 76, 1);
  }
  row(e, 1, [4.0, 7.0, 10.0, 13.0, 16.0], ['lit', 'dark', 'curtain', 'dark', 'boarded'], { w: 36, h: 62, head: 'arch' });
  row(e, 0, [4.0, 7.0, 10.0, 13.0, 16.0], [null, 'dark', null, 'dark', null], { w: 28, h: 40, head: 'lintel' });
  // Upper-floor film posters, tatty, between the windows.
  e.poster(e.X(1.4), e.Y(8.8), 34, 46, 0x8a2a3a);
  e.poster(e.X(17.6), e.Y(8.9), 34, 46, 0x2a4a7a);
  e.band(e.Y(GROUND_H + 1.8), 3, e.r.stone);
  e.band(e.Y(GROUND_H - 0.1), 6, e.r.stone);
  const sy = e.Y(3.75);
  e.shopfront(e.X(2.6), e.X(17.4), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'lobby', { hex: 0xb86a4a }), door: e.X(9), doorKind: 'lit', frameRamp: e.k.ramp(0x241a1e, { light: 0.36 }), riser: e.k.ramp(0x5a1a24, { light: 0.36 }) });
  e.pilaster(e.X(2.2), e.Y(4.5), e.H, 10);
  e.pilaster(e.X(17.5), e.Y(4.5), e.H, 10);
  e.bills(e.X(0.5), e.Y(3.8), 50, 62);
  e.bills(e.X(17.7), e.Y(3.6), 50, 50);
  e.crack(e.X(15.5), e.Y(8.7), 34);
  e.pocks(e.X(3), e.Y(10), 400, 120, 22);
  // The marquee's warm spill on the brick above it.
  neonWash(e, 3, 17, GROUND_H - 0.3, GROUND_H + 1.5, 0x9a5238);
  lampPool(e, 8.5, 6.6, 84, 90);
  light(e, { moon: 1.0, right: 0.6 });
};

const BOARDED_COL: ElevWallColours = { wall: 0x4a5f4c, alt: 0x3c4e42, brick: 0x6a3a2c, stone: 0x847e6c, frame: 0x2c3030, curtain: 0x5a4a3a };

const paintBoarded: PwPainter = (c, k) => {
  const w = 16;
  const h = buildingH(3);
  const e = new Elev(c, k, 67, BOARDED_COL);
  e.parapet(0, w, h + 0.1);
  e.parapet(0, 3.5, h + 0.6);
  e.bite(6.6, 2.4, 0.95);
  e.bite(13.2, 1.0, 0.4);
  e.fill();
  e.courses({ density: 0.32, patch: 80 });
  e.patch(e.X(4.8), e.Y(11), 120, 42, e.r.alt);
  // Fire damage: a whole bay burnt out, the render blown off round it.
  e.bareBrick(e.X(5.2), e.Y(9.3), 38, 42, 2);
  e.bareBrick(e.X(11.6), e.Y(6.4), 26, 14, 5);
  e.bareBrick(e.X(14.4), e.Y(11.8), 16, 24, 8);
  e.cornice(e.Y(h - 0.8), { gaps: [[e.X(6.0), e.X(9.4)], [e.X(13.0), e.X(14.2)]] });
  e.coping(e.r.stone, 3, [[e.X(6.0), e.X(9.4)]]);
  e.band(e.Y(GROUND_H + FLOOR_H - 0.1), 4, e.r.stone, { gaps: [[e.X(3.8), e.X(7.2)]] });
  const T: Row[] = [
    ['boarded', 'broken', 'boarded', 'boarded', 'bricked'],
    ['boarded', 'bricked', 'broken', 'dark', 'boarded'],
  ];
  for (let f = 0; f < 2; f++) row(e, f, [2.0, 5.0, 8.0, 11.0, 14.0], T[f], { w: 32, h: 54 });
  e.scorch(e.X(5.0), sillOf(e, 0) - 56, 44, 100);
  e.scorch(e.X(8.0), sillOf(e, 1) - 56, 34, 60);
  e.drainpipe(15.4, h - 1);
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone);
  const sy = e.Y(3.65);
  e.shopfront(e.X(0.7), e.X(13.4), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'closed', { lit: false }), door: e.X(13.9), doorKind: 'dark', riser: e.k.ramp(0x4a3a3a, { light: 0.34 }) });
  // Boards over the whole front, the paint already on them.
  const gx0 = e.X(0.7);
  const gx1 = e.X(13.4);
  e.planks(gx0, e.Y(3.4), gx1 - gx0, e.Y(0.4) - e.Y(3.4));
  e.tag(e.X(1.4), e.Y(3.0), 'KEEP OUT', 0xc8e070, 0x2a3a1a, 3);
  e.tag(e.X(8.6), e.Y(2.4), 'NO EXIT', 0xe058a0, 0x2a1228, 2);
  e.bills(e.X(14.2), e.Y(2.6), 40, 50);
  e.fixture(e.X(0.2), e.Y(1.8), 'meter');
  e.crack(e.X(3.2), e.Y(10.7), 50);
  e.pocks(e.X(1), e.Y(8.5), 420, 120, 34);
  light(e, { moon: 0.6, foot: 1.2 });
};

const LIQUOR_COL: ElevWallColours = { wall: 0x5e4230, alt: 0x4c3628, brick: 0x764034, stone: 0x867c66, frame: 0x281f1c, curtain: 0x6a2a2a };

const paintLiquor: PwPainter = (c, k) => {
  const w = 16;
  const h = buildingH(2);
  const e = new Elev(c, k, 79, LIQUOR_COL);
  e.parapet(0, w, h);
  e.steppedGable(8, 3.2, h + 0.9, 3);
  e.bite(1.0, 0.8, 0.3);
  e.fill();
  e.courses({ density: 0.55, patch: 60 });
  e.bareBrick(e.X(13.7), e.Y(6.3), 18, 14, 3);
  e.cornice(e.Y(h - 0.8));
  e.coping();
  e.ghostGround(e.X(5.4), e.Y(h - 1.0), 84, 16, e.r.alt);
  row(e, 0, [2.2, 5.3, 10.7, 13.8], ['lit', 'dark', 'curtain', 'boarded'], { head: 'lintel' });
  e.band(e.Y(GROUND_H + 0.1), 4, e.r.stone);
  const sy = e.Y(3.8);
  e.shopfront(e.X(0.8), e.X(13.2), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'liquor', { hex: 0xb07a44 }), door: e.X(13.6), doorKind: 'lit', riser: e.k.ramp(0x5a2a2a, { light: 0.34 }) });
  e.fixture(e.X(14.1), e.Y(2.2), 'meter');
  e.fixture(e.X(0.1), e.Y(3.2), 'vent');
  e.bills(e.X(13.9), e.Y(3.4), 30, 40);
  e.pocks(e.X(1), e.Y(7), 300, 60, 14);
  // A security grille, half up.
  for (let x = e.X(0.9); x < e.X(13.2); x += 2) c.vline(x, sy + 30, 56, e.r.iron, 1 + ((x >> 1) & 1));
  neonWash(e, 3.6, 12.4, GROUND_H - 0.2, GROUND_H + 1.0, 0x8a3a30);
  light(e, { moon: 0.8 });
};

const BLUE_COL: ElevWallColours = { wall: 0x3d4f6c, alt: 0x33405a, brick: 0x6e3a30, stone: 0x7a8088, frame: 0x262a34, curtain: 0x5a3a2a };

const paintBillboardBlock: PwPainter = (c, k) => {
  const w = 14;
  const h = buildingH(3);
  const e = new Elev(c, k, 97, BLUE_COL);
  e.parapet(0, w, h - 0.2);
  e.parapet(10.2, 14, h + 0.3);
  e.bite(6.8, 1.0, 0.4);
  e.fill();
  e.courses({ density: 0.5, patch: 62 });
  e.bareBrick(e.X(2.8), e.Y(11.2), 30, 20, 3);
  e.bareBrick(e.X(11.5), e.Y(7.1), 20, 18, 4);
  e.cornice(e.Y(h - 0.9));
  e.coping();
  const T: Row[] = [
    ['dark', 'moon', 'dark', 'boarded'],
    ['curtain', 'dark', 'broken', 'dark'],
  ];
  for (let f = 0; f < 2; f++) row(e, f, [2.2, 5.6, 9.0, 11.9], T[f], { w: 30 });
  // Ground floor: a tenement door between two barred windows.
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone);
  e.window(e.X(2.2) - 19, e.Y(2.8), 38, 44, 'dark', { head: 'lintel', sill: true });
  e.window(e.X(11.0) - 19, e.Y(2.8), 38, 44, 'boarded', { head: 'lintel', sill: true });
  const dx = e.X(6.2);
  c.rect(dx, e.Y(3.1), 54, e.Y(0) - e.Y(3.1), e.r.stone, 3);
  c.rect(dx + 7, e.Y(2.9), 40, e.Y(0) - e.Y(2.9), e.r.ink, 1);
  c.rect(dx + 9, e.Y(2.7), 36, e.Y(0) - e.Y(2.7), e.r.wood, 2.2);
  c.rect(dx + 14, e.Y(2.5), 26, 26, e.r.glassDark, 2);
  e.tag(e.X(8.4), e.Y(1.9), 'DEAD', 0x60c8d8, 0x12282a, 2);
  e.pocks(e.X(1), e.Y(7), 300, 60, 18);
  e.drainpipe(13.5, h - 1);
  e.bills(e.X(4.2), e.Y(2.3), 34, 44);
  e.fixture(e.X(11.0), e.Y(2.4) + 60, 'box');
  light(e, { moon: 0.9 });
};

// ─── Main Street, west side ─────────────────────────────────────────────────

const HOTEL_COL: ElevWallColours = { wall: 0x70362c, alt: 0x5f3028, brick: 0x7a3a2e, stone: 0x9a8a70, frame: 0x2a221e, curtain: 0x6a3a2a };

const paintHotel: PwPainter = (c, k) => {
  const w = 22;
  const h = buildingH(4);
  const e = new Elev(c, k, 113, HOTEL_COL);
  e.parapet(0, w, h - 0.05);
  e.curvedGable(11, 5, h + 1.3);
  e.bite(19.6, 1.3, 0.5);
  e.bite(4.2, 0.6, 0.3);
  e.fill();
  e.courses({ density: 0.5, patch: 56 });
  e.patch(e.X(14.0), e.Y(13.6), 120, 40, e.r.alt);
  e.bareBrick(e.X(17.5), e.Y(7.9), 22, 16, 3);
  e.cornice(e.Y(h - 0.9), { gaps: [[e.X(19.5), e.X(20.8)]] });
  e.coping(e.r.stone, 3, [[e.X(19.5), e.X(20.8)]]);
  for (let f = 1; f < 3; f++) e.band(e.Y(GROUND_H + FLOOR_H * f - 0.1), 5, e.r.stone);
  // A long sign band under the top cornice, what is left of the hotel's name in paint.
  drawText(c, 'MILLBROOK HOTEL', e.X(11) - textWidth('MILLBROOK HOTEL', FONT_BOLD, { spacing: 2 }) / 2, e.Y(h - 1.15), FONT_BOLD, e.r.stone, 4, { spacing: 2 });
  const cols = [2.2, 5.3, 8.4, 11.0, 13.6, 16.7, 19.8];
  const T: Row[] = [
    ['curtain', 'dark', 'moon', null, 'boarded', 'dark', 'dark'],
    ['dark', 'lit', 'dark', 'figure', 'dark', 'broken', 'blind'],
    ['blind', 'dark', 'curtain', 'dark', 'dark', 'dark', 'boarded'],
  ];
  for (let f = 0; f < 3; f++) row(e, f, cols, T[f], { w: 30, h: 52, head: f === 2 ? 'arch' : 'lintel' });
  e.band(e.Y(GROUND_H - 0.05), 7, e.r.stone);
  const sy = e.Y(3.8);
  e.shopfront(e.X(1.1), e.X(20.3), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'lobby', { hex: 0xc4894a }), door: e.X(10.0), doorKind: 'lit', bays: 7, frameRamp: e.k.ramp(0x2a241f, { light: 0.34 }), riser: e.k.ramp(0x5c3a30, { light: 0.34 }) });
  e.drainpipe(0.45, h - 0.3);
  e.bills(e.X(20.5), e.Y(3.2), 40, 60);
  e.fixture(e.X(0.8), e.Y(2.0), 'meter');
  e.scorch(e.X(16.7), sillOf(e, 1) - 54, 32, 66);
  e.crack(e.X(9), e.Y(12.3), 46);
  lampPool(e, 11, 7.2, 90, 100);
  e.pocks(e.X(2), e.Y(9), 420, 200, 28);
  light(e, { moon: 1.1 });
};

const CAFE_COL: ElevWallColours = { wall: 0x806e4a, alt: 0x70603e, brick: 0x703c2c, stone: 0xa89c80, frame: 0x32402f, curtain: 0x9a6a2a };

const paintCafe: PwPainter = (c, k) => {
  const w = 18;
  const h = buildingH(2);
  const e = new Elev(c, k, 127, CAFE_COL);
  e.parapet(0, w, h + 0.1);
  e.steppedGable(9, 3.4, h + 1.0, 3);
  e.bite(15.6, 1.5, 0.5);
  e.fill();
  e.courses({ density: 0.25, patch: 90 });
  e.patch(e.X(0.8), e.Y(8.9), 130, 40, e.r.alt);
  e.bareBrick(e.X(3.4), e.Y(7.0), 16, 14, 2);
  e.bareBrick(e.X(14.4), e.Y(8.8), 22, 16, 6);
  e.cornice(e.Y(h - 0.8), { gaps: [[e.X(15.5), e.X(17.1)]] });
  e.coping(e.r.stone, 3, [[e.X(15.5), e.X(17.1)]]);
  // Upper windows with shutters; one shutter dropped on its hinge.
  const kinds: Row = ['curtain', 'dark', 'lit', 'dark', 'broken'];
  const cols = [2.6, 6.0, 9.4, 12.8, 16.0];
  row(e, 0, cols, kinds, { head: 'hood' });
  cols.forEach((cm, i) => e.shutters(e.X(cm) - 17, sillOf(e, 0) - 54, 34, 54, 0x3a5a4a, i === 3 ? 'hang' : 'open'));
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone);
  const sy = e.Y(3.8);
  e.shopfront(e.X(0.9), e.X(14.4), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'cafe', { hex: 0xa07840 }), door: e.X(15), doorKind: 'lit', frameRamp: e.k.ramp(0x2a3a2a, { light: 0.34 }), riser: e.k.ramp(0x4a3a2a, { light: 0.34 }) });
  e.bills(e.X(16.0), e.Y(3.8), 42, 56);
  e.fixture(e.X(16.2), e.Y(1.6), 'box');
  e.crack(e.X(5), e.Y(9.0), 28);
  e.pocks(e.X(1), e.Y(7.6), 340, 50, 12);
  light(e, { moon: 0.9 });
};

const W4_COL: ElevWallColours = { wall: 0x5a3e2c, alt: 0x4a3626, brick: 0x704030, stone: 0x847a64, frame: 0x262320, curtain: 0x6a3a3a };

const paintW4: PwPainter = (c, k) => {
  const w = 16;
  const h = buildingH(3);
  const e = new Elev(c, k, 139, W4_COL);
  e.parapet(0, w, h);
  e.curvedGable(8, 2.6, h + 0.8);
  e.bite(11.6, 1.0, 0.4);
  e.fill();
  e.courses({ density: 0.58, patch: 56 });
  e.bareBrick(e.X(13.8), e.Y(11.5), 20, 26, 4);
  e.cornice(e.Y(h - 0.85));
  e.coping();
  const T: Row[] = [
    ['dark', 'lit', 'dark', 'moon', 'curtain'],
    ['moon', 'broken', 'dark', 'boarded', 'dark'],
  ];
  for (let f = 0; f < 2; f++) row(e, f, [2.0, 5.0, 8.0, 11.0, 14.0], T[f], { w: 30, head: f === 1 ? 'arch' : 'lintel' });
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone);
  e.window(e.X(3.2) - 19, e.Y(2.9), 40, 46, 'dark', { head: 'lintel' });
  e.window(e.X(13.2) - 19, e.Y(2.9), 40, 46, 'boarded', { head: 'lintel' });
  const dx = e.X(7);
  c.rect(dx, e.Y(3.3), 58, e.Y(0) - e.Y(3.3), e.r.stone, 3);
  c.rect(dx + 7, e.Y(3.1), 44, e.Y(0) - e.Y(3.1), e.r.ink, 1);
  c.rect(dx + 9, e.Y(2.9), 40, e.Y(0) - e.Y(2.9), e.r.wood, 2);
  c.rect(dx + 14, e.Y(2.7), 30, 26, e.r.glassDark, 2);
  e.drainpipe(15.5, h - 1);
  e.tag(e.X(1.0), e.Y(1.7), 'RUN', 0xe89a38, 0x3a1e08, 2);
  e.bills(e.X(10.2), e.Y(2.2), 40, 44);
  e.fixture(e.X(5.5), e.Y(2.2), 'meter');
  e.fixture(e.X(5.5), e.Y(3.5), 'vent');
  e.pocks(e.X(1), e.Y(8.5), 380, 90, 22);
  light(e, { moon: 1.0 });
};

const W6_COL: ElevWallColours = { wall: 0x3e5470, alt: 0x34435c, brick: 0x6a3a2e, stone: 0x828a90, frame: 0x262a34, curtain: 0x4a5a6a };

const paintW6: PwPainter = (c, k) => {
  const w = 16;
  const h = buildingH(3);
  const e = new Elev(c, k, 151, W6_COL);
  e.parapet(0, w, h + 0.1);
  e.parapet(0, 6.4, h + 0.55);
  e.bite(9.6, 1.5, 0.75);
  e.fill();
  e.courses({ density: 0.44, patch: 70 });
  e.bareBrick(e.X(3.2), e.Y(11.2), 24, 26, 2);
  e.bareBrick(e.X(9.5), e.Y(6.8), 32, 16, 5);
  e.cornice(e.Y(h - 0.85), { gaps: [[e.X(9.4), e.X(11.4)]] });
  e.coping(e.r.stone, 3, [[e.X(9.4), e.X(11.4)]]);
  const T: Row[] = [
    ['dark', 'boarded', 'curtain', 'dark', 'broken'],
    ['boarded', 'moon', 'dark', 'dark', 'lit'],
  ];
  for (let f = 0; f < 2; f++) row(e, f, [2.0, 5.0, 8.0, 11.0, 14.0], T[f], { w: 32 });
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone);
  // A roller shutter over the whole ground floor, sprayed.
  const sy = e.Y(3.8);
  const sx0 = e.X(0.7);
  const sx1 = e.X(14.4);
  c.rect(sx0, sy + 6, sx1 - sx0, e.Y(0.55) - sy - 6, e.r.iron, 2.4);
  for (let y = sy + 8; y < e.Y(0.55); y += 3) c.hline(sx0, y, sx1 - sx0, e.r.iron, 1 + ((y >> 1) & 1));
  c.rect(sx0 - 3, sy, sx1 - sx0 + 6, 6, e.r.stone, 3);
  c.rect(sx0, e.Y(0.55), sx1 - sx0, e.H - e.Y(0.55), e.r.brick, 2);
  e.tag(sx0 + 40, sy + 26, 'THEY ARE', 0xe058a0, 0x2a1228, 3);
  e.tag(sx0 + 240, sy + 50, 'INSIDE', 0x70e0a0, 0x12301e, 3);
  e.window(e.X(15.0) - 14, e.Y(2.9), 28, 46, 'dark', { head: 'lintel' });
  e.fixture(e.X(14.6), e.Y(1.1), 'box');
  e.pocks(e.X(1), e.Y(8.5), 380, 110, 26);
  light(e, { moon: 0.8, foot: 1.1 });
};

const BAR_COL: ElevWallColours = { wall: 0x565864, alt: 0x4a4c58, brick: 0x703c3c, stone: 0x8a8690, frame: 0x241f24, curtain: 0x7a2a4a };

const paintBar: PwPainter = (c, k) => {
  const w = 14;
  const h = buildingH(2);
  const e = new Elev(c, k, 163, BAR_COL);
  e.parapet(0, w, h);
  e.steppedGable(7, 2.4, h + 0.7, 3);
  e.fill();
  e.courses({ density: 0.3, patch: 80 });
  e.bareBrick(e.X(2.2), e.Y(7.8), 18, 20, 3);
  e.cornice(e.Y(h - 0.8));
  e.coping();
  row(e, 0, [2.6, 7.0, 11.4], ['curtain', 'dark', 'figure'], {});
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone);
  const sy = e.Y(3.9);
  e.shopfront(e.X(0.8), e.X(11.2), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'bar', { hex: 0x9a4a72 }), door: e.X(11.6), doorKind: 'lit', frameRamp: e.k.ramp(0x241a24, { light: 0.34 }), riser: e.k.ramp(0x3a2234, { light: 0.34 }) });
  neonWash(e, 2.5, 10.5, GROUND_H - 0.2, GROUND_H + 1.0, 0x8a3a60);
  e.bills(e.X(11.8), e.Y(3.6), 30, 44);
  e.pocks(e.X(1), e.Y(7), 300, 50, 12);
  light(e, { moon: 0.8 });
};

// ─── The boss square ────────────────────────────────────────────────────────

const MEATS_COL: ElevWallColours = { wall: 0x6a5048, alt: 0x584238, brick: 0x703a30, stone: 0xa49a84, frame: 0x241c1c, curtain: 0x5a2a2a };

const paintMeats: PwPainter = (c, k) => {
  const w = 16;
  const h = buildingH(2);
  const e = new Elev(c, k, 181, MEATS_COL);
  e.parapet(0, w, h + 0.05);
  e.steppedGable(8, 4.4, h + 1.3, 4);
  e.bite(1.4, 0.8, 0.3);
  e.fill();
  e.courses({ density: 0.6, patch: 52 });
  e.bareBrick(e.X(14.6), e.Y(6.2), 18, 24, 2);
  e.cornice(e.Y(h - 0.8));
  e.coping();
  // Datestone in the gable, blood-dark streaks down from the sign.
  drawText(c, '1908', e.X(8) - textWidth('1908', FONT_5x7) / 2, e.Y(h + 0.85), FONT_5x7, e.r.stone, 4);
  row(e, 0, [2.2, 5.2, 8.0, 10.8, 13.8], ['dark', 'lit', 'dark', 'figure', 'dark'], { w: 32, h: 50, head: 'lintel' });
  e.band(e.Y(GROUND_H + 0.1), 5, e.r.stone);
  // The doorway's stone surround is drawn here; the shop's windows and doors stay the stage's own, in front.
  e.pilaster(e.X(5.8), e.Y(3.9), e.H, 12);
  e.pilaster(e.X(9.8), e.Y(3.9), e.H, 12);
  c.rect(e.X(5.4), e.Y(4.0), e.X(10.6) - e.X(5.4), 12, e.r.stone, 3);
  c.hline(e.X(5.4), e.Y(4.0), e.X(10.6) - e.X(5.4), e.r.stone, 4);
  // Wall behind the display windows: dark, it is lit red by the sign.
  const red = e.k.ramp(0x7a3028, { light: 0.34, sat: 1.05, dark: 0.45 });
  e.pool(e.X(8), e.Y(5.2), 210, 56, 2, red);
  // Blood down the wall from the sign.
  for (const x of [e.X(3.4), e.X(11.5), e.X(12.4)]) {
    for (let j = 0; j < 34; j++) c.tint(x + (j >> 5), e.Y(4.6) + j, red, -1);
  }
  e.pocks(e.X(1), e.Y(8), 400, 70, 14);
  light(e, { moon: 0.7, foot: 0.8, right: 0.5 });
};

const BANK_COL: ElevWallColours = { wall: 0x7a6e5a, alt: 0x665c4c, brick: 0x6a3a2e, stone: 0x908672, frame: 0x24242a };

const paintBank: PwPainter = (c, k) => {
  const w = 20;
  const h = buildingH(2);
  const e = new Elev(c, k, 193, BANK_COL);
  e.parapet(0, w, h);
  e.parapet(1.6, 18.4, h + 0.45);
  e.curvedGable(10, 4.2, h + 1.2);
  e.bite(17.0, 1.1, 0.45);
  e.fill();
  // Coursed stone: long, low blocks with a shadow joint, drawn in patches like the brick.
  e.courses({ ramp: e.r.wall, density: 0.7, patch: 110, course: 8, len: 22 });
  e.patch(e.X(0.8), e.Y(8.6), 130, 44, e.r.alt);
  e.bareBrick(e.X(18.3), e.Y(9.2), 14, 22, 4);
  e.cornice(e.Y(h - 0.7), { gaps: [[e.X(16.9), e.X(18.2)]] });
  e.coping(e.r.stone, 3, [[e.X(16.9), e.X(18.2)]]);
  drawText(c, 'FIRST NATIONAL', e.X(10) - textWidth('FIRST NATIONAL', FONT_BOLD, { spacing: 1 }) / 2, e.Y(h - 0.95), FONT_BOLD, e.r.ink, 1, { spacing: 1 });
  // A pedimented centre over four pilasters (drawn: fluted, with a capital), then the arched windows.
  const yCap = e.Y(h - 1.3);
  const yBase = e.Y(GROUND_H - 1.8);
  for (const x of [5.0, 8.0, 12.0, 15.0]) {
    e.pilaster(e.X(x) - 6, yCap + 6, yBase, 12);
    for (let i = 3; i < 11; i += 3) c.vline(e.X(x) - 6 + i, yCap + 8, yBase - yCap - 10, e.r.stone, 2.2);
    c.rect(e.X(x) - 8, yCap, 16, 6, e.r.stone, 3);
    c.hline(e.X(x) - 8, yCap, 16, e.r.stone, 4);
    c.hline(e.X(x) - 8, yCap + 5, 16, e.r.stone, 1);
  }
  // Triangle pediment over the centre with a clock in it.
  const px0 = e.X(4.2);
  const px1 = e.X(15.8);
  const py1 = e.Y(h - 1.05);
  const py0 = e.Y(h + 0.15);
  c.poly([px0, py1, px1, py1, (px0 + px1) / 2, py0], e.r.stone, 3);
  c.line(px0, py1, (px0 + px1) / 2, py0, e.r.stone, 4);
  c.line(px1, py1, (px0 + px1) / 2, py0, e.r.stone, 1);
  c.ellipse((px0 + px1) / 2, py1 - 20, 12, 12, e.r.ink, 1);
  c.ellipse((px0 + px1) / 2, py1 - 20, 10, 10, e.r.lamp, 3, PWF.GLOW);
  c.line((px0 + px1) / 2, py1 - 20, (px0 + px1) / 2 + 5, py1 - 25, e.r.ink, 0.5, PWF.GLOW);
  c.line((px0 + px1) / 2, py1 - 20, (px0 + px1) / 2 - 1, py1 - 12, e.r.ink, 0.5, PWF.GLOW);
  row(e, 0, [2.8, 6.5, 13.5, 17.2], ['dark', 'moon', 'lit', 'dark'], { w: 32, h: 66, head: 'arch' });
  row(e, 0, [10], ['figure'], { w: 34, h: 70, head: 'arch' });
  e.band(e.Y(GROUND_H - 0.1), 7, e.r.stone);
  // Ground floor: barred windows, the night deposit, a heavy door (the board sign goes above it).
  const sy = e.Y(3.6);
  e.shopfront(e.X(1.0), e.X(19.0), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'closed', { lit: false, hex: 0x323e50 }), door: e.X(9), doorKind: 'dark', bays: 6, riser: e.r.stone, frameRamp: e.k.ramp(0x2a2a30, { light: 0.34 }) });
  for (let x = e.X(1.0); x < e.X(19); x += 3) c.vline(x, e.Y(2.8), 60, e.r.iron, 1 + (x & 1));
  e.crack(e.X(3.5), e.Y(9.3), 30);
  e.crack(e.X(16.4), e.Y(7.5), 34);
  e.pocks(e.X(2), e.Y(9), 460, 110, 20);
  e.fixture(e.X(0.3), e.Y(2.0), 'box');
  light(e, { moon: 0.9, foot: 0.8, right: 0.5 });
};

const SHUT_COL: ElevWallColours = { wall: 0x856a50, alt: 0x745c44, brick: 0x6e3a2c, stone: 0x9a8e74, frame: 0x2e2822, curtain: 0x8a5a3a };

const paintShutterBlock: PwPainter = (c, k) => {
  const w = 20;
  const h = buildingH(3);
  const e = new Elev(c, k, 207, SHUT_COL);
  e.parapet(0, w, h + 0.05);
  e.curvedGable(10, 4.4, h + 1.2);
  e.bite(17.0, 1.2, 0.5);
  e.fill();
  e.courses({ density: 0.32, patch: 84 });
  e.patch(e.X(0.8), e.Y(11.2), 140, 46, e.r.alt);
  e.bareBrick(e.X(7.6), e.Y(9.6), 22, 18, 3);
  e.bareBrick(e.X(18.2), e.Y(7.2), 22, 30, 4);
  e.cornice(e.Y(h - 0.85), { gaps: [[e.X(16.9), e.X(18.3)]] });
  e.coping(e.r.stone, 3, [[e.X(16.9), e.X(18.3)]]);
  e.band(e.Y(GROUND_H + FLOOR_H - 0.1), 5, e.r.stone);
  const T: Row[] = [
    ['dark', 'lit', 'blind', 'dark', 'curtain', 'boarded', 'dark'],
    ['moon', 'dark', 'boarded', 'figure', 'dark', 'dark', 'broken'],
  ];
  for (let f = 0; f < 2; f++) row(e, f, [1.8, 4.9, 8, 10.2, 12.4, 15.5, 18.3], T[f], { w: 32, head: f === 1 ? 'hood' : 'lintel' });
  // A roller shutter the whole length, and the awning over it (a card).
  const sy = e.Y(3.9);
  const sx0 = e.X(1.0);
  const sx1 = e.X(19.0);
  c.rect(sx0, sy + 8, sx1 - sx0, e.Y(0.6) - sy - 8, e.r.iron, 2.6);
  for (let y = sy + 10; y < e.Y(0.6); y += 3) c.hline(sx0, y, sx1 - sx0, e.r.iron, 1 + ((y >> 1) & 1));
  for (let x = sx0 + 4; x < sx1; x += 96) {
    c.vline(x, sy + 8, 80, e.r.iron, 1);
    c.vline(x + 1, sy + 8, 80, e.r.iron, 3.6);
  }
  c.rect(sx0 - 3, sy, sx1 - sx0 + 6, 8, e.r.stone, 3);
  c.hline(sx0 - 3, sy, sx1 - sx0 + 6, e.r.stone, 4);
  c.rect(sx0 - 3, e.Y(0.6), sx1 - sx0 + 6, e.H - e.Y(0.6), e.k.ramp(0x4a2e22, { light: 0.32 }), 2.4);
  e.tag(sx0 + 60, sy + 26, 'GO HOME', 0xc08ce8, 0x201030, 3);
  e.tag(sx0 + 330, sy + 40, 'NO ONE LEFT', 0xc8e070, 0x2a3a1a, 2);
  e.pocks(e.X(1), e.Y(9), 500, 110, 24);
  e.drainpipe(0.4, h - 1);
  light(e, { moon: 1.0, foot: 1.0, right: 0.4 });
};

// ─── Cards ──────────────────────────────────────────────────────────────────

/** A canvas awning seen from the street, cut out, scalloped, as one card. */
function awning(id: string, wM: number, hex: number, stripe: number, x: number, y: number, z: number, o: { torn?: boolean } = {}): FlatCardDef {
  const tw = Math.round(wM * FLAT_TPM);
  const th = 38;
  return {
    id,
    tw,
    th,
    x,
    y,
    z,
    paint: (c, k) => {
      const a = k.ramp(hex, { light: 0.36, sat: 0.95, dark: 0.42 });
      const b = k.ramp(stripe, { light: 0.36, sat: 0.9, dark: 0.42 });
      const ink = k.ramp(0x201c2c, { light: 0.3 });
      const SW = 14;
      for (let x = 0; x < tw; x++) {
        const stripeN = Math.floor(x / SW);
        const ramp = stripeN % 2 ? a : b;
        // The sloped canvas (top rows brighter), then the valance.
        for (let y = 0; y < th - 10; y++) {
          const t = y < 2 ? 4 : y > th - 16 ? 2.2 : 3.2 - y * 0.03;
          c.set(x, y, ramp, t);
        }
        const v = (x % SW) / SW;
        const drop = Math.round(Math.sin(v * Math.PI) * 5);
        for (let y = th - 10; y < th - 6 + drop; y++) c.set(x, y, ramp, y < th - 7 ? 3.4 : 2.2);
      }
      c.hline(0, th - 11, tw, ink, 1);
      if (o.torn) {
        // A rip: the canvas gone, a strip hanging.
        const rx = Math.round(tw * 0.7);
        for (let x = rx; x < rx + 30; x++) for (let y = 4; y < th; y++) c.set(x, y, 0, 0);
        for (let y = 2; y < th - 2; y++) c.set(rx + 3, y, a, 2);
      }
    },
  };
}

/** Fire-escape ironwork as a cut-out card: landings, rails, stairs, the drop ladder, one storey per `FLOOR_H`. */
function fireEscape(id: string, floors: number, x: number, z: number): FlatCardDef {
  const tw = 118;
  const th = Math.round((FLOOR_H * (floors - 1) + 2.4) * FLAT_TPM);
  return {
    id,
    tw,
    th,
    x,
    y: GROUND_H - 2.2,
    z,
    paint: (c, k) => {
      const iron = k.ramp(0x363842, { light: 0.4, sat: 0.6, dark: 0.45 });
      const H = c.h;
      const levels = floors - 1;
      for (let l = 0; l < levels; l++) {
        const y = H - 72 - l * Math.round(FLOOR_H * FLAT_TPM);
        // Landing and its slatted edge, railings.
        c.rect(0, y, tw, 3, iron, 3);
        c.hline(0, y, tw, iron, 4);
        for (let x = 0; x < tw; x += 5) c.set(x, y + 2, iron, 1);
        c.hline(0, y - 26, tw, iron, 3);
        for (let x = 0; x < tw; x += 9) c.vline(x, y - 26, 26, iron, 2);
        // Stairs up to the next landing.
        if (l < levels - 1) {
          const y2 = y - Math.round(FLOOR_H * FLAT_TPM);
          for (let i = 0; i < 9; i++) {
            const sx = 16 + i * 8;
            const sy = y - 4 - i * Math.round((y - 4 - y2 - 4) / 9);
            c.rect(sx, sy, 8, 2, iron, 3);
            c.set(sx + 8, sy + 2, iron, 1);
          }
          c.line(14, y - 4, 16 + 9 * 8, y2 + 2, iron, 2);
        }
      }
      // Drop ladder under the first landing, pulled up.
      for (let i = 0; i < 2; i++) c.vline(92 + i * 12, H - 70, 70, iron, 2);
      for (let y = H - 66; y < H - 2; y += 7) c.hline(92, y, 13, iron, 3);
    },
  };
}

/** A rooftop advert on a steel frame (a card behind the parapet of `w`-wide building). */
function billboardCard(w: number): FlatCardDef {
  const tw = Math.round(7.2 * FLAT_TPM);
  const th = Math.round(4.0 * FLAT_TPM);
  return {
    id: 'bb',
    tw,
    th,
    x: 7.9 - w / 2,
    y: buildingH(3) - 0.4,
    z: -1.0,
    paint: (c, k) => {
      const iron = k.ramp(0x363842, { light: 0.4, sat: 0.6, dark: 0.45 });
      const ad = k.ramp(0xa84a30, { light: 0.4, sat: 1.0, dark: 0.45 });
      const cream = k.ramp(0xd8c8a0, { light: 0.34 });
      const y0 = 8;
      const y1 = th - 30;
      for (const lx of [24, tw - 24, tw / 2]) {
        c.rect(lx - 1, y1, 3, th - y1, iron, 2);
        c.line(lx - 16, th - 2, lx, y1 + 2, iron, 2);
      }
      c.rect(0, y0, tw, y1 - y0, ad, 3);
      c.frame(0, y0, tw, y1 - y0, iron, 2);
      drawText(c, 'DRINK', 24, y0 + 12, FONT_BOLD, cream, 4, { scale: 2 });
      drawText(c, 'COLA', 56, y0 + 42, FONT_BOLD, cream, 3.6, { scale: 2 });
      // Torn away in great strips, the bare hoarding behind.
      c.poly([tw - 66, y0, tw - 30, y0, tw - 50, y1 - 18], 0, 0);
      c.poly([6, y1, 70, y1, 16, y1 - 26], 0, 0);
      c.outline(0, true);
    },
  };
}

/** Three gold balls on a bracket (the pawnbroker's sign). */
function pawnBalls(): FlatCardDef {
  return {
    id: 'balls',
    tw: 48,
    th: 44,
    x: 3.5,
    y: 4.8,
    z: 0.6,
    paint: (c, k) => {
      const gold = k.ramp(0xc8a040, { light: 0.4, sat: 1.0, dark: 0.45 });
      const iron = k.ramp(0x363842, { light: 0.4, sat: 0.6, dark: 0.45 });
      c.hline(2, 2, 44, iron, 3);
      c.vline(23, 2, 8, iron, 2);
      const ball = (cx: number, cy: number) => {
        c.ellipse(cx, cy, 8, 8, gold, (u, v) => 3.2 - u * 0.9 - v * 0.9, PWF.GLOW);
        c.set(cx - 3, cy - 3, gold, 5, PWF.GLOW);
      };
      ball(10, 18);
      ball(36, 18);
      ball(23, 34);
    },
  };
}

// ─── The catalogue ─────────────────────────────────────────────────────────

const AW_NAVY = 0x253a6a;
const AW_CREAM = 0xb0a68a;

export const Z1_FLATS: FlatDef[] = [
  flat('pawn', 18, buildingH(2), 1.6, paintPawn, [pawnBalls()]),
  flat('laundry', 18, buildingH(4), 1.15, paintLaundry, [awning('awn', 13.6, AW_NAVY, AW_CREAM, -1.6, 3.3, 0.75), fireEscape('fe', 4, 4.8, 0.45)]),
  flat('rialto', 20, buildingH(3), 1.5, paintRialto),
  flat('boarded', 16, buildingH(3), 0.6, paintBoarded, [awning('awn', 14, 0x6a2424, AW_CREAM, -0.4, 3.3, 0.7, { torn: true })]),
  flat('liquor', 16, buildingH(2), 0.9, paintLiquor),
  flat('billblock', 14, buildingH(3), 0.3, paintBillboardBlock, [fireEscape('fe', 3, -3.2, 0.45), billboardCard(14)]),
  flat('hotel', 22, buildingH(4), 1.3, paintHotel, [awning('awn', 19.5, 0x5a1a1a, AW_CREAM, 0, 3.4, 0.8)]),
  flat('cafe', 18, buildingH(2), 1.0, paintCafe, [awning('awn', 13.8, 0x7a5a1f, AW_CREAM, -1.6, 3.3, 0.75)]),
  flat('w4', 16, buildingH(3), 0.8, paintW4, [fireEscape('fe', 3, 3.8, 0.45)]),
  flat('w6', 16, buildingH(3), 0.6, paintW6),
  flat('bar', 14, buildingH(2), 0.7, paintBar),
  flat('meats', 16, buildingH(2), 1.3, paintMeats),
  flat('bank', 20, buildingH(2), 1.3, paintBank),
  flat('shutterblock', 20, buildingH(3), 1.2, paintShutterBlock, [awning('awn', 18.5, 0x2a4a3a, AW_CREAM, 0, 3.35, 0.8)]),
];

void ({} as RoomKind);
