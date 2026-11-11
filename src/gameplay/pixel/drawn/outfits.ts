import { B, type Draw, type Pt } from './figure';
import { paintHead, type HeadGroups, type HeadSpec } from './head';
import { R } from './palette';
import type { PoseKey, ViewId } from './skeleton';
import { CIVSTAND, ZIDLE } from './poses';
import {
  ARM_F, ARM_L, ARM_Q, ARM_R, ARM_S, ARM_SHADE_F, BOOT_F, BOOT_Q, BOOT_S, HAND_CLAW, HAND_OPEN, LEG_F, LEG_L, LEG_Q, LEG_R, LEG_S, LEG_SHADE_F, NECK_F, PELVIS_F, PELVIS_Q, PELVIS_S, TRUNK_F, TRUNK_MAP, TRUNK_Q, TRUNK_S,
} from './body';

/**
 * DRAWN FIGURES: the costumes. A figure is painted back to front: the far arm, the boots and
 * jeans, the belt, the shirt, whatever is worn over it, the head, the near arm and the hands. Clothes
 * are shapes (a vest with armholes and a torn hem, a shirt with a collar), interior detail is
 * designed strokes, and a shadow shape goes down the side away from the light.
 * Round one: a construction-worker zombie and a civilian in a flannel shirt.
 */

export interface FigureDef {
  /** Small number for the frame cache's keys. */
  id: number;
  /** The pose its visual centres are measured in (aim alignment). */
  rest: PoseKey;
  name: string;
  ground?: boolean;
  paint(d: Draw, view: ViewId): void;
}

/** Drawing groups: interior lines run where two meet. */
const G = {
  legNear: 1,
  legFar: 2,
  bootL: 3,
  bootR: 4,
  trunk: 5,
  vest: 6,
  armNear: 7,
  armFar: 8,
  neck: 9,
  head: 10,
  hair: 11,
  hat: 12,
  handN: 13,
  handF: 14,
  belt: 15,
  ear: 16,
  collar: 17,
  sleeveN: 18,
  sleeveF: 19,
} as const;

const HG: HeadGroups = { head: G.head, hair: G.hair, hat: G.hat, ear: G.ear };

const PARTH = 1;
const PARTT = 2;
const PARTL = 3;

const isBack = (v: ViewId) => v === 3 || v === 4;
const isSideish = (v: ViewId) => v === 1 || v === 2 || v === 3;

// ─── Helpers ───────────────────────────────────────────────────────────────

function trunkFill(d: Draw, tbl: readonly Pt[], ramp: number, group: number) {
  d.pen.begin();
  d.pts(tbl, TRUNK_MAP);
  d.pen.fill(ramp, 3, PARTT, group, -1);
}

function limbFill(d: Draw, tbl: readonly Pt[], map: readonly number[], ramp: number, group: number, part: number, tone = 3, line = -2) {
  d.pen.begin();
  d.pts(tbl, map);
  d.pen.fill(ramp, tone, part, group, line);
}

function shape(d: Draw, tbl: readonly Pt[], bone: number, ramp: number, part: number, group: number, tone = 3, line = -2, flip = 1) {
  const pen = d.pen;
  pen.begin();
  for (let i = 0; i < tbl.length; i++) {
    const p = tbl[i];
    d.pt(bone, p[1], p[2] * flip, p[3] === 1);
  }
  pen.fill(ramp, tone, part, group, line);
}

function strokeB(d: Draw, bone: number, g: number, delta: number, p: readonly number[], ramp = -1, tone = 3) {
  const pen = d.pen;
  pen.begin();
  for (let i = 0; i < p.length; i += 2) d.pt(bone, p[i], p[i + 1]);
  pen.stroke(g, delta, ramp, tone);
}

function dotB(d: Draw, bone: number, g: number, a: number, n: number, ramp: number, tone: number) {
  d.pen.plot(Math.floor(d.px(bone, a, n)), Math.floor(d.py(bone, a, n)), g, 0, ramp, tone);
}

function polyB(d: Draw, bone: number, p: readonly number[], corner = false) {
  d.pen.begin();
  for (let i = 0; i < p.length; i += 2) d.pt(bone, p[i], p[i + 1], corner);
}

// ─── Boots and jeans ───────────────────────────────────────────────────────

