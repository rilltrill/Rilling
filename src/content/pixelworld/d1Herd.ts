import type { FloraCanvas, FloraRng } from '../pixel/floraPaint';
import { FF } from '../pixel/floraPaint';
import type { FloraBiome, FloraMats, FloraSpecies } from '../pixel/floraSpecies';
import { D1_BIOME } from '../pixel/floraBiomes';

/**
 * JUNGLE RUN's herbivores for ART: PIXEL WORLD — hand-pixelled side-view
 * sprites with a cycle of frames (the FLORA atlas paints each frame as a
 * variant; the herd plays them on its billboards), facing RIGHT:
 *  - HADRO_RUN: a crested duck-bill at full gallop — banded olive hide, pale
 *    belly, the tube crest sweeping back, the beak, big hind legs pumping
 *    through a four-frame run, little arms tucked, the tail held out stiff;
 *  - SAURO_WALK: a long-neck — the arched neck and small head, a heavy barrel
 *    body, the whip tail, four pillar legs stepping in diagonal pairs.
 */

export const D1_HERD_BIOME: FloraBiome = {
  ...D1_BIOME,
  extra: {
    hadro: { hex: 0x76763a, sat: 1.0, dark: 0.32, light: 0.38 },
    hadroBelly: { hex: 0xb4a272, sat: 0.85, dark: 0.4, light: 0.36 },
    hadroCrest: { hex: 0xb05a2a, sat: 1.0, dark: 0.36, light: 0.4 },
    sauro: { hex: 0x6c6654, sat: 0.95, dark: 0.32, light: 0.36 },
    sauroBelly: { hex: 0x9a9078, sat: 0.8, dark: 0.4, light: 0.34 },
    eye: { hex: 0x1a1410, sat: 0.6, dark: 0.5, light: 0.3 },
  },
};

/** Frames in each cycle. */
export const D1_HERD_FRAMES = 4;

function limb(c: FloraCanvas, pts: number[], w: number[], mat: number, z: number, bias: number) {
  c.stroke(pts, w, mat, { z, bias, amp: 0.9 });
}

/** A three-toed foot / a pillar foot (a short dark slab). */
function foot(c: FloraCanvas, x: number, y: number, len: number, mat: number, z: number) {
  c.poly([x - 1, y, x + len, y, x + len - 1, y + 1.6, x - 0.5, y + 1.8], mat, 0.22, { z });
}

export const HADRO_RUN: FloraSpecies = {
  key: 'hadroRun',
  w: 96,
  h: 56,
  heightM: 3.9,
  variants: D1_HERD_FRAMES,
  paint(c, m, rng, v) {
    paintHadro(c, m, rng, v);
  },
};

function paintHadro(c: FloraCanvas, m: FloraMats, _rng: FloraRng, f: number) {
  const hide = m.extra.hadro;
  const belly = m.extra.hadroBelly;
  const crest = m.extra.hadroCrest;
  const eye = m.extra.eye;
  const ph = (f / D1_HERD_FRAMES) * Math.PI * 2;
  const bob = f % 2 ? 1.5 : 0;
  const by = 30 + bob;
  // Far legs first (darker, behind).
  const hip = { x: 44, y: by - 4 };
  const legPose = (a: number) => {
    // Thigh swings a, shin folds back, foot flat on (or off) the ground.
    const kx = hip.x + Math.sin(a) * 9;
    const ky = hip.y - 10 + Math.max(0, Math.cos(a)) * 1.5;
    const fx = kx - 3 + Math.sin(a) * 6;
    const fy = Math.max(1.5, ky - 12 + Math.max(0, -Math.sin(a + 0.6)) * 5);
    return { kx, ky, fx, fy };
  };
  const far = legPose(ph + Math.PI);
  limb(c, [hip.x, hip.y, far.kx, far.ky, far.fx, far.fy], [6, 3.6, 2.2], hide, -12, -0.22);
  foot(c, far.fx, far.fy - 1.5, 6, hide, -12);
  // Far arm.
  limb(c, [64, by - 2, 66 + Math.sin(ph) * 2, by - 9, 69, by - 12], [2, 1.4, 1], hide, -10, -0.2);
  // Tail: held out stiff behind, a slight wave.
  const tw = Math.sin(ph) * 1.5;
  c.curve(30, by + 2, 16, by + 3 + tw, 1, by - 1 + tw * 1.5, 8, 0.8, hide, { z: -2, bias: 0 });
  // Body: a long barrel, lit back, pale belly band underneath.
  c.ellipse(48, by, 21, 11.5, hide, { z: 0, amp: 0.9 });
  c.poly([30, by - 4, 66, by - 6, 62, by - 10.5, 36, by - 10], belly, (x, y) => (y < by - 8 ? 0.42 : 0.55), { z: 1 });
  // Neck rising to the head.
  c.curve(64, by + 4, 72, by + 12, 78, by + 15, 6.5, 4.5, hide, { z: 2 });
  // Head: skull, the duck bill, the crest sweeping back over the neck.
  c.ellipse(82, by + 15, 7, 4.6, hide, { z: 4 });
  c.poly([86, by + 17, 95, by + 15.5, 95.5, by + 12.5, 86, by + 11.5], hide, 0.55, { z: 5 });
  c.line(87, by + 13.6, 95, by + 13.4, eye, 0.2, 6);
  c.curve(80, by + 18.5, 72, by + 24, 63, by + 23, 2.6, 1.6, crest, { z: 3 });
  c.ellipse(81, by + 16.5, 1.2, 1.2, eye, { z: 7, flag: FF.FLAT, bias: -0.4 });
  // Banding across the back and down the tail.
  for (let i = 0; i < 6; i++) {
    const x = 30 + i * 6.5;
    c.poly([x, by + 11, x + 3, by + 11, x + 1, by + 3, x - 2, by + 3], hide, 0.18, { z: 1.5 });
  }
  for (let i = 0; i < 3; i++) {
    const x = 8 + i * 7;
    c.line(x, by + 4, x + 1, by - 1, hide, 0.15, -1);
  }
  // Near leg (lit) and arm on top.
  const near = legPose(ph);
  limb(c, [hip.x, hip.y + 2, near.kx, near.ky, near.fx, near.fy], [7, 4, 2.4], hide, 8, 0.02);
  foot(c, near.fx, near.fy - 1.5, 7, hide, 8);
  limb(c, [66, by - 1, 68 + Math.sin(ph + Math.PI) * 2, by - 8, 71, by - 11], [2.2, 1.5, 1.1], hide, 9, 0);
}

