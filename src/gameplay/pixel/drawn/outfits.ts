import { B, band, type Draw, type Pt } from './figure';
import { fallenHat, paintHead, type HeadGroups, type HeadSpec } from './head';
import { R } from './palette';
import { J, type PoseKey, type ViewId } from './skeleton';
import { CIVSTAND, ZIDLE } from './poses';
import {
  ARM_CORE, ARM_F, ARM_L, ARM_Q, ARM_R, ARM_S, ARM_SHADE_F, BOOT_F, BOOT_Q, BOOT_S, DELTOID_LIT, FOREARM_LIT, HAND_CLAW, HAND_FIST, HAND_MITT, HAND_OPEN, HAND_SPLAY, LEG_CORE, LEG_F, LEG_L, LEG_Q, LEG_R, LEG_S, LEG_SHADE_F, NECK_F, PELVIS_F, PELVIS_Q, PELVIS_S, SHOE_F, SHOE_Q, SHOE_S, TRUNK_F, TRUNK_MAP, TRUNK_Q, TRUNK_S,
} from './body';

/**
 * DRAWN FIGURES: the costumes. A figure is painted back to front: the far arm, the boots and
 * jeans, the belt, the shirt, whatever is worn over it, the head, the near arm and the hands. Clothes
 * are shapes (a vest with armholes and a torn hem, a shirt with a collar); forms are clusters of
 * tone: a lit plane, the base, a shadow, a core at the turn, a sliver of reflected light outside it.
 */

export interface FigureDef {
  /** Small number for the frame cache's keys. */
  id: number;
  /** The pose its visual centres are measured in (aim alignment). */
  rest: PoseKey;
  name: string;
  ground?: boolean;
  /** Extra neck (hu): a hanging jaw would otherwise sit on the collar. */
  neck?: number;
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
  /** The seat of the jeans: flows into the thighs without a line. */
  pelvis: 20,
  /** A thigh and shin drawn apart (a shin folded behind the thigh). */
  legNearB: 21,
  legFarB: 22,
  /** A far hat's brim. */
  brim: 23,
} as const;

const HG: HeadGroups = { head: G.head, hair: G.hair, hat: G.hat, ear: G.ear, neck: G.neck, brim: G.brim };

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

/**
 * A fold as a filled shape, not a hairline: a narrow lens from (t0, n0) to (t1, n1) on a bone, `w` hu
 * wide at the belly, `delta` tone steps; lens widths stay `w` hu whatever the bone's length.
 */
function foldShape(d: Draw, bone: number, g: number, t0: number, n0: number, t1: number, n1: number, w: number, delta = -1) {
  const A = Math.max(0.25, d.A[bone]);
  const da = (t1 - t0) * A;
  const dn = n1 - n0;
  const l = Math.max(1e-4, Math.hypot(da, dn));
  const oa = (-dn / l) * w * 0.5;
  const on = (da / l) * w * 0.5;
  const tm = (t0 + t1) / 2;
  const nm = (n0 + n1) / 2;
  const pen = d.pen;
  pen.begin();
  d.pt(bone, t0, n0, true);
  d.pt(bone, tm + oa / A, nm + on);
  d.pt(bone, t1, n1, true);
  d.pt(bone, tm - oa / A, nm - on);
  pen.shade(g, delta);
}

/** Where a limb bends: a bone drawn on its own with a rounded end, for a shin folded behind its thigh. */
function partLimb(d: Draw, tbl: readonly Pt[], map: readonly number[], which: 0 | 1, ramp: number, group: number, part: number, line: number) {
  const pen = d.pen;
  pen.begin();
  // The tables run down the outer side, round the end and back up the inner side: the closing
  // cap goes where the skipped bone would have been.
  let capped = false;
  for (let i = 0; i < tbl.length; i++) {
    const p = tbl[i];
    if (p[0] !== which) {
      if (!capped) {
        capped = true;
        if (which === 0) {
          d.pt(map[0], 1.08, 0.2);
          d.pt(map[0], 1.14, 0.0);
          d.pt(map[0], 1.08, -0.18);
        }
      }
      continue;
    }
    d.pt(map[which], p[1], p[2], p[3] === 1);
  }
  if (which === 1) {
    d.pt(map[1], -0.1, -0.2);
    d.pt(map[1], -0.1, 0.22);
  }
  pen.fill(ramp, 3, part, group, line);
}

// ─── Boots and jeans ───────────────────────────────────────────────────────

/** Shape of the foot and how its material is drawn. */
interface FootStyle {
  /** Foot tables per view group. */
  s: readonly Pt[];
  q: readonly Pt[];
  f: readonly Pt[];
  ramp: number;
  /** Shaft rows over the jeans: the worker's boots lace up the shin. */
  shaft: boolean;
  /** Rubber sole in its own colour (a sneaker). */
  sole: number;
}

const WORK_BOOT: FootStyle = { s: BOOT_S, q: BOOT_Q, f: BOOT_F, ramp: R.boot, shaft: true, sole: -1 };
const SNEAKER: FootStyle = { s: SHOE_S, q: SHOE_Q, f: SHOE_F, ramp: R.sneaker, shaft: false, sole: R.sole };

