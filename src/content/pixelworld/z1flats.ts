import type { PwPainter } from './atlas';
import { bayer, PWF } from './canvas';
import { Elev, FLAT_PAD, FLAT_TPM, vnoise, type ElevWallColours, type WinKind } from './elevation';
import { hash2 } from './surfaces';
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
  /** Re-use another flat's painting (no new texels: only where nobody will notice). */
  reuse?: string;
  /** Multiplied onto the painting (a re-used flat's own tint). */
  tint?: number;
  /** Metres to shift the card along the wall (a re-used flat that is not exactly the old building's width). */
  xOffset?: number;
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
  w4: [['tank', 11.0], ['chim', 14.2, 1.0], ['vent', 8.2]],
  w6: [['chim', 2.5, 1.0], ['vent', 8.2], ['aerial', 11.8, 2]],
  bar: [['chim', 2.4, 1.0], ['tank', 10.6], ['vent', 6.6]],
  meats: [['chim', 2.2, 1.0], ['chim3', 13.8, 1.3], ['vent', 11.2]],
  bank: [['vent', 4.2], ['chim', 16.8, 1.0], ['aerial', 2.4, 2]],
  shutterblock: [['chim', 3.0, 1.0], ['tank', 15.2], ['aerial', 9.6, 2]],
  cornerW: [['tank', 3.6], ['chim', 8.0, 1.0], ['aerial', 13.0, 2]],
  cornerE: [['chim', 7.4, 1.0], ['chim3', 12.2, 1.3], ['aerial', 9.6, 3]],
};

const WALL_ROOF: ElevWallColours = { wall: 0x6a6a70, brick: 0x76402f, stone: 0x908a7c };

/** The card of one roof item (its Elev sized to the item), standing on the wall's top line behind it. */
function roofCard(buildingId: string, i: number, it: RoofItem, wM: number, hTop: number): FlatCardDef {
  const [kind, xM, a] = it;
  const cw = kind === 'tank' ? 4.3 : kind === 'aerial' ? 1.4 : (a ?? (kind === 'chim3' ? 1.4 : 1.1)) + 0.6;
  const ch = kind === 'tank' ? 7.6 : kind === 'chim3' ? 4.2 : kind === 'chim' ? 3.3 : kind === 'aerial' ? 3.8 : 1.8;
  const seed = (i + 1) * 37 + buildingId.length * 91;
  return {
    id: `r${i}`,
    tw: Math.round(cw * FLAT_TPM),
    th: Math.round(ch * FLAT_TPM),
    x: xM - wM / 2,
    // (Lower than the parapet's old line, so a dropped stretch of roofline never shows a card's foot.)
    y: hTop - 0.85,
    // (A tank stands close behind the wall, its legs clear of the parapet from the road; the rest step back a little for parallax.)
    z: kind === 'tank' ? -0.55 : -1.1 - (i % 3) * 0.3,
    paint: (c, k) => {
      const e = new Elev(c, k, seed, WALL_ROOF, 0);
      const mid = cw / 2;
      if (kind === 'tank') e.tank(mid, 0.75);
      else if (kind === 'chim') e.chimney(mid, a ?? 1, ch - 0.15, 0, { pots: 2 });
      else if (kind === 'chim3') e.chimney(mid, a ?? 1.3, ch - 0.15, 0, { pots: 3 });
      else if (kind === 'vent') e.vent(mid, 0.6);
      else e.aerial(mid, 0.6, ch - 0.7, a ?? 2);
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
function row(e: Elev, f: number, cols: number[], kinds: Row, o: { w?: number; h?: number; head?: 'lintel' | 'arch' | 'hood' | 'none'; dy?: number } = {}) {
  const w = o.w ?? 34;
  const h = o.h ?? 54;
  const s = sillOf(e, f) + (o.dy ?? 0);
  cols.forEach((cm, i) => {
    const k = kinds[i % kinds.length];
    if (!k) return;
    const x = e.X(cm) + e.lean(s, 4) - Math.round(w / 2);
    e.window(x, s - h, w, h, k, { head: o.head });
  });
}

/** The picture's own light: moon on the upper left, street lamps low, shade to the right and the foot. (A step per pass: no paint slice runs long.) */
function* light(e: Elev, o: { moon?: number; foot?: number; right?: number; shadow?: { x0M: number; y0M: number; x1M: number; y1M: number; second?: { x0M: number; y0M: number; x1M: number; y1M: number } }; lamp?: { xM: number; yM: number; rx: number; ry: number } } = {}): Generator<void, void, void> {
  e.finish();
  yield;
  const { H, W } = e;
  const foot = o.foot ?? 1;
  const moon = o.moon ?? 1;
  const right = o.right ?? 0.8;
  e.value((_x, y) => (y > e.Y(2.2) ? Math.min(1, (y - e.Y(2.2)) / (e.Y(0.3) - e.Y(2.2))) * foot : 0), -1, 0.14, { y0: e.Y(2.2) });
  yield;
  e.value((x, y) => Math.max(0, 1 - y / (H * 0.5)) * Math.max(0, 1.1 - x / (W * 0.65)) * moon, 1, 0.14, { y1: Math.ceil(H * 0.5), x1: Math.ceil(W * 0.72) });
  yield;
  e.value((x) => Math.max(0, (x - W * 0.62) / (W * 0.38)) * right, -1, 0.14, { x0: Math.floor(W * 0.62) });
  if (o.shadow) {
    // A neighbouring roof's shadow, placed by hand: one big diagonal shape with its stepped edge (the painting's value structure, not a patch).
    const place = (d: { x0M: number; y0M: number; x1M: number; y1M: number }, salt: number) => {
      const ax = e.X(d.x0M);
      const bx = e.X(d.x1M);
      const ay = e.Y(d.y0M);
      const by = e.Y(d.y1M);
      const edgeD = new Int16Array(W);
      for (let x = 0; x < W; x++) {
        const t = Math.max(0, Math.min(1, (x - ax) / (bx - ax)));
        const step = Math.floor(x / 44);
        edgeD[x] = Math.round(ay + (by - ay) * t + (hash2(step, salt, e.seed + 31) - 0.5) * 18);
      }
      e.value((x, y) => (y > edgeD[x] ? 1 : 0), -1, 0.14, { y0: Math.min(ay, by) - 6 });
    };
    yield;
    place(o.shadow, 3);
    if (o.shadow.second) {
      yield;
      place(o.shadow.second, 5);
    }
    yield;
    if (o.lamp) e.wallLamp(e.X(o.lamp.xM), e.Y(o.lamp.yM), o.lamp.rx, o.lamp.ry);
    e.footGrime();
    e.ink();
    return;
  }
  // The block across the street throws a long shadow over the lower wall: one big diagonal shape, drawn by hand.
  // (Its edge is the block's own roofline: runs and steps, not a smooth wave.)
  yield;
  const seed = e.seed;
  const stepW = 54;
  const roofOpp = (x: number) => {
    const i = Math.floor(x / stepW);
    const h = hash2(i, 3, seed + 12);
    return (h > 0.7 ? 2.4 : h > 0.34 ? 1.2 : 0.2) + (hash2(i + 1, 3, seed + 12) > 0.5 && (x % stepW) / stepW > 0.8 ? 0.6 : 0);
  };
  // (One edge row per column, worked out once: this field is read at every texel below it.)
  const edge = new Int16Array(W);
  for (let x = 0; x < W; x++) edge[x] = Math.floor(e.Y(GROUND_H + 1.0 + roofOpp(x)) + (x / W) * 40);
  e.value((x, y) => (y > edge[x] ? 1 : 0), -1, 0.14, { y0: e.Y(GROUND_H + 3.6) });
  yield;
  e.footGrime();
  e.ink();
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

/** PAWN: two projecting side blocks and a recessed centre bay, the entrance hung at the side of the shop. */
const paintPawn: PwPainter = function* (c, k) {
  const w = 18;
  const h = buildingH(2);
  const e = new Elev(c, k, 41, PAWN_COL);
  e.sides('pier', 'stone');
  e.parapet(0, w, h - 0.1);
  e.parapet(5.0, 13.0, h + 0.7);
  e.curvedGable(9, 3.7, h + 1.5);
  e.lift(0.5, 3.0, -22);
  e.lift(14.8, 16.8, 18);
  e.bite(13.6, 1.0, 0.45);
  e.cornerBite(false, 44, 26);
  e.fill();
  e.brick({ amount: 0.32 });
  e.patch(e.X(1.0), e.Y(9), 110, 56, e.r.alt);
  e.cornice(e.Y(h - 0.72), { gaps: [[e.X(13.5), e.X(14.3)]] });
  e.coping(e.r.stone, 3, [[e.X(13.5), e.X(14.3)]]);
  yield;
  e.recess(e.X(4.9), e.X(13.1), e.Y(h + 0.2), e.Y(GROUND_H + 0.1));
  const gcx = e.X(9);
  e.ghostGround(gcx - 44, e.Y(h + 1.05), 88, 22, e.r.alt);
  drawText(c, 'LOANS', gcx - textWidth('LOANS', FONT_BOLD) / 2, e.Y(h + 0.9), FONT_BOLD, e.r.stone, 2);
  // The side blocks each carry one wide window; the recess three tall ones, not in line with them.
  row(e, 0, [2.5], ['curtain'], { w: 44, h: 50, head: 'hood', dy: -3 });
  row(e, 0, [15.6], ['broken'], { w: 44, h: 50, head: 'hood', dy: -3 });
  row(e, 0, [6.4, 9.0, 11.6], ['blind', 'moon', 'dark'], { w: 30, h: 62, head: 'arch', dy: -12 });
  e.drainpipe(0.5, h - 1);
  e.band(e.Y(GROUND_H - 0.15), 5, e.r.stone);
  const sy = e.Y(3.65);
  e.shopfront(e.X(0.9), e.X(14.2), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'pawn', { hex: 0x967a44 }), door: e.X(14.9), doorKind: 'lit', frameRamp: e.r.iron, riser: e.k.ramp(0x4a3a2a, { light: 0.36 }) });
  e.pilaster(e.X(14.5), e.Y(GROUND_H), e.H, 9);
  e.fixture(e.X(15.9), e.Y(2.2), 'meter');
  e.bills(e.X(16.0), e.Y(3.3), 30, 44);
  yield;
  // A shell went through the left block: the cornice and a window head have gone with it.
  e.breach(e.X(3.6), e.Y(7.0), 26, 19, { salt: 2, lintel: true });
  e.bareBrick(e.X(15.3), e.Y(5.3), 15, 14, 5);
  e.crack(e.X(6.8), e.Y(8.9), 26);
  e.pocks(e.X(4), e.Y(5.5), 280, 60, 16);
  yield* light(e);
};

const LAUNDRY_COL: ElevWallColours = { wall: 0x565e72, alt: 0x4a5062, brick: 0x6a3a2e, stone: 0x908a7c, frame: 0x34403f, curtain: 0x8c3f34 };

const paintLaundry: PwPainter = function* (c, k) {
  const w = 18;
  const h = buildingH(4);
  const e = new Elev(c, k, 31, LAUNDRY_COL);
  e.sides('stone', 'pier');
  e.parapet(0, w, h - 0.05);
  e.parapet(0, 5.5, h - 0.45);
  e.curvedGable(9.2, 3.4, h + 1.1);
  e.lift(12.6, 14.6, -20);
  e.bite(14.9, 1.6, 0.6);
  e.bite(3.0, 0.7, 0.35);
  e.cornerBite(true, 38, 20);
  e.fill();
  e.brick({ amount: 0.38 });
  e.patch(e.X(1.4), e.Y(11.6), 90, 40, e.r.alt);
  e.patch(e.X(11.0), e.Y(9), 100, 56, e.r.alt);
  e.bareBrick(e.X(4.6), e.Y(7.2), 26, 15, 1);
  const cy = e.Y(h - 0.85);
  const gaps: [number, number][] = [[e.X(14.9), e.X(16.6)]];
  e.cornice(cy, { gaps });
  e.coping(e.r.stone, 3, gaps);
  for (let f = 1; f < 3; f++) e.band(e.Y(GROUND_H + FLOOR_H * f - 0.1), 4, e.r.stone, { gaps: f === 1 ? [[e.X(13.2), e.X(13.9)]] : undefined, salt: 2 + f });
  yield;
  // Bays: a piered, narrower centre (three windows), two wider side bays.
  const cols = [1.9, 4.2, 7.4, 9.0, 10.6, 13.3, 15.6];
  const T: Row[] = [
    ['dark', 'curtain', 'broken', 'lit', 'dark', 'boarded', 'moon'],
    ['figure', 'boarded', 'lit', null, 'blind', 'dark', 'blind'],
    ['blind', 'curtain', 'dark', 'tv', 'curtain', 'curtain', 'dark'],
  ];
  for (let f = 0; f < 3; f++) row(e, f, cols, T[f], { w: f === 2 ? 30 : 32, h: 54, head: f === 2 ? 'hood' : 'lintel' });
  // The piers either side of the centre, in the drawn stone.
  e.pilaster(e.X(6.2), cy + 14, e.Y(GROUND_H), 8);
  e.pilaster(e.X(11.9), cy + 14, e.Y(GROUND_H), 8);
  e.drainpipe(0.45, h - 0.2);
  e.wire(0.5, h - 0.4, 6.2, h - 0.9, 0.5);
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone, { salt: 9 });
  const sy = e.Y(3.65);
  e.shopfront(e.X(0.8), e.X(13.9), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'laundry', { hex: 0x8aa8a0 }), door: e.X(14.8), doorKind: 'lit', riser: e.k.ramp(0x3a5060, { light: 0.36 }) });
  e.pilaster(e.X(0.35), e.Y(GROUND_H - 0.1), e.H, 9);
  e.fixture(e.X(16.5), e.Y(1.8), 'box');
  e.bills(e.X(16.4), e.Y(3.4), 46, 40);
  yield;
  e.scorch(e.X(7.4), sillOf(e, 1) - 54, 30, 66);
  e.sheet(e.X(13.3) - 22, sillOf(e, 1) - 52, 44, 52, 'SOS');
  e.clothesline(e.X(1.9), e.X(4.2), sillOf(e, 0) - 60, 2);
  e.breach(e.X(15.9), e.Y(12.4), 22, 26, { salt: 2 });
  e.crack(e.X(6.6), e.Y(13.4), 42);
  e.crack(e.X(12.8), e.Y(8.2), 30);
  e.pocks(e.X(3), e.Y(9), 300, 180, 26);
  for (let x = e.x0 + 22; x < e.x1; x += 39 + (x % 23)) e.streak(x, cy + 15, 30 + (x % 40), -1);
  yield* light(e, { moon: 1.2 });
};

