import { PWF, type PwCanvas } from './canvas';
import type { PwAtlas, PwKit, PwTile } from './atlas';
import { hash2, smooth } from './surfaces';
import { d1RowsFor, dAz, mixHex } from './d1Sky';

/**
 * JUNGLE RUN (d1) volcano for ART: PIXEL WORLD — the island's smoking peak as
 * a painted backdrop panel (cut out above), not a cone:
 *  - a jagged profile: a notched crater rim, the far side of the crater wall
 *    collapsed into a scooped scar, a parasitic shoulder vent with its own
 *    thread of smoke, small steps along both flanks;
 *  - erosion ribs and gullies running down from the summit (each rib lit on
 *    the sun side, its gully in shadow), pale scree fans at the gullies' feet;
 *  - the jungle creeping up the lower third (canopy crowns, higher in the
 *    gullies), stepped haze at the foot down to the fog colour;
 *  - glowing lava seams down the scar (unlit GLOW), a lit crater lip;
 *  - the plume: billowing puffs (lit toward the sun, violet shadow side, an
 *    ash-dark core low down, its underside lit orange by the crater) leaning
 *    with the wind, spreading and thinning out in dither at the top.
 * The panel is laid with `span` = `d1VolcanoSpan()` centred on `az`.
 */

export interface D1VolcanoOpts {
  rock: number;
  canopy: number;
  haze: number;
  el0: number;
  el1: number;
  az: number;
  /** Half the cone's foot width (deg). */
  halfWidth: number;
  lightAz: number;
}

const TW = 2048;
const h6 = (n: number) => n.toString(16).padStart(6, '0');
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Azimuth span (deg) of the volcano panel: the cone plus room for the leaning plume. */
export function d1VolcanoSpan(o: { halfWidth: number }): number {
  return o.halfWidth * 2 + 16;
}

export function d1VolcanoTile(atlas: PwAtlas, o: D1VolcanoOpts): PwTile {
  const H = d1RowsFor(o.el1 - o.el0);
  const W = Math.round((d1VolcanoSpan(o) * TW) / 360 / 16) * 16;
  return atlas.tile(`d1volcano|${h6(o.rock)}|${h6(o.canopy)}|${h6(o.haze)}|${o.el0}|${o.el1}|${o.halfWidth}|${Math.round(dAz(o.az, o.lightAz))}`, W, H, (c, k) => paintVolcano(c, k, o, W, H));
}