function foot(d: Draw, side: number, st: FootStyle, view: ViewId) {
  const tbl = view === 2 ? st.s : view === 1 || view === 3 ? st.q : st.f;
  const pen = d.pen;
  const shin = side === 0 ? B.shL : B.shR;
  const ax = d.ox[shin] + d.ax[shin] * d.A[shin];
  const ay = d.oy[shin] + d.ay[shin] * d.A[shin];
  // Which way this foot's toe points on the screen: out, in front and back views; toward the facing direction otherwise.
  const flip = view === 0 ? (side === 0 ? 1 : -1) : view === 4 ? (side === 0 ? -1 : 1) : 1;
  const p = d.sk.footPitch[side] * (view === 2 ? 1 : view === 1 || view === 3 ? 0.7 : 0);
  const c = Math.cos(p);
  const s = Math.sin(p);
  const group = side === 0 ? G.bootL : G.bootR;
  // Along the walk: the near foot is drawn bigger; the far one smaller and shorter, its heel up, only the toe cap to see.
  const near = view === 0 || view === 4 ? d.near[side] : 0;
  const scale = 1 + 0.1 * Math.max(0, near) - 0.08 * Math.max(0, -near);
  const heelUp = 1 - 0.34 * Math.max(0, -near - 0.25);
  const fx = (a: number, n: number) => d.cx + (ax + (n * c + a * s) * flip * scale) * d.S;
  const fy = (a: number, n: number) => d.cy - (ay + (a * c - n * s) * scale * heelUp) * d.S;
  pen.begin();
  for (let i = 0; i < tbl.length; i++) {
    const q = tbl[i];
    pen.add(fx(q[1], q[2]), fy(q[1], q[2]), q[3] === 1);
  }
  pen.fill(st.ramp, 3, PARTL, group, -1);
  const shadeRect = (a0: number, a1: number, n0: number, n1: number) => {
    pen.begin();
    pen.add(fx(a0, n0), fy(a0, n0), true);
    pen.add(fx(a0, n1), fy(a0, n1), true);
    pen.add(fx(a1, n1), fy(a1, n1), true);
    pen.add(fx(a1, n0), fy(a1, n0), true);
  };
  const front = view === 0 || view === 4;
  const toeN = view === 2 ? 0.46 : view === 1 || view === 3 ? 0.36 : 0.0;
  if (d.lod >= 1) {
    // Sole: thick, dark on a boot; on a sneaker its own white rubber.
    shadeRect(-0.22, -0.6, -1.6, 1.6);
    if (st.sole >= 0) pen.shade(group, 0, st.sole, 3);
    else pen.shade(group, 0, st.ramp, 1);
    if (st.sole >= 0 && d.lod >= 2) {
      shadeRect(-0.3, -0.6, -1.6, 1.6);
      pen.shade(group, 0, st.sole, 2);
    }
    // Side shadow, a lit toe cap.
    shadeRect(0.2, -0.22, front ? -0.08 : -0.5, front ? 0.5 : -0.12);
    pen.shade(group, -1);
    const cap = front ? 0.08 : 0.16;
    shadeRect(-0.02, -0.19, toeN - cap - (st.shaft ? 0.06 : 0.02), toeN + cap);
    pen.shade(group, 1);
    if (d.lod >= 2) {
      shadeRect(-0.08, -0.14, toeN - cap * 0.4, toeN + cap * 0.8);
      pen.shade(group, st.shaft ? 2 : 1);
      if (st.shaft) {
        // Scuffs on the cap, stitching along the welt.
        shadeRect(-0.03, -0.09, toeN + cap * 0.4, toeN + cap * 0.72);
        pen.shade(group, 0, st.ramp, 2);
        for (let i = 0; i < 6; i++) pen.plot(Math.floor(fx(-0.2, toeN - cap - 0.14 * (i - 1))), Math.floor(fy(-0.2, toeN - cap - 0.14 * (i - 1))), group, 0, st.ramp, 5);
      }
    }
    if (d.lod >= 2 && !isBack(view)) {
      // Laces up the instep.
      const n0 = (view as number) === 2 ? 0.18 : (view as number) === 1 || (view as number) === 3 ? 0.16 : 0;
      for (let i = 0; i < 3; i++) {
        const a = st.shaft ? 0.12 - i * 0.08 : 0.08 - i * 0.07;
        pen.begin();
        pen.add(fx(a + 0.02, n0 - 0.1), fy(a + 0.02, n0 - 0.1));
        pen.add(fx(a - 0.03, n0 + 0.12), fy(a - 0.03, n0 + 0.12));
        pen.stroke(group, 0, R.bone, 4);
      }
    }
  }
  if (st.shaft) {
    // The shaft climbs the shin to a padded collar, over the jeans tucked into it.
    const ct = 0.54;
    const col = 0.235;
    pen.begin();
    d.pt(shin, ct, col + 0.02, true);
    d.pt(shin, 0.72, 0.21);
    d.pt(shin, 1.02, 0.21);
    d.pt(shin, 1.05, -0.21);
    d.pt(shin, 0.72, -0.21);
    d.pt(shin, ct, -col - 0.02, true);
    pen.fill(st.ramp, 3, PARTL, group, -1);
    if (d.lod >= 1) {
      const a = d.away(shin);
      pen.begin();
      d.pt(shin, ct + 0.1, a * 0.3);
      d.pt(shin, 1.1, a * 0.3);
      d.pt(shin, 1.1, a * 0.02);
      d.pt(shin, ct + 0.1, a * 0.04);
      pen.shade(group, -1);
      pen.begin();
      d.pt(shin, ct + 0.14, -a * 0.2);
      d.pt(shin, 0.94, -a * 0.17);
      d.pt(shin, 0.94, -a * 0.06);
      d.pt(shin, ct + 0.14, -a * 0.07);
      pen.shade(group, 1);
    }
    if (d.lod >= 2) {
      strokeB(d, shin, group, 0, [ct + 0.04, -col, ct + 0.05, col], st.ramp, 5);
      polyB(d, shin, [ct, -col, ct, col, ct + 0.04, col, ct + 0.04, -col], true);
      pen.shade(group, 0, st.ramp, 2);
      // A lace zigzag up the shin.
      if (!isBack(view)) {
        const dn = (view as number) === 2 ? 0.12 : (view as number) === 1 || (view as number) === 3 ? 0.06 : 0;
        for (let i = 0; i < 3; i++) {
          const t = ct + 0.14 + i * 0.1;
          strokeB(d, shin, group, 0, [t, dn - 0.1, t + 0.05, dn + 0.1, t + 0.1, dn - 0.1], R.bone, 4);
        }
      }
    }
  }
}

/** One leg of a pair of jeans: outline, then the forms and folds on it. */
function jeansLeg(d: Draw, side: number, ramp: number, view: ViewId, group: number, breakT: number) {
  const tbl = view === 2 ? LEG_S : view === 1 || view === 3 ? LEG_Q : LEG_F;
  const map = side === 0 ? LEG_L : LEG_R;
  const shinBack = d.shinBack[side] === 1;
  const g2 = group === G.legNear ? G.legNearB : G.legFarB;
  if (!shinBack) {
    // (Along the walk: the near leg is drawn wider than the one going away.)
    const near = view === 0 || view === 4 ? d.near[side] : 0;
    const w = 1 + 0.08 * Math.max(0, near) - 0.05 * Math.max(0, -near);
    d.pen.begin();
    d.pts(tbl, map, w);
    d.pen.fill(ramp, 3, PARTL, group, -1);
    legForm(d, map, group, breakT, near);
  } else if (view === 0) {
    // Going away from the viewer: the shin first, the thigh over it.
    partLimb(d, tbl, map, 1, ramp, group, PARTL, -1);
    legForm(d, map, group, breakT, 0);
    partLimb(d, tbl, map, 0, ramp, g2, PARTL, -1);
    legForm(d, map, g2, breakT, 0);
  } else {
    // From behind, a shin bent back comes toward the viewer: the thigh first.
    partLimb(d, tbl, map, 0, ramp, group, PARTL, -1);
    legForm(d, map, group, breakT, 0);
    partLimb(d, tbl, map, 1, ramp, g2, PARTL, -1);
    legForm(d, map, g2, breakT, 0);
  }
}

/** A hard-edged polygon on the skeleton, as (bone, along, n) triples: a plane, not a soft band. */
function plane(d: Draw, g: number, delta: number, ...p: number[]) {
  const pen = d.pen;
  pen.begin();
  for (let i = 0; i < p.length; i += 3) d.pt(p[i], p[i + 1], p[i + 2], true);
  pen.shade(g, delta);
}

/**
 * Forms on a leg, hard planes like a period sprite: shadow toward the crotch side, a core inside
 * it, then the lit front of the thigh (a hard diagonal at the hip crease), a diamond knee cap and a
 * straight shin. The cloth breaks in one or two shapes where it stacks above the boot (`breakT`).
 */
function legForm(d: Draw, map: readonly number[], g: number, breakT: number, near: number) {
  d.wedge(LEG_SHADE_F, map, g);
  band(d, LEG_CORE, map, g, -2, 1);
  if (d.lod < 1) return;
  const th = map[0];
  const sh = map[1];
  const a = d.away(th);
  // Lit planes sit toward the light; n > 0 is the outer side of the limb.
  const c = -a * 0.06;
  plane(d, g, 1, th, 0.06, c + 0.13, th, 0.2, c - 0.08, th, 0.62, c - 0.05, th, 0.72, c + 0.02, th, 0.5, c + 0.1);
  plane(d, g, 1, th, 0.9, c, th, 0.98, c + 0.09, sh, 0.08, c, th, 0.98, c - 0.09);
  if (near > 0.3) {
    // The knee coming forward: the top of the leg in shadow, the kneecap lit below it.
    plane(d, g, -1, th, 0.66, -0.2, th, 0.66, 0.24, th, 0.82, 0.28, th, 0.84, -0.22);
  }
  plane(d, g, 1, sh, 0.2, c + 0.04, sh, 0.2, c - 0.07, sh, 0.5, c - 0.05, sh, 0.5, c + 0.03);
  if (d.lod < 2) return;
  plane(d, g, 2, th, 0.93, c, th, 0.98, c + 0.05, sh, 0.05, c, th, 0.98, c - 0.05);
  // The outer seam, a shade down the leg.
  strokeB(d, th, g, -1, [0.06, 0.25, 0.5, 0.25, 0.94, 0.22]);
  strokeB(d, sh, g, -1, [0.04, 0.22, 0.5, 0.19, Math.min(0.92, breakT + 0.04), 0.15]);
  // Pull of the cloth: from the hip, behind the knee, and the break above the boot.
  foldShape(d, th, g, 0.04, -a * 0.1, 0.34, a * 0.14, 0.09);
  foldShape(d, th, g, 0.8, a * 0.18, 0.96, -a * 0.1, 0.09);
  foldShape(d, sh, g, breakT - 0.04, a * 0.2, breakT + 0.05, -a * 0.12, 0.11);
  foldShape(d, sh, g, breakT - 0.18, -a * 0.18, breakT - 0.1, a * 0.08, 0.09);
}