function boots(d: Draw, ramp: number, view: ViewId) {
  const tbl = view === 2 ? BOOT_S : view === 1 || view === 3 ? BOOT_Q : BOOT_F;
  const pen = d.pen;
  for (let s = 0; s < 2; s++) {
    const shin = s === 0 ? B.shL : B.shR;
    const ax = d.ox[shin] + d.ax[shin] * d.A[shin];
    const ay = d.oy[shin] + d.ay[shin] * d.A[shin];
    // Which way this boot's toe points on the screen: out, in front and back views; toward the
    // facing direction otherwise.
    const flip = view === 0 ? (s === 0 ? 1 : -1) : view === 4 ? (s === 0 ? -1 : 1) : 1;
    const bx = (n: number) => d.cx + (ax + n * flip) * d.S;
    const by = (a: number) => d.cy - (ay + a) * d.S;
    const group = s === 0 ? G.bootL : G.bootR;
    pen.begin();
    for (let i = 0; i < tbl.length; i++) {
      const p = tbl[i];
      pen.add(bx(p[2]), by(p[1]), p[3] === 1);
    }
    pen.fill(ramp, 3, PARTL, group, -1);
    if (d.lod >= 1) {
      // The sole, a dark band; the toe cap, a lit shape.
      pen.begin();
      pen.add(bx(-1), by(-0.17));
      pen.add(bx(1.2), by(-0.17));
      pen.add(bx(1.2), by(-0.5));
      pen.add(bx(-1), by(-0.5));
      pen.shade(group, 0, ramp, 1);
      const t = view === 2 ? 0.46 : view === 1 || view === 3 ? 0.34 : 0.0;
      pen.begin();
      pen.add(bx(t - 0.12), by(-0.04));
      pen.add(bx(t + 0.12), by(-0.04));
      pen.add(bx(t + 0.17), by(-0.13));
      pen.add(bx(t - 0.13), by(-0.14));
      pen.shade(group, 1);
    }
    if (d.lod >= 2 && !isBack(view)) {
      // Laces.
      for (let i = 0; i < 3; i++) {
        const a = 0.1 - i * 0.09;
        const n = (view as number) === 2 ? 0.12 : view === 1 || (view as number) === 3 ? 0.1 : 0;
        pen.begin();
        pen.add(bx(n - 0.08), by(a));
        pen.add(bx(n + 0.08), by(a + 0.03));
        pen.stroke(group, 0, R.bone, 4);
      }
    }
  }
}

function jeans(d: Draw, ramp: number, view: ViewId) {
  const pen = d.pen;
  const tbl = view === 2 ? LEG_S : view === 1 || view === 3 ? LEG_Q : LEG_F;
  const ptbl = view === 2 ? PELVIS_S : view === 1 || view === 3 ? PELVIS_Q : PELVIS_F;
  const farGroup = view === 0 || view === 4 ? G.legNear : G.legFar;
  // Far leg first (views 1–3 its L; front and back views have no near / far).
  limbFill(d, tbl, LEG_L, ramp, farGroup, PARTL, 3, -1);
  limbFill(d, tbl, LEG_R, ramp, G.legNear, PARTL, 3, -1);
  // Pelvis in the near leg's group: no line where the thigh meets the seat.
  pen.begin();
  d.pts(ptbl, [B.pelvis]);
  pen.fill(ramp, 3, PARTT, G.legNear, -1);
  // Shadow shape down the away side of each leg, wide at the crotch.
  d.wedge(LEG_SHADE_F, LEG_L, farGroup);
  d.wedge(LEG_SHADE_F, LEG_R, G.legNear);
  if (d.lod >= 1) {
    // Crotch and knees.
    strokeB(d, B.pelvis, G.legNear, -2, view === 2 ? [-0.3, 0.3, -0.34, 0.05, -0.34, -0.2] : [-0.34, 0.2, -0.32, 0.0, -0.34, -0.2]);
    for (let s = 0; s < 2; s++) {
      const th = s === 0 ? B.thL : B.thR;
      const sh = s === 0 ? B.shL : B.shR;
      const g = s === 0 ? farGroup : G.legNear;
      const k = d.away(th) * 0.5 + 0.5; // which side the crease leans
      void k;
      strokeB(d, th, g, -1, [0.96, -0.13, 0.9, 0.0, 0.97, 0.15]);
      strokeB(d, sh, g, -1, [0.12, 0.12, 0.08, 0.0, 0.14, -0.11]);
      if (d.lod >= 2) {
        // Pull lines above the knee.
        strokeB(d, th, g, -1, [0.76, 0.08, 0.7, 0.2]);
      }
    }
  }
  if (d.lod >= 2 && !isSideish(view)) {
    if (view === 0) {
      // Fly.
      strokeB(d, B.pelvis, G.legNear, -1, [0.3, 0.03, -0.3, 0.02]);
      // Pockets.
      strokeB(d, B.pelvis, G.legNear, -1, [0.24, 0.46, 0.02, 0.5]);
      strokeB(d, B.pelvis, G.legNear, -1, [0.24, -0.46, 0.02, -0.5]);
    } else {
      // Back: seat seam and back pockets.
      strokeB(d, B.pelvis, G.legNear, -2, [0.34, 0.02, -0.36, 0.0]);
      strokeB(d, B.pelvis, G.legNear, -1, [0.1, 0.16, -0.12, 0.2, -0.12, 0.44, 0.1, 0.48, 0.1, 0.16]);
      strokeB(d, B.pelvis, G.legNear, -1, [0.1, -0.16, -0.12, -0.2, -0.12, -0.44, 0.1, -0.48, 0.1, -0.16]);
    }
  }
}

