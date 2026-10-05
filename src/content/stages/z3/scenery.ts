import * as THREE from 'three';
import { Kit } from '../../kit/ModelKit';
import { EnvKit, type CurveFrame } from '../../kit/EnvKit';
import { Rng } from '../../../core/Rng';
import { M } from './bake';
import { D, X } from './layout';
import { addText } from './font';
import {
  PAL,
  S,
  billboard,
  bus,
  bush,
  car,
  deadTree,
  jersey,
  lightPole,
  sandbags,
  semiCab,
  signPanel,
  trailer,
} from './props';
import type { FireField } from './vfx';

/**
 * Static scenery for HIGHWAY TO HELL, built in rail-local coordinates
 * (x = right of the rail, y = up, −z = along the rail) and bucketed into
 * 50 m chunks that are baked and distance-culled by env.ts.
 */

export const CHUNK = 50;

export interface Ctx {
  curve: THREE.CatmullRomCurve3;
  rng: Rng;
  fires: FireField;
  /** Invisible bullet-stopping proxies (walls). */
  occluders: THREE.Object3D[];
  proxies: THREE.Group;
  /** Static groups for scenery that isn't tied to one chunk (bridge towers, hills). */
  landmarks: THREE.Group[];
  chunk(d: number): THREE.Group;
  frame(d: number): CurveFrame;
  /** Position + orient `obj` at rail distance d, x metres right, y up, extra yaw. Adds it to the chunk (or `into`). */
  put<T extends THREE.Object3D>(obj: T, d: number, x: number, y?: number, yaw?: number, into?: THREE.Object3D): T;
  /** World point at rail distance d, x right, y up. */
  at(d: number, x: number, y?: number): THREE.Vector3;
}

export function makeCtx(curve: THREE.CatmullRomCurve3, fires: FireField, root: THREE.Group): Ctx {
  const chunks = new Map<number, THREE.Group>();
  const frames = new Map<number, CurveFrame>();
  const proxies = new THREE.Group();
  proxies.visible = false;
  proxies.name = 'z3-occluders';
  root.add(proxies);
  const ctx: Ctx = {
    curve,
    rng: new Rng(9133),
    fires,
    occluders: [],
    proxies,
    landmarks: [],
    chunk(d) {
      const i = Math.floor(Math.max(-1, d) / CHUNK);
      let g = chunks.get(i);
      if (!g) {
        g = new THREE.Group();
        g.name = `chunk${i}`;
        g.userData.chunk = i;
        chunks.set(i, g);
      }
      return g;
    },
    frame(d) {
      const k = Math.round(d * 4) / 4;
      let f = frames.get(k);
      if (!f) {
        f = EnvKit.frameAt(curve, Math.max(0, k));
        if (k < 0) f.pos.addScaledVector(f.forward, k);
        frames.set(k, f);
      }
      return f;
    },
    put(obj, d, x, y = 0, yaw = 0, into) {
      const f = ctx.frame(d);
      obj.position.copy(f.pos).addScaledVector(f.right, x);
      obj.position.y += y;
      obj.rotation.y += f.heading + yaw;
      (into ?? ctx.chunk(d)).add(obj);
      return obj;
    },
    at(d, x, y = 0) {
      const f = ctx.frame(d);
      return f.pos.clone().addScaledVector(f.right, x).setY(f.pos.y + y);
    },
  };
  (ctx as unknown as { chunks: Map<number, THREE.Group> }).chunks = chunks;
  return ctx;
}

export function chunksOf(ctx: Ctx): Map<number, THREE.Group> {
  return (ctx as unknown as { chunks: Map<number, THREE.Group> }).chunks;
}

/** Add an invisible box occluder in rail-local placement. */
function occluder(ctx: Ctx, d: number, x: number, y: number, w: number, h: number, l: number, yaw = 0) {
  const m = new THREE.Mesh(Kit.box(w, h, l), Kit.mat(0x000000));
  ctx.put(m, d, x, y, yaw, ctx.proxies);
  ctx.occluders.push(m);
}

// ─── Road ────────────────────────────────────────────────────────────────────

/**
 * Lateral road profile: [x, wear]. Lane edges are clean asphalt, lane centres
 * carry the dark oil streak of a million sumps, shoulders and the median strip
 * are dusty and pale. Vertex colours interpolate between columns, so on the
 * arcade monitor the lanes read as dithered bands instead of one flat slab.
 */
const PROFILE: [number, number][] = [
  [X.ROAD_R, 1.2],
  [6.4, 1.08],
  [X.LANE_HALF, 1.0],
  [3.73, 0.72],
  [1.87, 1.02],
  [0, 0.72],
  [-1.87, 1.02],
  [-3.73, 0.72],
  [-X.LANE_HALF, 1.0],
  [X.MEDIAN, 1.12],
  [-8.6, 1.0],
  [-10.45, 0.76],
  [-12.3, 1.02],
  [-14.25, 0.76],
  [-16.2, 1.02],
  [-18.1, 0.76],
  [-20.0, 1.0],
  [X.ROAD_L, 1.2],
];