/** Boots and jeans together, in depth order, so a stride reads as one leg crossing in front of the other. */
function legs(d: Draw, jeansRamp: number, view: ViewId, foot_: FootStyle) {
  const sk = d.sk;
  const farGroup = G.legFar;
  const front = view === 0 || view === 4;
  // Near, in front and back views: the leg forward (toward the viewer); else the right leg.
  const lForward = sk.z[J.ankleL] > sk.z[J.ankleR];
  const lNear = view === 0 ? lForward : view === 4 ? !lForward : false;
  const order: readonly number[] = lNear ? [1, 0] : [0, 1];
  for (let i = 0; i < 2; i++) {
    const side = order[i];
    const g = front ? (i === 0 ? farGroup : G.legNear) : side === 0 ? G.legFar : G.legNear;
    if ((!foot_.shaft && !d.shinBack[side]) || (d.shinBack[side] && view === 0)) foot(d, side, foot_, view);
    jeansLeg(d, side, jeansRamp, view, g, foot_.shaft ? 0.44 : 0.82);
    if (foot_.shaft && !d.shinBack[side]) foot(d, side, foot_, view);
    if (d.shinBack[side] && view === 4) foot(d, side, foot_, view);
  }
}

/** The seat: its own mass below the waist, with no line where the thighs come out of it. */
function seat(d: Draw, ramp: number, view: ViewId) {
  const pen = d.pen;
  const ptbl = view === 2 ? PELVIS_S : view === 1 || view === 3 ? PELVIS_Q : PELVIS_F;
  pen.begin();
  d.pts(ptbl, [B.pelvis]);
  pen.fill(ramp, 3, PARTT, G.pelvis, 0);
  polyB(d, B.pelvis, [0.42, 0.2, 0.05, 0.3, -0.36, 0.22, -0.36, 0.9, 0.42, 0.9]);
  pen.shade(G.pelvis, -1);
  if (d.lod >= 1) {
    polyB(d, B.pelvis, [0.26, -0.5, 0.24, -0.3, 0.02, -0.28, -0.14, -0.44, -0.02, -0.58]);
    pen.shade(G.pelvis, 1);
    // The fork of the crotch, cloth pulling toward it.
    foldShape(d, B.pelvis, G.pelvis, -0.3, 0.0, 0.16, view === 2 ? -0.1 : 0.04, 0.08, -2);
  }
  if (d.lod >= 2) {
    // The iliac ridge catches the light.
    polyB(d, B.pelvis, [0.02, -0.5, 0.0, -0.36, -0.08, -0.44, -0.1, -0.54], true);
    pen.shade(G.pelvis, 2);
  }
  if (d.lod >= 2 && !isSideish(view)) {
    if (view === 0) {
      // The fly curving over, front pockets curving from the hip toward it.
      strokeB(d, B.pelvis, G.pelvis, 0, [0.3, 0.05, 0.08, 0.1, -0.14, 0.08, -0.28, 0.0], ramp, 1);
      strokeB(d, B.pelvis, G.pelvis, 0, [0.14, 0.54, 0.02, 0.42, -0.06, 0.24, -0.12, 0.12], ramp, 1);
      strokeB(d, B.pelvis, G.pelvis, 0, [0.14, -0.54, 0.02, -0.42, -0.06, -0.24, -0.12, -0.12], ramp, 1);
    } else {
      // Back: seat seam and back pockets.
      strokeB(d, B.pelvis, G.pelvis, -2, [0.34, 0.02, -0.3, 0.0]);
      strokeB(d, B.pelvis, G.pelvis, -1, [0.1, 0.18, -0.12, 0.22, -0.12, 0.5, 0.1, 0.54, 0.1, 0.18]);
      strokeB(d, B.pelvis, G.pelvis, -1, [0.1, -0.18, -0.12, -0.22, -0.12, -0.5, 0.1, -0.54, 0.1, -0.18]);
    }
  }
}

function belt(d: Draw, ramp: number, view: ViewId, buckle: boolean) {
  const pen = d.pen;
  const w = view === 0 || view === 4 ? 0.62 : view === 2 ? 0.42 : 0.56;
  polyB(d, B.pelvis, [0.48, -w, 0.48, w, 0.34, w, 0.34, -w], true);
  pen.shade(G.pelvis, 0, ramp, 3);
  if (buckle && d.lod >= 1 && view === 0) {
    polyB(d, B.pelvis, [0.46, -0.08, 0.46, 0.08, 0.32, 0.08, 0.32, -0.08], true);
    pen.shade(G.pelvis, 0, R.bone, 4);
  }
}

// ─── Shirts ────────────────────────────────────────────────────────────────

/**
 * The form of the trunk under a shirt: a shadow entering diagonally from under the far arm, a core
 * at the turn, the ribcage plane in the light. `relative`: over a printed cloth tones go up and
 * down from what the print left there.
 */
function trunkForm(d: Draw, group: number, view: ViewId, relative: boolean) {
  const pen = d.pen;
  const down = (steps: number) => {
    if (relative) pen.darken(group, steps);
    else pen.shade(group, -steps);
  };
  const front = view === 0 || view === 4;
  const w = front ? 1 : view === 2 ? 0.55 : 0.75;
  pen.begin();
  d.pt(B.chest, 0.4, 0.34 * w);
  d.pt(B.chest, -0.2, 0.38 * w);
  d.pt(B.chest, -0.5, 0.25 * w);
  d.pt(B.waist, -0.02, 0.16 * w);
  d.pt(B.pelvis, 0.3, 0.22 * w);
  d.pt(B.pelvis, -0.3, 0.22 * w, true);
  d.pt(B.pelvis, -0.3, 0.9, true);
  d.pt(B.chest, 0.6, 0.9, true);
  down(1);
  if (d.lod >= 1) {
    // Core at the turn of the ribs.
    pen.begin();
    d.pt(B.chest, 0.3, 0.46 * w);
    d.pt(B.chest, -0.24, 0.48 * w);
    d.pt(B.waist, 0.12, 0.3 * w);
    d.pt(B.waist, -0.12, 0.38 * w);
    d.pt(B.chest, -0.3, 0.6 * w);
    d.pt(B.chest, 0.2, 0.62 * w);
    down(1);
    // The ribcage plane, the bottom of the belly, lit.
    pen.begin();
    d.pt(B.chest, 0.3, -0.26 * w);
    d.pt(B.chest, 0.12, -0.5 * w);
    d.pt(B.chest, -0.36, -0.46 * w);
    d.pt(B.waist, 0.2, -0.26 * w);
    d.pt(B.chest, -0.14, -0.08 * w);
    d.pt(B.chest, 0.22, -0.1 * w);
    down(-1);
  }
}

/** Folds that make a shirt hang on a body: under the arms, a sag across the belly. */
function trunkFolds(d: Draw, group: number, view: ViewId, relative: boolean) {
  if (d.lod < 1) return;
  const pen = d.pen;
  const side = view === 2 ? -0.1 : 0;
  const fold = (b: number, a0: number, n0: number, a1: number, n1: number, w: number, delta: number) => {
    if (relative) {
      const A = Math.max(0.25, d.A[b]);
      const da = (a1 - a0) * A;
      const dn = n1 - n0;
      const l = Math.max(1e-4, Math.hypot(da, dn));
      const oa = (-dn / l) * w * 0.5;
      const on = (da / l) * w * 0.5;
      pen.begin();
      d.pt(b, a0, n0, true);
      d.pt(b, (a0 + a1) / 2 + oa / A, (n0 + n1) / 2 + on);
      d.pt(b, a1, n1, true);
      d.pt(b, (a0 + a1) / 2 - oa / A, (n0 + n1) / 2 - on);
      pen.darken(group, -delta);
    } else foldShape(d, b, group, a0, n0, a1, n1, w, delta);
  };
  fold(B.chest, -0.42, 0.42 + side, -0.3, 0.56 + side, 0.09, -1);
  fold(B.chest, -0.4, -0.42 + side, -0.28, -0.56 + side, 0.09, -1);
  if (d.lod >= 2) {
    fold(B.waist, 0.1, -0.32, 0.04, 0.24, 0.1, -1);
    fold(B.chest, -0.28, -0.3, -0.34, 0.22, 0.1, -1);
    fold(B.pelvis, 0.42, -0.42, 0.28, -0.02, 0.09, -1);
  }
}

/** A shirt collar lying on the collarbones: two clean folded points. */
function collar(d: Draw, view: ViewId, ramp: number) {
  const pen = d.pen;
  const c = (s: number) => {
    pen.begin();
    d.pt(B.chest, 0.52, s * 0.08, true);
    d.pt(B.chest, 0.5, s * 0.36, true);
    d.pt(B.chest, 0.3, s * 0.42, true);
    d.pt(B.chest, 0.18, s * 0.2, true);
    pen.fill(ramp, 3, PARTT, G.collar, -2);
    if (d.lod >= 2) {
      pen.begin();
      d.pt(B.chest, 0.28, s * 0.4, true);
      d.pt(B.chest, 0.2, s * 0.22, true);
      d.pt(B.chest, 0.28, s * 0.2, true);
      pen.shade(G.collar, -1);
    }
  };
  if (view === 0) {
    c(1);
    c(-1);
  } else if (view === 1) c(0.8);
}