function belt(d: Draw, ramp: number, view: ViewId, buckle: boolean) {
  const pen = d.pen;
  const w = view === 0 || view === 4 ? 0.56 : view === 2 ? 0.4 : 0.52;
  polyB(d, B.pelvis, [0.48, -w, 0.48, w, 0.34, w, 0.34, -w], true);
  pen.shade(G.legNear, 0, ramp, 3);
  if (buckle && d.lod >= 1 && view === 0) {
    polyB(d, B.pelvis, [0.46, -0.08, 0.46, 0.08, 0.32, 0.08, 0.32, -0.08], true);
    pen.shade(G.legNear, 0, R.bone, 4);
  }
}

// ─── Shirts ────────────────────────────────────────────────────────────────

/** A shadow shape down the away side of the trunk, entering diagonally from under the far arm. */
function trunkShade(d: Draw, group: number, view: ViewId) {
  const pen = d.pen;
  pen.begin();
  if (view === 0 || view === 4) {
    d.pt(B.chest, 0.4, 0.34);
    d.pt(B.chest, -0.2, 0.38);
    d.pt(B.chest, -0.5, 0.25);
    d.pt(B.waist, -0.02, 0.16);
    d.pt(B.pelvis, 0.3, 0.22);
    d.pt(B.pelvis, -0.3, 0.22, true);
    d.pt(B.pelvis, -0.3, 0.9, true);
    d.pt(B.chest, 0.6, 0.9, true);
  } else if (view === 2) {
    d.pt(B.chest, 0.5, 0.14);
    d.pt(B.chest, -0.1, 0.16);
    d.pt(B.waist, 0.0, 0.12);
    d.pt(B.pelvis, 0.3, 0.14);
    d.pt(B.pelvis, -0.3, 0.14, true);
    d.pt(B.pelvis, -0.3, 0.9, true);
    d.pt(B.chest, 0.6, 0.9, true);
  } else {
    d.pt(B.chest, 0.5, 0.18);
    d.pt(B.chest, -0.1, 0.2);
    d.pt(B.waist, 0.0, 0.18);
    d.pt(B.pelvis, 0.3, 0.2);
    d.pt(B.pelvis, -0.3, 0.2, true);
    d.pt(B.pelvis, -0.3, 0.9, true);
    d.pt(B.chest, 0.6, 0.9, true);
  }
  pen.shade(group, -1);
}

/** Folds that make a shirt hang on a body: under the arms, a sag across the belly. */
function trunkFolds(d: Draw, group: number, view: ViewId) {
  if (d.lod < 1) return;
  const side = view === 2 ? -0.1 : 0;
  strokeB(d, B.chest, group, -1, [-0.42, 0.42 + side, -0.32, 0.56 + side]);
  strokeB(d, B.chest, group, -1, [-0.4, -0.42 + side, -0.3, -0.56 + side]);
  if (d.lod >= 2) {
    strokeB(d, B.waist, group, -1, [0.1, -0.3, 0.02, -0.08, 0.06, 0.22]);
    strokeB(d, B.chest, group, -1, [-0.24, -0.26, -0.3, -0.04, -0.26, 0.2]);
  }
}