function paintVolcano(c: PwCanvas, k: PwKit, o: D1VolcanoOpts, W: number, H: number) {
  const rng = k.rng;
  const tw = dAz(o.az, o.lightAz) > 0 ? 1 : -1;
  // Palette: basalt hazed by distance (two steps toward the fog at the foot), scree, canopy, lava, smoke.
  const rock = [0.3, 0.5, 0.72, 1].map((m) => k.ramp(mixHex(o.rock, o.haze, m), { light: 0.45, dark: 0.5, sat: 1 }));
  const scree = k.ramp(mixHex(0x9a8a7a, o.haze, 0.35), { light: 0.4, sat: 0.9 });
  const scar = k.ramp(mixHex(0x7a5a52, o.haze, 0.25), { light: 0.4, sat: 1 });
  const can = [0.36, 0.55, 0.75].map((m) => k.ramp(mixHex(o.canopy, o.haze, m), { light: 0.4, dark: 0.55, sat: 1 }));
  const lava = k.ramp(0xff6a20, { light: 0.6, sat: 1.1 });
  const smoke = k.ramp(0xb4aea4, { light: 0.55, dark: 0.5, sat: 0.7 });
  const shadow = k.ramp(0x8a8298, { light: 0.4, dark: 0.55, sat: 0.9, shift: 1.2 });
  const ash = k.ramp(0x5e5858, { light: 0.4, sat: 0.6 });
  const R = c.ramp;
  const T = c.tone;
  const F = c.flag;
  const cx = Math.round(W / 2);
  const hw = o.halfWidth * (TW / 360);
  const peak = Math.round(H * 0.4);
  const craterW = hw * 0.15;
  // Profile: the top row of the mountain per column (cut out above).
  const top = new Float32Array(W).fill(H);
  const coneTop = (dx: number) => {
    const a = Math.abs(dx);
    if (a <= craterW) return peak;
    const u = Math.min(1, (a - craterW) / (hw - craterW));
    return peak + (H - peak) * Math.pow(u, 1.55) * 1.02;
  };
  // Collapsed side: the crater wall away from the sun scooped out (a horseshoe scar).
  const scarSide = -tw;
  const scarW = hw * 0.36;
  const scarDepth = (H - peak) * 0.16;
  // Shoulder vent on the sun side.
  const ventX = cx + tw * hw * 0.42;
  const ventY = peak + (H - peak) * 0.42;
  const ventR = hw * 0.1;
  const steps: [number, number][] = [];
  for (let i = 0; i < 9; i++) steps.push([rng.range(-hw, hw), rng.range(1, 3)]);
  for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx;
    let t = coneTop(dx);
    // Notched rim: a V notch in the crater, a few small steps down the flanks.
    if (Math.abs(dx) <= craterW * 1.1) t += Math.max(0, 3.5 - Math.abs(dx - craterW * 0.3 * tw) * 0.8) + (hash2(x >> 1, 0, 5) > 0.6 ? 1 : 0);
    for (const [sx, sh] of steps) if (Math.sign(dx) === Math.sign(sx) && Math.abs(dx) > Math.abs(sx)) t += sh * 0.35;
    // The scar lowers the rim on its side.
    const sd = dx * scarSide;
    if (sd > craterW * 0.2 && sd < scarW) t += Math.sin(((sd - craterW * 0.2) / (scarW - craterW * 0.2)) * Math.PI) * scarDepth;
    // Vent cone.
    const vd = Math.abs(x + 0.5 - ventX);
    if (vd < ventR) t = Math.min(t, ventY - (1 - vd / ventR) * ventR * 0.7);
    t += (smooth(x, 0, W, 8, 24, 11) - 0.5) * 2.5;
    top[x] = t;
  }
  // Ribs: an angular coordinate per texel (−1…1 across the cone), ribs as a wobbling sine over it.
  const ribN = 11;
  // The ribs' wander, tabled over (u bucket, row) once (no noise call per texel).
  const wand = new Float32Array(129 * H);
  for (let y = 0; y < H; y++) {
    // 17 samples a row (the noise is smooth at this scale), linear between them.
    for (let q = 0; q <= 16; q++) wand[y * 129 + q * 8] = (smooth(q * 3 + 40, y, 128, H, 16, 22) - 0.5) * 2.2;
    for (let ub = 0; ub < 128; ub++) {
      if (ub % 8 === 0) continue;
      const q0 = ub & ~7;
      wand[y * 129 + ub] = wand[y * 129 + q0] + (wand[y * 129 + q0 + 8] - wand[y * 129 + q0]) * ((ub - q0) / 8);
    }
  }
  // hash2 of the rib bucket (round(u · 6)), cached: few distinct values.
  const uHash = new Float64Array(512).fill(NaN);
  for (let y = 0; y < H; y++) {
    const ty = (y - peak) / (H - peak);
    const half = Math.max(1, craterW + (hw - craterW) * Math.pow(Math.max(0, ty), 1 / 1.55));
    const wob = (smooth(0, y, 8, H, 6, 21) - 0.5) * 0.6;
    // Haze steps at the foot (edges follow treetop bumps per column).
    for (let x = 0; x < W; x++) {
      if (y < top[x]) continue;
      const dx = x + 0.5 - cx;
      const u = dx / half;
      const ub = Math.max(0, Math.min(128, Math.round((u + 1) * 64)));
      const ui = Math.round(u * 6);
      const uix = ui + 256;
      let uh = uix >= 0 && uix < 512 ? uHash[uix] : NaN;
      if (uh !== uh) {
        uh = hash2(ui, 0, 3);
        if (uix >= 0 && uix < 512) uHash[uix] = uh;
      }
      const ph = (u + wob * Math.max(0, ty)) * ribN * Math.PI * 0.5 + uh + wand[y * 129 + ub];
      const s = Math.sin(ph);
      const ds = Math.cos(ph) * Math.sign(dx || 1);
      // Overall flank: sun side a step up.
      let t = dx * tw > 0 ? 3 : 2.2;
      // Rib facing: the slope of the rib toward the sun lit, the other side shaded; the gully floor darkest.
      if (ty > 0.04) {
        if (s > 0.5) t += ds * tw > 0 ? 1 : -0.4;
        else if (s < -0.75) t -= 1;
      }
      const i = y * W + x;
      R[i] = rock[0];
      T[i] = t;
      F[i] = 0;
      // Scree fans: below some gullies (lower flanks), paler, widening downward to a ragged toe.
      if (ty <= 0.42) continue;
      const gi = Math.round(((u + wob * Math.max(0, ty)) * ribN) / 2);
      if (!(hash2(gi, 3, 7) > 0.45)) continue;
      const fan0 = 0.42 + hash2(gi, 1, 7) * 0.12;
      const fanLen = 0.12 + hash2(gi, 2, 7) * 0.12;
      if (ty > fan0 && ty < fan0 + fanLen && s < -1 + ((ty - fan0) / fanLen) * 1.1 + 0.25) {
        R[i] = scree;
        T[i] = s < -0.85 ? 3.6 : hash2(x, y >> 1, 8) > 0.7 ? 2.4 : 3;
      }
    }
  }
  // The scar: the collapsed wall's inner face, reddish-brown, darker deep in, lava seams down it.
  for (let y = peak; y < peak + scarDepth * 2.6; y++) {
    for (let x = 0; x < W; x++) {
      if (y < top[x]) continue;
      const sd = (x + 0.5 - cx) * scarSide;
      const inner = scarW * (1 - (y - peak) / (scarDepth * 2.8)) + (hash2(0, y >> 1, 41) - 0.5) * 4 + Math.sin(y * 0.7) * 1.5;
      if (sd < craterW * 0.1 || sd > inner) continue;
      const i = y * W + x;
      R[i] = scar;
      T[i] = sd > inner - 1.5 ? 1.4 : (y - top[x]) < 2 ? 3.6 : hash2(x >> 2, y >> 2, 9) > 0.55 ? 3 : 2.2;
    }
  }
  for (let s = 0; s < 3; s++) {
    let x = cx + scarSide * (craterW * 0.4 + s * scarW * 0.22);
    const len = rng.int(Math.round(scarDepth * 1.2), Math.round(scarDepth * 2.6));
    for (let y = Math.ceil(top[Math.round(x)]) + 1, j = 0; j < len && y < H; y++, j++) {
      const xi = Math.round(x);
      if (xi < 0 || xi >= W) break;
      R[y * W + xi] = lava;
      T[y * W + xi] = j < 6 ? 5 : 4;
      F[y * W + xi] = PWF.GLOW;
      // A dark crust on its shaded side.
      const cxr = xi + tw * -1;
      if (cxr >= 0 && cxr < W && R[y * W + cxr] && !(F[y * W + cxr] & PWF.GLOW)) T[y * W + cxr] = 0.8;
      if (rng.chance(0.35)) x += rng.chance(0.5) ? 1 : -1;
    }
  }
  // Crater lip: a lit edge and a thin glow in the notch.
  for (let x = Math.round(cx - craterW * 1.1); x <= cx + craterW * 1.1; x++) {
    const y = Math.ceil(top[x]);
    R[y * W + x] = rock[0];
    T[y * W + x] = 4.4;
    if (Math.abs(x + 0.5 - cx - craterW * 0.3 * tw) < 3) {
      R[y * W + x] = lava;
      T[y * W + x] = 4.6;
      F[y * W + x] = PWF.GLOW;
    }
  }
  // Jungle creeping up the lower third (higher in the gullies): canopy crowns, lit toward the sun.
  const jStart = (x: number) => peak + (H - peak) * (0.6 - (smooth(x, 0, W, 8, 10, 31) - 0.5) * 0.18);
  for (let n = 0; n < 900; n++) {
    const x = rng.int(0, W - 1);
    const ys = jStart(x) + rng.range(-6, 6);
    const y = rng.range(Math.max(top[x] + 2, ys), H - 1);
    if (y > H - 2) continue;
    const r = rng.range(1.6, 3.6) * (0.7 + ((y - peak) / (H - peak)) * 0.5);
    const lvl = y > H - 6 ? 2 : y > H - 13 ? 1 : 0;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r * 0.5); dy++) {
      const yy = Math.round(y + dy);
      const span = dy < 0 ? Math.sqrt(Math.max(0, r * r - dy * dy)) : r;
      for (let ddx = -Math.floor(span); ddx <= Math.floor(span); ddx++) {
        const xx = x + ddx;
        if (xx < 0 || xx >= W || yy < top[xx] + 1 || yy >= H) continue;
        const sh = (ddx / r) * tw * 0.6 - (dy / r) * 0.7;
        R[yy * W + xx] = can[lvl];
        T[yy * W + xx] = sh > 0.5 ? 4 : sh > 0 ? 3 : sh > -0.45 ? 2 : 1.4;
        F[yy * W + xx] = 0;
      }
    }
  }
  // Foot haze in steps whose edges follow canopy bumps; the last rows are the fog colour.
  for (let x = 0; x < W; x++) {
    const bump = Math.abs(Math.sin((x * Math.PI) / (5 + (x % 3)))) * 2;
    for (let y = H - 16; y < H; y++) {
      const i = y * W + x;
      if (!R[i]) continue;
      const d = y + bump;
      if (d > H - 3) {
        R[i] = rock[3];
        T[i] = 3;
      } else if (d > H - 8) {
        R[i] = rock[2];
        T[i] = 3 + (T[i] - 3) * 0.4;
      } else if (d > H - 14 && R[i] === rock[0]) R[i] = rock[1];
    }
  }
  // Plume: billowing puffs up from the crater, leaning with the wind and spreading.
  const puffs: [number, number, number, number][] = [];
  const lean = -tw;
  let px = cx + craterW * 0.2 * tw;
  let py = peak - 2;
  for (let i = 0; i < 30; i++) {
    const f = i / 29;
    const r = 4 + f * 16 + rng.range(-1.5, 2);
    py -= r * 0.42 + 1;
    px += lean * (0.6 + f * 3.2) + rng.range(-1.5, 1.5);
    if (py - r < -4) break;
    puffs.push([px + rng.range(-r * 0.4, r * 0.4), py, r, f]);
    if (f > 0.35 && rng.chance(0.7)) puffs.push([px + rng.range(-r, r) * 0.9, py + rng.range(-r, r) * 0.3, r * rng.range(0.5, 0.8), f]);
  }
  // The vent's thin thread.
  for (let i = 0; i < 5; i++) puffs.push([ventX + lean * i * 2.2, ventY - ventR * 0.7 - 2 - i * 3.4, 1.4 + i * 0.4, 0.2 + i * 0.05]);
  // Far (high) puffs first, nearer low puffs over them.
  puffs.sort((a, b) => a[1] - b[1]);
  for (const [qx, qy, r, f] of puffs) {
    const cover = f < 0.6 ? 1 : 1 - (f - 0.6) * 1.6;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const y = Math.round(qy + dy);
      if (y < 0 || y >= H) continue;
      for (let dx = -Math.ceil(r * 1.15); dx <= Math.ceil(r * 1.15); dx++) {
        const x = Math.round(qx + dx);
        if (x < 0 || x >= W) continue;
        const nx = dx / (r * 1.15);
        const ny = dy / r;
        const d = nx * nx + ny * ny + (hash2(x >> 1, y >> 1, 17) - 0.5) * 0.25;
        if (d > 1) continue;
        const b = BAYER[(y & 3) * 4 + (x & 3)];
        if (cover < 1 && b > cover * (1.25 - d * 0.6)) continue;
        const l = nx * tw * 0.6 - ny * 0.6 + Math.sqrt(Math.max(0, 1 - d)) * 0.4;
        const i = y * W + x;
        F[i] = 0;
        if (f < 0.18 && l < 0.2) {
          // Ash-dark core low in the column; its underside lit by the crater.
          R[i] = ash;
          T[i] = ny > 0.55 && f < 0.08 ? 4 : l < -0.3 ? 1.6 : 2.6;
          if (ny > 0.6 && f < 0.08) {
            R[i] = lava;
            T[i] = 3.4;
            F[i] = PWF.GLOW;
          }
        } else if (l > 0.55) {
          R[i] = smoke;
          T[i] = 4.6;
        } else if (l > 0.2) {
          R[i] = smoke;
          T[i] = 3.6;
        } else if (l > -0.2) {
          R[i] = shadow;
          T[i] = 3.4;
        } else {
          R[i] = shadow;
          T[i] = 2.4;
        }
      }
    }
  }
}