const RIALTO_COL: ElevWallColours = { wall: 0x6a2f2e, alt: 0x582a2a, brick: 0x7a3a2a, stone: 0xa48a70, frame: 0x2e2228, curtain: 0x6a2030 };

/** RIALTO: a cinema is mostly wall. Three tall arched lights over the marquee, framed posters, a big stepped gable: no window rows. */
const paintRialto: PwPainter = function* (c, k) {
  const w = 20;
  const h = buildingH(3);
  const e = new Elev(c, k, 53, RIALTO_COL);
  e.sides('stone', 'stone');
  e.parapet(0, w, h);
  e.steppedGable(10, 5.5, h + 1.5, 4);
  e.lift(0.3, 2.4, -18);
  e.lift(16.8, 18.8, 24);
  e.bite(17.9, 1.2, 0.55);
  e.fill();
  e.brick({ amount: 0.42 });
  e.patch(e.X(0.6), e.Y(11), 80, 40, e.r.alt);
  e.cornice(e.Y(h - 0.85));
  e.coping();
  drawText(c, 'RIALTO', e.X(10) - textWidth('RIALTO', FONT_BOLD) / 2, e.Y(h + 0.85), FONT_BOLD, e.r.stone, 4);
  yield;
  // Three tall arched windows in a recessed panel, the middle one taller.
  e.recess(e.X(5.4), e.X(14.6), e.Y(h - 1.4), e.Y(GROUND_H + 1.4));
  row(e, 1, [7.2], ['curtain'], { w: 42, h: 92, head: 'arch', dy: 14 });
  row(e, 1, [10.0], ['lit'], { w: 46, h: 112, head: 'arch', dy: 20 });
  row(e, 1, [12.8], ['dark'], { w: 42, h: 92, head: 'arch', dy: 14 });
  // Film posters in lit frames either side, and one little office window high up.
  e.poster(e.X(1.6), e.Y(9.6), 40, 58, 0x8a2a3a);
  e.poster(e.X(17.0), e.Y(9.9), 40, 58, 0x2a4a7a);
  row(e, 1, [1.9], ['boarded'], { w: 26, h: 40, head: 'lintel', dy: 26 });
  e.band(e.Y(GROUND_H + 1.8), 3, e.r.stone);
  e.band(e.Y(GROUND_H - 0.1), 6, e.r.stone, { salt: 5 });
  const sy = e.Y(3.75);
  e.shopfront(e.X(2.6), e.X(17.4), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'lobby', { hex: 0x9c5a42 }), door: e.X(9), doorKind: 'lit', frameRamp: e.k.ramp(0x241a1e, { light: 0.36 }), riser: e.k.ramp(0x5a1a24, { light: 0.36 }) });
  e.pilaster(e.X(2.2), e.Y(4.5), e.H, 10);
  e.pilaster(e.X(17.5), e.Y(4.5), e.H, 10);
  e.bills(e.X(0.5), e.Y(3.8), 50, 62);
  e.bills(e.X(17.7), e.Y(3.6), 50, 50);
  yield;
  e.breach(e.X(18.3), e.Y(10.9), 16, 25, { salt: 2, rubble: 5 });
  e.crack(e.X(15.5), e.Y(8.7), 34);
  e.pocks(e.X(3), e.Y(10), 400, 120, 22);
  // The marquee's warm spill on the brick above it.
  neonWash(e, 3, 17, GROUND_H - 0.3, GROUND_H + 1.2, 0x7a5040);
  yield* light(e, { moon: 1.0, right: 0.6 });
};