/** A shirt collar lying on the neck (corners, in the shirt's own colour). */
function collar(d: Draw, view: ViewId, ramp: number, under: number) {
  const pen = d.pen;
  const c = (s: number) => {
    pen.begin();
    d.pt(B.neck, 0.0, s * 0.27, true);
    d.pt(B.neck, -0.06, s * 0.45, true);
    d.pt(B.neck, -0.2, s * 0.2, true);
    d.pt(B.neck, -0.08, s * 0.02, true);
    pen.fill(ramp, 3, PARTT, G.collar, -1);
  };
  if (view === 0) {
    c(1);
    c(-1);
  } else if (view === 1) c(0.7);
  void under;
}

// ─── Arms ──────────────────────────────────────────────────────────────────

/** Shows a limb as sleeve of `ramp` to the point `tRoll` on its second bone (rolled up: forearm skin below). */
function sleeve(d: Draw, tbl: readonly Pt[], map: readonly number[], ramp: number, group: number, skin: number, tRoll: number) {
  const pen = d.pen;
  // Whole arm in skin first (when rolled), then the sleeve shape cut at the roll.
  if (tRoll < 1) limbFill(d, tbl, map, skin, group, PARTL, 3, -2);
  pen.begin();
  for (let i = 0; i < tbl.length; i++) {
    const p = tbl[i];
    if (p[0] === 1 && p[1] > tRoll) continue;
    d.pt(map[p[0]], p[1], p[2], p[3] === 1);
  }
  if (tRoll < 1) {
    d.pt(map[1], tRoll, 0.3, true);
    d.pt(map[1], tRoll, -0.3, true);
  }
  pen.fill(ramp, 3, PARTL, group, -2);
  d.wedge(ARM_SHADE_F, map, group);
}

/** A stump of a limb: the torn end of the sleeve, meat and a knob of bone (level 1: at the elbow; 2: at the shoulder). */
function stump(d: Draw, tbl: readonly Pt[], map: readonly number[], ramp: number, group: number, level: number) {
  const pen = d.pen;
  pen.begin();
  if (level === 1) {
    for (let i = 0; i < tbl.length; i++) {
      const p = tbl[i];
      if (p[0] === 1) continue;
      d.pt(map[p[0]], p[1], p[2], p[3] === 1);
    }
    d.pt(map[0], 1.04, 0.14, true);
    d.pt(map[0], 1.1, 0.02, true);
    d.pt(map[0], 1.04, -0.12, true);
  } else {
    for (let i = 0; i < tbl.length; i++) {
      const p = tbl[i];
      if (p[0] === 1 || p[1] > 0.3) continue;
      d.pt(map[0], p[1], p[2], p[3] === 1);
    }
    d.pt(map[0], 0.42, 0.16, true);
    d.pt(map[0], 0.48, 0.0, true);
    d.pt(map[0], 0.42, -0.14, true);
  }
  pen.fill(ramp, 3, PARTL, group, -2);
  d.wedge(ARM_SHADE_F, map, group);
  // The wet end: meat, a dark rim, the knob of bone.
  const t = level === 1 ? 0.97 : 0.36;
  polyB(d, map[0], [t, 0.16, t + 0.16, 0.12, t + 0.2, -0.02, t + 0.15, -0.14, t, -0.16]);
  pen.fill(R.blood, 2, PARTL, group, 0);
  polyB(d, map[0], [t + 0.04, 0.06, t + 0.14, 0.03, t + 0.13, -0.05, t + 0.05, -0.05]);
  pen.shade(group, 0, R.bone, 3);
}

function hand(d: Draw, tbl: readonly Pt[], bone: number, ramp: number, group: number, narrow: number) {
  const pen = d.pen;
  pen.begin();
  for (let i = 0; i < tbl.length; i++) {
    const p = tbl[i];
    d.pt(bone, p[1], p[2] * narrow, p[3] === 1);
  }
  pen.fill(ramp, 3, PARTL, group, -1);
  if (d.lod >= 2) {
    // Knuckles: the bones of the hand.
    pen.begin();
    d.pt(bone, 0.5, 0.15 * narrow);
    d.pt(bone, 0.56, 0.02 * narrow);
    d.pt(bone, 0.5, -0.12 * narrow);
    pen.stroke(group, -1);
  }
}