/** Small deterministic hash → [0, 1). */
function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Asphalt surface between rail distances d0..d1 with per-vertex lane wear. */
function roadStrip(ctx: Ctx, d0: number, d1: number, step: number, mat: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const nc = PROFILE.length;
  let rows = 0;
  for (let d = d0; d <= d1 + 0.001; d += step) {
    const dd = Math.min(d, d1);
    const f = ctx.frame(dd);
    // Slow resurfacing variation along the road + the odd patched lane.
    const along = 1 + 0.05 * Math.sin(dd * 0.043 + 1.3) * Math.sin(dd * 0.0171) + 0.03 * Math.sin(dd * 0.21);
    const block = Math.floor(dd / 15);
    for (let c = 0; c < nc; c++) {
      const [x, wear] = PROFILE[c];
      const lane = Math.floor((x + 22) / 3.8);
      const patch = hash(block, lane) < 0.14 ? 0.8 : hash(block, lane + 40) < 0.1 ? 1.14 : 1;
      const k = wear * along * patch;
      pos.push(f.pos.x + f.right.x * x, f.pos.y, f.pos.z + f.right.z * x);
      col.push(k, k, k);
    }
    if (rows > 0) {
      const a = (rows - 1) * nc;
      const b = rows * nc;
      // Columns run right → left, so (a, next, b) winds up toward +Y.
      for (let c = 0; c < nc - 1; c++) idx.push(a + c, b + c, a + c + 1, a + c + 1, b + c, b + c + 1);
    }
    rows++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(Kit.track(g), mat);
}

/** Road paint: same asphalt texture at lower strength reads as worn paint. */
const PAINT_WHITE = 0xd8d2c4;
const PAINT_YELLOW = 0xd8a428;
const paint = (c: number) => M.lam(c, 'asphalt', 0.55, 0.55);
/** The highway surface (also used by the start apron). */
const asphalt = () => M.lam(PAL.asphalt, 'asphalt', 0.55, 1);

export function buildRoad(ctx: Ctx, from: number, to: number) {
  const white = paint(PAINT_WHITE);
  const yellow = paint(PAINT_YELLOW);
  for (let d0 = from; d0 < to; d0 += CHUNK) {
    const d1 = Math.min(to, d0 + CHUNK);
    const g = ctx.chunk(d0 + 1);
    g.add(roadStrip(ctx, d0, d1, 5, asphalt()));
    // Solid edge lines.
    for (const [off, mat] of [
      [5.6, white],
      [-5.6, yellow],
      [-8.6, yellow],
      [-20.0, white],
    ] as const) {
      g.add(EnvKit.ribbon(ctx.curve, 0.16, mat, { from: d0, to: d1, step: 5, offset: off, y: 0.025 }));
    }
    // Lane dashes.
    for (let d = Math.ceil(d0 / 10) * 10; d < d1; d += 10) {
      for (const off of [-1.87, 1.87, -12.3, -16.2]) {
        ctx.put(Kit.mesh(Kit.box(0.15, 0.03, 3), white), d, off, 0.02);
      }
    }
  }
}

/** Road extension behind the start (seen in the opening look-back). */
export function buildStartApron(ctx: Ctx, root: THREE.Group) {
  const g = new THREE.Group();
  g.add(roadStrip(ctx, -320, 0, 5, asphalt()));
  Kit.add(g, Kit.box(0.16, 0.03, 320), paint(PAINT_WHITE), 5.6, 0.02, 160);
  Kit.add(g, Kit.box(0.16, 0.03, 320), paint(PAINT_YELLOW), -5.6, 0.02, 160);
  for (let z = 4; z < 320; z += 10) for (const x of [-1.87, 1.87, -12.3, -16.2]) Kit.add(g, Kit.box(0.15, 0.03, 3), paint(PAINT_WHITE), x, 0.02, z);
  for (let z = 2; z < 200; z += 4) {
    const s = new THREE.Group();
    jersey(s, 0, 0, 3.96);
    s.position.set(X.MEDIAN, 0, z);
    g.add(s);
  }
  // Wrecks and fires on the way out of the city.
  const rng = new Rng(77);
  for (let z = 12; z < 190; z += rng.range(9, 20)) {
    const lane = rng.pick([-3.8, 3.7, -12.3, -16.2, 6.5]);
    const c = car(rng, { burnt: rng.chance(0.4), lights: rng.chance(0.3) });
    c.position.set(lane + rng.spread(0.8), 0, z);
    c.rotation.y = (lane < -8 ? 0 : Math.PI) + rng.spread(0.5);
    g.add(c);
    if (rng.chance(0.3)) ctx.fires.add(new THREE.Vector3(c.position.x, 0.9, z), 1.0, 0.8);
  }
  // Burning outskirts.
  for (let z = 40; z < 260; z += rng.range(18, 30)) {
    for (const side of [-1, 1]) {
      if (!rng.chance(0.75)) continue;
      const x = side > 0 ? rng.range(18, 50) : rng.range(-60, -30);
      const h = rng.range(5, 16);
      const w = rng.range(8, 18);
      const dep = rng.range(8, 14);
      Kit.add(g, Kit.box(w, h, dep), M.lam(rng.pick([0x4a3434, 0x3a3644, 0x4c4032]), 'brick', 0.35, 1), x, h / 2, z);
      Kit.add(g, Kit.box(w + 0.4, 0.5, dep + 0.4), S.conc(0x2e2628), x, h + 0.25, z);
      const burning = rng.chance(0.5);
      // Window rows on the face looking down the highway.
      for (let fy = 2; fy < h - 1; fy += 3) {
        for (let fx = -w / 2 + 1.5; fx < w / 2 - 1; fx += 2.6) {
          const lit = burning && rng.chance(0.35) ? M.glow(0xff8a30, 1.3) : rng.chance(0.12) ? M.glow(0xffd090, 0.8) : S.clean(0x161420);
          // A single quad facing down the highway (−Z): the only side anyone sees.
          Kit.add(g, Kit.plane(1.2, 1.3), lit, x + fx, fy, z - dep / 2 - 0.05, 0, Math.PI, 0);
        }
      }
      if (burning) ctx.fires.add(new THREE.Vector3(x, h, z), rng.range(1.6, 2.6), 1);
    }
  }
  ctx.chunk(-1).add(g);
  void root;
}

// ─── Roadside furniture ─────────────────────────────────────────────────────

/** Median jersey barrier, both guard rails and light poles between d0..d1. */
export function buildFurniture(ctx: Ctx, d0: number, d1: number, opts: { rails?: boolean; poles?: boolean; median?: boolean } = {}) {
  const rng = ctx.rng;
  const rail = S.steel(PAL.metal);
  const post = S.steel(PAL.metalDark);
  for (let d = d0; d < d1; d += 4) {
    if (opts.median !== false) {
      const s = new THREE.Group();
      const hit = rng.chance(0.04);
      jersey(s, 0, 0, 3.96, 0, hit ? PAL.concreteDark : PAL.concrete);
      ctx.put(s, d + 2, X.MEDIAN + (hit ? rng.spread(0.5) : 0), 0, hit ? rng.spread(0.25) : 0);
    }
    if (opts.rails !== false) {
      for (const x of [X.RAIL_R + 0.3, X.FAR_EDGE - 0.4]) {
        ctx.put(Kit.mesh(Kit.box(0.12, 0.75, 0.12), post), d, x, 0.37);
        ctx.put(Kit.mesh(Kit.box(0.08, 0.3, 4.0), rail), d + 2, x + (x > 0 ? -0.08 : 0.08), 0.62);
      }
    }
  }
  if (opts.poles !== false) {
    for (let d = Math.ceil(d0 / 36) * 36 + 10; d < d1; d += 36) {
      const p = lightPole(true, rng.chance(0.72));
      ctx.put(p, d, X.MEDIAN, 0, Math.PI / 2);
    }
  }
}

/** Utility poles with sagging wires (nice silhouettes against the dusk sky). */
export function buildUtilityLine(ctx: Ctx, d0: number, d1: number, x: number) {
  const wood = M.lam(0x4a3828, 'bark', 0.6, 1);
  const wire = S.clean(0x141416);
  let prev: THREE.Vector3[] | null = null;
  for (let d = d0; d <= d1; d += 32) {
    const lean = ctx.rng.spread(0.06);
    const p = new THREE.Group();
    Kit.add(p, Kit.cyl(0.13, 0.17, 11, 6), wood, 0, 5.5, 0, 0, 0, lean);
    Kit.add(p, Kit.box(2.6, 0.16, 0.16), wood, 0, 10.3, 0, 0, 0, lean);
    ctx.put(p, d, x, 0, Math.PI / 2);
    const tips = [-1.1, 0, 1.1].map((o) => ctx.at(d, x, 10.45).addScaledVector(ctx.frame(d).forward, o));
    if (prev) {
      for (let i = 0; i < 3; i++) {
        const a = prev[i];
        const b = tips[i];
        // Two sagging segments.
        const mid = a.clone().lerp(b, 0.5);
        mid.y -= 1.3;
        for (const [p0, p1] of [
          [a, mid],
          [mid, b],
        ]) {
          const len = p0.distanceTo(p1);
          const m = Kit.mesh(Kit.box(0.04, 0.04, len), wire);
          m.position.copy(p0).lerp(p1, 0.5);
          m.lookAt(p1);
          ctx.chunk(d).add(m);
        }
      }
    }
    prev = tips;
  }
}

/** Scatter abandoned cars over the lanes (never the middle lane). */
export function scatterCars(ctx: Ctx, d0: number, d1: number, density: number, burnChance: number) {
  const rng = ctx.rng;
  for (let d = d0; d < d1; d += rng.range(7, 16) / density) {
    const lane = rng.pick([-3.8, 3.75, 6.6, -12.3, -16.2, -12.3, -16.2]);
    const burnt = rng.chance(burnChance);
    const c = car(rng, { burnt, lights: !burnt && rng.chance(0.35), doorOpen: rng.chance(0.3), kind: rng.chance(0.12) ? 3 : undefined });
    const facing = lane < -8 ? 0 : Math.PI;
    ctx.put(c, d, lane + rng.spread(0.5), 0, facing + rng.spread(0.45));
    if (burnt && rng.chance(0.55)) ctx.fires.add(ctx.at(d, lane, 0.9), rng.range(0.8, 1.2), rng.range(0.6, 1));
  }
}

/** Bushes, dead trees and the odd sign beyond the guard rails. */
export function scatterVerge(ctx: Ctx, d0: number, d1: number) {
  const rng = ctx.rng;
  for (let d = d0; d < d1; d += rng.range(4, 9)) {
    const side = rng.chance(0.5) ? 1 : -1;
    const x = side > 0 ? rng.range(9.5, 40) : rng.range(-48, -23);
    const dead = rng.chance(0.3);
    const o = dead ? deadTree(rng) : bush(rng);
    // ART: SPRITES: a pixel billboard of this species stands in for it (env.ts).
    o.userData.flora = dead ? 'deadTree' : 'bush';
    ctx.put(o, d, x, 0, rng.next() * 6);
  }
}

// ─── Section A: city outskirts ──────────────────────────────────────────────

function house(rng: Rng, burning: boolean): THREE.Group {
  const g = new THREE.Group();
  const w = rng.range(8, 12);
  const dpt = rng.range(7, 10);
  const h = rng.range(3, 5.5);
  Kit.add(g, Kit.box(w, h, dpt), M.lam(rng.pick([0x9a826a, 0x6a7e94, 0xa88e5e, 0x8a6a6a]), 'stucco', 0.35, 1), 0, h / 2, 0);
  const roof = M.lam(rng.pick([0x4a2c2a, 0x2e3040, 0x54402a]), 'planks', 0.35, 1);
  for (const s of [-1, 1]) Kit.add(g, Kit.box(w + 0.6, 0.25, dpt * 0.58), roof, 0, h + dpt * 0.18, s * dpt * 0.24, s * 0.62, 0, 0);
  for (const x of [-w / 3, w / 3]) {
    Kit.add(g, Kit.box(1.4, 1.2, 0.1), burning ? M.glow(0xff8a30, 1.3) : rng.chance(0.3) ? M.glow(0xffd090, 0.9) : S.clean(0x1a1a22), x, h * 0.55, dpt / 2 + 0.02);
  }
  Kit.add(g, Kit.box(1.1, 2.1, 0.1), M.lam(0x4a3220, 'planks', 1.5, 0.9), 0, 1.05, dpt / 2 + 0.02);
  return g;
}

export function buildOutskirts(ctx: Ctx) {
  const rng = ctx.rng;
  // Suburb on the left beyond the oncoming lanes.
  for (let d = 10; d < 300; d += rng.range(22, 34)) {
    const burning = rng.chance(0.35);
    const h = house(rng, burning);
    const x = rng.range(-62, -34);
    ctx.put(h, d, x, 0, Math.PI / 2 + rng.spread(0.15));
    if (burning) ctx.fires.add(ctx.at(d, x, 4.5), rng.range(1.8, 2.6), 1);
  }
  // Gas station on the right.
  {
    const d = 72;
    const g = new THREE.Group();
    const white = S.steel(0xdcd8d0);
    for (const x of [-5, 5]) for (const z of [-3.5, 3.5]) Kit.add(g, Kit.box(0.5, 5, 0.5), white, x, 2.5, z);
    Kit.add(g, Kit.box(14, 0.7, 10), M.lam(0xc42a20, 'metal', 0.45, 0.8), 0, 5.3, 0);
    Kit.add(g, Kit.box(14.1, 0.25, 10.1), white, 0, 5.1, 0);
    for (const x of [-4, 0, 4]) Kit.add(g, Kit.box(1.4, 0.06, 0.8), M.glow(0xf0f0ff, 1.2), x, 4.93, 0);
    for (const x of [-3, 3]) {
      Kit.add(g, Kit.box(0.9, 1.7, 0.5), S.steel(0xd0ccc4), x, 0.85, 0);
      Kit.add(g, Kit.box(0.5, 0.4, 0.52), M.glow(0x9ad0ff, 0.8), x, 1.3, 0);
    }
    // Shop.
    Kit.add(g, Kit.box(12, 4.5, 8), M.lam(0x9a8a74, 'brick', 0.45, 1), 0, 2.25, 13);
    Kit.add(g, Kit.box(8, 2, 0.1), M.glow(0xfff0c0, 0.9), 0, 1.8, 8.95);
    ctx.put(g, d, 24, 0, Math.PI / 2);
    // Tall pole sign.
    const s = new THREE.Group();
    Kit.add(s, Kit.cyl(0.3, 0.3, 12, 8), S.steel(PAL.metalDark), 0, 6, 0);
    Kit.add(s, Kit.box(5, 2.6, 0.6), S.plate(0xc42a20), 0, 13, 0);
    addText(s, 'GAS', M.glow(0xffe6a0, 1.3), 0, 13.4, 0.32, 0.2, 0.06);
    addText(s, '24H', M.glow(0xffffff, 1.0), 0, 12.3, 0.32, 0.12, 0.06);
    ctx.put(s, d - 18, 15, 0, -0.5);
    ctx.fires.add(ctx.at(d, 21, 1), 1.3, 1);
    const c = car(rng, { burnt: true });
    ctx.put(c, d, 21, 0, 0.4);
  }
  // Warehouses on the right.
  for (let d = 150; d < 300; d += rng.range(30, 44)) {
    const g = new THREE.Group();
    const w = rng.range(22, 36);
    const h = rng.range(7, 11);
    const dep = rng.range(16, 24);
    Kit.add(g, Kit.box(w, h, dep), M.lam(rng.pick([0x7a7a84, 0x5a6c80, 0x8a7460]), 'corrugated', 0.25, 0.9), 0, h / 2, 0);
    Kit.add(g, Kit.box(w + 0.4, 0.5, dep + 0.4), S.steel(0x3a3a40), 0, h + 0.25, 0);
    for (let x = -w / 2 + 4; x < w / 2 - 3; x += 6) Kit.add(g, Kit.box(4, 4.5, 0.12), M.lam(0x4e5058, 'corrugated', 0.4, 1), x, 2.25, dep / 2 + 0.03);
    if (rng.chance(0.6)) Kit.add(g, Kit.box(w * 0.5, 0.6, 0.12), M.glow(0xffd090, 0.8), 0, h - 1.5, dep / 2 + 0.05);
    ctx.put(g, d, rng.range(42, 60), 0, -Math.PI / 2);
    if (rng.chance(0.4)) ctx.fires.add(ctx.at(d, 48, h), 2.4, 1);
  }
  // Sound wall with graffiti (right).
  {
    const panel = M.lam(0x948c80, 'concrete', 0.55, 1);
    const tags = ["THEY'RE COMING", 'GOD HELP US', 'HEAD SHOTS ONLY', 'NO WAY OUT', 'RUN'];
    let t = 0;
    for (let d = 182; d < 252; d += 4) {
      const p = new THREE.Group();
      Kit.add(p, Kit.box(0.3, 4.6, 4.0), panel, 0, 2.3, 0);
      Kit.add(p, Kit.box(0.4, 4.8, 0.3), S.conc(0x6a665e), 0, 2.4, 2.0);
      ctx.put(p, d + 2, 11.5, 0);
      if ((d - 182) % 20 === 8 && t < tags.length) {
        const tg = new THREE.Group();
        addText(tg, tags[t], S.clean(rng.pick([0xe02020, 0x30a8f0, 0xf0e020, 0xf4f4f4])), 0, 0, 0, 0.12, 0.02);
        ctx.put(tg, d + 6, 11.33, 2.3, -Math.PI / 2);
        t++;
      }
    }
    occluder(ctx, 217, 11.5, 2.3, 0.4, 4.6, 70);
  }
  buildUtilityLine(ctx, 20, 175, 14.5);
}

// ─── Pile-up ────────────────────────────────────────────────────────────────

export function buildPileup(ctx: Ctx) {
  const rng = ctx.rng;
  const P = D.PILEUP;
  const wrecks: [number, number, number, CarOptsLite][] = [
    [-4.0, P - 4, Math.PI + 0.7, { color: 0x9a9a9a }],
    [3.9, P + 1, Math.PI - 0.5, { burnt: true }],
    [6.9, P + 9, 1.25, { kind: 2, color: 0x2a3a4a }],
    [-1.5, P + 9, 2.2, { burnt: true, kind: 2 }],
    [3.4, P + 10, -0.3, { color: 0x7a1c1c, doorOpen: true }],
    [-3.6, P + 5, Math.PI - 2.4, { kind: 3, color: 0xd8d4c8 }],
  ];
  for (const [x, d, yaw, o] of wrecks) {
    const c = car(rng, { ...o, lights: !o.burnt });
    ctx.put(c, d, x, 0, yaw);
    if (o.burnt) ctx.fires.add(ctx.at(d, x, 1.0), 1.15, 1);
  }
  // Police cruiser with its light bar on (the accent light flashes over it).
  const cop = car(rng, { color: 0xe8e8e8, kind: 4, lights: true });
  ctx.put(cop, P - 9, -3.9, 0, Math.PI - 0.35);
  // Car on its roof.
  const flip = car(rng, { color: 0x3a5a3a });
  flip.rotation.z = Math.PI;
  flip.position.y = 1.62;
  const fg = new THREE.Group();
  fg.add(flip);
  ctx.put(fg, P + 14, 1.2, 0, 0.5);
  // Jackknifed semi across the oncoming lanes.
  ctx.put(semiCab(0x2a4a7a), P + 4, -13.5, 0, 0.9);
  ctx.put(trailer(0x8a8274, 'FRESH FOODS'), P - 3, -16.5, 0, 1.3);
  // Road flares.
  for (let i = 0; i < 6; i++) {
    const f = Kit.mesh(Kit.cyl(0.04, 0.04, 0.3, 5), M.glow(0xff3020, 1.6));
    f.rotation.z = Math.PI / 2;
    ctx.put(f, P - 14 + i * 1.6, -5 + rng.spread(1.2), 0.05, rng.next() * 3);
  }
}

interface CarOptsLite {
  color?: number;
  burnt?: boolean;
  doorOpen?: boolean;
  kind?: number;
}

// ─── Overpass ───────────────────────────────────────────────────────────────

export function buildOverpass(ctx: Ctx) {
  const d = D.OVERPASS;
  const g = new THREE.Group();
  const conc = S.conc(PAL.concrete);
  const dark = S.conc(PAL.concreteDark);
  const rail = S.steel(PAL.metal);
  // Deck (spans local X), bottom at 6.3, top at 7.3.
  Kit.add(g, Kit.box(80, 1.0, 12), conc, -3, 6.8, 0);
  for (const z of [-4.5, -1.5, 1.5, 4.5]) Kit.add(g, Kit.box(80, 0.8, 0.7), dark, -3, 5.9, z);
  // Far side: solid parapet. Near side (facing the truck): low curb + open railing,
  // so whatever stands on the deck edge is in plain view.
  Kit.add(g, Kit.box(80, 1.0, 0.3), conc, -3, 7.8, -5.85);
  Kit.add(g, Kit.box(80, 0.3, 0.35), conc, -3, 7.45, 5.85);
  Kit.add(g, Kit.box(80, 0.08, 0.08), rail, -3, 8.35, 5.85);
  Kit.add(g, Kit.box(80, 0.06, 0.06), rail, -3, 7.95, 5.85);
  for (let x = -42; x <= 36; x += 2.5) Kit.add(g, Kit.box(0.07, 0.8, 0.07), rail, x, 7.95, 5.85);
  // Piers.
  for (const x of [12.5, X.MEDIAN, -26]) {
    for (const z of [-3.5, 3.5]) Kit.add(g, Kit.box(1.4, 6.3, 1.4), dark, x, 3.15, z);
    Kit.add(g, Kit.box(1.8, 0.9, 10), conc, x, 5.85, 0);
  }
  // Embankments at both ends.
  for (const s of [-1, 1]) {
    const x = s > 0 ? 40 : -46;
    Kit.add(g, Kit.box(14, 7.3, 14), M.lam(PAL.dirt, 'dirt', 0.45, 1), x, 3.65, 0);
  }
  // Green sign panels hung on the near parapet.
  const s1 = signPanel(['BRIDGE 3 MI', 'SAFE ZONE ^'], 7.4, 2.6);
  s1.position.set(4.6, 9.2, 6.2);
  g.add(s1);
  // Abandoned bus + car on the deck.
  const b = bus(true);
  b.position.set(-20, 7.3, -1.2);
  b.rotation.y = Math.PI / 2 + 0.1;
  g.add(b);
  const c = car(ctx.rng, { color: 0x1c3a6a, lights: true });
  c.position.set(10, 7.3, 1.5);
  c.rotation.y = -Math.PI / 2 + 0.3;
  g.add(c);
  ctx.put(g, d, 0, 0, 0);
  ctx.fires.add(ctx.at(d, -20, 9.5), 1.6, 0.5);
}

// ─── Billboards / motel ─────────────────────────────────────────────────────

export function buildBillboards(ctx: Ctx) {
  const rng = ctx.rng;
  // Printed faces stay clean (readable); paper sheets over the planks get a faint seam.
  const red = S.clean(0xd42a1c);
  const yellow = S.clean(0xf8c830);
  const white = S.clean(0xf0ece0);
  const black = S.clean(0x16161a);
  const sheet = (c: number) => M.lam(c, 'planks', 0.35, 0.18);
  const repent = billboard((f) => {
    Kit.add(f, Kit.box(12, 5, 0.1), sheet(0xf0ece0), 0, 0, 0.05);
    addText(f, 'REPENT', red, 0, 0.8, 0.12, 0.34, 0.06);
    addText(f, 'THE END IS NEAR', black, 0, -1.4, 0.12, 0.13, 0.05);
  });
  ctx.put(repent, D.BILLBOARDS_FROM + 4, 18, 0, -0.42);
  const burger = billboard((f) => {
    Kit.add(f, Kit.box(12, 5, 0.1), sheet(0xd42a1c), 0, 0, 0.05);
    // Burger.
    Kit.add(f, Kit.box(3.2, 0.9, 0.2), S.clean(0xe8a440), -3.4, 0.9, 0.15);
    Kit.add(f, Kit.box(3.4, 0.45, 0.2), S.clean(0x6a2e14), -3.4, 0.2, 0.15);
    Kit.add(f, Kit.box(3.5, 0.18, 0.2), S.clean(0x50b030), -3.4, -0.15, 0.15);
    Kit.add(f, Kit.box(3.2, 0.7, 0.2), S.clean(0xe8a440), -3.4, -0.65, 0.15);
    addText(f, 'BURGER', yellow, 1.9, 1.0, 0.12, 0.2, 0.05);
    addText(f, 'BARN', yellow, 1.9, -0.8, 0.12, 0.26, 0.05);
    addText(f, 'EXIT 9 >', white, 1.9, -2.0, 0.12, 0.08, 0.04);
  });
  ctx.put(burger, D.BILLBOARDS_FROM + 46, -27, 0, 0.42);
  // Burning, sagging billboard.
  const burnt = billboard((f) => {
    Kit.add(f, Kit.box(12, 5, 0.1), M.lam(0x2a2226, 'planks', 0.7, 1), 0, 0, 0.05);
    addText(f, 'MOTEL', M.lam(0x5a4a40, 'planks', 0.7, 0.6), 0, 0.5, 0.12, 0.28, 0.05);
  }, false);
  burnt.rotation.z = 0.12;
  ctx.put(burnt, D.BILLBOARDS_FROM + 92, 19, 0, -0.35);
  ctx.fires.add(ctx.at(D.BILLBOARDS_FROM + 92, 17, 13.5), 2.2, 1);
  // Motel with neon.
  {
    const g = new THREE.Group();
    Kit.add(g, Kit.box(34, 6, 10), M.lam(0xa07460, 'stucco', 0.35, 1), 0, 3, 0);
    Kit.add(g, Kit.box(34.4, 0.4, 12), M.lam(0x4a3028, 'planks', 0.45, 1), 0, 6.2, 1);
    for (let x = -15; x <= 15; x += 3.4) {
      Kit.add(g, Kit.box(1, 2.1, 0.1), M.lam(0x6a3e2a, 'planks', 1.5, 0.9), x - 0.8, 1.05, 5.02);
      Kit.add(g, Kit.box(1, 1, 0.1), rng.chance(0.4) ? M.glow(0xffc070, 0.9) : S.clean(0x1a1a20), x + 0.6, 1.6, 5.02);
      Kit.add(g, Kit.box(1, 1, 0.1), rng.chance(0.3) ? M.glow(0xffc070, 0.9) : S.clean(0x1a1a20), x + 0.6, 4.4, 5.02);
    }
    const sign = new THREE.Group();
    Kit.add(sign, Kit.cyl(0.25, 0.25, 9, 6), S.steel(PAL.metalDark), 0, 4.5, 0);
    Kit.add(sign, Kit.box(7, 2.2, 0.4), S.steel(0x1a1a24), 0, 9.6, 0);
    addText(sign, 'MOTEL', M.glow(0xff3a8a, 1.5), 0, 9.9, 0.22, 0.2, 0.05);
    addText(sign, 'VACANCY', M.glow(0x40ff90, 1.2), 0, 8.95, 0.22, 0.09, 0.04);
    sign.position.set(-14, 0, 12);
    g.add(sign);
    ctx.put(g, D.BILLBOARDS_FROM + 66, 46, 0, -Math.PI / 2 + 0.1);
  }
  // Gantry sign over the lanes.
  {
    const g = new THREE.Group();
    const steel = S.steel(PAL.metalDark);
    for (const x of [-8.2, 9.2]) Kit.add(g, Kit.box(0.4, 7.2, 0.4), steel, x, 3.6, 0);
    Kit.add(g, Kit.box(17.8, 0.5, 0.5), steel, 0.5, 7.0, 0);
    Kit.add(g, Kit.box(17.8, 0.3, 0.3), steel, 0.5, 6.2, 0);
    const p1 = signPanel(['TUNNEL', 'TURN ON LIGHTS'], 6.2, 2.4);
    p1.position.set(-3.6, 7.4, 0.35);
    g.add(p1);
    const p2 = signPanel(['BRIDGE  1', 'NO STOPPING'], 6.2, 2.4);
    p2.position.set(3.6, 7.4, 0.35);
    g.add(p2);
    ctx.put(g, D.BILLBOARDS_FROM + 120, 0, 0, 0);
  }
}

// ─── Tanker (static part) ───────────────────────────────────────────────────

export function buildTankerSite(ctx: Ctx) {
  const T = D.TANKER;
  // Cab on its side, jackknifed on the right.
  const cab = semiCab(0x5e1a16);
  cab.rotation.z = Math.PI / 2;
  cab.position.y = 1.3;
  const holder = new THREE.Group();
  holder.add(cab);
  ctx.put(holder, T + 2, 6.4, 0, 0.6);
  // Fuel spill: a glossy, oily sheen with a ragged outline (overlapping thin slabs), not a black hole.
  {
    const oil = M.lam(0x2c2734, 'asphalt', 1, 0.35);
    const sheen = S.clean(0x3e3850);
    const slabs: [number, number, number, number, number][] = [
      [0, 0, 6.5, 3.6, 0.2],
      [-2.2, 1.1, 4.2, 2.6, -0.5],
      [2.4, -0.8, 3.8, 2.4, 0.7],
      [0.6, 2.0, 3.0, 1.8, 1.2],
      [-1.0, -1.7, 3.4, 1.6, -0.2],
      [3.6, 1.0, 2.0, 1.2, 0.3],
    ];
    const g = new THREE.Group();
    slabs.forEach(([x, z, w, l, r], i) => Kit.add(g, Kit.box(w, 0.02, l), i % 2 ? sheen : oil, x, 0.004 * i, z, 0, r, 0));
    ctx.put(g, T - 5, -2, 0.03, 0.2);
  }
  ctx.fires.add(ctx.at(T + 3, 7.5, 0.6), 1.2, 1);
  // Warning triangle + flares.
  for (let i = 0; i < 5; i++) {
    const f = Kit.mesh(Kit.cyl(0.04, 0.04, 0.3, 5), M.glow(0xff3020, 1.6));
    f.rotation.z = Math.PI / 2;
    ctx.put(f, T - 11 - i * 1.3, 1.5 + ctx.rng.spread(2), 0.05, ctx.rng.next() * 3);
  }
}

// ─── Tunnel + ridge ─────────────────────────────────────────────────────────

export const TUNNEL = { L: -7.4, R: 8.8, H: 7.4 };

/** Tunnel bore + portals. Returns the group of ceiling lights (baked separately, toggled during the stall). */
export function buildTunnel(ctx: Ctx): { lights: THREE.Group; fixtures: THREE.Vector3[] } {
  const rng = ctx.rng;
  const t0 = D.TUNNEL_FROM;
  const t1 = D.TUNNEL_TO;
  const wall = M.lam(0x8a929c, 'tiles', 0.6, 1);
  const grime = M.lam(0x44403e, 'concrete', 0.7, 1);
  const ceil = M.lam(0x5a5662, 'concrete', 0.55, 1);
  const stripe = S.hazard(0xe0a020);
  const lights = new THREE.Group();
  lights.name = 'tunnel-lights';
  const fixtures: THREE.Vector3[] = [];
  const W = TUNNEL.R - TUNNEL.L;
  const C = (TUNNEL.R + TUNNEL.L) / 2;
  for (let d = t0; d < t1; d += 6) {
    const seg = new THREE.Group();
    for (const [x, s] of [
      [TUNNEL.L - 0.25, 1],
      [TUNNEL.R + 0.25, -1],
    ] as const) {
      Kit.add(seg, Kit.box(0.5, TUNNEL.H, 6.02), wall, x, TUNNEL.H / 2, 0);
      Kit.add(seg, Kit.box(0.52, 1.2, 6.02), grime, x, 0.6, 0);
      Kit.add(seg, Kit.box(0.54, 0.18, 6.02), stripe, x, 1.35, 0);
      void s;
    }
    Kit.add(seg, Kit.box(W + 1, 0.6, 6.02), ceil, C, TUNNEL.H + 0.3, 0);
    // Light fixture housings (dark) — the lit panels live in `lights`.
    for (const x of [-2.6, 3.8]) Kit.add(seg, Kit.box(0.5, 0.18, 2.2), S.trim(0x24242a), x, TUNNEL.H - 0.08, 0);
    ctx.put(seg, d + 3, 0, 0, 0);
    for (const x of [-2.6, 3.8]) {
      const l = Kit.mesh(Kit.box(0.36, 0.06, 1.9), M.glow(0xffa848, 1.6));
      ctx.put(l, d + 3, x, TUNNEL.H - 0.2, 0, lights);
    }
    fixtures.push(ctx.at(d + 3, 0.6, TUNNEL.H - 0.6));
    if ((d - t0) % 30 === 12) {
      // Emergency exit sign + phone box on the right wall.
      const e = new THREE.Group();
      Kit.add(e, Kit.box(0.1, 0.5, 1.2), M.glow(0x30ff70, 1.2), 0, 0, 0);
      ctx.put(e, d, TUNNEL.R - 0.02, 3.2, 0);
      ctx.put(Kit.mesh(Kit.box(0.3, 1.2, 0.8), S.steel(0xc03020)), d + 2, TUNNEL.R - 0.15, 1.1, 0);
    }
    if ((d - t0) % 42 === 18) {
      // Jet fans.
      for (const x of [-1.4, 2.6]) {
        const f = Kit.mesh(Kit.cyl(0.55, 0.55, 3, 10), S.steel(0x5a5e64));
        f.rotation.x = Math.PI / 2;
        ctx.put(f, d, x, TUNNEL.H - 1.0, 0);
      }
    }
  }
  // Occluder proxies for the bore (walls + ceiling), a few straight pieces.
  for (let d = t0; d < t1; d += 22) {
    const len = Math.min(22, t1 - d);
    occluder(ctx, d + len / 2, TUNNEL.L - 0.3, TUNNEL.H / 2, 0.6, TUNNEL.H, len + 1);
    occluder(ctx, d + len / 2, TUNNEL.R + 0.3, TUNNEL.H / 2, 0.6, TUNNEL.H, len + 1);
    occluder(ctx, d + len / 2, C, TUNNEL.H + 0.3, W + 1, 0.6, len + 1);
  }
  // Portals.
  for (const [d, dir] of [
    [t0, 1],
    [t1, -1],
  ] as const) {
    const p = new THREE.Group();
    const conc = M.lam(0x968e84, 'concrete', 0.5, 1);
    // Facade: above the openings + side pillars + middle pillar between bores.
    Kit.add(p, Kit.box(52, 9, 2), conc, -6, TUNNEL.H + 4.5, 0);
    Kit.add(p, Kit.box(16, TUNNEL.H, 2), conc, TUNNEL.R + 8, TUNNEL.H / 2, 0);
    Kit.add(p, Kit.box(10, TUNNEL.H, 2), conc, X.FAR_EDGE - 5.6, TUNNEL.H / 2, 0);
    Kit.add(p, Kit.box(1.6, TUNNEL.H, 2), conc, -8.2, TUNNEL.H / 2, 0);
    Kit.add(p, Kit.box(53, 0.6, 2.6), S.hazard(0xe0a020), -6, TUNNEL.H + 0.3, 0.2 * dir);
    // Oncoming bore: dark mouth.
    Kit.add(p, Kit.box(11.6, TUNNEL.H, 6), S.clean(0x0c0c10), -14.8, TUNNEL.H / 2, -3.2 * dir);
    if (dir > 0) addText(p, 'ROUTE 9 TUNNEL', S.clean(0xece8dc), 0.7, TUNNEL.H + 3.0, 1.06, 0.16, 0.05);
    // Lamps flanking the portal.
    for (const x of [-6.8, 8.2]) Kit.add(p, Kit.box(0.6, 0.3, 0.3), M.glow(0xffb050, 1.5), x, TUNNEL.H + 1.3, 1.1 * dir);
    ctx.put(p, d - dir, 0, 0, 0);
  }
  // The ridge the tunnel cuts through: rock masses either side and over the top.
  const rock = M.lam(0x6a5c62, 'rock', 0.18, 1);
  const rockDark = M.lam(0x4e4450, 'rock', 0.18, 1);
  const ridge = new THREE.Group();
  for (let d = t0 - 8; d < t1 + 10; d += 14) {
    for (const side of [-1, 1]) {
      const s = rng.range(14, 20);
      const x = side > 0 ? s + 10 + rng.range(0, 6) : -(s + 22 + rng.range(0, 6));
      const geo = Kit.jitter(Kit.ico(1, 1), 0.25, Math.floor(rng.next() * 1000));
      const m = Kit.mesh(geo, rng.chance(0.5) ? rock : rockDark);
      m.scale.set(s, rng.range(16, 26), s);
      ctx.put(m, d, x, 0, rng.next() * 6, ridge);
    }
    // Over the bore.
    if (d < t0 + 4 || d > t1 - 4) continue;
    const top = Kit.mesh(Kit.jitter(Kit.ico(1, 1), 0.2, Math.floor(rng.next() * 1000)), rock);
    top.scale.set(30, 7, 12);
    ctx.put(top, d, -6, TUNNEL.H + 9, rng.spread(0.3), ridge);
  }
  ctx.landmarks.push(ridge);
  return { lights, fixtures };
}

// ─── Bridge ─────────────────────────────────────────────────────────────────

export const BRIDGE = { L: -22.2, R: 9.6, CABLE_R: 10.6, CABLE_L: -23.2, TOWER_TOP: 50, WATER: -26 };

/** Cable height (above deck) at rail distance d. */
export function cableY(d: number): number {
  const a = D.BRIDGE_FROM;
  const t1 = D.TOWER_A;
  const t2 = D.TOWER_B;
  const b = D.BRIDGE_TO;
  const top = BRIDGE.TOWER_TOP - 3;
  if (d <= t1) return 2 + (top - 2) * Math.pow((d - a) / (t1 - a), 1.2);
  if (d >= t2) return 2 + (top - 2) * Math.pow((b - d) / (b - t2), 1.2);
  const u = (d - t1) / (t2 - t1);
  const sag = 4 * u * (1 - u);
  return top - (top - 6) * sag;
}

export function buildBridge(ctx: Ctx) {
  const a = D.BRIDGE_FROM;
  const b = D.BRIDGE_TO;
  const orange = M.lam(0xb8442a, 'metal', 0.55, 0.9);
  const orangeDark = M.lam(0x84301f, 'metal', 0.55, 0.9);
  const conc = S.conc(0x8a847c);
  const W = BRIDGE.R - BRIDGE.L;
  const C = (BRIDGE.R + BRIDGE.L) / 2;
  for (let d = a; d < b; d += 10) {
    const seg = new THREE.Group();
    Kit.add(seg, Kit.box(W, 1.6, 10.02), conc, C, -0.82, 0);
    // Stiffening truss under the deck edges.
    for (const x of [BRIDGE.L + 0.6, BRIDGE.R - 0.6]) {
      Kit.add(seg, Kit.box(0.8, 3.2, 10.02), orange, x, -3.2, 0);
      Kit.add(seg, Kit.box(0.3, 4.2, 0.3), orangeDark, x, -3, -4.8, 0.5, 0, 0);
    }
    Kit.add(seg, Kit.box(W - 2, 0.3, 0.6), orangeDark, C, -4.6, 0);
    // Parapets + railing.
    for (const x of [BRIDGE.L + 0.25, BRIDGE.R - 0.25]) {
      Kit.add(seg, Kit.box(0.5, 0.8, 10.02), conc, x, 0.4, 0);
      Kit.add(seg, Kit.box(0.12, 0.12, 10.02), orange, x, 1.4, 0);
      for (const z of [-2.5, 2.5]) Kit.add(seg, Kit.box(0.1, 0.6, 0.1), orange, x, 1.1, z);
    }
    ctx.put(seg, d + 5, 0, 0, 0);
    // Suspenders.
    for (const [x] of [[BRIDGE.CABLE_R], [BRIDGE.CABLE_L]] as const) {
      const h = cableY(d + 5);
      if (h > 2.5) ctx.put(Kit.mesh(Kit.cyl(0.07, 0.07, h - 1, 4), orange), d + 5, x, (h + 1) / 2, 0);
    }
  }
  // Lamp posts along both edges (the Behemoth rips one off in phase 2).
  for (let d = a + 8; d < b; d += 30) {
    for (const [x, yaw] of [
      [BRIDGE.R - 0.7, Math.PI],
      [BRIDGE.L + 0.7, 0],
    ] as const) {
      const p = new THREE.Group();
      Kit.add(p, Kit.cyl(0.09, 0.13, 8, 6), S.steel(PAL.metalDark), 0, 4, 0);
      Kit.add(p, Kit.box(0.08, 0.08, 1.8), S.steel(PAL.metalDark), 0, 7.95, 0.9);
      Kit.add(p, Kit.box(0.34, 0.14, 0.6), S.trim(0x222226), 0, 7.9, 1.75);
      Kit.add(p, Kit.box(0.28, 0.05, 0.5), M.glow(PAL.sodium, 1.4), 0, 7.82, 1.75);
      void yaw;
      ctx.put(p, d, x, 0, x > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  // Main cables (segment chains) — one landmark group, never culled by chunk.
  const cables = new THREE.Group();
  for (const x of [BRIDGE.CABLE_R, BRIDGE.CABLE_L]) {
    let prev = ctx.at(a, x, cableY(a));
    for (let d = a + 8; d <= b; d += 8) {
      const p = ctx.at(Math.min(d, b), x, cableY(Math.min(d, b)));
      const len = prev.distanceTo(p);
      const m = Kit.mesh(Kit.cyl(0.38, 0.38, len, 6), orange);
      m.position.copy(prev).lerp(p, 0.5);
      m.lookAt(p);
      m.rotateX(Math.PI / 2);
      cables.add(m);
      prev = p;
    }
  }
  // Towers.
  for (const d of [D.TOWER_A, D.TOWER_B]) {
    const t = new THREE.Group();
    const tower = M.lam(0xb8442a, 'metal', 0.2, 1);
    for (const x of [BRIDGE.CABLE_R, BRIDGE.CABLE_L]) {
      const h = BRIDGE.TOWER_TOP - BRIDGE.WATER;
      Kit.add(t, Kit.box(3, h, 4.2), tower, x, BRIDGE.WATER + h / 2, 0);
      Kit.add(t, Kit.box(3.4, 2, 4.6), orangeDark, x, BRIDGE.TOWER_TOP, 0);
      for (let y = -20; y < BRIDGE.TOWER_TOP; y += 6) Kit.add(t, Kit.box(3.1, 0.25, 4.3), orangeDark, x, y, 0);
      // Pier in the water.
      Kit.add(t, Kit.box(7, 6, 9), conc, x, BRIDGE.WATER + 2, 0);
      // Aircraft warning lamp.
      Kit.add(t, Kit.box(0.6, 0.6, 0.6), M.glow(0xff2a1a, 2), x, BRIDGE.TOWER_TOP + 1.3, 0);
    }
    const span = BRIDGE.CABLE_R - BRIDGE.CABLE_L;
    const mid = (BRIDGE.CABLE_R + BRIDGE.CABLE_L) / 2;
    for (const y of [BRIDGE.TOWER_TOP - 2, 34, 18]) Kit.add(t, Kit.box(span, 2.4, 3.2), tower, mid, y, 0);
    Kit.add(t, Kit.box(span, 2.4, 3.2), tower, mid, -4, 0);
    ctx.put(t, d, 0, 0, 0, cables);
  }
  ctx.landmarks.push(cables);
}

/** Water, shore cliffs, a burning ship and the far shore with the SAFE ZONE checkpoint. */
export function buildBay(ctx: Ctx, root: THREE.Group) {
  const rng = ctx.rng;
  const water = new THREE.Mesh(Kit.plane(1400, 900), M.lam(0x34305a, 'water', 0.14, 0.9));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, BRIDGE.WATER, -940);
  root.add(water);
  // Shore cliffs (near + far).
  for (const [d, yaw] of [
    [D.BRIDGE_FROM + 6, 0],
    [D.BRIDGE_TO - 6, Math.PI],
  ] as const) {
    const g = new THREE.Group();
    const cliff = M.lam(0x564850, 'rock', 0.3, 1);
    Kit.add(g, Kit.box(520, -BRIDGE.WATER + 1, 6), cliff, 0, BRIDGE.WATER / 2 - 0.5, 0);
    for (let i = 0; i < 26; i++) {
      const m = Kit.add(g, Kit.jitter(Kit.ico(1, 0), 0.3, i + (yaw ? 50 : 0)), M.lam(0x463a42, 'rock', 0.3, 1), rng.range(-200, 200), BRIDGE.WATER + rng.range(0, 8), rng.range(-4, -1));
      m.scale.set(rng.range(5, 14), rng.range(6, 16), rng.range(4, 9));
    }
    // Bridge abutment.
    Kit.add(g, Kit.box(40, -BRIDGE.WATER, 10), M.lam(0x7a746c, 'concrete', 0.5, 0.9), 0, BRIDGE.WATER / 2, -4);
    ctx.put(g, d, 0, 0, yaw);
  }
  // Far shore ground.
  const far = EnvKit.ground(700, PAL.dirt, 0, -1500, -0.04);
  far.material = M.lam(0x4a3e34, 'dirt', 0.5, 0.7);
  root.add(far);
  // A burning freighter out in the bay.
  {
    const g = new THREE.Group();
    Kit.add(g, Kit.box(14, 6, 70), M.lam(0x4a2c2a, 'metal', 0.3, 1), 0, 1, 0);
    Kit.add(g, Kit.box(12, 9, 12), M.lam(0xd8d4cc, 'metal', 0.3, 0.6), 0, 8, 26);
    for (let z = -26; z < 20; z += 9) Kit.add(g, Kit.box(12, 4.5, 8), M.lam(rng.pick([0xb83a2a, 0x2a5a9a, 0x3a8a4a, 0xd8a02a]), 'metal', 0.3, 0.9), 0, 6, z);
    g.position.set(-150, BRIDGE.WATER, -905);
    g.rotation.y = 0.5;
    g.rotation.z = 0.08;
    ctx.chunk(D.TOWER_A + 60).add(g);
    ctx.fires.add(new THREE.Vector3(-150, BRIDGE.WATER + 10, -905), 4, 1);
    ctx.fires.add(new THREE.Vector3(-162, BRIDGE.WATER + 9, -925), 3, 1);
  }
  // Far shore: SAFE ZONE checkpoint + floodlights.
  {
    const d = D.END - 2;
    const g = new THREE.Group();
    const steel = S.steel(PAL.metalDark);
    for (const x of [-9, 10]) Kit.add(g, Kit.box(0.6, 8, 0.6), steel, x, 4, 0);
    Kit.add(g, Kit.box(19.6, 0.6, 0.6), steel, 0.5, 7.8, 0);
    const s = signPanel(['SAFE ZONE', 'MILITARY CHECKPOINT'], 15.5, 2.9, 0x1a3a1a);
    s.position.set(0.5, 9.4, 0.4);
    g.add(s);
    for (const x of [-16, 17]) {
      const t = new THREE.Group();
      Kit.add(t, Kit.box(0.3, 10, 0.3), steel, 0, 5, 0);
      Kit.add(t, Kit.box(2.4, 1.2, 0.5), S.steel(0x2a2a2e), 0, 10.4, 0);
      for (const lx of [-0.6, 0.6]) Kit.add(t, Kit.box(0.9, 0.8, 0.1), M.glow(0xf0f4ff, 2), lx, 10.4, 0.27);
      t.position.set(x, 0, -4);
      g.add(t);
    }
    sandbags(g, -6, -2, 6, 3);
    sandbags(g, 7, -2, 6, 3);
    // Tank guarding the checkpoint.
    const tank = new THREE.Group();
    const olive = M.lam(0x56663a, 'metal', 0.8, 0.7);
    const dark = S.trim(0x2a2e22);
    Kit.add(tank, Kit.box(3.4, 1.0, 6.6), olive, 0, 1.1, 0);
    for (const sx of [-1, 1]) Kit.add(tank, Kit.box(0.9, 1.0, 7.0), dark, sx * 1.75, 0.6, 0);
    Kit.add(tank, Kit.box(2.4, 0.8, 3.0), olive, 0, 2.0, -0.3);
    Kit.add(tank, Kit.cyl(0.14, 0.18, 4.4, 8), dark, 0, 2.05, 3.2, Math.PI / 2, 0, 0);
    addText(tank, 'U.S. ARMY', S.clean(0xece8dc), 0, 1.2, 3.31, 0.06, 0.02);
    tank.position.set(-14, 0, -10);
    tank.rotation.y = 0.5;
    g.add(tank);
    ctx.put(g, d, 0, 0, 0);
  }
}

// ─── Bridge barricade (static) ──────────────────────────────────────────────

export function buildBarricade(ctx: Ctx) {
  const d = D.BARRICADE;
  const g = new THREE.Group();
  // Concrete blocks across all lanes except the gate.
  for (const x of [-5.2, -3.6, 3.6, 5.2, 7.4, -10.5, -12.5, -14.5, -16.5, -18.5, -20.5]) {
    const s = new THREE.Group();
    jersey(s, 0, 0, 1.9, 0, 0xb8b4a8);
    // Military hazard band round the top of each block.
    Kit.add(s, Kit.box(0.32, 0.2, 1.92), S.hazard(0xe8b420), 0, 0.8, 0);
    s.position.set(x, 0, 0);
    s.rotation.y = Math.PI / 2;
    g.add(s);
  }
  sandbags(g, -4.4, 1.2, 3.4, 3);
  sandbags(g, 4.6, 1.2, 4.2, 3);
  // Gate posts.
  for (const x of [-2.6, 2.6]) Kit.add(g, Kit.box(0.25, 2.6, 0.25), S.hazard(0xe8b420), x, 1.3, 0);
  // Floodlight towers.
  for (const x of [8.4, -9.4]) {
    const t = new THREE.Group();
    Kit.add(t, Kit.box(0.25, 7, 0.25), S.steel(PAL.metalDark), 0, 3.5, 0);
    Kit.add(t, Kit.box(1.8, 0.9, 0.4), S.steel(0x2a2a2e), 0, 7.2, 0);
    Kit.add(t, Kit.box(0.7, 0.6, 0.1), M.glow(0xf0f4ff, 1.8), -0.45, 7.2, 0.22);
    t.position.set(x, 0, -2);
    g.add(t);
  }
  // Army truck parked across the right lanes, canvas back.
  const tr = new THREE.Group();
  const olive = M.lam(0x56663a, 'metal', 0.8, 0.7);
  Kit.add(tr, Kit.box(2.5, 2.2, 2.6), olive, 0, 1.9, 3.2);
  Kit.add(tr, Kit.box(2.4, 0.9, 0.06), S.clean(PAL.glass), 0, 2.5, 4.52);
  Kit.add(tr, Kit.box(2.6, 2.6, 5.4), S.canvas(0x66704a), 0, 2.6, -1.0);
  Kit.add(tr, Kit.box(2.5, 0.5, 8.8), S.trim(0x1c1c20), 0, 0.95, 0.4);
  for (const z of [3.2, -0.6, -2.4]) for (const s of [-1, 1]) Kit.add(tr, Kit.cyl(0.55, 0.55, 0.4, 8), S.trim(PAL.tyre), s * 1.1, 0.55, z, 0, 0, Math.PI / 2);
  addText(tr, 'U.S. ARMY', S.clean(0xece8dc), 0, 2.9, -3.72, 0.07, 0.02);
  tr.position.set(-14, 0, 4);
  tr.rotation.y = 1.2;
  g.add(tr);
  ctx.put(g, d, 0, 0, 0);
  ctx.fires.add(ctx.at(d - 6, -6.2, 0.6), 0.8, 0.8);
}