const BOARDED_COL: ElevWallColours = { wall: 0x4a5f4c, alt: 0x3c4e42, brick: 0x6a3a2c, stone: 0x847e6c, frame: 0x2c3030, curtain: 0x5a4a3a };

const paintBoarded: PwPainter = function* (c, k) {
  const w = 16;
  const h = buildingH(3);
  const e = new Elev(c, k, 67, BOARDED_COL);
  e.sides('pier', 'pier');
  e.parapet(0, w, h + 0.1);
  e.parapet(0, 3.5, h + 0.6);
  e.lift(9.8, 12.2, 20);
  e.bite(6.6, 2.4, 0.95);
  e.bite(13.2, 1.0, 0.4);
  e.cornerBite(false, 30, 18);
  e.fill();
  e.brick({ amount: 0.3 });
  e.patch(e.X(4.8), e.Y(11), 120, 42, e.r.alt);
  e.cornice(e.Y(h - 0.8), { gaps: [[e.X(6.0), e.X(9.4)], [e.X(13.0), e.X(14.2)]] });
  e.coping(e.r.stone, 3, [[e.X(6.0), e.X(9.4)]]);
  e.band(e.Y(GROUND_H + FLOOR_H - 0.1), 4, e.r.stone, { gaps: [[e.X(3.8), e.X(7.2)]] });
  yield;
  const T: Row[] = [
    ['boarded', 'broken', 'boarded', 'boarded', 'bricked'],
    ['boarded', 'bricked', 'broken', 'curtain', 'boarded'],
  ];
  for (let f = 0; f < 2; f++) row(e, f, [2.0, 5.0, 8.0, 11.0, 14.0], T[f], { w: 32, h: 54, dy: f === 1 ? -4 : 3 });
  e.scorch(e.X(5.0), sillOf(e, 0) - 56, 44, 100);
  e.scorch(e.X(8.0), sillOf(e, 1) - 56, 34, 60);
  e.drainpipe(15.4, h - 1);
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone, { salt: 5 });
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
  yield;
  // Fire damage: a whole bay burnt out and knocked through, cornice and head gone.
  e.breach(e.X(5.2), e.Y(9.2), 36, 40, { salt: 2, lintel: true });
  e.breach(e.X(11.6), e.Y(6.4), 22, 14, { salt: 5 });
  e.bareBrick(e.X(14.4), e.Y(11.8), 16, 24, 8);
  e.crack(e.X(3.2), e.Y(10.7), 50);
  e.pocks(e.X(1), e.Y(8.5), 420, 120, 34);
  yield* light(e, { moon: 0.6, foot: 1.2 });
};

const LIQUOR_COL: ElevWallColours = { wall: 0x5e4230, alt: 0x4c3628, brick: 0x764034, stone: 0x867c66, frame: 0x281f1c, curtain: 0x6a2a2a };

/** LIQUOR: the top storey has come down over half the building: torn brick, joist stumps, the bars on the shop still holding. */
const paintLiquor: PwPainter = function* (c, k) {
  const w = 16;
  const h = buildingH(2);
  const e = new Elev(c, k, 79, LIQUOR_COL);
  e.sides('pier', 'pier');
  e.parapet(0, w, h);
  e.steppedGable(3.6, 2.8, h + 0.9, 3);
  e.lift(0.2, 1.8, -14);
  e.collapse(7.4, 16, GROUND_H + 0.9);
  e.fill();
  e.brick({ amount: 0.42 });
  e.cornice(e.Y(h - 0.8), { x1: e.X(8.4) });
  e.coping(e.r.stone, 3, [[e.X(7.2), e.X(16.4)]]);
  e.ghostGround(e.X(1.4), e.Y(h - 1.0), 84, 16, e.r.alt);
  yield;
  row(e, 0, [2.0, 5.1], ['lit', 'curtain'], { head: 'lintel', dy: -2 });
  e.band(e.Y(GROUND_H + 0.1), 4, e.r.stone);
  const sy = e.Y(3.8);
  e.shopfront(e.X(0.8), e.X(13.2), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'liquor', { hex: 0x8a6438 }), door: e.X(13.6), doorKind: 'lit', riser: e.k.ramp(0x5a2a2a, { light: 0.34 }) });
  e.fixture(e.X(14.1), e.Y(2.2), 'meter');
  e.fixture(e.X(0.1), e.Y(3.2), 'vent');
  e.bills(e.X(13.9), e.Y(3.4), 30, 40);
  e.bars(e.X(0.9), e.X(13.2), sy + 30, sy + 86);
  yield;
  e.breach(e.X(8.6), e.Y(GROUND_H + 1.7), 30, 22, { salt: 3, rubble: 10 });
  e.pocks(e.X(1), e.Y(7), 300, 60, 14);
  neonWash(e, 3.6, 12.4, GROUND_H - 0.2, GROUND_H + 0.8, 0x74403a);
  yield* light(e, { moon: 0.8 });
};

const BLUE_COL: ElevWallColours = { wall: 0x3d4f6c, alt: 0x33405a, brick: 0x6e3a30, stone: 0x7a8088, frame: 0x262a34, curtain: 0x5a3a2a };

const paintBillboardBlock: PwPainter = function* (c, k) {
  const w = 14;
  const h = buildingH(3);
  const e = new Elev(c, k, 97, BLUE_COL);
  e.sides('stone', 'pier');
  e.parapet(0, w, h - 0.2);
  e.parapet(10.2, 14, h + 0.3);
  e.lift(2.0, 4.2, 18);
  e.bite(6.8, 1.0, 0.4);
  e.cornerBite(true, 36, 26);
  e.fill();
  e.brick({ amount: 0.36 });
  e.cornice(e.Y(h - 0.9));
  e.coping();
  yield;
  // Upper floors: tenement pairs, the rows not in line with each other.
  row(e, 1, [2.2, 5.6, 9.0, 11.9], ['dark', 'moon', 'curtain', 'boarded'], { w: 30, dy: -3 });
  row(e, 0, [3.4, 6.8, 10.4], ['curtain', 'blind', 'broken'], { w: 30, dy: 5 });
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone);
  e.window(e.X(2.2) - 19, e.Y(2.8), 38, 44, 'dark', { head: 'lintel', sill: true });
  e.window(e.X(11.0) - 19, e.Y(2.8), 38, 44, 'boarded', { head: 'lintel', sill: true });
  const dx = e.X(6.2);
  c.rect(dx, e.Y(3.1), 54, e.Y(0) - e.Y(3.1), e.r.stone, 3);
  c.rect(dx + 7, e.Y(2.9), 40, e.Y(0) - e.Y(2.9), e.r.ink, 1);
  c.rect(dx + 9, e.Y(2.7), 36, e.Y(0) - e.Y(2.7), e.r.wood, 2.2);
  c.rect(dx + 14, e.Y(2.5), 26, 26, e.r.glassDark, 2);
  e.tag(e.X(8.4), e.Y(1.9), 'DEAD', 0x60c8d8, 0x12282a, 2);
  e.drainpipe(13.5, h - 1);
  e.bills(e.X(4.2), e.Y(2.3), 34, 44);
  e.fixture(e.X(11.0), e.Y(2.4) + 60, 'box');
  yield;
  e.breach(e.X(11.6), e.Y(7.1), 22, 18, { salt: 4, lintel: true });
  e.bareBrick(e.X(2.8), e.Y(11.2), 26, 16, 3);
  e.pocks(e.X(1), e.Y(7), 300, 60, 18);
  yield* light(e, { moon: 0.9 });
};

// ─── Main Street, west side ─────────────────────────────────────────────────