export const SAURO_WALK: FloraSpecies = {
  key: 'sauroWalk',
  w: 112,
  h: 96,
  heightM: 15,
  variants: D1_HERD_FRAMES,
  paint(c, m, rng, v) {
    paintSauro(c, m, rng, v);
  },
};

function paintSauro(c: FloraCanvas, m: FloraMats, _rng: FloraRng, f: number) {
  const hide = m.extra.sauro;
  const belly = m.extra.sauroBelly;
  const eye = m.extra.eye;
  const ph = (f / D1_HERD_FRAMES) * Math.PI * 2;
  const by = 38;
  // Legs: diagonal pairs (near-front with far-back), a short step each.
  const leg = (x: number, a: number, near: boolean) => {
    const swing = Math.sin(a) * 3.5;
    const lift = Math.max(0, Math.cos(a)) * 1.6;
    const z = near ? 6 : -10;
    const bias = near ? 0 : -0.2;
    limb(c, [x, by - 2, x + swing * 0.5, by - 14, x + swing, 2 + lift], [5.4, 4.6, 4.2], hide, z, bias);
    foot(c, x + swing - 3.5, 1 + lift, 7.5, hide, z);
  };
  leg(36, ph + Math.PI, false);
  leg(62, ph, false);
  // Tail: a long whip trailing back and down.
  c.curve(26, by + 4, 12, by + 2, 1, by - 10, 9, 0.8, hide, { z: -3 });
  // Body.
  c.ellipse(48, by + 2, 25, 15, hide, { z: 0, amp: 0.85 });
  c.poly([28, by - 6, 70, by - 7, 64, by - 12, 34, by - 12], belly, (_x, y) => (y < by - 10 ? 0.4 : 0.52), { z: 1 });
  // Neck: arching up and forward, thick at the shoulder; the small head.
  c.curve(66, by + 8, 84, by + 30, 92, by + 50, 9, 3.2, hide, { z: 2 });
  c.ellipse(96, by + 52, 6, 3.6, hide, { z: 4 });
  c.poly([99, by + 53.5, 104, by + 52, 103.5, by + 49.5, 98, by + 49.5], hide, 0.5, { z: 5 });
  c.ellipse(96.5, by + 53.2, 1, 1, eye, { z: 7, flag: FF.FLAT, bias: -0.4 });
  // Skin folds: a few dark wrinkle arcs on the shoulder and flank, mottling on the back.
  for (let i = 0; i < 4; i++) c.line(60 + i * 2, by + 10 - i, 63 + i * 2, by - 4 - i, hide, 0.2, 1.5);
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 5;
    c.ellipse(x, by + 12 + (i % 2) * 2, 1.6, 1.1, hide, { z: 1.5, bias: -0.22, amp: 0.2 });
  }
  leg(40, ph, true);
  leg(66, ph + Math.PI, true);
}

export const D1_HERD = [HADRO_RUN, SAURO_WALK];