// ─── The worker ────────────────────────────────────────────────────────────

function hiVisVest(d: Draw, view: ViewId) {
  const pen = d.pen;
  pen.begin();
  if (view === 0) {
    // Over the chest; nipped at the waist, a short flare, a torn hem; the neck opening a deep V.
    d.pt(B.chest, 0.47, 0.17, true);
    d.pt(B.chest, 0.38, 0.5);
    d.pt(B.chest, 0.06, 0.5);
    d.pt(B.chest, -0.28, 0.56);
    d.pt(B.waist, 0.0, 0.46);
    d.pt(B.pelvis, 0.3, 0.5);
    d.pt(B.pelvis, 0.12, 0.57, true);
    d.pt(B.pelvis, 0.05, 0.46, true);
    d.pt(B.pelvis, 0.12, 0.34, true);
    d.pt(B.pelvis, 0.03, 0.2, true);
    d.pt(B.pelvis, 0.1, 0.03, true);
    d.pt(B.pelvis, 0.02, -0.12, true);
    d.pt(B.pelvis, 0.11, -0.28, true);
    d.pt(B.pelvis, 0.04, -0.4, true);
    d.pt(B.pelvis, 0.12, -0.57, true);
    d.pt(B.pelvis, 0.3, -0.5);
    d.pt(B.waist, 0.0, -0.46);
    d.pt(B.chest, -0.28, -0.56);
    d.pt(B.chest, 0.06, -0.5);
    d.pt(B.chest, 0.38, -0.5);
    d.pt(B.chest, 0.47, -0.17, true);
    d.pt(B.chest, -0.02, 0.0, true);
  } else if (view === 4) {
    // From behind: a closed back panel.
    d.pt(B.chest, 0.47, 0.17, true);
    d.pt(B.chest, 0.4, 0.5);
    d.pt(B.chest, 0.06, 0.5);
    d.pt(B.chest, -0.28, 0.56);
    d.pt(B.waist, 0.0, 0.46);
    d.pt(B.pelvis, 0.3, 0.5);
    d.pt(B.pelvis, 0.1, 0.57, true);
    d.pt(B.pelvis, 0.04, 0.32, true);
    d.pt(B.pelvis, 0.12, 0.1, true);
    d.pt(B.pelvis, 0.03, -0.14, true);
    d.pt(B.pelvis, 0.1, -0.34, true);
    d.pt(B.pelvis, 0.1, -0.57, true);
    d.pt(B.pelvis, 0.3, -0.5);
    d.pt(B.waist, 0.0, -0.46);
    d.pt(B.chest, -0.28, -0.56);
    d.pt(B.chest, 0.06, -0.5);
    d.pt(B.chest, 0.4, -0.5);
    d.pt(B.chest, 0.47, -0.17, true);
    d.pt(B.chest, 0.3, 0.0);
  } else if (view === 2) {
    d.pt(B.chest, 0.47, 0.25, true);
    d.pt(B.chest, 0.2, 0.42);
    d.pt(B.chest, -0.3, 0.4);
    d.pt(B.waist, 0.0, 0.34);
    d.pt(B.pelvis, 0.28, 0.36);
    d.pt(B.pelvis, 0.1, 0.38, true);
    d.pt(B.pelvis, 0.03, 0.14, true);
    d.pt(B.pelvis, 0.1, -0.1, true);
    d.pt(B.pelvis, 0.04, -0.3, true);
    d.pt(B.pelvis, 0.12, -0.46, true);
    d.pt(B.pelvis, 0.3, -0.42);
    d.pt(B.waist, 0.0, -0.36);
    d.pt(B.chest, -0.3, -0.46);
    d.pt(B.chest, 0.18, -0.48);
    d.pt(B.chest, 0.47, -0.32, true);
  } else {
    d.pt(B.chest, 0.47, 0.22, true);
    d.pt(B.chest, 0.34, 0.48);
    d.pt(B.chest, -0.3, 0.46);
    d.pt(B.waist, 0.0, 0.38);
    d.pt(B.pelvis, 0.28, 0.42);
    d.pt(B.pelvis, 0.1, 0.46, true);
    d.pt(B.pelvis, 0.03, 0.2, true);
    d.pt(B.pelvis, 0.11, -0.08, true);
    d.pt(B.pelvis, 0.03, -0.34, true);
    d.pt(B.pelvis, 0.12, -0.57, true);
    d.pt(B.pelvis, 0.3, -0.54);
    d.pt(B.waist, 0.0, -0.5);
    d.pt(B.chest, -0.3, -0.56);
    d.pt(B.chest, 0.3, -0.56);
    d.pt(B.chest, 0.47, -0.14, true);
    if (view === 1) d.pt(B.chest, 0.1, 0.14, true);
  }
  pen.fill(R.hivis, 3, PARTT, G.vest, -2);
  // The away-side shadow.
  pen.begin();
  d.pt(B.chest, 0.5, 0.22);
  d.pt(B.chest, -0.1, 0.24);
  d.pt(B.waist, 0.02, 0.18);
  d.pt(B.pelvis, 0.05, 0.28);
  d.pt(B.pelvis, 0.05, 0.8, true);
  d.pt(B.chest, 0.5, 0.9, true);
  if (isSideish(view)) {
    pen.begin();
    d.pt(B.chest, 0.5, 0.2);
    d.pt(B.waist, 0.0, 0.16);
    d.pt(B.pelvis, 0.05, 0.2);
    d.pt(B.pelvis, 0.05, 0.8, true);
    d.pt(B.chest, 0.5, 0.8, true);
  }
  pen.shade(G.vest, -1);
  if (d.lod >= 1) {
    // Reflective bands round the body.
    const band = (b: number, a0: number, a1: number) => {
      polyB(d, b, [a0, -0.95, a0, 0.95, a1, 0.95, a1, -0.95], true);
      pen.shade(G.vest, 0, R.reflect, 4);
    };
    band(B.chest, -0.27, -0.4);
    band(B.pelvis, 0.28, 0.15);
    if (view === 4 || view === 3) {
      // Vertical straps on the back.
      polyB(d, B.chest, [0.5, 0.26, 0.5, 0.42, -0.5, 0.42, -0.5, 0.26], true);
      pen.shade(G.vest, 0, R.reflect, 3);
      polyB(d, B.chest, [0.5, -0.26, 0.5, -0.42, -0.5, -0.42, -0.5, -0.26], true);
      pen.shade(G.vest, 0, R.reflect, 3);
    }
    if (view === 0 || view === 1) {
      // The zip down the front, a pocket, a badge.
      const zn = view === 0 ? 0 : 0.14;
      strokeB(d, B.chest, G.vest, -2, [0.42, zn, -0.52, zn]);
      strokeB(d, B.waist, G.vest, -2, [0.45, zn, -0.28, zn]);
      strokeB(d, B.pelvis, G.vest, -2, [0.46, zn, 0.08, zn]);
      if (d.lod >= 2) {
        const pn = view === 0 ? 0.26 : 0.34;
        strokeB(d, B.chest, G.vest, -1, [0.0, pn - 0.18, 0.0, pn + 0.18, -0.2, pn + 0.18, -0.2, pn - 0.18, 0.0, pn - 0.18]);
      }
    }
  }
  if (d.lod >= 2 && view === 0) {
    // Blood soaked through from a wound below the ribs (a drawn shape, not speckle).
    pen.begin();
    d.pt(B.pelvis, 0.46, 0.18);
    d.pt(B.waist, 0.1, 0.16);
    d.pt(B.waist, 0.34, 0.28);
    d.pt(B.waist, 0.2, 0.42);
    d.pt(B.waist, 0.02, 0.38);
    d.pt(B.pelvis, 0.4, 0.42);
    d.pt(B.pelvis, 0.28, 0.5);
    d.pt(B.pelvis, 0.3, 0.3);
    pen.shade(G.vest, 0, R.blood, 2);
  }
}