const HOTEL_COL: ElevWallColours = { wall: 0x70362c, alt: 0x5f3028, brick: 0x7a3a2e, stone: 0x9a8a70, frame: 0x2a221e, curtain: 0x6a3a2a };

const paintHotel: PwPainter = function* (c, k) {
  const w = 22;
  const h = buildingH(4);
  const e = new Elev(c, k, 113, HOTEL_COL);
  e.sides('stone', 'pier');
  e.parapet(0, w, h - 0.05);
  e.curvedGable(11, 5, h + 1.3);
  e.lift(1.0, 3.4, -22);
  e.lift(16.8, 19.2, 18);
  e.bite(19.6, 1.3, 0.5);
  e.bite(4.2, 0.6, 0.3);
  e.cornerBite(true, 34, 20);
  e.fill();
  e.brick({ amount: 0.38 });
  e.patch(e.X(14.0), e.Y(13.6), 120, 40, e.r.alt);
  e.cornice(e.Y(h - 0.9), { gaps: [[e.X(19.5), e.X(20.8)]] });
  e.coping(e.r.stone, 3, [[e.X(19.5), e.X(20.8)]]);
  for (let f = 1; f < 3; f++) e.band(e.Y(GROUND_H + FLOOR_H * f - 0.1), 5, e.r.stone, { salt: 2 + f });
  drawText(c, 'MILLBROOK HOTEL', e.X(11) - textWidth('MILLBROOK HOTEL', FONT_BOLD, { spacing: 2 }) / 2, e.Y(h - 1.15), FONT_BOLD, e.r.stone, 4, { spacing: 2 });
  yield;
  const cols = [2.2, 5.3, 8.4, 11.0, 13.6, 16.7, 19.8];
  const T: Row[] = [
    ['curtain', 'dark', 'moon', null, 'boarded', 'dark', 'dark'],
    ['blind', 'lit', 'dark', 'figure', 'curtain', 'broken', 'blind'],
    ['blind', 'curtain', 'curtain', 'dark', 'blind', 'curtain', 'boarded'],
  ];
  for (let f = 0; f < 3; f++) row(e, f, cols, T[f], { w: 30, h: 52, head: f === 2 ? 'arch' : 'lintel', dy: f === 2 ? -2 : 0 });
  e.band(e.Y(GROUND_H - 0.05), 7, e.r.stone, { salt: 6 });
  const sy = e.Y(3.8);
  e.shopfront(e.X(1.1), e.X(20.3), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'lobby', { hex: 0x946a42 }), door: e.X(10.0), doorKind: 'lit', bays: 7, frameRamp: e.k.ramp(0x2a241f, { light: 0.34 }), riser: e.k.ramp(0x5c3a30, { light: 0.34 }) });
  e.drainpipe(0.45, h - 0.3);
  e.bills(e.X(20.5), e.Y(3.2), 40, 60);
  e.fixture(e.X(0.8), e.Y(2.0), 'meter');
  yield;
  e.scorch(e.X(16.7), sillOf(e, 1) - 54, 32, 66);
  e.sheet(e.X(11.0) - 26, sillOf(e, 2) - 54, 52, 64, 'HELP');
  e.breach(e.X(20.2), e.Y(13.0), 20, 24, { salt: 2, rubble: 5 });
  e.bareBrick(e.X(17.5), e.Y(7.9), 22, 14, 3);
  e.crack(e.X(9), e.Y(12.3), 46);
  e.pocks(e.X(2), e.Y(9), 420, 200, 28);
  yield* light(e, { moon: 1.1 });
};

const CAFE_COL: ElevWallColours = { wall: 0x806e4a, alt: 0x70603e, brick: 0x703c2c, stone: 0xa89c80, frame: 0x32402f, curtain: 0x9a6a2a };

/** CAFE: a column of bay windows up the near half, shutters only on the far half, the rows of the two halves out of step. */
const paintCafe: PwPainter = function* (c, k) {
  const w = 18;
  const h = buildingH(2);
  const e = new Elev(c, k, 127, CAFE_COL);
  e.sides('pier', 'stone');
  e.parapet(0, w, h + 0.1);
  e.steppedGable(4.5, 2.6, h + 1.0, 3);
  e.lift(9.2, 11.6, 20);
  e.lift(15.0, 17.2, -14);
  e.bite(15.6, 1.5, 0.5);
  e.cornerBite(false, 28, 24);
  e.fill();
  e.brick({ amount: 0.3 });
  e.patch(e.X(0.8), e.Y(8.9), 130, 40, e.r.alt);
  e.cornice(e.Y(h - 0.8), { gaps: [[e.X(15.5), e.X(17.1)]] });
  e.coping(e.r.stone, 3, [[e.X(15.5), e.X(17.1)]]);
  yield;
  // The oriel: a three-sided bay rising through the upper floor on brackets.
  e.oriel(e.X(4.5), e.Y(GROUND_H + 0.2), e.Y(h - 1.2), 112, ['lit', 'curtain', 'dark']);
  // Far half: shuttered windows a little lower than the oriel's sills.
  row(e, 0, [10.2, 13.2], ['curtain', 'dark'], { head: 'hood', dy: 8 });
  [10.2, 13.2].forEach((cm, i) => e.shutters(e.X(cm) - 17, sillOf(e, 0) + 8 - 54, 34, 54, 0x3a5a4a, i === 1 ? 'hang' : 'open'));
  row(e, 0, [16.2], ['broken'], { w: 26, h: 44, head: 'lintel', dy: 2 });
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone, { salt: 5 });
  const sy = e.Y(3.8);
  e.shopfront(e.X(0.9), e.X(14.4), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'cafe', { hex: 0x846a3e }), door: e.X(15), doorKind: 'lit', frameRamp: e.k.ramp(0x2a3a2a, { light: 0.34 }), riser: e.k.ramp(0x4a3a2a, { light: 0.34 }) });
  e.bills(e.X(16.0), e.Y(3.8), 42, 56);
  e.fixture(e.X(16.2), e.Y(1.6), 'box');
  yield;
  e.breach(e.X(11.8), e.Y(8.0), 18, 18, { salt: 2 });
  e.crack(e.X(7), e.Y(9.0), 28);
  e.pocks(e.X(1), e.Y(7.6), 340, 50, 12);
  yield* light(e, { moon: 0.9 });
};

const W4_COL: ElevWallColours = { wall: 0x7a5238, alt: 0x664430, brick: 0x784634, stone: 0x8c806a, frame: 0x262320, curtain: 0x6a3a3a };

/** W4: a narrow, tall house jammed against a lower range: two buildings in one picture, two rooflines, two cornices. */
const paintW4: PwPainter = function* (c, k) {
  const w = 16;
  const h = buildingH(3);
  const tall = h + 3.0;
  const e = new Elev(c, k, 139, W4_COL);
  e.sides('stone', 'pier');
  e.parapet(0, w, h);
  e.parapet(0, 5.3, tall);
  e.parapet(5.3, 5.8, h + 2.2);
  e.parapet(5.8, 6.2, h + 1.2);
  e.parapet(6.2, 6.6, h + 0.35);
  e.curvedGable(2.7, 2.2, tall + 0.7);
  e.lift(8.6, 11.2, 22);
  e.bite(11.8, 1.0, 0.4);
  e.cornerBite(false, 40, 22);
  e.fill();
  e.brick({ amount: 0.36 });
  e.patch(e.X(0.6), e.Y(h + 2.2), 130, 50, e.r.alt);
  e.cornice(e.Y(h - 0.85), { x0: e.X(6.6) });
  e.cornice(e.Y(tall - 0.85), { x1: e.X(5.3), salt: 8, h: 11 });
  e.coping();
  yield;
  // The narrow house: two columns, four floors, its own sill heights.
  for (const [f, kinds] of [[0, ['boarded', 'lit']], [1, ['curtain', 'dark']], [2, ['moon', 'blind']]] as const) {
    const s = e.Y(GROUND_H + 0.4 + f * 3.05);
    for (const [i, cm] of [1.4, 3.9].entries()) e.window(e.X(cm) + e.lean(s, 4) - 13, s - 50, 26, 50, kinds[i], { head: f === 2 ? 'arch' : 'lintel' });
  }
  // A small attic light under the narrow house's curved gable.
  e.window(e.X(2.65) - 11, e.Y(tall - 0.2) , 22, 26, 'lit', { head: 'none', sill: false });
  // The low range: wider windows, one row off the grid.
  row(e, 1, [8.4, 11.1, 13.8], ['moon', 'broken', 'blind'], { w: 34, head: 'arch', dy: -4 });
  row(e, 0, [7.2, 9.8, 12.8], ['dark', 'lit', 'curtain'], { w: 32, dy: 6 });
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone, { salt: 5 });
  e.window(e.X(3.2) - 19, e.Y(2.9), 40, 46, 'dark', { head: 'lintel' });
  e.window(e.X(13.2) - 19, e.Y(2.9), 40, 46, 'boarded', { head: 'lintel' });
  const dx = e.X(7);
  c.rect(dx, e.Y(3.3), 58, e.Y(0) - e.Y(3.3), e.r.stone, 3);
  c.rect(dx + 7, e.Y(3.1), 44, e.Y(0) - e.Y(3.1), e.r.ink, 1);
  c.rect(dx + 9, e.Y(2.9), 40, e.Y(0) - e.Y(2.9), e.r.wood, 2);
  c.rect(dx + 14, e.Y(2.7), 30, 26, e.r.glassDark, 2);
  e.drainpipe(15.5, h - 1);
  e.wire(15.5, h - 1, 11.0, h - 1.6, 0.7);
  e.tag(e.X(1.0), e.Y(1.7), 'RUN', 0xe89a38, 0x3a1e08, 2);
  e.clothesline(e.X(8.4), e.X(13.8), sillOf(e, 1) - 66);
  e.bills(e.X(10.2), e.Y(2.2), 40, 44);
  e.fixture(e.X(5.5), e.Y(2.2), 'meter');
  e.fixture(e.X(5.5), e.Y(3.5), 'vent');
  yield;
  e.breach(e.X(13.9), e.Y(11.0), 20, 28, { salt: 4, lintel: true });
  e.pocks(e.X(1), e.Y(8.5), 380, 90, 22);
  yield* light(e, { moon: 1.0 });
};