// ─── Arms ──────────────────────────────────────────────────────────────────

/** Shadow, core, lit planes on an arm. */
function armForm(d: Draw, map: readonly number[], group: number) {
  d.wedge(ARM_SHADE_F, map, group);
  band(d, ARM_CORE, map, group, -2, 1);
  if (d.lod >= 1) {
    band(d, DELTOID_LIT, map, group, 1, -1);
    band(d, FOREARM_LIT, map, group, 1, -1);
  }
}

/** Shows a limb as sleeve of `ramp` to the point `tRoll` on its second bone (rolled up: forearm skin below). `tone` and `form` leave a printed cloth to its own painter. */
function sleeve(d: Draw, tbl: readonly Pt[], map: readonly number[], ramp: number, group: number, skin: number, tRoll: number, tone = 3, form = true) {
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
    // Cut square across the forearm: the roll is a band, not a bell.
    d.pt(map[1], tRoll, 0.24, true);
    d.pt(map[1], tRoll, -0.24, true);
  }
  pen.fill(ramp, tone, PARTL, group, -2);
  if (form) armForm(d, map, group);
  if (d.lod >= 2 && form) {
    // Cloth bunches at the inner elbow; a seam from the shoulder.
    foldShape(d, map[0], group, 0.8, -0.14, 0.96, 0.08, 0.07);
    foldShape(d, map[1], group, 0.04, -0.14, 0.16, 0.08, 0.07);
  }
}

/**
 * A rolled cuff: one band a tone lighter than the shirt, straight edges, a texel wider than the
 * forearm; drawn after the print so the check does not run across it.
 */
function rolledCuff(d: Draw, map: readonly number[], g: number, ramp: number, tRoll: number) {
  const fore = map[1];
  const w = 0.25;
  const t0 = tRoll - 6.5 / (d.S * Math.max(0.2, d.A[fore]));
  const pen = d.pen;
  pen.begin();
  d.pt(fore, t0, -w, true);
  d.pt(fore, t0, w, true);
  d.pt(fore, tRoll, w + 0.035, true);
  d.pt(fore, tRoll, -w - 0.035, true);
  pen.fill(ramp, 4, PARTL, g, -2);
  if (d.lod >= 2) {
    const a = d.away(fore);
    polyB(d, fore, [t0 + 0.01, a * w, tRoll - 0.01, a * (w + 0.03), tRoll - 0.01, a * 0.05, t0 + 0.01, a * 0.04], true);
    pen.shade(g, -1);
    strokeB(d, fore, g, -1, [t0 + (tRoll - t0) * 0.5, -w, t0 + (tRoll - t0) * 0.5, w]);
  }
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
  if (tbl === HAND_OPEN && d.S >= 16) {
    // The fingers are parted by interior lines from the tip notches to the knuckles.
    const line = (t0: number, n0: number, t1: number, n1: number) => {
      pen.begin();
      d.pt(bone, t0, n0 * narrow);
      d.pt(bone, (t0 + t1) / 2, (n0 + n1) * 0.5 * narrow);
      d.pt(bone, t1, n1 * narrow);
      pen.stroke(group, 0, ramp, 1);
    };
    line(0.88, 0.125, 0.5, 0.13);
    line(0.9, 0.035, 0.5, 0.04);
    line(0.89, -0.09, 0.5, -0.07);
  }
  if (d.lod >= 2) {
    // The palm's shadow, the lit back of the hand, knuckles.
    polyB(d, bone, [0.1, 0.05 * narrow, 0.46, 0.06 * narrow, 0.46, 0.2 * narrow, 0.1, 0.2 * narrow]);
    pen.shade(group, -1);
    polyB(d, bone, [0.08, -0.14 * narrow, 0.42, -0.14 * narrow, 0.42, 0.0, 0.08, 0.0]);
    pen.shade(group, 1);
    pen.begin();
    d.pt(bone, 0.5, 0.15 * narrow);
    d.pt(bone, 0.56, 0.02 * narrow);
    d.pt(bone, 0.5, -0.12 * narrow);
    pen.stroke(group, -2);
  }
}

/** An oval in screen head units: a sleeve seen end on. */
function oval(d: Draw, x: number, y: number, rx: number, ry: number) {
  const pen = d.pen;
  pen.begin();
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    pen.add(d.sx(x + Math.cos(t) * rx), d.sy(y + Math.sin(t) * ry));
  }
}

/**
 * An arm thrust at the viewer (front view) or away (back view): the sleeve as two overlapping
 * ovals growing toward the viewer, a stump if it is severed, and the hand drawn last, big, the
 * fingers spread: the largest shape on the figure.
 */
function reachArm(d: Draw, side: number, shirt: number, skin: number, level: number, handTbl: readonly Pt[], hgroupNear: number, foreRamp = shirt) {
  const pen = d.pen;
  const sk = d.sk;
  const sh = side === 0 ? J.shL : J.shR;
  const wr = side === 0 ? J.wrL : J.wrR;
  const g = side === 0 ? G.armFar : G.armNear;
  const gs = side === 0 ? G.sleeveF : G.sleeveN;
  const x0 = sk.sx[sh];
  const y0 = sk.sy[sh];
  const wx = sk.sx[wr];
  const wy = sk.sy[wr];
  const t = d.reach[side];
  const form = (cx: number, cy: number, rx: number, ry: number, group: number) => {
    if (d.lod < 1) return;
    oval(d, cx + 0.14 * rx, cy - 0.4 * ry, rx * 0.74, ry * 0.42);
    pen.shade(group, -1);
    oval(d, cx - 0.3 * rx, cy + 0.4 * ry, rx * 0.34, ry * 0.3);
    pen.shade(group, 1);
    oval(d, cx + 0.42 * rx, cy - 0.66 * ry, rx * 0.34, ry * 0.2);
    pen.shade(group, -2);
  };
  const ux = x0 + (wx - x0) * 0.32;
  const uy = y0 + (wy - y0) * 0.32;
  oval(d, ux, uy, 0.42, 0.36);
  pen.fill(shirt, 3, PARTL, g, -2);
  form(ux, uy, 0.42, 0.36, g);
  if (level === 2) {
    oval(d, ux, uy - 0.06, 0.16, 0.13);
    pen.fill(R.blood, 2, PARTL, g, 0);
    return;
  }
  if (level === 0) {
    const fx = x0 + (wx - x0) * 0.64;
    const fy = y0 + (wy - y0) * 0.64;
    const rx = 0.3 + t * 0.03;
    const ry = 0.29 + t * 0.03;
    oval(d, fx, fy, rx, ry);
    pen.fill(foreRamp, 3, PARTL, gs, -2);
    form(fx, fy, rx, ry, gs);
    const hg = hgroupNear;
    const hb = side === 0 ? B.haL : B.haR;
    // At a distance a grabbing hand is one solid mitt, a dozen texels across, cutting into the
    // silhouette: fingers are not there to see, the shape coming at you is.
    const lead = (side === 0) === (d.key.leadL === true);
    if (d.S < 13.5) hand(d, HAND_MITT, hb, skin, hg, (lead ? 5.2 : 4.2) / d.S / 0.17);
    else hand(d, handTbl, hb, skin, hg, lead ? 1.3 : 1);
    if (d.lod >= 2 && handTbl === HAND_SPLAY) {
      // Into the cupped palm: the dark of it, the heel of the hand lit, a crook in every finger.
      polyB(d, hb, [0.1, -0.2, 0.36, -0.3, 0.52, -0.16, 0.52, 0.1, 0.34, 0.2, 0.14, 0.16]);
      pen.shade(hg, 0, skin, 2);
      polyB(d, hb, [0.2, -0.13, 0.34, -0.17, 0.44, -0.05, 0.38, 0.06, 0.24, 0.07]);
      pen.shade(hg, 0, skin, 1);
      polyB(d, hb, [0.04, -0.1, 0.12, -0.12, 0.16, 0.08, 0.08, 0.1]);
      pen.shade(hg, 1);
      for (const [a, n] of [[0.8, -0.34], [0.88, -0.12], [0.9, 0.02], [0.82, 0.2], [0.42, 0.5]] as const) {
        polyB(d, hb, [a, n - 0.06, a + 0.1, n + 0.05, a - 0.04, n + 0.08, a - 0.1, n - 0.04]);
        pen.shade(hg, 1);
      }
      for (const [a, n] of [[1.04, -0.23], [1.15, 0.01], [1.02, 0.25]] as const) {
        polyB(d, hb, [a, n - 0.05, a + 0.08, n, a, n + 0.05]);
        pen.shade(hg, 0, skin, 1);
      }
    }
  } else {
    const fx = x0 + (wx - x0) * 0.6;
    const fy = y0 + (wy - y0) * 0.6;
    oval(d, fx, fy, 0.17, 0.15);
    pen.fill(R.blood, 2, PARTL, gs, 0);
    oval(d, fx, fy, 0.08, 0.07);
    pen.shade(gs, 0, R.bone, 3);
  }
}