const WORK_HEAD: HeadSpec = { skin: R.skinDead, dead: true, hair: R.hairDark, hat: R.hat, jaw: 0.6 };

/** Draws an arm honouring the damage flags. */
function workerArm(d: Draw, tbl: readonly Pt[], map: readonly number[], group: number, level: number, handTbl: readonly Pt[], handBone: number, hgroup: number, narrow: number) {
  if (level === 0) {
    sleeve(d, tbl, map, R.shirtGrey, group, R.shirtGrey, 1);
    hand(d, handTbl, handBone, R.skinDead, hgroup, narrow);
  } else stump(d, tbl, map, R.shirtGrey, group, level);
}

/** A neck stump for a headless figure. */
function neckStump(d: Draw) {
  const pen = d.pen;
  polyB(d, B.neck, [-0.05, 0.3, 0.3, 0.26, 0.4, 0.1, 0.36, -0.14, 0.2, -0.28, -0.05, -0.3]);
  pen.fill(R.blood, 2, PARTT, G.neck, 0);
  polyB(d, B.neck, [0.1, 0.08, 0.28, 0.06, 0.3, -0.06, 0.12, -0.06]);
  pen.shade(G.neck, 0, R.bone, 3);
}

export const WORKER: FigureDef = {
  id: 0,
  rest: ZIDLE[0],
  name: 'worker',
  paint(d, view) {
    const shirt = R.shirtGrey;
    const armTbl = view === 2 ? ARM_S : view === 1 || view === 3 ? ARM_Q : ARM_F;
    const trunkTbl = view === 2 ? TRUNK_S : view === 1 || view === 3 ? TRUNK_Q : TRUNK_F;
    const lvlL = d.flags & 3;
    const lvlR = (d.flags >> 2) & 3;
    const headless = (d.flags & 16) !== 0;
    if (isSideish(view)) workerArm(d, armTbl, ARM_L, G.armFar, lvlL, HAND_CLAW, B.haL, G.handF, view === 2 ? 0.7 : 0.85);
    boots(d, R.boot, view);
    jeans(d, R.denim, view);
    belt(d, R.belt, view, true);
    trunkFill(d, trunkTbl, shirt, G.trunk);
    trunkShade(d, G.trunk, view);
    trunkFolds(d, G.trunk, view);
    shape(d, NECK_F, B.neck, R.skinDead, PARTH, G.neck, 2, 0);
    hiVisVest(d, view);
    if (!isBack(view)) collar(d, view, shirt, G.neck);
    if (headless) neckStump(d);
    else paintHead(d, WORK_HEAD, HG, view);
    if (isSideish(view)) {
      workerArm(d, armTbl, ARM_R, G.armNear, lvlR, HAND_CLAW, B.haR, G.handN, view === 2 ? 0.7 : 0.85);
    } else {
      workerArm(d, armTbl, ARM_L, G.armFar, lvlL, HAND_CLAW, B.haL, G.handF, 1);
      workerArm(d, armTbl, ARM_R, G.armNear, lvlR, HAND_CLAW, B.haR, G.handN, 1);
    }
  },
};