const W6_COL: ElevWallColours = { wall: 0x3e5470, alt: 0x34435c, brick: 0x6a3a2e, stone: 0x828a90, frame: 0x262a34, curtain: 0x4a5a6a };

/** W6: steel shutters across the shop, the tenement stairs hung at one side with their own stacked windows. */
const paintW6: PwPainter = function* (c, k) {
  const w = 16;
  const h = buildingH(3);
  const e = new Elev(c, k, 151, W6_COL);
  e.sides('pier', 'stone');
  e.parapet(0, w, h + 0.1);
  e.parapet(0, 6.4, h + 0.55);
  e.lift(12.0, 14.4, -18);
  e.bite(9.6, 1.5, 0.75);
  e.cornerBite(true, 30, 24);
  e.fill();
  e.brick({ amount: 0.26 });
  e.cornice(e.Y(h - 0.85), { gaps: [[e.X(9.4), e.X(11.4)]] });
  e.coping(e.r.stone, 3, [[e.X(9.4), e.X(11.4)]]);
  yield;
  row(e, 1, [2.0, 5.0, 8.0, 11.0], ['blind', 'moon', 'curtain', 'lit'], { w: 32, dy: -3 });
  row(e, 0, [3.5, 6.5, 9.5, 12.5], ['boarded', 'dark', 'dark', 'broken'], { w: 32, dy: 6 });
  // The stair: narrow windows stepping up the far end, each half a storey above the last.
  for (const [i, kinds] of (['lit', 'dark', 'lit', 'curtain'] as WinKind[]).entries()) {
    const s = e.Y(GROUND_H + 0.2 + i * 1.75);
    e.window(e.X(14.9) - 10, s - 34, 20, 34, kinds, { head: 'arch', sill: false });
  }
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone, { salt: 5 });
  const sy = e.Y(3.8);
  const sx0 = e.X(0.7);
  const sx1 = e.X(13.7);
  e.rollerShutter(sx0, sx1, sy, e.Y(0.5), { bays: 3, raised: { bay: 1, lift: 28 } });
  c.rect(sx0 - 3, e.Y(0.5), sx1 - sx0 + 6, e.H - e.Y(0.5), e.r.brick, 2);
  e.tag(sx0 + 32, sy + 26, 'THEY ARE', 0xe058a0, 0x2a1228, 3, { metal: true });
  e.tag(sx0 + 262, sy + 44, 'INSIDE', 0x70e0a0, 0x12301e, 3, { metal: true });
  e.window(e.X(15.0) - 14, e.Y(2.9), 28, 46, 'dark', { head: 'lintel' });
  e.fixture(e.X(14.2), e.Y(1.1), 'box');
  yield;
  e.breach(e.X(4.2), e.Y(11.0), 22, 18, { salt: 2 });
  e.pocks(e.X(1), e.Y(8.5), 380, 110, 26);
  yield* light(e, { moon: 0.8, foot: 1.1 });
};

const BAR_COL: ElevWallColours = { wall: 0x565864, alt: 0x4a4c58, brick: 0x703c3c, stone: 0x8a8690, frame: 0x241f24, curtain: 0x7a2a4a };

const paintBar: PwPainter = function* (c, k) {
  const w = 14;
  const h = buildingH(2);
  const e = new Elev(c, k, 163, BAR_COL);
  e.sides('stone', 'pier');
  e.parapet(0, w, h);
  e.steppedGable(7, 2.4, h + 0.7, 3);
  e.lift(0.4, 2.8, 16);
  e.lift(10.8, 13, -14);
  e.cornerBite(false, 26, 20);
  e.fill();
  e.brick({ amount: 0.3 });
  e.cornice(e.Y(h - 0.8));
  e.coping();
  yield;
  row(e, 0, [2.6, 7.0, 11.4], ['curtain', 'dark', 'figure'], { dy: 2 });
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone, { salt: 5 });
  const sy = e.Y(3.9);
  e.shopfront(e.X(0.8), e.X(11.2), sy, { room: (x, y, rw, rh) => e.room(x, y, rw, rh, 'bar', { hex: 0x9a4a72 }), door: e.X(11.6), doorKind: 'lit', frameRamp: e.k.ramp(0x241a24, { light: 0.34 }), riser: e.k.ramp(0x3a2234, { light: 0.34 }) });
  neonWash(e, 2.5, 10.5, GROUND_H - 0.2, GROUND_H + 0.8, 0x6e4258);
  e.bills(e.X(11.8), e.Y(3.6), 30, 44);
  yield;
  e.breach(e.X(2.2), e.Y(7.8), 16, 20, { salt: 3, rubble: 5 });
  e.pocks(e.X(1), e.Y(7), 300, 50, 12);
  yield* light(e, { moon: 0.8 });
};

// ─── The boss square ────────────────────────────────────────────────────────

const MEATS_COL: ElevWallColours = { wall: 0x6a5048, alt: 0x584238, brick: 0x703a30, stone: 0xa49a84, frame: 0x241c1c, curtain: 0x5a2a2a };

const paintMeats: PwPainter = function* (c, k) {
  const w = 16;
  const h = buildingH(2);
  const e = new Elev(c, k, 181, MEATS_COL);
  e.sides('pier', 'pier');
  e.parapet(0, w, h + 0.05);
  e.steppedGable(8, 4.4, h + 1.3, 4);
  e.lift(0.3, 2.1, 16);
  e.lift(13.9, 15.7, -14);
  e.bite(1.4, 0.8, 0.3);
  e.fill();
  e.brick({ amount: 0.42 });
  e.bareBrick(e.X(14.6), e.Y(6.2), 18, 24, 2);
  e.cornice(e.Y(h - 0.8));
  e.coping();
  yield;
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
  // (The sign's own red light does the rest in the scene: a painted pool on top turned into a blob.)
  // Blood down the wall from the sign.
  for (const x of [e.X(3.4), e.X(11.5), e.X(12.4)]) {
    for (let j = 0; j < 34; j++) c.tint(x + (j >> 5), e.Y(4.6) + j, red, -1);
  }
  e.pocks(e.X(1), e.Y(8), 400, 70, 14);
  yield* light(e, { moon: 0.7, foot: 0.8, right: 0.5 });
};

const BANK_COL: ElevWallColours = { wall: 0x847a66, alt: 0x70685a, brick: 0x6a3a2e, stone: 0xb0a690, frame: 0x24242a };