/** The hand a figure shows at this size and in this pose. */
function handFor(d: Draw, open: readonly Pt[]): readonly Pt[] {
  if (d.key.fists) return HAND_FIST;
  return d.S >= 16 ? open : HAND_MITT;
}

// ─── The worker ────────────────────────────────────────────────────────────

/** The hi-vis vest: a shape over the shirt, chest tapering to the waist, a short flare, a torn hem. */
function hiVisVest(d: Draw, view: ViewId) {
  const pen = d.pen;
  pen.begin();
  if (view === 0) {
    d.pt(B.chest, 0.42, 0.17, true);
    d.pt(B.chest, 0.33, 0.46);
    d.pt(B.chest, 0.04, 0.5);
    d.pt(B.chest, -0.28, 0.54);
    d.pt(B.waist, 0.0, 0.52);
    d.pt(B.pelvis, 0.3, 0.53);
    d.pt(B.pelvis, 0.12, 0.54, true);
    d.pt(B.pelvis, 0.05, 0.46, true);
    d.pt(B.pelvis, 0.12, 0.34, true);
    d.pt(B.pelvis, 0.03, 0.2, true);
    d.pt(B.pelvis, 0.1, 0.03, true);
    d.pt(B.pelvis, 0.02, -0.12, true);
    d.pt(B.pelvis, 0.11, -0.28, true);
    d.pt(B.pelvis, 0.04, -0.4, true);
    d.pt(B.pelvis, 0.12, -0.54, true);
    d.pt(B.pelvis, 0.3, -0.53);
    d.pt(B.waist, 0.0, -0.52);
    d.pt(B.chest, -0.28, -0.54);
    d.pt(B.chest, 0.04, -0.5);
    d.pt(B.chest, 0.33, -0.46);
    d.pt(B.chest, 0.42, -0.17, true);
    d.pt(B.chest, -0.02, 0.0, true);
  } else if (view === 4) {
    // From behind: a closed back panel.
    d.pt(B.chest, 0.42, 0.17, true);
    d.pt(B.chest, 0.36, 0.46);
    d.pt(B.chest, 0.06, 0.5);
    d.pt(B.chest, -0.28, 0.54);
    d.pt(B.waist, 0.0, 0.5);
    d.pt(B.pelvis, 0.3, 0.52);
    d.pt(B.pelvis, 0.1, 0.53, true);
    d.pt(B.pelvis, 0.04, 0.32, true);
    d.pt(B.pelvis, 0.12, 0.1, true);
    d.pt(B.pelvis, 0.03, -0.14, true);
    d.pt(B.pelvis, 0.1, -0.34, true);
    d.pt(B.pelvis, 0.1, -0.53, true);
    d.pt(B.pelvis, 0.3, -0.52);
    d.pt(B.waist, 0.0, -0.5);
    d.pt(B.chest, -0.28, -0.54);
    d.pt(B.chest, 0.06, -0.5);
    d.pt(B.chest, 0.36, -0.46);
    d.pt(B.chest, 0.42, -0.17, true);
    d.pt(B.chest, 0.3, 0.0);
  } else if (view === 2) {
    d.pt(B.chest, 0.42, 0.25, true);
    d.pt(B.chest, 0.2, 0.42);
    d.pt(B.chest, -0.3, 0.4);
    d.pt(B.waist, 0.0, 0.3);
    d.pt(B.pelvis, 0.28, 0.34);
    d.pt(B.pelvis, 0.1, 0.38, true);
    d.pt(B.pelvis, 0.03, 0.14, true);
    d.pt(B.pelvis, 0.1, -0.1, true);
    d.pt(B.pelvis, 0.04, -0.3, true);
    d.pt(B.pelvis, 0.12, -0.46, true);
    d.pt(B.pelvis, 0.3, -0.42);
    d.pt(B.waist, 0.0, -0.32);
    d.pt(B.chest, -0.3, -0.46);
    d.pt(B.chest, 0.18, -0.48);
    d.pt(B.chest, 0.42, -0.32, true);
  } else {
    d.pt(B.chest, 0.42, 0.22, true);
    d.pt(B.chest, 0.32, 0.48);
    d.pt(B.chest, -0.3, 0.48);
    d.pt(B.waist, 0.0, 0.4);
    d.pt(B.pelvis, 0.28, 0.43);
    d.pt(B.pelvis, 0.1, 0.46, true);
    d.pt(B.pelvis, 0.03, 0.2, true);
    d.pt(B.pelvis, 0.11, -0.08, true);
    d.pt(B.pelvis, 0.03, -0.34, true);
    d.pt(B.pelvis, 0.12, -0.54, true);
    d.pt(B.pelvis, 0.3, -0.5);
    d.pt(B.waist, 0.0, -0.48);
    d.pt(B.chest, -0.3, -0.54);
    d.pt(B.chest, 0.3, -0.54);
    d.pt(B.chest, 0.42, -0.14, true);
    if (view === 1) d.pt(B.chest, 0.1, 0.14, true);
  }
  pen.fill(R.hivis, 3, PARTT, G.vest, -2);
  // Reflective bands round the body; they sag with the cloth and take its shadow below.
  const band2 = (b: number, a0: number, a1: number) => {
    if (d.lod === 0) {
      if (d.S < 6.4) return;
      strokeB(d, b, G.vest, 0, [(a0 + a1) / 2, -0.95, (a0 + a1) / 2, 0.95], R.reflect, 4);
      return;
    }
    pen.begin();
    d.pt(b, a0, -1.0, true);
    d.pt(b, a0 - 0.05, -0.3);
    d.pt(b, a0 - 0.06, 0.3);
    d.pt(b, a0, 1.0, true);
    d.pt(b, a1, 1.0, true);
    d.pt(b, a1 - 0.06, 0.3);
    d.pt(b, a1 - 0.05, -0.3);
    d.pt(b, a1, -1.0, true);
    pen.shade(G.vest, 0, R.reflect, 4);
  };
  band2(B.chest, -0.27, -0.4);
  band2(B.pelvis, 0.28, 0.15);
  if (d.lod >= 1 && (view === 4 || view === 3)) {
    // Vertical straps on the back.
    polyB(d, B.chest, [0.5, 0.26, 0.5, 0.42, -0.5, 0.42, -0.5, 0.26], true);
    pen.shade(G.vest, 0, R.reflect, 3);
    polyB(d, B.chest, [0.5, -0.26, 0.5, -0.42, -0.5, -0.42, -0.5, -0.26], true);
    pen.shade(G.vest, 0, R.reflect, 3);
  }
  const q = view === 0 || view === 4 ? 1 : view === 2 ? 0.7 : 0.88;
  // The flanks turn away: a darker tone down each side from under the arm, wider on the far side.
  const flank = (s: number, inner: number) => {
    pen.begin();
    d.pt(B.chest, 0.12, s * inner * 1.2 * q);
    d.pt(B.chest, -0.3, s * inner * q);
    d.pt(B.waist, 0.0, s * inner * 0.72 * q);
    d.pt(B.pelvis, 0.3, s * inner * 0.86 * q);
    d.pt(B.pelvis, 0.0, s * inner * 1.0 * q);
    d.pt(B.pelvis, 0.0, s * 1.0, true);
    d.pt(B.chest, 0.12, s * 1.0, true);
    pen.shade(G.vest, -1);
  };
  flank(1, 0.24);
  flank(-1, 0.36);
  if (d.lod >= 1) {
    // Core at the far turn; the ribcage plane in the light, a bright bit on top of it.
    pen.begin();
    d.pt(B.chest, 0.08, 0.5 * q);
    d.pt(B.chest, -0.3, 0.44 * q);
    d.pt(B.waist, -0.0, 0.3 * q);
    d.pt(B.waist, -0.0, 0.42 * q);
    d.pt(B.chest, -0.3, 0.58 * q);
    d.pt(B.chest, 0.08, 0.62 * q);
    pen.shade(G.vest, -2);
    pen.begin();
    d.pt(B.chest, 0.32, -0.28 * q);
    d.pt(B.chest, 0.14, -0.46 * q);
    d.pt(B.chest, -0.22, -0.44 * q);
    d.pt(B.chest, -0.26, -0.2 * q);
    d.pt(B.chest, 0.0, -0.06 * q);
    d.pt(B.chest, 0.24, -0.1 * q);
    pen.shade(G.vest, 1);
    pen.begin();
    d.pt(B.chest, 0.28, -0.3 * q);
    d.pt(B.chest, 0.1, -0.4 * q);
    d.pt(B.chest, 0.0, -0.28 * q);
    d.pt(B.chest, 0.14, -0.18 * q);
    pen.shade(G.vest, 2);
    pen.begin();
    d.pt(B.waist, 0.3, -0.3 * q);
    d.pt(B.waist, 0.0, -0.3 * q);
    d.pt(B.pelvis, 0.3, -0.34 * q);
    d.pt(B.pelvis, 0.22, -0.12 * q);
    d.pt(B.waist, 0.1, -0.12 * q);
    pen.shade(G.vest, 1);
    if (d.lod >= 2) {
      // Two long folds of hanging cloth.
      foldShape(d, B.waist, G.vest, 0.42, 0.12 * q, -0.32, 0.22 * q, 0.11);
      foldShape(d, B.waist, G.vest, 0.34, -0.18 * q, -0.3, -0.1 * q, 0.1);
    }
    if (view === 0 || view === 1) {
      // The zip down the front, a pocket.
      const zn = view === 0 ? 0 : 0.14;
      strokeB(d, B.chest, G.vest, -2, [0.42, zn, -0.52, zn]);
      strokeB(d, B.waist, G.vest, -2, [0.45, zn, -0.28, zn]);
      strokeB(d, B.pelvis, G.vest, -2, [0.46, zn, 0.08, zn]);
      if (d.lod >= 2) {
        const pn = view === 0 ? 0.26 : 0.34;
        strokeB(d, B.chest, G.vest, -1, [0.0, pn - 0.14, 0.0, pn + 0.14, -0.18, pn + 0.14, -0.18, pn - 0.14, 0.0, pn - 0.14]);
      }
    }
  }
  if (d.lod >= 2 && view === 0) {
    // A dark bite in the side, with a run of blood down the vest.
    pen.begin();
    d.pt(B.waist, 0.2, 0.3);
    d.pt(B.waist, 0.34, 0.2);
    d.pt(B.waist, 0.18, 0.1);
    d.pt(B.waist, 0.02, 0.18);
    pen.shade(G.vest, 0, R.blood, 1);
    pen.begin();
    d.pt(B.waist, 0.1, 0.2);
    d.pt(B.pelvis, 0.46, 0.2);
    d.pt(B.pelvis, 0.3, 0.16);
    d.pt(B.waist, 0.06, 0.12);
    pen.shade(G.vest, 0, R.blood, 2);
  }
}