// ─── The flannel shirt ─────────────────────────────────────────────────────

/** Buffalo plaid over a garment, glued to its bone: dark bands one way, dark bands the other, darkest where they cross. */
function check(d: Draw, group: number, bone: number, a0: number, a1: number, n0: number, n1: number, cell: number, mode: number) {
  const pen = d.pen;
  const A = d.A[bone];
  const cellA = cell / Math.max(0.2, mode === 0 ? 1 : A);
  // Vertical bands (along the bone).
  let i = 0;
  for (let n = n0; n < n1; n += cell, i++) {
    if (i % 2 !== 0) continue;
    polyB(d, bone, [a0, n, a0, n + cell, a1, n + cell, a1, n], true);
    pen.shade(group, -1);
  }
  // Across: a band, in black where it crosses a vertical band, in the darker red elsewhere.
  let j = 0;
  for (let a = a0; a < a1; a += cellA, j++) {
    if (j % 2 !== 0) continue;
    let q = 0;
    for (let n = n0; n < n1; n += cell, q++) {
      polyB(d, bone, [a, n, a, n + cell, a + cellA, n + cell, a + cellA, n], true);
      if (q % 2 === 0) pen.shade(group, 0, R.flannelDark, 2);
      else pen.shade(group, -1);
    }
  }
}