/** FIRST NATIONAL: a stone temple front. A real pediment with dentils and a hard shadow, columns on steps, the clock in a surround. */
const paintBank: PwPainter = function* (c, k) {
  const w = 20;
  const h = buildingH(2);
  const e = new Elev(c, k, 193, BANK_COL);
  const S = e.r.stone;
  e.sides('stone', 'stone');
  e.parapet(0, w, h);
  e.parapet(0.8, 19.2, h + 0.28);
  e.pediment(10, 6.3, h + 1.25);
  e.lift(3.0, 4.6, 12);
  e.cornerBite(false, 52, 34);
  e.fill();
  e.brick({ amount: 0.5, course: 8, len: 22 });
  e.cornice(e.Y(h - 0.7), { h: 15 });
  e.coping(S, 3, [[e.X(16.8), e.X(19.2)]]);
  yield;
  // The frieze: one word, cut large into a stone panel between the middle columns (seven-row capitals broke into fragments at the boss's distance).
  {
    const fy = e.Y(h - 1.18);
    const tw = textWidth('NATIONAL', FONT_BOLD, { spacing: 1, scale: 2 });
    const fx = e.X(10) - tw / 2;
    for (let x = fx - 10; x < fx + tw + 10; x++) {
      for (let y = fy - 3; y < fy + 18; y++) c.set(x, y, S, y === fy - 3 ? 3.9 : y === fy + 17 ? 1.2 : 3.0 + (hash2(x >> 3, y, 193) > 0.84 ? -0.5 : 0));
    }
    drawText(c, 'NATIONAL', fx, fy, FONT_BOLD, e.r.ink, 0.9, { spacing: 1, scale: 2 });
  }
  // The pediment: tympanum recessed a tone, raking cornices with dentils, a black cast shadow under them.
  const cx = e.X(10);
  const halfW = Math.round(6.3 * FLAT_TPM);
  const yBase = e.Y(h + 0.28);
  const yApex = e.Y(h + 1.25);
  for (let dx = -halfW; dx <= halfW; dx++) {
    const yEdge = yApex + Math.round((Math.abs(dx) / halfW) * (yBase - yApex));
    for (let y = yEdge; y < yBase; y++) c.set(cx + dx, y, e.r.alt, y < yEdge + 6 ? 1 : 2.2);
    // Raking cornice: crown, fillet, dentils and a hard shadow under it.
    for (let j = 0; j < 6; j++) c.set(cx + dx, yEdge + j, S, j === 0 ? 4 : j === 1 ? 3.4 : j === 5 ? 0.8 : 2.8);
    if ((dx + 200) % 8 < 3) for (let j = 6; j < 10; j++) c.set(cx + dx, yEdge + j, S, 3);
    c.shift(cx + dx, yEdge + 10, -1.8);
    c.shift(cx + dx, yEdge + 11, -1.2);
  }
  // Horizontal base of the pediment: a heavier moulding with dentils.
  for (let dx = -halfW; dx <= halfW; dx++) {
    for (let j = 0; j < 7; j++) c.set(cx + dx, yBase - 3 + j, S, j === 0 ? 4 : j >= 5 ? 1.1 : 2.8);
    c.shift(cx + dx, yBase + 4, -1.8);
  }
  // The clock: a stone round with hands stopped at the end of the world.
  const ccy = yBase - 26;
  c.ellipse(cx, ccy, 18, 18, S, (u, v) => 3.2 - v * 0.6 + u * 0.3);
  c.ellipse(cx, ccy, 15, 15, e.r.ink, 0.6);
  c.ellipse(cx, ccy, 13, 13, e.r.lamp, 2.8, PWF.GLOW);
  // Hours: a tick at the quarters, a dot between; hands stopped at twenty to four.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tx = cx + Math.round(Math.cos(a) * 10.5);
    const ty = ccy + Math.round(Math.sin(a) * 10.5);
    c.set(tx, ty, e.r.ink, 0.4, PWF.GLOW);
    if (i % 3 === 0) {
      c.set(cx + Math.round(Math.cos(a) * 9), ccy + Math.round(Math.sin(a) * 9), e.r.ink, 0.4, PWF.GLOW);
      c.set(tx + (Math.abs(Math.cos(a)) > 0.5 ? 0 : 1), ty + (Math.abs(Math.sin(a)) > 0.5 ? 0 : 1), e.r.ink, 0.4, PWF.GLOW);
    }
  }
  for (let t = 0; t < 2; t++) {
    c.line(cx + t, ccy, cx + t - 7, ccy + 6, e.r.ink, 0.3, PWF.GLOW);
    c.line(cx, ccy + t, cx + 3, ccy - 10 + t, e.r.ink, 0.3, PWF.GLOW);
  }
  c.set(cx, ccy, e.r.ink, 0.2, PWF.GLOW);
  yield;
  // Columns on a stepped base, carrying the entablature down in front of the fascia line.
  const yBottom = e.Y(0.72);
  const yCap = e.Y(h - 1.65);
  for (const cm of [5.0, 8.2, 11.8, 15.0]) {
    const x = e.X(cm);
    const cw = 20;
    for (let y = yCap + 10; y < yBottom - 8; y++) {
      const xx = x + e.lean(y, 7);
      for (let i = 0; i < cw; i++) {
        const u = i / (cw - 1);
        // A round shaft in whole tones, flutes picked out.
        let t = u < 0.15 ? 3.9 : u < 0.5 ? 3.1 : u < 0.8 ? 2.4 : 1.6;
        if (i % 4 === 3) t -= 0.7;
        c.set(xx + i - cw / 2, y, S, t);
      }
      c.shift(xx + cw / 2, y, -1.6);
      c.shift(xx + cw / 2 + 1, y, -1);
    }
    // Capital and base.
    c.rect(x - cw / 2 - 4, yCap, cw + 8, 5, S, 3.6);
    c.hline(x - cw / 2 - 4, yCap, cw + 8, S, 4.2);
    c.rect(x - cw / 2 - 2, yCap + 5, cw + 4, 5, S, 2.4);
    c.rect(x - cw / 2 - 3, yBottom - 8, cw + 6, 8, S, 3);
    c.hline(x - cw / 2 - 3, yBottom - 8, cw + 6, S, 4);
    c.hline(x - cw / 2 - 3, yBottom - 1, cw + 6, S, 1);
  }
  // Tall windows between the columns, a shade off the grid of the columns.
  row(e, 0, [2.6], ['dark'], { w: 32, h: 66, head: 'arch', dy: 2 });
  row(e, 0, [6.6, 13.4], ['moon', 'lit'], { w: 28, h: 72, head: 'arch', dy: 12 });
  row(e, 0, [17.4], ['curtain'], { w: 32, h: 66, head: 'arch', dy: 2 });
  // Ground floor: barred windows in stone, the heavy doors between the columns, up three steps.
  const stoneDark = e.r.alt;
  for (const cm of [2.6, 17.4]) {
    e.window(e.X(cm) - 26, e.Y(3.2), 52, 58, 'dark', { head: 'lintel', sill: true });
    e.bars(e.X(cm) - 26, e.X(cm) + 26, e.Y(3.2), e.Y(3.2) + 58, 13);
  }
  e.window(e.X(6.6) - 18, e.Y(2.9), 36, 48, 'blind', { head: 'lintel' });
  e.window(e.X(13.4) - 18, e.Y(2.9), 36, 48, 'dark', { head: 'lintel' });
  const dcx = e.X(10);
  // (The door surround in shade: it stands back between the columns, so no flat pale slab sits above the door.)
  c.rect(dcx - 34, e.Y(3.6), 68, e.Y(0.72) - e.Y(3.6), S, (_x, y) => (y < e.Y(3.1) ? 1.4 : 1.9));
  for (let y = e.Y(3.6); y < e.Y(0.72); y++) c.set(dcx - 34 + e.lean(y, 7), y, S, 2.7);
  c.frame(dcx - 34, e.Y(3.6), 68, e.Y(0.72) - e.Y(3.6), stoneDark, 1);
  c.rect(dcx - 26, e.Y(3.3), 52, e.Y(0.72) - e.Y(3.3), e.r.ink, 0.8);
  c.rect(dcx - 24, e.Y(3.1), 23, e.Y(0.72) - e.Y(3.1), e.k.ramp(0x5a4228, { light: 0.34 }), 2.2);
  c.rect(dcx + 1, e.Y(3.1), 23, e.Y(0.72) - e.Y(3.1), e.k.ramp(0x5a4228, { light: 0.34 }), 1.8);
  for (let y = e.Y(3.1); y < e.Y(0.9); y += 7) {
    c.hline(dcx - 24, y, 23, e.k.ramp(0x5a4228, { light: 0.34 }), 3);
    c.hline(dcx + 1, y, 23, e.k.ramp(0x5a4228, { light: 0.34 }), 2.6);
  }
  c.rect(dcx - 4, e.Y(1.6), 8, 8, e.r.lamp, 3.2);
  // Three steps, broken at the near end.
  for (let i = 0; i < 3; i++) {
    const inset = i * 10 + Math.round(Math.sin(i * 1.7) * 2);
    const yy = e.H - 8 * (3 - i);
    for (let x = e.X(4.2) + inset; x < e.X(15.8) - inset; x++) {
      const t = hash2(x >> 2, i, e.seed + 51) > 0.92 ? -0.8 : 0;
      for (let j = 0; j < 8; j++) c.set(x, yy + j, S, j === 0 ? 4 + t : j === 7 ? 1 : 2.9 + t);
    }
  }
  yield;
  e.crack(e.X(3.5), e.Y(9.3), 30);
  e.crack(e.X(16.4), e.Y(7.5), 34);
  e.breach(e.X(18.0), e.Y(9.5), 20, 26, { salt: 2, rubble: 5 });
  e.pocks(e.X(2), e.Y(9), 460, 110, 20);
  e.fixture(e.X(0.3), e.Y(2.0), 'box');
  yield* light(e, { moon: 0.9, foot: 0.6, right: 0.5 });
  // The bay over the door stands back between its columns: shadow from the entablature, to the columns' own edges (a whole-tone shape, no stray pale patch).
  const bay0 = e.X(8.2) + 12;
  const bay1 = e.X(11.8) - 12;
  e.value((x, y) => (x > bay0 && x < bay1 && y > e.Y(h - 1.65) + 10 && y < e.Y(3.6) ? 1 : 0), -1, 0.14, { x0: bay0 - 2, x1: bay1 + 2, y0: e.Y(h - 1.65) + 6, y1: e.Y(3.6) + 2 });
};