/** A shirt collar seen from behind: it stands up against the nape and shortens the bare neck. */
function backCollar(d: Draw, view: ViewId, ramp: number) {
  if (view !== 3 && view !== 4) return;
  const pen = d.pen;
  pen.begin();
  d.pt(B.chest, 0.62, 0.24, true);
  d.pt(B.chest, 0.62, -0.24, true);
  d.pt(B.chest, 0.42, -0.34, true);
  d.pt(B.chest, 0.42, 0.34, true);
  pen.fill(ramp, 3, PARTT, G.collar, -2);
  if (d.lod >= 2) {
    polyB(d, B.chest, [0.5, 0.36, 0.5, -0.36, 0.46, -0.36, 0.46, 0.36], true);
    pen.shade(G.collar, -1);
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

/** A neck stump for a headless figure: a short ragged column of skin above the collar, the wet end of it, a knob of bone. */
function neckStump(d: Draw, skin: number) {
  const pen = d.pen;
  polyB(d, B.neck, [-0.05, 0.25, 0.1, 0.23, 0.17, 0.14, 0.15, 0.02, 0.2, -0.1, 0.12, -0.22, -0.05, -0.25]);
  pen.fill(skin, 2, PARTT, G.neck, 0);
  polyB(d, B.neck, [0.09, 0.2, 0.2, 0.15, 0.18, 0.0, 0.23, -0.14, 0.09, -0.2]);
  pen.fill(R.blood, 2, PARTT, G.neck, 0);
  polyB(d, B.neck, [0.13, 0.06, 0.19, 0.03, 0.18, -0.05, 0.13, -0.05]);
  pen.shade(G.neck, 0, R.bone, 3);
}

// ─── A body on the street, seen from its feet ──────────────────────────────

/** An arm for the lying body: a rounder shoulder, since the foreshortened trunk does not cover it. */
const ARM_LYING: readonly Pt[] = [
  [0, 0.02, 0.06],
  [0, 0.14, 0.17],
  [0, 0.34, 0.24],
  [0, 0.62, 0.2],
  [0, 0.92, 0.173],
  [1, 0.06, 0.192],
  [1, 0.3, 0.230],
  [1, 0.62, 0.179],
  [1, 0.9, 0.160],
  [1, 1.0, 0.186, 1],
  [1, 1.0, -0.186, 1],
  [1, 0.9, -0.154],
  [1, 0.55, -0.198],
  [1, 0.22, -0.224],
  [1, 0.02, -0.179],
  [0, 0.88, -0.160],
  [0, 0.55, -0.205],
  [0, 0.26, -0.192],
  [0, 0.1, -0.14],
];

interface CorpseStyle {
  skin: number;
  jeans: number;
  foot: FootStyle;
  head: HeadSpec;
  /** Hard hat ramp, knocked off and lying by the head; −1 none. */
  hat: number;
  trunk(d: Draw): void;
  arm(d: Draw, map: readonly number[], g: number, level: number, hb: number, hg: number): void;
}

/** A boot lying on its back, sole toward the viewer, toe up and fallen outward: the nearest thing on the sprite. */
function soleBoot(d: Draw, side: number, st: FootStyle) {
  const shin = side === 0 ? B.shL : B.shR;
  const ax = d.ox[shin] + d.ax[shin] * d.A[shin];
  const ay = d.oy[shin] + d.ay[shin] * d.A[shin];
  const out = side === 0 ? 1 : -1;
  const rot = out * 0.42;
  const ux = Math.sin(rot);
  const uy = Math.cos(rot);
  const fx = (a: number, n: number) => d.cx + (ax + ux * a + uy * n) * d.S;
  const fy = (a: number, n: number) => d.cy - (ay + uy * a - ux * n) * d.S;
  const pen = d.pen;
  const group = side === 0 ? G.bootL : G.bootR;
  // The upper shows round the sole, longest at the toe.
  const upper = [-0.4, 0.26, -0.26, 0.36, 0.1, 0.39, 0.46, 0.34, 0.62, 0.14, 0.62, -0.14, 0.46, -0.34, 0.1, -0.39, -0.26, -0.36, -0.4, -0.26];
  pen.begin();
  for (let i = 0; i < upper.length; i += 2) pen.add(fx(upper[i], upper[i + 1]), fy(upper[i], upper[i + 1]));
  pen.fill(st.ramp, 3, PARTL, group, -1);
  if (d.lod >= 1) {
    pen.begin();
    pen.add(fx(0.62, -0.28), fy(0.62, -0.28));
    pen.add(fx(0.62, 0.28), fy(0.62, 0.28));
    pen.add(fx(0.42, 0.28), fy(0.42, 0.28));
    pen.add(fx(0.42, -0.28), fy(0.42, -0.28));
    pen.shade(group, 1);
  }
  // The sole: rubber, a heel block and the ball of the foot with a waist between them, a couple of lugs.
  const soleRamp = st.sole >= 0 ? st.sole : R.boot;
  const soleTone = st.sole >= 0 ? 3 : 1;
  const ball = [-0.06, 0.26, 0.1, 0.31, 0.38, 0.29, 0.52, 0.12, 0.52, -0.12, 0.38, -0.29, 0.1, -0.31, -0.06, -0.26];
  pen.begin();
  for (let i = 0; i < ball.length; i += 2) pen.add(fx(ball[i], ball[i + 1]), fy(ball[i], ball[i + 1]));
  pen.shade(group, 0, soleRamp, soleTone);
  const heel = [-0.34, 0.2, -0.22, 0.27, -0.12, 0.24, -0.12, -0.24, -0.22, -0.27, -0.34, -0.2];
  pen.begin();
  for (let i = 0; i < heel.length; i += 2) pen.add(fx(heel[i], heel[i + 1]), fy(heel[i], heel[i + 1]));
  pen.shade(group, 0, soleRamp, soleTone);
  if (d.lod >= 2) {
    // Lugs: darker grooves across the ball of the foot.
    const lug = (a: number) => {
      pen.begin();
      pen.add(fx(a, -0.22), fy(a, -0.22));
      pen.add(fx(a + 0.07, 0.0), fy(a + 0.07, 0.0));
      pen.add(fx(a, 0.22), fy(a, 0.22));
      pen.stroke(group, 0, soleRamp, soleTone + (st.sole >= 0 ? -1 : 1));
    };
    lug(0.12);
    lug(0.3);
  }
}

function corpseFront(d: Draw, st: CorpseStyle) {
  const pen = d.pen;
  const lvlL = d.flags & 3;
  const lvlR = (d.flags >> 2) & 3;
  const headless = (d.flags & 16) !== 0;
  // The arm out on the ground, under everything else.
  st.arm(d, ARM_R, G.armFar, lvlR, B.haR, G.handF);
  if (st.hat >= 0 && !headless) fallenHat(d, HG, st.hat, 0.84, 2.0, 0.28, 0.96);
  shape(d, NECK_F, B.neck, st.skin, PARTH, G.neck, 2, 0);
  if (headless) neckStump(d, st.skin);
  else paintHead(d, st.head, HG, 0);
  st.trunk(d);
  seat(d, st.jeans, 0);
  belt(d, R.belt, 0, st.hat >= 0);
  // Across the belly, over the belt.
  st.arm(d, ARM_L, G.armNear, lvlL, B.haL, G.handN);
  const breakT = st.foot.shaft ? 0.44 : 0.82;
  for (let side = 1; side >= 0; side--) {
    const map = side === 0 ? LEG_L : LEG_R;
    const g = side === 0 ? G.legNear : G.legFar;
    pen.begin();
    d.pts(LEG_F, map, 1.06);
    pen.fill(st.jeans, 3, PARTL, g, -1);
    legForm(d, map, g, breakT, 0);
  }
  soleBoot(d, 1, st.foot);
  soleBoot(d, 0, st.foot);
}

function workerTrunk(d: Draw, view: ViewId, tbl: readonly Pt[], shirt: number) {
  trunkFill(d, tbl, shirt, G.trunk);
  trunkForm(d, G.trunk, view, false);
  trunkFolds(d, G.trunk, view, false);
}

const WORK_HEAD_FALLEN: HeadSpec = { ...WORK_HEAD, hat: -1 };

export const WORKER: FigureDef = {
  id: 0,
  rest: ZIDLE[0],
  name: 'worker',
  neck: 0.07,
  paint(d, view) {
    const shirt = R.shirtGrey;
    const armTbl = view === 2 ? ARM_S : view === 1 || view === 3 ? ARM_Q : ARM_F;
    const trunkTbl = view === 2 ? TRUNK_S : view === 1 || view === 3 ? TRUNK_Q : TRUNK_F;
    const lvlL = d.flags & 3;
    const lvlR = (d.flags >> 2) & 3;
    const headless = (d.flags & 16) !== 0;
    const claw = d.lod >= 2 ? HAND_CLAW : HAND_MITT;
    const splay = HAND_SPLAY;
    if (d.corpse) {
      corpseFront(d, {
        skin: R.skinDead,
        jeans: R.denim,
        foot: WORK_BOOT,
        head: WORK_HEAD_FALLEN,
        hat: R.hat,
        trunk: (dd) => {
          workerTrunk(dd, 0, TRUNK_F, shirt);
          hiVisVest(dd, 0);
          collar(dd, 0, shirt);
        },
        arm: (dd, map, g, level, hb, hg) => workerArm(dd, ARM_LYING, map, g, level, claw, hb, hg, 1),
      });
      return;
    }
    if (view === 4) {
      if (d.reach[0] > 0) reachArm(d, 0, shirt, R.skinDead, lvlL, splay, G.handF);
      if (d.reach[1] > 0) reachArm(d, 1, shirt, R.skinDead, lvlR, splay, G.handN);
    }
    if (isSideish(view)) workerArm(d, armTbl, ARM_L, G.armFar, lvlL, claw, B.haL, G.handF, view === 2 ? 0.7 : 0.85);
    legs(d, R.denim, view, WORK_BOOT);
    seat(d, R.denim, view);
    belt(d, R.belt, view, true);
    workerTrunk(d, view, trunkTbl, shirt);
    shape(d, NECK_F, B.neck, R.skinDead, PARTH, G.neck, 2, 0);
    hiVisVest(d, view);
    if (!isBack(view)) collar(d, view, shirt);
    else backCollar(d, view, shirt);
    if (headless) neckStump(d, R.skinDead);
    else paintHead(d, WORK_HEAD, HG, view);
    if (isSideish(view)) {
      workerArm(d, armTbl, ARM_R, G.armNear, lvlR, claw, B.haR, G.handN, view === 2 ? 0.7 : 0.85);
    } else {
      if (d.reach[0] > 0 && view === 0) reachArm(d, 0, shirt, R.skinDead, lvlL, splay, G.handF);
      else if (d.reach[0] === 0) workerArm(d, armTbl, ARM_L, G.armFar, lvlL, claw, B.haL, G.handF, 1);
      if (d.reach[1] > 0 && view === 0) reachArm(d, 1, shirt, R.skinDead, lvlR, splay, G.handN);
      else if (d.reach[1] === 0) workerArm(d, armTbl, ARM_R, G.armNear, lvlR, claw, B.haR, G.handN, 1);
    }
  },
};

// ─── The flannel shirt ─────────────────────────────────────────────────────

/** Where cloth pulls: the plaid steps sideways across each fold line instead of being printed flat. */
function kink(a: number, b: number, i: number) {
  return a + (b - a) * [0.28, 0.58, 0.86][i];
}

/**
 * Buffalo plaid over a garment, glued to its bone: dark bands one way, dark bands the other, darkest
 * where they cross, and every line offset a texel or two at three fold lines per panel.
 */
function check(d: Draw, group: number, bone: number, a0: number, a1: number, n0: number, n1: number, cell: number, mode: number) {
  const pen = d.pen;
  const A = d.A[bone];
  const cellA = cell / Math.max(0.2, mode === 0 ? 1 : A);
  const px = 1.4 / d.S;
  const fold = d.lod >= 2 ? 1 : 0;
  // Vertical bands (along the bone).
  let i = 0;
  for (let n = n0; n < n1; n += cell, i++) {
    if (i % 2 !== 0) continue;
    const off = [0, px * ((i % 3) - 1), px * (((i + 1) % 3) - 1), px * (((i + 2) % 3) - 1)];
    pen.begin();
    d.pt(bone, a0, n, true);
    for (let f = 0; f < 3; f++) d.pt(bone, kink(a0, a1, f), n + off[f] * fold, true);
    d.pt(bone, a1, n + off[3] * fold, true);
    d.pt(bone, a1, n + cell + off[3] * fold, true);
    for (let f = 2; f >= 0; f--) d.pt(bone, kink(a0, a1, f), n + cell + off[f] * fold, true);
    d.pt(bone, a0, n + cell, true);
    pen.shade(group, -1);
  }
  // Across: a band, in black where it crosses a vertical band, in the darker red elsewhere.
  let j = 0;
  for (let a = a0; a < a1; a += cellA, j++) {
    if (j % 2 !== 0) continue;
    let q = 0;
    const dip = px * ((j % 3) - 1) * fold;
    for (let n = n0; n < n1; n += cell, q++) {
      const lean = (n - n0) / (n1 - n0) < 0.5 ? dip : -dip;
      polyB(d, bone, [a + lean, n, a + lean, n + cell, a + cellA + lean, n + cell, a + cellA + lean, n], true);
      if (q % 2 === 0) pen.shade(group, 0, R.flannelDark, 2);
      else pen.shade(group, -1);
    }
  }
}

/** A shirt worn loose: tucked in at the waist, bloused over the belt, the hem curving up at the sides. */
const SHIRT_F: readonly Pt[] = [
  [2, 0.44, 0.18],
  [2, 0.38, 0.36],
  [2, 0.26, 0.63],
  [2, 0.02, 0.7],
  [2, -0.28, 0.66],
  [2, -0.54, 0.57],
  [1, -0.02, 0.52],
  [0, 0.36, 0.55],
  [0, 0.16, 0.58],
  [0, 0.08, 0.5],
  [0, 0.02, 0.28],
  [0, -0.02, 0.0],
  [0, 0.02, -0.28],
  [0, 0.08, -0.5],
  [0, 0.16, -0.58],
  [0, 0.36, -0.55],
  [1, -0.02, -0.52],
  [2, -0.54, -0.57],
  [2, -0.28, -0.66],
  [2, 0.02, -0.7],
  [2, 0.26, -0.63],
  [2, 0.38, -0.36],
  [2, 0.44, -0.18],
];

const SHIRT_Q: readonly Pt[] = [
  [2, 0.5, 0.18],
  [2, 0.4, 0.4],
  [2, 0.22, 0.6],
  [2, -0.04, 0.62],
  [2, -0.32, 0.55],
  [2, -0.55, 0.45],
  [1, -0.02, 0.4],
  [0, 0.34, 0.44],
  [0, 0.16, 0.48],
  [0, 0.06, 0.34],
  [0, -0.02, 0.0],
  [0, 0.04, -0.3],
  [0, 0.1, -0.5],
  [0, 0.18, -0.54],
  [0, 0.34, -0.5],
  [1, -0.02, -0.47],
  [2, -0.55, -0.54],
  [2, -0.28, -0.65],
  [2, 0.04, -0.69],
  [2, 0.26, -0.62],
  [2, 0.4, -0.36],
  [2, 0.5, -0.12],
];

const SHIRT_S: readonly Pt[] = [
  [2, 0.5, 0.08],
  [2, 0.46, 0.26],
  [2, 0.2, 0.42],
  [2, -0.16, 0.44],
  [2, -0.46, 0.36],
  [1, 0.0, 0.26],
  [0, 0.34, 0.32],
  [0, 0.16, 0.38],
  [0, 0.06, 0.26],
  [0, 0.0, 0.0],
  [0, 0.04, -0.26],
  [0, 0.14, -0.44],
  [0, 0.3, -0.42],
  [1, 0.0, -0.3],
  [2, -0.46, -0.38],
  [2, -0.14, -0.46],
  [2, 0.2, -0.46],
  [2, 0.44, -0.28],
  [2, 0.52, -0.1],
];

const FLANNEL_HEAD: HeadSpec = { skin: R.skinLive, dead: false, hair: R.hairDark, hat: -1, jaw: 0.5 };

/** The flannel over the trunk: the base is the plaid's open square (the cloth's lit red), the check runs over it, then the form. */
function flannelTrunk(d: Draw, view: ViewId, tbl: readonly Pt[], shirt: number, cell: number) {
  d.pen.begin();
  d.pts(tbl, TRUNK_MAP);
  d.pen.fill(shirt, 4, PARTT, G.trunk, -1);
  check(d, G.trunk, B.chest, -1.1, 0.55, -0.9, 0.9, cell, 0);
  check(d, G.trunk, B.pelvis, -0.16, 0.5, -0.9, 0.9, cell, 0);
  trunkForm(d, G.trunk, view, true);
  trunkFolds(d, G.trunk, view, true);
  if (d.lod >= 1 && view === 0) {
    // The button placket.
    strokeB(d, B.chest, G.trunk, 0, [0.42, 0.02, -0.5, 0.02], R.flannelDark, 2);
    strokeB(d, B.waist, G.trunk, 0, [0.5, 0.02, -0.25, 0.02], R.flannelDark, 2);
    strokeB(d, B.pelvis, G.trunk, 0, [0.45, 0.02, 0.0, 0.02], R.flannelDark, 2);
    for (const a of [0.34, 0.02, -0.3]) dotB(d, B.chest, G.trunk, a, 0.02, R.white, 4);
    dotB(d, B.waist, G.trunk, 0.22, 0.02, R.white, 4);
  }
}

export const FLANNEL: FigureDef = {
  id: 1,
  rest: CIVSTAND[0],
  name: 'flannel',
  paint(d, view) {
    const shirt = R.flannel;
    const armTbl = view === 2 ? ARM_S : view === 1 || view === 3 ? ARM_Q : ARM_F;
    const trunkTbl = view === 2 ? SHIRT_S : view === 1 || view === 3 ? SHIRT_Q : SHIRT_F;
    const cell = d.lod <= 0 ? 0.3 : 0.19;
    const open = handFor(d, HAND_OPEN);
    const armCheck = (map: readonly number[], g: number) => {
      if (d.lod < 1) return;
      check(d, g, map[0], 0.0, 1.0, -0.42, 0.42, cell * 0.8, 1);
      check(d, g, map[1], -0.05, 0.3, -0.42, 0.42, cell * 0.8, 1);
    };
    const arm = (map: readonly number[], g: number, hb: number, hg: number, narrow: number) => {
      sleeve(d, armTbl, map, shirt, g, R.skinLive, 0.32, 4, false);
      armCheck(map, g);
      d.wedge(ARM_SHADE_F, map, g, -1, true);
      band(d, ARM_CORE, map, g, -1, 1, true);
      if (d.lod >= 1) band(d, DELTOID_LIT, map, g, 1, -1, true);
      if (d.lod >= 1) rolledCuff(d, map, g, shirt, 0.32);
      hand(d, open, hb, R.skinLive, hg, narrow);
    };
    if (d.corpse) {
      corpseFront(d, {
        skin: R.skinLive,
        jeans: R.denimCiv,
        foot: SNEAKER,
        head: FLANNEL_HEAD,
        hat: -1,
        trunk: (dd) => {
          flannelTrunk(dd, 0, SHIRT_F, shirt, cell);
          collar(dd, 0, shirt);
        },
        arm: (dd, map, g, _level, hb, hg) => {
          sleeve(dd, ARM_LYING, map, shirt, g, R.skinLive, 0.32, 4, false);
          armCheck(map, g);
          hand(dd, open, hb, R.skinLive, hg, 1);
        },
      });
      return;
    }
    if (view === 4) {
      if (d.reach[0] > 0) reachArm(d, 0, shirt, R.skinLive, 0, open, G.handF, R.skinLive);
      if (d.reach[1] > 0) reachArm(d, 1, shirt, R.skinLive, 0, open, G.handN, R.skinLive);
    }
    if (isSideish(view)) arm(ARM_L, G.armFar, B.haL, G.handF, view === 2 ? 0.75 : 0.9);
    legs(d, R.denimCiv, view, SNEAKER);
    seat(d, R.denimCiv, view);
    flannelTrunk(d, view, trunkTbl, shirt, cell);
    shape(d, NECK_F, B.neck, R.skinLive, PARTH, G.neck, 2, 0);
    if (view <= 2) {
      // White tee in the open neck.
      polyB(d, B.chest, view === 1 ? [0.54, 0.0, 0.54, 0.24, 0.3, 0.16] : view === 2 ? [0.5, 0.2, 0.5, 0.36, 0.3, 0.3] : [0.54, -0.14, 0.54, 0.16, 0.32, 0.01], true);
      d.pen.fill(R.white, 3, PARTT, G.collar, -1);
    }
    if (!isBack(view)) collar(d, view, shirt);
    else backCollar(d, view, shirt);
    paintHead(d, FLANNEL_HEAD, HG, view);
    if (isSideish(view)) {
      arm(ARM_R, G.armNear, B.haR, G.handN, view === 2 ? 0.75 : 0.9);
    } else {
      if (d.reach[0] > 0 && view === 0) reachArm(d, 0, shirt, R.skinLive, 0, open, G.handF, R.skinLive);
      else if (d.reach[0] === 0) arm(ARM_L, G.armFar, B.haL, G.handF, 1);
      if (d.reach[1] > 0 && view === 0) reachArm(d, 1, shirt, R.skinLive, 0, open, G.handN, R.skinLive);
      else if (d.reach[1] === 0) arm(ARM_R, G.armNear, B.haR, G.handN, 1);
    }
  },
};