const FLANNEL_HEAD: HeadSpec = { skin: R.skinLive, dead: false, hair: R.hairDark, hat: -1, jaw: 0.5 };

export const FLANNEL: FigureDef = {
  id: 1,
  rest: CIVSTAND[0],
  name: 'flannel',
  paint(d, view) {
    const shirt = R.flannel;
    const armTbl = view === 2 ? ARM_S : view === 1 || view === 3 ? ARM_Q : ARM_F;
    const trunkTbl = view === 2 ? TRUNK_S : view === 1 || view === 3 ? TRUNK_Q : TRUNK_F;
    const cell = d.lod <= 0 ? 0.3 : 0.19;
    const armCheck = (map: readonly number[], g: number) => {
      if (d.lod < 1) return;
      check(d, g, map[0], 0.0, 1.0, -0.42, 0.42, cell * 0.8, 1);
      check(d, g, map[1], -0.05, 0.3, -0.42, 0.42, cell * 0.8, 1);
    };
    if (isSideish(view)) {
      sleeve(d, armTbl, ARM_L, shirt, G.armFar, R.skinLive, 0.32);
      armCheck(ARM_L, G.armFar);
      d.wedge(ARM_SHADE_F, ARM_L, G.armFar);
      hand(d, HAND_OPEN, B.haL, R.skinLive, G.handF, view === 2 ? 0.75 : 0.9);
    }
    boots(d, R.bootCiv, view);
    jeans(d, R.denimCiv, view);
    belt(d, R.belt, view, true);
    trunkFill(d, trunkTbl, shirt, G.trunk);
    // The check runs over chest and belly, then the shadow shape goes over it.
    check(d, G.trunk, B.chest, -1.1, 0.55, -0.9, 0.9, cell, 0);
    check(d, G.trunk, B.pelvis, -0.16, 0.5, -0.9, 0.9, cell, 0);
    trunkShade(d, G.trunk, view);
    trunkFolds(d, G.trunk, view);
    if (d.lod >= 1 && view === 0) {
      // The button placket.
      strokeB(d, B.chest, G.trunk, 0, [0.42, 0.02, -0.5, 0.02], R.flannelDark, 2);
      strokeB(d, B.waist, G.trunk, 0, [0.5, 0.02, -0.25, 0.02], R.flannelDark, 2);
      strokeB(d, B.pelvis, G.trunk, 0, [0.45, 0.02, 0.0, 0.02], R.flannelDark, 2);
      for (const a of [0.34, 0.02, -0.3]) dotB(d, B.chest, G.trunk, a, 0.02, R.white, 4);
      dotB(d, B.waist, G.trunk, 0.22, 0.02, R.white, 4);
    }
    shape(d, NECK_F, B.neck, R.skinLive, PARTH, G.neck, 2, 0);
    if (view <= 2) {
      // White tee at the open collar.
      polyB(d, B.chest, view === 1 ? [0.5, -0.02, 0.5, 0.26, 0.22, 0.24] : [0.5, -0.18, 0.5, 0.18, 0.22, 0.02], true);
      d.pen.fill(R.white, 3, PARTT, G.collar, -1);
    }
    if (!isBack(view)) collar(d, view, shirt, G.neck);
    paintHead(d, FLANNEL_HEAD, HG, view);
    if (isSideish(view)) {
      sleeve(d, armTbl, ARM_R, shirt, G.armNear, R.skinLive, 0.32);
      armCheck(ARM_R, G.armNear);
      d.wedge(ARM_SHADE_F, ARM_R, G.armNear);
      hand(d, HAND_OPEN, B.haR, R.skinLive, G.handN, view === 2 ? 0.75 : 0.9);
    } else {
      sleeve(d, armTbl, ARM_L, shirt, G.armFar, R.skinLive, 0.32);
      sleeve(d, armTbl, ARM_R, shirt, G.armNear, R.skinLive, 0.32);
      armCheck(ARM_L, G.armFar);
      armCheck(ARM_R, G.armNear);
      d.wedge(ARM_SHADE_F, ARM_L, G.armFar);
      d.wedge(ARM_SHADE_F, ARM_R, G.armNear);
      hand(d, HAND_OPEN, B.haL, R.skinLive, G.handF, 1);
      hand(d, HAND_OPEN, B.haR, R.skinLive, G.handN, 1);
    }
  },
};