const SHUT_COL: ElevWallColours = { wall: 0x856a50, alt: 0x745c44, brick: 0x6e3a2c, stone: 0x9a8e74, frame: 0x2e2822, curtain: 0x8a5a3a };

/** The shuttered block: a carriage arch through the middle splits a row of steel shutters, one of them stuck half up. */
const paintShutterBlock: PwPainter = function* (c, k) {
  const w = 20;
  const h = buildingH(3);
  const e = new Elev(c, k, 207, SHUT_COL);
  e.sides('pier', 'pier');
  e.parapet(0, w, h + 0.05);
  e.curvedGable(10, 4.4, h + 1.2);
  e.lift(0.5, 2.8, 18);
  e.lift(14.8, 16.6, -20);
  e.bite(17.0, 1.2, 0.5);
  e.cornerBite(false, 42, 30);
  e.fill();
  e.brick({ amount: 0.34 });
  e.patch(e.X(0.8), e.Y(11.2), 140, 46, e.r.alt);
  e.cornice(e.Y(h - 0.85), { gaps: [[e.X(16.9), e.X(18.3)]] });
  e.coping(e.r.stone, 3, [[e.X(16.9), e.X(18.3)]]);
  e.band(e.Y(GROUND_H + FLOOR_H - 0.1), 5, e.r.stone);
  yield;
  const T: Row[] = [
    ['blind', 'lit', 'dark', 'moon', 'boarded', 'dark'],
    ['moon', 'dark', 'boarded', 'figure', 'dark', 'broken'],
  ];
  row(e, 1, [1.9, 4.9, 8.0, 12.2, 15.3, 18.2], T[1], { w: 32, head: 'hood', dy: -2 });
  row(e, 0, [3.1, 6.2, 9.4, 13.4, 16.6], T[0], { w: 32, dy: 7 });
  // Shutters either side of the arch.
  const sy = e.Y(3.9);
  const sx0 = e.X(1.0);
  const sx1 = e.X(8.4);
  const sx2 = e.X(11.6);
  const sx3 = e.X(19.0);
  e.rollerShutter(sx0, sx1, sy, e.Y(0.6), { bays: 2 });
  e.rollerShutter(sx2, sx3, sy, e.Y(0.6), { bays: 2, raised: { bay: 1, lift: 34 } });
  const kerb = e.k.ramp(0x4a2e22, { light: 0.32 });
  c.rect(sx0 - 3, e.Y(0.6), sx3 - sx0 + 6, e.H - e.Y(0.6), kerb, 2.4);
  // The arch: dark passage, stone voussoirs, a dim lamp at the far end.
  e.archway(e.X(10), e.Y(4.1), 54, e.H - e.Y(4.1));
  // Boarded up, the boards nailed unevenly across the arch (the empty passage was a dead brown shape under the awning at the boss).
  {
    const ax = e.X(10);
    const yTop = e.Y(4.1) + 28;
    const planks = 8;
    for (let i = 0; i < planks; i++) {
      const pw = 13;
      const x0 = ax - 54 + i * pw;
      const drop = Math.round(hash2(i, 3, 211) * 16);
      const t = 2.1 + ((i * 7) % 5) * 0.22;
      for (let x = x0; x < x0 + pw - 1; x++) {
        for (let y = yTop + drop; y < e.H; y++) {
          c.set(x, y, e.r.wood, (x === x0 ? t + 1.1 : x === x0 + pw - 2 ? t - 0.9 : t) + ((y + i * 7) % 19 < 1 ? -0.6 : 0));
        }
      }
    }
    for (const yb of [e.Y(3.2), e.Y(1.5)]) {
      const lean = yb > e.Y(2) ? 7 : -5;
      c.poly([ax - 56, yb, ax + 56, yb + lean, ax + 56, yb + lean + 11, ax - 56, yb + 11], e.r.wood, 3.1);
      c.line(ax - 56, yb, ax + 56, yb + lean, e.r.wood, 4);
    }
    e.tag(ax - 40, e.Y(2.5), 'KEEP OUT', 0xd8d0b8, 0x282018, 2);
  }
  e.tag(sx0 + 30, sy + 26, 'GO HOME', 0xc08ce8, 0x201030, 3, { metal: true });
  e.tag(sx2 + 14, sy + 34, 'NO ONE LEFT', 0xc8e070, 0x2a3a1a, 2, { metal: true });
  e.drainpipe(0.4, h - 1);
  yield;
  e.breach(e.X(7.6), e.Y(9.6), 24, 18, { salt: 3, lintel: true });
  e.breach(e.X(18.3), e.Y(7.3), 18, 24, { salt: 4, rubble: 5 });
  e.pocks(e.X(1), e.Y(9), 500, 110, 24);
  yield* light(e, { moon: 1.0, foot: 1.0, right: 0.4 });
};

// ─── The two buildings past the crossing (seen square on through beats 5 and 6) ──────

const CW_COL: ElevWallColours = { wall: 0x4c5a64, alt: 0x404c56, brick: 0x6c3c30, stone: 0x8a8a84, frame: 0x262a30, curtain: 0x5a4a3a };

/** West corner, end on to the crossing: a broken parapet, a water tank behind, a huge faded ghost sign, one lit room. */
const paintCornerW: PwPainter = function* (c, k) {
  const w = 14;
  const h = buildingH(3);
  const e = new Elev(c, k, 223, CW_COL);
  e.plainLit = true;
  e.sides('stone', 'pier');
  e.parapet(0, w, h + 0.1);
  e.parapet(0, 5.2, h + 0.5);
  e.lift(3.2, 5.0, -16);
  e.lift(9.0, 11.4, 26);
  e.bite(11.6, 1.8, 0.85);
  e.cornerBite(false, 56, 34);
  e.fill();
  e.brick({ amount: 0.2 });
  e.cornice(e.Y(h - 0.85), { gaps: [[e.X(11.2), e.X(13.6)]] });
  e.coping(e.r.stone, 3, [[e.X(11.2), e.X(13.6)]]);
  yield;
  // The ghost sign, fading across most of the wall between the floors.
  const gy = e.Y(9.3);
  const gx = e.X(1.0);
  e.ghostGround(gx, gy, 320, 70, e.r.stone);
  drawText(c, "DR KELSO'S", gx + 10, gy + 8, FONT_BOLD, e.r.wall, 1.4, { spacing: 1, scale: 2 });
  drawText(c, 'TONIC', gx + 10, gy + 38, FONT_BOLD, e.r.brick, 1.9, { spacing: 2, scale: 2 });
  row(e, 1, [11.0], ['figure'], { w: 34, dy: -2 });
  // (One window hung out of its row: the wall's own history, and the row reads as a row of things put there by hand.)
  row(e, 0, [2.0, 5.2, 11.8], ['dark', 'curtain', 'boarded'], { w: 32, dy: 6 });
  row(e, 0, [8.6], ['blind'], { w: 26, h: 44, dy: -14 });
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone, { salt: 5 });
  const dx = e.X(2.4);
  c.rect(dx, e.Y(3.1), 54, e.Y(0) - e.Y(3.1), e.r.stone, 3);
  c.rect(dx + 7, e.Y(2.9), 40, e.Y(0) - e.Y(2.9), e.r.ink, 1);
  c.rect(dx + 9, e.Y(2.7), 36, e.Y(0) - e.Y(2.7), e.r.wood, 2.2);
  e.window(e.X(6.6) - 20, e.Y(3.0), 40, 48, 'dark', { head: 'lintel' });
  e.window(e.X(10.2) - 20, e.Y(3.0), 40, 48, 'boarded', { head: 'lintel' });
  e.tag(e.X(5.2), e.Y(1.6), 'RUN', 0xe89a38, 0x3a1e08, 3);
  e.drainpipe(13.5, h - 0.8);
  e.bills(e.X(11.8), e.Y(2.6), 44, 48);
  yield;
  e.breach(e.X(12.0), e.Y(9.0), 26, 30, { salt: 3, lintel: true, shape: 'corner' });
  e.scorch(e.X(5.2), sillOf(e, 0) + 6 - 54, 30, 60);
  e.crack(e.X(7.5), e.Y(11.0), 40);
  e.pocks(e.X(1), e.Y(8.5), 380, 110, 16);
  yield* light(e, { moon: 1.0, right: 0, foot: 0.8, shadow: { x0M: 0.2, y0M: 11.4, x1M: 13.8, y1M: 5.6 }, lamp: { xM: 4.3, yM: 3.5, rx: 84, ry: 112 } });
};

const CE_COL: ElevWallColours = { wall: 0x665a52, alt: 0x584e48, brick: 0x704030, stone: 0x9a9080, frame: 0x2a2624, curtain: 0x7a3f2a };

/** East corner, end on to the crossing: a stepped parapet climbing to a round corner turret with a slated cap. */
const paintCornerE: PwPainter = function* (c, k) {
  const w = 14;
  const h = buildingH(3);
  const e = new Elev(c, k, 239, CE_COL);
  e.plainLit = true;
  e.sides('stone', 'pier');
  e.parapet(0, w, h);
  // Stepped parapet climbing away from the turret, each step its own cap.
  e.parapet(4.4, 7.0, h + 0.5);
  e.parapet(7.0, 9.6, h + 0.95);
  e.parapet(9.6, 12.0, h + 0.55);
  e.lift(12.6, 13.8, 18);
  e.bite(8.0, 0.8, 0.35);
  e.cornerBite(false, 26, 22);
  e.fill();
  e.brick({ amount: 0.2 });
  e.cornice(e.Y(h - 0.8), { x0: e.X(4.2) });
  e.coping(e.r.stone, 3, [[e.X(0), e.X(4.2)]]);
  yield;
  // Windows, one column off the grid, an end bay of boards.
  row(e, 1, [6.0, 9.4, 12.6], ['curtain', 'moon', 'boarded'], { w: 32, head: 'hood', dy: -4 });
  row(e, 0, [7.2], ['dark'], { w: 32, dy: 8 });
  row(e, 0, [10.8], ['figure'], { w: 34, dy: -6 });
  e.band(e.Y(GROUND_H - 0.1), 5, e.r.stone, { salt: 5, x0: e.X(4.2) });
  // Ground floor: a shop window with a metal shutter, a side door.
  const sy = e.Y(3.8);
  e.rollerShutter(e.X(5.0), e.X(11.2), sy, e.Y(0.5), { bays: 2, raised: { bay: 0, lift: 30 } });
  c.rect(e.X(5.0), e.Y(0.5), e.X(11.2) - e.X(5.0), e.H - e.Y(0.5), e.r.brick, 2);
  const ddx = e.X(11.7);
  c.rect(ddx, e.Y(3.2), 44, e.Y(0) - e.Y(3.2), e.r.stone, 3);
  c.rect(ddx + 5, e.Y(3), 34, e.Y(0) - e.Y(3), e.r.wood, 2.2);
  yield;
  // The turret: a round tower carried up the corner, its slates, three tall windows, a green copper finial.
  e.turret(e.X(2.05), 58, e.H, e.Y(h + 2.75));
  e.tag(e.X(7.0), e.Y(2.9), 'NO EXIT', 0xe058a0, 0x2a1228, 2, { metal: true });
  e.breach(e.X(12.6), e.Y(9.8), 18, 22, { salt: 2, shape: 'rip' });
  e.crack(e.X(6.4), e.Y(10.8), 34);
  e.pocks(e.X(4), e.Y(8.5), 280, 90, 14);
  yield* light(e, { moon: 0.95, right: 0, foot: 0.8, shadow: { x0M: 3.6, y0M: 11.6, x1M: 13.8, y1M: 7.0 }, lamp: { xM: 12.5, yM: 3.6, rx: 70, ry: 115 } });
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
      const ad = k.ramp(0xa84a30, { light: 0.4, sat: 1.0, dark: 0.45 });
      const cream = k.ramp(0xd8c8a0, { light: 0.34 });
      const y0 = 8;
      const y1 = th - 30;
      // Steel legs and a diagonal brace each, heavy and rim-lit (a billboard on thin dark legs floats),
      // landing on a drawn strip of roof.
      const strut = k.ramp(0x7a7f88, { light: 0.4, sat: 0.6, dark: 0.45 });
      for (const lx of [24, tw - 24, tw / 2]) {
        for (let i = 0; i < 6; i++) c.line(lx - 3 + i, y1, lx - 3 + i, th - 8, strut, i === 0 ? 3.8 : i === 5 ? 0.8 : 2.3);
        for (let i = 0; i < 3; i++) c.line(lx - 18 + i, th - 8, lx + i, y1 + 3, strut, i === 0 ? 3 : 1.4);
      }
      for (let x = 0; x < tw; x++) {
        const h = 4 + Math.round(hash2(x >> 3, 5, 91) * 3);
        c.rect(x, th - 8, 1, h, strut, 2);
        c.set(x, th - 8, strut, 3.6);
        c.set(x, th - 8 + h - 1, strut, 0.8);
      }
      c.rect(0, y0, tw, y1 - y0, ad, 3);
      c.frame(0, y0, tw, y1 - y0, strut, 2.4);
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

/** A flat that re-uses a painting from elsewhere in the stage (a different stretch of street: nobody compares them). */
function reused(id: string, of: () => FlatDef, o: { tint?: number; xOffset?: number } = {}): FlatDef {
  const d = of();
  return { ...d, id, reuse: d.id, cards: undefined, tint: o.tint, xOffset: o.xOffset };
}

const base: FlatDef[] = [
  flat('pawn', 18, buildingH(2), 1.6, paintPawn, [pawnBalls()]),
  flat('laundry', 18, buildingH(4), 1.15, paintLaundry, [awning('awn', 13.6, AW_NAVY, AW_CREAM, -1.6, 3.3, 0.75), fireEscape('fe', 4, 4.8, 0.45)]),
  flat('rialto', 20, buildingH(3), 1.5, paintRialto),
  flat('boarded', 16, buildingH(3), 0.6, paintBoarded, [awning('awn', 14, 0x6a2424, AW_CREAM, -0.4, 3.3, 0.7, { torn: true })]),
  flat('liquor', 16, buildingH(2), 0.9, paintLiquor),
  flat('billblock', 14, buildingH(3), 0.3, paintBillboardBlock, [fireEscape('fe', 3, -3.2, 0.45), billboardCard(14)]),
  flat('hotel', 22, buildingH(4), 1.3, paintHotel, [awning('awn', 19.5, 0x5a1a1a, AW_CREAM, 0, 3.4, 0.8)]),
  flat('cafe', 18, buildingH(2), 1.0, paintCafe, [awning('awn', 13.8, 0x7a5a1f, AW_CREAM, -1.6, 3.3, 0.75)]),
  flat('w4', 16, buildingH(3), 3.8, paintW4, [fireEscape('fe', 3, 3.8, 0.45)]),
  flat('w6', 16, buildingH(3), 0.6, paintW6),
  flat('bar', 14, buildingH(2), 0.7, paintBar),
  flat('meats', 16, buildingH(2), 1.3, paintMeats),
  flat('bank', 20, buildingH(2), 1.3, paintBank),
  flat('shutterblock', 20, buildingH(3), 1.2, paintShutterBlock, [awning('awn', 18.5, 0x2a4a3a, AW_CREAM, 0, 3.35, 0.8)]),
  flat('cornerW', 14, buildingH(3), 1.1, paintCornerW),
  flat('cornerE', 14, buildingH(3), 3.1, paintCornerE),
];
const byId = (id: string) => () => base.find((d) => d.id === id)!;

export const Z1_FLATS: FlatDef[] = [
  ...base,
  // The street sides of the two corners, and the boss square's hotel: other paintings, seen only in passing or from far away.
  reused('cornerW-side', byId('boarded'), { tint: 0xd6dfee }),
  reused('cornerE-side', byId('w6'), { tint: 0xe2d8cc }),
  reused('grand', byId('hotel'), { tint: 0xe2ccc0, xOffset: 1 }),
];
